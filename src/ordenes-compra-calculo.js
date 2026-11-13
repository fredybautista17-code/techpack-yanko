// (2026-11-10, a pedido de Fredy) Cálculo de las tarjetas «Órdenes de compra» del Mi Día (para la persona de costos).
// Es la MISMA regla que usa Contabilidad → Órdenes de compra (contabilidad-ordenes-compra.jsx): una orden es «vencida» si su fecha de entrega
// ya pasó, no está marcada como recibida ni «cumplida» en Busint y venció dentro de la ventana (60 días por defecto; las más viejas quedan
// como «sin confirmar»); y el precio se compara con la compra anterior del MISMO insumo y la MISMA unidad, precio neto = costo − descuento, sin IVA.
// Funciones puras (sin Firestore ni red).

export const IVA = 0.19; // la cabecera de Busint trae 16 pero el PDF de la orden calcula 19 %
export const VENTANA_DEFECTO = 60;

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const sumarDias = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const unidadesCompatibles = (a, b) => !a.und || !b.und || a.und === b.und;

// datos = respuesta de getOrdenesCompraBusint ({ordenes:[{n,p,pn,fi,ff,dx,l:[[cod,cant,costo,dsc,und]]}], insumos:{cod:nombre}}).
export function armarOrdenes(datos) {
  const nombres = datos?.insumos || {};
  return (datos?.ordenes || []).map((o) => {
    let bruto = 0;
    let desc = 0;
    let unidades = 0;
    const lineas = (o.l || []).map(([cod, cant, costo, dsc, und]) => {
      const b = (Number(cant) || 0) * (Number(costo) || 0);
      const d = (b * (Number(dsc) || 0)) / 100;
      bruto += b; desc += d; unidades += Number(cant) || 0;
      const neto = (Number(costo) || 0) * (1 - (Number(dsc) || 0) / 100);
      return { cod, nombre: nombres[cod] || `Insumo cód. ${cod}`, cant: Number(cant) || 0, costo: Number(costo) || 0, dsc: Number(dsc) || 0, und: und || "", neto, total: b - d };
    });
    const base = bruto - desc;
    return { ...o, lineas, unidades, bruto, desc, base, iva: base * IVA, total: base * (1 + IVA) };
  });
}

// marcas = { [numeroOrden]: {fecha,...} } de contabilidad_ordenes_compra_recibidas.
export function estadoOrden(o, marcas, hoy, ventana = VENTANA_DEFECTO) {
  if (marcas && marcas[String(o.n)]) return { clave: "recibida", dias: 0 };
  if (o.dx || o.eb?.c) return { clave: "cumplida", dias: 0 }; // «cumplida» en Busint, o ya entró toda la mercancía (entradas de Busint)
  if (!o.ff) return { clave: "sinfecha", dias: 0 };
  const d = diasEntre(hoy, o.ff); // >0 faltan, <0 vencida
  if (d < 0) return { clave: o.ff < sumarDias(hoy, -ventana) ? "antigua" : "vencida", dias: d };
  if (d <= 7) return { clave: "porvencer", dias: d };
  return { clave: "atiempo", dias: d };
}

// Vencidas (más atrasadas primero) y por vencer (≤ 7 días, la más próxima primero), con sus valores (con IVA).
export function resumenOrdenes(datos, marcas, hoy, ventana = VENTANA_DEFECTO) {
  const todas = armarOrdenes(datos).map((o) => ({ ...o, est: estadoOrden(o, marcas, hoy, ventana) }));
  const vencidas = todas.filter((o) => o.est.clave === "vencida").sort((a, b) => a.est.dias - b.est.dias || a.n - b.n);
  const porVencer = todas.filter((o) => o.est.clave === "porvencer").sort((a, b) => a.est.dias - b.est.dias || a.n - b.n);
  const antiguas = todas.filter((o) => o.est.clave === "antigua").length;
  const suma = (l) => l.reduce((s, o) => s + o.total, 0);
  return {
    totalOrdenes: todas.length, vencidas, porVencer, antiguas,
    valorVencidas: suma(vencidas), valorPorVencer: suma(porVencer),
    proveedoresVencidos: new Set(vencidas.map((o) => o.pn).filter(Boolean)).size,
  };
}

// Insumos cuya ÚLTIMA compra cambió de precio frente a la compra anterior (misma unidad). dias = ventana de la última compra;
// umbralPct = cambio mínimo (en %) para listar un aumento. Devuelve {subieron, bajaron, cambioUnidad, impactoSubieron}.
export function cambiosDePrecio(ordenes, hoy, dias = 60, umbralPct = 5) {
  const porInsumo = new Map();
  (ordenes || []).forEach((o) => (o.lineas || []).forEach((l) => {
    if (!(l.neto > 0)) return;
    if (!porInsumo.has(l.cod)) porInsumo.set(l.cod, { cod: l.cod, nombre: l.nombre, compras: [] });
    porInsumo.get(l.cod).compras.push({ oc: o.n, fecha: o.fi || o.ff || "", prov: o.pn, cant: l.cant, costo: l.costo, dsc: l.dsc, neto: l.neto, und: l.und });
  }));
  const limiteF = sumarDias(hoy, -dias);
  const subieron = [];
  const bajaron = [];
  const cambioUnidad = [];
  porInsumo.forEach((ins) => {
    if (ins.compras.length < 2) return;
    ins.compras.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.oc - b.oc);
    const u = ins.compras[ins.compras.length - 1];
    if (String(u.fecha) < limiteF) return;
    const previas = ins.compras.slice(0, -1);
    const p = [...previas].reverse().find((x) => unidadesCompatibles(x, u));
    if (!p) { cambioUnidad.push({ cod: ins.cod, nombre: ins.nombre, ult: u, ant: previas[previas.length - 1] }); return; }
    const pct = ((u.neto - p.neto) / p.neto) * 100;
    const fila = { cod: ins.cod, nombre: ins.nombre, ult: u, ant: p, pct, dif: u.neto - p.neto, impacto: (u.neto - p.neto) * u.cant };
    if (pct > umbralPct) subieron.push(fila);
    else if (pct < -umbralPct) bajaron.push(fila);
  });
  subieron.sort((a, b) => b.pct - a.pct);
  bajaron.sort((a, b) => a.pct - b.pct);
  return { subieron, bajaron, cambioUnidad, impactoSubieron: subieron.reduce((s, f) => s + f.impacto, 0) };
}
