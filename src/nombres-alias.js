// ─── NOMBRES ANTERIORES (alias) de los trabajadores de Corte — sin pantalla ────────────────────────────────────────
// (2026-11-04, a pedido de Fredy) Al renombrar a alguien en Admin Corte → Nómina («JAIRO ALMACEN» → «JAIRO DAVID ANDRADE ANDUEZA»)
// se guarda en corte_config/main → nomina.nombresAnteriores = { "<NOMBRE VIEJO NORMALIZADO>": "<nombre nuevo>" }.
// Así los cierres y meses guardados con el nombre viejo se suman al nombre nuevo (una sola fila) y la carga del Excel de nómina
// no crea un duplicado.
import { normTexto } from "./centro-costo-historico-parser";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Nombre vigente de alguien (sigue la cadena vieja → nueva → más nueva, con tope).
export function resolverNombre(nombre, alias) {
  let actual = String(nombre || "").trim();
  const mapa = alias || {};
  for (let i = 0; i < 5; i++) {
    const nuevo = mapa[normTexto(actual)];
    if (!nuevo || normTexto(nuevo) === normTexto(actual)) break;
    actual = nuevo;
  }
  return actual;
}

// filas: [{ id, nombre, valor, costo, unidades }]. Une las que, con el alias, resultan en el mismo nombre (suma valor, costo y unidades).
export function unirPorAlias(filas, alias) {
  if (!alias || !Object.keys(alias).length) return filas || [];
  const por = new Map();
  const orden = [];
  (filas || []).forEach((f) => {
    const nombre = resolverNombre(f.nombre, alias);
    const k = normTexto(nombre);
    if (!por.has(k)) {
      por.set(k, { ...f, nombre });
      orden.push(k);
    } else {
      const g = por.get(k);
      ["valor", "costo", "unidades"].forEach((c) => {
        if (f[c] != null || g[c] != null) g[c] = num(g[c]) + num(f[c]);
      });
    }
  });
  return orden.map((k) => por.get(k));
}
