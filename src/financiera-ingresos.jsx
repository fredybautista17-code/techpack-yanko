// ─── FINANCIERA · Ingresos (lo que pagan los clientes) ───────────────────────
// (2026-11-05, a pedido de Fredy) Trae de Busint los recibos de caja de los clientes (tablas pagos / pagos detalles): por mes, por cliente y
// por caja/banco, para ver cuánto entra frente a cuánto hay que pagar («Cuánto debo pagar»). Los traslados externos (consignación) se
// pueden sumar o no. Todo es lectura: lo único que se escribe es un resumen mensual en financiera_ingresos_cache, que lee «Cuánto debo pagar».
// PRIMERA VERSIÓN: el servidor detecta las columnas de las tablas de Busint; el panel «Diagnóstico» muestra qué encontró y las dos sumas
// (cabecera del recibo vs renglones aplicados) para validar un mes contra los extractos.
import React, { useState, useEffect, useMemo } from "react";
import { doc, collection, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
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

// (2026-11-05) Fuentes: Busint (solo Yanko) y TNS (Yanko e Indutex). Cada una guarda su resumen en su propio documento de caché.
const FUENTES = {
  // Total Yanko = lo que entra por TNS (casi todo el ingreso) + traslados externos (consignación) que se facturan en Busint. Se arma en la pantalla con las dos funciones.
  total_yanko: { etiqueta: "Total Yanko (TNS + traslados Busint)", docId: "total_yanko", combinada: true, nombre: "TNS y Busint" },
  busint: { etiqueta: "Busint · Yanko (solo para cruzar)", docId: "main", funcion: "getIngresosClientesBusint", args: {}, nombre: "Busint" },
  tns_yanko: { etiqueta: "TNS · Yanko", docId: "tns_yanko", funcion: "getIngresosClientesTNS", args: { empresa: "yanko" }, nombre: "TNS (Yanko)" },
  tns_indutex: { etiqueta: "TNS · Indutex", docId: "tns_indutex", funcion: "getIngresosClientesTNS", args: { empresa: "indutex" }, nombre: "TNS (Indutex)" },
};

// Une TNS (cobros por cartera, caja y bancos) con los traslados externos de Busint (clientes que se facturan solo allá). Las llaves de cliente/medio llevan
// prefijo para no mezclar NIT de TNS con códigos de Busint.
function combinarTotalYanko(t, b) {
  const trasl = b && !b.error ? b.traslados : null;
  const porMes = {};
  t.meses.forEach((ym) => {
    const x = t.clientes?.porMes?.[ym] || {};
    const y = trasl?.porMes?.[ym] || null;
    const porCliente = {};
    Object.entries(x.porCliente || {}).forEach(([k, v]) => { porCliente[`tns:${k}`] = v; });
    Object.entries(y?.porCliente || {}).forEach(([k, v]) => { porCliente[`bus:${k}`] = v; });
    const porMedio = {};
    Object.entries(x.porMedio || {}).forEach(([k, v]) => { porMedio[`TNS · ${k}`] = v; });
    Object.entries(y?.porMedio || {}).forEach(([k, v]) => { porMedio[`Busint (traslado) · ${k}`] = v; });
    porMes[ym] = { ym, total: (x.total || 0) + (y?.total || 0), tnsTotal: x.total || 0, trasladosTotal: y?.total || 0, totalCajaBancos: x.totalCajaBancos || 0, porCliente, porMedio, recibosBus: y?.recibosDetalle || [], tnsDet: x.porClienteDetalle || {} };
  });
  const nombres = {};
  Object.entries(t.nombres || {}).forEach(([k, v]) => { nombres[`tns:${k}`] = v; });
  Object.entries(b?.nombres || {}).forEach(([k, v]) => { nombres[`bus:${k}`] = `${v} (traslado externo, Busint)`; });
  const avisos = [...(t.avisos || [])];
  if (!b || b.error) avisos.push(`Busint no respondió, así que no se sumaron los traslados externos${b?.error ? ` (${b.error})` : ""}.`);
  else if (!trasl) avisos.push("Busint no devolvió traslados externos (tabla «pagostras» vacía o no disponible): el total es solo TNS.");
  return { fuente: "total_yanko", hoy: t.hoy, meses: t.meses, sucursales: t.sucursales, clientes: { porMes }, traslados: null, nombres, avisos, diagnosticoTns: t.diagnosticoTns, hayTraslados: !!trasl };
}

// ─── Clasificar los ingresos de cada cliente por ítem del presupuesto ───────────
// (2026-11-05, a pedido de Fredy) Cada cobro de cliente que llega de TNS/Busint se clasifica en Nómina, Insumos, Tela o Maquinaria. Cada clasificación
// escribe/actualiza movimientos de ingreso en contabilidad_movimientos (id fijo: ing_<mes>_<cliente>_<ítem>), que es lo que suma «Presupuesto Clientes».
const CATS_CLASIF = ["Anticipo Nómina", "Anticipo Insumos", "Anticipo Tela", "Anticipo Maquinaria"];
const corto = (c) => c.replace("Anticipo ", "");
const slug = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const NO_APLICA = "__NA__";
// Clave estable del cliente entre pantallas: así «Total Yanko» y «TNS · Yanko» comparten la misma clasificación.
const claveClasif = (fuente, key) => {
  if (fuente === "total_yanko") return String(key).startsWith("bus:") ? String(key) : `tns-yanko:${String(key).replace(/^tns:/, "")}`;
  if (fuente === "tns_yanko") return `tns-yanko:${key}`;
  if (fuente === "tns_indutex") return `tns-indutex:${key}`;
  return null;
};
const finDeMes = (ym, hoy) => {
  const f = `${ym}-${String(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
  return hoy && f > hoy ? hoy : f;
};
const idMov = (ym, ck, cat) => `ing_${ym}_${slug(ck)}_${slug(cat)}`;
const idClasif = (ym, ck) => `${ym}__${slug(ck)}`;

function FilaClasificar({ fila, bloqueada, onGuardar }) {
  const [vals, setVals] = useState(() => Object.fromEntries(CATS_CLASIF.map((c) => [c, fila.items[c] ? String(fila.items[c]) : ""])));
  const [guardando, setGuardando] = useState(false);
  const suma = CATS_CLASIF.reduce((s, c) => s + (Number(vals[c]) || 0), 0);
  const resto = Math.round(fila.monto - suma);
  const excede = resto < -1;
  const completar = (c) => setVals((v) => ({ ...v, [c]: String(Math.max(0, Math.round((Number(v[c]) || 0) + resto))) }));
  const yaGuardado = CATS_CLASIF.reduce((s, c) => s + (fila.items[c] || 0), 0);
  const cambio = Math.round(suma) !== Math.round(yaGuardado);
  async function guardar() { setGuardando(true); try { await onGuardar(fila, vals); } finally { setGuardando(false); } }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${C.border}`, opacity: bloqueada ? 0.5 : 1 }}>
      <div style={{ width: 150 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{etiquetaMes(fila.ym)}</div>
        <div style={{ fontSize: 12, color: C.slate, fontVariantNumeric: "tabular-nums" }}>{money(fila.monto)}</div>
      </div>
      {CATS_CLASIF.map((c) => (
        <div key={c} style={{ width: 118 }}>
          <button type="button" disabled={bloqueada || resto <= 0} onClick={() => completar(c)} title="Poner aquí lo que falta por clasificar"
            style={{ fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, background: "none", border: "none", padding: 0, cursor: bloqueada || resto <= 0 ? "default" : "pointer", textDecoration: bloqueada || resto <= 0 ? "none" : "underline dotted" }}>{corto(c)}{c === "Anticipo Tela" ? " *" : ""}</button>
          <input type="number" min="0" disabled={bloqueada} value={vals[c]} onChange={(e) => setVals((v) => ({ ...v, [c]: e.target.value }))} placeholder="0"
            style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "5px 7px", border: `1.5px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }} />
        </div>
      ))}
      <div style={{ minWidth: 120, fontSize: 12, fontWeight: 800, color: excede ? C.red : resto > 1 ? C.amber : C.green }}>
        {excede ? `Se pasa por ${money(-resto)}` : resto > 1 ? `Sin clasificar ${money(resto)}` : "Todo clasificado"}
      </div>
      <Boton chico variante="oscuro" disabled={bloqueada || excede || guardando || !cambio} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</Boton>
    </div>
  );
}

function ClasificarIngresosModal({ filas, soloCk, clientesNombres, mapa, onMapa, onGuardar, onTodoA, onClose }) {
  const [verTodas, setVerTodas] = useState(false);
  const grupos = useMemo(() => {
    const m = new Map();
    filas.forEach((f) => {
      if (soloCk && f.ck !== soloCk) return;
      if (!verTodas && f.pendiente <= 1 && mapa[f.ck]) return;
      if (!m.has(f.ck)) m.set(f.ck, { ck: f.ck, nombre: f.nombre, filas: [], pendiente: 0 });
      const g = m.get(f.ck);
      g.filas.push(f);
      g.pendiente += Math.max(0, f.pendiente);
    });
    return [...m.values()].map((g) => ({ ...g, filas: g.filas.sort((a, b) => (a.ym < b.ym ? -1 : 1)) })).sort((a, b) => b.pendiente - a.pendiente);
  }, [filas, soloCk, verTodas, mapa]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(1020px, 95vw)", height: "80vh", minWidth: 520, minHeight: 320, maxWidth: "98vw", maxHeight: "96vh", resize: "both", overflow: "auto", display: "flex", flexDirection: "column", boxShadow: "0 18px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 0, background: C.white, zIndex: 2 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.ink }}>¿Para qué fue cada ingreso?</div>
          <label style={{ fontSize: 12, color: C.slate, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} /> Ver también los ya clasificados</label>
          <div style={{ marginLeft: "auto" }}><Boton chico onClick={onClose}>Cerrar</Boton></div>
        </div>
        <div style={{ padding: "10px 18px 18px", flex: 1 }}>
          <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.5, marginBottom: 8 }}>
            Reparte lo que entró de cada cliente entre los ítems del presupuesto. Pulsa el nombre del ítem para poner ahí lo que falta. Lo clasificado suma en «Presupuesto Clientes» (el ítem Tela * se muestra pero no cuenta para el total del presupuesto). Lo que dejes sin clasificar te lo vuelvo a preguntar.
          </div>
          {!grupos.length ? <div style={{ padding: 24, textAlign: "center", fontSize: 14, color: C.green, fontWeight: 800 }}>Todo está clasificado.</div> : null}
          {grupos.map((g) => {
            const valorMapa = mapa[g.ck] || "";
            const ok = valorMapa && valorMapa !== NO_APLICA;
            return (
              <div key={g.ck} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>{g.nombre}</div>
                  <div style={{ fontSize: 11.5, color: C.slate }}>en el presupuesto es:</div>
                  <select value={valorMapa} onChange={(e) => onMapa(g.ck, e.target.value)} style={{ padding: "5px 8px", border: `1.5px solid ${ok ? C.border : C.amber}`, borderRadius: 7, fontSize: 12.5, fontFamily: "inherit", maxWidth: 260 }}>
                    <option value="">— elegir cliente del presupuesto —</option>
                    {clientesNombres.map((n) => <option key={n} value={n}>{n}</option>)}
                    <option value={NO_APLICA}>No aplica (no preguntar más)</option>
                  </select>
                  {ok && g.pendiente > 1 ? (
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: C.slate }}>Todo lo pendiente ({money(g.pendiente)}) a:</span>
                      {CATS_CLASIF.map((c) => <Boton key={c} chico onClick={() => onTodoA(g, c)}>{corto(c)}</Boton>)}
                    </div>
                  ) : null}
                </div>
                {!ok ? <div style={{ fontSize: 12, color: C.amber, marginBottom: 4 }}>Primero elige a qué cliente del presupuesto corresponde (o «No aplica»).</div> : null}
                {g.filas.map((f) => <FilaClasificar key={`${f.id}-${Math.round(f.monto)}-${Object.values(f.items).join("_")}`} fila={f} bloqueada={!ok} onGuardar={onGuardar} />)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Ver de qué se compone el cobro de un cliente en un mes ─────────────────────
function DetalleIngresoModal({ titulo, recibos, tns, nota, onClose }) {
  const sumaR = (recibos || []).reduce((t, r) => t + r.parte, 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(860px, 95vw)", height: "70vh", minWidth: 440, minHeight: 260, maxWidth: "98vw", maxHeight: "96vh", resize: "both", overflow: "auto", display: "flex", flexDirection: "column", boxShadow: "0 18px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: C.white, zIndex: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.ink }}>{titulo}</div>
          <div style={{ marginLeft: "auto" }}><Boton chico onClick={onClose}>Cerrar</Boton></div>
        </div>
        <div style={{ padding: "12px 18px 18px", flex: 1 }}>
          {nota ? <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.5, marginBottom: 10 }}>{nota}</div> : null}
          {recibos ? (
            recibos.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={thL}>Fecha</th><th style={thL}>Recibo</th><th style={thL}>Tipo</th><th style={th}>Valor de este cliente</th><th style={thL}>Caja / banco</th><th style={thL}>Aplicado a</th></tr></thead>
                  <tbody>
                    {recibos.map((r, i) => (
                      <tr key={`${r.origen}-${r.np}-${i}`}>
                        <td style={tdL}>{r.fecha || "—"}</td>
                        <td style={{ ...td, textAlign: "left" }}>{r.np}</td>
                        <td style={{ ...td, textAlign: "left" }}>{r.origen}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{money(r.parte)}{r.monto !== r.parte ? <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 600 }}>recibo total {money(r.monto)}</div> : null}</td>
                        <td style={{ ...td, textAlign: "left" }}>{r.medio}</td>
                        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", maxWidth: 220 }}>{r.docs && r.docs.length ? r.docs.join(", ") : "—"}</td>
                      </tr>
                    ))}
                    <tr style={{ background: C.canvas }}><td style={tdL} colSpan={3}>Total ({recibos.length} {recibos.length === 1 ? "recibo" : "recibos"})</td><td style={{ ...td, fontWeight: 900 }}>{money(sumaR)}</td><td style={td} colSpan={2} /></tr>
                  </tbody>
                </table>
              </div>
            ) : <div style={{ fontSize: 13, color: C.slate }}>No se encontraron recibos para este cliente en ese mes. Trae los datos de nuevo para actualizar el detalle.</div>
          ) : null}
          {tns ? (
            <table style={{ borderCollapse: "collapse", minWidth: 420 }}>
              <tbody>
                <tr><td style={tdL}>Créditos de la cuenta de clientes (1305)</td><td style={td}>{money(tns.c1305)}</td></tr>
                <tr><td style={tdL}>Anticipos recibidos (créditos 2805)</td><td style={td}>{money(tns.c2805)}</td></tr>
                <tr><td style={tdL}>Anticipos aplicados a facturas (débitos 2805)</td><td style={td}>{money(-tns.d2805)}</td></tr>
                <tr style={{ background: C.canvas }}><td style={tdL}>Cobro estimado del mes</td><td style={{ ...td, fontWeight: 900 }}>{money(tns.c1305 + tns.c2805 - tns.d2805)}</td></tr>
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function IngresosView({ db, functionsClient, isAdmin, clientesNombres = [] }) {
  const [fuente, setFuente] = useState("total_yanko");
  const F = FUENTES[fuente];
  const combinada = !!F.combinada;
  const esTns = fuente === "tns_yanko" || fuente === "tns_indutex";
  const [datos, setDatos] = useState(null); // respuesta completa del servidor (en memoria)
  const [cache, setCache] = useState(null); // resumen guardado { actualizadoEn, meses: [{ ym, total, traslados }] }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [incluirTras, setIncluirTras] = useState(false);
  const [vista, setVista] = useState("cliente"); // cliente | medio
  const [verTodos, setVerTodos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [verDiag, setVerDiag] = useState(false);
  // Clasificación por ítem del presupuesto
  const [clasif, setClasif] = useState({}); // id -> documento de clasificación
  const [mapa, setMapa] = useState({}); // clave de cliente -> nombre en el presupuesto | NO_APLICA
  const [abrirClasif, setAbrirClasif] = useState(null); // null | { soloCk }
  const [pedirClasif, setPedirClasif] = useState(false);
  const [detalle, setDetalle] = useState(null); // { key, ym } -> ventana «Ver detalle»
  useEffect(() => onSnapshot(collection(db, "financiera_ingresos_clasificacion"), (s) => { const o = {}; s.docs.forEach((d) => { o[d.id] = d.data(); }); setClasif(o); }, () => {}), [db]);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_clientes", "main"), (s) => setMapa(s.exists() ? s.data().mapa || {} : {}), () => {}), [db]);

  useEffect(() => {
    setCache(null);
    const u = onSnapshot(doc(db, "financiera_ingresos_cache", F.docId), (s) => setCache(s.exists() ? s.data() : null), () => {});
    return u;
  }, [db, F.docId]);
  function cambiarFuente(k) { setFuente(k); setDatos(null); setError(""); setVerTodos(false); setBusqueda(""); setVerDiag(false); setIncluirTras(false); }

  async function traer() {
    setCargando(true);
    setError("");
    try {
      let d;
      if (combinada) {
        const llamar = (fn, args) => httpsCallable(functionsClient, fn, { timeout: 540000 })({ meses: 13, ...args }).then((x) => x.data);
        const [t, b] = await Promise.all([llamar("getIngresosClientesTNS", { empresa: "yanko" }), llamar("getIngresosClientesBusint", {}).catch((e) => ({ error: e?.message || "No respondió Busint." }))]);
        d = combinarTotalYanko(t, b);
      } else {
        const r = await httpsCallable(functionsClient, F.funcion, { timeout: 540000 })({ meses: 13, ...F.args });
        d = r.data;
      }
      setDatos(d);
      setPedirClasif(true);
      const resumen = d.meses.map((ym) => ({ ym, total: Math.round(d.clientes?.porMes?.[ym]?.total || 0), traslados: Math.round(d.traslados?.porMes?.[ym]?.total || 0) }));
      await setDoc(doc(db, "financiera_ingresos_cache", F.docId), { actualizadoEn: new Date().toISOString(), fuente, meses: resumen });
    } catch (e) {
      setError(e?.message || `No se pudo traer los ingresos de ${F.nombre}.`);
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

  // ── Clasificación: filas (cliente × mes con cobro) y lo que falta por clasificar ──
  const puedeClasificar = !!isAdmin && !!datos && fuente !== "busint" && !!datos.clientes?.porMes;
  const filasClasif = useMemo(() => {
    if (!puedeClasificar) return [];
    const out = [];
    datos.meses.forEach((ym) => {
      Object.entries(datos.clientes.porMes[ym]?.porCliente || {}).forEach(([key, monto]) => {
        if (!(monto > 1)) return; // solo cobros positivos
        const ck = claveClasif(fuente, key);
        if (!ck || mapa[ck] === NO_APLICA) return;
        const items = clasif[idClasif(ym, ck)]?.items || {};
        const ya = CATS_CLASIF.reduce((t, c) => t + (items[c] || 0), 0);
        out.push({ id: idClasif(ym, ck), ym, key, ck, nombre: datos.nombres?.[key] || key, monto, items, pendiente: Math.round(monto - ya) });
      });
    });
    return out;
  }, [puedeClasificar, datos, fuente, mapa, clasif]);
  const numPendientes = filasClasif.filter((f) => f.pendiente > 1 || !mapa[f.ck]).length;
  const pendSet = useMemo(() => new Set(filasClasif.filter((f) => f.pendiente > 1 || !mapa[f.ck]).map((f) => `${f.ym}|${f.key}`)), [filasClasif, mapa]);
  const ckDeKey = (key) => claveClasif(fuente, key);
  // Tras traer datos nuevos, si hay algo sin clasificar se pregunta de una vez.
  useEffect(() => {
    if (!pedirClasif || !datos) return;
    setPedirClasif(false);
    if (puedeClasificar && numPendientes > 0) setAbrirClasif({ soloCk: null });
  }, [pedirClasif, datos, puedeClasificar, numPendientes]);
  const movimientoDe = (fila, cat, valor, clienteP) => ({
    id: idMov(fila.ym, fila.ck, cat), tipo: "ingreso", fecha: finDeMes(fila.ym, datos?.hoy), categoria: cat,
    descripcion: `Ingreso automático (${F.nombre}) ${fila.ym} · ${fila.nombre}`, valor, referencia: `Ingresos ${fila.ym}`,
    proveedor: clienteP, cliente: clienteP, distribucion: [], origen: "ingresos_auto", ingresoClave: fila.ck, creadoEn: new Date().toISOString(),
  });
  async function guardarClasif(fila, vals) {
    const clienteP = mapa[fila.ck];
    if (!clienteP || clienteP === NO_APLICA) return;
    const items = {};
    CATS_CLASIF.forEach((c) => { const v = Math.round(Number(vals[c]) || 0); if (v > 0) items[c] = v; });
    const batch = writeBatch(db);
    batch.set(doc(db, "financiera_ingresos_clasificacion", fila.id), { ym: fila.ym, ck: fila.ck, key: fila.key, nombre: fila.nombre, cliente: clienteP, monto: Math.round(fila.monto), items, actualizadoEn: new Date().toISOString() });
    CATS_CLASIF.forEach((c) => {
      const ref = doc(db, "contabilidad_movimientos", idMov(fila.ym, fila.ck, c));
      if (items[c]) batch.set(ref, movimientoDe(fila, c, items[c], clienteP)); else batch.delete(ref);
    });
    try { await batch.commit(); setError(""); } catch (e) { setError(`No se pudo guardar la clasificación: ${e?.message || e}`); }
  }
  async function todoA(grupo, cat) {
    const clienteP = mapa[grupo.ck];
    if (!clienteP || clienteP === NO_APLICA) return;
    for (const f of grupo.filas) {
      if (f.pendiente <= 1) continue;
      const vals = {};
      CATS_CLASIF.forEach((c) => { vals[c] = String((f.items[c] || 0) + (c === cat ? f.pendiente : 0)); });
      await guardarClasif(f, vals);
    }
  }
  async function cambiarMapa(ck, valor) {
    try {
      await setDoc(doc(db, "financiera_ingresos_clientes", "main"), { mapa: { [ck]: valor } }, { merge: true });
      const previas = Object.entries(clasif).filter(([, d]) => d.ck === ck);
      if (!previas.length) return;
      const batch = writeBatch(db);
      previas.forEach(([id, d]) => {
        CATS_CLASIF.forEach((c) => {
          const ref = doc(db, "contabilidad_movimientos", idMov(d.ym, ck, c));
          if (valor && valor !== NO_APLICA && d.items?.[c]) batch.set(ref, movimientoDe({ ym: d.ym, ck, nombre: d.nombre }, c, d.items[c], valor));
          else batch.delete(ref);
        });
        if (valor === NO_APLICA) batch.delete(doc(db, "financiera_ingresos_clasificacion", id));
        else if (valor) batch.set(doc(db, "financiera_ingresos_clasificacion", id), { ...d, cliente: valor });
      });
      await batch.commit();
    } catch (e) { setError(`No se pudo cambiar el cliente del presupuesto: ${e?.message || e}`); }
  }

  // ── Ver detalle: de qué se compone el cobro de un cliente en un mes ──
  function detalleDe(key, ym) {
    if (!datos) return null;
    const nombre = datos.nombres?.[key] || key;
    const titulo = `${nombre} · ${etiquetaMes(ym)}`;
    const deRecibos = (lista, cod, origen) => (lista || []).filter((r) => r.partes && r.partes[cod] !== undefined).map((r) => ({ np: r.np, fecha: r.fecha, parte: r.partes[cod], monto: r.monto, medio: r.medio, docs: r.docs, origen }));
    const mm = datos.clientes?.porMes?.[ym] || {};
    if (fuente === "busint") {
      const rec = [...deRecibos(mm.recibosDetalle, key, "Cobro normal"), ...(incluirTras ? deRecibos(datos.traslados?.porMes?.[ym]?.recibosDetalle, key, "Traslado externo") : [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      return { titulo, recibos: rec, nota: "Recibos de caja de Busint de este cliente en el mes (tablas pagos y pagos detalles; si el interruptor de traslados está marcado, también pagostras)." };
    }
    if (fuente === "total_yanko" && String(key).startsWith("bus:")) {
      const rec = deRecibos(mm.recibosBus, String(key).slice(4), "Traslado externo").sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      return { titulo, recibos: rec, nota: "Pagos registrados en Busint para traslados externos (consignación) de este cliente en el mes: tablas pagostras y pagostras detalles." };
    }
    const base = fuente === "total_yanko" ? String(key).replace(/^tns:/, "") : key;
    const t = fuente === "total_yanko" ? mm.tnsDet?.[base] : mm.porClienteDetalle?.[base];
    return { titulo, tns: t || { c1305: 0, c2805: 0, d2805: 0 }, nota: "TNS no entrega recibos de caja. El cobro de este cliente se estima con el Balance de Comprobación de ese mes: lo que se abonó a su cuenta de clientes más los anticipos que dejó, menos los anticipos que se aplicaron." };
  }
  const detalleAbierto = detalle ? detalleDe(detalle.key, detalle.ym) : null;
  const maximo = Math.max(1, ...meses.map(totalMes));
  const quien = cache?.actualizadoEn ? new Date(cache.actualizadoEn).toLocaleString("es-CO") : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: C.ink }}>Ingresos de clientes</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {fuente === "busint" ? (
            <label style={{ fontSize: 12.5, color: C.slate, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={incluirTras} onChange={(e) => setIncluirTras(e.target.checked)} /> Sumar traslados externos (consignación)
            </label>
          ) : null}
          {isAdmin ? <Boton variante="oscuro" onClick={traer} disabled={cargando}>{cargando ? `Consultando ${F.nombre}…` : `🔄 Traer desde ${F.nombre}`}</Boton> : null}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.entries(FUENTES).map(([k, v]) => <Boton key={k} chico variante={fuente === k ? "oscuro" : "claro"} onClick={() => cambiarFuente(k)}>{v.etiqueta}</Boton>)}
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14, maxWidth: 860, lineHeight: 1.5 }}>
        {combinada
          ? "Todo lo que entra: los cobros de clientes en TNS (casi todo el ingreso) más los traslados externos (consignación) de los clientes que se facturan en Busint. Los cobros normales de Busint NO se suman porque ya están en TNS."
          : esTns
            ? "Cobros de clientes en TNS, por mes y por cliente: créditos de la cuenta de clientes (1305) más anticipos recibidos (2805) menos anticipos aplicados. Por caja o banco: lo que entra a cada cuenta (1105 a 1120), que incluye todo, no solo clientes. El Libro Auxiliar de TNS falla, por eso no se usa."
            : "Lo que los clientes pagan en Busint (recibos de caja de cartera, solo Yanko). Sirve para cruzar contra TNS; no se suma al total porque ya está en TNS."}
        {quien ? ` Último resumen guardado: ${quien}.` : ` Todavía no hay datos: pulsa «Traer desde ${F.nombre}».`}
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
            {puedeClasificar ? <Boton chico variante={numPendientes ? "oscuro" : "claro"} onClick={() => setAbrirClasif({ soloCk: null })}>{numPendientes ? `🏷 Clasificar ingresos (${numPendientes} sin clasificar)` : "🏷 Ingresos clasificados"}</Boton> : null}
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
                    {datos.meses.map((ym) => {
                      const pend = vista === "cliente" && puedeClasificar && pendSet.has(`${ym}|${f.cod}`);
                      return (
                        <td key={ym} onClick={vista === "cliente" && puedeClasificar && f.porMes[ym] > 1 ? () => setAbrirClasif({ soloCk: ckDeKey(f.cod) }) : undefined}
                          title={pend ? "Sin clasificar: clic para clasificar" : undefined}
                          style={{ ...td, color: f.porMes[ym] ? C.ink : C.seam, cursor: vista === "cliente" && puedeClasificar && f.porMes[ym] > 1 ? "pointer" : "default", background: pend ? C.amberBg : undefined }}>
                          {f.porMes[ym] ? money(f.porMes[ym]) : "—"}
                          {vista === "cliente" && f.porMes[ym] ? <span onClick={(e) => { e.stopPropagation(); setDetalle({ key: f.cod, ym }); }} title="Ver de qué se compone" style={{ cursor: "pointer", marginLeft: 5, fontSize: 11, opacity: 0.7 }}>🔍</span> : null}
                        </td>
                      );
                    })}
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

      {detalleAbierto ? <DetalleIngresoModal titulo={detalleAbierto.titulo} recibos={detalleAbierto.recibos} tns={detalleAbierto.tns} nota={detalleAbierto.nota} onClose={() => setDetalle(null)} /> : null}

      {abrirClasif && puedeClasificar ? (
        <ClasificarIngresosModal filas={filasClasif} soloCk={abrirClasif.soloCk} clientesNombres={clientesNombres} mapa={mapa} onMapa={cambiarMapa} onGuardar={guardarClasif} onTodoA={todoA} onClose={() => setAbrirClasif(null)} />
      ) : null}

      {verDiag && datos && (esTns || combinada) ? (
        <div style={{ marginTop: 14, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, color: C.ink, marginBottom: 4 }}>Diagnóstico (para validar contra los extractos)</div>
          <div>Sucursales de TNS consultadas: <b>{(datos.sucursales || []).join(", ")}</b> (deben ser las de esta empresa: Nómina → Conexión TNS) · clientes con movimiento: {datos.diagnosticoTns?.clientesDetectados} · cuentas de caja/banco: {datos.diagnosticoTns?.cuentasCajaBanco} · tardó {datos.diagnosticoTns?.segundos} s.</div>
          <div style={{ marginTop: 6 }}>{combinada ? "Por mes: lo de TNS (cobros por cartera), los traslados externos de Busint y el total; y, para cuadrar con el extracto, los débitos de caja y bancos de TNS." : "Por mes: débitos de caja y bancos (contra tu extracto), el estimado de cobros de clientes y lo que no es cobro de cliente:"}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", marginTop: 4 }}>
              <thead>
                <tr>
                  <th style={thL}>Mes</th><th style={th}>Débitos caja/bancos</th>
                  {combinada ? <><th style={th}>TNS cobros (cartera)</th><th style={th}>Traslados Busint</th><th style={th}>Total</th><th style={th}>Caja − cobros TNS</th></> : <><th style={th}>Créditos 1305</th><th style={th}>Anticipos 2805 (neto)</th><th style={th}>Estimado clientes</th><th style={th}>Otros / sin explicar</th></>}
                </tr>
              </thead>
              <tbody>
                {datos.meses.map((ym) => { const m = datos.clientes?.porMes?.[ym]; if (!m) return null; return combinada ? (
                  <tr key={ym}><td style={tdL}>{etiquetaMes(ym)}</td><td style={td}>{money(m.totalCajaBancos)}</td><td style={td}>{money(m.tnsTotal)}</td><td style={td}>{money(m.trasladosTotal)}</td><td style={{ ...td, fontWeight: 800 }}>{money(m.total)}</td><td style={td}>{money(m.totalCajaBancos - m.tnsTotal)}</td></tr>
                ) : (
                  <tr key={ym}><td style={tdL}>{etiquetaMes(ym)}</td><td style={td}>{money(m.totalCajaBancos)}</td><td style={td}>{money(m.creditos1305)}</td><td style={td}>{money(m.creditos2805 - m.debitos2805)}</td><td style={td}>{money(m.estimadoCartera)}</td><td style={td}>{money(m.otrosCaja)}</td></tr>
                ); })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 6 }}>Si «Otros / sin explicar» es grande en un mes, entró plata que no es cobro de cliente (préstamos, traslados entre bancos) o hay un anticipo cruzado: se revisa contra el extracto de ese mes.</div>
        </div>
      ) : null}

      {verDiag && datos && fuente === "busint" ? (
        <div style={{ marginTop: 14, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", fontSize: 12, color: C.slate, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, color: C.ink, marginBottom: 4 }}>Diagnóstico (para validar contra los extractos)</div>
          <div>Columnas detectadas: {Object.entries(datos.clientes?.columnas || {}).map(([k, v]) => `${k}=${v || "—"}`).join(" · ")}</div>
          <div>Recibos leídos: {datos.clientes?.recibosCabecera} · anulados excluidos: {datos.clientes?.anuladas}{datos.clientes?.columnas?.cabEstado ? ` (columna «${datos.clientes.columnas.cabEstado}»)` : " (no se encontró ninguna columna de estado: no se puede saber si hay anulados)"} · sin fecha: {datos.clientes?.sinFecha} · el total sale de {datos.clientes?.usaCabecera ? "la cabecera del recibo" : "la suma de los renglones (la tabla «pagos» no tiene columna de total, por eso Cabecera y Renglones salen iguales y esa comparación no valida nada)"}.</div>
          <div>Caja/banco tomado de: {datos.clientes?.columnas?.cabMedio ? `«${datos.clientes.columnas.cabMedio}» de pagos` : datos.clientes?.columnas?.detMedio ? `«${datos.clientes.columnas.detMedio}» de pagos detalles` : "ninguna columna con datos (todo sale en «Sin dato»)"}.</div>
          {[["Candidatas a caja/banco en pagos", datos.clientes?.candidatas?.medioCab], ["Candidatas a caja/banco en pagos detalles", datos.clientes?.candidatas?.medioDet], ["Candidatas a estado/anulado en pagos", datos.clientes?.candidatas?.estadoCab]].map(([t, l]) => (
            <div key={t} style={{ wordBreak: "break-word" }}>{t}: {(l || []).length ? l.map((c) => `${c.col} (${c.llenos} con dato${c.ejemplos.length ? `, ej.: ${c.ejemplos.join(" | ")}` : ""})`).join(" · ") : "ninguna"}</div>
          ))}
          <div style={{ marginTop: 6 }}>Por mes: cobros normales de Busint (que ya están en TNS, no se suman al total) y traslados externos (los que sí se suman). La barra y la tabla de arriba incluyen los traslados solo si el interruptor está marcado:</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", marginTop: 4 }}>
              <thead><tr><th style={thL}>Mes</th><th style={th}>Recibos</th><th style={th}>Cobros normales</th><th style={th}>Traslados externos</th><th style={th}>Total con traslados</th></tr></thead>
              <tbody>
                {datos.meses.map((ym) => { const m = datos.clientes?.porMes?.[ym]; if (!m) return null; return (
                  <tr key={ym}><td style={tdL}>{etiquetaMes(ym)}</td><td style={td}>{m.recibos}</td><td style={td}>{money(m.total)}</td><td style={td}>{money(datos.traslados?.porMes?.[ym]?.total || 0)}</td><td style={{ ...td, fontWeight: 800 }}>{money(m.total + (datos.traslados?.porMes?.[ym]?.total || 0))}</td></tr>
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
