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
// Área Interna (2026-08-30, renombrada 2026-08-31): antes era una lista
// fija en el código (Terminación/Termofijación) que no coincidía con las
// áreas reales que se venían usando para los trabajadores (ZONA CALOR,
// EMPAQUE, ADMINISTRATIVO, etc.) -- eso dejaba a las líderes sin ver a
// nadie. Ahora es una lista editable por el admin (Administrativo → Área
// Interna, colección Firestore "nomina_areas" -- el nombre de la colección
// no cambió, solo cómo se muestra en pantalla), la misma que alimenta tanto
// el campo "Área Interna" de cada trabajador como el área que se le asigna
// a un líder en Usuarios. "Sin asignar" sigue siendo el valor por defecto
// para quien no tenga área (no es un documento real en "nomina_areas").
// Es DISTINTA del "Área TNS" (más abajo): Área Interna es la clasificación
// propia de la planta (ZONA CALOR, EMPAQUE, CONTROL DE CALIDAD, BODEGA...)
// y también la que usan los líderes para ver solo a su gente; Área TNS es
// la clasificación que ya trae TNS para todo el personal (Operativa /
// Administrativo / Diseño), pensada solo para cruzarla más adelante contra
// el archivo plano que exporta TNS -- no afecta a los líderes.
// Códigos TNS ya confirmados a mano (Nómina → Reportes → Listado de Personal
// de TNS, Industrias Yanko BC SAS, Jul/2026) — en esta empresa TNS usa la
// misma cédula como "codigo"/"codigotercero" del contrato. Solo cubre las 13
// personas que ya tienen contrato creado allá; el botón "Autocompletar" de
// abajo cruza esto por cédula contra los Trabajadores de Atlas. A medida que
// se creen más contratos en TNS, se agregan acá o se llenan a mano en el
// campo "Código TNS" de cada trabajador.
const TNS_CODIGOS_CONOCIDOS = [
  { cedula: "1004866225", codigo: "1004866225", nombre: "JESUS ALIRIO BOTELLO BECERRA" },
  { cedula: "1090460800", codigo: "1090460800", nombre: "YULEISI VIRGINIA MORENO CRUZ" },
  { cedula: "1090507395", codigo: "1090507395", nombre: "KEVIN RONALDO CONTRERAS CASTELLANOS" },
  { cedula: "1093792909", codigo: "1093792909", nombre: "DANIEL LEONARDO MEJIA CADENA" },
  { cedula: "1093801939", codigo: "1093801939", nombre: "KAREN MICHELL CHACON CABALLERO" },
  { cedula: "1094277949", codigo: "1094277949", nombre: "KAREN DAYANA DELGADO VILLAMIZAR" },
  { cedula: "1096949415", codigo: "1096949415", nombre: "YESICA TATIANA CORREA PEÑARANDA" },
  { cedula: "1127349945", codigo: "1127349945", nombre: "JENNY SARAI MENDEZ SUAREZ" },
  { cedula: "30050414", codigo: "30050414", nombre: "MARY NELCI BAUTISTA CONTRERAS" },
  { cedula: "37279174", codigo: "37279174", nombre: "ANNY CLARISA BELTRAN JAIMES" },
  { cedula: "37390386", codigo: "37390386-4", nombre: "YULIANA ANDREA BELTRAN JAIMES" },
  { cedula: "88225906", codigo: "88225906", nombre: "LUIS ALFREDO MEDINA FUENTES" },
  { cedula: "88260792", codigo: "88260792", nombre: "FREDY ALEXANDER BAUTISTA CONTRERAS" },
];
function normalizarCedula(v) {
  return String(v || "").trim().split("-")[0].replace(/\D/g, "").replace(/^0+/, "") || "";
}
// Clasificación de nómina (BASE DE DATOS PERSONAL COPIA FINAL, 25/08/2026):
// Fiscal = nómina completa en TNS (seg. social + parafiscales). Fiscal
// Destajo = sueldo fijo como Fiscal pero SIN seguridad social, SÍ
// parafiscales — se hospeda en Atlas, no en TNS. Destajo = pago por
// proceso/producción (ya existe en Registrar Producción). Prestación de
// Servicios = fuera de nómina.
const TIPOS_NOMINA = ["Fiscal", "Fiscal Destajo", "Destajo", "Prestación de Servicios"];
// Los 5 de "Fiscal Destajo" identificados en BASE DE DATOS PERSONAL COPIA
// FINAL (todos EMPRESA=YANKO) — botón de abajo los crea/actualiza en
// Trabajadores de un solo clic, con su sueldo y auxilio real del archivo.
const FISCAL_DESTAJO_CONOCIDOS = [
  { cedula: "1090412868", nombre: "ERIKA JOHANNA MEZA MELO", area: "ADMINISTRATIVO", sueldo: 2000000, auxilioTransporte: 249095 },
  { cedula: "1094350122", nombre: "MARIA FERNANDA PAEZ MOJICA", area: "ADMINISTRATIVO", sueldo: 2200000, auxilioTransporte: 249095 },
  { cedula: "1005029795", nombre: "JAIRO RUBEN CAPACHO RUEDAS", area: "CORTE", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090514287", nombre: "ANDRES FELIPE BECERRA RINCON", area: "CORTE", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 5021799", nombre: "JAIRO DAVID ANDRADE ANDUEZA", area: "CORTE", sueldo: 1750905, auxilioTransporte: 249095 },
];
// Los 12 de "Destajo" (forma de pago = DESTAJO, pagados por produccion via
// Registrar Produccion) identificados en BASE DE DATOS PERSONAL COPIA FINAL
// (30/08/2026) -- boton de abajo los crea/actualiza en Trabajadores de un
// solo clic. Se guarda tambien sueldo/auxilioTransporte de referencia (el
// archivo trae cesantias/intereses/prima/vacaciones proporcionales a ese
// sueldo) aunque el formulario de Trabajador no los muestra para este tipo
// -- quedan disponibles para cuando se construya la liquidacion de
// prestaciones de Destajo (como ya existe para Fiscal Destajo).
// OJO (Fredy, 2026-08-30): 2 datos por confirmar de este archivo --
// "CAROLINA" en EMPAQUE tiene cedula "1" (incompleta en el archivo), y
// LINDA MAYERLI CALDERON FLOREZ es EMPRESA=INDUTEX (las demas son YANKO;
// Atlas hoy no distingue empresa por trabajador, así que esto no bloquea
// la carga pero conviene revisarlo).
const DESTAJO_CONOCIDOS = [
  { cedula: "27603235", nombre: "MARIA AYDE CONTRERAS SANCHEZ", area: "ADMINISTRATIVO", sueldo: 875452, auxilioTransporte: 124547 },
  { cedula: "1093791786", nombre: "CAROL MICHEL MEZA MELO", area: "EMPAQUE", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "60349160", nombre: "OLGA LUCIA MELO DIETIZ", area: "EMPAQUE", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1193535527", nombre: "MARIA ESPERANZA SARABIA NIETO", area: "EMPAQUE", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090491202", nombre: "LINDA MAYERLI CALDERON FLOREZ", area: "EMPAQUE", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1", nombre: "CAROLINA", area: "EMPAQUE", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093799768", nombre: "ANDREA MICHELL BONILLA ACEVEDO", area: "ZONA CALOR", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090535599", nombre: "EYDER YAIR MENDOZA TORRES", area: "ZONA CALOR", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090181616", nombre: "YORLENY ALARCON SANCHEZ", area: "ZONA CALOR", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 31395555", nombre: "MAYDELIS ARIANA BARCO HERNANDEZ", area: "ZONA CALOR", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1127350028", nombre: "VICTOR MANUEL ADOLFO PORRAS", area: "ZONA CALOR", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1092254889", nombre: "JHONEIDER BOTELLO BECERRA", area: "ZONA CALOR", sueldo: 1750905, auxilioTransporte: 249095 },
];
function AreaNominaModal({ area, onSave, onClose }) {
  const [form, setForm] = useState({ nombre: area?.nombre || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({ nombre: form.nombre.trim() });
    onClose();
  }
  return (
    <Modal title={area ? "Editar Área Interna" : "Nueva Área Interna"} onClose={onClose} width={400}>
      <Field label="Nombre del Área Interna"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: ZONA CALOR, EMPAQUE, ADMINISTRATIVO, CONTROL DE CALIDAD" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Esta lista alimenta el campo "Área Interna" de cada trabajador y el área que se le asigna a un líder en Usuarios. Es distinta de "Área TNS" (Operativa/Administrativo/Diseño, más abajo en Administrativo).
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function AreasNominaView({ areas, trabajadores, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | area
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenadas = [...areas].sort((a, b) => a.nombre.localeCompare(b.nombre));
  function contarTrabajadores(nombre) {
    return (trabajadores || []).filter((t) => (t.area || "Sin asignar") === nombre).length;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Estas son las áreas reales de la planta (ej. ZONA CALOR, EMPAQUE, ADMINISTRATIVO, CONTROL DE CALIDAD) — se usan para clasificar a cada trabajador y para asignarle a un líder de área su gente en Usuarios. Es distinta de "Área TNS" (más abajo en Administrativo), que es la clasificación que ya trae TNS para todo el personal.
      </div>
      {modal && (
        <AreaNominaModal
          area={modal === "nuevo" ? null : modal}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            ¿Eliminar el área interna <strong>{confirmDel.nombre}</strong>?
            {contarTrabajadores(confirmDel.nombre) > 0 && (
              <div style={{ marginTop: 10, color: C.red, fontWeight: 600 }}>⚠️ {contarTrabajadores(confirmDel.nombre)} trabajador(es) tienen esta área interna asignada — no se les cambia sola, quedarían con un área que ya no existe en la lista. Revísalos primero en Trabajadores.</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
          </div>
        </Modal>
      )}
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <Btn onClick={() => setModal("nuevo")}>+ Nueva Área Interna</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin áreas internas registradas todavía."
        columnas={[
          { key: "nombre", label: "Área Interna" },
          { key: "trabajadores", label: "Trabajadores", align: "right", render: (f) => contarTrabajadores(f.nombre) },
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
        filas={ordenadas}
      />
    </div>
  );
}
// Área TNS (2026-08-31, pedido de Fredy): clasificación que ya usa TNS para
// TODO el personal -- Operativa (labores de producción), Administrativo
// (oficina), Diseño -- tal como TNS las llama. Es SEPARADA de "Área Interna"
// (arriba, ZONA CALOR/EMPAQUE/CONTROL DE CALIDAD/etc., la que usan los
// líderes para ver solo a su gente). Lista editable por el admin, igual que
// Área Interna (Administrativo → Área TNS, colección Firestore
// "nomina_areas_tns") -- Fredy prefirió que fuera editable en vez de una
// lista fija de solo 3, por si TNS agrega o renombra una categoría más
// adelante. Se guarda en cada trabajador (campo "areaTNS") para poder
// cruzar/verificar más adelante contra el archivo plano que exporta TNS; no
// se usa para nada de "líder ve solo su gente" (eso sigue siendo Área Interna).
function AreaTnsModal({ area, onSave, onClose }) {
  const [form, setForm] = useState({ nombre: area?.nombre || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({ nombre: form.nombre.trim() });
    onClose();
  }
  return (
    <Modal title={area ? "Editar Área TNS" : "Nueva Área TNS"} onClose={onClose} width={400}>
      <Field label="Nombre del Área TNS"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Operativa, Administrativo, Diseño" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Clasificación que ya usa TNS para todo el personal, aparte de "Área Interna" (arriba en Administrativo). Alimenta el campo "Área TNS" de cada trabajador, para cruzar contra el archivo de TNS.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function AreasTnsView({ areas, trabajadores, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | area
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenadas = [...areas].sort((a, b) => a.nombre.localeCompare(b.nombre));
  function contarTrabajadores(nombre) {
    return (trabajadores || []).filter((t) => t.areaTNS === nombre).length;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Clasificación que ya trae TNS para todo el personal (Operativa, Administrativo, Diseño) — distinta de "Área Interna" (ZONA CALOR/EMPAQUE/CONTROL DE CALIDAD/etc., la que usan los líderes). Sirve para cruzar cada trabajador contra el archivo plano que exporta TNS.
      </div>
      {modal && (
        <AreaTnsModal
          area={modal === "nuevo" ? null : modal}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            ¿Eliminar el área TNS <strong>{confirmDel.nombre}</strong>?
            {contarTrabajadores(confirmDel.nombre) > 0 && (
              <div style={{ marginTop: 10, color: C.red, fontWeight: 600 }}>⚠️ {contarTrabajadores(confirmDel.nombre)} trabajador(es) tienen esta área TNS asignada — no se les cambia sola, quedarían con un área que ya no existe en la lista. Revísalos primero en Trabajadores.</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
          </div>
        </Modal>
      )}
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <Btn onClick={() => setModal("nuevo")}>+ Nueva Área TNS</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin áreas TNS registradas todavía."
        columnas={[
          { key: "nombre", label: "Área TNS" },
          { key: "trabajadores", label: "Trabajadores", align: "right", render: (f) => contarTrabajadores(f.nombre) },
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
        filas={ordenadas}
      />
    </div>
  );
}
function TrabajadorModal({ trabajador, onSave, onClose, areasNomina, areasTNS }) {
  const [form, setForm] = useState({
    nombre: trabajador?.nombre || "",
    cedula: trabajador?.cedula || "",
    tarifaHora: trabajador?.tarifaHora ?? "",
    activo: trabajador?.activo ?? true,
    area: trabajador?.area || "Sin asignar",
    areaTNS: trabajador?.areaTNS || "",
    tnsCodigo: trabajador?.tnsCodigo || "",
    tipoNomina: trabajador?.tipoNomina || "",
    sueldo: trabajador?.sueldo ?? "",
    auxilioTransporte: trabajador?.auxilioTransporte ?? "",
    fechaIngreso: trabajador?.fechaIngreso || "",
    cesantiasAcumuladas: trabajador?.cesantiasAcumuladas ?? "",
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({
      nombre: form.nombre.trim(),
      cedula: form.cedula.trim(),
      tarifaHora: Number(form.tarifaHora) || 0,
      activo: !!form.activo,
      area: form.area || "Sin asignar",
      areaTNS: form.areaTNS || "",
      tnsCodigo: form.tnsCodigo.trim(),
      tipoNomina: form.tipoNomina || "",
      sueldo: Number(form.sueldo) || 0,
      auxilioTransporte: Number(form.auxilioTransporte) || 0,
      fechaIngreso: form.fechaIngreso || "",
      cesantiasAcumuladas: Number(form.cesantiasAcumuladas) || 0,
    });
    onClose();
  }
  return (
    <Modal title={trabajador ? "Editar Trabajador" : "Nuevo Trabajador"} onClose={onClose} width={440}>
      <Field label="Nombre"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Carlos Javier González" /></Field>
      <Field label="Cédula"><FInput value={form.cedula} onChange={set("cedula")} placeholder="Ej: 1004802413" /></Field>
      <Field label="Área Interna"><FSel value={form.area} onChange={set("area")} options={[...areasNomina.map((a) => a.nombre), "Sin asignar"]} placeholder="Sin asignar" /></Field>
      <Field label="Área TNS"><FSel value={form.areaTNS} onChange={set("areaTNS")} options={areasTNS.map((a) => a.nombre)} placeholder="Sin clasificar" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        "Área Interna" es la clasificación propia de la planta (los líderes ven solo a su gente por ahí). "Área TNS" es la que ya usa TNS (Operativa/Administrativo/Diseño) — sirve para cruzar cuando llegue el archivo de TNS.
      </div>
      <Field label="Tipo de Nómina">
        <FSel value={form.tipoNomina} onChange={set("tipoNomina")} options={TIPOS_NOMINA} placeholder="Sin clasificar" />
      </Field>
      {(form.tipoNomina === "Fiscal Destajo" || form.tipoNomina === "Destajo") && (
        <>
          <Field label="Sueldo mensual fijo"><FInput type="number" value={form.sueldo} onChange={set("sueldo")} placeholder="Ej: 1750905" /></Field>
          <Field label="Auxilio de transporte mensual"><FInput type="number" value={form.auxilioTransporte} onChange={set("auxilioTransporte")} placeholder="Ej: 249095" /></Field>
          <Field label="Fecha de ingreso (para el acumulado de parafiscales)"><FInput type="date" value={form.fechaIngreso} onChange={set("fechaIngreso")} /></Field>
          <Field label="Cesantías ya acumuladas antes de empezar en Atlas (opcional)">
            <FInput type="number" value={form.cesantiasAcumuladas} onChange={set("cesantiasAcumuladas")} placeholder="0 si arranca de cero" />
          </Field>
          <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
            Si ya sabes cuánto lleva acumulado en cesantías antes de septiembre, ponlo acá para que los intereses se calculen bien desde el arranque. Si no lo sabes, déjalo en 0 y ajústalo cuando lo tengas.
          </div>
        </>
      )}
      <Field label="Tarifa por hora (para tareas sueltas)"><FInput type="number" value={form.tarifaHora} onChange={set("tarifaHora")} /></Field>
      <Field label="Código TNS (si ya tiene contrato creado en TNS)">
        <FInput value={form.tnsCodigo} onChange={set("tnsCodigo")} placeholder="Ej: 1004866225" />
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Es el código/código de tercero con el que esta persona ya existe en TNS — se necesita para poder registrarle Novedades desde Atlas.
      </div>
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
function TrabajadoresView({ trabajadores, isAdmin, onSave, onDelete, areasNomina, areasTNS }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | trabajador
  const [confirmDel, setConfirmDel] = useState(null);
  const [autoResultado, setAutoResultado] = useState(null);
  const ordenados = [...trabajadores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  // Cruza por cédula los 13 códigos TNS ya conocidos contra los Trabajadores
  // de Atlas, y les llena "tnsCodigo" a los que hagan match y todavía no lo
  // tengan puesto — así no hay que escribirlos a mano uno por uno.
  async function autocompletarCodigosTNS() {
    let actualizados = 0;
    for (const t of trabajadores) {
      if (t.tnsCodigo) continue;
      const ced = normalizarCedula(t.cedula);
      if (!ced) continue;
      const match = TNS_CODIGOS_CONOCIDOS.find((c) => normalizarCedula(c.cedula) === ced);
      if (match) {
        await onSave({ ...t, tnsCodigo: match.codigo });
        actualizados++;
      }
    }
    setAutoResultado(actualizados);
  }
  // Crea o actualiza (por cédula) a los 5 trabajadores de "Fiscal Destajo"
  // conocidos del archivo BASE DE DATOS PERSONAL COPIA FINAL — deja listo el
  // catálogo base para la Nómina Fiscal Destajo sin escribirlos a mano.
  const [fdResultado, setFdResultado] = useState(null);
  async function cargarFiscalDestajoConocidos() {
    let creados = 0, actualizados = 0;
    for (const p of FISCAL_DESTAJO_CONOCIDOS) {
      const ced = normalizarCedula(p.cedula);
      const existente = trabajadores.find((t) => normalizarCedula(t.cedula) === ced);
      const datos = {
        nombre: existente?.nombre || p.nombre,
        cedula: existente?.cedula || p.cedula,
        tarifaHora: existente?.tarifaHora || 0,
        activo: existente?.activo ?? true,
        area: existente?.area || "Sin asignar",
        tnsCodigo: existente?.tnsCodigo || "",
        tipoNomina: "Fiscal Destajo",
        sueldo: p.sueldo,
        auxilioTransporte: p.auxilioTransporte,
      };
      if (existente) {
        await onSave({ id: existente.id, ...datos });
        actualizados++;
      } else {
        await onSave({ id: uid(), ...datos });
        creados++;
      }
    }
    setFdResultado({ creados, actualizados });
  }
  // Mismo patron que arriba, pero para tipoNomina "Destajo" (pago por
  // produccion, no lleva seguridad social ni sueldo fijo editable en el
  // formulario -- se guarda igual sueldo/auxilioTransporte de referencia).
  const [dResultado, setDResultado] = useState(null);
  async function cargarDestajoConocidos() {
    let creados = 0, actualizados = 0;
    for (const p of DESTAJO_CONOCIDOS) {
      const ced = normalizarCedula(p.cedula);
      const existente = trabajadores.find((t) => normalizarCedula(t.cedula) === ced);
      const datos = {
        nombre: existente?.nombre || p.nombre,
        cedula: existente?.cedula || p.cedula,
        tarifaHora: existente?.tarifaHora || 0,
        activo: existente?.activo ?? true,
        area: existente?.area || p.area || "Sin asignar",
        tnsCodigo: existente?.tnsCodigo || "",
        tipoNomina: "Destajo",
        sueldo: p.sueldo,
        auxilioTransporte: p.auxilioTransporte,
      };
      if (existente) {
        await onSave({ id: existente.id, ...datos });
        actualizados++;
      } else {
        await onSave({ id: uid(), ...datos });
        creados++;
      }
    }
    setDResultado({ creados, actualizados });
  }
  return (
    <div>
      {modal && (
        <TrabajadorModal
          trabajador={modal === "nuevo" ? null : modal}
          areasNomina={areasNomina}
          areasTNS={areasTNS}
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
        <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn onClick={() => setModal("nuevo")}>+ Nuevo Trabajador</Btn>
          <Btn variant="secondary" onClick={autocompletarCodigosTNS}>🔄 Autocompletar Código TNS (13 conocidos)</Btn>
          {autoResultado !== null && <span style={{ fontSize: 12, color: C.slate }}>{autoResultado} trabajador(es) actualizado(s).</span>}
          <Btn variant="secondary" onClick={cargarFiscalDestajoConocidos}>💼 Cargar Fiscal Destajo (5 conocidos)</Btn>
          {fdResultado !== null && <span style={{ fontSize: 12, color: C.slate }}>{fdResultado.creados} creado(s), {fdResultado.actualizados} actualizado(s).</span>}
          <Btn variant="secondary" onClick={cargarDestajoConocidos}>💼 Cargar Destajo (12 conocidos)</Btn>
          {dResultado !== null && <span style={{ fontSize: 12, color: C.slate }}>{dResultado.creados} creado(s), {dResultado.actualizados} actualizado(s).</span>}
        </div>
      )}
      <Tabla
        vacio="Sin trabajadores registrados."
        columnas={[
          { key: "nombre", label: "Nombre" },
          { key: "cedula", label: "Cédula", render: (f) => f.cedula || "—" },
          { key: "area", label: "Área Interna", render: (f) => f.area || "Sin asignar" },
          { key: "areaTNS", label: "Área TNS", render: (f) => f.areaTNS || <span style={{ color: C.slate }}>—</span> },
          { key: "tipoNomina", label: "Tipo Nómina", render: (f) => f.tipoNomina ? (
            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: f.tipoNomina === "Fiscal Destajo" ? C.violetBg : C.blueBg, color: f.tipoNomina === "Fiscal Destajo" ? C.violet : C.blue }}>
              {f.tipoNomina}
            </span>
          ) : <span style={{ color: C.slate }}>—</span> },
          { key: "sueldo", label: "Sueldo", align: "right", render: (f) => f.sueldo ? fmtMoney(f.sueldo) : "—" },
          { key: "tarifaHora", label: "Tarifa/Hora", align: "right", render: (f) => fmtMoney(f.tarifaHora) },
          { key: "tnsCodigo", label: "Código TNS", render: (f) => f.tnsCodigo ? <span style={{ color: C.green, fontWeight: 700 }}>{f.tnsCodigo}</span> : <span style={{ color: C.slate }}>—</span> },
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
// ─── CONEXIÓN TNS (paquete contable) ───────────────────────────────────────
// Solo confirma que los 3 secretos configurados en el servidor
// (TNS_CODIGO_EMPRESA, TNS_USUARIO, TNS_CONTRASENIA) sirven para loguearse en
// TNS — no trae ni envía todavía ningún dato de nómina, es el primer paso
// antes de construir el envío real de Contratos/Novedades.
// Industrias Yanko e Indutex son dos empresas separadas en TNS, cada una con
// su propio login (ver credencialesTNS en functions/index.js). Este selector
// decide con cuál juego de credenciales se loguea cada llamada — por defecto
// "yanko".
const EMPRESAS_TNS = [
  { value: "yanko", label: "Industrias Yanko BC SAS" },
  { value: "indutex", label: "Indutex" },
];
function SelectorEmpresaTNS({ empresa, onChange }) {
  return (
    <Field label="Empresa TNS">
      <FSel value={empresa} onChange={onChange} options={EMPRESAS_TNS} />
    </Field>
  );
}

function TNSConexionView() {
  const [empresa, setEmpresa] = useState("yanko");
  const [estado, setEstado] = useState(null); // null | "cargando" | "ok" | { error }
  async function probar() {
    setEstado("cargando");
    try {
      const llamar = httpsCallable(functionsClient, "probarConexionTNS");
      await llamar({ empresa });
      setEstado("ok");
    } catch (err) {
      setEstado({ error: err?.message || "No se pudo conectar." });
    }
  }

  // Consulta de catálogos de TNS — se arranca con Centro de Costo (hay un
  // GET /v2/tablas/CentroCosto/Listar) para ir cruzando los códigos reales
  // contra las ÁREAS del archivo BASE DE DATOS PERSONAL. No se conoce de
  // antemano la forma exacta de la respuesta, así que se muestra como tabla
  // si es una lista de objetos, o como JSON crudo si no calza con eso.
  const [centroCosto, setCentroCosto] = useState(null); // null | "cargando" | { filas } | { error }
  async function consultarCentroCosto() {
    setCentroCosto("cargando");
    try {
      const llamar = httpsCallable(functionsClient, "listarCentroCostoTNS");
      const resp = await llamar({ empresa });
      const data = resp.data?.data;
      const filas = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
      setCentroCosto({ filas, crudo: data });
    } catch (err) {
      setCentroCosto({ error: err?.message || "No se pudo consultar." });
    }
  }

  const [terceros, setTerceros] = useState(null); // null | "cargando" | { filas } | { error }
  async function consultarTerceros() {
    setTerceros("cargando");
    try {
      const llamar = httpsCallable(functionsClient, "listarTercerosTNS");
      const resp = await llamar({ empresa });
      const data = resp.data?.data;
      const filas = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
      setTerceros({ filas, crudo: data });
    } catch (err) {
      setTerceros({ error: err?.message || "No se pudo consultar." });
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>
        Confirma que TNS acepta las credenciales configuradas en el servidor (Firebase → Secret Manager). Esto no trae ni envía datos de nómina todavía — es solo la prueba de conexión.
      </div>
      <div style={{ maxWidth: 320, marginBottom: 16 }}>
        <SelectorEmpresaTNS empresa={empresa} onChange={setEmpresa} />
      </div>
      <Btn onClick={probar} disabled={estado === "cargando"}>
        {estado === "cargando" ? "Probando..." : "🔌 Probar conexión TNS"}
      </Btn>
      {estado === "ok" && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: C.greenBg, borderRadius: 8, color: C.green, fontWeight: 700, fontSize: 13 }}>
          ✅ Conectado — TNS aceptó las credenciales.
        </div>
      )}
      {estado && typeof estado === "object" && estado.error && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontWeight: 700, fontSize: 13 }}>
          ❌ No se pudo conectar: {estado.error}
          <div style={{ marginTop: 6, fontWeight: 500, fontSize: 12 }}>
            Revisa que hayas corrido los 3 comandos "firebase functions:secrets:set" y vuelto a desplegar con "firebase deploy --only functions".
          </div>
        </div>
      )}

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Catálogo: Centro de Costo</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>
          Trae en vivo los centros de costo que ya existen en TNS, para cruzarlos contra las ÁREAS de tu archivo de personal.
        </div>
        <Btn onClick={consultarCentroCosto} disabled={centroCosto === "cargando"}>
          {centroCosto === "cargando" ? "Consultando..." : "📋 Consultar Centro de Costo"}
        </Btn>
        {centroCosto && typeof centroCosto === "object" && centroCosto.error && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontWeight: 700, fontSize: 13 }}>
            ❌ {centroCosto.error}
          </div>
        )}
        {centroCosto && typeof centroCosto === "object" && !centroCosto.error && (
          <div style={{ marginTop: 16 }}>
            {Array.isArray(centroCosto.filas) && centroCosto.filas.length > 0 ? (
              <Tabla
                vacio="Sin centros de costo."
                columnas={Object.keys(centroCosto.filas[0]).map((k) => ({ key: k, label: k }))}
                filas={centroCosto.filas}
              />
            ) : (
              <pre style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, fontSize: 11, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(centroCosto.crudo, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Catálogo: Terceros</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>
          TNS no tiene un "Listado de Contratos" por API — lo más cercano es esto: según el manual, un empleado con contrato queda registrado también como "tercero". No sabemos todavía si trae cargo/sueldo o solo lo básico; lo consultamos para revisar la forma real.
        </div>
        <Btn onClick={consultarTerceros} disabled={terceros === "cargando"}>
          {terceros === "cargando" ? "Consultando..." : "👤 Consultar Terceros"}
        </Btn>
        {terceros && typeof terceros === "object" && terceros.error && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontWeight: 700, fontSize: 13 }}>
            ❌ {terceros.error}
          </div>
        )}
        {terceros && typeof terceros === "object" && !terceros.error && (
          <div style={{ marginTop: 16 }}>
            {Array.isArray(terceros.filas) && terceros.filas.length > 0 ? (
              <Tabla
                vacio="Sin terceros."
                columnas={Object.keys(terceros.filas[0]).map((k) => ({ key: k, label: k }))}
                filas={terceros.filas}
              />
            ) : (
              <pre style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, fontSize: 11, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {JSON.stringify(terceros.crudo, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// ─── NOVEDADES TNS (escribir novedades de nómina directo en TNS) ──────────
const TIPONOV_OPTIONS = [
  { value: "1", label: "1 — Deducible" },
  { value: "2", label: "2 — Libranza" },
  { value: "3", label: "3 — Devengado" },
  { value: "4", label: "4 — Devengados Adicionales" },
  { value: "5", label: "5 — Destajo" },
  { value: "6", label: "6 — Ausentismo" },
];
// Códigos de concepto de TNS ya confirmados a mano dentro del programa
// (Conceptos de la Nómina / Licencias de Ausentismo), 25/08/2026 — cada uno
// trae de una vez el tiponov que le corresponde para no tener que
// recordarlo. "2081 - Ausencia No Justificada" es el que usa el flujo de
// huellero (inasistencia sin novedad que la justifique).
const CONCEPTOS_TNS_CONOCIDOS = [
  { codigo: "2081", descripcion: "Ausencia No Justificada", tiponov: "6" },
  { codigo: "1120", descripcion: "Licencia No Remunerada", tiponov: "6" },
  { codigo: "1121", descripcion: "Licencia Remunerada", tiponov: "6" },
  { codigo: "1170", descripcion: "Licencia Maternidad/Paternidad", tiponov: "6" },
  { codigo: "1200", descripcion: "Licencia por Luto", tiponov: "6" },
  { codigo: "2080", descripcion: "Suspensión de Contrato", tiponov: "6" },
  { codigo: "1006", descripcion: "Sueldo - Empleado Tiempo Parcial", tiponov: "3" },
  { codigo: "1060", descripcion: "Bonificación FP", tiponov: "3" },
  { codigo: "1061", descripcion: "Bonificación No FP", tiponov: "3" },
  { codigo: "1110", descripcion: "Devengados Adicionales", tiponov: "4" },
  { codigo: "1115", descripcion: "Comisión por Ventas FP", tiponov: "3" },
];
// Solo se puede mandar una novedad a TNS para un trabajador que YA tenga
// contrato allá (campo "Código TNS" en Trabajadores) — sin eso no hay
// "codcontrato" que mandarle a TNS. Por seguridad (esto escribe en la
// nómina real), nunca se envía directo: primero se arma un resumen y solo
// se manda cuando el usuario confirma.
function NovedadesTNSView({ trabajadores }) {
  const [empresa, setEmpresa] = useState("yanko");
  const conCodigoTNS = trabajadores.filter((t) => t.tnsCodigo);
  const [trabajadorId, setTrabajadorId] = useState("");
  const [tiponov, setTiponov] = useState("");
  const [codconcepto, setCodconcepto] = useState("");
  const [fecha, setFecha] = useState(today());
  const [novsaldo, setNovsaldo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [paso, setPaso] = useState("form"); // "form" | "confirmar" | "enviando" | "ok" | { error }

  const trabajador = conCodigoTNS.find((t) => t.id === trabajadorId);
  const listoParaResumen = !!(trabajador && tiponov && codconcepto.trim());

  function limpiar() {
    setTrabajadorId(""); setTiponov(""); setCodconcepto(""); setFecha(today()); setNovsaldo(""); setObservaciones(""); setPaso("form");
  }

  async function enviar() {
    setPaso("enviando");
    try {
      const llamar = httpsCallable(functionsClient, "insertarNovedadTNS");
      await llamar({
        empresa,
        tiponov: Number(tiponov),
        codcontrato: trabajador.tnsCodigo,
        codconcepto: codconcepto.trim(),
        fecha,
        novsaldo: novsaldo === "" ? undefined : Number(novsaldo),
        observaciones: observaciones.trim() || undefined,
        descdestajo: tiponov === "5" ? "Producción por destajo (registrada desde Atlas)" : undefined,
      });
      setPaso("ok");
    } catch (err) {
      setPaso({ error: err?.message || "No se pudo enviar la novedad." });
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>
        Registra una novedad (destajo, deducible, devengado, etc.) directo en el contrato de TNS. Solo aparecen los trabajadores que ya tienen "Código TNS" puesto en la pestaña Trabajadores.
      </div>

      {conCodigoTNS.length === 0 && (
        <div style={{ padding: "12px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          Ningún trabajador tiene "Código TNS" configurado todavía. Ve a Trabajadores → "🔄 Autocompletar Código TNS" o ponlo a mano en cada uno.
        </div>
      )}

      {paso === "ok" && (
        <div style={{ padding: "14px 16px", background: C.greenBg, borderRadius: 8, color: C.green, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
          ✅ Novedad enviada a TNS correctamente.
          <div style={{ marginTop: 10 }}><Btn variant="secondary" onClick={limpiar}>Registrar otra</Btn></div>
        </div>
      )}

      {paso && typeof paso === "object" && paso.error && (
        <div style={{ padding: "14px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>
          ❌ {paso.error}
          <div style={{ marginTop: 10 }}><Btn variant="secondary" onClick={() => setPaso("confirmar")}>Volver</Btn></div>
        </div>
      )}

      {(paso === "form") && conCodigoTNS.length > 0 && (
        <>
          <SelectorEmpresaTNS empresa={empresa} onChange={setEmpresa} />
          <Field label="Trabajador (con contrato en TNS)">
            <FSel value={trabajadorId} onChange={setTrabajadorId} options={conCodigoTNS.map((t) => ({ value: t.id, label: `${t.nombre} — código ${t.tnsCodigo}` }))} placeholder="Selecciona..." />
          </Field>
          <Field label="Concepto conocido (atajo — llena Tipo de Novedad y Código solos)">
            <FSel
              value=""
              onChange={(v) => {
                const c = CONCEPTOS_TNS_CONOCIDOS.find((x) => x.codigo === v);
                if (!c) return;
                setCodconcepto(c.codigo);
                setTiponov(c.tiponov);
              }}
              options={CONCEPTOS_TNS_CONOCIDOS.map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.descripcion}` }))}
              placeholder="O escoge uno ya conocido..."
            />
          </Field>
          <Field label="Tipo de Novedad (tiponov)">
            <FSel value={tiponov} onChange={setTiponov} options={TIPONOV_OPTIONS} placeholder="Selecciona..." />
          </Field>
          <Field label="Código de Concepto (codconcepto)">
            <FInput value={codconcepto} onChange={setCodconcepto} placeholder="Se llena solo si usas el atajo de arriba, o escríbelo a mano" />
          </Field>
          <Field label="Fecha"><FInput type="date" value={fecha} onChange={setFecha} /></Field>
          <Field label="Valor (novsaldo, opcional según el tipo)"><FInput type="number" value={novsaldo} onChange={setNovsaldo} placeholder="Ej: 45000" /></Field>
          <Field label="Observaciones (opcional)"><FInput value={observaciones} onChange={setObservaciones} /></Field>
          <Btn onClick={() => setPaso("confirmar")} disabled={!listoParaResumen}>Ver resumen</Btn>
        </>
      )}

      {(paso === "confirmar" || paso === "enviando") && (
        <div>
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 10 }}>Se va a enviar a TNS:</div>
            {[
              ["Empresa TNS", EMPRESAS_TNS.find((e) => e.value === empresa)?.label],
              ["Trabajador", `${trabajador?.nombre} (código ${trabajador?.tnsCodigo})`],
              ["Tipo de Novedad", TIPONOV_OPTIONS.find((o) => o.value === tiponov)?.label],
              ["Código de Concepto", codconcepto],
              ["Fecha", fecha],
              ["Valor", novsaldo !== "" ? fmtMoney(Number(novsaldo)) : "—"],
              ["Observaciones", observaciones || "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.canvas}`, fontSize: 13 }}>
                <span style={{ color: C.slate }}>{k}</span>
                <span style={{ fontWeight: 700, color: C.ink }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setPaso("form")}>Volver a editar</Btn>
            <Btn onClick={enviar} disabled={paso === "enviando"}>{paso === "enviando" ? "Enviando..." : "✅ Confirmar y enviar a TNS"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── MOTIVOS DE AUSENCIA (vacaciones, incapacidad, permiso, etc.) ─────────
// Talento Humano registra acá el motivo de cada ausencia (con su rango de
// fechas) — el Reporte de Asistencia cruza esto contra el huellero para
// saber si un día sin marca está justificado o no.
const MOTIVOS_AUSENCIA = [
  "Vacaciones", "Incapacidad", "Licencia Remunerada", "Licencia No Remunerada",
  "Licencia Maternidad/Paternidad", "Permiso", "Luto", "Suspensión de Contrato", "Otro",
];
function AusenciaModal({ ausencia, trabajadores, onSave, onClose, trabajadorIdSugerido, fechaInicioSugerida, onDelete }) {
  const [form, setForm] = useState({
    trabajadorId: ausencia?.trabajadorId || trabajadorIdSugerido || "",
    nombreLibre: ausencia?.nombreLibre || "",
    motivo: ausencia?.motivo || "",
    fechaInicio: ausencia?.fechaInicio || fechaInicioSugerida || today(),
    fechaFin: ausencia?.fechaFin || fechaInicioSugerida || today(),
    observaciones: ausencia?.observaciones || "",
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const trabajadorSeleccionado = trabajadores.find((t) => t.id === form.trabajadorId);
  function guardar() {
    if (!form.motivo || (!form.trabajadorId && !form.nombreLibre.trim())) return;
    onSave({
      trabajadorId: form.trabajadorId || null,
      nombreLibre: form.trabajadorId ? "" : form.nombreLibre.trim(),
      nombre: form.trabajadorId ? trabajadorSeleccionado?.nombre : form.nombreLibre.trim(),
      motivo: form.motivo,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      observaciones: form.observaciones.trim(),
    });
    onClose();
  }
  return (
    <Modal title={ausencia ? "Editar Ausencia" : "Nueva Ausencia"} onClose={onClose} width={460}>
      <Field label="Trabajador (de la lista de Atlas)">
        <FSel value={form.trabajadorId} onChange={set("trabajadorId")} options={trabajadores.map((t) => ({ value: t.id, label: t.nombre }))} placeholder="Selecciona (o escribe el nombre abajo)..." />
      </Field>
      {!form.trabajadorId && (
        <Field label="O nombre (si no está en Trabajadores todavía, ej. gente del huellero de otra área)">
          <FInput value={form.nombreLibre} onChange={set("nombreLibre")} placeholder="Nombre completo tal como aparece en el huellero" />
        </Field>
      )}
      <Field label="Motivo">
        <FSel value={form.motivo} onChange={set("motivo")} options={MOTIVOS_AUSENCIA} placeholder="Selecciona..." />
      </Field>
      <Field label="Fecha Inicio"><FInput type="date" value={form.fechaInicio} onChange={set("fechaInicio")} /></Field>
      <Field label="Fecha Fin"><FInput type="date" value={form.fechaFin} onChange={set("fechaFin")} /></Field>
      <Field label="Observaciones (opcional)"><FInput value={form.observaciones} onChange={set("observaciones")} /></Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        {onDelete && (
          <div style={{ marginRight: "auto" }}>
            <Btn variant="danger" onClick={onDelete}>Borrar</Btn>
          </div>
        )}
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.motivo || (!form.trabajadorId && !form.nombreLibre.trim())}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function AusenciasView({ ausencias, trabajadores, isAdmin, currentUser, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | ausencia
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenadas = [...ausencias].sort((a, b) => (b.fechaInicio || "").localeCompare(a.fechaInicio || ""));
  return (
    <div>
      {modal && (
        <AusenciaModal
          ausencia={modal === "nuevo" ? null : modal}
          trabajadores={trabajadores}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data, registradoPor: currentUser?.name || currentUser?.username || "", registradoEn: new Date().toISOString() } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>¿Eliminar esta ausencia de <strong>{confirmDel.nombre}</strong>?</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
          </div>
        </Modal>
      )}
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 720 }}>
        Registra acá vacaciones, incapacidades, licencias, permisos, etc. — el Reporte de Asistencia cruza esto contra el huellero para saber si un día sin marca está justificado.
      </div>
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <Btn onClick={() => setModal("nuevo")}>+ Nueva Ausencia</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin ausencias registradas."
        columnas={[
          { key: "nombre", label: "Nombre" },
          { key: "motivo", label: "Motivo" },
          { key: "fechaInicio", label: "Desde", render: (f) => fmtFechaISO(f.fechaInicio) },
          { key: "fechaFin", label: "Hasta", render: (f) => fmtFechaISO(f.fechaFin) },
          { key: "observaciones", label: "Observaciones", render: (f) => f.observaciones || "—" },
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
        filas={ordenadas}
      />
    </div>
  );
}
// ─── PERMISOS (calendario mensual: quien vino, quien tiene permiso) ───
const MOTIVO_ICONO = {
  "Vacaciones": "🏖️",
  "Incapacidad": "🩺",
  "Licencia Remunerada": "📄",
  "Licencia No Remunerada": "📄",
  "Licencia Maternidad/Paternidad": "👶",
  "Permiso": "🟡",
  "Luto": "🖤",
  "Suspensión de Contrato": "⛔",
  "Otro": "❔",
};
function PermisosCalendarioView({ trabajadores, produccion, horas, ausencias, currentUser, isAdmin, onSave, onDelete }) {
  const [ref, setRef] = useState(today().slice(0, 7)); // "YYYY-MM"
  const [modal, setModal] = useState(null); // null | { nuevo, trabajadorId, fechaInicio } | ausencia existente
  const [anioStr, mesStr] = ref.split("-");
  const anio = Number(anioStr);
  const mes = Number(mesStr); // 1-12
  const diasEnMes = new Date(anio, mes, 0).getDate();
  const dias = Array.from({ length: diasEnMes }, (_, i) => i + 1);
  function fechaISO(d) {
    return `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function cambiarMes(delta) {
    const d = new Date(anio, mes - 1 + delta, 1);
    setRef(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function ausenciaDelDia(trabajadorId, diaISO) {
    return ausencias.find((a) => a.trabajadorId === trabajadorId && a.fechaInicio <= diaISO && a.fechaFin >= diaISO);
  }
  function vinoElDia(trabajadorId, diaISO) {
    return produccion.some((p) => p.trabajadorId === trabajadorId && p.fecha === diaISO)
      || horas.some((h) => h.trabajadorId === trabajadorId && h.fecha === diaISO);
  }
  function abrirCelda(trabajadorId, diaISO) {
    const existente = ausenciaDelDia(trabajadorId, diaISO);
    if (existente) { setModal(existente); return; }
    setModal({ nuevo: true, trabajadorId, fechaInicio: diaISO });
  }
  const hoyISO = today();
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Vista rápida del mes: ✅ = tiene producción u horas registradas ese día (vino a trabajar). Un ícono de color = tiene un permiso/ausencia registrada (pasa el mouse para ver el motivo). Click en una celda vacía para registrar un permiso nuevo.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Btn variant="secondary" onClick={() => cambiarMes(-1)}>← Mes anterior</Btn>
        <div style={{ fontWeight: 700, color: C.ink, minWidth: 160, textAlign: "center", textTransform: "capitalize" }}>
          {new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
        </div>
        <Btn variant="secondary" onClick={() => cambiarMes(1)}>Mes siguiente →</Btn>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: C.white, padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, minWidth: 160 }}>Trabajador</th>
              {dias.map((d) => (
                <th key={d} style={{ padding: "6px 4px", textAlign: "center", borderBottom: `1px solid ${C.border}`, color: fechaISO(d) === hoyISO ? C.blue : C.slate, minWidth: 30 }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trabajadores.map((t) => (
              <tr key={t.id}>
                <td style={{ position: "sticky", left: 0, background: C.white, padding: "6px 10px", borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{t.nombre}</td>
                {dias.map((d) => {
                  const diaISO = fechaISO(d);
                  const a = ausenciaDelDia(t.id, diaISO);
                  const vino = !a && vinoElDia(t.id, diaISO);
                  return (
                    <td
                      key={d}
                      onClick={() => abrirCelda(t.id, diaISO)}
                      title={a ? `${a.motivo}${a.observaciones ? " — " + a.observaciones : ""}` : (vino ? "Vino (con producción/horas registradas)" : "Sin registro — click para agregar permiso")}
                      style={{ padding: "4px 2px", textAlign: "center", borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: diaISO === hoyISO ? C.blueBg : "transparent" }}
                    >
                      {a ? (MOTIVO_ICONO[a.motivo] || "❔") : (vino ? "✅" : "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trabajadores.length === 0 && (
        <div style={{ marginTop: 16, color: C.slate, fontSize: 13 }}>No hay trabajadores para mostrar.</div>
      )}
      {modal && (
        <AusenciaModal
          ausencia={modal.nuevo ? null : modal}
          trabajadores={trabajadores}
          trabajadorIdSugerido={modal.nuevo ? modal.trabajadorId : null}
          fechaInicioSugerida={modal.nuevo ? modal.fechaInicio : null}
          onSave={(data) => onSave(modal.nuevo ? { id: uid(), ...data, registradoPor: currentUser?.name || currentUser?.username || "", registradoEn: new Date().toISOString() } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
          onDelete={!modal.nuevo && (isAdmin || modal.registradoPor === (currentUser?.name || currentUser?.username)) ? () => { onDelete(modal.id); setModal(null); } : null}
        />
      )}
    </div>
  );
}
// ─── REPORTE DE ASISTENCIA (cruza el huellero contra los Motivos de Ausencia) ─
// El reporte del huellero ("Reporte de Entradas y Salidas Horizontal") viene
// en un formato ancho/raro: bloques por persona (ID/Nombre/Departamento) y
// luego filas con 2 días cada una, cada día con un par de marcas
// (fecha+hora, "Entrada"/"Salida") repartidas en columnas sueltas — no es
// una tabla normal de una fila por marca. Este parser reconstruye, por
// persona, la lista de marcas (fecha+hora, tipo) recorriendo cada fila y
// buscando el patrón "fecha/hora" seguido del próximo texto no vacío.
function normalizarNombreHuellero(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, " ");
}
function parseHuelleroXLS(aoa) {
  const DT_RE = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/;
  function celda(v) {
    if (v instanceof Date) {
      const p = (n) => String(n).padStart(2, "0");
      return `${p(v.getDate())}/${p(v.getMonth() + 1)}/${v.getFullYear()} ${p(v.getHours())}:${p(v.getMinutes())}`;
    }
    return String(v ?? "").trim();
  }
  function buscarDespuesDe(vals, label) {
    const norm = label.trim().toLowerCase();
    for (let i = 0; i < vals.length; i++) {
      if (vals[i].trim().toLowerCase() === norm) {
        for (let j = i + 1; j < vals.length; j++) {
          if (vals[j] !== "") return vals[j];
        }
      }
    }
    return null;
  }
  let desde = null;
  let hasta = null;
  const empleados = [];
  let cur = null;
  for (const rawRow of aoa) {
    const vals = (rawRow || []).map(celda);
    if (!vals.some((v) => v !== "")) continue;
    if (!desde) { const d = buscarDespuesDe(vals, "Desde"); if (d) desde = d; }
    if (!hasta) { const h = buscarDespuesDe(vals, "Hasta"); if (h) hasta = h; }
    if (vals.includes("ID") && vals.some((v) => v.toLowerCase().startsWith("nombre"))) {
      const id = buscarDespuesDe(vals, "ID");
      const nombre = buscarDespuesDe(vals, "Nombre");
      const depto = buscarDespuesDe(vals, "Departamento");
      cur = { id, nombre: nombre || "", depto: depto || "", marcas: [] };
      empleados.push(cur);
      continue;
    }
    if (!cur) continue;
    let i = 0;
    while (i < vals.length) {
      if (DT_RE.test(vals[i])) {
        let j = i + 1;
        while (j < vals.length && vals[j] === "") j++;
        const tipo = j < vals.length && (vals[j] === "Entrada" || vals[j] === "Salida") ? vals[j] : "?";
        cur.marcas.push({ fechaHora: vals[i], tipo });
        i = tipo !== "?" ? j + 1 : i + 1;
      } else {
        i++;
      }
    }
  }
  return { desde, hasta, empleados };
}
// dd/mm/aaaa -> aaaa-mm-dd, para comparar contra fechaInicio/fechaFin (que
// ya están en ese formato porque salen de un <input type="date">).
function fechaHuelleroAISO(f) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(f || "");
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function listaDeDiasISO(desdeISO, hastaISO) {
  const out = [];
  if (!desdeISO || !hastaISO) return out;
  const d0 = new Date(desdeISO + "T00:00:00");
  const d1 = new Date(hastaISO + "T00:00:00");
  for (let d = d0; d <= d1; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function ReporteAsistenciaView({ ausencias, trabajadores }) {
  const fileRef = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [reporte, setReporte] = useState(null); // { desde, hasta, filas }
  const [excluirDomingos, setExcluirDomingos] = useState(true);
  const [soloConFaltas, setSoloConFaltas] = useState(true);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setReporte(null);
    setCargando(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      const { desde, hasta, empleados } = parseHuelleroXLS(aoa);
      if (!empleados.length) {
        setError("No se encontraron bloques de empleados (ID/Nombre/Departamento) en el archivo — ¿es el reporte horizontal del huellero?");
        return;
      }
      const desdeISO = fechaHuelleroAISO(desde);
      const hastaISO = fechaHuelleroAISO(hasta);
      const diasPeriodo = listaDeDiasISO(desdeISO, hastaISO);

      const filas = empleados.map((emp) => {
        const diasConMarca = new Set(emp.marcas.map((m) => m.fechaHora.split(" ")[0]).map((f) => fechaHuelleroAISO(f)));
        const nombreNorm = normalizarNombreHuellero(emp.nombre);
        const ausenciasPersona = ausencias.filter((a) => normalizarNombreHuellero(a.nombre) === nombreNorm);
        const diasSinMarca = diasPeriodo.filter((iso) => {
          if (diasConMarca.has(iso)) return false;
          if (excluirDomingos && new Date(iso + "T00:00:00").getDay() === 0) return false;
          return true;
        });
        const detalle = diasSinMarca.map((iso) => {
          const motivo = ausenciasPersona.find((a) => a.fechaInicio <= iso && iso <= a.fechaFin);
          return { fecha: iso, motivo: motivo ? motivo.motivo : null };
        });
        const sinJustificar = detalle.filter((d) => !d.motivo);
        return {
          id: emp.id,
          nombre: emp.nombre,
          depto: emp.depto,
          totalDias: diasPeriodo.length,
          diasConMarca: diasConMarca.size,
          diasSinMarca: detalle.length,
          sinJustificar: sinJustificar.length,
          detalle,
        };
      });

      setReporte({ desde, hasta, filas });
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setCargando(false);
    }
  }

  // Guarda en Firestore los días sin justificar de este reporte — sin esto,
  // el resultado solo vive en la pantalla mientras está abierta. Con esto
  // guardado, la Nómina Fiscal Destajo puede leerlos solos (cruzando por
  // nombre) para descontar el día sin que nadie tenga que contarlos a mano.
  const [guardandoFaltas, setGuardandoFaltas] = useState(false);
  const [faltasGuardadas, setFaltasGuardadas] = useState(null);
  async function guardarFaltasEnAtlas() {
    if (!reporte) return;
    setGuardandoFaltas(true);
    try {
      const batch = writeBatch(db);
      let n = 0;
      for (const f of reporte.filas) {
        const nombreNorm = normalizarNombreHuellero(f.nombre);
        for (const d of f.detalle) {
          if (d.motivo) continue; // solo se guardan los SIN justificar
          const id = `${nombreNorm}__${d.fecha}`;
          batch.set(doc(db, "nomina_faltas_sin_justificar", id), {
            nombre: f.nombre,
            nombreNorm,
            fecha: d.fecha,
            origen: "huellero",
            cargadoEn: new Date().toISOString(),
          });
          n++;
        }
      }
      await batch.commit();
      setFaltasGuardadas(n);
    } finally {
      setGuardandoFaltas(false);
    }
  }

  const filasMostradas = reporte ? reporte.filas.filter((f) => !soloConFaltas || f.sinJustificar > 0).sort((a, b) => b.sinJustificar - a.sinJustificar) : [];
  const totalSinJustificar = reporte ? reporte.filas.reduce((s, f) => s + f.sinJustificar, 0) : 0;
  const personasConFaltas = reporte ? reporte.filas.filter((f) => f.sinJustificar > 0).length : 0;
  const motivosCount = {};
  if (reporte) {
    for (const f of reporte.filas) {
      for (const d of f.detalle) {
        const k = d.motivo || "SIN JUSTIFICAR";
        motivosCount[k] = (motivosCount[k] || 0) + 1;
      }
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 760 }}>
        Sube el reporte del huellero ("Reporte de Entradas y Salidas Horizontal", .xls o .xlsx) y Atlas calcula, persona por persona, los días sin marcación dentro del período — cruzados contra los Motivos de Ausencia ya registrados, para saber cuáles quedan sin justificar.
      </div>
      <div onClick={() => fileRef.current.click()} style={{ border: `2px dashed ${C.blue}`, borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", background: C.blueBg, marginBottom: 16, maxWidth: 480 }}>
        <div style={{ fontSize: 26, marginBottom: 6 }}>📂</div>
        <div style={{ fontWeight: 700, color: C.ink }}>{cargando ? "Procesando..." : "Subir reporte del huellero (.xls/.xlsx)"}</div>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: "none" }} onChange={handleFile} />
      </div>
      {error && <div style={{ padding: "10px 14px", background: C.redBg, borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 16, maxWidth: 760 }}>⚠ {error}</div>}

      {reporte && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="📅" label="Período" value={`${reporte.desde || "?"} — ${reporte.hasta || "?"}`} color={C.blue} bg={C.blueBg} />
            <KPI icon="🚫" label="Días sin justificar" value={fmtNum(totalSinJustificar)} color={C.red} bg={C.redBg} />
            <KPI icon="🧑" label="Personas con alguna falta" value={fmtNum(personasConFaltas)} color={C.amber} bg={C.amberBg || C.canvas} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <Btn onClick={guardarFaltasEnAtlas} disabled={guardandoFaltas}>
              {guardandoFaltas ? "Guardando..." : "💾 Guardar días sin justificar en Atlas"}
            </Btn>
            {faltasGuardadas !== null && (
              <span style={{ marginLeft: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>
                ✅ {faltasGuardadas} día(s) guardado(s) — ya quedan disponibles para descontar en Nómina Fiscal Destajo.
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.entries(motivosCount).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => (
              <div key={motivo} style={{ padding: "8px 14px", borderRadius: 8, background: motivo === "SIN JUSTIFICAR" ? C.redBg : C.canvas, border: `1px solid ${C.border}`, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: motivo === "SIN JUSTIFICAR" ? C.red : C.ink }}>{motivo}</span>: {n} día(s)
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.slate, cursor: "pointer" }}>
              <input type="checkbox" checked={excluirDomingos} onChange={(e) => setExcluirDomingos(e.target.checked)} /> No contar domingos como falta
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.slate, cursor: "pointer" }}>
              <input type="checkbox" checked={soloConFaltas} onChange={(e) => setSoloConFaltas(e.target.checked)} /> Mostrar solo quienes tienen faltas sin justificar
            </label>
          </div>

          <Tabla
            vacio="Nadie con faltas sin justificar en este período 🎉"
            columnas={[
              { key: "nombre", label: "Nombre" },
              { key: "depto", label: "Departamento" },
              { key: "diasConMarca", label: "Días con marca", align: "right" },
              { key: "diasSinMarca", label: "Días sin marca", align: "right" },
              { key: "sinJustificar", label: "Sin justificar", align: "right", render: (f) => (
                <span style={{ fontWeight: 800, color: f.sinJustificar > 0 ? C.red : C.green }}>{f.sinJustificar}</span>
              ) },
              { key: "detalle", label: "Fechas sin justificar", render: (f) => {
                const pend = f.detalle.filter((d) => !d.motivo);
                if (!pend.length) return "—";
                return pend.map((d) => fmtFechaISO(d.fecha)).join(", ");
              } },
            ]}
            filas={filasMostradas}
          />
        </>
      )}
    </div>
  );
}
// ─── NÓMINA FISCAL DESTAJO (sueldo fijo hospedado en Atlas — sin seguridad
// social, con parafiscales) ─────────────────────────────────────────────
// Reglas confirmadas con el usuario (25/08/2026):
//  - Quincenal: Q1 = días 1-15, Q2 = 16-fin de mes.
//  - Mes comercial de 30 días → valor día = sueldo/30 (igual para el
//    auxilio de transporte); se descuenta por cada día sin justificar.
//  - Los días sin justificar salen solos de "nomina_faltas_sin_justificar"
//    (lo que guarda Reporte de Asistencia desde el huellero), cruzando por
//    nombre normalizado — no hay que contarlos a mano.
//  - Parafiscales son PROVISIÓN (no se pagan en la quincena, se acumulan):
//    cesantías 8.33% mensual, prima 8.33% mensual, vacaciones 4.17%
//    mensual — se aplican sobre el sueldo YA neto de inasistencias de esa
//    quincena (una tasa mensual sobre una base quincenal da la mitad, que
//    es lo correcto). Intereses de cesantías = 12% anual sobre el SALDO
//    acumulado antes de esta quincena (12%/24, porque hay 24 quincenas al
//    año).
const TASA_CESANTIAS_MENSUAL = 0.0833;
const TASA_PRIMA_MENSUAL = 0.0833;
const TASA_VACACIONES_MENSUAL = 0.0417;
const TASA_INTERES_CESANTIAS_ANUAL = 0.12;
// Confirmado con el usuario (26/08/2026): las provisiones SÍ se calculan
// sobre el sueldo ya descontado por inasistencia de esa quincena (si faltó
// sin justificar, ese día tampoco causa cesantías/prima/vacaciones — igual
// que en la ley). Se deja como constante aparte, no metido en la fórmula,
// para poder cambiarlo a "sobre el sueldo completo" con un solo switch acá
// si más adelante se necesita.
const PARAFISCALES_SOBRE_SUELDO_DESCONTADO = true;
function rangoQuincena(anio, mes, quincena) {
  const mm = String(mes).padStart(2, "0");
  if (Number(quincena) === 1) {
    return { inicio: `${anio}-${mm}-01`, fin: `${anio}-${mm}-15` };
  }
  const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate();
  return { inicio: `${anio}-${mm}-16`, fin: `${anio}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
}
function calcularLiquidacionFiscalDestajo(trabajador, diasInasistencia) {
  const sueldo = Number(trabajador.sueldo) || 0;
  const auxilio = Number(trabajador.auxilioTransporte) || 0;
  const descuentoSueldo = (sueldo / 30) * diasInasistencia;
  const descuentoAuxilio = (auxilio / 30) * diasInasistencia;
  const sueldoQuincena = Math.max(0, sueldo / 2 - descuentoSueldo);
  const auxilioQuincena = Math.max(0, auxilio / 2 - descuentoAuxilio);
  const saldoCesantiasInicio = Number(trabajador.cesantiasAcumuladas) || 0;
  const baseParafiscales = PARAFISCALES_SOBRE_SUELDO_DESCONTADO ? sueldoQuincena : sueldo / 2;
  const cesantiasPeriodo = baseParafiscales * TASA_CESANTIAS_MENSUAL;
  const interesesPeriodo = saldoCesantiasInicio * (TASA_INTERES_CESANTIAS_ANUAL / 24);
  const primaPeriodo = baseParafiscales * TASA_PRIMA_MENSUAL;
  const vacacionesPeriodo = baseParafiscales * TASA_VACACIONES_MENSUAL;
  return {
    diasInasistencia, descuentoSueldo, descuentoAuxilio, sueldoQuincena, auxilioQuincena,
    netoAPagar: sueldoQuincena + auxilioQuincena,
    cesantiasPeriodo, interesesPeriodo, primaPeriodo, vacacionesPeriodo,
    saldoCesantiasInicio, saldoCesantiasFin: saldoCesantiasInicio + cesantiasPeriodo,
  };
}
function NominaFiscalDestajoView({ trabajadores, faltas, liquidaciones, onGuardarTrabajador, onGuardarLiquidacion }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");
  const [resultados, setResultados] = useState(null); // null | [{trabajador, calculo}]
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const personas = trabajadores.filter((t) => t.tipoNomina === "Fiscal Destajo" && t.activo !== false);
  const periodoId = `${anio}-${mes}-Q${quincena}`;
  const yaLiquidado = liquidaciones.some((l) => l.periodoId === periodoId);
  const { inicio, fin } = rangoQuincena(anio, mes, quincena);

  function calcular() {
    const filas = personas.map((t) => {
      const nombreNorm = normalizarNombreHuellero(t.nombre);
      const dias = faltas.filter((f) => f.nombreNorm === nombreNorm && f.fecha >= inicio && f.fecha <= fin).length;
      return { trabajador: t, calculo: calcularLiquidacionFiscalDestajo(t, dias) };
    });
    setResultados(filas);
    setGuardadoOk(false);
  }

  async function confirmarYGuardar() {
    if (!resultados) return;
    setGuardando(true);
    try {
      for (const { trabajador, calculo } of resultados) {
        await onGuardarLiquidacion({
          id: `${trabajador.id}__${periodoId}`,
          periodoId, trabajadorId: trabajador.id, nombre: trabajador.nombre,
          inicio, fin, ...calculo,
          confirmadaEn: new Date().toISOString(),
        });
        await onGuardarTrabajador({ ...trabajador, cesantiasAcumuladas: calculo.saldoCesantiasFin });
      }
      setGuardadoOk(true);
    } finally {
      setGuardando(false);
    }
  }

  const totales = resultados ? resultados.reduce((s, r) => ({
    neto: s.neto + r.calculo.netoAPagar,
    cesantias: s.cesantias + r.calculo.cesantiasPeriodo,
    intereses: s.intereses + r.calculo.interesesPeriodo,
    prima: s.prima + r.calculo.primaPeriodo,
    vacaciones: s.vacaciones + r.calculo.vacacionesPeriodo,
  }), { neto: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 }) : null;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Liquidación quincenal de los trabajadores "Fiscal Destajo" (sueldo fijo, sin seguridad social, con parafiscales) — se hospeda acá en Atlas, no se envía a TNS. Los días de inasistencia sin justificar salen solos de lo que guardaste en Reporte de Asistencia.
      </div>
      {personas.length === 0 && (
        <div style={{ padding: "12px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          Nadie tiene tipo de nómina "Fiscal Destajo" todavía. Ve a Trabajadores → "💼 Cargar Fiscal Destajo (5 conocidos)".
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <Field label="Año"><FInput type="number" value={anio} onChange={setAnio} /></Field>
        <Field label="Mes">
          <FSel value={mes} onChange={setMes} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: String(i + 1).padStart(2, "0") }))} />
        </Field>
        <Field label="Quincena">
          <FSel value={quincena} onChange={setQuincena} options={[{ value: "1", label: "1 (días 1-15)" }, { value: "2", label: "2 (16-fin de mes)" }]} />
        </Field>
        <Btn onClick={calcular} disabled={personas.length === 0}>🧮 Calcular</Btn>
      </div>

      {yaLiquidado && (
        <div style={{ padding: "10px 14px", background: C.amberBg, borderRadius: 8, color: C.amber, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          ⚠ Esta quincena ({periodoId}) ya fue confirmada antes. Si vuelves a confirmar, se sobreescribe.
        </div>
      )}

      {resultados && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="💵" label="Neto a pagar (total)" value={fmtMoney(totales.neto)} color={C.green} bg={C.greenBg} />
            <KPI icon="📦" label="Cesantías (provisión)" value={fmtMoney(totales.cesantias)} color={C.violet} bg={C.violetBg} />
            <KPI icon="🎁" label="Prima (provisión)" value={fmtMoney(totales.prima)} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏖️" label="Vacaciones (provisión)" value={fmtMoney(totales.vacaciones)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="Sin resultados."
            columnas={[
              { key: "nombre", label: "Nombre", render: (f) => f.trabajador.nombre },
              { key: "dias", label: "Días sin justificar", align: "right", render: (f) => (
                <span style={{ fontWeight: 800, color: f.calculo.diasInasistencia > 0 ? C.red : C.green }}>{f.calculo.diasInasistencia}</span>
              ) },
              { key: "sueldoQuincena", label: "Sueldo quincena", align: "right", render: (f) => fmtMoney(f.calculo.sueldoQuincena) },
              { key: "auxilioQuincena", label: "Auxilio quincena", align: "right", render: (f) => fmtMoney(f.calculo.auxilioQuincena) },
              { key: "netoAPagar", label: "Neto a pagar", align: "right", render: (f) => <strong>{fmtMoney(f.calculo.netoAPagar)}</strong> },
              { key: "cesantiasPeriodo", label: "Cesantías (prov.)", align: "right", render: (f) => fmtMoney(f.calculo.cesantiasPeriodo) },
              { key: "interesesPeriodo", label: "Intereses cesantías", align: "right", render: (f) => fmtMoney(f.calculo.interesesPeriodo) },
              { key: "primaPeriodo", label: "Prima (prov.)", align: "right", render: (f) => fmtMoney(f.calculo.primaPeriodo) },
              { key: "vacacionesPeriodo", label: "Vacaciones (prov.)", align: "right", render: (f) => fmtMoney(f.calculo.vacacionesPeriodo) },
            ]}
            filas={resultados}
          />
          <div style={{ marginTop: 16 }}>
            <Btn onClick={confirmarYGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "✅ Confirmar y guardar liquidación de la quincena"}
            </Btn>
            {guardadoOk && <span style={{ marginLeft: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>✅ Liquidación guardada — el acumulado de cesantías de cada uno ya quedó actualizado.</span>}
          </div>
        </>
      )}
    </div>
  );
}
function exportReciboLiquidacionHTML({ tipoNomina, trabajador, liquidacion }) {
  const fechaGen = new Date().toISOString().slice(0, 10);
  const esFiscal = tipoNomina === "Fiscal Destajo";
  const nombre = trabajador?.nombre || liquidacion.nombre || "—";
  const cedula = trabajador?.cedula || "—";
  const area = trabajador?.area || "—";
  const sueldoBasico = Number(trabajador?.sueldo) || 0;
  const auxilioBasico = Number(trabajador?.auxilioTransporte) || 0;
  const totalPrestaciones = (liquidacion.cesantiasPeriodo || 0) + (liquidacion.interesesPeriodo || 0) + (liquidacion.primaPeriodo || 0) + (liquidacion.vacacionesPeriodo || 0);
  const filasPago = esFiscal
    ? `
      <tr><td>Sueldo básico (mensual)</td><td style="text-align:right">${fmtMoney(sueldoBasico)}</td></tr>
      <tr><td>Auxilio de transporte (mensual)</td><td style="text-align:right">${fmtMoney(auxilioBasico)}</td></tr>
      <tr><td>Días sin justificar</td><td style="text-align:right">${liquidacion.diasInasistencia || 0}</td></tr>
      <tr><td>Descuento por inasistencia</td><td style="text-align:right;color:#B23A48">-${fmtMoney((liquidacion.descuentoSueldo || 0) + (liquidacion.descuentoAuxilio || 0))}</td></tr>
      <tr><td>Sueldo quincena</td><td style="text-align:right">${fmtMoney(liquidacion.sueldoQuincena)}</td></tr>
      <tr><td>Auxilio quincena</td><td style="text-align:right">${fmtMoney(liquidacion.auxilioQuincena)}</td></tr>`
    : `
      <tr><td>Producción registrada en la quincena</td><td style="text-align:right">${fmtMoney(liquidacion.netoAPagar)}</td></tr>
      <tr><td colspan="2" style="color:#5A5A7A;font-size:11px;padding-top:2px">Sueldo básico de referencia: ${fmtMoney(sueldoBasico)} · Auxilio de referencia: ${fmtMoney(auxilioBasico)} — solo se usan para calcular las prestaciones sociales, no hacen parte del pago.</td></tr>`;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Recibo de Liquidación — ${nombre}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#F7F4F0;color:#1A1A2E;padding:32px}
  @media print{body{padding:0;background:#fff}}
  .page{max-width:820px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 32px rgba(26,26,46,0.1)}
  .header{background:linear-gradient(135deg,#1A1A2E 0%,#2D1B69 100%);padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
  .header-left h1{color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.3px}
  .header-left p{color:#C8B8A2;font-size:12px;margin-top:4px}
  .header-right{text-align:right}
  .header-right .badge{background:rgba(200,184,162,0.2);border:1px solid #C8B8A2;border-radius:8px;padding:8px 16px;color:#C8B8A2;font-size:13px;font-weight:700}
  .body{padding:28px 32px}
  .info-row{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px}
  .info-card{background:#F7F4F0;border-radius:8px;padding:12px 14px;border:1px solid #E8E2DB}
  .info-card label{display:block;font-size:10px;font-weight:700;color:#5A5A7A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px}
  .info-card span{font-size:14px;font-weight:700;color:#1A1A2E}
  .section-title{font-size:14px;font-weight:800;color:#1A1A2E;margin:22px 0 10px;padding-bottom:8px;border-bottom:2px solid #E8E2DB}
  table{width:100%;border-collapse:collapse;font-size:13px}
  table td{padding:8px 10px;border-bottom:1px solid #F0ECE6}
  table td:first-child{color:#5A5A7A}
  .totales{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .total-card{border-radius:10px;padding:14px 16px;text-align:center}
  .total-card label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;opacity:0.85}
  .total-card .val{font-size:19px;font-weight:900}
  .firma{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .firma div{border-top:1px solid #1A1A2E;padding-top:8px;text-align:center;font-size:11px;color:#5A5A7A}
  .footer{background:#F7F4F0;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E8E2DB;font-size:12px;color:#5A5A7A}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>🧾 Recibo de Liquidación</h1>
      <p>Industrias Yanko · Nómina ${tipoNomina}</p>
    </div>
    <div class="header-right">
      <div class="badge">${liquidacion.periodoId || ""}</div>
      <div style="color:#C8B8A2;font-size:11px;margin-top:8px">${fechaGen}</div>
    </div>
  </div>
  <div class="body">
    <div class="info-row">
      <div class="info-card"><label>Trabajador</label><span>${nombre}</span></div>
      <div class="info-card"><label>Cédula</label><span>${cedula}</span></div>
      <div class="info-card"><label>Área</label><span>${area}</span></div>
      <div class="info-card"><label>Tipo de nómina</label><span>${tipoNomina}</span></div>
    </div>
    <div class="section-title">💰 Pago de la quincena</div>
    <table><tbody>${filasPago}</tbody></table>
    <div class="section-title">📦 Prestaciones sociales (provisión de esta quincena)</div>
    <table><tbody>
      <tr><td>Cesantías</td><td style="text-align:right">${fmtMoney(liquidacion.cesantiasPeriodo)}</td></tr>
      <tr><td>Intereses de cesantías</td><td style="text-align:right">${fmtMoney(liquidacion.interesesPeriodo)}</td></tr>
      <tr><td>Prima</td><td style="text-align:right">${fmtMoney(liquidacion.primaPeriodo)}</td></tr>
      <tr><td>Vacaciones</td><td style="text-align:right">${fmtMoney(liquidacion.vacacionesPeriodo)}</td></tr>
      <tr><td>Saldo acumulado de cesantías (a la fecha)</td><td style="text-align:right">${fmtMoney(liquidacion.saldoCesantiasFin)}</td></tr>
    </tbody></table>
    <div class="totales">
      <div class="total-card" style="background:#EBF7F2;color:#2D9E6B"><label>Neto a Pagar</label><div class="val">${fmtMoney(liquidacion.netoAPagar)}</div></div>
      <div class="total-card" style="background:#F3EEF9;color:#7B5EA7"><label>Total Prestaciones Provisionadas</label><div class="val">${fmtMoney(totalPrestaciones)}</div></div>
    </div>
    <div class="firma">
      <div>Firma del Trabajador</div>
      <div>Firma quien Autoriza</div>
    </div>
  </div>
  <div class="footer">
    <span>ATLAS · Industrias Yanko</span>
    <span>Período: ${liquidacion.inicio ? fmtFechaISO(liquidacion.inicio) : ""} — ${liquidacion.fin ? fmtFechaISO(liquidacion.fin) : ""} · Generado el ${new Date().toLocaleDateString("es-CO", { dateStyle: "long" })}</span>
    <button onclick="window.print()" style="background:#1A1A2E;color:#C8B8A2;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:700">🖨 Imprimir / PDF</button>
  </div>
</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Recibo_Liquidacion_${(nombre || "trabajador").replace(/\s+/g, "_")}_${liquidacion.periodoId || ""}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── HISTORIAL FISCAL DESTAJO (quincenas ya confirmadas) ──────────────────
function HistorialFiscalDestajoView({ liquidaciones, trabajadores }) {
  const periodos = [...new Set(liquidaciones.map((l) => l.periodoId))].sort().reverse();
  const [periodoFiltro, setPeriodoFiltro] = useState("");
  const filas = [...liquidaciones]
    .filter((l) => !periodoFiltro || l.periodoId === periodoFiltro)
    .sort((a, b) => (b.periodoId || "").localeCompare(a.periodoId || "") || (a.nombre || "").localeCompare(b.nombre || ""));
  const totales = filas.reduce((s, l) => ({
    neto: s.neto + (l.netoAPagar || 0),
    cesantias: s.cesantias + (l.cesantiasPeriodo || 0),
    intereses: s.intereses + (l.interesesPeriodo || 0),
    prima: s.prima + (l.primaPeriodo || 0),
    vacaciones: s.vacaciones + (l.vacacionesPeriodo || 0),
  }), { neto: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 });
  function descargarRecibo(l) {
    const trabajador = (trabajadores || []).find((t) => t.id === l.trabajadorId);
    exportReciboLiquidacionHTML({ tipoNomina: "Fiscal Destajo", trabajador, liquidacion: l });
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Todas las quincenas de Nómina Fiscal Destajo ya confirmadas y guardadas — para consultar o comparar períodos pasados.
      </div>
      {liquidaciones.length === 0 ? (
        <div style={{ padding: "12px 16px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, color: C.slate, fontSize: 13, maxWidth: 480 }}>
          Todavía no hay ninguna quincena confirmada. Ve a "Nómina Fiscal Destajo", calcula una y dale "Confirmar y guardar".
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, maxWidth: 260 }}>
            <Field label="Filtrar por período">
              <FSel value={periodoFiltro} onChange={setPeriodoFiltro} options={periodos.map((p) => ({ value: p, label: p }))} placeholder="Todos los períodos" />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="💵" label="Neto pagado (total)" value={fmtMoney(totales.neto)} color={C.green} bg={C.greenBg} />
            <KPI icon="📦" label="Cesantías (provisión)" value={fmtMoney(totales.cesantias)} color={C.violet} bg={C.violetBg} />
            <KPI icon="📈" label="Intereses cesantías" value={fmtMoney(totales.intereses)} color={C.violet} bg={C.violetBg} />
            <KPI icon="🎁" label="Prima (provisión)" value={fmtMoney(totales.prima)} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏖️" label="Vacaciones (provisión)" value={fmtMoney(totales.vacaciones)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="Sin resultados para este período."
            columnas={[
              { key: "periodoId", label: "Período" },
              { key: "nombre", label: "Nombre" },
              { key: "diasInasistencia", label: "Días sin justificar", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: f.diasInasistencia > 0 ? C.red : C.green }}>{f.diasInasistencia || 0}</span>
              ) },
              { key: "sueldoQuincena", label: "Sueldo quincena", align: "right", render: (f) => fmtMoney(f.sueldoQuincena) },
              { key: "auxilioQuincena", label: "Auxilio quincena", align: "right", render: (f) => fmtMoney(f.auxilioQuincena) },
              { key: "netoAPagar", label: "Neto a pagar", align: "right", render: (f) => <strong>{fmtMoney(f.netoAPagar)}</strong> },
              { key: "cesantiasPeriodo", label: "Cesantías (prov.)", align: "right", render: (f) => fmtMoney(f.cesantiasPeriodo) },
              { key: "interesesPeriodo", label: "Intereses cesantías", align: "right", render: (f) => fmtMoney(f.interesesPeriodo) },
              { key: "primaPeriodo", label: "Prima (prov.)", align: "right", render: (f) => fmtMoney(f.primaPeriodo) },
              { key: "vacacionesPeriodo", label: "Vacaciones (prov.)", align: "right", render: (f) => fmtMoney(f.vacacionesPeriodo) },
              { key: "confirmadaEn", label: "Confirmada", render: (f) => f.confirmadaEn ? new Date(f.confirmadaEn).toLocaleString("es-CO") : "—" },
              { key: "acciones", label: "", align: "right", render: (f) => (
                <span onClick={() => descargarRecibo(f)} style={{ cursor: "pointer", color: C.blue, fontWeight: 700 }} title="Descargar recibo de liquidación">🖨</span>
              ) },
            ]}
            filas={filas}
          />
        </>
      )}
    </div>
  );
}
// ─── NÓMINA DESTAJO (pago por producción — provisiona prestaciones sobre un
// sueldo de referencia, igual patrón que Fiscal Destajo) ──────────────────
// Reglas confirmadas con el usuario (30/08/2026):
//  - El "neto a pagar" de la quincena NO se calcula con una fórmula fija —
//    es la suma real de lo que cada trabajador ya registró en Registrar
//    Producción para ese rango de fechas (mismo total que usa Resumen de
//    Quincena), porque a diferencia de Fiscal Destajo acá no hay sueldo
//    fijo: se paga lo que se produjo.
//  - Las provisiones (cesantías, prima, vacaciones, intereses) SÍ usan un
//    sueldo/auxilio de referencia (el que se cargó con "Cargar Destajo" en
//    Trabajadores) — misma mecánica quincenal que Fiscal Destajo (tasa
//    mensual aplicada a la mitad del mes), con una diferencia confirmada
//    por Fredy: cesantías y prima SÍ incluyen el auxilio de transporte en
//    la base (sueldo+auxilio), vacaciones NO (solo sueldo) — así lo trae
//    su archivo de referencia.
//  - OJO: Fiscal Destajo hoy calcula cesantías/prima solo sobre el sueldo
//    (sin auxilio) — es una fórmula distinta a esta. Si corresponde
//    corregir Fiscal Destajo también, es una decisión aparte pendiente de
//    confirmar con Fredy antes de tocarla (afectaría liquidaciones ya
//    confirmadas en su historial).
function calcularLiquidacionDestajo(trabajador, netoProduccion) {
  const sueldo = Number(trabajador.sueldo) || 0;
  const auxilio = Number(trabajador.auxilioTransporte) || 0;
  // (2026-08-30) Fredy confirmo que su tabla de referencia (cesantias/
  // intereses/prima/vacaciones) ya es QUINCENAL, no mensual -- a diferencia
  // de Fiscal Destajo, donde el sueldo es mensual y se divide entre 2. Para
  // estos 12 trabajadores de Destajo, sueldo/auxilioTransporte representan
  // directamente el valor de la quincena, asi que las tasas mensuales
  // (8.33%, 12%, 4.17%) se aplican sobre el valor completo, sin dividir.
  // Validado exacto con MARIA AYDE CONTRERAS SANCHEZ (sueldo=$875.452,
  // auxilio=$124.547): cesantias=(875.452+124.547)x8.33%=$83.300,
  // interes=$83.300x12%=$9.996, prima=$83.300, vacaciones=875.452x4.17%=$36.506
  // -- coincide exacto con su tabla en los 4 conceptos.
  const saldoCesantiasInicio = Number(trabajador.cesantiasAcumuladas) || 0;
  const baseConAuxilio = sueldo + auxilio;
  const cesantiasPeriodo = baseConAuxilio * TASA_CESANTIAS_MENSUAL;
  const interesesPeriodo = cesantiasPeriodo * TASA_INTERES_CESANTIAS_ANUAL;
  const primaPeriodo = baseConAuxilio * TASA_PRIMA_MENSUAL;
  const vacacionesPeriodo = sueldo * TASA_VACACIONES_MENSUAL;
  return {
    netoAPagar: netoProduccion,
    cesantiasPeriodo, interesesPeriodo, primaPeriodo, vacacionesPeriodo,
    saldoCesantiasInicio, saldoCesantiasFin: saldoCesantiasInicio + cesantiasPeriodo,
  };
}
function NominaDestajoView({ trabajadores, produccion, liquidaciones, onGuardarTrabajador, onGuardarLiquidacion }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");
  const [resultados, setResultados] = useState(null); // null | [{trabajador, calculo}]
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const personas = trabajadores.filter((t) => t.tipoNomina === "Destajo" && t.activo !== false);
  const periodoId = `${anio}-${mes}-Q${quincena}`;
  const yaLiquidado = liquidaciones.some((l) => l.periodoId === periodoId);
  const { inicio, fin } = rangoQuincena(anio, mes, quincena);

  function calcular() {
    const filas = personas.map((t) => {
      const netoProduccion = produccion
        .filter((p) => p.trabajadorId === t.id && p.fecha >= inicio && p.fecha <= fin)
        .reduce((s, p) => s + (Number(p.total) || 0), 0);
      return { trabajador: t, calculo: calcularLiquidacionDestajo(t, netoProduccion) };
    });
    setResultados(filas);
    setGuardadoOk(false);
  }

  async function confirmarYGuardar() {
    if (!resultados) return;
    setGuardando(true);
    try {
      for (const { trabajador, calculo } of resultados) {
        await onGuardarLiquidacion({
          id: `${trabajador.id}__${periodoId}`,
          periodoId, trabajadorId: trabajador.id, nombre: trabajador.nombre,
          inicio, fin, ...calculo,
          confirmadaEn: new Date().toISOString(),
        });
        await onGuardarTrabajador({ ...trabajador, cesantiasAcumuladas: calculo.saldoCesantiasFin });
      }
      setGuardadoOk(true);
    } finally {
      setGuardando(false);
    }
  }

  const totales = resultados ? resultados.reduce((s, r) => ({
    neto: s.neto + r.calculo.netoAPagar,
    cesantias: s.cesantias + r.calculo.cesantiasPeriodo,
    intereses: s.intereses + r.calculo.interesesPeriodo,
    prima: s.prima + r.calculo.primaPeriodo,
    vacaciones: s.vacaciones + r.calculo.vacacionesPeriodo,
  }), { neto: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 }) : null;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Liquidación quincenal de los trabajadores "Destajo" (se les paga lo que produjeron, registrado en Registrar Producción) — acá se junta ese total con las prestaciones que se provisionan (cesantías, prima, vacaciones) sobre su sueldo de referencia. No se envía a TNS.
      </div>
      {personas.length === 0 && (
        <div style={{ padding: "12px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          Nadie tiene tipo de nómina "Destajo" todavía. Ve a Trabajadores → "💼 Cargar Destajo (12 conocidos)".
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <Field label="Año"><FInput type="number" value={anio} onChange={setAnio} /></Field>
        <Field label="Mes">
          <FSel value={mes} onChange={setMes} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: String(i + 1).padStart(2, "0") }))} />
        </Field>
        <Field label="Quincena">
          <FSel value={quincena} onChange={setQuincena} options={[{ value: "1", label: "1 (días 1-15)" }, { value: "2", label: "2 (16-fin de mes)" }]} />
        </Field>
        <Btn onClick={calcular} disabled={personas.length === 0}>🧮 Calcular</Btn>
      </div>

      {yaLiquidado && (
        <div style={{ padding: "10px 14px", background: C.amberBg, borderRadius: 8, color: C.amber, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          ⚠ Esta quincena ({periodoId}) ya fue confirmada antes. Si vuelves a confirmar, se sobreescribe.
        </div>
      )}

      {resultados && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="💵" label="Neto a pagar (producción)" value={fmtMoney(totales.neto)} color={C.green} bg={C.greenBg} />
            <KPI icon="📦" label="Cesantías (provisión)" value={fmtMoney(totales.cesantias)} color={C.violet} bg={C.violetBg} />
            <KPI icon="🎁" label="Prima (provisión)" value={fmtMoney(totales.prima)} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏖️" label="Vacaciones (provisión)" value={fmtMoney(totales.vacaciones)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="Sin resultados."
            columnas={[
              { key: "nombre", label: "Nombre", render: (f) => f.trabajador.nombre },
              { key: "netoAPagar", label: "Neto a pagar (producción)", align: "right", render: (f) => <strong>{fmtMoney(f.calculo.netoAPagar)}</strong> },
              { key: "cesantiasPeriodo", label: "Cesantías (prov.)", align: "right", render: (f) => fmtMoney(f.calculo.cesantiasPeriodo) },
              { key: "interesesPeriodo", label: "Intereses cesantías", align: "right", render: (f) => fmtMoney(f.calculo.interesesPeriodo) },
              { key: "primaPeriodo", label: "Prima (prov.)", align: "right", render: (f) => fmtMoney(f.calculo.primaPeriodo) },
              { key: "vacacionesPeriodo", label: "Vacaciones (prov.)", align: "right", render: (f) => fmtMoney(f.calculo.vacacionesPeriodo) },
            ]}
            filas={resultados}
          />
          <div style={{ marginTop: 16 }}>
            <Btn onClick={confirmarYGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "✅ Confirmar y guardar liquidación de la quincena"}
            </Btn>
            {guardadoOk && <span style={{ marginLeft: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>✅ Liquidación guardada — el acumulado de cesantías de cada uno ya quedó actualizado.</span>}
          </div>
        </>
      )}
    </div>
  );
}
// ─── HISTORIAL DESTAJO (quincenas ya confirmadas) ────────────────────────
function HistorialDestajoView({ liquidaciones, trabajadores }) {
  const periodos = [...new Set(liquidaciones.map((l) => l.periodoId))].sort().reverse();
  const [periodoFiltro, setPeriodoFiltro] = useState("");
  const filas = [...liquidaciones]
    .filter((l) => !periodoFiltro || l.periodoId === periodoFiltro)
    .sort((a, b) => (b.periodoId || "").localeCompare(a.periodoId || "") || (a.nombre || "").localeCompare(b.nombre || ""));
  const totales = filas.reduce((s, l) => ({
    neto: s.neto + (l.netoAPagar || 0),
    cesantias: s.cesantias + (l.cesantiasPeriodo || 0),
    intereses: s.intereses + (l.interesesPeriodo || 0),
    prima: s.prima + (l.primaPeriodo || 0),
    vacaciones: s.vacaciones + (l.vacacionesPeriodo || 0),
  }), { neto: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 });
  function descargarRecibo(l) {
    const trabajador = (trabajadores || []).find((t) => t.id === l.trabajadorId);
    exportReciboLiquidacionHTML({ tipoNomina: "Destajo", trabajador, liquidacion: l });
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Todas las quincenas de Nómina Destajo ya confirmadas y guardadas — para consultar o comparar períodos pasados.
      </div>
      {liquidaciones.length === 0 ? (
        <div style={{ padding: "12px 16px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, color: C.slate, fontSize: 13, maxWidth: 480 }}>
          Todavía no hay ninguna quincena confirmada. Ve a "Nómina Destajo", calcula una y dale "Confirmar y guardar".
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, maxWidth: 260 }}>
            <Field label="Filtrar por período">
              <FSel value={periodoFiltro} onChange={setPeriodoFiltro} options={periodos.map((p) => ({ value: p, label: p }))} placeholder="Todos los períodos" />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="💵" label="Neto pagado (total)" value={fmtMoney(totales.neto)} color={C.green} bg={C.greenBg} />
            <KPI icon="📦" label="Cesantías (provisión)" value={fmtMoney(totales.cesantias)} color={C.violet} bg={C.violetBg} />
            <KPI icon="📈" label="Intereses cesantías" value={fmtMoney(totales.intereses)} color={C.violet} bg={C.violetBg} />
            <KPI icon="🎁" label="Prima (provisión)" value={fmtMoney(totales.prima)} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏖️" label="Vacaciones (provisión)" value={fmtMoney(totales.vacaciones)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="Sin resultados para este período."
            columnas={[
              { key: "periodoId", label: "Período" },
              { key: "nombre", label: "Nombre" },
              { key: "netoAPagar", label: "Neto a pagar (producción)", align: "right", render: (f) => <strong>{fmtMoney(f.netoAPagar)}</strong> },
              { key: "cesantiasPeriodo", label: "Cesantías (prov.)", align: "right", render: (f) => fmtMoney(f.cesantiasPeriodo) },
              { key: "interesesPeriodo", label: "Intereses cesantías", align: "right", render: (f) => fmtMoney(f.interesesPeriodo) },
              { key: "primaPeriodo", label: "Prima (prov.)", align: "right", render: (f) => fmtMoney(f.primaPeriodo) },
              { key: "vacacionesPeriodo", label: "Vacaciones (prov.)", align: "right", render: (f) => fmtMoney(f.vacacionesPeriodo) },
              { key: "confirmadaEn", label: "Confirmada", render: (f) => f.confirmadaEn ? new Date(f.confirmadaEn).toLocaleString("es-CO") : "—" },
              { key: "acciones", label: "", align: "right", render: (f) => (
                <span onClick={() => descargarRecibo(f)} style={{ cursor: "pointer", color: C.blue, fontWeight: 700 }} title="Descargar recibo de liquidación">🖨</span>
              ) },
            ]}
            filas={filas}
          />
        </>
      )}
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
  // (2026-08-30) Tope de pago EN VIVO desde Busint, por proceso -- pasa a
  // ser la fuente PRINCIPAL del tope (reemplaza al Excel de Costos
  // Teoricos por Proceso, decision de Fredy 2026-08-30). Se valido con 3
  // casos reales que el "Cant" de "insumos dig" (Busint BD), filtrando por
  // Referencia+Insumo=proceso, YA ES el precio maximo en pesos por unidad
  // -- ver claude/atlas-codebase-overview.md, seccion "Costeo por
  // proceso/referencia".
  const [costosProcesoBusint, setCostosProcesoBusint] = useState(null);
  const [buscandoCostosProcesoBusint, setBuscandoCostosProcesoBusint] = useState(false);
  // Búsqueda por N° de Lote (Busint → Panel de Flujo Operacional): en vez de
  // escribir la referencia a mano, buscan el lote y les trae de una vez
  // pedido, cliente, cantidad cortada, referencia y costo teórico — así lo
  // pidió el usuario con el ejemplo del lote 7150.
  const [numLote, setNumLote] = useState("");
  const [loteInfo, setLoteInfo] = useState(null);
  const [buscandoLote, setBuscandoLote] = useState(false);
  const [movimientosLote, setMovimientosLote] = useState(null);
  async function buscarLote() {
    const n = numLote.trim();
    if (!n) return;
    setBuscandoLote(true);
    setLoteInfo(null);
    setCostoTeorico(null);
    setMovimientosLote(null);
    // (2026-08-31) Consulta en paralelo, sin bloquear la ficha del lote: si
    // Busint ya tiene una entrada real registrada para el proceso que se
    // vaya a elegir (tabla de movimientos "bmp - entrada plantaproc ref"),
    // se usa más abajo solo como AVISO informativo -- no bloquea el
    // guardado (a diferencia de "registroPrevio", que sí bloquea porque
    // compara contra los propios registros de Atlas). Pedido de Fredy para
    // evitar pagar dos veces el mismo proceso cuando ya hubo una entrada
    // hecha por fuera de Atlas, mientras Nómina y Busint no están conectados.
    (async () => {
      try {
        const llamarMov = httpsCallable(functionsClient, "getMovimientosLoteBusintBD");
        const respMov = await llamarMov({ numLote: n });
        setMovimientosLote(respMov.data);
      } catch (err) {
        setMovimientosLote({ error: err?.message || String(err) });
      }
    })();
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
  async function buscarCostosProcesoBusint() {
    const ref = referencia.trim();
    if (!ref) return;
    setBuscandoCostosProcesoBusint(true);
    setCostosProcesoBusint(null);
    try {
      const llamar = httpsCallable(functionsClient, "getCostosProcesoDesdeBusintPorReferencia");
      const resp = await llamar({ ref });
      setCostosProcesoBusint({ ...resp.data, _ref: ref });
    } catch (err) {
      setCostosProcesoBusint({ error: err?.message || String(err), _ref: ref });
    } finally {
      setBuscandoCostosProcesoBusint(false);
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
  useEffect(() => {
    const ref = referencia.trim();
    if (!ref) { setCostosProcesoBusint(null); return; }
    if (costosProcesoBusint && costosProcesoBusint._ref === ref) return;
    const t = setTimeout(() => { buscarCostosProcesoBusint(); }, 700);
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
  // (2026-08-31) Movimientos reales de Busint (entradas/salidas) para el
  // lote que está vigente ahora mismo en el formulario -- si el usuario
  // cambia el número de lote sin volver a buscar, esto se ignora (mismo
  // criterio que loteAsociado). Solo mira "entradas": son las que indican
  // que ya se registró producción de ese proceso.
  const movimientosLoteVigente = movimientosLote && !movimientosLote.error && movimientosLote.numLote === numLote.trim() ? movimientosLote : null;
  const entradaBusintProceso = movimientosLoteVigente && proceso
    ? (movimientosLoteVigente.entradas || []).find((e) => normalizarProceso(e.proceso) === normalizarProceso(proceso) && Number(e.total) > 0)
    : null;
  // Si este lote+proceso exacto está en la tabla de Costos Teóricos por
  // Proceso (cargada a mano desde el Excel de Busint), ese valor es más
  // específico que el costoFT de la referencia (que es un solo número, sin
  // distinguir procesos) — así que manda sobre él si existe.
  // (2026-08-30) Prioridad MAS ALTA: tope calculado EN VIVO desde Busint
  // (ver arriba) -- reemplaza al Excel como fuente principal. Solo si
  // Busint no tiene esta combinacion Referencia+Proceso (ej. una
  // referencia que Busint todavia no tiene digitada) se cae a la cascada
  // de siempre (Lote+Proceso > Referencia+Proceso del Excel > Proceso
  // generico) como respaldo.
  const costoBusintProceso =
    referencia.trim() && proceso && costosProcesoBusint && costosProcesoBusint._ref === referencia.trim() && !costosProcesoBusint.error
      ? (costosProcesoBusint.procesos || []).find((p) => normalizarProceso(p.insumo) === normalizarProceso(proceso) && Number(p.cant) > 0)
      : null;
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
  // cascada de costoAplicaA. Prioridad real del tope (2026-08-30): Busint
  // en vivo (Referencia+Proceso) > Lote+Proceso (Excel) > Referencia+
  // Proceso (Excel) > Proceso (catálogo).
  const costoAplicaA = costoBusintProceso
    ? { costoFT: Number(costoBusintProceso.cant), _ref: referencia.trim(), _origen: "busint_vivo" }
    : costoProcesoEspecifico
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
        <Field label="N° de Lote">
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
              <div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>PRECIO MÁX./UND</div>
              <div style={{ fontWeight: 700 }}>{loteInfo.costoFT > 0 ? fmtMoney(loteInfo.costoFT) : "Sin costear"}</div>
            </div>
          </div>
        )}
        {loteBloqueado && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 12 }}>
            El lote {loteAsociado.numLote} ya salió terminado a bodega — no se puede registrar nómina sobre un lote que ya se terminó.
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
        {costoBusintProceso ? (
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>
            🌐 Precio máximo permitido para "{proceso}" en esta referencia (Busint, en vivo): {fmtMoney(Number(costoBusintProceso.cant))}.
          </div>
        ) : costoProcesoEspecifico ? (
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 4 }}>
            📐 Precio máximo permitido para "{costoProcesoEspecifico.proceso}" en este lote: {fmtMoney(costoProcesoEspecifico.costoFT)}.
          </div>
        ) : costoRefProceso ? (
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 4 }}>
            📐 Precio máximo permitido para "{costoRefProceso.proceso}" en esta referencia: {fmtMoney(costoRefProceso.costoFT)}.
          </div>
        ) : costoProcesoGenerico ? (
          <div style={{ fontSize: 11, color: C.violet, fontWeight: 700, marginBottom: 4 }}>
            ⚙️ Precio máximo permitido para el proceso "{costoProcesoGenerico.proceso}": {fmtMoney(costoProcesoGenerico.costoTeorico)}.
          </div>
        ) : (buscandoCosto || buscandoCostosProcesoBusint) ? (
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Buscando precio máximo...</div>
        ) : proceso ? (
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 4 }}>No hay un precio máximo configurado para este proceso — puedes registrar el precio libremente.</div>
        ) : null}
        {/* Informativo aparte: costo teórico de TODA la prenda según la ficha
            técnica de Busint — nunca es el tope de un proceso individual. */}
        {costoTeorico && !costoTeorico.error && costoTeorico._ref === referencia.trim() && costoTeorico.encontrada && costoTeorico.costoFT > 0 && (
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>
            ℹ️ Precio de referencia de toda la prenda: {fmtMoney(costoTeorico.costoFT)} (dato informativo, no aplica solo a este proceso).
          </div>
        )}
        {costoTeorico?.error && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se pudo consultar el precio máximo: {costoTeorico.error}</div>}
        {costosProcesoBusint?.error && costosProcesoBusint._ref === referencia.trim() && (
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se pudo consultar el precio máximo en vivo desde Busint (se usa el respaldo si existe): {costosProcesoBusint.error}</div>
        )}
        {registroPrevio && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 10 }}>
            El proceso "{proceso}" del lote {loteAsociado.numLote} ya fue pagado ({registroPrevio.trabajadorNombre}, {fmtFechaISO(registroPrevio.fecha)}) — no se puede pagar dos veces.
          </div>
        )}
        {/* (2026-08-31) Aviso informativo -- NO bloquea puedeGuardar. Se
            avisa si Busint ya tiene una entrada real hecha para este
            proceso+lote (por fuera de Atlas), para que el usuario verifique
            antes de pagar de nuevo. */}
        {entradaBusintProceso && !registroPrevio && (
          <div style={{ padding: "10px 14px", background: C.amberBg, borderRadius: 8, color: C.amber, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            ⚠️ Busint ya tiene una entrada registrada para el proceso "{proceso}" del lote {numLote.trim()}: {fmtNum(entradaBusintProceso.total)} unidades ({entradaBusintProceso.filas} movimiento{entradaBusintProceso.filas === 1 ? "" : "s"}). Puede que este trabajo ya se haya pagado por otro medio -- verifícalo antes de guardar.
          </div>
        )}
        {movimientosLote?.error && (
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se pudo verificar contra Busint si ya hay una entrada de este proceso: {movimientosLote.error}</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <Field label="Cantidad"><FInput type="number" value={cantidad} onChange={setCantidad} /></Field>
          <Field label="Precio real (por unidad)"><FInput type="number" value={precioReal} onChange={setPrecioReal} placeholder="Lo que se le paga" /></Field>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Precio Máximo</div>
            <div style={{ padding: "9px 12px", background: excedeCostoTeorico ? C.redBg : C.canvas, borderRadius: 8, fontWeight: 800, color: excedeCostoTeorico ? C.red : C.ink, fontSize: 14 }}>
              {buscandoCosto ? "Buscando..." : costoAplicaA ? fmtMoney(costoAplicaA.costoFT) : "—"}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Total</div>
            <div style={{ padding: "9px 12px", background: C.canvas, borderRadius: 8, fontWeight: 800, color: C.ink, fontSize: 14 }}>{fmtMoney(total)}</div>
          </div>
        </div>
        {!proceso && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>Selecciona un proceso.</div>}
        {excedeCostoTeorico && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 10 }}>
            Ese precio ({fmtMoney(Number(precioReal))}) supera el máximo permitido para este proceso: {fmtMoney(costoAplicaA.costoFT)}. No se puede guardar.
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
// Desprendible de pago individual — mismo patrón que exportHojaDeVidaHTML en
// App.js: arma un HTML con estilo (encabezado degradado, tarjetas de datos,
// tablas) y lo descarga como .html; adentro trae un botón "Imprimir / PDF"
// que llama a window.print() — así el trabajador o el admin lo abre en el
// navegador y ahí mismo lo guarda como PDF, sin depender de ninguna librería
// nueva (jsPDF, etc.) que hubiera que instalar aparte.
function exportDesprendiblePagoHTML({ trabajador, desde, hasta, label, produccionItems, horasItems, totalProduccion, totalHoras, totalGeneral }) {
  const fechaGen = new Date().toISOString().slice(0, 10);
  const filasProd = (produccionItems || [])
    .map(
      (p, i) => `
    <tr style="background:${i % 2 === 0 ? "#F7F4F0" : "#fff"}">
      <td style="padding:8px 10px;color:#5A5A7A;font-size:12px">${fmtFechaISO(p.fecha)}</td>
      <td style="padding:8px 10px;font-weight:600">${p.proceso || ""}</td>
      <td style="padding:8px 10px;color:#5A5A7A">${p.numLote || "—"}</td>
      <td style="padding:8px 10px;color:#5A5A7A">${p.referencia || "—"}</td>
      <td style="padding:8px 10px;text-align:right">${fmtNum(p.cantidad)}</td>
      <td style="padding:8px 10px;text-align:right">${fmtMoney(p.precioUnidad)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700">${fmtMoney(p.total)}</td>
    </tr>`
    )
    .join("");
  const filasHoras = (horasItems || [])
    .map(
      (h, i) => `
    <tr style="background:${i % 2 === 0 ? "#F7F4F0" : "#fff"}">
      <td style="padding:8px 10px;color:#5A5A7A;font-size:12px">${fmtFechaISO(h.fecha)}</td>
      <td style="padding:8px 10px;font-weight:600">${h.concepto || ""}</td>
      <td style="padding:8px 10px;text-align:right">${fmtNum(h.horas)}</td>
      <td style="padding:8px 10px;text-align:right">${fmtMoney(h.tarifaHora)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700">${fmtMoney(h.total)}</td>
    </tr>`
    )
    .join("");
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Desprendible de Pago — ${trabajador.nombre || ""}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#F7F4F0;color:#1A1A2E;padding:32px}
  @media print{body{padding:0;background:#fff}}
  .page{max-width:820px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 32px rgba(26,26,46,0.1)}
  .header{background:linear-gradient(135deg,#1A1A2E 0%,#2D1B69 100%);padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
  .header-left h1{color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.3px}
  .header-left p{color:#C8B8A2;font-size:12px;margin-top:4px}
  .header-right{text-align:right}
  .header-right .badge{background:rgba(200,184,162,0.2);border:1px solid #C8B8A2;border-radius:8px;padding:8px 16px;color:#C8B8A2;font-size:13px;font-weight:700}
  .body{padding:28px 32px}
  .info-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
  .info-card{background:#F7F4F0;border-radius:8px;padding:12px 14px;border:1px solid #E8E2DB}
  .info-card label{display:block;font-size:10px;font-weight:700;color:#5A5A7A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px}
  .info-card span{font-size:14px;font-weight:700;color:#1A1A2E}
  .section-title{font-size:14px;font-weight:800;color:#1A1A2E;margin:22px 0 10px;padding-bottom:8px;border-bottom:2px solid #E8E2DB}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{background:#1A1A2E;color:#C8B8A2;padding:9px 10px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
  .no-rows{text-align:center;padding:20px;color:#5A5A7A;font-size:12.5px}
  .totales{margin-top:22px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
  .total-card{border-radius:10px;padding:14px 16px;text-align:center}
  .total-card label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;opacity:0.85}
  .total-card .val{font-size:19px;font-weight:900}
  .firma{margin-top:44px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .firma div{border-top:1px solid #1A1A2E;padding-top:8px;text-align:center;font-size:11px;color:#5A5A7A}
  .footer{background:#F7F4F0;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E8E2DB;font-size:12px;color:#5A5A7A}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>👷 Desprendible de Pago</h1>
      <p>Industrias Yanko · Nómina por producción (pago por pieza)</p>
    </div>
    <div class="header-right">
      <div class="badge">${label}</div>
      <div style="color:#C8B8A2;font-size:11px;margin-top:8px">${fechaGen}</div>
    </div>
  </div>
  <div class="body">
    <div class="info-row">
      <div class="info-card"><label>Trabajador</label><span>${trabajador.nombre || "—"}</span></div>
      <div class="info-card"><label>Cédula</label><span>${trabajador.cedula || "—"}</span></div>
      <div class="info-card"><label>Área</label><span>${trabajador.area || "—"}</span></div>
    </div>
    <div class="section-title">🧵 Producción por Proceso</div>
    ${
      filasProd
        ? `<table>
          <thead><tr>
            <th>Fecha</th><th>Proceso</th><th>Lote</th><th>Referencia</th>
            <th style="text-align:right">Cant.</th><th style="text-align:right">Precio/Und</th><th style="text-align:right">Total</th>
          </tr></thead>
          <tbody>${filasProd}</tbody>
        </table>`
        : `<div class="no-rows">Sin producción registrada en esta quincena.</div>`
    }
    <div class="section-title">🕐 Horas Sueltas</div>
    ${
      filasHoras
        ? `<table>
          <thead><tr><th>Fecha</th><th>Concepto</th><th style="text-align:right">Horas</th><th style="text-align:right">Tarifa/Hora</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${filasHoras}</tbody>
        </table>`
        : `<div class="no-rows">Sin horas sueltas registradas en esta quincena.</div>`
    }
    <div class="totales">
      <div class="total-card" style="background:#EBF1F7;color:#3D6B9E"><label>Total Producción</label><div class="val">${fmtMoney(totalProduccion)}</div></div>
      <div class="total-card" style="background:#F3EEF9;color:#7B5EA7"><label>Total Horas</label><div class="val">${fmtMoney(totalHoras)}</div></div>
      <div class="total-card" style="background:#EBF7F2;color:#2D9E6B"><label>Total a Pagar</label><div class="val">${fmtMoney(totalGeneral)}</div></div>
    </div>
    <div class="firma">
      <div>Firma del Trabajador</div>
      <div>Firma quien Autoriza</div>
    </div>
  </div>
  <div class="footer">
    <span>ATLAS · Industrias Yanko</span>
    <span>Período: ${fmtFechaISO(desde)} — ${fmtFechaISO(hasta)} · Generado el ${new Date().toLocaleDateString("es-CO", { dateStyle: "long" })}</span>
    <button onclick="window.print()" style="background:#1A1A2E;color:#C8B8A2;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:700">🖨 Imprimir / PDF</button>
  </div>
</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Desprendible_${(trabajador.nombre || "trabajador").replace(/\s+/g, "_")}_${desde}_a_${hasta}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
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
  // Arma y descarga el desprendible de UN trabajador puntual de la quincena
  // activa — se usa tanto desde el botón dentro del detalle como desde el
  // ícono de la fila en la tabla general, sin tener que abrir el detalle
  // primero.
  function descargarDesprendible(g) {
    const trabajador = trabajadores.find((t) => t.id === g.trabajadorId) || { nombre: g.nombre };
    exportDesprendiblePagoHTML({
      trabajador,
      desde,
      hasta,
      label,
      produccionItems: prodQuincena.filter((p) => p.trabajadorId === g.trabajadorId),
      horasItems: horasQuincena.filter((h) => h.trabajadorId === g.trabajadorId),
      totalProduccion: g.totalProduccion,
      totalHoras: g.totalHoras,
      totalGeneral: g.totalGeneral,
    });
  }
  return (
    <div>
      {trabajadorAbierto && (
        <Modal title={`Detalle de "${trabajadorAbierto.nombre}" — ${fmtFechaISO(desde)} al ${fmtFechaISO(hasta)}`} onClose={() => setTrabajadorAbierto(null)} width={720}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn small onClick={() => descargarDesprendible(trabajadorAbierto)}>🖨 Descargar Desprendible</Btn>
          </div>
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
          {
            key: "acciones", label: "", align: "right",
            render: (f) => (
              <span onClick={(e) => { e.stopPropagation(); descargarDesprendible(f); }} style={{ cursor: "pointer", color: C.blue, fontWeight: 700 }} title="Descargar desprendible de pago">🖨</span>
            ),
          },
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
// ─── CONSULTAR COSTO TEÓRICO POR REFERENCIA/LOTE ───────────────────────────
// Pantalla de solo consulta (no registra nada) para revisar el costo
// teórico de confección de una referencia, o de un lote puntual, sin tener
// que pasar por Registrar Producción. Reutiliza las mismas funciones de
// Busint ya validadas ahí (getLoteBusintPorNumero, getCostoTeoricoReferenciaBusint)
// y el mismo criterio de auto-carga (2026-08-25): no hay que darle clic
// aparte a un botón de "buscar costo" una vez ya se escribió la referencia
// o se encontró el lote. (2026-08-30, a pedido del usuario)
function ConsultarCostoReferenciaView() {
  const [numLote, setNumLote] = useState("");
  const [loteInfo, setLoteInfo] = useState(null);
  const [buscandoLote, setBuscandoLote] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [costoTeorico, setCostoTeorico] = useState(null);
  const [buscandoCosto, setBuscandoCosto] = useState(false);
  async function buscarLote() {
    const n = numLote.trim();
    if (!n) return;
    setBuscandoLote(true);
    setLoteInfo(null);
    try {
      const llamar = httpsCallable(functionsClient, "getLoteBusintPorNumero");
      const resp = await llamar({ numLote: n });
      setLoteInfo(resp.data);
      if (resp.data?.encontrada) setReferencia(resp.data.referencia || "");
    } catch (err) {
      setLoteInfo({ error: err?.message || String(err) });
    } finally {
      setBuscandoLote(false);
    }
  }
  async function buscarCostoTeorico(ref) {
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
  // Auto-carga: apenas hay una referencia (a mano o traída por la búsqueda
  // de lote), se consulta el costo teórico solo, sin botón aparte — espera
  // un momento corto sin cambios antes de consultar, para no golpear la
  // función de Busint en cada tecla.
  useEffect(() => {
    const ref = referencia.trim();
    if (!ref) { setCostoTeorico(null); return; }
    if (costoTeorico && !costoTeorico.error && costoTeorico._ref === ref) return;
    const t = setTimeout(() => { buscarCostoTeorico(ref); }, 700);
    return () => clearTimeout(t);
  }, [referencia]);
  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20 }}>
        <Field label="N° de Lote (opcional — trae la referencia sola)">
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
          </div>
        )}
        <Field label="Referencia">
          <FInput value={referencia} onChange={(v) => { setReferencia(v); setCostoTeorico(null); }} placeholder="Ej: CK3000" />
        </Field>
        <div style={{ padding: "14px 16px", background: C.canvas, borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Costo Teórico de Confección</div>
          {buscandoCosto ? (
            <div style={{ color: C.slate, fontSize: 13 }}>Buscando...</div>
          ) : costoTeorico?.error ? (
            <div style={{ color: C.amber, fontSize: 12, fontWeight: 600 }}>No se pudo consultar: {costoTeorico.error}</div>
          ) : costoTeorico && !costoTeorico.encontrada ? (
            <div style={{ color: C.amber, fontSize: 12, fontWeight: 600 }}>Esa referencia no existe en el maestro de Busint.</div>
          ) : costoTeorico?.encontrada ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 20, color: C.ink }}>{costoTeorico.costoFT > 0 ? fmtMoney(costoTeorico.costoFT) : "Sin costear en Busint"}</div>
              {costoTeorico.descripcion && <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>{costoTeorico.descripcion}</div>}
            </>
          ) : (
            <div style={{ color: C.slate, fontSize: 13 }}>Escribe una referencia o busca un lote arriba.</div>
          )}
        </div>
      </div>
    </div>
  );
}
export default function ModuloNomina({ currentUser, onVolver, onLogout }) {
  // Líder de área (hoy: Anny Beltrán y Sarai Méndez, cada una con su Área
  // Interna real -- ver Administrativo → Área Interna): entra con un panel
  // reducido, ya filtrado a su propia gente, en vez del panel completo de
  // admin (nada de Trabajadores/Precios ni ver otras áreas). Se define con
  // el campo "Área de Nómina" del usuario (mismo valor que la Área Interna
  // del trabajador), puesto por un admin en Administrador General → Usuarios.
  const areaLider = !currentUser?.isAdmin && currentUser?.areaNomina ? currentUser.areaNomina : null;
  const [subView, setSubView] = useState(() => (areaLider ? "produccion" : "dashboard"));
  // Qué grupos del menú están desplegados — si un grupo todavía no se ha
  // tocado (no está en este objeto), se abre solo si contiene el subView
  // activo; una vez el usuario le da clic, queda como él lo dejó.
  const [gruposAbiertos, setGruposAbiertos] = useState({});
  const [trabajadores, setTrabajadores] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [areasNomina, setAreasNomina] = useState([]);
  const [areasTNS, setAreasTNS] = useState([]);
  const [produccion, setProduccion] = useState([]);
  const [horas, setHoras] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [costosTeoricoProceso, setCostosTeoricoProceso] = useState([]);
  const [ausencias, setAusencias] = useState([]);
  const [faltasSinJustificar, setFaltasSinJustificar] = useState([]);
  const [liquidacionesFD, setLiquidacionesFD] = useState([]);
  const [liquidacionesD, setLiquidacionesD] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "nomina_trabajadores"), (snap) => { setTrabajadores(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setLoading(false); }),
      onSnapshot(collection(db, "nomina_precios_proceso"), (snap) => setPrecios(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_areas"), (snap) => setAreasNomina(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_areas_tns"), (snap) => setAreasTNS(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_produccion"), (snap) => setProduccion(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_horas"), (snap) => setHoras(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_cierres"), (snap) => setCierres(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_costos_teorico_proceso"), (snap) => setCostosTeoricoProceso(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_ausencias"), (snap) => setAusencias(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_faltas_sin_justificar"), (snap) => setFaltasSinJustificar(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_fiscal_destajo_liquidaciones"), (snap) => setLiquidacionesFD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_destajo_liquidaciones"), (snap) => setLiquidacionesD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);
  const isAdmin = !!currentUser?.isAdmin;
  // Menú del admin reacomodado en grupos desplegables (25/08/2026, a pedido
  // del usuario) — pensado para que más adelante, cuando se manejen roles,
  // sea fácil darle a alguien acceso a un grupo completo en vez de ítem por
  // ítem. El de área líder (Anny/Sarai) queda igual, plano, sin grupos.
  const NAV = areaLider
    ? [
        { id: "produccion", icon: "🧵", label: "Registrar Producción" },
        { id: "horas", icon: "🕐", label: "Registrar Horas" },
        { id: "permisos", icon: "📅", label: "Permisos" },
        { id: "resumen", icon: "💰", label: "Resumen" },
      ]
    : [
        { id: "dashboard", icon: "◉", label: "Inicio" },
        { group: "Nómina Producción", icon: "🧵", items: [
            { id: "produccion", icon: "🧵", label: "Registrar Producción" },
            { id: "horas", icon: "🕐", label: "Registrar Horas" },
          ] },
        { group: "Administrativo", icon: "🗂️", items: [
            { id: "costos_teorico", icon: "📐", label: "Costos Teóricos" },
            { id: "costo_referencia", icon: "💲", label: "Costo x Referencia" },
            { id: "tns", icon: "🔌", label: "Conexión TNS" },
            { id: "novedades_tns", icon: "🧾", label: "Novedades TNS" },
            { id: "precios", icon: "⚙️", label: "Procesos" },
            { id: "areas_nomina", icon: "🏭", label: "Área Interna" },
            { id: "areas_tns", icon: "🏛️", label: "Área TNS" },
            { id: "trabajadores", icon: "👷", label: "Trabajadores" },
          ] },
        { group: "Novedades", icon: "📣", items: [
            { id: "ausencias", icon: "📅", label: "Motivos de Ausencia" },
            { id: "permisos", icon: "🗓️", label: "Permisos (Calendario)" },
            { id: "asistencia", icon: "📊", label: "Reporte de Asistencia" },
          ] },
        { group: "Reporte de Nómina", icon: "📊", items: [
            { id: "resumen", icon: "💰", label: "Cierre de Quincena" },
            { id: "fiscal_destajo", icon: "💼", label: "Nómina Fiscal Destajo" },
            { id: "historial_fiscal_destajo", icon: "🗂️", label: "Historial Fiscal Destajo" },
            { id: "destajo", icon: "💼", label: "Nómina Destajo" },
            { id: "historial_destajo", icon: "🗂️", label: "Historial Destajo" },
          ] },
      ];
  // Versión "aplanada" del menú (sin grupos) — sirve para buscar el label
  // del subView activo para el título de la página, sin importar si ese
  // ítem está suelto o adentro de un grupo.
  const NAV_PLANO = NAV.flatMap((item) => (item.items ? item.items : [item]));
  // Con líder de área, todo lo que ve/registra queda limitado a su propia
  // gente — así Anny no ve ni toca la producción de Sarai y viceversa.
  const trabajadoresVisibles = areaLider ? trabajadores.filter((t) => (t.area || "Sin asignar") === areaLider) : trabajadores;
  const produccionVisible = areaLider ? produccion.filter((p) => trabajadoresVisibles.some((t) => t.id === p.trabajadorId)) : produccion;
  const horasVisibles = areaLider ? horas.filter((h) => trabajadoresVisibles.some((t) => t.id === h.trabajadorId)) : horas;
  const ausenciasVisibles = areaLider ? ausencias.filter((a) => trabajadoresVisibles.some((t) => t.id === a.trabajadorId)) : ausencias;
  async function guardarTrabajador(t) { await fsSave("nomina_trabajadores", t.id, t); }
  async function borrarTrabajador(id) { await fsDelete("nomina_trabajadores", id); }
  async function guardarProceso(p) { await fsSave("nomina_precios_proceso", p.id, p); }
  async function borrarProceso(id) { await fsDelete("nomina_precios_proceso", id); }
  async function guardarAreaNomina(a) { await fsSave("nomina_areas", a.id, a); }
  async function borrarAreaNomina(id) { await fsDelete("nomina_areas", id); }
  async function guardarAreaTNS(a) { await fsSave("nomina_areas_tns", a.id, a); }
  async function borrarAreaTNS(id) { await fsDelete("nomina_areas_tns", id); }
  async function guardarProduccion(p) { await fsSave("nomina_produccion", p.id, p); }
  async function borrarProduccion(id) { await fsDelete("nomina_produccion", id); }
  async function guardarHoras(h) { await fsSave("nomina_horas", h.id, h); }
  async function borrarHoras(id) { await fsDelete("nomina_horas", id); }
  async function guardarAusencia(a) { await fsSave("nomina_ausencias", a.id, a); }
  async function borrarAusencia(id) { await fsDelete("nomina_ausencias", id); }
  async function guardarLiquidacionFD(l) { await fsSave("nomina_fiscal_destajo_liquidaciones", l.id, l); }
  async function guardarLiquidacionD(l) { await fsSave("nomina_destajo_liquidaciones", l.id, l); }
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
            if (item.items) {
              const abierto = gruposAbiertos[item.group] ?? item.items.some((sub) => sub.id === subView);
              return (
                <div key={item.group}>
                  <button
                    onClick={() => setGruposAbiertos((g) => ({ ...g, [item.group]: !abierto }))}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "#8888AA", fontWeight: 700, fontSize: 13, textAlign: "left" }}
                  >
                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.group}</span>
                    <span style={{ fontSize: 11 }}>{abierto ? "▾" : "▸"}</span>
                  </button>
                  {abierto && item.items.map((sub) => {
                    const active = subView === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setSubView(sub.id)}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px 9px 26px", border: "none", borderRadius: 8, cursor: "pointer", background: active ? "#C8B8A2" : "transparent", color: active ? C.ink : "#8888AA", fontWeight: active ? 800 : 500, fontSize: 13, textAlign: "left" }}
                      >
                        <span style={{ fontSize: 14 }}>{sub.icon}</span>
                        <span style={{ flex: 1 }}>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            }
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
            {NAV_PLANO.find((n) => n.id === subView)?.label || ""}
          </h1>
          {subView === "dashboard" && !areaLider && <DashboardNominaView trabajadores={trabajadores} precios={precios} produccion={produccion} horas={horas} />}
          {subView === "produccion" && <RegistrarProduccionView trabajadores={trabajadoresVisibles} precios={precios} produccion={produccionVisible} produccionCompleta={produccion} costosTeoricoProceso={costosTeoricoProceso} currentUser={currentUser} onGuardar={guardarProduccion} onBorrar={borrarProduccion} isAdmin={isAdmin} />}
          {subView === "horas" && <RegistrarHorasView trabajadores={trabajadoresVisibles} horas={horasVisibles} currentUser={currentUser} onGuardar={guardarHoras} onBorrar={borrarHoras} isAdmin={isAdmin} />}
          {subView === "resumen" && <ResumenSemanalView trabajadores={trabajadoresVisibles} produccion={produccionVisible} horas={horasVisibles} isAdmin={isAdmin} cierres={cierres} onCerrar={guardarCierre} onReabrir={reabrirCierre} />}
          {subView === "trabajadores" && !areaLider && <TrabajadoresView trabajadores={trabajadores} isAdmin={isAdmin} onSave={guardarTrabajador} onDelete={borrarTrabajador} areasNomina={areasNomina} areasTNS={areasTNS} />}
          {subView === "areas_nomina" && !areaLider && <AreasNominaView areas={areasNomina} trabajadores={trabajadores} isAdmin={isAdmin} onSave={guardarAreaNomina} onDelete={borrarAreaNomina} />}
          {subView === "areas_tns" && !areaLider && <AreasTnsView areas={areasTNS} trabajadores={trabajadores} isAdmin={isAdmin} onSave={guardarAreaTNS} onDelete={borrarAreaTNS} />}
          {subView === "precios" && !areaLider && <PreciosProcesoView precios={precios} isAdmin={isAdmin} onSave={guardarProceso} onDelete={borrarProceso} />}
          {subView === "costos_teorico" && !areaLider && <CostosTeoricoProcesoView costos={costosTeoricoProceso} isAdmin={isAdmin} onGuardarLote={guardarCostosTeoricoProcesoLote} onBorrarTodo={vaciarCostosTeoricoProceso} />}
          {subView === "costo_referencia" && !areaLider && <ConsultarCostoReferenciaView />}
          {subView === "tns" && !areaLider && <TNSConexionView />}
          {subView === "novedades_tns" && !areaLider && <NovedadesTNSView trabajadores={trabajadores} />}
          {subView === "ausencias" && !areaLider && <AusenciasView ausencias={ausencias} trabajadores={trabajadores} isAdmin={isAdmin} currentUser={currentUser} onSave={guardarAusencia} onDelete={borrarAusencia} />}
          {subView === "asistencia" && !areaLider && <ReporteAsistenciaView ausencias={ausencias} trabajadores={trabajadores} />}
          {subView === "permisos" && <PermisosCalendarioView trabajadores={trabajadoresVisibles} produccion={produccionVisible} horas={horasVisibles} ausencias={ausenciasVisibles} currentUser={currentUser} isAdmin={isAdmin} onSave={guardarAusencia} onDelete={borrarAusencia} />}
          {subView === "fiscal_destajo" && !areaLider && <NominaFiscalDestajoView trabajadores={trabajadores} faltas={faltasSinJustificar} liquidaciones={liquidacionesFD} onGuardarTrabajador={guardarTrabajador} onGuardarLiquidacion={guardarLiquidacionFD} />}
          {subView === "historial_fiscal_destajo" && !areaLider && <HistorialFiscalDestajoView liquidaciones={liquidacionesFD} trabajadores={trabajadores} />}
          {subView === "destajo" && !areaLider && <NominaDestajoView trabajadores={trabajadores} produccion={produccion} liquidaciones={liquidacionesD} onGuardarTrabajador={guardarTrabajador} onGuardarLiquidacion={guardarLiquidacionD} />}
          {subView === "historial_destajo" && !areaLider && <HistorialDestajoView liquidaciones={liquidacionesD} trabajadores={trabajadores} />}
        </div>
      </div>
    </div>
  );
}
