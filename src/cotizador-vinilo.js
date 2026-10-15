// ─── MINICOTIZADOR DE VINILO / DTF ───────────────────────────────────────────
// (2026-10-15, a pedido de Fredy) Hoja corta "COTIZACIÓN DE VENTA {ref}
// ({mes}- {año})" para los aplique de vinilo / DTF. Cuatro filas salen de la
// ficha técnica de Busint (aplique DTF - Paper PET, aplique en ALTA,
// poliamida - Fast Dry y vinilo reflectivo); las otras (corte de vinilo,
// descartonado, espiga, bajada de vinilo) son procesos con valor fijo.
//   COSTO X U = COSTO M.P × CONSUMO   (en los procesos: el valor digitado)
//   TOTAL     = COSTO X U + BASE      (BASE = "lo que siempre va a costar hacerlo")
//   SUMA      = Σ TOTAL ;  IMPREVISTOS = SUMA × % ;  TOTAL FINAL = SUMA + IMPREVISTOS
import { num } from "./cotizador-calculo";

export const IMPREVISTOS_PCT = 10;

// Filas fijas, en el orden de la hoja de Fredy. "slot" = qué insumo de la
// ficha de Busint la alimenta (regex sobre el nombre del insumo).
export const FILAS_VINILO = [
  { key: "dtf", nombre: "APLIQUE DTF - PAPER PET", tipo: "insumo", slot: /dtf|paper\s*pet/i },
  { key: "alta", nombre: "APLIQUE EN ALTA", tipo: "insumo", slot: /\balta\b/i },
  { key: "poliamida", nombre: "POLIAMIDA - FAST DRY", tipo: "insumo", slot: /poliamida|fast\s?dry/i },
  { key: "corte", nombre: "CORTE VINILO", tipo: "proceso", valor: 103 },
  { key: "descartonado", nombre: "DESCARTONADO", tipo: "proceso", valor: 20 },
  { key: "espiga", nombre: "ESPIGA", tipo: "proceso", valor: 60 },
  { key: "bajada", nombre: "BAJADA DE VINILO", tipo: "proceso", valor: 360 },
  { key: "reflectivo", nombre: "CONS VINILO REFLECTIVO (CURVA)", tipo: "insumo", slot: /reflect/i },
];

export function filasViniloVacias() {
  return FILAS_VINILO.map((f) => ({
    key: f.key, nombre: f.nombre, tipo: f.tipo,
    costoMP: "", unidad: "", consumo: f.tipo === "insumo" ? "" : "",
    valor: f.tipo === "proceso" ? f.valor : "", base: 0, fuente: f.tipo === "proceso" ? "Valor fijo" : "",
  }));
}

export function calcularVinilo(filas, pct = IMPREVISTOS_PCT) {
  const detalle = (filas || []).map((f) => {
    const costoXU = f.tipo === "proceso" ? num(f.valor) : num(f.costoMP) * num(f.consumo);
    return { costoXU, total: costoXU + num(f.base) };
  });
  const suma = detalle.reduce((s, d) => s + d.total, 0);
  const imprevistos = suma * (num(pct) / 100);
  return { detalle, suma, imprevistos, total: suma + imprevistos };
}

// Reparte las filas de la ficha de Busint en las 4 filas de insumo. Si varias
// filas de la ficha caen en el mismo slot, se suman costo × cant (consumo 1) y
// el detalle queda en "fuente". Devuelve { filas, sinUbicar } (sinUbicar = filas
// de la ficha que no encajaron en ningún slot, para asignarlas a mano).
export function asignarFichaAVinilo(filasActuales, ficha) {
  const usadas = new Set();
  const nuevas = filasActuales.map((f) => {
    const def = FILAS_VINILO.find((d) => d.key === f.key);
    if (!def || !def.slot) return f;
    const coinciden = (ficha || []).filter((x) => def.slot.test(x.insumo || ""));
    if (!coinciden.length) return { ...f, fuente: "No está en la ficha de Busint — digítalo" };
    coinciden.forEach((x) => usadas.add(x.id));
    return aplicarFilasAFila(f, coinciden);
  });
  const sinUbicar = (ficha || []).filter((x) => !usadas.has(x.id));
  return { filas: nuevas, sinUbicar };
}

// Aplica una o varias filas de la ficha a una fila de la hoja.
export function aplicarFilasAFila(fila, coinciden) {
  if (coinciden.length === 1) {
    const x = coinciden[0];
    return {
      ...fila,
      costoMP: x.costo ?? "", unidad: x.unidad || "", consumo: x.cant,
      fuente: `Busint: ${x.insumo}${x.enMaestro ? "" : " (sin costo en el maestro)"}`,
    };
  }
  const costo = coinciden.reduce((s, x) => s + (Number(x.costo) || 0) * (Number(x.cant) || 0), 0);
  return {
    ...fila,
    costoMP: costo, unidad: "", consumo: 1,
    fuente: "Busint (suma): " + coinciden.map((x) => `${x.insumo} ${x.cant} × ${x.costo ?? "s/c"}`).join(" + "),
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
export async function descargarViniloExcel({ ref, mes, filas, pct }) {
  const m = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = m.default || m;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Vinilo DTF", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 38 }, { width: 14 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 12 }, { width: 14 }];
  const amarillo = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  const fino = { style: "thin", color: { argb: "FF000000" } };
  const bordes = { top: fino, left: fino, bottom: fino, right: fino };
  ws.mergeCells("A1:G1");
  const t = ws.getCell("A1");
  t.value = tituloVinilo(ref, mes);
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = amarillo; t.border = bordes;
  const cab = ["PROCESO E INSUMO", "COSTO M.P", "PROMEDIO", "U", "COSTO X U", "BASE", "TOTAL"];
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
    for (let c = 1; c <= 7; c++) {
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
