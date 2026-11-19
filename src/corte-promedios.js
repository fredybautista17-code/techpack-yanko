// (2026-11-19, a pedido de Fredy) Programación de mesones de hoy (Mi Día de Planeación): cuánto debería durar cada corte según el
// PROMEDIO de su tela (cortes ya registrados) y aviso cuando el horario programado no coincide. Solo informa: no cambia horarios.
// Funciones puras (sin Firestore). Los datos de entrada vienen de `corte_programacion` (un doc por color) y de los cortes
// realizados de `pedidos_activos`.

const NUM = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const MARGEN_HORARIO = 0.15; // ±15 %: menos que eso no se avisa
export const TENDIDO_MIN_POR_METRO_FIJO = 20 / 60; // regla fija cuando la tela no tiene 3 cortes con tendido registrado

// Estadística por tela a partir de los cortes realizados de los pedidos (misma regla que Corte → estadisticasTela).
export function estadisticasPorTela(pedidos) {
  const byTela = {};
  (pedidos || []).forEach((p) =>
    (p.cortesRealizados || []).forEach((c) => {
      if (!c.tipoTela || !(c.metrosTendido > 0) || !(c.minutos > 0)) return;
      if (!byTela[c.tipoTela]) byTela[c.tipoTela] = { minutos: 0, metros: 0, cortes: 0, minTend: 0, metTend: 0, cortesTend: 0, unidades: 0, minUnid: 0, cortesUnid: 0 };
      const t = byTela[c.tipoTela];
      t.minutos += c.minutos;
      t.metros += c.metrosTendido;
      t.cortes++;
      if (c.minutosTendido > 0) { t.minTend += c.minutosTendido; t.metTend += c.metrosTendido; t.cortesTend++; }
      if (c.totalUnidades > 0) { t.unidades += c.totalUnidades; t.minUnid += c.minutos; t.cortesUnid++; }
    })
  );
  const out = {};
  Object.entries(byTela).forEach(([tela, d]) => {
    out[tela] = {
      minPorMetro: d.metros > 0 ? d.minutos / d.metros : null,
      cortes: d.cortes,
      tendidoMinPorMetro: d.cortesTend >= 3 && d.metTend > 0 ? d.minTend / d.metTend : null,
      cortesTendido: d.cortesTend,
      unidadesPorMin: d.cortesUnid >= 3 && d.minUnid > 0 ? d.unidades / d.minUnid : null,
    };
  });
  return out;
}

export const minDeHora = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// Junta los documentos por color en cortes: un corte = misma planta + mesón + pedido + referencia + número de corte.
// `items` son los de generarMesonesHoy (cortes por color y bloqueos).
export function agruparCortes(items) {
  const mapa = new Map();
  const bloqueos = [];
  (items || []).forEach((it) => {
    if (it.esBloqueo) { bloqueos.push(it); return; }
    const k = [it.planta, it.meson, it.numPedido, it.referencia, it.numeroCorte || ""].join("|");
    if (!mapa.has(k)) {
      mapa.set(k, {
        key: k, planta: it.planta, meson: it.meson, cortador: it.cortador, referencia: it.referencia, numPedido: it.numPedido,
        cliente: it.cliente, numeroCorte: it.numeroCorte || "", tela: it.tipoTela || "",
        horaInicio: it.horaInicioEstimada || "", horaFin: it.horaFinEstimada || "",
        prendas: 0, metros: 0, colores: [], estados: new Set(),
      });
    }
    const c = mapa.get(k);
    c.prendas += NUM(it.cantidad);
    c.metros += NUM(it.metros);
    c.colores.push({ nombre: it.color || "", cantidad: NUM(it.cantidad) });
    c.estados.add(it.estado);
    if (!c.tela && it.tipoTela) c.tela = it.tipoTela;
    if (!c.horaInicio && it.horaInicioEstimada) c.horaInicio = it.horaInicioEstimada;
    if (!c.horaFin && it.horaFinEstimada) c.horaFin = it.horaFinEstimada;
  });
  const cortes = [...mapa.values()].map((c) => ({
    ...c,
    estado: c.estados.has("Por programar mesón") ? "Por programar mesón" : c.estados.has("Programado") ? "Programado" : "Aprobado",
    iniMin: minDeHora(c.horaInicio),
    finMin: minDeHora(c.horaFin),
  }));
  return { cortes, bloqueos };
}

// Minutos que debería durar un corte según el promedio de su tela.
// corte = prendas ÷ prendas por minuto de la tela (si no hay, metros × min/m de corte);
// tendido = metros × min/m de tendido del historial (≥3 cortes con tendido) o, si no hay, 20 s por metro.
// Devuelve null si la tela no tiene estadística de corte.
export function estimarCorte(corte, statsTela) {
  if (!statsTela) return null;
  let minCorte = null;
  if (statsTela.unidadesPorMin > 0 && corte.prendas > 0) minCorte = corte.prendas / statsTela.unidadesPorMin;
  else if (statsTela.minPorMetro > 0 && corte.metros > 0) minCorte = corte.metros * statsTela.minPorMetro;
  if (minCorte === null) return null;
  const tendidoHist = statsTela.tendidoMinPorMetro > 0;
  const tasa = tendidoHist ? statsTela.tendidoMinPorMetro : TENDIDO_MIN_POR_METRO_FIJO;
  const minTendido = corte.metros > 0 ? corte.metros * tasa : 0;
  return { total: minCorte + minTendido, corte: minCorte, tendido: minTendido, tendidoHist, cortesTela: statsTela.cortes || 0, porPrendas: statsTela.unidadesPorMin > 0 };
}

// «ok» dentro de ±margen · «largo» el horario sobra · «corto» el horario no alcanza · «sin» no hay promedio u horario.
export function evaluarHorario(programadoMin, estimadoMin, margen = MARGEN_HORARIO) {
  if (!(programadoMin > 0) || !(estimadoMin > 0)) return "sin";
  const r = programadoMin / estimadoMin;
  if (r > 1 + margen) return "largo";
  if (r < 1 - margen) return "corto";
  return "ok";
}

// Arma la vista por mesón: cortes en orden de hora, promedio, estado y hora a la que terminaría el mesón según los promedios
// (si un corte se pasa, se corre el siguiente: cursor = max(cursor, inicio programado) + duración estimada).
export function armarMesones(items, estadisticas) {
  const { cortes, bloqueos } = agruparCortes(items);
  const porMeson = new Map();
  const claveMeson = (x) => `${x.planta} · ${x.meson}`;
  cortes.forEach((c) => {
    const k = claveMeson(c);
    if (!porMeson.has(k)) porMeson.set(k, { key: k, planta: c.planta, meson: c.meson, cortador: c.cortador, cortes: [], bloqueos: [] });
    porMeson.get(k).cortes.push(c);
  });
  bloqueos.forEach((b) => {
    const k = claveMeson(b);
    if (!porMeson.has(k)) porMeson.set(k, { key: k, planta: b.planta, meson: b.meson, cortador: "", cortes: [], bloqueos: [] });
    porMeson.get(k).bloqueos.push({ ...b, iniMin: minDeHora(b.horaInicioEstimada), finMin: minDeHora(b.horaFinEstimada) });
  });
  const mesones = [...porMeson.values()].map((m) => {
    m.cortes.sort((a, b) => (a.iniMin ?? 9999) - (b.iniMin ?? 9999));
    let cursor = null;
    m.cortes.forEach((c) => {
      c.progMin = c.iniMin !== null && c.finMin !== null && c.finMin > c.iniMin ? c.finMin - c.iniMin : null;
      c.est = estimarCorte(c, c.tela ? (estadisticas || {})[c.tela] : null);
      c.evaluacion = c.progMin !== null && c.est ? evaluarHorario(c.progMin, c.est.total) : "sin";
      c.estFinPropio = c.iniMin !== null && c.est ? c.iniMin + c.est.total : null;
      if (c.iniMin !== null) {
        const duracion = c.est ? c.est.total : c.progMin || 0;
        cursor = Math.max(cursor === null ? c.iniMin : cursor, c.iniMin) + duracion;
        c.estFinCascada = cursor;
      }
    });
    const finProg = m.cortes.reduce((mx, c) => (c.finMin !== null && c.finMin > mx ? c.finMin : mx), 0) || null;
    return { ...m, terminaEstMin: cursor, finProgMin: finProg, hayEstimado: m.cortes.some((c) => c.est) };
  });
  mesones.sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }));
  const todos = mesones.flatMap((m) => m.cortes);
  const resumen = {
    cortes: todos.length,
    prendas: todos.reduce((s, c) => s + c.prendas, 0),
    mesonesEnUso: mesones.filter((m) => m.cortes.length > 0).length,
    noAlcanzan: todos.filter((c) => c.evaluacion === "corto").length,
    sinTendido: todos.filter((c) => !c.est || !c.est.tendidoHist).length,
  };
  return { mesones, resumen };
}
