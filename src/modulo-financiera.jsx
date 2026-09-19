import { useState, useEffect, Fragment } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";

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
export function FinancieraStandalone({ currentUser, onVolver, onLogout }) {
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

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "nomina_trabajadores"), (snap) => { setTrabajadores(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setLoading(false); }),
      onSnapshot(collection(db, "nomina_fiscal_liquidaciones"), (snap) => setLiquidacionesF(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_fiscal_destajo_liquidaciones"), (snap) => setLiquidacionesFD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_destajo_liquidaciones"), (snap) => setLiquidacionesD(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
      onSnapshot(collection(db, "nomina_prestacion_servicios_liquidaciones"), (snap) => setLiquidacionesPS(snap.docs.map((d) => ({ ...d.data(), id: d.id })))),
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
      matrizPago[forma][empleador] += l.netoAPagar || 0;
    });
  });
  const hayTrabajadoresSinAsignar = matrizPago.Efectivo["Sin asignar"] > 0 || matrizPago.Banco["Sin asignar"] > 0;
  const columnasPago = hayTrabajadoresSinAsignar ? [...EMPLEADORES_COLUMNAS, "Sin asignar"] : EMPLEADORES_COLUMNAS;
  const totalPorForma = (forma) => columnasPago.reduce((s, emp) => s + matrizPago[forma][emp], 0);
  const totalPorEmpleadorCol = (emp) => matrizPago.Efectivo[emp] + matrizPago.Banco[emp];
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
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 32px", background: C.ink }}>
        {onVolver && (
          <button onClick={onVolver} style={{ background: "transparent", border: "1px solid rgba(200,184,162,0.3)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13, color: C.seam }}>
            ← Volver
          </button>
        )}
        <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.white }}>💰 Financiera</div>
        {onLogout && (
          <button onClick={onLogout} style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(232,93,74,0.85)", fontWeight: 700, fontSize: 12 }}>
            ⏏ Cerrar sesión
          </button>
        )}
      </div>
      <div style={{ padding: "28px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 22 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>💰 Financiera</h2>
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
                Destajo, Fiscal Destajo y Prestación de Servicios se pagan en Efectivo; Fiscal se paga por Banco — separado por Empleador (Yanko / Indutex).
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
                        {columnasPago.map((emp) => (
                          <td key={emp} style={{ padding: "7px 12px", textAlign: "right" }}>{fmtMoney(matrizPago[forma][emp])}</td>
                        ))}
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
        </div>
      </div>
    </div>
  );
}
