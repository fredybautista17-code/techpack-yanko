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
        // Una línea por referencia (el corte trae una por color): se suman las unidades de cada referencia.
        refs: [...refs.reduce((m, r) => m.set(String(r.ref), (m.get(String(r.ref)) || 0) + (Number(r.total) || 0)), new Map())].map(([ref, total]) => ({ ref, total })),
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
      refsDetalle: c.refs.map((r) => ({ ref: r.ref, total: Number(r.total) || 0 })),
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

// Cuando el Visor de Busint no trae el corte, el teórico y el real salen del detalle de telas del lote
// (getConsumoTelaLotesBusint: ficha "telas" × unidades contra largo × capas + ajuste por tela).
// detallePorLote[lote] = { realM, teorM, unidades, costoPorMetro, sinFicha, telas: [{ tela, realM, teorM, difM, costoMetro, sinPareja }] }
// Si el lote tiene varios cortes en ATLAS, el detalle se asigna al primero (el de fecha más antigua).
export function aplicarDetalleTelasConsumo(filas, detallePorLote, tol = TOLERANCIA_CONSUMO) {
  const det = detallePorLote || {};
  const primera = new Map();
  filas.forEach((f) => {
    if (f.origen !== "atlas" || !f.lote) return;
    const p = primera.get(f.lote);
    if (!p || String(f.fecha) < String(p.fecha)) primera.set(f.lote, f);
  });
  return filas.map((f) => {
    const d = f.origen === "atlas" && f.lote ? det[f.lote] : null;
    if (!d || primera.get(f.lote) !== f) return f;
    if (f.teorM > 0 && f.realM > 0) return f; // el Visor manda cuando trae el corte completo
    const realM = d.realM > 0 ? d.realM : null;
    const teorM = d.teorM > 0 ? d.teorM : null;
    const unid = d.unidades > 0 ? d.unidades : f.unidades;
    const trazoVsTeor = pctSobre(f.trazoM, teorM);
    const realVsTeor = pctSobre(realM, teorM);
    let estado;
    if (realM === null) estado = "esperando";
    else if (teorM === null) estado = "sin_teorico";
    else estado = peor(clasificarDif(trazoVsTeor, tol), clasificarDif(realVsTeor, tol)) || "esperando";
    return {
      ...f,
      teorM,
      teorPorPrenda: teorM !== null && unid > 0 ? teorM / unid : null,
      realM,
      realPorPrenda: realM !== null && unid > 0 ? realM / unid : null,
      trazoVsTeor,
      realVsTeor,
      trazoVsReal: pctSobre(f.trazoM, realM),
      estado,
      conBusint: realM !== null,
      fuente: "detalle",
      unidadesLote: unid,
      porTela: Array.isArray(d.telas) ? d.telas : [],
      sinFicha: Array.isArray(d.sinFicha) ? d.sinFicha : [],
    };
  });
}

// ─── Lo COTIZADO (2026-11-11, a pedido de Fredy) ───────────────────────────────────────────────────────────
// El precio de venta se armó con el consumo de tela de la cotización. Se toma, por referencia, la ÚLTIMA versión aprobada de la
// cotización (la misma que usa "Para renegociar") y se suman los consumos (m por prenda) de sus telas.
const normRefCot = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
const numCot = (x) => {
  const v = Number(String(x === null || x === undefined ? "" : x).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
export function cotizadoPorReferencia(cotizaciones) {
  const out = {};
  (cotizaciones || []).forEach((c) => {
    if (!c || c.eliminado) return;
    const ref = normRefCot(c.referencia);
    if (!ref) return;
    const aprobadas = (c.versiones || []).filter((v) => v && v.estado === "aprobada");
    const v = aprobadas[aprobadas.length - 1];
    if (!v || !v.v) return;
    const telas = (v.v.telas || []).map((t) => ({ material: String(t.material || "").trim(), consumo: numCot(t.consumo) })).filter((t) => t.consumo > 0);
    const consumo = telas.reduce((s, t) => s + t.consumo, 0);
    if (!(consumo > 0)) return;
    const previa = out[ref];
    if (previa && String(previa.fecha) > String(v.fecha || "")) return;
    out[ref] = { consumo, telas, version: v.numero, fecha: v.fecha || "", cotizacion: c.nombre || "" };
  });
  return out;
}

// Agrega a cada lote lo que se cotizó (cotizM = consumo cotizado × unidades de cada referencia). Si una referencia no tiene
// cotización aprobada, el lote queda con `sinCotizacion` y se sigue comparando contra la ficha. cotPorRef === null = aún no cargadas.
export function aplicarCotizadoConsumo(filas, cotPorRef) {
  if (!cotPorRef) return filas;
  return filas.map((f) => {
    const refs = Array.isArray(f.refsDetalle) && f.refsDetalle.length
      ? f.refsDetalle
      : (f.refs || []).length === 1 ? [{ ref: f.refs[0], total: Number(f.unidades) || 0 }] : [];
    if (!refs.length) return f;
    const faltan = refs.filter((r) => !cotPorRef[normRefCot(r.ref)]).map((r) => r.ref);
    if (faltan.length) return { ...f, sinCotizacion: faltan };
    const unidadesF = refs.reduce((s, r) => s + (Number(r.total) || 0), 0);
    if (!(unidadesF > 0)) return f;
    // Si el detalle de telas junta varios cortes del lote, lo cotizado se escala a las unidades de todo el lote.
    const escala = f.fuente === "detalle" && f.unidadesLote > unidadesF ? f.unidadesLote / unidadesF : 1;
    const cotizM = refs.reduce((s, r) => s + cotPorRef[normRefCot(r.ref)].consumo * (Number(r.total) || 0), 0) * escala;
    const versiones = [...new Set(refs.map((r) => `${r.ref} V${cotPorRef[normRefCot(r.ref)].version}`))];
    return { ...f, cotizM: redondear(cotizM, 2), cotizVersiones: versiones };
  });
}

// Costo de la tela por lote (Busint): costoPorMetro = valor de la tela del lote / sus metros.
// «Pagué de más» = (metros reales − metros teóricos) × costo por metro (negativo = ahorro).
export function aplicarCostoTelaConsumo(filas, costosPorLote) {
  return filas.map((f) => {
    const c = f.lote ? (costosPorLote || {})[String(f.lote)] : null;
    const costoMetro = c && c.costoPorMetro > 0 ? c.costoPorMetro : null;
    const difM = f.realM !== null && f.realM !== undefined && f.teorM !== null && f.teorM !== undefined ? f.realM - f.teorM : null;
    // Contra lo cotizado: (real − cotizado) × costo por metro de la tela del lote.
    if (f.cotizM > 0 && f.realM > 0) {
      const difCot = f.realM - f.cotizM;
      return { ...f, costoMetro, difM: difCot, pagadoDeMas: costoMetro !== null ? Math.round(difCot * costoMetro) : null };
    }
    // Con el detalle por tela, cada tela se valora con su propio costo (MUNICH y AMORELA no cuestan lo mismo).
    if (f.fuente === "detalle" && Array.isArray(f.porTela) && f.porTela.length && difM !== null) {
      let pesos = 0;
      let sinPrecio = false;
      f.porTela.forEach((t) => {
        if (!t.difM) return;
        const cm = t.costoMetro > 0 ? t.costoMetro : costoMetro;
        if (cm > 0) pesos += t.difM * cm;
        else sinPrecio = true;
      });
      return { ...f, costoMetro, difM, pagadoDeMas: sinPrecio ? null : Math.round(pesos) };
    }
    return { ...f, costoMetro, difM, pagadoDeMas: costoMetro !== null && difM !== null ? Math.round(difM * costoMetro) : null };
  });
}

// Clasificación en palabras para las tarjetas (2026-11-11): un solo límite en vez de dos.
//   tipo: "menos" (ahorró tela) | "mas" (gastó de más) | "normal" (hasta `limite` %) | "falta" (sin real o sin ficha)
//   avisos: textos para revisar (lo tendido no coincide con Busint, telas sin pareja entre ficha y corte, referencia sin ficha).
export function clasificarConsumoSimple(filas, limite = TOLERANCIA_CONSUMO.verde) {
  const m1 = (n) => Number(n).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return filas.map((f) => {
    const avisos = [];
    const tieneReal = f.realM > 0;
    const baseM = f.cotizM > 0 ? f.cotizM : f.teorM;
    const tieneTeor = baseM > 0;
    let tipo = "falta";
    let difPct = null;
    if (tieneReal && tieneTeor) {
      difPct = pctSobre(f.realM, baseM);
      tipo = difPct > limite ? "mas" : difPct < -limite ? "menos" : "normal";
    }
    if (f.trazoM > 0 && tieneReal) {
      const t = pctSobre(f.trazoM, f.realM);
      if (t !== null && Math.abs(t) > limite) {
        avisos.push(`Lo tendido (${m1(f.trazoM)} m) y lo que registró Busint (${m1(f.realM)} m) difieren ${m1(Math.abs(t))} %: revisar capas o registro.`);
      }
    }
    if (f.cotizM > 0 && f.teorM > 0) {
      const p = pctSobre(f.cotizM, f.teorM);
      if (p !== null && Math.abs(p) > limite) {
        const u = f.unidadesLote > 0 ? f.unidadesLote : f.unidades;
        const pp = (n) => (u > 0 ? Number(n / u).toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : m1(n));
        avisos.push(`La ficha de telas de Busint (${pp(f.teorM)} m por prenda) y la cotización (${pp(f.cotizM)} m) no coinciden (${p > 0 ? "+" : ""}${m1(p)} %). Conviene corregir la que esté mal.`);
      }
    }
    const sinPareja = (f.porTela || []).filter((t) => t.sinPareja);
    if (sinPareja.length) {
      avisos.push(
        `Hay telas que no coinciden entre la ficha y el corte: ${sinPareja.map((t) => `${t.tela} (${t.realM > 0 ? `se usó ${m1(t.realM)} m y no está en la ficha` : "está en la ficha y no se cortó"})`).join("; ")}. Puede ser un cambio de tela o un nombre distinto, y por eso el dinero puede variar aunque los metros totales cuadren.`
      );
    }
    if (f.sinFicha && f.sinFicha.length) avisos.push(`No hay ficha de telas en Busint para: ${f.sinFicha.join(", ")}.`);
    return { ...f, tipo, difPct, avisos, baseM: tieneTeor ? baseM : null, baseCot: f.cotizM > 0 };
  });
}

export function resumenConsumoTela(filas) {
  const cuenta = { cruza: 0, revisar: 0, nocruza: 0, esperando: 0, sin_teorico: 0 };
  filas.forEach((f) => { cuenta[f.estado] = (cuenta[f.estado] || 0) + 1; });
  const baseDe = (f) => (f.cotizM > 0 ? f.cotizM : f.teorM);
  const conReal = filas.filter((f) => baseDe(f) > 0 && f.realM > 0);
  const teor = conReal.reduce((s, f) => s + baseDe(f), 0);
  const real = conReal.reduce((s, f) => s + f.realM, 0);
  const trazo = conReal.reduce((s, f) => s + (f.trazoM || 0), 0);
  const conPesos = conReal.filter((f) => f.pagadoDeMas !== null && f.pagadoDeMas !== undefined);
  const pesos = conPesos.reduce((s, f) => s + f.pagadoDeMas, 0);
  return { cuenta, teor: redondear(teor), real: redondear(real), trazo: redondear(trazo), pctReal: pctSobre(real, teor), n: conReal.length, nCot: conReal.filter((f) => f.cotizM > 0).length, pesos, nPesos: conPesos.length, sinPrecio: conReal.length - conPesos.length };
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
