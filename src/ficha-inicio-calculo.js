// ─── FICHA DE INICIO · lógica pura (sin Firebase ni React) ────────────────────────────────────────────────────
// (2026-11-22, a pedido de Fredy) Fase 1 de la Ficha de inicio del pedido: semáforo de 9 pasos por referencia de la preorden + asistente
// paso a paso + bibliotecas previas de colores y vinilos (se alistan antes y la ficha escoge de ahí).
// Colecciones: ficha_colores/{id}, ficha_vinilos/{id}, ficha_inicio/{preordenId}__{itemId}.
// La ficha guarda una COPIA (nombre y códigos) de los colores/vinilos escogidos: si luego se corrige la biblioteca, las fichas ya hechas no cambian solas.

export const COL_FICHA = "ficha_inicio";
export const COL_COLORES = "ficha_colores";
export const COL_VINILOS = "ficha_vinilos";
export const MAX_COLORES = 200;

// (2026-11-22, a pedido de Fredy) Pasan a 10: «Montar pedido» va después de la Ficha técnica y se marca SOLO (la referencia ya aparece en un pedido de ATLAS).
// OJO: la ficha guarda a mano solo los pasos 0, 3 y 5 (por número); como el paso nuevo entra DESPUÉS de ellos, lo ya guardado no se corre.
export const PASOS_SEMAFORO = [
  "Hoja de vida", "Ficha de inicio", "Combinaciones", "Contramuestra", "Alertas de insumos",
  "Ficha técnica", "Montar pedido", "Explosión de materiales", "Tela en bodega", "Corte",
];
export const PASO_FICHA = 1; // índice del paso que se llena solo desde la ficha
export const PASO_COMBOS = 2; // (2026-11-26) «Combinaciones»: se pone solo según los colores que la ficha asignó a cada material de la prenda
export const PASO_MONTAR = 6; // se marca solo: la referencia ya está en un pedido
export const PASO_CORTE = 9;
export const PASOS_MANUALES = [0, 3, 5]; // se marcan a mano en la Fase 1; el resto se conectará en fases siguientes
export const TIPOS_VINILO = ["Vinilo", "DTF", "Sublimación", "Bordado", "Otro"];

export const idFicha = (preordenId, itemId) => `${preordenId}__${itemId}`;
export const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };

export const plano = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// «Normal (S,M,L,XL)» → [S,M,L,XL]; «Doble Talla (S/M - M/L)» → [S/M,M/L]; «Talla U» → [U]; «Plus» → [1XL,2XL,3XL]
export function tallasDeRango(rango) {
  const r = String(rango || "").trim();
  if (!r) return [];
  const m = r.match(/\(([^)]+)\)/);
  if (m) return m[1].split(/\s*[,\-–]\s*/).map((t) => t.trim()).filter(Boolean);
  if (/talla\s*u/i.test(r)) return ["U"];
  if (/plus/i.test(r)) return ["1XL", "2XL", "3XL"];
  return [];
}

// «8-10-12-14» → [8,10,12,14]
export function parseCurva(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return [];
  return t.split(/\s*[-–,;\/ ]\s*/).filter((x) => x !== "").map((x) => num(x));
}

// Reparte `total` en las tallas según las proporciones de la curva (el que tiene más decimales recibe el sobrante) → { talla: cantidad }
export function distribuirPorTalla(curva, total, tallas) {
  const out = {};
  const lista = tallas || [];
  const suma = lista.reduce((s, t) => s + Math.max(0, num((curva || {})[t])), 0);
  const tot = Math.max(0, Math.round(num(total)));
  lista.forEach((t) => { out[t] = 0; });
  if (!suma || !tot) return out;
  let base = 0;
  const resto = [];
  lista.forEach((t) => {
    const x = (Math.max(0, num(curva[t])) / suma) * tot;
    out[t] = Math.floor(x);
    base += out[t];
    resto.push([t, x - Math.floor(x)]);
  });
  resto.sort((a, b) => b[1] - a[1]);
  for (let k = 0; k < tot - base; k++) out[resto[k % resto.length][0]] += 1;
  return out;
}


// Ficha nueva, precargada con lo que ya dice la preorden (así casi no hay que escribir)
export function fichaNueva(item, preorden) {
  const it = item || {};
  const tallas = tallasDeRango(it.rango);
  const mkPais = (curvaTxt, cant) => {
    const arr = parseCurva(curvaTxt);
    const curva = {};
    if (arr.length && arr.length === tallas.length) tallas.forEach((t, i) => { curva[t] = arr[i]; });
    return { curva, cant: Math.round(num(cant)) };
  };
  return {
    preordenId: (preorden || {}).id || "",
    itemId: it.itemId || "",
    referencia: it.referencia || "",
    clientes: (preorden || {}).cliente ? [preorden.cliente] : [],
    datos: { categoria: it.categoria || "", silueta: it.silueta || "", linea: it.lineaBusint || it.tipo || "", tela: it.tela || "" },
    gama: it.rango || "",
    tallas,
    colores: [],
    vinilos: [],
    sinVinilos: false,
    pais: { CO: mkPais(it.colombiaCurva, it.colombiaCantidad), VE: mkPais(it.venezuelaCurva, it.venezuelaCantidad) },
    pasos: {},
    listo: false,
    base: null,
  };
}

// Mezcla lo guardado con una ficha nueva (por si faltan campos en documentos viejos)
export function completarFicha(guardada, item, preorden) {
  const n = fichaNueva(item, preorden);
  const g = guardada || {};
  return {
    ...n, ...g,
    datos: { ...n.datos, ...(g.datos || {}) },
    pais: { CO: { ...n.pais.CO, ...((g.pais || {}).CO || {}) }, VE: { ...n.pais.VE, ...((g.pais || {}).VE || {}) } },
    clientes: g.clientes || n.clientes, tallas: g.tallas || n.tallas, colores: g.colores || [], vinilos: g.vinilos || [], pasos: g.pasos || {},
  };
}

export const totalPreorden = (item) => Math.round(num((item || {}).colombiaCantidad)) + Math.round(num((item || {}).venezuelaCantidad));
export const totalFicha = (f) => Math.round(num((f.pais.CO || {}).cant)) + Math.round(num((f.pais.VE || {}).cant));

// ¿La ficha ya estaba lista y la preorden cambió las cantidades después?
export function fichaPorRevisar(f, item) {
  if (!f || !f.listo) return false;
  const b = f.base || {};
  return Math.round(num(item.colombiaCantidad)) !== Math.round(num(b.co)) || Math.round(num(item.venezuelaCantidad)) !== Math.round(num(b.ve));
}

// Qué falta en cada paso del asistente (vacío = listo para seguir)
export const NOMBRES_ASISTENTE = ["Cliente(s)", "Referencia", "Tallas", "Colores", "Vinilos", "Curva y cantidades", "Resumen"];
// ctx (opcional, 2026-11-26): { exigirDibujo, tieneDibujo } → el paso Colores pide el dibujo plano de la referencia y que cada color de la prenda tenga sus materiales.
export function faltantesPaso(f, paso, item, ctx) {
  const m = [];
  if (paso === 0 && !f.clientes.length) m.push("elige al menos un cliente");
  if (paso === 1 && (!f.datos.categoria || !f.datos.tela)) m.push("completa categoría y tela");
  if (paso === 2 && !f.tallas.length) m.push("elige las tallas");
  if (paso === 3 && ctx && ctx.exigirDibujo) {
    if (!ctx.tieneDibujo) m.push("sube el dibujo plano de la referencia (sin él no se pueden asignar los materiales)");
    else {
      const e = estadoCombinaciones(f);
      if (e === 0) m.push("agrega al menos un color de la prenda");
      else if (e === 1) m.push("a algún color le falta un material: completa todos");
    }
  } else if (paso === 3 && !f.colores.length) m.push("elige al menos un color");
  if (paso === 4 && !f.vinilos.length && !f.sinVinilos) m.push("elige los vinilos o marca «No lleva vinilos»");
  if (paso === 5) {
    if (!f.tallas.every((t) => num(f.pais.CO.curva[t]) > 0 || num(f.pais.VE.curva[t]) > 0)) m.push("falta la curva de alguna talla");
    if (totalFicha(f) !== totalPreorden(item)) m.push(`las cantidades (${totalFicha(f)}) no cuadran con la preorden (${totalPreorden(item)})`);
  }
  return m;
}
export const fichaCompleta = (f, item, ctx) => [0, 1, 2, 3, 4, 5].every((i) => !faltantesPaso(f, i, item, ctx).length);

// (2026-11-26) Combinaciones: f.combinaciones = { activos:[0,1,2], filas:[{ id, m:[color|null, color|null, color|null] }] }; «activos» son los materiales que el
// detector encontró en el dibujo plano (0 = Material 1 blanco, 1 = Material 2 lila, 2 = Material 3 gris). 0 sin filas · 1 incompleta · 2 todas completas.
export function estadoCombinaciones(f) {
  const c = (f || {}).combinaciones;
  const filas = (c && c.filas) || [];
  if (!filas.length) return 0;
  const activos = (c.activos && c.activos.length ? c.activos : [0]);
  const completa = (fila) => activos.every((i) => !!((fila.m || [])[i] && fila.m[i].id));
  return filas.every(completa) ? 2 : 1;
}

// 0 pendiente · 1 en proceso (o por revisar) · 2 listo
export function estadoPasoFicha(f, item) {
  if (!f) return 0;
  if (f.listo) return fichaPorRevisar(f, item) ? 1 : 2;
  // «En proceso» solo cuando alguien ya la abrió y guardó (las cantidades precargadas desde la preorden no cuentan)
  const algo = (f.colores || []).length || (f.vinilos || []).length || f.guardada;
  return algo ? 1 : 0;
}

// Estado de los 9 pasos de una referencia: { estados:[0..8], porRevisar }
// montada = la referencia ya aparece en un pedido de ATLAS (paso «Montar pedido», automático)
export function pasosDeReferencia(f, item, montada) {
  const estados = PASOS_SEMAFORO.map((_, i) => num(((f || {}).pasos || {})[i]));
  estados[PASO_FICHA] = estadoPasoFicha(f, item);
  { const ec = estadoCombinaciones(f); if (ec) estados[PASO_COMBOS] = ec; }
  estados[PASO_MONTAR] = montada ? 2 : 0;
  return { estados, porRevisar: fichaPorRevisar(f, item) };
}
// Primer paso (antes del corte) que todavía no está hecho; -1 si ya están los 9 anteriores al corte
export const siguientePaso = (estados) => { for (let i = 0; i < PASO_CORTE; i++) if (num((estados || [])[i]) !== 2) return i; return -1; };
export const pasosHechos = (estados) => (estados || []).filter((e) => num(e) === 2).length;

export function resumenSemaforo(items, fichasPorItem) {
  let listas = 0, porRevisar = 0;
  (items || []).forEach((it) => {
    const f = fichasPorItem[it.itemId];
    const e = pasosDeReferencia(f, it);
    if (e.estados[PASO_FICHA] === 2) listas += 1;
    if (e.porRevisar) porRevisar += 1;
  });
  return { total: (items || []).length, listas, porRevisar };
}

// ───────────────── Maestro de colores sincronizado con Busint (2026-11-25, para el avatar de la prenda) ─────────────────
// El CÓDIGO de Busint es la llave (el nombre no sirve: Busint tiene nombres repetidos con códigos distintos y los corta a 15-20 letras).
// Cada color guarda además su Pantone y el hex (color en pantalla) con el que se pinta el avatar.
export const esHex = (s) => /^#?[0-9a-f]{6}$/i.test(String(s || "").trim());
export const normHex = (s) => (esHex(s) ? `#${String(s).trim().replace("#", "").toUpperCase()}` : "");
export const normCod = (s) => String(s == null ? "" : s).trim(); // texto: conserva el cero inicial (042)
export const esCombinado = (nombre) => /\//.test(String(nombre || "")); // NEGRO/BLANCO, LILA/ROSADO…

// Pegar varios colores desde Excel: «nombre ; cód. proveedor ; cód. Busint ; #hex ; pantone» (o separados por tabulador / barra) por línea
export function parsearColoresPegados(texto, existentes) {
  const lista = existentes || [];
  const nombres = new Set(lista.map((c) => plano(c.nombre)));
  const codigos = new Set(lista.map((c) => normCod(c.codBusint)).filter(Boolean));
  const nuevos = [], repetidos = [];
  String(texto || "").split(/\r?\n/).forEach((linea) => {
    const l = linea.trim();
    if (!l) return;
    const partes = l.split(/\t|;|\|/).map((x) => x.trim());
    const nombre = partes[0];
    if (!nombre) return;
    const cod = normCod(partes[2]);
    // con código de Busint la llave es el código; sin código, el nombre
    if (cod ? codigos.has(cod) : nombres.has(plano(nombre))) { repetidos.push(nombre); return; }
    if (cod) codigos.add(cod); else nombres.add(plano(nombre));
    const c = { nombre, codProveedor: partes[1] || "", codBusint: cod };
    const hex = normHex(partes[3]);
    if (hex) c.hex = hex;
    if (partes[4]) c.pantone = partes[4];
    nuevos.push(c);
  });
  return { nuevos, repetidos };
}

// Lee las filas (matriz) de la hoja del informe de Busint «Colores»: en cada fila busca «Sí/No» (activo), el código (solo dígitos) y el nombre.
export function leerInformeBusintColores(filas) {
  const colores = [], vistos = new Set();
  (filas || []).forEach((fila) => {
    const celdas = (fila || []).map((x) => (x == null ? "" : String(x).trim()));
    const k = celdas.findIndex((x) => ["si", "no"].includes(plano(x)));
    if (k < 0) return;
    const previas = celdas.slice(0, k).filter(Boolean);
    const cod = previas.find((x) => /^\d{1,6}$/.test(x));
    if (!cod || vistos.has(cod)) return;
    const nombre = previas.find((x) => x !== cod) || "";
    vistos.add(cod);
    colores.push({ cod, nombre: nombre.replace(/\s+/g, " "), activo: plano(celdas[k]) === "si" });
  });
  return colores;
}

// Compara la biblioteca con el informe de Busint y dice qué haría (no escribe nada).
export function planSincronizacion(existentes, informe) {
  const ex = existentes || [];
  const porCod = new Map(), libresPorNombre = new Map();
  ex.forEach((c) => { const k = normCod(c.codBusint); if (k) porCod.set(k, c); });
  ex.forEach((c) => { if (!normCod(c.codBusint) || !informe.some((b) => b.cod === normCod(c.codBusint))) { const n = plano(c.nombre); if (!libresPorNombre.has(n)) libresPorNombre.set(n, c); } });
  const activos = informe.filter((b) => b.activo);
  const cuenta = {};
  activos.forEach((b) => { const n = plano(b.nombre); if (n) cuenta[n] = (cuenta[n] || 0) + 1; });
  const plan = { nuevos: [], unidos: [], vinculados: 0, porMarcar: [], inactivosNoCargados: 0, inactivosMarcados: [], huerfanos: [], sinNombre: [], repetidos: [], combinados: 0, total: informe.length, activos: activos.length };
  const usados = new Set();
  informe.forEach((b) => {
    const enBiblio = porCod.get(b.cod);
    if (!b.activo) {
      if (enBiblio) plan.inactivosMarcados.push({ ex: enBiblio, cod: b.cod, nombre: b.nombre });
      else plan.inactivosNoCargados += 1;
      return;
    }
    if (enBiblio) {
      usados.add(enBiblio.id); plan.vinculados += 1;
      if (!(enBiblio.busintSync && enBiblio.nombreBusint === b.nombre && enBiblio.activoBusint !== false)) plan.porMarcar.push({ ex: enBiblio, cod: b.cod, nombre: b.nombre });
      return;
    }
    const porNombre = b.nombre ? libresPorNombre.get(plano(b.nombre)) : null;
    if (porNombre && !usados.has(porNombre.id)) {
      usados.add(porNombre.id);
      plan.unidos.push({ ex: porNombre, cod: b.cod, nombre: b.nombre, antes: normCod(porNombre.codBusint) });
      return;
    }
    const rep = !!b.nombre && cuenta[plano(b.nombre)] > 1, comb = esCombinado(b.nombre);
    if (!b.nombre) plan.sinNombre.push(b.cod);
    if (rep) plan.repetidos.push(b.nombre);
    if (comb) plan.combinados += 1;
    plan.nuevos.push({ cod: b.cod, nombre: b.nombre || `(sin nombre) ${b.cod}`, nombreBusint: b.nombre, repetido: rep, combinado: comb });
  });
  // colores de la biblioteca con un código que no existe en Busint y que tampoco se unieron
  ex.forEach((c) => { const k = normCod(c.codBusint); if (k && !informe.some((b) => b.cod === k) && !usados.has(c.id)) plan.huerfanos.push({ ex: c, cod: k }); });
  plan.repetidos = [...new Set(plan.repetidos.map(plano))];
  return plan;
}

// Estado de un color de la biblioteca: «busint» (sincronizado), «solo» (solo ATLAS), «inactivo» (Busint lo dio de baja)
export function estadoColor(c) { return c && c.activoBusint === false ? "inactivo" : (c && c.busintSync ? "busint" : "solo"); }
export function colorSePuedePintar(c) { return !!(c && esHex(c.hex)); }

export function snapshotColor(c) { return { id: c.id, nombre: c.nombre || "", codProveedor: c.codProveedor || "", codBusint: c.codBusint || "", hex: c.hex || "", pantone: c.pantone || "" }; }
export function snapshotVinilo(v) { return { id: v.id, nombre: v.nombre || "", codigo: v.codigo || "", tipo: v.tipo || "" }; }

// ───────────────── Seguimiento del PEDIDO: las mismas 9 etapas + candado de corte ─────────────────
// (2026-11-22, a pedido de Fredy) El «Seguimiento del Pedido» pasó de 17 etapas a estas 9 (las mismas del semáforo). Un pedido NO puede salir a cortar
// (etapa 9) mientras no estén hechas las 8 anteriores; solo el administrador puede saltarse el candado dejando el motivo. Los pedidos que ya tienen corte
// no se bloquean. Las etapas guardan su casilla en pedido.seguimiento[clave]; las claves conservan el nombre viejo cuando ya existía (así no se pierde lo marcado).
// (2026-11-22) Ahora son 10 etapas: «Montar pedido» (se marca sola, el pedido ya está montado) entra después de la Ficha técnica. Las casillas se guardan por NOMBRE, así que lo ya marcado se conserva.
export const ETAPAS_PEDIDO = ["Hoja de Vida", "Ficha de inicio", "Combinaciones de vinilo", "Contramuestra", "Alertas de insumos", "Ficha Técnica", "Montar pedido", "Explosión de Materiales", "Tela en bodega", "Corte"];
export const ETAPA_CORTE = 9;
export const ETAPA_MONTAR = 6;
export const ETAPAS_DESDE_FICHA = [0, 1, 3, 5]; // las que salen solas del semáforo de las referencias (pasos manuales 1/4/6 y la ficha); el resto se marca a mano en el pedido

export const normRef = (r) => String(r || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Referencias de preórdenes APROBADAS que corresponden a este pedido: las vinculadas a su número, o (si no hay vinculación) la misma referencia del mismo cliente.
export function itemsDePedido(pedido, preordenes) {
  const numero = String((pedido || {}).numero || "").trim();
  const refs = new Set(((pedido || {}).referencias || []).map((r) => normRef(r.ref)).filter(Boolean));
  const cli = plano((pedido || {}).cliente);
  const porRef = new Map();
  (preordenes || []).forEach((p) => {
    if ((p.estado || "montada") !== "aprobada") return;
    (p.items || []).forEach((it) => {
      const v = it.pedidoVinculado;
      const vinculado = !!(v && numero && String(v.numero || "").trim() === numero);
      const deOtro = !!(v && !vinculado);
      const mismaRef = refs.has(normRef(it.referencia)) && plano(p.cliente) === cli;
      if (!vinculado && !(mismaRef && !deOtro)) return;
      const k = normRef(it.referencia);
      const nuevo = { preorden: p, item: it, vinculado, fecha: p.fechaCreado || "" };
      const previo = porRef.get(k);
      if (!previo || (nuevo.vinculado && !previo.vinculado) || (nuevo.vinculado === previo.vinculado && nuevo.fecha > previo.fecha)) porRef.set(k, nuevo);
    });
  });
  return [...porRef.values()].map(({ preorden, item }) => ({ preorden, item }));
}

// refsEstados: arreglo (uno por referencia enlazada) de los 9 estados (0/1/2) de cada una → qué etapas están hechas, cuáles son automáticas y si puede cortar
export function estadoEtapasPedido(pedido, refsEstados, yaCortado) {
  const seg = (pedido || {}).seguimiento || {};
  const refs = refsEstados || [];
  const auto = ETAPAS_PEDIDO.map((_, i) => i === ETAPA_MONTAR || (ETAPAS_DESDE_FICHA.includes(i) && refs.length > 0 && refs.every((e) => e[i] === 2)));
  // Con referencias enlazadas, las etapas que salen de la ficha SOLO dependen de ella (no se pueden marcar a mano en el pedido); sin enlace, se marcan a mano.
  // «Montar pedido» siempre es automática: si el pedido existe en ATLAS, ya está montado.
  const derivada = ETAPAS_PEDIDO.map((_, i) => i === ETAPA_MONTAR || (ETAPAS_DESDE_FICHA.includes(i) && refs.length > 0));
  const hechas = ETAPAS_PEDIDO.map((k, i) => (derivada[i] ? auto[i] : !!seg[k] || auto[i]));
  const faltan = [];
  for (let i = 0; i < ETAPA_CORTE; i++) if (!hechas[i]) faltan.push(i);
  const puedeCortar = faltan.length === 0;
  const siguiente = hechas.findIndex((h) => !h);
  return { hechas, auto, derivada, faltan, puedeCortar, corteLibre: puedeCortar || !!yaCortado, total: hechas.filter(Boolean).length, siguiente };
}

// Evalúa UN pedido con la misma regla en todas partes (Seguimiento del Pedido, tablero de viabilidad y aviso de Corte):
// referencias enlazadas → estados de sus 10 pasos → etapas del pedido y si puede salir a cortar.
// fichasPorId: { "<preordenId>__<itemId>": ficha guardada }
export function evaluarPedido(pedido, preordenes, fichasPorId, yaCortado) {
  const enlaces = itemsDePedido(pedido, preordenes);
  const refs = enlaces.map(({ preorden, item }) => {
    const f = completarFicha((fichasPorId || {})[idFicha(preorden.id, item.itemId)], item, preorden);
    const r = pasosDeReferencia(f, item, true);
    return { preorden, item, ficha: f, estados: r.estados, porRevisar: r.porRevisar };
  });
  const est = estadoEtapasPedido(pedido, refs.map((r) => r.estados), yaCortado);
  return { enlaces, refs, est };
}

// Pedido al que pertenece cada referencia de las preórdenes aprobadas: { "<preordenId>|<itemId>": pedido } (el más reciente gana si hay varios)
export function pedidoPorReferencia(pedidos, preordenes) {
  const m = {};
  (pedidos || []).forEach((p) => {
    itemsDePedido(p, preordenes).forEach(({ preorden, item }) => {
      const k = `${preorden.id}|${item.itemId}`;
      if (!m[k]) m[k] = p;
    });
  });
  return m;
}

// ───────────────── Carta de colores (Excel con código de Busint, hex y Pantone) ─────────────────
// (2026-11-26, a pedido de Fredy) Sube el hex y el Pantone de los colores YA sincronizados con Busint. Cruza por el código de Busint (004 = 4 = 04),
// llena solo lo que está vacío (si ya había otro dato avisa y no lo pisa, salvo que se pida) y dice qué no encontró.
const normCodNum = (c) => normCod(c).replace(/^0+(?=\d)/, "");
const esPantone = (s) => /^\d{2}-\d{4}\s*(TCX|TPX|TPG|TN|C|U)?$/i.test(String(s || "").trim());

export function leerCartaColores(filas) {
  const lista = (filas || []).filter((r) => Array.isArray(r) && r.some((c) => String(c == null ? "" : c).trim() !== ""));
  const txt = (v) => String(v == null ? "" : v).trim();
  const primera = lista[0] || [];
  const iHex = primera.findIndex((c) => /^\s*(hex|color en pantalla)\b/i.test(txt(c)));
  const iPan = primera.findIndex((c) => /pantone/i.test(txt(c)));
  const iCod = primera.findIndex((c) => /^\s*(c[oó]d(igo|\.)?\s*(de\s*)?busint|c[oó]d(igo|\.)?)\s*$/i.test(txt(c)));
  const iNom = primera.findIndex((c) => /^\s*(nombre|color)\s*$/i.test(txt(c)));
  const conEncabezado = [iHex, iPan, iCod, iNom].filter((i) => i >= 0).length >= 2;
  const cuerpo = conEncabezado ? lista.slice(1) : lista;
  const out = [], invalidos = [];
  cuerpo.forEach((r) => {
    let cod = "", nombre = "", hex = "", pantone = "";
    if (conEncabezado) {
      cod = iCod >= 0 ? txt(r[iCod]) : ""; nombre = iNom >= 0 ? txt(r[iNom]) : ""; hex = iHex >= 0 ? txt(r[iHex]) : ""; pantone = iPan >= 0 ? txt(r[iPan]) : "";
    } else {
      r.map(txt).filter(Boolean).forEach((c) => {
        if (/^#[0-9a-f]{3,8}$/i.test(c) || (/^[0-9a-f]{6}$/i.test(c) && /[a-f]/i.test(c))) hex = hex || c;
        else if (esPantone(c)) pantone = pantone || c;
        else if (/^\d{1,5}$/.test(c)) cod = cod || c;
        else nombre = nombre || c;
      });
    }
    if (!cod && !nombre) return;
    if (hex && !esHex(hex)) { invalidos.push({ cod, nombre, hex }); return; }
    if (!hex && !pantone) return; // solo código y nombre: no trae nada que cargar
    out.push({ cod, nombre, hex: normHex(hex), pantone });
  });
  return { conEncabezado, filas: out, invalidos };
}

export function planCartaColores(existentes, filas, opciones) {
  const pisar = !!(opciones && opciones.pisar);
  const ex = existentes || [];
  const porCod = new Map();
  ex.forEach((c) => { const k = normCodNum(c.codBusint); if (k && !porCod.has(k)) porCod.set(k, c); });
  const porNombre = new Map();
  ex.forEach((c) => { const k = plano(c.nombre); if (k && !porNombre.has(k)) porNombre.set(k, c); });
  const vistos = new Set();
  const actualizar = [], avisos = [], sinCoincidencia = [];
  let repetidosArchivo = 0;
  (filas || []).forEach((fila) => {
    const k = normCodNum(fila.cod) || `n:${plano(fila.nombre)}`;
    if (vistos.has(k)) { repetidosArchivo += 1; return; }
    vistos.add(k);
    const c = normCodNum(fila.cod) ? porCod.get(normCodNum(fila.cod)) : porNombre.get(plano(fila.nombre));
    if (!c) { sinCoincidencia.push({ cod: fila.cod, nombre: fila.nombre }); return; }
    const datos = {};
    if (fila.hex) {
      const actual = normHex(c.hex);
      if (!actual) datos.hex = fila.hex;
      else if (actual !== fila.hex) { if (pisar) datos.hex = fila.hex; else avisos.push({ ex: c, campo: "hex", actual: c.hex, nuevo: fila.hex }); }
    }
    if (fila.pantone) {
      const actual = String(c.pantone || "").trim();
      if (!actual) datos.pantone = fila.pantone;
      else if (plano(actual) !== plano(fila.pantone)) { if (pisar) datos.pantone = fila.pantone; else avisos.push({ ex: c, campo: "pantone", actual, nuevo: fila.pantone }); }
    }
    if (Object.keys(datos).length) actualizar.push({ ex: c, datos });
  });
  return { actualizar, avisos, sinCoincidencia, repetidosArchivo };
}
