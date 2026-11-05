// ─── FINANCIERA · Ingresos (lo que pagan los clientes) ───────────────────────
// (2026-11-05, a pedido de Fredy) Trae de Busint los recibos de caja de los clientes (tablas pagos / pagos detalles): por mes, por cliente y
// por caja/banco, para ver cuánto entra frente a cuánto hay que pagar («Cuánto debo pagar»). Los traslados externos (consignación) se
// pueden sumar o no. Todo es lectura: lo único que se escribe es un resumen mensual en financiera_ingresos_cache, que lee «Cuánto debo pagar».
// PRIMERA VERSIÓN: el servidor detecta las columnas de las tablas de Busint; el panel «Diagnóstico» muestra qué encontró y las dos sumas
// (cabecera del recibo vs renglones aplicados) para validar un mes contra los extractos.
import React, { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#9E5B8F",
};
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const millones = (n) => `${Number(n) < 0 ? "-" : ""}$${(Math.abs(Number(n) || 0) / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
const etiquetaMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.white, position: "sticky", top: 0 };
const td = { padding: "8px 8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left", fontWeight: 700 };

function Boton({ children, onClick, variante = "claro", disabled, chico }) {
  const est = { claro: { background: C.white, color: C.ink, border: `1.5px solid ${C.border}` }, oscuro: { background: C.ink, color: C.white, border: `1.5px solid ${C.ink}` } }[variante];
  return <button onClick={onClick} disabled={disabled} style={{ ...est, borderRadius: 8, padding: chico ? "4px 10px" : "8px 14px", fontSize: chico ? 12 : 13, fontWeight: 700, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}
function Tarjeta({ titulo, valor, sub, oscura }) {
  return (
    <div style={{ flex: "1 1 200px", background: oscura ? C.ink : C.white, border: `1px solid ${oscura ? C.ink : C.border}`, borderRadius: 12, padding: "13px 16px", color: oscura ? C.white : C.ink }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: oscura ? C.seam : C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 23, fontWeight: 900, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11.5, color: oscura ? C.seam : C.slate, marginTop: 3, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}

export function IngresosView({ db, functionsClient, isAdmin }) {
  const [datos, setDatos] = useState(null); // respuesta completa del servidor (en memoria)
  const [cache, setCache] = useState(null); // resumen guardado { actualizadoEn, meses: [{ ym, total, traslados }] }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [incluirTras, setIncluirTras] = useState(false);
  const [vista, setVista] = useState("cliente"); // cliente | medio
  const [verTodos, setVerTodos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [verDiag, setVerDiag] = useState(false);

  useEffect(() => {
    const u = onSnapshot(doc(db, "financiera_ingresos_cache", "main"), (s) => setCache(s.exists() ? s.data() : null), () => {});
    return u;
  }, [db]);

  async function traer() {
    setCargando(true);
    setError("");
    try {
      const r = await httpsCallable(functionsClient, "getIngresosClientesBusint", { timeout: 540000 })({ meses: 13 });
      const d = r.data;
      setDatos(d);
      const resumen = d.meses.map((ym) => ({ ym, total: Math.round(d.clientes?.porMes?.[ym]?.total || 0), traslados: Math.round(d.traslados?.porMes?.[ym]?.total || 0) }));
      await setDoc(doc(db, "financiera_ingresos_cache", "main"), { actualizadoEn: new Date().toISOString(), meses: resumen });
    } catch (e) {
      setError(e?.message || "No se pudo traer los ingresos de Busint.");
    } finally {
      setCargando(false);
    }
  }

  const meses = datos?.meses || cache?.meses?.map((m) => m.ym) || [];
  const totalMes = (ym) => {
    if (datos) return (datos.clientes?.porMes?.[ym]?.total || 0) + (incluirTras ? datos.traslados?.porMes?.[ym]?.total || 0 : 0);
    const m = cache?.meses?.find((x) => x.ym === ym);
    return m ? m.total + (incluirTras ? m.traslados : 0) : 0;
  };
  const hoyYm = datos?.hoy ? datos.hoy.slice(0, 7) : meses[meses.length - 1] || "";
  const previos = meses.filter((m) => m < hoyYm); // meses completos
  const ultimo = previos[previos.length - 1];
  const prom = (n) => { const l = previos.slice(-n); return l.length ? l.reduce((s, m) => s + totalMes(m), 0) / l.length : 0; };

  // Detalle (solo cuando se trajo de Busint en esta sesión)
  const filasCliente = useMemo(() => {
    if (!datos) return [];
    const mapa = new Map();
    datos.meses.forEach((ym) => {
      [datos.clientes?.porMes?.[ym], incluirTras ? datos.traslados?.porMes?.[ym] : null].forEach((mm) => {
        if (!mm) return;
        Object.entries(mm.porCliente).forEach(([cod, v]) => {
          if (!mapa.has(cod)) mapa.set(cod, { cod, nombre: datos.nombres[cod] || `Cliente ${cod}`, porMes: {}, total: 0 });
          const f = mapa.get(cod);
          f.porMes[ym] = (f.porMes[ym] || 0) + v;
          f.total += v;
        });
      });
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [datos, incluirTras]);
  const filasMedio = useMemo(() => {
    if (!datos) return [];
    const mapa = new Map();
    datos.meses.forEach((ym) => {
      [datos.clientes?.porMes?.[ym], incluirTras ? datos.traslados?.porMes?.[ym] : null].forEach((mm) => {
        if (!mm) return;
        Object.entries(mm.porMedio).forEach(([nom, v]) => {
          if (!mapa.has(nom)) mapa.set(nom, { nombre: nom, porMes: {}, total: 0 });
          const f = mapa.get(nom);
          f.porMes[ym] = (f.porMes[ym] || 0) + v;
          f.total += v;
        });
      });
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [datos, incluirTras]);
  const filas = vista === "cliente" ? filasCliente : filasMedio;
  const q = busqueda.trim().toLowerCase();
  const filtradas = q ? filas.filter((f) => f.nombre.toLowerCase().includes(q)) : filas;
  const visibles = verTodos ? filtradas : filtradas.slice(0, 40);

  const maximo = Math.max(1, ...meses.map(totalMes));
  const quien = cache?.actualizadoEn ? new Date(cache.actualizadoEn).toLocaleString("es-CO") : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: C.ink }}>Ingresos de clientes</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, color: C.slate, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={incluirTras} onChange={(e) => setIncluirTras(e.target.checked)} /> Sumar traslados externos (consignación)
          </label>
          {isAdmin ? <Boton variante="oscuro" onClick={traer} disabled={cargando}>{cargando ? "Consultando Busint…" : "🔄 Traer desde Busint"}</Boton> : null}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14, maxWidth: 860, lineHeight: 1.5 }}>
        Lo que los clientes pagan (recibos de caja de cartera en Busint), por mes, por cliente y por caja o banco. Sirve para comparar lo que entra con lo que debes pagar al mes.
        {quien ? ` Último resumen guardado: ${quien}.` : " Todavía no hay datos: pulsa «Traer desde Busint»."}
        {!datos && cache ? " El detalle por cliente y banco aparece al traerlo de nuevo." : ""}
      </div>
      {error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{error}</div> : null}
      {datos?.avisos?.length ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 12 }}>{datos.avisos.join(" · ")}</div> : null}

      {meses.length ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Tarjeta oscura titulo={`Este mes (hasta hoy) · ${hoyYm ? etiquetaMes(hoyYm) : ""}`} valor={millones(totalMes(hoyYm))} sub="Lo que ha entrado en el mes corriente." />
            <Tarjeta titulo={`Mes anterior · ${ultimo ? etiquetaMes(ultimo) : "—"}`} valor={ultimo ? millones(totalMes(ultimo)) : "—"} />
            <Tarjeta titulo="Promedio 3 meses completos" valor={millones(prom(3))} sub="Meses anteriores al actual." />
            <Tarjeta titulo="Promedio 6 meses completos" valor={millones(prom(6))} />
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, minWidth: meses.length * 52 }}>
              {meses.map((ym) => {
                const v = totalMes(ym);
                return (
                  <div key={ym} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }} title={`${etiquetaMes(ym)}: ${money(v)}`}>
                    <div style={{ fontSize: 10, color: C.slate, marginBottom: 2 }}>{millones(v).replace(" M", "")}</div>
                    <div style={{ width: "70%", height: Math.max(2, (v / maximo) * 84), background: ym === hoyYm ? C.seam : C.green, borderRadius: "4px 4px 0 0" }} />
                    <div style={{ fontSize: 10.5, color: C.slate, marginTop: 4 }}>{etiquetaMes(ym)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>Cifras en millones de pesos. La barra clara es el mes en curso (incompleto).</div>
          </div>
        </>
      ) : null}

      {datos ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <Boton chico variante={vista === "cliente" ? "oscuro" : "claro"} onClick={() => setVista("cliente")}>Por cliente</Boton>
            <Boton chico variante={vista === "medio" ? "oscuro" : "claro"} onClick={() => setVista("medio")}>Por caja / banco</Boton>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" style={{ padding: "6px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", width: 200 }} />
            <div style={{ marginLeft: "auto" }}><Boton chico onClick={() => setVerDiag((v) => !v)}>{verDiag ? "Ocultar diagnóstico" : "🔎 Diagnóstico"}</Boton></div>
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxHeight: "60vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 34 }}>#</th>
                  <th style={thL}>{vista === "cliente" ? "Cliente" : "Caja / banco"}</th>
                  {datos.meses.map((ym) => <th key={ym} style={th}>{etiquetaMes(ym)}</th>)}
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={f.cod || f.nombre}>
                    <td style={{ ...td, color: C.slate }}>{i + 1}</td>
                    <td style={tdL}>{f.nombre}</td>
                    {datos.meses.map((ym) => <td key={ym} style={{ ...td, color: f.porMes[ym] ? C.ink : C.seam }}>{f.porMes[ym] ? money(f.porMes[ym]) : "—"}</td>)}
                    <td style={{ ...td, fontWeight: 900 }}>{money(f.total)}</td>
                  </tr>
                ))}
                <tr style={{ background: C.canvas }}>
                  <td style={td} />
                  <td style={tdL}>Total de los {filtradas.length} {vista === "cliente" ? "clientes" : "medios"}</td>
                  {datos.meses.map((ym) => <td key={ym} style={{ ...td, fontWeight: 800 }}>{money(filtradas.reduce((s, f) => s + (f.porMes[ym] || 0), 0))}</td>)}
                  <td style={{ ...td, fontWeight: 900 }}>{money(filtradas.reduce((s, f) => s + f.total, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {filtradas.length > 40 && !verTodos ? <div style={{ marginTop: 8 }}><Boton chico onClick={() => setVerTodos(true)}>Ver los {filtradas.length}</Boton></div> : null}
        </>
      ) : null}

      {verDiag && datos ? (
        <div style={{ marginTop: 14, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, color: C.ink, marginBottom: 4 }}>Diagnóstico (para validar contra los extractos)</div>
          <div>Columnas detectadas: {Object.entries(datos.clientes?.columnas || {}).map(([k, v]) => `${k}=${v || "—"}`).join(" · ")}</div>
          <div>Recibos leídos: {datos.clientes?.recibosCabecera} · anulados: {datos.clientes?.anuladas} · sin fecha: {datos.clientes?.sinFecha} · se usa el total de la {datos.clientes?.usaCabecera ? "cabecera del recibo" : "suma de los renglones"}.</div>
          <div style={{ marginTop: 6 }}>Por mes, total según la cabecera vs. según los renglones aplicados a facturas (si difieren, hay pagos sin aplicar o notas):</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", marginTop: 4 }}>
              <thead><tr><th style={thL}>Mes</th><th style={th}>Recibos</th><th style={th}>Cabecera</th><th style={th}>Renglones</th><th style={th}>Diferencia</th></tr></thead>
              <tbody>
                {datos.meses.map((ym) => { const m = datos.clientes?.porMes?.[ym]; if (!m) return null; return (
                  <tr key={ym}><td style={tdL}>{etiquetaMes(ym)}</td><td style={td}>{m.recibos}</td><td style={td}>{money(m.totalCabecera)}</td><td style={td}>{money(m.totalDetalles)}</td><td style={td}>{money(m.totalCabecera - m.totalDetalles)}</td></tr>
                ); })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8 }}>Tablas de Busint: {Object.entries(datos.diagnostico || {}).map(([k, v]) => (v ? `${k} (${v.filas} filas)` : `${k} (no disponible)`)).join(" · ")}</div>
          <div style={{ marginTop: 6, wordBreak: "break-word" }}>Columnas de «pagos»: {(datos.diagnostico?.pagos?.columnas || []).join(", ")}</div>
          <div style={{ wordBreak: "break-word" }}>Columnas de «pagos detalles»: {(datos.diagnostico?.pagosDetalles?.columnas || []).join(", ")}</div>
          <div style={{ wordBreak: "break-word" }}>Columnas de «bancos»: {(datos.diagnostico?.bancos?.columnas || []).join(", ")}</div>
        </div>
      ) : null}
    </div>
  );
}
