// ─── VENTAS DESDE ENTRADAS DE PLANTA ──────────────────────────────────────────
// (2026-11-06, a pedido de Fredy) «Traer lotes» en Costos y ventas: lista las Entradas de Planta (lo que entregó la
// planta, con su lote y el precio de la entrada, VaEnt) para escogerlas con casillas y cargarlas como ventas del área.
// Funciones puras (sin Firestore) para poder probarlas.

export const PLANTA_PROPIA_VENTAS = "INDUSTRIAS YANKO MODULO CENTRO";

// ─── TIPO DE SERVICIO DE CADA VENTA ───────────────────────────────────────────
// (2026-11-07, a pedido de Fredy) Al ingresar un lote hay que saber si es MAQUILA (confección completa) o un servicio suelto
// (ojal, presilla, encauchado…). Un mismo lote puede llevar varios servicios: cada servicio es una venta (línea) aparte, con su
// propio precio y cantidad, y la misma entrada de planta (claveEntrada) puede tener una línea por servicio.
export const SERVICIOS_VENTA = [
  { id: "MAQUILA", label: "Maquila" },
  { id: "OJAL", label: "Ojal" },
  { id: "PRESILLA", label: "Presilla" },
  { id: "ENCAUCHADO", label: "Encauchado" },
  { id: "OTRO", label: "Otro" },
];
export const SIN_SERVICIO = "SIN_TIPO";
export const servicioValido = (id) => SERVICIOS_VENTA.some((s) => s.id === id);
export const etiquetaServicio = (id) => (SERVICIOS_VENTA.find((s) => s.id === id) || { label: "Sin tipo" }).label;
export const servicioDeVenta = (v) => (servicioValido(v && v.servicio) ? v.servicio : SIN_SERVICIO);

const dosDig = (n) => String(n).padStart(2, "0");
const norm = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Servicio que se sugiere para una entrada: el más usado antes con la misma referencia; si no hay, lo que diga la descripción
// (ojal / presilla / encauchado). Sin pista devuelve "" (hay que escogerlo). Es solo una sugerencia: se confirma al cargar.
export function sugerirServicio({ ref, descripcion, ventasExistentes }) {
  const rk = norm(ref);
  if (rk) {
    const cuenta = {};
    (ventasExistentes || []).forEach((v) => {
      if (servicioValido(v.servicio) && norm(v.referencia) === rk) cuenta[v.servicio] = (cuenta[v.servicio] || 0) + 1;
    });
    const mejor = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
    if (mejor) return mejor[0];
  }
  const d = norm(descripcion);
  if (d.includes("ojal")) return "OJAL";
  if (d.includes("presill")) return "PRESILLA";
  if (d.includes("encauch")) return "ENCAUCHADO";
  return "";
}

// Ventas y unidades por servicio (las sin tipo aparte). Solo trae los servicios que tienen líneas.
export function resumenPorServicio(ventas) {
  const m = new Map();
  (ventas || []).forEach((v) => {
    const k = servicioDeVenta(v);
    if (!m.has(k)) m.set(k, { servicio: k, etiqueta: etiquetaServicio(k), ventas: 0, unidades: 0, lineas: 0 });
    const g = m.get(k);
    g.ventas += Number(v.total) || 0;
    g.unidades += Number(v.cantidad) || 0;
    g.lineas += 1;
  });
  const orden = [...SERVICIOS_VENTA.map((s) => s.id), SIN_SERVICIO];
  return orden.filter((k) => m.has(k)).map((k) => m.get(k));
}

// Por qué una línea (entrada + servicio) no se puede cargar: "" = se puede.
export function bloqueoLinea(fila, servicio) {
  if ((fila.cargados || []).includes(SIN_SERVICIO)) return "sin_tipo_cargada";
  if (servicioValido(servicio) && (fila.cargados || []).includes(servicio)) return "ya_cargada";
  return "";
}

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
  const cargadasPor = new Map(); // claveEntrada -> servicios ya cargados de esa entrada (SIN_TIPO si la venta no lo tiene)
  const lotesConVenta = new Set();
  (ventasExistentes || []).forEach((v) => {
    if (v.claveEntrada) {
      if (!cargadasPor.has(v.claveEntrada)) cargadasPor.set(v.claveEntrada, new Set());
      cargadasPor.get(v.claveEntrada).add(servicioDeVenta(v));
    } else if (v.lote) lotesConVenta.add(String(v.lote).trim());
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
        cargados: cargadasPor.has(clave) ? [...cargadasPor.get(clave)] : [],
        yaCargada: cargadasPor.has(clave),
        posibleDuplicado: !cargadasPor.has(clave) && !!lote && lotesConVenta.has(lote),
      };
    })
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || String(b.numLote).localeCompare(String(a.numLote), "es", { numeric: true }));
}

// Venta (centro_costo_ventas) a partir de una fila ya revisada. `edit` trae cantidad/precio corregidos (opcional).
export function ventaDeEntrada(fila, edit, { id, area, usuario, ahora, servicio }) {
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
    servicio: servicioValido(servicio) ? servicio : "",
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
