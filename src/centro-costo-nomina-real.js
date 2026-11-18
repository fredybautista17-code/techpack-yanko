// ─── CENTRO DE COSTO — LO REAL DE NÓMINA POR PERSONA Y MES (sin pantalla) ───────────────────────────────────────────
// (2026-11-18, a pedido de Fredy) El histórico por año («Estado del año») leía solo los cierres diarios guardados: «Le pagamos» era el
// garantizado de la ficha ($2.000.000 para todos) y la «ayuda» era garantizado − producido (octubre de Zona Calor daba $2,1 M cuando lo que se
// puso en Nómina fue $202.395). Aquí se superpone, a cada persona de destajo con quincenas REALES en el mes, lo que de verdad pasó:
//   · Quincena con liquidación en Nómina: produjo = producción (o pago por días), horas = horas trabajadas, pagado = neto a pagar + descuentos de
//     bodega, ayuda = Ajuste manual positivo + Ayuda salario mínimo (la misma regla de «¿Cubro mis costos?» y de «Por área»).
//   · Quincena sin liquidación pero con el Excel de nómina subido: produjo = TOTAL de la izquierda, ayuda = AUXILIO, pagado = TOTAL final.
//   · Una quincena que no es ni lo uno ni lo otro NO cuenta para esa persona (igual que en «Por área»).
// La persona sin ninguna quincena real en el mes se deja como estaba (estimado del cierre diario) y se marca `real: false`.
import { AREAS_HISTORICO, claveArea } from "./centro-costo-historico-parser";
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const NINGUNA_REAL = "__ninguna__";

// Mapa `${idFicha}__${periodoId}` → fila del Excel subido, respetando las fichas elegidas/recordadas (alias) igual que «Por área».
export function mapaExcelPorFicha(nominaQuincena, alias) {
  const m = new Map();
  (nominaQuincena || []).forEach((d) => {
    if (d.tipoNomina && d.tipoNomina !== "Destajo") return;
    const decidida = d.nombreNorm && alias ? alias[d.nombreNorm] : undefined;
    const idFicha = decidida !== undefined ? (decidida === NINGUNA_REAL ? "" : decidida) : d.trabajadorId;
    if (idFicha && d.periodoId) m.set(`${idFicha}__${d.periodoId}`, d);
  });
  return m;
}

// Lo real de una persona en un mes ("AAAA-MM"). Devuelve null si ninguna de sus 2 quincenas es real.
export function realDePersonaMes(ficha, mk, { liquidaciones = [], ajustes = [], excel = new Map() } = {}) {
  if (!ficha || ficha.tipoNomina !== "Destajo" || ficha.pagoPorDia) return null;
  const esperadoQ = (num(ficha.sueldo) + num(ficha.auxilio)) / 2;
  let n = 0;
  let produjo = 0;
  let horas = 0;
  let pagado = 0;
  let ayuda = 0;
  let base = 0;
  let deLiq = 0;
  let deExcel = 0;
  ["Q1", "Q2"].forEach((q) => {
    const pid = `${mk}-${q}`;
    const liq = liquidaciones.find((l) => l.trabajadorId === ficha.id && l.periodoId === pid);
    if (liq) {
      const ajusteDoc = ajustes.find((x) => x.id === `${ficha.id}__${pid}`);
      const manual = liq.salarioMinimoGarantizado ? 0 : Math.max(0, num(ajusteDoc ? ajusteDoc.valor : liq.ajusteValor));
      const minimo = liq.salarioMinimoGarantizado ? num(liq.ayudaSalarioMinimo) : 0;
      produjo += liq.pagoPorDia ? num(liq.pagoDias) : num(liq.produccionReal);
      horas += num(liq.totalHoras);
      pagado += num(liq.netoAPagar) + num(liq.descuentoCobros);
      ayuda += manual + minimo;
      base += esperadoQ;
      n++;
      deLiq++;
      return;
    }
    const x = excel.get(`${ficha.id}__${pid}`);
    if (x) {
      produjo += num(x.producido);
      pagado += num(x.pagado);
      ayuda += num(x.ayuda);
      base += esperadoQ;
      n++;
      deExcel++;
    }
  });
  if (!n) return null;
  const fuente = deLiq && deExcel ? "liquidación y Excel" : deLiq ? "liquidación" : "Excel";
  return { produjo, horas, pagado, ayuda, base, quincenasReales: n, fuente };
}

// Superpone lo real a un Map "CLAVE|AAAA-MM" de cierres (salida de resolverCierres/unificar...). No toca CORTE ni modifica el mapa original.
// A cada persona con quincenas reales: valor = producción de lotes SIN horas, costo = pagado, y se agregan
// `produjo`, `horas`, `ayudaReal`, `base`, `real`, `quincenasReales`, `fuenteReal`. El valor y el costo del mes se ajustan por la diferencia.
// La entrada del mes recibe `nominaReal: { personas, conReal, ayuda, horas, pagado, produjo }`.
// Los meses que NO tienen cierres guardados (ej. enero a agosto, de antes de los cierres diarios) pero sí liquidaciones o Excel de nómina se
// crean con `soloNomina: true`, ubicando a cada persona en el área de su ficha (solo áreas del histórico, sin CORTE).
export function superponerNominaReal(mapa, { fichas = [], liquidaciones = [], ajustes = [], nominaQuincena = [], alias = {} } = {}) {
  const out = new Map();
  const fichaPorId = new Map((fichas || []).map((f) => [f.id, f]));
  const excel = mapaExcelPorFicha(nominaQuincena, alias);
  const ctx = { liquidaciones, ajustes, excel };
  const hechos = new Set(); // `${clave}|${mk}|${idFicha}` ya superpuestos desde los cierres
  (mapa || new Map()).forEach((r, key) => {
    const [clave, mk] = key.split("|");
    if (clave === "CORTE" || !r || !Array.isArray(r.trabajadores) || !r.trabajadores.length) { out.set(key, r); return; }
    let dValor = 0;
    let dCosto = 0;
    const tot = { personas: 0, conReal: 0, ayuda: 0, horas: 0, pagado: 0, produjo: 0 };
    const trabajadores = r.trabajadores.map((t) => {
      const ficha = fichaPorId.get(t.id);
      const real = realDePersonaMes(ficha, mk, ctx);
      if (ficha?.tipoNomina === "Destajo") tot.personas++;
      if (!real) return { ...t, real: false };
      hechos.add(`${key}|${t.id}`);
      const valor = real.produjo;
      dValor += valor - t.valor;
      dCosto += real.pagado - t.costo;
      tot.conReal++;
      tot.ayuda += real.ayuda;
      tot.horas += real.horas;
      tot.pagado += real.pagado;
      tot.produjo += real.produjo;
      return { ...t, valor, costo: real.pagado, produjo: real.produjo, horas: real.horas, ayudaReal: real.ayuda, base: real.base, real: true, quincenasReales: real.quincenasReales, fuenteReal: real.fuente };
    });
    if (!tot.conReal) { out.set(key, r); return; }
    out.set(key, { ...r, trabajadores, valor: r.valor + dValor, costo: r.costo + dCosto, nominaReal: tot });
  });
  // Meses con nómina real y sin cierre de esa persona: se agregan a su área (la de su ficha).
  const mesesPorFicha = new Map();
  const anotar = (id, pid) => {
    if (!id || !/^\d{4}-\d{2}-Q[12]$/.test(String(pid || ""))) return;
    if (!mesesPorFicha.has(id)) mesesPorFicha.set(id, new Set());
    mesesPorFicha.get(id).add(String(pid).slice(0, 7));
  };
  (liquidaciones || []).forEach((l) => anotar(l.trabajadorId, l.periodoId));
  excel.forEach((d, k) => anotar(k.split("__")[0], d.periodoId));
  mesesPorFicha.forEach((meses, id) => {
    const ficha = fichaPorId.get(id);
    if (!ficha || ficha.tipoNomina !== "Destajo" || !ficha.area) return;
    const clave = claveArea(ficha.area);
    if (clave === "CORTE" || !AREAS_HISTORICO.some((a) => a.clave === clave)) return;
    meses.forEach((mk) => {
      const key = `${clave}|${mk}`;
      if (hechos.has(`${key}|${id}`)) return;
      const real = realDePersonaMes(ficha, mk, ctx);
      if (!real) return;
      const base = out.get(key) || { valor: 0, costo: 0, dias: 0, esMes: true, soloNomina: true, trabajadores: [], diasDet: [], primerGuardado: "" };
      const tot = base.nominaReal ? { ...base.nominaReal } : { personas: 0, conReal: 0, ayuda: 0, horas: 0, pagado: 0, produjo: 0 };
      const valor = real.produjo;
      tot.personas++;
      tot.conReal++;
      tot.ayuda += real.ayuda;
      tot.horas += real.horas;
      tot.pagado += real.pagado;
      tot.produjo += real.produjo;
      const fila = { id, nombre: ficha.nombre || id, area: clave, valor, costo: real.pagado, produjo: real.produjo, horas: real.horas, ayudaReal: real.ayuda, base: real.base, real: true, quincenasReales: real.quincenasReales, fuenteReal: real.fuente };
      out.set(key, { ...base, trabajadores: [...base.trabajadores, fila], valor: base.valor + valor, costo: base.costo + real.pagado, nominaReal: tot });
    });
  });
  return out;
}

// Matriz «ayuda de nómina por mes» para el panel y su Excel: una fila por área (sin CORTE) y por mes la ayuda real puesta en Nómina y las horas.
// (2026-11-18, a pedido de Fredy) Las horas trabajadas no están en ningún lote: son ayuda. `total` = ayuda de Nómina + horas.
// datosArea: salida de construirDatosArea con los cierres reales ({ CLAVE: { meses: { 1..12: { nominaReal } } } }).
export function matrizAyudaPorMes(datosArea, claves) {
  return (claves || []).map((clave) => {
    const meses = {};
    let ayuda = 0;
    let horas = 0;
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const nr = datosArea?.[clave]?.meses?.[m]?.nominaReal;
      if (nr && nr.conReal > 0) {
        meses[m] = { ayuda: nr.ayuda, horas: nr.horas, total: nr.ayuda + nr.horas, conReal: nr.conReal, personas: nr.personas };
        ayuda += nr.ayuda;
        horas += nr.horas;
        total += nr.ayuda + nr.horas;
      }
    }
    return { clave, meses, ayuda, horas, total, mesesReales: Object.keys(meses).length };
  });
}

// Resultado de una fila del detalle: { ayuda, excedente } — real: ayuda = horas + lo puesto en Nómina (las horas no están en ningún lote),
// excedente = producción de lotes − garantizado; estimada: la diferencia contra el costo del cierre, como antes.
export function resultadoPersona(t) {
  if (t && t.real) return { ayuda: num(t.ayudaReal) + num(t.horas), excedente: Math.max(0, num(t.valor) - num(t.base)) };
  const bal = num(t && t.valor) - num(t && t.costo);
  return { ayuda: bal < 0 ? -bal : 0, excedente: bal > 0 ? bal : 0 };
}
