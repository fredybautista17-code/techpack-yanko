import { useState, useRef, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
// ─── FIREBASE ────────────────────────────────────────────────────────────────
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
async function fsGet(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
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
  seamDk: "#9E8870",
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
  cyan: "#0E7490",
  cyanBg: "#ECFEFF",
};
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtFechaISO(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
// Lunes de la semana ISO a la que pertenece una fecha (YYYY-MM-DD) — para
// agrupar la Programación de Corte por semana.
function lunesDeSemanaISO(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay() === 0 ? 7 : dt.getDay();
  dt.setDate(dt.getDate() - (dow - 1));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function sumarMesesISO(fechaISO, meses) {
  const [y, m] = fechaISO.split("-").map(Number);
  const dt = new Date(y, m - 1 + meses, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-01`;
}
// Lunes con el que arranca la cuadrícula de calendario que cubre el mes de
// una fecha (puede caer en el mes anterior) — así el mes se pinta completo
// en filas de semana de lunes a domingo.
function primerLunesDeCuadriculaMes(fechaISO) {
  const [y, m] = fechaISO.split("-").map(Number);
  return lunesDeSemanaISO(`${y}-${String(m).padStart(2, "0")}-01`);
}
function ultimoDiaMesISO(fechaISO) {
  const [y, m] = fechaISO.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function mesAnioLabel(fechaISO) {
  const [y, m] = fechaISO.split("-").map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-CO");
}
function fmtCOP(n) {
  return `$${fmtNum(Math.round(n || 0))}`;
}
// Recuerda, en el navegador de quien esté usando el equipo (localStorage,
// no queda en el pedido ni se sincroniza entre equipos), el último cortador
// usado y el último mesón usado por planta — así al abrir un corte nuevo ya
// vienen precargados y solo hay que cambiarlos si de verdad cambia. Falla
// silencioso si localStorage no está disponible (ej. modo privado).
const LS_ULTIMO_CORTADOR = "atlasCorte_ultimoCortador";
const LS_ULTIMOS_MESONES = "atlasCorte_ultimosMesones"; // JSON: { [planta]: mesonId }
function leerUltimoCortador() {
  try {
    return localStorage.getItem(LS_ULTIMO_CORTADOR) || "";
  } catch {
    return "";
  }
}
function guardarUltimoCortador(nombre) {
  try {
    if (nombre) localStorage.setItem(LS_ULTIMO_CORTADOR, nombre);
  } catch {}
}
function leerUltimoMeson(planta) {
  try {
    if (!planta) return "";
    const raw = localStorage.getItem(LS_ULTIMOS_MESONES);
    const map = raw ? JSON.parse(raw) : {};
    return map[planta] || "";
  } catch {
    return "";
  }
}
function guardarUltimoMeson(planta, mesonId) {
  try {
    if (!planta || !mesonId) return;
    const raw = localStorage.getItem(LS_ULTIMOS_MESONES);
    const map = raw ? JSON.parse(raw) : {};
    map[planta] = mesonId;
    localStorage.setItem(LS_ULTIMOS_MESONES, JSON.stringify(map));
  } catch {}
}
function diasHabiles(mes, anio) {
  let count = 0;
  const d = new Date(anio, mes - 1, 1);
  while (d.getMonth() === mes - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
// Días laborales transcurridos desde el día 1 del mes hasta una fecha
// puntual (inclusive) — para el "ritmo acumulado": comparar lo que ya se
// cortó de verdad en lo que va del mes contra lo que se esperaría llevar
// cortado a esa altura (costo diario × días laborales ya transcurridos).
function diasLaboralesHastaFecha(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  let count = 0;
  for (let dia = 1; dia <= d; dia++) {
    const dow = new Date(y, m - 1, dia).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
// Días laborales al mes usados para estimar el costo DIARIO del centro de
// costo (nómina / DIAS_LABORALES_MES) — el usuario indicó que trabaja 20 días
// al mes, así que se usa ese número fijo en vez del calendario de días
// hábiles (que da un número distinto, ~21-23).
const DIAS_LABORALES_MES = 20;
// ─── TALLAS BUSINT ────────────────────────────────────────────────────────────
// OJO: esta lista de 10 etiquetas es un catálogo viejo que ya NO coincide
// con lo que realmente manda Busint (que llega como "S", "M", "L", "XL",
// "2XL", tallas numéricas, etc. — la etiqueta que sea, tal cual la escribió
// quien digitó el pedido). Por eso ya no se usa para armar las grillas de
// tallas de un pedido — cada pantalla arma sus propias columnas a partir de
// las tallas reales que trae cada referencia (ver ordenarTallas más abajo),
// para no dejar cortadas ni vacías las tallas que no encajan en esta lista.
// Se deja declarada por si algo más del archivo la sigue referenciando.
const TALLAS_BUSINT = [
  "U-2/4-2 PLUS",
  "4 XS",
  "6-6/8 S-S/M",
  "8 M-M/L",
  "10-10/12 L-L/XL",
  "12 XL-1XL",
  "14-14/16 2XL",
  "16 3XL",
  "18 4XL",
  "20",
];
// Orden "natural" para columnas de talla armadas a partir de lo que trae
// cada referencia (que puede variar de pedido a pedido) — primero las
// etiquetas conocidas en su orden lógico, luego tallas numéricas de menor a
// mayor, y cualquier otra etiqueta no reconocida al final en orden
// alfabético. Así las columnas no salen en el orden aleatorio en que Busint
// las va entregando.
const ORDEN_TALLAS_CONOCIDAS = [
  "U", "UNICA", "ÚNICA", "TU", "T/U",
  "XXS", "2XS",
  "XS",
  "S",
  "S/M",
  "M",
  "M/L",
  "L",
  "L/XL",
  "XL",
  "XL/2XL", "XL/XXL",
  "2XL", "XXL",
  "3XL", "XXXL",
  "4XL", "XXXXL",
  "5XL",
  "6XL",
];
function ordenarTallas(tallas) {
  return [...tallas].sort((a, b) => {
    const A = String(a).trim().toUpperCase();
    const B = String(b).trim().toUpperCase();
    const iA = ORDEN_TALLAS_CONOCIDAS.indexOf(A);
    const iB = ORDEN_TALLAS_CONOCIDAS.indexOf(B);
    if (iA !== -1 && iB !== -1) return iA - iB;
    if (iA !== -1) return -1;
    if (iB !== -1) return 1;
    const soloNumA = /^[\d.,/-]+$/.test(A.replace(/\s/g, ""));
    const soloNumB = /^[\d.,/-]+$/.test(B.replace(/\s/g, ""));
    const numA = parseFloat(A);
    const numB = parseFloat(B);
    if (soloNumA && soloNumB && !isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (soloNumA && !isNaN(numA)) return -1;
    if (soloNumB && !isNaN(numB)) return 1;
    return A.localeCompare(B, "es");
  });
}
// ─── SEMÁFORO FECHA ───────────────────────────────────────────────────────────
function semaforo(fechaDespacho) {
  if (!fechaDespacho)
    return { color: C.slate, label: "Sin fecha", bg: "#EDEDF2" };
  const dias = Math.ceil((new Date(fechaDespacho) - new Date()) / 86400000);
  if (dias < 0)
    return { color: C.red, label: `Vencido ${Math.abs(dias)}d`, bg: C.redBg };
  if (dias <= 3) return { color: C.red, label: `${dias}d`, bg: C.redBg };
  if (dias <= 7) return { color: C.amber, label: `${dias}d`, bg: C.amberBg };
  return { color: C.green, label: `${dias}d`, bg: C.greenBg };
}
// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = "primary", small, disabled }) {
  const S = {
    primary: { background: C.ink, color: C.white, border: "none" },
    secondary: {
      background: C.canvas,
      color: C.ink,
      border: `1px solid ${C.border}`,
    },
    success: { background: C.green, color: C.white, border: "none" },
    danger: { background: C.red, color: C.white, border: "none" },
    ghost: {
      background: "transparent",
      color: C.blue,
      border: `1.5px solid ${C.blue}`,
    },
    amber: { background: C.amber, color: C.white, border: "none" },
    cyan: { background: C.cyan, color: C.white, border: "none" },
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
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          color: C.slate,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
function FInput({ value, onChange, placeholder, type = "text", list }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={list}
      style={{
        width: "100%",
        padding: "9px 12px",
        border: `1.5px solid ${C.border}`,
        borderRadius: 8,
        fontSize: 14,
        color: C.ink,
        background: C.white,
        outline: "none",
        fontFamily: "inherit",
      }}
    />
  );
}
function FSel({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "9px 12px",
        border: `1.5px solid ${C.border}`,
        borderRadius: 8,
        fontSize: 14,
        color: C.ink,
        background: C.white,
        outline: "none",
        fontFamily: "inherit",
      }}
    >
      <option value="">— Seleccionar —</option>
      {options.map((o) => (
        <option key={o.id || o} value={o.id || o}>
          {o.nombre || o.name || o}
        </option>
      ))}
    </select>
  );
}
// Cuadro de diálogo que se puede mover (arrastrando desde el encabezado) y
// ampliar (arrastrando la esquina inferior derecha) — útil para formularios
// largos como Programar Corte, donde a veces conviene verlo más grande o
// correrlo a un lado para comparar con lo que hay detrás.
function Modal({ title, onClose, children, width = 600, inline = false }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width, height: null });
  const dragState = useRef(null);
  const resizeState = useRef(null);
  // Modo inline: se usa cuando esto se abre DENTRO de otra pantalla (ej.
  // "Ingreso de Corte Real" en Producción Corte) — en vez de una ventana
  // flotante con fondo oscuro, se muestra como una tarjeta normal en el
  // flujo de la página, igual que el panel de Programación de Mesones, así
  // el cortador no siente que "salió" de donde estaba.
  if (inline) {
    return (
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 14, background: C.white, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>{title}</span>
          <Btn variant="secondary" onClick={onClose}>
            ‹ Volver a la lista
          </Btn>
        </div>
        {children}
      </div>
    );
  }
  function onHeaderMouseDown(e) {
    if (e.target.closest("button")) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    function onMove(ev) {
      if (!dragState.current) return;
      const { startX, startY, origX, origY } = dragState.current;
      setPos({ x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY) });
    }
    function onUp() {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function onResizeMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();
    const box = e.currentTarget.parentElement;
    resizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: size.width,
      origH: size.height || box.offsetHeight,
    };
    function onMove(ev) {
      if (!resizeState.current) return;
      const { startX, startY, origW, origH } = resizeState.current;
      setSize({
        width: Math.max(360, origW + (ev.clientX - startX)),
        height: Math.max(240, origH + (ev.clientY - startY)),
      });
    }
    function onUp() {
      resizeState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,46,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          background: C.white,
          borderRadius: 14,
          width: size.width,
          maxWidth: "95vw",
          height: size.height || undefined,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(26,26,46,0.18)",
          transform: `translate(${pos.x}px, ${pos.y}px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={onHeaderMouseDown}
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
            cursor: "move",
            userSelect: "none",
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>
            {title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {(pos.x !== 0 || pos.y !== 0 || size.height !== null) && (
              <button
                onClick={() => {
                  setPos({ x: 0, y: 0 });
                  setSize({ width, height: null });
                }}
                title="Volver a tamaño y posición original"
                style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: C.slate, cursor: "pointer" }}
              >
                ⟲
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: 22,
                cursor: "pointer",
                color: C.slate,
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
        <div
          onMouseDown={onResizeMouseDown}
          title="Arrastrar para ampliar"
          style={{
            position: "absolute",
            right: 2,
            bottom: 2,
            width: 18,
            height: 18,
            cursor: "nwse-resize",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            padding: 2,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="8" cy="2" r="1" fill={C.border} />
            <circle cx="8" cy="5" r="1" fill={C.border} />
            <circle cx="8" cy="8" r="1" fill={C.border} />
            <circle cx="5" cy="5" r="1" fill={C.border} />
            <circle cx="5" cy="8" r="1" fill={C.border} />
            <circle cx="2" cy="8" r="1" fill={C.border} />
          </svg>
        </div>
      </div>
    </div>
  );
}
function KPICard({ icon, label, value, sub, color, bg }) {
  return (
    <div
      style={{
        background: bg || C.canvas,
        borderRadius: 12,
        padding: "16px 18px",
        border: `1px solid ${color}22`,
      }}
    >
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 900,
          color: color || C.ink,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{ fontSize: 11, color: C.slate, marginTop: 4, fontWeight: 600 }}
      >
        {label}
      </div>
      {sub && (
        <div
          style={{ fontSize: 11, color: color, marginTop: 2, fontWeight: 700 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
// ─── PROGRAMAR CORTE MODAL ────────────────────────────────────────────────────
// ─── ARCHIVOS: PRECIOS DE CORTE Y NÓMINA (Centro de Costo) ────────────────────
// Precios de corte por referencia — archivo maestro tipo "gerencia-coleccion"
// del ERP. Se usa la columna "MdeO Corte" (mano de obra de corte, SÍ varía
// por referencia) — no "Proc Corte", que en la práctica viene casi siempre
// vacía o en 0. Si el archivo trae varias hojas (como el de Centro de Costo,
// que también trae "bodega consecutivos" y "nomina"), se busca la que tenga
// columnas "Ref" y "MdeO Corte".
async function parsePreciosCorte(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  let hoja = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
    if (rows.length && "Ref" in rows[0] && "MdeO Corte" in rows[0]) {
      hoja = rows;
      break;
    }
  }
  if (!hoja) {
    throw new Error('No se encontró una hoja con columnas "Ref" y "MdeO Corte" en este archivo.');
  }
  const porRef = new Map();
  hoja.forEach((r) => {
    const ref = String(r["Ref"] ?? "").trim();
    if (!ref) return;
    porRef.set(ref, Number(r["MdeO Corte"]) || 0);
  });
  return [...porRef.entries()].map(([ref, precio]) => ({ ref, precio }));
}
// Nómina — archivo tipo la hoja "nomina" del Centro de Costo. La fila real de
// encabezados no está en la primera fila (hay título y filas en blanco
// antes), así que se busca la fila que tenga "CEDULA" y "NOMBRE" para ubicar
// las columnas por nombre, no por posición fija. El costo por trabajador se
// toma como Total Devengado + prestaciones sociales (Cesantías + Intereses +
// Prima + Vacaciones) — el costo real para la empresa antes de descuentos de
// ley. Si el periodo cubre menos de ~25 días (típico de una quincena), se
// escala a un valor mensual (× 30/días) para que sea comparable con el campo
// "Sueldo integral $" que ya se usaba en Admin Corte.
async function parseNomina(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  let filas = null;
  for (const name of wb.SheetNames) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
    const headerIdx = raw.findIndex(
      (row) =>
        Array.isArray(row) &&
        row.some((c) => String(c).toUpperCase().includes("CEDULA")) &&
        row.some((c) => String(c).toUpperCase().includes("NOMBRE"))
    );
    if (headerIdx < 0) continue;
    const headers = raw[headerIdx].map((h) => String(h || "").trim().toUpperCase());
    const idx = (match) => headers.findIndex((h) => h.includes(match));
    const iNombre = idx("NOMBRE");
    const iDevengado = idx("TOTAL DEVENGADO");
    const iDias = idx("DIAS");
    const iCesantias = idx("CESANTIAS");
    const iIntereses = idx("INTERESES");
    const iPrima = idx("PRIMA");
    const iVacaciones = idx("VACACIONES");
    filas = [];
    for (let r = headerIdx + 1; r < raw.length; r++) {
      const row = raw[r];
      if (!row || !row.length) continue;
      const nombre = String(row[iNombre] ?? "").trim();
      if (!nombre || nombre.toUpperCase() === "TOTAL") continue;
      const devengado = Number(row[iDevengado]) || 0;
      if (!devengado) continue;
      const prestaciones =
        (Number(row[iCesantias]) || 0) +
        (Number(row[iIntereses]) || 0) +
        (Number(row[iPrima]) || 0) +
        (Number(row[iVacaciones]) || 0);
      const dias = Number(row[iDias]) || 0;
      const factor = dias > 0 && dias < 25 ? 30 / dias : 1;
      const sueldo = Math.round((devengado + prestaciones) * factor);
      filas.push({ nombre, sueldo, devengado, prestaciones, dias });
    }
    break;
  }
  if (!filas) {
    throw new Error('No se encontró una hoja de nómina con columnas "CEDULA" y "NOMBRE" en este archivo.');
  }
  return filas;
}
// Listado de tipo de tela — toma la primera columna con datos de la primera
// hoja del archivo (sirve tanto si trae encabezado como "Tela"/"Tipo de
// Tela" como si son solo nombres sin encabezado).
async function parseTelas(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const nombres = [];
  const vistos = new Set();
  rows.forEach((row) => {
    const val = String((row && row[0]) ?? "").trim();
    if (!val) return;
    const up = val.toUpperCase();
    if (up === "TELA" || up === "TIPO DE TELA" || up === "NOMBRE") return;
    if (vistos.has(up)) return;
    vistos.add(up);
    nombres.push(val);
  });
  if (!nombres.length) throw new Error("No se encontraron nombres de tela en este archivo.");
  return nombres;
}
function ProgramarCorteModal({ pedido, plantas, cortadores, telas, preciosMap, lotesExistentes, onGuardarLote, preseleccion, onSave, onClose, onGuardado, inline, itemsUsadosMeson, pedidosTodos }) {
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();
  // Si el ítem viene de "Programación Hecha" (preseleccion trae planta,
  // mesón, cortador, tela, trazo y capas ya definidos), se precargan acá —
  // quedan editables por si algo cambió al momento real de cortar.
  // El grupo preseleccionado (desde el calendario o Vencidos) trae uno o
  // varios colores de una misma referencia — todos comparten planta, mesón,
  // tela, trazo, capas y horas (se definieron juntos en Programación Hecha),
  // así que basta con leer esos datos comunes del primer color del grupo.
  const preselColor0 = preseleccion?.colores?.[0] || preseleccion || null;
  const [form, setForm] = useState({
    fecha: preselColor0?.fechaProgramada || today(),
    planta: preselColor0?.planta || "",
    cortador: preselColor0?.cortador || leerUltimoCortador(),
    // Desde que se empieza a tender la tela hasta que queda lista para
    // cortar (no incluye el corte en sí) — antes solo se calculaba
    // teórico en Programación de Mesones; ahora también se registra real
    // acá, para que la estadística de tendido salga de datos reales.
    horaInicioTendido: preselColor0?.horaInicioEstimada || "",
    horaFinTendido: "",
    // Etapa 2 — Corte: ya NO se pide acá. Cuando se registra el corte real
    // solo se sabe con certeza que ya terminó el tendido — el tiempo real
    // de CORTE se sabe después (cuando el cortador de verdad termina) y se
    // completa más adelante en "Cortes Aprobados"/"Históricos", junto con
    // el lote. Quedan en el modelo de datos para que ese paso los pueda
    // llenar, pero no se piden acá.
    horaInicio: "",
    horaFin: "",
    // Número de lote — opcional acá. Si el patronista ya lo sabe al
    // momento de registrar el corte real, lo puede poner de una vez; si no,
    // lo deja en blanco y lo completa después en "Cortes Aprobados" (igual
    // que antes de este cambio).
    lote: "",
  });
  // Etapa 1 — Tendido: la prenda puede combinar varios materiales (ej.
  // cuerpo en una tela, puños en otra) — cada uno es un tendido FÍSICO
  // aparte, con su propia tela, trazo, número de capas y mesón (pueden
  // tenderse en mesones distintos). Los metros de cada material se calculan
  // solos (su propio trazo × sus propias capas). Arranca con un material —
  // lo normal — y se pueden agregar más.
  const [materiales, setMateriales] = useState([
    {
      id: uid(),
      tipoTela: preselColor0?.tipoTela || "",
      largoTrazo: preselColor0?.largoTrazo ? String(preselColor0.largoTrazo) : "",
      capas: preselColor0?.capas ? String(preselColor0.capas) : "",
      meson: preselColor0?.meson || leerUltimoMeson(form.planta),
      // Horario de tendido de ESTE material — cada material puede tenderse
      // en un momento distinto (ej. en mesones diferentes, uno después del
      // otro) — sirve para saber si el mesón está libre a esa hora, no solo
      // ese día.
      horaInicio: preselColor0?.horaInicioEstimada || "",
      horaFin: "",
    },
  ]);
  function actualizarMaterial(idx, campo, valor) {
    setMateriales((ms) => ms.map((m, i) => (i === idx ? { ...m, [campo]: valor } : m)));
  }
  function quitarMaterial(idx) {
    setMateriales((ms) => (ms.length > 1 ? ms.filter((_, i) => i !== idx) : ms));
  }
  // Material 1 se llena directo en el formulario (siempre visible); los
  // materiales adicionales ("+ Agregar material") se cargan en una ventana
  // aparte para no ir alargando el formulario — quedan como una tarjeta
  // resumen, con opción de editar (reabre la misma ventana) o quitar.
  const [modalMaterial, setModalMaterial] = useState(null);
  // Guarda qué timeline de disponibilidad está abierto ahora mismo: el id
  // del material (tarjeta inline de Material 1) o "modal" (ventana Agregar/
  // Editar material). null = ninguno abierto.
  const [timelineAbierto, setTimelineAbierto] = useState(null);
  function abrirAgregarMaterial() {
    setModalMaterial({ idx: null, tipoTela: "", meson: "", largoTrazo: "", capas: "", horaInicio: "", horaFin: "" });
  }
  function abrirEditarMaterial(idx) {
    const m = materiales[idx];
    setModalMaterial({ idx, tipoTela: m.tipoTela, meson: m.meson, largoTrazo: m.largoTrazo, capas: m.capas, horaInicio: m.horaInicio || "", horaFin: m.horaFin || "" });
  }
  function guardarModalMaterial() {
    if (!modalMaterial) return;
    const { idx, ...datos } = modalMaterial;
    if (idx === null) {
      setMateriales((ms) => [...ms, { id: uid(), ...datos }]);
    } else {
      setMateriales((ms) => ms.map((m, i) => (i === idx ? { ...m, ...datos } : m)));
    }
    setModalMaterial(null);
  }
  const plantaSel = plantas.find((pl) => pl.nombre === form.planta);
  const mesonesDisponibles = plantaSel?.mesones || [];
  const telasDatalistId = `telas-entrada-${pedido.id}`;
  // Disponibilidad (no bloqueante) de UN mesón, para la fecha+planta+horario
  // de un material puntual — junta lo ocupado de dos fuentes: lo planeado en
  // Programación de Mesones (itemsUsadosMeson, prop compartida con esa
  // vista) y lo ya cortado real ese mismo día en otros pedidos (o el mismo).
  // Solo cuenta lo que se CRUZA en horario (igual que en Programación de
  // Mesones) — si el material o lo ya ocupado no tiene horario puesto
  // todavía, se asume conservadoramente que se cruza, para no arriesgar un
  // choque real. No impide guardar, solo informa.
  function calcularDisponibilidadMaterial(mesonId, horaInicio, horaFin) {
    if (!mesonId || !form.fecha || !form.planta) {
      return { ocupados: [], usados: 0, disponible: null, capacidad: null, compartido: false, nombreGrupo: "" };
    }
    const mesonInfo = mesonesDisponibles.find((m) => m.id === mesonId);
    const capacidadPropia = mesonInfo?.metros ?? null;
    const grupoInfo = mesonInfo?.grupoId ? (plantaSel?.grupos || []).find((g) => g.id === mesonInfo.grupoId) : null;
    const capacidadGrupo = grupoInfo?.metros ?? null;
    function seCruza(hIni, hFin) {
      if (!hIni || !hFin || !horaInicio || !horaFin) return true;
      return horaInicio < hFin && hIni < horaFin;
    }
    const ocupados = [];
    if (typeof itemsUsadosMeson === "function") {
      (itemsUsadosMeson(form.fecha, form.planta, mesonId, mesonInfo?.grupoId || null, []) || []).forEach((it) => {
        if (seCruza(it.horaInicioEstimada, it.horaFinEstimada)) {
          ocupados.push({ ...it, tipo: "Programado" });
        }
      });
    }
    const listaPedidos = pedidosTodos && pedidosTodos.length ? pedidosTodos : [pedido];
    listaPedidos.forEach((p) => {
      (p.cortesRealizados || []).forEach((c) => {
        if (c.fecha !== form.fecha || c.planta !== form.planta) return;
        const refsTxt = (c.refs || []).map((r) => r.ref).join(", ");
        if ((c.materiales || []).length) {
          c.materiales.forEach((m, mIdx) => {
            if (m.meson !== mesonId) return;
            if (!seCruza(m.horaInicio, m.horaFin)) return;
            ocupados.push({
              id: `${c.id || c.fecha}-${mIdx}`,
              ref: refsTxt, cliente: p.cliente, numero: p.numero,
              horaInicioEstimada: m.horaInicio, horaFinEstimada: m.horaFin,
              largoTrazo: m.largoTrazo || 0, tipo: "Cortado",
            });
          });
        } else if (c.meson === mesonId && seCruza(c.horaInicioTendido, c.horaFinTendido)) {
          ocupados.push({
            id: c.id || `${c.fecha}-${mesonId}`,
            ref: refsTxt, cliente: p.cliente, numero: p.numero,
            horaInicioEstimada: c.horaInicioTendido, horaFinEstimada: c.horaFinTendido,
            largoTrazo: c.largoTrazo || 0, tipo: "Cortado",
          });
        }
      });
    });
    const usados = ocupados.reduce((s, it) => s + (it.largoTrazo || 0), 0);
    const dPropio = capacidadPropia !== null ? capacidadPropia - usados : null;
    const dGrupo = capacidadGrupo !== null ? capacidadGrupo - usados : null;
    const disponible = dPropio !== null && dGrupo !== null ? Math.min(dPropio, dGrupo) : dPropio !== null ? dPropio : dGrupo;
    return { ocupados, usados, disponible, capacidad: capacidadPropia, compartido: !!grupoInfo, nombreGrupo: grupoInfo?.nombre || "" };
  }
  // El precio por prenda se toma primero del archivo de precios de corte
  // (Admin Corte → Precios Corte, la fuente "oficial" por referencia); si esa
  // referencia no aparece ahí, se cae al precio que ya tuviera guardado el
  // pedido (precioCortePrenda, capturado a mano en cortes anteriores); si
  // tampoco hay eso, queda en 0 y se puede escribir a mano como antes.
  // Si venimos de un ítem ya programado (preseleccion), se precargan las
  // cantidades por talla de esa referencia — quedan editables por si algo
  // cambió al momento de cortar (ej. no alcanzó la tela).
  const [cantidades, setCantidades] = useState(() => {
    const c = {};
    pedido.referencias.forEach((r) => {
      const precioArchivo = preciosMap?.get(String(r.ref).trim());
      const precio = precioArchivo ?? r.precioCortePrenda ?? 0;
      c[r.id] = { precio, tallas: {} };
      // Las tallas de cada referencia son las que realmente trae esa
      // referencia (vienen de Busint tal cual, pueden variar de pedido a
      // pedido) — ya NO se usa el catálogo fijo TALLAS_BUSINT, que no
      // coincide con las etiquetas reales y dejaba la grilla vacía.
      Object.keys(r.tallas || {}).forEach((t) => {
        c[r.id].tallas[t] = 0;
      });
      // Match por refId (identifica el color/pinta exacto) — con respaldo
      // por `ref` solo si la programación es de antes de guardar refId. El
      // grupo preseleccionado puede traer varios colores de la misma
      // referencia; se busca el que corresponda a esta talla-fila exacta.
      const coloresPresel = preseleccion?.colores || (preseleccion ? [preseleccion] : []);
      const colorPresel = coloresPresel.find((pc) => (pc.refId ? pc.refId === r.id : pc.ref === r.ref));
      if (colorPresel) {
        Object.entries(colorPresel.tallas || {}).forEach(([t, cant]) => {
          c[r.id].tallas[t] = cant;
        });
      }
    });
    return c;
  });
  // Referencias (colores) que se programaron específicamente en el grupo
  // preseleccionado — si existe, la tabla de "Unidades a cortar" se filtra
  // para no mostrar el resto del pedido, solo lo que realmente se programó.
  const refIdsPreseleccion = preseleccion?.colores
    ? new Set(preseleccion.colores.map((c) => c.refId).filter(Boolean))
    : null;
  function pendiente(ref) {
    const yaCortado = (pedido.cortesRealizados || [])
      .flatMap((c) => c.refs || [])
      .filter((cr) => cr.refId === ref.id)
      .reduce((acc, cr) => {
        Object.keys(cr.tallas || {}).forEach((t) => {
          acc[t] = (acc[t] || 0) + (cr.tallas[t] || 0);
        });
        return acc;
      }, {});
    const pend = {};
    Object.keys(ref.tallas || {}).forEach((t) => {
      pend[t] = (ref.tallas[t] || 0) - (yaCortado[t] || 0);
    });
    return pend;
  }
  function totalCortando() {
    return Object.values(cantidades).reduce(
      (sum, r) => sum + Object.values(r.tallas).reduce((a, b) => a + b, 0),
      0
    );
  }
  function ingresoTotal() {
    return Object.values(cantidades).reduce((sum, r) => {
      const units = Object.values(r.tallas).reduce((a, b) => a + b, 0);
      return sum + units * (r.precio || 0);
    }, 0);
  }
  // Avance del pedido completo (no solo lo que se está por guardar acá) —
  // para que el cortador vea de un vistazo cuánto lleva cortado el pedido
  // en total antes de agregar este corte. Incluye lo ya cortado hasta ahora
  // más lo que está a punto de registrar en este formulario.
  function avancePedido() {
    const totalPedido = (pedido.referencias || []).reduce((s, r) => s + (r.total || 0), 0);
    const yaCortado = (pedido.cortesRealizados || []).reduce((s, c) => s + (c.totalUnidades || 0), 0);
    const porGuardar = totalCortando();
    const cortado = yaCortado + porGuardar;
    const pct = totalPedido > 0 ? Math.min(100, (cortado / totalPedido) * 100) : 0;
    return { totalPedido, yaCortado, porGuardar, cortado, pct };
  }
  function minutosTotales() {
    if (!form.horaInicio || !form.horaFin) return 0;
    const [h1, m1] = form.horaInicio.split(":").map(Number);
    const [h2, m2] = form.horaFin.split(":").map(Number);
    return h2 * 60 + m2 - (h1 * 60 + m1);
  }
  // Tiempo real de tendido — desde que se empieza a tender la tela hasta
  // que queda lista para cortar. Se registra aparte del tiempo de corte
  // (misma lógica: hora inicio/fin, resta en minutos) para que la
  // estadística pueda distinguir cuánto tardó cada etapa.
  function minutosTendido() {
    if (!form.horaInicioTendido || !form.horaFinTendido) return 0;
    const [h1, m1] = form.horaInicioTendido.split(":").map(Number);
    const [h2, m2] = form.horaFinTendido.split(":").map(Number);
    return h2 * 60 + m2 - (h1 * 60 + m1);
  }
  // Metros de UN material = su propio trazo (una sola capa) × sus propias
  // capas — cada material es un tendido físico aparte, con su número de
  // capas independiente (ej. cuerpo con 72 capas, puños con 36).
  function metrosMaterial(mat) {
    const trazo = parseFloat(mat.largoTrazo) || 0;
    const capas = parseFloat(mat.capas) || 0;
    return trazo * capas;
  }
  // Metros totales de tela = suma de los metros de TODOS los materiales
  // (normalmente uno solo, pero una prenda puede combinar varios, ej.
  // cuerpo + puños).
  function metrosTotales() {
    return materiales.reduce((s, mat) => s + metrosMaterial(mat), 0);
  }
  // Capas totales (legacy, para vistas/estadísticas que muestran un solo
  // número de "Capas" por corte) = suma de las capas de todos los
  // materiales.
  function capasSumaMateriales() {
    return materiales.reduce((s, mat) => s + (parseFloat(mat.capas) || 0), 0);
  }
  // Cantidad de tallas marcadas en la curva propuesta en Mesones — solo
  // para el panel informativo de arriba (lo que se programó), no se usa
  // para validar nada acá; las capas reales ahora viven en cada material.
  const marcadas = preseleccion?.curva
    ? Object.values(preseleccion.curva).reduce((s, v) => s + (parseInt(v) || 0), 0)
    : 0;
  async function save() {
    if (!form.planta || !form.cortador || !form.fecha) return;
    const loteTrim = (form.lote || "").trim();
    if (loteTrim && lotesExistentes?.has(loteTrim.toUpperCase())) return;
    const refs = pedido.referencias
      .map((r) => ({
        refId: r.id,
        ref: r.ref,
        descripcion: r.descripcion,
        precio: cantidades[r.id]?.precio || 0,
        tallas: { ...cantidades[r.id]?.tallas },
        total: Object.values(cantidades[r.id]?.tallas || {}).reduce(
          (a, b) => a + b,
          0
        ),
      }))
      .filter((r) => r.total > 0);
    if (!refs.length) return;
    // Se recuerda para la próxima vez que se abra un corte (mismo
    // navegador), así el cortador/mesón ya vienen precargados.
    guardarUltimoCortador(form.cortador);
    guardarUltimoMeson(form.planta, materiales[0]?.meson || "");
    const corte = {
      id: uid(),
      fecha: form.fecha,
      planta: form.planta,
      // Mesón legacy a nivel de corte (para vistas viejas que muestran un
      // solo "Mesón" en el encabezado) = el del primer material — el
      // detalle real por material (pueden ser mesones distintos) queda en
      // `materiales[]`.
      meson: materiales[0]?.meson || "",
      cortador: form.cortador,
      // Materiales reales de este corte — normalmente uno solo, pero una
      // prenda puede combinar varios (ej. cuerpo + puños), cada uno con su
      // propio trazo y metros.
      materiales: materiales
        .filter((m) => m.tipoTela || m.largoTrazo)
        .map((m) => ({
          tipoTela: m.tipoTela,
          largoTrazo: parseFloat(m.largoTrazo) || 0,
          capas: parseFloat(m.capas) || 0,
          meson: m.meson,
          horaInicio: m.horaInicio || "",
          horaFin: m.horaFin || "",
          metros: metrosMaterial(m),
        })),
      // Campos "legacy" (un solo tipoTela/largoTrazo) — se mantienen para
      // que las vistas y estadísticas viejas (Estadística de Tendido,
      // Centro de Costo) que todavía leen estos campos sueltos sigan
      // funcionando: tipoTela junta los nombres de todos los materiales,
      // largoTrazo queda con el del primero (no tiene un solo valor
      // correcto con más de un material). metrosTendido SÍ es la suma real
      // de todos los materiales.
      tipoTela: materiales.map((m) => m.tipoTela).filter(Boolean).join(" + "),
      largoTrazo: parseFloat(materiales[0]?.largoTrazo) || 0,
      // Capas total (legacy) = suma de las capas de todos los materiales —
      // el detalle real por material queda en `materiales[]`.
      capas: capasSumaMateriales(),
      metrosTendido: metrosTotales(),
      horaInicioTendido: form.horaInicioTendido,
      horaFinTendido: form.horaFinTendido,
      minutosTendido: minutosTendido(),
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      minutos: minutosTotales(),
      // El lote es opcional acá — si el patronista ya lo sabe, lo puede
      // poner de una vez; si no, se deja en blanco y se completa después en
      // "Cortes Aprobados", ya viendo los datos reales de lo que se cortó.
      lote: (form.lote || "").trim(),
      refs,
      ingresoCorte: ingresoTotal(),
      totalUnidades: totalCortando(),
      creadoEn: new Date().toISOString(),
    };
    onSave(corte);
    if (onGuardado) onGuardado();
    else onClose();
  }
  // Nombre del mesón programado en Mesones (preselColor0.meson guarda el id,
  // no el nombre) — se busca en `plantas` directo, sin depender de lo que
  // el cortador esté editando ahora en cada material, porque este panel
  // muestra lo ORIGINAL que se programó.
  const nombreMesonPresel = (() => {
    if (!preselColor0?.meson) return "";
    const pl = (plantas || []).find((p) => p.nombre === preselColor0.planta);
    const m = pl?.mesones?.find((mm) => mm.id === preselColor0.meson);
    return m?.nombre || preselColor0.meson;
  })();
  return (
    <Modal
      title={`Entrada de Corte — Pedido ${pedido.numero}`}
      onClose={onClose}
      width={760}
      inline={inline}
    >
      {/* Avance del pedido — cuánto lleva cortado en total (incluye lo ya
          registrado en cortes anteriores más lo que se está por guardar acá
          mismo), para que el cortador no tenga que salir a revisar el
          pedido aparte. */}
      {(() => {
        const av = avancePedido();
        if (av.totalPedido <= 0) return null;
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Avance del pedido
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>
                {fmtNum(av.cortado)} / {fmtNum(av.totalPedido)} uds ({av.pct.toFixed(0)}%)
                {av.porGuardar > 0 && (
                  <span style={{ color: C.violet, fontWeight: 700 }}> · +{fmtNum(av.porGuardar)} en este corte</span>
                )}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: C.canvas, border: `1px solid ${C.border}`, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${av.totalPedido > 0 ? Math.min(100, (av.yaCortado / av.totalPedido) * 100) : 0}%`, background: C.slate }} />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${av.totalPedido > 0 ? Math.min(100, (av.yaCortado / av.totalPedido) * 100) : 0}%`,
                  width: `${av.totalPedido > 0 ? Math.max(0, Math.min(100 - (av.yaCortado / av.totalPedido) * 100, (av.porGuardar / av.totalPedido) * 100)) : 0}%`,
                  background: C.violet,
                }}
              />
            </div>
          </div>
        );
      })()}
      {/* PASO 1: resumen de lo programado en Mesones — solo referencia, no
          se edita acá. Le muestra al cortador qué se planeó (planta, mesón,
          cortador, tela, trazo, curva de tallas) antes de registrar lo
          real. Solo aparece si el ítem viene de un grupo programado. */}
      {preseleccion && (
        <div
          style={{
            background: C.violetBg,
            border: `1.5px solid ${C.violet}55`,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 11, fontWeight: 800, color: C.violet, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            📋 Programado en Mesones (referencia)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, fontSize: 12, color: C.ink, marginBottom: marcadas > 0 ? 10 : 0 }}>
            <div><b>Planta:</b> {preselColor0?.planta || "—"}</div>
            <div><b>Mesón:</b> {nombreMesonPresel || "—"}</div>
            <div><b>Cortador:</b> {preselColor0?.cortador || "—"}</div>
            <div><b>Tela / Trazo:</b> {preselColor0?.tipoTela || "—"}{preselColor0?.largoTrazo ? ` · ${preselColor0.largoTrazo}m` : ""}</div>
          </div>
          {marcadas > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.violet, marginBottom: 4 }}>CURVA DE TALLAS</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {ordenarTallas(Object.keys(preseleccion.curva)).map((t) => (
                  <span key={t} style={{ background: C.white, color: C.violet, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 8 }}>
                    {t} {preseleccion.curva[t]}
                  </span>
                ))}
                <span style={{ fontSize: 11, color: C.slate }}>marcadas: {marcadas}</span>
              </div>
            </div>
          )}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1.1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Field label="Fecha">
          <FInput
            type="date"
            value={form.fecha}
            onChange={(v) => setForm((f) => ({ ...f, fecha: v }))}
          />
        </Field>
        <Field label="Planta">
          <FSel
            value={form.planta}
            onChange={(v) => setForm((f) => ({ ...f, planta: v }))}
            options={plantas.map((p) => ({ id: p.nombre, nombre: p.nombre }))}
          />
        </Field>
        <Field label="Cortador">
          <FSel
            value={form.cortador}
            onChange={(v) => setForm((f) => ({ ...f, cortador: v }))}
            options={cortadores.map((c) => ({
              id: c.nombre,
              nombre: c.nombre,
            }))}
          />
        </Field>
        <Field label="Lote (si ya lo sabes)">
          <FInput
            value={form.lote}
            onChange={(v) => setForm((f) => ({ ...f, lote: v }))}
            placeholder="Opcional"
          />
        </Field>
      </div>
      {form.lote.trim() && lotesExistentes?.has(form.lote.trim().toUpperCase()) && (
        <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginTop: -10, marginBottom: 14 }}>
          ⚠ Ese número de lote ya está en uso — usa uno diferente o déjalo en blanco y complétalo después en "Cortes Aprobados".
        </div>
      )}
      {/* Etapa 1 — Tendido: uno o más materiales (una prenda puede combinar
          varias telas, ej. cuerpo + puños), cada uno con su propio trazo (una
          capa). Los metros de cada material se calculan solos (trazo ×
          capas totales). */}
      <div style={{ fontSize: 11, fontWeight: 800, color: C.violet, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Etapa 1 · Tendido — Materiales
      </div>
      <datalist id={telasDatalistId}>
        {(telas || []).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {materiales.map((mat, idx) => {
        const disp = calcularDisponibilidadMaterial(mat.meson, mat.horaInicio, mat.horaFin);
        if (idx === 0) {
          return (
            <div
              key={mat.id}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
                background: C.canvas,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr 1fr",
                  gap: 12,
                  marginBottom: 10,
                  alignItems: "end",
                }}
              >
                <Field label="Tipo de Tela">
                  <FInput
                    value={mat.tipoTela}
                    onChange={(v) => actualizarMaterial(idx, "tipoTela", v)}
                    placeholder="Ej: Diamante"
                    list={telasDatalistId}
                  />
                </Field>
                <Field label="Mesón">
                  <FSel
                    value={mat.meson}
                    onChange={(v) => actualizarMaterial(idx, "meson", v)}
                    options={mesonesDisponibles.map((m) => ({ id: m.id, nombre: m.nombre }))}
                  />
                </Field>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 12,
                }}
              >
                <Field label="Largo del Trazo (1 capa, m)">
                  <FInput
                    type="number"
                    value={mat.largoTrazo}
                    onChange={(v) => actualizarMaterial(idx, "largoTrazo", v)}
                    placeholder="4.5"
                  />
                </Field>
                <Field label="Capas">
                  <FInput
                    type="number"
                    value={mat.capas}
                    onChange={(v) => actualizarMaterial(idx, "capas", v)}
                    placeholder="72"
                  />
                </Field>
                <Field label="Metros">
                  <div
                    style={{
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${C.border}`,
                      background: C.white,
                      fontWeight: 800,
                      color: metrosMaterial(mat) > 0 ? C.violet : C.slate,
                      fontSize: 13,
                    }}
                  >
                    {metrosMaterial(mat) > 0 ? `${metrosMaterial(mat).toLocaleString("es-CO")} m` : "—"}
                  </div>
                </Field>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr auto",
                  gap: 12,
                  alignItems: "end",
                  marginTop: 10,
                }}
              >
                <Field label="Hora Inicio">
                  <FInput
                    type="time"
                    value={mat.horaInicio}
                    onChange={(v) => actualizarMaterial(idx, "horaInicio", v)}
                  />
                </Field>
                <Field label="Hora Fin">
                  <FInput
                    type="time"
                    value={mat.horaFin}
                    onChange={(v) => actualizarMaterial(idx, "horaFin", v)}
                  />
                </Field>
                {mat.meson && (
                  <Btn
                    small
                    variant="secondary"
                    onClick={() => setTimelineAbierto((t) => (t === mat.id ? null : mat.id))}
                  >
                    {timelineAbierto === mat.id ? "Ocultar disponibilidad" : "📋 Ver disponibilidad"}
                  </Btn>
                )}
              </div>
              {mat.meson && timelineAbierto === mat.id && (
                <MesonTimeline
                  nombre={mesonesDisponibles.find((m) => m.id === mat.meson)?.nombre || ""}
                  capacidad={disp.capacidad}
                  compartido={disp.compartido}
                  ocupados={disp.ocupados}
                  inicioActual={mat.horaInicio}
                  finActual={mat.horaFin}
                />
              )}
              {disp.ocupados.length > 0 && (
                <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginTop: 8 }}>
                  ⚠ Este mesón ya tiene actividad el {fmtFechaISO(form.fecha)} en ese horario: {disp.ocupados.map((o) => `${o.tipo} (${o.cliente} #${o.numero} ${o.ref}, ${o.horaInicioEstimada || "?"}-${o.horaFinEstimada || "?"})`).join("  ·  ")}
                </div>
              )}
            </div>
          );
        }
        // Materiales adicionales (agregados por la ventana "+ Agregar
        // material") se muestran como tarjeta resumen, no editable inline.
        const nombreMesonMat = mesonesDisponibles.find((m) => m.id === mat.meson)?.nombre || "";
        return (
          <div
            key={mat.id}
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 10,
              background: C.white,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 13, color: C.ink }}>
              <b>Material {idx + 1}:</b> {mat.tipoTela || "—"}
              {nombreMesonMat ? ` · ${nombreMesonMat}` : ""}
              {` · ${mat.largoTrazo || 0}m × ${mat.capas || 0} capas = ${metrosMaterial(mat) || 0}m`}
              {(mat.horaInicio || mat.horaFin) ? ` · ${mat.horaInicio || "?"}-${mat.horaFin || "?"}` : ""}
              {disp.ocupados.length > 0 && (
                <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginTop: 4 }}>
                  ⚠ Mesón ocupado el {fmtFechaISO(form.fecha)} en ese horario: {disp.ocupados.map((o) => `${o.tipo} (${o.cliente} #${o.numero} ${o.ref}, ${o.horaInicioEstimada || "?"}-${o.horaFinEstimada || "?"})`).join("  ·  ")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => abrirEditarMaterial(idx)}
                title="Editar este material"
                style={{ background: C.violetBg, border: "none", borderRadius: 8, padding: "6px 10px", color: C.violet, fontWeight: 700, cursor: "pointer" }}
              >
                ✏️
              </button>
              <button
                onClick={() => quitarMaterial(idx)}
                title="Quitar este material"
                style={{ background: C.redBg, border: "none", borderRadius: 8, padding: "6px 10px", color: C.red, fontWeight: 700, cursor: "pointer" }}
              >
                🗑
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Btn small variant="secondary" onClick={abrirAgregarMaterial}>
          + Agregar material
        </Btn>
        {materiales.length > 1 && (
          <div style={{ fontSize: 12, fontWeight: 800, color: C.violet }}>
            Total: {metrosTotales() > 0 ? `${metrosTotales().toLocaleString("es-CO")} m` : "—"}
          </div>
        )}
      </div>
      {modalMaterial && (
        <Modal title={modalMaterial.idx === null ? "Agregar material" : `Editar material ${modalMaterial.idx + 1}`} onClose={() => setModalMaterial(null)} width={440}>
          <Field label="Tipo de Tela">
            <FInput
              value={modalMaterial.tipoTela}
              onChange={(v) => setModalMaterial((m) => ({ ...m, tipoTela: v }))}
              placeholder="Ej: Diamante"
              list={telasDatalistId}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <Field label="Mesón">
              <FSel
                value={modalMaterial.meson}
                onChange={(v) => setModalMaterial((m) => ({ ...m, meson: v }))}
                options={mesonesDisponibles.map((m) => ({ id: m.id, nombre: m.nombre }))}
              />
            </Field>
            <Field label="Largo del Trazo (1 capa, m)">
              <FInput
                type="number"
                value={modalMaterial.largoTrazo}
                onChange={(v) => setModalMaterial((m) => ({ ...m, largoTrazo: v }))}
                placeholder="4.5"
              />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Capas">
              <FInput
                type="number"
                value={modalMaterial.capas}
                onChange={(v) => setModalMaterial((m) => ({ ...m, capas: v }))}
                placeholder="72"
              />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end", marginTop: 12 }}>
            <Field label="Hora Inicio">
              <FInput
                type="time"
                value={modalMaterial.horaInicio}
                onChange={(v) => setModalMaterial((m) => ({ ...m, horaInicio: v }))}
              />
            </Field>
            <Field label="Hora Fin">
              <FInput
                type="time"
                value={modalMaterial.horaFin}
                onChange={(v) => setModalMaterial((m) => ({ ...m, horaFin: v }))}
              />
            </Field>
            {modalMaterial.meson && (
              <Btn
                small
                variant="secondary"
                onClick={() => setTimelineAbierto((t) => (t === "modal" ? null : "modal"))}
              >
                {timelineAbierto === "modal" ? "Ocultar disponibilidad" : "📋 Ver disponibilidad"}
              </Btn>
            )}
          </div>
          {(() => {
            if (!modalMaterial.meson) return null;
            const dispModal = calcularDisponibilidadMaterial(modalMaterial.meson, modalMaterial.horaInicio, modalMaterial.horaFin);
            return (
              <>
                {timelineAbierto === "modal" && (
                  <MesonTimeline
                    nombre={mesonesDisponibles.find((m) => m.id === modalMaterial.meson)?.nombre || ""}
                    capacidad={dispModal.capacidad}
                    compartido={dispModal.compartido}
                    ocupados={dispModal.ocupados}
                    inicioActual={modalMaterial.horaInicio}
                    finActual={modalMaterial.horaFin}
                  />
                )}
                {dispModal.ocupados.length > 0 && (
                  <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginTop: 10 }}>
                    ⚠ Este mesón ya tiene actividad el {fmtFechaISO(form.fecha)} en ese horario: {dispModal.ocupados.map((o) => `${o.tipo} (${o.cliente} #${o.numero} ${o.ref}, ${o.horaInicioEstimada || "?"}-${o.horaFinEstimada || "?"})`).join("  ·  ")}
                  </div>
                )}
              </>
            );
          })()}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn variant="secondary" onClick={() => setModalMaterial(null)}>Cancelar</Btn>
            <Btn variant="success" onClick={guardarModalMaterial} disabled={!modalMaterial.tipoTela && !modalMaterial.largoTrazo}>
              {modalMaterial.idx === null ? "Agregar" : "Guardar"}
            </Btn>
          </div>
        </Modal>
      )}
      {/* Horario real de tendido — desde que se empieza a tender la tela
          hasta que queda lista para cortar. Antes solo existía el estimado
          teórico (Programación de Mesones); esto es lo real. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Field label="Hora Inicio Tendido">
          <FInput
            type="time"
            value={form.horaInicioTendido}
            onChange={(v) => setForm((f) => ({ ...f, horaInicioTendido: v }))}
          />
        </Field>
        <Field label="Hora Fin Tendido (listo para cortar)">
          <FInput
            type="time"
            value={form.horaFinTendido}
            onChange={(v) => setForm((f) => ({ ...f, horaFinTendido: v }))}
          />
        </Field>
        <Field label="Duración Tendido">
          <div
            style={{
              padding: "9px 12px",
              borderRadius: 8,
              border: `1.5px solid ${C.border}`,
              background: C.canvas,
              fontWeight: 800,
              color: minutosTendido() > 0 ? C.violet : C.slate,
              fontSize: 13,
            }}
          >
            {minutosTendido() > 0 ? `${minutosTendido()} min` : "—"}
          </div>
        </Field>
      </div>
      {/* Etapa 2 — Corte: el horario real de corte ya NO se pide acá — se
          completa después en "Cortes Aprobados"/"Históricos", cuando ya se
          sabe de verdad cuánto tardó (ver nota en el estado inicial de
          `form` más arriba). */}
      {(minutosTendido() > 0 || (minutosTotales() > 0 && metrosTotales() > 0)) && (
        <div
          style={{
            padding: "10px 16px",
            background: C.violetBg,
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            color: C.violet,
            fontWeight: 700,
          }}
        >
          {minutosTendido() > 0 && (
            <div>
              🧵 {minutosTendido()} min de tendido
              {metrosTotales() > 0 && ` · ${(minutosTendido() / metrosTotales()).toFixed(1)} min/metro`}
            </div>
          )}
          {minutosTotales() > 0 && metrosTotales() > 0 && (
            <div style={{ marginTop: minutosTendido() > 0 ? 4 : 0 }}>
              ✂ {minutosTotales()} min de corte · {(minutosTotales() / metrosTotales()).toFixed(1)} min/metro
              {capasSumaMateriales() > 0 && ` · ${(minutosTotales() / capasSumaMateriales()).toFixed(1)} min/capa`}
            </div>
          )}
          {minutosTendido() > 0 && minutosTotales() > 0 && (
            <div style={{ marginTop: 4, fontWeight: 900 }}>
              ⏱ Total: {minutosTendido() + minutosTotales()} min (tendido + corte)
            </div>
          )}
        </div>
      )}
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: C.ink,
          marginBottom: 12,
        }}
      >
        Unidades a cortar
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {pedido.referencias.map((ref) => {
          // Si venimos de un grupo preseleccionado (calendario/Vencidos), acá
          // se corta SOLO lo que se programó para esa referencia — no todo
          // el pedido — mostrando nada más los colores incluidos en el grupo.
          if (refIdsPreseleccion && !refIdsPreseleccion.has(ref.id)) return null;
          const pend = pendiente(ref);
          const totalPend = Object.values(pend).reduce((a, b) => a + b, 0);
          if (totalPend === 0) return null;
          return (
            <div
              key={ref.id}
              style={{
                background: C.canvas,
                borderRadius: 10,
                padding: 14,
                marginBottom: 10,
                border: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div>
                  <span style={{ fontWeight: 800, color: C.ink }}>
                    {ref.ref}
                  </span>
                  <span style={{ color: C.slate, marginLeft: 8, fontSize: 13 }}>
                    {ref.descripcion}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: C.slate }}>Pendiente: </span>
                    <span style={{ fontWeight: 700, color: C.amber }}>
                      {totalPend}
                    </span>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <span style={{ color: C.slate }}>
                      Precio/prenda{preciosMap?.has(String(ref.ref).trim()) && (
                        <span style={{ color: C.violet, fontWeight: 700 }}> (archivo)</span>
                      )}:{" "}
                    </span>
                    <input
                      type="number"
                      value={cantidades[ref.id]?.precio || 0}
                      onChange={(e) =>
                        setCantidades((c) => ({
                          ...c,
                          [ref.id]: {
                            ...c[ref.id],
                            precio: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      style={{
                        width: 80,
                        padding: "4px 6px",
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        fontSize: 12,
                        textAlign: "right",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5,1fr)",
                  gap: 6,
                }}
              >
                {ordenarTallas(Object.keys(pend)).map((t) =>
                    pend[t] > 0 ? (
                      <div key={t}>
                        <div
                          style={{
                            fontSize: 9,
                            color: C.slate,
                            fontWeight: 700,
                            marginBottom: 2,
                          }}
                        >
                          {t}
                        </div>
                        <div
                          style={{ fontSize: 9, color: C.amber, marginBottom: 2 }}
                        >
                          Pend: {pend[t]}
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={cantidades[ref.id]?.tallas[t] || 0}
                          onChange={(e) => {
                            // Sin tope en pend[t]: a veces salen más
                            // unidades de las programadas (p.ej. una capa
                            // de más) y hay que poder ingresar la cantidad
                            // real, aunque supere lo "Pendiente".
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            setCantidades((c) => ({
                              ...c,
                              [ref.id]: {
                                ...c[ref.id],
                                tallas: { ...c[ref.id].tallas, [t]: val },
                              },
                            }));
                          }}
                          style={{
                            width: "100%",
                            padding: "5px",
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            fontSize: 12,
                            textAlign: "center",
                            background:
                              cantidades[ref.id]?.tallas[t] > 0
                                ? C.blueBg
                                : C.white,
                          }}
                        />
                        {(cantidades[ref.id]?.tallas[t] || 0) > pend[t] && (
                          <div
                            style={{
                              fontSize: 8,
                              color: C.red,
                              fontWeight: 700,
                              marginTop: 2,
                              lineHeight: 1.2,
                            }}
                          >
                            ⚠ Recuerda cambiar el pedido en Busint
                          </div>
                        )}
                      </div>
                    ) : null
                  )}
              </div>
            </div>
          );
        })}
      </div>
      {totalCortando() > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            background: C.greenBg,
            borderRadius: 10,
            border: `1px solid ${C.green}44`,
            display: "flex",
            gap: 24,
          }}
        >
          <div>
            <span style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>
              UNIDADES
            </span>
            <div style={{ fontWeight: 900, color: C.green, fontSize: 20 }}>
              {fmtNum(totalCortando())}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>
              INGRESO CORTE
            </span>
            <div style={{ fontWeight: 900, color: C.green, fontSize: 20 }}>
              {fmtCOP(ingresoTotal())}
            </div>
          </div>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: 16,
        }}
      >
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn
          variant="success"
          onClick={save}
          disabled={totalCortando() === 0 || !form.planta || !form.cortador || (form.lote.trim() && lotesExistentes?.has(form.lote.trim().toUpperCase()))}
        >
          ✓ Entrada de Corte
        </Btn>
      </div>
    </Modal>
  );
}
// ─── PROGRAMACIÓN HECHA MODAL ──────────────────────────────────────────────────
// Segunda etapa del corte: ya se sabe qué referencia/talla/cantidad se va a
// cortar (eso quedó en "En Programación"), acá se define CON QUÉ se va a
// cortar — planta, mesón, cortador, tipo de tela, largo de trazo y capas —
// sin todavía tocar unidades reales ni lote (eso es "Entrada de Corte",
// cuando el corte ya pasó de verdad). Valida que el mesón elegido (o su
// grupo compartido, ej. Mesón 2+3 de Yanko) tenga espacio ese día, y sugiere
// un tiempo teórico a partir del promedio real de cortes anteriores con esa
// misma tela.
// Ventana visible del timeline de mesón: 6:00am a 8:00pm — cubre el horario
// laboral típico. Los bloques que caen fuera de esta ventana se recortan.
const MESON_TIMELINE_INICIO_MIN = 6 * 60;
const MESON_TIMELINE_FIN_MIN = 20 * 60;
const MESON_TIMELINE_SPAN_MIN = MESON_TIMELINE_FIN_MIN - MESON_TIMELINE_INICIO_MIN;
function minDesdeHora(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function bloqueTimelineStyle(inicioMin, finMin) {
  const s = Math.max(MESON_TIMELINE_INICIO_MIN, inicioMin);
  const e = Math.min(MESON_TIMELINE_FIN_MIN, finMin);
  if (e <= s) return null;
  const left = ((s - MESON_TIMELINE_INICIO_MIN) / MESON_TIMELINE_SPAN_MIN) * 100;
  const width = ((e - s) / MESON_TIMELINE_SPAN_MIN) * 100;
  return { left: `${left}%`, width: `${width}%` };
}
// "Foto" visual del mesón: nombre + capacidad, y debajo un timeline del día
// (6am–8pm) con los horarios ya ocupados por otras referencias programadas
// ahí ese día (según su Hora Inicio/Fin Estimada) en rojo, y el horario que
// se está por guardar en violeta — para elegir a ojo un hueco libre.
function MesonTimeline({ nombre, capacidad, compartido, ocupados, inicioActual, finActual }) {
  const horasEtiqueta = [];
  for (let m = MESON_TIMELINE_INICIO_MIN; m <= MESON_TIMELINE_FIN_MIN; m += 120) {
    horasEtiqueta.push(m);
  }
  const inicioActualMin = minDesdeHora(inicioActual);
  const finActualMin = minDesdeHora(finActual);
  const actualStyle =
    inicioActualMin !== null && finActualMin !== null && finActualMin > inicioActualMin
      ? bloqueTimelineStyle(inicioActualMin, finActualMin)
      : null;
  return (
    <div style={{ padding: "12px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.canvas, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>
          🪧 {nombre}
          {compartido ? " (compartido)" : ""}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Capacidad: {capacidad}m de trazo</div>
      </div>
      <div style={{ position: "relative", height: 34, borderRadius: 6, background: C.white, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        {ocupados.map((it) => {
          const iMin = minDesdeHora(it.horaInicioEstimada);
          const fMin = minDesdeHora(it.horaFinEstimada);
          if (iMin === null || fMin === null || fMin <= iMin) return null;
          const st = bloqueTimelineStyle(iMin, fMin);
          if (!st) return null;
          return (
            <div
              key={it.id}
              title={`${it.cliente} · #${it.numero} · ${it.ref} — ${it.horaInicioEstimada} a ${it.horaFinEstimada}`}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: st.left,
                width: st.width,
                background: C.redBg,
                borderRight: `1px solid ${C.white}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 800,
                color: C.red,
                overflow: "hidden",
                whiteSpace: "nowrap",
                padding: "0 2px",
              }}
            >
              {it.ref}
            </div>
          );
        })}
        {actualStyle && (
          <div
            title={`Este corte: ${inicioActual} a ${finActual}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: actualStyle.left,
              width: actualStyle.width,
              background: C.violet,
              opacity: 0.85,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 800,
              color: C.white,
            }}
          >
            este
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {horasEtiqueta.map((m) => (
          <span key={m} style={{ fontSize: 9, color: C.slate }}>
            {String(Math.floor(m / 60)).padStart(2, "0")}:00
          </span>
        ))}
      </div>
      {ocupados.length === 0 && (
        <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>Ningún otro corte tiene horario estimado ahí ese día todavía.</div>
      )}
    </div>
  );
}
// ─── IMPRIMIR TRABAJO DE CORTADORES ────────────────────────────────────────
// Una hoja por cortador con lo que tiene programado ese día: mesón, tela,
// trazo×capas y la hora ESTIMADA de tendido (la que ya se puso en
// Programación de Mesones). La hora real de corte todavía no existe en este
// punto del flujo (se registra después, en Entrada de Corte) — por eso queda
// en blanco, para que el cortador la anote a mano cuando arranque y termine.
function ImprimirTrabajoCortadoresModal({ fecha, grupos, nombreMeson, capasTotalesGrupo, onClose }) {
  const porCortador = new Map();
  grupos
    .filter((g) => g.etapa === "programacion_hecha" && g.cortador)
    .forEach((g) => {
      if (!porCortador.has(g.cortador)) porCortador.set(g.cortador, []);
      porCortador.get(g.cortador).push(g);
    });
  const cortadores = [...porCortador.keys()].sort((a, b) => a.localeCompare(b));
  return (
    <Modal title={`Trabajo del día — ${fmtFechaISO(fecha)}`} onClose={onClose} width={900}>
      {!cortadores.length ? (
        <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 14 }}>
          Ningún corte tiene cortador asignado todavía para el {fmtFechaISO(fecha)} — asígnalo en Programación de Mesones antes de imprimir.
        </div>
      ) : (
        <>
          <div className="no-print" style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={() => window.print()}>🖨 Imprimir</Btn>
          </div>
          <div id="area-imprimir">
            {cortadores.map((cortador) => {
              const items = porCortador.get(cortador);
              const metrosTotal = items.reduce((s, g) => s + (g.largoTrazo || 0) * capasTotalesGrupo(g), 0);
              const capasTotal = items.reduce((s, g) => s + capasTotalesGrupo(g), 0);
              return (
                <div key={cortador} className="hoja-cortador" style={{ padding: "20px 4px", borderBottom: `2px solid ${C.border}`, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.ink }}>✂ {cortador}</div>
                    <div style={{ fontSize: 13, color: C.slate }}>{fmtFechaISO(fecha)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: C.slate, marginBottom: 14 }}>
                    {items.length} corte{items.length !== 1 ? "s" : ""} programado{items.length !== 1 ? "s" : ""} · {fmtNum(capasTotal)} capas en total · {fmtNum(metrosTotal)}m de tela a tender en total
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.ink}` }}>
                        {["Cliente / Pedido", "Ref", "Mesón", "Tela", "Trazo × Capas", "Tendido (est.)", "Corte inicio", "Corte fin"].map((h) => (
                          <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, textTransform: "uppercase", color: C.slate }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((g) => (
                        <tr key={g.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: "6px 8px" }}>{g.cliente} · #{g.numero}</td>
                          <td style={{ padding: "6px 8px", fontWeight: 700 }}>{g.ref}</td>
                          <td style={{ padding: "6px 8px" }}>{nombreMeson(g.planta, g.meson)}</td>
                          <td style={{ padding: "6px 8px" }}>{g.tipoTela || "—"}</td>
                          <td style={{ padding: "6px 8px" }}>{g.largoTrazo || 0}m × {capasTotalesGrupo(g)}</td>
                          <td style={{ padding: "6px 8px" }}>{g.horaInicioEstimada || "—"} a {g.horaFinEstimada || "—"}</td>
                          <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.slate}`, width: 70 }}></td>
                          <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.slate}`, width: 70 }}></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #area-imprimir, #area-imprimir * { visibility: visible; }
              #area-imprimir { position: absolute; left: 0; top: 0; width: 100%; }
              .hoja-cortador { page-break-after: always; }
              .no-print { display: none !important; }
            }
          `}</style>
        </>
      )}
    </Modal>
  );
}
// Antes era un modal que se abría encima de "Programados Pendientes". Ahora
// es el panel de la pestaña "Programación de Mesones": el cortador entra acá
// (mirando hacia el futuro, cualquier día que tenga algo programado) a
// ingresar los datos teóricos del corte (mesón, trazo, horario...), y un
// analista con el permiso "aprobar_corte" revisa y aprueba antes de que
// cuente como confirmado. `onClose` ahora es "volver a la lista" (deseleccionar),
// no cerrar una ventana emergente.
function ProgramacionMesonPanel({ grupo, plantas, cortadores, telas, estadisticasTela, metrosUsadosMeson, itemsUsadosMeson, onSave, onClose, onGuardado, puedeAprobar, onAprobar, usuarioActual, candidatosVinculo }) {
  const aprobado = grupo.colores.every((c) => c.etapa === "programacion_hecha" && c.aprobado === true);
  const pendienteAprobacion = grupo.colores.every((c) => c.etapa === "programacion_hecha") && !aprobado;
  const aprobadoPorTxt = grupo.colores.find((c) => c.aprobadoPor)?.aprobadoPor;
  const aprobadoFechaTxt = grupo.colores.find((c) => c.aprobadoFechaISO)?.aprobadoFechaISO;
  const ingresadoPorTxt = grupo.colores.find((c) => c.ingresadoPor)?.ingresadoPor;
  const [form, setForm] = useState({
    fechaProgramada: grupo.fechaProgramada || today(),
    planta: grupo.planta || "",
    meson: grupo.meson || "",
    cortador: grupo.cortador || "",
    tipoTela: grupo.tipoTela || "",
    largoTrazo: grupo.largoTrazo ? String(grupo.largoTrazo) : "",
    horaInicioEstimada: grupo.horaInicioEstimada || "",
    horaFinEstimada: grupo.horaFinEstimada || "",
    // Etiqueta libre para distinguir cortes cuando un mismo lote de un día
    // se reparte en más de un corte físico (ej. "Corte 1", "Corte 2") — se
    // guarda tal cual en cada color incluido en ESTE guardado, para poder
    // diferenciarlos después en Ingreso de Corte Real / Históricos.
    numeroCorte: grupo.colores.find((c) => c.numeroCorte)?.numeroCorte || "",
  });
  // Tablero de disponibilidad de mesones (ver más abajo, tableroMesones).
  const [showTablero, setShowTablero] = useState(false);
  // Este panel siempre programa TODOS los colores de `grupo` de una vez — si
  // un lote se necesita partir en varios cortes físicos (distinto mesón/
  // cortador/horario), eso se hace ANTES, con el botón "✂ Partir en cortes"
  // en el Cronograma o en la lista de Producción Corte (ver
  // partirGrupoEnCortes) — ese botón crea de una vez cada corte como un
  // grupo aparte, ya separado, sin depender de que alguien marque/desmarque
  // colores acá (evita errores). Por eso ya no hay selección de colores en
  // este panel: `grupo` que llega acá ya es exactamente lo que se va a
  // cortar.
  const coloresSeleccionados = grupo.colores;
  // Tallas involucradas en esta referencia (unión de las tallas de todos los
  // colores) — ordenadas con el mismo criterio que el resto del sistema.
  const tallasGrupo = ordenarTallas([...new Set(grupo.colores.flatMap((c) => Object.keys(c.tallas || {})))]);
  // Curva de tallas: cuántas veces se marca cada talla dentro de un mismo
  // trazo — es UNA sola para todo el trazo, compartida por todos los
  // colores (todos se tienden y cortan juntos con la misma disposición).
  const [curva, setCurva] = useState(() => {
    const c = {};
    tallasGrupo.forEach((t) => {
      c[t] = grupo.curva?.[t] ? String(grupo.curva[t]) : "";
    });
    return c;
  });
  // Capas por color — a diferencia de planta/mesón/tela/horario (que se
  // comparten entre colores porque se tienden juntos en el mismo trazo),
  // cada color puede tener una cantidad distinta de capas apiladas (ej. más
  // capas de negro que de amarillo si se necesita más negro).
  const [capasPorColor, setCapasPorColor] = useState(() => {
    const c = {};
    grupo.colores.forEach((color) => {
      c[color.id] = color.capas ? String(color.capas) : "";
    });
    return c;
  });
  // Cantidad por docena — cuántas unidades trae empacada cada docena de este
  // color (no siempre son 12: puede variar según cómo venga la mezcla de
  // tallas del empaque). Es un atajo para no calcular capas a mano: apenas
  // se pone este número, se calcula solo cuántas capas hacen falta
  // (capas = cantidad real del color ÷ cantidad por docena) y se rellena el
  // campo de Capas de una vez — sigue siendo editable a mano después, por si
  // hay que ajustarlo.
  const [cantidadPorDocenaPorColor, setCantidadPorDocenaPorColor] = useState(() => {
    const c = {};
    grupo.colores.forEach((color) => {
      c[color.id] = color.cantidadPorDocena ? String(color.cantidadPorDocena) : "";
    });
    return c;
  });
  function actualizarCantidadPorDocena(colorId, valor, cantidadReal) {
    setCantidadPorDocenaPorColor((s) => ({ ...s, [colorId]: valor }));
    const docena = parseFloat(valor) || 0;
    if (docena > 0 && cantidadReal > 0) {
      const capasSugeridas = Math.round(cantidadReal / docena);
      setCapasPorColor((s) => ({ ...s, [colorId]: String(capasSugeridas) }));
    }
  }
  // Qué color tiene desplegado su desglose por talla (curva × capas de ESE
  // color, comparado talla por talla contra lo real del pedido) — null si
  // ninguno. Solo un color abierto a la vez para no saturar la pantalla.
  const [colorAbierto, setColorAbierto] = useState(null);
  // Referencia VINCULADA — otra referencia (de cualquier pedido/cliente)
  // que se tiende/corta EN EL MISMO trazo físico que `grupo` (ej. dos
  // referencias chiquitas que se acomodan juntas en un mesón para no
  // desperdiciar tela). Cuando hay vínculo, planta/mesón/tela/trazo/
  // horario/capas son UN SOLO valor compartido entre las dos referencias
  // (es el mismo corte físico) — lo único que cambia por referencia es su
  // propia curva de tallas (cuántas piezas de esa ref salen por capa). Sin
  // vínculo, todo funciona exactamente igual que antes (capas por color,
  // etc.) — esto es puramente aditivo.
  const [refVinculada, setRefVinculada] = useState(null);
  const [pickerVinculoAbierto, setPickerVinculoAbierto] = useState(false);
  const [busquedaVinculo, setBusquedaVinculo] = useState("");
  const tallasVinculada = refVinculada
    ? ordenarTallas([...new Set(refVinculada.colores.flatMap((c) => Object.keys(c.tallas || {})))])
    : [];
  const [curvaVinculada, setCurvaVinculada] = useState({});
  // Capas COMPARTIDAS — solo se usa cuando hay una referencia vinculada
  // (reemplaza a `capasPorColor` para TODOS los colores de ambas
  // referencias mientras dure el vínculo). Se precarga con lo que ya
  // tuviera el primer color de `grupo`, si lo había.
  const [capasCompartidas, setCapasCompartidas] = useState(() => {
    const primero = grupo.colores[0];
    return primero?.capas ? String(primero.capas) : "";
  });
  function elegirVinculo(g) {
    setRefVinculada(g);
    const tallasG = ordenarTallas([...new Set(g.colores.flatMap((c) => Object.keys(c.tallas || {})))]);
    const cv = {};
    tallasG.forEach((t) => { cv[t] = g.curva?.[t] ? String(g.curva[t]) : ""; });
    setCurvaVinculada(cv);
    setPickerVinculoAbierto(false);
    setBusquedaVinculo("");
  }
  function quitarVinculo() {
    setRefVinculada(null);
    setCurvaVinculada({});
  }
  const marcadasVinculada = tallasVinculada.reduce((s, t) => s + (parseInt(curvaVinculada[t]) || 0), 0);
  const plantaSel = plantas.find((p) => p.nombre === form.planta);
  const mesones = plantaSel?.mesones || [];
  const mesonSel = mesones.find((m) => m.id === form.meson);
  const grupoMeson = mesonSel?.grupoId ? (plantaSel?.grupos || []).find((g) => g.id === mesonSel.grupoId) : null;
  // Marcadas = suma de la curva (cuántas prendas salen por cada capa que se
  // corta, sumando todas las tallas). Con eso y las capas de cada color se
  // calcula cuánto sale cortado — la comprobación es contra lo que
  // realmente pidió el cliente para ese color (grupo.colores[i].tallas /
  // cantidadProgramada), no al revés: el pedido manda, la curva es ayuda
  // para decidir cuántas capas tender.
  const marcadas = tallasGrupo.reduce((s, t) => s + (parseInt(curva[t]) || 0), 0);
  // Capas de un color de `grupo`: normalmente por color (capasPorColor);
  // cuando hay una referencia vinculada, las capas son UN SOLO valor
  // compartido (capasCompartidas) para todos los colores de ambas
  // referencias — ver nota en el estado de refVinculada.
  function capasDeColor(color) {
    return refVinculada ? parseFloat(capasCompartidas) || 0 : parseFloat(capasPorColor[color.id]) || 0;
  }
  function calcColor(color) {
    const capasColor = capasDeColor(color);
    const prendasCalculadas = capasColor * marcadas;
    const metrosColor = (parseFloat(form.largoTrazo) || 0) * capasColor;
    const cantidadReal = color.cantidadProgramada ?? color.cantidadPendiente ?? 0;
    return { capasColor, prendasCalculadas, metrosColor, cantidadReal, diff: prendasCalculadas - cantidadReal };
  }
  // Mismo cálculo que calcColor, pero para un color de la referencia
  // VINCULADA — usa la curva propia de esa referencia (marcadasVinculada),
  // no la de `grupo`, aunque las capas sí son las mismas (compartidas).
  function calcColorVinculada(color) {
    const capasColor = parseFloat(capasCompartidas) || 0;
    const prendasCalculadas = capasColor * marcadasVinculada;
    const metrosColor = (parseFloat(form.largoTrazo) || 0) * capasColor;
    const cantidadReal = color.cantidadProgramada ?? color.cantidadPendiente ?? 0;
    return { capasColor, prendasCalculadas, metrosColor, cantidadReal, diff: prendasCalculadas - cantidadReal };
  }
  // Metros totales del trazo = suma de los metros de cada color (mismo largo
  // de trazo, distinta cantidad de capas cada uno) — si hay referencia
  // vinculada, suma también sus colores (mismo trazo físico para ambas).
  function metrosTotales() {
    const propios = coloresSeleccionados.reduce((s, c) => s + calcColor(c).metrosColor, 0);
    const vinculados = refVinculada ? refVinculada.colores.reduce((s, c) => s + calcColorVinculada(c).metrosColor, 0) : 0;
    return propios + vinculados;
  }
  // La capacidad del mesón (10m, 14m compartidos entre Mesón 2+3...) es el
  // LARGO de la mesa donde se tiende el trazo — no los metros totales de
  // tela consumida. Un trazo de 8m cabe en una mesa de 10m sin importar si
  // encima se apilan 40 capas o 200, así que lo que se compara contra la
  // capacidad es largoTrazo solo, no largoTrazo × capas.
  const largoTrazoNum = parseFloat(form.largoTrazo) || 0;
  // Dentro de un grupo compartido, cada mesón conserva su propio tope
  // individual (ej. Mesón 2 hasta 14m, Mesón 3 hasta 7m) ADEMÁS del total
  // compartido entre los dos (ej. 14m) — un corte tiene que caber en las DOS
  // cosas a la vez: no pasarse de su propio tope, y no pasarse de lo que
  // quede libre del total compartido. "capacidad" (lo que se muestra en
  // pantalla) es el tope propio del mesón elegido; "capacidadCompartida" es
  // el total del grupo, solo aplica si está agrupado.
  const capacidad = mesonSel ? mesonSel.metros : null;
  const capacidadCompartida = grupoMeson ? grupoMeson.metros : null;
  // Los colores de ESTE corte comparten un solo trazo físico, así que se
  // excluyen TODOS sus docs (no solo uno) al calcular lo ya reservado en el
  // mesón — si no, el propio trazo se restaría de la capacidad. Los colores
  // de la misma referencia que quedaron en OTRO corte (ya guardado con su
  // propio mesón/horario) no se excluyen — su reserva cuenta normal, como
  // la de cualquier otro trazo. Si hay referencia vinculada, sus colores
  // también se excluyen (mismo trazo).
  const idsGrupo = coloresSeleccionados.map((c) => c.id).concat(refVinculada ? refVinculada.colores.map((c) => c.id) : []);
  // Horas estimadas — obligatorias para guardar. Además de bloquear el
  // guardado (ver horasFaltantes/horasInvalidas más abajo), son las que
  // definen qué otros cortes de ese mesón "compiten" por el mismo espacio.
  const horasFaltantes = !form.horaInicioEstimada || !form.horaFinEstimada;
  const horasInvalidas = !horasFaltantes && form.horaFinEstimada <= form.horaInicioEstimada;
  // Un mesón NO se ocupa el día entero por un solo trazo — se ocupa solo
  // durante la franja de horario en la que está tendido/en corte. Por eso la
  // disponibilidad real se compara contra los cortes cuyo horario SE CRUZA
  // con el horario que se está programando ahora mismo (ej: si un trazo de
  // 10m ya ocupó el mesón de 8 a 10, de 10 a 12 el mesón vuelve a estar
  // libre por completo), no contra el total del día. Un corte sin horario
  // conocido (de antes de que fuera obligatorio) se asume conservadoramente
  // que ocupa todo el día, para no arriesgar un choque real. Mientras en
  // este formulario todavía no se haya elegido horario, se muestra el total
  // ocupado del día completo como referencia — no bloquea nada, para eso ya
  // está horasFaltantes en el botón de Guardar.
  function seCruzaConHorario(item) {
    if (!item.horaInicioEstimada || !item.horaFinEstimada) return true;
    if (horasFaltantes) return true;
    return form.horaInicioEstimada < item.horaFinEstimada && item.horaInicioEstimada < form.horaFinEstimada;
  }
  // Calcula, para UN mesón puntual (agrupado o no), qué hay ocupado que se
  // cruza con el horario actual y cuánto queda realmente disponible. Se usa
  // tanto para el mesón elegido en el formulario como para cada fila del
  // tablero de disponibilidad (ver tableroMesones más abajo) — así los dos
  // usan exactamente la misma cuenta. Dentro de un grupo compartido (ej.
  // Mesón 2 hasta 14m, Mesón 3 hasta 7m, 14m compartidos entre los dos), lo
  // ocupado se suma de TODO el grupo (itemsUsadosMeson ya lo hace así), y lo
  // disponible es el menor entre el tope propio del mesón y lo que quede
  // libre del total compartido — un corte tiene que caber en las dos cosas
  // a la vez.
  function calcularDisponibilidad(mesonId, grupoIdMeson, capacidadIndividual, capacidadGrupo) {
    const ocupados = itemsUsadosMeson(form.fechaProgramada, form.planta, mesonId, grupoIdMeson, idsGrupo);
    const ocupadosQueCruzan = ocupados.filter(seCruzaConHorario);
    const usadosAqui = ocupadosQueCruzan.reduce((s, it) => s + (it.largoTrazo || 0), 0);
    const disponibleCompartido = capacidadGrupo !== null ? capacidadGrupo - usadosAqui : null;
    const disponiblePropio = capacidadIndividual !== null ? capacidadIndividual - usadosAqui : null;
    const disponibleFinal =
      disponibleCompartido !== null && disponiblePropio !== null
        ? Math.min(disponibleCompartido, disponiblePropio)
        : disponibleCompartido !== null
        ? disponibleCompartido
        : disponiblePropio;
    return { ocupados, usados: usadosAqui, disponible: disponibleFinal };
  }
  const calcMesonSel = mesonSel
    ? calcularDisponibilidad(form.meson, mesonSel.grupoId, capacidad, capacidadCompartida)
    : { ocupados: [], usados: 0, disponible: null };
  const ocupadosMeson = calcMesonSel.ocupados;
  const usados = calcMesonSel.usados;
  const disponible = calcMesonSel.disponible;
  const excedeCapacidad = disponible !== null && largoTrazoNum > disponible;
  const stats = estadisticasTela[form.tipoTela];
  const tiempoTeorico = stats?.minPorMetro && metrosTotales() > 0 ? Math.round(stats.minPorMetro * metrosTotales()) : null;
  // Tendido: no hay historial real todavía (nunca se ha cronometrado), así
  // que se estima con una regla fija de 20 segundos por metro de trazo, por
  // capa — igual que el corte, escala con los metros totales (trazo×capas).
  const TENDIDO_SEG_POR_METRO = 20;
  const tendidoEstimadoMin = metrosTotales() > 0 ? Math.round((TENDIDO_SEG_POR_METRO / 60) * metrosTotales()) : null;
  const tiempoTotalEstimadoMin = tendidoEstimadoMin !== null ? tendidoEstimadoMin + (tiempoTeorico || 0) : null;
  const telasDatalistId = `telas-prog-hecha-${grupo.pedidoId}-${grupo.ref}`;
  const cantidadTotal = grupo.colores.reduce((s, c) => s + (c.cantidadProgramada ?? c.cantidadPendiente ?? 0), 0);
  // Cantidad de SOLO los colores marcados para este corte — cuando el lote
  // se reparte en varios cortes, esto es lo que de verdad se va a tender/
  // cortar ahora (cantidadTotal sigue siendo el total de la referencia
  // completa, para que el usuario vea las dos cifras).
  const cantidadEsteCorte = coloresSeleccionados.reduce((s, c) => s + (c.cantidadProgramada ?? c.cantidadPendiente ?? 0), 0);
  // Tablero de disponibilidad: lista CADA mesón de esta planta por separado
  // (incluso los que comparten grupo, como Mesón 2 y Mesón 3) porque cada
  // uno conserva su propio tope individual además del total compartido — su
  // disponibilidad real puede ser distinta aunque estén en el mismo grupo.
  const tableroMesones = plantaSel
    ? mesones.map((m) => {
        const g = m.grupoId ? (plantaSel.grupos || []).find((gr) => gr.id === m.grupoId) : null;
        return {
          id: m.id,
          mesonId: m.id,
          grupoId: g?.id || null,
          nombre: m.nombre,
          nombreGrupo: g?.nombre || null,
          capacidad: m.metros,
          capacidadCompartida: g?.metros ?? null,
          compartido: !!g,
        };
      })
    : [];
  function autocompletarHoraFin() {
    if (!form.horaInicioEstimada || !tiempoTotalEstimadoMin) return;
    const [h, m] = form.horaInicioEstimada.split(":").map(Number);
    let total = h * 60 + m + tiempoTotalEstimadoMin;
    total = Math.min(total, 23 * 60 + 59);
    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    setForm((f) => ({ ...f, horaFinEstimada: `${hh}:${mm}` }));
  }
  // Todos los colores de la referencia se tienden y cortan juntos, así que
  // comparten planta/mesón/cortador/tela/trazo/capas/horas — se guarda el
  // mismo `datosComunes` en cada uno de sus docs de corte_programacion, cada
  // uno conservando su propia cantidad (ya definida por color al programar).
  function save() {
    if (!coloresSeleccionados.length || !form.planta || !form.meson || !form.cortador || !form.fechaProgramada || excedeCapacidad || horasFaltantes || horasInvalidas) return;
    // Curva limpia: solo tallas con un número puesto, guardada como objeto
    // { talla: cantidad } para poder mostrarla igual en Ingreso de Corte
    // Real / Históricos.
    const curvaLimpia = {};
    tallasGrupo.forEach((t) => {
      const v = parseInt(curva[t]) || 0;
      if (v > 0) curvaLimpia[t] = v;
    });
    // Si hay referencia vinculada, todos los docs de AMBAS referencias
    // llevan el mismo `vinculoTrazoId` — así "Ingreso de Corte Real" y
    // "Cortes Aprobados" pueden reconocer que comparten el mismo trazo
    // físico, aunque sean de pedidos distintos.
    const vinculoTrazoId = refVinculada ? uid() : null;
    const datosComunes = {
      fechaProgramada: form.fechaProgramada,
      planta: form.planta,
      meson: form.meson,
      mesonGrupo: mesonSel?.grupoId || "",
      cortador: form.cortador,
      tipoTela: form.tipoTela,
      largoTrazo: parseFloat(form.largoTrazo) || 0,
      curva: curvaLimpia,
      marcadas,
      metrosTendido: metrosTotales(),
      horaInicioEstimada: form.horaInicioEstimada,
      horaFinEstimada: form.horaFinEstimada,
      tiempoTeoricoMin: tiempoTeorico,
      tendidoEstimadoMin: tendidoEstimadoMin,
      tiempoTotalEstimadoMin: tiempoTotalEstimadoMin,
      vinculoTrazoId,
      // Etiqueta de corte (ej. "Corte 1") cuando el lote se reparte en más
      // de un corte físico — vacío/null si no aplica.
      numeroCorte: form.numeroCorte?.trim() || null,
      // Cada vez que se guarda (sea la primera vez o una edición posterior a
      // una aprobación), queda "pendiente de aprobación" de nuevo — si los
      // datos cambiaron, el analista tiene que revisarlos otra vez.
      aprobado: false,
      aprobadoPor: null,
      aprobadoFechaISO: null,
      ingresadoPor: usuarioActual || null,
      ingresadoFechaISO: new Date().toISOString(),
    };
    // Capas es por color: cada color guarda su propia cantidad de capas y
    // sus propios metros calculados (mismo largo de trazo para todos). Si
    // hay referencia vinculada, capasDeColor devuelve la compartida para
    // todos por igual. Solo se guardan los colores marcados para ESTE corte
    // — los demás (si el lote se repartió en varios cortes) quedan sin
    // tocar, pendientes para cuando se programe su propio corte.
    coloresSeleccionados.forEach((c) => {
      const { capasColor, metrosColor } = calcColor(c);
      const cantidadPorDocena = parseFloat(cantidadPorDocenaPorColor[c.id]) || null;
      onSave(c.id, { ...datosComunes, capas: capasColor, metrosTendido: metrosColor, cantidadPorDocena });
    });
    // Referencia vinculada: mismos datos comunes (planta/mesón/tela/trazo/
    // capas/horario/vinculoTrazoId), pero con SU PROPIA curva de tallas —
    // el pedido y la referencia quedan tal cual traía cada color.
    if (refVinculada) {
      const curvaVinculadaLimpia = {};
      tallasVinculada.forEach((t) => {
        const v = parseInt(curvaVinculada[t]) || 0;
        if (v > 0) curvaVinculadaLimpia[t] = v;
      });
      refVinculada.colores.forEach((c) => {
        const { capasColor, metrosColor } = calcColorVinculada(c);
        onSave(c.id, {
          ...datosComunes,
          curva: curvaVinculadaLimpia,
          marcadas: marcadasVinculada,
          capas: capasColor,
          metrosTendido: metrosColor,
        });
      });
    }
    // Al guardar (a diferencia de "‹ Volver a la lista", que solo
    // deselecciona) se navega directo a "Ingreso de Corte Real" — ahí
    // queda visible en cola (todavía como "sin aprobar"/"falta lote" hasta
    // que el analista y el patronista hagan lo suyo).
    if (onGuardado) onGuardado();
    else onClose();
  }
  return (
    <Modal
      title={
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>
            🔧 {grupo.cliente} · #{grupo.numero} · {grupo.ref}
            {refVinculada && (
              <span style={{ color: C.violet }}> + {refVinculada.cliente} · #{refVinculada.numero} · {refVinculada.ref}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2, fontWeight: 400 }}>
            {grupo.colores.length} color{grupo.colores.length !== 1 ? "es" : ""} · Cantidad total {fmtNum(cantidadTotal)}
            {refVinculada && (
              <span style={{ color: C.violet, fontWeight: 700 }}> · vinculada con otra referencia en el mismo trazo</span>
            )}
          </div>
        </div>
      }
      onClose={onClose}
      width={980}
    >
      {aprobado && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 700, background: C.greenBg, color: C.green }}>
          ✓ Aprobada Analista{aprobadoPorTxt ? ` por ${aprobadoPorTxt}` : ""}{aprobadoFechaTxt ? ` el ${fmtFechaISO(aprobadoFechaTxt.slice(0, 10))}` : ""}. Si cambias y guardas los datos, vuelve a quedar pendiente de aprobación.
        </div>
      )}
      {pendienteAprobacion && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 700, background: C.amberBg, color: C.amber, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>
            ⏳ Pendiente de aprobación{ingresadoPorTxt ? ` — ingresado por ${ingresadoPorTxt}` : ""}. Un analista con permiso de aprobar Corte debe revisarlo.
          </span>
          {puedeAprobar && (
            <Btn
              variant="success"
              onClick={async () => {
                await onAprobar();
                // Al aprobar, se navega directo a "Ingreso de Corte Real" —
                // ahí ya queda "Listo para cortar".
                if (onGuardado) onGuardado();
                else onClose();
              }}
            >
              ✓ Aprobado por Analista
            </Btn>
          )}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* ── Columna izquierda: datos teóricos del corte ── */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Field label="Fecha Programada">
              <FInput
                type="date"
                value={form.fechaProgramada}
                onChange={(v) => setForm((f) => ({ ...f, fechaProgramada: v }))}
              />
            </Field>
            <Field label={coloresSeleccionados.length < grupo.colores.length ? "Cantidad de este corte" : "Cantidad Programada (total)"}>
              <div
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${C.border}`,
                  background: C.canvas,
                  fontWeight: 800,
                  color: C.ink,
                  fontSize: 13,
                }}
              >
                {fmtNum(cantidadEsteCorte)}
                {coloresSeleccionados.length < grupo.colores.length && (
                  <span style={{ fontWeight: 400, color: C.slate }}> de {fmtNum(cantidadTotal)} en total</span>
                )}
              </div>
            </Field>
          </div>
          {/* Cuando el lote de esta referencia se va a cortar en más de un
              corte físico (distinto mesón/cortador/horario), esta etiqueta
              libre distingue cuál corte es cuál en Ingreso de Corte Real /
              Históricos — opcional, se puede dejar en blanco si no aplica. */}
          <div style={{ marginBottom: 16 }}>
            <Field label="N° de Corte (opcional, si este lote se reparte en varios cortes)">
              <FInput
                value={form.numeroCorte}
                onChange={(v) => setForm((f) => ({ ...f, numeroCorte: v }))}
                placeholder="Ej: Corte 1"
              />
            </Field>
          </div>
          {/* Referencia vinculada: otra referencia (de cualquier pedido) que
              se tiende/corta en el MISMO trazo físico que esta — comparten
              planta/mesón/tela/trazo/capas/horario, cada una con su propia
              curva de tallas. Solo se pueden vincular referencias del mismo
              día (mesonesFecha), porque comparten mesón y horario. */}
          {!refVinculada ? (
            <div style={{ marginBottom: 16 }}>
              <Btn small variant="secondary" onClick={() => setPickerVinculoAbierto((v) => !v)}>
                + Agregar otra referencia (mismo trazo)
              </Btn>
              {pickerVinculoAbierto && (
                <div style={{ marginTop: 8, padding: 12, borderRadius: 10, border: `1.5px solid ${C.violet}55`, background: C.violetBg }}>
                  <FInput
                    value={busquedaVinculo}
                    onChange={setBusquedaVinculo}
                    placeholder="Buscar por cliente, pedido o referencia..."
                  />
                  <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8, display: "grid", gap: 6 }}>
                    {(candidatosVinculo || [])
                      .filter((g) => g.key !== grupo.key)
                      .filter((g) => {
                        const q = busquedaVinculo.trim().toLowerCase();
                        if (!q) return true;
                        return `${g.cliente} ${g.numero} ${g.ref}`.toLowerCase().includes(q);
                      })
                      .map((g) => (
                        <div
                          key={g.key}
                          onClick={() => elegirVinculo(g)}
                          style={{ padding: "8px 10px", borderRadius: 8, background: C.white, cursor: "pointer", fontSize: 12, border: `1px solid ${C.border}` }}
                        >
                          <b>{g.cliente}</b> · #{g.numero} · {g.ref} — {fmtNum(g.cantidadTotal)} unid.
                        </div>
                      ))}
                    {!(candidatosVinculo || []).filter((g) => g.key !== grupo.key).length && (
                      <div style={{ fontSize: 12, color: C.slate, padding: "8px 10px" }}>
                        No hay otras referencias pendientes ese mismo día para vincular.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: `1.5px solid ${C.violet}55`, background: C.violetBg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.violet }}>
                  🔗 Vinculada: {refVinculada.cliente} · #{refVinculada.numero} · {refVinculada.ref}
                </div>
                <Btn small variant="secondary" onClick={quitarVinculo}>Quitar vínculo</Btn>
              </div>
              <div style={{ fontSize: 11, color: C.slate, marginBottom: 8 }}>
                Comparte planta/mesón/tela/trazo/capas/horario con la referencia principal — solo la curva de tallas es propia de esta referencia.
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>
                Curva de Tallas de {refVinculada.ref}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                {tallasVinculada.map((t) => (
                  <Field key={t} label={t}>
                    <FInput
                      type="number"
                      value={curvaVinculada[t] || ""}
                      onChange={(v) => setCurvaVinculada((c) => ({ ...c, [t]: v }))}
                      placeholder="0"
                    />
                  </Field>
                ))}
                <div
                  style={{
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${C.border}`,
                    background: C.white,
                    fontWeight: 800,
                    color: marcadasVinculada > 0 ? C.violet : C.slate,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                  }}
                >
                  Marcadas: {marcadasVinculada || "—"}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Field label="Planta">
              <FSel
                value={form.planta}
                onChange={(v) => setForm((f) => ({ ...f, planta: v, meson: "" }))}
                options={plantas.map((p) => ({ id: p.nombre, nombre: p.nombre }))}
              />
            </Field>
            <Field label="Mesón">
              <FSel
                value={form.meson}
                onChange={(v) => setForm((f) => ({ ...f, meson: v }))}
                options={mesones.map((m) => ({ id: m.id, nombre: m.nombre }))}
              />
            </Field>
            <Field label="Cortador">
              <FSel
                value={form.cortador}
                onChange={(v) => setForm((f) => ({ ...f, cortador: v }))}
                options={cortadores.map((c) => ({ id: c.nombre, nombre: c.nombre }))}
              />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Field label="Tipo de Tela">
              <FInput
                value={form.tipoTela}
                onChange={(v) => setForm((f) => ({ ...f, tipoTela: v }))}
                placeholder="Ej: Diamante"
                list={telasDatalistId}
              />
              <datalist id={telasDatalistId}>
                {(telas || []).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Largo del Trazo (1 capa, m)">
              <FInput
                type="number"
                value={form.largoTrazo}
                onChange={(v) => setForm((f) => ({ ...f, largoTrazo: v }))}
                placeholder="4.5"
              />
            </Field>
            <Field label="Metros de Tela (total, todos los colores)">
              <div
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${C.border}`,
                  background: C.canvas,
                  fontWeight: 800,
                  color: metrosTotales() > 0 ? C.violet : C.slate,
                  fontSize: 13,
                }}
              >
                {metrosTotales() > 0 ? `${metrosTotales().toLocaleString("es-CO")} m` : "—"}
              </div>
            </Field>
          </div>
          {/* Curva de tallas: una sola para todo el trazo, compartida por
              todos los colores — cuántas veces se repite cada talla dentro
              de una capa/marcada. La suma da "marcadas". */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.slate, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>
              Curva de Tallas (repeticiones por trazo)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              {tallasGrupo.map((t) => (
                <Field key={t} label={t}>
                  <FInput
                    type="number"
                    value={curva[t] || ""}
                    onChange={(v) => setCurva((c) => ({ ...c, [t]: v }))}
                    placeholder="0"
                  />
                </Field>
              ))}
              <div
                style={{
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${C.border}`,
                  background: C.canvas,
                  fontWeight: 800,
                  color: marcadas > 0 ? C.violet : C.slate,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                Marcadas: {marcadas || "—"}
              </div>
            </div>
          </div>
          {/* Capas compartidas: cuando hay referencia vinculada, capas deja
              de ser por color y pasa a ser UN SOLO valor para todo el trazo
              (ambas referencias, todos los colores) — reemplaza al bloque de
              "Capas por Color" de abajo mientras dure el vínculo. */}
          {refVinculada && (
            <div style={{ marginBottom: 16 }}>
              <Field label="Capas (compartidas entre las 2 referencias)">
                <FInput
                  type="number"
                  value={capasCompartidas}
                  onChange={setCapasCompartidas}
                  placeholder="Ej: 40"
                />
              </Field>
            </div>
          )}
          {/* Capas por color: cada color puede tender una cantidad distinta
              de capas. Con capas × marcadas se calcula cuánto sale
              cortado, como comprobación contra la cantidad real del pedido
              (no la reemplaza). Solo aplica sin referencia vinculada — con
              vínculo, capas es un solo valor compartido (ver arriba). */}
          {!refVinculada && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.slate, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>
              Capas por Color
            </div>
            <div style={{ fontSize: 11, color: C.slate, marginBottom: 8 }}>
              Clic en un color para ver el desglose por talla (curva × capas de ese color, comparado talla por talla contra lo real del pedido).
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {grupo.colores.map((c) => {
                const calc = calcColor(c);
                const coincide = marcadas > 0 && calc.capasColor > 0 && calc.diff === 0;
                const hayDatos = marcadas > 0 && calc.capasColor > 0;
                const abierto = colorAbierto === c.id;
                return (
                  <div
                    key={c.id}
                    style={{
                      borderRadius: 8,
                      border: `1.5px solid ${C.border}`,
                      background: C.canvas,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      onClick={() => setColorAbierto(abierto ? null : c.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.1fr 0.8fr 0.8fr 1fr 1fr auto auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 12px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: C.ink, fontSize: 13 }}>
                        {c.descripcion || c.ref || c.color || "—"}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <FInput
                          type="number"
                          value={cantidadPorDocenaPorColor[c.id] || ""}
                          onChange={(v) => actualizarCantidadPorDocena(c.id, v, calc.cantidadReal)}
                          placeholder="Cant. x docena"
                        />
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <FInput
                          type="number"
                          value={capasPorColor[c.id] || ""}
                          onChange={(v) => setCapasPorColor((s) => ({ ...s, [c.id]: v }))}
                          placeholder="Capas"
                        />
                      </div>
                      <div style={{ fontSize: 12, color: C.slate }}>
                        {calc.metrosColor > 0 ? `${calc.metrosColor.toLocaleString("es-CO")} m` : "—"}
                      </div>
                      <div style={{ fontSize: 12, color: C.slate }}>
                        Calc: <b style={{ color: C.ink }}>{hayDatos ? fmtNum(calc.prendasCalculadas) : "—"}</b> / Real: <b style={{ color: C.ink }}>{fmtNum(calc.cantidadReal)}</b>
                      </div>
                      <div style={{ fontSize: 16, textAlign: "center" }}>
                        {!hayDatos ? "" : coincide ? <span style={{ color: C.green }}>✓</span> : <span title={`Diferencia: ${calc.diff > 0 ? "+" : ""}${calc.diff}`} style={{ color: C.amber }}>⚠</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.slate }}>{abierto ? "▲" : "▼"}</div>
                    </div>
                    {abierto && (
                      <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}`, background: C.white }}>
                        {!tallasGrupo.length ? (
                          <div style={{ fontSize: 12, color: C.slate }}>Todavía no hay tallas en la curva.</div>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Talla</th>
                                <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Curva</th>
                                <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Calculado</th>
                                <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Real (pedido)</th>
                                <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Dif</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tallasGrupo.map((t) => {
                                const curvaVal = parseInt(curva[t]) || 0;
                                const calculado = calc.capasColor * curvaVal;
                                const real = c.tallas?.[t] || 0;
                                const diffTalla = calculado - real;
                                return (
                                  <tr key={t} style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <td style={{ padding: "5px 8px", fontWeight: 700, color: C.ink }}>{t}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", color: C.slate }}>{curvaVal || "—"}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{calc.capasColor > 0 ? calculado : "—"}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtNum(real)}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: !calc.capasColor ? C.slate : diffTalla === 0 ? C.green : C.amber }}>
                                      {calc.capasColor > 0 ? `${diffTalla > 0 ? "+" : ""}${diffTalla}` : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}
          {tiempoTotalEstimadoMin !== null && (
            <div style={{ padding: "10px 16px", background: C.violetBg, borderRadius: 8, marginBottom: 16, fontSize: 13, color: C.violet, fontWeight: 700 }}>
              ⏱ Tiempo estimado total: ~{tiempoTotalEstimadoMin} min — tendido ~{tendidoEstimadoMin} min
              {tiempoTeorico !== null
                ? ` + corte ~${tiempoTeorico} min (según ${stats.cortes} corte${stats.cortes !== 1 ? "s" : ""} previo${stats.cortes !== 1 ? "s" : ""} de ${form.tipoTela})`
                : " + corte (todavía sin historial de corte para esta tela, el total solo cuenta el tendido)"}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
            <Field label="Hora Inicio Estimada (obligatorio)">
              <FInput
                type="time"
                value={form.horaInicioEstimada}
                onChange={(v) => setForm((f) => ({ ...f, horaInicioEstimada: v }))}
              />
            </Field>
            <Field label="Hora Fin Estimada (obligatorio)">
              <FInput
                type="time"
                value={form.horaFinEstimada}
                onChange={(v) => setForm((f) => ({ ...f, horaFinEstimada: v }))}
              />
              {form.horaInicioEstimada && tiempoTotalEstimadoMin !== null && (
                <button
                  type="button"
                  onClick={autocompletarHoraFin}
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.violet,
                    background: C.violetBg,
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                  }}
                >
                  ⚡ Autocompletar con tiempo estimado (~{tiempoTotalEstimadoMin} min)
                </button>
              )}
            </Field>
          </div>
          {horasInvalidas && (
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 12 }}>
              ⚠ La Hora Fin debe ser posterior a la Hora Inicio.
            </div>
          )}
          {horasFaltantes && (
            <div style={{ fontSize: 11, color: C.slate, marginBottom: 12 }}>
              Hora Inicio y Hora Fin son obligatorias para guardar — con eso se arma el timeline del mesón.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn
              variant="success"
              onClick={save}
              disabled={!coloresSeleccionados.length || !form.planta || !form.meson || !form.cortador || !form.fechaProgramada || excedeCapacidad || horasFaltantes || horasInvalidas}
            >
              ✓ Guardar datos teóricos del corte{coloresSeleccionados.length < grupo.colores.length ? ` (${coloresSeleccionados.length} de ${grupo.colores.length} colores)` : ""}
            </Btn>
          </div>
        </div>
        {/* ── Columna derecha: el mesón dibujado con su disponibilidad ── */}
        <div>
          {plantaSel && (
            <div style={{ marginBottom: 12 }}>
              <Btn variant="secondary" onClick={() => setShowTablero((v) => !v)}>
                {showTablero ? "Ver solo el mesón elegido" : "📋 Ver disponibilidad de todos los mesones"}
              </Btn>
            </div>
          )}
          {showTablero && plantaSel && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: `1.5px solid ${C.denim}`, background: C.denimBg }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.denim, marginBottom: 10 }}>
                Mesones de {plantaSel.nombre} el {fmtFechaISO(form.fechaProgramada)}
                {!horasFaltantes && ` — franja resaltada en violeta: ${form.horaInicioEstimada} a ${form.horaFinEstimada}`}
                {horasFaltantes && " — elige primero la hora de inicio/fin para ver resaltada tu franja."}
              </div>
              {tableroMesones.map((fila) => {
                const calc = calcularDisponibilidad(fila.mesonId, fila.grupoId, fila.capacidad, fila.capacidadCompartida);
                const cabeAqui = largoTrazoNum > 0 && calc.disponible !== null && largoTrazoNum <= calc.disponible;
                return (
                  <div key={fila.id}>
                    <MesonTimeline
                      nombre={fila.compartido ? `${fila.nombre} (tope propio ${fila.capacidad}m, dentro de ${fila.nombreGrupo})` : fila.nombre}
                      capacidad={fila.capacidad}
                      compartido={fila.compartido}
                      ocupados={calc.ocupados}
                      inicioActual={form.horaInicioEstimada}
                      finActual={form.horaFinEstimada}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -10, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: calc.disponible !== null && calc.disponible <= 0 ? C.red : C.green }}>
                        {calc.disponible !== null ? `${Math.max(0, calc.disponible)}m disponibles ahí ahora` : ""}
                        {largoTrazoNum > 0 && calc.disponible !== null && (cabeAqui ? " — tu trazo cabe" : " — tu trazo NO cabe aquí")}
                      </div>
                      <Btn
                        variant={form.meson === fila.mesonId ? "success" : "secondary"}
                        onClick={() => { setForm((f) => ({ ...f, meson: fila.mesonId })); setShowTablero(false); }}
                      >
                        {form.meson === fila.mesonId ? "✓ Elegido" : "Usar este mesón"}
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {mesonSel && capacidad !== null && (
            <div
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 12,
                fontWeight: 700,
                background: excedeCapacidad ? C.redBg : C.greenBg,
                color: excedeCapacidad ? C.red : C.green,
              }}
            >
              {excedeCapacidad ? "⚠ " : "✓ "}
              {mesonSel.nombre}
              {grupoMeson ? ` (tope propio ${capacidad}m, dentro de ${grupoMeson.nombre} de ${capacidadCompartida}m compartidos)` : ""}
              : {usados}m de trazo ya reservados el {fmtFechaISO(form.fechaProgramada)} — quedan {Math.max(0, disponible ?? 0)}m disponibles ahí
              {horasFaltantes && " (sin horario elegido todavía — se muestra el total del día como referencia)"}
              {excedeCapacidad && ` — este trazo de ${largoTrazoNum}m no cabe en esa franja. Puedes apilar las capas que quieras, lo que no cabe es el largo del trazo.`}
            </div>
          )}
          {mesonSel && capacidad !== null && (
            <MesonTimeline
              nombre={grupoMeson ? grupoMeson.nombre : mesonSel.nombre}
              capacidad={capacidad}
              compartido={!!grupoMeson}
              ocupados={ocupadosMeson}
              inicioActual={form.horaInicioEstimada}
              finActual={form.horaFinEstimada}
            />
          )}
          {!plantaSel && (
            <div style={{ padding: 20, textAlign: "center", color: C.slate, fontSize: 12, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
              Elige una planta a la izquierda para ver los mesones y su disponibilidad acá.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
// ─── DETALLE PEDIDO ───────────────────────────────────────────────────────────
function DetallePedido({
  pedido,
  plantas,
  cortadores,
  telas,
  nominaConfig,
  preciosMap,
  lotesExistentes,
  onGuardarLote,
  preseleccion,
  onConsumirPreseleccion,
  onBack,
  onSave,
  onCorteRegistrado,
  vpRefMap,
  lotesCortadoMap,
}) {
  const [showCorte, setShowCorte] = useState(false);
  // Si venimos del botón "✂ Cortar" de un ítem ya programado, abrir el
  // formulario de Programar Corte directo, ya con esa referencia/tallas
  // cargadas (ProgramarCorteModal las toma de `preseleccion`).
  useEffect(() => {
    if (preseleccion) setShowCorte(true);
  }, [preseleccion]);
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();
  const dh = diasHabiles(mes, anio);
  const nominaMensual = (nominaConfig?.trabajadores || []).reduce(
    (s, t) => s + (t.sueldo || 0),
    0
  );
  const costoDia = nominaMensual / dh;
  // Cruza Planeación + Ventas Perdidas (Busint) + Corte propio — mismo
  // criterio que usa la Cola Sugerida y Programación de Corte — para que
  // "Total Cortado"/"Avance" no se queden en 0 solo porque nadie registró
  // el corte a mano acá, si Busint ya reporta que se cortó de verdad.
  const { totalPedido, totalCortado, porRef: porRefCortado } = calcularCortadoPendiente(pedido, vpRefMap, lotesCortadoMap);
  const pct =
    totalPedido > 0 ? Math.round((totalCortado / totalPedido) * 100) : 0;
  const sem = semaforo(pedido.fechaDespacho);
  // Columnas de talla de la tabla de abajo — se arman con las tallas reales
  // que traen las referencias de este pedido (no el catálogo fijo
  // TALLAS_BUSINT, que no coincide con lo que manda Busint), ordenadas de
  // forma lógica (ver ordenarTallas).
  const tallasTabla = ordenarTallas([
    ...new Set(pedido.referencias.flatMap((r) => Object.keys(r.tallas || {}))),
  ]);
  // "Cortado"/"Excedente" de cada referencia (columnas de la tabla) salen
  // del cruce completo — Planeación + Ventas Perdidas (Busint) + Corte
  // propio — calculado arriba en porRefCortado con calcularCortadoPendiente
  // (mismo criterio que usa la Cola Sugerida), no solo lo registrado a
  // mano acá.
  function cortadoPendienteRef(refId) {
    return porRefCortado.find((r) => r.refId === refId) || null;
  }
  function registrarCorte(corte) {
    const updated = {
      ...pedido,
      cortesRealizados: [...(pedido.cortesRealizados || []), corte],
    };
    const totalC = updated.cortesRealizados.reduce(
      (s, c) => s + (c.totalUnidades || 0),
      0
    );
    // Al llegar al 100% se marca "terminado" (corte completo), NO "cerrado"
    // — "cerrado" queda reservado para cuando Busint confirma el cierre real
    // del pedido (vía "🧊 Congelar como base de Corte" en Vigentes por
    // Cliente, o a mano desde el detalle en Pedidos).
    if (totalC >= totalPedido && updated.estado === "activo") {
      updated.estado = "terminado";
      updated.fechaCumplido = today();
    }
    onSave(updated);
  }
  return (
    <div>
      {showCorte && (
        <ProgramarCorteModal
          pedido={pedido}
          plantas={plantas}
          cortadores={cortadores}
          telas={telas}
          preciosMap={preciosMap}
          lotesExistentes={lotesExistentes}
          onGuardarLote={onGuardarLote}
          preseleccion={preseleccion}
          onSave={registrarCorte}
          onClose={() => {
            setShowCorte(false);
            if (preseleccion) onConsumirPreseleccion?.();
          }}
          onGuardado={() => {
            setShowCorte(false);
            if (preseleccion) onConsumirPreseleccion?.();
            // Al terminar de registrar el corte real, se va directo a
            // "Cortes Aprobados" para que el patronista lo ingrese a Busint
            // y le ponga el lote.
            onCorteRegistrado?.();
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: C.canvas,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "6px 14px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          ← Volver
        </button>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              color: C.slate,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Pedido N° {pedido.numero}
          </div>
          <h2
            style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.ink }}
          >
            {pedido.cliente}
          </h2>
        </div>
        <div
          style={{
            padding: "6px 14px",
            background: sem.bg,
            color: sem.color,
            borderRadius: 20,
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          📅 {pedido.fechaDespacho} · {sem.label}
        </div>
        {pedido.estado === "terminado" && (
          <span style={{ padding: "6px 14px", background: C.greenBg, color: C.green, borderRadius: 20, fontWeight: 800, fontSize: 13 }}>
            🏁 TERMINADO
          </span>
        )}
        {pedido.estado !== "cerrado" && (
          <Btn variant="cyan" onClick={() => setShowCorte(true)}>
            ✂ Programar Corte
          </Btn>
        )}
        {pedido.estado === "activo" && (
          <Btn
            variant="success"
            onClick={() => onSave({ ...pedido, estado: "terminado", fechaCumplido: today() })}
          >
            🏁 Marcar Terminado
          </Btn>
        )}
        {pedido.estado === "terminado" && (
          <Btn variant="secondary" small onClick={() => onSave({ ...pedido, estado: "activo" })}>
            ↩ Deshacer Terminado
          </Btn>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <KPICard
          icon="📦"
          label="Total Pedido"
          value={fmtNum(totalPedido)}
          color={C.blue}
          bg={C.blueBg}
        />
        <KPICard
          icon="✂"
          label="Total Cortado"
          value={fmtNum(totalCortado)}
          color={C.green}
          bg={C.greenBg}
        />
        <KPICard
          icon="⏳"
          label="Pendiente"
          value={fmtNum(totalPedido - totalCortado)}
          color={C.amber}
          bg={C.amberBg}
        />
        <KPICard
          icon="📊"
          label="Avance"
          value={`${pct}%`}
          color={pct === 100 ? C.green : C.blue}
          bg={pct === 100 ? C.greenBg : C.blueBg}
        />
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 5,
          background: C.border,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: pct === 100 ? C.green : C.blue,
            transition: "width 0.4s",
          }}
        />
      </div>
      {/* Referencias con excedentes */}
      <div
        style={{
          background: C.white,
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: C.ink,
            marginBottom: 14,
          }}
        >
          Referencias y Excedentes
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
          >
            <thead>
              <tr style={{ background: C.ink }}>
                <th
                  style={{
                    padding: "8px 10px",
                    color: C.seam,
                    textAlign: "left",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  Ref
                </th>
                <th
                  style={{
                    padding: "8px 10px",
                    color: C.seam,
                    textAlign: "left",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  Descripción
                </th>
                {tallasTabla.map((t) => (
                  <th
                    key={t}
                    style={{
                      padding: "8px 6px",
                      color: C.seam,
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: 10,
                    }}
                  >
                    {t}
                  </th>
                ))}
                <th
                  style={{
                    padding: "8px 10px",
                    color: C.seam,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  Total
                </th>
                <th
                  style={{
                    padding: "8px 10px",
                    color: C.seam,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  Cortado
                </th>
                <th
                  style={{
                    padding: "8px 10px",
                    color: C.seam,
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  Excedente
                </th>
              </tr>
            </thead>
            <tbody>
              {pedido.referencias.map((ref, i) => {
                const cp = cortadoPendienteRef(ref.id);
                const cortadoRef = cp ? cp.cortado : 0;
                const totalExc = cp ? cp.pendiente : ref.total;
                return (
                  <tr
                    key={ref.id}
                    style={{
                      background: i % 2 === 0 ? C.canvas : C.white,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        fontWeight: 700,
                        color: C.ink,
                      }}
                    >
                      {ref.ref}
                    </td>
                    <td style={{ padding: "8px 10px", color: C.slate }}>
                      {ref.descripcion}
                    </td>
                    {tallasTabla.map((t) => (
                      <td
                        key={t}
                        style={{
                          padding: "8px 6px",
                          textAlign: "center",
                          color: ref.tallas[t] > 0 ? C.ink : C.border,
                        }}
                      >
                        {ref.tallas[t] || "—"}
                      </td>
                    ))}
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        fontWeight: 800,
                        color: C.blue,
                      }}
                    >
                      {ref.total}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        fontWeight: 700,
                        color: C.green,
                      }}
                    >
                      {cortadoRef}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        fontWeight: 700,
                        color: totalExc > 0 ? C.amber : C.green,
                      }}
                    >
                      {totalExc > 0 ? totalExc : "✓"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* Historial de cortes */}
      {(pedido.cortesRealizados || []).length > 0 && (
        <div
          style={{
            background: C.white,
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            padding: 20,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: C.ink,
              marginBottom: 14,
            }}
          >
            Cortes Realizados
          </div>
          {pedido.cortesRealizados.map((corte, i) => (
            <div
              key={corte.id}
              style={{
                padding: "14px 16px",
                background: C.canvas,
                borderRadius: 10,
                marginBottom: 10,
                border: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 800, color: C.ink }}>
                    Corte #{i + 1}
                  </span>
                  <span
                    style={{ color: C.slate, marginLeft: 12, fontSize: 13 }}
                  >
                    {corte.fecha} · {corte.planta} · {corte.cortador}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span
                    style={{ fontSize: 12, color: C.green, fontWeight: 700 }}
                  >
                    {fmtNum(corte.totalUnidades)} uds
                  </span>
                  <span
                    style={{ fontSize: 12, color: C.blue, fontWeight: 700 }}
                  >
                    {fmtCOP(corte.ingresoCorte)}
                  </span>
                </div>
              </div>
              {corte.tipoTela && (
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    fontSize: 11,
                    color: C.slate,
                    flexWrap: "wrap",
                  }}
                >
                  <span>🧵 {corte.tipoTela}</span>
                  {corte.largoTrazo > 0 && corte.capas > 0 ? (
                    <span>
                      📐 {corte.largoTrazo}m × {corte.capas} capas = {corte.metrosTendido}m
                    </span>
                  ) : (
                    <>
                      {corte.metrosTendido > 0 && <span>📏 {corte.metrosTendido}m</span>}
                      {corte.capas > 0 && <span>📚 {corte.capas} capas</span>}
                    </>
                  )}
                  {corte.minutos > 0 && (
                    <span>
                      ⏱ {corte.minutos} min{" "}
                      {corte.metrosTendido > 0
                        ? `· ${(corte.minutos / corte.metrosTendido).toFixed(
                            1
                          )} min/m`
                        : ""}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {/* KPI del día */}
          <div
            style={{
              marginTop: 16,
              padding: "14px 16px",
              background: C.greenBg,
              borderRadius: 10,
              border: `1px solid ${C.green}44`,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: C.ink,
                marginBottom: 10,
              }}
            >
              KPI Acumulado del Pedido
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 10,
              }}
            >
              {[
                {
                  label: "Ingreso Corte",
                  value: fmtCOP(
                    (pedido.cortesRealizados || []).reduce(
                      (s, c) => s + (c.ingresoCorte || 0),
                      0
                    )
                  ),
                  color: C.green,
                },
                {
                  label: "Costo Nómina/Día",
                  value: fmtCOP(costoDia),
                  color: C.amber,
                },
                {
                  label: "Rentabilidad Día",
                  value: fmtCOP(
                    (pedido.cortesRealizados || []).reduce(
                      (s, c) => s + (c.ingresoCorte || 0),
                      0
                    ) - costoDia
                  ),
                  color: C.blue,
                },
                {
                  label: "Costo/Prenda",
                  value:
                    totalCortado > 0 ? fmtCOP(costoDia / totalCortado) : "—",
                  color: C.violet,
                },
              ].map((k) => (
                <div key={k.label} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.slate,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {k.label}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: k.color,
                      marginTop: 2,
                    }}
                  >
                    {k.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── ADMIN CORTE ──────────────────────────────────────────────────────────────
function AdminCorte({ config, onSave, onReiniciarCortes, currentUser, ultimaCargaPrecios }) {
  const [reiniciando, setReiniciando] = useState(false);
  const [resultReinicio, setResultReinicio] = useState(null);
  // Botón temporal de limpieza de pruebas — borra TODO lo registrado de
  // cortes (lotes, Programación de Mesones, cortes reales de cada pedido).
  // Es irreversible, por eso pide doble confirmación antes de tocar nada.
  async function handleReiniciarCortes() {
    const ok1 = window.confirm(
      "Esto borra TODOS los lotes, TODA la Programación de Mesones (planta/mesón/trazo/aprobaciones) y vacía los cortes reales registrados en TODOS los pedidos. No se puede deshacer.\n\n¿Seguro que quieres continuar?"
    );
    if (!ok1) return;
    const ok2 = window.confirm("Última confirmación: esto reinicia TODO lo de Corte a cero. ¿Confirmas?");
    if (!ok2) return;
    setReiniciando(true);
    setResultReinicio(null);
    try {
      await onReiniciarCortes();
      setResultReinicio({ ok: true, msg: "Listo — se borraron todos los lotes, toda la Programación de Mesones y todos los cortes reales quedaron en cero." });
    } catch (err) {
      setResultReinicio({ ok: false, msg: err?.message || "No se pudo completar el reinicio." });
    }
    setReiniciando(false);
  }
  const [tab, setTab] = useState("plantas");
  const [newPlanta, setNewPlanta] = useState("");
  const [newCortador, setNewCortador] = useState("");
  const [newTrabajador, setNewTrabajador] = useState({
    nombre: "",
    sueldo: "",
  });
  const [subiendoNomina, setSubiendoNomina] = useState(false);
  const [resultNomina, setResultNomina] = useState(null);
  const [subiendoPrecios, setSubiendoPrecios] = useState(false);
  const [resultPrecios, setResultPrecios] = useState(null);
  const [mesonForms, setMesonForms] = useState({});
  const [grupoForms, setGrupoForms] = useState({});
  const [newTela, setNewTela] = useState("");
  const [subiendoTelas, setSubiendoTelas] = useState(false);
  const [resultTelas, setResultTelas] = useState(null);
  const nominaInputRef = useRef(null);
  const preciosInputRef = useRef(null);
  const telasInputRef = useRef(null);
  const plantas = config.plantas || [];
  const cortadores = config.cortadores || [];
  const telas = config.telas || [];
  const trabajadores = config.nomina?.trabajadores || [];
  const nominaTotal = trabajadores.reduce((s, t) => s + (t.sueldo || 0), 0);
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();
  const dh = diasHabiles(mes, anio);
  function addPlanta() {
    if (!newPlanta.trim()) return;
    onSave({
      ...config,
      plantas: [...plantas, { id: uid(), nombre: newPlanta.trim() }],
    });
    setNewPlanta("");
  }
  function delPlanta(id) {
    onSave({ ...config, plantas: plantas.filter((p) => p.id !== id) });
  }
  function addMeson(plantaId) {
    const f = mesonForms[plantaId] || {};
    if (!f.nombre?.trim()) return;
    onSave({
      ...config,
      plantas: plantas.map((p) =>
        p.id === plantaId
          ? { ...p, mesones: [...(p.mesones || []), { id: uid(), nombre: f.nombre.trim(), metros: parseFloat(f.metros) || 0, grupoId: f.grupoId || "" }] }
          : p
      ),
    });
    setMesonForms((s2) => ({ ...s2, [plantaId]: { nombre: "", metros: "", grupoId: "" } }));
  }
  function delMeson(plantaId, mesonId) {
    onSave({
      ...config,
      plantas: plantas.map((p) =>
        p.id === plantaId ? { ...p, mesones: (p.mesones || []).filter((m) => m.id !== mesonId) } : p
      ),
    });
  }
  function addGrupo(plantaId) {
    const f = grupoForms[plantaId] || {};
    if (!f.nombre?.trim() || !f.metros) return;
    onSave({
      ...config,
      plantas: plantas.map((p) =>
        p.id === plantaId
          ? { ...p, grupos: [...(p.grupos || []), { id: uid(), nombre: f.nombre.trim(), metros: parseFloat(f.metros) || 0 }] }
          : p
      ),
    });
    setGrupoForms((s2) => ({ ...s2, [plantaId]: { nombre: "", metros: "" } }));
  }
  function delGrupo(plantaId, grupoId) {
    onSave({
      ...config,
      plantas: plantas.map((p) =>
        p.id === plantaId
          ? {
              ...p,
              grupos: (p.grupos || []).filter((g) => g.id !== grupoId),
              mesones: (p.mesones || []).map((m) => (m.grupoId === grupoId ? { ...m, grupoId: "" } : m)),
            }
          : p
      ),
    });
  }
  function addTela() {
    if (!newTela.trim()) return;
    if (telas.some((t) => t.toUpperCase() === newTela.trim().toUpperCase())) {
      setNewTela("");
      return;
    }
    onSave({ ...config, telas: [...telas, newTela.trim()] });
    setNewTela("");
  }
  function delTela(t) {
    onSave({ ...config, telas: telas.filter((x) => x !== t) });
  }
  async function subirTelas(file) {
    if (!file) return;
    setSubiendoTelas(true);
    setResultTelas(null);
    try {
      const nombres = await parseTelas(file);
      const actuales = new Map(telas.map((t) => [t.toUpperCase(), t]));
      let nuevos = 0;
      nombres.forEach((n) => {
        if (!actuales.has(n.toUpperCase())) {
          actuales.set(n.toUpperCase(), n);
          nuevos++;
        }
      });
      onSave({ ...config, telas: [...actuales.values()] });
      setResultTelas({ total: nombres.length, nuevos });
    } catch (err) {
      setResultTelas({ error: err?.message || "No se pudo leer el archivo de telas." });
    }
    setSubiendoTelas(false);
  }
  function addCortador() {
    if (!newCortador.trim()) return;
    onSave({
      ...config,
      cortadores: [...cortadores, { id: uid(), nombre: newCortador.trim() }],
    });
    setNewCortador("");
  }
  function delCortador(id) {
    onSave({ ...config, cortadores: cortadores.filter((c) => c.id !== id) });
  }
  function addTrabajador() {
    if (!newTrabajador.nombre.trim() || !newTrabajador.sueldo) return;
    const t = {
      id: uid(),
      nombre: newTrabajador.nombre.trim(),
      sueldo: parseFloat(newTrabajador.sueldo) || 0,
    };
    onSave({
      ...config,
      nomina: { ...config.nomina, trabajadores: [...trabajadores, t] },
    });
    setNewTrabajador({ nombre: "", sueldo: "" });
  }
  function delTrabajador(id) {
    onSave({
      ...config,
      nomina: {
        ...config.nomina,
        trabajadores: trabajadores.filter((t) => t.id !== id),
      },
    });
  }
  function updateSueldo(id, sueldo) {
    onSave({
      ...config,
      nomina: {
        ...config.nomina,
        trabajadores: trabajadores.map((t) =>
          t.id === id ? { ...t, sueldo: parseFloat(sueldo) || 0 } : t
        ),
      },
    });
  }
  // Importar nómina desde Excel: actualiza el sueldo de quien ya esté
  // registrado (comparando por nombre, sin importar mayúsculas/tildes de
  // más o menos espacios) y AGREGA como nuevo a quien no exista todavía. NO
  // borra a nadie — así se puede seguir ajustando a mano por horas extra, o
  // agregar un trabajador adicional que no venga en el archivo.
  async function importarNomina(file) {
    if (!file) return;
    setSubiendoNomina(true);
    setResultNomina(null);
    try {
      const filas = await parseNomina(file);
      const norm = (s) => String(s || "").trim().toUpperCase();
      const actuales = [...trabajadores];
      let actualizados = 0;
      let nuevos = 0;
      filas.forEach((f) => {
        const idx = actuales.findIndex((t) => norm(t.nombre) === norm(f.nombre));
        if (idx >= 0) {
          actuales[idx] = { ...actuales[idx], sueldo: f.sueldo };
          actualizados++;
        } else {
          actuales.push({ id: uid(), nombre: f.nombre, sueldo: f.sueldo });
          nuevos++;
        }
      });
      onSave({ ...config, nomina: { ...config.nomina, trabajadores: actuales } });
      setResultNomina({ total: filas.length, actualizados, nuevos });
    } catch (err) {
      setResultNomina({ error: err?.message || "No se pudo leer el archivo de nómina." });
    }
    setSubiendoNomina(false);
  }
  async function subirPrecios(file) {
    if (!file) return;
    setSubiendoPrecios(true);
    setResultPrecios(null);
    try {
      const precios = await parsePreciosCorte(file);
      await fsSave("precios_corte_cargas", uid(), {
        creadoEn: today(),
        creadoTs: Date.now(),
        subidoPor: currentUser?.name || "—",
        precios,
      });
      setResultPrecios({ total: precios.length });
    } catch (err) {
      setResultPrecios({ error: err?.message || "No se pudo leer el archivo de precios." });
    }
    setSubiendoPrecios(false);
  }
  const tabs = [
    ["plantas", "🏭 Plantas"],
    ["cortadores", "✂ Cortadores"],
    ["nomina", "💰 Nómina"],
    ["precios", "💲 Precios Corte"],
    ["telas", "🧵 Telas"],
  ];
  return (
    <div>
      <h2
        style={{
          margin: "0 0 20px",
          fontSize: 20,
          fontWeight: 800,
          color: C.ink,
        }}
      >
        Admin Corte
      </h2>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          background: C.canvas,
          borderRadius: 12,
          padding: 4,
        }}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: tab === id ? 700 : 500,
              fontSize: 13,
              background: tab === id ? C.white : "transparent",
              color: tab === id ? C.ink : C.slate,
              boxShadow: tab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, border: `1.5px solid ${C.red}`, background: C.redBg }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: C.red, marginBottom: 4 }}>🧹 Reiniciar Cortes (solo pruebas)</div>
        <div style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>
          Borra todos los lotes, toda la Programación de Mesones y todos los cortes reales registrados — para limpiar lo que hayas dejado probando. Es irreversible.
        </div>
        <Btn variant="danger" onClick={handleReiniciarCortes} disabled={reiniciando}>
          {reiniciando ? "Borrando..." : "🧹 Reiniciar todos los Cortes"}
        </Btn>
        {resultReinicio && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: resultReinicio.ok ? C.green : C.red }}>
            {resultReinicio.ok ? "✓ " : "✗ "}{resultReinicio.msg}
          </div>
        )}
      </div>
      {tab === "plantas" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newPlanta}
              onChange={(e) => setNewPlanta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlanta()}
              placeholder="Nombre de la planta..."
              style={{
                flex: 1,
                padding: "9px 12px",
                border: `1.5px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <Btn onClick={addPlanta}>+ Agregar</Btn>
          </div>
          {plantas.map((p) => {
            const mf = mesonForms[p.id] || { nombre: "", metros: "", grupoId: "" };
            const gf = grupoForms[p.id] || { nombre: "", metros: "" };
            const mesones = p.mesones || [];
            const grupos = p.grupos || [];
            return (
            <div
              key={p.id}
              style={{
                padding: "12px 16px",
                background: C.canvas,
                borderRadius: 10,
                marginBottom: 8,
                border: `1px solid ${C.border}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: C.ink }}>
                  🏭 {p.nombre}
                </span>
                <button
                  onClick={() => delPlanta(p.id)}
                  style={{
                    background: C.redBg,
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 10px",
                    color: C.red,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Eliminar
                </button>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>
                Mesones (largo máximo de trazo que cabe en la mesa — no metros de tela)
              </div>
              {mesones.map((m) => {
                const grupo = grupos.find((g) => g.id === m.grupoId);
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.white, borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}` }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.ink }}>{m.nombre}</span>
                    <span style={{ fontSize: 11, color: C.slate }}>
                      {grupo ? `Comparte trazo con "${grupo.nombre}" (máx ${grupo.metros}m de trazo entre todos)` : `${m.metros}m de trazo (mesa independiente)`}
                    </span>
                    <button
                      onClick={() => delMeson(p.id, m.id)}
                      style={{ background: C.redBg, border: "none", borderRadius: 6, padding: "3px 8px", color: C.red, fontWeight: 700, fontSize: 10, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 1.2fr auto", gap: 6, marginTop: 6, marginBottom: 14 }}>
                <input
                  value={mf.nombre}
                  onChange={(e) => setMesonForms((s2) => ({ ...s2, [p.id]: { ...mf, nombre: e.target.value } }))}
                  placeholder="Nombre del mesón..."
                  style={{ padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}
                />
                <input
                  type="number"
                  value={mf.metros}
                  onChange={(e) => setMesonForms((s2) => ({ ...s2, [p.id]: { ...mf, metros: e.target.value } }))}
                  placeholder="Largo máx. trazo (m)"
                  style={{ padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}
                />
                <select
                  value={mf.grupoId}
                  onChange={(e) => setMesonForms((s2) => ({ ...s2, [p.id]: { ...mf, grupoId: e.target.value } }))}
                  style={{ padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}
                >
                  <option value="">Independiente (usa sus propios metros)</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>Comparte: {g.nombre}</option>
                  ))}
                </select>
                <Btn small onClick={() => addMeson(p.id)}>+ Mesón</Btn>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>
                Grupos compartidos (ej: Mesón 2+3 de Yanko, máx 14m de trazo entre los dos)
              </div>
              {grupos.map((g) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.white, borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}` }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.ink }}>{g.nombre}</span>
                  <span style={{ fontSize: 11, color: C.slate }}>máx {g.metros}m de trazo entre todos los mesones del grupo (sumando el largo de cada trazo tendido al mismo tiempo)</span>
                  <button
                    onClick={() => delGrupo(p.id, g.id)}
                    style={{ background: C.redBg, border: "none", borderRadius: 6, padding: "3px 8px", color: C.red, fontWeight: 700, fontSize: 10, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr auto", gap: 6, marginTop: 6 }}>
                <input
                  value={gf.nombre}
                  onChange={(e) => setGrupoForms((s2) => ({ ...s2, [p.id]: { ...gf, nombre: e.target.value } }))}
                  placeholder="Nombre del grupo (ej: Mesón 2+3)..."
                  style={{ padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}
                />
                <input
                  type="number"
                  value={gf.metros}
                  onChange={(e) => setGrupoForms((s2) => ({ ...s2, [p.id]: { ...gf, metros: e.target.value } }))}
                  placeholder="Largo máx. trazo (m)"
                  style={{ padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}
                />
                <Btn small variant="secondary" onClick={() => addGrupo(p.id)}>+ Grupo</Btn>
              </div>
            </div>
          );})}
          {!plantas.length && (
            <div style={{ textAlign: "center", padding: 32, color: C.slate }}>
              Sin plantas registradas.
            </div>
          )}
        </div>
      )}
      {tab === "cortadores" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newCortador}
              onChange={(e) => setNewCortador(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCortador()}
              placeholder="Nombre del cortador..."
              style={{
                flex: 1,
                padding: "9px 12px",
                border: `1.5px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 14,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <Btn onClick={addCortador}>+ Agregar</Btn>
          </div>
          {cortadores.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: C.canvas,
                borderRadius: 10,
                marginBottom: 8,
                border: `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontWeight: 700, color: C.ink }}>
                ✂ {c.nombre}
              </span>
              <button
                onClick={() => delCortador(c.id)}
                style={{
                  background: C.redBg,
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  color: C.red,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Eliminar
              </button>
            </div>
          ))}
          {!cortadores.length && (
            <div style={{ textAlign: "center", padding: 32, color: C.slate }}>
              Sin cortadores registrados.
            </div>
          )}
        </div>
      )}
      {tab === "nomina" && (
        <div>
          <div
            style={{
              border: `1px dashed ${C.border}`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 20,
              background: C.canvas,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
              📤 Importar nómina desde Excel
            </div>
            <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>
              Actualiza el sueldo de quien ya esté en la lista y agrega como nuevo a quien no exista — no borra a nadie. Después puedes seguir ajustando a mano (horas extra, trabajador adicional).
            </div>
            <input
              type="file"
              ref={nominaInputRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                importarNomina(f);
                e.target.value = "";
              }}
            />
            <Btn variant="secondary" small onClick={() => nominaInputRef.current?.click()} disabled={subiendoNomina}>
              {subiendoNomina ? "Leyendo..." : "📤 Subir archivo de nómina"}
            </Btn>
            {resultNomina && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  color: resultNomina.error ? C.red : C.green,
                }}
              >
                {resultNomina.error
                  ? `⚠ ${resultNomina.error}`
                  : `✓ ${resultNomina.total} trabajador(es) leídos — ${resultNomina.actualizados} actualizado(s), ${resultNomina.nuevos} nuevo(s).`}
              </div>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr auto",
              gap: 8,
              marginBottom: 16,
              alignItems: "flex-end",
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.slate,
                  display: "block",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                Nombre trabajador
              </label>
              <input
                value={newTrabajador.nombre}
                onChange={(e) =>
                  setNewTrabajador((t) => ({ ...t, nombre: e.target.value }))
                }
                placeholder="Ej: Carlos Ruiz"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.slate,
                  display: "block",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                Sueldo integral $
              </label>
              <input
                type="number"
                value={newTrabajador.sueldo}
                onChange={(e) =>
                  setNewTrabajador((t) => ({ ...t, sueldo: e.target.value }))
                }
                placeholder="2500000"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <Btn onClick={addTrabajador}>+ Agregar</Btn>
          </div>
          {trabajadores.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: C.canvas,
                borderRadius: 10,
                marginBottom: 8,
                border: `1px solid ${C.border}`,
              }}
            >
              <div style={{ flex: 1, fontWeight: 700, color: C.ink }}>
                👤 {t.nombre}
              </div>
              <input
                type="number"
                value={t.sueldo}
                onChange={(e) => updateSueldo(t.id, e.target.value)}
                style={{
                  width: 140,
                  padding: "6px 10px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  textAlign: "right",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => delTrabajador(t.id)}
                style={{
                  background: C.redBg,
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  color: C.red,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Eliminar
              </button>
            </div>
          ))}
          {!trabajadores.length && (
            <div style={{ textAlign: "center", padding: 20, color: C.slate }}>
              Sin trabajadores registrados.
            </div>
          )}
          {trabajadores.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: "14px 18px",
                background: C.ink,
                borderRadius: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.seam,
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  Nómina Mensual
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>
                  {fmtCOP(nominaTotal)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.seam,
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  Días Hábiles
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.white }}>
                  {dh}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.seam,
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  Costo por Día
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.seam }}>
                  {fmtCOP(nominaTotal / dh)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === "precios" && (
        <div>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 620 }}>
            Sube el archivo maestro de precios (el que trae la columna "Ref" y "MdeO Corte" por referencia). Al programar un corte, el precio por prenda se llena solo con lo que traiga aquí — si una referencia no aparece, se puede seguir escribiendo a mano como antes.
          </div>
          <input
            type="file"
            ref={preciosInputRef}
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              subirPrecios(f);
              e.target.value = "";
            }}
          />
          <Btn onClick={() => preciosInputRef.current?.click()} disabled={subiendoPrecios}>
            {subiendoPrecios ? "Leyendo..." : "📤 Subir archivo de precios de corte"}
          </Btn>
          {ultimaCargaPrecios && (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 8 }}>
              Última carga: {ultimaCargaPrecios.creadoEn}{ultimaCargaPrecios.subidoPor ? ` · Subido por ${ultimaCargaPrecios.subidoPor}` : ""}
            </div>
          )}
          {resultPrecios && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 16px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                background: resultPrecios.error ? C.redBg : C.greenBg,
                color: resultPrecios.error ? C.red : C.green,
              }}
            >
              {resultPrecios.error ? `⚠ ${resultPrecios.error}` : `✓ ${resultPrecios.total} referencias cargadas.`}
            </div>
          )}
        </div>
      )}
      {tab === "telas" && (
        <div>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 620 }}>
            Lista de tipos de tela para elegir al hacer la Programación Hecha de un corte — así el nombre siempre queda escrito igual y las estadísticas por tipo de tela (tiempo teórico) salen bien. Puedes agregarlos a mano o subir un archivo con una lista.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newTela}
              onChange={(e) => setNewTela(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTela()}
              placeholder="Ej: Diamante"
              style={{ flex: 1, padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "inherit" }}
            />
            <Btn onClick={addTela}>+ Agregar</Btn>
          </div>
          <input
            type="file"
            ref={telasInputRef}
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              subirTelas(f);
              e.target.value = "";
            }}
          />
          <Btn variant="secondary" small onClick={() => telasInputRef.current?.click()} disabled={subiendoTelas}>
            {subiendoTelas ? "Leyendo..." : "📤 Subir listado de telas"}
          </Btn>
          {resultTelas && (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: resultTelas.error ? C.red : C.green }}>
              {resultTelas.error ? `⚠ ${resultTelas.error}` : `✓ ${resultTelas.total} leídas — ${resultTelas.nuevos} nueva(s).`}
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {telas.map((t) => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: C.violetBg, color: C.violet, borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                🧵 {t}
                <button onClick={() => delTela(t)} style={{ background: "none", border: "none", color: C.violet, cursor: "pointer", fontWeight: 800 }}>✕</button>
              </span>
            ))}
            {!telas.length && <div style={{ color: C.slate, fontSize: 13 }}>Sin telas registradas.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
// ─── ESTADÍSTICAS TELA ────────────────────────────────────────────────────────
function EstadisticasTela({ pedidos }) {
  // "tela" = análisis original por tipo de tela + largo de trazo; "cortador"
  // = ranking de cortadores por velocidad (prendas/min) y por volumen
  // (unidades totales cortadas).
  const [modoStats, setModoStats] = useState("tela");
  // Rango de largo de trazo — agrupa los cortes reales para poder comparar,
  // dentro de una misma tela, si un trazo corto o largo rinde más. Los
  // cortes de un mismo tipo de tela pueden variar mucho de largo de trazo
  // (una capa de 3m no cunde igual que una de 12m), así que ver solo el
  // promedio por tela se queda corto — esto es lo que pidió Yanko: saber
  // qué combinación tela + largo de trazo es la más rendidora, tanto en
  // velocidad de corte (min/metro) como en prendas cortadas por minuto.
  function rangoTrazo(largo) {
    if (!(largo > 0)) return "Sin dato";
    if (largo <= 4) return "≤4m";
    if (largo <= 8) return "4–8m";
    if (largo <= 12) return "8–12m";
    return ">12m";
  }
  const ORDEN_RANGOS = ["≤4m", "4–8m", "8–12m", ">12m", "Sin dato"];
  const allCortes = pedidos.flatMap((p) =>
    (p.cortesRealizados || []).filter((c) => c.tipoTela && c.metrosTendido > 0 && c.minutos > 0)
  );
  const byTela = {};
  const combos = new Map(); // "tela||rango" -> acumulado, para el ranking
  allCortes.forEach((c) => {
    if (!byTela[c.tipoTela]) byTela[c.tipoTela] = { cortes: 0, metros: 0, minutos: 0, minutosTendido: 0, capas: 0, unidades: 0, porRango: {} };
    const t = byTela[c.tipoTela];
    t.cortes++;
    t.metros += c.metrosTendido || 0;
    t.minutos += c.minutos || 0;
    t.minutosTendido += c.minutosTendido || 0;
    t.capas += c.capas || 0;
    t.unidades += c.totalUnidades || 0;
    const rango = rangoTrazo(c.largoTrazo);
    if (!t.porRango[rango]) t.porRango[rango] = { cortes: 0, metros: 0, minutos: 0, unidades: 0 };
    t.porRango[rango].cortes++;
    t.porRango[rango].metros += c.metrosTendido || 0;
    t.porRango[rango].minutos += c.minutos || 0;
    t.porRango[rango].unidades += c.totalUnidades || 0;
    const comboKey = `${c.tipoTela}||${rango}`;
    if (!combos.has(comboKey)) combos.set(comboKey, { tela: c.tipoTela, rango, cortes: 0, metros: 0, minutos: 0, unidades: 0 });
    const cb = combos.get(comboKey);
    cb.cortes++;
    cb.metros += c.metrosTendido || 0;
    cb.minutos += c.minutos || 0;
    cb.unidades += c.totalUnidades || 0;
  });
  // Ranking de rendimiento: prendas cortadas por minuto (mientras más alto,
  // más rendidor) — solo combos con al menos 2 cortes registrados, para que
  // un solo dato suelto no distorsione el ranking.
  const rankingCombos = [...combos.values()]
    .filter((cb) => cb.cortes >= 2 && cb.minutos > 0)
    .map((cb) => ({ ...cb, unidadesPorMin: cb.unidades / cb.minutos, minPorMetro: cb.metros > 0 ? cb.minutos / cb.metros : null }))
    .sort((a, b) => b.unidadesPorMin - a.unidadesPorMin);
  const masRendidores = rankingCombos.slice(0, 3);
  const menosRendidores = [...rankingCombos].reverse().slice(0, 3);
  // Estadísticas por cortador — para saber quién corta más rápido (prendas
  // por minuto) y quién corta más volumen (total de unidades), aparte de
  // por tela. No exige tipoTela (allCortes sí lo exige) porque el cortador
  // y el tiempo/unidades quedan registrados aunque falte ese dato.
  const allCortesConCortador = pedidos.flatMap((p) =>
    (p.cortesRealizados || []).filter((c) => c.cortador && c.minutos > 0)
  );
  const byCortador = {};
  allCortesConCortador.forEach((c) => {
    if (!byCortador[c.cortador]) byCortador[c.cortador] = { cortes: 0, unidades: 0, minutos: 0, minutosTendido: 0, metros: 0 };
    const d = byCortador[c.cortador];
    d.cortes++;
    d.unidades += c.totalUnidades || 0;
    d.minutos += c.minutos || 0;
    d.minutosTendido += c.minutosTendido || 0;
    d.metros += c.metrosTendido || 0;
  });
  const rankingCortadores = Object.entries(byCortador)
    .map(([cortador, d]) => ({
      cortador,
      ...d,
      unidadesPorMin: d.minutos > 0 ? d.unidades / d.minutos : 0,
      minPorCorte: d.cortes > 0 ? d.minutos / d.cortes : 0,
    }))
    .sort((a, b) => b.unidades - a.unidades);
  // Velocidad solo se compara con al menos 2 cortes — mismo criterio que
  // los combos de tela, para que un solo corte suelto no distorsione.
  const masRapidos = [...rankingCortadores].filter((c) => c.cortes >= 2).sort((a, b) => b.unidadesPorMin - a.unidadesPorMin).slice(0, 3);
  const masLentos = [...rankingCortadores].filter((c) => c.cortes >= 2).sort((a, b) => a.unidadesPorMin - b.unidadesPorMin).slice(0, 3);
  const masVolumen = rankingCortadores.slice(0, 3);
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: C.ink }}>
        📊 Estadística de Tendido y Corte
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 700 }}>
        Con cada corte real registrado (Entrada de Corte) se va afinando esto solo. Compara tela + largo de trazo, o cortador, para saber qué rinde más — tanto en velocidad de corte como en prendas cortadas.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setModoStats("tela")}
          style={{ cursor: "pointer", padding: "8px 16px", borderRadius: 8, fontWeight: 800, fontSize: 12, border: "none", background: modoStats === "tela" ? C.violet : C.violetBg, color: modoStats === "tela" ? C.white : C.violet }}
        >
          🧵 Por Tela
        </button>
        <button
          onClick={() => setModoStats("cortador")}
          style={{ cursor: "pointer", padding: "8px 16px", borderRadius: 8, fontWeight: 800, fontSize: 12, border: "none", background: modoStats === "cortador" ? C.violet : C.violetBg, color: modoStats === "cortador" ? C.white : C.violet }}
        >
          ✂ Por Cortador
        </button>
      </div>
      {modoStats === "cortador" ? (
        !Object.keys(byCortador).length ? (
          <div style={{ textAlign: "center", padding: 48, color: C.slate }}>
            Sin datos de cortadores registrados aún. Aparecerán cuando registres cortes con cortador y horario.
          </div>
        ) : (
          <>
            {(masRapidos.length > 0 || masVolumen.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div style={{ background: C.greenBg, borderRadius: 12, padding: 16, border: `1px solid ${C.green}33` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: "uppercase", marginBottom: 10 }}>
                    🏆 Más rápidos (prendas/min)
                  </div>
                  {masRapidos.length ? masRapidos.map((c) => (
                    <div key={c.cortador} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C.green}22` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>✂ {c.cortador}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: C.green }}>{c.unidadesPorMin.toFixed(2)} u/min</span>
                    </div>
                  )) : <div style={{ fontSize: 12, color: C.slate }}>Necesita al menos 2 cortes por cortador.</div>}
                </div>
                <div style={{ background: C.blueBg, borderRadius: 12, padding: 16, border: `1px solid ${C.cyan}33` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.cyan, textTransform: "uppercase", marginBottom: 10 }}>
                    🥇 Mayor volumen (unidades cortadas)
                  </div>
                  {masVolumen.map((c) => (
                    <div key={c.cortador} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C.cyan}22` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>✂ {c.cortador}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: C.cyan }}>{fmtNum(c.unidades)} u</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {masLentos.length > 0 && (
              <div style={{ background: C.redBg, borderRadius: 12, padding: 16, border: `1px solid ${C.red}33`, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.red, textTransform: "uppercase", marginBottom: 10 }}>
                  🐢 Más lentos (prendas/min)
                </div>
                {masLentos.map((c) => (
                  <div key={c.cortador} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C.red}22` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>✂ {c.cortador}</span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.red }}>{c.unidadesPorMin.toFixed(2)} u/min</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", marginBottom: 10 }}>
                Todos los cortadores (ordenado por unidades cortadas)
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ textAlign: "left", padding: "5px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Cortador</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Cortes</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Unidades</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Min. Tendido</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Min. Corte</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Prendas/min</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Min/Corte</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingCortadores.map((c) => (
                    <tr key={c.cortador} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: C.ink }}>{c.cortador}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.cortes}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{fmtNum(c.unidades)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: C.blue }}>{c.minutosTendido > 0 ? c.minutosTendido : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{c.minutos}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: C.green, fontWeight: 700 }}>{c.unidadesPorMin.toFixed(2)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: C.violet, fontWeight: 700 }}>{c.minPorCorte.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : !Object.keys(byTela).length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate }}>
          Sin datos de corte registrados aún. Los datos aparecerán cuando registres cortes con tipo de tela, largo de trazo y tiempos.
        </div>
      ) : (
        <>
          {rankingCombos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              <div style={{ background: C.greenBg, borderRadius: 12, padding: 16, border: `1px solid ${C.green}33` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: "uppercase", marginBottom: 10 }}>
                  🏆 Combos más rendidores (prendas/min)
                </div>
                {masRendidores.map((cb) => (
                  <div key={`${cb.tela}-${cb.rango}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C.green}22` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>
                      🧵 {cb.tela} · {cb.rango}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.green }}>{cb.unidadesPorMin.toFixed(2)} u/min</span>
                  </div>
                ))}
              </div>
              <div style={{ background: C.redBg, borderRadius: 12, padding: 16, border: `1px solid ${C.red}33` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.red, textTransform: "uppercase", marginBottom: 10 }}>
                  🐢 Combos menos rendidores (prendas/min)
                </div>
                {menosRendidores.map((cb) => (
                  <div key={`${cb.tela}-${cb.rango}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${C.red}22` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>
                      🧵 {cb.tela} · {cb.rango}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.red }}>{cb.unidadesPorMin.toFixed(2)} u/min</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(byTela)
              .sort((a, b) => b[1].metros - a[1].metros)
              .map(([tela, data]) => {
                const minPorMetro = data.metros > 0 ? (data.minutos / data.metros).toFixed(1) : "—";
                const minPorMetroTendido = data.metros > 0 && data.minutosTendido > 0 ? (data.minutosTendido / data.metros).toFixed(1) : null;
                const capasPromedio = data.cortes > 0 ? (data.capas / data.cortes).toFixed(0) : "—";
                const unidadesPorMin = data.minutos > 0 ? (data.unidades / data.minutos).toFixed(2) : "—";
                const rangos = ORDEN_RANGOS.filter((r) => data.porRango[r]);
                return (
                  <div key={tela} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>🧵 {tela}</div>
                        <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
                          {data.cortes} corte{data.cortes !== 1 ? "s" : ""} registrado{data.cortes !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {minPorMetroTendido && (
                          <div style={{ padding: "8px 16px", background: C.blueBg, borderRadius: 20, color: C.blue, fontWeight: 900, fontSize: 18 }}>
                            🧵 {minPorMetroTendido} min/m tendido
                          </div>
                        )}
                        <div style={{ padding: "8px 16px", background: C.violetBg, borderRadius: 20, color: C.violet, fontWeight: 900, fontSize: 18 }}>
                          ✂ {minPorMetro} min/m corte
                        </div>
                        <div style={{ padding: "8px 16px", background: C.greenBg, borderRadius: 20, color: C.green, fontWeight: 900, fontSize: 18 }}>
                          {unidadesPorMin} u/min
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 14 }}>
                      {[
                        { label: "Total Metros", value: `${data.metros.toFixed(1)}m`, color: C.blue },
                        { label: "Total Min. Tendido", value: data.minutosTendido > 0 ? `${data.minutosTendido} min` : "—", color: C.blue },
                        { label: "Total Min. Corte", value: `${data.minutos} min`, color: C.amber },
                        { label: "Capas Promedio", value: capasPromedio, color: C.cyan },
                        { label: "Unidades Cortadas", value: fmtNum(data.unidades), color: C.green },
                      ].map((k) => (
                        <div key={k.label} style={{ background: C.canvas, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>{k.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: k.color, marginTop: 4 }}>{k.value}</div>
                        </div>
                      ))}
                    </div>
                    {rangos.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>
                          Por largo de trazo — qué tan rendidor es cada largo con esta tela
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                              <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Trazo</th>
                              <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Cortes</th>
                              <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Metros</th>
                              <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Min/Metro</th>
                              <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Unidades</th>
                              <th style={{ textAlign: "right", padding: "4px 8px", fontSize: 10, color: C.slate, textTransform: "uppercase" }}>Rendimiento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rangos.map((r) => {
                              const d = data.porRango[r];
                              const mpm = d.metros > 0 ? (d.minutos / d.metros).toFixed(1) : "—";
                              const upm = d.minutos > 0 ? (d.unidades / d.minutos).toFixed(2) : "—";
                              return (
                                <tr key={r} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "5px 8px", fontWeight: 700, color: C.ink }}>{r}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{d.cortes}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{d.metros.toFixed(1)}m</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: C.violet, fontWeight: 700 }}>{mpm}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtNum(d.unidades)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: C.green, fontWeight: 700 }}>{upm} u/min</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ marginTop: 12, padding: "8px 14px", background: C.amberBg, borderRadius: 8, fontSize: 12, color: C.amber, fontWeight: 600 }}>
                      💡 Sugerencia: para {tela}, programar 1 metro tendido = {minPorMetro} minutos de corte en promedio.
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
// ─── DASHBOARD CORTE ──────────────────────────────────────────────────────────
function DashboardCorte({ pedidos, onSelectPedido, nominaConfig, onUpdatePedido, isAdmin, vpRefMap, lotesCortadoMap }) {
  // Los pedidos ya no se cargan ni se revisan aquí — vienen listos de
  // "pedidos_activos", alimentada por el botón "🧊 Congelar como base de
  // Corte" en Vigentes por Cliente (módulo Diseño → Pedidos). Ese mismo
  // flujo ya cruza contra Busint en vivo y contra el reporte de Ventas
  // Perdidas, así que aquí no hace falta repetirlo.
  const activos = pedidos.filter((p) => p.estado === "activo");
  // Alerta: pedidos que llevan CERO unidades cortadas y ya tienen el
  // despacho encima (15 días o menos, incluye los ya vencidos) — para que
  // no se cuelen pedidos que nadie ha empezado a cortar mientras se acerca
  // la fecha. No mira los que ya tienen algo de avance, aunque sea poco.
  // El "cortado" se cruza con Planeación/Ventas Perdidas (Busint) — no solo
  // lo registrado a mano acá — para no marcar como "sin cortar" un pedido
  // que Busint ya reporta con avance real.
  const sinCortarCercaDespacho = activos
    .filter((p) => {
      if (!p.fechaDespacho) return false;
      const dias = Math.ceil((new Date(p.fechaDespacho) - new Date()) / 86400000);
      if (dias > 15) return false;
      const { totalCortado } = calcularCortadoPendiente(p, vpRefMap, lotesCortadoMap);
      return totalCortado === 0;
    })
    .sort((a, b) => (a.fechaDespacho || "").localeCompare(b.fechaDespacho || ""));
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();
  const nominaMensual = (nominaConfig?.trabajadores || []).reduce(
    (s, t) => s + (t.sueldo || 0),
    0
  );
  const dh = diasHabiles(mes, anio);
  const costoDia = nominaMensual / dh;
  const totalCortadoMes = pedidos
    .flatMap((p) => p.cortesRealizados || [])
    .filter(
      (c) => c.fecha?.slice(0, 7) === `${anio}-${String(mes).padStart(2, "0")}`
    )
    .reduce((s, c) => s + (c.totalUnidades || 0), 0);
  const ingresoMes = pedidos
    .flatMap((p) => p.cortesRealizados || [])
    .filter(
      (c) => c.fecha?.slice(0, 7) === `${anio}-${String(mes).padStart(2, "0")}`
    )
    .reduce((s, c) => s + (c.ingresoCorte || 0), 0);
  const diasConCorte = new Set(
    pedidos
      .flatMap((p) => p.cortesRealizados || [])
      .filter(
        (c) =>
          c.fecha?.slice(0, 7) === `${anio}-${String(mes).padStart(2, "0")}`
      )
      .map((c) => c.fecha)
  ).size;
  const costoCorteMes = costoDia * diasConCorte;
  const rentabilidadMes = ingresoMes - costoCorteMes;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: 20,
              fontWeight: 800,
              color: C.ink,
            }}
          >
            Dashboard Corte
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: C.slate }}>
            {activos.length} pedido{activos.length !== 1 ? "s" : ""} activo
            {activos.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      {!!sinCortarCercaDespacho.length && (
        <div
          style={{
            background: C.redBg,
            border: `1.5px solid ${C.red}55`,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 800, color: C.red }}>
            ⚠ {sinCortarCercaDespacho.length} pedido{sinCortarCercaDespacho.length !== 1 ? "s" : ""} sin ninguna unidad cortada y con despacho a 15 días o menos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sinCortarCercaDespacho.map((p) => {
              const sem = semaforo(p.fechaDespacho);
              const totalP = p.referencias.reduce((s, r) => s + (r.total || 0), 0);
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPedido(p.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: C.white,
                  }}
                >
                  <div style={{ fontSize: 12, color: C.ink }}>
                    <b>{p.cliente}</b> · #{p.numero} · {fmtNum(totalP)} prendas · Despacho: {p.fechaDespacho}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: sem.color, background: sem.bg, padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
                    📅 {sem.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* KPI Mensual */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KPICard
          icon="✂"
          label="Unidades Mes"
          value={fmtNum(totalCortadoMes)}
          color={C.blue}
          bg={C.blueBg}
        />
        <KPICard
          icon="💵"
          label="Ingreso Corte Mes"
          value={fmtCOP(ingresoMes)}
          color={C.green}
          bg={C.greenBg}
        />
        <KPICard
          icon="💸"
          label="Costo Nómina Mes"
          value={fmtCOP(costoCorteMes)}
          color={C.amber}
          bg={C.amberBg}
        />
        <KPICard
          icon={rentabilidadMes >= 0 ? "📈" : "📉"}
          label="Rentabilidad Mes"
          value={fmtCOP(rentabilidadMes)}
          color={rentabilidadMes >= 0 ? C.green : C.red}
          bg={rentabilidadMes >= 0 ? C.greenBg : C.redBg}
          sub={rentabilidadMes >= 0 ? "✓ Rentable" : "⚠ Pérdida"}
        />
      </div>
      {/* Pedidos activos */}
      {!activos.length ? (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: C.slate,
            fontSize: 14,
          }}
        >
          No hay pedidos activos. Carga un pedido de Busint para empezar.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))",
            gap: 14,
          }}
        >
          {activos
            .sort((a, b) =>
              (a.fechaDespacho || "").localeCompare(b.fechaDespacho || "")
            )
            .map((p) => {
              // Cruza Planeación + Ventas Perdidas (Busint) + Corte propio —
              // mismo criterio que la Cola Sugerida — para que el avance no
              // se quede en 0% solo porque nadie registró el corte a mano
              // acá, si Busint ya reporta que se cortó.
              const { totalPedido: totalP, totalCortado: totalC } = calcularCortadoPendiente(p, vpRefMap, lotesCortadoMap);
              const pct = totalP > 0 ? Math.round((totalC / totalP) * 100) : 0;
              const sem = semaforo(p.fechaDespacho);
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPedido(p.id)}
                  style={{
                    background: C.white,
                    borderRadius: 12,
                    padding: 18,
                    cursor: "pointer",
                    border: `1px solid ${C.border}`,
                    transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.boxShadow =
                      "0 4px 20px rgba(26,26,46,0.09)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.boxShadow = "none")
                  }
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.slate,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        Pedido #{p.numero}
                      </div>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 15,
                          color: C.ink,
                          marginTop: 2,
                        }}
                      >
                        {p.cliente}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "4px 10px",
                        background: sem.bg,
                        color: sem.color,
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      📅 {sem.label}
                    </div>
                  </div>
                  <div
                    style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}
                  >
                    {p.referencias.length} ref · {fmtNum(totalP)} prendas ·
                    Despacho: {p.fechaDespacho || "—"}
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: C.border,
                      overflow: "hidden",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: pct === 100 ? C.green : C.blue,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: C.slate,
                    }}
                  >
                    <span>
                      {fmtNum(totalC)} cortadas ({pct}%)
                    </span>
                    <span style={{ color: C.amber, fontWeight: 700 }}>
                      {fmtNum(totalP - totalC)} pendientes
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
// ─── COLA SUGERIDA DE CORTE ─────────────────────────────────────────────────
// Cuánto falta por cortar de cada referencia de un pedido, cruzando las
// mismas tres fuentes que usa el informe de Vigentes en Diseño → Pedidos
// (se toma la que reporte más unidades, para no subestimar):
//   1) Planeación (inventario en proceso por lote: Corte+BMP+Planta+BPT+
//      Semiterminado, o Cant Cortada si esa sí trae dato) — confirma corte
//      físico real aunque Busint no lo haya facturado todavía.
//   2) Ventas Perdidas (Busint) — facturado + traslados + venta perdida.
//   3) Corte (registrado a mano aquí mismo en el aplicativo) — respaldo si
//      las dos anteriores no traen esa referencia para ese pedido.
function calcularCortadoPendiente(pedido, vpRefMap, lotesCortadoMap) {
  // OJO: Busint entrega una "referencia" por cada combinación ref+pinta+color
  // — varias filas de pedido.referencias pueden compartir el mismo código
  // `ref` (solo cambian de color/pinta, ver descripcion). Lo único que
  // identifica una referencia de forma única es su `id`. Por eso el cortado
  // propio de la app (cortesRealizados) se cruza por refId, NO por ref —
  // si se cruzara por ref, cortar un color contaría como si se hubiera
  // cortado también en los demás colores que comparten ese mismo código.
  const cortadoPorRefApp = new Map();
  // Igual que cortadoPorRefApp pero desglosado por talla — se usa para que
  // "Disponible para Programar" ofrezca lo que REALMENTE falta por talla
  // (no el pedido original completo) cuando una referencia ya se cortó
  // parcialmente y se está programando un segundo lote. Ventas Perdidas y
  // Planeación no tienen desglose por talla, así que esto solo puede salir
  // de los cortes reales de la app (cortesRealizados) — es la única fuente
  // con ese detalle.
  const cortadoTallaPorRefApp = new Map();
  (pedido.cortesRealizados || []).forEach((c) => {
    (c.refs || []).forEach((cr) => {
      const suma = Object.values(cr.tallas || {}).reduce((a, b) => a + (b || 0), 0);
      const clave = cr.refId || cr.ref;
      cortadoPorRefApp.set(clave, (cortadoPorRefApp.get(clave) || 0) + suma);
      if (!cortadoTallaPorRefApp.has(clave)) cortadoTallaPorRefApp.set(clave, {});
      const acc = cortadoTallaPorRefApp.get(clave);
      Object.entries(cr.tallas || {}).forEach(([t, cant]) => {
        acc[t] = (acc[t] || 0) + (cant || 0);
      });
    });
  });
  // Ventas Perdidas (Busint) y Planeación solo reportan un total cortado por
  // CÓDIGO de referencia completo (ej. "CK3000"), sin desglose de color — es
  // una limitación de esas fuentes externas, no de la app (ver nota arriba).
  // ANTES ese total se restaba completo a CADA color de la referencia por
  // separado, como si cada color ya tuviera esa cantidad cortada de forma
  // individual: el color de mayor volumen "absorbía" el descuento y aun así
  // quedaba con algo pendiente (por eso se seguía viendo), pero los colores
  // con menos unidades daban pendiente negativo → 0 y desaparecían de
  // "Programar Corte" aunque en realidad seguían pendientes (bug real:
  // referencia CK3000 del pedido #1338, solo aparecía el color Negro).
  // Ahora ese total externo se calcula UNA vez por código de referencia, se
  // le resta lo que la app ya explica con certeza (cortesRealizados, sumado
  // entre todos los colores de esa referencia) y el remanente se reparte
  // proporcional al tamaño (total de unidades) de cada color — así ningún
  // color queda escondido, y la suma entre colores sigue cuadrando con el
  // total reportado por Busint/Planeación para toda la referencia.
  const totalPorRefCode = new Map();
  const cortadoAppPorRefCode = new Map();
  (pedido.referencias || []).forEach((r) => {
    totalPorRefCode.set(r.ref, (totalPorRefCode.get(r.ref) || 0) + (r.total || 0));
    cortadoAppPorRefCode.set(r.ref, (cortadoAppPorRefCode.get(r.ref) || 0) + (cortadoPorRefApp.get(r.id) || 0));
  });
  const extraExternoPorRefCode = new Map();
  totalPorRefCode.forEach((_totalRefCode, refCode) => {
    const clave = `${pedido.numero}__${refCode}`;
    const vp = vpRefMap?.get(clave);
    const cortadoVP = vp
      ? (vp.totalFacturada || 0) + (vp.totalTrasExt || 0) + (vp.totalTrasCon || 0) + Math.abs(vp.totalVentasPerdidas || 0)
      : null;
    const cortadoPlanta = lotesCortadoMap?.has(clave) ? lotesCortadoMap.get(clave) : null;
    const cortadoAppRefCode = cortadoAppPorRefCode.get(refCode) || 0;
    const candidatos = [cortadoAppRefCode];
    if (cortadoVP !== null) candidatos.push(cortadoVP);
    if (cortadoPlanta !== null) candidatos.push(cortadoPlanta);
    const cortadoRefCodeFinal = Math.max(...candidatos);
    extraExternoPorRefCode.set(refCode, Math.max(0, cortadoRefCodeFinal - cortadoAppRefCode));
  });
  let totalPedido = 0;
  let totalCortado = 0;
  const porRef = (pedido.referencias || []).map((r) => {
    const total = r.total || 0;
    totalPedido += total;
    const cortadoApp = cortadoPorRefApp.get(r.id) || 0;
    const totalRefCode = totalPorRefCode.get(r.ref) || 0;
    const extraRefCode = extraExternoPorRefCode.get(r.ref) || 0;
    const shareColor = totalRefCode > 0 ? total / totalRefCode : 0;
    // Redondeado a unidades enteras — son prendas, no se puede cortar una
    // fracción, y el reparto proporcional entre colores no da números exactos.
    const cortado = Math.min(total, Math.round(cortadoApp + extraRefCode * shareColor));
    totalCortado += cortado;
    // Tallas que realmente faltan por cortar — el pedido original menos lo
    // ya registrado en cortesRealizados para esa talla puntual (no el total
    // parejo, para no restar de una talla que no se tocó).
    const tallasCortadas = cortadoTallaPorRefApp.get(r.id) || {};
    const tallasRestantes = {};
    Object.keys(r.tallas || {}).forEach((t) => {
      tallasRestantes[t] = Math.max(0, (r.tallas[t] || 0) - (tallasCortadas[t] || 0));
    });
    return { refId: r.id, ref: r.ref, descripcion: r.descripcion, tallas: tallasRestantes, total, cortado, pendiente: Math.max(0, total - cortado) };
  });
  return { totalPedido, totalCortado, totalPendiente: Math.max(0, totalPedido - totalCortado), porRef };
}
// Lista de pedidos activos con algo pendiente por cortar, ordenada por
// fecha de despacho: vencidos primero (los más vencidos arriba), luego los
// próximos a vencer, y al final los que no tienen fecha. Así el analista no
// tiene que adivinar por dónde empezar — la cola ya viene en orden de
// urgencia. Se recalcula sola cada vez que se vuelve a Congelar en Vigentes,
// o cuando se sube un nuevo reporte de Ventas Perdidas o Planeación.
function ColaSugerida({ pedidos, vpRefMap, lotesCortadoMap, onSelectPedido }) {
  const activos = pedidos.filter((p) => p.estado === "activo");
  const conPendiente = activos
    .map((p) => ({ pedido: p, ...calcularCortadoPendiente(p, vpRefMap, lotesCortadoMap) }))
    .filter((x) => x.totalPendiente > 0);
  conPendiente.sort((a, b) => {
    const fa = a.pedido.fechaDespacho || "9999-12-31";
    const fb = b.pedido.fechaDespacho || "9999-12-31";
    return fa.localeCompare(fb);
  });
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: C.ink }}>
        📋 Cola sugerida de corte
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: C.slate, maxWidth: 640 }}>
        Ordenada por fecha de despacho — los vencidos y los más próximos a vencer aparecen primero. El pendiente de cada referencia se calcula cruzando Planeación, Ventas Perdidas y lo registrado aquí en Corte.
      </p>
      {!conPendiente.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          No hay pendientes por cortar en este momento. 🎉
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {conPendiente.map(({ pedido: p, totalPedido, totalPendiente, porRef }, i) => {
            const sem = semaforo(p.fechaDespacho);
            const pendientesRef = porRef.filter((r) => r.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente);
            return (
              <div
                key={p.id}
                onClick={() => onSelectPedido(p.id)}
                style={{
                  background: C.white,
                  borderRadius: 12,
                  padding: 16,
                  cursor: "pointer",
                  border: `1px solid ${C.border}`,
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,26,46,0.09)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>
                      #{i + 1} · Pedido {p.numero}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginTop: 2 }}>{p.cliente}</div>
                  </div>
                  <div style={{ padding: "4px 10px", background: sem.bg, color: sem.color, borderRadius: 20, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                    📅 {sem.label}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.slate, margin: "8px 0" }}>
                  Despacho: {p.fechaDespacho || "—"} · <strong style={{ color: C.amber }}>{fmtNum(totalPendiente)}</strong> de {fmtNum(totalPedido)} prendas pendientes
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {pendientesRef.slice(0, 8).map((r) => (
                    <span
                      key={r.ref}
                      style={{ fontSize: 11, padding: "3px 8px", background: C.canvas, borderRadius: 20, color: C.ink, fontWeight: 700 }}
                    >
                      {r.ref} <span style={{ color: C.amber }}>{fmtNum(r.pendiente)}</span>
                    </span>
                  ))}
                  {pendientesRef.length > 8 && (
                    <span style={{ fontSize: 11, color: C.slate, alignSelf: "center" }}>+{pendientesRef.length - 8} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// ─── PROGRAMACIÓN DE CORTE (día primero, por cliente y referencia) ────────────
// Flujo: se elige el día para el que se va a programar, se ve lo disponible
// agrupado por cliente (cruzando Planeación + Ventas Perdidas + Corte, igual
// que en toda la app), se marcan las referencias puntuales que se van a
// cortar ese día (no hace falta programar el pedido completo de una vez —
// distintas referencias del mismo pedido pueden ir a días distintos) y se
// programan en lote. El cumplimiento se revisa solo por referencia: cuando
// el pendiente de esa referencia puntual llega a 0, queda cumplida con la
// fecha real en que se cortó, comparada contra la fecha programada.
function ProgramacionCorteView({ pedidos, vpRefMap, lotesCortadoMap, preciosMap, trabajadores, programacion, onProgramar, onCancelar, onPartirCorte, onEditarFecha, onEditarCantidad, onEditarCumplido, onEliminarCumplido, onSelectPedido, onRegistrarCorteReal, onRegistrarCorteManual, plantasConfig, cortadoresConfig, telas, estadisticasTela, metrosUsadosMeson, itemsUsadosMeson, onGuardarProgramacionHecha, onAprobarProgramacionHecha, puedeAprobarCorte, usuarioActual, lotesExistentes, onAsignarLoteReal, onQuitarRefDeCorte, onDevolverCorteReal, onEditarCantidadesCorte, onActualizarHorarioCorte, onEditarMesonCorte, subTabInicial, produccionSubTabInicial, navProduccionTs, isAdmin }) {
  const [fechaSel, setFechaSel] = useState(today());
  // Cuántos cortes (tandas físicas) separados se van a programar de una vez
  // con la selección actual — por defecto 1 (comportamiento de siempre). Si
  // el usuario pone más de 1 (ej. 3), la cantidad de cada referencia
  // seleccionada se reparte en partes iguales entre esa cantidad de cortes,
  // cada uno con su propia fecha (para que después cada uno se pueda asignar
  // a su propia planta/mesón/día en Programación de Mesones sin tener que
  // partir manualmente un solo ítem programado).
  const [numCortes, setNumCortesRaw] = useState(1);
  const [fechasCortes, setFechasCortes] = useState([today()]);
  function actualizarNumCortes(n) {
    const val = Math.max(1, Math.min(20, n || 1));
    setNumCortesRaw(val);
    setFechasCortes((prev) => {
      const next = prev.slice(0, val);
      while (next.length < val) {
        const ultima = next[next.length - 1] || fechaSel;
        next.push(sumarDiasISO(ultima, 1));
      }
      return next;
    });
  }
  // Reparte una cantidad entre N cortes en partes lo más iguales posible —
  // el residuo (si no divide exacto) se lo llevan los primeros cortes.
  function repartirEntreCortes(cantidad, n) {
    const base = Math.floor(cantidad / n);
    const resto = cantidad % n;
    return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
  }
  // Selección por talla: Map key `${pedidoId}__${ref}__${talla}` -> { ...contexto, cantidad }
  // (cantidad es editable, por si no alcanza la tela para toda la talla).
  const [seleccion, setSeleccion] = useState(new Map());
  // Selección Cliente → Pedido en la pestaña Programar: primero se elige el
  // cliente en un desplegable, luego se hace click sobre el pedido para ver
  // sus referencias y elegir qué tallas programar.
  const [clienteSel, setClienteSel] = useState("");
  const [pedidoSel, setPedidoSel] = useState("");
  const [subTab, setSubTab] = useState(subTabInicial || "programar");
  // Vista de calendario de "Programados Pendientes" — semana o mes completo.
  const [vista, setVista] = useState("semana");
  // Fecha ancla del calendario (qué semana/mes se está mostrando) — no tiene
  // que ver con `fechaSel`, que es el día al que se está programando algo
  // nuevo en la pestaña Programar.
  const [calFecha, setCalFecha] = useState(today());
  // Grupo (referencia de un día) que se está partiendo en varios cortes de
  // una vez desde el Cronograma — null si no hay ninguno abierto. Se abre un
  // cuadro chiquito para elegir en cuántos cortes partirlo (reparte la
  // cantidad en partes iguales entre todos, talla por talla) y de ahí en
  // adelante cada corte aparece separado, tanto en el Cronograma como en
  // Producción Corte / Programación de Mesones.
  const [partiendoGrupo, setPartiendoGrupo] = useState(null);
  const [numPartes, setNumPartes] = useState(2);
  async function confirmarPartirCorte() {
    if (!partiendoGrupo || !onPartirCorte) return;
    await onPartirCorte(partiendoGrupo, numPartes);
    setPartiendoGrupo(null);
    setNumPartes(2);
  }
  // Referencias (código de estilo) desplegadas en la tabla de selección de
  // Programar — por defecto colapsadas, para que no se acumulen tantas
  // filas de colores cuando una referencia trae varios colores/pintas.
  const [refsAbiertas, setRefsAbiertas] = useState(new Set());
  function toggleRefAbierta(refCode) {
    setRefsAbiertas((s) => {
      const next = new Set(s);
      if (next.has(refCode)) next.delete(refCode);
      else next.add(refCode);
      return next;
    });
  }
  const [editandoCumplidoId, setEditandoCumplidoId] = useState(null);
  const [edicionCumplido, setEdicionCumplido] = useState({ cantidad: 0, fecha: "" });
  // "Producción Corte" agrupa dos pestañas internas: "Programación de
  // Mesones" (datos teóricos del corte) e "Ingreso de Corte Real" (lo que
  // antes era ir directo al detalle del pedido a cargar Entrada de Corte).
  const [produccionSubTab, setProduccionSubTab] = useState(produccionSubTabInicial || "mesones");
  // Este componente ya NO se desmonta cuando se registra un corte real desde
  // "Ingreso de Corte Real" (antes se iba a la pantalla completa del pedido
  // y volvía, lo que forzaba un remount que releía subTabInicial/
  // produccionSubTabInicial como estado inicial). Como ahora se queda
  // montado todo el tiempo, hay que reaccionar explícitamente cada vez que
  // el padre pide saltar de pestaña (navProduccionTs cambia con cada pedido
  // nuevo, aunque el destino sea el mismo de la vez anterior).
  useEffect(() => {
    if (!navProduccionTs) return;
    if (subTabInicial) setSubTab(subTabInicial);
    if (produccionSubTabInicial) setProduccionSubTab(produccionSubTabInicial);
  }, [navProduccionTs]);
  // Fecha y grupo seleccionados en "Programación de Mesones" — ahí es donde
  // ahora se ingresan los datos teóricos del corte (antes se hacía en un
  // modal encima de "Programados Pendientes").
  const [mesonesFecha, setMesonesFecha] = useState(today());
  const [mesonesGrupoKey, setMesonesGrupoKey] = useState(null);
  // "Disponibilidad de Mesones": planta + día elegidos para ver el timeline
  // de TODOS los mesones de esa planta a la vez (mismo timeline que ya se
  // usa al programar un corte puntual, pero para verlos todos juntos).
  const [dispPlanta, setDispPlanta] = useState("");
  const [dispFecha, setDispFecha] = useState(today());
  // Modal de impresión del trabajo del día por cortador — se abre desde
  // Programación de Mesones, para la fecha que se esté viendo ahí.
  const [imprimiendoCortadores, setImprimiendoCortadores] = useState(false);
  // Fecha elegida en "Ingreso de Corte Real" — lista, por día, las
  // referencias que ya tienen Programación de Mesones hecha y están listas
  // para cargar el corte real (unidades, lote).
  const [corteRealFecha, setCorteRealFecha] = useState(today());
  // "Mi día" — resumen de un solo día (por defecto hoy): lo programado que
  // falta cortar y lo que ya se cortó real, en una sola pantalla, sin tener
  // que ir pestaña por pestaña ni buscar pedido por pedido.
  const [miDiaFecha, setMiDiaFecha] = useState(today());
  // Ítem "Listo para cortar" que está abierto en Ingreso de Corte Real — se
  // despliega inline debajo de la lista (igual que Programación de
  // Mesones), en vez de abrir una ventana modal aparte.
  const [corteRealSelKey, setCorteRealSelKey] = useState(null);
  // Referencia "pareja" (vinculada en Programación de Mesones al mismo
  // trazo) que hay que abrir automáticamente apenas se guarde el corte real
  // que se está registrando ahora — así el patronista las hace seguidas sin
  // volver a buscar. Null si no hay ninguna en cola.
  const [parejaPendiente, setParejaPendiente] = useState(null);
  // Keys para las que el patronista ya dijo "No, solo esta" — no se les
  // vuelve a mostrar el aviso de vínculo en esta sesión.
  const [parejaDescartadaKeys, setParejaDescartadaKeys] = useState(() => new Set());
  // Texto que el patronista va escribiendo por fila en "Cortes Aprobados"
  // antes de guardar el número de lote — separado por key de grupo.
  const [loteInputs, setLoteInputs] = useState({});
  // Qué corte real está expandido en "Históricos" (id del corte dentro de
  // cortesRealizados) — null si ninguno.
  const [historicoAbierto, setHistoricoAbierto] = useState(null);
  // Qué corte real está expandido en "Cortes Aprobados" — el patronista
  // primero hace clic para ver el detalle completo (tendido, corte, tallas)
  // y ahí adentro pone el lote, en vez de un input suelto en la fila.
  const [aprobadoAbierto, setAprobadoAbierto] = useState(null);
  // Confirmación inline antes de quitar una referencia de un corte real ya
  // registrado (p.ej. cuando por error se mezclaron 2 referencias en un solo
  // registro) — key `${corteId}__${refCode}`, null si no hay ninguna abierta.
  const [confirmQuitarRef, setConfirmQuitarRef] = useState(null);
  // Confirmación inline antes de devolver un corte completo (todas sus
  // referencias) de "Cortes Aprobados" de vuelta a "Ingreso de Corte Real" —
  // key = id del corte, null si no hay ninguna abierta.
  const [confirmDevolverCorte, setConfirmDevolverCorte] = useState(null);
  // Edición de cantidades por talla en "Cortes Aprobados" (solo admin) — por
  // si el patronista se equivocó digitando al registrar el corte real. Se
  // guarda el id del corte en edición y una copia de trabajo de sus `refs`
  // (con las tallas editables); al guardar se recalculan los totales y se
  // reemplaza el corte completo dentro de cortesRealizados.
  const [editandoCantidades, setEditandoCantidades] = useState(null);
  const [cantidadesEdit, setCantidadesEdit] = useState(null);
  // Cortador corregible desde el mismo panel de "Editar cantidades" — por si
  // se equivocaron de persona al registrar el corte real.
  const [cortadorEdit, setCortadorEdit] = useState("");
  // Color/referencia elegido en el desplegable "+ Agregar color faltante"
  // (dentro del mismo panel de edición) antes de meterlo a cantidadesEdit.
  const [colorAAgregar, setColorAAgregar] = useState("");
  // Edición en línea del Horario de Corte (hora inicio/fin) — se completa
  // después de Ingreso de Corte Real, en "Cortes Aprobados" o "Históricos"
  // según en cuál de las dos haya quedado el corte. Clave por id de corte;
  // { horaInicio, horaFin } mientras se está editando, se limpia al guardar.
  const [horarioCorteEdit, setHorarioCorteEdit] = useState({});
  // Edición en línea del Mesón de un corte real ya registrado (Cortes
  // Aprobados / Históricos) — para corregir cuando quedó mal asignado o
  // quedó apuntando a un mesón que ya no existe en la configuración de la
  // planta (se ve como un id crudo en vez de un nombre, ej. "1cjycti").
  const [editandoMeson, setEditandoMeson] = useState(null);
  const [mesonEditValor, setMesonEditValor] = useState("");
  // "Registrar Manual" (nuevo subTab): búsqueda de un pedido por número o
  // cliente sin importar su estado (activo/terminado/cerrado) — para poder
  // cargar retroactivamente un corte que se hizo pero nunca se registró en
  // ATLAS, incluso si el pedido ya no aparece en la cola normal de Corte.
  const [busquedaManual, setBusquedaManual] = useState("");
  const [pedidoManualSel, setPedidoManualSel] = useState(null);
  // Edición de cantidades por talla (cortador, tallas, agregar color
  // faltante) — funciones a nivel de componente para poder usarse tanto
  // desde "Cortes Aprobados" (cortes sin lote todavía) como desde
  // "Históricos" (cortes que ya tienen lote asignado); ambas pestañas
  // comparten el mismo estado editandoCantidades/cantidadesEdit/etc.
  function iniciarEdicionCantidades(c) {
    setEditandoCantidades(c.id);
    setCantidadesEdit(JSON.parse(JSON.stringify(c.refs || [])));
    setCortadorEdit(c.cortador || "");
    setColorAAgregar("");
  }
  function cancelarEdicionCantidades() {
    setEditandoCantidades(null);
    setCantidadesEdit(null);
    setCortadorEdit("");
    setColorAAgregar("");
  }
  function actualizarTallaEdit(refIdx, tallaKey, valor) {
    setCantidadesEdit((refs) => {
      const copia = [...refs];
      const ref = { ...copia[refIdx], tallas: { ...copia[refIdx].tallas } };
      const n = Math.max(0, parseInt(valor, 10) || 0);
      ref.tallas[tallaKey] = n;
      ref.total = Object.values(ref.tallas).reduce((s, v) => s + (Number(v) || 0), 0);
      copia[refIdx] = ref;
      return copia;
    });
  }
  // Mete al corte un color de la MISMA referencia/pedido que no se trajo al
  // momento de cortar (ej. se cortó pero se le olvidó incluirlo) — se
  // precarga con las tallas que trae el pedido original para ese color,
  // editable después igual que los demás.
  function agregarColorFaltante(pedidoDelCorte) {
    if (!colorAAgregar || !pedidoDelCorte) return;
    const refPedido = (pedidoDelCorte.referencias || []).find((r) => r.id === colorAAgregar);
    if (!refPedido) return;
    setCantidadesEdit((refs) => {
      if ((refs || []).some((r) => r.refId === refPedido.id)) return refs;
      return [
        ...(refs || []),
        {
          refId: refPedido.id,
          ref: refPedido.ref,
          descripcion: refPedido.descripcion,
          tallas: { ...refPedido.tallas },
          total: Object.values(refPedido.tallas || {}).reduce((s, v) => s + (Number(v) || 0), 0),
        },
      ];
    });
    setColorAAgregar("");
  }
  // Corrige la referencia de una fila YA existente en el corte (por ejemplo,
  // se registró la referencia equivocada por error) — cambia a cuál
  // referencia/color del mismo pedido queda atribuida esa fila, sin tocar
  // las tallas/cantidades ya contadas (esas siguen siendo correctas, solo
  // estaban mal etiquetadas). No permite dejar dos filas con la misma
  // referencia.
  function cambiarReferenciaEdit(refIdx, nuevoRefId, pedidoDelCorte) {
    if (!nuevoRefId || !pedidoDelCorte) return;
    const refPedido = (pedidoDelCorte.referencias || []).find((r) => r.id === nuevoRefId);
    if (!refPedido) return;
    setCantidadesEdit((refs) => {
      const copia = [...refs];
      copia[refIdx] = { ...copia[refIdx], refId: refPedido.id, ref: refPedido.ref, descripcion: refPedido.descripcion };
      return copia;
    });
  }
  async function guardarCantidadesEdit(pedidoId, corteId) {
    await onEditarCantidadesCorte(pedidoId, corteId, cantidadesEdit, cortadorEdit);
    setEditandoCantidades(null);
    setCantidadesEdit(null);
    setCortadorEdit("");
    setColorAAgregar("");
  }
  // Los cortes reales (cortesRealizados) guardan el ID interno del mesón
  // (form.meson usa m.id, no m.nombre), así que para mostrarlo hay que
  // resolverlo contra la planta correspondiente — si no se encuentra (o es
  // un dato viejo sin id válido), se muestra el id crudo como respaldo.
  function nombreMeson(plantaNombre, mesonId) {
    if (!mesonId) return "";
    const pl = (plantasConfig || []).find((p) => p.nombre === plantaNombre);
    const m = pl?.mesones?.find((mm) => mm.id === mesonId);
    return m?.nombre || mesonId;
  }
  // Campo "Mesón:" editable dentro del detalle de un corte real (Cortes
  // Aprobados / Históricos) — reusado en las dos tablas. Se necesita porque
  // un corte real puede quedar apuntando a un mesón que ya no existe en la
  // configuración de la planta (se borró o se renombró), y ahí nombreMeson
  // muestra el id crudo sin forma de corregirlo desde la pantalla normal.
  function renderMesonEditable(c) {
    const enEdicion = editandoMeson === c.id;
    const mesonesPlanta = (plantasConfig || []).find((p) => p.nombre === c.planta)?.mesones || [];
    if (!enEdicion) {
      return (
        <div>
          <b>Mesón:</b> {nombreMeson(c.planta, c.meson) || "—"}
          {isAdmin && (
            <button
              onClick={() => { setEditandoMeson(c.id); setMesonEditValor(c.meson || ""); }}
              title="Corregir el mesón de este corte"
              style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0, marginLeft: 6 }}
            >
              ✎
            </button>
          )}
        </div>
      );
    }
    return (
      <div>
        <b>Mesón:</b>
        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
          <select
            value={mesonEditValor}
            onChange={(e) => setMesonEditValor(e.target.value)}
            style={{ padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit", flex: 1, minWidth: 0 }}
          >
            <option value="">— Sin mesón —</option>
            {mesonesPlanta.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
            {c.meson && !mesonesPlanta.some((m) => m.id === c.meson) && (
              <option value={c.meson}>{c.meson} (no encontrado)</option>
            )}
          </select>
          <button
            onClick={async () => { await onEditarMesonCorte(c.pedidoId, c.id, mesonEditValor || null); setEditandoMeson(null); }}
            title="Guardar"
            style={{ background: C.jade, border: "none", borderRadius: 6, padding: "4px 10px", color: C.white, fontWeight: 700, fontSize: 11, cursor: "pointer", flexShrink: 0 }}
          >
            ✓
          </button>
          <button
            onClick={() => setEditandoMeson(null)}
            title="Cancelar"
            style={{ background: "none", border: "none", color: C.slate, fontWeight: 700, fontSize: 11, cursor: "pointer", flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }
  // Capas totales de un grupo (una referencia, uno o varios colores) —
  // OJO: a diferencia de largoTrazo (un solo trazo físico compartido entre
  // colores), las capas SÍ son por color — cada color apila su propia
  // cantidad encima del mismo trazo (ver "Capas por color" en Programación
  // de Mesones). Por eso el total real es la SUMA de las capas de todos los
  // colores del grupo, no un solo valor (g.capas, que solo trae la del
  // primer color, quedaba corto).
  function capasTotalesGrupo(g) {
    return (g.colores || []).reduce((s, c) => s + (c.capas || 0), 0);
  }
  // Capas teóricas realmente comprometidas en un mesón (o su grupo
  // compartido) para una fecha+planta puntual — igual que arriba, se suman
  // color por color directo sobre `programacion` (un doc por color), sin
  // deduplicar por referencia (a diferencia de metrosUsadosMeson/
  // itemsUsadosMeson, que sí deduplican porque el trazo es uno solo).
  function capasUsadasMeson(fecha, plantaNombre, mesonId, grupoId) {
    let total = 0;
    (programacion || []).forEach((pr) => {
      if (pr.fechaProgramada !== fecha || pr.planta !== plantaNombre) return;
      if (!(pr.etapa === "programacion_hecha" || pr.estado === "cumplido")) return;
      const mismoMeson = pr.meson === mesonId;
      const mismoGrupo = grupoId && pr.mesonGrupo === grupoId;
      if (!(mismoMeson || mismoGrupo)) return;
      total += pr.capas || 0;
    });
    return total;
  }
  // Panel para completar el Horario de Corte (hora inicio/fin) — reusado
  // tanto en "Cortes Aprobados" como en "Históricos", ya que un corte puede
  // quedar en cualquiera de las dos según si ya tiene lote o no. Se precarga
  // con horaFinTendido como sugerencia de inicio (lo normal es que el corte
  // arranque justo cuando termina el tendido), editable si no fue así.
  // OJO: es una función normal que se LLAMA e inserta su JSX (no un
  // componente `<...>` aparte) — así React no le da una identidad nueva en
  // cada render y los inputs no pierden el foco mientras se escribe.
  function renderHorarioCorte(c) {
    const edit = horarioCorteEdit[c.id];
    const hInicio = edit?.horaInicio ?? c.horaInicio ?? c.horaFinTendido ?? "";
    const hFin = edit?.horaFin ?? c.horaFin ?? "";
    const cambiado = !!edit;
    // El corte no puede haber arrancado antes de que terminara el tendido de
    // ese mismo mesón — si alguien digita una hora anterior por error (se
    // equivocó de AM/PM, escribió mal, etc.), se avisa y no se deja guardar.
    const antesDeTendido = !!(c.horaFinTendido && hInicio && hInicio < c.horaFinTendido);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, padding: "10px 12px", background: C.blueBg, borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>Horario Corte:</span>
          <input
            type="time"
            value={hInicio}
            onChange={(e) => setHorarioCorteEdit((s) => ({ ...s, [c.id]: { horaInicio: e.target.value, horaFin: hFin } }))}
            style={{ padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${antesDeTendido ? C.red : C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
          />
          <span style={{ fontSize: 11, color: C.slate }}>a</span>
          <input
            type="time"
            value={hFin}
            onChange={(e) => setHorarioCorteEdit((s) => ({ ...s, [c.id]: { horaInicio: hInicio, horaFin: e.target.value } }))}
            style={{ padding: "6px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
          />
          {cambiado && (
            <Btn
              small
              variant="success"
              disabled={antesDeTendido}
              onClick={async () => {
                await onActualizarHorarioCorte(c.pedidoId, c.id, hInicio, hFin);
                setHorarioCorteEdit((s) => { const n = { ...s }; delete n[c.id]; return n; });
              }}
            >
              Guardar horario
            </Btn>
          )}
        </div>
        {antesDeTendido && (
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>
            ⚠ La hora de inicio no puede ser antes de que terminó el tendido de ese mesón ({c.horaFinTendido}).
          </div>
        )}
      </div>
    );
  }
  // Click sobre un grupo (una referencia con todos sus colores) de
  // "Cronograma de Corte" o "Cortes Vencidos": si TODOS sus colores ya
  // tienen Programación Hecha, va directo a Entrada de Corte con el grupo
  // completo; si falta alguno, se manda a "Producción Corte" → "Programación
  // de Mesones" (con la fecha y el grupo ya preseleccionados) para completar
  // ahí los datos teóricos (planta/mesón/tela/trazo/capas, compartidos entre
  // colores).
  function abrirFlujoCorte(grupo) {
    const listo = grupo.colores.every((c) => c.etapa === "programacion_hecha");
    const fecha = grupo.colores[0]?.fechaProgramada || grupo.fechaProgramada || today();
    const key = grupo.key || `${grupo.pedidoId}__${grupo.ref}`;
    if (listo) {
      // Ya tiene Programación de Mesones lista — se manda a "Ingreso de
      // Corte Real" con esa referencia ya desplegada, en vez de abrir una
      // ventana aparte.
      setCorteRealFecha(fecha);
      setCorteRealSelKey(key);
      setSubTab("produccion");
      setProduccionSubTab("corte_real");
      return;
    }
    setMesonesFecha(fecha);
    setMesonesGrupoKey(key);
    setSubTab("produccion");
    setProduccionSubTab("mesones");
  }
  const activos = pedidos.filter((p) => p.estado === "activo");
  const pendientesProg = programacion.filter((pr) => pr.estado !== "cumplido");
  const cumplidosProg = [...programacion.filter((pr) => pr.estado === "cumplido")].sort(
    (a, b) => (b.fechaCumplioISO || "").localeCompare(a.fechaCumplioISO || "")
  );
  // Se identifica por refId (id único de la referencia, no el código `ref`
  // que puede repetirse entre colores) — con fallback a `ref` solo para
  // registros viejos que se hayan creado antes de guardar refId.
  const yaProgramados = new Set(pendientesProg.map((pr) => `${pr.pedidoId}__${pr.refId || pr.ref}`));
  // Costo diario del centro de costo: nómina total entre los días laborales
  // del mes (20, fijo — así trabaja la empresa). Se usa para saber si lo que
  // se va programando/programado en un día alcanza a cubrirlo.
  const nominaTotal = (trabajadores || []).reduce((s, t) => s + (t.sueldo || 0), 0);
  const costoDia = nominaTotal / DIAS_LABORALES_MES;
  function precioRef(ref) {
    return preciosMap?.get(String(ref).trim()) || 0;
  }
  // Disponible para programar, agrupado por cliente → pedido, con el
  // desglose horizontal por talla (igual formato que el informe de Vigentes
  // en Diseño → Pedidos) — se excluye lo que ya tenga una programación
  // activa (para reprogramar hay que cancelar antes).
  //
  // EXCEPCIÓN: si esa programación activa YA se usó para un corte real
  // (aunque haya sido parcial, ej. se cortaron 50 de 130) y todavía queda
  // pendiente, sí se vuelve a mostrar — la entrada de Mesones original ya
  // cumplió su función (produjo un corte) y no sirve para programar una
  // segunda ronda; si no se hiciera esta excepción, el color quedaría
  // escondido de "Programar" para siempre aunque falte por cortar, porque
  // esa entrada solo se marca "cumplido" cuando el pendiente llega a 0.
  const porCliente = new Map(); // cliente -> Map(pedidoId -> { pedido, filas })
  activos.forEach((p) => {
    const { porRef } = calcularCortadoPendiente(p, vpRefMap, lotesCortadoMap);
    const filas = porRef.filter((r) => {
      if (!(r.pendiente > 0)) return false;
      if (!yaProgramados.has(`${p.id}__${r.refId}`)) return true;
      const yaSeCortoAlgo = (p.cortesRealizados || []).some((c) =>
        (c.refs || []).some((cr) => cr.refId === r.refId)
      );
      return yaSeCortoAlgo;
    });
    if (!filas.length) return;
    const clienteKey = p.cliente || "Sin cliente";
    if (!porCliente.has(clienteKey)) porCliente.set(clienteKey, new Map());
    porCliente.get(clienteKey).set(p.id, { pedido: p, filas });
  });
  const clientesOrdenados = [...porCliente.keys()].sort();
  const totalDisponibles = [...porCliente.values()].reduce(
    (s, pedidosMap) => s + [...pedidosMap.values()].reduce((s2, { filas }) => s2 + filas.length, 0),
    0
  );
  // Todas las combinaciones posibles ref+talla de un cliente, con su
  // cantidad ordenada como valor por defecto (editable al seleccionar) — se
  // usa tanto para pintar la tabla como para "seleccionar toda la ref/todo
  // el cliente".
  function itemsDelCliente(cliente) {
    const pedidosMap = porCliente.get(cliente);
    const items = [];
    pedidosMap.forEach(({ pedido, filas }) => {
      filas.forEach((r) => {
        Object.entries(r.tallas || {}).forEach(([t, cant]) => {
          if (cant > 0) {
            items.push({
              // La key usa refId (único por color/pinta) — NO el código
              // `ref`, que puede repetirse entre varios colores del mismo
              // pedido y haría que seleccionar uno marcara los demás.
              key: `${pedido.id}__${r.refId}__${t}`,
              pedidoId: pedido.id,
              numero: pedido.numero,
              cliente,
              ref: r.ref,
              refId: r.refId,
              descripcion: r.descripcion,
              talla: t,
              cantidad: cant,
              pendienteRef: r.pendiente,
            });
          }
        });
      });
    });
    return items;
  }
  // Marca/desmarca una talla puntual de una referencia (item ya trae la
  // cantidad por defecto = lo que se ordenó de esa talla).
  function toggleItem(item) {
    setSeleccion((s) => {
      const next = new Map(s);
      if (next.has(item.key)) next.delete(item.key);
      else next.set(item.key, item);
      return next;
    });
  }
  function setCantidadItem(key, cantidad) {
    setSeleccion((s) => {
      const next = new Map(s);
      const it = next.get(key);
      if (it) next.set(key, { ...it, cantidad: Math.max(0, cantidad) });
      return next;
    });
  }
  // Selecciona/deselecciona TODAS las tallas de una referencia puntual a la
  // vez (para cuando no hace falta elegir talla por talla).
  function toggleTodaLaRef(items) {
    setSeleccion((s) => {
      const next = new Map(s);
      const todasMarcadas = items.every((it) => next.has(it.key));
      items.forEach((it) => (todasMarcadas ? next.delete(it.key) : next.set(it.key, it)));
      return next;
    });
  }
  function toggleTodosCliente(cliente) {
    const items = itemsDelCliente(cliente);
    toggleTodaLaRef(items);
  }
  // Valor estimado (cantidad seleccionada × precio de corte por referencia)
  // de lo que se tiene seleccionado en este momento — para comparar contra
  // el costo diario del centro de costo antes de confirmar.
  const ingresoSeleccion = [...seleccion.values()].reduce((s, it) => s + it.cantidad * precioRef(it.ref), 0);
  // Agrupa la selección (que está a nivel talla) de vuelta a nivel
  // referencia — un solo ítem de Programación por pedido+ref, con el
  // desglose de tallas/cantidades elegidas (puede ser menos que el
  // pendiente total si no alcanza la tela para todo).
  function confirmarProgramacion() {
    const grupos = new Map();
    seleccion.forEach((it) => {
      if (it.cantidad <= 0) return;
      // Agrupar por refId (no por ref) — así dos colores con el mismo
      // código de referencia quedan como programaciones separadas.
      const gkey = `${it.pedidoId}__${it.refId}`;
      if (!grupos.has(gkey)) {
        grupos.set(gkey, {
          pedidoId: it.pedidoId,
          numero: it.numero,
          cliente: it.cliente,
          ref: it.ref,
          refId: it.refId,
          descripcion: it.descripcion,
          pendiente: it.pendienteRef,
          tallas: {},
          cantidadProgramada: 0,
        });
      }
      const g = grupos.get(gkey);
      g.tallas[it.talla] = (g.tallas[it.talla] || 0) + it.cantidad;
      g.cantidadProgramada += it.cantidad;
    });
    const gruposArr = [...grupos.values()];
    if (!gruposArr.length) return;
    if (numCortes <= 1) {
      // Comportamiento de siempre: un solo corte, una sola fecha.
      onProgramar(gruposArr, fechaSel);
    } else {
      // Varios cortes: cada referencia seleccionada se reparte en partes
      // iguales (talla por talla) entre los N cortes, y cada corte se manda
      // por separado con su propia fecha — quedan como programaciones
      // independientes, cada una programable a su propia planta/mesón/día
      // en Programación de Mesones.
      for (let i = 0; i < numCortes; i++) {
        const itemsCorte = gruposArr
          .map((g) => {
            const tallas = {};
            let cantidadProgramada = 0;
            Object.entries(g.tallas).forEach(([t, cant]) => {
              const partes = repartirEntreCortes(cant, numCortes);
              if (partes[i] > 0) {
                tallas[t] = partes[i];
                cantidadProgramada += partes[i];
              }
            });
            if (cantidadProgramada <= 0) return null;
            return { ...g, tallas, cantidadProgramada };
          })
          .filter(Boolean);
        if (itemsCorte.length) onProgramar(itemsCorte, fechasCortes[i] || fechaSel);
      }
    }
    setSeleccion(new Map());
  }
  const hoy = today();
  const pendientesConEstado = pendientesProg
    .map((pr) => {
      const dias = Math.round((new Date(pr.fechaProgramada) - new Date(hoy)) / 86400000);
      return { ...pr, dias, vencido: dias < 0 };
    })
    .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
  const vencidosCount = pendientesConEstado.filter((p) => p.vencido).length;
  const vencidosProg = pendientesConEstado.filter((p) => p.vencido);
  // Pendientes agrupados por fecha programada — la base del calendario.
  const porDiaPendientes = new Map();
  pendientesConEstado.forEach((p) => {
    if (!porDiaPendientes.has(p.fechaProgramada)) porDiaPendientes.set(p.fechaProgramada, []);
    porDiaPendientes.get(p.fechaProgramada).push(p);
  });
  // Datos de un día del calendario: qué hay programado, cuánto ingreso
  // estimado suma y si eso alcanza a cubrir el costo diario del centro de
  // costo (el mismo indicador ✓/⚠ que ya se usaba al seleccionar, ahora
  // visible por día directo en el calendario).
  // Agrupa una lista cualquiera de ítems (uno por color) en "grupos" por
  // referencia (pedidoId + ref) — así se muestra un chip/fila por ref con la
  // cantidad TOTAL sumada entre colores, en vez de uno repetido por cada
  // color. Reusable tanto para un solo día (calendario) como para TODOS los
  // pendientes sin importar el día (ej. "Cortes Aprobados", que no filtra
  // por fecha porque el patronista puede necesitar poner lote a cosas de
  // varios días distintos).
  function agruparPorRef(items) {
    const gruposMap = new Map();
    items.forEach((it) => {
      // Si esta referencia se partió en varios cortes (distinto mesón/
      // cortador/horario cada uno, ver "N° de Corte" en Programación de
      // Mesones), cada etiqueta de corte arma SU PROPIO grupo — así el
      // Cronograma de Corte y Producción Corte muestran cada corte por
      // separado (ej. 288 + 288) en vez de un solo bloque de 576. Los
      // colores que todavía no se les asignó ningún corte (numeroCorte
      // vacío) siguen agrupados juntos, como siempre.
      const gkey = `${it.pedidoId}__${it.ref}__${it.numeroCorte || ""}`;
      if (!gruposMap.has(gkey)) {
        gruposMap.set(gkey, {
          key: gkey,
          pedidoId: it.pedidoId,
          numero: it.numero,
          cliente: it.cliente,
          ref: it.ref,
          numeroCorte: it.numeroCorte || null,
          colores: [],
          cantidadTotal: 0,
          vencido: false,
        });
      }
      const g = gruposMap.get(gkey);
      g.colores.push(it);
      g.cantidadTotal += it.cantidadProgramada ?? it.cantidadPendiente ?? 0;
      if (it.vencido) g.vencido = true;
    });
    return [...gruposMap.values()].map((g) => ({
      ...g,
      etapa: g.colores.every((c) => c.etapa === "programacion_hecha") ? "programacion_hecha" : "en_programacion",
      // Antes solo se copiaban planta/mesón acá — al reabrir una referencia
      // YA guardada (ej. el analista entrando a aprobar lo que el cortador
      // acaba de guardar), ProgramacionMesonPanel arranca su formulario
      // leyendo grupo.tipoTela/largoTrazo/capas/horas/cortador/fechaProgramada
      // directo del grupo (no de colores[0]) — como esos campos no se
      // copiaban, el formulario se veía vacío aunque el dato sí estaba
      // guardado en cada color. Se copian todos los campos teóricos acá para
      // que cualquier grupo armado con agruparPorRef traiga todo completo.
      planta: g.colores[0]?.planta || "",
      meson: g.colores[0]?.meson || "",
      cortador: g.colores[0]?.cortador || "",
      tipoTela: g.colores[0]?.tipoTela || "",
      largoTrazo: g.colores[0]?.largoTrazo || null,
      capas: g.colores[0]?.capas || null,
      horaInicioEstimada: g.colores[0]?.horaInicioEstimada || "",
      horaFinEstimada: g.colores[0]?.horaFinEstimada || "",
      fechaProgramada: g.colores[0]?.fechaProgramada || "",
      // La curva de tallas (cuántas veces se marca cada talla en el trazo)
      // es compartida por todo el trazo, igual que planta/mesón/tela.
      curva: g.colores[0]?.curva || null,
      // Si esta referencia se vinculó con otra en el mismo trazo (ver
      // ProgramacionMesonPanel), todos sus colores comparten este id — sirve
      // para encontrar la referencia "pareja" en Ingreso de Corte Real.
      vinculoTrazoId: g.colores[0]?.vinculoTrazoId || null,
    }));
  }
  function datosDelDia(fechaISO) {
    const items = porDiaPendientes.get(fechaISO) || [];
    const ingreso = items.reduce((s, it) => s + (it.cantidadProgramada ?? it.cantidadPendiente ?? 0) * precioRef(it.ref), 0);
    const grupos = agruparPorRef(items);
    return { items, ingreso, cubre: items.length > 0 && ingreso >= costoDia, grupos };
  }
  // Ritmo acumulado del mes: compara lo que YA se cortó de verdad (Entrada
  // de Corte real, no lo simplemente programado) desde el día 1 del mes
  // hasta una fecha puntual, contra lo que se esperaría llevar cortado a
  // esa altura (costo diario × días laborales ya transcurridos ese mes).
  // Solo tiene sentido para fechas que ya pasaron (o es hoy) — a futuro
  // todavía no hay nada "ya cortado" que mostrar.
  const todosCortesReales = pedidos.flatMap((p) => p.cortesRealizados || []);
  function ritmoDelDia(fechaISO) {
    const primerDiaMes = `${fechaISO.slice(0, 7)}-01`;
    const presupuestoAcumulado = costoDia * diasLaboralesHastaFecha(fechaISO);
    if (presupuestoAcumulado <= 0) return null;
    const ingresoReal = todosCortesReales
      .filter((c) => c.fecha >= primerDiaMes && c.fecha <= fechaISO)
      .reduce((s, c) => s + (c.ingresoCorte || 0), 0);
    return { ritmo: ingresoReal / presupuestoAcumulado, ingresoReal, presupuestoAcumulado };
  }
  // Cuadrícula del calendario: una semana (7 días desde el lunes de
  // `calFecha`) o el mes completo de `calFecha` en filas de semana.
  const semanaBase = lunesDeSemanaISO(calFecha);
  const diasSemanaCal = Array.from({ length: 7 }, (_, i) => sumarDiasISO(semanaBase, i));
  const mesBaseCal = primerLunesDeCuadriculaMes(calFecha);
  const ultimoDiaMesCal = ultimoDiaMesISO(calFecha);
  const semanasMesCal = [];
  {
    let cursor = mesBaseCal;
    while (cursor <= ultimoDiaMesCal) {
      semanasMesCal.push(Array.from({ length: 7 }, (_, i) => sumarDiasISO(cursor, i)));
      cursor = sumarDiasISO(cursor, 7);
    }
  }
  // "Programado Mes" — dashboard rápido de cuánto lleva programado el mes
  // que se está mirando en el calendario (pendiente + ya cumplido, ambos
  // cuentan como "programado" ese día) y cuánto hay programado hoy mismo.
  const mesCalISO = calFecha.slice(0, 7);
  const programacionMes = programacion.filter((p) => (p.fechaProgramada || "").slice(0, 7) === mesCalISO);
  const unidadesMes = programacionMes.reduce((s, p) => s + (p.cantidadProgramada ?? p.cantidadPendiente ?? 0), 0);
  const ingresoMes = programacionMes.reduce((s, p) => s + (p.cantidadProgramada ?? p.cantidadPendiente ?? 0) * precioRef(p.ref), 0);
  const itemsHoyHoy = porDiaPendientes.get(hoy) || [];
  const unidadesHoy = itemsHoyHoy.reduce((s, p) => s + (p.cantidadProgramada ?? p.cantidadPendiente ?? 0), 0);
  const porSemana = new Map();
  pendientesConEstado.forEach((p) => {
    const lunes = lunesDeSemanaISO(p.fechaProgramada);
    if (!porSemana.has(lunes)) porSemana.set(lunes, []);
    porSemana.get(lunes).push(p);
  });
  const semanasOrdenadas = [...porSemana.keys()].sort();
  // Contador para la pestañita "Programación de Mesones": cuántos ítems
  // pendientes (no cumplidos) todavía necesitan algo ahí — o falta ingresar
  // sus datos teóricos, o ya se ingresaron pero falta que un analista los
  // apruebe.
  const mesonesPendientesCount = pendientesConEstado.filter((p) => !(p.etapa === "programacion_hecha" && p.aprobado === true)).length;
  return (
    <div>
      {partiendoGrupo && (
        <Modal title={`✂ Partir ${partiendoGrupo.ref} en varios cortes`} onClose={() => setPartiendoGrupo(null)} width={440}>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: C.slate }}>
            {partiendoGrupo.cliente} · #{partiendoGrupo.numero} · {partiendoGrupo.ref} — {fmtNum(partiendoGrupo.cantidadTotal)} unidades en total, {partiendoGrupo.colores.length} color{partiendoGrupo.colores.length !== 1 ? "es" : ""}.
            Se reparte en partes iguales (talla por talla, cada color) entre los cortes que elijas — cada uno queda como un bloque separado, listo para programarle su propio mesón/cortador/horario.
          </p>
          <Field label="¿En cuántos cortes lo partes?">
            <FInput
              type="number"
              value={String(numPartes)}
              onChange={(v) => setNumPartes(Math.max(2, parseInt(v, 10) || 2))}
            />
          </Field>
          {numPartes >= 2 && (
            <div style={{ marginTop: 10, fontSize: 12, color: C.slate }}>
              Quedaría aprox. {fmtNum(Math.round(partiendoGrupo.cantidadTotal / numPartes))} unidades por corte.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <Btn variant="secondary" onClick={() => setPartiendoGrupo(null)}>Cancelar</Btn>
            <Btn variant="success" onClick={confirmarPartirCorte}>✂ Partir en {numPartes} cortes</Btn>
          </div>
        </Modal>
      )}
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: C.ink }}>
        📅 Programación de Corte
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
        Elige el día, marca las referencias que se van a cortar ese día y confirma. El cumplimiento se revisa solo cuando el pendiente de cada referencia llega a 0.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <div
          onClick={() => setSubTab("programar")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: subTab === "programar" ? C.ink : C.white, color: subTab === "programar" ? C.seam : C.ink, border: `1px solid ${subTab === "programar" ? C.ink : C.border}` }}
        >
          📋 PROGRAMAR
        </div>
        <div
          onClick={() => setSubTab("pendientes")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: subTab === "pendientes" ? C.ink : C.white, color: subTab === "pendientes" ? C.seam : C.ink, border: `1px solid ${subTab === "pendientes" ? C.ink : C.border}` }}
        >
          📆 CRONOGRAMA DE CORTE {pendientesProg.length > 0 && `(${pendientesProg.length})`}
        </div>
        <div
          onClick={() => setSubTab("produccion")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: subTab === "produccion" ? C.violet : C.white, color: subTab === "produccion" ? C.white : C.violet, border: `1px solid ${subTab === "produccion" ? C.violet : C.violetBg}` }}
        >
          🏭 PRODUCCIÓN CORTE {mesonesPendientesCount > 0 && `(${mesonesPendientesCount})`}
        </div>
        <div
          onClick={() => setSubTab("vencidos")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: subTab === "vencidos" ? C.red : C.white, color: subTab === "vencidos" ? C.white : C.red, border: `1px solid ${subTab === "vencidos" ? C.red : C.redBg}` }}
        >
          ⚠ CORTES VENCIDOS {vencidosCount > 0 && `(${vencidosCount})`}
        </div>
        {isAdmin && (
          <div
            onClick={() => setSubTab("manual")}
            title="Cargar un corte que ya se hizo pero nunca se registró en ATLAS, aunque el pedido ya no aparezca en la cola normal — solo administrador"
            style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: subTab === "manual" ? C.amber : C.white, color: subTab === "manual" ? C.white : C.amber, border: `1px solid ${subTab === "manual" ? C.amber : C.amberBg}` }}
          >
            ✎ REGISTRAR MANUAL
          </div>
        )}
      </div>
      {subTab === "programar" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "14px 18px", background: C.ink, borderRadius: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.seam }}>📆 Programar para el día:</span>
            <input
              type="date"
              value={fechaSel}
              onChange={(e) => setFechaSel(e.target.value)}
              style={{ padding: "8px 12px", border: "none", borderRadius: 8, fontSize: 14, fontFamily: "inherit", fontWeight: 700 }}
            />
            <button onClick={() => setFechaSel(today())} style={{ background: "transparent", border: `1px solid ${C.seam}`, color: C.seam, borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Hoy
            </button>
            <button onClick={() => setFechaSel(sumarDiasISO(today(), 1))} style={{ background: "transparent", border: `1px solid ${C.seam}`, color: C.seam, borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Mañana
            </button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.seam }}>{fmtFechaISO(fechaSel)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "10px 18px", background: C.canvas, borderRadius: 12, border: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>✂ Número de cortes a programar:</span>
            <input
              type="number"
              min={1}
              max={20}
              value={numCortes}
              onChange={(e) => actualizarNumCortes(parseInt(e.target.value) || 1)}
              style={{ width: 56, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, textAlign: "center" }}
            />
            {numCortes > 1 && (
              <>
                <span style={{ fontSize: 11, color: C.slate }}>
                  La cantidad seleccionada se reparte en partes iguales entre los {numCortes} cortes — cada uno con su propia fecha:
                </span>
                {fechasCortes.map((f, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.slate }}>Corte {i + 1}:</span>
                    <input
                      type="date"
                      value={f}
                      onChange={(e) => setFechasCortes((prev) => prev.map((d, idx) => (idx === i ? e.target.value : d)))}
                      style={{ padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }}
                    />
                  </span>
                ))}
              </>
            )}
          </div>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>
            DISPONIBLE PARA PROGRAMAR ({totalDisponibles})
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 90 }}>
            <div style={{ width: 260, flexShrink: 0 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>
                Cliente
              </label>
              <select
                value={clienteSel}
                onChange={(e) => {
                  setClienteSel(e.target.value);
                  setPedidoSel("");
                }}
                style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", marginBottom: 14 }}
              >
                <option value="">— Elegir cliente —</option>
                {clientesOrdenados.map((cliente) => {
                  const items = itemsDelCliente(cliente);
                  // El número junto al cliente son unidades pendientes por
                  // cortar (suma de cantidades por talla), no cantidad de
                  // referencias ni de líneas — así se lee de una vez cuánto
                  // volumen real tiene ese cliente por programar.
                  const unidadesPendientes = items.reduce((s, it) => s + (it.cantidad || 0), 0);
                  return (
                    <option key={cliente} value={cliente}>
                      {cliente} ({fmtNum(unidadesPendientes)})
                    </option>
                  );
                })}
              </select>
              {clienteSel &&
                (() => {
                  const pedidosMap = porCliente.get(clienteSel);
                  if (!pedidosMap) return null;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[...pedidosMap.values()].map(({ pedido: p, filas }) => {
                        const itemsPedido = filas.flatMap((r) =>
                          Object.entries(r.tallas || {})
                            .filter(([, c]) => c > 0)
                            .map(([t]) => `${p.id}__${r.refId}__${t}`)
                        );
                        const seleccionadosPedido = itemsPedido.filter((k) => seleccion.has(k)).length;
                        const activo = pedidoSel === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setPedidoSel(p.id)}
                            style={{
                              cursor: "pointer",
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: `1.5px solid ${activo ? C.blue : C.border}`,
                              background: activo ? C.blueBg : C.white,
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: 12, color: C.ink }}>Pedido #{p.numero}</div>
                            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                              Despacho {p.fechaDespacho || "—"} · {filas.length} ref.
                              {seleccionadosPedido > 0 && <span style={{ color: C.blue, fontWeight: 700 }}> · {seleccionadosPedido} sel.</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {!clienteSel ? (
                <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
                  {clientesOrdenados.length ? "Elige un cliente para ver sus pedidos." : "No hay referencias pendientes sin programar en este momento."}
                </div>
              ) : !pedidoSel || !porCliente.get(clienteSel)?.has(pedidoSel) ? (
                <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
                  Elige un pedido de {clienteSel} para ver sus referencias.
                </div>
              ) : (
                (() => {
                  const { pedido: p, filas } = porCliente.get(clienteSel).get(pedidoSel);
                  const items = itemsDelCliente(clienteSel).filter((it) => it.pedidoId === p.id);
                  const seleccionadosPedido = items.filter((it) => seleccion.has(it.key)).length;
                  const tallasSinOrden = [];
                  filas.forEach((r) => {
                    Object.entries(r.tallas || {}).forEach(([t, cant]) => {
                      if (cant > 0 && !tallasSinOrden.includes(t)) tallasSinOrden.push(t);
                    });
                  });
                  const tallasDistintas = ordenarTallas(tallasSinOrden);
                  // Agrupa las filas (una por color/pinta) por código de
                  // referencia — una referencia con varios colores traía
                  // muchas filas seguidas y se volvía difícil de leer. Ahora
                  // se ve colapsada por referencia y se despliega con click.
                  const gruposPorRef = new Map();
                  filas.forEach((r) => {
                    if (!gruposPorRef.has(r.ref)) gruposPorRef.set(r.ref, []);
                    gruposPorRef.get(r.ref).push(r);
                  });
                  return (
                    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: C.ink, flex: 1 }}>
                          {clienteSel} · Pedido #{p.numero}
                        </span>
                        {seleccionadosPedido > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: C.blue, background: C.blueBg, padding: "2px 8px", borderRadius: 12 }}>
                            {seleccionadosPedido} seleccionada{seleccionadosPedido === 1 ? "" : "s"}
                          </span>
                        )}
                        <button
                          onClick={() => toggleTodaLaRef(items)}
                          style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: "transparent", border: `1px solid ${C.blue}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
                        >
                          {items.length > 0 && items.every((it) => seleccion.has(it.key)) ? "Ninguna" : "Todas"}
                        </button>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead>
                            <tr>
                              <th style={{ padding: "5px 8px" }}></th>
                              <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 9, color: C.slate, textTransform: "uppercase" }}>Ref</th>
                              <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 9, color: C.slate, textTransform: "uppercase" }}>Descripción</th>
                              {tallasDistintas.map((t) => (
                                <th key={t} style={{ padding: "5px 8px", textAlign: "right", fontSize: 9, color: C.slate, textTransform: "uppercase", whiteSpace: "nowrap" }}>{t}</th>
                              ))}
                              <th style={{ padding: "5px 8px", textAlign: "right", fontSize: 9, color: C.slate, textTransform: "uppercase" }}>Pendiente</th>
                            </tr>
                          </thead>
                          {[...gruposPorRef.entries()].map(([refCode, colores]) => {
                            const abierta = refsAbiertas.has(refCode);
                            const totalPendienteGrupo = colores.reduce((s2, r) => s2 + r.pendiente, 0);
                            const itemsGrupo = colores.flatMap((r) =>
                              tallasDistintas
                                .filter((t) => r.tallas[t] > 0)
                                .map((t) => ({
                                  key: `${p.id}__${r.refId}__${t}`,
                                  pedidoId: p.id,
                                  numero: p.numero,
                                  cliente: clienteSel,
                                  ref: r.ref,
                                  refId: r.refId,
                                  descripcion: r.descripcion,
                                  talla: t,
                                  cantidad: r.tallas[t],
                                  pendienteRef: r.pendiente,
                                }))
                            );
                            const seleccionadosGrupo = itemsGrupo.filter((it) => seleccion.has(it.key)).length;
                            return (
                              <tbody key={refCode}>
                                <tr
                                  onClick={() => toggleRefAbierta(refCode)}
                                  style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: C.canvas }}
                                >
                                  <td style={{ padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={itemsGrupo.length > 0 && itemsGrupo.every((it) => seleccion.has(it.key))}
                                      onChange={() => toggleTodaLaRef(itemsGrupo)}
                                      title="Seleccionar toda la referencia (todos los colores)"
                                      style={{ width: 15, height: 15 }}
                                    />
                                  </td>
                                  <td colSpan={2 + tallasDistintas.length} style={{ padding: "6px 8px", fontWeight: 800, color: C.ink }}>
                                    <span style={{ marginRight: 6, color: C.slate, fontWeight: 900 }}>{abierta ? "▾" : "▸"}</span>
                                    {refCode}
                                    <span style={{ color: C.slate, fontWeight: 500, marginLeft: 8, fontSize: 10 }}>
                                      {colores.length} color{colores.length === 1 ? "" : "es"}
                                      {seleccionadosGrupo > 0 && <span style={{ color: C.blue, fontWeight: 700 }}> · {seleccionadosGrupo} sel.</span>}
                                    </span>
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, color: C.amber }}>{fmtNum(totalPendienteGrupo)}</td>
                                </tr>
                                {abierta &&
                                  colores.map((r) => {
                                    const itemsRef = tallasDistintas
                                      .filter((t) => r.tallas[t] > 0)
                                      .map((t) => ({
                                        key: `${p.id}__${r.refId}__${t}`,
                                        pedidoId: p.id,
                                        numero: p.numero,
                                        cliente: clienteSel,
                                        ref: r.ref,
                                        refId: r.refId,
                                        descripcion: r.descripcion,
                                        talla: t,
                                        cantidad: r.tallas[t],
                                        pendienteRef: r.pendiente,
                                      }));
                                    const todaLaRefSel = itemsRef.length > 0 && itemsRef.every((it) => seleccion.has(it.key));
                                    return (
                                      <tr key={r.refId} style={{ borderTop: `1px solid ${C.border}` }}>
                                        <td style={{ padding: "5px 8px" }}>
                                          <input
                                            type="checkbox"
                                            checked={todaLaRefSel}
                                            onChange={() => toggleTodaLaRef(itemsRef)}
                                            title="Seleccionar toda la referencia"
                                            style={{ width: 15, height: 15 }}
                                          />
                                        </td>
                                        <td style={{ padding: "5px 8px", fontWeight: 700, color: C.slate }}>↳ {r.ref}</td>
                                        <td style={{ padding: "5px 8px", color: C.slate }}>{r.descripcion}</td>
                                        {tallasDistintas.map((t) => {
                                          const cant = r.tallas[t] || 0;
                                          if (cant <= 0) {
                                            return (
                                              <td key={t} style={{ padding: "4px 6px", textAlign: "center", color: C.border }}>
                                                —
                                              </td>
                                            );
                                          }
                                          const key = `${p.id}__${r.refId}__${t}`;
                                          const sel = seleccion.get(key);
                                          return (
                                            <td
                                              key={t}
                                              onClick={() => {
                                                if (!sel)
                                                  toggleItem({
                                                    key,
                                                    pedidoId: p.id,
                                                    numero: p.numero,
                                                    cliente: clienteSel,
                                                    ref: r.ref,
                                                    refId: r.refId,
                                                    descripcion: r.descripcion,
                                                    talla: t,
                                                    cantidad: cant,
                                                    pendienteRef: r.pendiente,
                                                  });
                                              }}
                                              style={{ padding: "4px 6px", textAlign: "center", cursor: sel ? "default" : "pointer", background: sel ? C.blueBg : "transparent" }}
                                            >
                                              {sel ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}>
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    value={sel.cantidad}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => setCantidadItem(key, parseInt(e.target.value) || 0)}
                                                    style={{ width: 42, padding: "2px 3px", border: `1px solid ${C.blue}`, borderRadius: 4, fontSize: 11, textAlign: "center" }}
                                                  />
                                                  <span
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      toggleItem(sel);
                                                    }}
                                                    title="Quitar"
                                                    style={{ cursor: "pointer", color: C.blue, fontWeight: 800, fontSize: 11 }}
                                                  >
                                                    ✕
                                                  </span>
                                                </div>
                                              ) : (
                                                <span style={{ color: C.ink }}>{cant}</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 800, color: C.amber }}>{fmtNum(r.pendiente)}</td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            );
                          })}
                        </table>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
          {seleccion.size > 0 && (
            <div
              style={{
                position: "sticky",
                bottom: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "14px 20px",
                background: C.ink,
                borderRadius: 14,
                boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ color: C.white, fontWeight: 700, fontSize: 13 }}>
                  {seleccion.size} talla{seleccion.size === 1 ? "" : "s"} seleccionada{seleccion.size === 1 ? "" : "s"}
                </span>
                <span style={{ color: C.seam, fontSize: 12 }}>
                  {numCortes > 1 ? `repartido en ${numCortes} cortes` : `para el ${fmtFechaISO(fechaSel)}`}
                </span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                  <button onClick={() => setSeleccion(new Map())} style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.3)`, color: C.white, borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Limpiar
                  </button>
                  <Btn variant="success" onClick={confirmarProgramacion}>
                    📅 Programar {numCortes > 1 ? `${numCortes} cortes` : "corte"}
                  </Btn>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: ingresoSeleccion >= costoDia ? C.green : C.amber,
                  borderTop: "1px solid rgba(255,255,255,0.15)",
                  paddingTop: 8,
                }}
              >
                <span style={{ fontWeight: 800 }}>{ingresoSeleccion >= costoDia ? "✓" : "⚠"}</span>
                <span>
                  Ingreso estimado de lo seleccionado: <b>{fmtCOP(ingresoSeleccion)}</b> · Costo diario centro de costo (nómina ÷ {DIAS_LABORALES_MES} días): <b>{fmtCOP(costoDia)}</b>
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 800 }}>
                  {ingresoSeleccion >= costoDia ? "Cubre el día" : `Falta ${fmtCOP(costoDia - ingresoSeleccion)}`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      {subTab === "pendientes" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            <KPICard icon="📊" label={`Programado ${mesAnioLabel(calFecha)}`} value={fmtNum(unidadesMes)} sub={fmtCOP(ingresoMes)} color={C.violet} bg={C.violetBg} />
            <KPICard icon="📆" label="Programado Hoy" value={fmtNum(unidadesHoy)} color={C.blue} bg={C.blueBg} />
            <KPICard icon={vencidosCount > 0 ? "⚠" : "✓"} label="Cortes Vencidos" value={String(vencidosCount)} color={vencidosCount > 0 ? C.red : C.green} bg={vencidosCount > 0 ? C.redBg : C.greenBg} />
            {(() => {
              const r = ritmoDelDia(hoy);
              const pct = r ? Math.round(r.ritmo * 100) : null;
              const ok = r && r.ritmo >= 1;
              return (
                <KPICard
                  icon={pct === null ? "—" : ok ? "🚀" : "🐢"}
                  label="Ritmo del Mes (real vs. presupuesto)"
                  value={pct === null ? "—" : `${pct}%`}
                  sub={r ? `${fmtCOP(r.ingresoReal)} de ${fmtCOP(r.presupuestoAcumulado)} esperado a hoy` : "Sin nómina cargada"}
                  color={pct === null ? C.slate : ok ? C.green : C.red}
                  bg={pct === null ? C.canvas : ok ? C.greenBg : C.redBg}
                />
              );
            })()}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              onClick={() => setVista("semana")}
              style={{ padding: "9px 14px", borderRadius: 10, fontWeight: 700, fontSize: 12, background: vista === "semana" ? C.blueBg : C.white, color: vista === "semana" ? C.blue : C.slate, border: `1px solid ${vista === "semana" ? C.blue : C.border}`, cursor: "pointer" }}
            >
              Semana
            </button>
            <button
              onClick={() => setVista("mes")}
              style={{ padding: "9px 14px", borderRadius: 10, fontWeight: 700, fontSize: 12, background: vista === "mes" ? C.blueBg : C.white, color: vista === "mes" ? C.blue : C.slate, border: `1px solid ${vista === "mes" ? C.blue : C.border}`, cursor: "pointer" }}
            >
              Mes
            </button>
            <div style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setCalFecha(vista === "mes" ? sumarMesesISO(calFecha, -1) : sumarDiasISO(calFecha, -7))}
                style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 13, cursor: "pointer", color: C.ink }}
              >
                ‹
              </button>
              <span style={{ fontWeight: 800, fontSize: 13, color: C.ink, minWidth: 190, textAlign: "center" }}>
                {vista === "mes" ? mesAnioLabel(calFecha) : `Semana del ${fmtFechaISO(semanaBase)} al ${fmtFechaISO(sumarDiasISO(semanaBase, 6))}`}
              </span>
              <button
                onClick={() => setCalFecha(vista === "mes" ? sumarMesesISO(calFecha, 1) : sumarDiasISO(calFecha, 7))}
                style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 13, cursor: "pointer", color: C.ink }}
              >
                ›
              </button>
              <button
                onClick={() => setCalFecha(today())}
                style={{ background: "transparent", border: `1px solid ${C.blue}`, color: C.blue, borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                Hoy
              </button>
            </div>
          </div>
          {!pendientesConEstado.length && (
            <div style={{ padding: "10px 14px", background: C.canvas, borderRadius: 8, marginBottom: 14, fontSize: 12, color: C.slate }}>
              No hay referencias programadas pendientes todavía — el calendario está vacío.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} style={{ fontSize: 10, fontWeight: 800, color: C.slate, textTransform: "uppercase", textAlign: "center" }}>
                {d}
              </div>
            ))}
          </div>
          {(vista === "mes" ? semanasMesCal : [diasSemanaCal]).map((semana, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
              {semana.map((date) => {
                const datos = datosDelDia(date);
                const enMes = date.slice(0, 7) === calFecha.slice(0, 7);
                const esHoy = date === hoy;
                const maxItems = vista === "mes" ? 3 : 8;
                // Ritmo acumulado solo aplica a días que ya pasaron (o es
                // hoy) — a futuro no hay nada "ya cortado" que comparar.
                const ritmo = date <= hoy ? ritmoDelDia(date) : null;
                return (
                  <div
                    key={date}
                    style={{
                      minHeight: vista === "mes" ? 90 : 170,
                      border: `1.5px solid ${esHoy ? C.blue : C.border}`,
                      borderRadius: 8,
                      padding: 6,
                      background: enMes ? C.white : C.canvas,
                      opacity: enMes ? 1 : 0.55,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: esHoy ? C.blue : C.ink }}>{Number(date.slice(8, 10))}</span>
                      {datos.items.length > 0 && (
                        <span
                          title={datos.cubre ? "Cubre el costo diario del centro de costo" : "No cubre el costo diario del centro de costo"}
                          style={{ fontSize: 11 }}
                        >
                          {datos.cubre ? "✓" : "⚠"}
                        </span>
                      )}
                    </div>
                    {ritmo && (
                      <div
                        title={`Ritmo acumulado del mes al ${fmtFechaISO(date)}: ya se cortó ${fmtCOP(ritmo.ingresoReal)} de ${fmtCOP(ritmo.presupuestoAcumulado)} que se esperaría llevar a esta altura del mes.`}
                        style={{ fontSize: 9, fontWeight: 800, color: ritmo.ritmo >= 1 ? C.green : C.red }}
                      >
                        Mes: {Math.round(ritmo.ritmo * 100)}%
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                      {datos.grupos.slice(0, maxItems).map((g) => (
                        <div key={g.key} style={{ display: "flex", alignItems: "stretch", gap: 2 }}>
                          <div
                            onClick={() => abrirFlujoCorte(g)}
                            title={`${g.cliente} · #${g.numero} · ${g.ref}${g.numeroCorte ? ` (${g.numeroCorte})` : ""} (${g.colores.length} color${g.colores.length !== 1 ? "es" : ""}) — ${g.etapa === "programacion_hecha" ? "Ir a Entrada de Corte" : "Ir a Programación Hecha"}`}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 10,
                              padding: "2px 4px",
                              borderRadius: 4,
                              cursor: "pointer",
                              background: g.vencido ? C.redBg : g.etapa === "programacion_hecha" ? C.blueBg : C.violetBg,
                              color: g.vencido ? C.red : g.etapa === "programacion_hecha" ? C.cyan : C.violet,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              fontWeight: 700,
                            }}
                          >
                            {g.ref}{g.numeroCorte ? ` (${g.numeroCorte})` : ""} · {fmtNum(g.cantidadTotal)}
                          </div>
                          {isAdmin && g.etapa !== "programacion_hecha" && !g.numeroCorte && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPartiendoGrupo(g);
                                setNumPartes(2);
                              }}
                              title="Partir este lote en varios cortes"
                              style={{ flexShrink: 0, background: C.violetBg, border: "none", borderRadius: 4, padding: "0 4px", color: C.violet, fontWeight: 800, fontSize: 10, cursor: "pointer" }}
                            >
                              ✂
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                g.colores.forEach((c) => onCancelar(c.id));
                              }}
                              title="Cancelar programación (admin)"
                              style={{ flexShrink: 0, background: C.redBg, border: "none", borderRadius: 4, padding: "0 4px", color: C.red, fontWeight: 800, fontSize: 10, cursor: "pointer" }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {datos.grupos.length > maxItems && (
                        <div style={{ fontSize: 9, color: C.slate }}>+{datos.grupos.length - maxItems} más</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {subTab === "produccion" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            <div
              onClick={() => setProduccionSubTab("mi_dia")}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 11, background: produccionSubTab === "mi_dia" ? C.amber : C.amberBg, color: produccionSubTab === "mi_dia" ? C.white : C.amber }}
            >
              📅 MI DÍA
            </div>
            <div
              onClick={() => setProduccionSubTab("mesones")}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 11, background: produccionSubTab === "mesones" ? C.violet : C.violetBg, color: produccionSubTab === "mesones" ? C.white : C.violet }}
            >
              🔧 PROGRAMACIÓN DE MESONES
            </div>
            <div
              onClick={() => setProduccionSubTab("disponibilidad")}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 11, background: produccionSubTab === "disponibilidad" ? C.blue : C.blueBg, color: produccionSubTab === "disponibilidad" ? C.white : C.blue }}
            >
              🪑 DISPONIBILIDAD MESONES
            </div>
            <div
              onClick={() => setProduccionSubTab("aprobados")}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 11, background: produccionSubTab === "aprobados" ? C.green : C.greenBg, color: produccionSubTab === "aprobados" ? C.white : C.green }}
            >
              📦 CORTES APROBADOS
            </div>
            <div
              onClick={() => setProduccionSubTab("corte_real")}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 11, background: produccionSubTab === "corte_real" ? C.cyan : C.blueBg, color: produccionSubTab === "corte_real" ? C.white : C.cyan }}
            >
              ✂ INGRESO DE CORTE REAL
            </div>
            <div
              onClick={() => setProduccionSubTab("historicos")}
              style={{ cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 11, background: produccionSubTab === "historicos" ? C.ink : C.canvas, color: produccionSubTab === "historicos" ? C.white : C.ink }}
            >
              📚 HISTÓRICOS
            </div>
          </div>
          {produccionSubTab === "mi_dia" && (() => {
            const datosMiDia = datosDelDia(miDiaFecha);
            // Lo programado que aún no está aprobado por el analista, y lo
            // que ya está listo para pasar a Ingreso de Corte Real — mismo
            // criterio que las otras dos sub-pestañas, para que el estado
            // que ves acá sea coherente con lo que verías entrando a cada
            // una por separado.
            const faltaAprobar = datosMiDia.grupos.filter((g) => g.etapa !== "programacion_hecha");
            const listoParaCortar = datosMiDia.grupos.filter((g) => g.etapa === "programacion_hecha");
            // Los cortes reales no guardan pedidoId propio (viven dentro de
            // pedido.cortesRealizados) — se recorre por pedido para no
            // perder esa referencia al mostrar cliente/número.
            const cortadoHoy = pedidos.flatMap((p) =>
              (p.cortesRealizados || [])
                .filter((c) => c.fecha === miDiaFecha)
                .map((c) => ({ ...c, _cliente: p.cliente, _numero: p.numero }))
            );
            const unidadesCortadasHoy = cortadoHoy.reduce((s, c) => s + (c.totalUnidades || 0), 0);
            const ingresoCortadoHoy = cortadoHoy.reduce((s, c) => s + (c.ingresoCorte || 0), 0);
            return (
              <div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
                  Resumen de un solo día: lo que falta cortar (programado) y lo que ya se cortó de verdad, sin ir pestaña por pestaña.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <Field label="Día">
                    <FInput type="date" value={miDiaFecha} onChange={(v) => setMiDiaFecha(v)} />
                  </Field>
                  <Btn variant="secondary" onClick={() => setMiDiaFecha(today())}>
                    Hoy
                  </Btn>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
                  <KPICard icon="⏳" label="Falta aprobar" value={fmtNum(faltaAprobar.length)} color={C.amber} bg={C.amberBg} />
                  <KPICard icon="✂" label="Listas para cortar" value={fmtNum(listoParaCortar.length)} color={C.cyan} bg={C.blueBg} />
                  <KPICard icon="✅" label="Ya cortado hoy" value={`${fmtNum(unidadesCortadasHoy)} uds`} color={C.green} bg={C.greenBg} sub={ingresoCortadoHoy > 0 ? fmtCOP(ingresoCortadoHoy) : undefined} />
                </div>
                {!faltaAprobar.length && !listoParaCortar.length && !cortadoHoy.length && (
                  <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    Sin actividad programada ni cortada para el {fmtFechaISO(miDiaFecha)}.
                  </div>
                )}
                {!!faltaAprobar.length && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      ⏳ Falta terminar/aprobar programación
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {faltaAprobar.map((g) => (
                        <div
                          key={g.key}
                          onClick={() => { setProduccionSubTab("mesones"); setMesonesFecha(miDiaFecha); setMesonesGrupoKey(g.key); }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>
                              {g.cliente} · #{g.numero} · {g.ref}
                              {g.numeroCorte && (
                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.violet, background: C.violetBg, padding: "1px 6px", borderRadius: 8 }}>
                                  {g.numeroCorte}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{g.colores.length} color{g.colores.length !== 1 ? "es" : ""} · {fmtNum(g.cantidadTotal)} unid.</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, color: C.amber, background: C.amberBg, padding: "4px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
                            Completar →
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!!listoParaCortar.length && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.cyan, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      ✂ Listas para Ingreso de Corte Real
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {listoParaCortar.map((g) => (
                        <div
                          key={g.key}
                          onClick={() => { setProduccionSubTab("corte_real"); setCorteRealFecha(miDiaFecha); setCorteRealSelKey(g.key); }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>
                              {g.cliente} · #{g.numero} · {g.ref}
                              {g.numeroCorte && (
                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.violet, background: C.violetBg, padding: "1px 6px", borderRadius: 8 }}>
                                  {g.numeroCorte}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                              {g.colores.length} color{g.colores.length !== 1 ? "es" : ""} · {fmtNum(g.cantidadTotal)} unid. · {g.planta}{g.meson ? " · " + nombreMeson(g.planta, g.meson) : ""}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, color: C.cyan, background: C.blueBg, padding: "4px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
                            Registrar corte →
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!!cortadoHoy.length && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      ✅ Ya cortado el {fmtFechaISO(miDiaFecha)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {cortadoHoy.map((c) => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.white }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{c._cliente} · #{c._numero}</div>
                            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                              {(c.refs || []).map((r) => r.ref).join(", ")} · {fmtNum(c.totalUnidades || 0)} uds · {c.cortador || "—"}
                              {c.lote ? ` · lote ${c.lote}` : " · sin lote aún"}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.green }}>{fmtCOP(c.ingresoCorte || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {produccionSubTab === "mesones" && (() => {
            const datosMesones = datosDelDia(mesonesFecha);
            const grupoSel = mesonesGrupoKey ? datosMesones.grupos.find((g) => g.key === mesonesGrupoKey) : null;
            return (
              <div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
                  Elige un día para ver lo programado ahí (a futuro, para que el cortador vaya ingresando los datos teóricos con anticipación) y entra a cada referencia para poner mesón, trazo, capas y horario. Un analista revisa y aprueba antes de que quede confirmado.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <Field label="Día">
                    <FInput type="date" value={mesonesFecha} onChange={(v) => { setMesonesFecha(v); setMesonesGrupoKey(null); }} />
                  </Field>
                  <Btn variant="secondary" onClick={() => { setMesonesFecha(today()); setMesonesGrupoKey(null); }}>
                    Hoy
                  </Btn>
                  {!!datosMesones.grupos.length && (
                    <Btn variant="secondary" onClick={() => setImprimiendoCortadores(true)}>
                      🖨 Imprimir trabajo de cortadores
                    </Btn>
                  )}
                  <Btn
                    variant="secondary"
                    onClick={() => {
                      setDispFecha(mesonesFecha);
                      setProduccionSubTab("disponibilidad");
                    }}
                  >
                    🪑 Disponibilidad de Mesones
                  </Btn>
                </div>
                {imprimiendoCortadores && (
                  <ImprimirTrabajoCortadoresModal
                    fecha={mesonesFecha}
                    grupos={datosMesones.grupos}
                    nombreMeson={nombreMeson}
                    capasTotalesGrupo={capasTotalesGrupo}
                    onClose={() => setImprimiendoCortadores(false)}
                  />
                )}
                {!datosMesones.grupos.length && (
                  <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    No hay nada programado para el {fmtFechaISO(mesonesFecha)}.
                  </div>
                )}
                {!!datosMesones.grupos.length && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: grupoSel ? 24 : 0 }}>
                    {datosMesones.grupos.map((g) => {
                      const aprobadoG = g.etapa === "programacion_hecha" && g.colores.every((c) => c.aprobado === true);
                      const estadoLabel = g.etapa !== "programacion_hecha" ? "Falta ingresar" : aprobadoG ? "Aprobada Analista" : "Pendiente de aprobación";
                      const estadoColor = g.etapa !== "programacion_hecha" ? C.violet : aprobadoG ? C.green : C.amber;
                      const estadoBg = g.etapa !== "programacion_hecha" ? C.violetBg : aprobadoG ? C.greenBg : C.amberBg;
                      const seleccionado = g.key === mesonesGrupoKey;
                      return (
                        <div
                          key={g.key}
                          onClick={() => setMesonesGrupoKey(g.key)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                            padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                            border: `1.5px solid ${seleccionado ? C.violet : C.border}`,
                            background: seleccionado ? C.violetBg : C.white,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>
                              {g.cliente} · #{g.numero} · {g.ref}
                              {g.numeroCorte && (
                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.violet, background: C.violetBg, padding: "1px 6px", borderRadius: 8 }}>
                                  {g.numeroCorte}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                              {g.colores.length} color{g.colores.length !== 1 ? "es" : ""} · {fmtNum(g.cantidadTotal)} unid.
                              {g.etapa === "programacion_hecha" && ` · ${g.planta}${g.meson ? " · " + nombreMeson(g.planta, g.meson) : ""}`}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isAdmin && g.etapa !== "programacion_hecha" && !g.numeroCorte && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPartiendoGrupo(g);
                                  setNumPartes(2);
                                }}
                                title="Partir este lote en varios cortes"
                                style={{ background: C.violetBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.violet, fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                              >
                                ✂
                              </button>
                            )}
                            <span style={{ fontSize: 10, fontWeight: 800, color: estadoColor, background: estadoBg, padding: "4px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
                              {estadoLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {grupoSel && (
                  <ProgramacionMesonPanel
                    grupo={grupoSel}
                    plantas={plantasConfig || []}
                    cortadores={cortadoresConfig || []}
                    telas={telas || []}
                    estadisticasTela={estadisticasTela || {}}
                    metrosUsadosMeson={metrosUsadosMeson}
                    itemsUsadosMeson={itemsUsadosMeson}
                    onSave={onGuardarProgramacionHecha}
                    onClose={() => setMesonesGrupoKey(null)}
                    onGuardado={() => {
                      setCorteRealFecha(grupoSel.colores[0]?.fechaProgramada || mesonesFecha);
                      setMesonesGrupoKey(null);
                      setProduccionSubTab("corte_real");
                    }}
                    puedeAprobar={puedeAprobarCorte}
                    onAprobar={() => onAprobarProgramacionHecha(grupoSel.colores.map((c) => c.id), usuarioActual)}
                    usuarioActual={usuarioActual}
                    candidatosVinculo={datosMesones.grupos.filter((g) => g.etapa !== "programacion_hecha")}
                  />
                )}
              </div>
            );
          })()}
          {produccionSubTab === "disponibilidad" && (() => {
            const plantasLista = plantasConfig || [];
            const plantaActual = plantasLista.find((p) => p.nombre === dispPlanta) || plantasLista[0] || null;
            const nombrePlantaActual = plantaActual?.nombre || "";
            const mesonesDePlanta = plantaActual?.mesones || [];
            // Grupos del día en esta planta (deduplicados por referencia) —
            // solo para contar CUÁNTAS referencias hay programadas.
            const gruposDelDiaPlanta = datosDelDia(dispFecha).grupos.filter(
              (g) => g.planta === nombrePlantaActual && g.etapa === "programacion_hecha"
            );
            // Total de capas teóricas del día en esta planta — se suma
            // directo color por color sobre `programacion` (un doc por
            // color), SIN deduplicar por referencia (las capas sí se suman
            // entre colores, a diferencia del trazo que es un solo tendido
            // físico compartido) y sin importar el mesón, así que no hay
            // riesgo de contar doble por mesones compartidos.
            const capasTeoricasTotalPlanta = (programacion || [])
              .filter((pr) => pr.fechaProgramada === dispFecha && pr.planta === nombrePlantaActual && pr.etapa === "programacion_hecha")
              .reduce((s, pr) => s + (pr.capas || 0), 0);
            return (
              <div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
                  Elige planta y día para ver cómo están distribuidos los cortes entre TODOS los mesones de esa planta a la vez — el mismo timeline que ya se usa al programar un corte puntual, pero para verlos todos juntos y encontrar huecos libres.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <Field label="Planta">
                    <FSel value={nombrePlantaActual} onChange={setDispPlanta} options={plantasLista.map((p) => p.nombre)} />
                  </Field>
                  <Field label="Día">
                    <FInput type="date" value={dispFecha} onChange={setDispFecha} />
                  </Field>
                  <Btn variant="secondary" onClick={() => setDispFecha(today())}>
                    Hoy
                  </Btn>
                </div>
                {!!mesonesDePlanta.length && (
                  <div style={{ marginBottom: 20 }}>
                    <KPICard
                      icon="📚"
                      label={`Capas teóricas del día en ${nombrePlantaActual || "esta planta"}`}
                      value={fmtNum(capasTeoricasTotalPlanta)}
                      color={C.blue}
                      bg={C.blueBg}
                      sub={`${gruposDelDiaPlanta.length} corte${gruposDelDiaPlanta.length !== 1 ? "s" : ""} programado${gruposDelDiaPlanta.length !== 1 ? "s" : ""}`}
                    />
                  </div>
                )}
                {!plantasLista.length && (
                  <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    No hay plantas configuradas todavía.
                  </div>
                )}
                {!!plantasLista.length && !mesonesDePlanta.length && (
                  <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    {nombrePlantaActual || "Esta planta"} no tiene mesones configurados.
                  </div>
                )}
                {mesonesDePlanta.map((m) => {
                  const grupoInfo = m.grupoId ? (plantaActual?.grupos || []).find((g) => g.id === m.grupoId) : null;
                  const capacidad = grupoInfo ? grupoInfo.metros : m.metros;
                  const ocupados = itemsUsadosMeson(dispFecha, nombrePlantaActual, m.id, m.grupoId || null, []);
                  const usados = metrosUsadosMeson(dispFecha, nombrePlantaActual, m.id, m.grupoId || null, []);
                  const libre = capacidad !== null && capacidad !== undefined ? Math.max(0, capacidad - usados) : null;
                  const capasMeson = capasUsadasMeson(dispFecha, nombrePlantaActual, m.id, m.grupoId || null);
                  return (
                    <div key={m.id} style={{ marginBottom: 4 }}>
                      <MesonTimeline
                        nombre={m.nombre}
                        capacidad={capacidad}
                        compartido={!!m.grupoId}
                        ocupados={ocupados}
                        inicioActual={null}
                        finActual={null}
                      />
                      {capacidad !== null && capacidad !== undefined && (
                        <div style={{ fontSize: 11, color: C.slate, marginTop: -10, marginBottom: 16 }}>
                          Usado hoy: {usados}m · Libre: <b style={{ color: libre > 0 ? C.green : C.red }}>{libre}m</b> · Capas teóricas: <b>{fmtNum(capasMeson)}</b>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {produccionSubTab === "corte_real" && (() => {
            const datosCorteReal = datosDelDia(corteRealFecha);
            // Solo las referencias que ya tienen Programación de Mesones
            // hecha están listas para Ingreso de Corte Real — las que
            // todavía están en "Falta ingresar" se resuelven en la otra
            // sub-pestaña.
            const listos = datosCorteReal.grupos.filter((g) => g.etapa === "programacion_hecha");
            const corteRealSel = corteRealSelKey ? listos.find((g) => g.key === corteRealSelKey) : null;
            const pedidoDelCorteReal = corteRealSel ? pedidos.find((p) => p.id === corteRealSel.pedidoId) : null;
            // Referencia "pareja" — se vinculó con esta en Programación de
            // Mesones (mismo trazo) y todavía no se ha registrado su corte
            // real. Se le ofrece al patronista registrarlas seguidas.
            const parejaVinculada =
              corteRealSel?.vinculoTrazoId && !parejaDescartadaKeys.has(corteRealSel.key)
                ? listos.find((g) => g.vinculoTrazoId === corteRealSel.vinculoTrazoId && g.key !== corteRealSel.key)
                : null;
            return (
              <div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
                  Elige el día para ver las referencias que ya tienen Programación de Mesones lista. Solo hace falta que el analista haya aprobado — el lote se pone después, en "Cortes Aprobados", ya con lo que realmente se cortó.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                  <Field label="Día">
                    <FInput type="date" value={corteRealFecha} onChange={(v) => { setCorteRealFecha(v); setCorteRealSelKey(null); setParejaPendiente(null); }} />
                  </Field>
                  <Btn variant="secondary" onClick={() => { setCorteRealFecha(today()); setCorteRealSelKey(null); setParejaPendiente(null); }}>
                    Hoy
                  </Btn>
                </div>
                {!listos.length && (
                  <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    No hay referencias listas para Ingreso de Corte Real el {fmtFechaISO(corteRealFecha)}.
                  </div>
                )}
                {!!listos.length && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: corteRealSel ? 24 : 0 }}>
                    {listos.map((g) => {
                      const aprobadoG = g.colores.every((c) => c.aprobado === true);
                      const estado = !aprobadoG ? "sin_aprobar" : "listo";
                      const seleccionado = g.key === corteRealSelKey;
                      return (
                        <div
                          key={g.key}
                          onClick={() => {
                            if (estado === "sin_aprobar") { setProduccionSubTab("mesones"); setMesonesFecha(g.colores[0]?.fechaProgramada || today()); setMesonesGrupoKey(g.key); return; }
                            setCorteRealSelKey(seleccionado ? null : g.key);
                          }}
                          title={estado === "sin_aprobar" ? "Falta aprobación — ir a Programación de Mesones" : "Ver / registrar corte real"}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                            padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                            border: `1.5px solid ${seleccionado ? C.cyan : C.border}`,
                            background: seleccionado ? C.blueBg : C.white,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>
                              {g.cliente} · #{g.numero} · {g.ref}
                              {g.numeroCorte && (
                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.violet, background: C.violetBg, padding: "1px 6px", borderRadius: 8 }}>
                                  {g.numeroCorte}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                              {g.colores.length} color{g.colores.length !== 1 ? "es" : ""} · {fmtNum(g.cantidadTotal)} unid. · {g.planta}{g.meson ? ` · ${nombreMeson(g.planta, g.meson)}` : ""}
                            </div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, color: estado === "listo" ? C.green : C.amber, background: estado === "listo" ? C.greenBg : C.amberBg, padding: "4px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
                            {estado === "sin_aprobar" ? "⏳ Sin aprobar todavía" : "✓ Listo para cortar"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {corteRealSel && parejaVinculada && parejaPendiente !== parejaVinculada.key && (
                  <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${C.violet}55`, background: C.violetBg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, color: C.violet, fontWeight: 700 }}>
                      🔗 Esta referencia comparte trazo con {parejaVinculada.cliente} · #{parejaVinculada.numero} · {parejaVinculada.ref} — ¿la registras junto con esta?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn small variant="success" onClick={() => setParejaPendiente(parejaVinculada.key)}>
                        Sí, registrar las dos juntas
                      </Btn>
                      <Btn small variant="secondary" onClick={() => setParejaDescartadaKeys((s) => new Set([...s, corteRealSel.key, parejaVinculada.key]))}>
                        No, solo esta
                      </Btn>
                    </div>
                  </div>
                )}
                {corteRealSel && parejaPendiente === parejaVinculada?.key && (
                  <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: C.greenBg, color: C.green }}>
                    ✓ Al guardar esta, se abre directo {parejaVinculada.cliente} · #{parejaVinculada.numero} · {parejaVinculada.ref} para registrarla también.
                  </div>
                )}
                {corteRealSel && pedidoDelCorteReal && (
                  <ProgramarCorteModal
                    inline
                    pedido={pedidoDelCorteReal}
                    plantas={plantasConfig || []}
                    cortadores={cortadoresConfig || []}
                    telas={telas || []}
                    preciosMap={preciosMap}
                    lotesExistentes={lotesExistentes}
                    preseleccion={corteRealSel}
                    itemsUsadosMeson={itemsUsadosMeson}
                    pedidosTodos={pedidos}
                    onSave={(corte) => onRegistrarCorteReal(corteRealSel.pedidoId, corte)}
                    onClose={() => { setCorteRealSelKey(null); setParejaPendiente(null); }}
                    onGuardado={() => {
                      if (parejaPendiente) {
                        const siguiente = parejaPendiente;
                        setParejaPendiente(null);
                        setCorteRealSelKey(siguiente);
                      } else {
                        setCorteRealSelKey(null);
                        setProduccionSubTab("aprobados");
                      }
                    }}
                  />
                )}
              </div>
            );
          })()}
          {produccionSubTab === "aprobados" && (() => {
            // Ahora "Cortes Aprobados" lista los cortes REALES (ya
            // registrados en Entrada de Corte) que todavía no tienen lote —
            // el patronista los ve acá con los datos reales de lo que se
            // cortó, los ingresa a Busint y les pone el lote.
            const sinLote = pedidos
              .flatMap((p) => (p.cortesRealizados || []).filter((c) => !c.lote).map((c) => ({ ...c, cliente: p.cliente, numeroPedido: p.numero, pedidoId: p.id })))
              .sort((a, b) => (a.creadoEn || a.fecha || "").localeCompare(b.creadoEn || b.fecha || ""));
            function loteDuplicado(corteActual, texto) {
              const val = texto.trim().toUpperCase();
              if (!val) return false;
              if (lotesExistentes?.has(val)) return true;
              return pedidos.some((p) =>
                (p.cortesRealizados || []).some((c) => c.id !== corteActual.id && c.lote && String(c.lote).trim().toUpperCase() === val)
              );
            }
            return (
              <div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
                  Cortes ya registrados en Entrada de Corte. Clic en uno para revisar el detalle completo de lo que se cortó, y ahí mismo ponerle el número de lote antes de ingresarlo a Busint. Al guardar el lote, pasa a "Históricos".
                </p>
                {!sinLote.length && (
                  <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    No hay cortes esperando lote todavía.
                  </div>
                )}
                {!!sinLote.length && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sinLote.map((c) => {
                      const abierto = aprobadoAbierto === c.id;
                      const texto = loteInputs[c.id] ?? "";
                      const dup = loteDuplicado(c, texto);
                      const refsTxt = (c.refs || []).map((r) => r.ref).join(", ");
                      // No se puede pasar a Históricos (guardar el lote) sin
                      // antes completar el Horario de Corte — así no se
                      // pierde el dato ni queda pasando cosas a medias.
                      const sinHorarioCorte = !c.horaInicio || !c.horaFin;
                      return (
                        <div key={c.id} style={{ borderRadius: 10, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
                          <div
                            onClick={() => setAprobadoAbierto(abierto ? null : c.id)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", cursor: "pointer", background: C.white }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{c.cliente} · #{c.numeroPedido} · {refsTxt}</div>
                              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                                {fmtNum(c.totalUnidades)} unid. · {c.planta}{c.meson ? ` · ${nombreMeson(c.planta, c.meson)}` : ""} · cortado el {fmtFechaISO(c.fecha)}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: C.slate }}>{abierto ? "▲ Ocultar" : "▼ Revisar y poner lote"}</span>
                          </div>
                          {abierto && (
                            <div style={{ padding: "14px 16px", background: C.canvas, borderTop: `1px solid ${C.border}` }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12, fontSize: 12, color: C.ink }}>
                                <div><b>Planta:</b> {c.planta || "—"}</div>
                                {renderMesonEditable(c)}
                                <div><b>Cortador:</b> {c.cortador || "—"}</div>
                                <div><b>Tela:</b> {c.tipoTela || "—"}</div>
                                <div><b>Trazo:</b> {c.largoTrazo ? `${c.largoTrazo} m` : "—"}</div>
                                <div><b>Capas:</b> {c.capas ?? "—"}</div>
                                <div><b>Metros tendido:</b> {c.metrosTendido ? `${c.metrosTendido} m` : "—"}</div>
                                <div><b>Horario Tendido:</b> {c.horaInicioTendido || "—"} a {c.horaFinTendido || "—"} ({c.minutosTendido ?? "—"} min)</div>
                                <div><b>Horario Corte:</b> {c.horaInicio || "—"} a {c.horaFin || "—"} ({c.minutos ?? "—"} min)</div>
                                <div><b>Ingreso corte:</b> {fmtCOP(c.ingresoCorte || 0)}</div>
                              </div>
                              {(c.materiales || []).length > 1 && (
                                <div style={{ marginBottom: 12, padding: "8px 12px", background: C.violetBg, borderRadius: 8, fontSize: 12, color: C.ink }}>
                                  <b style={{ color: C.violet }}>Materiales:</b>{" "}
                                  {c.materiales.map((m, i) => `${m.tipoTela || "—"} (${m.largoTrazo || 0}m × ${m.capas ?? 0} capas${m.meson ? ` · ${nombreMeson(c.planta, m.meson)}` : ""} = ${m.metros || 0}m)`).join("  ·  ")}
                                </div>
                              )}
                              {renderHorarioCorte(c)}
                              {(() => {
                                const enEdicion = editandoCantidades === c.id;
                                return (
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                    <div style={{ fontSize: 10, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Tallas cortadas</div>
                                    {isAdmin && !enEdicion && (
                                      <button
                                        onClick={() => iniciarEdicionCantidades(c)}
                                        title="Corregir cantidades por talla"
                                        style={{ background: C.blueBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.blue, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                                      >
                                        ✎ Editar cantidades
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
                                <thead>
                                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <th style={{ textAlign: "left", padding: "4px 8px", color: C.slate, fontSize: 10, textTransform: "uppercase" }}>Referencia</th>
                                    <th style={{ textAlign: "left", padding: "4px 8px", color: C.slate, fontSize: 10, textTransform: "uppercase" }}>Tallas</th>
                                    <th style={{ textAlign: "right", padding: "4px 8px", color: C.slate, fontSize: 10, textTransform: "uppercase" }}>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {editandoCantidades === c.id
                                    ? (() => {
                                        const pedidoDelCorteFila = pedidos.find((p) => p.id === c.pedidoId);
                                        return (cantidadesEdit || []).map((r, refIdx) => {
                                          const opcionesRef = (pedidoDelCorteFila?.referencias || []).filter(
                                            (rp) => rp.id === r.refId || !(cantidadesEdit || []).some((ce) => ce.refId === rp.id)
                                          );
                                          return (
                                        <tr key={r.refId} style={{ borderBottom: `1px solid ${C.border}` }}>
                                          <td style={{ padding: "6px 8px", fontWeight: 700, verticalAlign: "top" }}>
                                            {opcionesRef.length > 0 ? (
                                              <select
                                                value={r.refId}
                                                onChange={(e) => cambiarReferenciaEdit(refIdx, e.target.value, pedidoDelCorteFila)}
                                                title="Corregir a cuál referencia del pedido pertenece esta fila"
                                                style={{ padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit", maxWidth: 220 }}
                                              >
                                                {opcionesRef.map((rp) => (
                                                  <option key={rp.id} value={rp.id}>{rp.ref}{rp.descripcion ? ` — ${rp.descripcion}` : ""}</option>
                                                ))}
                                              </select>
                                            ) : (
                                              <>{r.ref}{r.descripcion ? ` — ${r.descripcion}` : ""}</>
                                            )}
                                          </td>
                                          <td style={{ padding: "6px 8px" }}>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                              {ordenarTallas(Object.keys(r.tallas || {})).map((t) => (
                                                <div key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                  <span style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>{t}</span>
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    value={r.tallas[t]}
                                                    onChange={(e) => actualizarTallaEdit(refIdx, t, e.target.value)}
                                                    style={{ width: 56, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, verticalAlign: "top" }}>{fmtNum(r.total)}</td>
                                        </tr>
                                          );
                                        });
                                      })()
                                    : (c.refs || []).map((r) => (
                                        <tr key={r.refId} style={{ borderBottom: `1px solid ${C.border}` }}>
                                          <td style={{ padding: "6px 8px", fontWeight: 700 }}>{r.ref}{r.descripcion ? ` — ${r.descripcion}` : ""}</td>
                                          <td style={{ padding: "6px 8px", color: C.slate }}>
                                            {ordenarTallas(Object.keys(r.tallas || {})).filter((t) => r.tallas[t] > 0).map((t) => `${t}:${r.tallas[t]}`).join(", ")}
                                          </td>
                                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{fmtNum(r.total)}</td>
                                        </tr>
                                      ))}
                                </tbody>
                              </table>
                              {editandoCantidades === c.id && (() => {
                                const pedidoDelCorte = pedidos.find((p) => p.id === c.pedidoId);
                                const coloresDisponibles = (pedidoDelCorte?.referencias || []).filter(
                                  (r) => !(cantidadesEdit || []).some((ce) => ce.refId === r.id)
                                );
                                return (
                                  <div style={{ marginBottom: 14 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                                      <div style={{ fontSize: 10, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Cortador</div>
                                      <select
                                        value={cortadorEdit}
                                        onChange={(e) => setCortadorEdit(e.target.value)}
                                        style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
                                      >
                                        <option value="">— Sin asignar —</option>
                                        {(cortadoresConfig || []).map((ct) => (
                                          <option key={ct.nombre} value={ct.nombre}>{ct.nombre}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {!!coloresDisponibles.length && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", background: C.blueBg, borderRadius: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>+ Agregar color faltante:</span>
                                        <select
                                          value={colorAAgregar}
                                          onChange={(e) => setColorAAgregar(e.target.value)}
                                          style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
                                        >
                                          <option value="">Elegir color de {pedidoDelCorte?.numero ? `#${pedidoDelCorte.numero}` : "este pedido"}...</option>
                                          {coloresDisponibles.map((r) => (
                                            <option key={r.id} value={r.id}>{r.ref}{r.descripcion ? ` — ${r.descripcion}` : ""}</option>
                                          ))}
                                        </select>
                                        <Btn small variant="secondary" disabled={!colorAAgregar} onClick={() => agregarColorFaltante(pedidoDelCorte)}>
                                          Agregar
                                        </Btn>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {editandoCantidades === c.id && (
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
                                  <Btn small variant="secondary" onClick={cancelarEdicionCantidades}>Cancelar</Btn>
                                  <Btn small variant="success" onClick={() => guardarCantidadesEdit(c.pedidoId, c.id)}>Guardar cantidades</Btn>
                                </div>
                              )}
                              {(() => {
                                const refsUnicos = [...new Set((c.refs || []).map((r) => r.ref))];
                                if (refsUnicos.length < 2) return null;
                                return (
                                  <div style={{ marginBottom: 14, padding: "10px 12px", background: C.amberBg, borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 6 }}>
                                      Este registro tiene {refsUnicos.length} referencias distintas — si se mezclaron por error, puedes quitar una (vuelve a quedar pendiente por cortar):
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {refsUnicos.map((refCode) => {
                                        const key = `${c.id}__${refCode}`;
                                        const confirmando = confirmQuitarRef === key;
                                        return confirmando ? (
                                          <div key={refCode} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                            <span style={{ color: C.red, fontWeight: 700 }}>¿Quitar {refCode}?</span>
                                            <Btn
                                              small
                                              variant="danger"
                                              onClick={async () => {
                                                await onQuitarRefDeCorte(c.pedidoId, c.id, refCode);
                                                setConfirmQuitarRef(null);
                                                setAprobadoAbierto(null);
                                              }}
                                            >
                                              Confirmar
                                            </Btn>
                                            <Btn small variant="secondary" onClick={() => setConfirmQuitarRef(null)}>
                                              Cancelar
                                            </Btn>
                                          </div>
                                        ) : (
                                          <Btn key={refCode} small variant="secondary" onClick={() => setConfirmQuitarRef(key)}>
                                            Quitar {refCode}
                                          </Btn>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                              {isAdmin && onDevolverCorteReal && (
                                <div style={{ marginBottom: 14, padding: "10px 12px", background: C.redBg, borderRadius: 8 }}>
                                  {confirmDevolverCorte === c.id ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      <span style={{ color: C.red, fontWeight: 700, fontSize: 12 }}>
                                        ¿Devolver este corte completo a "Ingreso de Corte Real"? Se borra todo lo registrado acá (materiales, tallas) y la referencia vuelve a quedar pendiente por cortar.
                                      </span>
                                      <Btn
                                        small
                                        variant="danger"
                                        onClick={async () => {
                                          await onDevolverCorteReal(c.pedidoId, c.id);
                                          setConfirmDevolverCorte(null);
                                          setAprobadoAbierto(null);
                                        }}
                                      >
                                        Confirmar
                                      </Btn>
                                      <Btn small variant="secondary" onClick={() => setConfirmDevolverCorte(null)}>
                                        Cancelar
                                      </Btn>
                                    </div>
                                  ) : (
                                    <Btn small variant="secondary" onClick={() => setConfirmDevolverCorte(c.id)}>
                                      ↩ Devolver a Ingreso de Corte Real
                                    </Btn>
                                  )}
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <input
                                  value={texto}
                                  onChange={(e) => setLoteInputs((s) => ({ ...s, [c.id]: e.target.value }))}
                                  placeholder="Número de lote"
                                  style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${dup ? C.red : C.border}`, fontSize: 13, width: 160, color: C.ink, outline: "none", fontFamily: "inherit" }}
                                />
                                <Btn
                                  variant="success"
                                  disabled={!texto.trim() || dup || sinHorarioCorte}
                                  onClick={async () => {
                                    await onAsignarLoteReal(c.pedidoId, c.id, texto.trim());
                                    setLoteInputs((s) => { const n = { ...s }; delete n[c.id]; return n; });
                                    setAprobadoAbierto(null);
                                  }}
                                >
                                  Guardar lote
                                </Btn>
                              </div>
                              {dup && (
                                <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 700 }}>⚠ Ese número de lote ya está en uso — usa uno diferente.</div>
                              )}
                              {sinHorarioCorte && (
                                <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 700 }}>⚠ Completa el Horario de Corte arriba (hora inicio y fin) antes de poder guardar el lote y pasar a Históricos.</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
          {produccionSubTab === "historicos" && (() => {
            // Se arma directo de cortesRealizados de cada pedido, filtrando
            // solo los que YA tienen lote (los que todavía no, están en
            // "Cortes Aprobados" esperando que el patronista lo ponga).
            const todosLosCortes = pedidos
              .flatMap((p) => (p.cortesRealizados || []).filter((c) => c.lote).map((c) => ({ ...c, cliente: p.cliente, numeroPedido: p.numero, pedidoId: p.id })))
              .sort((a, b) => (b.creadoEn || b.fecha || "").localeCompare(a.creadoEn || a.fecha || ""));
            return (
              <div>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
                  Todo lo que ya se cortó de verdad — cliente, pedido, lote, referencia y cantidad. Clic en una fila para ver el detalle completo (planta, mesón, cortador, tela, trazo, capas, horario).
                </p>
                {!todosLosCortes.length && (
                  <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    Todavía no hay cortes reales registrados.
                  </div>
                )}
                {!!todosLosCortes.length && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {todosLosCortes.map((c) => {
                      const abierto = historicoAbierto === c.id;
                      const refsTxt = (c.refs || []).map((r) => r.ref).join(", ");
                      return (
                        <div key={c.id} style={{ borderRadius: 10, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
                          <div
                            onClick={() => setHistoricoAbierto(abierto ? null : c.id)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", cursor: "pointer", background: C.white }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{c.cliente} · #{c.numeroPedido} · {refsTxt}</div>
                              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                                Lote {c.lote || "—"} · {fmtNum(c.totalUnidades)} unid. · {fmtFechaISO(c.fecha)}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: C.slate }}>{abierto ? "▲ Ocultar" : "▼ Ver detalle"}</span>
                          </div>
                          {abierto && (
                            <div style={{ padding: "14px 16px", background: C.canvas, borderTop: `1px solid ${C.border}` }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12, fontSize: 12, color: C.ink }}>
                                <div><b>Lote:</b> {c.lote || "—"}</div>
                                <div><b>Planta:</b> {c.planta || "—"}</div>
                                {renderMesonEditable(c)}
                                <div><b>Cortador:</b> {c.cortador || "—"}</div>
                                <div><b>Tela:</b> {c.tipoTela || "—"}</div>
                                <div><b>Trazo:</b> {c.largoTrazo ? `${c.largoTrazo} m` : "—"}</div>
                                <div><b>Capas:</b> {c.capas ?? "—"}</div>
                                <div><b>Metros tendido:</b> {c.metrosTendido ? `${c.metrosTendido} m` : "—"}</div>
                                <div><b>Horario Tendido:</b> {c.horaInicioTendido || "—"} a {c.horaFinTendido || "—"} ({c.minutosTendido ?? "—"} min)</div>
                                <div><b>Horario Corte:</b> {c.horaInicio || "—"} a {c.horaFin || "—"} ({c.minutos ?? "—"} min)</div>
                                <div><b>Ingreso corte:</b> {fmtCOP(c.ingresoCorte || 0)}</div>
                              </div>
                              {(c.materiales || []).length > 1 && (
                                <div style={{ marginBottom: 12, padding: "8px 12px", background: C.violetBg, borderRadius: 8, fontSize: 12, color: C.ink }}>
                                  <b style={{ color: C.violet }}>Materiales:</b>{" "}
                                  {c.materiales.map((m, i) => `${m.tipoTela || "—"} (${m.largoTrazo || 0}m × ${m.capas ?? 0} capas${m.meson ? ` · ${nombreMeson(c.planta, m.meson)}` : ""} = ${m.metros || 0}m)`).join("  ·  ")}
                                </div>
                              )}
                              {renderHorarioCorte(c)}
                              {(() => {
                                const enEdicion = editandoCantidades === c.id;
                                return (
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                    <div style={{ fontSize: 10, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Tallas cortadas</div>
                                    {isAdmin && !enEdicion && (
                                      <button
                                        onClick={() => iniciarEdicionCantidades(c)}
                                        title="Corregir cantidades por talla"
                                        style={{ background: C.blueBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.blue, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                                      >
                                        ✎ Editar cantidades
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
                                <thead>
                                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <th style={{ textAlign: "left", padding: "4px 8px", color: C.slate, fontSize: 10, textTransform: "uppercase" }}>Referencia</th>
                                    <th style={{ textAlign: "left", padding: "4px 8px", color: C.slate, fontSize: 10, textTransform: "uppercase" }}>Tallas</th>
                                    <th style={{ textAlign: "right", padding: "4px 8px", color: C.slate, fontSize: 10, textTransform: "uppercase" }}>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {editandoCantidades === c.id
                                    ? (() => {
                                        const pedidoDelCorteFila = pedidos.find((p) => p.id === c.pedidoId);
                                        return (cantidadesEdit || []).map((r, refIdx) => {
                                          const opcionesRef = (pedidoDelCorteFila?.referencias || []).filter(
                                            (rp) => rp.id === r.refId || !(cantidadesEdit || []).some((ce) => ce.refId === rp.id)
                                          );
                                          return (
                                        <tr key={r.refId} style={{ borderBottom: `1px solid ${C.border}` }}>
                                          <td style={{ padding: "6px 8px", fontWeight: 700, verticalAlign: "top" }}>
                                            {opcionesRef.length > 0 ? (
                                              <select
                                                value={r.refId}
                                                onChange={(e) => cambiarReferenciaEdit(refIdx, e.target.value, pedidoDelCorteFila)}
                                                title="Corregir a cuál referencia del pedido pertenece esta fila"
                                                style={{ padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit", maxWidth: 220 }}
                                              >
                                                {opcionesRef.map((rp) => (
                                                  <option key={rp.id} value={rp.id}>{rp.ref}{rp.descripcion ? ` — ${rp.descripcion}` : ""}</option>
                                                ))}
                                              </select>
                                            ) : (
                                              <>{r.ref}{r.descripcion ? ` — ${r.descripcion}` : ""}</>
                                            )}
                                          </td>
                                          <td style={{ padding: "6px 8px" }}>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                              {ordenarTallas(Object.keys(r.tallas || {})).map((t) => (
                                                <div key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                  <span style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>{t}</span>
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    value={r.tallas[t]}
                                                    onChange={(e) => actualizarTallaEdit(refIdx, t, e.target.value)}
                                                    style={{ width: 56, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, verticalAlign: "top" }}>{fmtNum(r.total)}</td>
                                        </tr>
                                          );
                                        });
                                      })()
                                    : (c.refs || []).map((r) => (
                                        <tr key={r.refId} style={{ borderBottom: `1px solid ${C.border}` }}>
                                          <td style={{ padding: "6px 8px", fontWeight: 700 }}>{r.ref}{r.descripcion ? ` — ${r.descripcion}` : ""}</td>
                                          <td style={{ padding: "6px 8px", color: C.slate }}>
                                            {ordenarTallas(Object.keys(r.tallas || {})).filter((t) => r.tallas[t] > 0).map((t) => `${t}:${r.tallas[t]}`).join(", ")}
                                          </td>
                                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{fmtNum(r.total)}</td>
                                        </tr>
                                      ))}
                                </tbody>
                              </table>
                              {editandoCantidades === c.id && (() => {
                                const pedidoDelCorte = pedidos.find((p) => p.id === c.pedidoId);
                                const coloresDisponibles = (pedidoDelCorte?.referencias || []).filter(
                                  (r) => !(cantidadesEdit || []).some((ce) => ce.refId === r.id)
                                );
                                return (
                                  <div style={{ marginBottom: 14 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                                      <div style={{ fontSize: 10, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Cortador</div>
                                      <select
                                        value={cortadorEdit}
                                        onChange={(e) => setCortadorEdit(e.target.value)}
                                        style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
                                      >
                                        <option value="">— Sin asignar —</option>
                                        {(cortadoresConfig || []).map((ct) => (
                                          <option key={ct.nombre} value={ct.nombre}>{ct.nombre}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {!!coloresDisponibles.length && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", background: C.blueBg, borderRadius: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>+ Agregar color faltante:</span>
                                        <select
                                          value={colorAAgregar}
                                          onChange={(e) => setColorAAgregar(e.target.value)}
                                          style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, color: C.ink, outline: "none", fontFamily: "inherit" }}
                                        >
                                          <option value="">Elegir color de {pedidoDelCorte?.numero ? `#${pedidoDelCorte.numero}` : "este pedido"}...</option>
                                          {coloresDisponibles.map((r) => (
                                            <option key={r.id} value={r.id}>{r.ref}{r.descripcion ? ` — ${r.descripcion}` : ""}</option>
                                          ))}
                                        </select>
                                        <Btn small variant="secondary" disabled={!colorAAgregar} onClick={() => agregarColorFaltante(pedidoDelCorte)}>
                                          Agregar
                                        </Btn>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {editandoCantidades === c.id && (
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                  <Btn small variant="secondary" onClick={cancelarEdicionCantidades}>Cancelar</Btn>
                                  <Btn small variant="success" onClick={() => guardarCantidadesEdit(c.pedidoId, c.id)}>Guardar cantidades</Btn>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {subTab === "cumplidos" && (
        !cumplidosProg.length ? (
          <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>Todavía no hay referencias cumplidas.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Cliente / Pedido</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Referencia</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Cantidad</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Fecha programada</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Se cortó el</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Resultado</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}></th>
              </tr>
            </thead>
            <tbody>
              {cumplidosProg.map((p) => {
                const tarde = p.fechaCumplioISO && p.fechaProgramada && p.fechaCumplioISO > p.fechaProgramada;
                const cant = p.cantidadProgramada ?? p.cantidadPendiente;
                const editando = editandoCumplidoId === p.id;
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: editando ? C.blueBg : "transparent" }}>
                    <td style={{ padding: "10px", fontWeight: 700, color: C.ink }}>{p.cliente} · #{p.numero}</td>
                    <td style={{ padding: "10px" }}>{p.ref}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      {editando ? (
                        <input
                          type="number"
                          min={0}
                          value={edicionCumplido.cantidad}
                          onChange={(e) => setEdicionCumplido((s) => ({ ...s, cantidad: parseInt(e.target.value) || 0 }))}
                          style={{ width: 70, padding: "4px 6px", border: `1.5px solid ${C.blue}`, borderRadius: 6, fontSize: 12, textAlign: "right" }}
                        />
                      ) : (
                        fmtNum(cant)
                      )}
                    </td>
                    <td style={{ padding: "10px" }}>{fmtFechaISO(p.fechaProgramada)}</td>
                    <td style={{ padding: "10px" }}>
                      {editando ? (
                        <input
                          type="date"
                          value={edicionCumplido.fecha}
                          onChange={(e) => setEdicionCumplido((s) => ({ ...s, fecha: e.target.value }))}
                          style={{ padding: "4px 6px", border: `1.5px solid ${C.blue}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}
                        />
                      ) : (
                        fmtFechaISO(p.fechaCumplioISO)
                      )}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 800, color: tarde ? C.red : C.green }}>
                      {tarde ? "Tarde" : "A tiempo"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {editando ? (
                        <>
                          <button
                            onClick={() => {
                              onEditarCumplido(p.id, { cantidadProgramada: edicionCumplido.cantidad, fechaCumplioISO: edicionCumplido.fecha });
                              setEditandoCumplidoId(null);
                            }}
                            style={{ background: C.greenBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.green, fontWeight: 700, fontSize: 11, cursor: "pointer", marginRight: 6 }}
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditandoCumplidoId(null)}
                            style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", color: C.slate, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : isAdmin ? (
                        <>
                          <button
                            onClick={() => {
                              setEditandoCumplidoId(p.id);
                              setEdicionCumplido({ cantidad: cant, fecha: p.fechaCumplioISO || today() });
                            }}
                            title="Editar"
                            style={{ background: C.blueBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.blue, fontWeight: 700, fontSize: 11, cursor: "pointer", marginRight: 6 }}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => onEliminarCumplido(p.id)}
                            title="Eliminar"
                            style={{ background: C.redBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.red, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                          >
                            🗑
                          </button>
                        </>
                      ) : (
                        <span title="Solo un administrador puede modificar un corte ya registrado" style={{ fontSize: 11, color: C.slate }}>
                          🔒
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
      {subTab === "vencidos" && (
        !vencidosProg.length ? (
          <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
            No hay cortes vencidos — todo lo programado está al día. 🎉
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Cliente / Pedido</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Referencia</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Cantidad</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Fecha programada</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Días vencido</th>
                <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}></th>
              </tr>
            </thead>
            <tbody>
              {vencidosProg.map((p) => {
                const cant = p.cantidadProgramada ?? p.cantidadPendiente;
                return (
                  <tr
                    key={p.id}
                    onClick={() => abrirFlujoCorte({ pedidoId: p.pedidoId, numero: p.numero, cliente: p.cliente, ref: p.ref, colores: [p] })}
                    title={p.etapa === "programacion_hecha" ? "Ir a Entrada de Corte" : "Ir a Programación Hecha"}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: C.redBg }}
                  >
                    <td style={{ padding: "10px", fontWeight: 700, color: C.ink }}>{p.cliente} · #{p.numero}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontWeight: 700 }}>{p.ref}</span>
                      {p.descripcion && <span style={{ color: C.slate, marginLeft: 6, fontSize: 12 }}>{p.descripcion}</span>}
                      {p.etapa === "programacion_hecha" && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: C.cyan, background: C.blueBg, padding: "2px 6px", borderRadius: 10 }}>
                          ✓ {p.planta}
                          {p.meson ? ` · ${nombreMeson(p.planta, p.meson)}` : ""}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: C.amber }}>{fmtNum(cant)}</td>
                    <td style={{ padding: "10px" }}>{fmtFechaISO(p.fechaProgramada)}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 800, color: C.red }}>{Math.abs(p.dias)}d</td>
                    <td style={{ padding: "10px", textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <span style={{ fontSize: 11, color: p.etapa === "programacion_hecha" ? C.cyan : C.violet, fontWeight: 700, marginRight: 10 }}>
                        {p.etapa === "programacion_hecha" ? "✂ Click para Entrada de Corte" : "📋 Click para Programación Hecha"}
                      </span>
                      {isAdmin ? (
                        <button
                          onClick={() => onCancelar(p.id)}
                          title="Cancelar programación (admin)"
                          style={{ background: C.white, border: `1px solid ${C.red}`, borderRadius: 6, padding: "4px 8px", color: C.red, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      ) : (
                        <span title="Solo un administrador puede borrar una programación" style={{ fontSize: 11, color: C.slate }}>
                          🔒
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
      {subTab === "manual" && !isAdmin && (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          🔒 Esta sección es solo para administradores.
        </div>
      )}
      {subTab === "manual" && isAdmin && (
        <div>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 660 }}>
            Busca un pedido por número o cliente — sin importar si ya está cerrado o terminado — para cargar un corte que sí se hizo pero nunca se registró en ATLAS a tiempo. Al guardar, queda en "Cortes Aprobados" para ponerle lote, igual que cualquier otro corte. Si al pedido le queda algo pendiente después de esto, vuelve solo a la cola normal.
          </p>
          {!pedidoManualSel ? (
            <div>
              <input
                value={busquedaManual}
                onChange={(e) => setBusquedaManual(e.target.value)}
                placeholder="Número de pedido o cliente..."
                style={{ width: "100%", maxWidth: 420, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.ink, outline: "none", fontFamily: "inherit", marginBottom: 14 }}
              />
              {busquedaManual.trim().length >= 2 &&
                (() => {
                  const q = busquedaManual.trim().toLowerCase();
                  const resultados = pedidos
                    .filter((p) => String(p.numero || "").toLowerCase().includes(q) || (p.cliente || "").toLowerCase().includes(q))
                    .sort((a, b) => String(b.numero).localeCompare(String(a.numero)))
                    .slice(0, 25);
                  if (!resultados.length) {
                    return <div style={{ textAlign: "center", padding: 32, color: C.slate, fontSize: 13 }}>Sin resultados para "{busquedaManual}".</div>;
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {resultados.map((p) => {
                        const estadoInfo =
                          p.estado === "activo"
                            ? { label: "🟢 Activo", color: C.green }
                            : p.estado === "terminado"
                            ? { label: "✅ Terminado", color: C.blue }
                            : { label: "🔒 Cerrado", color: C.slate };
                        return (
                          <div
                            key={p.id}
                            onClick={() => setPedidoManualSel(p)}
                            style={{ cursor: "pointer", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.white }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{p.cliente} · #{p.numero}</span>
                              <span style={{ fontSize: 11, fontWeight: 800, color: estadoInfo.color }}>{estadoInfo.label}</span>
                            </div>
                            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                              {(p.referencias || []).length} referencia{(p.referencias || []).length === 1 ? "" : "s"}
                              {p.motivoCierre ? ` · ${p.motivoCierre}` : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
            </div>
          ) : (
            <div>
              <Btn small variant="secondary" onClick={() => setPedidoManualSel(null)}>← Elegir otro pedido</Btn>
              <div style={{ marginTop: 14 }}>
                <ProgramarCorteModal
                  inline
                  pedido={pedidoManualSel}
                  plantas={plantasConfig || []}
                  cortadores={cortadoresConfig || []}
                  telas={telas || []}
                  preciosMap={preciosMap}
                  lotesExistentes={lotesExistentes}
                  itemsUsadosMeson={itemsUsadosMeson}
                  pedidosTodos={pedidos}
                  onSave={(corte) => onRegistrarCorteManual(pedidoManualSel.id, corte)}
                  onClose={() => setPedidoManualSel(null)}
                  onGuardado={() => {
                    setPedidoManualSel(null);
                    setBusquedaManual("");
                    setSubTab("aprobados");
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ─── CENTRO DE COSTO (por cortador) ────────────────────────────────────────────
// Primer centro de costo del aplicativo: por cada persona que aparece
// cortando este mes (campo "cortador" en los registros de Programar Corte),
// se compara cuánto "generó" en corte (unidades × precio/prenda de cada
// referencia que cortó) contra cuánto le cuesta a la empresa según la
// nómina cargada en Admin Corte. Los trabajadores de nómina que no
// cortaron nada este mes también aparecen, en 0, para que sea visible si
// alguien no está siendo aprovechado en corte; los nombres que cortaron
// pero no están en la nómina quedan marcados para revisar el dato (puede
// ser un nombre escrito distinto, o un trabajador que falta agregar).
// Centro de Costo con tres periodos — Día, Mes, Año. El "ingreso" siempre se
// suma directo de los cortes registrados en ese rango de fechas (dato real,
// exacto para cualquier periodo). El "costo de nómina" es distinto: solo se
// guarda el sueldo ACTUAL de cada trabajador (no un histórico mes a mes), así
// que para Día y Año se estima a partir de ese sueldo actual — se avisa en
// pantalla que esa parte es una aproximación, no un dato histórico real.
function CentroCosto({ pedidos, trabajadores }) {
  const hoy = today();
  const [periodo, setPeriodo] = useState("mes"); // "dia" | "mes" | "anio"
  const [fechaDia, setFechaDia] = useState(hoy);
  const [mesSel, setMesSel] = useState(new Date().getMonth() + 1);
  const [anioSel, setAnioSel] = useState(new Date().getFullYear());
  const norm = (s) => String(s || "").trim().toUpperCase();
  // Franja de cumplimiento diario — de un vistazo, últimos 30 días: verde =
  // el ingreso de corte cubrió la nómina estimada de ese día, rojo = no la
  // cubrió, gris = sin cortes registrados ese día. Cada día se calcula
  // independiente del periodo/fecha que esté elegido arriba (siempre mira
  // exactamente ESE día), y al hacer clic salta la vista "Día" a esa fecha.
  function estadoDia(fechaISO) {
    const cortesDia = pedidos.flatMap((p) => p.cortesRealizados || []).filter((c) => c.fecha === fechaISO);
    const ingreso = cortesDia.reduce((s, c) => s + (c.ingresoCorte || 0), 0);
    const [y, m] = fechaISO.split("-").map(Number);
    const dh = diasHabiles(m, y) || 1;
    const costo = (trabajadores || []).reduce((s, t) => s + (t.sueldo || 0) / dh, 0);
    return {
      ingreso,
      costo,
      tieneCortes: cortesDia.length > 0,
      ok: cortesDia.length > 0 && costo > 0 ? ingreso >= costo : null,
    };
  }
  const diasStrip = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    diasStrip.push(d.toISOString().slice(0, 10));
  }
  function enPeriodo(fechaISO) {
    if (!fechaISO) return false;
    if (periodo === "dia") return fechaISO === fechaDia;
    if (periodo === "mes") return fechaISO.slice(0, 7) === `${anioSel}-${String(mesSel).padStart(2, "0")}`;
    if (periodo === "anio") return fechaISO.slice(0, 4) === String(anioSel);
    return false;
  }
  // Costo de nómina para el periodo elegido, a partir del sueldo mensual
  // actual de cada trabajador (no hay histórico de nómina por mes guardado).
  function costoPeriodo(sueldoMensual) {
    if (periodo === "dia") {
      const [y, m] = fechaDia.split("-").map(Number);
      return sueldoMensual / diasHabiles(m, y);
    }
    if (periodo === "anio") return sueldoMensual * 12;
    return sueldoMensual;
  }
  const cortesPeriodo = pedidos
    .flatMap((p) => p.cortesRealizados || [])
    .filter((c) => enPeriodo(c.fecha));
  const porCortador = new Map();
  cortesPeriodo.forEach((c) => {
    const nombre = (c.cortador || "").trim() || "(Sin cortador asignado)";
    const key = norm(nombre);
    if (!porCortador.has(key)) porCortador.set(key, { nombre, unidades: 0, ingreso: 0 });
    const acc = porCortador.get(key);
    acc.unidades += c.totalUnidades || 0;
    acc.ingreso += c.ingresoCorte || 0;
  });
  const filas = [];
  const usados = new Set();
  (trabajadores || []).forEach((t) => {
    const key = norm(t.nombre);
    const datos = porCortador.get(key);
    filas.push({
      nombre: t.nombre,
      unidades: datos?.unidades || 0,
      ingreso: datos?.ingreso || 0,
      costo: costoPeriodo(t.sueldo || 0),
      enNomina: true,
    });
    usados.add(key);
  });
  porCortador.forEach((datos, key) => {
    if (usados.has(key)) return;
    filas.push({ nombre: datos.nombre, unidades: datos.unidades, ingreso: datos.ingreso, costo: 0, enNomina: false });
  });
  filas.sort((a, b) => b.ingreso - a.ingreso);
  const totalUnidades = filas.reduce((s, f) => s + f.unidades, 0);
  const totalIngreso = filas.reduce((s, f) => s + f.ingreso, 0);
  const totalCosto = filas.reduce((s, f) => s + f.costo, 0);
  const rentabilidad = totalIngreso - totalCosto;
  const pctCobertura = totalCosto > 0 ? (totalIngreso / totalCosto) * 100 : 0;
  const estado = totalCosto === 0 ? null : totalIngreso >= totalCosto ? "ok" : "bad";
  const etiquetaPeriodo =
    periodo === "dia"
      ? fmtFechaISO(fechaDia)
      : periodo === "mes"
      ? `${["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][mesSel - 1]} ${anioSel}`
      : String(anioSel);
  const btnPeriodo = (id, label) => (
    <button
      onClick={() => setPeriodo(id)}
      style={{
        padding: "8px 16px",
        borderRadius: 8,
        border: `1px solid ${periodo === id ? C.ink : C.border}`,
        background: periodo === id ? C.ink : C.white,
        color: periodo === id ? C.seam : C.slate,
        fontWeight: 800,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: C.ink }}>
        💰 Centro de Costo — Corte
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 680 }}>
        "Ingreso" = unidades cortadas × precio/prenda de cada corte registrado en el periodo (dato real). "Costo" = sueldo integral de nómina
        {periodo !== "mes" && (
          <strong>
            {" "}
            — {periodo === "dia" ? "estimado dividiendo el sueldo mensual actual entre los días hábiles del mes" : "estimado multiplicando el sueldo mensual actual × 12"}, porque solo se guarda la nómina vigente, no un histórico mes a mes
          </strong>
        )}
        .
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
        {btnPeriodo("dia", "📆 Día")}
        {btnPeriodo("mes", "🗓 Mes")}
        {btnPeriodo("anio", "📅 Año")}
        {periodo === "dia" && (
          <input
            type="date"
            value={fechaDia}
            onChange={(e) => setFechaDia(e.target.value)}
            style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
          />
        )}
        {periodo === "mes" && (
          <>
            <select
              value={mesSel}
              onChange={(e) => setMesSel(Number(e.target.value))}
              style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
            >
              {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              value={anioSel}
              onChange={(e) => setAnioSel(Number(e.target.value) || anioSel)}
              style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, width: 90, fontFamily: "inherit" }}
            />
          </>
        )}
        {periodo === "anio" && (
          <input
            type="number"
            value={anioSel}
            onChange={(e) => setAnioSel(Number(e.target.value) || anioSel)}
            style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, width: 90, fontFamily: "inherit" }}
          />
        )}
        <span style={{ fontSize: 12, color: C.slate, marginLeft: 4 }}>Mostrando: <strong style={{ color: C.ink }}>{etiquetaPeriodo}</strong></span>
      </div>
      {periodo === "dia" && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Cumplimiento diario — últimos 30 días
          </div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
            {diasStrip.map((iso) => {
              const ed = estadoDia(iso);
              const color = ed.ok === true ? C.green : ed.ok === false ? C.red : C.slate;
              const bg = ed.ok === true ? C.greenBg : ed.ok === false ? C.redBg : C.canvas;
              const activo = iso === fechaDia;
              return (
                <button
                  key={iso}
                  onClick={() => setFechaDia(iso)}
                  title={`${fmtFechaISO(iso)} — ${ed.tieneCortes ? `${fmtCOP(ed.ingreso)} vs ${fmtCOP(ed.costo)} nómina` : "sin cortes"}`}
                  style={{
                    flex: "0 0 auto",
                    width: 26,
                    height: 34,
                    borderRadius: 6,
                    border: activo ? `2px solid ${C.ink}` : `1px solid ${C.border}`,
                    background: bg,
                    color,
                    fontSize: 9,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1.1,
                    padding: 0,
                  }}
                >
                  <span>{iso.slice(8, 10)}</span>
                  <span style={{ fontSize: 11 }}>{ed.ok === true ? "✓" : ed.ok === false ? "✗" : "·"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <KPICard icon="✂" label={`Unidades ${periodo === "dia" ? "Día" : periodo === "anio" ? "Año" : "Mes"}`} value={fmtNum(totalUnidades)} color={C.blue} bg={C.blueBg} />
        <KPICard icon="💵" label="Ingreso Corte" value={fmtCOP(totalIngreso)} color={C.green} bg={C.greenBg} />
        <KPICard icon="💸" label="Costo Nómina" value={fmtCOP(totalCosto)} color={C.amber} bg={C.amberBg} />
        <KPICard
          icon={rentabilidad >= 0 ? "📈" : "📉"}
          label="Rentabilidad"
          value={fmtCOP(rentabilidad)}
          color={rentabilidad >= 0 ? C.green : C.red}
          bg={rentabilidad >= 0 ? C.greenBg : C.redBg}
          sub={rentabilidad >= 0 ? "✓ Rentable" : "⚠ Pérdida"}
        />
      </div>
      {estado && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 18px",
            borderRadius: 30,
            fontWeight: 800,
            fontSize: 13,
            marginBottom: 24,
            background: estado === "ok" ? C.greenBg : C.redBg,
            color: estado === "ok" ? C.green : C.red,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: estado === "ok" ? C.green : C.red, display: "inline-block" }} />
          {estado === "ok" ? "El corte cubre la nómina" : "El corte NO cubre la nómina"} · {pctCobertura.toFixed(1)}% de cobertura
        </div>
      )}
      {!filas.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          Sin trabajadores en nómina ni cortes registrados en este periodo.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Cortador</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Unidades</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Ingreso Corte</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Costo Nómina</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>Rentabilidad</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const rent = f.ingreso - f.costo;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px", fontWeight: 700, color: C.ink }}>
                    {f.nombre}
                    {!f.enNomina && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.red, background: C.redBg, padding: "2px 6px", borderRadius: 10 }}>
                        no está en nómina
                      </span>
                    )}
                    {f.enNomina && f.unidades === 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.slate, background: C.canvas, padding: "2px 6px", borderRadius: 10 }}>
                        sin cortes en el periodo
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{fmtNum(f.unidades)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtCOP(f.ingreso)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{fmtCOP(f.costo)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: rent >= 0 ? C.green : C.red, fontWeight: 800 }}>{fmtCOP(rent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
// ─── HISTÓRICO ────────────────────────────────────────────────────────────────
// Ícono/color/etiqueta según motivoCierre (mismo criterio que motivoCierreInfo
// en App.js) — un único estado de cierre ("cerrado"), con el motivo aparte.
function motivoCierreInfo(motivo) {
  switch (motivo) {
    case "venta_perdida":
      return { icon: "💸", color: C.amber, bg: C.amberBg, label: "Venta Perdida (Busint)", desc: "Cerrado por Busint desde" };
    case "facturado":
      return { icon: "✅", color: C.green, bg: C.greenBg, label: "Facturado (Busint)", desc: "Cerrado por Busint desde" };
    case "ya_no_vigente":
      return { icon: "🚫", color: C.red, bg: C.redBg, label: "Ya no vigente en Busint", desc: "Dejó de aparecer en Busint desde" };
    default:
      return { icon: "✅", color: C.green, bg: C.greenBg, label: "Cumplido", desc: "Cumplido" };
  }
}
function Historico({ pedidos, onSelectPedido }) {
  // Un único estado de cierre ("cerrado"), con el motivo en motivoCierre —
  // lo pone "🧊 Congelar como base de Corte" (Vigentes por Cliente, módulo
  // Diseño → Pedidos) cuando un pedido activo deja de aparecer vigente en
  // Busint, o a mano desde el detalle del pedido en Pedidos.
  const cumplidos = pedidos.filter((p) => p.estado === "cerrado" || p.estado === "terminado");
  const [filtro, setFiltro] = useState("");
  const filtrados = filtro
    ? cumplidos.filter(
        (p) =>
          p.cliente?.toLowerCase().includes(filtro.toLowerCase()) ||
          p.numero?.includes(filtro)
      )
    : cumplidos;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2
            style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}
          >
            Histórico de Cortes
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            {cumplidos.length} pedido{cumplidos.length !== 1 ? "s" : ""}{" "}
            cumplido{cumplidos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por cliente o N°..."
          style={{
            padding: "9px 14px",
            border: `1.5px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 13,
            width: 220,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>
      {!filtrados.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate }}>
          Sin pedidos cumplidos aún.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtrados
            .sort((a, b) =>
              (b.fechaCumplido || "").localeCompare(a.fechaCumplido || "")
            )
            .map((p) => {
              const totalC = (p.cortesRealizados || []).reduce(
                (s, c) => s + (c.totalUnidades || 0),
                0
              );
              const ingresoTotal = (p.cortesRealizados || []).reduce(
                (s, c) => s + (c.ingresoCorte || 0),
                0
              );
              // Los pedidos "terminado" (corte dado por finalizado, a mano o al
              // llegar al 100%) traen su propia etiqueta — son distintos de
              // "cerrado" (cierre real confirmado por Busint), así que no
              // usan motivoCierreInfo (esa es solo para cierres de Busint).
              const mi =
                p.estado === "terminado"
                  ? { icon: "🏁", color: C.blue, bg: C.blueBg, label: "Terminado (corte)", desc: "Terminado" }
                  : motivoCierreInfo(p.motivoCierre);
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPedido(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 18px",
                    background: C.white,
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = C.canvas)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = C.white)
                  }
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: mi.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {mi.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: C.ink, display: "flex", alignItems: "center", gap: 8 }}>
                      Pedido #{p.numero} — {p.cliente}
                      <span style={{ fontSize: 10, fontWeight: 800, color: mi.color, background: mi.bg, padding: "1px 8px", borderRadius: 10 }}>
                        {mi.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.slate }}>
                      {mi.desc}: {p.fechaCumplido || "—"} · {fmtNum(totalC)} uds
                      cortadas
                      {p.motivoCierre === "venta_perdida" && p.ventasPerdidasUds ? ` · ${fmtNum(p.ventasPerdidasUds)} uds dadas de baja` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{ fontWeight: 800, color: C.green, fontSize: 15 }}
                    >
                      {fmtCOP(ingresoTotal)}
                    </div>
                    <div style={{ fontSize: 11, color: C.slate }}>
                      ingreso corte
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
// ─── ROOT MÓDULO CORTE ────────────────────────────────────────────────────────
export default function ModuloCorte({ currentUser, onLogout, onVolver, puedeAprobarCorte }) {
  const [view, setView] = useState("dashboard");
  const [pedidos, setPedidos] = useState([]);
  const [selPedidoId, setSelPedidoId] = useState(null);
  const [corteConfig, setCorteConfig] = useState({
    plantas: [
      {
        id: "p1",
        nombre: "Planta Industrias Yanko",
        mesones: [
          { id: "m1", nombre: "Mesón 1", metros: 10, grupoId: "" },
          { id: "m2", nombre: "Mesón 2", metros: 9, grupoId: "g1" },
          { id: "m3", nombre: "Mesón 3", metros: 5, grupoId: "g1" },
        ],
        grupos: [{ id: "g1", nombre: "Mesa compartida (Mesón 2+3)", metros: 14 }],
      },
      {
        id: "p2",
        nombre: "Planta Indutex",
        mesones: [{ id: "m1", nombre: "Mesón 1", metros: 10, grupoId: "" }],
        grupos: [],
      },
    ],
    cortadores: [],
    nomina: { trabajadores: [] },
    telas: [],
  });
  const [loading, setLoading] = useState(true);
  // Ventas Perdidas (Busint) y Planeación (lotes/inventario en proceso) — se
  // leen aquí también, aparte de en Diseño → Pedidos, para que la Cola
  // Sugerida calcule el pendiente real por referencia sin depender de que el
  // usuario tenga esa otra pantalla abierta. Mismo criterio de "última
  // carga" (Ventas Perdidas) y "todas las cargas, máximo por lote"
  // (Planeación) que en InformeVigentesBusintView de App.js.
  const [ventasPerdidasCargas, setVentasPerdidasCargas] = useState([]);
  const [planeacionCargas, setPlaneacionCargas] = useState([]);
  // Precios de corte por referencia (Centro de Costo → Admin Corte → Precios
  // Corte). Se usa la carga más reciente, igual que Ventas Perdidas.
  const [preciosCorteCargas, setPreciosCorteCargas] = useState([]);
  // Programación de Corte: fecha comprometida por pedido, con cumplimiento
  // automático (ver useEffect más abajo).
  const [programacionCorte, setProgramacionCorte] = useState([]);
  // Lotes de corte (uno por cada corte registrado desde ProgramarCorteModal)
  // — se usa para validar que el número de lote nunca se repita y para tener
  // un registro simple (cantidad, fecha, referencia, pedido) de cada corte
  // terminado.
  const [lotesCorte, setLotesCorte] = useState([]);
  // Ítem de Programación desde el que se está yendo a cortar (botón "✂
  // Cortar" en Programados Pendientes) — se usa para abrir Programar Corte
  // ya con la referencia/tallas/cantidades de esa programación cargadas.
  const [preseleccionCorte, setPreseleccionCorte] = useState(null);
  // Qué sub-pestaña de "Producción Corte" abrir la próxima vez que se
  // muestre la vista "programacion" — se usa para, tras registrar un corte
  // real en Entrada de Corte, volver directo a "Cortes Aprobados" (en vez
  // de caer siempre en "Programar"). Se limpia solo después de usarse (ver
  // useEffect más abajo) para no quedar pegado en visitas futuras.
  const [navProduccion, setNavProduccion] = useState(null);
  useEffect(() => {
    if (view === "programacion" && navProduccion) setNavProduccion(null);
  }, [view]);
  useEffect(() => {
    const unsubs = [];
    async function init() {
      try {
        const unsubPedidos = onSnapshot(
          collection(db, "pedidos_activos"),
          (snap) => {
            setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
          }
        );
        unsubs.push(unsubPedidos);
        const unsubVP = onSnapshot(collection(db, "ventas_perdidas_cargas"), (snap) => {
          setVentasPerdidasCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        unsubs.push(unsubVP);
        const unsubPlan = onSnapshot(collection(db, "planeacion_cargas"), (snap) => {
          setPlaneacionCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        unsubs.push(unsubPlan);
        const unsubPrecios = onSnapshot(collection(db, "precios_corte_cargas"), (snap) => {
          setPreciosCorteCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        unsubs.push(unsubPrecios);
        const unsubProgramacion = onSnapshot(collection(db, "corte_programacion"), (snap) => {
          setProgramacionCorte(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        unsubs.push(unsubProgramacion);
        const unsubLotes = onSnapshot(collection(db, "corte_lotes"), (snap) => {
          setLotesCorte(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        unsubs.push(unsubLotes);
        const cfgDocs = await fsGet("corte_config");
        if (cfgDocs.length)
          setCorteConfig((prev) => ({ ...prev, ...cfgDocs[0] }));
        else await fsSave("corte_config", "main", corteConfig);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    init();
    return () => unsubs.forEach((fn) => fn());
  }, []);
  const ultimaCargaVP = ventasPerdidasCargas.reduce(
    (max, c) => (!max || (c.creadoTs || 0) > (max.creadoTs || 0) ? c : max),
    null
  );
  const vpRefMap = new Map((ultimaCargaVP?.filasPorRef || []).map((f) => [`${f.numero}__${f.ref}`, f]));
  const lotesCortadoMap = new Map();
  {
    const porNumLote = new Map();
    planeacionCargas.forEach((carga) => {
      (carga.lotes || []).forEach((l) => {
        const numPedido = String(l.numPedido ?? "").trim();
        const ref = String(l.referencia ?? "").trim();
        if (!numPedido || !ref) return;
        const numLote = String(l.numLote ?? "").trim() || `${numPedido}__${ref}__sinlote`;
        const enProceso =
          (Number(l.invCorte) || 0) +
          (Number(l.invBMP) || 0) +
          (Number(l.invPlanta) || 0) +
          (Number(l.invBPT) || 0) +
          (Number(l.invSemiterminado) || 0);
        const cantidad = Math.max(Number(l.cantCortada) || 0, enProceso);
        const actual = porNumLote.get(numLote);
        if (!actual || cantidad > actual.cantidad) {
          porNumLote.set(numLote, { numPedido, ref, cantidad });
        }
      });
    });
    porNumLote.forEach(({ numPedido, ref, cantidad }) => {
      const clave = `${numPedido}__${ref}`;
      lotesCortadoMap.set(clave, (lotesCortadoMap.get(clave) || 0) + cantidad);
    });
  }
  const ultimaCargaPrecios = preciosCorteCargas.reduce(
    (max, c) => (!max || (c.creadoTs || 0) > (max.creadoTs || 0) ? c : max),
    null
  );
  const preciosMap = new Map((ultimaCargaPrecios?.precios || []).map((p) => [String(p.ref).trim(), p.precio]));
  // Números de lote ya usados (el id del doc en corte_lotes ES el número de
  // lote) — se usa para no dejar repetir un número de lote al registrar un
  // corte.
  const lotesExistentes = new Set(lotesCorte.map((l) => String(l.id).trim().toUpperCase()));
  // Une los nombres de "Cortadores" (lista histórica) con los de "Nómina"
  // (lo que se sube por archivo o se agrega a mano), sin duplicados, para
  // que el desplegable de "Cortador" en Programar Corte siempre incluya a
  // quien esté en la nómina — así el Centro de Costo puede emparejar por
  // nombre sin depender de que alguien haya recordado agregarlo dos veces.
  const cortadoresUnificados = (() => {
    const nombres = new Map();
    (corteConfig.cortadores || []).forEach((c) => nombres.set(c.nombre.trim().toUpperCase(), c.nombre));
    (corteConfig.nomina?.trabajadores || []).forEach((t) => nombres.set(t.nombre.trim().toUpperCase(), t.nombre));
    return [...nombres.values()].sort().map((nombre) => ({ id: nombre, nombre }));
  })();
  // Largo de trazo ya comprometido en un mesón (o su grupo compartido) para
  // una fecha+planta puntual. La capacidad de un mesón (10m, 14m...) es el
  // LARGO de la mesa donde se tiende el trazo — NO los metros totales de
  // tela consumida. Un trazo de 8m ocupa 8m de mesa sin importar si encima
  // se apilan 40 capas o 200; lo que no cabe en la mesa es el trazo mismo,
  // no la tela acumulada. Por eso acá se suma `largoTrazo`, no
  // `metrosTendido` (que es largoTrazo × capas y sirve para otras cosas,
  // como el tiempo teórico por tipo de tela).
  function metrosUsadosMeson(fecha, plantaNombre, mesonId, grupoId, excluirId) {
    // excluirId puede ser un solo id (compatibilidad) o un arreglo de ids —
    // se usa un arreglo cuando se edita una referencia con varios colores
    // (varios docs de corte_programacion comparten el mismo trazo físico).
    const excluirIds = Array.isArray(excluirId) ? excluirId : excluirId ? [excluirId] : [];
    // Varios colores de una misma referencia comparten UN solo trazo (se
    // tienden juntos en la misma mesa) — si cada color se sumara aparte se
    // contaría el mismo trazo varias veces. Se deduplica por pedido+ref.
    const vistos = new Set();
    let total = 0;
    programacionCorte.forEach((pr) => {
      if (excluirIds.includes(pr.id)) return;
      if (pr.fechaProgramada !== fecha || pr.planta !== plantaNombre) return;
      if (!(pr.etapa === "programacion_hecha" || pr.estado === "cumplido")) return;
      const mismoMeson = pr.meson === mesonId;
      const mismoGrupo = grupoId && pr.mesonGrupo === grupoId;
      if (!(mismoMeson || mismoGrupo)) return;
      const claveRef = `${pr.pedidoId}__${pr.ref}`;
      if (vistos.has(claveRef)) return;
      vistos.add(claveRef);
      total += pr.largoTrazo || 0;
    });
    return total;
  }
  // Igual que metrosUsadosMeson pero devuelve los ítems (no solo la suma) —
  // se usa para dibujar el timeline visual del mesón: qué referencias ya
  // tienen horario estimado ese día en ese mesón, y en qué franja.
  function itemsUsadosMeson(fecha, plantaNombre, mesonId, grupoId, excluirIds) {
    const excluir = excluirIds || [];
    const vistos = new Set();
    const items = [];
    programacionCorte.forEach((pr) => {
      if (excluir.includes(pr.id)) return;
      if (pr.fechaProgramada !== fecha || pr.planta !== plantaNombre) return;
      if (!(pr.etapa === "programacion_hecha" || pr.estado === "cumplido")) return;
      const mismoMeson = pr.meson === mesonId;
      const mismoGrupo = grupoId && pr.mesonGrupo === grupoId;
      if (!(mismoMeson || mismoGrupo)) return;
      const claveRef = `${pr.pedidoId}__${pr.ref}`;
      if (vistos.has(claveRef)) return;
      vistos.add(claveRef);
      items.push({
        id: claveRef,
        ref: pr.ref,
        cliente: pr.cliente,
        numero: pr.numero,
        horaInicioEstimada: pr.horaInicioEstimada || "",
        horaFinEstimada: pr.horaFinEstimada || "",
        largoTrazo: pr.largoTrazo || 0,
        // Capas teóricas (Programación de Mesones) — se suman en la vista de
        // Disponibilidad de Mesones para saber cuántas capas hay comprometidas
        // ese día en ese mesón, no solo cuántos metros de trazo.
        capas: pr.capas || 0,
      });
    });
    return items;
  }
  // Tiempo teórico por tipo de tela: promedio real (minutos ÷ metros
  // tendidos) de todos los cortes ya registrados con ese tipo de tela — se
  // va afinando solo a medida que se registran más cortes reales.
  const estadisticasTela = (() => {
    const byTela = {};
    pedidos.forEach((p) =>
      (p.cortesRealizados || []).forEach((c) => {
        if (!c.tipoTela || !(c.metrosTendido > 0) || !(c.minutos > 0)) return;
        if (!byTela[c.tipoTela]) byTela[c.tipoTela] = { minutos: 0, metros: 0, cortes: 0 };
        byTela[c.tipoTela].minutos += c.minutos;
        byTela[c.tipoTela].metros += c.metrosTendido;
        byTela[c.tipoTela].cortes++;
      })
    );
    const out = {};
    Object.entries(byTela).forEach(([tela, d]) => {
      out[tela] = { minPorMetro: d.metros > 0 ? d.minutos / d.metros : null, cortes: d.cortes };
    });
    return out;
  })();
  async function savePedido(pedido) {
    setPedidos((ps) =>
      ps.some((p) => p.id === pedido.id)
        ? ps.map((p) => (p.id === pedido.id ? pedido : p))
        : [...ps, pedido]
    );
    await fsSave("pedidos_activos", pedido.id, pedido);
  }
  // Registra un corte real (Entrada de Corte) directamente desde "Ingreso de
  // Corte Real", SIN pasar por la pantalla completa del pedido — así el
  // cortador no pierde de vista dónde estaba. Misma lógica que
  // `registrarCorte` dentro de DetallePedido, pero buscando el pedido en
  // `pedidos` en vez de tenerlo ya en props.
  function registrarCorteReal(pedidoId, corte) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const updated = {
      ...pedido,
      cortesRealizados: [...(pedido.cortesRealizados || []), corte],
    };
    const totalPedido = pedido.referencias.reduce((s, r) => s + r.total, 0);
    const totalC = updated.cortesRealizados.reduce((s, c) => s + (c.totalUnidades || 0), 0);
    if (totalC >= totalPedido && updated.estado === "activo") {
      updated.estado = "terminado";
      updated.fechaCumplido = today();
    }
    savePedido(updated);
    // El lote en Entrada de Corte es opcional — si el patronista ya lo puso
    // ahí mismo (en vez de esperar a "Cortes Aprobados"), hay que registrarlo
    // igual en corte_lotes para que cuente contra duplicados y estadísticas,
    // igual que cuando se asigna después con confirmarLoteCorteReal.
    if (corte.lote) {
      guardarLoteCorte({
        numero: corte.lote,
        pedidoId,
        numeroPedido: pedido.numero,
        cliente: pedido.cliente,
        cantidad: corte.totalUnidades || 0,
        fecha: corte.fecha,
        creadoEn: new Date().toISOString(),
      });
    }
  }
  // Registro MANUAL/retroactivo de un corte real que sí se hizo pero nunca
  // se cargó en ATLAS a tiempo — a diferencia de registrarCorteReal (que
  // solo trabaja con pedidos activos, dentro del flujo normal de
  // Programación de Mesones), este se puede llamar sobre CUALQUIER pedido
  // sin importar su estado (incluso uno que Busint ya cerró como facturado/
  // venta perdida en Vigentes, o que la app ya marcó "terminado"). El estado
  // final queda automático según lo que quede pendiente después de sumar
  // este corte: si todavía falta algo por cortar, el pedido vuelve a
  // "activo" para que reaparezca en la cola normal de Corte; si con esto ya
  // queda completo, se deja como estaba (Busint ya lo dio por hecho, no hay
  // que reabrirlo).
  async function registrarCorteManualHistorico(pedidoId, corte) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const cortesActualizados = [...(pedido.cortesRealizados || []), corte];
    const totalPedido = (pedido.referencias || []).reduce((s, r) => s + (r.total || 0), 0);
    const totalC = cortesActualizados.reduce((s, c) => s + (c.totalUnidades || 0), 0);
    const patch = { cortesRealizados: cortesActualizados };
    if (totalC >= totalPedido) {
      if (pedido.estado === "activo") {
        patch.estado = "terminado";
        patch.fechaCumplido = today();
      }
    } else if (pedido.estado === "cerrado" || pedido.estado === "terminado") {
      patch.estado = "activo";
      patch.motivoCierre = null;
      patch.fechaCumplido = null;
    }
    await fsSave("pedidos_activos", pedidoId, patch);
    // Mismo caso que en registrarCorteReal: si el lote se puso de una vez acá
    // (opcional), se registra también en corte_lotes.
    if (corte.lote) {
      await guardarLoteCorte({
        numero: corte.lote,
        pedidoId,
        numeroPedido: pedido.numero,
        cliente: pedido.cliente,
        cantidad: corte.totalUnidades || 0,
        fecha: corte.fecha,
        creadoEn: new Date().toISOString(),
      });
    }
  }
  // Programa en lote una o varias referencias puntuales (no el pedido
  // completo) para el mismo día — items viene de ProgramacionCorteView, ya
  // agrupado por pedido+referencia con el desglose de tallas/cantidades que
  // se seleccionaron (puede ser menos que el pendiente total, por ejemplo si
  // no alcanza la tela para todas las tallas).
  async function programarCorte(items, fecha) {
    for (const it of items) {
      const nuevo = {
        id: uid(),
        pedidoId: it.pedidoId,
        numero: it.numero,
        cliente: it.cliente,
        ref: it.ref,
        refId: it.refId || "",
        descripcion: it.descripcion || "",
        cantidadPendiente: it.pendiente || 0,
        cantidadProgramada: it.cantidadProgramada || 0,
        tallas: it.tallas || {},
        fechaProgramada: fecha,
        creadoEn: new Date().toISOString(),
        estado: "pendiente",
        fechaCumplioISO: null,
      };
      await fsSave("corte_programacion", nuevo.id, nuevo);
    }
  }
  async function cancelarProgramacionCorte(id) {
    await fsDelete("corte_programacion", id);
  }
  // Parte un grupo YA programado (una referencia de un día, con sus N
  // colores) en varios cortes de una vez — ej. un lote de 576 en 2 cortes de
  // 288 cada uno. Reparte cada talla de cada color en partes iguales (igual
  // matemática que "Número de cortes a programar" en Programar), etiqueta
  // cada mitad con su propio numeroCorte ("Corte 1", "Corte 2"...) y crea
  // documentos nuevos independientes para cada una — así en Cronograma de
  // Corte y en Producción Corte aparecen de una vez como bloques separados
  // (288 + 288), cada uno listo para su propio mesón/cortador/horario en
  // Programación de Mesones, sin tener que ir color por color desmarcando
  // nada ahí. Los documentos originales (el bloque de 576 sin partir) se
  // borran, ya quedan reemplazados por los partidos.
  async function partirGrupoEnCortes(grupo, n) {
    if (!grupo || n < 2) return;
    const porCorte = Array.from({ length: n }, () => []);
    grupo.colores.forEach((color) => {
      const tallasPorCorte = Array.from({ length: n }, () => ({}));
      Object.entries(color.tallas || {}).forEach(([talla, cant]) => {
        const base = Math.floor(cant / n);
        const resto = cant % n;
        for (let i = 0; i < n; i++) {
          const parte = base + (i < resto ? 1 : 0);
          if (parte > 0) tallasPorCorte[i][talla] = parte;
        }
      });
      for (let i = 0; i < n; i++) {
        const cantidadProgramada = Object.values(tallasPorCorte[i]).reduce((s, v) => s + v, 0);
        if (cantidadProgramada <= 0) continue;
        porCorte[i].push({
          id: uid(),
          pedidoId: color.pedidoId,
          numero: color.numero,
          cliente: color.cliente,
          ref: color.ref,
          refId: color.refId || "",
          descripcion: color.descripcion || "",
          cantidadPendiente: color.cantidadPendiente || 0,
          cantidadProgramada,
          tallas: tallasPorCorte[i],
          fechaProgramada: color.fechaProgramada,
          creadoEn: new Date().toISOString(),
          estado: "pendiente",
          fechaCumplioISO: null,
          numeroCorte: `Corte ${i + 1}`,
        });
      }
    });
    for (const lista of porCorte) {
      for (const nuevo of lista) {
        await fsSave("corte_programacion", nuevo.id, nuevo);
      }
    }
    for (const color of grupo.colores) {
      await fsDelete("corte_programacion", color.id);
    }
  }
  // Reprogramar: cambia solo la fecha comprometida de un ítem ya programado,
  // por si hay un cambio de plan — no hace falta cancelar y volver a marcar.
  async function editarFechaProgramacion(id, fecha) {
    await fsSave("corte_programacion", id, { fechaProgramada: fecha });
  }
  // Editar la cantidad programada de un ítem ya creado — por ejemplo si
  // después de programarlo resulta que no alcanza la tela para todo.
  async function editarCantidadProgramacion(id, cantidad) {
    await fsSave("corte_programacion", id, { cantidadProgramada: cantidad });
  }
  // Editar un registro ya cumplido (cantidad y/o fecha) — para corregir un
  // error de digitación sin tener que borrar y volver a crear todo.
  async function editarCumplidoProgramacion(id, cambios) {
    await fsSave("corte_programacion", id, cambios);
  }
  // Guarda el registro simple del lote generado al terminar un corte — el id
  // del doc ES el número de lote, así que si ya existe, sobreescribiría el
  // mismo registro (por eso ProgramarCorteModal valida unicidad antes contra
  // lotesExistentes, no se debe llamar esta función con un número repetido).
  async function guardarLoteCorte(lote) {
    await fsSave("corte_lotes", lote.numero, lote);
  }
  // Guarda los datos de "Programación Hecha" (planta, mesón, cortador, tela,
  // trazo, capas...) sobre el ítem ya programado — todavía no es un corte
  // real, solo dice que ya se sabe con qué se va a cortar y reserva espacio
  // en el mesón. El corte real (unidades, lote) se registra después en
  // "Entrada de Corte".
  async function guardarProgramacionHecha(id, datos) {
    await fsSave("corte_programacion", id, { ...datos, etapa: "programacion_hecha" });
  }
  // Aprobación del analista sobre la Programación de Mesones (etapa 2 ya
  // ingresada por el cortador) — no toca ningún otro dato, solo marca
  // aprobado + quién + cuándo. `ids` son los docs de TODOS los colores del
  // grupo (comparten los mismos datos teóricos, así que se aprueban juntos).
  async function aprobarProgramacionHecha(ids, aprobadoPor) {
    const fecha = new Date().toISOString();
    await Promise.all(ids.map((id) => fsSave("corte_programacion", id, { aprobado: true, aprobadoPor: aprobadoPor || null, aprobadoFechaISO: fecha })));
  }
  // El patronista asigna el número de lote en "Cortes Aprobados" DESPUÉS de
  // cortar (una vez ya se ve lo que realmente se cortó), para registrarlo
  // también en Busint como "Al Cortar". El corte real vive dentro de
  // `cortesRealizados` de cada pedido — no se puede actualizar un solo
  // elemento del arreglo directo en Firestore, así que se reconstruye el
  // arreglo completo con ese corte puntual actualizado. También se guarda
  // un registro simple en corte_lotes (igual que antes) para llevar control
  // de que el número nunca se repita y para las estadísticas por lote.
  async function confirmarLoteCorteReal(pedidoId, corteId, lote) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const corte = (pedido.cortesRealizados || []).find((c) => c.id === corteId);
    if (!corte) return;
    const actualizado = pedido.cortesRealizados.map((c) => (c.id === corteId ? { ...c, lote } : c));
    await fsSave("pedidos_activos", pedidoId, { cortesRealizados: actualizado });
    await guardarLoteCorte({
      numero: lote,
      pedidoId,
      numeroPedido: pedido.numero,
      cliente: pedido.cliente,
      cantidad: corte.totalUnidades || 0,
      fecha: corte.fecha,
      creadoEn: new Date().toISOString(),
    });
  }
  // Quita UNA referencia (todos sus colores) de un corte real ya registrado
  // pero que todavía no tiene lote — por ejemplo cuando por error se
  // mezclaron 2 referencias distintas en un mismo registro de Entrada de
  // Corte. Como "pendiente por cortar" se calcula siempre restando
  // cortesRealizados contra pedido.referencias (ver `pendiente`/`excedente`
  // más arriba), con solo sacar esos colores de `refs` la referencia vuelve
  // sola a quedar pendiente, sin tocar nada más. Si al quitarla no queda
  // ninguna referencia en el registro, se borra el registro completo (un
  // corte sin referencias no tiene sentido).
  async function quitarRefDeCorteReal(pedidoId, corteId, refCode) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const corte = (pedido.cortesRealizados || []).find((c) => c.id === corteId);
    if (!corte) return;
    const refsRestantes = (corte.refs || []).filter((r) => r.ref !== refCode);
    let cortesActualizados;
    if (!refsRestantes.length) {
      cortesActualizados = pedido.cortesRealizados.filter((c) => c.id !== corteId);
    } else {
      const totalUnidades = refsRestantes.reduce((s, r) => s + (r.total || 0), 0);
      cortesActualizados = pedido.cortesRealizados.map((c) =>
        c.id === corteId ? { ...c, refs: refsRestantes, totalUnidades } : c
      );
    }
    const totalPedido = pedido.referencias.reduce((s, r) => s + r.total, 0);
    const totalC = cortesActualizados.reduce((s, c) => s + (c.totalUnidades || 0), 0);
    const patch = { cortesRealizados: cortesActualizados };
    if (pedido.estado === "terminado" && totalC < totalPedido) {
      patch.estado = "activo";
      patch.fechaCumplido = null;
    }
    await fsSave("pedidos_activos", pedidoId, patch);
  }
  // Devuelve un corte real completo (todas sus referencias/materiales) de
  // "Cortes Aprobados" de vuelta a "Ingreso de Corte Real" — para cuando el
  // registro está mal desde la base (planta/mesón/materiales equivocados,
  // etc.) y es más fácil volver a hacerlo entero que ir corrigiendo campo
  // por campo. A diferencia de `quitarRefDeCorteReal` (que solo saca UNA
  // referencia), esto borra el corte completo sin importar cuántas
  // referencias tenga — como "pendiente por cortar" se calcula restando
  // cortesRealizados contra pedido.referencias, al borrarlo todo vuelve a
  // quedar pendiente y disponible para registrarse de nuevo. Solo aplica a
  // cortes SIN lote (Cortes Aprobados) — uno con lote ya asignado hay que
  // manejarlo aparte porque el lote quedó registrado también en
  // `corte_lotes`.
  async function devolverCorteAIngreso(pedidoId, corteId) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const corte = (pedido.cortesRealizados || []).find((c) => c.id === corteId);
    if (!corte || corte.lote) return;
    const cortesActualizados = pedido.cortesRealizados.filter((c) => c.id !== corteId);
    const totalPedido = pedido.referencias.reduce((s, r) => s + r.total, 0);
    const totalC = cortesActualizados.reduce((s, c) => s + (c.totalUnidades || 0), 0);
    const patch = { cortesRealizados: cortesActualizados };
    if ((pedido.estado === "terminado" || pedido.estado === "cerrado") && totalC < totalPedido) {
      patch.estado = "activo";
      patch.motivoCierre = null;
      patch.fechaCumplido = null;
    }
    await fsSave("pedidos_activos", pedidoId, patch);
  }
  // Corrige a mano las cantidades por talla de un corte real ya registrado en
  // "Cortes Aprobados" (todavía sin lote) — por si el patronista se equivocó
  // digitando al registrar el corte real en Entrada de Corte. Solo admin
  // (ver ProgramacionCorteView). Igual que quitarRefDeCorteReal, reconstruye
  // el arreglo completo de cortesRealizados con ese corte puntual actualizado
  // — como todo lo demás (Históricos, Cortadores, Estadísticas, Centro de
  // Costo) lee directo de cortesRealizados, la corrección queda reflejada
  // automáticamente en todos lados, no hay que tocar nada más.
  async function editarCantidadesCorteReal(pedidoId, corteId, refsEditados, cortadorNuevo) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const corte = (pedido.cortesRealizados || []).find((c) => c.id === corteId);
    if (!corte) return;
    const totalUnidades = refsEditados.reduce((s, r) => s + (r.total || 0), 0);
    // El cortador es opcional de corregir — si no se tocó el desplegable
    // (undefined) se deja el que ya tenía; si se dejó en blanco a propósito
    // queda sin asignar.
    const cortesActualizados = pedido.cortesRealizados.map((c) =>
      c.id === corteId ? { ...c, refs: refsEditados, totalUnidades, cortador: cortadorNuevo !== undefined ? cortadorNuevo : c.cortador } : c
    );
    const totalPedido = pedido.referencias.reduce((s, r) => s + r.total, 0);
    const totalC = cortesActualizados.reduce((s, c) => s + (c.totalUnidades || 0), 0);
    const patch = { cortesRealizados: cortesActualizados };
    // Si al corregir cantidades (por ejemplo, quitando lo que se había
    // agregado de más) el pedido queda de nuevo con algo pendiente, que
    // vuelva a la cola normal de Corte — sin importar si estaba "terminado"
    // (lo cerró la app sola) o "cerrado" (lo cerró la sincronización con
    // Busint/Planeación en Vigentes).
    if ((pedido.estado === "terminado" || pedido.estado === "cerrado") && totalC < totalPedido) {
      patch.estado = "activo";
      patch.motivoCierre = null;
      patch.fechaCumplido = null;
    }
    await fsSave("pedidos_activos", pedidoId, patch);
  }
  // Completa el horario real de CORTE (hora inicio/fin) una vez ya se
  // terminó de cortar — se separó a propósito del horario de Tendido: en
  // "Ingreso de Corte Real" solo se sabe cuándo terminó el tendido, el
  // tiempo real de corte se sabe después y se completa acá, junto con el
  // lote (en "Cortes Aprobados" o, si el corte ya tiene lote, en
  // "Históricos"). No requiere admin — es dato operativo normal, igual que
  // el resto de lo que se llena en Ingreso de Corte Real.
  async function actualizarHorarioCorte(pedidoId, corteId, horaInicio, horaFin) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const corte = (pedido.cortesRealizados || []).find((c) => c.id === corteId);
    if (!corte) return;
    let minutos = 0;
    if (horaInicio && horaFin) {
      const [h1, m1] = horaInicio.split(":").map(Number);
      const [h2, m2] = horaFin.split(":").map(Number);
      minutos = h2 * 60 + m2 - (h1 * 60 + m1);
    }
    const cortesActualizados = pedido.cortesRealizados.map((c) =>
      c.id === corteId ? { ...c, horaInicio, horaFin, minutos } : c
    );
    await fsSave("pedidos_activos", pedidoId, { cortesRealizados: cortesActualizados });
  }
  // Corrige el mesón de un corte real ya registrado (Cortes Aprobados o
  // Históricos) — hace falta cuando quedó mal asignado, o cuando apunta a un
  // mesón que ya no existe en la configuración de la planta (se ve como un
  // id crudo, ej. "1cjycti", en vez de un nombre). `nuevoMeson` es el id del
  // mesón elegido en el desplegable, o null para dejarlo sin asignar.
  async function editarMesonCorte(pedidoId, corteId, nuevoMeson) {
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    const corte = (pedido.cortesRealizados || []).find((c) => c.id === corteId);
    if (!corte) return;
    const mesonAnterior = corte.meson || "";
    const cortesActualizados = pedido.cortesRealizados.map((c) =>
      c.id === corteId ? { ...c, meson: nuevoMeson || null } : c
    );
    await fsSave("pedidos_activos", pedidoId, { cortesRealizados: cortesActualizados });
    // "Disponibilidad de Mesones" NO lee cortesRealizados — lee directo los
    // docs de corte_programacion (lo que se programó en Programación de
    // Mesones), que son un registro aparte y no se tocan solos al corregir
    // el mesón acá. Si no se actualizan también esos docs, la disponibilidad
    // sigue mostrando ocupado el mesón viejo (y libre el nuevo) aunque el
    // corte real ya diga otra cosa — se buscan por pedido+fecha+planta+
    // mesón anterior+referencia para no tocar otro corte que por casualidad
    // haya usado el mismo mesón ese día.
    if (mesonAnterior && mesonAnterior !== (nuevoMeson || "")) {
      const refsDelCorte = new Set((corte.refs || []).map((r) => r.ref));
      const coincidencias = (programacionCorte || []).filter(
        (pr) =>
          pr.pedidoId === pedidoId &&
          pr.fechaProgramada === corte.fecha &&
          pr.planta === corte.planta &&
          pr.meson === mesonAnterior &&
          refsDelCorte.has(pr.ref)
      );
      await Promise.all(coincidencias.map((pr) => fsSave("corte_programacion", pr.id, { meson: nuevoMeson || null })));
    }
  }
  // Reinicio completo de pruebas (temporal, solo admin) — borra TODA la
  // colección corte_lotes, TODA corte_programacion (Programación de
  // Mesones), y vacía cortesRealizados de cada pedido activo (revirtiendo a
  // "activo" el que haya quedado "terminado" solo por eso). Irreversible —
  // AdminCorte pide doble confirmación antes de llamar esto.
  async function reiniciarTodosLosCortes() {
    const [lotesSnap, progSnap] = await Promise.all([
      getDocs(collection(db, "corte_lotes")),
      getDocs(collection(db, "corte_programacion")),
    ]);
    await Promise.all(lotesSnap.docs.map((d) => deleteDoc(d.ref)));
    await Promise.all(progSnap.docs.map((d) => deleteDoc(d.ref)));
    await Promise.all(
      pedidos
        .filter((p) => (p.cortesRealizados || []).length > 0)
        .map((p) =>
          fsSave("pedidos_activos", p.id, {
            cortesRealizados: [],
            estado: p.estado === "terminado" ? "activo" : p.estado,
            fechaCumplido: null,
          })
        )
    );
  }
  // Revisión automática de cumplimiento: cada vez que cambian los pedidos o
  // las fuentes que definen "pendiente" (Ventas Perdidas, Planeación), se
  // recalcula el pendiente de la referencia puntual de cada ítem programado
  // — si ya llegó a 0, se marca cumplido con la fecha del corte más reciente
  // que incluyó esa referencia.
  useEffect(() => {
    const pendientesActivas = programacionCorte.filter((pr) => pr.estado !== "cumplido");
    if (!pendientesActivas.length) return;
    pendientesActivas.forEach(async (pr) => {
      const pedido = pedidos.find((p) => p.id === pr.pedidoId);
      if (!pedido) return;
      const { porRef } = calcularCortadoPendiente(pedido, vpRefMap, lotesCortadoMap);
      // Se busca por refId (identifica el color/pinta exacto) — con
      // respaldo por `ref` solo para programaciones viejas creadas antes de
      // guardar refId, que podrían no tenerlo.
      const refInfo = pr.refId ? porRef.find((r) => r.refId === pr.refId) : porRef.find((r) => r.ref === pr.ref);
      const pendienteActual = refInfo ? refInfo.pendiente : 0;
      if (pendienteActual === 0) {
        const cortesConRef = (pedido.cortesRealizados || []).filter((c) =>
          (c.refs || []).some((cr) => (pr.refId ? cr.refId === pr.refId : cr.ref === pr.ref))
        );
        const ultimoCorte = [...cortesConRef].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0];
        await fsSave("corte_programacion", pr.id, { ...pr, estado: "cumplido", fechaCumplioISO: ultimoCorte?.fecha || today() });
      }
    });
  }, [pedidos, programacionCorte, ventasPerdidasCargas, planeacionCargas]);
  async function saveConfig(cfg) {
    setCorteConfig(cfg);
    await fsSave("corte_config", "main", cfg);
  }
  const selPedido = pedidos.find((p) => p.id === selPedidoId);
  const isAdmin = currentUser?.isAdmin;
  // "Equipo Interno" puede hacer las mismas correcciones de corte que el
  // administrador (Editar cantidades, Cortador, Agregar color faltante,
  // Registrar Manual, editar/eliminar cumplidos) — pedido explícito del
  // usuario. OJO: esto NO incluye "Admin Corte" (Reiniciar Cortes borra
  // TODO el historial de forma irreversible) — esa sección se queda
  // exclusiva del administrador real (isAdmin), ver más abajo donde se
  // decide el NAV y el render de view==="admin".
  const puedeEditarCorte = isAdmin || currentUser?.role === "Equipo Interno";
  const NAV = [
    { id: "dashboard", icon: "◉", label: "Dashboard" },
    { id: "cola", icon: "📋", label: "Cola Sugerida" },
    { id: "historico", icon: "📁", label: "Histórico" },
    { id: "estadisticas", icon: "📊", label: "Tendido y Corte" },
    { id: "programacion", icon: "📅", label: "Programación" },
    { id: "costo", icon: "💰", label: "Centro de Costo" },
    ...(isAdmin ? [{ id: "admin", icon: "⚙", label: "Admin Corte" }] : []),
  ];
  if (loading)
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.canvas,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✂</div>
          <div style={{ color: C.slate }}>Cargando módulo de corte...</div>
        </div>
      </div>
    );
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.canvas,
        fontFamily: "'Inter',-apple-system,sans-serif",
        display: "flex",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      {/* Sidebar */}
      <div
        style={{
          width: 215,
          background: C.ink,
          padding: "24px 14px",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.white }}>
            ✂ Corte
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.seam,
              marginTop: 2,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Planeación · Yanko
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "#2A2A45",
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: `linear-gradient(135deg,${C.seam},${C.seamDk})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
              color: C.ink,
            }}
          >
            {(currentUser?.name || "P")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.white,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {currentUser?.name}
            </div>
            <div style={{ fontSize: 10, color: C.seam }}>Planeador</div>
          </div>
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            style={{
              background: "none",
              border: "none",
              color: "rgba(200,184,162,0.5)",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ⏏
          </button>
        </div>
        <nav
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}
        >
          {NAV.map((item) => {
            const active =
              view === item.id ||
              (view === "detalle" && item.id === "dashboard");
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setSelPedidoId(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 12px",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: active ? C.seam : "transparent",
                  color: active ? C.ink : "#8888AA",
                  fontWeight: active ? 800 : 500,
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
          {onVolver && (
            <button
              onClick={onVolver}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 12px",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                background: "transparent",
                color: "rgba(200,184,162,0.5)",
                fontWeight: 500,
                fontSize: 12,
                textAlign: "left",
                marginTop: 8,
              }}
            >
              ← Volver a Diseño
            </button>
          )}
        </nav>
      </div>
      {/* Main */}
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {view === "dashboard" && !selPedidoId && (
            <DashboardCorte
              pedidos={pedidos}
              onSelectPedido={(id) => {
                setSelPedidoId(id);
                setView("detalle");
              }}
              nominaConfig={corteConfig.nomina}
              onUpdatePedido={savePedido}
              isAdmin={currentUser?.isAdmin}
              vpRefMap={vpRefMap}
              lotesCortadoMap={lotesCortadoMap}
            />
          )}
          {view === "detalle" && selPedido && (
            <DetallePedido
              pedido={selPedido}
              plantas={corteConfig.plantas || []}
              cortadores={cortadoresUnificados}
              telas={corteConfig.telas || []}
              nominaConfig={corteConfig.nomina}
              preciosMap={preciosMap}
              lotesExistentes={lotesExistentes}
              onGuardarLote={guardarLoteCorte}
              vpRefMap={vpRefMap}
              lotesCortadoMap={lotesCortadoMap}
              preseleccion={preseleccionCorte && preseleccionCorte.pedidoId === selPedido.id ? preseleccionCorte : null}
              onConsumirPreseleccion={() => setPreseleccionCorte(null)}
              onBack={() => {
                setView("dashboard");
                setSelPedidoId(null);
                setPreseleccionCorte(null);
              }}
              onSave={savePedido}
              onCorteRegistrado={() => {
                setNavProduccion({ subTab: "produccion", produccionSubTab: "aprobados", ts: Date.now() });
                setView("programacion");
                setSelPedidoId(null);
                setPreseleccionCorte(null);
              }}
            />
          )}
          {view === "cola" && (
            <ColaSugerida
              pedidos={pedidos}
              vpRefMap={vpRefMap}
              lotesCortadoMap={lotesCortadoMap}
              onSelectPedido={(id) => {
                setSelPedidoId(id);
                setView("detalle");
              }}
            />
          )}
          {view === "historico" && (
            <Historico
              pedidos={pedidos}
              onSelectPedido={(id) => {
                setSelPedidoId(id);
                setView("detalle");
              }}
            />
          )}
          {view === "estadisticas" && <EstadisticasTela pedidos={pedidos} />}
          {view === "programacion" && (
            <ProgramacionCorteView
              pedidos={pedidos}
              vpRefMap={vpRefMap}
              lotesCortadoMap={lotesCortadoMap}
              preciosMap={preciosMap}
              trabajadores={corteConfig.nomina?.trabajadores || []}
              programacion={programacionCorte}
              onProgramar={programarCorte}
              onCancelar={cancelarProgramacionCorte}
              onPartirCorte={partirGrupoEnCortes}
              onEditarFecha={editarFechaProgramacion}
              onEditarCantidad={editarCantidadProgramacion}
              onEditarCumplido={editarCumplidoProgramacion}
              onEliminarCumplido={cancelarProgramacionCorte}
              onSelectPedido={(id) => {
                setSelPedidoId(id);
                setView("detalle");
              }}
              onRegistrarCorteReal={registrarCorteReal}
              onRegistrarCorteManual={registrarCorteManualHistorico}
              plantasConfig={corteConfig.plantas || []}
              cortadoresConfig={cortadoresUnificados}
              telas={corteConfig.telas || []}
              estadisticasTela={estadisticasTela}
              metrosUsadosMeson={metrosUsadosMeson}
              itemsUsadosMeson={itemsUsadosMeson}
              onGuardarProgramacionHecha={guardarProgramacionHecha}
              onAprobarProgramacionHecha={aprobarProgramacionHecha}
              puedeAprobarCorte={puedeAprobarCorte || isAdmin}
              usuarioActual={currentUser?.name || currentUser?.username || ""}
              lotesExistentes={lotesExistentes}
              onAsignarLoteReal={confirmarLoteCorteReal}
              onQuitarRefDeCorte={quitarRefDeCorteReal}
              onDevolverCorteReal={devolverCorteAIngreso}
              onEditarCantidadesCorte={editarCantidadesCorteReal}
              onActualizarHorarioCorte={actualizarHorarioCorte}
              onEditarMesonCorte={editarMesonCorte}
              subTabInicial={navProduccion?.subTab}
              produccionSubTabInicial={navProduccion?.produccionSubTab}
              navProduccionTs={navProduccion?.ts}
              isAdmin={puedeEditarCorte}
            />
          )}
          {view === "costo" && (
            <CentroCosto pedidos={pedidos} trabajadores={corteConfig.nomina?.trabajadores || []} />
          )}
          {view === "admin" && isAdmin && (
            <AdminCorte config={corteConfig} onSave={saveConfig} onReiniciarCortes={reiniciarTodosLosCortes} currentUser={currentUser} ultimaCargaPrecios={ultimaCargaPrecios} />
          )}
        </div>
      </div>
    </div>
  );
}