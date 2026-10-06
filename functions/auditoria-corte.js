// (2026-10-06, a pedido de Fredy) Auditoría Corte vs Busint -- misma idea que
// "Auditoría Busint vs Nómina" de Zona Calor / Control de Calidad
// (correrAuditoriaBusintVsNomina en index.js) pero para el área CORTE:
// compara, lote por lote, lo que quedó REGISTRADO en ATLAS
// (pedidos_activos[].cortesRealizados) contra lo que Busint reporta como
// realmente cortado (cantCortada de ApiGen_PanelControlFlujoOperacional,
// mismo origen que ya usa la pestaña "Auditoría vs Busint" del módulo de
// Corte).
//
// Solo mira lo que va del MES EN CURSO (hora Bogotá): un lote entra a la
// revisión si ALGUNO de los dos lados lo ubica en este mes (fecha de corte en
// Busint o fecha de algún corte en ATLAS) -- pero cuando entra, los totales
// que se comparan son los del lote completo en los dos lados (si un lote se
// cortó en partes, una en septiembre y otra en octubre, no sale una
// diferencia falsa).
//
// Limitación conocida: Busint retira el lote de ese panel cuando ya se
// facturó/despachó. Un lote del mes que ya salió del panel aparece como
// "No aparece en Busint" aunque esté bien -- por eso la ventana es el mes
// en curso y no todo el histórico.
//
// El resultado se guarda en centro_costo_auditoria_corte/{YYYY-MM-DD}
// (colección propia, para no mezclar con centro_costo_auditoria_busint que
// tiene otro formato -- lote+proceso de Nómina) y se lee desde
// Áreas → Centro de Costo Cierre → CORTE. Si hay diferencias, se avisa por
// correo al usuario con areaNomina == "CORTE" (o, si no hay, a los admins),
// más los extras de config.notificacionesExtras.auditoriaCorteVsBusint.
const AREA_AUDITORIA_CORTE = "CORTE";

function crearAuditoriaCorte({ db, logger, fechaHoyBogota, obtenerLotesPlaneacionDesdeBusint, crearTransporte, mandarCorreo, agregarSeccionNotificacion }) {
  async function correrAuditoriaCorteVsBusint({ inmediato = false, sinNotificar = false } = {}) {
    const hoy = fechaHoyBogota();
    const mesActualISO = hoy.slice(0, 7);

    const [pedidosSnap, usersSnap, configSnap, busint] = await Promise.all([
      db.collection("pedidos_activos").get(),
      db.collection("users").get(),
      db.collection("config").doc("main").get(),
      obtenerLotesPlaneacionDesdeBusint(),
    ]);
    const pedidos = pedidosSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const usuarios = usersSnap.docs.map((d) => d.data());
    const extras = ((configSnap.data() || {}).notificacionesExtras?.auditoriaCorteVsBusint || []).map((e) => e.correo).filter(Boolean);
    const enMes = (fechaISO) => !!fechaISO && String(fechaISO).slice(0, 7) === mesActualISO;

    // Lado ATLAS: por número de lote (todos los cortes de ese lote, de
    // cualquier fecha). Los cortes sin lote se listan aparte (solo los del
    // mes) porque no hay con qué cruzarlos.
    const numerosPedidoAtlas = new Set(pedidos.map((p) => String(p.numero || "").trim()).filter(Boolean));
    const atlasPorLote = new Map();
    const sinLote = [];
    pedidos.forEach((p) => {
      (p.cortesRealizados || []).forEach((c) => {
        const lote = String(c.lote || "").trim();
        const refs = (c.refs || []).map((r) => r.ref).filter(Boolean);
        if (!lote) {
          if (enMes(c.fecha)) {
            sinLote.push({
              pedidoNumero: String(p.numero || ""),
              referencias: refs.join(" + ") || "—",
              cortador: c.cortador || "(Sin cortador)",
              fecha: c.fecha || "",
              unidades: Number(c.totalUnidades) || 0,
            });
          }
          return;
        }
        if (!atlasPorLote.has(lote)) {
          atlasPorLote.set(lote, { lote, pedidoNumero: String(p.numero || ""), unidades: 0, cortador: "", referencias: new Set(), fechas: new Set() });
        }
        const acc = atlasPorLote.get(lote);
        acc.unidades += Number(c.totalUnidades) || 0;
        refs.forEach((r) => acc.referencias.add(r));
        if (c.fecha) acc.fechas.add(c.fecha);
        if (!acc.cortador && c.cortador) acc.cortador = c.cortador;
      });
    });

    // Lado Busint: solo lotes de pedidos que SÍ existen en ATLAS (si no, no
    // hay con qué cruzar) y que ya tienen algo cortado.
    const busintPorLote = new Map();
    (busint.lotes || []).forEach((l) => {
      const lote = String(l.numLote || "").trim();
      if (!lote) return;
      if (!numerosPedidoAtlas.has(String(l.numPedido || "").trim())) return;
      if (!(Number(l.cantCortada) > 0)) return;
      busintPorLote.set(lote, l);
    });

    const discrepancias = [];
    let lotesRevisados = 0;
    const todos = new Set([...atlasPorLote.keys(), ...busintPorLote.keys()]);
    todos.forEach((lote) => {
      const a = atlasPorLote.get(lote) || null;
      const b = busintPorLote.get(lote) || null;
      const fechasAtlas = a ? [...a.fechas].sort() : [];
      const fechaBusint = b?.fechaCorteISO || null;
      // Entra a la revisión solo si alguno de los dos lados lo ubica en este mes.
      if (!(fechasAtlas.some(enMes) || enMes(fechaBusint))) return;
      lotesRevisados++;
      const unidadesAtlas = a?.unidades || 0;
      const unidadesBusint = b ? Number(b.cantCortada) || 0 : 0;
      const diferencia = Math.round((unidadesBusint - unidadesAtlas) * 100) / 100;
      const base = {
        numLote: lote,
        numPedido: a?.pedidoNumero || (b ? String(b.numPedido) : ""),
        referencia: a ? [...a.referencias].join(" + ") || b?.referencia || "—" : b?.referencia || "—",
        cortador: a?.cortador || "",
        unidadesBusint,
        unidadesAtlas,
        diferencia,
        fechaBusint,
        fechasAtlas,
      };
      let tipo = null;
      if (a && !b) tipo = unidadesAtlas > 0 ? "no_aparece_busint" : null;
      else if (!a && b) tipo = "falta_registrar_atlas";
      else if (diferencia > 0) tipo = "falta_registrar_atlas";
      else if (diferencia < 0) tipo = "atlas_de_mas";
      else if (fechaBusint && fechasAtlas.length && !fechasAtlas.includes(fechaBusint)) tipo = "fecha_no_coincide";
      if (tipo) discrepancias.push({ ...base, tipo });
    });
    discrepancias.sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia));

    await db.collection("centro_costo_auditoria_corte").doc(hoy).set({
      area: AREA_AUDITORIA_CORTE,
      fecha: hoy,
      periodo: mesActualISO,
      generadoEn: new Date().toISOString(),
      lotesRevisados,
      lotesCuadran: lotesRevisados - discrepancias.length,
      totalDiscrepancias: discrepancias.length,
      totalSinLote: sinLote.length,
      discrepancias,
      sinLote,
    });

    if (!sinNotificar && discrepancias.length > 0) {
      let destinatarios = usuarios.filter((u) => u.areaNomina === AREA_AUDITORIA_CORTE && u.email).map((u) => u.email);
      if (!destinatarios.length) destinatarios = usuarios.filter((u) => u.isAdmin && u.email).map((u) => u.email);
      destinatarios = [...new Set([...destinatarios, ...extras])];
      if (destinatarios.length) {
        const ETIQUETAS = {
          falta_registrar_atlas: { texto: "Falta registrar en ATLAS", color: "#b91c1c" },
          atlas_de_mas: { texto: "ATLAS tiene de más", color: "#b45309" },
          no_aparece_busint: { texto: "No aparece en Busint", color: "#7c3aed" },
          fecha_no_coincide: { texto: "Fecha no coincide", color: "#0f766e" },
        };
        const filasHtml = discrepancias
          .map((d) => {
            const et = ETIQUETAS[d.tipo] || { texto: d.tipo, color: "#334155" };
            const fechas = d.tipo === "fecha_no_coincide" ? `Busint: ${d.fechaBusint} · ATLAS: ${(d.fechasAtlas || []).join(", ")}` : "";
            return `<tr><td>${d.numLote}</td><td>${d.numPedido}</td><td>${d.referencia}</td><td style="color:${et.color}"><b>${et.texto}</b></td><td style="text-align:right">${d.unidadesBusint}</td><td style="text-align:right">${d.unidadesAtlas}</td><td style="text-align:right"><b style="color:${et.color}">${Math.abs(d.diferencia)}</b></td><td>${fechas}</td></tr>`;
          })
          .join("");
        const asunto = `ATLAS -- CORTE: ${discrepancias.length} diferencia(s) de Corte vs Busint`;
        const html = `<p>En <b>CORTE</b>, lo registrado en ATLAS y lo que Busint reporta como cortado no calzan (mes en curso) -- puede faltar registrar un corte, haber quedado registrado de más, o tener otra fecha. Revisa estos lotes:</p><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Lote</th><th>Pedido</th><th>Referencia</th><th>Tipo</th><th>Cant. Busint</th><th>Cant. ATLAS</th><th>Dif.</th><th>Fechas</th></tr>${filasHtml}</table>`;
        if (inmediato) {
          await mandarCorreo(crearTransporte(), destinatarios, asunto, html);
        } else {
          await agregarSeccionNotificacion({ correos: destinatarios, titulo: asunto, horaOrigen: "7:30 a.m. · Auditoría Corte vs. Busint", html });
        }
      } else {
        logger.warn(`Auditoria Corte vs Busint: ${discrepancias.length} diferencia(s) pero no se encontro a quien avisar.`);
      }
    }
    return { fecha: hoy, lotesRevisados, totalDiscrepancias: discrepancias.length, totalSinLote: sinLote.length };
  }
  return { correrAuditoriaCorteVsBusint };
}

module.exports = { crearAuditoriaCorte, AREA_AUDITORIA_CORTE };
