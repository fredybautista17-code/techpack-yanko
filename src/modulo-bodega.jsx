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
// Próximo número consecutivo de despacho: sigue la numeración real (el
// histórico importado llega hasta 546), nunca vuelve a empezar en 1.
function siguienteNumeroDespacho(despachos) {
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
    descripcion: "", marca: "", segmento: "", talla: "", precio: "", dcto: "0", barras: [],
    buscando: false, busintEncontrada: null,
  };
}
// ─── MONTAR DESPACHO (bodega) ──────────────────────────────────────────────
function LineaDespachoCard({ linea, index, onChange, onRemove, onBuscarBusint }) {
  const total = calcularTotalLinea(linea);
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 12, color: C.slate }}>LÍNEA {index + 1}</div>
        <span onClick={onRemove} style={{ cursor: "pointer", fontSize: 12, color: C.red, fontWeight: 700 }}>Quitar ✕</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr auto 1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
        <Field label="Referencia">
          <FInput value={linea.referencia} onChange={(v) => onChange({ ...linea, referencia: v, busintEncontrada: null })} placeholder="Ej. 98-872" />
        </Field>
        <div style={{ marginBottom: 14 }}>
          <Btn small variant="ghost" onClick={onBuscarBusint} disabled={!linea.referencia.trim() || linea.buscando}>
            {linea.buscando ? "Buscando..." : "🔍 Buscar en Busint"}
          </Btn>
        </div>
        <Field label="Cantidad">
          <FInput type="number" value={linea.cantidad} onChange={(v) => onChange({ ...linea, cantidad: v })} />
        </Field>
        <Field label="N° Traslado">
          <FInput value={linea.numTraslado} onChange={(v) => onChange({ ...linea, numTraslado: v })} />
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
        <Field label="Talla">
          <FSel value={linea.talla} onChange={(v) => onChange({ ...linea, talla: v })} options={TALLAS_BODEGA} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        <Field label="N° Bulto">
          <FInput value={linea.numBulto} onChange={(v) => onChange({ ...linea, numBulto: v })} placeholder="1/3" />
        </Field>
        <Field label="Precio">
          <FInput type="number" value={linea.precio} onChange={(v) => onChange({ ...linea, precio: v })} />
        </Field>
        <Field label="Dcto (por unidad)">
          <FInput type="number" value={linea.dcto} onChange={(v) => onChange({ ...linea, dcto: v })} />
        </Field>
        <Field label="Total">
          <div style={{ padding: "9px 12px", background: C.canvas, borderRadius: 8, fontWeight: 800, color: C.ink, fontSize: 14 }}>{fmtMoney(total)}</div>
        </Field>
      </div>
      {linea.barras && linea.barras.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Códigos de barra por talla (Busint)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {linea.barras.map((b, i) => (
              <div key={i} style={{ padding: "4px 10px", background: C.blueBg, borderRadius: 6, fontSize: 11, color: C.blue }}>
                <strong>{b.talla || "—"}</strong> {b.cbarraI || b.cbarraE || b.cbarraM || "sin código"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function MontarDespachoView({ despachos, currentUser, onGuardado }) {
  const [numControl, setNumControl] = useState("");
  const [fecha, setFecha] = useState(today());
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [guardando, setGuardando] = useState(false);
  const numeroSiguiente = useMemo(() => siguienteNumeroDespacho(despachos), [despachos]);
  const totalDespacho = lineas.reduce((s, l) => s + calcularTotalLinea(l), 0);

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
        talla: (l.talla || "").trim(),
        precio: Number(l.precio) || 0,
        dcto: Number(l.dcto) || 0,
        total: calcularTotalLinea(l),
        barras: l.barras || [],
      }));
      await fsSave("despachosVenezuela", id, {
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
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase" }}>Total del despacho</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.ink }}>{fmtMoney(totalDespacho)}</div>
        </div>
        <Btn onClick={guardarDespacho} disabled={!puedeGuardar}>{guardando ? "Guardando..." : "Montar Despacho"}</Btn>
      </div>
    </div>
  );
}
// Exporta UN despacho a Excel con el mismo formato visual de las hojas
// "DESPACHO N" del archivo original: bloque N CONTROL/FECHA/DESPACHO arriba,
// tabla REF/CANTIDAD/N TRASLADO/N CORTE/N BULTO/DESCRIPCION/MARCA/SEGMENTO/
// PRECIO/DCTO/TOTAL DCTTO/TOTAL, con una columna de código de barra por cada
// talla que tenga la referencia (unión de tallas de todas las líneas), y la
// fila de totales al final — igual a como venía en el Excel de Busint.
async function exportarDespachoExcel(despacho) {
  const XLSX = await import("xlsx");
  const lineas = despacho.lineas || [];
  const tallas = [];
  lineas.forEach((l) => (l.barras || []).forEach((b) => { if (b.talla && !tallas.includes(b.talla)) tallas.push(b.talla); }));

  const encabezado = [
    ["   ", null, null, null, null, null, null, null, null, null, null, null, ...tallas.map(() => null)],
    [null, "N CONTROL", despacho.numControl || "", "FECHA", despacho.fecha ? fmtFechaISO(despacho.fecha) : "", null, "DESPACHO", despacho.numero],
    [null, "REF", "CANTIDAD", "N° TRASLADO", "N° DE CORTE", "N° DE BULTO COMO VIENE MARCADOS", "DESCRIPCION", "MARCA", "SEGMENTO", "PRECIO", "DCTO", "TOTAL DCTTO", "TOTAL", ...tallas],
  ];
  const filas = lineas.map((l) => {
    const totalDcto = (Number(l.precio) || 0) - (Number(l.dcto) || 0);
    const barrasPorTalla = tallas.map((t) => {
      const b = (l.barras || []).find((x) => x.talla === t);
      return b ? b.cbarraI || b.cbarraE || b.cbarraM || "" : "";
    });
    return [
      null, l.referencia || "", l.cantidad || 0, l.numTraslado || "", l.numCorte || "", l.numBulto || "",
      l.descripcion || "", l.marca || "", l.segmento || "", l.precio || 0, l.dcto || 0, totalDcto, l.total || 0,
      ...barrasPorTalla,
    ];
  });
  const totalUnd = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const totalGeneral = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const filaTotales = [null, "TOTAL UND", totalUnd, null, "TOTAL BTS", new Set(lineas.map((l) => l.numBulto)).size, null, null, null, null, null, "TOTAL", totalGeneral];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filas, [], filaTotales]);
  XLSX.utils.book_append_sheet(wb, ws, `DESPACHO ${despacho.numero}`.slice(0, 31));
  XLSX.writeFile(wb, `DESPACHO ${despacho.numero}.xlsx`);
}
// ─── DETALLE DE UN DESPACHO (compartido: Por Aprobar / Historial) ──────────
function DetalleDespachoModal({ despacho, onClose, onAprobar, puedeAprobar }) {
  return (
    <Modal title={`Despacho #${despacho.numero}`} onClose={onClose} width={860}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18, fontSize: 12 }}>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>N Control</div><div>{despacho.numControl || "—"}</div></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Fecha</div><div>{fmtFechaISO(despacho.fecha)}</div></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Estado</div><EstadoBadge estado={despacho.estado} /></div>
        <div><div style={{ color: C.slate, fontWeight: 700 }}>Total</div><div style={{ fontWeight: 800 }}>{fmtMoney(despacho.totalDespacho)}</div></div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Btn variant="secondary" small onClick={() => exportarDespachoExcel(despacho)}>⬇ Exportar a Excel</Btn>
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
        {despacho.estado === "aprobado" && <> · Aprobado por {despacho.aprobadoPor || "—"} · {fmtFechaHora(despacho.aprobadoEn)}</>}
      </div>
      {puedeAprobar && despacho.estado === "montado" && (
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="success" onClick={() => onAprobar(despacho)}>✓ Aprobar Despacho</Btn>
        </div>
      )}
    </Modal>
  );
}
// ─── POR APROBAR (admin / permiso aprobar_despacho) ────────────────────────
function PorAprobarView({ despachos, currentUser, puedeAprobar }) {
  const [abierto, setAbierto] = useState(null);
  const pendientes = despachos.filter((d) => d.estado === "montado").sort((a, b) => a.numero - b.numero);
  async function aprobar(d) {
    await fsSave("despachosVenezuela", d.id, {
      estado: "aprobado",
      aprobadoPor: currentUser?.name || currentUser?.username || "",
      aprobadoEn: new Date().toISOString(),
    });
    setAbierto(null);
  }
  return (
    <div>
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
      {abierto && (
        <DetalleDespachoModal despacho={abierto} onClose={() => setAbierto(null)} onAprobar={aprobar} puedeAprobar={puedeAprobar} />
      )}
    </div>
  );
}
// ─── HISTORIAL (aprobados + importados) ────────────────────────────────────
function HistorialView({ despachos }) {
  const [abierto, setAbierto] = useState(null);
  const [filtro, setFiltro] = useState("");
  const visibles = despachos
    .filter((d) => d.estado === "aprobado" || d.estado === "historico")
    .filter((d) => !filtro.trim() || String(d.numero).includes(filtro.trim()) || (d.lineas || []).some((l) => (l.referencia || "").toUpperCase().includes(filtro.trim().toUpperCase())))
    .sort((a, b) => b.numero - a.numero);
  const totalGeneral = visibles.reduce((s, d) => s + (d.totalDespacho || 0), 0);
  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ flex: 1, maxWidth: 320 }}>
          <FInput value={filtro} onChange={setFiltro} placeholder="Buscar por N° despacho o referencia..." />
        </div>
        <div style={{ fontSize: 12, color: C.slate }}>{visibles.length} despachos · {fmtMoney(totalGeneral)}</div>
      </div>
      <Tabla
        vacio="Sin despachos en el historial."
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
      {abierto && <DetalleDespachoModal despacho={abierto} onClose={() => setAbierto(null)} puedeAprobar={false} />}
    </div>
  );
}
// ─── ABONOS (ledger simple) ─────────────────────────────────────────────────
function AbonosView({ abonos, currentUser, puedeEditar }) {
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
      await fsSave("abonosVenezuela", id, {
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
    await fsDelete("abonosVenezuela", a.id);
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
    const windowEnd = nextSameRow.length ? Math.min(...nextSameRow) : Math.min(hc + 14, headerRow.length);
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
// Convierte un texto tipo fecha (normal o roto, ver pareceFechaTexto) a un
// objeto Date real. IMPORTANTE: el resto del importador siempre espera un
// Date de verdad (hace `new Date(fecha).toISOString()` mas abajo) - dejar la
// fecha como texto plano hacia que esa conversion lanzara "Invalid time
// value" sin capturar en ningun lado, cortando el analisis completo en
// silencio (sin mostrar error ni resultado). Por eso se parsea aqui mismo,
// nunca se deja un string suelto en el campo fecha.
// Completa un año escrito corto/truncado a 4 digitos. 2 digitos (ej. "23")
// asume 2000+; 3 digitos (ej. "025", visto en Despacho 452 "21/07/025", le
// falto el "2" de adelante) asume 2000+ tambien, no 1900+ como haria el
// constructor Date con un numero de 2 digitos.
function completarAnio(yRaw) {
  if (yRaw.length === 4) return yRaw;
  if (yRaw.length === 3) return "2" + yRaw;
  if (yRaw.length === 2) return "20" + yRaw;
  return yRaw;
}
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
        const num = Number(row[5]);
        const desp = row[7];
        if (!isNaN(num) && desp !== null && desp !== undefined) resumen[num] = Number(desp);
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
    const m = name.match(/(\d+)/);
    if (!m) return;
    const numero = parseInt(m[1], 10);
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
async function importarADespachosFirestore(despachos, abonos, currentUser) {
  const CHUNK = 400;
  for (let i = 0; i < despachos.length; i += CHUNK) {
    const batch = writeBatch(db);
    despachos.slice(i, i + CHUNK).forEach((d) => {
      batch.set(doc(db, "despachosVenezuela", d.id), { ...d, importadoPor: currentUser?.name || currentUser?.username || "" }, { merge: true });
    });
    await batch.commit();
  }
  for (let i = 0; i < abonos.length; i += CHUNK) {
    const batch = writeBatch(db);
    abonos.slice(i, i + CHUNK).forEach((a) => {
      batch.set(doc(db, "abonosVenezuela", a.id), { ...a, importadoPor: currentUser?.name || currentUser?.username || "" }, { merge: true });
    });
    await batch.commit();
  }
}
function ImportarHistoricoView({ currentUser, despachosExistentes }) {
  const [analizando, setAnalizando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [importando, setImportando] = useState(false);
  const [importado, setImportado] = useState(false);
  const [error, setError] = useState(null);
  const yaImportado = despachosExistentes.some((d) => d.estado === "historico");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalizando(true);
    setResultado(null);
    setImportado(false);
    setError(null);
    try {
      const r = await parseDespachosVenezuelaExcel(file);
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
      await importarADespachosFirestore(resultado.despachos, resultado.abonos, currentUser);
      setImportado(true);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setImportando(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 16, lineHeight: 1.6 }}>
        Sube el archivo <strong>DESPACHOS KAMILA VENEZUELA.xlsx</strong>. Se analiza primero (sin guardar nada) para que revises el resultado antes de confirmar. Es seguro volver a correrlo — actualiza los mismos registros en vez de duplicarlos.
        <br />
        Los abonos se toman tanto de <strong>dentro de cada hoja DESPACHO 2 a 546</strong> como de las <strong>10 hojas sueltas de depósitos</strong> (ABONO PANELES, DEPOSITOS JULIO/AGOSTO/SEP/OCT/NOV, DUBO, DEPOSITOS CUENTA YULIANA M-J, DICIEMBRE, ENERO).
      </div>
      {yaImportado && (
        <div style={{ padding: "10px 14px", background: C.amberBg, color: C.amber, borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
          Ya hay despachos históricos importados. Volver a subir el archivo actualiza esos mismos registros.
        </div>
      )}
      <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={analizando} style={{ marginBottom: 16 }} />
      {analizando && <div style={{ color: C.slate, fontSize: 13 }}>Analizando archivo (546 hojas)... puede tardar un momento.</div>}
      {error && (
        <div style={{ padding: "10px 14px", background: C.redBg, color: C.red, borderRadius: 8, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
          Error al procesar el archivo: {error}
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
// ─── RAÍZ DEL MÓDULO ────────────────────────────────────────────────────────
export default function ModuloBodega({ currentUser, puedeAprobarDespacho, canAccessContabilidad, onVolver, onLogout }) {
  const [subView, setSubView] = useState("dashboard");
  const [despachos, setDespachos] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubDespachos = onSnapshot(collection(db, "despachosVenezuela"), (snap) => {
      setDespachos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    const unsubAbonos = onSnapshot(collection(db, "abonosVenezuela"), (snap) => {
      setAbonos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => {
      unsubDespachos();
      unsubAbonos();
    };
  }, []);
  const isAdmin = !!currentUser?.isAdmin;
  const puedeAprobar = isAdmin || !!puedeAprobarDespacho;
  // Agregar/borrar abonos queda reservado a Administración o a quien tenga
  // acceso al módulo Contabilidad — el resto de usuarios de Bodega solo ve
  // el registro y el total, no puede editarlo.
  const puedeEditarAbonos = isAdmin || !!canAccessContabilidad;
  const pendientesCount = despachos.filter((d) => d.estado === "montado").length;
  const NAV = [
    { id: "dashboard", icon: "◉", label: "Inicio" },
    { id: "montar", icon: "📝", label: "Montar Despacho" },
    ...(puedeAprobar ? [{ id: "aprobar", icon: "✅", label: "Por Aprobar", badge: pendientesCount }] : []),
    { id: "historial", icon: "🕘", label: "Historial" },
    { id: "abonos", icon: "💵", label: "Abonos" },
    ...(isAdmin ? [{ id: "importar", icon: "⬆️", label: "Importar Histórico" }] : []),
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
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>Despachos Venezuela</div>
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
          </h1>
          {subView === "dashboard" && <DashboardBodegaView despachos={despachos} abonos={abonos} />}
          {subView === "montar" && <MontarDespachoView despachos={despachos} currentUser={currentUser} onGuardado={() => setSubView("dashboard")} />}
          {subView === "aprobar" && puedeAprobar && <PorAprobarView despachos={despachos} currentUser={currentUser} puedeAprobar={puedeAprobar} />}
          {subView === "historial" && <HistorialView despachos={despachos} />}
          {subView === "abonos" && <AbonosView abonos={abonos} currentUser={currentUser} puedeEditar={puedeEditarAbonos} />}
          {subView === "importar" && isAdmin && <ImportarHistoricoView currentUser={currentUser} despachosExistentes={despachos} />}
        </div>
      </div>
    </div>
  );
}
