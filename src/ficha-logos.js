// ─── LOGOS · interpretar el texto que se lee de la foto de un logo/vinilo ──────────────────────────────────────
// (2026-11-26, a pedido de Fredy) «Subir logos desde foto»: el navegador lee el texto de la foto (OCR) y aquí se convierte en
// nombre, código y tipo. Todo es texto puro para poder probarlo sin pantalla. Lo leído SIEMPRE se muestra para corregir antes de guardar.
import { plano, normCod, TIPOS_VINILO } from "./ficha-inicio-calculo";

const TIPOS_CLAVE = [
  [/\bdtf\b/i, "DTF"],
  [/sublim/i, "Sublimación"],
  [/bordad/i, "Bordado"],
  [/\bvinil/i, "Vinilo"],
];

// Nombre del archivo sin extensión ni guiones: «logo_kamila-pecho.jpg» → «logo kamila pecho»
export function nombreDeArchivo(archivo) {
  return String(archivo || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

// Quita el ruido típico del OCR: símbolos sueltos, líneas casi sin letras.
export function limpiarLineas(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\p{L}\p{N} .,#:/&'()+\-_]/gu, " ").replace(/\s+/g, " ").trim())
    .filter((l) => {
      const letras = (l.match(/\p{L}/gu) || []).length;
      const digitos = (l.match(/\p{N}/gu) || []).length;
      const util = (l.match(/[\p{L}\p{N}]/gu) || []).length;
      return util >= 3 && (letras >= 2 || digitos >= 3) && util / l.length >= 0.55;
    });
}

const RE_CODIGO_ROTULADO = /(?:\bc[oó]d(?:igo)?\b|\bref(?:erencia)?\b|\bn[oº°]\b|\bn[uú]m(?:ero)?\b|#)\.?\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{1,})/i;
const RE_CODIGO_SUELTO = /\b([A-Za-z]{0,4}-?\d{2,}[A-Za-z0-9\-]*)\b/;

// → { nombre, codigo, tipo|null, deArchivo }   (tipo null = no se supo; la pantalla usa el primero de la lista)
export function interpretarTextoLogo(texto, archivo) {
  const lineas = limpiarLineas(texto);
  const todo = lineas.join(" \n ");
  let tipo = null;
  for (const [re, t] of TIPOS_CLAVE) if (re.test(todo)) { tipo = t; break; }

  let codigo = "";
  let resto = lineas.slice();
  const rot = RE_CODIGO_ROTULADO.exec(todo);
  if (rot) {
    codigo = rot[1].toUpperCase();
    resto = resto.map((l) => l.replace(RE_CODIGO_ROTULADO, " ").replace(/\s+/g, " ").trim());
  } else {
    const suelto = RE_CODIGO_SUELTO.exec(todo);
    if (suelto && /\d/.test(suelto[1])) {
      codigo = suelto[1].toUpperCase();
      resto = resto.map((l) => l.replace(suelto[1], " ").replace(/\s+/g, " ").trim());
    }
  }
  // fuera las palabras del tipo del nombre y las líneas que quedaron vacías o sin letras
  const sinTipo = resto.map((l) => TIPOS_CLAVE.reduce((s, [re]) => s.replace(new RegExp(re.source, "gi"), " "), l).replace(/\s+/g, " ").trim().replace(/^[-:.,/\s]+|[-:.,/\s]+$/g, ""));
  const utiles = sinTipo.filter((l) => (l.match(/\p{L}/gu) || []).length >= 2);
  let nombre = "";
  if (utiles.length) {
    nombre = utiles[0];
    for (let i = 1; i < utiles.length && (nombre + " " + utiles[i]).length <= 48 && i < 3; i++) nombre += " " + utiles[i];
  }
  const deArchivo = !nombre;
  if (deArchivo) nombre = nombreDeArchivo(archivo);
  return { nombre: nombre.slice(0, 60).trim(), codigo: normCod(codigo), tipo, deArchivo };
}

// Cada logo leído contra lo que ya hay en la biblioteca: igual nombre o igual código = ya existe (no se duplica ni se pisa).
export function planLogos(existentes, items) {
  const porNombre = new Map();
  const porCodigo = new Map();
  (existentes || []).forEach((x) => { porNombre.set(plano(x.nombre), x); if (x.codigo) porCodigo.set(plano(x.codigo), x); });
  const vistosNombre = new Set();
  return (items || []).map((it) => {
    const n = plano(it.nombre);
    const c = it.codigo ? plano(it.codigo) : "";
    let dup = null;
    if (!n) return { ...it, estado: "sinNombre", dup: null };
    if (porNombre.has(n)) dup = porNombre.get(n);
    else if (c && porCodigo.has(c)) dup = porCodigo.get(c);
    if (dup) return { ...it, estado: "existe", dup };
    if (vistosNombre.has(n)) return { ...it, estado: "repetidoLote", dup: null };
    vistosNombre.add(n);
    return { ...it, estado: "nuevo", dup: null };
  });
}

export const tipoValido = (t) => (TIPOS_VINILO.includes(t) ? t : TIPOS_VINILO[0]);
