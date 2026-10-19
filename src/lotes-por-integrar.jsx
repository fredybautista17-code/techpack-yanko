// ─── LOTES POR INTEGRAR ───────────────────────────────────────────────────────
// (2026-10-19, a pedido de Fredy) Panel para el encargado de bodega: los lotes ya
// cortados que todavía no se integran en Busint (la integración es cuando el
// insumo sale de bodega; validado con el lote 7222). Por cada lote muestra los
// insumos que hay que entregar (consumo de la ficha × prendas del lote), lo que
// hay en bodega y, si falta, qué orden de compra viene y si llega antes del despacho.
// Datos: función "getLotesPorIntegrarBusint". El inventario y las órdenes de
// compra se ASIGNAN lote por lote en orden de despacho (asignarInventario) para
// que dos lotes no cuenten el mismo inventario.
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, setDoc } from "firebase/firestore";

const fmt = (n, dec = 2) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("es-CO", { maximumFractionDigits: dec }) : "—");
const normTxt = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const refSG = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtFecha = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}` : "—");
const diasEntre = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const claveInsumo = (s) => String(s || "").toUpperCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

// ── Carga con caché (la comparten este panel y la Explosión de materiales) ─────
let cache = null; // { en, datos }
let enVuelo = null;
export function cargarLotesPorIntegrar(functionsClient, { forzar = false } = {}) {
  if (!forzar && cache && Date.now() - cache.en < 10 * 60 * 1000) return Promise.resolve(cache.datos);
  if (!forzar && enVuelo) return enVuelo;
  enVuelo = httpsCallable(functionsClient, "getLotesPorIntegrarBusint", { timeout: 540000 })({})
    .then((r) => { cache = { en: Date.now(), datos: r.data }; return r.data; })
    .finally(() => { enVuelo = null; });
  return enVuelo;
}

// ── Asignación de inventario y órdenes de compra, lote por lote ────────────────
// lotes: [{lote, ref, pedido, corte, prendas, integradas, despacho, ...}]; fichas: {ref: [{insumo, cant, unidad, bodega, codcomps}]}
// oc: {codcomp: [[numOC, proveedor, fechaEntrega, cant]]}. Devuelve los mismos lotes con `insumos` y `estado`.
// Dónde está el lote según el seguimiento de Busint: si ya hay prendas en planta/semiterminado/terminado, está listo
// para integrar; si todo sigue en corte, los insumos se necesitarán cuando salga a planta.
export function clasificarUbicacion(ub) {
  if (!ub) return { tipo: "desconocida", texto: "Sin dato de etapa" };
  const partes = [];
  if (ub.corte > 0) partes.push(`En corte (${Math.round(ub.corte)})`);
  if (ub.planta > 0) partes.push(`En planta (${Math.round(ub.planta)})`);
  if (ub.semi > 0) partes.push(`Semiterminado (${Math.round(ub.semi)})`);
  if (ub.bpt > 0) partes.push(`Terminado (${Math.round(ub.bpt)})`);
  if (ub.planta > 0 || ub.semi > 0) return { tipo: "planta", texto: partes.join(" · ") };
  if (ub.corte > 0) return { tipo: "corte", texto: partes.join(" · ") };
  // Sin prendas en corte, planta ni semiterminado: ya salió de producción (terminado o despachado)
  return { tipo: "fuera", texto: ub.bpt > 0 ? partes.join(" · ") : "Ya salió de producción" };
}
const PESO = { comprar: 5, oc_tarde: 4, oc_ok: 3, justo: 2, ok: 1 };
export function asignarInventario({ lotes, fichas, oc }) {
  const rango = (l) => (l.ubicTipo === "fuera" ? 2 : l.ubicTipo === "corte" ? 1 : 0);
  const orden = [...lotes].sort((a, b) => rango(a) - rango(b) || String(a.despacho || "9999").localeCompare(String(b.despacho || "9999")) || String(a.corte).localeCompare(String(b.corte)) || Number(a.lote) - Number(b.lote));
  const stock = new Map();
  const ocPorInsumo = new Map();
  const ocDe = (ins, k) => {
    if (!ocPorInsumo.has(k)) {
      const vistos = new Set();
      const lista = [];
      (ins.codcomps || []).forEach((c) => (oc?.[c] || []).forEach((o) => {
        const id = `${o[0]}|${c}`;
        if (vistos.has(id)) return;
        vistos.add(id);
        lista.push({ n: o[0], prov: o[1], ff: o[2], resto: o[3] });
      }));
      lista.sort((a, b) => String(a.ff).localeCompare(String(b.ff)));
      ocPorInsumo.set(k, lista);
    }
    return ocPorInsumo.get(k);
  };
  const resultado = new Map();
  orden.forEach((l) => {
    const ficha = fichas?.[l.ref] || [];
    const pend = l.prendas == null ? null : Math.max(0, l.prendas - (l.integradas || 0));
    if (!ficha.length) { resultado.set(l.lote, { ...l, pendientes: pend, insumos: [], estado: "sin_ficha" }); return; }
    if (pend == null) {
      resultado.set(l.lote, { ...l, pendientes: null, estado: "sin_prendas", insumos: ficha.map((i) => ({ insumo: i.insumo, unidad: i.unidad, consumo: i.cant, necesito: null, bodega: i.bodega, usaBodega: null, falta: null, oc: [], comprar: null, estado: "sin_prendas" })) });
      return;
    }
    let peor = "ok";
    const insumos = ficha.map((i) => {
      const k = claveInsumo(i.insumo);
      if (!stock.has(k)) stock.set(k, i.bodega);
      const necesito = pend * i.cant;
      const disp = Math.max(0, stock.get(k));
      const usaBodega = Math.min(necesito, disp);
      stock.set(k, stock.get(k) - usaBodega);
      let falta = necesito - usaBodega;
      const ocAsig = [];
      if (falta > 0.005) {
        for (const o of ocDe(i, k)) {
          if (falta <= 0.005) break;
          if (o.resto <= 0) continue;
          const toma = Math.min(o.resto, falta);
          o.resto -= toma; falta -= toma;
          ocAsig.push({ n: o.n, prov: o.prov, ff: o.ff, cant: toma, tarde: !!(l.despacho && o.ff > l.despacho) });
        }
      }
      const comprar = Math.max(0, falta);
      const faltaInicial = necesito - usaBodega;
      let estado;
      if (faltaInicial <= 0.005) estado = stock.get(k) < necesito * 0.1 ? "justo" : "ok";
      else if (comprar > 0.005) estado = "comprar";
      else estado = ocAsig.some((o) => o.tarde) ? "oc_tarde" : "oc_ok";
      if (PESO[estado] > PESO[peor]) peor = estado;
      return { insumo: i.insumo, unidad: i.unidad, consumo: i.cant, necesito, bodega: disp, usaBodega, falta: faltaInicial, oc: ocAsig, comprar, estado, pide: i.pide, entregado: i.entregado };
    });
    const nFalta = insumos.filter((x) => x.estado === "comprar").length;
    const nOc = insumos.filter((x) => x.estado === "oc_ok" || x.estado === "oc_tarde").length;
    resultado.set(l.lote, { ...l, pendientes: pend, insumos, estado: peor, nFalta, nOc });
  });
  return lotes.map((l) => resultado.get(l.lote));
}

const ESTADOS = {
  ok: { txt: "Todo disponible", bg: "#E3F5EC", fg: "#1E7A52" },
  justo: { txt: "Alcanza justo", bg: "#FDF1DA", fg: "#A8660B" },
  oc_ok: { txt: "Falta · viene en OC", bg: "#E6EEF8", fg: "#2D5A8C" },
  oc_tarde: { txt: "Falta · OC llega tarde", bg: "#FDF1DA", fg: "#A8660B" },
  comprar: { txt: "Hay que comprar", bg: "#FBE9E6", fg: "#9A3A2D" },
  sin_ficha: { txt: "Sin insumos en la ficha", bg: "#EEEBE6", fg: "#5A5A7A" },
  sin_prendas: { txt: "Prendas por confirmar", bg: "#EEEBE6", fg: "#5A5A7A" },
};
const ESTADO_INS = { ...ESTADOS, ok: { txt: "Alcanza", bg: "#E3F5EC", fg: "#1E7A52" }, oc_ok: { txt: "Llega antes del despacho", bg: "#E6EEF8", fg: "#2D5A8C" }, oc_tarde: { txt: "Llega tarde", bg: "#FDF1DA", fg: "#A8660B" } };
const Pill = ({ e, mapa = ESTADOS, extra }) => {
  const x = mapa[e] || ESTADOS.sin_prendas;
  return <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 20, fontSize: 11.5, fontWeight: 800, background: x.bg, color: x.fg, whiteSpace: "nowrap" }}>● {extra || x.txt}</span>;
};
const textoAnticipado = (l) => ({
  ok: "los insumos alcanzan", justo: "los insumos alcanzan justo", oc_ok: "faltará un insumo · viene en OC",
  oc_tarde: "faltará un insumo · la OC llega tarde", comprar: `faltará${l.nFalta > 1 ? "n" : ""} ${l.nFalta || ""} insumo${l.nFalta > 1 ? "s" : ""} · sin OC`.replace("  ", " "),
}[l.estado] || "");
const textoLote = (l) => {
  if (l.estado === "comprar") return `Falta ${l.nFalta} insumo${l.nFalta === 1 ? "" : "s"} · sin OC`;
  if (l.estado === "oc_tarde") return "Falta · OC llega tarde";
  if (l.estado === "oc_ok") return `Falta ${l.nOc} · viene en OC`;
  return null;
};

// Insumos que Busint nunca integra por ese documento (se ocultan de "Integración incompleta" para todos los lotes)
const LS_IGN = "atlasLotesIntegrar_ignorar";
const leerIgn = () => { try { return JSON.parse(localStorage.getItem(LS_IGN) || "[]"); } catch { return []; } };
const ESTADO_INS_INC = { ...ESTADO_INS, ok: { txt: "Hay en bodega · completar", bg: "#E3F5EC", fg: "#1E7A52" }, justo: { txt: "Alcanza justo", bg: "#FDF1DA", fg: "#A8660B" } };

export default function LotesPorIntegrarView({ db, functionsClient, T, pedidos }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [verCerrados, setVerCerrados] = useState(false);
  const [verFuera, setVerFuera] = useState(false);
  const [orden, setOrden] = useState({ k: "despacho", dir: 1 });
  const [abierto, setAbierto] = useState(null);
  const [pestana, setPestana] = useState("listos"); // listos (ya en planta) | corte (aún en corte) | incompleta
  const [ignorados, setIgnorados] = useState(() => new Set(leerIgn()));
  const [avisoIgn, setAvisoIgn] = useState("");
  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, "atlas_config", "lotes_integrar")).then((sn) => { if (sn.exists()) setIgnorados(new Set(sn.data().ignorarInsumos || [])); }).catch(() => {});
  }, [db]);
  function guardarIgnorados(n) {
    setIgnorados(n);
    try { localStorage.setItem(LS_IGN, JSON.stringify([...n])); } catch {}
    if (db) setDoc(doc(db, "atlas_config", "lotes_integrar"), { ignorarInsumos: [...n] }, { merge: true }).then(() => setAvisoIgn("")).catch(() => setAvisoIgn("No se pudo guardar para todos los usuarios; la lista de insumos ocultos quedó solo en este navegador."));
  }
  const ocultarInsumo = (nombre) => guardarIgnorados(new Set([...ignorados, claveInsumo(nombre)]));
  const restaurarInsumo = (k) => { const n = new Set(ignorados); n.delete(k); guardarIgnorados(n); };

  const cargar = useCallback(async (forzar) => {
    setCargando(true); setError("");
    try { setDatos(await cargarLotesPorIntegrar(functionsClient, { forzar })); }
    catch (err) { setError(err?.message || "No se pudo consultar Busint."); }
    finally { setCargando(false); }
  }, [functionsClient]);
  useEffect(() => { cargar(false); }, [cargar]);

  const pedidoPorNumero = useMemo(() => {
    const m = new Map();
    (pedidos || []).forEach((p) => m.set(String(p.numero).trim(), p));
    return m;
  }, [pedidos]);

  const todos = useMemo(() => {
    if (!datos) return [];
    const base = (datos.lotes || []).map((l) => {
      const p = l.pedido ? pedidoPorNumero.get(String(l.pedido)) : null;
      const u = clasificarUbicacion(l.ub);
      return { ...l, ubicTipo: u.tipo, ubicTexto: u.texto, cliente: p?.cliente || l.clienteObs || "(sin cliente)", despacho: p?.fechaDespacho || null, estadoPedido: p?.estado || null, diasSin: datos.hoy ? Math.max(0, diasEntre(l.corte, datos.hoy)) : 0 };
    });
    // Integración incompleta: lo que falta de cada lote ya integrado entra al mismo reparto de inventario como un "lote" aparte
    const fichasInc = {};
    const lotesInc = [];
    (datos.incompletos || []).forEach((l) => {
      const faltan = (l.faltan || []).filter((f) => !ignorados.has(claveInsumo(f.insumo)));
      if (!faltan.length) return;
      const p = l.pedido ? pedidoPorNumero.get(String(l.pedido)) : null;
      const u = clasificarUbicacion(l.ub);
      fichasInc[`inc|${l.lote}`] = faltan.map((f) => ({ insumo: f.insumo, cant: f.falta, unidad: f.unidad, bodega: f.bodega, codcomps: f.codcomps, pide: f.requerido, entregado: f.entregado }));
      lotesInc.push({ ...l, ref: `inc|${l.lote}`, refReal: l.ref, prendasReal: l.prendas, prendas: 1, integradas: 0, incompleto: true, ubicTipo: u.tipo === "corte" ? "planta" : u.tipo, ubicTexto: u.texto, cliente: p?.cliente || l.clienteObs || "(sin cliente)", despacho: p?.fechaDespacho || null, estadoPedido: p?.estado || null, diasSin: datos.hoy && l.fechaIntegracion ? Math.max(0, diasEntre(l.fechaIntegracion, datos.hoy)) : 0 });
    });
    return asignarInventario({ lotes: [...base, ...lotesInc], fichas: { ...datos.fichas, ...fichasInc }, oc: datos.oc })
      .map((l) => (l.incompleto ? { ...l, ref: l.refReal, pendientes: l.prendasReal } : l));
  }, [datos, pedidoPorNumero, ignorados]);

  const esCerrado = (l) => l.estadoPedido === "cerrado" || l.estadoPedido === "terminado";
  const cerrados = todos.filter((l) => esCerrado(l) && !l.incompleto);
  const sinCerrados = (verCerrados ? todos : todos.filter((l) => !esCerrado(l))).filter((l) => !l.incompleto);
  const incompletas = (verCerrados ? todos : todos.filter((l) => !esCerrado(l))).filter((l) => l.incompleto);
  const enCorte = sinCerrados.filter((l) => l.ubicTipo === "corte");
  const fuera = sinCerrados.filter((l) => l.ubicTipo === "fuera");
  const listos = sinCerrados.filter((l) => l.ubicTipo === "planta" || l.ubicTipo === "desconocida" || (verFuera && l.ubicTipo === "fuera"));
  const base = pestana === "incompleta" ? incompletas : pestana === "corte" ? enCorte : listos;
  const clientes = useMemo(() => [...new Set(base.map((l) => l.cliente))].sort((a, b) => a.localeCompare(b, "es")), [base]);
  const visibles = useMemo(() => {
    const k = normTxt(q);
    const f = base.filter((l) => (!fCliente || l.cliente === fCliente) && (!fEstado || (fEstado === "falta" ? ["comprar", "oc_ok", "oc_tarde"].includes(l.estado) : l.estado === fEstado))
      && (!k || normTxt(`${l.lote} ${l.ref} ${l.pedido} ${l.cliente}`).includes(k) || refSG(l.ref).includes(refSG(q))));
    const val = {
      despacho: (l) => l.despacho || "9999", corte: (l) => l.corte, dias: (l) => -l.diasSin, lote: (l) => Number(l.lote),
      prendas: (l) => l.pendientes ?? -1, estado: (l) => -(PESO[l.estado] || 0), cliente: (l) => normTxt(l.cliente), ref: (l) => normTxt(l.ref),
    }[orden.k];
    return [...f].sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y)); return (c || Number(a.lote) - Number(b.lote)) * orden.dir; });
  }, [base, q, fCliente, fEstado, orden]);

  const hoy = datos?.hoy;
  const prendasCorte = enCorte.reduce((s, l) => s + (l.pendientes || 0), 0);
  const conFalta = base.filter((l) => ["comprar", "oc_ok", "oc_tarde"].includes(l.estado));
  const sinOC = base.filter((l) => l.estado === "comprar");
  const proximos = base.filter((l) => l.despacho && hoy && diasEntre(hoy, l.despacho) <= 7);
  const masViejo = base.reduce((m, l) => (!m || l.diasSin > m.diasSin ? l : m), null);
  const totalPrendas = base.reduce((s, l) => s + (l.pendientes || 0), 0);
  const completables = base.filter((l) => l.estado === "ok" || l.estado === "justo");
  const esperanCompra = base.filter((l) => ["comprar", "oc_ok", "oc_tarde"].includes(l.estado));
  const insumosFaltan = new Set(base.flatMap((l) => l.insumos.map((i) => claveInsumo(i.insumo)))).size;

  function ordenarPor(k) { setOrden((o) => (o.k === k ? { k, dir: -o.dir } : { k, dir: 1 })); }

  async function exportar() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const r2 = (n) => (n == null ? "" : +Number(n).toFixed(2));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visibles.map((l) => ({ Lote: l.lote, Referencia: l.ref, Pedido: l.pedido || "", Cliente: l.cliente, Despacho: l.despacho || "", Corte: l.corte, "Dónde está": l.ubicTexto, "Días sin integrar": l.diasSin, "Prendas por integrar": l.pendientes ?? "", Estado: (ESTADOS[l.estado] || {}).txt }))), "Lotes");
    const filas = [];
    visibles.forEach((l) => l.insumos.forEach((i) => filas.push({ Lote: l.lote, Referencia: l.ref, Insumo: i.insumo, Unidad: i.unidad, "Pide la ficha": i.pide == null ? "" : r2(i.pide), Entregado: i.entregado == null ? "" : r2(i.entregado), "Por prenda": i.consumo, Entregar: r2(i.necesito), "En bodega": r2(i.bodega), Falta: r2(i.falta), "Orden de compra": i.oc.map((o) => `OC ${o.n} (${o.prov}) ${fmt(o.cant)} · entrega ${o.ff}${o.tarde ? " · TARDE" : ""}`).join(" | "), "Sin orden de compra": r2(i.comprar), Estado: (ESTADO_INS[i.estado] || {}).txt })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Insumos por lote");
    XLSX.writeFile(wb, `Lotes por integrar ${hoy || ""}.xlsx`);
  }

  function imprimir(lista) {
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const bloque = (l) => `<div class="lote"><h2>Lote ${esc(l.lote)} · ref ${esc(l.ref)} <small>Pedido ${esc(l.pedido || "—")} · ${esc(l.cliente)} · ${l.pendientes == null ? "prendas por confirmar" : fmt(l.pendientes, 0) + " prendas"} · despacha ${esc(fmtFecha(l.despacho))} · cortado ${esc(fmtFecha(l.corte))} · ${esc(l.ubicTexto)}</small></h2>${l.insumos.length ? `<table><tr><th>✓</th><th>Insumo</th><th>Entregar</th><th>En bodega</th><th>Orden de compra</th></tr>${l.insumos.map((i) => `<tr class="${i.estado === "comprar" ? "rojo" : ""}"><td class="c">☐</td><td>${esc(i.insumo)}</td><td class="n">${i.necesito == null ? `${fmt(i.consumo, 4)} por prenda` : `<b>${fmt(i.necesito)}</b> ${esc(i.unidad)}`}</td><td class="n">${fmt(i.bodega)} ${esc(i.unidad)}</td><td>${i.estado === "ok" || i.estado === "justo" ? "—" : i.oc.length ? i.oc.map((o) => `OC ${o.n} · ${esc(o.prov)} · ${fmt(o.cant)} · entrega ${esc(fmtFecha(o.ff))}${o.tarde ? " (llega tarde)" : ""}`).join("<br>") + (i.comprar > 0.005 ? `<br><b>Falta comprar ${fmt(i.comprar)}</b>` : "") : i.comprar > 0.005 ? `<b>Hay que comprar ${fmt(i.comprar)}</b> (sin OC)` : "—"}</td></tr>`).join("")}</table>` : "<p>Este lote no tiene insumos en la ficha de Busint.</p>"}</div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lotes por integrar ${esc(hoy || "")}</title><style>body{font-family:Arial,sans-serif;color:#1A1A2E;margin:22px}h1{margin:0 0 4px;font-size:20px}h2{font-size:15px;margin:0 0 6px}h2 small{font-weight:400;color:#5A5A7A;font-size:11.5px;margin-left:8px}.lote{margin:0 0 18px;page-break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;background:#F1ECE5;padding:5px 8px}td{padding:5px 8px;border-bottom:1px solid #E8E2DB;vertical-align:top}td.n{text-align:right;white-space:nowrap}td.c{width:22px;text-align:center}tr.rojo td{color:#9A3A2D}p{color:#5A5A7A;font-size:12px}</style></head><body><h1>Lotes por integrar</h1><p>${esc(hoy || "")} · ${lista.length} lote${lista.length === 1 ? "" : "s"}</p>${lista.map(bloque).join("")}</body></html>`;
    const w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
    if (w) setTimeout(() => { try { w.print(); } catch {} }, 500);
  }

  const campo = { padding: "8px 12px", border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13, fontFamily: "inherit", color: T.ink, background: T.white };
  const th = (k, label, der) => (
    <th onClick={k ? () => ordenarPor(k) : undefined} style={{ textAlign: der ? "right" : "left", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: orden.k === k ? T.ink : T.slate, padding: "10px 12px", background: "#FAF8F5", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", cursor: k ? "pointer" : "default" }}>
      {label}{orden.k === k ? (orden.dir > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
  const td = { padding: "11px 12px", borderBottom: "1px solid #F0ECE3", fontSize: 13, fontVariantNumeric: "tabular-nums" };
  const Kpi = ({ t, v, d, rojo }) => (
    <div style={{ background: rojo ? "#FDF0EE" : T.white, border: `1px solid ${rojo ? "#F3B9B1" : T.border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: T.slate, fontWeight: 700 }}>{t}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: rojo ? "#B8402F" : T.ink, marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 12, color: T.slate }}>{d}</div>
    </div>
  );
  const btn = (primario) => ({ padding: "8px 14px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", border: `1px solid ${primario ? T.ink : T.border}`, background: primario ? T.ink : T.white, color: primario ? T.white : T.ink });

  const tablaIncompleta = (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{th("lote", "Lote")}{th("ref", "Referencia")}{th("cliente", "Pedido · Cliente")}{th("despacho", "Despacho")}{th("dias", "Integrado hace", true)}{th(null, "Insumos que faltan")}{th("estado", "Estado")}</tr></thead>
        <tbody>
          {visibles.map((l) => (
            <React.Fragment key={l.lote}>
              <tr onClick={() => setAbierto(abierto === l.lote ? null : l.lote)} style={{ cursor: "pointer", background: abierto === l.lote ? "#F3F7FB" : "transparent" }}>
                <td style={{ ...td, fontWeight: 800, fontSize: 15 }}>{l.lote}</td>
                <td style={td}>{l.ref}</td>
                <td style={td}>{l.pedido || "—"} · <span style={{ color: T.slate, fontSize: 12 }}>{l.cliente}</span></td>
                <td style={td}>{fmtFecha(l.despacho)}</td>
                <td style={{ ...td, textAlign: "right" }}>{l.diasSin} día{l.diasSin === 1 ? "" : "s"}<div style={{ fontSize: 11, color: T.slate }}>{fmtFecha(l.fechaIntegracion)}</div></td>
                <td style={{ ...td, fontSize: 12.5 }}>{l.insumos.slice(0, 2).map((i) => `${i.insumo} (${fmt(i.necesito)} ${i.unidad})`).join(" · ")}{l.insumos.length > 2 ? ` · y ${l.insumos.length - 2} más` : ""}</td>
                <td style={td}><Pill e={l.estado} mapa={ESTADO_INS_INC} /></td>
              </tr>
              {abierto === l.lote && (
                <tr><td colSpan={7} style={{ padding: 0, background: "#F3F7FB", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 15 }}>Lote {l.lote} · ref {l.ref}</b>
                      <span style={{ color: T.slate, fontSize: 12 }}>Pedido {l.pedido || "—"} · {l.cliente} · {fmt(l.pendientes, 0)} prendas integradas el {fmtFecha(l.fechaIntegracion)}</span>
                      <div style={{ flex: 1 }} />
                      <button style={btn(false)} onClick={(e) => { e.stopPropagation(); imprimir([l]); }}>🖨 Hoja de este lote</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", background: T.white }}>
                      <thead><tr>{th(null, "Insumo")}{th(null, "Pide la ficha", true)}{th(null, "Entregado", true)}{th(null, "Falta entregar", true)}{th(null, "En bodega (disponible)", true)}{th(null, "Orden de compra")}{th(null, "Estado")}{th(null, "")}</tr></thead>
                      <tbody>
                        {l.insumos.map((i) => (
                          <tr key={i.insumo}>
                            <td style={td}>{i.insumo}</td>
                            <td style={{ ...td, textAlign: "right" }}>{fmt(i.pide)} {i.unidad}</td>
                            <td style={{ ...td, textAlign: "right" }}>{fmt(i.entregado)} {i.unidad}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#B8402F" }}>{fmt(i.necesito)} {i.unidad}</td>
                            <td style={{ ...td, textAlign: "right" }}>{fmt(i.bodega)} {i.unidad}</td>
                            <td style={{ ...td, fontSize: 12 }}>
                              {i.oc.map((o) => <div key={o.n}><b>OC {o.n}</b> · {o.prov}<br /><span style={{ color: T.slate }}>{fmt(o.cant)} · entrega {fmtFecha(o.ff)}{o.tarde ? " · después del despacho" : ""}</span></div>)}
                              {i.comprar > 0.005 && <div style={{ color: "#9A3A2D", fontWeight: 700 }}>{i.oc.length ? `Aún faltan ${fmt(i.comprar)} sin OC` : "Sin orden de compra vigente"}</div>}
                              {!i.oc.length && !(i.comprar > 0.005) && "—"}
                            </td>
                            <td style={td}><Pill e={i.estado} mapa={ESTADO_INS_INC} /></td>
                            <td style={td}><button style={{ ...btn(false), fontSize: 11.5, padding: "5px 9px" }} title="Este insumo nunca se integra por este documento: ocultarlo en todos los lotes" onClick={(e) => { e.stopPropagation(); ocultarInsumo(i.insumo); }}>No integrar nunca</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </td></tr>
              )}
            </React.Fragment>
          ))}
          {!visibles.length && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: T.slate }}>No hay lotes con integración incompleta con esos filtros.</td></tr>}
        </tbody>
      </table>
      {ignorados.size > 0 && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.slate }}>
          Insumos ocultos (no se revisan): {[...ignorados].map((k) => <span key={k} style={{ display: "inline-block", margin: "2px 6px 2px 0", padding: "2px 8px", background: "#F1ECE5", borderRadius: 10 }}>{k} <b style={{ cursor: "pointer" }} title="Volver a revisarlo" onClick={() => restaurarInsumo(k)}>×</b></span>)}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ color: T.slate, fontSize: 13, marginBottom: 14 }}>
        Lotes ya cortados que todavía no han recibido sus insumos de bodega. "Listos para integrar" son los que ya salieron de corte hacia planta; los que siguen en corte se muestran aparte porque sus insumos se necesitarán más adelante. Al integrar el lote en Busint, desaparece de la lista.
        {datos?.generado ? ` Datos de Busint de ${new Date(datos.generado).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}.` : ""}
      </div>
      {error && <div style={{ padding: "10px 14px", background: T.coralBg, color: T.coral, borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>⚠ {error}</div>}
      {(datos?.avisos || []).map((a, i) => <div key={i} style={{ padding: "8px 12px", background: "#FDF1DA", color: "#8A5A0B", borderRadius: 8, fontSize: 12.5, marginBottom: 8 }}>{a}</div>)}
      {cargando && !datos && <div style={{ padding: 30, textAlign: "center", color: T.slate }}>Consultando Busint (lotes, integraciones, fichas, inventario y órdenes de compra)... puede tardar un par de minutos.</div>}
      {datos && (
        <>
          <div style={{ display: "flex", background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: 4, marginBottom: 14, width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
            {[["listos", `Listos para integrar (${listos.length})`], ["corte", `Todavía en corte (${enCorte.length})`], ["incompleta", `Integración incompleta (${incompletas.length})`]].map(([v, label]) => (
              <div key={v} onClick={() => { setPestana(v); setAbierto(null); }} style={{ padding: "9px 18px", borderRadius: 9, fontWeight: 700, cursor: "pointer", fontSize: 13.5, background: pestana === v ? T.ink : "transparent", color: pestana === v ? T.white : T.slate }}>{label}</div>
            ))}
          </div>
          {pestana === "corte" && (
            <div style={{ padding: "10px 14px", background: "#EEF3F9", color: "#2D5A8C", borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
              Estos lotes siguen en la bodega de corte ({fmt(prendasCorte, 0)} prendas). Sus insumos se necesitarán cuando salgan a planta; abajo ves si alcanzarán, para que puedas adelantar compras.
            </div>
          )}
          {pestana === "incompleta" && (
            <div style={{ padding: "10px 14px", background: "#EEF3F9", color: "#2D5A8C", borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
              Lotes que ya tienen documento de integración, pero a los que Busint no les entregó todo lo que pide la ficha técnica (por ejemplo, los cierres que no habían llegado). Si un insumo de la lista nunca se integra por ese documento, ocúltalo con el botón "No integrar nunca" y deja de salir en todos los lotes.
            </div>
          )}
          {avisoIgn && <div style={{ padding: "8px 12px", background: "#FDF1DA", color: "#8A5A0B", borderRadius: 8, fontSize: 12.5, marginBottom: 8 }}>{avisoIgn}</div>}
          {pestana === "incompleta" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 16 }}>
            <Kpi t="Lotes con integración incompleta" v={base.length} d={`${insumosFaltan} insumo${insumosFaltan === 1 ? "" : "s"} distinto${insumosFaltan === 1 ? "" : "s"} por entregar`} />
            <Kpi t="Se pueden completar hoy" v={`${completables.length} lote${completables.length === 1 ? "" : "s"}`} d="el insumo ya está en bodega" />
            <Kpi t="Esperan compra" v={`${esperanCompra.length} lote${esperanCompra.length === 1 ? "" : "s"}`} d={`${esperanCompra.length - sinOC.length} con OC en camino · ${sinOC.length} sin OC`} rojo={esperanCompra.length > 0} />
            <Kpi t="Despachan en 7 días o menos" v={`${proximos.length} lote${proximos.length === 1 ? "" : "s"}`} d="prioridad para completar" />
          </div>
          ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 16 }}>
            <Kpi t={pestana === "corte" ? "Lotes en corte" : "Lotes por integrar"} v={base.length} d={`${fmt(totalPrendas, 0)} prendas`} />
            <Kpi t="Más antiguo" v={masViejo ? `${masViejo.diasSin} día${masViejo.diasSin === 1 ? "" : "s"}` : "—"} d={masViejo ? `cortado el ${fmtFecha(masViejo.corte)} · lote ${masViejo.lote}` : ""} />
            <Kpi t="Con insumo faltante" v={`${conFalta.length} lote${conFalta.length === 1 ? "" : "s"}`} d={`${conFalta.length - sinOC.length} con OC en camino · ${sinOC.length} sin OC`} rojo={conFalta.length > 0} />
            <Kpi t="Despachan en 7 días o menos" v={`${proximos.length} lote${proximos.length === 1 ? "" : "s"}`} d="prioridad de alistamiento" />
          </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lote, referencia, pedido o cliente" style={{ ...campo, minWidth: 260 }} />
            <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} style={campo}><option value="">Cliente: todos</option>{clientes.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={campo}>
              <option value="">Estado: todos</option><option value="falta">Con insumo faltante</option><option value="comprar">Hay que comprar (sin OC)</option><option value="oc_ok">Viene en OC</option><option value="oc_tarde">OC llega tarde</option><option value="justo">Alcanza justo</option><option value="ok">Todo disponible</option>
            </select>
            {pestana === "listos" && fuera.length > 0 && <label style={{ fontSize: 12.5, color: T.slate, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={verFuera} onChange={(e) => setVerFuera(e.target.checked)} />Ver {fuera.length} lote{fuera.length === 1 ? "" : "s"} que ya salieron de producción</label>}
            {cerrados.length > 0 && <label style={{ fontSize: 12.5, color: T.slate, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} />Ver {cerrados.length} lote{cerrados.length === 1 ? "" : "s"} de pedidos cerrados</label>}
            <div style={{ flex: 1 }} />
            <button style={btn(false)} onClick={() => cargar(true)} disabled={cargando}>{cargando ? "Actualizando..." : "🔄 Actualizar"}</button>
            <button style={btn(false)} onClick={exportar} disabled={!visibles.length}>⬇ Excel</button>
            <button style={btn(true)} onClick={() => imprimir(visibles)} disabled={!visibles.length}>🖨 Imprimir hoja del día</button>
          </div>
          {pestana === "incompleta" ? tablaIncompleta : (
          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{th("lote", "Lote")}{th("ref", "Referencia")}{th(null, "Dónde está")}{th("cliente", "Pedido · Cliente")}{th("despacho", "Despacho")}{th("corte", "Corte")}{th("dias", "Días desde el corte", true)}{th("prendas", "Prendas", true)}{th("estado", "Insumos en bodega")}</tr></thead>
              <tbody>
                {visibles.map((l) => (
                  <React.Fragment key={l.lote}>
                    <tr onClick={() => setAbierto(abierto === l.lote ? null : l.lote)} style={{ cursor: "pointer", background: abierto === l.lote ? "#F3F7FB" : "transparent" }}>
                      <td style={{ ...td, fontWeight: 800, fontSize: 15 }}>{l.lote}</td>
                      <td style={td}>{l.ref}</td>
                      <td style={{ ...td, fontSize: 12, color: l.ubicTipo === "corte" ? "#2D5A8C" : T.ink }}>{l.ubicTexto}</td>
                      <td style={td}>{l.pedido || "—"} · <span style={{ color: T.slate, fontSize: 12 }}>{l.cliente}</span></td>
                      <td style={td}>{fmtFecha(l.despacho)}</td>
                      <td style={td}>{fmtFecha(l.corte)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{l.diasSin}</td>
                      <td style={{ ...td, textAlign: "right" }}>{l.pendientes == null ? "—" : fmt(l.pendientes, 0)}{l.parcial ? <div style={{ fontSize: 10.5, color: "#A8660B" }}>integración parcial</div> : null}</td>
                      <td style={td}>
                        {l.ubicTipo === "corte" && !["sin_ficha", "sin_prendas"].includes(l.estado)
                          ? <><span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 20, fontSize: 11.5, fontWeight: 800, background: "#E6EEF8", color: "#2D5A8C", whiteSpace: "nowrap" }}>● Aún en corte</span><div style={{ fontSize: 11.5, color: T.slate, marginTop: 3 }}>{textoAnticipado(l)}</div></>
                          : <Pill e={l.estado} extra={textoLote(l)} />}
                      </td>
                    </tr>
                    {abierto === l.lote && (
                      <tr><td colSpan={9} style={{ padding: 0, background: "#F3F7FB", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ padding: "12px 18px" }}>
                          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                            <b style={{ fontSize: 15 }}>Lote {l.lote} · ref {l.ref}</b>
                            <span style={{ color: T.slate, fontSize: 12 }}>
                              Pedido {l.pedido || "—"} · {l.cliente}{l.pendientes != null ? ` · ${fmt(l.pendientes, 0)} prendas` : ""}{l.colores?.length ? ` · colores ${l.colores.map(([c, u]) => `${c} (${fmt(u, 0)})`).join(", ")}` : ""}
                            </span>
                            <div style={{ flex: 1 }} />
                            <button style={btn(false)} onClick={(e) => { e.stopPropagation(); imprimir([l]); }}>🖨 Hoja de este lote</button>
                          </div>
                          {l.estado === "sin_ficha" ? <div style={{ fontSize: 13, color: T.slate }}>Busint no tiene insumos de material en la ficha de esta referencia (o no coinciden con el inventario).</div> : (
                            <table style={{ width: "100%", borderCollapse: "collapse", background: T.white }}>
                              <thead><tr>{th(null, "Insumo que debe entregar")}{th(null, "Por prenda", true)}{th(null, "Entregar", true)}{th(null, "En bodega (disponible)", true)}{th(null, "Falta", true)}{th(null, "Orden de compra")}{th(null, "Estado")}</tr></thead>
                              <tbody>
                                {l.insumos.map((i) => (
                                  <tr key={i.insumo}>
                                    <td style={td}>{i.insumo}</td>
                                    <td style={{ ...td, textAlign: "right" }}>{fmt(i.consumo, 4)}</td>
                                    <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{i.necesito == null ? "—" : `${fmt(i.necesito)} ${i.unidad}`}</td>
                                    <td style={{ ...td, textAlign: "right" }}>{fmt(i.bodega)} {i.unidad}</td>
                                    <td style={{ ...td, textAlign: "right", color: i.falta > 0.005 ? "#B8402F" : T.slate, fontWeight: i.falta > 0.005 ? 800 : 400 }}>{i.falta > 0.005 ? `${fmt(i.falta)} ${i.unidad}` : "—"}</td>
                                    <td style={{ ...td, fontSize: 12 }}>
                                      {i.oc.map((o) => <div key={o.n}><b>OC {o.n}</b> · {o.prov}<br /><span style={{ color: T.slate }}>{fmt(o.cant)} · entrega {fmtFecha(o.ff)}{o.tarde ? " · después del despacho" : ""}</span></div>)}
                                      {i.comprar > 0.005 && <div style={{ color: "#9A3A2D", fontWeight: 700 }}>{i.oc.length ? `Aún faltan ${fmt(i.comprar)} sin OC` : "Sin orden de compra vigente"}</div>}
                                      {!i.oc.length && !(i.comprar > 0.005) && "—"}
                                    </td>
                                    <td style={td}><Pill e={i.estado} mapa={ESTADO_INS} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
                {!visibles.length && <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: T.slate }}>{pestana === "corte" ? "No hay lotes en corte con esos filtros." : "No hay lotes listos para integrar con esos filtros."}</td></tr>}
              </tbody>
            </table>
          </div>
          )}
          <div style={{ color: T.slate, fontSize: 12, marginTop: 10 }}>
            Cada insumo = consumo de la ficha técnica × prendas del lote. El inventario y las órdenes de compra se reparten lote por lote en orden de fecha de despacho, para que dos lotes no cuenten el mismo inventario. La orden de compra se muestra solo si sigue vigente (no cumplida ni marcada como recibida). Lotes de los últimos {datos.dias} días.
          </div>
        </>
      )}
    </div>
  );
}
