// ─── PRECIO VENDIDO BLOQUEADO (2026-11-14, a pedido de Fredy) ────────────────────
// El precio que Fredy aprueba y vende al cliente queda BLOQUEADO en la cotización (`cot.precioVendido`).
// Ninguna versión nueva (de costos reales, de Diseño o reabierta) puede quedar aprobada con otro precio sin un
// CÓDIGO DE AUTORIZACIÓN: lo genera quien tiene el permiso cotizador_autorizar_precio (Fredy), con el precio
// nuevo, el motivo y con quién del cliente se acordó. Sirve una sola vez, solo para esa cotización y ese precio,
// y vence en 24 horas. En Firestore NO se guarda el código sino su huella (SHA-256 con el id de la cotización).
// Módulo sin pantalla: lo usan el Cotizador y Contabilidad (Dado por cumplido).

export const HORAS_VIGENCIA_CODIGO = 24;
export const redondeaPrecio = (x) => Math.round(Number(x) || 0);
const fmt = (n) => "$" + redondeaPrecio(n).toLocaleString("es-CO");

// Precio vendido de una cotización. Si todavía no tiene la marca (cotizaciones anteriores a esta función) se toma el
// último precio aplicado y, si no hay, el de la última versión aprobada.
export function precioVendidoDe(c) {
  if (!c) return null;
  const pv = c.precioVendido;
  if (pv && Number(pv.valor) > 0) return { ...pv, valor: Number(pv.valor) };
  const pa = c.precioAplicado;
  if (pa && Number(pa.valor) > 0) return { valor: Number(pa.valor), version: pa.version, fecha: pa.fecha || "", por: "", heredado: true };
  const ap = (c.versiones || []).filter((v) => v.estado === "aprobada");
  const u = ap[ap.length - 1];
  const p = Number(u?.precio) || 0;
  return p > 0 ? { valor: p, version: u.numero, fecha: u.decision?.fecha || u.fecha || "", por: u.decision?.por || "", heredado: true } : null;
}

// Versión aprobada que tiene el precio vendido: la marcada, o la última aprobada que coincide con ese precio,
// o (si ninguna coincide) la última aprobada.
export function versionVendidaDe(c) {
  const ap = (c?.versiones || []).filter((v) => v.estado === "aprobada");
  if (!ap.length) return null;
  const pv = precioVendidoDe(c);
  if (!pv) return ap[ap.length - 1];
  const porNumero = pv.version != null ? ap.find((v) => Number(v.numero) === Number(pv.version)) : null;
  if (porNumero) return porNumero;
  const igual = [...ap].reverse().find((v) => redondeaPrecio(v.precio) === redondeaPrecio(pv.valor));
  return igual || ap[ap.length - 1];
}

// ¿Aprobar una versión con este precio cambia el precio vendido? (si no hay precio vendido aún, es la primera venta)
export function cambiaPrecioVendido(c, precioNuevo) {
  const pv = precioVendidoDe(c);
  return !!pv && redondeaPrecio(pv.valor) !== redondeaPrecio(precioNuevo);
}

// Cotizaciones ya existentes: ¿el precio vigente (última versión aprobada) ya no es el que se vendió? Si la cotización
// no tiene la marca de precio vendido se compara la PRIMERA versión aprobada con la última; si la tiene, con la marca.
export function precioDistintoAlVendido(c) {
  if (c?.precioVendido?.confirmado) return null; // Fredy ya decidió cuál es el correcto
  const ap = (c?.versiones || []).filter((v) => v.estado === "aprobada");
  if (ap.length < 2) return null;
  const vigente = redondeaPrecio(ap[ap.length - 1].precio);
  if (!(vigente > 0)) return null;
  const vendido = c.precioVendido && Number(c.precioVendido.valor) > 0 ? redondeaPrecio(c.precioVendido.valor) : redondeaPrecio(ap[0].precio);
  if (!(vendido > 0) || vendido === vigente) return null;
  return { vendido, vigente, versionVendida: c.precioVendido?.version ?? ap[0].numero, versionVigente: ap[ap.length - 1].numero };
}

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I, O, 0, 1 para no confundir al dictarlo
export function generarCodigoPrecio() {
  const buf = new Uint32Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 4294967296);
  let s = "PV-";
  for (let i = 0; i < 6; i++) s += LETRAS[buf[i] % LETRAS.length];
  return s;
}
export const normalizaCodigo = (t) => String(t || "").trim().toUpperCase().replace(/\s+/g, "");

export async function huellaCodigo(cotId, codigo) {
  const datos = new TextEncoder().encode(`${cotId}|${normalizaCodigo(codigo)}`);
  const h = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Crea la autorización (lo que se guarda en la cotización) y el código en claro (que solo ve quien lo genera).
export async function crearAutorizacionPrecio(cotId, { precio, motivo, acordadoCon, por, precioAnterior }) {
  const codigo = generarCodigoPrecio();
  const ahora = new Date();
  const aut = {
    id: `${ahora.getTime().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    huella: await huellaCodigo(cotId, codigo),
    precio: redondeaPrecio(precio),
    precioAnterior: redondeaPrecio(precioAnterior),
    motivo: String(motivo || "").trim(),
    acordadoCon: String(acordadoCon || "").trim(),
    por: por || "",
    fecha: ahora.toISOString(),
    vence: new Date(ahora.getTime() + HORAS_VIGENCIA_CODIGO * 3600 * 1000).toISOString(),
    usado: null,
  };
  return { codigo, aut };
}

// Revisa un código escrito contra las autorizaciones de la cotización para un precio dado.
export async function validarCodigoPrecio(c, codigo, precio) {
  if (!normalizaCodigo(codigo)) return { ok: false, error: "Escribe el código de autorización." };
  const h = await huellaCodigo(c.id, codigo);
  const aut = (c.autorizacionesPrecio || []).find((a) => a.huella === h);
  if (!aut) return { ok: false, error: "Código incorrecto o de otra cotización." };
  if (aut.usado) return { ok: false, error: "Ese código ya se usó. Genera uno nuevo." };
  if (new Date(aut.vence).getTime() < Date.now()) return { ok: false, error: "Ese código venció. Genera uno nuevo." };
  if (redondeaPrecio(aut.precio) !== redondeaPrecio(precio)) {
    return { ok: false, error: `Ese código autoriza ${fmt(aut.precio)}, pero esta versión da ${fmt(precio)}. Ajusta la versión (por ejemplo el margen) o genera otro código.` };
  }
  return { ok: true, aut };
}

// Autorizaciones vigentes (sin usar y sin vencer), para avisar en pantalla.
export const autorizacionesVigentes = (c) => (c?.autorizacionesPrecio || []).filter((a) => !a.usado && new Date(a.vence).getTime() > Date.now());
