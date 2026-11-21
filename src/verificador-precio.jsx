// ─── VERIFICADOR DE PRECIO (Planta Yanko y Mi Día) ───────────────────────────────────────────────────────────────
// (2026-11-21, a pedido de Fredy) Busca una referencia o un número de lote y compara, EN VIVO desde Busint, el valor teórico de la mano de obra
// de Confección y Corte contra el real, con el precio por unidad de la ficha. Usa la misma función que ya usa Planeación → Talleres
// (getVerificadorPrecioBusintGen: tabla «lotes cumplidos teorico vs real valor» + «insumos dig»); no escribe nada.
// Quién lo ve lo decide el permiso «planta_verificador_precio» (pantalla de Roles); el que lo muestra (Programación Diaria de Planta Yanko y la
// tarjeta «Verificador de precio» de Mi Día) revisa ese permiso antes de montarlo.
import React, { useEffect, useMemo, useState } from "react";
import { getApps } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const C = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6" };
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => (Number(n) < 0 ? "-$" : "$") + fmtNum(Math.abs(Number(n) || 0));
const fmtFecha = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
// Busint a veces guarda la misma referencia con o sin guion (96-1189 / 961189).
const normalizar = (v) => String(v || "").trim().toUpperCase().replace(/[-\s]/g, "");
const NOMBRE_PROCESO = { CONFECCION: "Confección", CORTE: "Corte" };

// Lo traído de Busint se queda en memoria mientras la pestaña esté abierta: abrir el verificador otra vez es instantáneo.
let cacheBusint = null; // { filas, generadoEn }

const th = { padding: "8px 10px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function Chip({ activo, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.ink, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>
  );
}

export default function VerificadorPrecioPlanta({ busquedaInicial = "" }) {
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [proceso, setProceso] = useState("todos");
  const [datos, setDatos] = useState(cacheBusint);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function traer() {
    setCargando(true);
    setError("");
    try {
      const functionsClient = getFunctions(getApps()[0]);
      const resp = await httpsCallable(functionsClient, "getVerificadorPrecioBusintGen", { timeout: 540000 })();
      cacheBusint = { filas: resp.data?.filas || [], generadoEn: resp.data?.generadoEn || new Date().toISOString() };
      setDatos(cacheBusint);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { if (!cacheBusint) traer(); }, []);

  const q = normalizar(busqueda);
  const qLote = busqueda.trim();
  const filas = useMemo(() => {
    if (!datos || !q) return [];
    return datos.filas
      .filter((f) => (normalizar(f.ref) === q || String(f.numLote ?? "").trim() === qLote) && (proceso === "todos" || f.proceso === proceso))
      .sort((a, b) => (b.fechaISO || "").localeCompare(a.fechaISO || "") || String(b.numLote ?? "").localeCompare(String(a.numLote ?? "")))
      .slice(0, 80);
  }, [datos, q, qLote, proceso]);

  const resumen = useMemo(() => {
    const lotes = new Set(filas.map((f) => String(f.numLote ?? "")));
    const sum = (k) => filas.reduce((s, f) => s + (Number(f[k]) || 0), 0);
    // Precio por unidad de la ficha de cada proceso: el de la fila más reciente que lo traiga.
    const precios = {};
    filas.forEach((f) => { if (f.precioUnidad != null && precios[f.proceso] === undefined) precios[f.proceso] = Number(f.precioUnidad); });
    const conDiferencia = filas.filter((f) => Math.abs(Number(f.difer) || 0) >= 1).length;
    return { lotes: lotes.size, teorico: sum("teorico"), real: sum("real"), difer: sum("difer"), precios, conDiferencia };
  }, [filas]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: "1 1 420px", fontSize: 12.5, color: C.slate, lineHeight: 1.55, maxWidth: 680 }}>
          Escribe una referencia o un número de lote para ver lo que Busint tiene de la mano de obra de <b>Confección</b> y <b>Corte</b>: el valor teórico contra el real que se pagó, por lote, y el precio por unidad de la ficha. Lo que no coincide sale en rojo.
        </div>
        <button type="button" onClick={traer} disabled={cargando} title="Vuelve a consultar Busint (tarda unos segundos)" style={{ padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, color: C.ink, fontSize: 12.5, fontWeight: 700, cursor: cargando ? "default" : "pointer", whiteSpace: "nowrap", fontFamily: "inherit", opacity: cargando ? 0.6 : 1 }}>
          {cargando ? "Consultando Busint…" : "🔄 Traer desde Busint"}
        </button>
      </div>
      {error ? <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${C.red}`, fontSize: 12.5, color: C.red }}>⚠ No se pudo traer de Busint: {error}</div> : null}
      {datos && !error ? <div style={{ marginBottom: 12, fontSize: 11.5, color: C.slate }}>✓ {fmtNum(datos.filas.length)} filas de Confección y Corte traídas de Busint ({fmtFecha((datos.generadoEn || "").slice(0, 10))}).</div> : null}
      {!datos && cargando ? <div style={{ marginBottom: 12, fontSize: 12.5, color: C.slate }}>Consultando Busint por primera vez… puede tardar unos segundos.</div> : null}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Referencia o lote (ej. 76-101 o 7225)"
          aria-label="Referencia o número de lote"
          autoFocus
          style={{ width: 300, maxWidth: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.ink, background: C.white, fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <Chip activo={proceso === "todos"} onClick={() => setProceso("todos")}>Todos</Chip>
        <Chip activo={proceso === "CONFECCION"} onClick={() => setProceso("CONFECCION")}>Confección</Chip>
        <Chip activo={proceso === "CORTE"} onClick={() => setProceso("CORTE")}>Corte</Chip>
      </div>

      {!q ? (
        <div style={{ textAlign: "center", padding: 36, color: C.slate, fontSize: 13, background: C.canvas, borderRadius: 12, border: `1px dashed ${C.border}` }}>Escribe una referencia o un lote para ver su precio.</div>
      ) : !datos ? null : !filas.length ? (
        <div style={{ textAlign: "center", padding: 36, color: C.slate, fontSize: 13, background: C.canvas, borderRadius: 12, border: `1px dashed ${C.border}` }}>Busint no tiene mano de obra de Confección o Corte registrada para «{busqueda.trim()}». Revisa la referencia (con o sin guion) o el número de lote.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.keys(resumen.precios).length ? (
              <div style={{ flex: "1 1 200px", background: C.blueBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3 }}>Precio por unidad (ficha)</div>
                {Object.entries(resumen.precios).map(([p, v]) => <div key={p} style={{ fontSize: 17, fontWeight: 900, color: C.blue }}>{NOMBRE_PROCESO[p] || p} {money(v)}</div>)}
              </div>
            ) : null}
            <div style={{ flex: "1 1 200px", background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3 }}>Teórico → real ({resumen.lotes} {resumen.lotes === 1 ? "lote" : "lotes"})</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.ink }}>{money(resumen.teorico)} → {money(resumen.real)}</div>
            </div>
            <div style={{ flex: "1 1 200px", background: resumen.conDiferencia ? C.redBg : C.greenBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3 }}>Diferencia</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: resumen.conDiferencia ? C.red : C.green }}>{money(resumen.difer)}</div>
              <div style={{ fontSize: 11.5, color: C.slate }}>{resumen.conDiferencia ? `${resumen.conDiferencia} ${resumen.conDiferencia === 1 ? "fila no coincide" : "filas no coinciden"}` : "Todo coincide"}</div>
            </div>
          </div>
          <div style={{ overflowX: "auto", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Fecha</th><th style={{ ...th, textAlign: "left" }}>Lote</th><th style={{ ...th, textAlign: "left" }}>Referencia</th><th style={{ ...th, textAlign: "left" }}>Proceso</th>
                  <th style={th}>Planta</th><th style={th}>Precio unidad</th><th style={th}>Teórico</th><th style={th}>Real</th><th style={th}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const dif = Number(f.difer) || 0;
                  return (
                    <tr key={`${f.numLote}-${f.proceso}-${f.fechaISO}-${i}`}>
                      <td style={{ ...td, textAlign: "left" }}>{fmtFecha(f.fechaISO)}</td>
                      <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{f.numLote ?? "—"}</td>
                      <td style={{ ...td, textAlign: "left" }}>{f.ref}</td>
                      <td style={{ ...td, textAlign: "left" }}>{NOMBRE_PROCESO[f.proceso] || f.proceso}</td>
                      <td style={td}>{f.emp == null || f.emp === "" ? "—" : String(f.emp)}</td>
                      <td style={td}>{f.precioUnidad == null ? "—" : money(f.precioUnidad)}</td>
                      <td style={td}>{money(f.teorico)}</td>
                      <td style={td}>{money(f.real)}</td>
                      <td style={{ ...td, fontWeight: 800, color: Math.abs(dif) >= 1 ? C.red : C.green }}>{money(dif)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, color: C.slate, lineHeight: 1.5 }}>
            Una diferencia no siempre es de precio: si se enviaron más prendas de las que se pagaron, el real baja al mismo precio por unidad. Se muestran los últimos {filas.length === 80 ? "80 movimientos" : `${filas.length} ${filas.length === 1 ? "movimiento" : "movimientos"}`}.
          </div>
        </>
      )}
    </div>
  );
}
