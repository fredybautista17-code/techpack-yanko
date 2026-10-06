import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
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
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#7B5EA7", violetBg: "#F3EEF9", teal: "#2A8C99", tealBg: "#EAF6F7",
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
  // (2026-10-06, a pedido de Fredy) Botón "Descargar Excel": baja lo cortado
  // del periodo elegido (Día / Mes / Año) en 3 hojas -- "Por pedido" (la tabla
  // de abajo), "Detalle de cortes" (una fila por referencia de cada corte,
  // con el precio real de esa referencia) y "Por cortador" (la tabla de
  // arriba). Los totales y el precio/prenda promedio van con fórmulas.
  async function descargarExcel() {
    const XLSX = await import("xlsx");
    const n = (v, z) => ({ t: "n", v: Number(v) || 0, z: z || "#,##0" });
    const fx = (f, v, z) => ({ t: "n", f, v: Number(v) || 0, z: z || "#,##0" });
    const t = (v) => ({ t: "s", v: String(v ?? "") });
    const hdr = (arr) => arr.map((h) => ({ t: "s", v: h, s: { font: { bold: true } } }));
    const fechaTxt = (iso) => (iso ? fmtFechaISO(iso) : "");
    // Hoja 1 — Por pedido
    const aoa1 = [hdr(["Pedido", "Cliente", "Referencias", "Cortes", "Unidades", "Precio/prenda (promedio)", "Ingreso Corte"])];
    porPedido.forEach((x, i) => {
      const r = i + 2;
      aoa1.push([t(`Pedido ${x.numero}`), t(x.cliente), t(x.refs.join(", ")), n(x.cortes), n(x.unidades), fx(`IF(E${r}>0,G${r}/E${r},0)`, x.unidades > 0 ? x.ingreso / x.unidades : 0), n(x.ingreso)]);
    });
    const f1 = porPedido.length + 2;
    const s1c = porPedido.reduce((a, x) => a + x.cortes, 0);
    aoa1.push([t("TOTAL"), t(""), t(""), fx(`SUM(D2:D${f1 - 1})`, s1c), fx(`SUM(E2:E${f1 - 1})`, sumPedUnid), fx(`IF(E${f1}>0,G${f1}/E${f1},0)`, sumPedUnid > 0 ? sumPedIng / sumPedUnid : 0), fx(`SUM(G2:G${f1 - 1})`, sumPedIng)]);
    const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
    ws1["!cols"] = [{ wch: 14 }, { wch: 26 }, { wch: 60 }, { wch: 8 }, { wch: 11 }, { wch: 22 }, { wch: 16 }];
    // Hoja 2 — Detalle de cortes (una fila por referencia de cada corte)
    const aoa2 = [hdr(["Fecha", "Pedido", "Cliente", "Lote", "Referencia", "Cortador", "Unidades", "Precio/prenda", "Ingreso Corte"])];
    const filasDetalle = [];
    pedidos.forEach((p) => {
      (p.cortesRealizados || []).filter((c) => enPeriodo(c.fecha)).forEach((c) => {
        const refs = c.refs || [];
        if (refs.length) {
          refs.forEach((r) => filasDetalle.push({ fecha: c.fecha, pedido: p.numero || p.id, cliente: p.cliente || "", lote: c.lote || "", ref: r.ref || "", cortador: c.cortador || "", unidades: Number(r.total) || 0, precio: Number(r.precio) || 0 }));
        } else {
          const u = Number(c.totalUnidades) || 0;
          filasDetalle.push({ fecha: c.fecha, pedido: p.numero || p.id, cliente: p.cliente || "", lote: c.lote || "", ref: "", cortador: c.cortador || "", unidades: u, precio: u > 0 ? (Number(c.ingresoCorte) || 0) / u : 0 });
        }
      });
    });
    filasDetalle.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.pedido).localeCompare(String(b.pedido)));
    filasDetalle.forEach((d, i) => {
      const r = i + 2;
      aoa2.push([t(fechaTxt(d.fecha)), t(`Pedido ${d.pedido}`), t(d.cliente), t(d.lote), t(d.ref), t(d.cortador), n(d.unidades), n(d.precio), fx(`G${r}*H${r}`, d.unidades * d.precio)]);
    });
    const f2 = filasDetalle.length + 2;
    aoa2.push([t("TOTAL"), t(""), t(""), t(""), t(""), t(""), fx(`SUM(G2:G${f2 - 1})`, filasDetalle.reduce((a, d) => a + d.unidades, 0)), t(""), fx(`SUM(I2:I${f2 - 1})`, filasDetalle.reduce((a, d) => a + d.unidades * d.precio, 0))]);
    const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
    ws2["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 9 }, { wch: 14 }, { wch: 30 }, { wch: 11 }, { wch: 14 }, { wch: 16 }];
    // Hoja 3 — Por cortador
    const aoa3 = [hdr(["Cortador", "Unidades", "Ingreso Corte", "Costo Nómina", "Rentabilidad", "Observación"])];
    filas.forEach((f, i) => {
      const r = i + 2;
      aoa3.push([t(f.nombre), n(f.unidades), n(f.ingreso), n(f.costo), fx(`C${r}-D${r}`, f.ingreso - f.costo), t(!f.enNomina ? "no está en nómina" : f.unidades === 0 ? "sin cortes en el periodo" : "")]);
    });
    const f3 = filas.length + 2;
    aoa3.push([t("TOTAL"), fx(`SUM(B2:B${f3 - 1})`, totalUnidades), fx(`SUM(C2:C${f3 - 1})`, totalIngreso), fx(`SUM(D2:D${f3 - 1})`, totalCosto), fx(`C${f3}-D${f3}`, totalIngreso - totalCosto), fx(`IF(D${f3}>0,C${f3}/D${f3},0)`, totalCosto > 0 ? totalIngreso / totalCosto : 0, "0.0%")]);
    aoa3[0][5] = { t: "s", v: "Observación / % cobertura (total)", s: { font: { bold: true } } };
    const ws3 = XLSX.utils.aoa_to_sheet(aoa3);
    ws3["!cols"] = [{ wch: 36 }, { wch: 11 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Por pedido");
    XLSX.utils.book_append_sheet(wb, ws2, "Detalle de cortes");
    XLSX.utils.book_append_sheet(wb, ws3, "Por cortador");
    wb.Workbook = { CalcPr: { fullCalcOnLoad: true } };
    const periodoTexto = etiquetaPeriodo.replace(/[^\w-]+/g, "_");
    XLSX.writeFile(wb, `Cortes_${periodoTexto}.xlsx`);
  }
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: C.ink }}>✂ Ingreso por pedido</h3>
          <button
            onClick={descargarExcel}
            disabled={cargando || (!porPedido.length && !filas.length)}
            title={`Descarga lo cortado de ${etiquetaPeriodo}: por pedido, detalle de cortes y por cortador`}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.blue}`, background: C.white, color: C.blue, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
          >
            📥 Descargar Excel — cortado {etiquetaPeriodo}
          </button>
        </div>
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

// ─── CENTRO DE COSTO CIERRE — CORTE ──────────────────────────────────────────
// (2026-10-06, a pedido de Fredy) Versión de "Centro de Costo Cierre" para el
// área CORTE (Áreas → Centro de Costo Cierre → CORTE). Igual que el Cierre de
// las otras áreas (tarjetas + "Guardar cierre de este período" + historial de
// cierres guardados en centro_costo_historial_ayuda), pero calculado con los
// cortes registrados y la nómina de Corte -- los MISMOS números del Centro de
// Costo de CORTE (ver CentroCostoCorteEnAreas arriba) --, y con la Auditoría
// Corte vs Busint debajo (la corrida diaria vive en functions/auditoria-corte.js).
function calcularFilasCorteCC({ pedidos, trabajadores, periodo, fechaDia, mesSel, anioSel }) {
  const mesKey = `${anioSel}-${String(mesSel).padStart(2, "0")}`;
  const enP = (f) => {
    if (!f) return false;
    if (periodo === "dia") return f === fechaDia;
    if (periodo === "mes") return f.slice(0, 7) === mesKey;
    return f.slice(0, 4) === String(anioSel);
  };
  const activo = (t) => {
    if (!t.fechaSalida) return true;
    if (periodo === "dia") return fechaDia <= t.fechaSalida;
    if (periodo === "anio") return String(anioSel) <= t.fechaSalida.slice(0, 4);
    return mesKey <= t.fechaSalida.slice(0, 7);
  };
  const costoP = (s) => {
    if (periodo === "dia") {
      const [y, m] = fechaDia.split("-").map(Number);
      return s / (diasHabilesCC(m, y) || 1);
    }
    if (periodo === "anio") return s * 12;
    return s;
  };
  const norm = (s) => String(s || "").trim().toUpperCase();
  const por = new Map();
  pedidos.flatMap((p) => p.cortesRealizados || []).filter((c) => enP(c.fecha)).forEach((c) => {
    const nombre = (c.cortador || "").trim() || "(Sin cortador asignado)";
    const k = norm(nombre);
    if (!por.has(k)) por.set(k, { nombre, unidades: 0, ingreso: 0 });
    const a = por.get(k);
    a.unidades += c.totalUnidades || 0;
    a.ingreso += c.ingresoCorte || 0;
  });
  const filas = [];
  const usados = new Set();
  trabajadores.filter(activo).forEach((t) => {
    const k = norm(t.nombre);
    const d = por.get(k);
    filas.push({ id: t.id || k, nombre: t.nombre, unidades: d?.unidades || 0, valorProducido: d?.ingreso || 0, costo: costoP(t.sueldo || 0), sinSueldo: !t.sueldo });
    usados.add(k);
  });
  por.forEach((d, k) => {
    if (usados.has(k)) return;
    filas.push({ id: k, nombre: d.nombre, unidades: d.unidades, valorProducido: d.ingreso, costo: 0, sinSueldo: true });
  });
  return filas;
}

const TIPOS_AUDITORIA_CORTE = {
  falta_registrar_atlas: { texto: "Falta registrar en ATLAS", icono: "❌", color: C.red },
  atlas_de_mas: { texto: "ATLAS tiene de más", icono: "⚠️", color: C.amber },
  no_aparece_busint: { texto: "No aparece en Busint", icono: "🟣", color: C.violet },
  fecha_no_coincide: { texto: "Fecha no coincide", icono: "📅", color: C.teal },
};

function AuditoriaCorteBusintPanel({ currentUser }) {
  const [historial, setHistorial] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "centro_costo_auditoria_corte"), (snap) => {
      setHistorial(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => unsub();
  }, []);
  const filas = useMemo(() => [...historial].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")), [historial]);
  async function correrAhora() {
    setCorriendo(true);
    try {
      const llamar = httpsCallable(functionsClient, "correrAuditoriaCorteVsBusintAhora");
      await llamar();
      alert("Auditoría de Corte ejecutada. El resultado de hoy ya está actualizado en la tabla.");
    } catch (err) {
      alert(`No se pudo correr la auditoría: ${err?.message || String(err)}`);
    } finally {
      setCorriendo(false);
    }
  }
  const sel = abierto ? filas.find((f) => f.id === abierto) : null;
  const th = (t, r) => <th style={{ textAlign: r ? "right" : "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>{t}</th>;
  return (
    <div style={{ marginBottom: 24, padding: 16, border: `1px solid ${C.border}`, borderRadius: 12, background: C.canvas }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>🔎 Auditoría Corte vs Busint</div>
          <div style={{ fontSize: 11, color: C.slate, maxWidth: 720 }}>
            Compara, lote por lote, lo que quedó registrado en ATLAS contra lo que Busint reporta como cortado (mes en curso). Corre sola todos los días a las 7:30am y avisa por correo si hay diferencias.
          </div>
        </div>
        {currentUser?.isAdmin && (
          <button onClick={correrAhora} disabled={corriendo} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ink, fontWeight: 700, fontSize: 12, cursor: corriendo ? "default" : "pointer", opacity: corriendo ? 0.6 : 1 }}>
            {corriendo ? "Corriendo..." : "▶️ Correr auditoría ahora"}
          </button>
        )}
      </div>
      {filas.length === 0 ? (
        <div style={{ fontSize: 12, color: C.slate }}>Aún no hay corridas registradas para CORTE. {currentUser?.isAdmin ? "Usa “Correr auditoría ahora” para la primera." : "La primera aparece mañana a las 7:30am."}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: C.white, borderRadius: 8 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("Fecha")}{th("Lotes revisados", true)}{th("Cuadran", true)}{th("Con diferencia", true)}{th("Cortes sin lote", true)}</tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} onClick={() => setAbierto(abierto === f.id ? null : f.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: abierto === f.id ? C.blueBg : "transparent" }}>
                <td style={{ padding: "9px 10px" }}>{f.fecha}</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>{fmtNum(f.lotesRevisados)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtNum(f.lotesCuadran)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, color: (f.totalDiscrepancias || 0) > 0 ? C.red : C.green }}>{fmtNum(f.totalDiscrepancias)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: (f.totalSinLote || 0) > 0 ? C.amber : C.slate }}>{fmtNum(f.totalSinLote)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sel && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 6 }}>Detalle del {sel.fecha} <span style={{ fontWeight: 600, color: C.slate, fontSize: 11 }}>· generado {sel.generadoEn ? new Date(sel.generadoEn).toLocaleString("es-CO") : ""}</span></div>
          {(sel.discrepancias || []).length === 0 ? (
            <div style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ Todos los lotes del mes cuadran con Busint.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, background: C.white }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("Lote")}{th("Pedido")}{th("Referencia")}{th("Cortador (ATLAS)")}{th("Busint", true)}{th("ATLAS", true)}{th("Dif.", true)}{th("Tipo")}</tr>
              </thead>
              <tbody>
                {sel.discrepancias.map((d, i) => {
                  const t = TIPOS_AUDITORIA_CORTE[d.tipo] || { texto: d.tipo, icono: "❓", color: C.slate };
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700 }}>{d.numLote}</td>
                      <td style={{ padding: "8px 10px" }}>{d.numPedido}</td>
                      <td style={{ padding: "8px 10px" }}>{d.referencia}</td>
                      <td style={{ padding: "8px 10px" }}>{d.cortador || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtNum(d.unidadesBusint)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtNum(d.unidadesAtlas)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: t.color }}>{d.diferencia > 0 ? `+${fmtNum(d.diferencia)}` : fmtNum(d.diferencia)}</td>
                      <td style={{ padding: "8px 10px", color: t.color, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {t.icono} {t.texto}
                        {d.tipo === "fecha_no_coincide" && <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 600 }}>Busint: {d.fechaBusint} · ATLAS: {(d.fechasAtlas || []).join(", ")}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {(sel.sinLote || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 4 }}>⚪ Cortes del mes sin lote asignado ({sel.sinLote.length}) — no se pueden cruzar con Busint</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, background: C.white }}>
                <thead><tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("Pedido")}{th("Referencia")}{th("Cortador")}{th("Fecha")}{th("Unidades", true)}</tr></thead>
                <tbody>
                  {sel.sinLote.map((c, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 10px" }}>{c.pedidoNumero}</td>
                      <td style={{ padding: "8px 10px" }}>{c.referencias}</td>
                      <td style={{ padding: "8px 10px" }}>{c.cortador}</td>
                      <td style={{ padding: "8px 10px" }}>{fmtFechaISO(c.fecha)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtNum(c.unidades)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CentroCostoCierreCorte({ currentUser }) {
  const hoy = today();
  const [periodo, setPeriodo] = useState("dia");
  const [fechaDia, setFechaDia] = useState(hoy);
  const [mesSel, setMesSel] = useState(new Date().getMonth() + 1);
  const [anioSel, setAnioSel] = useState(new Date().getFullYear());
  const [pedidos, setPedidos] = useState([]);
  const [trabajadores, setTrabajadores] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [detalleAbierto, setDetalleAbierto] = useState(null);
  useEffect(() => {
    const u1 = onSnapshot(collection(db, "pedidos_activos"), (snap) => setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const u2 = onSnapshot(collection(db, "corte_config"), (snap) => {
      const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      const cfg = docs.find((d) => d.id === "main") || docs[0];
      setTrabajadores(cfg?.nomina?.trabajadores || []);
    });
    const u3 = onSnapshot(collection(db, "centro_costo_historial_ayuda"), (snap) => setHistorial(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    return () => { u1(); u2(); u3(); };
  }, []);
  const filas = useMemo(
    () => calcularFilasCorteCC({ pedidos, trabajadores, periodo, fechaDia, mesSel, anioSel }),
    [pedidos, trabajadores, periodo, fechaDia, mesSel, anioSel]
  );
  const etiquetaPeriodo = periodo === "dia" ? fmtFechaISO(fechaDia) : periodo === "mes" ? `${MESES_CORTOS[mesSel - 1]} ${anioSel}` : String(anioSel);
  const totalValor = filas.reduce((s, f) => s + f.valorProducido, 0);
  const totalCosto = filas.reduce((s, f) => s + (f.sinSueldo ? 0 : f.costo), 0);
  const balance = totalValor - totalCosto;
  const totalAyuda = filas.reduce((s, f) => (f.sinSueldo ? s : f.valorProducido - f.costo < 0 ? s + (f.costo - f.valorProducido) : s), 0);
  const totalExcedente = filas.reduce((s, f) => (f.sinSueldo ? s : f.valorProducido - f.costo > 0 ? s + (f.valorProducido - f.costo) : s), 0);
  async function guardarCierre() {
    const id = Math.random().toString(36).slice(2, 9);
    await setDoc(doc(db, "centro_costo_historial_ayuda", id), {
      area: "CORTE",
      periodo,
      etiquetaPeriodo,
      fechaGuardado: new Date().toISOString(),
      totalCosto,
      totalValor,
      totalAyuda,
      totalExcedente,
      balance,
      detalle: filas.map((f) => ({ id: f.id, nombre: f.nombre, area: "CORTE", unidades: f.unidades, valorProducido: f.valorProducido, costo: f.costo, sinSueldo: f.sinSueldo })),
    }, { merge: true });
    alert("Cierre guardado.");
  }
  async function borrarCierre(id) {
    if (!window.confirm("¿Borrar este cierre guardado?")) return;
    await deleteDoc(doc(db, "centro_costo_historial_ayuda", id));
    if (detalleAbierto?.id === id) setDetalleAbierto(null);
  }
  const cierres = useMemo(
    () => historial.filter((h) => h.area === "CORTE").sort((a, b) => (b.fechaGuardado || "").localeCompare(a.fechaGuardado || "")),
    [historial]
  );
  const btnPeriodo = (id, label) => (
    <button onClick={() => setPeriodo(id)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${periodo === id ? C.ink : C.border}`, background: periodo === id ? C.ink : C.white, color: periodo === id ? "#fff" : C.slate, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{label}</button>
  );
  const inp = { padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13 };
  const th = (t, r) => <th style={{ textAlign: r ? "right" : "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>{t}</th>;
  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 900, color: C.ink }}>🔒 Centro de Costo Cierre</h2>
      <p style={{ margin: "0 0 18px", fontSize: 14, color: C.slate }}>CORTE — guarda y consulta los cierres de esta área, y revisa a diario que los cortes registrados en ATLAS coincidan con Busint.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {btnPeriodo("dia", "Día")}
        {btnPeriodo("mes", "Mes")}
        {btnPeriodo("anio", "Año")}
        {periodo === "dia" && <input type="date" value={fechaDia} onChange={(e) => setFechaDia(e.target.value)} style={inp} />}
        {periodo === "mes" && (
          <>
            <select value={mesSel} onChange={(e) => setMesSel(Number(e.target.value))} style={inp}>{MESES_CORTOS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
            <input type="number" value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value) || anioSel)} style={{ ...inp, width: 90 }} />
          </>
        )}
        {periodo === "anio" && <input type="number" value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value) || anioSel)} style={{ ...inp, width: 90 }} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 14 }}>
        <KPI icon="💵" label="Valor producido (Ingreso Corte)" value={fmtMoney(totalValor)} color={C.green} bg={C.greenBg} />
        <KPI icon="🏦" label={`Costo nómina (${etiquetaPeriodo})`} value={fmtMoney(totalCosto)} color={C.violet} bg={C.violetBg} />
        <KPI icon={balance >= 0 ? "✅" : "⚠️"} label="Balance" value={fmtMoney(balance)} color={balance >= 0 ? C.green : C.red} bg={balance >= 0 ? C.greenBg : C.redBg} />
        <KPI icon="🆘" label="Ayudado" value={fmtMoney(totalAyuda)} color={C.red} bg={C.redBg} />
        <KPI icon="📈" label="Excedente" value={fmtMoney(totalExcedente)} color={C.green} bg={C.greenBg} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <button onClick={guardarCierre} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ink, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>💾 Guardar cierre de este período</button>
      </div>
      <AuditoriaCorteBusintPanel currentUser={currentUser} />
      <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 8 }}>📚 Cierres guardados de CORTE</div>
      {cierres.length === 0 ? (
        <div style={{ padding: 20, fontSize: 13, color: C.slate }}>Todavía no hay cierres guardados para CORTE.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("Guardado")}{th("Período")}{th("Ayudado", true)}{th("Excedente", true)}{th("Balance", true)}{th("", true)}</tr></thead>
          <tbody>
            {cierres.map((h) => (
              <tr key={h.id} onClick={() => setDetalleAbierto(detalleAbierto?.id === h.id ? null : h)} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: detalleAbierto?.id === h.id ? C.blueBg : "transparent" }}>
                <td style={{ padding: "9px 10px" }}>{new Date(h.fechaGuardado).toLocaleString("es-CO")}</td>
                <td style={{ padding: "9px 10px" }}>{h.etiquetaPeriodo}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: C.red }}>{fmtMoney(h.totalAyuda)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: C.green }}>{fmtMoney(h.totalExcedente)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800 }}>{fmtMoney(h.balance)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}><span onClick={(e) => { e.stopPropagation(); borrarCierre(h.id); }} style={{ cursor: "pointer", color: C.red, fontWeight: 700, fontSize: 11 }}>Borrar</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detalleAbierto && (
        <div style={{ marginTop: 12, padding: 14, border: `1px solid ${C.border}`, borderRadius: 10, background: C.canvas }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 6 }}>Detalle del cierre — {detalleAbierto.etiquetaPeriodo}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, background: C.white }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("Cortador")}{th("Unidades", true)}{th("Valor producido", true)}{th("Costo nómina", true)}{th("Ayuda / Excedente", true)}</tr></thead>
            <tbody>
              {(detalleAbierto.detalle || []).map((d, i) => {
                const bal = (Number(d.valorProducido) || 0) - (d.sinSueldo ? 0 : Number(d.costo) || 0);
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>{d.nombre}{d.sinSueldo && <span style={{ marginLeft: 6, fontSize: 10, color: C.slate }}>(sin sueldo en nómina)</span>}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtNum(d.unidades)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(d.valorProducido)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtMoney(d.sinSueldo ? 0 : d.costo)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: bal < 0 ? C.red : C.green }}>{fmtMoney(bal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
