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

export function formatosDe(t, exp) {
  return FORMATOS_TH.map((f) => ({ ...f, estado: estadoFormato(t, exp, f.codigo), dato: (exp && exp.formatos && exp.formatos[f.codigo]) || {} }));
}
export const pendientesDe = (t, exp) => formatosDe(t, exp).filter((f) => f.estado === "pend" || f.estado === "venc");
export function porcentajeExpediente(t, exp) {
  const aplica = formatosDe(t, exp).filter((f) => f.estado !== "na");
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
export function resumenTablero(trabajadores, expedientes, candidatos, hoyISO) {
  const exps = mapaExpedientes(expedientes);
  const activos = (trabajadores || []).filter(esActivo);
  const alertas = alertasVencimiento(activos, exps, hoyISO);
  const conDotacion = activos.filter((t) => aplicaDotacion(t, exps[t.id]));
  const dotListos = conDotacion.filter((t) => estadoFormato(t, exps[t.id], "TH-FO-02") === "ok");
  const conPend = activos.filter((t) => pendientesDe(t, exps[t.id]).length > 0);
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
export function avancePorArea(trabajadores, expedientes) {
  const exps = mapaExpedientes(expedientes);
  const por = {};
  (trabajadores || []).filter(esActivo).forEach((t) => { const a = t.area || "Sin asignar"; (por[a] = por[a] || []).push(porcentajeExpediente(t, exps[t.id])); });
  return Object.entries(por).map(([area, v]) => ({ area, n: v.length, pct: Math.round(v.reduce((s, x) => s + x, 0) / v.length) })).sort((a, b) => a.pct - b.pct || a.area.localeCompare(b.area));
}

// Sugerencia al marcar «Fin del período de prueba»: 2 meses desde el ingreso (máximo legal)
export const sugerirFinPrueba = (t) => (esFecha(t && t.fechaIngreso) ? sumarDias(sumarMeses(t.fechaIngreso, 2), -1) : "");
