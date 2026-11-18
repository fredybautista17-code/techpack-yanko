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
import { enVacacionesDia, diasEntreISO } from "./meta-vacaciones";

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

// Costo del periodo de una persona descontando sus vacaciones: costoBase (como se calculaba) − Σ sueldo de esos días.
// Devuelve { costo, dias, reduccion }.
export function costoCorteConVacaciones(t, costoBase, periodo, fechas, ctx) {
  const [desde, hasta] = rangoPeriodoCorte(periodo, fechas);
  const dias = diasVacacionesDe(t, ctx, desde, hasta);
  const reduccion = dias.reduce((s, iso) => s + sueldoDelDia(t.sueldo, iso), 0);
  return { costo: Math.max(0, NUM(costoBase) - reduccion), dias, reduccion };
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

// Resumen para el aviso: [{ nombre, dias }] de quienes tuvieron vacaciones en el periodo.
export function resumenVacacionesCorte(trabajadores, periodo, fechas, ctx) {
  const [desde, hasta] = rangoPeriodoCorte(periodo, fechas);
  return (trabajadores || [])
    .map((t) => ({ nombre: t.nombre, dias: diasVacacionesDe(t, ctx, desde, hasta).length }))
    .filter((x) => x.dias > 0);
}
