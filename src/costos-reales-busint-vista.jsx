import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { sugerirAsignaciones, aplicarCostosReales, costoPrendaDeLinea } from "./costos-reales-busint";

// (2026-10-26, a pedido de Fredy) Ventana "Traer costos reales de Busint" del
// Cotizador → Ajustar costos reales. Trae, de la tabla de Busint "lotes
// cumplidos teorico vs real valor", los últimos lotes cumplidos de la
// referencia; se elige uno (por defecto el más reciente), se revisa a qué
// línea de la cotización va cada concepto y se aplica. Nada se guarda hasta
// que se pulsa "Guardar versión" en el Cotizador.
const pesos = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const dec = (n) => (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const btn = (bg, color, border) => ({ padding: "8px 14px", background: bg, color, border: `1.5px solid ${border || bg}`, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });

function valorDe(a) {
  return a.tipo === "tela" || a.tipo === "insumo" || a.tipo === "proceso" ? `${a.tipo}:${a.idx}` : a.tipo;
}
function deValor(x) {
  const m = /^(tela|insumo|proceso):(\d+)$/.exec(x);
  return m ? { tipo: m[1], idx: Number(m[2]) } : { tipo: x, idx: null };
}

export default function TraerRealesBusintModal({ referencia, v, functionsClient, C, onAplicar, onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [numLote, setNumLote] = useState("");
  const [asig, setAsig] = useState([]);
  const [quitarImprevistos, setQuitarImprevistos] = useState(true);
  const [ponerEnCero, setPonerEnCero] = useState(true);
  const [cantManual, setCantManual] = useState("");

  useEffect(() => {
    let vivo = true;
    httpsCallable(functionsClient, "getCostosRealesLoteBusint", { timeout: 540000 })({ referencia, maxLotes: 8 })
      .then((r) => {
        if (!vivo) return;
        setDatos(r.data);
        const primero = (r.data.lotes || []).find((l) => l.cantCortada > 0) || (r.data.lotes || [])[0];
        if (primero) setNumLote(String(primero.numLote));
      })
      .catch((e) => vivo && setError(e?.message || "No se pudo consultar Busint."))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [referencia, functionsClient]);

  const lote = useMemo(() => (datos?.lotes || []).find((l) => String(l.numLote) === String(numLote)) || null, [datos, numLote]);
  // Al cambiar de lote se vuelven a sugerir las asignaciones.
  useEffect(() => {
    if (lote) setAsig(sugerirAsignaciones(lote.filas, v));
    setCantManual("");
  }, [lote, v]);

  const cant = lote ? (lote.cantCortada > 0 ? lote.cantCortada : Number(cantManual) || 0) : 0;
  const resultado = useMemo(() => {
    if (!lote || !(cant > 0) || asig.length !== lote.filas.length) return null;
    try {
      return aplicarCostosReales({ v, conceptos: lote.filas, asignaciones: asig, cantCortada: cant, lote: lote.numLote, quitarImprevistos, ponerEnCeroSinDato: ponerEnCero });
    } catch (e) { return null; }
  }, [lote, cant, asig, v, quitarImprevistos, ponerEnCero]);

  const opciones = [
    ...(v.telas || []).map((t, i) => [`tela:${i}`, `Tela: ${t.material || "(sin nombre)"}`]),
    ...(v.insumos || []).map((t, i) => [`insumo:${i}`, `Insumo: ${t.nombre || "(sin nombre)"}`]),
    ...(v.procesos || []).map((t, i) => [`proceso:${i}`, `Proceso: ${t.nombre || "(sin nombre)"}`]),
    ["nuevo_insumo", "➕ Insumo nuevo"],
    ["nuevo_proceso", "➕ Proceso nuevo"],
    ["ignorar", "No usar"],
  ];
  const th = { textAlign: "left", padding: "6px 8px", fontSize: 11, color: C.slate, letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "6px 8px", fontSize: 13, borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" };

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(1040px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>⬇ Costos reales desde Busint — referencia {referencia}</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
            Es el informe de Gerencia «Histórico de lote»: lo que de verdad costó cada concepto del lote, dividido entre las prendas cortadas. Revisa a qué línea va cada uno y pulsa «Usar este lote». Nada se guarda hasta que pulses «Guardar versión».
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: 16 }}>
          {cargando && <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>Consultando Busint… puede tardar hasta un minuto (trae la tabla completa de lotes cumplidos).</div>}
          {error && <div style={{ padding: 12, color: C.red, fontSize: 13 }}>{error}</div>}
          {datos && (datos.lotes || []).length === 0 && (
            <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>Busint no tiene lotes cumplidos de la referencia «{referencia}» en el informe de costos reales ({datos.totalFilasTabla} filas revisadas). Puede que todavía no se haya cumplido ningún lote o que la referencia esté escrita distinto en Busint.</div>
          )}
          {lote && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
                <label>Lote:{" "}
                  <select value={numLote} onChange={(e) => setNumLote(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "inherit" }}>
                    {(datos.lotes || []).map((l) => (
                      <option key={l.numLote} value={l.numLote}>
                        {`Lote ${l.numLote} · cumplido ${l.fechaISO || "—"} · ${l.cantCortada > 0 ? `${l.cantCortada} prendas` : "sin cantidad"} · real ${pesos(l.totalReal)}`}
                      </option>
                    ))}
                  </select>
                </label>
                {lote.cantCortada > 0
                  ? <span style={{ color: C.slate }}>Costo real por prenda del lote: <b style={{ color: C.ink }}>{pesos(lote.totalReal / lote.cantCortada)}</b></span>
                  : (
                    <label style={{ color: C.red }}>No encuentro las prendas cortadas de este lote; escríbelas:{" "}
                      <input value={cantManual} onChange={(e) => setCantManual(e.target.value)} inputMode="numeric" style={{ width: 80, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}` }} />
                    </label>
                  )}
                {lote.costoRealDado != null && (
                  <span style={{ color: Math.abs(lote.costoRealDado - lote.totalReal) <= 2 ? C.green : C.red, fontWeight: 700 }}>
                    {Math.abs(lote.costoRealDado - lote.totalReal) <= 2 ? "✔ Coincide con el Costo Real Total de Dado por Cumplido" : `⚠ Dado por Cumplido tiene ${pesos(lote.costoRealDado)}`}
                  </span>
                )}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr><th style={th}>CONCEPTO EN BUSINT</th><th style={th}>VA EN LA COTIZACIÓN</th><th style={{ ...th, textAlign: "right" }}>HOY POR PRENDA</th><th style={{ ...th, textAlign: "right" }}>REAL POR PRENDA</th><th style={{ ...th, textAlign: "right" }}>VARIACIÓN</th></tr>
                  </thead>
                  <tbody>
                    {lote.filas.map((c, i) => {
                      const a = asig[i] || { tipo: "ignorar", idx: null };
                      const real = cant > 0 ? c.real / cant : 0;
                      const existente = a.tipo === "tela" || a.tipo === "insumo" || a.tipo === "proceso";
                      const hoy = existente ? costoPrendaDeLinea(v, a.tipo, a.idx) : null;
                      const variacion = hoy > 0 ? (real - hoy) / hoy : null;
                      return (
                        <tr key={c.concepto} style={{ opacity: a.tipo === "ignorar" ? 0.55 : 1 }}>
                          <td style={td}><b>{c.concepto}</b></td>
                          <td style={td}>
                            <select value={valorDe(a)} onChange={(e) => setAsig((x) => x.map((y, j) => (j === i ? deValor(e.target.value) : y)))} style={{ padding: "5px 6px", borderRadius: 8, border: `1px solid ${existente ? C.border : C.amber}`, fontFamily: "inherit", maxWidth: 280 }}>
                              {opciones.map(([val, et]) => <option key={val} value={val}>{et}</option>)}
                            </select>
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>{hoy == null ? "—" : pesos(hoy)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{cant > 0 ? dec(real) : "—"}</td>
                          <td style={{ ...td, textAlign: "right", color: variacion == null ? C.slate : variacion > 0.005 ? C.red : variacion < -0.005 ? C.green : C.slate }}>
                            {variacion == null ? "—" : `${variacion >= 0 ? "+" : ""}${(variacion * 100).toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "12px 0", fontSize: 13 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={quitarImprevistos} onChange={(e) => setQuitarImprevistos(e.target.checked)} />Quitar el 10 % de imprevistos (lo real de Busint ya trae lo que se gastó)</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={ponerEnCero} onChange={(e) => setPonerEnCero(e.target.checked)} />Poner en $0 las líneas de la cotización que Busint no trae en este lote</label>
              </div>
              {resultado && (
                <div style={{ background: C.blueBg, border: "1.5px solid #C9D9EA", borderRadius: 12, padding: "10px 14px", fontSize: 13, lineHeight: 1.6 }}>
                  Real de Busint por prenda: <b>{pesos(resultado.realPorPrenda)}</b> · Costo definitivo que quedaría en la cotización: <b>{pesos(resultado.costoDefinitivo)}</b>
                  {Math.abs(resultado.costoDefinitivo - resultado.realPorPrenda) > 1 && <span style={{ color: C.red, fontWeight: 700 }}> · ⚠ no coinciden (revisa las líneas marcadas en naranja o las opciones de arriba)</span>}
                  {resultado.sinDatoBusint.length > 0 && (
                    <div style={{ color: C.slate }}>
                      Líneas de la cotización que Busint no trae en este lote: {resultado.sinDatoBusint.join(" · ")}{ponerEnCero ? " — quedarán en $0." : " — se dejan como estaban."}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCerrar} style={btn(C.white, C.slate, C.border)}>Cerrar</button>
          <button
            disabled={!resultado}
            onClick={() => onAplicar(resultado.v, { lote: lote.numLote, fechaCumplido: lote.fechaISO || null, cantCortada: cant, realPorPrenda: resultado.realPorPrenda, costoDefinitivo: resultado.costoDefinitivo, quitoImprevistos: quitarImprevistos })}
            style={{ ...btn(C.green, C.white), opacity: resultado ? 1 : 0.5 }}
          >
            Usar este lote
          </button>
        </div>
      </div>
    </div>
  );
}
