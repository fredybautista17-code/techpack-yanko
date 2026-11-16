// ─── CORREOS · FACTURAS RECIBIDAS (2026-11-16, a pedido de Fredy) ────────────────────────────────
// Funciones puras (sin Firebase ni pantalla) para el control «Facturas recibidas» del módulo Correos.
// Una factura de proveedor que llega por correo (clasificada por la IA como `factura_proveedor`) NO crea deuda: Cuentas por
// Pagar viene de Busint. Aquí solo se sabe si contabilidad ya la registró en Busint, comparándola con las facturas abiertas
// del último corte (`contabilidad_cxp_facturas/{proveedor}` = { nombre, fechaCorte, facturas: [{ nfact, facTotal, saldo… }] }).
// Estado de cada factura: «por_registrar» | «registrada» (la encontró en Busint o se marcó a mano) | «descartada» (a mano).

export const normNumero = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");

// Palabras que no sirven para reconocer a un proveedor (formas de sociedad y términos genéricos).
const GENERICAS = new Set(["SAS", "LTDA", "DEL", "LAS", "LOS", "ESP", "CIA", "COLOMBIA", "EMPRESA", "SERVICIOS", "PUBLICOS", "COMERCIALIZADORA", "INTERNACIONAL", "TEXTIL", "TEXTILES", "INDUSTRIAS", "INDUSTRIA", "GRUPO", "DISTRIBUIDORA", "SOCIEDAD", "ANONIMA", "LIMITADA", "COMPANIA"]);
export function palabrasProveedor(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && !GENERICAS.has(w));
}
export const comparteNombre = (a, b) => { const pb = new Set(palabrasProveedor(b)); return palabrasProveedor(a).some((w) => pb.has(w)); };

// Datos de la factura sacados de un correo clasificado.
export function datosFactura(m) {
  const d = (m && m.clasificacion && m.clasificacion.datos) || {};
  return { proveedor: d.proveedor || (m && m.de && (m.de.nombre || m.de.correo)) || "", numero: d.numero || "", tipo: d.tipo || "", valor: Number(d.valor) || 0, vence: d.vence || "" };
}

// Busca la factura entre las facturas abiertas del corte de Busint. Devuelve { tipo, proveedor, nfact, valor } o null.
//  - «numero»: mismo número de factura (sin guiones ni ceros a la izquierda) Y mismo proveedor o mismo valor.
//  - «valor»: mismo valor (±$1) Y mismo proveedor (por palabras del nombre).
export function buscarEnBusint(datos, cxpDocs) {
  const num = normNumero(datos.numero);
  let mejor = null;
  for (const doc of cxpDocs || []) {
    const nombre = comparteNombre(datos.proveedor, doc.nombre);
    for (const f of doc.facturas || []) {
      const mismoValor = datos.valor > 0 && (Math.abs(Number(f.facTotal) - datos.valor) <= 1 || Math.abs(Number(f.saldo) - datos.valor) <= 1);
      const mismoNum = num.length >= 3 && normNumero(f.nfact) === num;
      const hit = { proveedor: doc.nombre, nfact: f.nfact, valor: Number(f.facTotal) || 0 };
      if (mismoNum && (nombre || mismoValor)) return { tipo: "numero", ...hit };
      if (!mejor && mismoValor && nombre) mejor = { tipo: "valor", ...hit };
    }
  }
  return mejor;
}

export function estadoFactura(m, coincidencia) {
  const e = m && m.factura && m.factura.estado;
  if (e === "descartada") return "descartada";
  if (e === "registrada") return "registrada";
  return coincidencia ? "registrada" : "por_registrar";
}

const aMediaNoche = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export function diasDesde(iso, hoy = new Date()) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : Math.round((aMediaNoche(hoy) - aMediaNoche(d)) / 86400000);
}
// Días que faltan para una fecha AAAA-MM-DD (negativo = ya venció).
export function diasHasta(aaaammdd, hoy = new Date()) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(aaaammdd || ""));
  if (!p) return null;
  return Math.round((new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3])).getTime() - aMediaNoche(hoy)) / 86400000);
}

// Qué tan urgente es una factura por registrar: «alta» (vence en ≤3 días o ya venció), «media» (vence en ≤7 días o lleva ≥3
// días sin registrar) o «normal».
export function urgenciaFactura(datos, fechaCorreo, hoy = new Date()) {
  const h = diasHasta(datos.vence, hoy);
  if (h !== null && h <= 3) return "alta";
  const llevan = diasDesde(fechaCorreo, hoy);
  if ((h !== null && h <= 7) || (llevan !== null && llevan >= 3)) return "media";
  return "normal";
}
