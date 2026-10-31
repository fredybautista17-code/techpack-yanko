// Consumo de tela de CORTE: teórico contra real (2026-10-31, a pedido de Fredy).
// Cálculo puro (sin Firebase) para poder probarlo con node.
//   - Trazos (ATLAS): metros tendidos del corte = largo del trazo × capas (corte.metrosTendido).
//   - Teórico (Busint): consumo ml por prenda teórico × cantidad (tabla "bc-visor de rendimiento de corte").
//   - Real (Busint): total ml real del corte en esa misma tabla.
// Semáforo (límites de Fredy, ajustables): cruza ≤ 3 %, revisar 3 %–6 %, no cruza > 6 %.

export const TOLERANCIA_CONSUMO = { verde: 3, rojo: 6 };

const normTxt = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
const redondear = (n, d = 1) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

function difDias(a, b) {
  if (!a || !b) return 99;
  return Math.abs(Math.round((new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 86400000));
}

// Porcentaje de a sobre b (positivo = gastó/tendió más que lo esperado).
export function pctSobre(a, b) {
  if (a === null || a === undefined || b === null || b === undefined || !(b > 0)) return null;
  return ((a - b) / b) * 100;
}

// "cruza" | "revisar" | "nocruza" | null (sin dato)
export function clasificarDif(pct, tol = TOLERANCIA_CONSUMO) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  const a = Math.abs(pct);
  if (a <= tol.verde) return "cruza";
  if (a <= tol.rojo) return "revisar";
  return "nocruza";
}

const ORDEN_ESTADO = { cruza: 0, revisar: 1, nocruza: 2 };
function peor(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return ORDEN_ESTADO[a] >= ORDEN_ESTADO[b] ? a : b;
}

// Aplana los cortes registrados en ATLAS (pedidos_activos[].cortesRealizados) dentro de [desde, hasta].
export function cortesAtlasConTrazo(pedidos, desde, hasta) {
  const out = [];
  (pedidos || []).forEach((p) => {
    (p.cortesRealizados || []).forEach((c) => {
      if (!c || !c.fecha || c.fecha < desde || c.fecha > hasta) return;
      const refs = (c.refs || []).filter((r) => r && r.ref);
      const unidades = Number(c.totalUnidades) || refs.reduce((s, r) => s + (Number(r.total) || 0), 0);
      const metros = Number(c.metrosTendido) || 0;
      out.push({
        key: `${p.id}|${c.id}`,
        pedidoId: p.id,
        pedido: p.numero,
        corteId: c.id,
        fecha: c.fecha,
        cortador: c.cortador || "",
        lote: String(c.lote || "").trim(),
        tela: c.tipoTela || (c.materiales && c.materiales[0] && c.materiales[0].tipoTela) || "",
        detalleTrazo: (c.materiales && c.materiales.length
          ? c.materiales.map((m) => `${m.largoTrazo || "?"} m × ${m.capas || "?"} capas`).join(" + ")
          : c.largoTrazo ? `${c.largoTrazo} m × ${c.capas || "?"} capas` : ""),
        refs: refs.map((r) => ({ ref: String(r.ref), total: Number(r.total) || 0 })),
        unidades,
        trazoM: metros > 0 ? metros : null,
      });
    });
  });
  return out;
}

// Une cada corte de ATLAS con la(s) fila(s) de Busint y arma la tabla.
// filasBusint: [{fecha, referencia, refExt, lote, cantidad, mlReal, consMlTeor, mlTeor, consMlReal}]
export function armarFilasConsumoTela({ cortes, filasBusint, desde, hasta, tol = TOLERANCIA_CONSUMO }) {
  const usadas = new Set();
  const busint = (filasBusint || []).filter((r) => !r.fecha || (r.fecha >= desde && r.fecha <= hasta));
  const hayLote = busint.some((r) => r.lote);
  const filas = [];
  const cortesOrdenados = [...(cortes || [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  cortesOrdenados.forEach((c) => {
    const grupo = [];
    if (c.lote && hayLote) {
      busint.forEach((r, i) => { if (!usadas.has(i) && r.lote && String(r.lote) === c.lote) grupo.push(i); });
    }
    if (!grupo.length) {
      c.refs.forEach((cr) => {
        const clave = normTxt(cr.ref);
        const candidatos = busint
          .map((r, i) => ({ r, i }))
          .filter(({ r, i }) => !usadas.has(i) && !grupo.includes(i) && (normTxt(r.referencia) === clave || normTxt(r.refExt) === clave) && difDias(r.fecha, c.fecha) <= 1)
          .sort((x, y) => difDias(x.r.fecha, c.fecha) - difDias(y.r.fecha, c.fecha) || Math.abs(x.r.cantidad - cr.total) - Math.abs(y.r.cantidad - cr.total));
        if (!candidatos.length) return;
        const mejor = candidatos[0];
        const tolCant = Math.max(2, cr.total * 0.03);
        const otrosCortesMismaRef = cortesOrdenados.filter((o) => o.key !== c.key && difDias(o.fecha, c.fecha) <= 1 && o.refs.some((x) => normTxt(x.ref) === clave)).length;
        if (Math.abs(mejor.r.cantidad - cr.total) <= tolCant || (candidatos.length === 1 && otrosCortesMismaRef === 0)) grupo.push(mejor.i);
      });
    }
    grupo.forEach((i) => usadas.add(i));
    const rows = grupo.map((i) => busint[i]);
    const unidadesB = rows.reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
    const teorTotal = rows.length && rows.every((r) => r.mlTeor !== null && r.mlTeor !== undefined && r.mlTeor > 0) ? rows.reduce((s, r) => s + r.mlTeor, 0) : null;
    const rowsConReal = rows.filter((r) => r.mlReal > 0);
    const realTotal = rows.length && rowsConReal.length === rows.length ? rows.reduce((s, r) => s + r.mlReal, 0) : null;
    const unidades = c.unidades || unidadesB;
    const trazoVsTeor = pctSobre(c.trazoM, teorTotal);
    const realVsTeor = pctSobre(realTotal, teorTotal);
    const trazoVsReal = pctSobre(c.trazoM, realTotal);
    let estado;
    if (!rows.length) estado = "esperando";
    else if (teorTotal === null) estado = "sin_teorico";
    else estado = peor(clasificarDif(trazoVsTeor, tol), clasificarDif(realVsTeor, tol)) || "esperando";
    filas.push({
      key: c.key,
      origen: "atlas",
      fecha: c.fecha,
      lote: c.lote || (rows.find((r) => r.lote) || {}).lote || "",
      cortador: c.cortador,
      pedido: c.pedido,
      refs: c.refs.map((r) => r.ref),
      tela: c.tela,
      unidades,
      detalleTrazo: c.detalleTrazo,
      trazoM: c.trazoM,
      trazoPorPrenda: c.trazoM && unidades > 0 ? c.trazoM / unidades : null,
      teorM: teorTotal,
      teorPorPrenda: teorTotal !== null && unidadesB > 0 ? teorTotal / unidadesB : null,
      realM: realTotal,
      realPorPrenda: realTotal !== null && unidadesB > 0 ? realTotal / unidadesB : null,
      trazoVsTeor, realVsTeor, trazoVsReal,
      estado,
      conBusint: rows.length > 0,
    });
  });
  // Filas de Busint sin corte en ATLAS (se ven igual, sin trazo).
  busint.forEach((r, i) => {
    if (usadas.has(i)) return;
    const teor = r.mlTeor > 0 ? r.mlTeor : null;
    const real = r.mlReal > 0 ? r.mlReal : null;
    const realVsTeor = pctSobre(real, teor);
    filas.push({
      key: `b|${i}`,
      origen: "busint",
      fecha: r.fecha,
      lote: r.lote || "",
      cortador: "",
      pedido: r.poExter || "",
      refs: [r.referencia || r.refExt].filter(Boolean),
      tela: "",
      unidades: Number(r.cantidad) || 0,
      detalleTrazo: "",
      trazoM: null, trazoPorPrenda: null,
      teorM: teor,
      teorPorPrenda: teor !== null && r.cantidad > 0 ? teor / r.cantidad : null,
      realM: real,
      realPorPrenda: real !== null && r.cantidad > 0 ? real / r.cantidad : null,
      trazoVsTeor: null, realVsTeor, trazoVsReal: null,
      estado: teor === null ? "sin_teorico" : real === null ? "esperando" : clasificarDif(realVsTeor, tol),
      conBusint: true,
    });
  });
  return filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// Costo de la tela por lote (Busint): costoPorMetro = valor de la tela del lote / sus metros.
// «Pagué de más» = (metros reales − metros teóricos) × costo por metro (negativo = ahorro).
export function aplicarCostoTelaConsumo(filas, costosPorLote) {
  return filas.map((f) => {
    const c = f.lote ? (costosPorLote || {})[String(f.lote)] : null;
    const costoMetro = c && c.costoPorMetro > 0 ? c.costoPorMetro : null;
    const difM = f.realM !== null && f.realM !== undefined && f.teorM !== null && f.teorM !== undefined ? f.realM - f.teorM : null;
    return { ...f, costoMetro, difM, pagadoDeMas: costoMetro !== null && difM !== null ? Math.round(difM * costoMetro) : null };
  });
}

export function resumenConsumoTela(filas) {
  const cuenta = { cruza: 0, revisar: 0, nocruza: 0, esperando: 0, sin_teorico: 0 };
  filas.forEach((f) => { cuenta[f.estado] = (cuenta[f.estado] || 0) + 1; });
  const conReal = filas.filter((f) => f.teorM > 0 && f.realM > 0);
  const teor = conReal.reduce((s, f) => s + f.teorM, 0);
  const real = conReal.reduce((s, f) => s + f.realM, 0);
  const trazo = conReal.reduce((s, f) => s + (f.trazoM || 0), 0);
  const conPesos = conReal.filter((f) => f.pagadoDeMas !== null && f.pagadoDeMas !== undefined);
  const pesos = conPesos.reduce((s, f) => s + f.pagadoDeMas, 0);
  return { cuenta, teor: redondear(teor), real: redondear(real), trazo: redondear(trazo), pctReal: pctSobre(real, teor), n: conReal.length, pesos, nPesos: conPesos.length, sinPrecio: conReal.length - conPesos.length };
}

// Aviso al crear el lote en ATLAS (Busint aún no tiene el real): trazo del corte contra el
// teórico más reciente de la referencia (o de cada referencia del corte, ponderado por unidades).
export function evaluarCorteContraTeorico(corte, teoricoPorRef, tol = TOLERANCIA_CONSUMO) {
  const trazo = Number(corte && corte.metrosTendido) || 0;
  if (!(trazo > 0)) return { ok: null, motivo: "el corte no tiene metros tendidos registrados" };
  const refs = ((corte && corte.refs) || []).filter((r) => r && r.ref);
  let teor = 0;
  let unid = 0;
  for (const r of refs) {
    const t = (teoricoPorRef || {})[String(r.ref)];
    const u = Number(r.total) || 0;
    if (!t || !(t.consMlTeor > 0) || !(u > 0)) return { ok: null, motivo: `Busint no tiene consumo teórico de ${r.ref}` };
    teor += t.consMlTeor * u;
    unid += u;
  }
  if (!(teor > 0)) return { ok: null, motivo: "sin consumo teórico" };
  const pct = pctSobre(trazo, teor);
  return { ok: true, pct, estado: clasificarDif(pct, tol), trazo, teor, unid, difM: trazo - teor };
}
