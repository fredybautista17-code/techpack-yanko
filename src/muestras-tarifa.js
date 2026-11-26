// ─── TARIFA DE MUESTRAS POR PRENDA (tipo CIF) → Cotizador ─────────────────────────────────────────────────────
// (2026-11-26, a pedido de Fredy) El costo del área de muestras del mes se reparte entre las prendas que se cortaron ese mes y el
// resultado («valor por prenda») se publica en `cotizador_tarifas/muestras`. El Cotizador solo lee ese número: el detalle (sueldos,
// talleres) se queda en Cronograma de Muestras → Costos. Todo aquí es lógica pura para poder probarla.

export const MODOS_TARIFA = { mes: "El mes elegido", prom3: "Promedio de los últimos 3 meses" };

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
// prendasManual: solo vale con modo «mes» (cuando el corte no tiene datos del mes).
export function calcularTarifaMuestras({ mes, modo = "mes", costoPorMes = {}, prendasPorMes = {}, prendasManual = null }) {
  const meses = mesesDeTarifa(mes, modo);
  const filas = meses.map((m, i) => {
    const manual = modo === "mes" && i === 0 && prendasManual !== null && prendasManual !== "" && NUM(prendasManual) > 0 ? NUM(prendasManual) : null;
    return { mes: m, costo: NUM(costoPorMes[m]), prendas: manual !== null ? manual : NUM(prendasPorMes[m]), manual: manual !== null };
  });
  const costo = filas.reduce((s, f) => s + f.costo, 0);
  const prendas = filas.reduce((s, f) => s + f.prendas, 0);
  const valor = costo > 0 && prendas > 0 ? Math.round(costo / prendas) : null;
  let aviso = "";
  if (!prendas) aviso = "No hay prendas cortadas en ese periodo: escribe la cantidad a mano o elige el promedio de 3 meses.";
  else if (!costo) aviso = "El costo de muestras de ese periodo es $0: define sueldos o precios en la pestaña de costos.";
  return { modo, meses: filas, costo, prendas, valor, manual: filas.some((f) => f.manual), aviso };
}

// Un documento de tarifa publicado es utilizable solo si trae un valor por prenda positivo
export const tarifaVigente = (t) => (t && NUM(t.valorPorPrenda) > 0 ? { ...t, valorPorPrenda: Math.round(NUM(t.valorPorPrenda)) } : null);

// Lo que se guarda al publicar: SOLO el número, el periodo y quién lo publicó (nada de sueldos)
export function documentoTarifa(calculo, mes, usuario, ahora) {
  return {
    valorPorPrenda: calculo.valor,
    mes,
    modo: calculo.modo,
    prendas: Math.round(calculo.prendas),
    publicadoPor: usuario || "",
    publicadoEn: ahora || new Date().toISOString(),
  };
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
