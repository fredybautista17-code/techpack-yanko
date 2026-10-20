import React, { useState, useEffect, useMemo } from "react";
import { getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { collection, doc, setDoc, updateDoc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// ─── DEVOLUCIONES DE CLIENTES ────────────────────────────────────────────
// (2026-10-20, a pedido de Fredy) El cliente (primero Kamila Colombia, pero sirve
// para cualquiera) reporta una devolución por lote, color y talla; Bodega la marca
// "Recibida" cuando llega la mercancía y la "Despachada de nuevo" cuando sale otra
// vez (re-despacho SOLO manual, con fecha y guía); Calidad cuenta por color/talla,
// compara contra lo declarado y la marca "Revisada" (completa / con diferencias).
// Colección Firestore: "devoluciones_cliente" (ver firestore.rules: un Cliente solo
// lee lo que él mismo creó; solo el personal interno cambia estados).
//
// Estados: reportada -> en_camino -> recibida -> revisada -> lista -> redespachada.
// Si el cliente escribe la guía al reportar, nace "en_camino"; si no, "reportada".
//
// Exporta tres pantallas:
//   DevolucionesClienteView  -> menú lateral (rol Cliente, y admin para previsualizar)
//   DevolucionesBodegaView   -> pestaña "Devoluciones" del módulo Bodega
//   DevolucionesCalidadView  -> lista "Devoluciones de clientes" en Planeación -> Control de Calidad

const COL = "devoluciones_cliente";
const TALLAS_ORDEN = ["T2", "T4", "T6", "T8", "T10", "T12", "T14", "T16", "T18", "T24", "T36"];
const MOTIVOS = ["Defecto de costura", "Defecto de tela", "Talla equivocada", "Excedente", "Otro"];
const PASOS = ["reportada", "en_camino", "recibida", "revisada", "lista", "redespachada"];
const TEMA_DEFECTO = {
  ink: "#1A1A2E", slate: "#5A5A7A", canvas: "#F7F4F0", white: "#FFFFFF", coral: "#E85D4A", coralBg: "#FDF0EE",
  jade: "#2D9E6B", jadeBg: "#EBF7F2", denim: "#3D6B9E", denimBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
  violet: "#7B5EA7", violetBg: "#F3EEF9", border: "#E8E2DB",
};

const limpio = (o) => JSON.parse(JSON.stringify(o));
const nowISO = () => new Date().toISOString();
const fmtFecha = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};
const fmtFechaHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const entero = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const totalLineas = (lineas) => (lineas || []).reduce((s, l) => s + Object.values(l.cantidades || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);
const numeroNuevo = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `D-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${String(Math.floor(Math.random() * 900) + 100)}`;
};

function estadoInfo(T, estado) {
  const m = {
    reportada: { txt: "Reportada", bg: T.amberBg, fg: T.amber },
    en_camino: { txt: "En camino", bg: T.denimBg, fg: T.denim },
    recibida: { txt: "Recibida", bg: T.violetBg, fg: T.violet },
    revisada: { txt: "Revisada", bg: T.jadeBg, fg: T.jade },
    lista: { txt: "Lista para despachar", bg: T.jadeBg, fg: T.jade },
    redespachada: { txt: "Despachada de nuevo", bg: T.canvas, fg: T.slate },
  };
  return m[estado] || { txt: estado || "—", bg: T.canvas, fg: T.slate };
}

function Pill({ bg, fg, children }) {
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>;
}
function EstadoPill({ T, d }) {
  const e = estadoInfo(T, d.estado);
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      <Pill T={T} bg={e.bg} fg={e.fg}>{e.txt}</Pill>
      {d.resultado === "diferencias" && <Pill T={T} bg={T.coralBg} fg={T.coral}>Con diferencias</Pill>}
      {d.resultado === "completa" && <Pill T={T} bg={T.jadeBg} fg={T.jade}>Completa</Pill>}
    </span>
  );
}
const btn = (T, tipo) => ({
  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
  border: tipo === "primario" ? "none" : `1px solid ${T.border}`,
  background: tipo === "primario" ? T.ink : T.white,
  color: tipo === "primario" ? T.white : T.ink,
});
const campo = (T) => ({ height: 34, padding: "0 10px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, background: T.white, color: T.ink, boxSizing: "border-box" });

function useDevoluciones(db, soloUid) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return undefined;
    const q = soloUid ? query(collection(db, COL), where("creadoPorUid", "==", soloUid)) : collection(db, COL);
    return onSnapshot(
      q,
      (s) => {
        setError("");
        setLista(s.docs.map((x) => ({ ...x.data(), id: x.id })).sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || "")));
      },
      (e) => { setError(e?.message || "No se pudieron leer las devoluciones."); setLista([]); }
    );
  }, [db, soloUid]);
  return { lista, error };
}

function usuarioActual(currentUser) {
  return currentUser?.name || currentUser?.username || "";
}

// Tabla color x talla. `valores` = { "color|T6": n }. Con `editable` muestra inputs; `tope` = cantidades máximas del lote.
function GrillaColorTalla({ T, colores, tallas, valores, onCambiar, tope, editable = true, comparar }) {
  const th = { padding: "6px 8px", fontSize: 11, color: T.slate, textAlign: "center", borderBottom: `1px solid ${T.border}` };
  const td = { padding: "6px 8px", textAlign: "center", borderBottom: `1px solid ${T.border}`, fontSize: 13 };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Color</th>
            {tallas.map((t) => <th key={t} style={th}>{t}</th>)}
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {colores.map((c) => {
            const fila = tallas.reduce((s, t) => s + (Number(valores[`${c.color}|${t}`]) || 0), 0);
            return (
              <tr key={c.color}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{c.color}</td>
                {tallas.map((t) => {
                  const k = `${c.color}|${t}`;
                  const cap = tope ? c.tallas?.[t] || 0 : null;
                  const declarado = comparar ? Number(comparar[k]) || 0 : null;
                  const v = Number(valores[k]) || 0;
                  const dif = declarado === null ? 0 : v - declarado;
                  if (!editable) return <td key={t} style={td}>{v || "·"}</td>;
                  if (tope && !cap) return <td key={t} style={{ ...td, color: T.slate }}>·</td>;
                  return (
                    <td key={t} style={td}>
                      <input
                        type="number" min="0" max={cap || undefined} value={valores[k] ?? ""}
                        onChange={(e) => onCambiar(k, e.target.value, cap)}
                        style={{ ...campo(T), width: 58, textAlign: "center", padding: 0, borderColor: dif < 0 ? T.coral : dif > 0 ? T.amber : T.border }}
                      />
                      {tope && <div style={{ fontSize: 10, color: T.slate, marginTop: 2 }}>de {cap}</div>}
                      {comparar && <div style={{ fontSize: 10, color: dif ? (dif < 0 ? T.coral : T.amber) : T.slate, marginTop: 2 }}>decl. {declarado}</div>}
                    </td>
                  );
                })}
                <td style={{ ...td, fontWeight: 700 }}>{fila}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function valoresDeLineas(lineas) {
  const v = {};
  (lineas || []).forEach((l) => Object.entries(l.cantidades || {}).forEach(([t, n]) => { v[`${l.color}|${t}`] = n; }));
  return v;
}
function coloresDeLineas(lineas) {
  return (lineas || []).map((l) => ({ color: l.color, tallas: l.cantidades || {} }));
}
function tallasDeLineas(lineas, extra) {
  const set = new Set(extra || []);
  (lineas || []).forEach((l) => Object.keys(l.cantidades || {}).forEach((t) => set.add(t)));
  return TALLAS_ORDEN.filter((t) => set.has(t));
}

function Linea({ T, estado }) {
  const idx = PASOS.indexOf(estado);
  return (
    <div style={{ display: "flex", margin: "8px 0 14px" }}>
      {PASOS.map((p, i) => {
        const e = estadoInfo(T, p);
        const hecho = i < idx, actual = i === idx;
        return (
          <div key={p} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: actual ? T.denim : hecho ? T.ink : T.slate, fontWeight: actual ? 700 : 400 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", margin: "0 auto 4px", background: actual ? T.denim : hecho ? T.jade : T.border }} />
            {e.txt}
          </div>
        );
      })}
    </div>
  );
}

function Detalle({ T, d, mostrarConteo }) {
  const tallas = tallasDeLineas(d.lineas, d.tallas);
  const valores = valoresDeLineas(d.lineas);
  const conteoVal = valoresDeLineas(d.conteo);
  return (
    <div style={{ paddingTop: 10 }}>
      <Linea T={T} estado={d.estado} />
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>
        Lote <b style={{ color: T.ink }}>{d.lote}</b> · Ref {d.ref || "—"}{d.pedido ? ` · Pedido ${d.pedido}` : ""} · Motivo: {d.motivo || "—"} · Guía: {d.guia || "—"}
      </div>
      {d.observaciones ? <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>Nota del cliente: {d.observaciones}</div> : null}
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, margin: "6px 0" }}>DECLARADO POR EL CLIENTE</div>
      <GrillaColorTalla T={T} colores={coloresDeLineas(d.lineas)} tallas={tallas} valores={valores} editable={false} />
      {mostrarConteo && d.conteo?.length ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, margin: "12px 0 6px" }}>CONTADO POR CALIDAD</div>
          <GrillaColorTalla T={T} colores={coloresDeLineas(d.conteo)} tallas={tallasDeLineas(d.conteo, tallas)} valores={conteoVal} editable={false} />
          {(d.diferencias || []).length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {d.diferencias.map((x) => (
                <Pill key={`${x.color}|${x.talla}`} T={T} bg={x.dif < 0 ? T.coralBg : T.amberBg} fg={x.dif < 0 ? T.coral : T.amber}>
                  {x.color} {x.talla}: {x.dif < 0 ? `falta ${-x.dif}` : `sobra ${x.dif}`}
                </Pill>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {d.redespacho ? (
        <div style={{ fontSize: 12, color: T.slate, marginTop: 10 }}>
          Despachada de nuevo el {fmtFecha(d.redespacho.fecha)}{d.redespacho.guia ? ` · guía ${d.redespacho.guia}` : ""}
        </div>
      ) : null}
      <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>HISTORIAL</div>
        {(d.historial || []).map((h, i) => (
          <div key={i} style={{ fontSize: 12, color: T.slate, padding: "2px 0" }}>
            {fmtFechaHora(h.fecha)} · <b style={{ color: T.ink }}>{estadoInfo(T, h.estado).txt}</b>{h.usuario ? ` · ${h.usuario}` : ""}{h.nota ? ` · ${h.nota}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

async function cambiarEstado(db, d, estado, extra, usuario, nota) {
  const ev = { estado, fecha: nowISO(), usuario: usuario || "", ...(nota ? { nota } : {}) };
  await updateDoc(doc(db, COL, d.id), limpio({ ...(extra || {}), estado, historial: [...(d.historial || []), ev], actualizadoEn: nowISO() }));
}

// ─── PANTALLA DEL CLIENTE ────────────────────────────────────────────────
export function DevolucionesClienteView({ db, functionsClient, T: Tp, currentUser }) {
  const T = Tp || TEMA_DEFECTO;
  const esCliente = currentUser?.role === "Cliente";
  const uid = (() => { try { return getAuth(getApps()[0]).currentUser?.uid || ""; } catch { return ""; } })();
  const { lista, error: errLista } = useDevoluciones(db, esCliente ? uid : null);
  const [lote, setLote] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [cant, setCant] = useState({});
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [guia, setGuia] = useState("");
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [abierto, setAbierto] = useState(null);

  async function buscar() {
    setError(""); setAviso(""); setInfo(null); setCant({});
    if (!/^\d+$/.test(lote.trim())) { setError("Escribe el número de lote (solo números)."); return; }
    setBuscando(true);
    try {
      const r = await httpsCallable(functionsClient, "consultarLoteParaDevolucion")({ lote: lote.trim() });
      setInfo(r.data);
    } catch (e) {
      setError(e?.message || "No se pudo consultar el lote.");
    } finally {
      setBuscando(false);
    }
  }
  function cambiar(k, v, cap) {
    let n = v === "" ? "" : entero(v);
    if (n !== "" && cap && n > cap) n = cap;
    setCant((c) => ({ ...c, [k]: n }));
  }
  const total = useMemo(() => Object.values(cant).reduce((s, v) => s + (Number(v) || 0), 0), [cant]);

  async function reportar() {
    setError(""); setAviso("");
    if (!info) return;
    if (!(total > 0)) { setError("Escribe al menos una unidad a devolver."); return; }
    if (!uid) { setError("No se pudo identificar tu sesión. Cierra sesión y vuelve a entrar."); return; }
    const lineas = info.colores
      .map((c) => ({ color: c.color, cantidades: Object.fromEntries(info.tallas.map((t) => [t, Number(cant[`${c.color}|${t}`]) || 0]).filter(([, n]) => n > 0)) }))
      .filter((l) => Object.keys(l.cantidades).length);
    const id = `dev_${Date.now()}`;
    const estado = guia.trim() ? "en_camino" : "reportada";
    const d = {
      id, numero: numeroNuevo(), lote: info.lote, ref: info.ref, pedido: info.pedido, cliente: info.cliente,
      tallas: info.tallas, lineas, total: totalLineas(lineas), motivo, guia: guia.trim(), observaciones: obs.trim(),
      estado, creadoPorUid: uid, creadoPor: usuarioActual(currentUser), creadoEn: nowISO(),
      historial: [{ estado, fecha: nowISO(), usuario: usuarioActual(currentUser) }],
    };
    setGuardando(true);
    try {
      await setDoc(doc(db, COL, id), limpio(d));
      setAviso(`Devolución ${d.numero} reportada.`);
      setInfo(null); setCant({}); setLote(""); setGuia(""); setObs(""); setMotivo(MOTIVOS[0]);
    } catch (e) {
      setError(e?.message || "No se pudo guardar la devolución.");
    } finally {
      setGuardando(false);
    }
  }

  const tarjeta = { background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 18 };
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, marginBottom: 4 }}>Devoluciones</div>
      <div style={{ fontSize: 13, color: T.slate, marginBottom: 16 }}>Reporta lo que devuelves por lote, color y talla. Solo puedes consultar lotes de tu cliente.</div>
      <div style={tarjeta}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Número de lote</div>
            <input value={lote} onChange={(e) => setLote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") buscar(); }} placeholder="Ej. 7136" style={{ ...campo(T), width: 130 }} />
          </div>
          <button onClick={buscar} disabled={buscando} style={btn(T)}>{buscando ? "Buscando…" : "Buscar lote"}</button>
          {info && <div style={{ fontSize: 13, color: T.slate, paddingBottom: 8 }}>Ref <b style={{ color: T.ink }}>{info.ref || "—"}</b>{info.cliente ? ` · ${info.cliente}` : ""}{info.pedido ? ` · pedido ${info.pedido}` : ""}</div>}
        </div>
        {error && <div style={{ background: T.coralBg, color: T.coral, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {aviso && <div style={{ background: T.jadeBg, color: T.jade, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{aviso}</div>}
        {info && info.sinDetalle && <div style={{ background: T.amberBg, color: T.amber, borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>Encontramos el lote, pero no trae el detalle por color y talla. Avisa al equipo de Yanko.</div>}
        {info && !info.sinDetalle && (
          <>
            <div style={{ fontSize: 12, color: T.slate, marginBottom: 6 }}>Unidades que devuelves, por color y talla (debajo de cada casilla: cantidad del lote)</div>
            <GrillaColorTalla T={T} colores={info.colores} tallas={info.tallas} valores={cant} onCambiar={cambiar} tope />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Motivo</div>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...campo(T), width: "100%" }}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
              </div>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Guía de transporte (opcional)</div>
                <input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="Número de guía" style={{ ...campo(T), width: "100%" }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Nota (opcional)</div>
              <input value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...campo(T), width: "100%" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, color: T.slate }}>Total a devolver: <b style={{ color: T.ink }}>{total} unidades</b></span>
              <button onClick={reportar} disabled={guardando} style={btn(T, "primario")}>{guardando ? "Guardando…" : "Reportar devolución"}</button>
            </div>
          </>
        )}
      </div>
      <div style={tarjeta}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{esCliente ? "Tus devoluciones" : "Devoluciones reportadas"}</div>
        {errLista && <div style={{ color: T.coral, fontSize: 13 }}>{errLista}</div>}
        {lista === null ? <div style={{ fontSize: 13, color: T.slate }}>Cargando…</div>
          : !lista.length ? <div style={{ fontSize: 13, color: T.slate }}>Todavía no has reportado devoluciones.</div>
          : lista.map((d) => (
            <div key={d.id} style={{ borderTop: `1px solid ${T.border}`, padding: "10px 0" }}>
              <div onClick={() => setAbierto(abierto === d.id ? null : d.id)} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", cursor: "pointer", fontSize: 13 }}>
                <span><b>{d.numero}</b> · lote {d.lote} · {d.total} und · {fmtFecha(d.creadoEn)}</span>
                <EstadoPill T={T} d={d} />
              </div>
              {abierto === d.id && <Detalle T={T} d={d} mostrarConteo={!esCliente} />}
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── LISTA PARA EL EQUIPO (Bodega y Calidad) ─────────────────────────────
function ListaEquipo({ db, T: Tp, currentUser, modo }) {
  const T = Tp || TEMA_DEFECTO;
  const { lista, error } = useDevoluciones(db, null);
  const [filtro, setFiltro] = useState("pendientes");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [msg, setMsg] = useState("");
  const [redes, setRedes] = useState({ fecha: new Date().toISOString().slice(0, 10), guia: "" });
  const [conteo, setConteo] = useState({});
  const usuario = usuarioActual(currentUser);

  const pendiente = (d) => (modo === "bodega" ? ["reportada", "en_camino", "lista"].includes(d.estado) : ["recibida", "revisada"].includes(d.estado));
  const visibles = (lista || []).filter((d) => {
    if (filtro === "pendientes" && !pendiente(d)) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [d.numero, d.lote, d.ref, d.cliente, d.guia].some((x) => String(x || "").toLowerCase().includes(t));
  });

  function abrir(d) {
    setMsg("");
    if (abierto === d.id) { setAbierto(null); return; }
    setAbierto(d.id);
    if (modo === "calidad" && d.estado === "recibida") setConteo(valoresDeLineas(d.lineas));
  }
  async function accion(d, estado, extra, nota) {
    setTrabajando(d.id); setMsg("");
    try { await cambiarEstado(db, d, estado, extra, usuario, nota); }
    catch (e) { setMsg(e?.message || "No se pudo guardar el cambio."); }
    finally { setTrabajando(""); }
  }
  async function guardarConteo(d) {
    const declarado = valoresDeLineas(d.lineas);
    const tallas = tallasDeLineas(d.lineas, d.tallas);
    const colores = coloresDeLineas(d.lineas);
    const lineasContadas = colores.map((c) => ({ color: c.color, cantidades: Object.fromEntries(tallas.map((t) => [t, Number(conteo[`${c.color}|${t}`]) || 0]).filter(([, n]) => n > 0)) }));
    const diferencias = [];
    colores.forEach((c) => tallas.forEach((t) => {
      const dif = (Number(conteo[`${c.color}|${t}`]) || 0) - (Number(declarado[`${c.color}|${t}`]) || 0);
      if (dif) diferencias.push({ color: c.color, talla: t, dif });
    }));
    const resultado = diferencias.length ? "diferencias" : "completa";
    await accion(d, "revisada", { conteo: lineasContadas, diferencias, resultado, totalContado: totalLineas(lineasContadas), revisadoPor: usuario, revisadoEn: nowISO() },
      resultado === "completa" ? "Conteo completo" : "Conteo con diferencias");
  }

  const botones = (d) => {
    const ocupado = trabajando === d.id;
    if (modo === "bodega") {
      if (d.estado === "reportada" || d.estado === "en_camino") return <button disabled={ocupado} onClick={() => accion(d, "recibida", { recibidaPor: usuario, recibidaEn: nowISO() })} style={btn(T, "primario")}>Marcar como recibida</button>;
      if (d.estado === "lista") {
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Fecha</div><input type="date" value={redes.fecha} onChange={(e) => setRedes({ ...redes, fecha: e.target.value })} style={campo(T)} /></div>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Guía</div><input value={redes.guia} onChange={(e) => setRedes({ ...redes, guia: e.target.value })} placeholder="Número de guía" style={campo(T)} /></div>
            <button disabled={ocupado || !redes.fecha} onClick={() => accion(d, "redespachada", { redespacho: { fecha: redes.fecha, guia: redes.guia.trim(), por: usuario } })} style={btn(T, "primario")}>Despachada de nuevo</button>
          </div>
        );
      }
      return null;
    }
    if (d.estado === "recibida") return null; // el conteo tiene su propio botón abajo
    if (d.estado === "revisada") return <button disabled={ocupado} onClick={() => accion(d, "lista", {})} style={btn(T, "primario")}>Dejar lista para despachar</button>;
    return null;
  };

  const tarjeta = { background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 18px" };
  return (
    <div style={{ maxWidth: 940 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, marginBottom: 4 }}>Devoluciones de clientes</div>
      <div style={{ fontSize: 13, color: T.slate, marginBottom: 12 }}>
        {modo === "bodega" ? "Marca cada devolución como recibida cuando llega la mercancía, y como despachada de nuevo cuando vuelve a salir." : "Cuenta por color y talla lo que llegó; ATLAS lo compara con lo que declaró el cliente."}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {[["pendientes", modo === "bodega" ? "Por atender" : "Por revisar"], ["todas", "Todas"]].map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{ ...btn(T), background: filtro === k ? T.denimBg : T.white, color: filtro === k ? T.denim : T.ink, borderColor: filtro === k ? T.denim : T.border }}>{t}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número, lote, ref, cliente o guía" style={{ ...campo(T), width: 300 }} />
      </div>
      {error && <div style={{ color: T.coral, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {lista === null ? <div style={{ fontSize: 13, color: T.slate }}>Cargando…</div>
        : !visibles.length ? <div style={{ ...tarjeta, fontSize: 13, color: T.slate }}>{filtro === "pendientes" ? "No hay devoluciones pendientes." : "No hay devoluciones."}</div>
        : visibles.map((d) => (
          <div key={d.id} style={{ ...tarjeta, marginBottom: 10 }}>
            <div onClick={() => abrir(d)} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", cursor: "pointer", alignItems: "center" }}>
              <span style={{ fontSize: 14 }}><b>{d.numero}</b> · {d.cliente || "—"} · lote {d.lote} · ref {d.ref || "—"} · {d.total} und · {fmtFecha(d.creadoEn)}</span>
              <EstadoPill T={T} d={d} />
            </div>
            {abierto === d.id && (
              <>
                <Detalle T={T} d={d} mostrarConteo />
                {msg && <div style={{ color: T.coral, fontSize: 13, marginTop: 8 }}>{msg}</div>}
                {modo === "calidad" && d.estado === "recibida" && (
                  <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 6 }}>CUENTA LO QUE LLEGÓ (por color y talla)</div>
                    <GrillaColorTalla
                      T={T} colores={coloresDeLineas(d.lineas).concat([])} tallas={tallasDeLineas(d.lineas, d.tallas)}
                      valores={conteo} comparar={valoresDeLineas(d.lineas)}
                      onCambiar={(k, v) => setConteo((c) => ({ ...c, [k]: v === "" ? "" : entero(v) }))}
                    />
                    <div style={{ marginTop: 10 }}><button disabled={trabajando === d.id} onClick={() => guardarConteo(d)} style={btn(T, "primario")}>Guardar conteo y marcar como revisada</button></div>
                  </div>
                )}
                <div style={{ marginTop: 12 }}>{botones(d)}</div>
              </>
            )}
          </div>
        ))}
    </div>
  );
}

export function DevolucionesBodegaView(props) {
  return <ListaEquipo {...props} modo="bodega" />;
}
export function DevolucionesCalidadView(props) {
  return <ListaEquipo {...props} modo="calidad" />;
}
