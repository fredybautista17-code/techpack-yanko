// ─── «Tarifa para cotizar» dentro de Cronograma de Muestras → 💲 Costos ───────────────────────────────────────────
// (2026-11-26, a pedido de Fredy: «que se autocalcule siempre») Costo de muestras ÷ prendas cortadas de los últimos meses CERRADOS = valor por
// prenda (tipo CIF). Lo calcula SOLA una función del servidor todos los días (3:00 a. m.) y escribe solo el número en cotizador_tarifas/muestras;
// el Cotizador lo usa como «Área de muestras» (aparte de «Área de diseño»). Aquí se ve cómo sale el cálculo, se elige la base y se puede pedir «Recalcular ahora».
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { costosDelMes } from "./muestras-calculo";
import { prendasCortadasPorMes, calcularTarifaMuestras, tarifaVigente, mesesDeTarifa, mesCorto, periodoTarifa, ultimoMesCerrado, BASES_TARIFA } from "./muestras-tarifa";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", red: "#E85D4A", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#6B4FA0", violetBg: "#F1ECF8",
};
const money = (n) => (n === null || n === undefined || Number.isNaN(n) ? "—" : `$${Math.round(n).toLocaleString("es-CO")}`);
const miles = (n) => Math.round(n || 0).toLocaleString("es-CO");
const chip = (on) => ({ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${on ? C.ink : C.border}`, background: on ? C.ink : C.white, color: on ? C.white : C.slate, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" });
const fechaHora = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); };

export default function TarifaMuestrasCard({ db, muestras, cfg, pagos }) {
  const [pedidos, setPedidos] = useState(null); // null = leyendo los cortes
  const [errCortes, setErrCortes] = useState(false);
  const [pub, setPub] = useState(undefined); // undefined = leyendo; null = todavía no hay nada calculado
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const base = cfg && cfg.tarifaBase === "mes" ? "mes" : "prom3";
  const mesCerrado = ultimoMesCerrado(new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }));

  useEffect(() => {
    let vivo = true;
    getDocs(collection(db, "pedidos_activos"))
      .then((s) => { if (vivo) setPedidos(s.docs.map((d) => d.data())); })
      .catch(() => { if (vivo) { setPedidos([]); setErrCortes(true); } });
    const u = onSnapshot(doc(db, "cotizador_tarifas", "muestras"), (s) => setPub(s.exists() ? s.data() : null), () => setPub(null));
    return () => { vivo = false; u(); };
  }, [db]);

  const prendasPorMes = useMemo(() => prendasCortadasPorMes(pedidos), [pedidos]);
  const calc = useMemo(() => {
    const costoPorMes = {};
    mesesDeTarifa(mesCerrado, base).forEach((m) => { costoPorMes[m] = costosDelMes(muestras, cfg || {}, pagos || {}, m).total; });
    return calcularTarifaMuestras({ mes: mesCerrado, modo: base, costoPorMes, prendasPorMes });
  }, [muestras, cfg, pagos, mesCerrado, base, prendasPorMes]);
  const vigente = tarifaVigente(pub);
  const aldia = !!(vigente && calc.valor && vigente.valorPorPrenda === calc.valor);

  async function recalcular() {
    setOcupado(true); setMsg("");
    try {
      const r = (await httpsCallable(getFunctions(db.app), "recalcularTarifaMuestrasAhora")({})).data || {};
      setMsg(r.ok ? `Recalculada: ${money(r.valorPorPrenda)} por prenda. El Cotizador ya la usa en las cotizaciones nuevas.` : `No se pudo calcular: ${r.aviso || "faltan datos"}.`);
    } catch (e) { setMsg(`No se pudo recalcular: ${e?.message || e}`); }
    setOcupado(false);
  }
  async function elegirBase(b) {
    if (b === base) return;
    setMsg("");
    try { await setDoc(doc(db, "centro_costo_muestras", "main"), { tarifaBase: b }, { merge: true }); } catch (e) { setMsg(`No se pudo guardar la base: ${e?.message || e}`); return; }
    await recalcular();
  }

  const leyendo = pedidos === null;
  const caja = { background: C.canvas, borderRadius: 12, padding: "12px 14px" };
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }} data-testid="tarifa-muestras">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.slate }}>Tarifa para cotizar (tipo CIF) · se calcula sola</h3>
          <p style={{ fontSize: 12, color: C.slate, margin: "0 0 12px", maxWidth: 660, lineHeight: 1.5 }}>
            El costo de muestras se reparte entre las prendas cortadas en los <strong>meses ya cerrados</strong>. El sistema la recalcula solo todos los días a las 3:00 a. m. y el Cotizador suma <strong>un solo valor por prenda</strong> («Área de muestras», aparte de «Área de diseño»); quien cotiza no ve sueldos ni talleres.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.keys(BASES_TARIFA).map((k) => <button key={k} style={chip(base === k)} disabled={ocupado} onClick={() => elegirBase(k)}>{k === "mes" ? `Último mes cerrado (${mesCorto(mesCerrado)})` : BASES_TARIFA[k]}</button>)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 12 }}>
        <div style={caja}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate }}>COSTO DE MUESTRAS</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(calc.costo)}</div>
          <div style={{ fontSize: 11.5, color: C.slate }}>{base === "prom3" ? "suma de los 3 meses cerrados" : "del último mes cerrado"}</div>
        </div>
        <div style={caja}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate }}>PRENDAS CORTADAS</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{leyendo ? "…" : miles(calc.prendas)}</div>
          <div style={{ fontSize: 11.5, color: C.slate }}>{leyendo ? "leyendo cortes…" : "según el módulo de Corte"}</div>
        </div>
        <div style={{ background: C.violetBg, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.violet }}>VALOR POR PRENDA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.violet, fontVariantNumeric: "tabular-nums" }} data-testid="tarifa-valor">{calc.valor ? money(calc.valor) : "—"}</div>
          <div style={{ fontSize: 11.5, color: C.violet }}>{calc.valor ? `${money(calc.costo)} ÷ ${miles(calc.prendas)}` : "sin datos para calcular"}</div>
        </div>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr>{["Mes cerrado", "Costo de muestras", "Prendas cortadas"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", fontSize: 10.5, fontWeight: 800, color: C.slate, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>{calc.meses.map((f) => (
            <tr key={f.mes}><td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}` }}>{mesCorto(f.mes)}</td><td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(f.costo)}</td><td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{leyendo ? "…" : miles(f.prendas)}</td></tr>
          ))}</tbody>
        </table>
      </div>

      {errCortes && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>No se pudieron leer los cortes para mostrar el cálculo; el servidor sí los lee al recalcular.</div>}
      {calc.aviso && !leyendo && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>{calc.aviso}</div>}
      {pub && pub.aviso && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>El último recálculo del servidor no pudo calcular ({pub.aviso}); sigue rigiendo el valor anterior.</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <div style={{ flex: "1 1 280px", fontSize: 12.5, color: C.slate, lineHeight: 1.5 }} data-testid="tarifa-vigente">
          {pub === undefined ? "Leyendo la tarifa vigente…" : vigente
            ? <><strong style={{ color: C.ink }}>Vigente en el Cotizador: {money(vigente.valorPorPrenda)} por prenda</strong> ({periodoTarifa(vigente)}{vigente.calculadoEn ? `, calculada el ${fechaHora(vigente.calculadoEn)}` : vigente.publicadoEn ? `, publicada el ${fechaHora(vigente.publicadoEn)}` : ""}). {aldia ? "Coincide con el cálculo de arriba." : calc.valor ? "El cálculo de arriba es distinto: se actualiza en el próximo recálculo o con «Recalcular ahora»." : ""} Las cotizaciones ya guardadas no cambian; las nuevas, o con «Cargar ficha», sí.</>
            : "Todavía no hay tarifa calculada: el Cotizador usa el valor de «Área de muestras» de cada ficha (0 si no lo tiene) hasta el primer recálculo (esta noche a las 3:00 a. m., o ya con «Recalcular ahora»)."}
        </div>
        <button style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.violet}`, background: C.violet, color: C.white, fontWeight: 800, fontSize: 12.5, cursor: ocupado ? "default" : "pointer", fontFamily: "inherit", opacity: ocupado ? 0.6 : 1 }}
          disabled={ocupado} onClick={recalcular} data-testid="tarifa-recalcular">{ocupado ? "Recalculando…" : "↻ Recalcular ahora"}</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith("No se pudo") ? C.red : C.green, fontWeight: 700 }}>{msg}</div>}
    </div>
  );
}
