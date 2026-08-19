import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
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
// ─── TOKENS (mismos de los demás módulos, para mantener el mismo look) ────────
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
function fmtMoney(n) {
  return "$ " + Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
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
// ─── UI ATOMS (mismas de los demás módulos) ───────────────────────────────────
function Btn({ children, onClick, variant = "primary", small, disabled }) {
  const S = {
    primary: { background: C.ink, color: C.white, border: "none" },
    secondary: { background: C.canvas, color: C.ink, border: `1px solid ${C.border}` },
    success: { background: C.green, color: C.white, border: "none" },
    danger: { background: C.red, color: C.white, border: "none" },
    ghost: { background: "transparent", color: C.blue, border: `1.5px solid ${C.blue}` },
    amber: { background: C.amber, color: C.white, border: "none" },
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
function FInput({ value, onChange, placeholder, type = "text", onEnter }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={
        onEnter
          ? (e) => {
              // Una pistola lectora de código de barras escribe los dígitos
              // como si fuera un teclado y termina mandando "Enter" — con
              // esto ese Enter agrega el código de una, sin tener que hacer
              // clic en "+ Agregar" cada vez.
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }
          : undefined
      }
      placeholder={placeholder}
      style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
    />
  );
}
// Desplegable simple (mismo look de FInput) — para catálogos fijos como
// Marca/Segmento/Talla (hoja "BASE DATOS LISTAS DESP" del Excel original).
function FSel({ value, onChange, options, placeholder = "Seleccionar..." }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
    >
      <option value="">{placeholder}</option>
      {(options || []).map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
// Catálogos fijos de la hoja "BASE DATOS LISTAS DESP" del Excel de despachos
// Venezuela — mismas listas desplegables que ya usaban ahí para Marca,
// Segmento y Talla.
const MARCAS_BODEGA = ["KML", "KAMILA", "MISSOFI"];
const SEGMENTOS_BODEGA = ["DAMA", "CAB", "NIÑA", "NIÑO"];
const TALLAS_BODEGA = ["S", "M", "L", "XL", "1XL", "2XL", "3XL", "UNICA", "4", "6", "8", "10", "12", "14", "16"];
// Curva estándar de GRUPOS de talla que siempre debe aparecer en la
// exportación (en este orden) — cada grupo junta varias tallas sueltas que
// en la práctica son la misma medida (ej. "S", "4", "UNICA" y "S/M" son la
// misma talla con distintos nombres). Al agregar un código de barra a mano
// en Montar Despacho, se elige uno de estos 7 grupos (no una talla suelta),
// para que el código caiga siempre en la columna/celda correcta al
// exportar a Excel.
const CURVA_TALLAS_ESTANDAR = [
  "S - 4 - U - S/M",
  "M - 6 - M/L - L/XL",
  "L - 8",
  "XL/10",
  "1XL - 12",
  "2XL - 14",
  "3XL - 16",
];
function normTalla(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toUpperCase();
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
  const map = {
    montado: { bg: C.amberBg, color: C.amber, label: "MONTADO" },
    aprobado: { bg: C.greenBg, color: C.green, label: "APROBADO" },
    historico: { bg: C.canvas, color: C.slate, label: "HISTÓRICO" },
  };
  const s = map[estado] || { bg: C.canvas, color: C.slate, label: estado || "—" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
function Tabla({ columnas, filas, vacio, onRowClick }) {
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
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(f) : undefined}
              style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}`, cursor: onRowClick ? "pointer" : "default" }}
            >
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
// Próximo número consecutivo de despacho.
// Venezuela (y por default cualquier otro destino): sigue la numeración real
// de Busint (el histórico importado llega hasta 546), nunca vuelve a
// empezar en 1.
// Dubo es distinto: el histórico se importó con el N° de Traslado de Busint
// como "numero" (3556, 3309, 3170...) porque ahí no existía todavía el
// concepto de "despacho" propio de ATLAS — un despacho de Dubo junta VARIOS
// traslados/facturas de Busint en un solo envío. Por eso, para Dubo, el
// consecutivo simplemente cuenta despachos (34 despachos existentes → el
// siguiente es 35), sin mezclarse con los números de traslado de Busint.
function siguienteNumeroDespacho(despachos, destino) {
  if (destino === "Dubo") {
    return despachos.length + 1;
  }
  const max = despachos.reduce((m, d) => Math.max(m, Number(d.numero) || 0), 546);
  return max + 1;
}
// Calcula el total de una línea igual que en los despachos de Busint:
// (precio - dcto) × cantidad. dcto es un valor por unidad, no un porcentaje.
function calcularTotalLinea(l) {
  const precio = Number(l.precio) || 0;
  const dcto = Number(l.dcto) || 0;
  const cantidad = Number(l.cantidad) || 0;
  return Math.max(0, precio - dcto) * cantidad;
}
function lineaVacia() {
  return {
    id: uid(), referencia: "", cantidad: "", numTraslado: "", numCorte: "", numBulto: "",
    descripcion: "", marca: "", segmento: "", precio: "", dcto: "0", barras: [],
    buscando: false, busintEncontrada: null,
  };
}
// ─── MONTAR DESPACHO (bodega) ──────────────────────────────────────────────
// Etapa 1 (Bodega): referencia, códigos de barra, cantidades y todo lo
// demás — SIN precio ni descuento. Esos dos campos los define Contabilidad
// en la etapa de revisión ("Por Aprobar"), no bodega.
function LineaDespachoCard({ linea, index, onChange, onRemove, onBuscarBusint }) {
  const [grupoNuevo, setGrupoNuevo] = useState("");
  const [codigoNuevo, setCodigoNuevo] = useState("");
  // Agrega (o reemplaza si ya existía) el código de barra de un grupo de
  // talla a mano. Se guarda con la MISMA forma que trae Busint (cbarraI),
  // para que la exportación a Excel lo encuentre igual sin importar si
  // llegó automático o lo escribiste tú.
  function agregarCodigo() {
    if (!grupoNuevo || !codigoNuevo.trim()) return;
    const barras = (linea.barras || []).filter((b) => normTalla(b.talla) !== normTalla(grupoNuevo));
    onChange({ ...linea, barras: [...barras, { talla: grupoNuevo, cbarraI: codigoNuevo.trim(), cbarraE: "", cbarraM: "" }] });
    setGrupoNuevo("");
    setCodigoNuevo("");
  }
  function quitarCodigo(talla) {
    onChange({ ...linea, barras: (linea.barras || []).filter((b) => b.talla !== talla) });
  }
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 12, color: C.slate }}>LÍNEA {index + 1}</div>
        <span onClick={onRemove} style={{ cursor: "pointer", fontSize: 12, color: C.red, fontWeight: 700 }}>Quitar ✕</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr auto 1fr 1fr", gap: 10, alignItems: "end" }}>
        <Field label="Referencia">
          <FInput
            value={linea.referencia}
            onChange={(v) => onChange({ ...linea, referencia: v, busintEncontrada: null })}
            placeholder="Ej. 98-872"
            onEnter={onBuscarBusint}
          />
        </Field>
        <div style={{ marginBottom: 14 }}>
          <Btn small variant="ghost" onClick={onBuscarBusint} disabled={!linea.referencia.trim() || linea.buscando}>
            {linea.buscando ? "Buscando..." : "🔍 Buscar en Busint"}
          </Btn>
        </div>
        <Field label="Cantidad">
          <FInput type="number" value={linea.cantidad} onChange={(v) => onChange({ ...linea, cantidad: v })} />
        </Field>
        <Field label="N° Corte">
          <FInput value={linea.numCorte} onChange={(v) => onChange({ ...linea, numCorte: v })} />
        </Field>
      </div>
      {linea.busintEncontrada === false && (
        <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginTop: -8, marginBottom: 10 }}>
          No se encontró esa referencia en Busint — completa los datos a mano.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
        <Field label="Descripción">
          <FInput value={linea.descripcion} onChange={(v) => onChange({ ...linea, descripcion: v })} />
        </Field>
        <Field label="Marca">
          <FSel value={linea.marca} onChange={(v) => onChange({ ...linea, marca: v })} options={MARCAS_BODEGA} />
        </Field>
        <Field label="Segmento">
          <FSel value={linea.segmento} onChange={(v) => onChange({ ...linea, segmento: v })} options={SEGMENTOS_BODEGA} />
        </Field>
        <Field label="N° Bulto">
          <FInput value={linea.numBulto} onChange={(v) => onChange({ ...linea, numBulto: v })} placeholder="1/3" />
        </Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Códigos de barra por grupo de talla</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <FSel value={grupoNuevo} onChange={setGrupoNuevo} options={CURVA_TALLAS_ESTANDAR} />
          <FInput value={codigoNuevo} onChange={setCodigoNuevo} placeholder="Código de barra (o escanea con la pistola)" onEnter={agregarCodigo} />
          <Btn small variant="secondary" onClick={agregarCodigo} disabled={!grupoNuevo || !codigoNuevo.trim()}>+ Agregar</Btn>
        </div>
        {linea.barras && linea.barras.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {linea.barras.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: C.blueBg, borderRadius: 6, fontSize: 11, color: C.blue }}>
                <strong>{b.talla || "—"}</strong> {b.cbarraI || b.cbarraE || b.cbarraM || "sin código"}
                <span onClick={() => quitarCodigo(b.talla)} style={{ cursor: "pointer", color: C.red, fontWeight: 800 }}>✕</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// Código de cliente de GRUPO DUBO SAS en Busint — confirmado contra la
// remisión real ("TRASLADO Nº 3170", "Codigo Cliente: 118") que se subió
// para armar este flujo. Se usa para filtrar "listarDocumentosBusintCliente"
// solo a los documentos de Dubo, sin traer los de todos los demás clientes.
const CODIGO_CLIENTE_DUBO = "118";
function fechaHaceNDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
// Dubo se factura en Busint día a día como "traslado externo" (una remisión
// chiquita por día) y solo cada tanto (mes o más) se junta un grupo de esas
// remisiones en un despacho físico real. Esta pantalla trae TODOS los
// documentos de Busint de Dubo en un rango de fechas, para elegir con
// casillas cuáles se van a combinar en el despacho de hoy — los que ya se
// usaron en un despacho anterior (por su N° de documento, guardado como
// numTraslado en cada línea) salen marcados y bloqueados para no duplicar.
function SelectorDocumentosBusintView({ despachosExistentes, onCargar, onClose }) {
  const [fechaInicio, setFechaInicio] = useState(fechaHaceNDias(45));
  const [fechaFin, setFechaFin] = useState(today());
  const [buscando, setBuscando] = useState(false);
  const [documentos, setDocumentos] = useState(null);
  const [error, setError] = useState("");
  const [seleccionados, setSeleccionados] = useState(new Set());

  const usados = useMemo(() => {
    const s = new Set();
    despachosExistentes.forEach((d) => (d.lineas || []).forEach((l) => { if (l.numTraslado) s.add(String(l.numTraslado).trim()); }));
    return s;
  }, [despachosExistentes]);

  async function buscar() {
    setBuscando(true);
    setError("");
    setDocumentos(null);
    setSeleccionados(new Set());
    try {
      const llamar = httpsCallable(functionsClient, "listarDocumentosBusintCliente");
      const resp = await llamar({ fechaInicio, fechaFin, codigoCliente: CODIGO_CLIENTE_DUBO });
      setDocumentos(resp.data.documentos || []);
    } catch (err) {
      setError(err?.message || "No se pudo consultar Busint.");
    } finally {
      setBuscando(false);
    }
  }
  function toggle(doc) {
    setSeleccionados((s) => {
      const n = new Set(s);
      if (n.has(doc)) n.delete(doc);
      else n.add(doc);
      return n;
    });
  }
  // Documentos que sí se pueden marcar (los "YA USADO" quedan afuera, igual
  // que al hacer clic uno por uno). "Seleccionar todo" alterna entre marcar
  // todos esos y dejar la lista vacía.
  const seleccionables = (documentos || []).filter((d) => !usados.has(String(d.doc).trim()));
  const todosSeleccionados = seleccionables.length > 0 && seleccionables.every((d) => seleccionados.has(d.doc));
  function toggleTodo() {
    setSeleccionados(todosSeleccionados ? new Set() : new Set(seleccionables.map((d) => d.doc)));
  }
  const elegidos = (documentos || []).filter((d) => seleccionados.has(d.doc));
  const totalUnidadesElegidas = elegidos.reduce((s, d) => s + d.totalUnidades, 0);

  return (
    <Modal title="Facturas / Traslados pendientes — Dubo" onClose={onClose} width={860}>
      <div style={{ display: "flex", gap: 10, alignItems: "end", marginBottom: 16, flexWrap: "wrap" }}>
        <Field label="Desde"><FInput type="date" value={fechaInicio} onChange={setFechaInicio} /></Field>
        <Field label="Hasta"><FInput type="date" value={fechaFin} onChange={setFechaFin} /></Field>
        <div style={{ marginBottom: 14 }}>
          <Btn onClick={buscar} disabled={buscando}>{buscando ? "Buscando..." : "🔍 Buscar en Busint"}</Btn>
        </div>
      </div>
      {error && <div style={{ padding: "8px 12px", background: C.redBg, color: C.red, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {error}</div>}
      {documentos && (
        documentos.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay documentos de Dubo en ese rango de fechas.</div>
        ) : (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: seleccionables.length ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: C.ink }}>
              <input type="checkbox" checked={todosSeleccionados} disabled={!seleccionables.length} onChange={toggleTodo} />
              Seleccionar todo ({seleccionables.length} disponible{seleccionables.length !== 1 ? "s" : ""})
            </label>
            <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
              {documentos.map((d) => {
                const yaUsado = usados.has(String(d.doc).trim());
                const marcado = seleccionados.has(d.doc);
                return (
                  <label
                    key={d.doc}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderBottom: `1px solid ${C.border}`,
                      cursor: yaUsado ? "not-allowed" : "pointer",
                      opacity: yaUsado ? 0.45 : 1,
                      background: marcado ? C.violetBg : "transparent",
                    }}
                  >
                    <input type="checkbox" checked={marcado} disabled={yaUsado} onChange={() => toggle(d.doc)} />
                    <div style={{ width: 70, fontWeight: 800, fontSize: 13, color: C.ink }}>{d.doc}</div>
                    <div style={{ width: 90, fontSize: 11, color: C.slate }}>{fmtFechaISO(d.fecha)}</div>
                    <div style={{ width: 100, fontSize: 11, color: C.slate }}>{d.tipo || "—"}</div>
                    <div style={{ flex: 1, fontSize: 12, color: C.slate }}>{d.totalLineas} líneas · {fmtNum(d.totalUnidades)} und.</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{fmtMoney(d.totalValor)}</div>
                    {yaUsado && <div style={{ fontSize: 10, color: C.red, fontWeight: 800, marginLeft: 8, whiteSpace: "nowrap" }}>YA USADO</div>}
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ fontSize: 12, color: C.slate }}>
                {seleccionados.size} documento{seleccionados.size !== 1 ? "s" : ""} seleccionado{seleccionados.size !== 1 ? "s" : ""} · {fmtNum(totalUnidadesElegidas)} unidades
              </div>
              <Btn onClick={() => onCargar(elegidos)} disabled={!elegidos.length}>
                Cargar {elegidos.length || ""} seleccionada{elegidos.length !== 1 ? "s" : ""}
              </Btn>
            </div>
          </>
        )
      )}
    </Modal>
  );
}
function MontarDespachoView({ despachos, currentUser, onGuardado, coleccionDespachos, destino }) {
  const [numControl, setNumControl] = useState("");
  const [fecha, setFecha] = useState(today());
  // Dubo casi siempre carga sus líneas desde Busint (botón "Cargar desde
  // Busint" más abajo), así que no tiene sentido arrancar con una tarjeta de
  // línea vacía a mano — solo estorba. El resto de destinos sí arranca con
  // una línea lista para escribir, como siempre.
  const [lineas, setLineas] = useState(() => (destino === "Dubo" ? [] : [lineaVacia()]));
  const [guardando, setGuardando] = useState(false);
  const numeroSiguiente = useMemo(() => siguienteNumeroDespacho(despachos, destino), [despachos, destino]);
  const totalUnidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  // Traer un Traslado completo de Busint (solo Dubo): en vez de digitar
  // referencia por referencia, se busca por el N° de Traslado impreso en la
  // remisión y se auto-llenan todas las líneas de un tirón.
  const [numTrasladoBuscar, setNumTrasladoBuscar] = useState("");
  const [fechaAproxBuscar, setFechaAproxBuscar] = useState("");
  const [buscandoTraslado, setBuscandoTraslado] = useState(false);
  const [avisoTraslado, setAvisoTraslado] = useState(null);
  const [mostrarBuscadorPuntual, setMostrarBuscadorPuntual] = useState(false);
  const [mostrarSelector, setMostrarSelector] = useState(false);

  function actualizarLinea(idx, nueva) {
    setLineas((ls) => ls.map((l, i) => (i === idx ? nueva : l)));
  }
  // Recibe los documentos que se marcaron en el listado (SelectorDocumentosBusintView)
  // y junta TODAS sus líneas en un solo despacho — así un envío que combina,
  // por ejemplo, 5 remisiones diarias de Dubo queda como un único despacho
  // en ATLAS, no cinco por separado.
  function cargarDocumentosSeleccionados(docs) {
    const todasLasLineas = docs.flatMap((doc) =>
      doc.lineas.map((l) => ({
        id: uid(),
        referencia: l.referencia,
        cantidad: String(l.cantidad),
        numTraslado: l.numTraslado || doc.doc,
        numCorte: "",
        numBulto: "",
        descripcion: l.descripcion || "",
        marca: "",
        segmento: "",
        precio: String(l.precio || ""),
        dcto: "0",
        barras: l.barras || [],
        buscando: false,
        busintEncontrada: true,
      }))
    );
    setLineas(todasLasLineas);
    setNumControl(docs.map((d) => d.doc).join(" + "));
    setAvisoTraslado({ tipo: "ok", msg: `Se cargaron ${todasLasLineas.length} líneas de ${docs.length} documento${docs.length !== 1 ? "s" : ""} (${docs.map((d) => d.doc).join(", ")}) — revísalas abajo antes de guardar.` });
    setMostrarSelector(false);
  }
  async function traerTrasladoDeBusint() {
    const num = numTrasladoBuscar.trim();
    if (!num) return;
    setBuscandoTraslado(true);
    setAvisoTraslado(null);
    try {
      const llamar = httpsCallable(functionsClient, "buscarTrasladoBusintPorNumero");
      const resp = await llamar({ numeroTraslado: num, fechaAprox: fechaAproxBuscar || undefined });
      const d = resp.data;
      if (!d.encontrado || !d.lineas.length) {
        setAvisoTraslado({ tipo: "error", msg: `No se encontró el Traslado ${num} en Busint. Si es viejo, escribe también la fecha aproximada para ampliar la búsqueda.` });
        return;
      }
      const nuevasLineas = d.lineas.map((l) => ({
        id: uid(),
        referencia: l.referencia,
        cantidad: String(l.cantidad),
        numTraslado: l.numTraslado || num,
        numCorte: "",
        numBulto: "",
        descripcion: l.descripcion || "",
        marca: "",
        segmento: "",
        precio: String(l.precio || ""),
        dcto: "0",
        barras: l.barras || [],
        buscando: false,
        busintEncontrada: true,
      }));
      setLineas(nuevasLineas);
      setNumControl(num);
      setAvisoTraslado({ tipo: "ok", msg: `Se trajeron ${d.totalLineas} líneas${d.tipo ? ` (${d.tipo})` : ""} del documento ${num}${d.fecha ? ` — ${fmtFechaISO(d.fecha)}` : ""} — revísalas abajo antes de guardar.` });
    } catch (err) {
      setAvisoTraslado({ tipo: "error", msg: err?.message || "No se pudo consultar Busint." });
    } finally {
      setBuscandoTraslado(false);
    }
  }
  async function buscarEnBusint(idx) {
    const ref = lineas[idx].referencia.trim();
    if (!ref) return;
    actualizarLinea(idx, { ...lineas[idx], buscando: true });
    try {
      const llamar = httpsCallable(functionsClient, "buscarReferenciaBusint");
      const resp = await llamar({ ref });
      const d = resp.data;
      setLineas((ls) =>
        ls.map((l, i) => {
          if (i !== idx) return l;
          if (!d.encontrada) return { ...l, buscando: false, busintEncontrada: false };
          return {
            ...l,
            buscando: false,
            busintEncontrada: true,
            descripcion: d.descripcion || l.descripcion,
            precio: d.precioPM || d.precioP || l.precio,
            barras: d.barras || [],
          };
        })
      );
    } catch (err) {
      setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, buscando: false, busintEncontrada: false } : l)));
    }
  }
  function agregarLinea() {
    setLineas((ls) => [...ls, lineaVacia()]);
  }
  function quitarLinea(idx) {
    setLineas((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));
  }
  const lineasValidas = lineas.filter((l) => l.referencia.trim() && Number(l.cantidad) > 0);
  const puedeGuardar = lineasValidas.length > 0 && !guardando;

  async function guardarDespacho() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      const id = uid();
      const lineasGuardar = lineasValidas.map((l) => ({
        referencia: l.referencia.trim(),
        cantidad: Number(l.cantidad) || 0,
        numTraslado: l.numTraslado.trim(),
        numCorte: l.numCorte.trim(),
        numBulto: l.numBulto.trim(),
        descripcion: l.descripcion.trim(),
        marca: l.marca.trim(),
        segmento: l.segmento.trim(),
        precio: Number(l.precio) || 0,
        dcto: Number(l.dcto) || 0,
        total: calcularTotalLinea(l),
        barras: l.barras || [],
      }));
      await fsSave(coleccionDespachos, id, {
        id,
        numero: numeroSiguiente,
        numControl: numControl.trim(),
        fecha,
        estado: "montado",
        lineas: lineasGuardar,
        totalDespacho: lineasGuardar.reduce((s, l) => s + l.total, 0),
        creadoPor: currentUser?.name || currentUser?.username || "",
        creadoEn: new Date().toISOString(),
      });
      setNumControl("");
      setFecha(today());
      setLineas([lineaVacia()]);
      onGuardado && onGuardado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div style={{ background: C.violetBg, borderRadius: 12, padding: "14px 18px", border: `1px solid ${C.violet}22` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase" }}>N° de Despacho</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.violet }}>{numeroSiguiente}</div>
          <div style={{ fontSize: 11, color: C.slate }}>Consecutivo automático</div>
        </div>
        <Field label="N Control">
          <FInput value={numControl} onChange={setNumControl} placeholder="Ej. VE2607294" />
        </Field>
        <Field label="Fecha">
          <FInput type="date" value={fecha} onChange={setFecha} />
        </Field>
      </div>
      {destino === "Dubo" && (
        <div style={{ background: C.violetBg, border: `1px solid ${C.violet}33`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.violet, marginBottom: 4 }}>📋 Cargar desde Busint</div>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 12 }}>
            Dubo se factura día a día en Busint — cuando decidas hacer el despacho, elige de la lista cuáles facturas/traslados se van a juntar en este envío. Las que ya usaste en un despacho anterior salen marcadas para que no las repitas.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={() => setMostrarSelector(true)}>📋 Ver facturas / traslados pendientes</Btn>
            <span onClick={() => setMostrarBuscadorPuntual((v) => !v)} style={{ fontSize: 12, color: C.violet, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
              {mostrarBuscadorPuntual ? "Ocultar búsqueda puntual" : "o busca un documento puntual por número"}
            </span>
          </div>
          {mostrarBuscadorPuntual && (
            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.violet}22` }}>
              <div style={{ flex: "0 0 180px" }}>
                <Field label="N° Traslado / Factura">
                  <FInput value={numTrasladoBuscar} onChange={setNumTrasladoBuscar} placeholder="Ej. 3170" onEnter={traerTrasladoDeBusint} />
                </Field>
              </div>
              <div style={{ flex: "0 0 170px" }}>
                <Field label="Fecha aprox. (opcional)">
                  <FInput type="date" value={fechaAproxBuscar} onChange={setFechaAproxBuscar} />
                </Field>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Btn variant="secondary" onClick={traerTrasladoDeBusint} disabled={!numTrasladoBuscar.trim() || buscandoTraslado}>
                  {buscandoTraslado ? "Buscando en Busint..." : "🔍 Traer todas las líneas"}
                </Btn>
              </div>
            </div>
          )}
          {avisoTraslado && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: avisoTraslado.tipo === "ok" ? C.greenBg : C.redBg, color: avisoTraslado.tipo === "ok" ? C.green : C.red }}>
              {avisoTraslado.tipo === "ok" ? "✓" : "⚠"} {avisoTraslado.msg}
            </div>
          )}
        </div>
      )}
      {mostrarSelector && (
        <SelectorDocumentosBusintView despachosExistentes={despachos} onCargar={cargarDocumentosSeleccionados} onClose={() => setMostrarSelector(false)} />
      )}
      {lineas.map((l, i) => (
        <LineaDespachoCard
          key={l.id}
          linea={l}
          index={i}
          onChange={(nueva) => actualizarLinea(i, nueva)}
          onRemove={() => quitarLinea(i)}
          onBuscarBusint={() => buscarEnBusint(i)}
        />
      ))}
      <div style={{ marginBottom: 20 }}>
        <Btn variant="secondary" onClick={agregarLinea}>+ Agregar línea</Btn>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.canvas, borderRadius: 12, padding: "16px 20px" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase" }}>Total de unidades</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.ink }}>{fmtNum(totalUnidades)}</div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>El precio y el descuento los define Contabilidad al revisar el despacho.</div>
        </div>
        <Btn onClick={guardarDespacho} disabled={!puedeGuardar}>{guardando ? "Guardando..." : "Montar Despacho"}</Btn>
      </div>
    </div>
  );
}
// Exporta UN despacho a Excel con el mismo formato visual de las hojas
// "DESPACHO N" del archivo original: bloque N CONTROL/FECHA/DESPACHO arriba
// (azul con texto blanco para las etiquetas, verde claro para los valores),
// tabla REF/CANTIDAD/N TRASLADO/N CORTE/N BULTO/DESCRIPCION/MARCA/SEGMENTO/
// PRECIO/DCTO/TOTAL DCTTO/TOTAL con encabezado azul, filas de datos en azul
// claro con bordes y formato de moneda, una columna de código de barra por
// cada talla, y la fila de totales al final. Usa "xlsx-js-style" (ya estaba
// en package.json) en vez de "xlsx" porque xlsx (SheetJS) gratis no soporta
// colores/rellenos de celda - xlsx-js-style es la misma API con estilos.
const BORDE_FINO = { style: "thin", color: { rgb: "B7B7B7" } };
const TODOS_LOS_BORDES = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
const ESTILO_HEADER = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1F4E78" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: TODOS_LOS_BORDES };
const ESTILO_VALOR = { font: { bold: true }, fill: { fgColor: { rgb: "E2EFDA" } }, alignment: { horizontal: "center", vertical: "center" }, border: TODOS_LOS_BORDES };
const ESTILO_DATO = { fill: { fgColor: { rgb: "D9E6F5" } }, border: TODOS_LOS_BORDES, alignment: { vertical: "center" } };
const ESTILO_TOTAL = { font: { bold: true }, border: TODOS_LOS_BORDES, alignment: { horizontal: "center" } };
const ESTILO_TOTAL_VACIA = { border: TODOS_LOS_BORDES };
const FORMATO_MONEDA = '"$" #,##0';
// Estilos extra para el Estado de Cuenta KAMILA GROUP: despachos en azul
// (igual que el resto de Bodega), abonos en verde (para distinguirlos de un
// vistazo), y el saldo final en rojo si KAMILA todavía debe o verde si está
// al día/a favor — mismo criterio de color que ya usa el dashboard normal.
const ESTILO_ABONO = { fill: { fgColor: { rgb: "D9EAD3" } }, border: TODOS_LOS_BORDES, alignment: { vertical: "center" } };
const ESTILO_SUBTOTAL = { font: { bold: true }, fill: { fgColor: { rgb: "FCE8B2" } }, border: TODOS_LOS_BORDES, alignment: { horizontal: "center" } };
const ESTILO_SALDO_ROJO = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "C0392B" } }, border: TODOS_LOS_BORDES, alignment: { horizontal: "center" } };
const ESTILO_SALDO_VERDE = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2E7D32" } }, border: TODOS_LOS_BORDES, alignment: { horizontal: "center" } };
// Molde fijo del Excel original de Busint: siempre 31 filas (se rellena
// con celdas vacías del mismo color/borde aunque el despacho tenga menos
// líneas). Si un despacho llegara a tener MÁS de 25 líneas, la hoja crece
// más allá de 31 filas automáticamente (para no perder datos), pero en el
// caso normal siempre sale exactamente 31 filas. Las columnas de talla NO
// se rellenan de más: solo se muestran las tallas reales que tenga el
// despacho (ni una columna vacía extra).
const CAPACIDAD_LINEAS = 25;
const COLS_BASE = 13; // columna espaciadora + 12 campos (REF..TOTAL)
const COL_HEADERS_BASE = ["REF", "CANTIDAD", "N° TRASLADO", "N° DE CORTE", "N° DE BULTO COMO VIENE MARCADOS", "DESCRIPCION", "MARCA", "SEGMENTO", "PRECIO", "DCTO", "TOTAL DCTTO", "TOTAL"];
const COLS_MONEDA = new Set([9, 10, 11, 12]);
// Molde reducido SOLO para el Excel de Dubo: a diferencia de Venezuela/
// Colombia, Dubo no usa marca, segmento, N° de Corte, N° de Bulto ni códigos
// de barra por talla (esos campos siguen existiendo en el formulario de
// Bodega por si acaso, pero no se piden en este despacho) — así que el
// Excel que se descarga sale con menos columnas y la descripción más ancha.
// Esto es solo para la exportación; el formulario en pantalla no cambia.
const COLS_BASE_DUBO = 9; // columna espaciadora + 8 campos (REF..TOTAL)
const COL_HEADERS_DUBO = ["REF", "CANTIDAD", "N° TRASLADO", "DESCRIPCION", "PRECIO", "DCTO", "TOTAL DCTTO", "TOTAL"];

function celda(v, style, numFmt) {
  if (v === null || v === undefined || v === "") {
    const c = { t: "s", v: "" };
    if (style) c.s = style;
    return c;
  }
  if (typeof v === "number" && !Number.isNaN(v)) {
    const c = { t: "n", v };
    if (style) c.s = style;
    if (numFmt) c.z = numFmt;
    return c;
  }
  const c = { t: "s", v: String(v) };
  if (style) c.s = style;
  return c;
}

// (CURVA_TALLAS_ESTANDAR y normTalla ahora están definidos arriba, junto a
// TALLAS_BODEGA, para poder usarlos también en Montar Despacho.)
async function exportarDespachoExcel(despacho, esDubo) {
  const XLSX = await import("xlsx-js-style");
  const lineas = despacho.lineas || [];
  // Dubo no lleva columnas de código de barra por talla en su Excel.
  const tallas = esDubo ? [] : [...CURVA_TALLAS_ESTANDAR];
  if (!esDubo) {
    lineas.forEach((l) => (l.barras || []).forEach((b) => {
      if (!b.talla) return;
      const yaExiste = tallas.some((t) => normTalla(t) === normTalla(b.talla));
      if (!yaExiste) tallas.push(b.talla);
    }));
  }
  const colsBase = esDubo ? COLS_BASE_DUBO : COLS_BASE;
  const colHeaders = esDubo ? COL_HEADERS_DUBO : COL_HEADERS_BASE;
  const nColsTallas = tallas.length;
  const nColsTotal = colsBase + nColsTallas;
  const nFilasDatos = Math.max(CAPACIDAD_LINEAS, lineas.length);
  const nColsBase = colHeaders.length;

  const grid = [];
  // fila 0: espaciadora
  grid.push([]);
  // fila 1: bloque N CONTROL / FECHA / DESPACHO
  const filaBloque = [];
  filaBloque[1] = celda("N CONTROL", ESTILO_HEADER);
  filaBloque[2] = celda(despacho.numControl || "", ESTILO_VALOR);
  filaBloque[3] = celda("FECHA", ESTILO_HEADER);
  filaBloque[4] = celda(despacho.fecha ? fmtFechaISO(despacho.fecha) : "", ESTILO_VALOR);
  filaBloque[6] = celda("DESPACHO", ESTILO_HEADER);
  filaBloque[7] = celda(despacho.numero, ESTILO_VALOR);
  grid.push(filaBloque);
  // fila 2: espaciadora
  grid.push([]);
  // fila 3: encabezado de tabla (banda azul completa, incluye cupos de talla vacíos)
  const filaHeader = [];
  for (let c = 1; c <= nColsTotal - 1; c++) {
    const label = c <= nColsBase ? colHeaders[c - 1] : (tallas[c - colsBase] || "");
    filaHeader[c] = celda(label, ESTILO_HEADER);
  }
  grid.push(filaHeader);
  // filas de datos: siempre CAPACIDAD_LINEAS filas (o más si el despacho tiene más líneas)
  for (let idx = 0; idx < nFilasDatos; idx++) {
    const l = lineas[idx];
    const fila = [];
    if (l) {
      const totalDcto = (Number(l.precio) || 0) - (Number(l.dcto) || 0);
      if (esDubo) {
        fila[1] = celda(l.referencia || "", ESTILO_DATO);
        fila[2] = celda(Number(l.cantidad) || 0, ESTILO_DATO);
        fila[3] = celda(l.numTraslado || "", ESTILO_DATO);
        fila[4] = celda(l.descripcion || "", ESTILO_DATO);
        fila[5] = celda(Number(l.precio) || 0, ESTILO_DATO, FORMATO_MONEDA);
        fila[6] = celda(Number(l.dcto) || 0, ESTILO_DATO, FORMATO_MONEDA);
        fila[7] = celda(totalDcto, ESTILO_DATO, FORMATO_MONEDA);
        fila[8] = celda(Number(l.total) || 0, ESTILO_DATO, FORMATO_MONEDA);
      } else {
        fila[1] = celda(l.referencia || "", ESTILO_DATO);
        fila[2] = celda(Number(l.cantidad) || 0, ESTILO_DATO);
        fila[3] = celda(l.numTraslado || "", ESTILO_DATO);
        fila[4] = celda(l.numCorte || "", ESTILO_DATO);
        fila[5] = celda(l.numBulto || "", ESTILO_DATO);
        fila[6] = celda(l.descripcion || "", ESTILO_DATO);
        fila[7] = celda(l.marca || "", ESTILO_DATO);
        fila[8] = celda(l.segmento || "", ESTILO_DATO);
        fila[9] = celda(Number(l.precio) || 0, ESTILO_DATO, FORMATO_MONEDA);
        fila[10] = celda(Number(l.dcto) || 0, ESTILO_DATO, FORMATO_MONEDA);
        fila[11] = celda(totalDcto, ESTILO_DATO, FORMATO_MONEDA);
        fila[12] = celda(Number(l.total) || 0, ESTILO_DATO, FORMATO_MONEDA);
        for (let t = 0; t < nColsTallas; t++) {
          const nombreTalla = tallas[t];
          const b = nombreTalla ? (l.barras || []).find((x) => normTalla(x.talla) === normTalla(nombreTalla)) : null;
          fila[colsBase + t] = celda(b ? (b.cbarraI || b.cbarraE || b.cbarraM || "") : "", ESTILO_DATO);
        }
      }
    } else {
      for (let c = 1; c <= nColsTotal - 1; c++) fila[c] = celda("", ESTILO_DATO);
    }
    grid.push(fila);
  }
  // fila espaciadora antes de totales
  grid.push([]);
  // fila de totales
  const totalUnd = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const totalGeneral = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const filaTotales = [];
  for (let c = 1; c <= nColsTotal - 1; c++) filaTotales[c] = celda("", ESTILO_TOTAL_VACIA);
  filaTotales[1] = celda("TOTAL UND", ESTILO_TOTAL);
  filaTotales[2] = celda(totalUnd, ESTILO_TOTAL);
  if (esDubo) {
    filaTotales[7] = celda("TOTAL", ESTILO_TOTAL);
    filaTotales[8] = celda(totalGeneral, ESTILO_TOTAL, FORMATO_MONEDA);
  } else {
    const nBultos = new Set(lineas.map((l) => l.numBulto)).size;
    filaTotales[4] = celda("TOTAL BTS", ESTILO_TOTAL);
    filaTotales[5] = celda(nBultos, ESTILO_TOTAL);
    filaTotales[11] = celda("TOTAL", ESTILO_TOTAL);
    filaTotales[12] = celda(totalGeneral, ESTILO_TOTAL, FORMATO_MONEDA);
  }
  grid.push(filaTotales);

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws["!cols"] = esDubo
    ? [{ wch: 3 }, { wch: 10 }, { wch: 9 }, { wch: 12 }, { wch: 40 }, { wch: 11 }, { wch: 9 }, { wch: 13 }, { wch: 13 }]
    : [{ wch: 3 }, { wch: 10 }, { wch: 9 }, { wch: 12 }, { wch: 11 }, { wch: 20 }, { wch: 28 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 13 }, { wch: 13 }, ...Array.from({ length: nColsTallas }, () => ({ wch: 16 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `DESPACHO ${despacho.numero}`.slice(0, 31));
  XLSX.writeFile(wb, `DESPACHO ${despacho.numero}.xlsx`);
}

// Exporta la lista completa (o filtrada) del Historial a un solo Excel
// resumen, una fila por despacho. Pensado para Contabilidad y para el
// usuario de solo lectura (rol Cliente) que necesita bajar el historial
// para revisarlo fuera de ATLAS. Reusa los mismos estilos que el export
// individual para que se vea consistente.
async function exportarHistorialExcel(lista) {
  const XLSX = await import("xlsx-js-style");
  const headers = ["N° DESPACHO", "ESTADO", "FECHA", "LÍNEAS", "TOTAL", "MONTADO POR"];
  const grid = [];
  grid.push(headers.map((h) => celda(h, ESTILO_HEADER)));
  let totalGeneral = 0;
  lista.forEach((d) => {
    const total = d.totalDespacho || 0;
    totalGeneral += total;
    grid.push([
      celda(d.numero, ESTILO_DATO),
      celda(String(d.estado || "").toUpperCase(), ESTILO_DATO),
      celda(fmtFechaISO(d.fecha), ESTILO_DATO),
      celda((d.lineas || []).length, ESTILO_DATO),
      celda(total, ESTILO_DATO, FORMATO_MONEDA),
      celda(d.creadoPor || "", ESTILO_DATO),
    ]);
  });
  const filaTotal = new Array(headers.length).fill(null).map(() => celda("", ESTILO_TOTAL_VACIA));
  filaTotal[3] = celda("TOTAL", ESTILO_TOTAL);
  filaTotal[4] = celda(totalGeneral, ESTILO_TOTAL, FORMATO_MONEDA);
  grid.push(filaTotal);

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 9 }, { wch: 14 }, { wch: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historial Despachos");
  const hoy = today();
  XLSX.writeFile(wb, `Historial Despachos ${hoy}.xlsx`);
}
// ─── DETALLE DE UN DESPACHO (solo lectura: Historial) ──────────────────────
// ─── CÓDIGO DE EDICIÓN (PIN) ────────────────────────────────────────────────
// Un solo código, configurado por Administración, que Contabilidad debe
// escribir para poder editar un despacho ya montado o aprobado. Bodega no lo
// necesita (solo puede editar lo suyo) y Administración tampoco (siempre
// puede editar). Es una fricción a propósito, no una seguridad fuerte — el
// código vive en Firestore igual que el resto de la configuración del
// módulo.
function PinModal({ pinReal, onCorrecto, onClose }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  function verificar() {
    if (pin.trim() && pin.trim() === (pinReal || "")) {
      onCorrecto();
    } else {
      setError(true);
    }
  }
  return (
    <Modal title="Código de edición" onClose={onClose} width={360}>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 14 }}>
        Este despacho ya fue montado o aprobado. Escribe el código de edición para poder modificarlo.
      </div>
      <Field label="Código">
        <FInput
          type="password"
          value={pin}
          onChange={(v) => {
            setPin(v);
            setError(false);
          }}
          onEnter={verificar}
          placeholder="••••"
        />
      </Field>
      {error && <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginBottom: 10 }}>Código incorrecto.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={verificar} disabled={!pin.trim()}>Desbloquear</Btn>
      </div>
    </Modal>
  );
}
// ─── EDITAR DESPACHO (corregir uno que ya existe) ──────────────────────────
// A diferencia de Montar Despacho (crea uno nuevo) y de Revisar y Aprobar
// (el paso normal de Contabilidad antes de la primera aprobación), este
// modal reabre y corrige un despacho que ya existe, sin importar su estado.
// Reutiliza LineaDespachoCard para los campos de Bodega (referencia,
// cantidad, traslado, corte, bulto, descripción, marca, segmento, códigos de
// barra); si quien edita también puede ver precio/descuento (Contabilidad o
// Administración), se le agrega esa fila debajo de cada línea.
function EditarDespachoModal({ despacho, currentUser, puedeEditarPrecio, onClose, onGuardado, coleccionDespachos }) {
  const [numControl, setNumControl] = useState(despacho.numControl || "");
  const [fecha, setFecha] = useState(despacho.fecha || today());
  const [lineas, setLineas] = useState(() =>
    (despacho.lineas || []).map((l) => ({
      ...l,
      id: l.id || uid(),
      cantidad: String(l.cantidad ?? ""),
      precio: String(l.precio ?? ""),
      dcto: String(l.dcto ?? "0"),
      buscando: false,
      busintEncontrada: null,
    }))
  );
  const [guardando, setGuardando] = useState(false);

  function actualizarLinea(idx, nueva) {
    setLineas((ls) => ls.map((l, i) => (i === idx ? nueva : l)));
  }
  async function buscarEnBusint(idx) {
    const ref = lineas[idx].referencia.trim();
    if (!ref) return;
    actualizarLinea(idx, { ...lineas[idx], buscando: true });
    try {
      const llamar = httpsCallable(functionsClient, "buscarReferenciaBusint");
      const resp = await llamar({ ref });
      const d = resp.data;
      setLineas((ls) =>
        ls.map((l, i) => {
          if (i !== idx) return l;
          if (!d.encontrada) return { ...l, buscando: false, busintEncontrada: false };
          return { ...l, buscando: false, busintEncontrada: true, descripcion: d.descripcion || l.descripcion, barras: d.barras || l.barras };
        })
      );
    } catch (err) {
      setLineas((ls) => ls.map((l, i) => (i === idx ? { ...l, buscando: false, busintEncontrada: false } : l)));
    }
  }
  function agregarLinea() {
    setLineas((ls) => [...ls, lineaVacia()]);
  }
  function quitarLinea(idx) {
    setLineas((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));
  }
  const lineasValidas = lineas.filter((l) => l.referencia.trim() && Number(l.cantidad) > 0);
  const puedeGuardar = lineasValidas.length > 0 && !guardando;

  async function guardarCambios() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      const lineasGuardar = lineasValidas.map((l) => ({
        referencia: l.referencia.trim(),
        cantidad: Number(l.cantidad) || 0,
        numTraslado: (l.numTraslado || "").trim(),
        numCorte: (l.numCorte || "").trim(),
        numBulto: (l.numBulto || "").trim(),
        descripcion: (l.descripcion || "").trim(),
        marca: (l.marca || "").trim(),
        segmento: (l.segmento || "").trim(),
        precio: Number(l.precio) || 0,
        dcto: Number(l.dcto) || 0,
        total: calcularTotalLinea(l),
        barras: l.barras || [],
      }));
      await fsSave(coleccionDespachos, despacho.id, {
        numControl: numControl.trim(),
        fecha,
        lineas: lineasGuardar,
        totalDespacho: lineasGuardar.reduce((s, l) => s + l.total, 0),
        editadoPor: currentUser?.name || currentUser?.username || "",
        editadoEn: new Date().toISOString(),
      });
      onGuardado && onGuardado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title={`Editar Despacho #${despacho.numero}`} onClose={onClose} width={980}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Field label="N Control">
          <FInput value={numControl} onChange={setNumControl} />
        </Field>
        <Field label="Fecha">
          <FInput type="date" value={fecha} onChange={setFecha} />
        </Field>
      </div>
      {lineas.map((l, i) => (
        <div key={l.id}>
          <LineaDespachoCard linea={l} index={i} onChange={(nueva) => actualizarLinea(i, nueva)} onRemove={() => quitarLinea(i)} onBuscarBusint={() => buscarEnBusint(i)} />
          {puedeEditarPrecio && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, background: C.canvas, borderRadius: 10, padding: "10px 14px", marginTop: -6, marginBottom: 12 }}>
              <Field label="Precio">
                <FInput type="number" value={l.precio} onChange={(v) => actualizarLinea(i, { ...l, precio: v })} />
              </Field>
              <Field label="Dcto (por unidad)">
                <FInput type="number" value={l.dcto} onChange={(v) => actualizarLinea(i, { ...l, dcto: v })} />
              </Field>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Total línea</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{fmtMoney(calcularTotalLinea(l))}</div>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ marginBottom: 20 }}>
        <Btn variant="secondary" onClick={agregarLinea}>+ Agregar línea</Btn>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardarCambios} disabled={!puedeGuardar}>{guardando ? "Guardando..." : "💾 Guardar cambios"}</Btn>
      </div>
    </Modal>
  );
}
// ─── CONFIGURACIÓN: CÓDIGO DE EDICIÓN (Administración) ─────────────────────
function CodigoEdicionView({ pinActual, onGuardar }) {
  const [pin, setPin] = useState(pinActual || "");
  const [guardado, setGuardado] = useState(false);
  useEffect(() => {
    setPin(pinActual || "");
  }, [pinActual]);
  async function guardar() {
    await onGuardar(pin.trim());
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 520 }}>
        Este código lo debe escribir Contabilidad para poder editar un despacho ya montado o aprobado. Bodega solo puede
        editar los despachos que ella misma montó, y Administración siempre puede editar sin código.
      </div>
      <div style={{ maxWidth: 320 }}>
        <Field label="Código de edición">
          <FInput value={pin} onChange={setPin} placeholder="Ej. 4821" />
        </Field>
      </div>
      <Btn onClick={guardar} disabled={!pin.trim()}>💾 Guardar código</Btn>
      {guardado && <div style={{ fontSize: 12, color: C.green, fontWeight: 700, marginTop: 10 }}>Código guardado.</div>}
    </div>
  );
}
function DetalleDespachoModal({ despacho, onClose, onGuardado, currentUser, isAdmin, esContabilidad, esBodegaSolo, pinEdicion, onEliminar, coleccionDespachos }) {
  const [editando, setEditando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const esPropio = !!despacho.creadoPor && despacho.creadoPor === (currentUser?.name || currentUser?.username);
  const puedeEditarDirecto = isAdmin || (esBodegaSolo && esPropio);
  const puedeEditarConPin = esContabilidad && !isAdmin;
  const puedeEditarPrecio = isAdmin || esContabilidad;
  function onClickEditar() {
    if (puedeEditarDirecto) {
      setEditando(true);
      return;
    }
    if (puedeEditarConPin) setPidiendoPin(true);
  }
  // Borrar el despacho por completo — solo Administración. Es irreversible
  // (a diferencia de editar), así que pide confirmación explícita.
  function onClickEliminar() {
    if (!window.confirm(`¿Borrar por completo el Despacho #${despacho.numero}? Esto no se puede deshacer.`)) return;
    onEliminar && onEliminar(despacho.id);
    onClose();
  }
  return (
    <Modal title={`Despacho #${despacho.numero}`} onClose={onClose} width={860}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18, fontSize: 12 }}>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>N Control</div><div>{despacho.numControl || "—"}</div></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Fecha</div><div>{fmtFechaISO(despacho.fecha)}</div></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Estado</div><EstadoBadge estado={despacho.estado} /></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Total</div><div style={{ fontWeight: 800 }}>{fmtMoney(despacho.totalDespacho)}</div></div>
      </div>
      <div style={{ marginBottom: 14, display: "flex", gap: 10 }}>
        <Btn variant="secondary" small onClick={() => exportarDespachoExcel(despacho, coleccionDespachos === "despachosDubo")}>⬇ Exportar a Excel</Btn>
        {(puedeEditarDirecto || puedeEditarConPin) && (
          <Btn variant="secondary" small onClick={onClickEditar}>{puedeEditarConPin ? "🔒 Editar (código)" : "✎ Editar"}</Btn>
        )}
        {isAdmin && (
          <Btn variant="danger" small onClick={onClickEliminar}>🗑 Eliminar despacho</Btn>
        )}
      </div>
      <Tabla
        vacio="Sin líneas."
        columnas={[
          { key: "referencia", label: "Ref" },
          { key: "descripcion", label: "Descripción" },
          { key: "marca", label: "Marca" },
          { key: "segmento", label: "Segmento" },
          { key: "cantidad", label: "Cant.", align: "right", render: (f) => fmtNum(f.cantidad) },
          { key: "precio", label: "Precio", align: "right", render: (f) => fmtMoney(f.precio) },
          { key: "dcto", label: "Dcto", align: "right", render: (f) => fmtMoney(f.dcto) },
          { key: "total", label: "Total", align: "right", render: (f) => fmtMoney(f.total) },
          { key: "numBulto", label: "Bulto" },
          {
            key: "barras", label: "Códigos de barra",
            render: (f) => (f.barras && f.barras.length ? f.barras.map((b) => `${b.talla}: ${b.cbarraI || b.cbarraE || b.cbarraM}`).join(" · ") : "—"),
          },
        ]}
        filas={despacho.lineas || []}
      />
      <div style={{ fontSize: 11, color: C.slate, marginTop: 14 }}>
        Montado por {despacho.creadoPor || "—"} · {fmtFechaHora(despacho.creadoEn)}
        {despacho.estado === "aprobado" && <> · Revisado y aprobado por {despacho.aprobadoPor || "—"} · {fmtFechaHora(despacho.aprobadoEn)}</>}
        {despacho.editadoPor && <> · Última edición: {despacho.editadoPor} · {fmtFechaHora(despacho.editadoEn)}</>}
      </div>
      {pidiendoPin && (
        <PinModal
          pinReal={pinEdicion}
          onClose={() => setPidiendoPin(false)}
          onCorrecto={() => {
            setPidiendoPin(false);
            setEditando(true);
          }}
        />
      )}
      {editando && (
        <EditarDespachoModal
          despacho={despacho}
          currentUser={currentUser}
          puedeEditarPrecio={puedeEditarPrecio}
          coleccionDespachos={coleccionDespachos}
          onClose={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false);
            onGuardado && onGuardado();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
// ─── REVISAR Y APROBAR (Contabilidad) ──────────────────────────────────────
// Bodega monta el despacho con referencia, cantidades y códigos de
// barra pero sin precio ni descuento. Acá Contabilidad revisa (y puede
// corregir) las cantidades, pone el precio y aplica el descuento de cada
// línea, y desde aquí mismo aprueba el despacho.
function LineaRevisionRow({ linea, onChange }) {
  const total = calcularTotalLinea(linea);
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      <td style={{ padding: "8px 6px", fontSize: 12, fontWeight: 700 }}>{linea.referencia}</td>
      <td style={{ padding: "8px 6px", fontSize: 12 }}>{linea.descripcion}</td>
      <td style={{ padding: "8px 6px", fontSize: 12, color: C.slate }}>{linea.marca}{linea.marca && linea.segmento ? " · " : ""}{linea.segmento}</td>
      <td style={{ padding: "8px 6px", width: 90 }}>
        <FInput type="number" value={linea.cantidad} onChange={(v) => onChange({ ...linea, cantidad: v })} />
      </td>
      <td style={{ padding: "8px 6px", width: 100 }}>
        <FInput value={linea.numTraslado} onChange={(v) => onChange({ ...linea, numTraslado: v })} />
      </td>
      <td style={{ padding: "8px 6px", width: 100 }}>
        <FInput type="number" value={linea.precio} onChange={(v) => onChange({ ...linea, precio: v })} />
      </td>
      <td style={{ padding: "8px 6px", width: 110 }}>
        <FInput type="number" value={linea.dcto} onChange={(v) => onChange({ ...linea, dcto: v })} />
      </td>
      <td style={{ padding: "8px 6px", fontSize: 12, fontWeight: 800, textAlign: "right" }}>{fmtMoney(total)}</td>
    </tr>
  );
}
function RevisarYAprobarModal({ despacho, currentUser, onClose, onGuardado, coleccionDespachos, destino }) {
  const [lineas, setLineas] = useState(() =>
    (despacho.lineas || []).map((l) => ({ ...l, cantidad: String(l.cantidad ?? ""), precio: String(l.precio ?? ""), dcto: String(l.dcto ?? "0") }))
  );
  const [guardando, setGuardando] = useState(false);
  const [numTrasladoGlobal, setNumTrasladoGlobal] = useState("");
  const totalDespacho = lineas.reduce((s, l) => s + calcularTotalLinea(l), 0);

  function actualizarLinea(idx, nueva) {
    setLineas((ls) => ls.map((l, i) => (i === idx ? nueva : l)));
  }
  // El traslado de Busint viene con UN solo N° de Traslado para TODA la
  // remisión (a veces 100+ líneas) — escribirlo línea por línea sería
  // absurdo, así que esto lo pone en todas de una sola vez.
  function aplicarTrasladoATodas() {
    if (!numTrasladoGlobal.trim()) return;
    setLineas((ls) => ls.map((l) => ({ ...l, numTraslado: numTrasladoGlobal.trim() })));
  }
  // Dubo solo recibe prendas de bodega de segundas: SIEMPRE van con 50% de
  // descuento sobre el precio de catálogo (Busint), sin excepción. En vez de
  // que Contabilidad calcule y escriba el 50% de cada línea a mano (puede
  // haber cientos), este botón lo aplica de una vez a partir del precio ya
  // cargado en cada línea.
  function aplicar50PorcientoATodas() {
    setLineas((ls) => ls.map((l) => ({ ...l, dcto: String((Number(l.precio) || 0) / 2) })));
  }
  function lineasParaGuardar() {
    return lineas.map((l) => {
      const total = calcularTotalLinea(l);
      return { ...l, cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0, dcto: Number(l.dcto) || 0, total };
    });
  }
  async function guardarCambios() {
    setGuardando(true);
    try {
      const lineasGuardar = lineasParaGuardar();
      await fsSave(coleccionDespachos, despacho.id, {
        lineas: lineasGuardar,
        totalDespacho: lineasGuardar.reduce((s, l) => s + l.total, 0),
        revisadoPor: currentUser?.name || currentUser?.username || "",
        revisadoEn: new Date().toISOString(),
      });
      onGuardado && onGuardado();
    } finally {
      setGuardando(false);
    }
  }
  async function aprobar() {
    setGuardando(true);
    try {
      const lineasGuardar = lineasParaGuardar();
      await fsSave(coleccionDespachos, despacho.id, {
        lineas: lineasGuardar,
        totalDespacho: lineasGuardar.reduce((s, l) => s + l.total, 0),
        estado: "aprobado",
        aprobadoPor: currentUser?.name || currentUser?.username || "",
        aprobadoEn: new Date().toISOString(),
      });
      onGuardado && onGuardado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title={`Revisar Despacho #${despacho.numero}`} onClose={onClose} width={980}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16, fontSize: 12 }}>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>N Control</div><div>{despacho.numControl || "—"}</div></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Fecha</div><div>{fmtFechaISO(despacho.fecha)}</div></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Montado por</div><div>{despacho.creadoPor || "—"}</div></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Total (con tus cambios)</div><div style={{ fontWeight: 800 }}>{fmtMoney(totalDespacho)}</div></div>
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 12 }}>
        Bodega montó la referencia, cantidades y códigos de barra. Revisa las cantidades (corrígelas si hace falta), pon el N° de Traslado, el precio y el descuento por unidad de cada línea.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "end", marginBottom: 16, flexWrap: "wrap", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
        <div style={{ flex: "0 0 220px" }}>
          <Field label="N° Traslado (todo el despacho)">
            <FInput value={numTrasladoGlobal} onChange={setNumTrasladoGlobal} placeholder="Ej. 3170" onEnter={aplicarTrasladoATodas} />
          </Field>
        </div>
        <Btn small variant="secondary" onClick={aplicarTrasladoATodas} disabled={!numTrasladoGlobal.trim()}>
          Aplicar a todas las líneas
        </Btn>
        {destino === "Dubo" && (
          <>
            <div style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
            <Btn small variant="amber" onClick={aplicar50PorcientoATodas}>
              🏷 Aplicar 50% descuento (segundas Dubo)
            </Btn>
            <div style={{ fontSize: 11, color: C.slate, maxWidth: 220 }}>Pone el descuento en la mitad del precio de cada línea — Dubo solo recibe segundas.</div>
          </>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {["Ref", "Descripción", "Marca / Segmento", "Cantidad", "N° Traslado", "Precio", "Dcto (por unidad)", "Total"].map((h) => (
                <th key={h} style={{ padding: "8px 6px", fontSize: 10, fontWeight: 800, color: C.slate, textTransform: "uppercase", textAlign: h === "Total" ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <LineaRevisionRow key={l.id || i} linea={l} onChange={(nueva) => actualizarLinea(i, nueva)} />
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={guardarCambios} disabled={guardando}>{guardando ? "Guardando..." : "💾 Guardar cambios"}</Btn>
        <Btn variant="success" onClick={aprobar} disabled={guardando}>{guardando ? "Guardando..." : "✓ Aprobar Despacho"}</Btn>
      </div>
    </Modal>
  );
}
// ─── POR APROBAR (Contabilidad revisa cantidades, pone precio/dcto y aprueba) ─
function PorAprobarView({ despachos, currentUser, puedeAprobar, coleccionDespachos, destino }) {
  const [abierto, setAbierto] = useState(null);
  const pendientes = despachos.filter((d) => d.estado === "montado").sort((a, b) => parseFloat(a.numero) - parseFloat(b.numero));
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 14 }}>
        Estos despachos ya fueron montados por Bodega (referencia, cantidades y códigos de barra). Ábrelos para revisar cantidades, poner N° de Traslado, precio y descuento, y aprobar.
      </div>
      <Tabla
        vacio="No hay despachos pendientes por aprobar."
        onRowClick={(f) => setAbierto(f)}
        columnas={[
          { key: "numero", label: "N° Despacho", align: "right" },
          { key: "numControl", label: "N Control" },
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
          { key: "lineas", label: "Líneas", align: "right", render: (f) => fmtNum((f.lineas || []).length) },
          { key: "totalDespacho", label: "Total", align: "right", render: (f) => fmtMoney(f.totalDespacho) },
          { key: "creadoPor", label: "Montado por" },
        ]}
        filas={pendientes}
      />
      {abierto && puedeAprobar && (
        <RevisarYAprobarModal despacho={abierto} currentUser={currentUser} coleccionDespachos={coleccionDespachos} destino={destino} onClose={() => setAbierto(null)} onGuardado={() => setAbierto(null)} />
      )}
    </div>
  );
}
// ─── HISTORIAL (aprobados + importados) ────────────────────────────────────
// Para Administración y Contabilidad sigue mostrando solo lo aprobado/
// histórico (lo "montado" y aún sin aprobar vive en Por Aprobar). Para un
// usuario de Bodega sin esos dos permisos, se le muestran TODOS sus propios
// despachos sin importar el estado — antes no tenían dónde verlos ni
// corregirlos mientras seguían pendientes de aprobación.
function HistorialView({ despachos, currentUser, isAdmin, esContabilidad, esBodegaSolo, pinEdicion, onEliminar, coleccionDespachos }) {
  const [abierto, setAbierto] = useState(null);
  const [filtro, setFiltro] = useState("");
  const base = esBodegaSolo
    ? despachos.filter((d) => d.creadoPor === (currentUser?.name || currentUser?.username))
    : despachos.filter((d) => d.estado === "aprobado" || d.estado === "historico");
  // Ordenado por fecha (el más nuevo primero) y no por "numero": en Dubo,
  // parte del histórico importado quedó con el N° de Traslado de Busint como
  // "numero" (3556, 3309...) y otra parte con una fecha como "numero" — al
  // mezclarse, ordenar por numero salía en un orden sin sentido. La fecha sí
  // es confiable en todos los despachos, de cualquier destino.
  const visibles = base
    .filter((d) => !filtro.trim() || String(d.numero).includes(filtro.trim()) || (d.lineas || []).some((l) => (l.referencia || "").toUpperCase().includes(filtro.trim().toUpperCase())))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || parseFloat(b.numero) - parseFloat(a.numero));
  const totalGeneral = visibles.reduce((s, d) => s + (d.totalDespacho || 0), 0);
  // "¿Cuándo fue la última vez que se despachó la referencia X?" — busca
  // coincidencia EXACTA de esa referencia (no solo "contiene", como el
  // filtro de la tabla de abajo) en TODOS los despachos aprobados/
  // históricos, sin importar quién los montó — es una pregunta sobre la
  // referencia, no sobre el usuario que está buscando. Se queda con la
  // fecha más reciente.
  const refBuscada = filtro.trim().toUpperCase();
  let ultimoUsoRef = null;
  if (refBuscada) {
    const coincidencias = [];
    despachos.filter((d) => d.estado === "aprobado" || d.estado === "historico").forEach((d) => {
      (d.lineas || []).forEach((l) => {
        if ((l.referencia || "").trim().toUpperCase() === refBuscada) {
          coincidencias.push({ fecha: d.fecha, numero: d.numero, cantidad: l.cantidad, creadoPor: d.creadoPor });
        }
      });
    });
    coincidencias.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    ultimoUsoRef = coincidencias[0] || null;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ flex: 1, maxWidth: 320 }}>
          <FInput value={filtro} onChange={setFiltro} placeholder="Buscar por N° despacho o referencia..." />
        </div>
        <div style={{ fontSize: 12, color: C.slate }}>{visibles.length} despachos · {fmtMoney(totalGeneral)}</div>
        <Btn variant="secondary" onClick={() => exportarHistorialExcel(visibles)}>⬇ Exportar a Excel</Btn>
      </div>
      {refBuscada && (
        ultimoUsoRef ? (
          <div style={{ padding: "10px 14px", background: C.blueBg, borderRadius: 8, marginBottom: 16, fontSize: 13, color: C.blue, fontWeight: 700 }}>
            🕐 "{filtro.trim()}" se despachó por última vez el {fmtFechaISO(ultimoUsoRef.fecha)} — Despacho N° {ultimoUsoRef.numero} · Cantidad: {fmtNum(ultimoUsoRef.cantidad)} · Montado por: {ultimoUsoRef.creadoPor || "—"}
          </div>
        ) : (
          <div style={{ padding: "10px 14px", background: C.amberBg, borderRadius: 8, marginBottom: 16, fontSize: 13, color: C.amber, fontWeight: 700 }}>
            ⚠ "{filtro.trim()}" no tiene ningún despacho aprobado registrado con ese código exacto.
          </div>
        )
      )}
      <Tabla
        vacio={esBodegaSolo ? "Aún no has montado ningún despacho." : "Sin despachos en el historial."}
        onRowClick={(f) => setAbierto(f)}
        columnas={[
          { key: "numero", label: "N° Despacho", align: "right" },
          { key: "estado", label: "Estado", render: (f) => <EstadoBadge estado={f.estado} /> },
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
          { key: "lineas", label: "Líneas", align: "right", render: (f) => fmtNum((f.lineas || []).length) },
          { key: "totalDespacho", label: "Total", align: "right", render: (f) => fmtMoney(f.totalDespacho) },
        ]}
        filas={visibles}
      />
      {abierto && (
        <DetalleDespachoModal
          despacho={abierto}
          onClose={() => setAbierto(null)}
          onGuardado={() => setAbierto(null)}
          currentUser={currentUser}
          isAdmin={isAdmin}
          esContabilidad={esContabilidad}
          esBodegaSolo={esBodegaSolo}
          pinEdicion={pinEdicion}
          onEliminar={onEliminar}
          coleccionDespachos={coleccionDespachos}
        />
      )}
    </div>
  );
}
// ─── ABONOS (ledger simple) ─────────────────────────────────────────────────
function AbonosView({ abonos, currentUser, puedeEditar, coleccionAbonos }) {
  const [fecha, setFecha] = useState(today());
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ordenados = [...abonos].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const totalAbonado = abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);

  async function agregarAbono() {
    if (!fecha || !Number(monto)) return;
    setGuardando(true);
    try {
      const id = uid();
      await fsSave(coleccionAbonos, id, {
        id, fecha, monto: Number(monto), concepto: concepto.trim(),
        origen: "manual",
        creadoPor: currentUser?.name || currentUser?.username || "",
        creadoEn: new Date().toISOString(),
      });
      setFecha(today());
      setMonto("");
      setConcepto("");
    } finally {
      setGuardando(false);
    }
  }
  async function borrarAbono(a) {
    await fsDelete(coleccionAbonos, a.id);
  }

  return (
    <div>
      {puedeEditar ? (
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: C.slate, marginBottom: 10 }}>NUEVO ABONO</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
            <Field label="Fecha"><FInput type="date" value={fecha} onChange={setFecha} /></Field>
            <Field label="Monto"><FInput type="number" value={monto} onChange={setMonto} /></Field>
            <Field label="Concepto"><FInput value={concepto} onChange={setConcepto} placeholder="Quién paga / referencia" /></Field>
            <div style={{ marginBottom: 14 }}>
              <Btn onClick={agregarAbono} disabled={guardando || !fecha || !Number(monto)}>{guardando ? "Guardando..." : "+ Agregar"}</Btn>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 20 }}>Solo Administración o Contabilidad pueden agregar o borrar abonos — aquí puedes ver el registro.</div>
      )}
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: C.ink }}>Total abonado: {fmtMoney(totalAbonado)}</div>
      <Tabla
        vacio="Sin abonos registrados."
        columnas={[
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
          { key: "monto", label: "Monto", align: "right", render: (f) => fmtMoney(f.monto) },
          { key: "concepto", label: "Concepto" },
          { key: "origen", label: "Origen", render: (f) => (f.origen === "importado" ? `Importado (${f.fuenteHoja || ""})` : "Manual") },
          {
            key: "acciones", label: "", align: "right",
            render: (f) => (puedeEditar && f.origen === "manual" ? <span onClick={() => borrarAbono(f)} style={{ cursor: "pointer", color: C.red, fontWeight: 700, fontSize: 11 }}>Borrar</span> : null),
          },
        ]}
        filas={ordenados}
      />
    </div>
  );
}
// ─── SALDO YULIANA (cuenta aparte, no se mezcla con Abonos de despachos) ───
// A diferencia de "Abonos" (pagos contra el total de despachos, alimenta el
// Saldo del Dashboard de Bodega), esto es una cuenta corriente propia:
// depósitos que aumentan el saldo, y anticipos/traslados/pagos que lo
// reducen — como en la hoja de Excel (TOTAL DEPOSITOS YULIANA, ANTICIPO
// TRASLADO A VENE..., PAGO UNIFORMES, SALDO YULIANA). Se guarda en su propia
// colección para no distorsionar el cálculo de Abonos/Saldo de despachos.
function SaldoYulianaView({ entradas, currentUser, puedeEditar, coleccionSaldoYuliana }) {
  const [fecha, setFecha] = useState(today());
  const [tipo, setTipo] = useState("deposito");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ordenados = [...entradas].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const totalDepositos = entradas.filter((e) => e.tipo === "deposito").reduce((s, e) => s + (Number(e.monto) || 0), 0);
  const totalSalidas = entradas.filter((e) => e.tipo === "salida").reduce((s, e) => s + (Number(e.monto) || 0), 0);
  const saldo = totalDepositos - totalSalidas;

  async function agregarEntrada() {
    if (!fecha || !Number(monto)) return;
    setGuardando(true);
    try {
      const id = uid();
      await fsSave(coleccionSaldoYuliana, id, {
        id, fecha, tipo, monto: Math.abs(Number(monto)), concepto: concepto.trim(),
        creadoPor: currentUser?.name || currentUser?.username || "",
        creadoEn: new Date().toISOString(),
      });
      setFecha(today());
      setMonto("");
      setConcepto("");
    } finally {
      setGuardando(false);
    }
  }
  async function borrarEntrada(e) {
    await fsDelete(coleccionSaldoYuliana, e.id);
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <KPI icon="💵" label="Total Depósitos" value={fmtMoney(totalDepositos)} color={C.green} bg={C.greenBg} />
        <KPI icon="📤" label="Anticipos / Salidas" value={fmtMoney(totalSalidas)} color={C.red} bg={C.redBg} />
        <KPI icon="⚖️" label="Saldo Yuliana" value={fmtMoney(saldo)} color={C.violet} bg={C.violetBg} />
      </div>
      {puedeEditar ? (
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: C.slate, marginBottom: 10 }}>NUEVO MOVIMIENTO</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
            <Field label="Fecha"><FInput type="date" value={fecha} onChange={setFecha} /></Field>
            <Field label="Tipo">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.ink, fontFamily: "inherit", outline: "none" }}
              >
                <option value="deposito">Depósito (suma)</option>
                <option value="salida">Anticipo / Traslado / Pago (resta)</option>
              </select>
            </Field>
            <Field label="Monto"><FInput type="number" value={monto} onChange={setMonto} /></Field>
            <Field label="Concepto"><FInput value={concepto} onChange={setConcepto} placeholder="Ej: Anticipo traslado a Vene 05/12/2025" /></Field>
            <div style={{ marginBottom: 14 }}>
              <Btn onClick={agregarEntrada} disabled={guardando || !fecha || !Number(monto)}>{guardando ? "Guardando..." : "+ Agregar"}</Btn>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 20 }}>Solo Administración o Contabilidad pueden agregar o borrar movimientos — aquí puedes ver el registro.</div>
      )}
      <Tabla
        vacio="Sin movimientos registrados."
        columnas={[
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
          { key: "tipo", label: "Tipo", render: (f) => (f.tipo === "deposito" ? <span style={{ color: C.green, fontWeight: 700 }}>Depósito</span> : <span style={{ color: C.red, fontWeight: 700 }}>Salida</span>) },
          { key: "concepto", label: "Concepto" },
          { key: "monto", label: "Monto", align: "right", render: (f) => <span style={{ color: f.tipo === "deposito" ? C.green : C.red, fontWeight: 700 }}>{f.tipo === "deposito" ? "+" : "−"}{fmtMoney(f.monto)}</span> },
          {
            key: "acciones", label: "", align: "right",
            render: (f) => (puedeEditar ? <span onClick={() => borrarEntrada(f)} style={{ cursor: "pointer", color: C.red, fontWeight: 700, fontSize: 11 }}>Borrar</span> : null),
          },
        ]}
        filas={ordenados}
      />
    </div>
  );
}
// ─── IMPORTADOR DEL HISTÓRICO (DESPACHOS KAMILA VENEZUELA.xlsx) ────────────
// Lógica validada a mano contra el archivo real: 546 hojas "DESPACHO N" con
// formato distinto según la época (2022-2026), pero casi todas tienen una
// tabla con encabezado REF/REFERENCIA + una fila de subtotal al final (sin
// referencia, con la suma de cantidad/total) que NO es una línea real — hay
// que descartarla o el total queda duplicado. Contra la hoja "TOTAL
// DESPACHOS VENEZUELA" (el resumen oficial, columna DESPACHADO confiable),
// esta lógica cuadra 542 de 546 despachos exactos; los que no cuadran quedan
// marcados en "avisos" para revisar a mano en vez de fallar en silencio.
function normCell(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().toUpperCase();
}
function numCell(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/,/g, "").replace(/\$/g, "").trim());
  return isNaN(n) ? null : n;
}
const HEADER_MAP_DESPACHO = {
  REF: "referencia", REFERENCIA: "referencia",
  CANTIDAD: "cantidad", "CANTIDAD CORTADO": "cantidadCortado",
  PRECIO: "precio", TOTAL: "total", "TOTAL DCTTO": "totalConDcto",
  DCTO: "descuento", DESCRIPCION: "descripcion", MARCA: "marca", SEGMENTO: "segmento",
  "N° DE BULTO": "bulto", "N° DE BULTO COMO VIENE MARCADOS": "bulto", "N BULTO": "bulto",
  "N° DE CORTE": "numCorte", "N CORTE": "numCorte",
  "N° TRASLADO": "numTraslado", "N TRASLADO": "numTraslado", CURVA: "curva",
  "N CONTROL": "numControl", "A QUIEN SE LE COBRO": "cobradoA", FECHA: "fecha",
};
const STOP_KEYWORDS_DESPACHO = new Set(["ABONO", "SALDO", "TOTAL UND", "TOTAL BTS"]);
const HOJAS_NO_DESPACHO = new Set([
  "BASE DATOS LISTAS DESP", "ABONO PANELES", "DEPOSITOS CUENTA YULIANA  M-J", "DUBO",
  "DEPOSITOS JULIO", "DEPOSITOS AGOSTO", "DEPOSITO SEP", "DEPOSITO OCT", "DEPOSITO NOV",
  "DICIEMBRE", "ENERO", "TOTAL DESPACHOS VENEZUELA", "DEMO (2)", "DEMO (4)",
]);
const HOJAS_ABONOS = [
  "ABONO PANELES", "DEPOSITOS CUENTA YULIANA  M-J", "DUBO",
  "DEPOSITOS JULIO", "DEPOSITOS AGOSTO", "DEPOSITO SEP", "DEPOSITO OCT", "DEPOSITO NOV",
  "DICIEMBRE", "ENERO",
];

function parseHojaDespacho(rows) {
  let fecha = null;
  let numControlHeader = null;
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const label = normCell(row[c]);
      if (label.startsWith("FECHA") && row[c + 1] instanceof Date) fecha = row[c + 1];
      if (label === "N CONTROL" && row[c + 1] !== null && row[c + 1] !== undefined && row[c + 1] !== "") {
        numControlHeader = row[c + 1];
      }
    }
  }
  const headerStarts = [];
  rows.forEach((row, r) => {
    (row || []).forEach((v, c) => {
      const nv = normCell(v);
      if (nv === "REF" || nv === "REFERENCIA") headerStarts.push([r, c]);
    });
  });
  // Campos que de verdad distinguen una línea de producto real (cantidad,
  // precio o total) — algunas hojas (formato "FECHA/VALOR/CONCEPTO" de pagos,
  // ver DESPACHO 100) tienen un bloque de abonos justo debajo de la tabla,
  // sin fila en blanco ni palabra "ABONO" de por medio, y como la columna REF
  // queda alineada con la columna de fecha de esos pagos, sin este chequeo
  // esas filas se colaban como líneas falsas del despacho.
  const CAMPOS_NUMERICOS = new Set(["cantidad", "precio", "total", "totalConDcto"]);
  function filaEsLineaValida(row, colIdxs, colmap) {
    const numericos = colIdxs.filter((c) => CAMPOS_NUMERICOS.has(colmap[c]));
    if (numericos.length) return numericos.some((c) => numCell(row[c]) !== null);
    return colIdxs.some((c) => row[c] !== null && row[c] !== undefined && row[c] !== "");
  }
  const crudas = [];
  let finTabla = 0;
  headerStarts.forEach(([hr, hc]) => {
    const headerRow = rows[hr] || [];
    const nextSameRow = headerStarts.filter(([r, c]) => r === hr && c > hc).map(([, c]) => c);
    // OJO: antes este límite era "hc + 14", que alcanza para las 12
    // columnas fijas (REF..TOTAL) pero se queda corto en cuanto una
    // referencia tiene la curva completa de tallas (S-4-U-S/M, M-6-M/L-L/XL,
    // L-8, XL/10, 1XL-12, 2XL-14, 3XL-16 = 7 columnas más) — con 14 el corte
    // caía justo después de las primeras 2 columnas de talla, y las columnas
    // de la derecha (L-8 en adelante) se perdían en el importador aunque SÍ
    // tuvieran código de barra en el Excel original. Con 40 alcanza de sobra
    // para cualquier curva realista, sin afectar el corte real que sigue
    // dando "headerRow.length" o el próximo bloque REF en la misma fila.
    const windowEnd = nextSameRow.length ? Math.min(...nextSameRow) : Math.min(hc + 40, headerRow.length);
    const colmap = {};
    for (let c = hc; c < windowEnd; c++) {
      const nv = normCell(headerRow[c]);
      if (HEADER_MAP_DESPACHO[nv]) colmap[c] = HEADER_MAP_DESPACHO[nv];
    }
    colmap[hc] = "referencia";
    const colIdxs = Object.keys(colmap).map(Number);
    // Algunas hojas viejas (ej. DESPACHO 2, DESPACHO 320) tienen, en la MISMA
    // fila, una segunda columna suelta "REFERENCIA"/"CANTIDAD"/"N° DE BULTO"
    // a la izquierda de la tabla real — un listado de empaque por bulto que
    // repite las mismas cantidades con el código truncado (ej. "326" en vez
    // de "98-326"). Sin este filtro, ese bloque se cuela como líneas
    // duplicadas/erróneas del despacho. Una tabla real siempre trae al menos
    // una de estas columnas; un bloque que solo tiene referencia+cantidad+
    // bulto (sin ninguna) se descarta entero.
    const COLUMNAS_TABLA_REAL = new Set(["descripcion", "precio", "total", "totalConDcto", "marca", "curva", "numControl"]);
    if (!colIdxs.some((c) => COLUMNAS_TABLA_REAL.has(colmap[c]))) return;
    // Columnas de código de barra por talla: quedan siempre a la derecha de
    // TOTAL, con el nombre de la talla como encabezado (ej. "S - 4 - U -
    // S/M") — no están en HEADER_MAP_DESPACHO porque el texto cambia según
    // qué tallas tenga cada referencia, así que se toma cualquier columna con
    // encabezado no reconocido que quede después de la columna TOTAL.
    const totalColIdx = Math.max(-1, ...colIdxs.filter((c) => colmap[c] === "total"));
    const colBarras = [];
    if (totalColIdx >= 0) {
      for (let c = totalColIdx + 1; c < windowEnd; c++) {
        const label = String(headerRow[c] ?? "").trim();
        if (label) colBarras.push([c, label]);
      }
    }
    let blanks = 0;
    let r = hr + 1;
    // finTabla marca desde dónde parseAbonosDentroDeDespacho empieza a buscar
    // abonos. Antes se usaba la posición final de este while (r), pero esa
    // posición incluye hasta 2 filas "no válidas" que el while consume antes
    // de parar — y si la primera fila de abonos quedaba pegada justo ahí
    // (sin 2 filas en blanco de por medio, ej. DESPACHO 12/130), se perdía
    // por completo. Ahora se rastrea la última fila que de verdad tiene
    // referencia (ultimaValidaEstricta) y finTabla arranca justo después de
    // esa, así los abonos pegados quedan dentro del rango de búsqueda.
    let ultimaValidaEstricta = hr;
    while (r < rows.length && blanks < 2) {
      const row = rows[r] || [];
      if (row.some((v) => STOP_KEYWORDS_DESPACHO.has(normCell(v)))) break;
      if (!filaEsLineaValida(row, colIdxs, colmap)) { blanks++; r++; continue; }
      blanks = 0;
      // Una línea de producto real siempre trae algo en la columna REF. Los
      // bloques de abonos pegados justo debajo de la tabla (ej. DESPACHO
      // 22/86/100) a veces "pasan" el chequeo numérico de arriba porque su
      // monto cae en la misma columna que CANTIDAD/PRECIO/TOTAL, pero nunca
      // traen referencia — por eso no cuentan para ultimaValidaEstricta.
      const refFila = row[hc];
      if (refFila !== null && refFila !== undefined && String(refFila).trim() !== "") {
        ultimaValidaEstricta = r;
      }
      const item = {};
      colIdxs.forEach((c) => { item[colmap[c]] = row[c] ?? null; });
      if (colBarras.length) {
        item.barrasCrudas = colBarras
          .map(([c, talla]) => ({ talla, valor: row[c] != null ? String(row[c]).trim() : "" }))
          .filter((b) => b.valor);
      }
      crudas.push(item);
      r++;
    }
    finTabla = Math.max(finTabla, ultimaValidaEstricta + 1);
  });
  // Descarta dos tipos de fila que NO son una línea real:
  // (a) el subtotal/footer de la tabla — sin referencia, con un total que
  //     coincide con la suma acumulada de las líneas anteriores;
  // (b) una fila "resumen" suelta que a veces queda debajo del footer — sin
  //     referencia y sin total explícito (solo cantidad/precio residual de
  //     alguna celda vecina) — si se dejara, el total de respaldo
  //     cantidad×precio la contaría como una línea de más e infla el total
  //     (visto en DESPACHO 25/26: fila suelta con cantidad total y el último
  //     precio de la tabla, sin referencia ni total).
  // (c) filas de relleno con ceros que quedan debajo de la tabla real en las
  //     hojas más nuevas (ej. DESPACHO 458, 505-542): sin referencia y con
  //     cantidad/precio/total en 0 (no vacíos — por eso el chequeo de "tot
  //     === null" de arriba no las agarra) — sobrantes de la plantilla de
  //     Excel, no una línea real.
  const lineas = [];
  let running = 0;
  crudas.forEach((it) => {
    const ref = normCell(it.referencia);
    const tot = numCell(it.total);
    if (!ref && tot !== null && running > 0 && Math.abs(tot - running) < Math.max(1000, running * 0.01)) return;
    if (!ref && tot === null) return;
    if (!ref && tot === 0) return;
    lineas.push(it);
    running += tot || 0;
  });
  return { fecha, numControlHeader, lineas, finTabla };
}
// Abonos que aparecen DENTRO de cada hoja DESPACHO N (no en las 10 hojas de
// depósitos aparte — esas por ahora se dejan sin importar). Busca, desde
// donde terminó la tabla de líneas hasta el final de la hoja: (a) una fecha
// real seguida de un valor y, si la hay, una tercera celda de texto como
// concepto (formato "FECHA | VALOR | CONCEPTO", visto en varias hojas); o
// (b) la etiqueta "ABONO" seguida de un valor, sin fecha (formato de las
// hojas más antiguas).
// Detecta fechas que quedaron guardadas como TEXTO en vez de fecha real de
// Excel — normalmente por un typo al digitar (ej. "18/062021" en vez de
// "18/06/2021", visto en DESPACHO 22, fila con $30.000.000 que antes se
// perdia por completo porque `v instanceof Date` daba falso). Cubre el
// formato normal DD/MM/AAAA guardado como texto (por si se repite en otra
// hoja) y el formato roto DD/MESAAAA sin la segunda barra.
const RE_FECHA_TEXTO = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const RE_FECHA_TEXTO_ROTA = /^\d{1,2}\/\d{5,6}$/;
function pareceFechaTexto(v) {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return RE_FECHA_TEXTO.test(s) || RE_FECHA_TEXTO_ROTA.test(s);
}
function completarAnio(yRaw) {
  if (yRaw.length === 4) return yRaw;
  if (yRaw.length === 3) return "2" + yRaw;
  if (yRaw.length === 2) return "20" + yRaw;
  return yRaw;
}
// Convierte un texto tipo fecha (normal o roto, ver pareceFechaTexto) a un
// objeto Date real. IMPORTANTE: el resto del importador siempre espera un
// Date de verdad (hace `new Date(fecha).toISOString()` mas abajo) - dejar la
// fecha como texto plano hacia que esa conversion lanzara "Invalid time
// value" sin capturar en ningun lado, cortando el analisis completo en
// silencio (sin mostrar error ni resultado). Por eso se parsea aqui mismo,
// nunca se deja un string suelto en el campo fecha.
function parsearFechaTexto(v) {
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, yRaw] = m;
    const y = completarAnio(yRaw);
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }
  m = s.match(/^(\d{1,2})\/(\d{5,6})$/);
  if (m) {
    const [, d, resto] = m;
    const mo = resto.slice(0, 2);
    const yRaw = resto.slice(2);
    const y = completarAnio(yRaw);
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}
function parseAbonosDentroDeDespacho(rows, desdeFila) {
  const abonos = [];
  for (let r = desdeFila; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      const fechaDate = v instanceof Date ? v : (pareceFechaTexto(v) ? parsearFechaTexto(v) : null);
      if (fechaDate) {
        const valor = numCell(row[c + 1]);
        if (valor !== null && valor !== 0) {
          const concepto = row[c + 2] != null && row[c + 2] !== "" ? String(row[c + 2]).trim() : "";
          abonos.push({ fecha: fechaDate, monto: valor, concepto, fila: r, col: c });
        }
      } else if (normCell(v) === "ABONO") {
        const valor = numCell(row[c + 1]);
        if (valor !== null && valor !== 0) {
          abonos.push({ fecha: null, monto: valor, concepto: "ABONO", fila: r, col: c });
        }
      }
    }
  }
  return abonos;
}
function calcularTotalDespachoParseado(lineas) {
  let tot = 0, found = false;
  lineas.forEach((it) => {
    let v = numCell(it.total);
    if (v === null) v = numCell(it.totalConDcto);
    if (v === null) {
      const cant = numCell(it.cantidad), precio = numCell(it.precio);
      if (cant !== null && precio !== null) v = cant * precio;
    }
    if (v !== null) { tot += v; found = true; }
  });
  return found ? tot : null;
}
// Ledger general de abonos: busca en cada fila TODAS las celdas con fecha, y
// para cada una toma el primer número no nulo que aparezca después (antes de
// la siguiente fecha en la misma fila) — cubre los distintos formatos de las
// 10 hojas de depósitos (columnas en posiciones distintas por mes/año).
function parseAbonosGenerico(rows, sheetName) {
  const abonos = [];
  rows.forEach((row, rIdx) => {
    if (!row) return;
    const fechaIdxs = [];
    row.forEach((v, c) => { if (v instanceof Date) fechaIdxs.push(c); });
    fechaIdxs.forEach((fc, fi) => {
      const limite = fi + 1 < fechaIdxs.length ? fechaIdxs[fi + 1] : row.length;
      for (let c = fc + 1; c < limite; c++) {
        const n = numCell(row[c]);
        if (n !== null && n !== 0) {
          abonos.push({ fecha: row[fc], monto: n, fuenteHoja: sheetName, fila: rIdx, col: fc });
          break;
        }
      }
    });
  });
  return abonos;
}
async function parseDespachosVenezuelaExcel(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  const resumen = {};
  // Fila "TOTALES" de esta misma hoja (columna ABONO junto a DESPACHADO) —
  // es el total oficial de abonos que ya usa el negocio para su propio
  // control. Esa plata es la MISMA que las 10 hojas sueltas de depósitos
  // (confirmado con el usuario) — no se importa como abono aparte (se
  // duplicaría), solo se guarda acá para comparar en pantalla contra lo que
  // sí se logra importar de esas 10 hojas + lo de dentro de cada DESPACHO N.
  let totalAbonoOficial = null;
  if (wb.SheetNames.includes("TOTAL DESPACHOS VENEZUELA")) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["TOTAL DESPACHOS VENEZUELA"], { header: 1, raw: true, defval: null });
    rows.forEach((row) => {
      if (!row) return;
      if (normCell(row[4]).includes("DESPACHO") && row[5] !== null && row[5] !== undefined) {
        // Se guarda como texto (no Number) porque algunos despachos tienen
        // identificador compuesto tipo "256-1" (una hoja aparte, distinta de
        // "DESPACHO 256", con su propia fila REVISADO en esta hoja maestra) -
        // Number("256-1") da NaN y esa fila se perdia entera.
        const numKey = String(row[5]).trim();
        const desp = row[7];
        if (numKey && desp !== null && desp !== undefined) resumen[numKey] = Number(desp);
      }
      if (normCell(row[5]) === "TOTALES" && row[6] !== null && row[6] !== undefined) {
        totalAbonoOficial = Number(row[6]);
      }
    });
  }

  const despachos = [];
  const abonos = [];
  const avisos = [];
  wb.SheetNames.forEach((name) => {
    if (HOJAS_NO_DESPACHO.has(name)) return;
    // Captura tambien un sufijo tipo "-1" (ej. "DESPACHO 256-1"): antes solo
    // se tomaba el primer numero ("256"), asi que esa hoja pisaba a
    // "DESPACHO 256" en la base de datos (mismo id "hist-256") y se perdia un
    // despacho completo con su plata. numero queda como texto ("256" o
    // "256-1"), no como entero.
    const m = name.match(/(\d+(?:-\d+)?)/);
    if (!m) return;
    const numero = m[1];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const { fecha, numControlHeader, lineas, finTabla } = parseHojaDespacho(rows);
    parseAbonosDentroDeDespacho(rows, finTabla).forEach((a) => {
      abonos.push({
        id: `hist-abono-despacho-${numero}-${a.fila}-${a.col}`,
        fecha: a.fecha ? new Date(a.fecha).toISOString().slice(0, 10) : null,
        monto: a.monto,
        concepto: a.concepto,
        origen: "importado",
        fuenteHoja: name,
        despachoRelacionado: numero,
        creadoEn: new Date().toISOString(),
      });
    });
    const totalCalc = calcularTotalDespachoParseado(lineas);
    const totalOficial = resumen[numero] ?? null;
    if (!lineas.length) {
      avisos.push(`${name}: sin líneas detectadas${totalOficial ? ` (oficial ${fmtMoney(totalOficial)})` : ""} — revisar a mano.`);
    } else if (totalOficial !== null && totalCalc !== null && Math.abs(totalCalc - totalOficial) > Math.max(1000, totalOficial * 0.01)) {
      avisos.push(`${name}: calculado ${fmtMoney(totalCalc)} ≠ oficial ${fmtMoney(totalOficial)} — revisar a mano.`);
    }
    const numControlLinea = lineas.find((l) => l.numControl)?.numControl;
    const numControlFinal = numControlHeader ?? numControlLinea;
    despachos.push({
      id: `hist-${numero}`,
      numero,
      numControl: numControlFinal ? String(numControlFinal).trim() : "",
      fecha: fecha ? new Date(fecha).toISOString().slice(0, 10) : null,
      estado: "historico",
      lineas: lineas.map((l) => ({
        referencia: (l.referencia ?? "").toString().trim(),
        cantidad: numCell(l.cantidad) || 0,
        numTraslado: (l.numTraslado ?? "").toString().trim(),
        numCorte: (l.numCorte ?? "").toString().trim(),
        numBulto: (l.bulto ?? "").toString().trim(),
        descripcion: (l.descripcion ?? "").toString().trim(),
        marca: (l.marca ?? "").toString().trim(),
        segmento: (l.segmento ?? "").toString().trim(),
        precio: numCell(l.precio) || 0,
        dcto: numCell(l.descuento) || 0,
        total: numCell(l.total) ?? numCell(l.totalConDcto) ?? 0,
        // Códigos de barra por talla que ya venían escritos en la hoja
        // original (columnas después de TOTAL) — se guardan en el mismo
        // formato que usa el buscador de Busint (cbarraI) para que el
        // "Exportar a Excel" del despacho los muestre igual.
        barras: (l.barrasCrudas || []).map((b) => ({ talla: b.talla, pinta: "", color: "", cbarraI: b.valor, cbarraE: "", cbarraM: "" })),
      })),
      totalDespacho: totalCalc ?? totalOficial ?? 0,
      totalOficial,
      origen: "importado",
      creadoEn: new Date().toISOString(),
    });
  });

  // Las 10 hojas de depósitos aparte (ABONO PANELES, DEPOSITOS JULIO, DUBO,
  // etc.) — antes se dejaban sin importar, por eso el total de Abonos
  // quedaba muy por debajo del total de Despachos. Se agregan acá con
  // parseAbonosGenerico (fecha + primer monto no nulo después de cada
  // fecha, dentro de la misma fila) — funciona igual en las hojas de solo
  // FECHA/VALOR que en las de columnas ANTICIPO/ABONO/SALDO o con varios
  // bloques de fecha lado a lado en la misma fila (nunca toma la columna de
  // SALDO acumulado porque siempre se detiene en el primer monto).
  const slug = (s) => String(s).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  HOJAS_ABONOS.forEach((name) => {
    if (!wb.SheetNames.includes(name)) return;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    parseAbonosGenerico(rows, name).forEach((a) => {
      abonos.push({
        id: `hist-abono-suelto-${slug(name)}-${a.fila}-${a.col}`,
        fecha: a.fecha ? new Date(a.fecha).toISOString().slice(0, 10) : null,
        monto: a.monto,
        concepto: name,
        origen: "importado",
        fuenteHoja: name,
        despachoRelacionado: null,
        creadoEn: new Date().toISOString(),
      });
    });
  });

  return { despachos, abonos, avisos, totalAbonoOficial };
}
async function importarADespachosFirestore(despachos, abonos, currentUser, coleccionDespachos, coleccionAbonos) {
  const CHUNK = 400;
  for (let i = 0; i < despachos.length; i += CHUNK) {
    const batch = writeBatch(db);
    despachos.slice(i, i + CHUNK).forEach((d) => {
      batch.set(doc(db, coleccionDespachos, d.id), { ...d, importadoPor: currentUser?.name || currentUser?.username || "" }, { merge: true });
    });
    await batch.commit();
  }
  for (let i = 0; i < abonos.length; i += CHUNK) {
    const batch = writeBatch(db);
    abonos.slice(i, i + CHUNK).forEach((a) => {
      batch.set(doc(db, coleccionAbonos, a.id), { ...a, importadoPor: currentUser?.name || currentUser?.username || "" }, { merge: true });
    });
    await batch.commit();
  }
}
async function borrarHistoricoImportado(despachosExistentes, abonosExistentes, coleccionDespachos, coleccionAbonos) {
  const CHUNK = 400;
  const idsDespachos = despachosExistentes.filter((d) => d.estado === "historico").map((d) => d.id);
  const idsAbonos = abonosExistentes.filter((a) => a.origen === "importado").map((a) => a.id);
  for (let i = 0; i < idsDespachos.length; i += CHUNK) {
    const batch = writeBatch(db);
    idsDespachos.slice(i, i + CHUNK).forEach((id) => batch.delete(doc(db, coleccionDespachos, id)));
    await batch.commit();
  }
  for (let i = 0; i < idsAbonos.length; i += CHUNK) {
    const batch = writeBatch(db);
    idsAbonos.slice(i, i + CHUNK).forEach((id) => batch.delete(doc(db, coleccionAbonos, id)));
    await batch.commit();
  }
  return { despachosBorrados: idsDespachos.length, abonosBorrados: idsAbonos.length };
}
// ─── IMPORTADOR HISTÓRICO DUBO (archivo "DESPACHOS  DUBO.xlsx") ────────────
// A diferencia de Venezuela (una hoja "DESPACHO N" por número consecutivo,
// formato casi uniforme), acá cada hoja es una fecha de entrega distinta y
// ya viene identificada por su propio nombre (ej. "13-08-2025") — un
// despacho por hoja, sin numeración propia. El formato de columnas cambia
// bastante entre 2023 y 2026 (con o sin SUBTOTAL/IVA, con o sin columna
// REMISION por línea, con o sin TRASLADO único en el encabezado, y hasta una
// hoja de 2023 sin fila de encabezado en absoluto) así que las columnas se
// detectan por su texto en vez de por posición fija. La fecha se toma
// siempre del NOMBRE de la hoja (no del encabezado interno "FECHA:") porque
// varias hojas traen ese campo con el año mal digitado (ej. la hoja
// "26-01-2024" dice adentro "FECHA: 2023-01-26"). Validado a mano: cuadra
// exacto contra la hoja "CONSOLI-PAGADO" en 34 de las 35 hojas de despacho;
// la única que no cuadra (08-07-2023, calculado el doble de lo oficial)
// queda marcada en avisos para revisar en el Excel original.
const HOJAS_NO_DESPACHO_DUBO = new Set(["CONSOLI-PAGADO", "observacione de entrega "]);
function slugHojaDubo(nombre) {
  return String(nombre).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}
function fechaDesdeNombreHojaDubo(nombre) {
  const m = String(nombre).trim().match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}
function clasificarColumnaDubo(headerCell) {
  const nv = normCell(headerCell);
  if (!nv) return null;
  if (nv === "REF" || nv.startsWith("REFERENCIA")) return "referencia";
  if (nv === "CANT" || nv.startsWith("CANTIDAD")) return "cantidad";
  if (nv === "SUBTOTAL") return "subtotal";
  if (nv === "IVA") return "iva";
  if (nv === "REMISION") return "remisionLinea";
  if (nv === "0.5" || nv === "50%") return "precioMitad";
  if (nv.startsWith("PRECIO") || nv === "VALOR UNITARIO") return "precioFull";
  if (nv.startsWith("TOTAL") || nv === "VALOR TOTAL") return "total";
  return null;
}
// Única hoja del archivo (2023-11-20) sin fila de encabezado de texto — los
// datos empiezan directo después del bloque REMITE/DESTINO/FECHA con
// columnas fijas por posición (Ubicación, Referencia, Descripción, Cantidad,
// Precio full, Mitad, Total). Se detecta buscando la primera fila con esa
// forma (2 columnas de texto + 4 columnas numéricas seguidas).
function detectarTablaPosicionalDubo(rows) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.length < 7) continue;
    if (
      row[0] && typeof row[0] === "string" &&
      row[1] !== null && row[1] !== undefined && row[1] !== "" &&
      numCell(row[3]) !== null && numCell(row[4]) !== null &&
      numCell(row[5]) !== null && numCell(row[6]) !== null
    ) {
      return r;
    }
  }
  return null;
}
function parseHojaDespachoDubo(rows) {
  let numTrasladoHeader = null;
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (normCell(row[c]) === "TRASLADO") {
        const v = row[c + 1];
        if (v !== null && v !== undefined && String(v).trim() !== "") numTrasladoHeader = String(v).trim();
      }
    }
  }
  let hr = -1, hc = -1, colmap = {};
  outer: for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const nv = normCell(row[c]);
      if (nv === "REF" || nv.startsWith("REFERENCIA")) { hr = r; hc = c; break outer; }
    }
  }
  if (hr === -1) {
    const rInicio = detectarTablaPosicionalDubo(rows);
    if (rInicio === null) return null;
    hr = rInicio - 1;
    hc = 1;
    colmap = { 1: "referencia", 3: "cantidad", 4: "precioFull", 5: "precioMitad", 6: "total" };
  } else {
    const headerRow = rows[hr] || [];
    headerRow.forEach((v, c) => {
      const tipo = clasificarColumnaDubo(v);
      if (tipo) colmap[c] = tipo;
    });
  }
  const colIdxs = Object.keys(colmap).map(Number);
  const totalCol = colIdxs.find((c) => colmap[c] === "total");

  const crudas = [];
  const avisosLinea = [];
  let blanks = 0;
  let r = hr + 1;
  let stopRow = null;
  while (r < rows.length) {
    const row = rows[r] || [];
    const refNorm = normCell(row[hc]);
    if (refNorm.startsWith("TOTAL")) { stopRow = r; break; }
    if (!refNorm) {
      const algunNumero = colIdxs.some((c) => numCell(row[c]) !== null);
      if (!algunNumero) {
        blanks++;
        if (blanks >= 3) { stopRow = r - blanks + 1; break; }
        r++; continue;
      }
      stopRow = r;
      break;
    }
    blanks = 0;
    const item = { referencia: row[hc] };
    colIdxs.forEach((c) => { item[colmap[c]] = row[c] ?? null; });
    // Nota suelta en alguna columna sin mapear (ej. "FALDAS DE DEVOLUCION",
    // vista en la hoja 14-06-2023) — se avisa pero la línea igual se
    // importa, porque su total ya está incluido en el cierre de la hoja.
    row.forEach((v, c) => {
      if (c === hc || colmap[c]) return;
      if (v !== null && v !== undefined && String(v).trim() !== "" && numCell(v) === null) {
        avisosLinea.push(`fila "${String(row[hc]).trim()}": nota "${String(v).trim()}"`);
      }
    });
    crudas.push(item);
    r++;
  }
  if (stopRow === null) stopRow = rows.length;

  // Total de cierre: se busca solo en la fila donde se cortó y, si ahí no
  // trae valor, en la siguiente (algunas hojas traen 2 filas de cierre:
  // primero una con la cantidad total sin plata, luego la real "TOTAL...
  // $"). Una ventana más ancha se metía en secciones sueltas más abajo (ej.
  // "UNIDADES DEVUELTAS" en la hoja 30-12-2025) y agarraba un número que no
  // era el cierre real.
  let totalOficial = null;
  for (let rr = stopRow; rr < Math.min(stopRow + 2, rows.length); rr++) {
    const row = rows[rr] || [];
    if (totalCol !== undefined) {
      const v = numCell(row[totalCol]);
      if (v !== null && v !== 0) { totalOficial = v; break; }
    }
  }
  if (totalOficial === null) {
    const row = rows[stopRow] || [];
    for (let c = row.length - 1; c >= 0; c--) {
      const v = numCell(row[c]);
      if (v !== null && v !== 0) { totalOficial = v; break; }
    }
  }

  // Algunas hojas (vista en 30-12-2025) traen, PEGADO después del cierre
  // normal, bloques extra de "UNIDADES DEVUELTAS" / "UNIDADES SIN FACTURA"
  // que SÍ cuentan para lo que Dubo pagó — no son devoluciones que se
  // restan, son líneas adicionales de la misma entrega — y terminan en una
  // fila "GRAN TOTAL" que es el cierre real (y el que cuadra contra
  // CONSOLI-PAGADO). Si aparece un "GRAN TOTAL" después del cierre normal,
  // se recorren esas filas de en medio agregando las que sí son líneas de
  // producto (tienen referencia y cantidad) — se saltan las etiquetas de
  // sección y las filas de subtotal — y el "GRAN TOTAL" reemplaza al total
  // de cierre normal.
  let granTotalRow = -1;
  for (let rr = stopRow; rr < Math.min(stopRow + 40, rows.length); rr++) {
    const row = rows[rr] || [];
    if (row.some((v) => normCell(v).includes("GRAN TOTAL"))) { granTotalRow = rr; break; }
  }
  let tieneDevoluciones = false;
  if (granTotalRow !== -1) {
    for (let rr = stopRow + 1; rr < granTotalRow; rr++) {
      const row = rows[rr] || [];
      const refNorm = normCell(row[hc]);
      if (!refNorm || /^(UNIDADES|TOTAL|GRAN)/.test(refNorm)) continue;
      const cantVal = colIdxs.some((c) => colmap[c] === "cantidad") ? numCell(row[colIdxs.find((c) => colmap[c] === "cantidad")]) : null;
      if (cantVal === null) continue;
      const item = { referencia: row[hc] };
      colIdxs.forEach((c) => { item[colmap[c]] = row[c] ?? null; });
      crudas.push(item);
    }
    const grRow = rows[granTotalRow] || [];
    let t = null;
    for (let c = grRow.length - 1; c >= 0; c--) {
      const v = numCell(grRow[c]);
      if (v !== null && v !== 0) { t = v; break; }
    }
    if (t !== null) totalOficial = t;
    avisosLinea.push(`se agregaron las líneas de "UNIDADES DEVUELTAS"/"UNIDADES SIN FACTURA" que trae la hoja después del cierre — el total final ahora sale de la fila "GRAN TOTAL".`);
  } else {
    // Aviso si hay una sección de devoluciones pegada después del cierre y
    // NO hay un "GRAN TOTAL" que las sume — ahí sí no se importa (no es una
    // venta más), pero se avisa para que quede registrado que existe en el
    // Excel original.
    for (let rr = stopRow; rr < Math.min(stopRow + 10, rows.length); rr++) {
      const row = rows[rr] || [];
      if (row.some((v) => normCell(v).includes("DEVOL"))) { tieneDevoluciones = true; break; }
    }
  }

  return { numTrasladoHeader, lineas: crudas, totalOficial, avisosLinea, tieneDevoluciones };
}
async function parseDespachosDuboExcel(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  // Ledger oficial "CONSOLI-PAGADO": fecha + valor por cada entrega — se usa
  // como respaldo solo cuando la hoja misma no trae una fila de total
  // reconocible (tomando, de las oficiales de esa fecha, la que quede más
  // cerca del total calculado, por si hubo más de una hoja el mismo día).
  const oficialesPorFecha = {};
  if (wb.SheetNames.includes("CONSOLI-PAGADO")) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets["CONSOLI-PAGADO"], { header: 1, raw: true, defval: null });
    filas.forEach((row) => {
      if (!row) return;
      const fechaCell = row[1];
      const valor = numCell(row[2]);
      if (fechaCell instanceof Date && valor !== null) {
        const iso = fechaCell.toISOString().slice(0, 10);
        (oficialesPorFecha[iso] = oficialesPorFecha[iso] || []).push(valor);
      }
    });
  }

  const despachos = [];
  const avisos = [];
  wb.SheetNames.forEach((name) => {
    if (HOJAS_NO_DESPACHO_DUBO.has(name)) return;
    const fecha = fechaDesdeNombreHojaDubo(name);
    if (!fecha) { avisos.push(`${name}: no se pudo leer la fecha del nombre de la hoja — revisar a mano.`); return; }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const parsed = parseHojaDespachoDubo(rows);
    if (!parsed) { avisos.push(`${name}: no se encontró la tabla de referencias — revisar a mano.`); return; }
    const { numTrasladoHeader, lineas, totalOficial, avisosLinea, tieneDevoluciones } = parsed;
    avisosLinea.forEach((n) => avisos.push(`${name}: ${n}.`));
    if (tieneDevoluciones) avisos.push(`${name}: tiene una sección de "UNIDADES DEVUELTAS" (u otra devolución) después del total — no se importó, revisar aparte.`);
    if (!lineas.length) { avisos.push(`${name}: sin líneas detectadas — revisar a mano.`); return; }

    const lineasFinal = lineas.map((l) => {
      const remisionLinea = (l.remisionLinea ?? "").toString().trim();
      const cantidad = numCell(l.cantidad) || 0;
      const precioMitad = numCell(l.precioMitad);
      const precioFull = numCell(l.precioFull);
      const precio = precioMitad ?? (precioFull !== null ? precioFull / 2 : null) ?? 0;
      const total = numCell(l.total) ?? (cantidad && precio ? cantidad * precio : 0);
      return {
        referencia: (l.referencia ?? "").toString().trim(),
        cantidad,
        numTraslado: remisionLinea || (numTrasladoHeader ?? ""),
        numCorte: "",
        numBulto: "",
        descripcion: "",
        marca: "",
        segmento: "",
        precio,
        dcto: 0,
        total,
        barras: [],
      };
    });
    const totalCalc = lineasFinal.reduce((s, l) => s + (l.total || 0), 0);

    const candidatas = oficialesPorFecha[fecha] || [];
    let totalOficialCuadre = totalOficial;
    if (totalOficialCuadre === null && candidatas.length) {
      totalOficialCuadre = candidatas.reduce((mejor, v) => (Math.abs(v - totalCalc) < Math.abs(mejor - totalCalc) ? v : mejor), candidatas[0]);
    }
    if (totalOficialCuadre !== null && Math.abs(totalCalc - totalOficialCuadre) > Math.max(1000, totalOficialCuadre * 0.01)) {
      avisos.push(`${name}: calculado ${fmtMoney(totalCalc)} ≠ oficial ${fmtMoney(totalOficialCuadre)} — revisar a mano.`);
    }

    // numTraslado a nivel de despacho: solo si TODAS las líneas comparten un
    // mismo valor (formato normal, un TRASLADO para toda la hoja) — en las 2
    // hojas con REMISION por línea se deja vacío acá porque cada línea trae
    // la suya propia (queda igual visible dentro de cada línea).
    const numTrasladosUnicos = new Set(lineasFinal.map((l) => l.numTraslado).filter(Boolean));
    const numControl = numTrasladosUnicos.size === 1 ? [...numTrasladosUnicos][0] : (numTrasladoHeader || "");

    // Excepción confirmada con el usuario: la hoja 08-07-2023 despachó
    // $1.974.946,34 en mercancía, pero de eso Dubo solo pagó $981.592,12 (el
    // resto se resolvió de otra forma, no queda pendiente). En vez de dejar
    // el total del despacho en lo despachado y tener que sumar un abono
    // aparte, se deja el total del despacho directamente en lo pagado — así
    // el saldo de Dubo queda cuadrado sin pasos extra. Las líneas de detalle
    // (119 referencias) se dejan igual, solo cambia el total.
    let totalDespachoFinal = totalCalc || totalOficialCuadre || 0;
    if (name === "08-07-2023") totalDespachoFinal = 981592.12;

    despachos.push({
      id: `hist-dubo-${slugHojaDubo(name)}`,
      numero: numControl || fecha,
      numControl,
      fecha,
      estado: "historico",
      lineas: lineasFinal,
      totalDespacho: totalDespachoFinal,
      totalOficial: totalOficialCuadre,
      origen: "importado",
      creadoEn: new Date().toISOString(),
    });
  });

  // Hojas duplicadas del mismo despacho — vista en 02-03-2026 y 05-03-2026:
  // mismo TRASLADO (3309), las 90 filas idénticas y el mismo total, pero
  // "CONSOLI-PAGADO" solo trae ese pago UNA vez (el 2026-03-02) — alguien
  // copió la hoja y le cambió la fecha por error. Si dos hojas comparten
  // TRASLADO y total, se importa solo la primera para no duplicar la plata;
  // la otra queda marcada en avisos por si hay que revisarla a mano.
  const vistos = new Map();
  const despachosSinDuplicados = [];
  despachos.forEach((d) => {
    const clave = d.numControl ? `${d.numControl}|${Math.round(d.totalDespacho)}` : null;
    if (clave && vistos.has(clave)) {
      avisos.push(`${d.fecha}: hoja duplicada del despacho TRASLADO ${d.numControl} (mismo total que la hoja de ${vistos.get(clave)}) — no se importó para no duplicar la plata.`);
      return;
    }
    if (clave) vistos.set(clave, d.fecha);
    despachosSinDuplicados.push(d);
  });

  return { despachos: despachosSinDuplicados, abonos: [], avisos, totalAbonoOficial: null };
}
function ImportarHistoricoView({ currentUser, despachosExistentes, abonosExistentes, coleccionDespachos, coleccionAbonos, destino }) {
  const [analizando, setAnalizando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [importando, setImportando] = useState(false);
  const [importado, setImportado] = useState(false);
  const [error, setError] = useState(null);
  const [borrando, setBorrando] = useState(false);
  const [borrado, setBorrado] = useState(null);
  const yaImportado = despachosExistentes.some((d) => d.estado === "historico");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalizando(true);
    setResultado(null);
    setImportado(false);
    setError(null);
    try {
      const r = destino === "Dubo" ? await parseDespachosDuboExcel(file) : await parseDespachosVenezuelaExcel(file);
      setResultado(r);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setAnalizando(false);
    }
  }
  async function confirmar() {
    if (!resultado) return;
    setImportando(true);
    setError(null);
    try {
      await importarADespachosFirestore(resultado.despachos, resultado.abonos, currentUser, coleccionDespachos, coleccionAbonos);
      setImportado(true);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setImportando(false);
    }
  }
  async function borrarTodo() {
    const nDesp = despachosExistentes.filter((d) => d.estado === "historico").length;
    const nAb = abonosExistentes.filter((a) => a.origen === "importado").length;
    if (!window.confirm(`¿Borrar los ${nDesp} despachos y ${nAb} abonos históricos importados? Esto no se puede deshacer. Después puedes volver a subir el Excel para importarlos de nuevo.`)) return;
    setBorrando(true);
    setError(null);
    setBorrado(null);
    try {
      const r = await borrarHistoricoImportado(despachosExistentes, abonosExistentes, coleccionDespachos, coleccionAbonos);
      setBorrado(r);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 16, lineHeight: 1.6 }}>
        {destino === "Venezuela" ? (
          <>Sube el archivo <strong>DESPACHOS KAMILA VENEZUELA.xlsx</strong>. Se analiza primero (sin guardar nada) para que revises el resultado antes de confirmar. Es seguro volver a correrlo — actualiza los mismos registros en vez de duplicarlos.</>
        ) : destino === "Dubo" ? (
          <>Sube el archivo <strong>DESPACHOS  DUBO.xlsx</strong>. Cada hoja es una fecha de entrega distinta (una hoja = un despacho) — se analiza primero (sin guardar nada) para que revises el resultado antes de confirmar. Es seguro volver a correrlo — actualiza los mismos registros en vez de duplicarlos. El número de REMISION/TRASLADO se guarda cuando la hoja lo trae; se deja vacío cuando no.</>
        ) : (
          <>Este importador está validado contra el formato del histórico de <strong>Venezuela</strong> (546 hojas "DESPACHO N°"). Se guardará en los datos de <strong>{destino}</strong> — solo úsalo aquí si el archivo de {destino} tiene la misma estructura de hojas y columnas.</>
        )}
        <br />
        {destino === "Dubo" ? (
          <>Este archivo no trae hojas de abonos o depósitos — solo se importan despachos.</>
        ) : (
          <>Los abonos se toman tanto de <strong>dentro de cada hoja DESPACHO 2 a 546</strong> como de las <strong>10 hojas sueltas de depósitos</strong> (ABONO PANELES, DEPOSITOS JULIO/AGOSTO/SEP/OCT/NOV, DUBO, DEPOSITOS CUENTA YULIANA M-J, DICIEMBRE, ENERO).</>
        )}
      </div>
      {yaImportado && (
        <div style={{ padding: "10px 14px", background: C.amberBg, color: C.amber, borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>Ya hay despachos históricos importados. Volver a subir el archivo actualiza esos mismos registros — si algún registro viejo quedó con datos incorrectos de una importación anterior, bórralos primero.</span>
          <Btn small variant="danger" onClick={borrarTodo} disabled={borrando}>{borrando ? "Borrando..." : "🗑 Borrar histórico importado"}</Btn>
        </div>
      )}
      {borrado && (
        <div style={{ padding: "10px 14px", background: C.greenBg, color: C.green, borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
          ✓ Se borraron {borrado.despachosBorrados} despachos y {borrado.abonosBorrados} abonos históricos. Ya puedes subir el archivo de nuevo.
        </div>
      )}
      <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={analizando} style={{ marginBottom: 16 }} />
      {analizando && <div style={{ color: C.slate, fontSize: 13 }}>Analizando archivo... puede tardar un momento.</div>}
      {error && (
        <div style={{ padding: "10px 14px", background: C.redBg, color: C.red, borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
          Error al procesar: {error}
        </div>
      )}
      {resultado && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "16px 0" }}>
            <KPI icon="🚚" label="Despachos detectados" value={fmtNum(resultado.despachos.length)} color={C.blue} bg={C.blueBg} />
            <KPI icon="💵" label="Abonos detectados" value={fmtNum(resultado.abonos.length)} color={C.green} bg={C.greenBg} />
            <KPI icon="⚠️" label="Para revisar a mano" value={fmtNum(resultado.avisos.length)} color={resultado.avisos.length ? C.red : C.green} bg={resultado.avisos.length ? C.redBg : C.greenBg} />
          </div>
          {resultado.totalAbonoOficial !== null && (() => {
            const totalImportado = resultado.abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
            const diferencia = resultado.totalAbonoOficial - totalImportado;
            const pct = resultado.totalAbonoOficial ? (Math.abs(diferencia) / resultado.totalAbonoOficial) * 100 : 0;
            const cuadra = Math.abs(diferencia) < Math.max(1000, resultado.totalAbonoOficial * 0.005);
            return (
              <div
                style={{
                  background: cuadra ? C.greenBg : C.amberBg,
                  border: `1.5px solid ${(cuadra ? C.green : C.amber)}55`,
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 16,
                  fontSize: 12,
                  color: C.ink,
                }}
              >
                <div style={{ fontWeight: 800, color: cuadra ? C.green : C.amber, marginBottom: 6 }}>
                  {cuadra ? "✓ Abonos cuadran contra la hoja TOTAL DESPACHOS VENEZUELA" : "⚠ Abonos no cuadran exacto contra la hoja TOTAL DESPACHOS VENEZUELA"}
                </div>
                <div>Importado (dentro de cada DESPACHO + 10 hojas sueltas): <strong>{fmtMoney(totalImportado)}</strong></div>
                <div>Oficial (columna ABONO, fila TOTALES): <strong>{fmtMoney(resultado.totalAbonoOficial)}</strong></div>
                <div>Diferencia: <strong style={{ color: cuadra ? C.green : C.amber }}>{fmtMoney(diferencia)} ({pct.toFixed(1)}%)</strong></div>
              </div>
            );
          })()}
          {resultado.avisos.length > 0 && (
            <div style={{ background: C.redBg, borderRadius: 10, padding: 14, marginBottom: 16, maxHeight: 220, overflowY: "auto" }}>
              {resultado.avisos.map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>• {a}</div>
              ))}
            </div>
          )}
          {!importado ? (
            <Btn onClick={confirmar} disabled={importando}>{importando ? "Importando..." : `Confirmar e importar ${resultado.despachos.length} despachos`}</Btn>
          ) : (
            <div style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>✓ Importación completa.</div>
          )}
        </div>
      )}
    </div>
  );
}
// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// El saldo solo cuenta despachos "aprobado" e "historico" — uno "montado"
// (recién capturado por bodega, sin revisar) todavía no cuenta como valor
// despachado en firme, para no inflar el saldo con datos sin revisar.
function DashboardBodegaView({ despachos, abonos }) {
  const contables = despachos.filter((d) => d.estado === "aprobado" || d.estado === "historico");
  const pendientes = despachos.filter((d) => d.estado === "montado");
  const totalDespachado = contables.reduce((s, d) => s + (d.totalDespacho || 0), 0);
  const totalAbonado = abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const saldo = totalDespachado - totalAbonado;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        <KPI icon="🚚" label="Total Despachado" value={fmtMoney(totalDespachado)} color={C.blue} bg={C.blueBg} sub={`${contables.length} despachos`} />
        <KPI icon="💵" label="Total Abonado" value={fmtMoney(totalAbonado)} color={C.green} bg={C.greenBg} sub={`${abonos.length} abonos`} />
        <KPI icon="⚖️" label="Saldo" value={fmtMoney(saldo)} color={saldo > 0 ? C.red : C.green} bg={saldo > 0 ? C.redBg : C.greenBg} />
        <KPI icon="⏳" label="Por Aprobar" value={fmtNum(pendientes.length)} color={C.amber} bg={C.amberBg} sub={fmtMoney(pendientes.reduce((s, d) => s + (d.totalDespacho || 0), 0))} />
      </div>
      <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
        El saldo se calcula con los despachos <strong>aprobados</strong> y los <strong>históricos</strong> importados — los que bodega acaba de montar y todavía no se han revisado no cuentan aquí todavía.
      </div>
    </div>
  );
}
// Descarga el estado de cuenta consolidado en Excel: una fila por
// movimiento (despacho o abono, de cualquiera de los dos destinos)
// ordenados por fecha con el saldo corriendo, y al final el desglose de
// Saldo Venezuela / Saldo Dubo / Saldo Total KAMILA GROUP resaltado en
// colores. Misma librería y mismos estilos que ya usa el resto de Bodega.
async function exportarEstadoCuentaKamilaExcel(movimientos, desglose) {
  const XLSX = await import("xlsx-js-style");
  const headers = ["FECHA", "DESTINO", "DETALLE", "DESPACHADO", "ABONADO", "SALDO CORRIDO"];
  const grid = [];
  grid.push(headers.map((h) => celda(h, ESTILO_HEADER)));
  movimientos.forEach((m) => {
    const estiloFila = m.tipo === "despacho" ? ESTILO_DATO : ESTILO_ABONO;
    grid.push([
      celda(fmtFechaISO(m.fecha), estiloFila),
      celda(m.destino, estiloFila),
      celda(m.tipo === "despacho" ? `Despacho ${m.detalle}` : m.detalle, estiloFila),
      celda(m.tipo === "despacho" ? m.monto : "", estiloFila, FORMATO_MONEDA),
      celda(m.tipo === "abono" ? m.monto : "", estiloFila, FORMATO_MONEDA),
      celda(m.saldoCorrido, estiloFila, FORMATO_MONEDA),
    ]);
  });
  grid.push(new Array(headers.length).fill(null).map(() => celda("", ESTILO_TOTAL_VACIA)));
  function filaResumen(etiqueta, valor, estilo) {
    const fila = new Array(headers.length).fill(null).map(() => celda("", ESTILO_TOTAL_VACIA));
    fila[2] = celda(etiqueta, estilo);
    fila[5] = celda(valor, estilo, FORMATO_MONEDA);
    return fila;
  }
  grid.push(filaResumen("SALDO VENEZUELA", desglose.saldoVenezuela, ESTILO_SUBTOTAL));
  grid.push(filaResumen("SALDO DUBO", desglose.saldoDubo, ESTILO_SUBTOTAL));
  grid.push(filaResumen("SALDO TOTAL — KAMILA GROUP", desglose.saldoTotal, desglose.saldoTotal > 0 ? ESTILO_SALDO_ROJO : ESTILO_SALDO_VERDE));

  const ws = XLSX.utils.aoa_to_sheet(grid);
  ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estado de Cuenta Kamila");
  const hoy = today();
  XLSX.writeFile(wb, `Estado de Cuenta KAMILA GROUP ${hoy}.xlsx`);
}
// ─── ESTADO DE CUENTA KAMILA GROUP ──────────────────────────────────────────
// KAMILA GROUP despacha por dos destinos (Venezuela y Dubo) que en Bodega
// viven en colecciones totalmente separadas — esta vista los junta en un
// solo estado de cuenta consolidado, sin tocar cómo se guardan. Colombia
// queda fuera a propósito (destino aparte, no es KAMILA GROUP).
// Saldo = Total Despachado (Venezuela + Dubo) − (Abonos Venezuela + Saldo
// Yuliana). Yuliana es la cuenta que de verdad mueve la plata de Dubo — los
// Abonos Dubo (la pestaña "Abonos" dentro del destino Dubo) NO entran acá.
function EstadoCuentaKamilaView({ data }) {
  const { despachosVenezuela, despachosDubo, abonosVenezuela, yulianaVenezuela, loading } = data;
  const movimientos = useMemo(() => {
    if (loading) return [];
    const contables = (lista, destino) =>
      lista
        .filter((d) => d.estado === "aprobado" || d.estado === "historico")
        .map((d) => ({
          tipo: "despacho",
          destino,
          fecha: d.fecha || "",
          monto: d.totalDespacho || 0,
          detalle: d.numero || d.numControl || "—",
          id: `${destino}-desp-${d.id}`,
        }));
    const abonosLista = (lista, destino) =>
      lista.map((a) => ({
        tipo: "abono",
        destino,
        fecha: a.fecha || "",
        monto: Number(a.monto) || 0,
        detalle: a.concepto || "Abono",
        id: `${destino}-abono-${a.id}`,
      }));
    // Cada entrada de Yuliana se convierte en un "abono" contra Dubo: un
    // depósito resta del saldo (como cualquier abono), y una salida/anticipo
    // hace lo contrario, así que entra con el monto en negativo — así el
    // saldo corrido de la tabla y el KPI "Abonado" quedan matemáticamente
    // correctos sin inventar un tercer tipo de movimiento.
    const yulianaLista = (lista) =>
      lista.map((e) => {
        const monto = Number(e.monto) || 0;
        return {
          tipo: "abono",
          destino: "Dubo",
          fecha: e.fecha || "",
          monto: e.tipo === "salida" ? -monto : monto,
          detalle: e.concepto || (e.tipo === "salida" ? "Salida Yuliana" : "Depósito Yuliana"),
          id: `yuliana-${e.id}`,
        };
      });
    const todos = [
      ...contables(despachosVenezuela, "Venezuela"),
      ...contables(despachosDubo, "Dubo"),
      ...abonosLista(abonosVenezuela, "Venezuela"),
      ...yulianaLista(yulianaVenezuela),
    ];
    todos.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    let saldo = 0;
    return todos.map((m) => {
      saldo += m.tipo === "despacho" ? m.monto : -m.monto;
      return { ...m, saldoCorrido: saldo };
    });
  }, [despachosVenezuela, despachosDubo, abonosVenezuela, yulianaVenezuela, loading]);
  const porDestino = (dest) => {
    const desp = movimientos.filter((m) => m.tipo === "despacho" && m.destino === dest).reduce((s, m) => s + m.monto, 0);
    const abo = movimientos.filter((m) => m.tipo === "abono" && m.destino === dest).reduce((s, m) => s + m.monto, 0);
    return { despachado: desp, abonado: abo, saldo: desp - abo };
  };
  const ve = porDestino("Venezuela");
  const du = porDestino("Dubo");
  const totalDespachado = ve.despachado + du.despachado;
  const totalAbonado = ve.abonado + du.abonado;
  const saldo = ve.saldo + du.saldo;
  if (loading) {
    return <div style={{ color: C.slate, fontSize: 13 }}>Cargando estado de cuenta...</div>;
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>🧾 Estado de Cuenta — KAMILA GROUP</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>Consolidado Venezuela + Dubo (Colombia no se incluye)</div>
        </div>
        <Btn onClick={() => exportarEstadoCuentaKamilaExcel(movimientos, { saldoVenezuela: ve.saldo, saldoDubo: du.saldo, saldoTotal: saldo })}>⬇ Descargar Excel</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
        <KPI icon="🚚" label="Total Despachado" value={fmtMoney(totalDespachado)} color={C.blue} bg={C.blueBg} sub="Venezuela + Dubo" />
        <KPI icon="💵" label="Total Abonado" value={fmtMoney(totalAbonado)} color={C.green} bg={C.greenBg} sub="Abonos Venezuela + Yuliana" />
        <KPI icon="⚖️" label="Saldo Total" value={fmtMoney(saldo)} color={saldo > 0 ? C.red : C.green} bg={saldo > 0 ? C.redBg : C.greenBg} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 24 }}>
        <KPI icon="🇻🇪" label="Saldo Venezuela" value={fmtMoney(ve.saldo)} color={ve.saldo > 0 ? C.red : C.green} bg={ve.saldo > 0 ? C.redBg : C.greenBg} sub={`Despachado ${fmtMoney(ve.despachado)} · Abonado ${fmtMoney(ve.abonado)}`} />
        <KPI icon="📦" label="Saldo Dubo" value={fmtMoney(du.saldo)} color={du.saldo > 0 ? C.red : C.green} bg={du.saldo > 0 ? C.redBg : C.greenBg} sub={`Despachado ${fmtMoney(du.despachado)} · Yuliana ${fmtMoney(du.abonado)}`} />
      </div>
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "100px 90px 1fr 130px 130px 140px", gap: 8, padding: "10px 16px", background: C.canvas, fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <div>Fecha</div>
          <div>Destino</div>
          <div>Detalle</div>
          <div style={{ textAlign: "right" }}>Despachado</div>
          <div style={{ textAlign: "right" }}>Abonado</div>
          <div style={{ textAlign: "right" }}>Saldo</div>
        </div>
        {!movimientos.length && (
          <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay movimientos todavía.</div>
        )}
        {movimientos.map((m) => (
          <div
            key={m.id}
            style={{ display: "grid", gridTemplateColumns: "100px 90px 1fr 130px 130px 140px", gap: 8, padding: "10px 16px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.ink, alignItems: "center" }}
          >
            <div>{fmtFechaISO(m.fecha)}</div>
            <div>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  background: m.destino === "Venezuela" ? C.violetBg : C.amberBg,
                  color: m.destino === "Venezuela" ? C.violet : C.amber,
                }}
              >
                {m.destino}
              </span>
            </div>
            <div>{m.tipo === "despacho" ? `Despacho ${m.detalle}` : m.detalle}</div>
            <div style={{ textAlign: "right", color: C.blue, fontWeight: 700 }}>{m.tipo === "despacho" ? fmtMoney(m.monto) : ""}</div>
            <div style={{ textAlign: "right", color: C.green, fontWeight: 700 }}>{m.tipo === "abono" ? fmtMoney(m.monto) : ""}</div>
            <div style={{ textAlign: "right", fontWeight: 800, color: m.saldoCorrido > 0 ? C.red : C.green }}>{fmtMoney(m.saldoCorrido)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── RAÍZ DEL MÓDULO ────────────────────────────────────────────────────────
// Destinos de despacho — cada uno con sus propios datos, completamente
// separados (colección "despachos"+destino y "abonos"+destino en
// Firestore), como si fueran bodegas distintas que comparten la misma app.
// Para agregar un destino nuevo más adelante, solo hay que agregarlo acá.
const DESTINOS_BODEGA = ["Venezuela", "Dubo", "Colombia"];
// Firestore no acepta tildes/espacios como parte "limpia" de un nombre de
// colección aunque técnicamente los permite — se usa una versión sin tildes
// para el nombre real de la colección, pero el label que ve el usuario sí
// puede llevar tilde si algún destino la necesita.
function slugDestino(destino) {
  return String(destino || "Venezuela")
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}
export default function ModuloBodega({ currentUser, puedeAprobarDespacho, canAccessContabilidad, soloLecturaBodega, onVolver, onLogout }) {
  const [subView, setSubView] = useState("dashboard");
  const [destino, setDestino] = useState("Venezuela");
  const [despachos, setDespachos] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [saldoYuliana, setSaldoYuliana] = useState([]);
  const [pinEdicion, setPinEdicion] = useState("");
  const [loading, setLoading] = useState(true);
  const [estadoKamila, setEstadoKamila] = useState({ despachosVenezuela: [], despachosDubo: [], abonosVenezuela: [], yulianaVenezuela: [], loading: true });
  const coleccionDespachos = `despachos${slugDestino(destino)}`;
  const coleccionAbonos = `abonos${slugDestino(destino)}`;
  const coleccionSaldoYuliana = `cuentaYuliana${slugDestino(destino)}`;
  // Se vuelve a suscribir cada vez que cambia el destino — cada uno tiene su
  // propia colección en Firestore, así que hay que soltar los listeners
  // viejos y abrir los nuevos (por eso [destino] en las dependencias).
  useEffect(() => {
    setLoading(true);
    const unsubDespachos = onSnapshot(collection(db, coleccionDespachos), (snap) => {
      setDespachos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    const unsubAbonos = onSnapshot(collection(db, coleccionAbonos), (snap) => {
      setAbonos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubSaldoYuliana = onSnapshot(collection(db, coleccionSaldoYuliana), (snap) => {
      setSaldoYuliana(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubConfig = onSnapshot(doc(db, "bodega_config", "main"), (snap) => {
      setPinEdicion(snap.exists() ? snap.data()?.pinEdicion || "" : "");
    });
    return () => {
      unsubDespachos();
      unsubAbonos();
      unsubSaldoYuliana();
      unsubConfig();
    };
  }, [coleccionDespachos, coleccionAbonos, coleccionSaldoYuliana]);
  // Estado de Cuenta KAMILA GROUP: junta Venezuela + Dubo en una sola vista,
  // sin importar qué destino esté elegido en el selector de arriba. Solo se
  // suscribe mientras esa pestaña está abierta, para no leer 4 colecciones
  // extra todo el tiempo si nadie la está mirando.
  useEffect(() => {
    if (subView !== "estadoCuentaKamila") return;
    setEstadoKamila((s) => ({ ...s, loading: true }));
    // El saldo Kamila resta Abonos Venezuela + Saldo Yuliana (la cuenta
    // Yuliana de Venezuela) — Abonos Dubo ya NO entra en esta cuenta, por
    // eso aquí se suscribe "cuentaYulianaVenezuela" en vez de "abonosDubo".
    let cargados = { dv: false, dd: false, av: false, yv: false };
    function marcarCargado(clave) {
      cargados = { ...cargados, [clave]: true };
      if (cargados.dv && cargados.dd && cargados.av && cargados.yv) {
        setEstadoKamila((s) => ({ ...s, loading: false }));
      }
    }
    const unsubDV = onSnapshot(collection(db, "despachosVenezuela"), (snap) => {
      setEstadoKamila((s) => ({ ...s, despachosVenezuela: snap.docs.map((d) => ({ ...d.data(), id: d.id })) }));
      marcarCargado("dv");
    });
    const unsubDD = onSnapshot(collection(db, "despachosDubo"), (snap) => {
      setEstadoKamila((s) => ({ ...s, despachosDubo: snap.docs.map((d) => ({ ...d.data(), id: d.id })) }));
      marcarCargado("dd");
    });
    const unsubAV = onSnapshot(collection(db, "abonosVenezuela"), (snap) => {
      setEstadoKamila((s) => ({ ...s, abonosVenezuela: snap.docs.map((d) => ({ ...d.data(), id: d.id })) }));
      marcarCargado("av");
    });
    const unsubYV = onSnapshot(collection(db, "cuentaYulianaVenezuela"), (snap) => {
      setEstadoKamila((s) => ({ ...s, yulianaVenezuela: snap.docs.map((d) => ({ ...d.data(), id: d.id })) }));
      marcarCargado("yv");
    });
    return () => { unsubDV(); unsubDD(); unsubAV(); unsubYV(); };
  }, [subView]);
  async function guardarPinEdicion(pin) {
    setPinEdicion(pin);
    await fsSave("bodega_config", "main", { pinEdicion: pin });
  }
  // Borrar un despacho por completo (histórico o aprobado) — solo
  // Administración puede hacerlo, se valida además al mostrar el botón en
  // DetalleDespachoModal.
  async function eliminarDespacho(id) {
    setDespachos((ds) => ds.filter((d) => d.id !== id));
    await fsDelete(coleccionDespachos, id);
  }
  const isAdmin = !!currentUser?.isAdmin;
  // Usuario de "solo lectura" (típicamente rol Cliente): ve todo el
  // historial completo igual que Contabilidad — no solo lo que él mismo
  // montó — pero no puede aprobar, editar, montar despachos nuevos ni tocar
  // abonos. Se activa pasando soloLecturaBodega desde src/App.js (hoy: rol
  // exactamente "Cliente").
  const soloLectura = !!soloLecturaBodega && !isAdmin;
  // Etapa 2 del despacho (revisar cantidades, poner precio/dcto y aprobar)
  // la hace Contabilidad. Se deja también el permiso "aprobarDespacho" por
  // compatibilidad, para no quitarle acceso a nadie que ya lo tuviera.
  const puedeAprobar = isAdmin || !!canAccessContabilidad || !!puedeAprobarDespacho;
  // Agregar/borrar abonos queda reservado a Administración o a quien tenga
  // acceso al módulo Contabilidad — el resto de usuarios de Bodega solo ve
  // el registro y el total, no puede editarlo.
  const puedeEditarAbonos = isAdmin || !!canAccessContabilidad;
  // Quién puede editar un despacho que ya existe: Administración siempre;
  // Bodega solo lo suyo (se valida por creadoPor en cada despacho); el resto
  // (Contabilidad) puede pedir el código de edición. Un usuario de solo
  // lectura NUNCA cae en "esBodegaSolo" (que filtra el historial a "solo lo
  // mío") — ve todo, como Contabilidad, pero sin ninguno de sus permisos de
  // edición (esContabilidad sigue en false para él).
  const esContabilidad = !isAdmin && puedeAprobar;
  const esBodegaSolo = !isAdmin && !esContabilidad && !soloLectura;
  const pendientesCount = despachos.filter((d) => d.estado === "montado").length;
  const NAV = [
    { id: "dashboard", icon: "◉", label: "Inicio" },
    // Montar Despacho no aplica para un usuario de solo lectura.
    ...(soloLectura ? [] : [{ id: "montar", icon: "📝", label: "Montar Despacho" }]),
    ...(puedeAprobar ? [{ id: "aprobar", icon: "✅", label: "Por Aprobar", badge: pendientesCount }] : []),
    { id: "historial", icon: "🕘", label: "Historial" },
    { id: "abonos", icon: "💵", label: "Abonos" },
    // Saldo Yuliana y Estado de Cuenta Kamila son cuentas propias de
    // Venezuela — no aplican en la pestaña Dubo, así que se ocultan ahí.
    ...(destino === "Dubo" ? [] : [{ id: "saldoYuliana", icon: "🧾", label: "Saldo Yuliana" }]),
    ...(destino !== "Dubo" && (isAdmin || puedeEditarAbonos || soloLectura) ? [{ id: "estadoCuentaKamila", icon: "📊", label: "Estado de Cuenta Kamila" }] : []),
    ...(isAdmin ? [{ id: "importar", icon: "⬆️", label: "Importar Histórico" }] : []),
    ...(isAdmin ? [{ id: "codigo", icon: "🔐", label: "Código Edición" }] : []),
  ];
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ color: C.slate }}>Cargando Bodega...</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ width: 220, background: C.ink, padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>📦 Bodega</div>
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>Despachos</div>
          <select
            value={destino}
            onChange={(e) => { setDestino(e.target.value); setSubView("dashboard"); }}
            style={{ marginTop: 8, width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(200,184,162,0.35)", background: "#2A2A45", color: C.white, fontSize: 12, fontWeight: 700, fontFamily: "inherit", outline: "none", cursor: "pointer" }}
          >
            {DESTINOS_BODEGA.map((d) => (
              <option key={d} value={d} style={{ color: C.ink }}>{d}</option>
            ))}
          </select>
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
                <span style={{ flex: 1 }}>{item.label}</span>
                {!!item.badge && (
                  <span style={{ background: C.red, color: C.white, borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{item.badge}</span>
                )}
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
          <h1 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 900, color: C.ink }}>
            {NAV.find((n) => n.id === subView)?.label || ""}
            {subView !== "estadoCuentaKamila" && <span style={{ fontSize: 13, fontWeight: 700, color: C.slate, marginLeft: 10 }}>· {destino}</span>}
          </h1>
          {subView === "dashboard" && <DashboardBodegaView despachos={despachos} abonos={abonos} />}
          {subView === "montar" && <MontarDespachoView despachos={despachos} currentUser={currentUser} coleccionDespachos={coleccionDespachos} destino={destino} onGuardado={() => setSubView("dashboard")} />}
          {subView === "aprobar" && puedeAprobar && <PorAprobarView despachos={despachos} currentUser={currentUser} puedeAprobar={puedeAprobar} coleccionDespachos={coleccionDespachos} destino={destino} />}
          {subView === "historial" && (
            <HistorialView
              despachos={despachos}
              currentUser={currentUser}
              isAdmin={isAdmin}
              esContabilidad={esContabilidad}
              esBodegaSolo={esBodegaSolo}
              pinEdicion={pinEdicion}
              onEliminar={eliminarDespacho}
              coleccionDespachos={coleccionDespachos}
            />
          )}
          {subView === "abonos" && <AbonosView abonos={abonos} currentUser={currentUser} puedeEditar={puedeEditarAbonos} coleccionAbonos={coleccionAbonos} />}
          {subView === "saldoYuliana" && (
            <SaldoYulianaView entradas={saldoYuliana} currentUser={currentUser} puedeEditar={puedeEditarAbonos} coleccionSaldoYuliana={coleccionSaldoYuliana} />
          )}
          {subView === "estadoCuentaKamila" && (isAdmin || puedeEditarAbonos || soloLectura) && <EstadoCuentaKamilaView data={estadoKamila} />}
          {subView === "importar" && isAdmin && (
            <ImportarHistoricoView
              currentUser={currentUser}
              despachosExistentes={despachos}
              abonosExistentes={abonos}
              coleccionDespachos={coleccionDespachos}
              coleccionAbonos={coleccionAbonos}
              destino={destino}
            />
          )}
          {subView === "codigo" && isAdmin && <CodigoEdicionView pinActual={pinEdicion} onGuardar={guardarPinEdicion} />}
        </div>
      </div>
    </div>
  );
}
