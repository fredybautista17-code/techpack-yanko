// ─── ¿CUBRO MIS COSTOS? — CÁLCULOS (sin pantalla) ─────────────────────────────
// (2026-11-04, a pedido de Fredy) Cierre mensual del centro de costo general. Responde dos cosas:
//   1. ¿Cuánto estoy recogiendo con los básicos del Dado por Cumplido? (lotes aprobados en el mes)
//   2. ¿Me alcanza para pagar lo que está fuera del costo del lote? = gastos del Excel + nómina fiscal +
//      las ayudas de destajo (los excedentes no se restan) + provisión de prestaciones y vacaciones.
// Lo que producen los trabajadores de destajo (y Fiscal Destajo) YA entra como costo directo del lote, así que
// aquí solo cuenta la diferencia entre lo que se les pagó y lo que produjeron, más su provisión.
import { normTexto, parseNumero } from "./centro-costo-historico-parser";
import { calcularEquiposCorte } from "./corte-equipos";
import { diasDeTrabajoDelMes } from "./dias-habiles";

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
// Aporte de un lote aprobado = lo que el Dado por Cumplido le suma al costo real: base + % sobre costo + % sobre venta de cada prenda
// (costoT − costoDefinitivo × cortadas, ÷ cortadas: los mismos números que Contabilidad aprobó), multiplicado por lo DESPACHADO.
//
// (2026-11-16, a pedido de Fredy) El aporte se cobra sobre lo DESPACHADO, no sobre lo cortado: base (+ % sobre costo + % sobre venta) POR PRENDA × cantidad despachada
// efectiva del lote (misma regla de Contabilidad, `despachadaEfectiva`). Solo cambia el reporte: la fórmula del Dado por Cumplido en Contabilidad sigue con cortadas.
export function despachadaEfectiva(l) {
  // Misma lógica que despachadaEfectiva de modulo-contabilidad.jsx y despachadaEfectivaLote de functions/index.js.
  if (l?.estado === "aprobado" && l?.adicionalesIncluidosAlAprobar) return num(l.cantDespachada);
  const base = l?.cantidadDespachadaBodega !== undefined ? num(l.cantidadDespachadaBodega) : num(l?.cantDespachada);
  return base + num(l?.cantDespachadaAdicional);
}

export function aporteDeLote(l) {
  const cortada = num(l.cantCortada);
  const despachada = despachadaEfectiva(l);
  const costoDef = num(l.costoDefinitivo);
  const costoT = num(l.costoT);
  // Aporte por prenda = (costoT − costoDefinitivo × cortadas) ÷ cortadas = base + % sobre costo + % sobre venta de cada prenda.
  const porPrenda = costoT > 0 && cortada > 0 ? (costoT - costoDef * cortada) / cortada : 0;
  const basePorPrenda = num(l.baseValorUsado) > 0 ? num(l.baseValorUsado) : (num(l.total) > 0 && cortada > 0 ? num(l.total) / cortada : 0);
  const aporte = porPrenda * despachada;
  const basicos = basePorPrenda * despachada;
  return { aporte, basicos, porcentajes: aporte - basicos, despachada };
}

export function recogidoDeLotes(lotes, bases) {
  const nombreBase = (id) => (bases || []).find((b) => b.id === id)?.nombre || id || "Sin categoría";
  const por = new Map();
  (lotes || []).forEach((l) => {
    const id = l.categoriaBaseId || "";
    if (!por.has(id)) por.set(id, { id, nombre: nombreBase(id), lotes: 0, sinDespachada: 0, cortadas: 0, despachadas: 0, basicos: 0, porcentajes: 0, aporte: 0, ventas: 0, ganancia: 0 });
    const g = por.get(id);
    const a = aporteDeLote(l);
    g.lotes += 1;
    g.cortadas += num(l.cantCortada);
    g.despachadas += a.despachada;
    if (a.despachada <= 0) g.sinDespachada += 1;
    g.basicos += a.basicos;
    g.porcentajes += a.porcentajes;
    g.aporte += a.aporte;
    g.ventas += num(l.ventaT);
    g.ganancia += num(l.ganancia);
  });
  const categorias = [...por.values()].sort((a, b) => b.aporte - a.aporte);
  const suma = (k) => categorias.reduce((s, c) => s + c[k], 0);
  return { categorias, lotes: suma("lotes"), sinDespachada: suma("sinDespachada"), cortadas: suma("cortadas"), despachadas: suma("despachadas"), basicos: suma("basicos"), porcentajes: suma("porcentajes"), aporte: suma("aporte"), ventas: suma("ventas"), ganancia: suma("ganancia") };
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
// (2026-11-27) Una quincena estimada (estimada: true) trae `factorEstimado` (0-1): la parte ya causada de esa quincena.
export const factorLiquidacion = (l) => (l && l.estimada && Number.isFinite(l.factorEstimado) ? l.factorEstimado : 1);
export function costoTotalLiquidacion(l) {
  return factorLiquidacion(l) * (num(l.netoAPagar)
    + num(l.epsTrabajador) + num(l.pensionTrabajador)
    + num(l.pensionEmpleador) + num(l.arlEmpleador) + num(l.cajaCompensacionEmpleador) + num(l.epsEmpleador)
    + num(l.cesantiasPeriodo) + num(l.interesesPeriodo) + num(l.primaPeriodo) + num(l.vacacionesPeriodo));
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
  const estimadas = cuenta.filter((l) => l.estimada);
  return {
    total: suma(cuenta),
    personas: personas(cuenta),
    // Solo quincenas CONFIRMADAS: las estimadas (día a día) no cuentan como quincena cerrada.
    quincenas: [...new Set(lista.filter((l) => !l.estimada && (!l.tipoNomina || l.tipoNomina === TIPO_FISCAL)).map((l) => l.periodoId).filter(Boolean))].sort(),
    estimado: { total: suma(estimadas), personas: personas(estimadas), fraccion: estimadas.reduce((m, l) => Math.max(m, factorLiquidacion(l)), 0), todo: suma(lista.filter((l) => l.estimada)) },
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
// (2026-11-16, a pedido de Fredy) MAQUILA tampoco interviene en el punto de equilibrio de la fábrica: su ayuda arranca fuera (se puede encender).
export const DESTAJO_AYUDA_FUERA_DEFECTO = ["MAQUILA"];
// (2026-11-16) MAQUILA: su nómina ya se cubre con sus ventas; solo cuenta su ayuda de las quincenas, y su provisión arranca fuera.
export const DESTAJO_PROVISION_FUERA_DEFECTO = ["CORTE", "MAQUILA"];
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
        // `ayudaFija` (solo MAQUILA): la ayuda ya viene calculada de las quincenas de la nómina; pagado − producido no sirve porque su producción
        // no se mide por trabajador. Se expresa como resultado negativo para que toda la pantalla la trate igual que cualquier otra ayuda.
        // `baseGarantizada` (solo MAQUILA): «Le pagamos» es lo realmente pagado (antes de descuentos de bodega) pero la ayuda y el excedente se miden contra la
        // base garantizada (sueldo de la ficha repartido por días de trabajo), no contra lo pagado, que varía.
        const resultado = t.ayudaFija != null ? -Math.max(0, num(t.ayudaFija)) : t.baseGarantizada != null ? valor - num(t.baseGarantizada) : valor - costo;
        const prov = provisionDeTrabajador(costo, ficha);
        const key = clavePersonaDestajo(a.clave, t.id, t.nombre);
        const cuentaAyuda = cuentaDestajo(o.ayudaFuera, o.ayudaExc, a.clave, key);
        const cuentaProvision = cuentaDestajo(o.provisionFuera, o.provisionExc, a.clave, key);
        const ayudaRaw = Math.max(0, -resultado);
        const ayuda = cuentaAyuda ? ayudaRaw : 0;
        // (2026-11-16, a pedido de Fredy) Horas trabajadas del mes: son costo de la empresa aparte de la ayuda adicional y van con el mismo interruptor.
        // `ayuda` = ayuda adicional (lo puesto en Nómina por encima de lo producido + horas); `excedenteBase` = lo que supera la base garantizada (informativo).
        const horas = Math.max(0, num(t.horas));
        const horasCuenta = cuentaAyuda ? horas : 0;
        const excedente = t.excedenteBase != null ? Math.max(0, num(t.excedenteBase)) : Math.max(0, resultado);
        const provisionCuenta = cuentaProvision ? prov.total : 0;
        // provision = valor completo (informativo); provisionCuenta = lo que suma. extra = lo que suma (ayuda + provisión que cuentan).
        return { id: t.id, key, nombre: t.nombre, area: a.nombre, claveArea: a.clave, tipoNomina: ficha?.tipoNomina || "", valor, costo, resultado, provision: prov.total, provisionCuenta, cuentaProvision, ayudaRaw, ayuda, cuentaAyuda, horas, horasCuenta, excedente, cesantias: prov.cesantias, intereses: prov.intereses, prima: prov.prima, vacaciones: prov.vacaciones, sinFicha: prov.sinFicha, extra: ayuda + horasCuenta + provisionCuenta };
      }).sort((x, y) => y.extra - x.extra || y.ayudaRaw + y.provision - (x.ayudaRaw + x.provision));
      // `ayudas` del área = ayuda adicional + horas (lo que suma al extra); el detalle por persona los muestra en columnas separadas.
      ayudas = personas.reduce((s, p) => s + p.ayuda + p.horasCuenta, 0);
      ayudasTodas = personas.reduce((s, p) => s + p.ayudaRaw + p.horas, 0);
      excedentes = personas.reduce((s, p) => s + p.excedente, 0);
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
          personas = personas.map((p) => ({ ...p, resultado: 0, ayudaRaw: 0, ayuda: 0, horas: 0, horasCuenta: 0, excedente: 0, cuentaAyuda: areaAyuda, extra: p.provisionCuenta, porEquipos: true })).sort((x, y) => y.extra - x.extra || y.provision - x.provision);
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
      return { numLote: String(l.numLote || ""), referencia: l.referencia || "", cliente: l.cliente || "", categoria: nombreBase(l.categoriaBaseId), cortadas: num(l.cantCortada), despachadas: a.despachada, basicos: a.basicos, porcentajes: a.porcentajes, aporte: a.aporte };
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
    if (l.periodoId && !l.estimada && !g.quincenas.includes(l.periodoId)) g.quincenas.push(l.periodoId);
    const fq = factorLiquidacion(l);
    if (l.estimada) g.fraccionEstimada = Math.max(g.fraccionEstimada || 0, fq);
    g.neto += fq * num(l.netoAPagar);
    g.seguridad += fq * (num(l.epsTrabajador) + num(l.pensionTrabajador) + num(l.pensionEmpleador) + num(l.arlEmpleador) + num(l.cajaCompensacionEmpleador) + num(l.epsEmpleador));
    g.prestaciones += fq * (num(l.cesantiasPeriodo) + num(l.interesesPeriodo) + num(l.primaPeriodo) + num(l.vacacionesPeriodo));
    g.costo += costoTotalLiquidacion(l);
    if (l.estimada) g.costoEstimado = (g.costoEstimado || 0) + costoTotalLiquidacion(l);
  });
  return [...por.values()]
    .map((g) => { const cuenta = personaCuenta(g.id, g.area, areasFuera, excepciones, g.tipoNomina); return { ...g, quincenas: g.quincenas.sort(), cuenta, costoCuenta: cuenta ? g.costo : 0, apagada: !cuenta }; })
    .sort((a, b) => (a.cuenta === b.cuenta ? b.costo - a.costo : a.cuenta ? -1 : 1));
}

// ─── Periodo de la pantalla (2026-11-27, a pedido de Fredy) ──────────────────
// Los gastos del Excel son mensuales; para compararlos con lo que recogen los lotes DÍA A DÍA se reparten por días de trabajo
// (misma regla de dias-habiles.js: sin domingos ni festivos, con sábado puente). tipo: "mes" | "hoy" | "q1" | "q2".
// «Hasta hoy» solo aplica al mes en curso; en un mes ya pasado (o futuro) equivale a «mes completo».
const pad2 = (n) => String(n).padStart(2, "0");
export function periodoCosto({ anio, mes, tipo = "mes", hoyISO = "" }) {
  const ult = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const ym = `${anio}-${pad2(mes)}`;
  const diasMes = diasDeTrabajoDelMes(anio, mes);
  let ini = 1;
  let fin = ult;
  let t = "mes";
  let etiqueta = "mes completo";
  if (tipo === "q1") { t = "q1"; fin = Math.min(15, ult); etiqueta = "1.ª quincena (1 al 15)"; }
  else if (tipo === "q2") { t = "q2"; ini = 16; etiqueta = `2.ª quincena (16 al ${ult})`; }
  else if (tipo === "hoy" && String(hoyISO).slice(0, 7) === ym) { t = "hoy"; fin = Math.max(1, Math.min(ult, Number(String(hoyISO).slice(8, 10)) || ult)); etiqueta = `hasta hoy (día ${fin})`; }
  const dias = diasDeTrabajoDelMes(anio, mes, fin) - (ini > 1 ? diasDeTrabajoDelMes(anio, mes, ini - 1) : 0);
  const quincenas = t === "q1" ? ["Q1"] : t === "q2" ? ["Q2"] : t === "hoy" && fin < 16 ? ["Q1"] : ["Q1", "Q2"];
  return {
    tipo: t, desde: `${ym}-${pad2(ini)}`, hasta: `${ym}-${pad2(fin)}`, dias, diasMes,
    factor: diasMes > 0 ? dias / diasMes : 1, quincenas, etiqueta, esMes: t === "mes",
  };
}
// Fecha (AAAA-MM-DD, hora de Bogotá) de un Timestamp de Firestore, Date, milisegundos o texto ISO.
export function fechaISOBogota(v) {
  if (!v) return "";
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) && v.length <= 10 ? v : new Date(new Date(v).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const d = typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10) : "";
}
// Lotes aprobados dentro de un periodo ([desde, hasta] inclusive).
export function lotesDelPeriodo(lotes, periodo) {
  if (!periodo || periodo.esMes) return lotes || [];
  return (lotes || []).filter((l) => { const f = fechaISOBogota(l.fechaAprobacion); return f && f >= periodo.desde && f <= periodo.hasta; });
}

// ─── Quincena sin confirmar: se causa día a día ──────────────────────────────
// (2026-11-27, a pedido de Fredy) La 1.ª quincena ya se pagó y está confirmada; la 2.ª se está trabajando día a día y aún no tiene liquidación.
// Para cada persona de Fiscal y Fiscal Destajo con su 1.ª quincena confirmada y sin 2.ª, se estima la 2.ª con el costo de su 1.ª
// × (días de trabajo del periodo dentro de la quincena ÷ días de trabajo de la quincena). «Mes completo» la proyecta al 100 %.
// Solo el mes en curso (en un mes pasado una quincena sin liquidación es un dato que falta, no algo por causar). Cuando se confirma la
// liquidación real de la 2.ª, la estimación de esa persona desaparece sola. Prestación de Servicios no se estima.
// periodo = periodoCosto(...); fichas: para no estimar a quien ya se retiró.
export function estimarQuincenaFiscal(liquidaciones, periodo, hoyISO, fichas) {
  if (!periodo || !periodo.desde || !periodo.hasta) return [];
  const ym = periodo.desde.slice(0, 7);
  if (String(hoyISO || "").slice(0, 7) !== ym) return [];
  const anio = Number(ym.slice(0, 4));
  const mes = Number(ym.slice(5, 7));
  const hastaDia = Number(periodo.hasta.slice(8, 10));
  const desdeDia = Number(periodo.desde.slice(8, 10));
  if (hastaDia < 16) return [];
  const diasQ2 = diasDeTrabajoDelMes(anio, mes) - diasDeTrabajoDelMes(anio, mes, 15);
  if (!(diasQ2 > 0)) return [];
  const ini = Math.max(16, desdeDia);
  const diasPeriodo = diasDeTrabajoDelMes(anio, mes, hastaDia) - diasDeTrabajoDelMes(anio, mes, ini - 1);
  const fraccion = Math.min(1, Math.max(0, diasPeriodo / diasQ2));
  if (!(fraccion > 0)) return [];
  const q1 = `${ym}-Q1`;
  const q2 = `${ym}-Q2`;
  const clave = (l) => `${l.tipoNomina || TIPO_FISCAL}|${l.trabajadorId || l.nombre || ""}`;
  const lista = liquidaciones || [];
  const tienenQ2 = new Set(lista.filter((l) => l.periodoId === q2 && !l.estimada).map(clave));
  return lista
    .filter((l) => l.periodoId === q1 && !l.estimada && (!l.tipoNomina || l.tipoNomina === TIPO_FISCAL || l.tipoNomina === TIPO_FISCAL_DESTAJO) && !tienenQ2.has(clave(l)))
    .filter((l) => {
      const f = (fichas || []).find((x) => x.id === l.trabajadorId);
      if (!f) return true;
      const retiro = String(f.fechaRetiro || "").slice(0, 10);
      return !(f.activo === false || (retiro && retiro < `${ym}-16`));
    })
    .map((l) => ({ ...l, id: `${l.id || clave(l)}_est`, periodoId: q2, estimada: true, factorEstimado: fraccion, baseId: l.id || null }));
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
// factorPeriodo (0-1): parte del mes que cuenta. Se aplica a los gastos del Excel y a lo de destajo (ayudas y provisión), que son mensuales.
// La nómina fiscal ya viene por quincena confirmada: se filtra antes de llamar. Con 1 todo queda como siempre (mes completo).
export function cierreGeneral({ lotes, bases, gastos, liquidacionesFiscal, areasDestajo, fichas, areasFuera, excepciones, equiposCorte, destajoOpc, factorPeriodo = 1 }) {
  const f = Number.isFinite(factorPeriodo) && factorPeriodo >= 0 ? factorPeriodo : 1;
  const recogido = recogidoDeLotes(lotes, bases);
  const gMes = totalGastos(gastos);
  const g = { ...gMes, totalMes: gMes.total, total: gMes.total * f };
  const fiscal = resumenFiscal(liquidacionesFiscal, fichas, areasFuera, excepciones);
  const destajoMes = destajoDelMes(areasDestajo, fichas, equiposCorte, destajoOpc);
  const destajo = f === 1 ? destajoMes : { ...destajoMes, ayudas: destajoMes.ayudas * f, neta: destajoMes.neta * f, provision: destajoMes.provision * f, extra: destajoMes.extra * f, extraMes: destajoMes.extra };
  const estructura = g.total + fiscal.total + destajo.extra;
  const resultado = recogido.aporte - estructura;
  // Aporte por prenda DESPACHADA (el aporte ya se cobra sobre lo despachado).
  const aportePorPrenda = recogido.despachadas > 0 ? recogido.aporte / recogido.despachadas : 0;
  return {
    recogido, gastos: g, fiscal, destajo, estructura, resultado, factorPeriodo: f,
    cobertura: estructura > 0 ? (recogido.aporte / estructura) * 100 : null,
    aportePorPrenda,
    prendasQueFaltan: resultado < 0 && aportePorPrenda > 0 ? Math.ceil(-resultado / aportePorPrenda) : 0,
    prendasEquilibrio: aportePorPrenda > 0 ? Math.ceil(estructura / aportePorPrenda) : null,
  };
}
