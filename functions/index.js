/**
 * Integración con la API de Busint (Órdenes de Pedidos).
 *
 * (2026-08-17) NOTA IMPORTANTE: este archivo (functions/index.js, el que
 * package.json marca como "main" — el que de verdad se despliega con
 * `firebase deploy --only functions`) se había quedado desincronizado de
 * `functions/index.js.js` (un archivo suelto, sin usar, que había ido
 * acumulando funciones nuevas por separado — mismo tipo de problema que se
 * encontró con src/App.js vs src/App-CORREO-USUARIOS.js). Este archivo se
 * reconstruyó a partir de index.js.js (la versión más reciente: sin VPN,
 * habla directo a Busint) y se le agregó de vuelta `getReferenciasBusint`
 * (que index.js.js no tenía) más dos funciones nuevas. index.js.js queda
 * como referencia histórica pero ya no se usa para nada — se puede borrar
 * cuando se quiera.
 *
 * 1. `getPedidosVigentesBusint` (bajo demanda, "callable" desde la app): se
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
 * 2. `getPedidosExistentesBusint`: usado por "Revisar contra Busint" (Pedidos
 *    y módulo Corte) — devuelve la lista de números de pedido que Busint
 *    todavía tiene hoy en un rango de fechas.
 *
 * 3. `getOrdenBusintPorNumero`: diagnóstico — trae las filas crudas que
 *    Busint devuelve para un número de pedido puntual.
 *
 * 4. `getClientesBusint`: usado por Administrador General → Clientes →
 *    "Importar de Busint" — trae el maestro completo de clientes.
 *
 * 5. `migrarUsuariosAFirebaseAuth`: migración (Fase A) del login antiguo
 *    (comparación de clave en texto plano contra la colección `users`) hacia
 *    Firebase Authentication real.
 *
 * 6. `adminCrearUsuario` / `adminCambiarClaveUsuario`: Fase B de esa misma
 *    migración — ahora que el login real ya usa Firebase Auth, Admin →
 *    Usuarios necesita crear cuentas reales al dar de alta un usuario nuevo,
 *    y resetear la clave de OTRO usuario ya no lo puede hacer el navegador
 *    directamente (solo el propio). Ambas verifican que quien llama esté
 *    autenticado Y sea administrador antes de hacer nada — ver
 *    `verificarLlamadorEsAdmin` más abajo.
 *
 * 7. `buscarReferenciaBusint`: usado por módulo Bodega → Despachos → Montar
 *    Despacho — al escribir una referencia trae de Busint su descripción,
 *    precio y códigos de barra por talla/color, para no digitarlos a mano.
 *
 * 8. `getReferenciasBusint`: usado desde "Nuevo Prototipo"/"Nueva Referencia"
 *    (Diseño) para verificar en vivo si un consecutivo sugerido ya existe en
 *    Busint antes de dejar crearlo.
 *
 * 9. `buscarTrasladoBusintPorNumero`: usado por módulo Bodega → Despachos →
 *    Montar Despacho (destino Dubo) — trae TODAS las líneas de un Traslado
 *    de Busint a partir de su número (el "TRASLADO Nº ####" impreso en la
 *    remisión), para no tener que digitar referencia por referencia cuando
 *    un traslado trae 100+ líneas.
 *
 * CREDENCIALES: el token y la URL base de Busint NUNCA se escriben en este
 * archivo (que queda en un repositorio público) — se leen como "secrets" de
 * Firebase, configurados una sola vez desde la línea de comandos:
 *
 *   firebase functions:secrets:set BUSINT_TOKEN
 *   firebase functions:secrets:set BUSINT_BASE_URL
 *   firebase functions:secrets:set MIGRACION_CLAVE
 *
 * (2026-07-30) Busint eliminó el requisito de VPN para consumir esta API —
 * ahora se le habla DIRECTO a https://api-yanko-gen.busint.info, confirmado
 * con una prueba real (curl con el token, sin VPN, devolvió pedidos). Antes
 * era necesario pasar por una VM-puente siempre conectada a la VPN de
 * Busint (con su propio secreto BUSINT_PROXY_SECRET) porque una Cloud
 * Function no puede mantener una VPN abierta por sí sola; ya no hace falta
 * ese puente, así que se quitó del código:
 *   - BUSINT_BASE_URL ahora es la URL de Busint directamente
 *     (https://api-yanko-gen.busint.info, SIN "/" al final).
 *   - Si la VM-puente sigue corriendo, ya se puede apagar una vez se
 *     confirme que esta versión funciona bien en producción.
 *
 * NOTA: este archivo tenía antes una función programada (`syncPedidosBusint`,
 * corría sola cada 6 horas) que copiaba pedidos de Busint a la colección
 * "pedidos". Se retiró — ese auto-sync generaba una base separada y
 * desincronizada de la que realmente importa (la que corta el módulo Corte),
 * y nunca reflejaba con certeza qué seguía vigente. El flujo actual es:
 * getPedidosVigentesBusint (consulta en vivo, siempre fresca) + el botón
 * "Congelar como base de Corte" en la pantalla de Vigentes, que escribe
 * directo a la colección "pedidos_activos" — una sola fuente de verdad que
 * tanto Pedidos como Corte leen.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const BUSINT_TOKEN = defineSecret("BUSINT_TOKEN");
const BUSINT_BASE_URL = defineSecret("BUSINT_BASE_URL");
// (2026-08-19) API NUEVA de Busint ("BD"), distinta a la de arriba — es la
// que trae acceso a TODAS las tablas internas de Busint (incluida
// "planeacion cargas", que es lo que reemplazaría la subida manual de Hoja1
// en Planeación). Es una API completamente aparte: otro host
// (api-yanko-bd.busint.info, no api-yanko-gen.busint.info), otro esquema de
// autenticación (header "X-Api-Key", no un campo "Token" en el form-data) y
// otro patrón de endpoint (GET/POST a /api/Query?tableName=X&page=Y&pageSize=Z,
// no /consultas/X). Configurar UNA VEZ desde la terminal (nunca escribir la
// llave acá, este archivo queda en un repo):
//   firebase functions:secrets:set BUSINT_BD_BASE_URL
//     (valor: https://api-yanko-bd.busint.info)
//   firebase functions:secrets:set BUSINT_BD_API_KEY
//     (valor: la X-Api-Key que dio Busint)
const BUSINT_BD_BASE_URL = defineSecret("BUSINT_BD_BASE_URL");
const BUSINT_BD_API_KEY = defineSecret("BUSINT_BD_API_KEY");

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

  const form = new FormData();
  form.append("Token", token);
  form.append("FechaInicio", fechaInicio);
  form.append("FechaFin", fechaFin);

  const resp = await fetch(`${baseUrl}/consultas/ApiGen_OrdenesDePedidoBusint`, {
    method: "POST",
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

  const form = new FormData();
  form.append("Token", token);
  form.append("FechaInicio", fechaInicio);
  form.append("FechaFin", fechaFin);

  const resp = await fetch(`${baseUrl}/consultas/ApiGen_FacturadoBusint`, {
    method: "POST",
    body: form,
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    logger.error("Busint respondió con error (ApiGen_FacturadoBusint)", { status: resp.status, texto });
    throw new Error(`Busint respondió ${resp.status}`);
  }

  const filas = await resp.json();
  const filasArr = Array.isArray(filas) ? filas : [];
  logger.info("consultarFacturadoBusint recibió respuesta", {
    fechaInicio,
    fechaFin,
    totalFilas: filasArr.length,
    bytesAprox: JSON.stringify(filasArr[0] || {}).length * filasArr.length,
    primeraFila: filasArr[0] || null,
  });
  return filasArr;
}

// (2026-08-27) Contabilidad pidió ver, para un rango de fechas, cuánto se
// facturó por CLIENTE tanto en $ (monto) como en unidades — usa la misma
// fuente ya conectada en otros informes (ApiGen_FacturadoBusint, que trae
// facturas normales, traslados externos, traslados en consignación y sus
// devoluciones — Busint no los separa en endpoints distintos). Se agrupa
// por cliente y también se desglosa por "tipo" de documento dentro de cada
// cliente, para que quien lo lea pueda ver si el monto incluye traslados o
// devoluciones y no solo facturas normales — no se decide acá cuáles
// "cuentan" como facturación real, se muestra todo con su tipo.
exports.getFacturacionPorClienteBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    const { fechaInicio, fechaFin } = request.data || {};
    const fechaValida = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!fechaValida(fechaInicio) || !fechaValida(fechaFin)) {
      throw new HttpsError("invalid-argument", "fechaInicio y fechaFin son obligatorias, en formato AAAA-MM-DD.");
    }
    // (2026-08-27) Confirmado con el usuario qué significa cada "tipo" que
    // trae ApiGen_FacturadoBusint (mezclados en el mismo endpoint, Busint
    // no los separa):
    //   FAC = Factura real de Busint — la venta ya facturada de verdad,
    //         la que después se cruza contra TNS.
    //   TCO = Traslado en Consignación — se despachó pero el cliente
    //         (ej. Kamila) todavía tiene que revisar y decidir qué vende
    //         antes de que eso se convierta en FAC — es un estimado, no
    //         una venta confirmada.
    //   TEX = Traslado Externo — despacho sin IVA, varios clientes lo
    //         manejan así en vez de una factura normal.
    //   DTE = Devolución de Traslado Externo (reversa un TEX).
    //   DTC = Devolución de Traslado en Consignación (reversa un TCO).
    // Por eso NO se suma todo en un solo total: se separa Facturado (FAC),
    // Consignación neta (TCO - DTC) y Traslado Externo neto (TEX - DTE),
    // más el desglose documento por documento (y línea por línea dentro de
    // cada documento) para poder auditar cualquier cifra sin salir de Atlas.
    let filas, filasClientes;
    try {
      [filas, filasClientes] = await Promise.all([
        consultarFacturadoBusint(fechaInicio, fechaFin),
        consultarClientesBusint().catch((err) => {
          logger.error("Error consultando ApiGen_Clientes (getFacturacionPorClienteBusint)", { error: String(err) });
          return [];
        }),
      ]);
    } catch (err) {
      logger.error("Error consultando Busint (getFacturacionPorClienteBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar la facturación en Busint. Intenta de nuevo en unos minutos.");
    }
    const nombrePorCodigo = new Map();
    filasClientes.forEach((c) => {
      const codigo = String(c.codigo ?? c.Codigo ?? c.codigoCliente ?? c.CodigoCliente ?? c.id ?? c.Id ?? "").trim();
      const nombre = String(c.nombreORazonSocial || c.nombre || c.razonSocial || "").trim();
      if (codigo && nombre && !nombrePorCodigo.has(codigo)) nombrePorCodigo.set(codigo, nombre);
    });
    const sacarNombreCliente = (f, codigoCliente) =>
      nombrePorCodigo.get(codigoCliente) ||
      String(f.nombreCliente || f.NombreCliente || f.cliente || f.Cliente || f.razonSocial || f.nomCliente || f.nombreORazonSocial || "").trim();

    // (2026-08-28) Confirmado con datos reales: las filas de devolución
    // (Dtc/Dte) vienen con "precio": 0 en Busint — no traen el valor de lo
    // devuelto. Sin esto, "monto" de una devolución siempre daría $0 y el
    // neto (TCO-DTC / TEX-DTE) en pesos NO restaría nada de verdad (aunque
    // las unidades sí se restan bien, porque "cant" ya viene negativo). Se
    // arma un mapa de precio real por Referencia+Pinta+Color+Talla (del
    // mismo cliente, usando cualquier fila del rango que sí traiga precio
    // > 0) para valorar esas devoluciones antes de sumar.
    const precioPorClave = new Map(); // `${codigoCliente}|${ref}|${pinta}|${color}|${talla}` -> precio
    for (const f of filas) {
      const precio = Number(f.precio) || 0;
      if (precio <= 0) continue;
      const clave = [
        String(f.codigoCliente ?? "").trim(),
        String(f.ref || "").trim(),
        String(f.pinta || "").trim(),
        String(f.color || "").trim(),
        String(f.talla || "").trim(),
      ].join("|");
      if (!precioPorClave.has(clave)) precioPorClave.set(clave, precio);
    }
    let devolucionesSinPrecio = 0;

    // Paso 1: agrupar por cliente -> por documento -> líneas. Se agrupa por
    // "doc + numped" (no solo "doc"): las devoluciones traen "doc": 0 para
    // TODAS, así que agrupar solo por "doc" mezclaría en un solo documento
    // falso todas las devoluciones de un cliente en el rango — "numped"
    // (número de pedido) sí distingue una devolución de otra.
    const porCliente = new Map();
    for (const f of filas) {
      const codigoCliente = String(f.codigoCliente ?? "").trim();
      const nombreCliente = sacarNombreCliente(f, codigoCliente);
      const claveCliente = codigoCliente || nombreCliente || "(sin-identificar)";
      if (!porCliente.has(claveCliente)) {
        porCliente.set(claveCliente, { codigoCliente, nombreCliente, documentos: new Map() });
      }
      const c = porCliente.get(claveCliente);
      const docNum = String(f.doc ?? "").trim() || "0";
      const numped = String(f.numped ?? "").trim();
      const claveDoc = `${docNum}|${numped}`;
      const tipo = String(f.tipo || "").trim().toUpperCase() || "(SIN TIPO)";
      const ref = String(f.ref || "").trim();
      const pinta = String(f.pinta || "").trim();
      const color = String(f.color || "").trim();
      const talla = String(f.talla || "").trim();
      const cant = Number(f.cant) || 0;
      let precio = Number(f.precio) || 0;
      if (precio <= 0 && cant !== 0) {
        const clavePrecio = [codigoCliente, ref, pinta, color, talla].join("|");
        const precioEncontrado = precioPorClave.get(clavePrecio);
        if (precioEncontrado) {
          precio = precioEncontrado;
        } else {
          devolucionesSinPrecio++;
        }
      }
      const monto = cant * precio;
      if (!c.documentos.has(claveDoc)) {
        c.documentos.set(claveDoc, { numero: docNum !== "0" ? docNum : (numped ? `Pedido ${numped}` : "(sin número)"), numped, tipo, fecha: soloFecha(f.fechaFact) || null, unidades: 0, monto: 0, lineas: [] });
      }
      const d = c.documentos.get(claveDoc);
      d.unidades += cant;
      d.monto += monto;
      d.lineas.push({
        ref,
        pinta,
        color,
        talla,
        cantidad: cant,
        precio,
        precioEstimado: (Number(f.precio) || 0) <= 0 && precio > 0,
        monto: Math.round(monto * 100) / 100,
      });
    }

    // Paso 2: por cliente, sumar cada documento en su categoría (FAC / TCO
    // / DTC / TEX / DTE / otros no reconocidos) y calcular los netos.
    const round2 = (n) => Math.round(n * 100) / 100;
    const clientes = [...porCliente.values()]
      .map((c) => {
        const documentos = [...c.documentos.values()].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
        let montoFAC = 0, unidFAC = 0;
        let montoTCO = 0, unidTCO = 0, montoDTC = 0, unidDTC = 0;
        let montoTEX = 0, unidTEX = 0, montoDTE = 0, unidDTE = 0;
        let montoOtros = 0, unidOtros = 0;
        const tiposOtros = new Set();
        documentos.forEach((d) => {
          d.monto = round2(d.monto);
          switch (d.tipo) {
            case "FAC": montoFAC += d.monto; unidFAC += d.unidades; break;
            case "TCO": montoTCO += d.monto; unidTCO += d.unidades; break;
            case "DTC": montoDTC += d.monto; unidDTC += d.unidades; break;
            case "TEX": montoTEX += d.monto; unidTEX += d.unidades; break;
            case "DTE": montoDTE += d.monto; unidDTE += d.unidades; break;
            default: montoOtros += d.monto; unidOtros += d.unidades; tiposOtros.add(d.tipo); break;
          }
        });
        return {
          codigoCliente: c.codigoCliente,
          nombreCliente: c.nombreCliente || (c.codigoCliente ? `Cliente ${c.codigoCliente}` : "(Sin identificar)"),
          totalDocumentos: documentos.length,
          facturado: { monto: round2(montoFAC), unidades: unidFAC },
          consignacionNeta: {
            monto: round2(montoTCO - montoDTC),
            unidades: unidTCO - unidDTC,
            montoBruto: round2(montoTCO),
            montoDevuelto: round2(montoDTC),
          },
          trasladoExternoNeto: {
            monto: round2(montoTEX - montoDTE),
            unidades: unidTEX - unidDTE,
            montoBruto: round2(montoTEX),
            montoDevuelto: round2(montoDTE),
          },
          otros: montoOtros !== 0 || unidOtros !== 0 ? { monto: round2(montoOtros), unidades: unidOtros, tipos: [...tiposOtros] } : null,
          documentos,
        };
      })
      .sort((a, b) => b.facturado.monto - a.facturado.monto);

    const sumar = (campo) => round2(clientes.reduce((s, c) => s + c[campo].monto, 0));
    const sumarUnid = (campo) => clientes.reduce((s, c) => s + c[campo].unidades, 0);

    return {
      fechaInicio,
      fechaFin,
      totalFilas: filas.length,
      totalClientes: clientes.length,
      totalFacturado: sumar("facturado"),
      totalUnidadesFacturadas: sumarUnid("facturado"),
      totalConsignacionNeta: sumar("consignacionNeta"),
      totalUnidadesConsignacion: sumarUnid("consignacionNeta"),
      totalTrasladoExternoNeto: sumar("trasladoExternoNeto"),
      totalUnidadesTrasladoExterno: sumarUnid("trasladoExternoNeto"),
      devolucionesSinPrecio,
      clientes,
      columnasDisponibles: filas.length ? Object.keys(filas[0]) : [],
      primeraFilaCruda: filas.length ? filas[0] : null,
      columnasClientesDisponibles: filasClientes.length ? Object.keys(filasClientes[0]) : [],
      primeraFilaClienteCruda: filasClientes.length ? filasClientes[0] : null,
      totalClientesCruzados: nombrePorCodigo.size,
    };
  }
);

// (2026-08-21) EXPLORATORIO — la API "gen" (api-yanko-gen.busint.info) tiene
// un catálogo nuevo "ApiGen_PanelControlFlujoOperacional" que no está
// conectado a nada todavía. Por el nombre suena a que podría traer el
// estado del lote por etapa (BMP/Semiterminado/Corte/Planta) — justo lo que
// hoy trae la Hoja1 subida a mano en Planeación. Esta función solo trae una
// muestra cruda (primeras + últimas filas) para ver la forma real de los
// datos antes de decidir si sirve para reemplazar/complementar Hoja1. No
// escribe nada ni reemplaza ningún flujo existente.
exports.getMuestraPanelFlujoBusintGen = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_PanelControlFlujoOperacional");
    } catch (err) {
      logger.error("Error consultando Busint (getMuestraPanelFlujoBusintGen)", { error: String(err) });
      throw new HttpsError("unavailable", `No se pudo consultar ApiGen_PanelControlFlujoOperacional: ${err?.message || String(err)}`);
    }
    return {
      total: filas.length,
      columnas: filas.length ? Object.keys(filas[0]) : [],
      primeras: filas.slice(0, 10),
      ultimas: filas.slice(-10),
    };
  }
);

// (2026-08-21) EXPLORATORIO — mismo caso que getMuestraPanelFlujoBusintGen
// pero para "ApiGen_InventarioBusint", el otro catálogo nuevo de la API gen
// que podría servir para Hoja1 (inventario en vivo).
exports.getMuestraInventarioBusintGen = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    // "internal" genérico (sin mensaje) en el cliente suele ser timeout u
    // OOM en la función, no un error de Busint — este catálogo no tiene
    // paginación (solo recibe Token), así que si trae TODO el inventario de
    // la empresa de una sola vez puede ser bastante más pesado que
    // ApiGen_Referencias. Se sube el techo por si acaso.
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_InventarioBusint");
    } catch (err) {
      logger.error("Error consultando Busint (getMuestraInventarioBusintGen)", { error: String(err) });
      throw new HttpsError("unavailable", `No se pudo consultar ApiGen_InventarioBusint: ${err?.message || String(err)}`);
    }
    return {
      total: filas.length,
      columnas: filas.length ? Object.keys(filas[0]) : [],
      primeras: filas.slice(0, 10),
      ultimas: filas.slice(-10),
    };
  }
);

// (2026-08-26) Diseño propuso esto: en vez de (o además de) cruzar contra
// tela por color — que depende de que Busint tenga bien llenas las tablas
// de composición ("telas"/"telas - detalle", que no siempre están) — cruzar
// directo contra "ApiGen_InventarioBusint" (prendas YA producidas/en
// bodega), que usa exactamente los mismos identificadores que ya tiene
// Atlas: ref, pinta, color (nombre libre, ej. "VERDE SECO") — sin
// intermediarios. Es la misma tabla que "getMuestraInventarioBusintGen"
// exploró (492 filas en la prueba, cabe completa sin paginar). Se usa en
// Programación de Corte para comparar, por Referencia+Pinta+Color, cuánto
// ya existe en inventario contra las Capas que se están por programar.
exports.getInventarioProductoBusintGen = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_InventarioBusint");
    } catch (err) {
      logger.error("Error consultando Busint (getInventarioProductoBusintGen)", { error: String(err) });
      throw new HttpsError("unavailable", `No se pudo consultar el inventario de producto en Busint: ${err?.message || String(err)}`);
    }
    const inventario = filas
      .map((f) => ({
        ref: String(f.ref || "").trim(),
        pinta: String(f.pinta || "").trim(),
        color: String(f.color || "").trim(),
        talla: String(f.talla || "").trim(),
        cantidad: Number(f.cant) || 0,
        bodega: f.nombreBodega || "",
      }))
      .filter((r) => r.ref);
    return { total: inventario.length, inventario };
  }
);

// (2026-08-21) EXPLORATORIO — "ApiGen_PanelControlFlujoOperacional" trae
// columnas casi idénticas a lo que hoy arma agruparLotes() a mano desde la
// Hoja1 subida (numLote, numPedido, nombreCliente, referencia, categoria,
// invPlanta/invBmp/invSemiterminado/invCorte, fechaEntregaConf,
// fechaEntregaPedido, nombrePlanta...) — esta función cruza ese catálogo,
// lote por lote, contra la última carga de Hoja1 subida a mano en
// Planeación (planeacion_cargas), para confirmar que los datos SÍ cuadran
// antes de siquiera considerar reemplazar el botón "Subir Hoja1". No
// escribe nada.
exports.getValidacionPanelFlujoBusintGen = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async () => {
    let filasPanel;
    try {
      filasPanel = await consultarCatalogoBusint("ApiGen_PanelControlFlujoOperacional");
    } catch (err) {
      logger.error("Error consultando Busint (getValidacionPanelFlujoBusintGen)", { error: String(err) });
      throw new HttpsError("unavailable", `No se pudo consultar ApiGen_PanelControlFlujoOperacional: ${err?.message || String(err)}`);
    }
    const panelPorLote = new Map();
    filasPanel.forEach((f) => {
      const numLote = Number(f.numLote);
      if (!Number.isFinite(numLote) || numLote <= 0) return;
      panelPorLote.set(numLote, f);
    });

    const cargasSnap = await db.collection("planeacion_cargas").get();
    const cargas = cargasSnap.docs.map((d) => d.data());
    cargas.sort((a, b) => String(b.creadoEn || b.fecha || "").localeCompare(String(a.creadoEn || a.fecha || "")));
    const cargaActiva = cargas[0] || null;
    const lotesHoja1 = cargaActiva?.lotes || [];

    let lotesEnComun = 0;
    let coincideCliente = 0, coincideFechaConf = 0, coincideFechaPedido = 0, coincideInventario = 0;
    const muestraCoincidencias = [];
    const muestraDiscrepancias = [];

    lotesHoja1.forEach((l) => {
      const p = panelPorLote.get(Number(l.numLote));
      if (!p) return;
      lotesEnComun++;
      // OJO: "sin fecha todavía" viene como null desde Hoja1 pero como ""
      // (cadena vacía) desde Panel Flujo — sin normalizar los dos a null,
      // se contaban como discrepancia miles de lotes que en realidad están
      // igual de "sin fecha" en ambos lados.
      const normFecha = (v) => (v ? soloFecha(v) || null : null);
      const clienteIgual = String(p.nombreCliente || "").trim().toUpperCase() === String(l.nombreCliente || "").trim().toUpperCase();
      const fechaConfIgual = normFecha(p.fechaEntregaConf) === normFecha(l.fechaEntregaConfISO);
      const fechaPedidoIgual = normFecha(p.fechaEntregaPedido) === normFecha(l.fechaEntregaPedidoISO);
      const invIgual =
        Number(p.invPlanta || 0) === Number(l.invPlanta || 0) &&
        Number(p.invBmp || 0) === Number(l.invBMP || 0) &&
        Number(p.invSemiterminado || 0) === Number(l.invSemiterminado || 0) &&
        Number(p.invCorte || 0) === Number(l.invCorte || 0);
      const fila = {
        numLote: l.numLote,
        hoja1: {
          cliente: l.nombreCliente, fechaEntregaConf: l.fechaEntregaConfISO, fechaEntregaPedido: l.fechaEntregaPedidoISO,
          invPlanta: l.invPlanta, invBMP: l.invBMP, invSemiterminado: l.invSemiterminado, invCorte: l.invCorte,
        },
        panelFlujo: {
          cliente: p.nombreCliente, fechaEntregaConf: normFecha(p.fechaEntregaConf), fechaEntregaPedido: normFecha(p.fechaEntregaPedido),
          invPlanta: p.invPlanta, invBMP: p.invBmp, invSemiterminado: p.invSemiterminado, invCorte: p.invCorte,
        },
        clienteIgual, fechaConfIgual, fechaPedidoIgual, invIgual,
      };
      if (clienteIgual) coincideCliente++;
      if (fechaConfIgual) coincideFechaConf++;
      if (fechaPedidoIgual) coincideFechaPedido++;
      if (invIgual) coincideInventario++;
      if (clienteIgual && fechaConfIgual && fechaPedidoIgual && invIgual) {
        if (muestraCoincidencias.length < 15) muestraCoincidencias.push(fila);
      } else if (muestraDiscrepancias.length < 15) {
        muestraDiscrepancias.push(fila);
      }
    });

    return {
      totalPanelFlujo: filasPanel.length,
      totalHoja1: lotesHoja1.length,
      cargaHoja1UsadaEn: cargaActiva?.creadoEn || cargaActiva?.fecha || null,
      lotesEnComun,
      coincideCliente, coincideFechaConf, coincideFechaPedido, coincideInventario,
      muestraCoincidencias,
      muestraDiscrepancias,
    };
  }
);

// (2026-08-21) Trae "ApiGen_PanelControlFlujoOperacional" ya normalizado a
// las mismas columnas que arma agruparLotes() en modulo-planeacion.jsx al
// leer una Hoja1 subida a mano — validado 135/135 en cliente, fecha conf y
// fecha pedido, y 131/135 en inventario (las 4 diferencias son lotes que
// avanzaron de etapa DESPUÉS de la última Hoja1 subida, o sea, a favor de
// Busint por estar más al día). Devuelve datos crudos normalizados; el
// cálculo de ubicacionActual/semanaEntregaISO/procesoDondeQuedo/
// clienteAgrupado (igual que agruparLotes) se hace en el frontend, para
// reusar exactamente la misma lógica que ya usa la subida manual de Hoja1
// en vez de duplicarla acá.
exports.getCargaPlaneacionDesdeBusintGen = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_PanelControlFlujoOperacional");
    } catch (err) {
      logger.error("Error consultando Busint (getCargaPlaneacionDesdeBusintGen)", { error: String(err) });
      throw new HttpsError("unavailable", `No se pudo consultar ApiGen_PanelControlFlujoOperacional: ${err?.message || String(err)}`);
    }
    const normFecha = (v) => (v ? soloFecha(v) || null : null);
    const lotes = filas
      .filter((f) => Number(f.numLote) > 0)
      .map((f) => {
        const procesos = [];
        for (let i = 1; i <= 15; i++) {
          procesos.push({
            nombre: f[`proceso${i}`] || "",
            planta: f[`plantaProceso${i}`] || "",
            fechaSalida: normFecha(f[`fechaSalProceso${i}`]),
            fechaEntrada: normFecha(f[`fechaEntProceso${i}`]),
            inventario: Number(f[`inventarioProc${i}`]) || 0,
          });
        }
        return {
          numLote: Number(f.numLote),
          numPedido: Number(f.numPedido) || 0,
          referencia: String(f.referencia || ""),
          categoria: String(f.categoria || ""),
          nombreCliente: String(f.nombreCliente || "(Sin cliente)"),
          nombrePlanta: String(f.nombrePlanta || ""),
          fechaCorteISO: normFecha(f.fechaCorte),
          cantCortada: Number(f.cantCortada) || 0,
          invCorte: Number(f.invCorte) || 0,
          invBMP: Number(f.invBmp) || 0,
          invPlanta: Number(f.invPlanta) || 0,
          invBPT: Number(f.invBpt) || 0,
          invSemiterminado: Number(f.invSemiterminado) || 0,
          fechaEntregaConfISO: normFecha(f.fechaEntregaConf),
          fechaEntBPTISO: normFecha(f.fechaEntBpt),
          fechaEntregaPedidoISO: normFecha(f.fechaEntregaPedido),
          procesos,
        };
      });
    return { total: lotes.length, lotes };
  }
);

// (2026-08-21) EXPLORATORIO — versión genérica de getMuestraPanelFlujoBusintGen
// / getMuestraInventarioBusintGen: en vez de una función por endpoint,
// recibe el nombre exacto del catálogo de la API "gen" (tal cual aparece en
// /consultas/X del swagger, ej. "ApiGen_MovimientosPosint") y trae una
// muestra cruda. Para seguir explorando los endpoints nuevos que aparecieron
// (ApiGen_MovimientosPosint, ApiGen_CarteraFacturacionBusint,
// ApiGen_FacturadoPosint, ApiGen_InventarioPosint...) sin tener que escribir
// una función nueva por cada uno.
exports.getMuestraCatalogoBusintGen = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    const endpoint = String(request.data?.endpoint || "").trim();
    if (!endpoint) {
      throw new HttpsError("invalid-argument", "Debes indicar el nombre exacto del endpoint (ej. ApiGen_MovimientosPosint).");
    }
    const parametros = request.data?.parametros && typeof request.data.parametros === "object" ? request.data.parametros : null;
    let filas;
    try {
      filas = await consultarCatalogoBusint(endpoint, parametros);
    } catch (err) {
      logger.error("Error consultando Busint (getMuestraCatalogoBusintGen)", { endpoint, parametros, error: String(err) });
      throw new HttpsError("unavailable", `No se pudo consultar "${endpoint}": ${err?.message || String(err)}`);
    }
    return {
      endpoint,
      parametrosUsados: parametros,
      total: filas.length,
      columnas: filas.length ? Object.keys(filas[0]) : [],
      primeras: filas.slice(0, 10),
      ultimas: filas.slice(-10),
    };
  }
);

// (2026-08-27) Trae del swagger de la API gen los parámetros que declara un
// endpoint puntual de "/consultas/X" (nombre, si es obligatorio, tipo) —
// para saber, sin adivinar, qué mandar cuando un catálogo devuelve []
// vacío sin filtros (ej. "ApiGen_MovimientosPosint").
exports.getEsquemaConsultaBusintGen = onCall(
  {
    secrets: [BUSINT_BASE_URL],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const endpoint = String(request.data?.endpoint || "").trim();
    if (!endpoint) {
      throw new HttpsError("invalid-argument", "Debes indicar el nombre exacto del endpoint.");
    }
    const baseUrl = BUSINT_BASE_URL.value().replace(/\/+$/, "");
    let swagger;
    try {
      const resp = await fetch(`${baseUrl}/swagger/v1/swagger.json`);
      if (!resp.ok) throw new Error(`swagger respondió ${resp.status}`);
      swagger = await resp.json();
    } catch (err) {
      logger.error("Error trayendo el swagger de la API gen", { error: String(err) });
      throw new HttpsError("unavailable", `No se pudo traer el swagger de la API gen: ${err?.message || String(err)}`);
    }
    const paths = swagger.paths || {};
    const pathKey = Object.keys(paths).find((p) => p.toLowerCase().endsWith(`/consultas/${endpoint}`.toLowerCase()));
    if (!pathKey) {
      return { endpoint, encontrado: false, parametros: [] };
    }
    const metodos = paths[pathKey] || {};
    const operacion = metodos.post || metodos.get || Object.values(metodos)[0] || {};
    const parametros = (operacion.parameters || []).map((p) => ({
      nombre: p.name,
      obligatorio: !!p.required,
      en: p.in,
      tipo: p.schema?.type || p.type || "",
    }));
    // Si el body va como requestBody (OpenAPI 3) en vez de "parameters",
    // también se intenta sacar de ahí (form-data con propiedades).
    let propiedadesBody = [];
    const bodySchema = operacion.requestBody?.content?.["multipart/form-data"]?.schema
      || operacion.requestBody?.content?.["application/x-www-form-urlencoded"]?.schema;
    if (bodySchema?.properties) {
      const requeridos = new Set(bodySchema.required || []);
      propiedadesBody = Object.keys(bodySchema.properties).map((nombre) => ({
        nombre,
        obligatorio: requeridos.has(nombre),
        en: "formData",
        tipo: bodySchema.properties[nombre]?.type || "",
      }));
    }
    return { endpoint, encontrado: true, parametros: [...parametros, ...propiedadesBody] };
  }
);

// Consulta el maestro de referencias de Busint ("ApiGen_Referencias") — no
// recibe filtro, siempre trae todo el catálogo tal como está hoy. Usado
// desde "Nuevo Prototipo"/"Nueva Referencia" (Diseño) para verificar en vivo
// si un consecutivo sugerido ya existe en Busint antes de dejar crearlo (ver
// sugerirReferencia() en App.js).
exports.getReferenciasBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_Referencias");
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

// (2026-08-20) RESTAURADA — existía en producción pero se había perdido del
// código fuente local (una de las 3 funciones huérfanas detectadas al
// desplegar el 19-08-2026; se decidió borrarla en ese momento y luego
// resultó que sí se seguía usando desde Administración → Códigos de
// Referencia → "Probar una referencia puntual en vivo"). Ignora guiones al
// comparar (98-423 = 98423), igual que normalizarRefComparacion en
// src/App.js — devuelve el registro CRUDO de Busint tal cual, sin filtrar
// campos, para depurar qué trae realmente el maestro.
function normalizarRefComparacion(v) {
  return String(v || "").trim().toUpperCase().replace(/-/g, "");
}
exports.probarReferenciaBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { ref } = request.data || {};
    const refBuscada = String(ref || "").trim();
    if (!refBuscada) {
      throw new HttpsError("invalid-argument", "ref es obligatorio.");
    }
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_Referencias");
    } catch (err) {
      logger.error("Error consultando Busint (probarReferenciaBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar el maestro de referencias de Busint. Intenta de nuevo en unos minutos.");
    }
    const normBuscada = normalizarRefComparacion(refBuscada);
    const encontrada = filas.find((f) => normalizarRefComparacion(f.ref) === normBuscada);
    return {
      encontrada: !!encontrada,
      totalEnBusint: filas.length,
      referencia: encontrada || null,
    };
  }
);

// (2026-08-21) Usado por Nómina → Registrar Producción para topar el precio
// pagado por proceso contra el costo teórico de confección de esa
// referencia — "costoFT" en ApiGen_Referencias (validado en vivo, ojo que
// viene en 0 para varias referencias que Busint no tiene costeadas todavía,
// eso no es un error, solo significa que esa ref no tiene tope configurado).
exports.getCostoTeoricoReferenciaBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { ref } = request.data || {};
    const refBuscada = String(ref || "").trim();
    if (!refBuscada) {
      throw new HttpsError("invalid-argument", "ref es obligatorio.");
    }
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_Referencias");
    } catch (err) {
      logger.error("Error consultando Busint (getCostoTeoricoReferenciaBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar el maestro de referencias de Busint. Intenta de nuevo en unos minutos.");
    }
    const normBuscada = normalizarRefComparacion(refBuscada);
    const encontrada = filas.find((f) => normalizarRefComparacion(f.ref) === normBuscada);
    return {
      encontrada: !!encontrada,
      costoFT: encontrada ? Number(encontrada.costoFT) || 0 : null,
      descripcion: encontrada?.descripcionLarga || null,
    };
  }
);

// (2026-08-22) Usado por Nómina → Registrar Producción → "Buscar Lote": Anny
// y Sarai buscan por N° de lote en vez de escribir la referencia a mano —
// trae de una vez cantidad cortada, pedido, cliente y el costo teórico
// (costoFT) de esa referencia, para que no tengan que hacer dos búsquedas.
exports.getLoteBusintPorNumero = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    const { numLote } = request.data || {};
    const loteBuscado = Number(numLote);
    if (!Number.isFinite(loteBuscado) || loteBuscado <= 0) {
      throw new HttpsError("invalid-argument", "numLote es obligatorio.");
    }
    let filasPanel;
    try {
      filasPanel = await consultarCatalogoBusint("ApiGen_PanelControlFlujoOperacional");
    } catch (err) {
      logger.error("Error consultando Busint (getLoteBusintPorNumero, panel flujo)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar Busint. Intenta de nuevo en unos minutos.");
    }
    const lote = filasPanel.find((f) => Number(f.numLote) === loteBuscado);
    if (!lote) {
      return { encontrada: false };
    }
    // Vigente = el lote todavía se está trabajando (Corte, BMP, Planta o en
    // algún proceso/Semiterminado). Si ya tiene inventario en BPT (Bodega de
    // Producto Terminado) se considera terminado — ya no se le debe poder
    // registrar nómina encima, según pidió el usuario ("menos en BPT debe
    // aparecer no lo tienes").
    const invBPT = Number(lote.invBpt) || 0;
    const invCorte = Number(lote.invCorte) || 0;
    const invBMP = Number(lote.invBmp) || 0;
    const invPlanta = Number(lote.invPlanta) || 0;
    const invSemiterminado = Number(lote.invSemiterminado) || 0;
    const vigente = invBPT <= 0;
    let ubicacionActual = "Sin inventario";
    if (invBPT > 0) ubicacionActual = "BPT";
    else if (invSemiterminado > 0) ubicacionActual = "Semiterminado";
    else if (invPlanta > 0) ubicacionActual = "Planta";
    else if (invBMP > 0) ubicacionActual = "BMP";
    else if (invCorte > 0) ubicacionActual = "Corte";
    let costoFT = null;
    try {
      const filasRef = await consultarCatalogoBusint("ApiGen_Referencias");
      const normBuscada = normalizarRefComparacion(lote.referencia);
      const refEncontrada = filasRef.find((f) => normalizarRefComparacion(f.ref) === normBuscada);
      costoFT = refEncontrada ? Number(refEncontrada.costoFT) || 0 : null;
    } catch (err) {
      logger.error("Error consultando Busint (getLoteBusintPorNumero, referencias)", { error: String(err) });
      // No tumba la búsqueda del lote por esto — solo queda sin costo teórico.
    }
    return {
      encontrada: true,
      numLote: lote.numLote,
      numPedido: lote.numPedido || null,
      referencia: lote.referencia || "",
      nombreCliente: lote.nombreCliente || "",
      categoria: lote.categoria || "",
      cantCortada: Number(lote.cantCortada) || 0,
      fechaCorteISO: lote.fechaCorte || null,
      costoFT,
      vigente,
      ubicacionActual,
    };
  }
);

// (2026-08-22) Usado por Nómina → Procesos → "Cargar desde Busint": Busint no
// tiene una tabla de "catálogo de procesos" como tal — los nombres reales
// (Terminación, Bajada de Vinilo, etc.) están sueltos en los campos
// proceso1..proceso15 de cada lote del Panel de Flujo Operacional. Esta
// función recorre todos los lotes, saca los nombres distintos que aparecen
// ahí y cuenta en cuántos lotes aparece cada uno, para que el admin pueda
// elegir de una lista real en vez de escribir a mano y arriesgarse a que no
// coincida con lo que trae Busint.
exports.getProcesosDistintosBusint = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async () => {
    let filas;
    try {
      filas = await consultarCatalogoBusint("ApiGen_PanelControlFlujoOperacional");
    } catch (err) {
      logger.error("Error consultando Busint (getProcesosDistintosBusint)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar Busint. Intenta de nuevo en unos minutos.");
    }
    const conteo = new Map(); // nombre normalizado -> { nombre original, cantidad }
    filas.forEach((f) => {
      for (let i = 1; i <= 15; i++) {
        const nombre = String(f[`proceso${i}`] || "").trim();
        if (!nombre) continue;
        const clave = nombre.toUpperCase();
        if (!conteo.has(clave)) conteo.set(clave, { nombre, cantidad: 0 });
        conteo.get(clave).cantidad += 1;
      }
    });
    const procesos = [...conteo.values()].sort((a, b) => b.cantidad - a.cantidad);
    return { procesos };
  }
);

// Usado por módulo Bodega → Despachos → Montar Despacho (destino Dubo): en
// vez de digitar cada referencia una por una, trae de un tirón TODAS las
// líneas de un Traslado de Busint a partir de su número (el que aparece
// impreso como "TRASLADO Nº ####" en la remisión), agrupando las filas por
// talla que entrega ApiGen_FacturadoBusint en una sola línea por
// referencia+pinta+color — igual que se ve en el PDF del traslado.
//
// Busint no tiene un endpoint dedicado a "traslados": vienen mezclados
// dentro de ApiGen_FacturadoBusint (junto con facturas normales y
// devoluciones), identificados por el campo "doc" (el número de documento).
// Por default busca en los últimos 180 días; si se manda `fechaAprox`
// (AAAA-MM-DD, la fecha que aparece en la remisión), se acota la búsqueda a
// ±20/10 días alrededor de esa fecha — más rápido y más preciso si el
// traslado es viejo.
exports.buscarTrasladoBusintPorNumero = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 180,
    memory: "512MiB",
  },
  async (request) => {
    const numBuscado = String(request.data?.numeroTraslado ?? "").trim();
    if (!numBuscado) {
      throw new HttpsError("invalid-argument", "Debes indicar el número de traslado.");
    }
    const fechaAprox = request.data?.fechaAprox;
    const fechaValida = typeof fechaAprox === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaAprox);
    let fechaInicio, fechaFin;
    const hoy = new Date();
    if (fechaValida) {
      const centro = new Date(`${fechaAprox}T00:00:00Z`);
      fechaInicio = new Date(centro);
      fechaInicio.setUTCDate(fechaInicio.getUTCDate() - 20);
      fechaFin = new Date(centro);
      fechaFin.setUTCDate(fechaFin.getUTCDate() + 10);
    } else {
      fechaInicio = new Date(hoy);
      fechaInicio.setUTCDate(fechaInicio.getUTCDate() - 180);
      fechaFin = hoy;
    }
    const iso = (d) => d.toISOString().slice(0, 10);

    let filas, referencias;
    try {
      [filas, referencias] = await Promise.all([
        consultarFacturadoBusint(iso(fechaInicio), iso(fechaFin)),
        consultarCatalogoBusint("ApiGen_Referencias"),
      ]);
    } catch (err) {
      logger.error("Error consultando Busint (buscarTrasladoBusintPorNumero)", { error: String(err) });
      throw new HttpsError("unavailable", "No se pudo consultar la API de Busint. Intenta de nuevo en unos minutos.");
    }

    const filasTraslado = filas.filter((f) => String(f.doc ?? "").trim() === numBuscado);
    if (!filasTraslado.length) {
      return {
        encontrado: false,
        numeroTraslado: numBuscado,
        rangoConsultado: { fechaInicio: iso(fechaInicio), fechaFin: iso(fechaFin) },
        lineas: [],
      };
    }

    const descripcionPorRef = new Map();
    referencias.forEach((r) => {
      const ref = String(r.ref || "").trim().toUpperCase();
      if (ref && !descripcionPorRef.has(ref)) descripcionPorRef.set(ref, (r.descripcionLarga || "").trim());
    });

    // Cada fila de Busint es por talla — se agrupan en una sola línea por
    // referencia+pinta+color, sumando cantidad, igual que se ve en el PDF.
    // ApiGen_FacturadoBusint también trae el código de barra por talla
    // (cbarraI/cbarraE/cbarraM) en la misma fila, así que se guarda de una
    // vez — no hace falta escanearlo aparte.
    const grupos = new Map();
    filasTraslado.forEach((f) => {
      const ref = String(f.ref || "").trim();
      const clave = `${ref}|${f.pinta || ""}|${f.color || ""}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          referencia: ref,
          descripcion: descripcionPorRef.get(ref.toUpperCase()) || [f.pinta, f.color].filter(Boolean).join(" "),
          cantidad: 0,
          precio: Number(f.precio) || 0,
          numTraslado: numBuscado,
          barras: [],
        });
      }
      const grupo = grupos.get(clave);
      grupo.cantidad += Math.round(Number(f.cant) || 0);
      const talla = String(f.talla || "").trim();
      const cbarraI = String(f.cbarraI ?? "").trim();
      const cbarraE = String(f.cbarraE ?? "").trim();
      const cbarraM = String(f.cbarraM ?? "").trim();
      if (talla && (cbarraI || cbarraE || cbarraM) && !grupo.barras.some((b) => b.talla === talla)) {
        grupo.barras.push({ talla, cbarraI, cbarraE, cbarraM });
      }
    });

    const lineas = [...grupos.values()];
    // ApiGen_FacturadoBusint trae mezclados facturas normales, traslados
    // externos, traslados en consignación y devoluciones — este mismo
    // endpoint (y por lo tanto este mismo buscador) sirve para traer
    // CUALQUIERA de esos por su número de documento, no solo traslados; el
    // campo "tipo" de Busint dice cuál es.
    return {
      encontrado: true,
      numeroTraslado: numBuscado,
      tipo: (filasTraslado[0]?.tipo || "").trim() || null,
      fecha: soloFecha(filasTraslado[0]?.fechaFact) || null,
      totalLineas: lineas.length,
      totalUnidades: lineas.reduce((s, l) => s + l.cantidad, 0),
      lineas,
    };
  }
);

// Usado por módulo Bodega → Despachos → Montar Despacho (destino Dubo):
// Dubo se factura en Busint día a día como "traslado externo" (una
// remisión chiquita por día), y solo de vez en cuando (cada mes o más) se
// junta un grupo de esas remisiones en un despacho físico real. Esta
// función trae, para un rango de fechas y un cliente puntual (Dubo =
// codigoCliente 118, confirmado contra la remisión que se subió), TODOS
// los documentos (traslados/facturas) que Busint tiene registrados en ese
// rango, cada uno con sus líneas ya listas para cargar — así la pantalla
// puede mostrar una lista con casillas y armar UN SOLO despacho con las que
// se marquen, sin tener que escribir número por número.
exports.listarDocumentosBusintCliente = onCall(
  {
    secrets: [BUSINT_TOKEN, BUSINT_BASE_URL],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    const { fechaInicio, fechaFin, codigoCliente } = request.data || {};
    const fechaValida = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!fechaValida(fechaInicio) || !fechaValida(fechaFin)) {
      throw new HttpsError("invalid-argument", "fechaInicio y fechaFin son obligatorias, en formato AAAA-MM-DD.");
    }
    if (codigoCliente === undefined || codigoCliente === null || codigoCliente === "") {
      throw new HttpsError("invalid-argument", "codigoCliente es obligatorio.");
    }
    const codigoBuscado = String(codigoCliente).trim();

    // Todo el resto de la función queda envuelto en un try/catch propio
    // (además del que ya cubre las dos llamadas a Busint) para que un error
    // inesperado en el agrupamiento no salga al navegador como un genérico
    // "internal" sin pista de qué pasó — queda registrado con el mensaje y
    // la línea exactos en Cloud Functions → Logs.
    try {
      let filas, referencias;
      try {
        [filas, referencias] = await Promise.all([
          consultarFacturadoBusint(fechaInicio, fechaFin),
          consultarCatalogoBusint("ApiGen_Referencias"),
        ]);
      } catch (err) {
        logger.error("Error consultando Busint (listarDocumentosBusintCliente)", { error: String(err) });
        throw new HttpsError("unavailable", "No se pudo consultar la API de Busint. Intenta de nuevo en unos minutos.");
      }

      const filasCliente = filas.filter((f) => String(f.codigoCliente ?? "").trim() === codigoBuscado);

      const descripcionPorRef = new Map();
      referencias.forEach((r) => {
        const ref = String(r.ref || "").trim().toUpperCase();
        if (ref && !descripcionPorRef.has(ref)) descripcionPorRef.set(ref, (r.descripcionLarga || "").trim());
      });

      // Primer nivel: agrupar por documento (doc). Segundo nivel (igual que
      // en buscarTrasladoBusintPorNumero): agrupar las filas de cada
      // documento por referencia+pinta+color, sumando las tallas en una
      // sola línea.
      const porDoc = new Map();
      filasCliente.forEach((f) => {
        const doc = String(f.doc ?? "").trim();
        if (!doc) return;
        if (!porDoc.has(doc)) {
          porDoc.set(doc, {
            doc,
            tipo: (f.tipo || "").trim(),
            fecha: soloFecha(f.fechaFact),
            grupos: new Map(),
          });
        }
        const docObj = porDoc.get(doc);
        const ref = String(f.ref || "").trim();
        const claveLinea = `${ref}|${f.pinta || ""}|${f.color || ""}`;
        if (!docObj.grupos.has(claveLinea)) {
          docObj.grupos.set(claveLinea, {
            referencia: ref,
            descripcion: descripcionPorRef.get(ref.toUpperCase()) || [f.pinta, f.color].filter(Boolean).join(" "),
            cantidad: 0,
            precio: Number(f.precio) || 0,
            numTraslado: doc,
            barras: [],
          });
        }
        const linea = docObj.grupos.get(claveLinea);
        linea.cantidad += Math.round(Number(f.cant) || 0);
        const talla = String(f.talla || "").trim();
        const cbarraI = String(f.cbarraI ?? "").trim();
        const cbarraE = String(f.cbarraE ?? "").trim();
        const cbarraM = String(f.cbarraM ?? "").trim();
        if (talla && (cbarraI || cbarraE || cbarraM) && !linea.barras.some((b) => b.talla === talla)) {
          linea.barras.push({ talla, cbarraI, cbarraE, cbarraM });
        }
      });

      var documentos = [...porDoc.values()]
        .map((d) => {
          const lineas = [...d.grupos.values()];
          return {
            doc: d.doc,
            tipo: d.tipo,
            fecha: d.fecha,
            totalUnidades: lineas.reduce((s, l) => s + l.cantidad, 0),
            totalValor: lineas.reduce((s, l) => s + l.cantidad * l.precio, 0),
            totalLineas: lineas.length,
            lineas,
          };
        })
        .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("Error inesperado en listarDocumentosBusintCliente", { error: String(err), stack: err?.stack });
      throw new HttpsError("internal", `Error inesperado: ${err?.message || String(err)}`);
    }

    return { fechaInicio, fechaFin, codigoCliente: codigoBuscado, totalDocumentos: documentos.length, documentos };
  }
);

// ─── MIGRACIÓN A FIREBASE AUTHENTICATION (Fase A) ─────────────────────────
//
// Hoy el login del aplicativo compara la clave escrita a mano contra la
// colección `users` de Firestore, que guarda las contraseñas en texto
// plano y se lee completa ANTES de que la persona inicie sesión — por eso
// las reglas de seguridad de Firestore no pueden exigir sesión iniciada sin
// romper el login. Este es el primer paso para arreglarlo de raíz: crear,
// por detrás y sin tocar el login actual, una cuenta REAL de Firebase
// Authentication para cada usuario que ya existe.
//
// Firebase Auth pide un "correo" para el login por clave — como acá se
// entra con nombre de usuario (no correo), se arma uno falso con el mismo
// username: usuario@techpack-yanko.local. Nadie necesita memorizar nada
// nuevo. La clave que ya tiene cada persona se reutiliza tal cual.
//
// Es segura de correr varias veces: si un usuario ya tiene el campo
// `authUid` guardado (ya fue migrado), se salta. No borra ni modifica la
// colección `users` existente — solo le agrega `authUid` a cada documento,
// para poder ligarlo más adelante (Fase B) a la cuenta real.
//
// Protegida con una clave secreta propia (no con sesión iniciada, porque en
// este punto nadie puede iniciar sesión todavía con Firebase Auth).
const MIGRACION_CLAVE = defineSecret("MIGRACION_CLAVE");

exports.migrarUsuariosAFirebaseAuth = onCall(
  {
    secrets: [MIGRACION_CLAVE],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request) => {
    const clave = request.data?.clave;
    if (!clave || clave !== MIGRACION_CLAVE.value()) {
      throw new HttpsError("permission-denied", "Clave de migración incorrecta.");
    }

    const usersSnap = await db.collection("users").get();
    const migrados = [];
    const yaExistian = [];
    const errores = [];

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      if (data.authUid) {
        yaExistian.push(data.username);
        continue;
      }
      const username = String(data.username || "").trim().toLowerCase();
      if (!username) {
        errores.push({ id: doc.id, motivo: "Documento sin username." });
        continue;
      }
      const email = `${username}@techpack-yanko.local`;
      const password = data.password;
      if (!password || String(password).length < 6) {
        errores.push({
          id: doc.id,
          username,
          motivo: "Clave ausente o muy corta (Firebase exige mínimo 6 caracteres) — cámbiala primero desde Admin → Usuarios y vuelve a correr la migración.",
        });
        continue;
      }
      try {
        let userRecord;
        try {
          userRecord = await admin.auth().createUser({
            email,
            password: String(password),
            displayName: data.name || username,
          });
        } catch (err) {
          if (err.code === "auth/email-already-exists") {
            userRecord = await admin.auth().getUserByEmail(email);
          } else {
            throw err;
          }
        }
        await doc.ref.update({ authUid: userRecord.uid });
        migrados.push(username);
      } catch (err) {
        errores.push({ id: doc.id, username, motivo: String(err.message || err) });
      }
    }

    logger.info(
      `Migración a Firebase Auth: ${migrados.length} migrado(s), ${yaExistian.length} ya exist(ía/ían), ${errores.length} con error.`
    );
    return { migrados, yaExistian, errores };
  }
);

// ─── FASE B: ADMINISTRACIÓN DE USUARIOS SOBRE FIREBASE AUTH REAL ──────────
//
// Ahora que el login real usa Firebase Authentication (ya no compara clave
// en texto plano), dos acciones de Admin → Usuarios necesitan pasar por una
// Cloud Function con permisos de administrador, porque el navegador de
// quien administra NO tiene permiso para tocar la cuenta de Firebase Auth de
// OTRA persona (solo la propia):
//   - Crear un usuario nuevo: hay que crear su cuenta real de Firebase Auth
//     además de su documento en Firestore, si no, no podría iniciar sesión.
//   - Resetear la clave de otro usuario: cambiar la clave de una cuenta de
//     Firebase Auth que no es la tuya requiere el SDK de administrador
//     (`admin.auth().updateUser`), el cliente no puede hacerlo directo.
// Ambas funciones exigen sesión iniciada (`request.auth`) Y que quien llama
// tenga `isAdmin: true` en su propio documento de `users` — se verifica
// buscando ese documento por `authUid == request.auth.uid`.
async function verificarLlamadorEsAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const snap = await db.collection("users").where("authUid", "==", request.auth.uid).limit(1).get();
  if (snap.empty || !snap.docs[0].data().isAdmin) {
    throw new HttpsError("permission-denied", "Solo un administrador puede hacer esto.");
  }
  return snap.docs[0];
}

exports.adminCrearUsuario = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    await verificarLlamadorEsAdmin(request);
    const { name, username, password, role, isAdmin, clienteAsociado, areaNomina } = request.data || {};
    const nombreLimpio = String(name || "").trim();
    const usernameNorm = String(username || "").trim().toLowerCase();
    if (!nombreLimpio || !usernameNorm || !password) {
      throw new HttpsError("invalid-argument", "Nombre, usuario y contraseña son obligatorios.");
    }
    if (String(password).length < 6) {
      throw new HttpsError("invalid-argument", "La contraseña debe tener al menos 6 caracteres.");
    }
    const dupSnap = await db.collection("users").where("username", "==", usernameNorm).limit(1).get();
    if (!dupSnap.empty) {
      throw new HttpsError("already-exists", "Ese usuario ya existe.");
    }
    const email = `${usernameNorm}@techpack-yanko.local`;
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({ email, password: String(password), displayName: nombreLimpio });
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "Ya existe una cuenta de acceso con ese nombre de usuario.");
      }
      throw new HttpsError("internal", String(err.message || err));
    }
    const avatar = nombreLimpio.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const docRef = db.collection("users").doc();
    await docRef.set({
      id: docRef.id,
      name: nombreLimpio,
      username: usernameNorm,
      role: role || "Equipo Interno",
      isAdmin: !!isAdmin,
      avatar,
      authUid: userRecord.uid,
      // Cliente asociado (opcional): si viene con dato, ese usuario solo ve
      // en Prototipos/Cápsulas/Pedidos/Estadísticas/Historial/Bitácora/
      // Cronograma lo que pertenece a ese cliente puntual — pensado para
      // cuentas de acceso restringido de un cliente que no debe ver el
      // trabajo de otros clientes.
      clienteAsociado: clienteAsociado ? String(clienteAsociado).trim() : "",
      // Área de Nómina (opcional): solo se usa para los líderes de área
      // (Anny Beltrán → Terminación, Sarai Méndez → Termofijación) — con
      // esto puesto, el módulo de Nómina les muestra una pantalla simple
      // filtrada solo a su gente en vez del panel completo de admin.
      areaNomina: areaNomina ? String(areaNomina).trim() : "",
    });
    return { id: docRef.id };
  }
);

exports.adminCambiarClaveUsuario = onCall(
  { timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    await verificarLlamadorEsAdmin(request);
    const { userId, nuevaClave } = request.data || {};
    if (!userId || !nuevaClave || String(nuevaClave).length < 6) {
      throw new HttpsError("invalid-argument", "Selecciona un usuario y una contraseña de al menos 6 caracteres.");
    }
    const targetDoc = await db.collection("users").doc(userId).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "Usuario no encontrado.");
    }
    const targetData = targetDoc.data();
    let authUid = targetData.authUid;
    if (!authUid) {
      // Usuario nunca migrado a Firebase Auth (caso raro post Fase A) — se
      // crea la cuenta ahora mismo en vez de fallar.
      const usernameNorm = String(targetData.username || "").trim().toLowerCase();
      const email = `${usernameNorm}@techpack-yanko.local`;
      const userRecord = await admin.auth().createUser({ email, password: String(nuevaClave), displayName: targetData.name || usernameNorm });
      authUid = userRecord.uid;
      await targetDoc.ref.update({ authUid });
    } else {
      await admin.auth().updateUser(authUid, { password: String(nuevaClave) });
    }
    return { ok: true };
  }
);

// ─────────────────────────────────────────────────────────────────────────
// (2026-08-19) Restaurada — se había quitado de este archivo en un commit
// anterior y quedó desincronizada con lo desplegado en producción; el
// usuario confirmó que TODAVÍA la necesita, así que vuelve tal cual estaba.
//
// Avisos de prototipos/cápsulas vencidos (por correo).
//
// Corre una vez al día. Revisa TODOS los prototipos y las referencias
// dentro de cada cápsula, calcula si están "vencidos" (llevan más días en
// su etapa actual de los que esa etapa tiene configurados en
// config/main.stages) usando la MISMA regla que ya usa la app en pantalla
// (ver `isOverdue` en src/App.js), y manda un correo:
//
//   - A la diseñadora asignada a ese prototipo/referencia: un aviso
//     motivador para que lo destrabe.
//   - A Dayana, Karen y Yuliana (encargada de colecciones, aux. de
//     colecciones y directora creativa): un aviso pidiendo apoyo para esa
//     diseñadora.
//
// Se manda UNA sola vez por cada vez que un ítem cae en "vencido" — no se
// repite todos los días mientras siga vencido. Para lograrlo, cada ítem
// guarda en qué etapa ya se avisó (`vencidoAvisadoEtapa`); si sigue vencido
// en la MISMA etapa, no se vuelve a avisar; si avanza de etapa y luego se
// vuelve a vencer en una etapa distinta, sí se avisa de nuevo.
//
// CONFIGURACIÓN (ya debería estar hecha de antes, pero por si toca
// rehacerla — por ejemplo si nunca se corrió `npm install` en este entorno
// nuevo):
//   1. Dentro de la carpeta functions/: npm install
//      (nodemailer ya quedó agregado a package.json)
//   2. Los secretos EMAIL_USER / EMAIL_APP_PASSWORD deberían seguir
//      existiendo en Secret Manager de este proyecto de antes — si el
//      deploy se queja de que faltan, créalos de nuevo:
//        firebase functions:secrets:set EMAIL_USER
//        firebase functions:secrets:set EMAIL_APP_PASSWORD
//      (la contraseña es una "contraseña de aplicación" de Gmail, no la
//      contraseña normal de esa cuenta de Google)
//   3. firebase deploy --only functions
//
// Los destinatarios fijos (Dayana/Karen/Yuliana) y cada diseñadora se
// buscan por NOMBRE dentro de la colección `users` (campo `email`, el que
// se agrega desde Administración → Usuarios en la app) — si cambian de
// correo, se actualiza ahí, sin tocar este archivo ni volver a desplegar.
// ─────────────────────────────────────────────────────────────────────────
const EMAIL_USER = defineSecret("EMAIL_USER");
const EMAIL_APP_PASSWORD = defineSecret("EMAIL_APP_PASSWORD");
const nodemailer = require("nodemailer");

const RECIPIENTES_APOYO = ["Dayana", "Karen", "Yuliana"];
const STAGES_TERMINALES = new Set(["enviado_cotizacion", "enviar_cliente", "enviado", "recibido_cliente", "aprobado", "declinado"]);

function diasDesde(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function estaVencido(item, stagesMap) {
  if (!item.currentStage || STAGES_TERMINALES.has(item.status)) return false;
  const limite = stagesMap.get(item.currentStage);
  if (limite == null || !item.stageStartedAt) return false;
  return diasDesde(item.stageStartedAt) > limite;
}

// Busca el correo de un usuario por nombre (comparación floja: minúsculas,
// sin espacios de más, y por coincidencia parcial en ambos sentidos) —
// porque el nombre guardado en "Responsable"/config.disenadores puede no
// ser palabra por palabra idéntico al nombre completo del usuario.
function buscarCorreoPorNombre(nombreBuscado, usuarios) {
  if (!nombreBuscado) return null;
  const buscado = String(nombreBuscado).trim().toLowerCase();
  if (!buscado) return null;
  const match = usuarios.find((u) => {
    const nombreUsuario = String(u.name || "").trim().toLowerCase();
    if (!nombreUsuario || !u.email) return false;
    return nombreUsuario === buscado || nombreUsuario.includes(buscado) || buscado.includes(nombreUsuario);
  });
  return match ? match.email : null;
}

function crearTransporte() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER.value(), pass: EMAIL_APP_PASSWORD.value() },
  });
}

async function mandarCorreo(transporte, destinatarios, asunto, textoHtml) {
  const destinos = destinatarios.filter(Boolean);
  if (!destinos.length) return;
  await transporte.sendMail({
    from: `ATLAS <${EMAIL_USER.value()}>`,
    to: destinos.join(","),
    subject: asunto,
    html: textoHtml,
  });
}

async function revisarYAvisarVencidos() {
  const [configSnap, usersSnap, protosSnap, capsulasSnap] = await Promise.all([
    db.collection("config").doc("main").get(),
    db.collection("users").get(),
    db.collection("prototipos").get(),
    db.collection("capsulas").get(),
  ]);

  const stages = configSnap.exists ? (configSnap.data().stages || []) : [];
  const stagesMap = new Map(stages.map((s) => [s.id, s.days]));
  const usuarios = usersSnap.docs.map((d) => d.data());

  const correosApoyo = RECIPIENTES_APOYO.map((n) => buscarCorreoPorNombre(n, usuarios)).filter(Boolean);
  if (correosApoyo.length < RECIPIENTES_APOYO.length) {
    logger.warn("No se encontró correo para todos los destinatarios de apoyo (Dayana/Karen/Yuliana) — revisa que tengan correo cargado en Administración → Usuarios.");
  }

  const transporte = crearTransporte();
  let avisosEnviados = 0;

  // ── Prototipos ──
  for (const doc of protosSnap.docs) {
    const item = doc.data();
    if (!estaVencido(item, stagesMap)) continue;
    if (item.vencidoAvisadoEtapa === item.currentStage) continue; // ya se avisó en esta etapa

    const correoDisenadora = buscarCorreoPorNombre(item.assignedTo, usuarios);
    const nombreItem = `${item.name || "Prototipo"}${item.reference ? ` (${item.reference})` : ""}`;
    const etapaLabel = stages.find((s) => s.id === item.currentStage)?.label || item.currentStage;

    await mandarCorreo(
      transporte,
      [correoDisenadora],
      `⏰ ${nombreItem} va atrasado en ${etapaLabel}`,
      `<p>Hola ${item.assignedTo || ""},</p><p>El prototipo <strong>${nombreItem}</strong> lleva más días de los previstos en la etapa de <strong>${etapaLabel}</strong>.</p><p>¡Vamos, tú puedes avanzarlo! 💪</p>`
    );
    await mandarCorreo(
      transporte,
      correosApoyo,
      `⏰ ${nombreItem} necesita una mano — atrasado en ${etapaLabel}`,
      `<p>Hola,</p><p>Ayudemos a <strong>${item.assignedTo || "la diseñadora"}</strong> — el prototipo <strong>${nombreItem}</strong> está retrasado en la etapa de <strong>${etapaLabel}</strong>.</p><p>¿Vemos entre todas cómo destrabarlo?</p>`
    );

    await doc.ref.update({ vencidoAvisadoEtapa: item.currentStage });
    avisosEnviados++;
  }

  // ── Referencias dentro de cápsulas ──
  for (const doc of capsulasSnap.docs) {
    const cap = doc.data();
    const referencias = cap.referencias || [];
    let huboCambios = false;

    for (const refItem of referencias) {
      if (!estaVencido(refItem, stagesMap)) continue;
      if (refItem.vencidoAvisadoEtapa === refItem.currentStage) continue;

      const asignado = refItem.assignedTo || cap.assignedTo;
      const correoDisenadora = buscarCorreoPorNombre(asignado, usuarios);
      const nombreItem = `${refItem.name || "Referencia"}${refItem.reference ? ` (${refItem.reference})` : ""} — Cápsula ${cap.name || ""}`;
      const etapaLabel = stages.find((s) => s.id === refItem.currentStage)?.label || refItem.currentStage;

      await mandarCorreo(
        transporte,
        [correoDisenadora],
        `⏰ ${nombreItem} va atrasada en ${etapaLabel}`,
        `<p>Hola ${asignado || ""},</p><p>La referencia <strong>${nombreItem}</strong> lleva más días de los previstos en la etapa de <strong>${etapaLabel}</strong>.</p><p>¡Vamos, tú puedes avanzarla! 💪</p>`
      );
      await mandarCorreo(
        transporte,
        correosApoyo,
        `⏰ ${nombreItem} necesita una mano — atrasada en ${etapaLabel}`,
        `<p>Hola,</p><p>Ayudemos a <strong>${asignado || "la diseñadora"}</strong> — la referencia <strong>${nombreItem}</strong> está retrasada en la etapa de <strong>${etapaLabel}</strong>.</p><p>¿Vemos entre todas cómo destrabarlo?</p>`
      );

      refItem.vencidoAvisadoEtapa = refItem.currentStage;
      huboCambios = true;
      avisosEnviados++;
    }

    if (huboCambios) {
      await doc.ref.update({ referencias });
    }
  }

  logger.info(`Avisos de vencidos: ${avisosEnviados} aviso(s) enviado(s).`);
  return { avisosEnviados };
}

// ─────────────────────────────────────────────────────────────────────────
// FELICITACIONES cuando una diseñadora se pone AL DÍA (nada atrasado)
// (2026-08-25) Pedido por el usuario junto con Dayana, Karen Michel Chacón y
// Yuliana Andrea Beltrán (directora creativa): así como se avisa cuando algo
// se atrasa, también avisar — a la diseñadora y al mismo equipo de apoyo
// (RECIPIENTES_APOYO) — cuando NO tiene absolutamente nada vencido. Para no
// mandar el mismo "¡vas bien!" todos los días mientras se mantenga al día,
// se guarda el último estado conocido de cada diseñadora en la colección
// `diseno_estado_felicitaciones` (doc id = su nombre en minúsculas): solo se
// manda el correo la PRIMERA vez que pasa de "tenía algo atrasado" (o nunca
// se había revisado) a "cero atrasos". Si luego se le vuelve a vencer algo,
// el estado se resetea, así que si más adelante se vuelve a poner al día,
// se le felicita de nuevo (no es un aviso de una sola vez en la vida).
// Solo se evalúan diseñadoras con AL MENOS un ítem activo asignado (etapa no
// terminal) — no tiene sentido "felicitar" a alguien sin nada asignado.
function normalizarNombreDisenadora(s) {
  return String(s || "").trim().toLowerCase();
}

async function revisarYFelicitarAlDia() {
  const [configSnap, usersSnap, protosSnap, capsulasSnap] = await Promise.all([
    db.collection("config").doc("main").get(),
    db.collection("users").get(),
    db.collection("prototipos").get(),
    db.collection("capsulas").get(),
  ]);

  const stages = configSnap.exists ? (configSnap.data().stages || []) : [];
  const stagesMap = new Map(stages.map((s) => [s.id, s.days]));
  const usuarios = usersSnap.docs.map((d) => d.data());
  const correosApoyo = RECIPIENTES_APOYO.map((n) => buscarCorreoPorNombre(n, usuarios)).filter(Boolean);
  const transporte = crearTransporte();

  // Por diseñadora: ¿tiene al menos un ítem activo?, ¿alguno de esos activos
  // está vencido ahora mismo?
  const porDisenadora = new Map();
  function registrar(nombre, item) {
    if (!nombre || !String(nombre).trim()) return;
    if (STAGES_TERMINALES.has(item.status)) return; // lo ya cerrado no cuenta para esto
    const key = normalizarNombreDisenadora(nombre);
    if (!porDisenadora.has(key)) porDisenadora.set(key, { nombre: String(nombre).trim(), tieneActivos: false, tieneAtraso: false });
    const g = porDisenadora.get(key);
    g.tieneActivos = true;
    if (estaVencido(item, stagesMap)) g.tieneAtraso = true;
  }
  for (const doc of protosSnap.docs) registrar(doc.data().assignedTo, doc.data());
  for (const doc of capsulasSnap.docs) {
    const cap = doc.data();
    for (const refItem of cap.referencias || []) registrar(refItem.assignedTo || cap.assignedTo, refItem);
  }

  let felicitacionesEnviadas = 0;
  for (const [key, g] of porDisenadora) {
    if (!g.tieneActivos) continue;
    const estadoRef = db.collection("diseno_estado_felicitaciones").doc(key);
    const estadoSnap = await estadoRef.get();
    const yaFelicitada = estadoSnap.exists && estadoSnap.data().sinAtrasos === true;
    if (g.tieneAtraso) {
      // Se le volvió a vencer algo — si antes estaba "felicitada", se
      // resetea para que, si vuelve a ponerse al día más adelante, se le
      // pueda felicitar de nuevo.
      if (yaFelicitada) await estadoRef.set({ sinAtrasos: false, nombre: g.nombre, actualizadoEn: new Date().toISOString() }, { merge: true });
      continue;
    }
    if (yaFelicitada) continue; // ya se le felicitó la última vez que se puso al día — no repetir a diario
    const correoDisenadora = buscarCorreoPorNombre(g.nombre, usuarios);
    await mandarCorreo(
      transporte,
      [correoDisenadora],
      `🎉 ${g.nombre} — ¡todo al día!`,
      `<p>Hola ${g.nombre},</p><p>¡Felicitaciones! En este momento no tienes ningún prototipo ni referencia atrasado. Sigue así 🙌</p>`
    );
    await mandarCorreo(
      transporte,
      correosApoyo,
      `🎉 ${g.nombre} está al día con todo`,
      `<p>Hola,</p><p><strong>${g.nombre}</strong> no tiene nada atrasado en este momento — todo su trabajo va al día. 🎉</p>`
    );
    await estadoRef.set({ sinAtrasos: true, nombre: g.nombre, actualizadoEn: new Date().toISOString() }, { merge: true });
    felicitacionesEnviadas++;
  }

  logger.info(`Felicitaciones al día: ${felicitacionesEnviadas} enviada(s).`);
  return { felicitacionesEnviadas };
}

// Corre una vez al día a las 8am (hora Bogotá). Para probar más seguido
// mientras confirmas que funciona, cambia el schedule temporalmente (ej.
// "every 10 minutes") y vuelve a desplegar — después vuelve a dejarlo en
// "every day 08:00" y despliega de nuevo.
exports.avisarVencidos = onSchedule(
  {
    schedule: "every day 08:00",
    timeZone: "America/Bogota",
    secrets: [EMAIL_USER, EMAIL_APP_PASSWORD],
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    await revisarYAvisarVencidos();
    await revisarYFelicitarAlDia();
  }
);

// ---------------------------------------------------------------------------
// TNS (paquete contable) — integración de Nómina
// ---------------------------------------------------------------------------
// La API de TNS (https://api.tns.co) exige loguearse primero contra
// POST /v2/Acceso/Login con { codigoEmpresa, nombreUsuario, contrasenia } —
// eso devuelve un token que hay que mandar (Authorization: Bearer ...) en las
// siguientes llamadas (Contratos/Insertar, Contratos/Actualizar,
// Contratos/Novedades/Insertar, etc.). Confirmado contra el swagger en vivo
// (https://api.tns.co/index.html) el 25/08/2026.
//
// Configura estos 3 secretos UNA VEZ desde tu propia terminal (nunca se
// escriben acá, este archivo queda en un repo):
//   firebase functions:secrets:set TNS_CODIGO_EMPRESA
//   firebase functions:secrets:set TNS_USUARIO
//   firebase functions:secrets:set TNS_CONTRASENIA
// y luego:
//   firebase deploy --only functions
//
// (2026-08-26) Industrias Yanko e Indutex son DOS empresas separadas en
// TNS (cada una con su propio login) — se agregó un segundo juego de
// secretos para Indutex, configurado igual desde la terminal:
//   firebase functions:secrets:set TNS_INDUTEX_CODIGO_EMPRESA
//   firebase functions:secrets:set TNS_INDUTEX_USUARIO
//   firebase functions:secrets:set TNS_INDUTEX_CONTRASENIA
// Cada función de TNS recibe un parámetro "empresa" ("yanko" | "indutex",
// por defecto "yanko") para saber con cuál juego de credenciales loguearse.
const TNS_CODIGO_EMPRESA = defineSecret("TNS_CODIGO_EMPRESA");
const TNS_USUARIO = defineSecret("TNS_USUARIO");
const TNS_CONTRASENIA = defineSecret("TNS_CONTRASENIA");
const TNS_INDUTEX_CODIGO_EMPRESA = defineSecret("TNS_INDUTEX_CODIGO_EMPRESA");
const TNS_INDUTEX_USUARIO = defineSecret("TNS_INDUTEX_USUARIO");
const TNS_INDUTEX_CONTRASENIA = defineSecret("TNS_INDUTEX_CONTRASENIA");
const TNS_BASE_URL = "https://api.tns.co";

// Cloud Functions exige que cada función declare, en su lista "secrets",
// TODOS los secretos que vaya a leer — como una misma función (ej.
// probarConexionTNS) puede atender a cualquiera de las dos empresas según
// el parámetro que le manden, declara los 6 de una vez.
const TNS_SECRETS_TODAS = [
  TNS_CODIGO_EMPRESA, TNS_USUARIO, TNS_CONTRASENIA,
  TNS_INDUTEX_CODIGO_EMPRESA, TNS_INDUTEX_USUARIO, TNS_INDUTEX_CONTRASENIA,
];

function credencialesTNS(empresa) {
  if (empresa === "indutex") {
    return {
      codigoEmpresa: TNS_INDUTEX_CODIGO_EMPRESA.value(),
      nombreUsuario: TNS_INDUTEX_USUARIO.value(),
      contrasenia: TNS_INDUTEX_CONTRASENIA.value(),
    };
  }
  return {
    codigoEmpresa: TNS_CODIGO_EMPRESA.value(),
    nombreUsuario: TNS_USUARIO.value(),
    contrasenia: TNS_CONTRASENIA.value(),
  };
}

// El token se guarda en memoria del proceso (no en Firestore), UNO POR
// EMPRESA — mientras la instancia de la función siga "caliente" se
// reutiliza; si Cloud Functions arranca una instancia nueva, simplemente se
// vuelve a loguear. Así se evita loguearse en cada llamada sin tener que
// guardar credenciales/tokens en la base de datos.
const _tnsTokenCachePorEmpresa = { yanko: { token: null, obtenidoEn: 0 }, indutex: { token: null, obtenidoEn: 0 } };
const TNS_TOKEN_VIGENCIA_MS = 25 * 60 * 1000; // 25 min, conservador

async function obtenerTokenTNS(empresa = "yanko") {
  const cache = _tnsTokenCachePorEmpresa[empresa] || (_tnsTokenCachePorEmpresa[empresa] = { token: null, obtenidoEn: 0 });
  const ahora = Date.now();
  if (cache.token && ahora - cache.obtenidoEn < TNS_TOKEN_VIGENCIA_MS) {
    return cache.token;
  }

  const resp = await fetch(`${TNS_BASE_URL}/v2/Acceso/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credencialesTNS(empresa)),
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    logger.error("TNS Login respondió con error", { status: resp.status, texto });
    throw new Error(`TNS Login respondió ${resp.status}`);
  }

  const textoResp = await resp.text().catch(() => "");
  let data;
  try {
    data = textoResp ? JSON.parse(textoResp) : null;
  } catch {
    data = null;
  }

  // Si TNS devuelve el token como texto plano (sin JSON), se usa tal cual.
  if (!data && textoResp && textoResp.trim()) {
    cache.token = textoResp.trim().replace(/^"|"$/g, "");
    cache.obtenidoEn = ahora;
    return cache.token;
  }

  // Forma real confirmada en vivo (25/08/2026):
  // { status: true, message: "", data: "<JWT como texto plano>" } — el
  // swagger no lo documentaba, el token viene en "data", no en un campo
  // llamado "token". Si status viene en false, TNS ya manda el motivo
  // (usuario/clave/código de empresa incorrectos, etc.) en "message".
  if (data && typeof data === "object" && "status" in data) {
    if (data.status === false) {
      throw new Error(`TNS rechazó el login: ${data.message || "sin mensaje del servidor"}`);
    }
    if (data.status === true && typeof data.data === "string" && data.data.length > 10) {
      cache.token = data.data;
      cache.obtenidoEn = ahora;
      return cache.token;
    }
  }

  // La forma exacta de la respuesta no queda clara solo con el swagger —
  // se busca cualquier campo cuyo nombre contenga "token" hasta 2 niveles
  // de profundidad (data.token, data.Token, data.data.token,
  // data.result.accessToken, etc.) en vez de adivinar una sola variante.
  function buscarToken(obj, profundidad) {
    if (!obj || typeof obj !== "object" || profundidad > 2) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.length > 10 && /token/i.test(k)) return v;
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") {
        const encontrado = buscarToken(v, profundidad + 1);
        if (encontrado) return encontrado;
      }
    }
    return null;
  }

  const token = buscarToken(data, 0);
  if (!token) {
    logger.error("TNS Login no devolvió token reconocible", { llavesRecibidas: Object.keys(data || {}), respuesta: textoResp.slice(0, 500) });
    throw new Error(
      `TNS respondió pero no se encontró un campo de token reconocible. Llaves recibidas: ${JSON.stringify(Object.keys(data || {}))}. ` +
      `Respuesta (recortada): ${textoResp.slice(0, 300)}`
    );
  }

  cache.token = token;
  cache.obtenidoEn = ahora;
  return token;
}

// Llamada genérica autenticada contra la API de TNS — pensada para
// reutilizarse cuando conectemos Contratos/Insertar, Novedades/Insertar, etc.
async function llamarTNS(path, { method = "GET", body, empresa = "yanko" } = {}) {
  const token = await obtenerTokenTNS(empresa);
  const resp = await fetch(`${TNS_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await resp.text().catch(() => "");
  let data;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    data = texto;
  }
  if (!resp.ok) {
    logger.error("TNS respondió con error", { path, status: resp.status, data });
    throw new Error(`TNS respondió ${resp.status} en ${path}`);
  }
  return data;
}

// Trae el catálogo de Centro de Costo de TNS — primer catálogo que se
// consulta en vivo para empezar a cruzar los códigos reales contra las
// ÁREAS de BASE DE DATOS PERSONAL. No se conoce de antemano la forma exacta
// de la respuesta (el swagger no la documenta bien para este endpoint en
// particular), así que se devuelve tal cual TNS la mande y se interpreta en
// el frontend.
exports.listarCentroCostoTNS = onCall(
  {
    secrets: TNS_SECRETS_TODAS,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const empresa = request.data?.empresa === "indutex" ? "indutex" : "yanko";
    try {
      const data = await llamarTNS("/v2/tablas/CentroCosto/Listar", { method: "GET", empresa });
      return { ok: true, data };
    } catch (err) {
      logger.error("listarCentroCostoTNS falló", { mensaje: err?.message, stack: err?.stack, empresa });
      throw new HttpsError("internal", err?.message || "Error desconocido al consultar Centro de Costo en TNS.");
    }
  }
);

// La API de TNS no tiene un endpoint para listar Contratos/Nómina ya
// creados (solo Insertar/Actualizar) — se revisó a fondo el swagger. Lo más
// cercano es GET /v2/tablas/Tercero/Listar: según el manual de TNS, un
// empleado con contrato queda registrado también como "tercero" (así se
// selecciona el trabajador al crear el contrato). No se sabe todavía si
// trae datos útiles de nómina (cargo, sueldo, etc.) o solo lo básico del
// tercero — se deja crudo para revisar la forma real de la respuesta.
exports.listarTercerosTNS = onCall(
  {
    secrets: TNS_SECRETS_TODAS,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const empresa = request.data?.empresa === "indutex" ? "indutex" : "yanko";
    try {
      const data = await llamarTNS("/v2/tablas/Tercero/Listar", { method: "GET", empresa });
      return { ok: true, data };
    } catch (err) {
      logger.error("listarTercerosTNS falló", { mensaje: err?.message, stack: err?.stack, empresa });
      throw new HttpsError("internal", err?.message || "Error desconocido al consultar Terceros en TNS.");
    }
  }
);

// Registra una Novedad de contrato (destajo, deducible, devengado, etc.) en
// TNS — POST /v2/nomina/Contratos/Novedades/Insertar. Campos obligatorios
// según InsertarNovedadContratoRequest (confirmado en vivo el 25/08/2026):
// tiponov, codcontrato, codconcepto. El resto son opcionales según el tipo
// de novedad. No se valida de más acá adentro — TNS es quien decide si el
// codconcepto/codcontrato son válidos, y su respuesta de error (si la hay)
// se propaga tal cual al frontend para que se vea el motivo real.
exports.insertarNovedadTNS = onCall(
  {
    secrets: TNS_SECRETS_TODAS,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    const { tiponov, fecha, codcontrato, codconcepto, observaciones, novsaldo, descdestajo } = request.data || {};
    const empresa = request.data?.empresa === "indutex" ? "indutex" : "yanko";
    if (!tiponov || !codcontrato || !codconcepto) {
      throw new HttpsError("invalid-argument", "tiponov, codcontrato y codconcepto son obligatorios.");
    }
    const body = {
      tiponov: Number(tiponov),
      codcontrato: String(codcontrato),
      codconcepto: String(codconcepto),
    };
    if (fecha) body.fecha = fecha;
    if (observaciones) body.observaciones = String(observaciones);
    if (novsaldo !== undefined && novsaldo !== null && novsaldo !== "") body.novsaldo = Number(novsaldo);
    if (descdestajo) body.descdestajo = String(descdestajo);
    try {
      const data = await llamarTNS("/v2/nomina/Contratos/Novedades/Insertar", { method: "POST", body, empresa });
      logger.info("insertarNovedadTNS OK", { codcontrato, tiponov, codconcepto, empresa });
      return { ok: true, data };
    } catch (err) {
      logger.error("insertarNovedadTNS falló", { mensaje: err?.message, stack: err?.stack, body, empresa });
      throw new HttpsError("internal", err?.message || "Error desconocido al insertar la novedad en TNS.");
    }
  }
);

// Botón de prueba desde el aplicativo: confirma que los 3 secretos quedaron
// bien configurados SIN exponer el token al navegador — solo devuelve
// { conectado: true } o el motivo del error. Pensado para probar la conexión
// apenas se configuren los secretos, antes de construir el envío real de
// Contratos/Novedades. Se puede llamar desde el navegador con
// `httpsCallable(functions, "probarConexionTNS")()`.
exports.probarConexionTNS = onCall(
  {
    secrets: TNS_SECRETS_TODAS,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    // onCall solo deja pasar al navegador el mensaje real cuando se lanza un
    // HttpsError — un Error normal llega al frontend como "INTERNAL" a
    // secas (por seguridad), y el detalle solo queda en los logs del
    // servidor. Se envuelve acá para que el botón de la app muestre el
    // motivo real sin tener que ir a revisar los logs de Firebase.
    const empresa = request.data?.empresa === "indutex" ? "indutex" : "yanko";
    try {
      await obtenerTokenTNS(empresa);
      return { conectado: true, empresa };
    } catch (err) {
      logger.error("probarConexionTNS falló", { mensaje: err?.message, stack: err?.stack, empresa });
      throw new HttpsError("internal", err?.message || "Error desconocido al conectar con TNS.");
    }
  }
);
