// ─── VENTAS DESDE ENTRADAS DE PLANTA ──────────────────────────────────────────
// (2026-11-06, a pedido de Fredy) «Traer lotes» en Costos y ventas: lista las Entradas de Planta (lo que entregó la
// planta, con su lote y el precio de la entrada, VaEnt) para escogerlas con casillas y cargarlas como ventas del área.
// Funciones puras (sin Firestore) para poder probarlas.

export const PLANTA_PROPIA_VENTAS = "INDUSTRIAS YANKO MODULO CENTRO";

const dosDig = (n) => String(n).padStart(2, "0");
const norm = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Misma clave que usa Entradas de Planta para no duplicar una entrada
export const claveVentaEntrada = (e) => `${e.numEnt}|${e.fecha}|${e.esDevolucion ? "D" : "E"}`;

export const totalLineaVenta = (cantidad, precio) => Math.round((Number(cantidad) || 0) * (Number(precio) || 0));

// Rango de fechas [desde, hasta] del período que se está viendo en Costos y ventas
export function rangoDelPeriodo({ periodo, fechaDia, mesSel, anioSel, quincenaSel, fechaRangoInicio, fechaRangoFin }) {
  const ultimoDia = (y, m) => new Date(y, m, 0).getDate();
  if (periodo === "dia") return [fechaDia, fechaDia];
  if (periodo === "quincena") {
    const base = `${anioSel}-${dosDig(mesSel)}`;
    return String(quincenaSel) === "1" ? [`${base}-01`, `${base}-15`] : [`${base}-16`, `${base}-${dosDig(ultimoDia(anioSel, mesSel))}`];
  }
  if (periodo === "mes") return [`${anioSel}-${dosDig(mesSel)}-01`, `${anioSel}-${dosDig(mesSel)}-${dosDig(ultimoDia(anioSel, mesSel))}`];
  if (periodo === "anio") return [`${anioSel}-01-01`, `${anioSel}-12-31`];
  return [fechaRangoInicio, fechaRangoFin];
}

export function plantasDeEntradas(entradas) {
  return [...new Set((entradas || []).map((e) => e.nombrePlanta).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));
}

// numLote -> cliente, tomando la carga más reciente de Planeación primero y completando con las anteriores
export function clientePorLoteDeCargas(cargas, maxCargas = 3) {
  const mapa = new Map();
  [...(cargas || [])]
    .sort((a, b) => String(b.creadoEn || b.fecha || "").localeCompare(String(a.creadoEn || a.fecha || "")))
    .slice(0, maxCargas)
    .forEach((c) => {
      (c.lotes || []).forEach((l) => {
        const k = String(l.numLote ?? "").trim();
        const cli = String(l.nombreCliente || l.clienteAgrupado || "").trim();
        if (k && cli && !mapa.has(k)) mapa.set(k, cli);
      });
    });
  return mapa;
}

// Filas candidatas para cargar como venta
export function candidatosVentas({ entradas, planta, desde, hasta, busqueda, ventasExistentes, clientePorLote }) {
  const cargadas = new Set();
  const lotesConVenta = new Set();
  (ventasExistentes || []).forEach((v) => {
    if (v.claveEntrada) cargadas.add(v.claveEntrada);
    else if (v.lote) lotesConVenta.add(String(v.lote).trim());
  });
  const q = norm(busqueda);
  return (entradas || [])
    .filter((e) => {
      if (planta && e.nombrePlanta !== planta) return false;
      if (desde && (e.fecha || "") < desde) return false;
      if (hasta && (e.fecha || "") > hasta) return false;
      if (!Number(e.cantidad)) return false;
      if (q && !norm(`${e.numLote} ${e.refExt} ${e.refN} ${e.descripcion} ${e.nPedido}`).includes(q)) return false;
      return true;
    })
    .map((e) => {
      const clave = claveVentaEntrada(e);
      const lote = String(e.numLote ?? "").trim();
      return {
        clave,
        numEnt: e.numEnt,
        fecha: e.fecha,
        numLote: lote,
        ref: String(e.refExt || e.refN || "").trim(),
        descripcion: e.descripcion || "",
        cliente: (clientePorLote && clientePorLote.get(lote)) || "",
        nPedido: e.nPedido ?? null,
        cantidad: Number(e.cantidad) || 0,
        precio: Number(e.precioEntrada) || 0,
        esDevolucion: !!e.esDevolucion || Number(e.cantidad) < 0,
        yaCargada: cargadas.has(clave),
        posibleDuplicado: !cargadas.has(clave) && !!lote && lotesConVenta.has(lote),
      };
    })
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || String(b.numLote).localeCompare(String(a.numLote), "es", { numeric: true }));
}

// Venta (centro_costo_ventas) a partir de una fila ya revisada. `edit` trae cantidad/precio corregidos (opcional).
export function ventaDeEntrada(fila, edit, { id, area, usuario, ahora }) {
  const cantidad = edit && edit.cantidad !== undefined && edit.cantidad !== "" ? Number(edit.cantidad) : fila.cantidad;
  const precio = edit && edit.precio !== undefined && edit.precio !== "" ? Number(edit.precio) : fila.precio;
  return {
    id,
    area,
    referencia: fila.ref || "(sin referencia)",
    lote: fila.numLote,
    cantidad,
    precio,
    total: totalLineaVenta(cantidad, precio),
    cliente: fila.cliente || "",
    fecha: fila.fecha,
    facturaUrl: "",
    creadoEn: ahora,
    origen: "entrada_planta",
    claveEntrada: fila.clave,
    numEnt: fila.numEnt ?? null,
    precioEntrada: fila.precio,
    cantidadEntrada: fila.cantidad,
    cargadoPor: usuario || "",
  };
}
