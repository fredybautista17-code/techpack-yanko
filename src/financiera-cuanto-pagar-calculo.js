// ─── FINANCIERA · ¿Cuánto debo pagar al mes? (cálculo) ───────────────────────
// (2026-11-05, a pedido de Fredy) Junta lo que sale cada mes: nómina (neto), seguridad social, provisiones (cesantías, intereses, prima,
// vacaciones), gastos del Excel y cuotas (endeudamiento). Compara con el mes anterior y con el promedio ponderado de los 6 meses
// anteriores (el más viejo pesa 1 y el más reciente 6) y dice cuánto se necesita al mes con las cuotas vigentes.
// Todo es lectura: las únicas cosas que se escriben son las cuotas (colección financiera_cuotas), desde la pantalla de Endeudamiento.
import { totalGastos } from "./costos-general-calculo";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const TIPOS_NOMINA = ["Fiscal", "Fiscal Destajo", "Destajo", "Prestación de Servicios"];
export const MESES_PONDERADO = 6;

// Seguridad social: EPS + pensión (trabajador y empresa) + ARL + Caja. Solo la tienen las nóminas fiscales.
export function seguridadSocialDe(l) {
  return num(l.epsTrabajador) + num(l.pensionTrabajador) + num(l.pensionEmpleador) + num(l.arlEmpleador) + num(l.cajaCompensacionEmpleador) + num(l.epsEmpleador);
}
// Prestaciones de la quincena: cesantías + intereses + prima + vacaciones (Prestación de Servicios no tiene).
export function prestacionesDe(l) {
  return num(l.cesantiasPeriodo) + num(l.interesesPeriodo) + num(l.primaPeriodo) + num(l.vacacionesPeriodo);
}

// (2026-11-05, a pedido de Fredy) Detalle por persona de las provisiones de un tipo de nómina en el mes: una fila por trabajador
// (suma de sus quincenas confirmadas) con cesantías, intereses, prima y vacaciones, de mayor a menor.
export function personasProvisionDe(lista) {
  const m = new Map();
  (lista || []).forEach((l) => {
    const k = l.trabajadorId || l.nombre || l.id;
    if (!m.has(k)) m.set(k, { clave: k, nombre: l.nombre || String(k), quincenas: 0, cesantias: 0, intereses: 0, prima: 0, vacaciones: 0, total: 0 });
    const r = m.get(k);
    r.quincenas += 1;
    r.cesantias += num(l.cesantiasPeriodo);
    r.intereses += num(l.interesesPeriodo);
    r.prima += num(l.primaPeriodo);
    r.vacaciones += num(l.vacacionesPeriodo);
    r.total = r.cesantias + r.intereses + r.prima + r.vacaciones;
  });
  return [...m.values()].sort((a, b) => b.total - a.total);
}

// "AAAA-MM" ± n meses
export function sumarMes(ym, n) {
  const [a, m] = String(ym).split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
// Los 7 meses del gráfico: de ym-6 a ym.
export function mesesHasta(ym, atras = MESES_PONDERADO) {
  return Array.from({ length: atras + 1 }, (_, i) => sumarMes(ym, i - atras));
}

// ─── Cuotas ──────────────────────────────────────────────────────────────────
// cuota = { id, nombre, acreedor, valorMensual, diaPago, desde: "AAAA-MM", hasta: "AAAA-MM" | "", nota }
export function cuotaVigente(c, ym) {
  if (!c || !c.desde) return false;
  return c.desde <= ym && (!c.hasta || ym <= c.hasta);
}
export function cuotasDelMes(cuotas, ym) {
  const lista = (cuotas || []).filter((c) => cuotaVigente(c, ym));
  return { total: lista.reduce((s, c) => s + num(c.valorMensual), 0), lista };
}
// Cómo baja lo que se paga por cuotas a medida que terminan: [{ ym, total }] desde ym, solo cuando cambia.
export function escalonCuotas(cuotas, ym, max = 6) {
  const puntos = new Set([ym]);
  (cuotas || []).forEach((c) => { if (c.hasta && c.hasta >= ym) puntos.add(sumarMes(c.hasta, 1)); });
  const pasos = [];
  [...puntos].sort().forEach((p) => {
    const total = cuotasDelMes(cuotas, p).total;
    if (!pasos.length || pasos[pasos.length - 1].total !== total) pasos.push({ ym: p, total });
  });
  return pasos.slice(0, max);
}

// ─── Un mes ──────────────────────────────────────────────────────────────────
// liquidaciones: { "Fiscal": [...], "Fiscal Destajo": [...], "Destajo": [...], "Prestación de Servicios": [...] } (ya filtradas o no; aquí se filtra por mes)
// gastosDocs: [{ id: "AAAA-MM", lineas: [...] }] (costos_gastos_mes)
export function gastosDelMes(gastosDocs, ym) {
  const docs = gastosDocs || [];
  const propio = docs.find((g) => g.id === ym);
  if (propio) return { total: totalGastos(propio.lineas || []).total, origen: "guardado", deMes: ym, lineas: (propio.lineas || []).filter((l) => l.incluir) };
  const anterior = docs.filter((g) => g.id < ym).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  if (anterior) return { total: totalGastos(anterior.lineas || []).total, origen: "anterior", deMes: anterior.id, lineas: (anterior.lineas || []).filter((l) => l.incluir) };
  return { total: 0, origen: "ninguno", deMes: "", lineas: [] };
}

export function rubrosDelMes({ ym, liquidaciones, gastosDocs, cuotas }) {
  const porTipo = {};
  TIPOS_NOMINA.forEach((tipo) => {
    const lista = ((liquidaciones || {})[tipo] || []).filter((l) => String(l.periodoId || "").startsWith(`${ym}-`));
    const quincenas = [...new Set(lista.map((l) => String(l.periodoId).slice(-2)))].sort();
    porTipo[tipo] = {
      tipo, personas: new Set(lista.map((l) => l.trabajadorId || l.nombre || l.id)).size, quincenas,
      neto: lista.reduce((s, l) => s + num(l.netoAPagar), 0),
      seguridad: lista.reduce((s, l) => s + seguridadSocialDe(l), 0),
      prestaciones: lista.reduce((s, l) => s + prestacionesDe(l), 0),
      cesantias: lista.reduce((s, l) => s + num(l.cesantiasPeriodo), 0),
      intereses: lista.reduce((s, l) => s + num(l.interesesPeriodo), 0),
      prima: lista.reduce((s, l) => s + num(l.primaPeriodo), 0),
      vacaciones: lista.reduce((s, l) => s + num(l.vacacionesPeriodo), 0),
      personasLista: personasProvisionDe(lista),
    };
  });
  const tipos = Object.values(porTipo);
  const conDatos = tipos.filter((t) => t.quincenas.length > 0);
  const faltan = conDatos.filter((t) => t.quincenas.length < 2).map((t) => ({ tipo: t.tipo, falta: ["Q1", "Q2"].filter((q) => !t.quincenas.includes(q)) }));
  const g = gastosDelMes(gastosDocs, ym);
  const c = cuotasDelMes(cuotas, ym);
  const nomina = tipos.reduce((s, t) => s + t.neto, 0);
  const seguridad = tipos.reduce((s, t) => s + t.seguridad, 0);
  const provisiones = tipos.reduce((s, t) => s + t.prestaciones, 0);
  return {
    ym, porTipo, nomina, seguridad, provisiones, gastos: g.total, cuotas: c.total,
    total: nomina + seguridad + provisiones + g.total + c.total,
    gastosInfo: g, cuotasLista: c.lista,
    hayDatos: conDatos.length > 0,
    completo: conDatos.length > 0 && faltan.length === 0,
    faltan,
    quincenasConfirmadas: conDatos.length ? Math.min(...conDatos.map((t) => t.quincenas.length)) : 0,
  };
}

// ─── Promedio ponderado de los 6 meses anteriores ────────────────────────────
// meses: rubrosDelMes de ym-6 … ym-1 (del más viejo al más reciente). Solo cuentan los meses completos (todas sus quincenas confirmadas).
export function ponderadoDe(meses) {
  const pesados = meses.map((m, i) => ({ m, w: i + 1 })).filter((x) => x.m.completo);
  // Los gastos solo se promedian en los meses que ya tienen gastos cargados (un mes sin ninguno no es «cero gastos», es dato que falta).
  const conGastos = pesados.filter((x) => x.m.gastosInfo.origen !== "ninguno");
  const prom = (lista, k) => { const sw = lista.reduce((s, x) => s + x.w, 0); return sw ? lista.reduce((s, x) => s + x.m[k] * x.w, 0) / sw : 0; };
  const out = { nomina: prom(pesados, "nomina"), seguridad: prom(pesados, "seguridad"), provisiones: prom(pesados, "provisiones"), gastos: prom(conGastos, "gastos"), cuotas: prom(pesados, "cuotas") };
  out.total = out.nomina + out.seguridad + out.provisiones + out.gastos + out.cuotas;
  out.operacion = out.nomina + out.seguridad + out.provisiones + out.gastos;
  out.mesesUsados = pesados.length;
  out.mesesGastos = conGastos.length;
  out.mesesPosibles = meses.length;
  out.meses = pesados.map((x) => x.m.ym);
  return out;
}

// Todo junto para la pantalla.
export function cuantoPagarMes({ ym, liquidaciones, gastosDocs, cuotas }) {
  const lista = mesesHasta(ym).map((m) => rubrosDelMes({ ym: m, liquidaciones, gastosDocs, cuotas }));
  const actual = lista[lista.length - 1];
  const anterior = lista[lista.length - 2];
  const previos = lista.slice(0, -1);
  const pond = ponderadoDe(previos);
  const cuotasHoy = actual.cuotas;
  // (2026-11-05, a pedido de Fredy) La base de «Necesito al mes» pasa del ponderado al MES ANTERIOR: operación del mes anterior + cuotas vigentes hoy.
  const operacionAnterior = anterior.nomina + anterior.seguridad + anterior.provisiones + anterior.gastos;
  return {
    ym, lista, actual, anterior, ponderado: pond, necesito: pond.operacion + cuotasHoy, cuotasHoy, escalon: escalonCuotas(cuotas, ym),
    operacionAnterior, necesitoAnterior: operacionAnterior + cuotasHoy, estimado: estimadoDelMes(actual, anterior),
  };
}

// ─── Estimado del mes: por tipo de nómina, lo confirmado si ya está completo; si no, se completa con el mes anterior ─────────────────────
// 2 quincenas confirmadas = confirmado · 1 = lo confirmado + una quincena promedio del mes anterior · 0 = el mes anterior completo.
// Gastos del Excel y cuotas ya traen su propio respaldo (gastos: el último mes cargado; cuotas: las vigentes del mes).
const CAMPOS_ESTIMADO = [["nomina", "neto"], ["seguridad", "seguridad"], ["provisiones", "prestaciones"]];
export function estimadoDelMes(actual, anterior) {
  const out = { nomina: 0, seguridad: 0, provisiones: 0 };
  const fuentes = [];
  TIPOS_NOMINA.forEach((tipo) => {
    const a = actual.porTipo[tipo];
    const b = anterior.porTipo[tipo];
    const k = a.quincenas.length;
    const kb = b.quincenas.length;
    if (k === 0 && kb === 0) return;
    let fuente = "confirmado";
    if (k < 2) fuente = k === 1 ? "parcial" : "mes anterior";
    CAMPOS_ESTIMADO.forEach(([dest, campo]) => {
      const porQuincenaAnterior = kb > 0 ? b[campo] / kb : 0;
      out[dest] += k >= 2 ? a[campo] : a[campo] + porQuincenaAnterior * (2 - k);
    });
    fuentes.push({ tipo, fuente, quincenas: k });
  });
  out.gastos = actual.gastos;
  out.cuotas = actual.cuotas;
  out.operacion = out.nomina + out.seguridad + out.provisiones + out.gastos;
  out.total = out.operacion + out.cuotas;
  out.fuentes = fuentes;
  out.gastosOrigen = actual.gastosInfo.origen;
  out.sinNominaConfirmada = fuentes.length > 0 && fuentes.every((f) => f.fuente !== "confirmado");
  return out;
}

// ─── ¿Voy a cumplir con el Presupuesto de Clientes? ─────────────────────────────────────────────────────────────────────────────────────
// presupuestos = contabilidad_presupuestos_cliente {mes, cliente, categoria, monto}; movimientos = contabilidad_movimientos (los ingresos tienen
// tipo "ingreso", fecha, cliente|proveedor, categoria, valor). «Anticipo Tela» no cuenta (igual que en Presupuesto Clientes).
// diasTotal / diasTranscurridos = días de trabajo del mes (con festivos) para el ritmo; hoyISO = hoy en Bogotá.
export const CATEGORIA_NO_CUENTA = "Anticipo Tela";
export function cumplimientoPresupuesto({ ym, presupuestos, movimientos, confirmado, estimado, hoyISO, diasTotal, diasTranscurridos }) {
  const lineas = (presupuestos || []).filter((p) => p.mes === ym && p.categoria !== CATEGORIA_NO_CUENTA);
  const abonadoDe = (cliente, categoria) => (movimientos || [])
    .filter((m) => m.tipo === "ingreso" && String(m.fecha || "").slice(0, 7) === ym && (m.cliente || m.proveedor) === cliente && m.categoria === categoria)
    .reduce((t, m) => t + num(m.valor), 0);
  const porCat = {};
  lineas.forEach((p) => {
    const c = (porCat[p.categoria] = porCat[p.categoria] || { categoria: p.categoria, presupuestado: 0, abonado: 0 });
    c.presupuestado += num(p.monto);
    c.abonado += abonadoDe(p.cliente, p.categoria);
  });
  const presupuestado = Object.values(porCat).reduce((t, c) => t + c.presupuestado, 0);
  const abonado = Object.values(porCat).reduce((t, c) => t + c.abonado, 0);
  const mesHoy = String(hoyISO || "").slice(0, 7);
  const estado = ym === mesHoy ? "en curso" : ym < mesHoy ? "pasado" : "futuro";
  const transcurridos = estado === "pasado" ? diasTotal : estado === "en curso" ? diasTranscurridos : 0;
  const restantes = Math.max(0, diasTotal - transcurridos);
  const proyeccion = transcurridos > 0 && diasTotal > 0 ? (estado === "pasado" ? abonado : (abonado / transcurridos) * diasTotal) : null;
  const confiable = estado === "pasado" || transcurridos >= 5;
  const total = estimado.total;
  const ratioPres = total > 0 && lineas.length ? presupuestado / total : null;
  const ratioRitmo = proyeccion !== null && confiable && total > 0 ? proyeccion / total : null;
  const disponibles = [ratioPres, ratioRitmo].filter((x) => x !== null);
  const peor = disponibles.length ? Math.min(...disponibles) : null;
  const nivel = !lineas.length ? "sin_presupuesto" : peor === null ? "sin_dato" : peor >= 1 ? "verde" : peor >= 0.85 ? "ambar" : "rojo";
  return {
    lineas: lineas.length, presupuestado, abonado, faltaAbonar: Math.max(0, presupuestado - abonado), avance: presupuestado > 0 ? abonado / presupuestado : null,
    porCategoria: Object.values(porCat),
    estado, transcurridos, restantes, diasTotal, proyeccion, confiable,
    coberturaConfirmado: presupuestado - confirmado.total, coberturaEstimado: presupuestado - total,
    abonadoVsConfirmado: confirmado.total > 0 ? abonado / confirmado.total : null,
    ratioPres, ratioRitmo, nivel,
    faltaParaEstimado: Math.max(0, total - abonado),
    abonoPorDia: restantes > 0 ? Math.max(0, total - abonado) / restantes : null,
  };
}

// ─── ¿Qué pagar primero? (2026-11-05, a pedido de Fredy) ─────────────────────────────────────────────────────────────────────────────────
// Reparte un cupo de caja entre las cuentas por pagar YA ORDENADAS por urgencia: cada una recibe lo que pueda hasta agotar el cupo.
// items = [{ nombre, total, ... }] → [{ ...item, paga, falta }]
export function repartirCupo(items, cupo) {
  let resto = Math.max(0, num(cupo));
  return (items || []).map((it) => {
    const deuda = Math.max(0, num(it.total));
    const paga = Math.min(deuda, resto);
    resto -= paga;
    return { ...it, paga, falta: deuda - paga };
  });
}
// Qué sale en el mes y cuándo: las cuotas con su día de pago, la nómina por quincena (fechas aproximadas: 15 y fin de mes) y lo que no tiene fecha.
export function calendarioObligaciones(estimado, cuotasLista, ym) {
  const [a, m] = String(ym).split("-").map(Number);
  const ult = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const conFecha = [
    { dia: 15, concepto: "Nómina · quincena 1", valor: estimado.nomina / 2, aprox: true },
    { dia: ult, concepto: "Nómina · quincena 2", valor: estimado.nomina / 2, aprox: true },
  ];
  const sinDia = [];
  (cuotasLista || []).forEach((c) => {
    const fila = { dia: c.diaPago ? Math.min(Math.max(1, Number(c.diaPago) || 1), ult) : null, concepto: `Cuota · ${c.nombre}`, valor: num(c.valorMensual) };
    if (fila.dia) conFecha.push(fila); else sinDia.push(fila);
  });
  [["Seguridad social", estimado.seguridad], ["Provisiones", estimado.provisiones], ["Gastos del Excel", estimado.gastos]].forEach(([concepto, valor]) => { if (valor > 0) sinDia.push({ dia: null, concepto, valor }); });
  conFecha.sort((x, y) => x.dia - y.dia);
  return { conFecha, sinDia };
}
