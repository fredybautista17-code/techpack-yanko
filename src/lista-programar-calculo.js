// "Mi lista por programar" (2026-10-26, a pedido de Fredy): lista de pendientes
// del líder de Zona calor / Control de calidad. Cálculo puro (sin Firebase ni
// React) para poder probarlo aparte.
//
// Reglas pedidas por Fredy:
//  1. Entran los lotes que están en el proceso del área (los mismos lotes
//     que ya ve el Programador de Procesos: carga activa de Busint, con
//     inventario > 0 en ese proceso).
//  2. Programa el LÍDER (fecha, hora, trabajador de su equipo, cantidad).
//  3. "Cumplido" sale SOLO de Busint (ENTRADA registrada en el proceso).
//     Nada se marca a mano ni se toma de Nómina.

export function normProceso(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

const ORDEN_PRIORIDAD = { Alta: 0, Media: 1, Normal: 2 };

// Prioridad y "por qué" iguales a las de Planta (modulo-planta.jsx → «En planta Yanko sin programar»):
//   Alta   = pedido vencido o que entrega en 7 días o menos, o pedido casi completo (3+ lotes, al menos uno ya salió a
//            Semiterminado/BPT y faltan 1 o 2).
//   Media  = pedido que entrega en 8 a 21 días, o avanzado (la mitad o más de sus lotes ya salió).
//   Normal = el resto.
// Fecha sugerida: Alta = hoy; el resto, 7 días antes de la entrega del pedido (nunca antes de hoy).
const NOMBRE_PRIORIDAD = { alta: "Alta", media: "Media", normal: "Normal" };

function diasEntreISO(fechaISO, hoyISO) {
  if (!fechaISO || !hoyISO) return null;
  const [y, m, d] = String(fechaISO).slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = String(hoyISO).slice(0, 10).split("-").map(Number);
  if (!y || !y2) return null;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

function sumarDiasISO(iso, n) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Por pedido: cuántos lotes tiene y cuántos ya salieron (BPT o Semiterminado) en la carga activa.
export function estadisticasPedidos(lotes) {
  const mapa = new Map();
  (lotes || []).forEach((l) => {
    if (l.numPedido === undefined || l.numPedido === null || l.numPedido === "") return;
    const k = String(l.numPedido);
    const e = mapa.get(k) || { total: 0, listos: 0 };
    e.total += 1;
    if (l.ubicacionActual === "BPT" || l.ubicacionActual === "Semiterminado") e.listos += 1;
    mapa.set(k, e);
  });
  return mapa;
}

// Misma regla de Planta (prioridadDeLote). Devuelve prioridad ("Alta"/"Media"/"Normal"), la razón en texto y la fecha sugerida.
export function prioridadPedido(lote, statsPedido, hoyISO) {
  const dias = diasEntreISO(lote?.fechaEntregaPedidoISO, hoyISO);
  const st = statsPedido?.get(String(lote?.numPedido));
  const razones = [];
  let nivel = "normal";
  if (dias !== null) {
    if (dias < 0) { razones.push(`Pedido vencido hace ${-dias} día${-dias === 1 ? "" : "s"}`); nivel = "alta"; }
    else if (dias === 0) { razones.push("El pedido entrega hoy"); nivel = "alta"; }
    else if (dias <= 7) { razones.push(`El pedido entrega en ${dias} día${dias === 1 ? "" : "s"}`); nivel = "alta"; }
    else if (dias <= 21) { razones.push(`El pedido entrega en ${dias} días`); nivel = "media"; }
  }
  if (st && st.total >= 3 && st.listos >= 1) {
    const faltan = st.total - st.listos;
    if (faltan <= 2) { razones.push(`Faltan ${faltan} de ${st.total} lotes del pedido`); nivel = "alta"; }
    else if (st.listos / st.total >= 0.5) { razones.push(`Pedido avanzado: ${st.listos} de ${st.total} lotes ya salieron`); if (nivel === "normal") nivel = "media"; }
  }
  if (!razones.length) razones.push(dias === null ? "Pedido sin fecha de entrega" : `El pedido entrega en ${dias} días`);
  let fechaSugerida = hoyISO;
  if (nivel !== "alta" && lote?.fechaEntregaPedidoISO) {
    const previa = sumarDiasISO(lote.fechaEntregaPedidoISO, -7);
    fechaSugerida = previa > hoyISO ? previa : hoyISO;
  }
  return { prioridad: NOMBRE_PRIORIDAD[nivel], razonesTxt: razones.join(" · "), diasEntrega: dias, fechaSugerida };
}

// Lotes de la carga activa que están en alguno de los procesos del área.
export function lotesEnProcesos(lotes, procesos, hoyISO) {
  const mios = new Set((procesos || []).map(normProceso));
  const statsPedido = estadisticasPedidos(lotes);
  const filas = [];
  (lotes || []).forEach((l) => {
    (l.procesos || []).forEach((p) => {
      if (!mios.has(normProceso(p.nombre))) return;
      const inv = Number(p.inventario) || 0;
      if (!(inv > 0)) return;
      const prio = prioridadPedido(l, statsPedido, hoyISO);
      filas.push({
        numLote: l.numLote,
        referencia: l.referencia,
        cliente: l.clienteAgrupado || l.nombreCliente || "",
        proceso: p.nombre,
        inventario: inv,
        planta: p.planta || "",
        fechaEntregaPedido: l.fechaEntregaPedidoISO || null,
        ...prio,
      });
    });
  });
  return filas;
}

function claveLP(numLote, proceso) {
  return `${numLote}||${normProceso(proceso)}`;
}

// Estado de CADA programación contra Busint (solo ENTRADAS).
// - Entrada = el proceso registró trabajo terminado del lote (la misma que
//   usa la Auditoría Busint vs Nómina).
// - Una entrada anterior al día en que se creó la programación es de una
//   pasada anterior y no cuenta.
// - Si el mismo lote+proceso está repartido entre varios trabajadores, Busint
//   no dice quién lo hizo: las unidades entradas se reparten en orden (fecha,
//   hora) hasta cubrir la cantidad de cada programación.
export function estadosProgramaciones(programaciones, entradas, hoyISO) {
  const entPorClave = new Map();
  (entradas || []).forEach((r) => entPorClave.set(claveLP(r.numLote, r.proceso), r));
  const grupos = new Map();
  (programaciones || []).forEach((p) => {
    const k = claveLP(p.numLote, p.proceso);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  const out = [];
  grupos.forEach((lista, k) => {
    const ent = entPorClave.get(k);
    const ordenadas = [...lista].sort(
      (a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "") || (a.horaInicio || "").localeCompare(b.horaInicio || "")
    );
    const desde = ordenadas.map((p) => String(p.creadoEn || "").slice(0, 10)).filter(Boolean).sort()[0] || "";
    const vale = !!ent && (!desde || (ent.ultima || ent.primera || "") >= desde);
    let disponible = vale ? Number(ent.total) || 0 : 0;
    ordenadas.forEach((p) => {
      const cant = p.cantidad == null ? null : Number(p.cantidad) || 0;
      let hecho = 0;
      if (disponible > 0) {
        hecho = cant === null ? disponible : Math.min(cant, disponible);
        disponible = Math.max(0, disponible - hecho);
      }
      const completo = cant === null ? hecho > 0 : hecho >= cant;
      const fechaCumplimiento = vale ? (ent.ultima || ent.primera || null) : null;
      let estado;
      if (completo) estado = "CUMPLIDO";
      else if ((p.fechaProgramada || "") < hoyISO) estado = "VENCIDO";
      else estado = "PROGRAMADO";
      out.push({
        ...p,
        estado,
        hecho,
        parcial: !completo && hecho > 0,
        fechaCumplimiento: completo ? fechaCumplimiento : null,
        llegoVencido: completo && !!fechaCumplimiento && fechaCumplimiento > (p.fechaProgramada || ""),
      });
    });
  });
  return out.sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "") || (a.horaInicio || "").localeCompare(b.horaInicio || ""));
}

// Arma toda la lista: por programar / programados / vencidos / cumplidos.
export function armarListaPorProgramar({ lotes, procesos, programaciones, entradas, hoyISO }) {
  const mios = new Set((procesos || []).map(normProceso));
  const progs = estadosProgramaciones(
    (programaciones || []).filter((p) => mios.has(normProceso(p.proceso))),
    entradas,
    hoyISO
  );
  // Cuánto ya está comprometido por lote+proceso (programaciones no cumplidas).
  const asignado = new Map();
  progs.filter((p) => p.estado !== "CUMPLIDO").forEach((p) => {
    const k = claveLP(p.numLote, p.proceso);
    if (asignado.get(k) === Infinity) return;
    if (p.cantidad == null) { asignado.set(k, Infinity); return; }
    asignado.set(k, (asignado.get(k) || 0) + Math.max(0, (Number(p.cantidad) || 0) - (p.hecho || 0)));
  });
  const enProceso = lotesEnProcesos(lotes, procesos, hoyISO);
  const porProgramar = enProceso
    .map((f) => {
      const a = asignado.get(claveLP(f.numLote, f.proceso)) || 0;
      const restante = a === Infinity ? 0 : Math.max(0, f.inventario - a);
      return { ...f, programado: a === Infinity ? f.inventario : Math.min(a, f.inventario), restante };
    })
    .filter((f) => f.restante > 0)
    .sort(
      (a, b) =>
        (ORDEN_PRIORIDAD[a.prioridad] ?? 3) - (ORDEN_PRIORIDAD[b.prioridad] ?? 3) ||
        (a.diasEntrega ?? 9999) - (b.diasEntrega ?? 9999) ||
        String(a.numLote).localeCompare(String(b.numLote))
    );
  const infoLote = new Map(enProceso.map((f) => [claveLP(f.numLote, f.proceso), f]));
  const conDatosLote = (p) => {
    const f = infoLote.get(claveLP(p.numLote, p.proceso));
    return { ...p, prioridad: f?.prioridad || null, razonesTxt: f?.razonesTxt || "", diasEntrega: f?.diasEntrega ?? null };
  };
  const programados = progs.filter((p) => p.estado === "PROGRAMADO").map(conDatosLote);
  const vencidos = progs.filter((p) => p.estado === "VENCIDO").map(conDatosLote);
  const cumplidos = progs
    .filter((p) => p.estado === "CUMPLIDO")
    .map(conDatosLote)
    .sort((a, b) => (b.fechaCumplimiento || "").localeCompare(a.fechaCumplimiento || ""));
  return {
    porProgramar,
    programados,
    vencidos,
    cumplidos,
    resumen: {
      porProgramar: porProgramar.length,
      unidadesPorProgramar: porProgramar.reduce((s, f) => s + f.restante, 0),
      programados: programados.length,
      programadosHoy: programados.filter((p) => p.fechaProgramada === hoyISO).length,
      vencidos: vencidos.length,
      cumplidos: cumplidos.length,
      altas: porProgramar.filter((f) => f.prioridad === "Alta").length,
    },
  };
}
