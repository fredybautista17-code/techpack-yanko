// ─── DISEÑO: «QUÉ DISEÑAR» SEGÚN LA CARGA DE PLANTA (cálculo puro, sin Firebase) ─────────────────────────────────
// (2026-11-13, a pedido de Fredy) Para cada categoría: cuántos días de trabajo tiene cubiertos la planta (unidades en Planta Yanko ÷ capacidad de los
// módulos que hacen esa categoría) y, con lo que Diseño ya tiene en camino, si hay que diseñar ya.
//  · «Poco trabajo» = menos de `poco` días (Fredy: 10).  · Un diseño tarda `lead` días corridos en llegar a planta (Fredy: 45 ≈ 32 hábiles).
//  · Nivel: rojo = ya hay poco trabajo; ámbar = no alcanzará hasta que llegue lo que se diseñe hoy (días < hábiles del diseño + poco) y Diseño casi no
//    tiene nada en camino; azul = igual de justo pero ya hay `minEnCamino` o más diseños en camino; verde = cubierta; gris = tiene carga pero ningún módulo la hace.
//  · Si un módulo hace varias categorías, su capacidad se reparte en partes iguales entre ellas.
export const PLANTA_YANKO_NOMBRE = "INDUSTRIAS YANKO MODULO CENTRO";
export const PARAMS_DEFECTO = { poco: 10, lead: 45, minEnCamino: 3 };

export const normCategoria = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function paramsDeConfig(cfg) {
  const n = (v, d) => (Number(v) > 0 ? Math.floor(Number(v)) : d);
  return { poco: n(cfg?.disenoPocoDias, PARAMS_DEFECTO.poco), lead: n(cfg?.disenoLeadDias, PARAMS_DEFECTO.lead), minEnCamino: n(cfg?.disenoMinEnCamino, PARAMS_DEFECTO.minEnCamino) };
}
export const habilesDeLead = (lead) => Math.round((Number(lead) || 0) * 5 / 7);

// Unidades en Planta Yanko por categoría (mismos lotes que el tablero «Carga por Módulos»).
export function unidadesPorCategoria(carga) {
  const mapa = new Map();
  (carga?.lotes || [])
    .filter((l) => l.nombrePlanta === PLANTA_YANKO_NOMBRE && (l.ubicacionActual ? l.ubicacionActual === "Planta" : Number(l.invPlanta) > 0))
    .forEach((l) => {
      const k = normCategoria(l.categoria) || "(sin categoría)";
      const prev = mapa.get(k) || { categoria: String(l.categoria || "").trim() || "(sin categoría)", und: 0 };
      prev.und += Number(l.invPlanta) || 0;
      mapa.set(k, prev);
    });
  return mapa;
}

export function calcularQueDisenar({ carga, modulos, protos, cronograma, params }) {
  const p = { ...PARAMS_DEFECTO, ...(params || {}) };
  const habiles = habilesDeLead(p.lead);
  const umbral = habiles + p.poco;
  const cargas = unidadesPorCategoria(carga);
  const cats = new Map(); // norm -> {categoria}
  cargas.forEach((v, k) => cats.set(k, { categoria: v.categoria }));
  const capPorCat = new Map();
  const modsPorCat = new Map();
  (modulos || []).forEach((m) => {
    const lista = (m.categorias || []).filter(Boolean);
    lista.forEach((c) => {
      const k = normCategoria(c);
      if (!cats.has(k)) cats.set(k, { categoria: c });
      capPorCat.set(k, (capPorCat.get(k) || 0) + (Number(m.capacidadDia) || 0) / lista.length);
      modsPorCat.set(k, [...(modsPorCat.get(k) || []), { nombre: m.nombre, capacidadDia: Number(m.capacidadDia) || 0, categorias: lista }]);
    });
  });
  const aprobados = (protos || []).filter((x) => !x.eliminado && x.status === "aprobado" && !x.promotedTo);
  const muestras = (cronograma || []).filter((c) => ["pendiente", "asignado", "recibida", "modificar"].includes(c.estado || "pendiente"));
  const filas = [...cats.entries()].map(([k, v]) => {
    const und = cargas.get(k)?.und || 0;
    const cap = capPorCat.get(k) || 0;
    const dias = cap > 0 ? und / cap : null;
    const ap = aprobados.filter((x) => normCategoria(x.categoria) === k);
    const mu = muestras.filter((x) => normCategoria(x.categoria) === k).length;
    const enCamino = ap.length + mu;
    let nivel;
    if (dias === null) nivel = "sin_modulo";
    else if (dias < p.poco) nivel = "rojo";
    else if (dias < umbral) nivel = enCamino >= p.minEnCamino ? "azul" : "ambar";
    else nivel = "verde";
    return { clave: k, categoria: v.categoria, und, capacidad: cap, dias, modulos: modsPorCat.get(k) || [], aprobados: ap, muestras: mu, enCamino, nivel };
  });
  const orden = { rojo: 0, ambar: 1, azul: 2, sin_modulo: 3, verde: 4 };
  filas.sort((a, b) => orden[a.nivel] - orden[b.nivel] || (a.dias ?? 9999) - (b.dias ?? 9999) || a.categoria.localeCompare(b.categoria));
  return { filas, params: p, habiles, umbral };
}
