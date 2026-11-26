// ─── COMBINACIONES DE LA PRENDA · lógica pura (sin Firebase ni React) ───────────────────────────────────────────
// (2026-11-26, a pedido de Fredy) Cada referencia tiene un DIBUJO PLANO donde la diseñadora pinta siempre igual:
//   BLANCO = Material 1 · LILA = Material 2 · GRIS = Material 3.
// Este archivo lee ese dibujo (píxeles) y separa las zonas, calcula cuánto ocupa cada una, verifica que el dibujo sirva y lo vuelve a pintar con
// los colores escogidos. Las imágenes de la referencia viven en la colección ficha_prendas/{referencia normalizada}:
//   { referencia, fichaImg (foto con los datos y las telas), planoImg (dibujo plano), subidoPor, subidoEn }  (imágenes como JPEG comprimido en texto)
import { normRef } from "./ficha-inicio-calculo";

export const COL_PRENDAS = "ficha_prendas";
export const idPrenda = (referencia) => normRef(referencia);

// Material 1, 2 y 3: cómo se llaman, qué color tienen en el dibujo plano y qué luminosidad base tiene ese color (para conservar costuras y sombras)
export const MATERIALES = [
  { n: 1, nombre: "Material 1", color: "blanco", base: 255 },
  { n: 2, nombre: "Material 2", color: "lila", base: 222 },
  { n: 3, nombre: "Material 3", color: "gris", base: 204 },
];

// Telas que sugiere la ficha: «AMORELA Y BOSSTEX» → ["Amorela", "Bosstex"]
export function telasSugeridas(texto) {
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  const out = [];
  String(texto || "").split(/\s*(?:,|;|\/|\+|\by\b|\be\b|&)\s*/i).map((t) => t.trim()).filter(Boolean).forEach((t) => { const c = cap(t); if (!out.includes(c)) out.push(c); });
  return out;
}

// Detecta las zonas en los píxeles RGBA de un dibujo plano.
//   lab[i]: -2 fondo · -1 línea/borde sin zona · 0 blanco (Material 1) · 1 lila (Material 2) · 2 gris (Material 3)
//   lum[i]: luminosidad del píxel;  pct: % del área de la prenda por material;  px: cantidad de píxeles por material
export function detectarZonas(rgba, w, h) {
  const n = w * h;
  const lab = new Int8Array(n).fill(-1);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[4 * i], g = rgba[4 * i + 1], b = rgba[4 * i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mn > 236) lab[i] = 0; // blanco: fondo o Material 1 (el fondo se separa abajo)
    else if (b - g > 16 && b >= r && r - g > 4 && mx > 185) lab[i] = 1; // lila
    else if (mx - mn < 12 && mx > 160 && mx < 228) lab[i] = 2; // gris
  }
  // el fondo es el blanco que toca el borde de la imagen
  const fondo = new Uint8Array(n);
  const pila = [];
  const meter = (i) => { if (!fondo[i] && lab[i] === 0) { fondo[i] = 1; pila.push(i); } };
  for (let x = 0; x < w; x++) { meter(x); meter((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { meter(y * w); meter(y * w + w - 1); }
  while (pila.length) {
    const i = pila.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) meter(i - 1);
    if (x < w - 1) meter(i + 1);
    if (y > 0) meter(i - w);
    if (y < h - 1) meter(i + w);
  }
  for (let i = 0; i < n; i++) if (fondo[i]) lab[i] = -2;
  // los píxeles suaves de borde (ni oscuros ni clasificados) heredan la zona vecina
  for (let it = 0; it < 3; it++) {
    const nl = lab.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (lab[i] !== -1 || lum[i] < 95) continue;
        for (const j of [i - 1, i + 1, i - w, i + w]) { if (lab[j] >= 0) { nl[i] = lab[j]; break; } }
      }
    }
    lab.set(nl);
  }
  const px = [0, 0, 0];
  for (let i = 0; i < n; i++) if (lab[i] >= 0) px[lab[i]] += 1;
  const tot = px[0] + px[1] + px[2];
  return { w, h, lab, lum, px, total: tot, pct: px.map((v) => (tot ? (v / tot) * 100 : 0)) };
}

// Materiales que el dibujo realmente tiene (al menos 0,5 % de la prenda)
export const materialesActivos = (det) => [0, 1, 2].filter((i) => det && det.pct[i] >= 0.5);

// ¿Sirve este dibujo? Devuelve { ok, activos, avisos[] }
export function verificarDibujo(det) {
  if (!det || !det.total) return { ok: false, activos: [], avisos: ["No encontré una prenda en la imagen. Sube el dibujo plano (fondo blanco, prenda con sus líneas)."] };
  const activos = materialesActivos(det);
  const avisos = [];
  if (det.total < det.w * det.h * 0.02) avisos.push("La prenda se ve muy pequeña en la imagen; sube un dibujo más grande.");
  if (!activos.includes(0)) avisos.push("No detecté el BLANCO (Material 1) en el dibujo: el cuerpo debe ir en blanco.");
  if (activos.length < 2) avisos.push("Solo detecté una zona de color. Revisa que el dibujo use blanco, lila y/o gris para separar los materiales.");
  return { ok: activos.length > 0 && det.total >= det.w * det.h * 0.02 && activos.includes(0), activos, avisos };
}

// Pinta el dibujo: colores = [hex|null, hex|null, hex|null] por material; foco = material resaltado (los demás se aclaran) o -1 para ninguno.
// Las zonas sin color se rayan en gris claro. Devuelve los píxeles RGBA nuevos.
export function pintarZonas(rgba, det, colores, foco) {
  const { w, h, lab, lum } = det;
  const out = new Uint8ClampedArray(rgba.length);
  const cols = [0, 1, 2].map((i) => { const c = (colores || [])[i]; return /^#?[0-9a-f]{6}$/i.test(String(c || "")) ? [1, 3, 5].map((k) => parseInt(String(c).replace("#", "").substr(k - 1, 2), 16)) : null; });
  const hayFoco = foco !== undefined && foco !== null && foco >= 0;
  for (let i = 0; i < w * h; i++) {
    const l = lab[i], k = 4 * i;
    let r = rgba[k], g = rgba[k + 1], b = rgba[k + 2];
    if (l >= 0) {
      const f = Math.min(1.06, lum[i] / MATERIALES[l].base);
      const c = cols[l];
      if (c) { r = c[0] * f; g = c[1] * f; b = c[2] * f; }
      else { const s = ((i / w | 0) + (i % w)) % 14 < 7 ? 236 : 250; r = g = b = s * f; }
      if (hayFoco && l !== foco) { r = r * 0.42 + 255 * 0.58; g = g * 0.42 + 255 * 0.58; b = b * 0.42 + 255 * 0.58; }
    }
    out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = 255;
  }
  return out;
}

// Zona (0..2) bajo el punto (x, y), buscando hasta 6 píxeles alrededor; -1 si no hay
export function zonaEnPunto(det, x, y) {
  const { w, h, lab } = det;
  for (let d = 0; d <= 6; d++) {
    for (let dx = -d; dx <= d; dx++) {
      for (let dy = -d; dy <= d; dy++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        if (lab[yy * w + xx] >= 0) return lab[yy * w + xx];
      }
    }
  }
  return -1;
}

// ─── Filas de combinaciones (cada fila = un color de la prenda con el color de cada material) ───
export const filaVacia = (id) => ({ id, m: [null, null, null] });
export const filaCompleta = (fila, activos) => (activos && activos.length ? activos : [0]).every((i) => !!((fila.m || [])[i] && fila.m[i].id));
export function nombreFila(fila, activos) {
  const act = activos && activos.length ? activos : [0, 1, 2];
  const nombres = act.map((i) => (fila.m || [])[i]).filter(Boolean).map((c) => c.nombre);
  return nombres.filter((v, i, a) => a.indexOf(v) === i).join(" / ") || "Sin colores";
}
// Los colores de la ficha (los que siguen hacia curva, cantidades y empaque) = el color del primer material de cada fila, sin repetir
export function coloresDeFilas(filas, activos) {
  const primero = (activos && activos.length ? activos : [0])[0];
  const vistos = new Set();
  const out = [];
  (filas || []).forEach((fila) => { const c = (fila.m || [])[primero]; if (c && c.id && !vistos.has(c.id)) { vistos.add(c.id); out.push(c); } });
  return out;
}

// Recuadro que ocupa la prenda dentro de la imagen (para no mostrar los márgenes blancos): { x, y, w, h } con un margen en píxeles
export function recortarContenido(rgba, w, h, margen = 14) {
  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 4 * (y * w + x);
      if (Math.min(rgba[k], rgba[k + 1], rgba[k + 2]) < 225) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    }
  }
  if (x2 < 0) return { x: 0, y: 0, w, h };
  x1 = Math.max(0, x1 - margen); y1 = Math.max(0, y1 - margen); x2 = Math.min(w - 1, x2 + margen); y2 = Math.min(h - 1, y2 + margen);
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}
