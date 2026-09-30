import { useState, useEffect, useRef, Fragment } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
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
function ultimoDiaMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function proximosMeses(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const mm = d.getMonth() + 1 + i;
    const y = d.getFullYear() + Math.floor((mm - 1) / 12);
    const m = ((mm - 1) % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}
function fmtCOP(n) {
  return `$${Number(Math.round(n || 0)).toLocaleString("es-CO")}`;
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-CO");
}
function mesLabel(m, a) {
  return new Date(a, m - 1, 1).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
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
function Avatar({ name, size = 30 }) {
  const cols = [C.violet, C.green, C.amber, C.red, C.blue];
  const bg = cols[(name || "?").charCodeAt(0) % cols.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {(name || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()}
    </div>
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
function FInput({ value, onChange, placeholder, type = "text", icon }) {
  const input = (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: icon ? "9px 12px 9px 32px" : "9px 12px",
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
  // (2026-09-26, a pedido de Fredy) `icon` opcional -- para el buscador de
  // Cuentas por Pagar se pasa "🔍" y se pinta a la izquierda, dentro del
  // cuadro. Sin `icon` queda igual que antes.
  if (!icon) return input;
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.55, pointerEvents: "none" }}>{icon}</span>
      {input}
    </div>
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
        <option key={o.value || o} value={o.value || o}>
          {o.label || o}
        </option>
      ))}
    </select>
  );
}
function Modal({ title, onClose, children, width = 560 }) {
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
          background: C.white,
          borderRadius: 14,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(26,26,46,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>
            {title}
          </span>
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
        <div style={{ padding: 24, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
function KPI({ icon, label, value, color, bg, sub }) {
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
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>
        {value}
      </div>
      <div
        style={{ fontSize: 11, color: C.slate, marginTop: 4, fontWeight: 600 }}
      >
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
// ─── CATEGORÍAS POR DEFECTO ───────────────────────────────────────────────────
const CATS_INGRESO = [
  "Anticipo Nómina",
  "Anticipo Insumos",
  "Anticipo Tela",
  "Anticipo Maquinaria",
];
const CATS_EGRESO = [
  "Nómina",
  "Materia prima",
  "Servicios públicos",
  "Arriendo",
  "Transporte",
  "Impuestos",
  "Préstamos pagados",
  "Gastos administrativos",
  "Otros egresos",
];
// ─── NUEVO MOVIMIENTO MODAL ───────────────────────────────────────────────────
function NuevoMovimientoModal({ tipo, onSave, onClose, clientesDiseno, rubros }) {
  const [form, setForm] = useState({
    fecha: today(),
    categoria: "",
    descripcion: "",
    valor: "",
    referencia: "",
    proveedor: "",
  });
  // Distribución del ingreso entre rubros (opcional). Lo que no se reparta
  // queda como "disponible" — caja libre, no comprometida a ningún gasto.
  const [distribucion, setDistribucion] = useState([]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const cats = tipo === "ingreso" ? CATS_INGRESO : CATS_EGRESO;
  const esIngreso = tipo === "ingreso";
  const valorNum = parseFloat(form.valor) || 0;
  const distribuido = distribucion.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
  const disponible = valorNum - distribuido;
  function agregarFilaDistribucion() {
    setDistribucion((d) => [...d, { codConcep: "", concepto: "", monto: "" }]);
  }
  function actualizarFilaDistribucion(i, patch) {
    setDistribucion((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function quitarFilaDistribucion(i) {
    setDistribucion((d) => d.filter((_, idx) => idx !== i));
  }
  function save() {
    if (!form.fecha || !form.categoria || !form.valor) return;
    if (esIngreso && distribuido > valorNum) return;
    onSave({
      id: uid(),
      tipo,
      fecha: form.fecha,
      categoria: form.categoria,
      descripcion: form.descripcion,
      valor: valorNum,
      referencia: form.referencia,
      proveedor: form.proveedor,
      ...(esIngreso
        ? {
            cliente: form.proveedor,
            distribucion: distribucion
              .filter((d) => d.codConcep && (parseFloat(d.monto) || 0) > 0)
              .map((d) => ({ codConcep: d.codConcep, concepto: d.concepto, fecha: form.fecha, monto: parseFloat(d.monto) || 0 })),
          }
        : {}),
      creadoEn: new Date().toISOString(),
    });
    onClose();
  }
  return (
    <Modal
      title={esIngreso ? "Nuevo Ingreso" : "Nuevo Egreso"}
      onClose={onClose}
      width={500}
    >
      <div
        style={{
          padding: "10px 14px",
          background: esIngreso ? C.greenBg : C.redBg,
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 13,
          fontWeight: 700,
          color: esIngreso ? C.green : C.red,
        }}
      >
        {esIngreso
          ? "💵 Registrar entrada de dinero"
          : "💸 Registrar salida de dinero"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Fecha">
          <FInput type="date" value={form.fecha} onChange={set("fecha")} />
        </Field>
        <Field label="Valor $">
          <FInput
            type="number"
            value={form.valor}
            onChange={set("valor")}
            placeholder="Ej: 500000"
          />
        </Field>
      </div>
      <Field label="Categoría">
        <FSel
          value={form.categoria}
          onChange={set("categoria")}
          options={cats}
        />
      </Field>
      <Field label="Descripción">
        <FInput
          value={form.descripcion}
          onChange={set("descripcion")}
          placeholder="Descripción del movimiento"
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label={esIngreso ? "Cliente" : "Proveedor / Destino"}>
          {esIngreso ? (
            <FSel
              value={form.proveedor}
              onChange={set("proveedor")}
              options={(clientesDiseno || []).map((c) => c.nombre)}
            />
          ) : (
            <FInput
              value={form.proveedor}
              onChange={set("proveedor")}
              placeholder="Nombre proveedor"
            />
          )}
        </Field>
        <Field label="N° Referencia / Factura">
          <FInput
            value={form.referencia}
            onChange={set("referencia")}
            placeholder="Ej: FAC-001"
          />
        </Field>
      </div>
      {esIngreso && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.slate,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Distribución por rubro (opcional)
            </label>
            <button
              onClick={agregarFilaDistribucion}
              style={{
                background: "none",
                border: `1px solid ${C.blue}`,
                borderRadius: 6,
                padding: "3px 10px",
                color: C.blue,
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              + Agregar rubro
            </button>
          </div>
          {distribucion.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {distribucion.map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={row.codConcep}
                    onChange={(e) => {
                      const r = (rubros || []).find((x) => x.codConcep === e.target.value);
                      actualizarFilaDistribucion(i, { codConcep: e.target.value, concepto: r?.concepto || "" });
                    }}
                    style={{
                      flex: 1,
                      padding: "7px 10px",
                      border: `1.5px solid ${C.border}`,
                      borderRadius: 8,
                      fontSize: 13,
                      color: C.ink,
                      background: C.white,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  >
                    <option value="">— Rubro —</option>
                    {(rubros || []).map((r) => (
                      <option key={r.codConcep} value={r.codConcep}>
                        {r.concepto}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={row.monto}
                    onChange={(e) => actualizarFilaDistribucion(i, { monto: e.target.value })}
                    placeholder="Monto"
                    style={{
                      width: 140,
                      padding: "7px 10px",
                      border: `1.5px solid ${C.border}`,
                      borderRadius: 8,
                      fontSize: 13,
                      color: C.ink,
                      background: C.white,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={() => quitarFilaDistribucion(i)}
                    style={{
                      background: C.redBg,
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 9px",
                      color: C.red,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: disponible < 0 ? C.redBg : C.greenBg,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              color: disponible < 0 ? C.red : C.green,
            }}
          >
            <span>Disponible (sin asignar a rubro)</span>
            <span>{fmtCOP(disponible)}</span>
          </div>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: 8,
        }}
      >
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn
          variant={esIngreso ? "success" : "danger"}
          onClick={save}
          disabled={!form.fecha || !form.categoria || !form.valor || (esIngreso && disponible < 0)}
        >
          {esIngreso ? "+ Registrar Ingreso" : "- Registrar Egreso"}
        </Btn>
      </div>
    </Modal>
  );
}
// ─── ASIGNAR POR RUBRO (POST-INGRESO) ─────────────────────────────────────────
// Permite, desde la tabla de Flujo de Caja, ir repartiendo un abono ya
// registrado entre los rubros donde efectivamente se gastó — sin tener que
// hacerlo todo en el momento de crear el ingreso. Cada línea lleva su propia
// fecha, siempre dentro del mes en que quedó registrado el abono.
function AsignarRubroModal({ movimiento, rubros, onUpdate, onClose }) {
  const mes = movimiento.fecha?.slice(0, 7) || today().slice(0, 7);
  const minFecha = `${mes}-01`;
  const maxFecha = `${mes}-${String(ultimoDiaMes(mes)).padStart(2, "0")}`;
  const [lineas, setLineas] = useState(
    (movimiento.distribucion || []).map((d) => ({
      codConcep: d.codConcep,
      concepto: d.concepto,
      fecha: d.fecha && d.fecha.slice(0, 7) === mes ? d.fecha : movimiento.fecha,
      monto: d.monto,
    }))
  );
  const asignado = lineas.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0);
  const disponible = movimiento.valor - asignado;
  function agregarLinea() {
    setLineas((ls) => [...ls, { codConcep: "", concepto: "", fecha: movimiento.fecha, monto: "" }]);
  }
  function actualizarLinea(i, patch) {
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function quitarLinea(i) {
    setLineas((ls) => ls.filter((_, idx) => idx !== i));
  }
  function guardar() {
    const limpio = lineas
      .filter((l) => l.codConcep && (parseFloat(l.monto) || 0) > 0)
      .map((l) => ({ codConcep: l.codConcep, concepto: l.concepto, fecha: l.fecha || movimiento.fecha, monto: parseFloat(l.monto) || 0 }));
    onUpdate(movimiento.id, limpio);
    onClose();
  }
  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const rows = [
      {
        Código: "",
        Concepto: "ABONO INICIAL",
        Fecha: movimiento.fecha,
        Valor: movimiento.valor,
      },
      ...lineas
        .filter((l) => l.codConcep)
        .map((l) => ({
          Código: l.codConcep,
          Concepto: l.concepto,
          Fecha: l.fecha,
          Valor: parseFloat(l.monto) || 0,
        })),
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Distribución");
    XLSX.writeFile(wb, `distribucion_${(movimiento.proveedor || "abono").replace(/\s+/g, "_")}_${mes}.xlsx`);
  }
  return (
    <Modal title="Asignar por rubro" onClose={onClose} width={700}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10,
          padding: "12px 14px",
          background: C.blueBg,
          borderRadius: 8,
          marginBottom: 18,
          fontSize: 12,
          color: C.blue,
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Cliente</div>
          <div>{movimiento.proveedor || "—"}</div>
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>Abono total</div>
          <div>{fmtCOP(movimiento.valor)}</div>
        </div>
        <div>
          <div style={{ fontWeight: 700 }}>Disponible</div>
          <div style={{ color: disponible < 0 ? C.red : C.blue, fontWeight: 700 }}>{fmtCOP(disponible)}</div>
        </div>
      </div>
      {lineas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={l.codConcep}
                onChange={(e) => {
                  const r = (rubros || []).find((x) => x.codConcep === e.target.value);
                  actualizarLinea(i, { codConcep: e.target.value, concepto: r?.concepto || "" });
                }}
                style={{
                  flex: 2,
                  padding: "7px 10px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  color: C.ink,
                  background: C.white,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              >
                <option value="">— Rubro —</option>
                {(rubros || []).map((r) => (
                  <option key={r.codConcep} value={r.codConcep}>
                    {r.concepto}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={l.fecha || ""}
                min={minFecha}
                max={maxFecha}
                onChange={(e) => actualizarLinea(i, { fecha: e.target.value })}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  color: C.ink,
                  background: C.white,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <input
                type="number"
                value={l.monto}
                onChange={(e) => actualizarLinea(i, { monto: e.target.value })}
                placeholder="Monto"
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  color: C.ink,
                  background: C.white,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => quitarLinea(i)}
                style={{
                  background: C.redBg,
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 9px",
                  color: C.red,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={agregarLinea}
        style={{
          background: "none",
          border: `1px solid ${C.blue}`,
          borderRadius: 6,
          padding: "5px 12px",
          color: C.blue,
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          marginBottom: 18,
        }}
      >
        + Agregar línea
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={exportarExcel}
          disabled={!lineas.length}
          style={{
            background: C.canvas,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "8px 14px",
            color: C.ink,
            fontWeight: 700,
            fontSize: 12,
            cursor: lineas.length ? "pointer" : "not-allowed",
            opacity: lineas.length ? 1 : 0.5,
          }}
        >
          📤 Exportar a Excel
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>
            Cancelar
          </Btn>
          <Btn variant="danger" onClick={guardar} disabled={disponible < 0}>
            Guardar
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
// ─── IMPORTAR EGRESOS DESDE EXCEL ─────────────────────────────────────────────
// Lee la primera hoja de un archivo .xlsx/.xls y detecta columnas por nombre
// de encabezado (Fecha, Categoría, Descripción, Valor, Proveedor, Referencia),
// sin importar mayúsculas/tildes ni el orden en que vengan. Filas sin valor,
// categoría ni descripción se descartan por vacías.
function normalizarEncabezado(k) {
  return String(k)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
function excelValorAFecha(val) {
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val || "").trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return s;
}
function excelValorANumero(val) {
  if (typeof val === "number") return val;
  const s = String(val || "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const normalizado = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,/g, "");
  return parseFloat(normalizado) || 0;
}
async function parseExcelEgresos(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
  const out = [];
  rows.forEach((row) => {
    const map = {};
    Object.keys(row).forEach((k) => {
      map[normalizarEncabezado(k)] = row[k];
    });
    const fechaRaw = map["fecha"] ?? map["date"] ?? "";
    const categoria = map["categoria"] ?? map["concepto"] ?? map["tipo"] ?? "";
    const descripcion = map["descripcion"] ?? map["detalle"] ?? map["observacion"] ?? map["observaciones"] ?? "";
    const valorRaw = map["valor"] ?? map["monto"] ?? map["total"] ?? map["importe"] ?? "";
    const proveedor = map["proveedor"] ?? map["beneficiario"] ?? map["destino"] ?? map["tercero"] ?? "";
    const referencia = map["referencia"] ?? map["factura"] ?? map["no factura"] ?? map["numero"] ?? map["no"] ?? map["no."] ?? "";
    const valor = excelValorANumero(valorRaw);
    if (!valor && !categoria && !descripcion) return;
    out.push({
      fecha: excelValorAFecha(fechaRaw) || today(),
      categoria: String(categoria || "Otros egresos").trim(),
      descripcion: String(descripcion || "").trim(),
      valor,
      proveedor: String(proveedor || "").trim(),
      referencia: String(referencia || "").trim(),
      incluir: true,
    });
  });
  return out;
}
function ImportarExcelModal({ onSave, onClose }) {
  const [paso, setPaso] = useState(1);
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setError("");
    setCargando(true);
    try {
      const parsed = await parseExcelEgresos(f);
      if (!parsed.length) {
        setError("No se encontraron filas válidas. Revisa que la primera fila tenga encabezados como Fecha, Valor, Categoría.");
      } else {
        setFilas(parsed);
        setPaso(2);
      }
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx o .xls).");
    }
    setCargando(false);
  }
  function toggleFila(i) {
    setFilas((fs) => fs.map((f, idx) => (idx === i ? { ...f, incluir: !f.incluir } : f)));
  }
  function confirmar() {
    filas.filter((f) => f.incluir).forEach((f) => {
      onSave({
        id: uid(),
        tipo: "egreso",
        fecha: f.fecha,
        categoria: f.categoria,
        descripcion: f.descripcion,
        valor: f.valor,
        referencia: f.referencia,
        proveedor: f.proveedor,
        creadoEn: new Date().toISOString(),
      });
    });
    onClose();
  }
  const seleccionadas = filas.filter((f) => f.incluir).length;
  return (
    <Modal title="Importar egresos desde Excel" onClose={onClose} width={760}>
      {paso === 1 && (
        <div>
          <div
            style={{
              padding: "12px 14px",
              background: C.blueBg,
              borderRadius: 8,
              marginBottom: 18,
              fontSize: 13,
              color: C.blue,
              lineHeight: 1.5,
            }}
          >
            Sube un archivo Excel (.xlsx o .xls) con tus egresos. La primera fila debe tener encabezados de columna — por ejemplo <strong>Fecha, Categoría, Descripción, Valor, Proveedor, Referencia</strong>. No importa el orden ni si faltan tildes; el sistema los detecta automáticamente.
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={cargando}
            style={{
              width: "100%",
              padding: "9px 12px",
              border: `1.5px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 14,
              color: C.ink,
              background: C.white,
              fontFamily: "inherit",
            }}
          />
          {cargando && <div style={{ fontSize: 13, color: C.slate, marginTop: 10 }}>Leyendo archivo...</div>}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: C.redBg,
                borderRadius: 8,
                fontSize: 13,
                color: C.red,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <Btn variant="secondary" onClick={onClose}>
              Cancelar
            </Btn>
          </div>
        </div>
      )}
      {paso === 2 && (
        <div>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>
            Se encontraron <strong>{filas.length}</strong> fila{filas.length !== 1 ? "s" : ""}. Desmarca las que no quieras importar.
          </div>
          <div
            style={{
              maxHeight: 360,
              overflowY: "auto",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink, position: "sticky", top: 0 }}>
                  {["", "Fecha", "Categoría", "Descripción", "Proveedor", "Valor"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
                        color: C.seam,
                        textAlign: "left",
                        fontWeight: 700,
                        fontSize: 10,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr
                    key={i}
                    style={{
                      background: f.incluir ? C.white : C.canvas,
                      opacity: f.incluir ? 1 : 0.5,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <td style={{ padding: "6px 10px" }}>
                      <input type="checkbox" checked={f.incluir} onChange={() => toggleFila(i)} />
                    </td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{f.fecha}</td>
                    <td style={{ padding: "6px 10px" }}>{f.categoria}</td>
                    <td style={{ padding: "6px 10px" }}>{f.descripcion || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{f.proveedor || "—"}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: C.red, whiteSpace: "nowrap" }}>
                      {fmtCOP(f.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Btn variant="secondary" onClick={() => { setPaso(1); setFilas([]); }}>
              ← Volver
            </Btn>
            <Btn variant="danger" onClick={confirmar} disabled={!seleccionadas}>
              Importar {seleccionadas} egreso{seleccionadas !== 1 ? "s" : ""}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
// ─── IMPORTAR COMPRAS BUSINT (COMPARATIVO POR CONCEPTO) ───────────────────────
// A diferencia de los egresos manuales, un export de Busint trae MUCHAS filas
// (una por factura) repitiendo el mismo concepto varias veces dentro del mismo
// mes. Aquí se agrupan y se suman por Código de Concepto + Mes usando la
// columna Vbruto (valor bruto, antes de IVA/retenciones), que es la que pidió
// el usuario para el comparativo — no "Total".
function fmtMesLargo(mes) {
  if (!mes) return "";
  return new Date(mes + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}
function fmtMesCorto(mes) {
  if (!mes) return "";
  return new Date(mes + "-02").toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}
async function parseBusintCompras(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
  const grupos = {};
  rows.forEach((row) => {
    const map = {};
    Object.keys(row).forEach((k) => {
      map[normalizarEncabezado(k)] = row[k];
    });
    const codConcep = String(map["codconcep"] ?? "").trim();
    const concepto = String(map["concepto"] ?? "").trim();
    if (!codConcep && !concepto) return;
    const fechaRaw = map["fechaini"] ?? map["fecha"] ?? "";
    const fecha = excelValorAFecha(fechaRaw);
    const mes = fecha ? fecha.slice(0, 7) : "";
    if (!mes) return;
    const vbruto = excelValorANumero(map["vbruto"] ?? "");
    const key = `${mes}__${codConcep}__${concepto}`;
    if (!grupos[key]) {
      grupos[key] = { mes, codConcep, concepto, valor: 0, entradas: 0 };
    }
    grupos[key].valor += vbruto;
    grupos[key].entradas += 1;
  });
  return Object.values(grupos).sort((a, b) => b.valor - a.valor);
}
function ImportarBusintModal({ comprasExistentes, onConfirm, onClose }) {
  const [paso, setPaso] = useState(1);
  const [grupos, setGrupos] = useState([]);
  const [reemplazar, setReemplazar] = useState({});
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setError("");
    setCargando(true);
    try {
      const parsed = await parseBusintCompras(f);
      if (!parsed.length) {
        setError("No se encontraron filas válidas. Verifica que el archivo tenga las columnas CodConcep, Concepto, Fechaini y Vbruto (export de Busint).");
      } else {
        setGrupos(parsed.map((g) => ({ ...g, incluir: true })));
        const mesesPresentes = [...new Set(parsed.map((g) => g.mes))];
        const init = {};
        mesesPresentes.forEach((m) => {
          init[m] = comprasExistentes.some((c) => c.mes === m);
        });
        setReemplazar(init);
        setPaso(2);
      }
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx o .xls) exportado de Busint.");
    }
    setCargando(false);
  }
  function toggleGrupo(i) {
    setGrupos((gs) => gs.map((g, idx) => (idx === i ? { ...g, incluir: !g.incluir } : g)));
  }
  const mesesPresentes = [...new Set(grupos.map((g) => g.mes))].sort();
  const seleccionados = grupos.filter((g) => g.incluir);
  const totalSeleccionado = seleccionados.reduce((s, g) => s + g.valor, 0);
  function confirmar() {
    onConfirm(
      seleccionados.map((g) => ({
        id: uid(),
        mes: g.mes,
        codConcep: g.codConcep,
        concepto: g.concepto,
        valor: g.valor,
        entradas: g.entradas,
        creadoEn: new Date().toISOString(),
      })),
      reemplazar
    );
    onClose();
  }
  return (
    <Modal title="Importar compras Busint" onClose={onClose} width={860}>
      {paso === 1 && (
        <div>
          <div
            style={{
              padding: "12px 14px",
              background: C.blueBg,
              borderRadius: 8,
              marginBottom: 18,
              fontSize: 13,
              color: C.blue,
              lineHeight: 1.5,
            }}
          >
            Sube el export de Busint del mes (.xlsx). El sistema agrupa automáticamente todas las filas repetidas por <strong>Código de Concepto</strong> y las suma usando la columna <strong>Vbruto</strong>, dentro del mes de cada fecha.
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={cargando}
            style={{
              width: "100%",
              padding: "9px 12px",
              border: `1.5px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 14,
              color: C.ink,
              background: C.white,
              fontFamily: "inherit",
            }}
          />
          {cargando && <div style={{ fontSize: 13, color: C.slate, marginTop: 10 }}>Leyendo archivo...</div>}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: C.redBg,
                borderRadius: 8,
                fontSize: 13,
                color: C.red,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <Btn variant="secondary" onClick={onClose}>
              Cancelar
            </Btn>
          </div>
        </div>
      )}
      {paso === 2 && (
        <div>
          <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>
            Se agruparon en <strong>{grupos.length}</strong> conceptos. Desmarca los que no quieras importar.
          </div>
          {mesesPresentes.map((mes) => {
            const yaExiste = comprasExistentes.some((c) => c.mes === mes);
            return (
              <label
                key={mes}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: yaExiste ? C.amberBg : C.greenBg,
                  borderRadius: 8,
                  marginBottom: 8,
                  fontSize: 12,
                  color: yaExiste ? C.amber : C.green,
                  fontWeight: 600,
                  cursor: yaExiste ? "pointer" : "default",
                }}
              >
                {yaExiste && (
                  <input
                    type="checkbox"
                    checked={!!reemplazar[mes]}
                    onChange={(e) => setReemplazar((r) => ({ ...r, [mes]: e.target.checked }))}
                  />
                )}
                {fmtMesLargo(mes)} — {yaExiste ? "ya existen datos de este mes; marca para reemplazarlos" : "mes nuevo"}
              </label>
            );
          })}
          <div
            style={{
              maxHeight: 340,
              overflowY: "auto",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              margin: "10px 0 16px",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink, position: "sticky", top: 0 }}>
                  {["", "Mes", "Código", "Concepto", "Facturas", "Valor Bruto"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
                        color: C.seam,
                        textAlign: "left",
                        fontWeight: 700,
                        fontSize: 10,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupos.map((g, i) => (
                  <tr
                    key={i}
                    style={{
                      background: g.incluir ? C.white : C.canvas,
                      opacity: g.incluir ? 1 : 0.5,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <td style={{ padding: "6px 10px" }}>
                      <input type="checkbox" checked={g.incluir} onChange={() => toggleGrupo(i)} />
                    </td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{fmtMesCorto(g.mes)}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{g.codConcep}</td>
                    <td style={{ padding: "6px 10px" }}>{g.concepto}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>{g.entradas}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>
                      {fmtCOP(g.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Btn variant="secondary" onClick={() => { setPaso(1); setGrupos([]); }}>
              ← Volver
            </Btn>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              Total seleccionado: {fmtCOP(totalSeleccionado)}
            </div>
            <Btn variant="danger" onClick={confirmar} disabled={!seleccionados.length}>
              Importar {seleccionados.length} concepto{seleccionados.length !== 1 ? "s" : ""}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
// ─── CUENTAS POR PAGAR (IMPORT TNS + MANUAL + CALENDARIO DE PAGO) ─────────────
// El reporte "Resumen de Cuentas por Pagar por Edades" de TNS agrupa por
// proveedor en franjas de antigüedad (Por vencer, 0-30, 31-60, 61-90, 91+),
// no trae facturas individuales con vencimiento. Se lee posicionalmente:
// nombre en la primera celda de cada fila, seguido de los valores numéricos
// de cada franja + el total — así evitamos depender de la alineación exacta
// de columnas del encabezado (que viene desalineada por celdas combinadas
// distintas entre encabezado y filas de datos en el export real de TNS).
async function parseCuentasPorPagar(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  let fechaCorte = "";
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      const mFecha = cell.match(/fecha\s*:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
      if (mFecha) {
        fechaCorte = `${mFecha[3]}-${mFecha[1].padStart(2, "0")}-${mFecha[2].padStart(2, "0")}`;
        break;
      }
    }
    if (fechaCorte) break;
  }
  if (!fechaCorte) {
    for (const row of rows) {
      for (const cell of row) {
        if (typeof cell !== "string" || !/corte/i.test(cell)) continue;
        const m = cell.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) {
          fechaCorte = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
          break;
        }
      }
      if (fechaCorte) break;
    }
  }
  if (!fechaCorte) fechaCorte = today();
  const PALABRAS_ENCABEZADO = ["nombre", "totales", "total informe", "facturas por vencer", "facturas vencidas", "resumen", "fec. corte", "fecha"];
  const proveedores = [];
  rows.forEach((row) => {
    const nombreRaw = row[0];
    if (!nombreRaw || typeof nombreRaw !== "string") return;
    const nombre = nombreRaw.trim();
    if (!nombre) return;
    const nombreNorm = normalizarEncabezado(nombre);
    if (PALABRAS_ENCABEZADO.some((w) => nombreNorm.includes(w))) return;
    const numeros = row.slice(1).filter((v) => typeof v === "number");
    if (numeros.length < 5) return;
    const ultimos6 = numeros.length >= 6 ? numeros.slice(-6) : [...numeros, numeros.reduce((s, n) => s + n, 0)];
    const [porVencer, dias0a30, dias31a60, dias61a90, dias91mas, total] = ultimos6;
    proveedores.push({
      nombre,
      porVencer: porVencer || 0,
      dias0a30: dias0a30 || 0,
      dias31a60: dias31a60 || 0,
      dias61a90: dias61a90 || 0,
      dias91mas: dias91mas || 0,
      total: total || 0,
    });
  });
  return { fechaCorte, proveedores };
}
function ImportarCXPModal({ onConfirm, onClose }) {
  const [paso, setPaso] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setError("");
    setCargando(true);
    try {
      const parsed = await parseCuentasPorPagar(f);
      if (!parsed.proveedores.length) {
        setError("No se encontraron proveedores válidos. Verifica que sea el reporte de Cuentas por Pagar por Edades de TNS.");
      } else {
        setDatos({ ...parsed, proveedores: parsed.proveedores.map((p) => ({ ...p, incluir: true })) });
        setPaso(2);
      }
    } catch (err) {
      setError("No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx o .xls).");
    }
    setCargando(false);
  }
  function toggleProveedor(i) {
    setDatos((d) => ({
      ...d,
      proveedores: d.proveedores.map((p, idx) => (idx === i ? { ...p, incluir: !p.incluir } : p)),
    }));
  }
  function confirmar() {
    const seleccionados = datos.proveedores.filter((p) => p.incluir).map(({ incluir, ...p }) => p);
    onConfirm({
      id: uid(),
      fechaCorte: datos.fechaCorte,
      proveedores: seleccionados,
      creadoEn: new Date().toISOString(),
    });
    onClose();
  }
  const seleccionados = datos ? datos.proveedores.filter((p) => p.incluir) : [];
  const total = seleccionados.reduce((s, p) => s + p.total, 0);
  return (
    <Modal title="Importar Cuentas por Pagar (TNS)" onClose={onClose} width={860}>
      {paso === 1 && (
        <div>
          <div
            style={{
              padding: "12px 14px",
              background: C.blueBg,
              borderRadius: 8,
              marginBottom: 18,
              fontSize: 13,
              color: C.blue,
              lineHeight: 1.5,
            }}
          >
            Sube el reporte "Resumen de Cuentas por Pagar por Edades" exportado desde TNS (.xlsx). Se agrupa automáticamente por proveedor y se guarda como un corte nuevo — no borra los cortes anteriores, así puedes ver el histórico.
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={cargando}
            style={{
              width: "100%",
              padding: "9px 12px",
              border: `1.5px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 14,
              color: C.ink,
              background: C.white,
              fontFamily: "inherit",
            }}
          />
          {cargando && <div style={{ fontSize: 13, color: C.slate, marginTop: 10 }}>Leyendo archivo...</div>}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: C.redBg,
                borderRadius: 8,
                fontSize: 13,
                color: C.red,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <Btn variant="secondary" onClick={onClose}>
              Cancelar
            </Btn>
          </div>
        </div>
      )}
      {paso === 2 && datos && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
            <div style={{ fontSize: 13, color: C.slate }}>
              Se encontraron <strong>{datos.proveedores.length}</strong> proveedores. Desmarca los que no quieras incluir en este corte.
            </div>
            <div style={{ width: 200 }}>
              <Field label="Fecha de corte">
                <FInput type="date" value={datos.fechaCorte} onChange={(v) => setDatos((d) => ({ ...d, fechaCorte: v }))} />
              </Field>
            </div>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink, position: "sticky", top: 0 }}>
                  {["", "Proveedor", "Por vencer", "0-30", "31-60", "61-90", "91+", "Total"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
                        color: C.seam,
                        textAlign: h === "Proveedor" || h === "" ? "left" : "right",
                        fontWeight: 700,
                        fontSize: 10,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.proveedores.map((p, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: p.incluir ? (i % 2 === 0 ? C.canvas : C.white) : C.canvas,
                      opacity: p.incluir ? 1 : 0.45,
                    }}
                  >
                    <td style={{ padding: "6px 10px" }}>
                      <input type="checkbox" checked={p.incluir} onChange={() => toggleProveedor(i)} />
                    </td>
                    <td style={{ padding: "6px 10px" }}>{p.nombre}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtCOP(p.porVencer)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtCOP(p.dias0a30)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtCOP(p.dias31a60)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtCOP(p.dias61a90)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: p.dias91mas > 0 ? C.red : C.ink, fontWeight: p.dias91mas > 0 ? 700 : 400 }}>
                      {fmtCOP(p.dias91mas)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>{fmtCOP(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Btn variant="secondary" onClick={() => { setPaso(1); setDatos(null); }}>
              ← Volver
            </Btn>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              {seleccionados.length} de {datos.proveedores.length} seleccionados — Total: {fmtCOP(total)}
            </div>
            <Btn variant="danger" onClick={confirmar} disabled={!seleccionados.length}>
              Guardar corte
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
function AgregarProveedorCXPModal({ onSave, onClose }) {
  const [nombre, setNombre] = useState("");
  const [porVencer, setPorVencer] = useState("");
  const [dias0a30, setDias0a30] = useState("");
  const [dias31a60, setDias31a60] = useState("");
  const [dias61a90, setDias61a90] = useState("");
  const [dias91mas, setDias91mas] = useState("");
  // (2026-09-28, a pedido de Fredy) Fecha de vencimiento opcional -- a
  // diferencia de las facturas de Busint (que traen su fecha exacta), un
  // proveedor manual (ej. DIAN-IVA-2024, ICA) es un solo monto sin factura
  // detras, asi que se le puede poner UNA fecha para que la vista semanal de
  // "Vencimientos" en Financiera lo ubique en la semana correcta. Si se deja
  // en blanco (como quedan los que ya existian antes de este campo), esa
  // vista simplemente lo muestra aparte, en "sin fecha exacta".
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const total = [porVencer, dias0a30, dias31a60, dias61a90, dias91mas].reduce((s, v) => s + (parseFloat(v) || 0), 0);
  function guardar() {
    if (!nombre || total <= 0) return;
    onSave({
      id: uid(),
      nombre,
      porVencer: parseFloat(porVencer) || 0,
      dias0a30: parseFloat(dias0a30) || 0,
      dias31a60: parseFloat(dias31a60) || 0,
      dias61a90: parseFloat(dias61a90) || 0,
      dias91mas: parseFloat(dias91mas) || 0,
      total,
      fechaVencimiento: fechaVencimiento || null,
      creadoEn: new Date().toISOString(),
    });
    onClose();
  }
  return (
    <Modal title="Agregar proveedor manualmente" onClose={onClose} width={480}>
      <Field label="Proveedor">
        <FInput value={nombre} onChange={setNombre} placeholder="Nombre del proveedor" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Por vencer">
          <FInput type="number" value={porVencer} onChange={setPorVencer} placeholder="0" />
        </Field>
        <Field label="0 - 30 días">
          <FInput type="number" value={dias0a30} onChange={setDias0a30} placeholder="0" />
        </Field>
        <Field label="31 - 60 días">
          <FInput type="number" value={dias31a60} onChange={setDias31a60} placeholder="0" />
        </Field>
        <Field label="61 - 90 días">
          <FInput type="number" value={dias61a90} onChange={setDias61a90} placeholder="0" />
        </Field>
        <Field label="91 o más días">
          <FInput type="number" value={dias91mas} onChange={setDias91mas} placeholder="0" />
        </Field>
      </div>
      <Field label="Fecha de vencimiento (opcional)">
        <FInput type="date" value={fechaVencimiento} onChange={setFechaVencimiento} />
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 16, marginTop: -4 }}>
        Si la dejas en blanco, este proveedor va a aparecer en "Vencimientos" (Financiera) como sin fecha exacta.
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: C.violetBg,
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          color: C.violet,
          marginBottom: 16,
        }}
      >
        <span>Total</span>
        <span>{fmtCOP(total)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn variant="danger" onClick={guardar} disabled={!nombre || total <= 0}>
          Guardar
        </Btn>
      </div>
    </Modal>
  );
}
// ─── FLUJO DE CAJA VIEW ───────────────────────────────────────────────────────
function FlujoCajaView({ movimientos, onAdd, onDelete, onDeleteFecha, isAdmin, clientesDiseno, rubros, onUpdateDistribucion }) {
  const [showModal, setShowModal] = useState(null); // "ingreso" | "egreso" | "importar"
  const [fechaABorrar, setFechaABorrar] = useState("");
  const [asignandoId, setAsignandoId] = useState(null);
  const [mesFiltro, setMesFiltro] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [catFiltro, setCatFiltro] = useState("");
  const movMes = movimientos.filter((m) => m.fecha?.slice(0, 7) === mesFiltro);
  const movFiltrados = catFiltro
    ? movMes.filter((m) => m.categoria === catFiltro)
    : movMes;
  const totalIngresos = movMes
    .filter((m) => m.tipo === "ingreso")
    .reduce((s, m) => s + m.valor, 0);
  const totalEgresos = movMes
    .filter((m) => m.tipo === "egreso")
    .reduce((s, m) => s + m.valor, 0);
  const saldo = totalIngresos - totalEgresos;
  // Generar últimos 12 meses para selector
  const meses = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const y = d.getFullYear(),
      mm = d.getMonth() + 1 - i;
    const real = mm <= 0 ? { y: y - 1, m: 12 + mm } : { y, m: mm };
    meses.push(`${real.y}-${String(real.m).padStart(2, "0")}`);
  }
  return (
    <div>
      {(showModal === "ingreso" || showModal === "egreso") && (
        <NuevoMovimientoModal
          tipo={showModal}
          onSave={(m) => onAdd(m)}
          onClose={() => setShowModal(null)}
          clientesDiseno={clientesDiseno}
          rubros={rubros}
        />
      )}
      {showModal === "importar" && (
        <ImportarExcelModal
          onSave={(m) => onAdd(m)}
          onClose={() => setShowModal(null)}
        />
      )}
      {asignandoId &&
        (() => {
          const m = movimientos.find((x) => x.id === asignandoId);
          if (!m) return null;
          return (
            <AsignarRubroModal
              movimiento={m}
              rubros={rubros}
              onUpdate={(id, distribucion) => onUpdateDistribucion && onUpdateDistribucion(id, distribucion)}
              onClose={() => setAsignandoId(null)}
            />
          );
        })()}
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
            Flujo de Caja
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            {new Date(mesFiltro + "-02").toLocaleDateString("es-CO", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={mesFiltro}
            onChange={(e) => setMesFiltro(e.target.value)}
            style={{
              padding: "8px 12px",
              border: `1.5px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: C.ink,
              background: C.white,
              outline: "none",
              fontFamily: "inherit",
            }}
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {new Date(m + "-02").toLocaleDateString("es-CO", {
                  month: "long",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>
          <Btn variant="success" onClick={() => setShowModal("ingreso")}>
            + Ingreso
          </Btn>
          <Btn variant="danger" onClick={() => setShowModal("egreso")}>
            - Egreso
          </Btn>
          <Btn variant="secondary" onClick={() => setShowModal("importar")}>
            📥 Importar Excel
          </Btn>
        </div>
      </div>
      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KPI
          icon="💵"
          label="Total Ingresos"
          value={fmtCOP(totalIngresos)}
          color={C.green}
          bg={C.greenBg}
        />
        <KPI
          icon="💸"
          label="Total Egresos"
          value={fmtCOP(totalEgresos)}
          color={C.red}
          bg={C.redBg}
        />
        <KPI
          icon={saldo >= 0 ? "📈" : "📉"}
          label="Saldo del Mes"
          value={fmtCOP(saldo)}
          color={saldo >= 0 ? C.green : C.red}
          bg={saldo >= 0 ? C.greenBg : C.redBg}
          sub={saldo >= 0 ? "✓ Positivo" : "⚠ Negativo"}
        />
      </div>
      {/* Barra visual ingresos vs egresos */}
      {(totalIngresos > 0 || totalEgresos > 0) && (
        <div
          style={{
            background: C.white,
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: C.slate,
              marginBottom: 8,
            }}
          >
            <span style={{ color: C.green, fontWeight: 700 }}>
              Ingresos {fmtCOP(totalIngresos)}
            </span>
            <span style={{ color: C.red, fontWeight: 700 }}>
              Egresos {fmtCOP(totalEgresos)}
            </span>
          </div>
          <div
            style={{
              height: 12,
              borderRadius: 6,
              background: C.redBg,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(
                  (totalIngresos /
                    (Math.max(totalIngresos, totalEgresos) || 1)) *
                    100,
                  100
                )}%`,
                background: C.green,
                borderRadius: 6,
              }}
            />
          </div>
        </div>
      )}
      {/* Filtro categoría */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: C.slate, fontWeight: 600 }}>
          Filtrar:
        </span>
        <select
          value={catFiltro}
          onChange={(e) => setCatFiltro(e.target.value)}
          style={{
            padding: "6px 10px",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: 12,
            color: C.ink,
            background: C.white,
            outline: "none",
            fontFamily: "inherit",
          }}
        >
          <option value="">Todas las categorías</option>
          {[...CATS_INGRESO, ...CATS_EGRESO].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: C.slate }}>
          {movFiltrados.length} movimiento{movFiltrados.length !== 1 ? "s" : ""}
        </span>
        {isAdmin && onDeleteFecha && (
          <>
            <span style={{ flex: 1 }} />
            <input
              type="date"
              value={fechaABorrar}
              onChange={(e) => setFechaABorrar(e.target.value)}
              style={{
                padding: "6px 10px",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: 12,
                color: C.ink,
                background: C.white,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => {
                if (!fechaABorrar) return;
                const cantidad = movimientos.filter((m) => m.fecha === fechaABorrar).length;
                if (!cantidad) return;
                if (window.confirm(`¿Borrar los ${cantidad} movimientos con fecha ${fechaABorrar}? Esta acción no se puede deshacer.`)) {
                  onDeleteFecha(fechaABorrar);
                  setFechaABorrar("");
                }
              }}
              style={{
                padding: "6px 12px",
                background: C.redBg,
                border: `1px solid ${C.red}44`,
                borderRadius: 6,
                color: C.red,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              🗑 Borrar todos de esa fecha
            </button>
          </>
        )}
      </div>
      {/* Tabla movimientos */}
      {!movFiltrados.length ? (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: C.slate,
            fontSize: 14,
          }}
        >
          Sin movimientos en este período.
        </div>
      ) : (
        <div
          style={{
            background: C.white,
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            overflow: "hidden",
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: C.ink }}>
                {[
                  "Fecha",
                  "Tipo",
                  "Categoría",
                  "Descripción",
                  "Proveedor/Cliente",
                  "Valor",
                  "Disponible",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 12px",
                      color: C.seam,
                      textAlign: "left",
                      fontWeight: 700,
                      fontSize: 11,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movFiltrados
                .sort((a, b) => b.fecha.localeCompare(a.fecha))
                .map((m, i) => (
                  <tr
                    key={m.id}
                    style={{
                      background: i % 2 === 0 ? C.canvas : C.white,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        color: C.slate,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.fecha}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            m.tipo === "ingreso" ? C.greenBg : C.redBg,
                          color: m.tipo === "ingreso" ? C.green : C.red,
                        }}
                      >
                        {m.tipo === "ingreso" ? "↑ Ingreso" : "↓ Egreso"}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: C.ink,
                        fontWeight: 600,
                      }}
                    >
                      {m.categoria}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.slate }}>
                      {m.descripcion || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.slate }}>
                      {m.proveedor || "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontWeight: 800,
                        color: m.tipo === "ingreso" ? C.green : C.red,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.tipo === "ingreso" ? "+" : "-"}
                      {fmtCOP(m.valor)}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {m.tipo === "ingreso"
                        ? (() => {
                            const asignadoRow = (m.distribucion || []).reduce((s, dd) => s + (parseFloat(dd.monto) || 0), 0);
                            const dispRow = m.valor - asignadoRow;
                            return (
                              <span style={{ fontWeight: 700, color: dispRow < 0 ? C.red : dispRow === 0 ? C.slate : C.amber }}>
                                {fmtCOP(dispRow)}
                              </span>
                            );
                          })()
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                      {m.tipo === "ingreso" &&
                        onUpdateDistribucion &&
                        (() => {
                          const asignado = (m.distribucion || []).reduce((s, dd) => s + (parseFloat(dd.monto) || 0), 0);
                          const completo = asignado >= m.valor - 0.5;
                          return (
                            <button
                              onClick={() => setAsignandoId(m.id)}
                              style={{
                                background: completo ? C.greenBg : C.amberBg,
                                border: "none",
                                borderRadius: 6,
                                padding: "4px 8px",
                                color: completo ? C.green : C.amber,
                                fontWeight: 700,
                                fontSize: 10,
                                cursor: "pointer",
                                marginRight: 6,
                              }}
                            >
                              {completo ? "✓ Completo" : "Asignar rubro"}
                            </button>
                          );
                        })()}
                      {isAdmin && (
                        <button
                          onClick={() => onDelete(m.id)}
                          style={{
                            background: C.redBg,
                            border: "none",
                            borderRadius: 6,
                            padding: "4px 8px",
                            color: C.red,
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.ink }}>
                <td
                  colSpan={5}
                  style={{
                    padding: "10px 12px",
                    color: C.seam,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  SALDO DEL MES
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    fontWeight: 900,
                    fontSize: 15,
                    color: saldo >= 0 ? C.green : C.red,
                    whiteSpace: "nowrap",
                  }}
                >
                  {saldo >= 0 ? "+" : ""}
                  {fmtCOP(saldo)}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
// ─── COMPARATIVO POR CONCEPTO (MES A MES) ─────────────────────────────────────
function ComparativoConceptosView({ compras, onImportar, onDeleteMes, onUpdateCompra, isAdmin }) {
  const [showImport, setShowImport] = useState(false);
  const [cuadrando, setCuadrando] = useState(null); // { codConcep, concepto, mes } — celda que se está cuadrando
  const meses = [...new Set(compras.map((c) => c.mes))].sort();
  const filasMap = {};
  compras.forEach((c) => {
    const key = `${c.codConcep}__${c.concepto}`;
    if (!filasMap[key]) {
      filasMap[key] = { codConcep: c.codConcep, concepto: c.concepto, porMes: {}, total: 0 };
    }
    filasMap[key].porMes[c.mes] = (filasMap[key].porMes[c.mes] || 0) + c.valor;
    filasMap[key].total += c.valor;
  });
  const filas = Object.values(filasMap).sort((a, b) => b.total - a.total);
  const totalesPorMes = {};
  meses.forEach((m) => {
    totalesPorMes[m] = compras.filter((c) => c.mes === m).reduce((s, c) => s + c.valor, 0);
  });
  const mesMayor = meses.reduce((max, m) => (max === null || totalesPorMes[m] > totalesPorMes[max] ? m : max), null);
  const granTotal = Object.values(totalesPorMes).reduce((s, v) => s + v, 0);
  // Tendencia: compara el último mes cargado contra el penúltimo, por rubro.
  const [ultimoMes, penultimoMes] = [...meses].reverse();
  filas.forEach((f) => {
    const actual = ultimoMes ? f.porMes[ultimoMes] || 0 : 0;
    const anterior = penultimoMes ? f.porMes[penultimoMes] || 0 : 0;
    f.cambio = actual - anterior;
    f.cambioPct = anterior > 0 ? (f.cambio / anterior) * 100 : actual > 0 ? 100 : 0;
  });
  const conTendencia = penultimoMes ? filas.filter((f) => (f.porMes[ultimoMes] || 0) > 0 || (f.porMes[penultimoMes] || 0) > 0) : [];
  const subieron = [...conTendencia].filter((f) => f.cambio > 0).sort((a, b) => b.cambio - a.cambio).slice(0, 5);
  const bajaron = [...conTendencia].filter((f) => f.cambio < 0).sort((a, b) => a.cambio - b.cambio).slice(0, 5);
  // Celdas (mes + concepto) que ya tienen IVA/Retención cuadrados manualmente.
  const cuadradasSet = new Set(
    compras.filter((c) => c.iva !== undefined || c.retencion !== undefined).map((c) => `${c.mes}__${c.codConcep}__${c.concepto}`)
  );
  const registrosDeCelda = (codConcep, concepto, mes) =>
    compras.filter((c) => c.mes === mes && c.codConcep === codConcep && c.concepto === concepto);
  return (
    <div>
      {showImport && (
        <ImportarBusintModal
          comprasExistentes={compras}
          onConfirm={onImportar}
          onClose={() => setShowImport(false)}
        />
      )}
      {cuadrando && (
        <CuadrarPagoModal
          concepto={cuadrando.concepto}
          codConcep={cuadrando.codConcep}
          mes={cuadrando.mes}
          registros={registrosDeCelda(cuadrando.codConcep, cuadrando.concepto, cuadrando.mes)}
          onUpdateCompra={onUpdateCompra}
          onClose={() => setCuadrando(null)}
        />
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>
            Comparativo por Concepto
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            Gasto agrupado por concepto, mes a mes (Valor Bruto Busint). Haz clic en un valor para cuadrar IVA / Retención y ver el neto a pagar.
          </p>
        </div>
        <Btn variant="danger" onClick={() => setShowImport(true)}>
          📥 Importar Busint
        </Btn>
      </div>
      {!compras.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          Aún no has importado ningún mes. Usa "Importar Busint" para subir el primer export.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 14,
              marginBottom: 24,
            }}
          >
            <KPI icon="💰" label="Gasto total acumulado" value={fmtCOP(granTotal)} color={C.violet} bg={C.violetBg} />
            <KPI
              icon="📅"
              label="Mes de mayor gasto"
              value={mesMayor ? fmtMesLargo(mesMayor) : "—"}
              color={C.amber}
              bg={C.amberBg}
              sub={mesMayor ? fmtCOP(totalesPorMes[mesMayor]) : ""}
            />
            <KPI
              icon="🏷"
              label="Concepto de mayor peso"
              value={filas[0]?.concepto || "—"}
              color={C.red}
              bg={C.redBg}
              sub={filas[0] ? fmtCOP(filas[0].total) : ""}
            />
          </div>
          <div
            style={{
              background: C.white,
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  <th style={{ padding: "10px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                    Código
                  </th>
                  <th style={{ padding: "10px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                    Concepto
                  </th>
                  {meses.map((m) => (
                    <th
                      key={m}
                      style={{
                        padding: "10px 12px",
                        color: m === mesMayor ? C.white : C.seam,
                        background: m === mesMayor ? "rgba(200,184,162,0.15)" : "transparent",
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: 10,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtMesCorto(m)}
                      {isAdmin && (
                        <button
                          onClick={() => onDeleteMes(m)}
                          title="Borrar este mes"
                          style={{
                            marginLeft: 6,
                            background: "none",
                            border: "none",
                            color: C.red,
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </th>
                  ))}
                  <th style={{ padding: "10px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                    Total
                  </th>
                  {penultimoMes && (
                    <th style={{ padding: "10px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                      Tendencia
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const mesMax = meses.reduce(
                    (max, m) => (max === null || (f.porMes[m] || 0) > (f.porMes[max] || 0) ? m : max),
                    null
                  );
                  return (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? C.canvas : C.white,
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <td style={{ padding: "8px 12px", color: C.slate, whiteSpace: "nowrap" }}>{f.codConcep}</td>
                      <td style={{ padding: "8px 12px", color: C.ink, fontWeight: 600 }}>{f.concepto}</td>
                      {meses.map((m) => {
                        const tieneValor = !!f.porMes[m];
                        const cuadrada = cuadradasSet.has(`${m}__${f.codConcep}__${f.concepto}`);
                        return (
                          <td
                            key={m}
                            onClick={() => tieneValor && setCuadrando({ codConcep: f.codConcep, concepto: f.concepto, mes: m })}
                            title={tieneValor ? "Clic para cuadrar IVA / Retención" : ""}
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              whiteSpace: "nowrap",
                              fontWeight: m === mesMax && f.porMes[m] ? 800 : 500,
                              color: m === mesMax && f.porMes[m] ? C.red : C.slate,
                              background: m === mesMax && f.porMes[m] ? C.redBg : "transparent",
                              cursor: tieneValor ? "pointer" : "default",
                            }}
                          >
                            {tieneValor ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                {cuadrada && <span title="Cuadrado con IVA/Retención" style={{ fontSize: 10, color: C.green }}>●</span>}
                                {fmtCOP(f.porMes[m])}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>
                        {fmtCOP(f.total)}
                      </td>
                      {penultimoMes && (
                        <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {(f.porMes[ultimoMes] || 0) > 0 || (f.porMes[penultimoMes] || 0) > 0 ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: f.cambio > 0 ? C.red : f.cambio < 0 ? C.green : C.slate,
                              }}
                            >
                              {f.cambio > 0 ? "↑" : f.cambio < 0 ? "↓" : "→"}{" "}
                              {Math.abs(f.cambioPct) >= 999 ? "nuevo" : `${Math.abs(Math.round(f.cambioPct))}%`}
                            </span>
                          ) : (
                            <span style={{ color: C.slate }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: C.ink }}>
                  <td colSpan={2} style={{ padding: "10px 12px", color: C.seam, fontWeight: 700, fontSize: 12 }}>
                    TOTAL MES
                  </td>
                  {meses.map((m) => (
                    <td key={m} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: C.white, whiteSpace: "nowrap" }}>
                      {fmtCOP(totalesPorMes[m])}
                    </td>
                  ))}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: C.white, whiteSpace: "nowrap" }}>
                    {fmtCOP(granTotal)}
                  </td>
                  {penultimoMes && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
          {penultimoMes && (subieron.length > 0 || bajaron.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.red, marginBottom: 10 }}>
                  📈 Rubros que más subieron ({fmtMesCorto(penultimoMes)} → {fmtMesCorto(ultimoMes)})
                </div>
                {subieron.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {subieron.map((f, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: C.ink, fontWeight: 600 }}>{f.concepto}</span>
                        <span style={{ color: C.red, fontWeight: 700, whiteSpace: "nowrap" }}>
                          +{fmtCOP(f.cambio)} ({Math.abs(f.cambioPct) >= 999 ? "nuevo" : `${Math.round(f.cambioPct)}%`})
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.slate }}>Ningún rubro subió.</div>
                )}
              </div>
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.green, marginBottom: 10 }}>
                  📉 Rubros que más bajaron ({fmtMesCorto(penultimoMes)} → {fmtMesCorto(ultimoMes)})
                </div>
                {bajaron.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {bajaron.map((f, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: C.ink, fontWeight: 600 }}>{f.concepto}</span>
                        <span style={{ color: C.green, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {fmtCOP(f.cambio)} ({Math.round(f.cambioPct)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.slate }}>Ningún rubro bajó.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
// ─── CUADRE MANUAL DE IVA / RETENCIÓN (por celda mes + concepto) ─────────────
// El usuario escribe IVA y Retención a mano (no se calculan con %); el Valor
// Neto a Pagar = Vbruto (Busint) + IVA - Retención. Si la celda agrupa más de
// un registro (p. ej. se importó el mismo mes dos veces sin reemplazar), se
// edita cada registro por separado y también se muestra el total combinado.
function CuadrarPagoModal({ concepto, codConcep, mes, registros, onUpdateCompra, onClose }) {
  const [valores, setValores] = useState(() => {
    const init = {};
    registros.forEach((r) => {
      init[r.id] = { iva: r.iva ?? "", retencion: r.retencion ?? "" };
    });
    return init;
  });
  function setCampo(id, campo, val) {
    setValores((v) => ({ ...v, [id]: { ...v[id], [campo]: val } }));
  }
  function netoDe(r) {
    const iva = parseFloat(valores[r.id]?.iva) || 0;
    const retencion = parseFloat(valores[r.id]?.retencion) || 0;
    return r.valor + iva - retencion;
  }
  const totalBruto = registros.reduce((s, r) => s + r.valor, 0);
  const totalIva = registros.reduce((s, r) => s + (parseFloat(valores[r.id]?.iva) || 0), 0);
  const totalRetencion = registros.reduce((s, r) => s + (parseFloat(valores[r.id]?.retencion) || 0), 0);
  const totalNeto = totalBruto + totalIva - totalRetencion;
  async function guardar() {
    await Promise.all(
      registros.map((r) =>
        onUpdateCompra(r.id, {
          iva: parseFloat(valores[r.id]?.iva) || 0,
          retencion: parseFloat(valores[r.id]?.retencion) || 0,
        })
      )
    );
    onClose();
  }
  return (
    <Modal title={`Cuadrar pago — ${concepto}`} onClose={onClose} width={520}>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, lineHeight: 1.5 }}>
        {fmtMesLargo(mes)} · Código {codConcep}. El Valor Bruto viene del import de Busint (antes de IVA y retenciones). Escribe el IVA y la Retención de la factura para calcular el Valor Neto a Pagar y compararlo con lo que realmente pagaste.
      </div>
      {registros.map((r, i) => (
        <div
          key={r.id}
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
            background: C.canvas,
          }}
        >
          {registros.length > 1 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, marginBottom: 8 }}>
              Registro {i + 1} de {registros.length} ({r.entradas} factura{r.entradas !== 1 ? "s" : ""} agrupadas)
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: C.slate }}>Valor Bruto (Busint)</span>
            <span style={{ fontWeight: 800, color: C.ink }}>{fmtCOP(r.valor)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="IVA">
              <FInput type="number" value={valores[r.id]?.iva} onChange={(v) => setCampo(r.id, "iva", v)} placeholder="0" />
            </Field>
            <Field label="Retención">
              <FInput type="number" value={valores[r.id]?.retencion} onChange={(v) => setCampo(r.id, "retencion", v)} placeholder="0" />
            </Field>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              paddingTop: 10,
              marginTop: 4,
              borderTop: `1px dashed ${C.border}`,
            }}
          >
            <span style={{ color: C.ink, fontWeight: 700 }}>Valor Neto a Pagar</span>
            <span style={{ fontWeight: 900, color: C.violet }}>{fmtCOP(netoDe(r))}</span>
          </div>
        </div>
      ))}
      {registros.length > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            padding: "10px 14px",
            background: C.violetBg,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <span style={{ color: C.violet, fontWeight: 800 }}>Total combinado (Neto)</span>
          <span style={{ color: C.violet, fontWeight: 900 }}>{fmtCOP(totalNeto)}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn onClick={guardar}>Guardar</Btn>
      </div>
    </Modal>
  );
}
// ─── PROYECCIÓN DE FLUJO DE CAJA (PRESUPUESTO POR MES) ────────────────────────
// El "promedio" de cada rubro se calcula en vivo a partir de los meses ya
// cargados en el Comparativo (contabilidad_compras). Un presupuesto guardado
// NO se recalcula solo al importar más meses — hay que pulsar "Recalcular"
// a propósito (p. ej. después de cuadrar IVA/Retención de una compra), para
// no cambiar cifras ya usadas sin que el usuario lo pida explícitamente.
function sumarMes(mes, n = 1) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Promedio de gasto por rubro (codConcep+concepto), sobre todos los meses
// cargados en el Comparativo. Si una compra ya tiene IVA/Retención cuadrados
// manualmente, se usa su Valor Neto (Vbruto + IVA - Retención); si no, se usa
// el Vbruto de Busint tal cual. Se usa tanto al crear una Proyección nueva
// como al Recalcular una ya existente (botón "🔄 Recalcular" en la tarjeta).
// ─── PRESUPUESTO POR CLIENTE ───────────────────────────────────────────────────
// A diferencia del presupuesto por rubro (Proyección, calculado del histórico
// de compras), este lo define el usuario a mano: cuánto espera que cada
// cliente le abone ese mes, según los pedidos que tenga con él. Compara contra
// lo efectivamente abonado para saber quién va cumpliendo.
// (2026-08-27) Facturación Clientes: consulta EN VIVO a Busint (no lee
// Firestore, no depende de que alguien suba nada) cuánto se facturó por
// cliente en un rango de fechas, en $ y en unidades. Usa la misma fuente
// (ApiGen_FacturadoBusint) que ya está conectada en otros informes de la
// app (Pedidos Vigentes, Traslados, Documentos por Cliente) — junta
// facturas normales, traslados y devoluciones, y muestra el desglose por
// tipo para que quede claro qué compone cada total, en vez de decidir acá
// cuáles "cuentan".
function FacturacionClientesView() {
  const [fechaInicio, setFechaInicio] = useState(() => today().slice(0, 8) + "01");
  const [fechaFin, setFechaFin] = useState(() => today());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [clienteAbierto, setClienteAbierto] = useState(null);
  const [docAbierto, setDocAbierto] = useState(null);
  const [filtroTipoDoc, setFiltroTipoDoc] = useState("TODOS");
  // (2026-09-02, a pedido de Fredy) Clasificación de cada cliente --
  // Facturado o Consignación -- para poder sumar bien su "despachado"
  // total: un cliente que factura por Consignación se suma con Traslado
  // Externo pero NUNCA con Facturado, y viceversa (son excluyentes entre
  // sí); Traslado Externo sí se suma con cualquiera de los dos. Como los
  // clientes de esta pantalla no son una colección propia (vienen en vivo
  // de Busint), la clasificación se guarda aparte, por nombre/código de
  // cliente, en Firestore -- así queda fija sin importar qué rango de
  // fechas se consulte.
  const [tiposCliente, setTiposCliente] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "facturacion_tipo_cliente"), (snap) => {
      // (2026-09-02, corrección a pedido de Fredy) Un mismo cliente puede
      // venir identificado por su código de Busint en un rango de fechas
      // y solo por nombre en otro (Busint no siempre trae el código en
      // cada factura) -- se indexa por LAS DOS claves que traiga cada
      // documento guardado, para reconocerlo sin importar cuál de las
      // dos venga la próxima vez que se consulte.
      const m = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.codigoCliente) m[data.codigoCliente] = data.tipo;
        if (data.nombreCliente) m[data.nombreCliente] = data.tipo;
        if (data.clave && !(data.clave in m)) m[data.clave] = data.tipo; // docs guardados antes de este cambio
      });
      setTiposCliente(m);
    });
    return () => unsub();
  }, []);
  function claveDoc(clave) {
    return String(clave || "").trim().replace(/[/.#$[\]]/g, "_") || "sin_clave";
  }
  // (2026-09-02, corrección a pedido de Fredy) Se guarda en dos
  // documentos separados -- uno por código de cliente, otro por nombre
  // -- cuando Busint trae los dos, para que la clasificación se siga
  // encontrando sin importar cuál de las dos venga en un rango de
  // fechas distinto.
  async function guardarTipoCliente(codigoCliente, nombreCliente, tipo) {
    const cod = String(codigoCliente || "").trim();
    const nom = String(nombreCliente || "").trim();
    const writes = [];
    if (cod) writes.push(fsSave("facturacion_tipo_cliente", claveDoc(cod), { codigoCliente: cod, nombreCliente: nom, tipo }));
    if (nom) writes.push(fsSave("facturacion_tipo_cliente", claveDoc(nom), { codigoCliente: cod, nombreCliente: nom, tipo }));
    await Promise.all(writes);
  }
  function tipoDeCliente(c) {
    return tiposCliente[c.codigoCliente] || tiposCliente[c.nombreCliente] || "";
  }
  async function consultar() {
    if (!fechaInicio || !fechaFin) return;
    setCargando(true);
    setError("");
    setResultado(null);
    setClienteAbierto(null);
    setDocAbierto(null);
    try {
      const llamar = httpsCallable(functionsClient, "getFacturacionPorClienteBusint");
      const resp = await llamar({ fechaInicio, fechaFin });
      setResultado(resp.data);
    } catch (err) {
      setError(err?.message || "No se pudo consultar la facturación en Busint.");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    consultar();
  }, []);
  // (2026-09-02, a pedido de Fredy) Totales para las tarjetas nuevas de
  // arriba -- "Unidades despachadas (total)" solo suma los clientes que
  // YA están clasificados (Facturado o Consignación); los que faltan por
  // clasificar no cuentan todavía, para no sumar mal por adivinar.
  const totalesDespachados = (resultado?.clientes || []).reduce((acc, c) => {
    const tipo = tipoDeCliente(c);
    if (tipo === "facturado") {
      return { monto: acc.monto + c.facturado.monto + c.trasladoExternoNeto.monto, unidades: acc.unidades + c.facturado.unidades + c.trasladoExternoNeto.unidades };
    }
    if (tipo === "consignacion") {
      return { monto: acc.monto + c.consignacionNeta.monto + c.trasladoExternoNeto.monto, unidades: acc.unidades + c.consignacionNeta.unidades + c.trasladoExternoNeto.unidades };
    }
    return acc;
  }, { monto: 0, unidades: 0 });
  const clientesSinClasificar = (resultado?.clientes || []).filter((c) => !tipoDeCliente(c)).length;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginBottom: 4 }}>
        🧾 Facturación Clientes
      </div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 20 }}>
        Consulta en vivo a Busint. <b>Facturado</b> = FAC (venta real, para cruzar contra TNS). <b>Consignación</b> = TCO (lo que se despachó en consignación en el rango, sin restar devoluciones — el DTC se muestra aparte porque para varios clientes no es una devolución física, sino lo que ya se decidió facturar). <b>Traslado Externo</b> = TEX (despachos sin IVA), con DTE aparte igual.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "end", marginBottom: 20, flexWrap: "wrap" }}>
        <Field label="Desde">
          <FInput type="date" value={fechaInicio} onChange={setFechaInicio} />
        </Field>
        <Field label="Hasta">
          <FInput type="date" value={fechaFin} onChange={setFechaFin} />
        </Field>
        <div style={{ marginBottom: 14 }}>
          <Btn onClick={consultar} disabled={cargando || !fechaInicio || !fechaFin}>
            {cargando ? "Consultando..." : "🔍 Consultar"}
          </Btn>
        </div>
      </div>
      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: C.redBg, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}
      {cargando && (
        <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>Consultando Busint...</div>
      )}
      {resultado && !cargando && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", padding: 16, borderRadius: 10, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 4 }}>Facturado (FAC)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{fmtCOP(resultado.totalFacturado)}</div>
              <div style={{ fontSize: 12, color: C.slate }}>{fmtNum(resultado.totalUnidadesFacturadas)} und.</div>
            </div>
            <div style={{ flex: "1 1 220px", padding: 16, borderRadius: 10, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 4 }}>Consignación (despachado)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>{fmtCOP(resultado.totalConsignacionNeta)}</div>
              <div style={{ fontSize: 12, color: C.slate }}>{fmtNum(resultado.totalUnidadesConsignacion)} und.</div>
              {resultado.totalConsignacionDevuelta > 0 && (
                <div style={{ fontSize: 11, color: C.red, marginTop: 2 }}>de eso, {fmtCOP(resultado.totalConsignacionDevuelta)} ({fmtNum(resultado.totalUnidadesConsignacionDevueltas)} und.) ya se facturó (DTC)</div>
              )}
            </div>
            <div style={{ flex: "1 1 220px", padding: 16, borderRadius: 10, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 4 }}>Traslado Externo (despachado)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>{fmtCOP(resultado.totalTrasladoExternoNeto)}</div>
              <div style={{ fontSize: 12, color: C.slate }}>{fmtNum(resultado.totalUnidadesTrasladoExterno)} und.</div>
              {resultado.totalTrasladoExternoDevuelto > 0 && (
                <div style={{ fontSize: 11, color: C.red, marginTop: 2 }}>de eso, {fmtCOP(resultado.totalTrasladoExternoDevuelto)} ({fmtNum(resultado.totalUnidadesTrasladoExternoDevueltas)} und.) devuelto (DTE)</div>
              )}
            </div>
            <div style={{ flex: "1 1 140px", padding: 16, borderRadius: 10, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 4 }}>Clientes</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>{resultado.totalClientes}</div>
            </div>
            <div style={{ flex: "1 1 200px", padding: 16, borderRadius: 10, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 4 }}>Unidades facturadas</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{fmtNum(resultado.totalUnidadesFacturadas)}</div>
            </div>
            <div style={{ flex: "1 1 220px", padding: 16, borderRadius: 10, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 4 }}>Unidades despachadas (total)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.violet }}>{fmtCOP(totalesDespachados.monto)}</div>
              <div style={{ fontSize: 12, color: C.slate }}>{fmtNum(totalesDespachados.unidades)} und.</div>
              {clientesSinClasificar > 0 && (
                <div style={{ fontSize: 11, color: C.amber, marginTop: 2 }}>⚠ {clientesSinClasificar} cliente(s) sin clasificar (Facturado/Consignación) -- no cuentan todavía en este total.</div>
              )}
            </div>
          </div>
          {resultado.devolucionesSinPrecio > 0 && (
            <div style={{ padding: 10, borderRadius: 8, background: "#FFF6E5", color: "#8A6100", fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
              ⚠ {resultado.devolucionesSinPrecio} línea(s) de devolución no tenían precio real ni en la misma referencia/color/talla del cliente en este rango — quedaron valoradas en $0 (subestiman el neto). Prueba un rango de fechas más amplio si esto pesa mucho.
            </div>
          )}
          {resultado.columnasDisponibles && resultado.columnasDisponibles.length > 0 && (
            <details style={{ marginBottom: 16, fontSize: 12, color: C.slate }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>🔧 Ver columnas crudas que trae Busint (debug)</summary>
              <div style={{ marginTop: 8, padding: 10, background: C.white, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ marginBottom: 10 }}>
                  <b>Clientes cruzados por código:</b> {resultado.totalClientesCruzados} (de {resultado.totalClientes} clientes en el informe)
                </div>
                <div style={{ marginBottom: 6 }}><b>Columnas de ApiGen_FacturadoBusint:</b> {resultado.columnasDisponibles.join(", ")}</div>
                <pre style={{ fontSize: 11, overflowX: "auto", margin: "0 0 12px" }}>{JSON.stringify(resultado.primeraFilaCruda, null, 2)}</pre>
                <div style={{ marginBottom: 6 }}><b>Columnas de ApiGen_Clientes:</b> {(resultado.columnasClientesDisponibles || []).join(", ") || "—"}</div>
                <pre style={{ fontSize: 11, overflowX: "auto", margin: 0 }}>{JSON.stringify(resultado.primeraFilaClienteCruda, null, 2)}</pre>
              </div>
            </details>
          )}
          {resultado.clientes.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay facturación registrada en ese rango de fechas.</div>
          ) : (
            <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.canvas }}>
                    <th style={{ textAlign: "left", padding: "10px 12px" }}>Cliente</th>
                    <th style={{ textAlign: "right", padding: "10px 12px" }}>Facturado (FAC)</th>
                    <th style={{ textAlign: "right", padding: "10px 12px" }}>Consignación (despachado)</th>
                    <th style={{ textAlign: "right", padding: "10px 12px" }}>Traslado Ext. (despachado)</th>
                    <th style={{ textAlign: "center", padding: "10px 12px" }}>Tipo</th>
                    <th style={{ textAlign: "right", padding: "10px 12px" }}>Total despachado</th>
                    <th style={{ textAlign: "right", padding: "10px 12px" }}># Docs</th>
                    <th style={{ textAlign: "center", padding: "10px 12px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.clientes.map((c, i) => {
                    const clave = c.codigoCliente || c.nombreCliente;
                    const abierto = clienteAbierto === clave;
                    const tipoCliente = tipoDeCliente(c);
                    const totalDespachadoMonto =
                      tipoCliente === "facturado" ? c.facturado.monto + c.trasladoExternoNeto.monto
                      : tipoCliente === "consignacion" ? c.consignacionNeta.monto + c.trasladoExternoNeto.monto
                      : null;
                    const totalDespachadoUnidades =
                      tipoCliente === "facturado" ? c.facturado.unidades + c.trasladoExternoNeto.unidades
                      : tipoCliente === "consignacion" ? c.consignacionNeta.unidades + c.trasladoExternoNeto.unidades
                      : null;
                    return (
                      <Fragment key={clave}>
                        <tr
                          onClick={() => {
                            setClienteAbierto(abierto ? null : clave);
                            setFiltroTipoDoc("TODOS");
                            setDocAbierto(null);
                          }}
                          style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: i % 2 ? C.canvas : C.white }}
                        >
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: C.ink }}>{c.nombreCliente}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: C.green }}>{fmtCOP(c.facturado.monto)}</div>
                            <div style={{ fontSize: 11, color: C.slate }}>{fmtNum(c.facturado.unidades)} und.</div>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>
                            <div style={{ fontWeight: 700 }}>{fmtCOP(c.consignacionNeta.monto)}</div>
                            <div style={{ fontSize: 11, color: C.slate }}>{fmtNum(c.consignacionNeta.unidades)} und.</div>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>
                            <div style={{ fontWeight: 700 }}>{fmtCOP(c.trasladoExternoNeto.monto)}</div>
                            <div style={{ fontSize: 11, color: C.slate }}>{fmtNum(c.trasladoExternoNeto.unidades)} und.</div>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                            <select
                              value={tipoCliente}
                              onChange={(e) => guardarTipoCliente(c.codigoCliente, c.nombreCliente, e.target.value)}
                              style={{ fontSize: 12, padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.ink }}
                            >
                              <option value="">— elegir —</option>
                              <option value="facturado">Facturado</option>
                              <option value="consignacion">Consignación</option>
                            </select>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>
                            {totalDespachadoMonto !== null ? (
                              <>
                                <div style={{ fontWeight: 700, color: C.violet }}>{fmtCOP(totalDespachadoMonto)}</div>
                                <div style={{ fontSize: 11, color: C.slate }}>{fmtNum(totalDespachadoUnidades)} und.</div>
                              </>
                            ) : (
                              <span style={{ fontSize: 11, color: C.amber }}>⚠ clasificar</span>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: C.slate }}>{c.totalDocumentos}</td>
                          <td style={{ padding: "10px 12px", textAlign: "center", color: C.slate }}>{abierto ? "▲" : "▼"}</td>
                        </tr>
                        {abierto && (
                          <tr style={{ background: C.canvas }}>
                            <td colSpan={8} style={{ padding: "8px 12px 14px 24px" }}>
                              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12, fontSize: 12 }}>
                                <div><b>FAC:</b> {fmtCOP(c.facturado.monto)} ({fmtNum(c.facturado.unidades)} und.)</div>
                                <div><b>TCO despachado:</b> {fmtCOP(c.consignacionNeta.montoBruto)} ({fmtNum(c.consignacionNeta.unidadesBruto)} und.) · <b>DTC (ya facturado):</b> -{fmtCOP(c.consignacionNeta.montoDevuelto)} ({fmtNum(c.consignacionNeta.unidadesDevueltas)} und.) · si se restara, neto {fmtCOP(c.consignacionNeta.montoNeto)}</div>
                                <div><b>TEX despachado:</b> {fmtCOP(c.trasladoExternoNeto.montoBruto)} ({fmtNum(c.trasladoExternoNeto.unidadesBruto)} und.) · <b>DTE:</b> -{fmtCOP(c.trasladoExternoNeto.montoDevuelto)} ({fmtNum(c.trasladoExternoNeto.unidadesDevueltas)} und.) · si se restara, neto {fmtCOP(c.trasladoExternoNeto.montoNeto)}</div>
                                {c.otros && (
                                  <div style={{ color: C.red }}><b>Otros tipos sin clasificar ({c.otros.tipos.join(", ")}):</b> {fmtCOP(c.otros.monto)} ({fmtNum(c.otros.unidades)} und.)</div>
                                )}
                              </div>
                              {(() => {
                                const tiposEnCliente = [...new Set(c.documentos.map((d) => d.tipo))].sort();
                                const documentosFiltrados = filtroTipoDoc === "TODOS" ? c.documentos : c.documentos.filter((d) => d.tipo === filtroTipoDoc);
                                const unidadesFiltradas = documentosFiltrados.reduce((s, d) => s + d.unidades, 0);
                                const montoFiltrado = documentosFiltrados.reduce((s, d) => s + d.monto, 0);
                                return (
                                  <>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase" }}>
                                        Documentos ({documentosFiltrados.length}{filtroTipoDoc !== "TODOS" ? ` de ${c.documentos.length}` : ""})
                                      </div>
                                      <select
                                        value={filtroTipoDoc}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setFiltroTipoDoc(e.target.value)}
                                        style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.ink }}
                                      >
                                        <option value="TODOS">Todos los tipos ({c.documentos.length})</option>
                                        {tiposEnCliente.map((t) => (
                                          <option key={t} value={t}>
                                            {t} ({c.documentos.filter((d) => d.tipo === t).length})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontSize: 12, color: C.slate }}>
                                      <div>
                                        <b style={{ color: C.ink }}>{filtroTipoDoc === "TODOS" ? "Total mostrado" : `Total ${filtroTipoDoc}`}:</b>{" "}
                                        {fmtNum(unidadesFiltradas)} und. · {fmtCOP(montoFiltrado)}
                                      </div>
                                    </div>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.white, borderRadius: 8, overflow: "hidden" }}>
                                      <thead>
                                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Documento</th>
                                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Tipo</th>
                                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Fecha</th>
                                          <th style={{ textAlign: "right", padding: "6px 8px" }}>Unidades</th>
                                          <th style={{ textAlign: "right", padding: "6px 8px" }}>Monto</th>
                                          <th style={{ textAlign: "center", padding: "6px 8px" }}></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {documentosFiltrados.map((d) => {
                                    const claveDoc = `${clave}|${d.numero}`;
                                    const docOpen = docAbierto === claveDoc;
                                    return (
                                      <Fragment key={claveDoc}>
                                        <tr onClick={() => setDocAbierto(docOpen ? null : claveDoc)} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                                          <td style={{ padding: "6px 8px", fontWeight: 700 }}>{d.numero}</td>
                                          <td style={{ padding: "6px 8px" }}>
                                            <span style={{
                                              fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                                              background: d.tipo === "FAC" ? C.greenBg : (d.tipo === "DTE" || d.tipo === "DTC") ? C.redBg : C.canvas,
                                              color: d.tipo === "FAC" ? C.green : (d.tipo === "DTE" || d.tipo === "DTC") ? C.red : C.slate,
                                            }}>
                                              {d.tipo}
                                            </span>
                                          </td>
                                          <td style={{ padding: "6px 8px", color: C.slate }}>{d.fecha || "—"}</td>
                                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(d.unidades)}</td>
                                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{fmtCOP(d.monto)}</td>
                                          <td style={{ padding: "6px 8px", textAlign: "center", color: C.slate }}>{docOpen ? "▲" : "▼"}</td>
                                        </tr>
                                        {docOpen && (
                                          <tr>
                                            <td colSpan={6} style={{ padding: "6px 8px 12px 20px", background: C.canvas }}>
                                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                                <thead>
                                                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                                                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Referencia</th>
                                                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Pinta</th>
                                                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Color</th>
                                                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Talla</th>
                                                    <th style={{ textAlign: "right", padding: "4px 6px" }}>Cant.</th>
                                                    <th style={{ textAlign: "right", padding: "4px 6px" }}>Precio</th>
                                                    <th style={{ textAlign: "right", padding: "4px 6px" }}>Monto</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {d.lineas.map((l, li) => (
                                                    <tr key={li} style={{ borderBottom: `1px solid ${C.border}` }}>
                                                      <td style={{ padding: "4px 6px", fontWeight: 700 }}>{l.ref}</td>
                                                      <td style={{ padding: "4px 6px" }}>{l.pinta || "—"}</td>
                                                      <td style={{ padding: "4px 6px" }}>{l.color || "—"}</td>
                                                      <td style={{ padding: "4px 6px" }}>{l.talla || "—"}</td>
                                                      <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtNum(l.cantidad)}</td>
                                                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                                                        {l.descPct > 0 ? (
                                                          <>
                                                            <span style={{ textDecoration: "line-through", color: C.slate, fontSize: 10 }}>{fmtCOP(l.precio)}</span>{" "}
                                                            {fmtCOP(l.precioNeto)}
                                                            <span title={`Busint trae ${l.descPct}% de descuento en esta línea (campo "desc") — ya se restó del precio.`} style={{ color: C.red, fontSize: 10 }}> -{l.descPct}%</span>
                                                          </>
                                                        ) : (
                                                          fmtCOP(l.precio)
                                                        )}
                                                        {l.precioEstimado ? <span title="Esta fila no traía precio (devolución) — se usó el precio de otra fila con la misma referencia/pinta/color/talla del mismo cliente en el rango." style={{ color: C.slate }}> *</span> : null}
                                                      </td>
                                                      <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700 }}>{fmtCOP(l.monto)}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                                  </>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
// ─── DADO POR CUMPLIDO ──────────────────────────────────────────────────────
// (2026-09-08, a pedido de Fredy) Paso 1: Contabilidad revisa, lote por
// lote, si dejó ganancia antes de darlo por aprobado -- reemplaza (más
// adelante, Paso 2) el Excel que hoy arman a mano. Cantidad cortada,
// cantidad despachada, cliente, fecha y precio de venta llegan solos desde
// Busint (ver sincronizarDadoPorCumplidoPendientes en functions/index.js);
// lo único que se escribe a mano es el Costo Real Total del lote (el mismo
// número que ya se busca hoy en la pantalla de Busint "Gerencia -
// Histórico de Lotes y Variación de Costos") y la categoría BASE. Todo lo
// demás (Costo T., Venta T., Ganancia, Total) se calcula solo, con las
// fórmulas exactas del Excel "DADO POR CUMPLIDO 2026".
//
// Los 2 porcentajes de la fórmula y los valores de cada categoría BASE
// quedan guardados en Firestore (config/dado_por_cumplido y
// dado_por_cumplido_bases) para que Fredy los edite él mismo cuando
// cambien, sin depender de un cambio de código cada vez.
//
// OJO (Paso 1): al aprobar un lote todavía NO se crea nada en la bitácora
// de despachos -- eso es el Paso 2, una vez se comparen estos números
// contra el Excel real y queden validados.
const DADO_POR_CUMPLIDO_BASES_SEMILLA = [
  { id: "indutex", nombre: "Indutex", valor: 1136.68 },
  { id: "sin_admi", nombre: "Sin Admi", valor: 2017.63 },
  { id: "sin_admi_sin_diseno", nombre: "Sin Admi Sin Diseño", valor: 1246.63 },
  { id: "sin_diseno", nombre: "Sin Diseño", valor: 2676.63 },
];
const DADO_POR_CUMPLIDO_PORCENTAJES_SEMILLA = { porcentajeSobreCosto: 2.859, porcentajeSobreVenta: 1.9125 };

function calcularDadoPorCumplidoPreview({ costoRealTotal, cantCortada, cantDespachada, precioVentaUnitario, baseValor, porcentajeSobreCosto, porcentajeSobreVenta, costoDefinitivoManual }) {
  const cortada = Number(cantCortada) || 0;
  const despachada = Number(cantDespachada) || 0;
  const precioVenta = Number(precioVentaUnitario) || 0;
  const base = Number(baseValor) || 0;
  const costoReal = Number(costoRealTotal) || 0;
  // Costo Definitivo = ROUND(VR.Real / Cant.Cortada) -- ver la misma nota en
  // functions/index.js, calcularDadoPorCumplido (verificado contra las 794
  // filas reales del Excel histórico: 77% coincide exacto; el resto se
  // corrige a mano con costoDefinitivoManual).
  const manualCD = Number(costoDefinitivoManual) || 0;
  const costoDefinitivo = manualCD > 0 ? manualCD : (cortada > 0 ? Math.round(costoReal / cortada) : 0);
  const costoTRef = costoDefinitivo + costoDefinitivo * (Number(porcentajeSobreCosto) / 100) + precioVenta * (Number(porcentajeSobreVenta) / 100) + base;
  const costoT = costoTRef * cortada;
  const ventaT = precioVenta * despachada;
  const ganancia = ventaT - costoT;
  const gananciaPctLote = ventaT !== 0 ? ganancia / ventaT : 0;
  const gananciaPctRef = precioVenta !== 0 ? (precioVenta - costoTRef) / precioVenta : 0;
  const total = base * cortada;
  return { costoDefinitivo, costoTRef, costoT, ventaT, ganancia, gananciaPctLote, gananciaPctRef, total };
}

// (2026-09-10, a pedido de Fredy) Cuando Bodega ya registro en "Despachos
// Generales" cuanto se despacho de verdad de este lote, ese numero manda
// sobre el que llega sincronizado de Busint -- ver bitacora del caso
// 7231/7235 (una sola factura de Busint junto dos lotes y le sumo el total
// combinado a uno solo). Mismo criterio en functions/index.js,
// despachadaEfectivaLote (aprobarDadoPorCumplido usa esa version server-side).
function despachadaEfectiva(l) {
  return l?.cantidadDespachadaBodega !== undefined ? (Number(l.cantidadDespachadaBodega) || 0) : (Number(l?.cantDespachada) || 0);
}

function fmtPesos(n) {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
}
function fmtPct(n) {
  return (Number(n) * 100 || 0).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

// Estilo del Excel de "Dado por cumplido" (exportarDadoPorCumplidoExcel más
// abajo) -- usa "xlsx-js-style" en vez de "xlsx" (mismo criterio ya usado en
// los Excel de Bodega) porque xlsx (SheetJS) gratis no soporta colores de
// celda. Encabezado azul con letra blanca, filas alternadas para que se lea
// mejor, y en rojo negrita las filas sin Costo Definitivo todavía (el ~20%
// que hay que revisar a mano) -- igual a como Fredy ya marca esas filas en
// su propio Excel.
const BORDE_FINO_DPC = { style: "thin", color: { rgb: "B7B7B7" } };
const TODOS_BORDES_DPC = { top: BORDE_FINO_DPC, bottom: BORDE_FINO_DPC, left: BORDE_FINO_DPC, right: BORDE_FINO_DPC };
const ESTILO_HEADER_DPC = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F4E78" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: TODOS_BORDES_DPC };
const ESTILO_FILA_DPC = { border: TODOS_BORDES_DPC, alignment: { vertical: "center" } };
const ESTILO_FILA_ALT_DPC = { fill: { fgColor: { rgb: "F2F6FB" } }, border: TODOS_BORDES_DPC, alignment: { vertical: "center" } };
const ESTILO_FILA_SIN_COSTO_DPC = { font: { bold: true, color: { rgb: "C0392B" } }, border: TODOS_BORDES_DPC, alignment: { vertical: "center" } };
const FORMATO_MONEDA_DPC = '"$" #,##0';
const FORMATO_PORCENTAJE_DPC = "0.00%";
const COLUMNAS_MONEDA_DPC = new Set(["VR. TEORICO ", "VR. REAL ", "COSTO DEFINITIVO", "COSTO T", "PRECIO VENTA U.", "VENTA T.", "Venta T. - Costo T.", "Costo T. Ref.", "BASE", "TRANSPORTE", "TOTAL"]);
const COLUMNAS_PORCENTAJE_DPC = new Set(["% Ganancia/Lote", "% Ganancia/Ref."]);

function DadoPorCumplidoView({ currentUser, puedeAdministrarBases, puedeSincronizar }) {
  const isAdmin = currentUser?.isAdmin;
  // (2026-09-17, a pedido de Fredy) "puedeAdministrarBases": permiso puntual
  // (rol, ver App.js) para que alguien SIN admin total pueda crear y
  // configurar las Categorías BASE (y porcentajes de la fórmula) -- nada
  // más. Las acciones destructivas (vaciar historial completo, eliminar
  // lote histórico) siguen siendo exclusivas de isAdmin, sin cambios.
  const puedeConfigurarBases = isAdmin || !!puedeAdministrarBases;
  // (2026-09-24, a pedido de Fredy) "puedeSincronizar": mismo patrón --
  // permiso puntual (rol, ver App.js) para que alguien SIN admin total pueda
  // usar el botón "🔄 Buscar lotes nuevos".
  const puedeUsarSincronizar = isAdmin || !!puedeSincronizar;
  const [lotes, setLotes] = useState([]);
  const [bases, setBases] = useState([]);
  const [config, setConfig] = useState(DADO_POR_CUMPLIDO_PORCENTAJES_SEMILLA);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState(null);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [vistaDadoPorCumplido, setVistaDadoPorCumplido] = useState("pendientes");
  const [busquedaDadoPorCumplido, setBusquedaDadoPorCumplido] = useState("");
  const [subVistaPendientes, setSubVistaPendientes] = useState("conFactura");
  const [vaciandoHistorico, setVaciandoHistorico] = useState(false);
  // (2026-09-19, a pedido de Fredy) Un lote marcado "Con factura" puede ser
  // por una factura real de Busint, O por un Traslado en Consignación/
  // Externo (TCO/TEX) -- Busint todavía no emite la factura real hasta que
  // el cliente confirma la venta (ver sincronizarDadoPorCumplidoPendientes
  // en functions/index.js). Antes de aprobar uno de estos últimos, se pide
  // confirmación aparte porque el Costo Real Total todavía no se puede
  // sacar de una factura real.
  const [confirmAprobarTraslado, setConfirmAprobarTraslado] = useState(null);
  // (2026-09-21, a pedido de Fredy) Lote elegido para "marcar con factura a
  // mano" -- ver guardarFacturaManual mas abajo.
  const [confirmFacturaManual, setConfirmFacturaManual] = useState(null);

  useEffect(() => {
    const unsubLotes = onSnapshot(collection(db, "dado_por_cumplido_lotes"), (snap) => {
      setLotes(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    const unsubBases = onSnapshot(collection(db, "dado_por_cumplido_bases"), (snap) => {
      setBases(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubConfig = onSnapshot(doc(db, "config", "dado_por_cumplido"), (snap) => {
      if (snap.exists()) setConfig(snap.data());
    });
    return () => {
      unsubLotes();
      unsubBases();
      unsubConfig();
    };
  }, []);

  // Siembra inicial (solo admin, solo si no existe todavía) -- para que la
  // pantalla funcione desde el primer momento sin tener que ir a crear los
  // documentos a mano en Firestore.
  useEffect(() => {
    if (!isAdmin || loading) return;
    (async () => {
      const basesSnap = await getDocs(collection(db, "dado_por_cumplido_bases"));
      if (basesSnap.empty) {
        await Promise.all(DADO_POR_CUMPLIDO_BASES_SEMILLA.map((b) => fsSave("dado_por_cumplido_bases", b.id, { nombre: b.nombre, valor: b.valor })));
      }
      const configRef = doc(db, "config", "dado_por_cumplido");
      const configSnap = await getDocs(collection(db, "config"));
      const yaExiste = configSnap.docs.some((d) => d.id === "dado_por_cumplido");
      if (!yaExiste) {
        await setDoc(configRef, DADO_POR_CUMPLIDO_PORCENTAJES_SEMILLA, { merge: true });
      }
    })();
  }, [isAdmin, loading]);

  async function sincronizarAhora() {
    setSincronizando(true);
    try {
      const llamar = httpsCallable(functionsClient, "sincronizarDadoPorCumplidoPendientesAhora");
      const resp = await llamar();
      const d = resp.data || {};
      const porTraslado = (d.creadosPorTraslado || 0) + (d.actualizadosPorTraslado || 0);
      const corregidos = d.corregidosSinTraslado || 0;
      alert(`Listo — ${d.creados || 0} lote(s) nuevo(s), ${d.actualizados || 0} actualizado(s) (de ${d.totalLotesDetectados || 0} detectados en facturas recientes)${porTraslado ? `, ${porTraslado} lote(s) más con traslado en consignación/externo` : ""}${corregidos ? `, ${corregidos} lote(s) corregido(s) (traslado quitado por ya no aplicar)` : ""}.`);
    } catch (err) {
      alert("No se pudo buscar lotes nuevos: " + (err?.message || err));
    } finally {
      setSincronizando(false);
    }
  }

  async function guardarCampo(id, campo, valor) {
    await fsSave("dado_por_cumplido_lotes", id, { [campo]: valor });
  }

  // Corrección manual de Cant. Cortada -- para lotes que Busint ya sacó de su
  // panel de flujo operacional (facturados hace tiempo) y donde por eso no
  // llega solo. Una vez se marca como manual, la sincronización automática
  // (cada 2 horas) ya no lo vuelve a pisar -- ver sincronizarDadoPorCumplidoPendientes.
  async function guardarCantCortadaManual(id, valor) {
    await fsSave("dado_por_cumplido_lotes", id, { cantCortada: parseFloat(valor) || 0, cantCortadaManual: true });
  }

  // Corrección manual de Cant. Despachada -- para cuando Busint todavía no
  // trae el número correcto de este lote (p.ej. juntó dos lotes en una sola
  // factura) y Bodega tampoco lo ha registrado aún en Despachos Generales.
  // En cuanto Bodega SÍ lo registre ahí, ese valor manda sobre este -- ver
  // despachadaEfectiva más arriba.
  async function guardarCantDespachadaManual(id, valor) {
    await fsSave("dado_por_cumplido_lotes", id, { cantDespachada: parseFloat(valor) || 0, cantDespachadaManual: true });
  }

  // Corrección manual de Costo Definitivo -- para el ~20% de lotes donde
  // Busint trae un número distinto al de la fórmula (VR.Real ÷ Cant.Cortada)
  // por algo propio de ese lote. Igual que cantCortadaManual, una vez
  // marcado como manual, aprobarDadoPorCumplido ya no lo recalcula.
  async function guardarCostoDefinitivoManual(id, valor) {
    await fsSave("dado_por_cumplido_lotes", id, { costoDefinitivo: parseFloat(valor) || 0, costoDefinitivoManual: true });
  }

  // Marcar "Con factura" a mano -- para cuando la persona que digita la
  // factura en Busint olvido escribir "LOTE <numero>" en el comentario y
  // por eso la sincronizacion automatica (loteDesdeComentarios, en
  // functions/index.js) nunca lo puede emparejar solo. Una vez marcado,
  // queda igual que un match real: se habilita Costo Real Total/Categoria
  // BASE y el boton Aprobar.
  async function guardarFacturaManual(id) {
    await fsSave("dado_por_cumplido_lotes", id, {
      tieneFactura: true,
      tieneFacturaManual: true,
      observacionesFactura: "Marcado a mano como facturado -- la factura de Busint no traia el numero de lote en el comentario.",
    });
  }

  // Corrección manual de Precio Venta Unitario -- necesario sobre todo para
  // los lotes marcados "con factura a mano" (ver guardarFacturaManual), que
  // nunca hicieron match automático y por eso llegan con precio en $0 (lo
  // que deja Venta T. y Ganancia mal calculados). Si más adelante sí llega
  // un match real de Busint, ese valor real pisa a este igual que siempre.
  async function guardarPrecioVentaManual(id, valor) {
    await fsSave("dado_por_cumplido_lotes", id, { precioVentaUnitario: parseFloat(valor) || 0, precioVentaUnitarioManual: true });
  }

  // Descarga la pantalla completa (pendientes + aprobados) con la misma
  // estructura de columnas del Excel histórico de Contabilidad. Para los
  // lotes aún no aprobados, calcula con la misma fórmula que la vista previa
  // (puede venir incompleto si todavía falta Costo Real Total o Categoría BASE).
  async function exportarDadoPorCumplidoExcel() {
    const XLSX = await import("xlsx-js-style");
    const filas = [...lotes]
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
      .map((l) => {
        let datos = l;
        if (l.estado !== "aprobado") {
          const baseElegida = bases.find((b) => b.id === l.categoriaBaseId);
          const preview = calcularDadoPorCumplidoPreview({
            costoRealTotal: l.costoRealTotal,
            cantCortada: l.cantCortada,
            cantDespachada: despachadaEfectiva(l),
            precioVentaUnitario: l.precioVentaUnitario,
            baseValor: baseElegida?.valor,
            porcentajeSobreCosto: config.porcentajeSobreCosto,
            porcentajeSobreVenta: config.porcentajeSobreVenta,
            costoDefinitivoManual: l.costoDefinitivoManual ? l.costoDefinitivo : null,
          });
          datos = { ...l, ...preview, cantDespachada: despachadaEfectiva(l), baseValorUsado: baseElegida?.valor ?? l.baseValorUsado };
        }
        return {
          "FECHA": datos.fecha || "",
          "NRO LOTE": datos.numLote,
          "REFERENCIA ": datos.referencia || "",
          "CANT. CORTADA": datos.cantCortada ?? "",
          "CANT . DESPACHADA ": datos.cantDespachada ?? "",
          "VR. TEORICO ": datos.vrTeorico ?? "",
          "VR. REAL ": datos.costoRealTotal ?? "",
          "COSTO DEFINITIVO": datos.costoDefinitivo ?? "",
          "COSTO T": datos.costoT ?? "",
          "PRECIO VENTA U.": datos.precioVentaUnitario ?? "",
          "VENTA T.": datos.ventaT ?? "",
          "Venta T. - Costo T.": datos.ganancia ?? "",
          "% Ganancia/Lote": datos.gananciaPctLote ?? "",
          "Costo T. Ref.": datos.costoTRef ?? "",
          "% Ganancia/Ref.": datos.gananciaPctRef ?? "",
          "CLIENTE": datos.cliente || "",
          "OBS.": datos.observaciones || "",
          "BASE": datos.baseValorUsado ?? "",
          "TRANSPORTE": datos.transporte ?? "",
          "TOTAL": datos.total ?? "",
        };
      });
    const ws = XLSX.utils.json_to_sheet(filas);
    const encabezados = Object.keys(filas[0] || {});
    encabezados.forEach((_, c) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = ESTILO_HEADER_DPC;
    });
    filas.forEach((fila, i) => {
      const r = i + 1; // la fila 0 es el encabezado
      const sinCostoDefinitivo = !fila["COSTO DEFINITIVO"];
      encabezados.forEach((h, c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) return;
        cell.s = sinCostoDefinitivo ? ESTILO_FILA_SIN_COSTO_DPC : (i % 2 === 1 ? ESTILO_FILA_ALT_DPC : ESTILO_FILA_DPC);
        if (COLUMNAS_MONEDA_DPC.has(h)) cell.z = FORMATO_MONEDA_DPC;
        if (COLUMNAS_PORCENTAJE_DPC.has(h)) cell.z = FORMATO_PORCENTAJE_DPC;
      });
    });
    ws["!cols"] = encabezados.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dado por cumplido");
    XLSX.writeFile(wb, `DADO POR CUMPLIDO ${today()}.xlsx`);
  }

  // Respaldo en Excel de lotes del historial -- se descarga automático justo
  // antes de mandarlos a la Papelera (eliminarLoteHistorico/
  // vaciarHistoricoCompleto más abajo), con toda la información del lote
  // (incluyendo factura, envío y bodega) para que quede una copia aparte
  // además de la que ya se puede restaurar desde la Papelera.
  async function descargarExcelLotes(lotesArr, nombreArchivo) {
    const XLSX = await import("xlsx");
    const filas = lotesArr.map((l) => ({
      "FECHA": l.fecha || "",
      "NRO LOTE": l.numLote,
      "REFERENCIA": l.referencia || "",
      "CLIENTE": l.cliente || "",
      "CANT. CORTADA": l.cantCortada ?? "",
      "CANT. DESPACHADA": l.cantDespachada ?? "",
      "VR. TEORICO": l.vrTeorico ?? "",
      "VR. REAL": l.costoRealTotal ?? "",
      "COSTO DEFINITIVO": l.costoDefinitivo ?? "",
      "COSTO T": l.costoT ?? "",
      "PRECIO VENTA U.": l.precioVentaUnitario ?? "",
      "VENTA T.": l.ventaT ?? "",
      "GANANCIA": l.ganancia ?? "",
      "% GANANCIA/LOTE": l.gananciaPctLote ?? "",
      "COSTO T. REF.": l.costoTRef ?? "",
      "% GANANCIA/REF.": l.gananciaPctRef ?? "",
      "BASE": l.baseValorUsado ?? "",
      "TRANSPORTE": l.transporte ?? "",
      "TOTAL": l.total ?? "",
      "OBSERVACIONES": l.observaciones || "",
      "OBSERVACIONES FACTURA": l.observacionesFactura || "",
      "ESTADO ENVÍO": l.estadoEnvio === "recibido" ? "Recibido" : l.estadoEnvio === "enviado" ? "Enviado" : "",
      "TRANSPORTADOR": l.transportador || "",
      "GUÍA": l.numeroGuia || "",
      "FECHA ENVÍO": l.fechaEnvio || "",
      "FECHA RECIBIDO": l.fechaRecibido || "",
      "DESPACHO": l.despachoCodigo || "",
      "CANT. DESPACHADA BODEGA": l.cantidadDespachadaBodega ?? "",
      "SACRIFICIOS": l.sacrificios ?? "",
      "SEGUNDAS": l.segundas ?? "",
      "COBRO PLANTA": l.cobroPlanta ?? "",
      "COBROS": (l.cobrosBodega || []).map((c) => `${c.trabajadorNombre} (${c.tipo}): ${c.valor}`).join(" / "),
      "OBSERVACIONES ENVÍO": l.observacionesEnvio || "",
    }));
    const ws2 = XLSX.utils.json_to_sheet(filas);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws2, "Respaldo");
    XLSX.writeFile(wb2, nombreArchivo);
  }

  // Borrado suave (Papelera): "eliminar" desde Históricos nunca borra el
  // lote de Firestore, solo lo marca con eliminado:true -- así queda
  // recuperable desde Administración → Papelera, y un error de más siempre
  // se puede deshacer desde ahí.
  async function eliminarLoteHistorico(l) {
    if (!window.confirm(`¿Eliminar el lote ${l.numLote} del historial? Se descarga un respaldo en Excel y queda en la Papelera (Administración) por si hay que restaurarlo. ¿Continuar?`)) return;
    await descargarExcelLotes([l], `Respaldo Lote ${l.numLote} ${today()}.xlsx`);
    await fsSave("dado_por_cumplido_lotes", l.id, {
      eliminado: true,
      eliminadoEn: new Date().toISOString(),
      eliminadoPor: currentUser?.name || "",
    });
  }

  // Vacía Históricos completo de una sola vez -- mismo mecanismo (respaldo +
  // Papelera), aplicado a todos los lotes aprobados visibles en ese momento.
  async function vaciarHistoricoCompleto() {
    if (!aprobados.length) return;
    if (!window.confirm(`Esto va a mover ${aprobados.length} lote(s) del historial completo a la Papelera (Administración) y descargar antes un respaldo en Excel con todos ellos. Quedan recuperables desde ahí. ¿Continuar?`)) return;
    setVaciandoHistorico(true);
    try {
      await descargarExcelLotes(aprobados, `Respaldo Historico Dado por Cumplido ${today()}.xlsx`);
      const eliminadoEn = new Date().toISOString();
      const eliminadoPor = currentUser?.name || "";
      for (let i = 0; i < aprobados.length; i += 450) {
        const grupo = aprobados.slice(i, i + 450);
        const batch = writeBatch(db);
        grupo.forEach((l) => {
          batch.set(doc(db, "dado_por_cumplido_lotes", l.id), { eliminado: true, eliminadoEn, eliminadoPor }, { merge: true });
        });
        await batch.commit();
      }
      alert(`Listo -- ${aprobados.length} lote(s) movido(s) a la Papelera.`);
    } catch (err) {
      alert("No se pudo vaciar el historial: " + (err?.message || err));
    }
    setVaciandoHistorico(false);
  }

  async function aprobar(id) {
    setAprobandoId(id);
    try {
      const llamar = httpsCallable(functionsClient, "aprobarDadoPorCumplido");
      await llamar({ id });
    } catch (err) {
      alert("No se pudo aprobar: " + (err?.message || err));
    } finally {
      setAprobandoId(null);
    }
  }

  async function guardarConfig(campo, valor) {
    await setDoc(doc(db, "config", "dado_por_cumplido"), { [campo]: valor }, { merge: true });
  }
  async function guardarBase(id, campo, valor) {
    await fsSave("dado_por_cumplido_bases", id, { [campo]: valor });
  }
  async function agregarBase() {
    const nombre = prompt("Nombre de la nueva categoría BASE:");
    if (!nombre || !nombre.trim()) return;
    const id = nombre.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || uid();
    await fsSave("dado_por_cumplido_bases", id, { nombre: nombre.trim(), valor: 0 });
  }
  async function eliminarBase(id) {
    if (!window.confirm("¿Eliminar esta categoría BASE?")) return;
    await fsDelete("dado_por_cumplido_bases", id);
  }

  // (2026-09-24, a pedido de Fredy) Si Busint ya reporto que el lote regreso a
  // una etapa anterior a BPT (Bodega de Producto Terminado), no debe seguir
  // apareciendo aqui como pendiente -- salvo que ya tenga factura real o
  // traslado confirmado, esos siempre quedan con enBpt=true. Los lotes viejos
  // sin este campo (de antes de este cambio) se siguen mostrando igual.
  const pendientes = lotes.filter((l) => l.estado !== "aprobado" && l.enBpt !== false).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const aprobados = lotes.filter((l) => l.estado === "aprobado" && !l.eliminado).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const filtroDadoPorCumplido = busquedaDadoPorCumplido.trim().toLowerCase();
  const coincideBusquedaDadoPorCumplido = (l) =>
    !filtroDadoPorCumplido ||
    String(l.numLote || "").toLowerCase().includes(filtroDadoPorCumplido) ||
    String(l.referencia || "").toLowerCase().includes(filtroDadoPorCumplido) ||
    String(l.cliente || "").toLowerCase().includes(filtroDadoPorCumplido);
  const pendientesFiltrados = pendientes.filter(coincideBusquedaDadoPorCumplido);
  const aprobadosFiltrados = aprobados.filter(coincideBusquedaDadoPorCumplido);
  const pendientesConFactura = pendientesFiltrados.filter((l) => l.tieneFactura !== false);
  const pendientesSinFactura = pendientesFiltrados.filter((l) => l.tieneFactura === false);
  const pendientesOrdenados = [...pendientesConFactura, ...pendientesSinFactura];

  if (loading) {
    return <div style={{ padding: 30, textAlign: "center", color: C.slate }}>Cargando...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginBottom: 4 }}>✅ Dado por Cumplido</div>
          <div style={{ fontSize: 13, color: C.slate, maxWidth: 640 }}>
            Cada vez que se factura un lote en Busint, aparece aquí solo (revisa las facturas cada 2 horas). Escribe el Costo Real Total (el mismo número que ya buscas en Busint) y elige la categoría BASE — el resto se calcula solo.
          </div>
        </div>
        {(puedeConfigurarBases || isAdmin || puedeUsarSincronizar) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {puedeConfigurarBases && (
              <Btn variant="ghost" small onClick={() => setMostrarConfig((v) => !v)}>⚙️ Configuración</Btn>
            )}
            {puedeUsarSincronizar && (
              <Btn variant="secondary" small onClick={sincronizarAhora} disabled={sincronizando}>
                {sincronizando ? "Buscando..." : "🔄 Buscar lotes nuevos"}
              </Btn>
            )}
            {isAdmin && (
              <Btn variant="ghost" small onClick={exportarDadoPorCumplidoExcel}>📥 Descargar Excel</Btn>
            )}
          </div>
        )}
      </div>

      {mostrarConfig && puedeConfigurarBases && (
        <div style={{ margin: "16px 0", padding: 16, border: `1px solid ${C.border}`, borderRadius: 12, background: C.canvas }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.ink, marginBottom: 10 }}>Porcentajes de la fórmula</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
            <Field label="% sobre el Costo Definitivo">
              <FInput type="number" value={config.porcentajeSobreCosto ?? ""} onChange={(v) => guardarConfig("porcentajeSobreCosto", parseFloat(v) || 0)} />
            </Field>
            <Field label="% sobre el Precio de Venta">
              <FInput type="number" value={config.porcentajeSobreVenta ?? ""} onChange={(v) => guardarConfig("porcentajeSobreVenta", parseFloat(v) || 0)} />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>Categorías BASE</div>
            <Btn variant="ghost" small onClick={agregarBase}>+ Agregar categoría</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bases.map((b) => (
              <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <FInput value={b.nombre || ""} onChange={(v) => guardarBase(b.id, "nombre", v)} />
                </div>
                <div style={{ width: 140 }}>
                  <FInput type="number" value={b.valor ?? ""} onChange={(v) => guardarBase(b.id, "valor", parseFloat(v) || 0)} />
                </div>
                <Btn variant="ghost" small onClick={() => eliminarBase(b.id)}>🗑</Btn>
              </div>
            ))}
            {!bases.length && <div style={{ fontSize: 12, color: C.slate }}>Sin categorías todavía.</div>}
          </div>
        </div>
      )}

      <div style={{ height: 1, background: C.border, margin: "18px 0" }} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Btn variant={vistaDadoPorCumplido === "pendientes" ? "primary" : "secondary"} small onClick={() => setVistaDadoPorCumplido("pendientes")}>
          Pendientes ({pendientes.length})
        </Btn>
        <Btn variant={vistaDadoPorCumplido === "historicos" ? "primary" : "secondary"} small onClick={() => setVistaDadoPorCumplido("historicos")}>
          Históricos ({aprobados.length})
        </Btn>
      </div>

      <div style={{ maxWidth: 360, marginBottom: 20 }}>
        <FInput value={busquedaDadoPorCumplido} onChange={setBusquedaDadoPorCumplido} placeholder="🔎 Buscar por lote, referencia o cliente..." />
      </div>

      {vistaDadoPorCumplido === "pendientes" ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Btn variant={subVistaPendientes === "conFactura" ? "primary" : "secondary"} small onClick={() => setSubVistaPendientes("conFactura")}>
              🧾 Con factura ({pendientesConFactura.length})
            </Btn>
            <Btn variant={subVistaPendientes === "sinFactura" ? "primary" : "secondary"} small onClick={() => setSubVistaPendientes("sinFactura")}>
              ⏳ Sin factura ({pendientesSinFactura.length})
            </Btn>
          </div>
          {!(subVistaPendientes === "conFactura" ? pendientesConFactura : pendientesSinFactura).length ? (
            <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13 }}>
              {filtroDadoPorCumplido
                ? "Ningún pendiente coincide con la búsqueda."
                : subVistaPendientes === "conFactura"
                ? "No hay lotes con factura por revisar."
                : "No hay lotes sin factura por ahora."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(subVistaPendientes === "conFactura" ? pendientesConFactura : pendientesSinFactura).map((l) => {
                const baseElegida = bases.find((b) => b.id === l.categoriaBaseId);
                const tieneDespachadaBodega = l.cantidadDespachadaBodega !== undefined;
                const despachadaMostrada = despachadaEfectiva(l);
                const despachadaSospechosa = !tieneDespachadaBodega && Number(l.cantCortada) > 0 && despachadaMostrada > Number(l.cantCortada);
                const preview = calcularDadoPorCumplidoPreview({
                  costoRealTotal: l.costoRealTotal,
                  cantCortada: l.cantCortada,
                  cantDespachada: despachadaMostrada,
                  precioVentaUnitario: l.precioVentaUnitario,
                  baseValor: baseElegida?.valor,
                  porcentajeSobreCosto: config.porcentajeSobreCosto,
                  porcentajeSobreVenta: config.porcentajeSobreVenta,
                  costoDefinitivoManual: l.costoDefinitivoManual ? l.costoDefinitivo : null,
                });
                const sinFactura = l.tieneFactura === false;
                const listoParaAprobar = Number(l.costoRealTotal) > 0 && !!l.categoriaBaseId && !sinFactura;
                // (2026-09-19, a pedido de Fredy) "Con factura" en este
                // sistema junta 2 casos que en Busint son MUY distintos:
                // una factura real (FAC), o un Traslado en Consignación/
                // Externo (TCO/TEX) que todavía no tiene factura real --
                // ver comentario junto a confirmAprobarTraslado más arriba.
                // Antes esto no se distinguía en pantalla y parecía que el
                // lote ya estaba facturado en Busint cuando en realidad no.
                const esTraslado = String(l.observacionesFactura || "").startsWith("Traslado");
                return (
                  <div key={l.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>Lote {l.numLote} — {l.referencia || "(sin referencia)"}</div>
                        <div style={{ fontSize: 12, color: C.slate }}>{l.cliente || "(sin cliente)"} · {l.fecha || "(sin fecha)"}</div>
                        {l.observacionesFactura && (
                          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: esTraslado ? C.amber : C.green }}>
                            {esTraslado ? "🔄 " : "🧾 "}{l.observacionesFactura}
                          </div>
                        )}
                        {sinFactura && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>🚫 Sin factura de Busint (no se encontró el número de lote en ningún comentario)</span>
                            <Btn small variant="secondary" onClick={() => setConfirmFacturaManual(l)}>📝 Marcar con factura a mano</Btn>
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 18, fontSize: 12, color: C.slate, flexWrap: "wrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          Cant. Cortada:
                          <input
                            type="number"
                            value={l.cantCortada ?? ""}
                            onChange={(e) => guardarCantCortadaManual(l.id, e.target.value)}
                            title={l.cantCortadaManual ? "Corregido a mano -- ya no se sobreescribe con Busint." : "Si Busint ya no trae este dato (lote facturado hace tiempo), corrígelo aquí usando el reporte \"Seguimiento a Lotes\" de Busint (línea \"Cortado\", columna Entradas)."}
                            style={{ width: 72, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", fontWeight: 700, color: C.ink }}
                          />
                          {l.cantCortadaManual && <span title="Corregido a mano">✍️</span>}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          Cant. Despachada:
                          {tieneDespachadaBodega ? (
                            <>
                              <strong style={{ color: C.ink }}>{fmtNum(despachadaMostrada)}</strong>
                              <span title="Viene de lo que Bodega ya registró en Despachos Generales (validado contra Sacrificios + Segundas)." style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>📦 Desp. Generales</span>
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                value={l.cantDespachada ?? ""}
                                onChange={(e) => guardarCantDespachadaManual(l.id, e.target.value)}
                                title={l.cantDespachadaManual ? "Corregido a mano -- ya no se sobreescribe con Busint." : "Estimado automático de Busint -- Bodega todavía no lo registra en Despachos Generales. Si Busint juntó varios lotes en una sola factura, corrígelo aquí."}
                                style={{ width: 72, padding: "2px 6px", border: `1px solid ${despachadaSospechosa ? C.red : C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", fontWeight: 700, color: C.ink }}
                              />
                              {l.cantDespachadaManual && <span title="Corregido a mano">✍️</span>}
                            </>
                          )}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          Precio Venta U.:
                          <input
                            type="number"
                            value={l.precioVentaUnitario ?? ""}
                            onChange={(e) => guardarPrecioVentaManual(l.id, e.target.value)}
                            title={l.precioVentaUnitarioManual ? "Corregido a mano -- ya no se sobreescribe salvo que llegue una factura real de Busint." : "Viene de Busint (factura real o traslado). Si el lote se marcó \"con factura a mano\", complétalo aquí con el valor real de la factura."}
                            style={{ width: 90, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", fontWeight: 700, color: C.ink }}
                          />
                          {l.precioVentaUnitarioManual && <span title="Corregido a mano">✍️</span>}
                        </span>
                      </div>
                    </div>
                    {despachadaSospechosa && (
                      <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 10 }}>
                        ⚠ Cant. Despachada ({fmtNum(despachadaMostrada)}) es mayor que Cant. Cortada ({fmtNum(l.cantCortada)}) — puede que Busint haya juntado varios lotes en una sola factura. Corrígela arriba, o espera a que Bodega la registre en Despachos Generales.
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
                      <Field label="Costo Real Total (de Busint)">
                        <FInput type="number" value={l.costoRealTotal ?? ""} onChange={(v) => guardarCampo(l.id, "costoRealTotal", parseFloat(v) || null)} placeholder="Ej: 4841270" />
                      </Field>
                      <Field label="VR. Teórico">
                        <FInput type="number" value={l.vrTeorico ?? ""} onChange={(v) => guardarCampo(l.id, "vrTeorico", parseFloat(v) || null)} placeholder="Ej: 3057754" />
                      </Field>
                      <Field label="Transporte">
                        <FInput type="number" value={l.transporte ?? ""} onChange={(v) => guardarCampo(l.id, "transporte", parseFloat(v) || null)} placeholder="Ej: 220" />
                      </Field>
                      <Field label="Observaciones">
                        <FInput value={l.observaciones ?? ""} onChange={(v) => guardarCampo(l.id, "observaciones", v)} placeholder="Opcional" />
                      </Field>
                      <Field label="Categoría BASE">
                        <select
                          value={l.categoriaBaseId || ""}
                          onChange={(e) => guardarCampo(l.id, "categoriaBaseId", e.target.value)}
                          style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", minWidth: 200 }}
                        >
                          <option value="">Elegir...</option>
                          {bases.map((b) => (
                            <option key={b.id} value={b.id}>{b.nombre} ({fmtPesos(b.valor)})</option>
                          ))}
                        </select>
                      </Field>
                      <Btn onClick={() => (esTraslado ? setConfirmAprobarTraslado(l) : aprobar(l.id))} disabled={!listoParaAprobar || aprobandoId === l.id}>
                        {aprobandoId === l.id ? "Aprobando..." : "✅ Aprobar"}
                      </Btn>
                    </div>
                    {listoParaAprobar && (
                      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", padding: 12, background: C.canvas, borderRadius: 8, fontSize: 12, color: C.slate }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          Costo Definitivo:
                          <input
                            type="number"
                            value={preview.costoDefinitivo ?? ""}
                            onChange={(e) => guardarCostoDefinitivoManual(l.id, e.target.value)}
                            title={l.costoDefinitivoManual ? "Corregido a mano -- ya no se recalcula solo." : "Se calcula solo (VR.Real ÷ Cant.Cortada). Si Busint trae un número distinto para este lote en particular, corrígelo aquí."}
                            style={{ width: 72, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", fontWeight: 700, color: C.ink, background: C.white }}
                          />
                          {l.costoDefinitivoManual && <span title="Corregido a mano">✍️</span>}
                        </span>
                        <span>Costo T.: <strong style={{ color: C.ink }}>{fmtPesos(preview.costoT)}</strong></span>
                        <span>Venta T.: <strong style={{ color: C.ink }}>{fmtPesos(preview.ventaT)}</strong></span>
                        <span>Ganancia: <strong style={{ color: preview.ganancia >= 0 ? C.green : C.red }}>{fmtPesos(preview.ganancia)} ({fmtPct(preview.gananciaPctLote)})</strong></span>
                        <span>% Ganancia/Ref.: <strong style={{ color: C.ink }}>{fmtPct(preview.gananciaPctRef)}</strong></span>
                        <span>Total BASE: <strong style={{ color: C.ink }}>{fmtPesos(preview.total)}</strong></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isAdmin && aprobados.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
              <Btn variant="danger" small onClick={vaciarHistoricoCompleto} disabled={vaciandoHistorico}>
                {vaciandoHistorico ? "Vaciando..." : "🗑 Vaciar historial completo"}
              </Btn>
            </div>
          )}
          {aprobadosFiltrados.map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "10px 14px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}>
              <span><strong style={{ color: C.ink }}>Lote {l.numLote}</strong> — {l.referencia} — {l.cliente} — {l.fecha}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ color: l.ganancia >= 0 ? C.green : C.red, fontWeight: 700 }}>{fmtPesos(l.ganancia)} ({fmtPct(l.gananciaPctLote)})</span>
                {isAdmin && (
                  <Btn variant="ghost" small onClick={() => eliminarLoteHistorico(l)}>🗑</Btn>
                )}
              </div>
            </div>
          ))}
          {!aprobadosFiltrados.length && (
            <div style={{ fontSize: 12, color: C.slate }}>
              {filtroDadoPorCumplido ? "Ningún histórico coincide con la búsqueda." : "Todavía no hay lotes históricos."}
            </div>
          )}
        </div>
      )}

      {confirmAprobarTraslado && (
        <Modal title="Confirmar aprobación sin factura real" onClose={() => setConfirmAprobarTraslado(null)} width={480}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            El Lote <strong>{confirmAprobarTraslado.numLote}</strong> ({confirmAprobarTraslado.cliente || "sin cliente"}) todavía NO tiene una factura real en Busint — lo que hay es un <strong>Traslado en Consignación/Externo</strong>, que Busint registra antes de que el cliente confirme la venta.
            <div style={{ marginTop: 10, color: C.slate, fontSize: 13 }}>
              El Costo Real Total que escribiste no viene de una factura de Busint todavía, así que puede quedar corto o largo si Busint factura después con un número distinto. ¿Apruebas este lote de todas formas?
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmAprobarTraslado(null)}>Cancelar</Btn>
            <Btn onClick={() => { aprobar(confirmAprobarTraslado.id); setConfirmAprobarTraslado(null); }}>Sí, aprobar de todas formas</Btn>
          </div>
        </Modal>
      )}
      {confirmFacturaManual && (
        <Modal title="Marcar con factura a mano" onClose={() => setConfirmFacturaManual(null)} width={480}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            El Lote <strong>{confirmFacturaManual.numLote}</strong> ({confirmFacturaManual.cliente || "sin cliente"}) va a quedar marcado como <strong>facturado</strong> sin que el sistema haya encontrado la factura sola en Busint.
            <div style={{ marginTop: 10, color: C.slate, fontSize: 13 }}>
              Úsalo solo cuando ya verificaste que la factura sí existe en Busint (usualmente porque a quien la digitó se le olvidó escribir "LOTE {confirmFacturaManual.numLote}" en el comentario). Después de marcarlo, completa Costo Real Total y Categoría BASE para poder aprobarlo.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmFacturaManual(null)}>Cancelar</Btn>
            <Btn onClick={() => { guardarFacturaManual(confirmFacturaManual.id); setConfirmFacturaManual(null); }}>Sí, marcar como facturado</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Sección de Administración -- tareas de una sola vez o poco frecuentes que
// no hacen parte del flujo diario de Dado por Cumplido (por ahora solo la
// importación del histórico; es el lugar natural para tareas parecidas
// en el futuro).
function AdministracionView({ currentUser, categoriasCxpLista, categoriasCxp, categoriasPorConcepto, conceptosCxpVistos, nombresConcepto, onAgregarCategoriaLista, onEliminarCategoriaLista, onGuardarCategoriaConcepto }) {
  const isAdmin = currentUser?.isAdmin;
  const [importandoHistorico, setImportandoHistorico] = useState(false);
  // (2026-09-27, a pedido de Fredy) Categorías de Cuentas por Pagar --
  // dejaron de estar fijas en el código, ahora se administran aquí.
  const [nuevaCategoriaCxp, setNuevaCategoriaCxp] = useState("");
  const [cargandoSugeridas, setCargandoSugeridas] = useState(false);
  const CATEGORIAS_CXP_SUGERIDAS = ["Telas y Proveedores", "Pagos de Servicios", "Pagos Insumos", "Pago de Plantas de Confección", "Préstamos"];
  async function agregarCategoriaCxp() {
    const label = nuevaCategoriaCxp.trim();
    if (!label) return;
    await onAgregarCategoriaLista(label);
    setNuevaCategoriaCxp("");
  }
  async function cargarCategoriasCxpSugeridas() {
    setCargandoSugeridas(true);
    try {
      await Promise.all(CATEGORIAS_CXP_SUGERIDAS.map((label) => onAgregarCategoriaLista(label)));
    } finally {
      setCargandoSugeridas(false);
    }
  }
  const importInputRef = useRef(null);
  const [migrandoEnvios, setMigrandoEnvios] = useState(false);
  const [resultadoMigracionEnvios, setResultadoMigracionEnvios] = useState(null);
  const [lotesEliminados, setLotesEliminados] = useState([]);
  const [confirmPurgaLote, setConfirmPurgaLote] = useState(null);
  const [confirmPurgaTodo, setConfirmPurgaTodo] = useState(false);
  const [purgandoTodo, setPurgandoTodo] = useState(false);

  // Papelera de Históricos (Dado por Cumplido) -- lotes marcados con
  // eliminado:true desde Históricos (ver eliminarLoteHistorico/
  // vaciarHistoricoCompleto en DadoPorCumplidoView). Nunca se borran de
  // Firestore al "eliminarlos" desde ahí, solo se esconden de esa vista --
  // acá se restauran, o sí se borran para siempre (irreversible).
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "dado_por_cumplido_lotes"), (snap) => {
      setLotesEliminados(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .filter((l) => l.eliminado)
          .sort((a, b) => (b.eliminadoEn || "").localeCompare(a.eliminadoEn || ""))
      );
    });
    return () => unsub();
  }, []);

  async function restaurarLoteHistorico(id) {
    await fsSave("dado_por_cumplido_lotes", id, { eliminado: false });
  }

  async function purgarLoteHistoricoDefinitivo() {
    if (!confirmPurgaLote) return;
    await fsDelete("dado_por_cumplido_lotes", confirmPurgaLote.id);
    setConfirmPurgaLote(null);
  }

  // Respaldo en Excel de los lotes de la Papelera -- se descarga antes de
  // purgarlos todos de una sola vez (ver purgarTodoHistoricoDefinitivo mas
  // abajo), para no perder esta informacion al borrarla para siempre.
  async function descargarExcelLotesPapelera(lotesArr) {
    const XLSX = await import("xlsx");
    const filas = lotesArr.map((l) => ({
      "FECHA": l.fecha || "",
      "NRO LOTE": l.numLote,
      "REFERENCIA": l.referencia || "",
      "CLIENTE": l.cliente || "",
      "CANT. CORTADA": l.cantCortada ?? "",
      "CANT. DESPACHADA": l.cantDespachada ?? "",
      "COSTO DEFINITIVO": l.costoDefinitivo ?? "",
      "PRECIO VENTA U.": l.precioVentaUnitario ?? "",
      "VENTA T.": l.ventaT ?? "",
      "GANANCIA": l.ganancia ?? "",
      "OBSERVACIONES": l.observaciones || "",
      "ELIMINADO EN": l.eliminadoEn ? new Date(l.eliminadoEn).toLocaleString("es-CO") : "",
      "ELIMINADO POR": l.eliminadoPor || "",
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Papelera");
    XLSX.writeFile(wb, `Respaldo Papelera Dado por Cumplido ${today()}.xlsx`);
  }

  // Purga TODA la Papelera de una sola vez (irreversible) -- descarga
  // primero un respaldo en Excel con todos los lotes, y despues los borra
  // de Firestore en bloques de 450 (limite de un writeBatch). A pedido de
  // Fredy (2026-09-10): antes solo se podia purgar lote por lote, y con
  // cientos de lotes acumulados en la Papelera eso no era viable.
  async function purgarTodoHistoricoDefinitivo() {
    if (!lotesEliminados.length) return;
    setPurgandoTodo(true);
    try {
      await descargarExcelLotesPapelera(lotesEliminados);
      for (let i = 0; i < lotesEliminados.length; i += 450) {
        const grupo = lotesEliminados.slice(i, i + 450);
        const batch = writeBatch(db);
        grupo.forEach((l) => {
          batch.delete(doc(db, "dado_por_cumplido_lotes", l.id));
        });
        await batch.commit();
      }
      setConfirmPurgaTodo(false);
      alert(`Listo -- se borraron ${lotesEliminados.length} lote(s) de la Papelera para siempre.`);
    } catch (err) {
      alert("No se pudo vaciar la Papelera: " + (err?.message || err));
    }
    setPurgandoTodo(false);
  }
  // Importa el Excel histórico "Dado por cumplido" -- crea/actualiza cada
  // lote (identificado por NRO LOTE) ya como aprobado, con los valores tal
  // cual vienen en el archivo (no se recalculan). Pensado para correrse una
  // vez y dejar el histórico completo en el sistema.
  async function importarHistoricoExcel(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm('Esto va a crear o actualizar lotes como APROBADOS a partir de este Excel (usando el número de lote como identificador -- si ya existe, se reemplaza). ¿Continuar?')) return;
    setImportandoHistorico(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const hoja = wb.Sheets["Dado por cumplido"];
      if (!hoja) throw new Error('No se encontró la hoja "Dado por cumplido" en el archivo.');
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null });
      const num = (v) => (typeof v === "number" ? v : parseFloat(v)) || 0;
      const fechaISO = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString().slice(0, 10) : null);

      const filasLimpias = [];
      for (let i = 1; i < filas.length; i++) {
        const r = filas[i] || [];
        const numLote = Math.round(num(r[1]));
        if (!numLote) continue;
        const cantCortada = num(r[3]);
        const baseValorUsado = num(r[18]);
        filasLimpias.push({
          numLote,
          fecha: fechaISO(r[0]),
          referencia: String(r[2] || "").trim(),
          cantCortada,
          cantDespachada: num(r[4]),
          vrTeorico: num(r[5]) || null,
          costoRealTotal: num(r[6]) || null,
          costoDefinitivo: num(r[7]),
          costoT: num(r[8]),
          precioVentaUnitario: num(r[9]),
          ventaT: num(r[10]),
          ganancia: num(r[11]),
          gananciaPctLote: num(r[12]),
          costoTRef: num(r[13]),
          gananciaPctRef: num(r[14]),
          cliente: String(r[15] || "").trim(),
          observaciones: String(r[17] || "").trim(),
          baseValorUsado,
          transporte: num(r[19]) || null,
          total: baseValorUsado * cantCortada,
        });
      }
      if (!filasLimpias.length) throw new Error("No se encontraron filas con número de lote en el archivo.");

      let escritos = 0;
      for (let i = 0; i < filasLimpias.length; i += 450) {
        const grupo = filasLimpias.slice(i, i + 450);
        const batch = writeBatch(db);
        grupo.forEach((f) => {
          const ref = doc(db, "dado_por_cumplido_lotes", `lote_${f.numLote}`);
          batch.set(ref, {
            numLote: f.numLote,
            numPedido: null,
            referencia: f.referencia,
            cliente: f.cliente,
            fecha: f.fecha,
            cantCortada: f.cantCortada,
            cantDespachada: f.cantDespachada,
            vrTeorico: f.vrTeorico,
            costoRealTotal: f.costoRealTotal,
            costoDefinitivo: f.costoDefinitivo,
            costoDefinitivoManual: true,
            costoTRef: f.costoTRef,
            costoT: f.costoT,
            precioVentaUnitario: f.precioVentaUnitario,
            ventaT: f.ventaT,
            ganancia: f.ganancia,
            gananciaPctLote: f.gananciaPctLote,
            gananciaPctRef: f.gananciaPctRef,
            observaciones: f.observaciones,
            baseValorUsado: f.baseValorUsado,
            transporte: f.transporte,
            total: f.total,
            categoriaBaseId: "",
            estado: "aprobado",
            aprobadoPor: "importación histórica",
            origenImportacion: true,
            creadoEn: serverTimestamp(),
            fechaAprobacion: serverTimestamp(),
          });
          escritos++;
        });
        await batch.commit();
      }
      alert(`Listo -- se importaron/actualizaron ${escritos} lote(s) histórico(s) como aprobados.`);
    } catch (err) {
      alert("No se pudo importar: " + (err?.message || err));
    } finally {
      setImportandoHistorico(false);
    }
  }

  async function marcarHistoricosComoEnviados() {
    const excluirRaw = window.prompt('¿Hay algún lote que NO se deba marcar como "Enviado" (por ejemplo, uno que ya vas a procesar por Estado de Despacho)? Escribe el/los número(s) de lote separados por coma, o déjalo vacío si ninguno.', '');
    if (excluirRaw === null) return;
    const excluirSet = new Set(
      excluirRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (
      !window.confirm(
        'Esto va a marcar como "Enviado" todos los lotes que ya estaban Aprobados y que todavía no tienen estado de envío (los de antes de que existiera Estado de Despacho en Bodega)' +
          (excluirSet.size ? `, EXCEPTO el/los lote(s) ${[...excluirSet].join(", ")}` : "") +
          '. No hace falta repetirlo -- una vez que un lote queda marcado, esta acción ya no lo vuelve a tocar. ¿Continuar?'
      )
    )
      return;
    setMigrandoEnvios(true);
    setResultadoMigracionEnvios(null);
    try {
      const snap = await getDocs(collection(db, "dado_por_cumplido_lotes"));
      const pendientes = snap.docs.filter((d) => {
        const data = d.data();
        return data.estado === "aprobado" && !data.estadoEnvio && !excluirSet.has(String(data.numLote || "").trim());
      });
      let marcados = 0;
      for (let i = 0; i < pendientes.length; i += 450) {
        const grupo = pendientes.slice(i, i + 450);
        const batch = writeBatch(db);
        grupo.forEach((d) => {
          batch.set(
            d.ref,
            {
              estadoEnvio: "enviado",
              fechaEnvio: d.data().fecha || null,
              observacionesEnvio: "Marcado automáticamente como enviado (lote aprobado antes de activar Estado de Despacho).",
            },
            { merge: true }
          );
          marcados++;
        });
        await batch.commit();
      }
      setResultadoMigracionEnvios({ marcados });
    } catch (err) {
      setResultadoMigracionEnvios({ error: err?.message || String(err) });
    }
    setMigrandoEnvios(false);
  }

  if (!isAdmin) {
    return <div style={{ padding: 30, textAlign: "center", color: C.slate }}>Esta sección es solo para administradores.</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginBottom: 4 }}>🗂️ Administración</div>
        <div style={{ fontSize: 13, color: C.slate, maxWidth: 640 }}>
          Tareas administrativas de Contabilidad -- cargas iniciales o de una sola vez que no hacen parte del trabajo diario.
        </div>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white, maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>📤 Importar histórico de Dado por Cumplido</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
          Sube el Excel histórico de "Dado por cumplido" -- crea o actualiza cada lote (por número de lote) ya como aprobado, con los valores tal cual vienen en el archivo.
        </div>
        <input ref={importInputRef} type="file" accept=".xlsx,.xls" onChange={importarHistoricoExcel} style={{ display: "none" }} />
        <Btn variant="secondary" small onClick={() => importInputRef.current?.click()} disabled={importandoHistorico}>
          {importandoHistorico ? "Importando..." : "📤 Importar histórico"}
        </Btn>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white, maxWidth: 460, marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>🚚 Marcar históricos como Enviados</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
          Los lotes que ya estaban Aprobados antes de que existiera "Estado de Despacho" en Bodega no tienen transportador ni guía -- ya se despacharon hace tiempo. Esta acción los marca como "Enviados" de una sola vez, para que solo los lotes nuevos entren a la cola de "Por enviar".
        </div>
        <Btn variant="secondary" small onClick={marcarHistoricosComoEnviados} disabled={migrandoEnvios}>
          {migrandoEnvios ? "Marcando..." : "🚚 Marcar históricos como Enviados"}
        </Btn>
        {resultadoMigracionEnvios && (
          <div style={{ marginTop: 10, fontSize: 12, color: resultadoMigracionEnvios.error ? C.red : C.green, fontWeight: 700 }}>
            {resultadoMigracionEnvios.error ? `Error: ${resultadoMigracionEnvios.error}` : `Listo -- ${resultadoMigracionEnvios.marcados} lote(s) marcado(s) como Enviado.`}
          </div>
        )}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white, maxWidth: 640, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>🗑 Papelera -- Históricos eliminados ({lotesEliminados.length})</div>
          {!!lotesEliminados.length && (
            <Btn variant="danger" small onClick={() => setConfirmPurgaTodo(true)}>🗑 Eliminar todos definitivamente ({lotesEliminados.length})</Btn>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
          Lotes que se eliminaron desde Históricos (Dado por Cumplido). Quedan aquí recuperables -- restáuralos o bórralos para siempre.
        </div>
        {!lotesEliminados.length ? (
          <div style={{ fontSize: 12, color: C.slate }}>La papelera está vacía.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lotesEliminados.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 14px", background: C.canvas, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>Lote {l.numLote} — {l.referencia || "(sin referencia)"}</div>
                  <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2 }}>
                    {l.cliente || ""} · Eliminado {l.eliminadoEn ? new Date(l.eliminadoEn).toLocaleString("es-CO") : "—"}{l.eliminadoPor ? ` por ${l.eliminadoPor}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="success" small onClick={() => restaurarLoteHistorico(l.id)}>↩ Restaurar</Btn>
                  <Btn variant="danger" small onClick={() => setConfirmPurgaLote({ id: l.id, numLote: l.numLote })}>🗑 Eliminar definitivamente</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white, maxWidth: 460, marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>🏷️ Categorías de Cuentas por Pagar</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
          Para agrupar la tabla de Cuentas por Pagar (ej. Telas y Proveedores, Pagos de Servicios). Agrega o borra las que necesites -- si borras una, los proveedores que la tenían asignada vuelven a "Sin categoría", nada se pierde.
        </div>
        {!categoriasCxpLista.length ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Aún no hay ninguna categoría creada.</div>
            <Btn variant="secondary" small onClick={cargarCategoriasCxpSugeridas} disabled={cargandoSugeridas}>
              {cargandoSugeridas ? "Creando..." : "+ Usar las 5 sugeridas"}
            </Btn>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {categoriasCxpLista.map((c) => {
              const enUso = categoriasCxp.filter((x) => x.categoria === c.id).length;
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: C.canvas, borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                    {c.label} <span style={{ fontWeight: 400, color: C.slate, fontSize: 11 }}>({enUso} proveedor{enUso !== 1 ? "es" : ""})</span>
                  </span>
                  <button
                    onClick={() => onEliminarCategoriaLista(c.id)}
                    title="Eliminar categoría"
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontWeight: 700, fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FInput value={nuevaCategoriaCxp} onChange={setNuevaCategoriaCxp} placeholder="Nombre de la categoría nueva" />
          </div>
          <Btn small onClick={agregarCategoriaCxp} disabled={!nuevaCategoriaCxp.trim()}>+ Agregar</Btn>
        </div>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white, maxWidth: 460, marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>🔗 Categoría automática por Concepto de Obligación</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
          Asigna categoría una sola vez por Concepto de Obligación (el código que trae Busint, ej. "SCONF") y aplica automático a todo proveedor -- nuevo o viejo -- que lo tenga como concepto principal. Si un proveedor tiene categoría manual asignada (🏷️ en Cuentas por Pagar), esa manda sobre esto.
        </div>
        {!conceptosCxpVistos.length ? (
          <div style={{ fontSize: 12, color: C.slate }}>
            Todavía no hay conceptos disponibles -- trae un corte con "🔄 Traer desde Busint" en Cuentas por Pagar para verlos aquí.
          </div>
        ) : !categoriasCxpLista.length ? (
          <div style={{ fontSize: 12, color: C.slate }}>Crea primero al menos una categoría arriba.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {conceptosCxpVistos.map((c) => {
              const actual = categoriasPorConcepto.find((x) => x.concepto === c.codigo)?.categoria || "";
              return (
                <div key={c.codigo} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", background: C.canvas, borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                    {nombresConcepto?.[c.codigo] || c.codigo} <span style={{ fontWeight: 400, color: C.slate, fontSize: 11 }}>({c.count} proveedor{c.count !== 1 ? "es" : ""})</span>
                  </span>
                  <select
                    value={actual}
                    onChange={(e) => onGuardarCategoriaConcepto(c.codigo, e.target.value || null)}
                    style={{ padding: "6px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
                  >
                    <option value="">Sin categoría</option>
                    {categoriasCxpLista.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {confirmPurgaLote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.red, marginBottom: 12 }}>⚠ Eliminar definitivamente</div>
            <div style={{ fontSize: 14, color: C.ink, marginBottom: 24 }}>¿Eliminar el lote <strong>{confirmPurgaLote.numLote}</strong> para siempre? Esta vez sí es irreversible -- ya no queda en la Papelera.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmPurgaLote(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={purgarLoteHistoricoDefinitivo}>Sí, eliminar para siempre</Btn>
            </div>
          </div>
        </div>
      )}
      {confirmPurgaTodo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.white, borderRadius: 14, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.red, marginBottom: 12 }}>⚠ Eliminar TODA la Papelera</div>
            <div style={{ fontSize: 14, color: C.ink, marginBottom: 24 }}>
              ¿Eliminar los <strong>{lotesEliminados.length}</strong> lote(s) de la Papelera para siempre? Antes se descarga un respaldo en Excel con todos. Esta vez sí es irreversible -- ya no quedan en la Papelera.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmPurgaTodo(false)} disabled={purgandoTodo}>Cancelar</Btn>
              <Btn variant="danger" onClick={purgarTodoHistoricoDefinitivo} disabled={purgandoTodo}>
                {purgandoTodo ? "Borrando..." : `Sí, eliminar los ${lotesEliminados.length} para siempre`}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── CUENTAS POR PAGAR VIEW ─────────────────────────────────────────────────────
// Proyecta cómo baja el saldo total de la deuda mes a mes, a partir de lo que
// ya se dejó programado en el calendario de pago por proveedor. Es una lectura
// hacia adelante (no depende del histórico de cortes) — si un mes no tiene
// nada programado, el saldo simplemente no baja ese mes.
// Gráfica de línea/área SVG (sin librerías externas) para mostrar la
// evolución proyectada del saldo mes a mes de forma más visual que una
// lista de barras de progreso.
function EvolucionSaldoChart({ filas, totalAdeudado }) {
  const W = 900, H = 300, padL = 90, padR = 24, padT = 20, padB = 40;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const n = filas.length;
  const maxY = Math.max(totalAdeudado, ...filas.map((f) => Math.max(f.saldoRestante, 0)), 1);
  const xAt = (i) => padL + (n > 1 ? (i * chartW) / (n - 1) : 0);
  const yAt = (v) => padT + chartH - (Math.max(v, 0) / maxY) * chartH;
  const puntos = filas.map((f, i) => ({ x: xAt(i), y: yAt(f.saldoRestante), ...f }));
  const linePath = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L ${puntos[puntos.length - 1].x},${padT + chartH} L ${puntos[0].x},${padT + chartH} Z`;
  const gridFracs = [0, 0.25, 0.5, 0.75, 1];
  const idxCubierto = filas.findIndex((f) => f.saldoRestante <= 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="cxpAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.violet} stopOpacity="0.35" />
          <stop offset="100%" stopColor={C.violet} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridFracs.map((fr) => {
        const y = padT + chartH - fr * chartH;
        return (
          <g key={fr}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={C.border} strokeWidth="1" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill={C.slate}>
              {fmtCOP(maxY * fr)}
            </text>
          </g>
        );
      })}
      {idxCubierto >= 0 && (
        <g>
          <line
            x1={puntos[idxCubierto].x}
            y1={padT}
            x2={puntos[idxCubierto].x}
            y2={padT + chartH}
            stroke={C.green}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text x={puntos[idxCubierto].x} y={padT - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.green}>
            Cubierto: {fmtMesCorto(filas[idxCubierto].mes)}
          </text>
        </g>
      )}
      <path d={areaPath} fill="url(#cxpAreaGrad)" stroke="none" />
      <path d={linePath} fill="none" stroke={C.violet} strokeWidth="2.5" />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === n - 1 ? 3.5 : 2.5} fill={p.saldoRestante <= 0 ? C.green : C.violet}>
          <title>
            {fmtMesLargo(p.mes)} — Saldo: {fmtCOP(Math.max(p.saldoRestante, 0))}
            {p.programado > 0 ? ` (pagado ese mes: ${fmtCOP(p.programado)})` : ""}
          </title>
        </circle>
      ))}
      {puntos.map((p, i) =>
        i === 0 || i === n - 1 || i % 3 === 0 ? (
          <text key={i} x={p.x} y={H - padB + 18} textAnchor="middle" fontSize="10" fill={C.slate} style={{ textTransform: "capitalize" }}>
            {fmtMesCorto(p.mes)}
          </text>
        ) : null
      )}
    </svg>
  );
}
function EstadisticaCxpView({ totalAdeudado, calendario }) {
  const meses = proximosMeses(24);
  let saldo = totalAdeudado;
  const filas = meses.map((m) => {
    const programado = calendario.filter((c) => c.mes === m).reduce((s, c) => s + c.monto, 0);
    saldo = saldo - programado;
    return { mes: m, programado, saldoRestante: saldo };
  });
  const totalProgramado24 = filas.reduce((s, f) => s + f.programado, 0);
  const saldoFinal = filas.length ? filas[filas.length - 1].saldoRestante : totalAdeudado;
  const pctReduccion = totalAdeudado > 0 ? Math.min(((totalAdeudado - Math.max(saldoFinal, 0)) / totalAdeudado) * 100, 100) : 0;
  const sinProgramar = Math.max(saldoFinal, 0);
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <KPI icon="🧾" label="Deuda actual" value={fmtCOP(totalAdeudado)} color={C.violet} bg={C.violetBg} />
        <KPI icon="📅" label="Programado en 24 meses" value={fmtCOP(totalProgramado24)} color={C.blue} bg={C.blueBg} />
        <KPI
          icon={sinProgramar > 0 ? "⚠" : "✓"}
          label="Saldo sin programar al mes 24"
          value={fmtCOP(sinProgramar)}
          color={sinProgramar > 0 ? C.red : C.green}
          bg={sinProgramar > 0 ? C.redBg : C.greenBg}
          sub={`${Math.round(pctReduccion)}% de la deuda quedaría cubierta`}
        />
      </div>
      {totalAdeudado <= 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          No hay deuda registrada todavía.
        </div>
      ) : (
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>Evolución proyectada del saldo</div>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>
            Parte del saldo actual y va restando lo que dejaste programado por mes en "Programar pago" de cada proveedor.
          </div>
          <EvolucionSaldoChart filas={filas} totalAdeudado={totalAdeudado} />
        </div>
      )}
    </div>
  );
}
// Gráfica SVG (sin librerías externas) del saldo neto acumulado proyectado:
// a diferencia de EvolucionSaldoChart (que solo baja hacia 0), esta puede
// mostrar valores negativos (déficit) con una línea base en cero.
// (2026-09-26, a pedido de Fredy) Usado por el buscador de Cuentas por
// Pagar -- quita acentos y pasa a minusculas para que "tintatex" encuentre
// "TINTATEX S.A." sin importar como se escriba.
function normalizarTexto(s) {
  return (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
// (2026-09-29, a pedido de Fredy) "Traer desde Busint" se puede usar varias
// veces el mismo dia (cada corte queda guardado como historico, nunca se
// reemplaza) -- como antes se ordenaban los cortes SOLO por `fechaCorte`
// (dia, sin hora), varios cortes del mismo dia empataban y cual quedaba de
// "mas reciente" (para mostrarlo por defecto) dependia del orden arbitrario
// en que Firestore devuelve los documentos (esta colección no tiene
// `orderBy`) -- pudiendo mostrar por defecto un corte VIEJO de hoy mismo en
// vez del ultimo que se trajo. Causa real detrás de que la factura de
// Comercializadora Idea Innova pareciera no aparecer, aun cuando el cálculo
// del backend ya estaba corregido (confirmado con getCuentasPorPagarBusintGen
// -- ver depurarFacturaCxp y el log "CXP: corte generado" en
// functions/index.js). Se ordena por `creadoEn` (fecha+hora real de
// creación, ya lo guardaba ImportarCXPModal pero "Traer desde Busint" no)
// cuando existe; los cortes viejos sin ese campo siguen usando `fechaCorte`.
function claveOrdenCorte(c) {
  return c.creadoEn || c.fechaCorte;
}
// (2026-09-27, a pedido de Fredy) Modal chiquito para ponerle nombre legible
// a un codigo crudo de "Concepto de Obligacion" (campo FCBI de Busint, ej.
// "SCONF"). Mismo mecanismo pensado para los codigos de proveedor sin
// nombre (16, 26, 27, 33, 1004, etc.).
function RenombrarConceptoCXPModal({ codigo, nombreActual, onSave, onClose }) {
  const [nombre, setNombre] = useState(nombreActual || "");
  function guardar() {
    if (!nombre.trim()) return;
    onSave(nombre.trim());
    onClose();
  }
  return (
    <Modal title={`Nombre para el concepto "${codigo}"`} onClose={onClose} width={420}>
      <Field label="Nombre legible">
        <FInput value={nombre} onChange={setNombre} placeholder="Ej. SERVICIO DE CONFECCION" />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn onClick={guardar} disabled={!nombre.trim()}>
          Guardar
        </Btn>
      </div>
    </Modal>
  );
}
// (2026-09-27, a pedido de Fredy) Igual a RenombrarConceptoCXPModal pero
// para el nombre real de un codigo de proveedor sin nombre en Busint.
function RenombrarProveedorCXPModal({ codigo, nombreActual, onSave, onClose }) {
  const [nombre, setNombre] = useState(nombreActual || "");
  function guardar() {
    if (!nombre.trim()) return;
    onSave(nombre.trim());
    onClose();
  }
  return (
    <Modal title={`Nombre real del proveedor ${codigo}`} onClose={onClose} width={420}>
      <Field label="Nombre real">
        <FInput value={nombre} onChange={setNombre} placeholder="Ej. INDUSTRIAS YANKO MODULO CENTRO" />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn onClick={guardar} disabled={!nombre.trim()}>
          Guardar
        </Btn>
      </div>
    </Modal>
  );
}
// (2026-09-27, a pedido de Fredy) Categorías para agrupar Cuentas por Pagar
// -- ya no son fijas, se administran desde Administración (ver
// AdministracionView, categoriasCxpLista); `categoriasLista` llega por
// prop desde ahí. "Sin categoría" no está en esa lista -- se agrega aparte,
// al final, para lo que aún no se ha clasificado.
//
// Este modal solo asigna la categoría MANUAL de un proveedor puntual. Desde
// que existe la categoría automática por Concepto de Obligación (ver
// categoriaPorConceptoDeProveedor / Administración), la mayoría de
// proveedores nuevos ya salen categorizados solos y no necesitan pasar por
// acá -- este modal queda para excepciones o para forzar una categoría
// manual distinta a la automática.
function CategorizarProveedorCXPModal({ nombre, categoriaActual, categoriaAutomaticaLabel, categoriasLista, onSave, onClose }) {
  const [categoria, setCategoria] = useState(categoriaActual || "");
  return (
    <Modal title={`Categoría de ${nombre}`} onClose={onClose} width={420}>
      <Field label="Categoría manual (opcional)">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
        >
          <option value="">{categoriaAutomaticaLabel ? `Sin manual (usa automática: ${categoriaAutomaticaLabel})` : "Sin categoría"}</option>
          {categoriasLista.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
      {categoriaAutomaticaLabel && (
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: -8, marginBottom: 4 }}>
          Este proveedor ya tiene categoría automática por su Concepto de Obligación: <strong>{categoriaAutomaticaLabel}</strong>. Solo elige una manual arriba si quieres que este proveedor puntual no la use.
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn
          onClick={() => {
            onSave(categoria || null);
            onClose();
          }}
        >
          Guardar
        </Btn>
      </div>
    </Modal>
  );
}
function CuentasPorPagarView({ cortes, manuales, calendario, nombresConcepto, nombresProveedor, categoriasCxp, categoriasLista, categoriasPorConcepto, onImportarCorte, onDeleteCorte, onAddManual, onDeleteManual, onDeleteProveedorCorte, onGuardarNombreConcepto, onGuardarNombreProveedor, onGuardarCategoria, isAdmin }) {
  const [showImport, setShowImport] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [orden, setOrden] = useState("total");
  // (2026-09-26, a pedido de Fredy) Buscador por nombre de proveedor, para
  // encontrar mas rapido uno puntual (ej. Tintatex) en vez de tener que
  // recorrer toda la tabla -- sin distinguir mayusculas/minusculas ni
  // acentos.
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  // (2026-09-27, a pedido de Fredy) Filtro Todas/Busint/Manual -- para ver
  // solo lo que el trajo del corte de Busint o solo lo que el agrego a
  // mano. Se aplica ANTES de calcular los totales de mas abajo (Total
  // adeudado, Total vencido, 0-30/31-60/61-90/91+ y el monto junto a
  // "Ordenar por"), asi que esos totales tambien quedan sumando solo la
  // seleccion elegida.
  const [origenFiltro, setOrigenFiltro] = useState("");
  const [corteSeleccionado, setCorteSeleccionado] = useState(null);
  const [vista, setVista] = useState("tabla");
  const [cargandoBusint, setCargandoBusint] = useState(false);
  const [errorBusint, setErrorBusint] = useState("");
  // (2026-09-26, a pedido de Fredy) Detalle de facturas por proveedor de la
  // última llamada en vivo a getCuentasPorPagarBusintGen -- SOLO en memoria
  // (nunca se guarda en Firestore, para no volver a pegar contra el límite
  // de 1MB por documento que ya rompió el corte una vez, ver commit
  // 8f53690). Se pierde al recargar la página; hay que volver a traer el
  // corte desde Busint para verlo de nuevo. Sirve para investigar residuos
  // de saldo (ej. Cheviotto) sin tener que exportar nada a mano.
  const [detalleFacturasPorProveedor, setDetalleFacturasPorProveedor] = useState({});
  const [verFacturasDe, setVerFacturasDe] = useState(null);
  // (2026-09-27, a pedido de Fredy) Modal para ponerle nombre legible a un
  // codigo de "Concepto de Obligacion" crudo de Busint (ej. "SCONF").
  const [renombrandoConcepto, setRenombrandoConcepto] = useState(null);
  // (2026-09-27, a pedido de Fredy) Modal para ponerle nombre real a un
  // codigo de proveedor que Busint no tiene en su catalogo (ej. "16").
  const [renombrandoProveedor, setRenombrandoProveedor] = useState(null);
  // (2026-09-27, a pedido de Fredy) Modal para asignarle categoría a un
  // proveedor (Telas y Proveedores, Pagos de Servicios, etc.), para agrupar
  // la tabla de abajo.
  const [categorizando, setCategorizando] = useState(null);
  // (2026-09-27, a pedido de Fredy) Cada bloque de categoría arranca
  // cerrado (como las tarjetas de mes en Proyección) -- se abre con clic en
  // el encabezado del bloque para ver los proveedores de esa categoría.
  const [categoriasAbiertas, setCategoriasAbiertas] = useState(new Set());
  function toggleCategoriaAbierta(id) {
    setCategoriasAbiertas((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function categoriaManualDeProveedor(nombre) {
    const cat = categoriasCxp.find((c) => c.proveedor === nombre)?.categoria || "";
    return categoriasLista.some((c) => c.id === cat) ? cat : "";
  }
  // (2026-09-27, a pedido de Fredy) Si el proveedor no tiene categoría
  // manual, se usa la categoría del Concepto de Obligación que más saldo le
  // acumula (`conceptoPrincipal`, calculado en getCuentasPorPagarBusintGen)
  // -- así se categoriza una sola vez por concepto (ver Administración) y
  // aplica solo, incluso a proveedores nuevos. Los manuales (agregados a
  // mano en esta pantalla, sin corte) no tienen `conceptoPrincipal`, así que
  // siguen dependiendo 100% de la categoría manual, como antes.
  function categoriaPorConceptoDeProveedor(nombre) {
    const concepto = filas.find((f) => f.nombre === nombre)?.conceptoPrincipal;
    if (!concepto) return "";
    const cat = categoriasPorConcepto.find((c) => c.concepto === concepto)?.categoria || "";
    return categoriasLista.some((c) => c.id === cat) ? cat : "";
  }
  function categoriaDeProveedor(nombre) {
    return categoriaManualDeProveedor(nombre) || categoriaPorConceptoDeProveedor(nombre);
  }
  // (2026-09-25) Trae el corte de cuentas por pagar EN VIVO desde Busint
  // (cruzando facturas + pagos + maestro de proveedores en el backend) en
  // vez de tener que exportar y subir el Excel a mano -- ver
  // getCuentasPorPagarBusintGen en functions/index.js para la lógica del
  // cruce. El resultado tiene la misma forma que ya espera onImportarCorte,
  // así que el resto de esta pantalla (ordenar, programar pagos, ver en
  // Proyección) no necesita ningún cambio.
  async function traerCorteDesdeBusint() {
    setCargandoBusint(true);
    setErrorBusint("");
    try {
      const llamar = httpsCallable(functionsClient, "getCuentasPorPagarBusintGen");
      const resp = await llamar();
      // (2026-09-25) NO guardar el detalle de `facturas` por proveedor en
      // Firestore -- esta pantalla todavía no lo usa (solo lee nombre +
      // totales por franja), y guardar el corte completo con ese detalle
      // superaba el límite de 1MB por documento de Firestore apenas se le
      // agregó el campo `descuento` (ver getCuentasPorPagarBusintGen). El
      // detalle sigue viniendo en `resp.data` para quien lo necesite en la
      // misma sesión; cuando se construya la vista de "próximos
      // vencimientos" que sí necesita ese detalle, se debe guardar aparte
      // (ej. una subcolección), no en este mismo documento.
      const proveedoresSinDetalle = (resp.data.proveedores || []).map(({ facturas, ...resto }) => resto);
      const detalle = {};
      (resp.data.proveedores || []).forEach((p) => { detalle[p.nombre] = p.facturas || []; });
      setDetalleFacturasPorProveedor(detalle);
      setVerFacturasDe(null);
      await onImportarCorte({
        id: uid(),
        fechaCorte: resp.data.fechaCorte,
        proveedores: proveedoresSinDetalle,
        creadoEn: new Date().toISOString(),
      });
    } catch (err) {
      setErrorBusint(err?.message || "No se pudo traer el corte desde Busint.");
    } finally {
      setCargandoBusint(false);
    }
  }
  const cortesOrdenados = [...cortes].sort((a, b) => claveOrdenCorte(b).localeCompare(claveOrdenCorte(a)));
  const corteActivo = corteSeleccionado
    ? cortesOrdenados.find((c) => c.id === corteSeleccionado) || cortesOrdenados[0]
    : cortesOrdenados[0];
  // (2026-09-27, a pedido de Fredy) Codigos de proveedor que Busint no
  // tiene en "maestro de proveedores" salen como "Proveedor <codigo>" (ver
  // getCuentasPorPagarBusintGen) -- si hay un nombre manual guardado para
  // ese codigo, se usa como `nombreMostrado` SOLO para lo que se ve en
  // pantalla. `nombre` se deja intacto (el crudo de Busint) porque es la
  // llave que usan `onDeleteProveedorCorte`, `calendarioDe` y "Programar
  // pago" -- cambiarlo rompería el cruce con lo ya guardado en Firestore.
  function conNombreMostrado(p) {
    const m = /^Proveedor (\d+)$/.exec(p.nombre || "");
    const codigoSinNombre = m ? m[1] : null;
    const nombreMostrado = (codigoSinNombre && nombresProveedor?.[codigoSinNombre]) || p.nombre;
    return { ...p, codigoSinNombre, nombreMostrado };
  }
  const filasCorte = (corteActivo?.proveedores || []).map((p) => conNombreMostrado({ ...p, origen: "corte" }));
  const filasManual = manuales.map((p) => conNombreMostrado({ ...p, origen: "manual" }));
  // (2026-09-28, a pedido de Fredy) Antes se usaba `!filas.length` para decidir
  // si mostrar el mensaje de "no has importado ningun corte" -- pero `filas`
  // ya viene filtrada por busqueda/origen, asi que en cuanto el texto buscado
  // no coincidia con nada (o el filtro Busint/Manual dejaba todo afuera),
  // desaparecia TODA la pantalla -- incluido el cuadro de busqueda donde el
  // usuario seguia escribiendo -- y se mostraba ese mensaje aunque si hubiera
  // datos importados ("me saca" reportado por Fredy). `hayProveedores` mira
  // los datos SIN filtrar para separar "no hay nada importado" de "el filtro
  // no encontro nada".
  const hayProveedores = filasCorte.length + filasManual.length > 0;
  let filas = [...filasCorte, ...filasManual];
  if (busquedaProveedor.trim()) {
    const q = normalizarTexto(busquedaProveedor);
    filas = filas.filter((f) => normalizarTexto(f.nombre).includes(q) || normalizarTexto(f.nombreMostrado).includes(q));
  }
  if (origenFiltro) {
    filas = filas.filter((f) => f.origen === origenFiltro);
  }
  filas = [...filas].sort((a, b) => {
    if (orden === "total") return b.total - a.total;
    if (orden === "0-30") return b.dias0a30 - a.dias0a30;
    if (orden === "31-60") return b.dias31a60 - a.dias31a60;
    if (orden === "61-90") return b.dias61a90 - a.dias61a90;
    if (orden === "91") return b.dias91mas - a.dias91mas;
    return a.nombreMostrado.localeCompare(b.nombreMostrado);
  });
  // Agrupa las filas (ya filtradas y ordenadas arriba) por categoría, en el
  // orden en que se crearon en Administración y con "Sin categoría" al
  // final -- como `filas` ya viene ordenada por `orden` y el filtro
  // preserva el orden relativo, cada grupo queda ordenado igual que la
  // tabla sin agrupar.
  const grupos = [...categoriasLista.map((c) => c.id), ""]
    .map((catId) => {
      const filasGrupo = filas.filter((f) => (categoriaDeProveedor(f.nombre) || "") === catId);
      const label = catId ? categoriasLista.find((c) => c.id === catId)?.label || "" : "Sin categoría";
      const subtotal = filasGrupo.reduce((s, f) => s + f.total, 0);
      return { id: catId || "sin_categoria", label, filas: filasGrupo, subtotal };
    })
    .filter((g) => g.filas.length > 0);
  const totalAdeudado = filas.reduce((s, f) => s + f.total, 0);
  const totalVencido = filas.reduce((s, f) => s + f.dias0a30 + f.dias31a60 + f.dias61a90 + f.dias91mas, 0);
  const total0a30 = filas.reduce((s, f) => s + f.dias0a30, 0);
  const total31a60 = filas.reduce((s, f) => s + f.dias31a60, 0);
  const total61a90 = filas.reduce((s, f) => s + f.dias61a90, 0);
  const total91 = filas.reduce((s, f) => s + f.dias91mas, 0);
  // Monto correspondiente a lo que esté elegido en "Ordenar por" — así al
  // seleccionar una franja de vencimiento (30/60/90/91+) se ve de una vez
  // cuánto suma esa franja entre todos los proveedores, sin tener que ir a
  // buscarlo en la tabla.
  const ORDEN_INFO = {
    total: { label: "Total adeudado", monto: totalAdeudado, color: C.violet },
    "0-30": { label: "0-30 días", monto: total0a30, color: C.amber },
    "31-60": { label: "31-60 días", monto: total31a60, color: C.amber },
    "61-90": { label: "61-90 días", monto: total61a90, color: C.red },
    "91": { label: "91+ días (más urgente)", monto: total91, color: C.red },
    nombre: { label: "Total adeudado", monto: totalAdeudado, color: C.violet },
  };
  function calendarioDe(nombre) {
    return calendario.filter((c) => c.proveedor === nombre);
  }
  return (
    <div>
      {showImport && <ImportarCXPModal onConfirm={onImportarCorte} onClose={() => setShowImport(false)} />}
      {showManual && <AgregarProveedorCXPModal onSave={onAddManual} onClose={() => setShowManual(false)} />}
      {renombrandoConcepto && (
        <RenombrarConceptoCXPModal
          codigo={renombrandoConcepto}
          nombreActual={nombresConcepto?.[renombrandoConcepto] || ""}
          onSave={(nombre) => onGuardarNombreConcepto(renombrandoConcepto, nombre)}
          onClose={() => setRenombrandoConcepto(null)}
        />
      )}
      {renombrandoProveedor && (
        <RenombrarProveedorCXPModal
          codigo={renombrandoProveedor}
          nombreActual={nombresProveedor?.[renombrandoProveedor] || ""}
          onSave={(nombre) => onGuardarNombreProveedor(renombrandoProveedor, nombre)}
          onClose={() => setRenombrandoProveedor(null)}
        />
      )}
      {categorizando && (
        <CategorizarProveedorCXPModal
          nombre={filas.find((f) => f.nombre === categorizando)?.nombreMostrado || categorizando}
          categoriaActual={categoriaManualDeProveedor(categorizando)}
          categoriaAutomaticaLabel={categoriasLista.find((c) => c.id === categoriaPorConceptoDeProveedor(categorizando))?.label || ""}
          categoriasLista={categoriasLista}
          onSave={(categoria) => onGuardarCategoria(categorizando, categoria)}
          onClose={() => setCategorizando(null)}
        />
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Cuentas por Pagar</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            {corteActivo
              ? `Corte al ${corteActivo.fechaCorte}${corteActivo.creadoEn ? ` \u00b7 ${new Date(corteActivo.creadoEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : ""}`
              : "Sin cortes importados aún"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {cortesOrdenados.length > 1 && (
            <select
              value={corteActivo?.id || ""}
              onChange={(e) => setCorteSeleccionado(e.target.value)}
              style={{
                padding: "8px 12px",
                border: `1.5px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 13,
                color: C.ink,
                background: C.white,
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              {cortesOrdenados.map((c) => (
                <option key={c.id} value={c.id}>
                  Corte {c.fechaCorte}
                  {c.creadoEn ? ` \u00b7 ${new Date(c.creadoEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </option>
              ))}
            </select>
          )}
          <Btn variant="secondary" onClick={() => setVista(vista === "tabla" ? "estadistica" : "tabla")}>
            {vista === "tabla" ? "📊 Estadística" : "📋 Ver tabla"}
          </Btn>
          {isAdmin && (
            <>
              <Btn variant="secondary" onClick={() => setShowManual(true)}>
                + Agregar manual
              </Btn>
              <Btn variant="danger" onClick={() => setShowImport(true)}>
                📥 Importar TNS
              </Btn>
              <Btn onClick={traerCorteDesdeBusint} disabled={cargandoBusint} title="Trae el corte actual cruzando facturas y pagos de Busint, en vivo -- sin exportar ni subir Excel">
                {cargandoBusint ? "Consultando Busint..." : "🔄 Traer desde Busint"}
              </Btn>
            </>
          )}
        </div>
      </div>
      {errorBusint && (
        <div style={{ padding: "10px 14px", background: C.redBg, color: C.red, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          ⚠ {errorBusint}
        </div>
      )}
      {vista === "estadistica" ? (
        <EstadisticaCxpView totalAdeudado={totalAdeudado} calendario={calendario} />
      ) : !hayProveedores ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          Aún no has importado ningún corte de Cuentas por Pagar. Usa "Importar TNS" para subir el primero.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <KPI icon="🧾" label="Total adeudado" value={fmtCOP(totalAdeudado)} color={C.violet} bg={C.violetBg} />
            <KPI icon="⚠" label="Total vencido" value={fmtCOP(totalVencido)} color={C.amber} bg={C.amberBg} />
            <KPI icon="🔴" label="91+ días (más urgente)" value={fmtCOP(total91)} color={C.red} bg={C.redBg} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ width: 240 }}>
              <FInput value={busquedaProveedor} onChange={setBusquedaProveedor} placeholder="Buscar proveedor..." icon="🔍" />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small variant={!origenFiltro ? "primary" : "secondary"} onClick={() => setOrigenFiltro("")}>Todas</Btn>
              <Btn small variant={origenFiltro === "corte" ? "primary" : "secondary"} onClick={() => setOrigenFiltro("corte")}>Busint</Btn>
              <Btn small variant={origenFiltro === "manual" ? "primary" : "secondary"} onClick={() => setOrigenFiltro("manual")}>Manual</Btn>
            </div>
            <span style={{ fontSize: 12, color: C.slate, fontWeight: 600 }}>Ordenar por:</span>
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              style={{
                padding: "6px 10px",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: 12,
                color: C.ink,
                background: C.white,
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="total">Total (mayor a menor)</option>
              <option value="0-30">0-30 días</option>
              <option value="31-60">31-60 días</option>
              <option value="61-90">61-90 días</option>
              <option value="91">Más atrasado (91+ días)</option>
              <option value="nombre">Nombre</option>
            </select>
            <span style={{ fontSize: 13, fontWeight: 800, color: ORDEN_INFO[orden]?.color || C.ink }}>
              {fmtCOP(ORDEN_INFO[orden]?.monto || 0)}
            </span>
            <span style={{ fontSize: 11, color: C.slate, fontWeight: 600 }}>
              {ORDEN_INFO[orden]?.label}
            </span>
          </div>
          {filas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
              {busquedaProveedor.trim()
                ? `No se encontraron proveedores que coincidan con "${busquedaProveedor.trim()}".`
                : "No hay proveedores para el filtro seleccionado."}
            </div>
          ) : (
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.ink }}>
                  {["Proveedor", "Por vencer", "0-30", "31-60", "61-90", "91+", "Total", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        color: C.seam,
                        textAlign: h === "Proveedor" ? "left" : "right",
                        fontWeight: 700,
                        fontSize: 10,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const abierta = categoriasAbiertas.has(g.id);
                  return (
                  <Fragment key={g.id}>
                    <tr
                      onClick={() => toggleCategoriaAbierta(g.id)}
                      style={{ background: C.canvas, cursor: "pointer" }}
                    >
                      <td colSpan={8} style={{ padding: "8px 12px", borderTop: `2px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 800, fontSize: 11, color: C.slate, textTransform: "uppercase", letterSpacing: "0.03em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "inline-block", transition: "transform 0.15s", transform: abierta ? "rotate(90deg)" : "none", fontSize: 10 }}>
                              ›
                            </span>
                            {g.label} <span style={{ fontWeight: 500, textTransform: "none" }}>({g.filas.length})</span>
                          </span>
                          <span style={{ fontWeight: 800, fontSize: 12, color: C.ink }}>{fmtCOP(g.subtotal)}</span>
                        </div>
                      </td>
                    </tr>
                    {abierta && g.filas.map((f, i) => {
                      const facturasDetalle = detalleFacturasPorProveedor[f.nombre];
                      const expandido = verFacturasDe === f.nombre;
                      const categoriaManual = categoriaManualDeProveedor(f.nombre);
                      const categoriaActual = categoriaManual || categoriaPorConceptoDeProveedor(f.nombre);
                      return (
                        <Fragment key={`${f.origen}-${f.id || i}`}>
                        <tr
                          style={{
                            background: f.dias91mas > 0 ? C.redBg : i % 2 === 0 ? C.canvas : C.white,
                            borderBottom: `1px solid ${C.border}`,
                          }}
                        >
                          <td style={{ padding: "8px 12px", fontWeight: 600, color: C.ink }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {f.nombreMostrado}
                              {f.codigoSinNombre && (
                                <button
                                  onClick={() => setRenombrandoProveedor(f.codigoSinNombre)}
                                  title="Ponerle nombre real a este proveedor"
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, opacity: 0.55, padding: 0 }}
                                >
                                  ✏️
                                </button>
                              )}
                              <button
                                onClick={() => setCategorizando(f.nombre)}
                                title={categoriaActual ? `Categoría${categoriaManual ? "" : " (automática por concepto)"}: ${categoriasLista.find((c) => c.id === categoriaActual)?.label || categoriaActual}` : "Asignar categoría"}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, opacity: categoriaActual ? 0.85 : 0.35, padding: 0 }}
                              >
                                🏷️
                              </button>
                            </span>{" "}
                            {f.origen === "manual" && <span style={{ fontSize: 10, color: C.slate, fontWeight: 400 }}>(manual)</span>}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: C.slate }}>{fmtCOP(f.porVencer)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: C.slate }}>{fmtCOP(f.dias0a30)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: C.slate }}>{fmtCOP(f.dias31a60)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: C.slate }}>{fmtCOP(f.dias61a90)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: f.dias91mas > 0 ? 800 : 500, color: f.dias91mas > 0 ? C.red : C.slate }}>
                            {fmtCOP(f.dias91mas)}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 800, color: C.ink }}>{fmtCOP(f.total)}</td>
                          <td style={{ padding: "8px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                            {facturasDetalle && (
                              <button
                                onClick={() => setVerFacturasDe(expandido ? null : f.nombre)}
                                title="Ver el detalle de facturas de este proveedor (de la última consulta en vivo a Busint)"
                                style={{
                                  background: C.violetBg || C.canvas,
                                  border: "none",
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                  color: C.violet || C.ink,
                                  fontWeight: 700,
                                  fontSize: 10,
                                  cursor: "pointer",
                                  marginRight: 6,
                                }}
                              >
                                {expandido ? "▲ Ocultar facturas" : "🔍 Ver facturas"}
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() =>
                                  f.origen === "manual"
                                    ? onDeleteManual(f.id)
                                    : onDeleteProveedorCorte(corteActivo.id, f.nombre)
                                }
                                title="Eliminar proveedor"
                                style={{
                                  background: C.redBg,
                                  border: "none",
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                  color: C.red,
                                  fontWeight: 700,
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandido && facturasDetalle && (
                          <tr>
                            <td colSpan={8} style={{ padding: "0 12px 14px", background: i % 2 === 0 ? C.canvas : C.white }}>
                              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                                  <thead>
                                    <tr style={{ background: C.canvas }}>
                                      {["N° Factura", "Concepto", "Vence", "Días vencido", "Fac. Total", "Pagado", "Descuento", "Devolución", "Saldo"].map((h) => (
                                        <th key={h} style={{ padding: "6px 10px", color: C.slate, textAlign: h === "N° Factura" || h === "Concepto" ? "left" : "right", fontWeight: 700, fontSize: 9.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...facturasDetalle].sort((a, b) => b.saldo - a.saldo).map((fac, j) => (
                                      <tr key={fac.nfact || j} style={{ borderTop: `1px solid ${C.border}` }}>
                                        <td style={{ padding: "6px 10px", fontWeight: 700, color: C.ink }}>{fac.nfact}</td>
                                        <td style={{ padding: "6px 10px", color: C.slate }}>
                                          {fac.concepto ? (
                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                              {nombresConcepto?.[fac.concepto] || fac.concepto}
                                              <button
                                                onClick={() => setRenombrandoConcepto(fac.concepto)}
                                                title="Ponerle nombre a este código de concepto"
                                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, opacity: 0.55, padding: 0 }}
                                              >
                                                ✏️
                                              </button>
                                            </span>
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", color: C.slate }}>{fac.fechaVctoISO || "—"}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", color: fac.diasVencido > 90 ? C.red : C.slate }}>{fac.diasVencido}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", color: C.slate }}>{fmtCOP(fac.facTotal)}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", color: C.slate }}>{fmtCOP(fac.pagado)}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", color: fac.descuento > 0 ? (C.green || C.slate) : C.slate }}>{fac.descuento > 0 ? fmtCOP(fac.descuento) : "—"}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", color: fac.devolucion > 0 ? (C.green || C.slate) : C.slate }}>{fac.devolucion > 0 ? fmtCOP(fac.devolucion) : "—"}</td>
                                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 800, color: C.ink }}>{fmtCOP(fac.saldo)}</td>
                                      </tr>
                                    ))}
                                    {!facturasDetalle.length && (
                                      <tr><td colSpan={9} style={{ padding: "8px 10px", color: C.slate, fontStyle: "italic" }}>Sin facturas con saldo pendiente para este proveedor.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          {isAdmin && corteActivo && (
            <div style={{ marginTop: 14, textAlign: "right" }}>
              <button
                onClick={() => onDeleteCorte(corteActivo.id)}
                style={{ background: "none", border: "none", color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                🗑 Eliminar este corte
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
// ─── HOME CONTABILIDAD ────────────────────────────────────────────────────────
function HomeContabilidad({ onGoModulo }) {
  const MODULOS = [
    {
      id: "flujo_caja",
      icon: "💰",
      label: "Flujo de Caja",
      desc: "Ingresos, egresos y saldo mensual",
      color: C.green,
      bg: C.greenBg,
      activo: true,
    },
    {
      id: "informes",
      icon: "📊",
      label: "Informes",
      desc: "Reportes financieros y análisis",
      color: C.blue,
      bg: C.blueBg,
      activo: false,
    },
    {
      id: "cuentas",
      icon: "📋",
      label: "Cuentas por Cobrar",
      desc: "Seguimiento de cartera",
      color: C.violet,
      bg: C.violetBg,
      activo: false,
    },
    {
      id: "presupuesto",
      icon: "📅",
      label: "Presupuesto",
      desc: "Planificación financiera",
      color: C.amber,
      bg: C.amberBg,
      activo: false,
    },
  ];
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>
          💰 Contabilidad
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: C.slate }}>
          Gestión financiera de Industrias Yanko
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
          gap: 16,
        }}
      >
        {MODULOS.map((m) => (
          <div
            key={m.id}
            onClick={m.activo ? () => onGoModulo(m.id) : undefined}
            style={{
              background: C.white,
              borderRadius: 14,
              padding: 22,
              border: `1.5px solid ${m.activo ? C.border : "#EDEDF2"}`,
              cursor: m.activo ? "pointer" : "default",
              opacity: m.activo ? 1 : 0.6,
              transition: "all 0.2s",
              position: "relative",
            }}
            onMouseEnter={(e) => {
              if (m.activo) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.borderColor = m.color;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.borderColor = m.activo
                ? C.border
                : "#EDEDF2";
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: m.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                marginBottom: 14,
              }}
            >
              {m.icon}
            </div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                color: C.ink,
                marginBottom: 6,
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.slate,
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              {m.desc}
            </div>
            {m.activo ? (
              <div style={{ fontSize: 12, fontWeight: 700, color: m.color }}>
                Entrar →
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.slate,
                  background: "#EDEDF2",
                  padding: "3px 10px",
                  borderRadius: 20,
                  display: "inline-block",
                }}
              >
                Próximamente
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── ROOT MÓDULO CONTABILIDAD ─────────────────────────────────────────────────
export default function ModuloContabilidad({ currentUser, onVolver, onLogout, puedeAdministrarBasesDadoPorCumplido, puedeSincronizarDadoPorCumplido }) {
  const [subView, setSubView] = useState("home");
  const [movimientos, setMovimientos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestosCliente, setPresupuestosCliente] = useState([]);
  const [cortesCxp, setCortesCxp] = useState([]);
  const [manualCxp, setManualCxp] = useState([]);
  const [calendarioCxp, setCalendarioCxp] = useState([]);
  // (2026-09-27, a pedido de Fredy) Mapeo manual codigo->nombre del
  // "Concepto de Obligacion" crudo que trae Busint (campo FCBI de "cartera
  // cxp-fact", ej. "SCONF"), para mostrar un nombre legible sin depender de
  // ninguna tabla catalogo de Busint (se buscaron varias y ninguna existe;
  // la traduccion parece vivir solo dentro del programa de Busint).
  const [nombresConceptoCxp, setNombresConceptoCxp] = useState({});
  // (2026-09-27, a pedido de Fredy) Mapeo manual codigo de proveedor ->
  // nombre real, para los codigos que Busint no tiene en "maestro de
  // proveedores" (confirmado que son plantas externas/talleres: 16, 26, 27,
  // 33, 1004, etc. -- ver getCuentasPorPagarBusintGen, que hoy los deja
  // como "Proveedor <codigo>").
  const [nombresProveedorCxp, setNombresProveedorCxp] = useState({});
  // (2026-09-27, a pedido de Fredy) Categoria manual por proveedor (Telas y
  // Proveedores, Pagos de Servicios, Pagos Insumos, Pago de Plantas de
  // Confeccion, Prestamos), para agrupar Cuentas por Pagar. Se guarda como
  // lista con proveedor + categoria (mismo patron que calendarioCxp) en vez
  // de usar el nombre del proveedor como id de documento, porque un nombre
  // real puede traer caracteres que Firestore no acepta como id.
  const [categoriasCxp, setCategoriasCxp] = useState([]);
  // (2026-09-27, a pedido de Fredy) Lista de categorías de Cuentas por
  // Pagar administrables desde Administración -- ya no son fijas en el
  // código, Fredy agrega y borra las que necesite.
  const [categoriasCxpLista, setCategoriasCxpLista] = useState([]);
  // (2026-09-27, a pedido de Fredy) Categoría automática por Concepto de
  // Obligación (ej. "SCONF" -> Telas y Proveedores): se categoriza una sola
  // vez por concepto y aplica a todo proveedor (nuevo o viejo) que use ese
  // concepto como principal -- ver conceptoPrincipal en
  // getCuentasPorPagarBusintGen y categoriaDeProveedor más abajo. La
  // categoría manual por proveedor (categoriasCxp) sigue existiendo y
  // siempre tiene prioridad sobre esta.
  const [categoriasPorConcepto, setCategoriasPorConcepto] = useState([]);
  const [clientesDiseno, setClientesDiseno] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "contabilidad_movimientos"),
      (snap) => {
        setMovimientos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        setLoading(false);
      }
    );
    const unsubCompras = onSnapshot(
      collection(db, "contabilidad_compras"),
      (snap) => {
        setCompras(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    );
    const unsubPresupuestos = onSnapshot(
      collection(db, "contabilidad_presupuestos"),
      (snap) => {
        setPresupuestos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    );
    // Presupuesto por cliente: definido a mano por el usuario, mes a mes,
    // según los pedidos que tenga con cada cliente.
    const unsubPresupuestosCliente = onSnapshot(
      collection(db, "contabilidad_presupuestos_cliente"),
      (snap) => {
        setPresupuestosCliente(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    );
    // Cuentas por pagar: cada import de TNS se guarda como un "corte" nuevo
    // (histórico, nunca se sobreescribe), más una lista de proveedores
    // agregados a mano, más el calendario de pago programado por proveedor.
    const unsubCortesCxp = onSnapshot(
      collection(db, "contabilidad_cxp_cortes"),
      (snap) => {
        setCortesCxp(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    );
    const unsubManualCxp = onSnapshot(
      collection(db, "contabilidad_cxp_manual"),
      (snap) => {
        setManualCxp(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    );
    const unsubCalendarioCxp = onSnapshot(
      collection(db, "contabilidad_cxp_calendario"),
      (snap) => {
        setCalendarioCxp(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    );
    // Mapeo manual codigo de concepto -> nombre legible (doc id = codigo
    // crudo, ej. "SCONF"; campo `nombre` = texto que escribe el usuario).
    const unsubNombresConceptoCxp = onSnapshot(
      collection(db, "contabilidad_cxp_nombres_concepto"),
      (snap) => {
        const mapa = {};
        snap.docs.forEach((d) => { mapa[d.id] = d.data()?.nombre || ""; });
        setNombresConceptoCxp(mapa);
      }
    );
    // Mapeo manual codigo de proveedor -> nombre real (doc id = codigo,
    // ej. "16"; campo `nombre` = texto que escribe el usuario).
    const unsubNombresProveedorCxp = onSnapshot(
      collection(db, "contabilidad_cxp_nombres_proveedor"),
      (snap) => {
        const mapa = {};
        snap.docs.forEach((d) => { mapa[d.id] = d.data()?.nombre || ""; });
        setNombresProveedorCxp(mapa);
      }
    );
    const unsubCategoriasCxp = onSnapshot(
      collection(db, "contabilidad_cxp_categorias"),
      (snap) => {
        setCategoriasCxp(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      }
    );
    const unsubCategoriasCxpLista = onSnapshot(
      collection(db, "contabilidad_cxp_categorias_lista"),
      (snap) => {
        setCategoriasCxpLista(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .sort((a, b) => (a.creadoEn || "").localeCompare(b.creadoEn || ""))
        );
      }
    );
    // Categoría automática por Concepto de Obligación (doc id = concepto
    // crudo, ej. "SCONF"; campo `categoria` = id de categoriasCxpLista).
    const unsubCategoriasPorConcepto = onSnapshot(
      collection(db, "contabilidad_cxp_categorias_concepto"),
      (snap) => {
        setCategoriasPorConcepto(snap.docs.map((d) => ({ ...d.data(), concepto: d.id })));
      }
    );
    // Clientes: se leen en vivo del mismo documento de configuración que usa
    // Diseño (Admin → Clientes). Solo lectura desde Contabilidad — agregar o
    // borrar clientes se sigue haciendo únicamente desde Diseño.
    const unsubClientes = onSnapshot(doc(db, "config", "main"), (snap) => {
      setClientesDiseno(snap.exists() ? snap.data()?.clientes || [] : []);
    });
    return () => {
      unsub();
      unsubCompras();
      unsubPresupuestos();
      unsubPresupuestosCliente();
      unsubCortesCxp();
      unsubManualCxp();
      unsubCalendarioCxp();
      unsubNombresConceptoCxp();
      unsubNombresProveedorCxp();
      unsubCategoriasCxp();
      unsubCategoriasCxpLista();
      unsubCategoriasPorConcepto();
      unsubClientes();
    };
  }, []);
  async function addMovimiento(m) {
    setMovimientos((ms) => [...ms, m]);
    await fsSave("contabilidad_movimientos", m.id, m);
  }
  async function deleteMovimiento(id) {
    setMovimientos((ms) => ms.filter((m) => m.id !== id));
    await fsDelete("contabilidad_movimientos", id);
  }
  // Limpieza rápida para cuando se importó por el botón equivocado (ej. un
  // export de Busint importado como egresos genéricos): borra de un golpe
  // todos los movimientos que quedaron con una fecha específica.
  async function deleteMovimientosDeFecha(fecha) {
    const aBorrar = movimientos.filter((m) => m.fecha === fecha).map((m) => m.id);
    setMovimientos((ms) => ms.filter((m) => m.fecha !== fecha));
    await Promise.all(aBorrar.map((id) => fsDelete("contabilidad_movimientos", id)));
  }
  // Actualiza solo la distribución por rubro de un ingreso ya registrado —
  // usado por "Asignar por rubro" en la tabla de Flujo de Caja.
  async function updateDistribucion(id, distribucion) {
    setMovimientos((ms) => ms.map((m) => (m.id === id ? { ...m, distribucion } : m)));
    await fsSave("contabilidad_movimientos", id, { distribucion });
  }
  async function addComprasBatch(items) {
    setCompras((cs) => [...cs, ...items]);
    await Promise.all(items.map((c) => fsSave("contabilidad_compras", c.id, c)));
  }
  async function deleteComprasDeMes(mes) {
    const aBorrar = compras.filter((c) => c.mes === mes).map((c) => c.id);
    setCompras((cs) => cs.filter((c) => c.mes !== mes));
    await Promise.all(aBorrar.map((id) => fsDelete("contabilidad_compras", id)));
  }
  async function deleteCompra(id) {
    setCompras((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("contabilidad_compras", id);
  }
  // Cuadre manual de IVA/Retención sobre un registro ya importado de Busint
  // (Comparativo por Concepto). El usuario escribe los valores a mano; el
  // Valor Neto a Pagar se calcula como Vbruto + IVA - Retención.
  async function updateCompra(id, patch) {
    setCompras((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fsSave("contabilidad_compras", id, patch);
  }
  // Antes de agregar los grupos nuevos, borra los meses que el usuario marcó
  // para reemplazar (evita duplicar totales si se reimporta el mismo mes).
  async function onImportarCompras(nuevos, reemplazarMap) {
    const mesesAReemplazar = Object.keys(reemplazarMap).filter((m) => reemplazarMap[m]);
    for (const mes of mesesAReemplazar) {
      await deleteComprasDeMes(mes);
    }
    await addComprasBatch(nuevos);
  }
  async function addCorteCxp(corte) {
    setCortesCxp((cs) => [...cs, corte]);
    await fsSave("contabilidad_cxp_cortes", corte.id, corte);
  }
  async function deleteCorteCxp(id) {
    setCortesCxp((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("contabilidad_cxp_cortes", id);
  }
  // Borra un solo proveedor dentro de un corte ya importado (a diferencia de
  // deleteCorteCxp, que borra el corte completo). Reescribe el corte sin ese
  // proveedor y lo guarda de nuevo en Firestore.
  async function eliminarProveedorDeCorte(corteId, nombreProveedor) {
    const corte = cortesCxp.find((c) => c.id === corteId);
    if (!corte) return;
    const actualizado = { ...corte, proveedores: (corte.proveedores || []).filter((p) => p.nombre !== nombreProveedor) };
    setCortesCxp((cs) => cs.map((c) => (c.id === corteId ? actualizado : c)));
    await fsSave("contabilidad_cxp_cortes", corteId, actualizado);
  }
  async function addManualCxp(item) {
    setManualCxp((ms) => [...ms, item]);
    await fsSave("contabilidad_cxp_manual", item.id, item);
  }
  async function deleteManualCxp(id) {
    setManualCxp((ms) => ms.filter((m) => m.id !== id));
    await fsDelete("contabilidad_cxp_manual", id);
  }
  // Guarda/renombra el nombre legible de un codigo de concepto crudo de
  // Busint (ej. "SCONF" -> "SERVICIO DE CONFECCION"). El id del documento es
  // el codigo mismo, asi que volver a guardar el mismo codigo simplemente
  // actualiza el nombre.
  async function guardarNombreConceptoCxp(codigo, nombre) {
    if (!codigo) return;
    setNombresConceptoCxp((m) => ({ ...m, [codigo]: nombre }));
    await fsSave("contabilidad_cxp_nombres_concepto", codigo, { nombre, actualizadoEn: new Date().toISOString() });
  }
  // Guarda/renombra el nombre real de un codigo de proveedor que Busint no
  // tiene en su catalogo (ej. "16" -> "INDUSTRIAS YANKO MODULO CENTRO").
  async function guardarNombreProveedorCxp(codigo, nombre) {
    if (!codigo) return;
    setNombresProveedorCxp((m) => ({ ...m, [codigo]: nombre }));
    await fsSave("contabilidad_cxp_nombres_proveedor", codigo, { nombre, actualizadoEn: new Date().toISOString() });
  }
  // Reemplaza la categoría de un proveedor (borra la anterior si había y
  // guarda la nueva) -- mismo patrón que guardarCalendarioProveedor, para
  // no depender del nombre del proveedor como id de documento.
  async function guardarCategoriaProveedorCxp(proveedor, categoria) {
    const existentes = categoriasCxp.filter((c) => c.proveedor === proveedor);
    setCategoriasCxp((cs) => {
      const sinViejo = cs.filter((c) => c.proveedor !== proveedor);
      return categoria ? [...sinViejo, { id: uid(), proveedor, categoria, actualizadoEn: new Date().toISOString() }] : sinViejo;
    });
    await Promise.all(existentes.map((e) => fsDelete("contabilidad_cxp_categorias", e.id)));
    if (categoria) {
      const nuevo = { id: uid(), proveedor, categoria, actualizadoEn: new Date().toISOString() };
      await fsSave("contabilidad_cxp_categorias", nuevo.id, nuevo);
    }
  }
  // Agrega una categoría nueva a la lista administrable de Cuentas por
  // Pagar (ver Administración).
  async function agregarCategoriaCxpLista(label) {
    const limpio = (label || "").trim();
    if (!limpio) return;
    const nueva = { id: uid(), label: limpio, creadoEn: new Date().toISOString() };
    setCategoriasCxpLista((cs) => [...cs, nueva]);
    await fsSave("contabilidad_cxp_categorias_lista", nueva.id, nueva);
  }
  // Borra una categoría de la lista -- los proveedores que la tenían
  // asignada no se tocan, simplemente dejan de encontrarla (ver
  // categoriaDeProveedor en CuentasPorPagarView) y vuelven a aparecer en
  // "Sin categoría".
  async function eliminarCategoriaCxpLista(id) {
    setCategoriasCxpLista((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("contabilidad_cxp_categorias_lista", id);
  }
  // Asigna (o quita, si categoria es null) la categoría automática de un
  // Concepto de Obligación. El id del documento es el concepto mismo (ej.
  // "SCONF"), así que volver a guardar el mismo concepto simplemente
  // actualiza la categoría -- no hay que borrar y recrear como con
  // categoriasCxp (ahí el nombre del proveedor no era seguro como id).
  async function guardarCategoriaConcepto(concepto, categoria) {
    if (!concepto) return;
    setCategoriasPorConcepto((cs) => {
      const sinViejo = cs.filter((c) => c.concepto !== concepto);
      return categoria ? [...sinViejo, { concepto, categoria, actualizadoEn: new Date().toISOString() }] : sinViejo;
    });
    if (categoria) {
      await fsSave("contabilidad_cxp_categorias_concepto", concepto, { categoria, actualizadoEn: new Date().toISOString() });
    } else {
      await fsDelete("contabilidad_cxp_categorias_concepto", concepto);
    }
  }
  // Conceptos de Obligación vistos en el corte de Cuentas por Pagar más
  // reciente (con cuántos proveedores lo tienen como concepto principal),
  // para poder asignarles categoría desde Administración sin depender de
  // volver a traer el corte desde Busint.
  const cortesCxpOrdenados = [...cortesCxp].sort((a, b) => claveOrdenCorte(b).localeCompare(claveOrdenCorte(a)));
  const conteoConceptosCxp = {};
  (cortesCxpOrdenados[0]?.proveedores || []).forEach((p) => {
    if (p.conceptoPrincipal) conteoConceptosCxp[p.conceptoPrincipal] = (conteoConceptosCxp[p.conceptoPrincipal] || 0) + 1;
  });
  const conceptosCxpVistos = Object.entries(conteoConceptosCxp)
    .map(([codigo, count]) => ({ codigo, count }))
    .sort((a, b) => b.count - a.count);
  // Lista única de rubros históricos (código + nombre), para el selector de
  // distribución de ingresos y para calcular el avance por rubro en Proyección.
  const rubros = (() => {
    const map = {};
    compras.forEach((c) => {
      const key = `${c.codConcep}__${c.concepto}`;
      if (!map[key]) map[key] = { codConcep: c.codConcep, concepto: c.concepto };
    });
    return Object.values(map).sort((a, b) => a.concepto.localeCompare(b.concepto));
  })();
  const isAdmin = currentUser?.isAdmin;
  const NAV = [
    { id: "home", icon: "◉", label: "Inicio" },
    { id: "flujo_caja", icon: "💰", label: "Flujo de Caja" },
    { id: "comparativo", icon: "📊", label: "Comparativo por Concepto" },
    { id: "facturacion_clientes", icon: "🧾", label: "Facturación Clientes" },
    { id: "dado_por_cumplido", icon: "✅", label: "Dado por Cumplido" },
    { id: "cxp", icon: "🧾", label: "Cuentas por Pagar" },
    { id: "administracion", icon: "🗂️", label: "Administración" },
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
          <div style={{ fontSize: 36, marginBottom: 12 }}>💰</div>
          <div style={{ color: C.slate }}>Cargando Contabilidad...</div>
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
          width: 220,
          background: C.ink,
          padding: "24px 14px",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>
            💰 Contabilidad
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
            Industrias Yanko
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            background: "#2A2A45",
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: `linear-gradient(135deg,${C.seam},#9E8870)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 800,
              color: C.ink,
              flexShrink: 0,
            }}
          >
            {(currentUser?.name || "U")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.white,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {currentUser?.name}
            </div>
            <div style={{ fontSize: 10, color: C.seam }}>
              {currentUser?.role}
            </div>
          </div>
        </div>
        <nav
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}
        >
          {NAV.map((item) => {
            const active = subView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSubView(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "9px 12px",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: active ? "#C8B8A2" : "transparent",
                  color: active ? C.ink : "#8888AA",
                  fontWeight: active ? 800 : 500,
                  fontSize: 13,
                  textAlign: "left",
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "9px 12px",
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
              ← Volver al Inicio
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "9px 12px",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                background: "transparent",
                color: "rgba(232,93,74,0.85)",
                fontWeight: 700,
                fontSize: 12,
                textAlign: "left",
                marginTop: onVolver ? 2 : 8,
              }}
            >
              ⏏ Cerrar sesión
            </button>
          )}
        </nav>
      </div>
      {/* Main */}
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {subView === "home" && (
            <HomeContabilidad onGoModulo={(id) => setSubView(id)} />
          )}
          {subView === "flujo_caja" && (
            <FlujoCajaView
              movimientos={movimientos}
              onAdd={addMovimiento}
              onDelete={deleteMovimiento}
              onDeleteFecha={deleteMovimientosDeFecha}
              isAdmin={isAdmin}
              clientesDiseno={clientesDiseno}
              rubros={rubros}
              onUpdateDistribucion={updateDistribucion}
            />
          )}
          {subView === "comparativo" && (
            <ComparativoConceptosView
              compras={compras}
              onImportar={onImportarCompras}
              onDeleteMes={deleteComprasDeMes}
              onUpdateCompra={updateCompra}
              isAdmin={isAdmin}
            />
          )}
          {subView === "facturacion_clientes" && <FacturacionClientesView />}
          {subView === "dado_por_cumplido" && <DadoPorCumplidoView currentUser={currentUser} puedeAdministrarBases={puedeAdministrarBasesDadoPorCumplido} puedeSincronizar={puedeSincronizarDadoPorCumplido} />}
          {subView === "cxp" && (
            <CuentasPorPagarView
              cortes={cortesCxp}
              manuales={manualCxp}
              calendario={calendarioCxp}
              nombresConcepto={nombresConceptoCxp}
              nombresProveedor={nombresProveedorCxp}
              categoriasCxp={categoriasCxp}
              categoriasLista={categoriasCxpLista}
              categoriasPorConcepto={categoriasPorConcepto}
              onImportarCorte={addCorteCxp}
              onDeleteCorte={deleteCorteCxp}
              onAddManual={addManualCxp}
              onDeleteManual={deleteManualCxp}
              onDeleteProveedorCorte={eliminarProveedorDeCorte}
              onGuardarNombreConcepto={guardarNombreConceptoCxp}
              onGuardarNombreProveedor={guardarNombreProveedorCxp}
              onGuardarCategoria={guardarCategoriaProveedorCxp}
              isAdmin={isAdmin}
            />
          )}
          {subView === "administracion" && (
            <AdministracionView
              currentUser={currentUser}
              categoriasCxpLista={categoriasCxpLista}
              categoriasCxp={categoriasCxp}
              categoriasPorConcepto={categoriasPorConcepto}
              conceptosCxpVistos={conceptosCxpVistos}
              nombresConcepto={nombresConceptoCxp}
              onAgregarCategoriaLista={agregarCategoriaCxpLista}
              onEliminarCategoriaLista={eliminarCategoriaCxpLista}
              onGuardarCategoriaConcepto={guardarCategoriaConcepto}
            />
          )}
        </div>
      </div>
    </div>
  );
}
