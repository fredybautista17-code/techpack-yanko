// ─── DISPONIBLE PARA DESPACHAR ────────────────────────────────────────────────
// (2026-10-10, a pedido de Fredy) Pestaña de Pedidos: por cliente y por
// referencia, cuánto se pidió, cuánto se produjo, cuánto ya se despachó, cuánto
// falta producir y cuánto está listo para despachar, con su valor. Los datos
// los arma la función del servidor "getDisponibleParaDespachar" (cruza el
// pedido de Busint, la facturación y las Entradas de Planta). Desde acá se
// descarga el Excel (un cliente, o todos) ya con colores, listo para enviar.
import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => "$" + fmt(n);

const ESTADOS = {
  listo: { txt: "Listo para despachar", fg: "#1E7A52", bg: "#E3F5EC", xl: "FFE3F5EC", xlFg: "FF1E7A52" },
  parcial: { txt: "Parcial", fg: "#A8660B", bg: "#FDF1DA", xl: "FFFDF1DA", xlFg: "FFA8660B" },
  sin_producir: { txt: "Sin producir", fg: "#9A3A2D", bg: "#FBE9E6", xl: "FFFBE9E6", xlFg: "FF9A3A2D" },
  despachado: { txt: "Todo despachado", fg: "#3D5C85", bg: "#E6EEF7", xl: "FFE6EEF7", xlFg: "FF3D5C85" },
  lote_sin_linea: { txt: "Producción sin línea de pedido", fg: "#3F5565", bg: "#E8EEF2", xl: "FFE8EEF2", xlFg: "FF3F5565" },
  preorden: { txt: "Preorden", fg: "#7B5EA7", bg: "#F3EEF9", xl: "FFF3EEF9", xlFg: "FF7B5EA7" },
};
const VIOLETA_FILA = "FFFAF7FD";

// Precio escrito a mano en la preorden ("28.500", "$28,500", "28500",
// "18.823,529", "18823.529"). (2026-10-15, a pedido de Fredy) El punto solo
// cuenta como separador de miles si los miles vienen bien agrupados
// (1-3 dígitos y luego grupos de 3); antes cualquier ".ddd" se tomaba como
// miles y "18823.529" (decimal con punto) se leía como 18.823.529.
function numeroPrecio(v) {
  let t = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function valorPedidoDe(f) {
  return f.valorPedido !== undefined ? f.valorPedido : Math.round((Number(f.pedido) || 0) * (Number(f.precio) || 0));
}
function totalesDe(filas) {
  const s = (fn) => filas.reduce((a, f) => a + (Number(fn(f)) || 0), 0);
  return {
    pedido: s((f) => f.pedido),
    producido: s((f) => f.producido),
    despachado: s((f) => f.despachado),
    faltaProducir: s((f) => f.faltaProducir),
    disponible: s((f) => f.disponible),
    valorPedido: s(valorPedidoDe),
    valorDisponible: s((f) => f.valorDisponible),
    faltaDespachar: s((f) => f.faltaDespachar),
    valorFaltaDespachar: s((f) => f.valorFaltaDespachar),
    etSinCortar: s((f) => f.etSinCortar),
    etCorte: s((f) => f.etCorte),
    etPlanta: s((f) => f.etPlanta),
    etSemi: s((f) => f.etSemi),
    etBpt: s((f) => f.etBpt),
  };
}
// Filas de las preórdenes montadas de un cliente que todavía no son pedido
// (2026-10-19, a pedido de Fredy) Una preorden que ya se montó como pedido en Busint se queda abierta en ATLAS y
// duplicaba la fila ("Orden SUR-01 / DG-700 sin cortar" junto al pedido 1771 ya cortado). Si el cliente ya tiene un pedido
// real con la misma referencia y la misma cantidad (±2 %), la fila de la preorden se oculta (o se muestra marcada si se pide).
// Con la misma referencia pero otra cantidad se deja, marcada como "posible pedido N°".
const refNormPre = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function filasPreordenesDe(nombreCliente, preordenes, filasReales = [], mostrarConvertidas = false) {
  const k = normTxt(nombreCliente);
  if (!k) return [];
  const filas = [];
  const realesPorRef = new Map();
  (filasReales || []).forEach((r) => {
    const rk = refNormPre(r.ref);
    if (!rk || r.esPreorden) return;
    realesPorRef.set(rk, [...(realesPorRef.get(rk) || []), r]);
  });
  preordenes.forEach((p) => {
    const kp = normTxt(p.cliente);
    if (!kp || p.estado === "cerrada" || p.numPedido) return;
    if (!(kp.includes(k) || k.includes(kp))) return;
    const etiqueta = p.numeroOrden
      ? `${p.origenPantalla === "reprogramacion" ? "Reprogramación" : "Orden"} ${p.siglasMarca ? p.siglasMarca + "-" : "N°-"}${String(p.numeroOrden).padStart(2, "0")}`
      : p.nombre || "Preorden";
    (p.items || []).forEach((it, i) => {
      if (it.pedidoVinculado) return;
      const cant = (Number(it.colombiaCantidad) || 0) + (Number(it.venezuelaCantidad) || 0);
      if (cant <= 0) return;
      const precio = numeroPrecio(it.precio);
      const reales = realesPorRef.get(refNormPre(it.referencia)) || [];
      const igual = reales.find((r) => Math.abs((Number(r.pedido) || 0) - cant) <= Math.max(2, cant * 0.02));
      if (igual && !mostrarConvertidas) return;
      const distinta = !igual && reales.length ? reales[0] : null;
      filas.push({
        numPed: etiqueta,
        ref: it.referencia || "(sin referencia)",
        descripcion: (it.nombre || "") + (igual ? ` (ya es el pedido N° ${igual.numPed})` : distinta ? ` (posible pedido N° ${distinta.numPed}: ${distinta.pedido} und)` : ""),
        pedido: cant,
        producido: 0,
        despachado: 0,
        faltaProducir: cant,
        disponible: 0,
        precio,
        precioFuente: "preorden",
        valorPedido: Math.round(cant * precio),
        valorDisponible: 0,
        faltaDespachar: cant,
        valorFaltaDespachar: Math.round(cant * precio),
        etSinCortar: cant,
        etCorte: 0,
        etPlanta: 0,
        etSemi: 0,
        etBpt: 0,
        estado: "preorden",
        esPreorden: true,
        _k: `${p.id}-${i}`,
      });
    });
  });
  return filas;
}

function normTxt(v) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

// ── Excel con colores ─────────────────────────────────────────────────────────
const COLUMNAS_EXCEL = [
  { h: "Pedido N°", w: 22, k: "numPed", al: "center" },
  { h: "Referencia", w: 14, k: "ref", al: "left" },
  { h: "Descripción", w: 40, k: "descripcion", al: "left" },
  { h: "Pedido", w: 11, k: "pedido", al: "right", num: true },
  { h: "Producido", w: 11, k: "producido", al: "right", num: true },
  { h: "Despachado", w: 12, k: "despachado", al: "right", num: true },
  { h: "Falta producir", w: 13, k: "faltaProducir", al: "right", num: true },
  { h: "Disponible", w: 12, k: "disponible", al: "right", num: true },
  { h: "Precio", w: 13, k: "precio", al: "right", money: true },
  { h: "Valor del pedido", w: 17, k: "valorPedido", al: "right", money: true },
  { h: "Valor disponible", w: 17, k: "valorDisponible", al: "right", money: true },
  { h: "Falta despachar", w: 13, k: "faltaDespachar", al: "right", num: true },
  { h: "Valor falta despachar", w: 18, k: "valorFaltaDespachar", al: "right", money: true },
  { h: "Sin cortar", w: 11, k: "etSinCortar", al: "right", num: true },
  { h: "En corte", w: 10, k: "etCorte", al: "right", num: true },
  { h: "En planta", w: 10, k: "etPlanta", al: "right", num: true },
  { h: "Semiterm.", w: 11, k: "etSemi", al: "right", num: true },
  { h: "En BPT", w: 10, k: "etBpt", al: "right", num: true },
  { h: "Estado", w: 21, k: "estado", al: "center" },
];
const colDe = (k) => COLUMNAS_EXCEL.findIndex((c) => c.k === k) + 1;
const AZUL_OSCURO = "FF1A1A2E";
const BLANCO = "FFFFFFFF";
const CEBRA = "FFF7F4F0";
const BORDE = { style: "thin", color: { argb: "FFE8E2DB" } };
const BORDES = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };

function nombreHoja(base, usados) {
  const limpio = String(base || "Cliente").replace(/[:\\/?*[\]]/g, "-").trim().slice(0, 28) || "Cliente";
  let cand = limpio;
  let k = 2;
  while (usados.has(cand.toLowerCase())) { cand = `${limpio.slice(0, 25)} ${k}`; k += 1; }
  usados.add(cand.toLowerCase());
  return cand;
}

function hojaCliente(wb, grupo, filas, usados, generadoEn) {
  const ws = wb.addWorksheet(nombreHoja(grupo.cliente, usados), { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const n = COLUMNAS_EXCEL.length;
  ws.columns = COLUMNAS_EXCEL.map((c) => ({ width: c.w }));
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = `DISPONIBLE PARA DESPACHAR — ${grupo.cliente}`;
  t.font = { bold: true, size: 15, color: { argb: AZUL_OSCURO } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, n);
  const sub = ws.getCell(2, 1);
  sub.value = `Industrias Yanko · Generado el ${generadoEn}`;
  sub.font = { italic: true, size: 10, color: { argb: "FF5A5A7A" } };
  const head = ws.getRow(4);
  COLUMNAS_EXCEL.forEach((c, i) => {
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
    COLUMNAS_EXCEL.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.k === "estado" ? (ESTADOS[f.estado]?.txt || "") : c.k === "valorPedido" ? valorPedidoDe(f) : c.num || c.money ? Number(f[c.k]) || 0 : f[c.k] ?? "";
      cell.alignment = { horizontal: c.al, vertical: "middle" };
      cell.border = BORDES;
      cell.font = { size: 10.5 };
      if (f.esPreorden) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VIOLETA_FILA } };
      else if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CEBRA } };
      if (c.num) cell.numFmt = "#,##0";
      if (c.money) cell.numFmt = '"$"#,##0';
    });
    const disp = row.getCell(colDe("disponible"));
    if (f.disponible > 0) {
      disp.font = { bold: true, size: 11, color: { argb: "FF1E7A52" } };
      disp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F5EC" } };
      row.getCell(colDe("valorDisponible")).font = { bold: true, size: 11, color: { argb: "FF1E7A52" } };
    }
    if (f.faltaProducir > 0) {
      row.getCell(colDe("faltaProducir")).font = { bold: true, size: 10.5, color: { argb: "FFA8660B" } };
      row.getCell(colDe("faltaProducir")).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF1DA" } };
    }
    const est = ESTADOS[f.estado];
    if (est) {
      const ce = row.getCell(colDe("estado"));
      ce.fill = { type: "pattern", pattern: "solid", fgColor: { argb: est.xl } };
      ce.font = { bold: true, size: 10, color: { argb: est.xlFg } };
    }
    row.height = 19;
  });
  const fin = 5 + filas.length;
  const tot = ws.getRow(fin);
  const totF = totalesDe(filas);
  tot.getCell(1).value = "TOTAL";
  ["pedido", "producido", "despachado", "faltaProducir", "disponible", "valorPedido", "valorDisponible", "faltaDespachar", "valorFaltaDespachar", "etSinCortar", "etCorte", "etPlanta", "etSemi", "etBpt"].forEach((k) => {
    const col = colDe(k);
    tot.getCell(col).value = totF[k];
    tot.getCell(col).numFmt = k.startsWith("valor") ? '"$"#,##0' : "#,##0";
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

function hojaResumen(wb, grupos, generadoEn) {
  const ws = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const cols = [["Cliente", 34, "left"], ["Referencias", 13, "center"], ["Pedido", 12, "right"], ["Producido", 12, "right"], ["Despachado", 13, "right"], ["Falta producir", 14, "right"], ["Disponible", 13, "right"], ["Valor del pedido", 18, "right"], ["Valor disponible", 18, "right"], ["Falta despachar", 14, "right"], ["Valor falta despachar", 20, "right"]];
  ws.columns = cols.map(([, w]) => ({ width: w }));
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = "DISPONIBLE PARA DESPACHAR — RESUMEN POR CLIENTE";
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: AZUL_OSCURO } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, cols.length);
  ws.getCell(2, 1).value = `Industrias Yanko · Generado el ${generadoEn}`;
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: "FF5A5A7A" } };
  cols.forEach(([h, , al], i) => {
    const c = ws.getRow(4).getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: BLANCO } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSCURO } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = BORDES;
  });
  ws.getRow(4).height = 24;
  grupos.forEach((g, idx) => {
    const row = ws.getRow(5 + idx);
    const v = [g.cliente, g.filas.length, g.totales.pedido, g.totales.producido, g.totales.despachado, g.totales.faltaProducir, g.totales.disponible, g.totales.valorPedido, g.totales.valorDisponible, g.totales.faltaDespachar, g.totales.valorFaltaDespachar];
    v.forEach((val, i) => {
      const c = row.getCell(i + 1);
      c.value = val;
      c.alignment = { horizontal: cols[i][2], vertical: "middle" };
      c.border = BORDES;
      c.font = { size: 10.5 };
      if (i >= 2) c.numFmt = i === 7 || i === 8 || i === 10 ? '"$"#,##0' : "#,##0";
      if (idx % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CEBRA } };
    });
    row.getCell(7).font = { bold: true, size: 11, color: { argb: "FF1E7A52" } };
    row.getCell(9).font = { bold: true, size: 11, color: { argb: "FF1E7A52" } };
    row.height = 19;
  });
  const fin = 5 + grupos.length;
  const tot = ws.getRow(fin);
  tot.getCell(1).value = "TOTAL";
  const sumaG = (k) => grupos.reduce((s, g) => s + (g.totales[k] || 0), 0);
  [["pedido", 3], ["producido", 4], ["despachado", 5], ["faltaProducir", 6], ["disponible", 7], ["valorPedido", 8], ["valorDisponible", 9], ["faltaDespachar", 10], ["valorFaltaDespachar", 11]].forEach(([k, col]) => {
    tot.getCell(col).value = sumaG(k);
    tot.getCell(col).numFmt = k.startsWith("valor") ? '"$"#,##0' : "#,##0";
  });
  for (let c = 1; c <= cols.length; c++) {
    const cell = tot.getCell(c);
    cell.font = { bold: true, size: 11, color: { argb: BLANCO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSCURO } };
    cell.border = BORDES;
    cell.alignment = { horizontal: c === 1 ? "left" : "right", vertical: "middle" };
  }
  tot.height = 24;
  return ws;
}

async function descargarExcel(grupos, nombreArchivo, conResumen) {
  const m = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = m.default || m;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Industrias Yanko";
  const generadoEn = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  const usados = new Set(["resumen"]);
  if (conResumen) hojaResumen(wb, grupos, generadoEn);
  grupos.forEach((g) => hojaCliente(wb, g, g.filas, usados, generadoEn));
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

function nombreArchivoSeguro(txt) {
  return String(txt || "Cliente").replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "_");
}

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function DisponibleDespacharView({ db, functionsClient, T }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [cliente, setCliente] = useState("");
  const [verDespachados, setVerDespachados] = useState(false);
  const [soloDisponible, setSoloDisponible] = useState(false);
  const [incluirPre, setIncluirPre] = useState(true);
  const [verConvertidas, setVerConvertidas] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [preordenes, setPreordenes] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bitacora_preordenes"), (snap) => setPreordenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [db]);

  async function consultar() {
    setCargando(true);
    setError("");
    try {
      const resp = await httpsCallable(functionsClient, "getDisponibleParaDespachar", { timeout: 540000 })({});
      setDatos(resp.data);
      setCliente((actual) => (actual && (resp.data.porCliente || []).some((g) => g.cliente === actual) ? actual : (resp.data.porCliente || [])[0]?.cliente || ""));
    } catch (err) {
      setError(err?.message || "No se pudo consultar. Verifica que la función getDisponibleParaDespachar esté publicada.");
    }
    setCargando(false);
  }
  useEffect(() => { consultar(); /* eslint-disable-next-line */ }, []);

  const grupos = datos?.porCliente || [];
  const grupo = grupos.find((g) => g.cliente === cliente) || null;

  function filtrarFilas(filas) {
    return filas.filter((f) => (verDespachados || f.estado !== "despachado") && (!soloDisponible || f.disponible > 0));
  }
  // Preórdenes montadas sin pedido: van al final de la tabla del cliente
  const filasPre = useMemo(() => (grupo ? filasPreordenesDe(grupo.cliente, preordenes, grupo.filas, verConvertidas) : []), [grupo, preordenes, verConvertidas]);
  const nConvertidas = useMemo(() => (grupo ? filasPreordenesDe(grupo.cliente, preordenes, [], false).length - filasPreordenesDe(grupo.cliente, preordenes, grupo.filas, false).length : 0), [grupo, preordenes]);
  const filas = grupo ? [...filtrarFilas(grupo.filas), ...(incluirPre && !soloDisponible ? filasPre : [])] : [];
  const tot = totalesDe(filas);

  async function bajarUno() {
    if (!grupo) return;
    setBajando(true);
    try {
      await descargarExcel([{ ...grupo, filas, totales: totalesDe(filas) }], `Disponible_para_despachar_${nombreArchivoSeguro(grupo.cliente)}_${new Date().toISOString().slice(0, 10)}.xlsx`, false);
    } catch (e) { setError("No se pudo generar el Excel: " + (e?.message || e)); }
    setBajando(false);
  }
  async function bajarTodos() {
    setBajando(true);
    try {
      const lista = grupos
        .map((g) => {
          const f = [...filtrarFilas(g.filas), ...(incluirPre && !soloDisponible ? filasPreordenesDe(g.cliente, preordenes, g.filas, verConvertidas) : [])];
          return { ...g, filas: f, totales: totalesDe(f) };
        })
        .filter((g) => g.filas.length);
      if (!lista.length) { setError("No hay nada para descargar con estos filtros."); }
      else await descargarExcel(lista, `Disponible_para_despachar_TODOS_${new Date().toISOString().slice(0, 10)}.xlsx`, true);
    } catch (e) { setError("No se pudo generar el Excel: " + (e?.message || e)); }
    setBajando(false);
  }

  const kpi = (titulo, valor, color, sub) => (
    <div style={{ flex: "1 1 150px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 16px", minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || T.ink, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const th = (txt, alineacion) => <th key={txt} style={{ padding: "10px 12px", color: T.seam, textAlign: alineacion || "right", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{txt}</th>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} disabled={!grupos.length} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 13, fontWeight: 600, minWidth: 260, fontFamily: "inherit" }}>
          {!grupos.length && <option value="">{cargando ? "Cargando clientes..." : "Sin clientes"}</option>}
          {grupos.map((g) => <option key={g.cliente} value={g.cliente}>{g.cliente} — {fmt(g.totales.disponible)} und disponibles</option>)}
        </select>
        <label style={{ fontSize: 12, color: T.slate, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={soloDisponible} onChange={(e) => setSoloDisponible(e.target.checked)} /> Solo lo que ya se puede despachar
        </label>
        <label style={{ fontSize: 12, color: T.slate, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={verDespachados} onChange={(e) => setVerDespachados(e.target.checked)} /> Mostrar ya despachados
        </label>
        <label style={{ fontSize: 12, color: T.slate, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={incluirPre} onChange={(e) => setIncluirPre(e.target.checked)} /> Incluir preórdenes
        </label>
        <label style={{ fontSize: 12, color: T.slate, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }} title="Preórdenes cuyo pedido real ya existe en Busint (misma referencia y cantidad)">
          <input type="checkbox" checked={verConvertidas} onChange={(e) => setVerConvertidas(e.target.checked)} /> Mostrar preórdenes ya convertidas en pedido{nConvertidas > 0 ? ` (${nConvertidas} ocultas)` : ""}
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={consultar} disabled={cargando} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{cargando ? "Consultando Busint..." : "🔄 Actualizar"}</button>
        <button onClick={bajarUno} disabled={bajando || !grupo || !filas.length} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.jade, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: bajando || !grupo || !filas.length ? 0.5 : 1 }}>⬇ Descargar Excel</button>
        <button onClick={bajarTodos} disabled={bajando || !grupos.length} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.ink, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: bajando || !grupos.length ? 0.5 : 1 }}>⬇ Todos los clientes</button>
      </div>

      {error && <div style={{ padding: "10px 14px", background: T.coralBg, color: T.coral, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
      {datos?.avisos?.length > 0 && (
        <div style={{ padding: "10px 14px", background: T.amberBg, color: T.amber, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
          {datos.avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}
        </div>
      )}
      {datos?.diagTablas?.ApiGen_Referencias && (datos.diagTablas.ApiGen_Referencias.error || datos.diagTablas.ApiGen_Referencias.sinPrecio?.length > 0) && (
        <details style={{ padding: "8px 14px", background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: T.slate }}>🔧 Diagnóstico de precios (para soporte)</summary>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            {datos.diagTablas.ApiGen_Referencias.error
              ? <div style={{ color: T.coral }}>No se pudo leer el maestro de referencias: {datos.diagTablas.ApiGen_Referencias.error}</div>
              : <>
                  <div>Maestro de referencias: {datos.diagTablas.ApiGen_Referencias.filas} filas, {datos.diagTablas.ApiGen_Referencias.preciosMatriculados} con precio matriculado.</div>
                  {datos.diagTablas.ApiGen_Referencias.sinPrecio.map((r, i) => (
                    <div key={i} style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
                      <b>{r.ref}</b> (pedido {r.numPed}): {r.enMaestro ? `en maestro (ref ${r.refMaestro}, ext ${r.refExterna || "—"}) · ${JSON.stringify(r.camposPrecio)}` : "NO aparece en el maestro de referencias"} · candidatos: {JSON.stringify(r.candidatos)}
                    </div>
                  ))}
                </>}
          </div>
        </details>
      )}
      {cargando && !datos && <div style={{ padding: 30, textAlign: "center", color: T.slate, fontSize: 13 }}>Cruzando pedidos, facturación y producción... puede tardar un minuto.</div>}

      {grupo && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {kpi("Unidades pedidas", fmt(tot.pedido), null, filasPre.length && incluirPre && !soloDisponible ? "incluye preórdenes" : "")}
            {kpi("Valor del pedido", money(tot.valorPedido), T.denim)}
            {kpi("Producido", fmt(tot.producido), T.denim)}
            {kpi("Ya despachado", fmt(tot.despachado), T.slate)}
            {kpi("Disponible", fmt(tot.disponible), T.jade, "listo para despachar")}
            {kpi("Valor disponible", money(tot.valorDisponible), T.jade, "con precio matriculado")}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {kpi("Falta por despachar", fmt(tot.faltaDespachar), T.ink, "pedido − despachado")}
            {kpi("Valor falta por despachar", money(tot.valorFaltaDespachar), T.ink, "con precio matriculado")}
            {kpi("Sin cortar", fmt(tot.etSinCortar), T.amber)}
            {kpi("En corte", fmt(tot.etCorte), T.coral)}
            {kpi("En planta", fmt(tot.etPlanta), T.denim)}
            {kpi("Semiterminado", fmt(tot.etSemi), T.violet)}
            {kpi("En BPT", fmt(tot.etBpt), T.jade)}
          </div>

          <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1700 }}>
              <thead>
                <tr style={{ background: T.ink }}>
                  {th("Pedido", "center")}{th("Referencia", "left")}{th("Descripción", "left")}{th("Pedido")}{th("Producido")}{th("Despachado")}{th("Falta producir")}{th("Disponible")}{th("Precio")}{th("Valor del pedido")}{th("Valor disponible")}{th("Falta despachar")}{th("Valor falta despachar")}{th("Sin cortar")}{th("En corte")}{th("En planta")}{th("Semiterm.")}{th("En BPT")}{th("Estado", "center")}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const est = ESTADOS[f.estado] || ESTADOS.sin_producir;
                  return (
                    <tr key={f._k || f.numPed + f.ref} style={{ background: f.esPreorden ? "#FAF7FD" : i % 2 ? "#FAF8F5" : T.white, borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: "9px 12px", textAlign: "center", color: T.slate, fontVariantNumeric: "tabular-nums" }}>
                        {f.esPreorden ? <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: T.violetBg, color: T.violet, whiteSpace: "nowrap" }}>📝 {f.numPed}</span> : f.numPed}
                      </td>
                      <td style={{ padding: "9px 12px", fontWeight: 700 }}>{f.ref}</td>
                      <td style={{ padding: "9px 12px", color: T.slate, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.descripcion}>{f.descripcion || "—"}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(f.pedido)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(f.producido)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.slate }}>{fmt(f.despachado)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: f.faltaProducir ? 700 : 400, color: f.faltaProducir ? T.amber : T.slate, background: f.faltaProducir ? T.amberBg : "transparent" }}>{fmt(f.faltaProducir)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800, color: f.disponible ? T.jade : T.slate, background: f.disponible ? T.jadeBg : "transparent" }}>{fmt(f.disponible)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }} title={`Precio tomado de: ${f.precioFuente}`}>
                        {f.precio ? money(f.precio) : <span style={{ color: T.coral, fontWeight: 700 }}>{f.esPreorden ? "sin precio" : "sin matricular"}</span>}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.slate }}>{money(valorPedidoDe(f))}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: f.valorDisponible ? T.jade : T.slate }}>{money(f.valorDisponible)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{fmt(f.faltaDespachar)}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{money(f.valorFaltaDespachar)}</td>
                      {[f.etSinCortar, f.etCorte, f.etPlanta, f.etSemi, f.etBpt].map((n, j) => (
                        <td key={j} style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: n ? T.ink : T.border }}>{n ? fmt(n) : "·"}</td>
                      ))}
                      <td style={{ padding: "9px 12px", textAlign: "center" }}><span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: est.bg, color: est.fg, whiteSpace: "nowrap" }}>{est.txt}</span></td>
                    </tr>
                  );
                })}
                {!filas.length && <tr><td colSpan={19} style={{ padding: 24, textAlign: "center", color: T.slate }}>Nada para mostrar con estos filtros.</td></tr>}
              </tbody>
              {filas.length > 0 && (
                <tfoot>
                  <tr style={{ background: T.ink, color: "#fff", fontWeight: 800 }}>
                    <td colSpan={3} style={{ padding: "10px 12px" }}>TOTAL</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.pedido)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.producido)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.despachado)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.faltaProducir)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.disponible)}</td>
                    <td />
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{money(tot.valorPedido)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{money(tot.valorDisponible)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.faltaDespachar)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{money(tot.valorFaltaDespachar)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.etSinCortar)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.etCorte)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.etPlanta)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.etSemi)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(tot.etBpt)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div style={{ fontSize: 11, color: T.slate, marginTop: 10, lineHeight: 1.5 }}>
            Disponible = lo producido (Entradas a Planta) menos lo ya despachado (facturas y traslados netos de devoluciones), sin pasar del saldo del pedido.
            Las filas violeta son preórdenes montadas que todavía no son pedido: suman en Pedido y Falta producir, nunca en Disponible. Precio: es el precio matriculado de la referencia en Busint (pantalla de Costos); las referencias "sin matricular" hay que matricularlas allá y salen con valor $0 hasta entonces.
            Falta por despachar = pedido − despachado; las columnas Sin cortar / En corte / En planta / Semiterm. / En BPT dicen dónde está hoy ese saldo según el Panel de Flujo de Busint (Sin cortar = lo que aún no está en ninguna etapa). Las filas grises "Producción sin línea de pedido" son lotes que están en producción pero no tienen línea en ese pedido: se muestran para que no se pierdan.
            {datos?.generadoEn && <> · Consultado: {new Date(datos.generadoEn).toLocaleString("es-CO")}</>}
          </div>
        </>
      )}
      {!grupo && !cargando && datos && <div style={{ padding: 30, textAlign: "center", color: T.slate }}>Busint no devolvió pedidos vigentes en el rango consultado.</div>}
    </div>
  );
}
