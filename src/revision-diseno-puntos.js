// ─── Revisión de diseño: puntos de la lista (editables desde Administración) ──────────────────────────────────────
// (2026-11-26, a pedido de Fredy) Antes los 6 puntos estaban fijos en el código. Ahora viven en config/main.checklistRevision y se editan en
// Administración → «🔍 Revisión de diseño». Si la lista no existe o queda vacía se usan los 6 de siempre. Cada revisión guarda el TEXTO del
// punto: las revisiones viejas conservan sus nombres y la ficha de talleres cuenta por texto (un punto renombrado cuenta aparte).

export const PUNTOS_REVISION_BASE = ["Medidas y tallas", "Tela, color y caída", "Costuras y acabados", "Bordado, estampado y detalles", "Ajuste y patrón", "Etiquetas y empaque"];
export const MAX_PUNTOS_REVISION = 12;
export const MAX_LARGO_PUNTO = 60;

const limpio = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, MAX_LARGO_PUNTO);

// Quita vacíos y repetidos (sin importar mayúsculas/tildes) y topa en MAX_PUNTOS_REVISION
export function limpiarPuntos(lista) {
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const vistos = new Set();
  const out = [];
  (Array.isArray(lista) ? lista : []).forEach((x) => {
    const t = limpio(x);
    if (!t || vistos.has(norm(t))) return;
    vistos.add(norm(t));
    out.push(t);
  });
  return out.slice(0, MAX_PUNTOS_REVISION);
}

// Lista que usa el formulario de revisión: la configurada, o los 6 de siempre
export function puntosRevision(config) {
  const l = limpiarPuntos(config && config.checklistRevision);
  return l.length ? l : PUNTOS_REVISION_BASE.slice();
}

// → { ok, lista, motivo } al agregar un punto
export function agregarPunto(lista, texto) {
  const t = limpio(texto);
  if (!t) return { ok: false, lista, motivo: "Escribe el nombre del punto." };
  if ((lista || []).length >= MAX_PUNTOS_REVISION) return { ok: false, lista, motivo: `Máximo ${MAX_PUNTOS_REVISION} puntos.` };
  const nueva = limpiarPuntos([...(lista || []), t]);
  if (nueva.length === (lista || []).length) return { ok: false, lista, motivo: "Ese punto ya está en la lista." };
  return { ok: true, lista: nueva, motivo: "" };
}

export function renombrarPunto(lista, indice, texto) {
  const t = limpio(texto);
  const base = lista || [];
  if (indice < 0 || indice >= base.length) return { ok: false, lista: base, motivo: "" };
  if (!t) return { ok: false, lista: base, motivo: "El nombre no puede quedar vacío." };
  const otros = base.filter((_, i) => i !== indice);
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (otros.some((x) => norm(x) === norm(t))) return { ok: false, lista: base, motivo: "Ya hay otro punto con ese nombre." };
  return { ok: true, lista: base.map((x, i) => (i === indice ? t : x)), motivo: "" };
}

export function quitarPunto(lista, indice) {
  const base = lista || [];
  if (base.length <= 1) return { ok: false, lista: base, motivo: "Tiene que quedar al menos un punto." };
  return { ok: true, lista: base.filter((_, i) => i !== indice), motivo: "" };
}

export function moverPunto(lista, indice, delta) {
  const base = (lista || []).slice();
  const j = indice + delta;
  if (indice < 0 || indice >= base.length || j < 0 || j >= base.length) return base;
  [base[indice], base[j]] = [base[j], base[indice]];
  return base;
}
