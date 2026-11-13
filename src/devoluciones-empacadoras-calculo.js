// ─── DEVOLUCIONES · EMPACADORAS: CÁLCULO (sin React ni Firebase) ──────────────────────────────────────────────
// (2026-11-13, a pedido de Fredy) Cuando Calidad revisa una devolución se quiere saber quién empacó ese lote. No se elige a mano ni de una lista
// fija: se trae de Nómina → producción del proceso «Terminación» de ese lote (nomina_produccion.numLote). Un lote lo pueden empacar varias
// personas: las unidades devueltas se reparten en proporción a lo que empacó cada una. Las estadísticas salen de lo que se guardó en cada
// devolución (empacadoras: [{id, nombre, und, devueltas}]) y de las unidades empacadas del período en Nómina.

export const PARAMS_DEFECTO = { procesos: ["TERMINACION"], excluidos: [] };

// Mayúsculas, sin tildes y sin espacios de más (Nómina guarda «TERMINACIÓN» o «Terminación» según quién lo escribió).
export const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

// cfg = documento config/devoluciones_empacadoras: { procesos: ["TERMINACION"], excluidos: [{id, nombre}] }
export function paramsEmpacadoras(cfg) {
  const procesos = (Array.isArray(cfg?.procesos) ? cfg.procesos : []).map(sinTildes).filter(Boolean);
  const excluidos = (Array.isArray(cfg?.excluidos) ? cfg.excluidos : []).map((e) => (typeof e === "object" ? e?.id : e)).filter(Boolean).map(String);
  return { procesos: procesos.length ? procesos : PARAMS_DEFECTO.procesos, excluidos };
}

export const esProcesoEmpaque = (proceso, params) => {
  const n = sinTildes(proceso);
  return !!n && (params?.procesos || PARAMS_DEFECTO.procesos).some((p) => n.includes(p));
};

const clavePersona = (r) => String(r.trabajadorId || sinTildes(r.trabajadorNombre) || "");

// Registros de nomina_produccion de UN lote → quién empacó y cuánto. Ordenado de más a menos unidades.
export function empacadorasDeRegistros(registros, params) {
  const excl = new Set((params?.excluidos || []).map(String));
  const m = new Map();
  (registros || []).forEach((r) => {
    if (!esProcesoEmpaque(r.proceso, params)) return;
    const k = clavePersona(r);
    if (!k || excl.has(k)) return;
    const u = Number(r.cantidad) || 0;
    const prev = m.get(k) || { id: k, nombre: r.trabajadorNombre || k, und: 0 };
    prev.und += u;
    if (!prev.nombre || prev.nombre === prev.id) prev.nombre = r.trabajadorNombre || prev.nombre;
    m.set(k, prev);
  });
  return [...m.values()].filter((e) => e.und > 0).sort((a, b) => b.und - a.und || a.nombre.localeCompare(b.nombre));
}

// Procesos distintos que SÍ tiene el lote en Nómina (para explicar por qué no apareció nadie).
export const procesosDeRegistros = (registros) => [...new Set((registros || []).map((r) => String(r.proceso || "").trim()).filter(Boolean))];

// Reparte `total` unidades devueltas entre las personas, en proporción a `und` (si nadie tiene `und`, a partes iguales).
// Método del mayor resto: la suma siempre da exactamente `total`.
export function repartirUnidades(items, total) {
  const lista = items || [];
  const t = Math.max(0, Math.floor(Number(total) || 0));
  if (!lista.length) return [];
  let pesos = lista.map((i) => (Number(i.und) > 0 ? Number(i.und) : 0));
  let suma = pesos.reduce((a, b) => a + b, 0);
  if (!(suma > 0)) { pesos = lista.map(() => 1); suma = lista.length; }
  const cuotas = pesos.map((w) => (t * w) / suma);
  const base = cuotas.map(Math.floor);
  let resto = t - base.reduce((a, b) => a + b, 0);
  const orden = cuotas.map((c, i) => ({ i, f: c - Math.floor(c) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; k < orden.length && resto > 0; k++, resto--) base[orden[k].i] += 1;
  return lista.map((e, i) => ({ ...e, devueltas: base[i] }));
}

// Unidades devueltas de una devolución: lo que Calidad contó; si todavía no hay conteo, lo declarado.
export function unidadesDevueltas(d) {
  const contado = Number(d?.totalContado);
  if (Array.isArray(d?.conteo) && Number.isFinite(contado)) return contado;
  return Number(d?.total) || 0;
}

export const fechaDeDevolucion = (d) => String(d?.revisadoEn || d?.recibidaEn || d?.creadoEn || d?.historial?.[0]?.fecha || "").slice(0, 10);

// ── Períodos ──
export const PERIODOS = [
  { k: "mes", label: "Este mes" },
  { k: "mes_ant", label: "Mes pasado" },
  { k: "3m", label: "Últimos 3 meses" },
  { k: "anio", label: "Este año" },
  { k: "rango", label: "Elegir fechas" },
];
const pad = (n) => String(n).padStart(2, "0");
const ultimoDia = (y, m) => new Date(y, m, 0).getDate(); // m = 1..12
export function rangoPeriodo(k, hoyISO, desde, hasta) {
  const y = Number(hoyISO.slice(0, 4)), m = Number(hoyISO.slice(5, 7));
  if (k === "mes") return { desde: `${y}-${pad(m)}-01`, hasta: hoyISO };
  if (k === "mes_ant") { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return { desde: `${py}-${pad(pm)}-01`, hasta: `${py}-${pad(pm)}-${pad(ultimoDia(py, pm))}` }; }
  if (k === "3m") { let py = y, pm = m - 2; if (pm < 1) { pm += 12; py -= 1; } return { desde: `${py}-${pad(pm)}-01`, hasta: hoyISO }; }
  if (k === "anio") return { desde: `${y}-01-01`, hasta: hoyISO };
  return { desde: desde || `${y}-${pad(m)}-01`, hasta: hasta || hoyISO };
}
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const etiquetaMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1] || ym} ${ym.slice(2, 4)}`;

// ── Estadísticas ──
// devs: devoluciones_cliente · produccion: nomina_produccion del período (cualquier proceso; aquí se filtra).
export function estadisticasEmpacadoras({ devs, produccion, params, desde, hasta, cliente, motivo }) {
  const excl = new Set((params?.excluidos || []).map(String));
  const enRango = (f) => !!f && f >= desde && f <= hasta;
  const sel = (devs || []).filter((d) => {
    if (!(d.conteo?.length || d.empacadoras?.length)) return false; // solo las que Calidad ya revisó
    if (!enRango(fechaDeDevolucion(d))) return false;
    if (cliente && d.cliente !== cliente) return false;
    if (motivo && d.motivo !== motivo) return false;
    return true;
  });

  const personas = new Map();
  const persona = (id, nombre) => {
    if (!personas.has(id)) personas.set(id, { id, nombre: nombre || id, empacadas: 0, devueltas: 0, devoluciones: 0, motivos: new Map() });
    return personas.get(id);
  };
  let empacadasTotal = 0;
  (produccion || []).forEach((p) => {
    if (!esProcesoEmpaque(p.proceso, params) || !enRango(String(p.fecha || "").slice(0, 10))) return;
    const k = clavePersona(p);
    if (!k || excl.has(k)) return;
    const u = Number(p.cantidad) || 0;
    persona(k, p.trabajadorNombre).empacadas += u;
    empacadasTotal += u;
  });

  let devueltasTotal = 0, sinAsignar = 0;
  const motivos = new Map(), meses = new Map(), detalle = [];
  sel.forEach((d) => {
    const u = unidadesDevueltas(d);
    devueltasTotal += u;
    const mo = d.motivo || "Sin motivo";
    motivos.set(mo, (motivos.get(mo) || 0) + u);
    const ym = fechaDeDevolucion(d).slice(0, 7);
    const mm = meses.get(ym) || { ym, devueltas: 0, devoluciones: 0 };
    mm.devueltas += u; mm.devoluciones += 1; meses.set(ym, mm);
    const emp = (d.empacadoras || []).filter((e) => !excl.has(String(e.id)));
    if (!emp.length) sinAsignar += u;
    emp.forEach((e) => {
      const p = persona(String(e.id), e.nombre);
      const dv = Number(e.devueltas) || 0;
      p.devueltas += dv; p.devoluciones += 1;
      p.motivos.set(mo, (p.motivos.get(mo) || 0) + dv);
    });
    detalle.push({ id: d.id, numero: d.numero, fecha: fechaDeDevolucion(d), lote: d.lote, ref: d.ref, cliente: d.cliente, motivo: d.motivo || "", unidades: u, empacadoras: emp, origen: d.empacadorasOrigen || "" });
  });

  const ranking = [...personas.values()]
    .filter((p) => p.empacadas > 0 || p.devueltas > 0)
    .map((p) => ({ ...p, tasa: p.empacadas > 0 ? (p.devueltas / p.empacadas) * 100 : null, motivoTop: [...p.motivos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "" }))
    .sort((a, b) => b.devueltas - a.devueltas || b.empacadas - a.empacadas);

  return {
    devoluciones: sel.length, devueltasTotal, empacadasTotal, sinAsignar,
    tasaGlobal: empacadasTotal > 0 ? (devueltasTotal / empacadasTotal) * 100 : null,
    ranking,
    motivos: [...motivos.entries()].map(([motivo, und]) => ({ motivo, und })).sort((a, b) => b.und - a.und),
    meses: [...meses.values()].sort((a, b) => a.ym.localeCompare(b.ym)),
    detalle: detalle.sort((a, b) => b.fecha.localeCompare(a.fecha)),
    clientes: [...new Set((devs || []).map((d) => d.cliente).filter(Boolean))].sort(),
    motivosDisponibles: [...new Set((devs || []).map((d) => d.motivo).filter(Boolean))].sort(),
  };
}
