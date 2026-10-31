import { useState, useEffect, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { TOLERANCIA_CONSUMO, cortesAtlasConTrazo, armarFilasConsumoTela, aplicarCostoTelaConsumo, resumenConsumoTela, clasificarDif } from "./consumo-tela-calculo";

// Consumo de tela de CORTE — teórico contra real (2026-10-31, a pedido de Fredy).
// Se muestra dentro de "Centro de Costo — Planeación · CORTE". Une los cortes de ATLAS
// (metros tendidos = trazos) con el Visor de Rendimiento de Corte de Busint (teórico y real).
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const ESTADOS = {
  cruza: { label: "Cruza", color: C.green, bg: C.greenBg },
  revisar: { label: "Revisar", color: C.amber, bg: C.amberBg },
  nocruza: { label: "No cruza", color: C.red, bg: C.redBg },
  esperando: { label: "Esperando Busint", color: C.slate, bg: C.canvas },
  sin_teorico: { label: "Sin teórico", color: C.slate, bg: C.canvas },
};
const COLUMNAS_CLAVE = ["fecha", "referencia", "cantidad", "consMlTeor", "mlReal"];
const fmtM = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtP = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const fmtPesos = (n) => (n < 0 ? "−$ " : "$ ") + Math.abs(Math.round(n)).toLocaleString("es-CO");
const fmtFecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

function Pct({ v, tol }) {
  if (v === null || v === undefined) return <span style={{ color: C.slate }}>—</span>;
  const est = clasificarDif(v, tol);
  const color = est === "cruza" ? C.green : est === "revisar" ? C.amber : C.red;
  return <strong style={{ color }}>{v > 0 ? "+" : ""}{v.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</strong>;
}

export default function ConsumoTelaCortePanel({ pedidos, desde, hasta, functionsClient }) {
  const [busint, setBusint] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [tol, setTol] = useState(TOLERANCIA_CONSUMO);
  const [filtro, setFiltro] = useState("todos");
  const [verColumnas, setVerColumnas] = useState(false);
  const [costosTela, setCostosTela] = useState({});
  const [errorCostos, setErrorCostos] = useState("");

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

  const cortes = useMemo(() => cortesAtlasConTrazo(pedidos, desde, hasta), [pedidos, desde, hasta]);
  const filasBase = useMemo(
    () => armarFilasConsumoTela({ cortes, filasBusint: busint?.filas || [], desde, hasta, tol }),
    [cortes, busint, desde, hasta, tol]
  );
  // Costo de la tela de cada lote (Busint) para convertir los metros de más en pesos.
  const lotesKey = useMemo(() => [...new Set(filasBase.filter((f) => f.lote && f.realM > 0).map((f) => String(f.lote)))].sort().join(","), [filasBase]);
  useEffect(() => {
    if (!lotesKey) return undefined;
    let vivo = true;
    setErrorCostos("");
    const llamar = httpsCallable(functionsClient, "getCostoTelaLotesBusint", { timeout: 300000 });
    llamar({ numLotes: lotesKey.split(",").slice(0, 400) })
      .then((r) => { if (vivo) setCostosTela((prev) => ({ ...prev, ...(r.data?.lotes || {}) })); })
      .catch((err) => { if (vivo) setErrorCostos(err?.message || String(err)); });
    return () => { vivo = false; };
  }, [lotesKey, functionsClient, recarga]);
  const filas = useMemo(() => aplicarCostoTelaConsumo(filasBase, costosTela), [filasBase, costosTela]);
  const resumen = useMemo(() => resumenConsumoTela(filas), [filas]);
  const visibles = filtro === "todos" ? filas : filas.filter((f) => f.estado === filtro);
  const faltantes = busint ? COLUMNAS_CLAVE.filter((k) => !busint.detectadas?.[k]) : [];
  const periodoFueraDeVentana = busint?.desde && desde < busint.desde;
  const chip = (id, texto, color, bg) => (
    <button
      key={id}
      onClick={() => setFiltro(filtro === id ? "todos" : id)}
      style={{ border: filtro === id ? `2px solid ${C.ink}` : `1px solid ${color}55`, background: bg, color, fontWeight: 800, fontSize: 12, borderRadius: 20, padding: "4px 12px", cursor: "pointer" }}
    >
      ● {texto}: {resumen.cuenta[id] || 0}
    </button>
  );
  const th = (t, r) => <th style={{ textAlign: r ? "right" : "left", padding: "8px 10px", fontSize: 10.5, color: C.slate, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{t}</th>;
  const inpTol = { width: 56, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 };
  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: C.ink }}>🧵 Consumo de tela — teórico contra real</h3>
        <button
          onClick={() => setRecarga((n) => n + 1)}
          disabled={cargando}
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ink, fontWeight: 800, fontSize: 12.5, cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.6 : 1 }}
        >
          {cargando ? "Consultando Busint…" : "🔄 Actualizar desde Busint"}
        </button>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: C.slate, maxWidth: 900 }}>
        Cada corte se cruza con tres números: los <strong>trazos</strong> que se tendieron en ATLAS (largo × capas), el consumo <strong>teórico</strong> de Busint (promedio por prenda × unidades) y el consumo <strong>real</strong> que Busint registra del corte. Medidas en metros lineales (ml).
      </p>
      {error && <div style={{ fontSize: 12.5, color: C.red, background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>⚠ No se pudo traer el rendimiento de Busint: {error}. Se muestran solo los trazos de ATLAS.</div>}
      {errorCostos && <div style={{ fontSize: 12.5, color: C.amber, background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>⚠ No se pudo traer el costo de la tela de Busint ({errorCostos}); la columna «Pagué de más» queda sin valores.</div>}
      {busint && faltantes.length > 0 && (
        <div style={{ fontSize: 12.5, color: C.amber, background: C.amberBg, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          ⚠ No se reconocieron estas columnas de la tabla de Busint: <strong>{faltantes.join(", ")}</strong>. Abre «Ver columnas de Busint» y avísame cómo se llaman para ajustarlo.
        </div>
      )}
      {periodoFueraDeVentana && <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Busint se consulta de los últimos 150 días (desde {fmtFecha(busint.desde)}); lo anterior sale solo con trazos.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {chip("cruza", "Cruzan", C.green, C.greenBg)}
        {chip("revisar", `Revisar (${tol.verde} % a ${tol.rojo} %)`, C.amber, C.amberBg)}
        {chip("nocruza", `No cruzan (más de ${tol.rojo} %)`, C.red, C.redBg)}
        {chip("esperando", "Esperando Busint", C.slate, C.canvas)}
        {resumen.cuenta.sin_teorico > 0 && chip("sin_teorico", "Sin teórico", C.slate, C.canvas)}
        <span style={{ fontSize: 12, color: C.slate, marginLeft: 6 }}>
          Límites: verde hasta <input type="number" min="0" step="0.5" value={tol.verde} onChange={(e) => setTol((t) => ({ ...t, verde: Math.max(0, Number(e.target.value) || 0) }))} style={inpTol} /> % · rojo desde{" "}
          <input type="number" min="0" step="0.5" value={tol.rojo} onChange={(e) => setTol((t) => ({ ...t, rojo: Math.max(0, Number(e.target.value) || 0) }))} style={inpTol} /> %
        </span>
      </div>
      {cargando && !busint ? (
        <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>Consultando el Visor de Rendimiento de Corte en Busint…</div>
      ) : !visibles.length ? (
        <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>No hay cortes ni rendimiento de Busint en este periodo{filtro !== "todos" ? " con ese estado" : ""}.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {th("Corte / Lote")}{th("Referencia · Tela")}{th("Unid.", true)}{th("Trazos (m)", true)}{th("Teórico Busint (m)", true)}{th("Trazo vs teórico", true)}{th("Real Busint (m)", true)}{th("Real vs teórico", true)}{th("Pagué de más ($)", true)}{th("Estado")}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const e = ESTADOS[f.estado] || ESTADOS.esperando;
                return (
                  <tr key={f.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 10px" }}>
                      <div style={{ fontWeight: 800, color: C.ink }}>{f.lote ? `Lote ${f.lote}` : "Sin lote aún"}</div>
                      <div style={{ fontSize: 11, color: C.slate }}>{fmtFecha(f.fecha)}{f.cortador ? ` · ${f.cortador}` : ""}{f.origen === "busint" ? " · solo en Busint" : ""}</div>
                    </td>
                    <td style={{ padding: "9px 10px" }}>
                      <div style={{ fontWeight: 700 }}>{f.refs.join(", ") || "—"}</div>
                      <div style={{ fontSize: 11, color: C.slate }}>{f.tela || (f.pedido ? `Pedido ${f.pedido}` : "")}</div>
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>{Number(f.unidades || 0).toLocaleString("es-CO")}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      {fmtM(f.trazoM)}
                      {f.detalleTrazo && <div style={{ fontSize: 11, color: C.slate }}>{f.detalleTrazo}</div>}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      {fmtM(f.teorM)}
                      {f.teorPorPrenda !== null && <div style={{ fontSize: 11, color: C.slate }}>{fmtP(f.teorPorPrenda)} m/prenda</div>}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}><Pct v={f.trazoVsTeor} tol={tol} /></td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      {fmtM(f.realM)}
                      {f.realPorPrenda !== null && <div style={{ fontSize: 11, color: C.slate }}>{fmtP(f.realPorPrenda)} m/prenda</div>}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}><Pct v={f.realVsTeor} tol={tol} /></td>
                    <td style={{ padding: "9px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {f.pagadoDeMas !== null && f.pagadoDeMas !== undefined ? (
                        <>
                          <strong style={{ color: f.pagadoDeMas > 0 ? C.red : f.pagadoDeMas < 0 ? C.green : C.slate }}>{fmtPesos(f.pagadoDeMas)}</strong>
                          <div style={{ fontSize: 11, color: C.slate }}>{f.difM > 0 ? "+" : ""}{fmtM(f.difM)} m × {fmtPesos(f.costoMetro)}/m</div>
                        </>
                      ) : f.realM > 0 && f.teorM > 0 ? <span style={{ fontSize: 11, color: C.slate }}>sin precio</span> : <span style={{ color: C.slate }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ background: e.bg, color: e.color, fontWeight: 800, fontSize: 11.5, borderRadius: 20, padding: "3px 10px" }}>● {e.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {resumen.n > 0 && (
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.slate }}>
          Cortes con real ({resumen.n}): teórico <strong>{fmtM(resumen.teor)} m</strong> · real <strong>{fmtM(resumen.real)} m</strong>
          {resumen.pctReal !== null && <> → el real gastó <Pct v={resumen.pctReal} tol={tol} /> sobre el teórico</>}.
        </p>
      )}
      {resumen.nPesos > 0 && (
        <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: resumen.pesos > 0 ? C.redBg : C.greenBg, border: `1px solid ${resumen.pesos > 0 ? C.red : C.green}55`, fontSize: 13.5, color: C.ink }}>
          {resumen.pesos > 0 ? "Pagaste de más en tela: " : resumen.pesos < 0 ? "Ahorraste en tela: " : "Sin diferencia en pesos: "}
          <strong style={{ color: resumen.pesos > 0 ? C.red : C.green, fontSize: 16 }}>{fmtPesos(resumen.pesos)}</strong>
          <span style={{ color: C.slate, fontSize: 12 }}> · {resumen.nPesos} corte{resumen.nPesos !== 1 ? "s" : ""} con precio de tela{resumen.sinPrecio > 0 ? ` · ${resumen.sinPrecio} sin precio` : ""}. Metros de más × costo por metro de la tela de cada lote en Busint.</span>
        </div>
      )}
      {busint && (
        <div style={{ marginTop: 8 }}>
          <span onClick={() => setVerColumnas((v) => !v)} style={{ fontSize: 12, color: C.slate, cursor: "pointer", textDecoration: "underline" }}>{verColumnas ? "Ocultar" : "Ver"} columnas de Busint ({busint.columnas?.length || 0})</span>
          {verColumnas && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: C.slate, lineHeight: 1.6 }}>
              <div>Filas en la tabla: {busint.total}. Columnas: {(busint.columnas || []).join(" · ") || "—"}</div>
              <div>Usadas: {Object.entries(busint.detectadas || {}).map(([k, v]) => `${k} → ${v || "(no encontrada)"}`).join(" · ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
