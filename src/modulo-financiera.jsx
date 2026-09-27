import { useState, useEffect, Fragment } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

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
function fmtMoney(n) {
  return "$ " + Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
// ─── UI ATOMS (mismas de los demás módulos) ───────────────────────────────────
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
// (2026-09-19, a pedido de Fredy) "Costo total para la empresa" de una
// liquidación -- misma fórmula que ya usa Nómina → Reporte por Área
// (costoTotalLiquidacion en modulo-nomina.jsx): lo que se le paga al
// trabajador + los aportes patronales de seguridad social (solo aplica a
// Fiscal) + las provisiones de prestaciones sociales (cesantías, intereses,
// prima, vacaciones -- aplica a Fiscal/Fiscal Destajo/Destajo). Prestación
// de Servicios no tiene ninguno de estos campos, así que aporta $0 acá,
// solo su Neto a Pagar.
function costoTotalLiquidacion(l) {
  return (l.netoAPagar || 0)
    + (l.epsTrabajador || 0) + (l.pensionTrabajador || 0)
    + (l.pensionEmpleador || 0) + (l.arlEmpleador || 0) + (l.cajaCompensacionEmpleador || 0) + (l.epsEmpleador || 0)
    + (l.cesantiasPeriodo || 0) + (l.interesesPeriodo || 0) + (l.primaPeriodo || 0) + (l.vacacionesPeriodo || 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIERA (2026-09-19, a pedido de Fredy) -- módulo nuevo de nivel
// superior en el menú principal (igual que Contabilidad, Planeación,
// Planta, Bodega...), NO una pantalla dentro de Nómina. Primera versión:
// solo los 2 números que pidió --
//   1) "Total a pagar" = suma del Neto a Pagar de las liquidaciones YA
//      CONFIRMADAS de los 4 tipos de nómina en el período elegido (misma
//      fuente que Nómina → Reporte por Área).
//   2) "Provisión" = lo que hay que tener aparte en seguridad social
//      (aportes patronales: pensión, ARL, Caja) + prestaciones sociales
//      (cesantías, intereses, prima, vacaciones) de ese mismo período --
//      es decir, costoTotalLiquidacion() menos el Neto a Pagar. Es la
//      provisión DEL PERÍODO elegido (mensual si eliges "Mes completo"),
//      no el acumulado histórico desde que cada quien entró a trabajar --
//      ese acumulado es un número aparte y mucho más grande, el que ya
//      muestra Nómina → Provisión (hasta hoy).
// Se conecta directo a las 4 colecciones de liquidaciones, sin pasar por
// ModuloNomina -- mismo patrón "standalone" que ya usa AreasStandalone en
// modulo-planeacion.jsx (módulo de nivel superior con sus propias
// suscripciones a Firestore).
// Pendiente para una siguiente vuelta (a pedido de Fredy, se deja para
// después de validar estos 2 números): descuentos pendientes por cobrar,
// lo recaudado por préstamos, y el desglose de la deducción "Los Olivos".
//
// (2026-09-19, a pedido de Fredy) "¿Cómo pagar?" -- además de saber CUÁNTO
// pagar, Fredy necesita saber en qué FORMA pagarlo (Efectivo o Banco) y a
// cuál empresa corresponde (Yanko o Indutex, el campo "Empleador" que ya
// tiene cada trabajador). La forma de pago no se guarda por trabajador --
// la definió Fredy directamente por tipo de nómina (confirmado por chat):
// Destajo, Fiscal Destajo y Prestación de Servicios se pagan en Efectivo;
// Fiscal se paga por Banco.
const FORMA_PAGO_POR_TIPO = {
  "Fiscal": "Banco",
  "Fiscal Destajo": "Efectivo",
  "Destajo": "Efectivo",
  "Prestación de Servicios": "Efectivo",
};
const EMPLEADORES_COLUMNAS = ["YANKO", "INDUTEX"];
// ═══════════════════════════════════════════════════════════════════════════
// (2026-09-27, a pedido de Fredy) Helpers migrados de modulo-contabilidad.jsx
// junto con Proyección, Presupuesto Clientes y Programación de Pagos --
// Financiera pasa de ser una sola pantalla (Pago de Nómina) a un módulo con
// varias vistas, igual que Contabilidad. Se traen tal cual, sin cambiar su
// lógica.
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function sumarMes(mes, n = 1) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
function fmtMesLargo(mes) {
  if (!mes) return "";
  return new Date(mes + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}
function fmtMesCorto(mes) {
  if (!mes) return "";
  return new Date(mes + "-02").toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
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
const CATS_INGRESO = [
  "Anticipo Nómina",
  "Anticipo Insumos",
  "Anticipo Tela",
  "Anticipo Maquinaria",
];
// (2026-09-19, a pedido de Fredy) Pantalla original de Financiera -- ahora
// una vista más dentro del módulo (ver FinancieraStandalone al final del
// archivo), no el módulo completo. Su lógica interna no cambió.
function PagoNominaView({ currentUser }) {
  const isAdmin = currentUser?.isAdmin;
  const hoy = new Date();
  const [tipoPeriodo, setTipoPeriodo] = useState("mes"); // "quincena" | "mes"
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? "1" : "2");

  const [trabajadores, setTrabajadores] = useState([]);
  const [liquidacionesF, setLiquidacionesF] = useState([]);
  const [liquidacionesFD, setLiquidacionesFD] = useState([]);
  const [liquidacionesD, setLiquidacionesD] = useState([]);
  const [liquidacionesPS, setLiquidacionesPS] = useState([]);
  const [loading, setLoading] = useState(true);
  // (2026-09-19, a pedido de Fredy) "Registrar pago" -- pagos ya hechos,
  // guardados en su propia colección `financiera_pagos` (no toca las
  // liquidaciones ni las nóminas). Cada pago queda amarrado a la celda
  // exacta de la tabla "¿Cómo pagar?" (Forma de pago + Empleador) y al
  // período en que se registró -- ver pagoAplicaAlPeriodo() más abajo.
  const [pagos, setPagos] = useState([]);
  const [formPago, setFormPago] = useState(null); // { forma, empleador, montoEsperado, montoPagadoPrevio }
  const [fechaPago, setFechaPago] = useState("");
  const [montoPago, setMontoPago] = useState("");
  const [obsPago, setObsPago] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [confirmDelPago, setConfirmDelPago] = useState(null); // { id, monto, fecha, forma, empleador }

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "nomina_trabajadores"), (snap) => { setTrabajadores(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setLoading(false); }),
      onSnapshot(collection(db, "nomina_fiscal_liquidaciones"), (snap) => setLiquidacionesF(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_fiscal_destajo_liquidaciones"), (snap) => setLiquidacionesFD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_destajo_liquidaciones"), (snap) => setLiquidacionesD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_prestacion_servicios_liquidaciones"), (snap) => setLiquidacionesPS(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "financiera_pagos"), (snap) => setPagos(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const periodoId = `${anio}-${mes}-Q${quincena}`;
  function enPeriodo(l) {
    return tipoPeriodo === "quincena" ? l.periodoId === periodoId : (l.periodoId || "").startsWith(`${anio}-${mes}-`);
  }
  const porTipo = [
    { tipo: "Fiscal", liquidaciones: liquidacionesF.filter(enPeriodo), color: C.blue, bg: C.blueBg },
    { tipo: "Fiscal Destajo", liquidaciones: liquidacionesFD.filter(enPeriodo), color: C.violet, bg: C.violetBg },
    { tipo: "Destajo", liquidaciones: liquidacionesD.filter(enPeriodo), color: C.amber, bg: C.amberBg },
    { tipo: "Prestación de Servicios", liquidaciones: liquidacionesPS.filter(enPeriodo), color: C.green, bg: C.greenBg },
  ].map((g) => ({
    ...g,
    neto: g.liquidaciones.reduce((s, l) => s + (l.netoAPagar || 0), 0),
    costoTotal: g.liquidaciones.reduce((s, l) => s + costoTotalLiquidacion(l), 0),
  }));
  const totalTrabajadores = porTipo.reduce((s, g) => s + g.liquidaciones.length, 0);
  const totalAPagar = porTipo.reduce((s, g) => s + g.neto, 0);
  const totalCostoEmpresa = porTipo.reduce((s, g) => s + g.costoTotal, 0);
  const provision = totalCostoEmpresa - totalAPagar;
  // (2026-09-19, a pedido de Fredy) Matriz "¿Cómo pagar?" -- Forma de pago
  // (Efectivo/Banco, según FORMA_PAGO_POR_TIPO) x Empleador (Yanko/Indutex,
  // el que tiene HOY cada trabajador -- si ya no está en el sistema o no
  // tiene Empleador asignado, cae en "Sin asignar" para no perderlo del
  // total). Suma el Neto a Pagar, que es lo que de verdad hay que
  // desembolsar (no el costo total con provisión).
  const matrizPago = { Efectivo: {}, Banco: {} };
  [...EMPLEADORES_COLUMNAS, "Sin asignar"].forEach((emp) => {
    matrizPago.Efectivo[emp] = 0;
    matrizPago.Banco[emp] = 0;
  });
  porTipo.forEach((g) => {
    const forma = FORMA_PAGO_POR_TIPO[g.tipo] || "Efectivo";
    g.liquidaciones.forEach((l) => {
      const trabajador = trabajadores.find((t) => t.id === l.trabajadorId);
      const empleador = trabajador?.empleador && EMPLEADORES_COLUMNAS.includes(trabajador.empleador) ? trabajador.empleador : "Sin asignar";
      // (2026-09-21, a pedido de Fredy) Horas Extras y Bonificación puntual
      // SIEMPRE se pagan en Efectivo, sin importar la forma de pago normal
      // del tipo de nómina (ej. Fiscal se paga por Banco, pero su Hora
      // Extra y su Bonificación van aparte por Efectivo) -- se separan del
      // resto del Neto a Pagar. Cuando la forma ya es Efectivo (Destajo/
      // Fiscal Destajo/Prestación de Servicios), las líneas de abajo caen
      // en el mismo bolsillo y el total no cambia.
      const totalHorasExtra = l.totalHorasExtra || 0;
      const bonificacionPuntual = l.bonificacionPuntual || 0;
      const totalEfectivoAparte = totalHorasExtra + bonificacionPuntual;
      matrizPago[forma][empleador] += (l.netoAPagar || 0) - totalEfectivoAparte;
      matrizPago.Efectivo[empleador] += totalEfectivoAparte;
    });
  });
  const hayTrabajadoresSinAsignar = matrizPago.Efectivo["Sin asignar"] > 0 || matrizPago.Banco["Sin asignar"] > 0;
  const columnasPago = hayTrabajadoresSinAsignar ? [...EMPLEADORES_COLUMNAS, "Sin asignar"] : EMPLEADORES_COLUMNAS;
  const totalPorForma = (forma) => columnasPago.reduce((s, emp) => s + matrizPago[forma][emp], 0);
  const totalPorEmpleadorCol = (emp) => matrizPago.Efectivo[emp] + matrizPago.Banco[emp];
  // (2026-09-19, a pedido de Fredy) Un pago registrado en una quincena
  // específica SÍ cuenta cuando se ve el "Mes completo" (es parte de ese
  // mes); pero un pago registrado viendo "Mes completo" (sin quincena) no
  // se reparte entre las 2 quincenas -- solo se ve en la vista de Mes.
  function pagoAplicaAlPeriodo(p) {
    if (p.anio !== anio || p.mes !== mes) return false;
    if (tipoPeriodo === "mes") return true;
    return p.quincena === quincena;
  }
  const pagosPeriodo = pagos.filter(pagoAplicaAlPeriodo);
  function pagosDeCelda(forma, empleador) {
    return pagosPeriodo.filter((p) => p.forma === forma && p.empleador === empleador);
  }
  function montoPagadoCelda(forma, empleador) {
    return pagosDeCelda(forma, empleador).reduce((s, p) => s + (p.monto || 0), 0);
  }
  function abrirFormPago(forma, empleador) {
    const montoEsperado = matrizPago[forma][empleador];
    const montoPagadoPrevio = montoPagadoCelda(forma, empleador);
    setFormPago({ forma, empleador, montoEsperado, montoPagadoPrevio });
    setFechaPago(new Date().toISOString().slice(0, 10));
    setMontoPago(montoEsperado > montoPagadoPrevio ? String(montoEsperado - montoPagadoPrevio) : "");
    setObsPago("");
  }
  async function guardarPago() {
    if (!formPago || !fechaPago || !montoPago) return;
    setGuardandoPago(true);
    try {
      const ref = doc(collection(db, "financiera_pagos"));
      await setDoc(ref, {
        anio, mes, tipoPeriodo, quincena: tipoPeriodo === "quincena" ? quincena : null,
        forma: formPago.forma, empleador: formPago.empleador,
        fecha: fechaPago, monto: Number(montoPago) || 0, observacion: (obsPago || "").trim(),
        registradoPor: currentUser?.name || currentUser?.username || currentUser?.email || "",
        creadoEn: new Date().toISOString(),
      });
      setFormPago(null);
    } finally {
      setGuardandoPago(false);
    }
  }
  async function eliminarPago(id) {
    await fsDelete("financiera_pagos", id);
  }
  // (2026-09-19, a pedido de Fredy) El desglose por tipo de nómina también
  // debe distinguir Yanko de Indutex, igual que la tabla de "¿Cómo pagar?"
  // de arriba -- cada tipo se abre en una sub-fila por Empleador.
  const porTipoConEmpleador = porTipo.map((g) => {
    const porEmpleador = columnasPago.map((emp) => {
      const liqsEmp = g.liquidaciones.filter((l) => {
        const trabajador = trabajadores.find((t) => t.id === l.trabajadorId);
        const empActual = trabajador?.empleador && EMPLEADORES_COLUMNAS.includes(trabajador.empleador) ? trabajador.empleador : "Sin asignar";
        return empActual === emp;
      });
      return {
        empleador: emp,
        trabajadores: liqsEmp.length,
        neto: liqsEmp.reduce((s, l) => s + (l.netoAPagar || 0), 0),
        costoTotal: liqsEmp.reduce((s, l) => s + costoTotalLiquidacion(l), 0),
      };
    }).filter((e) => e.trabajadores > 0);
    return { ...g, porEmpleador };
  });
  const rangoTexto = tipoPeriodo === "quincena"
    ? `Quincena ${quincena} (${quincena === "1" ? "1-15" : "16-fin de mes"}) de ${MESES_LARGO[Number(mes) - 1]} ${anio}`
    : `Mes completo de ${MESES_LARGO[Number(mes) - 1]} ${anio}`;

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>Pago de Nómina</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: C.slate, maxWidth: 780 }}>
          Cuánto hay que pagar y cuánto hay que tener aparte en seguridad social y prestaciones sociales, juntando las liquidaciones YA CONFIRMADAS de las 4 nóminas (Fiscal, Fiscal Destajo, Destajo y Prestación de Servicios) del período elegido.
        </p>
      </div>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
            <Field label="Período">
              <FSel value={tipoPeriodo} onChange={setTipoPeriodo} options={[{ value: "mes", label: "Mes completo (2 quincenas)" }, { value: "quincena", label: "Una quincena" }]} />
            </Field>
            <Field label="Año"><FInput type="number" value={anio} onChange={setAnio} /></Field>
            <Field label="Mes">
              <FSel value={mes} onChange={setMes} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: MESES_LARGO[i] }))} />
            </Field>
            {tipoPeriodo === "quincena" && (
              <Field label="Quincena">
                <FSel value={quincena} onChange={setQuincena} options={[{ value: "1", label: "1 (días 1-15)" }, { value: "2", label: "2 (16-fin de mes)" }]} />
              </Field>
            )}
          </div>

          {loading ? (
            <div style={{ padding: "12px 16px", color: C.slate, fontSize: 13 }}>Cargando...</div>
          ) : totalTrabajadores === 0 ? (
            <div style={{ padding: "12px 16px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, color: C.slate, fontSize: 13, maxWidth: 560 }}>
              No hay ninguna liquidación confirmada para {rangoTexto.toLowerCase()} todavía. Cierra las nóminas en Talento Humano → Nómina para que aparezcan acá.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.slate, fontWeight: 700, marginBottom: 10 }}>{rangoTexto} — {totalTrabajadores} trabajador{totalTrabajadores === 1 ? "" : "es"} con liquidación confirmada</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
                <KPI icon="💵" label="Total a pagar" value={fmtMoney(totalAPagar)} color={C.green} bg={C.greenBg} sub="Neto a pagar de las 4 nóminas" />
                <KPI icon="🏛️" label="Provisión (seg. social + prestaciones sociales)" value={fmtMoney(provision)} color={C.violet} bg={C.violetBg} sub="Aparte del Neto a Pagar" />
                <KPI icon="📊" label="Costo total de nómina" value={fmtMoney(totalCostoEmpresa)} color={C.ink} bg={C.canvas} sub="Total a pagar + Provisión" />
              </div>

              <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>¿Cómo pagar?</div>
              <div style={{ fontSize: 12, color: C.slate, marginBottom: 10, maxWidth: 780 }}>
                Destajo, Fiscal Destajo y Prestación de Servicios se pagan en Efectivo; Fiscal se paga por Banco — separado por Empleador (Yanko / Indutex). Las Horas Extras y la Bonificación puntual de cualquier tipo de nómina siempre van por Efectivo, aparte del resto.
              </div>
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto", marginBottom: 24 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.ink }}>
                      <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Forma de pago</th>
                      {columnasPago.map((emp) => (
                        <th key={emp} style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>{emp}</th>
                      ))}
                      <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Efectivo", "Banco"].map((forma, i) => (
                      <tr key={forma} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "7px 12px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: forma === "Efectivo" ? C.amberBg : C.blueBg, color: forma === "Efectivo" ? C.amber : C.blue }}>{forma === "Efectivo" ? "💵 Efectivo" : "🏦 Banco"}</span>
                        </td>
                        {columnasPago.map((emp) => {
                          const montoEsperado = matrizPago[forma][emp];
                          const montoPagado = montoPagadoCelda(forma, emp);
                          return (
                            <td key={emp} style={{ padding: "7px 12px", textAlign: "right" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                                <span>{fmtMoney(montoEsperado)}</span>
                                {montoEsperado > 0 && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    {montoPagado > 0 && (
                                      <span style={{ padding: "1px 6px", borderRadius: 20, fontSize: 9, fontWeight: 800, background: montoPagado >= montoEsperado ? C.greenBg : C.amberBg, color: montoPagado >= montoEsperado ? C.green : C.amber }}>
                                        {montoPagado >= montoEsperado ? "✅ Pagado" : `Parcial ${fmtMoney(montoPagado)}`}
                                      </span>
                                    )}
                                    <span onClick={() => abrirFormPago(forma, emp)} style={{ cursor: "pointer", color: C.blue, fontSize: 10, fontWeight: 700 }}>
                                      + Pago
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 800 }}>{fmtMoney(totalPorForma(forma))}</td>
                      </tr>
                    ))}
                    <tr style={{ background: C.canvas, borderTop: `2px solid ${C.border}` }}>
                      <td style={{ padding: "7px 12px", fontWeight: 800 }}>TOTAL</td>
                      {columnasPago.map((emp) => (
                        <td key={emp} style={{ padding: "7px 12px", textAlign: "right", fontWeight: 800 }}>{fmtMoney(totalPorEmpleadorCol(emp))}</td>
                      ))}
                      <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 900 }}>{fmtMoney(totalAPagar)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>Pagos registrados {tipoPeriodo === "quincena" ? "de esta quincena" : "de este mes"}</div>
              {pagosPeriodo.length === 0 ? (
                <div style={{ padding: "10px 14px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, color: C.slate, fontSize: 12, marginBottom: 24, maxWidth: 780 }}>
                  Todavía no has registrado ningún pago para este período. Usa "+ Pago" en la tabla de arriba.
                </div>
              ) : (
                <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto", marginBottom: 24 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: C.ink }}>
                        <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Fecha</th>
                        <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Forma</th>
                        <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Empleador</th>
                        <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Monto</th>
                        <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Observación</th>
                        <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Registrado por</th>
                        {isAdmin && <th style={{ padding: "9px 12px", color: C.seam, textAlign: "center", fontWeight: 700, fontSize: 10 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {[...pagosPeriodo].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).map((p, i) => (
                        <tr key={p.id} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: "7px 12px" }}>{p.fecha}</td>
                          <td style={{ padding: "7px 12px" }}>{p.forma === "Efectivo" ? "💵 Efectivo" : "🏦 Banco"}</td>
                          <td style={{ padding: "7px 12px" }}>{p.empleador}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700 }}>{fmtMoney(p.monto)}</td>
                          <td style={{ padding: "7px 12px", color: C.slate }}>{p.observacion || "—"}</td>
                          <td style={{ padding: "7px 12px", color: C.slate }}>{p.registradoPor || "—"}</td>
                          {isAdmin && (
                            <td style={{ padding: "7px 12px", textAlign: "center" }}>
                              <span
                                onClick={() => setConfirmDelPago(p)}
                                style={{ cursor: "pointer", color: C.red, fontSize: 12 }}
                                title="Eliminar este pago"
                              >🗑</span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>Desglose por tipo de nómina</div>
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto", marginBottom: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.ink }}>
                      <th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Tipo de nómina</th>
                      <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Trabajadores</th>
                      <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Neto a pagar</th>
                      <th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Provisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porTipoConEmpleador.filter((g) => g.liquidaciones.length > 0).map((g, i) => (
                      <Fragment key={g.tipo}>
                        <tr style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: g.porEmpleador.length > 1 ? "none" : `1px solid ${C.border}` }}>
                          <td style={{ padding: "7px 12px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: g.bg, color: g.color }}>{g.tipo}</span>
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 800 }}>{g.liquidaciones.length}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 800 }}>{fmtMoney(g.neto)}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 800 }}>{fmtMoney(g.costoTotal - g.neto)}</td>
                        </tr>
                        {g.porEmpleador.length > 1 && g.porEmpleador.map((e, j) => (
                          <tr key={e.empleador} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: j === g.porEmpleador.length - 1 ? `1px solid ${C.border}` : "none" }}>
                            <td style={{ padding: "3px 12px 3px 28px", fontSize: 11, color: C.slate }}>— {e.empleador}</td>
                            <td style={{ padding: "3px 12px", textAlign: "right", fontSize: 11, color: C.slate }}>{e.trabajadores}</td>
                            <td style={{ padding: "3px 12px", textAlign: "right", fontSize: 11, color: C.slate }}>{fmtMoney(e.neto)}</td>
                            <td style={{ padding: "3px 12px", textAlign: "right", fontSize: 11, color: C.slate }}>{fmtMoney(e.costoTotal - e.neto)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: C.slate, maxWidth: 780 }}>
                "Prestación de Servicios" no tiene provisión (son contratistas independientes, sin seguridad social ni prestaciones sociales a cargo de la empresa) — por eso aporta $0 a esa columna.
              </div>
            </>
          )}

      {formPago && (
        <Modal title={`Registrar pago — ${formPago.forma === "Efectivo" ? "💵 Efectivo" : "🏦 Banco"} · ${formPago.empleador}`} onClose={() => setFormPago(null)} width={460}>
          <Field label="Fecha del pago">
            <FInput type="date" value={fechaPago} onChange={setFechaPago} />
          </Field>
          <Field label="Monto pagado">
            <FInput type="number" value={montoPago} onChange={setMontoPago} placeholder="0" />
          </Field>
          <Field label="Observación / comprobante (opcional)">
            <FInput value={obsPago} onChange={setObsPago} placeholder="N° de comprobante, banco, nota..." />
          </Field>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 20 }}>
            Se debía pagar {fmtMoney(formPago.montoEsperado)} en {formPago.forma} para {formPago.empleador}
            {formPago.montoPagadoPrevio > 0 && <> — ya hay {fmtMoney(formPago.montoPagadoPrevio)} registrado.</>}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setFormPago(null)}>Cancelar</Btn>
            <Btn onClick={guardarPago} disabled={!fechaPago || !montoPago || guardandoPago}>{guardandoPago ? "Guardando..." : "Guardar pago"}</Btn>
          </div>
        </Modal>
      )}

      {confirmDelPago && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDelPago(null)} width={420}>
          <div style={{ fontSize: 14, color: C.ink, marginBottom: 20 }}>
            ¿Eliminar el pago de <strong>{fmtMoney(confirmDelPago.monto)}</strong> registrado el {confirmDelPago.fecha} ({confirmDelPago.forma} · {confirmDelPago.empleador})?
            <div style={{ marginTop: 10, color: C.slate, fontSize: 13 }}>Esta acción no se puede deshacer.</div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmDelPago(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={async () => { await eliminarPago(confirmDelPago.id); setConfirmDelPago(null); }}>Sí, eliminar</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
// ═══════════════════════════════════════════════════════════════════════════
// (2026-09-27, a pedido de Fredy) Migrado tal cual desde modulo-contabilidad.jsx:
// Proyección (presupuesto por rubro, a partir del histórico de compras),
// Presupuesto Clientes (lo que se espera que abone cada cliente) y
// Programación de Pagos (cruce de ingresos esperados vs. egresos
// comprometidos, mes a mes). Contabilidad se queda solo con el registro
// (saldos, vencidos, cartera y costos); la planeación/estrategia vive acá.
// ═══════════════════════════════════════════════════════════════════════════

function calcularBaseItemsPromedio(compras) {
  const mesesCompras = [...new Set(compras.map((c) => c.mes))].sort();
  const map = {};
  compras.forEach((c) => {
    const key = `${c.codConcep}__${c.concepto}`;
    if (!map[key]) map[key] = { codConcep: c.codConcep, concepto: c.concepto, total: 0 };
    const neto = c.valor + (c.iva || 0) - (c.retencion || 0);
    map[key].total += neto;
  });
  return Object.values(map)
    .map((b) => ({ ...b, promedio: mesesCompras.length ? b.total / mesesCompras.length : 0 }))
    .sort((a, b) => b.promedio - a.promedio);
}
function ProyeccionForm({ compras, presupuestoExistente, onGuardar, onClose }) {
  const mesesCompras = [...new Set(compras.map((c) => c.mes))].sort();
  const baseItems = calcularBaseItemsPromedio(compras);
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
function normalizarEncabezado(k) {
  return String(k)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
// (2026-09-27, a pedido de Fredy) Importa desde Excel el mapeo código de
// concepto -> categoría de Proyección, en vez de asignar cada uno a mano en
// el desplegable (son ~37 códigos). Columnas esperadas: "Cod Concepto" y
// "Categoría" (nombres flexibles vía normalizarEncabezado) -- se puede
// repetir el mismo nombre de categoría en varias filas para agruparlas. Las
// categorías que no existan todavía se crean solas (ver
// importarCategoriasProyeccion en FinancieraStandalone); volver a subir el
// mismo archivo actualizado no borra nada de lo que no traiga la fila.
function ImportarCategoriasProyeccionModal({ onImportar, onClose }) {
  const [pares, setPares] = useState(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState("");
  const [importando, setImportando] = useState(false);

  async function manejarArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setNombreArchivo(file.name);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
      const vistos = new Map(); // codConcep -> categoria (última fila manda)
      rows.forEach((row) => {
        const map = {};
        Object.keys(row).forEach((k) => { map[normalizarEncabezado(k)] = row[k]; });
        const codConcep = String(
          map["codconcepto"] ?? map["codconcep"] ?? map["cod concepto"] ?? map["codigo"] ?? ""
        ).trim();
        const categoria = String(map["categoria"] ?? "").trim();
        if (!codConcep || !categoria) return;
        vistos.set(codConcep, categoria);
      });
      if (!vistos.size) {
        setError('No se encontraron filas válidas. Revisa que el Excel tenga las columnas "Cod Concepto" y "Categoría".');
        setPares(null);
        return;
      }
      setPares([...vistos.entries()].map(([codConcep, categoria]) => ({ codConcep, categoria })));
    } catch (err) {
      setError("No se pudo leer el archivo. ¿Es un Excel válido?");
      setPares(null);
    }
  }

  const categoriasDistintas = pares ? [...new Set(pares.map((p) => p.categoria))].sort() : [];

  async function confirmar() {
    if (!pares?.length) return;
    setImportando(true);
    try {
      await onImportar(pares);
      onClose();
    } finally {
      setImportando(false);
    }
  }

  return (
    <Modal title="Importar categorías de Proyección" onClose={onClose} width={480}>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14 }}>
        Sube un Excel con las columnas <strong>Cod Concepto</strong> y <strong>Categoría</strong>. Repite el mismo nombre de categoría en varias filas para agruparlas -- las categorías que no existan se crean solas.
      </div>
      <input type="file" accept=".xlsx,.xls" onChange={manejarArchivo} style={{ marginBottom: 12, fontSize: 12.5 }} />
      {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>}
      {pares && !error && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, color: C.ink, marginBottom: 8 }}>
            <strong>{nombreArchivo}</strong>: {pares.length} código{pares.length !== 1 ? "s" : ""} en {categoriasDistintas.length} categoría{categoriasDistintas.length !== 1 ? "s" : ""}.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {categoriasDistintas.map((c) => (
              <span key={c} style={{ padding: "3px 10px", borderRadius: 20, background: C.violetBg, color: C.violet, fontSize: 11.5, fontWeight: 700 }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Btn variant="secondary" onClick={onClose}>
          Cancelar
        </Btn>
        <Btn onClick={confirmar} disabled={!pares?.length || importando}>
          {importando ? "Importando..." : "Confirmar importación"}
        </Btn>
      </div>
    </Modal>
  );
}
function ProyeccionView({ compras, movimientos, presupuestos, calendarioCxp, categoriasProyeccionLista, categoriasPorConceptoProyeccion, onGuardar, onFinalizar, onDeletePresupuesto, onRecalcular, onAgregarCategoriaProyeccionLista, onEliminarCategoriaProyeccionLista, onGuardarCategoriaConceptoProyeccion, onImportarCategoriasProyeccion, isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  // Cada mes arranca colapsado (como una fila de lista) — se despliega solo
  // al hacer clic, para no tener que desplazarse por todos los meses
  // acumulados con su detalle completo abierto de una vez.
  const [expandidos, setExpandidos] = useState(new Set());
  // (2026-09-27, a pedido de Fredy) Categorías propias de Proyección --
  // separadas de las de Cuentas por Pagar, porque agrupan otro tipo de
  // gasto (rubros de Comparativo por Concepto, no proveedores). Se asignan
  // una sola vez por código de concepto y aplican a todos los meses.
  const [mostrarCategorias, setMostrarCategorias] = useState(false);
  const [mostrarImportarCategorias, setMostrarImportarCategorias] = useState(false);
  const [nuevaCategoriaProyeccion, setNuevaCategoriaProyeccion] = useState("");
  function categoriaDeConcepto(codConcep) {
    const cat = categoriasPorConceptoProyeccion.find((c) => c.codConcep === codConcep)?.categoria || "";
    return categoriasProyeccionLista.some((c) => c.id === cat) ? cat : "";
  }
  // Todos los códigos de concepto vistos alguna vez en Comparativo por
  // Concepto (no solo los de un presupuesto puntual), para poder
  // categorizarlos desde acá aunque todavía no estén en ningún presupuesto.
  const conceptosVistos = calcularBaseItemsPromedio(compras);
  async function agregarCategoriaProyeccion() {
    const label = nuevaCategoriaProyeccion.trim();
    if (!label) return;
    await onAgregarCategoriaProyeccionLista(label);
    setNuevaCategoriaProyeccion("");
  }
  function toggleExpand(id) {
    setExpandidos((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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
      {mostrarImportarCategorias && (
        <ImportarCategoriasProyeccionModal
          onImportar={onImportarCategoriasProyeccion}
          onClose={() => setMostrarImportarCategorias(false)}
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
            Presupuesto mensual estimado a partir del histórico de Comparativo por Concepto. Si cuadras IVA/Retención de una compra después de crear un presupuesto, usa "🔄 Recalcular" en esa tarjeta para actualizarlo.
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
      {isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setMostrarCategorias((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.violet, fontWeight: 700, fontSize: 12, padding: 0, marginBottom: mostrarCategorias ? 12 : 0 }}
          >
            {mostrarCategorias ? "▲ Ocultar categorías de Proyección" : "⚙️ Categorías de Proyección"}
          </button>
          {mostrarCategorias && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white, width: 320 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 4 }}>🏷️ Categorías</div>
                <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 10 }}>
                  Propias de Proyección -- no son las mismas de Cuentas por Pagar.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {categoriasProyeccionLista.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: C.canvas, borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{c.label}</span>
                      <button
                        onClick={() => onEliminarCategoriaProyeccionLista(c.id)}
                        title="Eliminar categoría"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontWeight: 700, fontSize: 12 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {!categoriasProyeccionLista.length && (
                    <div style={{ fontSize: 11.5, color: C.slate }}>Aún no hay categorías creadas.</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <FInput value={nuevaCategoriaProyeccion} onChange={setNuevaCategoriaProyeccion} placeholder="Categoría nueva" />
                  </div>
                  <Btn small onClick={agregarCategoriaProyeccion} disabled={!nuevaCategoriaProyeccion.trim()}>+ Agregar</Btn>
                </div>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.white, flex: 1, minWidth: 320 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: C.ink }}>🔗 Categoría por concepto</div>
                  <Btn small variant="secondary" onClick={() => setMostrarImportarCategorias(true)}>📥 Importar desde Excel</Btn>
                </div>
                <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 10 }}>
                  Se asigna una sola vez por código y aplica a todos los meses, pasados y futuros, que usen ese concepto.
                </div>
                {!conceptosVistos.length ? (
                  <div style={{ fontSize: 11.5, color: C.slate }}>
                    Aún no hay conceptos -- importa Comparativo por Concepto primero.
                  </div>
                ) : !categoriasProyeccionLista.length ? (
                  <div style={{ fontSize: 11.5, color: C.slate }}>Crea primero al menos una categoría.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
                    {conceptosVistos.map((b) => {
                      const actual = categoriaDeConcepto(b.codConcep);
                      return (
                        <div key={b.codConcep} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 10px", background: C.canvas, borderRadius: 8 }}>
                          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>
                            {b.concepto} <span style={{ fontWeight: 400, color: C.slate, fontSize: 10.5 }}>({b.codConcep})</span>
                          </span>
                          <select
                            value={actual}
                            onChange={(e) => onGuardarCategoriaConceptoProyeccion(b.codConcep, e.target.value || null)}
                            style={{ padding: "5px 8px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 11.5, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
                          >
                            <option value="">Sin categoría</option>
                            {categoriasProyeccionLista.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.label}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {!lista.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
          Aún no has creado ninguna proyección. Usa "+ Nueva Proyección" para armar el presupuesto del próximo mes.
        </div>
      ) : (
        <>
          {/* Selector de mes: todos los meses quedan a la vista como chips —
              al hacer clic en uno, la página se desplaza directo a esa
              tarjeta, sin tener que bajar buscando entre todas. */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {lista.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setExpandidos((s) => new Set(s).add(p.id));
                  setTimeout(() => document.getElementById(`proy-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${p.estado === "terminado" ? C.green : C.amber}`,
                  background: p.estado === "terminado" ? C.greenBg : C.amberBg,
                  color: p.estado === "terminado" ? C.green : C.amber,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {fmtMesLargo(p.mes)}
              </button>
            ))}
          </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {lista.map((p) => {
            const ingresosMes = movimientos.filter((m) => m.tipo === "ingreso" && m.fecha?.slice(0, 7) === p.mes);
            const ingresosReales = ingresosMes.reduce((s, m) => s + m.valor, 0);
            const avancePct = p.totalProyectado > 0 ? Math.min((ingresosReales / p.totalProyectado) * 100, 999) : 0;
            const terminado = p.estado === "terminado";
            const pagosCxpMes = (calendarioCxp || []).filter((c) => c.mes === p.mes);
            const totalPagosCxp = pagosCxpMes.reduce((s, c) => s + c.monto, 0);
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
                    // Si ya se cuadró el IVA/Retención de la compra real de ESTE
                    // mes (en Comparativo por Concepto), el avance se compara
                    // contra ese Valor Neto real en vez del promedio proyectado
                    // — así no se ve "pagado de más" solo porque el proyectado
                    // no incluía IVA.
                    const registroReal = compras.find(
                      (c) => c.mes === p.mes && c.codConcep === i.codConcep && c.concepto === i.concepto
                    );
                    const cuadrado = !!registroReal && (registroReal.iva !== undefined || registroReal.retencion !== undefined);
                    const objetivo = cuadrado
                      ? registroReal.valor + (registroReal.iva || 0) - (registroReal.retencion || 0)
                      : i.valorFinal;
                    const pct = objetivo > 0 ? Math.min((cubierto / objetivo) * 100, 999) : 0;
                    return { ...i, cubierto, objetivo, cuadrado, pct };
                  })
              : [];
            const disponibleSinAsignar = ingresosMes.reduce((s, m) => {
              const asignado = (m.distribucion || []).reduce((s2, d) => s2 + (parseFloat(d.monto) || 0), 0);
              return s + (m.valor - asignado);
            }, 0);
            const expandido = expandidos.has(p.id);
            // Agrupa los rubros incluidos de ESTE presupuesto por categoría
            // de Proyección, con "Sin categoría" al final -- se ve siempre
            // que se expande la tarjeta, esté en borrador o terminado
            // (a diferencia de "Avance por rubro", que solo aplica una vez
            // terminado).
            const itemsIncluidos = (p.items || []).filter((i) => i.incluido);
            const gruposCategoria = [...categoriasProyeccionLista.map((c) => c.id), ""]
              .map((catId) => {
                const itemsGrupo = itemsIncluidos.filter((i) => (categoriaDeConcepto(i.codConcep) || "") === catId);
                const label = catId ? categoriasProyeccionLista.find((c) => c.id === catId)?.label || "" : "Sin categoría";
                const subtotal = itemsGrupo.reduce((s, i) => s + i.valorFinal, 0);
                return { id: catId || "sin_categoria", label, items: itemsGrupo, subtotal };
              })
              .filter((g) => g.items.length > 0);
            return (
              <div key={p.id} id={`proy-${p.id}`} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", scrollMarginTop: 20 }}>
                <div
                  onClick={() => toggleExpand(p.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 20, cursor: "pointer" }}
                >
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
                      {totalPagosCxp > 0 ? ` · 🧾 ${fmtCOP(totalPagosCxp)} programados` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 20, color: C.slate, transform: expandido ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0, marginLeft: 12 }}>
                    ›
                  </span>
                </div>
                {expandido && (
                  <div style={{ padding: "0 20px 20px" }}>
                    {!!gruposCategoria.length && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Presupuesto por categoría</div>
                        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                            <tbody>
                              {gruposCategoria.map((g) => (
                                <Fragment key={g.id}>
                                  <tr style={{ background: C.canvas }}>
                                    <td colSpan={2} style={{ padding: "7px 12px", borderTop: `2px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                        <span style={{ fontWeight: 800, fontSize: 11, color: C.slate, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                          {g.label} <span style={{ fontWeight: 500, textTransform: "none" }}>({g.items.length})</span>
                                        </span>
                                        <span style={{ fontWeight: 800, fontSize: 12, color: C.ink }}>{fmtCOP(g.subtotal)}</span>
                                      </div>
                                    </td>
                                  </tr>
                                  {g.items.map((i) => (
                                    <tr key={i.key || `${i.codConcep}__${i.concepto}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                                      <td style={{ padding: "6px 12px", color: C.ink }}>
                                        {i.concepto} <span style={{ color: C.slate, fontSize: 11 }}>({i.codConcep})</span>
                                      </td>
                                      <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>
                                        {fmtCOP(i.valorFinal)}
                                      </td>
                                    </tr>
                                  ))}
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
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
                        <Btn small variant="secondary" onClick={() => onRecalcular(p.id)}>
                          🔄 Recalcular
                        </Btn>
                        <Btn small variant="danger" onClick={() => onDeletePresupuesto(p.id)}>
                          Eliminar
                        </Btn>
                      </div>
                    )}
                    {totalPagosCxp > 0 && (
                      <div style={{ marginTop: 0, marginBottom: terminado ? 14 : 0, padding: "10px 14px", background: C.amberBg, borderRadius: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 6 }}>
                          <span>🧾 Pagos programados (Cuentas por Pagar)</span>
                          <span>{fmtCOP(totalPagosCxp)}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto", paddingRight: 4 }}>
                          {pagosCxpMes.map((c) => (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.slate }}>
                              <span>{c.proveedor}</span>
                              <span>{fmtCOP(c.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
                          {itemsConAvance.map((i) => (
                            <div key={i.key || `${i.codConcep}__${i.concepto}`}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.slate, marginBottom: 3 }}>
                                <span>
                                  {i.concepto} <span style={{ color: C.slate, fontWeight: 400 }}>({i.codConcep})</span>
                                  {i.cuadrado && (
                                    <span title="Objetivo ajustado con IVA/Retención cuadrados" style={{ marginLeft: 6, fontSize: 10, color: C.green, fontWeight: 700 }}>
                                      ● Neto cuadrado
                                    </span>
                                  )}
                                </span>
                                <span style={{ fontWeight: 700, color: i.pct >= 100 ? C.green : C.ink }}>
                                  {fmtCOP(i.cubierto)} / {fmtCOP(i.objetivo)} · {Math.round(i.pct)}%
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
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}

function PresupuestoClientesView({ movimientos, presupuestosCliente, clientesDiseno, onGuardar, onDelete, isAdmin }) {
  const [mes, setMes] = useState(() => today().slice(0, 7));
  const [showAdd, setShowAdd] = useState(false);
  const [clienteNuevo, setClienteNuevo] = useState("");
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [montoNuevo, setMontoNuevo] = useState("");
  const presupuestosMes = presupuestosCliente.filter((p) => p.mes === mes);
  // Un mismo cliente puede tener varias líneas de presupuesto el mismo mes,
  // una por categoría (Anticipo Nómina, Insumos, Tela, Maquinaria) — así se
  // sabe cuánto se espera de cada cliente Y de cada categoría por separado.
  const pairExiste = (cliente, categoria) =>
    presupuestosMes.some((p) => p.cliente === cliente && p.categoria === categoria);
  function abonadoDe(cliente, categoria) {
    return movimientos
      .filter(
        (m) =>
          m.tipo === "ingreso" &&
          m.fecha?.slice(0, 7) === mes &&
          (m.cliente || m.proveedor) === cliente &&
          (!categoria || m.categoria === categoria)
      )
      .reduce((s, m) => s + m.valor, 0);
  }
  function agregar() {
    if (!clienteNuevo || !categoriaNueva || !montoNuevo) return;
    if (pairExiste(clienteNuevo, categoriaNueva)) return;
    onGuardar({
      id: uid(),
      mes,
      cliente: clienteNuevo,
      categoria: categoriaNueva,
      monto: parseFloat(montoNuevo) || 0,
      creadoEn: new Date().toISOString(),
    });
    setClienteNuevo("");
    setCategoriaNueva("");
    setMontoNuevo("");
    setShowAdd(false);
  }
  // Tela no cuenta para el presupuesto final: hoy se puede llevar abono de
  // Nómina, Insumos, Tela y Maquinaria, pero solo las primeras tres (menos
  // Tela) sirven para el total que se compara contra lo abonado.
  const CATEGORIA_NO_CUENTA = "Anticipo Tela";
  const totalPresupuestado = presupuestosMes
    .filter((p) => p.categoria !== CATEGORIA_NO_CUENTA)
    .reduce((s, p) => s + p.monto, 0);
  const totalAbonado = presupuestosMes
    .filter((p) => p.categoria !== CATEGORIA_NO_CUENTA)
    .reduce((s, p) => s + abonadoDe(p.cliente, p.categoria), 0);
  // Resumen agregado por categoría: cuánto se presupuestó vs. cuánto entró
  // realmente ese mes en cada categoría, sumando todos los clientes.
  const resumenCategorias = CATS_INGRESO.map((cat) => {
    const presupuestado = presupuestosMes.filter((p) => p.categoria === cat).reduce((s, p) => s + p.monto, 0);
    const abonado = movimientos
      .filter((m) => m.tipo === "ingreso" && m.fecha?.slice(0, 7) === mes && m.categoria === cat)
      .reduce((s, m) => s + m.valor, 0);
    return { categoria: cat, presupuestado, abonado };
  }).filter((r) => r.presupuestado > 0 || r.abonado > 0);
  // Agrupación por cliente: cada cliente muestra las 4 ramificaciones
  // (Nómina, Tela, Insumos, Maquinaria) por las que se puede llevar abono,
  // aunque no todas tengan presupuesto asignado todavía.
  const clientesConPresupuesto = Array.from(new Set(presupuestosMes.map((p) => p.cliente))).sort((a, b) =>
    a.localeCompare(b)
  );
  const yaExisteDuplicado = clienteNuevo && categoriaNueva && pairExiste(clienteNuevo, categoriaNueva);
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
            Cuánto esperas que abone cada cliente este mes, por categoría, según sus pedidos
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
            <FSel value={clienteNuevo} onChange={setClienteNuevo} options={(clientesDiseno || []).map((c) => c.nombre)} />
          </Field>
          <Field label="Categoría">
            <FSel value={categoriaNueva} onChange={setCategoriaNueva} options={CATS_INGRESO} />
          </Field>
          <Field label="Monto esperado este mes">
            <FInput type="number" value={montoNuevo} onChange={setMontoNuevo} placeholder="Ej: 20000000" />
          </Field>
          {yaExisteDuplicado && (
            <div
              style={{
                padding: "8px 12px",
                background: C.redBg,
                borderRadius: 8,
                fontSize: 12,
                color: C.red,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              Ya existe un presupuesto para este cliente en esta categoría este mes.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>
              Cancelar
            </Btn>
            <Btn variant="danger" onClick={agregar} disabled={!clienteNuevo || !categoriaNueva || !montoNuevo || yaExisteDuplicado}>
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
              marginBottom: resumenCategorias.length ? 16 : 24,
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
          {resumenCategorias.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${resumenCategorias.length},1fr)`,
                gap: 10,
                marginBottom: 24,
              }}
            >
              {resumenCategorias.map((r) => {
                const pct = r.presupuestado > 0 ? Math.min((r.abonado / r.presupuestado) * 100, 999) : 0;
                return (
                  <div key={r.categoria} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, marginBottom: 4 }}>{r.categoria}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: pct >= 100 ? C.green : C.amber }}>
                      {fmtCOP(r.abonado)} / {fmtCOP(r.presupuestado)}
                    </div>
                    <div style={{ fontSize: 10, color: C.slate, fontWeight: 600 }}>{Math.round(pct)}% cumplido</div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {clientesConPresupuesto.map((cliente) => {
              const ramas = CATS_INGRESO.map((cat) => {
                const p = presupuestosMes.find((x) => x.cliente === cliente && x.categoria === cat);
                const monto = p ? p.monto : 0;
                const abonado = abonadoDe(cliente, cat);
                const pct = monto > 0 ? Math.min((abonado / monto) * 100, 999) : 0;
                return { cat, p, monto, abonado, pct, cuenta: cat !== CATEGORIA_NO_CUENTA };
              });
              const clienteTotalPresupuestado = ramas.filter((r) => r.cuenta).reduce((s, r) => s + r.monto, 0);
              const clienteTotalAbonado = ramas.filter((r) => r.cuenta).reduce((s, r) => s + r.abonado, 0);
              const clientePct =
                clienteTotalPresupuestado > 0 ? Math.min((clienteTotalAbonado / clienteTotalPresupuestado) * 100, 999) : 0;
              const tonoCliente =
                clienteTotalPresupuestado === 0 ? C.slate : clientePct >= 100 ? C.green : clientePct >= 50 ? C.amber : C.red;
              const tonoClienteBg =
                clienteTotalPresupuestado === 0 ? C.canvas : clientePct >= 100 ? C.greenBg : clientePct >= 50 ? C.amberBg : C.redBg;
              return (
                <div
                  key={cliente}
                  style={{
                    background: C.white,
                    borderRadius: 16,
                    border: `1px solid ${C.border}`,
                    borderLeft: `4px solid ${tonoCliente}`,
                    padding: "18px 22px",
                    boxShadow: "0 1px 3px rgba(26,26,46,0.06), 0 1px 2px rgba(26,26,46,0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={cliente} size={32} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{cliente}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: tonoCliente,
                        background: tonoClienteBg,
                        padding: "4px 10px",
                        borderRadius: 20,
                      }}
                    >
                      {fmtCOP(clienteTotalAbonado)} / {fmtCOP(clienteTotalPresupuestado)} · {Math.round(clientePct)}%
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ramas.map((r) => {
                      const tonoRama = !r.p ? C.slate : r.pct >= 100 ? C.green : r.pct >= 50 ? C.amber : C.red;
                      return (
                        <div key={r.cat} style={{ background: C.canvas, borderRadius: 10, padding: "10px 14px" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: r.p ? 6 : 0,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{r.cat}</span>
                              {!r.cuenta && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: C.slate,
                                    background: C.border,
                                    padding: "1px 6px",
                                    borderRadius: 20,
                                  }}
                                >
                                  No cuenta en el total
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {r.p ? (
                                <span style={{ fontSize: 11, fontWeight: 700, color: tonoRama }}>
                                  {fmtCOP(r.abonado)} / {fmtCOP(r.monto)} · {Math.round(r.pct)}%
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, fontStyle: "italic" }}>
                                  Sin presupuesto asignado
                                </span>
                              )}
                              {isAdmin && r.p && (
                                <button
                                  onClick={() => onDelete(r.p.id)}
                                  style={{
                                    background: C.redBg,
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "3px 7px",
                                    color: C.red,
                                    fontWeight: 700,
                                    fontSize: 10,
                                    cursor: "pointer",
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                          {r.p && (
                            <div style={{ height: 7, borderRadius: 20, background: C.border, overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%",
                                  width: `${Math.min(r.pct, 100)}%`,
                                  background: tonoRama,
                                  borderRadius: 20,
                                  transition: "width 0.3s ease",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
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

function SaldoNetoChart({ filas }) {
  const W = 900, H = 300, padL = 90, padR = 24, padT = 20, padB = 40;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const n = filas.length;
  const vals = filas.map((f) => f.saldoAcumulado);
  const maxV = Math.max(0, ...vals, 1);
  const minV = Math.min(0, ...vals);
  const rango = maxV - minV || 1;
  const xAt = (i) => padL + (n > 1 ? (i * chartW) / (n - 1) : 0);
  const yAt = (v) => padT + chartH - ((v - minV) / rango) * chartH;
  const yZero = yAt(0);
  const puntos = filas.map((f, i) => ({ x: xAt(i), y: yAt(f.saldoAcumulado), ...f }));
  const linePath = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L ${puntos[puntos.length - 1].x},${yZero} L ${puntos[0].x},${yZero} Z`;
  const gridFracs = [0, 0.25, 0.5, 0.75, 1];
  const idxDeficit = filas.findIndex((f) => f.saldoAcumulado < 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="pgAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.violet} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.violet} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {gridFracs.map((fr) => {
        const v = minV + fr * rango;
        const y = padT + chartH - fr * chartH;
        return (
          <g key={fr}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={C.border} strokeWidth="1" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill={C.slate}>
              {fmtCOP(v)}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={yZero} x2={W - padR} y2={yZero} stroke={C.ink} strokeWidth="1.2" strokeDasharray="3 3" />
      {idxDeficit >= 0 && (
        <g>
          <line
            x1={puntos[idxDeficit].x}
            y1={padT}
            x2={puntos[idxDeficit].x}
            y2={padT + chartH}
            stroke={C.red}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text x={puntos[idxDeficit].x} y={padT - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.red}>
            Déficit desde: {fmtMesCorto(filas[idxDeficit].mes)}
          </text>
        </g>
      )}
      <path d={areaPath} fill="url(#pgAreaGrad)" stroke="none" />
      <path d={linePath} fill="none" stroke={C.violet} strokeWidth="2.5" />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === n - 1 ? 3.5 : 2.5} fill={p.saldoAcumulado < 0 ? C.red : C.green}>
          <title>
            {fmtMesLargo(p.mes)} — Saldo acumulado: {fmtCOP(p.saldoAcumulado)} (neto del mes: {fmtCOP(p.saldoNeto)})
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
// ─── PROGRAMACIÓN DE PAGOS ──────────────────────────────────────────────────
// Cruza, mes a mes, lo que se espera que entre de clientes (Presupuesto
// Clientes) contra lo que ya está comprometido salir: el presupuesto por
// rubro de Proyección más los pagos a proveedores programados en Cuentas por
// Pagar. El saldo neto de cada mes se arrastra (acumulado) para detectar con
// anticipación en qué mes la caja quedaría en déficit si no se ajusta el
// calendario de pagos.
function ProgramacionPagosView({ presupuestosCliente, presupuestos, calendarioCxp }) {
  const meses = proximosMeses(24);
  let acumulado = 0;
  const filas = meses.map((m) => {
    const ingresosEsperados = (presupuestosCliente || []).filter((p) => p.mes === m).reduce((s, p) => s + (p.monto || 0), 0);
    const egresosComprometidos = (presupuestos || []).filter((p) => p.mes === m).reduce((s, p) => s + (p.totalProyectado || 0), 0);
    const pagosCxp = (calendarioCxp || []).filter((c) => c.mes === m).reduce((s, c) => s + (c.monto || 0), 0);
    const saldoNeto = ingresosEsperados - egresosComprometidos - pagosCxp;
    acumulado += saldoNeto;
    return { mes: m, ingresosEsperados, egresosComprometidos, pagosCxp, saldoNeto, saldoAcumulado: acumulado };
  });
  const totalIngresos = filas.reduce((s, f) => s + f.ingresosEsperados, 0);
  const totalEgresos = filas.reduce((s, f) => s + f.egresosComprometidos, 0);
  const totalPagosCxp = filas.reduce((s, f) => s + f.pagosCxp, 0);
  const saldoFinal = filas.length ? filas[filas.length - 1].saldoAcumulado : 0;
  const primerDeficit = filas.find((f) => f.saldoAcumulado < 0);
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Programación de Pagos</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
          Cruza mes a mes lo que esperas que te ingresen los clientes (Presupuesto Clientes) contra lo comprometido en Proyección y en el calendario de Cuentas por Pagar.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <KPI icon="🤝" label="Ingresos esperados (24m)" value={fmtCOP(totalIngresos)} color={C.green} bg={C.greenBg} />
        <KPI icon="🎯" label="Egresos comprometidos (24m)" value={fmtCOP(totalEgresos)} color={C.blue} bg={C.blueBg} />
        <KPI icon="🧾" label="Pagos CxP programados (24m)" value={fmtCOP(totalPagosCxp)} color={C.amber} bg={C.amberBg} />
        <KPI
          icon={saldoFinal >= 0 ? "✓" : "⚠"}
          label="Saldo neto acumulado (mes 24)"
          value={fmtCOP(saldoFinal)}
          color={saldoFinal >= 0 ? C.green : C.red}
          bg={saldoFinal >= 0 ? C.greenBg : C.redBg}
          sub={primerDeficit ? `Déficit desde ${fmtMesCorto(primerDeficit.mes)}` : "Sin déficit proyectado"}
        />
      </div>
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>Saldo neto acumulado proyectado</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 16 }}>
          Ingresos esperados de clientes menos egresos comprometidos (Proyección) menos pagos a proveedores programados (Cuentas por Pagar), acumulado mes a mes.
        </div>
        <SaldoNetoChart filas={filas} />
      </div>
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.ink }}>
              {["Mes", "Ingresos esperados", "Egresos comprometidos", "Pagos CxP", "Saldo neto mes", "Saldo acumulado"].map((h) => (
                <th key={h} style={{ padding: "9px 12px", color: C.seam, textAlign: h === "Mes" ? "left" : "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.mes} style={{ background: f.saldoAcumulado < 0 ? C.redBg : i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: C.ink, textTransform: "capitalize" }}>{fmtMesLargo(f.mes)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: C.green }}>{fmtCOP(f.ingresosEsperados)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: C.blue }}>{fmtCOP(f.egresosComprometidos)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: C.amber }}>{fmtCOP(f.pagosCxp)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: f.saldoNeto < 0 ? C.red : C.ink }}>{fmtCOP(f.saldoNeto)}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 800, color: f.saldoAcumulado < 0 ? C.red : C.green }}>{fmtCOP(f.saldoAcumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ESTRATEGIA DE PAGO ─────────────────────────────────────────────────────
// (2026-09-27, a pedido de Fredy) Ordena TODAS las cuentas por pagar por
// antigüedad (91+ días primero, igual que "Ordenar por" en Cuentas por
// Pagar, pero acá se aplica a todos los proveedores a la vez, no a uno por
// uno) y reparte el disponible proyectado de caja (mismo cruce Ingresos
// esperados de clientes − Egresos comprometidos de Proyección que usa
// Programación de Pagos) mes a mes, empezando siempre por lo más vencido.
// Es una SUGERENCIA de lectura — no toca el calendario de Cuentas por Pagar
// hasta que se pulse "Aplicar esta sugerencia", que reemplaza el calendario
// de cada proveedor incluido en el plan (mismo guardarCalendarioProveedor
// que usa "Programar pago" en Cuentas por Pagar, uno por uno).
function EstrategiaPagoView({ cortes, manuales, calendario, presupuestosCliente, presupuestos, nombresProveedor, onAplicarPlan, isAdmin }) {
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState(false);

  // Mismo patrón que CuentasPorPagarView: si Busint no tiene el proveedor en
  // su catálogo, sale como "Proveedor <código>" — se muestra el nombre
  // manual si existe, pero `nombre` (el crudo) se deja intacto porque es la
  // llave que usa el calendario de pago.
  function conNombreMostrado(p) {
    const m = /^Proveedor (\d+)$/.exec(p.nombre || "");
    const codigoSinNombre = m ? m[1] : null;
    const nombreMostrado = (codigoSinNombre && nombresProveedor?.[codigoSinNombre]) || p.nombre;
    return { ...p, codigoSinNombre, nombreMostrado };
  }

  const cortesOrdenados = [...cortes].sort((a, b) => b.fechaCorte.localeCompare(a.fechaCorte));
  const corteActivo = cortesOrdenados[0];
  const filasCorte = (corteActivo?.proveedores || []).map((p) => conNombreMostrado({ ...p, origen: "corte" }));
  const filasManual = manuales.map((p) => conNombreMostrado({ ...p, origen: "manual" }));
  const filas = [...filasCorte, ...filasManual].filter((f) => f.total > 0);

  // Urgencia: la franja de vencimiento más vieja que tenga saldo manda el
  // orden (tier); dentro del mismo tier, primero el que más debe en esa
  // franja.
  function urgencia(f) {
    if (f.dias91mas > 0) return [4, f.dias91mas];
    if (f.dias61a90 > 0) return [3, f.dias61a90];
    if (f.dias31a60 > 0) return [2, f.dias31a60];
    if (f.dias0a30 > 0) return [1, f.dias0a30];
    return [0, f.total];
  }
  const ETIQUETAS_TIER = ["Al día / por vencer", "0-30 días", "31-60 días", "61-90 días", "91+ días (más urgente)"];
  const COLORES_TIER = [C.slate, C.amber, C.amber, C.red, C.red];

  const filasOrdenadas = [...filas].sort((a, b) => {
    const [ta, ma] = urgencia(a);
    const [tb, mb] = urgencia(b);
    if (tb !== ta) return tb - ta;
    return mb - ma;
  });

  // Disponible proyectado por mes: mismo cruce que Programación de Pagos
  // (Ingresos esperados − Egresos comprometidos), pero SIN restar lo que ya
  // esté en el calendario de Cuentas por Pagar -- esta vista replantea desde
  // cero cuánto hay para prometer, no lo que ya se prometió antes.
  const meses = proximosMeses(24);
  const disponibleMes = {};
  meses.forEach((m) => {
    const ingresosEsperados = (presupuestosCliente || []).filter((p) => p.mes === m).reduce((s, p) => s + (p.monto || 0), 0);
    const egresosComprometidos = (presupuestos || []).filter((p) => p.mes === m).reduce((s, p) => s + (p.totalProyectado || 0), 0);
    disponibleMes[m] = Math.max(ingresosEsperados - egresosComprometidos, 0);
  });

  // Reparto: recorre los proveedores en orden de urgencia y les va asignando
  // meses (del más próximo al más lejano) hasta cubrir su deuda, consumiendo
  // el mismo cupo mensual compartido entre todos -- así un 91+ siempre come
  // primero del disponible que uno recién vencido.
  const disponibleRestante = { ...disponibleMes };
  const planPorProveedor = {};
  filasOrdenadas.forEach((f) => {
    let pendiente = f.total;
    const entradas = [];
    for (const m of meses) {
      if (pendiente <= 0) break;
      const disp = disponibleRestante[m] || 0;
      if (disp <= 0) continue;
      const monto = Math.min(disp, pendiente);
      entradas.push({ mes: m, monto });
      disponibleRestante[m] -= monto;
      pendiente -= monto;
    }
    if (entradas.length) planPorProveedor[f.nombre] = entradas;
  });

  const totalDeuda = filas.reduce((s, f) => s + f.total, 0);
  const totalPlanificado = Object.values(planPorProveedor).reduce((s, es) => s + es.reduce((s2, e) => s2 + e.monto, 0), 0);
  const totalSinCubrir = totalDeuda - totalPlanificado;

  async function aplicar() {
    setAplicando(true);
    try {
      await onAplicarPlan(planPorProveedor);
      setAplicado(true);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Estrategia de Pago</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.slate, maxWidth: 780 }}>
          Ordena todas las cuentas por pagar del corte más reciente por antigüedad (91+ días primero) y reparte el disponible proyectado de caja mes a mes, empezando siempre por lo más vencido. Es una sugerencia de lectura — no cambia nada hasta que se aplique.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 22 }}>
        <KPI icon="📌" label="Deuda total (corte más reciente + manuales)" value={fmtCOP(totalDeuda)} color={C.violet} bg={C.violetBg} />
        <KPI icon="✅" label="Cubierto por el plan (próx. 24 meses)" value={fmtCOP(totalPlanificado)} color={C.green} bg={C.greenBg} />
        <KPI icon="⚠️" label="Sin cupo todavía" value={fmtCOP(totalSinCubrir)} color={totalSinCubrir > 0 ? C.red : C.green} bg={totalSinCubrir > 0 ? C.redBg : C.greenBg} />
      </div>
      {!filas.length ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.slate, fontSize: 13 }}>
          No hay cuentas por pagar registradas todavía. Importa un corte o agrega proveedores manuales desde Contabilidad → Cuentas por Pagar.
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.canvas }}>
                  <th style={{ textAlign: "left", padding: "9px 12px", color: C.slate, fontWeight: 700 }}>Proveedor</th>
                  <th style={{ textAlign: "left", padding: "9px 12px", color: C.slate, fontWeight: 700 }}>Urgencia</th>
                  <th style={{ textAlign: "right", padding: "9px 12px", color: C.slate, fontWeight: 700 }}>Deuda total</th>
                  <th style={{ textAlign: "left", padding: "9px 12px", color: C.slate, fontWeight: 700 }}>Mes(es) sugerido(s)</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((f) => {
                  const [tier] = urgencia(f);
                  const entradas = planPorProveedor[f.nombre] || [];
                  return (
                    <tr key={f.nombre} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: C.ink }}>{f.nombreMostrado}</td>
                      <td style={{ padding: "9px 12px", color: COLORES_TIER[tier], fontWeight: 700 }}>{ETIQUETAS_TIER[tier]}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.ink }}>{fmtCOP(f.total)}</td>
                      <td style={{ padding: "9px 12px", color: C.slate }}>
                        {entradas.length
                          ? entradas.map((e) => `${fmtMesCorto(e.mes)}: ${fmtCOP(e.monto)}`).join(" · ")
                          : "Sin cupo disponible en los próximos 24 meses"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              {aplicado && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ Plan aplicado al calendario de Cuentas por Pagar</span>}
              <Btn onClick={aplicar} disabled={aplicando || !Object.keys(planPorProveedor).length}>
                {aplicando ? "Aplicando..." : "✅ Aplicar esta sugerencia"}
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// (2026-09-27, a pedido de Fredy) Shell de nivel superior de Financiera --
// mismo patrón sidebar + NAV que Contabilidad. La pantalla original de
// Financiera (ver PagoNominaView, arriba) pasa a ser una vista más, junto a
// Proyección, Presupuesto Clientes y Programación de Pagos (migradas de
// Contabilidad, que se queda solo con el registro: saldos, vencidos,
// cartera y costos) y la vista nueva de Estrategia de Pago.
export function FinancieraStandalone({ currentUser, onVolver, onLogout }) {
  const [subView, setSubView] = useState("pago_nomina");
  const [movimientos, setMovimientos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [presupuestosCliente, setPresupuestosCliente] = useState([]);
  const [cortesCxp, setCortesCxp] = useState([]);
  const [manualCxp, setManualCxp] = useState([]);
  const [calendarioCxp, setCalendarioCxp] = useState([]);
  const [nombresProveedorCxp, setNombresProveedorCxp] = useState({});
  const [clientesDiseno, setClientesDiseno] = useState([]);
  // (2026-09-27, a pedido de Fredy) Categorías propias de Proyección (ej.
  // Vigilancia, Combustible, Seguros) para agrupar el presupuesto por
  // categoría -- separadas de las de Cuentas por Pagar. categoriasPorConceptoProyeccion
  // asigna cada código de concepto (codConcep de Comparativo por Concepto)
  // a una categoría, una sola vez.
  const [categoriasProyeccionLista, setCategoriasProyeccionLista] = useState([]);
  const [categoriasPorConceptoProyeccion, setCategoriasPorConceptoProyeccion] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubMovimientos = onSnapshot(collection(db, "contabilidad_movimientos"), (snap) => {
      setMovimientos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    const unsubCompras = onSnapshot(collection(db, "contabilidad_compras"), (snap) => {
      setCompras(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubPresupuestos = onSnapshot(collection(db, "contabilidad_presupuestos"), (snap) => {
      setPresupuestos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubPresupuestosCliente = onSnapshot(collection(db, "contabilidad_presupuestos_cliente"), (snap) => {
      setPresupuestosCliente(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubCortesCxp = onSnapshot(collection(db, "contabilidad_cxp_cortes"), (snap) => {
      setCortesCxp(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubManualCxp = onSnapshot(collection(db, "contabilidad_cxp_manual"), (snap) => {
      setManualCxp(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubCalendarioCxp = onSnapshot(collection(db, "contabilidad_cxp_calendario"), (snap) => {
      setCalendarioCxp(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    const unsubNombresProveedorCxp = onSnapshot(collection(db, "contabilidad_cxp_nombres_proveedor"), (snap) => {
      const mapa = {};
      snap.docs.forEach((d) => { mapa[d.id] = d.data()?.nombre || ""; });
      setNombresProveedorCxp(mapa);
    });
    const unsubClientes = onSnapshot(doc(db, "config", "main"), (snap) => {
      setClientesDiseno(snap.exists() ? snap.data()?.clientes || [] : []);
    });
    const unsubCategoriasProyeccionLista = onSnapshot(
      collection(db, "contabilidad_proyeccion_categorias_lista"),
      (snap) => {
        setCategoriasProyeccionLista(
          snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .sort((a, b) => (a.creadoEn || "").localeCompare(b.creadoEn || ""))
        );
      }
    );
    // Categoría por código de concepto (doc id = codConcep, ej. "*COMB").
    const unsubCategoriasPorConceptoProyeccion = onSnapshot(
      collection(db, "contabilidad_proyeccion_categorias_concepto"),
      (snap) => {
        setCategoriasPorConceptoProyeccion(snap.docs.map((d) => ({ ...d.data(), codConcep: d.id })));
      }
    );
    return () => {
      unsubMovimientos();
      unsubCompras();
      unsubPresupuestos();
      unsubPresupuestosCliente();
      unsubCortesCxp();
      unsubManualCxp();
      unsubCalendarioCxp();
      unsubNombresProveedorCxp();
      unsubClientes();
      unsubCategoriasProyeccionLista();
      unsubCategoriasPorConceptoProyeccion();
    };
  }, []);

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
  async function recalcularPresupuesto(id) {
    const p = presupuestos.find((x) => x.id === id);
    if (!p) return;
    const baseItems = calcularBaseItemsPromedio(compras);
    const itemsNuevos = baseItems.map((b) => {
      const anterior = (p.items || []).find((i) => i.codConcep === b.codConcep && i.concepto === b.concepto);
      const incluido = anterior ? !!anterior.incluido : true;
      const valorFinal = incluido ? b.promedio * (1 + (parseFloat(p.ajustePct) || 0) / 100) : 0;
      return { codConcep: b.codConcep, concepto: b.concepto, promedio: b.promedio, incluido, valorFinal };
    });
    const totalProyectado = itemsNuevos.filter((i) => i.incluido).reduce((s, i) => s + i.valorFinal, 0);
    const patch = { items: itemsNuevos, totalProyectado, recalculadoEn: new Date().toISOString() };
    setPresupuestos((ps) => ps.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await fsSave("contabilidad_presupuestos", id, patch);
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
  async function agregarCategoriaProyeccionLista(label) {
    const limpio = (label || "").trim();
    if (!limpio) return;
    const nueva = { id: uid(), label: limpio, creadoEn: new Date().toISOString() };
    setCategoriasProyeccionLista((cs) => [...cs, nueva]);
    await fsSave("contabilidad_proyeccion_categorias_lista", nueva.id, nueva);
  }
  async function eliminarCategoriaProyeccionLista(id) {
    setCategoriasProyeccionLista((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("contabilidad_proyeccion_categorias_lista", id);
  }
  // El id del documento es el código de concepto mismo (ej. "*COMB"), así
  // que volver a guardar el mismo código simplemente actualiza la
  // categoría.
  async function guardarCategoriaConceptoProyeccion(codConcep, categoria) {
    if (!codConcep) return;
    setCategoriasPorConceptoProyeccion((cs) => {
      const sinViejo = cs.filter((c) => c.codConcep !== codConcep);
      return categoria ? [...sinViejo, { codConcep, categoria, actualizadoEn: new Date().toISOString() }] : sinViejo;
    });
    if (categoria) {
      await fsSave("contabilidad_proyeccion_categorias_concepto", codConcep, { categoria, actualizadoEn: new Date().toISOString() });
    } else {
      await fsDelete("contabilidad_proyeccion_categorias_concepto", codConcep);
    }
  }
  // Importa de una vez un listado código de concepto -> nombre de categoría
  // (desde ImportarCategoriasProyeccionModal): crea las categorías que
  // falten (comparando el nombre sin distinguir mayúsculas/acentos, para no
  // duplicar "Telas" y "telas") y asigna cada código a la que le
  // corresponde. Volver a importar el mismo archivo actualizado no borra
  // categorías ni asignaciones que no vengan en el archivo -- solo agrega o
  // actualiza lo que sí trae.
  async function importarCategoriasProyeccion(pares) {
    const claveNombre = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const porNombre = new Map(categoriasProyeccionLista.map((c) => [claveNombre(c.label), c]));
    const categoriasNuevas = [];
    [...new Set(pares.map((p) => p.categoria))].forEach((etiqueta) => {
      const clave = claveNombre(etiqueta);
      if (!porNombre.has(clave)) {
        const nueva = { id: uid(), label: etiqueta, creadoEn: new Date().toISOString() };
        porNombre.set(clave, nueva);
        categoriasNuevas.push(nueva);
      }
    });
    if (categoriasNuevas.length) {
      setCategoriasProyeccionLista((cs) => [...cs, ...categoriasNuevas]);
      await Promise.all(categoriasNuevas.map((c) => fsSave("contabilidad_proyeccion_categorias_lista", c.id, c)));
    }
    const asignaciones = pares
      .map((p) => ({
        codConcep: p.codConcep,
        categoria: porNombre.get(claveNombre(p.categoria))?.id,
        actualizadoEn: new Date().toISOString(),
      }))
      .filter((a) => a.categoria);
    setCategoriasPorConceptoProyeccion((cs) => {
      const sinViejos = cs.filter((c) => !asignaciones.some((a) => a.codConcep === c.codConcep));
      return [...sinViejos, ...asignaciones];
    });
    await Promise.all(
      asignaciones.map((a) =>
        fsSave("contabilidad_proyeccion_categorias_concepto", a.codConcep, { categoria: a.categoria, actualizadoEn: a.actualizadoEn })
      )
    );
  }
  // Reemplaza el calendario completo de un proveedor: borra las entradas
  // anteriores y guarda las nuevas (mismo comportamiento que en Contabilidad
  // → Cuentas por Pagar, que sigue usando esta misma operación para
  // "Programar pago" uno por uno).
  async function guardarCalendarioProveedor(proveedor, entradas) {
    const existentes = calendarioCxp.filter((c) => c.proveedor === proveedor);
    const nuevos = entradas.map((e) => ({
      id: uid(),
      proveedor,
      mes: e.mes,
      monto: e.monto,
      creadoEn: new Date().toISOString(),
    }));
    setCalendarioCxp((cs) => [...cs.filter((c) => c.proveedor !== proveedor), ...nuevos]);
    await Promise.all(existentes.map((e) => fsDelete("contabilidad_cxp_calendario", e.id)));
    await Promise.all(nuevos.map((n) => fsSave("contabilidad_cxp_calendario", n.id, n)));
  }
  // Aplica de una vez el plan completo que sugiere Estrategia de Pago:
  // reemplaza el calendario de cada proveedor incluido, uno por uno, con
  // guardarCalendarioProveedor -- mismo comportamiento que "Programar pago"
  // en Cuentas por Pagar, solo que para todos los proveedores a la vez.
  async function aplicarPlanEstrategia(plan) {
    await Promise.all(Object.entries(plan).map(([proveedor, entradas]) => guardarCalendarioProveedor(proveedor, entradas)));
  }

  const isAdmin = currentUser?.isAdmin;
  const NAV = [
    { id: "pago_nomina", icon: "💰", label: "Pago de Nómina" },
    { id: "proyeccion", icon: "🎯", label: "Proyección" },
    { id: "clientes", icon: "🤝", label: "Presupuesto Clientes" },
    { id: "programacion_pagos", icon: "🧭", label: "Programación de Pagos" },
    { id: "estrategia_pago", icon: "📌", label: "Estrategia de Pago" },
  ];

  if (loading)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💰</div>
          <div style={{ color: C.slate }}>Cargando Financiera...</div>
        </div>
      </div>
    );

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      {/* Sidebar */}
      <div style={{ width: 220, background: C.ink, padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>💰 Financiera</div>
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Industrias Yanko
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#2A2A45", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${C.seam},#9E8870)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.ink, flexShrink: 0 }}>
            {(currentUser?.name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser?.name}
            </div>
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
      {/* Main */}
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {subView === "pago_nomina" && <PagoNominaView currentUser={currentUser} />}
          {subView === "proyeccion" && (
            <ProyeccionView
              compras={compras}
              movimientos={movimientos}
              presupuestos={presupuestos}
              calendarioCxp={calendarioCxp}
              categoriasProyeccionLista={categoriasProyeccionLista}
              categoriasPorConceptoProyeccion={categoriasPorConceptoProyeccion}
              onGuardar={guardarPresupuesto}
              onFinalizar={finalizarPresupuesto}
              onDeletePresupuesto={deletePresupuesto}
              onRecalcular={recalcularPresupuesto}
              onAgregarCategoriaProyeccionLista={agregarCategoriaProyeccionLista}
              onEliminarCategoriaProyeccionLista={eliminarCategoriaProyeccionLista}
              onGuardarCategoriaConceptoProyeccion={guardarCategoriaConceptoProyeccion}
              onImportarCategoriasProyeccion={importarCategoriasProyeccion}
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
          {subView === "programacion_pagos" && (
            <ProgramacionPagosView
              presupuestosCliente={presupuestosCliente}
              presupuestos={presupuestos}
              calendarioCxp={calendarioCxp}
            />
          )}
          {subView === "estrategia_pago" && (
            <EstrategiaPagoView
              cortes={cortesCxp}
              manuales={manualCxp}
              calendario={calendarioCxp}
              presupuestosCliente={presupuestosCliente}
              presupuestos={presupuestos}
              nombresProveedor={nombresProveedorCxp}
              onAplicarPlan={aplicarPlanEstrategia}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </div>
    </div>
  );
}
