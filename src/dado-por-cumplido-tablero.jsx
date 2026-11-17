// Pestaña «📊 Tablero» de Dado por Cumplido (2026-11-16, a pedido de Fredy).
// Muestra cuánto se ha recaudado con las bases (unidades DESPACHADAS × valor de la base de cada lote aprobado), por mes, en total,
// por base o por cliente, contra un presupuesto mensual. El presupuesto lo escribe un administrador (se guarda en
// dado_por_cumplido_presupuesto/{año}); mientras no haya uno escrito se sugiere la estructura que dejó guardada «¿Cubro mis costos?»
// (costos_cierres_mes/{año-mes}.resumen.estructura). Solo lee lotes ya cargados por Contabilidad.
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { construirTablero, factoresAFecha, lotesDelMes, matrizPorAnio, presupuestoEfectivo, resumenAFecha, topMasOtros, totalDe } from "./dado-por-cumplido-tablero-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE",
  blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const PALETA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#898781"];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n) || 0));
const pct = (x) => `${Math.round((Number(x) || 0) * 100)} %`;
const colorCumple = (x) => (x === null ? C.slate : x >= 1 ? C.green : x >= 0.9 ? C.amber : C.red);

const th = { padding: "8px 8px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, background: C.canvas, whiteSpace: "nowrap" };
const td = { padding: "8px 8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const tdL = { ...td, textAlign: "left", fontWeight: 700 };
const sel = { padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ink, fontSize: 13, fontFamily: "inherit" };

function Seg({ valor, opciones, onChange }) {
  return (
    <span style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      {opciones.map(([v, t]) => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{ padding: "7px 13px", fontSize: 13, fontFamily: "inherit", fontWeight: valor === v ? 800 : 600, border: "none", cursor: "pointer", background: valor === v ? C.ink : C.white, color: valor === v ? C.white : C.ink }}>{t}</button>
      ))}
    </span>
  );
}

function Tarjeta({ titulo, valor, sub, color }) {
  return (
    <div style={{ flex: "1 1 190px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || C.ink, marginTop: 4 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 12, color: C.slate, marginTop: 2, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}

// Eje con 4–6 marcas «redondas».
function marcasEje(max) {
  if (!(max > 0)) return { tope: 1, marcas: [0, 1] };
  const paso0 = max / 5;
  const pot = Math.pow(10, Math.floor(Math.log10(paso0)));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= paso0) || 10 * pot;
  const marcas = [];
  for (let v = 0; v <= max + paso * 0.999; v += paso) marcas.push(v);
  return { tope: marcas[marcas.length - 1], marcas };
}

function Columnas({ series, clave, presupuesto, formato, corto, resaltar }) {
  const W = 760, H = 300, mL = 70, mR = 12, mT = 12, mB = 28;
  const stacks = MESES.map((_, i) => series.reduce((s, x) => s + (x[clave][i] || 0), 0));
  const maxPres = presupuesto ? Math.max(...presupuesto) : 0;
  const { tope, marcas } = marcasEje(Math.max(...stacks, maxPres, 1));
  const anchoCol = (W - mL - mR) / 12;
  const barra = Math.min(36, anchoCol * 0.62);
  const y = (v) => mT + (H - mT - mB) * (1 - v / tope);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Columnas apiladas por mes" style={{ display: "block" }}>
      {marcas.map((v) => (
        <g key={v}>
          <line x1={mL} x2={W - mR} y1={y(v)} y2={y(v)} stroke={C.border} strokeWidth="1" />
          <text x={mL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#898781">{corto(v)}</text>
        </g>
      ))}
      {MESES.map((m, i) => {
        const cx = mL + anchoCol * i + anchoCol / 2;
        let acum = 0;
        return (
          <g key={m}>
            {series.map((s, k) => {
              const v = s[clave][i] || 0;
              if (v <= 0) return null;
              const y0 = y(acum), y1 = y(acum + v);
              acum += v;
              return (
                <rect key={s.nombre} x={cx - barra / 2} y={y1} width={barra} height={Math.max(0, y0 - y1 - 1)} fill={PALETA[k % PALETA.length]} opacity={resaltar === null || resaltar === undefined || resaltar === i ? 1 : 0.28}>
                  <title>{`${m} · ${s.nombre}: ${formato(v)}`}</title>
                </rect>
              );
            })}
            <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fontWeight={resaltar === i ? "700" : "400"} fill={resaltar === i ? "#1A1A2E" : "#898781"}>{m}</text>
          </g>
        );
      })}
      {presupuesto && maxPres > 0 ? (
        <g>
          <polyline fill="none" stroke="#5A5A7A" strokeWidth="2" strokeDasharray="6 4" points={presupuesto.map((v, i) => `${mL + anchoCol * i + anchoCol / 2},${y(v)}`).join(" ")} />
          {presupuesto.map((v, i) => (v > 0 ? <circle key={i} cx={mL + anchoCol * i + anchoCol / 2} cy={y(v)} r="3.5" fill="#5A5A7A"><title>{`${MESES[i]} · presupuesto: ${formato(v)}`}</title></circle> : null))}
        </g>
      ) : null}
    </svg>
  );
}

export default function DadoPorCumplidoTablero({ lotes, bases, db, isAdmin, currentUser }) {
  const hoyCol = new Date(Date.now() - 5 * 3600 * 1000);
  const anioActual = hoyCol.getUTCFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [modo, setModo] = useState("aprobacion");
  const [medida, setMedida] = useState("u");
  const [desglose, setDesglose] = useState("t");
  const [verTodos, setVerTodos] = useState(false);
  const [escrito, setEscrito] = useState({});
  const [estructuras, setEstructuras] = useState({});
  const [borrador, setBorrador] = useState({});
  const [errorGuardar, setErrorGuardar] = useState("");
  const [verAvisos, setVerAvisos] = useState("");
  const [mes, setMes] = useState(""); // "" = todo el año; 0–11 = un mes
  const [verLotesMes, setVerLotesMes] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "dado_por_cumplido_presupuesto", String(anio)),
      (snap) => setEscrito(snap.exists() ? snap.data().meses || {} : {}),
      () => setEscrito({})
    );
    return () => unsub();
  }, [db, anio]);

  useEffect(() => {
    let vivo = true;
    getDocs(collection(db, "costos_cierres_mes"))
      .then((snap) => {
        if (!vivo) return;
        const m = {};
        snap.docs.forEach((d) => { m[d.id] = Number(d.data()?.resumen?.estructura) || 0; });
        setEstructuras(m);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [db]);

  const tablero = useMemo(() => construirTablero(lotes, bases, { anio, modo }), [lotes, bases, anio, modo]);
  const porAnio = useMemo(() => matrizPorAnio(lotes, { modo }), [lotes, modo]);
  const aniosDisponibles = useMemo(() => [...new Set([anioActual, ...porAnio.map((a) => a.anio)])].sort((a, b) => b - a), [porAnio, anioActual]);
  const sugerido = useMemo(() => MESES.map((_, i) => estructuras[`${anio}-${String(i + 1).padStart(2, "0")}`] || 0), [estructuras, anio]);
  const presEf = useMemo(() => presupuestoEfectivo(escrito, sugerido), [escrito, sugerido]);
  const factores = useMemo(() => factoresAFecha(anio), [anio]);
  const presValores = presEf.map((p) => p.valor);
  const alaFecha = resumenAFecha(tablero.total.d, presValores, factores);

  const clave = medida;
  const formato = medida === "d" ? money : fmt;
  const cortoEje = (v) => (medida === "d" ? (v >= 1e6 ? `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : `$${fmt(v)}`) : fmt(v));

  const seriesGrafico = desglose === "t" ? [{ ...tablero.total, nombre: "Total empresa" }] : desglose === "b" ? tablero.bases : topMasOtros(tablero.clientes, 7, "Otros clientes");
  const seriesTabla = desglose === "t" ? [] : desglose === "b" ? tablero.bases : (verTodos ? tablero.clientes : topMasOtros(tablero.clientes, 15, "Otros clientes"));
  const unidadesAnio = totalDe(tablero.total.u);
  const recaudadoAnio = totalDe(tablero.total.d);
  const enfocado = mes !== "";
  const lotesMes = useMemo(() => (enfocado ? lotesDelMes(lotes, bases, { anio, modo, mes }) : []), [lotes, bases, anio, modo, mes, enfocado]);
  const uFoco = enfocado ? tablero.total.u[mes] : unidadesAnio;
  const dFoco = enfocado ? tablero.total.d[mes] : recaudadoAnio;
  const lotesFoco = enfocado ? lotesMes.filter((x) => x.despachadas > 0).length : tablero.lotesConDespachada;
  const presFoco = enfocado ? presValores[mes] * factores[mes] : alaFecha.presupuesto;
  const recFoco = enfocado ? (factores[mes] > 0 ? tablero.total.d[mes] : 0) : alaFecha.recaudado;
  const cumpleFoco = presFoco > 0 ? recFoco / presFoco : null;
  const nombreFoco = enfocado ? `${MESES[mes]} ${anio}` : `${anio}`;
  const rankingMes = useMemo(() => {
    const m = new Map();
    lotesMes.forEach((x) => {
      const k = desglose === "b" ? x.categoria : x.cliente;
      const g = m.get(k) || { nombre: k, u: 0, d: 0, lotes: 0 };
      g.u += x.despachadas;
      g.d += x.recaudado;
      g.lotes += 1;
      m.set(k, g);
    });
    return [...m.values()].sort((a, b) => (medida === "d" ? b.d - a.d : b.u - a.u));
  }, [lotesMes, desglose, medida]);

  async function guardarMes(i, texto) {
    const limpio = String(texto ?? "").trim().replace(/\$/g, "").replace(/\./g, "").replace(",", ".");
    const v = limpio === "" ? null : Number(limpio);
    if (v !== null && !Number.isFinite(v)) return;
    setErrorGuardar("");
    try {
      await setDoc(doc(db, "dado_por_cumplido_presupuesto", String(anio)), { meses: { [i]: v }, actualizadoEn: new Date().toISOString(), actualizadoPor: currentUser?.email || currentUser?.nombre || "" }, { merge: true });
    } catch (err) {
      setErrorGuardar(`No se pudo guardar el presupuesto: ${err?.message || err}`);
    }
  }

  async function descargarExcel() {
    const XLSX = await import("xlsx");
    const filasDe = (grupos, k) => grupos.map((g) => ({ Nombre: g.nombre, ...Object.fromEntries(MESES.map((m, i) => [m, Math.round(g[k][i])])), Año: Math.round(totalDe(g[k])) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDe([{ ...tablero.total, nombre: "Total empresa" }], "d")), "Total recaudado");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDe([{ ...tablero.total, nombre: "Total empresa" }], "u")), "Total unidades");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDe(tablero.bases, "d")), "Recaudado por base");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDe(tablero.bases, "u")), "Unidades por base");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDe(tablero.clientes, "d")), "Recaudado por cliente");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDe(tablero.clientes, "u")), "Unidades por cliente");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(MESES.map((m, i) => ({ Mes: m, Presupuesto: Math.round(presValores[i]), Origen: presEf[i].origen }))), "Presupuesto");
    const lote = (x) => ({ Lote: x.numLote, Referencia: x.referencia, Cliente: x.cliente, "Categoría BASE": x.categoria, "Fecha del lote": x.fecha, Aprobado: x.aprobado, Cortadas: x.cortadas, Despachadas: x.despachadas, "Base por prenda": Math.round(x.base) });
    if (tablero.detalleSinBase.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tablero.detalleSinBase.map(lote)), "Lotes sin base");
    if (tablero.detalleSinDespachada.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tablero.detalleSinDespachada.map(lote)), "Lotes sin despachada");
    if (enfocado) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lotesMes.map((x) => ({ ...lote(x), Recaudado: Math.round(x.recaudado) }))), `Lotes ${MESES[mes]}`.slice(0, 31));
    XLSX.writeFile(wb, `tablero_dado_por_cumplido_${anio}${enfocado ? `_${MESES[mes]}` : ""}.xlsx`);
  }

  const titulo = `${medida === "d" ? "Recaudado con las bases" : "Unidades despachadas"} por mes · ${desglose === "t" ? "total empresa" : desglose === "b" ? "por base" : "por cliente"}`;
  const hayPresupuesto = presValores.some((v) => v > 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14, color: C.slate, fontSize: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>Año
          <select style={sel} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>Mes
          <select style={sel} value={mes === "" ? "" : String(mes)} onChange={(e) => { setMes(e.target.value === "" ? "" : Number(e.target.value)); setVerLotesMes(false); }}>
            <option value="">Todo el año</option>
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>El mes se toma por
          <select style={sel} value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="aprobacion">Fecha en que se dio por cumplido (aprobación)</option>
            <option value="lote">Fecha del lote</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>Medida
          <Seg valor={medida} onChange={setMedida} opciones={[["d", "Recaudado ($)"], ["u", "Unidades"]]} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>Desglose
          <Seg valor={desglose} onChange={setDesglose} opciones={[["t", "Total"], ["b", "Por base"], ["c", "Por cliente"]]} />
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={descargarExcel} style={{ ...sel, cursor: "pointer", fontWeight: 700, color: C.blue, borderColor: C.blue }}>📥 Descargar Excel</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Tarjeta titulo={`Unidades dadas por cumplido ${nombreFoco}`} valor={fmt(uFoco)} sub={`${lotesFoco} lotes aprobados con despachada`} />
        <Tarjeta titulo={enfocado ? `Recaudado ${nombreFoco}` : "Recaudado a la fecha"} valor={money(recFoco)} sub={enfocado ? "unidades × valor de la base" : (anio === anioActual ? "enero hasta hoy" : `todo ${anio}`)} />
        <Tarjeta titulo={enfocado ? "Presupuesto del mes" : "Presupuesto a la fecha"} valor={presFoco > 0 ? money(presFoco) : "—"} sub={presFoco > 0 ? "el mes en curso va proporcional a los días" : "escríbelo mes a mes en la tabla de abajo"} />
        <Tarjeta
          titulo="Cumplimiento"
          valor={cumpleFoco === null ? "—" : pct(cumpleFoco)}
          color={colorCumple(cumpleFoco)}
          sub={cumpleFoco === null ? "sin presupuesto todavía" : recFoco >= presFoco ? `${money(recFoco - presFoco)} por encima` : `faltan ${money(presFoco - recFoco)}`}
        />
        <Tarjeta titulo="Base promedio por prenda" valor={money(uFoco > 0 ? dFoco / uFoco : 0)} sub={`${fmt(uFoco)} unidades × base promedio = ${money(dFoco)}`} />
      </div>

      {tablero.sinDespachada > 0 || tablero.sinBase > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12, color: C.amber }}>
            {tablero.sinBase > 0 ? (
              <button type="button" onClick={() => setVerAvisos(verAvisos === "base" ? "" : "base")} style={{ ...sel, fontSize: 12, cursor: "pointer", color: C.amber, borderColor: C.amber, background: C.amberBg }}>
                ⚠ {tablero.sinBase} lote(s) sin valor de base: aportan $0 · {verAvisos === "base" ? "ocultar" : "ver cuáles"}
              </button>
            ) : null}
            {tablero.sinDespachada > 0 ? (
              <button type="button" onClick={() => setVerAvisos(verAvisos === "desp" ? "" : "desp")} style={{ ...sel, fontSize: 12, cursor: "pointer", color: C.amber, borderColor: C.amber, background: C.amberBg }}>
                ⚠ {tablero.sinDespachada} lote(s) sin cantidad despachada: aportan $0 · {verAvisos === "desp" ? "ocultar" : "ver cuáles"}
              </button>
            ) : null}
          </div>
          {verAvisos ? (() => {
            const lista = verAvisos === "base" ? tablero.detalleSinBase : tablero.detalleSinDespachada;
            const mostrar = lista.slice(0, 200);
            return (
              <div style={{ marginTop: 8, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: C.slate, marginBottom: 6 }}>
                  {verAvisos === "base"
                    ? "Lotes aprobados sin valor de base (sin categoría BASE o con la base en cero). Se corrigen en Históricos (editar lote aprobado) para que cuenten en el recaudado."
                    : "Lotes aprobados sin cantidad despachada (ni de Bodega ni de Busint). Revisa su despacho para que cuenten."}
                  {lista.length > mostrar.length ? ` Se muestran los primeros ${mostrar.length} de ${lista.length}; el resto va en el Excel.` : ""}
                </div>
                <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: "left" }}>Lote</th><th style={{ ...th, textAlign: "left" }}>Referencia</th><th style={{ ...th, textAlign: "left" }}>Cliente</th><th style={{ ...th, textAlign: "left" }}>Categoría BASE</th>
                        <th style={th}>Fecha lote</th><th style={th}>Aprobado</th><th style={th}>Cortadas</th><th style={th}>Despachadas</th><th style={th}>Base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mostrar.map((x, k) => (
                        <tr key={`${x.id}-${k}`}>
                          <td style={tdL}>{x.numLote || "–"}</td><td style={{ ...td, textAlign: "left" }}>{x.referencia || "–"}</td><td style={{ ...td, textAlign: "left" }}>{x.cliente}</td><td style={{ ...td, textAlign: "left" }}>{x.categoria}</td>
                          <td style={td}>{x.fecha || "–"}</td><td style={td}>{x.aprobado || "–"}</td><td style={td}>{fmt(x.cortadas)}</td><td style={td}>{fmt(x.despachadas)}</td><td style={td}>{x.base > 0 ? money(x.base) : "$0"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })() : null}
        </div>
      ) : null}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8 }}>{titulo}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: C.slate, marginBottom: 6 }}>
          {seriesGrafico.map((s, k) => (
            <span key={s.nombre} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 2, background: PALETA[k % PALETA.length], display: "inline-block" }} />{s.nombre}</span>
          ))}
          {medida === "d" && hayPresupuesto ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 16, borderTop: "2px dashed #5A5A7A", display: "inline-block" }} />Presupuesto</span> : null}
        </div>
        {unidadesAnio > 0 ? (
          <Columnas series={seriesGrafico} clave={clave} presupuesto={medida === "d" && hayPresupuesto ? presValores : null} formato={formato} corto={cortoEje} resaltar={enfocado ? mes : null} />
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay lotes aprobados con despachada en {anio}.</div>
        )}
      </div>

      {enfocado ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 4 }}>{MESES[mes]} {anio} · {desglose === "b" ? "por base" : "por cliente"}</div>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>
            {lotesMes.length} lote(s) aprobado(s) contados {modo === "lote" ? "por la fecha del lote" : "por el mes en que se dieron por cumplido (aprobación)"}. Ordenado por {medida === "d" ? "recaudado" : "unidades"}.
          </div>
          {lotesMes.length ? (
            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>{desglose === "b" ? "Base" : "Cliente"}</th><th style={th}>Unidades</th><th style={th}>Recaudado</th><th style={th}>% del mes</th><th style={th}>Lotes</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingMes.map((g) => (
                    <tr key={g.nombre}>
                      <td style={tdL}>{g.nombre}</td><td style={td}>{fmt(g.u)}</td><td style={td}>{money(g.d)}</td>
                      <td style={td}>{(medida === "d" ? dFoco : uFoco) > 0 ? `${((medida === "d" ? g.d / dFoco : g.u / uFoco) * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %` : "–"}</td><td style={td}>{g.lotes}</td>
                    </tr>
                  ))}
                  <tr style={{ background: C.canvas }}>
                    <td style={tdL}>Total del mes</td><td style={{ ...td, fontWeight: 800 }}>{fmt(uFoco)}</td><td style={{ ...td, fontWeight: 800 }}>{money(dFoco)}</td><td style={td}>100 %</td><td style={{ ...td, fontWeight: 800 }}>{lotesMes.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 16, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay lotes aprobados en {MESES[mes]} {anio} con este criterio de mes.</div>
          )}
          {lotesMes.length ? (
            <>
              <button type="button" onClick={() => setVerLotesMes(!verLotesMes)} style={{ ...sel, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>{verLotesMes ? "Ocultar los lotes del mes" : `Ver los ${lotesMes.length} lotes del mes`}</button>
              {verLotesMes ? (
                <div style={{ marginTop: 8, overflow: "auto", maxHeight: 360, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: "left" }}>Lote</th><th style={{ ...th, textAlign: "left" }}>Referencia</th><th style={{ ...th, textAlign: "left" }}>Cliente</th><th style={{ ...th, textAlign: "left" }}>Categoría BASE</th>
                        <th style={th}>Fecha lote</th><th style={th}>Aprobado</th><th style={th}>Cortadas</th><th style={th}>Despachadas</th><th style={th}>Base</th><th style={th}>Recaudado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotesMes.slice(0, 300).map((x, k) => (
                        <tr key={`${x.id}-${k}`}>
                          <td style={tdL}>{x.numLote || "–"}</td><td style={{ ...td, textAlign: "left" }}>{x.referencia || "–"}</td><td style={{ ...td, textAlign: "left" }}>{x.cliente}</td><td style={{ ...td, textAlign: "left" }}>{x.categoria}</td>
                          <td style={td}>{x.fecha || "–"}</td><td style={td}>{x.aprobado || "–"}</td><td style={td}>{fmt(x.cortadas)}</td><td style={td}>{fmt(x.despachadas)}</td><td style={td}>{x.base > 0 ? money(x.base) : "$0"}</td><td style={{ ...td, fontWeight: 700 }}>{money(x.recaudado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lotesMes.length > 300 ? <div style={{ fontSize: 11, color: C.slate, padding: 8 }}>Se muestran los primeros 300 de {lotesMes.length}; el resto va en el Excel.</div> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 4 }}>{medida === "d" ? "Recaudado" : "Unidades dadas por cumplido"} por mes y por año</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Todos los años con lotes aprobados, contados {modo === "lote" ? "por la fecha del lote" : "por el mes en que se dieron por cumplido (aprobación)"}. Cada fila es un año.</div>
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Año</th>
                {MESES.map((m, i) => <th key={m} style={{ ...th, background: enfocado && mes === i ? C.blueBg : th.background, color: enfocado && mes === i ? C.blue : th.color }}>{m}</th>)}
                <th style={th}>Total año</th>
                <th style={th}>Prom. mes</th>
                <th style={th}>vs año anterior</th>
              </tr>
            </thead>
            <tbody>
              {porAnio.map((a, k) => {
                const tot = totalDe(a[clave]);
                const ant = porAnio[k + 1];
                const totAnt = ant ? totalDe(ant[clave]) : 0;
                const mesesConDato = a[clave].filter((v) => v > 0).length || 1;
                const delta = totAnt > 0 ? tot / totAnt - 1 : null;
                return (
                  <tr key={a.anio} style={{ background: a.anio === anio ? C.canvas : C.white }}>
                    <td style={tdL}>{a.anio}</td>
                    {MESES.map((m, i) => <td key={m} style={{ ...td, background: enfocado && mes === i ? C.blueBg : undefined, fontWeight: enfocado && mes === i ? 800 : 400 }}>{a[clave][i] ? formato(a[clave][i]) : "–"}</td>)}
                    <td style={{ ...td, fontWeight: 800 }}>{formato(tot)}</td>
                    <td style={td}>{formato(tot / mesesConDato)}</td>
                    <td style={{ ...td, fontWeight: 700, color: delta === null ? C.slate : delta >= 0 ? C.green : C.red }}>{delta === null ? "–" : `${delta >= 0 ? "+" : ""}${Math.round(delta * 100)} %`}</td>
                  </tr>
                );
              })}
              {!porAnio.length ? <tr><td style={{ ...td, textAlign: "left", color: C.slate }} colSpan={16}>Todavía no hay lotes aprobados.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>El año en curso va incompleto: «Prom. mes» cuenta solo los meses con datos y «vs año anterior» compara contra el año anterior completo.</div>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 4 }}>Detalle por mes · {anio}</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>
          Cada cifra es unidades despachadas × valor de la base (ej. 5.000 × $2.300 = $11.500.000), solo la base; los porcentajes del Dado por Cumplido quedan aparte.
          {medida === "d" ? (isAdmin ? " Escribe el presupuesto de cada mes (se guarda al salir de la casilla); si lo dejas vacío se sugiere la estructura que guardó ¿Cubro mis costos?." : " El presupuesto lo escribe un administrador.") : ""}
        </div>
        {errorGuardar ? <div style={{ fontSize: 12, color: C.red, marginBottom: 6 }}>{errorGuardar}</div> : null}
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>{desglose === "b" ? "Base" : desglose === "c" ? "Cliente" : ""}</th>
                {MESES.map((m) => <th key={m} style={th}>{m}</th>)}
                <th style={th}>Año</th>
              </tr>
            </thead>
            <tbody>
              {seriesTabla.map((g) => (
                <tr key={g.nombre}>
                  <td style={tdL}>{g.nombre}</td>
                  {MESES.map((m, i) => <td key={m} style={td}>{g[clave][i] ? formato(g[clave][i]) : "–"}</td>)}
                  <td style={{ ...td, fontWeight: 800 }}>{formato(totalDe(g[clave]))}</td>
                </tr>
              ))}
              <tr style={{ background: C.canvas }}>
                <td style={tdL}>{medida === "d" ? "Recaudado total" : "Unidades total"}</td>
                {MESES.map((m, i) => <td key={m} style={{ ...td, fontWeight: 800 }}>{tablero.total[clave][i] ? formato(tablero.total[clave][i]) : "–"}</td>)}
                <td style={{ ...td, fontWeight: 800 }}>{formato(totalDe(tablero.total[clave]))}</td>
              </tr>
              {medida === "d" ? (
                <>
                  <tr>
                    <td style={tdL}>Presupuesto</td>
                    {MESES.map((m, i) => (
                      <td key={m} style={td}>
                        {isAdmin ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={borrador[i] !== undefined ? borrador[i] : (escrito[i] !== undefined && escrito[i] !== null ? String(escrito[i]) : "")}
                            placeholder={presEf[i].origen === "sugerido" ? `${fmt(presEf[i].valor)}` : "0"}
                            title={presEf[i].origen === "sugerido" ? "Sugerido: estructura guardada en ¿Cubro mis costos?" : "Presupuesto del mes"}
                            onChange={(e) => setBorrador({ ...borrador, [i]: e.target.value })}
                            onBlur={(e) => {
                              const t = e.target.value;
                              const { [i]: _omitido, ...resto } = borrador;
                              setBorrador(resto);
                              if (borrador[i] !== undefined) guardarMes(i, t);
                            }}
                            style={{ width: 92, textAlign: "right", fontSize: 12.5, padding: "3px 5px", borderRadius: 6, border: `1px dashed ${C.slate}`, background: C.white, color: presEf[i].origen === "sugerido" ? C.slate : C.ink, fontStyle: presEf[i].origen === "sugerido" ? "italic" : "normal" }}
                          />
                        ) : (
                          <span style={{ fontStyle: presEf[i].origen === "sugerido" ? "italic" : "normal", color: presEf[i].origen === "sugerido" ? C.slate : C.ink }}>{presEf[i].valor > 0 ? money(presEf[i].valor) : "–"}</span>
                        )}
                      </td>
                    ))}
                    <td style={{ ...td, fontWeight: 800 }}>{money(presValores.reduce((s, v) => s + v, 0))}</td>
                  </tr>
                  <tr>
                    <td style={tdL}>Cumplimiento</td>
                    {MESES.map((m, i) => {
                      const p = presValores[i] * factores[i];
                      const x = p > 0 ? tablero.total.d[i] / p : null;
                      return <td key={m} style={{ ...td, fontWeight: 800, color: colorCumple(x) }}>{x === null ? "–" : pct(x)}</td>;
                    })}
                    <td style={{ ...td, fontWeight: 800, color: colorCumple(alaFecha.cumplimiento) }}>{alaFecha.cumplimiento === null ? "–" : pct(alaFecha.cumplimiento)}</td>
                  </tr>
                </>
              ) : null}
            </tbody>
          </table>
        </div>
        {desglose === "c" && tablero.clientes.length > 15 ? (
          <button type="button" onClick={() => setVerTodos(!verTodos)} style={{ ...sel, marginTop: 8, cursor: "pointer", fontWeight: 700 }}>{verTodos ? "Ver solo los principales" : `Ver los ${tablero.clientes.length} clientes`}</button>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: C.slate }}>
        Unidades = despachada efectiva de cada lote aprobado (confirmada por Bodega + adicionales), la misma de Contabilidad y de ¿Cubro mis costos?. Si el mes es el actual, el presupuesto se compara proporcional a los días transcurridos (hora Colombia).
      </div>
    </div>
  );
}
