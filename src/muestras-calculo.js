// ─── Cronograma de Muestras: ESTADÍSTICAS y COSTOS (cálculo puro, sin pantalla) ────────────────────────────────────
// (2026-11-24, a pedido de Fredy; maquetas «estadisticas» y «costos» del Cronograma de Muestras.)
// Todas las fechas son texto AAAA-MM-DD (como se guardan en `cronograma_muestras`).
//
// Definiciones (las mismas que se explican en pantalla):
//  · Enviada  = la muestra se creó en el cronograma (`createdAt`).
//  · Terminada por el taller (entregada) = la fecha en que volvió del taller: `fechaRecibida` (si falta: fecha de la 1.ª revisión de diseño,
//    `fechaRevision` o `fechaTerminada`). Es la que cuenta para «costo por muestra» y «entregadas a tiempo».
//  · A tiempo = entregada el día de la fecha de entrega esperada o antes. Sin fecha esperada o sin fecha de entrega: «sin dato» (no cuenta).
//  · Aprobada a la primera = su primera revisión de diseño fue «aprobada».
//  · Vencida = sin asignar o asignada (aún en el taller) con la fecha de entrega ya pasada (igual que la Agenda).

export const ESTADOS_EN_CURSO = ["pendiente", "asignado", "recibida", "modificar"];
const SIN_TALLER = "(Sin taller)";

export const f10 = (v) => String(v || "").slice(0, 10);
export const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aUTC = (iso) => { const [y, m, d] = f10(iso).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
// Días desde `desde` hasta `hasta` (positivo si `hasta` es posterior).
export const difDias = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
export function sumarDias(iso, n) {
  const t = new Date(aUTC(iso) + n * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
export const mesDe = (iso) => f10(iso).slice(0, 7);
export const tallerDe = (c) => String(c.taller || "").trim() || SIN_TALLER;
export const claveTexto = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function fechaTerminadaTaller(c) {
  const r0 = (c.revisiones || [])[0];
  return f10(c.fechaRecibida || (r0 && r0.fecha) || c.fechaRevision || c.fechaTerminada || "");
}
// (2026-11-24) Para «Costos»: en qué fecha cuenta una muestra como entregada por el taller.
// Real = «Recibida del taller», 1.ª revisión o fecha de revisión. Antes del 13/11/2026 esa marca no se registraba: las muestras que ya terminaron
// (recibida, aprobada, a modificar, enviada, terminada) sin fecha real se ESTIMAN con la fecha de entrega esperada (o la de envío si falta).
// La fecha en que se «cerró» la muestra (fechaTerminada, cierre en bloque) no cuenta como entrega: es el día del cierre, no de la entrega.
export const ESTADOS_ENTREGADA = ["recibida", "aprobado", "modificar", "enviado", "terminada"];
export function fechaEntregaCosto(c) {
  const r0 = (c.revisiones || [])[0];
  const real = f10(c.fechaRecibida || (r0 && r0.fecha) || c.fechaRevision || "");
  if (real) return { fecha: real, estimada: false };
  if (ESTADOS_ENTREGADA.includes(c.estado || "")) {
    const f = f10(c.fechaEntrega || c.createdAt || c.fechaTerminada || "");
    // Una muestra que ya terminó no pudo entregarse en el futuro: se topa en hoy.
    if (f) return { fecha: f > isoLocal(new Date()) ? isoLocal(new Date()) : f, estimada: true };
  }
  return { fecha: "", estimada: false };
}
export const primeraRevision = (c) => (c.revisiones || [])[0] || null;
export function fechaAprobacion(c) {
  const r = (c.revisiones || []).find((x) => x.resultado === "aprobada");
  return r ? f10(r.fecha) : "";
}
export const enRango = (fecha, desde, hasta) => !!fecha && (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

// Rango de fechas de los botones de período.
export function rangoPeriodo(clave, hoy) {
  if (clave === "todo") return { desde: "", hasta: hoy };
  if (clave === "30") return { desde: sumarDias(hoy, -29), hasta: hoy };
  if (clave === "90") return { desde: sumarDias(hoy, -89), hasta: hoy };
  // 6 meses: desde el día 1 de hace 5 meses.
  const [y, m] = hoy.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - 5, 1));
  return { desde: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`, hasta: hoy };
}

const promedio = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);

function porcentajePrimera(lista, desde, hasta) {
  const rev = lista.filter((c) => primeraRevision(c) && enRango(f10(primeraRevision(c).fecha), desde, hasta));
  const ok = rev.filter((c) => primeraRevision(c).resultado === "aprobada").length;
  return { n: rev.length, ok, pct: pct(ok, rev.length) };
}

function resumenPeriodo(base, desde, hasta) {
  const enviadas = base.filter((c) => enRango(f10(c.createdAt), desde, hasta));
  const terminadas = base.filter((c) => enRango(fechaTerminadaTaller(c), desde, hasta));
  const conFecha = terminadas.filter((c) => c.fechaEntrega);
  const aTiempo = conFecha.filter((c) => fechaTerminadaTaller(c) <= f10(c.fechaEntrega));
  const tarde = conFecha.filter((c) => fechaTerminadaTaller(c) > f10(c.fechaEntrega));
  const primera = porcentajePrimera(base, desde, hasta);
  const dias = terminadas.map((c) => (c.createdAt ? difDias(f10(c.createdAt), fechaTerminadaTaller(c)) : -1)).filter((d) => d >= 0);
  return {
    enviadas: enviadas.length,
    terminadas: terminadas.length,
    conFechaEsperada: conFecha.length,
    aTiempo: aTiempo.length,
    aTiempoPct: pct(aTiempo.length, conFecha.length),
    atrasoProm: promedio(tarde.map((c) => difDias(f10(c.fechaEntrega), fechaTerminadaTaller(c)))),
    primeraN: primera.n,
    primeraPct: primera.pct,
    diasEntregaProm: promedio(dias),
  };
}

// Lista de meses AAAA-MM entre dos fechas (máximo `tope`, los más recientes).
export function mesesEntre(desde, hasta, tope = 12) {
  const out = [];
  let [y, m] = mesDe(desde).split("-").map(Number);
  const [y2, m2] = mesDe(hasta).split("-").map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out.slice(-tope);
}

// opts: { desde, hasta, taller, cliente, hoy, responsablePorItem (objeto itemId→nombre) }
export function estadisticasMuestras(muestras, opts) {
  const { taller = "", cliente = "", hoy, responsablePorItem = {} } = opts;
  let { desde = "", hasta = "" } = opts;
  const todas = (muestras || []).filter((c) => !c.eliminado);
  const base = todas.filter((c) => (!taller || tallerDe(c) === taller) && (!cliente || String(c.cliente || "") === cliente));
  if (!desde) {
    const primeras = base.map((c) => f10(c.createdAt)).filter(Boolean).sort();
    desde = primeras[0] || hoy;
  }
  if (!hasta) hasta = hoy;

  const actual = resumenPeriodo(base, desde, hasta);
  // Período anterior de la misma duración (para ▲/▼).
  const largo = difDias(desde, hasta) + 1;
  const prevHasta = sumarDias(desde, -1);
  const prevDesde = sumarDias(desde, -largo);
  const anterior = opts.desde ? resumenPeriodo(base, prevDesde, prevHasta) : null;

  const vencida = (c) => ["pendiente", "asignado"].includes(c.estado || "pendiente") && c.fechaEntrega && f10(c.fechaEntrega) < hoy;
  const atrasadas = base.filter(vencida).map((c) => ({
    id: c.id, nombre: c.nombre || "", referencia: c.referencia || "", taller: tallerDe(c), cliente: c.cliente || "", estado: c.estado || "pendiente",
    disenadora: responsablePorItem[c.itemId] || c.disenador || "", dias: difDias(f10(c.fechaEntrega), hoy),
  })).sort((a, b) => b.dias - a.dias);
  const enCurso = base.filter((c) => ESTADOS_EN_CURSO.includes(c.estado || "pendiente")).length;

  // Por mes
  const meses = mesesEntre(desde, hasta).map((mes) => ({
    mes,
    enviadas: base.filter((c) => mesDe(c.createdAt) === mes).length,
    aprobadas: base.filter((c) => mesDe(fechaAprobacion(c)) === mes).length,
  }));

  // Por taller
  const nombresTaller = [...new Set(base.map(tallerDe))];
  const filasTaller = nombresTaller.map((t) => {
    const lista = base.filter((c) => tallerDe(c) === t);
    const r = resumenPeriodo(lista, desde, hasta);
    return {
      taller: t,
      enviadas: r.enviadas,
      enCurso: lista.filter((c) => ESTADOS_EN_CURSO.includes(c.estado || "pendiente")).length,
      aTiempoPct: r.aTiempoPct, conFechaEsperada: r.conFechaEsperada, atrasoProm: r.atrasoProm,
      primeraPct: r.primeraPct, primeraN: r.primeraN, diasEntregaProm: r.diasEntregaProm, terminadas: r.terminadas,
    };
  }).filter((f) => f.enviadas || f.enCurso || f.terminadas).sort((a, b) => b.enviadas - a.enviadas);
  const elegibles = filasTaller.filter((f) => f.primeraN >= 3 && f.primeraPct !== null);
  const mejor = elegibles.length ? elegibles.reduce((m, f) => (f.primeraPct > m.primeraPct ? f : m)).taller : "";

  // Quién y qué se muestrea
  const grupo = (valorDe) => {
    const enviadasLista = base.filter((c) => enRango(f10(c.createdAt), desde, hasta));
    const mapa = {};
    enviadasLista.forEach((c) => { const k = valorDe(c) || ""; (mapa[k] = mapa[k] || []).push(c); });
    return Object.entries(mapa).map(([k, lista]) => {
      const conRev = lista.filter(primeraRevision);
      const ok = conRev.filter((c) => primeraRevision(c).resultado === "aprobada").length;
      const dAprob = lista.map((c) => (c.createdAt && fechaAprobacion(c) ? difDias(f10(c.createdAt), fechaAprobacion(c)) : -1)).filter((d) => d >= 0);
      return {
        nombre: k, n: lista.length, primeraPct: pct(ok, conRev.length), primeraN: conRev.length,
        aModificar: lista.filter((c) => (c.revisiones || []).some((r) => r.resultado === "modificar")).length,
        diasAprobar: promedio(dAprob),
      };
    }).sort((a, b) => b.n - a.n);
  };
  const grupos = {
    disenadora: grupo((c) => responsablePorItem[c.itemId] || c.disenador || ""),
    cliente: grupo((c) => c.cliente || ""),
    categoria: grupo((c) => c.categoria || ""),
  };

  const clientes = [...new Set(todas.map((c) => String(c.cliente || "")).filter(Boolean))].sort();
  const talleres = [...new Set(todas.map(tallerDe))].sort();
  return { desde, hasta, actual, anterior, atrasadas, enCurso, meses, filasTaller, mejor, grupos, clientes, talleres };
}

// ─── COSTOS ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Configuración guardada en `centro_costo_muestras/main`:
//   personal: [{ id, nombre, taller, sueldo, activa }]
//   talleres: { [claveTaller]: { nombre, modo: "sueldos" | "precio", precio } }
//   presupuestos: { [AAAA-MM]: { [claveTaller]: pesos } }   (si un mes no tiene el taller, rige el último mes anterior que sí lo tiene)
//   prestacionesOn, prestacionesPct
// Pagos en `centro_costo_muestras/pagos`: { pagos: { [idMuestra]: { valor?, pagada, por, en } } }
// Costo de una persona para muestras = sueldo × (1 + % de prestaciones si tiene la casilla «Con prestaciones») × (% de su sueldo que cuenta para muestras).
// Compatibilidad: una persona sin la casilla guardada usa el interruptor general anterior (`prestacionesOn`).
export const conPrestaciones = (p, cfg) => (typeof p.conPrest === "boolean" ? p.conPrest : !!(cfg && cfg.prestacionesOn));
export const pctDedicacion = (p) => (typeof p.pctMuestras === "number" && p.pctMuestras >= 0 ? p.pctMuestras : 100);
export function costoPersona(p, cfg) {
  const pr = conPrestaciones(p, cfg) ? 1 + (Number(cfg && cfg.prestacionesPct) || 0) / 100 : 1;
  // En pesos enteros, para que la suma de las filas sea igual al total que se muestra.
  return Math.round((Number(p.sueldo) || 0) * pr * (pctDedicacion(p) / 100));
}

// Cuántas muestras entregó el taller en cada mes (AAAA-MM → n; `estimadas` = las que no tienen fecha real) y la fecha de la primera entrega REAL registrada.
export function resumenMesesMuestras(muestras) {
  const conteo = {};
  const estimadas = {};
  let primera = "";
  (muestras || []).filter((c) => !c.eliminado).forEach((c) => {
    const { fecha: f, estimada } = fechaEntregaCosto(c);
    if (!f) return;
    const m = mesDe(f);
    conteo[m] = (conteo[m] || 0) + 1;
    if (estimada) estimadas[m] = (estimadas[m] || 0) + 1;
    else if (!primera || f < primera) primera = f;
  });
  return { conteo, estimadas, primera };
}
// Mes con el que se abre «Costos»: el actual si ya tiene muestras entregadas; si no, el último mes con muestras; si no hay ninguna, el actual.
export function mesPorDefecto(conteo, mesActual) {
  if (conteo[mesActual]) return mesActual;
  const meses = Object.keys(conteo).filter((m) => m <= mesActual).sort();
  return meses.length ? meses[meses.length - 1] : mesActual;
}

export function modoDeTaller(cfg, nombreTaller, personal) {
  const c = (cfg.talleres || {})[claveTexto(nombreTaller)];
  if (c && (c.modo === "sueldos" || c.modo === "precio")) return c.modo;
  return (personal || []).some((p) => p.activa !== false && claveTexto(p.taller) === claveTexto(nombreTaller)) ? "sueldos" : "precio";
}

export function presupuestoDe(presupuestos, mes, nombreTaller) {
  const clave = claveTexto(nombreTaller);
  const meses = Object.keys(presupuestos || {}).filter((m) => m <= mes).sort().reverse();
  for (const m of meses) {
    const v = presupuestos[m] && presupuestos[m][clave];
    if (typeof v === "number" && !Number.isNaN(v)) return { valor: v, heredado: m !== mes, desde: m };
  }
  return { valor: 0, heredado: false, desde: "" };
}

export function costosDelMes(muestras, cfg, pagos, mes) {
  const personal = cfg.personal || [];
  const todas = (muestras || []).filter((c) => !c.eliminado);
  const terminadasMes = todas.map((c) => ({ c, ...fechaEntregaCosto(c) })).filter((x) => mesDe(x.fecha) === mes);
  const nombres = new Map();
  terminadasMes.forEach(({ c }) => nombres.set(claveTexto(tallerDe(c)), tallerDe(c)));
  personal.forEach((p) => { if (p.taller) nombres.set(claveTexto(p.taller), p.taller); });
  Object.values(cfg.talleres || {}).forEach((t) => { if (t && t.nombre) nombres.set(claveTexto(t.nombre), t.nombre); });
  Object.keys((cfg.presupuestos || {})[mes] || {}).forEach((k) => { if (!nombres.has(k)) nombres.set(k, (cfg.talleres?.[k]?.nombre) || k); });

  const filas = [...nombres.values()].map((nombre) => {
    const clave = claveTexto(nombre);
    const modo = modoDeTaller(cfg, nombre, personal);
    const gente = personal.filter((p) => p.activa !== false && claveTexto(p.taller) === clave);
    const sueldos = gente.reduce((s, p) => s + costoPersona(p, cfg), 0);
    const precio = Number((cfg.talleres || {})[clave]?.precio) || 0;
    const muestrasT = terminadasMes.filter((x) => claveTexto(tallerDe(x.c)) === clave).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const lineas = muestrasT.map(({ c, fecha, estimada }) => {
      const p = (pagos || {})[c.id] || {};
      const valor = typeof p.valor === "number" ? p.valor : precio;
      return { id: c.id, referencia: c.referencia || "", nombre: c.nombre || "", recibida: fecha, estimada, valor, ajustado: typeof p.valor === "number" && p.valor !== precio, pagada: !!p.pagada, por: p.por || "", en: p.en || "" };
    });
    const total = modo === "sueldos" ? sueldos : lineas.reduce((s, l) => s + l.valor, 0);
    const pres = presupuestoDe(cfg.presupuestos, mes, nombre);
    return {
      taller: nombre, clave, modo, personas: gente.length, sueldos, precio, terminadas: muestrasT.length, estimadas: muestrasT.filter((x) => x.estimada).length, total,
      costoPorMuestra: muestrasT.length ? total / muestrasT.length : null,
      presupuesto: pres.valor, presupuestoHeredado: pres.heredado,
      uso: pres.valor ? total / pres.valor : null,
      lineas,
      porPagar: lineas.filter((l) => !l.pagada).reduce((s, l) => s + l.valor, 0),
    };
  }).sort((a, b) => b.total - a.total);

  const total = filas.reduce((s, f) => s + f.total, 0);
  const terminadas = filas.reduce((s, f) => s + f.terminadas, 0);
  const estimadas = filas.reduce((s, f) => s + f.estimadas, 0);
  const presupuesto = filas.reduce((s, f) => s + f.presupuesto, 0);
  return { mes, filas, total, terminadas, estimadas, costoPorMuestra: terminadas ? total / terminadas : null, presupuesto, uso: presupuesto ? total / presupuesto : null };
}

export const mesAnterior = (mes) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
