"use strict";
// ─── GASTOS DEL MES DESDE BUSINT (Tablero de Costos → «¿Cubro mis costos?» → Gastos del mes → «Traer de Busint») ─────────────
// (2026-11-10, a pedido de Fredy) Las compras por CONCEPTO (CodConcep, Concepto, Fechaini, Vbruto) que hoy se importan desde un Excel de
// Busint se leen directo de la API. No se sabía en qué tabla viven, así que se buscan: de la lista de tablas de la API se toman las que
// parecen de compras / cuentas por pagar, se mira una muestra de cada una y se queda con la primera que trae concepto + fecha + valor.
// (2026-11-10, 2.ª versión) La primera búsqueda solo probó 40 de las 974 tablas y se quedó en las de inventario («bmp - entrada…»). Ahora se
// prueban primero las de cuentas por pagar («cartera cxp-fact»: concepto de obligación FCBI, fecha Fechaini, total FACTOTAL), se dejan fuera
// las de punto de venta e inventario, y si la tabla solo trae el TOTAL de la factura (con IVA) se cuenta cada factura una sola vez.
// Funciones puras (sin Firestore ni red) para poder probarlas.

const claveCol = (k) => String(k || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Detecta las columnas por nombre (sin importar mayúsculas, guiones ni espacios). Devuelve null en las que no encuentra.
// valorEsTotal = true cuando no hay valor bruto y se usó el total de la factura (incluye IVA).
function detectarColumnas(keys) {
  const ks = (keys || []).map((k) => ({ k, n: claveCol(k) }));
  const buscar = (...res) => {
    for (const re of res) {
      const m = ks.find((x) => re.test(x.n));
      if (m) return m.k;
    }
    return null;
  };
  const bruto = buscar(/^vbruto$/, /^valorbruto/, /^vlrbruto/);
  const total = bruto ? null : buscar(/^factotal$/, /^factot$/, /^totalfactura$/, /^valorfactura$/);
  return {
    codConcep: buscar(/^codconcep/, /^codigoconcep/, /^concepcod/, /^fcbi$/),
    concepto: buscar(/^concepto$/, /^nombreconcep/, /^descconcep/, /^desconcep/, /^concepto/),
    fecha: buscar(/^fechaini$/, /^fecha$/, /^fechafac/, /^fechaemis/, /^fecha(?!fin|vcto|venc)/),
    valor: bruto || total,
    valorEsTotal: !bruto && !!total,
    numeroFactura: buscar(/^nfact$/, /^nfactura$/, /^numfact/, /^numerofactura/),
    proveedorCodigo: buscar(/^codprov/, /^codigoprov/, /^codtercero/, /^nit$/, /^codigo$/, /^proveedor$/, /^tercero$/),
    proveedorNombre: buscar(/^nombreprov/, /^razonsocial/, /^nomprov/, /^nombretercero/, /^nombre$/),
  };
}

// Una tabla sirve si trae código de concepto, fecha y valor (bruto o total de la factura).
function esTablaCompras(keys) {
  const c = detectarColumnas(keys);
  return !!(c.codConcep && c.fecha && c.valor);
}

const PRIORITARIAS = ["cartera cxp-fact", "contabilidad - cxp", "cierre cxp", "cartera cxp-ajustes", "cartera cxp-cruce", "cartera cxp-dev"];
const EXCLUIDAS = /^pos|bmp - |evacuar|muestras|^historia|rollos|^bc-.*(stock|inventario|corte|comercial|facturacion)/;

// De la lista de tablas de la API, las que vale la pena mirar: primero las de cuentas por pagar, luego las de compras; sin punto de venta ni inventario.
function candidatosTablasCompras(nombres, max = 80) {
  const puntaje = (t) => {
    const n = String(t).toLowerCase();
    const pr = PRIORITARIAS.indexOf(n);
    if (pr >= 0) return pr;
    if (EXCLUIDAS.test(n)) return null;
    if (/cxp/.test(n)) return 10;
    if (/compra/.test(n)) return 11;
    if (/gasto|egreso|causa/.test(n)) return 12;
    if (/obligacion|contab/.test(n)) return 13;
    if (/factur/.test(n)) return 14;
    if (/entrada/.test(n)) return 15;
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

// Números con miles en punto y decimales en coma («6.000.000», «1.234,56») o con punto decimal («1234.56»).
const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").trim().replace(/[^0-9.,\-]/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

// Agrupa las filas del mes (ym = "AAAA-MM") por concepto + proveedor (si la tabla trae proveedor) y suma el valor.
// nombrePorCodigo: Map(código de proveedor normalizado -> nombre); normCodigo: normaliza ese código; nombrePorConcepto: Map(código de concepto -> nombre).
// Si el valor es el TOTAL de la factura (cols.valorEsTotal) y hay número de factura, cada factura cuenta una sola vez (la más alta de sus filas).
function agruparGastosMes(filas, cols, ym, nombrePorCodigo, normCodigo, nombrePorConcepto) {
  const norm = typeof normCodigo === "function" ? normCodigo : (x) => String(x ?? "").trim();
  const grupos = new Map();
  let filasMes = 0;
  let sinFecha = 0;
  let minFecha = null;
  let maxFecha = null;
  const unaVez = !!(cols.valorEsTotal && cols.numeroFactura);
  const facturas = new Map(); // solo si unaVez: llave -> fila elegida {f, valor}
  const lista = [];
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
    const valor = num(f[cols.valor]);
    if (unaVez) {
      const provCod = cols.proveedorCodigo ? norm(f[cols.proveedorCodigo]) : "";
      const llave = `${provCod}|${String(f[cols.numeroFactura] ?? "").trim().toUpperCase()}`;
      const previa = facturas.get(llave);
      if (!previa || Math.abs(valor) > Math.abs(previa.valor)) facturas.set(llave, { f, valor, codConcep: codConcep || previa?.codConcep || "", concepto: concepto || previa?.concepto || "" });
      else if (previa && !previa.codConcep && codConcep) previa.codConcep = codConcep;
      return;
    }
    lista.push({ f, valor, codConcep, concepto });
  });
  const todas = unaVez ? [...facturas.values()] : lista;
  todas.forEach(({ f, valor, codConcep, concepto }) => {
    filasMes++;
    const provCod = cols.proveedorCodigo ? norm(f[cols.proveedorCodigo]) : "";
    const provNom = cols.proveedorNombre ? String(f[cols.proveedorNombre] ?? "").trim() : "";
    const nombreConcepto = concepto || (nombrePorConcepto && nombrePorConcepto.get(codConcep)) || "";
    const clave = `${codConcep}|${nombreConcepto}|${provCod || provNom}`;
    if (!grupos.has(clave)) {
      const nombre = provNom || (provCod && nombrePorCodigo ? nombrePorCodigo.get(provCod) || "" : "");
      grupos.set(clave, { codConcep, concepto: nombreConcepto, proveedorCodigo: provCod, proveedor: nombre, valor: 0, entradas: 0 });
    }
    const g = grupos.get(clave);
    g.valor += valor;
    g.entradas += 1;
  });
  const lineas = [...grupos.values()]
    .map((g) => ({ ...g, valor: Math.round(g.valor) }))
    .filter((g) => g.valor !== 0)
    .sort((a, b) => b.valor - a.valor);
  return { lineas, filasMes, sinFecha, minFecha, maxFecha };
}

module.exports = { claveCol, detectarColumnas, esTablaCompras, candidatosTablasCompras, elegirTablaCompras, fechaAISO, agruparGastosMes };
