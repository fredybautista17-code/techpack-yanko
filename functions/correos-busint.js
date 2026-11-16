// ─── CORREOS · REVISAR FACTURAS EN BUSINT (2026-11-16, a pedido de Fredy) ────────────────────────
// «Facturas recibidas» compara contra el último corte de Cuentas por Pagar, que solo trae facturas ABIERTAS y se actualiza
// 2 veces al día. Esta revisión busca cada factura en la tabla COMPLETA de facturas de proveedores de Busint (`cartera cxp-fact`:
// incluye las ya pagadas y las registradas hace minutos) para saber si contabilidad ya la cargó. Solo LEE; no escribe nada.
// Lógica pura (sin Firebase): la function `correosRevisarFacturasBusint` (final de index.js) trae las tablas y llama a revisar().
// Los helpers de nombres repiten los de src/correos-facturas-calculo.js (el frontend es ESM y las functions son CommonJS).

const normNumero = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
const GENERICAS = new Set(["SAS", "LTDA", "DEL", "LAS", "LOS", "ESP", "CIA", "COLOMBIA", "EMPRESA", "SERVICIOS", "PUBLICOS", "COMERCIALIZADORA", "INTERNACIONAL", "TEXTIL", "TEXTILES", "INDUSTRIAS", "INDUSTRIA", "GRUPO", "DISTRIBUIDORA", "SOCIEDAD", "ANONIMA", "LIMITADA", "COMPANIA"]);
const palabras = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && !GENERICAS.has(w));
const comparteNombre = (a, b) => { const pb = new Set(palabras(b)); return palabras(a).some((w) => pb.has(w)); };
const UMBRAL_SALDO = 1; // igual que Cuentas por Pagar: ignora centavos de redondeo
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);

// tablas = { facturas, proveedores, pagos, pagosOtros, notasDescuento, devoluciones, notasContables } (filas crudas de la API BD de Busint)
// utils = { normalizarCodigoCxp, fechaADia }  (los de index.js)
// pedidas = [{ clave, proveedor, numero, valor }]
// Devuelve { [clave]: { estado: "encontrada" | "posible" | "no_encontrada", coincidencia?, parecidas? } }.
//  - encontrada: mismo número de factura Y (mismo proveedor o mismo valor). Es la única que ATLAS marca sola como registrada.
//  - posible: mismo valor (±$1) y mismo proveedor pero otro número, o mismo número con otro proveedor y otro valor.
function revisar(pedidas, tablas, utils) {
  const { normalizarCodigoCxp: nc, fechaADia } = utils;
  const nombrePorCodigo = new Map();
  (tablas.proveedores || []).forEach((p) => { const c = nc(p && p.Codigo); if (c) nombrePorCodigo.set(c, String((p && p.Nombre) || "").trim() || `Proveedor ${c}`); });

  // Facturas agrupadas por proveedor+número (igual que el corte de Cuentas por Pagar).
  const grupos = new Map();
  (tablas.facturas || []).forEach((f) => {
    const codigo = nc(f && f.CODIGO), nfact = nc(f && f.NFACT);
    if (!codigo || !nfact) return;
    const llave = `${codigo}|${nfact}`;
    if (!grupos.has(llave)) grupos.set(llave, { llave, codigo, nfact: String(f.NFACT).trim(), facTotal: 0, max: -Infinity, vence: null, emision: null });
    const g = grupos.get(llave);
    const t = Number(f.FACTOTAL) || 0;
    g.facTotal += t;
    if (t > g.max) {
      g.max = t;
      g.vence = fechaADia(f.Fechafin);
      g.emision = fechaADia(f.Fechaini) || null;
    }
  });

  const suma = (filas, campoCodigo, campoNfact, valor) => {
    const m = new Map();
    (filas || []).forEach((r) => {
      const c = nc(r && r[campoCodigo]), n = nc(r && r[campoNfact]);
      if (!c || !n) return;
      const v = valor(r);
      if (v === null) return;
      m.set(`${c}|${n}`, (m.get(`${c}|${n}`) || 0) + v);
    });
    return m;
  };
  // Pago aplicado: Cheque + Desc (o Totalp si no trae Cheque); los renglones de aplicación de anticipo (cuenta 1330 y valor negativo) no son pagos.
  const pagoDe = (p) => {
    const monto = p.Cheque != null ? (Number(p.Cheque) || 0) + (Number(p.Desc) || 0) : (Number(p.Totalp) || 0);
    return /^1330/.test(String(p.Cbi == null ? "" : p.Cbi).trim()) && monto < 0 ? null : monto;
  };
  const pagado = suma([...(tablas.pagos || []), ...(tablas.pagosOtros || [])], "CodigoP", "Nfact", pagoDe);
  const descuento = suma(tablas.notasDescuento, "Cod", "Nfactcxp", (n) => (Number(n.Precio) || 0) + (Number(n.credito) || 0));
  const devolucion = suma(tablas.devoluciones, "codigo", "nfact", (d) => Number(d.Devtotal) || 0);
  // Cruce con anticipo: nota contable (débito - crédito) a la cuenta 22050101 Proveedores Nacionales, igual que Cuentas por Pagar.
  const ajuste = suma(tablas.notasContables, "Cod", "Nfactcxp", (n) => (String((n && n.Puc) || "").trim() === "22050101" ? (Number(n.Debito) || 0) - (Number(n.Credito) || 0) : null));

  const describir = (g, tipo) => {
    const saldo = g.facTotal - (pagado.get(g.llave) || 0) - (descuento.get(g.llave) || 0) - (devolucion.get(g.llave) || 0) - (ajuste.get(g.llave) || 0);
    return { tipo, proveedor: nombrePorCodigo.get(g.codigo) || `Proveedor ${g.codigo}`, nfact: g.nfact, facTotal: Math.round(g.facTotal), saldo: Math.round(saldo), pagada: saldo <= UMBRAL_SALDO, fechaEmision: iso(g.emision), fechaVcto: iso(g.vence) };
  };

  const lista = [...grupos.values()];
  const porNumero = new Map(); // número normalizado -> grupos
  lista.forEach((g) => { const k = normNumero(g.nfact); if (k) { if (!porNumero.has(k)) porNumero.set(k, []); porNumero.get(k).push(g); } });

  const out = {};
  pedidas.forEach((p) => {
    const num = normNumero(p.numero);
    const valor = Number(p.valor) || 0;
    const mismoValor = (g) => valor > 0 && Math.abs(g.facTotal - valor) <= 1;
    const mismoNombre = (g) => comparteNombre(p.proveedor, nombrePorCodigo.get(g.codigo));
    const fecha = (g) => (g.emision ? g.emision.getTime() : 0);
    const mejor = (arr) => [...arr].sort((a, b) => (mismoValor(b) - mismoValor(a)) || (fecha(b) - fecha(a)))[0];

    const mismos = num.length >= 3 ? porNumero.get(num) || [] : [];
    const fuertes = mismos.filter((g) => mismoNombre(g) || mismoValor(g));
    if (fuertes.length) { out[p.clave] = { estado: "encontrada", coincidencia: describir(mejor(fuertes), "numero") }; return; }
    const porValor = valor > 0 ? lista.filter((g) => mismoValor(g) && mismoNombre(g)) : [];
    if (porValor.length) { out[p.clave] = { estado: "posible", coincidencia: describir(mejor(porValor), "valor") }; return; }
    if (mismos.length) { out[p.clave] = { estado: "posible", coincidencia: describir(mejor(mismos), "numero_otro_proveedor") }; return; }
    out[p.clave] = { estado: "no_encontrada" };
  });
  return out;
}

module.exports = { revisar, normNumero, comparteNombre };
