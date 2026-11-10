// (2026-11-10, a pedido de Fredy) Cumpleaños de los trabajadores para Talento Humano. Funciones puras (sin Firestore ni red):
// las usan la pantalla de Nómina → Personal → Cumpleaños y la tarjeta «🎂 Cumpleaños» del Mi Día.
// La lista vive en la colección nomina_cumpleanos: {id, nombre, mes (1-12), dia (1-31 o null si falta), activo?, especial?, etiqueta?}. Solo día y mes: no hay año.
// «especial: true» = persona a quien también se le avisa el cumpleaños pero que NO es trabajador activo de ATLAS (ex colaborador, externo, el pastor…);
// la «etiqueta» dice quién es («Pastor», «Mecánico»). Las personas especiales no se comparan contra Nómina.

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MS_DIA = 86400000;

export const hoyBogotaISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
export const diaValido = (mes, dia) => Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(dia) && dia >= 1 && dia <= DIAS_DEL_MES[mes - 1];
const bisiesto = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
// Quien nació un 29 de febrero celebra el 28 en los años que no son bisiestos.
const fechaEn = (y, mes, dia) => Date.UTC(y, mes - 1, mes === 2 && dia === 29 && !bisiesto(y) ? 28 : dia);
const msDeISO = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return Date.UTC(y, m - 1, d); };

// Días que faltan para el próximo cumpleaños (0 = hoy).
export function diasFaltan(mes, dia, hoyISO) {
  const h = msDeISO(hoyISO);
  const y = new Date(h).getUTCFullYear();
  let t = fechaEn(y, mes, dia);
  if (t < h) t = fechaEn(y + 1, mes, dia);
  return Math.round((t - h) / MS_DIA);
}
// «sábado 21 de noviembre»
export function fechaTexto(mes, dia, hoyISO) {
  const d = new Date(msDeISO(hoyISO) + diasFaltan(mes, dia, hoyISO) * MS_DIA);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()}`;
}
export const nombreBonito = (s) => String(s || "").trim().toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
export const esEspecial = (x) => !!x && x.especial === true;
// «Pastor Rene (Pastor)»: el nombre con su etiqueta si es una persona especial y la tiene.
export const nombreConEtiqueta = (x) => nombreBonito(x && x.nombre) + (esEspecial(x) && String(x.etiqueta || "").trim() ? ` (${String(x.etiqueta).trim()})` : "");
// «CL» para Cindy Leal: iniciales de las dos primeras palabras.
export function iniciales(nombre) {
  const p = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return ((p[0][0] || "") + (p.length > 1 ? p[1][0] || "" : p[0][1] || "")).toUpperCase();
}

// Los que cuentan para los avisos: activos y con un día válido.
export const cumpleanosValidos = (lista) => (lista || []).filter((x) => x && x.activo !== false && diaValido(Number(x.mes), Number(x.dia)));
export const cumpleanosSinDia = (lista) => (lista || []).filter((x) => x && x.activo !== false && !diaValido(Number(x.mes), Number(x.dia)));

// Para la tarjeta del Mi Día: hoy, próximos 3 días (1 a 3) y más adelante (4 a hasta). Cada uno con `faltan`.
export function agruparProximos(lista, hoyISO, hasta = 30) {
  const todos = cumpleanosValidos(lista)
    .map((x) => ({ ...x, mes: Number(x.mes), dia: Number(x.dia), faltan: diasFaltan(Number(x.mes), Number(x.dia), hoyISO) }))
    .sort((a, b) => a.faltan - b.faltan || String(a.nombre).localeCompare(String(b.nombre), "es"));
  return {
    hoy: todos.filter((x) => x.faltan === 0),
    proximos3: todos.filter((x) => x.faltan >= 1 && x.faltan <= 3),
    adelante: todos.filter((x) => x.faltan > 3 && x.faltan <= hasta),
  };
}

// ─── Revisión contra los trabajadores activos de Nómina ───
// (2026-11-10, a pedido de Fredy) El documento de cumpleaños trae nombres cortos («ANNY BELTRAN») y Nómina nombres completos
// («ANNY CLARISA BELTRAN JAIMES»): una persona coincide con un trabajador activo si TODAS las palabras de su nombre están en el nombre
// completo (sin tildes ni mayúsculas, en cualquier orden). Nada se cambia solo: es una lista para que Talento Humano decida.
const normPalabras = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").split(/\s+/).filter(Boolean);
const claveTrab = (t) => String(t.id ?? t.nombre);

// lista = nomina_cumpleanos; trabajadores = nomina_trabajadores. Los cumpleaños ya sin avisos (activo === false) y las personas especiales no entran a la revisión.
export function revisarContraActivos(lista, trabajadores) {
  const activos = (trabajadores || [])
    .filter((t) => t && t.activo !== false && String(t.nombre || "").trim())
    .map((t) => ({ t, palabras: new Set(normPalabras(t.nombre)) }));
  const coinciden = [], noAparecen = [], dudosos = [];
  const usados = new Set();
  (lista || []).filter((c) => c && c.activo !== false && !esEspecial(c)).forEach((c) => {
    const w = normPalabras(c.nombre);
    const hallados = w.length ? activos.filter((a) => w.every((p) => a.palabras.has(p))) : [];
    hallados.forEach((a) => usados.add(claveTrab(a.t)));
    if (!hallados.length) noAparecen.push(c);
    else if (hallados.length === 1) coinciden.push({ c, t: hallados[0].t });
    else dudosos.push({ c, candidatos: hallados.map((h) => h.t) });
  });
  const activosSinCumple = activos.filter((a) => !usados.has(claveTrab(a.t))).map((a) => a.t).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  return { coinciden, noAparecen, dudosos, activosSinCumple, totalActivos: activos.length };
}
