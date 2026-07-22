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
import { getFunctions, httpsCallable } from "firebase/functions";

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
// Cliente de Cloud Functions — usado por "Revisar contra Busint" (llama
// getPedidosExistentesBusint, la misma función que ya usa el Informe de
// Pedidos Vigentes en el módulo de Diseño) para saber qué pedidos activos ya
// no existen en Busint y marcarlos automáticamente en vez de dejarlos
// pegados como activos para siempre.
const functionsClient = getFunctions(fbApp);

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
function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-CO");
}
function fmtCOP(n) {
  return `$${fmtNum(Math.round(n || 0))}`;
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

// ─── TALLAS BUSINT ────────────────────────────────────────────────────────────
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

// ─── PARSE EXCEL BUSINT (XLSX o CSV) ─────────────────────────────────────────
async function parseBusintFile(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: true,
  });

  // ── Columnas fijas del reporte Busint ──────────────────────────────────────
  const COL = {
    numPedido: 2, // C — o buscar en primeras filas
    cliente: 5, // F
    fechaPed: 8, // I (30-jun-26)
    fechaDes: 8, // I misma celda o J
    ciudad: 10, // K
    vendedor: 11, // L
    ref: 12, // M
    descripcion: 13, // N
    tallas: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23], // O-X
  };

  const TALLA_LABELS = [
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

  function cellStr(row, idx) {
    return String(row[idx] || "").trim();
  }
  function cellNum(row, idx) {
    return Math.round(Number(row[idx]) || 0);
  }
  function fmtFecha(val) {
    if (!val) return "";
    // Si es número de serie de Excel (fecha)
    if (typeof val === "number") {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    const m = s.match(
      /(\d{4}[-\/]\d{2}[-\/]\d{2})|(\d{2}[-\/]\d{2}[-\/]\d{4})/
    );
    return m ? m[0] : s;
  }

  const pedido = {
    id: uid(),
    numero: "",
    cliente: "",
    fechaPedido: "",
    fechaDespacho: "",
    vendedor: "",
    ciudad: "",
    observacion: "",
    referencias: [],
    estado: "activo",
    cortesRealizados: [],
    creadoEn: today(),
  };

  let headerFound = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;

    // Leer encabezado del pedido (primeras filas con datos en columnas clave)
    if (!headerFound) {
      const numPed = cellStr(row, COL.numPedido);
      const cliente = cellStr(row, COL.cliente);
      if (numPed && String(numPed).match(/^\d{3,6}$/)) {
        if (!pedido.numero) pedido.numero = numPed;
        if (!pedido.cliente && cliente) pedido.cliente = cliente;
        if (!pedido.fechaPedido)
          pedido.fechaPedido = fmtFecha(row[COL.fechaPed]);
        if (!pedido.fechaDespacho)
          pedido.fechaDespacho = fmtFecha(row[COL.fechaDes]);
        if (!pedido.ciudad) pedido.ciudad = cellStr(row, COL.ciudad);
        if (!pedido.vendedor) pedido.vendedor = cellStr(row, COL.vendedor);
      }
      // También buscar en filas de cabecera aunque no tenga número de pedido
      if (
        !pedido.cliente &&
        cliente &&
        cliente.length > 3 &&
        !cliente.match(/YANKO|INDUSTRIAS|Nit/i)
      )
        pedido.cliente = cliente;
    }

    // Detectar filas de referencias — tienen valor en col M (ref) y números en tallas
    const refVal = cellStr(row, COL.ref);
    const descVal = cellStr(row, COL.descripcion);
    const totalTallas = COL.tallas.reduce((s, idx) => s + cellNum(row, idx), 0);

    if (refVal && totalTallas > 0 && !refVal.match(/^(Ref|TOTAL|Suma)/i)) {
      const ref = {
        id: uid(),
        ref: refVal,
        descripcion: descVal,
        tallas: {},
        total: 0,
        precioCortePrenda: 0,
      };
      COL.tallas.forEach((colIdx, ti) => {
        const val = cellNum(row, colIdx);
        ref.tallas[TALLA_LABELS[ti]] = val;
        ref.total += val;
      });
      pedido.referencias.push(ref);
    }
  }

  // Si no encontró número de pedido, buscar en cualquier celda de las primeras filas
  if (!pedido.numero) {
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const line = (rows[i] || []).map((c) => String(c || "")).join(" ");
      const m = line.match(/\b(\d{3,6})\b/);
      if (m) {
        pedido.numero = m[1];
        break;
      }
    }
  }

  return pedido;
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
        <option key={o.id || o} value={o.id || o}>
          {o.nombre || o.name || o}
        </option>
      ))}
    </select>
  );
}
function Modal({ title, onClose, children, width = 600 }) {
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

// ─── SUBIR PEDIDO MODAL ───────────────────────────────────────────────────────
function SubirPedidoModal({ onSave, onClose }) {
  const [paso, setPaso] = useState(1);
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef();

  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const parsed = await parseBusintFile(f);
      if (!parsed.numero && !parsed.referencias.length) {
        setError(
          "No se pudo leer el archivo. Verifica que sea el reporte de Busint."
        );
        return;
      }
      setPedido(parsed);
      setPaso(2);
    } catch (err) {
      setError("Error al leer el archivo: " + err.message);
    }
  }

  function handleManual() {
    setPedido({
      id: uid(),
      numero: "",
      ordenCompra: "",
      clienteTipo: "A",
      cliente: "",
      fechaPedido: today(),
      fechaDespacho: "",
      codVen: "",
      vendedor: "",
      ciudad: "CÚCUTA",
      observacion: "",
      referencias: [],
      estado: "activo",
      cortesRealizados: [],
      creadoEn: today(),
    });
    setPaso(2);
  }

  function addRef() {
    setPedido((p) => ({
      ...p,
      referencias: [
        ...p.referencias,
        {
          id: uid(),
          ref: "",
          descripcion: "",
          precioCortePrenda: 0,
          tallas: Object.fromEntries(TALLAS_BUSINT.map((t) => [t, 0])),
          total: 0,
        },
      ],
    }));
  }

  function updateRef(idx, field, val) {
    setPedido((p) => {
      const refs = [...p.referencias];
      refs[idx] = { ...refs[idx], [field]: val };
      if (field.startsWith("talla_")) {
        const t = field.replace("talla_", "");
        refs[idx].tallas = { ...refs[idx].tallas, [t]: parseInt(val) || 0 };
        refs[idx].total = Object.values(refs[idx].tallas).reduce(
          (a, b) => a + b,
          0
        );
      }
      return { ...p, referencias: refs };
    });
  }

  function save() {
    if (!pedido.cliente || !pedido.referencias.length) {
      setError("Completa el cliente y al menos una referencia.");
      return;
    }
    onSave(pedido);
    onClose();
  }

  return (
    <Modal title="Cargar Pedido Busint" onClose={onClose} width={720}>
      {paso === 1 && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${C.blue}`,
                borderRadius: 12,
                padding: 32,
                textAlign: "center",
                cursor: "pointer",
                background: C.blueBg,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 700, color: C.blue }}>
                Subir Excel de Busint
              </div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
                Acepta .xlsx, .xls o .csv
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleFile}
              />
            </div>
            <div
              onClick={handleManual}
              style={{
                border: `2px dashed ${C.border}`,
                borderRadius: 12,
                padding: 32,
                textAlign: "center",
                cursor: "pointer",
                background: C.canvas,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>✏️</div>
              <div style={{ fontWeight: 700, color: C.ink }}>
                Ingresar manualmente
              </div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
                Digitar los datos del pedido
              </div>
            </div>
          </div>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: C.redBg,
                borderRadius: 8,
                color: C.red,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ⚠ {error}
            </div>
          )}
        </div>
      )}
      {paso === 2 && pedido && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Field label="Pedido N°">
              <FInput
                value={pedido.numero}
                onChange={(v) => setPedido((p) => ({ ...p, numero: v }))}
                placeholder="Ej: 1103"
              />
            </Field>
            <Field label="Cliente">
              <FInput
                value={pedido.cliente}
                onChange={(v) => setPedido((p) => ({ ...p, cliente: v }))}
                placeholder="Nombre del cliente"
              />
            </Field>
            <Field label="Fecha Pedido">
              <FInput
                type="date"
                value={pedido.fechaPedido}
                onChange={(v) => setPedido((p) => ({ ...p, fechaPedido: v }))}
              />
            </Field>
            <Field label="Fecha Despacho">
              <FInput
                type="date"
                value={pedido.fechaDespacho}
                onChange={(v) => setPedido((p) => ({ ...p, fechaDespacho: v }))}
              />
            </Field>
            <Field label="Vendedor">
              <FInput
                value={pedido.vendedor}
                onChange={(v) => setPedido((p) => ({ ...p, vendedor: v }))}
                placeholder="Vendedor"
              />
            </Field>
            <Field label="Ciudad">
              <FInput
                value={pedido.ciudad}
                onChange={(v) => setPedido((p) => ({ ...p, ciudad: v }))}
                placeholder="Ciudad"
              />
            </Field>
          </div>
          <Field label="Observación">
            <FInput
              value={pedido.observacion}
              onChange={(v) => setPedido((p) => ({ ...p, observacion: v }))}
              placeholder="Observación del pedido"
            />
          </Field>

          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: C.ink,
              margin: "16px 0 10px",
            }}
          >
            Referencias ({pedido.referencias.length})
            <button
              onClick={addRef}
              style={{
                marginLeft: 12,
                padding: "4px 10px",
                background: C.blueBg,
                border: `1px solid ${C.blue}`,
                borderRadius: 6,
                color: C.blue,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              + Agregar
            </button>
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {pedido.referencias.map((ref, idx) => (
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
                    display: "grid",
                    gridTemplateColumns: "1fr 2fr 1fr",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <Field label="Ref">
                    <FInput
                      value={ref.ref}
                      onChange={(v) => updateRef(idx, "ref", v)}
                      placeholder="C-103"
                    />
                  </Field>
                  <Field label="Descripción">
                    <FInput
                      value={ref.descripcion}
                      onChange={(v) => updateRef(idx, "descripcion", v)}
                      placeholder="PANTALONETA"
                    />
                  </Field>
                  <Field label="Precio Corte/Prenda $">
                    <FInput
                      type="number"
                      value={ref.precioCortePrenda}
                      onChange={(v) =>
                        updateRef(idx, "precioCortePrenda", parseFloat(v) || 0)
                      }
                      placeholder="800"
                    />
                  </Field>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5,1fr)",
                    gap: 6,
                  }}
                >
                  {TALLAS_BUSINT.slice(0, 5).map((t) => (
                    <div key={t}>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.slate,
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        {t}
                      </div>
                      <input
                        type="number"
                        value={ref.tallas[t] || 0}
                        onChange={(e) =>
                          updateRef(idx, `talla_${t}`, e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "5px",
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          fontSize: 12,
                          textAlign: "center",
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5,1fr)",
                    gap: 6,
                    marginTop: 6,
                  }}
                >
                  {TALLAS_BUSINT.slice(5).map((t) => (
                    <div key={t}>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.slate,
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        {t}
                      </div>
                      <input
                        type="number"
                        value={ref.tallas[t] || 0}
                        onChange={(e) =>
                          updateRef(idx, `talla_${t}`, e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "5px",
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          fontSize: 12,
                          textAlign: "center",
                        }}
                      />
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      paddingBottom: 2,
                    }}
                  >
                    <div style={{ textAlign: "center", width: "100%" }}>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.slate,
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        TOTAL
                      </div>
                      <div
                        style={{ fontWeight: 900, fontSize: 16, color: C.blue }}
                      >
                        {ref.total}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: C.redBg,
                borderRadius: 8,
                color: C.red,
                fontSize: 13,
                fontWeight: 600,
                marginTop: 12,
              }}
            >
              ⚠ {error}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "space-between",
              marginTop: 16,
            }}
          >
            <Btn variant="secondary" onClick={() => setPaso(1)}>
              ← Atrás
            </Btn>
            <Btn variant="success" onClick={save}>
              ✓ Guardar Pedido
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── PROGRAMAR CORTE MODAL ────────────────────────────────────────────────────
function ProgramarCorteModal({ pedido, plantas, cortadores, onSave, onClose }) {
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();
  const [form, setForm] = useState({
    fecha: today(),
    planta: "",
    cortador: "",
    tipoTela: "",
    metrosTendido: "",
    capas: "",
    horaInicio: "",
    horaFin: "",
  });
  const [cantidades, setCantidades] = useState(() => {
    const c = {};
    pedido.referencias.forEach((r) => {
      c[r.id] = { precio: r.precioCortePrenda || 0, tallas: {} };
      TALLAS_BUSINT.forEach((t) => {
        c[r.id].tallas[t] = 0;
      });
    });
    return c;
  });

  function pendiente(ref) {
    const yaCortado = (pedido.cortesRealizados || [])
      .flatMap((c) => c.refs || [])
      .filter((cr) => cr.refId === ref.id)
      .reduce((acc, cr) => {
        TALLAS_BUSINT.forEach((t) => {
          acc[t] = (acc[t] || 0) + (cr.tallas[t] || 0);
        });
        return acc;
      }, {});
    const pend = {};
    TALLAS_BUSINT.forEach((t) => {
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

  function minutosTotales() {
    if (!form.horaInicio || !form.horaFin) return 0;
    const [h1, m1] = form.horaInicio.split(":").map(Number);
    const [h2, m2] = form.horaFin.split(":").map(Number);
    return h2 * 60 + m2 - (h1 * 60 + m1);
  }

  function save() {
    if (!form.planta || !form.cortador || !form.fecha) return;
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

    const corte = {
      id: uid(),
      fecha: form.fecha,
      planta: form.planta,
      cortador: form.cortador,
      tipoTela: form.tipoTela,
      metrosTendido: parseFloat(form.metrosTendido) || 0,
      capas: parseInt(form.capas) || 0,
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      minutos: minutosTotales(),
      refs,
      ingresoCorte: ingresoTotal(),
      totalUnidades: totalCortando(),
      creadoEn: new Date().toISOString(),
    };
    onSave(corte);
    onClose();
  }

  return (
    <Modal
      title={`Programar Corte — Pedido ${pedido.numero}`}
      onClose={onClose}
      width={760}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
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
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Field label="Tipo de Tela">
          <FInput
            value={form.tipoTela}
            onChange={(v) => setForm((f) => ({ ...f, tipoTela: v }))}
            placeholder="Ej: Diamante"
          />
        </Field>
        <Field label="Metros Tendido">
          <FInput
            type="number"
            value={form.metrosTendido}
            onChange={(v) => setForm((f) => ({ ...f, metrosTendido: v }))}
            placeholder="45"
          />
        </Field>
        <Field label="Capas">
          <FInput
            type="number"
            value={form.capas}
            onChange={(v) => setForm((f) => ({ ...f, capas: v }))}
            placeholder="8"
          />
        </Field>
        <Field label="Hora Inicio">
          <FInput
            type="time"
            value={form.horaInicio}
            onChange={(v) => setForm((f) => ({ ...f, horaInicio: v }))}
          />
        </Field>
        <Field label="Hora Fin">
          <FInput
            type="time"
            value={form.horaFin}
            onChange={(v) => setForm((f) => ({ ...f, horaFin: v }))}
          />
        </Field>
      </div>

      {minutosTotales() > 0 && form.metrosTendido > 0 && (
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
          ⏱ {minutosTotales()} min ·{" "}
          {(minutosTotales() / parseFloat(form.metrosTendido || 1)).toFixed(1)}{" "}
          min/metro
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
                    <span style={{ color: C.slate }}>Precio/prenda: </span>
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
                {TALLAS_BUSINT.map((t) =>
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
                        max={pend[t]}
                        value={cantidades[ref.id]?.tallas[t] || 0}
                        onChange={(e) => {
                          const val = Math.min(
                            parseInt(e.target.value) || 0,
                            pend[t]
                          );
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
          disabled={totalCortando() === 0 || !form.planta || !form.cortador}
        >
          ✓ Registrar Corte
        </Btn>
      </div>
    </Modal>
  );
}

// ─── DETALLE PEDIDO ───────────────────────────────────────────────────────────
function DetallePedido({
  pedido,
  plantas,
  cortadores,
  nominaConfig,
  onBack,
  onSave,
}) {
  const [showCorte, setShowCorte] = useState(false);
  const mes = new Date().getMonth() + 1;
  const anio = new Date().getFullYear();
  const dh = diasHabiles(mes, anio);
  const nominaMensual = (nominaConfig?.trabajadores || []).reduce(
    (s, t) => s + (t.sueldo || 0),
    0
  );
  const costoDia = nominaMensual / dh;

  const totalPedido = pedido.referencias.reduce((s, r) => s + r.total, 0);
  const totalCortado = (pedido.cortesRealizados || []).reduce(
    (s, c) => s + (c.totalUnidades || 0),
    0
  );
  const pct =
    totalPedido > 0 ? Math.round((totalCortado / totalPedido) * 100) : 0;
  const sem = semaforo(pedido.fechaDespacho);

  function excedente(ref) {
    const cortado = (pedido.cortesRealizados || [])
      .flatMap((c) => c.refs || [])
      .filter((cr) => cr.refId === ref.id)
      .reduce((acc, cr) => {
        TALLAS_BUSINT.forEach((t) => {
          acc[t] = (acc[t] || 0) + (cr.tallas[t] || 0);
        });
        return acc;
      }, {});
    const exc = {};
    TALLAS_BUSINT.forEach((t) => {
      exc[t] = (ref.tallas[t] || 0) - (cortado[t] || 0);
    });
    return exc;
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
    if (totalC >= totalPedido) updated.estado = "cumplido";
    onSave(updated);
  }

  return (
    <div>
      {showCorte && (
        <ProgramarCorteModal
          pedido={pedido}
          plantas={plantas}
          cortadores={cortadores}
          onSave={registrarCorte}
          onClose={() => setShowCorte(false)}
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
        {pedido.estado !== "cumplido" && (
          <Btn variant="cyan" onClick={() => setShowCorte(true)}>
            ✂ Programar Corte
          </Btn>
        )}
        {pedido.estado !== "cumplido" && pct === 100 && (
          <Btn
            variant="success"
            onClick={() =>
              onSave({ ...pedido, estado: "cumplido", fechaCumplido: today() })
            }
          >
            ✓ Marcar Cumplido
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
                {TALLAS_BUSINT.map((t) => (
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
                    {t.split(" ")[0]}
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
                const exc = excedente(ref);
                const totalExc = Object.values(exc).reduce((a, b) => a + b, 0);
                const cortadoRef = ref.total - totalExc;
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
                    {TALLAS_BUSINT.map((t) => (
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
                  }}
                >
                  <span>🧵 {corte.tipoTela}</span>
                  {corte.metrosTendido > 0 && (
                    <span>📏 {corte.metrosTendido}m</span>
                  )}
                  {corte.capas > 0 && <span>📚 {corte.capas} capas</span>}
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
function AdminCorte({ config, onSave }) {
  const [tab, setTab] = useState("plantas");
  const [newPlanta, setNewPlanta] = useState("");
  const [newCortador, setNewCortador] = useState("");
  const [newTrabajador, setNewTrabajador] = useState({
    nombre: "",
    sueldo: "",
  });

  const plantas = config.plantas || [];
  const cortadores = config.cortadores || [];
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

  const tabs = [
    ["plantas", "🏭 Plantas"],
    ["cortadores", "✂ Cortadores"],
    ["nomina", "💰 Nómina"],
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
          {plantas.map((p) => (
            <div
              key={p.id}
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
          ))}
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
    </div>
  );
}

// ─── ESTADÍSTICAS TELA ────────────────────────────────────────────────────────
function EstadisticasTela({ pedidos }) {
  const allCortes = pedidos.flatMap((p) =>
    (p.cortesRealizados || []).filter(
      (c) => c.tipoTela && c.metrosTendido > 0 && c.minutos > 0
    )
  );
  const byTela = {};
  allCortes.forEach((c) => {
    if (!byTela[c.tipoTela])
      byTela[c.tipoTela] = { cortes: 0, metros: 0, minutos: 0, capas: 0 };
    byTela[c.tipoTela].cortes++;
    byTela[c.tipoTela].metros += c.metrosTendido || 0;
    byTela[c.tipoTela].minutos += c.minutos || 0;
    byTela[c.tipoTela].capas += c.capas || 0;
  });

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
        Estadísticas de Tela
      </h2>
      {!Object.keys(byTela).length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate }}>
          Sin datos de corte registrados aún. Los datos aparecerán cuando
          registres cortes con tipo de tela, metros y tiempos.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Object.entries(byTela)
            .sort((a, b) => b[1].metros - a[1].metros)
            .map(([tela, data]) => {
              const minPorMetro =
                data.metros > 0 ? (data.minutos / data.metros).toFixed(1) : "—";
              const capasPromedio =
                data.cortes > 0 ? (data.capas / data.cortes).toFixed(0) : "—";
              return (
                <div
                  key={tela}
                  style={{
                    background: C.white,
                    borderRadius: 14,
                    border: `1px solid ${C.border}`,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <div
                        style={{ fontWeight: 800, fontSize: 16, color: C.ink }}
                      >
                        🧵 {tela}
                      </div>
                      <div
                        style={{ fontSize: 12, color: C.slate, marginTop: 2 }}
                      >
                        {data.cortes} corte{data.cortes !== 1 ? "s" : ""}{" "}
                        registrado{data.cortes !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "8px 16px",
                        background: C.violetBg,
                        borderRadius: 20,
                        color: C.violet,
                        fontWeight: 900,
                        fontSize: 18,
                      }}
                    >
                      {minPorMetro} min/m
                    </div>
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
                        label: "Total Metros",
                        value: `${data.metros.toFixed(1)}m`,
                        color: C.blue,
                      },
                      {
                        label: "Total Minutos",
                        value: `${data.minutos} min`,
                        color: C.amber,
                      },
                      {
                        label: "Capas Promedio",
                        value: capasPromedio,
                        color: C.cyan,
                      },
                      {
                        label: "Min/Metro",
                        value: `${minPorMetro} min`,
                        color: C.violet,
                      },
                    ].map((k) => (
                      <div
                        key={k.label}
                        style={{
                          background: C.canvas,
                          borderRadius: 8,
                          padding: "10px 12px",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: C.slate,
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          {k.label}
                        </div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 900,
                            color: k.color,
                            marginTop: 4,
                          }}
                        >
                          {k.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      padding: "8px 14px",
                      background: C.amberBg,
                      borderRadius: 8,
                      fontSize: 12,
                      color: C.amber,
                      fontWeight: 600,
                    }}
                  >
                    💡 Sugerencia: Para {tela}, programar 1 metro ={" "}
                    {minPorMetro} minutos de corte
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD CORTE ──────────────────────────────────────────────────────────
function DashboardCorte({ pedidos, onSelectPedido, nominaConfig, onUpdatePedido, isAdmin }) {
  const activos = pedidos.filter((p) => p.estado === "activo");
  const [revisando, setRevisando] = useState(false);
  const [resultRevision, setResultRevision] = useState(null);
  // Igual que "Revisar contra Busint" en Pedidos (módulo Diseño): consulta
  // Busint en vivo (misma Cloud Function getPedidosExistentesBusint) para el
  // rango que cubre la fecha de pedido más antigua entre los activos, hasta
  // hoy. Cualquier pedido activo cuyo número ya no aparezca en Busint se
  // marca "cancelado_busint" — así no se queda pegado como activo para
  // siempre solo porque nadie revisó a mano.
  async function revisarContraBusint() {
    const conFecha = activos.filter((p) => p.fechaPedido);
    if (!conFecha.length) {
      setResultRevision({ error: "No hay pedidos activos con fecha de pedido para revisar." });
      return;
    }
    const fechaInicio = conFecha.reduce((min, p) => (p.fechaPedido < min ? p.fechaPedido : min), conFecha[0].fechaPedido);
    const fechaFin = today();
    setRevisando(true);
    setResultRevision(null);
    try {
      const llamar = httpsCallable(functionsClient, "getPedidosExistentesBusint");
      const resp = await llamar({ fechaInicio, fechaFin });
      const existentesSet = new Set((resp.data.numeros || []).map((n) => String(n).trim()));
      const desaparecidos = activos.filter((p) => p.numero && !existentesSet.has(String(p.numero).trim()));
      for (const p of desaparecidos) {
        await onUpdatePedido({ ...p, estado: "cancelado_busint", fechaCumplido: today() });
      }
      setResultRevision({ revisados: activos.length, marcados: desaparecidos.length });
    } catch (err) {
      setResultRevision({ error: err?.message || "No se pudo consultar Busint. Intenta de nuevo en unos minutos." });
    }
    setRevisando(false);
  }
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
        {isAdmin && onUpdatePedido && (
          <Btn variant="secondary" onClick={revisarContraBusint} disabled={revisando}>
            {revisando ? "Revisando..." : "🔄 Revisar contra Busint"}
          </Btn>
        )}
      </div>
      {resultRevision && (
        <div
          style={{
            padding: "10px 16px",
            background: resultRevision.error ? C.redBg : C.greenBg,
            borderRadius: 10,
            border: `1px solid ${resultRevision.error ? C.red : C.green}44`,
            color: resultRevision.error ? C.red : C.green,
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {resultRevision.error
            ? `⚠ ${resultRevision.error}`
            : `✓ Se revisaron ${resultRevision.revisados} pedidos activos contra Busint — ${resultRevision.marcados} ya no existían allá y se marcaron como cancelados.`}
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
              const totalP = p.referencias.reduce((s, r) => s + r.total, 0);
              const totalC = (p.cortesRealizados || []).reduce(
                (s, c) => s + (c.totalUnidades || 0),
                0
              );
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

// ─── HISTÓRICO ────────────────────────────────────────────────────────────────
function Historico({ pedidos, onSelectPedido }) {
  // "cancelado_busint" es un estado propio, distinto de "cumplido": lo pone
  // "Revisar contra Busint" en el Dashboard cuando un pedido activo ya no
  // aparece en Busint (se canceló o se cerró allá) — no significa que se
  // terminó de cortar, por eso se distingue con su propio ícono/etiqueta.
  const cumplidos = pedidos.filter((p) => p.estado === "cumplido" || p.estado === "cancelado_busint");
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
              const esCancelado = p.estado === "cancelado_busint";
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
                      background: esCancelado ? C.redBg : C.greenBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      flexShrink: 0,
                    }}
                  >
                    {esCancelado ? "🚫" : "✅"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: C.ink, display: "flex", alignItems: "center", gap: 8 }}>
                      Pedido #{p.numero} — {p.cliente}
                      {esCancelado && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.red, background: C.redBg, padding: "1px 8px", borderRadius: 10 }}>
                          Cancelado en Busint
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.slate }}>
                      {esCancelado ? "Ya no existe en Busint desde" : "Cumplido"}: {p.fechaCumplido || "—"} · {fmtNum(totalC)} uds
                      cortadas
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
export default function ModuloCorte({ currentUser, onLogout, onVolver }) {
  const [view, setView] = useState("dashboard");
  const [pedidos, setPedidos] = useState([]);
  const [selPedidoId, setSelPedidoId] = useState(null);
  const [showSubir, setShowSubir] = useState(false);
  const [corteConfig, setCorteConfig] = useState({
    plantas: [
      { id: "p1", nombre: "Planta Industrias Yanko" },
      { id: "p2", nombre: "Planta Indutex" },
    ],
    cortadores: [],
    nomina: { trabajadores: [] },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubs = [];
    async function init() {
      try {
        const unsubPedidos = onSnapshot(
          collection(db, "corte_pedidos"),
          (snap) => {
            setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
          }
        );
        unsubs.push(unsubPedidos);
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

  async function savePedido(pedido) {
    setPedidos((ps) =>
      ps.some((p) => p.id === pedido.id)
        ? ps.map((p) => (p.id === pedido.id ? pedido : p))
        : [...ps, pedido]
    );
    await fsSave("corte_pedidos", pedido.id, pedido);
  }

  async function saveConfig(cfg) {
    setCorteConfig(cfg);
    await fsSave("corte_config", "main", cfg);
  }

  const selPedido = pedidos.find((p) => p.id === selPedidoId);
  const isAdmin = currentUser?.isAdmin;

  const NAV = [
    { id: "dashboard", icon: "◉", label: "Dashboard" },
    { id: "historico", icon: "📁", label: "Histórico" },
    { id: "estadisticas", icon: "📊", label: "Telas" },
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

      {showSubir && (
        <SubirPedidoModal
          onSave={savePedido}
          onClose={() => setShowSubir(false)}
        />
      )}

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
        {view === "dashboard" && (
          <button
            onClick={() => setShowSubir(true)}
            style={{
              width: "100%",
              padding: "10px",
              background: C.cyan,
              border: "none",
              borderRadius: 10,
              color: C.white,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              marginTop: 12,
            }}
          >
            + Cargar Pedido
          </button>
        )}
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
            />
          )}
          {view === "detalle" && selPedido && (
            <DetallePedido
              pedido={selPedido}
              plantas={corteConfig.plantas || []}
              cortadores={corteConfig.cortadores || []}
              nominaConfig={corteConfig.nomina}
              onBack={() => {
                setView("dashboard");
                setSelPedidoId(null);
              }}
              onSave={savePedido}
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
          {view === "admin" && isAdmin && (
            <AdminCorte config={corteConfig} onSave={saveConfig} />
          )}
        </div>
      </div>
    </div>
  );
}
