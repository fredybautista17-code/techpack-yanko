// ─── VIGENTES POR ETAPA ───────────────────────────────────────────────────────
// (2026-11-06, a pedido de Fredy) Pestaña de Pedidos: filtra los pedidos
// vigentes (los que todavía tienen saldo por despachar) y dice en qué etapa
// está ese saldo —Sin cortar, En corte, En planta, Semiterminado o BPT—, por
// pedido, por línea y por tipo (Niña, Dama, Caballero, Niño), con descarga a
// Excel. Los números salen de la misma función del servidor que "Disponible
// para despachar" (getDisponibleParaDespachar); el tipo sale de la línea de
// cada referencia en Busint (bitácora busint_referencias) y del mapa
// Administración → Línea (config.lineaGrupoMap). Lo que no se pueda clasificar
// queda como "Sin tipo" para que se vea y se complete, nunca se pierde.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { totalesDe, filasPreordenesDe, normTxt } from "./disponible-despachar";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => "$" + fmt(n);
const SIN_TIPO = "Sin tipo";
const refClave = (v) => String(v || "").trim().toUpperCase().replace(/-/g, "");

const ETAPAS = [
  { k: "etSinCortar", n: "Sin cortar", fg: "#A8660B", bg: "#FDF1DA", xl: "FFFDF1DA", xlFg: "FFA8660B" },
  { k: "etCorte", n: "En corte", fg: "#9A3A2D", bg: "#FBE9E6", xl: "FFFBE9E6", xlFg: "FF9A3A2D" },
  { k: "etPlanta", n: "En planta", fg: "#3D5C85", bg: "#E6EEF7", xl: "FFE6EEF7", xlFg: "FF3D5C85" },
  { k: "etSemi", n: "Semiterminado", fg: "#7B5EA7", bg: "#F3EEF9", xl: "FFF3EEF9", xlFg: "FF7B5EA7" },
  { k: "etBpt", n: "En BPT", fg: "#1E7A52", bg: "#E3F5EC", xl: "FFE3F5EC", xlFg: "FF1E7A52" },
];
const DESPACHADO = { n: "Despachado", fg: "#5A5A7A", bg: "#EEEEF3", xl: "FFEEEEF3", xlFg: "FF5A5A7A" };
const SIN_UBICAR = { n: "Sin ubicar", fg: "#3F5565", bg: "#E8EEF2", xl: "FFE8EEF2", xlFg: "FF3F5565" };

// Etapa donde está la mayor parte del saldo por despachar de una fila (o de un grupo de filas)
function etapaDe(t) {
  if ((Number(t.faltaDespachar) || 0) <= 0) return { ...DESPACHADO, detalle: "" };
  const conValor = ETAPAS.filter((e) => (Number(t[e.k]) || 0) > 0);
  if (!conValor.length) return { ...SIN_UBICAR, detalle: "" };
  const principal = conValor.reduce((m, e) => ((Number(t[e.k]) || 0) > (Number(t[m.k]) || 0) ? e : m), conValor[0]);
  const detalle = conValor.length > 1 ? conValor.map((e) => `${e.n} ${fmt(t[e.k])}`).join(" · ") : "";
  return { ...principal, detalle };
}

// Suma de filas agrupadas por una clave
function agrupar(filas, claveFn, baseFn) {
  const mapa = new Map();
  filas.forEach((f) => {
    const k = claveFn(f);
    if (!mapa.has(k)) mapa.set(k, { ...baseFn(f), _filas: [] });
    mapa.get(k)._filas.push(f);
  });
  return [...mapa.values()].map((g) => ({
    ...g,
    ...totalesDe(g._filas),
    nRefs: new Set(g._filas.map((f) => f.ref)).size,
    nPedidos: new Set(g._filas.map((f) => f.numPed)).size,
    lineas: [...new Set(g._filas.map((f) => f.linea).filter(Boolean))].sort().join(", "),
  }));
}
const porPedidoTipo = (filas) =>
  agrupar(filas, (f) => `${f.numPed}||${f.tipo}`, (f) => ({ numPed: f.numPed, cliente: f.cliente, tipo: f.tipo, esPreorden: !!f.esPreorden }));
const porTipo = (filas) => agrupar(filas, (f) => f.tipo, (f) => ({ tipo: f.tipo }));
const ordenPedido = (a, b) => String(b.numPed).localeCompare(String(a.numPed), "es", { numeric: true });
const ordenTipo = (a, b) => (a.tipo === SIN_TIPO) - (b.tipo === SIN_TIPO) || String(a.tipo).localeCompare(String(b.tipo), "es");

// ── Excel ─────────────────────────────────────────────────────────────────────
const AZUL_OSCURO = "FF1A1A2E";
const BLANCO = "FFFFFFFF";
const CEBRA = "FFF7F4F0";
const BORDE = { style: "thin", color: { argb: "FFE8E2DB" } };
const BORDES = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };

function nombreHoja(base, usados) {
  const limpio = String(base || "Hoja").replace(/[:\\/?*[\]]/g, "-").trim().slice(0, 28) || "Hoja";
  let cand = limpio;
  let k = 2;
  while (usados.has(cand.toLowerCase())) { cand = `${limpio.slice(0, 25)} ${k}`; k += 1; }
  usados.add(cand.toLowerCase());
  return cand;
}

// columnas: [{h, w, al, num?, money?, v:(fila)=>valor, total?:clave}]
function hojaExcel(wb, usados, nombre, titulo, generadoEn, columnas, filas) {
  const ws = wb.addWorksheet(nombreHoja(nombre, usados), { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const n = columnas.length;
  ws.columns = columnas.map((c) => ({ width: c.w }));
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, size: 15, color: { argb: AZUL_OSCURO } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, n);
  const sub = ws.getCell(2, 1);
  sub.value = `Industrias Yanko · Generado el ${generadoEn}`;
  sub.font = { italic: true, size: 10, color: { argb: "FF5A5A7A" } };
  const head = ws.getRow(4);
  columnas.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, color: { argb: BLANCO }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSCURO } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDES;
  });
  head.height = 24;
  filas.forEach((f, idx) => {
    const row = ws.getRow(5 + idx);
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = c.v(f);
      cell.value = c.num || c.money ? Number(v) || 0 : v ?? "";
      cell.alignment = { horizontal: c.al || "left", vertical: "middle" };
      cell.border = BORDES;
      cell.font = { size: 10.5 };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CEBRA } };
      if (c.num) cell.numFmt = "#,##0";
      if (c.money) cell.numFmt = '"$"#,##0';
      if (c.etapaCol) {
        const e = c.etapaCol(f);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: e.xl } };
        cell.font = { bold: true, size: 10, color: { argb: e.xlFg } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
    });
    row.height = 19;
  });
  const fin = 5 + filas.length;
  const tot = ws.getRow(fin);
  tot.getCell(1).value = "TOTAL";
  const totales = totalesDe(filas.flatMap((f) => (f._filas ? f._filas : [f])));
  columnas.forEach((c, i) => {
    if (c.total) {
      tot.getCell(i + 1).value = totales[c.total];
      tot.getCell(i + 1).numFmt = c.money ? '"$"#,##0' : "#,##0";
    }
  });
  for (let c = 1; c <= n; c++) {
    const cell = tot.getCell(c);
    cell.font = { bold: true, size: 11, color: { argb: BLANCO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSCURO } };
    cell.border = BORDES;
    cell.alignment = { horizontal: c === 1 ? "left" : "right", vertical: "middle" };
  }
  tot.height = 24;
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(filas.length, 1), column: n } };
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}

const colsEtapas = () => [
  ...ETAPAS.map((e) => ({ h: e.n, w: 12, al: "right", num: true, v: (f) => f[e.k], total: e.k })),
];
const colEtapa = () => ({
  h: "Etapa principal", w: 26, al: "center",
  v: (f) => { const e = etapaDe(f); return e.detalle ? `${e.n} (${e.detalle})` : e.n; },
  etapaCol: (f) => etapaDe(f),
});

async function descargarExcel(filas, nombreArchivo, filtrosTxt) {
  const m = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = m.default || m;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Industrias Yanko";
  const generadoEn = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  const usados = new Set();
  const tit = (base) => `${base}${filtrosTxt ? " — " + filtrosTxt : ""}`;
  // 1) Resumen por tipo
  hojaExcel(wb, usados, "Por tipo", tit("PEDIDOS VIGENTES POR ETAPA — POR TIPO"), generadoEn, [
    { h: "Tipo", w: 18, v: (g) => g.tipo },
    { h: "Pedidos", w: 10, al: "right", num: true, v: (g) => g.nPedidos },
    { h: "Referencias", w: 12, al: "right", num: true, v: (g) => g.nRefs },
    { h: "Líneas", w: 30, v: (g) => g.lineas },
    { h: "Pedido (und)", w: 13, al: "right", num: true, v: (g) => g.pedido, total: "pedido" },
    { h: "Despachado", w: 13, al: "right", num: true, v: (g) => g.despachado, total: "despachado" },
    { h: "Falta despachar", w: 15, al: "right", num: true, v: (g) => g.faltaDespachar, total: "faltaDespachar" },
    { h: "Valor falta despachar", w: 19, al: "right", money: true, v: (g) => g.valorFaltaDespachar, total: "valorFaltaDespachar" },
    ...colsEtapas(),
    colEtapa(),
  ], porTipo(filas).sort(ordenTipo));
  // 2) Pedido × Tipo
  hojaExcel(wb, usados, "Pedido y tipo", tit("PEDIDOS VIGENTES POR ETAPA — POR PEDIDO Y TIPO"), generadoEn, [
    { h: "Pedido N°", w: 20, al: "center", v: (g) => g.numPed },
    { h: "Cliente", w: 28, v: (g) => g.cliente },
    { h: "Tipo", w: 14, v: (g) => g.tipo },
    { h: "Líneas", w: 28, v: (g) => g.lineas },
    { h: "Referencias", w: 12, al: "right", num: true, v: (g) => g.nRefs },
    { h: "Pedido (und)", w: 13, al: "right", num: true, v: (g) => g.pedido, total: "pedido" },
    { h: "Despachado", w: 13, al: "right", num: true, v: (g) => g.despachado, total: "despachado" },
    { h: "Falta despachar", w: 15, al: "right", num: true, v: (g) => g.faltaDespachar, total: "faltaDespachar" },
    { h: "Valor falta despachar", w: 19, al: "right", money: true, v: (g) => g.valorFaltaDespachar, total: "valorFaltaDespachar" },
    ...colsEtapas(),
    colEtapa(),
  ], porPedidoTipo(filas).sort((a, b) => ordenPedido(a, b) || ordenTipo(a, b)));
  // 3) Detalle por referencia
  hojaExcel(wb, usados, "Detalle", tit("PEDIDOS VIGENTES POR ETAPA — DETALLE POR REFERENCIA"), generadoEn, [
    { h: "Pedido N°", w: 20, al: "center", v: (f) => f.numPed },
    { h: "Cliente", w: 28, v: (f) => f.cliente },
    { h: "Referencia", w: 14, v: (f) => f.ref },
    { h: "Descripción", w: 38, v: (f) => f.descripcion },
    { h: "Línea", w: 16, v: (f) => f.linea },
    { h: "Tipo", w: 14, v: (f) => f.tipo },
    { h: "Categoría", w: 16, v: (f) => f.categoria },
    { h: "Pedido (und)", w: 13, al: "right", num: true, v: (f) => f.pedido, total: "pedido" },
    { h: "Despachado", w: 13, al: "right", num: true, v: (f) => f.despachado, total: "despachado" },
    { h: "Falta despachar", w: 15, al: "right", num: true, v: (f) => f.faltaDespachar, total: "faltaDespachar" },
    { h: "Valor falta despachar", w: 19, al: "right", money: true, v: (f) => f.valorFaltaDespachar, total: "valorFaltaDespachar" },
    ...colsEtapas(),
    colEtapa(),
  ], [...filas].sort((a, b) => ordenPedido(a, b) || String(a.ref).localeCompare(String(b.ref), "es")));
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function VigentesPorEtapaView({ db, functionsClient, T }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [preordenes, setPreordenes] = useState([]);
  const [maestro, setMaestro] = useState(new Map()); // refClave -> { linea, categoria }
  const [lineaGrupoMap, setLineaGrupoMap] = useState({});
  const [gruposConfig, setGruposConfig] = useState([]);
  const [bajando, setBajando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState("");
  const [linea, setLinea] = useState("");
  const [categoria, setCategoria] = useState("");
  const [etapa, setEtapa] = useState("");
  const [incluirPre, setIncluirPre] = useState(true);
  const [verDespachados, setVerDespachados] = useState(false);
  const [vista, setVista] = useState("pedido_tipo");

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "bitacora_preordenes"), (snap) => setPreordenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, "busint_referencias"), (snap) => {
      const m = new Map();
      snap.docs.forEach((d) => {
        const r = d.data();
        const k = refClave(r.ref);
        if (k && !m.has(k)) m.set(k, { linea: String(r.linea || "").trim(), categoria: String(r.categoria || "").trim() });
      });
      setMaestro(m);
    }, () => {});
    const u3 = onSnapshot(doc(db, "config", "main"), (snap) => {
      const c = snap.exists() ? snap.data() : {};
      setLineaGrupoMap(c.lineaGrupoMap || {});
      setGruposConfig(Array.isArray(c.gruposLinea) ? c.gruposLinea : []);
    }, () => {});
    return () => { u1(); u2(); u3(); };
  }, [db]);

  const consultar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const resp = await httpsCallable(functionsClient, "getDisponibleParaDespachar", { timeout: 540000 })({});
      setDatos(resp.data);
    } catch (err) {
      setError(err?.message || "No se pudo consultar. Verifica que la función getDisponibleParaDespachar esté publicada.");
    }
    setCargando(false);
  }, [functionsClient]);
  useEffect(() => { consultar(); }, [consultar]);

  // Todas las filas (pedidos reales + preórdenes), ya con cliente, línea, tipo y categoría
  const base = useMemo(() => {
    const out = [];
    (datos?.porCliente || []).forEach((g) => {
      (g.filas || []).forEach((f) => out.push({ ...f, cliente: g.cliente }));
      if (incluirPre) filasPreordenesDe(g.cliente, preordenes, g.filas, false).forEach((f) => out.push({ ...f, cliente: g.cliente }));
    });
    return out.map((f) => {
      const m = maestro.get(refClave(f.ref)) || {};
      const lin = m.linea || "";
      const tipoPre = f.esPreorden ? String(f.tipoPre || "").trim() : "";
      const t = tipoPre || (lin && lineaGrupoMap[lin]) || SIN_TIPO;
      return { ...f, linea: lin, tipo: t, categoria: m.categoria || "" };
    });
  }, [datos, preordenes, incluirPre, maestro, lineaGrupoMap]);

  const opciones = useMemo(() => {
    const uniq = (fn) => [...new Set(base.map(fn).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es"));
    const tipos = new Set([...gruposConfig, ...base.map((f) => f.tipo)]);
    return {
      clientes: uniq((f) => f.cliente),
      tipos: [...tipos].filter(Boolean).sort((a, b) => (a === SIN_TIPO) - (b === SIN_TIPO) || String(a).localeCompare(String(b), "es")),
      lineas: uniq((f) => f.linea),
      categorias: uniq((f) => f.categoria),
    };
  }, [base, gruposConfig]);

  const filas = useMemo(() => {
    const q = normTxt(busqueda);
    return base.filter((f) => {
      if (!verDespachados && !(Number(f.faltaDespachar) > 0)) return false;
      if (cliente && f.cliente !== cliente) return false;
      if (tipo && f.tipo !== tipo) return false;
      if (linea && f.linea !== linea) return false;
      if (categoria && f.categoria !== categoria) return false;
      if (etapa && !(Number(f[etapa]) > 0)) return false;
      if (q && !normTxt(`${f.numPed} ${f.ref} ${f.cliente} ${f.descripcion}`).includes(q)) return false;
      return true;
    });
  }, [base, busqueda, cliente, tipo, linea, categoria, etapa, verDespachados]);

  const tot = useMemo(() => totalesDe(filas), [filas]);
  const nPedidos = useMemo(() => new Set(filas.map((f) => f.numPed)).size, [filas]);
  const sinTipoRefs = useMemo(() => new Set(base.filter((f) => f.tipo === SIN_TIPO && Number(f.faltaDespachar) > 0).map((f) => f.ref)), [base]);
  const gPedidoTipo = useMemo(() => porPedidoTipo(filas).sort((a, b) => ordenPedido(a, b) || ordenTipo(a, b)), [filas]);
  const gTipo = useMemo(() => porTipo(filas).sort(ordenTipo), [filas]);
  const filasOrdenadas = useMemo(() => [...filas].sort((a, b) => ordenPedido(a, b) || String(a.ref).localeCompare(String(b.ref), "es")), [filas]);

  const filtrosTxt = [cliente, tipo && `Tipo ${tipo}`, linea && `Línea ${linea}`, categoria, etapa && ETAPAS.find((e) => e.k === etapa)?.n, busqueda && `"${busqueda}"`].filter(Boolean).join(" · ");
  async function bajar() {
    setBajando(true);
    try {
      await descargarExcel(filas, `Vigentes_por_etapa_${new Date().toISOString().slice(0, 10)}.xlsx`, filtrosTxt);
    } catch (e) { setError("No se pudo generar el Excel: " + (e?.message || e)); }
    setBajando(false);
  }

  const sel = { padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 12, fontWeight: 600, background: T.white, maxWidth: 200 };
  const kpi = (titulo, valor, color, sub) => (
    <div style={{ flex: "1 1 130px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", minWidth: 120 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || T.ink, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const th = (txt, al) => <th key={txt} style={{ padding: "10px 12px", color: T.seam, textAlign: al || "right", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{txt}</th>;
  const tdN = { padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const celdasEtapas = (g) => ETAPAS.map((e) => (
    <td key={e.k} style={{ ...tdN, color: g[e.k] ? T.ink : T.border, background: g[e.k] ? e.bg : "transparent", fontWeight: g[e.k] ? 700 : 400 }}>{g[e.k] ? fmt(g[e.k]) : "·"}</td>
  ));
  const celdaEtapa = (g) => {
    const e = etapaDe(g);
    return (
      <td style={{ padding: "9px 12px", textAlign: "center" }}>
        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: e.bg, color: e.fg, whiteSpace: "nowrap" }}>{e.n}</span>
        {e.detalle && <div style={{ fontSize: 10, color: T.slate, marginTop: 3, whiteSpace: "nowrap" }}>{e.detalle}</div>}
      </td>
    );
  };
  const chipTipo = (t) => (
    <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: t === SIN_TIPO ? T.coralBg : T.denimBg || T.canvas, color: t === SIN_TIPO ? T.coral : T.denim, whiteSpace: "nowrap" }}>{t}</span>
  );
  const trFondo = (i) => ({ background: i % 2 ? "#FAF8F5" : T.white, borderTop: `1px solid ${T.border}` });
  const pie = (cols, t) => (
    <tfoot>
      <tr style={{ background: T.ink, color: "#fff", fontWeight: 800 }}>
        <td colSpan={cols} style={{ padding: "10px 12px" }}>TOTAL</td>
        <td style={{ ...tdN }}>{fmt(t.pedido)}</td>
        <td style={{ ...tdN }}>{fmt(t.despachado)}</td>
        <td style={{ ...tdN }}>{fmt(t.faltaDespachar)}</td>
        <td style={{ ...tdN }}>{money(t.valorFaltaDespachar)}</td>
        {ETAPAS.map((e) => <td key={e.k} style={{ ...tdN }}>{fmt(t[e.k])}</td>)}
        <td />
      </tr>
    </tfoot>
  );
  const cabNum = [th("Pedido (und)"), th("Despachado"), th("Falta despachar"), th("Valor falta"), ...ETAPAS.map((e) => th(e.n)), th("Etapa principal", "center")];
  const celdasNum = (g) => (
    <>
      <td style={tdN}>{fmt(g.pedido)}</td>
      <td style={{ ...tdN, color: T.slate }}>{fmt(g.despachado)}</td>
      <td style={{ ...tdN, fontWeight: 800 }}>{fmt(g.faltaDespachar)}</td>
      <td style={{ ...tdN, fontWeight: 700 }}>{money(g.valorFaltaDespachar)}</td>
      {celdasEtapas(g)}
      {celdaEtapa(g)}
    </>
  );

  const vistaBtn = (v, txt) => (
    <button key={v} onClick={() => setVista(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${vista === v ? T.ink : T.border}`, background: vista === v ? T.ink : T.white, color: vista === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{txt}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Pedido, referencia o cliente..." style={{ ...sel, minWidth: 220, maxWidth: 260, fontWeight: 500 }} />
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} style={sel}>
          <option value="">Todos los clientes</option>
          {opciones.clientes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={sel}>
          <option value="">Todos los tipos</option>
          {opciones.tipos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={linea} onChange={(e) => setLinea(e.target.value)} style={sel}>
          <option value="">Todas las líneas</option>
          {opciones.lineas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={sel}>
          <option value="">Toda prenda</option>
          {opciones.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={etapa} onChange={(e) => setEtapa(e.target.value)} style={sel}>
          <option value="">Todas las etapas</option>
          {ETAPAS.map((e) => <option key={e.k} value={e.k}>Con saldo en: {e.n}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {vistaBtn("pedido_tipo", "Por pedido y tipo")}
        {vistaBtn("tipo", "Por tipo")}
        {vistaBtn("detalle", "Detalle por referencia")}
        <label style={{ fontSize: 12, color: T.slate, display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginLeft: 8 }}>
          <input type="checkbox" checked={incluirPre} onChange={(e) => setIncluirPre(e.target.checked)} /> Incluir preórdenes
        </label>
        <label style={{ fontSize: 12, color: T.slate, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={verDespachados} onChange={(e) => setVerDespachados(e.target.checked)} /> Mostrar ya despachados
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={consultar} disabled={cargando} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{cargando ? "Consultando..." : "🔄 Actualizar"}</button>
        <button onClick={bajar} disabled={bajando || !filas.length} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.jade, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: bajando || !filas.length ? 0.5 : 1 }}>{bajando ? "Generando..." : "⬇️ Descargar Excel"}</button>
      </div>

      {error && <div style={{ padding: "10px 14px", background: T.coralBg, color: T.coral, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
      {datos?.avisos?.length > 0 && (
        <div style={{ padding: "10px 14px", background: T.amberBg, color: T.amber, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
          {datos.avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}
        </div>
      )}
      {sinTipoRefs.size > 0 && (
        <div style={{ padding: "10px 14px", background: T.amberBg, color: T.amber, borderRadius: 8, fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          {sinTipoRefs.size} referencia{sinTipoRefs.size !== 1 ? "s" : ""} con saldo no tiene{sinTipoRefs.size !== 1 ? "n" : ""} tipo (salen como «{SIN_TIPO}»). Es porque la línea de Busint no está asignada a un grupo en Administración → Línea, o la referencia aún no está en la bitácora de Busint.
        </div>
      )}
      {cargando && !datos && <div style={{ padding: 30, textAlign: "center", color: T.slate, fontSize: 13 }}>Cruzando pedidos, facturación y producción... puede tardar un minuto.</div>}

      {datos && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {kpi("Pedidos vigentes", fmt(nPedidos), T.ink)}
            {kpi("Falta despachar", fmt(tot.faltaDespachar), T.ink, money(tot.valorFaltaDespachar) + " antes de IVA")}
            {ETAPAS.map((e) => kpi(e.n, fmt(tot[e.k]), e.fg))}
          </div>

          <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "auto" }}>
            {vista === "tipo" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1100 }}>
                <thead><tr style={{ background: T.ink }}>{th("Tipo", "left")}{th("Pedidos")}{th("Referencias")}{th("Líneas", "left")}{cabNum}</tr></thead>
                <tbody>
                  {gTipo.map((g, i) => (
                    <tr key={g.tipo} style={trFondo(i)}>
                      <td style={{ padding: "9px 12px" }}>{chipTipo(g.tipo)}</td>
                      <td style={tdN}>{fmt(g.nPedidos)}</td>
                      <td style={tdN}>{fmt(g.nRefs)}</td>
                      <td style={{ padding: "9px 12px", color: T.slate, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.lineas}>{g.lineas || "—"}</td>
                      {celdasNum(g)}
                    </tr>
                  ))}
                  {!gTipo.length && <tr><td colSpan={13} style={{ padding: 24, textAlign: "center", color: T.slate }}>Nada para mostrar con estos filtros.</td></tr>}
                </tbody>
                {gTipo.length > 0 && pie(4, tot)}
              </table>
            )}
            {vista === "pedido_tipo" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1300 }}>
                <thead><tr style={{ background: T.ink }}>{th("Pedido", "center")}{th("Cliente", "left")}{th("Tipo", "left")}{th("Líneas", "left")}{th("Refs.")}{cabNum}</tr></thead>
                <tbody>
                  {gPedidoTipo.map((g, i) => (
                    <tr key={`${g.numPed}|${g.tipo}`} style={trFondo(i)}>
                      <td style={{ padding: "9px 12px", textAlign: "center", color: T.slate, fontVariantNumeric: "tabular-nums" }}>
                        {g.esPreorden ? <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: T.violetBg, color: T.violet, whiteSpace: "nowrap" }}>📝 {g.numPed}</span> : g.numPed}
                      </td>
                      <td style={{ padding: "9px 12px", fontWeight: 600 }}>{g.cliente}</td>
                      <td style={{ padding: "9px 12px" }}>{chipTipo(g.tipo)}</td>
                      <td style={{ padding: "9px 12px", color: T.slate, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.lineas}>{g.lineas || "—"}</td>
                      <td style={tdN}>{fmt(g.nRefs)}</td>
                      {celdasNum(g)}
                    </tr>
                  ))}
                  {!gPedidoTipo.length && <tr><td colSpan={14} style={{ padding: 24, textAlign: "center", color: T.slate }}>Nada para mostrar con estos filtros.</td></tr>}
                </tbody>
                {gPedidoTipo.length > 0 && pie(5, tot)}
              </table>
            )}
            {vista === "detalle" && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1500 }}>
                <thead><tr style={{ background: T.ink }}>{th("Pedido", "center")}{th("Cliente", "left")}{th("Referencia", "left")}{th("Descripción", "left")}{th("Línea", "left")}{th("Tipo", "left")}{th("Prenda", "left")}{cabNum}</tr></thead>
                <tbody>
                  {filasOrdenadas.map((f, i) => (
                    <tr key={f._k || `${f.numPed}|${f.ref}|${f.cliente}`} style={{ ...trFondo(i), background: f.esPreorden ? "#FAF7FD" : trFondo(i).background }}>
                      <td style={{ padding: "9px 12px", textAlign: "center", color: T.slate, fontVariantNumeric: "tabular-nums" }}>
                        {f.esPreorden ? <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: T.violetBg, color: T.violet, whiteSpace: "nowrap" }}>📝 {f.numPed}</span> : f.numPed}
                      </td>
                      <td style={{ padding: "9px 12px", fontWeight: 600 }}>{f.cliente}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700 }}>{f.ref}</td>
                      <td style={{ padding: "9px 12px", color: T.slate, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.descripcion}>{f.descripcion || "—"}</td>
                      <td style={{ padding: "9px 12px", color: T.slate }}>{f.linea || "—"}</td>
                      <td style={{ padding: "9px 12px" }}>{chipTipo(f.tipo)}</td>
                      <td style={{ padding: "9px 12px", color: T.slate }}>{f.categoria || "—"}</td>
                      {celdasNum(f)}
                    </tr>
                  ))}
                  {!filasOrdenadas.length && <tr><td colSpan={15} style={{ padding: 24, textAlign: "center", color: T.slate }}>Nada para mostrar con estos filtros.</td></tr>}
                </tbody>
                {filasOrdenadas.length > 0 && pie(7, tot)}
              </table>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.slate, marginTop: 10, lineHeight: 1.5 }}>
            Un pedido es vigente mientras le quede saldo por despachar (pedido − despachado). Las columnas Sin cortar / En corte / En planta / Semiterminado / En BPT dicen dónde está hoy ese saldo según el Panel de Flujo de Busint; «Etapa principal» es donde está la mayor parte, y debajo se detalla si el saldo está repartido en varias etapas.
            El tipo (Niña, Dama, Caballero, Niño) sale de la línea de la referencia en Busint y del mapa de Administración → Línea; en las preórdenes sale del tipo que se eligió al montarlas.
            {datos?.generadoEn && <> · Consultado: {new Date(datos.generadoEn).toLocaleString("es-CO")}</>}
          </div>
        </>
      )}
    </div>
  );
}
