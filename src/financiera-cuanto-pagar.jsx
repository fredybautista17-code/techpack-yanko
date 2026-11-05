// ─── FINANCIERA · ¿Cuánto debo pagar al mes? y Endeudamiento ──────────────────
// (2026-11-05, a pedido de Fredy) Dos pantallas del módulo Financiera:
//   · «Cuánto debo pagar»: nómina + seguridad social + provisiones + gastos del Excel + cuotas del mes, contra el mes anterior y el
//     promedio ponderado de los 6 meses anteriores; dice cuánto se necesita al mes con las cuotas vigentes.
//   · «Endeudamiento»: lista de cuotas (valor mensual fijo, día de pago, mes en que empieza y termina). Es lo único que se escribe
//     (colección financiera_cuotas); lo demás se lee de Nómina (liquidaciones confirmadas) y de costos_gastos_mes.
import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, onSnapshot, query, setDoc, deleteDoc, where } from "firebase/firestore";
import { cuantoPagarMes, cuotasDelMes, escalonCuotas, sumarMes, TIPOS_NOMINA, MESES_PONDERADO } from "./financiera-cuanto-pagar-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#9E5B8F", gris: "#8A8FA8",
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const nombreMes = (ym) => { const [a, m] = String(ym).split("-").map(Number); return `${MESES[m - 1]} ${a}`; };
const mesCorto = (ym) => MESES_CORTO[Number(String(ym).slice(5, 7)) - 1];
const minusculaMes = (ym) => MESES[Number(String(ym).slice(5, 7)) - 1].toLowerCase();
const variacion = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
const txtVariacion = (p) => (p === null ? "—" : `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1).replace(".", ",")} %`);
const COL_CUOTAS = "financiera_cuotas";

const RUBROS = [
  { k: "nomina", label: "Nómina (neto a pagar)", color: C.blue, campoTipo: "neto" },
  { k: "seguridad", label: "Seguridad social", color: C.violet, campoTipo: "seguridad" },
  { k: "provisiones", label: "Provisiones", color: C.amber, campoTipo: "prestaciones" },
  { k: "gastos", label: "Gastos del Excel", color: C.gris },
  { k: "cuotas", label: "Cuotas (endeudamiento)", color: C.red },
];

const caja = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" };
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "9px 8px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left", fontWeight: 700 };

function Boton({ children, onClick, variante = "claro", disabled, chico }) {
  const est = { claro: { background: C.white, color: C.ink, border: `1.5px solid ${C.border}` }, oscuro: { background: C.ink, color: C.white, border: `1.5px solid ${C.ink}` }, rojo: { background: C.red, color: C.white, border: `1.5px solid ${C.red}` } }[variante];
  return <button onClick={onClick} disabled={disabled} style={{ ...est, borderRadius: 8, padding: chico ? "4px 10px" : "8px 14px", fontSize: chico ? 12 : 13, fontWeight: 700, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}
function Ventana({ titulo, sub, onClose, children, ancho = 680 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.canvas, borderRadius: 14, width: `min(${ancho}px, 100%)`, maxWidth: "100%", maxHeight: "92vh", minWidth: 320, minHeight: 240, resize: "both", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }} title={undefined}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{titulo}</div>
            {sub ? <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, lineHeight: 1.5 }}>{sub}</div> : null}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1, cursor: "pointer", color: C.slate }}>×</button>
        </div>
        <div style={{ overflow: "auto", padding: 20, flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}
function Tarjeta({ titulo, valor, sub, fondo, borde, colorValor, oscura }) {
  return (
    <div style={{ flex: "1 1 220px", background: fondo || C.white, border: `1px solid ${borde || C.border}`, borderRadius: 12, padding: "13px 16px", color: oscura ? C.white : C.ink }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: oscura ? C.seam : C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: colorValor || (oscura ? C.white : C.ink), fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11.5, color: oscura ? C.seam : C.slate, marginTop: 3, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}

// Cuotas en vivo (colección propia de Financiera).
function useCuotas(db) {
  const [cuotas, setCuotas] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => onSnapshot(collection(db, COL_CUOTAS), (snap) => { setCuotas(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setError(""); }, (e) => setError(e?.message || "No se pudieron leer las cuotas.")), [db]);
  return { cuotas, error };
}

// Barras apiladas de los 7 meses con la línea del ponderado.
function Grafico({ lista, ponderado }) {
  const W = 520, H = 250, pad = 30, bw = 44;
  const gap = (W - 2 * pad - lista.length * bw) / (lista.length - 1);
  const max = Math.max(1, ...lista.map((m) => m.total), ponderado.mesesUsados ? ponderado.total : 0) * 1.08;
  const base = H - 26;
  const escala = (v) => (v / max) * (base - 34);
  const millones = (v) => (v / 1e6).toFixed(0);
  const yPond = base - escala(ponderado.total);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Lo que se paga cada mes por rubro, con el promedio ponderado">
      {lista.map((m, k) => {
        const x = pad + k * (bw + gap);
        let y = base;
        const partes = RUBROS.map((r) => { const h = escala(m[r.k]); y -= h; return <rect key={r.k} x={x} y={y} width={bw} height={Math.max(0, h)} fill={r.color} />; });
        return (
          <g key={m.ym}>
            {m.hayDatos ? partes : <rect x={x} y={base - 3} width={bw} height={3} fill={C.border} />}
            {m.hayDatos ? <text x={x + bw / 2} y={y - 5} fontSize="10.5" fontWeight="700" textAnchor="middle" fill={C.ink}>{millones(m.total)}</text> : <text x={x + bw / 2} y={base - 9} fontSize="10" textAnchor="middle" fill={C.slate}>s/d</text>}
            <text x={x + bw / 2} y={H - 8} fontSize="11" textAnchor="middle" fill={C.slate} fontWeight={k === lista.length - 1 ? 800 : 500}>{mesCorto(m.ym)}</text>
          </g>
        );
      })}
      {ponderado.mesesUsados ? <line x1={pad - 8} x2={W - pad + 8} y1={yPond} y2={yPond} stroke={C.ink} strokeWidth="1.5" strokeDasharray="5 4" /> : null}
      <line x1={pad - 8} x2={pad + 14} y1={11} y2={11} stroke={C.ink} strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={pad + 20} y={15} fontSize="10.5" fontWeight="700" fill={C.ink}>{ponderado.mesesUsados ? `ponderado ${millones(ponderado.total)} (millones)` : "sin ponderado todavía"}</text>
    </svg>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export function CuantoPagarMesView({ db, onIrEndeudamiento }) {
  const hoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000), []);
  const [ym, setYm] = useState(`${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}`);
  const [datos, setDatos] = useState({ liq: {}, gastos: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState(null);
  // (2026-11-05) Provisiones: tipo de nómina abierto (lista de personas) y mes que se muestra ("actual" | "anterior").
  const [provTipo, setProvTipo] = useState(null);
  const [provMes, setProvMes] = useState("actual");
  const { cuotas, error: errorCuotas } = useCuotas(db);
  // (2026-11-05) Resumen mensual de ingresos de clientes (lo guarda la pantalla «Ingresos» al traer de Busint).
  // Se prefiere el «Total Yanko» (TNS + traslados externos de Busint); si no existe, el de Busint.
  const [cacheBusint, setCacheBusint] = useState(null);
  const [cacheTotal, setCacheTotal] = useState(null);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_cache", "main"), (s) => setCacheBusint(s.exists() ? s.data() : null), () => {}), [db]);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_cache", "total_yanko"), (s) => setCacheTotal(s.exists() ? s.data() : null), () => {}), [db]);
  const ingresosCache = cacheTotal || cacheBusint;
  const [ingresosIndutex, setIngresosIndutex] = useState(null);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_cache", "tns_indutex"), (s) => setIngresosIndutex(s.exists() ? s.data() : null), () => {}), [db]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError("");
    const desde = `${sumarMes(ym, -MESES_PONDERADO)}-Q1`;
    const hasta = `${ym}-Q2`;
    const leer = (col) => getDocs(query(collection(db, col), where("periodoId", ">=", desde), where("periodoId", "<=", hasta)));
    Promise.all([leer("nomina_fiscal_liquidaciones"), leer("nomina_fiscal_destajo_liquidaciones"), leer("nomina_destajo_liquidaciones"), leer("nomina_prestacion_servicios_liquidaciones"), getDocs(collection(db, "costos_gastos_mes"))])
      .then(([f, fd, d, ps, g]) => {
        if (!vivo) return;
        const lista = (s) => s.docs.map((x) => ({ ...x.data(), id: x.id }));
        setDatos({ liq: { "Fiscal": lista(f), "Fiscal Destajo": lista(fd), "Destajo": lista(d), "Prestación de Servicios": lista(ps) }, gastos: lista(g) });
        setCargando(false);
      })
      .catch((e) => { if (vivo) { setError(e?.message || "No se pudieron leer los datos."); setCargando(false); } });
    return () => { vivo = false; };
  }, [db, ym]);

  const res = useMemo(() => cuantoPagarMes({ ym, liquidaciones: datos.liq, gastosDocs: datos.gastos, cuotas }), [ym, datos, cuotas]);
  const { actual, anterior, ponderado: pond } = res;
  const hayPond = pond.mesesUsados > 0;
  const textoFaltan = (m) => m.faltan.map((f) => `${f.tipo} ${f.falta.join(" y ")}`).join(" · ");
  const psMonto = actual.porTipo["Prestación de Servicios"]?.neto || 0;

  // Ingresos promedio: hasta 3 meses completos (anteriores al mes de hoy en Bogotá) con ingresos > 0, frente a lo que necesito al mes.
  const promIngresos = (cache) => {
    const mesHoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7);
    const lista = (cache?.meses || []).filter((m) => m.ym < mesHoy && Number(m.total) > 0).sort((a, b) => (a.ym < b.ym ? 1 : -1)).slice(0, 3);
    if (!lista.length) return null;
    return { n: lista.length, desde: lista[lista.length - 1].ym, hasta: lista[0].ym, prom: lista.reduce((t, m) => t + Number(m.total), 0) / lista.length };
  };
  const ingresosProm = useMemo(() => promIngresos(ingresosCache), [ingresosCache]); // eslint-disable-line react-hooks/exhaustive-deps
  const indutexProm = useMemo(() => promIngresos(ingresosIndutex), [ingresosIndutex]); // eslint-disable-line react-hooks/exhaustive-deps
  const difIngreso = ingresosProm && hayPond ? ingresosProm.prom - res.necesito : null;

  const subActual = actual.completo ? "Todas las quincenas confirmadas" : actual.hayDatos ? `Faltan por confirmar: ${textoFaltan(actual)}` : "Todavía no hay liquidaciones confirmadas este mes";
  const varMes = actual.hayDatos && anterior.hayDatos ? variacion(actual.total, anterior.total) : null;

  const abrirDetalle = (r) => { setDetalle(r.k); setProvTipo(null); setProvMes("actual"); };
  const vd = detalle ? RUBROS.find((r) => r.k === detalle) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: C.ink }}>Cuánto debo pagar al mes</h2>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Boton onClick={() => setYm(sumarMes(ym, -1))}>‹</Boton>
          <div style={{ fontSize: 15, fontWeight: 800, minWidth: 130, textAlign: "center" }}>{nombreMes(ym)}</div>
          <Boton onClick={() => setYm(sumarMes(ym, 1))}>›</Boton>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 16, maxWidth: 840, lineHeight: 1.5 }}>
        Suma lo que sale cada mes: nómina, seguridad social, provisiones, gastos del Excel y cuotas. Compara con el mes anterior y con el <b>promedio ponderado de los 6 meses anteriores</b> (cada mes pesa más cuanto más reciente: 1, 2, 3, 4, 5 y 6) para saber cuánto necesitas al mes de verdad. Solo cuentan liquidaciones ya confirmadas.
      </div>
      {error || errorCuotas ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{error || errorCuotas}</div> : null}
      {cargando ? <div style={{ fontSize: 13, color: C.slate, marginBottom: 12 }}>Leyendo nómina y gastos…</div> : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Tarjeta oscura fondo={C.ink} borde={C.ink} titulo={`Debo pagar en ${minusculaMes(ym)}`} valor={money(actual.total)} sub={subActual} />
        <Tarjeta titulo={`Mes anterior · ${minusculaMes(anterior.ym)}`} valor={anterior.hayDatos ? money(anterior.total) : "—"} sub={anterior.hayDatos ? `${nombreMes(ym).split(" ")[0]} es ${txtVariacion(varMes)} frente a ${minusculaMes(anterior.ym)}${anterior.completo ? "" : ` · incompleto: ${textoFaltan(anterior)}`}` : "Sin liquidaciones confirmadas ese mes"} />
        <Tarjeta titulo={`Promedio ponderado · ${MESES_PONDERADO} meses`} valor={hayPond ? money(pond.total) : "—"} sub={hayPond ? `${pond.mesesUsados} de ${pond.mesesPosibles} meses con todas las quincenas confirmadas, con más peso a los recientes${pond.mesesGastos < pond.mesesUsados ? ` · gastos: solo ${pond.mesesGastos} ${pond.mesesGastos === 1 ? "mes" : "meses"} con gastos cargados` : ""}` : "Todavía no hay meses completos para ponderar"} />
        <Tarjeta fondo={C.redBg} borde="#F3C9C2" colorValor={C.red} titulo="Necesito al mes (con endeudamiento)" valor={hayPond ? money(res.necesito) : "—"} sub={hayPond ? `${money(pond.operacion)} operación ponderada + ${money(res.cuotasHoy)} de cuotas vigentes` : `Sin ponderado; hoy las cuotas vigentes suman ${money(res.cuotasHoy)}`} />
        <Tarjeta
          titulo="Ingresos de clientes (promedio)"
          valor={ingresosProm ? money(ingresosProm.prom) : "—"}
          colorValor={difIngreso === null ? undefined : difIngreso >= 0 ? "#1E7B4B" : C.red}
          sub={ingresosProm
            ? `${difIngreso === null ? "Sin ponderado para comparar" : difIngreso >= 0 ? `Sobran ${money(difIngreso)} al mes frente a lo que necesito` : `Faltan ${money(-difIngreso)} al mes frente a lo que necesito`} · promedio de ${ingresosProm.n} ${ingresosProm.n === 1 ? "mes" : "meses"} (${nombreMes(ingresosProm.desde)}${ingresosProm.n > 1 ? ` a ${nombreMes(ingresosProm.hasta)}` : ""}) · ${cacheTotal ? "cobros de TNS + traslados externos de Busint (Yanko)" : "cobros de Busint (Yanko)"}${indutexProm ? ` · Indutex (TNS) aparte: ${money(indutexProm.prom)} al mes` : ""}`
            : "Entra a Financiera > Ingresos y pulsa «Traer desde TNS y Busint» para ver cuánto entra frente a cuánto debo pagar"}
        />
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ ...caja, flex: "1.45 1 520px", overflowX: "auto" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>Por rubro: este mes, el anterior y el ponderado</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Rubro</th><th style={th}>{nombreMes(ym).split(" ")[0]}</th><th style={th}>{MESES[Number(anterior.ym.slice(5, 7)) - 1]}</th><th style={{ ...th, background: "#FFE9A8", color: "#7A5200" }}>Ponderado {MESES_PONDERADO} meses</th><th style={th}>vs. anterior</th></tr></thead>
            <tbody>
              {RUBROS.map((r) => (
                <tr key={r.k} onClick={() => abrirDetalle(r)} style={{ cursor: "pointer" }} title="Clic para ver el detalle">
                  <td style={tdL}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: r.color, marginRight: 8 }} />{r.label} ▸</td>
                  <td style={td}>{money(actual[r.k])}</td>
                  <td style={td}>{anterior.hayDatos ? money(anterior[r.k]) : "—"}</td>
                  <td style={{ ...td, background: "#FFF4D6", fontWeight: 800 }}>{hayPond ? money(pond[r.k]) : "—"}</td>
                  <td style={{ ...td, color: C.slate, fontSize: 12 }}>{anterior.hayDatos && anterior[r.k] !== actual[r.k] ? txtVariacion(variacion(actual[r.k], anterior[r.k])) : "—"}</td>
                </tr>
              ))}
              <tr style={{ background: C.canvas }}>
                <td style={{ ...tdL, fontWeight: 900, borderBottom: "none" }}>Total por pagar</td>
                <td style={{ ...td, fontWeight: 900, borderBottom: "none" }}>{money(actual.total)}</td>
                <td style={{ ...td, fontWeight: 900, borderBottom: "none" }}>{anterior.hayDatos ? money(anterior.total) : "—"}</td>
                <td style={{ ...td, fontWeight: 900, background: "#FFF4D6", borderBottom: "none" }}>{hayPond ? money(pond.total) : "—"}</td>
                <td style={{ ...td, color: C.slate, fontSize: 12, fontWeight: 800, borderBottom: "none" }}>{txtVariacion(varMes)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ ...caja, flex: "1 1 340px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Los últimos 7 meses (millones)</div>
          <Grafico lista={res.lista} ponderado={pond} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.slate, marginTop: 2 }}>
            {RUBROS.map((r) => <span key={r.k}><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: r.color, marginRight: 5 }} />{r.label.split(" (")[0]}</span>)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ ...caja, flex: "1.45 1 520px", overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Endeudamiento: cuotas que se pagan en {minusculaMes(ym)}</div>
            <div style={{ flex: 1 }} />
            {onIrEndeudamiento ? <Boton chico onClick={onIrEndeudamiento}>Administrar cuotas →</Boton> : null}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Cuota</th><th style={th}>Valor mensual</th><th style={th}>Se paga</th><th style={th}>Termina</th></tr></thead>
            <tbody>
              {actual.cuotasLista.map((c) => (
                <tr key={c.id}><td style={tdL}>{c.nombre}{c.acreedor ? <div style={{ fontSize: 11, fontWeight: 500, color: C.slate }}>{c.acreedor}</div> : null}</td><td style={td}>{money(c.valorMensual)}</td><td style={td}>{c.diaPago ? `día ${c.diaPago}` : "—"}</td><td style={td}>{c.hasta ? `${mesCorto(c.hasta)} ${c.hasta.slice(0, 4)}` : "Sin fecha"}</td></tr>
              ))}
              {!actual.cuotasLista.length && <tr><td colSpan={4} style={{ ...td, textAlign: "left", color: C.slate }}>No hay cuotas vigentes en este mes. Agrégalas en «Endeudamiento».</td></tr>}
              {actual.cuotasLista.length > 0 && <tr style={{ background: C.canvas }}><td style={{ ...tdL, fontWeight: 900, borderBottom: "none" }}>Total cuotas</td><td style={{ ...td, fontWeight: 900, borderBottom: "none" }}>{money(actual.cuotas)}</td><td style={{ ...td, borderBottom: "none" }} /><td style={{ ...td, borderBottom: "none" }} /></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ ...caja, flex: "1 1 340px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>Cuánto baja lo que pago por cuotas</div>
          <Escalon pasos={res.escalon} />
        </div>
      </div>

      {psMonto > 0 ? (
        <div style={{ background: C.amberBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.amber, lineHeight: 1.5, marginBottom: 10 }}>
          Prestación de Servicios ({money(psMonto)}) ya está sumada en la nómina. Si esos pagos también están en el Excel de gastos, se cuentan dos veces: revisa el detalle de «Gastos del Excel».
        </div>
      ) : null}
      {actual.gastosInfo.origen === "anterior" ? <div style={{ background: C.amberBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.amber, lineHeight: 1.5, marginBottom: 10 }}>Este mes no tiene gastos guardados: se usan los de {nombreMes(actual.gastosInfo.deMes)}. Cárgalos en ¿Cubro mis costos? para dejarlos fijos.</div> : null}
      {actual.gastosInfo.origen === "ninguno" ? <div style={{ background: C.amberBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.amber, lineHeight: 1.5, marginBottom: 10 }}>Todavía no hay gastos del Excel cargados. Súbelos en Planeación → Tablero de Costos → ¿Cubro mis costos?</div> : null}
      <div style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.6 }}>
        El ponderado solo usa meses con todas las quincenas confirmadas de cada tipo de nómina. Los gastos de cada mes salen de lo que hayas guardado ese mes en ¿Cubro mis costos? (si falta, el último mes cargado). Las cuotas cuentan en los meses entre su inicio y su fin.
      </div>

      {vd ? (
        <Ventana ancho={vd.k === "provisiones" ? 1100 : 680} titulo={`${vd.label} — ${nombreMes(ym)}`} sub={vd.campoTipo ? "Por tipo de nómina, de las liquidaciones confirmadas." : vd.k === "gastos" ? (actual.gastosInfo.origen === "anterior" ? `Gastos de ${nombreMes(actual.gastosInfo.deMes)} (el mes no tiene gastos guardados).` : "Gastos incluidos del Excel.") : "Cuotas vigentes en el mes."} onClose={() => setDetalle(null)}>
          {vd.campoTipo ? (
            <>
            <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
              <thead><tr><th style={thL}>Tipo de nómina</th><th style={th}>Personas</th><th style={th}>Quincenas</th><th style={th}>{nombreMes(ym).split(" ")[0]}</th><th style={th}>{MESES[Number(anterior.ym.slice(5, 7)) - 1]}</th></tr></thead>
              <tbody>
                {TIPOS_NOMINA.map((t) => { const a = actual.porTipo[t]; const b = anterior.porTipo[t]; return (
                  <tr key={t} onClick={vd.k === "provisiones" ? () => setProvTipo(provTipo === t ? null : t) : undefined} style={vd.k === "provisiones" ? { cursor: "pointer", background: provTipo === t ? C.canvas : undefined } : undefined} title={vd.k === "provisiones" ? "Clic para ver las cuatro provisiones y las personas" : undefined}><td style={tdL}>{vd.k === "provisiones" ? <span style={{ display: "inline-block", transition: "transform 0.15s", transform: provTipo === t ? "rotate(90deg)" : "none", fontSize: 11, marginRight: 6, color: C.slate }}>›</span> : null}{t}</td><td style={td}>{a.personas}</td><td style={td}>{a.quincenas.length ? a.quincenas.join(" y ") : "—"}</td><td style={td}>{money(a[vd.campoTipo])}</td><td style={td}>{money(b[vd.campoTipo])}</td></tr>
                ); })}
                <tr style={{ background: C.canvas }}><td style={{ ...tdL, fontWeight: 900 }}>Total</td><td style={td} /><td style={td} /><td style={{ ...td, fontWeight: 900 }}>{money(actual[vd.k])}</td><td style={{ ...td, fontWeight: 900 }}>{money(anterior[vd.k])}</td></tr>
              </tbody>
            </table>
            {vd.k === "provisiones" && (() => {
              const mesMostrado = provMes === "anterior" ? anterior : actual;
              const t = provTipo ? mesMostrado.porTipo[provTipo] : null;
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.slate, lineHeight: 1.6, marginBottom: 12 }}>
                    <b>De dónde salen:</b> de las liquidaciones de Nómina ya confirmadas (Q1 y Q2 de cada mes); aquí no se calcula nada nuevo. Cada liquidación trae, por persona y quincena: cesantías = (sueldo + auxilio) ÷ 12, intereses = cesantías × 12 %, prima = (sueldo + auxilio) ÷ 12 y vacaciones = sueldo × 15 ÷ 360. En Destajo se calculan sobre el sueldo mínimo de la ficha del trabajador, no sobre lo que produjo; Prestación de Servicios no tiene provisiones.
                    {!actual.hayDatos && <div style={{ marginTop: 6 }}><b>{nombreMes(ym).split(" ")[0]} sale en $0</b> porque todavía no hay quincenas de ese mes confirmadas en Nómina; se llena cuando se confirme la Q1.</div>}
                  </div>
                  {provTipo ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 800, color: C.ink, fontSize: 13 }}>{provTipo}</div>
                        {[["actual", nombreMes(ym).split(" ")[0]], ["anterior", MESES[Number(anterior.ym.slice(5, 7)) - 1]]].map(([k, label]) => (
                          <Boton key={k} chico variante={provMes === k ? "oscuro" : "claro"} onClick={() => setProvMes(k)}>{label}</Boton>
                        ))}
                      </div>
                      {t.personasLista.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: C.slate }}>Sin liquidaciones confirmadas de este tipo en {nombreMes(mesMostrado.ym)}.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
                          <thead><tr>{[["#", "right"], ["Persona", "left"], ["Quinc.", "right"], ["Cesantías", "right"], ["Intereses", "right"], ["Prima", "right"], ["Vacaciones", "right"], ["Total", "right"]].map(([h, al]) => <th key={h} style={{ ...th, textAlign: al, position: "sticky", top: 0, background: C.white, zIndex: 1 }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {t.personasLista.map((p, i) => (
                              <tr key={p.clave}><td style={{ ...td, color: C.slate, width: 36 }}>{i + 1}</td><td style={{ ...td, textAlign: "left" }}>{p.nombre}</td><td style={td}>{p.quincenas}</td><td style={td}>{money(p.cesantias)}</td><td style={td}>{money(p.intereses)}</td><td style={td}>{money(p.prima)}</td><td style={td}>{money(p.vacaciones)}</td><td style={{ ...td, fontWeight: 800 }}>{money(p.total)}</td></tr>
                            ))}
                            <tr style={{ background: C.canvas }}><td style={td} /><td style={tdL}>Total ({t.personasLista.length} personas)</td><td style={td} /><td style={{ ...td, fontWeight: 800 }}>{money(t.cesantias)}</td><td style={{ ...td, fontWeight: 800 }}>{money(t.intereses)}</td><td style={{ ...td, fontWeight: 800 }}>{money(t.prima)}</td><td style={{ ...td, fontWeight: 800 }}>{money(t.vacaciones)}</td><td style={{ ...td, fontWeight: 900 }}>{money(t.prestaciones)}</td></tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: C.slate }}>Toca un tipo de nómina para ver las cuatro provisiones y las personas.</div>
                  )}
                </div>
              );
            })()}
            </>
          ) : vd.k === "gastos" ? (
            <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
              <thead><tr><th style={thL}>Empresa</th><th style={thL}>Concepto</th><th style={th}>Valor mensual</th></tr></thead>
              <tbody>
                {actual.gastosInfo.lineas.map((l, i) => <tr key={i}><td style={{ ...td, textAlign: "left" }}>{l.empresa}</td><td style={tdL}>{l.concepto}</td><td style={td}>{money(l.valor)}</td></tr>)}
                {!actual.gastosInfo.lineas.length && <tr><td colSpan={3} style={{ ...td, textAlign: "left", color: C.slate }}>Sin gastos cargados.</td></tr>}
                <tr style={{ background: C.canvas }}><td style={tdL} colSpan={2}>Total</td><td style={{ ...td, fontWeight: 900 }}>{money(actual.gastos)}</td></tr>
              </tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
              <thead><tr><th style={thL}>Cuota</th><th style={th}>Valor mensual</th><th style={th}>Se paga</th><th style={th}>Termina</th></tr></thead>
              <tbody>
                {actual.cuotasLista.map((c) => <tr key={c.id}><td style={tdL}>{c.nombre}</td><td style={td}>{money(c.valorMensual)}</td><td style={td}>{c.diaPago ? `día ${c.diaPago}` : "—"}</td><td style={td}>{c.hasta ? nombreMes(c.hasta) : "Sin fecha"}</td></tr>)}
                {!actual.cuotasLista.length && <tr><td colSpan={4} style={{ ...td, textAlign: "left", color: C.slate }}>No hay cuotas vigentes este mes.</td></tr>}
                <tr style={{ background: C.canvas }}><td style={tdL}>Total</td><td style={{ ...td, fontWeight: 900 }}>{money(actual.cuotas)}</td><td style={td} /><td style={td} /></tr>
              </tbody>
            </table>
          )}
        </Ventana>
      ) : null}
    </div>
  );
}

function Escalon({ pasos }) {
  const tope = Math.max(1, ...pasos.map((p) => p.total));
  if (!pasos.length || tope <= 1) return <div style={{ fontSize: 12.5, color: C.slate }}>Todavía no hay cuotas registradas.</div>;
  return (
    <div>
      {pasos.map((p, i) => (
        <div key={p.ym} style={{ marginBottom: 9 }}>
          <div style={{ fontSize: 11.5, color: C.slate }}>{i === 0 ? `Desde ${nombreMes(p.ym)}` : nombreMes(p.ym)}</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(p.total)}</div>
          <div style={{ height: 7, width: `${(p.total / tope) * 100}%`, minWidth: p.total > 0 ? 4 : 0, background: C.red, borderRadius: 4, marginTop: 3 }} />
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: C.slate }}>Cuando se acaba una cuota, lo que necesitas al mes baja solo.</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
const FORM_VACIO = { id: "", nombre: "", acreedor: "", valorMensual: "", diaPago: "", desde: "", hasta: "", nota: "" };
const entrada = { width: "100%", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };

export function EndeudamientoView({ db, isAdmin }) {
  const hoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000), []);
  const ymHoy = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}`;
  const { cuotas, error } = useCuotas(db);
  const [form, setForm] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [verTerminadas, setVerTerminadas] = useState(false);

  const estadoDe = (c) => (c.desde > ymHoy ? "futura" : c.hasta && c.hasta < ymHoy ? "terminada" : c.hasta && c.hasta <= sumarMes(ymHoy, 2) ? "pronto" : "vigente");
  const ordenadas = useMemo(() => [...cuotas].sort((a, b) => (a.hasta || "9999-99").localeCompare(b.hasta || "9999-99") || String(a.nombre).localeCompare(String(b.nombre))), [cuotas]);
  const activas = ordenadas.filter((c) => estadoDe(c) !== "terminada");
  const terminadas = ordenadas.filter((c) => estadoDe(c) === "terminada");
  const hoyCuotas = cuotasDelMes(cuotas, ymHoy);
  const pasos = escalonCuotas(cuotas, ymHoy);

  const ETIQUETA = { vigente: ["Vigente", C.green, C.greenBg], pronto: ["Termina pronto", C.amber, C.amberBg], futura: ["Aún no empieza", C.blue, C.blueBg], terminada: ["Terminada", C.slate, C.canvas] };

  function validar(f) {
    if (!f.nombre.trim()) return "Escribe el nombre de la cuota.";
    if (!(Number(f.valorMensual) > 0)) return "El valor mensual debe ser mayor que 0.";
    if (!/^\d{4}-\d{2}$/.test(f.desde)) return "Elige el mes en que empieza.";
    if (f.hasta && !/^\d{4}-\d{2}$/.test(f.hasta)) return "El mes en que termina no es válido.";
    if (f.hasta && f.hasta < f.desde) return "La cuota no puede terminar antes de empezar.";
    if (f.diaPago !== "" && !(Number(f.diaPago) >= 1 && Number(f.diaPago) <= 31)) return "El día de pago va de 1 a 31.";
    return "";
  }
  async function guardar() {
    const e = validar(form);
    if (e) { setMsg(e); return; }
    setGuardando(true);
    setMsg("");
    try {
      const id = form.id || `cuota_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const previa = cuotas.find((c) => c.id === id);
      await setDoc(doc(db, COL_CUOTAS, id), {
        nombre: form.nombre.trim(), acreedor: form.acreedor.trim(), valorMensual: Number(form.valorMensual), diaPago: form.diaPago === "" ? null : Number(form.diaPago),
        desde: form.desde, hasta: form.hasta || "", nota: form.nota.trim(), creadoEn: previa?.creadoEn || new Date().toISOString(), actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setForm(null);
    } catch (err) { setMsg(`No se pudo guardar: ${err?.message || err}`); }
    finally { setGuardando(false); }
  }
  async function eliminar() {
    if (!borrar) return;
    setGuardando(true);
    try { await deleteDoc(doc(db, COL_CUOTAS, borrar.id)); setBorrar(null); setMsg(""); }
    catch (err) { setMsg(`No se pudo eliminar (solo un administrador puede): ${err?.message || err}`); setBorrar(null); }
    finally { setGuardando(false); }
  }
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fila = (c) => {
    const [txt, col, fondo] = ETIQUETA[estadoDe(c)];
    return (
      <tr key={c.id}>
        <td style={tdL}>{c.nombre}{c.acreedor ? <div style={{ fontSize: 11, fontWeight: 500, color: C.slate }}>{c.acreedor}</div> : null}{c.nota ? <div style={{ fontSize: 11, fontWeight: 500, color: C.slate }}>{c.nota}</div> : null}</td>
        <td style={td}>{money(c.valorMensual)}</td>
        <td style={td}>{c.diaPago ? `día ${c.diaPago}` : "—"}</td>
        <td style={td}>{nombreMes(c.desde)}</td>
        <td style={td}>{c.hasta ? nombreMes(c.hasta) : "Sin fecha"}</td>
        <td style={{ ...td, textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 800, color: col, background: fondo, padding: "2px 9px", borderRadius: 10 }}>{txt}</span></td>
        {isAdmin ? <td style={{ ...td, textAlign: "right" }}><span style={{ display: "inline-flex", gap: 6 }}><Boton chico onClick={() => { setMsg(""); setForm({ ...FORM_VACIO, ...c, valorMensual: String(c.valorMensual ?? ""), diaPago: c.diaPago == null ? "" : String(c.diaPago), hasta: c.hasta || "", acreedor: c.acreedor || "", nota: c.nota || "" }); }}>Editar</Boton><Boton chico onClick={() => setBorrar(c)}>Eliminar</Boton></span></td> : null}
      </tr>
    );
  };
  const cabecera = <thead><tr><th style={thL}>Cuota</th><th style={th}>Valor mensual</th><th style={th}>Se paga</th><th style={th}>Empieza</th><th style={th}>Termina</th><th style={{ ...th, textAlign: "center" }}>Estado</th>{isAdmin ? <th style={th} /> : null}</tr></thead>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: C.ink }}>Endeudamiento</h2>
        <div style={{ flex: 1 }} />
        {isAdmin ? <Boton variante="oscuro" onClick={() => { setMsg(""); setForm({ ...FORM_VACIO, desde: ymHoy }); }}>＋ Agregar cuota</Boton> : null}
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 16, maxWidth: 840, lineHeight: 1.5 }}>
        Las cuotas que pagas cada mes (créditos, leasing, acuerdos con proveedores). Cada una suma en «Cuánto debo pagar» los meses entre su inicio y su fin. {isAdmin ? "" : "Solo un administrador puede agregarlas o cambiarlas."}
      </div>
      {error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{error}</div> : null}
      {msg ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{msg}</div> : null}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Tarjeta fondo={C.redBg} borde="#F3C9C2" colorValor={C.red} titulo={`Cuotas de ${minusculaMes(ymHoy)}`} valor={money(hoyCuotas.total)} sub={`${hoyCuotas.lista.length} ${hoyCuotas.lista.length === 1 ? "cuota vigente" : "cuotas vigentes"}`} />
        <Tarjeta titulo="Próxima en terminar" valor={(() => { const p = hoyCuotas.lista.filter((c) => c.hasta).sort((a, b) => a.hasta.localeCompare(b.hasta))[0]; return p ? nombreMes(p.hasta) : "—"; })()} sub={(() => { const p = hoyCuotas.lista.filter((c) => c.hasta).sort((a, b) => a.hasta.localeCompare(b.hasta))[0]; return p ? `${p.nombre} · ${money(p.valorMensual)} al mes` : "Ninguna vigente tiene fecha de fin"; })()} />
        <Tarjeta titulo="Cuando termine la última" valor={(() => { const f = hoyCuotas.lista.map((c) => c.hasta); return f.length && f.every(Boolean) ? nombreMes(f.sort().slice(-1)[0]) : "—"; })()} sub={hoyCuotas.lista.some((c) => !c.hasta) ? "Alguna cuota vigente no tiene fecha de fin" : "Sin deuda por cuotas después de esa fecha"} />
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ ...caja, flex: "1.6 1 560px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {cabecera}
            <tbody>
              {activas.map(fila)}
              {!activas.length && <tr><td colSpan={isAdmin ? 7 : 6} style={{ ...td, textAlign: "left", color: C.slate }}>Todavía no hay cuotas.{isAdmin ? " Usa «Agregar cuota»." : ""}</td></tr>}
              {verTerminadas ? terminadas.map(fila) : null}
            </tbody>
          </table>
          {terminadas.length > 0 ? <div style={{ marginTop: 10 }}><Boton chico onClick={() => setVerTerminadas((v) => !v)}>{verTerminadas ? "Ocultar terminadas" : `Ver terminadas (${terminadas.length})`}</Boton></div> : null}
        </div>
        <div style={{ ...caja, flex: "1 1 300px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>Cuánto baja lo que pago por cuotas</div>
          <Escalon pasos={pasos} />
        </div>
      </div>

      {form ? (
        <Ventana titulo={form.id ? "Editar cuota" : "Agregar cuota"} ancho={560} onClose={() => setForm(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: C.slate }}>Nombre de la cuota<input style={entrada} value={form.nombre} onChange={campo("nombre")} placeholder="Ej.: Crédito de capital de trabajo" /></label>
            <label style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: C.slate }}>A quién se paga<input style={entrada} value={form.acreedor} onChange={campo("acreedor")} placeholder="Banco, leasing, proveedor…" /></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Valor mensual ($)<input style={entrada} type="number" min="0" value={form.valorMensual} onChange={campo("valorMensual")} /></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Día de pago (1 a 31)<input style={entrada} type="number" min="1" max="31" value={form.diaPago} onChange={campo("diaPago")} /></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Empieza (mes)<input style={entrada} type="month" value={form.desde} onChange={campo("desde")} /></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Termina (mes, opcional)<input style={entrada} type="month" value={form.hasta} onChange={campo("hasta")} /></label>
            <label style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: C.slate }}>Nota (opcional)<input style={entrada} value={form.nota} onChange={campo("nota")} /></label>
          </div>
          {msg ? <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>{msg}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Boton onClick={() => setForm(null)}>Cancelar</Boton>
            <Boton variante="oscuro" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cuota"}</Boton>
          </div>
        </Ventana>
      ) : null}
      {borrar ? (
        <Ventana titulo="Eliminar cuota" ancho={460} onClose={() => setBorrar(null)}>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: C.ink }}>¿Eliminar «{borrar.nombre}» ({money(borrar.valorMensual)} al mes)? Dejará de sumar en todos los meses, también en los anteriores. Si solo terminó, mejor ponle el mes en que termina.</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Boton onClick={() => setBorrar(null)}>Cancelar</Boton>
            <Boton variante="rojo" onClick={eliminar} disabled={guardando}>Sí, eliminar</Boton>
          </div>
        </Ventana>
      ) : null}
    </div>
  );
}
