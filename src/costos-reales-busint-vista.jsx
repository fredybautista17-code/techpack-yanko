import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { sugerirAsignaciones, aplicarCostosReales, normConcepto } from "./costos-reales-busint";
import { calcularCotizacion } from "./cotizador-calculo";

// (2026-10-26, a pedido de Fredy) Ventana "Traer costos reales de Busint" del
// Cotizador → Ajustar costos reales. Por cada lote cumplido de la referencia
// trae lo que REALMENTE costó (tela, insumos y mano de obra / procesos, ver
// getCostosRealesLoteBusint) y lo COMPARA, concepto por concepto, con la
// versión APROBADA. Se abre con el último lote; se puede elegir otro de la
// lista o escribir el número de un lote. Nada se guarda hasta que se pulsa
// "Guardar versión" en el Cotizador.
const pesos = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const pesosConSigno = (n) => `${n >= 0 ? "+" : "−"}${pesos(Math.abs(n))}`;
const dec = (n) => (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const btn = (bg, color, border) => ({ padding: "8px 14px", background: bg, color, border: `1.5px solid ${border || bg}`, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });
const pctTxt = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const VERDE = { bg: "#EBF7F2", fg: "#1F7A52" };
const ROJO = { bg: "#FDF0EE", fg: "#B8402F" };
// Etiqueta de diferencia: verde = costó menos de lo aprobado, rojo = costó más, gris = igual.
function Pildora({ dif, base, C, grande }) {
  if (dif == null) return <span style={{ color: C.slate }}>—</span>;
  const igual = Math.abs(dif) < 0.5;
  const col = igual ? { bg: C.canvas, fg: C.slate } : dif > 0 ? ROJO : VERDE;
  const flecha = igual ? "＝" : dif > 0 ? "▲" : "▼";
  const txt = igual ? "Igual" : `${pesosConSigno(dif)}${base > 0 ? ` · ${pctTxt(dif / base)}` : ""}`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: grande ? "4px 12px" : "2px 9px", borderRadius: 999, background: col.bg, color: col.fg, fontWeight: 700, fontSize: grande ? 14 : 12.5, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: grande ? 11 : 9 }}>{flecha}</span>{txt}{!igual && base === 0 ? " · nuevo" : ""}
    </span>
  );
}
const ETIQUETA_ORIGEN = { tela: "Tela", insumo: "Insumo", proceso: "Proceso" };
const soloAlfanum = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function valorDe(a) {
  return a.tipo === "tela" || a.tipo === "insumo" || a.tipo === "proceso" ? `${a.tipo}:${a.idx}` : a.tipo;
}
function deValor(x) {
  const m = /^(tela|insumo|proceso):(\d+)$/.exec(x);
  return m ? { tipo: m[1], idx: Number(m[2]) } : { tipo: x, idx: null };
}
const CLAVE_LINEA = { tela: ["telas", "material"], insumo: ["insumos", "nombre"], proceso: ["procesos", "nombre"] };

// `v` = copia de costos reales que se está editando; `vAprobado` = costos de la versión aprobada (no se toca);
// `precioAprobado` = precio de venta aprobado (con IVA), que se mantiene fijo.
export default function TraerRealesBusintModal({ referencia, v, vAprobado, precioAprobado, functionsClient, C, onAplicar, onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [numLote, setNumLote] = useState("");
  const [asig, setAsig] = useState([]);
  const [quitarImprevistos, setQuitarImprevistos] = useState(true);
  const [ponerEnCero, setPonerEnCero] = useState(false);
  const [cantManual, setCantManual] = useState("");
  const [loteEscrito, setLoteEscrito] = useState("");
  const [buscandoLote, setBuscandoLote] = useState(false);
  const [errorLote, setErrorLote] = useState("");

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

  // Trae un lote puntual por su número (aunque no esté entre los últimos de la referencia).
  async function traerLoteEscrito() {
    const n = loteEscrito.trim();
    if (!/^\d+$/.test(n)) { setErrorLote("Escribe solo el número del lote."); return; }
    const ya = (datos?.lotes || []).find((l) => String(l.numLote) === n);
    if (ya) { setNumLote(n); setErrorLote(""); return; }
    setBuscandoLote(true);
    setErrorLote("");
    try {
      const r = await httpsCallable(functionsClient, "getCostosRealesLoteBusint", { timeout: 540000 })({ numLote: n });
      const nuevo = (r.data.lotes || [])[0];
      if (!nuevo || (nuevo.filas || []).length === 0) { setErrorLote(`Busint no trae costos para el lote ${n}.`); return; }
      setDatos((d) => ({ ...(d || {}), lotes: [nuevo, ...((d?.lotes) || [])], avisos: [...((d?.avisos) || []), ...(r.data.avisos || [])] }));
      setNumLote(n);
    } catch (e) {
      setErrorLote(e?.message || "No se pudo traer ese lote.");
    } finally {
      setBuscandoLote(false);
    }
  }

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

  const kAprob = useMemo(() => { try { return vAprobado ? calcularCotizacion(vAprobado) : null; } catch (e) { return null; } }, [vAprobado]);
  const kActual = useMemo(() => { try { return calcularCotizacion(v); } catch (e) { return null; } }, [v]);
  // Costo por prenda de una línea (telas / insumos / procesos) según el cálculo `k` de la versión `vv`.
  const costoDeLinea = (k, vv, tipo, idx) => {
    if (!k) return 0;
    if (tipo === "tela") return k.telas?.[idx]?.porPrenda ?? 0;
    if (tipo === "insumo") return k.insumos?.[idx]?.porPrenda ?? 0;
    return Number(vv?.procesos?.[idx]?.valor) || 0;
  };
  // Costo por prenda que tenía la línea en la versión APROBADA (se busca por nombre; si no está, no existía).
  const aprobadoDeLinea = (tipo, idx) => {
    if (!vAprobado) return null;
    const [arr, campo] = CLAVE_LINEA[tipo];
    const nombre = normConcepto(v?.[arr]?.[idx]?.[campo]);
    const j = (vAprobado[arr] || []).findIndex((x) => normConcepto(x?.[campo]) === nombre);
    return j >= 0 ? costoDeLinea(kAprob, vAprobado, tipo, j) : null;
  };
  const costoAprobado = useMemo(() => { try { return vAprobado ? calcularCotizacion(vAprobado).costoDefinitivo : null; } catch (e) { return null; } }, [vAprobado]);
  const precioConReales = useMemo(() => { try { return resultado ? calcularCotizacion(resultado.v).precioAplicar : null; } catch (e) { return null; } }, [resultado]);

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

  // Filas de la tabla: aprobado / real por prenda de cada concepto.
  const filasTabla = lote ? lote.filas.map((c, i) => {
    const a = asig[i] || { tipo: "ignorar", idx: null };
    const existente = a.tipo === "tela" || a.tipo === "insumo" || a.tipo === "proceso";
    const real = cant > 0 ? c.real / cant : null;
    const aprobado = existente ? aprobadoDeLinea(a.tipo, a.idx) : (a.tipo === "ignorar" ? null : 0);
    return { c, a, i, existente, real, aprobado };
  }) : [];
  const usados = filasTabla.filter((f) => f.a.tipo !== "ignorar");
  const sumaReal = usados.reduce((s, f) => s + (f.real || 0), 0);
  // Líneas de la cotización que ningún concepto de Busint tomó: salen igual en la tabla, para comparar TODO lo aprobado contra TODO lo real.
  const lineasTomadas = new Set(asig.filter((a) => a.tipo === "tela" || a.tipo === "insumo" || a.tipo === "proceso").map((a) => `${a.tipo}:${a.idx}`));
  const sinDatoFilas = [];
  if (lote) {
    [["tela", "telas"], ["insumo", "insumos"], ["proceso", "procesos"]].forEach(([tipo, arr]) => (v[arr] || []).forEach((l, idx) => {
      if (lineasTomadas.has(`${tipo}:${idx}`)) return;
      const actual = costoDeLinea(kActual, v, tipo, idx);
      const aprob = aprobadoDeLinea(tipo, idx);
      if (!(actual > 0) && !(aprob > 0)) return;
      sinDatoFilas.push({ tipo, idx, nombre: l[CLAVE_LINEA[tipo][1]] || "(sin nombre)", actual, aprob });
    }));
  }
  const realDeSinDato = (f) => (ponerEnCero ? 0 : f.actual);
  const sumaAprobado = kAprob ? [...(kAprob.telas || []).map((x) => x.porPrenda || 0), ...(kAprob.insumos || []).map((x) => x.porPrenda || 0), ...(vAprobado.procesos || []).map((x) => Number(x.valor) || 0)].reduce((s, x) => s + x, 0) : 0;
  const sumaRealTodo = sumaReal + sinDatoFilas.reduce((s, f) => s + realDeSinDato(f), 0);
  const nNuevos = filasTabla.filter((f) => (f.a.tipo === "nuevo_insumo" || f.a.tipo === "nuevo_proceso") && (f.real || 0) > 0.5).length;
  const muchosNuevos = nNuevos >= 3 || (nNuevos > 0 && sinDatoFilas.length > 0);
  const difDado = lote && lote.costoRealDado != null ? lote.totalReal - lote.costoRealDado : null;
  const cuadraDado = difDado != null && Math.abs(difDado) <= Math.max(2, lote.costoRealDado * 0.001);
  const refDistinta = lote && lote.ref && soloAlfanum(lote.ref) !== soloAlfanum(referencia);

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(1100px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>⬇ Costos reales desde Busint — referencia {referencia}</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
            Lo que de verdad costó el lote (tela, insumos y mano de obra / procesos), por prenda, frente a lo que se aprobó. Revisa a qué línea va cada concepto y pulsa «Usar este lote». Nada se guarda hasta que pulses «Guardar versión»; la versión aprobada y su precio no se tocan.
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: 16 }}>
          {cargando && <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>Consultando Busint… puede tardar hasta un par de minutos (trae las tablas completas de lotes, insumos y telas).</div>}
          {error && <div style={{ padding: 12, color: C.red, fontSize: 13 }}>{error}</div>}
          {datos && (datos.lotes || []).length === 0 && (
            <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>Busint no tiene lotes cumplidos de la referencia «{referencia}» en el informe de costos reales ({datos.totalFilasTabla} filas revisadas). Puede que todavía no se haya cumplido ningún lote o que la referencia esté escrita distinto en Busint. Si conoces el número de un lote, escríbelo abajo.</div>
          )}
          {datos && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
              <label>Traer otro lote por número:{" "}
                <input value={loteEscrito} onChange={(e) => setLoteEscrito(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") traerLoteEscrito(); }} inputMode="numeric" placeholder="Ej: 7434" style={{ width: 90, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "inherit" }} />
              </label>
              <button onClick={traerLoteEscrito} disabled={buscandoLote} style={btn(C.white, C.ink, C.border)}>{buscandoLote ? "Buscando…" : "Traer lote"}</button>
              {errorLote && <span style={{ color: C.red }}>{errorLote}</span>}
            </div>
          )}
          {(datos?.avisos || []).map((a, i) => <div key={i} style={{ padding: "8px 12px", marginBottom: 8, background: C.amberBg || "#FFF6E5", color: C.red, borderRadius: 8, fontSize: 12.5, fontWeight: 600 }}>⚠ {a}</div>)}
          {lote && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8, fontSize: 13 }}>
                <label>Lote:{" "}
                  <select value={numLote} onChange={(e) => setNumLote(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "inherit" }}>
                    {(datos.lotes || []).map((l, k) => (
                      <option key={l.numLote} value={l.numLote}>
                        {`${k === 0 && l.cumplido !== false ? "Último · " : ""}Lote ${l.numLote} · ${l.cumplido === false ? `sin cumplir${l.fechaCorte ? `, cortado ${l.fechaCorte}` : ""}` : `cumplido ${l.fechaISO || "—"}`} · ${l.cantCortada > 0 ? `${l.cantCortada} prendas` : "sin cantidad"} · real ${pesos(l.totalReal)}`}
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
                {difDado != null && (
                  <span style={{ color: cuadraDado ? C.green : C.red, fontWeight: 700 }}>
                    {cuadraDado ? `✔ Cuadra con el Costo Real Total de Dado por Cumplido (${pesos(lote.costoRealDado)}${Math.abs(difDado) >= 1 ? `, diferencia ${pesosConSigno(difDado)}` : ""})` : `⚠ Dado por Cumplido tiene ${pesos(lote.costoRealDado)} (diferencia ${pesosConSigno(difDado)})`}
                  </span>
                )}
              </div>
              {(refDistinta || lote.cumplido === false) && (
                <div style={{ padding: "8px 12px", marginBottom: 8, background: C.amberBg || "#FFF6E5", color: C.red, borderRadius: 8, fontSize: 12.5, fontWeight: 600 }}>
                  {refDistinta && <div>⚠ Este lote es de la referencia «{lote.ref}», no de «{referencia}». Revisa que sea el lote correcto.</div>}
                  {lote.cumplido === false && <div>⚠ Este lote todavía no está cumplido en Busint: trae tela, insumos y solo los procesos que ya entraron a planta. Corte y Confección (y lo que falte) salen al cumplirse el lote, así que el total real está incompleto.</div>}
                </div>
              )}
              <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>
                Tela {pesos(lote.subtotales?.tela)} · Insumos {pesos(lote.subtotales?.insumo)} · Mano de obra y procesos {pesos(lote.subtotales?.proceso)} · Total real {pesos(lote.totalReal)}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={th}>TIPO</th><th style={th}>CONCEPTO EN BUSINT</th><th style={th}>VA EN LA COTIZACIÓN</th>
                      <th style={{ ...th, textAlign: "right" }}>APROBADO POR PRENDA</th><th style={{ ...th, textAlign: "right" }}>REAL POR PRENDA</th>
                      <th style={{ ...th, textAlign: "right" }}>DIFERENCIA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasTabla.map(({ c, a, i, existente, real, aprobado }) => {
                      const dif = real != null && aprobado != null ? real - aprobado : null;
                      const pct = dif != null && aprobado > 0 ? dif / aprobado : null;
                      const sube = pct != null ? pct >= 0.05 : dif != null && aprobado === 0 && dif > 0.5;
                      return (
                        <tr key={`${c.origen}|${c.concepto}`} style={{ opacity: a.tipo === "ignorar" ? 0.55 : 1, background: sube ? ROJO.bg : "transparent" }}>
                          <td style={{ ...td, fontSize: 11, color: C.slate }}>{ETIQUETA_ORIGEN[c.origen] || ""}</td>
                          <td style={td}><b>{c.concepto}</b>{c.cantidad ? <span style={{ color: C.slate, fontSize: 11 }}> · {dec(c.cantidad)}{c.origen === "tela" ? " kg" : ""}</span> : null}</td>
                          <td style={td}>
                            <select value={valorDe(a)} onChange={(e) => setAsig((x) => x.map((y, j) => (j === i ? deValor(e.target.value) : y)))} style={{ padding: "5px 6px", borderRadius: 8, border: `1px solid ${existente ? C.border : C.amber}`, fontFamily: "inherit", maxWidth: 280 }}>
                              {opciones.map(([val, et]) => <option key={val} value={val}>{et}</option>)}
                            </select>
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>{aprobado == null ? "—" : pesos(aprobado)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{real == null ? "—" : dec(real)}</td>
                          <td style={{ ...td, textAlign: "right" }}><Pildora dif={dif} base={aprobado} C={C} /></td>
                        </tr>
                      );
                    })}
                    {sinDatoFilas.map((f) => (
                      <tr key={`sd|${f.tipo}|${f.idx}`} style={{ background: C.canvas }}>
                        <td style={{ ...td, fontSize: 11, color: C.slate }}>{ETIQUETA_ORIGEN[f.tipo]}</td>
                        <td style={{ ...td, color: C.slate }}><i>{f.nombre}</i> <span style={{ fontSize: 11 }}>· Busint no trajo</span></td>
                        <td style={{ ...td, color: C.slate, fontSize: 12 }}>{ponerEnCero ? "Quedará en $0" : "Se deja como estaba"}</td>
                        <td style={{ ...td, textAlign: "right" }}>{f.aprob == null ? "—" : pesos(f.aprob)}</td>
                        <td style={{ ...td, textAlign: "right", color: C.slate }}>{ponerEnCero ? "$0" : `${pesos(f.actual)} (se deja)`}</td>
                        <td style={{ ...td, textAlign: "right" }}>{f.aprob == null ? <span style={{ color: C.slate }}>—</span> : <Pildora dif={realDeSinDato(f) - f.aprob} base={f.aprob} C={C} />}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, fontWeight: 800 }} colSpan={3}>TOTAL de todas las líneas (sin daños, impuestos ni fijos)</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{pesos(sumaAprobado)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{cant > 0 ? pesos(sumaRealTodo) : "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{cant > 0 ? <Pildora dif={sumaRealTodo - sumaAprobado} base={sumaAprobado} C={C} grande /> : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.slate, margin: "8px 0 0" }}>
                <span><b style={{ color: VERDE.fg }}>▼ Verde</b>: costó menos de lo aprobado</span>
                <span><b style={{ color: ROJO.fg }}>▲ Rojo</b>: costó más (la fila se tiñe si pasa del 5 %)</span>
                <span><b>＝ Gris</b>: igual</span>
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "12px 0", fontSize: 13 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={quitarImprevistos} onChange={(e) => setQuitarImprevistos(e.target.checked)} />Quitar el 10 % de imprevistos (lo real de Busint ya trae lo que se gastó)</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={ponerEnCero} onChange={(e) => setPonerEnCero(e.target.checked)} />Poner en $0 las líneas de la cotización que Busint no trae en este lote</label>
              </div>
              {muchosNuevos && (
                <div style={{ background: C.redBg, color: ROJO.fg, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                  <b>Revisa el emparejamiento antes de usar este lote.</b> {nNuevos} {nNuevos === 1 ? "concepto de Busint quedó" : "conceptos de Busint quedaron"} como «nuevo» y {sinDatoFilas.length} {sinDatoFilas.length === 1 ? "línea de la cotización sigue" : "líneas de la cotización siguen"} sin dato de Busint: probablemente son lo mismo con otro nombre. Elígelos en la lista «Va en la cotización»; si no, el costo definitivo suma líneas duplicadas.
                </div>
              )}
              {resultado && (() => {
                const difCosto = costoAprobado != null ? resultado.costoDefinitivo - costoAprobado : null;
                const difPrecio = precioAprobado > 0 && precioConReales > 0 ? precioConReales - precioAprobado : null;
                const tarjeta = { flex: "1 1 280px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px" };
                const etiq = { fontSize: 12, color: C.slate, marginBottom: 6 };
                const fila = { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" };
                const descuadre = Math.abs(resultado.costoDefinitivo - resultado.realPorPrenda) > 1;
                return (
                  <>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={tarjeta}>
                        <div style={etiq}>Costo definitivo por prenda</div>
                        <div style={fila}><span style={{ fontSize: 13, color: C.slate }}>Aprobado {costoAprobado != null ? pesos(costoAprobado) : "—"}</span><span style={{ color: C.slate }}>→</span><span style={{ fontSize: 24, fontWeight: 800 }}>{pesos(resultado.costoDefinitivo)}</span></div>
                        <div style={{ marginTop: 8 }}><Pildora dif={difCosto} base={costoAprobado} C={C} grande /></div>
                        <div style={{ fontSize: 12, color: C.slate, marginTop: 6 }}>{difCosto == null || Math.abs(difCosto) < 0.5 ? "Igual a lo aprobado." : difCosto < 0 ? "Costó menos de lo aprobado." : "Costó más de lo aprobado."}</div>
                      </div>
                      {difPrecio != null && (
                        <div style={tarjeta}>
                          <div style={etiq}>Precio de venta con IVA</div>
                          <div style={fila}><span style={{ fontSize: 13, color: C.slate }}>Aprobado, fijo {pesos(precioAprobado)}</span><span style={{ color: C.slate }}>→</span><span style={{ fontSize: 24, fontWeight: 800 }}>{pesos(precioConReales)}</span></div>
                          <div style={{ marginTop: 8 }}><Pildora dif={difPrecio} base={precioAprobado} C={C} grande /></div>
                          <div style={{ fontSize: 12, color: C.slate, marginTop: 6 }}>{Math.abs(difPrecio) < 0.5 ? "Con los costos reales el precio no cambia." : difPrecio < 0 ? "Con los costos reales el margen mejora; el precio aprobado no cambia." : "Con los costos reales el precio aprobado queda corto; el precio aprobado no cambia."}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>Real de Busint por prenda (suma de los conceptos): {pesos(resultado.realPorPrenda)}</div>
                    {resultado.sinDatoBusint.length > 0 && (
                      <div style={{ background: C.amberBg, color: "#8A5A12", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
                        <b>Busint no trajo {resultado.sinDatoBusint.length} {resultado.sinDatoBusint.length === 1 ? "línea" : "líneas"} de la cotización:</b> {resultado.sinDatoBusint.join(" · ")}. {ponerEnCero ? "Quedarán en $0." : "Se dejan como estaban; el costo definitivo las suma (marca la casilla de arriba si quieres ponerlas en $0)."}
                      </div>
                    )}
                    {descuadre && resultado.sinDatoBusint.length === 0 && (
                      <div style={{ background: C.amberBg, color: "#8A5A12", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 10 }}>
                        El costo definitivo que quedaría ({pesos(resultado.costoDefinitivo)}) no coincide con el real de Busint ({pesos(resultado.realPorPrenda)}). Revisa las líneas marcadas en naranja o las opciones de arriba.
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCerrar} style={btn(C.white, C.slate, C.border)}>Cerrar</button>
          <button
            disabled={!resultado}
            onClick={() => { if (muchosNuevos && !window.confirm("Hay conceptos de Busint como «nuevos» y líneas de la cotización sin dato: el costo definitivo puede quedar con líneas duplicadas.\n\n¿Usar este lote de todas formas?")) return; onAplicar(resultado.v, { lote: lote.numLote, fechaCumplido: lote.fechaISO || null, cantCortada: cant, realPorPrenda: resultado.realPorPrenda, costoDefinitivo: resultado.costoDefinitivo, quitoImprevistos: quitarImprevistos }); }}
            style={{ ...btn(C.green, C.white), opacity: resultado ? 1 : 0.5 }}
          >
            Usar este lote
          </button>
        </div>
      </div>
    </div>
  );
}
