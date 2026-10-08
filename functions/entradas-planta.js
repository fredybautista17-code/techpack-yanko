// (2026-10-08, a pedido de Fredy) Sincronización de "Entradas de Planta"
// desde Busint, en vez de subir a mano el Excel "ENTRADAS A PLANTA".
//
// El Excel es un reporte que junta varias tablas de la API BD de Busint
// (confirmado entrada por entrada con Fredy: 7561, 7543, 7443, 7563, 6980):
//
//   NumEnt, Fecha, lote, ref interna, FOR, precio de la entrada (VaEnt)
//       <- "prod a bodega" (NumEnt, FechaEntra, Planta, Numlote, Ref, FOR, CostoConf)
//   cantidad (Prodnormal) <- suma de tallas T2..T36 en "prod a bodega detalle"
//   devoluciones (cantidad negativa) <- "proddev a bodega" (+ "proddev a bodega detalle")
//   nombre del taller (Nom) <- "maestro plantas" (Codplanta -> Nombre)
//   FECHAINI / FechaFin (fecha comprometida) <- salida del lote a esa planta
//       ("bmp - salida planta": Nomlote, Codplanta, FECHAINI, FechaFin) -- NO la
//       FechaFin de la entrada, que es otra cosa (fecha de la entrada)
//   CostoFT (precio teórico) <- "Civa" de esa misma salida (viene como texto,
//       ej. "4500"); si es 999999999 ("sin definir") el Excel usa el precio
//       de la entrada
//   Nped (pedido) <- "orden produccion" (NumLote -> Nped)
//   RefExt (código con el que se conoce en el resto de ATLAS) <- columna
//       "Color" de "maestro de referencias" (sí, así se llama la columna)
//   Categoría <- "tipo de prenda" (IdDesc -> Descripcion) por NDescripcion
//   Línea <- "lineas" (IdLinea -> Linea) por NLinea
//   Facturado (Ftpla) = cantidad x precio de la entrada (en las devoluciones
//       el Excel lo trae en positivo: se replica igual, ver nota abajo)
//
// Cada entrada se devuelve con EXACTAMENTE el mismo formato que arma
// parseEntradasPlanta() en src/modulo-planta.jsx al leer el Excel, para que
// el Resumen, las Estadísticas y el Verificador de Precio funcionen sin
// cambios.
const TALLAS = ["T2", "T4", "T6", "T8", "T10", "T12", "T14", "T16", "T18", "T24", "T36"];
const SIN_DEFINIR = 999999999;
const TAM_MAX_DOC_BYTES = 950000; // Firestore: 1 MiB por documento
const ID_DOC_SYNC = "sync-busint";

// Nombre del cliente de un lote. Busint escribe en la Observación de la orden
// de producción: "Pedido: 1519  OrdComp:   Cliente: KAMILA VENEZUELA - KAMILA
// VENEZUELA   Obs: ..." (confirmado con el lote 7223, pedido 1519). Cuando el
// cliente viene repetido ("X - X") se deja una sola vez.
function clienteDeObservacionOrden(obs) {
  const m = /Cliente:\s*(.+?)(?:\s+Obs:|$)/i.exec(String(obs || ""));
  if (!m) return null;
  const limpio = m[1].replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  const partes = limpio.split(/\s+-\s+/);
  if (partes.length === 2 && partes[0].toLowerCase() === partes[1].toLowerCase()) return partes[0];
  return limpio;
}

function crearEntradasPlanta({ db, logger, consultarTablaBusintBDCompleta, fechaISODesdeCampoBusintBD, fechaHoyBogota }) {
  function sumaTallas(fila) {
    return TALLAS.reduce((s, t) => s + (Number(fila?.[t]) || 0), 0);
  }
  function diasEntre(inicioISO, finISO) {
    if (!inicioISO || !finISO) return null;
    const a = Date.parse(`${inicioISO}T00:00:00Z`);
    const b = Date.parse(`${finISO}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
  }
  function numeroValido(v) {
    const n = Number(String(v ?? "").trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  function sumarPorClave(filas, campoClave) {
    const m = new Map();
    filas.forEach((f) => {
      const k = String(f?.[campoClave] ?? "").trim();
      if (!k) return;
      m.set(k, (m.get(k) || 0) + sumaTallas(f));
    });
    return m;
  }

  // Arma todas las entradas (y devoluciones) con fecha >= desdeISO.
  async function construirEntradasPlantaBusint({ desdeISO }) {
    const [
      cabEnt, detEnt, cabDev, detDev,
      plantas, salidas, ordenes, referencias, tiposPrenda, lineas,
    ] = await Promise.all([
      consultarTablaBusintBDCompleta("prod a bodega"),
      consultarTablaBusintBDCompleta("prod a bodega detalle"),
      consultarTablaBusintBDCompleta("proddev a bodega"),
      consultarTablaBusintBDCompleta("proddev a bodega detalle"),
      consultarTablaBusintBDCompleta("maestro plantas"),
      consultarTablaBusintBDCompleta("bmp - salida planta"),
      consultarTablaBusintBDCompleta("orden produccion"),
      consultarTablaBusintBDCompleta("maestro de referencias"),
      consultarTablaBusintBDCompleta("tipo de prenda"),
      consultarTablaBusintBDCompleta("lineas"),
    ]);

    const nombrePlanta = new Map();
    plantas.forEach((p) => {
      const c = String(p?.Codplanta ?? "").trim();
      if (c) nombrePlanta.set(c, String(p?.Nombre || "").trim());
    });
    const pedidoPorLote = new Map();
    ordenes.forEach((o) => {
      const l = String(o?.NumLote ?? "").trim();
      const n = Number(o?.Nped);
      if (l && Number.isFinite(n) && n > 0) pedidoPorLote.set(l, n);
    });
    const clientePorLote = new Map();
    ordenes.forEach((o) => {
      const l = String(o?.NumLote ?? "").trim();
      const c = clienteDeObservacionOrden(o?.Observacion);
      if (l && c) clientePorLote.set(l, c);
    });
    const categoriaPorId = new Map();
    tiposPrenda.forEach((t) => categoriaPorId.set(String(t?.IdDesc ?? "").trim(), String(t?.Descripcion || "").trim()));
    const lineaPorId = new Map();
    lineas.forEach((l) => lineaPorId.set(String(l?.IdLinea ?? "").trim(), String(l?.Linea || "").trim()));
    const refPorRef = new Map();
    referencias.forEach((r) => {
      const k = String(r?.Ref ?? "").trim();
      if (k) refPorRef.set(k, r);
    });
    // Salidas del lote al taller que traen fechas de inicio/fin (en cada lote
    // solo la salida "con orden" trae FECHAINI/FechaFin; las demás vienen en
    // null).
    const salidasConFechas = new Map(); // lote -> [{fecha, codplanta, fechaIni, fechaFin, civa}]
    salidas.forEach((s) => {
      const lote = String(s?.Nomlote ?? "").trim();
      if (!lote || lote === "0") return;
      const ini = fechaISODesdeCampoBusintBD(s?.FECHAINI);
      const fin = fechaISODesdeCampoBusintBD(s?.FechaFin);
      if (!ini || !fin) return;
      if (!salidasConFechas.has(lote)) salidasConFechas.set(lote, []);
      salidasConFechas.get(lote).push({
        fecha: fechaISODesdeCampoBusintBD(s?.Fecha) || ini,
        codplanta: String(s?.Codplanta ?? "").trim(),
        fechaIni: ini,
        fechaFin: fin,
        civa: numeroValido(s?.Civa),
      });
    });
    function salidaDeLote(lote, codplanta, fechaEntrada) {
      const lista = salidasConFechas.get(String(lote)) || [];
      if (!lista.length) return null;
      const mismaPlanta = lista.filter((s) => s.codplanta === String(codplanta));
      const base = mismaPlanta.length ? mismaPlanta : lista;
      // La más reciente que salió ANTES (o el mismo día) de la entrada; si
      // ninguna, la más antigua.
      const previas = base.filter((s) => s.fecha <= fechaEntrada).sort((a, b) => b.fecha.localeCompare(a.fecha));
      if (previas.length) return previas[0];
      return [...base].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    }

    const cantEnt = sumarPorClave(detEnt, "NumEnt");
    const cantDev = sumarPorClave(detDev, "NumEnt");

    // numEntOverride: en "proddev a bodega" NumEnt es el número propio de la
    // devolución (ej. 329) y la columna Nlect trae la entrada ORIGINAL que se
    // devolvió (ej. 6598). El Excel usa la original como NumEnt, así que
    // aquí se hace igual y el número de la devolución queda en numDev.
    // restaFacturado: entradas con cantidad negativa dentro de "prod a
    // bodega" (el Excel las trae con Ftpla negativo).
    function armar(cab, cantidadAbsRaw, esDevolucion, { numEntOverride = null, numDev = null, restaFacturado = false } = {}) {
      const cantidadAbs = Math.round(cantidadAbsRaw * 100) / 100;
      const fecha = fechaISODesdeCampoBusintBD(cab?.FechaEntra);
      const numEnt = numEntOverride !== null ? numEntOverride : Number(cab?.NumEnt);
      if (!fecha || !Number.isFinite(numEnt) || numEnt <= 0) return null;
      const lote = String(cab?.Numlote ?? "").trim();
      const codplanta = String(cab?.Planta ?? "").trim();
      const refN = String(cab?.Ref ?? "").trim();
      const ref = refPorRef.get(refN) || null;
      const precioEntrada = Number(cab?.CostoConf) || 0;
      const sal = salidaDeLote(lote, codplanta, fecha);
      const teorico = sal && sal.civa !== null && sal.civa > 0 && sal.civa !== SIN_DEFINIR ? sal.civa : precioEntrada;
      const cantidad = esDevolucion ? -cantidadAbs : cantidadAbs;
      const fechaFin = sal ? sal.fechaFin : null;
      return {
        numEnt,
        fecha,
        fechaFin,
        fechaInicio: sal ? sal.fechaIni : null,
        nombrePlanta: nombrePlanta.get(codplanta) || `(Planta ${codplanta || "?"})`,
        categoria: (ref && categoriaPorId.get(String(ref.NDescripcion ?? "").trim())) || "(Sin categoría)",
        linea: (ref && lineaPorId.get(String(ref.NLinea ?? "").trim())) || "",
        cantidad,
        esDevolucion,
        // Igual que el Excel: en las devoluciones Ftpla viene en positivo.
        facturado: (restaFacturado ? -1 : 1) * Math.round(cantidadAbs * precioEntrada),
        numLote: lote ? (Number.isFinite(Number(lote)) ? Number(lote) : lote) : null,
        refN,
        refExt: String((ref && String(ref.Color || "").trim()) || refN).trim(),
        nPedido: pedidoPorLote.get(lote) ?? null,
        // Cliente del lote (de la orden de producción de Busint); sirve para
        // separar Kamila Colombia / Kamila Venezuela y los demás clientes en
        // Planeación aunque el lote ya haya salido del panel.
        cliente: clientePorLote.get(lote) || null,
        diasCumplimiento: fecha && fechaFin && cantidad > 0 ? diasEntre(fechaFin, fecha) : null,
        precioTeorico: teorico,
        precioEntrada,
        usuario: String(cab?.USUARIO || "").trim() || null,
        // Motivo escrito al devolver (ej. "SE DEVUELVE POR ERROR AL DIGITAR
        // PRECIO") -- alimenta el Control de devoluciones de Planta.
        observacion: esDevolucion ? String(cab?.Observacion || "").trim() || null : null,
        numDev,
      };
    }

    const entradas = [];
    cabEnt.forEach((c) => {
      const f = fechaISODesdeCampoBusintBD(c?.FechaEntra);
      if (!f || f < desdeISO) return;
      const q = cantEnt.get(String(c?.NumEnt ?? "").trim()) || (Number(c?.Primera) || 0) + (Number(c?.Segunda) || 0);
      const e = armar(c, Math.abs(q), q < 0, { restaFacturado: q < 0 });
      if (e) entradas.push(e);
    });
    cabDev.forEach((c) => {
      const f = fechaISODesdeCampoBusintBD(c?.FechaEntra);
      if (!f || f < desdeISO) return;
      const q = cantDev.get(String(c?.NumEnt ?? "").trim()) || (Number(c?.Primera) || 0) + (Number(c?.Segunda) || 0);
      if (!q) return;
      const nlect = Number(c?.Nlect);
      const e = armar(c, q, true, { numEntOverride: Number.isFinite(nlect) && nlect > 0 ? nlect : null, numDev: Number(c?.NumEnt) || null });
      if (e) entradas.push(e);
    });
    entradas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numEnt - b.numEnt);
    return entradas;
  }

  const claveEntrada = (e) => `${e.numEnt}|${e.fecha}|${e.esDevolucion ? "D" : "E"}`;

  async function cargaMasReciente() {
    const snap = await db.collection("planta_entradas_cargas").orderBy("creadoEn", "desc").limit(1).get();
    if (snap.empty) return null;
    return { ...snap.docs[0].data(), id: snap.docs[0].id };
  }

  // Compara, campo por campo, lo que trae Busint contra la carga más reciente
  // (la del Excel) -- para validar las reglas ANTES de guardar nada.
  async function compararConCargaActiva() {
    const carga = await cargaMasReciente();
    if (!carga || !(carga.entradas || []).length) {
      return { ok: false, mensaje: "No hay ninguna carga de Entradas de Planta para comparar." };
    }
    const existentes = carga.entradas;
    const minFecha = existentes.reduce((m, e) => (e.fecha && e.fecha < m ? e.fecha : m), "9999-12-31");
    const busint = await construirEntradasPlantaBusint({ desdeISO: minFecha });
    const mapBusint = new Map(busint.map((e) => [claveEntrada(e), e]));
    const mapExcel = new Map(existentes.map((e) => [claveEntrada(e), e]));
    const CAMPOS = ["cantidad", "nombrePlanta", "numLote", "refExt", "categoria", "nPedido", "fechaInicio", "fechaFin", "precioTeorico", "precioEntrada", "facturado"];
    const difPorCampo = {};
    CAMPOS.forEach((c) => { difPorCampo[c] = { total: 0, ejemplos: [] }; });
    let coinciden = 0;
    let conDiferencias = 0;
    const soloExcel = [];
    mapExcel.forEach((ex, k) => {
      const bu = mapBusint.get(k);
      if (!bu) {
        if (soloExcel.length < 40) soloExcel.push({ numEnt: ex.numEnt, fecha: ex.fecha, cantidad: ex.cantidad, planta: ex.nombrePlanta });
        return;
      }
      let hayDif = false;
      CAMPOS.forEach((c) => {
        const a = ex[c] ?? null;
        const b = bu[c] ?? null;
        const igual = typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : String(a ?? "") === String(b ?? "");
        if (!igual) {
          hayDif = true;
          difPorCampo[c].total += 1;
          if (difPorCampo[c].ejemplos.length < 6) difPorCampo[c].ejemplos.push({ numEnt: ex.numEnt, fecha: ex.fecha, excel: a, busint: b });
        }
      });
      if (hayDif) conDiferencias += 1;
      else coinciden += 1;
    });
    const soloBusint = [];
    mapBusint.forEach((bu, k) => {
      if (!mapExcel.has(k) && soloBusint.length < 40) soloBusint.push({ numEnt: bu.numEnt, fecha: bu.fecha, cantidad: bu.cantidad, planta: bu.nombrePlanta });
    });
    const totalSoloBusint = [...mapBusint.keys()].filter((k) => !mapExcel.has(k)).length;
    const totalSoloExcel = [...mapExcel.keys()].filter((k) => !mapBusint.has(k)).length;
    return {
      ok: true,
      cargaComparada: { id: carga.id, fecha: carga.fecha, subidoPor: carga.subidoPor || null },
      desde: minFecha,
      totalExcel: existentes.length,
      totalBusint: busint.length,
      coincidenExactas: coinciden,
      conDiferencias,
      totalSoloExcel,
      totalSoloBusint,
      soloExcel,
      soloBusint,
      diferenciasPorCampo: difPorCampo,
    };
  }

  // Trae lo nuevo de Busint (últimos `dias` días) y lo mezcla con la carga
  // más reciente: las entradas de Busint reemplazan a las que tengan la
  // misma clave; el resto se conserva tal cual (historia del Excel).
  async function sincronizar({ guardar, dias = 60, usuario = "Sincronización Busint" }) {
    const hoy = fechaHoyBogota();
    const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - dias * 86400000).toISOString().slice(0, 10);
    const [busint, carga] = await Promise.all([construirEntradasPlantaBusint({ desdeISO: desde }), cargaMasReciente()]);
    const existentes = carga?.entradas || [];
    const mapa = new Map(existentes.map((e) => [claveEntrada(e), e]));
    let nuevas = 0;
    let actualizadas = 0;
    busint.forEach((b) => {
      const k = claveEntrada(b);
      const previa = mapa.get(k);
      if (!previa) {
        nuevas += 1;
        mapa.set(k, b);
        return;
      }
      // Se conserva lo que ya había si Busint no trae el dato (ej. lote que
      // ya salió de las tablas de ordenes).
      const fusion = { ...previa };
      Object.keys(b).forEach((c) => {
        const v = b[c];
        if (v !== null && v !== undefined && v !== "" && v !== "(Sin categoría)") fusion[c] = v;
      });
      if (JSON.stringify(fusion) !== JSON.stringify(previa)) actualizadas += 1;
      mapa.set(k, fusion);
    });
    const merged = [...mapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numEnt - b.numEnt);
    const resumen = {
      desde,
      dias,
      traidasDeBusint: busint.length,
      nuevas,
      actualizadas,
      totalDespuesDeMezclar: merged.length,
      ultimaFecha: merged.length ? merged[merged.length - 1].fecha : null,
      guardado: false,
    };
    if (!guardar) return resumen;
    const tamano = JSON.stringify(merged).length;
    if (tamano > TAM_MAX_DOC_BYTES) {
      throw new Error(`La carga de Entradas de Planta ya pesa ${Math.round(tamano / 1024)} KB y se acerca al límite de 1 MB de Firestore -- hay que dividirla en varios documentos antes de seguir sincronizando.`);
    }
    const ahora = new Date().toISOString();
    await db.collection("planta_entradas_cargas").doc(ID_DOC_SYNC).set({
      id: ID_DOC_SYNC,
      fecha: hoy,
      creadoEn: ahora,
      subidoPor: usuario,
      origen: "busint",
      entradas: merged,
    });
    logger.info("Entradas de Planta sincronizadas desde Busint", resumen);
    return { ...resumen, guardado: true, tamanoKB: Math.round(tamano / 1024) };
  }

  return { construirEntradasPlantaBusint, compararConCargaActiva, sincronizar };
}

module.exports = { crearEntradasPlanta, ID_DOC_SYNC };
