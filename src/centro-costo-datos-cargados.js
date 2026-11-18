// (2026-11-17, a pedido de Fredy) «Datos cargados» de Centro de Costo → Por área: arma las hojas de un Excel con
//   1) el histórico del año que se subió (centro_costo_historico_mes: área × mes),
//   2) la cobertura de Nómina por mes (liquidaciones de destajo, producción, horas) y desde qué mes hay datos,
//   3) lo que muestra la pantalla en ese momento.
// Función pura (sin React ni Firebase): recibe arreglos y devuelve matrices para XLSX.utils.aoa_to_sheet. Solo lectura.
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const mk = (iso) => (/^\d{4}-\d{2}/.test(String(iso || "")) ? String(iso).slice(0, 7) : "");
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const etiquetaMes = (k) => (k ? `${MESES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : "");

export function hojaHistoricoCargado(historico) {
  const filas = [...(historico || [])].sort((a, b) => String(a.area || a.clave).localeCompare(String(b.area || b.clave)) || num(a.anio) - num(b.anio) || num(a.mes) - num(b.mes));
  return [
    ["Área", "Año", "Mes", "Valor producido", "Costo de nómina", "Unidades", "Fuente", "Archivo", "Cargado por", "Cargado en"],
    ...filas.map((h) => [h.area || h.clave || "", num(h.anio), MESES[num(h.mes) - 1] || h.mes, num(h.valor), num(h.costo), h.unidades == null ? "" : num(h.unidades), h.fuente || "", h.archivo || "", h.cargadoPor || "", String(h.cargadoEn || "").slice(0, 10)]),
  ];
}

// Por mes (YYYY-MM): qué hay realmente guardado en Nómina. «Desde» = primer mes con alguna liquidación de destajo.
export function hojaCoberturaNomina({ liquidaciones, produccion, horas, ajustes }) {
  const meses = new Map();
  const get = (k) => {
    if (!meses.has(k)) meses.set(k, { liq: 0, personas: new Set(), ayudaMin: 0, ajustes: 0, regProd: 0, unidades: 0, valorProd: 0, regHoras: 0, horas: 0 });
    return meses.get(k);
  };
  (liquidaciones || []).forEach((l) => {
    const k = String(l.periodoId || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) return;
    const m = get(k);
    m.liq += 1;
    m.personas.add(l.trabajadorId);
    m.ayudaMin += l.salarioMinimoGarantizado ? num(l.ayudaSalarioMinimo) : 0;
    const aj = (ajustes || []).find((a) => a.id === `${l.trabajadorId}__${l.periodoId}`);
    const v = num(aj ? aj.valor : l.ajusteValor);
    m.ajustes += !l.salarioMinimoGarantizado && v > 0 ? v : 0;
  });
  (produccion || []).forEach((p) => {
    const k = mk(p.fecha);
    if (!k) return;
    const m = get(k);
    m.regProd += 1;
    m.unidades += num(p.cantidad);
    m.valorProd += num(p.total);
  });
  (horas || []).forEach((h) => {
    const k = mk(h.fecha);
    if (!k) return;
    const m = get(k);
    m.regHoras += 1;
    m.horas += num(h.horas);
  });
  const claves = [...meses.keys()].sort();
  const conLiq = claves.filter((k) => meses.get(k).liq > 0);
  const conProd = claves.filter((k) => meses.get(k).regProd > 0);
  const resumen = [
    ["Primer mes con liquidaciones de destajo", conLiq.length ? etiquetaMes(conLiq[0]) : "ninguno"],
    ["Último mes con liquidaciones de destajo", conLiq.length ? etiquetaMes(conLiq[conLiq.length - 1]) : "ninguno"],
    ["Primer mes con producción registrada", conProd.length ? etiquetaMes(conProd[0]) : "ninguno"],
    ["Último mes con producción registrada", conProd.length ? etiquetaMes(conProd[conProd.length - 1]) : "ninguno"],
    ["Meses con liquidaciones", conLiq.length],
  ];
  const tabla = [
    ["Mes", "Liquidaciones", "Personas liquidadas", "Ayuda salario mínimo", "Ajustes manuales (+)", "Registros de producción", "Unidades", "Valor producción", "Registros de horas", "Horas"],
    ...claves.map((k) => {
      const m = meses.get(k);
      return [etiquetaMes(k), m.liq, m.personas.size, Math.round(m.ayudaMin), Math.round(m.ajustes), m.regProd, Math.round(m.unidades), Math.round(m.valorProd), m.regHoras, Math.round(m.horas * 100) / 100];
    }),
  ];
  return { aoa: [["COBERTURA DE NÓMINA"], ...resumen, [], ...tabla], desde: conLiq.length ? conLiq[0] : null, meses: claves };
}

export function hojaPantalla(filas) {
  return [
    ["Área", "Trabajador", "Unidades", "Valor producido", "Garantizado", "Balance", "Horas", "Ayuda adicional"],
    ...(filas || []).map((f) => [f.area || "", f.nombre || "", num(f.unidades), Math.round(num(f.valorProducido)), f.sinSueldo ? "sin sueldo" : Math.round(num(f.garantizado)), f.balance == null ? "" : Math.round(num(f.balance)), Math.round(num(f.horas)), Math.round(num(f.ayuda))]),
  ];
}

// (2026-11-18) Lo que se subió con «Subir nómina de la quincena» (nomina_historico_quincena): una fila por persona y quincena.
export function hojaNominaSubida(docs) {
  const filas = [...(docs || [])].sort((a, b) => String(a.periodoId).localeCompare(String(b.periodoId)) || String(a.nombre).localeCompare(String(b.nombre), "es"));
  return [
    ["Quincena", "Persona", "Tipo", "Producido", "Ayuda", "Pagado", "Base salario", "Descuentos", "Bonificación", "Días", "Ficha en ATLAS", "Área", "Archivo", "Cargado por", "Cargado en"],
    ...filas.map((d) => [d.periodoId || "", d.nombre || "", d.tipoNomina || "", num(d.producido), num(d.ayuda), num(d.pagado), num(d.baseSalario), num(d.descuentos), num(d.bonificacion), num(d.dias), d.trabajadorNombre || "SIN FICHA", d.area || "", d.archivo || "", d.cargadoPor || "", String(d.cargadoEn || "").slice(0, 10)]),
  ];
}
