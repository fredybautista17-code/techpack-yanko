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

// ── Por qué una factura sigue «por registrar» ──
// Devuelve null si no hay corte para comparar. Si no hay facturas abiertas del proveedor: { tipo: "sin_proveedor" }. Si el proveedor
// aparece en el corte pero ninguna factura coincide: { tipo: "proveedor_sin_factura", proveedor, total, facturas: [las 3 más
// parecidas por valor] } para que se vea a simple vista si es un tema de número, de valor o de nombre.
export function diagnosticoBusint(datos, cxpDocs) {
  if (!cxpDocs || !cxpDocs.length) return null;
  const docs = cxpDocs.filter((d) => comparteNombre(datos.proveedor, d.nombre));
  if (!docs.length) return { tipo: "sin_proveedor" };
  const todas = docs.flatMap((d) => (d.facturas || []).map((f) => ({ proveedor: d.nombre, nfact: f.nfact, facTotal: Number(f.facTotal) || 0, saldo: Number(f.saldo) || 0, vence: String(f.fechaVctoISO || "").slice(0, 10) })));
  const dist = (f) => (datos.valor > 0 ? Math.abs(f.facTotal - datos.valor) : 0);
  const cercanas = [...todas].sort((a, b) => dist(a) - dist(b) || String(b.vence).localeCompare(String(a.vence))).slice(0, 3)
    .map((f) => ({ ...f, parecida: datos.valor > 0 && Math.abs(f.facTotal - datos.valor) <= datos.valor * 0.02 }));
  return { tipo: "proveedor_sin_factura", proveedor: docs[0].nombre, total: todas.length, facturas: cercanas };
}

// ── Agrupar los correos repetidos de la misma factura (recordatorios, reenvíos) en una sola fila ──
// Misma factura = mismo proveedor (por las palabras de su nombre) y mismo número; si el correo no trae número, mismo
// proveedor + mismo valor + misma fecha de pago; si tampoco, cada correo va aparte.
export function claveFactura(datos, m) {
  const prov = palabrasProveedor(datos.proveedor).sort().join(" ");
  const num = normNumero(datos.numero);
  if (prov && num.length >= 3) return `n|${prov}|${num}`;
  if (prov && datos.valor > 0 && datos.vence) return `v|${prov}|${datos.valor}|${datos.vence}`;
  return `m|${m.id}`;
}

const porFechaDesc = (a, b) => String(b.fecha).localeCompare(String(a.fecha));

// Estado de un grupo: manda la última decisión manual (registrada o descartada) de cualquiera de sus correos; sin decisión,
// «registrada» si se encontró en Busint y «por_registrar» si no.
export function estadoGrupo(mensajes, coincidencia) {
  const marcas = mensajes.filter((m) => m.factura && m.factura.estado).sort((a, b) => String(b.factura.en || "").localeCompare(String(a.factura.en || "")));
  if (marcas.length) return estadoFactura(marcas[0], coincidencia);
  return coincidencia ? "registrada" : "por_registrar";
}

// Arma las filas de «Facturas recibidas» a partir de los correos clasificados como factura de proveedor.
//  m = el correo más reciente del grupo (el que abre «Ver correo»); primera = fecha del primer correo (desde cuándo espera).
export function agruparFacturas(mensajes, cxpDocs, hoy = new Date()) {
  const grupos = new Map();
  for (const m of mensajes) {
    const k = claveFactura(datosFactura(m), m);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  return [...grupos.entries()].map(([clave, lista]) => {
    const ordenados = [...lista].sort(porFechaDesc);
    const todos = ordenados.map(datosFactura);
    const base = { ...(todos.find((d) => d.valor > 0) || todos[0]) };
    for (const campo of ["proveedor", "numero", "tipo", "vence"]) if (!base[campo]) base[campo] = (todos.find((d) => d[campo]) || {})[campo] || "";
    const primera = ordenados[ordenados.length - 1].fecha;
    const coincidencia = cxpDocs ? buscarEnBusint(base, cxpDocs) : null;
    const estado = estadoGrupo(ordenados, coincidencia);
    return { clave, m: ordenados[0], mensajes: ordenados, n: ordenados.length, datos: base, primera, coincidencia, estado, diagnostico: estado === "por_registrar" ? diagnosticoBusint(base, cxpDocs) : null, urg: estado === "por_registrar" ? urgenciaFactura(base, primera, hoy) : "normal" };
  });
}
