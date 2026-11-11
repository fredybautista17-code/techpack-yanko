import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { candidatosGastos, proveedoresDeTexto } from "./gastos-busint-calculo";
import {
  COL_GASTOS_TALENTO, COL_PRESUPUESTO_TALENTO, CONCEPTO_TALENTO_DEFECTO, MESES_CORTOS, TODOS,
  armarSerie, sugerirPresupuesto, proyeccionCierre, comparacionAnioEnCurso, gastoTalentoDeFactura, itemsDeGastos, claveItem, idPresupuesto, hoyBogotaISO,
} from "./talento-gastos-calculo";

// Gastos de Talento Humano y presupuesto del año siguiente (2026-11-11, a pedido de Fredy).
// Nómina → Personal → Gastos de Talento Humano. Los gastos se traen de las facturas de compra de Busint por concepto (getFacturasCompraBusint,
// la misma función de «Traer gastos» de Planta) y se guardan con la fecha de la factura; el presupuesto se arma mes por mes y se guarda por año e ítem.
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", soft: "#FBF9F6",
  red: "#D9483A", redBg: "#FDF0EE", amber: "#B26B0F", amberBg: "#FDF5E6", green: "#2D9E6B", greenBg: "#EBF7F2", violet: "#5B4FCF",
  presup: "#D9921E", presupBg: "#FBF0D9",
};
const COLORES_ANIO = ["#D9D5F5", "#B4ACEC", "#8C80E0", "#5B4FCF"];
const campo = { height: 34, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white, color: C.ink, boxSizing: "border-box", fontFamily: "inherit" };
const boton = (tipo) => ({ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: tipo ? "none" : `1px solid ${C.border}`, background: tipo === "pri" ? C.ink : tipo === "amb" ? C.presup : C.white, color: tipo ? C.white : C.ink });
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "right", whiteSpace: "nowrap" };
const td = { padding: "7px 10px", fontSize: 13, fontWeight: 700, color: C.ink, textAlign: "right", borderTop: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const f0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const f1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pesos = (n) => `$ ${f0.format(Math.round(n || 0))}`;
const millones = (n) => `$ ${f1.format((n || 0) / 1e6)} M`;
const pct = (n) => `${n > 0 ? "+" : ""}${f1.format(n)} %`;
const fmtFecha = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "");
const uid = () => Math.random().toString(36).slice(2, 10);

function useColeccion(db, nombre) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return undefined;
    return onSnapshot(
      collection(db, nombre),
      (s) => { setError(""); setLista(s.docs.map((x) => ({ ...x.data(), id: x.id }))); },
      (e) => { setError(e?.message || "No se pudo leer la información."); setLista([]); }
    );
  }, [db, nombre]);
  return { lista, error };
}

// ─── Ventana «Traer de Busint» ───
function TraerDeBusintModal({ db, functionsClient, gastos, currentUser, onClose, anioActual, hoy }) {
  const [texto, setTexto] = useState(CONCEPTO_TALENTO_DEFECTO);
  const [desde, setDesde] = useState(`${anioActual - 3}-01-01`);
  const [hasta, setHasta] = useState(hoy);
  const [consulta, setConsulta] = useState({ n: 1, conceptos: [CONCEPTO_TALENTO_DEFECTO], desde: `${anioActual - 3}-01-01`, hasta: hoy });
  const [datos, setDatos] = useState(null);
  const [errorBusint, setErrorBusint] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState({});
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vigente = true;
    setDatos(null);
    setErrorBusint("");
    httpsCallable(functionsClient, "getFacturasCompraBusint", { timeout: 300000 })({ patrones: consulta.conceptos, desde: consulta.desde, hasta: consulta.hasta, origen: "talento_humano" })
      .then((r) => { if (vigente) setDatos(r.data); })
      .catch((err) => { if (vigente) setErrorBusint(err?.message || String(err)); });
    return () => { vigente = false; };
  }, [consulta, functionsClient]);

  const filas = useMemo(() => candidatosGastos({ facturas: datos?.facturas || [], gastosExistentes: gastos, busqueda }), [datos, gastos, busqueda]);
  const elegibles = filas.filter((f) => !f.yaCargada);
  const autoMarcables = elegibles.filter((f) => !f.posibleDuplicado);
  const seleccionadas = elegibles.filter((f) => sel[f.clave]);
  const totalSel = seleccionadas.reduce((a, f) => a + f.monto, 0);
  const todasMarcadas = autoMarcables.length > 0 && autoMarcables.every((f) => sel[f.clave]);
  const sinResultado = datos?.diagnostico?.sinResultado || [];

  function buscar() {
    setSel({});
    setResultado(null);
    setConsulta((c) => ({ n: c.n + 1, conceptos: proveedoresDeTexto(texto), desde, hasta }));
  }
  function marcarTodas(on) {
    setSel((s) => { const n = { ...s }; autoMarcables.forEach((f) => { n[f.clave] = on; }); return n; });
  }
  async function cargar() {
    if (!seleccionadas.length) return;
    setCargando(true);
    setResultado(null);
    try {
      const ahora = new Date().toISOString();
      const usuario = currentUser?.name || currentUser?.username || "";
      const nuevos = seleccionadas.map((f) => gastoTalentoDeFactura(f, { id: `${uid()}${uid()}`, usuario, ahora }));
      for (let i = 0; i < nuevos.length; i += 20) {
        await Promise.all(nuevos.slice(i, i + 20).map((g) => setDoc(doc(db, COL_GASTOS_TALENTO, g.id), g)));
      }
      setSel({});
      setResultado({ ok: nuevos.length, total: nuevos.reduce((a, g) => a + g.monto, 0) });
    } catch (err) {
      setResultado({ error: err?.message || String(err) });
    } finally {
      setCargando(false);
    }
  }
  function copiarDiagnostico() {
    try {
      navigator.clipboard.writeText(JSON.stringify(datos?.diagnostico || {}, null, 2));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) { /* sin portapapeles */ }
  }
  const fuentes = datos?.fuentes || [];
  return (
    <div role="dialog" aria-modal="true" aria-label="Traer gastos de Talento Humano desde Busint" style={{ position: "fixed", inset: 0, background: "rgba(20,18,35,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px 12px", overflow: "auto", zIndex: 1000 }}>
      <div style={{ background: C.white, borderRadius: 18, width: "min(960px,100%)", padding: "22px 24px", boxShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.ink }}>📥 Traer gastos de Talento Humano desde Busint</div>
            <div style={{ fontSize: 12.5, color: C.slate, maxWidth: 700, marginTop: 2 }}>
              Busca el concepto en las facturas de compra de Busint, pagadas o no (el gasto cuenta al facturar). Cada gasto queda con la <strong>fecha de la factura</strong> y su valor total. Las ya cargadas salen marcadas y no se repiten; nada se guarda hasta que pulses el botón.
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ ...boton(), height: 36, width: 40, padding: 0 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "14px 0" }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, marginBottom: 3 }}>CONCEPTOS A BUSCAR (SEPARADOS POR COMA)</div>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} style={{ ...campo, width: "100%" }} aria-label="Conceptos a buscar" />
          </div>
          <div><div style={{ fontSize: 11, fontWeight: 800, color: C.slate, marginBottom: 3 }}>DESDE</div><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={campo} aria-label="Desde" /></div>
          <div><div style={{ fontSize: 11, fontWeight: 800, color: C.slate, marginBottom: 3 }}>HASTA</div><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={campo} aria-label="Hasta" /></div>
          <button onClick={buscar} disabled={!datos && !errorBusint} style={{ ...boton("pri"), opacity: !datos && !errorBusint ? 0.6 : 1 }}>🔄 Buscar en Busint</button>
        </div>
        {!datos && !errorBusint && <div style={{ padding: 16, fontSize: 13, color: C.slate }}>Consultando Busint… puede tardar un minuto.</div>}
        {errorBusint && <div style={{ padding: 14, borderRadius: 10, background: C.redBg, color: C.red, fontSize: 13, marginBottom: 12 }}>⚠ No se pudo consultar Busint: {errorBusint}</div>}
        {datos && fuentes.length > 0 && (
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>
            {fuentes.map((f) => `${f.etiqueta}: ${f.facturas} factura(s) en total${f.tipo === "concepto" ? ` (${f.detalle})` : ""}`).join(" · ")}
          </div>
        )}
        {sinResultado.length > 0 && (
          <div style={{ padding: 12, borderRadius: 10, background: C.amberBg, color: C.amber, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
            No encontré facturas para: {sinResultado.map((r) => `«${r.texto}»`).join(", ")}.
            {sinResultado.map((r) => (
              <div key={r.texto} style={{ marginTop: 6, color: C.ink }}>
                <strong>{r.texto}</strong>
                {r.proveedoresParecidos?.length > 0 && <span> · proveedores parecidos: {r.proveedoresParecidos.map((p) => p.nombre).join(", ")}</span>}
                {r.enOtrasTablas?.length > 0 && <span> · aparece en: {r.enOtrasTablas.map((t) => `${t.tabla} / ${t.columna} (${t.filas})`).join("; ")}</span>}
                {!r.proveedoresParecidos?.length && !r.enOtrasTablas?.length && <span> · no aparece en ninguna de las tablas de compras que reviso.</span>}
              </div>
            ))}
            <div style={{ marginTop: 8 }}><button onClick={copiarDiagnostico} style={boton()}>{copiado ? "✓ Copiado" : "📋 Copiar diagnóstico para Claude"}</button></div>
          </div>
        )}
        {datos && (datos.sinFecha > 0 || datos.sinValor > 0) && (
          <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 10 }}>
            Fuera de la lista: {datos.sinFecha > 0 ? `${datos.sinFecha} factura(s) sin fecha de emisión` : ""}{datos.sinFecha > 0 && datos.sinValor > 0 ? " · " : ""}{datos.sinValor > 0 ? `${datos.sinValor} con valor cero o negativo (notas)` : ""}.
          </div>
        )}
        {datos && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Proveedor, concepto o N° de factura…" style={{ ...campo, minWidth: 240 }} aria-label="Filtrar facturas" />
              <span style={{ fontSize: 12, color: C.slate }}>{filas.length} factura(s)</span>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", maxHeight: "46vh" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr style={{ background: C.canvas }}>
                    <th style={{ ...th, textAlign: "center", width: 34 }}><input type="checkbox" checked={todasMarcadas} onChange={(e) => marcarTodas(e.target.checked)} aria-label="Marcar todas las que faltan por cargar" /></th>
                    <th style={{ ...th, textAlign: "left" }}>Fecha factura</th><th style={{ ...th, textAlign: "left" }}>Concepto</th><th style={{ ...th, textAlign: "left" }}>Proveedor</th>
                    <th style={{ ...th, textAlign: "left" }}>N° factura</th><th style={th}>Valor</th><th style={{ ...th, textAlign: "left" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clave} style={{ opacity: f.yaCargada ? 0.6 : 1 }}>
                      <td style={{ ...td, textAlign: "center" }}><input type="checkbox" disabled={f.yaCargada} checked={!!sel[f.clave] && !f.yaCargada} onChange={(e) => setSel((s) => ({ ...s, [f.clave]: e.target.checked }))} aria-label={`Cargar la factura ${f.numeroFactura}`} /></td>
                      <td style={{ ...td, textAlign: "left" }}>{fmtFecha(f.fecha)}</td>
                      <td style={{ ...td, textAlign: "left", color: C.slate }}>{f.concepto || "—"}</td>
                      <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>{f.proveedor}</td>
                      <td style={{ ...td, textAlign: "left" }}>{f.numeroFactura}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{pesos(f.monto)}</td>
                      <td style={{ ...td, textAlign: "left", fontSize: 11.5 }}>
                        {f.yaCargada ? <span style={{ color: C.green }}>✓ ya cargada</span> : f.posibleDuplicado ? <span style={{ color: C.amber }} title="Ya hay un gasto con este proveedor y este número de factura">⚠ ya hay un gasto igual</span> : ""}
                      </td>
                    </tr>
                  ))}
                  {!filas.length && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.slate }}>No hay facturas de estos conceptos en el período.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
        {resultado && (
          <div style={{ fontSize: 12.5, marginTop: 12, padding: "9px 12px", borderRadius: 8, fontWeight: 600, background: resultado.error ? C.redBg : C.greenBg, color: resultado.error ? C.red : C.green }}>
            {resultado.error ? `⚠ No se pudo cargar: ${resultado.error}` : `✓ ${resultado.ok} gasto(s) cargado(s) por ${pesos(resultado.total)}.`}
          </div>
        )}
        <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: C.slate }}>{seleccionadas.length} seleccionada(s) · <strong style={{ color: C.ink }}>{pesos(totalSel)}</strong></span>
          <button onClick={onClose} style={boton()}>Cerrar</button>
          <button onClick={cargar} disabled={cargando || !seleccionadas.length} style={{ ...boton("pri"), opacity: cargando || !seleccionadas.length ? 0.5 : 1 }}>{cargando ? "Guardando…" : `Guardar ${seleccionadas.length || ""} gasto(s) en Talento Humano`}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Gráficas ───
function GraficaMeses({ serie, presupuesto }) {
  const W = 560, H = 250, pl = 46, pr = 12, pt = 14, pb = 26;
  const { anios, real } = serie;
  const colorDe = (a) => COLORES_ANIO[Math.max(0, COLORES_ANIO.length - (anios.length - anios.indexOf(a)))] || COLORES_ANIO[0];
  const todos = [...anios.flatMap((a) => real[a]), ...presupuesto].map((v) => v || 0);
  const mx = Math.max(1e6, Math.ceil(Math.max(...todos) / 1e6 / 2) * 2e6);
  const X = (i) => pl + (i * (W - pl - pr)) / 11;
  const Y = (v) => pt + (1 - v / mx) * (H - pt - pb);
  const trazo = (vals) => vals.map((v, i) => (v === null || v === undefined ? null : [X(i), Y(v)])).filter(Boolean);
  const ruta = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "8px 0 2px", fontSize: 12, fontWeight: 700, color: C.slate }}>
        {anios.map((a) => <span key={a}><i style={{ display: "inline-block", width: 18, height: 4, borderRadius: 3, background: colorDe(a), marginRight: 6, verticalAlign: "middle" }} />{a}</span>)}
        <span><i style={{ display: "inline-block", width: 18, height: 4, borderRadius: 3, background: C.presup, marginRight: 6, verticalAlign: "middle" }} />{serie.anioPres} presupuesto</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gasto por mes, un trazo por año" style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 1, 2, 3, 4].map((g) => (
          <g key={g}>
            <line x1={pl} x2={W - pr} y1={Y((mx * g) / 4)} y2={Y((mx * g) / 4)} stroke={C.border} strokeWidth="1" />
            <text x={pl - 6} y={Y((mx * g) / 4) + 3} textAnchor="end" fontSize="10.5" fontWeight="700" fill={C.slate}>{f0.format((mx * g) / 4 / 1e6)} M</text>
          </g>
        ))}
        {MESES_CORTOS.map((m, i) => <text key={m} x={X(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={C.slate}>{m}</text>)}
        {anios.map((a) => {
          const pts = trazo(real[a]);
          const actual = a === serie.anioActual;
          return (
            <g key={a}>
              <path d={ruta(pts)} fill="none" stroke={colorDe(a)} strokeWidth={actual ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" />
              {actual && pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4.5" fill={colorDe(a)} stroke={C.white} strokeWidth="2" />}
            </g>
          );
        })}
        <path d={ruta(trazo(presupuesto))} fill="none" stroke={C.presup} strokeWidth="2.4" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function GraficaAnios({ serie, totalPres }) {
  const W = 360, H = 250, pl = 10, pr = 10, pt = 26, pb = 28;
  const { anios, totales } = serie;
  const colorDe = (a) => COLORES_ANIO[Math.max(0, COLORES_ANIO.length - (anios.length - anios.indexOf(a)))] || COLORES_ANIO[0];
  const barras = [...anios.map((a) => ({ id: String(a), etiqueta: a === serie.anioActual ? `${a}*` : String(a), valor: totales[a], color: colorDe(a) })), { id: "pres", etiqueta: `${serie.anioPres} pres.`, valor: totalPres, color: C.presup, pres: true }];
  const mx = Math.max(1, ...barras.map((b) => b.valor)) * 1.12;
  const bw = (W - pl - pr) / barras.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Total por año" style={{ width: "100%", height: "auto", display: "block", marginTop: 6 }}>
      {barras.map((b, i) => {
        const h = (b.valor / mx) * (H - pt - pb);
        const x = pl + i * bw + bw * 0.16;
        const w = bw * 0.68;
        const y = H - pb - h;
        return (
          <g key={b.id}>
            <rect x={x} y={y} width={w} height={Math.max(0, h)} rx="8" fill={b.color} fillOpacity={b.pres ? 0.85 : 1} stroke={b.pres ? C.presup : "none"} strokeDasharray={b.pres ? "4 3" : undefined} strokeWidth={b.pres ? 2 : 0} />
            <text x={x + w / 2} y={y - 7} textAnchor="middle" fontSize="11.5" fontWeight="900" fill={C.ink}>{f1.format(b.valor / 1e6)} M</text>
            <text x={x + w / 2} y={H - 9} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={C.slate}>{b.etiqueta}</text>
          </g>
        );
      })}
      <line x1={pl} x2={W - pr} y1={H - pb} y2={H - pb} stroke={C.border} />
    </svg>
  );
}

// ─── Pantalla ───
export default function GastosTalentoHumanoView({ db, functionsClient, currentUser, isAdmin }) {
  const hoy = hoyBogotaISO();
  const { lista: gastosRaw, error: errGastos } = useColeccion(db, COL_GASTOS_TALENTO);
  const { lista: presRaw, error: errPres } = useColeccion(db, COL_PRESUPUESTO_TALENTO);
  const gastos = useMemo(() => gastosRaw || [], [gastosRaw]);
  const [item, setItem] = useState(TODOS);
  const [base, setBase] = useState("actual");
  const [ajuste, setAjuste] = useState(5);
  const [edit, setEdit] = useState(null); // 12 valores que el usuario cambió o calculó, aún sin guardar
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [verFacturas, setVerFacturas] = useState(false);
  const [quitar, setQuitar] = useState("");

  const items = useMemo(() => itemsDeGastos(gastos), [gastos]);
  const itemEf = item === TODOS || items.includes(item) ? item : TODOS;
  const serie = useMemo(() => armarSerie({ gastos, item: itemEf, hoy }), [gastos, itemEf, hoy]);
  const claveIt = itemEf === TODOS ? TODOS : claveItem(itemEf);
  const idPres = idPresupuesto(serie.anioPres, claveIt);
  const guardado = useMemo(() => (presRaw || []).find((p) => p.id === idPres) || null, [presRaw, idPres]);
  const sugerido = useMemo(() => (serie.anios.length ? sugerirPresupuesto({ serie, base, ajuste }) : Array(12).fill(0)), [serie, base, ajuste]);
  const presupuesto = edit || guardado?.meses || sugerido;
  const origenPres = edit ? "sin guardar" : guardado ? "guardado" : "sugerido";
  useEffect(() => { setEdit(null); }, [idPres]);

  const totalPres = presupuesto.reduce((s, v) => s + (Number(v) || 0), 0);
  const comp = useMemo(() => comparacionAnioEnCurso(serie), [serie]);
  const proy = useMemo(() => proyeccionCierre(serie), [serie]);
  const anioAnt = serie.anioActual - 1;
  const mesPico = useMemo(() => {
    const act = serie.real[serie.anioActual];
    if (!act) return null;
    const m = act.map((v, i) => [v || 0, i]).sort((a, b) => b[0] - a[0])[0];
    return m && m[0] > 0 ? m : null;
  }, [serie]);
  const mayor = Math.max(1, ...serie.anios.flatMap((a) => serie.real[a].map((v) => v || 0)));
  const facturasItem = useMemo(() => gastos.filter((g) => itemEf === TODOS || g.item === itemEf).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), [gastos, itemEf]);

  function calcular() { setEdit(sugerido); setAviso(""); }
  function cambiarMes(i, texto) {
    const n = parseInt(String(texto).replace(/\D/g, ""), 10) || 0;
    setEdit((e) => { const b = [...(e || presupuesto)]; b[i] = n; return b; });
    setAviso("");
  }
  async function guardarPresupuesto() {
    setGuardando(true);
    setAviso("");
    try {
      await setDoc(doc(db, COL_PRESUPUESTO_TALENTO, idPres), {
        id: idPres, anio: serie.anioPres, itemClave: claveIt, item: itemEf === TODOS ? "Todos los ítems" : itemEf,
        meses: presupuesto.map((v) => Number(v) || 0), total: totalPres, base, ajuste: Number(ajuste) || 0,
        actualizadoPor: currentUser?.name || currentUser?.username || "", actualizadoEn: new Date().toISOString(),
      });
      setEdit(null);
      setAviso(`✓ Presupuesto ${serie.anioPres} guardado: ${pesos(totalPres)}.`);
    } catch (err) {
      setAviso(`⚠ No se pudo guardar: ${err?.message || String(err)}`);
    } finally {
      setGuardando(false);
    }
  }
  async function quitarFactura(id) {
    try { await deleteDoc(doc(db, COL_GASTOS_TALENTO, id)); } catch (err) { setAviso(`⚠ No se pudo quitar: ${err?.message || String(err)}`); }
    setQuitar("");
  }
  function descargar() {
    const filas = [["Mes", ...serie.anios, `Presupuesto ${serie.anioPres}`]];
    MESES_CORTOS.forEach((m, i) => filas.push([m, ...serie.anios.map((a) => (serie.real[a][i] === null ? "" : serie.real[a][i])), presupuesto[i] || 0]));
    filas.push(["Total", ...serie.anios.map((a) => serie.totales[a]), totalPres]);
    const csv = `﻿${filas.map((f) => f.join(";")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos-talento-humano-${claveIt}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const kpi = (titulo, valor, sub, extra) => (
    <div style={{ background: extra ? `linear-gradient(180deg, ${C.presupBg}, ${C.white} 70%)` : C.white, border: `1px solid ${extra ? C.presup : C.border}`, borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: C.slate }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: C.ink, margin: "4px 0 2px" }}>{valor}</div>
      <div style={{ fontSize: 12.5, color: C.slate }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900, color: C.ink }}>💜 Gastos de Talento Humano</div>
          <div style={{ fontSize: 13, color: C.slate, maxWidth: 620 }}>Cuánto gasta el área cada año, traído de Busint, para armar el presupuesto de {serie.anioPres}.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setModal(true)} style={boton()}>📥 Traer de Busint</button>
          <button onClick={descargar} disabled={!serie.anios.length} style={{ ...boton(), opacity: serie.anios.length ? 1 : 0.5 }}>📤 Descargar Excel</button>
        </div>
      </div>
      {(errGastos || errPres) && <div style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>⚠ {errGastos || errPres}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {[TODOS, ...items].map((x) => (
          <button key={x} onClick={() => setItem(x)} aria-pressed={itemEf === x} style={{ border: `1px solid ${itemEf === x ? C.ink : C.border}`, background: itemEf === x ? C.ink : C.white, color: itemEf === x ? C.white : C.ink, borderRadius: 999, padding: "5px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{x === TODOS ? "Todos los ítems" : x}</button>
        ))}
        <button onClick={() => setModal(true)} style={{ border: `1px dashed ${C.border}`, background: C.white, color: C.slate, borderRadius: 999, padding: "5px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>+ Agregar concepto</button>
      </div>

      {gastosRaw === null ? (
        <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>Cargando…</div>
      ) : !serie.anios.length ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginBottom: 6 }}>Todavía no hay gastos cargados</div>
          <div style={{ fontSize: 13.5, color: C.slate, maxWidth: 520, margin: "0 auto 14px" }}>Pulsa «Traer de Busint», deja el concepto {CONCEPTO_TALENTO_DEFECTO} y busca: salen las facturas de los últimos años para que escojas cuáles guardar.</div>
          <button onClick={() => setModal(true)} style={boton("pri")}>📥 Traer de Busint</button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 14 }}>
            {kpi(`Gastado en ${serie.anioActual}`, millones(serie.totales[serie.anioActual]),
              comp ? <>{`de enero a ${MESES_CORTOS[serie.mesActual - 1].toLowerCase()} · `}<b style={{ color: comp.pct > 0 ? C.red : C.green }}>{comp.pct === null ? "" : pct(comp.pct)}</b>{` contra el mismo tramo de ${anioAnt} (meses completos)`}</> : "lo que va del año")}
            {serie.real[anioAnt] ? kpi(`${anioAnt} completo`, millones(serie.totales[anioAnt]), serie.real[anioAnt - 1] && serie.totales[anioAnt - 1] > 0 ? `${pct((serie.totales[anioAnt] / serie.totales[anioAnt - 1] - 1) * 100)} contra ${anioAnt - 1}` : "año anterior") : kpi("Año anterior", "—", "sin gastos cargados")}
            {kpi(`Mes más pesado de ${serie.anioActual}`, mesPico ? MESES_CORTOS[mesPico[1]] : "—", mesPico ? millones(mesPico[0]) : "sin gastos")}
            {kpi(`Presupuesto ${serie.anioPres}`, millones(totalPres), proy > 0 ? <>{`contra ~${millones(proy)} que cerraría ${serie.anioActual} · `}<b style={{ color: totalPres > proy ? C.red : C.green }}>{pct((totalPres / proy - 1) * 100)}</b></> : origenPres, true)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 14, marginBottom: 14 }}>
            <section aria-label="Mes a mes" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 20px" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.ink }}>Mes a mes, año contra año</div>
              <div style={{ fontSize: 12, color: C.slate }}>{itemEf === TODOS ? "Todos los ítems" : itemEf} · los meses que faltan del año en curso no se dibujan</div>
              <GraficaMeses serie={serie} presupuesto={presupuesto} />
            </section>
            <section aria-label="Total por año" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 20px" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.ink }}>¿Cuánto fue cada año?</div>
              <div style={{ fontSize: 12, color: C.slate }}>Total del año ({serie.anioActual}* = a la fecha)</div>
              <GraficaAnios serie={serie} totalPres={totalPres} />
            </section>
          </div>

          <section aria-label="Presupuesto" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.ink }}>Presupuesto {serie.anioPres} · {itemEf === TODOS ? "todos los ítems" : itemEf}</div>
              <span style={{ fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "2px 11px", background: origenPres === "guardado" ? C.greenBg : C.presupBg, color: origenPres === "guardado" ? C.green : C.amber }}>{origenPres === "guardado" ? "✓ guardado" : origenPres === "sin guardar" ? "cambios sin guardar" : "sugerido, sin guardar"}</span>
            </div>
            <div style={{ fontSize: 12, color: C.slate }}>Parte de lo gastado y lo puedes ajustar mes por mes. Se guarda por año e ítem.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", background: C.soft, border: `1px dashed ${C.border}`, borderRadius: 12, padding: "12px 14px", margin: "10px 0 12px" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, marginBottom: 3 }}>PARTIR DE</div>
                <select value={base} onChange={(e) => setBase(e.target.value)} style={campo} aria-label="Partir de">
                  <option value="actual">Lo gastado en {serie.anioActual}</option>
                  <option value="anterior">Lo gastado en {anioAnt}</option>
                  <option value="promedio">Promedio de los últimos 3 años</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, marginBottom: 3 }}>AJUSTE %</div>
                <input type="number" step="0.5" value={ajuste} onChange={(e) => setAjuste(e.target.value)} style={{ ...campo, width: 80 }} aria-label="Ajuste en porcentaje" />
              </div>
              <button onClick={calcular} style={boton("amb")}>Calcular sugerido</button>
              <span style={{ fontSize: 12, color: C.slate }}>Sugerido: {millones(sugerido.reduce((s, v) => s + v, 0))}{serie.real[anioAnt] && serie.totales[anioAnt] > 0 ? ` (${pct((sugerido.reduce((s, v) => s + v, 0) / serie.totales[anioAnt] - 1) * 100)} sobre ${anioAnt} completo)` : ""}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Mes</th>
                    {serie.anios.map((a) => <th key={a} style={th}>{a}</th>)}
                    <th style={th}>Cambio {serie.anioActual}</th>
                    <th style={{ ...th, background: C.presupBg }}>Presupuesto {serie.anioPres}</th>
                  </tr>
                </thead>
                <tbody>
                  {MESES_CORTOS.map((m, i) => {
                    const act = serie.real[serie.anioActual][i];
                    const ant = serie.real[anioAnt] ? serie.real[anioAnt][i] : null;
                    const cambio = act !== null && act !== undefined && ant > 0 && i + 1 < serie.mesActual ? (act / ant - 1) * 100 : null;
                    return (
                      <tr key={m}>
                        <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{m}</td>
                        {serie.anios.map((a) => {
                          const v = serie.real[a][i];
                          return <td key={a} style={{ ...td, color: a < serie.anioActual ? C.slate : C.ink, fontWeight: a < serie.anioActual ? 600 : 800 }}>{v === null ? <span style={{ color: C.border }}>—</span> : <span style={{ display: "inline-block", minWidth: 92, borderRadius: 7, padding: "2px 8px", background: `rgba(91,79,207,${((v || 0) / mayor) * 0.26})` }}>{pesos(v)}</span>}{a === serie.anioActual && i + 1 === serie.mesActual ? <span title="Mes en curso: todavía incompleto" style={{ color: C.amber }}> •</span> : ""}</td>;
                        })}
                        <td style={{ ...td, color: cambio === null ? C.border : cambio > 0 ? C.red : C.green }}>{cambio === null ? "—" : pct(cambio)}</td>
                        <td style={{ ...td, background: C.presupBg }}>
                          <input value={f0.format(presupuesto[i] || 0)} onChange={(e) => cambiarMes(i, e.target.value)} aria-label={`Presupuesto de ${m} ${serie.anioPres}`} inputMode="numeric" style={{ width: 112, height: 30, textAlign: "right", border: `1px solid ${C.presup}`, background: C.white, color: C.ink, borderRadius: 7, padding: "0 8px", fontWeight: 800, fontFamily: "inherit" }} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ ...td, textAlign: "left", fontWeight: 900, borderTop: `2px solid ${C.ink}`, background: C.soft }}>Total</td>
                    {serie.anios.map((a) => <td key={a} style={{ ...td, fontWeight: 900, borderTop: `2px solid ${C.ink}`, background: C.soft }}>{pesos(serie.totales[a])}{a === serie.anioActual ? "*" : ""}</td>)}
                    <td style={{ ...td, borderTop: `2px solid ${C.ink}`, background: C.soft }} />
                    <td style={{ ...td, fontWeight: 900, borderTop: `2px solid ${C.ink}`, background: C.presupBg }}>{pesos(totalPres)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <span style={{ fontSize: 12, color: C.slate }}>* {serie.anioActual} es a la fecha (el punto marca el mes en curso, todavía incompleto). Los meses que faltan se sugieren con lo gastado en {anioAnt}.</span>
              <button onClick={guardarPresupuesto} disabled={guardando} style={{ ...boton("pri"), opacity: guardando ? 0.6 : 1 }}>{guardando ? "Guardando…" : `Guardar presupuesto ${serie.anioPres}`}</button>
            </div>
            {aviso && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, borderRadius: 8, padding: "8px 12px", background: aviso.startsWith("✓") ? C.greenBg : C.redBg, color: aviso.startsWith("✓") ? C.green : C.red }}>{aviso}</div>}
          </section>

          <section aria-label="Facturas cargadas" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 20px" }}>
            <button onClick={() => setVerFacturas((v) => !v)} aria-expanded={verFacturas} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800, color: C.ink }}>{verFacturas ? "▾" : "▸"} Facturas cargadas ({facturasItem.length})</button>
            {verFacturas && (
              <div style={{ overflow: "auto", maxHeight: "42vh", marginTop: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>Fecha</th><th style={{ ...th, textAlign: "left" }}>Ítem</th><th style={{ ...th, textAlign: "left" }}>Proveedor</th><th style={{ ...th, textAlign: "left" }}>N° factura</th><th style={th}>Valor</th><th style={th} /></tr></thead>
                  <tbody>
                    {facturasItem.map((g) => (
                      <tr key={g.id}>
                        <td style={{ ...td, textAlign: "left" }}>{fmtFecha(g.fecha)}</td><td style={{ ...td, textAlign: "left" }}>{g.item}</td>
                        <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>{g.proveedor}</td><td style={{ ...td, textAlign: "left" }}>{g.numeroFactura}</td><td style={td}>{pesos(g.monto)}</td>
                        <td style={td}>
                          {isAdmin && (quitar === g.id
                            ? <button onClick={() => quitarFactura(g.id)} style={{ ...boton(), height: 28, color: C.red }}>¿Quitar de verdad?</button>
                            : <button onClick={() => setQuitar(g.id)} style={{ ...boton(), height: 28 }} aria-label={`Quitar la factura ${g.numeroFactura}`}>Quitar</button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {modal && <TraerDeBusintModal db={db} functionsClient={functionsClient} gastos={gastos} currentUser={currentUser} onClose={() => setModal(false)} anioActual={serie.anioActual} hoy={hoy} />}
    </div>
  );
}
