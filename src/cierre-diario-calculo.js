// ─── TABLERO DE COSTOS — CIERRE DIARIO (cálculo, sin pantalla) ────────────────
// (2026-10-26, a pedido de Fredy) Para la persona encargada de costos: cómo cierra cada área el día.
//   · Áreas con costo (Corte, Zona Calor, Control de Calidad): lo producido del día contra el sueldo del día de cada
//     trabajador, el saldo del día y el saldo acumulado del mes (se reinicia el día 1), del año y total.
//   · Áreas sin costo diario todavía (Confección, Terminación, Despachos): unidades del día contra la meta diaria.
// Reglas que ya usa Centro de Costo (se respetan igual):
//   - El valor producido cuenta todos los días; el costo del sueldo solo cuenta de lunes a viernes.
//   - Solo cuentan los trabajadores que decide `incluir` (destajo; en CORTE toda la nómina) y los que tienen sueldo.
//   - Un trabajador «cubre su salario» cuando lo producido del día es al menos su sueldo del día.
// Todo son funciones puras: la pantalla les pasa lo que leyó de Firestore.

export const METAS_DEFECTO = { corte: 2000, confeccion: 2200, terminacion: 2200, despachos: 2200 };

const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

// "07/10/2026" -> "2026-10-07"
export function isoDeEtiquetaDia(et) {
  const m = String(et || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
export function esHabilISO(iso) {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
}
export function diasHabilesDelMes(anio, mes) {
  const ult = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= ult; d++) if (esHabilISO(`${anio}-${pad(mes)}-${pad(d)}`)) n++;
  return n || 20;
}
export function diasDelMesHasta(anio, mes, hastaISO) {
  const ult = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= ult; d++) {
    const iso = `${anio}-${pad(mes)}-${pad(d)}`;
    if (!hastaISO || iso <= hastaISO) out.push(iso);
  }
  return out;
}
export function sumarDiasISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ── Cierres diarios guardados (centro_costo_historial_ayuda, periodo "dia") ──
// Devuelve Map "CLAVE|AAAA-MM-DD" -> { clave, iso, valor, costo, costoContado, unidades, automatico, trabajadores[] }.
// Si hay dos cierres del mismo día y área, gana el guardado más tarde.
export function cierresDiarios(cierres, claveArea, incluir) {
  const mejor = new Map();
  (cierres || []).forEach((c) => {
    if (c.periodo !== "dia") return;
    const iso = isoDeEtiquetaDia(c.etiquetaPeriodo);
    if (!iso) return;
    const clave = claveArea(c.area);
    const k = `${clave}|${iso}`;
    const prev = mejor.get(k);
    if (!prev || String(c.fechaGuardado || "") > String(prev.fechaGuardado || "")) mejor.set(k, c);
  });
  const out = new Map();
  mejor.forEach((c, k) => {
    const [clave, iso] = k.split("|");
    const habil = esHabilISO(iso);
    const trab = [];
    let valor = 0;
    let costo = 0;
    let unidades = 0;
    const det = c.detalle || [];
    if (det.length) {
      det.forEach((d) => {
        if (d.sinSueldo) return;
        const t0 = { id: d.id || norm(d.nombre), nombre: d.nombre, area: claveArea(d.area || c.area) };
        if (incluir && !incluir(t0)) return;
        const v = NUM(d.valorProducido);
        const co = NUM(d.costo);
        const u = NUM(d.unidades);
        trab.push({ id: t0.id, nombre: d.nombre, valor: v, costo: co, costoContado: habil ? co : 0, unidades: u });
        valor += v;
        costo += co;
        unidades += u;
      });
    } else {
      valor = NUM(c.totalValor);
      costo = NUM(c.totalCosto);
    }
    out.set(k, { clave, iso, valor, costo, costoContado: habil ? costo : 0, unidades, automatico: c.origen === "automatico", trabajadores: trab, fechaGuardado: c.fechaGuardado || "" });
  });
  return out;
}

// ── Corte en vivo, día por día (pedidos_activos[].cortesRealizados) ──
// Mapa "AAAA-MM-DD" -> Map(cortadorNormalizado -> { nombre, unidades, ingreso })
export function indiceCortes(pedidos) {
  const idx = new Map();
  (pedidos || []).forEach((p) => (p.cortesRealizados || []).forEach((c) => {
    const f = String(c.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
    const nombre = String(c.cortador || "").trim() || "(Sin cortador asignado)";
    const k = norm(nombre);
    if (!idx.has(f)) idx.set(f, new Map());
    const m = idx.get(f);
    if (!m.has(k)) m.set(k, { nombre, unidades: 0, ingreso: 0 });
    const a = m.get(k);
    a.unidades += NUM(c.totalUnidades);
    a.ingreso += NUM(c.ingresoCorte);
  }));
  return idx;
}

// Cierre de CORTE de un día calculado como lo hace el cierre automático de las 10 pm:
// valor = ingreso de los cortes del día, costo = sueldo ÷ días hábiles del mes.
export function corteDelDia(idx, trabajadoresCorte, iso) {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const divisor = diasHabilesDelMes(anio, mes);
  const habil = esHabilISO(iso);
  const porCortador = idx.get(iso) || new Map();
  const trab = [];
  const usados = new Set();
  (trabajadoresCorte || []).filter((t) => !t.fechaSalida || iso <= String(t.fechaSalida).slice(0, 10)).forEach((t) => {
    const k = norm(t.nombre);
    const d = porCortador.get(k);
    usados.add(k);
    if (!NUM(t.sueldo)) return;
    const co = NUM(t.sueldo) / divisor;
    trab.push({ id: t.id || k, nombre: t.nombre, valor: d ? d.ingreso : 0, costo: co, costoContado: habil ? co : 0, unidades: d ? d.unidades : 0 });
  });
  let valorSinSueldo = 0;
  let unidadesSinSueldo = 0;
  porCortador.forEach((d, k) => { if (!usados.has(k)) { valorSinSueldo += d.ingreso; unidadesSinSueldo += d.unidades; } });
  const valor = trab.reduce((s, t) => s + t.valor, 0);
  const costo = trab.reduce((s, t) => s + t.costo, 0);
  const unidades = trab.reduce((s, t) => s + t.unidades, 0) + unidadesSinSueldo;
  return { clave: "CORTE", iso, valor, costo, costoContado: habil ? costo : 0, unidades, automatico: false, trabajadores: trab, sinSueldoValor: valorSinSueldo };
}

// ── Un día de un área con costo: lo guardado, o (solo CORTE) lo calculado en vivo ──
// estado: "automatico" | "manual" | "calculado" (Corte sin cierre guardado) | "sin_cierre"
export function diaDeArea(clave, iso, cierresMap, corteIdx, trabajadoresCorte) {
  const g = cierresMap.get(`${clave}|${iso}`);
  if (g) return { ...g, estado: g.automatico ? "automatico" : "manual" };
  if (clave === "CORTE") {
    const v = corteDelDia(corteIdx, trabajadoresCorte, iso);
    return { ...v, estado: "calculado" };
  }
  return { clave, iso, valor: 0, costo: 0, costoContado: 0, unidades: 0, trabajadores: [], estado: "sin_cierre" };
}

// Cuántos cubren su sueldo del día (solo cuenta si es día hábil; en fin de semana nadie «debe» nada).
export function cubrenDelDia(dia, iso) {
  const lista = (dia.trabajadores || []).filter((t) => t.costo > 0);
  if (!esHabilISO(iso)) return { si: 0, total: lista.length, habil: false };
  return { si: lista.filter((t) => t.valor + 0.5 >= t.costo).length, total: lista.length, habil: true };
}

// ── Saldo acumulado ──
// Del 1 al día `hastaISO` del mes: producido − sueldo de los días hábiles. Si el área no tiene ningún día guardado ni
// calculable (meses viejos con un solo cierre mensual o Excel), usa lo que dice el Centro de Costo para ese mes.
//   datosMes: { valor, costo } | null  (de datosArea[clave].meses[mes])
//   trabajadoresMes: trabajadores del cierre mensual (para el detalle cuando no hay días)
export function acumuladoMes({ clave, anio, mes, hastaISO, cierresMap, corteIdx, trabajadoresCorte, datosMes, trabajadoresMes }) {
  const todos = diasDelMesHasta(anio, mes, null);
  // ¿ATLAS tiene datos propios de este mes? (algún cierre guardado, o cortes registrados si es CORTE)
  const hayDatosMes = todos.some((iso) => cierresMap.has(`${clave}|${iso}`) || (clave === "CORTE" && corteIdx.has(iso)));
  if (!hayDatosMes) {
    if (datosMes) {
      const trab = (trabajadoresMes || []).map((t) => ({ id: t.id, nombre: t.nombre, valor: t.valor, costo: t.costo, resultado: t.valor - t.costo }));
      return { valor: datosMes.valor, costo: datosMes.costo, saldo: datosMes.valor - datosMes.costo, unidades: 0, fuente: "mes", trabajadores: trab, dias: 0 };
    }
    return { valor: 0, costo: 0, saldo: 0, unidades: 0, fuente: null, trabajadores: [], dias: 0 };
  }
  const dias = diasDelMesHasta(anio, mes, hastaISO);
  let valor = 0;
  let costo = 0;
  let unidades = 0;
  let conDatos = 0;
  const porTrab = new Map();
  dias.forEach((iso) => {
    const d = diaDeArea(clave, iso, cierresMap, corteIdx, trabajadoresCorte);
    if (d.estado === "sin_cierre") return;
    conDatos++;
    valor += d.valor;
    costo += d.costoContado;
    unidades += d.unidades;
    (d.trabajadores || []).forEach((t) => {
      const a = porTrab.get(t.id) || { id: t.id, nombre: t.nombre, valor: 0, costo: 0 };
      a.valor += t.valor;
      a.costo += t.costoContado;
      porTrab.set(t.id, a);
    });
  });
  const trabajadores = [...porTrab.values()].map((t) => ({ ...t, resultado: t.valor - t.costo }));
  return { valor, costo, saldo: valor - costo, unidades, fuente: "dias", trabajadores, dias: conDatos };
}

// Saldo de un mes COMPLETO ya cerrado, según el Centro de Costo (histórico, en vivo o cierres).
export function saldoMesCompleto(datosArea, mes) {
  const m = datosArea?.meses?.[mes];
  return m ? m.valor - m.costo : 0;
}

// Saldo del año hasta el mes elegido: meses anteriores completos + el acumulado del mes elegido.
export function saldoAnioHasta(datosArea, mes, acumMes) {
  let s = 0;
  for (let i = 1; i < mes; i++) s += saldoMesCompleto(datosArea, i);
  return s + acumMes;
}

// ── Unidades por día ──
export function sumarPorFecha(items, getFecha, getCant) {
  const m = new Map();
  (items || []).forEach((it) => {
    const f = String(getFecha(it) || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
    m.set(f, (m.get(f) || 0) + NUM(getCant(it)));
  });
  return m;
}
export const unidadesCortePorDia = (idx) => {
  const m = new Map();
  idx.forEach((porCortador, f) => { let u = 0; porCortador.forEach((d) => { u += d.unidades; }); m.set(f, u); });
  return m;
};
// Despachos: unidades facturadas netas (las devoluciones restan, venga el número con signo o sin él).
export const unidadesDespachos = (bitacora) => sumarPorFecha(bitacora, (b) => b.fecha, (b) => (b.esDevolucion ? -Math.abs(NUM(b.unidades)) : NUM(b.unidades)));
// Confección: Entradas de Planta netas (lo que llega de planta propia y talleres).
export const unidadesConfeccion = (entradas) => sumarPorFecha(entradas, (e) => e.fecha, (e) => e.cantidad);
// Terminación: producción registrada en Nómina en procesos de Terminación.
export const unidadesTerminacion = (produccion) =>
  sumarPorFecha((produccion || []).filter((p) => norm(p.proceso).includes("TERMINACION")), (p) => p.fecha, (p) => p.cantidad);

// ── Meta diaria ──
// unidadesPorDia: Map iso -> unidades. Cuenta solo días hábiles del mes hasta `hastaISO`.
export function cumplimientoMeta(unidadesPorDia, meta, anio, mes, hastaISO) {
  const dias = diasDelMesHasta(anio, mes, hastaISO).filter(esHabilISO);
  const m = NUM(meta);
  const cumplidos = m > 0 ? dias.filter((iso) => (unidadesPorDia.get(iso) || 0) >= m).length : 0;
  return { diasHabiles: dias.length, cumplidos, meta: m };
}
export function estadoMeta(unidades, meta) {
  const m = NUM(meta);
  if (!(m > 0)) return { pct: null, nivel: "sin_meta" };
  const pct = (NUM(unidades) / m) * 100;
  return { pct, nivel: pct >= 100 ? "cumple" : pct >= 80 ? "cerca" : "bajo" };
}
