// (2026-11-10, a pedido de Fredy) Devoluciones de clientes: tiempo que lleva cada una (días hábiles) y de dónde viene en Busint
// (factura o traslado externo). Funciones puras, sin Firestore ni red; las usa devoluciones-cliente.jsx.
import { esFestivoColombiaISO } from "./dias-habiles";

// Una devolución debería quedar resuelta (despachada de nuevo) en este número de días hábiles, contados desde que el cliente la reportó.
export const LIMITE_DIAS_DEVOLUCION = 5;
const DIAS_VERDE = 3; // hasta aquí verde; de 4 a LIMITE ámbar; más de LIMITE rojo (atrasada)

const pad = (n) => String(n).padStart(2, "0");
// Fecha (AAAA-MM-DD) en hora de Bogotá de un instante ISO.
export const fechaBogota = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
};
export const hoyBogota = () => fechaBogota(new Date().toISOString());
const sumarDia = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const esHabil = (iso) => {
  const w = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6 && !esFestivoColombiaISO(iso);
};

// Días hábiles (lunes a viernes, sin festivos de Colombia) transcurridos después de `desde` hasta `hasta` inclusive. Mismo día = 0.
export function diasHabilesEntre(desde, hasta) {
  if (!desde || !hasta || hasta <= desde) return 0;
  let n = 0;
  let c = desde;
  for (let i = 0; i < 800 && c < hasta; i++) {
    c = sumarDia(c);
    if (esHabil(c)) n++;
  }
  return n;
}

const ultimoEvento = (d, estado) => [...(d?.historial || [])].reverse().find((h) => h.estado === estado);

// Fecha (ISO completo) en que la devolución llegó por última vez a ese paso; "" si no pasó por él.
export function fechaDePaso(d, paso) {
  const ev = ultimoEvento(d, paso);
  if (ev?.fecha) return ev.fecha;
  if (paso === "reportada") return d?.creadoEn || d?.historial?.[0]?.fecha || "";
  return "";
}

// {dias, cerrada, nivel: "verde"|"ambar"|"rojo"|"cerrada", atrasada, tardo}
export function tiempoDevolucion(d, hoy = hoyBogota()) {
  const inicio = fechaBogota(d?.creadoEn || d?.historial?.[0]?.fecha);
  const cerrada = d?.estado === "redespachada";
  const fin = cerrada ? fechaBogota(ultimoEvento(d, "redespachada")?.fecha || d?.actualizadoEn) || hoy : hoy;
  const dias = diasHabilesEntre(inicio, fin);
  const nivel = cerrada ? "cerrada" : dias > LIMITE_DIAS_DEVOLUCION ? "rojo" : dias > DIAS_VERDE ? "ambar" : "verde";
  return { dias, cerrada, nivel, atrasada: !cerrada && dias > LIMITE_DIAS_DEVOLUCION, tardo: cerrada && dias > LIMITE_DIAS_DEVOLUCION };
}
export const textoTiempo = (t) => {
  if (t.cerrada) return t.dias === 0 ? "Resuelta el mismo día" : `Resuelta en ${t.dias} ${t.dias === 1 ? "día hábil" : "días hábiles"}`;
  if (t.dias === 0) return "Reportada hoy";
  return `Lleva ${t.dias} ${t.dias === 1 ? "día hábil" : "días hábiles"}`;
};

// ── Origen en Busint ──
export const ORIGENES = {
  factura: "Facturada",
  traslado_externo: "Traslado externo",
  traslado_consignacion: "Traslado en consignación",
  mixto: "Mixto: confirmar",
  sin_dato: "Sin dato",
};
export const ORIGENES_ELEGIBLES = ["factura", "traslado_externo", "traslado_consignacion", "sin_dato"];
export const etiquetaOrigen = (o) => (o?.tipo ? ORIGENES[o.tipo] || o.tipo : "");

// f = info.facturacion de la función consultarLoteParaDevolucion. Devuelve {tipo, documentos, fuente:"busint"} o null si no hubo consulta.
export function origenDeFacturacion(f) {
  if (!f || f.estado === "sin_consulta") return null;
  const documentos = (f.facturas || []).map((x) => String(x.nfact || "").trim()).filter(Boolean);
  if (f.estado === "factura_lote") return { tipo: "factura", documentos, fuente: "busint" };
  if (f.estado === "por_pedido") {
    const tipos = (f.tiposTraslado || []).map((t) => String(t).toUpperCase());
    const hayFactura = Number(f.unidadesFactura) > 0;
    const hayTex = tipos.some((t) => t === "TEX" || t === "DTE");
    const hayTco = tipos.some((t) => t === "TCO" || t === "DTC");
    if (hayFactura && (hayTex || hayTco)) return { tipo: "mixto", documentos, fuente: "busint" };
    if (hayFactura) return { tipo: "factura", documentos, fuente: "busint" };
    if (hayTex) return { tipo: "traslado_externo", documentos: [], fuente: "busint" };
    if (hayTco) return { tipo: "traslado_consignacion", documentos: [], fuente: "busint" };
  }
  return { tipo: "sin_dato", documentos: [], fuente: "busint" };
}

// Resumen de un despacho agrupado: por origen, con sus lotes y unidades. devs = devoluciones elegidas.
export function resumenDespachoJunto(devs) {
  const grupos = new Map();
  (devs || []).forEach((d) => {
    const tipo = d.origen?.tipo || "sin_dato";
    if (!grupos.has(tipo)) grupos.set(tipo, { tipo, etiqueta: ORIGENES[tipo] || tipo, devs: [], unidades: 0 });
    const g = grupos.get(tipo);
    g.devs.push({ numero: d.numero, lote: d.lote, ref: d.ref, total: Number(d.total) || 0, documentos: d.origen?.documentos || [] });
    g.unidades += Number(d.total) || 0;
  });
  const orden = ["factura", "traslado_externo", "traslado_consignacion", "mixto", "sin_dato"];
  return [...grupos.values()].sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo));
}
