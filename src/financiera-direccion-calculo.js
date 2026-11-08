// (2026-11-08, a pedido de Fredy) Financiera · «Dirección financiera»: Mapa de deuda (todo lo que se debe, por urgencia), ruta para salir de deudas
// (mes a mes, con tasa negociada, abono extra y pasar los pagos que se liberan a la deuda siguiente) y costo del dinero. Funciones puras.
import { sumarMes } from "./financiera-cuanto-pagar-calculo";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const HORIZONTE_RUTA = 120;
export const TASA_CARA = 20; // E.A. %: desde aquí una deuda se considera «cara»
export const TIPOS_DEUDA = [
  { k: "banco", txt: "Crédito bancario", grupo: "Bancos y tarjetas" },
  { k: "tarjeta", txt: "Tarjeta de crédito", grupo: "Bancos y tarjetas" },
  { k: "impuesto", txt: "Impuestos y aportes", grupo: "Impuestos y legal" },
  { k: "embargo", txt: "Embargo o proceso legal", grupo: "Impuestos y legal" },
  { k: "otro", txt: "Otra deuda", grupo: "Otras deudas" },
];
export const GRUPOS_URGENCIA = [
  { k: "legal", txt: "Lo legal primero", ayuda: "Impuestos, aportes y embargos: dejarlos sin atender trae sanciones y retenciones." },
  { k: "vencido", txt: "Vencido con proveedores", ayuda: "Facturas ya vencidas: cuestan suministro y relación." },
  { k: "caro", txt: "Deuda cara", ayuda: `Cobra ${TASA_CARA} % E.A. o más: cada mes que pasa pesa más.` },
  { k: "resto", txt: "El resto", ayuda: "Por vencer, cuotas de Endeudamiento y otras deudas sin interés conocido." },
];
const ORDEN_GRUPO = { legal: 0, vencido: 1, caro: 2, resto: 3 };

export const tasaMensual = (ea) => Math.pow(1 + Math.max(-99, num(ea)) / 100, 1 / 12) - 1;
export const nombreTipo = (k) => (TIPOS_DEUDA.find((t) => t.k === k) || { txt: "Otra deuda" }).txt;
const grupoDeTipo = (k) => (TIPOS_DEUDA.find((t) => t.k === k) || { grupo: "Otras deudas" }).grupo;

// Meses entre a y b, ambos incluidos ("AAAA-MM").
export function mesesEntre(a, b) {
  const [ya, ma] = String(a).split("-").map(Number);
  const [yb, mb] = String(b).split("-").map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma) + 1;
}

// Totales de facturas por clase de vencimiento (resultado de armarProveedoresPagar).
export function totalesProveedores(provs) {
  const t = { vencido: 0, dentro: 0, despues: 0, sinFecha: 0, total: 0, proveedores: 0 };
  (provs || []).forEach((p) => {
    let tiene = false;
    (p.items || []).forEach((i) => {
      const s = num(i.saldo);
      if (s <= 0) return;
      tiene = true;
      t[i.clase in t ? i.clase : "sinFecha"] += s;
      t.total += s;
    });
    if (tiene) t.proveedores += 1;
  });
  return t;
}

// Lo que falta de una cuota de Endeudamiento desde ymHoy (inclusive): meses restantes × valor. Sin «hasta» no se puede saber (sinFin).
export function faltaCuota(c, ymHoy) {
  const valor = num(c.valorMensual);
  if (!c.desde || valor <= 0) return { meses: 0, saldo: 0, sinFin: false };
  const inicio = c.desde > ymHoy ? c.desde : ymHoy;
  if (!c.hasta) return { meses: 0, saldo: 0, sinFin: true };
  if (c.hasta < inicio) return { meses: 0, saldo: 0, sinFin: false };
  const meses = mesesEntre(inicio, c.hasta);
  return { meses, saldo: meses * valor, sinFin: false };
}

// ─── Mapa de deuda ───────────────────────────────────────────────────────────
// yanko / indutex = resultado de totalesProveedores (o null si no hay corte). cuotas = cuotas de Endeudamiento (con liquidaciones).
// externas = [{ id, tipo, nombre, saldo, tasaEA, pagoMensual, diaPago, nota }]
export function mapaDeuda({ yanko, indutex, cuotas, externas, ymHoy }) {
  const filas = [];
  const agregarProv = (t, quien) => {
    if (!t || t.total <= 0) return;
    if (t.vencido > 0) filas.push({ id: `${quien}|venc`, grupo: "vencido", tipo: "proveedor", tipoTxt: "Proveedores", nombre: `${quien} · facturas vencidas`, saldo: t.vencido, detalle: `${t.proveedores} proveedor${t.proveedores === 1 ? "" : "es"} con saldo`, tasa: 0, pago: 0 });
    const resto = t.dentro + t.despues + t.sinFecha;
    if (resto > 0) filas.push({ id: `${quien}|por`, grupo: "resto", tipo: "proveedor", tipoTxt: "Proveedores", nombre: `${quien} · por vencer`, saldo: resto, detalle: t.dentro > 0 ? `${money(t.dentro)} vence en 30 días o menos` : "Sin vencimientos cercanos", tasa: 0, pago: 0 });
  };
  agregarProv(yanko, "Yanko");
  agregarProv(indutex, "Indutex");
  const sinFin = [];
  (cuotas || []).forEach((c) => {
    const f = faltaCuota(c, ymHoy);
    if (f.sinFin && c.desde <= ymHoy) { sinFin.push(c); return; }
    if (f.saldo <= 0) return;
    filas.push({ id: `cuota|${c.id}`, grupo: "resto", tipo: "cuota", tipoTxt: "Cuotas de Endeudamiento", nombre: c.nombre || c.acreedor || "Cuota", saldo: f.saldo, detalle: `${f.meses} cuota${f.meses === 1 ? "" : "s"} de ${money(c.valorMensual)}${c.acreedor ? ` · ${c.acreedor}` : ""}`, tasa: 0, pago: num(c.valorMensual) });
  });
  (externas || []).forEach((e) => {
    const saldo = num(e.saldo);
    if (saldo <= 0) return;
    const tasa = num(e.tasaEA);
    const legal = e.tipo === "impuesto" || e.tipo === "embargo";
    filas.push({ id: `ext|${e.id}`, grupo: legal ? "legal" : tasa >= TASA_CARA ? "caro" : "resto", tipo: e.tipo, tipoTxt: grupoDeTipo(e.tipo), nombre: e.nombre || nombreTipo(e.tipo), saldo, detalle: [tasa > 0 ? `${tasa.toLocaleString("es-CO")} % E.A.` : "", num(e.pagoMensual) > 0 ? `paga ${money(e.pagoMensual)} al mes` : "sin plan de pago", e.nota || ""].filter(Boolean).join(" · "), tasa, pago: num(e.pagoMensual), externa: e });
  });
  filas.sort((a, b) => (ORDEN_GRUPO[a.grupo] - ORDEN_GRUPO[b.grupo]) || (b.saldo - a.saldo));
  const porGrupo = {};
  const porTipo = {};
  filas.forEach((f) => { porGrupo[f.grupo] = (porGrupo[f.grupo] || 0) + f.saldo; porTipo[f.tipoTxt] = (porTipo[f.tipoTxt] || 0) + f.saldo; });
  const total = filas.reduce((s, f) => s + f.saldo, 0);
  const caro = filas.filter((f) => f.tasa >= TASA_CARA).reduce((s, f) => s + f.saldo, 0);
  return { filas, total, porGrupo, porTipo, sinFin, saldoCaro: caro };
}
const money = (n) => "$" + Math.round(num(n)).toLocaleString("es-CO");

// ─── Ruta para salir de deudas ───────────────────────────────────────────────
// Cada mes se hacen los pagos programados de cada deuda; lo que queda del presupuesto (porque una deuda terminó) pasa, si «rodar» está
// activo, a la deuda con más interés (y al final a proveedores); el abono extra va al mismo destino.
//   externas: deudas con saldo, tasa E.A. y pago mensual (tarjetas: el interés se calcula sobre todo el saldo, es una estimación que exagera un poco).
//   cuotas de Endeudamiento: pago fijo hasta su fecha final (sin interés). Las que no tienen fecha final no se cuentan.
//   proveedores: saldo total de facturas, se paga con el cupo mensual (sin interés).
//   tasaNegociada: nueva tasa E.A. para el crédito bancario de mayor saldo (null = la actual).
export function rutaSalida({ externas, cuotas, saldoProveedores, cupoProveedores, ymHoy, tasaNegociada = null, extra = 0, rodar = true, horizonte = HORIZONTE_RUTA }) {
  const deudas = (externas || []).filter((e) => num(e.saldo) > 0).map((e) => ({
    id: String(e.id), nombre: e.nombre || nombreTipo(e.tipo), tipo: e.tipo, bal: num(e.saldo), mv: tasaMensual(e.tasaEA), pago: Math.max(0, num(e.pagoMensual)), fin: null, bal0: num(e.saldo),
  }));
  if (tasaNegociada !== null && tasaNegociada !== undefined && Number.isFinite(Number(tasaNegociada))) {
    const grande = deudas.filter((d) => d.tipo === "banco").sort((a, b) => b.bal - a.bal)[0];
    if (grande) grande.mv = tasaMensual(tasaNegociada);
  }
  const prov = { id: "proveedores", nombre: "Proveedores", tipo: "proveedor", bal: Math.max(0, num(saldoProveedores)), mv: 0, pago: Math.max(0, num(cupoProveedores)), fin: null, bal0: Math.max(0, num(saldoProveedores)) };
  const conFin = (cuotas || []).filter((c) => c.hasta && num(c.valorMensual) > 0);
  const cuotasPago = (ym) => conFin.filter((c) => c.desde <= ym && ym <= c.hasta).reduce((s, c) => s + num(c.valorMensual), 0);
  const cuotasRestante = (kDesde) => {
    let t = 0;
    for (let k = kDesde; k <= horizonte; k++) { const p = cuotasPago(sumarMes(ymHoy, k - 1)); t += p; if (k > 1 && p === 0 && conFin.every((c) => c.hasta < sumarMes(ymHoy, k - 1))) break; }
    return t;
  };
  const sinFin = (cuotas || []).filter((c) => !c.hasta && c.desde <= ymHoy && num(c.valorMensual) > 0);
  const presupuesto = deudas.reduce((s, d) => s + d.pago, 0) + prov.pago + cuotasPago(ymHoy);
  const todas = [...deudas, ...(prov.bal0 > 0 ? [prov] : [])];
  const serie = [todas.reduce((s, d) => s + d.bal, 0) + cuotasRestante(1)];
  let interes = 0;
  let libreEn = null;
  const cuotasFin = conFin.reduce((m, c) => (c.hasta > m ? c.hasta : m), "");
  for (let k = 1; k <= horizonte; k++) {
    const ym = sumarMes(ymHoy, k - 1);
    todas.forEach((d) => { if (d.bal > 1) { const i = d.bal * d.mv; interes += i; d.bal += i; } });
    let programado = cuotasPago(ym);
    todas.forEach((d) => { if (d.bal > 1) { const p = Math.min(d.pago, d.bal); d.bal -= p; programado += p; } });
    let bolsa = Math.max(0, num(extra));
    if (rodar) bolsa += Math.max(0, presupuesto - programado);
    const orden = [...todas].sort((a, b) => (a.tipo === "proveedor") - (b.tipo === "proveedor") || b.mv - a.mv);
    orden.forEach((d) => { if (bolsa > 0 && d.bal > 1) { const p = Math.min(bolsa, d.bal); d.bal -= p; bolsa -= p; } });
    todas.forEach((d) => { if (d.bal <= 1) { d.bal = 0; if (d.fin === null) d.fin = k; } });
    const restoCuotas = cuotasRestante(k + 1);
    const total = todas.reduce((s, d) => s + d.bal, 0) + restoCuotas;
    serie.push(Math.max(0, total));
    if (total <= 1 && (cuotasFin === "" || ym >= cuotasFin)) { libreEn = k; break; }
  }
  const sinPlan = todas.filter((d) => d.bal > 1);
  const n = libreEn === null ? null : libreEn;
  return {
    n, ym: n === null ? null : sumarMes(ymHoy, n - 1), serie, interes, presupuesto, sinPlan: sinPlan.map((d) => d.nombre), sinFinCuotas: sinFin,
    hitos: todas.map((d) => ({ nombre: d.nombre, tipo: d.tipo, k: d.fin, ym: d.fin === null ? null : sumarMes(ymHoy, d.fin - 1), saldo0: d.bal0 })).sort((a, b) => (a.k === null) - (b.k === null) || a.k - b.k),
    cuotasFin: cuotasFin || null,
  };
}

// ─── Costo del dinero ────────────────────────────────────────────────────────
// banco = [{ ym, abonos, cargos, c4x1000, comisiones, plan, cupo, sobregiro }] (resumen mensual de la cuenta, de los extractos).
export function costoDelDinero({ banco, externas }) {
  const meses = (banco || []).slice().sort((a, b) => String(a.ym).localeCompare(String(b.ym))).map((b) => {
    const costo = num(b.c4x1000) + num(b.comisiones) + num(b.plan) + num(b.cupo) + num(b.sobregiro);
    return { ym: b.ym, abonos: num(b.abonos), cargos: num(b.cargos), c4x1000: num(b.c4x1000), comisiones: num(b.comisiones), plan: num(b.plan), cupo: num(b.cupo), sobregiro: num(b.sobregiro), costo };
  });
  const suma = (k) => meses.reduce((s, m) => s + m[k], 0);
  const n = meses.length;
  const costoTotal = suma("costo");
  const abonosTotal = suma("abonos");
  const interesMensual = (externas || []).filter((e) => e.tipo !== "impuesto" && e.tipo !== "embargo").reduce((s, e) => s + num(e.saldo) * tasaMensual(e.tasaEA), 0);
  const bancoMensual = n ? costoTotal / n : 0;
  return {
    meses, n, costoTotal, abonosTotal, bancoMensual, interesMensual, costoMensual: bancoMensual + interesMensual, costo12: (bancoMensual + interesMensual) * 12,
    pctIngreso: abonosTotal > 0 ? costoTotal / abonosTotal : null,
    pct4x1000: costoTotal > 0 ? suma("c4x1000") / costoTotal : null,
    porConcepto: { c4x1000: suma("c4x1000"), comisiones: suma("comisiones"), plan: suma("plan"), cupo: suma("cupo"), sobregiro: suma("sobregiro") },
    pctDelIngresoMensual: abonosTotal > 0 && n ? (bancoMensual + interesMensual) / (abonosTotal / n) : null,
  };
}
