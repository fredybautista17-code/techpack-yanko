// (2026-11-18, a pedido de Fredy) Meta del día ajustada por vacaciones.
// Cuando parte del grupo está de vacaciones, la meta del día se reduce en proporción a quienes sí trabajan:
//   meta ajustada = meta × (personas que trabajan ÷ personas activas del área).
// Si todo el grupo está de vacaciones ese día, el día NO cuenta (ni para cumplir ni para fallar).
// La fuente es Nómina → Ausencias con motivo «Vacaciones» o «Licencia No Remunerada» (nomina_ausencias): en los dos casos la persona no trabaja y
// su sueldo del día no se paga / no cuenta contra el equipo (2026-11-24, a pedido de Fredy: la licencia no remunerada se trata igual). Todo es de solo lectura.

const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const NUM = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pad = (n) => String(n).padStart(2, "0");

// (El nombre se conserva por compatibilidad: ahora también cubre «Licencia No Remunerada».)
export const esMotivoVacaciones = (motivo) => { const m = norm(motivo); return m === "VACACIONES" || m === "LICENCIA NO REMUNERADA"; };

// ¿Esta persona está de vacaciones ese día? (ausencia con motivo Vacaciones cuyo rango cubre el día)
export function enVacacionesDia(ausencias, trabajadorId, iso) {
  return (ausencias || []).some((a) => a && a.trabajadorId === trabajadorId && esMotivoVacaciones(a.motivo)
    && String(a.fechaInicio || "") <= iso && String(a.fechaFin || a.fechaInicio || "") >= iso);
}

// Quiénes cuentan como «grupo» del área: fichas activas (se excluyen las medidas como base administrativa).
export function personasDelGrupo(trabajadores, filtro) {
  return (trabajadores || []).filter((t) => t && t.activo !== false && !t.medirComoBaseAdministrativa && (!filtro || filtro(t)));
}

// Información del día: { total, enVacaciones, trabajan, factor, nombres, todos, hay }
//   hay = true cuando al menos una persona del grupo está de vacaciones ese día.
export function infoVacacionesDia(personas, ausencias, iso) {
  const total = (personas || []).length;
  const fuera = (personas || []).filter((t) => enVacacionesDia(ausencias, t.id, iso));
  const trabajan = total - fuera.length;
  return {
    iso, total, enVacaciones: fuera.length, trabajan,
    factor: total > 0 ? trabajan / total : 1,
    nombres: fuera.map((t) => String(t.nombre || t.id)),
    todos: total > 0 && trabajan === 0,
    hay: fuera.length > 0,
  };
}

// Meta de un día: la meta completa por el factor (redondeada). Sin grupo conocido → meta completa.
export function metaAjustadaDia(metaBase, info) {
  const m = NUM(metaBase);
  if (!(m > 0) || !info) return m;
  return Math.round(m * info.factor);
}

// Mapa día → info para los días listados (solo se guardan los días donde hay vacaciones).
export function mapaVacacionesDias(personas, ausencias, dias) {
  const mapa = new Map();
  if (!(personas || []).length) return mapa;
  (dias || []).forEach((iso) => {
    const info = infoVacacionesDia(personas, ausencias, iso);
    if (info.hay) mapa.set(iso, info);
  });
  return mapa;
}

// Meta de cada día del mes (solo los días que se pasen en `dias`): Map iso → meta ajustada.
export function metasPorDia(metaBase, vacPorDia, dias) {
  const m = new Map();
  (dias || []).forEach((iso) => m.set(iso, metaAjustadaDia(metaBase, vacPorDia.get(iso))));
  return m;
}

// Igual que cumplimientoMeta, pero cada día se compara contra su meta ajustada y los días con todo el grupo
// de vacaciones no cuentan. `diasHabiles` = lista de días hábiles (ISO) ya filtrada hasta el día elegido.
export function cumplimientoMetaAjustada(unidadesPorDia, metaBase, vacPorDia, diasHabiles) {
  const m = NUM(metaBase);
  let cumplidos = 0, contados = 0, excluidos = 0, ajustados = 0;
  (diasHabiles || []).forEach((iso) => {
    const info = vacPorDia.get(iso);
    if (info && info.todos) { excluidos++; return; }
    contados++;
    if (info && info.hay) ajustados++;
    const metaDia = metaAjustadaDia(m, info);
    if (m > 0 && (unidadesPorDia.get(iso) || 0) >= metaDia) cumplidos++;
  });
  return { diasHabiles: contados, cumplidos, meta: m, diasExcluidos: excluidos, diasAjustados: ajustados };
}

// Meta del periodo = suma de la meta ajustada de cada día de trabajo del periodo.
export function metaPeriodoAjustada(metaBase, vacPorDia, diasTrabajo) {
  const m = NUM(metaBase);
  if (!(m > 0)) return { meta: 0, base: 0, diasExcluidos: 0, diasAjustados: 0 };
  let meta = 0, excluidos = 0, ajustados = 0;
  (diasTrabajo || []).forEach((iso) => {
    const info = vacPorDia.get(iso);
    if (info && info.todos) { excluidos++; return; }
    if (info && info.hay) ajustados++;
    meta += metaAjustadaDia(m, info);
  });
  return { meta, base: m * (diasTrabajo || []).length, diasExcluidos: excluidos, diasAjustados: ajustados };
}

// Texto corto para mostrar junto a la meta: «Meta 350 de 500 (3 de 10 en vacaciones)».
export function textoMetaVacaciones(metaBase, info) {
  if (!info || !info.hay) return "";
  if (info.todos) return "Todo el grupo está de vacaciones o licencia: el día no cuenta";
  return `Meta ${Math.round(metaAjustadaDia(metaBase, info))} de ${Math.round(NUM(metaBase))} (${info.enVacaciones} de ${info.total} de vacaciones o licencia)`;
}

export const diaISO = (anio, mes, d) => `${anio}-${pad(mes)}-${pad(d)}`;

// Días (ISO) entre dos fechas, ambas incluidas, que cumplan `esDia` (p. ej. día de trabajo).
export function diasEntreISO(desde, hasta, esDia) {
  const out = [];
  const ini = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  if (isNaN(ini) || isNaN(fin) || fin < ini) return out;
  for (const d = new Date(ini); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    if (!esDia || esDia(iso)) out.push(iso);
  }
  return out;
}

// Cuánto baja la meta de un periodo por las vacaciones: Σ (meta diaria − meta ajustada del día) en los días de trabajo.
// Sirve para restarlo a la meta del periodo calculada como siempre (así no se cambia cómo se arma la meta base).
export function reduccionMetaPorVacaciones(metaDiaria, personas, ausencias, diasTrabajo) {
  const m = NUM(metaDiaria);
  const vacPorDia = mapaVacacionesDias(personas, ausencias, diasTrabajo);
  let reduccion = 0, excluidos = 0, ajustados = 0;
  const nombres = new Set();
  vacPorDia.forEach((info) => {
    reduccion += m - metaAjustadaDia(m, info);
    if (info.todos) excluidos++; else ajustados++;
    info.nombres.forEach((n) => nombres.add(n));
  });
  return { reduccion, diasExcluidos: excluidos, diasAjustados: ajustados, nombres: [...nombres], vacPorDia };
}
