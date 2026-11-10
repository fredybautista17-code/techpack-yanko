// (2026-11-10, a pedido de Fredy) Nómina → Dropbox. Arma el Excel mensual de cada tipo de nómina (Fiscal, Fiscal Destajo, Destajo)
// con una hoja por quincena + una hoja «Resumen» con los totales del mes. Funciones puras (no tocan Firestore ni Dropbox):
// la función de index.js lee las liquidaciones, llama a estas y sube el archivo.
// Reglas: solo valores numéricos (sin fórmulas), NUNCA cédulas ni cuentas bancarias — solo nombre y valores de la liquidación.

const RAIZ_FISCAL = "/NOMINA FISCAL";
const RAIZ_DESTAJO = "/NOMINA DESTAJO GENERAL";

// Cada columna: h = encabezado, v = (liquidación) → valor, tot = se suma en el TOTAL y en el Resumen, fmt = formato numérico.
const MONEDA = "#,##0";
const num = (k) => (l) => Number(l[k]) || 0;
const COL_DIAS_INJUST = { h: "Días sin justificar", v: (l) => Number(l.diasInasistencia) || 0, fmt: "0" };
const COL_DIAS_TRAB = { h: "Días trabajados", v: (l) => (l.diasTrabajados == null ? "" : Number(l.diasTrabajados) || 0), fmt: "0" };
const COL_CONFIRMADA = {
  h: "Confirmada",
  v: (l) => {
    if (!l.confirmadaEn) return "";
    const d = new Date(l.confirmadaEn);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-CO", { timeZone: "America/Bogota" });
  },
};
const prov = [
  { h: "Cesantías (prov.)", v: num("cesantiasPeriodo"), tot: true, fmt: MONEDA },
  { h: "Intereses cesantías", v: num("interesesPeriodo"), tot: true, fmt: MONEDA },
  { h: "Prima (prov.)", v: num("primaPeriodo"), tot: true, fmt: MONEDA },
  { h: "Vacaciones (prov.)", v: num("vacacionesPeriodo"), tot: true, fmt: MONEDA },
];

const TIPOS = {
  fiscal: {
    titulo: "NÓMINA FISCAL",
    coleccion: "nomina_fiscal_liquidaciones",
    raiz: RAIZ_FISCAL,
    prefijoArchivo: "NOMINA FISCAL",
    columnas: [
      { h: "Nombre", v: (l) => l.nombre || "" },
      COL_DIAS_INJUST, COL_DIAS_TRAB,
      { h: "Sueldo quincena", v: num("sueldoQuincena"), tot: true, fmt: MONEDA },
      { h: "Auxilio quincena", v: num("auxilioQuincena"), tot: true, fmt: MONEDA },
      { h: "EPS trab.", v: num("epsTrabajador"), tot: true, fmt: MONEDA },
      { h: "Pensión trab.", v: num("pensionTrabajador"), tot: true, fmt: MONEDA },
      { h: "Descuento cobros Bodega", v: num("descuentoCobros"), tot: true, fmt: MONEDA },
      { h: "Neto a pagar", v: num("netoAPagar"), tot: true, fmt: MONEDA },
      { h: "Pensión empresa", v: num("pensionEmpleador"), tot: true, fmt: MONEDA },
      { h: "ARL empresa", v: num("arlEmpleador"), tot: true, fmt: MONEDA },
      { h: "Caja Comp.", v: num("cajaCompensacionEmpleador"), tot: true, fmt: MONEDA },
      ...prov, COL_CONFIRMADA,
    ],
  },
  fiscalDestajo: {
    titulo: "NÓMINA FISCAL DESTAJO",
    coleccion: "nomina_fiscal_destajo_liquidaciones",
    raiz: RAIZ_DESTAJO,
    prefijoArchivo: "FISCAL DESTAJO",
    columnas: [
      { h: "Nombre", v: (l) => l.nombre || "" },
      COL_DIAS_INJUST, COL_DIAS_TRAB,
      { h: "Sueldo quincena", v: num("sueldoQuincena"), tot: true, fmt: MONEDA },
      { h: "Auxilio quincena", v: num("auxilioQuincena"), tot: true, fmt: MONEDA },
      { h: "Descuento cobros Bodega", v: num("descuentoCobros"), tot: true, fmt: MONEDA },
      { h: "Neto a pagar", v: num("netoAPagar"), tot: true, fmt: MONEDA },
      ...prov, COL_CONFIRMADA,
    ],
  },
  destajo: {
    titulo: "NÓMINA DESTAJO",
    coleccion: "nomina_destajo_liquidaciones",
    raiz: RAIZ_DESTAJO,
    prefijoArchivo: "DESTAJO",
    columnas: [
      { h: "Nombre", v: (l) => l.nombre || "" },
      COL_DIAS_INJUST, COL_DIAS_TRAB,
      { h: "Descuento cobros Bodega", v: num("descuentoCobros"), tot: true, fmt: MONEDA },
      { h: "Neto a pagar (producción)", v: num("netoAPagar"), tot: true, fmt: MONEDA },
      ...prov, COL_CONFIRMADA,
    ],
  },
};

const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// «2026-10» válido (mes 01-12).
const esMesValido = (m) => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
// De «2026-10-Q2» (o «2026-10») saca «2026-10»; si no es válido devuelve "".
const mesDePeriodo = (periodoId) => {
  const m = String(periodoId || "").slice(0, 7);
  return esMesValido(m) ? m : "";
};
const nombreMes = (mes) => `${MESES_ES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

// Ruta en Dropbox: /NOMINA FISCAL/2026/NOMINA FISCAL 2026-10.xlsx
function rutaDropbox(tipo, mes) {
  const t = TIPOS[tipo];
  if (!t || !esMesValido(mes)) throw new Error(`Tipo o mes no válido: ${tipo} / ${mes}`);
  return `${t.raiz}/${mes.slice(0, 4)}/${t.prefijoArchivo} ${mes}.xlsx`;
}

const ordenarLiq = (a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
const sumaCol = (col, filas) => filas.reduce((s, l) => s + (Number(col.v(l)) || 0), 0);

// Estilos mínimos y sobrios: encabezado en negrita con fondo gris claro, fila TOTAL en negrita con borde superior.
function estilarHoja(ws, nColumnas, filaEncabezado, filaTotal) {
  const enc = ws.getRow(filaEncabezado);
  enc.font = { bold: true };
  enc.alignment = { vertical: "middle", wrapText: true };
  for (let c = 1; c <= nColumnas; c++) enc.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF1" } };
  if (filaTotal) {
    const tot = ws.getRow(filaTotal);
    tot.font = { bold: true };
    for (let c = 1; c <= nColumnas; c++) tot.getCell(c).border = { top: { style: "thin" } };
  }
  ws.views = [{ state: "frozen", ySplit: filaEncabezado }];
}

// ExcelJS se pasa por parámetro (así este módulo no depende de cómo se importe). liquidaciones = todas las del mes (cualquier quincena).
function construirLibro(ExcelJS, tipo, mes, liquidaciones) {
  const t = TIPOS[tipo];
  if (!t) throw new Error(`Tipo de nómina desconocido: ${tipo}`);
  const wb = new ExcelJS.Workbook();
  wb.creator = "ATLAS";
  wb.created = new Date();
  const cols = t.columnas;
  const quincenas = ["Q1", "Q2"];

  // ── Hoja Resumen: una fila por quincena + TOTAL DEL MES ──
  const resumen = wb.addWorksheet("Resumen");
  resumen.addRow([`${t.titulo} — ${nombreMes(mes).toUpperCase()}`]);
  resumen.getRow(1).font = { bold: true, size: 13 };
  resumen.addRow([]);
  const colsTot = cols.filter((c) => c.tot);
  resumen.addRow(["Quincena", "Trabajadores", ...colsTot.map((c) => c.h)]);
  const filasResumen = [];
  quincenas.forEach((q) => {
    const delQ = liquidaciones.filter((l) => String(l.periodoId || "").endsWith(`-${q}`));
    if (!delQ.length) return;
    filasResumen.push(delQ);
    resumen.addRow([`${mes}-${q}`, delQ.length, ...colsTot.map((c) => sumaCol(c, delQ))]);
  });
  const todas = filasResumen.flat();
  resumen.addRow(["TOTAL DEL MES", todas.length, ...colsTot.map((c) => sumaCol(c, todas))]);
  const nFilaTotalRes = resumen.rowCount;
  estilarHoja(resumen, 2 + colsTot.length, 3, nFilaTotalRes);
  colsTot.forEach((c, i) => { resumen.getColumn(3 + i).numFmt = c.fmt || MONEDA; });
  resumen.getColumn(1).width = 18;
  resumen.getColumn(2).width = 14;
  for (let i = 0; i < colsTot.length; i++) resumen.getColumn(3 + i).width = 17;

  // ── Una hoja por quincena ──
  quincenas.forEach((q) => {
    const delQ = liquidaciones.filter((l) => String(l.periodoId || "").endsWith(`-${q}`)).sort(ordenarLiq);
    if (!delQ.length) return;
    const ws = wb.addWorksheet(`Quincena ${q.slice(1)}`);
    ws.addRow([`${t.titulo} — QUINCENA ${mes}-${q}`]);
    ws.getRow(1).font = { bold: true, size: 13 };
    ws.addRow([]);
    ws.addRow(cols.map((c) => c.h));
    delQ.forEach((l) => ws.addRow(cols.map((c) => c.v(l))));
    ws.addRow([]);
    ws.addRow(cols.map((c, i) => (i === 0 ? "TOTAL" : c.tot ? sumaCol(c, delQ) : "")));
    estilarHoja(ws, cols.length, 3, ws.rowCount);
    cols.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.fmt) col.numFmt = c.fmt;
      col.width = i === 0 ? 34 : c.h === "Confirmada" ? 20 : Math.max(14, Math.min(22, c.h.length + 3));
    });
  });
  return wb;
}

module.exports = { TIPOS, esMesValido, mesDePeriodo, nombreMes, rutaDropbox, construirLibro };
