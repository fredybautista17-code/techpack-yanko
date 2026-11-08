// (2026-11-08, a pedido de Fredy) Financiera · «Programar pagos a proveedores». Funciones puras (sin Firestore ni React).
// Las facturas salen de Cuentas por Pagar: Yanko = facturas abiertas del último corte de Busint (contabilidad_cxp_facturas, vence = emisión + plazo del
// proveedor o la fecha de Busint); Indutex y los proveedores manuales = lo que traen los cortes de TNS (edades, sin fecha por factura) o su fecha manual.
// Cada programación guarda UNA factura (o un abono a ella) en contabilidad_pagos_programados: { facturaKey, fecha, valor, estado }.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const VENTANA_DIAS = 30;
export const claveDoc = (n) => String(n || "").replace(/[./\s]/g, "_");
export const sumarDiasISO = (iso, d) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
export const difDiasISO = (aISO, bISO) => Math.round((new Date(`${bISO}T00:00:00Z`) - new Date(`${aISO}T00:00:00Z`)) / 86400000);
export const lunesDe = (iso) => { const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; return sumarDiasISO(iso, -dow); };
export const esISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
// El viernes de la semana de la fecha (o la misma fecha si ya es sábado/domingo se manda al viernes anterior de su semana).
export const viernesDe = (iso) => sumarDiasISO(lunesDe(iso), 4);

export function claseVencimiento(dias) {
  if (dias === null || dias === undefined) return "sinFecha";
  if (dias < 0) return "vencido";
  if (dias <= VENTANA_DIAS) return "dentro";
  return "despues";
}
const ORDEN_CLASE = { vencido: 0, dentro: 1, sinFecha: 2, despues: 3 };

// Último corte de una empresa ("yanko" = sin campo o distinto de "indutex"). Orden por creadoEn (o fechaCorte).
export function ultimoCorte(cortes, empresa) {
  const de = (c) => (c && c.empresa === "indutex" ? "indutex" : "yanko");
  return [...(cortes || [])].filter((c) => de(c) === empresa).sort((a, b) => String(b.creadoEn || b.fechaCorte || "").localeCompare(String(a.creadoEn || a.fechaCorte || "")))[0] || null;
}

// Renglones por edades cuando no hay detalle de facturas.
function itemsPorEdades(clave, p) {
  const venc = num(p.dias0a30) + num(p.dias31a60) + num(p.dias61a90) + num(p.dias91mas);
  const items = [];
  if (venc > 0) items.push({ key: `${clave}|venc`, concepto: "Vencido (sin detalle por factura)", emision: "", vence: null, dias: -1, clase: "vencido", saldo: venc, agregado: true });
  if (num(p.porVencer) > 0) items.push({ key: `${clave}|por`, concepto: "Por vencer (sin fecha exacta)", emision: "", vence: null, dias: null, clase: "sinFecha", saldo: num(p.porVencer), agregado: true });
  if (!items.length && num(p.total) > 0) items.push({ key: `${clave}|total`, concepto: "Saldo total (sin detalle)", emision: "", vence: null, dias: null, clase: "sinFecha", saldo: num(p.total), agregado: true });
  return items;
}

// Arma, por proveedor, las facturas pagables. Una lista con la forma:
// { clave, empresa, nombre (crudo), nombreMostrado, plazo, anticipos, conDetalle, origen, items: [{ key, concepto, nfact, emision, vence, dias, clase, saldo, agregado?, porPlazo? }] }
export function armarProveedoresPagar({ empresa, corte, facturasGuardadas, plazos, nombresProveedor, manuales, hoy }) {
  const salida = [];
  const plazoDe = (nombre) => { const v = num(plazos?.[claveDoc(nombre)]); return v > 0 ? v : 0; };
  const mostrado = (nombre) => { const m = /^Proveedor (\d+)$/.exec(nombre || ""); return (m && nombresProveedor?.[m[1]]) || nombre; };
  ((corte && corte.proveedores) || []).forEach((p) => {
    if (p.soloAnticipos) return;
    const clave = `${empresa}|c|${p.nombre}`;
    const g = facturasGuardadas?.[claveDoc(p.nombre)];
    const plazo = empresa === "yanko" ? plazoDe(p.nombre) : 0;
    let items = [];
    let conDetalle = false;
    if (empresa === "yanko" && g && corte && g.corteId === corte.id && Array.isArray(g.facturas) && g.facturas.length) {
      conDetalle = true;
      g.facturas.forEach((f, i) => {
        const saldo = num(f.saldo);
        if (saldo <= 0) return;
        const porPlazo = plazo > 0 && !!f.fechaEmisionISO;
        const vence = porPlazo ? sumarDiasISO(f.fechaEmisionISO, plazo) : f.fechaVctoISO || null;
        const dias = vence ? difDiasISO(hoy, vence) : null;
        items.push({ key: `${clave}|${f.nfact || `i${i}`}`, concepto: `Factura ${f.nfact || "s/n"}`, nfact: f.nfact || "", emision: f.fechaEmisionISO || "", vence, dias, clase: claseVencimiento(dias), saldo, porPlazo });
      });
    } else {
      items = itemsPorEdades(clave, p);
    }
    if (items.length) salida.push({ clave, empresa, nombre: p.nombre, nombreMostrado: mostrado(p.nombre), plazo, anticipos: num(p.anticiposTotal), conDetalle, origen: "corte", items });
  });
  (manuales || []).forEach((p) => {
    const clave = `${empresa}|m|${p.id}`;
    let items = [];
    if (p.fechaVencimiento) {
      const dias = esISO(p.fechaVencimiento) ? difDiasISO(hoy, p.fechaVencimiento) : null;
      if (num(p.total) > 0) items = [{ key: `${clave}|f`, concepto: "Monto manual", emision: "", vence: p.fechaVencimiento, dias, clase: claseVencimiento(dias), saldo: num(p.total) }];
    } else {
      items = itemsPorEdades(clave, p);
    }
    if (items.length) salida.push({ clave, empresa, nombre: p.nombre, nombreMostrado: `${p.nombre} (manual)`, plazo: 0, anticipos: 0, conDetalle: false, origen: "manual", items });
  });
  salida.forEach((p) => p.items.sort((a, b) => (ORDEN_CLASE[a.clase] - ORDEN_CLASE[b.clase]) || String(a.vence || "9999").localeCompare(String(b.vence || "9999"))));
  return salida.sort((a, b) => String(a.nombreMostrado).localeCompare(String(b.nombreMostrado), "es"));
}

// Cruza proveedores con lo ya programado/pagado. programados = [{ id, facturaKey, valor, fecha, estado: "programado"|"pagado", corteId, ... }]
// corteIdPorEmpresa = { yanko: id, indutex: id }.
// Restante por programar = saldo − programado pendiente − pagado registrado contra ESTE corte (lo pagado antes ya viene descontado en Busint/TNS).
export function aplicarProgramacion(proveedores, programados, corteIdPorEmpresa) {
  const porClave = new Map();
  (programados || []).forEach((x) => { const a = porClave.get(x.facturaKey) || []; a.push(x); porClave.set(x.facturaKey, a); });
  const usadas = new Set();
  const lista = (proveedores || []).map((p) => {
    const items = p.items.map((it) => {
      const regs = porClave.get(it.key) || [];
      if (regs.length) usadas.add(it.key);
      const pend = regs.filter((r) => r.estado !== "pagado");
      const programado = pend.reduce((s, r) => s + num(r.valor), 0);
      const pagado = regs.filter((r) => r.estado === "pagado" && r.corteId === (corteIdPorEmpresa || {})[p.empresa]).reduce((s, r) => s + num(r.valor), 0);
      return { ...it, regs, programado, pagado, restante: Math.max(0, it.saldo - programado - pagado) };
    });
    const sum = (fn) => items.filter(fn).reduce((s, x) => s + x.saldo, 0);
    return {
      ...p,
      items,
      total: items.reduce((s, x) => s + x.saldo, 0),
      vencido: sum((x) => x.clase === "vencido"),
      dentro: sum((x) => x.clase === "dentro"),
      programado: items.reduce((s, x) => s + x.programado, 0),
      restante: items.reduce((s, x) => s + x.restante, 0),
    };
  });
  // Programadas pendientes cuya factura ya no está en el corte actual (se pagó fuera del sistema o el corte cambió).
  const huerfanas = (programados || []).filter((x) => x.estado !== "pagado" && !usadas.has(x.facturaKey));
  return { proveedores: lista, huerfanas };
}

// Programado por semana (lunes): [{ lunes, programado, n }]; lo atrasado (fecha anterior a hoy y sin pagar) va aparte.
export function resumenPorSemana(programados, hoy) {
  const semanas = new Map();
  let atrasado = 0;
  let nAtrasado = 0;
  (programados || []).filter((x) => x.estado !== "pagado" && esISO(x.fecha)).forEach((x) => {
    if (x.fecha < hoy) { atrasado += num(x.valor); nAtrasado += 1; return; }
    const l = lunesDe(x.fecha);
    const s = semanas.get(l) || { lunes: l, programado: 0, n: 0 };
    s.programado += num(x.valor);
    s.n += 1;
    semanas.set(l, s);
  });
  return { semanas: [...semanas.values()].sort((a, b) => a.lunes.localeCompare(b.lunes)), atrasado, nAtrasado };
}

// Sugerencia: reparte el cupo entre lo vencido y lo que vence en 30 días, lo más urgente primero (vencidas, luego por fecha).
// Cada factura va al viernes de la semana de hoy (o de su vencimiento si es posterior). Solo toma lo que aún no está programado.
export function sugerirProgramacion(proveedores, cupo, hoy) {
  let resto = Math.max(0, num(cupo));
  const cand = [];
  (proveedores || []).forEach((p) => p.items.forEach((it) => {
    if ((it.clase === "vencido" || it.clase === "dentro") && it.restante > 0) cand.push({ p, it });
  }));
  cand.sort((a, b) => (ORDEN_CLASE[a.it.clase] - ORDEN_CLASE[b.it.clase]) || String(a.it.vence || "0").localeCompare(String(b.it.vence || "0")));
  const salida = [];
  for (const { p, it } of cand) {
    if (resto <= 0) break;
    const valor = Math.min(it.restante, Math.floor(resto));
    if (valor <= 0) break;
    const base = it.vence && it.vence > hoy ? it.vence : hoy;
    let fecha = viernesDe(base);
    if (fecha < hoy) fecha = sumarDiasISO(fecha, 7); // fin de semana: el viernes siguiente
    salida.push({ proveedorClave: p.clave, empresa: p.empresa, proveedor: p.nombre, proveedorMostrado: p.nombreMostrado, facturaKey: it.key, concepto: it.concepto, nfact: it.nfact || "", vence: it.vence || null, saldo: it.saldo, valor, fecha, parcial: valor < it.restante });
    resto -= valor;
  }
  return { filas: salida, usado: salida.reduce((s, x) => s + x.valor, 0), sobra: resto };
}
