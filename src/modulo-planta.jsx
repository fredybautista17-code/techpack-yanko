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
  const [fecha, setFecha] = useState(today());
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
// ─── PROGRAMACIÓN DIARIA ─────────────────────────────────────────────────────────
function ProgramacionDiariaView({ cargaActiva, programacion, onProgramar, onCancelar, isAdmin }) {
  const [programando, setProgramando] = useState(null);
  const [subTab, setSubTab] = useState("pendientes");
  const lotesEnPlantaYanko = useMemo(
    () => (cargaActiva?.lotes || []).filter((l) => l.nombrePlanta === PLANTA_YANKO && l.invPlanta > 0),
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
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Programación Diaria — Planta Yanko</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
          {cargaActiva
            ? `Datos de Planeación · Carga del ${cargaActiva.fecha}${cargaActiva.creadoEn ? ` · Actualizado ${fmtFechaHora(cargaActiva.creadoEn)}` : ""}`
            : "Aún no hay ninguna carga de Hoja1 en Planeación — sube una allí para ver qué hay en Planta Yanko."}
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        <KPI icon="🏭" label="En Planta Yanko (hoy)" value={fmtNum(lotesEnPlantaYanko.length)} color={C.ink} bg={C.canvas} />
        <KPI icon="📅" label="Programados pendientes" value={fmtNum(pendientes.length)} color={C.blue} bg={C.blueBg} />
        <KPI icon="⚠" label="Vencidos" value={fmtNum(vencidosCount)} color={C.red} bg={C.redBg} />
        <KPI icon="✓" label="Cumplidos (histórico)" value={fmtNum(cumplidos.length)} color={C.green} bg={C.greenBg} />
      </div>
      {sinProgramar.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>EN PLANTA YANKO SIN PROGRAMAR</div>
          <Tabla
            vacio="Todo lo que está en Planta Yanko ya tiene una fecha programada."
            columnas={[
              { key: "numLote", label: "Num Lote" },
              { key: "numPedido", label: "Num Pedido" },
              { key: "referencia", label: "Referencia" },
              { key: "categoria", label: "Categoría" },
              { key: "invPlanta", label: "Cantidad", align: "right", render: (f) => fmtNum(f.invPlanta) },
              { key: "fechaEntregaPedidoISO", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedidoISO) || "—" },
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
            filas={sinProgramar}
          />
        </div>
      )}
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
            ...(isAdmin
              ? [{
                  key: "accion",
                  label: "",
                  render: (f) => (
                    <button
                      onClick={() => onCancelar(f.id)}
                      title="Cancelar programación"
                      style={{ background: C.redBg, border: "none", borderRadius: 6, padding: "4px 8px", color: C.red, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  ),
                }]
              : []),
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
      nPedido: row["Nped"] ?? null,
      diasCumplimiento,
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
// ─── DASHBOARD DE ENTREGAS ────────────────────────────────────────────────────────
// Cumplimiento = por entrega positiva (no devolución) con fecha y fecha
// comprometida: diasCumplimiento <= 0 significa que llegó a tiempo o antes;
// > 0 significa que llegó tarde. "Facturado por planta" usa directamente
// Ftpla (ya verificado que coincide con "cxp" del ERP).
function DashboardEntregasView({ cargaActiva, onSubir, isAdmin }) {
  const [subiendo, setSubiendo] = useState(false);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Dashboard de Entregas</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            {cargaActiva
              ? `Carga del ${cargaActiva.fecha}${cargaActiva.creadoEn ? ` · Actualizado ${fmtFechaHora(cargaActiva.creadoEn)}` : ""}`
              : "Aún no hay ninguna carga de Entradas de Planta — sube el Excel para ver el dashboard."}
          </p>
        </div>
        {isAdmin && <Btn onClick={() => setSubiendo(true)}>⬆ Subir Entradas de Planta</Btn>}
      </div>
      {!cargaActiva ? (
        <div style={{ textAlign: "center", padding: 60, color: C.slate, fontSize: 13, background: C.white, borderRadius: 14, border: `1px solid ${C.border}` }}>
          Sube el archivo "ENTRADAS DE PLANTA.xlsx" para ver cumplimiento, cantidades y facturación por planta.
        </div>
      ) : (
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
  const cargaEntradasActiva = useMemo(() => {
    const ordenadas = [...cargasEntradas].sort((a, b) => (b.creadoEn || b.fecha).localeCompare(a.creadoEn || a.fecha));
    return ordenadas[0] || null;
  }, [cargasEntradas]);
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
    };
    setProgramacion((ps) => [...ps, nuevo]);
    await fsSave("planta_programacion", nuevo.id, nuevo);
  }
  async function cancelarProgramacion(id) {
    setProgramacion((ps) => ps.filter((p) => p.id !== id));
    await fsDelete("planta_programacion", id);
  }
  // Cada Excel "ENTRADAS DE PLANTA" que se sube es una carga completa nueva;
  // igual que en Planeación con Hoja1, se guarda como un documento nuevo y el
  // dashboard siempre usa la carga más reciente (cargaEntradasActiva).
  async function agregarCargaEntradas(entradas) {
    const nueva = {
      id: uid(),
      fecha: today(),
      creadoEn: new Date().toISOString(),
      entradas,
    };
    setCargasEntradas((cs) => [...cs, nueva]);
    await fsSave("planta_entradas_cargas", nueva.id, nueva);
  }
  // Revisión automática de cumplimiento: cada vez que cambia la carga activa
  // (nueva Hoja1 subida en Planeación) o la lista de programados, si un lote
  // programado como "pendiente" ya no aparece en Planta Industrias Yanko en
  // la carga más reciente, se marca "cumplido" con la fecha de esa carga.
  useEffect(() => {
    if (!cargaActiva) return;
    const enPlantaSet = new Set(
      (cargaActiva.lotes || []).filter((l) => l.nombrePlanta === PLANTA_YANKO && l.invPlanta > 0).map((l) => l.numLote)
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
              onCancelar={cancelarProgramacion}
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
        </div>
      </div>
    </div>
  );
}

