// ─── EXPLOSIÓN DE MATERIALES ──────────────────────────────────────────────────
// (2026-10-17, a pedido de Fredy) Opción del menú Pedidos: se eligen uno o
// varios pedidos y se calcula, con la ficha técnica de cada referencia en
// Busint (función "getFichaMaterialesBusint"), cuánto material hace falta,
// cuánto hay en bodega, cuánto viene en órdenes de compra vigentes
// ("getOrdenesCompraBusint", solo administradores) y cuánto falta comprar.
//   Necesito = Σ (unidades × consumo por prenda) × (1 + merma)
//   Falta    = Necesito − Tengo − En camino   (nunca menor que 0)
// Unidades = lo pedido, o solo lo que falta por cortar (opción, activa por
// defecto) para no pedir de nuevo lo que ya se cortó.
// (2026-10-19, a pedido de Fredy) Los INSUMOS se descuentan por INTEGRACIÓN, no por
// corte: el insumo sale de bodega cuando el lote se integra en Busint (validado con
// el lote 7222). Con "solo lo que falta", las telas usan lo que falta por cortar y los
// insumos usan lo que falta por INTEGRAR (pedido − prendas ya integradas, por pedido y
// referencia, según "bmp - integracion ref"; ver ajustarInsumosPorIntegracion).
// (2026-10-18, a pedido de Fredy) Informe rediseñado: "Por material" (tela →
// color, con total por tela) y "Por referencia" (qué necesita cada referencia
// y por qué). El faltante se calcula por material; en la vista por referencia
// se REPARTE en proporción a lo que consume cada referencia (estimación).
import React, { useState, useMemo, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { cargarLotesPorIntegrar } from "./lotes-por-integrar";

const fmt = (n, dec = 2) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("es-CO", { maximumFractionDigits: dec }) : "—");
const money = (n) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
const normTxt = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const sumarDias = (iso, d) => { const f = new Date(iso + "T12:00:00"); f.setDate(f.getDate() + d); return f.toISOString().slice(0, 10); };
const LS = "atlasExplosion_opciones";
let cacheOC = null; // { en: Date.now(), datos }

function leerOpciones() {
  try { return { mermaTela: 0, mermaInsumo: 0, soloPorCortar: true, ...(JSON.parse(localStorage.getItem(LS) || "{}")) }; } catch { return { mermaTela: 0, mermaInsumo: 0, soloPorCortar: true }; }
}
function guardarOpciones(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch {} }

// Unidades pendientes de una referencia del pedido (pedido − ya cortado)
export function unidadesPendientes(pedido, r) {
  const cortado = (pedido.cortesRealizados || []).flatMap((c) => c.refs || []).filter((cr) => cr.refId === r.id)
    .reduce((s, cr) => s + Object.values(cr.tallas || {}).reduce((a, v) => a + (Number(v) || 0), 0), 0);
  return { total: Number(r.total) || 0, cortado, pendiente: Math.max(0, (Number(r.total) || 0) - cortado) };
}

const refSG = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// (2026-10-18, a pedido de Fredy) Ajusta lo que falta por cortar con lo que YA
// cortó Busint. ATLAS solo sabe de los cortes registrados en ATLAS; Busint
// ("Disponible para despachar", campo etSinCortar = pedido − despachado −
// unidades en corte/planta/semiterminado/BPT) sabe de todos. Por pedido y
// referencia se usa el MENOR de los dos pendientes (si algo se cortó hoy y
// Busint aún no lo refleja, vale lo de ATLAS). Busint da el dato por
// referencia, no por color: el resultado se reparte entre los colores en
// proporción a lo que ATLAS tiene pendiente de cada uno.
// Si el pedido o la referencia no aparecen en Busint (pedido manual, ya
// cumplido...), se queda el cálculo de ATLAS y se anota en "nota".
export function ajustarPorCorteBusint({ lineas, bus }) {
  const grupos = new Map();
  lineas.forEach((l) => {
    const k = `${l.pedido}|${refSG(l.ref)}`;
    const g = grupos.get(k) || { pedido: l.pedido, cliente: l.cliente, k, lineas: [], pend: 0 };
    g.lineas.push(l); g.pend += l.pendAtlas; grupos.set(k, g);
  });
  const resumen = new Map();
  const salida = [];
  grupos.forEach((g) => {
    let r = resumen.get(g.pedido);
    if (!r) { r = { pedido: g.pedido, cliente: g.cliente, total: 0, atlas: 0, busint: null, usado: 0, notas: new Set() }; resumen.set(g.pedido, r); }
    const total = g.lineas.reduce((a, l) => a + l.total, 0);
    let usar = g.pend;
    if (bus) {
      if (!bus.pedidos.has(String(g.pedido).trim())) r.notas.add("no aparece en Busint (¿manual o ya cumplido?): se usó ATLAS");
      else if (!bus.refs.has(g.k)) r.notas.add(`ref. ${g.lineas[0].ref} no encontrada en el pedido de Busint: se usó ATLAS`);
      else { const b = bus.refs.get(g.k); r.busint = (r.busint || 0) + b; usar = Math.min(g.pend, b); }
    }
    const factor = g.pend > 0 ? usar / g.pend : 0;
    g.lineas.forEach((l) => salida.push({ ...l, unidades: Math.round(l.pendAtlas * factor) }));
    r.total += total; r.atlas += g.pend; r.usado += usar;
  });
  return { lineas: salida.filter((l) => l.unidades > 0), resumen: [...resumen.values()].map((r) => ({ ...r, notas: [...r.notas] })) };
}

// (2026-10-19) Unidades sobre las que se calculan los INSUMOS: lo pedido menos lo ya
// INTEGRADO en Busint, por pedido y referencia (Busint integra por referencia, no por
// pinta/color: el pendiente se reparte entre las líneas en proporción a lo pedido).
// integ: Map `${pedido}|${refSG}` -> prendas integradas, o null si no se pudo leer
// (entonces los insumos usan las mismas prendas por cortar de las telas).
export function ajustarInsumosPorIntegracion({ lineas, integ }) {
  if (!integ) return { lineas: lineas.map((l) => ({ ...l, unidadesIns: l.unidades })), resumen: [] };
  const grupos = new Map();
  lineas.forEach((l) => {
    const k = `${String(l.pedido).trim()}|${refSG(l.ref)}`;
    const g = grupos.get(k) || { k, pedido: l.pedido, total: 0 };
    g.total += l.total; grupos.set(k, g);
  });
  const resumen = new Map();
  grupos.forEach((g) => {
    const integrado = Math.min(g.total, integ.get(g.k) || 0);
    g.factor = g.total > 0 ? (g.total - integrado) / g.total : 0;
    const r = resumen.get(g.pedido) || { pedido: g.pedido, integrado: 0, sinIntegrar: 0 };
    r.integrado += integrado; r.sinIntegrar += g.total - integrado; resumen.set(g.pedido, r);
  });
  return {
    lineas: lineas.map((l) => ({ ...l, unidadesIns: Math.round(l.total * grupos.get(`${String(l.pedido).trim()}|${refSG(l.ref)}`).factor) })),
    resumen: [...resumen.values()],
  };
}

function tipoUnidadTela(u) {
  const t = String(u || "").trim().toLowerCase().replace(/\./g, "");
  if (t === "m2" || t === "m²") return "m2";
  if (t === "kg" || t === "kgs" || t === "kilo" || t === "kilos") return "kg";
  return "m"; // vacío, Mt, ML, m...
}

// Punto de color aproximado a partir del NOMBRE del color del pedido (solo guía visual)
const COLORES_APROX = [
  ["negro", "#222222"], ["blanco", "#FFFFFF"], ["crudo", "#F2EBDD"], ["marfil", "#F2EBDD"], ["beige", "#D9C7A7"], ["arena", "#D9C7A7"], ["cafe", "#7A5230"], ["chocolate", "#5A3A22"], ["cocoa", "#7A5230"], ["mostaza", "#D9A62B"],
  ["amarillo", "#F2D03B"], ["naranja", "#F08A3C"], ["rojo", "#D6443A"], ["vino", "#7B2335"], ["fucsia", "#D6409F"], ["rosado", "#F2B8C6"], ["rosa", "#F2B8C6"], ["lila", "#C9B3E0"], ["morado", "#7B5EA7"], ["violeta", "#7B5EA7"],
  ["azul clar", "#9CC3E6"], ["celeste", "#9CC3E6"], ["azul", "#3D6B9E"], ["turquesa", "#3CB5B0"], ["verde", "#4C9A62"], ["menta", "#A8DCC0"], ["gris", "#9A9AA5"], ["plomo", "#9A9AA5"], ["jaspe", "#B5B5BD"],
];
function colorAprox(nombre) {
  const n = normTxt(nombre);
  const hit = COLORES_APROX.find(([k]) => n.includes(k));
  return hit ? hit[1] : "#E8E2DB";
}

// Núcleo del cálculo (función pura)
export function calcularExplosion({ lineas, fichas, enCamino, mermaTela, mermaInsumo }) {
  const telas = new Map();
  const insumos = new Map();
  const otros = new Map();
  const sinFicha = new Map();
  const avisosTela = [];
  const refs = new Map();
  lineas.forEach((l) => {
    const ficha = fichas.get(`${l.ref}|${l.pinta}`);
    if (!ficha) return;
    if (!ficha.tieneTelas && !ficha.tieneInsumos) { sinFicha.set(l.ref, (sinFicha.get(l.ref) || 0) + Math.max(l.unidades, l.unidadesIns ?? 0)); return; }
    const uIns = l.unidadesIns ?? l.unidades;
    if (!ficha.tieneTelas && l.unidades > 0) avisosTela.push(`${l.ref}: sin tela registrada en Busint`);
    let r = refs.get(l.ref);
    if (!r) { r = { ref: l.ref, pedidos: new Set(), colores: new Set(), unidades: 0, unidadesIns: 0, items: [] }; refs.set(l.ref, r); }
    r.pedidos.add(l.pedido); if (l.color) r.colores.add(l.color); r.unidades += l.unidades; r.unidadesIns += uIns;
    if (l.unidades > 0) ficha.telas.forEach((t) => {
      const tipo = tipoUnidadTela(t.unidad);
      const clave = `${t.nombre}|${t.color || "?"}|${tipo}`;
      let a = telas.get(clave);
      if (!a) {
        const tengo = tipo === "m" ? t.stockMl : tipo === "m2" ? t.stockM2 : null;
        a = { clave, tipo: "tela", nombre: t.nombre, color: t.color, codcomp: t.codcomp, unidad: tipo === "m" ? "m" : tipo === "m2" ? "m²" : "kg", necesito: 0, tengo: t.motivo === "ok" ? tengo : null, promedio: t.promedio, motivo: t.motivo, enCamino: 0, vencidas: 0, usos: [], nombresColor: new Map() };
        telas.set(clave, a);
      }
      const cant = l.unidades * t.consumo * (1 + mermaTela / 100);
      a.necesito += cant;
      a.usos.push({ pedido: l.pedido, ref: l.ref, color: l.color, unidades: l.unidades, consumo: t.consumo, cant });
      if (l.color) a.nombresColor.set(l.color, (a.nombresColor.get(l.color) || 0) + l.unidades);
      r.items.push({ tipo: "tela", clave, nombre: t.nombre, colorCod: t.color, colorNombre: l.color, unidad: a.unidad, consumo: t.consumo, unidades: l.unidades, cant });
      if (t.motivo !== "ok") avisosTela.push(`${l.ref} (${l.pinta}) · ${t.nombre}: ${({ sin_detalle_color: "sin detalle de color en Busint", slot_sin_color: "sin color asignado", color_no_en_inventario: "ese color no está en inventario" })[t.motivo] || t.motivo}`);
    });
    if (uIns > 0) ficha.insumos.forEach((ins) => {
      if (!ins.material) {
        const o = otros.get(ins.insumo) || { nombre: ins.insumo, refs: new Set(), cant: ins.cant };
        o.refs.add(l.ref); otros.set(ins.insumo, o); return;
      }
      if (!(ins.cant > 0)) return;
      const clave = ins.insumo.toUpperCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
      let a = insumos.get(clave);
      if (!a) {
        a = { clave, tipo: "insumo", nombre: ins.insumo, unidad: ins.inventario.unidad || "", necesito: 0, tengo: ins.inventario.cantidad, colores: ins.inventario.colores, promedio: ins.inventario.promedio, codcomps: ins.inventario.codcomps, enCamino: 0, vencidas: 0, usos: [], nombresColor: new Map() };
        insumos.set(clave, a);
      }
      const cant = uIns * ins.cant * (1 + mermaInsumo / 100);
      a.necesito += cant;
      a.usos.push({ pedido: l.pedido, ref: l.ref, color: l.color, unidades: uIns, consumo: ins.cant, cant, ubicacion: ins.ubicacion });
      r.items.push({ tipo: "insumo", clave, nombre: ins.insumo, colorCod: null, colorNombre: l.color, unidad: a.unidad, consumo: ins.cant, unidades: uIns, cant, ubicacion: ins.ubicacion });
    });
  });
  const cerrar = (a) => {
    if (a.tipo === "tela") {
      if (a.codcomp && enCamino.has(a.codcomp)) { a.enCamino = enCamino.get(a.codcomp).vig; a.vencidas = enCamino.get(a.codcomp).venc; }
    } else {
      (a.codcomps || []).forEach((c) => { const e = enCamino.get(c); if (e) { a.enCamino += e.vig; a.vencidas += e.venc; } });
    }
    if (a.tengo === null || a.tengo === undefined) { a.falta = null; a.estado = "sindato"; }
    else {
      a.falta = Math.max(0, a.necesito - a.tengo - a.enCamino);
      a.estado = a.falta > 0.005 ? "comprar" : a.tengo >= a.necesito - 0.005 ? "cubierto" : "cubierto_oc";
    }
    a.costoFalta = a.falta && a.promedio > 0 ? a.falta * a.promedio : 0;
    // Cobertura (para la barra): lo que cubre la bodega, lo que cubren las OC, lo que falta
    const tengo = Math.max(0, a.tengo || 0);
    a.cubreBodega = Math.min(a.necesito, tengo);
    a.cubreOC = Math.min(Math.max(a.necesito - tengo, 0), a.enCamino);
    a.nombreColor = [...a.nombresColor.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n);
    return a;
  };
  const orden = { comprar: 0, sindato: 1, cubierto_oc: 2, cubierto: 3 };
  const ordenar = (arr) => arr.map(cerrar).sort((x, y) => orden[x.estado] - orden[y.estado] || (y.falta || 0) - (x.falta || 0) || x.nombre.localeCompare(y.nombre, "es"));
  const listaTelas = ordenar([...telas.values()]);
  const listaInsumos = ordenar([...insumos.values()]);

  // Telas agrupadas por nombre (y unidad): total por tela + sus colores
  const grupos = new Map();
  listaTelas.forEach((c) => {
    const k = `${c.nombre}|${c.unidad}`;
    let g = grupos.get(k);
    if (!g) { g = { clave: k, nombre: c.nombre, unidad: c.unidad, colores: [], necesito: 0, tengo: 0, tengoConocido: true, enCamino: 0, falta: 0, costoFalta: 0, cubreBodega: 0, cubreOC: 0, refs: new Set(), pedidos: new Set() }; grupos.set(k, g); }
    g.colores.push(c);
    g.necesito += c.necesito; g.enCamino += c.enCamino; g.cubreBodega += c.cubreBodega; g.cubreOC += c.cubreOC;
    if (c.tengo === null || c.tengo === undefined) g.tengoConocido = false; else g.tengo += c.tengo;
    g.falta += c.falta || 0; g.costoFalta += c.costoFalta || 0;
    c.usos.forEach((u) => { g.refs.add(u.ref); g.pedidos.add(u.pedido); });
  });
  const gruposTela = [...grupos.values()].map((g) => {
    const estados = g.colores.map((c) => c.estado);
    g.estado = estados.includes("comprar") ? "comprar" : estados.includes("sindato") ? "sindato" : estados.includes("cubierto_oc") ? "cubierto_oc" : "cubierto";
    g.refs = g.refs.size; g.pedidos = g.pedidos.size;
    return g;
  }).sort((x, y) => orden[x.estado] - orden[y.estado] || y.falta - x.falta || x.nombre.localeCompare(y.nombre, "es"));

  // Por referencia: el faltante de cada material se reparte según lo que consume cada referencia
  const mat = new Map([...listaTelas, ...listaInsumos].map((a) => [`${a.tipo}|${a.clave}`, a]));
  const porRef = [...refs.values()].map((r) => {
    let costoFalta = 0;
    const items = r.items.map((it) => {
      const m = mat.get(`${it.tipo}|${it.clave}`);
      const parte = m && m.necesito > 0 ? it.cant / m.necesito : 0;
      const faltaParte = m && m.falta ? m.falta * parte : 0;
      const costoParte = m && m.costoFalta ? m.costoFalta * parte : 0;
      costoFalta += costoParte;
      return { ...it, faltaParte, costoParte, estado: m?.estado };
    });
    const telasTot = new Map();
    items.filter((i) => i.tipo === "tela").forEach((i) => { const k = `${i.nombre}|${i.unidad}`; const x = telasTot.get(k) || { nombre: i.nombre, unidad: i.unidad, cant: 0 }; x.cant += i.cant; telasTot.set(k, x); });
    const insumosDist = new Set(items.filter((i) => i.tipo === "insumo").map((i) => i.clave));
    return { ref: r.ref, pedidos: [...r.pedidos], colores: [...r.colores], unidades: r.unidades, unidadesIns: r.unidadesIns, items, costoFalta, telasTot: [...telasTot.values()], nInsumos: insumosDist.size, hayFalta: items.some((i) => i.faltaParte > 0.005) };
  }).sort((a, b) => b.costoFalta - a.costoFalta || Number(b.hayFalta) - Number(a.hayFalta) || a.ref.localeCompare(b.ref, "es"));

  return {
    telas: listaTelas,
    insumos: listaInsumos,
    gruposTela,
    porRef,
    otros: [...otros.values()].map((o) => ({ ...o, refs: [...o.refs] })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    sinFicha: [...sinFicha.entries()].map(([ref, unidades]) => ({ ref, unidades })),
    avisosTela: [...new Set(avisosTela)],
  };
}

const ESTADOS = {
  comprar: { txt: "Comprar", fg: "#9A3A2D", bg: "#FBE9E6" },
  sindato: { txt: "Sin dato de bodega", fg: "#3F5565", bg: "#E8EEF2" },
  cubierto_oc: { txt: "Cubierto con OC", fg: "#A8660B", bg: "#FDF1DA" },
  cubierto: { txt: "Hay suficiente", fg: "#1E7A52", bg: "#E3F5EC" },
};
const VERDE = "#2D9E6B", AMBAR = "#E0A93B", ROJO = "#E85D4A";

function Pill({ e }) {
  return <span style={{ display: "inline-block", padding: "3px 11px", borderRadius: 20, fontSize: 11.5, fontWeight: 800, background: ESTADOS[e].bg, color: ESTADOS[e].fg, whiteSpace: "nowrap" }}>{ESTADOS[e].txt}</span>;
}
function Barra({ necesito, bodega, oc, falta, T }) {
  const p = (x) => (necesito > 0 ? Math.max(0, Math.min(100, (x / necesito) * 100)) : 0);
  return (
    <div>
      <div style={{ height: 12, borderRadius: 6, background: "#EFEAE3", display: "flex", overflow: "hidden" }}>
        <i style={{ display: "block", width: `${p(bodega)}%`, background: VERDE }} />
        <i style={{ display: "block", width: `${p(oc)}%`, background: AMBAR }} />
        <i style={{ display: "block", width: `${p(falta)}%`, background: ROJO }} />
      </div>
      <div style={{ fontSize: 11, color: T.slate, marginTop: 4, whiteSpace: "nowrap" }}>
        <span style={{ color: VERDE }}>■</span> bodega &nbsp;<span style={{ color: AMBAR }}>■</span> en camino &nbsp;<span style={{ color: ROJO }}>■</span> falta
      </div>
    </div>
  );
}

export default function ExplosionMaterialesView({ db, functionsClient, T, pedidos }) {
  const [opc, setOpc] = useState(leerOpciones);
  const [sel, setSel] = useState({});
  const [q, setQ] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState("");
  const [avisoOC, setAvisoOC] = useState("");
  const [datos, setDatos] = useState(null); // { fichas: Map, enCamino: Map, lineas, generado }
  const [selAbierta, setSelAbierta] = useState(true);
  const [pagina, setPagina] = useState("informe"); // informe | fichas | otros
  const [vista, setVista] = useState("material"); // material | referencia
  const [tipoMat, setTipoMat] = useState("telas"); // telas | insumos
  const [soloFalta, setSoloFalta] = useState(false);
  const [abierto, setAbierto] = useState({});
  const [avisoBus, setAvisoBus] = useState("");
  const [avisoInteg, setAvisoInteg] = useState("");
  const [verCorte, setVerCorte] = useState(false);

  useEffect(() => { guardarOpciones(opc); }, [opc]);
  const alternar = (k) => setAbierto((s) => ({ ...s, [k]: !s[k] }));

  const candidatos = useMemo(() => (pedidos || []).filter((p) => p.estado === "activo").map((p) => {
    const unidades = (p.referencias || []).reduce((s, r) => s + unidadesPendientes(p, r).pendiente, 0);
    const total = (p.referencias || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
    return { p, unidades, total };
  }).sort((a, b) => String(a.p.fechaDespacho || "9999").localeCompare(String(b.p.fechaDespacho || "9999"))), [pedidos]);
  const visibles = useMemo(() => {
    const k = normTxt(q);
    return !k ? candidatos : candidatos.filter(({ p }) => normTxt(`${p.numero} ${p.cliente} ${(p.referencias || []).map((r) => r.ref).join(" ")}`).includes(k));
  }, [candidatos, q]);
  const elegidos = candidatos.filter(({ p }) => sel[p.id]);

  // Líneas (ref + color + unidades) de los pedidos elegidos, según la opción de unidades.
  // pendAtlas = lo que falta por cortar según los cortes registrados en ATLAS.
  const lineasAtlas = useMemo(() => {
    const out = [];
    elegidos.forEach(({ p }) => (p.referencias || []).forEach((r) => {
      const u = unidadesPendientes(p, r);
      const [pinta, ...resto] = String(r.descripcion || "").split(" · ");
      out.push({ idx: out.length, pedido: p.numero, cliente: p.cliente, ref: String(r.ref || "").trim(), pinta: pinta.trim(), color: resto.join(" · ").trim(), unidades: opc.soloPorCortar ? u.pendiente : u.total, total: u.total, pendAtlas: u.pendiente });
    }));
    return out;
  }, [elegidos, opc.soloPorCortar]); // eslint-disable-line
  const lineas = useMemo(() => lineasAtlas.filter((l) => l.total > 0), [lineasAtlas]);

  async function calcular() {
    if (!lineas.length) return;
    setCalculando(true); setError(""); setAvisoOC(""); setAvisoBus(""); setAvisoInteg("");
    try {
      const unicos = [...new Map(lineas.map((l) => [`${l.ref}|${l.pinta}`, { ref: l.ref, pinta: l.pinta }])).values()];
      const pFicha = httpsCallable(functionsClient, "getFichaMaterialesBusint", { timeout: 540000 })({ items: unicos });
      pFicha.catch(() => {}); // si luego no hace falta (todo cortado), no queda un error sin atender
      // Lo que Busint ya cortó (misma consulta de "Disponible para despachar"): solo cuando se pide "lo que falta por cortar"
      const pBus = (async () => {
        if (!opc.soloPorCortar) return null;
        try {
          const resp = await httpsCallable(functionsClient, "getDisponibleParaDespachar", { timeout: 540000 })({});
          if ((resp.data?.avisos || []).some((a) => /Panel de Flujo/i.test(String(a)))) {
            setAvisoBus("Busint no entregó el panel de producción: se usó solo lo cortado que está registrado en ATLAS.");
            return null;
          }
          const bus = { pedidos: new Set(), refs: new Map() };
          (resp.data?.porCliente || []).forEach((g) => (g.filas || []).forEach((f) => {
            if (f.esPreorden) return;
            const ped = String(f.numPed ?? "").trim();
            if (!ped || ped.startsWith("(")) return;
            bus.pedidos.add(ped);
            const k = `${ped}|${refSG(f.ref)}`;
            bus.refs.set(k, (bus.refs.get(k) || 0) + (Number(f.etSinCortar) || 0));
          }));
          return bus;
        } catch (err) {
          setAvisoBus("No pude consultar lo cortado en Busint: se usó solo lo cortado que está registrado en ATLAS.");
          return null;
        }
      })();
      // Lo que Busint ya INTEGRÓ (el insumo sale de bodega al integrar): solo con "lo que falta"
      const pInteg = (async () => {
        if (!opc.soloPorCortar) return null;
        try {
          const d = await cargarLotesPorIntegrar(functionsClient);
          const m = new Map();
          (d?.integradas || []).forEach(([ped, ref, u]) => m.set(`${String(ped).trim()}|${refSG(ref)}`, Number(u) || 0));
          return m;
        } catch (err) {
          setAvisoInteg("No pude consultar las integraciones de Busint: los insumos se calcularon sobre lo que falta por cortar (puede pedir de más).");
          return null;
        }
      })();
      const pOC = (async () => {
        if (cacheOC && Date.now() - cacheOC.en < 15 * 60 * 1000) return cacheOC.datos;
        try {
          const [resp, marcasSnap] = await Promise.all([
            httpsCallable(functionsClient, "getOrdenesCompraBusint", { timeout: 540000 })({}),
            getDocs(collection(db, "contabilidad_ordenes_compra_recibidas")),
          ]);
          const marcas = new Set(marcasSnap.docs.map((d) => d.id));
          const hoy = hoyISO();
          const desde = sumarDias(hoy, -60);
          const mapa = new Map();
          (resp.data?.ordenes || []).forEach((o) => {
            if (o.dx || marcas.has(String(o.n)) || !o.ff) return;
            const vigente = o.ff >= hoy;
            if (!vigente && o.ff < desde) return;
            (o.l || []).forEach(([cod, cant]) => {
              const e = mapa.get(cod) || { vig: 0, venc: 0 };
              if (vigente) e.vig += cant; else e.venc += cant;
              mapa.set(cod, e);
            });
          });
          cacheOC = { en: Date.now(), datos: mapa };
          return mapa;
        } catch (err) {
          setAvisoOC("No pude traer las órdenes de compra (la consulta es solo para administradores o falló). \"En camino\" queda en 0.");
          return new Map();
        }
      })();
      const bus = await pBus;
      let lineasUsar = lineas;
      let resumenCorte = null;
      let resumenInteg = null;
      if (opc.soloPorCortar) {
        const aj = ajustarPorCorteBusint({ lineas: lineasAtlas, bus });
        const telaPorIdx = new Map(aj.lineas.map((l) => [l.idx, l.unidades]));
        const base = lineasAtlas.map((l) => ({ ...l, unidades: telaPorIdx.get(l.idx) || 0 }));
        const integ = await pInteg;
        const ai = ajustarInsumosPorIntegracion({ lineas: base, integ });
        lineasUsar = ai.lineas.filter((l) => l.unidades > 0 || l.unidadesIns > 0);
        resumenCorte = aj.resumen;
        resumenInteg = integ ? ai.resumen : null;
      }
      const pedidosNum = elegidos.map(({ p }) => p.numero);
      if (!lineasUsar.length) {
        setDatos({ fichas: new Map(), enCamino: new Map(), lineas: [], generado: new Date().toISOString(), pedidos: pedidosNum, resumenCorte, resumenInteg, todoCortado: true, conBusint: !!bus });
        setAbierto({}); setPagina("informe"); setSelAbierta(false);
        return;
      }
      const [respFicha, enCamino] = await Promise.all([pFicha, pOC]);
      const fichas = new Map((respFicha.data?.items || []).map((i) => [`${i.ref}|${i.pinta}`, i]));
      setDatos({ fichas, enCamino, lineas: lineasUsar, generado: new Date().toISOString(), pedidos: pedidosNum, resumenCorte, resumenInteg, todoCortado: false, conBusint: !!bus });
      setAbierto({}); setPagina("informe"); setSelAbierta(false);
    } catch (err) {
      setError(err?.message || "No se pudo consultar Busint.");
    } finally {
      setCalculando(false);
    }
  }

  const resultado = useMemo(() => datos ? calcularExplosion({ lineas: datos.lineas, fichas: datos.fichas, enCamino: datos.enCamino, mermaTela: Number(opc.mermaTela) || 0, mermaInsumo: Number(opc.mermaInsumo) || 0 }) : null, [datos, opc.mermaTela, opc.mermaInsumo]);
  const todos = resultado ? [...resultado.telas, ...resultado.insumos] : [];
  const aComprar = todos.filter((a) => a.estado === "comprar");
  const costoTotal = aComprar.reduce((s, a) => s + a.costoFalta, 0);
  const nombreColorDe = (c) => (c.nombreColor && c.nombreColor.length ? c.nombreColor.slice(0, 2).join(" / ") : "");

  async function exportar() {
    if (!resultado) return;
    const XLSX = await import("xlsx");
    const r2 = (n) => (n == null ? "" : +Number(n).toFixed(2));
    const filaTela = (a) => ({ Tela: a.nombre, "Color (cód.)": a.color || "", "Color (pedido)": nombreColorDe(a), Unidad: a.unidad, Necesito: r2(a.necesito), Tengo: r2(a.tengo), "En camino (OC)": r2(a.enCamino), "Falta comprar": r2(a.falta), "Costo prom. unidad": Math.round(a.promedio || 0), "Costo estimado": Math.round(a.costoFalta || 0), Estado: ESTADOS[a.estado].txt });
    const filaIns = (a) => ({ Insumo: a.nombre, Unidad: a.unidad, Necesito: r2(a.necesito), Tengo: r2(a.tengo), "En camino (OC)": r2(a.enCamino), "Falta comprar": r2(a.falta), "Costo prom. unidad": Math.round(a.promedio || 0), "Costo estimado": Math.round(a.costoFalta || 0), Estado: ESTADOS[a.estado].txt });
    const wb = XLSX.utils.book_new();
    const add = (nombre, filas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ Aviso: "Sin filas" }]), nombre);
    const resumenTela = [];
    resultado.gruposTela.forEach((g) => {
      resumenTela.push({ Tela: g.nombre, "Color (cód.)": "TOTAL TELA", "Color (pedido)": "", Unidad: g.unidad, Necesito: r2(g.necesito), Tengo: g.tengoConocido ? r2(g.tengo) : "", "En camino (OC)": r2(g.enCamino), "Falta comprar": r2(g.falta), "Costo prom. unidad": "", "Costo estimado": Math.round(g.costoFalta), Estado: ESTADOS[g.estado].txt });
      g.colores.forEach((c) => resumenTela.push(filaTela(c)));
    });
    add("Telas por color", resumenTela);
    add("Insumos", resultado.insumos.map(filaIns));
    add("Para comprar", [...resultado.telas.filter((a) => a.estado === "comprar").map(filaTela), ...resultado.insumos.filter((a) => a.estado === "comprar").map(filaIns)]);
    const filasRef = [];
    resultado.porRef.forEach((r) => {
      r.items.forEach((i) => filasRef.push({ Referencia: r.ref, Pedidos: r.pedidos.join(", "), Tipo: i.tipo === "tela" ? "Tela" : "Insumo", Material: i.nombre, "Color (cód.)": i.colorCod || "", "Color (pedido)": i.colorNombre || "", Unidad: i.unidad, "Prendas por cortar": i.unidades, "Consumo por prenda": +Number(i.consumo).toFixed(4), Cantidad: r2(i.cant), "Falta (estimado)": r2(i.faltaParte), "Costo falta (estimado)": Math.round(i.costoParte || 0) }));
      filasRef.push({ Referencia: r.ref, Pedidos: "", Tipo: "TOTAL", Material: `${r.unidades} prendas`, "Costo falta (estimado)": Math.round(r.costoFalta) });
    });
    add("Por referencia", filasRef);
    XLSX.writeFile(wb, `Explosion de materiales ${hoyISO()}.xlsx`);
  }

  function imprimir() {
    if (!resultado) return;
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const fila = (cols, cls = "") => `<tr class="${cls}">${cols.map((c, i) => `<td class="${i ? "n" : ""}">${esc(c)}</td>`).join("")}</tr>`;
    const tela = resultado.gruposTela.map((g) => `<h3>${esc(g.nombre)} <small>${esc(ESTADOS[g.estado].txt)}</small></h3><table><tr><th>Color</th><th>Necesito</th><th>Tengo</th><th>En camino</th><th>Falta comprar</th></tr>${g.colores.map((c) => fila([`${nombreColorDe(c) || "—"} · cód. ${c.color || "?"}`, `${fmt(c.necesito)} ${c.unidad}`, c.tengo == null ? "—" : `${fmt(c.tengo)} ${c.unidad}`, c.enCamino ? fmt(c.enCamino) : "—", c.falta == null ? "?" : c.falta > 0 ? `${fmt(c.falta)} ${c.unidad}` : "0"], c.estado === "comprar" ? "rojo" : "")).join("")}${fila(["TOTAL " + g.nombre, `${fmt(g.necesito)} ${g.unidad}`, g.tengoConocido ? `${fmt(g.tengo)} ${g.unidad}` : "—", g.enCamino ? fmt(g.enCamino) : "—", `${fmt(g.falta)} ${g.unidad}`], "tot")}</table>`).join("");
    const ins = `<table><tr><th>Insumo</th><th>Necesito</th><th>Tengo</th><th>En camino</th><th>Falta comprar</th></tr>${resultado.insumos.map((a) => fila([a.nombre, `${fmt(a.necesito)} ${a.unidad}`, a.tengo == null ? "—" : fmt(a.tengo), a.enCamino ? fmt(a.enCamino) : "—", a.falta == null ? "?" : a.falta > 0 ? fmt(a.falta) : "0"], a.estado === "comprar" ? "rojo" : "")).join("")}</table>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Explosión de materiales ${hoyISO()}</title><style>body{font-family:Arial,sans-serif;color:#1A1A2E;margin:24px}h1{margin:0 0 4px}h3{margin:18px 0 6px}h3 small{font-weight:400;color:#5A5A7A;font-size:12px;margin-left:8px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:right;background:#F1ECE5;padding:5px 8px}th:first-child,td:first-child{text-align:left}td{padding:5px 8px;border-bottom:1px solid #E8E2DB}td.n{text-align:right}tr.rojo td{color:#9A3A2D;font-weight:700}tr.tot td{background:#F7F4F0;font-weight:700}p{color:#5A5A7A;font-size:12px}</style></head><body><h1>Explosión de materiales</h1><p>Pedidos: ${esc((datos?.pedidos || []).join(", "))} · ${fmt(lineas.reduce((s, l) => s + l.unidades, 0), 0)} prendas · ${esc(hoyISO())} · Por comprar: ${aComprar.length} materiales${costoTotal ? ` (≈ ${esc(money(costoTotal))})` : ""}</p><h2>Telas</h2>${tela}<h2>Insumos</h2>${ins}</body></html>`;
    const w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
    if (w) setTimeout(() => { try { w.print(); } catch {} }, 500);
  }

  const campo = { padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: T.ink, background: T.white };
  const th = { textAlign: "left", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.slate, padding: "8px 10px", background: "#FAF8F5", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", borderBottom: "1px solid #F0ECE3", fontSize: 13 };
  const nu = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const COLS = "minmax(190px,1.6fr) 112px 112px 112px 132px minmax(210px,1.3fr)";
  const Seg = ({ valor, opciones, onChange }) => (
    <div style={{ display: "flex", background: T.white, border: `1px solid ${T.border}`, borderRadius: 10, padding: 3 }}>
      {opciones.map(([v, label]) => (
        <div key={v} onClick={() => onChange(v)} style={{ padding: "7px 16px", borderRadius: 8, fontWeight: 700, cursor: "pointer", background: valor === v ? T.ink : "transparent", color: valor === v ? T.white : T.slate, fontSize: 13 }}>{label}</div>
      ))}
    </div>
  );
  const Kpi = ({ t, v, d, rojo }) => (
    <div style={{ background: rojo ? "#FDF0EE" : T.white, border: `1px solid ${rojo ? "#F3B9B1" : T.border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: T.slate, fontWeight: 700 }}>{t}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: rojo ? "#B8402F" : T.ink, marginTop: 2 }}>{v}</div>
      <div style={{ fontSize: 12, color: T.slate }}>{d}</div>
    </div>
  );
  const Num = ({ t, v, sub, rojo }) => (
    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
      {t && <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: T.slate, fontWeight: 700 }}>{t}</div>}
      <div style={{ fontSize: t ? 16 : 14, fontWeight: t || rojo ? 800 : 500, color: rojo ? "#B8402F" : T.ink }}>{v}</div>
      {sub && <div style={{ fontSize: 11, color: T.slate }}>{sub}</div>}
    </div>
  );
  // usos agrupados por referencia (para "ver N referencias")
  const usosPorRef = (a) => {
    const m = new Map();
    a.usos.forEach((u) => { const x = m.get(u.ref) || { ref: u.ref, unidades: 0, cant: 0, consumo: u.consumo, colores: new Set(), pedidos: new Set() }; x.unidades += u.unidades; x.cant += u.cant; if (u.color) x.colores.add(u.color); x.pedidos.add(u.pedido); m.set(u.ref, x); });
    return [...m.values()].sort((x, y) => y.cant - x.cant);
  };
  const DetalleRefs = ({ a }) => (
    <div style={{ padding: "8px 18px 12px 38px", background: "#F6F2EC", borderBottom: `1px solid ${T.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>Referencia</th><th style={th}>Color / pedido</th><th style={{ ...th, textAlign: "right" }}>Prendas</th><th style={{ ...th, textAlign: "right" }}>Consumo por prenda</th><th style={{ ...th, textAlign: "right" }}>Cantidad</th></tr></thead>
        <tbody>{usosPorRef(a).map((u) => (
          <tr key={u.ref}><td style={{ ...td, fontWeight: 700 }}>{u.ref}</td><td style={td}>{[...u.colores].join(" · ") || "—"} <span style={{ color: T.slate }}>· pedido {[...u.pedidos].join(", ")}</span></td><td style={{ ...td, ...nu }}>{fmt(u.unidades, 0)}</td><td style={{ ...td, ...nu }}>{fmt(u.consumo, 4)}</td><td style={{ ...td, ...nu, fontWeight: 700 }}>{fmt(u.cant)} {a.unidad}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );

  const gruposVista = resultado ? resultado.gruposTela.map((g) => ({ ...g, coloresVista: soloFalta ? g.colores.filter((c) => c.estado === "comprar" || c.estado === "sindato") : g.colores })).filter((g) => g.coloresVista.length) : [];
  const insumosVista = resultado ? (soloFalta ? resultado.insumos.filter((a) => a.estado === "comprar" || a.estado === "sindato") : resultado.insumos) : [];
  const refsVista = resultado ? (soloFalta ? resultado.porRef.filter((r) => r.hayFalta) : resultado.porRef) : [];
  const nColores = resultado ? resultado.telas.length : 0;
  const nColoresFalta = resultado ? resultado.telas.filter((c) => c.estado === "comprar").length : 0;

  return (
    <div>
      {/* 1. Elegir pedidos */}
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        {resultado && !selAbierta ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, color: T.ink }}>{datos?.pedidos?.length || 0} pedido{(datos?.pedidos?.length || 0) === 1 ? "" : "s"}</div>
            <div style={{ color: T.slate, fontSize: 13 }}>{(datos?.pedidos || []).slice(0, 8).join(", ")}{(datos?.pedidos?.length || 0) > 8 ? "…" : ""} · {fmt(datos.lineas.reduce((s, l) => s + l.unidades, 0), 0)} prendas {opc.soloPorCortar ? (datos.conBusint ? "por cortar (según Busint)" : "por cortar (según ATLAS)") : "(pedido completo)"} · calculado {new Date(datos.generado).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
            <button onClick={() => setSelAbierta(true)} style={{ ...campo, marginLeft: "auto", cursor: "pointer", fontWeight: 700 }}>Cambiar pedidos u opciones</button>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: T.ink, fontSize: 15 }}>1. Elige los pedidos</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 N° pedido, cliente o referencia" style={{ ...campo, minWidth: 260 }} />
              <button onClick={() => setSel((s) => { const n = { ...s }; visibles.forEach(({ p }) => { n[p.id] = true; }); return n; })} style={{ ...campo, cursor: "pointer", fontWeight: 600 }}>Seleccionar los visibles</button>
              <button onClick={() => setSel({})} style={{ ...campo, cursor: "pointer", fontWeight: 600 }}>Quitar selección</button>
              {resultado && <button onClick={() => setSelAbierta(false)} style={{ ...campo, marginLeft: "auto", cursor: "pointer", fontWeight: 600 }}>Ocultar</button>}
            </div>
            <div style={{ maxHeight: 260, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}></th><th style={th}>Pedido</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: "right" }}>Pedido</th><th style={{ ...th, textAlign: "right" }}>Por cortar (ATLAS)</th><th style={th}>Despacho</th></tr></thead>
                <tbody>
                  {visibles.map(({ p, unidades, total }) => (
                    <tr key={p.id} onClick={() => setSel((s) => ({ ...s, [p.id]: !s[p.id] }))} style={{ cursor: "pointer", background: sel[p.id] ? T.denimBg : "transparent" }}>
                      <td style={td}><input type="checkbox" checked={!!sel[p.id]} readOnly /></td>
                      <td style={{ ...td, fontWeight: 700 }}>{p.numero}</td>
                      <td style={td}>{p.cliente}</td>
                      <td style={{ ...td, ...nu }}>{fmt(total, 0)}</td>
                      <td style={{ ...td, ...nu }}>{fmt(unidades, 0)}</td>
                      <td style={td}>{p.fechaDespacho || "—"}</td>
                    </tr>
                  ))}
                  {!visibles.length && <tr><td style={{ ...td, color: T.slate }} colSpan={6}>No hay pedidos activos que coincidan.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={opc.soloPorCortar} onChange={(e) => setOpc({ ...opc, soloPorCortar: e.target.checked })} /> Solo lo que falta por cortar
              </label>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>Merma telas
                <input type="number" min="0" max="50" step="0.5" value={opc.mermaTela} onChange={(e) => setOpc({ ...opc, mermaTela: e.target.value })} style={{ ...campo, width: 64 }} /> %
              </label>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>Merma insumos
                <input type="number" min="0" max="50" step="0.5" value={opc.mermaInsumo} onChange={(e) => setOpc({ ...opc, mermaInsumo: e.target.value })} style={{ ...campo, width: 64 }} /> %
              </label>
              <button disabled={!lineas.length || calculando} onClick={calcular} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: lineas.length ? T.ink : T.border, color: T.white, fontWeight: 700, cursor: lineas.length ? "pointer" : "default" }}>
                {calculando ? "Consultando Busint… (puede tardar 1–2 min)" : `🧮 Calcular materiales${elegidos.length ? ` (${elegidos.length} pedido${elegidos.length === 1 ? "" : "s"} · ${fmt(lineas.reduce((s, l) => s + l.unidades, 0), 0)} prendas)` : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ background: "#FBE9E6", color: "#9A3A2D", border: "1px solid #F3B9B1", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {avisoBus && <div style={{ background: T.amberBg, color: T.amber, border: "1px solid #F0CF95", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>{avisoBus}</div>}
      {avisoInteg && <div style={{ background: T.amberBg, color: T.amber, border: "1px solid #F0CF95", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>{avisoInteg}</div>}
      {avisoOC && <div style={{ background: T.amberBg, color: T.amber, border: "1px solid #F0CF95", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>{avisoOC}</div>}

      {datos && datos.todoCortado && (
        <div style={{ background: "#E3F5EC", border: "1px solid #B9E3CF", color: "#1E7A52", borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>✅ Según {datos.conBusint ? "Busint" : "los cortes registrados en ATLAS"} ya se cortó e integró todo lo que elegiste</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>No hay prendas por cortar ni por integrar, así que no hay materiales por pedir. Abajo ves cómo se calculó, pedido por pedido.</div>
        </div>
      )}
      {datos && datos.resumenCorte && datos.resumenCorte.length > 0 && (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
          <div onClick={() => setVerCorte((v) => !v || datos.todoCortado)} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
            <b>{verCorte || datos.todoCortado ? "▾" : "▸"} Cómo se calculó lo que falta por cortar e integrar</b>
            <span style={{ color: T.slate, fontSize: 12.5 }}>Telas: lo que falta por cortar (se usa el menor pendiente entre ATLAS y Busint). Insumos: lo que falta por integrar, porque el insumo sale de bodega al integrar el lote.</span>
          </div>
          {(verCorte || datos.todoCortado) && (
            <div style={{ overflow: "auto", borderTop: `1px solid ${T.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Pedido</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: "right" }}>Pedido</th><th style={{ ...th, textAlign: "right" }}>Por cortar según ATLAS</th><th style={{ ...th, textAlign: "right" }}>Por cortar según Busint</th><th style={{ ...th, textAlign: "right" }}>Telas sobre (por cortar)</th><th style={{ ...th, textAlign: "right" }}>Ya integradas</th><th style={{ ...th, textAlign: "right" }}>Insumos sobre (sin integrar)</th><th style={th}>Nota</th></tr></thead>
                <tbody>{datos.resumenCorte.map((r) => { const ri = (datos.resumenInteg || []).find((x) => String(x.pedido) === String(r.pedido)); return (
                  <tr key={r.pedido}><td style={{ ...td, fontWeight: 700 }}>{r.pedido}</td><td style={td}>{r.cliente}</td><td style={{ ...td, ...nu }}>{fmt(r.total, 0)}</td><td style={{ ...td, ...nu }}>{fmt(r.atlas, 0)}</td><td style={{ ...td, ...nu }}>{r.busint == null ? "—" : fmt(r.busint, 0)}</td><td style={{ ...td, ...nu, fontWeight: 800 }}>{fmt(r.usado, 0)}</td><td style={{ ...td, ...nu }}>{ri ? fmt(ri.integrado, 0) : "—"}</td><td style={{ ...td, ...nu, fontWeight: 800 }}>{ri ? fmt(ri.sinIntegrar, 0) : "—"}</td><td style={{ ...td, color: T.slate, fontSize: 12 }}>{r.notas.join(" · ")}</td></tr>
                ); })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {resultado && !datos.todoCortado && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 16 }}>
            <Kpi t="Hay que comprar" v={`${aComprar.length} material${aComprar.length === 1 ? "" : "es"}`} d={costoTotal ? `≈ ${money(costoTotal)} al costo promedio` : "con faltante"} rojo={aComprar.length > 0} />
            <Kpi t="Telas" v={`${resultado.gruposTela.length} tela${resultado.gruposTela.length === 1 ? "" : "s"} · ${nColores} color${nColores === 1 ? "" : "es"}`} d={`${nColoresFalta} color${nColoresFalta === 1 ? "" : "es"} con faltante`} />
            <Kpi t="Cubiertos con órdenes de compra" v={`${todos.filter((a) => a.estado === "cubierto_oc").length} material${todos.filter((a) => a.estado === "cubierto_oc").length === 1 ? "" : "es"}`} d="falta en bodega pero viene en camino" />
            <Kpi t="Ya hay suficiente" v={`${todos.filter((a) => a.estado === "cubierto").length} material${todos.filter((a) => a.estado === "cubierto").length === 1 ? "" : "es"}`} d={todos.some((a) => a.estado === "sindato") ? `+ ${todos.filter((a) => a.estado === "sindato").length} sin dato de bodega (revisar)` : "no hay que comprar"} />
          </div>

          {(resultado.sinFicha.length > 0 || resultado.avisosTela.length > 0) && (
            <div style={{ background: T.amberBg, border: "1px solid #F0CF95", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: T.ink }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Revisa antes de comprar</div>
              {resultado.sinFicha.length > 0 && <div>Sin ficha de materiales en Busint (no entran al cálculo): {resultado.sinFicha.map((s) => `${s.ref} (${fmt(s.unidades, 0)} u)`).join(", ")}.</div>}
              {resultado.avisosTela.slice(0, 12).map((a, i) => <div key={i}>• {a}</div>)}
              {resultado.avisosTela.length > 12 && <div>… y {resultado.avisosTela.length - 12} avisos más.</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <Seg valor={pagina} onChange={setPagina} opciones={[["informe", "Informe"], ["fichas", "Fichas leídas"], ["otros", `Otras filas (${resultado.otros.length})`]]} />
            {pagina === "informe" && <Seg valor={vista} onChange={setVista} opciones={[["material", "Por material"], ["referencia", "Por referencia"]]} />}
            {pagina === "informe" && vista === "material" && <Seg valor={tipoMat} onChange={setTipoMat} opciones={[["telas", "Telas"], ["insumos", "Insumos"]]} />}
            {pagina === "informe" && <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={soloFalta} onChange={(e) => setSoloFalta(e.target.checked)} /> Solo lo que falta</label>}
            <span style={{ flex: 1 }} />
            <button onClick={exportar} style={{ ...campo, cursor: "pointer", fontWeight: 700 }}>⬇ Excel</button>
            <button onClick={imprimir} style={{ ...campo, cursor: "pointer", fontWeight: 700 }}>🖨 Imprimir / PDF</button>
          </div>

          {/* ── POR MATERIAL · TELAS: tela → color ── */}
          {pagina === "informe" && vista === "material" && tipoMat === "telas" && (
            <div>
              {gruposVista.map((g) => (
                <div key={g.clave} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 16, marginBottom: 12, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "center", padding: "14px 18px" }}>
                    <div><div style={{ fontWeight: 800, fontSize: 16 }}>{g.nombre}</div><div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{g.colores.length} color{g.colores.length === 1 ? "" : "es"} · {g.refs} referencia{g.refs === 1 ? "" : "s"} · {g.pedidos} pedido{g.pedidos === 1 ? "" : "s"}</div></div>
                    <Num t="Necesito" v={`${fmt(g.necesito)} ${g.unidad}`} />
                    <Num t="Tengo" v={g.tengoConocido ? `${fmt(g.tengo)} ${g.unidad}` : "—"} />
                    <Num t="En camino" v={g.enCamino ? `${fmt(g.enCamino)} ${g.unidad}` : "—"} />
                    <Num t="Falta comprar" v={g.falta > 0 ? `${fmt(g.falta)} ${g.unidad}` : "0"} rojo={g.falta > 0} sub={g.costoFalta ? `≈ ${money(g.costoFalta)}` : ""} />
                    <div>{g.estado === "cubierto" || g.estado === "cubierto_oc" || g.estado === "sindato" ? <Pill e={g.estado} /> : <Barra necesito={g.necesito} bodega={g.cubreBodega} oc={g.cubreOC} falta={g.falta} T={T} />}</div>
                  </div>
                  <div style={{ borderTop: `1px solid ${T.border}`, background: "#FCFAF8" }}>
                    {g.coloresVista.map((c) => (
                      <React.Fragment key={c.clave}>
                        <div onClick={() => alternar(c.clave)} style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "center", padding: "10px 18px 10px 38px", borderBottom: "1px solid #F0ECE3", cursor: "pointer" }}>
                          <div>
                            <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", verticalAlign: -2, marginRight: 8, border: "1px solid rgba(0,0,0,.18)", background: colorAprox(nombreColorDe(c)) }} />
                            <b>{nombreColorDe(c) || "Color sin nombre"}</b> <span style={{ color: T.slate, fontSize: 12 }}>· cód. {c.color || "?"}{c.codcomp ? ` · ref. ${c.codcomp}` : ""}</span>
                          </div>
                          <Num v={`${fmt(c.necesito)} ${c.unidad}`} rojo={false} />
                          <Num v={c.tengo == null ? "—" : `${fmt(c.tengo)} ${c.unidad}`} />
                          <Num v={c.enCamino ? `${fmt(c.enCamino)} ${c.unidad}` : "—"} sub={c.vencidas ? `+${fmt(c.vencidas)} en OC vencidas` : ""} />
                          <Num v={c.falta == null ? "?" : c.falta > 0 ? `${fmt(c.falta)} ${c.unidad}` : "0"} rojo={c.falta > 0} sub={c.costoFalta ? `≈ ${money(c.costoFalta)}` : ""} />
                          <div><Pill e={c.estado} /> <span style={{ color: T.slate, fontSize: 12 }}>{abierto[c.clave] ? "▾" : "▸"} {c.estado === "cubierto" && c.tengo != null ? `sobran ${fmt(c.tengo - c.necesito)} ${c.unidad} · ` : ""}{new Set(c.usos.map((u) => u.ref)).size} ref.</span></div>
                        </div>
                        {abierto[c.clave] && <DetalleRefs a={c} />}
                      </React.Fragment>
                    ))}
                  </div>
                  {g.colores.length > 1 && g.falta > 0 && <div style={{ padding: "8px 18px", background: "#FAF8F5", borderTop: `1px solid ${T.border}`, color: T.slate, fontSize: 12 }}>El total “Falta comprar” suma solo los colores que faltan: lo que sobra en un color no cubre a otro.</div>}
                </div>
              ))}
              {!gruposVista.length && <div style={{ color: T.slate, padding: 20 }}>{soloFalta ? "Ninguna tela por comprar." : "No hay telas en este cálculo."}</div>}
            </div>
          )}

          {/* ── POR MATERIAL · INSUMOS ── */}
          {pagina === "informe" && vista === "material" && tipoMat === "insumos" && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "10px 18px", background: "#FAF8F5", borderBottom: `1px solid ${T.border}`, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.slate, fontWeight: 700 }}>
                <div>Insumo</div><div style={{ textAlign: "right" }}>Necesito</div><div style={{ textAlign: "right" }}>Tengo</div><div style={{ textAlign: "right" }}>En camino</div><div style={{ textAlign: "right" }}>Falta comprar</div><div>Estado</div>
              </div>
              {insumosVista.map((a) => (
                <React.Fragment key={a.clave}>
                  <div onClick={() => alternar("i|" + a.clave)} style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "center", padding: "11px 18px", borderBottom: "1px solid #F0ECE3", cursor: "pointer" }}>
                    <div><b>{a.nombre}</b><div style={{ fontSize: 11.5, color: T.slate }}>{a.colores} color{a.colores === 1 ? "" : "es"} en bodega (se suman)</div></div>
                    <Num v={`${fmt(a.necesito)} ${a.unidad}`} />
                    <Num v={a.tengo == null ? "—" : `${fmt(a.tengo)} ${a.unidad}`} />
                    <Num v={a.enCamino ? fmt(a.enCamino) : "—"} sub={a.vencidas ? `+${fmt(a.vencidas)} en OC vencidas` : ""} />
                    <Num v={a.falta == null ? "?" : a.falta > 0 ? `${fmt(a.falta)} ${a.unidad}` : "0"} rojo={a.falta > 0} sub={a.costoFalta ? `≈ ${money(a.costoFalta)}` : ""} />
                    <div><Pill e={a.estado} /> <span style={{ color: T.slate, fontSize: 12 }}>{abierto["i|" + a.clave] ? "▾" : "▸"} {new Set(a.usos.map((u) => u.ref)).size} ref.</span></div>
                  </div>
                  {abierto["i|" + a.clave] && <DetalleRefs a={a} />}
                </React.Fragment>
              ))}
              {!insumosVista.length && <div style={{ color: T.slate, padding: 20 }}>{soloFalta ? "Ningún insumo por comprar." : "No hay insumos con inventario en este cálculo."}</div>}
            </div>
          )}

          {/* ── POR REFERENCIA ── */}
          {pagina === "informe" && vista === "referencia" && (
            <div>
              <div style={{ color: T.slate, fontSize: 12.5, marginBottom: 10 }}>Qué necesita cada referencia y por qué. El “falta comprar” de cada referencia es una estimación: el faltante de cada material se reparte según lo que consume cada una.</div>
              {refsVista.map((r) => (
                <div key={r.ref} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 16, marginBottom: 12, overflow: "hidden" }}>
                  <div onClick={() => alternar("r|" + r.ref)} style={{ display: "grid", gridTemplateColumns: "150px minmax(160px,1.2fr) 110px minmax(180px,1.2fr) minmax(160px,1fr) 150px", gap: 12, alignItems: "center", padding: "14px 18px", cursor: "pointer" }}>
                    <div><div style={{ fontWeight: 800, fontSize: 16 }}>{abierto["r|" + r.ref] ? "▾" : "▸"} {r.ref}</div><div style={{ fontSize: 12, color: T.slate }}>Pedido{r.pedidos.length === 1 ? "" : "s"} {r.pedidos.join(", ")}</div></div>
                    <div style={{ fontSize: 12.5, color: T.slate }}>{r.colores.join(" · ") || "—"}</div>
                    <Num t="Por cortar" v={`${fmt(r.unidades, 0)} u`} />
                    <Num t="Sin integrar" v={`${fmt(r.unidadesIns, 0)} u`} />
                    <div>{r.telasTot.map((t) => <span key={t.nombre + t.unidad} style={{ display: "inline-block", background: "#F3EEF9", color: "#7B5EA7", fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 10, margin: "2px 4px 2px 0" }}>🧵 {t.nombre} {fmt(t.cant, 1)} {t.unidad}</span>)}</div>
                    <div>{r.nInsumos > 0 && <span style={{ display: "inline-block", background: T.denimBg, color: T.denim, fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 10 }}>🔩 {r.nInsumos} insumo{r.nInsumos === 1 ? "" : "s"}</span>}</div>
                    <Num t="Falta comprar" v={r.costoFalta > 0 ? `≈ ${money(r.costoFalta)}` : r.hayFalta ? "sin costo" : "0"} rojo={r.hayFalta} />
                  </div>
                  {abierto["r|" + r.ref] && (
                    <div style={{ borderTop: `1px solid ${T.border}`, background: "#FCFAF8", padding: "6px 18px 12px 38px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr><th style={th}>Material</th><th style={th}>Color / ubicación</th><th style={{ ...th, textAlign: "right" }}>Prendas</th><th style={{ ...th, textAlign: "right" }}>Consumo por prenda</th><th style={{ ...th, textAlign: "right" }}>Cantidad</th><th style={{ ...th, textAlign: "right" }}>De esto falta comprar</th></tr></thead>
                        <tbody>{r.items.map((i, k) => (
                          <tr key={k}>
                            <td style={td}>{i.tipo === "tela" ? "🧵" : "🔩"} <b>{i.nombre}</b></td>
                            <td style={td}>{i.tipo === "tela" ? `${i.colorNombre || "—"} · cód. ${i.colorCod || "?"}` : (i.ubicacion || "—")}</td>
                            <td style={{ ...td, ...nu }}>{fmt(i.unidades, 0)}</td>
                            <td style={{ ...td, ...nu }}>{fmt(i.consumo, 4)}</td>
                            <td style={{ ...td, ...nu, fontWeight: 700 }}>{fmt(i.cant)} {i.unidad}</td>
                            <td style={{ ...td, ...nu, color: i.faltaParte > 0.005 ? "#9A3A2D" : T.slate, fontWeight: i.faltaParte > 0.005 ? 800 : 400 }}>{i.faltaParte > 0.005 ? `${fmt(i.faltaParte)} ${i.unidad}${i.costoParte ? ` · ≈ ${money(i.costoParte)}` : ""}` : i.estado === "sindato" ? "sin dato" : "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
              {!refsVista.length && <div style={{ color: T.slate, padding: 20 }}>{soloFalta ? "Ninguna referencia con faltante." : "No hay referencias con ficha en este cálculo."}</div>}
              {refsVista.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "150px minmax(160px,1.2fr) 110px minmax(180px,1.2fr) minmax(160px,1fr) 150px", gap: 12, alignItems: "center", padding: "14px 18px", background: "#F1EDE6", border: `1px solid ${T.border}`, borderRadius: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>TOTAL</div>
                  <div style={{ fontSize: 12.5, color: T.slate }}>{refsVista.length} referencia{refsVista.length === 1 ? "" : "s"}</div>
                  <Num t="Por cortar" v={`${fmt(refsVista.reduce((s, r) => s + r.unidades, 0), 0)} u`} />
                  <div>{[...refsVista.flatMap((r) => r.telasTot).reduce((m, t) => { const k = t.nombre + "|" + t.unidad; const x = m.get(k) || { ...t, cant: 0 }; x.cant += t.cant; m.set(k, x); return m; }, new Map()).values()].map((t) => <span key={t.nombre + t.unidad} style={{ display: "inline-block", background: "#F3EEF9", color: "#7B5EA7", fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 10, margin: "2px 4px 2px 0" }}>🧵 {t.nombre} {fmt(t.cant, 1)} {t.unidad}</span>)}</div>
                  <div><span style={{ display: "inline-block", background: T.denimBg, color: T.denim, fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 10 }}>🔩 {resultado.insumos.length} insumos</span></div>
                  <Num t="Falta comprar" v={`≈ ${money(refsVista.reduce((s, r) => s + r.costoFalta, 0))}`} rojo />
                </div>
              )}
            </div>
          )}

          {/* ── FICHAS LEÍDAS ── */}
          {pagina === "fichas" && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, fontSize: 13 }}>
              <div style={{ color: T.slate, marginBottom: 10 }}>Esto es lo que ATLAS leyó de la ficha de cada referencia en Busint, por prenda. Compáralo con tu ficha técnica para confirmar que el consumo está bien.</div>
              {[...datos.fichas.values()].map((f) => (
                <div key={`${f.ref}|${f.pinta}`} style={{ borderTop: `1px solid ${T.border}`, padding: "8px 0" }}>
                  <div style={{ fontWeight: 800 }}>{f.ref} <span style={{ fontWeight: 500, color: T.slate }}>· pinta {f.pinta || "—"}</span></div>
                  {f.telas.map((t) => <div key={t.slot}>🧵 {t.nombre} · color {t.color || "?"} · {fmt(t.consumo, 4)} {t.unidad || "m"} por prenda{t.usaSesgo ? " (con sesgo)" : ""}</div>)}
                  {!f.telas.length && <div style={{ color: T.slate }}>Sin tela registrada.</div>}
                  {f.insumos.filter((i) => i.material).map((i, k) => <div key={k}>🔩 {i.insumo} · {fmt(i.cant, 4)} por prenda{i.ubicacion ? ` · ${i.ubicacion}` : ""}</div>)}
                  {!f.insumos.some((i) => i.material) && <div style={{ color: T.slate }}>Sin insumos con inventario en Busint.</div>}
                </div>
              ))}
            </div>
          )}

          {/* ── OTRAS FILAS ── */}
          {pagina === "otros" && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "auto" }}>
              <div style={{ padding: 12, fontSize: 13, color: T.slate }}>Filas de la ficha que no coinciden con ningún insumo del inventario (procesos, mano de obra, servicios u otros nombres). No entran al cálculo. Si aquí aparece un material real, dímelo para ajustarlo.</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Fila de la ficha</th><th style={{ ...th, textAlign: "right" }}>Valor "Cant"</th><th style={th}>Referencias</th></tr></thead>
                <tbody>{resultado.otros.map((o) => <tr key={o.nombre}><td style={td}>{o.nombre}</td><td style={{ ...td, ...nu }}>{fmt(o.cant, 4)}</td><td style={td}>{o.refs.slice(0, 6).join(", ")}{o.refs.length > 6 ? ` +${o.refs.length - 6}` : ""}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
