import { useState, useEffect, useMemo, useRef } from "react";
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
// Normaliza el nombre de un proceso para comparar (mismo criterio en todas
// partes: la búsqueda del costo teórico por proceso, el catálogo cargado
// desde Busint, etc.) — sin importar mayúsculas ni espacios de más.
function normalizarProceso(s) {
  return (s || "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}
// Igual que normalizarProceso, pero para comparar códigos de referencia (p.ej.
// al buscar Referencia+Proceso dentro de la tabla de Costos Teóricos, sin
// depender de un Lote exacto) — quita espacios sueltos y mayúsculas.
function normalizarRefComparacion(s) {
  return (s || "").toString().trim().toUpperCase().replace(/\s+/g, "");
}
function fmtFechaHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const fecha = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fecha} ${hora}`;
}
function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
// Quincena colombiana: 1–15 y 16–fin de mes (el fin varía: 28, 29, 30 o 31
// según el mes — "se deben incluir los 31 de cada mes si hay", pidió el
// usuario). offset=0 es la quincena en la que cae hoy; offset negativo/
// positivo mueve hacia atrás/adelante de a media quincena.
function quincenaDe(offset) {
  const hoy = new Date();
  let year = hoy.getFullYear();
  let month = hoy.getMonth();
  let mitad = hoy.getDate() <= 15 ? 1 : 2;
  let pasos = offset;
  while (pasos > 0) {
    if (mitad === 1) { mitad = 2; } else { mitad = 1; month += 1; if (month > 11) { month = 0; year += 1; } }
    pasos--;
  }
  while (pasos < 0) {
    if (mitad === 2) { mitad = 1; } else { mitad = 2; month -= 1; if (month < 0) { month = 11; year -= 1; } }
    pasos++;
  }
  const ultimoDiaMes = new Date(year, month + 1, 0).getDate();
  const diaInicio = mitad === 1 ? 1 : 16;
  const diaFin = mitad === 1 ? 15 : ultimoDiaMes;
  const pad = (n) => String(n).padStart(2, "0");
  const desde = `${year}-${pad(month + 1)}-${pad(diaInicio)}`;
  const hasta = `${year}-${pad(month + 1)}-${pad(diaFin)}`;
  const label = `${diaInicio}–${diaFin} ${MONTHS_SHORT[month]} ${year}`;
  return { desde, hasta, year, month, mitad, label };
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
function FSel({ value, onChange, options, placeholder = "Seleccionar..." }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
    >
      <option value="">{placeholder}</option>
      {(options || []).map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
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
              key={f.id ?? i}
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
// ─── TRABAJADORES ───────────────────────────────────────────────────────────
// Maestro simple: nombre + tarifa por hora (usada para calcular las "Horas
// Sueltas") + activo/inactivo (un trabajador inactivo no aparece en los
// selects de los formularios de registro, pero su historial queda intacto).
// Áreas de Nómina: hoy solo hay dos líderes con equipo propio (Terminación →
// Anny Beltrán, Termofijación → Sarai Méndez); "Sin asignar" cubre todo lo
// demás mientras no se necesite otra área. Es la misma etiqueta que se usa
// para filtrarle a cada líder únicamente su gente al iniciar sesión.
const AREAS_NOMINA = ["Terminación", "Termofijación", "Sin asignar"];
function TrabajadorModal({ trabajador, onSave, onClose }) {
  const [form, setForm] = useState({
    nombre: trabajador?.nombre || "",
    cedula: trabajador?.cedula || "",
    tarifaHora: trabajador?.tarifaHora ?? "",
    activo: trabajador?.activo ?? true,
    area: trabajador?.area || "Sin asignar",
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({ nombre: form.nombre.trim(), cedula: form.cedula.trim(), tarifaHora: Number(form.tarifaHora) || 0, activo: !!form.activo, area: form.area || "Sin asignar" });
    onClose();
  }
  return (
    <Modal title={trabajador ? "Editar Trabajador" : "Nuevo Trabajador"} onClose={onClose} width={440}>
      <Field label="Nombre"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Carlos Javier González" /></Field>
      <Field label="Cédula"><FInput value={form.cedula} onChange={set("cedula")} placeholder="Ej: 1004802413" /></Field>
      <Field label="Área"><FSel value={form.area} onChange={set("area")} options={AREAS_NOMINA} placeholder="Sin asignar" /></Field>
      <Field label="Tarifa por hora (para tareas sueltas)"><FInput type="number" value={form.tarifaHora} onChange={set("tarifaHora")} /></Field>
      {trabajador && (
        <Field label="Estado">
          <div style={{ display: "flex", gap: 6 }}>
            {[[true, "Activo"], [false, "Inactivo"]].map(([v, label]) => (
              <button key={label} type="button" onClick={() => set("activo")(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${form.activo === v ? C.green : C.border}`, background: form.activo === v ? C.greenBg : C.white, color: form.activo === v ? C.green : C.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        </Field>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function TrabajadoresView({ trabajadores, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | trabajador
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenados = [...trabajadores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <div>
      {modal && (
        <TrabajadorModal
          trabajador={modal === "nuevo" ? null : modal}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>¿Eliminar a <strong>{confirmDel.nombre}</strong>? Su historial de producción/horas ya registrado no se borra.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
          </div>
        </Modal>
      )}
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <Btn onClick={() => setModal("nuevo")}>+ Nuevo Trabajador</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin trabajadores registrados."
        columnas={[
          { key: "nombre", label: "Nombre" },
          { key: "cedula", label: "Cédula", render: (f) => f.cedula || "—" },
          { key: "area", label: "Área", render: (f) => f.area || "Sin asignar" },
          { key: "tarifaHora", label: "Tarifa/Hora", align: "right", render: (f) => fmtMoney(f.tarifaHora) },
          { key: "activo", label: "Estado", render: (f) => (
            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: f.activo ? C.greenBg : C.redBg, color: f.activo ? C.green : C.red }}>
              {f.activo ? "ACTIVO" : "INACTIVO"}
            </span>
          ) },
          ...(isAdmin ? [{
            key: "acciones", label: "", align: "right",
            render: (f) => (
              <span style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <span onClick={(e) => { e.stopPropagation(); setModal(f); }} style={{ cursor: "pointer", color: C.blue, fontWeight: 700 }}>Editar</span>
                <span onClick={(e) => { e.stopPropagation(); setConfirmDel(f); }} style={{ cursor: "pointer", color: C.red, fontWeight: 700 }}>Borrar</span>
              </span>
            ),
          }] : []),
        ]}
        filas={ordenados}
      />
    </div>
  );
}
// ─── PROCESOS (maestro de nombres, sin precio) ─────────────────────────────
// (2026-08-22) Antes esto tenía un "Precio por Unidad" fijo por proceso —
// pidió el usuario quitarlo: el precio ya no lo fija un admin de antemano,
// lo escribe la líder (Anny/Sarai) como "precio real" en cada registro de
// Registrar Producción, topado siempre contra el costo teórico (costoFT) de
// Busint. Esto queda solo como el maestro de NOMBRES de proceso — sigue
// siendo lista abierta que mantiene un admin (no hay catálogo de procesos en
// Busint del que traerlo automático), para que Anny/Sarai elijan de una
// lista y no queden nombres distintos escritos de mil formas.
function ProcesoModal({ proceso, onSave, onClose }) {
  const [form, setForm] = useState({ proceso: proceso?.proceso || "", costoTeorico: proceso?.costoTeorico ?? "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.proceso.trim()) return;
    onSave({ proceso: form.proceso.trim(), costoTeorico: Number(form.costoTeorico) || 0 });
    onClose();
  }
  return (
    <Modal title={proceso ? "Editar Proceso" : "Nuevo Proceso"} onClose={onClose} width={420}>
      <Field label="Nombre del Proceso"><FInput value={form.proceso} onChange={set("proceso")} placeholder="Ej: TERMINACION, BAJADA DE VINILO" /></Field>
      <Field label="Costo Teórico/Und (opcional)">
        <FInput type="number" value={form.costoTeorico} onChange={set("costoTeorico")} placeholder="Tope general para este proceso" />
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Se usa como tope solo cuando no hay un costo más específico (por Lote+Proceso o por la Referencia de Busint) para ese registro.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.proceso.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
// Trae de Busint los nombres de proceso reales (proceso1..15 de cada lote,
// no hay una tabla de catálogo como tal) para que el admin elija de una
// lista en vez de escribir a mano y arriesgarse a que no coincida con lo que
// trae Busint. Ya vienen pre-marcados los que todavía no están en el
// catálogo de Nómina (comparando sin importar mayúsculas/tildes).
function CargarProcesosBusintModal({ existentes, onAgregar, onClose }) {
  const [cargando, setCargando] = useState(true);
  const [procesos, setProcesos] = useState([]);
  const [error, setError] = useState("");
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [guardando, setGuardando] = useState(false);
  const existentesNorm = new Set(existentes.map((p) => p.proceso.trim().toUpperCase()));
  useEffect(() => {
    (async () => {
      try {
        const llamar = httpsCallable(functionsClient, "getProcesosDistintosBusint");
        const resp = await llamar({});
        const lista = resp.data?.procesos || [];
        setProcesos(lista);
        setSeleccion(new Set(lista.filter((p) => !existentesNorm.has(p.nombre.trim().toUpperCase())).map((p) => p.nombre)));
      } catch (err) {
        setError(err?.message || String(err));
      } finally {
        setCargando(false);
      }
    })();
  }, []);
  function toggle(nombre) {
    setSeleccion((s) => {
      const next = new Set(s);
      if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
      return next;
    });
  }
  async function agregar() {
    setGuardando(true);
    try {
      const nuevos = [...seleccion].filter((n) => !existentesNorm.has(n.trim().toUpperCase()));
      for (const nombre of nuevos) {
        await onAgregar({ id: uid(), proceso: nombre.trim() });
      }
      onClose();
    } finally {
      setGuardando(false);
    }
  }
  return (
    <Modal title="Cargar procesos desde Busint" onClose={onClose} width={520}>
      {cargando && <div style={{ fontSize: 13, color: C.slate }}>Consultando Busint...</div>}
      {error && <div style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>No se pudo consultar: {error}</div>}
      {!cargando && !error && (
        <>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 12 }}>
            {procesos.length} nombres distintos encontrados en los lotes de Busint. Ya vienen marcados los que no tienes todavía — desmarca los que no quieras agregar.
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            {procesos.map((p) => {
              const yaExiste = existentesNorm.has(p.nombre.trim().toUpperCase());
              return (
                <label key={p.nombre} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 13, cursor: yaExiste ? "default" : "pointer", opacity: yaExiste ? 0.5 : 1 }}>
                  <input type="checkbox" checked={seleccion.has(p.nombre)} disabled={yaExiste} onChange={() => toggle(p.nombre)} />
                  <span style={{ flex: 1 }}>{p.nombre}{yaExiste && <span style={{ color: C.green, fontWeight: 700 }}> (ya está)</span>}</span>
                  <span style={{ color: C.slate, fontSize: 11 }}>{fmtNum(p.cantidad)} lotes</span>
                </label>
              );
            })}
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={agregar} disabled={cargando || guardando || seleccion.size === 0}>{guardando ? "Agregando..." : `Agregar seleccionados (${seleccion.size})`}</Btn>
      </div>
    </Modal>
  );
}
function PreciosProcesoView({ precios, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [modalBusint, setModalBusint] = useState(false);
  const ordenados = [...precios].sort((a, b) => a.proceso.localeCompare(b.proceso));
  return (
    <div>
      {modal && (
        <ProcesoModal
          proceso={modal === "nuevo" ? null : modal}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {modalBusint && (
        <CargarProcesosBusintModal existentes={precios} onAgregar={onSave} onClose={() => setModalBusint(false)} />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>¿Eliminar el proceso <strong>{confirmDel.proceso}</strong>? Los registros de producción ya guardados con este proceso no se borran.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
          </div>
        </Modal>
      )}
      {isAdmin && (
        <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
          <Btn onClick={() => setModal("nuevo")}>+ Nuevo Proceso</Btn>
          <Btn variant="secondary" onClick={() => setModalBusint(true)}>🔄 Cargar desde Busint</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin procesos registrados."
        columnas={[
          { key: "proceso", label: "Proceso" },
          { key: "costoTeorico", label: "Costo Teórico/Und", align: "right", render: (f) => (Number(f.costoTeorico) > 0 ? fmtMoney(f.costoTeorico) : "—") },
          ...(isAdmin ? [{
            key: "acciones", label: "", align: "right",
            render: (f) => (
              <span style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <span onClick={(e) => { e.stopPropagation(); setModal(f); }} style={{ cursor: "pointer", color: C.blue, fontWeight: 700 }}>Editar</span>
                <span onClick={(e) => { e.stopPropagation(); setConfirmDel(f); }} style={{ cursor: "pointer", color: C.red, fontWeight: 700 }}>Borrar</span>
              </span>
            ),
          }] : []),
        ]}
        filas={ordenados}
      />
    </div>
  );
}
// ─── COSTOS TEÓRICOS POR PROCESO (cargados desde Excel de Busint) ─────────
// El costoFT de la ficha técnica (Busint) es UN solo valor por referencia —
// no distingue procesos. El usuario encontró que Busint sí tiene, por
// LOTE+PROCESO, un costo teórico real (columna "CostoFT" del reporte de
// movimientos/entradas de planta), distinto del costo pagado ("Costo") en
// algunos casos. No hay una API en vivo para esto (ya se revisó a fondo),
// así que se sube el Excel del reporte a mano cada tanto — cada fila se
// guarda con id "{numLote}_{PROCESO}" (upsert), así volver a subir el mismo
// archivo (o uno más reciente que repita lotes) simplemente actualiza el
// valor en vez de duplicar. En Registrar Producción, si existe un match
// exacto lote+proceso acá, ese costo teórico manda sobre el costoFT de la
// referencia (es más específico).
function parseExcelCostosTeoricoProceso(rows) {
  // Los encabezados del archivo son "Entrada, fecha, Codplanta, Nombre,
  // NumLote, Ref, RefExt, Costo, Total, Valortotal, CostoFT, CostoFt Total,
  // Proceso, nfact" — se busca por nombre normalizado (sin espacios,
  // minúsculas) para no depender del orden ni de mayúsculas exactas.
  function col(row, ...nombres) {
    const keys = Object.keys(row);
    for (const nombre of nombres) {
      const norm = nombre.toLowerCase().replace(/[^a-z0-9]/g, "");
      const k = keys.find((kk) => kk.toLowerCase().replace(/[^a-z0-9]/g, "") === norm);
      if (k !== undefined) return row[k];
    }
    return undefined;
  }
  const out = [];
  for (const r of rows) {
    const numLote = Number(col(r, "NumLote"));
    const proceso = String(col(r, "Proceso") || "").trim();
    if (!numLote || !proceso) continue;
    const costoFT = Number(col(r, "CostoFT")) || 0;
    out.push({
      numLote,
      proceso,
      costoFT,
      costo: Number(col(r, "Costo")) || 0,
      total: Number(col(r, "Total")) || 0,
      valorTotal: Number(col(r, "Valortotal", "Valor Total")) || 0,
      costoFtTotal: Number(col(r, "CostoFt Total", "CostoFTTotal")) || 0,
      planta: String(col(r, "Nombre") || "").trim(),
      fecha: (() => {
        const f = col(r, "fecha");
        if (!f) return "";
        if (f instanceof Date) return f.toISOString().slice(0, 10);
        return String(f).slice(0, 10);
      })(),
      nfact: String(col(r, "nfact") || "").trim(),
      ref: String(col(r, "Ref") || "").trim(),
    });
  }
  return out;
}
function CargarCostosTeoricoProcesoModal({ onGuardar, onClose }) {
  const fileRef = useRef(null);
  const [filas, setFilas] = useState(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFilas(null);
    setNombreArchivo(file.name);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      // cellDates:true — sin esto, la columna "fecha" llega como número de
      // serie de Excel (ej. 46255) en vez de una fecha real, y se mostraba
      // "undefined/undefined/46255" en la tabla en vez del día real.
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const parsed = parseExcelCostosTeoricoProceso(rows);
      if (!parsed.length) { setError("No se encontraron filas válidas (revisa que tenga las columnas NumLote y Proceso)."); return; }
      setFilas(parsed);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }
  async function confirmar() {
    if (!filas?.length) return;
    setGuardando(true);
    try {
      await onGuardar(filas, nombreArchivo);
      onClose();
    } finally {
      setGuardando(false);
    }
  }
  const lotesDistintos = filas ? new Set(filas.map((f) => f.numLote)).size : 0;
  const procesosDistintos = filas ? new Set(filas.map((f) => normalizarProceso(f.proceso))).size : 0;
  return (
    <Modal title="Cargar Costos Teóricos por Proceso (Excel)" onClose={onClose} width={560}>
      <div onClick={() => fileRef.current.click()} style={{ border: `2px dashed ${C.blue}`, borderRadius: 12, padding: 28, textAlign: "center", cursor: "pointer", background: C.blueBg, marginBottom: 16 }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>📂</div>
        <div style={{ fontWeight: 700, color: C.ink }}>{nombreArchivo || "Subir Excel (.xlsx)"}</div>
        <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>Columnas esperadas: NumLote, Proceso, Costo, CostoFT...</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
      </div>
      {error && <div style={{ padding: "10px 14px", background: C.redBg, borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚠ {error}</div>}
      {filas && !error && (
        <div style={{ padding: "12px 16px", background: C.greenBg, borderRadius: 8, marginBottom: 16, fontSize: 13, color: C.green, fontWeight: 600 }}>
          ✓ {filas.length} filas encontradas — {lotesDistintos} lotes distintos, {procesosDistintos} procesos distintos. Se van a guardar (o actualizar si ya existían) por lote+proceso.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={confirmar} disabled={!filas?.length || guardando}>{guardando ? "Guardando..." : `Guardar ${filas?.length || ""} filas`}</Btn>
      </div>
    </Modal>
  );
}
function CostosTeoricoProcesoView({ costos, isAdmin, onGuardarLote, onBorrarTodo }) {
  const [modal, setModal] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [confirmVaciar, setConfirmVaciar] = useState(false);
  const filtrados = busqueda.trim()
    ? costos.filter((c) => String(c.numLote).includes(busqueda.trim()) || normalizarProceso(c.proceso).includes(normalizarProceso(busqueda)))
    : costos;
  const ordenados = [...filtrados].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || b.numLote - a.numLote);
  return (
    <div>
      {modal && <CargarCostosTeoricoProcesoModal onGuardar={onGuardarLote} onClose={() => setModal(false)} />}
      {confirmVaciar && (
        <Modal title="Vaciar Costos Teóricos por Proceso" onClose={() => setConfirmVaciar(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>¿Borrar TODOS los {costos.length} registros cargados? Los registros de producción ya guardados no se ven afectados — esto solo borra la tabla de referencia usada para el tope de precio.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmVaciar(false)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => { onBorrarTodo(); setConfirmVaciar(false); }}>Sí, vaciar todo</Btn>
          </div>
        </Modal>
      )}
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 720 }}>
        Costo teórico por LOTE + PROCESO, cargado desde el reporte de Busint (no hay una API en vivo para esto todavía). En "Registrar Producción", si el lote+proceso está acá, este costo manda sobre el costo teórico general de la referencia.
      </div>
      {isAdmin && (
        <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <Btn onClick={() => setModal(true)}>📥 Cargar Excel</Btn>
          {costos.length > 0 && <Btn variant="danger" onClick={() => setConfirmVaciar(true)}>Vaciar todo</Btn>}
          <div style={{ marginLeft: "auto", width: 220 }}>
            <FInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por lote o proceso..." />
          </div>
        </div>
      )}
      <Tabla
        vacio="Sin costos teóricos por proceso cargados todavía."
        columnas={[
          { key: "numLote", label: "Lote" },
          { key: "proceso", label: "Proceso" },
          { key: "costo", label: "Costo Real/Und", align: "right", render: (f) => fmtMoney(f.costo) },
          { key: "costoFT", label: "Costo Teórico/Und", align: "right", render: (f) => fmtMoney(f.costoFT) },
          { key: "diferencia", label: "Diferencia", align: "right", render: (f) => { const d = (f.costo || 0) - (f.costoFT || 0); return <span style={{ color: d > 0 ? C.red : d < 0 ? C.green : C.slate, fontWeight: 700 }}>{fmtMoney(d)}</span>; } },
          { key: "planta", label: "Planta" },
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
        ]}
        filas={ordenados}
      />
    </div>
  );
}
// ─── REGISTRAR PRODUCCIÓN (pago por pieza / proceso) ───────────────────────
function RegistrarProduccionView({ trabajadores, precios, produccion, produccionCompleta, costosTeoricoProceso, currentUser, onGuardar, onBorrar, isAdmin }) {
  const [trabajadorId, setTrabajadorId] = useState("");
  const [fecha, setFecha] = useState(today());
  const [proceso, setProceso] = useState("");
  const [referencia, setReferencia] = useState("");
  const [cantidad, setCantidad] = useState("");
  // (2026-08-22) Ya no hay un precio fijo por proceso configurado por un
  // admin — la líder (Anny/Sarai) escribe el precio real que se está
  // pagando en ESTE registro puntual, y el sistema solo valida que no
  // supere el costo teórico de Busint. Pidió el usuario quitar la tabla fija
  // de precios porque no refleja lo que de verdad se negocia caso a caso.
  const [precioReal, setPrecioReal] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Costo teórico de confección de la referencia (costoFT en Busint) — se
  // usa como tope: el precio/unidad configurado para el proceso nunca puede
  // superarlo. Se busca a mano con el botón (no automático al escribir) para
  // no golpear la función de Busint en cada tecla.
  const [costoTeorico, setCostoTeorico] = useState(null);
  const [buscandoCosto, setBuscandoCosto] = useState(false);
  // Búsqueda por N° de Lote (Busint → Panel de Flujo Operacional): en vez de
  // escribir la referencia a mano, buscan el lote y les trae de una vez
  // pedido, cliente, cantidad cortada, referencia y costo teórico — así lo
  // pidió el usuario con el ejemplo del lote 7150.
  const [numLote, setNumLote] = useState("");
  const [loteInfo, setLoteInfo] = useState(null);
  const [buscandoLote, setBuscandoLote] = useState(false);
  async function buscarLote() {
    const n = numLote.trim();
    if (!n) return;
    setBuscandoLote(true);
    setLoteInfo(null);
    setCostoTeorico(null);
    try {
      const llamar = httpsCallable(functionsClient, "getLoteBusintPorNumero");
      const resp = await llamar({ numLote: n });
      setLoteInfo(resp.data);
      if (resp.data?.encontrada) {
        setReferencia(resp.data.referencia || "");
        setCostoTeorico({
          encontrada: resp.data.costoFT != null,
          costoFT: resp.data.costoFT,
          _ref: resp.data.referencia || "",
        });
      }
    } catch (err) {
      setLoteInfo({ error: err?.message || String(err) });
    } finally {
      setBuscandoLote(false);
    }
  }
  async function buscarCostoTeorico() {
    const ref = referencia.trim();
    if (!ref) return;
    setBuscandoCosto(true);
    setCostoTeorico(null);
    try {
      const llamar = httpsCallable(functionsClient, "getCostoTeoricoReferenciaBusint");
      const resp = await llamar({ ref });
      setCostoTeorico({ ...resp.data, _ref: ref });
    } catch (err) {
      setCostoTeorico({ error: err?.message || String(err) });
    } finally {
      setBuscandoCosto(false);
    }
  }
  // (2026-08-25) Apenas quede cargada la referencia (a mano o por búsqueda de
  // lote), se busca el costo teórico solo — ya no hay que darle clic aparte
  // al botón "🔍 Costo". Sigue sin ser INMEDIATO tecla por tecla (para no
  // golpear la función de Busint mientras se escribe): espera un momento
  // corto sin cambios antes de consultar. Si la búsqueda de lote ya trajo el
  // costo (mismo _ref), no vuelve a consultar de una.
  useEffect(() => {
    const ref = referencia.trim();
    if (!ref) return;
    if (costoTeorico && !costoTeorico.error && costoTeorico._ref === ref) return;
    const t = setTimeout(() => { buscarCostoTeorico(); }, 700);
    return () => clearTimeout(t);
  }, [referencia]);
  const trabajadoresActivos = trabajadores.filter((t) => t.activo);
  const total = (Number(cantidad) || 0) * (Number(precioReal) || 0);
  // El lote encontrado solo cuenta si sigue siendo el de la referencia
  // actual (mismo resguardo que costoAplicaA, por si cambian la referencia a
  // mano después de buscar). "Vigente" = no está ya en BPT (terminado). Y
  // nunca se deja pagar dos veces el mismo lote+proceso, sin importar quién
  // lo registró — pidió el usuario "nunca puede repetir doble vez el pago en
  // un mismo lote".
  const loteAsociado = loteInfo?.encontrada && loteInfo.referencia === referencia.trim() ? loteInfo : null;
  // Si este lote+proceso exacto está en la tabla de Costos Teóricos por
  // Proceso (cargada a mano desde el Excel de Busint), ese valor es más
  // específico que el costoFT de la referencia (que es un solo número, sin
  // distinguir procesos) — así que manda sobre él si existe.
  const costoProcesoEspecifico =
    loteAsociado && proceso
      ? (costosTeoricoProceso || []).find((c) => c.numLote === loteAsociado.numLote && normalizarProceso(c.proceso) === normalizarProceso(proceso) && c.costoFT > 0)
      : null;
  // Segunda opción: si ESTE lote no está en la tabla de Costos Teóricos (por
  // ejemplo, un lote nuevo que no salió todavía en el Excel que se subió),
  // pero la MISMA Referencia+Proceso sí aparece ahí — de cualquier otro lote,
  // el más reciente — se usa ese costo. Sigue siendo más específico que el
  // costoFT genérico de la ficha técnica (Busint), porque distingue proceso.
  const refBuscada = referencia.trim();
  const costoRefProceso =
    !costoProcesoEspecifico && refBuscada && proceso
      ? [...(costosTeoricoProceso || [])]
          .filter((c) => normalizarRefComparacion(c.ref) === normalizarRefComparacion(refBuscada) && normalizarProceso(c.proceso) === normalizarProceso(proceso) && c.costoFT > 0)
          .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0] || null
      : null;
  // Tercera opción (la menos específica de las que sí sirven como tope): el
  // "Costo Teórico" que el admin configuró a mano para este Proceso en el
  // catálogo (Administración → Procesos) — solo se usa si no hay nada más
  // puntual por Lote+Proceso o Referencia+Proceso.
  const costoProcesoGenerico = proceso
    ? precios.find((p) => normalizarProceso(p.proceso) === normalizarProceso(proceso) && Number(p.costoTeorico) > 0)
    : null;
  // (2026-08-25) El costoFT de la Referencia (ficha técnica de Busint) es el
  // costo teórico de la CONFECCIÓN COMPLETA de la prenda, no de un proceso
  // individual — con el lote 7169 (Proceso Adicional Cordón) se confirmó que
  // usarlo como tope de un solo proceso no tiene sentido (mostraba $14.255
  // como si fuera el tope de un proceso sueltito). Por pedido del usuario,
  // YA NO se usa como tope — se sigue consultando y mostrando como dato
  // informativo (más abajo, junto al campo Referencia), pero no entra en la
  // cascada de costoAplicaA. Prioridad real del tope: Lote+Proceso >
  // Referencia+Proceso (Costos Teóricos) > Proceso (catálogo).
  const costoAplicaA = costoProcesoEspecifico
    ? { costoFT: costoProcesoEspecifico.costoFT, _ref: referencia.trim(), _origen: "lote_proceso" }
    : costoRefProceso
    ? { costoFT: costoRefProceso.costoFT, _ref: referencia.trim(), _origen: "ref_proceso" }
    : costoProcesoGenerico
    ? { costoFT: Number(costoProcesoGenerico.costoTeorico), _ref: referencia.trim(), _origen: "proceso" }
    : null;
  const excedeCostoTeorico = !!(costoAplicaA && Number(precioReal) > costoAplicaA.costoFT);
  const loteBloqueado = !!(loteAsociado && !loteAsociado.vigente);
  const registroPrevio = loteAsociado && proceso ? (produccionCompleta || []).find((p) => p.numLote === loteAsociado.numLote && p.proceso === proceso) : null;
  const puedeGuardar = trabajadorId && proceso && Number(cantidad) > 0 && Number(precioReal) > 0 && !guardando && !excedeCostoTeorico && !loteBloqueado && !registroPrevio;
  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      const trabajador = trabajadores.find((t) => t.id === trabajadorId);
      await onGuardar({
        id: uid(),
        trabajadorId,
        trabajadorNombre: trabajador?.nombre || "",
        fecha,
        proceso,
        referencia: referencia.trim(),
        numLote: loteInfo?.encontrada && loteInfo.referencia === referencia.trim() ? loteInfo.numLote : null,
        numPedido: loteInfo?.encontrada && loteInfo.referencia === referencia.trim() ? loteInfo.numPedido : null,
        cantidad: Number(cantidad) || 0,
        precioUnidad: Number(precioReal) || 0,
        total,
        creadoPor: currentUser?.name || currentUser?.username || "",
        creadoEn: new Date().toISOString(),
      });
      setReferencia("");
      setCantidad("");
      setPrecioReal("");
      setCostoTeorico(null);
      setNumLote("");
      setLoteInfo(null);
    } finally {
      setGuardando(false);
    }
  }
  const recientes = [...produccion].sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || "")).slice(0, 15);
  return (
    <div>
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, marginBottom: 24, maxWidth: 620 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Trabajador">
            <FSel value={trabajadorId} onChange={setTrabajadorId} options={trabajadoresActivos.map((t) => ({ value: t.id, label: t.nombre }))} />
          </Field>
          <Field label="Fecha"><FInput type="date" value={fecha} onChange={setFecha} /></Field>
        </div>
        <Field label="N° Lote (Busint)">
          <div style={{ display: "flex", gap: 6 }}>
            <FInput type="number" value={numLote} onChange={(v) => { setNumLote(v); setLoteInfo(null); }} placeholder="Ej: 7150" />
            <Btn small onClick={buscarLote} disabled={!numLote.trim() || buscandoLote}>{buscandoLote ? "..." : "🔍 Buscar Lote"}</Btn>
          </div>
        </Field>
        {loteInfo?.error && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se pudo buscar el lote: {loteInfo.error}</div>}
        {loteInfo && !loteInfo.error && !loteInfo.encontrada && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se encontró ese lote en Busint.</div>}
        {loteInfo?.encontrada && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, padding: "10px 12px", background: C.canvas, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
            <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>PEDIDO</div><div style={{ fontWeight: 700 }}>{loteInfo.numPedido || "—"}</div></div>
            <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>CLIENTE</div><div style={{ fontWeight: 700 }}>{loteInfo.nombreCliente || "—"}</div></div>
            <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>CANT. CORTADA</div><div style={{ fontWeight: 700 }}>{fmtNum(loteInfo.cantCortada)}</div></div>
            <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>CATEGORÍA</div><div style={{ fontWeight: 700 }}>{loteInfo.categoria || "—"}</div></div>
            <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>UBICACIÓN</div><div style={{ fontWeight: 700, color: loteInfo.vigente ? C.green : C.red }}>{loteInfo.ubicacionActual || "—"}</div></div>
            <div>
              <div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>COSTO TEÓRICO/UND</div>
              <div style={{ fontWeight: 700 }}>{loteInfo.costoFT > 0 ? fmtMoney(loteInfo.costoFT) : "Sin costear"}</div>
            </div>
          </div>
        )}
        {loteBloqueado && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 12 }}>
            El lote {loteAsociado.numLote} ya está en BPT (terminado) — no se puede registrar nómina sobre un lote que ya salió.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Proceso">
            <FSel value={proceso} onChange={setProceso} options={precios.map((p) => ({ value: p.proceso, label: p.proceso }))} />
          </Field>
          <Field label="Referencia (opcional)">
            <div style={{ display: "flex", gap: 6 }}>
              <FInput value={referencia} onChange={(v) => { setReferencia(v); setCostoTeorico(null); }} placeholder="Ej: CK3000" />
              <Btn small onClick={buscarCostoTeorico} disabled={!referencia.trim() || buscandoCosto}>{buscandoCosto ? "..." : "🔍 Costo"}</Btn>
            </div>
          </Field>
        </div>
        {/* Tope aplicable a ESTE proceso — se busca solo apenas hay
            referencia, sin necesidad de darle clic al botón. Prioridad:
            Lote+Proceso > Referencia+Proceso (Costos Teóricos) > Proceso
            (catálogo). El costoFT de la Referencia (Busint) NO es tope acá
            (es el costo de toda la prenda, no de un proceso) — se muestra
            aparte, solo informativo. */}
        {costoProcesoEspecifico ? (
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 4 }}>
            📐 Costo teórico del proceso "{costoProcesoEspecifico.proceso}" para el lote {loteAsociado.numLote}: {fmtMoney(costoProcesoEspecifico.costoFT)} (cargado en Administración → Costos Teóricos).
          </div>
        ) : costoRefProceso ? (
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 4 }}>
            📐 Costo teórico del proceso "{costoRefProceso.proceso}" para la referencia {referencia.trim()}: {fmtMoney(costoRefProceso.costoFT)} (de Administración → Costos Teóricos, lote {costoRefProceso.numLote} — no hay match exacto con este lote, pero sí con esta referencia+proceso).
          </div>
        ) : costoProcesoGenerico ? (
          <div style={{ fontSize: 11, color: C.violet, fontWeight: 700, marginBottom: 4 }}>
            ⚙️ Sin costo teórico específico para esta referencia — se usa el configurado para el proceso "{costoProcesoGenerico.proceso}" en Administración → Procesos: {fmtMoney(costoProcesoGenerico.costoTeorico)}.
          </div>
        ) : buscandoCosto ? (
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Buscando costo teórico...</div>
        ) : proceso ? (
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 4 }}>Sin costo teórico específico para este proceso (ni por Lote+Proceso, Referencia+Proceso, ni configurado en el catálogo) — no aplica tope.</div>
        ) : null}
        {/* Informativo aparte: costo teórico de TODA la prenda según la ficha
            técnica de Busint — nunca es el tope de un proceso individual. */}
        {costoTeorico && !costoTeorico.error && costoTeorico._ref === referencia.trim() && costoTeorico.encontrada && costoTeorico.costoFT > 0 && (
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>
            ℹ️ Costo teórico de toda la prenda (Busint) para {costoTeorico._ref}: {fmtMoney(costoTeorico.costoFT)} — informativo, no es el tope de este proceso.
          </div>
        )}
        {costoTeorico?.error && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se pudo consultar el costo teórico: {costoTeorico.error}</div>}
        {registroPrevio && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 10 }}>
            El proceso "{proceso}" del lote {loteAsociado.numLote} ya fue pagado ({registroPrevio.trabajadorNombre}, {fmtFechaISO(registroPrevio.fecha)}) — no se puede pagar dos veces.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <Field label="Cantidad"><FInput type="number" value={cantidad} onChange={setCantidad} /></Field>
          <Field label="Precio real (por unidad)"><FInput type="number" value={precioReal} onChange={setPrecioReal} placeholder="Lo que se le paga" /></Field>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Costo Teórico</div>
            <div style={{ padding: "9px 12px", background: excedeCostoTeorico ? C.redBg : C.canvas, borderRadius: 8, fontWeight: 800, color: excedeCostoTeorico ? C.red : C.ink, fontSize: 14 }}>
              {buscandoCosto ? "Buscando..." : costoAplicaA ? fmtMoney(costoAplicaA.costoFT) : "—"}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Total</div>
            <div style={{ padding: "9px 12px", background: C.canvas, borderRadius: 8, fontWeight: 800, color: C.ink, fontSize: 14 }}>{fmtMoney(total)}</div>
          </div>
        </div>
        {!proceso && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>Selecciona un proceso (Administración → Procesos).</div>}
        {excedeCostoTeorico && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 10 }}>
            El precio real ({fmtMoney(Number(precioReal))}) supera el costo teórico {costoAplicaA._origen === "lote_proceso" ? `del proceso "${proceso}" para este lote` : costoAplicaA._origen === "ref_proceso" ? `del proceso "${proceso}" para esta referencia` : `configurado para el proceso "${proceso}"`} ({fmtMoney(costoAplicaA.costoFT)}). No se puede registrar así.
          </div>
        )}
        <Btn onClick={guardar} disabled={!puedeGuardar}>{guardando ? "Guardando..." : "Registrar Producción"}</Btn>
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>ÚLTIMOS REGISTROS</div>
      <Tabla
        vacio="Sin registros de producción todavía."
        columnas={[
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
          { key: "trabajadorNombre", label: "Trabajador" },
          { key: "proceso", label: "Proceso" },
          { key: "numLote", label: "Lote", render: (f) => f.numLote || "—" },
          { key: "referencia", label: "Referencia", render: (f) => f.referencia || "—" },
          { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
          { key: "precioUnidad", label: "Precio/Und", align: "right", render: (f) => fmtMoney(f.precioUnidad) },
          { key: "total", label: "Total", align: "right", render: (f) => fmtMoney(f.total) },
          ...(isAdmin ? [{ key: "acciones", label: "", align: "right", render: (f) => <span onClick={(e) => { e.stopPropagation(); onBorrar(f.id); }} style={{ cursor: "pointer", color: C.red, fontWeight: 700 }}>Borrar</span> }] : []),
        ]}
        filas={recientes}
      />
    </div>
  );
}
// ─── REGISTRAR HORAS SUELTAS (tareas no vinculadas a un producto) ──────────
function RegistrarHorasView({ trabajadores, horas, currentUser, onGuardar, onBorrar, isAdmin }) {
  const [trabajadorId, setTrabajadorId] = useState("");
  const [fecha, setFecha] = useState(today());
  const [concepto, setConcepto] = useState("");
  const [horasCant, setHorasCant] = useState("");
  const [guardando, setGuardando] = useState(false);
  const trabajadoresActivos = trabajadores.filter((t) => t.activo);
  const trabajadorSel = trabajadores.find((t) => t.id === trabajadorId);
  const total = (Number(horasCant) || 0) * (trabajadorSel?.tarifaHora || 0);
  const puedeGuardar = trabajadorId && concepto.trim() && Number(horasCant) > 0 && !guardando;
  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      await onGuardar({
        id: uid(),
        trabajadorId,
        trabajadorNombre: trabajadorSel?.nombre || "",
        fecha,
        concepto: concepto.trim(),
        horas: Number(horasCant) || 0,
        tarifaHora: trabajadorSel?.tarifaHora || 0,
        total,
        creadoPor: currentUser?.name || currentUser?.username || "",
        creadoEn: new Date().toISOString(),
      });
      setConcepto("");
      setHorasCant("");
    } finally {
      setGuardando(false);
    }
  }
  const recientes = [...horas].sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || "")).slice(0, 15);
  return (
    <div>
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, marginBottom: 24, maxWidth: 620 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Trabajador">
            <FSel value={trabajadorId} onChange={setTrabajadorId} options={trabajadoresActivos.map((t) => ({ value: t.id, label: `${t.nombre} (${fmtMoney(t.tarifaHora)}/h)` }))} />
          </Field>
          <Field label="Fecha"><FInput type="date" value={fecha} onChange={setFecha} /></Field>
        </div>
        <Field label="Concepto / Tarea"><FInput value={concepto} onChange={setConcepto} placeholder="Ej: Aseo de planta, apoyo en bodega..." /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
          <Field label="Horas"><FInput type="number" value={horasCant} onChange={setHorasCant} /></Field>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Total</div>
            <div style={{ padding: "9px 12px", background: C.canvas, borderRadius: 8, fontWeight: 800, color: C.ink, fontSize: 14 }}>{fmtMoney(total)}</div>
          </div>
        </div>
        {trabajadorSel && !trabajadorSel.tarifaHora && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>Este trabajador no tiene tarifa/hora configurada — el total va a salir en $0. Edítala en "Trabajadores".</div>}
        <Btn onClick={guardar} disabled={!puedeGuardar}>{guardando ? "Guardando..." : "Registrar Horas"}</Btn>
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>ÚLTIMOS REGISTROS</div>
      <Tabla
        vacio="Sin horas sueltas registradas todavía."
        columnas={[
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
          { key: "trabajadorNombre", label: "Trabajador" },
          { key: "concepto", label: "Concepto" },
          { key: "horas", label: "Horas", align: "right", render: (f) => fmtNum(f.horas) },
          { key: "tarifaHora", label: "Tarifa/Hora", align: "right", render: (f) => fmtMoney(f.tarifaHora) },
          { key: "total", label: "Total", align: "right", render: (f) => fmtMoney(f.total) },
          ...(isAdmin ? [{ key: "acciones", label: "", align: "right", render: (f) => <span onClick={(e) => { e.stopPropagation(); onBorrar(f.id); }} style={{ cursor: "pointer", color: C.red, fontWeight: 700 }}>Borrar</span> }] : []),
        ]}
        filas={recientes}
      />
    </div>
  );
}
// ─── RESUMEN SEMANAL (lunes a domingo) ──────────────────────────────────────
// Junta Producción + Horas Sueltas de la semana activa, agrupado por
// trabajador, para armar el pago — clic en un trabajador abre el desglose
// línea por línea (qué procesos/tareas componen su total).
function ResumenSemanalView({ trabajadores, produccion, horas, isAdmin, cierres, onCerrar, onReabrir }) {
  const [qOffset, setQOffset] = useState(0);
  const [trabajadorAbierto, setTrabajadorAbierto] = useState(null);
  const { desde, hasta, label } = quincenaDe(qOffset);
  const prodQuincena = produccion.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const horasQuincena = horas.filter((h) => h.fecha >= desde && h.fecha <= hasta);
  const cierre = (cierres || []).find((c) => c.desde === desde);
  const porTrabajador = useMemo(() => {
    const mapa = new Map();
    trabajadores.forEach((t) => mapa.set(t.id, { trabajadorId: t.id, nombre: t.nombre, totalProduccion: 0, totalHoras: 0, unidades: 0, horasCant: 0 }));
    prodQuincena.forEach((p) => {
      if (!mapa.has(p.trabajadorId)) mapa.set(p.trabajadorId, { trabajadorId: p.trabajadorId, nombre: p.trabajadorNombre, totalProduccion: 0, totalHoras: 0, unidades: 0, horasCant: 0 });
      const g = mapa.get(p.trabajadorId);
      g.totalProduccion += p.total || 0;
      g.unidades += p.cantidad || 0;
    });
    horasQuincena.forEach((h) => {
      if (!mapa.has(h.trabajadorId)) mapa.set(h.trabajadorId, { trabajadorId: h.trabajadorId, nombre: h.trabajadorNombre, totalProduccion: 0, totalHoras: 0, unidades: 0, horasCant: 0 });
      const g = mapa.get(h.trabajadorId);
      g.totalHoras += h.total || 0;
      g.horasCant += h.horas || 0;
    });
    return [...mapa.values()]
      .map((g) => ({ ...g, totalGeneral: g.totalProduccion + g.totalHoras }))
      .filter((g) => g.totalGeneral > 0 || g.unidades > 0 || g.horasCant > 0)
      .sort((a, b) => b.totalGeneral - a.totalGeneral);
  }, [trabajadores, prodQuincena, horasQuincena]);
  const totalQuincena = porTrabajador.reduce((s, g) => s + g.totalGeneral, 0);
  const detalleAbierto = trabajadorAbierto
    ? {
        produccion: prodQuincena.filter((p) => p.trabajadorId === trabajadorAbierto.trabajadorId),
        horas: horasQuincena.filter((h) => h.trabajadorId === trabajadorAbierto.trabajadorId),
      }
    : null;
  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const filas = [
      ["RESUMEN NÓMINA — QUINCENA", `${fmtFechaISO(desde)} — ${fmtFechaISO(hasta)}`],
      [],
      ["Trabajador", "Unidades", "Total Producción", "Horas", "Total Horas", "Total a Pagar"],
      ...porTrabajador.map((g) => [g.nombre, g.unidades, g.totalProduccion, g.horasCant, g.totalHoras, g.totalGeneral]),
      [],
      ["TOTAL QUINCENA", "", "", "", "", totalQuincena],
    ];
    const ws = XLSX.utils.aoa_to_sheet(filas);
    XLSX.utils.book_append_sheet(wb, ws, "Resumen Nómina");
    XLSX.writeFile(wb, `Nomina_${desde}_a_${hasta}.xlsx`);
  }
  return (
    <div>
      {trabajadorAbierto && (
        <Modal title={`Detalle de "${trabajadorAbierto.nombre}" — ${fmtFechaISO(desde)} al ${fmtFechaISO(hasta)}`} onClose={() => setTrabajadorAbierto(null)} width={720}>
          <div style={{ fontWeight: 800, fontSize: 12, color: C.ink, marginBottom: 8 }}>PRODUCCIÓN</div>
          <Tabla
            vacio="Sin producción esta quincena."
            columnas={[
              { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
              { key: "proceso", label: "Proceso" },
              { key: "referencia", label: "Referencia", render: (f) => f.referencia || "—" },
              { key: "cantidad", label: "Cant.", align: "right", render: (f) => fmtNum(f.cantidad) },
              { key: "total", label: "Total", align: "right", render: (f) => fmtMoney(f.total) },
            ]}
            filas={detalleAbierto.produccion}
          />
          <div style={{ fontWeight: 800, fontSize: 12, color: C.ink, margin: "18px 0 8px" }}>HORAS SUELTAS</div>
          <Tabla
            vacio="Sin horas sueltas esta quincena."
            columnas={[
              { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
              { key: "concepto", label: "Concepto" },
              { key: "horas", label: "Horas", align: "right", render: (f) => fmtNum(f.horas) },
              { key: "total", label: "Total", align: "right", render: (f) => fmtMoney(f.total) },
            ]}
            filas={detalleAbierto.horas}
          />
        </Modal>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => setQOffset((o) => o - 1)} style={{ padding: "6px 12px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, color: C.ink }}>← Anterior</button>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{label}</div>
        <button onClick={() => setQOffset((o) => o + 1)} style={{ padding: "6px 12px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, color: C.ink }}>Siguiente →</button>
      </div>
      {cierre && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: C.violetBg, border: `1px solid ${C.violet}44`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: C.violet, fontWeight: 700 }}>🔒 Quincena cerrada por {cierre.cerradoPor || "—"} el {fmtFechaHora(cierre.cerradoEn)} — total: {fmtMoney(cierre.totalQuincena)}</div>
          {isAdmin && <Btn variant="secondary" small onClick={() => onReabrir(cierre.id)}>Reabrir</Btn>}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
        <KPI icon="👷" label="Trabajadores con pago esta quincena" value={fmtNum(porTrabajador.length)} color={C.ink} bg={C.canvas} />
        <KPI icon="💰" label="Total a Pagar" value={fmtMoney(totalQuincena)} color={C.green} bg={C.greenBg} />
      </div>
      <div style={{ marginBottom: 14, display: "flex", gap: 10 }}>
        <Btn variant="secondary" small onClick={exportarExcel} disabled={!porTrabajador.length}>⬇ Exportar a Excel</Btn>
        {isAdmin && !cierre && (
          <Btn small onClick={() => onCerrar({ desde, hasta, label, totalQuincena, porTrabajador })} disabled={!porTrabajador.length}>🔒 Cerrar Quincena</Btn>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>Clic en un trabajador para ver el desglose de su quincena.</div>
      <Tabla
        vacio="Sin registros esta quincena."
        onRowClick={(f) => setTrabajadorAbierto(f)}
        columnas={[
          { key: "nombre", label: "Trabajador" },
          { key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
          { key: "totalProduccion", label: "Total Producción", align: "right", render: (f) => fmtMoney(f.totalProduccion) },
          { key: "horasCant", label: "Horas", align: "right", render: (f) => fmtNum(f.horasCant) },
          { key: "totalHoras", label: "Total Horas", align: "right", render: (f) => fmtMoney(f.totalHoras) },
          { key: "totalGeneral", label: "Total a Pagar", align: "right", render: (f) => <strong>{fmtMoney(f.totalGeneral)}</strong> },
        ]}
        filas={porTrabajador}
      />
    </div>
  );
}
// ─── INICIO / DASHBOARD ─────────────────────────────────────────────────────
function DashboardNominaView({ trabajadores, precios, produccion, horas }) {
  const monday = mondayOf(new Date());
  const sunday = addDays(monday, 6);
  const desde = isoDate(monday);
  const hasta = isoDate(sunday);
  const prodSemana = produccion.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const horasSemana = horas.filter((h) => h.fecha >= desde && h.fecha <= hasta);
  const totalSemana = prodSemana.reduce((s, p) => s + (p.total || 0), 0) + horasSemana.reduce((s, h) => s + (h.total || 0), 0);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        <KPI icon="👷" label="Trabajadores Activos" value={fmtNum(trabajadores.filter((t) => t.activo).length)} color={C.ink} bg={C.canvas} />
        <KPI icon="⚙️" label="Procesos con Precio" value={fmtNum(precios.length)} color={C.blue} bg={C.blueBg} />
        <KPI icon="🧵" label="Registros esta semana" value={fmtNum(prodSemana.length + horasSemana.length)} color={C.violet} bg={C.violetBg} />
        <KPI icon="💰" label="Total a Pagar (semana actual)" value={fmtMoney(totalSemana)} color={C.green} bg={C.greenBg} />
      </div>
      <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
        Registra la producción por proceso (pago por pieza) y las horas sueltas de cada trabajador, y arma el pago semanal desde "Resumen Semanal".
      </div>
    </div>
  );
}
// ─── RAÍZ DEL MÓDULO ────────────────────────────────────────────────────────
export default function ModuloNomina({ currentUser, onVolver, onLogout }) {
  // Líder de área (Anny Beltrán → Terminación, Sarai Méndez → Termofijación,
  // etc.): entra con un panel reducido, ya filtrado a su propia gente, en vez
  // del panel completo de admin (nada de Trabajadores/Precios ni ver otras
  // áreas). Se define con el campo "Área de Nómina" del usuario, puesto por
  // un admin en Administrador General → Usuarios.
  const areaLider = !currentUser?.isAdmin && currentUser?.areaNomina ? currentUser.areaNomina : null;
  const [subView, setSubView] = useState(() => (areaLider ? "produccion" : "dashboard"));
  const [trabajadores, setTrabajadores] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [produccion, setProduccion] = useState([]);
  const [horas, setHoras] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [costosTeoricoProceso, setCostosTeoricoProceso] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "nomina_trabajadores"), (snap) => { setTrabajadores(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setLoading(false); }),
      onSnapshot(collection(db, "nomina_precios_proceso"), (snap) => setPrecios(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_produccion"), (snap) => setProduccion(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_horas"), (snap) => setHoras(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_cierres"), (snap) => setCierres(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_costos_teorico_proceso"), (snap) => setCostosTeoricoProceso(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);
  const isAdmin = !!currentUser?.isAdmin;
  const NAV = areaLider
    ? [
        { id: "produccion", icon: "🧵", label: "Registrar Producción" },
        { id: "horas", icon: "🕐", label: "Registrar Horas" },
        { id: "resumen", icon: "💰", label: "Resumen" },
      ]
    : [
        { id: "dashboard", icon: "◉", label: "Inicio" },
        { id: "produccion", icon: "🧵", label: "Registrar Producción" },
        { id: "horas", icon: "🕐", label: "Registrar Horas" },
        { id: "resumen", icon: "💰", label: "Cierre de Quincena" },
        { id: "trabajadores", icon: "👷", label: "Trabajadores" },
        { id: "precios", icon: "⚙️", label: "Procesos" },
        { id: "costos_teorico", icon: "📐", label: "Costos Teóricos" },
      ];
  // Con líder de área, todo lo que ve/registra queda limitado a su propia
  // gente — así Anny no ve ni toca la producción de Sarai y viceversa.
  const trabajadoresVisibles = areaLider ? trabajadores.filter((t) => (t.area || "Sin asignar") === areaLider) : trabajadores;
  const produccionVisible = areaLider ? produccion.filter((p) => trabajadoresVisibles.some((t) => t.id === p.trabajadorId)) : produccion;
  const horasVisibles = areaLider ? horas.filter((h) => trabajadoresVisibles.some((t) => t.id === h.trabajadorId)) : horas;
  async function guardarTrabajador(t) { await fsSave("nomina_trabajadores", t.id, t); }
  async function borrarTrabajador(id) { await fsDelete("nomina_trabajadores", id); }
  async function guardarProceso(p) { await fsSave("nomina_precios_proceso", p.id, p); }
  async function borrarProceso(id) { await fsDelete("nomina_precios_proceso", id); }
  async function guardarProduccion(p) { await fsSave("nomina_produccion", p.id, p); }
  async function borrarProduccion(id) { await fsDelete("nomina_produccion", id); }
  async function guardarHoras(h) { await fsSave("nomina_horas", h.id, h); }
  async function borrarHoras(id) { await fsDelete("nomina_horas", id); }
  // Sube en lote (upsert por "{numLote}_{PROCESO}") las filas del Excel de
  // Costos Teóricos por Proceso — se hace con writeBatch (no una por una)
  // para que un archivo de varios cientos de filas se guarde de un solo
  // golpe. 450 por tanda, por debajo del límite de 500 operaciones que
  // permite un batch de Firestore.
  async function guardarCostosTeoricoProcesoLote(filas, nombreArchivo) {
    const cargadoEn = new Date().toISOString();
    const cargadoPor = currentUser?.name || currentUser?.username || "";
    const TAM_TANDA = 450;
    for (let i = 0; i < filas.length; i += TAM_TANDA) {
      const tanda = filas.slice(i, i + TAM_TANDA);
      const batch = writeBatch(db);
      tanda.forEach((f) => {
        const id = `${f.numLote}_${normalizarProceso(f.proceso)}`;
        batch.set(doc(db, "nomina_costos_teorico_proceso", id), { ...f, id, cargadoEn, cargadoPor, archivoOrigen: nombreArchivo || "" }, { merge: true });
      });
      await batch.commit();
    }
  }
  async function vaciarCostosTeoricoProceso() {
    const TAM_TANDA = 450;
    for (let i = 0; i < costosTeoricoProceso.length; i += TAM_TANDA) {
      const tanda = costosTeoricoProceso.slice(i, i + TAM_TANDA);
      const batch = writeBatch(db);
      tanda.forEach((c) => batch.delete(doc(db, "nomina_costos_teorico_proceso", c.id)));
      await batch.commit();
    }
  }
  // "Cerrar Quincena" guarda una foto (snapshot) de los totales por
  // trabajador al momento del cierre — eso es lo que consulta Talento
  // Humano, sin depender de que nadie transcriba nada a mano. El id del
  // documento es la fecha "desde" (única por quincena), así que cerrar dos
  // veces la misma simplemente sobreescribe el mismo cierre.
  async function guardarCierre({ desde, hasta, label, totalQuincena, porTrabajador }) {
    await fsSave("nomina_cierres", desde, {
      desde, hasta, label, totalQuincena,
      porTrabajador,
      cerradoPor: currentUser?.name || currentUser?.username || "",
      cerradoEn: new Date().toISOString(),
    });
  }
  async function reabrirCierre(id) { await fsDelete("nomina_cierres", id); }
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👷</div>
          <div style={{ color: C.slate }}>Cargando Nómina...</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ width: 220, background: C.ink, padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>👷 Nómina</div>
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>{areaLider || "Semiterminados"}</div>
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
          {subView === "dashboard" && !areaLider && <DashboardNominaView trabajadores={trabajadores} precios={precios} produccion={produccion} horas={horas} />}
          {subView === "produccion" && <RegistrarProduccionView trabajadores={trabajadoresVisibles} precios={precios} produccion={produccionVisible} produccionCompleta={produccion} costosTeoricoProceso={costosTeoricoProceso} currentUser={currentUser} onGuardar={guardarProduccion} onBorrar={borrarProduccion} isAdmin={isAdmin} />}
          {subView === "horas" && <RegistrarHorasView trabajadores={trabajadoresVisibles} horas={horasVisibles} currentUser={currentUser} onGuardar={guardarHoras} onBorrar={borrarHoras} isAdmin={isAdmin} />}
          {subView === "resumen" && <ResumenSemanalView trabajadores={trabajadoresVisibles} produccion={produccionVisible} horas={horasVisibles} isAdmin={isAdmin} cierres={cierres} onCerrar={guardarCierre} onReabrir={reabrirCierre} />}
          {subView === "trabajadores" && !areaLider && <TrabajadoresView trabajadores={trabajadores} isAdmin={isAdmin} onSave={guardarTrabajador} onDelete={borrarTrabajador} />}
          {subView === "precios" && !areaLider && <PreciosProcesoView precios={precios} isAdmin={isAdmin} onSave={guardarProceso} onDelete={borrarProceso} />}
          {subView === "costos_teorico" && !areaLider && <CostosTeoricoProcesoView costos={costosTeoricoProceso} isAdmin={isAdmin} onGuardarLote={guardarCostosTeoricoProcesoLote} onBorrarTodo={vaciarCostosTeoricoProceso} />}
        </div>
      </div>
    </div>
  );
}
