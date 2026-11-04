// ─── ¿CUBRO MIS COSTOS? — CÁLCULOS (sin pantalla) ─────────────────────────────
// (2026-11-04, a pedido de Fredy) Cierre mensual del centro de costo general. Responde dos cosas:
//   1. ¿Cuánto estoy recogiendo con los básicos del Dado por Cumplido? (lotes aprobados en el mes)
//   2. ¿Me alcanza para pagar lo que está fuera del costo del lote? = gastos del Excel + nómina fiscal +
//      las ayudas de destajo (los excedentes no se restan) + provisión de prestaciones y vacaciones.
// Lo que producen los trabajadores de destajo (y Fiscal Destajo) YA entra como costo directo del lote, así que
// aquí solo cuenta la diferencia entre lo que se les pagó y lo que produjeron, más su provisión.
import { normTexto, parseNumero } from "./centro-costo-historico-parser";

// Mismas tasas de Nómina (modulo-nomina.jsx): cesantías y prima 8,33 %, intereses 12 % de las cesantías, vacaciones 4,17 %.
export const TASA_CESANTIAS = 0.0833;
export const TASA_PRIMA = 0.0833;
export const TASA_INTERES_CESANTIAS = 0.12;
export const TASA_VACACIONES = 0.0417;
const SMMLV_2026 = 1750905;
const AUXILIO_2026 = 249095;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Provisión del mes de UN trabajador de destajo / Fiscal Destajo.
//   - Destajo: cesantías y prima sobre sueldo + auxilio; vacaciones solo sobre el sueldo.
//   - Fiscal Destajo: cesantías y prima sobre el sueldo (sin auxilio), como lo calcula hoy Nómina.
//   - Se proporciona a lo que se le ha pagado en el mes (costo del cierre) frente a su pago mensual, para que un mes
//     a medias provisione a medias. Sin ficha se supone el mínimo legal.
export function provisionDeTrabajador(costo, ficha) {
  const pagado = Math.max(0, num(costo));
  const sueldo = num(ficha?.sueldo);
  const aux = num(ficha?.auxilioTransporte);
  const tieneFicha = sueldo > 0;
  const s = tieneFicha ? sueldo : SMMLV_2026;
  const a = tieneFicha ? aux : AUXILIO_2026;
  const baseCes = ficha?.tipoNomina === "Fiscal Destajo" ? s : s + a;
  const cesantias = baseCes * TASA_CESANTIAS;
  const intereses = cesantias * TASA_INTERES_CESANTIAS;
  const prima = baseCes * TASA_PRIMA;
  const vacaciones = s * TASA_VACACIONES;
  const mensual = cesantias + intereses + prima + vacaciones;
  const pagoMensual = s + a;
  const fraccion = pagoMensual > 0 ? Math.min(1, pagado / pagoMensual) : 0;
  return { cesantias: cesantias * fraccion, intereses: intereses * fraccion, prima: prima * fraccion, vacaciones: vacaciones * fraccion, total: mensual * fraccion, sinFicha: !tieneFicha };
}

// Ficha de Nómina de un trabajador de los cierres: por id y, si no, por nombre sin tildes.
export function fichaDeTrabajador(t, fichas) {
  const lista = fichas || [];
  const porId = lista.find((f) => f.id === t.id);
  if (porId) return porId;
  const n = normTexto(t.nombre);
  return n ? lista.find((f) => normTexto(f.nombre) === n) || null : null;
}

// ─── Lo que recogen los lotes (Dado por Cumplido) ────────────────────────────
// Aporte de un lote aprobado = lo que el Dado por Cumplido le suma al costo real: base × cortadas + % sobre costo + % sobre
// venta, o sea costoT − costoDefinitivo × cortadas (los mismos números que Contabilidad aprobó).
export function aporteDeLote(l) {
  const cortada = num(l.cantCortada);
  const costoDef = num(l.costoDefinitivo);
  const costoT = num(l.costoT);
  const total = costoT > 0 ? costoT - costoDef * cortada : 0;
  const basicos = num(l.total) > 0 ? num(l.total) : num(l.baseValorUsado) * cortada;
  return { aporte: total, basicos, porcentajes: total - basicos };
}

export function recogidoDeLotes(lotes, bases) {
  const nombreBase = (id) => (bases || []).find((b) => b.id === id)?.nombre || id || "Sin categoría";
  const por = new Map();
  (lotes || []).forEach((l) => {
    const id = l.categoriaBaseId || "";
    if (!por.has(id)) por.set(id, { id, nombre: nombreBase(id), lotes: 0, cortadas: 0, despachadas: 0, basicos: 0, porcentajes: 0, aporte: 0, ventas: 0, ganancia: 0 });
    const g = por.get(id);
    const a = aporteDeLote(l);
    g.lotes += 1;
    g.cortadas += num(l.cantCortada);
    g.despachadas += num(l.cantDespachada);
    g.basicos += a.basicos;
    g.porcentajes += a.porcentajes;
    g.aporte += a.aporte;
    g.ventas += num(l.ventaT);
    g.ganancia += num(l.ganancia);
  });
  const categorias = [...por.values()].sort((a, b) => b.aporte - a.aporte);
  const suma = (k) => categorias.reduce((s, c) => s + c[k], 0);
  return { categorias, lotes: suma("lotes"), cortadas: suma("cortadas"), despachadas: suma("despachadas"), basicos: suma("basicos"), porcentajes: suma("porcentajes"), aporte: suma("aporte"), ventas: suma("ventas"), ganancia: suma("ganancia") };
}

// ─── Gastos (Excel «Control de gastos y vencimientos») ───────────────────────
export function motivoExclusionGasto(l) {
  const c = normTexto(l.concepto);
  const e = normTexto(l.empresa);
  if (c.includes("SEGURIDAD SOCIAL")) return "Ya está en la nómina fiscal";
  if (e.startsWith("ALMAC")) return "Almacén de venta al detal";
  return "";
}

// aoa = filas de la hoja (XLSX.utils.sheet_to_json con header:1). Busca la fila de títulos
// (Empresa / Día de vencimiento / Concepto / Valor mensual / Frecuencia / Observaciones) y lee lo de abajo.
export function parsearGastos(aoa) {
  const filas = aoa || [];
  const h = filas.findIndex((r) => Array.isArray(r) && r.some((c) => normTexto(c) === "EMPRESA") && r.some((c) => normTexto(c).includes("VALOR")));
  if (h < 0) return { lineas: [], error: "No encontré la fila de títulos (Empresa, Concepto, Valor mensual…). Revisa que sea el Excel de control de gastos." };
  const enc = filas[h].map((c) => normTexto(c));
  const col = (...claves) => enc.findIndex((t) => claves.some((k) => t.includes(k)));
  const iEmp = col("EMPRESA");
  const iDia = col("DIA");
  const iCon = col("CONCEPTO", "PROVEEDOR");
  const iVal = col("VALOR");
  const iFre = col("FRECUENCIA");
  const iObs = col("OBSERV");
  const lineas = [];
  for (let i = h + 1; i < filas.length; i++) {
    const r = filas[i] || [];
    const concepto = String(r[iCon] ?? "").trim();
    const empresa = String(r[iEmp] ?? "").trim();
    if (!concepto && !empresa) continue;
    if (normTexto(concepto).includes("TOTAL")) continue;
    const valor = parseNumero(r[iVal]) || 0;
    const l = { empresa, dia: r[iDia] === null || r[iDia] === undefined || r[iDia] === "" ? "" : String(r[iDia]), concepto, valor, frecuencia: String(r[iFre] ?? "").trim(), observaciones: String(r[iObs] ?? "").trim() };
    const motivo = motivoExclusionGasto(l);
    lineas.push({ ...l, incluir: !motivo, motivo });
  }
  return { lineas, error: lineas.length ? "" : "La hoja no trae filas de gastos debajo de los títulos." };
}

export function totalGastos(lineas) {
  const lista = lineas || [];
  const incluidas = lista.filter((l) => l.incluir);
  return {
    total: incluidas.reduce((s, l) => s + num(l.valor), 0),
    incluidas: incluidas.length,
    excluidas: lista.length - incluidas.length,
    excluidoValor: lista.filter((l) => !l.incluir).reduce((s, l) => s + num(l.valor), 0),
    sinValor: lista.filter((l) => l.incluir && !(num(l.valor) > 0)).length,
  };
}

// ─── Nómina fiscal (liquidaciones confirmadas) ───────────────────────────────
// Mismo costo para la empresa que usa el Reporte de Nómina por Área: neto + seguridad social + prestaciones.
export function costoTotalLiquidacion(l) {
  return num(l.netoAPagar)
    + num(l.epsTrabajador) + num(l.pensionTrabajador)
    + num(l.pensionEmpleador) + num(l.arlEmpleador) + num(l.cajaCompensacionEmpleador) + num(l.epsEmpleador)
    + num(l.cesantiasPeriodo) + num(l.interesesPeriodo) + num(l.primaPeriodo) + num(l.vacacionesPeriodo);
}

export function resumenFiscal(liquidaciones) {
  const lista = liquidaciones || [];
  return {
    total: lista.reduce((s, l) => s + costoTotalLiquidacion(l), 0),
    personas: new Set(lista.map((l) => l.trabajadorId || l.nombre)).size,
    quincenas: [...new Set(lista.map((l) => l.periodoId).filter(Boolean))].sort(),
  };
}

// ─── Destajo: lo que ponemos de más ──────────────────────────────────────────
// areas: [{ clave, nombre, trabajadores: [{id, nombre, valor, costo}] | null, agregado: {valor, costo} | null, dias, fuente }]
// Por trabajador: produjo − le pagamos. Negativo = ayuda; positivo = excedente. SOLO cuentan las ayudas: los excedentes
// son montos extras y NO se restan (decisión de Fredy, 2026-11-04); se muestran aparte como dato.
export function destajoDelMes(areas, fichas) {
  const out = (areas || []).map((a) => {
    let personas = [];
    let ayudas = 0;
    let excedentes = 0;
    let provision = 0;
    if (a.trabajadores && a.trabajadores.length) {
      personas = a.trabajadores.map((t) => {
        const ficha = fichaDeTrabajador(t, fichas);
        const valor = num(t.valor);
        const costo = num(t.costo);
        const resultado = valor - costo;
        const prov = provisionDeTrabajador(costo, ficha);
        return { id: t.id, nombre: t.nombre, area: a.nombre, claveArea: a.clave, tipoNomina: ficha?.tipoNomina || "", valor, costo, resultado, provision: prov.total, sinFicha: prov.sinFicha, extra: Math.max(0, -resultado) + prov.total };
      }).sort((x, y) => y.extra - x.extra);
      ayudas = personas.reduce((s, p) => s + Math.max(0, -p.resultado), 0);
      excedentes = personas.reduce((s, p) => s + Math.max(0, p.resultado), 0);
      provision = personas.reduce((s, p) => s + p.provision, 0);
    } else if (a.agregado) {
      const dif = num(a.agregado.costo) - num(a.agregado.valor);
      ayudas = Math.max(0, dif);
      excedentes = Math.max(0, -dif);
      provision = provisionDeTrabajador(num(a.agregado.costo), null).total;
    }
    const neta = ayudas; // los excedentes no se restan
    return { clave: a.clave, nombre: a.nombre, fuente: a.fuente || "", dias: a.dias || 0, detalle: personas.length > 0, personas, ayudados: personas.filter((p) => p.resultado < 0).length, total: personas.length, ayudas, excedentes, neta, provision, extra: neta + provision };
  });
  const sum = (k) => out.reduce((s, a) => s + a[k], 0);
  return { areas: out, ayudas: sum("ayudas"), excedentes: sum("excedentes"), neta: sum("neta"), provision: sum("provision"), extra: sum("extra"), personas: out.flatMap((a) => a.personas) };
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export function cierreGeneral({ lotes, bases, gastos, liquidacionesFiscal, areasDestajo, fichas }) {
  const recogido = recogidoDeLotes(lotes, bases);
  const g = totalGastos(gastos);
  const fiscal = resumenFiscal(liquidacionesFiscal);
  const destajo = destajoDelMes(areasDestajo, fichas);
  const estructura = g.total + fiscal.total + destajo.extra;
  const resultado = recogido.aporte - estructura;
  const aportePorPrenda = recogido.cortadas > 0 ? recogido.aporte / recogido.cortadas : 0;
  return {
    recogido, gastos: g, fiscal, destajo, estructura, resultado,
    cobertura: estructura > 0 ? (recogido.aporte / estructura) * 100 : null,
    aportePorPrenda,
    prendasQueFaltan: resultado < 0 && aportePorPrenda > 0 ? Math.ceil(-resultado / aportePorPrenda) : 0,
    prendasEquilibrio: aportePorPrenda > 0 ? Math.ceil(estructura / aportePorPrenda) : null,
  };
}
