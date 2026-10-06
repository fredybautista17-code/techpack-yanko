// ─── COTIZADOR: DESCARGA A EXCEL (con fórmulas) ──────────────────────────────
// (2026-10-06, a pedido de Fredy) Genera un .xlsx con UNA HOJA POR VERSIÓN y
// una hoja "Resumen". Las hojas llevan las MISMAS fórmulas que calcula
// ATLAS (cotizador-calculo.js), escritas como fórmulas de Excel: si se cambia
// un precio, un consumo, un parámetro o el margen en el Excel, todo se
// recalcula solo. Los parámetros (tasas y costos fijos) van en las columnas
// I:J de cada hoja; los costos en A:G.
import { TASAS_BASE, ETIQUETAS_TASAS, FIJOS_BASE, ETIQUETAS_FIJOS, num } from "./cotizador-calculo";

const FMT_DINERO = "#,##0.00";
const FMT_ENTERO = "#,##0";
const FMT_PCT = "0.00%";

function nombreHojaUnico(base, usados) {
  let n = String(base || "Hoja").replace(/[:\\/?*[\]]/g, "-").slice(0, 28).trim() || "Hoja";
  let k = 2;
  let candidato = n;
  while (usados.has(candidato.toLowerCase())) { candidato = `${n.slice(0, 25)} (${k})`; k += 1; }
  usados.add(candidato.toLowerCase());
  return candidato;
}

function construirHoja(cot, ver) {
  const v = ver.v || {};
  const tasas = { ...TASAS_BASE, ...(v.tasas || {}) };
  const fijos = { ...FIJOS_BASE, ...(v.fijos || {}) };
  const ws = {};
  let maxRow = 1;
  const put = (col, row, valor, opts = {}) => {
    const cell = {};
    if (opts.f) { cell.t = "n"; cell.f = opts.f; }
    else if (typeof valor === "number") { cell.t = "n"; cell.v = valor; }
    else if (valor === "" || valor === null || valor === undefined) { cell.t = "z"; }
    else { cell.t = "s"; cell.v = String(valor); }
    if (opts.z) cell.z = opts.z;
    ws[col + row] = cell;
    if (row > maxRow) maxRow = row;
  };
  const titulo = (row, texto) => put("A", row, texto);

  // Encabezado
  put("A", 1, "COTIZACIÓN");
  put("A", 2, "Referencia"); put("B", 2, cot.referencia || "");
  put("A", 3, "Nombre"); put("B", 3, cot.nombre || "");
  put("A", 4, "Cliente"); put("B", 4, cot.cliente || "General");
  put("A", 5, "Versión"); put("B", 5, `V${ver.numero}`);
  put("A", 6, "Fecha"); put("B", 6, ver.fecha || "");
  put("A", 7, "Nota"); put("B", 7, ver.nota || "");

  // Parámetros: columnas I:J (posiciones fijas, para referenciarlos desde las fórmulas)
  put("I", 9, "PARÁMETROS (editables)");
  const filaTasa = {};
  Object.keys(ETIQUETAS_TASAS).forEach((k, i) => {
    const row = 10 + i;
    filaTasa[k] = row;
    put("I", row, ETIQUETAS_TASAS[k]);
    put("J", row, num(tasas[k]), { z: k === "baseUtilidad" ? "0.00000" : "0.00%" });
  });
  const filaFijosIni = 10 + Object.keys(ETIQUETAS_TASAS).length + 2;
  put("I", filaFijosIni - 1, "COSTOS FIJOS POR PRENDA ($)");
  const clavesFijos = Object.keys(ETIQUETAS_FIJOS);
  clavesFijos.forEach((k, i) => {
    put("I", filaFijosIni + i, ETIQUETAS_FIJOS[k]);
    put("J", filaFijosIni + i, num(fijos[k]), { z: FMT_DINERO });
  });
  const filaFijosTotal = filaFijosIni + clavesFijos.length;
  put("I", filaFijosTotal, "Total costos fijos");
  put("J", filaFijosTotal, null, { f: `SUM(J${filaFijosIni}:J${filaFijosTotal - 1})`, z: FMT_DINERO });
  const T = (k) => `$J$${filaTasa[k]}`;

  // 1 · TELAS
  let r = 9;
  titulo(r, "1 · TELAS"); r += 1;
  ["Material", "$ / kg", "Rend. m/kg", "Ancho", "Consumo m", "$ / m", "$ prenda"].forEach((h, i) => put("ABCDEFG"[i], r, h));
  r += 1;
  const telas = (v.telas && v.telas.length ? v.telas : [{}]);
  const t0 = r;
  telas.forEach((t) => {
    put("A", r, t.material || "");
    put("B", r, num(t.precioKg), { z: FMT_DINERO });
    put("C", r, num(t.rendimiento) || 1);
    put("D", r, num(t.ancho));
    put("E", r, num(t.consumo));
    put("F", r, null, { f: `IF(C${r}=0,B${r},B${r}/C${r})`, z: FMT_DINERO });
    put("G", r, null, { f: `E${r}*F${r}`, z: FMT_DINERO });
    r += 1;
  });
  const t1 = r - 1;
  put("A", r, "Total telas"); put("G", r, null, { f: `SUM(G${t0}:G${t1})`, z: FMT_DINERO });
  const filaTelas = r; r += 2;

  // 2 · INSUMOS
  titulo(r, "2 · INSUMOS (Imprevistos = SI en los de termofijación / vinilo / DTF)"); r += 1;
  ["Insumo", "Precio", "Consumo", "Imprevistos", "$ prenda"].forEach((h, i) => put("ABCDE"[i], r, h));
  r += 1;
  const insumos = (v.insumos && v.insumos.length ? v.insumos : [{}]);
  const i0 = r;
  insumos.forEach((it) => {
    put("A", r, it.nombre || "");
    put("B", r, num(it.precio), { z: FMT_DINERO });
    put("C", r, num(it.consumo));
    put("D", r, it.termo ? "SI" : "");
    put("E", r, null, { f: `B${r}*C${r}`, z: FMT_DINERO });
    r += 1;
  });
  const i1 = r - 1;
  put("A", r, "Total insumos"); put("E", r, null, { f: `SUM(E${i0}:E${i1})`, z: FMT_DINERO });
  const filaInsumos = r; r += 2;

  // 3 · PROCESOS
  titulo(r, "3 · PROCESOS (Imp. = SI entra en la base de imprevistos)"); r += 1;
  ["Proceso", "Valor / prenda", "Imp."].forEach((h, i) => put("ABC"[i], r, h));
  r += 1;
  const procesos = (v.procesos && v.procesos.length ? v.procesos : [{}]);
  const p0 = r;
  procesos.forEach((p) => {
    put("A", r, p.nombre || "");
    put("B", r, num(p.valor), { z: FMT_DINERO });
    put("C", r, p.imp ? "SI" : "");
    r += 1;
  });
  const p1 = r - 1;
  put("A", r, "Procesos"); put("B", r, null, { f: `SUM(B${p0}:B${p1})`, z: FMT_DINERO });
  const filaProcBase = r; r += 1;
  put("A", r, "Base de imprevistos"); put("B", r, null, { f: `SUMIF(D${i0}:D${i1},"SI",E${i0}:E${i1})+SUMIF(C${p0}:C${p1},"SI",B${p0}:B${p1})`, z: FMT_DINERO });
  const filaBaseImp = r; r += 1;
  put("A", r, "Imprevistos"); put("B", r, null, { f: `B${filaBaseImp}*${T("imprevistos")}`, z: FMT_DINERO });
  const filaImp = r; r += 1;
  put("A", r, "Total procesos"); put("B", r, null, { f: `B${filaProcBase}+B${filaImp}`, z: FMT_DINERO });
  const filaProcTotal = r; r += 2;

  // 4 · RESULTADOS
  titulo(r, "4 · COSTO Y PRECIO"); r += 1;
  const lin = (etiqueta, f, z = FMT_DINERO) => { put("A", r, etiqueta); put("B", r, null, { f, z }); const fila = r; r += 1; return fila; };
  const entrada = (etiqueta, valor, z) => { put("A", r, etiqueta + " (editable)"); put("B", r, valor, { z }); const fila = r; r += 1; return fila; };
  const cd = lin("Costo definitivo (telas + insumos + procesos)", `G${filaTelas}+E${filaInsumos}+B${filaProcTotal}`);
  const cmd = lin("Costo + daños de fabricación", `B${cd}*(1+${T("danos")})`);
  const ica = lin("ICA", `B${cmd}*${T("ica")}`);
  lin("Gastos bancarios", `B${cmd}*${T("bancarios")}`);
  lin("Retención en la fuente", `B${cmd}*${T("retencion")}`);
  lin("Autorenta", `B${cmd}*${T("autorenta")}`);
  const renta = lin("Renta", `B${cmd}*${T("renta")}`);
  const impTot = lin("Total impuestos y financieros", `SUM(B${ica}:B${renta})`);
  const fijosT = lin("Costos fijos", `J${filaFijosTotal}`);
  const total = lin("COSTO TOTAL SIN IVA", `B${cmd}+B${impTot}+B${fijosT}`);
  const pBase = lin("Precio tradicional sin IVA (costo ÷ base de utilidad)", `B${total}/${T("baseUtilidad")}`);
  const gSobre = lin("Gastos financieros calculados sobre el precio", `B${pBase}*(${T("ica")}+${T("bancarios")}+${T("renta")}+${T("retencion")}+${T("autorenta")})`);
  const ajuste = lin("Ajuste de gastos financieros", `B${gSobre}-B${impTot}`);
  const full = lin("COSTO FULL", `B${total}+B${ajuste}`);
  r += 1;
  const margen = entrada("% Margen esperado", num(v.margen), FMT_PCT);
  const sinIva = lin("PRECIO DE VENTA sin IVA", `IF(B${margen}<1,B${full}/(1-B${margen}),0)`);
  const conIva = lin("PRECIO DE VENTA con IVA", `B${sinIva}*(1+${T("iva")})`);
  const aplicar = lin("Precio que se aplica al prototipo / cápsula (con IVA)", `ROUND(B${conIva},0)`, FMT_ENTERO);
  const utilidad = lin("Utilidad por prenda", `B${sinIva}-B${full}`);
  if (typeof ver.excelPrecio === "number") {
    put("A", r, "Precio sin IVA del Excel original"); put("B", r, ver.excelPrecio, { z: FMT_DINERO }); r += 1;
  }
  r += 1;
  titulo(r, "OTROS ESCENARIOS"); r += 1;
  const pcli = entrada("Si el cliente ofrece (con IVA)", num(v.precioClienteIva) || "", FMT_DINERO);
  lin("   Utilidad con ese precio", `IF(B${pcli}>0,B${pcli}/(1+${T("iva")})-B${full},"")`);
  lin("   Margen con ese precio", `IF(B${pcli}>0,(B${pcli}/(1+${T("iva")})-B${full})/(B${pcli}/(1+${T("iva")})),"")`, FMT_PCT);
  r += 1;
  const ufija = entrada("Utilidad fija por prenda ($)", num(v.utilidadFija), FMT_DINERO);
  const pFijo = lin("   Precio sin IVA con utilidad fija", `B${full}+B${ufija}`);
  lin("   Precio con IVA con utilidad fija", `B${pFijo}*(1+${T("iva")})`);

  ws["!ref"] = `A1:J${Math.max(maxRow, filaFijosTotal)}`;
  ws["!cols"] = [{ wch: 52 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 3 }, { wch: 34 }, { wch: 14 }];
  return { ws, refs: { sinIva, conIva, full, utilidad, aplicar } };
}

// lista = arreglo de cotizaciones (con .versiones). Descarga un solo .xlsx.
export async function descargarCotizacionesExcel(lista, nombreArchivo) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const usados = new Set(["resumen"]);
  const filas = [];
  const hojas = [];
  (lista || []).forEach((cot) => {
    (cot.versiones || []).forEach((ver) => {
      const base = lista.length === 1 ? `V${ver.numero}` : `${cot.referencia || "cot"} V${ver.numero}`;
      const nombre = nombreHojaUnico(base, usados);
      const { ws, refs } = construirHoja(cot, ver);
      hojas.push([nombre, ws]);
      filas.push({ cot, ver, nombre, refs });
    });
  });
  // Hoja Resumen (primero), con fórmulas que apuntan a cada versión.
  const rs = {};
  const enc = ["Referencia", "Cliente", "Versión", "Fecha", "Nota", "Costo FULL", "Precio sin IVA", "Precio con IVA", "Precio a aplicar", "Utilidad por prenda"];
  enc.forEach((h, i) => { rs[XLSX.utils.encode_cell({ r: 0, c: i })] = { t: "s", v: h }; });
  filas.forEach((f, i) => {
    const row = i + 2;
    const q = `'${f.nombre.replace(/'/g, "''")}'!`;
    const txt = (c, valor) => { rs[c + row] = valor === "" ? { t: "z" } : { t: "s", v: String(valor) }; };
    txt("A", f.cot.referencia || ""); txt("B", f.cot.cliente || "General"); txt("C", `V${f.ver.numero}`); txt("D", f.ver.fecha || ""); txt("E", f.ver.nota || "");
    const fm = (c, celda, z) => { rs[c + row] = { t: "n", f: `${q}B${celda}`, z }; };
    fm("F", f.refs.full, FMT_DINERO); fm("G", f.refs.sinIva, FMT_DINERO); fm("H", f.refs.conIva, FMT_DINERO); fm("I", f.refs.aplicar, FMT_ENTERO); fm("J", f.refs.utilidad, FMT_DINERO);
  });
  rs["!ref"] = `A1:J${Math.max(filas.length + 1, 2)}`;
  rs["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 9 }, { wch: 12 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, rs, "Resumen");
  hojas.forEach(([nombre, ws]) => XLSX.utils.book_append_sheet(wb, ws, nombre));
  XLSX.writeFile(wb, nombreArchivo || "Cotizaciones.xlsx");
}
