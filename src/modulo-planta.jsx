import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { cargaEntradasActivaDe } from "./entradas-planta-util";
import { SelectorMotivo, pedirMotivoIncumplimiento, registrarIncumplimiento } from "./motivos-incumplimiento";
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
function fmtFechaISO(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtFechaHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const fecha = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fecha} ${hora}`;
}
function esFechaValida(d) {
  return d instanceof Date && !isNaN(d.getTime());
}
function dateToISO(d) {
  if (!esFechaValida(d)) return null;
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// Días entre hoy y una fecha ISO (YYYY-MM-DD) — negativo si la fecha ya pasó.
function diasEntre(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - hoy) / 86400000);
}
// Días transcurridos entre dos fechas ISO (usado para "días que tomó" en el
// historial de cumplidos: fechaCumplioISO - fechaEnviado).
function diasTranscurridos(fechaInicioISO, fechaFinISO) {
  if (!fechaInicioISO || !fechaFinISO) return null;
  const [y1, m1, d1] = fechaInicioISO.split("-").map(Number);
  const [y2, m2, d2] = fechaFinISO.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}
function estadoDe(dias) {
  if (dias === null || dias === undefined) return "";
  if (dias < 0) return "VENCIDO";
  if (dias <= 2) return "URGENTE";
  return "EN TIEMPO";
}
// ─── PRIORIDAD AL PROGRAMAR (2026-10-21, a pedido de Fredy) ──────────────────
// Para cada lote que está en Planta Yanko sin programar, dice qué tan prioritario es y POR QUÉ:
//   ALTA   = el pedido está vencido o entrega en 7 días o menos, o el pedido está casi completo
//            (tiene 3+ lotes, al menos uno ya salió a Semiterminado/BPT y faltan 1 o 2).
//   MEDIA  = el pedido entrega en 8 a 21 días, o va avanzado (la mitad o más de sus lotes ya salió).
//   NORMAL = el resto.
// "Listo" = el lote del pedido ya está en BPT o Semiterminado en la carga activa. La Hoja1 solo trae
// lotes con inventario, así que un lote ya despachado del todo puede no contarse.
// Fecha sugerida: ALTA = hoy; el resto, 7 días antes de la entrega del pedido (nunca antes de hoy).
function sumarDiasISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return dateToISO(new Date(y, m - 1, d + n));
}
function estadisticasPedidos(lotes) {
  const mapa = new Map();
  (lotes || []).forEach((l) => {
    if (l.numPedido === undefined || l.numPedido === null || l.numPedido === "") return;
    const k = String(l.numPedido);
    const e = mapa.get(k) || { total: 0, listos: 0 };
    e.total += 1;
    if (l.ubicacionActual === "BPT" || l.ubicacionActual === "Semiterminado") e.listos += 1;
    mapa.set(k, e);
  });
  return mapa;
}
function prioridadDeLote(l, statsPedido) {
  const dias = diasEntre(l.fechaEntregaPedidoISO);
  const st = statsPedido.get(String(l.numPedido));
  const razones = [];
  let nivel = "normal";
  if (dias !== null) {
    if (dias < 0) { razones.push(`Pedido vencido hace ${-dias} día${-dias === 1 ? "" : "s"}`); nivel = "alta"; }
    else if (dias === 0) { razones.push("El pedido entrega hoy"); nivel = "alta"; }
    else if (dias <= 7) { razones.push(`El pedido entrega en ${dias} día${dias === 1 ? "" : "s"}`); nivel = "alta"; }
    else if (dias <= 21) { razones.push(`El pedido entrega en ${dias} días`); nivel = "media"; }
  }
  if (st && st.total >= 3 && st.listos >= 1) {
    const faltan = st.total - st.listos;
    if (faltan <= 2) { razones.push(`Faltan ${faltan} de ${st.total} lotes del pedido`); nivel = "alta"; }
    else if (st.listos / st.total >= 0.5) { razones.push(`Pedido avanzado: ${st.listos} de ${st.total} lotes ya salieron`); if (nivel === "normal") nivel = "media"; }
  }
  if (!razones.length) razones.push(dias === null ? "Pedido sin fecha de entrega" : `El pedido entrega en ${dias} días`);
  const hoy = dateToISO(new Date());
  let fechaSugerida = hoy;
  if (nivel !== "alta" && l.fechaEntregaPedidoISO) {
    const previa = sumarDiasISO(l.fechaEntregaPedidoISO, -7);
    fechaSugerida = previa > hoy ? previa : hoy;
  }
  return { prioridad: nivel, razones, razonesTxt: razones.join(" · "), diasPedido: dias, fechaSugerida };
}
const NIVELES_PRIO = {
  alta: { txt: "ALTA", color: "#E85D4A", bg: "#FDF0EE", orden: 0 },
  media: { txt: "MEDIA", color: "#C47C1A", bg: "#FDF5E6", orden: 1 },
  normal: { txt: "NORMAL", color: "#2D9E6B", bg: "#EBF7F2", orden: 2 },
};
// Nombre exacto de la planta propia dentro de Hoja1 (mismo valor usado en
// Planeación para el reporte "Programación Yanko").
const PLANTA_YANKO = "INDUSTRIAS YANKO MODULO CENTRO";
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
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.slate, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
function FInput({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
    />
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
// ─── PROGRAMAR LOTE ─────────────────────────────────────────────────────────────
// Compromiso de entrega: se elige la fecha para la que Planta Industrias
// Yanko se compromete a sacar el lote (por defecto hoy, editable a futuro).
// El cumplimiento se revisa solo — no hay botón manual de "Entregado": cuando
// se sube una carga nueva de Hoja1 y el lote ya no aparece en Planta Yanko,
// queda marcado como cumplido automáticamente.
function ProgramarLoteModal({ lote, onConfirm, onClose }) {
  const [fecha, setFecha] = useState(lote.fechaSugerida || today());
  function confirmar() {
    if (!fecha) return;
    onConfirm(lote, fecha);
    onClose();
  }
  return (
    <Modal title={`Programar lote ${lote.numLote}`} onClose={onClose} width={440}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 14px", background: C.amberBg, borderRadius: 8, marginBottom: 18, fontSize: 12, color: C.amber }}>
        <div>
          <div style={{ fontWeight: 700 }}>Referencia</div>
          <div>{lote.referencia}</div>
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>Cantidad en planta</div>
          <div>{fmtNum(lote.invPlanta)}</div>
        </div>
      </div>
      {lote.prioridad && (
        <div style={{ padding: "10px 14px", background: NIVELES_PRIO[lote.prioridad].bg, borderRadius: 8, marginBottom: 14, fontSize: 12, color: NIVELES_PRIO[lote.prioridad].color, fontWeight: 700 }}>
          Prioridad {NIVELES_PRIO[lote.prioridad].txt}: {lote.razonesTxt}
          {lote.fechaSugerida ? <div style={{ fontWeight: 500, marginTop: 4 }}>Fecha sugerida: {fmtFechaISO(lote.fechaSugerida)} (puedes cambiarla).</div> : null}
        </div>
      )}
      <Field label="Fecha comprometida de entrega">
        <FInput type="date" value={fecha} onChange={setFecha} />
      </Field>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, lineHeight: 1.5 }}>
        Cuando subas la próxima Hoja1 en Planeación, si este lote ya no aparece en Planta Industrias Yanko, se marcará como cumplido automáticamente.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="danger" onClick={confirmar} disabled={!fecha}>Programar</Btn>
      </div>
    </Modal>
  );
}
function EditarFechaModal({ fila, onConfirm, onClose }) {
  const [fecha, setFecha] = useState(fila.fechaEnviado || today());
  const [motivo, setMotivo] = useState("");
  const cambia = fecha !== fila.fechaEnviado;
  const sinAvisar = fila.avisado === false; // todavía no se mandó correo de este lote: se mueve sin motivo
  const puede = !!fecha && (!cambia || sinAvisar || motivo.trim().length >= 3);
  function confirmar() {
    if (!puede) return;
    onConfirm(fila.id, fecha, motivo.trim());
    onClose();
  }
  return (
    <Modal title={`Editar fecha — Lote ${fila.numLote}`} onClose={onClose} width={440}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 14px", background: C.amberBg, borderRadius: 8, marginBottom: 18, fontSize: 12, color: C.amber }}>
        <div>
          <div style={{ fontWeight: 700 }}>Referencia</div>
          <div>{fila.referencia}</div>
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>Cantidad</div>
          <div>{fmtNum(fila.cantidad)}</div>
        </div>
      </div>
      <Field label="Nueva fecha comprometida de entrega">
        <FInput type="date" value={fecha} onChange={setFecha} />
      </Field>
      {cambia && !sinAvisar && (
        <Field label="Motivo del cambio (va en el correo)">
          <SelectorMotivo area="planta" onChange={setMotivo} />
        </Field>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="danger" onClick={confirmar} disabled={!puede}>{sinAvisar ? "Guardar" : "Guardar y avisar"}</Btn>
      </div>
    </Modal>
  );
}
// ─── TABLERO SEMANAL (programación visible, 2026-10-28, a pedido de Fredy) ────────────────────────
// Una columna por día con sus lotes (tarjetas con prioridad), total de unidades por día y un tope opcional por día
// (config/planta_programacion { topeDia }). A la izquierda, los lotes de Planta Yanko sin programar: se tocan uno o varios
// y se mandan a un día con "Programar aquí" (un solo correo por acción). Un lote ya programado se mueve de día con ✎
// (pide motivo y avisa por correo). Lo vencido sin cumplir sale en su propia columna roja.
function sumarDiasISOPl(iso, n) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function lunesDeISOPl(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return sumarDiasISOPl(iso, -dow);
}
const NOMBRES_DIA_PL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Pedidos por programar: la prioridad del pedido es la más alta de sus lotes; primero lo más urgente.
function agruparPedidosPlanta(lotes) {
  const mapa = new Map();
  lotes.forEach((l) => {
    const k = l.numPedido == null || l.numPedido === "" ? "" : String(l.numPedido);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  });
  return [...mapa.entries()].map(([pedido, ls]) => {
    const prio = ls.reduce((m, l) => (NIVELES_PRIO[l.prioridad] && (!m || NIVELES_PRIO[l.prioridad].orden < NIVELES_PRIO[m].orden) ? l.prioridad : m), null);
    const sugeridas = ls.map((l) => l.fechaSugerida).filter(Boolean).sort();
    const dEntrega = Math.min(...ls.map((l) => (l.diasPedido ?? 9999)));
    return { clave: pedido || "sin-pedido", pedido, lotes: ls, prio, sugerida: sugeridas[0] || "", dEntrega: dEntrega === 9999 ? null : dEntrega, und: ls.reduce((s, l) => s + (Number(l.invPlanta) || 0), 0) };
  }).sort((a, b) => (NIVELES_PRIO[a.prio]?.orden ?? 9) - (NIVELES_PRIO[b.prio]?.orden ?? 9) || (a.sugerida || "9999").localeCompare(b.sugerida || "9999") || String(a.pedido).localeCompare(String(b.pedido)));
}
// Día propuesto: la fecha sugerida del pedido, ajustada a los días que se pueden programar esta semana.
function diaSugeridoPl(sugerida, diasProg) {
  if (!diasProg.length) return "";
  if (!sugerida || sugerida <= diasProg[0].iso) return diasProg[0].iso;
  const exacto = diasProg.find((d) => d.iso === sugerida);
  if (exacto) return exacto.iso;
  const antes = [...diasProg].reverse().find((d) => d.iso < sugerida);
  return (antes || diasProg[0]).iso;
}
// Panel "Programar lotes": se toman todos (o los que se quiera), cada pedido trae su día propuesto y se guarda de una vez.
function ProgramarLotesModal({ pedidos, diasProg, programacion, tope, hoyISO, onGuardar, onClose }) {
  const [filtro, setFiltro] = useState("todas");
  const [elegidos, setElegidos] = useState(() => Object.fromEntries(pedidos.map((g) => [g.clave, true])));
  const [diaDe, setDiaDe] = useState(() => Object.fromEntries(pedidos.map((g) => [g.clave, diaSugeridoPl(g.sugerida, diasProg)])));
  const [verTodos, setVerTodos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fmtCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const nombreDia = (d) => (d.iso === hoyISO ? "Hoy" : d.nombre.slice(0, 3));
  const visibles = pedidos.filter((g) => filtro === "todas" || g.prio === filtro);
  const mostrados = verTodos ? visibles : visibles.slice(0, 10);
  const marcados = pedidos.filter((g) => elegidos[g.clave] && diaDe[g.clave]);
  const nLotes = marcados.reduce((s, g) => s + g.lotes.length, 0);
  const nUnd = marcados.reduce((s, g) => s + g.und, 0);
  const todosVisibles = visibles.length > 0 && visibles.every((g) => elegidos[g.clave]);
  const carga = Object.fromEntries(diasProg.map((d) => [d.iso, programacion.filter((p) => p.fechaEnviado === d.iso).reduce((s, p) => s + (Number(p.cantidad) || 0), 0)]));
  marcados.forEach((g) => { carga[diaDe[g.clave]] = (carga[diaDe[g.clave]] || 0) + g.und; });
  const nuevoPorDia = {};
  marcados.forEach((g) => { nuevoPorDia[diaDe[g.clave]] = (nuevoPorDia[diaDe[g.clave]] || 0) + g.und; });
  const diasPasados = tope > 0 ? diasProg.filter((d) => (carga[d.iso] || 0) > tope && nuevoPorDia[d.iso]) : [];
  const btn = { border: "1px solid #D6D2C8", background: "#fff", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", color: C.ink, fontFamily: "inherit" };
  const caja = (on) => <span style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${on ? C.blue : "#B8B4AA"}`, background: on ? C.blue : "#fff", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flex: "none" }}>{on ? "✓" : ""}</span>;
  function tomarTodos() {
    setElegidos((e) => { const n = { ...e }; visibles.forEach((g) => { n[g.clave] = !todosVisibles; }); return n; });
  }
  function mismoDia(iso) {
    setDiaDe((d) => { const n = { ...d }; visibles.forEach((g) => { n[g.clave] = iso; }); return n; });
    setElegidos((e) => { const n = { ...e }; visibles.forEach((g) => { n[g.clave] = true; }); return n; });
  }
  async function guardar() {
    if (!marcados.length || guardando) return;
    setGuardando(true);
    try {
      const porDia = {};
      marcados.forEach((g) => { (porDia[diaDe[g.clave]] = porDia[diaDe[g.clave]] || []).push(...g.lotes); });
      await onGuardar(Object.entries(porDia).map(([iso, lotes]) => ({ iso, lotes })));
    } finally {
      setGuardando(false);
    }
  }
  const resumenDias = diasProg.filter((d) => nuevoPorDia[d.iso]).map((d) => `${nombreDia(d)} ${fmtNum(nuevoPorDia[d.iso])} und`).join(" · ");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "min(1100px,100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(16,24,40,0.3)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: C.ink }}>Programar lotes de Planta Yanko</div>
              <div style={{ fontSize: 13.5, color: C.slate, marginTop: 3 }}>Elige qué pedidos programar y para qué día. Ya te propuse el día según prioridad y entrega.</div>
            </div>
            <button style={btn} onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={tomarTodos} style={{ ...btn, background: C.ink, color: "#fff", borderColor: C.ink, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: todosVisibles ? "#fff" : "transparent", border: "2px solid #fff", color: C.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{todosVisibles ? "✓" : ""}</span>
              Tomar todos ({visibles.reduce((s, g) => s + g.lotes.length, 0)} lotes · {fmtNum(visibles.reduce((s, g) => s + g.und, 0))} und)
            </button>
            {diasProg.length > 0 && <span style={{ fontSize: 13, color: C.slate }}>Mismo día para todos:</span>}
            {diasProg.map((d) => <button key={d.iso} style={{ ...btn, padding: "7px 12px" }} onClick={() => mismoDia(d.iso)}>{nombreDia(d)}</button>)}
            <span style={{ flex: 1 }} />
            {[["todas", "Todas"], ["alta", "Alta"], ["media", "Media"], ["normal", "Normal"]].map(([id, txt]) => (
              <span key={id} onClick={() => setFiltro(id)} style={{ cursor: "pointer", padding: "3px 11px", borderRadius: 20, fontSize: 11.5, fontWeight: 800, background: filtro === id ? C.ink : (NIVELES_PRIO[id]?.bg || "#fff"), color: filtro === id ? "#fff" : (NIVELES_PRIO[id]?.color || C.ink), border: `1px solid ${filtro === id ? C.ink : C.border}` }}>{txt}</span>
            ))}
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, borderTop: `1px solid ${C.border}` }}>
          {!diasProg.length && <div style={{ padding: 24, color: C.slate, fontSize: 14 }}>Esta semana ya pasó. Cierra el panel y ve a la semana siguiente con ›.</div>}
          {diasProg.length > 0 && mostrados.map((g) => {
            const on = !!elegidos[g.clave];
            const nivel = NIVELES_PRIO[g.prio];
            return (
              <div key={g.clave} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 24px", borderTop: `1px solid ${C.border}`, background: on ? "#F7FAFF" : "#fff", flexWrap: "wrap" }}>
                <span onClick={() => setElegidos((e) => ({ ...e, [g.clave]: !e[g.clave] }))} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10, width: 200 }}>
                  {caja(on)}
                  <span>
                    <b style={{ fontSize: 15, color: C.ink }}>{g.pedido ? `Pedido ${g.pedido}` : "Sin pedido"}</b>
                    <div style={{ fontSize: 12, color: C.slate }}>{g.dEntrega != null ? `Entrega en ${g.dEntrega} ${g.dEntrega === 1 ? "día" : "días"}` : "Sin fecha de entrega"}{g.sugerida ? ` · sugerida ${fmtCorta(g.sugerida)}` : ""}</div>
                  </span>
                </span>
                <span style={{ flex: "1 1 220px", minWidth: 180, fontSize: 13, color: C.slate }} title={g.lotes.map((l) => `${l.numLote} ${l.referencia || ""}`).join(" · ")}>
                  <span style={{ fontWeight: 700, color: C.ink }}>{g.lotes.length} {g.lotes.length === 1 ? "lote" : "lotes"}: </span>
                  {g.lotes.slice(0, 7).map((l) => l.numLote).join(" · ")}{g.lotes.length > 7 ? ` · +${g.lotes.length - 7}` : ""}
                </span>
                <span style={{ width: 96, fontSize: 14 }}><b>{fmtNum(g.und)}</b> <span style={{ color: C.slate }}>und</span></span>
                <span style={{ width: 70 }}>{nivel && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999, color: nivel.color, background: nivel.bg }}>{nivel.txt.charAt(0) + nivel.txt.slice(1).toLowerCase()}</span>}</span>
                <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
                  {diasProg.map((d) => {
                    const sel = on && diaDe[g.clave] === d.iso;
                    return (
                      <button key={d.iso} onClick={() => { setDiaDe((x) => ({ ...x, [g.clave]: d.iso })); setElegidos((e) => ({ ...e, [g.clave]: true })); }} title={`${d.nombre} ${fmtCorta(d.iso)}`} style={{ ...btn, width: 58, padding: "7px 0", textAlign: "center", background: sel ? C.blue : "#fff", color: sel ? "#fff" : C.ink, borderColor: sel ? C.blue : "#D6D2C8" }}>{nombreDia(d)}</button>
                    );
                  })}
                </span>
              </div>
            );
          })}
          {visibles.length > 10 && (
            <div onClick={() => setVerTodos((v) => !v)} style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, fontSize: 13.5, color: C.blue, fontWeight: 700, cursor: "pointer" }}>{verTodos ? "Ver menos ▴" : `+ ${visibles.length - 10} pedidos más ▾`}</div>
          )}
          {diasProg.length > 0 && visibles.length === 0 && <div style={{ padding: 24, color: C.slate, fontSize: 14 }}>No hay pedidos con esa prioridad.</div>}
        </div>
        <div style={{ padding: "14px 24px", background: "#F7FAFF", borderTop: "1px solid #B2CCFF", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px" }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: "#1849A9" }}>{nLotes} {nLotes === 1 ? "lote" : "lotes"} · {fmtNum(nUnd)} und se programan así:</div>
            <div style={{ fontSize: 13, color: C.slate, marginTop: 3 }}>
              {resumenDias || "Elige al menos un pedido."}
              {tope > 0 && marcados.length > 0 && (diasPasados.length
                ? <span style={{ color: "#B54708", fontWeight: 700 }}> · Se pasa el tope de {fmtNum(tope)}: {diasPasados.map((d) => `${nombreDia(d)} (${fmtNum(carga[d.iso])})`).join(", ")}</span>
                : <span style={{ color: "#067647", fontWeight: 700 }}> · todo dentro del tope de {fmtNum(tope)} por día</span>)}
              {marcados.length > 0 && " · se pueden mover después"}
            </div>
          </div>
          <button style={btn} onClick={onClose}>Cancelar</button>
          <button onClick={guardar} disabled={!marcados.length || guardando} style={{ ...btn, background: C.blue, color: "#fff", borderColor: C.blue, fontSize: 15, padding: "12px 24px", opacity: marcados.length ? 1 : 0.5 }}>
            {guardando ? "Guardando..." : `Programar ${nLotes} ${nLotes === 1 ? "lote" : "lotes"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
// Ventana "Así va a salir el correo": muestra el correo (asunto, destinatarios y contenido) antes de enviarlo,
// y deja cambiar o quitar un lote de Planta antes de mandarlo.
function VistaPreviaCorreoModal({ dias, programacion, diasMover, hoyISO, onVista, onEnviarDia, onCancelar, onMover, onClose }) {
  const [datos, setDatos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [menu, setMenu] = useState("");
  const fmtCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const nombreDia = (iso) => `${NOMBRES_DIA_PL[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7] || ""} ${fmtCorta(iso)}`;
  const btn = { border: "1px solid #D6D2C8", background: "#fff", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", color: C.ink, fontFamily: "inherit" };
  async function cargar() {
    setCargando(true);
    const res = {};
    for (const iso of dias) {
      try { res[iso] = await onVista(iso); } catch (err) { res[iso] = { error: err?.message || "No se pudo preparar el correo." }; }
    }
    setDatos(res);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);
  const enviables = dias.filter((iso) => datos[iso]?.vista && !datos[iso].sinDestinatarios);
  async function enviar() {
    if (!enviables.length || enviando) return;
    setEnviando(true);
    try {
      for (const iso of enviables) {
        const ok = await onEnviarDia(iso);
        if (!ok) return;
      }
      onClose();
    } finally {
      setEnviando(false);
    }
  }
  async function quitar(p) {
    await onCancelar(p.id);
    setMenu("");
    await cargar();
  }
  async function mover(p, iso) {
    if (iso === p.fechaEnviado) return;
    let motivo = "";
    if (p.avisado !== false) {
      motivo = (await pedirMotivoIncumplimiento({ area: "planta", titulo: `¿Por qué se mueve el lote ${p.numLote} al ${fmtCorta(iso)}?`, detalle: `${p.referencia || ""}${p.numPedido ? ` · Pedido ${p.numPedido}` : ""}` })) || "";
      if (!motivo.trim()) return;
    }
    await onMover(p.id, iso, motivo.trim());
    setMenu("");
    await cargar();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "min(900px,100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(16,24,40,0.3)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.ink }}>Así va a salir el correo</div>
            <div style={{ fontSize: 13.5, color: C.slate, marginTop: 3 }}>Revísalo antes de enviar. Si hace falta, cambia o quita un lote aquí mismo; el correo se actualiza.</div>
          </div>
          <button style={btn} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 24px 16px", borderTop: `1px solid ${C.border}` }}>
          {cargando && <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 14 }}>Preparando el correo…</div>}
          {!cargando && dias.map((iso) => {
            const d = datos[iso] || {};
            const delDia = programacion.filter((p) => p.fechaEnviado === iso && p.estado !== "cumplido");
            return (
              <div key={iso} style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 8 }}>{nombreDia(iso)}{d.totalProg != null ? ` · ${d.totalProg} ${d.totalProg === 1 ? "lote" : "lotes"} en el correo` : ""}</div>
                {delDia.length > 0 && delDia.every((p) => p.avisado !== false) && (() => {
                  const ult = delDia.map((p) => p.avisadoEn).filter(Boolean).sort().pop();
                  const hora = ult ? new Date(ult).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }) : "";
                  return <div style={{ background: C.amberBg, color: C.amber, fontSize: 13, fontWeight: 700, borderRadius: 10, padding: "8px 12px", marginBottom: 8 }}>Este día ya se avisó{hora ? ` a las ${hora}` : ""}; se enviará de nuevo.</div>;
                })()}
                {d.error && <div style={{ color: C.red, fontSize: 13.5 }}>{d.error}</div>}
                {d.motivo === "nada que informar" && <div style={{ color: C.slate, fontSize: 13.5, padding: "8px 0" }}>No hay nada programado para ese día: no sale correo.</div>}
                {d.vista && (
                  <>
                    <div style={{ fontSize: 13, color: C.slate, marginBottom: 6 }}><b style={{ color: C.ink }}>Asunto:</b> {d.asunto}</div>
                    <div style={{ fontSize: 13, color: C.slate, marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      <b style={{ color: C.ink }}>Para ({(d.destinatarios || []).length}):</b>
                      {(d.destinatarios || []).slice(0, 6).map((c) => <span key={c} style={{ background: "#F2EFE8", borderRadius: 999, padding: "2px 10px", fontSize: 12, color: C.ink }}>{c}</span>)}
                      {(d.destinatarios || []).length > 6 && <span>+{d.destinatarios.length - 6} más</span>}
                      {d.sinDestinatarios && <span style={{ color: C.red, fontWeight: 700 }}>No hay destinatarios: agrégalos en Administración → Notificaciones.</span>}
                    </div>
                    <iframe title={`Correo ${iso}`} sandbox="" srcDoc={d.html} style={{ width: "100%", height: 360, border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff" }} />
                  </>
                )}
                {delDia.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.slate, marginBottom: 4 }}>Lotes de Planta de este día</div>
                    {delDia.map((p) => (
                      <div key={p.id} style={{ borderTop: `1px solid ${C.border}`, padding: "7px 2px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <b style={{ color: C.ink }}>{p.numLote}</b>
                          <span style={{ color: C.slate }}>{p.numPedido ? `Pedido ${p.numPedido} · ` : ""}{p.referencia} · {fmtNum(p.cantidad)} und</span>
                          {p.avisado === false && <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.amber }} title="Aún sin avisar" />}
                          <span style={{ flex: 1 }} />
                          <button style={{ ...btn, padding: "4px 12px", fontSize: 12 }} onClick={() => setMenu(menu === p.id ? "" : p.id)}>Cambiar {menu === p.id ? "▴" : "▾"}</button>
                        </div>
                        {menu === p.id && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "8px 0 2px", padding: "8px 10px", background: "#FAF8F4", borderRadius: 10 }}>
                            <span style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>Mover a:</span>
                            {diasMover.filter((x) => x !== p.fechaEnviado).map((x) => (
                              <button key={x} style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={() => mover(p, x)}>{x === hoyISO ? "Hoy" : nombreDia(x)}</button>
                            ))}
                            <span style={{ flex: 1 }} />
                            <button style={{ ...btn, padding: "5px 10px", fontSize: 12, color: C.red, borderColor: C.red }} onClick={() => quitar(p)} title="Lo devuelve a Sin programar">✕ Quitar de la programación</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "14px 24px", background: "#F7FAFF", borderTop: "1px solid #B2CCFF", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, fontSize: 13, color: C.slate }}>{enviables.length > 0 ? `Se enviará${enviables.length > 1 ? `n ${enviables.length} correos (uno por día)` : " 1 correo"} ahora, sin esperar al correo automático.` : "Nada para enviar."}</div>
          <button style={btn} onClick={onClose}>Cancelar</button>
          <button onClick={enviar} disabled={!enviables.length || enviando || cargando} style={{ ...btn, background: C.blue, color: "#fff", borderColor: C.blue, fontSize: 15, padding: "11px 24px", opacity: enviables.length && !cargando ? 1 : 0.5 }}>
            {enviando ? "Enviando..." : "Enviar ahora"}
          </button>
        </div>
      </div>
    </div>
  );
}
// Panel "Pedidos" (al lado del tablero): por cada pedido, sus lotes con referencia y cantidad, y si ya están programados (con el día),
// cumplidos o sin programar. Solo entran pedidos con algo pendiente/sin programar o cumplido esta semana.
function PanelPedidosPlanta({ sinProgramar, programacion, hoyISO, desdeISO, onClose }) {
  const [abiertos, setAbiertos] = useState({});
  const fmtDia = (iso) => `${NOMBRES_DIA_PL[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7] || ""} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const pedidos = useMemo(() => {
    const mapa = new Map();
    const tomar = (k) => { const clave = k == null || k === "" ? "" : String(k); if (!mapa.has(clave)) mapa.set(clave, { pedido: clave, lotes: [], prio: null }); return mapa.get(clave); };
    const prioMejor = (a, b) => (NIVELES_PRIO[b] && (!a || NIVELES_PRIO[b].orden < NIVELES_PRIO[a].orden) ? b : a);
    programacion.forEach((p) => {
      const cumplido = p.estado === "cumplido";
      if (cumplido && (p.fechaEnviado || "") < desdeISO) return;
      const g = tomar(p.numPedido);
      g.prio = prioMejor(g.prio, p.prioridad);
      g.lotes.push({ numLote: p.numLote, referencia: p.referencia, cantidad: p.cantidad, estado: cumplido ? "cumplido" : "programado", dia: p.fechaEnviado, vencido: !cumplido && (p.fechaEnviado || "") < hoyISO });
    });
    sinProgramar.forEach((l) => {
      const g = tomar(l.numPedido);
      g.prio = prioMejor(g.prio, l.prioridad);
      g.lotes.push({ numLote: l.numLote, referencia: l.referencia, cantidad: l.invPlanta, estado: "sin", dia: "" });
    });
    const orden = { sin: 0, programado: 1, cumplido: 2 };
    return [...mapa.values()]
      .map((g) => ({ ...g, lotes: g.lotes.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.dia || "").localeCompare(b.dia || "") || Number(a.numLote) - Number(b.numLote)) }))
      .map((g) => ({ ...g, nSin: g.lotes.filter((l) => l.estado === "sin").length, und: g.lotes.reduce((t, l) => t + (Number(l.cantidad) || 0), 0) }))
      .sort((a, b) => (b.nSin > 0) - (a.nSin > 0) || (NIVELES_PRIO[a.prio]?.orden ?? 9) - (NIVELES_PRIO[b.prio]?.orden ?? 9) || String(a.pedido).localeCompare(String(b.pedido), undefined, { numeric: true }));
  }, [sinProgramar, programacion, hoyISO, desdeISO]);
  const chip = (l) => {
    const m = l.estado === "sin" ? ["Sin programar", C.red, C.redBg] : l.estado === "cumplido" ? [`Cumplido · ${fmtDia(l.dia)}`, C.green, C.greenBg] : [`${l.vencido ? "Vencido · " : "Programado · "}${l.dia === hoyISO ? "Hoy " + l.dia.slice(8, 10) + "/" + l.dia.slice(5, 7) : fmtDia(l.dia)}`, l.vencido ? C.red : C.blue, l.vencido ? C.redBg : C.blueBg];
    return <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap", color: m[1], background: m[2] }}>{m[0]}</span>;
  };
  const LIMITE = 5;
  return (
    <div style={{ width: 400, flexShrink: 0, background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, maxHeight: "78vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <b style={{ fontSize: 15, color: C.ink }}>Pedidos</b>
        <span onClick={onClose} style={{ cursor: "pointer", color: C.slate, fontWeight: 800 }} title="Cerrar">✕</span>
      </div>
      <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Cada lote con su referencia y si ya está programado</div>
      {!pedidos.length && <div style={{ fontSize: 13, color: C.slate, padding: "20px 0", textAlign: "center" }}>No hay pedidos con lotes pendientes.</div>}
      {pedidos.map((g) => {
        const clave = g.pedido || "sin";
        const todos = !!abiertos[clave];
        const visibles = todos ? g.lotes : g.lotes.slice(0, LIMITE);
        return (
          <div key={clave} style={{ border: `1px solid ${C.border}`, borderLeft: `4px solid ${NIVELES_PRIO[g.prio] ? NIVELES_PRIO[g.prio].color : "#98A2B3"}`, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <b style={{ fontSize: 14.5, color: C.ink }}>{g.pedido ? `Pedido ${g.pedido}` : "Sin pedido"}</b>
              <span style={{ fontSize: 12, color: C.slate, whiteSpace: "nowrap" }}>{g.lotes.length} {g.lotes.length === 1 ? "lote" : "lotes"} · {fmtNum(g.und)} und</span>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, margin: "4px 0 6px", color: g.nSin ? C.red : C.green }}>
              {g.nSin ? `⚠ Falta programar ${g.nSin} ${g.nSin === 1 ? "lote" : "lotes"}` : "✓ Todo programado"}
            </div>
            {visibles.map((l) => (
              <div key={`${l.numLote}|${l.estado}`} style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${C.border}`, padding: "5px 2px", fontSize: 12.5 }}>
                <b style={{ width: 44, color: C.ink }}>{l.numLote}</b>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.slate }}>{l.referencia}</span>
                <span style={{ color: C.ink, minWidth: 34, textAlign: "right" }}>{fmtNum(l.cantidad)}</span>
                {chip(l)}
              </div>
            ))}
            {g.lotes.length > LIMITE && (
              <div onClick={() => setAbiertos((a) => ({ ...a, [clave]: !a[clave] }))} style={{ cursor: "pointer", color: C.blue, fontWeight: 700, fontSize: 12, paddingTop: 6 }}>
                {todos ? "Ver menos ▴" : `+ ${g.lotes.length - LIMITE} lotes más ▾`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function TableroSemanalPlanta({ sinProgramar, programacion, onProgramarVarios, onEnviarDia, onVistaDia, onCancelar, onMover, onEditar }) {
  const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const [semana, setSemana] = useState(0);
  const [sabado, setSabado] = useState(false);
  const [tope, setTope] = useState(0);
  const [vistaCorreo, setVistaCorreo] = useState(null); // días cuyo correo se está revisando antes de enviar
  const [panel, setPanel] = useState(false);
  const [verPedidos, setVerPedidos] = useState(false); // panel "Pedidos" al lado del tablero
  const [abiertos, setAbiertos] = useState({}); // pedidos desplegados dentro de un día (clave "iso|pedido") y cumplidos ("cum|iso")
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "planta_programacion"), (snap) => setTope(Number(snap.exists() ? snap.data()?.topeDia : 0) || 0), () => {});
    return unsub;
  }, []);
  const lunes = sumarDiasISOPl(lunesDeISOPl(hoyISO), semana * 7);
  const dias = Array.from({ length: sabado ? 6 : 5 }, (_, i) => ({ iso: sumarDiasISOPl(lunes, i), nombre: NOMBRES_DIA_PL[i] }));
  const diasProg = dias.filter((d) => d.iso >= hoyISO);
  const pendientes = programacion.filter((p) => p.estado !== "cumplido");
  // Lo vencido de semanas anteriores va en su propia franja roja; lo vencido de esta semana se ve en su día (borde rojo).
  const vencidosVisibles = pendientes.filter((p) => p.fechaEnviado && p.fechaEnviado < hoyISO && p.fechaEnviado < dias[0].iso);
  const pedidos = agruparPedidosPlanta(sinProgramar);
  const sinAvisarTotal = pendientes.filter((p) => p.avisado === false).length;
  const diasSinAvisar = [...new Set(pendientes.filter((p) => p.avisado === false && p.fechaEnviado).map((p) => p.fechaEnviado))].sort();
  const abrirVista = (isos) => { if (isos.length) setVistaCorreo(isos); };
  // Días a los que se puede mover un lote desde la vista previa: los próximos días hábiles desde hoy.
  const diasMover = [];
  for (let i = 0; i < 21 && diasMover.length < 7; i += 1) {
    const iso = sumarDiasISOPl(hoyISO, i);
    const dow = new Date(`${iso}T12:00:00`).getDay();
    if ((dow >= 1 && dow <= 5) || (sabado && dow === 6)) diasMover.push(iso);
  }
  async function guardarTope(v) {
    const n = Math.max(0, Math.round(Number(v) || 0));
    setTope(n);
    await setDoc(doc(db, "config", "planta_programacion"), { topeDia: n }, { merge: true });
  }
  async function guardarPanel(asignaciones) {
    for (const a of asignaciones) await onProgramarVarios(a.lotes, a.iso);
    setPanel(false);
  }
  const fmtCorta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const colorPrio = (p) => (NIVELES_PRIO[p] ? NIVELES_PRIO[p].color : "#98A2B3");
  const sumaUnd = (items) => items.reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
  const pill = (txt, fg, bg, title) => <span title={title} style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999, color: fg, background: bg, whiteSpace: "nowrap" }}>{txt}</span>;
  const botonMini = { border: `1px solid ${C.border}`, background: C.white, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: C.ink, fontFamily: "inherit" };
  function agrupar(items) {
    const mapa = new Map();
    items.forEach((x) => {
      const k = x.numPedido == null || x.numPedido === "" ? "" : String(x.numPedido);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(x);
    });
    return [...mapa.entries()].map(([pedido, lotes]) => ({ pedido, lotes }));
  }
  // Un pedido = una línea; al tocarla se ven sus lotes (y el ✎ para moverlos de día).
  function lineaPedido(clavePadre, g, esVencidos) {
    const clave = `${clavePadre}|${g.pedido || "sin"}`;
    const abierto = !!abiertos[clave];
    const prio = g.lotes.reduce((m, p) => (NIVELES_PRIO[p.prioridad] && (!m || NIVELES_PRIO[p.prioridad].orden < NIVELES_PRIO[m].orden) ? p.prioridad : m), null);
    const sinAvisar = g.lotes.some((p) => p.avisado === false);
    const venc = esVencidos || g.lotes.some((p) => p.fechaEnviado < hoyISO);
    return (
      <div key={clave} style={{ marginTop: 7 }}>
        <div onClick={() => setAbiertos((a) => ({ ...a, [clave]: !a[clave] }))} style={{ cursor: "pointer", position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "9px 11px 9px 14px", borderRadius: 10, background: "#FAF8F4", border: venc ? `1px solid ${C.red}` : "1px solid transparent", overflow: "hidden" }}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: colorPrio(prio) }} />
          <b style={{ fontSize: 13.5, color: C.ink, whiteSpace: "nowrap" }}>{g.pedido ? `Pedido ${g.pedido}` : "Sin pedido"}</b>
          <span style={{ fontSize: 12, color: C.slate, whiteSpace: "nowrap" }}>{g.lotes.length} {g.lotes.length === 1 ? "lote" : "lotes"}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {sinAvisar && <span title="Sin avisar: sale en el siguiente correo automático (7 p. m. o 10 a. m.)" style={{ width: 7, height: 7, borderRadius: "50%", background: C.amber }} />}
            <b style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{fmtNum(sumaUnd(g.lotes))}</b>
          </span>
        </div>
        {abierto && g.lotes.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 18px", fontSize: 12.5, color: C.slate }}>
            <b style={{ color: C.ink }}>{p.numLote}</b>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.referencia}</span>
            {p.fechaEnviado < hoyISO && <span style={{ color: C.red, fontWeight: 800, fontSize: 11 }}>{fmtCorta(p.fechaEnviado)}</span>}
            <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{fmtNum(p.cantidad)} und</span>
            <span onClick={() => onEditar(p)} title="Mover a otro día" style={{ cursor: "pointer", color: C.blue, fontWeight: 800 }}>✎ Mover</span>
            <span onClick={() => onCancelar(p.id)} title="Quitar de la programación (vuelve a Sin programar)" style={{ cursor: "pointer", color: C.red, fontWeight: 800 }}>✕ Quitar</span>
          </div>
        ))}
      </div>
    );
  }
  const totalSemana = programacion.filter((p) => dias.some((d) => d.iso === p.fechaEnviado));
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button style={botonMini} onClick={() => setSemana((s) => s - 1)} title="Semana anterior">‹</button>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: C.ink }}>
          {fmtCorta(dias[0].iso)} al {fmtCorta(dias[dias.length - 1].iso)}{semana === 0 ? " (esta semana)" : ""}
        </div>
        <button style={botonMini} onClick={() => setSemana((s) => s + 1)} title="Semana siguiente">›</button>
        {semana !== 0 && <button style={botonMini} onClick={() => setSemana(0)}>Hoy</button>}
        <label style={{ fontSize: 12, color: C.slate, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={sabado} onChange={(e) => setSabado(e.target.checked)} /> Incluir sábado
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => setPanel(true)} style={{ border: `1px solid ${C.blue}`, background: C.blue, color: "#fff", borderRadius: 12, padding: "13px 22px", fontSize: 15.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ＋ Programar lotes <span style={{ opacity: 0.85, fontWeight: 600 }}>· {sinProgramar.length} sin programar</span>
        </button>
        <button
          style={{ ...botonMini, padding: "10px 14px", fontSize: 13, ...(sinAvisarTotal > 0 ? { background: C.amberBg, color: C.amber, borderColor: C.amber } : { color: C.slate, opacity: 0.75 }) }}
          onClick={() => (sinAvisarTotal > 0 ? abrirVista(diasSinAvisar) : window.alert("Todo lo programado ya se avisó. Para mandar el correo de nuevo, usa el botón \"✉ Reenviar correo\" del día."))}
          title="Muestra el correo de lo que aún no se ha avisado para revisarlo y enviarlo, sin esperar al correo automático"
        >
          {`✉ Enviar pendientes (${sinAvisarTotal})`}
        </button>
        <button
          style={{ ...botonMini, padding: "10px 14px", fontSize: 13, ...(verPedidos ? { background: C.blueBg, color: C.blue, borderColor: C.blue } : {}) }}
          onClick={() => setVerPedidos((v) => !v)}
          title="Cada pedido con sus lotes y referencias, y si ya están programados"
        >
          {`📦 Pedidos (${new Set([...pendientes.map((p) => String(p.numPedido ?? "")), ...sinProgramar.map((l) => String(l.numPedido ?? ""))]).size}) ${verPedidos ? "◂" : "▸"}`}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13.5, color: C.slate }}>Semana: <b style={{ color: C.ink }}>{totalSemana.length} lotes · {fmtNum(sumaUnd(totalSemana))} und</b></span>
        <label style={{ fontSize: 12.5, color: C.slate, display: "inline-flex", alignItems: "center", gap: 6 }} title="Si lo llenas, un día que lo pase se pone en rojo. Déjalo en 0 para no usar tope.">
          Tope por día
          <input
            type="number"
            min="0"
            defaultValue={tope || ""}
            key={tope}
            placeholder="sin tope"
            onBlur={(e) => { if (Number(e.target.value || 0) !== tope) guardarTope(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ width: 84, padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: "inherit" }}
          />
        </label>
      </div>
      {vencidosVisibles.length > 0 && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <b style={{ color: C.red, fontSize: 14 }}>Vencidos de semanas anteriores</b>
            <span style={{ fontSize: 12.5, color: C.red }}>{vencidosVisibles.length} lotes sin cumplir</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: "0 12px" }}>
            {agrupar([...vencidosVisibles].sort((a, b) => a.fechaEnviado.localeCompare(b.fechaEnviado))).map((g) => lineaPedido("venc", g, true))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: `repeat(${dias.length}, minmax(0,1fr))`, gap: 14, alignItems: "start" }}>
        {dias.map((d) => {
          const delDia = programacion.filter((p) => p.fechaEnviado === d.iso);
          const total = sumaUnd(delDia);
          const pasa = tope > 0 && total > tope;
          const esHoy = d.iso === hoyISO;
          const pasado = d.iso < hoyISO;
          const pendDia = delDia.filter((p) => p.estado !== "cumplido");
          const cumDia = delDia.filter((p) => p.estado === "cumplido");
          const sinAvisarDia = pendDia.filter((p) => p.avisado === false).length;
          const ultimoAviso = pendDia.map((p) => p.avisadoEn).filter(Boolean).sort().pop();
          const horaAviso = ultimoAviso ? new Date(ultimoAviso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }) : "";
          let estado = pill("libre", C.slate, "#ECEAE4");
          if (delDia.length && !pendDia.length) estado = pill("todo cumplido", C.green, C.greenBg);
          else if (sinAvisarDia) estado = pill(`${sinAvisarDia} sin avisar`, C.amber, C.amberBg, "Salen en el siguiente correo automático (7 p. m. o 10 a. m.)");
          else if (pendDia.length) estado = pill(`✓ avisado${horaAviso ? ` ${horaAviso}` : ""}`, C.green, C.greenBg);
          const claveCum = `cum|${d.iso}`;
          return (
            <div key={d.iso} style={{ background: C.white, border: esHoy ? `2px solid ${C.blue}` : `1px solid ${C.border}`, borderRadius: 16, padding: esHoy ? 15 : 16, minHeight: 250, opacity: pasado && !pendDia.length ? 0.85 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <b style={{ fontSize: 16, color: C.ink }}>{esHoy ? "Hoy" : d.nombre}</b>
                <span style={{ fontSize: 12.5, color: C.slate, display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {fmtCorta(d.iso)}
                </span>
              </div>
              <div style={{ margin: "10px 0 2px", fontSize: 34, fontWeight: 800, lineHeight: 1, color: pasa ? C.red : C.ink }}>{delDia.length}</div>
              <div style={{ fontSize: 13, color: pasa ? C.red : C.slate, fontWeight: pasa ? 800 : 500 }}>
                {delDia.length === 1 ? "lote" : "lotes"} · {fmtNum(total)} und{tope > 0 ? ` de ${fmtNum(tope)}` : ""}
              </div>
              <div style={{ marginTop: 8 }}>{estado}</div>
              {pendDia.length > 0 && (
                <button
                  onClick={() => abrirVista([d.iso])}
                  title="Ver el correo de Planta de este día y enviarlo, sin esperar al correo automático"
                  style={{ ...botonMini, marginTop: 10, width: "100%", padding: "8px 10px", fontSize: 12.5, ...(sinAvisarDia ? { background: C.amberBg, color: C.amber, borderColor: C.amber } : {}) }}
                >
                  {sinAvisarDia ? "✉ Enviar correo" : "✉ Reenviar correo"}
                </button>
              )}
              {pasa && <div style={{ fontSize: 11.5, color: C.red, fontWeight: 800, marginTop: 4 }}>Se pasa del tope por {fmtNum(total - tope)}</div>}
              {agrupar(pendDia).map((g) => lineaPedido(d.iso, g, false))}
              {cumDia.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span onClick={() => setAbiertos((a) => ({ ...a, [claveCum]: !a[claveCum] }))} style={{ cursor: "pointer", color: C.green, fontWeight: 800, fontSize: 13 }}>
                    ✓ {cumDia.length} {cumDia.length === 1 ? "cumplido" : "cumplidos"} {abiertos[claveCum] ? "▴" : "▾"}
                  </span>
                  {abiertos[claveCum] && cumDia.map((p) => (
                    <div key={p.id} style={{ fontSize: 12, color: C.slate, padding: "3px 0" }}>{p.numLote} · {p.referencia} · {fmtNum(p.cantidad)} und</div>
                  ))}
                </div>
              )}
              {!delDia.length && (
                <div style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: "40px 10px", textAlign: "center", color: "#98A2B3", fontSize: 13.5, marginTop: 14 }}>
                  {pasado ? "Sin lotes" : "Nada programado"}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {verPedidos && <PanelPedidosPlanta sinProgramar={sinProgramar} programacion={programacion} hoyISO={hoyISO} desdeISO={lunes} onClose={() => setVerPedidos(false)} />}
      </div>
      <div style={{ marginTop: 12, fontSize: 12.5, color: C.slate, lineHeight: 1.5 }}>
        Cada pedido es una sola línea: tócala para ver sus lotes y moverlos. Programar solo guarda: cada área recibe su correo a las 7 p. m. (metas de hoy y programación siguiente) y a las 10 a. m. (se ratifica la de hoy); gerencia recibe todas; el ✉ de cada día o "Enviar pendientes" lo adelantan. Punto amarillo = aún sin avisar.
      </div>
      {vistaCorreo && <VistaPreviaCorreoModal dias={vistaCorreo} programacion={programacion} diasMover={diasMover} hoyISO={hoyISO} onVista={onVistaDia} onEnviarDia={onEnviarDia} onCancelar={onCancelar} onMover={onMover} onClose={() => setVistaCorreo(null)} />}
      {panel && <ProgramarLotesModal pedidos={pedidos} diasProg={diasProg} programacion={programacion} tope={tope} hoyISO={hoyISO} onGuardar={guardarPanel} onClose={() => setPanel(false)} />}
    </div>
  );
}
// ─── PROGRAMACIÓN DIARIA ─────────────────────────────────────────────────────────
function ProgramacionDiariaView({ cargaActiva, programacion, onProgramar, onProgramarVarios, onEnviarDia, onEnviarTodo, onVistaDia, onCancelar, onEditarFecha, isAdmin }) {
  const [programando, setProgramando] = useState(null);
  const [editando, setEditando] = useState(null);
  const [subTab, setSubTab] = useState("pendientes");
  // "tablero" = semana por días (nuevo, por defecto); "tabla" = las listas de siempre.
  const [vista, setVista] = useState("tablero");
  // (2026-08-24) Antes se usaba "l.invPlanta > 0" directo — pero Busint no
  // deja siempre en 0 el inventario de Planta apenas el lote avanza a
  // Semiterminado/BPT (quedan unidades "fantasma" en esa columna aunque el
  // lote ya se movió), así que un lote como el 7120 seguía contando como "en
  // Planta Yanko" y nunca se limpiaba de Vencidos en Programación Diaria, aun
  // con la carga recién actualizada mostrándolo en Semiterminado en el
  // buscador de lote. "ubicacionActual" (armado en construirLotesDesdeBusintGen
  // / agruparLotes con la MISMA prioridad BPT > Semiterminado > Planta > BMP >
  // Corte que usa el buscador) es la fuente de verdad real de dónde está HOY
  // el lote — se usa ese campo en vez del invPlanta crudo, aquí y en el
  // reconciliador automático de más abajo.
  const lotesEnPlantaYanko = useMemo(
    () => (cargaActiva?.lotes || []).filter((l) => l.nombrePlanta === PLANTA_YANKO && (l.ubicacionActual ? l.ubicacionActual === "Planta" : l.invPlanta > 0)),
    [cargaActiva]
  );
  const pendientes = useMemo(() => programacion.filter((p) => p.estado !== "cumplido"), [programacion]);
  const cumplidos = useMemo(
    () => [...programacion.filter((p) => p.estado === "cumplido")].sort((a, b) => (b.fechaCumplioISO || "").localeCompare(a.fechaCumplioISO || "")),
    [programacion]
  );
  const numLotesProgramados = useMemo(() => new Set(pendientes.map((p) => p.numLote)), [pendientes]);
  const sinProgramar = useMemo(
    () => lotesEnPlantaYanko.filter((l) => !numLotesProgramados.has(l.numLote)),
    [lotesEnPlantaYanko, numLotesProgramados]
  );
  const [filtroPrio, setFiltroPrio] = useState("todas");
  const statsPedido = useMemo(() => estadisticasPedidos(cargaActiva?.lotes), [cargaActiva]);
  const sinProgramarPrio = useMemo(
    () => sinProgramar
      .map((l) => ({ ...l, ...prioridadDeLote(l, statsPedido) }))
      .sort((a, b) => NIVELES_PRIO[a.prioridad].orden - NIVELES_PRIO[b.prioridad].orden
        || (a.diasPedido ?? 9999) - (b.diasPedido ?? 9999) || a.numLote - b.numLote),
    [sinProgramar, statsPedido]
  );
  const conteoPrio = useMemo(() => ({
    alta: sinProgramarPrio.filter((l) => l.prioridad === "alta").length,
    media: sinProgramarPrio.filter((l) => l.prioridad === "media").length,
    normal: sinProgramarPrio.filter((l) => l.prioridad === "normal").length,
  }), [sinProgramarPrio]);
  const sinProgramarVisibles = useMemo(
    () => (filtroPrio === "todas" ? sinProgramarPrio : sinProgramarPrio.filter((l) => l.prioridad === filtroPrio)),
    [sinProgramarPrio, filtroPrio]
  );
  const pendientesConEstado = useMemo(
    () => pendientes.map((p) => {
      const dias = diasEntre(p.fechaEnviado);
      return { ...p, dias, estado: estadoDe(dias) };
    }).sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0)),
    [pendientes]
  );
  const vencidosCount = pendientesConEstado.filter((p) => p.estado === "VENCIDO").length;
  return (
    <div>
      {programando && (
        <ProgramarLoteModal
          lote={programando}
          onConfirm={(lote, fecha) => onProgramar(lote, fecha)}
          onClose={() => setProgramando(null)}
        />
      )}
      {editando && (
        <EditarFechaModal
          fila={editando}
          onConfirm={(id, fecha, motivo) => onEditarFecha(id, fecha, motivo)}
          onClose={() => setEditando(null)}
        />
      )}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Programación Diaria — Planta Yanko</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
          {cargaActiva
            ? `Datos de Planeación · Carga del ${cargaActiva.fecha}${cargaActiva.creadoEn ? ` · Actualizado ${fmtFechaHora(cargaActiva.creadoEn)}` : ""}${cargaActiva.subidoPor ? ` · Subido por ${cargaActiva.subidoPor}` : ""}`
            : "Aún no hay ninguna carga de Hoja1 en Planeación — sube una allí para ver qué hay en Planta Yanko."}
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        <KPI icon="🏭" label="En Planta Yanko (hoy)" value={fmtNum(lotesEnPlantaYanko.length)} color={C.ink} bg={C.canvas} />
        <KPI icon="📅" label="Programados pendientes" value={fmtNum(pendientes.length)} color={C.blue} bg={C.blueBg} />
        <KPI icon="⚠" label="Vencidos" value={fmtNum(vencidosCount)} color={C.red} bg={C.redBg} />
        <KPI icon="✓" label="Cumplidos (histórico)" value={fmtNum(cumplidos.length)} color={C.green} bg={C.greenBg} />
      </div>
      <div style={{ display: "inline-flex", border: `1.5px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
        {[["tablero", "📅 Tablero de la semana"], ["tabla", "📋 Listas"]].map(([k, txt]) => (
          <button
            key={k}
            type="button"
            onClick={() => setVista(k)}
            style={{ padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: vista === k ? 800 : 500, background: vista === k ? C.ink : C.white, color: vista === k ? C.white : C.slate }}
          >
            {txt}
          </button>
        ))}
      </div>
      {vista === "tablero" && (
        <TableroSemanalPlanta sinProgramar={sinProgramarPrio} programacion={programacion} onProgramarVarios={onProgramarVarios} onEnviarDia={onEnviarDia} onVistaDia={onVistaDia} onCancelar={onCancelar} onMover={onEditarFecha} onEditar={setEditando} />
      )}
      {vista === "tabla" && sinProgramar.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 4 }}>EN PLANTA YANKO SIN PROGRAMAR — ordenado por prioridad</div>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>
            La prioridad sale de la fecha de entrega del pedido y de cuántos lotes del pedido faltan por salir. Al programar, la fecha sugerida ya viene puesta.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[["todas", `Todas (${sinProgramarPrio.length})`, C.ink, C.canvas], ["alta", `🔴 Alta (${conteoPrio.alta})`, NIVELES_PRIO.alta.color, NIVELES_PRIO.alta.bg], ["media", `🟠 Media (${conteoPrio.media})`, NIVELES_PRIO.media.color, NIVELES_PRIO.media.bg], ["normal", `🟢 Normal (${conteoPrio.normal})`, NIVELES_PRIO.normal.color, NIVELES_PRIO.normal.bg]].map(([id, txt, color, bg]) => (
              <div
                key={id}
                onClick={() => setFiltroPrio(id)}
                style={{ cursor: "pointer", padding: "6px 14px", borderRadius: 20, fontWeight: 800, fontSize: 12, color, background: bg, border: `2px solid ${filtroPrio === id ? color : "transparent"}` }}
              >
                {txt}
              </div>
            ))}
          </div>
          <Tabla
            vacio="Todo lo que está en Planta Yanko ya tiene una fecha programada."
            columnas={[
              {
                key: "prioridad",
                label: "Prioridad",
                render: (f) => <span style={{ background: NIVELES_PRIO[f.prioridad].bg, color: NIVELES_PRIO[f.prioridad].color, fontWeight: 800, fontSize: 10, padding: "3px 9px", borderRadius: 10 }}>{NIVELES_PRIO[f.prioridad].txt}</span>,
              },
              { key: "razonesTxt", label: "Por qué" },
              { key: "numLote", label: "Num Lote" },
              { key: "numPedido", label: "Num Pedido" },
              { key: "referencia", label: "Referencia" },
              { key: "categoria", label: "Categoría" },
              { key: "invPlanta", label: "Cantidad", align: "right", render: (f) => fmtNum(f.invPlanta) },
              { key: "fechaEntregaPedidoISO", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedidoISO) || "—" },
              { key: "fechaSugerida", label: "Fecha sugerida", render: (f) => fmtFechaISO(f.fechaSugerida) || "—" },
              {
                key: "accion",
                label: "",
                render: (f) => (
                  <button
                    onClick={() => setProgramando(f)}
                    style={{ background: C.blueBg, border: "none", borderRadius: 6, padding: "4px 10px", color: C.blue, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                  >
                    📅 Programar
                  </button>
                ),
              },
            ]}
            filas={sinProgramarVisibles}
          />
        </div>
      )}
      {vista === "tabla" && (<>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div
          onClick={() => setSubTab("pendientes")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: subTab === "pendientes" ? C.ink : C.white, color: subTab === "pendientes" ? C.seam : C.ink, border: `1px solid ${subTab === "pendientes" ? C.ink : C.border}` }}
        >
          PROGRAMADOS PENDIENTES
        </div>
        <div
          onClick={() => setSubTab("cumplidos")}
          style={{ cursor: "pointer", padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 12, background: subTab === "cumplidos" ? C.ink : C.white, color: subTab === "cumplidos" ? C.seam : C.ink, border: `1px solid ${subTab === "cumplidos" ? C.ink : C.border}` }}
        >
          HISTORIAL DE CUMPLIDOS
        </div>
      </div>
      {subTab === "pendientes" && (
        <Tabla
          vacio="No hay lotes programados pendientes."
          columnas={[
            { key: "numLote", label: "Num Lote" },
            { key: "referencia", label: "Referencia" },
            { key: "categoria", label: "Categoría" },
            { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
            { key: "fechaEnviado", label: "Fecha Comprometida", render: (f) => fmtFechaISO(f.fechaEnviado) },
            { key: "dias", label: "Días", align: "right", render: (f) => (f.dias ?? "—"), color: (f) => (f.dias < 0 ? C.red : C.ink) },
            { key: "estado", label: "Estado", render: (f) => <EstadoBadge estado={f.estado} /> },
            {
              key: "accion",
              label: "",
              render: (f) => (
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setEditando(f)}
                    title="Editar fecha comprometida"
                    style={{ background: C.blueBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.blue, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                  >
                    ✎
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => onCancelar(f.id)}
                      title="Cancelar programación"
                      style={{ background: C.redBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.red, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          filas={pendientesConEstado}
        />
      )}
      {subTab === "cumplidos" && (
        <Tabla
          vacio="Todavía no hay lotes cumplidos."
          columnas={[
            { key: "numLote", label: "Num Lote" },
            { key: "referencia", label: "Referencia" },
            { key: "categoria", label: "Categoría" },
            { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
            { key: "fechaEnviado", label: "Fecha Comprometida", render: (f) => fmtFechaISO(f.fechaEnviado) },
            { key: "fechaCumplioISO", label: "Fecha Cumplió", render: (f) => fmtFechaISO(f.fechaCumplioISO) },
            {
              key: "diasTomo",
              label: "Días vs. lo comprometido",
              align: "right",
              render: (f) => {
                const d = diasTranscurridos(f.fechaEnviado, f.fechaCumplioISO);
                if (d === null) return "—";
                if (d <= 0) return "A tiempo";
                return `+${d} tarde`;
              },
              color: (f) => {
                const d = diasTranscurridos(f.fechaEnviado, f.fechaCumplioISO);
                return d > 0 ? C.red : C.green;
              },
            },
          ]}
          filas={cumplidos}
        />
      )}
      </>)}
    </div>
  );
}
// ─── ENTRADAS DE PLANTA (parseo Excel) ──────────────────────────────────────────
// "ENTRADAS DE PLANTA.xlsx" — Hoja3 es la que importa: un renglón por cada
// entrada (entrega) de una planta, con la fecha real de entrada (Fecha) y la
// fecha comprometida de esa entrada (FechaFin). La diferencia entre ambas es
// el indicador de cumplimiento por entrega. Ftpla es lo facturado por esa
// entrada (coincide siempre con "cxp" en el archivo real, así que se usa
// directo sin tener que recalcular a partir de cantidad × valor).
async function parseEntradasPlanta(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "hoja3") || wb.SheetNames[wb.SheetNames.length - 1];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const entradas = [];
  rows.forEach((row) => {
    const numEnt = row["NumEnt"];
    if (numEnt === null || numEnt === undefined || numEnt === "") return;
    const fecha = dateToISO(row["Fecha"]);
    const fechaFin = dateToISO(row["FechaFin"]);
    const fechaInicio = dateToISO(row["FECHAINI"]);
    const cantidad = Number(row["Prodnormal"]) || 0;
    const facturado = Number(row["Ftpla"]) || 0;
    const diasCumplimiento = fecha && fechaFin && cantidad > 0 ? diasTranscurridos(fechaFin, fecha) : null;
    entradas.push({
      numEnt: Number(numEnt),
      fecha,
      fechaFin,
      fechaInicio,
      nombrePlanta: String(row["Nom"] || "").trim() || "(Sin planta)",
      categoria: String(row["Categoria de Producto"] || "").trim() || "(Sin categoría)",
      cantidad,
      esDevolucion: cantidad < 0,
      facturado,
      numLote: row["Numlote"] ?? null,
      refN: row["RefN"] ?? "",
      // RefExt es el código de referencia con el que se conoce en el resto de
      // la app (mismo formato que usan Pedidos/Corte, p.ej. "GM1002"); RefN
      // es un código interno distinto, se guarda solo como respaldo.
      refExt: String(row["RefExt"] ?? row["RefN"] ?? "").trim(),
      nPedido: row["Nped"] ?? null,
      diasCumplimiento,
      // CostoFT = precio teórico de confección, el que queda fijado en la
      // ficha técnica de la referencia; VaEnt = precio real de esa entrada
      // puntual del lote (puede variar entrada a entrada) — confirmado por
      // Fredy (17/08/2026): la comparación es CostoFT (columna V) vs. VaEnt
      // (columna W), NO ValPlanta (columna U, que es otra cosa). Vienen del
      // mismo Excel de Entradas de Planta, hoja "Hoja3".
      precioTeorico: Number(row["CostoFT"]) || 0,
      precioEntrada: Number(row["VaEnt"]) || 0,
      usuario: String(row["USUARIO"] || "").trim() || null,
      // "desclarga" = descripción de la referencia (ej. "CAMISETA CUELLO R CON CORTES...").
      descripcion: String(row["desclarga"] || "").trim() || null,
      observacion: cantidad < 0 ? String(row["observacion"] || "").trim() || null : null,
    });
  });
  return entradas;
}
// ─── SUBIR ENTRADAS DE PLANTA ────────────────────────────────────────────────────
function SubirEntradasModal({ onConfirm, onClose }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setError("");
    setCargando(true);
    try {
      const entradas = await parseEntradasPlanta(f);
      if (!entradas.length) {
        setError("No se encontraron entradas válidas. Verifica que el archivo tenga una hoja \"Hoja3\" con el formato esperado.");
      } else {
        const plantas = new Set(entradas.map((e) => e.nombrePlanta));
        const resumen = {
          total: entradas.length,
          unidades: entradas.reduce((s, e) => s + e.cantidad, 0),
          facturado: entradas.reduce((s, e) => s + e.facturado, 0),
          plantas: plantas.size,
        };
        setPreview({ entradas, resumen });
      }
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx) con una hoja llamada \"Hoja3\".");
    }
    setCargando(false);
  }
  function confirmar() {
    if (!preview) return;
    onConfirm(preview.entradas);
    onClose();
  }
  return (
    <Modal title="Subir Entradas de Planta" onClose={onClose} width={520}>
      {!preview ? (
        <div>
          <div style={{ padding: "12px 14px", background: C.blueBg, borderRadius: 8, marginBottom: 18, fontSize: 13, color: C.blue, lineHeight: 1.5 }}>
            Sube el Excel "ENTRADAS DE PLANTA" (hoja "Hoja3"). El sistema arma el dashboard de cumplimiento y facturación por planta a partir de esta información.
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
            Se encontraron <strong>{preview.resumen.total}</strong> entradas de <strong>{preview.resumen.plantas}</strong> plantas.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 20 }}>
            <KPI icon="📦" label="Unidades" value={fmtNum(preview.resumen.unidades)} color={C.green} bg={C.greenBg} />
            <KPI icon="💰" label="Facturado" value={`$${fmtNum(preview.resumen.facturado)}`} color={C.blue} bg={C.blueBg} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setPreview(null)}>← Volver</Btn>
            <Btn variant="danger" onClick={confirmar}>Guardar carga y ver dashboard</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
// ─── TRAER ENTRADAS DE PLANTA DESDE BUSINT ─────────────────────────────────────
// Reemplaza (sin quitar) la subida manual del Excel: una función del servidor
// arma las mismas entradas desde las tablas de Busint. Primero se puede
// "Comparar con mi Excel" (no guarda nada) para validar que los datos
// coinciden; después se ve la vista previa y se guarda. Todos los días a las
// 6:00am el servidor lo hace solo (sincronizarEntradasPlantaDiario).
const NOMBRES_CAMPOS_SYNC = {
  cantidad: "Cantidad",
  nombrePlanta: "Nombre del taller",
  numLote: "Lote",
  refExt: "Referencia (ext.)",
  categoria: "Categoría",
  nPedido: "Pedido",
  fechaInicio: "Fecha inicio",
  fechaFin: "Fecha comprometida",
  precioTeorico: "Precio teórico",
  precioEntrada: "Precio de la entrada",
  facturado: "Facturado",
};
function TraerDeBusintModal({ onClose }) {
  const [dias, setDias] = useState(60);
  const anioActual = new Date().getFullYear();
  const aniosOpciones = Array.from({ length: anioActual - 2021 }, (_, i) => anioActual - i); // anioActual ... 2022
  const [anio, setAnio] = useState(anioActual);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [comparacion, setComparacion] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [avanzado, setAvanzado] = useState(false);
  async function llamar(modo, porAnio = false) {
    setCargando(porAnio ? `${modo}-anio` : modo);
    setError("");
    try {
      const fn = httpsCallable(functionsClient, "sincronizarEntradasPlantaBusintBD", { timeout: 540000 });
      const r = await fn(porAnio ? { modo, anio } : { modo, dias });
      if (modo === "comparar") {
        setComparacion(r.data);
        setResumen(null);
      } else {
        setResumen(r.data);
      }
    } catch (e) {
      setError(e?.message || "No se pudo consultar Busint.");
    }
    setCargando(false);
  }
  const fmtVal = (v) => (v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? fmtNum(v) : String(v));
  return (
    <Modal title="Traer Entradas de Planta desde Busint" onClose={onClose} width={760}>
      <div style={{ padding: "12px 14px", background: C.blueBg, borderRadius: 8, marginBottom: 16, fontSize: 13, color: C.blue, lineHeight: 1.5 }}>
        Trae las entradas de Busint de los últimos {dias} días y las guarda. Lo que ya está cargado se conserva. También se actualiza solo todos los días a las 6:00 a. m.
      </div>
      <div style={{ marginBottom: 16 }}>
        <Btn onClick={() => llamar("guardar")} disabled={!!cargando}>
          {cargando === "guardar" ? "Actualizando..." : "🔄 Actualizar"}
        </Btn>
      </div>
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setAvanzado((v) => !v)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.slate, fontFamily: "inherit" }}
        >
          {avanzado ? "▼" : "▶"} Opciones avanzadas (otro rango de días, comparar con mi Excel, año completo)
        </button>
        {avanzado && <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: C.slate }}>Traer los últimos</label>
        <select
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          style={{ padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, fontFamily: "inherit" }}
        >
          <option value={30}>30 días</option>
          <option value={60}>60 días</option>
          <option value={120}>120 días</option>
          <option value={300}>300 días (casi todo el año)</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Btn variant="secondary" onClick={() => llamar("comparar")} disabled={!!cargando}>
          {cargando === "comparar" ? "Comparando..." : "🔍 Comparar con mi Excel"}
        </Btn>
        <Btn variant="secondary" onClick={() => llamar("preview")} disabled={!!cargando}>
          {cargando === "preview" ? "Calculando..." : "👁 Ver qué traería"}
        </Btn>
        <Btn variant="secondary" onClick={() => llamar("guardar")} disabled={!!cargando}>
          {cargando === "guardar" ? "Guardando..." : "⬇ Traer y guardar"}
        </Btn>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap", padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.canvas }}>
        <label style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>Año completo</label>
        <select
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          style={{ padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, fontFamily: "inherit" }}
        >
          {aniosOpciones.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <Btn variant="secondary" onClick={() => llamar("preview", true)} disabled={!!cargando}>
          {cargando === "preview-anio" ? "Calculando..." : "👁 Ver qué traería"}
        </Btn>
        <Btn onClick={() => llamar("guardar", true)} disabled={!!cargando}>
          {cargando === "guardar-anio" ? "Guardando..." : `⬇ Traer y guardar ${anio}`}
        </Btn>
        <div style={{ flexBasis: "100%", fontSize: 12, color: C.slate, lineHeight: 1.5 }}>
          Cada año se guarda aparte y queda guardado: lo traes una sola vez. El año en curso se actualiza solo todos los días.
        </div>
      </div>
        </div>}
      </div>
      {cargando && <div style={{ fontSize: 13, color: C.slate, marginBottom: 12 }}>Consultando Busint... puede tardar uno o dos minutos.</div>}
      {error && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red, fontWeight: 600 }}>{error}</div>
      )}
      {resumen && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: resumen.guardado ? C.greenBg : C.canvas, borderRadius: 8, fontSize: 13, color: C.ink, lineHeight: 1.7 }}>
          <strong>{resumen.guardado ? "✅ Guardado." : "Vista previa (no se guardó nada)."}</strong>
          <div>
            {resumen.anio ? `Año ${resumen.anio}` : `Desde ${resumen.desde} (${resumen.dias} días)`}: Busint trae <strong>{fmtNum(resumen.traidasDeBusint)}</strong> movimientos
            {" "}(con cliente: {fmtNum(resumen.conCliente || 0)} · con descripción: {fmtNum(resumen.conDescripcion || 0)}).
          </div>
          <div>
            Nuevas: <strong>{fmtNum(resumen.nuevas)}</strong> · Actualizadas: <strong>{fmtNum(resumen.actualizadas)}</strong> · Total después de mezclar: <strong>{fmtNum(resumen.totalDespuesDeMezclar)}</strong>
            {resumen.ultimaFecha ? ` · Última fecha: ${resumen.ultimaFecha}` : ""}
          </div>
          {(resumen.guardadoPorAnio || []).map((g) => (
            <div key={g.anio} style={{ color: C.slate }}>Año {g.anio} guardado: {fmtNum(g.entradas)} movimientos · {fmtNum(g.tamanoKB)} KB (límite ~950 KB).</div>
          ))}
        </div>
      )}
      {comparacion && !comparacion.ok && (
        <div style={{ padding: "10px 14px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red }}>{comparacion.mensaje}</div>
      )}
      {comparacion && comparacion.ok && (
        <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, background: C.white }}>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 10 }}>
            Comparado contra la carga del {comparacion.cargaComparada?.fecha}
            {comparacion.cargaComparada?.subidoPor ? ` (${comparacion.cargaComparada.subidoPor})` : ""}, desde {comparacion.desde}.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
            <KPI icon="📄" label="En tu Excel" value={fmtNum(comparacion.totalExcel)} color={C.slate} bg={C.canvas} />
            <KPI icon="🔌" label="En Busint" value={fmtNum(comparacion.totalBusint)} color={C.blue} bg={C.blueBg} />
            <KPI icon="✅" label="Idénticas" value={fmtNum(comparacion.coincidenExactas)} color={C.green} bg={C.greenBg} />
            <KPI icon="⚠️" label="Con diferencias" value={fmtNum(comparacion.conDiferencias)} color={C.red} bg={C.redBg} />
          </div>
          <div style={{ fontSize: 13, color: C.ink, marginBottom: 10 }}>
            Solo en el Excel: <strong>{fmtNum(comparacion.totalSoloExcel)}</strong> · Solo en Busint: <strong>{fmtNum(comparacion.totalSoloBusint)}</strong>
          </div>
          {Object.entries(comparacion.diferenciasPorCampo || {})
            .filter(([, d]) => d.total > 0)
            .map(([campo, d]) => (
              <div key={campo} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                  {NOMBRES_CAMPOS_SYNC[campo] || campo}: {fmtNum(d.total)} diferencias
                </div>
                {d.ejemplos.map((x, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.slate, paddingLeft: 10 }}>
                    Entrada {x.numEnt} ({x.fecha}) · Excel: <strong>{fmtVal(x.excel)}</strong> · Busint: <strong>{fmtVal(x.busint)}</strong>
                  </div>
                ))}
              </div>
            ))}
          {Object.values(comparacion.diferenciasPorCampo || {}).every((d) => d.total === 0) && (
            <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Ningún campo tiene diferencias en las entradas que están en ambos lados.</div>
          )}
          {comparacion.soloExcel?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Están en el Excel pero Busint no las trae (primeras {comparacion.soloExcel.length})</div>
              {comparacion.soloExcel.map((x, i) => (
                <div key={i} style={{ fontSize: 12, color: C.slate, paddingLeft: 10 }}>
                  Entrada {x.numEnt} ({x.fecha}) · {fmtVal(x.cantidad)} und · {x.planta}
                </div>
              ))}
            </div>
          )}
          {comparacion.soloBusint?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Las trae Busint pero no están en el Excel (primeras {comparacion.soloBusint.length})</div>
              {comparacion.soloBusint.map((x, i) => (
                <div key={i} style={{ fontSize: 12, color: C.slate, paddingLeft: 10 }}>
                  Entrada {x.numEnt} ({x.fecha}) · {fmtVal(x.cantidad)} und · {x.planta}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
      </div>
    </Modal>
  );
}
// ─── CONTROL DE DEVOLUCIONES ───────────────────────────────────────────────────
// (2026-10-08, a pedido de Fredy) Cuántas entradas se devuelven por precio y
// cuánto cambió el precio frente al que se envió al taller.
//   - Precio devuelto: el de la entrada que se devolvió (VaEnt).
//   - Precio corregido: el de la nueva entrada del mismo lote que la reemplaza
//     (la más cercana en fecha, igual o posterior a la devolución).
//   - Precio enviado: el precio teórico (el pactado al sacar el lote al taller).
// Motivo: el texto que se escribe al devolver. Si no hay texto pero el mismo
// lote vuelve a entrar con otro precio, se marca "Precio (detectado)".
const MOTIVOS_DEV = {
  precio: { label: "Por precio", color: C.red, bg: C.redBg },
  detectado: { label: "Precio (detectado)", color: "#B26A00", bg: "#FFF4E0" },
  otro: { label: "Otro motivo", color: C.blue, bg: C.blueBg },
  sinMotivo: { label: "Sin motivo escrito", color: C.slate, bg: C.canvas },
};
function armarControlDevoluciones(entradas) {
  const devs = entradas.filter((e) => e.esDevolucion);
  const positivas = entradas.filter((e) => e.cantidad > 0);
  return devs
    .map((d) => {
      const original = positivas.find((e) => e.numEnt === d.numEnt && e.fecha <= d.fecha) || null;
      const candidatas = positivas
        .filter((e) => e.numLote === d.numLote && e.numEnt !== d.numEnt && e.fecha >= d.fecha)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || Math.abs(a.cantidad - Math.abs(d.cantidad)) - Math.abs(b.cantidad - Math.abs(d.cantidad)));
      const nueva = candidatas[0] || null;
      const precioDevuelto = d.precioEntrada || original?.precioEntrada || 0;
      const precioCorregido = nueva ? nueva.precioEntrada : null;
      const texto = (d.observacion || "").trim();
      const detectado = !!nueva && precioCorregido !== precioDevuelto;
      let motivo = "sinMotivo";
      if (/precio/i.test(texto)) motivo = "precio";
      else if (texto) motivo = "otro";
      else if (detectado) motivo = "detectado";
      const unidades = Math.abs(d.cantidad);
      const enviado = d.precioTeorico || null;
      const difVsEnviado = precioCorregido !== null && enviado ? precioCorregido - enviado : null;
      return {
        clave: `${d.numEnt}|${d.fecha}`,
        numEnt: d.numEnt,
        fecha: d.fecha,
        planta: d.nombrePlanta,
        lote: d.numLote,
        refExt: d.refExt,
        refN: d.refN,
        unidades,
        motivo,
        texto,
        precioDevuelto,
        precioCorregido,
        enviado,
        difVsEnviado,
        impactoVsEnviado: difVsEnviado !== null ? difVsEnviado * unidades : null,
        cambioPrecio: precioCorregido !== null ? precioCorregido - precioDevuelto : null,
        digito: original?.usuario || null,
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numEnt - a.numEnt);
}
function ControlDevolucionesView({ entradas }) {
  const todas = useMemo(() => armarControlDevoluciones(entradas), [entradas]);
  const meses = useMemo(() => [...new Set(todas.map((x) => x.fecha.slice(0, 7)))].sort().reverse(), [todas]);
  const [mes, setMes] = useState("todo");
  const [filtroMotivo, setFiltroMotivo] = useState("todos");
  const delPeriodo = useMemo(() => (mes === "todo" ? todas : todas.filter((x) => x.fecha.slice(0, 7) === mes)), [todas, mes]);
  const lista = useMemo(() => {
    if (filtroMotivo === "todos") return delPeriodo;
    if (filtroMotivo === "precioTodos") return delPeriodo.filter((x) => x.motivo === "precio" || x.motivo === "detectado");
    return delPeriodo.filter((x) => x.motivo === filtroMotivo);
  }, [delPeriodo, filtroMotivo]);
  const porPrecio = delPeriodo.filter((x) => x.motivo === "precio" || x.motivo === "detectado");
  const sobreEnviado = porPrecio.filter((x) => x.difVsEnviado !== null && x.difVsEnviado > 0);
  const impactoSobre = sobreEnviado.reduce((s, x) => s + x.impactoVsEnviado, 0);
  const sinMotivo = delPeriodo.filter((x) => x.motivo === "sinMotivo").length;
  const unidadesDev = delPeriodo.reduce((s, x) => s + x.unidades, 0);
  const porTaller = useMemo(() => {
    const m = new Map();
    delPeriodo.forEach((x) => {
      if (!m.has(x.planta)) m.set(x.planta, { planta: x.planta, total: 0, precio: 0, unidades: 0 });
      const g = m.get(x.planta);
      g.total += 1;
      g.unidades += x.unidades;
      if (x.motivo === "precio" || x.motivo === "detectado") g.precio += 1;
    });
    return [...m.values()].sort((a, b) => b.precio - a.precio || b.total - a.total);
  }, [delPeriodo]);
  const porDigitador = useMemo(() => {
    const m = new Map();
    porPrecio.forEach((x) => {
      const k = x.digito || "(sin dato)";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [porPrecio]);
  const sinUsuario = porDigitador.length === 1 && porDigitador[0][0] === "(sin dato)";
  const th = { textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.slate, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 12, color: C.ink, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const tdn = { ...td, textAlign: "right" };
  const money = (v) => (v === null || v === undefined ? "—" : `$${fmtNum(v)}`);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.slate, maxWidth: 640, lineHeight: 1.5 }}>
          Entradas que se devolvieron y por qué. Compara el precio con el que quedó mal digitado, el precio corregido y el precio que se envió al taller (precio teórico).
        </p>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{ padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.ink, background: C.white, fontFamily: "inherit" }}
        >
          <option value="todo">Todo el período</option>
          {meses.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 16 }}>
        <KPI icon="↩️" label="Devoluciones" value={fmtNum(delPeriodo.length)} sub={`${fmtNum(unidadesDev)} unidades`} color={C.ink} bg={C.canvas} />
        <KPI
          icon="💲"
          label="Por precio"
          value={fmtNum(porPrecio.length)}
          sub={delPeriodo.length ? `${Math.round((porPrecio.length / delPeriodo.length) * 100)}% de las devoluciones` : ""}
          color={C.red}
          bg={C.redBg}
        />
        <KPI
          icon="⬆️"
          label="Quedaron sobre lo enviado"
          value={fmtNum(sobreEnviado.length)}
          sub={impactoSobre ? `${money(impactoSobre)} de más` : "sin sobrecosto"}
          color="#B26A00"
          bg="#FFF4E0"
        />
        <KPI icon="❔" label="Sin motivo escrito" value={fmtNum(sinMotivo)} color={C.slate} bg={C.canvas} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          { id: "todos", label: "Todas" },
          { id: "precioTodos", label: "Todas las de precio" },
          { id: "precio", label: "Por precio (texto)" },
          { id: "detectado", label: "Precio (detectado)" },
          { id: "otro", label: "Otro motivo" },
          { id: "sinMotivo", label: "Sin motivo" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroMotivo(f.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 18,
              border: `1.5px solid ${filtroMotivo === f.id ? C.ink : C.border}`,
              background: filtroMotivo === f.id ? C.ink : C.white,
              color: filtroMotivo === f.id ? C.white : C.ink,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Fecha</th>
              <th style={th}>Taller</th>
              <th style={th}>Lote</th>
              <th style={th}>Referencia</th>
              <th style={{ ...th, textAlign: "right" }}>Und</th>
              <th style={th}>Motivo</th>
              <th style={{ ...th, textAlign: "right" }}>Precio devuelto</th>
              <th style={{ ...th, textAlign: "right" }}>Precio corregido</th>
              <th style={{ ...th, textAlign: "right" }}>Precio enviado</th>
              <th style={{ ...th, textAlign: "right" }}>Corregido vs enviado</th>
              <th style={{ ...th, textAlign: "right" }}>Total vs enviado</th>
              <th style={th}>Digitó la entrada</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((x) => {
              const mo = MOTIVOS_DEV[x.motivo];
              const sobre = x.difVsEnviado !== null && x.difVsEnviado > 0;
              return (
                <tr key={x.clave}>
                  <td style={td}>{fmtFechaISO(x.fecha)}</td>
                  <td style={td}>{x.planta}</td>
                  <td style={td}>{x.lote ?? "—"}</td>
                  <td style={td}>{x.refN || x.refExt || "—"}</td>
                  <td style={tdn}>{fmtNum(x.unidades)}</td>
                  <td style={td} title={x.texto || ""}>
                    <span style={{ padding: "3px 8px", borderRadius: 10, background: mo.bg, color: mo.color, fontWeight: 700, fontSize: 11 }}>{mo.label}</span>
                  </td>
                  <td style={tdn}>{money(x.precioDevuelto)}</td>
                  <td style={tdn}>{money(x.precioCorregido)}</td>
                  <td style={tdn}>{money(x.enviado)}</td>
                  <td style={{ ...tdn, color: sobre ? C.red : x.difVsEnviado !== null && x.difVsEnviado < 0 ? C.green : C.ink, fontWeight: sobre ? 800 : 500 }}>
                    {x.difVsEnviado === null ? "—" : `${x.difVsEnviado > 0 ? "+" : ""}${fmtNum(x.difVsEnviado)}`}
                  </td>
                  <td style={{ ...tdn, color: sobre ? C.red : C.ink, fontWeight: sobre ? 800 : 500 }}>
                    {x.impactoVsEnviado === null ? "—" : `${x.impactoVsEnviado > 0 ? "+" : ""}$${fmtNum(x.impactoVsEnviado)}`}
                  </td>
                  <td style={td}>{x.digito || "—"}</td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td style={{ ...td, textAlign: "center", color: C.slate }} colSpan={12}>No hay devoluciones con ese filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 8, lineHeight: 1.5 }}>
        "Precio corregido" es el de la nueva entrada del mismo lote; si no aparece (—) todavía no se ha vuelto a entrar. "Precio enviado" es el precio teórico: si el sistema no tenía uno distinto, coincide con el precio devuelto.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginTop: 18 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Por taller</div>
          {porTaller.map((g) => (
            <div key={g.planta} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.ink }}>{g.planta}</span>
              <span style={{ color: C.slate, whiteSpace: "nowrap" }}>
                {g.total} devol. · <strong style={{ color: g.precio ? C.red : C.slate }}>{g.precio} por precio</strong> · {fmtNum(g.unidades)} und
              </span>
            </div>
          ))}
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Quién digitó la entrada devuelta por precio</div>
          {sinUsuario ? (
            <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.5 }}>
              Este dato llega al traer las entradas desde Busint (botón "Traer de Busint ahora"). Con el Excel no está disponible.
            </div>
          ) : (
            porDigitador.map(([u, n]) => (
              <div key={u} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.ink }}>{u}</span>
                <strong style={{ color: C.red }}>{n}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
// ─── DASHBOARD DE ENTREGAS ────────────────────────────────────────────────────────
// Cumplimiento = por entrega positiva (no devolución) con fecha y fecha
// comprometida: diasCumplimiento <= 0 significa que llegó a tiempo o antes;
// > 0 significa que llegó tarde. "Facturado por planta" usa directamente
// Ftpla (ya verificado que coincide con "cxp" del ERP).
function DashboardEntregasView({ cargaActiva, onSubir, isAdmin }) {
  const [subiendo, setSubiendo] = useState(false);
  const [trayendoBusint, setTrayendoBusint] = useState(false);
  const [subTab, setSubTab] = useState("resumen");
  const entradas = cargaActiva?.entradas || [];
  const meses = useMemo(
    () => [...new Set(entradas.map((e) => (e.fecha || "").slice(0, 7)).filter(Boolean))].sort().reverse(),
    [entradas]
  );
  const [mes, setMes] = useState("");
  useEffect(() => {
    if (meses.length && !meses.includes(mes)) setMes(meses[0]);
  }, [meses]);
  const delMes = useMemo(() => entradas.filter((e) => (e.fecha || "").slice(0, 7) === mes), [entradas, mes]);

  const totalUnidades = delMes.reduce((s, e) => s + e.cantidad, 0);
  const totalFacturado = delMes.reduce((s, e) => s + e.facturado, 0);
  const plantasActivas = new Set(delMes.map((e) => e.nombrePlanta)).size;
  const conCumplimiento = delMes.filter((e) => e.diasCumplimiento !== null);
  const aTiempoCount = conCumplimiento.filter((e) => e.diasCumplimiento <= 0).length;
  const pctCumplimiento = conCumplimiento.length ? Math.round((aTiempoCount / conCumplimiento.length) * 100) : null;

  const porPlanta = useMemo(() => {
    const grupos = new Map();
    delMes.forEach((e) => {
      if (!grupos.has(e.nombrePlanta)) grupos.set(e.nombrePlanta, { planta: e.nombrePlanta, entregas: 0, aTiempo: 0, tarde: 0, unidades: 0, facturado: 0 });
      const g = grupos.get(e.nombrePlanta);
      g.entregas += 1;
      g.unidades += e.cantidad;
      g.facturado += e.facturado;
      if (e.diasCumplimiento !== null) {
        if (e.diasCumplimiento <= 0) g.aTiempo += 1;
        else g.tarde += 1;
      }
    });
    return [...grupos.values()]
      .map((g) => {
        const conFecha = g.aTiempo + g.tarde;
        return { ...g, pct: conFecha ? Math.round((g.aTiempo / conFecha) * 100) : null };
      })
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.unidades - a.unidades);
  }, [delMes]);

  const porCategoria = useMemo(() => {
    const grupos = new Map();
    delMes.forEach((e) => {
      grupos.set(e.categoria, (grupos.get(e.categoria) || 0) + e.cantidad);
    });
    return [...grupos.entries()]
      .map(([categoria, unidades]) => ({ categoria, unidades }))
      .sort((a, b) => b.unidades - a.unidades);
  }, [delMes]);

  const porDia = useMemo(() => {
    const grupos = new Map();
    delMes.forEach((e) => {
      grupos.set(e.fecha, (grupos.get(e.fecha) || 0) + e.cantidad);
    });
    return [...grupos.entries()]
      .map(([fecha, unidades]) => ({ fecha, unidades }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [delMes]);
  const maxDia = Math.max(1, ...porDia.map((d) => d.unidades));

  return (
    <div>
      {subiendo && <SubirEntradasModal onConfirm={onSubir} onClose={() => setSubiendo(false)} />}
      {trayendoBusint && <TraerDeBusintModal onClose={() => setTrayendoBusint(false)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Dashboard de Entregas</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            {cargaActiva
              ? `Carga del ${cargaActiva.fecha}${cargaActiva.creadoEn ? ` · Actualizado ${fmtFechaHora(cargaActiva.creadoEn)}` : ""}${cargaActiva.subidoPor ? ` · Subido por ${cargaActiva.subidoPor}` : ""}`
              : "Aún no hay ninguna carga de Entradas de Planta — sube el Excel para ver el dashboard."}
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={() => setTrayendoBusint(true)}>🔄 Traer de Busint ahora</Btn>
            <Btn variant="secondary" onClick={() => setSubiendo(true)}>⬆ Subir Excel (respaldo)</Btn>
          </div>
        )}
      </div>
      {!cargaActiva ? (
        <div style={{ textAlign: "center", padding: 60, color: C.slate, fontSize: 13, background: C.white, borderRadius: 14, border: `1px solid ${C.border}` }}>
          Sube el archivo "ENTRADAS DE PLANTA.xlsx" para ver cumplimiento, cantidades y facturación por planta.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { id: "resumen", icon: "📊", label: "Resumen" },
              { id: "precio", icon: "🔎", label: "Verificador de Precio de Confección" },
              { id: "devoluciones", icon: "↩️", label: "Control de devoluciones" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${subTab === t.id ? C.ink : C.border}`,
                  background: subTab === t.id ? C.ink : C.white,
                  color: subTab === t.id ? C.white : C.ink,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {subTab === "precio" && <VerificadorPrecioConfeccionView entradas={entradas} />}
          {subTab === "devoluciones" && <ControlDevolucionesView entradas={entradas} />}
        </>
      )}
      {cargaActiva && subTab === "resumen" && (
        <>
          {meses.length > 1 && (
            <div style={{ marginBottom: 18 }}>
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.ink, background: C.white, fontFamily: "inherit" }}
              >
                {meses.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
            <KPI icon="📦" label="Unidades del mes" value={fmtNum(totalUnidades)} color={C.ink} bg={C.canvas} />
            <KPI icon="💰" label="Facturado del mes" value={`$${fmtNum(totalFacturado)}`} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏭" label="Plantas activas" value={fmtNum(plantasActivas)} color={C.violet} bg={C.violetBg} />
            <KPI
              icon="✓"
              label="Cumplimiento promedio"
              value={pctCumplimiento === null ? "—" : `${pctCumplimiento}%`}
              color={pctCumplimiento !== null && pctCumplimiento < 70 ? C.red : C.green}
              bg={pctCumplimiento !== null && pctCumplimiento < 70 ? C.redBg : C.greenBg}
            />
          </div>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>PLANTAS QUE MÁS CUMPLEN — FECHAS DE CONFECCIÓN</div>
            <Tabla
              vacio="Sin entregas con fecha comprometida este mes."
              columnas={[
                { key: "planta", label: "Planta" },
                { key: "entregas", label: "Entregas", align: "right", render: (f) => fmtNum(f.entregas) },
                { key: "aTiempo", label: "A tiempo / antes", align: "right", render: (f) => fmtNum(f.aTiempo) },
                { key: "tarde", label: "Tarde", align: "right", render: (f) => fmtNum(f.tarde), color: (f) => (f.tarde > 0 ? C.red : C.ink) },
                { key: "pct", label: "% Cumplimiento", align: "right", render: (f) => (f.pct === null ? "—" : `${f.pct}%`), color: (f) => (f.pct !== null && f.pct < 70 ? C.red : C.green) },
                { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
                { key: "facturado", label: "Facturado", align: "right", render: (f) => `$${fmtNum(f.facturado)}` },
              ]}
              filas={porPlanta}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>CANTIDAD POR CATEGORÍA</div>
              <Tabla
                vacio="Sin datos este mes."
                columnas={[
                  { key: "categoria", label: "Categoría" },
                  { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
                ]}
                filas={porCategoria}
              />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>CANTIDAD POR DÍA</div>
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, marginBottom: 10 }}>
                  {porDia.map((d) => (
                    <div
                      key={d.fecha}
                      title={`${fmtFechaISO(d.fecha)}: ${fmtNum(d.unidades)}`}
                      style={{ flex: 1, minWidth: 3, height: `${Math.max(4, (d.unidades / maxDia) * 100)}%`, background: C.blue, borderRadius: "3px 3px 0 0" }}
                    />
                  ))}
                  {!porDia.length && <div style={{ color: C.slate, fontSize: 13 }}>Sin datos este mes.</div>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.slate }}>
                  <span>{porDia[0] ? fmtFechaISO(porDia[0].fecha) : ""}</span>
                  <span>{porDia[porDia.length - 1] ? fmtFechaISO(porDia[porDia.length - 1].fecha) : ""}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
// ─── VERIFICADOR DE PRECIO DE CONFECCIÓN ─────────────────────────────────────────
// Busca por referencia y muestra las últimas 5 entradas con precio teórico
// (ValPlanta, fijo por referencia — se pacta al hacer la ficha técnica) vs. precio
// de entrada real (CostoFT, puede variar entrada a entrada) — para detectar cuándo
// una planta cobró distinto a lo pactado.
function VerificadorPrecioConfeccionView({ entradas }) {
  const [busqueda, setBusqueda] = useState("");
  const resultado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return entradas
      .filter((e) => (e.refExt || "").toLowerCase() === q || String(e.refN || "").toLowerCase() === q)
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
      .slice(0, 5);
  }, [entradas, busqueda]);
  const planta = resultado[0]?.nombrePlanta || null;
  return (
    <div>
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
        <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13 }}>No se encontraron entradas con esa referencia.</div>
      ) : (
        <>
          {planta && (
            <div style={{ marginBottom: 14, fontSize: 13, color: C.slate }}>
              Planta: <span style={{ fontWeight: 800, color: C.ink }}>{planta}</span>
            </div>
          )}
          <Tabla
            vacio="Sin entradas para esa referencia."
            columnas={[
              { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
              { key: "nombrePlanta", label: "Planta" },
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
// ─── ESTADÍSTICAS DE PLANTA ───────────────────────────────────────────────────────
// Dos modos: "planta" (se elige una planta y, opcionalmente, una categoría — se
// arma una tabla horizontal con los meses en columnas) y "todas" (matriz de todas
// las plantas que han entregado este año × mes, para comparar plantas entre sí).
function EstadisticasPlantaView({ cargaActiva }) {
  const entradas = cargaActiva?.entradas || [];
  const [modo, setModo] = useState("planta");
  const plantas = useMemo(
    () => [...new Set(entradas.map((e) => e.nombrePlanta).filter(Boolean))].sort(),
    [entradas]
  );
  const [planta, setPlanta] = useState("");
  useEffect(() => {
    if (plantas.length && !plantas.includes(planta)) setPlanta(plantas[0]);
  }, [plantas]);
  const categoriasDePlanta = useMemo(
    () => [...new Set(entradas.filter((e) => e.nombrePlanta === planta).map((e) => e.categoria).filter(Boolean))].sort(),
    [entradas, planta]
  );
  const [categoria, setCategoria] = useState("todas");
  useEffect(() => {
    setCategoria("todas");
  }, [planta]);

  const deLaPlanta = useMemo(
    () => entradas.filter((e) => e.nombrePlanta === planta && (categoria === "todas" || e.categoria === categoria)),
    [entradas, planta, categoria]
  );
  const meses = useMemo(
    () => [...new Set(deLaPlanta.map((e) => (e.fecha || "").slice(0, 7)).filter(Boolean))].sort(),
    [deLaPlanta]
  );
  const porMes = useMemo(() => {
    const m = {};
    meses.forEach((mes) => {
      const delMes = deLaPlanta.filter((e) => (e.fecha || "").slice(0, 7) === mes);
      const unidades = delMes.reduce((s, e) => s + e.cantidad, 0);
      const delMesTodasCategorias = entradas.filter((e) => e.nombrePlanta === planta && (e.fecha || "").slice(0, 7) === mes);
      const porCategoria = new Map();
      delMesTodasCategorias.forEach((e) => {
        porCategoria.set(e.categoria, (porCategoria.get(e.categoria) || 0) + e.cantidad);
      });
      let topCategoria = "—";
      let topUnidades = 0;
      porCategoria.forEach((u, cat) => {
        if (u > topUnidades) {
          topUnidades = u;
          topCategoria = cat;
        }
      });
      m[mes] = { unidades, topCategoria, topUnidades };
    });
    return m;
  }, [meses, deLaPlanta, entradas, planta]);
  const totalGeneral = meses.reduce((s, mes) => s + (porMes[mes]?.unidades || 0), 0);

  // (2026-10-19, a pedido de Fredy) Entregado por CATEGORÍA, todas juntas: filas = categorías,
  // columnas = meses (de la planta elegida, sin filtrar por categoría).
  const catDe = (e) => e.categoria || "Sin categoría";
  const entradasPlanta = useMemo(() => entradas.filter((e) => e.nombrePlanta === planta), [entradas, planta]);
  const mesesPlanta = useMemo(
    () => [...new Set(entradasPlanta.map((e) => (e.fecha || "").slice(0, 7)).filter(Boolean))].sort(),
    [entradasPlanta]
  );
  const filasCategoria = useMemo(() => {
    const m = new Map();
    entradasPlanta.forEach((e) => {
      const mes = (e.fecha || "").slice(0, 7);
      if (!mes) return;
      const c = catDe(e);
      if (!m.has(c)) m.set(c, { categoria: c, porMes: {}, total: 0 });
      const f = m.get(c);
      f.porMes[mes] = (f.porMes[mes] || 0) + e.cantidad;
      f.total += e.cantidad;
    });
    return [...m.values()].sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria));
  }, [entradasPlanta]);
  const totalesMesPlanta = useMemo(() => {
    const t = {};
    filasCategoria.forEach((f) => mesesPlanta.forEach((mes) => { t[mes] = (t[mes] || 0) + (f.porMes[mes] || 0); }));
    return t;
  }, [filasCategoria, mesesPlanta]);
  const totalCategorias = filasCategoria.reduce((s, f) => s + f.total, 0);

  // Modo "todas las plantas": matriz planta × mes, solo con entradas del año en
  // curso (today() ya existe en el archivo y evita líos de zona horaria).
  const anioActual = today().slice(0, 4);
  const entradasEsteAnio = useMemo(
    () => entradas.filter((e) => (e.fecha || "").slice(0, 4) === anioActual),
    [entradas, anioActual]
  );
  const [categoriaTodas, setCategoriaTodas] = useState("todas");
  const categoriasEsteAnio = useMemo(
    () => [...new Set(entradasEsteAnio.map(catDe))].sort(),
    [entradasEsteAnio]
  );
  const entradasAnioFiltro = useMemo(
    () => (categoriaTodas === "todas" ? entradasEsteAnio : entradasEsteAnio.filter((e) => catDe(e) === categoriaTodas)),
    [entradasEsteAnio, categoriaTodas]
  );
  const mesesEsteAnio = useMemo(
    () => [...new Set(entradasAnioFiltro.map((e) => (e.fecha || "").slice(0, 7)).filter(Boolean))].sort(),
    [entradasAnioFiltro]
  );
  const plantasEsteAnio = useMemo(
    () => [...new Set(entradasAnioFiltro.map((e) => e.nombrePlanta).filter(Boolean))].sort(),
    [entradasAnioFiltro]
  );
  // Planta × categoría (total del año, sin filtrar por categoría).
  const matrizPlantaCategoria = useMemo(() => {
    const m = {};
    entradasEsteAnio.forEach((e) => {
      if (!e.nombrePlanta) return;
      if (!m[e.nombrePlanta]) m[e.nombrePlanta] = {};
      const c = catDe(e);
      m[e.nombrePlanta][c] = (m[e.nombrePlanta][c] || 0) + e.cantidad;
    });
    return m;
  }, [entradasEsteAnio]);
  const matrizPlantas = useMemo(() => {
    const m = {};
    entradasAnioFiltro.forEach((e) => {
      const mes = (e.fecha || "").slice(0, 7);
      if (!mes) return;
      if (!m[e.nombrePlanta]) m[e.nombrePlanta] = {};
      m[e.nombrePlanta][mes] = (m[e.nombrePlanta][mes] || 0) + e.cantidad;
    });
    return m;
  }, [entradasAnioFiltro]);

  async function descargarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    if (modo === "planta") {
      const filas = [["Categoría", ...mesesPlanta, "Total"]];
      filasCategoria.forEach((f) => filas.push([f.categoria, ...mesesPlanta.map((mes) => f.porMes[mes] || 0), f.total]));
      filas.push(["TOTAL", ...mesesPlanta.map((mes) => totalesMesPlanta[mes] || 0), totalCategorias]);
      const ws = XLSX.utils.aoa_to_sheet(filas);
      ws["!cols"] = [{ wch: 26 }, ...mesesPlanta.map(() => ({ wch: 10 })), { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, "Por categoría");
      XLSX.writeFile(wb, `Entregado por categoría - ${String(planta).slice(0, 40).replace(/[\\/:*?"<>|]/g, "-")} ${today()}.xlsx`);
      return;
    }
    const f1 = [["Planta", ...mesesEsteAnio, "Total"]];
    plantasEsteAnio.forEach((pl) => f1.push([pl, ...mesesEsteAnio.map((mes) => matrizPlantas[pl]?.[mes] || 0), mesesEsteAnio.reduce((s, mes) => s + (matrizPlantas[pl]?.[mes] || 0), 0)]));
    const ws1 = XLSX.utils.aoa_to_sheet(f1);
    ws1["!cols"] = [{ wch: 36 }, ...mesesEsteAnio.map(() => ({ wch: 10 })), { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, categoriaTodas === "todas" ? "Planta x mes" : String(categoriaTodas).slice(0, 28).replace(/[\\/:*?\[\]]/g, "-"));
    const plantasAnio = [...new Set(entradasEsteAnio.map((e) => e.nombrePlanta).filter(Boolean))].sort();
    const f2 = [["Planta", ...categoriasEsteAnio, "Total"]];
    plantasAnio.forEach((pl) => f2.push([pl, ...categoriasEsteAnio.map((c) => matrizPlantaCategoria[pl]?.[c] || 0), categoriasEsteAnio.reduce((s, c) => s + (matrizPlantaCategoria[pl]?.[c] || 0), 0)]));
    const ws2 = XLSX.utils.aoa_to_sheet(f2);
    ws2["!cols"] = [{ wch: 36 }, ...categoriasEsteAnio.map(() => ({ wch: 14 })), { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Planta x categoría");
    XLSX.writeFile(wb, `Estadisticas de planta ${anioActual} ${today()}.xlsx`);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Estadísticas de Planta</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
          Total entregado por mes según planta — y la categoría que más entregó cada mes.
        </p>
      </div>
      {!plantas.length ? (
        <div style={{ textAlign: "center", padding: 60, color: C.slate, fontSize: 13, background: C.white, borderRadius: 14, border: `1px solid ${C.border}` }}>
          Sube el archivo de Entradas de Planta (en Dashboard de Entregas) para ver estadísticas.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { id: "planta", label: "Por planta" },
              { id: "todas", label: `Todas las plantas (${anioActual})` },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setModo(m.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${modo === m.id ? C.ink : C.border}`,
                  background: modo === m.id ? C.ink : C.white,
                  color: modo === m.id ? C.white : C.ink,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={descargarExcel}
              style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${C.blue}`, background: C.white, color: C.blue, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              📥 Descargar Excel
            </button>
          </div>
          {modo === "planta" ? (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <select
                  value={planta}
                  onChange={(e) => setPlanta(e.target.value)}
                  style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.ink, background: C.white, fontFamily: "inherit" }}
                >
                  {plantas.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.ink, background: C.white, fontFamily: "inherit" }}
                >
                  <option value="todas">Todas las categorías</option>
                  {categoriasDePlanta.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <KPI
                  icon="📦"
                  label={categoria === "todas" ? "Total entregado" : `Total entregado (${categoria})`}
                  value={fmtNum(totalGeneral)}
                  color={C.ink}
                  bg={C.canvas}
                />
              </div>
              {!meses.length ? (
                <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13, background: C.white, borderRadius: 14, border: `1px solid ${C.border}` }}>
                  Sin entregas para esta planta.
                </div>
              ) : (
                <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: C.ink, position: "sticky", top: 0 }}>
                        <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}></th>
                        {meses.map((mes) => (
                          <th key={mes} style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                            {mes}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "7px 12px", fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>
                          {categoria === "todas" ? "Unidades entregadas" : `Unidades (${categoria})`}
                        </td>
                        {meses.map((mes) => (
                          <td key={mes} style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: C.blue }}>
                            {fmtNum(porMes[mes]?.unidades || 0)}
                          </td>
                        ))}
                      </tr>
                      <tr style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "7px 12px", fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>Categoría más entregada</td>
                        {meses.map((mes) => (
                          <td key={mes} style={{ padding: "7px 12px", textAlign: "right", color: C.ink }}>
                            {porMes[mes]?.topCategoria || "—"}
                          </td>
                        ))}
                      </tr>
                      <tr style={{ background: C.canvas }}>
                        <td style={{ padding: "7px 12px", fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>Unidades de esa categoría</td>
                        {meses.map((mes) => (
                          <td key={mes} style={{ padding: "7px 12px", textAlign: "right", color: C.ink }}>
                            {fmtNum(porMes[mes]?.topUnidades || 0)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {mesesPlanta.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>Entregado por categoría</div>
                  <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Todas las categorías que entregó esta planta, mes a mes (de la que más entregó a la que menos).</div>
                  <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: C.ink }}>
                          <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Categoría</th>
                          {mesesPlanta.map((mes) => (
                            <th key={mes} style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{mes}</th>
                          ))}
                          <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasCategoria.map((f, i) => (
                          <tr key={f.categoria} onClick={() => setCategoria(categoria === f.categoria ? "todas" : f.categoria)} title="Clic para ver solo esta categoría arriba" style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                            <td style={{ padding: "7px 12px", fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>{f.categoria}</td>
                            {mesesPlanta.map((mes) => (
                              <td key={mes} style={{ padding: "7px 12px", textAlign: "right", color: C.ink, fontVariantNumeric: "tabular-nums" }}>{f.porMes[mes] ? fmtNum(f.porMes[mes]) : "—"}</td>
                            ))}
                            <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 900, color: C.blue, fontVariantNumeric: "tabular-nums" }}>{fmtNum(f.total)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: C.ink }}>
                          <td style={{ padding: "8px 12px", fontWeight: 800, color: C.seam }}>TOTAL</td>
                          {mesesPlanta.map((mes) => (
                            <td key={mes} style={{ padding: "8px 12px", textAlign: "right", fontWeight: 800, color: C.seam, fontVariantNumeric: "tabular-nums" }}>{fmtNum(totalesMesPlanta[mes] || 0)}</td>
                          ))}
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 900, color: C.seam, fontVariantNumeric: "tabular-nums" }}>{fmtNum(totalCategorias)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <select
                  value={categoriaTodas}
                  onChange={(e) => setCategoriaTodas(e.target.value)}
                  style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.ink, background: C.white, fontFamily: "inherit" }}
                >
                  <option value="todas">Todas las categorías</option>
                  {categoriasEsteAnio.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {!mesesEsteAnio.length ? (
            <div style={{ textAlign: "center", padding: 40, color: C.slate, fontSize: 13, background: C.white, borderRadius: 14, border: `1px solid ${C.border}` }}>
              Sin entregas registradas en {anioActual}.
            </div>
          ) : (
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.ink, position: "sticky", top: 0 }}>
                    <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Planta</th>
                    {mesesEsteAnio.map((mes) => (
                      <th key={mes} style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                        {mes}
                      </th>
                    ))}
                    <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {plantasEsteAnio.map((p, i) => {
                    const totalPlanta = mesesEsteAnio.reduce((s, mes) => s + (matrizPlantas[p]?.[mes] || 0), 0);
                    return (
                      <tr key={p} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "7px 12px", fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>{p}</td>
                        {mesesEsteAnio.map((mes) => (
                          <td key={mes} style={{ padding: "7px 12px", textAlign: "right", color: C.ink }}>
                            {matrizPlantas[p]?.[mes] ? fmtNum(matrizPlantas[p][mes]) : "—"}
                          </td>
                        ))}
                        <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 900, color: C.blue }}>{fmtNum(totalPlanta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
              {entradasEsteAnio.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>Planta × categoría ({anioActual})</div>
                  <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Total entregado en el año por cada planta, separado por categoría.</div>
                  <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: C.ink }}>
                          <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Planta</th>
                          {categoriasEsteAnio.map((c) => (
                            <th key={c} style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{c}</th>
                          ))}
                          <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(matrizPlantaCategoria).sort().map((pl, i) => (
                          <tr key={pl} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: "7px 12px", fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>{pl}</td>
                            {categoriasEsteAnio.map((c) => (
                              <td key={c} style={{ padding: "7px 12px", textAlign: "right", color: C.ink, fontVariantNumeric: "tabular-nums" }}>{matrizPlantaCategoria[pl][c] ? fmtNum(matrizPlantaCategoria[pl][c]) : "—"}</td>
                            ))}
                            <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 900, color: C.blue, fontVariantNumeric: "tabular-nums" }}>{fmtNum(categoriasEsteAnio.reduce((sum, c) => sum + (matrizPlantaCategoria[pl][c] || 0), 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
// ─── HOME PLANTA ────────────────────────────────────────────────────────────────
function HomePlanta({ onGoModulo }) {
  const MODULOS = [
    { id: "programacion_diaria", icon: "📅", label: "Programación Diaria", desc: "Programa lo que Planta Yanko va a entregar y revisa cumplimiento", color: C.amber, bg: C.amberBg, activo: true },
    { id: "dashboard_entregas", icon: "📊", label: "Dashboard de Entregas", desc: "Cumplimiento, cantidades por categoría y facturación por planta", color: C.blue, bg: C.blueBg, activo: true },
    { id: "nomina", icon: "🧾", label: "Nómina", desc: "Nómina de la planta propia", color: C.violet, bg: C.violetBg, activo: false },
  ];
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>🏭 Planta</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: C.slate }}>Industrias Yanko — Planta propia</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
        {MODULOS.map((m) => (
          <div
            key={m.id}
            onClick={m.activo ? () => onGoModulo(m.id) : undefined}
            style={{ background: C.white, borderRadius: 14, padding: 22, border: `1.5px solid ${m.activo ? C.border : "#EDEDF2"}`, cursor: m.activo ? "pointer" : "default", opacity: m.activo ? 1 : 0.6, transition: "all 0.2s" }}
            onMouseEnter={(e) => { if (m.activo) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = m.color; } }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = m.activo ? C.border : "#EDEDF2"; }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 12, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 14 }}>{m.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.5, marginBottom: 12 }}>{m.desc}</div>
            {m.activo ? (
              <div style={{ fontSize: 12, fontWeight: 700, color: m.color }}>Entrar →</div>
            ) : (
              <div style={{ fontSize: 11, fontWeight: 600, color: C.slate, background: "#EDEDF2", padding: "3px 10px", borderRadius: 20, display: "inline-block" }}>Próximamente</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── ROOT MÓDULO PLANTA ─────────────────────────────────────────────────────────
export default function ModuloPlanta({ currentUser, onVolver, onLogout }) {
  const [subView, setSubView] = useState("home");
  const [cargasPlaneacion, setCargasPlaneacion] = useState([]);
  const [programacion, setProgramacion] = useState([]);
  const [cargasEntradas, setCargasEntradas] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Planta lee (solo lectura) las cargas de Hoja1 que se suben desde
    // Planeación — no las modifica ni las borra, solo las usa para saber qué
    // lotes están hoy en Planta Industrias Yanko.
    const unsubCargas = onSnapshot(collection(db, "planeacion_cargas"), (snap) => {
      setCargasPlaneacion(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    const unsubProgramacion = onSnapshot(collection(db, "planta_programacion"), (snap) => {
      setProgramacion(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubEntradas = onSnapshot(collection(db, "planta_entradas_cargas"), (snap) => {
      setCargasEntradas(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => {
      unsubCargas();
      unsubProgramacion();
      unsubEntradas();
    };
  }, []);
  const cargaActiva = useMemo(() => {
    const ordenadas = [...cargasPlaneacion].sort((a, b) => (b.creadoEn || b.fecha).localeCompare(a.creadoEn || a.fecha));
    return ordenadas[0] || null;
  }, [cargasPlaneacion]);
  // Base (Excel o sync viejo) + un documento por año de Busint encima.
  const cargaEntradasActiva = useMemo(() => cargaEntradasActivaDe(cargasEntradas), [cargasEntradas]);
  // (2026-10-27, a pedido de Fredy) Correo a la lista de Planta de confección al programar, cambiar o cancelar
  // (destinatarios en Administración → Notificaciones). Si falla, la programación igual queda guardada.
  function avisarPorCorreo(tipo, items, motivo) {
    httpsCallable(functionsClient, "notificarProgramacionCorreo")({ area: "planta", tipo, items, motivo: motivo || "", programadoPor: currentUser?.name || currentUser?.username || "" })
      .then((resp) => {
        if (resp.data?.sinDestinatarios) alert("Quedó guardado, pero no salió correo: Planta de confección no tiene destinatarios (Administración → Notificaciones).");
        else if (resp.data?.ok === false) alert("Quedó guardado, pero no se pudo enviar el correo.");
      })
      .catch((err) => alert(`Quedó guardado, pero no se pudo enviar el correo: ${err?.message || err}`));
  }
  async function programarLote(lote, fechaEnviado) {
    const nuevo = {
      id: uid(),
      numLote: lote.numLote,
      referencia: lote.referencia,
      categoria: lote.categoria,
      cantidad: lote.invPlanta,
      fechaEnviado,
      estado: "pendiente",
      fechaCumplioISO: null,
      creadoEn: new Date().toISOString(),
      // (2026-10-21) prioridad con la que se programó, y de qué pedido es (para Planeación).
      numPedido: lote.numPedido ?? null,
      prioridad: lote.prioridad ?? null,
      motivo: lote.razonesTxt ?? null,
      fechaSugerida: lote.fechaSugerida ?? null,
      avisado: false, // sale en el siguiente correo automático, 7 p. m. o 10 a. m. (o al pulsar "Enviar correo del día")
      avisadoEn: null,
    };
    setProgramacion((ps) => [...ps, nuevo]);
    await fsSave("planta_programacion", nuevo.id, nuevo);
  }
  // Programa varios lotes a la vez para un mismo día (tablero semanal): un solo correo con todos.
  async function programarLotes(lotes, fechaEnviado) {
    const ahora = new Date().toISOString();
    const nuevos = lotes.map((lote) => ({
      id: uid(),
      numLote: lote.numLote,
      referencia: lote.referencia,
      categoria: lote.categoria,
      cantidad: lote.invPlanta,
      fechaEnviado,
      estado: "pendiente",
      fechaCumplioISO: null,
      creadoEn: ahora,
      numPedido: lote.numPedido ?? null,
      prioridad: lote.prioridad ?? null,
      motivo: lote.razonesTxt ?? null,
      fechaSugerida: lote.fechaSugerida ?? null,
      avisado: false, // el correo sale cuando se pulsa "Enviar correo del día"
      avisadoEn: null,
    }));
    setProgramacion((ps) => [...ps, ...nuevos]);
    await Promise.all(nuevos.map((n) => fsSave("planta_programacion", n.id, n)));
  }
  // (2026-10-28) Los correos automáticos (7 p. m. y 10 a. m.) llevan a cada lista solo lo de su área (gerencia recibe todo). Este botón
  // adelanta SOLO lo de Planta de confección de ese día (a la lista de Planta y a gerencia). Marca como avisados solo si salió.
  async function enviarCorreoDia(iso) {
    const delDia = programacion.filter((p) => p.fechaEnviado === iso && p.estado !== "cumplido");
    try {
      const resp = await httpsCallable(functionsClient, "enviarCorreoProgramacionDia")({ dia: iso, area: "planta", programadoPor: currentUser?.name || currentUser?.username || "" });
      if (resp.data?.motivo === "sin destinatarios") { alert("No salió el correo: no hay destinatarios (Administración → Notificaciones)."); return false; }
      if (resp.data?.motivo === "nada que informar") { alert("No hay nada programado para ese día."); return false; }
      if (resp.data?.enviado === false) { alert("No se pudo enviar el correo. Inténtalo de nuevo."); return false; }
    } catch (err) {
      alert(`No se pudo enviar el correo: ${err?.message || err}`);
      return false;
    }
    const ahora = new Date().toISOString();
    const porMarcar = delDia.filter((p) => p.avisado === false);
    setProgramacion((ps) => ps.map((p) => (porMarcar.some((x) => x.id === p.id) ? { ...p, avisado: true, avisadoEn: ahora } : p)));
    await Promise.all(porMarcar.map((p) => fsSave("planta_programacion", p.id, { avisado: true, avisadoEn: ahora })));
    return true;
  }
  // Vista previa: pide al servidor el correo del día tal como saldría, sin enviarlo ni marcar nada.
  async function obtenerVistaCorreoDia(iso) {
    const resp = await httpsCallable(functionsClient, "enviarCorreoProgramacionDia")({ dia: iso, area: "planta", soloVista: true, programadoPor: currentUser?.name || currentUser?.username || "" });
    return resp.data;
  }
  async function enviarCorreoTodoPendiente() {
    const dias = [...new Set(programacion.filter((p) => p.avisado === false && p.estado !== "cumplido" && p.fechaEnviado).map((p) => p.fechaEnviado))].sort();
    for (const iso of dias) {
      const ok = await enviarCorreoDia(iso);
      if (!ok) break;
    }
  }
  async function cancelarProgramacion(id) {
    const fila = programacion.find((p) => p.id === id);
    if (fila && fila.avisado === false) {
      // Nunca se avisó por correo: se quita sin motivo ni correo.
      setProgramacion((ps) => ps.filter((p) => p.id !== id));
      await fsDelete("planta_programacion", id);
      return;
    }
    const motivo = await pedirMotivoIncumplimiento({ area: "planta", titulo: `¿Por qué se quita${fila ? ` el lote ${fila.numLote}` : " el lote"} de la programación?`, detalle: fila ? `${fila.referencia || ""}${fila.numPedido ? ` · Pedido ${fila.numPedido}` : ""}` : "" });
    if (!motivo || !motivo.trim()) return;
    setProgramacion((ps) => ps.filter((p) => p.id !== id));
    await fsDelete("planta_programacion", id);
    if (fila) registrarIncumplimiento({ area: "planta", areaNombre: "Planta de confección", accion: "quitado", motivo: motivo.trim(), numLote: fila.numLote, numPedido: fila.numPedido ?? null, referencia: fila.referencia || "", cantidad: fila.cantidad ?? null, fechaAntes: fila.fechaEnviado || "", fechaNueva: "", por: currentUser?.name || currentUser?.username || "" });
    if (fila) avisarPorCorreo("cancelada", [{ numLote: fila.numLote, referencia: fila.referencia, cantidad: fila.cantidad, numPedido: fila.numPedido ?? "", prioridad: NIVELES_PRIO[fila.prioridad]?.txt || "", fecha: fila.fechaEnviado }], motivo.trim());
  }
  async function editarFechaProgramacion(id, nuevaFecha, motivo) {
    const fila = programacion.find((p) => p.id === id);
    setProgramacion((ps) => ps.map((p) => (p.id === id ? { ...p, fechaEnviado: nuevaFecha } : p)));
    await fsSave("planta_programacion", id, { fechaEnviado: nuevaFecha });
    if (fila && fila.avisado !== false && fila.fechaEnviado !== nuevaFecha) {
      if (motivo) registrarIncumplimiento({ area: "planta", areaNombre: "Planta de confección", accion: "cambiado", motivo, numLote: fila.numLote, numPedido: fila.numPedido ?? null, referencia: fila.referencia || "", cantidad: fila.cantidad ?? null, fechaAntes: fila.fechaEnviado || "", fechaNueva: nuevaFecha, por: currentUser?.name || currentUser?.username || "" });
      avisarPorCorreo("cambio", [{ numLote: fila.numLote, referencia: fila.referencia, cantidad: fila.cantidad, numPedido: fila.numPedido ?? "", prioridad: NIVELES_PRIO[fila.prioridad]?.txt || "", fecha: nuevaFecha, antes: { fecha: fila.fechaEnviado } }], motivo);
    }
  }
  // Cada Excel "ENTRADAS DE PLANTA" que se sube es una carga completa nueva;
  // igual que en Planeación con Hoja1, se guarda como un documento nuevo y el
  // dashboard siempre usa la carga más reciente (cargaEntradasActiva).
  async function agregarCargaEntradas(entradas) {
    const nueva = {
      id: uid(),
      fecha: today(),
      creadoEn: new Date().toISOString(),
      subidoPor: currentUser?.name || "—",
      entradas,
    };
    setCargasEntradas((cs) => [...cs, nueva]);
    await fsSave("planta_entradas_cargas", nueva.id, nueva);
  }
  // Revisión automática de cumplimiento: cada vez que cambia la carga activa
  // (nueva Hoja1 subida en Planeación) o la lista de programados, si un lote
  // programado como "pendiente" ya no aparece en Planta Industrias Yanko en
  // la carga más reciente, se marca "cumplido" con la fecha de esa carga.
  // Mismo ajuste que en lotesEnPlantaYanko más arriba: se usa "ubicacionActual"
  // en vez de "invPlanta > 0" a secas, porque Busint puede dejar unidades sin
  // limpiar en la columna de Planta aunque el lote ya esté en Semiterminado o
  // BPT — con el chequeo viejo, esos lotes nunca se marcaban "cumplido" y se
  // quedaban VENCIDOS para siempre en Programación Diaria aunque ya hubieran
  // salido de Planta hacía días (caso real: lote 7120, confirmado con el
  // buscador de lote de Planeación mostrando "Semiterminado" con la carga ya
  // actualizada).
  useEffect(() => {
    if (!cargaActiva) return;
    const enPlantaSet = new Set(
      (cargaActiva.lotes || []).filter((l) => l.nombrePlanta === PLANTA_YANKO && (l.ubicacionActual ? l.ubicacionActual === "Planta" : l.invPlanta > 0)).map((l) => l.numLote)
    );
    const aCumplir = programacion.filter((p) => p.estado !== "cumplido" && !enPlantaSet.has(p.numLote));
    if (!aCumplir.length) return;
    aCumplir.forEach(async (p) => {
      const patch = { estado: "cumplido", fechaCumplioISO: cargaActiva.fecha, cargaCumplioId: cargaActiva.id };
      setProgramacion((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
      await fsSave("planta_programacion", p.id, patch);
    });
  }, [cargaActiva, programacion]);
  const isAdmin = currentUser?.isAdmin;
  const NAV = [
    { id: "home", icon: "◉", label: "Inicio" },
    { id: "programacion_diaria", icon: "📅", label: "Programación Diaria" },
    { id: "dashboard_entregas", icon: "📊", label: "Dashboard de Entregas" },
    { id: "estadisticas_planta", icon: "📈", label: "Estadísticas de Planta" },
  ];
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏭</div>
          <div style={{ color: C.slate }}>Cargando Planta...</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ width: 220, background: C.ink, padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>🏭 Planta</div>
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>Industrias Yanko</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#2A2A45", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${C.seam},#9E8870)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.ink, flexShrink: 0 }}>
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
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: active ? "#C8B8A2" : "transparent", color: active ? C.ink : "#8888AA", fontWeight: active ? 800 : 500, fontSize: 13, textAlign: "left" }}
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
          {subView === "home" && <HomePlanta onGoModulo={(id) => setSubView(id)} />}
          {subView === "programacion_diaria" && (
            <ProgramacionDiariaView
              cargaActiva={cargaActiva}
              programacion={programacion}
              onProgramar={programarLote}
              onProgramarVarios={programarLotes}
              onEnviarDia={enviarCorreoDia}
              onEnviarTodo={enviarCorreoTodoPendiente}
              onVistaDia={obtenerVistaCorreoDia}
              onCancelar={cancelarProgramacion}
              onEditarFecha={editarFechaProgramacion}
              isAdmin={isAdmin}
            />
          )}
          {subView === "dashboard_entregas" && (
            <DashboardEntregasView
              cargaActiva={cargaEntradasActiva}
              onSubir={agregarCargaEntradas}
              isAdmin={isAdmin}
            />
          )}
          {subView === "estadisticas_planta" && (
            <EstadisticasPlantaView cargaActiva={cargaEntradasActiva} />
          )}
        </div>
      </div>
    </div>
  );
}
