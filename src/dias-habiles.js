// Días de trabajo de Industrias Yanko — UNA sola fuente para Cierre diario, Mi día, Centro de costo y Corte.
// (2026-11-05, a pedido de Fredy) Reglas:
//  · Domingo nunca se trabaja.
//  · Un festivo de Colombia (Ley Emiliani) no es día de trabajo.
//  · El SÁBADO se trabaja cuando el lunes siguiente es festivo (sábado puente, 7 a. m. a 1 p. m.) o cuando esa semana
//    tuvo un festivo de martes a viernes (se repone el sábado). Antes de SABADO_PUENTE_DESDE se conserva la regla vieja de
//    Nómina para no cambiar lo ya revisado. Misma lógica que sabadoSeTrabaja() de modulo-nomina.jsx.
//  · Para el cobro de sueldo / metas (esDiaDeTrabajoISO) el sábado solo cuenta desde SABADO_PUENTE_DESDE; antes los
//    sábados seguían siendo «no hábiles» (cuenta lo producido, no se cobra sueldo) como ya estaba.
const pad = (n) => String(n).padStart(2, "0");
export const SABADO_PUENTE_DESDE = "2026-10-10";
// Figura como festivo en la lista de Nómina (FESTIVOS_COLOMBIA_2026) aunque la Ley Emiliani no lo da: se respeta para ser consistentes.
const FESTIVOS_EXTRA_EMPRESA = ["2026-07-13"];
const utc = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
const dow = (iso) => utc(iso).getUTCDay(); // 0 domingo ... 6 sábado
function sumar(iso, n) {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function pascuaISO(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}
const _cache = {};
export function festivosColombia(anio) {
  if (_cache[anio]) return _cache[anio];
  const fest = new Set();
  const fijo = (mm, dd) => fest.add(`${anio}-${pad(mm)}-${pad(dd)}`);
  const alLunes = (iso) => { const w = dow(iso); return w === 1 ? iso : sumar(iso, (8 - w) % 7); };
  const lunes = (mm, dd) => fest.add(alLunes(`${anio}-${pad(mm)}-${pad(dd)}`));
  [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].forEach(([mm, dd]) => fijo(mm, dd));
  [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].forEach(([mm, dd]) => lunes(mm, dd));
  const p = pascuaISO(anio);
  fest.add(sumar(p, -3)); fest.add(sumar(p, -2)); // Jueves y Viernes Santo
  fest.add(alLunes(sumar(p, 39))); fest.add(alLunes(sumar(p, 60))); fest.add(alLunes(sumar(p, 68))); // Ascensión, Corpus, Sagrado Corazón
  FESTIVOS_EXTRA_EMPRESA.filter((x) => x.startsWith(`${anio}-`)).forEach((x) => fest.add(x));
  _cache[anio] = fest;
  return fest;
}
export function esFestivoColombiaISO(iso) {
  const s = String(iso).slice(0, 10);
  return festivosColombia(Number(s.slice(0, 4))).has(s);
}
// Sábado cuyo lunes siguiente es festivo: se trabaja.
export function esSabadoPuenteISO(iso) {
  return dow(iso) === 6 && String(iso) >= SABADO_PUENTE_DESDE && esFestivoColombiaISO(sumar(iso, 2));
}
// ¿Se trabaja este sábado? (misma regla que Nómina)
export function sabadoSeTrabajaISO(iso) {
  if (dow(iso) !== 6) return false;
  const w = dow(iso);
  const lunes = sumar(iso, w === 0 ? -6 : 1 - w);
  if (String(iso) < SABADO_PUENTE_DESDE) {
    for (let i = 0; i <= 5; i++) if (esFestivoColombiaISO(sumar(lunes, i))) return true; // regla vieja: cualquier festivo lunes-sábado de esa semana
    return false;
  }
  if (esSabadoPuenteISO(iso)) return true;
  for (let i = 1; i <= 4; i++) if (esFestivoColombiaISO(sumar(lunes, i))) return true; // festivo martes-viernes: se repone el sábado
  return false;
}
// (2026-11-05) «Días sin trabajar» del panel Administración → Notificaciones (config/correos_programacion.diasSinTrabajar): puentes u otros
// días que la empresa no trabaja. App.js los carga al abrir y los deja acá; un día de esta lista nunca es de trabajo.
let _sinTrabajar = new Set();
export function setDiasSinTrabajar(lista) {
  _sinTrabajar = new Set((Array.isArray(lista) ? lista : []).map((x) => String(x || "").slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)));
}
// ¿Es día de trabajo (se cobra sueldo / cuenta para metas)? Lunes-viernes no festivo ni de la lista «Días sin trabajar»; sábado trabajado desde SABADO_PUENTE_DESDE; domingo nunca.
export function esDiaDeTrabajoISO(iso) {
  if (_sinTrabajar.has(String(iso).slice(0, 10))) return false;
  const w = dow(iso);
  if (w === 0) return false;
  if (w === 6) return String(iso) >= SABADO_PUENTE_DESDE && sabadoSeTrabajaISO(iso);
  return !esFestivoColombiaISO(iso);
}
// Días de trabajo de un mes (1-12), opcionalmente solo hasta el día `hastaDia` inclusive.
export function diasDeTrabajoDelMes(anio, mes, hastaDia) {
  const ult = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const tope = hastaDia ? Math.min(hastaDia, ult) : ult;
  let n = 0;
  for (let d = 1; d <= tope; d++) if (esDiaDeTrabajoISO(`${anio}-${pad(mes)}-${pad(d)}`)) n++;
  return n;
}
