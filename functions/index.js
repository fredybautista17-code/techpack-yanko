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
 *    depende de lo que ya esté guardado en Firestore) y devuelve solo los
 *    pedidos que todavía no tienen fecha de despacho, agrupados por cliente.
 *
 * CREDENCIALES: el token y la URL base de Busint NUNCA se escriben en este
 * archivo (que queda en un repositorio público) — se leen como "secrets" de
 * Firebase, configurados una sola vez desde la línea de comandos:
 *
 *   firebase functions:secrets:set BUSINT_TOKEN
 *   firebase functions:secrets:set BUSINT_BASE_URL
 *
 * (BUSINT_BASE_URL es la URL base del instructivo, ej:
 *  http://tudominio:9095 — SIN "/" al final).
 *
 * Ver README_BUSINT_SYNC.md para la guía completa de despliegue. Si ya
 * desplegaste `syncPedidosBusint` antes, estos secrets ya están configurados
 * y `getPedidosVigentesBusint` los reutiliza tal cual — no hace falta
 * volver a pegarlos en ningún lado.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const BUSINT_TOKEN = defineSecret("BUSINT_TOKEN");
const BUSINT_BASE_URL = defineSecret("BUSINT_BASE_URL");

// Cuántos días hacia atrás se consultan en cada corrida programada. Generoso
// a propósito: si la función falla una vez o Busint no responde, la
// siguiente corrida igual alcanza a traer los pedidos que se quedaron
// pendientes, porque el chequeo de duplicados por N° de Pedido evita que se
// carguen dos veces.
const DIAS_HACIA_ATRAS = 14;

function fmtFecha(d) {
  return d.toISOString().slice(0, 10);
}

// Convierte una fecha ISO ("2024-12-05T13:28:57.015Z") al formato de fecha
// simple ("2024-12-05") que usa el resto del aplicativo.
function soloFecha(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

async function consultarOrdenesBusint(fechaInicio, fechaFin) {
  const baseUrl = BUSINT_BASE_URL.value().replace(/\/+$/, "");
  const token = BUSINT_TOKEN.value();

  const resp = await fetch(`${baseUrl}/consultas/ApiGen_OrdenesDePedidosBusint`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ FechaInicio: fechaInicio, FechaFin: fechaFin }),
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

async function syncPedidosDesdeBusint() {
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setDate(inicio.getDate() - DIAS_HACIA_ATRAS);

  const filas = await consultarOrdenesBusint(fmtFecha(inicio), fmtFecha(hoy));
  if (!filas.length) {
    logger.info("Sin filas nuevas de Busint en el rango consultado.");
    return { pedidosCreados: 0, clientesCreados: 0 };
  }

  const porPedido = agruparFilasBusintPorPedido(filas);

  // Chequeo de duplicados: nunca se crea un pedido cuyo número ya existe en
  // Firestore, sin importar en qué estado esté (igual que el chequeo del
  // formulario manual "Cargar Pedido Busint" dentro del aplicativo).
  const existentesSnap = await db.collection("pedidos").get();
  const numerosExistentes = new Set(
    existentesSnap.docs.map((d) => String(d.data().numero || "").trim().toLowerCase())
  );

  const configSnap = await db.collection("config").doc("main").get();
  const clientesActuales = configSnap.exists ? configSnap.data().clientes || [] : [];
  const nombresClientesExistentes = new Set(clientesActuales.map((c) => (c.nombre || "").toLowerCase()));
  const clientesNuevos = [];

  const PEDIDO_STAGES = [
    "Hoja de Vida", "Verificación de Colorido", "Carta de Combinaciones, Textiles e Insumos",
    "Verificación de Ilustración", "Muestra", "Revisión de Insumos", "Cotización", "Ficha Técnica",
    "Pedido en Busint", "Explosión de Materiales", "Corte", "Control de Muestra de Corte",
    "Bodega de Materia Prima", "Confección", "Inventario de Procesos", "Semiterminado", "Despacho",
  ];

  let batch = db.batch();
  let opsEnBatch = 0;
  let pedidosCreados = 0;

  async function commitBatchSiHaceFalta() {
    if (opsEnBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsEnBatch = 0;
    }
  }

  for (const [numero, pedido] of porPedido) {
    if (numerosExistentes.has(numero.toLowerCase())) continue;

    const referencias = [...pedido.refsPorClave.values()];
    if (!referencias.length) continue;

    const seguimiento = {};
    PEDIDO_STAGES.forEach((s) => { seguimiento[s] = false; });

    const id = db.collection("pedidos").doc().id;
    batch.set(db.collection("pedidos").doc(id), {
      id,
      numero: pedido.numero,
      cliente: pedido.cliente,
      fechaPedido: pedido.fechaPedido,
      fechaDespacho: pedido.fechaDespacho,
      vendedor: "",
      ciudad: "",
      referencias,
      estado: "activo",
      seguimiento,
      cortesRealizados: [],
      creadoEn: fmtFecha(hoy),
      origenBusintAuto: true,
    });
    opsEnBatch++;
    pedidosCreados++;
    await commitBatchSiHaceFalta();

    if (pedido.cliente && !nombresClientesExistentes.has(pedido.cliente.toLowerCase())) {
      nombresClientesExistentes.add(pedido.cliente.toLowerCase());
      clientesNuevos.push({ id: cryptoRandomId(), nombre: pedido.cliente, contacto: "", email: "", telefono: "" });
    }
  }

  if (opsEnBatch > 0) await batch.commit();

  // Escritura granular: solo se toca el campo "clientes" (con arrayUnion),
  // nunca se reescribe el documento config/main completo — así esta
  // sincronización nunca puede pisar roles/etapas/categorías ni ningún otro
  // campo, sin importar qué tan vieja esté la copia leída arriba.
  if (clientesNuevos.length) {
    await db.collection("config").doc("main").update({
      clientes: admin.firestore.FieldValue.arrayUnion(...clientesNuevos),
    });
  }

  logger.info(`Sync Busint: ${pedidosCreados} pedido(s) nuevo(s), ${clientesNuevos.length} cliente(s) nuevo(s).`);
  return { pedidosCreados, clientesCreados: clientesNuevos.length };
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Corre sola cada 6 horas. Para cambiar la frecuencia, edita el string de
// abajo (sintaxis tipo cron: https://firebase.google.com/docs/functions/schedule-functions)
// y vuelve a desplegar con `firebase deploy --only functions`.
exports.syncPedidosBusint = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "America/Bogota",
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    await syncPedidosDesdeBusint();
  }
);

// Informe de Pedidos Vigentes por Cliente — consulta Busint EN VIVO (no lee
// Firestore) para el rango { fechaInicio, fechaFin } que envía la pantalla,
// y devuelve solo los pedidos que Busint todavía no marca con fecha de
// despacho, agrupados por cliente. Se llama desde el navegador con
// `httpsCallable(functions, "getPedidosVigentesBusint")({ fechaInicio, fechaFin })`.
exports.getPedidosVigentesBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
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

    // "Vigente" = Busint todavía no le registra fecha de despacho, es decir,
    // el pedido sigue pendiente de entrega.
    const porClienteMap = new Map();
    for (const [, pedido] of porPedido) {
      if (pedido.fechaDespacho) continue;
      const referencias = [...pedido.refsPorClave.values()];
      const totalUnidades = referencias.reduce((s, r) => s + r.total, 0);
      const clienteKey = pedido.cliente || "Sin cliente";
      if (!porClienteMap.has(clienteKey)) {
        porClienteMap.set(clienteKey, { cliente: clienteKey, pedidos: [], totalPedidos: 0, totalUnidades: 0 });
      }
      const grupo = porClienteMap.get(clienteKey);
      grupo.pedidos.push({
        numero: pedido.numero,
        fechaPedido: pedido.fechaPedido,
        fechaDespacho: pedido.fechaDespacho,
        referencias,
        totalUnidades,
      });
      grupo.totalPedidos += 1;
      grupo.totalUnidades += totalUnidades;
    }

    const porCliente = [...porClienteMap.values()].sort((a, b) => a.cliente.localeCompare(b.cliente));
    porCliente.forEach((g) => g.pedidos.sort((a, b) => (a.fechaPedido || "").localeCompare(b.fechaPedido || "")));

    return {
      fechaInicio,
      fechaFin,
      generadoEn: new Date().toISOString(),
      totalClientes: porCliente.length,
      totalPedidos: porCliente.reduce((s, g) => s + g.totalPedidos, 0),
      porCliente,
    };
  }
);
