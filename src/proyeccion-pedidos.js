// ─── PROYECCIÓN POR ÁREA — vista «Por pedido» (cálculo puro) ──────────────────
// (2026-10-26, a pedido de Fredy) Por cada pedido: qué referencias hay que tener en cuenta para cumplirlo, en qué etapa está
// cada una (Sin cortar → Corte/BMP → Planta → Semiterminado → BPT) y un semáforo. El semáforo sale de la simulación que ya
// hace Proyección por Área (proyeccion-calculo.js): cada fila lote/pedido trae su fecha «listo proyectado» y su estado
// (a tiempo / justo / llega tarde). El pedido toma el color de su referencia más atrasada.
const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const ETAPAS = [
  { id: "sinCortar", label: "Sin cortar" },
  { id: "corte", label: "Corte/BMP" },
  { id: "planta", label: "Planta" },
  { id: "semi", label: "Semiterm." },
  { id: "bpt", label: "BPT" },
];
const NOMBRE_ETAPA_ACTUAL = { sinCortar: "Sin cortar", corte: "Corte / BMP", planta: "Confección", semi: "Terminación / proceso", bpt: "Listo en BPT" };
// 3 = rojo, 2 = naranja, 1 = gris (sin fecha), 0 = verde
const RANGO = { atrasado: 3, sin_horizonte: 3, justo: 2, sin_fecha: 1, ok: 0, listo: 0 };
const TEXTO_ESTADO = { 3: "Llega tarde", 2: "Justo", 1: "Sin fecha de entrega", 0: "A tiempo" };

function vacias() {
  return { sinCortar: 0, corte: 0, planta: 0, semi: 0, bpt: 0 };
}
function sumarEtapas(a, b) {
  const r = vacias();
  ETAPAS.forEach((e) => { r[e.id] = NUM(a[e.id]) + NUM(b[e.id]); });
  return r;
}
function diasEntre(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const [y1, m1, d1] = aISO.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = bISO.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
// Unidades por etapa de cada ficha de la simulación (misma llave que usa proyeccion-calculo.js).
export function etapasPorFicha(lotes, sinCortarAgrupado) {
  const m = new Map();
  const poner = (key, et) => m.set(key, m.has(key) ? sumarEtapas(m.get(key), et) : et);
  (lotes || []).forEach((l) => {
    const ref = String(l.referencia || "").trim();
    poner(`L|${l.numLote ?? ""}|${l.numPedido ?? ""}|${ref}`, {
      sinCortar: 0, corte: NUM(l.invCorte) + NUM(l.invBMP), planta: NUM(l.invPlanta), semi: NUM(l.invSemiterminado), bpt: NUM(l.invBPT),
    });
  });
  (sinCortarAgrupado || []).forEach((s) => {
    poner(`P|${s.numPed ?? ""}|${String(s.ref || "").trim()}`, { sinCortar: NUM(s.unid), corte: 0, planta: 0, semi: 0, bpt: 0 });
  });
  return m;
}

function etapaPrincipal(et) {
  const pendientes = ETAPAS.filter((e) => e.id !== "bpt");
  const total = ETAPAS.reduce((s, e) => s + NUM(et[e.id]), 0);
  if (total > 0 && NUM(et.bpt) >= total - 0.5) return "bpt";
  return pendientes.reduce((mejor, e) => (NUM(et[e.id]) > NUM(et[mejor]) ? e.id : mejor), "sinCortar");
}

// filas = sim.lotes · lotes = lotes crudos de la carga · sinCortar = ya agrupado (agruparSinCortar) o [].
export function armarPedidos({ filas, lotes, sinCortar, hoyISO }) {
  const etapasDe = etapasPorFicha(lotes, sinCortar);
  // 1) referencias: junta las filas (lotes y «sin cortar») del mismo pedido y referencia
  const refs = new Map();
  (filas || []).forEach((f) => {
    const pedido = String(f.numPedido ?? "").trim();
    const k = `${pedido}|${f.ref}`;
    if (!refs.has(k)) refs.set(k, { pedido, ref: f.ref, cliente: f.cliente, lotes: [], filas: [], etapas: vacias(), unidades: 0, valor: 0, bloqueadas: 0 });
    const r = refs.get(k);
    r.filas.push(f);
    if (f.tipo === "lote" && f.numLote !== "" && f.numLote !== undefined) r.lotes.push(f.numLote);
    r.etapas = sumarEtapas(r.etapas, etapasDe.get(f.key) || vacias());
    r.unidades += NUM(f.unidades);
    r.valor += NUM(f.valor);
    r.bloqueadas += NUM(f.bloqueadas);
  });
  const listaRefs = [...refs.values()].map((r) => {
    const etapa = etapaPrincipal(r.etapas);
    const listoTodo = etapa === "bpt";
    const entregas = r.filas.map((f) => f.entrega).filter(Boolean).sort();
    const entrega = entregas[0] || "";
    const sinHorizonte = r.filas.some((f) => !f.listoISO);
    const listoISO = sinHorizonte ? null : r.filas.map((f) => f.listoISO).sort().slice(-1)[0] || null;
    const atraso = listoISO && entrega ? diasEntre(entrega, listoISO) : null;
    const rango = listoTodo ? 0 : Math.max(...r.filas.map((f) => RANGO[f.estado] ?? 1));
    const desde = r.filas.map((f) => f.materialDesde).filter(Boolean).sort().slice(-1)[0] || null;
    return {
      ...r, etapa, areaActual: NOMBRE_ETAPA_ACTUAL[etapa], listoTodo, entrega, listoISO, atraso, sinHorizonte: !listoTodo && sinHorizonte,
      rango, estadoTxt: listoTodo ? "Listo en BPT" : TEXTO_ESTADO[rango], materialDesde: desde,
      lotes: [...new Set(r.lotes)],
    };
  });
  // 2) pedidos
  const peds = new Map();
  listaRefs.forEach((r) => {
    if (!peds.has(r.pedido)) peds.set(r.pedido, []);
    peds.get(r.pedido).push(r);
  });
  const out = [...peds.entries()].map(([pedido, rs]) => {
    const etapas = rs.reduce((a, r) => sumarEtapas(a, r.etapas), vacias());
    const unidades = rs.reduce((s, r) => s + r.unidades, 0);
    const valor = rs.reduce((s, r) => s + r.valor, 0);
    const entregas = rs.map((r) => r.entrega).filter(Boolean).sort();
    const entrega = entregas[0] || "";
    const pendientes = rs.filter((r) => !r.listoTodo);
    const sinHorizonte = pendientes.some((r) => r.sinHorizonte);
    const listoISO = !pendientes.length ? hoyISO : sinHorizonte ? null : pendientes.map((r) => r.listoISO).sort().slice(-1)[0];
    const atraso = listoISO && entrega ? diasEntre(entrega, listoISO) : null;
    const rango = Math.max(...rs.map((r) => r.rango));
    const faltan = [];
    if (!pendientes.length) faltan.push("Todo en BPT");
    else {
      if (rs.length > 1) faltan.push(`${pendientes.length} de ${rs.length} referencias sin terminar`);
      else if (pendientes[0].etapa !== "sinCortar") faltan.push(`1 referencia en ${NOMBRE_ETAPA_ACTUAL[pendientes[0].etapa].toLowerCase()}`);
      if (etapas.sinCortar > 0.5) faltan.push(`${Math.round(etapas.sinCortar).toLocaleString("es-CO")} und sin cortar`);
      const bloq = rs.reduce((s, r) => s + r.bloqueadas, 0);
      if (bloq > 0.5) {
        const hasta = rs.map((r) => r.materialDesde).filter(Boolean).sort().slice(-1)[0];
        faltan.push(`${Math.round(bloq).toLocaleString("es-CO")} und esperan material${hasta ? ` hasta ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}` : ""}`);
      }
    }
    return {
      pedido, nombre: pedido || "(Sin número de pedido)", cliente: rs[0].cliente, entrega, diasEntrega: diasEntre(hoyISO, entrega),
      unidades, valor, etapas, listoISO, atraso, rango, estadoTxt: pendientes.length ? TEXTO_ESTADO[rango] : "Listo en BPT",
      listoTodo: !pendientes.length, sinHorizonte, faltaTxt: faltan.join(" · "), refs: rs.sort((a, b) => b.rango - a.rango || (a.entrega || "").localeCompare(b.entrega || "") || String(a.ref).localeCompare(String(b.ref))),
    };
  });
  return out.sort((a, b) => b.rango - a.rango || (a.entrega || "9999").localeCompare(b.entrega || "9999") || String(a.pedido).localeCompare(String(b.pedido)));
}
