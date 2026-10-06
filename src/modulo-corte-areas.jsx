import { useState, useEffect } from "react";
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
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6",
};
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function today() {
  return new Date().toISOString().slice(0, 10);
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-CO");
}
function fmtMoney(n) {
  return "$" + Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}
function fmtFechaISO(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

// ─── CENTRO DE COSTO — CORTE (dentro de Áreas) ───────────────────────────────
// (2026-10-06, a pedido de Fredy) Archivo propio (mismo patrón de los otros
// módulos: reinicia firebase con getApps y trae sus propios helpers). Cuando en Áreas → Centro de Costo se elige
// el área CORTE, en vez de la tabla de nómina por trabajador (que ahí
// siempre sale en $0 porque en Corte nadie usa "Registrar Producción de
// Nómina") se muestra EXACTAMENTE lo mismo que "Centro de Costo — Corte"
// dentro del módulo de Corte (modulo-corte.jsx, función CentroCosto):
// mismas fuentes de datos y mismas cuentas, para que las dos pantallas
// den los mismos números.
//   - Ingreso = unidades cortadas × precio/prenda de cada corte REGISTRADO
//     (pedidos_activos[].cortesRealizados, campo ingresoCorte).
//   - Costo = sueldo de la nómina de Corte (corte_config → nomina.
//     trabajadores): mes = sueldo, día = sueldo / días hábiles del mes,
//     año = sueldo × 12. Quien tenga fechaSalida deja de contar desde esa
//     fecha.
// Además trae "Ingreso por pedido" (no existe en el módulo de Corte): los
// mismos cortes del periodo agrupados por pedido. No toca ni escribe nada
// en pedidos_activos ni en corte_config -- solo los lee.
function diasHabilesCC(mes, anio) {
  let count = 0;
  const d = new Date(anio, mes - 1, 1);
  while (d.getMonth() === mes - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
export default function CentroCostoCorteEnAreas({ areaNombre }) {
  const hoy = today();
  const [pedidos, setPedidos] = useState([]);
  const [trabajadores, setTrabajadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState("mes"); // "dia" | "mes" | "anio"
  const [fechaDia, setFechaDia] = useState(hoy);
  const [mesSel, setMesSel] = useState(new Date().getMonth() + 1);
  const [anioSel, setAnioSel] = useState(new Date().getFullYear());
  useEffect(() => {
    const unsubP = onSnapshot(collection(db, "pedidos_activos"), (snap) => {
      setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setCargando(false);
    }, () => setCargando(false));
    // Misma lectura que el módulo de Corte: doc "main" de corte_config (o el
    // primero que haya).
    const unsubC = onSnapshot(collection(db, "corte_config"), (snap) => {
      const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      const cfg = docs.find((d) => d.id === "main") || docs[0];
      setTrabajadores(cfg?.nomina?.trabajadores || []);
    });
    return () => { unsubP(); unsubC(); };
  }, []);
  const norm = (s) => String(s || "").trim().toUpperCase();
  const mesKey = `${anioSel}-${String(mesSel).padStart(2, "0")}`;
  function enPeriodo(fechaISO) {
    if (!fechaISO) return false;
    if (periodo === "dia") return fechaISO === fechaDia;
    if (periodo === "mes") return fechaISO.slice(0, 7) === mesKey;
    return fechaISO.slice(0, 4) === String(anioSel);
  }
  function trabajadorActivoPeriodo(t) {
    if (!t.fechaSalida) return true;
    if (periodo === "dia") return fechaDia <= t.fechaSalida;
    if (periodo === "anio") return String(anioSel) <= t.fechaSalida.slice(0, 4);
    return mesKey <= t.fechaSalida.slice(0, 7);
  }
  function costoPeriodo(sueldoMensual) {
    if (periodo === "dia") {
      const [y, m] = fechaDia.split("-").map(Number);
      return sueldoMensual / (diasHabilesCC(m, y) || 1);
    }
    if (periodo === "anio") return sueldoMensual * 12;
    return sueldoMensual;
  }
  // Tira de cumplimiento diario — últimos 30 días (solo se muestra en "Día").
  function estadoDia(fechaISO) {
    const cortesDia = pedidos.flatMap((p) => p.cortesRealizados || []).filter((c) => c.fecha === fechaISO);
    const ingreso = cortesDia.reduce((s, c) => s + (c.ingresoCorte || 0), 0);
    const [y, m] = fechaISO.split("-").map(Number);
    const dh = diasHabilesCC(m, y) || 1;
    const costo = trabajadores
      .filter((t) => !t.fechaSalida || fechaISO <= t.fechaSalida)
      .reduce((s, t) => s + (t.sueldo || 0) / dh, 0);
    return { ingreso, costo, tieneCortes: cortesDia.length > 0, ok: cortesDia.length > 0 && costo > 0 ? ingreso >= costo : null };
  }
  const diasStrip = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    diasStrip.push(d.toISOString().slice(0, 10));
  }
  const cortesPeriodo = pedidos.flatMap((p) => p.cortesRealizados || []).filter((c) => enPeriodo(c.fecha));
  const porCortador = new Map();
  cortesPeriodo.forEach((c) => {
    const nombre = (c.cortador || "").trim() || "(Sin cortador asignado)";
    const key = norm(nombre);
    if (!porCortador.has(key)) porCortador.set(key, { nombre, unidades: 0, ingreso: 0 });
    const acc = porCortador.get(key);
    acc.unidades += c.totalUnidades || 0;
    acc.ingreso += c.ingresoCorte || 0;
  });
  const filas = [];
  const usados = new Set();
  trabajadores.filter(trabajadorActivoPeriodo).forEach((t) => {
    const key = norm(t.nombre);
    const datos = porCortador.get(key);
    filas.push({ nombre: t.nombre, unidades: datos?.unidades || 0, ingreso: datos?.ingreso || 0, costo: costoPeriodo(t.sueldo || 0), enNomina: true });
    usados.add(key);
  });
  porCortador.forEach((datos, key) => {
    if (usados.has(key)) return;
    filas.push({ nombre: datos.nombre, unidades: datos.unidades, ingreso: datos.ingreso, costo: 0, enNomina: false });
  });
  filas.sort((a, b) => b.ingreso - a.ingreso);
  const totalUnidades = filas.reduce((s, f) => s + f.unidades, 0);
  const totalIngreso = filas.reduce((s, f) => s + f.ingreso, 0);
  const totalCosto = filas.reduce((s, f) => s + f.costo, 0);
  const rentabilidad = totalIngreso - totalCosto;
  const pctCobertura = totalCosto > 0 ? (totalIngreso / totalCosto) * 100 : 0;
  const estado = totalCosto === 0 ? null : totalIngreso >= totalCosto ? "ok" : "bad";
  // Ingreso por pedido: los mismos cortes del periodo, agrupados por pedido.
  const porPedido = [];
  pedidos.forEach((p) => {
    const cortes = (p.cortesRealizados || []).filter((c) => enPeriodo(c.fecha));
    if (!cortes.length) return;
    const unidades = cortes.reduce((s, c) => s + (c.totalUnidades || 0), 0);
    const ingreso = cortes.reduce((s, c) => s + (c.ingresoCorte || 0), 0);
    const refs = [...new Set(cortes.flatMap((c) => (c.refs || []).map((r) => String(r.ref || "").trim())).filter(Boolean))];
    porPedido.push({ id: p.id, numero: p.numero || p.id, cliente: p.cliente || "", refs, unidades, ingreso, cortes: cortes.length });
  });
  porPedido.sort((a, b) => b.ingreso - a.ingreso);
  const sumPedUnid = porPedido.reduce((s, x) => s + x.unidades, 0);
  const sumPedIng = porPedido.reduce((s, x) => s + x.ingreso, 0);
  const etiquetaPeriodo = periodo === "dia" ? fmtFechaISO(fechaDia) : periodo === "mes" ? `${MESES_CORTOS[mesSel - 1]} ${anioSel}` : String(anioSel);
  const btnPeriodo = (id, label) => (
    <button
      onClick={() => setPeriodo(id)}
      style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${periodo === id ? C.ink : C.border}`, background: periodo === id ? C.ink : C.white, color: periodo === id ? C.seam : C.slate, fontWeight: 800, fontSize: 12, cursor: "pointer" }}
    >
      {label}
    </button>
  );
  const inputSt = { padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" };
  const th = (txt, right) => <th style={{ textAlign: right ? "right" : "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>{txt}</th>;
  const nombrePeriodoUnid = periodo === "dia" ? "Día" : periodo === "anio" ? "Año" : "Mes";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: C.ink }}>💰 Centro de Costo — Planeación <span style={{ fontSize: 14, fontWeight: 700, color: C.slate }}>· {areaNombre || "CORTE"}</span></h2>
        <div style={{ padding: "7px 12px", borderRadius: 8, background: C.canvas, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, color: C.ink }}>{areaNombre || "CORTE"}</div>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: C.slate, maxWidth: 760 }}>
        "Ingreso" = unidades cortadas × precio/prenda de cada corte registrado en el periodo (dato real). "Costo" = sueldo integral de nómina
        {periodo !== "mes" && (
          <strong>
            {" "}
            — {periodo === "dia" ? "estimado dividiendo el sueldo mensual actual entre los días hábiles del mes" : "estimado multiplicando el sueldo mensual actual × 12"}, porque solo se guarda la nómina vigente, no un histórico mes a mes
          </strong>
        )}
        . Es la misma información de Centro de Costo dentro del módulo de Corte.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
        {btnPeriodo("dia", "📆 Día")}
        {btnPeriodo("mes", "🗓 Mes")}
        {btnPeriodo("anio", "📅 Año")}
        {periodo === "dia" && <input type="date" value={fechaDia} onChange={(e) => setFechaDia(e.target.value)} style={inputSt} />}
        {periodo === "mes" && (
          <>
            <select value={mesSel} onChange={(e) => setMesSel(Number(e.target.value))} style={inputSt}>
              {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <input type="number" value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value) || anioSel)} style={{ ...inputSt, width: 90 }} />
          </>
        )}
        {periodo === "anio" && <input type="number" value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value) || anioSel)} style={{ ...inputSt, width: 90 }} />}
        <span style={{ fontSize: 12, color: C.slate, marginLeft: 4 }}>Mostrando: <strong style={{ color: C.ink }}>{etiquetaPeriodo}</strong></span>
      </div>
      {cargando && <div style={{ padding: 24, color: C.slate, fontSize: 13 }}>Cargando cortes registrados…</div>}
      {periodo === "dia" && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Cumplimiento diario — últimos 30 días</div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
            {diasStrip.map((iso) => {
              const ed = estadoDia(iso);
              const color = ed.ok === true ? C.green : ed.ok === false ? C.red : C.slate;
              const bg = ed.ok === true ? C.greenBg : ed.ok === false ? C.redBg : C.canvas;
              const activo = iso === fechaDia;
              return (
                <button
                  key={iso}
                  onClick={() => setFechaDia(iso)}
                  title={`${fmtFechaISO(iso)} — ${ed.tieneCortes ? `${fmtMoney(ed.ingreso)} vs ${fmtMoney(ed.costo)} nómina` : "sin cortes"}`}
                  style={{ flex: "0 0 auto", width: 26, height: 34, borderRadius: 6, border: activo ? `2px solid ${C.ink}` : `1px solid ${C.border}`, background: bg, color, fontSize: 9, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.1, padding: 0 }}
                >
                  <span>{iso.slice(8, 10)}</span>
                  <span style={{ fontSize: 11 }}>{ed.ok === true ? "✓" : ed.ok === false ? "✗" : "·"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KPI icon="✂" label={`Unidades ${nombrePeriodoUnid}`} value={fmtNum(totalUnidades)} color={C.blue} bg={C.blueBg} />
        <KPI icon="💵" label="Ingreso Corte" value={fmtMoney(totalIngreso)} color={C.green} bg={C.greenBg} />
        <KPI icon="💸" label="Costo Nómina" value={fmtMoney(totalCosto)} color={C.amber} bg={C.amberBg} />
        <KPI icon={rentabilidad >= 0 ? "📈" : "📉"} label="Rentabilidad" value={fmtMoney(rentabilidad)} color={rentabilidad >= 0 ? C.green : C.red} bg={rentabilidad >= 0 ? C.greenBg : C.redBg} sub={rentabilidad >= 0 ? "✓ Rentable" : "⚠ Pérdida"} />
      </div>
      {estado && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 30, fontWeight: 800, fontSize: 13, marginBottom: 24, background: estado === "ok" ? C.greenBg : C.redBg, color: estado === "ok" ? C.green : C.red }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: estado === "ok" ? C.green : C.red, display: "inline-block" }} />
          {estado === "ok" ? "El corte cubre la nómina" : "El corte NO cubre la nómina"} · {pctCobertura.toFixed(1)}% de cobertura
        </div>
      )}
      {!filas.length ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>Sin trabajadores en nómina ni cortes registrados en este periodo.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {th("Cortador")}{th("Unidades", true)}{th("Ingreso Corte", true)}{th("Costo Nómina", true)}{th("Rentabilidad", true)}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const rent = f.ingreso - f.costo;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px", fontWeight: 700, color: C.ink }}>
                    {f.nombre}
                    {!f.enNomina && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.red, background: C.redBg, padding: "2px 6px", borderRadius: 10 }}>no está en nómina</span>}
                    {f.enNomina && f.unidades === 0 && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.slate, background: C.canvas, padding: "2px 6px", borderRadius: 10 }}>sin cortes en el periodo</span>}
                  </td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{fmtNum(f.unidades)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(f.ingreso)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{fmtMoney(f.costo)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: rent >= 0 ? C.green : C.red, fontWeight: 800 }}>{fmtMoney(rent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 34 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: C.ink }}>✂ Ingreso por pedido</h3>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: C.slate }}>Pedidos cortados en el periodo — unidades × precio de corte por prenda (los mismos cortes de la tabla de arriba).</p>
        {!porPedido.length ? (
          <div style={{ padding: 24, color: C.slate, fontSize: 13 }}>No hay cortes registrados de ningún pedido en este periodo.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {th("Pedido")}{th("Referencias")}{th("Cortes", true)}{th("Unidades", true)}{th("Precio/prenda", true)}{th("Ingreso Corte", true)}
              </tr>
            </thead>
            <tbody>
              {porPedido.map((x) => (
                <tr key={x.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px", fontWeight: 800, color: C.ink }}>
                    Pedido {x.numero}
                    {x.cliente && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.slate, background: C.canvas, padding: "2px 6px", borderRadius: 10 }}>{x.cliente}</span>}
                  </td>
                  <td style={{ padding: "10px", color: C.slate }}>{x.refs.join(", ") || "—"}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{x.cortes}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{fmtNum(x.unidades)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{x.unidades > 0 ? fmtMoney(x.ingreso / x.unidades) : "—"}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(x.ingreso)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td style={{ padding: "10px", fontWeight: 900, color: C.ink }}>Total</td>
                <td />
                <td />
                <td style={{ padding: "10px", textAlign: "right", fontWeight: 900 }}>{fmtNum(sumPedUnid)}</td>
                <td />
                <td style={{ padding: "10px", textAlign: "right", color: C.green, fontWeight: 900 }}>{fmtMoney(sumPedIng)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
