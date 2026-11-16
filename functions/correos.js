// ─── CORREOS DE LA EMPRESA (2026-11-16, a pedido de Fredy) ───────────────────────────────────────
// Fase 1: bandeja unificada. ATLAS lee por IMAP las cuentas de Gmail que el administrador agrega en el módulo
// «Correos» (cuenta + contraseña de aplicación de Google) y guarda los mensajes en `correos_mensajes`.
// - Las contraseñas NO se guardan en claro: se cifran con AES-256-GCM usando el secreto CORREOS_CLAVE (Secret Manager)
//   y el texto cifrado vive en `correos_secretos/{cuentaId}`, que ninguna regla de Firestore deja leer desde el navegador.
// - Solo se LEE la bandeja de entrada: no se marca nada como leído en Gmail, no se borra ni se envía nada.
// - Este archivo tiene la lógica sin Firebase (cifrado, armado del mensaje, lectura IMAP); las funciones programadas y
//   llamables están al final de index.js (sincronizarCorreos, correosSincronizarAhora, correosGuardarCuenta).
const crypto = require("crypto");

const DIAS_PRIMERA_VEZ = 14; // la primera vez se traen los últimos 14 días
const MAX_POR_CORRIDA = 80; // por cuenta y por corrida (cada 10 minutos); lo que falta se trae en la siguiente
const MAX_TEXTO = 20000;
const MAX_FUENTE = 1500000; // bytes del correo que se descargan (los adjuntos grandes se cortan; solo se guarda su nombre)

// ── Cifrado de la contraseña de aplicación ──
const claveDe = (secreto) => crypto.createHash("sha256").update(String(secreto || "")).digest();
function cifrar(secreto, texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", claveDe(secreto), iv);
  const data = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
}
function descifrar(secreto, o) {
  const d = crypto.createDecipheriv("aes-256-gcm", claveDe(secreto), Buffer.from(o.iv, "base64"));
  d.setAuthTag(Buffer.from(o.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(o.data, "base64")), d.final()]).toString("utf8");
}
// Las contraseñas de aplicación de Google se muestran con espacios («abcd efgh ijkl mnop»): se guardan sin ellos.
const limpiarPass = (p) => String(p || "").replace(/\s+/g, "");

// ── Armado del mensaje que se guarda ──
const sinHtml = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
const personas = (campo) => ((campo && campo.value) || []).map((p) => ({ nombre: String(p.name || "").trim(), correo: String(p.address || "").trim().toLowerCase() })).filter((p) => p.correo);
function mensajeDesdeParsed(parsed, meta) {
  const texto = String(parsed.text || sinHtml(parsed.html) || "").trim();
  const de = personas(parsed.from)[0] || { nombre: "", correo: "" };
  const fecha = parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime()) ? parsed.date.toISOString() : (meta.fechaInterna ? new Date(meta.fechaInterna).toISOString() : new Date().toISOString());
  return {
    cuentaId: meta.cuentaId,
    cuenta: meta.cuenta,
    uid: meta.uid,
    mensajeId: String(parsed.messageId || ""),
    enRespuestaA: String(parsed.inReplyTo || ""),
    de,
    para: personas(parsed.to),
    copia: personas(parsed.cc),
    asunto: String(parsed.subject || "(sin asunto)").trim().slice(0, 300),
    fecha,
    texto: texto.slice(0, MAX_TEXTO),
    resumenCorto: texto.replace(/\s+/g, " ").slice(0, 240),
    adjuntos: (parsed.attachments || []).filter((a) => !a.related).map((a) => ({ nombre: String(a.filename || "adjunto").slice(0, 160), tipo: String(a.contentType || ""), tamano: Number(a.size) || 0 })).slice(0, 30),
    esMasivo: !!(parsed.headers && (parsed.headers.get("list") || parsed.headers.get("list-unsubscribe") || parsed.headers.get("list-id"))), // mailparser agrupa los List-* bajo «list»
    leidoGmail: !!meta.leido,
    leidoAtlas: false,
    estado: "nuevo",
    clasificacion: null, // la llena la IA (correos-ia.js); null = pendiente de clasificar
    creadoEn: new Date().toISOString(),
  };
}

function textoErrorImap(e) {
  const t = String((e && (e.responseText || e.message)) || e || "");
  if (/AUTHENTICATIONFAILED|Invalid credentials|authenticat/i.test(t) || (e && e.authenticationFailed)) return "Gmail rechazó el acceso. Revisa que el correo sea el correcto, que tenga la verificación en dos pasos activa y que la contraseña de aplicación esté bien escrita (16 letras).";
  if (/IMAP.*disabled|not enabled/i.test(t)) return "El acceso IMAP está desactivado en esa cuenta de Gmail. Actívalo en Configuración → Reenvío y correo POP/IMAP.";
  return t.slice(0, 240) || "No se pudo conectar con Gmail.";
}

async function conectar(correo, pass) {
  const { ImapFlow } = require("imapflow");
  const cliente = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: correo, pass }, logger: false });
  cliente.on("error", () => {}); // los errores se atrapan en connect()/fetch; evita que tumben la función
  await cliente.connect();
  return cliente;
}

// Prueba el correo y la contraseña sin guardar nada.
async function probarCuenta(correo, pass) {
  const cliente = await conectar(correo, pass);
  try { await cliente.logout(); } catch (e) { /* ya cerrada */ }
}

// Lee los correos nuevos de la bandeja de entrada de una cuenta. `estado` = { uidValidity, ultimoUid } de la última corrida.
// Devuelve { mensajes: [...], ultimoUid, uidValidity, pendientes }.
async function leerNuevos({ cuentaId, correo, pass, estado }) {
  const { simpleParser } = require("mailparser");
  const cliente = await conectar(correo, pass);
  const mensajes = [];
  let ultimoUid = 0, uidValidity = "", pendientes = false;
  try {
    const lock = await cliente.getMailboxLock("INBOX");
    try {
      uidValidity = String(cliente.mailbox.uidValidity);
      const previo = estado && String(estado.uidValidity) === uidValidity ? Number(estado.ultimoUid) || 0 : 0;
      ultimoUid = previo;
      let uids = [];
      if (previo > 0) {
        const todos = (await cliente.search({ uid: `${previo + 1}:*` }, { uid: true })) || [];
        uids = todos.filter((u) => u > previo);
      } else {
        const desde = new Date(Date.now() - DIAS_PRIMERA_VEZ * 86400000);
        uids = (await cliente.search({ since: desde }, { uid: true })) || [];
      }
      uids.sort((a, b) => a - b);
      if (uids.length > MAX_POR_CORRIDA) { pendientes = true; uids = uids.slice(0, MAX_POR_CORRIDA); }
      if (uids.length) {
        for await (const msg of cliente.fetch(uids.join(","), { uid: true, flags: true, internalDate: true, source: { maxLength: MAX_FUENTE } }, { uid: true })) {
          try {
            const parsed = await simpleParser(msg.source);
            mensajes.push(mensajeDesdeParsed(parsed, { cuentaId, cuenta: correo, uid: msg.uid, fechaInterna: msg.internalDate, leido: msg.flags && msg.flags.has("\\Seen") }));
          } catch (e) {
            mensajes.push(mensajeDesdeParsed({ subject: "(no se pudo leer este correo)", text: "", date: msg.internalDate }, { cuentaId, cuenta: correo, uid: msg.uid, fechaInterna: msg.internalDate, leido: false }));
          }
          if (msg.uid > ultimoUid) ultimoUid = msg.uid;
        }
      }
    } finally { lock.release(); }
  } finally { try { await cliente.logout(); } catch (e) { /* ya cerrada */ } }
  return { mensajes, ultimoUid, uidValidity, pendientes };
}

const idMensaje = (m, uidValidity) => `${m.cuentaId}_${uidValidity}_${m.uid}`;

// ── Adjuntos bajo demanda (2026-11-16) ──
// Los archivos NO se guardan en Firebase: cuando el administrador pulsa «Abrir» o «Descargar» se vuelve a pedir ese correo
// a Gmail, se saca el adjunto y se devuelve. Los adjuntos son de terceros: aquí solo se entregan (nunca se ejecutan ni se abren).
const MAX_ADJUNTO = 6 * 1024 * 1024; // bytes; la respuesta de una función llamable admite ~10 MB y base64 pesa 1/3 más
const MAX_CORREO_COMPLETO = 14 * 1024 * 1024;
const APTOS_PARA_VER = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]; // lo demás solo se descarga

// Saca el adjunto número `indice` (contando como al guardar: sin los incrustados en el cuerpo) de un correo completo.
async function adjuntoDeFuente(source, indice, nombreEsperado) {
  const { simpleParser } = require("mailparser");
  const parsed = await simpleParser(source);
  const lista = (parsed.attachments || []).filter((a) => !a.related);
  const a = lista[indice];
  if (!a) throw new Error("No se encontró ese adjunto en el correo.");
  const nombre = String(a.filename || "adjunto").slice(0, 160);
  if (nombreEsperado && nombre !== String(nombreEsperado).slice(0, 160)) throw new Error("El adjunto no coincide con el que se guardó. Ábrelo en Gmail.");
  const tamano = a.content ? a.content.length : 0;
  if (tamano > MAX_ADJUNTO) throw new Error(`El adjunto pesa ${(tamano / 1048576).toFixed(1).replace(".", ",")} MB y el límite aquí es ${MAX_ADJUNTO / 1048576} MB. Ábrelo en Gmail.`);
  const tipo = String(a.contentType || "application/octet-stream").toLowerCase().split(";")[0].trim();
  return { nombre, tipo: APTOS_PARA_VER.includes(tipo) ? tipo : "application/octet-stream", tamano, base64: a.content.toString("base64") };
}

async function descargarAdjunto({ correo, pass, uid, uidValidity, indice, nombre }) {
  const cliente = await conectar(correo, pass);
  try {
    const lock = await cliente.getMailboxLock("INBOX");
    try {
      if (String(cliente.mailbox.uidValidity) !== String(uidValidity)) throw new Error("Gmail renumeró esta bandeja y ya no se puede ubicar el correo. Ábrelo en Gmail.");
      const msg = await cliente.fetchOne(uid, { source: { maxLength: MAX_CORREO_COMPLETO } }, { uid: true });
      if (!msg || !msg.source) throw new Error("Ese correo ya no está en la bandeja de Gmail.");
      return await adjuntoDeFuente(msg.source, indice, nombre);
    } finally { lock.release(); }
  } finally { try { await cliente.logout(); } catch (e) { /* ya cerrada */ } }
}

module.exports = { cifrar, descifrar, limpiarPass, mensajeDesdeParsed, probarCuenta, leerNuevos, textoErrorImap, idMensaje, adjuntoDeFuente, descargarAdjunto, DIAS_PRIMERA_VEZ, MAX_POR_CORRIDA };
