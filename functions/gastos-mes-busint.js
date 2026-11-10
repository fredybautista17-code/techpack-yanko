"use strict";
// ─── GASTOS DEL MES DESDE BUSINT (Tablero de Costos → «¿Cubro mis costos?» → Gastos del mes → «Traer de Busint») ─────────────
// (2026-11-10, a pedido de Fredy) Las compras por CONCEPTO (CodConcep, Concepto, Fechaini, Vbruto) que hoy se importan desde un Excel de
// Busint se leen directo de la API. No se sabe en qué tabla viven, así que se buscan: de la lista de tablas de la API se toman las que
// parecen de compras/entradas, se mira una muestra de cada una y se queda con la primera que trae concepto + fecha + valor bruto.
// Funciones puras (sin Firestore ni red) para poder probarlas.

const claveCol = (k) => String(k || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Detecta las columnas por nombre (sin importar mayúsculas, guiones ni espacios). Devuelve null en las que no encuentra.
function detectarColumnas(keys) {
  const ks = (keys || []).map((k) => ({ k, n: claveCol(k) }));
  const buscar = (...res) => {
    for (const re of res) {
      const m = ks.find((x) => re.test(x.n));
      if (m) return m.k;
    }
    return null;
  };
  return {
    codConcep: buscar(/^codconcep/, /^codigoconcep/, /^concepcod/),
    concepto: buscar(/^concepto$/, /^nombreconcep/, /^descconcep/, /^desconcep/, /^concepto/),
    fecha: buscar(/^fechaini$/, /^fecha$/, /^fechafac/, /^fechaemis/, /^fecha(?!fin|vcto|venc)/),
    valor: buscar(/^vbruto$/, /^valorbruto/, /^vlrbruto/),
    proveedorCodigo: buscar(/^codprov/, /^codigoprov/, /^codtercero/, /^nit$/, /^codigo$/, /^proveedor$/, /^tercero$/),
    proveedorNombre: buscar(/^nombreprov/, /^razonsocial/, /^nomprov/, /^nombretercero/, /^nombre$/),
  };
}

// Una tabla sirve si trae código de concepto, fecha y valor bruto.
function esTablaCompras(keys) {
  const c = detectarColumnas(keys);
  return !!(c.codConcep && c.fecha && c.valor);
}

// De la lista de tablas de la API, las que vale la pena mirar (las de compras primero).
function candidatosTablasCompras(nombres, max = 40) {
  const puntaje = (t) => {
    const n = String(t).toLowerCase();
    if (/compra/.test(n)) return 0;
    if (/entrada/.test(n)) return 1;
    if (/gasto|egreso|causa/.test(n)) return 2;
    if (/factur|cxp|contab/.test(n)) return 3;
    if (/movim/.test(n)) return 4;
    return null;
  };
  return (nombres || [])
    .map((t) => ({ t, p: puntaje(t) }))
    .filter((x) => x.p !== null)
    .sort((a, b) => a.p - b.p || String(a.t).localeCompare(String(b.t)))
    .slice(0, max)
    .map((x) => x.t);
}

// De las muestras [{tabla, keys}] elige la primera (en el orden recibido) que sirve.
function elegirTablaCompras(muestras) {
  for (const m of muestras || []) {
    if (esTablaCompras(m.keys)) return { tabla: m.tabla, cols: detectarColumnas(m.keys) };
  }
  return null;
}

// Fecha de Busint → "AAAA-MM-DD". Acepta el objeto {isValidDateTime, year, month, day}, un texto ISO o una Date.
function fechaAISO(v) {
  if (!v) return null;
  const dos = (n) => String(n).padStart(2, "0");
  if (typeof v === "object" && !(v instanceof Date)) {
    if (!v.isValidDateTime) return null;
    return `${v.year}-${dos(v.month || 1)}-${dos(v.day || 1)}`;
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let t = String(v ?? "").replace(/[^0-9.,\-]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); // 1.234.567,89
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", "."); // 12,5
  else t = t.replace(/,/g, ""); // 1,234,567.89
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

// Agrupa las filas del mes (ym = "AAAA-MM") por concepto + proveedor (si la tabla trae proveedor) y suma el valor bruto.
// nombrePorCodigo: Map(codigo de proveedor normalizado -> nombre) y normCodigo: función para normalizar el código (opcionales).
function agruparGastosMes(filas, cols, ym, nombrePorCodigo, normCodigo) {
  const norm = typeof normCodigo === "function" ? normCodigo : (x) => String(x ?? "").trim();
  const grupos = new Map();
  let filasMes = 0;
  let sinFecha = 0;
  let minFecha = null;
  let maxFecha = null;
  (filas || []).forEach((f) => {
    if (!f || typeof f !== "object") return;
    const fecha = fechaAISO(f[cols.fecha]);
    if (!fecha) { sinFecha++; return; }
    if (!minFecha || fecha < minFecha) minFecha = fecha;
    if (!maxFecha || fecha > maxFecha) maxFecha = fecha;
    if (fecha.slice(0, 7) !== ym) return;
    const codConcep = String(f[cols.codConcep] ?? "").trim();
    const concepto = cols.concepto ? String(f[cols.concepto] ?? "").trim() : "";
    if (!codConcep && !concepto) return;
    filasMes++;
    const provCod = cols.proveedorCodigo ? norm(f[cols.proveedorCodigo]) : "";
    const provNom = cols.proveedorNombre ? String(f[cols.proveedorNombre] ?? "").trim() : "";
    const clave = `${codConcep}|${concepto}|${provCod || provNom}`;
    if (!grupos.has(clave)) {
      const nombre = provNom || (provCod && nombrePorCodigo ? nombrePorCodigo.get(provCod) || "" : "");
      grupos.set(clave, { codConcep, concepto, proveedorCodigo: provCod, proveedor: nombre, valor: 0, entradas: 0 });
    }
    const g = grupos.get(clave);
    g.valor += num(f[cols.valor]);
    g.entradas += 1;
  });
  const lineas = [...grupos.values()]
    .map((g) => ({ ...g, valor: Math.round(g.valor) }))
    .filter((g) => g.valor !== 0)
    .sort((a, b) => b.valor - a.valor);
  return { lineas, filasMes, sinFecha, minFecha, maxFecha };
}

module.exports = { claveCol, detectarColumnas, esTablaCompras, candidatosTablasCompras, elegirTablaCompras, fechaAISO, agruparGastosMes };
