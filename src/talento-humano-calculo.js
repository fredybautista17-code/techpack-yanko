// ─── CENTRO DE TALENTO HUMANO: cálculo (funciones puras, sin Firestore ni red) ───────────────────────────────────────────────
// (2026-11-26, a pedido de Fredy) Tablero de alertas + expediente por trabajador, armado sobre el procedimiento TH-PR-01 (Vinculación y
// desvinculación). Datos:
//   nomina_trabajadores/{id}  -> ya existe: nombre, area, zona (cargo), tipoContrato, fechaIngreso, fechaRetiro, sueldo, activo.
//   nomina_th_expedientes/{trabajadorId} -> NUEVO: { fechaFinPrueba, fechaFinContrato, dotacion (false = no le aplica),
//                                        formatos: { [codigo]: { estado: "ok"|"venc"|"na"|"pend", fecha, url, nombre, por, en, nota } } }
// «pend» (o no estar en el mapa) = pendiente. Las fechas del expediente son las que Talento Humano pone: la ficha de Nómina no las guarda.

export const SMMLV_2026 = 1750905;
export const LIMITE_DOTACION = 2 * SMMLV_2026; // la dotación de ley aplica a quien gana hasta 2 SMMLV
export const FECHAS_DOTACION = [[4, 30], [8, 31], [12, 20]]; // 30 de abril, 31 de agosto, 20 de diciembre
export const DIAS_PREAVISO = 30; // preaviso legal mínimo antes de vencer un contrato a término fijo
export const VENTANA_PRUEBA = 45; // días de anticipación con que se avisa el fin del período de prueba
export const VENTANA_CONTRATO = 60; // ídem para el vencimiento del contrato a término fijo

// Los formatos del expediente (códigos del SGC de Industrias Yanko). «sensible» = datos personales o de salud (Ley 1581 de 2012).
export const FORMATOS_TH = [
  { codigo: "TH-FO-19", nombre: "Hoja de vida y actualización de datos", sensible: true },
  { codigo: "TH-FO-20", nombre: "Autorreporte de condiciones de salud", sensible: true },
  { codigo: "TH-FO-01", nombre: "Verificación de cumplimiento del perfil" },
  { codigo: "ANTEC", nombre: "Antecedentes (Procuraduría, judiciales, RUAF)", sensible: true },
  { codigo: "TH-FO-21", nombre: "Entrevista de selección" },
  { codigo: "TH-FO-16", nombre: "Autorización de tratamiento de datos" },
  { codigo: "TH-FO-17", nombre: "Compromiso de confidencialidad" },
  { codigo: "TH-FO-12", nombre: "Autorización de uso de imagen" },
  { codigo: "TH-FO-18", nombre: "Notificaciones por correo" },
  { codigo: "TH-FO-05", nombre: "Registro de inducción" },
  { codigo: "TH-FO-06", nombre: "Evaluación de inducción (aprueba con 90 %)" },
  { codigo: "TH-FO-02", nombre: "Entrega de dotación" },
  { codigo: "TH-FO-03", nombre: "Entrega de EPP" },
  { codigo: "TH-FO-04", nombre: "Evaluación del desempeño / período de prueba" },
];

// Los 10 pasos del procedimiento TH-PR-01
export const PASOS_TH = ["Requisición", "Apertura", "Búsqueda", "Perfil y antecedentes", "Entrevistas", "Aprobación y exámenes", "Afiliaciones", "Contrato, inducción y dotación", "Período de prueba", "Retiro"];

export const hoyBogotaISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const MS_DIA = 86400000;
const msDe = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ""));
const aISO = (ms) => new Date(ms).toISOString().slice(0, 10);
export const diasEntre = (desdeISO, hastaISO) => Math.round((msDe(hastaISO) - msDe(desdeISO)) / MS_DIA);
export const sumarDias = (iso, n) => aISO(msDe(iso) + n * MS_DIA);
export function sumarMeses(iso, n) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return aISO(Date.UTC(ny, nm, Math.min(d, ultimo)));
}
export const fechaCorta = (iso) => {
  if (!esFecha(iso)) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]} ${y}`;
};
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const esActivo = (t) => !!t && t.activo !== false && !t.fechaRetiro;
export const esTerminoFijo = (t, exp) => !!(exp && esFecha(exp.fechaFinContrato)) || sinTildes(t && t.tipoContrato).includes("fijo");

// Próxima fecha legal de entrega de dotación (30-abr, 31-ago, 20-dic)
export function proximaDotacion(hoyISO) {
  const y = Number(String(hoyISO).slice(0, 4));
  const cand = [];
  [y, y + 1].forEach((yy) => FECHAS_DOTACION.forEach(([m, d]) => cand.push(`${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`)));
  const fecha = cand.find((f) => f >= hoyISO);
  return { fecha, dias: diasEntre(hoyISO, fecha) };
}

// ¿Le aplica la dotación de ley? (sueldo hasta 2 SMMLV; si se marcó a mano que no, no)
export function aplicaDotacion(t, exp) {
  if (exp && exp.dotacion === false) return false;
  const s = Number(t && t.sueldo) || 0;
  return s > 0 ? s <= LIMITE_DOTACION : true;
}

// Estado de un formato para un trabajador: "ok" | "venc" | "pend" | "na"
export function estadoFormato(t, exp, codigo) {
  const f = exp && exp.formatos && exp.formatos[codigo];
  const manual = f && f.estado;
  if (manual === "ok" || manual === "venc") return manual;
  if (manual === "na") return "na";
  if (codigo === "TH-FO-04" && !(exp && esFecha(exp.fechaFinPrueba))) return "na"; // sin período de prueba no hay evaluación de prueba
  if (codigo === "TH-FO-02" && !aplicaDotacion(t, exp)) return "na";
  return "pend";
}

// opts.sinSensibles: el líder de área no ve ni cuenta los formatos con datos personales o de salud (hoja de vida, autorreporte, antecedentes).
export function formatosDe(t, exp, opts) {
  return FORMATOS_TH.filter((f) => !(opts && opts.sinSensibles && f.sensible)).map((f) => ({ ...f, estado: estadoFormato(t, exp, f.codigo), dato: (exp && exp.formatos && exp.formatos[f.codigo]) || {} }));
}
export const pendientesDe = (t, exp, opts) => formatosDe(t, exp, opts).filter((f) => f.estado === "pend" || f.estado === "venc");
export function porcentajeExpediente(t, exp, opts) {
  const aplica = formatosDe(t, exp, opts).filter((f) => f.estado !== "na");
  return aplica.length ? Math.round((100 * aplica.filter((f) => f.estado === "ok").length) / aplica.length) : 100;
}

// Paso del procedimiento en que está un trabajador activo (solo orientativo)
export function pasoDe(t, exp) {
  const est = (c) => estadoFormato(t, exp, c);
  if (est("TH-FO-05") !== "ok" || est("TH-FO-06") !== "ok" || est("TH-FO-02") === "pend" || est("TH-FO-03") === "pend") return 8;
  return 9;
}

// Alertas de vencimiento (período de prueba y contrato a término fijo), de la más urgente a la menos urgente.
// `d` = días que faltan para el plazo que importa: fin de la prueba, o último día para dar el preaviso del contrato.
export function alertasVencimiento(trabajadores, expedientes, hoyISO) {
  const exps = mapaExpedientes(expedientes);
  const out = [];
  (trabajadores || []).filter(esActivo).forEach((t) => {
    const exp = exps[t.id];
    if (!exp) return;
    if (esFecha(exp.fechaFinPrueba) && estadoFormato(t, exp, "TH-FO-04") !== "ok") {
      const d = diasEntre(hoyISO, exp.fechaFinPrueba);
      if (d <= VENTANA_PRUEBA && d >= -30) out.push({ t, tipo: "prueba", fecha: exp.fechaFinPrueba, d, titulo: d < 0 ? "Período de prueba terminó sin evaluación" : "Período de prueba termina", accion: "Pedir la evaluación de desempeño (TH-FO-04) al jefe inmediato" });
    }
    if (esFecha(exp.fechaFinContrato) && esTerminoFijo(t, exp)) {
      const limite = sumarDias(exp.fechaFinContrato, -DIAS_PREAVISO);
      const dFin = diasEntre(hoyISO, exp.fechaFinContrato);
      if (dFin >= 0 && dFin <= VENTANA_CONTRATO) {
        const d = diasEntre(hoyISO, limite);
        out.push({ t, tipo: "contrato", fecha: exp.fechaFinContrato, limite, d, titulo: "Contrato a término fijo vence", accion: d < 0 ? "Pasó el plazo del preaviso legal: revisar con asesor laboral" : `Decidir prórroga o enviar preaviso antes del ${fechaCorta(limite)}` });
      }
    }
  });
  return out.sort((a, b) => a.d - b.d);
}

export function mapaExpedientes(expedientes) {
  if (!Array.isArray(expedientes)) return expedientes || {};
  const m = {};
  expedientes.forEach((e) => { if (e) m[e.trabajadorId || e.id] = e; });
  return m;
}

// Números del tablero
export function resumenTablero(trabajadores, expedientes, candidatos, hoyISO, opts) {
  const exps = mapaExpedientes(expedientes);
  const activos = (trabajadores || []).filter(esActivo);
  const alertas = alertasVencimiento(activos, exps, hoyISO);
  const conDotacion = activos.filter((t) => aplicaDotacion(t, exps[t.id]));
  const dotListos = conDotacion.filter((t) => estadoFormato(t, exps[t.id], "TH-FO-02") === "ok");
  const conPend = activos.filter((t) => pendientesDe(t, exps[t.id], opts).length > 0);
  const sinInduccion = activos.filter((t) => ["TH-FO-05", "TH-FO-06"].some((c) => estadoFormato(t, exps[t.id], c) !== "ok"));
  const prox = proximaDotacion(hoyISO);
  return {
    activos: activos.length,
    alertas,
    urgentes: alertas.filter((a) => a.d <= 14).length,
    dotacion: { ...prox, elegibles: conDotacion.length, listos: dotListos.length, faltan: conDotacion.length - dotListos.length },
    conPendientes: conPend.length,
    sinInduccion: sinInduccion.length,
    candidatos: (candidatos || []).length,
  };
}

// Porcentaje promedio del expediente por área (de menor a mayor)
export function avancePorArea(trabajadores, expedientes, opts) {
  const exps = mapaExpedientes(expedientes);
  const por = {};
  (trabajadores || []).filter(esActivo).forEach((t) => { const a = t.area || "Sin asignar"; (por[a] = por[a] || []).push(porcentajeExpediente(t, exps[t.id], opts)); });
  return Object.entries(por).map(([area, v]) => ({ area, n: v.length, pct: Math.round(v.reduce((s, x) => s + x, 0) / v.length) })).sort((a, b) => a.pct - b.pct || a.area.localeCompare(b.area));
}

// Sugerencia al marcar «Fin del período de prueba»: 2 meses desde el ingreso (máximo legal)
export const sugerirFinPrueba = (t) => (esFecha(t && t.fechaIngreso) ? sumarDias(sumarMeses(t.fechaIngreso, 2), -1) : "");

// Áreas distintas de los trabajadores activos (para el filtro de la lista)
export const areasDe = (trabajadores) => [...new Set((trabajadores || []).filter(esActivo).map((t) => t.area || "Sin asignar"))].sort((a, b) => a.localeCompare(b));

// Carga por lote: marcar un formato (estado «ok», «na» o «pend») a varias personas a la vez.
// Omite a quien no le aplica el formato (si se va a firmar) y a quien ya está en ese estado.
export function planLote(trabajadores, expedientes, codigo, estado) {
  const exps = mapaExpedientes(expedientes);
  const aplicar = [], omitir = [];
  (trabajadores || []).forEach((t) => {
    const actual = estadoFormato(t, exps[t.id], codigo);
    const manual = exps[t.id] && exps[t.id].formatos && exps[t.id].formatos[codigo] && exps[t.id].formatos[codigo].estado;
    if (estado === "ok" && actual === "na" && manual !== "na") omitir.push({ t, motivo: "no le aplica" });
    else if (estado === "ok" && actual === "ok") omitir.push({ t, motivo: "ya está firmado" });
    else if (estado === "na" && manual === "na") omitir.push({ t, motivo: "ya está como no aplica" });
    else if (estado === "pend" && actual === "pend") omitir.push({ t, motivo: "ya está pendiente" });
    else aplicar.push(t);
  });
  return { aplicar, omitir };
}

// ───────── Evaluación del desempeño (TH-FO-04) ─────────
// Factores tal como están en el formato de Industrias Yanko. Trabajo y personales se califican de 1 a 10; SST con 1, 3, 5 o 0 (no aplica).
export const FACTORES_TRABAJO = [
  { id: "calidad", nombre: "Calidad del trabajo", desc: "Cuidado, esmero y preocupación mostrada en el trabajo ejecutado." },
  { id: "equipo", nombre: "Trabajo en equipo", desc: "Tiene capacidad de trabajo en equipo." },
  { id: "ambiente", nombre: "Ambiente de trabajo", desc: "Colabora, comparte ideas, descubre e informa oportunidades, maneja una forma de actuar amigable y de cooperación." },
  { id: "problemas", nombre: "Solución de problemas", desc: "Identifica los problemas, reconoce las causas y propone soluciones." },
  { id: "cantidad", nombre: "Cantidad de trabajo", desc: "Número de tareas que ejecuta, rapidez y la forma en que realiza las labores." },
  { id: "instrucciones", nombre: "Capacidad para seguir instrucciones", desc: "Habilidad para captar las órdenes establecidas por el supervisor." },
  { id: "colaboracion", nombre: "Colaboración", desc: "Aptitud para integrarse al trabajo con esfuerzo conjunto con los compañeros, dirigido al logro de los objetivos propuestos." },
];
export const FACTORES_PERSONAL = [
  { id: "iniciativa", nombre: "Iniciativa", desc: "Toma iniciativa para aprender nuevas habilidades y extender sus metas." },
  { id: "excelencia", nombre: "Excelencia", desc: "Va más allá de los estándares o los requisitos mínimos de cada actividad o trabajo." },
  { id: "integridad", nombre: "Integridad", desc: "Es honesto en lo que dice y hace, asume la responsabilidad de las acciones colectivas e individuales, asegura la transparencia en la administración de recursos." },
  { id: "comunicacion", nombre: "Comunicación", desc: "Se dirige al personal con respeto y justicia, desarrolla efectivas relaciones de trabajo con jefes, compañeros y clientes, solicita y brinda retroalimentación." },
  { id: "supervision", nombre: "Supervisión", desc: "Compromete al personal a desempeñar al máximo de su habilidad, brinda información clara y da soporte a compañeros." },
  { id: "apertura", nombre: "Apertura al cambio", desc: "Muestra tolerancia hacia los puntos de vista de otros, solicita y aprovecha la retroalimentación de compañeros y superiores." },
  { id: "servicio", nombre: "Compromiso de servicio", desc: "Posee alta capacidad de servicio y cumple con los plazos previstos de sus actividades." },
];
export const FACTORES_SST = [
  { id: "politicas", nombre: "Compromiso con las políticas y objetivos del SG-SST", desc: "Cumple y hace cumplir las políticas y objetivos establecidos por la empresa para el SG-SST." },
  { id: "mejora", nombre: "Mejoramiento continuo", desc: "Reporta oportunamente los actos y condiciones inseguras identificadas en el desarrollo de sus actividades." },
  { id: "salud", nombre: "Condiciones de salud", desc: "Suministra información clara, veraz y completa sobre su estado de salud al área del SG-SST." },
  { id: "capacitaciones", nombre: "Capacitaciones", desc: "Asiste a las reuniones, capacitaciones e inducciones y/o reinducciones del SG-SST programadas por la empresa." },
  { id: "promocion", nombre: "Promoción y prevención", desc: "Participa en las actividades de promoción y prevención programadas por el SG-SST, tales como pausas activas." },
  { id: "liderazgo", nombre: "Liderazgo SG-SST", desc: "Promueve dentro y fuera de la organización el SG-SST, velando por el cumplimiento de procedimientos, instructivos, planes y programas." },
  { id: "epp", nombre: "Uso de EPP", desc: "Da el uso adecuado de los elementos de protección personal suministrados y cumple con los programas y estándares relacionados." },
];
export const OPCIONES_SST = [{ v: 1, t: "Insatisfactorio" }, { v: 3, t: "Aceptable" }, { v: 5, t: "Excelente" }, { v: 0, t: "No aplica" }];
// Nombre del nivel de una nota de 1 a 10 (columnas del formato: 1-5 Insatisfactorio, 6 Deficiente, 7 Bueno, 8 Muy bueno, 9-10 Excelente)
export const nivelNota = (n) => (n >= 9 ? "Excelente" : n === 8 ? "Muy bueno" : n === 7 ? "Bueno" : n === 6 ? "Deficiente" : n >= 1 ? "Insatisfactorio" : "");

const notaValida = (v) => Number.isInteger(v) && v >= 1 && v <= 10;
const sstValida = (v) => v === 0 || v === 1 || v === 3 || v === 5;
const promedio = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

// Resultado de UNA evaluación. «Puntaje total / ítems evaluados»: en SST el «No aplica» (0) no cuenta.
export function calcularEvaluacion(ev) {
  const e = ev || {};
  const t = FACTORES_TRABAJO.map((f) => (e.trabajo || {})[f.id]).filter(notaValida);
  const p = FACTORES_PERSONAL.map((f) => (e.personal || {})[f.id]).filter(notaValida);
  const sRespondidos = FACTORES_SST.map((f) => (e.sst || {})[f.id]).filter(sstValida);
  const s = sRespondidos.filter((v) => v > 0);
  return {
    promTrabajo: r2(promedio(t)), promPersonal: r2(promedio(p)), promGeneral: r2(promedio([...t, ...p])), promSst: r2(promedio(s)),
    respondidos: t.length + p.length + sRespondidos.length, total: FACTORES_TRABAJO.length + FACTORES_PERSONAL.length + FACTORES_SST.length,
    completa: t.length === FACTORES_TRABAJO.length && p.length === FACTORES_PERSONAL.length && sRespondidos.length === FACTORES_SST.length,
  };
}

// Semáforo de la hoja de tabulación: desempeño = promedio/10 (rojo < 70 %, naranja < 80 %, verde ≥ 80 %); SST = promedio/5 (rojo < 60 %, naranja < 80 %, verde ≥ 80 %)
export function semaforoEvaluacion(prom, tipo) {
  if (typeof prom !== "number" || Number.isNaN(prom)) return "";
  const x = tipo === "sst" ? prom / 5 : prom / 10;
  const rojo = tipo === "sst" ? 0.6 : 0.7;
  return x < rojo ? "rojo" : x < 0.8 ? "ambar" : "verde";
}

// Hoja de tabulación: promedio por factor sobre varias evaluaciones (el «No aplica» de SST no cuenta)
export function tabulacionEvaluaciones(evaluaciones) {
  const lista = evaluaciones || [];
  const grupo = (factores, clave, esSst) => factores.map((f) => {
    const v = lista.map((e) => (e[clave] || {})[f.id]).filter((x) => (esSst ? sstValida(x) && x > 0 : notaValida(x)));
    return { id: f.id, nombre: f.nombre, n: v.length, prom: r2(promedio(v)) };
  });
  const trabajo = grupo(FACTORES_TRABAJO, "trabajo", false), personal = grupo(FACTORES_PERSONAL, "personal", false), sst = grupo(FACTORES_SST, "sst", true);
  const proms = (g) => g.map((x) => x.prom).filter((x) => x !== null);
  return { n: lista.length, trabajo, personal, sst, promTrabajo: r2(promedio(proms(trabajo))), promPersonal: r2(promedio(proms(personal))), promGeneral: r2(promedio([...proms(trabajo), ...proms(personal)])), promSst: r2(promedio(proms(sst))) };
}

// Evaluaciones de los trabajadores activos de la lista (para la pestaña «Evaluaciones»); más reciente primero
export function evaluacionesDe(trabajadores, evaluaciones) {
  const porId = {};
  (evaluaciones || []).forEach((e) => { porId[e.trabajadorId || e.id] = e; });
  return (trabajadores || []).filter(esActivo).filter((t) => porId[t.id]).map((t) => ({ t, ev: porId[t.id], calc: calcularEvaluacion(porId[t.id]) }))
    .sort((a, b) => String((b.ev && b.ev.fecha) || "").localeCompare(String((a.ev && a.ev.fecha) || "")) || String(a.t.nombre).localeCompare(String(b.t.nombre)));
}
