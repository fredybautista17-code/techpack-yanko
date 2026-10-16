// ─── MINICOTIZADOR DE VINILO / DTF ───────────────────────────────────────────
// (2026-10-15, a pedido de Fredy) Hoja corta "COTIZACIÓN DE VENTA {ref}
// ({mes}- {año})" para los aplique de vinilo / DTF. Cuatro filas son insumos
// que se eligen del catálogo de Busint (aplique DTF - Paper PET, aplique en
// ALTA, poliamida - Fast Dry y vinilo reflectivo; el costo viene de Busint y
// el consumo lo digita el usuario, porque la referencia es nueva y no tiene
// ficha); las otras (corte de vinilo,
// descartonado, espiga, bajada de vinilo) son procesos con valor fijo.
//   COSTO X U = COSTO M.P × CONSUMO   (en los procesos: el valor digitado)
//   TOTAL     = COSTO X U + BASE      (BASE = "lo que siempre va a costar hacerlo")
//   SUMA      = Σ TOTAL ;  IMPREVISTOS = SUMA × % ;  TOTAL FINAL = SUMA + IMPREVISTOS
import { num } from "./cotizador-calculo";

export const IMPREVISTOS_PCT = 10;

// Filas fijas, en el orden de la hoja de Fredy. "buscar" = texto con el que
// arranca la búsqueda en el catálogo de insumos de Busint (botón 🔎).
export const FILAS_VINILO = [
  { key: "dtf", nombre: "APLIQUE DTF - PAPER PET", tipo: "insumo", buscar: "paper pet" },
  { key: "alta", nombre: "APLIQUE EN ALTA", tipo: "insumo", buscar: "alta" },
  { key: "poliamida", nombre: "POLIAMIDA - FAST DRY", tipo: "insumo", buscar: "poliamida" },
  { key: "corte", nombre: "CORTE VINILO", tipo: "proceso", valor: 103 },
  { key: "descartonado", nombre: "DESCARTONADO", tipo: "proceso", valor: 20 },
  { key: "espiga", nombre: "ESPIGA", tipo: "proceso", valor: 60 },
  { key: "bajada", nombre: "BAJADA DE VINILO", tipo: "proceso", valor: 360 },
  { key: "reflectivo", nombre: "CONS VINILO REFLECTIVO (CURVA)", tipo: "insumo", buscar: "reflect" },
];

export function filasViniloVacias() {
  return FILAS_VINILO.map((f) => ({
    key: f.key, nombre: f.nombre, tipo: f.tipo, usa: true,
    codigo: "", costoMP: "", unidad: "", consumo: f.tipo === "insumo" ? "" : "",
    valor: f.tipo === "proceso" ? f.valor : "", base: 0, fuente: f.tipo === "proceso" ? "Valor fijo" : "",
  }));
}

export function calcularVinilo(filas, pct = IMPREVISTOS_PCT) {
  const detalle = (filas || []).map((f) => {
    if (f.usa === false) return { costoXU: 0, total: 0, omitida: true }; // fila sin marcar «Usa»: no suma
    const costoXU = f.tipo === "proceso" ? num(f.valor) : num(f.costoMP) * num(f.consumo);
    return { costoXU, total: costoXU + num(f.base) };
  });
  const suma = detalle.reduce((s, d) => s + d.total, 0);
  const imprevistos = suma * (num(pct) / 100);
  return { detalle, suma, imprevistos, total: suma + imprevistos };
}

// Aplica un insumo del inventario de Busint a una fila de la hoja: costo
// PROMEDIO del inventario (si no tiene, el costo de la ficha) y unidad. El
// consumo lo digita el usuario porque la referencia es nueva.
export function aplicarInsumoAFila(fila, x) {
  const usaPromedio = x.promedio > 0;
  const costo = usaPromedio ? x.promedio : x.costo;
  const nombre = x.color ? `${x.componente} - ${x.color}` : x.componente;
  return {
    ...fila,
    costoMP: costo > 0 ? Math.round(costo * 100) / 100 : "", unidad: x.unidad || "", codigo: x.codcomp || "",
    fuente: `Busint: ${nombre}${x.codcomp ? ` (cód. ${x.codcomp})` : ""} · ${usaPromedio ? "costo promedio de inventario" : costo > 0 ? "costo de la ficha (sin promedio en inventario)" : "sin costo en Busint"}`,
  };
}

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
export function tituloVinilo(ref, mes) {
  const m = /^(\d{4})-(\d{2})/.exec(mes || "");
  return `COTIZACIÓN DE VENTA ${ref || ""} ( ${m ? m[2] : "--"}- ${m ? m[1] : "----"} )`;
}
export function mesLargo(mes) {
  const m = /^(\d{4})-(\d{2})/.exec(mes || "");
  return m ? `${MESES[+m[2] - 1] || ""} ${m[1]}` : "";
}

// Descarga la hoja en el formato amarillo de Fredy.
export async function descargarViniloExcel({ ref, mes, filas: todas, pct }) {
  const filas = (todas || []).filter((f) => f.usa !== false); // las filas sin marcar «Usa» no van en la hoja
  const m = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = m.default || m;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Vinilo DTF", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 38 }, { width: 14 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 16 }];
  const amarillo = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  const fino = { style: "thin", color: { argb: "FF000000" } };
  const bordes = { top: fino, left: fino, bottom: fino, right: fino };
  ws.mergeCells("A1:H1");
  const t = ws.getCell("A1");
  t.value = tituloVinilo(ref, mes);
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = amarillo; t.border = bordes;
  const cab = ["PROCESO E INSUMO", "COSTO M.P", "PROMEDIO", "U", "COSTO X U", "BASE", "TOTAL", "CÓD. BUSINT"];
  cab.forEach((h, i) => {
    const c = ws.getRow(2).getCell(i + 1);
    c.value = h; c.font = { bold: true }; c.fill = amarillo; c.border = bordes;
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  const money = '"$"#,##0';
  (filas || []).forEach((f, i) => {
    const r = i + 3;
    const row = ws.getRow(r);
    row.getCell(1).value = f.nombre;
    if (f.tipo === "insumo") {
      row.getCell(2).value = num(f.costoMP);
      row.getCell(3).value = num(f.consumo);
      row.getCell(4).value = f.unidad || "";
      row.getCell(5).value = { formula: `B${r}*C${r}`, result: num(f.costoMP) * num(f.consumo) };
    } else {
      row.getCell(5).value = num(f.valor);
    }
    row.getCell(6).value = num(f.base);
    row.getCell(7).value = { formula: `E${r}+F${r}` };
    row.getCell(8).value = f.tipo === "insumo" ? (/^\d+$/.test(String(f.codigo || "")) ? Number(f.codigo) : f.codigo || "") : "";
    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.border = bordes;
      if (c === 2 || c >= 5) cell.numFmt = money;
      if (c === 3) cell.numFmt = "0.0000";
    }
  });
  const ini = 3;
  const fin = 2 + (filas || []).length;
  const rS = fin + 1; const rI = fin + 2; const rT = fin + 3;
  [[rS, "SUMA VINILO + DTF", { formula: `SUM(G${ini}:G${fin})` }],
    [rI, `IMPREVISTOS ${num(pct)}%`, { formula: `G${rS}*${num(pct) / 100}` }],
    [rT, "TOTAL", { formula: `G${rS}+G${rI}` }]].forEach(([r, et, valor]) => {
    ws.mergeCells(`A${r}:F${r}`);
    const a = ws.getCell(`A${r}`); a.value = et; a.font = { bold: true }; a.alignment = { horizontal: "right" }; a.fill = amarillo;
    const g = ws.getCell(`G${r}`); g.value = valor; g.numFmt = money; g.font = { bold: true }; g.fill = amarillo;
    for (let c = 1; c <= 7; c++) ws.getRow(r).getCell(c).border = bordes;
  });
  wb.calcProperties = { fullCalcOnLoad: true };
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Vinilo_DTF_${String(ref || "sin-ref").replace(/[^\w-]+/g, "_")}_${(mes || "").slice(0, 7)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ─── BASES REGISTRADAS (2026-10-16, a pedido de Fredy) ───────────────────────
// Registro del valor BASE de cada fila (y del valor de los procesos fijos) con
// vigencia: cada cambio es un registro nuevo {key, desde, valor, base, nota, por,
// creado}; nada se borra, así se sabe qué base regía en cada mes.
// Registro vigente de una fila en una fecha (aaaa-mm-dd): el de "desde" más reciente
// que no pase de esa fecha (si hay dos el mismo día, el último registrado).
export function baseVigente(registros, key, fechaISO) {
  return (registros || [])
    .filter((r) => r.key === key && String(r.desde || "") <= fechaISO)
    .sort((a, b) => String(b.desde).localeCompare(String(a.desde)) || String(b.creado || "").localeCompare(String(a.creado || "")))[0] || null;
}
// Llena BASE (y el valor de los procesos) de las filas con lo vigente en la fecha.
// "estandar" = valores guardados antes de existir este registro (solo procesos, si la fila no tiene registro).
export function aplicarBases(filas, registros, fechaISO, estandar) {
  return (filas || []).map((f) => {
    const r = baseVigente(registros, f.key, fechaISO);
    if (r) return { ...f, base: r.base ?? f.base, ...(f.tipo === "proceso" && r.valor != null ? { valor: r.valor } : {}) };
    const e = f.tipo === "proceso" ? (estandar || []).find((x) => x.key === f.key) : null;
    return e ? { ...f, valor: e.valor, base: e.base } : f;
  });
}
