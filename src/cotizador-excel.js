// ─── COTIZADOR: DESCARGA A EXCEL CON EL FORMATO DE LA HOJA DE FREDY ──────────
// (2026-10-06, a pedido de Fredy) Llena la MISMA hoja de costos que él usa
// ("975093 ULTACT 30.09.2026.xlsx", hoja V3) con los datos de cada versión de
// la cotización: mismo diseño, colores, cuadros de "Gestión de precios" y
// fórmulas. Una hoja por versión (V1, V2, V3...) más una hoja "Resumen".
// La plantilla vive en public/plantilla-cotizacion.xlsx (su hoja V3 sin los
// datos de la referencia 975093 ni sus fotos). Las tasas (ICA, retención...)
// en su hoja están escritas DENTRO de las fórmulas, así que aquí se reescriben
// esas fórmulas con las tasas de la versión (ficha del cliente).
import { TASAS_BASE, FIJOS_BASE, num } from "./cotizador-calculo";

// Posiciones de la hoja de Fredy (las mismas que lee el importador).
const FILAS_TELA = [6, 7, 8, 9]; // consumo de cada tela: fila + 5
const FILAS_INSUMOS = Array.from({ length: 20 }, (_, i) => 19 + i); // 19..38
const FILAS_PROCESOS = [42, 43, 44, 45, 46, 47, 48, 49, 50, 52, 53, 54, 55]; // la 51 es "10% termo imprevistos"
const FILAS_FIJOS = { bodega: 67, diseno: 68, administrativa: 69, termofijacion: 70, empaque: 71, transporte: 72, servicios: 73 };

function aFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
function nombreHojaUnico(base, usados) {
  const n = String(base || "Hoja").replace(/[:\\/?*[\]]/g, "-").slice(0, 28).trim() || "Hoja";
  let candidato = n;
  let k = 2;
  while (usados.has(candidato.toLowerCase())) { candidato = `${n.slice(0, 24)} (${k})`; k += 1; }
  usados.add(candidato.toLowerCase());
  return candidato;
}

// Llena una hoja (copia de la plantilla) con una versión. Devuelve avisos.
function llenarHoja(ws, cot, ver) {
  const avisos = [];
  const v = ver.v || {};
  const tasas = { ...TASAS_BASE, ...(v.tasas || {}) };
  const fijos = { ...FIJOS_BASE, ...(v.fijos || {}) };
  const t = (k) => num(tasas[k]);
  const val = (addr, valor) => { ws.getCell(addr).value = valor; };
  const fx = (addr, formula) => { ws.getCell(addr).value = { formula }; };
  const limpiar = (col, ini, fin) => { for (let r = ini; r <= fin; r++) ws.getCell(col + r).value = null; };

  // Encabezado
  val("B1", aFecha(ver.fecha));
  const ref = String(cot.referencia || "").trim();
  val("D2", /^\d+$/.test(ref) ? Number(ref) : ref);
  val("C3", `Cliente: ${cot.cliente || "General"} · Versión V${ver.numero}${cot.nombre ? " · " + cot.nombre : ""}`);

  // Telas (filas 6-9) y su consumo (filas 11-14)
  ["B", "C", "D", "E", "G", "J", "K", "L", "M", "N", "O", "P", "Q", "R"].forEach((c) => limpiar(c, 6, 9));
  limpiar("D", 11, 14); limpiar("G", 11, 14);
  const telas = (v.telas || []).filter((x) => x.material || num(x.precioKg) || num(x.consumo));
  if (telas.length > FILAS_TELA.length) avisos.push(`La plantilla solo tiene ${FILAS_TELA.length} filas de tela: se incluyeron las primeras ${FILAS_TELA.length}.`);
  telas.slice(0, FILAS_TELA.length).forEach((tela, i) => {
    const r = FILAS_TELA[i]; const k = r + 5;
    val(`C${r}`, tela.material || "");
    val(`D${r}`, num(tela.precioKg));
    val(`E${r}`, num(tela.rendimiento) || 1);
    fx(`F${r}`, `D${r}/E${r}`);
    if (num(tela.ancho)) val(`G${r}`, num(tela.ancho));
    fx(`B${k}`, `IF(B${r}="","",B${r})`); fx(`C${k}`, `C${r}`);
    val(`D${k}`, num(tela.consumo));
    fx(`E${k}`, `D${k}*G${r}`);
    fx(`F${k}`, `D${k}*F${r}`);
    fx(`H${k}`, `F${k}/$D$74`); fx(`I${k}`, `F${k}/$D$74`);
  });
  fx("F15", "SUM(F11:F14)");

  // Insumos (filas 19-38)
  ["B", "C", "D", "E", "J", "K", "L", "M", "N", "O", "P", "Q", "R"].forEach((c) => limpiar(c, 19, 38));
  const insumos = v.insumos || [];
  if (insumos.length > FILAS_INSUMOS.length) avisos.push(`La plantilla solo tiene ${FILAS_INSUMOS.length} filas de insumos: se incluyeron los primeros ${FILAS_INSUMOS.length}.`);
  const filasTermo = [];
  FILAS_INSUMOS.forEach((r, i) => {
    const it = insumos[i];
    if (it) {
      val(`B${r}`, it.codigo ? String(it.codigo) : null);
      val(`C${r}`, it.nombre || "");
      val(`D${r}`, num(it.precio));
      val(`E${r}`, num(it.consumo));
      if (it.termo) filasTermo.push(r);
    }
    fx(`F${r}`, `D${r}*E${r}`);
    fx(`H${r}`, `F${r}/$F$59`); fx(`I${r}`, `F${r}/$D$74`);
  });
  fx("F39", "SUM(F19:F38)");

  // Procesos (filas 42-55, la 51 es el 10% de imprevistos)
  FILAS_PROCESOS.forEach((r) => { val(`C${r}`, null); val(`F${r}`, null); });
  const procesos = (v.procesos || []).filter((p) => p.nombre || num(p.valor));
  if (procesos.length > FILAS_PROCESOS.length) avisos.push(`La plantilla solo tiene ${FILAS_PROCESOS.length} filas de procesos: se incluyeron los primeros ${FILAS_PROCESOS.length}.`);
  const filasImp = [];
  procesos.slice(0, FILAS_PROCESOS.length).forEach((p, i) => {
    const r = FILAS_PROCESOS[i];
    val(`C${r}`, p.nombre || "");
    val(`F${r}`, num(p.valor));
    if (p.imp) filasImp.push(r);
  });
  FILAS_PROCESOS.concat([51]).forEach((r) => { fx(`H${r}`, `F${r}/$F$59`); fx(`I${r}`, `F${r}/$D$74`); });
  val("C51", `${Math.round(t("imprevistos") * 10000) / 100}% termo imprevistos`);
  const baseImp = filasTermo.concat(filasImp).map((r) => `F${r}`);
  fx("F51", baseImp.length ? `(${baseImp.join("+")})*${t("imprevistos")}` : "0");
  fx("F56", "SUM(F42:F55)");

  // Impuestos y administrativos (las tasas van dentro de las fórmulas de su hoja)
  fx("F59", "F15+F39+F56");
  fx("F60", `(F59*${t("danos")})+F59`);
  fx("F61", `F60*${t("ica")}`);
  fx("F62", `F60*${t("bancarios")}`);
  fx("F63", `F60*${t("retencion")}`);
  fx("F64", `F60*${t("autorenta")}`);
  fx("F65", `F60*${t("renta")}`);
  Object.entries(FILAS_FIJOS).forEach(([k, r]) => val(`F${r}`, num(fijos[k])));
  fx("D74", "SUM(F60:F65)+SUM(F67:F73)");
  val("F76", t("baseUtilidad"));
  fx("F79", `+F78*${t("iva")}`);
  const iva = 1 + t("iva");

  // Gastos financieros sobre el precio (N87:N91, Q92)
  fx("N87", `$F$78*${t("ica")}`);
  fx("N88", `$F$78*${t("bancarios")}`);
  fx("N89", `$F$78*${t("renta")}`);
  fx("N90", `+F78*${t("retencion")}`);
  fx("N91", `+F78*${t("autorenta")}`);

  // Escenarios: K = margen esperado · N = precio que ofrece el cliente · Q = utilidad fija
  val("K76", num(v.margen));
  fx("K75", `K73*${iva}`);
  const pCli = num(v.precioClienteIva);
  fx("N73", pCli > 0 ? `${pCli}/${iva}` : "0");
  fx("N62", "IF(N73>0,N61-N60,0)");
  fx("N63", "IF(N61>0,N62/N61,0)");
  fx("N74", "IF(N73>0,N73-N72,0)");
  fx("N75", `N73*${iva}`);
  fx("N76", "IF(N73>0,N74/N73,0)");
  fx("N80", "IF(N73>0,1-((N73-D74)/N73),0)");
  val("Q74", num(v.utilidadFija));
  fx("Q75", `Q73*${iva}`);
  // Quita los resultados guardados de la plantilla (son de OTRA referencia):
  // así Excel recalcula todo con los datos nuevos al abrir el archivo.
  ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
    const f = cell.formula;
    if (f) cell.value = { formula: f };
  }));
  return avisos;
}

// Arma el libro. ExcelJS y la plantilla se pasan de afuera para poder probarlo.
export async function generarLibroCotizaciones(ExcelJS, plantilla, lista, opciones = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(plantilla);
  const molde = wb.worksheets[0];
  const modelo = molde.model;
  const rs = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 1 }] }); // primera hoja; se llena al final
  const usados = new Set(["resumen"]);
  const avisos = [];
  const hojas = [];
  (lista || []).forEach((cot) => (cot.versiones || []).filter((ver) => !opciones.soloAprobadas || ver.estado === "aprobada").forEach((ver) => {
    const esDef = opciones.definitivaNumero === ver.numero;
    const base = lista.length === 1 ? `V${ver.numero}${esDef ? " DEFINITIVA" : ""}` : `${cot.referencia || "cot"} V${ver.numero}`;
    const nombre = nombreHojaUnico(base, usados);
    const ws = wb.addWorksheet(nombre);
    ws.model = Object.assign(structuredClone(modelo), { mergeCells: modelo.merges, name: nombre });
    const av = llenarHoja(ws, cot, ver);
    av.forEach((a) => { if (!avisos.includes(a)) avisos.push(a); });
    // Línea de encabezado: versión, fecha de aprobación y carpeta de Dropbox donde queda guardada.
    const leyenda = opciones.leyenda ? opciones.leyenda(cot, ver, esDef) : "";
    if (leyenda) {
      const c = ws.getCell("D1");
      c.value = leyenda;
      c.font = { bold: true, size: 12, color: { argb: esDef ? "FF14532D" : "FF1E3A5F" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: esDef ? "FFD1FAE5" : "FFE0ECF8" } };
      c.alignment = { vertical: "middle", horizontal: "left" };
      ws.properties = { ...(ws.properties || {}), tabColor: { argb: esDef ? "FF2D9E6B" : "FF2B5C8A" } };
    }
    if (opciones.imagen && cot === opciones.imagen.cot) {
      const idImg = wb.addImage({ base64: opciones.imagen.base64, extension: opciones.imagen.extension });
      const w = 560;
      ws.addImage(idImg, { tl: { col: 13.1, row: 0.5 }, ext: { width: w, height: Math.round(w * (opciones.imagen.alto / opciones.imagen.ancho)) } });
    }
    hojas.push({ cot, ver, nombre });
  }));
  wb.removeWorksheet(molde.id);

  // Hoja Resumen (primera): una fila por versión, con fórmulas hacia cada hoja.
  rs.columns = [
    { header: "Referencia", width: 14 }, { header: "Cliente", width: 18 }, { header: "Versión", width: 9 }, { header: "Fecha", width: 12 },
    { header: "Nota", width: 40 }, { header: "Costo FULL", width: 15 }, { header: "Precio sin IVA", width: 16 },
    { header: "Precio con IVA", width: 16 }, { header: "Precio a aplicar", width: 17 }, { header: "Utilidad por prenda", width: 19 },
  ];
  const cab = rs.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
  hojas.forEach((h, i) => {
    const r = i + 2;
    const q = `'${h.nombre.replace(/'/g, "''")}'!`;
    rs.getCell(`A${r}`).value = h.cot.referencia || "";
    rs.getCell(`B${r}`).value = h.cot.cliente || "General";
    rs.getCell(`C${r}`).value = `V${h.ver.numero}`;
    rs.getCell(`D${r}`).value = aFecha(h.ver.fecha);
    rs.getCell(`D${r}`).numFmt = "dd/mm/yyyy";
    rs.getCell(`E${r}`).value = h.ver.nota || "";
    [["F", "K72"], ["G", "K73"], ["H", "K75"], ["I", "ROUND(" + q + "K75,0)"], ["J", "K74"]].forEach(([c, ref2]) => {
      rs.getCell(`${c}${r}`).value = { formula: c === "I" ? ref2 : q + ref2 };
      rs.getCell(`${c}${r}`).numFmt = "$#,##0";
    });
  });
  wb.calcProperties = { fullCalcOnLoad: true };
  return { wb, avisos };
}

function medirImagen(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ ancho: img.naturalWidth || 1, alto: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Arma el libro (con la plantilla del servidor y la foto opcional) y devuelve el buffer del .xlsx.
async function construirExcelCotizaciones(lista, imagenDataUrl, opcionesLibro = {}) {
  const m = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = m.default || m;
  const resp = await fetch(`${process.env.PUBLIC_URL || ""}/plantilla-cotizacion.xlsx`);
  if (!resp.ok) throw new Error("No se encontró la plantilla de cotización en el servidor");
  const plantilla = await resp.arrayBuffer();
  let imagen = null;
  if (imagenDataUrl && lista.length === 1) {
    const mt = /^data:image\/(png|jpeg|jpg|gif);base64,/i.exec(imagenDataUrl);
    const medidas = mt ? await medirImagen(imagenDataUrl) : null;
    if (mt && medidas) imagen = { cot: lista[0], base64: imagenDataUrl, extension: mt[1].toLowerCase() === "png" ? "png" : mt[1].toLowerCase() === "gif" ? "gif" : "jpeg", ...medidas };
  }
  const { wb, avisos } = await generarLibroCotizaciones(ExcelJS, plantilla, lista, { ...opcionesLibro, imagen });
  return { buf: await wb.xlsx.writeBuffer(), avisos };
}

// lista = cotizaciones (con .versiones). opciones.imagen = data URL de la foto
// del prototipo / referencia vinculada (solo para lista de una sola cotización).
export async function descargarCotizacionesExcel(lista, nombreArchivo, opciones = {}) {
  const { buf, avisos } = await construirExcelCotizaciones(lista, opciones.imagen);
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo || "Cotizaciones.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return avisos;
}

// ─── Libro de Dropbox: UNA hoja por cada versión aprobada ────────────────────
// (2026-10-16, a pedido de Fredy) En Dropbox queda un solo libro por referencia ("807.xlsx") con una
// hoja por versión aprobada (V1, V2...). Se arma completo desde lo guardado en ATLAS cada vez que se
// aprueba, así que no hace falta bajar el archivo anterior de Dropbox.
export const CARPETA_DISENO = "COTIZACION DE DISEÑO";
export const CARPETA_DEFINITIVA = "COTIZACIONES APROBADAS";

// dd/mm/aaaa en hora de Colombia a partir de un texto ISO (con o sin hora).
export function fechaColombia(iso) {
  const t = String(iso || "");
  if (!t) return "";
  let ymd = t.slice(0, 10);
  if (t.length > 10) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

// opcionesDef = { numero, lote, fecha } cuando es el libro de "Dado por Cumplido"; sin él es el de DISEÑO.
export function leyendaCotizacion(ver, opcionesDef) {
  const aprobada = fechaColombia(ver.decision?.fecha || ver.fecha);
  if (!opcionesDef) return `V${ver.numero} · Aprobada ${aprobada} · Guardada en: ${CARPETA_DISENO}`;
  if (ver.numero === opcionesDef.numero) {
    return `DEFINITIVA · V${ver.numero} · Dado por cumplido ${fechaColombia(opcionesDef.fecha)}${opcionesDef.lote ? ` · LOTE ${opcionesDef.lote}` : ""} · Guardada en: ${CARPETA_DEFINITIVA}`;
  }
  return `V${ver.numero} · Aprobada ${aprobada} · Versión anterior (no es la definitiva) · Guardada en: ${CARPETA_DEFINITIVA}`;
}

// Libro en base64 con las versiones aprobadas de una cotización. opcionesDef: ver leyendaCotizacion.
export async function excelLibroBase64(cot, imagenDataUrl, opcionesDef) {
  if (!(cot.versiones || []).some((v) => v.estado === "aprobada")) throw new Error("La cotización no tiene versiones aprobadas");
  const { buf } = await construirExcelCotizaciones([cot], imagenDataUrl, {
    soloAprobadas: true,
    definitivaNumero: opcionesDef ? opcionesDef.numero : null,
    leyenda: (c, ver) => leyendaCotizacion(ver, opcionesDef),
  });
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("No se pudo leer el Excel generado"));
    fr.readAsDataURL(new Blob([buf]));
  });
  return String(dataUrl).split(",")[1] || "";
}

// Nombre del libro (sin .xlsx): el mismo que ya se usó en DISEÑO si existe, si no la referencia.
export function nombreLibroDropbox(cot, referenciaAlternativa) {
  for (const v of cot.versiones || []) {
    const base = String(v.dropbox?.ruta || "").split("/").pop().replace(/\.xlsx$/i, "");
    if (base && !/ V\d+ \d{4}-\d{2}-\d{2}$/.test(base)) return base;
  }
  return String(referenciaAlternativa || "").trim();
}
