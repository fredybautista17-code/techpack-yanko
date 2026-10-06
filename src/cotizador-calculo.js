// ─── COTIZADOR: CÁLCULO E IMPORTADOR (sin React) ─────────────────────────────
// (2026-10-06, a pedido de Fredy) Replica la hoja de costos "975093 ULTACT
// 30.09.2026.xlsx" (V1/V2/V3 de una referencia de Kamila). Las fórmulas son
// las MISMAS de esa hoja (F15 telas, F39 insumos, F56 procesos, F59 costo
// definitivo, F60 costo + daños, F61-F65 impuestos, F67-F73 costos fijos,
// D74 total costo sin IVA, Q92 gastos financieros del escenario FULL y
// K73 = precio de venta por margen esperado). Se verificó contra los valores
// guardados de las 3 hojas del Excel (ver test al final del trabajo).

export const TASAS_BASE = {
  danos: 0.015, // daños de fabricación (F60)
  ica: 0.005,
  bancarios: 0.004,
  retencion: 0.0125,
  autorenta: 0.006,
  renta: 0.01,
  imprevistos: 0.1, // "10% termo imprevistos" (F51)
  baseUtilidad: 0.93621, // F76: precio tradicional = costo / base
  iva: 0.19,
};
export const ETIQUETAS_TASAS = {
  danos: "Daños de fabricación",
  ica: "ICA",
  bancarios: "Gastos bancarios",
  retencion: "Retención en la fuente",
  autorenta: "Autorenta",
  renta: "Renta",
  imprevistos: "Imprevistos termo/vinilo",
  baseUtilidad: "Base de utilidad",
  iva: "IVA",
};
// Valores de la hoja V3 (30/09/2026) -- punto de partida de cada ficha.
export const FIJOS_BASE = {
  bodega: 74,
  diseno: 400,
  administrativa: 700,
  termofijacion: 170.63,
  empaque: 44,
  transporte: 220,
  servicios: 600,
};
export const ETIQUETAS_FIJOS = {
  bodega: "Área de bodega",
  diseno: "Área de diseño",
  administrativa: "Área administrativa",
  termofijacion: "Área de termofijación / sublimación",
  empaque: "Área de empaque",
  transporte: "Transporte",
  servicios: "Servicios",
};
// Procesos de la hoja. "imp: true" = entra en la base del 10% de imprevistos
// (aplique DTF, corte vinilo, espiga, descartonado, bajada de vinilo --
// mismos de la fórmula de F51).
export const PROCESOS_BASE = [
  { nombre: "Corte", imp: false },
  { nombre: "Sublimación", imp: false },
  { nombre: "Confección", imp: false },
  { nombre: "Estampación", imp: false },
  { nombre: "Aplique DTF", imp: true },
  { nombre: "Corte vinilo", imp: true },
  { nombre: "Espiga", imp: true },
  { nombre: "Descartonado", imp: true },
  { nombre: "Bajada de vinilo", imp: true },
  { nombre: "Terminación", imp: false },
  { nombre: "Postura de Dije", imp: false },
  { nombre: "Proceso Adicional", imp: false },
];
export const REGEX_INSUMO_TERMO = /vinilo|dtf|poliamida|fast\s?dry|vad/i;

export function num(x) {
  if (x === null || x === undefined || x === "") return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const n = Number(String(x).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function versionVacia() {
  return {
    telas: [{ material: "", precioKg: "", rendimiento: 1, ancho: "", consumo: "" }],
    insumos: [],
    procesos: PROCESOS_BASE.map((p) => ({ nombre: p.nombre, valor: "", imp: p.imp })),
    tasas: { ...TASAS_BASE },
    fijos: { ...FIJOS_BASE },
    margen: 0.05,
    precioClienteIva: "",
    utilidadFija: 1000,
  };
}

export function calcularCotizacion(v) {
  const tasas = { ...TASAS_BASE, ...(v.tasas || {}) };
  const fijos = { ...FIJOS_BASE, ...(v.fijos || {}) };
  // Telas: precio m = precio kg / rendimiento; por prenda = consumo (m) x precio m
  const telas = (v.telas || []).map((t) => {
    const rend = num(t.rendimiento) || 1;
    const precioM = num(t.precioKg) / rend;
    const porPrenda = num(t.consumo) * precioM;
    return { precioM, porPrenda };
  });
  const telasTotal = telas.reduce((s, t) => s + t.porPrenda, 0);
  const insumos = (v.insumos || []).map((i) => ({ porPrenda: num(i.precio) * num(i.consumo), termo: !!i.termo }));
  const insumosTotal = insumos.reduce((s, i) => s + i.porPrenda, 0);
  const procesosBase = (v.procesos || []).reduce((s, p) => s + num(p.valor), 0);
  const baseImprevistos =
    insumos.filter((i) => i.termo).reduce((s, i) => s + i.porPrenda, 0) +
    (v.procesos || []).filter((p) => p.imp).reduce((s, p) => s + num(p.valor), 0);
  const imprevistos = baseImprevistos * tasas.imprevistos;
  const procesosTotal = procesosBase + imprevistos;
  const costoDefinitivo = telasTotal + insumosTotal + procesosTotal; // F59
  const costoMasDanos = costoDefinitivo * (1 + tasas.danos); // F60
  const impuestos = {
    ica: costoMasDanos * tasas.ica,
    bancarios: costoMasDanos * tasas.bancarios,
    retencion: costoMasDanos * tasas.retencion,
    autorenta: costoMasDanos * tasas.autorenta,
    renta: costoMasDanos * tasas.renta,
  };
  const impuestosTotal = Object.values(impuestos).reduce((s, x) => s + x, 0);
  const fijosTotal = Object.keys(ETIQUETAS_FIJOS).reduce((s, k) => s + num(fijos[k]), 0);
  const costoTotalSinIva = costoMasDanos + impuestosTotal + fijosTotal; // D74
  // Precio tradicional (F78-F80)
  const precioBase = costoTotalSinIva / tasas.baseUtilidad;
  // Gastos financieros "FULL": los mismos 5 conceptos pero sobre el PRECIO de
  // venta (N87:N91); Q92 = esos gastos menos lo ya incluido en el costo.
  const gastosSobrePrecio = precioBase * (tasas.ica + tasas.bancarios + tasas.renta + tasas.retencion + tasas.autorenta);
  const ajusteFinanciero = gastosSobrePrecio - impuestosTotal; // Q92
  const costoFull = costoTotalSinIva + ajusteFinanciero; // K72 / N72 / Q72
  const margen = num(v.margen);
  const precioMargen = margen < 1 ? costoFull / (1 - margen) : 0; // K73 (escenario que se envía)
  const mk = (precioSinIva) => ({
    precioSinIva,
    precioConIva: precioSinIva * (1 + tasas.iva),
    utilidad: precioSinIva - costoFull,
    margen: precioSinIva > 0 ? (precioSinIva - costoFull) / precioSinIva : 0,
  });
  const escMargen = mk(precioMargen);
  const pCli = num(v.precioClienteIva);
  const escCliente = pCli > 0 ? mk(pCli / (1 + tasas.iva)) : null;
  const escFijo = mk(costoFull + num(v.utilidadFija));
  return {
    telas, insumos, telasTotal, insumosTotal, procesosBase, imprevistos, procesosTotal,
    costoDefinitivo, costoMasDanos, impuestos, impuestosTotal, fijosTotal, costoTotalSinIva,
    precioBase, precioBaseConIva: precioBase * (1 + tasas.iva), ajusteFinanciero, costoFull,
    escMargen, escCliente, escFijo,
    // Lo que se aplica al prototipo / cápsula: precio por margen CON IVA, redondeado a peso.
    precioAplicar: Math.round(escMargen.precioConIva),
  };
}

// ─── IMPORTADOR DE EXCEL ────────────────────────────────────────────────────
function normTxt(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}
function celda(ws, addr) {
  const c = ws[addr];
  return c ? c.v : undefined;
}
function aISO(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const t = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
}
const CLAVES_FIJOS = [
  ["BODEGA", "bodega"], ["DISENO", "diseno"], ["ADMINISTRATIVA", "administrativa"],
  ["TERMOFIJACION", "termofijacion"], ["EMPAQUE", "empaque"], ["TRANSPORTE", "transporte"], ["SERVICIOS", "servicios"],
];
export function parsearHojaCotizacion(ws, nombreHoja) {
  const avisos = [];
  const referencia = String(celda(ws, "D2") ?? "").trim();
  const fecha = aISO(celda(ws, "B1"));
  const telas = [];
  for (let r = 6; r <= 9; r++) {
    const material = String(celda(ws, `C${r}`) ?? "").trim();
    const precioKg = celda(ws, `D${r}`);
    const consumo = celda(ws, `D${r + 5}`);
    if (!material && !num(precioKg)) continue;
    telas.push({ material, precioKg: num(precioKg), rendimiento: num(celda(ws, `E${r}`)) || 1, ancho: num(celda(ws, `G${r}`)), consumo: num(consumo) });
  }
  if (!telas.length) telas.push({ material: "", precioKg: "", rendimiento: 1, ancho: "", consumo: "" });
  const insumos = [];
  for (let r = 19; r <= 38; r++) {
    const nombre = String(celda(ws, `C${r}`) ?? "").trim();
    if (!nombre) continue;
    insumos.push({ nombre, precio: num(celda(ws, `D${r}`)), consumo: num(celda(ws, `E${r}`)), termo: r >= 24 && r <= 30 });
  }
  const procesos = [];
  for (let r = 42; r <= 55; r++) {
    const nombre = String(celda(ws, `C${r}`) ?? "").trim();
    if (!nombre || normTxt(nombre).startsWith("10%")) continue;
    const base = PROCESOS_BASE.find((p) => normTxt(p.nombre) === normTxt(nombre));
    procesos.push({ nombre, valor: num(celda(ws, `F${r}`)), imp: !!base?.imp });
  }
  const fijos = { ...FIJOS_BASE };
  for (let r = 67; r <= 73; r++) {
    const et = normTxt(celda(ws, `C${r}`));
    const par = CLAVES_FIJOS.find(([k]) => et.includes(k));
    if (par) fijos[par[1]] = num(celda(ws, `F${r}`));
  }
  const tasas = { ...TASAS_BASE };
  const base = num(celda(ws, "F76"));
  if (base > 0 && base < 1) tasas.baseUtilidad = base;
  // Margen esperado y precio final del Excel: se ubican por su ETIQUETA en la
  // columna J (la fila cambia entre versiones). El margen que se toma como
  // ENTRADA es el valor fijo (no fórmula) de "% MARGEN ESPERADO"; el precio a
  // comparar es el de la segunda "P VENTA FINAL" (bloque FULL, el que se envía).
  let margen = 0.05;
  let precioExcel = null;
  let nFinal = 0;
  for (let r = 50; r <= 100; r++) {
    const et = normTxt(celda(ws, `J${r}`));
    if (et.startsWith("% MARGEN ESPERADO")) {
      const c = ws[`K${r}`];
      if (c && typeof c.v === "number" && !c.f && c.v > 0 && c.v < 1) margen = c.v;
    }
    if (et.startsWith("P VENTA FINAL")) {
      nFinal++;
      if (nFinal === 2) precioExcel = celda(ws, `K${r}`);
    }
  }
  const utilFija = num(celda(ws, "Q74")) || num(celda(ws, "Q73")) || 1000;
  const v = { telas, insumos, procesos, tasas, fijos, margen, precioClienteIva: "", utilidadFija: utilFija > 1 && utilFija < 100000 ? utilFija : 1000 };
  const calc = calcularCotizacion(v);
  const excelNum = typeof precioExcel === "number" ? precioExcel : null;
  if (!referencia) avisos.push("La hoja no tiene referencia en D2.");
  return {
    nombre: String(nombreHoja || "").trim(),
    referencia,
    fecha,
    version: v,
    precioExcel: excelNum,
    precioAtlas: calc.escMargen.precioSinIva,
    coincide: excelNum != null ? Math.abs(excelNum - calc.escMargen.precioSinIva) < 1 : null,
    avisos,
  };
}

export async function parsearArchivoCotizacion(archivo) {
  const XLSX = await import("xlsx");
  const buf = await archivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const hojas = wb.SheetNames.map((n) => parsearHojaCotizacion(wb.Sheets[n], n)).filter((h) => h.referencia || h.version.insumos.length);
  return hojas;
}
