// "Mi lista por programar" (2026-10-26, a pedido de Fredy): lista de pendientes
// del líder de Zona calor / Control de calidad. Cálculo puro (sin Firebase ni
// React) para poder probarlo aparte.
//
// Reglas pedidas por Fredy:
//  1. Entran los lotes que están en el proceso del área (los mismos lotes
//     que ya ve el Programador de Procesos: carga activa de Busint, con
//     inventario > 0 en ese proceso).
//  2. Programa el LÍDER (fecha, hora, trabajador de su equipo, cantidad).
//  3. "Cumplido" sale SOLO de Busint (ENTRADA registrada en el proceso).
//     Nada se marca a mano ni se toma de Nómina.

export function normProceso(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

const ORDEN_PRIORIDAD = { Alta: 0, Media: 1, Normal: 2 };

// Prioridad: si Planta ya le puso prioridad al lote (Planta → Programación
// Diaria) se respeta. Si no, sale de qué tan cerca está la fecha de entrega
// del pedido: vencida o a 3 días o menos = Alta; hasta 10 días = Media.
export function prioridadDe(diasEntrega, prioridadPlanta) {
  const p = String(prioridadPlanta || "").trim().toLowerCase();
  if (p === "alta") return "Alta";
  if (p === "media") return "Media";
  if (p === "normal" || p === "baja") return "Normal";
  if (diasEntrega === null || diasEntrega === undefined) return "Normal";
  if (diasEntrega <= 3) return "Alta";
  if (diasEntrega <= 10) return "Media";
  return "Normal";
}

function diasEntreISO(fechaISO, hoyISO) {
  if (!fechaISO || !hoyISO) return null;
  const [y, m, d] = String(fechaISO).slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = String(hoyISO).slice(0, 10).split("-").map(Number);
  if (!y || !y2) return null;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

// Lote → prioridad que Planta le dio (la programación más reciente no cumplida).
export function prioridadesDePlanta(programacionPlanta) {
  const m = new Map();
  (programacionPlanta || [])
    .filter((p) => p.estado !== "cumplido" && p.prioridad)
    .forEach((p) => {
      const k = String(p.numLote);
      const prev = m.get(k);
      if (!prev || String(p.creadoEn || "") > String(prev.creadoEn || "")) m.set(k, p);
    });
  const out = new Map();
  m.forEach((v, k) => out.set(k, v.prioridad));
  return out;
}

// Lotes de la carga activa que están en alguno de los procesos del área.
export function lotesEnProcesos(lotes, procesos, hoyISO, prioPlanta) {
  const mios = new Set((procesos || []).map(normProceso));
  const filas = [];
  (lotes || []).forEach((l) => {
    (l.procesos || []).forEach((p) => {
      if (!mios.has(normProceso(p.nombre))) return;
      const inv = Number(p.inventario) || 0;
      if (!(inv > 0)) return;
      const dias = diasEntreISO(l.fechaEntregaPedidoISO, hoyISO);
      filas.push({
        numLote: l.numLote,
        referencia: l.referencia,
        cliente: l.clienteAgrupado || l.nombreCliente || "",
        proceso: p.nombre,
        inventario: inv,
        planta: p.planta || "",
        fechaEntregaPedido: l.fechaEntregaPedidoISO || null,
        diasEntrega: dias,
        prioridad: prioridadDe(dias, prioPlanta?.get(String(l.numLote))),
      });
    });
  });
  return filas;
}

function claveLP(numLote, proceso) {
  return `${numLote}||${normProceso(proceso)}`;
}

// Estado de CADA programación contra Busint (solo ENTRADAS).
// - Entrada = el proceso registró trabajo terminado del lote (la misma que
//   usa la Auditoría Busint vs Nómina).
// - Una entrada anterior al día en que se creó la programación es de una
//   pasada anterior y no cuenta.
// - Si el mismo lote+proceso está repartido entre varios trabajadores, Busint
//   no dice quién lo hizo: las unidades entradas se reparten en orden (fecha,
//   hora) hasta cubrir la cantidad de cada programación.
export function estadosProgramaciones(programaciones, entradas, hoyISO) {
  const entPorClave = new Map();
  (entradas || []).forEach((r) => entPorClave.set(claveLP(r.numLote, r.proceso), r));
  const grupos = new Map();
  (programaciones || []).forEach((p) => {
    const k = claveLP(p.numLote, p.proceso);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  const out = [];
  grupos.forEach((lista, k) => {
    const ent = entPorClave.get(k);
    const ordenadas = [...lista].sort(
      (a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "") || (a.horaInicio || "").localeCompare(b.horaInicio || "")
    );
    const desde = ordenadas.map((p) => String(p.creadoEn || "").slice(0, 10)).filter(Boolean).sort()[0] || "";
    const vale = !!ent && (!desde || (ent.ultima || ent.primera || "") >= desde);
    let disponible = vale ? Number(ent.total) || 0 : 0;
    ordenadas.forEach((p) => {
      const cant = p.cantidad == null ? null : Number(p.cantidad) || 0;
      let hecho = 0;
      if (disponible > 0) {
        hecho = cant === null ? disponible : Math.min(cant, disponible);
        disponible = Math.max(0, disponible - hecho);
      }
      const completo = cant === null ? hecho > 0 : hecho >= cant;
      const fechaCumplimiento = vale ? (ent.ultima || ent.primera || null) : null;
      let estado;
      if (completo) estado = "CUMPLIDO";
      else if ((p.fechaProgramada || "") < hoyISO) estado = "VENCIDO";
      else estado = "PROGRAMADO";
      out.push({
        ...p,
        estado,
        hecho,
        parcial: !completo && hecho > 0,
        fechaCumplimiento: completo ? fechaCumplimiento : null,
        llegoVencido: completo && !!fechaCumplimiento && fechaCumplimiento > (p.fechaProgramada || ""),
      });
    });
  });
  return out.sort((a, b) => (a.fechaProgramada || "").localeCompare(b.fechaProgramada || "") || (a.horaInicio || "").localeCompare(b.horaInicio || ""));
}

// Arma toda la lista: por programar / programados / vencidos / cumplidos.
export function armarListaPorProgramar({ lotes, procesos, programaciones, entradas, hoyISO, prioPlanta }) {
  const mios = new Set((procesos || []).map(normProceso));
  const progs = estadosProgramaciones(
    (programaciones || []).filter((p) => mios.has(normProceso(p.proceso))),
    entradas,
    hoyISO
  );
  // Cuánto ya está comprometido por lote+proceso (programaciones no cumplidas).
  const asignado = new Map();
  progs.filter((p) => p.estado !== "CUMPLIDO").forEach((p) => {
    const k = claveLP(p.numLote, p.proceso);
    if (asignado.get(k) === Infinity) return;
    if (p.cantidad == null) { asignado.set(k, Infinity); return; }
    asignado.set(k, (asignado.get(k) || 0) + Math.max(0, (Number(p.cantidad) || 0) - (p.hecho || 0)));
  });
  const enProceso = lotesEnProcesos(lotes, procesos, hoyISO, prioPlanta);
  const porProgramar = enProceso
    .map((f) => {
      const a = asignado.get(claveLP(f.numLote, f.proceso)) || 0;
      const restante = a === Infinity ? 0 : Math.max(0, f.inventario - a);
      return { ...f, programado: a === Infinity ? f.inventario : Math.min(a, f.inventario), restante };
    })
    .filter((f) => f.restante > 0)
    .sort(
      (a, b) =>
        (ORDEN_PRIORIDAD[a.prioridad] ?? 3) - (ORDEN_PRIORIDAD[b.prioridad] ?? 3) ||
        (a.diasEntrega ?? 9999) - (b.diasEntrega ?? 9999) ||
        String(a.numLote).localeCompare(String(b.numLote))
    );
  const infoLote = new Map(enProceso.map((f) => [claveLP(f.numLote, f.proceso), f]));
  const conDatosLote = (p) => {
    const f = infoLote.get(claveLP(p.numLote, p.proceso));
    return { ...p, prioridad: f?.prioridad || null, diasEntrega: f?.diasEntrega ?? null };
  };
  const programados = progs.filter((p) => p.estado === "PROGRAMADO").map(conDatosLote);
  const vencidos = progs.filter((p) => p.estado === "VENCIDO").map(conDatosLote);
  const cumplidos = progs
    .filter((p) => p.estado === "CUMPLIDO")
    .map(conDatosLote)
    .sort((a, b) => (b.fechaCumplimiento || "").localeCompare(a.fechaCumplimiento || ""));
  return {
    porProgramar,
    programados,
    vencidos,
    cumplidos,
    resumen: {
      porProgramar: porProgramar.length,
      unidadesPorProgramar: porProgramar.reduce((s, f) => s + f.restante, 0),
      programados: programados.length,
      programadosHoy: programados.filter((p) => p.fechaProgramada === hoyISO).length,
      vencidos: vencidos.length,
      cumplidos: cumplidos.length,
      altas: porProgramar.filter((f) => f.prioridad === "Alta").length,
    },
  };
}
