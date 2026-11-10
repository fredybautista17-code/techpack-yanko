// (2026-11-10, a pedido de Fredy) Financiera · «Lo que cuesta operar»: reúne en una sola pantalla lo que ya existe (Cuánto debo pagar, Insumos y telas,
// abonos clasificados por rubro, cuotas, liquidaciones programadas, pagos a proveedores programados) para responder tres cosas:
// 1) ¿cuánto cuesta operar el mes? 2) ¿qué debo pagar y cuándo? 3) ¿cuánto debo aparte (deuda)? Funciones puras (sin Firestore ni React).
import { lunesDe, sumarDiasISO, esISO } from "./financiera-programar-pagos-calculo";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const COL_PAGOS_OPERAR = "contabilidad_cuotas_pagos"; // las marcas «Pagado» de SS, provisiones y gastos van aquí como op__{clave}__{mes}
export const CLAVES_SIN_DIA = [
  { clave: "seguridad", concepto: "Seguridad social", rubro: "mano", ir: "cuanto_pagar", campo: "seguridad" },
  { clave: "provisiones", concepto: "Provisiones (cesantías, prima, vacaciones)", rubro: "mano", ir: "cuanto_pagar", campo: "provisiones" },
  { clave: "gastos_excel", concepto: "Gastos del Excel / Busint", rubro: "gastos", ir: "cuanto_pagar", campo: "gastosExcel" },
  { clave: "gastos_planta", concepto: "Gastos de Planta (repuestos, hilazas)", rubro: "gastos", ir: "cuanto_pagar", campo: "gastosPlanta" },
];

const ultimoDia = (ym) => { const [a, m] = String(ym).split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const dd = (n) => String(n).padStart(2, "0");
const mesesEntre = (desde, hasta) => { const [a1, m1] = String(desde).split("-").map(Number); const [a2, m2] = String(hasta).split("-").map(Number); return (a2 - a1) * 12 + (m2 - m1); };

// Lo que ya entró por un rubro (Anticipo Nómina, Anticipo Insumos…): sale del cumplimiento del presupuesto de clientes.
export const abonoDe = (porCategoria, categoria) => num(((porCategoria || []).find((c) => c.categoria === categoria) || {}).abonado);

// Programadas por persona (liquidaciones) guardadas en contabilidad_cuotas_pagos como liq_prog__{liqId}__{mes}.
export function liqProgramadas(pagosMapa, ym) {
  return Object.values(pagosMapa || {}).filter((d) => d && d.kind === "liq_programada" && d.ym === ym);
}

export function armarOperar({ ym, hoy, est, porCategoria, pagosMapa, cuotasLista, programados, liqRetiro, pagadoNomina, insumos, deudaProv, recogido }) {
  const ult = ultimoDia(ym);
  const items = [];
  const fechaDe = (dia) => `${ym}-${dd(dia)}`;
  const agregar = (it) => items.push({ pagado: 0, atrasadoOrigen: "", ...it, valor: Math.max(0, num(it.valor)), pagado: Math.max(0, num(it.pagado)) });

  // Mano de obra · nómina por quincena (lo pagado en «Pago de Nómina» se reparte primero a la quincena 1)
  const mitad = num(est.nomina) / 2;
  const pagN = num(pagadoNomina);
  if (mitad > 0) {
    agregar({ id: "nom1", dia: 15, concepto: "Nómina · quincena 1", aprox: true, valor: mitad, pagado: Math.min(mitad, pagN), clase: "operar", rubro: "mano", ir: "pago_nomina", accion: null });
    agregar({ id: "nom2", dia: ult, concepto: "Nómina · quincena 2", aprox: true, valor: mitad, pagado: Math.min(mitad, Math.max(0, pagN - mitad)), clase: "operar", rubro: "mano", ir: "pago_nomina", accion: null });
  }

  // Sin día fijo: seguridad social, provisiones y gastos
  CLAVES_SIN_DIA.forEach((k) => {
    const valor = num(est[k.campo]);
    if (valor <= 0) return;
    const doc = (pagosMapa || {})[`op__${k.clave}__${ym}`];
    agregar({ id: `op_${k.clave}`, dia: null, concepto: k.concepto, valor, pagado: num(doc && doc.pagado), clase: "operar", rubro: k.rubro, ir: k.ir, accion: { tipo: "op", clave: k.clave } });
  });

  // Cuotas de Endeudamiento (deuda). Las «Liquidaciones de retiro» automáticas se muestran por persona si ya están programadas.
  const progs = liqProgramadas(pagosMapa, ym).filter((d) => (liqRetiro || []).some((l) => l.id === d.liqId));
  (cuotasLista || []).forEach((c) => {
    const esPlan = String(c.id).startsWith("plan_liquidaciones__");
    if (esPlan && progs.length) return;
    const dia = c.diaPago ? Math.min(Math.max(1, Math.round(num(c.diaPago)) || 1), ult) : null;
    const doc = (pagosMapa || {})[`${c.id}__${ym}`];
    const pagado = esPlan ? num((pagosMapa || {})[`plan_liquidaciones__${ym}__${ym}`] && (pagosMapa || {})[`plan_liquidaciones__${ym}__${ym}`].pagado) : num(doc && doc.pagado);
    agregar({ id: `cuota_${c.id}`, dia, concepto: esPlan ? "Liquidaciones de retiro (plan del mes)" : `Cuota · ${c.nombre}`, sub: c.acreedor || "", valor: num(c.valorMensual), pagado, clase: "deuda", rubro: "deuda", ir: "endeudamiento", accion: esPlan ? null : { tipo: "cuota", cuotaId: c.id } });
  });
  progs.forEach((d) => {
    const l = (liqRetiro || []).find((x) => x.id === d.liqId) || {};
    const pagada = l.estadoPago === "pagada" && String(l.pagadaEn || "").slice(0, 7) === ym;
    agregar({ id: `liq_${d.liqId}`, dia: Math.min(ult, Math.max(1, Math.round(num(d.dia)) || 25)), concepto: `Liquidación · ${d.nombre || l.nombre || "trabajador"}`, sub: "Programada en Endeudamiento", valor: num(d.monto), pagado: pagada ? num(d.monto) : 0, clase: "deuda", rubro: "deuda", ir: "endeudamiento", accion: { tipo: "liq", liqId: d.liqId } });
  });

  // Facturas de proveedores programadas (Pagos a Proveedores): lo vencido es deuda; lo demás es operar (insumos y telas)
  (programados || []).filter((x) => (x.empresa || "yanko") === "yanko").forEach((x) => {
    const pagada = x.estado === "pagado";
    if (pagada && String(x.pagadoEn || "").slice(0, 7) !== ym) return;
    if (!pagada && !(esISO(x.fecha) && x.fecha <= fechaDe(ult))) return;
    const antes = esISO(x.fecha) && x.fecha < `${ym}-01`;
    const dia = antes || !esISO(x.fecha) ? 1 : Number(x.fecha.slice(8, 10));
    const vencida = !!x.vence && esISO(x.vence) && x.vence < hoy;
    agregar({
      id: `prov_${x.id}`, dia, concepto: `Proveedor · ${x.proveedorMostrado || x.proveedor || "—"}`, sub: [x.concepto, x.nfact ? `fact. ${x.nfact}` : ""].filter(Boolean).join(" · "),
      valor: num(x.valor), pagado: pagada ? num(x.valor) : 0, clase: vencida ? "deuda" : "operar", rubro: vencida ? "deuda" : "insumos", ir: "pagos_proveedores", accion: { tipo: "prov", id: x.id },
      atrasadoOrigen: !pagada && antes ? x.fecha : "",
    });
  });

  items.forEach((it) => { it.falta = Math.max(0, it.valor - it.pagado); it.listo = it.falta < 1; it.fecha = it.dia ? fechaDe(it.dia) : ""; it.atrasado = !it.listo && !!it.fecha && it.fecha < hoy; });

  // Rubros
  const mano = num(est.nomina) + num(est.seguridad) + num(est.provisiones);
  const insumosCuesta = num(insumos);
  const gastos = num(est.gastos);
  const sumaPagado = (fn) => items.filter(fn).reduce((s, it) => s + it.pagado, 0);
  const aboNom = abonoDe(porCategoria, "Anticipo Nómina");
  const aboIns = abonoDe(porCategoria, "Anticipo Insumos");
  const rubros = [
    { k: "mano", label: "Mano de obra", sub: [["Nómina", est.nomina, "pago_nomina"], ["Seguridad social", est.seguridad, "cuanto_pagar"], ["Provisiones", est.provisiones, "cuanto_pagar"]], cuesta: mano, abono: aboNom, abonoNombre: "Anticipo Nómina", pagado: sumaPagado((it) => it.rubro === "mano"), ir: "cuanto_pagar" },
    { k: "insumos", label: "Insumos y telas", sub: [], cuesta: insumosCuesta, abono: null, abonoNombre: "Tela no descuenta", pagado: sumaPagado((it) => it.rubro === "insumos"), ir: "insumos_operar" },
    { k: "gastos", label: "Gastos básicos", sub: [["Excel / Busint", est.gastosExcel, "cuanto_pagar"], ["Planta", est.gastosPlanta, "cuanto_pagar"]], cuesta: gastos, abono: aboIns, abonoNombre: "Anticipo Insumos", pagado: sumaPagado((it) => it.rubro === "gastos"), ir: "cuanto_pagar" },
  ].map((r) => ({ ...r, falta: r.abono === null ? null : Math.max(0, r.cuesta - r.abono) }));
  const cuestaOperar = mano + insumosCuesta + gastos;

  // Esta semana (lunes a domingo) más lo atrasado sin pagar
  const lunes = lunesDe(hoy);
  const domingo = sumarDiasISO(lunes, 6);
  const sinPagar = items.filter((it) => !it.listo && it.fecha);
  const atrasado = sinPagar.filter((it) => it.atrasado).reduce((s, it) => s + it.falta, 0);
  const estaSemana = sinPagar.filter((it) => !it.atrasado && it.fecha >= lunes && it.fecha <= domingo).reduce((s, it) => s + it.falta, 0);
  const faltaOperar = items.filter((it) => it.clase === "operar").reduce((s, it) => s + it.falta, 0);
  const faltaDeuda = items.filter((it) => it.clase === "deuda").reduce((s, it) => s + it.falta, 0);

  // Semanas del mes
  const semanas = [];
  for (let l = lunesDe(`${ym}-01`); l <= fechaDe(ult); l = sumarDiasISO(l, 7)) {
    const d = sumarDiasISO(l, 6);
    const desde = l < `${ym}-01` ? 1 : Number(l.slice(8, 10));
    const hasta = d > fechaDe(ult) ? ult : Number(d.slice(8, 10));
    const lista = items.filter((it) => it.dia && it.dia >= desde && it.dia <= hasta).sort((a, b) => a.dia - b.dia || b.valor - a.valor);
    semanas.push({ lunes: l, desde, hasta, items: lista, actual: hoy >= l && hoy <= d });
  }
  const sinDia = items.filter((it) => !it.dia);

  // Deuda, aparte
  const cuotasReales = (cuotasLista || []).filter((c) => !String(c.id).startsWith("plan_liquidaciones__"));
  const cuotasMes = cuotasReales.reduce((s, c) => s + num(c.valorMensual), 0);
  const saldoCuotas = cuotasReales
    .filter((c) => c.hasta && !c.vinculoLiquidaciones && !/liquidaci/i.test(String(c.nombre || "")))
    .reduce((s, c) => s + num(c.valorMensual) * (mesesEntre(ym, c.hasta) + 1), 0);
  const cuotasSinFin = cuotasReales.filter((c) => !c.hasta && !c.vinculoLiquidaciones && !/liquidaci/i.test(String(c.nombre || ""))).length;
  const liqPend = (liqRetiro || []).filter((l) => l.estadoPago !== "pagada" && num(l.totalAPagar) > 0);
  const liqPendTotal = liqPend.reduce((s, l) => s + num(l.totalAPagar), 0);
  const liqProgramado = progs.reduce((s, d) => s + num(d.monto), 0);
  const vencidoProv = deudaProv ? num(deudaProv.vencido) : null;
  const deudaTotal = (vencidoProv || 0) + saldoCuotas + liqPendTotal;

  return {
    ym, items, semanas, sinDia, rubros, cuestaOperar,
    kpi: { cuestaOperar, estaSemana: estaSemana + atrasado, atrasado, semanaSola: estaSemana, faltaOperar, faltaDeuda, faltaTotal: faltaOperar + faltaDeuda, lunes, domingo },
    dado: { recogido: num(recogido), cubre: cuestaOperar > 0 ? num(recogido) / cuestaOperar : null },
    deuda: { vencidoProv, fechaCorte: deudaProv ? deudaProv.fechaCorte : "", cuotasMes, saldoCuotas, cuotasSinFin, liqPendTotal, liqPendN: liqPend.length, liqProgramado, deudaTotal },
  };
}
