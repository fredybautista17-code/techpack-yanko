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
// (2026-09-03) Diferencia en días (valor absoluto) entre dos fechas
// ISO "YYYY-MM-DD" -- usado para el aviso de posible duplicado en
// Registrar Producción.
function diasEntre(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Math.abs((a - b) / 86400000);
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
function FSel({ value, onChange, options, groups, placeholder = "Seleccionar..." }) {
  // `groups` (2026-09-09, a pedido de Fredy, ver "Grupo de Trabajo" más
  // abajo): opcional, [{ label, options: [...] }, ...] -- se pinta como
  // <optgroup> después de `options` (que sigue siendo la lista plana de
  // siempre). Ningún llamado existente pasa `groups`, así que esto no
  // cambia nada de lo que ya funciona.
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
      {(groups || []).map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
          ))}
        </optgroup>
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
              {columnas.map((c) => {
                const valor = f[c.key];
                const esObjeto = valor !== null && typeof valor === "object";
                return (
                  <td key={c.key} style={{ padding: "7px 12px", textAlign: c.align || "left", whiteSpace: "nowrap", color: c.color ? c.color(f) : C.ink }}>
                    {c.render ? c.render(f) : esObjeto ? JSON.stringify(valor) : valor}
                  </td>
                );
              })}
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
function normalizarNombreParaComparar(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
// Clasificación de nómina (BASE DE DATOS PERSONAL COPIA FINAL, 25/08/2026):
// Fiscal = nómina completa en TNS (seg. social + parafiscales). Fiscal
// Destajo = sueldo fijo como Fiscal pero SIN seguridad social, SÍ
// parafiscales — se hospeda en Atlas, no en TNS. Destajo = pago por
// proceso/producción (ya existe en Registrar Producción). Prestación de
// Servicios = fuera de nómina.
const TIPOS_NOMINA = ["Fiscal", "Fiscal Destajo", "Destajo", "Prestación de Servicios"];
// (2026-09-09, a pedido de Fredy) Empleador -- cuál de las dos empresas
// contrata legalmente a cada trabajador. Es lista fija (no catálogo en
// Firestore) porque son solo estas dos, igual que Tipo de Nómina. Sirve
// para poder ver cuánto se debe pagar de nómina separado por empresa.
const EMPLEADORES = ["YANKO", "INDUTEX"];
// (2026-09-09, a pedido de Fredy) Clase de Riesgo ARL -- define qué tasa de
// ARL paga la empresa por cada trabajador Fiscal (varía persona por
// persona, no por Cargo -- confirmado con Fredy). Tasas oficiales de
// Colombia (Decreto 1607/2002).
const CLASES_RIESGO_ARL = [
  { value: "I", label: "I (0.522%)" },
  { value: "II", label: "II (1.044%)" },
  { value: "III", label: "III (2.436%)" },
  { value: "IV", label: "IV (4.35%)" },
  { value: "V", label: "V (6.96%)" },
];
const TASA_ARL_POR_CLASE = { I: 0.00522, II: 0.01044, III: 0.02436, IV: 0.0435, V: 0.0696 };
function labelClaseARL(clase) {
  return CLASES_RIESGO_ARL.find((c) => c.value === clase)?.label || clase;
}
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
// (2026-09-09, a pedido de Fredy) Personal de Maquila -- archivo "PERSONAL
// MAQUILA.xlsx" que subió. Todos van al Área Interna "MAQUILA" (se crea
// sola la primera vez que se cargan, junto con cada Cargo que traiga
// la lista -- ver cargarMaquilaConocidos en TrabajadoresView). Sueldo y
// auxilio de transporte: el estándar de mínimo + subsidio que ya se usa en
// el resto de la nómina (1.750.905 / 249.095), salvo 3 excepciones que
// Fredy dio a mano: JIMMY YESID HERNANDEZ HERNANDEZ ("Yimi") y JULIAN
// ALBEIRO ATEHORTUA RAMIREZ pasan a Prestación de Servicios con su sueldo
// propio y sin auxilio de transporte, y CAROLINA RIVERA BUITRAGO mantiene
// su Tipo de Nómina (Fiscal) pero con sueldo 2.312.200 + auxilio.
const MAQUILA_CONOCIDOS = [
  { cedula: "1090478794", nombre: "BELEN TORCOROMA CONDE SANTIAGO", correo: "belentorcoromaconde@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093773241", nombre: "CARMEN YANETH RIVERA ASCANIO", correo: "yanethrivera556@gmail.com", zona: "PATINADORA DE CONFECCIÓN", tipoNomina: "Fiscal Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT779282", nombre: "CAROLINA DIAZ CRUZ", correo: "frangycarolinadiaz@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "37443339", nombre: "CAROLINA RIVERA BUITRAGO", correo: "karolrivera1081@gmail.com", zona: "LIDER MAQUILA", tipoNomina: "Fiscal", sueldo: 2312200, auxilioTransporte: 249095 },
  { cedula: "1119180538", nombre: "ERIKA SHIREY DURAN ESPINOSA", correo: "erika.espinosa20001@gmail.com", zona: "ESPIGADORA DE CONFECCIÓN", tipoNomina: "Fiscal Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090443715", nombre: "GLENDA YAMALI CONTRERAS ORTEGA", correo: "", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093801727", nombre: "JESUS EMIRIO SANCHEZ RANGEL", correo: "jechus1or@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090408551", nombre: "JULIA YURY GALVIS SUAREZ", correo: "jygs2703@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 5875854", nombre: "LAURA NOHEMI FLORES", correo: "laura8flores@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "37390572", nombre: "LEDY YOHENA GARCIA ORDUZ", correo: "", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1004967010", nombre: "LINDA TATIANA MENDOZA PATIÑO", correo: "lindatatianamendoza@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1120362664", nombre: "LIZETH PAOLA SALDARRIAGA BUITRAGO", correo: "paolasaldarriaga548@gmail.com", zona: "REVISADORA DE CONFECIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "37444395", nombre: "LUZ KARINE SANCHEZ ESCOBAR", correo: "luzvalenic@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "60374952", nombre: "MARIA FERNANDA GUERRERO RIASCOS", correo: "maferpeche1975@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1149467366", nombre: "MERYKEY PABON BERNAL", correo: "merykeypabon@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "37197931", nombre: "MIREYA CELIS PACHECO", correo: "mireyacelispacheco@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "60390253", nombre: "MONICA DEL PILAR JIMENENEZ PARRA", correo: "alquemo22@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "49696194", nombre: "NELSY MARTINEZ SALCEDO", correo: "nelsymartinez.02@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 5525783", nombre: "OLISMAR YSBET GOMEZ TORRES", correo: "olismar1796@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090467154", nombre: "RUBI PEÑARANDA BACCA", correo: "ruby1993g20@gmail.com", zona: "ESPIGADORA DE CONFECCIÓN", tipoNomina: "Fiscal Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "49663566", nombre: "SANDRA MILENA MAGREGO TORRES", correo: "magregomilena74@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093752194", nombre: "LEIDY YAJAIRA REYES DURAN", correo: "leidyyajairareyesduran@gmail.com", zona: "PLANCHADO", tipoNomina: "Fiscal Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 5434574", nombre: "GLEIDYS CAROLINA HUMBRIA GOYO", correo: "gleidys1328@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "60369604", nombre: "MARTHA SALDAÑAZ CONTRERAS", correo: "marthasaldanas.73@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090392657", nombre: "ELIOT DAVID VEGA GONZALEZ", correo: "vegaeliut39@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093792379", nombre: "CLAUDIA PATRICIA PORTILLA SALA", correo: "patriciasala787@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1094162259", nombre: "CINDY PAOLA LEAL ROLON", correo: "cindy.leal1117@gmail.com", zona: "REVISADORA DE CONFECIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093758326", nombre: "YAIRA LICETH PEREZ CARRASCAL", correo: "yairaliceth_123@hotmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 5443585", nombre: "GLADYS YELITZA HUMBRIA GOYO", correo: "gladyshumbria16@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "37321428", nombre: "MARIA EMMA RUEDAS BARBOSA", correo: "", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1091805089", nombre: "NELLY PATRICIA TRIVIÑO CRISTANCHO", correo: "nelsonjohantoro@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Fiscal", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093293814", nombre: "JUAN SEBASTIAN PATIÑO RIVERA", correo: "juan355sebas@gmail.com", zona: "ADMINISTRATIVO CONFECCIÓN", tipoNomina: "Fiscal Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1090419237", nombre: "ROSA ELIDA CARRILLO CARRILLO", correo: "rosaelidacarrilocarrillo@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT4949299", nombre: "ALEXANDER JESUS RODRIGUEZ MARIÑO", correo: "jesusrom353@gmail.com", zona: "DESPELUZADOR DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1105789691", nombre: "MANUEL ERNESTO RUEDA SUAREZ", correo: "maetorueda1995@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1094164084", nombre: "YENIFER PAOLA RIVERA ASENCIO", correo: "paolarivera.152211@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1094346937", nombre: "CAMILA ANDREA SUAREZ FUENTES", correo: "camilaandreasuarezfuentes534@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1092339812", nombre: "GERALDIN LEGUIZAMON ORTIZ", correo: "geraldinortiz04@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PTT 5060907", nombre: "GENESIS KARINA GONZALEZ MARTINEZ", correo: "", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PTT 7226354", nombre: "JUAN CARLOS GONZALEZ MARTINEZ", correo: "cg6586718@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1032505309", nombre: "YORDAN YAMPIHER ESPINOSA SANABRIA", correo: "yordan.espinosa19@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1093794155", nombre: "PAULA ANDREA MARTINEZ AGUILAR", correo: "paulita9801@hotmail.com", zona: "REVISADORA DE CONFECIÓN", tipoNomina: "Fiscal", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1004879305", nombre: "KAREN YULIANA SUAREZ ESPINEL", correo: "karensua337@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1092357174", nombre: "JULIAN ALBEIRO ATEHORTUA RAMIREZ", correo: "", zona: "MECANICO CONFECCIÓN", tipoNomina: "Prestación de Servicios", sueldo: 2800000, auxilioTransporte: 0 },
  { cedula: "1093752972", nombre: "JIMMY YESID HERNANDEZ HERNANDEZ", correo: "", zona: "MECANICO CONFECCIÓN", tipoNomina: "Prestación de Servicios", sueldo: 1750000, auxilioTransporte: 0 },
  { cedula: "PPT 5831508", nombre: "ANA LAURA LEON BOLIVAR", correo: "leonbolivaranalaura@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "CV 23652653", nombre: "ANA GABRIELA PINTO SIFONTES", correo: "pintogabriela799@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1119181812", nombre: "DIANA ESPINOSA TORRES", correo: "diana328039@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "1057612531", nombre: "YERLI PATRICIA GARZONN REY", correo: "yerlypatricia1989@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 1143588", nombre: "ROBERSY NAILETH REYES DAVILA", correo: "jaikerlyreyes20@gmail.com", zona: "OPERARIO DE CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "37369933", nombre: "VILMA MARIA ANGARITA QUINTERO", correo: "vilmangarita13@gmail.com", zona: "OPERARIO CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "CV 30.057.554", nombre: "ELVIS ALEXANDRO MEJIAS MALAVE", correo: "", zona: "OPERARIO CONFECCIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
  { cedula: "PPT 6977521", nombre: "KEILA JOHANA BERNAL MONCADA", correo: "bernalkeila993@gmail.com", zona: "REVISADORA DE CONFECIÓN", tipoNomina: "Destajo", sueldo: 1750905, auxilioTransporte: 249095 },
];
// (2026-09-09, a pedido de Fredy) Nómina Fiscal completa -- archivo
// "FISCAL NOMINA.xlsx" que subió, 24 personas con Empleador (YANKO/
// INDUTEX) y Cargo tal como venían ahí. Dos nombres de Área Interna
// vinieron distintos a como ya existen en el sistema y se normalizaron
// (confirmado con Fredy que son la misma área): "CONTROL CALIDAD" ->
// "CONTROL DE CALIDAD" y "ZONA DE CALOR" -> "ZONA CALOR". El archivo no
// trae auxilio de transporte -- se usa el estándar (249.095) para los
// 24, a pedido de Fredy.
const FISCAL_CONOCIDOS = [
  { cedula: "37279174", nombre: "ANNY CLARISA BELTRAN JAIMES", correo: "annyclarisabeltran@gmail.com", area: "CONTROL DE CALIDAD", cargo: "LIDER CALIDAD", empleador: "YANKO", sueldo: 2207100 },
  { cedula: "37443339", nombre: "CAROLINA RIVERA BUITRAGO", correo: "karolrivera1081@gmail.com", area: "MAQUILA", cargo: "LIDER MAQUILA", empleador: "INDUTEX", sueldo: 2312200 },
  { cedula: "1093792909", nombre: "DANIEL LEONARDO MEJIA CADENA", correo: "m2elmejia@gmail.com", area: "DISEÑO", cargo: "DISEÑADOR SENIOR", empleador: "YANKO", sueldo: 2207100 },
  { cedula: "1005026197", nombre: "DIEGO ALEJANDRO OCHOA CHACÓN", correo: "ochoadiego777@gmail.com", area: "ADMINISTRATIVO", cargo: "AUXILIAR CONTABLE", empleador: "INDUTEX", sueldo: 1800000 },
  { cedula: "88260792", nombre: "FREDY ALEXANDER BAUTISTA", correo: "fredybautista17@gmail.com", area: "ADMINISTRATIVO", cargo: "GERENTE", empleador: "YANKO", sueldo: 4000000 },
  { cedula: "1092353907", nombre: "HUBERT LAIN CANO ANTELIZ", correo: "huvert14k@gmail.com", area: "BODEGA", cargo: "AUXILIAR BODEGA DE TELAS", empleador: "INDUTEX", sueldo: 1900000 },
  { cedula: "1127349945", nombre: "JENNY SARAI MENDEZ SUAREZ", correo: "jennymendez0211@gmail.com", area: "ZONA CALOR", cargo: "LIDER REPRODUCCIÓN DE DISEÑO", empleador: "YANKO", sueldo: 2400000 },
  { cedula: "1004866225", nombre: "JESUS ALIRIO BOTELLO BECERRA", correo: "jebotello.19@gmail.com", area: "BODEGA", cargo: "LIDER BODEGA", empleador: "YANKO", sueldo: 2207100 },
  { cedula: "88243928", nombre: "JOSE ALEXANDER SERRANO OREJUELA", correo: "aserranooreju@gmail.com", area: "CORTE", cargo: "CORTADOR", empleador: "INDUTEX", sueldo: 1750905 },
  { cedula: "1193480378", nombre: "JOSE DAVID MELO OSORIO", correo: "josedavidmeloosorio@gmail.com", area: "ADMINISTRATIVO", cargo: "RECOGIDA Y DESPACHO", empleador: "INDUTEX", sueldo: 1900000 },
  { cedula: "1093801939", nombre: "KAREN MICHEL CHACÓN CABALLERO", correo: "karenchacon957@gmail.com", area: "DISEÑO", cargo: "CENTRO DE INFORMACIÓN", empleador: "YANKO", sueldo: 1800000 },
  { cedula: "88225906", nombre: "LUIS ALFREDO MEDINA FUENTES", correo: "medinafuentesluisalfredo@gmail.com", area: "ADMINISTRATIVO", cargo: "CONSERJE", empleador: "YANKO", sueldo: 1750905 },
  { cedula: "30050414", nombre: "MARY NELCI BAUTISTA CONTRERAS", correo: "bmariu7@hotmail.com", area: "ADMINISTRATIVO", cargo: "TESORERIA", empleador: "YANKO", sueldo: 3502000 },
  { cedula: "1090460800", nombre: "YULEISI VIRGINIA MORENO CRUZ", correo: "yulimoreno93@gmail.com", area: "ADMINISTRATIVO", cargo: "LIDER TALENTO HUMANO", empleador: "YANKO", sueldo: 2600000 },
  { cedula: "37390386", nombre: "YULIANA ANDREA BLETRAN JAIMES", correo: "yulianarqbj@gmail.com", area: "DISEÑO", cargo: "LIDER CREATIVA", empleador: "YANKO", sueldo: 4000000 },
  { cedula: "1004802413", nombre: "ANDRES ESTEBAN VEGA GONZALEZ", correo: "stevandres27@gmail.com", area: "CORTE", cargo: "CORTADOR", empleador: "INDUTEX", sueldo: 1750905 },
  { cedula: "1090456022", nombre: "SHIRLEY SABRINA CONTRERAS CRUZ", correo: "sabrinacontrerascruz@gmail.com", area: "DISEÑO", cargo: "DISEÑO GRAFICO", empleador: "INDUTEX", sueldo: 2000000 },
  { cedula: "1094277949", nombre: "KAREN DAYANA DELGADO VILLAMIZAR", correo: "karenddelgadov@gmail.com", area: "DISEÑO", cargo: "DISEÑO MODAS", empleador: "YANKO", sueldo: 2600000 },
  { cedula: "1091805089", nombre: "NELLY PATRICIA TRIVIÑO CRISTANCHO", correo: "nelsonjohantoro@gmail.com", area: "MAQUILA", cargo: "OPERARIO DE CONFECCIÓN", empleador: "INDUTEX", sueldo: 1750905 },
  { cedula: "1090524225", nombre: "DANIELA ALEXANDRA PEÑARANDA COTAMO", correo: "dannycotamo@gmail.com", area: "ADMINISTRATIVO", cargo: "COMMUNITY MANAGER", empleador: "INDUTEX", sueldo: 2100000 },
  { cedula: "1093794155", nombre: "PAULA ANDREA MARTINEZ AGUILAR", correo: "paulita9801@hotmail.com", area: "MAQUILA", cargo: "REVISADORA DE CONFECIÓN", empleador: "INDUTEX", sueldo: 1750905 },
  { cedula: "1090507395", nombre: "KEVIN RONALDO CONTRERAS CASTELLANOS", correo: "keconca19@gmail.com", area: "ADMINISTRATIVO", cargo: "CONTADOR", empleador: "YANKO", sueldo: 2200000 },
  { cedula: "1096949415", nombre: "YESICA TATIANA CORREA PEÑARANDA", correo: "tatacorrea0501@gmail.com", area: "DISEÑO", cargo: "APRENDIZ SENA", empleador: "YANKO", sueldo: 1750905 },
  { cedula: "60373362", nombre: "BERTA MARIA CONTRERAS VELASCO", correo: "bertacontreras110476@gmail.com", area: "CORTE", cargo: "CORTADOR", empleador: "INDUTEX", sueldo: 1750905 },
];
// Grupo de Trabajo (2026-09-09, a pedido de Fredy): nivel arriba de Área
// Interna, para organizar varias áreas relacionadas bajo un mismo grupo
// (ej. "Administrativo" = Contabilidad + Diseño, "Operativo" = Zona de
// Calor + Corte + Bodega + Control de Calidad). Puramente organizativo/
// visual por ahora -- no dispara ningún cálculo ni permiso nuevo, solo
// ordena y agrupa cómo se ven las Áreas Internas (esta pantalla) y sus
// selectores en Trabajadores y Cargo.
function GrupoTrabajoModal({ grupo, onSave, onClose }) {
  const [form, setForm] = useState({ nombre: grupo?.nombre || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({ nombre: form.nombre.trim() });
    onClose();
  }
  return (
    <Modal title={grupo ? "Editar Grupo de Trabajo" : "Nuevo Grupo de Trabajo"} onClose={onClose} width={400}>
      <Field label="Nombre del Grupo de Trabajo"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Administrativo, Operativo" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Agrupa varias Áreas Internas relacionadas (ej. Operativo = Zona de Calor + Corte + Bodega + Control de Calidad). Es solo organizativo: no cambia ningún cálculo ni permiso, solo ordena cómo se ven las Áreas Internas y los desplegables de Trabajadores/Cargo.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function GruposTrabajoView({ grupos, areasNomina, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | grupo
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenados = [...grupos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  function contarAreas(grupoId) {
    return (areasNomina || []).filter((a) => a.grupoTrabajoId === grupoId).length;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Agrupa varias Áreas Internas bajo un mismo grupo (ej. "Administrativo", "Operativo") para organizarlas mejor. Asigna cada Área Interna a un grupo desde Administrativo → Área Interna.
      </div>
      {modal && (
        <GrupoTrabajoModal
          grupo={modal === "nuevo" ? null : modal}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            ¿Eliminar el grupo de trabajo <strong>{confirmDel.nombre}</strong>?
            {contarAreas(confirmDel.id) > 0 && (
              <div style={{ marginTop: 10, color: C.red, fontWeight: 600 }}>⚠️ {contarAreas(confirmDel.id)} área(s) interna(s) tienen este grupo asignado -- quedarían sin grupo ("Sin grupo") hasta que les asignes otro.</div>
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
          <Btn onClick={() => setModal("nuevo")}>+ Nuevo Grupo de Trabajo</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin grupos de trabajo registrados todavía."
        columnas={[
          { key: "nombre", label: "Grupo de Trabajo" },
          { key: "areas", label: "Áreas Internas", align: "right", render: (f) => contarAreas(f.id) },
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
// Agrupa una lista de Áreas Internas por su Grupo de Trabajo, lista para
// pasarle a FSel como `groups`. Devuelve null si todavía no existe NINGÚN
// grupo de trabajo -- así el llamador cae al `options` plano de siempre,
// sin cambiar nada hasta que Fredy cree su primer grupo. `valueKey` es
// "id" (Cargo, que guarda areaId) o "nombre" (Trabajador, que guarda el
// nombre del área directamente).
function agruparAreasParaSelect(areasNomina, gruposTrabajo, valueKey) {
  if (!gruposTrabajo || !gruposTrabajo.length) return null;
  const porGrupo = new Map();
  const sinGrupo = [];
  (areasNomina || []).forEach((a) => {
    const g = a.grupoTrabajoId && gruposTrabajo.find((gr) => gr.id === a.grupoTrabajoId);
    if (g) {
      if (!porGrupo.has(g.id)) porGrupo.set(g.id, []);
      porGrupo.get(g.id).push(a);
    } else {
      sinGrupo.push(a);
    }
  });
  const aOpcion = (a) => ({ value: a[valueKey], label: a.nombre });
  const grupos = [...gruposTrabajo]
    .filter((g) => porGrupo.has(g.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((g) => ({
      label: g.nombre,
      options: porGrupo.get(g.id).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(aOpcion),
    }));
  if (sinGrupo.length) {
    grupos.push({ label: "Sin grupo", options: sinGrupo.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(aOpcion) });
  }
  return grupos;
}
function AreaNominaModal({ area, procesos, grupos, onSave, onClose }) {
  const [form, setForm] = useState({
    nombre: area?.nombre || "",
    grupoTrabajoId: area?.grupoTrabajoId || "",
    procesosCentroCosto: area?.procesosCentroCosto || [],
    metaDiariaUnidades: area?.metaDiariaUnidades ?? "",
    presupuestoMensualNomina: area?.presupuestoMensualNomina ?? "",
    modoMedicion: area?.modoMedicion || "",
    mideReclamosCalidad: !!area?.mideReclamosCalidad,
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({
      nombre: form.nombre.trim(),
      grupoTrabajoId: form.grupoTrabajoId || "",
      procesosCentroCosto: form.procesosCentroCosto,
      metaDiariaUnidades: form.metaDiariaUnidades === "" ? null : Number(form.metaDiariaUnidades) || 0,
      presupuestoMensualNomina: form.presupuestoMensualNomina === "" ? null : Number(form.presupuestoMensualNomina) || 0,
      modoMedicion: form.modoMedicion || "",
      mideReclamosCalidad: form.mideReclamosCalidad,
    });
    onClose();
  }
  return (
    <Modal title={area ? "Editar Área Interna" : "Nueva Área Interna"} onClose={onClose} width={440}>
      <Field label="Nombre del Área Interna"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: ZONA CALOR, EMPAQUE, ADMINISTRATIVO, CONTROL DE CALIDAD" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Esta lista alimenta el campo "Área Interna" de cada trabajador y el área que se le asigna a un líder en Usuarios. Es distinta de "Área TNS" (Operativa/Administrativo/Diseño, más abajo en Administrativo).
      </div>
      <Field label="Grupo de Trabajo (opcional)">
        <FSel value={form.grupoTrabajoId} onChange={set("grupoTrabajoId")} options={[...(grupos || [])].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((g) => ({ value: g.id, label: g.nombre }))} placeholder="Sin grupo" />
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Organiza esta área dentro de un grupo más amplio (ej. "Operativo", "Administrativo") -- puramente visual, no cambia ningún cálculo. Créalos en Administrativo → Grupos de Trabajo.
      </div>
      {/* (2026-09-02, a pedido de Fredy) Presupuesto mensual de nómina del
          área -- Centro de Costo (Planeación) lo compara contra el costo
          real de nómina (el mismo dato que ya se muestra ahí como "Costo
          nómina") para avisar si el área se pasó del presupuesto o no. El
          presupuesto del día sale de dividir este valor entre 20 días
          laborales, y el del año de multiplicarlo por 12. Aplica a
          cualquier área, tenga o no procesos marcados abajo. */}
      <Field label="Presupuesto mensual de nómina (opcional)">
        <FInput type="number" value={form.presupuestoMensualNomina} onChange={set("presupuestoMensualNomina")} placeholder="Ej: 8000000" />
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Techo de gasto de nómina para esta área, por mes completo. Centro de Costo (Planeación) reparte este valor entre 20 días laborales para el día, y lo multiplica por 12 para el año.
      </div>
      {/* (2026-09-02, a pedido de Fredy) Modo de medición explícito --
          reemplaza la detección automática ("si tiene procesos marcados")
          porque ya no alcanza con un solo caso: Destajo (Valor producido/
          Balance por trabajador, para áreas con Registrar Producción, ej.
          Corte, Confección, y también Zona de Calor y Control de Calidad),
          Despachado (compara el costo de nómina del área contra el
          despachado TOTAL de toda la empresa, de Facturación Clientes --
          para Administrativo y Bodega), Unidades movidas en Busint (el
          modo viejo, por proceso marcado abajo + meta diaria), o Base
          Administrativa (2026-09-10, a pedido de Fredy: para áreas que no
          producen ni despachan nada medible -- Gerencia, Contabilidad,
          Diseño -- compara el costo de nómina del área contra la BASE que
          ya se cobra en cada lote de Dado por Cumplido, pensada
          justamente para cubrir esos gastos administrativos). "Automático"
          (dejar en blanco) mantiene el comportamiento de antes para
          cualquier área que todavía no se haya reclasificado: con procesos
          marcados = Busint, sin marcar = Destajo. */}
      <Field label="Modo de medición en Centro de Costo">
        <select
          value={form.modoMedicion}
          onChange={(e) => set("modoMedicion")(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.white, color: C.ink }}
        >
          <option value="">Automático (según procesos marcados abajo)</option>
          <option value="destajo">Destajo (Valor producido / Balance)</option>
          <option value="despachado">Despachado (Facturación Clientes)</option>
          <option value="busint_unidades">Unidades movidas en Busint (por proceso)</option>
          <option value="base_dado_por_cumplido">Base Administrativa (Dado por Cumplido)</option>
        </select>
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        "Despachado", "Unidades movidas en Busint" y "Base Administrativa" no usan la tabla de trabajadores por destajo -- ninguna de las tres usa los procesos ni la meta de abajo, esos campos son solo para "Unidades movidas en Busint" (o "Automático" con procesos marcados).
      </div>
      <Field label="Procesos que cuentan para Centro de Costo (opcional)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, maxHeight: 160, overflowY: "auto" }}>
          {(procesos || []).length === 0 && <div style={{ fontSize: 12, color: C.slate }}>No hay procesos cargados en Nómina → Administrativo → Precios.</div>}
          {(procesos || []).map((p) => {
            const marcado = (form.procesosCentroCosto || []).includes(p.proceso);
            return (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.ink }}>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(e) => setForm((f) => {
                    const actuales = f.procesosCentroCosto || [];
                    const siguientes = e.target.checked ? [...actuales, p.proceso] : actuales.filter((x) => x !== p.proceso);
                    return { ...f, procesosCentroCosto: siguientes };
                  })}
                />
                {p.proceso}
              </label>
            );
          })}
        </div>
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Si marcas uno o más procesos, Centro de Costo (Planeación) mide esta área por unidades movidas en esos procesos (Busint) vs. la meta diaria de abajo, en vez de $ producido — pensado para áreas de sueldo fijo sin Registrar Producción.
      </div>
      {(form.procesosCentroCosto || []).length > 0 && (
        <Field label="Meta diaria de unidades (opcional)"><FInput type="number" value={form.metaDiariaUnidades} onChange={set("metaDiariaUnidades")} placeholder="Ej: 500" /></Field>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.ink, marginBottom: 8 }}>
        <input type="checkbox" checked={form.mideReclamosCalidad} onChange={(e) => set("mideReclamosCalidad")(e.target.checked)} />
        Esta área mide reclamos de Control de Calidad en Centro de Costo
      </label>
      {form.mideReclamosCalidad && (
        <div style={{ fontSize: 11, color: C.slate, marginTop: -4, marginBottom: 8 }}>
          En Centro de Costo (Planeación), al elegir esta área va a aparecer un panel con reclamos abiertos/resueltos y unidades afectadas (los mismos datos de la pantalla Control de Calidad), además de lo que ya se muestre por procesos/producción.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function AreasNominaView({ areas, trabajadores, procesos, grupos, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | area
  const [confirmDel, setConfirmDel] = useState(null);
  const nombreGrupo = (grupoId) => (grupos || []).find((g) => g.id === grupoId)?.nombre || null;
  // Se ordena agrupado (grupo primero, área después) en vez de puramente
  // alfabético -- las áreas sin grupo quedan al final ("Sin grupo").
  const ordenadas = [...areas].sort((a, b) => (nombreGrupo(a.grupoTrabajoId) || "zzz_sin_grupo").localeCompare(nombreGrupo(b.grupoTrabajoId) || "zzz_sin_grupo") || a.nombre.localeCompare(b.nombre));
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
          procesos={procesos}
          grupos={grupos}
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
          { key: "grupo", label: "Grupo de Trabajo", render: (f) => nombreGrupo(f.grupoTrabajoId) || <span style={{ color: C.slate }}>Sin grupo</span> },
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
// Cargo (2026-09-09, a pedido de Fredy; arrancó como "Zona Interna" y se
// renombró el mismo día porque en la práctica siempre se usó para el
// puesto/rol de cada quien, ej. CORTADOR, LIDER MAQUILA, GERENTE). Cada
// Cargo pertenece a UNA sola Área Interna (colección Firestore
// "nomina_zonas", { nombre, areaId } -- el nombre de la colección y del
// campo del trabajador ("zona") no cambiaron, solo cómo se ve en
// pantalla). Se guarda en cada trabajador junto a su Área Interna -- por
// ahora es solo clasificación, no cambia nada de "líder ve solo su
// gente" (eso sigue siendo por Área Interna).
function ZonaNominaModal({ zona, areasNomina, gruposTrabajo, onSave, onClose }) {
  const [form, setForm] = useState({ nombre: zona?.nombre || "", areaId: zona?.areaId || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const gruposParaSelect = agruparAreasParaSelect(areasNomina, gruposTrabajo, "id");
  function guardar() {
    if (!form.nombre.trim() || !form.areaId) return;
    onSave({ nombre: form.nombre.trim(), areaId: form.areaId });
    onClose();
  }
  return (
    <Modal title={zona ? "Editar Cargo" : "Nuevo Cargo"} onClose={onClose} width={400}>
      <Field label="Área Interna a la que pertenece">
        <FSel
          value={form.areaId}
          onChange={set("areaId")}
          options={gruposParaSelect ? undefined : [...areasNomina].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((a) => ({ value: a.id, label: a.nombre }))}
          groups={gruposParaSelect || undefined}
          placeholder="Elegir..."
        />
      </Field>
      <Field label="Nombre del Cargo"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: CORTADOR, GERENTE, LIDER BODEGA" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        El puesto/rol de cada trabajador, agrupado por Área Interna. Alimenta el campo "Cargo" de cada trabajador -- solo se pueden elegir cargos del Área Interna que ya tenga asignada.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim() || !form.areaId}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function ZonasNominaView({ zonas, areasNomina, gruposTrabajo, trabajadores, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | zona
  const [confirmDel, setConfirmDel] = useState(null);
  const nombreArea = (areaId) => areasNomina.find((a) => a.id === areaId)?.nombre || "(área borrada)";
  const ordenadas = [...zonas].sort((a, b) => nombreArea(a.areaId).localeCompare(nombreArea(b.areaId)) || a.nombre.localeCompare(b.nombre));
  function contarTrabajadores(zona) {
    return (trabajadores || []).filter((t) => t.zona === zona.nombre && t.area === nombreArea(zona.areaId)).length;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        El puesto/rol de cada trabajador (ej. CORTADOR, GERENTE, LIDER BODEGA). Cada Cargo pertenece a una sola Área Interna, y se usa junto a ella para clasificar al trabajador.
      </div>
      {modal && (
        <ZonaNominaModal
          zona={modal === "nuevo" ? null : modal}
          areasNomina={areasNomina}
          gruposTrabajo={gruposTrabajo}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            ¿Eliminar el cargo <strong>{confirmDel.nombre}</strong> ({nombreArea(confirmDel.areaId)})?
            {contarTrabajadores(confirmDel) > 0 && (
              <div style={{ marginTop: 10, color: C.red, fontWeight: 600 }}>⚠️ {contarTrabajadores(confirmDel)} trabajador(es) tienen este cargo asignado — no se les cambia solo, quedarían con un cargo que ya no existe en la lista. Revísalos primero en Trabajadores.</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
          </div>
        </Modal>
      )}
      {isAdmin && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <Btn onClick={() => setModal("nuevo")} disabled={!areasNomina.length}>+ Nuevo Cargo</Btn>
          {!areasNomina.length && <span style={{ fontSize: 12, color: C.slate }}>Primero crea al menos un Área Interna.</span>}
        </div>
      )}
      <Tabla
        vacio="Sin cargos registrados todavía."
        columnas={[
          { key: "nombre", label: "Cargo" },
          { key: "area", label: "Área Interna", render: (f) => nombreArea(f.areaId) },
          { key: "trabajadores", label: "Trabajadores", align: "right", render: (f) => contarTrabajadores(f) },
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
// (2026-09-01, pedido de Fredy) Catálogo de Motivos de Ausencia: antes era
// una lista fija en el código (ver MOTIVOS_AUSENCIA/MOTIVO_ICONO arriba),
// ahora editable por el admin -- mismo patrón que Área Interna/Área TNS
// (colección Firestore "nomina_motivos_ausencia", { nombre, icono }). Fredy
// pidió poder agregar motivos nuevos (ej. "Escolaridad") sin depender de
// que se le agreguen en el código cada vez. El desplegable "Motivo" del
// modal Nueva/Editar Ausencia y los íconos del calendario de Permisos
// ahora leen esta lista en vez de la constante fija.
function MotivoAusenciaModal({ motivo, onSave, onClose }) {
  const [form, setForm] = useState({ nombre: motivo?.nombre || "", icono: motivo?.icono || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({ nombre: form.nombre.trim(), icono: form.icono.trim() || "❔" });
    onClose();
  }
  return (
    <Modal title={motivo ? "Editar Motivo de Ausencia" : "Nuevo Motivo de Ausencia"} onClose={onClose} width={400}>
      <Field label="Nombre del motivo"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Escolaridad, Vacaciones, Incapacidad" /></Field>
      <Field label="Ícono (opcional)"><FInput value={form.icono} onChange={set("icono")} placeholder="Ej: 🎓 (si lo dejas vacío usa ❔)" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Este ícono aparece junto al motivo en el calendario de Permisos.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function MotivosAusenciaView({ motivos, ausencias, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | motivo
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenados = [...motivos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  function contarAusencias(nombre) {
    return (ausencias || []).filter((a) => a.motivo === nombre).length;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Estos son los motivos que se pueden elegir al registrar una ausencia (Motivos de Ausencia, calendario de Permisos). Agrega, renombra o borra los que necesites — ej. "Escolaridad".
      </div>
      {modal && (
        <MotivoAusenciaModal
          motivo={modal === "nuevo" ? null : modal}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            ¿Eliminar el motivo <strong>{confirmDel.nombre}</strong>?
            {contarAusencias(confirmDel.nombre) > 0 && (
              <div style={{ marginTop: 10, color: C.red, fontWeight: 600 }}>⚠️ {contarAusencias(confirmDel.nombre)} ausencia(s) ya registradas usan este motivo — no se les cambia ni se borran, pero este motivo ya no va a aparecer en la lista para elegir de nuevo.</div>
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
          <Btn onClick={() => setModal("nuevo")}>+ Nuevo Motivo</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin motivos registrados todavía."
        columnas={[
          { key: "icono", label: "", render: (f) => <span style={{ fontSize: 18 }}>{f.icono || "❔"}</span> },
          { key: "nombre", label: "Motivo" },
          { key: "usos", label: "Ausencias registradas", align: "right", render: (f) => contarAusencias(f.nombre) },
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
// (2026-09-09, a pedido de Fredy) Catálogo de Turnos: algunos trabajadores
// no tienen el horario completo (ej. Jimmi solo lunes/miércoles/viernes de
// 1:30pm a 4pm, Karen Dayana Delgado lunes a viernes de 7am a 12pm) -- sin
// esto, el Reporte de Asistencia les contaba como falta días que ni
// siquiera les correspondía trabajar. Un trabajador SIN turno asignado
// sigue funcionando exactamente como antes (lunes a viernes + sábado si
// hay festivo esa semana) -- este catálogo es solo para las excepciones.
const DIAS_SEMANA_TURNO = ["Lun", "Mar", "Mie", "Jue", "Vie"];
function labelDiaTurno(d) {
  return { Lun: "Lunes", Mar: "Martes", Mie: "Miércoles", Jue: "Jueves", Vie: "Viernes" }[d] || d;
}
function TurnoModal({ turno, onSave, onClose }) {
  const [form, setForm] = useState({
    nombre: turno?.nombre || "",
    dias: turno?.dias || [...DIAS_SEMANA_TURNO],
    sabadoSiFestivo: turno?.sabadoSiFestivo ?? true,
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function toggleDia(d) {
    setForm((f) => ({ ...f, dias: f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d] }));
  }
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({ nombre: form.nombre.trim(), dias: form.dias, sabadoSiFestivo: !!form.sabadoSiFestivo });
    onClose();
  }
  return (
    <Modal title={turno ? "Editar Turno" : "Nuevo Turno"} onClose={onClose} width={440}>
      <Field label="Nombre del turno"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Medio tiempo mañana (7am-12pm)" /></Field>
      <Field label="Días que le corresponden">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DIAS_SEMANA_TURNO.map((d) => (
            <button key={d} type="button" onClick={() => toggleDia(d)} style={{ padding: "6px 12px", borderRadius: 6, border: `1.5px solid ${form.dias.includes(d) ? C.blue : C.border}`, background: form.dias.includes(d) ? C.blueBg : C.white, color: form.dias.includes(d) ? C.blue : C.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {labelDiaTurno(d)}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Sábado">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.slate, cursor: "pointer" }}>
          <input type="checkbox" checked={form.sabadoSiFestivo} onChange={(e) => set("sabadoSiFestivo")(e.target.checked)} /> Le corresponde el sábado cuando esa semana tiene un festivo entre semana
        </label>
      </Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={guardar} disabled={!form.nombre.trim()}>Guardar</Btn>
      </div>
    </Modal>
  );
}
function TurnosView({ turnos, trabajadores, isAdmin, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | turno
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenados = [...turnos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  function contarTrabajadores(turnoId) {
    return trabajadores.filter((t) => t.turnoId === turnoId).length;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Los turnos definen qué días de la semana le corresponde trabajar a cada persona -- el Reporte de Asistencia usa esto para saber qué días contar como falta. Si un trabajador no tiene turno asignado (en Trabajadores), se le asume el horario completo (lunes a viernes, más sábado cuando esa semana tiene festivo).
      </div>
      {modal && (
        <TurnoModal
          turno={modal === "nuevo" ? null : modal}
          onSave={(data) => onSave(modal === "nuevo" ? { id: uid(), ...data } : { id: modal.id, ...data })}
          onClose={() => setModal(null)}
        />
      )}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            ¿Eliminar el turno <strong>{confirmDel.nombre}</strong>?
            {contarTrabajadores(confirmDel.id) > 0 && (
              <div style={{ marginTop: 10, color: C.red, fontWeight: 600 }}>⚠️ {contarTrabajadores(confirmDel.id)} trabajador(es) tienen este turno asignado -- les queda sin turno (se les vuelve a asumir el horario completo) hasta que les asignes otro.</div>
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
          <Btn onClick={() => setModal("nuevo")}>+ Nuevo Turno</Btn>
        </div>
      )}
      <Tabla
        vacio="Sin turnos registrados todavía -- sin turno, se asume el horario completo de siempre."
        columnas={[
          { key: "nombre", label: "Turno" },
          { key: "dias", label: "Días", render: (f) => (f.dias || []).map(labelDiaTurno).join(", ") || "—" },
          { key: "sabadoSiFestivo", label: "Sábado si hay festivo", render: (f) => f.sabadoSiFestivo ? "Sí" : "No" },
          { key: "usos", label: "Trabajadores", align: "right", render: (f) => contarTrabajadores(f.id) },
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
// (2026-09-10, a pedido de Fredy) Excel de Trabajadores: exportar "bonito"
// con colores para poder editar varios datos a la vez fuera de Atlas, y
// volver a subir el mismo archivo para aplicar los cambios. Definicion
// UNICA de columnas -- la usan tanto el export como el import, para que
// nunca queden desincronizadas.
// - "ID Huellero" se exporta solo de referencia (se ve gris en el Excel) --
//   el import NUNCA la lee, se sigue vinculando aparte desde Reporte de
//   Asistencia (decision de Fredy, para no romper ese vinculo por accidente).
// - Una celda vacia en el Excel subido = "no tocar ese campo" (nunca se
//   interpreta como borrar/poner en 0).
// - Cedulas del archivo que no correspondan a ningun trabajador existente
//   se ignoran (decision de Fredy) -- no crean trabajadores nuevos.
// - Antes de guardar nada se arma una vista previa (campo por campo, por
//   trabajador) que Fredy tiene que confirmar a mano.
const COLUMNAS_EXCEL_TRABAJADORES = [
  { campo: "nombre", label: "Nombre", tipo: "texto" },
  { campo: "cedula", label: "Cédula", tipo: "texto" },
  { campo: "correo", label: "Correo", tipo: "texto" },
  { campo: "area", label: "Área Interna", tipo: "catalogo_area" },
  { campo: "zona", label: "Cargo", tipo: "catalogo_cargo" },
  { campo: "areaTNS", label: "Área TNS", tipo: "catalogo_areaTNS" },
  { campo: "empleador", label: "Empleador", tipo: "catalogo_empleador" },
  { campo: "tipoNomina", label: "Tipo Nómina", tipo: "catalogo_tipoNomina" },
  { campo: "claseRiesgoARL", label: "Clase ARL", tipo: "catalogo_claseARL" },
  { campo: "sueldo", label: "Sueldo", tipo: "numero" },
  { campo: "auxilioTransporte", label: "Auxilio de Transporte", tipo: "numero" },
  { campo: "fechaIngreso", label: "Fecha de Ingreso (AAAA-MM-DD)", tipo: "fecha" },
  { campo: "cesantiasAcumuladas", label: "Cesantías Acumuladas", tipo: "numero" },
  { campo: "tarifaHora", label: "Tarifa por Hora", tipo: "numero" },
  { campo: "tnsCodigo", label: "Código TNS", tipo: "texto" },
  { campo: "turnoId", label: "Turno", tipo: "catalogo_turno" },
  { campo: "activo", label: "Estado", tipo: "estado" },
  { campo: "idHuellero", label: "ID Huellero (no editar aquí)", tipo: "protegido" },
];
async function exportarTrabajadoresExcel(trabajadores, turnos) {
  const XLSX = await import("xlsx-js-style");
  const ordenados = [...trabajadores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const nombreTurno = (id) => (turnos || []).find((t) => t.id === id)?.nombre || "";
  const rgb = (hex) => hex.replace("#", "");
  const valorCelda = (t, col) => {
    switch (col.campo) {
      case "sueldo":
      case "auxilioTransporte":
      case "cesantiasAcumuladas":
      case "tarifaHora":
        return Number(t[col.campo] || 0);
      case "activo":
        return t.activo ? "Activo" : "Inactivo";
      case "turnoId":
        return nombreTurno(t.turnoId) || "Horario completo";
      default:
        return t[col.campo] || "";
    }
  };
  const encabezados = COLUMNAS_EXCEL_TRABAJADORES.map((c) => c.label);
  const filas = ordenados.map((t) => COLUMNAS_EXCEL_TRABAJADORES.map((c) => valorCelda(t, c)));
  const wsData = [encabezados, ...filas];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = COLUMNAS_EXCEL_TRABAJADORES.map((c) => ({ wch: Math.max(14, c.label.length + 2) }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  const THIN = { style: "thin", color: { rgb: rgb(C.border) } };
  const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  const idxProtegida = COLUMNAS_EXCEL_TRABAJADORES.findIndex((c) => c.tipo === "protegido");
  const idxEstado = COLUMNAS_EXCEL_TRABAJADORES.findIndex((c) => c.tipo === "estado");
  for (let r = 0; r < wsData.length; r++) {
    for (let c = 0; c < COLUMNAS_EXCEL_TRABAJADORES.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      let style = { border: BOX, alignment: { vertical: "center", horizontal: "left", wrapText: false } };
      if (r === 0) {
        style.font = { bold: true, sz: 11, color: { rgb: "FFFFFF" } };
        style.fill = { patternType: "solid", fgColor: { rgb: rgb(C.ink) } };
        style.alignment.horizontal = "center";
      } else if (c === idxProtegida) {
        style.fill = { patternType: "solid", fgColor: { rgb: "EDEDED" } };
        style.font = { color: { rgb: "8A8A8A" }, italic: true };
      } else if (c === idxEstado) {
        const esActivo = wsData[r][c] === "Activo";
        style.fill = { patternType: "solid", fgColor: { rgb: rgb(esActivo ? C.greenBg : C.redBg) } };
        style.font = { bold: true, color: { rgb: rgb(esActivo ? C.green : C.red) } };
        style.alignment.horizontal = "center";
      } else {
        style.fill = { patternType: "solid", fgColor: { rgb: r % 2 === 0 ? rgb(C.canvas) : "FFFFFF" } };
      }
      ws[addr].s = style;
    }
  }
  ws["!rows"] = wsData.map((_, i) => (i === 0 ? { hpt: 22 } : { hpt: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trabajadores");
  XLSX.writeFile(wb, `Trabajadores_${today()}.xlsx`);
}
// Encuentra en la fila de encabezado del Excel el indice de cada columna de
// COLUMNAS_EXCEL_TRABAJADORES comparando el texto (sin tildes/mayusculas,
// ignorando la aclaracion entre parentesis) -- asi el orden de columnas no
// importa y el import no se rompe si Fredy borra una columna que no le
// interesa tocar.
function mapearColumnasExcel(filaEncabezado) {
  const norm = (filaEncabezado || []).map((h) => normalizarNombreParaComparar(h));
  const indices = {};
  COLUMNAS_EXCEL_TRABAJADORES.forEach((col) => {
    const clave = normalizarNombreParaComparar(col.label).split(" (")[0];
    indices[col.campo] = norm.findIndex((h) => h === clave);
  });
  return indices;
}
function valorActualMostrar(col, trabajador, ctx) {
  switch (col.tipo) {
    case "numero":
      return fmtNum(trabajador[col.campo] || 0);
    case "estado":
      return trabajador.activo ? "Activo" : "Inactivo";
    case "catalogo_claseARL":
      return trabajador.claseRiesgoARL ? labelClaseARL(trabajador.claseRiesgoARL) : "—";
    case "catalogo_turno":
      return (ctx.turnos || []).find((t) => t.id === trabajador.turnoId)?.nombre || "Horario completo";
    default:
      return trabajador[col.campo] || "—";
  }
}
// Decide que hacer con UNA celda del Excel subido: null = no toca nada
// (celda vacia o igual a lo que ya hay), { cambio } = valor nuevo valido,
// { advertencia } = el texto no se pudo interpretar (no se aplica, se
// avisa en la vista previa).
function resolverCeldaExcel(col, valorCrudo, trabajador, ctx) {
  const texto = String(valorCrudo ?? "").trim();
  if (col.tipo === "protegido") return null;
  if (col.tipo === "numero") {
    if (texto === "") return null;
    const num = Number(String(texto).replace(/[^0-9.-]/g, ""));
    if (Number.isNaN(num)) return { advertencia: `"${texto}" no es un número válido` };
    if (Number(trabajador[col.campo] || 0) === num) return null;
    return { cambio: { valor: num, mostrar: fmtNum(num) } };
  }
  if (col.tipo === "estado") {
    if (texto === "") return null;
    const t = normalizarNombreParaComparar(texto);
    let val;
    if (t.startsWith("ACTIVO") || t === "SI" || t === "TRUE") val = true;
    else if (t.startsWith("INACTIVO") || t === "NO" || t === "FALSE") val = false;
    else return { advertencia: `Estado "${texto}" no reconocido (usa Activo/Inactivo)` };
    if (!!trabajador.activo === val) return null;
    return { cambio: { valor: val, mostrar: val ? "Activo" : "Inactivo" } };
  }
  if (col.tipo === "fecha") {
    if (texto === "") return null;
    // Si Excel convirtió la celda en fecha real (numero de serie) al
    // editarla -- pasa seguido aunque se haya exportado como texto -- se
    // reconstruye el AAAA-MM-DD en vez de marcarla como error.
    let fechaTexto = texto;
    if (/^\d+(\.\d+)?$/.test(texto)) {
      const serie = Number(texto);
      const d = new Date(Math.round((serie - 25569) * 86400000));
      if (!Number.isNaN(d.getTime())) fechaTexto = d.toISOString().slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto)) return { advertencia: `Fecha "${texto}" no tiene el formato AAAA-MM-DD` };
    if ((trabajador.fechaIngreso || "") === fechaTexto) return null;
    return { cambio: { valor: fechaTexto, mostrar: fechaTexto } };
  }
  if (col.tipo === "catalogo_area") {
    if (texto === "") return null;
    if (normalizarNombreParaComparar(trabajador.area) === normalizarNombreParaComparar(texto)) return null;
    const match = ctx.areasNomina.find((a) => normalizarNombreParaComparar(a.nombre) === normalizarNombreParaComparar(texto));
    if (!match) return { advertencia: `Área Interna "${texto}" no existe en el catálogo` };
    return { cambio: { valor: match.nombre, mostrar: match.nombre } };
  }
  if (col.tipo === "catalogo_areaTNS") {
    if (texto === "") return null;
    if (normalizarNombreParaComparar(trabajador.areaTNS) === normalizarNombreParaComparar(texto)) return null;
    const match = ctx.areasTNS.find((a) => normalizarNombreParaComparar(a.nombre) === normalizarNombreParaComparar(texto));
    if (!match) return { advertencia: `Área TNS "${texto}" no existe en el catálogo` };
    return { cambio: { valor: match.nombre, mostrar: match.nombre } };
  }
  if (col.tipo === "catalogo_cargo") {
    if (texto === "") return null;
    if (normalizarNombreParaComparar(trabajador.zona) === normalizarNombreParaComparar(texto)) return null;
    const nombreAreaFinal = ctx.areaFinal || trabajador.area;
    const areaId = ctx.areasNomina.find((a) => normalizarNombreParaComparar(a.nombre) === normalizarNombreParaComparar(nombreAreaFinal))?.id;
    const match = (ctx.zonasNomina || []).find((z) => z.areaId === areaId && normalizarNombreParaComparar(z.nombre) === normalizarNombreParaComparar(texto));
    if (!match) return { advertencia: `Cargo "${texto}" no existe dentro del Área "${nombreAreaFinal}"` };
    return { cambio: { valor: match.nombre, mostrar: match.nombre } };
  }
  if (col.tipo === "catalogo_empleador") {
    if (texto === "") return null;
    if (normalizarNombreParaComparar(trabajador.empleador) === normalizarNombreParaComparar(texto)) return null;
    const match = EMPLEADORES.find((e) => normalizarNombreParaComparar(e) === normalizarNombreParaComparar(texto));
    if (!match) return { advertencia: `Empleador "${texto}" no es válido (usa YANKO o INDUTEX)` };
    return { cambio: { valor: match, mostrar: match } };
  }
  if (col.tipo === "catalogo_tipoNomina") {
    if (texto === "") return null;
    if (normalizarNombreParaComparar(trabajador.tipoNomina) === normalizarNombreParaComparar(texto)) return null;
    const match = TIPOS_NOMINA.find((tp) => normalizarNombreParaComparar(tp) === normalizarNombreParaComparar(texto));
    if (!match) return { advertencia: `Tipo de Nómina "${texto}" no es válido` };
    return { cambio: { valor: match, mostrar: match } };
  }
  if (col.tipo === "catalogo_claseARL") {
    if (texto === "") return null;
    if (normalizarNombreParaComparar(trabajador.claseRiesgoARL || "") === normalizarNombreParaComparar(texto)) return null;
    const match = CLASES_RIESGO_ARL.find((c) => normalizarNombreParaComparar(c.value) === normalizarNombreParaComparar(texto) || normalizarNombreParaComparar(c.label) === normalizarNombreParaComparar(texto));
    if (!match) return { advertencia: `Clase ARL "${texto}" no es válida (usa I, II, III, IV o V)` };
    if (match.value === trabajador.claseRiesgoARL) return null;
    return { cambio: { valor: match.value, mostrar: match.label } };
  }
  if (col.tipo === "catalogo_turno") {
    if (texto === "") return null;
    const turnoActualNombre = (ctx.turnos || []).find((t) => t.id === trabajador.turnoId)?.nombre || "";
    if (normalizarNombreParaComparar(texto).includes("HORARIO COMPLETO")) {
      if (!trabajador.turnoId) return null;
      return { cambio: { valor: "", mostrar: "Horario completo" } };
    }
    if (normalizarNombreParaComparar(turnoActualNombre) === normalizarNombreParaComparar(texto)) return null;
    const match = (ctx.turnos || []).find((t) => normalizarNombreParaComparar(t.nombre) === normalizarNombreParaComparar(texto));
    if (!match) return { advertencia: `Turno "${texto}" no existe en el catálogo` };
    return { cambio: { valor: match.id, mostrar: match.nombre } };
  }
  if (texto === "") return null;
  if (String(trabajador[col.campo] || "").trim() === texto) return null;
  return { cambio: { valor: texto, mostrar: texto } };
}
// Lee las filas crudas del Excel (header:1) y arma la vista previa: por
// cada trabajador que matcheo por cedula, la lista de campos que
// realmente cambian (con su valor anterior y nuevo ya para mostrar) y las
// advertencias que no se pudieron aplicar.
function analizarExcelTrabajadores(filasArchivo, trabajadores, ctx) {
  const indices = mapearColumnasExcel(filasArchivo[0] || []);
  if (indices.cedula < 0) {
    return { error: "No se encontró la columna \"Cédula\" en el archivo -- no se puede identificar a quién pertenece cada fila." };
  }
  const columnasNoEncontradas = COLUMNAS_EXCEL_TRABAJADORES.filter((c) => indices[c.campo] < 0 && c.tipo !== "protegido").map((c) => c.label);
  const filasResultado = [];
  const sinCoincidencia = [];
  for (let r = 1; r < filasArchivo.length; r++) {
    const fila = filasArchivo[r] || [];
    const cedulaArchivo = String(fila[indices.cedula] ?? "").trim();
    if (!cedulaArchivo) continue;
    const cedNorm = normalizarCedula(cedulaArchivo);
    const trabajador = trabajadores.find((t) => normalizarCedula(t.cedula) === cedNorm);
    if (!trabajador) {
      sinCoincidencia.push({ cedula: cedulaArchivo, nombre: indices.nombre >= 0 ? String(fila[indices.nombre] ?? "").trim() : "" });
      continue;
    }
    let areaFinalTexto = trabajador.area;
    if (indices.area >= 0) {
      const crudo = String(fila[indices.area] ?? "").trim();
      if (crudo) areaFinalTexto = crudo;
    }
    const cambios = [];
    const advertencias = [];
    for (const col of COLUMNAS_EXCEL_TRABAJADORES) {
      const idx = indices[col.campo];
      if (idx < 0 || col.tipo === "protegido") continue;
      const r2 = resolverCeldaExcel(col, fila[idx], trabajador, { ...ctx, areaFinal: areaFinalTexto });
      if (!r2) continue;
      if (r2.advertencia) advertencias.push({ campo: col.label, motivo: r2.advertencia });
      else cambios.push({ campo: col.label, campoKey: col.campo, anterior: valorActualMostrar(col, trabajador, ctx), nuevo: r2.cambio.mostrar, valor: r2.cambio.valor });
    }
    if (cambios.length === 0 && advertencias.length === 0) continue;
    filasResultado.push({ id: trabajador.id, nombre: trabajador.nombre, cedula: trabajador.cedula, cambios, advertencias });
  }
  return { filas: filasResultado, sinCoincidencia, columnasNoEncontradas };
}
async function aplicarCambiosExcelTrabajadores(filasConCambios, onSave) {
  let actualizados = 0;
  for (const f of filasConCambios) {
    if (!f.cambios.length) continue;
    const datos = {};
    f.cambios.forEach((c) => { datos[c.campoKey] = c.valor; });
    await onSave({ id: f.id, ...datos });
    actualizados++;
  }
  return actualizados;
}
function TrabajadorModal({ trabajador, onSave, onClose, areasNomina, areasTNS, zonasNomina, turnos, gruposTrabajo }) {
  const [form, setForm] = useState({
    nombre: trabajador?.nombre || "",
    cedula: trabajador?.cedula || "",
    correo: trabajador?.correo || "",
    tarifaHora: trabajador?.tarifaHora ?? "",
    activo: trabajador?.activo ?? true,
    area: trabajador?.area || "Sin asignar",
    zona: trabajador?.zona || "",
    areaTNS: trabajador?.areaTNS || "",
    tnsCodigo: trabajador?.tnsCodigo || "",
    empleador: trabajador?.empleador || "",
    claseRiesgoARL: trabajador?.claseRiesgoARL || "",
    idHuellero: trabajador?.idHuellero || "",
    turnoId: trabajador?.turnoId || "",
    tipoNomina: trabajador?.tipoNomina || "",
    sueldo: trabajador?.sueldo ?? "",
    auxilioTransporte: trabajador?.auxilioTransporte ?? "",
    fechaIngreso: trabajador?.fechaIngreso || "",
    cesantiasAcumuladas: trabajador?.cesantiasAcumuladas ?? "",
    medirComoBaseAdministrativa: trabajador?.medirComoBaseAdministrativa ?? false,
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  // (2026-09-09, a pedido de Fredy) Cargo depende de qué Área Interna se
  // eligió arriba -- si cambian el área a una que no tiene el cargo
  // actual, se limpia solo (evita guardar una combinación área/cargo que
  // ya no tiene sentido).
  const areaSeleccionadaId = areasNomina.find((a) => a.nombre === form.area)?.id;
  const zonasDelArea = (zonasNomina || []).filter((z) => z.areaId === areaSeleccionadaId);
  const gruposAreaParaSelect = agruparAreasParaSelect(areasNomina, gruposTrabajo, "nombre");
  function cambiarArea(v) {
    setForm((f) => {
      const nuevaAreaId = areasNomina.find((a) => a.nombre === v)?.id;
      const zonaSigueValida = (zonasNomina || []).some((z) => z.areaId === nuevaAreaId && z.nombre === f.zona);
      return { ...f, area: v, zona: zonaSigueValida ? f.zona : "" };
    });
  }
  function guardar() {
    if (!form.nombre.trim()) return;
    onSave({
      nombre: form.nombre.trim(),
      cedula: form.cedula.trim(),
      correo: form.correo.trim(),
      tarifaHora: Number(form.tarifaHora) || 0,
      activo: !!form.activo,
      area: form.area || "Sin asignar",
      zona: form.zona || "",
      areaTNS: form.areaTNS || "",
      tnsCodigo: form.tnsCodigo.trim(),
      empleador: form.empleador || "",
      claseRiesgoARL: form.claseRiesgoARL || "",
      idHuellero: form.idHuellero.trim(),
      turnoId: form.turnoId || "",
      tipoNomina: form.tipoNomina || "",
      sueldo: Number(form.sueldo) || 0,
      auxilioTransporte: Number(form.auxilioTransporte) || 0,
      fechaIngreso: form.fechaIngreso || "",
      cesantiasAcumuladas: Number(form.cesantiasAcumuladas) || 0,
      medirComoBaseAdministrativa: !!form.medirComoBaseAdministrativa,
    });
    onClose();
  }
  return (
    <Modal title={trabajador ? "Editar Trabajador" : "Nuevo Trabajador"} onClose={onClose} width={440}>
      <Field label="Nombre"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Carlos Javier González" /></Field>
      <Field label="Cédula"><FInput value={form.cedula} onChange={set("cedula")} placeholder="Ej: 1004802413" /></Field>
      <Field label="Correo"><FInput type="email" value={form.correo} onChange={set("correo")} placeholder="Ej: nombre@gmail.com" /></Field>
      <Field label="ID Huellero (opcional)"><FInput value={form.idHuellero} onChange={set("idHuellero")} placeholder="Ej: 114 -- el ID que trae el reporte del huellero" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Vincula a esta persona con su ID en el equipo biométrico -- así el Reporte de Asistencia cruza los días trabajados aunque el nombre esté escrito distinto. Se puede dejar vacío y vincular después, directo desde el Reporte de Asistencia.
      </div>
      <Field label="Turno (opcional)">
        <FSel value={form.turnoId} onChange={set("turnoId")} options={(turnos || []).map((t) => ({ value: t.id, label: t.nombre }))} placeholder="Horario completo (por defecto)" />
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Si esta persona no trabaja el horario completo (lunes a viernes + sábado si hay festivo), asígnale acá su turno -- así el Reporte de Asistencia no le cuenta como falta los días que no le corresponden.
      </div>
      <Field label="Área Interna">
        <FSel
          value={form.area}
          onChange={cambiarArea}
          options={gruposAreaParaSelect ? ["Sin asignar"] : [...areasNomina.map((a) => a.nombre), "Sin asignar"]}
          groups={gruposAreaParaSelect || undefined}
          placeholder="Sin asignar"
        />
      </Field>
      <Field label="Cargo (opcional)">
        <FSel value={form.zona} onChange={set("zona")} options={zonasDelArea.map((z) => z.nombre)} placeholder={zonasDelArea.length ? "Sin asignar" : "Esta área no tiene cargos creados"} />
      </Field>
      <Field label="Centro de Costo">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" id="medirComoBaseAdministrativa" checked={!!form.medirComoBaseAdministrativa} onChange={(e) => set("medirComoBaseAdministrativa")(e.target.checked)} />
          <label htmlFor="medirComoBaseAdministrativa" style={{ fontSize: 12.5, color: C.ink, cursor: "pointer" }}>Medir en Base Administrativa (no en el Destajo de su área)</label>
        </div>
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Para líderes de un área que mide por Destajo (ej. Control de Calidad, Zona Calor) cuyo sueldo no debería contarse contra la producción de su gente. No cambia su Área Interna -- solo hace que en Centro de Costo aparezca en "👑 Líderes (Base Administrativa)" en vez del Destajo de su área.
      </div>
      <Field label="Área TNS"><FSel value={form.areaTNS} onChange={set("areaTNS")} options={areasTNS.map((a) => a.nombre)} placeholder="Sin clasificar" /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        "Área Interna" es la clasificación propia de la planta (los líderes ven solo a su gente por ahí). "Área TNS" es la que ya usa TNS (Operativa/Administrativo/Diseño) — sirve para cruzar cuando llegue el archivo de TNS.
      </div>
      <Field label="Empleador">
        <FSel value={form.empleador} onChange={set("empleador")} options={EMPLEADORES} placeholder="Sin asignar" />
      </Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
        Cuál de las dos empresas contrata legalmente a esta persona -- para poder ver cuánto se debe pagar de nómina por cada una.
      </div>
      <Field label="Tipo de Nómina">
        <FSel value={form.tipoNomina} onChange={set("tipoNomina")} options={TIPOS_NOMINA} placeholder="Sin clasificar" />
      </Field>
      {(form.tipoNomina === "Fiscal" || form.tipoNomina === "Fiscal Destajo" || form.tipoNomina === "Destajo") && (
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
      {form.tipoNomina === "Fiscal" && (
        <>
          <Field label="Clase de Riesgo ARL">
            <FSel value={form.claseRiesgoARL} onChange={set("claseRiesgoARL")} options={CLASES_RIESGO_ARL} placeholder="Sin asignar" />
          </Field>
          <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 8 }}>
            Define la tasa de ARL que paga la empresa por esta persona (según el riesgo de su labor) -- la necesita Nómina Fiscal para calcular cuánto se debe pagar.
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
function TrabajadoresView({ trabajadores, isAdmin, onSave, onDelete, areasNomina, areasTNS, zonasNomina, onSaveArea, onSaveZona, turnos, gruposTrabajo }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | trabajador
  const [confirmDel, setConfirmDel] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarMasOpciones, setMostrarMasOpciones] = useState(false);
  const [autoResultado, setAutoResultado] = useState(null);
  // Un solo flag para las 4 cargas de "conocidos" -- bloquea los 4
  // botones mientras cualquiera está corriendo, para que un doble clic
  // (o clic en otro botón a mitad de carga) no vuelva a crear duplicados.
  const [cargandoConocidos, setCargandoConocidos] = useState(null); // null | "fiscal_destajo" | "destajo" | "maquila" | "fiscal"
  const [importandoCorreos, setImportandoCorreos] = useState(false);
  const [resultadoCorreos, setResultadoCorreos] = useState(null);
  const importCorreosRef = useRef(null);
  // (2026-09-10, a pedido de Fredy) Descargar/subir Excel de Trabajadores
  // con cambios masivos -- ver helpers COLUMNAS_EXCEL_TRABAJADORES /
  // exportarTrabajadoresExcel / analizarExcelTrabajadores más arriba.
  const [subiendoExcel, setSubiendoExcel] = useState(false);
  const [previewExcel, setPreviewExcel] = useState(null);
  const [aplicandoExcel, setAplicandoExcel] = useState(false);
  const [resultadoExcel, setResultadoExcel] = useState(null);
  const subirExcelRef = useRef(null);
  async function handleSubirExcelTrabajadores(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendoExcel(true);
    setResultadoExcel(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await archivo.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const filasArchivo = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      const analisis = analizarExcelTrabajadores(filasArchivo, trabajadores, { areasNomina, zonasNomina, areasTNS, turnos });
      setPreviewExcel(analisis);
    } catch (err) {
      setPreviewExcel({ error: err?.message || String(err) });
    }
    setSubiendoExcel(false);
  }
  async function confirmarCambiosExcel() {
    if (!previewExcel?.filas?.length) { setPreviewExcel(null); return; }
    setAplicandoExcel(true);
    try {
      const actualizados = await aplicarCambiosExcelTrabajadores(previewExcel.filas, onSave);
      setResultadoExcel({ actualizados });
    } finally {
      setAplicandoExcel(false);
      setPreviewExcel(null);
    }
  }
  async function importarCorreosTrabajadores(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setImportandoCorreos(true);
    setResultadoCorreos(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await archivo.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      // Detecta las columnas por encabezado (Cédula / Nombre / Correo); si no
      // encuentra encabezados reconocibles, asume el orden Cédula, Nombre, Correo.
      const encabezado = (filas[0] || []).map((h) => normalizarNombreParaComparar(h));
      let colCedula = encabezado.findIndex((h) => h.includes("CEDULA"));
      let colNombre = encabezado.findIndex((h) => h.includes("NOMBRE"));
      let colCorreo = encabezado.findIndex((h) => h.includes("CORREO") || h.includes("EMAIL"));
      const empiezaEn = colCedula >= 0 || colNombre >= 0 || colCorreo >= 0 ? 1 : 0;
      if (colCedula < 0) colCedula = 0;
      if (colNombre < 0) colNombre = 1;
      if (colCorreo < 0) colCorreo = 2;
      let actualizados = 0;
      const sinCoincidencia = [];
      const revisar = [];
      for (let i = empiezaEn; i < filas.length; i++) {
        const fila = filas[i] || [];
        const cedulaArchivo = String(fila[colCedula] ?? "").trim();
        const nombreArchivo = String(fila[colNombre] ?? "").trim();
        const correoArchivo = String(fila[colCorreo] ?? "").trim();
        if (!cedulaArchivo || !correoArchivo) continue;
        const cedNorm = normalizarCedula(cedulaArchivo);
        const existente = trabajadores.find((t) => normalizarCedula(t.cedula) === cedNorm);
        if (!existente) {
          sinCoincidencia.push({ cedula: cedulaArchivo, nombre: nombreArchivo });
          continue;
        }
        if (normalizarNombreParaComparar(existente.nombre) !== normalizarNombreParaComparar(nombreArchivo)) {
          revisar.push({ cedula: cedulaArchivo, nombreArchivo, nombreSistema: existente.nombre });
          continue;
        }
        await onSave({ id: existente.id, correo: correoArchivo });
        actualizados++;
      }
      setResultadoCorreos({ actualizados, sinCoincidencia, revisar });
    } catch (err) {
      setResultadoCorreos({ error: err?.message || String(err) });
    }
    setImportandoCorreos(false);
  }
  const ordenados = [...trabajadores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const busquedaNorm = normalizarNombreParaComparar(busqueda);
  const ordenadosFiltrados = busquedaNorm
    ? ordenados.filter((t) => normalizarNombreParaComparar(t.nombre).includes(busquedaNorm) || String(t.cedula || "").includes(busqueda.trim()))
    : ordenados;
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
    if (cargandoConocidos) return;
    setCargandoConocidos("fiscal_destajo");
    try {
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
    } finally {
      setCargandoConocidos(null);
    }
  }
  // Mismo patron que arriba, pero para tipoNomina "Destajo" (pago por
  // produccion, no lleva seguridad social ni sueldo fijo editable en el
  // formulario -- se guarda igual sueldo/auxilioTransporte de referencia).
  const [dResultado, setDResultado] = useState(null);
  async function cargarDestajoConocidos() {
    if (cargandoConocidos) return;
    setCargandoConocidos("destajo");
    try {
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
    } finally {
      setCargandoConocidos(null);
    }
  }
  // (2026-09-09, a pedido de Fredy) Carga el personal de Maquila (ver
  // MAQUILA_CONOCIDOS arriba): primero se asegura de que exista el Área
  // Interna "MAQUILA" y cada Cargo que traiga la lista (el Cargo depende
  // de un Área ya creada -- ver TrabajadorModal), y después crea o
  // actualiza (por cédula) a cada trabajador, igual que Fiscal Destajo y
  // Destajo arriba.
  const [mzResultado, setMzResultado] = useState(null);
  async function cargarMaquilaConocidos() {
    if (cargandoConocidos) return;
    setCargandoConocidos("maquila");
    try {
      let areaMaquila = areasNomina.find((a) => a.nombre === "MAQUILA");
      let areaCreada = false;
      if (!areaMaquila) {
        areaMaquila = { id: uid(), nombre: "MAQUILA" };
        await onSaveArea({ id: areaMaquila.id, nombre: "MAQUILA", procesosCentroCosto: [], metaDiariaUnidades: null, presupuestoMensualNomina: null, modoMedicion: "", mideReclamosCalidad: false });
        areaCreada = true;
      }
      const zonasNecesarias = [...new Set(MAQUILA_CONOCIDOS.map((p) => p.zona).filter(Boolean))];
      const zonasYaCreadas = new Set(zonasNomina.filter((z) => z.areaId === areaMaquila.id).map((z) => z.nombre));
      let zonasCreadas = 0;
      for (const nombreZona of zonasNecesarias) {
        if (zonasYaCreadas.has(nombreZona)) continue;
        await onSaveZona({ id: uid(), nombre: nombreZona, areaId: areaMaquila.id });
        zonasCreadas++;
      }
      let creados = 0, actualizados = 0;
      for (const p of MAQUILA_CONOCIDOS) {
        const ced = normalizarCedula(p.cedula);
        const existente = trabajadores.find((t) => normalizarCedula(t.cedula) === ced);
        const datos = {
          nombre: existente?.nombre || p.nombre,
          cedula: existente?.cedula || p.cedula,
          correo: existente?.correo || p.correo || "",
          tarifaHora: existente?.tarifaHora || 0,
          activo: existente?.activo ?? true,
          area: "MAQUILA",
          zona: p.zona || "",
          areaTNS: existente?.areaTNS || "",
          tnsCodigo: existente?.tnsCodigo || "",
          tipoNomina: p.tipoNomina,
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
      setMzResultado({ creados, actualizados, areaCreada, zonasCreadas });
    } finally {
      setCargandoConocidos(null);
    }
  }
  // (2026-09-09, a pedido de Fredy) Carga la Nómina Fiscal completa (ver
  // FISCAL_CONOCIDOS arriba): crea las Áreas Internas que hagan falta,
  // crea el Cargo de cada quien bajo su área (igual que Maquila), y
  // después crea o actualiza (por cédula) a cada trabajador con su
  // Empleador, Cargo, Tipo de Nómina ("Fiscal") y sueldo.
  const [mfResultado, setMfResultado] = useState(null);
  async function cargarFiscalConocidos() {
    if (cargandoConocidos) return;
    setCargandoConocidos("fiscal");
    try {
      // Mapa local área -> id: arranca con lo que ya existe y se completa
      // con lo que se cree en esta misma pasada (areasNomina, al venir por
      // prop, no se refresca sola a mitad de la función).
      const idsPorArea = new Map(areasNomina.map((a) => [a.nombre, a.id]));
      let areasCreadas = 0;
      for (const nombreArea of [...new Set(FISCAL_CONOCIDOS.map((p) => p.area).filter(Boolean))]) {
        if (idsPorArea.has(nombreArea)) continue;
        const nuevaId = uid();
        await onSaveArea({ id: nuevaId, nombre: nombreArea, procesosCentroCosto: [], metaDiariaUnidades: null, presupuestoMensualNomina: null, modoMedicion: "", mideReclamosCalidad: false });
        idsPorArea.set(nombreArea, nuevaId);
        areasCreadas++;
      }
      const cargosYaCreados = new Set(zonasNomina.map((z) => `${z.areaId}::${z.nombre}`));
      let cargosCreados = 0;
      for (const p of FISCAL_CONOCIDOS) {
        if (!p.cargo) continue;
        const areaId = idsPorArea.get(p.area);
        if (!areaId) continue;
        const clave = `${areaId}::${p.cargo}`;
        if (cargosYaCreados.has(clave)) continue;
        await onSaveZona({ id: uid(), nombre: p.cargo, areaId });
        cargosYaCreados.add(clave);
        cargosCreados++;
      }
      let creados = 0, actualizados = 0;
      for (const p of FISCAL_CONOCIDOS) {
        const ced = normalizarCedula(p.cedula);
        const existente = trabajadores.find((t) => normalizarCedula(t.cedula) === ced);
        const datos = {
          nombre: existente?.nombre || p.nombre,
          cedula: existente?.cedula || p.cedula,
          correo: existente?.correo || p.correo || "",
          tarifaHora: existente?.tarifaHora || 0,
          activo: existente?.activo ?? true,
          area: p.area,
          zona: p.cargo || existente?.zona || "",
          areaTNS: existente?.areaTNS || "",
          tnsCodigo: existente?.tnsCodigo || "",
          empleador: p.empleador,
          claseRiesgoARL: p.empleador === "INDUTEX" ? "II" : "I",
          tipoNomina: "Fiscal",
          sueldo: p.sueldo,
          auxilioTransporte: 249095,
        };
        if (existente) {
          await onSave({ id: existente.id, ...datos });
          actualizados++;
        } else {
          await onSave({ id: uid(), ...datos });
          creados++;
        }
      }
      setMfResultado({ creados, actualizados, areasCreadas, cargosCreados });
    } finally {
      setCargandoConocidos(null);
    }
  }
  // (2026-09-09, a pedido de Fredy) Detecta trabajadores con la misma
  // cédula -- puede pasar si un botón "Cargar X conocidos" se presionó
  // dos veces seguidas antes de que la pantalla alcanzara a actualizarse.
  // Se muestra para que Fredy compare y borre a mano la copia que sobra
  // (las dos copias pueden tener datos distintos, así que no se borra
  // sola ninguna).
  const gruposDuplicados = Object.values(
    trabajadores.reduce((acc, t) => {
      const ced = normalizarCedula(t.cedula);
      if (!ced) return acc;
      (acc[ced] = acc[ced] || []).push(t);
      return acc;
    }, {})
  ).filter((grupo) => grupo.length > 1);
  return (
    <div>
      {modal && (
        <TrabajadorModal
          trabajador={modal === "nuevo" ? null : modal}
          areasNomina={areasNomina}
          areasTNS={areasTNS}
          zonasNomina={zonasNomina}
          turnos={turnos}
          gruposTrabajo={gruposTrabajo}
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
      {previewExcel && (
        <Modal title="Vista previa de cambios del Excel" onClose={() => setPreviewExcel(null)} width={640}>
          {previewExcel.error ? (
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 16 }}>Error leyendo el archivo: {previewExcel.error}</div>
          ) : (
            <>
              {previewExcel.columnasNoEncontradas?.length > 0 && (
                <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
                  No se encontraron estas columnas en el archivo (no se tocan): {previewExcel.columnasNoEncontradas.join(", ")}.
                </div>
              )}
              {previewExcel.filas.length === 0 ? (
                <div style={{ fontSize: 13, color: C.slate, marginBottom: 16 }}>No hay cambios que aplicar -- ningún dato quedó distinto al que ya está en el sistema.</div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 16 }}>
                  {previewExcel.filas.map((f) => (
                    <div key={f.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontWeight: 700, color: C.ink, marginBottom: 6 }}>{f.nombre} <span style={{ color: C.slate, fontWeight: 400 }}>· Cédula {f.cedula}</span></div>
                      {f.cambios.map((c, i) => (
                        <div key={i} style={{ fontSize: 12, color: C.ink, marginBottom: 2 }}>
                          <strong>{c.campo}:</strong> <span style={{ color: C.slate }}>{c.anterior}</span> → <span style={{ color: C.green, fontWeight: 700 }}>{c.nuevo}</span>
                        </div>
                      ))}
                      {f.advertencias.map((a, i) => (
                        <div key={i} style={{ fontSize: 12, color: C.amber, marginBottom: 2 }}>⚠️ {a.campo}: {a.motivo} -- no se aplica.</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {previewExcel.sinCoincidencia?.length > 0 && (
                <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>
                  {previewExcel.sinCoincidencia.length} fila(s) con una cédula que no corresponde a ningún trabajador -- se ignoran: {previewExcel.sinCoincidencia.map((s) => s.cedula).join(", ")}.
                </div>
              )}
            </>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setPreviewExcel(null)}>Cancelar</Btn>
            {!previewExcel.error && previewExcel.filas?.length > 0 && (
              <Btn onClick={confirmarCambiosExcel} disabled={aplicandoExcel}>{aplicandoExcel ? "Guardando..." : `Confirmar y guardar (${previewExcel.filas.length})`}</Btn>
            )}
          </div>
        </Modal>
      )}
      {isAdmin && (
        <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn onClick={() => setModal("nuevo")}>+ Nuevo Trabajador</Btn>
          <div style={{ position: "relative", flex: "0 1 260px", minWidth: 180 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.slate, pointerEvents: "none" }}>🔍</span>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o cédula..."
              style={{ width: "100%", padding: "9px 12px 9px 30px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}
            />
          </div>
          <Btn variant="secondary" onClick={() => exportarTrabajadoresExcel(trabajadores, turnos)}>📥 Descargar Excel</Btn>
          <Btn variant="ghost" onClick={() => setMostrarMasOpciones((v) => !v)}>{mostrarMasOpciones ? "▲ Menos opciones" : "⚙ Más opciones"}</Btn>
        </div>
      )}
      {isAdmin && mostrarMasOpciones && (
        <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 12, border: `1px dashed ${C.border}`, borderRadius: 10, background: C.canvas }}>
          <Btn variant="secondary" onClick={autocompletarCodigosTNS}>🔄 Autocompletar Código TNS (13 conocidos)</Btn>
          {autoResultado !== null && <span style={{ fontSize: 12, color: C.slate }}>{autoResultado} trabajador(es) actualizado(s).</span>}
          <Btn variant="secondary" onClick={cargarFiscalDestajoConocidos} disabled={!!cargandoConocidos}>
            {cargandoConocidos === "fiscal_destajo" ? "⏳ Cargando..." : "💼 Cargar Fiscal Destajo (5 conocidos)"}
          </Btn>
          {fdResultado !== null && <span style={{ fontSize: 12, color: C.slate }}>{fdResultado.creados} creado(s), {fdResultado.actualizados} actualizado(s).</span>}
          <Btn variant="secondary" onClick={cargarDestajoConocidos} disabled={!!cargandoConocidos}>
            {cargandoConocidos === "destajo" ? "⏳ Cargando..." : "💼 Cargar Destajo (12 conocidos)"}
          </Btn>
          {dResultado !== null && <span style={{ fontSize: 12, color: C.slate }}>{dResultado.creados} creado(s), {dResultado.actualizados} actualizado(s).</span>}
          <Btn variant="secondary" onClick={cargarMaquilaConocidos} disabled={!!cargandoConocidos}>
            {cargandoConocidos === "maquila" ? "⏳ Cargando..." : "🧵 Cargar Maquila (53 conocidos)"}
          </Btn>
          {mzResultado !== null && (
            <span style={{ fontSize: 12, color: C.slate }}>
              {mzResultado.creados} creado(s), {mzResultado.actualizados} actualizado(s)
              {(mzResultado.areaCreada || mzResultado.zonasCreadas > 0) && (
                <> ({mzResultado.areaCreada ? "Área MAQUILA creada, " : ""}{mzResultado.zonasCreadas} cargo(s) creado(s))</>
              )}.
            </span>
          )}
          <Btn variant="secondary" onClick={cargarFiscalConocidos} disabled={!!cargandoConocidos}>
            {cargandoConocidos === "fiscal" ? "⏳ Cargando..." : "💰 Cargar Fiscal (24 conocidos)"}
          </Btn>
          {mfResultado !== null && (
            <span style={{ fontSize: 12, color: C.slate }}>
              {mfResultado.creados} creado(s), {mfResultado.actualizados} actualizado(s)
              {(mfResultado.areasCreadas > 0 || mfResultado.cargosCreados > 0) && (
                <> ({mfResultado.areasCreadas} área(s) creada(s), {mfResultado.cargosCreados} cargo(s) creado(s))</>
              )}.
            </span>
          )}
          <input ref={importCorreosRef} type="file" accept=".xlsx,.xls" onChange={importarCorreosTrabajadores} style={{ display: "none" }} />
          <Btn variant="secondary" onClick={() => importCorreosRef.current?.click()} disabled={importandoCorreos}>
            {importandoCorreos ? "Importando..." : "📤 Importar correos"}
          </Btn>
          <input ref={subirExcelRef} type="file" accept=".xlsx,.xls" onChange={handleSubirExcelTrabajadores} style={{ display: "none" }} />
          <Btn variant="secondary" onClick={() => subirExcelRef.current?.click()} disabled={subiendoExcel}>
            {subiendoExcel ? "Leyendo..." : "📤 Subir Excel modificado"}
          </Btn>
        </div>
      )}
      {resultadoCorreos && (
        <div style={{ marginBottom: 16, padding: 14, border: `1px solid ${C.border}`, borderRadius: 10, background: C.canvas, fontSize: 12 }}>
          {resultadoCorreos.error ? (
            <div style={{ color: C.red, fontWeight: 700 }}>Error importando: {resultadoCorreos.error}</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, color: C.green, marginBottom: resultadoCorreos.sinCoincidencia.length || resultadoCorreos.revisar.length ? 8 : 0 }}>
                ✅ {resultadoCorreos.actualizados} correo(s) actualizado(s).
              </div>
              {resultadoCorreos.revisar.length > 0 && (
                <div style={{ marginBottom: resultadoCorreos.sinCoincidencia.length ? 8 : 0 }}>
                  <div style={{ fontWeight: 700, color: C.amber, marginBottom: 4 }}>⚠️ {resultadoCorreos.revisar.length} con la cédula encontrada pero el nombre no concuerda (revisa a mano):</div>
                  {resultadoCorreos.revisar.map((r, i) => (
                    <div key={i} style={{ color: C.slate }}>Cédula {r.cedula}: archivo dice "{r.nombreArchivo}", el sistema tiene "{r.nombreSistema}"</div>
                  ))}
                </div>
              )}
              {resultadoCorreos.sinCoincidencia.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, color: C.red, marginBottom: 4 }}>❌ {resultadoCorreos.sinCoincidencia.length} cédula(s) del archivo sin ningún trabajador registrado:</div>
                  {resultadoCorreos.sinCoincidencia.map((r, i) => (
                    <div key={i} style={{ color: C.slate }}>Cédula {r.cedula} — {r.nombre}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {resultadoExcel && (
        <div style={{ marginBottom: 16, padding: 14, border: `1px solid ${C.border}`, borderRadius: 10, background: C.canvas, fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: C.green }}>✅ {resultadoExcel.actualizados} trabajador(es) actualizado(s) desde el Excel.</div>
        </div>
      )}
      {gruposDuplicados.length > 0 && (
        <div style={{ marginBottom: 20, padding: 14, border: `1.5px solid ${C.red}`, borderRadius: 10, background: C.redBg }}>
          <div style={{ fontWeight: 800, color: C.red, marginBottom: 10, fontSize: 13 }}>
            ⚠️ {gruposDuplicados.length} cédula(s) con más de un trabajador registrado — compara los datos y borra la copia que sobre.
          </div>
          {gruposDuplicados.map((grupo) => (
            <div key={grupo[0].cedula} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Cédula {grupo[0].cedula}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {grupo.map((t) => (
                  <div key={t.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12, minWidth: 220 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.nombre}</div>
                    <div style={{ color: C.slate }}>Área: {t.area || "Sin asignar"} · Cargo: {t.zona || "—"}</div>
                    <div style={{ color: C.slate }}>Tipo: {t.tipoNomina || "—"} · Empleador: {t.empleador || "—"}</div>
                    <div style={{ color: C.slate }}>Sueldo: {t.sueldo ? fmtMoney(t.sueldo) : "—"} · {t.activo ? "Activo" : "Inactivo"}</div>
                    <div style={{ marginTop: 6 }}>
                      <span onClick={() => setConfirmDel(t)} style={{ cursor: "pointer", color: C.red, fontWeight: 700 }}>Borrar esta copia</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Tabla
        vacio="Sin trabajadores registrados."
        columnas={[
          { key: "nombre", label: "Nombre" },
          { key: "cedula", label: "Cédula", render: (f) => f.cedula || "—" },
          { key: "correo", label: "Correo", render: (f) => f.correo || <span style={{ color: C.slate }}>—</span> },
          { key: "area", label: "Área Interna", render: (f) => f.area || "Sin asignar" },
          { key: "zona", label: "Cargo", render: (f) => f.zona || <span style={{ color: C.slate }}>—</span> },
          { key: "areaTNS", label: "Área TNS", render: (f) => f.areaTNS || <span style={{ color: C.slate }}>—</span> },
          { key: "empleador", label: "Empleador", render: (f) => f.empleador || <span style={{ color: C.slate }}>—</span> },
          { key: "tipoNomina", label: "Tipo Nómina", render: (f) => f.tipoNomina ? (
            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: f.tipoNomina === "Fiscal Destajo" ? C.violetBg : C.blueBg, color: f.tipoNomina === "Fiscal Destajo" ? C.violet : C.blue }}>
              {f.tipoNomina}
            </span>
          ) : <span style={{ color: C.slate }}>—</span> },
          { key: "claseRiesgoARL", label: "Clase ARL", render: (f) => f.claseRiesgoARL ? labelClaseARL(f.claseRiesgoARL) : <span style={{ color: C.slate }}>—</span> },
          { key: "sueldo", label: "Sueldo", align: "right", render: (f) => f.sueldo ? fmtMoney(f.sueldo) : "—" },
          { key: "tarifaHora", label: "Tarifa/Hora", align: "right", render: (f) => fmtMoney(f.tarifaHora) },
          { key: "tnsCodigo", label: "Código TNS", render: (f) => f.tnsCodigo ? <span style={{ color: C.green, fontWeight: 700 }}>{f.tnsCodigo}</span> : <span style={{ color: C.slate }}>—</span> },
          { key: "idHuellero", label: "ID Huellero", render: (f) => f.idHuellero ? <span style={{ color: C.blue, fontWeight: 700 }}>{f.idHuellero}</span> : <span style={{ color: C.slate }}>—</span> },
          { key: "turnoId", label: "Turno", render: (f) => {
            const t = (turnos || []).find((tu) => tu.id === f.turnoId);
            return t ? t.nombre : <span style={{ color: C.slate }}>Horario completo</span>;
          } },
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
        filas={ordenadosFiltrados}
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
function AusenciaModal({ ausencia, trabajadores, motivosDisponibles = MOTIVOS_AUSENCIA, onSave, onClose, trabajadorIdSugerido, fechaInicioSugerida, onDelete }) {
  const [form, setForm] = useState({
    trabajadorId: ausencia?.trabajadorId || trabajadorIdSugerido || "",
    nombreLibre: ausencia?.nombreLibre || "",
    motivo: ausencia?.motivo || "",
    fechaInicio: ausencia?.fechaInicio || fechaInicioSugerida || today(),
    fechaFin: ausencia?.fechaFin || fechaInicioSugerida || today(),
    // (2026-08-31) Fredy pidio poder ubicar un permiso por hora (ej. "8 a
    // 10 am") ademas del rango de fechas -- opcional, para permisos de solo
    // unas horas dentro de un dia, no todo el dia completo.
    horaInicio: ausencia?.horaInicio || "",
    horaFin: ausencia?.horaFin || "",
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
      horaInicio: form.horaInicio || "",
      horaFin: form.horaFin || "",
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
        <FSel value={form.motivo} onChange={set("motivo")} options={motivosDisponibles} placeholder="Selecciona..." />
      </Field>
      <Field label="Fecha Inicio"><FInput type="date" value={form.fechaInicio} onChange={set("fechaInicio")} /></Field>
      <Field label="Fecha Fin"><FInput type="date" value={form.fechaFin} onChange={set("fechaFin")} /></Field>
      <div style={{ fontSize: 11, color: C.slate, marginTop: -6, marginBottom: 10 }}>
        Déjalo vacío si el permiso es por el día completo. Si es solo por unas horas (ej. 8:00 a 10:00), complétalas acá.
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Hora Inicio (opcional)"><FInput type="time" value={form.horaInicio} onChange={set("horaInicio")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Hora Fin (opcional)"><FInput type="time" value={form.horaFin} onChange={set("horaFin")} /></Field></div>
      </div>
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
function AusenciasView({ ausencias, trabajadores, currentUser, motivosDisponibles, onSave, onDelete }) {
  const [modal, setModal] = useState(null); // null | "nuevo" | ausencia
  const [confirmDel, setConfirmDel] = useState(null);
  const ordenadas = [...ausencias].sort((a, b) => (b.fechaInicio || "").localeCompare(a.fechaInicio || ""));
  return (
    <div>
      {modal && (
        <AusenciaModal
          ausencia={modal === "nuevo" ? null : modal}
          trabajadores={trabajadores}
          motivosDisponibles={motivosDisponibles}
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
      {/* 2026-09-01, a pedido de Fredy: antes esto era isAdmin-only; ahora
         cualquiera que llegue a esta pantalla ya tiene permiso legitimo
         (admin, o Nomina Completa/Solo Novedades no-lider -- los lideres de
         area nunca llegan aca, ver el guard "!areaLider" en ModuloNomina). */}
      <div style={{ marginBottom: 16 }}>
        <Btn onClick={() => setModal("nuevo")}>+ Nueva Ausencia</Btn>
      </div>
      <Tabla
        vacio="Sin ausencias registradas."
        columnas={[
          { key: "nombre", label: "Nombre" },
          { key: "motivo", label: "Motivo" },
          { key: "fechaInicio", label: "Desde", render: (f) => fmtFechaISO(f.fechaInicio) },
          { key: "fechaFin", label: "Hasta", render: (f) => fmtFechaISO(f.fechaFin) },
          { key: "hora", label: "Hora", render: (f) => (f.horaInicio && f.horaFin) ? `${f.horaInicio}–${f.horaFin}` : "—" },
          { key: "observaciones", label: "Observaciones", render: (f) => f.observaciones || "—" },
          {
            key: "acciones", label: "", align: "right",
            render: (f) => (
              <span style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <span onClick={(e) => { e.stopPropagation(); setModal(f); }} style={{ cursor: "pointer", color: C.blue, fontWeight: 700 }}>Editar</span>
                <span onClick={(e) => { e.stopPropagation(); setConfirmDel(f); }} style={{ cursor: "pointer", color: C.red, fontWeight: 700 }}>Borrar</span>
              </span>
            ),
          },
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
// (2026-09-01, a pedido de Fredy) Semilla para "nomina_motivos_ausencia"
// -- ver MotivosAusenciaView mas abajo. La lista de motivos paso de fija
// en el codigo a editable por el admin; esto preserva los mismos 9
// motivos + iconos de siempre la primera vez que se despliega (ver el
// useEffect de auto-siembra en ModuloNomina, mas abajo).
const MOTIVOS_AUSENCIA_DEFAULT = MOTIVOS_AUSENCIA.map((nombre) => ({ nombre, icono: MOTIVO_ICONO[nombre] || "❔" }));
// (2026-08-31) Rango de hora de un permiso parcial (ej. "8:00 a 10:00"),
// cuando la usuaria lo especificó -- vacío si el permiso es por el día
// completo (la mayoría de los casos, ej. Vacaciones).
function fmtHoraRango(a) {
  return a && a.horaInicio && a.horaFin ? ` (${a.horaInicio}–${a.horaFin})` : "";
}
function PermisosCalendarioView({ trabajadores, produccion, horas, ausencias, currentUser, isAdmin, motivosDisponibles = MOTIVOS_AUSENCIA, motivoIcono = MOTIVO_ICONO, onSave, onDelete }) {
  const [ref, setRef] = useState(today().slice(0, 7)); // "YYYY-MM"
  // (2026-08-31) Fredy pidio que Permisos se viera "como calendario" -- antes
  // era una tabla trabajador x dia-1-31. Ahora es una grilla real de mes
  // (Lunes a Domingo, reutilizando mondayOf/addDays que ya usa el resto de
  // Nomina para semanas). Con "Todos" cada celda resume cuantos vinieron y
  // quienes tienen permiso ese dia; al elegir un trabajador puntual, la
  // celda muestra su estado individual como antes.
  const [trabajadorFiltro, setTrabajadorFiltro] = useState(""); // "" = todos
  const [modal, setModal] = useState(null); // null | { nuevo, trabajadorId, fechaInicio } | ausencia existente
  const [diaDetalle, setDiaDetalle] = useState(null); // fecha ISO -- panel del dia (solo modo "Todos")
  const [anioStr, mesStr] = ref.split("-");
  const anio = Number(anioStr);
  const mes = Number(mesStr); // 1-12
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
  function resumenDia(diaISO) {
    const conAusencia = [];
    let vinieron = 0;
    for (const t of trabajadores) {
      const a = ausenciaDelDia(t.id, diaISO);
      if (a) { conAusencia.push({ trabajador: t, ausencia: a }); continue; }
      if (vinoElDia(t.id, diaISO)) vinieron++;
    }
    return { conAusencia, vinieron };
  }
  const hoyISO = today();
  const trabajadorSel = trabajadorFiltro ? trabajadores.find((t) => t.id === trabajadorFiltro) : null;

  // Grilla del mes: del lunes de la semana que trae el día 1, al domingo de
  // la semana que trae el último día del mes -- siempre múltiplo de 7, así
  // que se reparte limpio en semanas completas.
  const inicioGrilla = mondayOf(new Date(anio, mes - 1, 1));
  const finGrilla = addDays(mondayOf(new Date(anio, mes, 0)), 6);
  const diasGrilla = [];
  for (let d = inicioGrilla; d <= finGrilla; d = addDays(d, 1)) diasGrilla.push(d);
  const semanas = [];
  for (let i = 0; i < diasGrilla.length; i += 7) semanas.push(diasGrilla.slice(i, i + 7));
  const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Calendario del mes: ✅ = tiene producción u horas registradas ese día (vino a trabajar). Un ícono de color = tiene un permiso/ausencia (pasa el mouse para ver el motivo). Click en un día para ver el detalle y registrar un permiso nuevo.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Btn variant="secondary" onClick={() => cambiarMes(-1)}>← Mes anterior</Btn>
        <div style={{ fontWeight: 700, color: C.ink, minWidth: 160, textAlign: "center", textTransform: "capitalize" }}>
          {new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
        </div>
        <Btn variant="secondary" onClick={() => cambiarMes(1)}>Mes siguiente →</Btn>
        <div style={{ marginLeft: "auto", minWidth: 220 }}>
          <FSel value={trabajadorFiltro} onChange={setTrabajadorFiltro} options={trabajadores.map((t) => ({ value: t.id, label: t.nombre }))} placeholder="Todos los trabajadores" />
        </div>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", background: C.white, boxShadow: "0 1px 2px rgba(22,26,24,.04), 0 6px 16px -10px rgba(22,26,24,.18)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", background: C.ink }}>
          {DOW.map((d) => (
            <div key={d} style={{ padding: "8px 6px", textAlign: "center", fontSize: 11, fontWeight: 700, color: C.seam, letterSpacing: "0.04em", textTransform: "uppercase" }}>{d}</div>
          ))}
        </div>
        {semanas.map((semana, si) => (
          <div key={si} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {semana.map((d) => {
              const diaISO = isoDate(d);
              const dentroDelMes = d.getMonth() === mes - 1;
              const esHoy = diaISO === hoyISO;
              if (!dentroDelMes) {
                return (
                  <div key={diaISO} style={{ minHeight: 74, padding: "6px 6px", borderTop: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, color: C.border, fontSize: 11 }}>
                    {d.getDate()}
                  </div>
                );
              }
              if (trabajadorSel) {
                const a = ausenciaDelDia(trabajadorSel.id, diaISO);
                const vino = !a && vinoElDia(trabajadorSel.id, diaISO);
                return (
                  <div
                    key={diaISO}
                    onClick={() => abrirCelda(trabajadorSel.id, diaISO)}
                    title={a ? `${a.motivo}${fmtHoraRango(a)}${a.observaciones ? " — " + a.observaciones : ""}` : (vino ? "Vino (con producción/horas registradas)" : "Sin registro — click para agregar permiso")}
                    style={{ minHeight: 74, padding: "6px 8px", borderTop: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, cursor: "pointer", background: esHoy ? C.blueBg : C.white, display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <span style={{ fontSize: 11, fontWeight: esHoy ? 800 : 600, color: esHoy ? C.blue : C.slate }}>{d.getDate()}</span>
                    {a && <span style={{ fontSize: 20, lineHeight: 1 }}>{motivoIcono[a.motivo] || "❔"}</span>}
                    {a && a.horaInicio && a.horaFin && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.amber }}>{a.horaInicio}–{a.horaFin}</span>
                    )}
                    {!a && vino && <span style={{ fontSize: 20, lineHeight: 1 }}>✅</span>}
                  </div>
                );
              }
              const { conAusencia, vinieron } = resumenDia(diaISO);
              const visibles = conAusencia.slice(0, 3);
              const resto = conAusencia.length - visibles.length;
              return (
                <div
                  key={diaISO}
                  onClick={() => setDiaDetalle(diaISO)}
                  style={{ minHeight: 74, padding: "6px 8px", borderTop: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, cursor: "pointer", background: esHoy ? C.blueBg : C.white, display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: esHoy ? 800 : 600, color: esHoy ? C.blue : C.slate }}>{d.getDate()}</span>
                    {vinieron > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenBg, borderRadius: 20, padding: "1px 6px" }}>✅ {vinieron}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {visibles.map(({ trabajador, ausencia }) => (
                      <span key={trabajador.id} title={`${trabajador.nombre} — ${ausencia.motivo}${fmtHoraRango(ausencia)}`} style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberBg, borderRadius: 20, padding: "1px 6px", whiteSpace: "nowrap", maxWidth: 78, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {motivoIcono[ausencia.motivo] || "❔"} {trabajador.nombre.split(" ")[0]}
                      </span>
                    ))}
                    {resto > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: C.slate }}>+{resto}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, fontSize: 11.5, color: C.slate }}>
        <span>✅ Vino (producción/horas registradas)</span>
        {Object.entries(motivoIcono).map(([motivo, icono]) => (
          <span key={motivo}>{icono} {motivo}</span>
        ))}
      </div>
      {trabajadores.length === 0 && (
        <div style={{ marginTop: 16, color: C.slate, fontSize: 13 }}>No hay trabajadores para mostrar.</div>
      )}
      {diaDetalle && !trabajadorSel && (
        <Modal title={`Permisos — ${fmtFechaISO(diaDetalle)}`} onClose={() => setDiaDetalle(null)} width={480}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {trabajadores.map((t) => {
              const a = ausenciaDelDia(t.id, diaDetalle);
              const vino = !a && vinoElDia(t.id, diaDetalle);
              return (
                <div
                  key={t.id}
                  onClick={() => { setDiaDetalle(null); abrirCelda(t.id, diaDetalle); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.border}`, cursor: "pointer" }}
                >
                  <span style={{ fontSize: 18 }}>{a ? (motivoIcono[a.motivo] || "❔") : (vino ? "✅" : "◻️")}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{t.nombre}</span>
                  <span style={{ fontSize: 11, color: C.slate }}>{a ? `${a.motivo}${fmtHoraRango(a)}` : (vino ? "Vino" : "Sin registro")}</span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
      {modal && (
        <AusenciaModal
          ausencia={modal.nuevo ? null : modal}
          trabajadores={trabajadores}
          motivosDisponibles={motivosDisponibles}
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
// (2026-09-09, a pedido de Fredy) El huellero a veces guarda a la misma
// persona con un nombre corto/informal (ej. "KAREN DELGADO") o hasta con
// el ID pegado al nombre (ej. "PAULA MARTINEZ 141"), mientras que en
// Trabajadores está el nombre legal completo (ej. "KAREN DAYANA DELGADO
// VILLAMIZAR"). Esto se usa SOLO como aviso de coincidencia cuando ya se
// vinculó por ID Huellero (ver coincideHuellero) -- no reemplaza el cruce
// por nombre exacto que se sigue usando cuando la persona todavía no tiene
// un ID Huellero asignado.
function nombresSeParecen(nombreHuellero, nombreTrabajador) {
  const palabras = normalizarNombreHuellero(nombreHuellero).split(" ").filter((p) => p && !/^\d+$/.test(p));
  if (!palabras.length) return false;
  const delTrabajador = new Set(normalizarNombreHuellero(nombreTrabajador).split(" ").filter(Boolean));
  return palabras.every((p) => delTrabajador.has(p));
}
// Cruce entre un registro ya guardado del huellero (una falta sin
// justificar o un día trabajado, con nombreNorm y opcionalmente
// idHuellero) y un Trabajador de Atlas. Si el trabajador ya tiene ID
// Huellero asignado, el cruce es SOLO por ese ID (no por nombre, así el
// nombre esté escrito distinto o cambie con el tiempo); si todavía no
// tiene ID asignado, cae al cruce por nombre exacto de siempre.
function coincideHuellero(registro, trabajador, nombreNormTrabajador) {
  if (trabajador.idHuellero) {
    return registro.idHuellero != null && String(registro.idHuellero).trim() !== "" && String(registro.idHuellero).trim() === String(trabajador.idHuellero).trim();
  }
  return registro.nombreNorm === nombreNormTrabajador;
}
// Festivos de Colombia -- fijos acá porque cambian cada año según la Ley
// Emiliani (varios festivos religiosos se corren al lunes siguiente). Hay
// que agregar los del año que sigue cuando se sepan (Fredy se encarga de
// pedirlo). Se usan para la regla de "días esperados": lunes a viernes
// siempre, sábado solo si esa semana tuvo un festivo entre semana, domingo
// nunca.
const FESTIVOS_COLOMBIA_2026 = [
  "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
  "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29",
  "2026-07-13", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12",
  "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
];
function esFestivoColombia(iso) {
  return FESTIVOS_COLOMBIA_2026.includes(iso);
}
function lunesDeLaSemana(iso) {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay(); // 0=domingo..6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function semanaTuvoFestivo(iso) {
  const lunes = new Date(lunesDeLaSemana(iso) + "T00:00:00");
  for (let i = 0; i < 6; i++) { // lunes a sábado
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    if (esFestivoColombia(d.toISOString().slice(0, 10))) return true;
  }
  return false;
}
// Regla confirmada con Fredy (09/09/2026): lunes a viernes siempre se
// espera que trabajen; domingo nunca; sábado SOLO si esa semana tuvo un
// festivo entre semana (para reponer). (2026-09-09) Si el trabajador tiene
// un Turno asignado (catálogo Turnos), se usan sus días y su regla de
// sábado en vez de la regla completa -- así a alguien como Jimmi (solo
// lunes/miércoles/viernes) no se le cuenta martes/jueves como falta.
function diaEsperado(iso, turno) {
  const dow = new Date(iso + "T00:00:00").getDay(); // 0=domingo..6=sábado
  if (dow === 0) return false;
  if (dow === 6) {
    const sabadoSiFestivo = turno ? !!turno.sabadoSiFestivo : true;
    return sabadoSiFestivo && semanaTuvoFestivo(iso);
  }
  const diaCodigo = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][dow];
  const dias = turno?.dias || DIAS_SEMANA_TURNO;
  return dias.includes(diaCodigo);
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
        const etiquetaHuellero = j < vals.length && (vals[j] === "Entrada" || vals[j] === "Salida") ? vals[j] : "?";
        // (2026-09-09, a pedido de Fredy) A los trabajadores se les olvida
        // marcar bien -- a veces le dan "Salida" en la mañana o "Entrada"
        // en la noche. La hora real no miente: antes de mediodía siempre
        // es Entrada, de 4pm en adelante siempre es Salida, sin importar
        // lo que haya marcado el huellero. Lo que caiga entre 12:00m y
        // 4:00pm se deja tal como lo reportó el huellero (ej. permisos o
        // salidas de almuerzo). Esto NO cambia cómo se cuentan los "días
        // trabajados" (que solo miran si hubo alguna marca ese día) -- es
        // para que el dato de tipo de marca quede limpio.
        const hora = Number(vals[i].slice(11, 13));
        const tipo = hora < 12 ? "Entrada" : hora >= 16 ? "Salida" : etiquetaHuellero;
        cur.marcas.push({ fechaHora: vals[i], tipo });
        i = etiquetaHuellero !== "?" ? j + 1 : i + 1;
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
function ReporteAsistenciaView({ ausencias, trabajadores, turnos, onGuardarTrabajador }) {
  const fileRef = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [reporte, setReporte] = useState(null); // { desde, hasta, diasPeriodo, filas }
  const [soloConFaltas, setSoloConFaltas] = useState(true);
  // Vinculación manual ID Huellero <-> Trabajador para quienes no cruzan
  // ni por ID ni por nombre exacto (ver trabajadorDe más abajo).
  const [seleccionVinculo, setSeleccionVinculo] = useState({}); // { [idHuellero]: trabajadorId }
  const [vinculando, setVinculando] = useState(null); // idHuellero en proceso
  // Cruza un registro del huellero (id + nombre) contra Trabajadores:
  // primero por ID Huellero ya asignado (con aviso si el nombre ya no se
  // parece -- posible ID reasignado a otra persona), y si no tiene ID
  // asignado, por nombre exacto (como antes). Si el nombre exacto coincide
  // con más de un trabajador, no asigna nadie (evita cargarle la
  // asistencia de una persona a otra por homónimos).
  function trabajadorDe(fila) {
    const porId = trabajadores.find((t) => t.idHuellero && String(t.idHuellero).trim() === String(fila.id).trim());
    if (porId) return { trabajador: porId, viaId: true, nombreCoincide: nombresSeParecen(fila.nombre, porId.nombre) };
    const nombreNorm = normalizarNombreHuellero(fila.nombre);
    const candidatos = trabajadores.filter((t) => normalizarNombreHuellero(t.nombre) === nombreNorm);
    if (candidatos.length === 1) return { trabajador: candidatos[0], viaId: false, nombreCoincide: true };
    return null;
  }
  async function vincular(fila) {
    const trabajadorId = seleccionVinculo[fila.id];
    if (!trabajadorId) return;
    const trabajador = trabajadores.find((t) => t.id === trabajadorId);
    if (!trabajador || !onGuardarTrabajador) return;
    setVinculando(fila.id);
    try {
      await onGuardarTrabajador({ ...trabajador, idHuellero: fila.id });
      setSeleccionVinculo((s) => { const n = { ...s }; delete n[fila.id]; return n; });
    } finally {
      setVinculando(null);
    }
  }

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
        // Si ya se sabe a qué trabajador corresponde este registro del
        // huellero (por ID o por nombre exacto), cruza las ausencias por
        // trabajadorId cuando la ausencia se registró eligiéndolo de la
        // lista -- más confiable que comparar nombres cuando el huellero
        // usa un nombre corto. Si no, cae al cruce por nombre de siempre.
        const trabajadorDelRegistro = trabajadorDe({ id: emp.id, nombre: emp.nombre });
        const ausenciasPersona = ausencias.filter((a) => {
          if (trabajadorDelRegistro && a.trabajadorId) return a.trabajadorId === trabajadorDelRegistro.trabajador.id;
          return normalizarNombreHuellero(a.nombre) === nombreNorm;
        });
        const turnoDelRegistro = trabajadorDelRegistro ? (turnos || []).find((t) => t.id === trabajadorDelRegistro.trabajador.turnoId) : null;
        const diasSinMarca = diasPeriodo.filter((iso) => {
          if (diasConMarca.has(iso)) return false;
          if (!diaEsperado(iso, turnoDelRegistro)) return false;
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
          // (2026-08-31) Lista real de fechas ISO con marca dentro del
          // periodo -- para poder guardarlas como "dias trabajados" (pedido
          // de Fredy: que Nomina Destajo y Fiscal Destajo muestren dias
          // trabajados verificados por el huellero, no por produccion).
          diasConMarcaLista: diasPeriodo.filter((iso) => diasConMarca.has(iso)),
          diasSinMarca: detalle.length,
          sinJustificar: sinJustificar.length,
          detalle,
        };
      });

      setReporte({ desde, hasta, diasPeriodo, filas });
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
        const sinJustificarSet = new Set(f.detalle.filter((d) => !d.motivo).map((d) => d.fecha));
        // (2026-09-10, a pedido de Fredy, caso Kevin Contreras) El rango de
        // fechas de ESTE archivo es la verdad completa para esos dias: se
        // recorren TODAS las fechas del periodo (no solo las que hoy salen
        // sin justificar) y se borra cualquier falta que hubiera quedado
        // guardada de una carga anterior en una fecha que hoy ya no aplica
        // -- si no, una falta vieja/erronea se queda para siempre aunque se
        // suba despues un archivo que la desmienta.
        for (const fecha of reporte.diasPeriodo) {
          const id = `${nombreNorm}__${fecha}`;
          const ref = doc(db, "nomina_faltas_sin_justificar", id);
          if (sinJustificarSet.has(fecha)) {
            batch.set(ref, {
              nombre: f.nombre,
              nombreNorm,
              idHuellero: f.id,
              fecha,
              origen: "huellero",
              cargadoEn: new Date().toISOString(),
            });
            n++;
          } else {
            batch.delete(ref);
          }
        }
      }
      await batch.commit();
      setFaltasGuardadas(n);
    } finally {
      setGuardandoFaltas(false);
    }
  }

  // (2026-08-31) Guarda en Firestore los dias CON marca (dias trabajados,
  // verificados por el huellero) -- mismo patron que guardarFaltasEnAtlas()
  // pero en su propia coleccion, para que Nomina Destajo y Nomina Fiscal
  // Destajo puedan mostrar "Dias trabajados" sin depender de produccion
  // registrada (que es otra cosa: cuanto se pago, no si vino).
  const [guardandoDiasTrabajados, setGuardandoDiasTrabajados] = useState(false);
  const [diasTrabajadosGuardados, setDiasTrabajadosGuardados] = useState(null);
  async function guardarDiasTrabajadosEnAtlas() {
    if (!reporte) return;
    setGuardandoDiasTrabajados(true);
    try {
      const batch = writeBatch(db);
      let n = 0;
      for (const f of reporte.filas) {
        const nombreNorm = normalizarNombreHuellero(f.nombre);
        const diasConMarcaSet = new Set(f.diasConMarcaLista);
        // (2026-09-10) Mismo criterio que guardarFaltasEnAtlas: el rango de
        // este archivo reemplaza por completo lo que hubiera guardado de
        // antes para esta persona en esas fechas.
        for (const fecha of reporte.diasPeriodo) {
          const id = `${nombreNorm}__${fecha}`;
          const ref = doc(db, "nomina_dias_trabajados", id);
          if (diasConMarcaSet.has(fecha)) {
            batch.set(ref, {
              nombre: f.nombre,
              nombreNorm,
              idHuellero: f.id,
              fecha,
              origen: "huellero",
              cargadoEn: new Date().toISOString(),
            });
            n++;
          } else {
            batch.delete(ref);
          }
        }
      }
      await batch.commit();
      setDiasTrabajadosGuardados(n);
    } finally {
      setGuardandoDiasTrabajados(false);
    }
  }

  const filasMostradas = reporte ? reporte.filas.filter((f) => !soloConFaltas || f.sinJustificar > 0).sort((a, b) => b.sinJustificar - a.sinJustificar) : [];
  const totalSinJustificar = reporte ? reporte.filas.reduce((s, f) => s + f.sinJustificar, 0) : 0;
  const personasConFaltas = reporte ? reporte.filas.filter((f) => f.sinJustificar > 0).length : 0;
  const sinVincular = reporte ? reporte.filas.filter((f) => !trabajadorDe(f)) : [];
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

          <div style={{ marginBottom: 10 }}>
            <Btn onClick={guardarFaltasEnAtlas} disabled={guardandoFaltas}>
              {guardandoFaltas ? "Guardando..." : "💾 Guardar días sin justificar en Atlas"}
            </Btn>
            {faltasGuardadas !== null && (
              <span style={{ marginLeft: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>
                ✅ {faltasGuardadas} día(s) guardado(s) — ya quedan disponibles para descontar en Nómina Fiscal Destajo.
              </span>
            )}
          </div>
          <div style={{ marginBottom: 16 }}>
            <Btn onClick={guardarDiasTrabajadosEnAtlas} disabled={guardandoDiasTrabajados}>
              {guardandoDiasTrabajados ? "Guardando..." : "💾 Guardar días trabajados en Atlas"}
            </Btn>
            {diasTrabajadosGuardados !== null && (
              <span style={{ marginLeft: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>
                ✅ {diasTrabajadosGuardados} día(s) guardado(s) — ya quedan disponibles como "Días trabajados" en Nómina Destajo y Fiscal Destajo.
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
              <input type="checkbox" checked={soloConFaltas} onChange={(e) => setSoloConFaltas(e.target.checked)} /> Mostrar solo quienes tienen faltas sin justificar
            </label>
          </div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: -8, marginBottom: 16 }}>
            Domingo nunca cuenta como falta. Sábado solo cuenta si esa semana tuvo un festivo entre semana (para reponer) -- si no, tampoco cuenta.
          </div>

          {sinVincular.length > 0 && (
            <div style={{ padding: 14, border: `1.5px solid ${C.amber}`, borderRadius: 10, background: C.amberBg, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: C.amber, marginBottom: 10, fontSize: 13 }}>
                ⚠ {sinVincular.length} persona(s) del huellero no se pudieron vincular a un trabajador -- vincúlalas una vez y quedan resueltas para siempre en las próximas subidas.
              </div>
              {sinVincular.map((f) => (
                <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, minWidth: 220 }}>ID {f.id} — {f.nombre}</span>
                  <div style={{ width: 260 }}>
                    <FSel
                      value={seleccionVinculo[f.id] || ""}
                      onChange={(v) => setSeleccionVinculo((s) => ({ ...s, [f.id]: v }))}
                      options={trabajadores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((t) => ({ value: t.id, label: `${t.nombre}${t.cedula ? ` (${t.cedula})` : ""}` }))}
                      placeholder="Elegir trabajador..."
                    />
                  </div>
                  <Btn variant="secondary" onClick={() => vincular(f)} disabled={!seleccionVinculo[f.id] || vinculando === f.id}>
                    {vinculando === f.id ? "Vinculando..." : "Vincular"}
                  </Btn>
                </div>
              ))}
            </div>
          )}

          <Tabla
            vacio="Nadie con faltas sin justificar en este período 🎉"
            columnas={[
              { key: "nombre", label: "Nombre" },
              { key: "vinculo", label: "Vinculado a", render: (f) => {
                const v = trabajadorDe(f);
                if (!v) return <span style={{ color: C.red, fontWeight: 700 }}>Sin vincular</span>;
                if (v.viaId && !v.nombreCoincide) {
                  return <span style={{ color: C.amber, fontWeight: 700 }} title={`El huellero reporta "${f.nombre}" pero el ID ${f.id} está vinculado a ${v.trabajador.nombre} -- revisa si el ID fue reasignado a otra persona.`}>⚠ {v.trabajador.nombre}</span>;
                }
                return <span style={{ color: C.green }}>{v.trabajador.nombre}</span>;
              } },
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
// ─── NÓMINA FISCAL (sueldo fijo CON seguridad social real -- EPS/pensión/
// ARL/caja de compensación) ─────────────────────────────────────────────
// Reglas confirmadas con Fredy (09/09/2026) contra su cuadro de referencia
// (CONSERGE, sueldo=SMMLV=$1.750.905, auxilio=$249.095, verificado número
// por número):
//  - EPS trabajador 4% y Pensión trabajador 4% se DESCUENTAN del neto a
//    pagar -- a diferencia de Fiscal Destajo/Destajo, que no tienen esto.
//  - Pensión empleador 12%, Caja de Compensación (COMFANORTE) empleador
//    4% y ARL empleador (según la Clase de Riesgo de cada trabajador, ver
//    CLASES_RIESGO_ARL más arriba) son COSTO de la empresa, no se
//    descuentan a nadie.
//  - EPS empleador queda en $0 -- exonerada por la Ley 1607 de 2012 para
//    personas jurídicas (el ejemplo de Fredy trae "N/A" en esa columna).
//  - Todas las bases de seguridad social son sobre el sueldo YA de la
//    quincena (descontado por inasistencia), nunca sobre el auxilio.
//  - El auxilio de transporte NO aplica si el sueldo mensual supera 2
//    SMMLV (confirmado: "el auxilio mayo a dos 2 salarios no se les
//    paga") -- se valida acá mismo, sin importar lo que tenga guardado
//    el trabajador.
//  - Las provisiones de prestaciones (cesantías/intereses/prima/
//    vacaciones) usan la misma fórmula ya corregida de Nómina Destajo:
//    cesantías y prima sobre (sueldo+auxilio) de la quincena, intereses =
//    cesantías del MISMO período x 12% (no saldo acumulado), vacaciones
//    solo sobre el sueldo -- coincide exacto con el cuadro de Fredy.
//  - Todo lo que manda Fredy en su cuadro es MENSUAL y se divide entre 2
//    para la quincena (confirmado: "todo lo que mande es mensual y se
//    divide en 2") -- igual que Fiscal Destajo.
//  - El descuento por inasistencia (sueldo/30 x días) también aplica acá
//    (confirmado: "los descuento se aplican tambien").
const TASA_EPS_TRABAJADOR = 0.04;
const TASA_PENSION_TRABAJADOR = 0.04;
const TASA_PENSION_EMPLEADOR = 0.12;
const TASA_CAJA_COMPENSACION_EMPLEADOR = 0.04;
// SMMLV y auxilio de transporte vigentes en Colombia -- actualizar estos
// dos números cada enero cuando cambien por decreto.
const SMMLV_2026 = 1750905;
const AUXILIO_TRANSPORTE_2026 = 249095;
const TOPE_SUELDO_PARA_AUXILIO = SMMLV_2026 * 2;
// (2026-09-10, "Design B" confirmado por Fredy) Cada Cobro que Bodega
// registra contra un trabajador (Despachos Generales / Estado de Despacho)
// queda "pendiente de cobrar" hasta que a ESE trabajador se le calcule y
// confirme su SIGUIENTE liquidacion -- ahi se suman TODOS sus cobros
// pendientes (sin importar cuanto tiempo llevaban esperando) y se restan
// del neto a pagar; luego se marcan como cobrados con el periodo que los
// pago (ver marcarCobrosComoCobrados en ModuloNomina) para que nunca se
// cobren dos veces ni se queden sin cobrar.
function cobrosPendientesDeTrabajador(lotesConCobros, trabajadorId) {
  const pendientes = [];
  (lotesConCobros || []).forEach((l) => {
    (l.cobrosBodega || []).forEach((c) => {
      if (c.trabajadorId === trabajadorId && c.cobrado !== true) {
        pendientes.push({ loteId: l.id, numLote: l.numLote, tipo: c.tipo, valor: Number(c.valor) || 0, fecha: c.fecha || "" });
      }
    });
  });
  return pendientes;
}
function sumaCobrosPendientes(cobrosDetalle) {
  return (cobrosDetalle || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
}
// (2026-09-11/12, a pedido de Fredy) Motivos de ausencia que suspenden el
// pago del auxilio de transporte (ademas de las faltas sin justificar, que
// ya no lo pagan). De estos, Licencia No Remunerada es la unica que
// TAMBIEN suspende el sueldo -- es la unica de las cuatro que es,
// literalmente, sin remuneracion (las otras tres son licencias pagadas
// por ley: vacaciones, maternidad/paternidad y luto).
const MOTIVOS_SIN_AUXILIO_TRANSPORTE = ["Vacaciones", "Licencia No Remunerada", "Licencia Maternidad/Paternidad", "Luto"];
const MOTIVOS_SIN_SUELDO = ["Licencia No Remunerada"];
// (2026-09-12) Cuenta, dentro de [inicio, fin], los dias HABILES reales del
// trabajador (mismo criterio de diaEsperado que usa el Reporte de
// Asistencia -- respeta su turno si tiene uno especial) que caen dentro de
// alguna ausencia con motivo en `motivos`. Antes se contaban todos los
// dias de CALENDARIO entre fechaInicio y fechaFin, lo que inflaba el
// conteo cuando la ausencia cruzaba un fin de semana (ej. viernes a lunes
// contaba 4 dias en vez de 2 -- caso Jairo Capacho, 2026-09-11).
function diasHabilesDeAusencias(ausencias, motivos, trabajador, turno, inicio, fin) {
  const dias = new Set();
  (ausencias || []).forEach((a) => {
    if (a.trabajadorId !== trabajador.id) return;
    if (!motivos.includes(a.motivo)) return;
    listaDeDiasISO(a.fechaInicio, a.fechaFin).forEach((fecha) => {
      if (fecha < inicio || fecha > fin) return;
      if (!diaEsperado(fecha, turno)) return;
      dias.add(fecha);
    });
  });
  return dias.size;
}
function calcularLiquidacionFiscal(trabajador, diasInasistencia, diasSinAuxilio = 0, diasSinSueldo = 0) {
  const sueldo = Number(trabajador.sueldo) || 0;
  const auxilioMensual = sueldo > TOPE_SUELDO_PARA_AUXILIO ? 0 : (Number(trabajador.auxilioTransporte) || 0);
  // (2026-09-12) diasSinSueldo son los dias de Licencia No Remunerada --
  // la unica ausencia que tambien deja de pagar sueldo (las demas del
  // listado de arriba solo afectan el auxilio de transporte).
  const descuentoSueldo = (sueldo / 30) * (diasInasistencia + diasSinSueldo);
  const descuentoAuxilio = (auxilioMensual / 30) * (diasInasistencia + diasSinAuxilio);
  const sueldoQuincena = Math.max(0, sueldo / 2 - descuentoSueldo);
  const auxilioQuincena = Math.max(0, auxilioMensual / 2 - descuentoAuxilio);
  const epsTrabajador = sueldoQuincena * TASA_EPS_TRABAJADOR;
  const pensionTrabajador = sueldoQuincena * TASA_PENSION_TRABAJADOR;
  const pensionEmpleador = sueldoQuincena * TASA_PENSION_EMPLEADOR;
  const tasaARL = TASA_ARL_POR_CLASE[trabajador.claseRiesgoARL] || 0;
  const arlEmpleador = sueldoQuincena * tasaARL;
  const cajaCompensacionEmpleador = sueldoQuincena * TASA_CAJA_COMPENSACION_EMPLEADOR;
  const epsEmpleador = 0;
  const saldoCesantiasInicio = Number(trabajador.cesantiasAcumuladas) || 0;
  const baseConAuxilio = sueldoQuincena + auxilioQuincena;
  const cesantiasPeriodo = baseConAuxilio * TASA_CESANTIAS_MENSUAL;
  const interesesPeriodo = cesantiasPeriodo * TASA_INTERES_CESANTIAS_ANUAL;
  const primaPeriodo = baseConAuxilio * TASA_PRIMA_MENSUAL;
  const vacacionesPeriodo = sueldoQuincena * TASA_VACACIONES_MENSUAL;
  return {
    diasInasistencia, diasSinAuxilio, diasSinSueldo, descuentoSueldo, descuentoAuxilio, sueldoQuincena, auxilioQuincena,
    epsTrabajador, pensionTrabajador, pensionEmpleador, arlEmpleador, cajaCompensacionEmpleador, epsEmpleador,
    netoAPagar: sueldoQuincena + auxilioQuincena - epsTrabajador - pensionTrabajador,
    cesantiasPeriodo, interesesPeriodo, primaPeriodo, vacacionesPeriodo,
    saldoCesantiasInicio, saldoCesantiasFin: saldoCesantiasInicio + cesantiasPeriodo,
  };
}
// (2026-09-10, a pedido de Fredy) Se abre al hacer clic en "Días sin
// justificar" de un trabajador -- lista cada fecha marcada como falta en
// la quincena. Si ya existe una ausencia registrada que la cubre (se
// revisa en vivo, por si se registró después de guardar el huellero), se
// muestra el motivo y se puede quitar de la lista de faltas. Si no tiene
// ninguna, deja agregarle una con el mismo listado predeterminado de
// Motivos de siempre -- en cuanto se guarda, esa fecha deja de contar
// como falta sin justificar sin tener que volver a subir el huellero.
function DetalleDiasSinJustificarModal({ trabajador, fechas, ausencias, trabajadores, motivosDisponibles, onJustificar, onLimpiar, onClose }) {
  const [fechaEnEdicion, setFechaEnEdicion] = useState(null);
  function ausenciaDe(fecha) {
    return (ausencias || []).find((a) => a.trabajadorId === trabajador.id && a.fechaInicio <= fecha && fecha <= a.fechaFin);
  }
  return (
    <Modal title={`Días sin justificar — ${trabajador.nombre}`} onClose={onClose} width={460}>
      {fechaEnEdicion && (
        <AusenciaModal
          trabajadores={trabajadores}
          motivosDisponibles={motivosDisponibles}
          trabajadorIdSugerido={trabajador.id}
          fechaInicioSugerida={fechaEnEdicion}
          onSave={(data) => { onJustificar(data, fechaEnEdicion); setFechaEnEdicion(null); }}
          onClose={() => setFechaEnEdicion(null)}
        />
      )}
      {!fechas.length ? (
        <div style={{ fontSize: 13, color: C.slate }}>No hay días sin justificar en esta quincena. 🎉</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fechas.map((fecha) => {
            const ausencia = ausenciaDe(fecha);
            return (
              <div key={fecha} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <span style={{ fontWeight: 700, color: C.ink }}>{fmtFechaISO(fecha)}</span>
                {ausencia ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✅ {ausencia.motivo}{ausencia.observaciones ? ` — ${ausencia.observaciones}` : ""}</span>
                    <span onClick={() => onLimpiar(fecha)} style={{ cursor: "pointer", color: C.slate, fontSize: 11 }} title="Ya está justificada -- quitarla de la lista de faltas">🧹 Quitar</span>
                  </div>
                ) : (
                  <Btn variant="ghost" small onClick={() => setFechaEnEdicion(fecha)}>+ Agregar justificación</Btn>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
function NominaFiscalView({ trabajadores, faltas, ausencias, motivosDisponibles, onJustificarFalta, onLimpiarFaltaJustificada, diasTrabajados, liquidaciones, onGuardarTrabajador, onGuardarLiquidacion, lotesConCobros, onMarcarCobrosCobrados, turnos }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");
  const [resultados, setResultados] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [detalleFaltas, setDetalleFaltas] = useState(null); // { trabajador, fechas }

  const personas = trabajadores.filter((t) => t.tipoNomina === "Fiscal" && t.activo !== false);
  const periodoId = `${anio}-${mes}-Q${quincena}`;
  const yaLiquidado = liquidaciones.some((l) => l.periodoId === periodoId);
  const { inicio, fin } = rangoQuincena(anio, mes, quincena);
  const sinClaseARL = personas.filter((t) => !t.claseRiesgoARL);

  function calcular() {
    const filas = personas.map((t) => {
      const nombreNorm = normalizarNombreHuellero(t.nombre);
      const faltasDetalle = faltas.filter((f) => coincideHuellero(f, t, nombreNorm) && f.fecha >= inicio && f.fecha <= fin);
      const dias = faltasDetalle.length;
      const diasTrabajadosCount = diasTrabajados.filter((d) => coincideHuellero(d, t, nombreNorm) && d.fecha >= inicio && d.fecha <= fin).length;
      const turno = (turnos || []).find((tu) => tu.id === t.turnoId);
      const diasSinAuxilio = diasHabilesDeAusencias(ausencias, MOTIVOS_SIN_AUXILIO_TRANSPORTE, t, turno, inicio, fin);
      const diasSinSueldo = diasHabilesDeAusencias(ausencias, MOTIVOS_SIN_SUELDO, t, turno, inicio, fin);
      const base = calcularLiquidacionFiscal(t, dias, diasSinAuxilio, diasSinSueldo);
      const cobrosDetalle = cobrosPendientesDeTrabajador(lotesConCobros, t.id);
      const descuentoCobros = sumaCobrosPendientes(cobrosDetalle);
      return { trabajador: t, calculo: { ...base, fechasFalta: faltasDetalle.map((f) => f.fecha), diasTrabajados: diasTrabajadosCount, descuentoCobros, cobrosDetalle, netoAPagar: base.netoAPagar - descuentoCobros } };
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
        if (calculo.descuentoCobros > 0) await onMarcarCobrosCobrados(trabajador.id, periodoId);
      }
      setGuardadoOk(true);
    } finally {
      setGuardando(false);
    }
  }

  const totales = resultados ? resultados.reduce((s, r) => ({
    neto: s.neto + r.calculo.netoAPagar,
    descuentoCobros: s.descuentoCobros + (r.calculo.descuentoCobros || 0),
    epsTrabajador: s.epsTrabajador + r.calculo.epsTrabajador,
    pensionTrabajador: s.pensionTrabajador + r.calculo.pensionTrabajador,
    pensionEmpleador: s.pensionEmpleador + r.calculo.pensionEmpleador,
    arlEmpleador: s.arlEmpleador + r.calculo.arlEmpleador,
    cajaCompensacionEmpleador: s.cajaCompensacionEmpleador + r.calculo.cajaCompensacionEmpleador,
    cesantias: s.cesantias + r.calculo.cesantiasPeriodo,
    intereses: s.intereses + r.calculo.interesesPeriodo,
    prima: s.prima + r.calculo.primaPeriodo,
    vacaciones: s.vacaciones + r.calculo.vacacionesPeriodo,
  }), { neto: 0, descuentoCobros: 0, epsTrabajador: 0, pensionTrabajador: 0, pensionEmpleador: 0, arlEmpleador: 0, cajaCompensacionEmpleador: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 }) : null;

  return (
    <div>
      {detalleFaltas && (
        <DetalleDiasSinJustificarModal
          trabajador={detalleFaltas.trabajador}
          fechas={detalleFaltas.fechas}
          ausencias={ausencias}
          trabajadores={trabajadores}
          motivosDisponibles={motivosDisponibles}
          onJustificar={(data, fecha) => onJustificarFalta(data, normalizarNombreHuellero(detalleFaltas.trabajador.nombre), fecha)}
          onLimpiar={(fecha) => onLimpiarFaltaJustificada(normalizarNombreHuellero(detalleFaltas.trabajador.nombre), fecha)}
          onClose={() => setDetalleFaltas(null)}
        />
      )}
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Liquidación quincenal de los trabajadores "Fiscal" (sueldo fijo, CON seguridad social real: EPS y pensión descontados al trabajador, más pensión/ARL/caja de compensación a cargo de la empresa) — se hospeda acá en Atlas, no se envía a TNS. Los días de inasistencia sin justificar salen solos de lo que guardaste en Reporte de Asistencia.
      </div>
      {personas.length === 0 && (
        <div style={{ padding: "12px 16px", background: C.redBg, borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          Nadie tiene tipo de nómina "Fiscal" todavía. Ve a Trabajadores → "💰 Cargar Fiscal (24 conocidos)".
        </div>
      )}
      {sinClaseARL.length > 0 && (
        <div style={{ padding: "12px 16px", background: C.amberBg, borderRadius: 8, color: C.amber, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          ⚠ {sinClaseARL.length} trabajador(es) Fiscal no tienen Clase de Riesgo ARL asignada todavía ({sinClaseARL.map((t) => t.nombre).join(", ")}) — su ARL va a salir en $0 hasta que se la asignes en Trabajadores.
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
            <KPI icon="📉" label="EPS + Pensión trabajador (descontado)" value={fmtMoney(totales.epsTrabajador + totales.pensionTrabajador)} color={C.red} bg={C.redBg} />
            <KPI icon="🔻" label="Descuento cobros de Bodega" value={fmtMoney(totales.descuentoCobros)} color={C.red} bg={C.redBg} />
            <KPI icon="🏛️" label="Pensión + ARL + Caja (costo empresa)" value={fmtMoney(totales.pensionEmpleador + totales.arlEmpleador + totales.cajaCompensacionEmpleador)} color={C.violet} bg={C.violetBg} />
            <KPI icon="📦" label="Cesantías (provisión)" value={fmtMoney(totales.cesantias)} color={C.violet} bg={C.violetBg} />
            <KPI icon="🎁" label="Prima (provisión)" value={fmtMoney(totales.prima)} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏖️" label="Vacaciones (provisión)" value={fmtMoney(totales.vacaciones)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="Sin resultados."
            columnas={[
              { key: "nombre", label: "Nombre", render: (f) => f.trabajador.nombre },
              { key: "claseRiesgoARL", label: "Clase ARL", render: (f) => f.trabajador.claseRiesgoARL ? labelClaseARL(f.trabajador.claseRiesgoARL) : <span style={{ color: C.slate }}>Sin asignar</span> },
              { key: "dias", label: "Días sin justificar", align: "right", render: (f) => (
                <span onClick={() => setDetalleFaltas({ trabajador: f.trabajador, fechas: f.calculo.fechasFalta || [] })} style={{ fontWeight: 800, color: f.calculo.diasInasistencia > 0 ? C.red : C.green, cursor: "pointer", textDecoration: "underline" }} title="Ver el detalle de las fechas">{f.calculo.diasInasistencia}</span>
              ) },
              { key: "diasTrabajados", label: "Días trabajados (huellero)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: C.green }}>{f.calculo.diasTrabajados}</span>
              ) },
              { key: "diasSinAuxilio", label: "Días sin aux. transporte", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: f.calculo.diasSinAuxilio > 0 ? C.amber : C.slate }}>{f.calculo.diasSinAuxilio || 0}</span>
              ) },
              { key: "diasSinSueldo", label: "Días sin sueldo (lic. no remun.)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: f.calculo.diasSinSueldo > 0 ? C.red : C.slate }}>{f.calculo.diasSinSueldo || 0}</span>
              ) },
              { key: "sueldoQuincena", label: "Sueldo quincena", align: "right", render: (f) => fmtMoney(f.calculo.sueldoQuincena) },
              { key: "auxilioQuincena", label: "Auxilio quincena", align: "right", render: (f) => fmtMoney(f.calculo.auxilioQuincena) },
              { key: "epsTrabajador", label: "EPS trab. (-4%)", align: "right", render: (f) => <span style={{ color: C.red }}>-{fmtMoney(f.calculo.epsTrabajador)}</span> },
              { key: "pensionTrabajador", label: "Pensión trab. (-4%)", align: "right", render: (f) => <span style={{ color: C.red }}>-{fmtMoney(f.calculo.pensionTrabajador)}</span> },
              { key: "descuentoCobros", label: "Descuento cobros Bodega", align: "right", render: (f) => f.calculo.descuentoCobros > 0 ? (
                <span style={{ color: C.red, fontWeight: 700 }} title={(f.calculo.cobrosDetalle || []).map((c) => `Lote ${c.numLote}: ${c.tipo || "cobro"} ${fmtMoney(c.valor)}`).join(" | ")}>-{fmtMoney(f.calculo.descuentoCobros)}</span>
              ) : <span style={{ color: C.slate }}>—</span> },
              { key: "netoAPagar", label: "Neto a pagar", align: "right", render: (f) => <strong>{fmtMoney(f.calculo.netoAPagar)}</strong> },
              { key: "pensionEmpleador", label: "Pensión empresa (12%)", align: "right", render: (f) => fmtMoney(f.calculo.pensionEmpleador) },
              { key: "arlEmpleador", label: "ARL empresa", align: "right", render: (f) => fmtMoney(f.calculo.arlEmpleador) },
              { key: "cajaCompensacionEmpleador", label: "Caja Comp. (4%)", align: "right", render: (f) => fmtMoney(f.calculo.cajaCompensacionEmpleador) },
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
// ─── HISTORIAL FISCAL (quincenas ya confirmadas) ──────────────────────────
function HistorialFiscalView({ liquidaciones, trabajadores }) {
  const periodos = [...new Set(liquidaciones.map((l) => l.periodoId))].sort().reverse();
  const [periodoFiltro, setPeriodoFiltro] = useState("");
  const filas = [...liquidaciones]
    .filter((l) => !periodoFiltro || l.periodoId === periodoFiltro)
    .sort((a, b) => (b.periodoId || "").localeCompare(a.periodoId || "") || (a.nombre || "").localeCompare(b.nombre || ""));
  const totales = filas.reduce((s, l) => ({
    neto: s.neto + (l.netoAPagar || 0),
    descuentoCobros: s.descuentoCobros + (l.descuentoCobros || 0),
    epsTrabajador: s.epsTrabajador + (l.epsTrabajador || 0),
    pensionTrabajador: s.pensionTrabajador + (l.pensionTrabajador || 0),
    pensionEmpleador: s.pensionEmpleador + (l.pensionEmpleador || 0),
    arlEmpleador: s.arlEmpleador + (l.arlEmpleador || 0),
    cajaCompensacionEmpleador: s.cajaCompensacionEmpleador + (l.cajaCompensacionEmpleador || 0),
    cesantias: s.cesantias + (l.cesantiasPeriodo || 0),
    intereses: s.intereses + (l.interesesPeriodo || 0),
    prima: s.prima + (l.primaPeriodo || 0),
    vacaciones: s.vacaciones + (l.vacacionesPeriodo || 0),
  }), { neto: 0, descuentoCobros: 0, epsTrabajador: 0, pensionTrabajador: 0, pensionEmpleador: 0, arlEmpleador: 0, cajaCompensacionEmpleador: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 });
  function descargarRecibo(l) {
    const trabajador = (trabajadores || []).find((t) => t.id === l.trabajadorId);
    exportReciboLiquidacionHTML({ tipoNomina: "Fiscal", trabajador, liquidacion: l });
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Todas las quincenas de Nómina Fiscal ya confirmadas y guardadas — para consultar o comparar períodos pasados.
      </div>
      {liquidaciones.length === 0 ? (
        <div style={{ padding: "12px 16px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, color: C.slate, fontSize: 13, maxWidth: 480 }}>
          Todavía no hay ninguna quincena confirmada. Ve a "Nómina Fiscal", calcula una y dale "Confirmar y guardar".
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
            <KPI icon="📉" label="EPS + Pensión trabajador (descontado)" value={fmtMoney(totales.epsTrabajador + totales.pensionTrabajador)} color={C.red} bg={C.redBg} />
            <KPI icon="🔻" label="Descuento cobros de Bodega" value={fmtMoney(totales.descuentoCobros)} color={C.red} bg={C.redBg} />
            <KPI icon="🏛️" label="Pensión + ARL + Caja (costo empresa)" value={fmtMoney(totales.pensionEmpleador + totales.arlEmpleador + totales.cajaCompensacionEmpleador)} color={C.violet} bg={C.violetBg} />
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
              { key: "diasTrabajados", label: "Días trabajados (huellero)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: C.green }}>{f.diasTrabajados == null ? "—" : f.diasTrabajados}</span>
              ) },
              { key: "sueldoQuincena", label: "Sueldo quincena", align: "right", render: (f) => fmtMoney(f.sueldoQuincena) },
              { key: "auxilioQuincena", label: "Auxilio quincena", align: "right", render: (f) => fmtMoney(f.auxilioQuincena) },
              { key: "epsTrabajador", label: "EPS trab.", align: "right", render: (f) => <span style={{ color: C.red }}>-{fmtMoney(f.epsTrabajador)}</span> },
              { key: "pensionTrabajador", label: "Pensión trab.", align: "right", render: (f) => <span style={{ color: C.red }}>-{fmtMoney(f.pensionTrabajador)}</span> },
              { key: "descuentoCobros", label: "Descuento cobros Bodega", align: "right", render: (f) => f.descuentoCobros > 0 ? <span style={{ color: C.red, fontWeight: 700 }}>-{fmtMoney(f.descuentoCobros)}</span> : <span style={{ color: C.slate }}>—</span> },
              { key: "netoAPagar", label: "Neto a pagar", align: "right", render: (f) => <strong>{fmtMoney(f.netoAPagar)}</strong> },
              { key: "pensionEmpleador", label: "Pensión empresa", align: "right", render: (f) => fmtMoney(f.pensionEmpleador) },
              { key: "arlEmpleador", label: "ARL empresa", align: "right", render: (f) => fmtMoney(f.arlEmpleador) },
              { key: "cajaCompensacionEmpleador", label: "Caja Comp.", align: "right", render: (f) => fmtMoney(f.cajaCompensacionEmpleador) },
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
function calcularLiquidacionFiscalDestajo(trabajador, diasInasistencia, diasSinAuxilio = 0, diasSinSueldo = 0) {
  const sueldo = Number(trabajador.sueldo) || 0;
  const auxilio = Number(trabajador.auxilioTransporte) || 0;
  // (2026-09-12) Mismo criterio que calcularLiquidacionFiscal: diasSinSueldo
  // son los dias de Licencia No Remunerada (la unica ausencia que tambien
  // deja de pagar sueldo, no solo auxilio).
  const descuentoSueldo = (sueldo / 30) * (diasInasistencia + diasSinSueldo);
  const descuentoAuxilio = (auxilio / 30) * (diasInasistencia + diasSinAuxilio);
  const sueldoQuincena = Math.max(0, sueldo / 2 - descuentoSueldo);
  const auxilioQuincena = Math.max(0, auxilio / 2 - descuentoAuxilio);
  const saldoCesantiasInicio = Number(trabajador.cesantiasAcumuladas) || 0;
  const baseParafiscales = PARAFISCALES_SOBRE_SUELDO_DESCONTADO ? sueldoQuincena : sueldo / 2;
  const cesantiasPeriodo = baseParafiscales * TASA_CESANTIAS_MENSUAL;
  const interesesPeriodo = saldoCesantiasInicio * (TASA_INTERES_CESANTIAS_ANUAL / 24);
  const primaPeriodo = baseParafiscales * TASA_PRIMA_MENSUAL;
  const vacacionesPeriodo = baseParafiscales * TASA_VACACIONES_MENSUAL;
  return {
    diasInasistencia, diasSinAuxilio, diasSinSueldo, descuentoSueldo, descuentoAuxilio, sueldoQuincena, auxilioQuincena,
    netoAPagar: sueldoQuincena + auxilioQuincena,
    cesantiasPeriodo, interesesPeriodo, primaPeriodo, vacacionesPeriodo,
    saldoCesantiasInicio, saldoCesantiasFin: saldoCesantiasInicio + cesantiasPeriodo,
  };
}
// (2026-09-12, a pedido de Fredy) Listado de todas las novedades (faltas
// sin justificar del huellero + ausencias registradas) de una quincena,
// con el descuento que cada una genera en sueldo y/o auxilio de
// transporte -- para poder verificar todo de un vistazo antes de
// liquidar. Cubre Nomina Fiscal y Nomina Fiscal Destajo (las unicas que
// tienen estos descuentos reales); Destajo no aplica porque se paga por
// produccion, no por dias.
function NovedadesQuincenaView({ trabajadores, faltas, ausencias, turnos }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");
  const [filas, setFilas] = useState(null);

  const personas = trabajadores.filter((t) => (t.tipoNomina === "Fiscal" || t.tipoNomina === "Fiscal Destajo") && t.activo !== false);
  const { inicio, fin } = rangoQuincena(anio, mes, quincena);

  function calcular() {
    const out = [];
    personas.forEach((t) => {
      const nombreNorm = normalizarNombreHuellero(t.nombre);
      const turno = (turnos || []).find((tu) => tu.id === t.turnoId);
      const sueldo = Number(t.sueldo) || 0;
      const auxilioMensual = sueldo > TOPE_SUELDO_PARA_AUXILIO ? 0 : (Number(t.auxilioTransporte) || 0);
      const valorDiaSueldo = sueldo / 30;
      const valorDiaAuxilio = auxilioMensual / 30;

      // 1) Faltas sin justificar del huellero -- afectan sueldo Y auxilio.
      const faltasDetalle = faltas.filter((f) => coincideHuellero(f, t, nombreNorm) && f.fecha >= inicio && f.fecha <= fin);
      if (faltasDetalle.length) {
        const dias = faltasDetalle.length;
        out.push({
          trabajador: t, motivo: "Falta sin justificar", fechas: faltasDetalle.map((f) => f.fecha).sort(), dias,
          descuentoSueldo: valorDiaSueldo * dias, descuentoAuxilio: valorDiaAuxilio * dias,
        });
      }

      // 2) Ausencias registradas que caen (aunque sea parcialmente) en la
      // quincena -- una fila por ausencia, contando solo los dias habiles
      // de ESTA quincena.
      (ausencias || []).filter((a) => a.trabajadorId === t.id && a.fechaInicio <= fin && a.fechaFin >= inicio).forEach((a) => {
        const diasAusencia = listaDeDiasISO(a.fechaInicio, a.fechaFin).filter((f) => f >= inicio && f <= fin && diaEsperado(f, turno));
        if (!diasAusencia.length) return;
        const afectaAuxilio = MOTIVOS_SIN_AUXILIO_TRANSPORTE.includes(a.motivo);
        const afectaSueldo = MOTIVOS_SIN_SUELDO.includes(a.motivo);
        out.push({
          trabajador: t, motivo: a.motivo, fechas: diasAusencia, dias: diasAusencia.length,
          descuentoSueldo: afectaSueldo ? valorDiaSueldo * diasAusencia.length : 0,
          descuentoAuxilio: afectaAuxilio ? valorDiaAuxilio * diasAusencia.length : 0,
        });
      });
    });
    out.sort((a, b) => a.trabajador.nombre.localeCompare(b.trabajador.nombre) || a.fechas[0].localeCompare(b.fechas[0]));
    setFilas(out);
  }

  const totales = filas ? filas.reduce((s, f) => ({
    descuentoSueldo: s.descuentoSueldo + f.descuentoSueldo,
    descuentoAuxilio: s.descuentoAuxilio + f.descuentoAuxilio,
  }), { descuentoSueldo: 0, descuentoAuxilio: 0 }) : null;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Todas las novedades (faltas sin justificar y ausencias registradas) de los trabajadores Fiscal y Fiscal Destajo en la quincena elegida, con el descuento que cada una genera en sueldo y/o auxilio de transporte. Solo informativo -- no reemplaza el cálculo de cada nómina.
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <Field label="Año"><FInput type="number" value={anio} onChange={setAnio} /></Field>
        <Field label="Mes">
          <FSel value={mes} onChange={setMes} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: String(i + 1).padStart(2, "0") }))} />
        </Field>
        <Field label="Quincena">
          <FSel value={quincena} onChange={setQuincena} options={[{ value: "1", label: "1 (días 1-15)" }, { value: "2", label: "2 (16-fin de mes)" }]} />
        </Field>
        <Btn onClick={calcular} disabled={personas.length === 0}>🔍 Buscar novedades</Btn>
      </div>

      {filas && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="📣" label="Novedades encontradas" value={filas.length} color={C.violet} bg={C.violetBg} />
            <KPI icon="💸" label="Total descuento sueldo" value={fmtMoney(totales.descuentoSueldo)} color={C.red} bg={C.redBg} />
            <KPI icon="🚌" label="Total descuento aux. transporte" value={fmtMoney(totales.descuentoAuxilio)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="No hay novedades en esta quincena."
            filas={filas}
            columnas={[
              { key: "nombre", label: "Nombre", render: (f) => f.trabajador.nombre },
              { key: "motivo", label: "Motivo", render: (f) => f.motivo },
              { key: "fechas", label: "Fechas", render: (f) => f.fechas.map((iso) => fmtFechaISO(iso)).join(", ") },
              { key: "dias", label: "Días", align: "right", render: (f) => f.dias },
              { key: "descuentoSueldo", label: "Descuento sueldo", align: "right", render: (f) => (
                <span style={{ color: f.descuentoSueldo > 0 ? C.red : C.slate, fontWeight: f.descuentoSueldo > 0 ? 700 : 400 }}>{fmtMoney(f.descuentoSueldo)}</span>
              ) },
              { key: "descuentoAuxilio", label: "Descuento aux. transporte", align: "right", render: (f) => (
                <span style={{ color: f.descuentoAuxilio > 0 ? C.amber : C.slate, fontWeight: f.descuentoAuxilio > 0 ? 700 : 400 }}>{fmtMoney(f.descuentoAuxilio)}</span>
              ) },
            ]}
          />
        </>
      )}
    </div>
  );
}
function NominaFiscalDestajoView({ trabajadores, faltas, ausencias, motivosDisponibles, onJustificarFalta, onLimpiarFaltaJustificada, diasTrabajados, liquidaciones, onGuardarTrabajador, onGuardarLiquidacion, lotesConCobros, onMarcarCobrosCobrados, turnos }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");
  const [resultados, setResultados] = useState(null); // null | [{trabajador, calculo}]
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [detalleFaltas, setDetalleFaltas] = useState(null); // { trabajador, fechas }

  const personas = trabajadores.filter((t) => t.tipoNomina === "Fiscal Destajo" && t.activo !== false);
  const periodoId = `${anio}-${mes}-Q${quincena}`;
  const yaLiquidado = liquidaciones.some((l) => l.periodoId === periodoId);
  const { inicio, fin } = rangoQuincena(anio, mes, quincena);

  function calcular() {
    const filas = personas.map((t) => {
      const nombreNorm = normalizarNombreHuellero(t.nombre);
      const faltasDetalle = faltas.filter((f) => coincideHuellero(f, t, nombreNorm) && f.fecha >= inicio && f.fecha <= fin);
      const dias = faltasDetalle.length;
      // (2026-08-31) Dias trabajados = dias CON marca en el huellero dentro
      // de la quincena -- solo informativo/verificacion (pedido de Fredy),
      // no reemplaza ni toca el descuento por inasistencia de arriba.
      const diasTrabajadosCount = diasTrabajados.filter((d) => coincideHuellero(d, t, nombreNorm) && d.fecha >= inicio && d.fecha <= fin).length;
      const turno = (turnos || []).find((tu) => tu.id === t.turnoId);
      const diasSinAuxilio = diasHabilesDeAusencias(ausencias, MOTIVOS_SIN_AUXILIO_TRANSPORTE, t, turno, inicio, fin);
      const diasSinSueldo = diasHabilesDeAusencias(ausencias, MOTIVOS_SIN_SUELDO, t, turno, inicio, fin);
      const base = calcularLiquidacionFiscalDestajo(t, dias, diasSinAuxilio, diasSinSueldo);
      const cobrosDetalle = cobrosPendientesDeTrabajador(lotesConCobros, t.id);
      const descuentoCobros = sumaCobrosPendientes(cobrosDetalle);
      return { trabajador: t, calculo: { ...base, fechasFalta: faltasDetalle.map((f) => f.fecha), diasTrabajados: diasTrabajadosCount, descuentoCobros, cobrosDetalle, netoAPagar: base.netoAPagar - descuentoCobros } };
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
        if (calculo.descuentoCobros > 0) await onMarcarCobrosCobrados(trabajador.id, periodoId);
      }
      setGuardadoOk(true);
    } finally {
      setGuardando(false);
    }
  }

  const totales = resultados ? resultados.reduce((s, r) => ({
    neto: s.neto + r.calculo.netoAPagar,
    descuentoCobros: s.descuentoCobros + (r.calculo.descuentoCobros || 0),
    cesantias: s.cesantias + r.calculo.cesantiasPeriodo,
    intereses: s.intereses + r.calculo.interesesPeriodo,
    prima: s.prima + r.calculo.primaPeriodo,
    vacaciones: s.vacaciones + r.calculo.vacacionesPeriodo,
  }), { neto: 0, descuentoCobros: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 }) : null;

  return (
    <div>
      {detalleFaltas && (
        <DetalleDiasSinJustificarModal
          trabajador={detalleFaltas.trabajador}
          fechas={detalleFaltas.fechas}
          ausencias={ausencias}
          trabajadores={trabajadores}
          motivosDisponibles={motivosDisponibles}
          onJustificar={(data, fecha) => onJustificarFalta(data, normalizarNombreHuellero(detalleFaltas.trabajador.nombre), fecha)}
          onLimpiar={(fecha) => onLimpiarFaltaJustificada(normalizarNombreHuellero(detalleFaltas.trabajador.nombre), fecha)}
          onClose={() => setDetalleFaltas(null)}
        />
      )}
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
            <KPI icon="🔻" label="Descuento cobros de Bodega" value={fmtMoney(totales.descuentoCobros)} color={C.red} bg={C.redBg} />
            <KPI icon="📦" label="Cesantías (provisión)" value={fmtMoney(totales.cesantias)} color={C.violet} bg={C.violetBg} />
            <KPI icon="🎁" label="Prima (provisión)" value={fmtMoney(totales.prima)} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏖️" label="Vacaciones (provisión)" value={fmtMoney(totales.vacaciones)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="Sin resultados."
            columnas={[
              { key: "nombre", label: "Nombre", render: (f) => f.trabajador.nombre },
              { key: "dias", label: "Días sin justificar", align: "right", render: (f) => (
                <span onClick={() => setDetalleFaltas({ trabajador: f.trabajador, fechas: f.calculo.fechasFalta || [] })} style={{ fontWeight: 800, color: f.calculo.diasInasistencia > 0 ? C.red : C.green, cursor: "pointer", textDecoration: "underline" }} title="Ver el detalle de las fechas">{f.calculo.diasInasistencia}</span>
              ) },
              { key: "diasTrabajados", label: "Días trabajados (huellero)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: C.green }}>{f.calculo.diasTrabajados}</span>
              ) },
              { key: "diasSinAuxilio", label: "Días sin aux. transporte", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: f.calculo.diasSinAuxilio > 0 ? C.amber : C.slate }}>{f.calculo.diasSinAuxilio || 0}</span>
              ) },
              { key: "diasSinSueldo", label: "Días sin sueldo (lic. no remun.)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: f.calculo.diasSinSueldo > 0 ? C.red : C.slate }}>{f.calculo.diasSinSueldo || 0}</span>
              ) },
              { key: "sueldoQuincena", label: "Sueldo quincena", align: "right", render: (f) => fmtMoney(f.calculo.sueldoQuincena) },
              { key: "auxilioQuincena", label: "Auxilio quincena", align: "right", render: (f) => fmtMoney(f.calculo.auxilioQuincena) },
              { key: "descuentoCobros", label: "Descuento cobros Bodega", align: "right", render: (f) => f.calculo.descuentoCobros > 0 ? (
                <span style={{ color: C.red, fontWeight: 700 }} title={(f.calculo.cobrosDetalle || []).map((c) => `Lote ${c.numLote}: ${c.tipo || "cobro"} ${fmtMoney(c.valor)}`).join(" | ")}>-{fmtMoney(f.calculo.descuentoCobros)}</span>
              ) : <span style={{ color: C.slate }}>—</span> },
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
  const esFiscalConSegSocial = tipoNomina === "Fiscal";
  const nombre = trabajador?.nombre || liquidacion.nombre || "—";
  const cedula = trabajador?.cedula || "—";
  const area = trabajador?.area || "—";
  const sueldoBasico = Number(trabajador?.sueldo) || 0;
  const auxilioBasico = Number(trabajador?.auxilioTransporte) || 0;
  const totalPrestaciones = (liquidacion.cesantiasPeriodo || 0) + (liquidacion.interesesPeriodo || 0) + (liquidacion.primaPeriodo || 0) + (liquidacion.vacacionesPeriodo || 0);
  const totalAportesPatronales = (liquidacion.pensionEmpleador || 0) + (liquidacion.arlEmpleador || 0) + (liquidacion.cajaCompensacionEmpleador || 0);
  const filasPago = esFiscalConSegSocial
    ? `
      <tr><td>Sueldo básico (mensual)</td><td style="text-align:right">${fmtMoney(sueldoBasico)}</td></tr>
      <tr><td>Auxilio de transporte (mensual)</td><td style="text-align:right">${fmtMoney(auxilioBasico)}</td></tr>
      <tr><td>Días sin justificar</td><td style="text-align:right">${liquidacion.diasInasistencia || 0}</td></tr>
      <tr><td>Días trabajados (huellero)</td><td style="text-align:right">${liquidacion.diasTrabajados == null ? "—" : liquidacion.diasTrabajados}</td></tr>
      <tr><td>Descuento por inasistencia</td><td style="text-align:right;color:#B23A48">-${fmtMoney((liquidacion.descuentoSueldo || 0) + (liquidacion.descuentoAuxilio || 0))}</td></tr>
      <tr><td>Sueldo quincena</td><td style="text-align:right">${fmtMoney(liquidacion.sueldoQuincena)}</td></tr>
      <tr><td>Auxilio quincena</td><td style="text-align:right">${fmtMoney(liquidacion.auxilioQuincena)}</td></tr>
      <tr><td>EPS trabajador (4%)</td><td style="text-align:right;color:#B23A48">-${fmtMoney(liquidacion.epsTrabajador)}</td></tr>
      <tr><td>Pensión trabajador (4%)</td><td style="text-align:right;color:#B23A48">-${fmtMoney(liquidacion.pensionTrabajador)}</td></tr>`
    : esFiscal
    ? `
      <tr><td>Sueldo básico (mensual)</td><td style="text-align:right">${fmtMoney(sueldoBasico)}</td></tr>
      <tr><td>Auxilio de transporte (mensual)</td><td style="text-align:right">${fmtMoney(auxilioBasico)}</td></tr>
      <tr><td>Días sin justificar</td><td style="text-align:right">${liquidacion.diasInasistencia || 0}</td></tr>
      <tr><td>Días trabajados (huellero)</td><td style="text-align:right">${liquidacion.diasTrabajados == null ? "—" : liquidacion.diasTrabajados}</td></tr>
      <tr><td>Descuento por inasistencia</td><td style="text-align:right;color:#B23A48">-${fmtMoney((liquidacion.descuentoSueldo || 0) + (liquidacion.descuentoAuxilio || 0))}</td></tr>
      <tr><td>Sueldo quincena</td><td style="text-align:right">${fmtMoney(liquidacion.sueldoQuincena)}</td></tr>
      <tr><td>Auxilio quincena</td><td style="text-align:right">${fmtMoney(liquidacion.auxilioQuincena)}</td></tr>`
    : `
      <tr><td>Producción registrada en la quincena</td><td style="text-align:right">${fmtMoney(liquidacion.netoAPagar)}</td></tr>
      <tr><td>Días trabajados (huellero)</td><td style="text-align:right">${liquidacion.diasTrabajados == null ? "—" : liquidacion.diasTrabajados}</td></tr>
      <tr><td colspan="2" style="color:#5A5A7A;font-size:11px;padding-top:2px">Sueldo básico de referencia: ${fmtMoney(sueldoBasico)} · Auxilio de referencia: ${fmtMoney(auxilioBasico)} — solo se usan para calcular las prestaciones sociales, no hacen parte del pago.</td></tr>`;
  const seccionAportesPatronales = esFiscalConSegSocial ? `
    <div class="section-title">🏛️ Aportes patronales de seguridad social (a cargo de la empresa, no se descuentan)</div>
    <table><tbody>
      <tr><td>Pensión empleador (12%)</td><td style="text-align:right">${fmtMoney(liquidacion.pensionEmpleador)}</td></tr>
      <tr><td>ARL empleador</td><td style="text-align:right">${fmtMoney(liquidacion.arlEmpleador)}</td></tr>
      <tr><td>Caja de Compensación (4%)</td><td style="text-align:right">${fmtMoney(liquidacion.cajaCompensacionEmpleador)}</td></tr>
      <tr><td>EPS empleador</td><td style="text-align:right;color:#5A5A7A">Exonerada (Ley 1607/2012)</td></tr>
    </tbody></table>` : "";
  const totalCardAportesPatronales = esFiscalConSegSocial
    ? `<div class="total-card" style="background:#FBEFE3;color:#C47C1A"><label>Aportes Patronales Seg. Social</label><div class="val">${fmtMoney(totalAportesPatronales)}</div></div>`
    : "";
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
    ${seccionAportesPatronales}
    <div class="section-title">📦 Prestaciones sociales (provisión de esta quincena)</div>
    <table><tbody>
      <tr><td>Cesantías</td><td style="text-align:right">${fmtMoney(liquidacion.cesantiasPeriodo)}</td></tr>
      <tr><td>Intereses de cesantías</td><td style="text-align:right">${fmtMoney(liquidacion.interesesPeriodo)}</td></tr>
      <tr><td>Prima</td><td style="text-align:right">${fmtMoney(liquidacion.primaPeriodo)}</td></tr>
      <tr><td>Vacaciones</td><td style="text-align:right">${fmtMoney(liquidacion.vacacionesPeriodo)}</td></tr>
      <tr><td>Saldo acumulado de cesantías (a la fecha)</td><td style="text-align:right">${fmtMoney(liquidacion.saldoCesantiasFin)}</td></tr>
    </tbody></table>
    ${liquidacion.descuentoCobros > 0 ? `
    <div class="section-title">🏭 Descuento por cobros de Bodega</div>
    <table><tbody>
      <tr><td>Descuento por cobros de Bodega (ya restado del neto)</td><td style="text-align:right;color:#B23A48">-${fmtMoney(liquidacion.descuentoCobros)}</td></tr>
    </tbody></table>` : ""}
    <div class="totales">
      <div class="total-card" style="background:#EBF7F2;color:#2D9E6B"><label>Neto a Pagar</label><div class="val">${fmtMoney(liquidacion.netoAPagar)}</div></div>
      <div class="total-card" style="background:#F3EEF9;color:#7B5EA7"><label>Total Prestaciones Provisionadas</label><div class="val">${fmtMoney(totalPrestaciones)}</div></div>
      ${totalCardAportesPatronales}
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
    descuentoCobros: s.descuentoCobros + (l.descuentoCobros || 0),
    cesantias: s.cesantias + (l.cesantiasPeriodo || 0),
    intereses: s.intereses + (l.interesesPeriodo || 0),
    prima: s.prima + (l.primaPeriodo || 0),
    vacaciones: s.vacaciones + (l.vacacionesPeriodo || 0),
  }), { neto: 0, descuentoCobros: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 });
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
            <KPI icon="🔻" label="Descuento cobros de Bodega" value={fmtMoney(totales.descuentoCobros)} color={C.red} bg={C.redBg} />
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
              { key: "diasTrabajados", label: "Días trabajados (huellero)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: C.green }}>{f.diasTrabajados == null ? "—" : f.diasTrabajados}</span>
              ) },
              { key: "sueldoQuincena", label: "Sueldo quincena", align: "right", render: (f) => fmtMoney(f.sueldoQuincena) },
              { key: "auxilioQuincena", label: "Auxilio quincena", align: "right", render: (f) => fmtMoney(f.auxilioQuincena) },
              { key: "descuentoCobros", label: "Descuento cobros Bodega", align: "right", render: (f) => f.descuentoCobros > 0 ? <span style={{ color: C.red, fontWeight: 700 }}>-{fmtMoney(f.descuentoCobros)}</span> : <span style={{ color: C.slate }}>—</span> },
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
function NominaDestajoView({ trabajadores, produccion, faltas, ausencias, motivosDisponibles, onJustificarFalta, onLimpiarFaltaJustificada, diasTrabajados, liquidaciones, onGuardarTrabajador, onGuardarLiquidacion, lotesConCobros, onMarcarCobrosCobrados }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");
  const [resultados, setResultados] = useState(null); // null | [{trabajador, calculo}]
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [detalleFaltas, setDetalleFaltas] = useState(null); // { trabajador, fechas }

  const personas = trabajadores.filter((t) => t.tipoNomina === "Destajo" && t.activo !== false);
  const periodoId = `${anio}-${mes}-Q${quincena}`;
  const yaLiquidado = liquidaciones.some((l) => l.periodoId === periodoId);
  const { inicio, fin } = rangoQuincena(anio, mes, quincena);

  function calcular() {
    const filas = personas.map((t) => {
      const netoProduccion = produccion
        .filter((p) => p.trabajadorId === t.id && p.fecha >= inicio && p.fecha <= fin)
        .reduce((s, p) => s + (Number(p.total) || 0), 0);
      // (2026-08-31) Dias trabajados = dias CON marca en el huellero dentro
      // de la quincena -- puramente informativo/verificacion (pedido de
      // Fredy). El "neto a pagar" de Destajo sigue siendo, sin cambios, la
      // suma real de produccion registrada (confirmado 30/08/2026) -- esto
      // NO reemplaza ni afecta esa formula.
      const nombreNorm = normalizarNombreHuellero(t.nombre);
      const diasTrabajadosCount = diasTrabajados.filter((d) => coincideHuellero(d, t, nombreNorm) && d.fecha >= inicio && d.fecha <= fin).length;
      // (2026-09-10, a pedido de Fredy) Dias sin justificar, igual que en
      // Nomina Fiscal/Fiscal Destajo -- SOLO informativo, para comparar
      // despues contra lo reportado por el Estado. NO se usa para descontar
      // nada de netoAPagar (Destajo se paga por produccion, sin cambios).
      const faltasDetalle = faltas.filter((f) => coincideHuellero(f, t, nombreNorm) && f.fecha >= inicio && f.fecha <= fin);
      const diasInasistencia = faltasDetalle.length;
      const base = calcularLiquidacionDestajo(t, netoProduccion);
      const cobrosDetalle = cobrosPendientesDeTrabajador(lotesConCobros, t.id);
      const descuentoCobros = sumaCobrosPendientes(cobrosDetalle);
      return { trabajador: t, calculo: { ...base, diasInasistencia, fechasFalta: faltasDetalle.map((f) => f.fecha), diasTrabajados: diasTrabajadosCount, descuentoCobros, cobrosDetalle, netoAPagar: base.netoAPagar - descuentoCobros } };
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
        if (calculo.descuentoCobros > 0) await onMarcarCobrosCobrados(trabajador.id, periodoId);
      }
      setGuardadoOk(true);
    } finally {
      setGuardando(false);
    }
  }

  const totales = resultados ? resultados.reduce((s, r) => ({
    neto: s.neto + r.calculo.netoAPagar,
    descuentoCobros: s.descuentoCobros + (r.calculo.descuentoCobros || 0),
    cesantias: s.cesantias + r.calculo.cesantiasPeriodo,
    intereses: s.intereses + r.calculo.interesesPeriodo,
    prima: s.prima + r.calculo.primaPeriodo,
    vacaciones: s.vacaciones + r.calculo.vacacionesPeriodo,
  }), { neto: 0, descuentoCobros: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 }) : null;

  return (
    <div>
      {detalleFaltas && (
        <DetalleDiasSinJustificarModal
          trabajador={detalleFaltas.trabajador}
          fechas={detalleFaltas.fechas}
          ausencias={ausencias}
          trabajadores={trabajadores}
          motivosDisponibles={motivosDisponibles}
          onJustificar={(data, fecha) => onJustificarFalta(data, normalizarNombreHuellero(detalleFaltas.trabajador.nombre), fecha)}
          onLimpiar={(fecha) => onLimpiarFaltaJustificada(normalizarNombreHuellero(detalleFaltas.trabajador.nombre), fecha)}
          onClose={() => setDetalleFaltas(null)}
        />
      )}
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
            <KPI icon="🔻" label="Descuento cobros de Bodega" value={fmtMoney(totales.descuentoCobros)} color={C.red} bg={C.redBg} />
            <KPI icon="📦" label="Cesantías (provisión)" value={fmtMoney(totales.cesantias)} color={C.violet} bg={C.violetBg} />
            <KPI icon="🎁" label="Prima (provisión)" value={fmtMoney(totales.prima)} color={C.blue} bg={C.blueBg} />
            <KPI icon="🏖️" label="Vacaciones (provisión)" value={fmtMoney(totales.vacaciones)} color={C.amber} bg={C.amberBg} />
          </div>
          <Tabla
            vacio="Sin resultados."
            columnas={[
              { key: "nombre", label: "Nombre", render: (f) => f.trabajador.nombre },
              { key: "diasInasistencia", label: "Días sin justificar", align: "right", render: (f) => (
                <span onClick={() => setDetalleFaltas({ trabajador: f.trabajador, fechas: f.calculo.fechasFalta || [] })} style={{ fontWeight: 800, color: f.calculo.diasInasistencia > 0 ? C.red : C.green, cursor: "pointer", textDecoration: "underline" }} title="Ver el detalle de las fechas">{f.calculo.diasInasistencia}</span>
              ) },
              { key: "diasTrabajados", label: "Días trabajados (huellero)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: C.green }}>{f.calculo.diasTrabajados}</span>
              ) },
              { key: "descuentoCobros", label: "Descuento cobros Bodega", align: "right", render: (f) => f.calculo.descuentoCobros > 0 ? (
                <span style={{ color: C.red, fontWeight: 700 }} title={(f.calculo.cobrosDetalle || []).map((c) => `Lote ${c.numLote}: ${c.tipo || "cobro"} ${fmtMoney(c.valor)}`).join(" | ")}>-{fmtMoney(f.calculo.descuentoCobros)}</span>
              ) : <span style={{ color: C.slate }}>—</span> },
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
// ─── REPORTE DE NÓMINA POR ÁREA (Fiscal + Fiscal Destajo + Destajo,
// agrupado por Área Interna y por Empleador) ─────────────────────────────
// Junta las liquidaciones YA CONFIRMADAS de los 3 tipos de nómina de un
// período (una quincena, o el mes completo sumando sus 2 quincenas) y las
// agrupa por Área Interna -- el mismo catálogo que ya usa Trabajadores,
// no uno aparte (confirmado con Fredy) -- y por Empleador, para responder
// "cuánto debemos pagar por cada área/empresa". El Área y el Empleador
// que se usan son los ACTUALES del trabajador (no un snapshot de cuando
// se confirmó la liquidación), porque esos dos campos no se guardan en
// el registro de liquidación -- si alguien cambia de área después, el
// reporte de períodos pasados se ve con su área de HOY, no la de
// entonces.
function costoTotalLiquidacion(l) {
  // "Costo total para la empresa" = lo que se le paga al trabajador +
  // los aportes patronales de seguridad social (Fiscal) + las
  // provisiones de prestaciones -- para Fiscal Destajo/Destajo, que no
  // tienen seguridad social, esos campos no existen y quedan en $0 solos.
  return (l.netoAPagar || 0)
    + (l.epsTrabajador || 0) + (l.pensionTrabajador || 0)
    + (l.pensionEmpleador || 0) + (l.arlEmpleador || 0) + (l.cajaCompensacionEmpleador || 0) + (l.epsEmpleador || 0)
    + (l.cesantiasPeriodo || 0) + (l.interesesPeriodo || 0) + (l.primaPeriodo || 0) + (l.vacacionesPeriodo || 0);
}
function ReporteNominaPorAreaView({ trabajadores, liquidacionesF, liquidacionesFD, liquidacionesD }) {
  const hoy = new Date();
  const [tipoPeriodo, setTipoPeriodo] = useState("quincena"); // "quincena" | "mes"
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");
  const [areasAbiertas, setAreasAbiertas] = useState({});

  const periodoId = `${anio}-${mes}-Q${quincena}`;
  function enPeriodo(l) {
    return tipoPeriodo === "quincena" ? l.periodoId === periodoId : (l.periodoId || "").startsWith(`${anio}-${mes}-`);
  }

  const filas = [
    ...liquidacionesF.filter(enPeriodo).map((l) => ({ l, tipoNomina: "Fiscal" })),
    ...liquidacionesFD.filter(enPeriodo).map((l) => ({ l, tipoNomina: "Fiscal Destajo" })),
    ...liquidacionesD.filter(enPeriodo).map((l) => ({ l, tipoNomina: "Destajo" })),
  ].map(({ l, tipoNomina }) => {
    const trabajador = trabajadores.find((t) => t.id === l.trabajadorId);
    return {
      id: `${tipoNomina}__${l.id}`,
      nombre: l.nombre || trabajador?.nombre || "—",
      area: trabajador?.area || "Sin asignar",
      empleador: trabajador?.empleador || "Sin asignar",
      tipoNomina,
      netoAPagar: l.netoAPagar || 0,
      costoTotal: costoTotalLiquidacion(l),
    };
  });

  const grupos = [...new Set(filas.map((f) => f.area))]
    .map((area) => {
      const filasArea = filas.filter((f) => f.area === area);
      const empleadores = [...new Set(filasArea.map((f) => f.empleador))].sort();
      return {
        area,
        filas: filasArea,
        neto: filasArea.reduce((s, f) => s + f.netoAPagar, 0),
        costo: filasArea.reduce((s, f) => s + f.costoTotal, 0),
        trabajadores: filasArea.length,
        porEmpleador: empleadores.map((emp) => {
          const filasEmp = filasArea.filter((f) => f.empleador === emp);
          return { empleador: emp, neto: filasEmp.reduce((s, f) => s + f.netoAPagar, 0), costo: filasEmp.reduce((s, f) => s + f.costoTotal, 0) };
        }),
      };
    })
    .sort((a, b) => b.costo - a.costo);

  const totalGeneral = {
    trabajadores: filas.length,
    neto: filas.reduce((s, f) => s + f.netoAPagar, 0),
    costo: filas.reduce((s, f) => s + f.costoTotal, 0),
  };
  const totalPorEmpleador = [...new Set(filas.map((f) => f.empleador))].sort().map((emp) => ({
    empleador: emp,
    costo: filas.filter((f) => f.empleador === emp).reduce((s, f) => s + f.costoTotal, 0),
  }));

  function toggleArea(area) {
    setAreasAbiertas((prev) => ({ ...prev, [area]: !prev[area] }));
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Junta las liquidaciones YA CONFIRMADAS de Nómina Fiscal, Fiscal Destajo y Destajo del período elegido, agrupadas por Área Interna y por Empleador — para ver cuánto se debe pagar en total y por cada empresa. El Área y Empleador que se muestran son los que tiene HOY cada trabajador.
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <Field label="Período">
          <FSel value={tipoPeriodo} onChange={setTipoPeriodo} options={[{ value: "quincena", label: "Una quincena" }, { value: "mes", label: "Mes completo (2 quincenas)" }]} />
        </Field>
        <Field label="Año"><FInput type="number" value={anio} onChange={setAnio} /></Field>
        <Field label="Mes">
          <FSel value={mes} onChange={setMes} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: String(i + 1).padStart(2, "0") }))} />
        </Field>
        {tipoPeriodo === "quincena" && (
          <Field label="Quincena">
            <FSel value={quincena} onChange={setQuincena} options={[{ value: "1", label: "1 (días 1-15)" }, { value: "2", label: "2 (16-fin de mes)" }]} />
          </Field>
        )}
      </div>

      {filas.length === 0 ? (
        <div style={{ padding: "12px 16px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, color: C.slate, fontSize: 13, maxWidth: 560 }}>
          No hay ninguna liquidación confirmada (Fiscal, Fiscal Destajo o Destajo) para este período todavía.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="👷" label="Trabajadores incluidos" value={totalGeneral.trabajadores} color={C.blue} bg={C.blueBg} />
            <KPI icon="💵" label="Neto a Pagar (total)" value={fmtMoney(totalGeneral.neto)} color={C.green} bg={C.greenBg} />
            <KPI icon="🏛️" label="Costo Total Empresa" value={fmtMoney(totalGeneral.costo)} color={C.violet} bg={C.violetBg} />
            {totalPorEmpleador.map((e) => (
              <KPI key={e.empleador} icon="🏢" label={`Costo Total ${e.empleador}`} value={fmtMoney(e.costo)} color={C.amber} bg={C.amberBg} />
            ))}
          </div>

          {grupos.map((g) => (
            <div key={g.area} style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div onClick={() => toggleArea(g.area)} style={{ cursor: "pointer", padding: "12px 16px", background: C.canvas, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{areasAbiertas[g.area] ? "▾" : "▸"}</span>
                  <strong style={{ fontSize: 14 }}>{g.area}</strong>
                  <span style={{ fontSize: 12, color: C.slate }}>({g.trabajadores} trabajador{g.trabajadores === 1 ? "" : "es"})</span>
                </div>
                <div style={{ display: "flex", gap: 18, fontSize: 12, flexWrap: "wrap", alignItems: "center" }}>
                  {g.porEmpleador.map((e) => (
                    <span key={e.empleador} style={{ color: C.slate }}>{e.empleador}: <strong style={{ color: C.ink }}>{fmtMoney(e.costo)}</strong></span>
                  ))}
                  <span style={{ color: C.green, fontWeight: 700 }}>Neto: {fmtMoney(g.neto)}</span>
                  <span style={{ color: C.violet, fontWeight: 800 }}>Costo Total: {fmtMoney(g.costo)}</span>
                </div>
              </div>
              {areasAbiertas[g.area] && (
                <Tabla
                  vacio="Sin trabajadores."
                  columnas={[
                    { key: "nombre", label: "Nombre" },
                    { key: "empleador", label: "Empleador" },
                    { key: "tipoNomina", label: "Tipo Nómina", render: (f) => (
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: f.tipoNomina === "Fiscal Destajo" ? C.violetBg : f.tipoNomina === "Destajo" ? C.amberBg : C.blueBg, color: f.tipoNomina === "Fiscal Destajo" ? C.violet : f.tipoNomina === "Destajo" ? C.amber : C.blue }}>
                        {f.tipoNomina}
                      </span>
                    ) },
                    { key: "netoAPagar", label: "Neto a Pagar", align: "right", render: (f) => fmtMoney(f.netoAPagar) },
                    { key: "costoTotal", label: "Costo Total Empresa", align: "right", render: (f) => <strong>{fmtMoney(f.costoTotal)}</strong> },
                  ]}
                  filas={g.filas}
                />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
function HistorialDestajoView({ liquidaciones, trabajadores }) {
  const periodos = [...new Set(liquidaciones.map((l) => l.periodoId))].sort().reverse();
  const [periodoFiltro, setPeriodoFiltro] = useState("");
  const filas = [...liquidaciones]
    .filter((l) => !periodoFiltro || l.periodoId === periodoFiltro)
    .sort((a, b) => (b.periodoId || "").localeCompare(a.periodoId || "") || (a.nombre || "").localeCompare(b.nombre || ""));
  const totales = filas.reduce((s, l) => ({
    neto: s.neto + (l.netoAPagar || 0),
    descuentoCobros: s.descuentoCobros + (l.descuentoCobros || 0),
    cesantias: s.cesantias + (l.cesantiasPeriodo || 0),
    intereses: s.intereses + (l.interesesPeriodo || 0),
    prima: s.prima + (l.primaPeriodo || 0),
    vacaciones: s.vacaciones + (l.vacacionesPeriodo || 0),
  }), { neto: 0, descuentoCobros: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0 });
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
            <KPI icon="🔻" label="Descuento cobros de Bodega" value={fmtMoney(totales.descuentoCobros)} color={C.red} bg={C.redBg} />
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
              { key: "diasTrabajados", label: "Días trabajados (huellero)", align: "right", render: (f) => (
                <span style={{ fontWeight: 700, color: C.green }}>{f.diasTrabajados == null ? "—" : f.diasTrabajados}</span>
              ) },
              { key: "descuentoCobros", label: "Descuento cobros Bodega", align: "right", render: (f) => f.descuentoCobros > 0 ? <span style={{ color: C.red, fontWeight: 700 }}>-{fmtMoney(f.descuentoCobros)}</span> : <span style={{ color: C.slate }}>—</span> },
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
// ─── DEDUCCIONES (cobros de Bodega, descuento automatico en Nomina) ──────
function DeduccionesNominaView({ lotesConCobros, trabajadores }) {
  const [filtroEstado, setFiltroEstado] = useState("");
  const filas = [];
  (lotesConCobros || []).forEach((l) => {
    (l.cobrosBodega || []).forEach((c, idx) => {
      filas.push({
        id: `${l.id}__${idx}`,
        numLote: l.numLote,
        referencia: l.referencia,
        trabajadorNombre: c.trabajadorNombre || (trabajadores || []).find((t) => t.id === c.trabajadorId)?.nombre || "—",
        tipo: c.tipo || "—",
        valor: Number(c.valor) || 0,
        fecha: c.fecha || "",
        cobrado: c.cobrado === true,
        periodoIdCobrado: c.periodoIdCobrado || "",
      });
    });
  });
  const filasFiltradas = filas
    .filter((f) => !filtroEstado || (filtroEstado === "cobrado" ? f.cobrado : !f.cobrado))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const totalPendiente = filas.filter((f) => !f.cobrado).reduce((s, f) => s + f.valor, 0);
  const totalCobrado = filas.filter((f) => f.cobrado).reduce((s, f) => s + f.valor, 0);
  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Todos los cobros que Bodega registró contra un trabajador (Despachos Generales / Estado de Despacho) — se descuentan solos de la SIGUIENTE liquidación de ese trabajador, sin importar cuánto tiempo llevaban esperando.
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <KPI icon="⏳" label="Pendiente de cobrar" value={fmtMoney(totalPendiente)} color={C.amber} bg={C.amberBg} />
        <KPI icon="✅" label="Ya cobrado" value={fmtMoney(totalCobrado)} color={C.green} bg={C.greenBg} />
      </div>
      <div style={{ marginBottom: 16, maxWidth: 260 }}>
        <Field label="Filtrar por estado">
          <FSel value={filtroEstado} onChange={setFiltroEstado} options={[{ value: "pendiente", label: "Pendiente de cobrar" }, { value: "cobrado", label: "Cobrado" }]} placeholder="Todos" />
        </Field>
      </div>
      <Tabla
        vacio="No hay cobros de Bodega registrados."
        columnas={[
          { key: "numLote", label: "Lote", render: (f) => f.numLote || "—" },
          { key: "referencia", label: "Referencia", render: (f) => f.referencia || "—" },
          { key: "trabajadorNombre", label: "Trabajador" },
          { key: "tipo", label: "Motivo" },
          { key: "valor", label: "Valor", align: "right", render: (f) => fmtMoney(f.valor) },
          { key: "fecha", label: "Fecha del cobro", render: (f) => (f.fecha ? fmtFechaISO(f.fecha) : "—") },
          { key: "estado", label: "Estado", render: (f) => (f.cobrado ? (
            <span style={{ color: C.green, fontWeight: 700 }}>Cobrado en {f.periodoIdCobrado || "—"}</span>
          ) : (
            <span style={{ color: C.amber, fontWeight: 700 }}>Pendiente de cobrar</span>
          )) },
        ]}
        filas={filasFiltradas}
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
  // (2026-09-06, a pedido de Fredy) "Modo reparto": para procesos como
  // Bajada de Vinilo que en la practica se reparten entre varios
  // trabajadores usando distintos materiales/precios (ej. lote 7254:
  // Vinilo Alta a $300 y $215, DTF a $90, Poliamida a $85), la CANTIDAD
  // fisica de cada quien no es comparable 1 a 1 contra lo que Busint
  // reporta para el proceso completo -- pero el VALOR si reconcilia
  // exacto. En este modo cada trabajador no escribe una cantidad sino el
  // VALOR que se le paga, y el sistema calcula la "cantidad equivalente"
  // = valor / precio maximo del proceso (el mismo tope que ya se ve
  // arriba, ej. Busint en vivo). La SUMA de esas equivalentes si cuadra
  // con el total real de Busint -- sirve para el tope y las estadisticas
  // por lote/proceso, no para saber la cantidad fisica de cada persona.
  const [modoReparto, setModoReparto] = useState(false);
  const [repartoFilas, setRepartoFilas] = useState([]); // [{ id, trabajadorId, cantidad, precio }]
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
  const [avisandoDiseno, setAvisandoDiseno] = useState(false);
  const [avisoDisenoInfo, setAvisoDisenoInfo] = useState(null);
  // (2026-09-02, a pedido de Fredy) Editar un registro ya guardado --
  // antes solo se podía Borrar (admin) y volver a registrar de cero.
  const [modalEditar, setModalEditar] = useState(null);
  const [formEditar, setFormEditar] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  // (2026-09-06, a pedido de Fredy) Buscar por N° de Lote en "Últimos
  // registros" -- para poder ubicar y borrar un registro duplicado aunque
  // no esté entre los 15 más recientes (que es lo que se muestra por
  // defecto cuando el campo de búsqueda está vacío).
  const [filtroLoteRegistros, setFiltroLoteRegistros] = useState("");
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
  // mano después de buscar). "Vigente" = no está ya en BPT (terminado).
  // (2026-08-31) El bloqueo de "no pagar dos veces" ahora es POR
  // TRABAJADOR, no por lote+proceso en general -- Fredy pidió poder
  // repartir un mismo lote+proceso entre 2 trabajadores (ver
  // registroPrevio/otrosRegistrosLoteProceso más abajo).
  const loteAsociado = loteInfo?.encontrada && loteInfo.referencia === referencia.trim() ? loteInfo : null;
  // (2026-08-31) Movimientos reales de Busint (entradas/salidas) para el
  // lote que está vigente ahora mismo en el formulario -- si el usuario
  // cambia el número de lote sin volver a buscar, esto se ignora (mismo
  // criterio que loteAsociado). Solo mira "entradas": son las que indican
  // que ya se registró producción de ese proceso.
  const movimientosLoteVigente = movimientosLote && !movimientosLote.error && movimientosLote.numLote === numLote.trim() ? movimientosLote : null;
  // (2026-09-06, corregido a pedido de Fredy) Se usa "entradasPlantaPropia"
  // (solo Codplanta 1002) en vez de "entradas" (todas las plantas) -- ver
  // entradasLoteBusintBD en functions/index.js. Antes esto mezclaba
  // entradas de plantas externas/contratistas (ej. DTF, Sloand) con la
  // propia, que no tienen nada que ver con lo que se paga en Nomina.
  const entradaBusintProceso = movimientosLoteVigente && proceso
    ? (movimientosLoteVigente.entradasPlantaPropia || []).find((e) => normalizarProceso(e.proceso) === normalizarProceso(proceso) && Number(e.total) > 0)
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
  // (2026-09-06, a pedido de Fredy) Antes esto bloqueaba a CUALQUIERA
  // de registrar nómina sobre un lote que ya salió terminado a bodega.
  // Fredy (admin) necesita poder corregir errores ya identificados sobre
  // lotes que ya se despacharon (ej. una tarifa mal pagada) -- así que
  // ahora el bloqueo real solo aplica a las líderes; al admin se le
  // avisa igual (loteTerminado) pero se le deja guardar.
  const loteTerminado = !!(loteAsociado && !loteAsociado.vigente);
  const loteBloqueado = loteTerminado && !isAdmin;
  // (2026-08-31) Fredy pidió permitir que un mismo lote+proceso se reparta
  // entre 2 (o más) trabajadores -- el bloqueo de "no pagar dos veces" ahora
  // solo mira si es EL MISMO trabajador quien ya cobró este proceso en este
  // lote, no si CUALQUIER trabajador ya lo registró.
  const registroPrevio = loteAsociado && proceso ? (produccionCompleta || []).find((p) => p.numLote === loteAsociado.numLote && p.proceso === proceso && p.trabajadorId === trabajadorId) : null;
  // Informativo (no bloquea): otros trabajadores que ya registraron parte de
  // este mismo lote+proceso -- para que quien reparte el lote vea cuánto ya
  // se repartió y no se pase de lo cortado.
  const otrosRegistrosLoteProceso = loteAsociado && proceso
    ? (produccionCompleta || []).filter((p) => p.numLote === loteAsociado.numLote && p.proceso === proceso && p.trabajadorId !== trabajadorId)
    : [];
  // (2026-08-31) Fredy pidió además un tope: la SUMA de lo que registren
  // entre todos los trabajadores para este mismo lote+proceso no puede
  // superar la cantidad cortada del lote (loteInfo.cantCortada). Si el lote
  // no trae cantCortada (dato faltante en Busint), no se aplica el tope —
  // no hay con qué compararlo.
  // (2026-09-06, corregido a pedido de Fredy) Un proceso puntual puede
  // haber recibido MENOS unidades que las que se cortaron originalmente
  // (insumos faltantes, danos en Confeccion -- casos reales confirmados:
  // Lote 7254 Bajada de Vinilo solo 396 de 432 cortadas; Lote 7225 Postura
  // Dije/Terminacion solo 126 de 140 cortadas). Por eso, si Busint YA tiene
  // una entrada real (planta propia) para ESTE proceso puntual, se usa ese
  // numero como tope -- es mas preciso que el "Cant. Cortada" general del
  // lote completo. Si todavia no hay ese dato (consulta en curso, o Busint
  // no tiene aun ninguna entrada de este proceso), se cae de respaldo al
  // Cant. Cortada general, igual que antes -- mejor un tope de mas que
  // ningun tope.
  const cantCortadaEsPorProceso = !!(entradaBusintProceso && Number(entradaBusintProceso.total) > 0);
  const cantCortadaLote = cantCortadaEsPorProceso
    ? Number(entradaBusintProceso.total)
    : loteAsociado
    ? Number(loteAsociado.cantCortada) || 0
    : 0;
  const etiquetaCantCortada = cantCortadaEsPorProceso
    ? `lo que Busint tiene registrado para este proceso (${fmtNum(cantCortadaLote)})`
    : `lo cortado del lote (${fmtNum(cantCortadaLote)})`;
  const totalRegistradoLoteProceso = otrosRegistrosLoteProceso.reduce((acc, p) => acc + (Number(p.cantidad) || 0), 0);
  const cantidadDisponibleLoteProceso = cantCortadaLote > 0 ? Math.max(0, cantCortadaLote - totalRegistradoLoteProceso) : null;
  const excedeCantidadLote = !!(loteAsociado && proceso && cantCortadaLote > 0 && Number(cantidad) > 0 && (totalRegistradoLoteProceso + Number(cantidad)) > cantCortadaLote);
  // (2026-09-06, a pedido de Fredy) Derivados del "modo reparto" -- ver
  // comentario junto al estado modoReparto/repartoFilas mas arriba.
  // precioMaximoReparto es el mismo precio tope que ya se calcula en
  // costoAplicaA (Busint en vivo > Lote+Proceso > Referencia+Proceso >
  // Proceso generico) -- se reusa como divisor valor/cantidad.
  const precioMaximoReparto = costoAplicaA ? Number(costoAplicaA.costoFT) || 0 : 0;
  function cantidadEquivalenteReparto(valor) {
    return precioMaximoReparto > 0 ? (Number(valor) || 0) / precioMaximoReparto : 0;
  }
  // (2026-09-06, a pedido de Fredy) La lider coloca cantidad + precio de
  // cada trabajador -- igual que en el modo normal -- en vez de un valor
  // total ya calculado; el valor real sale solo de cantidad x precio.
  function valorFilaReparto(f) {
    return (Number(f.cantidad) || 0) * (Number(f.precio) || 0);
  }
  const repartoFilasValidas = repartoFilas.filter((f) => f.trabajadorId && Number(f.cantidad) > 0 && Number(f.precio) > 0);
  const sumaValorReparto = repartoFilasValidas.reduce((acc, f) => acc + valorFilaReparto(f), 0);
  const sumaEquivalenteReparto = repartoFilasValidas.reduce((acc, f) => acc + cantidadEquivalenteReparto(valorFilaReparto(f)), 0);
  // Igual que registroPrevio, pero por cada fila del reparto -- no se le
  // puede pagar dos veces a la misma persona este lote+proceso.
  const repartoConDuplicado = loteAsociado && proceso
    ? repartoFilasValidas.find((f) => (produccionCompleta || []).some((p) => p.numLote === loteAsociado.numLote && p.proceso === proceso && p.trabajadorId === f.trabajadorId))
    : null;
  // Tolerancia de 1 unidad equivalente por redondeos de valores en pesos.
  const excedeCantidadLoteReparto = !!(loteAsociado && proceso && cantCortadaLote > 0 && (totalRegistradoLoteProceso + sumaEquivalenteReparto) > cantCortadaLote + 1);
  const puedeGuardarReparto = modoReparto && precioMaximoReparto > 0 && repartoFilasValidas.length > 0 && !guardando && !loteBloqueado && !repartoConDuplicado && !excedeCantidadLoteReparto;
  // (2026-09-03, a pedido de Fredy) Aviso de posible duplicado: mismo
  // trabajador + mismo proceso + misma cantidad + mismo total ya
  // registrado en los últimos 7 días -- a diferencia de
  // "registroPrevio" (que solo compara dentro del mismo lote buscado),
  // esto también agarra el caso de registrar SIN buscar lote, que fue
  // como se coló un duplicado real (mismo proceso/cantidad/total del
  // día siguiente, sin lote ni referencia -- ver Historial de
  // Trabajador). Es solo un AVISO, no bloquea guardar, porque a veces
  // sí se repite el mismo proceso con la misma cantidad en días
  // distintos (ej. el mismo lote se corta y reparte por partes).
  const posibleDuplicado = trabajadorId && proceso && Number(cantidad) > 0 && Number(precioReal) > 0
    ? (produccionCompleta || []).find((p) =>
        p.trabajadorId === trabajadorId &&
        p.proceso === proceso &&
        Number(p.cantidad) === Number(cantidad) &&
        Number(p.total) === total &&
        p.fecha && fecha && diasEntre(p.fecha, fecha) <= 7
      )
    : null;
  const puedeGuardar = trabajadorId && proceso && Number(cantidad) > 0 && Number(precioReal) > 0 && !guardando && !excedeCostoTeorico && !loteBloqueado && !registroPrevio && !excedeCantidadLote;
  // (2026-08-31) Fredy pidió que cuando un proceso no tenga NINGÚN precio
  // máximo configurado (ni Busint en vivo, ni Excel, ni catálogo), se avise
  // automáticamente por correo al área de Diseño para que lo costeen --
  // dispara sola, sin botón, un momento después de que el usuario deja de
  // escribir/cambiar Proceso o Referencia (mismo patrón de auto-carga que
  // ya se usa para costoTeorico/costosProcesoBusint). El backend se encarga
  // de no repetir el aviso para la misma Referencia+Proceso.
  const sinPrecioMaximoAlguno = !!(
    proceso && referencia.trim() &&
    !costoBusintProceso && !costoProcesoEspecifico && !costoRefProceso && !costoProcesoGenerico &&
    !buscandoCosto && !buscandoCostosProcesoBusint &&
    !(costosProcesoBusint && costosProcesoBusint.error)
  );
  useEffect(() => {
    if (!sinPrecioMaximoAlguno) return;
    const key = `${referencia.trim().toUpperCase()}__${proceso.trim().toUpperCase()}`;
    if (avisoDisenoInfo?._key === key) return;
    const timer = setTimeout(async () => {
      setAvisandoDiseno(true);
      try {
        const trabajadorActual = trabajadores.find((tr) => tr.id === trabajadorId);
        const llamar = httpsCallable(functionsClient, "avisarProcesoSinPrecioMaximo");
        const resp = await llamar({
          referencia: referencia.trim(),
          proceso,
          numLote: numLote.trim(),
          trabajadorNombre: trabajadorActual?.nombre || "",
        });
        setAvisoDisenoInfo({ ...resp.data, _key: key });
      } catch (err) {
        setAvisoDisenoInfo({ error: err?.message || String(err), _key: key });
      } finally {
        setAvisandoDiseno(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [sinPrecioMaximoAlguno, referencia, proceso]);
  // (2026-09-02, a pedido de Fredy) Ventana editable: quincena en curso
  // o la anterior -- así una líder puede corregir un error reciente sin
  // poder tocar algo de meses atrás ya liquidado. Un admin no tiene este
  // límite (misma confianza que ya tiene con Borrar).
  const quincenaActualProd = quincenaDe(0);
  const quincenaAnteriorProd = quincenaDe(-1);
  function puedeEditarFila(f) {
    if (isAdmin) return true;
    return f.fecha >= quincenaAnteriorProd.desde && f.fecha <= quincenaActualProd.hasta;
  }
  function abrirEditar(f) {
    setModalEditar(f);
    setFormEditar({
      trabajadorId: f.trabajadorId || "",
      fecha: f.fecha || today(),
      proceso: f.proceso || "",
      referencia: f.referencia || "",
      numLote: f.numLote || "",
      cantidad: f.cantidad != null ? String(f.cantidad) : "",
      precioReal: f.precioUnidad != null ? String(f.precioUnidad) : "",
    });
  }
  const puedeGuardarEdicion = !!(
    formEditar && formEditar.trabajadorId && formEditar.proceso &&
    Number(formEditar.cantidad) > 0 && Number(formEditar.precioReal) > 0 && !guardandoEdicion
  );
  async function guardarEdicion() {
    if (!puedeGuardarEdicion || !modalEditar) return;
    setGuardandoEdicion(true);
    try {
      const trabajador = trabajadores.find((t) => t.id === formEditar.trabajadorId);
      const cant = Number(formEditar.cantidad) || 0;
      const precio = Number(formEditar.precioReal) || 0;
      await onGuardar({
        ...modalEditar,
        trabajadorId: formEditar.trabajadorId,
        trabajadorNombre: trabajador?.nombre || modalEditar.trabajadorNombre || "",
        fecha: formEditar.fecha,
        proceso: formEditar.proceso,
        referencia: formEditar.referencia.trim(),
        numLote: formEditar.numLote.trim() || null,
        cantidad: cant,
        precioUnidad: precio,
        total: cant * precio,
        editadoPor: currentUser?.name || currentUser?.username || "",
        editadoEn: new Date().toISOString(),
      });
      setModalEditar(null);
      setFormEditar(null);
    } finally {
      setGuardandoEdicion(false);
    }
  }
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
  async function guardarReparto() {
    if (!puedeGuardarReparto) return;
    setGuardando(true);
    try {
      const repartoId = uid();
      for (const f of repartoFilasValidas) {
        const trabajador = trabajadores.find((t) => t.id === f.trabajadorId);
        await onGuardar({
          id: uid(),
          trabajadorId: f.trabajadorId,
          trabajadorNombre: trabajador?.nombre || "",
          fecha,
          proceso,
          referencia: referencia.trim(),
          numLote: loteInfo?.encontrada && loteInfo.referencia === referencia.trim() ? loteInfo.numLote : null,
          numPedido: loteInfo?.encontrada && loteInfo.referencia === referencia.trim() ? loteInfo.numPedido : null,
          cantidad: cantidadEquivalenteReparto(valorFilaReparto(f)),
          precioUnidad: precioMaximoReparto,
          total: valorFilaReparto(f),
          modoReparto: true,
          repartoId,
          creadoPor: currentUser?.name || currentUser?.username || "",
          creadoEn: new Date().toISOString(),
        });
      }
      setReferencia("");
      setRepartoFilas([]);
      setModoReparto(false);
      setCostoTeorico(null);
      setNumLote("");
      setLoteInfo(null);
    } finally {
      setGuardando(false);
    }
  }
  const filtroLoteRegistrosTrim = filtroLoteRegistros.trim();
  const recientes = filtroLoteRegistrosTrim
    ? [...produccion]
        .filter((p) => (p.numLote || "").trim() === filtroLoteRegistrosTrim)
        .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creadoEn || "").localeCompare(a.creadoEn || ""))
    : [...produccion].sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || "")).slice(0, 15);
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
        {loteTerminado && (
          <div style={{ fontSize: 12, color: loteBloqueado ? "#b91c1c" : C.amber, fontWeight: 700, marginBottom: 12 }}>
            {loteBloqueado
              ? `El lote ${loteAsociado.numLote} ya salió terminado a bodega — no se puede registrar nómina sobre un lote que ya se terminó.`
              : `⚠️ El lote ${loteAsociado.numLote} ya salió terminado a bodega. Por ser administrador puedes registrar de todas formas -- verifica que sea intencional (ej. corregir un error ya identificado).`}
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
          <div style={{ padding: "10px 14px", background: C.amberBg, borderRadius: 8, color: C.amber, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            ⚠️ No hay un precio máximo configurado para este proceso — comunícate con el área de Diseño. Puedes registrar el precio libremente mientras tanto.
            {referencia.trim() && (
              <div style={{ fontWeight: 600, marginTop: 4, fontSize: 11 }}>
                {avisandoDiseno
                  ? "Avisando a Diseño por correo..."
                  : avisoDisenoInfo?.enviado
                  ? `✅ Se avisó por correo a Diseño (${(avisoDisenoInfo.correos || []).join(", ")}).`
                  : avisoDisenoInfo?.yaAvisado
                  ? "✅ Ya se le había avisado antes a Diseño de este proceso — están al tanto."
                  : avisoDisenoInfo?.motivo === "sin_correos"
                  ? "⚠️ No se pudo avisar: falta el correo de Dayana Delgado o Daniel Mejía en Usuarios."
                  : avisoDisenoInfo?.error
                  ? `⚠️ No se pudo avisar por correo: ${avisoDisenoInfo.error}`
                  : ""}
              </div>
            )}
          </div>
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
            El proceso "{proceso}" del lote {loteAsociado.numLote} ya le fue pagado a este trabajador ({registroPrevio.trabajadorNombre}, {fmtFechaISO(registroPrevio.fecha)}) — no se le puede pagar dos veces a la misma persona.
          </div>
        )}
        {/* (2026-08-31) Informativo -- otros trabajadores que ya se
            repartieron este mismo lote+proceso. No bloquea puedeGuardar. */}
        {otrosRegistrosLoteProceso.length > 0 && (
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 600, marginBottom: 10, background: C.blueBg, borderRadius: 8, padding: "8px 12px" }}>
            ℹ️ Este proceso del lote {loteAsociado.numLote} ya se repartió con otro(s) trabajador(es): {otrosRegistrosLoteProceso.map((p) => `${p.trabajadorNombre} (${fmtNum(p.cantidad)} und)`).join(", ")}.
            {cantidadDisponibleLoteProceso != null && ` Quedan ${fmtNum(cantidadDisponibleLoteProceso)} und disponibles de ${etiquetaCantCortada}.`}
          </div>
        )}
        {/* (2026-08-31) Bloquea puedeGuardar -- la suma entre todos los
            trabajadores para este lote+proceso no puede superar lo
            cortado. */}
        {excedeCantidadLote && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 10 }}>
            La suma de este proceso en el lote {loteAsociado.numLote} ({fmtNum(totalRegistradoLoteProceso)} ya registradas + {fmtNum(Number(cantidad))} que estás por guardar) supera {etiquetaCantCortada} — no se puede guardar.
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
        {/* (2026-09-03, a pedido de Fredy) Aviso informativo -- NO
            bloquea puedeGuardar. Mismo trabajador+proceso+cantidad+total
            ya registrado en los últimos 7 días, con o sin lote. */}
        {posibleDuplicado && (
          <div style={{ padding: "10px 14px", background: C.amberBg, borderRadius: 8, color: C.amber, fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            ⚠️ Posible duplicado: a {trabajadores.find((t) => t.id === trabajadorId)?.nombre || "este trabajador"} ya se le registró el mismo proceso "{proceso}", {fmtNum(Number(cantidad))} unidades por {fmtMoney(total)}, el {fmtFechaISO(posibleDuplicado.fecha)}{posibleDuplicado.numLote ? ` (lote ${posibleDuplicado.numLote})` : ""}. Verifica que no sea el mismo trabajo antes de guardar otra vez.
          </div>
        )}
        {movimientosLote?.error && (
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se pudo verificar contra Busint si ya hay una entrada de este proceso: {movimientosLote.error}</div>
        )}
        {proceso && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: C.ink, fontWeight: 600, marginBottom: 10 }}>
            <input type="checkbox" checked={modoReparto} onChange={(e) => { setModoReparto(e.target.checked); setRepartoFilas([]); }} />
            Este proceso se repartió entre varios trabajadores (distintos materiales/precios)
          </label>
        )}
        {modoReparto ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>
              El trabajador de arriba no se usa en este modo -- agrega cada trabajador con la cantidad que hizo y el precio de su material. La cantidad equivalente se calcula sola (cantidad x precio, dividido entre el precio máximo) y es la que sirve para no pasarse del tope y para las estadísticas del lote/proceso.
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 8 }}>
              Precio máximo (divisor): {precioMaximoReparto > 0 ? fmtMoney(precioMaximoReparto) : "Sin precio máximo todavía -- no se puede repartir"}
            </div>
            {repartoFilas.map((f) => {
              const trabajadorFila = trabajadores.find((t) => t.id === f.trabajadorId);
              const yaRegistrado = !!(loteAsociado && proceso && f.trabajadorId && (produccionCompleta || []).some((p) => p.numLote === loteAsociado.numLote && p.proceso === proceso && p.trabajadorId === f.trabajadorId));
              const valorFila = valorFilaReparto(f);
              return (
                <div key={f.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.9fr auto", gap: 8, alignItems: "end" }}>
                    <Field label="Trabajador">
                      <FSel value={f.trabajadorId} onChange={(v) => setRepartoFilas((rs) => rs.map((r) => (r.id === f.id ? { ...r, trabajadorId: v } : r)))} options={trabajadoresActivos.map((t) => ({ value: t.id, label: t.nombre }))} />
                    </Field>
                    <Field label="Cantidad"><FInput type="number" value={f.cantidad} onChange={(v) => setRepartoFilas((rs) => rs.map((r) => (r.id === f.id ? { ...r, cantidad: v } : r)))} placeholder="Unidades" /></Field>
                    <Field label="Precio"><FInput type="number" value={f.precio} onChange={(v) => setRepartoFilas((rs) => rs.map((r) => (r.id === f.id ? { ...r, precio: v } : r)))} placeholder="Precio unidad" /></Field>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", marginBottom: 6 }}>Cant. equivalente</div>
                      <div style={{ padding: "9px 12px", background: C.canvas, borderRadius: 8, fontWeight: 800, color: C.ink, fontSize: 13 }}>{precioMaximoReparto > 0 ? cantidadEquivalenteReparto(valorFila).toFixed(2) : "—"}{valorFila > 0 ? ` (${fmtMoney(valorFila)})` : ""}</div>
                    </div>
                    <Btn small variant="secondary" onClick={() => setRepartoFilas((rs) => rs.filter((r) => r.id !== f.id))}>✕</Btn>
                  </div>
                  {yaRegistrado && (
                    <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700, marginTop: 2 }}>
                      A {trabajadorFila?.nombre || "este trabajador"} ya se le pagó este proceso en este lote -- no se le puede pagar dos veces.
                    </div>
                  )}
                </div>
              );
            })}
            <Btn small variant="secondary" onClick={() => setRepartoFilas((rs) => [...rs, { id: uid(), trabajadorId: "", cantidad: "", precio: "" }])} disabled={precioMaximoReparto <= 0}>+ Agregar trabajador</Btn>
            {repartoFilasValidas.length > 0 && (
              <div style={{ fontSize: 12, color: C.slate, marginTop: 10 }}>
                Suma repartida: {fmtMoney(sumaValorReparto)} → {sumaEquivalenteReparto.toFixed(2)} unidades equivalentes{cantCortadaLote > 0 && ` de ${etiquetaCantCortada}`}.
              </div>
            )}
            {excedeCantidadLoteReparto && (
              <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginTop: 6 }}>
                Esa suma ({fmtNum(totalRegistradoLoteProceso)} ya registradas + {sumaEquivalenteReparto.toFixed(2)} de este reparto) supera {etiquetaCantCortada} -- no se puede guardar.
              </div>
            )}
            {repartoConDuplicado && (
              <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginTop: 6 }}>
                Ya hay una fila con un trabajador que ya cobró este proceso en este lote -- revisa arriba antes de guardar.
              </div>
            )}
          </div>
        ) : (
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
        )}
        {!proceso && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>Selecciona un proceso.</div>}
        {excedeCostoTeorico && (
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginBottom: 10 }}>
            Ese precio ({fmtMoney(Number(precioReal))}) supera el máximo permitido para este proceso: {fmtMoney(costoAplicaA.costoFT)}. No se puede guardar.
          </div>
        )}
        <Btn onClick={modoReparto ? guardarReparto : guardar} disabled={modoReparto ? !puedeGuardarReparto : !puedeGuardar}>{guardando ? "Guardando..." : modoReparto ? "Registrar Reparto" : "Registrar Producción"}</Btn>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: C.ink }}>
          {filtroLoteRegistrosTrim ? `REGISTROS DEL LOTE ${filtroLoteRegistrosTrim} (${recientes.length})` : "ÚLTIMOS REGISTROS"}
        </div>
        <div style={{ width: 240 }}>
          <FInput value={filtroLoteRegistros} onChange={setFiltroLoteRegistros} placeholder="Buscar por N° de Lote" />
        </div>
      </div>
      <Tabla
        vacio={filtroLoteRegistrosTrim ? "Sin registros de producción para ese lote." : "Sin registros de producción todavía."}
        columnas={[
          { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
          { key: "trabajadorNombre", label: "Trabajador" },
          { key: "proceso", label: "Proceso" },
          { key: "numLote", label: "Lote", render: (f) => f.numLote || "—" },
          { key: "referencia", label: "Referencia", render: (f) => f.referencia || "—" },
          { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
          { key: "precioUnidad", label: "Precio/Und", align: "right", render: (f) => fmtMoney(f.precioUnidad) },
          { key: "total", label: "Total", align: "right", render: (f) => fmtMoney(f.total) },
          {
            key: "acciones", label: "", align: "right",
            render: (f) => (
              <span style={{ display: "inline-flex", gap: 12 }}>
                {puedeEditarFila(f) && <span onClick={(e) => { e.stopPropagation(); abrirEditar(f); }} style={{ cursor: "pointer", color: C.blue, fontWeight: 700 }}>Editar</span>}
                {isAdmin && <span onClick={(e) => { e.stopPropagation(); onBorrar(f.id); }} style={{ cursor: "pointer", color: C.red, fontWeight: 700 }}>Borrar</span>}
              </span>
            ),
          },
        ]}
        filas={recientes}
      />
      {modalEditar && formEditar && (
        <Modal title="Editar registro de producción" onClose={() => { setModalEditar(null); setFormEditar(null); }} width={480}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Trabajador">
              <FSel value={formEditar.trabajadorId} onChange={(v) => setFormEditar((s) => ({ ...s, trabajadorId: v }))} options={trabajadoresActivos.map((t) => ({ value: t.id, label: t.nombre }))} />
            </Field>
            <Field label="Fecha"><FInput type="date" value={formEditar.fecha} onChange={(v) => setFormEditar((s) => ({ ...s, fecha: v }))} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Proceso">
              <FSel value={formEditar.proceso} onChange={(v) => setFormEditar((s) => ({ ...s, proceso: v }))} options={precios.map((p) => ({ value: p.proceso, label: p.proceso }))} />
            </Field>
            <Field label="N° de Lote"><FInput value={formEditar.numLote} onChange={(v) => setFormEditar((s) => ({ ...s, numLote: v }))} placeholder="Ej: 7150" /></Field>
          </div>
          <Field label="Referencia"><FInput value={formEditar.referencia} onChange={(v) => setFormEditar((s) => ({ ...s, referencia: v }))} placeholder="Ej: CK3000" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Cantidad"><FInput type="number" value={formEditar.cantidad} onChange={(v) => setFormEditar((s) => ({ ...s, cantidad: v }))} /></Field>
            <Field label="Precio real (por unidad)"><FInput type="number" value={formEditar.precioReal} onChange={(v) => setFormEditar((s) => ({ ...s, precioReal: v }))} /></Field>
          </div>
          <div style={{ fontSize: 12, color: C.slate, fontWeight: 700, marginBottom: 14 }}>Nuevo total: {fmtMoney((Number(formEditar.cantidad) || 0) * (Number(formEditar.precioReal) || 0))}</div>
          <Btn onClick={guardarEdicion} disabled={!puedeGuardarEdicion}>{guardandoEdicion ? "Guardando..." : "Guardar cambios"}</Btn>
        </Modal>
      )}
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
// ─── HISTORIAL DE LOTE (qué se ha registrado en Nómina para un lote) ──────
// (2026-08-31) Fredy pidió, después de que un trabajador registre un lote,
// una pantalla donde se pueda ver -- pensado sobre todo para revisar cómo
// quedó un lote que se repartió entre varios trabajadores (ver el tope por
// cantidad cortada agregado arriba). Muestra TODOS los trabajadores que
// registraron algo de este lote, sin importar su área -- mismo criterio que
// ya se usa en Registrar Producción, donde un líder ya ve el nombre de
// cualquier trabajador que compartió un lote con su gente.
function HistorialLoteView({ produccion }) {
  const [numLote, setNumLote] = useState("");
  const [loteInfo, setLoteInfo] = useState(null);
  const [buscandoLote, setBuscandoLote] = useState(false);

  async function buscarLote() {
    const n = numLote.trim();
    if (!n) { setLoteInfo(null); return; }
    setBuscandoLote(true);
    setLoteInfo(null);
    try {
      const llamar = httpsCallable(functionsClient, "getLoteBusintPorNumero");
      const resp = await llamar({ numLote: n });
      setLoteInfo(resp.data);
    } catch (err) {
      setLoteInfo({ error: err?.message || String(err) });
    } finally {
      setBuscandoLote(false);
    }
  }

  const registros = numLote.trim()
    ? (produccion || [])
        .filter((p) => p.numLote === numLote.trim())
        .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") || (a.proceso || "").localeCompare(b.proceso || ""))
    : [];
  const totalGeneral = registros.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const procesosDistintos = new Set(registros.map((r) => r.proceso)).size;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Busca un número de lote para ver todo lo que ya se ha registrado en Nómina para ese lote -- qué procesos, quién los hizo, cuánto y cuándo. Útil para revisar cómo va o cómo quedó repartido un lote entre varios trabajadores.
      </div>
      <Field label="N° de Lote">
        <div style={{ display: "flex", gap: 6, maxWidth: 320 }}>
          <FInput type="number" value={numLote} onChange={(v) => { setNumLote(v); setLoteInfo(null); }} placeholder="Ej: 7250" />
          <Btn small onClick={buscarLote} disabled={!numLote.trim() || buscandoLote}>{buscandoLote ? "..." : "🔍 Buscar"}</Btn>
        </div>
      </Field>
      {loteInfo?.error && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se pudo consultar el lote en Busint: {loteInfo.error}</div>}
      {loteInfo && !loteInfo.error && !loteInfo.encontrada && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600, marginBottom: 10 }}>No se encontró ese lote en Busint (igual se muestra abajo lo que haya registrado en Nómina).</div>}
      {loteInfo?.encontrada && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, padding: "10px 12px", background: C.canvas, borderRadius: 8, marginBottom: 16, fontSize: 12, maxWidth: 700 }}>
          <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>REFERENCIA</div><div style={{ fontWeight: 700 }}>{loteInfo.referencia || "—"}</div></div>
          <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>PEDIDO</div><div style={{ fontWeight: 700 }}>{loteInfo.numPedido || "—"}</div></div>
          <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>CLIENTE</div><div style={{ fontWeight: 700 }}>{loteInfo.nombreCliente || "—"}</div></div>
          <div><div style={{ color: C.slate, fontSize: 10, fontWeight: 700 }}>CANT. CORTADA</div><div style={{ fontWeight: 700 }}>{fmtNum(loteInfo.cantCortada)}</div></div>
        </div>
      )}
      {numLote.trim() && registros.length === 0 && <div style={{ fontSize: 12, color: C.slate }}>Todavía no hay nada registrado en Nómina para este lote.</div>}
      {registros.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <KPI icon="🧵" label="Procesos registrados" value={fmtNum(procesosDistintos)} color={C.blue} bg={C.blueBg} />
            <KPI icon="💵" label="Total pagado (hasta ahora)" value={fmtMoney(totalGeneral)} color={C.green} bg={C.greenBg} />
          </div>
          <Tabla
            vacio="Sin registros."
            columnas={[
              { key: "proceso", label: "Proceso" },
              { key: "trabajadorNombre", label: "Trabajador" },
              { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
              { key: "precioUnidad", label: "Precio unidad", align: "right", render: (f) => fmtMoney(f.precioUnidad) },
              { key: "total", label: "Total", align: "right", render: (f) => <strong>{fmtMoney(f.total)}</strong> },
              { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
            ]}
            filas={registros}
          />
        </>
      )}
    </div>
  );
}
// ─── HISTORIAL DE TRABAJADOR (su nómina a través de los distintos lotes) ──
// (2026-08-31) Segunda parte del mismo pedido de Fredy: ver todo lo que un
// trabajador ha registrado en distintos lotes. Marca cada registro con si
// ya quedó dentro de una quincena de "Nómina Destajo" ya confirmada
// (mismo periodoId que usa NominaDestajoView -- AAAA-MM-Q1/Q2) o si sigue
// pendiente de liquidar -- Fredy pidió explícitamente tener en cuenta el
// cierre de mes de la Nómina Destajo. El estado de liquidación solo
// aplica a trabajadores tipo "Destajo" (los únicos que NominaDestajoView
// liquida); para los demás no se muestra esa columna.
function periodoQuincenaDeFecha(fecha) {
  if (!fecha) return null;
  const partes = String(fecha).split("-");
  if (partes.length !== 3) return null;
  const [anio, mes, dia] = partes;
  const quincena = Number(dia) <= 15 ? "1" : "2";
  return `${anio}-${mes}-Q${quincena}`;
}
function HistorialTrabajadorView({ trabajadores, produccion, liquidaciones }) {
  const [trabajadorId, setTrabajadorId] = useState("");
  const trabajador = trabajadores.find((t) => t.id === trabajadorId);
  const esDestajo = trabajador?.tipoNomina === "Destajo";

  const registros = trabajadorId
    ? (produccion || []).filter((p) => p.trabajadorId === trabajadorId).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    : [];
  const registrosConEstado = registros.map((r) => {
    const periodoId = periodoQuincenaDeFecha(r.fecha);
    const liquidado = periodoId ? (liquidaciones || []).some((l) => l.periodoId === periodoId && l.trabajadorId === trabajadorId) : false;
    return { ...r, _periodoId: periodoId, _liquidado: liquidado };
  });
  const totalHistorico = registros.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const totalPendiente = registrosConEstado.filter((r) => !r._liquidado).reduce((s, r) => s + (Number(r.total) || 0), 0);
  const lotesDistintos = new Set(registros.map((r) => r.numLote).filter(Boolean)).size;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 16, maxWidth: 780 }}>
        Elige un trabajador para ver todo lo que ha registrado en Registrar Producción, en todos los lotes -- si es de tipo "Destajo", cada registro se marca según si ya quedó dentro de una quincena de Nómina Destajo ya confirmada o si sigue pendiente de liquidar.
      </div>
      <Field label="Trabajador">
        <FSel value={trabajadorId} onChange={setTrabajadorId} options={[{ value: "", label: "Selecciona..." }, ...trabajadores.map((t) => ({ value: t.id, label: t.nombre }))]} />
      </Field>
      {trabajadorId && (
        <>
          <div style={{ display: "flex", gap: 14, margin: "16px 0", flexWrap: "wrap" }}>
            <KPI icon="📦" label="Lotes distintos" value={fmtNum(lotesDistintos)} color={C.blue} bg={C.blueBg} />
            <KPI icon="💵" label="Total histórico" value={fmtMoney(totalHistorico)} color={C.violet} bg={C.violetBg} />
            {esDestajo && <KPI icon="⏳" label="Pendiente de liquidar" value={fmtMoney(totalPendiente)} color={C.amber} bg={C.amberBg} />}
          </div>
          {!esDestajo && (
            <div style={{ fontSize: 11, color: C.slate, marginBottom: 10 }}>Este trabajador no es tipo "Destajo" -- el estado de liquidación de Nómina Destajo no aplica acá, solo se muestra su histórico de registros.</div>
          )}
          {registros.length === 0 ? (
            <div style={{ fontSize: 12, color: C.slate }}>{trabajador?.nombre || "Este trabajador"} todavía no tiene producción registrada.</div>
          ) : (
            <Tabla
              vacio="Sin registros."
              columnas={[
                { key: "fecha", label: "Fecha", render: (f) => fmtFechaISO(f.fecha) },
                { key: "numLote", label: "Lote", render: (f) => f.numLote || "—" },
                { key: "proceso", label: "Proceso" },
                { key: "referencia", label: "Referencia", render: (f) => f.referencia || "—" },
                { key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
                { key: "total", label: "Total", align: "right", render: (f) => <strong>{fmtMoney(f.total)}</strong> },
                ...(esDestajo ? [{ key: "_liquidado", label: "Estado", render: (f) => f._liquidado
                  ? <span style={{ color: C.green, fontWeight: 700, fontSize: 11 }}>✅ Liquidado ({f._periodoId})</span>
                  : <span style={{ color: C.amber, fontWeight: 700, fontSize: 11 }}>⏳ Pendiente</span> }] : []),
              ]}
              filas={registrosConEstado}
            />
          )}
        </>
      )}
    </div>
  );
}
export default function ModuloNomina({ currentUser, onVolver, onLogout, soloNovedades, puedeEditarCatalogos }) {
  // Líder de área (hoy: Anny Beltrán y Sarai Méndez, cada una con su Área
  // Interna real -- ver Administrativo → Área Interna): entra con un panel
  // reducido, ya filtrado a su propia gente, en vez del panel completo de
  // admin (nada de Trabajadores/Precios ni ver otras áreas). Se define con
  // el campo "Área de Nómina" del usuario (mismo valor que la Área Interna
  // del trabajador), puesto por un admin en Administrador General → Usuarios.
  const areaLider = !currentUser?.isAdmin && currentUser?.areaNomina ? currentUser.areaNomina : null;
  const [subView, setSubView] = useState(() => (areaLider ? "produccion" : soloNovedades ? "ausencias" : "dashboard"));
  // Qué grupos del menú están desplegados — si un grupo todavía no se ha
  // tocado (no está en este objeto), se abre solo si contiene el subView
  // activo; una vez el usuario le da clic, queda como él lo dejó.
  const [gruposAbiertos, setGruposAbiertos] = useState({});
  const [trabajadores, setTrabajadores] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [areasNomina, setAreasNomina] = useState([]);
  const [areasTNS, setAreasTNS] = useState([]);
  const [zonasNomina, setZonasNomina] = useState([]);
  const [motivosAusencia, setMotivosAusencia] = useState([]);
  const [motivosAusenciaCargado, setMotivosAusenciaCargado] = useState(false);
  const [turnos, setTurnos] = useState([]);
  const [gruposTrabajo, setGruposTrabajo] = useState([]);
  const [produccion, setProduccion] = useState([]);
  const [horas, setHoras] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [costosTeoricoProceso, setCostosTeoricoProceso] = useState([]);
  const [ausencias, setAusencias] = useState([]);
  const [faltasSinJustificar, setFaltasSinJustificar] = useState([]);
  const [diasTrabajadosHuellero, setDiasTrabajadosHuellero] = useState([]);
  const [liquidacionesF, setLiquidacionesF] = useState([]);
  const [liquidacionesFD, setLiquidacionesFD] = useState([]);
  const [liquidacionesD, setLiquidacionesD] = useState([]);
  // (2026-09-10, a pedido de Fredy) Cobros que Bodega registra contra un
  // trabajador (Despachos Generales / Estado de Despacho) -- Nomina los lee
  // de la MISMA coleccion que ya usa Bodega/Contabilidad, sin duplicar nada.
  const [lotesConCobros, setLotesConCobros] = useState([]);
  // (2026-09-02, a pedido de Fredy) Solo para el encadenamiento automático
  // Dije -> Terminación (ver guardarProduccion/encadenarDijeATerminacion
  // más abajo): quién es la líder dueña de "Terminación" (por areaNomina)
  // y qué ya está programado en Planeación, para no duplicar.
  const [usuariosApp, setUsuariosApp] = useState([]);
  const [programacionesProcesos, setProgramacionesProcesos] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "nomina_trabajadores"), (snap) => { setTrabajadores(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setLoading(false); }),
      onSnapshot(collection(db, "nomina_precios_proceso"), (snap) => setPrecios(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_areas"), (snap) => setAreasNomina(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_areas_tns"), (snap) => setAreasTNS(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_zonas"), (snap) => setZonasNomina(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_motivos_ausencia"), (snap) => { setMotivosAusencia(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setMotivosAusenciaCargado(true); }),
      onSnapshot(collection(db, "nomina_turnos"), (snap) => setTurnos(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_grupos_trabajo"), (snap) => setGruposTrabajo(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_produccion"), (snap) => setProduccion(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_horas"), (snap) => setHoras(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_cierres"), (snap) => setCierres(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_costos_teorico_proceso"), (snap) => setCostosTeoricoProceso(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_ausencias"), (snap) => setAusencias(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_faltas_sin_justificar"), (snap) => setFaltasSinJustificar(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_dias_trabajados"), (snap) => setDiasTrabajadosHuellero(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_fiscal_liquidaciones"), (snap) => setLiquidacionesF(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_fiscal_destajo_liquidaciones"), (snap) => setLiquidacionesFD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_destajo_liquidaciones"), (snap) => setLiquidacionesD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "dado_por_cumplido_lotes"), (snap) => setLotesConCobros(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "users"), (snap) => setUsuariosApp(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "planeacion_programacion_procesos"), (snap) => setProgramacionesProcesos(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);
  // (2026-09-01, a pedido de Fredy) Auto-siembra la coleccion de motivos si
  // todavia esta vacia (primer despliegue de este cambio) -- preserva los
  // mismos 9 motivos/iconos que antes vivian fijos en el codigo, para que
  // nadie pierda el desplegable el dia que esto salga a producción. IDs
  // deterministicos ("motivo_0".."motivo_8") para que sea seguro repetir
  // (setDoc con merge:true) si dos sesiones intentan sembrar a la vez.
  const motivosSeedHechoRef = useRef(false);
  useEffect(() => {
    if (!motivosAusenciaCargado || motivosAusencia.length > 0 || motivosSeedHechoRef.current) return;
    motivosSeedHechoRef.current = true;
    MOTIVOS_AUSENCIA_DEFAULT.forEach((m, i) => { fsSave("nomina_motivos_ausencia", `motivo_${i}`, m); });
  }, [motivosAusenciaCargado, motivosAusencia]);
  const nombresMotivosDisponibles = motivosAusencia.length > 0 ? motivosAusencia.map((m) => m.nombre) : MOTIVOS_AUSENCIA;
  const iconoPorMotivo = motivosAusencia.length > 0 ? Object.fromEntries(motivosAusencia.map((m) => [m.nombre, m.icono || "❔"])) : MOTIVO_ICONO;
  const isAdmin = !!currentUser?.isAdmin;
  // (2026-09-09, a pedido de Fredy) "isAdminCatalogos" -- variante de
  // isAdmin SOLO para las 8 pantallas administrativas de catalogos
  // (Trabajadores, Turnos, Motivos de Ausencia, Area Interna, Area TNS,
  // Cargo, Precios, Costos Teoricos): alguien con el permiso nuevo
  // "nomina_editar_catalogos" (rol, ver App.js) puede editar/crear/borrar
  // ahi SIN volverse administrador de toda la app. El resto de la app
  // (Registrar Produccion/Horas/Resumen/Permisos, y cualquier otro
  // modulo) sigue usando el isAdmin real, sin cambios.
  const isAdminCatalogos = isAdmin || !!puedeEditarCatalogos;
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
        { id: "historial_lote", icon: "📦", label: "Historial de Lote" },
        { id: "historial_trabajador", icon: "🧑‍🏭", label: "Historial de Trabajador" },
      ]
    : soloNovedades
    ? [
        { id: "ausencias", icon: "📅", label: "Motivos de Ausencia" },
        { id: "permisos", icon: "🗓️", label: "Permisos (Calendario)" },
        { id: "asistencia", icon: "📊", label: "Reporte de Asistencia" },
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
            { id: "grupos_trabajo", icon: "🧩", label: "Grupos de Trabajo" },
            { id: "areas_nomina", icon: "🏭", label: "Área Interna" },
            { id: "zonas_nomina", icon: "🪪", label: "Cargo" },
            { id: "areas_tns", icon: "🏛️", label: "Área TNS" },
            { id: "motivos_ausencia", icon: "🏷️", label: "Motivos de Ausencia (catálogo)" },
            { id: "turnos", icon: "⏱️", label: "Turnos" },
            { id: "trabajadores", icon: "👷", label: "Trabajadores" },
          ] },
        { group: "Novedades", icon: "📣", items: [
            { id: "ausencias", icon: "📅", label: "Motivos de Ausencia" },
            { id: "permisos", icon: "🗓️", label: "Permisos (Calendario)" },
            { id: "asistencia", icon: "📊", label: "Reporte de Asistencia" },
            { id: "novedades_quincena", icon: "🧾", label: "Listado de Novedades (quincena)" },
          ] },
        { group: "Reporte de Nómina", icon: "📊", items: [
            { id: "historial_lote", icon: "📦", label: "Historial de Lote" },
            { id: "historial_trabajador", icon: "🧑‍🏭", label: "Historial de Trabajador" },
            { id: "resumen", icon: "💰", label: "Cierre de Quincena" },
            { id: "reporte_area", icon: "📊", label: "Reporte por Área" },
            { id: "fiscal", icon: "🏛️", label: "Nómina Fiscal" },
            { id: "historial_fiscal", icon: "🗂️", label: "Historial Fiscal" },
            { id: "fiscal_destajo", icon: "💼", label: "Nómina Fiscal Destajo" },
            { id: "historial_fiscal_destajo", icon: "🗂️", label: "Historial Fiscal Destajo" },
            { id: "destajo", icon: "💼", label: "Nómina Destajo" },
            { id: "historial_destajo", icon: "🗂️", label: "Historial Destajo" },
            { id: "deducciones", icon: "🧾", label: "Deducciones" },
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
  async function guardarTrabajador(t) {
    const actual = trabajadores.find((x) => x.id === t.id);
    if (actual && t.area !== undefined && (t.area || "Sin asignar") !== (actual.area || "Sin asignar")) {
      const hoy = today();
      const previo = actual.historialAreas || [];
      const tramoAbierto = previo.length && !previo[previo.length - 1].hasta;
      const cerrado = tramoAbierto
        ? previo.slice(0, -1).concat([{ ...previo[previo.length - 1], hasta: hoy }])
        : previo.concat([{ area: actual.area || "Sin asignar", desde: null, hasta: hoy }]);
      t = { ...t, historialAreas: cerrado.concat([{ area: t.area || "Sin asignar", desde: hoy, hasta: null }]) };
    }
    await fsSave("nomina_trabajadores", t.id, t);
  }
  async function borrarTrabajador(id) { await fsDelete("nomina_trabajadores", id); }
  async function guardarProceso(p) { await fsSave("nomina_precios_proceso", p.id, p); }
  async function borrarProceso(id) { await fsDelete("nomina_precios_proceso", id); }
  async function guardarAreaNomina(a) { await fsSave("nomina_areas", a.id, a); }
  async function borrarAreaNomina(id) { await fsDelete("nomina_areas", id); }
  async function guardarAreaTNS(a) { await fsSave("nomina_areas_tns", a.id, a); }
  async function borrarAreaTNS(id) { await fsDelete("nomina_areas_tns", id); }
  async function guardarZonaNomina(z) { await fsSave("nomina_zonas", z.id, z); }
  async function borrarZonaNomina(id) { await fsDelete("nomina_zonas", id); }
  async function guardarMotivoAusencia(m) { await fsSave("nomina_motivos_ausencia", m.id, m); }
  async function borrarMotivoAusencia(id) { await fsDelete("nomina_motivos_ausencia", id); }
  async function guardarTurno(t) { await fsSave("nomina_turnos", t.id, t); }
  async function borrarTurno(id) { await fsDelete("nomina_turnos", id); }
  async function guardarGrupoTrabajo(g) { await fsSave("nomina_grupos_trabajo", g.id, g); }
  async function borrarGrupoTrabajo(id) { await fsDelete("nomina_grupos_trabajo", id); }
  // (2026-09-02, a pedido de Fredy) Pareja fija: SOLO Postura Dije
  // encadena con Terminación (nada más). Se dispara siempre que se
  // registre producción de Dije para un trabajador+lote, así el lote no
  // hubiera pasado antes por el Programador de Procesos.
  async function encadenarDijeATerminacion(p) {
    if (!p.numLote || !p.trabajadorId) return;
    const procesoTerminacion = (precios.find((pr) => normalizarProceso(pr.proceso) === normalizarProceso("Terminación"))?.proceso) || "Terminación";
    // No duplicar: si este lote+trabajador ya tiene una programación de
    // Terminación (manual o de un encadenamiento anterior), no crear otra.
    const yaProgramado = programacionesProcesos.some((prog) =>
      prog.numLote === p.numLote && prog.trabajadorId === p.trabajadorId && normalizarProceso(prog.proceso) === normalizarProceso(procesoTerminacion)
    );
    if (yaProgramado) return;
    const trabajador = trabajadores.find((t) => t.id === p.trabajadorId);
    // La líder dueña de Terminación es quien tenga esa Área Interna como
    // su Área de Nómina (mismo criterio que ya separa a Anny de Sarai).
    const lider = trabajador?.area ? usuariosApp.find((u) => !u.isAdmin && u.areaNomina === trabajador.area) : null;
    await fsSave("planeacion_programacion_procesos", uid(), {
      numLote: p.numLote,
      referencia: p.referencia || "",
      proceso: procesoTerminacion,
      fechaProgramada: p.fecha || today(),
      trabajadorId: p.trabajadorId,
      trabajadorNombre: p.trabajadorNombre || trabajador?.nombre || "",
      cantidad: Number(p.cantidad) || 0,
      liderUsername: lider?.username || "",
      liderNombre: lider?.name || "",
      creadoEn: new Date().toISOString(),
      origenAutomatico: "dije_a_terminacion",
    });
  }
  async function guardarProduccion(p) {
    const esNuevo = !produccion.some((x) => x.id === p.id);
    await fsSave("nomina_produccion", p.id, p);
    if (esNuevo && normalizarProceso(p.proceso) === normalizarProceso("Postura Dije")) {
      try {
        await encadenarDijeATerminacion(p);
      } catch (err) {
        console.error("No se pudo encadenar Terminación desde Dije:", err);
      }
    }
  }
  async function borrarProduccion(id) { await fsDelete("nomina_produccion", id); }
  async function guardarHoras(h) { await fsSave("nomina_horas", h.id, h); }
  async function borrarHoras(id) { await fsDelete("nomina_horas", id); }
  async function guardarAusencia(a) { await fsSave("nomina_ausencias", a.id, a); }
  async function borrarAusencia(id) { await fsDelete("nomina_ausencias", id); }
  // (2026-09-10, a pedido de Fredy) Justificar una falta desde el detalle
  // de "Días sin justificar" en Nómina -- guarda la ausencia (mismo
  // patrón de id/registradoPor que AusenciasView/PermisosCalendarioView) y
  // borra el registro guardado en Reporte de Asistencia para esa fecha,
  // asi deja de contar de inmediato, sin tener que volver a subir el
  // huellero.
  async function justificarFaltaDesdeNomina(data, nombreNorm, fecha) {
    await guardarAusencia({ id: uid(), ...data, registradoPor: currentUser?.name || currentUser?.username || "", registradoEn: new Date().toISOString() });
    await fsDelete("nomina_faltas_sin_justificar", `${nombreNorm}__${fecha}`);
  }
  // Cuando la falta YA tenia una ausencia que la cubria (se registro
  // despues de guardar el huellero) -- solo limpia el registro de falta,
  // no crea una ausencia nueva.
  async function limpiarFaltaYaJustificada(nombreNorm, fecha) {
    await fsDelete("nomina_faltas_sin_justificar", `${nombreNorm}__${fecha}`);
  }
  async function guardarLiquidacionF(l) { await fsSave("nomina_fiscal_liquidaciones", l.id, l); }
  async function guardarLiquidacionFD(l) { await fsSave("nomina_fiscal_destajo_liquidaciones", l.id, l); }
  async function guardarLiquidacionD(l) { await fsSave("nomina_destajo_liquidaciones", l.id, l); }
  // (2026-09-10, "Design B" confirmado por Fredy) Al confirmar una
  // liquidacion que incluyo descuentoCobros > 0, esto marca esos cobros
  // especificos (y SOLO esos -- los demas cobros del mismo lote, de otros
  // trabajadores o ya cobrados, quedan intactos) como cobrados con el
  // periodo que los pago, para que la siguiente liquidacion no los vuelva
  // a descontar.
  async function marcarCobrosComoCobrados(trabajadorId, periodoId) {
    const batch = writeBatch(db);
    let huboCambios = false;
    lotesConCobros.forEach((l) => {
      const cobros = l.cobrosBodega || [];
      let cambio = false;
      const nuevos = cobros.map((c) => {
        if (c.trabajadorId === trabajadorId && c.cobrado !== true) {
          cambio = true;
          return { ...c, cobrado: true, periodoIdCobrado: periodoId };
        }
        return c;
      });
      if (cambio) {
        batch.set(doc(db, "dado_por_cumplido_lotes", l.id), { cobrosBodega: nuevos }, { merge: true });
        huboCambios = true;
      }
    });
    if (huboCambios) await batch.commit();
  }
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
          {subView === "dashboard" && !areaLider && !soloNovedades && <DashboardNominaView trabajadores={trabajadores} precios={precios} produccion={produccion} horas={horas} />}
          {subView === "produccion" && !soloNovedades && <RegistrarProduccionView trabajadores={trabajadoresVisibles} precios={precios} produccion={produccionVisible} produccionCompleta={produccion} costosTeoricoProceso={costosTeoricoProceso} currentUser={currentUser} onGuardar={guardarProduccion} onBorrar={borrarProduccion} isAdmin={isAdmin} />}
          {subView === "horas" && !soloNovedades && <RegistrarHorasView trabajadores={trabajadoresVisibles} horas={horasVisibles} currentUser={currentUser} onGuardar={guardarHoras} onBorrar={borrarHoras} isAdmin={isAdmin} />}
          {subView === "resumen" && !soloNovedades && <ResumenSemanalView trabajadores={trabajadoresVisibles} produccion={produccionVisible} horas={horasVisibles} isAdmin={isAdmin} cierres={cierres} onCerrar={guardarCierre} onReabrir={reabrirCierre} />}
          {subView === "reporte_area" && !areaLider && !soloNovedades && <ReporteNominaPorAreaView trabajadores={trabajadores} liquidacionesF={liquidacionesF} liquidacionesFD={liquidacionesFD} liquidacionesD={liquidacionesD} />}
          {subView === "trabajadores" && !areaLider && !soloNovedades && <TrabajadoresView trabajadores={trabajadores} isAdmin={isAdminCatalogos} onSave={guardarTrabajador} onDelete={borrarTrabajador} areasNomina={areasNomina} areasTNS={areasTNS} zonasNomina={zonasNomina} onSaveArea={guardarAreaNomina} onSaveZona={guardarZonaNomina} turnos={turnos} gruposTrabajo={gruposTrabajo} />}
          {subView === "grupos_trabajo" && !areaLider && !soloNovedades && <GruposTrabajoView grupos={gruposTrabajo} areasNomina={areasNomina} isAdmin={isAdminCatalogos} onSave={guardarGrupoTrabajo} onDelete={borrarGrupoTrabajo} />}
          {subView === "areas_nomina" && !areaLider && !soloNovedades && <AreasNominaView areas={areasNomina} trabajadores={trabajadores} procesos={precios} grupos={gruposTrabajo} isAdmin={isAdminCatalogos} onSave={guardarAreaNomina} onDelete={borrarAreaNomina} />}
          {subView === "zonas_nomina" && !areaLider && !soloNovedades && <ZonasNominaView zonas={zonasNomina} areasNomina={areasNomina} gruposTrabajo={gruposTrabajo} trabajadores={trabajadores} isAdmin={isAdminCatalogos} onSave={guardarZonaNomina} onDelete={borrarZonaNomina} />}
          {subView === "areas_tns" && !areaLider && !soloNovedades && <AreasTnsView areas={areasTNS} trabajadores={trabajadores} isAdmin={isAdminCatalogos} onSave={guardarAreaTNS} onDelete={borrarAreaTNS} />}
          {subView === "motivos_ausencia" && !areaLider && !soloNovedades && <MotivosAusenciaView motivos={motivosAusencia} ausencias={ausencias} isAdmin={isAdminCatalogos} onSave={guardarMotivoAusencia} onDelete={borrarMotivoAusencia} />}
          {subView === "turnos" && !areaLider && !soloNovedades && <TurnosView turnos={turnos} trabajadores={trabajadores} isAdmin={isAdminCatalogos} onSave={guardarTurno} onDelete={borrarTurno} />}
          {subView === "precios" && !areaLider && !soloNovedades && <PreciosProcesoView precios={precios} isAdmin={isAdminCatalogos} onSave={guardarProceso} onDelete={borrarProceso} />}
          {subView === "costos_teorico" && !areaLider && !soloNovedades && <CostosTeoricoProcesoView costos={costosTeoricoProceso} isAdmin={isAdminCatalogos} onGuardarLote={guardarCostosTeoricoProcesoLote} onBorrarTodo={vaciarCostosTeoricoProceso} />}
          {subView === "costo_referencia" && !areaLider && !soloNovedades && <ConsultarCostoReferenciaView />}
          {subView === "tns" && !areaLider && !soloNovedades && <TNSConexionView />}
          {subView === "novedades_tns" && !areaLider && !soloNovedades && <NovedadesTNSView trabajadores={trabajadores} />}
          {subView === "novedades_quincena" && !areaLider && !soloNovedades && <NovedadesQuincenaView trabajadores={trabajadores} faltas={faltasSinJustificar} ausencias={ausencias} turnos={turnos} />}
          {subView === "ausencias" && !areaLider && <AusenciasView ausencias={ausencias} trabajadores={trabajadores} currentUser={currentUser} motivosDisponibles={nombresMotivosDisponibles} onSave={guardarAusencia} onDelete={borrarAusencia} />}
          {subView === "asistencia" && !areaLider && <ReporteAsistenciaView ausencias={ausencias} trabajadores={trabajadores} turnos={turnos} onGuardarTrabajador={guardarTrabajador} />}
          {subView === "permisos" && <PermisosCalendarioView trabajadores={trabajadoresVisibles} produccion={produccionVisible} horas={horasVisibles} ausencias={ausenciasVisibles} currentUser={currentUser} isAdmin={isAdmin} motivosDisponibles={nombresMotivosDisponibles} motivoIcono={iconoPorMotivo} onSave={guardarAusencia} onDelete={borrarAusencia} />}
          {subView === "fiscal" && !areaLider && !soloNovedades && <NominaFiscalView trabajadores={trabajadores} faltas={faltasSinJustificar} ausencias={ausencias} motivosDisponibles={nombresMotivosDisponibles} onJustificarFalta={justificarFaltaDesdeNomina} onLimpiarFaltaJustificada={limpiarFaltaYaJustificada} diasTrabajados={diasTrabajadosHuellero} liquidaciones={liquidacionesF} onGuardarTrabajador={guardarTrabajador} onGuardarLiquidacion={guardarLiquidacionF} lotesConCobros={lotesConCobros} onMarcarCobrosCobrados={marcarCobrosComoCobrados} turnos={turnos} />}
          {subView === "historial_fiscal" && !areaLider && !soloNovedades && <HistorialFiscalView liquidaciones={liquidacionesF} trabajadores={trabajadores} />}
          {subView === "fiscal_destajo" && !areaLider && !soloNovedades && <NominaFiscalDestajoView trabajadores={trabajadores} faltas={faltasSinJustificar} ausencias={ausencias} motivosDisponibles={nombresMotivosDisponibles} onJustificarFalta={justificarFaltaDesdeNomina} onLimpiarFaltaJustificada={limpiarFaltaYaJustificada} diasTrabajados={diasTrabajadosHuellero} liquidaciones={liquidacionesFD} onGuardarTrabajador={guardarTrabajador} onGuardarLiquidacion={guardarLiquidacionFD} lotesConCobros={lotesConCobros} onMarcarCobrosCobrados={marcarCobrosComoCobrados} turnos={turnos} />}
          {subView === "historial_fiscal_destajo" && !areaLider && !soloNovedades && <HistorialFiscalDestajoView liquidaciones={liquidacionesFD} trabajadores={trabajadores} />}
          {subView === "destajo" && !areaLider && !soloNovedades && <NominaDestajoView trabajadores={trabajadores} produccion={produccion} faltas={faltasSinJustificar} ausencias={ausencias} motivosDisponibles={nombresMotivosDisponibles} onJustificarFalta={justificarFaltaDesdeNomina} onLimpiarFaltaJustificada={limpiarFaltaYaJustificada} diasTrabajados={diasTrabajadosHuellero} liquidaciones={liquidacionesD} onGuardarTrabajador={guardarTrabajador} onGuardarLiquidacion={guardarLiquidacionD} lotesConCobros={lotesConCobros} onMarcarCobrosCobrados={marcarCobrosComoCobrados} />}
          {subView === "historial_destajo" && !areaLider && !soloNovedades && <HistorialDestajoView liquidaciones={liquidacionesD} trabajadores={trabajadores} />}
          {subView === "deducciones" && !areaLider && !soloNovedades && <DeduccionesNominaView lotesConCobros={lotesConCobros} trabajadores={trabajadores} />}
          {subView === "historial_lote" && !soloNovedades && <HistorialLoteView produccion={produccion} />}
          {subView === "historial_trabajador" && !soloNovedades && <HistorialTrabajadorView trabajadores={trabajadoresVisibles} produccion={produccionVisible} liquidaciones={liquidacionesD} />}
        </div>
      </div>
    </div>
  );
}
