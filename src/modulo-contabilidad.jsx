import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
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
function ultimoDiaMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m, 0).getDate();
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
function FInput({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
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
function ComparativoConceptosView({ compras, onImportar, onDeleteMes, isAdmin }) {
  const [showImport, setShowImport] = useState(false);
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
  return (
    <div>
      {showImport && (
        <ImportarBusintModal
          comprasExistentes={compras}
          onConfirm={onImportar}
          onClose={() => setShowImport(false)}
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
            Gasto agrupado por concepto, mes a mes (Valor Bruto Busint)
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
                      {meses.map((m) => (
                        <td
                          key={m}
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontWeight: m === mesMax && f.porMes[m] ? 800 : 500,
                            color: m === mesMax && f.porMes[m] ? C.red : C.slate,
                            background: m === mesMax && f.porMes[m] ? C.redBg : "transparent",
                          }}
                        >
                          {f.porMes[m] ? fmtCOP(f.porMes[m]) : "—"}
                        </td>
                      ))}
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
// ─── PROYECCIÓN DE FLUJO DE CAJA (PRESUPUESTO POR MES) ────────────────────────
// El "promedio" de cada rubro se calcula en vivo a partir de los meses ya
// cargados en el Comparativo (contabilidad_compras) — nunca se recalcula
// retroactivamente sobre un presupuesto ya guardado, así que editar un
// borrador conserva la selección de rubros y el % de ajuste que tenías.
function sumarMes(mes, n = 1) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ProyeccionForm({ compras, presupuestoExistente, onGuardar, onClose }) {
  const mesesCompras = [...new Set(compras.map((c) => c.mes))].sort();
  const baseItems = (() => {
    const map = {};
    compras.forEach((c) => {
      const key = `${c.codConcep}__${c.concepto}`;
      if (!map[key]) map[key] = { codConcep: c.codConcep, concepto: c.concepto, total: 0 };
      map[key].total += c.valor;
    });
    return Object.values(map)
      .map((b) => ({ ...b, promedio: mesesCompras.length ? b.total / mesesCompras.length : 0 }))
      .sort((a, b) => b.promedio - a.promedio);
  })();
  const [mesForm, setMesForm] = useState(
    presupuestoExistente?.mes || (mesesCompras.length ? sumarMes(mesesCompras[mesesCompras.length - 1]) : sumarMes(today().slice(0, 7)))
  );
  const [ajustePct, setAjustePct] = useState(presupuestoExistente?.ajustePct ?? 0);
  const [incluidos, setIncluidos] = useState(() => {
    const init = {};
    baseItems.forEach((b) => {
      const key = `${b.codConcep}__${b.concepto}`;
      const guardado = presupuestoExistente?.items?.find((i) => i.codConcep === b.codConcep && i.concepto === b.concepto);
      init[key] = guardado ? !!guardado.incluido : true;
    });
    return init;
  });
  function toggle(key) {
    setIncluidos((inc) => ({ ...inc, [key]: !inc[key] }));
  }
  const itemsFinal = baseItems.map((b) => {
    const key = `${b.codConcep}__${b.concepto}`;
    const incluido = !!incluidos[key];
    const valorFinal = incluido ? b.promedio * (1 + (parseFloat(ajustePct) || 0) / 100) : 0;
    return { ...b, key, incluido, valorFinal };
  });
  const totalProyectado = itemsFinal.filter((i) => i.incluido).reduce((s, i) => s + i.valorFinal, 0);
  function guardar() {
    if (!mesForm) return;
    onGuardar({
      id: mesForm,
      mes: mesForm,
      ajustePct: parseFloat(ajustePct) || 0,
      items: itemsFinal.map((i) => ({
        codConcep: i.codConcep,
        concepto: i.concepto,
        promedio: i.promedio,
        incluido: i.incluido,
        valorFinal: i.valorFinal,
      })),
      totalProyectado,
      estado: "borrador",
      creadoEn: presupuestoExistente?.creadoEn || new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });
    onClose();
  }
  return (
    <Modal title={presupuestoExistente ? "Editar Proyección" : "Nueva Proyección"} onClose={onClose} width={820}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Field label="Mes a proyectar">
          <FInput
            type="month"
            value={mesForm}
            onChange={setMesForm}
          />
        </Field>
        <Field label="Ajuste % sobre el promedio">
          <FInput
            type="number"
            value={ajustePct}
            onChange={setAjustePct}
            placeholder="Ej: 3 (para +3%)"
          />
        </Field>
      </div>
      {!baseItems.length ? (
        <div style={{ textAlign: "center", padding: 32, color: C.slate, fontSize: 13 }}>
          Aún no hay rubros históricos en Comparativo por Concepto para calcular un promedio.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>
            Promedio calculado sobre {mesesCompras.length} mes{mesesCompras.length !== 1 ? "es" : ""} cargado{mesesCompras.length !== 1 ? "s" : ""}. Desmarca los rubros que no quieres incluir en la proyección (ej. los que ya te cubre un cliente).
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
                  {["", "Código", "Concepto", "Promedio", "Con ajuste"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
                        color: C.seam,
                        textAlign: h === "Promedio" || h === "Con ajuste" ? "right" : "left",
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
                {itemsFinal.map((i) => (
                  <tr
                    key={i.key}
                    style={{
                      background: i.incluido ? C.white : C.canvas,
                      opacity: i.incluido ? 1 : 0.5,
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <td style={{ padding: "6px 10px" }}>
                      <input type="checkbox" checked={i.incluido} onChange={() => toggle(i.key)} />
                    </td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{i.codConcep}</td>
                    <td style={{ padding: "6px 10px" }}>{i.concepto}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: C.slate, whiteSpace: "nowrap" }}>
                      {fmtCOP(i.promedio)}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>
                      {i.incluido ? fmtCOP(i.valorFinal) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: C.violetBg,
          borderRadius: 10,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: C.violet }}>Total proyectado para {fmtMesLargo(mesForm)}</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: C.violet }}>{fmtCOP(totalProyectado)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn variant="danger" onClick={guardar} disabled={!baseItems.length}>
          Guardar Proyección
        </Btn>
      </div>
    </Modal>
  );
}
function ProyeccionView({ compras, movimientos, presupuestos, onGuardar, onFinalizar, onDeletePresupuesto, isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const lista = [...presupuestos].sort((a, b) => b.mes.localeCompare(a.mes));
  return (
    <div>
      {showForm && (
        <ProyeccionForm
          compras={compras}
          presupuestoExistente={editando}
          onGuardar={onGuardar}
          onClose={() => {
            setShowForm(false);
            setEditando(null);
          }}
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Proyección</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            Presupuesto mensual estimado a partir del histórico de Comparativo por Concepto
          </p>
        </div>
        <Btn
          variant="danger"
          onClick={() => {
            setEditando(null);
            setShowForm(true);
          }}
        >
          + Nueva Proyección
        </Btn>
      </div>
      {!lista.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          Aún no has creado ninguna proyección. Usa "+ Nueva Proyección" para armar el presupuesto del próximo mes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {lista.map((p) => {
            const ingresosMes = movimientos.filter((m) => m.tipo === "ingreso" && m.fecha?.slice(0, 7) === p.mes);
            const ingresosReales = ingresosMes.reduce((s, m) => s + m.valor, 0);
            const avancePct = p.totalProyectado > 0 ? Math.min((ingresosReales / p.totalProyectado) * 100, 999) : 0;
            const terminado = p.estado === "terminado";
            // Avance por rubro: cuánto de cada rubro presupuestado ya fue cubierto
            // por distribuciones de ingresos de clientes registradas ese mes.
            const itemsConAvance = terminado
              ? (p.items || [])
                  .filter((i) => i.incluido)
                  .map((i) => {
                    const cubierto = ingresosMes.reduce((s, m) => {
                      const enEsteRubro = (m.distribucion || []).filter((d) => d.codConcep === i.codConcep);
                      return s + enEsteRubro.reduce((s2, d) => s2 + (parseFloat(d.monto) || 0), 0);
                    }, 0);
                    const pct = i.valorFinal > 0 ? Math.min((cubierto / i.valorFinal) * 100, 999) : 0;
                    return { ...i, cubierto, pct };
                  })
              : [];
            const disponibleSinAsignar = ingresosMes.reduce((s, m) => {
              const asignado = (m.distribucion || []).reduce((s2, d) => s2 + (parseFloat(d.monto) || 0), 0);
              return s + (m.valor - asignado);
            }, 0);
            return (
              <div key={p.id} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: terminado ? 14 : 0 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 800, fontSize: 16, color: C.ink, textTransform: "capitalize" }}>{fmtMesLargo(p.mes)}</span>
                      <span
                        style={{
                          padding: "2px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          background: terminado ? C.greenBg : C.amberBg,
                          color: terminado ? C.green : C.amber,
                        }}
                      >
                        {terminado ? "✓ Terminado" : "Borrador"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: C.slate, marginTop: 4 }}>
                      Total proyectado: <strong style={{ color: C.ink }}>{fmtCOP(p.totalProyectado)}</strong>
                      {p.ajustePct ? ` (ajuste ${p.ajustePct > 0 ? "+" : ""}${p.ajustePct}%)` : ""}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {!terminado && (
                        <>
                          <Btn
                            small
                            variant="secondary"
                            onClick={() => {
                              setEditando(p);
                              setShowForm(true);
                            }}
                          >
                            Editar
                          </Btn>
                          <Btn small variant="success" onClick={() => onFinalizar(p.id)}>
                            Presupuesto Terminado
                          </Btn>
                        </>
                      )}
                      <Btn small variant="danger" onClick={() => onDeletePresupuesto(p.id)}>
                        Eliminar
                      </Btn>
                    </div>
                  )}
                </div>
                {terminado && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.slate, marginBottom: 6 }}>
                      <span>
                        Ingresos reales de {fmtMesLargo(p.mes)}: <strong style={{ color: C.green }}>{fmtCOP(ingresosReales)}</strong>
                      </span>
                      <span style={{ fontWeight: 700, color: avancePct >= 100 ? C.green : C.amber }}>{Math.round(avancePct)}% del presupuesto total</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 5, background: C.canvas, overflow: "hidden", marginBottom: 14 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(avancePct, 100)}%`,
                          background: avancePct >= 100 ? C.green : C.amber,
                          borderRadius: 5,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Avance por rubro</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                      {itemsConAvance.map((i) => (
                        <div key={i.key || `${i.codConcep}__${i.concepto}`}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.slate, marginBottom: 3 }}>
                            <span>
                              {i.concepto} <span style={{ color: C.slate, fontWeight: 400 }}>({i.codConcep})</span>
                            </span>
                            <span style={{ fontWeight: 700, color: i.pct >= 100 ? C.green : C.ink }}>
                              {fmtCOP(i.cubierto)} / {fmtCOP(i.valorFinal)} · {Math.round(i.pct)}%
                            </span>
                          </div>
                          <div style={{ height: 7, borderRadius: 4, background: C.canvas, overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.min(i.pct, 100)}%`,
                                background: i.pct >= 100 ? C.green : C.violet,
                                borderRadius: 4,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: disponibleSinAsignar >= 0 ? C.greenBg : C.redBg,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: disponibleSinAsignar >= 0 ? C.green : C.red }}>
                        Disponible sin asignar a rubro
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: disponibleSinAsignar >= 0 ? C.green : C.red }}>
                        {fmtCOP(disponibleSinAsignar)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// ─── PRESUPUESTO POR CLIENTE ───────────────────────────────────────────────────
// A diferencia del presupuesto por rubro (Proyección, calculado del histórico
// de compras), este lo define el usuario a mano: cuánto espera que cada
// cliente le abone ese mes, según los pedidos que tenga con él. Compara contra
// lo efectivamente abonado para saber quién va cumpliendo.
function PresupuestoClientesView({ movimientos, presupuestosCliente, clientesDiseno, onGuardar, onDelete, isAdmin }) {
  const [mes, setMes] = useState(() => today().slice(0, 7));
  const [showAdd, setShowAdd] = useState(false);
  const [clienteNuevo, setClienteNuevo] = useState("");
  const [montoNuevo, setMontoNuevo] = useState("");
  const presupuestosMes = presupuestosCliente.filter((p) => p.mes === mes);
  const clientesConPresupuesto = new Set(presupuestosMes.map((p) => p.cliente));
  const clientesDisponibles = (clientesDiseno || []).filter((c) => !clientesConPresupuesto.has(c.nombre));
  function abonadoDe(cliente) {
    return movimientos
      .filter((m) => m.tipo === "ingreso" && m.fecha?.slice(0, 7) === mes && (m.cliente || m.proveedor) === cliente)
      .reduce((s, m) => s + m.valor, 0);
  }
  function agregar() {
    if (!clienteNuevo || !montoNuevo) return;
    onGuardar({
      id: uid(),
      mes,
      cliente: clienteNuevo,
      monto: parseFloat(montoNuevo) || 0,
      creadoEn: new Date().toISOString(),
    });
    setClienteNuevo("");
    setMontoNuevo("");
    setShowAdd(false);
  }
  const totalPresupuestado = presupuestosMes.reduce((s, p) => s + p.monto, 0);
  const totalAbonado = presupuestosMes.reduce((s, p) => s + abonadoDe(p.cliente), 0);
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Presupuesto Clientes</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
            Cuánto esperas que abone cada cliente este mes, según sus pedidos
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <FInput type="month" value={mes} onChange={setMes} />
          {isAdmin && (
            <Btn variant="danger" onClick={() => setShowAdd(true)}>
              + Agregar cliente
            </Btn>
          )}
        </div>
      </div>
      {showAdd && (
        <Modal title="Agregar presupuesto de cliente" onClose={() => setShowAdd(false)} width={440}>
          <Field label="Cliente">
            <FSel value={clienteNuevo} onChange={setClienteNuevo} options={clientesDisponibles.map((c) => c.nombre)} />
          </Field>
          <Field label="Monto esperado este mes">
            <FInput type="number" value={montoNuevo} onChange={setMontoNuevo} placeholder="Ej: 20000000" />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>
              Cancelar
            </Btn>
            <Btn variant="danger" onClick={agregar} disabled={!clienteNuevo || !montoNuevo}>
              Guardar
            </Btn>
          </div>
        </Modal>
      )}
      {!presupuestosMes.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          Aún no le has puesto presupuesto a ningún cliente en {fmtMesLargo(mes)}.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2,1fr)",
              gap: 14,
              marginBottom: 24,
            }}
          >
            <KPI icon="🎯" label="Total presupuestado" value={fmtCOP(totalPresupuestado)} color={C.violet} bg={C.violetBg} />
            <KPI
              icon="💵"
              label="Total abonado"
              value={fmtCOP(totalAbonado)}
              color={totalAbonado >= totalPresupuestado ? C.green : C.amber}
              bg={totalAbonado >= totalPresupuestado ? C.greenBg : C.amberBg}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {presupuestosMes.map((p) => {
              const abonado = abonadoDe(p.cliente);
              const pct = p.monto > 0 ? Math.min((abonado / p.monto) * 100, 999) : 0;
              return (
                <div key={p.id} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{p.cliente}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 100 ? C.green : C.amber }}>
                        {fmtCOP(abonado)} / {fmtCOP(p.monto)} · {Math.round(pct)}%
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => onDelete(p.id)}
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
                    </div>
                  </div>
                  <div style={{ height: 9, borderRadius: 5, background: C.canvas, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(pct, 100)}%`,
                        background: pct >= 100 ? C.green : C.amber,
                        borderRadius: 5,
                      }}
                    />
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
export default function ModuloContabilidad({ currentUser, onVolver, onLogout }) {
  const [subView, setSubView] = useState("home");
  const [movimientos, setMovimientos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestosCliente, setPresupuestosCliente] = useState([]);
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
  // Antes de agregar los grupos nuevos, borra los meses que el usuario marcó
  // para reemplazar (evita duplicar totales si se reimporta el mismo mes).
  async function onImportarCompras(nuevos, reemplazarMap) {
    const mesesAReemplazar = Object.keys(reemplazarMap).filter((m) => reemplazarMap[m]);
    for (const mes of mesesAReemplazar) {
      await deleteComprasDeMes(mes);
    }
    await addComprasBatch(nuevos);
  }
  async function guardarPresupuesto(p) {
    setPresupuestos((ps) => [...ps.filter((x) => x.id !== p.id), p]);
    await fsSave("contabilidad_presupuestos", p.id, p);
  }
  async function finalizarPresupuesto(id) {
    const p = presupuestos.find((x) => x.id === id);
    if (!p) return;
    const actualizado = { ...p, estado: "terminado", terminadoEn: new Date().toISOString() };
    setPresupuestos((ps) => ps.map((x) => (x.id === id ? actualizado : x)));
    await fsSave("contabilidad_presupuestos", id, actualizado);
  }
  async function deletePresupuesto(id) {
    setPresupuestos((ps) => ps.filter((x) => x.id !== id));
    await fsDelete("contabilidad_presupuestos", id);
  }
  async function addPresupuestoCliente(p) {
    setPresupuestosCliente((ps) => [...ps, p]);
    await fsSave("contabilidad_presupuestos_cliente", p.id, p);
  }
  async function deletePresupuestoCliente(id) {
    setPresupuestosCliente((ps) => ps.filter((p) => p.id !== id));
    await fsDelete("contabilidad_presupuestos_cliente", id);
  }
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
    { id: "proyeccion", icon: "🎯", label: "Proyección" },
    { id: "clientes", icon: "🤝", label: "Presupuesto Clientes" },
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
              isAdmin={isAdmin}
            />
          )}
          {subView === "proyeccion" && (
            <ProyeccionView
              compras={compras}
              movimientos={movimientos}
              presupuestos={presupuestos}
              onGuardar={guardarPresupuesto}
              onFinalizar={finalizarPresupuesto}
              onDeletePresupuesto={deletePresupuesto}
              isAdmin={isAdmin}
            />
          )}
          {subView === "clientes" && (
            <PresupuestoClientesView
              movimientos={movimientos}
              presupuestosCliente={presupuestosCliente}
              clientesDiseno={clientesDiseno}
              onGuardar={addPresupuestoCliente}
              onDelete={deletePresupuestoCliente}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </div>
    </div>
  );
}

