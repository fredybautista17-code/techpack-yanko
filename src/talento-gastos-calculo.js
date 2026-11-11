// ─── GASTOS DE TALENTO HUMANO (presupuesto anual) ─────────────────────────────
// (2026-11-11, a pedido de Fredy) Cuánto gasta el área de Talento Humano por año (primero el ítem «Recreación», traído de las facturas de compra
// de Busint por concepto, igual que «Traer gastos» de Planta) para armar el presupuesto del año siguiente.
// Colecciones Firestore (prefijo nomina_: un Cliente nunca las lee):
//   nomina_talento_gastos        un documento por factura: {item, concepto, proveedor, numeroFactura, monto, fecha, anio, mes, origen, claveBusint…}
//   nomina_talento_presupuesto   un documento por año e ítem: {anio, itemClave, item, meses[12], base, ajuste, actualizadoPor, actualizadoEn}
// Funciones puras (sin Firestore) para poder probarlas.

export const COL_GASTOS_TALENTO = "nomina_talento_gastos";
export const COL_PRESUPUESTO_TALENTO = "nomina_talento_presupuesto";
export const CONCEPTO_TALENTO_DEFECTO = "RECREACION";
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const NOMBRES_ITEM = { RECREACION: "Recreación", DOTACION: "Dotación", CAPACITACION: "Capacitación", BIENESTAR: "Bienestar" };
const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// «RECREACION» -> «Recreación»; lo que no esté en la lista queda con la primera letra en mayúscula.
export function nombreItem(texto) {
  const t = String(texto || "").trim();
  if (!t) return "Sin ítem";
  const clave = sinTildes(t).toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (NOMBRES_ITEM[clave]) return NOMBRES_ITEM[clave];
  const bajo = t.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}
export const claveItem = (item) => sinTildes(item).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "item";
export const TODOS = "todos";

export function hoyBogotaISO(ahora = new Date()) {
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

// Gasto de Talento Humano a partir de una fila de factura de Busint (la que arma candidatosGastos)
export function gastoTalentoDeFactura(fila, { id, usuario, ahora }) {
  const fecha = String(fila.fecha || "");
  return {
    id,
    item: nombreItem(fila.concepto || fila.proveedor),
    concepto: fila.concepto || "",
    proveedor: fila.proveedor || "",
    numeroFactura: fila.numeroFactura || "",
    monto: Number(fila.monto) || 0,
    fecha,
    anio: Number(fecha.slice(0, 4)) || 0,
    mes: Number(fecha.slice(5, 7)) || 0,
    creadoEn: ahora,
    origen: "busint",
    claveBusint: fila.clave,
    codigoProveedorBusint: fila.codigo || "",
    cargadoPor: usuario || "",
  };
}

export function itemsDeGastos(gastos) {
  return [...new Set((gastos || []).map((g) => g.item).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

// Serie por año y mes. real[año][i] = suma del mes i (0 = enero); los meses que todavía no llegan del año en curso quedan en null.
// El mes en curso cuenta con lo que lleva (viene incompleto).
export function armarSerie({ gastos, item = TODOS, hoy = hoyBogotaISO(), maxAnios = 4 }) {
  const anioActual = Number(hoy.slice(0, 4));
  const mesActual = Number(hoy.slice(5, 7));
  const filtrados = (gastos || []).filter((g) => (item === TODOS || g.item === item) && g.anio >= 1990 && g.mes >= 1 && g.mes <= 12 && g.anio <= anioActual);
  const crudo = new Map();
  filtrados.forEach((g) => {
    if (!crudo.has(g.anio)) crudo.set(g.anio, Array(12).fill(0));
    crudo.get(g.anio)[g.mes - 1] += Number(g.monto) || 0;
  });
  if (!crudo.size) return { anios: [], real: {}, totales: {}, anioActual, mesActual, anioPres: anioActual + 1 };
  const primero = Math.max(Math.min(...crudo.keys()), anioActual - maxAnios + 1);
  const anios = [];
  for (let a = primero; a <= anioActual; a += 1) anios.push(a);
  const real = {};
  const totales = {};
  anios.forEach((a) => {
    const base = (crudo.get(a) || Array(12).fill(0)).map((v) => Math.round(v));
    real[a] = a === anioActual ? base.map((v, i) => (i + 1 > mesActual ? null : v)) : base;
    totales[a] = real[a].reduce((s, v) => s + (v || 0), 0);
  });
  return { anios, real, totales, anioActual, mesActual, anioPres: anioActual + 1 };
}

// Presupuesto sugerido: 12 valores redondeados a miles.
//   base «actual»: lo gastado este año; el mes en curso y los que faltan se toman del año anterior.
//   base «anterior»: lo gastado el año pasado.
//   base «promedio»: promedio de los últimos 3 años de cada mes (solo meses ya completos).
export function sugerirPresupuesto({ serie, base = "actual", ajuste = 0 }) {
  const { real, anios, anioActual, mesActual } = serie;
  const factor = 1 + (Number(ajuste) || 0) / 100;
  const ant = real[anioActual - 1];
  const act = real[anioActual];
  const valorMes = (i) => {
    if (base === "anterior") return ant ? ant[i] || 0 : act && act[i] !== null && act[i] !== undefined ? act[i] : 0;
    if (base === "promedio") {
      const ultimos = anios.slice(-3);
      const completos = ultimos.filter((a) => !(a === anioActual && i + 1 >= mesActual)).map((a) => real[a][i]).filter((v) => v !== null && v !== undefined);
      const usar = completos.length ? completos : ultimos.map((a) => real[a][i]).filter((v) => v !== null && v !== undefined);
      return usar.length ? usar.reduce((s, v) => s + v, 0) / usar.length : 0;
    }
    if (act && i + 1 < mesActual && act[i] !== null && act[i] !== undefined) return act[i];
    if (ant) return ant[i] || 0;
    return act && act[i] !== null && act[i] !== undefined ? act[i] : 0;
  };
  return Array.from({ length: 12 }, (_, i) => Math.round((valorMes(i) * factor) / 1000) * 1000);
}

// Cuánto cerraría el año en curso: lo gastado + lo que se gastó el año pasado en los meses que faltan.
export function proyeccionCierre(serie) {
  const { real, anioActual, mesActual } = serie;
  const act = real[anioActual];
  const ant = real[anioActual - 1];
  if (!act) return 0;
  return act.reduce((s, v, i) => s + (v !== null && v !== undefined && i + 1 <= mesActual ? v : 0) + (i + 1 > mesActual && ant ? ant[i] || 0 : 0), 0);
}

// Comparación justa del año en curso contra el anterior: solo los meses ya completos de ambos.
export function comparacionAnioEnCurso(serie) {
  const { real, anioActual, mesActual } = serie;
  const act = real[anioActual];
  const ant = real[anioActual - 1];
  if (!act || !ant || mesActual < 2) return null;
  const hasta = mesActual - 1;
  const a = act.slice(0, hasta).reduce((s, v) => s + (v || 0), 0);
  const b = ant.slice(0, hasta).reduce((s, v) => s + (v || 0), 0);
  return { hasta, actual: a, anterior: b, pct: b > 0 ? (a / b - 1) * 100 : null };
}

export const idPresupuesto = (anio, itemClave) => `${anio}__${itemClave}`;
