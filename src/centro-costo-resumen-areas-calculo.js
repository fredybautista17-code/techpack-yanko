// (2026-11-10, a pedido de Fredy) Centro de Costo — Planeación: vista «por área». Agrupa las filas por trabajador que ya calcula la pantalla
// (valorProducido, sueldoEsperado/costo, sinSueldo) sin cambiar ningún cálculo: la ayuda es la misma de siempre, o sea lo garantizado menos lo
// producido de quienes quedaron por debajo (acuerdo del 2026-11-04: UNA sola ayuda en todas las pantallas). Funciones puras.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const UMBRAL_ROJO = 0.6;   // cubre menos del 60 % de lo garantizado → «Necesita ayuda»
export const UMBRAL_AMBAR = 0.85; // menos del 85 % → «Cubre a medias»

export function estadoCobertura(c) {
  if (c === null || c === undefined) return { k: "sin", texto: "Sin sueldos cargados" };
  if (c < UMBRAL_ROJO) return { k: "mal", texto: "Necesita ayuda" };
  if (c < UMBRAL_AMBAR) return { k: "ojo", texto: "Cubre a medias" };
  return { k: "bien", texto: "Se cubre" };
}

// filas = las de la pantalla; garantizadoDe(fila) = lo que se le garantiza a la persona en el período.
export function agruparPorArea(filas, garantizadoDe) {
  const mapa = new Map();
  (filas || []).forEach((f) => {
    const area = String(f.area || "Sin asignar").trim() || "Sin asignar";
    if (!mapa.has(area)) mapa.set(area, { area, personas: 0, ayudadas: 0, unidades: 0, producido: 0, garantizado: 0, ayuda: 0, excedente: 0, nomina: 0, sinSueldo: 0, filas: [] });
    const a = mapa.get(area);
    const garantizado = f.sinSueldo ? 0 : num(garantizadoDe(f));
    const balance = f.sinSueldo ? null : num(f.valorProducido) - garantizado;
    a.personas += 1;
    a.unidades += num(f.unidades);
    a.producido += num(f.valorProducido);
    a.nomina += f.sinSueldo ? 0 : num(f.costo);
    if (f.sinSueldo) a.sinSueldo += 1;
    else {
      a.garantizado += garantizado;
      if (balance < 0) { a.ayuda += -balance; a.ayudadas += 1; } else a.excedente += balance;
    }
    a.filas.push({ ...f, garantizado, balance });
  });
  const areas = [...mapa.values()].map((a) => {
    const cobertura = a.garantizado > 0 ? 1 - a.ayuda / a.garantizado : null;
    return {
      ...a, cobertura, estado: estadoCobertura(cobertura),
      filas: a.filas.sort((x, y) => (x.balance === null ? 1 : y.balance === null ? -1 : x.balance - y.balance)), // los que más ayuda necesitan, primero
    };
  }).sort((x, y) => y.ayuda - x.ayuda || y.nomina - x.nomina);
  const garantizado = areas.reduce((s, a) => s + a.garantizado, 0);
  const ayuda = areas.reduce((s, a) => s + a.ayuda, 0);
  return {
    areas,
    total: {
      personas: areas.reduce((s, a) => s + a.personas, 0), ayudadas: areas.reduce((s, a) => s + a.ayudadas, 0), garantizado, ayuda,
      cobertura: garantizado > 0 ? 1 - ayuda / garantizado : null,
    },
  };
}
