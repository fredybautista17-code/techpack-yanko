// ─── FINANCIERA · ¿Cuánto debo pagar al mes? (cálculo) ───────────────────────
// (2026-11-05, a pedido de Fredy) Junta lo que sale cada mes: nómina (neto), seguridad social, provisiones (cesantías, intereses, prima,
// vacaciones), gastos del Excel y cuotas (endeudamiento). Compara con el mes anterior y con el promedio ponderado de los 6 meses
// anteriores (el más viejo pesa 1 y el más reciente 6) y dice cuánto se necesita al mes con las cuotas vigentes.
// Todo es lectura: las únicas cosas que se escriben son las cuotas (colección financiera_cuotas), desde la pantalla de Endeudamiento.
import { totalGastos } from "./costos-general-calculo";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const TIPOS_NOMINA = ["Fiscal", "Fiscal Destajo", "Destajo", "Prestación de Servicios"];
export const MESES_PONDERADO = 6;

// Seguridad social: EPS + pensión (trabajador y empresa) + ARL + Caja. Solo la tienen las nóminas fiscales.
export function seguridadSocialDe(l) {
  return num(l.epsTrabajador) + num(l.pensionTrabajador) + num(l.pensionEmpleador) + num(l.arlEmpleador) + num(l.cajaCompensacionEmpleador) + num(l.epsEmpleador);
}
// Prestaciones de la quincena: cesantías + intereses + prima + vacaciones (Prestación de Servicios no tiene).
export function prestacionesDe(l) {
  return num(l.cesantiasPeriodo) + num(l.interesesPeriodo) + num(l.primaPeriodo) + num(l.vacacionesPeriodo);
}

// (2026-11-05, a pedido de Fredy) Detalle por persona de las provisiones de un tipo de nómina en el mes: una fila por trabajador
// (suma de sus quincenas confirmadas) con cesantías, intereses, prima y vacaciones, de mayor a menor.
export function personasProvisionDe(lista) {
  const m = new Map();
  (lista || []).forEach((l) => {
    const k = l.trabajadorId || l.nombre || l.id;
    if (!m.has(k)) m.set(k, { clave: k, nombre: l.nombre || String(k), quincenas: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0, total: 0 });
    const r = m.get(k);
    r.quincenas += 1;
    r.cesantias += num(l.cesantiasPeriodo);
    r.intereses += num(l.interesesPeriodo);
    r.prima += num(l.primaPeriodo);
    r.vacaciones += num(l.vacacionesPeriodo);
    r.total = r.cesantias + r.intereses + r.prima + r.vacaciones;
  });
  return [...m.values()].sort((a, b) => b.total - a.total);
}

// "AAAA-MM" ± n meses
export function sumarMes(ym, n) {
  const [a, m] = String(ym).split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
// Los 7 meses del gráfico: de ym-6 a ym.
export function mesesHasta(ym, atras = MESES_PONDERADO) {
  return Array.from({ length: atras + 1 }, (_, i) => sumarMes(ym, i - atras));
}

// ─── Cuotas ──────────────────────────────────────────────────────────────────
// cuota = { id, nombre, acreedor, valorMensual, diaPago, desde: "AAAA-MM", hasta: "AAAA-MM" | "", nota }
export function cuotaVigente(c, ym) {
  if (!c || !c.desde) return false;
  return c.desde <= ym && (!c.hasta || ym <= c.hasta);
}
export function cuotasDelMes(cuotas, ym) {
  const lista = (cuotas || []).filter((c) => cuotaVigente(c, ym));
  return { total: lista.reduce((s, c) => s + num(c.valorMensual), 0), lista };
}
// Cómo baja lo que se paga por cuotas a medida que terminan: [{ ym, total }] desde ym, solo cuando cambia.
export function escalonCuotas(cuotas, ym, max = 6) {
  const puntos = new Set([ym]);
  (cuotas || []).forEach((c) => { if (c.hasta && c.hasta >= ym) puntos.add(sumarMes(c.hasta, 1)); });
  const pasos = [];
  [...puntos].sort().forEach((p) => {
    const total = cuotasDelMes(cuotas, p).total;
    if (!pasos.length || pasos[pasos.length - 1].total !== total) pasos.push({ ym: p, total });
  });
  return pasos.slice(0, max);
}

// ─── Un mes ──────────────────────────────────────────────────────────────────
// liquidaciones: { "Fiscal": [...], "Fiscal Destajo": [...], "Destajo": [...], "Prestación de Servicios": [...] } (ya filtradas o no; aquí se filtra por mes)
// gastosDocs: [{ id: "AAAA-MM", lineas: [...] }] (costos_gastos_mes)
export function gastosDelMes(gastosDocs, ym) {
  const docs = gastosDocs || [];
  const propio = docs.find((g) => g.id === ym);
  if (propio) return { total: totalGastos(propio.lineas || []).total, origen: "guardado", deMes: ym, lineas: (propio.lineas || []).filter((l) => l.incluir) };
  const anterior = docs.filter((g) => g.id < ym).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  if (anterior) return { total: totalGastos(anterior.lineas || []).total, origen: "anterior", deMes: anterior.id, lineas: (anterior.lineas || []).filter((l) => l.incluir) };
  return { total: 0, origen: "ninguno", deMes: "", lineas: [] };
}

export function rubrosDelMes({ ym, liquidaciones, gastosDocs, cuotas }) {
  const porTipo = {};
  TIPOS_NOMINA.forEach((tipo) => {
    const lista = ((liquidaciones || {})[tipo] || []).filter((l) => String(l.periodoId || "").startsWith(`${ym}-`));
    const quincenas = [...new Set(lista.map((l) => String(l.periodoId).slice(-2)))].sort();
    porTipo[tipo] = {
      tipo, personas: new Set(lista.map((l) => l.trabajadorId || l.nombre || l.id)).size, quincenas,
      neto: lista.reduce((s, l) => s + num(l.netoAPagar), 0),
      seguridad: lista.reduce((s, l) => s + seguridadSocialDe(l), 0),
      prestaciones: lista.reduce((s, l) => s + prestacionesDe(l), 0),
      cesantias: lista.reduce((s, l) => s + num(l.cesantiasPeriodo), 0),
      intereses: lista.reduce((s, l) => s + num(l.interesesPeriodo), 0),
      prima: lista.reduce((s, l) => s + num(l.primaPeriodo), 0),
      vacaciones: lista.reduce((s, l) => s + num(l.vacacionesPeriodo), 0),
      personasLista: personasProvisionDe(lista),
    };
  });
  const tipos = Object.values(porTipo);
  const conDatos = tipos.filter((t) => t.quincenas.length > 0);
  const faltan = conDatos.filter((t) => t.quincenas.length < 2).map((t) => ({ tipo: t.tipo, falta: ["Q1", "Q2"].filter((q) => !t.quincenas.includes(q)) }));
  const g = gastosDelMes(gastosDocs, ym);
  const c = cuotasDelMes(cuotas, ym);
  const nomina = tipos.reduce((s, t) => s + t.neto, 0);
  const seguridad = tipos.reduce((s, t) => s + t.seguridad, 0);
  const provisiones = tipos.reduce((s, t) => s + t.prestaciones, 0);
  return {
    ym, porTipo, nomina, seguridad, provisiones, gastos: g.total, cuotas: c.total,
    total: nomina + seguridad + provisiones + g.total + c.total,
    gastosInfo: g, cuotasLista: c.lista,
    hayDatos: conDatos.length > 0,
    completo: conDatos.length > 0 && faltan.length === 0,
    faltan,
    quincenasConfirmadas: conDatos.length ? Math.min(...conDatos.map((t) => t.quincenas.length)) : 0,
  };
}

// ─── Promedio ponderado de los 6 meses anteriores ────────────────────────────
// meses: rubrosDelMes de ym-6 … ym-1 (del más viejo al más reciente). Solo cuentan los meses completos (todas sus quincenas confirmadas).
export function ponderadoDe(meses) {
  const pesados = meses.map((m, i) => ({ m, w: i + 1 })).filter((x) => x.m.completo);
  // Los gastos solo se promedian en los meses que ya tienen gastos cargados (un mes sin ninguno no es «cero gastos», es dato que falta).
  const conGastos = pesados.filter((x) => x.m.gastosInfo.origen !== "ninguno");
  const prom = (lista, k) => { const sw = lista.reduce((s, x) => s + x.w, 0); return sw ? lista.reduce((s, x) => s + x.m[k] * x.w, 0) / sw : 0; };
  const out = { nomina: prom(pesados, "nomina"), seguridad: prom(pesados, "seguridad"), provisiones: prom(pesados, "provisiones"), gastos: prom(conGastos, "gastos"), cuotas: prom(pesados, "cuotas") };
  out.total = out.nomina + out.seguridad + out.provisiones + out.gastos + out.cuotas;
  out.operacion = out.nomina + out.seguridad + out.provisiones + out.gastos;
  out.mesesUsados = pesados.length;
  out.mesesGastos = conGastos.length;
  out.mesesPosibles = meses.length;
  out.meses = pesados.map((x) => x.m.ym);
  return out;
}

// Todo junto para la pantalla.
export function cuantoPagarMes({ ym, liquidaciones, gastosDocs, cuotas }) {
  const lista = mesesHasta(ym).map((m) => rubrosDelMes({ ym: m, liquidaciones, gastosDocs, cuotas }));
  const actual = lista[lista.length - 1];
  const anterior = lista[lista.length - 2];
  const previos = lista.slice(0, -1);
  const pond = ponderadoDe(previos);
  const cuotasHoy = actual.cuotas;
  return { ym, lista, actual, anterior, ponderado: pond, necesito: pond.operacion + cuotasHoy, cuotasHoy, escalon: escalonCuotas(cuotas, ym) };
}
