// (2026-11-10, a pedido de Fredy) Correo «Nueva devolución» cuando un cliente reporta una devolución. Funciones puras (sin Firestore ni red):
// la función de index.js (avisarNuevaDevolucionCliente) lee los usuarios, llama a estas y manda el correo.

// Quiénes lo reciben: todos los usuarios ACTIVOS con correo de los roles Gerencia y Bodega, más estas personas buscadas por nombre.
const ROLES_AVISO = ["gerencia", "bodega"];
const PERSONAS_AVISO = ["Anny Beltrán", "Diego Ochoa", "María Fernanda Páez"];

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const palabras = (s) => sinTildes(s).split(/\s+/).filter(Boolean);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// usuarios = docs de la colección users ({name, email, role, activo}). Devuelve {correos, sinCorreo: [nombres no encontrados o sin correo]}.
function destinatariosDevolucion(usuarios) {
  const activos = (usuarios || []).filter((u) => u && u.activo !== false && String(u.email || "").includes("@"));
  const correos = new Set();
  activos.forEach((u) => {
    const rol = sinTildes(u.role);
    if (rol && rol !== "cliente" && ROLES_AVISO.some((r) => rol.includes(r))) correos.add(String(u.email).trim().toLowerCase());
  });
  const sinCorreo = [];
  PERSONAS_AVISO.forEach((persona) => {
    const buscadas = palabras(persona); // todas las palabras deben estar en el nombre del usuario (ANNY CLARISA BELTRAN JAIMES ← Anny Beltrán)
    const hallados = activos.filter((u) => {
      const p = palabras(u.name);
      return buscadas.every((b) => p.includes(b));
    });
    if (!hallados.length) sinCorreo.push(persona);
    hallados.forEach((u) => correos.add(String(u.email).trim().toLowerCase()));
  });
  return { correos: [...correos], sinCorreo };
}

const TALLAS_ADULTO = { T2: "U", T4: "XS", T6: "S", T8: "M", T10: "L", T12: "XL", T14: "2XL", T16: "3XL", T18: "4XL" };
const TALLAS_ORDEN = ["T2", "T4", "T6", "T8", "T10", "T12", "T14", "T16", "T18", "T24", "T36"];
const ORIGENES = { factura: "🧾 Facturada", traslado_externo: "🚚 Traslado externo", traslado_consignacion: "🚚 Traslado en consignación", mixto: "Mixto (por confirmar)", sin_dato: "Sin dato" };

// d = documento de devoluciones_cliente. Devuelve {asunto, html}.
function armarCorreoDevolucion(d) {
  const infantil = d.tallasInfantil === true ? true : d.tallasInfantil === false ? false : /ni[ñn][oa]/i.test(String(d.grupo || ""));
  const etiqueta = (t) => (infantil ? String(t).replace(/^T/, "") : TALLAS_ADULTO[t] || String(t));
  const lineas = d.lineas || [];
  const tallas = TALLAS_ORDEN.filter((t) => lineas.some((l) => Number(l.cantidades?.[t]) > 0));
  const celda = "padding:6px 10px;border-bottom:1px solid #E8E2DB;";
  const filas = lineas.map((l) => (
    `<tr><td style="${celda}">${esc(l.colorNombre ? `${l.color} · ${l.colorNombre}` : l.color)}</td>` +
    tallas.map((t) => `<td style="${celda}text-align:right">${Number(l.cantidades?.[t]) || ""}</td>`).join("") + "</tr>"
  )).join("");
  const encabezado = `<tr><th style="${celda}text-align:left">Color</th>${tallas.map((t) => `<th style="${celda}text-align:right">${esc(etiqueta(t))}</th>`).join("")}</tr>`;
  const origen = d.origen?.tipo ? `${ORIGENES[d.origen.tipo] || d.origen.tipo}${d.origen.documentos?.length ? ` · ${d.origen.documentos.map(esc).join(", ")}` : ""}${d.origen.confirmar ? ` (por confirmar: Busint lo muestra como ${esc(ORIGENES[d.origen.busint] || d.origen.busint || "otro tipo")})` : ""}` : "";
  const dato = (k, v) => (v ? `<tr><td style="padding:3px 14px 3px 0;color:#5A5A7A">${k}</td><td style="padding:3px 0"><b>${v}</b></td></tr>` : "");
  const asunto = `↩️ Nueva devolución ${d.numero || ""} · ${d.cliente || "Cliente"} · lote ${d.lote || "—"} · ${Number(d.total) || 0} und`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A2E;max-width:640px">` +
    `<h2 style="margin:0 0 4px">↩️ Nueva devolución ${esc(d.numero)}</h2>` +
    `<div style="color:#5A5A7A;margin-bottom:14px">El cliente acaba de reportar una devolución${d.estado === "en_camino" ? " (ya viene en camino)" : ""}.</div>` +
    `<table style="border-collapse:collapse;margin-bottom:14px">` +
    dato("Cliente", esc(d.cliente)) + dato("Lote", esc(d.lote)) + dato("Referencia", esc(d.ref)) + dato("Pedido", esc(d.pedido)) +
    dato("Unidades", String(Number(d.total) || 0)) + dato("Motivo", esc(d.motivo)) + dato("Guía de transporte", esc(d.guia)) +
    dato("Origen en Busint", origen) + dato(d.origen?.tipo === "factura" ? "Factura original" : "Remisión original (TNS)", esc(d.documentoOriginal)) + dato("Reportada por", esc(d.creadoPor)) +
    (d.solicitaDespacho ? dato("Pide despacho de nuevo", esc(d.solicitaDespacho.nota ? `Sí — ${d.solicitaDespacho.nota}` : "Sí")) : "") +
    dato("Nota del cliente", esc(d.observaciones)) +
    `</table>` +
    (filas ? `<div style="font-weight:700;margin-bottom:6px">Declarado por el cliente</div><table style="border-collapse:collapse;font-size:14px">${encabezado}${filas}</table>` : "") +
    `<div style="color:#5A5A7A;font-size:12px;margin-top:18px">Aviso automático de ATLAS. Entra a Bodega → Devoluciones para atenderla.</div></div>`;
  return { asunto, html };
}

module.exports = { ROLES_AVISO, PERSONAS_AVISO, destinatariosDevolucion, armarCorreoDevolucion };
