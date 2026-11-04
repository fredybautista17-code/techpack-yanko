// ─── ¿CUBRO MIS COSTOS? — CÁLCULOS (sin pantalla) ─────────────────────────────
// (2026-11-04, a pedido de Fredy) Cierre mensual del centro de costo general. Responde dos cosas:
//   1. ¿Cuánto estoy recogiendo con los básicos del Dado por Cumplido? (lotes aprobados en el mes)
//   2. ¿Me alcanza para pagar lo que está fuera del costo del lote? = gastos del Excel + nómina fiscal +
//      las ayudas de destajo (los excedentes no se restan) + provisión de prestaciones y vacaciones.
// Lo que producen los trabajadores de destajo (y Fiscal Destajo) YA entra como costo directo del lote, así que
// aquí solo cuenta la diferencia entre lo que se les pagó y lo que produjeron, más su provisión.
import { normTexto, parseNumero } from "./centro-costo-historico-parser";
import { calcularEquiposCorte } from "./corte-equipos";

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
//   - Fiscal Destajo: igual que Destajo (cesantías y prima sobre sueldo + auxilio; desde 2026-11-04 Nómina también lo calcula así).
//   - Se proporciona a lo que se le ha pagado en el mes (costo del cierre) frente a su pago mensual, para que un mes
//     a medias provisione a medias. Sin ficha se supone el mínimo legal.
export function provisionDeTrabajador(costo, ficha) {
  const pagado = Math.max(0, num(costo));
  const sueldo = num(ficha?.sueldo);
  const aux = num(ficha?.auxilioTransporte);
  const tieneFicha = sueldo > 0;
  const s = tieneFicha ? sueldo : SMMLV_2026;
  const a = tieneFicha ? aux : AUXILIO_2026;
  const baseCes = s + a;
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

// Áreas cuyo sueldo ya va dentro del costo del lote (su centro de costo está en la cotización): no son estructura.
// Fredy las puede cambiar desde la ventana de nómina fiscal (2026-11-04); estas son las del arranque.
export const AREAS_FUERA_DEFECTO = ["CORTE", "MAQUILA"];

export function areaDeLiquidacion(l, fichas) {
  const ficha = (fichas || []).find((f) => f.id === l.trabajadorId);
  return ficha?.area || l.area || "Sin asignar";
}
const normFuera = (areasFuera) => new Set((areasFuera || []).map((a) => normTexto(a)));
// ¿Esta persona cuenta como estructura? Una excepción propia (true = cuenta, false = fuera) manda sobre la regla de su área.
// Tipos de nómina que se leen además de la fiscal (2026-11-05): cada uno vive en su propia colección de Nómina.
export const TIPO_FISCAL = "Fiscal";
export const TIPO_FISCAL_DESTAJO = "Fiscal Destajo";
export const TIPO_PRESTACION = "Prestación de Servicios";
// Áreas que ya miden su centro de costo: sus Fiscal Destajo arrancan apagados (su ayuda y su provisión entran por destajo).
export const AREAS_CON_CENTRO_COSTO = ["CORTE", "MAQUILA", "ZONA CALOR", "CONTROL DE CALIDAD"];
// Lo que haría la regla sin excepción propia. Prestación de Servicios arranca apagada (puede estar ya en el Excel de gastos).
export function cuentaPorDefecto(area, areasFuera, tipo) {
  if (tipo === TIPO_PRESTACION) return false;
  const a = normTexto(area);
  if (normFuera(areasFuera).has(a)) return false;
  if (tipo === TIPO_FISCAL_DESTAJO && AREAS_CON_CENTRO_COSTO.some((x) => normTexto(x) === a)) return false;
  return true;
}
export function personaCuenta(id, area, areasFuera, excepciones, tipo) {
  const ex = excepciones ? excepciones[id] : undefined;
  if (ex === true || ex === false) return ex;
  return cuentaPorDefecto(area, areasFuera, tipo);
}

export function resumenFiscal(liquidaciones, fichas, areasFuera, excepciones) {
  const lista = liquidaciones || [];
  const cuenta = [];
  const noCuenta = [];
  lista.forEach((l) => (personaCuenta(l.trabajadorId || l.nombre || l.id, areaDeLiquidacion(l, fichas), areasFuera, excepciones, l.tipoNomina) ? cuenta : noCuenta).push(l));
  const suma = (a) => a.reduce((s, l) => s + costoTotalLiquidacion(l), 0);
  const personas = (a) => new Set(a.map((l) => l.trabajadorId || l.nombre)).size;
  return {
    total: suma(cuenta),
    personas: personas(cuenta),
    quincenas: [...new Set(lista.filter((l) => !l.tipoNomina || l.tipoNomina === TIPO_FISCAL).map((l) => l.periodoId).filter(Boolean))].sort(),
    porTipo: [TIPO_FISCAL, TIPO_FISCAL_DESTAJO, TIPO_PRESTACION].map((t) => { const c = cuenta.filter((l) => (l.tipoNomina || TIPO_FISCAL) === t); const n = noCuenta.filter((l) => (l.tipoNomina || TIPO_FISCAL) === t); return { tipo: t, total: suma(c), personas: personas(c), fueraTotal: suma(n), fueraPersonas: personas(n) }; }),
    fuera: { total: suma(noCuenta), personas: personas(noCuenta) },
    totalTodo: suma(lista),
  };
}

// ─── Destajo: lo que ponemos de más ──────────────────────────────────────────
// areas: [{ clave, nombre, trabajadores: [{id, nombre, valor, costo}] | null, agregado: {valor, costo} | null, dias, fuente }]
// Por trabajador: produjo − le pagamos. Negativo = ayuda; positivo = excedente. SOLO cuentan las ayudas: los excedentes
// son montos extras y NO se restan (decisión de Fredy, 2026-11-04); se muestran aparte como dato.
// equiposCorte: lista `miembros` de costos_config/corte_equipos. Si hay cortadores configurados, el área CORTE se mide por equipos:
// su ayuda es la ayuda general de Corte (lo que los equipos y doña Berta juntos no alcanzaron a cubrir) y sus excedentes se suman entre sí.
// Interruptores de destajo (2026-11-05): cada área y cada persona decide por separado si su AYUDA cuenta y si su PROVISIÓN cuenta.
// CORTE arranca con la provisión fuera (su sueldo y prestaciones ya van en el costo del lote) y la ayuda dentro.
export const DESTAJO_AYUDA_FUERA_DEFECTO = [];
export const DESTAJO_PROVISION_FUERA_DEFECTO = ["CORTE"];
export const clavePersonaDestajo = (claveArea, id, nombre) => `${claveArea}|${id ?? nombre}`;
// ¿Cuenta? Una excepción propia (true/false) manda sobre la regla de su área.
export function cuentaDestajo(areasFuera, excepciones, claveArea, clavePersona) {
  const ex = clavePersona && excepciones ? excepciones[clavePersona] : undefined;
  if (ex === true || ex === false) return ex;
  return !(areasFuera || []).some((a) => normTexto(a) === normTexto(claveArea));
}
const estadoDe = (cuentan, total) => (total === 0 ? "off" : cuentan === total ? "on" : cuentan === 0 ? "off" : "mixto");
// opc: { ayudaFuera, provisionFuera, ayudaExc, provisionExc }. Sin opc todo cuenta (como antes).
export function destajoDelMes(areas, fichas, equiposCorte, opc) {
  const o = opc || {};
  const out = (areas || []).map((a) => {
    let personas = [];
    let ayudas = 0;
    let excedentes = 0;
    let provision = 0;
    let porEquipos = null;
    let ayudasTodas = 0;
    let provisionTodas = 0;
    const areaAyuda = cuentaDestajo(o.ayudaFuera, null, a.clave, null);
    const areaProv = cuentaDestajo(o.provisionFuera, null, a.clave, null);
    if (a.trabajadores && a.trabajadores.length) {
      personas = a.trabajadores.map((t) => {
        const ficha = fichaDeTrabajador(t, fichas);
        const valor = num(t.valor);
        const costo = num(t.costo);
        const resultado = valor - costo;
        const prov = provisionDeTrabajador(costo, ficha);
        const key = clavePersonaDestajo(a.clave, t.id, t.nombre);
        const cuentaAyuda = cuentaDestajo(o.ayudaFuera, o.ayudaExc, a.clave, key);
        const cuentaProvision = cuentaDestajo(o.provisionFuera, o.provisionExc, a.clave, key);
        const ayudaRaw = Math.max(0, -resultado);
        const ayuda = cuentaAyuda ? ayudaRaw : 0;
        const provisionCuenta = cuentaProvision ? prov.total : 0;
        // provision = valor completo (informativo); provisionCuenta = lo que suma. extra = lo que suma (ayuda + provisión que cuentan).
        return { id: t.id, key, nombre: t.nombre, area: a.nombre, claveArea: a.clave, tipoNomina: ficha?.tipoNomina || "", valor, costo, resultado, provision: prov.total, provisionCuenta, cuentaProvision, ayudaRaw, ayuda, cuentaAyuda, cesantias: prov.cesantias, intereses: prov.intereses, prima: prov.prima, vacaciones: prov.vacaciones, sinFicha: prov.sinFicha, extra: ayuda + provisionCuenta };
      }).sort((x, y) => y.extra - x.extra || y.ayudaRaw + y.provision - (x.ayudaRaw + x.provision));
      ayudas = personas.reduce((s, p) => s + p.ayuda, 0);
      ayudasTodas = personas.reduce((s, p) => s + p.ayudaRaw, 0);
      excedentes = personas.reduce((s, p) => s + Math.max(0, p.resultado), 0);
      provision = personas.reduce((s, p) => s + p.provisionCuenta, 0);
      provisionTodas = personas.reduce((s, p) => s + p.provision, 0);
      if (a.clave === "CORTE") {
        const eq = calcularEquiposCorte(a.trabajadores.map((t) => ({ nombre: t.nombre, ingreso: num(t.valor), costo: num(t.costo), unidades: num(t.unidades) })), equiposCorte);
        if (eq) {
          porEquipos = eq;
          ayudasTodas = eq.ayudaGeneral;
          ayudas = areaAyuda ? eq.ayudaGeneral : 0;
          excedentes = eq.excedenteGeneral;
          // Cada persona deja de contar su propia ayuda: la ayuda se mide por equipos y queda en el total del área (su interruptor es el del área).
          personas = personas.map((p) => ({ ...p, resultado: 0, ayudaRaw: 0, ayuda: 0, cuentaAyuda: areaAyuda, extra: p.provisionCuenta, porEquipos: true })).sort((x, y) => y.extra - x.extra || y.provision - x.provision);
        }
      }
    } else if (a.agregado) {
      const dif = num(a.agregado.costo) - num(a.agregado.valor);
      ayudasTodas = Math.max(0, dif);
      ayudas = areaAyuda ? ayudasTodas : 0;
      excedentes = Math.max(0, -dif);
      provisionTodas = provisionDeTrabajador(num(a.agregado.costo), null).total;
      provision = areaProv ? provisionTodas : 0;
    }
    // Estado del interruptor del área: encendido, apagado o mixto (algunas personas con excepción).
    const detalleNormal = personas.length > 0 && !porEquipos;
    const estadoAyuda = detalleNormal ? estadoDe(personas.filter((p) => p.cuentaAyuda).length, personas.length) : areaAyuda ? "on" : "off";
    const estadoProvision = personas.length > 0 ? estadoDe(personas.filter((p) => p.cuentaProvision).length, personas.length) : areaProv ? "on" : "off";
    const neta = ayudas; // los excedentes no se restan
    return { clave: a.clave, nombre: a.nombre, fuente: a.fuente || "", dias: a.dias || 0, detalle: personas.length > 0, personas, ayudados: porEquipos ? (ayudas > 0 ? 1 : 0) : personas.filter((p) => p.resultado < 0 && p.cuentaAyuda).length, total: personas.length, porEquipos: !!porEquipos, equipos: porEquipos, ayudas, ayudasTodas, excedentes, neta, provision, provisionTodas, estadoAyuda, estadoProvision, extra: neta + provision };
  });
  const sum = (k) => out.reduce((s, a) => s + a[k], 0);
  return { areas: out, ayudas: sum("ayudas"), ayudasTodas: sum("ayudasTodas"), excedentes: sum("excedentes"), neta: sum("neta"), provision: sum("provision"), provisionTodas: sum("provisionTodas"), extra: sum("extra"), personas: out.flatMap((a) => a.personas) };
}

// ─── Detalle para las ventanas (clic en una cifra) ────────────────────────────
export function detalleLotes(lotes, bases, categoriaId) {
  const nombreBase = (id) => (bases || []).find((b) => b.id === id)?.nombre || id || "Sin categoría";
  const todas = categoriaId === undefined || categoriaId === null;
  return (lotes || [])
    .filter((l) => todas || (l.categoriaBaseId || "") === categoriaId)
    .map((l) => {
      const a = aporteDeLote(l);
      return { numLote: String(l.numLote || ""), referencia: l.referencia || "", cliente: l.cliente || "", categoria: nombreBase(l.categoriaBaseId), cortadas: num(l.cantCortada), despachadas: num(l.cantDespachada), basicos: a.basicos, porcentajes: a.porcentajes, aporte: a.aporte };
    })
    .sort((x, y) => y.aporte - x.aporte);
}

// Nómina fiscal confirmada del mes, una fila por persona (suma sus quincenas).
export function detalleFiscal(liquidaciones, fichas, areasFuera, excepciones) {
  const por = new Map();
  (liquidaciones || []).forEach((l) => {
    const id = l.trabajadorId || l.nombre || l.id;
    const ficha = (fichas || []).find((f) => f.id === l.trabajadorId);
    if (!por.has(id)) por.set(id, { id, nombre: l.nombre || ficha?.nombre || "—", area: ficha?.area || "Sin asignar", tipoNomina: l.tipoNomina || TIPO_FISCAL, quincenas: [], neto: 0, seguridad: 0, prestaciones: 0, costo: 0 });
    const g = por.get(id);
    if (l.periodoId && !g.quincenas.includes(l.periodoId)) g.quincenas.push(l.periodoId);
    g.neto += num(l.netoAPagar);
    g.seguridad += num(l.epsTrabajador) + num(l.pensionTrabajador) + num(l.pensionEmpleador) + num(l.arlEmpleador) + num(l.cajaCompensacionEmpleador) + num(l.epsEmpleador);
    g.prestaciones += num(l.cesantiasPeriodo) + num(l.interesesPeriodo) + num(l.primaPeriodo) + num(l.vacacionesPeriodo);
    g.costo += costoTotalLiquidacion(l);
  });
  return [...por.values()]
    .map((g) => { const cuenta = personaCuenta(g.id, g.area, areasFuera, excepciones, g.tipoNomina); return { ...g, quincenas: g.quincenas.sort(), cuenta, costoCuenta: cuenta ? g.costo : 0, apagada: !cuenta }; })
    .sort((a, b) => (a.cuenta === b.cuenta ? b.costo - a.costo : a.cuenta ? -1 : 1));
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export function cierreGeneral({ lotes, bases, gastos, liquidacionesFiscal, areasDestajo, fichas, areasFuera, excepciones, equiposCorte, destajoOpc }) {
  const recogido = recogidoDeLotes(lotes, bases);
  const g = totalGastos(gastos);
  const fiscal = resumenFiscal(liquidacionesFiscal, fichas, areasFuera, excepciones);
  const destajo = destajoDelMes(areasDestajo, fichas, equiposCorte, destajoOpc);
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
