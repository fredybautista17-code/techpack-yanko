/**
 * Integración con la API de Busint (Órdenes de Pedidos).
 *
 * Dos funciones distintas comparten las mismas credenciales y el mismo
 * endpoint de Busint:
 *
 * 1. `syncPedidosBusint` (programada, corre sola cada 6 horas): reemplaza el
 *    flujo manual de "descargar Excel de Busint → subirlo al aplicativo".
 *    Consulta los últimos 14 días y guarda en Firestore los pedidos que aún
 *    no existan.
 *
 * 2. `getPedidosVigentesBusint` (bajo demanda, "callable" desde la app): se
 *    usa para el Informe de Pedidos Vigentes por Cliente — consulta Busint
 *    EN VIVO para el rango de fechas que el usuario escoja en pantalla (no
 *    depende de lo que ya esté guardado en Firestore), agrupados por cliente
 *    (Busint siempre trae una fechaDespacho poblada — es la fecha PROGRAMADA
 *    de entrega, no una marca de "ya se entregó"). "Vigente" ya NO depende
 *    del módulo Corte (esa colección, `corte_pedidos`, nunca se llegó a usar
 *    en la práctica — nadie subió nada ahí, así que todo salía siempre como
 *    pendiente). En vez de eso:
 *      a) Se consulta también `ApiGen_FacturadoBusint` (mismo rango de
 *         fechas, hasta hoy). Busint factura por REFERENCIA, no por pedido
 *         completo, así que se suman las unidades facturadas (`cant`) de
 *         todas las filas de cada pedido y se comparan contra el total
 *         pedido — solo se excluye del informe si ya quedó 100% facturado
 *         (factura normal, traslado externo, traslado en consignación,
 *         etc., sin distinguir tipo). Un pedido con solo una referencia
 *         facturada de varias sigue apareciendo como vigente.
 *      b) Para los que no están facturados, se cruza contra la carga más
 *         reciente de Planeación (`planeacion_cargas`, la misma que usa el
 *         módulo Planta) por número de pedido: si ya tiene un lote ahí, se
 *         muestra en qué etapa va (Corte, BMP, Planta, Semiterminado, BPT —
 *         campo `ubicacionActual` del lote); si NO tiene ningún lote, se
 *         marca "sin cortar" — es el caso más urgente, porque significa que
 *         el pedido ni siquiera ha iniciado producción.
 *    También marca `vencido` cuando la fechaDespacho ya pasó y el pedido
 *    sigue sin facturar — esos aparecen primero, para priorizar atención. Si
 *    la consulta a `ApiGen_FacturadoBusint` falla, no se cae el informe
 *    completo: se muestra igual (sin excluir nada por facturación) y se
 *    avisa con `avisoFacturacion` en la respuesta.
 *
 * CREDENCIALES: el token y la URL base de Busint NUNCA se escriben en este
 * archivo (que queda en un repositorio público) — se leen como "secrets" de
 * Firebase, configurados una sola vez desde la línea de comandos:
 *
 *   firebase functions:secrets:set BUSINT_TOKEN
 *   firebase functions:secrets:set BUSINT_BASE_URL
 *   firebase functions:secrets:set BUSINT_PROXY_SECRET
 *
 * IMPORTANTE — Busint Cloud exige conectarse por VPN (WireGuard) para poder
 * usar la API; una Cloud Function no puede mantener una VPN abierta por sí
 * sola. Por eso estas funciones NO le hablan directo a Busint: le hablan a
 * una VM-puente (una máquina virtual siempre conectada a la VPN de Busint,
 * que reenvía la petición) — ver vm-busint-relay-startup.sh. En este caso:
 *   - BUSINT_BASE_URL = la dirección de esa VM-puente, ej: http://IP:8080
 *     (SIN "/" al final)
 *   - BUSINT_PROXY_SECRET = el mismo secreto configurado en la VM, para que
 *     solo esta función pueda usar el puente (nadie más que sepa la IP).
 *
 * Ver README_BUSINT_SYNC.md para la guía completa de despliegue. Si ya
 * desplegaste `syncPedidosBusint` antes, estos secrets ya están configurados
 * y `getPedidosVigentesBusint` los reutiliza tal cual — no hace falta
 * volver a pegarlos en ningún lado.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const BUSINT_TOKEN = defineSecret("BUSINT_TOKEN");
const BUSINT_BASE_URL = defineSecret("BUSINT_BASE_URL");
const BUSINT_PROXY_SECRET = defineSecret("BUSINT_PROXY_SECRET");

function fmtFecha(d) {
  return d.toISOString().slice(0, 10);
}

// Convierte una fecha ISO ("2024-12-05T13:28:57.015Z") al formato de fecha
// simple ("2024-12-05") que usa el resto del aplicativo.
function soloFecha(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

// El endpoint real (confirmado contra el swagger.json de esta instancia de
// Busint Cloud) es "ApiGen_OrdenesDePedidoBusint" (Pedido en singular) y
// espera el cuerpo como multipart/form-data con los campos Token,
// FechaInicio y FechaFin — NO como JSON con el token en un header, que era
// el formato asumido originalmente (y que Busint respondía con 404).
async function consultarOrdenesBusint(fechaInicio, fechaFin) {
  const baseUrl = BUSINT_BASE_URL.value().replace(/\/+$/, "");
  const token = BUSINT_TOKEN.value();
  const proxySecret = BUSINT_PROXY_SECRET.value();

  const form = new FormData();
  form.append("Token", token);
  form.append("FechaInicio", fechaInicio);
  form.append("FechaFin", fechaFin);

  const resp = await fetch(`${baseUrl}/consultas/ApiGen_OrdenesDePedidoBusint`, {
    method: "POST",
    headers: { "X-Proxy-Secret": proxySecret },
    body: form,
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    logger.error("Busint respondió con error", { status: resp.status, texto });
    throw new Error(`Busint respondió ${resp.status}`);
  }

  const filas = await resp.json();
  return Array.isArray(filas) ? filas : [];
}

// La API entrega una fila por cada combinación ref+pinta+color+talla dentro
// de un mismo pedido (numPed). Se agrupan en un solo objeto de pedido por
// numPed, y dentro de cada uno, una "referencia" por ref+pinta+color con sus
// tallas. Usado tanto por la sincronización programada como por el informe
// de pedidos vigentes bajo demanda.
//
// OJO: el valor de "talla" que entrega Busint se usa tal cual como llave
// dentro de `tallas` — si no coincide exactamente con las 10 etiquetas fijas
// que usa la grilla de edición manual del aplicativo (ver TALLA_LABELS en
// src/App.js), esa cantidad igual queda guardada y se suma correctamente al
// total, pero puede no mostrarse en una casilla dentro del formulario de
// edición manual.
function agruparFilasBusintPorPedido(filas) {
  const porPedido = new Map();
  for (const f of filas) {
    const numero = String(f.numPed ?? "").trim();
    if (!numero) continue;
    if (!porPedido.has(numero)) {
      porPedido.set(numero, {
        numero,
        cliente: (f.cliente || "").trim(),
        fechaPedido: soloFecha(f.fechaPed),
        fechaDespacho: soloFecha(f.fechaDespacho),
        refsPorClave: new Map(),
      });
    }
    const pedido = porPedido.get(numero);
    const claveRef = [f.ref, f.pinta, f.color].map((x) => x || "").join("|");
    if (!pedido.refsPorClave.has(claveRef)) {
      pedido.refsPorClave.set(claveRef, {
        id: cryptoRandomId(),
        ref: f.ref || "",
        descripcion: [f.pinta, f.color].filter(Boolean).join(" · "),
        tallas: {},
        total: 0,
      });
    }
    const refObj = pedido.refsPorClave.get(claveRef);
    const talla = String(f.talla || "").trim() || "Sin talla";
    const cant = Math.round(Number(f.cantPed) || 0);
    refObj.tallas[talla] = (refObj.tallas[talla] || 0) + cant;
    refObj.total += cant;
  }
  return porPedido;
}

// Consulta "ApiGen_FacturadoBusint" — trae, para un rango de fechas, TODO lo
// que ya se facturó o se sacó de la fábrica: facturas normales, traslados
// externos, traslados en consignación y sus devoluciones (así lo describe la
// documentación de Busint). Se usa el mismo formato de solicitud confirmado
// para "ApiGen_OrdenesDePedidoBusint" (form-data con Token/FechaInicio/
// FechaFin, no JSON), porque es la misma familia de API — si Busint responde
// distinto para este endpoint en particular, revisar los logs de
// getPedidosVigentesBusint.
async function consultarFacturadoBusint(fechaInicio, fechaFin) {
  const baseUrl = BUSINT_BASE_URL.value().replace(/\/+$/, "");
  const token = BUSINT_TOKEN.value();
  const proxySecret = BUSINT_PROXY_SECRET.value();

  const form = new FormData();
  form.append("Token", token);
  form.append("FechaInicio", fechaInicio);
  form.append("FechaFin", fechaFin);

  const resp = await fetch(`${baseUrl}/consultas/ApiGen_FacturadoBusint`, {
    method: "POST",
    headers: { "X-Proxy-Secret": proxySecret },
    body: form,
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    logger.error("Busint respondió con error (ApiGen_FacturadoBusint)", { status: resp.status, texto });
    throw new Error(`Busint respondió ${resp.status}`);
  }

  const filas = await resp.json();
  return Array.isArray(filas) ? filas : [];
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// NOTA: este archivo tenía antes una función programada (`syncPedidosBusint`,
// corría sola cada 6 horas) que copiaba pedidos de Busint a la colección
// "pedidos". Se retiró — ese auto-sync generaba una base separada y
// desincronizada de la que realmente importa (la que corta el módulo Corte),
// y nunca reflejaba con certeza qué seguía vigente. El flujo actual es:
// getPedidosVigentesBusint (consulta en vivo, siempre fresca) + el botón
// "Congelar como base de Corte" en la pantalla de Vigentes, que escribe
// directo a la colección "pedidos_activos" — una sola fuente de verdad que
// tanto Pedidos como Corte leen. Si vuelves a ver un despliegue que mencione
// `syncPedidosBusint`, es una versión vieja de este archivo.
// IMPORTANTE AL DESPLEGAR: `firebase deploy --only functions` puede
// preguntar si quieres borrar la función `syncPedidosBusint` porque ya no
// está en este código — contesta que sí, así se apaga también el
// Cloud Scheduler que la disparaba cada 6 horas.

// Informe de Pedidos Vigentes por Cliente — consulta Busint EN VIVO (no lee
// Firestore) para el rango { fechaInicio, fechaFin } que envía la pantalla,
// y devuelve solo los pedidos cuya fecha de despacho es hoy o está en el
// futuro, agrupados por cliente. Se llama desde el navegador con
// `httpsCallable(functions, "getPedidosVigentesBusint")({ fechaInicio, fechaFin })`.
exports.getPedidosVigentesBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL, BUSINT_PROXY_SECRET],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { fechaInicio, fechaFin } = request.data || {};
    const fechaValida = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!fechaValida(fechaInicio) || !fechaValida(fechaFin)) {
      throw new HttpsError("invalid-argument", "fechaInicio y fechaFin son obligatorias, en formato AAAA-MM-DD.");
    }

    let filas;
    try {
      filas = await consultarOrdenesBusint(fechaInicio, fechaFin);
    } catch (err) {
      logger.error("Error consultando Busint (getPedidosVigentesBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar la API de Busint. Intenta de nuevo en unos minutos.");
    }

    const porPedido = agruparFilasBusintPorPedido(filas);
    const hoyISO = new Date().toISOString().slice(0, 10);

    // a) Pedidos ya facturados/despachados: se consulta ApiGen_FacturadoBusint
    // desde la misma fechaInicio elegida hasta HOY (no hasta fechaFin, porque
    // un pedido dentro del rango puede facturarse después de fechaFin,
    // incluso después de hoy si fechaFin quedó en el pasado). Busint factura
    // por REFERENCIA, no por pedido completo — un pedido con 8 referencias
    // puede tener solo 1 facturada y las otras 7 sin cortar todavía (visto en
    // el reporte "Prioridades de Despacho" de Busint: pedido con 40% de sus
    // unidades facturadas). Por eso NO basta con que el pedido "aparezca" en
    // ApiGen_FacturadoBusint — hay que sumar las unidades facturadas
    // (`cant`) de todas sus filas y compararlas contra el total pedido; solo
    // se excluye del informe si ya está 100% facturado. Si esta consulta
    // falla, no se cae el informe: se sigue igual sin excluir nada por
    // facturación, y se avisa en la respuesta con `avisoFacturacion`.
    let facturadoPorPedido = new Map();
    let avisoFacturacion = null;
    try {
      const filasFacturado = await consultarFacturadoBusint(fechaInicio, hoyISO);
      filasFacturado.forEach((f) => {
        const numero = String(f.numped ?? "").trim();
        if (!numero) return;
        const cant = Number(f.cant) || 0;
        facturadoPorPedido.set(numero, (facturadoPorPedido.get(numero) || 0) + cant);
      });
    } catch (err) {
      logger.error("Error consultando ApiGen_FacturadoBusint (getPedidosVigentesBusint)", { error: String(err) });
      avisoFacturacion = "No se pudo consultar la facturación de Busint — este informe puede estar mostrando pedidos que ya se facturaron.";
    }

    // b) Para los que no están facturados, se cruza con la carga más
    // reciente de Planeación (misma colección `planeacion_cargas` que usa el
    // módulo Planta) por número de pedido, para saber si ya tiene lote (y en
    // qué etapa va) o si todavía no ha iniciado producción ("sin cortar").
    const cargasPlaneacionSnap = await db.collection("planeacion_cargas").get();
    const cargasPlaneacion = cargasPlaneacionSnap.docs.map((d) => d.data());
    cargasPlaneacion.sort((a, b) => String(b.creadoEn || b.fecha || "").localeCompare(String(a.creadoEn || a.fecha || "")));
    const cargaPlaneacionActiva = cargasPlaneacion[0] || null;
    const lotesPorPedido = new Map();
    (cargaPlaneacionActiva?.lotes || []).forEach((l) => {
      const numPedido = String(l.numPedido ?? "").trim();
      if (!numPedido) return;
      if (!lotesPorPedido.has(numPedido)) lotesPorPedido.set(numPedido, []);
      lotesPorPedido.get(numPedido).push({ numLote: l.numLote, ubicacionActual: l.ubicacionActual || "En proceso" });
    });

    // Pedidos que un administrador marcó como "ocultar" desde la pantalla del
    // informe — normalmente porque Busint los está generando mal (p. ej. por
    // algo interno de facturación aún sin identificar) y no son demanda real.
    // Ocultar NO borra ni modifica nada en Busint, solo evita que este
    // informe los muestre.
    const ocultosSnap = await db.collection("pedidos_ocultos_busint").get();
    const ocultosSet = new Set(ocultosSnap.docs.map((d) => String(d.data().numero || d.id).trim()));

    // "Vigente" = todavía no está 100% facturado. Además se marca `vencido`
    // cuando la fecha de despacho (programada por Busint) ya pasó, para
    // diferenciarlo visualmente de los que van a tiempo.
    const porClienteMap = new Map();
    for (const [, pedido] of porPedido) {
      if (ocultosSet.has(pedido.numero)) continue;
      const referencias = [...pedido.refsPorClave.values()];
      const totalUnidades = referencias.reduce((s, r) => s + r.total, 0);
      const totalFacturado = facturadoPorPedido.get(pedido.numero) || 0;
      const completo = totalUnidades > 0 && totalFacturado >= totalUnidades;
      if (completo) continue;
      const lotesDelPedido = lotesPorPedido.get(pedido.numero) || [];
      const tieneLote = lotesDelPedido.length > 0;
      const etapas = tieneLote ? [...new Set(lotesDelPedido.map((l) => l.ubicacionActual))] : [];
      const vencido = !!pedido.fechaDespacho && pedido.fechaDespacho < hoyISO;
      const clienteKey = pedido.cliente || "Sin cliente";
      if (!porClienteMap.has(clienteKey)) {
        porClienteMap.set(clienteKey, { cliente: clienteKey, pedidos: [], totalPedidos: 0, totalUnidades: 0 });
      }
      const grupo = porClienteMap.get(clienteKey);
      grupo.pedidos.push({
        numero: pedido.numero,
        fechaPedido: pedido.fechaPedido,
        fechaDespacho: pedido.fechaDespacho,
        vencido,
        referencias,
        totalUnidades,
        totalFacturado,
        pctFacturado: totalUnidades > 0 ? Math.round((totalFacturado / totalUnidades) * 100) : 0,
        tieneLote,
        etapas,
      });
      grupo.totalPedidos += 1;
      grupo.totalUnidades += totalUnidades;
    }

    const porCliente = [...porClienteMap.values()].sort((a, b) => a.cliente.localeCompare(b.cliente));
    // Los vencidos (fecha de despacho ya pasada, sin terminar de cortar)
    // aparecen primero dentro de cada cliente — son los más urgentes.
    porCliente.forEach((g) =>
      g.pedidos.sort((a, b) => {
        if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
        return (a.fechaDespacho || "").localeCompare(b.fechaDespacho || "");
      })
    );

    return {
      fechaInicio,
      fechaFin,
      generadoEn: new Date().toISOString(),
      totalClientes: porCliente.length,
      totalPedidos: porCliente.reduce((s, g) => s + g.totalPedidos, 0),
      porCliente,
      avisoFacturacion,
    };
  }
);

// Callable usado por "Revisar contra Busint" tanto en Pedidos (pestaña
// Activos) como en el módulo Corte: dado un rango de fechas, devuelve
// simplemente la LISTA de números de pedido que Busint todavía tiene hoy en
// ese rango (agrupando igual que consultarOrdenesBusint). Si un pedido que
// el aplicativo tiene como "activo" ya NO aparece en esta lista, quiere
// decir que en Busint se canceló, se cerró o se dio por cumplido — el
// aplicativo lo usa para marcarlo automáticamente en vez de quedarse
// pegado como activo para siempre.
exports.getPedidosExistentesBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL, BUSINT_PROXY_SECRET],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { fechaInicio, fechaFin } = request.data || {};
    const fechaValida = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!fechaValida(fechaInicio) || !fechaValida(fechaFin)) {
      throw new HttpsError("invalid-argument", "fechaInicio y fechaFin son obligatorias, en formato AAAA-MM-DD.");
    }
    let filas;
    try {
      filas = await consultarOrdenesBusint(fechaInicio, fechaFin);
    } catch (err) {
      logger.error("Error consultando Busint (getPedidosExistentesBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar la API de Busint. Intenta de nuevo en unos minutos.");
    }
    const porPedido = agruparFilasBusintPorPedido(filas);
    return { fechaInicio, fechaFin, numeros: [...porPedido.keys()] };
  }
);

// NOTA: este archivo tenía antes `getOrdenBusintPorNumero`, una herramienta
// de diagnóstico para consultar filas crudas de un pedido puntual (se usó
// para investigar el caso del pedido #1445). Se retiró — ya no se usa desde
// que el flujo de Vigentes + Ventas Perdidas + Congelar resuelve esa misma
// pregunta directamente en pantalla.

// Consulta el maestro de clientes de Busint ("ApiGen_Clientes") — a
// diferencia de las órdenes de pedido, este endpoint no recibe rango de
// fechas: siempre trae el listado completo tal como está hoy en Busint.
async function consultarClientesBusint() {
  const baseUrl = BUSINT_BASE_URL.value().replace(/\/+$/, "");
  const token = BUSINT_TOKEN.value();
  const proxySecret = BUSINT_PROXY_SECRET.value();

  const form = new FormData();
  form.append("Token", token);

  const resp = await fetch(`${baseUrl}/consultas/ApiGen_Clientes`, {
    method: "POST",
    headers: { "X-Proxy-Secret": proxySecret },
    body: form,
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    logger.error("Busint respondió con error (ApiGen_Clientes)", { status: resp.status, texto });
    throw new Error(`Busint respondió ${resp.status}`);
  }

  const filas = await resp.json();
  return Array.isArray(filas) ? filas : [];
}

// Callable usado por Administrador General → Clientes → "Importar de
// Busint". Trae el maestro completo y lo reduce a los campos que el
// aplicativo realmente guarda por cliente (nombre, contacto, email,
// teléfono) — la decisión de qué hacer con cada uno (agregar, reemplazar
// nombre existente, u omitir) la toma el usuario en pantalla, esta función
// solo entrega los datos crudos de Busint.
exports.getClientesBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL, BUSINT_PROXY_SECRET],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarClientesBusint();
    } catch (err) {
      logger.error("Error consultando Busint (getClientesBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar la API de Busint. Intenta de nuevo en unos minutos.");
    }

    const clientes = filas
      .map((f) => ({
        nombre: (f.nombreORazonSocial || "").trim(),
        nombreCorto: (f.nombreCorto || "").trim(),
        contacto: (f.contacto || "").trim(),
        email: (f.email || "").trim(),
        telefono: (f.telefono || f.celular || "").trim(),
        ciudad: (f.ciudad || "").trim(),
        activo: f.clienteActivo !== false,
      }))
      .filter((c) => c.nombre);

    // Ordenado alfabéticamente para que la revisión en pantalla sea
    // predecible (Busint no garantiza ningún orden particular).
    clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));

    return { generadoEn: new Date().toISOString(), total: clientes.length, clientes };
  }
);

// Consulta el maestro de referencias de Busint ("ApiGen_Referencias") —
// igual que ApiGen_Clientes, no recibe rango de fechas: siempre trae TODAS
// las referencias creadas hasta hoy en Busint, tal como están ahora mismo.
async function consultarReferenciasBusint() {
  const baseUrl = BUSINT_BASE_URL.value().replace(/\/+$/, "");
  const token = BUSINT_TOKEN.value();
  const proxySecret = BUSINT_PROXY_SECRET.value();

  const form = new FormData();
  form.append("Token", token);

  const resp = await fetch(`${baseUrl}/consultas/ApiGen_Referencias`, {
    method: "POST",
    headers: { "X-Proxy-Secret": proxySecret },
    body: form,
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    logger.error("Busint respondió con error (ApiGen_Referencias)", { status: resp.status, texto });
    throw new Error(`Busint respondió ${resp.status}`);
  }

  const filas = await resp.json();
  return Array.isArray(filas) ? filas : [];
}

// Callable usado desde "Nuevo Prototipo" y "Nueva Referencia" (Diseño), en
// la cajita donde ATLAS sugiere el próximo consecutivo (ver
// sugerirReferencia() en App.js). Antes de dejar crear la referencia, la
// pantalla verifica en vivo contra Busint si ese código ya existe allá —
// Busint es el sistema autoritativo aguas abajo, así que aunque el
// consecutivo esté libre en ATLAS, puede que ya lo hayan usado por fuera.
// Se entrega solo el código (más 2-3 campos livianos de contexto) para que
// la respuesta sea rápida aunque el maestro tenga miles de filas.
exports.getReferenciasBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL, BUSINT_PROXY_SECRET],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarReferenciasBusint();
    } catch (err) {
      logger.error("Error consultando Busint (getReferenciasBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar el maestro de referencias de Busint. Intenta de nuevo en unos minutos.");
    }

    const referencias = filas
      .map((f) => ({
        ref: String(f.ref || "").trim(),
        categoria: (f.categoria || "").trim(),
        referenciaExterna: (f.referenciaExterna || "").trim(),
      }))
      .filter((r) => r.ref);

    return { generadoEn: new Date().toISOString(), total: referencias.length, referencias };
  }
);
