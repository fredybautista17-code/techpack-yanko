// ─── «Tarifa para cotizar» dentro de Cronograma de Muestras → 💲 Costos ───────────────────────────────────────────
// (2026-11-26, a pedido de Fredy) Costo de muestras del mes ÷ prendas cortadas del mes = valor por prenda (tipo CIF). Al publicarla,
// el Cotizador la usa como «Área de diseño y muestras». Solo se publica el número: sueldos y talleres no salen de esta pantalla.
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { costosDelMes } from "./muestras-calculo";
import { prendasCortadasPorMes, calcularTarifaMuestras, tarifaVigente, documentoTarifa, mesesDeTarifa, mesCorto, MODOS_TARIFA } from "./muestras-tarifa";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#6B4FA0", violetBg: "#F1ECF8",
};
const money = (n) => (n === null || n === undefined || Number.isNaN(n) ? "—" : `$${Math.round(n).toLocaleString("es-CO")}`);
const miles = (n) => Math.round(n || 0).toLocaleString("es-CO");
const chip = (on) => ({ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${on ? C.ink : C.border}`, background: on ? C.ink : C.white, color: on ? C.white : C.slate, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" });
const fechaCorta = (iso) => { const f = String(iso || "").slice(0, 10); const [y, m, d] = f.split("-"); return d ? `${d}/${m}/${y}` : ""; };

export default function TarifaMuestrasCard({ db, muestras, cfg, pagos, mes, usuarioNombre, enCurso }) {
  const [pedidos, setPedidos] = useState(null); // null = leyendo los cortes
  const [errCortes, setErrCortes] = useState(false);
  const [pub, setPub] = useState(undefined); // undefined = leyendo; null = nada publicado
  const [modo, setModo] = useState("mes");
  const [manual, setManual] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

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
    mesesDeTarifa(mes, modo).forEach((m) => { costoPorMes[m] = costosDelMes(muestras, cfg || {}, pagos || {}, m).total; });
    return calcularTarifaMuestras({ mes, modo, costoPorMes, prendasPorMes, prendasManual: manual });
  }, [muestras, cfg, pagos, mes, modo, prendasPorMes, manual]);
  const vigente = tarifaVigente(pub);
  const yaPublicada = !!(vigente && calc.valor && vigente.valorPorPrenda === calc.valor && vigente.mes === mes && vigente.modo === modo);

  async function publicar() {
    if (!calc.valor) return;
    setOcupado(true); setMsg("");
    try { await setDoc(doc(db, "cotizador_tarifas", "muestras"), documentoTarifa(calc, mes, usuarioNombre)); setMsg("Publicada: el Cotizador ya la usa en las cotizaciones nuevas."); }
    catch (e) { setMsg(`No se pudo publicar: ${e?.message || e}`); }
    setOcupado(false);
  }
  async function quitar() {
    if (!window.confirm("¿Quitar la tarifa publicada? El Cotizador vuelve al valor fijo de la ficha del cliente.")) return;
    setOcupado(true); setMsg("");
    try { await deleteDoc(doc(db, "cotizador_tarifas", "muestras")); setMsg("Tarifa quitada."); }
    catch (e) { setMsg(`No se pudo quitar: ${e?.message || e}`); }
    setOcupado(false);
  }

  const leyendo = pedidos === null;
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 }} data-testid="tarifa-muestras">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.slate }}>Tarifa para cotizar (tipo CIF)</h3>
          <p style={{ fontSize: 12, color: C.slate, margin: "0 0 12px", maxWidth: 640, lineHeight: 1.5 }}>
            El costo de muestras se reparte entre las prendas que se cortaron. Al publicarla, el Cotizador suma <strong>un solo valor por prenda</strong> («Área de diseño y muestras»); quien cotiza no ve sueldos ni talleres.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.keys(MODOS_TARIFA).map((k) => <button key={k} style={chip(modo === k)} onClick={() => setModo(k)}>{k === "mes" ? `Mes: ${mesCorto(mes)}` : MODOS_TARIFA[k]}</button>)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 12 }}>
        <div style={{ background: C.canvas, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate }}>COSTO DE MUESTRAS</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(calc.costo)}</div>
          <div style={{ fontSize: 11.5, color: C.slate }}>{modo === "prom3" ? "suma de los 3 meses" : "del mes elegido"}</div>
        </div>
        <div style={{ background: C.canvas, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate }}>PRENDAS CORTADAS</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{leyendo ? "…" : miles(calc.prendas)}</div>
          <div style={{ fontSize: 11.5, color: C.slate }}>{leyendo ? "leyendo cortes…" : calc.manual ? "escritas a mano" : "según el módulo de Corte"}</div>
        </div>
        <div style={{ background: C.violetBg, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.violet }}>VALOR POR PRENDA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.violet, fontVariantNumeric: "tabular-nums" }} data-testid="tarifa-valor">{calc.valor ? money(calc.valor) : "—"}</div>
          <div style={{ fontSize: 11.5, color: C.violet }}>{calc.valor ? `${money(calc.costo)} ÷ ${miles(calc.prendas)}` : "sin datos para calcular"}</div>
        </div>
      </div>

      {modo === "prom3" && (
        <div style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr>{["Mes", "Costo de muestras", "Prendas cortadas"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", fontSize: 10.5, fontWeight: 800, color: C.slate, padding: "6px 10px", borderBottom: `1px solid ${C.border}`, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>{calc.meses.map((f) => (
              <tr key={f.mes}><td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}` }}>{mesCorto(f.mes)}</td><td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(f.costo)}</td><td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{leyendo ? "…" : miles(f.prendas)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {modo === "mes" && !leyendo && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.slate, marginBottom: 12, flexWrap: "wrap" }}>
          ¿El corte no tiene datos de ese mes? Escribe las prendas a mano:
          <input type="text" inputMode="numeric" value={manual} placeholder="opcional" onChange={(e) => setManual(e.target.value.replace(/[^\d]/g, ""))} style={{ width: 100, padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", textAlign: "right" }} />
        </label>
      )}

      {errCortes && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>No se pudieron leer los cortes; escribe las prendas a mano.</div>}
      {calc.aviso && !leyendo && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>{calc.aviso}</div>}
      {enCurso && modo === "mes" && <div style={{ background: C.blueBg, color: C.blue, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>Es el mes en curso: costo y prendas todavía están incompletos. Para una tarifa estable usa el promedio de 3 meses o publica cuando el mes cierre.</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        <div style={{ flex: "1 1 280px", fontSize: 12.5, color: C.slate, lineHeight: 1.5 }} data-testid="tarifa-vigente">
          {pub === undefined ? "Leyendo la tarifa publicada…" : vigente
            ? <><strong style={{ color: C.ink }}>Vigente en el Cotizador: {money(vigente.valorPorPrenda)} por prenda</strong> ({vigente.modo === "prom3" ? "promedio 3 meses hasta " : ""}{mesCorto(vigente.mes)}, publicada por {vigente.publicadoPor || "—"} el {fechaCorta(vigente.publicadoEn)}). Las cotizaciones ya guardadas no cambian; las nuevas, o con «Cargar ficha», sí.</>
            : "Todavía no hay tarifa publicada: el Cotizador usa el valor fijo de «Área de diseño y muestras» de cada ficha."}
        </div>
        {vigente && <button style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, color: C.ink, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }} disabled={ocupado} onClick={quitar}>Quitar tarifa</button>}
        <button style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${calc.valor && !yaPublicada ? C.violet : C.border}`, background: calc.valor && !yaPublicada ? C.violet : C.canvas, color: calc.valor && !yaPublicada ? C.white : C.slate, fontWeight: 800, fontSize: 12.5, cursor: calc.valor && !yaPublicada ? "pointer" : "default", fontFamily: "inherit" }}
          disabled={!calc.valor || yaPublicada || ocupado} onClick={publicar} data-testid="tarifa-publicar">
          {yaPublicada ? "Ya publicada" : vigente ? "Actualizar tarifa" : "Publicar tarifa al Cotizador"}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith("No se pudo") ? C.red : C.green, fontWeight: 700 }}>{msg}</div>}
    </div>
  );
}
