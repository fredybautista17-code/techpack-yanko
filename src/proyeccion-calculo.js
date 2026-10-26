// ─── PROYECCIÓN POR ÁREA — CÁLCULO (sin pantalla) ─────────────────────────────
// (2026-10-24, a pedido de Fredy) Simula cómo se vacía el trabajo que hoy hay
// en el tubo productivo, área por área, de Corte a Terminación:
//
//   Sin cortar ──► CORTE ──► CONFECCIÓN ──► TERMINACIÓN ──► listo (BPT)
//
// Modelo (a propósito simple y explicable):
//  - Cada área tiene una capacidad en unidades por día laboral.
//  - Cada área atiende primero lo que tiene la fecha de entrega más cercana.
//  - Lo que sale de un área llega a la siguiente después de un colchón
//    (por defecto 0 = al siguiente día laboral).
//  - Un lote que hoy está en BPT ya está listo; lo que está en Corte, BMP o
//    Planta cuenta como trabajo pendiente de Confección; lo Semiterminado
//    (incluye lo que anda en procesos externos) es trabajo de Terminación;
//    lo que falta por cortar es trabajo de Corte.
//  - Materiales (fase 2): lo que espera tela/insumos no avanza hasta que llegan (ver `materiales` y `materialesCorte`).

export const AREAS_PROYECCION = [
  { id: "corte", label: "Corte" },
  { id: "confeccion", label: "Confección" },
  { id: "terminacion", label: "Terminación" },
];

const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const SIN_FECHA = "9999-12-31";

export function fechaISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
export function sumarDias(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return fechaISO(d);
}
export function diasEntre(aISO, bISO) {
  return Math.round((new Date(`${bISO}T00:00:00Z`) - new Date(`${aISO}T00:00:00Z`)) / 86400000);
}
export function lunesDe(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return fechaISO(d);
}
function soloFecha(v) {
  const s = String(v || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// Capacidad sugerida: promedio real de unidades netas que entraron a planta por
// día laboral en las últimas 8 semanas (Entradas de Planta).
export function capacidadSugerida(entradas, hoyISO, diasLaborales = [1, 2, 3, 4, 5]) {
  const desde = sumarDias(hoyISO, -56);
  let total = 0;
  (entradas || []).forEach((e) => {
    const f = soloFecha(e.fecha);
    if (f && f >= desde && f <= hoyISO) total += NUM(e.cantidad);
  });
  let laborales = 0;
  for (let i = 0; i < 56; i++) {
    const dow = new Date(`${sumarDias(hoyISO, -i)}T00:00:00Z`).getUTCDay();
    if (diasLaborales.includes(dow)) laborales += 1;
  }
  return laborales ? Math.max(0, Math.round(total / laborales)) : 0;
}

export function simularProyeccion({
  lotes = [],
  sinCortar = [],
  precioDe = () => 0,
  capacidad = {},
  hoyISO,
  sabado = false,
  colchonDias = 0,
  semanas = 8,
  maxDias = 540,
  // Fase 2: Map(String(numLote) -> { disponibleISO, pendientes, estado, texto, sinOC }) con lo que
  // falta de insumos de cada lote ya cortado. Un lote con insumos faltantes no puede empezar a
  // coserse (la parte que aún no se integra) hasta `disponibleISO`.
  materiales = null,
  // Fase 2, paso B: Map(key del pedido sin cortar `P|pedido|ref` -> { tandas:[{unid, disponibleISO|null}], ... })
  // con desde cuándo hay tela e insumos para cortar cada parte. Lo que espera material no entra a Corte antes.
  materialesCorte = null,
}) {
  const diasLaborales = sabado ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const orden = AREAS_PROYECCION.map((a) => a.id);
  const cap = {};
  orden.forEach((id) => { cap[id] = Math.max(0, NUM(capacidad[id])); });

  // ── Trabajos iniciales ─────────────────────────────────────────────────────
  const fichas = new Map(); // key -> datos del lote/pedido
  const colas = { corte: [], confeccion: [], terminacion: [] };
  let listoHoy = 0;
  let listoHoyValor = 0;
  let sinPrecioUnid = 0;

  function ficha(key, base) {
    if (!fichas.has(key)) {
      fichas.set(key, {
        key, ...base,
        unidades: 0, valor: 0,
        enBPT: 0, hechas: 0, ultimoDia: -1, dondeEsta: {},
      });
    }
    return fichas.get(key);
  }
  const jobsEnEspera = []; // trabajos de Confección que esperan material
  function agregar(area, key, base, unidades, precio, extra = {}) {
    if (!(unidades > 0.0001)) return;
    const f = ficha(key, base);
    f.unidades += unidades;
    f.valor += unidades * precio;
    f.dondeEsta[area] = (f.dondeEsta[area] || 0) + unidades;
    if (!(precio > 0)) sinPrecioUnid += unidades;
    const job = { key, units: unidades, ready: extra.ready || 0, due: base.entrega || SIN_FECHA, precio, espera: !!extra.espera, area };
    colas[area].push(job);
    if (job.espera) jobsEnEspera.push(job);
  }

  lotes.forEach((l) => {
    const ref = String(l.referencia || "").trim();
    const precio = NUM(precioDe(ref));
    const key = `L|${l.numLote ?? ""}|${l.numPedido ?? ""}|${ref}`;
    const base = {
      tipo: "lote",
      numLote: l.numLote ?? "",
      numPedido: l.numPedido ?? "",
      ref,
      cliente: l.clienteAgrupado || l.nombreCliente || "(Sin cliente)",
      planta: l.nombrePlanta || "",
      entrega: soloFecha(l.fechaEntregaPedidoISO) || soloFecha(l.fechaEntregaConfISO) || "",
      precio,
    };
    const enConf = NUM(l.invCorte) + NUM(l.invBMP) + NUM(l.invPlanta);
    const enTerm = NUM(l.invSemiterminado);
    const enBPT = NUM(l.invBPT);
    const mat = materiales ? materiales.get(String(l.numLote ?? "")) : null;
    let bloqueadas = 0;
    let readyBloq = 0;
    if (mat && mat.disponibleISO && NUM(mat.pendientes) > 0) {
      bloqueadas = Math.min(enConf, NUM(mat.pendientes));
      readyBloq = Math.max(0, diasEntre(hoyISO, mat.disponibleISO));
    }
    agregar("confeccion", key, base, enConf - bloqueadas, precio);
    if (bloqueadas > 0.0001) {
      if (readyBloq > 0) agregar("confeccion", key, base, bloqueadas, precio, { ready: readyBloq, espera: true });
      else agregar("confeccion", key, base, bloqueadas, precio);
    }
    const fch = ficha(key, base);
    fch.mat = mat || null;
    fch.bloqueadas = readyBloq > 0 ? bloqueadas : 0;
    fch.readyBloq = readyBloq;
    agregar("terminacion", key, base, enTerm, precio);
    if (enBPT > 0.0001) {
      const f = ficha(key, base);
      f.unidades += enBPT;
      f.valor += enBPT * precio;
      f.enBPT += enBPT;
      listoHoy += enBPT;
      listoHoyValor += enBPT * precio;
      if (!(precio > 0)) sinPrecioUnid += enBPT;
    }
  });
  sinCortar.forEach((s) => {
    const ref = String(s.ref || "").trim();
    const precio = NUM(s.precio) > 0 ? NUM(s.precio) : NUM(precioDe(ref));
    const key = `P|${s.numPed ?? ""}|${ref}`;
    const base = {
      tipo: "pedido",
      numLote: "",
      numPedido: s.numPed ?? "",
      ref,
      cliente: s.cliente || "(Sin cliente)",
      planta: "",
      entrega: soloFecha(s.fechaDespacho),
      precio,
    };
    const matC = materialesCorte ? materialesCorte.get(key) : null;
    let bloqC = 0;
    let readyC = 0;
    if (matC && Array.isArray(matC.tandas) && matC.tandas.length) {
      matC.tandas.forEach((t) => {
        const ready = t.disponibleISO ? Math.max(0, diasEntre(hoyISO, t.disponibleISO)) : 0;
        if (ready > 0) {
          bloqC += NUM(t.unid);
          readyC = Math.max(readyC, ready);
          agregar("corte", key, base, NUM(t.unid), precio, { ready, espera: true });
        } else agregar("corte", key, base, NUM(t.unid), precio);
      });
    } else agregar("corte", key, base, NUM(s.unid), precio);
    if (matC) {
      const fc = ficha(key, base);
      fc.mat = matC;
      fc.bloqueadas = (fc.bloqueadas || 0) + bloqC;
      fc.readyBloq = Math.max(fc.readyBloq || 0, readyC);
    }
  });

  // ── Contadores de trabajo que pasa por cada área (para el cuello) ──────────
  const trabajoTotal = { corte: 0, confeccion: 0, terminacion: 0 };
  colas.corte.forEach((j) => { trabajoTotal.corte += j.units; trabajoTotal.confeccion += j.units; trabajoTotal.terminacion += j.units; });
  colas.confeccion.forEach((j) => { trabajoTotal.confeccion += j.units; trabajoTotal.terminacion += j.units; });
  colas.terminacion.forEach((j) => { trabajoTotal.terminacion += j.units; });
  const colaInicial = {
    corte: colas.corte.reduce((s, j) => s + j.units, 0),
    confeccion: colas.confeccion.reduce((s, j) => s + j.units, 0),
    terminacion: colas.terminacion.reduce((s, j) => s + j.units, 0),
  };
  const valorInicial = {
    corte: colas.corte.reduce((s, j) => s + j.units * j.precio, 0),
    confeccion: colas.confeccion.reduce((s, j) => s + j.units * j.precio, 0),
    terminacion: colas.terminacion.reduce((s, j) => s + j.units * j.precio, 0),
  };

  // ── Simulación día por día ─────────────────────────────────────────────────
  const semanasMap = new Map(); // lunes -> { lunes, areas:{id:{entra,sale,valorSale,cola,colaValor,diasLab}}, listo, listoValor }
  function semanaDe(iso) {
    const lunes = lunesDe(iso);
    if (!semanasMap.has(lunes)) {
      const areas = {};
      orden.forEach((id) => { areas[id] = { entra: 0, sale: 0, valorSale: 0, cola: 0, colaValor: 0, diasLab: 0 }; });
      semanasMap.set(lunes, { lunes, areas, listo: 0, listoValor: 0, esperando: 0, esperandoCorte: 0 });
    }
    return semanasMap.get(lunes);
  }
  // El trabajo que esperaba material "entra" a Confección la semana en que se libera.
  jobsEnEspera.forEach((j) => { semanaDe(sumarDias(hoyISO, j.ready)).areas[j.area].entra += j.units; });
  const esperandoHoy = jobsEnEspera.filter((j) => j.area === "confeccion").reduce((sum, j) => sum + j.units, 0);
  const esperandoHoyCorte = jobsEnEspera.filter((j) => j.area === "corte").reduce((sum, j) => sum + j.units, 0);
  const diaAbsoluto = [];
  let ultimoDiaConTrabajo = -1;

  for (let d = 0; d < maxDias; d++) {
    const fecha = sumarDias(hoyISO, d);
    const sem = semanaDe(fecha);
    const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay();
    const laboral = diasLaborales.includes(dow);
    if (laboral) {
      orden.forEach((area, idx) => {
        sem.areas[area].diasLab += 1;
        let resto = cap[area];
        if (resto <= 0) return;
        const elegibles = colas[area]
          .filter((j) => j.ready <= d && j.units > 0.0001)
          .sort((a, b) => a.due.localeCompare(b.due) || a.ready - b.ready);
        for (const j of elegibles) {
          if (resto <= 0.0001) break;
          const q = Math.min(j.units, resto);
          j.units -= q;
          resto -= q;
          sem.areas[area].sale += q;
          sem.areas[area].valorSale += q * j.precio;
          const f = fichas.get(j.key);
          if (idx + 1 < orden.length) {
            const sig = orden[idx + 1];
            const lista = colas[sig];
            const ready = d + 1 + Math.max(0, Math.round(colchonDias));
            const ya = lista.find((x) => x.key === j.key && x.ready === ready);
            if (ya) ya.units += q;
            else lista.push({ key: j.key, units: q, ready, due: j.due, precio: j.precio });
            const semLlegada = semanaDe(sumarDias(hoyISO, ready));
            semLlegada.areas[sig].entra += q;
          } else {
            f.hechas += q;
            f.ultimoDia = d;
            sem.listo += q;
            sem.listoValor += q * j.precio;
          }
        }
        ultimoDiaConTrabajo = Math.max(ultimoDiaConTrabajo, resto < cap[area] ? d : -1);
      });
    }
    // Cola al cierre del día (la última foto de cada semana queda guardada).
    orden.forEach((area) => {
      let u = 0, v = 0;
      colas[area].forEach((j) => { if (j.units > 0.0001) { u += j.units; v += j.units * j.precio; } });
      sem.areas[area].cola = u;
      sem.areas[area].colaValor = v;
    });
    sem.esperando = colas.confeccion.reduce((sum, j) => sum + (j.espera && j.ready > d && j.units > 0.0001 ? j.units : 0), 0);
    sem.esperandoCorte = colas.corte.reduce((sum, j) => sum + (j.espera && j.ready > d && j.units > 0.0001 ? j.units : 0), 0);
    diaAbsoluto.push({ d, fecha, pendiente: orden.reduce((s, a) => s + colas[a].reduce((x, j) => x + Math.max(0, j.units), 0), 0) });
    const pendiente = diaAbsoluto[diaAbsoluto.length - 1].pendiente;
    if (pendiente < 0.0001 && d > 0) {
      // todo listo: cerramos la simulación dos días después para dejar la semana completa
      if (d > ultimoDiaConTrabajo + 1) break;
    }
  }

  // ── Semanas del horizonte (siempre las N pedidas, aunque no haya movimiento) ─
  const lunes0 = lunesDe(hoyISO);
  const filasSemanas = [];
  for (let i = 0; i < semanas; i++) {
    const lunes = sumarDias(lunes0, i * 7);
    const s = semanasMap.get(lunes) || semanaDe(lunes);
    // las semanas sin simulación (todo terminado antes) quedan con cola 0
    const areas = {};
    orden.forEach((id) => {
      const a = s.areas[id];
      const diasLab = a.diasLab || diasLaborales.length;
      const capSemana = cap[id] * diasLab;
      areas[id] = { ...a, diasLab, capSemana, carga: capSemana > 0 ? a.sale / capSemana : 0 };
    });
    filasSemanas.push({ lunes, areas, listo: s.listo, listoValor: s.listoValor, esperando: s.esperando || 0, esperandoCorte: s.esperandoCorte || 0 });
  }

  // ── Resumen por área ────────────────────────────────────────────────────────
  const resumenAreas = orden.map((id) => {
    const diasTrabajo = cap[id] > 0 ? trabajoTotal[id] / cap[id] : null; // días laborales para pasar TODO por esta área
    return {
      id,
      label: AREAS_PROYECCION.find((a) => a.id === id).label,
      capDia: cap[id],
      colaHoy: colaInicial[id],
      valorHoy: valorInicial[id],
      trabajoTotal: trabajoTotal[id],
      diasTrabajo,
      semanasTrabajo: diasTrabajo === null ? null : diasTrabajo / diasLaborales.length,
    };
  });
  const conCap = resumenAreas.filter((a) => a.diasTrabajo !== null && a.trabajoTotal > 0);
  const cuello = conCap.length ? conCap.reduce((a, b) => (b.diasTrabajo > a.diasTrabajo ? b : a)) : null;

  // ── Lotes / pedidos ─────────────────────────────────────────────────────────
  const filasLotes = [...fichas.values()].map((f) => {
    const pendiente = f.unidades - f.enBPT - f.hechas;
    const terminado = pendiente < 0.5;
    let listoISO = null;
    if (terminado) listoISO = f.ultimoDia >= 0 ? sumarDias(hoyISO, f.ultimoDia) : hoyISO;
    const entrega = f.entrega || "";
    const atraso = listoISO && entrega ? diasEntre(entrega, listoISO) : null;
    let estado = "sin_fecha";
    if (!listoISO) estado = entrega ? "atrasado" : "sin_horizonte";
    else if (entrega) estado = atraso > 0 ? "atrasado" : atraso >= -2 ? "justo" : "ok";
    const donde = Object.entries(f.dondeEsta).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return {
      key: f.key, tipo: f.tipo, numLote: f.numLote, numPedido: f.numPedido, ref: f.ref, cliente: f.cliente, planta: f.planta,
      unidades: f.unidades, valor: f.valor, precio: f.precio,
      entrega, listoISO, atraso, estado,
      dondeEsta: f.enBPT >= f.unidades - 0.5 ? "bpt" : donde[0] || "",
      sinHorizonte: !listoISO,
      materiales: f.mat || null,
      bloqueadas: f.bloqueadas || 0,
      materialDesde: f.bloqueadas > 0 ? sumarDias(hoyISO, f.readyBloq) : null,
    };
  });
  const resumirEspera = (arr) => ({
    lotes: arr.length,
    unidades: arr.reduce((sum, l) => sum + l.bloqueadas, 0),
    valor: arr.reduce((sum, l) => sum + l.bloqueadas * (l.precio || 0), 0),
    sinOC: arr.filter((l) => l.materiales && l.materiales.sinOC).length,
  });
  const esperanMaterial = resumirEspera(filasLotes.filter((l) => l.tipo === "lote" && l.bloqueadas > 0));
  const esperanCorte = resumirEspera(filasLotes.filter((l) => l.tipo === "pedido" && l.bloqueadas > 0));
  const enRiesgo = filasLotes.filter((l) => l.estado === "atrasado");
  const valorEnRiesgo = enRiesgo.reduce((s, l) => s + l.valor, 0);
  const unidadesEnRiesgo = enRiesgo.reduce((s, l) => s + l.unidades, 0);

  return {
    hoyISO,
    diasLaborales,
    capacidad: cap,
    semanas: filasSemanas,
    areas: resumenAreas,
    cuello,
    lotes: filasLotes,
    listoHoy, listoHoyValor,
    totalUnidades: filasLotes.reduce((s, l) => s + l.unidades, 0),
    totalValor: filasLotes.reduce((s, l) => s + l.valor, 0),
    sinPrecioUnid,
    enRiesgo: { cantidad: enRiesgo.length, unidades: unidadesEnRiesgo, valor: valorEnRiesgo },
    esperanMaterial,
    esperanCorte,
    esperandoHoy,
    esperandoHoyCorte,
    sinCapacidad: orden.filter((id) => cap[id] <= 0 && trabajoTotal[id] > 0),
  };
}
