import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyBDNvCaem-IbP0Z87eBt1pBtDy8sZdkEqc",
  authDomain: "techpack-yanko-f37b8.firebaseapp.com",
  projectId: "techpack-yanko-f37b8",
  storageBucket: "techpack-yanko-f37b8.firebasestorage.app",
  messagingSenderId: "700796768091",
  appId: "1:700796768091:web:5ab0db90c17390e6e7547e",
};
const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
async function fsSave(col, id, data) {
  await setDoc(doc(db, col, id), data, { merge: true });
}
async function fsDelete(col, id) {
  await deleteDoc(doc(db, col, id));
}
// ─── TOKENS ──────────────────────────────────────────────────────────────────
const C = {
  ink: "#1A1A2E",
  slate: "#5A5A7A",
  border: "#E8E2DB",
  canvas: "#F7F4F0",
  white: "#FFFFFF",
  seam: "#C8B8A2",
  green: "#2D9E6B",
  greenBg: "#EBF7F2",
  red: "#E85D4A",
  redBg: "#FDF0EE",
  blue: "#3D6B9E",
  blueBg: "#EBF1F7",
  amber: "#C47C1A",
  amberBg: "#FDF5E6",
  violet: "#7B5EA7",
  violetBg: "#F3EEF9",
};
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-CO");
}
// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = "primary", small, disabled }) {
  const S = {
    primary: { background: C.ink, color: C.white, border: "none" },
    secondary: { background: C.canvas, color: C.ink, border: `1px solid ${C.border}` },
    success: { background: C.green, color: C.white, border: "none" },
    danger: { background: C.red, color: C.white, border: "none" },
    ghost: { background: "transparent", color: C.blue, border: `1.5px solid ${C.blue}` },
  };
  const s = S[variant] || S.primary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...s,
        borderRadius: 8,
        padding: small ? "5px 10px" : "9px 18px",
        fontWeight: 700,
        fontSize: small ? 12 : 13,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: C.white, borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.slate }}>×</button>
        </div>
        <div style={{ padding: 24, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
function KPI({ icon, label, value, color, bg, sub }) {
  return (
    <div style={{ background: bg || C.canvas, borderRadius: 12, padding: "16px 18px", border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function EstadoBadge({ estado }) {
  if (!estado) return <span style={{ color: C.slate }}>—</span>;
  const map = {
    VENCIDO: { bg: C.redBg, color: C.red },
    URGENTE: { bg: C.amberBg, color: C.amber },
    "EN TIEMPO": { bg: C.greenBg, color: C.green },
  };
  const s = map[estado] || { bg: C.canvas, color: C.slate };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {estado}
    </span>
  );
}
// ─── PARSEO DE HOJA1 ───────────────────────────────────────────────────────────
// Hoja1 viene de un ERP: cada lote aparece en 2 filas — una fila de PEDIDO
// (col B>0, trae Fecha Entrega Pedido en D) y una fila de INVENTARIO (col B=0,
// trae planta, inventarios y Fecha Entrega Conf). Se lee por posición de
// columna (letra de Excel), no por nombre de encabezado, porque hay 15
// bloques de proceso con encabezados repetidos (Proceso1..Proceso15, etc).
function colIdx(letter) {
  let n = 0;
  for (let i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64);
  return n - 1;
}
const NOMBRE_COLS = ["AK", "AQ", "AU", "AZ", "BE", "BJ", "BO", "BT", "BY", "CD", "CI", "CN", "CS", "CX", "DC"];
const SALIDA_COLS = ["AN", "AR", "AW", "BB", "BG", "BL", "BQ", "BV", "CA", "CF", "CK", "CP", "CU", "CZ", "DE"];
const ENTREGA_COLS = ["AO", "AS", "AX", "BC", "BH", "BM", "BR", "BW", "CB", "CG", "CL", "CQ", "CV", "DA", "DF"];
const PLANTA_YANKO = "INDUSTRIAS YANKO MODULO CENTRO";
function esFechaValida(v) {
  return v instanceof Date && !isNaN(v.getTime());
}
function dateToISO(d) {
  if (!esFechaValida(d)) return null;
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtFecha(d) {
  if (!esFechaValida(d)) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtFechaISO(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
// Fecha + hora de actualización de una carga (a partir de su `creadoEn`,
// timestamp ISO completo con hora, a diferencia de `fecha` que solo trae el
// día). Si por alguna razón una carga vieja no tiene `creadoEn`, no rompe —
// simplemente no muestra hora.
function fmtFechaHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const fecha = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fecha} ${hora}`;
}
function lunesDeSemana(fecha) {
  if (!esFechaValida(fecha)) return null;
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const isoDow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (isoDow - 1));
  return d;
}
// Días entre hoy y una fecha ISO (YYYY-MM-DD), comparando por fecha local
// (evita el corrimiento de un día que da comparar vía toISOString/UTC).
function diasEntre(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - hoy) / 86400000);
}
function estadoDe(dias) {
  if (dias === null || dias === undefined) return "";
  if (dias < 0) return "VENCIDO";
  if (dias <= 7) return "URGENTE";
  return "EN TIEMPO";
}
// Comparación flexible de nombre de cliente para el filtro de "Cliente
// asociado" (usuarios de acceso restringido a un solo cliente) — no exige
// coincidencia exacta porque el mismo cliente puede venir con variantes
// distintas en el Excel de Planeación (p.ej. "KAMILA GROUP SAS-KAMILA
// COLOMBIA" en vez de "KAMILA COLOMBIA"): ignora mayúsculas/espacios y basta
// con que uno contenga al otro.
function coincideCliente(nombre, clienteAsociado) {
  if (!clienteAsociado) return true;
  const a = String(nombre || "").trim().toUpperCase();
  const b = String(clienteAsociado || "").trim().toUpperCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
// Encuentra en qué bloque de proceso (de los 15) quedó el lote: si hay algún
// bloque con salida pero sin entrega (pendiente), toma el de salida más
// reciente entre los pendientes; si hay empate prefiere "TERMINACION", si no
// el último. Si no hay ningún pendiente, toma el bloque con la salida más
// reciente de todos (mismo criterio de empate).
function calcularProcesoDondeQuedo(procesos, invSemiterminado) {
  if (!(invSemiterminado > 0)) return { proceso: "", ultimaSalida: null, sinSalida: true };
  const pend = procesos.map((p) => (esFechaValida(p.salida) && !esFechaValida(p.entrega) ? p.salida : null));
  const pendValidas = pend.filter(esFechaValida);
  const mp = pendValidas.length ? new Date(Math.max(...pendValidas.map((d) => d.getTime()))) : null;
  const sals = procesos.map((p) => p.salida);
  const salsValidas = sals.filter(esFechaValida);
  const maxSal = salsValidas.length ? new Date(Math.max(...salsValidas.map((d) => d.getTime()))) : null;
  const base = mp ? pend : sals;
  const baseValidas = base.filter(esFechaValida);
  const mx = baseValidas.length ? new Date(Math.max(...baseValidas.map((d) => d.getTime()))) : null;
  let proceso = "";
  if (mx) {
    const tieIdx = [];
    base.forEach((v, i) => {
      if (esFechaValida(v) && v.getTime() === mx.getTime()) tieIdx.push(i);
    });
    const termIdx = tieIdx.find((i) => procesos[i].nombre === "TERMINACION");
    const pos = termIdx !== undefined ? termIdx : tieIdx[tieIdx.length - 1];
    proceso = pos !== undefined ? procesos[pos].nombre || "" : "";
  }
  const ultimaSalida = mp || maxSal || null;
  return { proceso, ultimaSalida, sinSalida: !mp && !maxSal };
}
// Agrupa las filas crudas de Hoja1 (2 por lote) en un objeto por lote, con
// todas las columnas de apoyo (DN, DO, DR, DS, DT, DU, DV, DW, DX) ya
// calculadas. Los campos de fecha se guardan como texto ISO (YYYY-MM-DD) —
// los "días restantes"/"estado" NO se guardan aquí porque dependen de la
// fecha en que se mire el informe, se calculan al momento de generar cada
// reporte con diasEntre()/estadoDe().
function agruparLotes(rows) {
  const A = colIdx("A"), B = colIdx("B"), D = colIdx("D"), F = colIdx("F"),
    H = colIdx("H"), N = colIdx("N"), S = colIdx("S"), U = colIdx("U"),
    V = colIdx("V"), X = colIdx("X"), Z = colIdx("Z"), AA = colIdx("AA"), AC = colIdx("AC"),
    AG = colIdx("AG"), AJ = colIdx("AJ");
  const grupos = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const numLote = row[A];
    if (numLote === null || numLote === undefined || numLote === "") continue;
    if (!grupos.has(numLote)) grupos.set(numLote, []);
    grupos.get(numLote).push(row);
  }
  const lotes = [];
  grupos.forEach((filas, numLote) => {
    const filaInv = filas.find((f) => !(Number(f[B]) > 0)) || filas[0];
    const filasPedido = filas.filter((f) => Number(f[B]) > 0);
    const numPedido = filasPedido.length ? Math.max(...filasPedido.map((f) => Number(f[B]) || 0)) : 0;
    const fechasEntregaPedido = filasPedido.map((f) => f[D]).filter(esFechaValida);
    const fechaEntregaPedido = fechasEntregaPedido.length ? new Date(Math.max(...fechasEntregaPedido.map((d) => d.getTime()))) : null;
    const filaCliente = filas.find((f) => f[F] !== null && f[F] !== undefined && f[F] !== "");
    const nombreCliente = filaCliente ? String(filaCliente[F]) : "(Sin cliente)";
    const referencia = filaInv[H] ?? (filasPedido[0] ? filasPedido[0][H] : "") ?? "";
    const categoria = filaInv[N] ?? (filasPedido[0] ? filasPedido[0][N] : "") ?? "";
    const fechaCorte = filaInv[S];
    const cantCortada = Number(filaInv[U]) || 0;
    const invCorte = Number(filaInv[V]) || 0;
    const invBMP = Number(filaInv[X]) || 0;
    const invPlanta = Number(filaInv[Z]) || 0;
    const nombrePlanta = filaInv[AA] || "";
    const fechaEntregaConf = filaInv[AC];
    const invBPT = Number(filaInv[AG]) || 0;
    const invSemiterminado = Number(filaInv[AJ]) || 0;
    const procesos = NOMBRE_COLS.map((nc, i) => ({
      nombre: filaInv[colIdx(nc)] || "",
      salida: filaInv[colIdx(SALIDA_COLS[i])],
      entrega: filaInv[colIdx(ENTREGA_COLS[i])],
    }));
    const { proceso: procesoDondeQuedo, ultimaSalida, sinSalida } = calcularProcesoDondeQuedo(procesos, invSemiterminado);
    let ultimaSalidaTexto = "";
    if (invSemiterminado > 0) ultimaSalidaTexto = sinSalida ? "Sin salida" : fmtFecha(ultimaSalida);
    const clienteAgrupado =
      nombreCliente === "KAMILA GROUP SAS-KAMILA COLOMBIA" || nombreCliente === "KAMILA VENEZUELA-KAMILA VENEZUELA"
        ? "KAMILA (COLOMBIA + VENEZUELA)"
        : nombreCliente;
    let ubicacionActual = "Sin inventario", unidadesUbicacion = 0;
    if (invBPT > 0) { ubicacionActual = "BPT"; unidadesUbicacion = invBPT; }
    else if (invSemiterminado > 0) { ubicacionActual = "Semiterminado"; unidadesUbicacion = invSemiterminado; }
    else if (invPlanta > 0) { ubicacionActual = "Planta"; unidadesUbicacion = invPlanta; }
    else if (invBMP > 0) { ubicacionActual = "BMP"; unidadesUbicacion = invBMP; }
    else if (invCorte > 0) { ubicacionActual = "Corte"; unidadesUbicacion = invCorte; }
    const semanaEntregaISO = invPlanta > 0 ? dateToISO(lunesDeSemana(fechaEntregaConf)) : null;
    lotes.push({
      numLote: Number(numLote),
      numPedido,
      referencia: String(referencia ?? ""),
      categoria: String(categoria ?? ""),
      nombreCliente,
      clienteAgrupado,
      nombrePlanta: String(nombrePlanta ?? ""),
      fechaCorteISO: dateToISO(fechaCorte),
      cantCortada,
      invCorte,
      invBMP,
      invPlanta,
      invBPT,
      invSemiterminado,
      fechaEntregaConfISO: dateToISO(fechaEntregaConf),
      fechaEntregaPedidoISO: dateToISO(fechaEntregaPedido),
      procesoDondeQuedo,
      ultimaSalidaTexto,
      semanaEntregaISO,
      ubicacionActual,
      unidadesUbicacion,
    });
  });
  return lotes;
}
async function parsePlantaInformes(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "hoja1") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  return agruparLotes(rows);
}
// ─── GENERADORES DE INFORMES ───────────────────────────────────────────────────
// Dashboard "Informe de Seguimiento": además del detalle plano por lote,
// agrupa por "Proceso Donde Quedó" para dar un resumen con lotes/unidades/%
// de unidades por proceso, y los totales generales — igual al formato que se
// arma a mano en la hoja de cálculo (dashboard de seguimiento semiterminado).
function generarSeguimientoSemiterminado(lotes) {
  const filas = lotes
    .filter((l) => l.invSemiterminado > 0)
    .map((l) => ({
      numLote: l.numLote,
      referencia: l.referencia,
      categoria: l.categoria,
      unidades: l.invSemiterminado,
      procesoDondeQuedo: l.procesoDondeQuedo || "(Sin proceso)",
      cliente: l.nombreCliente || "(Sin cliente)",
      ultimaSalida: l.ultimaSalidaTexto,
    }))
    .sort((a, b) => a.procesoDondeQuedo.localeCompare(b.procesoDondeQuedo) || a.cliente.localeCompare(b.cliente) || a.numLote - b.numLote);
  const totalLotes = filas.length;
  const totalUnidades = filas.reduce((s, f) => s + f.unidades, 0);
  // Resumen por Proceso (como antes).
  const grupos = new Map();
  filas.forEach((f) => {
    if (!grupos.has(f.procesoDondeQuedo)) grupos.set(f.procesoDondeQuedo, { lotes: 0, unidades: 0 });
    const g = grupos.get(f.procesoDondeQuedo);
    g.lotes += 1;
    g.unidades += f.unidades;
  });
  const resumen = [...grupos.entries()]
    .map(([proceso, g]) => ({
      proceso,
      lotes: g.lotes,
      unidades: g.unidades,
      pct: totalUnidades > 0 ? g.unidades / totalUnidades : 0,
    }))
    .sort((a, b) => b.unidades - a.unidades);
  // Resumen por Cliente — totales por cliente (para la pestaña "Por
  // Cliente"); el desglose de procesos de cada cliente se calcula en el
  // componente filtrando `filas` por cliente.
  const gruposCliente = new Map();
  filas.forEach((f) => {
    if (!gruposCliente.has(f.cliente)) gruposCliente.set(f.cliente, { lotes: 0, unidades: 0 });
    const g = gruposCliente.get(f.cliente);
    g.lotes += 1;
    g.unidades += f.unidades;
  });
  const resumenClientes = [...gruposCliente.entries()]
    .map(([cliente, g]) => ({
      cliente,
      lotes: g.lotes,
      unidades: g.unidades,
      pct: totalUnidades > 0 ? g.unidades / totalUnidades : 0,
    }))
    .sort((a, b) => b.unidades - a.unidades);
  // Resumen por Referencia — para la pestaña "Por Referencia" (saber cuánto
  // hay de cada semiterminado puntual, sin importar en qué proceso o cliente).
  const gruposReferencia = new Map();
  filas.forEach((f) => {
    const ref = f.referencia || "(Sin referencia)";
    if (!gruposReferencia.has(ref)) gruposReferencia.set(ref, { lotes: 0, unidades: 0 });
    const g = gruposReferencia.get(ref);
    g.lotes += 1;
    g.unidades += f.unidades;
  });
  const resumenReferencias = [...gruposReferencia.entries()]
    .map(([referencia, g]) => ({
      referencia,
      lotes: g.lotes,
      unidades: g.unidades,
      pct: totalUnidades > 0 ? g.unidades / totalUnidades : 0,
    }))
    .sort((a, b) => b.unidades - a.unidades);
  const procesosDistintos = resumen.length;
  return { filas, resumen, resumenClientes, resumenReferencias, totalLotes, totalUnidades, procesosDistintos };
}
// Compartido por En Planta / Por Cliente / Cliente Agrupado — solo cambia el
// campo por el que se agrupa (planta, cliente, o cliente agrupado KAMILA).
function generarAgrupadoPlanta(lotes, campoAgrupador) {
  const filas = lotes
    .filter((l) => l.invPlanta > 0)
    .map((l) => ({
      grupo: l[campoAgrupador] || "(Sin dato)",
      categoria: l.categoria,
      numLote: l.numLote,
      referencia: l.referencia,
      cantidad: l.invPlanta,
      fechaEntregaConf: l.fechaEntregaConfISO,
      // Días que lleva atrasado respecto a la fecha de entrega de
      // CONFECCIÓN (no la del pedido) — diasEntre da negativo cuando ya se
      // pasó la fecha, así que se invierte para mostrar un número positivo
      // de días de atraso (0 si no está vencido o no tiene fecha).
      diasAtraso: (() => {
        const d = diasEntre(l.fechaEntregaConfISO);
        return d !== null && d < 0 ? -d : 0;
      })(),
    }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.categoria.localeCompare(b.categoria));
  const gruposUnicos = [...new Set(filas.map((f) => f.grupo))].sort((a, b) => a.localeCompare(b));
  const resumen = gruposUnicos.map((g) => {
    const deGrupo = filas.filter((f) => f.grupo === g);
    return { grupo: g, lotes: deGrupo.length, unidades: deGrupo.reduce((s, f) => s + f.cantidad, 0) };
  });
  const totalLotes = resumen.reduce((s, r) => s + r.lotes, 0);
  const totalUnidades = resumen.reduce((s, r) => s + r.unidades, 0);
  return { filas, resumen, totalLotes, totalUnidades };
}
function generarCronograma(lotes) {
  const enPlanta = lotes.filter((l) => l.invPlanta > 0);
  const filas = enPlanta
    .filter((l) => l.semanaEntregaISO)
    .map((l) => ({
      numLote: l.numLote,
      referencia: l.referencia,
      planta: l.nombrePlanta || "(Sin planta)",
      categoria: l.categoria,
      unidades: l.invPlanta,
      semana: l.semanaEntregaISO,
      // Fecha Entrega Conf exacta del lote (no solo el lunes de su semana) —
      // se usa en el detalle emergente al hacer clic en una semana.
      fechaEntregaConf: l.fechaEntregaConfISO,
    }))
    .sort((a, b) => a.planta.localeCompare(b.planta) || a.categoria.localeCompare(b.categoria) || a.numLote - b.numLote);
  const sinSemana = enPlanta.filter((l) => !l.semanaEntregaISO);
  const semanas = [...new Set(filas.map((f) => f.semana))].sort();
  return { filas, semanas, sinSemana };
}
function generarPorPedido(lotes) {
  return [...lotes]
    .sort((a, b) => a.numPedido - b.numPedido || a.numLote - b.numLote)
    .map((l) => {
      const dias = diasEntre(l.fechaEntregaPedidoISO);
      return {
        numPedido: l.numPedido,
        numLote: l.numLote,
        referencia: l.referencia,
        categoria: l.categoria,
        nombrePlanta: l.nombrePlanta || "",
        ubicacionActual: l.ubicacionActual,
        unidades: l.unidadesUbicacion,
        fechaEntregaConf: l.fechaEntregaConfISO,
        fechaEntregaPedido: l.fechaEntregaPedidoISO,
        diasRestantes: dias,
        estado: estadoDe(dias),
      };
    });
}
function generarBMP(lotes) {
  const filas = lotes
    .filter((l) => l.invBMP > 0)
    .map((l) => ({
      categoria: l.categoria,
      cliente: l.nombreCliente,
      referencia: l.referencia,
      numLote: l.numLote,
      cantidadBMP: l.invBMP,
      fechaCorte: l.fechaCorteISO,
      diasParaCorte: diasEntre(l.fechaCorteISO),
      fechaEntregaPedido: l.fechaEntregaPedidoISO,
      diasRestantesPedido: diasEntre(l.fechaEntregaPedidoISO),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.cliente.localeCompare(b.cliente));
  const totalLotes = filas.length;
  const totalUnidades = filas.reduce((s, f) => s + f.cantidadBMP, 0);
  // Resumen por Cliente — mismo patrón que Semiterminados: total por cliente
  // arriba, y el detalle de lotes de ese cliente se filtra de `filas` al
  // hacer clic (ver BloqueBMP).
  const gruposCliente = new Map();
  filas.forEach((f) => {
    const cli = f.cliente || "(Sin cliente)";
    if (!gruposCliente.has(cli)) gruposCliente.set(cli, { lotes: 0, unidades: 0 });
    const g = gruposCliente.get(cli);
    g.lotes += 1;
    g.unidades += f.cantidadBMP;
  });
  const resumenClientes = [...gruposCliente.entries()]
    .map(([cliente, g]) => ({
      cliente,
      lotes: g.lotes,
      unidades: g.unidades,
      pct: totalUnidades > 0 ? g.unidades / totalUnidades : 0,
    }))
    .sort((a, b) => b.unidades - a.unidades);
  return { filas, resumenClientes, totalLotes, totalUnidades };
}
// Mismo criterio que generarBMP, pero para lotes que ya llegaron a Bodega de
// Producto Terminado (invBPT, columna AG del Excel) — listos para despacho.
function generarBPT(lotes) {
  return lotes
    .filter((l) => l.invBPT > 0)
    .map((l) => ({
      categoria: l.categoria,
      cliente: l.nombreCliente,
      referencia: l.referencia,
      numLote: l.numLote,
      cantidadBPT: l.invBPT,
      fechaCorte: l.fechaCorteISO,
      diasParaCorte: diasEntre(l.fechaCorteISO),
      fechaEntregaPedido: l.fechaEntregaPedidoISO,
      diasRestantesPedido: diasEntre(l.fechaEntregaPedidoISO),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.cliente.localeCompare(b.cliente));
}
function generarProgramacionYanko(lotes) {
  const filas = lotes
    .filter((l) => l.nombrePlanta === PLANTA_YANKO && l.invPlanta > 0)
    .map((l) => ({
      categoria: l.categoria,
      numPedido: l.numPedido,
      numLote: l.numLote,
      referencia: l.referencia,
      cantidad: l.invPlanta,
      fechaEntregaPedido: l.fechaEntregaPedidoISO,
      diasRestantes: diasEntre(l.fechaEntregaPedidoISO),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || (a.fechaEntregaPedido || "").localeCompare(b.fechaEntregaPedido || ""));
  const kamilaLotes = lotes.filter((l) => l.clienteAgrupado === "KAMILA (COLOMBIA + VENEZUELA)" && (l.invPlanta > 0 || l.invBMP > 0));
  const categorias = [...new Set(kamilaLotes.map((l) => l.categoria))].sort();
  // La columna "Planta" de esta comparación es específicamente Planta Yanko
  // (así se titula la sección) — sin este filtro, un lote Kamila en OTRA
  // planta (ej. Carlos) con inventario en planta también sumaba acá, dando
  // la impresión de que estaba en Yanko cuando en realidad no.
  const comparacion = categorias.map((cat) => {
    const planta = kamilaLotes.filter((l) => l.categoria === cat && l.invPlanta > 0 && l.nombrePlanta === PLANTA_YANKO);
    const bmp = kamilaLotes.filter((l) => l.categoria === cat && l.invBMP > 0);
    const plantaUnid = planta.reduce((s, l) => s + l.invPlanta, 0);
    const bmpUnid = bmp.reduce((s, l) => s + l.invBMP, 0);
    return { categoria: cat, plantaUnid, plantaLotes: planta.length, bmpUnid, bmpLotes: bmp.length, total: plantaUnid + bmpUnid };
  });
  return { filas, comparacion };
}
// ─── COMPARAR PERÍODOS ──────────────────────────────────────────────────────────
// Los informes de arriba (En Planta, Por Cliente, BMP, etc.) solo muestran el
// estado de la ÚLTIMA carga subida — una foto del momento, sin forma de ver
// qué cambió desde ayer/la semana pasada/el mes pasado. Esto usa el
// histórico completo de cargas (planeacion_cargas) para comparar dos fechas
// cualquiera y mostrar la diferencia.
function calcularKpisLotes(lotes) {
  return {
    total: lotes.length,
    enPlanta: lotes.filter((l) => l.invPlanta > 0).length,
    enBMP: lotes.filter((l) => l.invBMP > 0).length,
    enSemiterminado: lotes.filter((l) => l.invSemiterminado > 0).length,
    vencidos: lotes.filter((l) => l.fechaEntregaPedidoISO && diasEntre(l.fechaEntregaPedidoISO) < 0).length,
  };
}
function restarDiasISO(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dias);
  return dt.toISOString().slice(0, 10);
}
// Dada una fecha objetivo, busca dentro de las cargas ya subidas la más
// cercana a esa fecha SIN pasarse (la más reciente que sea <= fechaISO) — si
// no hay ninguna tan vieja, se queda con la más antigua que exista, para que
// los atajos rápidos (Ayer, Semana pasada, etc.) siempre encuentren algo con
// qué comparar aunque no haya carga exacta de ese día.
function cargaMasCercanaA(cargasOrdenadas, fechaISO) {
  const candidatas = cargasOrdenadas.filter((c) => (c.fecha || "") <= fechaISO);
  if (candidatas.length) return candidatas[0];
  return cargasOrdenadas[cargasOrdenadas.length - 1] || null;
}
// Junta dos "resumen" (los que devuelve generarAgrupadoPlanta: [{grupo,
// lotes, unidades}]) en una sola lista con la diferencia por grupo —
// incluyendo grupos que solo existen en uno de los dos períodos (ej. un
// cliente nuevo, o uno que ya no tiene nada en planta).
function compararResumenes(resumenA, resumenB) {
  const nombres = [...new Set([...resumenA.map((r) => r.grupo), ...resumenB.map((r) => r.grupo)])].sort((a, b) => a.localeCompare(b));
  return nombres
    .map((nombre) => {
      const a = resumenA.find((r) => r.grupo === nombre);
      const b = resumenB.find((r) => r.grupo === nombre);
      const unidadesA = a?.unidades || 0;
      const unidadesB = b?.unidades || 0;
      return { grupo: nombre, unidadesA, unidadesB, diferencia: unidadesB - unidadesA };
    })
    .sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia));
}
function TablaComparacion({ filas, primeraColLabel }) {
  if (!filas.length) {
    return (
      <div style={{ textAlign: "center", padding: 24, color: C.slate, fontSize: 13, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
        Sin datos.
      </div>
    );
  }
  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.ink }}>
            {[primeraColLabel, "Período base", "Período actual", "Diferencia"].map((h, i) => (
              <th key={h} style={{ padding: "9px 12px", color: C.seam, textAlign: i === 0 ? "left" : "right", fontWeight: 700, fontSize: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.grupo} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: "7px 12px" }}>{f.grupo}</td>
              <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(f.unidadesA)}</td>
              <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(f.unidadesB)}</td>
              <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: f.diferencia > 0 ? C.green : f.diferencia < 0 ? C.red : C.slate }}>
                {f.diferencia > 0 ? "▲ " : f.diferencia < 0 ? "▼ " : ""}{fmtNum(Math.abs(f.diferencia))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function KpiComparado({ icon, label, a, b, color, bg }) {
  const diff = b - a;
  return (
    <div style={{ background: bg, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 6 }}>{icon} {label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.ink }}>{fmtNum(b)}</div>
        <div style={{ fontSize: 11, color: C.slate }}>antes: {fmtNum(a)}</div>
      </div>
      {diff !== 0 ? (
        <div style={{ fontSize: 11, fontWeight: 700, color: diff > 0 ? C.green : C.red, marginTop: 2 }}>
          {diff > 0 ? "▲" : "▼"} {fmtNum(Math.abs(diff))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>Sin cambio</div>
      )}
    </div>
  );
}
function BloqueCompararPeriodos({ cargasOrdenadas, clienteAsociado }) {
  const [cargaIdB, setCargaIdB] = useState(cargasOrdenadas[0]?.id || null); // período actual (más reciente por defecto)
  const [cargaIdA, setCargaIdA] = useState(cargasOrdenadas[1]?.id || cargasOrdenadas[0]?.id || null); // período base
  const cargaB = cargasOrdenadas.find((c) => c.id === cargaIdB) || cargasOrdenadas[0] || null;
  const cargaA = cargasOrdenadas.find((c) => c.id === cargaIdA) || cargasOrdenadas[1] || cargasOrdenadas[0] || null;
  function usarPreset(dias) {
    if (!cargaB) return;
    const cargaCercana = cargaMasCercanaA(cargasOrdenadas, restarDiasISO(cargaB.fecha, dias));
    if (cargaCercana) setCargaIdA(cargaCercana.id);
  }
  const lotesA = useMemo(() => {
    const todos = cargaA?.lotes || [];
    return clienteAsociado ? todos.filter((l) => coincideCliente(l.nombreCliente, clienteAsociado)) : todos;
  }, [cargaA, clienteAsociado]);
  const lotesB = useMemo(() => {
    const todos = cargaB?.lotes || [];
    return clienteAsociado ? todos.filter((l) => coincideCliente(l.nombreCliente, clienteAsociado)) : todos;
  }, [cargaB, clienteAsociado]);
  const kpisA = useMemo(() => calcularKpisLotes(lotesA), [lotesA]);
  const kpisB = useMemo(() => calcularKpisLotes(lotesB), [lotesB]);
  const comparacionCliente = useMemo(
    () => compararResumenes(generarAgrupadoPlanta(lotesA, "nombreCliente").resumen, generarAgrupadoPlanta(lotesB, "nombreCliente").resumen),
    [lotesA, lotesB]
  );
  const comparacionPlanta = useMemo(
    () => compararResumenes(generarAgrupadoPlanta(lotesA, "nombrePlanta").resumen, generarAgrupadoPlanta(lotesB, "nombrePlanta").resumen),
    [lotesA, lotesB]
  );
  if (!cargasOrdenadas.length) {
    return <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>Todavía no hay cargas para comparar.</div>;
  }
  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 700 }}>
        Compara el estado de dos cargas distintas para ver qué cambió — usa los atajos rápidos (toman la carga más cercana a esa fecha) o elige las cargas a mano.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Btn small variant="secondary" onClick={() => usarPreset(1)}>Ayer vs. Hoy</Btn>
        <Btn small variant="secondary" onClick={() => usarPreset(7)}>Semana pasada vs. Esta semana</Btn>
        <Btn small variant="secondary" onClick={() => usarPreset(15)}>Quincena pasada vs. Esta quincena</Btn>
        <Btn small variant="secondary" onClick={() => usarPreset(30)}>Mes pasado vs. Este mes</Btn>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: C.slate, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Período base</div>
          <select
            value={cargaIdA || ""}
            onChange={(e) => setCargaIdA(e.target.value)}
            style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
          >
            {cargasOrdenadas.map((c) => (
              <option key={c.id} value={c.id}>Carga {c.fecha}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 18, color: C.slate }}>→</div>
        <div>
          <div style={{ fontSize: 10, color: C.slate, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Período actual</div>
          <select
            value={cargaIdB || ""}
            onChange={(e) => setCargaIdB(e.target.value)}
            style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
          >
            {cargasOrdenadas.map((c) => (
              <option key={c.id} value={c.id}>Carga {c.fecha}</option>
            ))}
          </select>
        </div>
      </div>
      {!cargaA || !cargaB ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>Elige las dos cargas a comparar.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
            <KpiComparado icon="📦" label="Total lotes" a={kpisA.total} b={kpisB.total} color={C.ink} bg={C.canvas} />
            <KpiComparado icon="🏭" label="En Planta" a={kpisA.enPlanta} b={kpisB.enPlanta} color={C.green} bg={C.greenBg} />
            <KpiComparado icon="🧵" label="En BMP" a={kpisA.enBMP} b={kpisB.enBMP} color={C.amber} bg={C.amberBg} />
            <KpiComparado icon="🧶" label="Semiterminado" a={kpisA.enSemiterminado} b={kpisB.enSemiterminado} color={C.violet} bg={C.violetBg} />
            <KpiComparado icon="⚠" label="Vencidos" a={kpisA.vencidos} b={kpisB.vencidos} color={C.red} bg={C.redBg} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>POR CLIENTE (unidades en planta)</div>
          <TablaComparacion filas={comparacionCliente} primeraColLabel="Cliente" />
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, margin: "24px 0 10px" }}>POR PLANTA (unidades en planta)</div>
          <TablaComparacion filas={comparacionPlanta} primeraColLabel="Planta" />
        </>
      )}
    </div>
  );
}
// ─── SUBIR HOJA1 ────────────────────────────────────────────────────────────────
function SubirHoja1Modal({ onConfirm, onClose }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setError("");
    setCargando(true);
    try {
      const lotes = await parsePlantaInformes(f);
      if (!lotes.length) {
        setError("No se encontraron lotes válidos. Verifica que el archivo tenga una hoja \"Hoja1\" con el formato esperado.");
      } else {
        const resumen = {
          total: lotes.length,
          enPlanta: lotes.filter((l) => l.invPlanta > 0).length,
          enBMP: lotes.filter((l) => l.invBMP > 0).length,
          enSemiterminado: lotes.filter((l) => l.invSemiterminado > 0).length,
          enCorte: lotes.filter((l) => l.invCorte > 0).length,
        };
        setPreview({ lotes, resumen });
      }
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx) con una hoja llamada \"Hoja1\".");
    }
    setCargando(false);
  }
  function confirmar() {
    if (!preview) return;
    onConfirm(preview.lotes);
    onClose();
  }
  return (
    <Modal title="Subir Hoja1 — Planta Informes" onClose={onClose} width={520}>
      {!preview ? (
        <div>
          <div style={{ padding: "12px 14px", background: C.blueBg, borderRadius: 8, marginBottom: 18, fontSize: 13, color: C.blue, lineHeight: 1.5 }}>
            Sube el Excel con la hoja "Hoja1" (datos crudos del ERP). El sistema calcula automáticamente los 8 informes de producción a partir de esta información.
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={cargando}
            style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, fontFamily: "inherit" }}
          />
          {cargando && <div style={{ fontSize: 13, color: C.slate, marginTop: 10 }}>Leyendo archivo...</div>}
          {error && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red, fontWeight: 600 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>
            Se encontraron <strong>{preview.resumen.total}</strong> lotes.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 20 }}>
            <KPI icon="🏭" label="En Planta" value={preview.resumen.enPlanta} color={C.green} bg={C.greenBg} />
            <KPI icon="🧵" label="En BMP" value={preview.resumen.enBMP} color={C.amber} bg={C.amberBg} />
            <KPI icon="🧶" label="Semiterminado" value={preview.resumen.enSemiterminado} color={C.violet} bg={C.violetBg} />
            <KPI icon="✂" label="En Corte" value={preview.resumen.enCorte} color={C.blue} bg={C.blueBg} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setPreview(null)}>← Volver</Btn>
            <Btn variant="danger" onClick={confirmar}>Guardar carga y generar informes</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
// ─── TABLA GENÉRICA ─────────────────────────────────────────────────────────────
function Tabla({ columnas, filas, vacio }) {
  if (!filas.length) {
    return <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>{vacio || "Sin datos."}</div>;
  }
  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.ink, position: "sticky", top: 0 }}>
            {columnas.map((c) => (
              <th key={c.key} style={{ padding: "9px 12px", color: C.seam, textAlign: c.align || "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
              {columnas.map((c) => (
                <td key={c.key} style={{ padding: "7px 12px", textAlign: c.align || "left", whiteSpace: "nowrap", color: c.color ? c.color(f) : C.ink }}>
                  {c.render ? c.render(f) : f[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function BloqueAgrupado({ titulo, primeraColLabel, data }) {
  // Grupo (planta/cliente/cliente agrupado) que el usuario abrió desde el
  // resumen — null si ninguno. Al hacer clic en una fila del resumen se
  // despliega, debajo, el detalle de lotes de ESE grupo puntual (en vez de
  // tener que buscarlo a mano en la tabla completa de abajo).
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const filasGrupoAbierto = grupoAbierto ? data.filas.filter((f) => f.grupo === grupoAbierto) : [];
  return (
    <div>
      {data.resumen.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>RESUMEN POR {titulo.toUpperCase()}</div>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>{primeraColLabel}</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
                </tr>
              </thead>
              <tbody>
                {data.resumen.map((r, i) => (
                  <tr
                    key={r.grupo}
                    onClick={() => setGrupoAbierto(grupoAbierto === r.grupo ? null : r.grupo)}
                    title="Ver lotes de este grupo"
                    style={{
                      background: grupoAbierto === r.grupo ? C.violetBg : i % 2 === 0 ? C.canvas : C.white,
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "7px 12px" }}>{r.grupo}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FFF2CC" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: C.ink }}>TOTAL EN PLANTA</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(data.totalLotes)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(data.totalUnidades)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {grupoAbierto && (
        <Modal title={`Lotes de "${grupoAbierto}"`} onClose={() => setGrupoAbierto(null)} width={720}>
          <div style={{ marginBottom: 14, fontSize: 12, color: C.slate }}>
            {filasGrupoAbierto.length} lote{filasGrupoAbierto.length !== 1 ? "s" : ""} · {fmtNum(filasGrupoAbierto.reduce((s, f) => s + f.cantidad, 0))} unidades en total
          </div>
          <Tabla
            vacio="Sin lotes en este grupo."
            columnas={[
              { key: "categoria", label: "Categoría" },
              { key: "numLote", label: "Num Lote", align: "right" },
              { key: "referencia", label: "Referencia" },
              { key: "cantidad", label: "Cant. en Planta", align: "right", render: (f) => fmtNum(f.cantidad) },
              { key: "diasAtraso", label: "Días de Atraso", align: "right", render: (f) => (f.diasAtraso > 0 ? f.diasAtraso : "—"), color: (f) => (f.diasAtraso > 0 ? C.red : C.slate) },
            ]}
            filas={filasGrupoAbierto}
          />
        </Modal>
      )}
      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>DETALLE COMPLETO</div>
      <Tabla
        vacio="Sin lotes en planta."
        columnas={[
          { key: "grupo", label: primeraColLabel },
          { key: "categoria", label: "Categoría" },
          { key: "numLote", label: "Num Lote", align: "right" },
          { key: "referencia", label: "Referencia" },
          { key: "cantidad", label: "Cant. en Planta", align: "right", render: (f) => fmtNum(f.cantidad) },
          { key: "diasAtraso", label: "Días de Atraso", align: "right", render: (f) => (f.diasAtraso > 0 ? f.diasAtraso : "—"), color: (f) => (f.diasAtraso > 0 ? C.red : C.slate) },
        ]}
        filas={data.filas}
      />
    </div>
  );
}
// Dashboard de "Informe de Seguimiento": KPIs + resumen por proceso (con %
// de unidades) + detalle de lotes agrupado por proceso, en vez de la tabla
// plana que tenía antes el reporte de Semiterminado.
function BloqueSeguimientoSemiterminado({ data }) {
  const { filas, resumen, resumenClientes, resumenReferencias, totalLotes, totalUnidades, procesosDistintos } = data;
  const [vista, setVista] = useState("proceso");
  const [clienteAbierto, setClienteAbierto] = useState(null);
  // Proceso puntual seleccionado en la pestaña "Por Proceso" (ej. TERMINACION,
  // BAJADA DE VINILO) — filtra `filas` a solo los lotes que están ahí.
  const [procesoSel, setProcesoSel] = useState("");
  if (!totalLotes) {
    return <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>Sin lotes en semiterminado.</div>;
  }
  const filasProcesoSel = procesoSel ? filas.filter((f) => f.procesoDondeQuedo === procesoSel) : [];
  // Desglose de procesos del cliente actualmente abierto en el modal —
  // filtra `filas` (que ya trae `cliente`) y agrupa por procesoDondeQuedo.
  const procesosClienteAbierto = (() => {
    if (!clienteAbierto) return [];
    const deCliente = filas.filter((f) => f.cliente === clienteAbierto);
    const totalCliente = deCliente.reduce((s, f) => s + f.unidades, 0);
    const grupos = new Map();
    deCliente.forEach((f) => {
      if (!grupos.has(f.procesoDondeQuedo)) grupos.set(f.procesoDondeQuedo, { lotes: 0, unidades: 0 });
      const g = grupos.get(f.procesoDondeQuedo);
      g.lotes += 1;
      g.unidades += f.unidades;
    });
    return [...grupos.entries()]
      .map(([proceso, g]) => ({ proceso, lotes: g.lotes, unidades: g.unidades, pct: totalCliente > 0 ? g.unidades / totalCliente : 0 }))
      .sort((a, b) => b.unidades - a.unidades);
  })();
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <KPI icon="📦" label="Total Lotes" value={fmtNum(totalLotes)} color={C.ink} bg={C.canvas} />
        <KPI icon="🧶" label="Total Unidades" value={fmtNum(totalUnidades)} color={C.violet} bg={C.violetBg} />
        <KPI icon="🔀" label="Procesos Distintos" value={fmtNum(procesosDistintos)} color={C.blue} bg={C.blueBg} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div
          onClick={() => setVista("proceso")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: vista === "proceso" ? C.ink : C.white, color: vista === "proceso" ? C.seam : C.ink, border: `1px solid ${vista === "proceso" ? C.ink : C.border}` }}
        >
          POR PROCESO
        </div>
        <div
          onClick={() => setVista("cliente")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: vista === "cliente" ? C.ink : C.white, color: vista === "cliente" ? C.seam : C.ink, border: `1px solid ${vista === "cliente" ? C.ink : C.border}` }}
        >
          POR CLIENTE
        </div>
        <div
          onClick={() => setVista("referencia")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: vista === "referencia" ? C.ink : C.white, color: vista === "referencia" ? C.seam : C.ink, border: `1px solid ${vista === "referencia" ? C.ink : C.border}` }}
        >
          POR REFERENCIA
        </div>
      </div>
      {vista === "proceso" && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>RESUMEN POR PROCESO</div>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Proceso Donde Quedó</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>% Unidades</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r, i) => (
                  <tr key={r.proceso} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 12px" }}>{r.proceso}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{Math.round(r.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FFF2CC" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: C.ink }}>TOTAL</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalLotes)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalUnidades)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>VER UN PROCESO PUNTUAL</div>
          <div style={{ marginBottom: 14 }}>
            <select
              value={procesoSel}
              onChange={(e) => setProcesoSel(e.target.value)}
              style={{ padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit", minWidth: 260 }}
            >
              <option value="">Selecciona un proceso (ej. TERMINACION, BAJADA DE VINILO)...</option>
              {resumen.map((r) => (
                <option key={r.proceso} value={r.proceso}>{r.proceso || "(Sin proceso)"} · {fmtNum(r.unidades)} und</option>
              ))}
            </select>
          </div>
          {procesoSel && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: C.slate, marginBottom: 8 }}>
                {fmtNum(filasProcesoSel.length)} lote{filasProcesoSel.length !== 1 ? "s" : ""} · {fmtNum(filasProcesoSel.reduce((s, f) => s + f.unidades, 0))} unidades en "{procesoSel}"
              </div>
              <Tabla
                vacio="Sin lotes en este proceso."
                columnas={[
                  { key: "cliente", label: "Cliente" },
                  { key: "numLote", label: "Num Lote", align: "right" },
                  { key: "referencia", label: "Referencia" },
                  { key: "categoria", label: "Categoría" },
                  { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
                  { key: "ultimaSalida", label: "Última Salida (sin entrega)" },
                ]}
                filas={filasProcesoSel}
              />
            </div>
          )}
        </>
      )}
      {vista === "cliente" && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>RESUMEN POR CLIENTE</div>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>Clic en un cliente para ver en qué procesos tiene lotes.</div>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Cliente</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>% Unidades</th>
                </tr>
              </thead>
              <tbody>
                {resumenClientes.map((r, i) => (
                  <tr
                    key={r.cliente}
                    onClick={() => setClienteAbierto(r.cliente)}
                    title="Ver procesos de este cliente"
                    style={{
                      background: clienteAbierto === r.cliente ? C.violetBg : i % 2 === 0 ? C.canvas : C.white,
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "7px 12px" }}>{r.cliente}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{Math.round(r.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FFF2CC" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: C.ink }}>TOTAL</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalLotes)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalUnidades)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      {vista === "referencia" && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>RESUMEN POR REFERENCIA</div>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Referencia</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>% Unidades</th>
                </tr>
              </thead>
              <tbody>
                {resumenReferencias.map((r, i) => (
                  <tr key={r.referencia} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 12px" }}>{r.referencia}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{Math.round(r.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FFF2CC" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: C.ink }}>TOTAL</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalLotes)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalUnidades)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      {clienteAbierto && (
        <Modal title={`Procesos de "${clienteAbierto}"`} onClose={() => setClienteAbierto(null)} width={560}>
          <Tabla
            vacio="Sin procesos para este cliente."
            columnas={[
              { key: "proceso", label: "Proceso Donde Quedó" },
              { key: "lotes", label: "Lotes", align: "right", render: (f) => fmtNum(f.lotes) },
              { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
              { key: "pct", label: "% del cliente", align: "right", render: (f) => `${Math.round(f.pct * 100)}%` },
            ]}
            filas={procesosClienteAbierto}
          />
        </Modal>
      )}
      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>DETALLE DE LOTES POR PROCESO</div>
      <Tabla
        vacio="Sin lotes en semiterminado."
        columnas={[
          { key: "procesoDondeQuedo", label: "Proceso Donde Quedó" },
          { key: "cliente", label: "Cliente" },
          { key: "numLote", label: "Num Lote", align: "right" },
          { key: "referencia", label: "Referencia" },
          { key: "categoria", label: "Categoría" },
          { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
          { key: "ultimaSalida", label: "Última Salida (sin entrega)" },
        ]}
        filas={filas}
      />
    </div>
  );
}
// Mismo patrón de BloqueSeguimientoSemiterminado (KPI de total + pestaña Por
// Cliente + clic abre ventana con el detalle de ese cliente), aplicado a BMP.
function BloqueBMP({ data, currentUser }) {
  const { filas, resumenClientes, totalLotes, totalUnidades } = data;
  const [vista, setVista] = useState("detalle");
  const [clienteAbierto, setClienteAbierto] = useState(null);
  if (!totalLotes) {
    return <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>Sin lotes en BMP.</div>;
  }
  const filasClienteAbierto = clienteAbierto ? filas.filter((f) => f.cliente === clienteAbierto) : [];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
        <KPI icon="📦" label="Total Lotes en BMP" value={fmtNum(totalLotes)} color={C.ink} bg={C.canvas} />
        <KPI icon="🧵" label="Total Unidades en BMP" value={fmtNum(totalUnidades)} color={C.amber} bg={C.amberBg} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div
          onClick={() => setVista("detalle")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: vista === "detalle" ? C.ink : C.white, color: vista === "detalle" ? C.seam : C.ink, border: `1px solid ${vista === "detalle" ? C.ink : C.border}` }}
        >
          DETALLE
        </div>
        <div
          onClick={() => setVista("cliente")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: vista === "cliente" ? C.ink : C.white, color: vista === "cliente" ? C.seam : C.ink, border: `1px solid ${vista === "cliente" ? C.ink : C.border}` }}
        >
          POR CLIENTE
        </div>
        <div
          onClick={() => setVista("programador")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: vista === "programador" ? C.ink : C.white, color: vista === "programador" ? C.seam : C.ink, border: `1px solid ${vista === "programador" ? C.ink : C.border}` }}
        >
          📅 PROGRAMADOR DE PLANTA
        </div>
      </div>
      {vista === "programador" && <ProgramadorPlantaView filas={filas} currentUser={currentUser} />}
      {vista === "detalle" && (
        <Tabla
          vacio="Sin lotes en BMP."
          columnas={[
            { key: "categoria", label: "Categoría" },
            { key: "cliente", label: "Cliente" },
            { key: "referencia", label: "Referencia" },
            { key: "numLote", label: "Num Lote" },
            { key: "cantidadBMP", label: "Cantidad BMP", align: "right", render: (f) => fmtNum(f.cantidadBMP) },
            { key: "fechaCorte", label: "Fecha Corte", render: (f) => fmtFechaISO(f.fechaCorte) || "—" },
            { key: "diasParaCorte", label: "Días para Corte", align: "right", render: (f) => (f.diasParaCorte ?? "—"), color: (f) => (f.diasParaCorte < 0 ? C.red : C.ink) },
            { key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
            { key: "diasRestantesPedido", label: "Días Rest. Pedido", align: "right", render: (f) => (f.diasRestantesPedido ?? "—"), color: (f) => (f.diasRestantesPedido < 0 ? C.red : C.ink) },
          ]}
          filas={filas}
        />
      )}
      {vista === "cliente" && (
        <>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>Clic en un cliente para ver el detalle de sus lotes en BMP.</div>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Cliente</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>% Unidades</th>
                </tr>
              </thead>
              <tbody>
                {resumenClientes.map((r, i) => (
                  <tr
                    key={r.cliente}
                    onClick={() => setClienteAbierto(r.cliente)}
                    title="Ver lotes de este cliente en BMP"
                    style={{
                      background: clienteAbierto === r.cliente ? C.violetBg : i % 2 === 0 ? C.canvas : C.white,
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "7px 12px" }}>{r.cliente}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{Math.round(r.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FFF2CC" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: C.ink }}>TOTAL</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalLotes)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalUnidades)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      {clienteAbierto && (
        <Modal title={`BMP de "${clienteAbierto}"`} onClose={() => setClienteAbierto(null)} width={680}>
          <Tabla
            vacio="Sin lotes para este cliente."
            columnas={[
              { key: "categoria", label: "Categoría" },
              { key: "referencia", label: "Referencia" },
              { key: "numLote", label: "Num Lote" },
              { key: "cantidadBMP", label: "Cantidad BMP", align: "right", render: (f) => fmtNum(f.cantidadBMP) },
              { key: "fechaCorte", label: "Fecha Corte", render: (f) => fmtFechaISO(f.fechaCorte) || "—" },
              { key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
            ]}
            filas={filasClienteAbierto}
          />
        </Modal>
      )}
    </div>
  );
}
// ─── PROGRAMADOR DE PLANTA (BMP → días con capacidad) ──────────────────────────
// Asigna lotes que están en BMP a días específicos de Planta, respetando una
// capacidad diaria (en unidades) editable por día — mismo espíritu que la
// "Programación de Mesones" de Corte, pero con un solo recurso (Planta no
// tiene mesones), así que la capacidad es un único número por día en vez de
// por mesón/grupo. Un lote se puede repartir en varios días (se programa por
// cantidad, no todo-o-nada) — lo pendiente de cada lote es su cantidadBMP
// menos lo ya asignado en `planta_bmp_programacion`.
const DEFAULT_CAPACIDAD_DIA = 500; // unidades/día por defecto — editable por día desde la vista
function ProgramadorPlantaView({ filas, currentUser }) {
  const [asignaciones, setAsignaciones] = useState([]);
  const [capacidades, setCapacidades] = useState({});
  const [modalLote, setModalLote] = useState(null);
  const [editandoCap, setEditandoCap] = useState(null);
  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, "planta_bmp_programacion"), (snap) => {
      setAsignaciones(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsub2 = onSnapshot(collection(db, "planta_bmp_capacidad"), (snap) => {
      const m = {};
      snap.docs.forEach((d) => { m[d.id] = d.data().capacidad; });
      setCapacidades(m);
    });
    return () => { unsub1(); unsub2(); };
  }, []);
  const pendientePorLote = useMemo(() => {
    const m = new Map();
    filas.forEach((f) => m.set(f.numLote, f.cantidadBMP));
    asignaciones.forEach((a) => {
      if (m.has(a.numLote)) m.set(a.numLote, m.get(a.numLote) - (a.cantidad || 0));
    });
    return m;
  }, [filas, asignaciones]);
  const lotesConPendiente = useMemo(
    () =>
      filas
        .map((f) => ({ ...f, pendiente: Math.max(0, Math.round(pendientePorLote.get(f.numLote) ?? f.cantidadBMP)) }))
        .filter((f) => f.pendiente > 0)
        .sort((a, b) => (a.diasParaCorte ?? 999) - (b.diasParaCorte ?? 999)),
    [filas, pendientePorLote]
  );
  const dias = useMemo(() => [...new Set(asignaciones.map((a) => a.fecha))].sort(), [asignaciones]);
  async function programar(fila, fecha, cantidad) {
    await fsSave("planta_bmp_programacion", uid(), {
      numLote: fila.numLote,
      referencia: fila.referencia,
      categoria: fila.categoria,
      cliente: fila.cliente,
      cantidad,
      fecha,
      creadoEn: new Date().toISOString(),
      creadoPor: currentUser?.name || "—",
    });
    setModalLote(null);
  }
  async function quitarAsignacion(id) {
    await fsDelete("planta_bmp_programacion", id);
  }
  async function guardarCapacidad(fecha, valor) {
    await fsSave("planta_bmp_capacidad", fecha, { capacidad: Number(valor) || 0 });
    setEditandoCap(null);
  }
  const totalPendiente = lotesConPendiente.reduce((s, f) => s + f.pendiente, 0);
  const totalProgramado = asignaciones.reduce((s, a) => s + (a.cantidad || 0), 0);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
        <KPI icon="🗓" label="Unidades por Programar" value={fmtNum(totalPendiente)} color={C.amber} bg={C.amberBg} />
        <KPI icon="✅" label="Unidades Ya Programadas" value={fmtNum(totalProgramado)} color={C.green} bg={C.greenBg} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20, alignItems: "start" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>LOTES POR PROGRAMAR</div>
          {!lotesConPendiente.length ? (
            <div style={{ textAlign: "center", padding: 30, color: C.slate, fontSize: 13, background: C.canvas, borderRadius: 10 }}>
              Todos los lotes de BMP ya están programados.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lotesConPendiente.map((f) => (
                <div key={f.numLote} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: C.white }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{f.referencia} · Lote {f.numLote}</div>
                      <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{f.cliente} · {f.categoria}</div>
                      <div style={{ fontSize: 11, color: f.diasParaCorte < 0 ? C.red : C.slate, marginTop: 4 }}>
                        Corte: {fmtFechaISO(f.fechaCorte) || "—"}{f.diasParaCorte != null ? ` (${f.diasParaCorte}d)` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{fmtNum(f.pendiente)}</div>
                      <div style={{ fontSize: 10, color: C.slate }}>pendiente</div>
                    </div>
                  </div>
                  <Btn small variant="primary" onClick={() => setModalLote(f)}>📅 Programar</Btn>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>PROGRAMACIÓN POR DÍA</div>
          {!dias.length ? (
            <div style={{ textAlign: "center", padding: 30, color: C.slate, fontSize: 13, background: C.canvas, borderRadius: 10 }}>
              Aún no hay lotes programados a ningún día.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dias.map((fecha) => {
                const asigDia = asignaciones.filter((a) => a.fecha === fecha);
                const usado = asigDia.reduce((s, a) => s + (a.cantidad || 0), 0);
                const capacidad = capacidades[fecha] ?? DEFAULT_CAPACIDAD_DIA;
                const disponible = capacidad - usado;
                return (
                  <div key={fecha} style={{ border: `1px solid ${disponible < 0 ? C.red : C.border}`, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: disponible < 0 ? C.redBg : C.canvas }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink }}>{fmtFechaISO(fecha)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ color: C.slate }}>{fmtNum(usado)} /</span>
                        {editandoCap === fecha ? (
                          <input
                            type="number"
                            autoFocus
                            defaultValue={capacidad}
                            onBlur={(e) => guardarCapacidad(fecha, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && guardarCapacidad(fecha, e.target.value)}
                            style={{ width: 70, padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }}
                          />
                        ) : (
                          <span
                            onClick={() => setEditandoCap(fecha)}
                            style={{ cursor: "pointer", fontWeight: 700, color: C.ink, textDecoration: "underline dotted" }}
                            title="Click para editar capacidad del día"
                          >
                            {fmtNum(capacidad)}
                          </span>
                        )}
                        <span style={{ fontWeight: 800, color: disponible < 0 ? C.red : C.green }}>
                          {disponible < 0 ? `${fmtNum(Math.abs(disponible))} sobre` : `${fmtNum(disponible)} disp.`}
                        </span>
                      </div>
                    </div>
                    <div>
                      {asigDia.map((a) => (
                        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
                          <div>
                            <span style={{ fontWeight: 700, color: C.ink }}>{a.referencia}</span>
                            <span style={{ color: C.slate }}> · Lote {a.numLote} · {a.cliente}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontWeight: 700, color: C.ink }}>{fmtNum(a.cantidad)}</span>
                            <button
                              onClick={() => quitarAsignacion(a.id)}
                              title="Quitar del día"
                              style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13 }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {modalLote && (
        <ProgramarBMPModal
          fila={modalLote}
          capacidades={capacidades}
          asignaciones={asignaciones}
          onConfirm={(fecha, cantidad) => programar(modalLote, fecha, cantidad)}
          onClose={() => setModalLote(null)}
        />
      )}
    </div>
  );
}
function ProgramarBMPModal({ fila, capacidades, asignaciones, onConfirm, onClose }) {
  const [fecha, setFecha] = useState(today());
  const [cantidad, setCantidad] = useState(fila.pendiente);
  const usadoDia = asignaciones.filter((a) => a.fecha === fecha).reduce((s, a) => s + (a.cantidad || 0), 0);
  const capacidad = capacidades[fecha] ?? DEFAULT_CAPACIDAD_DIA;
  const disponible = capacidad - usadoDia;
  return (
    <Modal title={`Programar Lote ${fila.numLote}`} onClose={onClose} width={420}>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>
        {fila.referencia} · {fila.cliente} · {fila.categoria}
        <br />
        Pendiente por programar: <strong style={{ color: C.ink }}>{fmtNum(fila.pendiente)}</strong> unidades
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.ink, display: "block", marginBottom: 6 }}>Día de Planta</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 11, marginTop: 6, color: disponible < cantidad ? C.red : C.slate }}>
          Capacidad del día: {fmtNum(usadoDia)} / {fmtNum(capacidad)} usadas · {fmtNum(disponible)} disponibles
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.ink, display: "block", marginBottom: 6 }}>Cantidad a Programar</label>
        <input
          type="number"
          value={cantidad}
          max={fila.pendiente}
          min={1}
          onChange={(e) => setCantidad(Number(e.target.value))}
          style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>
      {disponible < cantidad && (
        <div style={{ fontSize: 12, color: C.red, marginBottom: 12, fontWeight: 700 }}>
          ⚠ Esta cantidad supera la capacidad disponible de ese día.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => cantidad > 0 && onConfirm(fecha, Math.min(cantidad, fila.pendiente))}>Confirmar</Btn>
      </div>
    </Modal>
  );
}
function BloqueCronograma({ data }) {
  const { filas, semanas, sinSemana } = data;
  const [semanaSel, setSemanaSel] = useState(null);
  if (!filas.length) return <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>Sin lotes en planta con fecha de entrega confirmada.</div>;
  const totalPorSemana = semanas.map((s) => filas.filter((f) => f.semana === s).reduce((sum, f) => sum + f.unidades, 0));
  const lotesPorSemana = semanas.map((s) => filas.filter((f) => f.semana === s).length);
  const filasSemanaSel = semanaSel ? filas.filter((f) => f.semana === semanaSel).sort((a, b) => (a.fechaEntregaConf || "").localeCompare(b.fechaEntregaConf || "") || a.numLote - b.numLote) : [];
  return (
    <div>
      {sinSemana.length > 0 && (
        <div style={{ padding: "8px 14px", background: C.amberBg, borderRadius: 8, marginBottom: 12, fontSize: 12, color: C.amber, fontWeight: 600 }}>
          {sinSemana.length} lote{sinSemana.length !== 1 ? "s" : ""} en planta sin fecha de entrega confirmada — no aparece{sinSemana.length !== 1 ? "n" : ""} agrupado{sinSemana.length !== 1 ? "s" : ""} por semana.
        </div>
      )}
      {semanaSel && (
        <Modal title={`Lotes que llegan la semana del ${fmtFechaISO(semanaSel)}`} onClose={() => setSemanaSel(null)} width={720}>
          <div style={{ marginBottom: 14, fontSize: 12, color: C.slate }}>
            {filasSemanaSel.length} lote{filasSemanaSel.length !== 1 ? "s" : ""} · {fmtNum(filasSemanaSel.reduce((s, f) => s + f.unidades, 0))} unidades en total
          </div>
          <Tabla
            vacio="Sin lotes en esta semana."
            columnas={[
              { key: "numLote", label: "Num Lote" },
              { key: "referencia", label: "Referencia" },
              { key: "planta", label: "Planta" },
              { key: "categoria", label: "Categoría" },
              { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
              { key: "fechaEntregaConf", label: "Fecha Entrega Conf.", render: (f) => fmtFechaISO(f.fechaEntregaConf) },
            ]}
            filas={filasSemanaSel}
          />
        </Modal>
      )}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto", maxHeight: 560 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.ink, position: "sticky", top: 0 }}>
              {["Lote", "Referencia", "Planta", "Categoría"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
              ))}
              {semanas.map((s) => (
                <th
                  key={s}
                  onClick={() => setSemanaSel(s)}
                  title="Ver lotes de esta semana"
                  style={{ padding: "8px 10px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                >
                  {fmtFechaISO(s)}
                </th>
              ))}
              <th style={{ padding: "8px 10px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>Total Unid.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={`${f.numLote}-${i}`} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{f.numLote}</td>
                <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{f.referencia}</td>
                <td style={{ padding: "6px 10px" }}>{f.planta}</td>
                <td style={{ padding: "6px 10px" }}>{f.categoria}</td>
                {semanas.map((s) => (
                  <td key={s} style={{ padding: "6px 10px", textAlign: "right", fontWeight: f.semana === s ? 700 : 400, color: f.semana === s ? C.ink : C.slate }}>
                    {f.semana === s ? fmtNum(f.unidades) : ""}
                  </td>
                ))}
                <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>{fmtNum(f.unidades)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#DDEBF7" }}>
              <td colSpan={4} style={{ padding: "7px 10px", fontWeight: 800 }}>TOTAL UNIDADES / SEMANA</td>
              {totalPorSemana.map((t, i) => (
                <td key={i} style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(t)}</td>
              ))}
              <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(filas.reduce((s, f) => s + f.unidades, 0))}</td>
            </tr>
            <tr style={{ background: "#DDEBF7" }}>
              <td colSpan={4} style={{ padding: "7px 10px", fontWeight: 800 }}>TOTAL LOTES / SEMANA</td>
              {lotesPorSemana.map((t, i) => (
                <td key={i} style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(t)}</td>
              ))}
              <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(filas.length)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
// ─── VISTA PRINCIPAL: INFORMES ─────────────────────────────────────────────────
const REPORTES = [
  { id: "en_planta", label: "En Planta", icon: "🏭" },
  { id: "semiterminado", label: "Semiterminado", icon: "🧶" },
  { id: "por_cliente", label: "Por Cliente", icon: "🤝" },
  { id: "cliente_agrupado", label: "Cliente Agrupado", icon: "🏢" },
  { id: "cronograma", label: "Cronograma Entrega", icon: "📅" },
  { id: "por_pedido", label: "Por Pedido", icon: "📦" },
  { id: "bmp", label: "BMP", icon: "🧵" },
  { id: "bpt", label: "BPT", icon: "🏬" },
  { id: "programacion_yanko", label: "Programación Yanko", icon: "🎯" },
  { id: "comparar", label: "Comparar Períodos", icon: "📈" },
];
function InformesView({ cargas, onAddCarga, onDeleteCarga, isAdmin, currentUser }) {
  const [showUpload, setShowUpload] = useState(false);
  const [cargaId, setCargaId] = useState(null);
  const [tab, setTab] = useState("en_planta");
  // Ordena por `creadoEn` (timestamp completo con hora) cuando existe, para
  // que dos cargas del mismo día queden en el orden real en que se subieron
  // — antes solo se ordenaba por `fecha` (solo día), así que el orden entre
  // cargas del mismo día no era confiable.
  const cargasOrdenadas = [...cargas].sort(
    (a, b) => (b.creadoEn || b.fecha).localeCompare(a.creadoEn || a.fecha)
  );
  const cargaActiva = cargaId ? cargasOrdenadas.find((c) => c.id === cargaId) || cargasOrdenadas[0] : cargasOrdenadas[0];
  // Usuario con "Cliente asociado" (acceso restringido a un solo cliente):
  // se filtra acá, en el único punto donde se arma `lotes` a partir de la
  // carga — así todos los informes de abajo (por planta, por cliente,
  // cronograma, BMP, BPT, etc.) ya solo ven los lotes de su cliente, sin
  // tener que repetir el filtro en cada uno.
  const clienteAsociado = currentUser?.clienteAsociado || "";
  const lotes = useMemo(() => {
    const todos = cargaActiva?.lotes || [];
    return clienteAsociado ? todos.filter((l) => coincideCliente(l.nombreCliente, clienteAsociado)) : todos;
  }, [cargaActiva, clienteAsociado]);
  const reporteSemiterminado = useMemo(() => generarSeguimientoSemiterminado(lotes), [lotes]);
  const reportePlanta = useMemo(() => generarAgrupadoPlanta(lotes, "nombrePlanta"), [lotes]);
  const reporteCliente = useMemo(() => generarAgrupadoPlanta(lotes, "nombreCliente"), [lotes]);
  const reporteClienteAgrupado = useMemo(() => generarAgrupadoPlanta(lotes, "clienteAgrupado"), [lotes]);
  const reporteCronograma = useMemo(() => generarCronograma(lotes), [lotes]);
  const reportePorPedido = useMemo(() => generarPorPedido(lotes), [lotes]);
  const reporteBMP = useMemo(() => generarBMP(lotes), [lotes]);
  const reporteBPT = useMemo(() => generarBPT(lotes), [lotes]);
  const reporteYanko = useMemo(() => generarProgramacionYanko(lotes), [lotes]);
  const kpis = useMemo(
    () => ({
      total: lotes.length,
      enPlanta: lotes.filter((l) => l.invPlanta > 0).length,
      enBMP: lotes.filter((l) => l.invBMP > 0).length,
      enSemiterminado: lotes.filter((l) => l.invSemiterminado > 0).length,
      vencidos: lotes.filter((l) => l.fechaEntregaPedidoISO && diasEntre(l.fechaEntregaPedidoISO) < 0).length,
    }),
    [lotes]
  );
  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // "Informe de Seguimiento": dashboard con KPIs + resumen por proceso (con
    // % de unidades) + detalle de lotes lado a lado, en vez de la antigua
    // hoja plana "Informe Semiterminado".
    {
      const { filas: segFilas, resumen: segResumen, resumenClientes: segResumenClientes, totalLotes: segTotalLotes, totalUnidades: segTotalUnidades, procesosDistintos: segProcesos } = reporteSemiterminado;
      const resumenRows = [
        ["Proceso Donde Quedó", "Lotes", "Unidades", "% Unidades"],
        ...segResumen.map((r) => [r.proceso, r.lotes, r.unidades, `${Math.round(r.pct * 100)}%`]),
        ["TOTAL", segTotalLotes, segTotalUnidades, "100%"],
      ];
      const detalleRows = [
        ["Proceso Donde Quedó", "Cliente", "Num Lote", "Referencia", "Categoría", "Unidades", "Última Salida"],
        ...segFilas.map((f) => [f.procesoDondeQuedo, f.cliente, f.numLote, f.referencia, f.categoria, f.unidades, f.ultimaSalida]),
      ];
      const maxRows = Math.max(resumenRows.length, detalleRows.length);
      const combined = [];
      for (let i = 0; i < maxRows; i++) {
        const left = resumenRows[i] || ["", "", "", ""];
        const right = detalleRows[i] || ["", "", "", "", "", "", ""];
        combined.push([...left, "", ...right]);
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["DASHBOARD DE SEGUIMIENTO — SEMITERMINADO POR PROCESO"],
          ["Lotes en semiterminado agrupados por el proceso donde quedaron (Hoja1)"],
          [],
          ["Total Lotes", "Total Unidades", "Procesos Distintos"],
          [segTotalLotes, segTotalUnidades, segProcesos],
          [],
          ["RESUMEN POR PROCESO", "", "", "", "", "DETALLE DE LOTES POR PROCESO"],
          ...combined,
        ]),
        "Informe de Seguimiento"
      );
      // Hoja aparte: resumen por cliente, con el desglose de procesos de cada
      // cliente debajo (para responder "por cliente qué procesos tiene").
      const clienteRows = [["SEMITERMINADO — RESUMEN POR CLIENTE"], [], ["Cliente", "Lotes", "Unidades", "% Unidades"]];
      segResumenClientes.forEach((r) => {
        clienteRows.push([r.cliente, r.lotes, r.unidades, `${Math.round(r.pct * 100)}%`]);
        const deCliente = segFilas.filter((f) => f.cliente === r.cliente);
        const porProceso = new Map();
        deCliente.forEach((f) => {
          if (!porProceso.has(f.procesoDondeQuedo)) porProceso.set(f.procesoDondeQuedo, { lotes: 0, unidades: 0 });
          const g = porProceso.get(f.procesoDondeQuedo);
          g.lotes += 1;
          g.unidades += f.unidades;
        });
        [...porProceso.entries()]
          .sort((a, b) => b[1].unidades - a[1].unidades)
          .forEach(([proceso, g]) => clienteRows.push(["", `  ${proceso}`, g.lotes, g.unidades]));
        clienteRows.push([]);
      });
      clienteRows.push(["TOTAL", segTotalLotes, segTotalUnidades, "100%"]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clienteRows), "Semiterminado Por Cliente");
    }
    function hojaAgrupada(nombreHoja, primeraCol, data) {
      const filas = [
        [primeraCol, "Categoría", "Num Lote", "Referencia", "Cant. en Planta"],
        ...data.filas.map((f) => [f.grupo, f.categoria, f.numLote, f.referencia, f.cantidad]),
        [],
        ["RESUMEN POR " + primeraCol.toUpperCase()],
        [primeraCol, "Lotes", "Unidades"],
        ...data.resumen.map((r) => [r.grupo, r.lotes, r.unidades]),
        ["TOTAL EN PLANTA", data.totalLotes, data.totalUnidades],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombreHoja);
    }
    hojaAgrupada("Informe En Planta", "Nombre Planta", reportePlanta);
    hojaAgrupada("Informe Por Cliente", "Nombre Cliente", reporteCliente);
    hojaAgrupada("Informe Cliente Agrupado", "Cliente Agrupado", reporteClienteAgrupado);
    const semanas = reporteCronograma.semanas;
    const filasCron = reporteCronograma.filas.map((f) => {
      const row = [f.numLote, f.referencia, f.planta, f.categoria];
      semanas.forEach((s) => row.push(f.semana === s ? f.unidades : ""));
      row.push(f.unidades);
      return row;
    });
    const totalPorSemana = semanas.map((s) => reporteCronograma.filas.filter((f) => f.semana === s).reduce((sum, f) => sum + f.unidades, 0));
    const lotesPorSemana = semanas.map((s) => reporteCronograma.filas.filter((f) => f.semana === s).length);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Lote", "Referencia", "Planta", "Categoría", ...semanas.map(fmtFechaISO), "Total Unid."],
        ...filasCron,
        ["TOTAL UNIDADES / SEMANA", "", "", "", ...totalPorSemana, reporteCronograma.filas.reduce((s, f) => s + f.unidades, 0)],
        ["TOTAL LOTES / SEMANA", "", "", "", ...lotesPorSemana, reporteCronograma.filas.length],
      ]),
      "Cronograma Entrega"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Num Pedido", "Num Lote", "Referencia", "Categoría", "Nombre Planta", "Ubicación Actual", "Unidades", "Fecha Entrega Conf", "Fecha Entrega Pedido", "Días Restantes", "Estado"],
        ...reportePorPedido.map((r) => [
          r.numPedido, r.numLote, r.referencia, r.categoria, r.nombrePlanta, r.ubicacionActual, r.unidades,
          fmtFechaISO(r.fechaEntregaConf), fmtFechaISO(r.fechaEntregaPedido), r.diasRestantes, r.estado,
        ]),
      ]),
      "Informe Por Pedido"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Categoría", "Cliente", "Referencia", "Num Lote", "Cantidad BMP", "Fecha Corte", "Días para Corte", "Fecha Entrega Pedido", "Días Rest. Pedido"],
        ...reporteBMP.filas.map((r) => [
          r.categoria, r.cliente, r.referencia, r.numLote, r.cantidadBMP,
          fmtFechaISO(r.fechaCorte), r.diasParaCorte, fmtFechaISO(r.fechaEntregaPedido), r.diasRestantesPedido,
        ]),
      ]),
      "Informe BMP"
    );
    const totalKamila = reporteYanko.comparacion.reduce(
      (acc, r) => ({
        plantaUnid: acc.plantaUnid + r.plantaUnid,
        plantaLotes: acc.plantaLotes + r.plantaLotes,
        bmpUnid: acc.bmpUnid + r.bmpUnid,
        bmpLotes: acc.bmpLotes + r.bmpLotes,
        total: acc.total + r.total,
      }),
      { plantaUnid: 0, plantaLotes: 0, bmpUnid: 0, bmpLotes: 0, total: 0 }
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Categoría", "Num Pedido", "Num Lote", "Referencia", "Cantidad", "Fecha Entrega Pedido", "Días Restantes"],
        ...reporteYanko.filas.map((r) => [r.categoria, r.numPedido, r.numLote, r.referencia, r.cantidad, fmtFechaISO(r.fechaEntregaPedido), r.diasRestantes]),
        [],
        [],
        ["COMPARACIÓN KAMILA — PLANTA vs BMP"],
        ["Categoría", "Planta Unid", "Lotes Planta", "BMP Unid", "Lotes BMP", "Total Unid"],
        ...reporteYanko.comparacion.map((r) => [r.categoria, r.plantaUnid, r.plantaLotes, r.bmpUnid, r.bmpLotes, r.total]),
        ["TOTAL KAMILA", totalKamila.plantaUnid, totalKamila.plantaLotes, totalKamila.bmpUnid, totalKamila.bmpLotes, totalKamila.total],
      ]),
      "Programación Planta Yanko"
    );
    XLSX.writeFile(wb, `Informes_Planta_${cargaActiva.fecha}.xlsx`);
  }
  return (
    <div>
      {showUpload && (
        <SubirHoja1Modal
          onConfirm={(lotesNuevos) => {
            const nuevaCarga = { id: uid(), fecha: today(), lotes: lotesNuevos, creadoEn: new Date().toISOString(), subidoPor: currentUser?.name || "—" };
            onAddCarga(nuevaCarga);
            setCargaId(nuevaCarga.id);
          }}
          onClose={() => setShowUpload(false)}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Informes</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            {cargaActiva
              ? `Carga del ${cargaActiva.fecha}${cargaActiva.creadoEn ? ` · Actualizado ${fmtFechaHora(cargaActiva.creadoEn)}` : ""}${cargaActiva.subidoPor ? ` · Subido por ${cargaActiva.subidoPor}` : ""}`
              : "Sin cargas de Hoja1 todavía"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {cargasOrdenadas.length > 1 && (
            <select
              value={cargaActiva?.id || ""}
              onChange={(e) => setCargaId(e.target.value)}
              style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
            >
              {cargasOrdenadas.map((c) => (
                <option key={c.id} value={c.id}>
                  Carga {c.fecha}
                  {c.creadoEn ? ` · ${fmtFechaHora(c.creadoEn).split(" ")[1]}` : ""}
                  {c.subidoPor ? ` · ${c.subidoPor}` : ""}
                </option>
              ))}
            </select>
          )}
          {cargaActiva && (
            <Btn variant="secondary" onClick={exportarExcel}>📤 Exportar Excel</Btn>
          )}
          <Btn variant="danger" onClick={() => setShowUpload(true)}>📥 Subir Hoja1</Btn>
          {isAdmin && cargaActiva && (
            <button
              onClick={() => onDeleteCarga(cargaActiva.id)}
              title="Eliminar esta carga"
              style={{ background: C.redBg, border: "none", borderRadius: 8, padding: "9px 12px", color: C.red, fontWeight: 700, cursor: "pointer" }}
            >
              🗑
            </button>
          )}
        </div>
      </div>
      {!cargaActiva ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          Aún no has subido ninguna Hoja1. Usa "Subir Hoja1" para generar el primer set de informes.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
            <KPI icon="📦" label="Total lotes" value={fmtNum(kpis.total)} color={C.ink} bg={C.canvas} />
            <KPI icon="🏭" label="En Planta" value={fmtNum(kpis.enPlanta)} color={C.green} bg={C.greenBg} />
            <KPI icon="🧵" label="En BMP" value={fmtNum(kpis.enBMP)} color={C.amber} bg={C.amberBg} />
            <KPI icon="🧶" label="Semiterminado" value={fmtNum(kpis.enSemiterminado)} color={C.violet} bg={C.violetBg} />
            <KPI icon="⚠" label="Pedidos vencidos" value={fmtNum(kpis.vencidos)} color={C.red} bg={C.redBg} />
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
            {REPORTES.map((r) => (
              <button
                key={r.id}
                onClick={() => setTab(r.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${tab === r.id ? C.ink : C.border}`,
                  background: tab === r.id ? C.ink : C.white,
                  color: tab === r.id ? C.white : C.ink,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {r.icon} {r.label}
              </button>
            ))}
          </div>
          {tab === "semiterminado" && <BloqueSeguimientoSemiterminado data={reporteSemiterminado} />}
          {tab === "en_planta" && <BloqueAgrupado titulo="Planta" primeraColLabel="Nombre Planta" data={reportePlanta} />}
          {tab === "por_cliente" && <BloqueAgrupado titulo="Cliente" primeraColLabel="Nombre Cliente" data={reporteCliente} />}
          {tab === "cliente_agrupado" && <BloqueAgrupado titulo="Cliente Agrupado" primeraColLabel="Cliente Agrupado" data={reporteClienteAgrupado} />}
          {tab === "cronograma" && <BloqueCronograma data={reporteCronograma} />}
          {tab === "por_pedido" && (
            <Tabla
              vacio="Sin pedidos."
              columnas={[
                { key: "numPedido", label: "Num Pedido" },
                { key: "numLote", label: "Num Lote" },
                { key: "referencia", label: "Referencia" },
                { key: "categoria", label: "Categoría" },
                { key: "nombrePlanta", label: "Nombre Planta", render: (f) => f.nombrePlanta || "—" },
                { key: "ubicacionActual", label: "Ubicación Actual" },
                { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
                { key: "fechaEntregaConf", label: "Fecha Entrega Conf", render: (f) => fmtFechaISO(f.fechaEntregaConf) || "—" },
                { key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
                { key: "diasRestantes", label: "Días Restantes", align: "right", render: (f) => (f.diasRestantes ?? "—"), color: (f) => (f.diasRestantes < 0 ? C.red : C.ink) },
                { key: "estado", label: "Estado", render: (f) => <EstadoBadge estado={f.estado} /> },
              ]}
              filas={reportePorPedido}
            />
          )}
          {tab === "bmp" && <BloqueBMP data={reporteBMP} currentUser={currentUser} />}
          {tab === "bpt" && (
            <Tabla
              vacio="Sin lotes en BPT."
              columnas={[
                { key: "categoria", label: "Categoría" },
                { key: "cliente", label: "Cliente" },
                { key: "referencia", label: "Referencia" },
                { key: "numLote", label: "Num Lote" },
                { key: "cantidadBPT", label: "Cantidad BPT", align: "right", render: (f) => fmtNum(f.cantidadBPT) },
                { key: "fechaCorte", label: "Fecha Corte", render: (f) => fmtFechaISO(f.fechaCorte) || "—" },
                { key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
                { key: "diasRestantesPedido", label: "Días Rest. Pedido", align: "right", render: (f) => (f.diasRestantesPedido ?? "—"), color: (f) => (f.diasRestantesPedido < 0 ? C.red : C.ink) },
              ]}
              filas={reporteBPT}
            />
          )}
          {tab === "programacion_yanko" && (
            <div>
              <Tabla
                vacio="Sin lotes en Industrias Yanko Módulo Centro."
                columnas={[
                  { key: "categoria", label: "Categoría" },
                  { key: "numPedido", label: "Num Pedido" },
                  { key: "numLote", label: "Num Lote" },
                  { key: "referencia", label: "Referencia" },
                  { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
                  { key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
                  { key: "diasRestantes", label: "Días Restantes", align: "right", render: (f) => (f.diasRestantes ?? "—"), color: (f) => (f.diasRestantes < 0 ? C.red : C.ink) },
                ]}
                filas={reporteYanko.filas}
              />
              {reporteYanko.comparacion.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>COMPARACIÓN KAMILA — PLANTA vs BMP</div>
                  <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: C.ink }}>
                          {["Categoría", "Planta Unid", "Lotes Planta", "BMP Unid", "Lotes BMP", "Total Unid"].map((h) => (
                            <th key={h} style={{ padding: "9px 12px", color: C.seam, textAlign: h === "Categoría" ? "left" : "right", fontWeight: 700, fontSize: 10 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reporteYanko.comparacion.map((r, i) => (
                          <tr key={r.categoria} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: "7px 12px" }}>{r.categoria}</td>
                            <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.plantaUnid)}</td>
                            <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.plantaLotes)}</td>
                            <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.bmpUnid)}</td>
                            <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.bmpLotes)}</td>
                            <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700 }}>{fmtNum(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#FFF2CC" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 800 }}>TOTAL KAMILA</td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.plantaUnid, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.plantaLotes, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.bmpUnid, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.bmpLotes, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.total, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "comparar" && <BloqueCompararPeriodos cargasOrdenadas={cargasOrdenadas} clienteAsociado={clienteAsociado} />}
        </>
      )}
    </div>
  );
}
// ─── HOME PLANEACIÓN ────────────────────────────────────────────────────────────
function HomePlaneacion({ onGoInformes }) {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>📋 Planeación</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: C.slate }}>Informes de producción de Industrias Yanko</p>
      </div>
      <div
        onClick={onGoInformes}
        style={{ background: C.white, borderRadius: 14, padding: 22, border: `1.5px solid ${C.border}`, cursor: "pointer", maxWidth: 320, transition: "all 0.2s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = C.blue; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = C.border; }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 12, background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 14 }}>📊</div>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 6 }}>Informes</div>
        <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.5, marginBottom: 12 }}>
          Sube la Hoja1 y genera Semiterminado, En Planta, Por Cliente, Cronograma de Entrega, Por Pedido, BMP y Programación Yanko.
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>Entrar →</div>
      </div>
    </div>
  );
}
// ─── ROOT MÓDULO PLANEACIÓN ─────────────────────────────────────────────────────
export default function ModuloPlaneacion({ currentUser, onVolver, onLogout }) {
  const [subView, setSubView] = useState("informes");
  const [cargas, setCargas] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planeacion_cargas"), (snap) => {
      setCargas(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    return () => unsub();
  }, []);
  async function addCarga(carga) {
    setCargas((cs) => [...cs, carga]);
    await fsSave("planeacion_cargas", carga.id, carga);
  }
  async function deleteCarga(id) {
    setCargas((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("planeacion_cargas", id);
  }
  const isAdmin = currentUser?.isAdmin;
  const NAV = [
    { id: "home", icon: "◉", label: "Inicio" },
    { id: "informes", icon: "📊", label: "Informes" },
  ];
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ color: C.slate }}>Cargando Planeación...</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ width: 220, background: C.ink, padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>📋 Planeación</div>
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>Industrias Yanko</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#2A2A45", borderRadius: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${C.seam},#9E8870)`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.ink, flexShrink: 0,
            }}
          >
            {(currentUser?.name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name}</div>
            <div style={{ fontSize: 10, color: C.seam }}>{currentUser?.role}</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((item) => {
            const active = subView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSubView(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer",
                  background: active ? "#C8B8A2" : "transparent", color: active ? C.ink : "#8888AA", fontWeight: active ? 800 : 500, fontSize: 13, textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
          {onVolver && (
            <button
              onClick={onVolver}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "rgba(200,184,162,0.5)", fontWeight: 500, fontSize: 12, textAlign: "left", marginTop: 8 }}
            >
              ← Volver al Inicio
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "rgba(232,93,74,0.85)", fontWeight: 700, fontSize: 12, textAlign: "left", marginTop: onVolver ? 2 : 8 }}
            >
              ⏏ Cerrar sesión
            </button>
          )}
        </nav>
      </div>
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {subView === "home" && <HomePlaneacion onGoInformes={() => setSubView("informes")} />}
          {subView === "informes" && <InformesView cargas={cargas} onAddCarga={addCarga} onDeleteCarga={deleteCarga} isAdmin={isAdmin} currentUser={currentUser} />}
        </div>
      </div>
    </div>
  );
}
