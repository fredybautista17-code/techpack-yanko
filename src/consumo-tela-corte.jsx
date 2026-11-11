import { useState, useEffect, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot } from "firebase/firestore";
import CalendarioAhorroTela from "./consumo-tela-calendario";
import { TOLERANCIA_CONSUMO, cortesAtlasConTrazo, armarFilasConsumoTela, aplicarDetalleTelasConsumo, aplicarCotizadoConsumo, cotizadoPorReferencia, aplicarCostoTelaConsumo, resumenConsumoTela, clasificarConsumoSimple } from "./consumo-tela-calculo";

// Consumo de tela de CORTE — teórico contra real (2026-10-31, a pedido de Fredy).
// Se muestra dentro de "Centro de Costo — Planeación · CORTE". Une los cortes de ATLAS
// (metros tendidos = trazos) con Busint: el Visor de Rendimiento de Corte o, cuando viene vacío,
// la ficha de telas y el detalle de telas de cada lote.
// (2026-11-11, a pedido de Fredy) Vista «Calendario»: el ahorro de tela día por día (consumo-tela-calendario.jsx); en ella el periodo se amplía a los meses completos.
// (2026-11-11) Pantalla en tarjetas: una por lote, con «Debía» contra «Usó», una etiqueta en palabras y el detalle al tocarla.
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#D9483A", redBg: "#FDF0EE", amber: "#B26B0F", amberBg: "#FDF5E6",
  debia: "#CFC8F0", uso: "#5B4FCF", cotizo: "#E3A33B",
};
const COLUMNAS_CLAVE = ["fecha", "referencia", "cantidad", "consMlTeor", "mlReal"];
const fmtM = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtPesos = (n) => (n < 0 ? "−$ " : "$ ") + Math.abs(Math.round(n)).toLocaleString("es-CO");
const fmtFecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const fmtPct = (n) => `${n > 0 ? "+" : ""}${Number(n).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

const FILTROS = [
  { id: "todos", texto: "Todos" },
  { id: "mas", texto: "Gastó de más" },
  { id: "menos", texto: "Ahorró" },
  { id: "normal", texto: "Normal" },
  { id: "aviso", texto: "Con aviso" },
  { id: "falta", texto: "Falta dato" },
];

function etiquetaDe(f) {
  if (f.tipo === "mas") return { texto: "Gastó de más", color: C.red, bg: C.redBg };
  if (f.tipo === "menos") return { texto: "Ahorró tela", color: C.green, bg: C.greenBg };
  if (f.tipo === "normal") return { texto: "Normal", color: C.slate, bg: C.canvas };
  return { texto: f.estado === "sin_teorico" ? "Sin ficha de telas" : "Esperando Busint", color: C.slate, bg: C.canvas };
}

function fraseDe(f) {
  const dif = f.realM - f.baseM;
  const contra = f.baseCot ? "lo cotizado" : "la ficha";
  if (f.tipo === "mas" || f.tipo === "menos") return `${f.tipo === "menos" ? "Usó" : "Gastó"} ${fmtM(Math.abs(dif))} m ${f.tipo === "menos" ? "menos" : "más"} que ${contra} (${fmtM(Math.abs(f.difPct))} %).`;
  if (f.tipo === "normal") return `Usó casi lo mismo que ${contra} (${dif > 0 ? "+" : ""}${fmtM(dif)} m).`;
  if (f.estado === "sin_teorico") return `Busint registró ${fmtM(f.realM)} m, pero no hay ficha de telas para compararlo.`;
  return f.trazoM > 0 ? `Se tendieron ${fmtM(f.trazoM)} m; falta el consumo real de Busint.` : "Falta el consumo real de Busint.";
}

function Barra({ nombre, valor, max, color }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 74px", gap: 8, alignItems: "center", fontSize: 12.5, color: C.slate, margin: "3px 0" }}>
      <span>{nombre}</span>
      <div style={{ height: 12, background: "#F1EDE8", borderRadius: 6, overflow: "hidden" }}>
        {valor > 0 && max > 0 && <div style={{ height: "100%", width: `${(valor / max) * 100}%`, background: color, borderRadius: 6 }} />}
      </div>
      <span style={{ textAlign: "right", fontWeight: 800, color: C.ink }}>{valor > 0 ? `${fmtM(valor)} m` : "—"}</span>
    </div>
  );
}

function TarjetaLote({ f, abierta, onToggle, limite }) {
  const e = etiquetaDe(f);
  const max = Math.max(f.teorM || 0, f.realM || 0, f.cotizM || 0) * 1.04;
  const conPlata = f.pagadoDeMas !== null && f.pagadoDeMas !== undefined;
  const tarjeta = f.tipo === "falta" ? null : f;
  // «Tendido» = los metros de los trazos que se registraron en ATLAS.
  const pregTrazo = !(f.trazoM > 0)
    ? "Este lote no tiene trazos registrados en ATLAS."
    : !(f.realM > 0)
      ? `En ATLAS se registraron ${fmtM(f.trazoM)} m tendidos; falta el real de Busint para compararlo.`
      : Math.abs((f.trazoM - f.realM) / f.realM * 100) <= limite
        ? `Sí. En ATLAS se registraron ${fmtM(f.trazoM)} m tendidos y Busint registró ${fmtM(f.realM)} m.`
        : `No del todo. En ATLAS se registraron ${fmtM(f.trazoM)} m tendidos y Busint ${fmtM(f.realM)} m: ATLAS tiene ${fmtM(Math.abs(f.realM - f.trazoM))} m ${f.trazoM < f.realM ? "menos" : "más"} (${fmtM(Math.abs((f.trazoM - f.realM) / f.realM * 100))} %).`;
  const pregFicha = !tarjeta
    ? "Todavía no se puede responder: falta el consumo real o la ficha de telas."
    : `${f.tipo === "normal" ? "Sí, está dentro de lo normal." : f.tipo === "menos" ? "Gastó menos que la ficha: ahorro de tela." : "Gastó más que la ficha: hay tela de más."} Debía ${fmtM(f.teorM)} m y usó ${fmtM(f.realM)} m.`;
  const unidP = f.unidadesLote > 0 ? f.unidadesLote : f.unidades;
  const porPrenda = (n) => (unidP > 0 ? ` (${Number(n / unidP).toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} por prenda)` : "");
  const pregCot = f.cotizM > 0
    ? `${f.tipo === "normal" ? "Sí, está dentro de lo normal." : f.tipo === "menos" ? "Se gastó menos que lo cotizado: ahorro real." : f.tipo === "mas" ? "Se gastó más que lo cotizado: la tela se comió margen." : ""} Cotizó ${fmtM(f.cotizM)} m${porPrenda(f.cotizM)}${f.realM > 0 ? ` y usó ${fmtM(f.realM)} m${porPrenda(f.realM)}` : ""}.`.trim()
    : "";
  return (
    <article style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={abierta}
        onClick={onToggle}
        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onToggle(); } }}
        style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", padding: "14px 18px", cursor: "pointer" }}
      >
        <div style={{ flex: "1 1 170px", minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: C.ink }}>{f.lote ? `Lote ${f.lote}` : "Sin lote aún"}</div>
          <div style={{ fontSize: 12.5, color: C.slate }}>{fmtFecha(f.fecha)}{f.cortador ? ` · ${f.cortador}` : ""}{f.origen === "busint" ? " · solo en Busint" : ""}</div>
          <div style={{ fontSize: 12.5, color: C.slate }}>{f.refs.join(", ") || "—"}{f.tela ? ` · ${f.tela}` : f.pedido ? ` · Pedido ${f.pedido}` : ""} · {Number(f.unidades || 0).toLocaleString("es-CO")} unid.</div>
        </div>
        <div style={{ flex: "2 1 260px", minWidth: 0 }}>
          {f.cotizM > 0 && <Barra nombre="Cotizó" valor={f.cotizM} max={max} color={C.cotizo} />}
          <Barra nombre="Debía" valor={f.teorM || 0} max={max} color={C.debia} />
          <Barra nombre="Usó" valor={f.realM || 0} max={max} color={C.uso} />
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <span style={{ display: "inline-block", fontWeight: 800, fontSize: 12.5, borderRadius: 20, padding: "3px 11px", background: e.bg, color: e.color }}>{e.texto}</span>
          {f.avisos.length > 0 && <span style={{ display: "inline-block", marginLeft: 6, fontWeight: 800, fontSize: 12.5, borderRadius: 20, padding: "3px 11px", background: C.amberBg, color: C.amber }}>Con aviso</span>}
          <div style={{ fontSize: 13.5, marginTop: 6, color: C.ink, lineHeight: 1.35 }}>{fraseDe(f)}</div>
          {conPlata ? (
            <div style={{ fontSize: 15, fontWeight: 900, marginTop: 3, color: f.pagadoDeMas < 0 ? C.green : f.pagadoDeMas > 0 ? C.red : C.slate }}>
              {f.pagadoDeMas < 0 ? "A favor " : f.pagadoDeMas > 0 ? "De más " : "Sin diferencia "}{f.pagadoDeMas !== 0 ? fmtPesos(Math.abs(f.pagadoDeMas)) : ""}
            </div>
          ) : f.realM > 0 && f.teorM > 0 ? (
            <div style={{ fontSize: 12.5, marginTop: 3, color: C.slate }}>Sin precio de tela</div>
          ) : null}
        </div>
      </div>
      {abierta && (
        <div style={{ borderTop: `1px solid ${C.border}`, background: "#FBF9F6", padding: "14px 18px 16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[
              ...(f.cotizM > 0 ? [["¿Se gastó lo que se cotizó?", pregCot]] : []),
              [f.cotizM > 0 ? "¿Y contra la ficha de Busint?" : "¿Gastó lo que decía la ficha?", pregFicha],
              ["¿Lo registrado en ATLAS coincide con Busint?", pregTrazo],
            ].map(([titulo, texto], i) => (
              <div key={titulo} style={{ flex: "1 1 220px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate, fontWeight: 700, marginBottom: 4 }}>{f.cotizM > 0 || i < 2 ? `${i + 1}. ` : ""}{titulo}</div>
                <div style={{ fontSize: 13.5 }}>{texto}</div>
              </div>
            ))}
          </div>
          {f.fuente === "detalle" && f.porTela && f.porTela.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Tela", "Debía (m)", "Usó (m)", "Diferencia", "Costo por metro"].map((t, i) => (
                      <th key={t} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate, textAlign: i === 0 ? "left" : "right", padding: "6px 8px" }}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.porTela.map((t) => (
                    <tr key={t.tela} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 8px" }}>{t.tela}{t.sinPareja ? " ⚠" : ""}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtM(t.teorM)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtM(t.realM)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: t.difM > 0 ? C.red : t.difM < 0 ? C.green : C.slate, fontWeight: 700 }}>{t.difM > 0 ? "+" : ""}{fmtM(t.difM)} m</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{t.costoMetro > 0 ? fmtPesos(t.costoMetro) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {f.avisos.map((a) => (
            <div key={a} style={{ marginTop: 10, background: C.amberBg, border: `1px solid ${C.amber}55`, color: "#6B4308", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>{a}</div>
          ))}
          {f.fuente !== "detalle" && f.teorPorPrenda !== null && f.teorPorPrenda !== undefined && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: C.slate }}>
              Por prenda: debía {Number(f.teorPorPrenda).toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m
              {f.realPorPrenda !== null && f.realPorPrenda !== undefined ? ` · usó ${Number(f.realPorPrenda).toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m` : ""}.
            </div>
          )}
          {f.sinCotizacion && f.sinCotizacion.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5, color: C.slate }}>Sin cotización aprobada en ATLAS para {f.sinCotizacion.join(", ")}: se comparó contra la ficha de telas.</div>}
          {f.cotizVersiones && f.cotizVersiones.length > 0 && <div style={{ marginTop: 6, fontSize: 12.5, color: C.slate }}>Cotización aprobada usada: {f.cotizVersiones.join(", ")}.</div>}
          {f.detalleTrazo && <div style={{ marginTop: 6, fontSize: 12.5, color: C.slate }}>Trazos del lote: {f.detalleTrazo}.</div>}
          {f.fuente === "detalle" && <div style={{ marginTop: 6, fontSize: 12.5, color: C.slate }}>Fuente: ficha de telas de la referencia y detalle de telas del lote en Busint.</div>}
        </div>
      )}
    </article>
  );
}

const ultimoDiaDelMes = (iso) => {
  const [y, m] = String(iso || "").split("-").map(Number);
  return y && m ? `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` : iso;
};

export default function ConsumoTelaCortePanel({ pedidos, desde: desdePeriodo, hasta: hastaPeriodo, functionsClient, db }) {
  const [vista, setVista] = useState("calendario");
  // En el calendario se ven los meses completos, aunque el periodo elegido sea «Hoy».
  const desde = vista === "calendario" && desdePeriodo ? `${String(desdePeriodo).slice(0, 8)}01` : desdePeriodo;
  const hasta = vista === "calendario" && hastaPeriodo ? ultimoDiaDelMes(hastaPeriodo) : hastaPeriodo;
  const [busint, setBusint] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [limite, setLimite] = useState(TOLERANCIA_CONSUMO.verde);
  const [filtro, setFiltro] = useState("todos");
  const [abiertas, setAbiertas] = useState({});
  const [verColumnas, setVerColumnas] = useState(false);
  const [costosTela, setCostosTela] = useState({});
  const [errorCostos, setErrorCostos] = useState("");
  const [cotPorRef, setCotPorRef] = useState(null); // lo cotizado por referencia (versión aprobada); null = aún no cargado
  const [errorCot, setErrorCot] = useState("");

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError("");
    const llamar = httpsCallable(functionsClient, "getRendimientoCorteBusint", { timeout: 300000 });
    llamar({ dias: 150 })
      .then((r) => { if (vivo) setBusint(r.data); })
      .catch((err) => { if (vivo) setError(err?.message || String(err)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [functionsClient, recarga]);

  useEffect(() => {
    if (!db) return undefined;
    const unsub = onSnapshot(
      collection(db, "cotizaciones"),
      (snap) => { setCotPorRef(cotizadoPorReferencia(snap.docs.map((d) => ({ ...d.data(), id: d.id })))); setErrorCot(""); },
      (err) => setErrorCot(err?.message || String(err))
    );
    return () => unsub();
  }, [db]);
  const tol = useMemo(() => ({ verde: limite, rojo: limite * 2 }), [limite]);
  const cortes = useMemo(() => cortesAtlasConTrazo(pedidos, desde, hasta), [pedidos, desde, hasta]);
  const filasBase = useMemo(
    () => armarFilasConsumoTela({ cortes, filasBusint: busint?.filas || [], desde, hasta, tol }),
    [cortes, busint, desde, hasta, tol]
  );
  // Detalle de telas de cada lote (Busint): teórico y real por tela + costo, para cuando el Visor no trae el corte
  // y para convertir los metros de más en pesos.
  const lotesPedir = useMemo(() => {
    const m = new Map();
    cortes.forEach((c) => {
      if (!c.lote) return;
      const e = m.get(c.lote) || new Map();
      c.refs.forEach((r) => e.set(r.ref, (e.get(r.ref) || 0) + (Number(r.total) || 0)));
      m.set(c.lote, e);
    });
    return [...m].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([lote, refs]) => ({ lote, refs: [...refs].map(([ref, total]) => ({ ref, total })) }));
  }, [cortes]);
  const lotesKey = useMemo(() => JSON.stringify(lotesPedir), [lotesPedir]);
  useEffect(() => {
    const lotes = JSON.parse(lotesKey);
    if (!lotes.length) return undefined;
    let vivo = true;
    setErrorCostos("");
    const llamar = httpsCallable(functionsClient, "getConsumoTelaLotesBusint", { timeout: 300000 });
    llamar({ lotes: lotes.slice(0, 400) })
      .then((r) => {
        if (!vivo) return;
        setCostosTela((prev) => ({ ...prev, ...(r.data?.lotes || {}) }));
        if (r.data?.errorFicha) setErrorCostos(r.data.errorFicha);
      })
      .catch((err) => { if (vivo) setErrorCostos(err?.message || String(err)); });
    return () => { vivo = false; };
  }, [lotesKey, functionsClient, recarga]);
  const filasDetalle = useMemo(() => aplicarDetalleTelasConsumo(filasBase, costosTela, tol), [filasBase, costosTela, tol]);
  const filasCot = useMemo(() => aplicarCotizadoConsumo(filasDetalle, cotPorRef), [filasDetalle, cotPorRef]);
  const filas = useMemo(() => aplicarCostoTelaConsumo(filasCot, costosTela), [filasCot, costosTela]);
  const usaDetalle = useMemo(() => filas.some((f) => f.fuente === "detalle"), [filas]);
  const filasC = useMemo(() => clasificarConsumoSimple(filas, limite), [filas, limite]);
  const resumen = useMemo(() => resumenConsumoTela(filas), [filas]);
  const cuenta = useMemo(() => {
    const c = { todos: filasC.length, mas: 0, menos: 0, normal: 0, aviso: 0, falta: 0 };
    filasC.forEach((f) => { c[f.tipo] += 1; if (f.avisos.length) c.aviso += 1; });
    return c;
  }, [filasC]);
  const visibles = filtro === "todos" ? filasC : filtro === "aviso" ? filasC.filter((f) => f.avisos.length > 0) : filasC.filter((f) => f.tipo === filtro);
  const faltantes = busint ? COLUMNAS_CLAVE.filter((k) => !busint.detectadas?.[k]) : [];
  const periodoFueraDeVentana = busint?.desde && desde < busint.desde;
  const difResumen = resumen.real - resumen.teor;
  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: C.ink }}>🧵 Consumo de tela</h3>
        <button
          onClick={() => setRecarga((n) => n + 1)}
          disabled={cargando}
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ink, fontWeight: 800, fontSize: 12.5, cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.6 : 1 }}
        >
          {cargando ? "Consultando Busint…" : "🔄 Actualizar desde Busint"}
        </button>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: C.slate, maxWidth: 900 }}>
        ¿Se gastó la tela que se cotizó? Cada lote compara lo que <strong>cotizó</strong> (consumo de la cotización aprobada × unidades) y lo que <strong>debía</strong> usar (ficha de telas de Busint) con lo que <strong>usó</strong> (lo cortado, según Busint), y revisa que lo <strong>tendido</strong> (los metros de los trazos registrados en ATLAS) coincida con lo que registró Busint. Medidas en metros lineales (m).
      </p>
      {error && <div style={{ fontSize: 12.5, color: C.red, background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>⚠ No se pudo traer el rendimiento de Busint: {error}. Se muestran solo los trazos de ATLAS.</div>}
      {errorCot && <div style={{ fontSize: 12.5, color: C.amber, background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>⚠ No se pudieron leer las cotizaciones ({errorCot}); sin ellas el consumo se compara solo contra la ficha de telas.</div>}
      {errorCostos && <div style={{ fontSize: 12.5, color: C.amber, background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>⚠ No se pudo traer el detalle de telas de Busint ({errorCostos}); sin él no se calcula el consumo por tela ni el dinero.</div>}
      {busint && busint.total === 0 && usaDetalle && (
        <div style={{ fontSize: 12.5, color: C.slate, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          El Visor de Rendimiento de Corte no entrega filas por la API de Busint. Mientras tanto, lo que <strong>debía</strong> usar sale de la <strong>ficha de telas</strong> de la referencia y lo que <strong>usó</strong>, del <strong>detalle de telas</strong> de cada lote (largo × capas + ajuste), tela por tela.
        </div>
      )}
      {busint && busint.total === 0 && !usaDetalle && (
        <div style={{ fontSize: 12.5, color: C.amber, background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          ⚠ La tabla «{busint.tablaUsada}» de Busint no trajo ninguna fila{busint.errorTabla ? ` (${busint.errorTabla})` : ""}.
          {busint.candidatas?.length ? ` Tablas parecidas que existen: ${busint.candidatas.join(", ")}.` : " No se encontró otra tabla con «rendimiento» en el nombre."} Abre «Ver columnas de Busint» y avísame.
          {busint.diagnosticoVacio && (
            <div style={{ marginTop: 8, color: C.ink, fontSize: 12, lineHeight: 1.6 }}>
              <div><strong>Qué respondió Busint:</strong> {busint.diagnosticoVacio.respuesta?.error
                ? busint.diagnosticoVacio.respuesta.error
                : `${busint.diagnosticoVacio.respuesta?.tipo || "—"}${busint.diagnosticoVacio.respuesta?.largo !== null && busint.diagnosticoVacio.respuesta?.largo !== undefined ? ` con ${busint.diagnosticoVacio.respuesta.largo} filas` : ""}${busint.diagnosticoVacio.respuesta?.llaves?.length ? ` · llaves: ${busint.diagnosticoVacio.respuesta.llaves.join(", ")}` : ""}`}</div>
              {busint.diagnosticoVacio.respuesta?.muestra && <div style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{busint.diagnosticoVacio.respuesta.muestra}</div>}
              {(busint.diagnosticoVacio.otrasTablas || []).map((t) => (
                <div key={t.tabla}><strong>{t.tabla}:</strong> {t.error ? t.error : t.filasEnPagina ? `trae filas · columnas: ${t.columnas.join(" · ")}` : "sin filas"}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {busint && faltantes.length > 0 && busint.total > 0 && (
        <div style={{ fontSize: 12.5, color: C.amber, background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          ⚠ No se reconocieron estas columnas de la tabla de Busint: <strong>{faltantes.join(", ")}</strong>. Abre «Ver columnas de Busint» y avísame cómo se llaman para ajustarlo.
        </div>
      )}
      {periodoFueraDeVentana && <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Busint se consulta de los últimos 150 días (desde {fmtFecha(busint.desde)}); lo anterior sale solo con trazos.</div>}

      <div role="group" aria-label="Forma de ver" style={{ display: "inline-flex", background: C.white, border: `1px solid ${C.border}`, borderRadius: 999, padding: 3, marginBottom: 12 }}>
        {[["calendario", "Calendario"], ["tarjetas", "Tarjetas por lote"]].map(([id, texto]) => (
          <button key={id} onClick={() => setVista(id)} aria-pressed={vista === id} style={{ border: 0, background: vista === id ? C.ink : "transparent", color: vista === id ? C.white : C.slate, padding: "6px 16px", borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{texto}</button>
        ))}
      </div>

      {vista === "tarjetas" && <section aria-label="Resumen del periodo" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 14 }}>
        {resumen.n > 0 ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4, color: C.ink }}>
              En <strong>{resumen.n}</strong> {resumen.n === 1 ? "lote" : "lotes"} con datos completos se usaron <strong>{fmtM(resumen.real)} m</strong> de tela y {resumen.nCot === resumen.n ? "lo cotizado era" : resumen.nCot > 0 ? "lo previsto era" : "la ficha preveía"} <strong>{fmtM(resumen.teor)} m</strong>:{" "}
              <strong style={{ color: difResumen < 0 ? C.green : difResumen > 0 ? C.red : C.slate }}>{difResumen === 0 ? "sin diferencia" : `${fmtM(Math.abs(difResumen))} m ${difResumen < 0 ? "menos" : "más"}`}</strong>
              {resumen.pctReal !== null && difResumen !== 0 ? ` (${fmtPct(resumen.pctReal)})` : ""}.
            </div>
            {resumen.nPesos > 0 && (
              <div style={{ fontSize: 13.5, color: C.slate, marginTop: 4 }}>
                {resumen.pesos < 0 ? "Ahorro en tela de " : resumen.pesos > 0 ? "Pagaste de más en tela: " : "Sin diferencia en pesos"}
                {resumen.pesos !== 0 && <strong style={{ color: resumen.pesos < 0 ? C.green : C.red, fontSize: 15 }}>{fmtPesos(Math.abs(resumen.pesos))}</strong>}
                {` en ${resumen.nPesos} ${resumen.nPesos === 1 ? "lote" : "lotes"} con precio de tela`}
                {resumen.sinPrecio > 0 ? `; ${resumen.sinPrecio} sin precio` : ""}. Metros de más o de menos{resumen.nCot > 0 ? " contra lo cotizado" : ""} × costo de la tela de cada lote en Busint.{resumen.nCot > 0 && resumen.nCot < resumen.n ? " «Lo previsto» es la cotización aprobada y, donde no la hay, la ficha de telas." : ""}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 14, color: C.slate }}>Todavía no hay lotes con consumo real y ficha de telas en este periodo.</div>
        )}
      </section>}

      {vista === "tarjetas" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {FILTROS.filter((x) => x.id === "todos" || cuenta[x.id] > 0 || filtro === x.id).map((x) => (
          <button
            key={x.id}
            onClick={() => setFiltro(filtro === x.id ? "todos" : x.id)}
            aria-pressed={filtro === x.id}
            style={{ border: `1px solid ${filtro === x.id ? C.ink : C.border}`, background: filtro === x.id ? C.ink : C.white, color: filtro === x.id ? C.white : C.ink, fontWeight: 700, fontSize: 12.5, borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}
          >
            {x.texto} ({cuenta[x.id]})
          </button>
        ))}
        <span style={{ fontSize: 12, color: C.slate, marginLeft: 6 }}>
          Normal hasta{" "}
          <input type="number" min="0" step="0.5" value={limite} onChange={(e) => setLimite(Math.max(0, Number(e.target.value) || 0))} style={{ width: 56, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} /> % de diferencia
        </span>
      </div>}

      {cargando && !busint ? (
        <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>Consultando Busint…</div>
      ) : vista === "calendario" ? (
        <CalendarioAhorroTela
          filas={filasC}
          renderLote={(f) => <TarjetaLote key={f.key} f={f} limite={limite} abierta={!!abiertas[f.key]} onToggle={() => setAbiertas((a) => ({ ...a, [f.key]: !a[f.key] }))} />}
        />
      ) : !visibles.length ? (
        <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>No hay cortes ni rendimiento de Busint en este periodo{filtro !== "todos" ? " con ese filtro" : ""}.</div>
      ) : (
        visibles.map((f) => (
          <TarjetaLote key={f.key} f={f} limite={limite} abierta={!!abiertas[f.key]} onToggle={() => setAbiertas((a) => ({ ...a, [f.key]: !a[f.key] }))} />
        ))
      )}
      {vista === "tarjetas" && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.slate }}>
        <strong>Cómo se lee:</strong> «Cotizó» = consumo de la cotización aprobada × unidades. «Debía» = ficha de telas × unidades del lote. «Usó» = lo que Busint registró cortado en ese lote. El veredicto se da contra lo cotizado (si la referencia no tiene cotización aprobada, contra la ficha). Hasta {limite} % de diferencia es normal; más de eso se marca como ahorro o gasto de más.
      </p>}
      {busint && (
        <div style={{ marginTop: 8 }}>
          <span onClick={() => setVerColumnas((v) => !v)} style={{ fontSize: 12, color: C.slate, cursor: "pointer", textDecoration: "underline" }}>{verColumnas ? "Ocultar" : "Ver"} columnas de Busint ({busint.columnas?.length || 0})</span>
          {verColumnas && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: C.slate, lineHeight: 1.6 }}>
              <div>Tabla usada: {busint.tablaUsada || "—"}{busint.candidatas?.length ? ` · tablas parecidas: ${busint.candidatas.join(", ")}` : ""}</div>
              <div>Filas en la tabla: {busint.total}. Columnas: {(busint.columnas || []).join(" · ") || "—"}</div>
              <div>Usadas: {Object.entries(busint.detectadas || {}).map(([k, v]) => `${k} → ${v || "(no encontrada)"}`).join(" · ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
