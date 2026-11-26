// ─── TARIFA DE MUESTRAS POR PRENDA (tipo CIF) → Cotizador ─────────────────────────────────────────────────────
// (2026-11-26, a pedido de Fredy: «que se autocalcule siempre») El costo del área de muestras se reparte entre las prendas que se cortaron
// en los últimos meses CERRADOS y el resultado («valor por prenda») lo escribe SOLA una función del servidor cada día en
// `cotizador_tarifas/muestras` (functions/tarifa-muestras.js, con las mismas reglas que aquí). El Cotizador solo lee ese número: el detalle
// (sueldos, talleres) se queda en Cronograma de Muestras → Costos. Aquí: lógica pura para mostrar el cálculo y aplicar el valor.

export const BASES_TARIFA = { mes: "Último mes cerrado", prom3: "Promedio de los últimos 3 meses cerrados" };

const NUM = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const mesDeFecha = (f) => String(f || "").slice(0, 7);

// Unidades cortadas por mes (clave «AAAA-MM») a partir de pedidos_activos[].cortesRealizados[].{fecha,totalUnidades}
export function prendasCortadasPorMes(pedidos) {
  const por = {};
  (pedidos || []).forEach((p) => (p.cortesRealizados || []).forEach((c) => {
    const mes = mesDeFecha(c && c.fecha);
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    const u = NUM(c.totalUnidades) || (c.refs || []).reduce((s, r) => s + NUM(r && r.total), 0);
    if (u > 0) por[mes] = (por[mes] || 0) + u;
  }));
  return por;
}

export function mesAnteriorDe(mes) {
  const [y, m] = String(mes).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Los meses que entran en el cálculo: [mes] o [mes, anterior, anterior-1]
export const mesesDeTarifa = (mes, modo) => (modo === "prom3" ? [mes, mesAnteriorDe(mes), mesAnteriorDe(mesAnteriorDe(mes))] : [mes]);

// costoPorMes: { "2026-10": 4800000, … }   prendasPorMes: { "2026-10": 3200, … }
// mes = último mes CERRADO (el mes en curso nunca entra): modo «mes» usa solo ese; «prom3» ese y los 2 anteriores.
export function calcularTarifaMuestras({ mes, modo = "mes", costoPorMes = {}, prendasPorMes = {} }) {
  const meses = mesesDeTarifa(mes, modo);
  const filas = meses.map((m) => ({ mes: m, costo: NUM(costoPorMes[m]), prendas: NUM(prendasPorMes[m]) }));
  const costo = filas.reduce((s, f) => s + f.costo, 0);
  const prendas = filas.reduce((s, f) => s + f.prendas, 0);
  const valor = costo > 0 && prendas > 0 ? Math.round(costo / prendas) : null;
  let aviso = "";
  if (!prendas) aviso = "No hay prendas cortadas en esos meses: no se puede calcular la tarifa.";
  else if (!costo) aviso = "El costo de muestras de esos meses es $0: define sueldos o precios en la pestaña de costos.";
  return { modo, meses: filas, costo, prendas, valor, aviso };
}

// Un documento de tarifa publicado es utilizable solo si trae un valor por prenda positivo
export const tarifaVigente = (t) => (t && NUM(t.valorPorPrenda) > 0 ? { ...t, valorPorPrenda: Math.round(NUM(t.valorPorPrenda)) } : null);

// Último mes cerrado a partir de una fecha AAAA-MM-DD (hora de Colombia)
export const ultimoMesCerrado = (hoyISO) => mesAnteriorDe(String(hoyISO).slice(0, 7));

// Texto corto de qué periodo cubre la tarifa publicada (acepta también el formato anterior con `mes`)
export function periodoTarifa(t) {
  const meses = Array.isArray(t && t.meses) && t.meses.length ? t.meses : (t && t.mes ? [t.mes] : []);
  if (!meses.length) return "";
  if (meses.length === 1) return mesCorto(meses[0]);
  return `promedio de ${mesCorto(meses[meses.length - 1])} a ${mesCorto(meses[0])}`;
}

// Fichas del Cotizador con el «Área de diseño y muestras» reemplazado por la tarifa publicada.
// No toca los documentos guardados: solo lo que se usa para crear/cargar cotizaciones.
export function aplicarTarifaMuestras(parametros, tarifa) {
  const t = tarifaVigente(tarifa);
  if (!t) return parametros;
  const lista = (parametros || []).map((p) => ({ ...p, fijos: { ...(p.fijos || {}), diseno: t.valorPorPrenda } }));
  if (!lista.some((p) => p.id === "general")) lista.push({ id: "general", nombre: "General", fijos: { diseno: t.valorPorPrenda } });
  return lista;
}

export const mesCorto = (mes) => {
  const [y, m] = String(mes).split("-").map(Number);
  const n = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][(m || 1) - 1] || mes;
  return `${n} ${y}`;
};
