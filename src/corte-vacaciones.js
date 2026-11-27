// ─── CORTE: LAS VACACIONES NO CUENTAN EN EL COSTO / META DEL DÍA ─────────────────────────────────────────────
// (2026-11-18, a pedido de Fredy) En Centro de Costo de Corte la «meta del día» es que lo cortado cubra el sueldo del
// día del equipo. Quien está de vacaciones ese día no corta, así que su sueldo de ese día no cuenta contra el equipo:
//   costo del día de una persona = sueldo ÷ días de trabajo del mes, y 0 si ese día tiene una ausencia «Vacaciones».
// Mes y Año se calculan igual que siempre (mes = sueldo, año = sueldo × 12) y se les RESTA el sueldo de los días de
// trabajo que la persona estuvo de vacaciones dentro del periodo.
// Los trabajadores de Corte viven en corte_config (nombres cortos) y las ausencias en Nómina (por ficha): se cruzan por
// nombre (exacto, o las palabras del nombre corto dentro del largo, ver mismoNombre). Solo lectura.
import { normTexto } from "./centro-costo-historico-parser";
import { mismoNombre } from "./corte-equipos";
import { esDiaDeTrabajoISO, diasDeTrabajoDelMes } from "./dias-habiles";
import { enVacacionesDia, tipoAusenciaDia, diasEntreISO } from "./meta-vacaciones";

const NUM = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pad = (n) => String(n).padStart(2, "0");

// Ficha de Nómina de alguien de Corte: coincidencia exacta o, si no, la única ficha que coincide por palabras.
// Devuelve { id, nombre } o null (sin ficha o varias posibles: no se adivina).
export function fichaDeCorte(nombre, fichas) {
  const k = normTexto(nombre);
  if (!k) return null;
  const lista = fichas || [];
  const exactas = lista.filter((f) => normTexto(f.nombre) === k);
  if (exactas.length === 1) return exactas[0];
  if (exactas.length > 1) return null;
  const parecidas = lista.filter((f) => mismoNombre(f.nombre, nombre));
  return parecidas.length === 1 ? parecidas[0] : null;
}

// Rango [desde, hasta] del periodo: Día / Mes / Año.
export function rangoPeriodoCorte(periodo, { fechaDia, mesSel, anioSel }) {
  if (periodo === "dia") return [fechaDia, fechaDia];
  if (periodo === "anio") return [`${anioSel}-01-01`, `${anioSel}-12-31`];
  const ult = new Date(Date.UTC(anioSel, mesSel, 0)).getUTCDate();
  return [`${anioSel}-${pad(mesSel)}-01`, `${anioSel}-${pad(mesSel)}-${pad(ult)}`];
}

// Días de trabajo en que esa persona estuvo de vacaciones dentro de [desde, hasta] (y antes de su fecha de salida).
export function diasVacacionesDe(t, ctx, desde, hasta) {
  const ficha = fichaDeCorte(t.nombre, ctx && ctx.fichas);
  if (!ficha) return [];
  let tope = hasta;
  if (t.fechaSalida && String(t.fechaSalida).slice(0, 10) < tope) tope = String(t.fechaSalida).slice(0, 10);
  return diasEntreISO(desde, tope, esDiaDeTrabajoISO).filter((iso) => enVacacionesDia(ctx.ausencias, ficha.id, iso));
}

// Sueldo de un día de trabajo del mes de `iso`.
export const sueldoDelDia = (sueldo, iso) => NUM(sueldo) / (diasDeTrabajoDelMes(Number(iso.slice(0, 4)), Number(iso.slice(5, 7))) || 1);

// (2026-11-27) Los días de ausencia separados por cómo se pagan: vac = vacaciones (SE PAGAN), lic = licencia no remunerada (NO se paga).
export function diasAusenciaDe(t, ctx, desde, hasta) {
  const vac = [], lic = [];
  const ficha = fichaDeCorte(t.nombre, ctx && ctx.fichas);
  if (!ficha) return { vac, lic };
  let tope = hasta;
  if (t.fechaSalida && String(t.fechaSalida).slice(0, 10) < tope) tope = String(t.fechaSalida).slice(0, 10);
  diasEntreISO(desde, tope, esDiaDeTrabajoISO).forEach((iso) => {
    const tipo = tipoAusenciaDia(ctx.ausencias, ficha.id, iso);
    if (tipo === "licencia") lic.push(iso); else if (tipo === "vacaciones") vac.push(iso);
  });
  return { vac, lic };
}

// Costo del periodo de una persona descontando sus ausencias: costoBase (como se calculaba) − Σ sueldo de esos días.
// Devuelve { costo, dias, reduccion } (costo = costo de DÍAS TRABAJADOS: sin vacaciones ni licencia) y, además,
//   diasVac / diasLic y reduccionVac / reduccionLic por separado, y
//   costoPagado = costoBase − SOLO la licencia no remunerada (la nómina real: las vacaciones sí se pagan).
export function costoCorteConVacaciones(t, costoBase, periodo, fechas, ctx) {
  const [desde, hasta] = rangoPeriodoCorte(periodo, fechas);
  const { vac, lic } = diasAusenciaDe(t, ctx, desde, hasta);
  const suma = (arr) => arr.reduce((s, iso) => s + sueldoDelDia(t.sueldo, iso), 0);
  const reduccionVac = suma(vac), reduccionLic = suma(lic);
  const reduccion = reduccionVac + reduccionLic;
  return {
    costo: Math.max(0, NUM(costoBase) - reduccion), dias: vac.concat(lic).sort(), reduccion,
    diasVac: vac, diasLic: lic, reduccionVac, reduccionLic,
    costoPagado: Math.max(0, NUM(costoBase) - reduccionLic),
  };
}

// Costo de nómina de Corte de UN día (para la tira de 30 días): suma de sueldo ÷ días hábiles de quienes no están de vacaciones.
export function costoDiaCorte(trabajadores, iso, ctx, diasHabilesMes) {
  let costo = 0;
  const enVac = [];
  (trabajadores || []).filter((t) => !t.fechaSalida || iso <= String(t.fechaSalida).slice(0, 10)).forEach((t) => {
    const co = NUM(t.sueldo) / (diasHabilesMes || 1);
    if (diasVacacionesDe(t, ctx, iso, iso).length) { enVac.push(t.nombre); return; }
    costo += co;
  });
  return { costo, enVacaciones: enVac };
}

// Para el Cierre diario: a cada trabajador le agrega `diasVacaciones` (Set de días ISO de trabajo en vacaciones, del mes
// anterior al siguiente al elegido) para que corteDelDia ponga su costo del día en 0.
export function conDiasVacaciones(trabajadores, ctx, desde, hasta) {
  return (trabajadores || []).map((t) => {
    const dias = diasVacacionesDe(t, ctx, desde, hasta);
    return dias.length ? { ...t, diasVacaciones: new Set(dias) } : t;
  });
}

// Nombres de Corte sin ficha de Nómina (no se les puede detectar las vacaciones).
export function corteSinFicha(trabajadores, fichas) {
  return (trabajadores || []).filter((t) => NUM(t.sueldo) > 0 && !fichaDeCorte(t.nombre, fichas)).map((t) => t.nombre);
}

// Resumen para el aviso: [{ nombre, dias, diasVac, diasLic }] de quienes tuvieron vacaciones o licencia en el periodo.
export function resumenVacacionesCorte(trabajadores, periodo, fechas, ctx) {
  const [desde, hasta] = rangoPeriodoCorte(periodo, fechas);
  return (trabajadores || [])
    .map((t) => { const { vac, lic } = diasAusenciaDe(t, ctx, desde, hasta); return { nombre: t.nombre, dias: vac.length + lic.length, diasVac: vac.length, diasLic: lic.length }; })
    .filter((x) => x.dias > 0);
}

// (2026-11-27) Las DOS lecturas del costo de Corte: «días trabajados» (lo que mide la meta) y «pagado» (la nómina real: las vacaciones sí se pagan).
// filas: las de la pantalla, con costo, costoPagado y vacReduccionVac / vacReduccionLic. Solo se muestran cuando hay vacaciones pagadas (hay = true).
export function lecturaCostoPagado(filas, totalIngreso) {
  const f = filas || [];
  const reduccionVac = f.reduce((s, x) => s + NUM(x.vacReduccionVac), 0);
  const reduccionLic = f.reduce((s, x) => s + NUM(x.vacReduccionLic), 0);
  const costoPagado = f.reduce((s, x) => s + NUM(x.costoPagado != null ? x.costoPagado : x.costo), 0);
  const ingreso = NUM(totalIngreso);
  return {
    hay: reduccionVac > 0.5, reduccionVac, reduccionLic, costoPagado,
    resultado: ingreso - costoPagado,
    pct: costoPagado > 0 ? (ingreso / costoPagado) * 100 : 0,
    falta: Math.max(0, costoPagado - ingreso),
  };
}

// Texto del chip de una fila: «6 días de vacaciones · 2 días sin pago (licencia)».
export function textoDiasAusencia(f) {
  const v = NUM(f.vacDiasVac), l = NUM(f.vacDiasLic);
  if (!v && !l) { const n = NUM(f.vacDias); return n ? `${n} ${n === 1 ? "día" : "días"} de vacaciones` : ""; }
  const partes = [];
  if (v) partes.push(`${v} ${v === 1 ? "día" : "días"} de vacaciones`);
  if (l) partes.push(`${l} ${l === 1 ? "día" : "días"} de licencia sin pago`);
  return partes.join(" · ");
}

// ─── ESTADO DEL AÑO (Corte): costo PAGADO por mes ───────────────────────────────────────────────────────────
// (2026-11-27) El costo de cada mes pasa a ser el costo PAGADO: la nómina completa menos SOLO la licencia no remunerada (las vacaciones
// sí se pagan). Los meses cerrados («cierre del mes (ATLAS)») no se tocan en la base: el descuento se aplica al mostrarlos.
// Antes del primer mes con Ausencias en ATLAS no se sabe qué hubo: esos meses quedan como estaban.
const ultimoDia = (mk) => new Date(Date.UTC(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0)).getUTCDate();

// Mes más antiguo (AAAA-MM) con una ausencia de vacaciones / licencia registrada; null si no hay.
export function primerMesAusencias(ausencias) {
  let min = null;
  (ausencias || []).forEach((a) => { const mk = String((a && a.fechaInicio) || "").slice(0, 7); if (/^\d{4}-\d{2}$/.test(mk) && (!min || mk < min)) min = mk; });
  return min;
}

// Lo que bajó la licencia no remunerada del sueldo de UNA persona en el mes mk.
export function reduccionLicenciaPersonaMes(t, ctx, mk) {
  const { lic } = diasAusenciaDe(t, ctx, `${mk}-01`, `${mk}-${pad(ultimoDia(mk))}`);
  return lic.reduce((s, iso) => s + sueldoDelDia(t.sueldo, iso), 0);
}

// Vacaciones y licencia de todo el equipo en el mes mk: { diasVac, diasLic, reduccionVac, reduccionLic }.
export function ausenciasMesCorte(trabajadores, mk, ctx) {
  const r = { diasVac: 0, diasLic: 0, reduccionVac: 0, reduccionLic: 0 };
  (trabajadores || []).filter((t) => !t.fechaSalida || mk <= String(t.fechaSalida).slice(0, 7)).forEach((t) => {
    const { vac, lic } = diasAusenciaDe(t, ctx, `${mk}-01`, `${mk}-${pad(ultimoDia(mk))}`);
    r.diasVac += vac.length; r.diasLic += lic.length;
    r.reduccionVac += vac.reduce((s, iso) => s + sueldoDelDia(t.sueldo, iso), 0);
    r.reduccionLic += lic.reduce((s, iso) => s + sueldoDelDia(t.sueldo, iso), 0);
  });
  return r;
}

// dato = { meses:{1..12:{valor,costo,fuente,...}}, valor, costo, cobertura, mesesConDato } de CORTE → mismo dato con el costo pagado.
// Solo ajusta los meses de ATLAS (fuente "vivo"); el histórico cargado y los cierres de otras áreas no se tocan.
// Devuelve { ...dato, meses, costo, cobertura, ajustado, mesesSinAusencias, primerMes }.
export function ajustarCostoPagadoCorte(dato, anio, trabajadores, ctx) {
  const primerMes = primerMesAusencias(ctx && ctx.ausencias);
  if (!dato || !primerMes) return { ...(dato || {}), ajustado: false, mesesSinAusencias: [], primerMes };
  const meses = {};
  const mesesSinAusencias = [];
  let ajustado = false;
  Object.keys(dato.meses || {}).forEach((k) => {
    const f = dato.meses[k];
    const mk = `${anio}-${pad(Number(k))}`;
    if (!f || f.fuente !== "vivo") { meses[k] = f; return; }
    if (mk < primerMes) { meses[k] = f; mesesSinAusencias.push(Number(k)); return; }
    const a = ausenciasMesCorte(trabajadores, mk, ctx);
    ajustado = true;
    meses[k] = { ...f, costoTrabajado: f.costo, costo: Math.max(0, NUM(f.costo) - a.reduccionLic), ausencias: a };
  });
  const lista = Object.values(meses).filter(Boolean);
  const costo = lista.reduce((s, x) => s + NUM(x.costo), 0);
  const valor = lista.reduce((s, x) => s + NUM(x.valor), 0);
  return { ...dato, meses, valor, costo, cobertura: costo > 0 ? (valor / costo) * 100 : 0, ajustado, mesesSinAusencias, primerMes };
}
