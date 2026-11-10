import React, { useState, useEffect, useMemo } from "react";
import { getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { grupoOrigen, grupoOrigenCliente, origenElegidoPorCliente, fechaDePaso, tiempoDevolucion, textoTiempo, etiquetaOrigen, origenDeFacturacion, resumenDespachoJunto, ORIGENES, ORIGENES_ELEGIBLES } from "./devoluciones-tiempos";
import { httpsCallable, getFunctions } from "firebase/functions";

// ─── DEVOLUCIONES DE CLIENTES ────────────────────────────────────────────
// (2026-10-20, a pedido de Fredy) El cliente (primero Kamila Colombia, pero sirve
// para cualquiera) reporta una devolución por lote, color y talla; Bodega la marca
// "Recibida" cuando llega la mercancía y la "Despachada de nuevo" cuando sale otra
// vez (re-despacho SOLO manual, con fecha y guía); Calidad cuenta por color/talla,
// compara contra lo declarado y la marca "Revisada" (completa / con diferencias).
// Colección Firestore: "devoluciones_cliente" (ver firestore.rules: un Cliente solo
// lee lo que él mismo creó; solo el personal interno cambia estados).
//
// (2026-11-09) El tope de cada casilla descuenta lo ya reportado del mismo lote, y el cliente puede marcar "Quiero que me la
// despachen de nuevo" (campo solicitaDespacho {nota, por, fecha}): Bodega y Calidad la ven marcada; el re-despacho sigue manual.
// Estados: reportada -> en_camino -> recibida -> revisada -> lista -> redespachada.
// Si el cliente escribe la guía al reportar, nace "en_camino"; si no, "reportada".
//
// Exporta tres pantallas:
//   DevolucionesClienteView  -> menú lateral (rol Cliente, y admin para previsualizar)
//   DevolucionesBodegaView   -> pestaña "Devoluciones" del módulo Bodega
//   DevolucionesCalidadView  -> lista "Devoluciones de clientes" en Planeación -> Control de Calidad

const COL = "devoluciones_cliente";
const TALLAS_ORDEN = ["T2", "T4", "T6", "T8", "T10", "T12", "T14", "T16", "T18", "T24", "T36"];
// (2026-10-21, a pedido de Fredy) Las columnas de Busint (T6, T8...) se muestran como talla real: en ropa de adulto
// con letras (T6 = S, T8 = M, T10 = L, T12 = XL...) y en ropa infantil con el número (T6 = 6, T8 = 8...).
// Por dentro los datos siguen guardados como T6, T8, etc.
const TALLAS_ADULTO = { T2: "U", T4: "XS", T6: "S", T8: "M", T10: "L", T12: "XL", T14: "2XL", T16: "3XL", T18: "4XL" };
const etiquetaTalla = (t, infantil) => (infantil ? String(t).replace(/^T/, "") : TALLAS_ADULTO[t] || String(t));
const esInfantilGrupo = (g) => /ni[ñn][oa]/i.test(String(g || ""));
// Un cambio hecho a mano (tallasInfantil) manda sobre lo que se dedujo de la línea de la referencia.
const esInfantilDev = (d) => (d?.tallasInfantil === true || d?.tallasInfantil === false ? d.tallasInfantil : esInfantilGrupo(d?.grupo));
const MOTIVOS = ["Defecto de costura", "Defecto de tela", "Talla equivocada", "Excedente", "Otro"];
const TRANSPORTADORAS = ["Servientrega", "Coordinadora", "Interrapidísimo", "Envía", "Otra"];
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
// (2026-11-10, a pedido de Fredy) Documento original de TNS: la cliente lo escribe al reportar (remisión si es Remisionada, factura si es Facturada)
// y Jesús escribe el documento NUEVO al despachar de nuevo. Se guardan como documentoOriginal y redespacho.documentoNuevo.
const DOC_MIN = 3;
const docValido = (v) => String(v || "").trim().length >= DOC_MIN;
const etiquetaDocOriginal = (origenTipo) => (origenTipo === "factura" ? "Número de factura" : "Número de remisión de TNS");
const MONO = { fontFamily: "ui-monospace, Menlo, Consolas, monospace" };
const totalLineas = (lineas) => (lineas || []).reduce((s, l) => s + Object.values(l.cantidades || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);
// (2026-11-09, a pedido de Fredy) Lo ya devuelto de un lote, por casilla "color|talla": suma las devoluciones de ese lote
// (menos la que se está editando y las ya despachadas de nuevo, porque esas unidades volvieron al cliente).
function yaDevueltoDelLote(lista, lote, excluirId) {
  const u = {};
  (lista || []).forEach((x) => {
    if (String(x.lote) !== String(lote) || x.id === excluirId || x.estado === "redespachada") return;
    (x.lineas || []).forEach((l) => Object.entries(l.cantidades || {}).forEach(([t, n]) => { const k = `${l.color}|${t}`; u[k] = (u[k] || 0) + (Number(n) || 0); }));
  });
  return u;
}
// Casillas que se pasan de lo disponible (tope menos lo ya devuelto). `base` = cantidades que ya tenía la devolución al editarla
// (no se reclama por lo que ya estaba guardado, solo por lo que se sube).
function casillasPasadas(colores, tallas, cant, usado, infantil, base) {
  return colores.flatMap((c) => tallas
    .filter((t) => {
      const k = `${c.color}|${t}`;
      const v = Number(cant[k]) || 0;
      const disponible = Math.max(0, (Number(c.tallas?.[t]) || 0) - (Number(usado?.[k]) || 0));
      return v > disponible && v > (Number(base?.[k]) || 0);
    })
    .map((t) => `${c.nombre || c.color} ${etiquetaTalla(t, infantil)}`));
}
// Colores con su tope: lo despachado según la factura si Busint lo separa por color; si no, lo cortado del lote.
function coloresConTope(info) {
  if (!info) return [];
  const porColor = !!info.facturacion?.porColor;
  return info.colores.map((c) => (porColor && c.despachado ? { ...c, tallas: c.despachado } : c));
}
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
function EstadoPill({ T, d, cliente }) {
  const e = estadoInfo(T, d.estado);
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      <Pill T={T} bg={e.bg} fg={e.fg}>{e.txt}</Pill>
      {d.solicitaDespacho && d.estado !== "redespachada" && <Pill T={T} bg={T.violetBg} fg={T.violet}>{cliente ? "Despacho solicitado" : "Pide despacho"}</Pill>}
      {d.resultado === "diferencias" && <Pill T={T} bg={T.coralBg} fg={T.coral}>Con diferencias</Pill>}
      {d.resultado === "completa" && <Pill T={T} bg={T.jadeBg} fg={T.jade}>Completa</Pill>}
      {cliente && d.estado === "reportada" && !String(d.guia || "").trim() ? <Pill T={T} bg={T.coral} fg="#fff">📦 Falta la guía de salida</Pill> : null}
      {String(d.guia || "").trim() ? <Pill T={T} bg={T.jadeBg} fg={T.jade}>Guía {d.guia}{d.transportadora ? ` · ${d.transportadora}` : ""}</Pill> : null}
      {d.origen?.tipo ? <Pill T={T} bg={T.canvas} fg={T.slate}>{d.origen.tipo === "factura" ? "🧾 " : d.origen.tipo === "sin_dato" ? "" : "🚚 "}{etiquetaOrigen(d.origen)}{d.origen.confirmar ? " · por confirmar" : ""}</Pill> : null}
      {(() => {
        const t = tiempoDevolucion(d);
        const c = t.cerrada ? (t.tardo ? [T.amberBg, T.amber] : [T.canvas, T.slate]) : t.nivel === "rojo" ? [T.coralBg, T.coral] : t.nivel === "ambar" ? [T.amberBg, T.amber] : [T.jadeBg, T.jade];
        return <Pill T={T} bg={c[0]} fg={c[1]}>{textoTiempo(t)}</Pill>;
      })()}
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

// "A · BLANCO" si se conoce el nombre del color (viene del pedido); si no, solo la letra.
const etiquetaColor = (c) => (c && c.nombre ? `${c.color} · ${c.nombre}` : String(c?.color ?? ""));
// Tabla color x talla. `valores` = { "color|T6": n }. Con `editable` muestra inputs; `tope` = cantidades máximas del lote.
function GrillaColorTalla({ T, colores, tallas, valores, onCambiar, tope, usado, editable = true, comparar, infantil = false }) {
  const th = { padding: "6px 8px", fontSize: 11, color: T.slate, textAlign: "center", borderBottom: `1px solid ${T.border}` };
  const td = { padding: "6px 8px", textAlign: "center", borderBottom: `1px solid ${T.border}`, fontSize: 13 };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Color</th>
            {tallas.map((t) => <th key={t} style={th} title={t}>{etiquetaTalla(t, infantil)}</th>)}
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {colores.map((c) => {
            const fila = tallas.reduce((s, t) => s + (Number(valores[`${c.color}|${t}`]) || 0), 0);
            return (
              <tr key={c.color}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{etiquetaColor(c)}</td>
                {tallas.map((t) => {
                  const k = `${c.color}|${t}`;
                  const totalCasilla = tope ? c.tallas?.[t] || 0 : 0;
                  const ya = tope ? Number(usado?.[k]) || 0 : 0;
                  const cap = tope ? Math.max(0, totalCasilla - ya) : null;
                  const declarado = comparar ? Number(comparar[k]) || 0 : null;
                  const v = Number(valores[k]) || 0;
                  const dif = declarado === null ? 0 : v - declarado;
                  if (!editable) return <td key={t} style={td}>{v || "·"}</td>;
                  if (tope && !totalCasilla) return <td key={t} style={{ ...td, color: T.slate }}>·</td>;
                  if (tope && !cap) return <td key={t} style={{ ...td, color: T.slate }}>·<div style={{ fontSize: 10, marginTop: 2 }}>ya devuelto {ya} de {totalCasilla}</div></td>;
                  return (
                    <td key={t} style={td}>
                      <input
                        type="number" min="0" max={cap || undefined} value={valores[k] ?? ""}
                        onChange={(e) => onCambiar(k, e.target.value, cap)}
                        style={{ ...campo(T), width: 58, textAlign: "center", padding: 0, borderColor: dif < 0 ? T.coral : dif > 0 ? T.amber : T.border }}
                      />
                      {tope && <div style={{ fontSize: 10, color: T.slate, marginTop: 2 }}>{ya ? `quedan ${cap} de ${totalCasilla}` : `de ${totalCasilla}`}</div>}
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
  return (lineas || []).map((l) => ({ color: l.color, nombre: l.colorNombre || "", tallas: l.cantidades || {} }));
}
function tallasDeLineas(lineas, extra) {
  const set = new Set(extra || []);
  (lineas || []).forEach((l) => Object.keys(l.cantidades || {}).forEach((t) => set.add(t)));
  return TALLAS_ORDEN.filter((t) => set.has(t));
}

function Linea({ T, estado, d }) {
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
            {(() => { const f = d && i <= idx ? fechaDePaso(d, p) : ""; return f ? <div style={{ fontSize: 10, color: T.slate, fontWeight: 400, marginTop: 2 }}>{fmtFecha(f)}</div> : null; })()}
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
  const infantil = esInfantilDev(d);
  return (
    <div style={{ paddingTop: 10 }}>
      <Linea T={T} estado={d.estado} d={d} />
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>
        Lote <b style={{ color: T.ink }}>{d.lote}</b> · Ref {d.ref || "—"}{d.pedido ? ` · Pedido ${d.pedido}` : ""} · Motivo: {d.motivo || "—"} · Guía: {d.guia || "—"}{d.transportadora ? ` · ${d.transportadora}` : ""}{d.fechaSalida ? ` · salió el ${fmtFecha(d.fechaSalida)}` : ""}
      </div>
      {d.envioJunto?.length ? <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>Viene en el mismo envío con: <b style={{ color: T.ink }}>{d.envioJunto.join(", ")}</b></div> : null}
      {d.origen?.tipo ? <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>Origen en Busint: <b style={{ color: T.ink }}>{etiquetaOrigen(d.origen)}</b>{d.origen.documentos?.length ? ` · ${d.origen.documentos.join(", ")}` : ""}{d.origen.fuente === "manual" ? " (confirmado a mano)" : ""}{d.origen.confirmar ? ` · por confirmar (la cliente la montó como ${etiquetaOrigen(d.origen)}; Busint la muestra como ${etiquetaOrigen({ tipo: d.origen.busint })})` : ""}</div> : null}
      {String(d.documentoOriginal || "").trim() ? <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>{d.origen?.tipo === "factura" ? "Factura original" : "Remisión original (TNS)"}: <b style={{ color: T.ink, ...MONO }}>{d.documentoOriginal}</b></div> : null}
      {d.observaciones ? <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>Nota del cliente: {d.observaciones}</div> : null}
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, margin: "6px 0" }}>DECLARADO POR EL CLIENTE</div>
      <GrillaColorTalla T={T} colores={coloresDeLineas(d.lineas)} tallas={tallas} valores={valores} editable={false} infantil={infantil} />
      {mostrarConteo && d.conteo?.length ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, margin: "12px 0 6px" }}>CONTADO POR CALIDAD</div>
          <GrillaColorTalla T={T} colores={coloresDeLineas(d.conteo)} tallas={tallasDeLineas(d.conteo, tallas)} valores={conteoVal} editable={false} infantil={infantil} />
          {(d.diferencias || []).length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {d.diferencias.map((x) => (
                <Pill key={`${x.color}|${x.talla}`} T={T} bg={x.dif < 0 ? T.coralBg : T.amberBg} fg={x.dif < 0 ? T.coral : T.amber}>
                  {x.colorNombre ? `${x.color} · ${x.colorNombre}` : x.color} {etiquetaTalla(x.talla, infantil)}: {x.dif < 0 ? `falta ${-x.dif}` : `sobra ${x.dif}`}
                </Pill>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {!mostrarConteo && d.estado === "redespachada" && d.conteo?.length ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, margin: "12px 0 6px" }}>LO QUE TE ENVIAMOS DE NUEVO</div>
          <GrillaColorTalla T={T} colores={coloresDeLineas(d.conteo)} tallas={tallasDeLineas(d.conteo, tallas)} valores={conteoVal} editable={false} infantil={infantil} />
          {totalLineas(d.lineas) > totalLineas(d.conteo) ? (
            <div style={{ background: T.coralBg, color: T.coral, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginTop: 8 }}>
              Recibimos {totalLineas(d.conteo)} de las {totalLineas(d.lineas)} unidades que reportaste; te enviamos las {totalLineas(d.conteo)} que llegaron.
            </div>
          ) : null}
        </>
      ) : null}
      {d.solicitaDespacho ? (
        <div style={{ fontSize: 12, color: T.violet, marginTop: 10 }}>
          Despacho de nuevo solicitado{d.solicitaDespacho.por ? ` por ${d.solicitaDespacho.por}` : ""} el {fmtFecha(d.solicitaDespacho.fecha)}{d.solicitaDespacho.nota ? ` · ${d.solicitaDespacho.nota}` : ""}
        </div>
      ) : null}
      {d.redespacho ? (
        <div style={{ fontSize: 12, color: T.slate, marginTop: 10 }}>
          Despachada de nuevo el {fmtFecha(d.redespacho.fecha)}{d.redespacho.guia ? ` · guía ${d.redespacho.guia}` : ""}{String(d.redespacho.documentoNuevo || "").trim() ? <> · nueva remisión/factura <b style={{ color: T.ink, ...MONO }}>{d.redespacho.documentoNuevo}</b></> : null}{d.redespacho.junto?.length ? ` · junto con ${d.redespacho.junto.join(", ")}` : ""}
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

function recalcularDiferencias(lineasDecl, lineasConteo) {
  const decl = valoresDeLineas(lineasDecl), cont = valoresDeLineas(lineasConteo);
  const nombres = {};
  [...(lineasDecl || []), ...(lineasConteo || [])].forEach((l) => { nombres[l.color] = l.colorNombre || ""; });
  const dif = [];
  new Set([...Object.keys(decl), ...Object.keys(cont)]).forEach((k) => {
    const [color, talla] = k.split("|");
    const x = (Number(cont[k]) || 0) - (Number(decl[k]) || 0);
    if (x) dif.push({ color, colorNombre: nombres[color] || "", talla, dif: x });
  });
  return dif;
}

// (2026-10-21, a pedido de Fredy) Editar una devolución: la pueden editar todos los usuarios que tienen Devoluciones
// (el cliente solo mientras está reportada / en camino, antes de que Bodega la reciba); borrarla, solo el administrador.
const puedeEditarDev = (d, esCliente) => (esCliente ? ["reportada", "en_camino"].includes(d.estado) : true);
function EditarDevolucionModal({ db, functionsClient, T, d, usuario, lista, esCliente, onClose }) {
  const [info, setInfo] = useState(null);
  const [origenTipo, setOrigenTipo] = useState(d.origen?.tipo || "");
  const detectado = useMemo(() => origenDeFacturacion(info?.facturacion), [info]);
  const origenActual = origenTipo || detectado?.tipo || "sin_dato";
  const [cant, setCant] = useState(valoresDeLineas(d.lineas));
  const [motivo, setMotivo] = useState(d.motivo || MOTIVOS[0]);
  const [guia, setGuia] = useState(d.guia || "");
  const [transp, setTransp] = useState(d.transportadora || "");
  const [obs, setObs] = useState(d.observaciones || "");
  const [docOrig, setDocOrig] = useState(d.documentoOriginal || "");
  const [infantil, setInfantil] = useState(esInfantilDev(d));
  const [pide, setPide] = useState(!!d.solicitaDespacho);
  const [notaDesp, setNotaDesp] = useState(d.solicitaDespacho?.nota || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    let fx = functionsClient;
    try { if (!fx) fx = getFunctions(getApps()[0]); } catch { fx = null; }
    if (fx) {
      httpsCallable(fx, "consultarLoteParaDevolucion")({ lote: String(d.lote) })
        .then((r) => { if (vivo && r.data && !r.data.sinDetalle) setInfo(r.data); })
        .catch(() => {}); // sin la consulta se edita solo lo que ya traía la devolución
    }
    return () => { vivo = false; };
  }, []); // eslint-disable-line
  const colores = info ? coloresConTope(info) : coloresDeLineas(d.lineas);
  const usado = useMemo(() => yaDevueltoDelLote(lista, d.lote, d.id), [lista, d.lote, d.id]);
  const tallas = tallasDeLineas(d.lineas, [...(d.tallas || []), ...(info?.tallas || [])]);
  const total = Object.values(cant).reduce((a, v) => a + (Number(v) || 0), 0);
  function cambiar(k, v, cap) {
    let n = v === "" ? "" : entero(v);
    if (n !== "" && cap && n > cap) n = cap;
    setCant((c) => ({ ...c, [k]: n }));
  }
  async function guardar() {
    setError("");
    if (!(total > 0)) { setError("Escribe al menos una unidad."); return; }
    if (esCliente && !docValido(docOrig)) { setError(`Escribe el ${etiquetaDocOriginal(origenActual).toLowerCase()} con el que te despachamos este lote.`); return; }
    const pasadas = info ? casillasPasadas(colores, tallas, cant, usado, infantil, valoresDeLineas(d.lineas)) : [];
    if (pasadas.length) { setError(`Hay cantidades por encima de lo que queda por devolver (tope menos lo ya reportado en otras devoluciones del lote): ${pasadas.join(", ")}.`); return; }
    const lineas = colores
      .map((c) => ({ color: c.color, colorNombre: c.nombre || "", cantidades: Object.fromEntries(tallas.map((t) => [t, Number(cant[`${c.color}|${t}`]) || 0]).filter(([, n]) => n > 0)) }))
      .filter((l) => Object.keys(l.cantidades).length);
    const cambios = [];
    if (total !== d.total) cambios.push(`unidades ${d.total} → ${total}`);
    else if (JSON.stringify(valoresDeLineas(lineas)) !== JSON.stringify(valoresDeLineas(d.lineas))) cambios.push("cantidades por color/talla");
    if (motivo !== d.motivo) cambios.push(`motivo: ${motivo}`);
    if (guia.trim() !== (d.guia || "")) cambios.push(`guía: ${guia.trim() || "—"}`);
    if (transp !== (d.transportadora || "")) cambios.push(`transportadora: ${transp || "—"}`);
    // Si estaba «Reportada» y ahora tiene guía de salida, pasa sola a «En camino».
    const pasaEnCamino = d.estado === "reportada" && !!guia.trim() && !String(d.guia || "").trim();
    if (pasaEnCamino) cambios.push("pasa a En camino");
    if (obs.trim() !== (d.observaciones || "")) cambios.push("nota");
    if (docOrig.trim() !== (d.documentoOriginal || "")) cambios.push(`documento original: ${docOrig.trim() || "—"}`);
    if (infantil !== esInfantilDev(d)) cambios.push(`tallas en ${infantil ? "números" : "letras"}`);
    if (pide !== !!d.solicitaDespacho) cambios.push(pide ? "pide el despacho de nuevo" : "quitó la solicitud de despacho");
    else if (pide && notaDesp.trim() !== (d.solicitaDespacho?.nota || "")) cambios.push("nota del despacho");
    const extra = { lineas, tallas, total: totalLineas(lineas), motivo, guia: guia.trim(), transportadora: transp, observaciones: obs.trim(), documentoOriginal: docOrig.trim(), tallasInfantil: infantil, editadoPor: usuario, editadoEn: nowISO() };
    if (pide) extra.solicitaDespacho = { nota: notaDesp.trim(), por: d.solicitaDespacho?.por || usuario, fecha: d.solicitaDespacho?.fecha || nowISO() };
    else if (d.solicitaDespacho) extra.solicitaDespacho = null;
    // Origen en Busint (factura / traslado externo): el personal lo puede corregir; si no, queda el que detectó Busint.
    const tipoOrigen = esCliente ? (d.origen?.tipo || detectado?.tipo || "") : (origenTipo || detectado?.tipo || "");
    const confirmando = !esCliente && !!d.origen?.confirmar;
    if (tipoOrigen && (tipoOrigen !== d.origen?.tipo || confirmando)) {
      const manual = confirmando || (!esCliente && !!origenTipo && origenTipo !== detectado?.tipo);
      extra.origen = { tipo: tipoOrigen, documentos: !manual && detectado?.tipo === tipoOrigen ? detectado.documentos : (d.origen?.documentos || []), fuente: manual ? "manual" : "busint" };
      cambios.push(`origen ${confirmando ? "confirmado" : ""}: ${ORIGENES[tipoOrigen] || tipoOrigen}`.replace("origen :", "origen:"));
    }
    if (d.conteo?.length) {
      extra.diferencias = recalcularDiferencias(lineas, d.conteo);
      extra.resultado = extra.diferencias.length ? "diferencias" : "completa";
    }
    setGuardando(true);
    try {
      await cambiarEstado(db, d, pasaEnCamino ? "en_camino" : d.estado, extra, usuario, `Editó la devolución${cambios.length ? `: ${cambios.join("; ")}` : ""}`);
      onClose();
    } catch (e) {
      setError(e?.message || "No se pudo guardar la edición.");
      setGuardando(false);
    }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.white, borderRadius: 14, padding: 24, maxWidth: 760, width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: T.ink, marginBottom: 4 }}>Editar devolución {d.numero}</div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 14 }}>Lote {d.lote} · Ref {d.ref || "—"}. {info ? "Cada casilla tiene como tope lo despachado (o lo del lote) menos lo ya reportado en otras devoluciones del lote." : "Se editan las cantidades de los colores ya declarados."}</div>
        <GrillaColorTalla T={T} colores={colores} tallas={tallas} valores={cant} onCambiar={cambiar} tope={!!info} usado={usado} infantil={infantil} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
          <div style={{ flex: 1, minWidth: 170 }}>
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Motivo</div>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...campo(T), width: "100%" }}>{[...new Set([...MOTIVOS, motivo])].map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <div style={{ flex: 1, minWidth: 170 }}>
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Guía de transporte</div>
            <input value={guia} onChange={(e) => setGuia(e.target.value)} style={{ ...campo(T), width: "100%" }} />
          </div>
          <div style={{ flex: 1, minWidth: 170 }}>
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Transportadora (opcional)</div>
            <select value={transp} onChange={(e) => setTransp(e.target.value)} style={{ ...campo(T), width: "100%" }}>
              <option value="">Elegir…</option>
              {[...new Set([...TRANSPORTADORAS, ...(transp ? [transp] : [])])].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 170 }}>
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Tallas se muestran en</div>
            <select value={infantil ? "num" : "let"} onChange={(e) => setInfantil(e.target.value === "num")} style={{ ...campo(T), width: "100%" }}>
              <option value="let">Letras (adulto: S, M, L, XL)</option>
              <option value="num">Números (niños: 6, 8, 10, 12)</option>
            </select>
          </div>
          {!esCliente && (
            <div style={{ flex: 1, minWidth: 170 }}>
              <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Origen en Busint</div>
              <select value={origenActual} onChange={(e) => setOrigenTipo(e.target.value)} style={{ ...campo(T), width: "100%" }}>
                {[...new Set([...ORIGENES_ELEGIBLES, origenActual])].map((o) => <option key={o} value={o}>{ORIGENES[o] || o}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>{etiquetaDocOriginal(origenActual)}{esCliente ? " *" : ""}</div>
          <input value={docOrig} onChange={(e) => setDocOrig(e.target.value)} placeholder="Número del documento" style={{ ...campo(T), width: 260 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Nota</div>
          <input value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...campo(T), width: "100%" }} />
        </div>
        {d.estado !== "redespachada" && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.ink, cursor: "pointer" }}>
              <input type="checkbox" checked={pide} onChange={(e) => setPide(e.target.checked)} />
              Quiero que me la despachen de nuevo cuando la revisen
            </label>
            {pide && <input value={notaDesp} onChange={(e) => setNotaDesp(e.target.value)} placeholder="Nota para el despacho (opcional)" style={{ ...campo(T), width: "100%", marginTop: 8 }} />}
          </div>
        )}
        {d.conteo?.length ? <div style={{ fontSize: 12, color: T.amber, marginBottom: 10 }}>Esta devolución ya fue contada por Calidad: al guardar, las diferencias se recalculan contra lo nuevo declarado.</div> : null}
        {error && <div style={{ background: T.coralBg, color: T.coral, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.slate }}>Total: <b style={{ color: T.ink }}>{total} unidades</b></span>
          <span style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={guardando} style={btn(T)}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={btn(T, "primario")}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
// Botones ✎ Editar (quien tenga Devoluciones) y 🗑 Borrar (solo el administrador) + la ventana de edición.
function AccionesDevolucion({ db, functionsClient, T, d, lista, currentUser, esCliente, onBorrado }) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState("");
  const usuario = usuarioActual(currentUser);
  const puedeEditar = puedeEditarDev(d, esCliente);
  const puedeBorrar = !!currentUser?.isAdmin;
  if (!puedeEditar && !puedeBorrar) return null;
  async function borrar() {
    if (!window.confirm(`¿Borrar la devolución ${d.numero} (lote ${d.lote})? No se puede deshacer.`)) return;
    try { await deleteDoc(doc(db, COL, d.id)); onBorrado?.(); }
    catch (e) { setError(e?.message || "No se pudo borrar."); }
  }
  return (
    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {puedeEditar && <button onClick={() => setEditando(true)} style={btn(T)}>✎ Editar</button>}
      {puedeBorrar && <button onClick={borrar} style={{ ...btn(T), color: T.coral, borderColor: T.coral }}>🗑 Borrar</button>}
      {error && <span style={{ color: T.coral, fontSize: 12 }}>{error}</span>}
      {editando && <EditarDevolucionModal db={db} functionsClient={functionsClient} T={T} d={d} usuario={usuario} lista={lista} esCliente={esCliente} onClose={() => setEditando(false)} />}
    </div>
  );
}

// (2026-10-23, a pedido de Fredy) Qué se despachó de este lote según Busint (factura con "LOTE <n>" en el comentario;
// si no hay, lo que aparece por pedido + referencia como guía).
function AvisoFacturacion({ T, info }) {
  const f = info?.facturacion;
  if (!f || f.estado === "sin_consulta") return null;
  const caja = (color, bg, txt) => <div style={{ background: bg, color, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{txt}</div>;
  const listaFac = (f.facturas || []).map((x) => `${x.tipo || "FAC"} ${x.nfact}${x.fecha ? ` · ${fmtFecha(x.fecha)}` : ""}`).join("  |  ");
  if (f.estado === "factura_lote") {
    return caja(T.jade, T.jadeBg, <>Facturado: <b>{listaFac}</b> · {f.unidades} unidades despachadas. {f.porColor ? "Solo puedes devolver lo que se despachó en cada color y talla." : "No pude separar lo despachado por color; los topes siguen siendo la cantidad del lote."}</>);
  }
  if (f.estado === "por_pedido") {
    const partes = [];
    if (f.unidadesFactura > 0) partes.push(`${f.unidadesFactura} und facturadas${listaFac ? ` (${listaFac})` : ""}`);
    if (f.unidadesTraslado) partes.push(`${f.unidadesTraslado} und en traslado ${(f.tiposTraslado || []).filter((t) => t === "TCO" || t === "TEX").join("/")}`.trim());
    return caja(T.amber, T.amberBg, <>No encontré una factura con el número de este lote. Para el pedido {info.pedido} y la ref {info.ref} aparecen: {partes.join(" · ") || "movimientos"}{f.ultimaFecha ? ` · último ${fmtFecha(f.ultimaFecha)}` : ""} (puede incluir otros lotes del mismo pedido). Los topes son la cantidad del lote.</>);
  }
  if (f.estado === "sin_factura") return caja(T.amber, T.amberBg, "Este lote todavía no aparece facturado ni despachado en Busint. Los topes son la cantidad del lote.");
  return null;
}

// ─── PANTALLA DEL CLIENTE ────────────────────────────────────────────────
function FormularioDevolucionesCliente({ db, functionsClient, T: Tp, currentUser, tipo, onVolverHub }) {
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
  const [transp, setTransp] = useState("");
  const [obs, setObs] = useState("");
  const [pideDesp, setPideDesp] = useState(false);
  const [notaDesp, setNotaDesp] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [abierto, setAbierto] = useState(null);
  // Varias devoluciones, un solo envío: se marcan las que no tienen guía y se les pone una guía a todas.
  const [selG, setSelG] = useState([]);
  const [envio, setEnvio] = useState({ guia: "", transp: "", fecha: new Date().toISOString().slice(0, 10) });
  const [guardandoEnvio, setGuardandoEnvio] = useState(false);
  const [msgEnvio, setMsgEnvio] = useState("");
  // (2026-11-10, a pedido de Fredy) Documento original de TNS: obligatorio al reportar. En Facturadas, si Busint muestra una sola factura del lote, ya viene escrita.
  const [docOrig, setDocOrig] = useState("");
  const facturasBusint = useMemo(() => (info?.facturacion?.facturas || []).map((x) => String(x.nfact || "").trim()).filter(Boolean), [info]);
  useEffect(() => { setDocOrig(tipo === "factura" && facturasBusint.length === 1 ? facturasBusint[0] : ""); }, [info]); // eslint-disable-line
  const etiquetaDoc = etiquetaDocOriginal(tipo === "factura" ? "factura" : "traslado_externo");
  const sinGuia = (d) => d.estado === "reportada" && !String(d.guia || "").trim();
  const listaTipo = lista === null ? null : lista.filter((d) => grupoOrigenCliente(d) === tipo);
  const selValidas = selG.filter((id) => (lista || []).some((d) => d.id === id && sinGuia(d)));
  async function guardarEnvio() {
    const elegidas = (lista || []).filter((d) => selValidas.includes(d.id));
    const guiaN = envio.guia.trim();
    if (!elegidas.length || guiaN.length < 4) return;
    setGuardandoEnvio(true); setMsgEnvio("");
    try {
      const batch = writeBatch(db);
      const envioId = `env_${Date.now()}`;
      const usuario = usuarioActual(currentUser);
      elegidas.forEach((d) => {
        const otras = elegidas.filter((x) => x.id !== d.id).map((x) => x.numero);
        const nota = `Guía ${guiaN}${envio.transp ? ` · ${envio.transp}` : ""}${otras.length ? ` · junto con ${otras.join(", ")}` : ""}`;
        batch.update(doc(db, COL, d.id), limpio({
          guia: guiaN, transportadora: envio.transp, fechaSalida: envio.fecha, envioId, envioJunto: otras,
          estado: "en_camino", historial: [...(d.historial || []), { estado: "en_camino", fecha: nowISO(), usuario, nota }], actualizadoEn: nowISO(),
        }));
      });
      await batch.commit();
      setMsgEnvio(`Listo: la guía ${guiaN} quedó en ${elegidas.length} ${elegidas.length === 1 ? "devolución" : "devoluciones"}, «En camino».`);
      setSelG([]); setEnvio({ ...envio, guia: "" });
    } catch (e) {
      setMsgEnvio(e?.message || "No se pudo guardar la guía.");
    } finally {
      setGuardandoEnvio(false);
    }
  }

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
    if (n !== "" && cap && n > cap) {
      n = cap;
      const ya = yaDevuelto[k] || 0;
      setAviso(""); setError(ya ? `En esa casilla solo quedan ${cap} unidades por devolver (ya reportaste ${ya} en otras devoluciones de este lote).` : despachoPorColor ? `Solo se despacharon ${cap} unidades en esa casilla según la factura; no puedes devolver más.` : `El lote solo tiene ${cap} unidades en esa casilla.`);
    } else if (n !== "") {
      setError("");
    }
    setCant((c) => ({ ...c, [k]: n }));
  }
  const total = useMemo(() => Object.values(cant).reduce((s, v) => s + (Number(v) || 0), 0), [cant]);
  // (2026-10-23, a pedido de Fredy) Si Busint dice cuánto se despachó por color y talla (factura del lote), ese es el tope;
  // si no, queda lo cortado del lote como antes.
  const despachoPorColor = !!info?.facturacion?.porColor;
  const coloresGrilla = useMemo(() => coloresConTope(info), [info]);
  // (2026-11-09, a pedido de Fredy) Lo que ya se reportó de este lote se descuenta del tope de cada casilla.
  const yaDevuelto = useMemo(() => (info ? yaDevueltoDelLote(lista, info.lote) : {}), [lista, info]);

  async function reportar() {
    setError(""); setAviso("");
    if (!info) return;
    if (!(total > 0)) { setError("Escribe al menos una unidad a devolver."); return; }
    if (!docValido(docOrig)) { setError(`Escribe el ${etiquetaDoc.toLowerCase()} con el que te despachamos este lote.`); return; }
    if (lista === null) { setError("Espera un momento: se están cargando tus devoluciones anteriores del lote."); return; }
    const pasadas = casillasPasadas(coloresGrilla, info.tallas, cant, yaDevuelto, esInfantilGrupo(info.grupo));
    if (pasadas.length) { setError(`Hay cantidades por encima de lo que queda por devolver (${despachoPorColor ? "despachado" : "del lote"} menos lo ya reportado): ${pasadas.join(", ")}.`); return; }
    if (!uid) { setError("No se pudo identificar tu sesión. Cierra sesión y vuelve a entrar."); return; }
    const lineas = info.colores
      .map((c) => ({ color: c.color, colorNombre: c.nombre || "", cantidades: Object.fromEntries(info.tallas.map((t) => [t, Number(cant[`${c.color}|${t}`]) || 0]).filter(([, n]) => n > 0)) }))
      .filter((l) => Object.keys(l.cantidades).length);
    const id = `dev_${Date.now()}`;
    const estado = guia.trim() ? "en_camino" : "reportada";
    const { origen } = origenElegidoPorCliente(tipo, origenDeFacturacion(info.facturacion));
    const d = {
      id, numero: numeroNuevo(), lote: info.lote, ref: info.ref, pedido: info.pedido, cliente: info.cliente,
      tallas: info.tallas, grupo: info.grupo || "", lineas, total: totalLineas(lineas), motivo, guia: guia.trim(), ...(transp ? { transportadora: transp } : {}), observaciones: obs.trim(),
      documentoOriginal: docOrig.trim(), estado, origen, creadoPorUid: uid, creadoPor: usuarioActual(currentUser), creadoEn: nowISO(),
      historial: [{ estado, fecha: nowISO(), usuario: usuarioActual(currentUser), ...(pideDesp ? { nota: "Pide que se la despachen de nuevo" } : {}) }],
      ...(pideDesp ? { solicitaDespacho: { nota: notaDesp.trim(), por: usuarioActual(currentUser), fecha: nowISO() } } : {}),
    };
    setGuardando(true);
    try {
      await setDoc(doc(db, COL, id), limpio(d));
      setAviso(`Devolución ${d.numero} reportada.`);
      setInfo(null); setCant({}); setLote(""); setDocOrig(""); setGuia(""); setTransp(""); setObs(""); setMotivo(MOTIVOS[0]); setPideDesp(false); setNotaDesp("");
    } catch (e) {
      setError(e?.message || "No se pudo guardar la devolución.");
    } finally {
      setGuardando(false);
    }
  }

  const tarjeta = { background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 18 };
  return (
    <div style={{ maxWidth: 900 }}>
      {onVolverHub && <button onClick={onVolverHub} style={{ background: "none", border: "none", color: T.slate, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 10 }}>← Volver a Devoluciones</button>}
      <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, marginBottom: 4 }}>{TITULOS_CLIENTE[tipo] || "Devoluciones"}</div>
      <div style={{ fontSize: 13, color: T.slate, marginBottom: 16 }}>{tipo === "otras" ? "Devoluciones anteriores que todavía no tienen tipo asignado." : "Reporta lo que devuelves por lote, color y talla. Solo puedes consultar lotes de tu cliente."}</div>
      {tipo !== "otras" && <div style={tarjeta}>
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
            <AvisoFacturacion T={T} info={info} />
            {origenElegidoPorCliente(tipo, origenDeFacturacion(info.facturacion)).difiere && (
              <div style={{ background: T.amberBg, color: T.amber, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>
                Busint muestra este lote como {origenDeFacturacion(info.facturacion).tipo === "factura" ? "facturado" : "remisionado (traslado)"}, pero entraste por «{tipo === "factura" ? "Facturadas" : "Remisionadas"}». Puedes reportarla igual: el equipo de Yanko la confirmará.
              </div>
            )}
            <div style={{ fontSize: 12, color: T.slate, marginBottom: 6 }}>Unidades que devuelves, por color y talla (debajo de cada casilla: {despachoPorColor ? "cantidad despachada según la factura" : "cantidad del lote"}; si ya reportaste devoluciones de este lote, se descuentan)</div>
            <GrillaColorTalla T={T} colores={coloresGrilla} tallas={info.tallas} valores={cant} onCambiar={cambiar} tope usado={yaDevuelto} infantil={esInfantilGrupo(info.grupo)} />
            <div style={{ marginTop: 14, background: T.amberBg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: T.ink, fontWeight: 700, marginBottom: 6 }}>{etiquetaDoc} <span style={{ color: T.coral }}>*</span></div>
              <input value={docOrig} onChange={(e) => setDocOrig(e.target.value)} placeholder="Número del documento" aria-label={etiquetaDoc} style={{ ...campo(T), width: 240 }} />
              <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>
                Obligatorio. Es el número del documento con el que te despachamos este lote (viene en la {tipo === "factura" ? "factura" : "remisión"} de la mercancía).
                {facturasBusint.length > 1 ? ` Busint muestra estas facturas del lote: ${facturasBusint.join(", ")}.` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Motivo</div>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...campo(T), width: "100%" }}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
              </div>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Guía de transporte (opcional)</div>
                <input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="Número de guía" style={{ ...campo(T), width: "100%" }} />
              </div>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Transportadora (opcional)</div>
                <select value={transp} onChange={(e) => setTransp(e.target.value)} style={{ ...campo(T), width: "100%" }}>
                  <option value="">Elegir…</option>
                  {TRANSPORTADORAS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>Nota (opcional)</div>
              <input value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...campo(T), width: "100%" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.ink, cursor: "pointer" }}>
                <input type="checkbox" checked={pideDesp} onChange={(e) => setPideDesp(e.target.checked)} />
                Quiero que me la despachen de nuevo cuando la revisen
              </label>
              {pideDesp && <input value={notaDesp} onChange={(e) => setNotaDesp(e.target.value)} placeholder="Nota para el despacho (opcional)" style={{ ...campo(T), width: "100%", marginTop: 8 }} />}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 13, color: T.slate }}>Total a devolver: <b style={{ color: T.ink }}>{total} unidades</b></span>
              <button onClick={reportar} disabled={guardando} style={btn(T, "primario")}>{guardando ? "Guardando…" : "Reportar devolución"}</button>
            </div>
          </>
        )}
      </div>}
      <div style={tarjeta}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{esCliente ? "Tus devoluciones" : "Devoluciones reportadas"}</div>
        {errLista && <div style={{ color: T.coral, fontSize: 13 }}>{errLista}</div>}
        {msgEnvio && selValidas.length === 0 && <div style={{ background: msgEnvio.startsWith("Listo") ? T.jadeBg : T.coralBg, color: msgEnvio.startsWith("Listo") ? T.jade : T.coral, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{msgEnvio}</div>}
        {tipo !== "otras" && (listaTipo || []).some(sinGuia) && (
          <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>
            Las devoluciones sin guía tienen una casilla: márcalas (una o varias) para ponerles <b>una sola guía de salida</b> si las mandas en el mismo envío.{" "}
            <label style={{ cursor: "pointer", fontWeight: 700, color: T.denim }}>
              <input type="checkbox" style={{ marginRight: 4 }} checked={(listaTipo || []).filter(sinGuia).length > 0 && selValidas.length === (listaTipo || []).filter(sinGuia).length}
                onChange={(e) => setSelG(e.target.checked ? (listaTipo || []).filter(sinGuia).map((d) => d.id) : [])} />Marcar todas
            </label>
          </div>
        )}
        {selValidas.length > 0 && (
          <div style={{ background: T.white, border: `1px solid ${T.denim}`, borderRadius: 14, padding: "14px 18px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>Agregar una guía a {selValidas.length} {selValidas.length === 1 ? "devolución" : "devoluciones"}</div>
            <div style={{ fontSize: 12, color: T.slate, margin: "4px 0 10px" }}>Todas pasan a «En camino» con la misma guía y quedan anotadas como un solo envío.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Número de guía</div><input value={envio.guia} onChange={(e) => setEnvio({ ...envio, guia: e.target.value })} placeholder="Ej. 1234567890" style={{ ...campo(T), width: 190 }} /></div>
              <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Transportadora (opcional)</div>
                <select value={envio.transp} onChange={(e) => setEnvio({ ...envio, transp: e.target.value })} style={campo(T)}><option value="">Elegir…</option>{TRANSPORTADORAS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Fecha de salida</div><input type="date" value={envio.fecha} onChange={(e) => setEnvio({ ...envio, fecha: e.target.value })} style={campo(T)} /></div>
              <button disabled={guardandoEnvio || envio.guia.trim().length < 4 || !envio.fecha} onClick={guardarEnvio} style={btn(T, "primario")}>{guardandoEnvio ? "Guardando…" : selValidas.length > 1 ? "Guardar guía en todas" : "Guardar guía"}</button>
            </div>
            {msgEnvio && <div style={{ fontSize: 13, color: T.coral, marginTop: 8 }}>{msgEnvio}</div>}
          </div>
        )}
        {lista === null ? <div style={{ fontSize: 13, color: T.slate }}>Cargando…</div>
          : !lista.filter((d) => grupoOrigenCliente(d) === tipo).length ? <div style={{ fontSize: 13, color: T.slate }}>Todavía no has reportado devoluciones de este tipo.</div>
          : lista.filter((d) => grupoOrigenCliente(d) === tipo).map((d) => (
            <div key={d.id} style={{ borderTop: `1px solid ${T.border}`, padding: "10px 0" }}>
              <div onClick={() => setAbierto(abierto === d.id ? null : d.id)} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", cursor: "pointer", fontSize: 13 }}>
                <span>
                  {sinGuia(d) && (
                    <input type="checkbox" title="Marcar para ponerle la guía de salida" checked={selValidas.includes(d.id)} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setSelG((a) => (e.target.checked ? [...a.filter((x) => x !== d.id), d.id] : a.filter((x) => x !== d.id)))} style={{ marginRight: 8 }} />
                  )}
                  <b>{d.numero}</b> · lote {d.lote} · {d.total} und{String(d.documentoOriginal || "").trim() ? ` · ${d.documentoOriginal}` : ""} · {fmtFecha(d.creadoEn)}
                </span>
                <EstadoPill T={T} d={d} cliente={esCliente} />
              </div>
              {abierto === d.id && (
                <>
                  <Detalle T={T} d={d} mostrarConteo={!esCliente} />
                  <AccionesDevolucion db={db} functionsClient={functionsClient} T={T} d={d} lista={lista} currentUser={currentUser} esCliente={esCliente} onBorrado={() => setAbierto(null)} />
                </>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// (2026-11-10, a pedido de Fredy) La líder de Bodega (permiso «Puede cambiar el estado de las devoluciones», o administrador) puede llevar una
// devolución a CUALQUIER estado, adelante o atrás. Queda en el Historial con su nombre y el motivo; los datos ya guardados (conteo, recibida por…) no se borran.
function CambiarEstadoDev({ T, d, ocupado, onCambiar }) {
  const [nuevo, setNuevo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [guia, setGuia] = useState("");
  const [nuevaRem, setNuevaRem] = useState("");
  const aplicar = () => {
    if (!nuevo) return;
    const de = estadoInfo(T, d.estado).txt;
    const a = estadoInfo(T, nuevo).txt;
    const extra = {};
    if (nuevo === "redespachada") extra.redespacho = { fecha, guia: guia.trim(), ...(nuevaRem.trim() ? { documentoNuevo: nuevaRem.trim() } : {}), por: "" };
    if (nuevo === "recibida" && !d.recibidaEn) extra.recibidaEn = new Date().toISOString();
    if (nuevo === "revisada" && !d.revisadoEn) extra.revisadoEn = new Date().toISOString();
    onCambiar(nuevo, extra, `Cambio de estado: ${de} → ${a}${motivo.trim() ? ` — ${motivo.trim()}` : ""}`);
    setNuevo(""); setMotivo("");
  };
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 6 }}>CAMBIAR ESTADO (líder)</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Pasar a</div>
          <select value={nuevo} onChange={(e) => setNuevo(e.target.value)} style={{ ...campo(T), minWidth: 190 }}>
            <option value="">Elige el estado…</option>
            {PASOS.filter((p) => p !== d.estado).map((p) => <option key={p} value={p}>{estadoInfo(T, p).txt}</option>)}
          </select>
        </div>
        {nuevo === "redespachada" && (
          <>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Fecha</div><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={campo(T)} /></div>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Guía</div><input value={guia} onChange={(e) => setGuia(e.target.value)} placeholder="Número de guía" style={campo(T)} /></div>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Nueva remisión o factura</div><input value={nuevaRem} onChange={(e) => setNuevaRem(e.target.value)} placeholder="Número (opcional)" style={campo(T)} /></div>
          </>
        )}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Motivo (opcional)</div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué cambias el estado" style={{ ...campo(T), width: "100%" }} />
        </div>
        <button disabled={ocupado || !nuevo || (nuevo === "redespachada" && !fecha)} onClick={aplicar} style={btn(T, "primario")}>Cambiar estado</button>
      </div>
    </div>
  );
}

// (2026-11-10, a pedido de Fredy) Resumen para Jesús (Bodega) cuando Anny ya contó la devolución: qué debe ingresar de nuevo en TNS
// (con la remisión o factura original que dio la cliente) y qué va a enviar otra vez a la cliente (con la nueva remisión, que él anota al despachar).
// Las dos listas son lo que Anny contó, por color y talla: lo que no llegó no se puede enviar.
function ResumenBodega({ T, d }) {
  const infantil = esInfantilDev(d);
  const valores = valoresDeLineas(d.conteo);
  const tallas = tallasDeLineas(d.conteo, d.tallas);
  const colores = coloresDeLineas(d.conteo).filter((c) => tallas.some((t) => Number(valores[`${c.color}|${t}`]) > 0));
  const contadas = totalLineas(d.conteo);
  const declaradas = totalLineas(d.lineas);
  const falta = declaradas - contadas;
  const docOrig = String(d.documentoOriginal || "").trim();
  const docNuevo = String(d.redespacho?.documentoNuevo || "").trim();
  const chip = (bg, fg) => ({ ...MONO, fontWeight: 700, fontSize: 12.5, borderRadius: 6, padding: "2px 8px", background: bg, color: fg });
  const caja = (color) => ({ flex: "1 1 300px", minWidth: 0, border: `1px solid ${T.border}`, borderTop: `4px solid ${color}`, borderRadius: 12, padding: "12px 14px", background: T.white });
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>Resumen para Bodega</div>
      <div style={{ fontSize: 12, color: T.slate, margin: "2px 0 8px" }}>Todo sale de lo que Calidad contó{d.revisadoPor ? ` (${d.revisadoPor})` : ""}. Lo que no llegó no se puede enviar.</div>
      {falta > 0 ? (
        <div style={{ background: T.coralBg, color: T.coral, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          Calidad contó {contadas} de las {declaradas} unidades que declaró la cliente: faltan {falta}. Se ingresa y se envía solo lo contado.
        </div>
      ) : falta < 0 ? (
        <div style={{ background: T.amberBg, color: T.amber, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
          Calidad contó {contadas} unidades, {-falta} más de las {declaradas} que declaró la cliente.
        </div>
      ) : (
        <div style={{ background: T.jadeBg, color: T.jade, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>El conteo coincide con lo declarado por la cliente ({contadas} und).</div>
      )}
      {!contadas ? (
        <div style={{ fontSize: 13, color: T.slate }}>No llegó ninguna unidad: no hay nada que ingresar ni enviar.</div>
      ) : (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={caja(T.denim)}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>① Ingresar de nuevo en TNS</div>
            <div style={{ fontSize: 12, color: T.slate, margin: "4px 0 8px" }}>
              {d.origen?.tipo === "factura" ? "Factura original" : "Remisión original"}: {docOrig ? <span style={chip(T.violetBg, T.violet)}>{docOrig}</span> : <span style={chip(T.amberBg, T.amber)}>falta: pídela a la cliente o anótala con ✎ Editar</span>}
              {d.origen?.tipo ? <span> · {etiquetaOrigen(d.origen)}</span> : null}
            </div>
            <GrillaColorTalla T={T} colores={colores} tallas={tallas} valores={valores} editable={false} infantil={infantil} />
            <div style={{ fontSize: 12, color: T.slate, marginTop: 6 }}>Lote {d.lote} · <b style={{ color: T.ink }}>{contadas} und</b></div>
          </div>
          <div style={caja(T.jade)}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>② Enviar otra vez a la cliente</div>
            <div style={{ fontSize: 12, color: T.slate, margin: "4px 0 8px" }}>
              Nueva remisión: {docNuevo ? <span style={chip(T.jadeBg, T.jade)}>{docNuevo}</span> : <span style={chip(T.amberBg, T.amber)}>pendiente: se anota al despachar</span>}
            </div>
            <GrillaColorTalla T={T} colores={colores} tallas={tallas} valores={valores} editable={false} infantil={infantil} />
            <div style={{ fontSize: 12, color: T.slate, marginTop: 6 }}>Lote {d.lote} · <b style={{ color: T.ink }}>{contadas} und</b></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LISTA PARA EL EQUIPO (Bodega y Calidad) ─────────────────────────────
function ListaEquipo({ db, T: Tp, currentUser, modo, puedeCambiarEstado, tipo, onVolverHub }) {
  const T = Tp || TEMA_DEFECTO;
  const { lista, error } = useDevoluciones(db, null);
  // `tipo` (solo Bodega): la tarjeta elegida en el menú de Devoluciones. null = todas, como antes.
  const enTipo = (d) => !tipo || (tipo === "despachar" ? d.estado === "lista" : tipo === "clasificar" ? d.estado !== "redespachada" && grupoOrigen(d) === "clasificar" : grupoOrigen(d) === tipo);
  const base = (lista || []).filter(enTipo);
  const [filtro, setFiltro] = useState(tipo === "clasificar" || tipo === "despachar" ? "todas" : "pendientes");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [msg, setMsg] = useState("");
  const [redes, setRedes] = useState({ fecha: new Date().toISOString().slice(0, 10), guia: "", nuevo: "" });
  const [conteo, setConteo] = useState({});
  const [sel, setSel] = useState([]); // devoluciones marcadas para despacharlas juntas (solo Bodega, «Lista para despachar»)
  const [juntas, setJuntas] = useState({ fecha: new Date().toISOString().slice(0, 10), guia: "", nuevo: "" });
  const [msgJunto, setMsgJunto] = useState("");
  const usuario = usuarioActual(currentUser);

  const pendiente = (d) => (modo === "bodega" ? ["reportada", "en_camino", "lista"].includes(d.estado) : ["recibida", "revisada"].includes(d.estado));
  const pideDespacho = (d) => !!d.solicitaDespacho && d.estado !== "redespachada";
  const cuantosPiden = base.filter(pideDespacho).length;
  const atrasadas = base.filter((d) => tiempoDevolucion(d).atrasada).length;
  const visiblesBase = base.filter((d) => {
    if (filtro === "pendientes" && !pendiente(d)) return false;
    if (filtro === "atrasadas" && !tiempoDevolucion(d).atrasada) return false;
    if (filtro === "piden" && !pideDespacho(d)) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [d.numero, d.lote, d.ref, d.cliente, d.guia, d.documentoOriginal, d.redespacho?.documentoNuevo].some((x) => String(x || "").toLowerCase().includes(t));
  });
  // Lo pendiente y lo atrasado se muestra con la más vieja primero; «Todas» sigue de la más nueva a la más vieja.
  const visibles = filtro === "todas" || filtro === "piden" ? visiblesBase : [...visiblesBase].sort((a, b) => (a.creadoEn || "").localeCompare(b.creadoEn || ""));
  const selValidas = sel.filter((id) => (lista || []).some((d) => d.id === id && d.estado === "lista"));
  const clienteSel = (lista || []).find((d) => d.id === selValidas[0])?.cliente;
  async function despacharJuntas() {
    const elegidas = (lista || []).filter((d) => selValidas.includes(d.id));
    if (elegidas.length < 2 || !juntas.fecha || !docValido(juntas.nuevo)) return;
    setTrabajando("junto"); setMsgJunto("");
    try {
      const batch = writeBatch(db);
      const despachoId = `desp_${Date.now()}`;
      elegidas.forEach((d) => {
        const otras = elegidas.filter((x) => x.id !== d.id).map((x) => x.numero);
        const ev = { estado: "redespachada", fecha: nowISO(), usuario, nota: `Despachada junto con ${otras.join(", ")}` };
        batch.update(doc(db, COL, d.id), limpio({
          redespacho: { fecha: juntas.fecha, guia: juntas.guia.trim(), documentoNuevo: juntas.nuevo.trim(), por: usuario, despachoId, junto: otras },
          estado: "redespachada", historial: [...(d.historial || []), ev], actualizadoEn: nowISO(),
        }));
      });
      await batch.commit();
      setMsgJunto(`Despachadas juntas: ${elegidas.map((x) => x.numero).join(", ")}.`);
      setSel([]); setJuntas({ fecha: juntas.fecha, guia: "", nuevo: "" });
    } catch (e) {
      setMsgJunto(e?.message || "No se pudo guardar el despacho.");
    } finally {
      setTrabajando("");
    }
  }

  function abrir(d) {
    setMsg("");
    if (abierto === d.id) { setAbierto(null); return; }
    setAbierto(d.id);
    if (modo === "calidad" && d.estado === "recibida") setConteo(valoresDeLineas(d.lineas));
  }
  async function accion(d, estado, extra, nota) {
    setTrabajando(d.id); setMsg("");
    try { await cambiarEstado(db, d, estado, extra, usuario, nota); return true; }
    catch (e) { setMsg(e?.message || "No se pudo guardar el cambio."); return false; }
    finally { setTrabajando(""); }
  }
  // Jesús (Bodega): una devolución que viene en un envío con otras se puede recibir junto con todas las del mismo envío.
  async function recibirEnvio(d) {
    const grupo = (lista || []).filter((x) => x.envioId && x.envioId === d.envioId && ["reportada", "en_camino"].includes(x.estado));
    if (grupo.length < 2) return;
    setTrabajando(d.id); setMsg("");
    try {
      const batch = writeBatch(db);
      grupo.forEach((x) => {
        const ev = { estado: "recibida", fecha: nowISO(), usuario, nota: `Recibida con el envío (guía ${x.guia || d.guia || "—"}): ${grupo.map((g) => g.numero).join(", ")}` };
        batch.update(doc(db, COL, x.id), limpio({ recibidaPor: usuario, recibidaEn: nowISO(), estado: "recibida", historial: [...(x.historial || []), ev], actualizadoEn: nowISO() }));
      });
      await batch.commit();
    } catch (e) { setMsg(e?.message || "No se pudo guardar la recepción del envío."); }
    finally { setTrabajando(""); }
  }
  async function guardarConteo(d) {
    const declarado = valoresDeLineas(d.lineas);
    const tallas = tallasDeLineas(d.lineas, d.tallas);
    const colores = coloresDeLineas(d.lineas);
    const lineasContadas = colores.map((c) => ({ color: c.color, colorNombre: c.nombre || "", cantidades: Object.fromEntries(tallas.map((t) => [t, Number(conteo[`${c.color}|${t}`]) || 0]).filter(([, n]) => n > 0)) }));
    const diferencias = [];
    colores.forEach((c) => tallas.forEach((t) => {
      const dif = (Number(conteo[`${c.color}|${t}`]) || 0) - (Number(declarado[`${c.color}|${t}`]) || 0);
      if (dif) diferencias.push({ color: c.color, colorNombre: c.nombre || "", talla: t, dif });
    }));
    const resultado = diferencias.length ? "diferencias" : "completa";
    await accion(d, "revisada", { conteo: lineasContadas, diferencias, resultado, totalContado: totalLineas(lineasContadas), revisadoPor: usuario, revisadoEn: nowISO() },
      resultado === "completa" ? "Conteo completo" : "Conteo con diferencias");
  }

  const botones = (d) => {
    const ocupado = trabajando === d.id;
    if (modo === "bodega") {
      if (d.estado === "reportada" || d.estado === "en_camino") {
        const delEnvio = d.envioId ? (lista || []).filter((x) => x.envioId === d.envioId && ["reportada", "en_camino"].includes(x.estado)) : [];
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={ocupado} onClick={() => accion(d, "recibida", { recibidaPor: usuario, recibidaEn: nowISO() })} style={btn(T, "primario")}>Marcar como recibida</button>
            {delEnvio.length > 1 && <button disabled={ocupado} onClick={() => recibirEnvio(d)} style={btn(T)}>Recibir todo el envío ({delEnvio.length})</button>}
          </div>
        );
      }
      if (d.estado === "lista") {
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Fecha</div><input type="date" value={redes.fecha} onChange={(e) => setRedes({ ...redes, fecha: e.target.value })} style={campo(T)} /></div>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Guía</div><input value={redes.guia} onChange={(e) => setRedes({ ...redes, guia: e.target.value })} placeholder="Número de guía" style={campo(T)} /></div>
            <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Nueva remisión o factura *</div><input value={redes.nuevo} onChange={(e) => setRedes({ ...redes, nuevo: e.target.value })} placeholder="Número nuevo de TNS" style={{ ...campo(T), width: 180 }} /></div>
            <button disabled={ocupado || !redes.fecha || !docValido(redes.nuevo)} onClick={async () => { const ok = await accion(d, "redespachada", { redespacho: { fecha: redes.fecha, guia: redes.guia.trim(), documentoNuevo: redes.nuevo.trim(), por: usuario } }); if (ok) setRedes((r) => ({ ...r, guia: "", nuevo: "" })); }} style={btn(T, "primario")}>Despachada de nuevo</button>
            <div style={{ flexBasis: "100%", fontSize: 11, color: T.slate }}>Crea primero la nueva remisión en TNS; aquí solo anotas el número (si son varios documentos, sepáralos con coma).</div>
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
      {onVolverHub && <button onClick={onVolverHub} style={{ background: "none", border: "none", color: T.slate, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 10 }}>← Volver a Devoluciones</button>}
      <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, marginBottom: 4 }}>{(tipo && TITULOS_TIPO[tipo]) || "Devoluciones de clientes"}</div>
      <div style={{ fontSize: 13, color: T.slate, marginBottom: 12 }}>
        {modo === "bodega" ? "Marca cada devolución como recibida cuando llega la mercancía, y como despachada de nuevo cuando vuelve a salir." : "Cuenta por color y talla lo que llegó; ATLAS lo compara con lo que declaró el cliente."}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {[["pendientes", modo === "bodega" ? "Por atender" : "Por revisar"], ["atrasadas", `Atrasadas (${atrasadas})`], ["piden", `Piden despacho (${cuantosPiden})`], ["todas", "Todas"]].map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{ ...btn(T), background: filtro === k ? T.denimBg : T.white, color: filtro === k ? T.denim : T.ink, borderColor: filtro === k ? T.denim : T.border }}>{t}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número, lote, ref, cliente o guía" style={{ ...campo(T), width: 300 }} />
      </div>
      {error && <div style={{ color: T.coral, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {modo === "bodega" && msgJunto && selValidas.length === 0 && <div style={{ fontSize: 13, color: msgJunto.startsWith("Despachadas") ? T.jade : T.coral, marginBottom: 10 }}>{msgJunto}</div>}
      {modo === "bodega" && selValidas.length > 0 && (() => {
        const elegidas = (lista || []).filter((d) => selValidas.includes(d.id));
        const grupos = resumenDespachoJunto(elegidas);
        const unidades = elegidas.reduce((s, d) => s + (Number(d.total) || 0), 0);
        return (
          <div style={{ background: T.white, border: `1px solid ${T.denim}`, borderRadius: 14, padding: "14px 18px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 6 }}>Despachar juntas · {elegidas.length} {elegidas.length === 1 ? "devolución" : "devoluciones"} · {unidades} und · {clienteSel || "—"}</div>
            {elegidas.length < 2 ? (
              <div style={{ fontSize: 13, color: T.slate }}>Marca al menos otra devolución «Lista para despachar» del mismo cliente para despacharlas juntas.</div>
            ) : (
              <>
                {grupos.map((g) => (
                  <div key={g.tipo} style={{ fontSize: 13, color: T.ink, marginBottom: 4 }}>
                    <b>{g.tipo === "factura" ? "🧾 " : g.tipo === "sin_dato" ? "" : "🚚 "}{g.etiqueta}</b> ({g.unidades} und): {g.devs.map((x) => `${x.numero} · lote ${x.lote} · ${x.total} und${x.documentos.length ? ` · ${x.documentos.join(", ")}` : ""}`).join("  |  ")}
                  </div>
                ))}
                {grupos.length > 1 ? <div style={{ fontSize: 12, color: T.amber, margin: "4px 0 8px" }}>Salen en el mismo envío, pero en Busint cada tipo lleva su propio documento (las facturadas por factura, las remisionadas por traslado externo).</div> : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                  <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Fecha</div><input type="date" value={juntas.fecha} onChange={(e) => setJuntas({ ...juntas, fecha: e.target.value })} style={campo(T)} /></div>
                  <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Guía</div><input value={juntas.guia} onChange={(e) => setJuntas({ ...juntas, guia: e.target.value })} placeholder="Número de guía" style={campo(T)} /></div>
                  <div><div style={{ fontSize: 11, color: T.slate, marginBottom: 3 }}>Nueva remisión o factura *</div><input value={juntas.nuevo} onChange={(e) => setJuntas({ ...juntas, nuevo: e.target.value })} placeholder="Número nuevo de TNS" style={{ ...campo(T), width: 180 }} /></div>
                  <button disabled={trabajando === "junto" || !juntas.fecha || !docValido(juntas.nuevo)} onClick={despacharJuntas} style={btn(T, "primario")}>{trabajando === "junto" ? "Guardando…" : "Despachar juntas"}</button>
                </div>
              </>
            )}
            {msgJunto && <div style={{ fontSize: 13, color: T.coral, marginTop: 8 }}>{msgJunto}</div>}
            <div style={{ marginTop: 8 }}><button onClick={() => { setSel([]); setMsgJunto(""); }} style={btn(T)}>Quitar selección</button></div>
          </div>
        );
      })()}
      {lista === null ? <div style={{ fontSize: 13, color: T.slate }}>Cargando…</div>
        : !visibles.length ? <div style={{ ...tarjeta, fontSize: 13, color: T.slate }}>{filtro === "pendientes" ? "No hay devoluciones pendientes." : filtro === "piden" ? "Ningún cliente tiene un despacho de nuevo por atender." : "No hay devoluciones."}</div>
        : visibles.map((d) => (
          <div key={d.id} style={{ ...tarjeta, marginBottom: 10 }}>
            <div onClick={() => abrir(d)} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", cursor: "pointer", alignItems: "center" }}>
              <span style={{ fontSize: 14 }}>
                {d.estado === "lista" && modo === "bodega" && (
                  <input type="checkbox" title="Marcar para despachar junto con otras" checked={selValidas.includes(d.id)}
                    disabled={!selValidas.includes(d.id) && selValidas.length > 0 && clienteSel !== d.cliente}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSel((a) => (e.target.checked ? [...a.filter((x) => x !== d.id), d.id] : a.filter((x) => x !== d.id)))}
                    style={{ marginRight: 8 }} />
                )}
                <b>{d.numero}</b> · {d.cliente || "—"} · lote {d.lote} · ref {d.ref || "—"} · {d.total} und{String(d.documentoOriginal || "").trim() ? ` · ${d.documentoOriginal}` : ""} · {fmtFecha(d.creadoEn)}</span>
              <EstadoPill T={T} d={d} />
            </div>
            {abierto === d.id && (
              <>
                <Detalle T={T} d={d} mostrarConteo />
                {modo === "bodega" && ["revisada", "lista"].includes(d.estado) && d.conteo?.length ? <ResumenBodega T={T} d={d} /> : null}
                {msg && <div style={{ color: T.coral, fontSize: 13, marginTop: 8 }}>{msg}</div>}
                {modo === "calidad" && d.estado === "recibida" && (
                  <div style={{ marginTop: 14, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 6 }}>CUENTA LO QUE LLEGÓ (por color y talla)</div>
                    <GrillaColorTalla
                      T={T} colores={coloresDeLineas(d.lineas).concat([])} tallas={tallasDeLineas(d.lineas, d.tallas)}
                      valores={conteo} comparar={valoresDeLineas(d.lineas)} infantil={esInfantilDev(d)}
                      onCambiar={(k, v) => setConteo((c) => ({ ...c, [k]: v === "" ? "" : entero(v) }))}
                    />
                    <div style={{ marginTop: 10 }}><button disabled={trabajando === d.id} onClick={() => guardarConteo(d)} style={btn(T, "primario")}>Guardar conteo y marcar como revisada</button></div>
                  </div>
                )}
                <div style={{ marginTop: 12 }}>{botones(d)}</div>
                {modo === "bodega" && (puedeCambiarEstado || currentUser?.isAdmin) && (
                  <CambiarEstadoDev key={`${d.id}-${d.estado}`} T={T} d={d} ocupado={trabajando === d.id}
                    onCambiar={(estado, extra, nota) => accion(d, estado, estado === "redespachada" ? { redespacho: { ...extra.redespacho, por: usuario } } : extra, nota)} />
                )}
                <AccionesDevolucion db={db} T={T} d={d} lista={lista} currentUser={currentUser} esCliente={false} onBorrado={() => setAbierto(null)} />
              </>
            )}
          </div>
        ))}
    </div>
  );
}

const TITULOS_CLIENTE = { factura: "🧾 Facturadas", remision: "🚚 Remisionadas", otras: "Otras devoluciones" };

// (2026-11-10, a pedido de Fredy) Entrada de la CLIENTE a Devoluciones: dos tarjetas grandes, Facturadas y Remisionadas. Al entrar a una monta la
// devolución de ese tipo; el tipo que elige queda guardado como origen (si Busint dice otro, queda «por confirmar» para la líder).
function HubDevolucionesCliente({ db, T: Tp, currentUser, onElegir }) {
  const T = Tp || TEMA_DEFECTO;
  const esCliente = currentUser?.role === "Cliente";
  const uid = (() => { try { return getAuth(getApps()[0]).currentUser?.uid || ""; } catch { return ""; } })();
  const { lista, error } = useDevoluciones(db, esCliente ? uid : null);
  const conteo = (g) => {
    const l = (lista || []).filter((d) => grupoOrigenCliente(d) === g);
    return {
      proceso: l.filter((d) => d.estado !== "redespachada").length,
      piden: l.filter((d) => d.solicitaDespacho && d.estado !== "redespachada").length,
      resueltas: l.filter((d) => d.estado === "redespachada").length,
    };
  };
  const otras = (lista || []).filter((d) => grupoOrigenCliente(d) === "otras").length;
  const tarjetas = [
    { k: "factura", icono: "🧾", titulo: "Facturadas", txt: "Lotes que te despachamos con factura. Reporta aquí lo que devuelves de ellos.", color: T.denim, bg: T.denimBg, deco: "#F3F6FA" },
    { k: "remision", icono: "🚚", titulo: "Remisionadas", txt: "Lotes que te despachamos por traslado externo (remisión). Reporta aquí lo que devuelves de ellos.", color: T.violet, bg: T.violetBg, deco: "#F7F4FB" },
  ];
  const tile = (n, etiqueta, color, bg) => (
    <div style={{ borderRadius: 12, padding: "10px 12px", background: n > 0 ? bg : "#F5F2EE" }}>
      <div style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 800, color: n > 0 ? color : T.ink }}>{n}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate }}>{etiqueta}</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 940 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: T.ink, marginBottom: 4 }}>↩️ Devoluciones</div>
      <div style={{ fontSize: 14, color: T.slate, marginBottom: 20 }}>Elige de qué tipo es la devolución que vas a reportar</div>
      {error && <div style={{ color: T.coral, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        {tarjetas.map((t) => {
          const c = conteo(t.k);
          return (
            <button key={t.k} onClick={() => onElegir(t.k)} style={{ position: "relative", overflow: "hidden", background: T.white, border: `1px solid ${T.border}`, borderRadius: 20, padding: "26px 28px 22px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: T.ink }}>
              <span style={{ position: "absolute", top: -60, right: -50, width: 150, height: 150, borderRadius: "50%", background: t.deco }} />
              <div style={{ position: "relative", width: 58, height: 58, borderRadius: 16, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 18 }}>{t.icono}</div>
              <div style={{ position: "relative", fontSize: 21, fontWeight: 800, marginBottom: 6 }}>{t.titulo}</div>
              <div style={{ position: "relative", fontSize: 14, color: T.slate, marginBottom: 16, lineHeight: 1.45 }}>{t.txt}</div>
              <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                {tile(c.proceso, "En proceso", t.color, t.bg)}
                {tile(c.piden, "Despacho solicitado", T.violet, T.violetBg)}
                {tile(c.resueltas, "Despachadas de nuevo", T.jade, T.jadeBg)}
              </div>
              <div style={{ position: "relative", textAlign: "right", fontSize: 14, fontWeight: 800, color: t.color }}>Entrar →</div>
            </button>
          );
        })}
      </div>
      {otras > 0 && (
        <div style={{ marginTop: 18 }}>
          <button onClick={() => onElegir("otras")} style={{ background: "none", border: "none", color: T.denim, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 2px", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Devoluciones anteriores sin tipo ({otras})
          </button>
        </div>
      )}
    </div>
  );
}

export function DevolucionesClienteView(props) {
  const [tipo, setTipo] = useState(null);
  if (!tipo) return <HubDevolucionesCliente db={props.db} T={props.T} currentUser={props.currentUser} onElegir={setTipo} />;
  return <FormularioDevolucionesCliente {...props} tipo={tipo} onVolverHub={() => setTipo(null)} />;
}

const TITULOS_TIPO = { factura: "🧾 Facturadas", remision: "🚚 Remisionadas", clasificar: "⚠️ Por clasificar", despachar: "📦 Todas las listas para despachar" };

// (2026-11-10, a pedido de Fredy) Entrada de Bodega → Devoluciones: dos tarjetas grandes, Facturadas y Remisionadas (según el origen en Busint),
// más «Por clasificar» (sin origen o mixtas) y el enlace «Todas las listas para despachar» para juntar de ambos tipos en un solo envío.
function HubDevolucionesBodega({ db, T: Tp, onElegir }) {
  const T = Tp || TEMA_DEFECTO;
  const { lista, error } = useDevoluciones(db, null);
  const conteo = (g) => {
    const l = (lista || []).filter((d) => grupoOrigen(d) === g);
    return {
      atender: l.filter((d) => ["reportada", "en_camino", "lista"].includes(d.estado)).length,
      atrasadas: l.filter((d) => tiempoDevolucion(d).atrasada).length,
      piden: l.filter((d) => d.solicitaDespacho && d.estado !== "redespachada").length,
    };
  };
  const porClasificar = (lista || []).filter((d) => d.estado !== "redespachada" && grupoOrigen(d) === "clasificar").length;
  const listasParaDespachar = (lista || []).filter((d) => d.estado === "lista").length;
  const tarjetas = [
    { k: "factura", icono: "🧾", titulo: "Facturadas", txt: "Lotes que salieron con factura en Busint. Se re-despachan por factura.", color: T.denim, bg: T.denimBg, deco: "#F3F6FA" },
    { k: "remision", icono: "🚚", titulo: "Remisionadas", txt: "Lotes que salieron como traslado externo en Busint. Se re-despachan por traslado.", color: T.violet, bg: T.violetBg, deco: "#F7F4FB" },
  ];
  const tile = (n, etiqueta, color, bg) => (
    <div style={{ borderRadius: 12, padding: "10px 12px", background: n > 0 ? bg : "#F5F2EE" }}>
      <div style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 800, color: n > 0 ? color : T.ink }}>{n}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate }}>{etiqueta}</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 940 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: T.ink, marginBottom: 4 }}>↩️ Devoluciones</div>
      <div style={{ fontSize: 14, color: T.slate, marginBottom: 20 }}>Elige qué tipo de devolución vas a atender</div>
      {error && <div style={{ color: T.coral, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {lista === null ? <div style={{ fontSize: 13, color: T.slate }}>Cargando…</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
            {tarjetas.map((t) => {
              const c = conteo(t.k);
              return (
                <button key={t.k} onClick={() => onElegir(t.k)} style={{ position: "relative", overflow: "hidden", background: T.white, border: `1px solid ${T.border}`, borderRadius: 20, padding: "26px 28px 22px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: T.ink }}>
                  <span style={{ position: "absolute", top: -60, right: -50, width: 150, height: 150, borderRadius: "50%", background: t.deco }} />
                  <div style={{ position: "relative", width: 58, height: 58, borderRadius: 16, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 18 }}>{t.icono}</div>
                  <div style={{ position: "relative", fontSize: 21, fontWeight: 800, marginBottom: 6 }}>{t.titulo}</div>
                  <div style={{ position: "relative", fontSize: 14, color: T.slate, marginBottom: 16, lineHeight: 1.45 }}>{t.txt}</div>
                  <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                    <div style={{ borderRadius: 12, padding: "10px 12px", background: "#F5F2EE" }}><div style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 800, color: T.ink }}>{c.atender}</div><div style={{ fontSize: 11, fontWeight: 700, color: T.slate }}>Por atender</div></div>
                    {tile(c.atrasadas, "Atrasadas", T.coral, T.coralBg)}
                    {tile(c.piden, "Piden despacho", T.jade, T.jadeBg)}
                  </div>
                  <div style={{ position: "relative", textAlign: "right", fontSize: 14, fontWeight: 800, color: t.color }}>Entrar →</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {porClasificar > 0 && (
              <button onClick={() => onElegir("clasificar")} style={{ display: "flex", alignItems: "center", gap: 10, background: T.amberBg, border: "1px solid #F0DDB8", color: T.amber, borderRadius: 14, padding: "10px 16px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ⚠️ Por clasificar <span style={{ background: T.amber, color: "#fff", borderRadius: 20, padding: "1px 9px", fontSize: 12 }}>{porClasificar}</span>
                <span style={{ fontWeight: 600 }}>sin origen o mixtas</span>
              </button>
            )}
            <button onClick={() => onElegir("despachar")} style={{ background: "none", border: "none", color: T.denim, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 2px", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Todas las listas para despachar ({listasParaDespachar})
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function DevolucionesBodegaView(props) {
  const [tipo, setTipo] = useState(null);
  if (!tipo) return <HubDevolucionesBodega db={props.db} T={props.T} onElegir={setTipo} />;
  return <ListaEquipo {...props} modo="bodega" tipo={tipo} onVolverHub={() => setTipo(null)} />;
}
export function DevolucionesCalidadView(props) {
  return <ListaEquipo {...props} modo="calidad" />;
}
