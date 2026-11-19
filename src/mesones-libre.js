// (2026-11-19, a pedido de Fredy) Disponibilidad de Mesones: donde no hay corte programado se dice «Libre» con su duración,
// y cada lote tiene su propio color en la línea de tiempo. Funciones puras (solo cálculo), sin Firestore.

// Ventana visible del timeline: 06:00 a 20:00 (en minutos desde medianoche).
export const MESON_LIBRE_INICIO_MIN = 6 * 60;
export const MESON_LIBRE_FIN_MIN = 20 * 60;

// «5 h», «2 h 10», «45 min». Menos de 1 minuto → «0 min».
export function fmtDuracionMin(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r}`;
}

export const fmtHoraMin = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

// Huecos sin corte dentro de la ventana. `bloques` = [{ ini, fin }] en minutos (pueden traslaparse o salirse de la ventana).
// Devuelve [{ ini, fin, min }] ordenados, sin huecos menores a `minimo` minutos.
export function huecosLibres(bloques, desde = MESON_LIBRE_INICIO_MIN, hasta = MESON_LIBRE_FIN_MIN, minimo = 5) {
  const validos = (bloques || [])
    .filter((b) => b && Number.isFinite(b.ini) && Number.isFinite(b.fin) && b.fin > b.ini)
    .map((b) => ({ ini: Math.max(desde, b.ini), fin: Math.min(hasta, b.fin) }))
    .filter((b) => b.fin > b.ini)
    .sort((a, b) => a.ini - b.ini);
  const out = [];
  let cur = desde;
  validos.forEach((b) => {
    if (b.ini - cur >= minimo) out.push({ ini: cur, fin: b.ini, min: b.ini - cur });
    cur = Math.max(cur, b.fin);
  });
  if (hasta - cur >= minimo) out.push({ ini: cur, fin: hasta, min: hasta - cur });
  return out;
}

export const totalLibreMin = (huecos) => (huecos || []).reduce((s, h) => s + h.min, 0);

// Color por lote/referencia: siempre el mismo para la misma referencia (texto blanco legible encima).
const PALETA_LOTES = ["#3D6B9E", "#6B4FA0", "#2D9E6B", "#C47C1A", "#B04A6B", "#2F8A9E", "#8A6D2F", "#5B6B3A"];
export function colorDeLote(ref) {
  const s = String(ref == null ? "" : ref);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETA_LOTES[h % PALETA_LOTES.length];
}

// «Meson 2» → «Mesón 2» (en la configuración unos nombres traen tilde y otros no).
export const nombreMesonBonito = (n) => String(n == null ? "" : n).replace(/^meson\b/i, "Mesón");
