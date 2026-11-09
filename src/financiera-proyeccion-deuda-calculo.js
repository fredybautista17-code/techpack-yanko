// (2026-11-08, a pedido de Fredy) Financiera · «Proyección de deuda»: con el ingreso mensual, cuánto queda libre cada mes después de lo que sale
// sí o sí y de las cuotas, cuánta deuda nueva cabe y cuándo se pone al día con proveedores. Funciones puras (sin Firestore ni React).
//   margen del mes = ingreso − operación (nómina + seguridad social + provisiones + gastos, base del MES ANTERIOR) − cuotas − cuota nueva simulada
//   colchón = % del ingreso que se deja libre (por defecto 10 %)   ·   para proveedores = margen − colchón (si es positivo)
import { cuotasDelMes, sumarMes, CATEGORIA_NO_CUENTA } from "./financiera-cuanto-pagar-calculo";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const HORIZONTE = 18;
export const COLCHON_DEFECTO = 0.1;
export const ESCENARIOS = [
  { k: "cons", txt: "Conservador", ayuda: "El peor de los últimos 6 meses de abonos de clientes" },
  { k: "prom", txt: "Promedio 6 meses", ayuda: "Promedio de los últimos 6 meses de abonos de clientes" },
  { k: "pres", txt: "Presupuesto de clientes", ayuda: "Lo presupuestado en Presupuesto Clientes para cada mes (sin presupuesto, usa el promedio)" },
];

// cache = financiera_ingresos_cache/{total_yanko|main} { meses: [{ ym, total }] }. Solo meses completos (anteriores al mes en curso) con abonos > 0.
export function ingresosBase(cache, mesHoy, n = 6) {
  const lista = ((cache && cache.meses) || []).filter((m) => m.ym < mesHoy && num(m.total) > 0).sort((a, b) => (a.ym < b.ym ? 1 : -1)).slice(0, n);
  if (!lista.length) return null;
  const totales = lista.map((m) => num(m.total));
  return {
    n: lista.length, desde: lista[lista.length - 1].ym, hasta: lista[0].ym, meses: lista.slice().reverse().map((m) => ({ ym: m.ym, total: num(m.total) })),
    conservador: Math.min(...totales), promedio: totales.reduce((t, v) => t + v, 0) / totales.length,
  };
}

// presupuestos = contabilidad_presupuestos_cliente { mes, categoria, monto } → { "AAAA-MM": total } sin «Anticipo Tela» (igual que Presupuesto Clientes).
export function presupuestoClientesPorMes(presupuestos) {
  const m = {};
  (presupuestos || []).filter((p) => p.categoria !== CATEGORIA_NO_CUENTA && p.mes).forEach((p) => { m[p.mes] = (m[p.mes] || 0) + num(p.monto); });
  return m;
}

export function ingresoDelMes({ escenario, base, presupuestoMes, ym }) {
  if (!base) return { valor: 0, origen: "sin datos" };
  if (escenario === "cons") return { valor: base.conservador, origen: "conservador" };
  if (escenario === "prom") return { valor: base.promedio, origen: "promedio de 6 meses" };
  const p = num((presupuestoMes || {})[ym]);
  return p > 0 ? { valor: p, origen: "presupuesto de clientes" } : { valor: base.promedio, origen: "promedio (ese mes aún no tiene presupuesto)" };
}

// Lo que sale sí o sí (sin cuotas ni compras de materiales) a partir de cuantoPagarMes(): nómina, seguridad y provisiones del MES ANTERIOR; los gastos (Excel +
// Planta) según modo: "promedio" = promedio ponderado de los meses anteriores (si hay alguno con gastos), "anterior" = solo los del mes anterior.
export function operacionDe(res, modo) {
  const ant = res.anterior;
  const gp = res.gastosPromedio || { total: 0, excel: 0, planta: 0 };
  const usaProm = modo !== "anterior" && gp.total > 0;
  return {
    nomina: ant.nomina, seguridad: ant.seguridad, provisiones: ant.provisiones,
    gastos: usaProm ? gp.total : ant.gastos, gastosExcel: usaProm ? gp.excel : ant.gastosExcel, gastosPlanta: usaProm ? gp.planta : ant.gastosPlanta,
    gastosModo: usaProm ? "promedio" : "anterior",
  };
}

// nueva = { cuota, plazo, desde: "AAAA-MM" } (la deuda que se quiere probar). operacion = { nomina, seguridad, provisiones, gastos } del mes anterior.
export function proyectarDeuda({ ymInicio, horizonte = HORIZONTE, escenario = "cons", base, presupuestoMes, operacion, cuotas, colchonPct = COLCHON_DEFECTO, nueva, proveedores, comprasMes }) {
  const op = { nomina: num(operacion?.nomina), seguridad: num(operacion?.seguridad), provisiones: num(operacion?.provisiones), gastos: num(operacion?.gastos), gastosExcel: num(operacion?.gastosExcel), gastosPlanta: num(operacion?.gastosPlanta), gastosModo: operacion?.gastosModo || "anterior" };
  const opTotal = op.nomina + op.seguridad + op.provisiones + op.gastos;
  const cuotaNueva = Math.max(0, num(nueva?.cuota));
  const plazo = Math.max(1, Math.round(num(nueva?.plazo)) || 1);
  const desde = nueva?.desde || sumarMes(ymInicio, 1);
  const vigentes0 = cuotasDelMes(cuotas, ymInicio).lista;
  let acumProv = 0;
  let cubreVencido = null;
  let cubreTodo = null;
  const meses = [];
  for (let i = 0; i < horizonte; i++) {
    const ym = sumarMes(ymInicio, i);
    const ing = ingresoDelMes({ escenario, base, presupuestoMes, ym });
    const cu = cuotasDelMes(cuotas, ym);
    const nu = ym >= desde && ym < sumarMes(desde, plazo) ? cuotaNueva : 0;
    const compras = num(comprasMes?.[ym]); // (2026-11-09) pago de compras de materiales futuras que cae en este mes
    const margenBase = ing.valor - opTotal - cu.total - compras;
    const margen = margenBase - nu;
    const colchon = ing.valor * colchonPct;
    const paraProv = Math.max(0, margen - colchon);
    acumProv += paraProv;
    if (cubreVencido === null && num(proveedores?.vencido) > 0 && acumProv >= num(proveedores.vencido)) cubreVencido = i;
    if (cubreTodo === null && num(proveedores?.vencido) + num(proveedores?.dentro) > 0 && acumProv >= num(proveedores.vencido) + num(proveedores.dentro)) cubreTodo = i;
    meses.push({
      i, ym, ingreso: ing.valor, ingresoOrigen: ing.origen, operacion: opTotal, compras, cuotas: cu.total, cuotasLista: cu.lista, nueva: nu,
      margenBase, margen, colchon, paraProveedores: paraProv, acumProveedores: acumProv,
      cobertura: opTotal + compras + cu.total + nu > 0 ? ing.valor / (opTotal + compras + cu.total + nu) : null,
      estado: margen < 0 ? "noAlcanza" : margen < colchon ? "ajustado" : "colchon",
      terminan: vigentes0.filter((c) => c.hasta === ym),
      terminaron: vigentes0.filter((c) => c.hasta && c.hasta < ym),
      empiezan: (cuotas || []).filter((c) => c.desde === ym && ym > ymInicio),
    });
  }
  // Cuota máxima segura: la que cabe en TODOS los meses de la ventana de la deuda nueva (margen sin la nueva − colchón del peor mes).
  const ventana = meses.filter((m) => m.ym >= desde && m.ym < sumarMes(desde, plazo));
  const peorVentana = ventana.length ? Math.min(...ventana.map((m) => m.margenBase - m.colchon)) : null;
  const cuotaMaxSegura = peorVentana === null ? 0 : Math.max(0, peorVentana);
  const libera = (cuotas || [])
    .filter((c) => c.hasta && c.hasta >= ymInicio && cuotasDelMes([c], ymInicio).lista.length)
    .map((c) => ({ nombre: c.nombre, valor: num(c.valorMensual), hasta: c.hasta, liberaEn: sumarMes(c.hasta, 1) }))
    .filter((c) => c.liberaEn <= sumarMes(ymInicio, horizonte - 1))
    .sort((a, b) => a.hasta.localeCompare(b.hasta));
  const coberturas = meses.map((m) => m.cobertura).filter((v) => v !== null);
  return {
    meses, comprasTotal: meses.reduce((a, m) => a + m.compras, 0), operacion: op, operacionTotal: opTotal, cuotaMaxSegura, desde, plazo, cuotaNueva, libera,
    mesesNoAlcanzan: meses.filter((m) => m.estado === "noAlcanza"),
    mesesAjustados: meses.filter((m) => m.estado === "ajustado" && m.nueva > 0),
    peorMesNuevo: meses.filter((m) => m.nueva > 0).length ? meses.filter((m) => m.nueva > 0).reduce((a, m) => (m.margen < a.margen ? m : a)) : null,
    coberturaMinima: coberturas.length ? Math.min(...coberturas) : null,
    acumProveedores: acumProv, cubreVencido, cubreTodo,
    sinBase: !base,
  };
}
