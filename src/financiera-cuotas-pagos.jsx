// ─── FINANCIERA · Cuotas: pagado / falta y liquidaciones de retiro ───────────────────────────────────────────────
// (2026-11-06, a pedido de Fredy) Dos cosas en la tabla de cuotas de «Cuánto debo pagar»:
//   · Cada cuota se puede marcar PAGADA a mano en el mes (completa o con un pago parcial): guarda `contabilidad_cuotas_pagos/{cuotaId}__{AAAA-MM}`
//     { pagado }. No cambia la cuota: «Necesito al mes» sigue siendo la base; lo pagado solo baja lo que FALTA.
//   · Fila de «Liquidaciones de retiro»: el pendiente total sale solo de Nómina (liquidaciones «No pagadas»); el plan del mes (cuánto se piensa pagar este mes)
//     se escribe a mano y entra al cálculo como una cuota más (`contabilidad_cuotas_pagos/plan_liquidaciones__{AAAA-MM}` { plan, pagadoManual }); lo pagado del mes
//     sale de las liquidaciones marcadas «Pagada» ese mes en Nómina (guardan `pagadaEn`), o se escribe a mano.
// La colección empieza por «contabilidad_» a propósito: así ya queda cubierta por las reglas de Firestore que ocultan lo interno a los usuarios Cliente.
import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";

export const COL_PAGOS_CUOTAS = "contabilidad_cuotas_pagos";
const C = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", amber: "#C47C1A", amberBg: "#FDF5E6", blue: "#3D6B9E" };
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesCorto = (ym) => `${MESES[Number(String(ym).slice(5, 7)) - 1]} ${String(ym).slice(0, 4)}`;
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "9px 8px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left", fontWeight: 700 };
const btn = { border: `1.5px solid ${C.border}`, background: C.white, borderRadius: 8, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: C.ink };

// Pagos de cuotas del mes + plan de liquidaciones (colección contabilidad_cuotas_pagos) y liquidaciones de retiro de Nómina.
export function useCuotasPagos(db) {
  const [pagos, setPagos] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  useEffect(() => onSnapshot(collection(db, COL_PAGOS_CUOTAS), (s) => setPagos(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db]);
  useEffect(() => onSnapshot(collection(db, "nomina_liquidaciones_retiro"), (s) => setLiquidaciones(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db]);
  const mapa = useMemo(() => { const o = {}; pagos.forEach((p) => { o[p.id] = p; }); return o; }, [pagos]);
  return { pagos, mapa, liquidaciones };
}

// Campo numérico con botón «Guardar»; solo escribe si cambió.
function EditorValor({ valor, onGuardar, ancho = 118 }) {
  const [txt, setTxt] = useState(String(Math.round(Number(valor) || 0)));
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setTxt(String(Math.round(Number(valor) || 0))); }, [valor]);
  const cambio = Math.round(Number(txt) || 0) !== Math.round(Number(valor) || 0);
  async function guardar() {
    setGuardando(true);
    try { await onGuardar(Math.max(0, Math.round(Number(txt) || 0))); } finally { setGuardando(false); }
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input type="number" min="0" value={txt} onChange={(e) => setTxt(e.target.value)} style={{ width: ancho, padding: "4px 6px", border: `1.5px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, textAlign: "right", fontFamily: "inherit" }} />
      {cambio ? <button onClick={guardar} disabled={guardando} style={{ ...btn, color: C.green }}>{guardando ? "…" : "Guardar"}</button> : null}
    </span>
  );
}

// cuotasLista = cuotas vigentes del mes (las manuales + la sintética de liquidaciones si ya hay plan). Se muestran las manuales y siempre la fila de liquidaciones.
export function TablaCuotasPago({ db, ym, cuotasLista, mapa, liquidaciones, puedeEditar, compacto }) {
  const manuales = (cuotasLista || []).filter((c) => !c.auto);
  const planDoc = mapa[`plan_liquidaciones__${ym}`] || null;
  const plan = Number(planDoc?.plan) || 0;
  const pendientes = (liquidaciones || []).filter((l) => l.estadoPago !== "pagada");
  const pendTotal = pendientes.reduce((s, l) => s + (Number(l.totalAPagar) || 0), 0);
  const pagadoAuto = (liquidaciones || []).filter((l) => l.estadoPago === "pagada" && String(l.pagadaEn || "").slice(0, 7) === ym).reduce((s, l) => s + (Number(l.totalAPagar) || 0), 0);
  const hayManual = planDoc && planDoc.pagadoManual !== undefined && planDoc.pagadoManual !== null && planDoc.pagadoManual !== "";
  const pagadoLiq = hayManual ? Number(planDoc.pagadoManual) || 0 : pagadoAuto;
  const [verPend, setVerPend] = useState(false);
  const [error, setError] = useState("");

  const pagoDe = (c) => Number(mapa[`${c.id}__${ym}`]?.pagado) || 0;
  async function guardarPago(c, valor) {
    setError("");
    try { await setDoc(doc(db, COL_PAGOS_CUOTAS, `${c.id}__${ym}`), { kind: "pago", cuotaId: c.id, ym, pagado: valor, actualizadoEn: new Date().toISOString() }); }
    catch (e) { setError(e?.message || "No se pudo guardar el pago."); }
  }
  async function guardarPlan(valor) {
    setError("");
    try { await setDoc(doc(db, COL_PAGOS_CUOTAS, `plan_liquidaciones__${ym}`), { kind: "plan_liquidaciones", ym, plan: valor, actualizadoEn: new Date().toISOString() }, { merge: true }); }
    catch (e) { setError(e?.message || "No se pudo guardar el plan."); }
  }
  async function guardarPagadoLiq(valor) {
    setError("");
    try { await setDoc(doc(db, COL_PAGOS_CUOTAS, `plan_liquidaciones__${ym}`), { kind: "plan_liquidaciones", ym, pagadoManual: valor, actualizadoEn: new Date().toISOString() }, { merge: true }); }
    catch (e) { setError(e?.message || "No se pudo guardar lo pagado."); }
  }
  async function volverAutomatico() {
    setError("");
    try { await setDoc(doc(db, COL_PAGOS_CUOTAS, `plan_liquidaciones__${ym}`), { pagadoManual: deleteField() }, { merge: true }); }
    catch (e) { setError(e?.message || "No se pudo volver a automático."); }
  }

  const totValor = manuales.reduce((s, c) => s + (Number(c.valorMensual) || 0), 0) + plan;
  const totPagado = manuales.reduce((s, c) => s + pagoDe(c), 0) + pagadoLiq;
  const totFalta = manuales.reduce((s, c) => s + Math.max(0, (Number(c.valorMensual) || 0) - pagoDe(c)), 0) + Math.max(0, plan - pagadoLiq);
  const avisoManualLiq = manuales.some((c) => /liquidaci/i.test(String(c.nombre || "")));

  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8, fontSize: 12.5, color: C.slate }}>
        <span>Cuotas y liquidaciones: <b style={{ color: C.green }}>pagado {money(totPagado)}</b> · <b style={{ color: totFalta > 0 ? C.red : C.green }}>falta {money(totFalta)}</b> de {money(totValor)}</span>
      </div>
      {error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "7px 10px", fontSize: 12, marginBottom: 8 }}>{error}</div> : null}
      {avisoManualLiq ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 8, padding: "7px 10px", fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>Tienes una cuota manual de liquidaciones además de la fila automática de abajo: si cuentan lo mismo, bórrala en «Endeudamiento» para no sumarlo dos veces.</div> : null}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: C.white }}>
          <thead>
            <tr>
              <th style={thL}>Cuota</th><th style={th}>Valor mensual</th><th style={th}>Se paga</th>{compacto ? null : <th style={th}>Termina</th>}<th style={th}>Pagado</th><th style={th}>Falta</th>{puedeEditar ? <th style={th} /> : null}
            </tr>
          </thead>
          <tbody>
            {manuales.map((c) => {
              const val = Number(c.valorMensual) || 0;
              const pag = pagoDe(c);
              const completa = pag >= val && val > 0;
              return (
                <tr key={c.id} style={{ background: completa ? C.greenBg : undefined }}>
                  <td style={tdL}><span style={{ textDecoration: completa ? "line-through" : "none" }}>{c.nombre}</span>{c.acreedor ? <div style={{ fontSize: 11, fontWeight: 500, color: C.slate }}>{c.acreedor}</div> : null}</td>
                  <td style={td}>{money(val)}</td>
                  <td style={td}>{c.diaPago ? `día ${c.diaPago}` : "—"}</td>
                  {compacto ? null : <td style={td}>{c.hasta ? mesCorto(c.hasta) : "Sin fecha"}</td>}
                  <td style={{ ...td, color: pag > 0 ? C.green : C.slate, fontWeight: 700 }}>{puedeEditar ? <EditorValor valor={pag} onGuardar={(v) => guardarPago(c, v)} /> : money(pag)}</td>
                  <td style={{ ...td, color: val - pag > 0 ? C.red : C.green, fontWeight: 800 }}>{completa ? "✓ Pagada" : money(Math.max(0, val - pag))}</td>
                  {puedeEditar ? <td style={td}>{!completa ? <button style={btn} onClick={() => guardarPago(c, val)}>Marcar pagada</button> : <button style={btn} onClick={() => guardarPago(c, 0)}>Deshacer</button>}</td> : null}
                </tr>
              );
            })}
            <tr style={{ background: C.canvas }}>
              <td style={tdL}>
                Liquidaciones de retiro
                <div style={{ fontSize: 11, fontWeight: 500, color: C.slate }}>
                  Pendiente en Nómina: {money(pendTotal)} ({pendientes.length} {pendientes.length === 1 ? "persona" : "personas"}){" "}
                  {pendientes.length ? <button onClick={() => setVerPend(!verPend)} style={{ ...btn, padding: "1px 7px", fontSize: 10.5 }}>{verPend ? "ocultar" : "ver quién"}</button> : null}
                </div>
              </td>
              <td style={td}>{puedeEditar ? <EditorValor valor={plan} onGuardar={guardarPlan} /> : money(plan)}<div style={{ fontSize: 10.5, color: C.slate, fontWeight: 500 }}>plan de {mesCorto(ym)}</div></td>
              <td style={td}>día 25</td>
              {compacto ? null : <td style={td}>—</td>}
              <td style={{ ...td, color: pagadoLiq > 0 ? C.green : C.slate, fontWeight: 700 }}>
                {puedeEditar ? <EditorValor valor={pagadoLiq} onGuardar={guardarPagadoLiq} /> : money(pagadoLiq)}
                <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 500 }}>{hayManual ? "a mano" : "según Nómina (marcadas «Pagada» este mes)"}</div>
              </td>
              <td style={{ ...td, color: plan - pagadoLiq > 0 ? C.red : C.green, fontWeight: 800 }}>{plan > 0 && pagadoLiq >= plan ? "✓ Cubierto" : money(Math.max(0, plan - pagadoLiq))}</td>
              {puedeEditar ? <td style={td}>{hayManual ? <button style={btn} onClick={volverAutomatico}>Usar Nómina</button> : null}</td> : null}
            </tr>
            {verPend ? (
              <tr><td colSpan={compacto ? (puedeEditar ? 6 : 5) : (puedeEditar ? 7 : 6)} style={{ ...td, textAlign: "left", background: C.white, whiteSpace: "normal" }}>
                {pendientes.slice().sort((a, b) => (Number(b.totalAPagar) || 0) - (Number(a.totalAPagar) || 0)).map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, padding: "2px 0" }}><span>{l.nombre || "—"}</span><b>{money(l.totalAPagar)}</b></div>
                ))}
              </td></tr>
            ) : null}
            <tr style={{ background: C.canvas }}>
              <td style={{ ...tdL }}>Total</td><td style={{ ...td, fontWeight: 900 }}>{money(totValor)}</td><td style={td} />{compacto ? null : <td style={td} />}<td style={{ ...td, fontWeight: 900, color: C.green }}>{money(totPagado)}</td><td style={{ ...td, fontWeight: 900, color: totFalta > 0 ? C.red : C.green }}>{money(totFalta)}</td>{puedeEditar ? <td style={td} /> : null}
            </tr>
          </tbody>
        </table>
      </div>
      {!plan && puedeEditar ? <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>Escribe en «Valor mensual» de liquidaciones cuánto piensas pagar de liquidaciones este mes: ese valor entra a «Necesito al mes» como una cuota más.</div> : null}
    </div>
  );
}
