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
import { getFunctions, httpsCallable } from "firebase/functions";
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
const functionsClient = getFunctions(fbApp);
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
  // Botón para agrandar la ventana a casi toda la pantalla (95vw/95vh) — se
  // aplica a TODAS las ventanas de Planeación porque todas pasan por este
  // mismo componente. Empieza en su tamaño normal; el usuario decide si la
  // quiere más grande.
  const [expandido, setExpandido] = useState(false);
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.white,
          borderRadius: 14,
          width: "100%",
          maxWidth: expandido ? "95vw" : width,
          maxHeight: expandido ? "95vh" : "90vh",
          height: expandido ? "95vh" : "auto",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(26,26,46,0.18)",
          transition: "max-width 0.15s, height 0.15s",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>{title}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => setExpandido((v) => !v)}
              title={expandido ? "Reducir ventana" : "Agrandar ventana"}
              style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.slate, lineHeight: 1 }}
            >
              {expandido ? "⤡" : "⤢"}
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.slate, lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ padding: 24, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
function KPI({ icon, label, value, color, bg, sub, onClick }) {
  // `onClick` es opcional — si se pasa, la tarjeta se vuelve clicable (cursor,
  // hover, "Ver detalle →") sin afectar los usos existentes que no lo pasan.
  return (
    <div
      onClick={onClick}
      style={{
        background: bg || C.canvas, borderRadius: 12, padding: "16px 18px", border: `1px solid ${color}22`,
        cursor: onClick ? "pointer" : "default", transition: "transform 0.12s",
      }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.transform = "translateY(-2px)"; } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.transform = "none"; } : undefined}
    >
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>{sub}</div>}
      {onClick && <div style={{ fontSize: 10, color: C.blue, fontWeight: 700, marginTop: 6 }}>Ver detalle →</div>}
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
function UbicacionBadge({ ubicacion }) {
  const map = {
    Corte: { bg: C.blueBg, color: C.blue },
    BMP: { bg: C.amberBg, color: C.amber },
    Planta: { bg: C.greenBg, color: C.green },
    Semiterminado: { bg: C.violetBg, color: C.violet },
    BPT: { bg: C.blueBg, color: C.blue },
  };
  const s = map[ubicacion] || { bg: C.canvas, color: C.slate };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {ubicacion}
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
// Parsea un texto ISO (YYYY-MM-DD) a Date en hora LOCAL — `new Date(iso)`
// lo interpreta en UTC y puede correrse un día según la zona horaria del
// navegador; esto evita ese corrimiento. Se usa al recalcular
// semanaEntregaISO cuando se refresca el inventario desde Busint.
function isoToLocalDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
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
    AF = colIdx("AF"), AG = colIdx("AG"), AJ = colIdx("AJ");
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
    const fechaEntBPT = filaInv[AF];
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
      fechaEntBPTISO: dateToISO(fechaEntBPT),
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
// Toma los lotes ya normalizados que devuelve getCargaPlaneacionDesdeBusintGen
// (campos crudos + `procesos` con fechas en texto ISO) y les aplica EXACTAMENTE
// el mismo cálculo de campos derivados que agruparLotes() aplica a una Hoja1
// subida a mano (clienteAgrupado, ubicacionActual, unidadesUbicacion,
// semanaEntregaISO, procesoDondeQuedo, ultimaSalidaTexto) — así el resto de
// Planeación (Mi Día, Informes, etc.) no necesita saber si el lote vino de un
// Excel o de Busint, ve la misma forma de objeto en los dos casos.
function construirLotesDesdeBusintGen(filasBusint) {
  return (filasBusint || []).map((f) => {
    const procesos = (f.procesos || []).map((p) => ({
      nombre: p.nombre || "",
      salida: isoToLocalDate(p.fechaSalida),
      entrega: isoToLocalDate(p.fechaEntrada),
    }));
    const { proceso: procesoDondeQuedo, ultimaSalida, sinSalida } = calcularProcesoDondeQuedo(procesos, f.invSemiterminado);
    let ultimaSalidaTexto = "";
    if (f.invSemiterminado > 0) ultimaSalidaTexto = sinSalida ? "Sin salida" : fmtFecha(ultimaSalida);
    const clienteAgrupado =
      f.nombreCliente === "KAMILA GROUP SAS-KAMILA COLOMBIA" || f.nombreCliente === "KAMILA VENEZUELA-KAMILA VENEZUELA"
        ? "KAMILA (COLOMBIA + VENEZUELA)"
        : f.nombreCliente;
    let ubicacionActual = "Sin inventario", unidadesUbicacion = 0;
    if (f.invBPT > 0) { ubicacionActual = "BPT"; unidadesUbicacion = f.invBPT; }
    else if (f.invSemiterminado > 0) { ubicacionActual = "Semiterminado"; unidadesUbicacion = f.invSemiterminado; }
    else if (f.invPlanta > 0) { ubicacionActual = "Planta"; unidadesUbicacion = f.invPlanta; }
    else if (f.invBMP > 0) { ubicacionActual = "BMP"; unidadesUbicacion = f.invBMP; }
    else if (f.invCorte > 0) { ubicacionActual = "Corte"; unidadesUbicacion = f.invCorte; }
    const semanaEntregaISO = f.invPlanta > 0 ? dateToISO(lunesDeSemana(isoToLocalDate(f.fechaEntregaConfISO))) : null;
    return {
      numLote: f.numLote,
      numPedido: f.numPedido,
      referencia: f.referencia,
      categoria: f.categoria,
      nombreCliente: f.nombreCliente,
      clienteAgrupado,
      nombrePlanta: f.nombrePlanta,
      fechaCorteISO: f.fechaCorteISO,
      cantCortada: f.cantCortada,
      invCorte: f.invCorte,
      invBMP: f.invBMP,
      invPlanta: f.invPlanta,
      invBPT: f.invBPT,
      invSemiterminado: f.invSemiterminado,
      fechaEntregaConfISO: f.fechaEntregaConfISO,
      fechaEntBPTISO: f.fechaEntBPTISO,
      fechaEntregaPedidoISO: f.fechaEntregaPedidoISO,
      procesoDondeQuedo,
      ultimaSalidaTexto,
      semanaEntregaISO,
      ubicacionActual,
      unidadesUbicacion,
    };
  });
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
      ultimaSalida: l.ultimaSalidaTexto,
      nombreCliente: l.nombreCliente || "(Sin cliente)",
    }))
    .sort((a, b) => a.procesoDondeQuedo.localeCompare(b.procesoDondeQuedo) || a.numLote - b.numLote);
  const totalLotes = filas.length;
  const totalUnidades = filas.reduce((s, f) => s + f.unidades, 0);
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
  // Resumen por Cliente + Proceso Donde Quedó: mismas métricas que el
  // resumen por proceso (lotes/unidades/% de unidades), pero desglosado
  // también por cliente — para ver, por ejemplo, cuántas unidades de KAMILA
  // están detenidas en TERMINACION vs. las de otro cliente.
  const gruposCliente = new Map();
  filas.forEach((f) => {
    const clave = `${f.nombreCliente}||${f.procesoDondeQuedo}`;
    if (!gruposCliente.has(clave)) {
      gruposCliente.set(clave, { cliente: f.nombreCliente, proceso: f.procesoDondeQuedo, lotes: 0, unidades: 0 });
    }
    const g = gruposCliente.get(clave);
    g.lotes += 1;
    g.unidades += f.unidades;
  });
  const resumenPorCliente = [...gruposCliente.values()]
    .map((g) => ({ ...g, pct: totalUnidades > 0 ? g.unidades / totalUnidades : 0 }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente) || b.unidades - a.unidades);
  return { filas, resumen, resumenPorCliente, totalLotes, totalUnidades, procesosDistintos: resumen.length };
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
      diasParaEntrega: diasEntre(l.fechaEntregaConfISO),
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
  return lotes
    .filter((l) => l.invBMP > 0)
    .map((l) => ({
      categoria: l.categoria,
      cliente: l.nombreCliente,
      referencia: l.referencia,
      numLote: l.numLote,
      numPedido: l.numPedido,
      cantidadBMP: l.invBMP,
      fechaCorte: l.fechaCorteISO,
      diasParaCorte: diasEntre(l.fechaCorteISO),
      fechaEntregaPedido: l.fechaEntregaPedidoISO,
      diasRestantesPedido: diasEntre(l.fechaEntregaPedidoISO),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.cliente.localeCompare(b.cliente));
}
// Informe "BPT": lotes que ya están en Bodega de Producto Terminado
// (invBPT > 0), agrupados por cliente, con los días transcurridos desde que
// entraron a BPT (columna "Fecha Ent BPT" de Hoja1).
function generarBPT(lotes) {
  const filas = lotes
    .filter((l) => l.invBPT > 0)
    .map((l) => ({
      cliente: l.nombreCliente || "(Sin cliente)",
      numLote: l.numLote,
      referencia: l.referencia,
      categoria: l.categoria,
      cantidad: l.invBPT,
      fechaEntBPT: l.fechaEntBPTISO,
      diasEnBPT: l.fechaEntBPTISO ? -diasEntre(l.fechaEntBPTISO) : null,
    }))
    .sort((a, b) => (b.diasEnBPT ?? -Infinity) - (a.diasEnBPT ?? -Infinity) || a.cliente.localeCompare(b.cliente));
  const clientesUnicos = [...new Set(filas.map((f) => f.cliente))].sort((a, b) => a.localeCompare(b));
  const resumen = clientesUnicos.map((c) => {
    const deCliente = filas.filter((f) => f.cliente === c);
    return { cliente: c, lotes: deCliente.length, unidades: deCliente.reduce((s, f) => s + f.cantidad, 0) };
  });
  const totalLotes = filas.length;
  const totalUnidades = filas.reduce((s, f) => s + f.cantidad, 0);
  return { filas, resumen, totalLotes, totalUnidades };
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
  const comparacion = categorias.map((cat) => {
    const planta = kamilaLotes.filter((l) => l.categoria === cat && l.invPlanta > 0);
    const bmp = kamilaLotes.filter((l) => l.categoria === cat && l.invBMP > 0);
    const plantaUnid = planta.reduce((s, l) => s + l.invPlanta, 0);
    const bmpUnid = bmp.reduce((s, l) => s + l.invBMP, 0);
    return { categoria: cat, plantaUnid, plantaLotes: planta.length, bmpUnid, bmpLotes: bmp.length, total: plantaUnid + bmpUnid };
  });
  return { filas, comparacion };
}
// "Mi Día" — Planeadora. Motor de prioridad compartido: cada tabla se ordena
// por días restantes hasta la Fecha Entrega Pedido (fechaEntregaPedidoISO),
// no por importancia arbitraria del área — así lo pidió el usuario ("es que
// al final nos llegue a cumplir los pedidos"). Los mismos criterios se
// reutilizarán para los "Mi Día" de Anny Beltrán (Terminación) y Sarai
// Méndez (Termofijación) más adelante.
function generarMiDiaPlaneadora(lotes, reporteBMP, programacionBMP) {
  // Plantas: el vencimiento se mide contra la Fecha Entrega CONF (la fecha
  // real comprometida, fechaEntregaConfISO) y no contra la Fecha Entrega
  // Pedido — así lo pidió el usuario, porque la de Pedido es orientativa y
  // la que de verdad se debe cumplir es la Conf.
  const plantasIncumpliendo = lotes
    .filter((l) => l.invPlanta > 0)
    .map((l) => {
      const dias = diasEntre(l.fechaEntregaConfISO);
      return {
        numLote: l.numLote,
        numPedido: l.numPedido,
        referencia: l.referencia,
        categoria: l.categoria,
        cliente: l.nombreCliente,
        planta: l.nombrePlanta || "(Sin planta)",
        cantidad: l.invPlanta,
        fechaEntregaConf: l.fechaEntregaConfISO,
        diasRestantes: dias,
        estado: estadoDe(dias),
      };
    })
    .sort((a, b) => (a.diasRestantes ?? Infinity) - (b.diasRestantes ?? Infinity));
  // BMP pendiente de programar hacia planta: lotes de reporteBMP cuyo
  // numLote todavía no tiene una fila en planeacion_programacion_bmp.
  const numLotesProgramados = new Set(programacionBMP.map((p) => p.numLote));
  const bmpPendiente = reporteBMP
    .filter((f) => !numLotesProgramados.has(f.numLote))
    .map((f) => ({ ...f, estado: estadoDe(f.diasRestantesPedido) }))
    .sort((a, b) => (a.diasRestantesPedido ?? Infinity) - (b.diasRestantesPedido ?? Infinity));
  return { plantasIncumpliendo, bmpPendiente };
}
// Lotes que las plantas deben ENTREGAR hoy, según la Fecha Entrega Conf. que
// ya viene en el propio archivo de Hoja1 (no la programación manual de BMP →
// Planta) — un lote en planta (invPlanta > 0) cuya fechaEntregaConfISO es
// hoy.
function generarLotesRecibirHoy(lotes) {
  const hoy = today();
  return lotes
    .filter((l) => l.invPlanta > 0 && l.fechaEntregaConfISO === hoy)
    .map((l) => ({
      numLote: l.numLote,
      numPedido: l.numPedido,
      referencia: l.referencia,
      categoria: l.categoria,
      cliente: l.nombreCliente,
      planta: l.nombrePlanta || "(Sin planta)",
      cantidad: l.invPlanta,
      fechaEntregaConf: l.fechaEntregaConfISO,
    }))
    .sort((a, b) => (a.planta || "").localeCompare(b.planta || ""));
}
// Programación de mesones de HOY, leída de Corte (corte_programacion) sin
// escribir nada — Planeación solo la muestra. Resuelve nombres de
// planta/mesón desde corte_config/main (ahí se guardan por id).
function generarMesonesHoy(programacionCorte, corteConfig, bloqueosMeson) {
  const hoy = today();
  // OJO: en Corte, `corte_programacion.planta` guarda el NOMBRE de la
  // planta (no un id — ver el selector "Planta" en modulo-corte.jsx, que
  // usa p.nombre como value), así que el cruce tiene que ser por nombre. El
  // mesón sí es un id real (scoped dentro de cada planta), por eso ese
  // cruce sigue siendo por `m.id === p.meson`. Lo mismo aplica a
  // `corte_bloqueos_meson.planta` (también guarda nombre, ver
  // guardarBloqueoMeson en modulo-corte.jsx).
  const plantasMap = new Map((corteConfig?.plantas || []).map((p) => [p.nombre, p]));
  const cortes = (programacionCorte || [])
    .filter((p) => p.fechaProgramada === hoy)
    .map((p) => {
      const planta = plantasMap.get(p.planta);
      const meson = planta?.mesones?.find((m) => m.id === p.meson);
      return {
        id: p.id,
        esBloqueo: false,
        referencia: p.ref,
        numPedido: p.numero,
        cliente: p.cliente,
        cantidad: p.cantidadProgramada,
        planta: planta?.nombre || (p.planta ? "(sin nombre)" : "Sin asignar"),
        meson: meson?.nombre || (p.meson ? "(sin nombre)" : "Sin asignar"),
        cortador: p.cortador || "Sin asignar",
        horaInicioEstimada: p.horaInicioEstimada || "",
        horaFinEstimada: p.horaFinEstimada || "",
        estado: p.aprobado ? "Aprobado" : p.etapa === "programacion_hecha" ? "Programado" : "Por programar mesón",
      };
    });
  // Bloqueos de espacio (recuperación de telas, etc.) reservados desde
  // Corte → Disponibilidad de Mesones — se muestran aquí igual que un corte
  // más para que la Planeadora vea el mesón ocupado, pero no cuentan como
  // corte programado (no suman a "cortes programados" en ningún KPI de acá,
  // solo aparecen en este tablero/tabla de solo lectura).
  const bloqueos = (bloqueosMeson || [])
    .filter((b) => b.fecha === hoy)
    .map((b) => {
      const planta = plantasMap.get(b.planta);
      const meson = planta?.mesones?.find((m) => m.id === b.meson);
      return {
        id: `bloqueo-${b.id}`,
        esBloqueo: true,
        referencia: b.motivo || "Bloqueo de espacio",
        numPedido: "—",
        cliente: "—",
        cantidad: null,
        planta: planta?.nombre || (b.planta ? "(sin nombre)" : "Sin asignar"),
        meson: meson?.nombre || (b.meson ? "(sin nombre)" : "Sin asignar"),
        cortador: "—",
        horaInicioEstimada: b.horaInicioEstimada || "",
        horaFinEstimada: b.horaFinEstimada || "",
        estado: "Bloqueo",
      };
    });
  return [...cortes, ...bloqueos].sort(
    (a, b) => (a.planta || "").localeCompare(b.planta || "") || (a.referencia || "").localeCompare(b.referencia || "")
  );
}
// ─── TABLERO VISUAL DE MESONES (Mi Día) ────────────────────────────────────────
// Ventana del día que se dibuja en el tablero — de 6:00 a.m. a 8:00 p.m., el
// horario habitual de planta. Lo que quede fuera de esa franja igual se
// dibuja pegado al borde (clamp), no se pierde.
const HORA_INICIO_TABLERO = 6;
const HORA_FIN_TABLERO = 20;
function pctHora(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const partes = hhmm.split(":");
  if (partes.length !== 2) return null;
  const h = Number(partes[0]);
  const m = Number(partes[1]);
  if (isNaN(h) || isNaN(m)) return null;
  const minutos = h * 60 + m;
  const inicio = HORA_INICIO_TABLERO * 60;
  const fin = HORA_FIN_TABLERO * 60;
  return Math.min(100, Math.max(0, ((minutos - inicio) / (fin - inicio)) * 100));
}
// Una fila por planta+mesón, con un bloque de color por cada corte
// programado hoy, ubicado según horaInicioEstimada/horaFinEstimada (mismos
// datos que ya guarda Corte al hacer la Programación de Mesones). Lo que
// todavía no tiene horario puesto se lista aparte, no se dibuja a ciegas.
function TableroMesonesDia({ items }) {
  // Clic sobre un bloque del tablero abre el detalle de qué se va a cortar
  // ahí, en vez de tener que buscarlo en la tabla de más abajo.
  const [seleccionado, setSeleccionado] = useState(null);
  const conHorario = items.filter((it) => pctHora(it.horaInicioEstimada) !== null && pctHora(it.horaFinEstimada) !== null);
  const sinHorario = items.filter((it) => pctHora(it.horaInicioEstimada) === null || pctHora(it.horaFinEstimada) === null);
  const grupos = useMemo(() => {
    const map = new Map();
    items.forEach((it) => {
      if (pctHora(it.horaInicioEstimada) === null || pctHora(it.horaFinEstimada) === null) return;
      const clave = `${it.planta} · ${it.meson}`;
      if (!map.has(clave)) map.set(clave, []);
      map.get(clave).push(it);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  const horasRegla = [6, 8, 10, 12, 14, 16, 18, 20];
  if (!items.length) {
    return <div style={{ textAlign: "center", padding: 24, color: C.slate, fontSize: 13 }}>No hay cortes programados para hoy.</div>;
  }
  return (
    <div style={{ marginBottom: 20 }}>
      {!!grupos.length && (
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 16px 10px" }}>
          <div style={{ position: "relative", height: 16, marginLeft: 178, marginBottom: 8 }}>
            {horasRegla.map((h) => (
              <span
                key={h}
                style={{ position: "absolute", left: `${((h - HORA_INICIO_TABLERO) / (HORA_FIN_TABLERO - HORA_INICIO_TABLERO)) * 100}%`, fontSize: 10, color: C.slate, fontWeight: 700 }}
              >
                {h}:00
              </span>
            ))}
          </div>
          {grupos.map(([clave, filas]) => (
            <div key={clave} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div
                title={clave}
                style={{ width: 168, flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {clave}
              </div>
              <div style={{ position: "relative", flex: 1, height: 32, background: C.canvas, borderRadius: 8 }}>
                {filas.map((it) => {
                  const left = pctHora(it.horaInicioEstimada);
                  const right = pctHora(it.horaFinEstimada);
                  const width = Math.max(right - left, 3);
                  const color = it.esBloqueo ? C.slate : it.estado === "Aprobado" ? C.green : it.estado === "Programado" ? C.violet : C.amber;
                  return (
                    <div
                      key={it.id}
                      onClick={() => setSeleccionado(it)}
                      title={it.esBloqueo ? `🔒 Bloqueo: ${it.referencia} · ${it.horaInicioEstimada}–${it.horaFinEstimada} (clic para ver detalle)` : `${it.cortador} · ${it.referencia} · ${it.horaInicioEstimada}–${it.horaFinEstimada} (clic para ver detalle)`}
                      style={{
                        position: "absolute", left: `${left}%`, width: `${width}%`, top: 3, bottom: 3,
                        background: color, color: C.white, borderRadius: 6, fontSize: 10, fontWeight: 700,
                        display: "flex", alignItems: "center", padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >
                      {it.esBloqueo ? `🔒 ${it.referencia}` : `${it.cortador} · ${it.referencia}`}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {!!sinHorario.length && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.slate }}>
          <strong style={{ color: C.ink }}>Sin horario asignado todavía:</strong>{" "}
          {sinHorario.map((it) => `${it.referencia} (${it.planta} · ${it.meson})`).join(", ")}
        </div>
      )}
      {seleccionado && (
        <Modal title={seleccionado.esBloqueo ? "🔒 Bloqueo de espacio" : "✂️ Qué se va a cortar"} onClose={() => setSeleccionado(null)} width={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            {seleccionado.esBloqueo ? (
              <>
                <DetalleFila label="Motivo" valor={seleccionado.referencia} />
              </>
            ) : (
              <>
                <DetalleFila label="Referencia" valor={seleccionado.referencia} />
                <DetalleFila label="Pedido" valor={seleccionado.numPedido} />
                <DetalleFila label="Cliente" valor={seleccionado.cliente} />
                <DetalleFila label="Cantidad" valor={fmtNum(seleccionado.cantidad)} />
                <DetalleFila label="Cortador" valor={seleccionado.cortador} />
                <DetalleFila label="Estado" valor={seleccionado.estado} />
              </>
            )}
            <DetalleFila label="Planta" valor={seleccionado.planta} />
            <DetalleFila label="Mesón" valor={seleccionado.meson} />
            <DetalleFila label="Horario" valor={`${seleccionado.horaInicioEstimada} – ${seleccionado.horaFinEstimada}`} />
          </div>
        </Modal>
      )}
    </div>
  );
}
function DetalleFila({ label, valor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.slate, fontWeight: 700 }}>{label}</span>
      <span style={{ color: C.ink, fontWeight: 700, textAlign: "right" }}>{valor || "—"}</span>
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
function BloqueAgrupado({ titulo, primeraColLabel, data, mostrarFechaEntrega }) {
  const [grupoSel, setGrupoSel] = useState(null);
  const filasGrupoSel = grupoSel ? data.filas.filter((f) => f.grupo === grupoSel) : [];
  const columnasDetalle = [
    { key: "grupo", label: primeraColLabel },
    { key: "categoria", label: "Categoría" },
    { key: "numLote", label: "Num Lote", align: "right" },
    { key: "referencia", label: "Referencia" },
    { key: "cantidad", label: "Cant. en Planta", align: "right", render: (f) => fmtNum(f.cantidad) },
  ];
  if (mostrarFechaEntrega) {
    columnasDetalle.push({ key: "fechaEntregaConf", label: "Fecha Entrega Conf.", render: (f) => fmtFechaISO(f.fechaEntregaConf) });
    columnasDetalle.push({
      key: "diasParaEntrega",
      label: "Días para Vencer",
      align: "right",
      render: (f) => (f.diasParaEntrega ?? "—"),
      color: (f) => (f.diasParaEntrega < 0 ? C.red : f.diasParaEntrega <= 3 ? C.amber : C.ink),
    });
  }
  return (
    <div>
      {grupoSel && (
        <Modal title={`Lotes de ${grupoSel}`} onClose={() => setGrupoSel(null)} width={720}>
          <div style={{ marginBottom: 14, fontSize: 12, color: C.slate }}>
            {filasGrupoSel.length} lote{filasGrupoSel.length !== 1 ? "s" : ""} · {fmtNum(filasGrupoSel.reduce((s, f) => s + f.cantidad, 0))} unidades en total
          </div>
          <Tabla
            vacio="Sin lotes."
            columnas={[
              { key: "numLote", label: "Num Lote" },
              { key: "referencia", label: "Referencia" },
              { key: "categoria", label: "Categoría" },
              { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
              { key: "fechaEntregaConf", label: "Fecha Entrega Conf.", render: (f) => fmtFechaISO(f.fechaEntregaConf) },
              {
                key: "diasParaEntrega",
                label: "Días para Vencer",
                align: "right",
                render: (f) => (f.diasParaEntrega ?? "—"),
                color: (f) => (f.diasParaEntrega < 0 ? C.red : f.diasParaEntrega <= 3 ? C.amber : C.ink),
              },
            ]}
            filas={filasGrupoSel}
          />
        </Modal>
      )}
      {data.resumen.length > 0 && (
        <div style={{ marginBottom: 20 }}>
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
                  <tr key={r.grupo} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td
                      onClick={() => setGrupoSel(r.grupo)}
                      title="Ver lotes"
                      style={{ padding: "7px 12px", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3, color: C.blue, fontWeight: 600 }}
                    >
                      {r.grupo}
                    </td>
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
      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>DETALLE POR LOTE</div>
      <Tabla vacio="Sin lotes en planta." columnas={columnasDetalle} filas={data.filas} />
    </div>
  );
}
// Dashboard de "Informe de Seguimiento": KPIs + resumen por proceso (con %
// de unidades) + detalle de lotes agrupado por proceso, en vez de la tabla
// plana que tenía antes el reporte de Semiterminado.
function BloqueSeguimientoSemiterminado({ data }) {
  const { filas, resumen, resumenPorCliente, totalLotes, totalUnidades, procesosDistintos } = data;
  const [subTab, setSubTab] = useState("proceso");
  // Ventana de detalle: clic en una fila de "Resumen por Proceso" o de
  // "Resumen por Cliente" abre esto con la lista de lotes puntual (filtrada
  // por proceso, o por cliente+proceso) en vez de tener que buscarlos en la
  // tabla larga de abajo.
  const [detalleAbierto, setDetalleAbierto] = useState(null);
  // Filtro de proceso para la tabla de abajo — independiente del clic en
  // Resumen por Proceso/Cliente (ese abre una ventana puntual), esto deja el
  // "Detalle de Lotes por Proceso" filtrado mientras se sigue navegando.
  const [procesoFiltro, setProcesoFiltro] = useState("");
  if (!totalLotes) {
    return <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>Sin lotes en semiterminado.</div>;
  }
  const filasFiltradas = procesoFiltro ? filas.filter((f) => f.procesoDondeQuedo === procesoFiltro) : filas;
  function abrirProceso(proceso) {
    setDetalleAbierto({ titulo: `Lotes en "${proceso}"`, filas: filas.filter((f) => f.procesoDondeQuedo === proceso) });
  }
  function abrirClienteProceso(cliente, proceso) {
    setDetalleAbierto({
      titulo: `${cliente} — "${proceso}"`,
      filas: filas.filter((f) => f.nombreCliente === cliente && f.procesoDondeQuedo === proceso),
    });
  }
  return (
    <div>
      {detalleAbierto && (
        <Modal title={detalleAbierto.titulo} onClose={() => setDetalleAbierto(null)} width={720}>
          <div style={{ marginBottom: 12, fontSize: 12, color: C.slate }}>
            {fmtNum(detalleAbierto.filas.length)} lote{detalleAbierto.filas.length !== 1 ? "s" : ""} · {fmtNum(detalleAbierto.filas.reduce((s, f) => s + f.unidades, 0))} unidades
          </div>
          <Tabla
            vacio="Sin lotes."
            columnas={[
              { key: "nombreCliente", label: "Cliente" },
              { key: "numLote", label: "Num Lote", align: "right" },
              { key: "referencia", label: "Referencia" },
              { key: "categoria", label: "Categoría" },
              { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
              { key: "ultimaSalida", label: "Última Salida (sin entrega)" },
            ]}
            filas={detalleAbierto.filas}
          />
        </Modal>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <KPI icon="📦" label="Total Lotes" value={fmtNum(totalLotes)} color={C.ink} bg={C.canvas} />
        <KPI icon="🧶" label="Total Unidades" value={fmtNum(totalUnidades)} color={C.violet} bg={C.violetBg} />
        <KPI icon="🔀" label="Procesos Distintos" value={fmtNum(procesosDistintos)} color={C.blue} bg={C.blueBg} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div
          onClick={() => setSubTab("proceso")}
          style={{
            cursor: "pointer",
            padding: "9px 16px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 12,
            background: subTab === "proceso" ? C.ink : C.white,
            color: subTab === "proceso" ? C.seam : C.ink,
            border: `1px solid ${subTab === "proceso" ? C.ink : C.border}`,
          }}
        >
          RESUMEN POR PROCESO
        </div>
        <div
          onClick={() => setSubTab("cliente")}
          style={{
            cursor: "pointer",
            padding: "9px 16px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 12,
            background: subTab === "cliente" ? C.ink : C.white,
            color: subTab === "cliente" ? C.seam : C.ink,
            border: `1px solid ${subTab === "cliente" ? C.ink : C.border}`,
          }}
        >
          RESUMEN POR CLIENTE
        </div>
      </div>
      {subTab === "proceso" && (
        <div>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>Clic en un proceso para ver qué lotes tiene.</div>
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
                  <tr
                    key={r.proceso}
                    onClick={() => abrirProceso(r.proceso)}
                    title="Ver lotes de este proceso"
                    style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                  >
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
        </div>
      )}
      {subTab === "cliente" && (
        <div>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>Clic en una fila para ver esos lotes puntuales.</div>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Cliente</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Proceso Donde Quedó</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>% Unidades</th>
                </tr>
              </thead>
              <tbody>
                {resumenPorCliente.map((r, i) => (
                  <tr
                    key={`${r.cliente}-${r.proceso}`}
                    onClick={() => abrirClienteProceso(r.cliente, r.proceso)}
                    title="Ver estos lotes"
                    style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                  >
                    <td style={{ padding: "7px 12px" }}>{r.cliente}</td>
                    <td style={{ padding: "7px 12px" }}>{r.proceso}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{Math.round(r.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: C.ink }}>DETALLE DE LOTES POR PROCESO</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: C.slate, fontWeight: 600 }}>Filtrar por proceso:</label>
          <select
            value={procesoFiltro}
            onChange={(e) => setProcesoFiltro(e.target.value)}
            style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit", minWidth: 220 }}
          >
            <option value="">Todos los procesos</option>
            {resumen.map((r) => (
              <option key={r.proceso} value={r.proceso}>{r.proceso || "(Sin proceso)"} · {fmtNum(r.unidades)} und</option>
            ))}
          </select>
          {procesoFiltro && (
            <button
              onClick={() => setProcesoFiltro("")}
              style={{ fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              Quitar filtro
            </button>
          )}
        </div>
      </div>
      {procesoFiltro && (
        <div style={{ fontSize: 11, color: C.slate, marginBottom: 8 }}>
          {fmtNum(filasFiltradas.length)} lote{filasFiltradas.length !== 1 ? "s" : ""} · {fmtNum(filasFiltradas.reduce((s, f) => s + f.unidades, 0))} unidades en "{procesoFiltro}"
        </div>
      )}
      <Tabla
        vacio="Sin lotes para este filtro."
        columnas={[
          { key: "procesoDondeQuedo", label: "Proceso Donde Quedó" },
          { key: "nombreCliente", label: "Cliente" },
          { key: "numLote", label: "Num Lote", align: "right" },
          { key: "referencia", label: "Referencia" },
          { key: "categoria", label: "Categoría" },
          { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
          { key: "ultimaSalida", label: "Última Salida (sin entrega)" },
        ]}
        filas={filasFiltradas}
      />
    </div>
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
// Informe "BPT": resumen por cliente (Lotes/Unidades) arriba, y detalle por
// lote (Cliente/Num Lote/Referencia/Cantidad/Días en BPT) abajo, ordenado
// por más días primero para ver de inmediato lo que lleva más tiempo ahí.
function BloqueBPT({ data }) {
  const { filas, resumen, totalLotes, totalUnidades } = data;
  return (
    <div>
      {resumen.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>RESUMEN POR CLIENTE</div>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Cliente</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
                  <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r, i) => (
                  <tr key={r.cliente} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 12px" }}>{r.cliente}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FFF2CC" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: C.ink }}>TOTAL EN BPT</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalLotes)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalUnidades)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>DETALLE POR LOTE</div>
      <Tabla
        vacio="Sin lotes en BPT."
        columnas={[
          { key: "cliente", label: "Cliente" },
          { key: "numLote", label: "Num Lote", align: "right" },
          { key: "referencia", label: "Referencia" },
          { key: "categoria", label: "Categoría" },
          { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
          { key: "diasEnBPT", label: "Días en BPT", align: "right", render: (f) => (f.diasEnBPT === null || f.diasEnBPT === undefined ? "—" : fmtNum(f.diasEnBPT)) },
        ]}
        filas={filas}
      />
    </div>
  );
}
// ─── VERIFICADOR DE PRECIO DE CONFECCIÓN ────────────────────────────────────────
// Misma idea que el Verificador de Precio de Confección de Planta (módulo
// Planta → Dashboard de Entregas): busca por referencia y compara CostoFT
// (precio teórico, fijado en la ficha técnica) contra VaEnt (precio real de
// esa entrada puntual) para detectar cobros mal digitados. Mira TODAS las
// entradas del mismo Excel "Entradas de Planta" — planta propia (Industrias
// Yanko Módulo Centro) y talleres externos por igual, para que funcione
// igual sin importar a dónde se haya programado el lote. Los datos vienen de
// la misma colección "planta_entradas_cargas" que sube el módulo Planta;
// Planeación solo la lee, no la modifica.
// Compara referencias IGNORANDO el guion y espacios — igual que
// normalizarRefComparacion en App.js: Busint/Entradas de Planta a veces
// guardan el mismo código sin guion (ej. "961189") mientras que en otras
// pantallas se escribe o se ve con guion ("96-1189"). Sin esto, una
// búsqueda con o sin guion no encontraba entradas que sí existían.
function normalizarRef(v) {
  return String(v || "").trim().toUpperCase().replace(/[-\s]/g, "");
}
function VerificadorPrecioTalleresView({ entradas }) {
  const [busqueda, setBusqueda] = useState("");
  const resultado = useMemo(() => {
    const q = normalizarRef(busqueda);
    if (!q) return [];
    return entradas
      .filter((e) => normalizarRef(e.refExt) === q || normalizarRef(e.refN) === q)
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
      .slice(0, 5);
  }, [entradas, busqueda]);
  const taller = resultado[0]?.nombrePlanta || null;
  // Distingue "no hay ningún dato cargado todavía" (nadie ha subido Entradas
  // de Planta en el módulo Planta) de "sí hay datos, pero no para esta
  // referencia puntual" — sin esto, ambos casos se veían igual y no había
  // forma de saber si el problema era la búsqueda o que faltaba subir el
  // Excel de Entradas de Planta.
  if (!entradas.length) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13, background: C.canvas, borderRadius: 12, border: `1px dashed ${C.border}` }}>
        Aún no hay ninguna carga de "Entradas de Planta" subida (se sube desde el módulo Planta, botón "Subir Entradas"). En cuanto haya una, se puede buscar por referencia acá mismo.
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 16, maxWidth: 640 }}>
        Busca una referencia para ver sus últimas entradas a talleres externos y comparar el precio teórico (CostoFT) contra el precio con el que realmente entró (VaEnt). Las que no coinciden salen en rojo.
      </div>
      <div style={{ marginBottom: 18, maxWidth: 360 }}>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Escribe la referencia (ej. GM1002)"
          style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, fontFamily: "inherit" }}
        />
      </div>
      {!busqueda.trim() ? (
        <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>Escribe una referencia para ver sus últimas entradas.</div>
      ) : !resultado.length ? (
        <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>No se encontraron entradas de taller con esa referencia.</div>
      ) : (
        <>
          {taller && (
            <div style={{ marginBottom: 14, fontSize: 13, color: C.slate }}>
              Taller: <span style={{ fontWeight: 800, color: C.ink }}>{taller}</span>
            </div>
          )}
          <Tabla
            vacio="Sin entradas para esa referencia."
            columnas={[
              { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
              { key: "nombrePlanta", label: "Taller" },
              { key: "precioTeorico", label: "Precio teórico", align: "right", render: (f) => `$${fmtNum(f.precioTeorico)}` },
              {
                key: "precioEntrada",
                label: "Precio de entrada",
                align: "right",
                render: (f) => `$${fmtNum(f.precioEntrada)}`,
                color: (f) => (f.precioEntrada !== f.precioTeorico ? C.red : C.green),
              },
            ]}
            filas={resultado}
          />
        </>
      )}
    </div>
  );
}
// ─── PROGRAMADOR DE BMP → PLANTA ────────────────────────────────────────────────
// Fila compacta (REF, Lote, Cantidad, Categoría) con un botón "Programar" que
// abre una ventana: ahí se escribe/confirma la referencia para ver de una
// vez cuándo se le han hecho entradas antes (mismo historial del Verificador
// de Precio de Talleres, con "usar" para copiar planta y precio de una
// entrada anterior), se elige la planta destino, el precio de confección, y
// se ve el valor total del lote calculado solo. Es independiente de
// "Programación Diaria" del módulo Planta (esa es sobre lo que Planta Yanko
// va a ENTREGAR); esta es sobre lo que BMP va a ENVIAR. Se guarda en
// Firestore ("planeacion_programacion_bmp") para que quede el registro
// aunque cambie la carga de Hoja1.
function ProgramarLoteBMPModal({ lote, existente, plantas, entradasTalleres, onConfirm, onClose }) {
  const [refBuscada, setRefBuscada] = useState(lote.referencia || "");
  const [planta, setPlanta] = useState(existente?.plantaDestino || "");
  const [fecha, setFecha] = useState(existente?.fechaProgramada || today());
  const [precioConfeccion, setPrecioConfeccion] = useState(existente?.precioConfeccion || "");
  const historial = useMemo(() => {
    const ref = normalizarRef(refBuscada);
    if (!ref) return [];
    return (entradasTalleres || [])
      .filter((e) => normalizarRef(e.refExt) === ref || normalizarRef(e.refN) === ref)
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
      .slice(0, 5);
  }, [entradasTalleres, refBuscada]);
  const valorLote = Number(precioConfeccion || 0) * Number(lote.cantidadBMP || 0);
  function confirmar() {
    if (!planta.trim() || !fecha) return;
    onConfirm(planta.trim(), fecha, precioConfeccion);
    onClose();
  }
  return (
    <Modal title={`Programar Lote ${lote.numLote}`} onClose={onClose} width={520}>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 16 }}>
        {lote.categoria} · {fmtNum(lote.cantidadBMP)} unidades en BMP
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.ink, display: "block", marginBottom: 6 }}>Referencia (para ver entradas anteriores)</label>
        <input
          type="text"
          value={refBuscada}
          onChange={(e) => setRefBuscada(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>
      {historial.length > 0 ? (
        <div style={{ marginBottom: 16, padding: "10px 12px", background: C.canvas, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.ink, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            🔎 Entradas anteriores · {refBuscada}
          </div>
          {historial.map((h, i) => (
            <div
              key={i}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 12, padding: "5px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}
            >
              <span style={{ color: C.slate }}>{fmtFechaISO(h.fecha)} · {h.nombrePlanta}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.slate }}>Teórico ${fmtNum(h.precioTeorico)}</span>
                <span style={{ fontWeight: 800, color: h.precioEntrada !== h.precioTeorico ? C.red : C.green }}>Entrada ${fmtNum(h.precioEntrada)}</span>
                <button
                  type="button"
                  onClick={() => { setPrecioConfeccion(h.precioEntrada); setPlanta(h.nombrePlanta || ""); }}
                  style={{ fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  usar
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : !(entradasTalleres || []).length ? (
        <div style={{ fontSize: 11, color: C.slate, marginBottom: 16 }}>
          Aún no hay ninguna carga de "Entradas de Planta" subida (se sube desde el módulo Planta) — por eso no hay historial para ninguna referencia todavía. Esto no impide programar el lote.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.slate, marginBottom: 16 }}>
          Sin entradas registradas para "{refBuscada}" todavía — puede que este lote nunca se haya enviado antes a un taller. Esto no impide programarlo.
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.ink, display: "block", marginBottom: 6 }}>Planta / taller destino</label>
        <input
          list="plantas-programador-bmp"
          value={planta}
          onChange={(e) => setPlanta(e.target.value)}
          placeholder="Escribe o elige de la lista"
          style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <datalist id="plantas-programador-bmp">
          {plantas.map((p) => <option key={p} value={p} />)}
        </datalist>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.ink, display: "block", marginBottom: 6 }}>Fecha comprometida de envío</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.ink, display: "block", marginBottom: 6 }}>Precio de confección (por unidad)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={precioConfeccion}
            onChange={(e) => setPrecioConfeccion(e.target.value)}
            placeholder="0"
            style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>
      </div>
      {valorLote > 0 && (
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 18 }}>
          Valor del lote: <strong style={{ color: C.ink }}>${fmtNum(valorLote)}</strong>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="danger" onClick={confirmar} disabled={!planta.trim() || !fecha}>{existente ? "Guardar" : "Programar"}</Btn>
      </div>
    </Modal>
  );
}
function ProgramadorBMPView({ reporteBMP, programacion, plantas, entradasTalleres, onProgramar, onEditar, onCancelar }) {
  const [modalLote, setModalLote] = useState(null);
  const [mostrarVerificador, setMostrarVerificador] = useState(false);
  const porNumLote = useMemo(() => {
    const map = new Map();
    programacion.forEach((p) => map.set(p.numLote, p));
    return map;
  }, [programacion]);
  const costoTotalProgramado = useMemo(
    () => programacion.reduce((s, p) => s + Number(p.precioConfeccion || 0) * Number(p.cantidadBMP || 0), 0),
    [programacion]
  );
  // Verificador de Precio, pero automático por fila (mismo criterio que el
  // Verificador de Planta: última entrada de esa referencia, Precio teórico
  // vs. Precio de entrada, en rojo si no coinciden) — así no hay que
  // escribir la referencia a mano para ver si ya tuvo entradas antes.
  const ultimaEntradaPorRef = useMemo(() => {
    const map = new Map();
    (entradasTalleres || []).forEach((e) => {
      [e.refExt, e.refN].forEach((raw) => {
        const key = normalizarRef(raw);
        if (!key) return;
        const actual = map.get(key);
        if (!actual || (e.fecha || "") > (actual.fecha || "")) map.set(key, e);
      });
    });
    return map;
  }, [entradasTalleres]);
  const existenteAbierto = modalLote ? porNumLote.get(modalLote.numLote) || null : null;
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14, maxWidth: 640 }}>
        Dale Programar a un lote para escribir su referencia, ver sus entradas anteriores, elegir la planta destino, el precio de confección y el valor total del lote.
      </div>
      <div style={{ marginBottom: 14 }}>
        <Btn small variant={mostrarVerificador ? "primary" : "secondary"} onClick={() => setMostrarVerificador((v) => !v)}>
          🔍 Verificador de Precio {mostrarVerificador ? "▲" : "▼"}
        </Btn>
        {mostrarVerificador && (
          <div style={{ marginTop: 12, padding: 16, background: C.white, borderRadius: 14, border: `1px solid ${C.border}` }}>
            <VerificadorPrecioTalleresView entradas={entradasTalleres || []} />
          </div>
        )}
      </div>
      {costoTotalProgramado > 0 && (
        <div style={{ marginBottom: 14 }}>
          <KPI icon="💲" label="Costo Confección Programado" value={`$${fmtNum(costoTotalProgramado)}`} color={C.amber} bg={C.amberBg} />
        </div>
      )}
      {modalLote && (
        <ProgramarLoteBMPModal
          lote={modalLote}
          existente={existenteAbierto}
          plantas={plantas}
          entradasTalleres={entradasTalleres}
          onConfirm={(plantaDestino, fechaProgramada, precioConfeccion) => {
            if (existenteAbierto) onEditar(existenteAbierto.id, plantaDestino, fechaProgramada, precioConfeccion);
            else onProgramar(modalLote, plantaDestino, fechaProgramada, precioConfeccion);
          }}
          onClose={() => setModalLote(null)}
        />
      )}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.ink }}>
              {["Referencia", "Lote", "Cantidad", "Categoría", "Estado", "Verificador de Precio", ""].map((h, i) => (
                <th key={i} style={{ padding: "9px 12px", color: C.seam, textAlign: i === 2 ? "right" : "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!reporteBMP.length ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: 30, color: C.slate, fontSize: 13 }}>Sin lotes en BMP.</td></tr>
            ) : (
              reporteBMP.map((l, i) => {
                const p = porNumLote.get(l.numLote) || null;
                const valorLote = p ? Number(p.precioConfeccion || 0) * Number(p.cantidadBMP || 0) : 0;
                const ultimaEntrada = ultimaEntradaPorRef.get(normalizarRef(l.referencia)) || null;
                return (
                  <tr key={l.numLote} style={{ background: p ? C.greenBg : i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 12px", fontWeight: 700 }}>{l.referencia}</td>
                    <td style={{ padding: "7px 12px" }}>{l.numLote}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(l.cantidadBMP)}</td>
                    <td style={{ padding: "7px 12px" }}>{l.categoria}</td>
                    <td style={{ padding: "7px 12px" }}>
                      {p ? (
                        <div>
                          <div>🏭 {p.plantaDestino} · {fmtFechaISO(p.fechaProgramada)}</div>
                          {Number(p.precioConfeccion || 0) > 0 && (
                            <div style={{ fontSize: 11, color: C.slate }}>${fmtNum(p.precioConfeccion)}/und · Valor: ${fmtNum(valorLote)}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: C.slate }}>Sin programar</span>
                      )}
                    </td>
                    <td style={{ padding: "7px 12px" }}>
                      {ultimaEntrada ? (
                        <div style={{ fontSize: 11 }}>
                          <div style={{ color: C.slate }}>{fmtFechaISO(ultimaEntrada.fecha)} · {ultimaEntrada.nombrePlanta}</div>
                          <div>
                            <span style={{ color: C.slate }}>Teórico ${fmtNum(ultimaEntrada.precioTeorico)}</span>{" "}
                            <span style={{ fontWeight: 800, color: ultimaEntrada.precioEntrada !== ultimaEntrada.precioTeorico ? C.red : C.green }}>
                              Entrada ${fmtNum(ultimaEntrada.precioEntrada)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: C.slate, fontSize: 11 }}>Sin entradas</span>
                      )}
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <Btn small variant={p ? "secondary" : "primary"} onClick={() => setModalLote(l)}>{p ? "Editar" : "Programar"}</Btn>
                      {p && (
                        <button
                          onClick={() => onCancelar(p.id)}
                          style={{ marginLeft: 8, background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                        >
                          ✕ Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ─── VISTA PRINCIPAL: INFORMES ─────────────────────────────────────────────────
const REPORTES = [
  { id: "en_planta", label: "En Planta", icon: "🏭" },
  { id: "semiterminado", label: "Semiterminado", icon: "🧶" },
  { id: "bpt", label: "BPT", icon: "🏷" },
  { id: "por_cliente", label: "Por Cliente", icon: "🤝" },
  { id: "cliente_agrupado", label: "Cliente Agrupado", icon: "🏢" },
  { id: "cronograma", label: "Cronograma Entrega", icon: "📅" },
  { id: "por_pedido", label: "Por Pedido", icon: "📦" },
  { id: "bmp", label: "BMP", icon: "🧵" },
  { id: "programacion_yanko", label: "Programación Yanko", icon: "🎯" },
  { id: "programador_bmp", label: "Programador BMP → Planta", icon: "🚚" },
];
function InformesView({
  cargas,
  onAddCarga,
  onDeleteCarga,
  isAdmin,
  entradasTalleres,
  catalogoPlantas,
  programacionBMP,
  onProgramarBMP,
  onEditarProgramacionBMP,
  onCancelarProgramacionBMP,
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [cargaId, setCargaId] = useState(null);
  const [tab, setTab] = useState("en_planta");
  const [actualizandoInv, setActualizandoInv] = useState(false);
  const [resultadoInv, setResultadoInv] = useState(null);
  const [actualizandoCF, setActualizandoCF] = useState(false);
  const [resultadoCF, setResultadoCF] = useState(null);
  const [actualizandoDesdeBusint, setActualizandoDesdeBusint] = useState(false);
  const [resultadoDesdeBusint, setResultadoDesdeBusint] = useState(null);
  // (2026-08-21) Genera una carga NUEVA completa desde
  // ApiGen_PanelControlFlujoOperacional (API gen de Busint) — validado
  // lote por lote contra la última Hoja1 subida (135/135 cliente, 135/135
  // fecha conf, 135/135 fecha pedido, 131/135 inventario, las 4
  // diferencias eran lotes ya más actualizados en Busint). No reemplaza
  // "Subir Hoja1": crea una carga aparte, seleccionable como cualquier
  // otra, para no perder la opción manual si algún día Busint falla.
  async function actualizarDesdeBusintGen() {
    setActualizandoDesdeBusint(true);
    setResultadoDesdeBusint(null);
    try {
      const llamar = httpsCallable(functionsClient, "getCargaPlaneacionDesdeBusintGen");
      const resp = await llamar();
      const filasBusint = resp.data?.lotes || [];
      const lotesNuevos = construirLotesDesdeBusintGen(filasBusint);
      const nuevaCarga = { id: uid(), fecha: today(), lotes: lotesNuevos, creadoEn: new Date().toISOString(), origen: "busint_gen" };
      onAddCarga(nuevaCarga);
      setCargaId(nuevaCarga.id);
      setResultadoDesdeBusint({ total: lotesNuevos.length });
    } catch (err) {
      setResultadoDesdeBusint({ error: err?.message || String(err) });
    } finally {
      setActualizandoDesdeBusint(false);
    }
  }
  // Refresca SOLO el inventario por lote (Planta/BMP/Corte/BPT/
  // Semiterminado) contra la API "BD" de Busint — el cliente y la fecha de
  // entrega del pedido siguen viniendo de Hoja1 y no se tocan acá, porque
  // esta API no tiene una llave confiable para cruzar lote↔pedido (solo por
  // referencia, que puede repetirse en varios pedidos). El cruce SÍ es
  // confiable por número de lote (`Numero_de_Lote` en Busint = `numLote`
  // acá), así que solo se actualizan los 5 campos de inventario + planta,
  // y se recalculan `ubicacionActual`/`unidadesUbicacion`/`semanaEntregaISO`
  // con la misma lógica que usa `agruparLotes` al subir Hoja1.
  async function actualizarInventarioBusint() {
    if (!cargaActiva) return;
    setActualizandoInv(true);
    setResultadoInv(null);
    try {
      const llamar = httpsCallable(functionsClient, "getInventarioLotesBusintBD");
      const resp = await llamar();
      const filasBusint = resp.data?.lotes || [];
      const porNumLote = new Map(filasBusint.map((f) => [f.numLote, f]));
      let actualizados = 0;
      const nuevosLotes = (cargaActiva.lotes || []).map((l) => {
        const upd = porNumLote.get(l.numLote);
        if (!upd) return l;
        const cambio =
          upd.invCorte !== l.invCorte ||
          upd.invBMP !== l.invBMP ||
          upd.invPlanta !== l.invPlanta ||
          upd.invBPT !== l.invBPT ||
          upd.invSemiterminado !== l.invSemiterminado;
        if (!cambio) return l;
        actualizados++;
        const merged = {
          ...l,
          invCorte: upd.invCorte,
          invBMP: upd.invBMP,
          invPlanta: upd.invPlanta,
          invBPT: upd.invBPT,
          invSemiterminado: upd.invSemiterminado,
          nombrePlanta: upd.nombrePlanta || l.nombrePlanta,
        };
        let ubicacionActual = "Sin inventario";
        let unidadesUbicacion = 0;
        if (merged.invBPT > 0) { ubicacionActual = "BPT"; unidadesUbicacion = merged.invBPT; }
        else if (merged.invSemiterminado > 0) { ubicacionActual = "Semiterminado"; unidadesUbicacion = merged.invSemiterminado; }
        else if (merged.invPlanta > 0) { ubicacionActual = "Planta"; unidadesUbicacion = merged.invPlanta; }
        else if (merged.invBMP > 0) { ubicacionActual = "BMP"; unidadesUbicacion = merged.invBMP; }
        else if (merged.invCorte > 0) { ubicacionActual = "Corte"; unidadesUbicacion = merged.invCorte; }
        merged.ubicacionActual = ubicacionActual;
        merged.unidadesUbicacion = unidadesUbicacion;
        merged.semanaEntregaISO = merged.invPlanta > 0 ? dateToISO(lunesDeSemana(isoToLocalDate(merged.fechaEntregaConfISO))) : null;
        return merged;
      });
      if (actualizados > 0) {
        await fsSave("planeacion_cargas", cargaActiva.id, {
          lotes: nuevosLotes,
          ultimaActualizacionInventarioISO: new Date().toISOString(),
        });
      }
      setResultadoInv({ actualizados, totalBusint: filasBusint.length });
    } catch (err) {
      setResultadoInv({ error: err?.message || String(err) });
    } finally {
      setActualizandoInv(false);
    }
  }
  // (2026-08-19) Refresca SOLO nombreCliente + fechaEntregaConfISO contra la
  // API "BD" de Busint (cruce orden produccion -> pedidos clientes ->
  // maestro de clientes, validado 100/100 pedido resuelto y 98/100 con
  // fecha real distinta de la fecha de creación del pedido). NO toca
  // referencia, categoría, ni inventario — "Subir Hoja1" sigue siendo la
  // forma de cargar lotes nuevos, esto solo mantiene al día los que ya
  // están cargados. Recalcula semanaEntregaISO igual que agruparLotes.
  async function actualizarClienteFechaBusint() {
    if (!cargaActiva) return;
    setActualizandoCF(true);
    setResultadoCF(null);
    try {
      const llamar = httpsCallable(functionsClient, "getClienteFechaLotesBusintBD");
      const resp = await llamar();
      const filasBusint = resp.data?.lotes || [];
      const porNumLote = new Map(filasBusint.map((f) => [f.numLote, f]));
      let actualizados = 0;
      const nuevosLotes = (cargaActiva.lotes || []).map((l) => {
        const upd = porNumLote.get(l.numLote);
        if (!upd) return l;
        const cambio =
          (upd.nombreCliente && upd.nombreCliente !== l.nombreCliente) ||
          (upd.fechaEntregaConfISO && upd.fechaEntregaConfISO !== l.fechaEntregaConfISO);
        if (!cambio) return l;
        actualizados++;
        const merged = {
          ...l,
          nombreCliente: upd.nombreCliente || l.nombreCliente,
          fechaEntregaConfISO: upd.fechaEntregaConfISO || l.fechaEntregaConfISO,
        };
        merged.semanaEntregaISO = merged.invPlanta > 0 ? dateToISO(lunesDeSemana(isoToLocalDate(merged.fechaEntregaConfISO))) : null;
        return merged;
      });
      if (actualizados > 0) {
        await fsSave("planeacion_cargas", cargaActiva.id, {
          lotes: nuevosLotes,
          ultimaActualizacionClienteFechaISO: new Date().toISOString(),
        });
      }
      setResultadoCF({ actualizados, totalBusint: filasBusint.length });
    } catch (err) {
      setResultadoCF({ error: err?.message || String(err) });
    } finally {
      setActualizandoCF(false);
    }
  }
  // Ordena por `creadoEn` (timestamp completo con hora) cuando existe, para
  // que dos cargas del mismo día queden en el orden real en que se subieron
  // — antes solo se ordenaba por `fecha` (solo día), así que el orden entre
  // cargas del mismo día no era confiable.
  const cargasOrdenadas = [...cargas].sort(
    (a, b) => (b.creadoEn || b.fecha).localeCompare(a.creadoEn || a.fecha)
  );
  const cargaActiva = cargaId ? cargasOrdenadas.find((c) => c.id === cargaId) || cargasOrdenadas[0] : cargasOrdenadas[0];
  const lotes = useMemo(() => cargaActiva?.lotes || [], [cargaActiva]);
  // Buscador de lote — global, no depende de en qué pestaña estés parado.
  // Filtra por número de lote o por referencia y, si hay resultados, se
  // muestra un aviso arriba con dónde está cada uno AHORA MISMO
  // (ubicacionActual ya viene calculado por agruparLotes: Corte/BMP/
  // Planta/Semiterminado/BPT), sin que el usuario tenga que ir probando
  // pestaña por pestaña. Además, dentro de Semiterminado y En Planta, sigue
  // filtrando la tabla de esa pestaña como filtro rápido adicional.
  const [busquedaLote, setBusquedaLote] = useState("");
  const [pedidoTallaExpandido, setPedidoTallaExpandido] = useState(null);
  const [tallasPorPedido, setTallasPorPedido] = useState({});
  // (2026-08-20) Desglose por talla de un pedido, EN VIVO desde la API "gen"
  // de Busint (ApiGen_OrdenesDePedidoBusint vía getOrdenBusintPorNumero, ya
  // usada en producción por Pedidos/Corte) — no la API "BD" que se exploró
  // hoy y resultó tener casi todo congelado o vacío. Es a nivel de PEDIDO,
  // no de lote individual (un pedido puede repartirse en varios lotes), así
  // que se muestra el total del pedido completo, no solo lo de este lote.
  // No guarda nada — es una consulta al vuelo cada vez que se despliega.
  async function toggleTallasPedido(numPedido, fechaEntregaConfISO) {
    const clave = String(numPedido);
    if (pedidoTallaExpandido === clave) {
      setPedidoTallaExpandido(null);
      return;
    }
    setPedidoTallaExpandido(clave);
    if (tallasPorPedido[clave]) return; // ya en caché, no repetir la consulta
    setTallasPorPedido((prev) => ({ ...prev, [clave]: { cargando: true } }));
    try {
      const hoy = new Date();
      const fin = fechaEntregaConfISO && isoToLocalDate(fechaEntregaConfISO) > hoy
        ? dateToISO(new Date(isoToLocalDate(fechaEntregaConfISO).getTime() + 7 * 86400000))
        : dateToISO(hoy);
      const inicio = dateToISO(new Date(new Date(fin).getTime() - 240 * 86400000));
      const llamar = httpsCallable(functionsClient, "getOrdenBusintPorNumero");
      const resp = await llamar({ fechaInicio: inicio, fechaFin: fin, numeroPedido: clave });
      const filas = resp.data?.filasCoincidentes || [];
      const porRef = new Map();
      let cliente = "";
      let fechaDespacho = "";
      filas.forEach((f) => {
        cliente = cliente || (f.cliente || "").trim();
        fechaDespacho = fechaDespacho || (f.fechaDespacho ? String(f.fechaDespacho).slice(0, 10) : "");
        const claveRef = [f.ref, f.pinta, f.color].map((x) => x || "").join("|");
        if (!porRef.has(claveRef)) {
          porRef.set(claveRef, { ref: f.ref || "", descripcion: [f.pinta, f.color].filter(Boolean).join(" · "), tallas: {}, total: 0 });
        }
        const r = porRef.get(claveRef);
        const talla = String(f.talla || "").trim() || "Sin talla";
        const cant = Math.round(Number(f.cantPed) || 0);
        r.tallas[talla] = (r.tallas[talla] || 0) + cant;
        r.total += cant;
      });
      const referencias = [...porRef.values()];
      setTallasPorPedido((prev) => ({
        ...prev,
        [clave]: {
          cargando: false,
          cliente,
          fechaDespacho,
          referencias,
          totalUnidades: referencias.reduce((s, r) => s + r.total, 0),
          rango: { inicio, fin },
        },
      }));
    } catch (err) {
      setTallasPorPedido((prev) => ({ ...prev, [clave]: { cargando: false, error: err?.message || String(err) } }));
    }
  }
  const busquedaLoteNorm = busquedaLote.trim().toLowerCase();
  const lotesBuscados = useMemo(() => {
    if (!busquedaLoteNorm) return lotes;
    return lotes.filter(
      (l) =>
        String(l.numLote ?? "").toLowerCase().includes(busquedaLoteNorm) ||
        (l.referencia || "").toLowerCase().includes(busquedaLoteNorm)
    );
  }, [lotes, busquedaLoteNorm]);
  const reporteSemiterminado = useMemo(() => generarSeguimientoSemiterminado(lotesBuscados), [lotesBuscados]);
  const reportePlanta = useMemo(() => generarAgrupadoPlanta(lotesBuscados, "nombrePlanta"), [lotesBuscados]);
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
      const { filas: segFilas, resumen: segResumen, totalLotes: segTotalLotes, totalUnidades: segTotalUnidades, procesosDistintos: segProcesos } = reporteSemiterminado;
      const resumenRows = [
        ["Proceso Donde Quedó", "Lotes", "Unidades", "% Unidades"],
        ...segResumen.map((r) => [r.proceso, r.lotes, r.unidades, `${Math.round(r.pct * 100)}%`]),
        ["TOTAL", segTotalLotes, segTotalUnidades, "100%"],
      ];
      const detalleRows = [
        ["Proceso Donde Quedó", "Num Lote", "Referencia", "Categoría", "Unidades", "Última Salida"],
        ...segFilas.map((f) => [f.procesoDondeQuedo, f.numLote, f.referencia, f.categoria, f.unidades, f.ultimaSalida]),
      ];
      const maxRows = Math.max(resumenRows.length, detalleRows.length);
      const combined = [];
      for (let i = 0; i < maxRows; i++) {
        const left = resumenRows[i] || ["", "", "", ""];
        const right = detalleRows[i] || ["", "", "", "", "", ""];
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
        ...reporteBMP.map((r) => [
          r.categoria, r.cliente, r.referencia, r.numLote, r.cantidadBMP,
          fmtFechaISO(r.fechaCorte), r.diasParaCorte, fmtFechaISO(r.fechaEntregaPedido), r.diasRestantesPedido,
        ]),
      ]),
      "Informe BMP"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Cliente", "Num Lote", "Referencia", "Categoría", "Cantidad", "Fecha Ent. BPT", "Días en BPT"],
        ...reporteBPT.filas.map((f) => [f.cliente, f.numLote, f.referencia, f.categoria, f.cantidad, fmtFechaISO(f.fechaEntBPT), f.diasEnBPT]),
        [],
        ["RESUMEN POR CLIENTE"],
        ["Cliente", "Lotes", "Unidades"],
        ...reporteBPT.resumen.map((r) => [r.cliente, r.lotes, r.unidades]),
        ["TOTAL EN BPT", reporteBPT.totalLotes, reporteBPT.totalUnidades],
      ]),
      "Informe BPT"
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
            const nuevaCarga = { id: uid(), fecha: today(), lotes: lotesNuevos, creadoEn: new Date().toISOString() };
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
              ? `Carga del ${cargaActiva.fecha}${cargaActiva.creadoEn ? ` · Actualizado ${fmtFechaHora(cargaActiva.creadoEn)}` : ""}`
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
                </option>
              ))}
            </select>
          )}
          {cargaActiva && (
            <Btn variant="secondary" onClick={exportarExcel}>📤 Exportar Excel</Btn>
          )}
          {cargaActiva && (
            <Btn
              variant="secondary"
              onClick={actualizarInventarioBusint}
              disabled={actualizandoInv}
              title="Refresca cuánto hay en Planta/BMP/Corte/BPT/Semiterminado de cada lote, cruzando por número de lote contra Busint — el cliente y la fecha de entrega siguen viniendo de Hoja1"
            >
              {actualizandoInv ? "Actualizando…" : "🔄 Actualizar inventario"}
            </Btn>
          )}
          {cargaActiva && (
            <Btn
              variant="secondary"
              onClick={actualizarClienteFechaBusint}
              disabled={actualizandoCF}
              title="Refresca cliente y fecha de entrega de cada lote, cruzando por número de pedido contra Busint — no toca inventario ni referencia"
            >
              {actualizandoCF ? "Actualizando…" : "🔄 Actualizar cliente y fecha"}
            </Btn>
          )}
          <Btn
            variant="secondary"
            onClick={actualizarDesdeBusintGen}
            disabled={actualizandoDesdeBusint}
            title="Genera una carga nueva completa (cliente, fechas, inventario por etapa) en vivo desde Busint, sin subir Excel — validado contra la última Hoja1 subida"
          >
            {actualizandoDesdeBusint ? "Consultando Busint…" : "🔄 Actualizar desde Busint"}
          </Btn>
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
      {resultadoInv && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            background: resultadoInv.error ? C.redBg : resultadoInv.actualizados > 0 ? C.greenBg : C.canvas,
            border: `1px solid ${resultadoInv.error ? C.red : resultadoInv.actualizados > 0 ? C.green : C.border}`,
            fontSize: 12.5,
            color: C.ink,
          }}
        >
          {resultadoInv.error
            ? `⚠ No se pudo actualizar: ${resultadoInv.error}`
            : resultadoInv.actualizados > 0
            ? `✓ Se actualizó el inventario de ${resultadoInv.actualizados} lote(s) contra Busint.`
            : "El inventario ya estaba al día — nada que actualizar."}
        </div>
      )}
      {resultadoDesdeBusint && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            background: resultadoDesdeBusint.error ? C.redBg : C.greenBg,
            border: `1px solid ${resultadoDesdeBusint.error ? C.red : C.green}`,
            fontSize: 12.5,
            color: C.ink,
          }}
        >
          {resultadoDesdeBusint.error
            ? `⚠ No se pudo traer la carga desde Busint: ${resultadoDesdeBusint.error}`
            : `✓ Se generó una carga nueva con ${resultadoDesdeBusint.total} lote(s) desde Busint.`}
        </div>
      )}
      {resultadoCF && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            background: resultadoCF.error ? C.redBg : resultadoCF.actualizados > 0 ? C.greenBg : C.canvas,
            border: `1px solid ${resultadoCF.error ? C.red : resultadoCF.actualizados > 0 ? C.green : C.border}`,
            fontSize: 12.5,
            color: C.ink,
          }}
        >
          {resultadoCF.error
            ? `⚠ No se pudo actualizar: ${resultadoCF.error}`
            : resultadoCF.actualizados > 0
            ? `✓ Se actualizó cliente/fecha de entrega de ${resultadoCF.actualizados} lote(s) contra Busint.`
            : "Cliente y fecha de entrega ya estaban al día — nada que actualizar."}
        </div>
      )}
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
          <div style={{ marginBottom: 16 }}>
            <input
              value={busquedaLote}
              onChange={(e) => setBusquedaLote(e.target.value)}
              placeholder="🔍 Buscar lote por número o referencia — te dice dónde está ahora mismo..."
              style={{ padding: "8px 12px", border: `1.5px solid ${busquedaLote ? C.ink : C.border}`, borderRadius: 8, fontSize: 13, minWidth: 340, outline: "none", fontFamily: "inherit" }}
            />
            {busquedaLoteNorm && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {!lotesBuscados.length ? (
                  <div style={{ padding: "10px 14px", background: C.redBg, color: C.red, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                    Ningún lote coincide con "{busquedaLote}".
                  </div>
                ) : (
                  lotesBuscados.map((l) => (
                    <div key={l.numLote} style={{ padding: "10px 14px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800, color: C.ink, fontSize: 13 }}>Lote #{l.numLote}</div>
                      <div style={{ fontSize: 12, color: C.slate }}>{l.referencia}{l.categoria ? ` · ${l.categoria}` : ""}</div>
                      <div style={{ fontSize: 12, color: C.slate }}>{l.nombreCliente}{l.numPedido ? ` · Pedido #${l.numPedido}` : ""}</div>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: C.slate }}>📍 Está en:</span>
                        <UbicacionBadge ubicacion={l.ubicacionActual} />
                        <span style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>{fmtNum(l.unidadesUbicacion)} und.</span>
                      </div>
                      {l.ubicacionActual === "Planta" && l.nombrePlanta && (
                        <div style={{ fontSize: 12, color: C.slate, width: "100%" }}>Planta: <strong>{l.nombrePlanta}</strong></div>
                      )}
                      {l.ubicacionActual === "Semiterminado" && (
                        <div style={{ fontSize: 12, color: C.slate, width: "100%" }}>
                          Proceso donde quedó: <strong>{l.procesoDondeQuedo || "—"}</strong>{l.ultimaSalidaTexto ? ` · Última salida: ${l.ultimaSalidaTexto}` : ""}
                        </div>
                      )}
                      {l.numPedido && (
                        <div style={{ width: "100%" }}>
                          <button
                            onClick={() => toggleTallasPedido(l.numPedido, l.fechaEntregaConfISO)}
                            style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.ink, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                          >
                            {pedidoTallaExpandido === String(l.numPedido) ? "▲ Ocultar tallas" : "🧵 Ver tallas del pedido"}
                          </button>
                          {pedidoTallaExpandido === String(l.numPedido) && (
                            <div style={{ marginTop: 8, padding: 10, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                              {(() => {
                                const info = tallasPorPedido[String(l.numPedido)];
                                if (!info || info.cargando) return <div style={{ fontSize: 12, color: C.slate }}>Consultando Busint…</div>;
                                if (info.error) return <div style={{ fontSize: 12, color: C.red }}>⚠ {info.error}</div>;
                                if (!info.referencias?.length) return <div style={{ fontSize: 12, color: C.slate }}>Busint no devolvió líneas para este pedido en el rango consultado ({info.rango?.inicio} a {info.rango?.fin}).</div>;
                                return (
                                  <div>
                                    <div style={{ fontSize: 11, color: C.slate, marginBottom: 8 }}>
                                      Pedido #{l.numPedido} completo (todos los lotes) · {fmtNum(info.totalUnidades)} und. totales{info.fechaDespacho ? ` · Despacho: ${info.fechaDespacho}` : ""}
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      {info.referencias.map((r, i) => (
                                        <div key={i} style={{ fontSize: 11.5, color: C.ink }}>
                                          <strong>{r.ref}</strong>{r.descripcion ? ` · ${r.descripcion}` : ""} — {fmtNum(r.total)} und.
                                          <span style={{ color: C.slate }}>
                                            {" "}({Object.entries(r.tallas).filter(([, c]) => c > 0).map(([t, c]) => `${t}:${c}`).join(", ")})
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
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
          {tab === "bpt" && <BloqueBPT data={reporteBPT} />}
          {tab === "en_planta" && <BloqueAgrupado titulo="Planta" primeraColLabel="Nombre Planta" data={reportePlanta} mostrarFechaEntrega />}
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
          {tab === "bmp" && (
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
              filas={reporteBMP}
            />
          )}
          {tab === "programador_bmp" && (
            <ProgramadorBMPView
              reporteBMP={reporteBMP}
              programacion={programacionBMP || []}
              plantas={catalogoPlantas || []}
              entradasTalleres={entradasTalleres}
              onProgramar={onProgramarBMP}
              onEditar={onEditarProgramacionBMP}
              onCancelar={onCancelarProgramacionBMP}
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
// "Mi Día" de la Planeadora: prioridades del día ordenadas por cercanía de
// vencimiento del pedido — Plantas (cumplimiento), BMP (pendiente de
// programar hacia planta), lotes que se reciben hoy, y programación de
// mesones de hoy (leída de Corte, solo lectura). Cada KPI es clicable y
// despliega el detalle correspondiente en una ventana emergente.
function MiDiaPlaneadoraView({ lotes, reporteBMP, programacionBMP, programacionCorte, corteConfig, bloqueosMeson }) {
  const miDia = useMemo(() => generarMiDiaPlaneadora(lotes, reporteBMP, programacionBMP), [lotes, reporteBMP, programacionBMP]);
  const lotesRecibirHoy = useMemo(() => generarLotesRecibirHoy(lotes), [lotes]);
  const mesonesHoy = useMemo(() => generarMesonesHoy(programacionCorte, corteConfig, bloqueosMeson), [programacionCorte, corteConfig, bloqueosMeson]);
  const plantasVencidas = miDia.plantasIncumpliendo.filter((f) => f.diasRestantes < 0);
  const plantasUrgentes = miDia.plantasIncumpliendo.filter((f) => f.diasRestantes >= 0 && f.diasRestantes <= 7);
  const bmpVencidos = miDia.bmpPendiente.filter((f) => f.diasRestantesPedido < 0);
  const bmpUrgentes = miDia.bmpPendiente.filter((f) => f.diasRestantesPedido >= 0 && f.diasRestantesPedido <= 7);
  // Detalle genérico: cualquier KPI que se haga clic abre este mismo modal,
  // solo cambian título/columnas/filas.
  const [detalle, setDetalle] = useState(null);
  // La Programación de Mesones tiene su propio modal (no el genérico de
  // `detalle`) porque además de la tabla lleva el tablero visual dibujado.
  const [mostrarMesonesModal, setMostrarMesonesModal] = useState(false);
  // Las dos tablas de abajo empiezan cerradas — se despliegan al hacer clic
  // en su encabezado, igual que el resto de secciones colapsables de
  // Planeación (ej. el Verificador de Precio dentro de Programador BMP).
  const [mostrarPlantas, setMostrarPlantas] = useState(false);
  const [mostrarBMPPendiente, setMostrarBMPPendiente] = useState(false);
  const columnasPlantas = [
    { key: "estado", label: "Estado", render: (f) => <EstadoBadge estado={f.estado} /> },
    { key: "diasRestantes", label: "Días", align: "right", render: (f) => (f.diasRestantes ?? "—") },
    { key: "numLote", label: "Lote" },
    { key: "referencia", label: "Referencia" },
    { key: "categoria", label: "Categoría" },
    { key: "cliente", label: "Cliente" },
    { key: "planta", label: "Planta" },
    { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
    { key: "fechaEntregaConf", label: "Fecha Entrega Conf.", render: (f) => fmtFechaISO(f.fechaEntregaConf) },
  ];
  const columnasBMP = [
    { key: "estado", label: "Estado", render: (f) => <EstadoBadge estado={f.estado} /> },
    { key: "diasRestantesPedido", label: "Días", align: "right", render: (f) => (f.diasRestantesPedido ?? "—") },
    { key: "numLote", label: "Lote" },
    { key: "referencia", label: "Referencia" },
    { key: "categoria", label: "Categoría" },
    { key: "cliente", label: "Cliente" },
    { key: "cantidadBMP", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidadBMP) },
    { key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) },
  ];
  const columnasRecibirHoy = [
    { key: "numLote", label: "Lote" },
    { key: "referencia", label: "Referencia" },
    { key: "categoria", label: "Categoría" },
    { key: "cliente", label: "Cliente" },
    { key: "planta", label: "Planta" },
    { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
    { key: "fechaEntregaConf", label: "Fecha Entrega Conf.", render: (f) => fmtFechaISO(f.fechaEntregaConf) },
  ];
  const columnasMesones = [
    { key: "estado", label: "Estado" },
    { key: "referencia", label: "Referencia" },
    { key: "numPedido", label: "Pedido" },
    { key: "cliente", label: "Cliente" },
    { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
    { key: "planta", label: "Planta" },
    { key: "meson", label: "Mesón" },
    { key: "cortador", label: "Cortador" },
  ];
  return (
    <div>
      {detalle && (
        <Modal title={detalle.titulo} onClose={() => setDetalle(null)} width={780}>
          <Tabla vacio={detalle.vacio} columnas={detalle.columnas} filas={detalle.filas} />
        </Modal>
      )}
      {mostrarMesonesModal && (
        <Modal title="Programación de mesones — hoy" onClose={() => setMostrarMesonesModal(false)} width={900}>
          <TableroMesonesDia items={mesonesHoy} />
          <Tabla vacio="No hay cortes programados para hoy en Corte." columnas={columnasMesones} filas={mesonesHoy} />
        </Modal>
      )}
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>☀️ Mi Día</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: C.slate }}>
          Prioridades de hoy, ordenadas por cercanía de la Fecha Entrega Pedido — lo más próximo a vencer va primero. Haz clic en cualquier KPI para ver el detalle.
        </p>
      </div>
      {!lotes.length && (
        <div style={{ background: C.white, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, color: C.slate, fontSize: 13, marginBottom: 20 }}>
          Aún no hay ninguna carga de Hoja1 subida en Informes. Sube una carga para ver aquí las prioridades del día.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <KPI
          icon="📥" label="Lotes por recibir hoy" value={lotesRecibirHoy.length} color={C.blue} bg={C.blueBg}
          onClick={() => setDetalle({ titulo: "Plantas que deben entregar hoy (Fecha Entrega Conf.)", columnas: columnasRecibirHoy, filas: lotesRecibirHoy, vacio: "Ninguna planta tiene entrega programada para hoy." })}
        />
        <KPI
          icon="✂️" label="Programación de mesones (hoy)" value={mesonesHoy.length} color={C.violet} bg={C.violetBg}
          onClick={() => setMostrarMesonesModal(true)}
        />
        <KPI
          icon="📦" label="BMP vencidos (pedido)" value={bmpVencidos.length} color={C.red} bg={C.redBg}
          onClick={() => setDetalle({ titulo: "BMP vencidos respecto al pedido", columnas: columnasBMP, filas: bmpVencidos, vacio: "Sin BMP vencidos." })}
        />
        <KPI
          icon="📦" label="BMP urgentes (≤7 días)" value={bmpUrgentes.length} color={C.amber} bg={C.amberBg}
          onClick={() => setDetalle({ titulo: "BMP urgentes respecto al pedido", columnas: columnasBMP, filas: bmpUrgentes, vacio: "Sin BMP urgentes." })}
        />
        <KPI
          icon="🏭" label="Plantas vencidas" value={plantasVencidas.length} color={C.red} bg={C.redBg}
          onClick={() => setDetalle({ titulo: "Plantas — pedidos vencidos", columnas: columnasPlantas, filas: plantasVencidas, vacio: "Sin plantas vencidas." })}
        />
        <KPI
          icon="🏭" label="Plantas urgentes (≤7 días)" value={plantasUrgentes.length} color={C.amber} bg={C.amberBg}
          onClick={() => setDetalle({ titulo: "Plantas — pedidos urgentes", columnas: columnasPlantas, filas: plantasUrgentes, vacio: "Sin plantas urgentes." })}
        />
      </div>
      <div style={{ marginBottom: 28 }}>
        <div
          onClick={() => setMostrarPlantas((v) => !v)}
          style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "baseline", gap: 8 }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>Plantas — cumplimiento de pedidos</div>
          <span style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>{mostrarPlantas ? "▲ ocultar" : "▼ ver"}</span>
        </div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>Lotes en planta, ordenados por cuál pedido se vence primero.</div>
        {mostrarPlantas && (
          <Tabla vacio="No hay lotes en planta en la carga activa." columnas={columnasPlantas} filas={miDia.plantasIncumpliendo} />
        )}
      </div>
      <div style={{ marginBottom: 28 }}>
        <div
          onClick={() => setMostrarBMPPendiente((v) => !v)}
          style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "baseline", gap: 8 }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>BMP — pendiente de programar hacia planta</div>
          <span style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}>{mostrarBMPPendiente ? "▲ ocultar" : "▼ ver"}</span>
        </div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>Lotes en BMP que todavía no tienen planta/fecha asignada en Programador BMP → Planta.</div>
        {mostrarBMPPendiente && (
          <Tabla vacio="No hay lotes de BMP pendientes de programar." columnas={columnasBMP} filas={miDia.bmpPendiente} />
        )}
      </div>
    </div>
  );
}
// Acceso directo de nivel superior a "Mi Día" — se entra desde el menú de
// ATLAS (junto a "Dashboard"), sin pasar primero por el módulo completo de
// Planeación. Trae sus propias suscripciones de Firestore (las mismas 4 que
// antes vivían dentro de ModuloPlaneacion) porque es una pantalla
// independiente, montada por separado desde App.js.
export function MiDiaStandalone({ currentUser, onVolver, onLogout }) {
  const [cargas, setCargas] = useState([]);
  const [programacionBMP, setProgramacionBMP] = useState([]);
  const [programacionCorte, setProgramacionCorte] = useState([]);
  const [corteConfig, setCorteConfig] = useState(null);
  const [bloqueosMeson, setBloqueosMeson] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planeacion_cargas"), (snap) => {
      setCargas(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planeacion_programacion_bmp"), (snap) => {
      setProgramacionBMP(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "corte_programacion"), (snap) => {
      setProgramacionCorte(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "corte_config", "main"), (snap) => {
      setCorteConfig(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "corte_bloqueos_meson"), (snap) => {
      setBloqueosMeson(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  // Misma regla que usaba Informes/ModuloPlaneacion: siempre la carga de
  // Hoja1 más reciente, sin selector manual.
  const lotesActivos = useMemo(() => {
    if (!cargas.length) return [];
    const ordenadas = [...cargas].sort((a, b) => (b.creadoEn || b.fecha).localeCompare(a.creadoEn || a.fecha));
    return ordenadas[0]?.lotes || [];
  }, [cargas]);
  const reporteBMPActivo = useMemo(() => generarBMP(lotesActivos), [lotesActivos]);
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>☀️</div>
          <div style={{ color: C.slate }}>Cargando Mi Día...</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 32px", background: C.ink }}>
        {onVolver && (
          <button onClick={onVolver} style={{ background: "transparent", border: "1px solid rgba(200,184,162,0.3)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13, color: C.seam }}>
            ← Volver
          </button>
        )}
        <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.white }}>☀️ Mi Día — {currentUser?.name}</div>
        {onLogout && (
          <button onClick={onLogout} style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(232,93,74,0.85)", fontWeight: 700, fontSize: 12 }}>
            ⏏ Cerrar sesión
          </button>
        )}
      </div>
      <div style={{ padding: "28px 32px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <MiDiaPlaneadoraView
            lotes={lotesActivos}
            reporteBMP={reporteBMPActivo}
            programacionBMP={programacionBMP}
            programacionCorte={programacionCorte}
            corteConfig={corteConfig}
            bloqueosMeson={bloqueosMeson}
          />
        </div>
      </div>
    </div>
  );
}
// ─── ROOT MÓDULO PLANEACIÓN ─────────────────────────────────────────────────────
export default function ModuloPlaneacion({ currentUser, onVolver, onLogout }) {
  // "Mi Día" de la Planeadora ya no vive acá adentro — se movió a un acceso
  // directo de nivel superior en el menú de ATLAS (junto a "Dashboard"), ver
  // MiDiaStandalone más abajo en este mismo archivo. Este módulo vuelve a
  // ser el mismo para todos: aterriza en Informes.
  const [subView, setSubView] = useState("informes");
  const [cargas, setCargas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cargasEntradasPlanta, setCargasEntradasPlanta] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planeacion_cargas"), (snap) => {
      setCargas(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    return () => unsub();
  }, []);
  // Verificador de Precio de Confección (Talleres): reutiliza las cargas de
  // "Entradas de Planta" que sube el módulo Planta — Planeación solo las lee.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planta_entradas_cargas"), (snap) => {
      setCargasEntradasPlanta(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => unsub();
  }, []);
  const cargaEntradasPlantaActiva = useMemo(() => {
    if (!cargasEntradasPlanta.length) return null;
    return [...cargasEntradasPlanta].sort((a, b) => (b.creadoEn || b.fecha || "").localeCompare(a.creadoEn || a.fecha || ""))[0];
  }, [cargasEntradasPlanta]);
  // Todas las entradas de la carga activa de "Entradas de Planta" — planta
  // propia (INDUSTRIAS YANKO MODULO CENTRO) Y talleres externos por igual.
  // Antes esto excluía la planta propia (de ahí el nombre "entradasTalleres"),
  // pero el Programador BMP → Planta también programa lotes CON destino a la
  // planta propia, así que el verificador tiene que buscar ahí también —
  // igual que el Verificador de Precio de Confección del módulo Planta.
  const entradasTalleres = useMemo(() => cargaEntradasPlantaActiva?.entradas || [], [cargaEntradasPlantaActiva]);
  // Catálogo de plantas/talleres destino para el Programador de BMP: se toma
  // de todos los nombres de planta que ya han aparecido, en cualquier carga,
  // del Excel de Entradas de Planta (mismo dato que alimenta el Verificador
  // de Precio de Talleres) — no es una lista fija, crece sola con el uso.
  const catalogoPlantas = useMemo(() => {
    const set = new Set();
    cargasEntradasPlanta.forEach((c) => (c.entradas || []).forEach((e) => { if (e.nombrePlanta) set.add(e.nombrePlanta); }));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [cargasEntradasPlanta]);
  async function addCarga(carga) {
    setCargas((cs) => [...cs, carga]);
    await fsSave("planeacion_cargas", carga.id, carga);
  }
  async function deleteCarga(id) {
    setCargas((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("planeacion_cargas", id);
  }
  // Programador de BMP → Planta: cada registro dice qué lote se programó,
  // para qué planta/taller y con qué fecha comprometida de envío. Es
  // independiente de la Programación Diaria de Planta (esa es sobre lo que
  // Planta Yanko va a ENTREGAR; esta es sobre lo que BMP va a ENVIAR a una
  // planta/taller).
  const [programacionBMP, setProgramacionBMP] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planeacion_programacion_bmp"), (snap) => {
      setProgramacionBMP(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => unsub();
  }, []);
  async function programarLoteBMP(lote, plantaDestino, fechaProgramada, precioConfeccion) {
    const nuevo = {
      id: uid(),
      numLote: lote.numLote,
      numPedido: lote.numPedido || "",
      referencia: lote.referencia,
      categoria: lote.categoria,
      cliente: lote.cliente,
      cantidadBMP: lote.cantidadBMP,
      plantaDestino,
      fechaProgramada,
      precioConfeccion: Number(precioConfeccion) || 0,
      creadoEn: new Date().toISOString(),
      programadoPor: currentUser?.name || currentUser?.email || "",
    };
    setProgramacionBMP((ps) => [...ps, nuevo]);
    await fsSave("planeacion_programacion_bmp", nuevo.id, nuevo);
  }
  async function editarProgramacionBMP(id, plantaDestino, fechaProgramada, precioConfeccion) {
    const precio = Number(precioConfeccion) || 0;
    setProgramacionBMP((ps) => ps.map((p) => (p.id === id ? { ...p, plantaDestino, fechaProgramada, precioConfeccion: precio } : p)));
    const actual = programacionBMP.find((p) => p.id === id);
    if (actual) await fsSave("planeacion_programacion_bmp", id, { ...actual, plantaDestino, fechaProgramada, precioConfeccion: precio });
  }
  async function cancelarProgramacionBMP(id) {
    setProgramacionBMP((ps) => ps.filter((p) => p.id !== id));
    await fsDelete("planeacion_programacion_bmp", id);
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
          {subView === "informes" && (
            <InformesView
              cargas={cargas}
              onAddCarga={addCarga}
              onDeleteCarga={deleteCarga}
              isAdmin={isAdmin}
              entradasTalleres={entradasTalleres}
              catalogoPlantas={catalogoPlantas}
              programacionBMP={programacionBMP}
              onProgramarBMP={programarLoteBMP}
              onEditarProgramacionBMP={editarProgramacionBMP}
              onCancelarProgramacionBMP={cancelarProgramacionBMP}
            />
          )}
        </div>
      </div>
    </div>
  );
}

