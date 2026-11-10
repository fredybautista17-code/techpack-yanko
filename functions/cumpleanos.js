// (2026-11-10, a pedido de Fredy) Aviso diario de cumpleaños a Talento Humano. Funciones puras (sin Firestore ni red):
// la función programada de index.js (avisarCumpleanos) lee la lista y los usuarios, llama a estas y manda el correo.
// Avisa dos veces por persona: 3 días antes y el mismo día. Lista: colección nomina_cumpleanos {nombre, mes, dia, activo?}.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MS_DIA = 86400000;
const TARJETA_MI_DIA = "cumpleanos"; // quien tenga esta tarjeta marcada en Usuarios → Mi Día recibe el correo

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const diaValido = (mes, dia) => Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(dia) && dia >= 1 && dia <= DIAS_DEL_MES[mes - 1];
const bisiesto = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const fechaEn = (y, mes, dia) => Date.UTC(y, mes - 1, mes === 2 && dia === 29 && !bisiesto(y) ? 28 : dia);
const msDeISO = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return Date.UTC(y, m - 1, d); };
const nombreBonito = (s) => String(s || "").trim().toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
// Las personas especiales (no son trabajadores activos) llevan su etiqueta: «Pastor Rene (Pastor)».
const conEtiqueta = (x) => nombreBonito(x.nombre) + (x.especial === true && String(x.etiqueta || "").trim() ? ` (${String(x.etiqueta).trim()})` : "");

function diasFaltan(mes, dia, hoyISO) {
  const h = msDeISO(hoyISO);
  const y = new Date(h).getUTCFullYear();
  let t = fechaEn(y, mes, dia);
  if (t < h) t = fechaEn(y + 1, mes, dia);
  return Math.round((t - h) / MS_DIA);
}
const fechaTexto = (hoyISO, sumar) => {
  const d = new Date(msDeISO(hoyISO) + sumar * MS_DIA);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
};

// {hoy: [nombres], en3: [nombres]} — solo activos y con día válido; ordenados por nombre.
function cumpleanosParaAviso(lista, hoyISO) {
  const validos = (lista || []).filter((x) => x && x.activo !== false && diaValido(Number(x.mes), Number(x.dia)));
  const por = (n) => validos.filter((x) => diasFaltan(Number(x.mes), Number(x.dia), hoyISO) === n).map(conEtiqueta).sort((a, b) => a.localeCompare(b, "es"));
  return { hoy: por(0), en3: por(3) };
}

// usuarios = docs de users ({name, email, activo, tarjetasMiDia}). Solo los activos con correo que tienen marcada la tarjeta de cumpleaños.
function destinatariosCumpleanos(usuarios) {
  const correos = new Set();
  (usuarios || []).forEach((u) => {
    if (!u || u.activo === false || !String(u.email || "").includes("@")) return;
    if ((u.tarjetasMiDia || []).includes(TARJETA_MI_DIA)) correos.add(String(u.email).trim().toLowerCase());
  });
  return [...correos];
}

// Devuelve null si no hay nada que avisar ese día.
function armarCorreoCumpleanos(av, hoyISO) {
  const { hoy, en3 } = av;
  if (!hoy.length && !en3.length) return null;
  const resumen = (nombres) => (nombres.length > 3 ? `${nombres.length} personas` : nombres.join(", "));
  const asunto = hoy.length && en3.length
    ? `🎂 Cumpleaños: hoy ${resumen(hoy)} y en 3 días ${resumen(en3)}`
    : hoy.length ? `🎂 Hoy cumple años ${resumen(hoy)}` : `🎂 En 3 días cumple años ${resumen(en3)}`;
  const bloque = (titulo, nombres) => (nombres.length
    ? `<div style="font-weight:700;margin-top:10px">${esc(titulo)}</div><ul style="margin:6px 0 10px;padding-left:20px">${nombres.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
    : "");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A2E;max-width:560px">` +
    `<h2 style="margin:0 0 4px">🎂 Cumpleaños de Yanko</h2>` +
    bloque(`Hoy, ${fechaTexto(hoyISO, 0)}`, hoy) +
    bloque(`En 3 días, ${fechaTexto(hoyISO, 3)}`, en3) +
    `<div style="color:#5A5A7A;font-size:12px;margin-top:16px">Aviso automático de ATLAS. La lista se cambia en Nómina → Personal → Cumpleaños.</div></div>`;
  return { asunto, html };
}

module.exports = { TARJETA_MI_DIA, cumpleanosParaAviso, destinatariosCumpleanos, armarCorreoCumpleanos, diasFaltan };
