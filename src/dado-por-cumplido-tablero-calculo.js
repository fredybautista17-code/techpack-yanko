// Tablero de Dado por Cumplido (2026-11-16, a pedido de Fredy): dinero recaudado con las bases = unidades DESPACHADAS × valor de la base
// de cada lote aprobado, por mes, en total de la empresa, por base o por cliente. Función pura: no lee ni escribe Firestore.
//   · Unidades = despachadaEfectiva(lote) (misma regla de Contabilidad y de «¿Cubro mis costos?»).
//   · Recaudado = unidades × baseValorUsado (solo la base; los porcentajes del Dado por Cumplido quedan aparte).
//   · Mes = fecha de aprobación (hora Colombia, UTC−5) o fecha del lote, a elegir.
import { despachadaEfectiva } from "./costos-general-calculo";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// "YYYY-MM-DD" de un valor que puede ser Timestamp de Firestore, Date o texto. La aprobación se pasa a hora Colombia (UTC−5).
export function fechaISO(valor, colombia) {
  if (!valor) return "";
  let d = null;
  if (typeof valor === "string") return valor.slice(0, 10);
  if (typeof valor.toDate === "function") d = valor.toDate();
  else if (valor instanceof Date) d = valor;
  else if (typeof valor.seconds === "number") d = new Date(valor.seconds * 1000);
  if (!d || isNaN(d.getTime())) return "";
  const t = colombia ? new Date(d.getTime() - 5 * 3600 * 1000) : d;
  return t.toISOString().slice(0, 10);
}

export function mesDeLote(l, modo) {
  const f = modo === "lote" ? fechaISO(l.fecha, false) : fechaISO(l.fechaAprobacion, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
  return { anio: Number(f.slice(0, 4)), mes: Number(f.slice(5, 7)) - 1 };
}

export function basePorPrenda(l) {
  const b = num(l.baseValorUsado);
  if (b > 0) return b;
  const cortada = num(l.cantCortada);
  return num(l.total) > 0 && cortada > 0 ? num(l.total) / cortada : 0;
}

const vacio = () => ({ u: new Array(12).fill(0), d: new Array(12).fill(0), lotes: 0 });
const sumar = (a) => a.reduce((s, x) => s + x, 0);
const grupo = (mapa, nombre) => {
  if (!mapa.has(nombre)) mapa.set(nombre, { ...vacio(), nombre });
  return mapa.get(nombre);
};

// lotes: documentos de dado_por_cumplido_lotes; bases: dado_por_cumplido_bases (para el nombre de la categoría).
export function construirTablero(lotes, bases, { anio, modo }) {
  const nombreBase = (id) => (bases || []).find((b) => b.id === id)?.nombre || (id ? id : "Sin categoría");
  const total = vacio();
  const porBase = new Map();
  const porCliente = new Map();
  let lotesConDespachada = 0;
  let sinDespachada = 0;
  let sinBase = 0;
  (lotes || []).forEach((l) => {
    if (l.estado !== "aprobado" || l.eliminado) return;
    const m = mesDeLote(l, modo);
    if (!m || m.anio !== anio) return;
    const u = despachadaEfectiva(l);
    const bp = basePorPrenda(l);
    const d = u * bp;
    if (u <= 0) sinDespachada += 1;
    else lotesConDespachada += 1;
    if (bp <= 0) sinBase += 1;
    const base = nombreBase(l.categoriaBaseId);
    const cliente = String(l.cliente || "").trim() || "(sin cliente)";
    [total, grupo(porBase, base), grupo(porCliente, cliente)].forEach((g) => {
      g.u[m.mes] += u;
      g.d[m.mes] += d;
      g.lotes += 1;
    });
  });
  const ordenar = (mapa) => [...mapa.values()].sort((a, b) => sumar(b.d) - sumar(a.d) || sumar(b.u) - sumar(a.u));
  return {
    total,
    bases: ordenar(porBase),
    clientes: ordenar(porCliente),
    lotesConDespachada,
    sinDespachada,
    sinBase,
  };
}

// Porcentaje del mes transcurrido (hora Colombia) para comparar el mes en curso con el presupuesto proporcional.
// Años pasados: 1 en todos los meses; año en curso: 1 hasta el mes anterior, proporción al día de hoy en el mes actual, 0 después.
export function factoresAFecha(anio, hoy) {
  const h = hoy || new Date(Date.now() - 5 * 3600 * 1000);
  const ay = h.getUTCFullYear();
  const am = h.getUTCMonth();
  const dia = h.getUTCDate();
  return new Array(12).fill(0).map((_, i) => {
    if (anio < ay) return 1;
    if (anio > ay) return 0;
    if (i < am) return 1;
    if (i > am) return 0;
    const diasMes = new Date(Date.UTC(anio, i + 1, 0)).getUTCDate();
    return Math.min(1, dia / diasMes);
  });
}

// Presupuesto efectivo por mes: lo escrito (si hay) o lo sugerido (estructura guardada en el cierre de «¿Cubro mis costos?»).
export function presupuestoEfectivo(escrito, sugerido) {
  return new Array(12).fill(0).map((_, i) => {
    const e = escrito ? escrito[i] : undefined;
    if (e !== undefined && e !== null && e !== "" && Number.isFinite(Number(e))) return { valor: Number(e), origen: "escrito" };
    const s = sugerido ? num(sugerido[i]) : 0;
    return s > 0 ? { valor: s, origen: "sugerido" } : { valor: 0, origen: "vacio" };
  });
}

export function resumenAFecha(recaudadoMes, presupuestoMes, factores) {
  let rec = 0;
  let pres = 0;
  for (let i = 0; i < 12; i += 1) {
    if (factores[i] <= 0) continue;
    rec += num(recaudadoMes[i]);
    pres += num(presupuestoMes[i]) * factores[i];
  }
  return { recaudado: rec, presupuesto: pres, cumplimiento: pres > 0 ? rec / pres : null };
}

// Para el gráfico y la tabla: las N series principales y el resto junto en «Otros».
export function topMasOtros(grupos, n, etiquetaOtros) {
  if (grupos.length <= n) return grupos;
  const top = grupos.slice(0, n);
  const resto = grupos.slice(n);
  const otros = { ...vacio(), nombre: `${etiquetaOtros} (${resto.length})` };
  resto.forEach((g) => {
    for (let i = 0; i < 12; i += 1) {
      otros.u[i] += g.u[i];
      otros.d[i] += g.d[i];
    }
    otros.lotes += g.lotes;
  });
  return [...top, otros];
}

export const totalDe = sumar;
