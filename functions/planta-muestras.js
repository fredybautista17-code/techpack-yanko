// (2026-11-13, a pedido de Fredy) Aviso «planta de muestras sin trabajo». Funciones puras (sin Firestore ni red): la función programada de
// index.js (avisarPlantaMuestrasSinTrabajo) lee los datos, llama a estas y manda el correo.
// Un taller de muestra «tiene trabajo» si tiene al menos una muestra en el Cronograma de Muestras en estado pendiente (sin asignar), asignado
// (en el taller) o modificar (devuelta al taller). Una muestra «recibida» ya está en Diseño para revisión: el taller no la tiene.
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ESTADOS_CON_TRABAJO = ["pendiente", "asignado", "modificar"];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// talleres = config.talleresMuestra; vigilados = lista elegida en Administración (vacía = todos); muestras = docs de cronograma_muestras.
function talleresSinTrabajo(talleres, muestras, vigilados) {
  const base = Array.isArray(vigilados) && vigilados.length ? vigilados : talleres || [];
  const conTrabajo = new Set((muestras || []).filter((m) => m && m.taller && ESTADOS_CON_TRABAJO.includes(m.estado || "pendiente")).map((m) => norm(m.taller)));
  const vistos = new Set();
  return base.filter((t) => {
    const k = norm(t);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return !conTrabajo.has(k);
  });
}
function fechaTexto(hoyISO) {
  const [y, m, d] = String(hoyISO).split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS_SEMANA[f.getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}
function destinatariosPlantaMuestras(cfg) {
  const out = new Set();
  (Array.isArray(cfg?.destinatarios) ? cfg.destinatarios : []).forEach((c) => {
    const v = String(c || "").trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) out.add(v);
  });
  return [...out];
}
// Devuelve null si no hay nada que avisar.
function armarCorreoPlantaMuestras({ sinTrabajo, hoyISO, aprobadosSinCapsula }) {
  if (!sinTrabajo || !sinTrabajo.length) return null;
  const lista = sinTrabajo.map((t) => `<li><b>${esc(t)}</b></li>`).join("");
  const asunto = sinTrabajo.length === 1 ? `Planta de muestras sin trabajo: ${sinTrabajo[0]}` : `Planta de muestras sin trabajo: ${sinTrabajo.length} talleres desocupados`;
  const extra = aprobadosSinCapsula > 0
    ? `<p>Hay <b>${aprobadosSinCapsula}</b> prototipo${aprobadosSinCapsula === 1 ? "" : "s"} aprobado${aprobadosSinCapsula === 1 ? "" : "s"} sin cápsula que podrían entrar a trabajo (Mi Día → Aprobados sin cápsula).</p>`
    : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1A1A2E;max-width:560px">
<p>Hoy, <b>${esc(fechaTexto(hoyISO))}</b>, no hay muestras en el Cronograma de Muestras para:</p>
<ul>${lista}</ul>
<p>Es decir, están <b>sin trabajo</b> (desocupados). Hay que cargarles muestras en ATLAS → Diseño → Cronograma de Muestras.</p>
${extra}
<p style="color:#5A5A7A;font-size:12px">Aviso automático de ATLAS. Se manda una vez al día, solo en días de trabajo. Quién lo recibe se define en Administración → Notificaciones.</p>
</div>`;
  return { asunto, html };
}
module.exports = { ESTADOS_CON_TRABAJO, talleresSinTrabajo, destinatariosPlantaMuestras, armarCorreoPlantaMuestras, fechaTexto };
