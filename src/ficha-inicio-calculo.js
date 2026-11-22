// ─── FICHA DE INICIO · lógica pura (sin Firebase ni React) ────────────────────────────────────────────────────
// (2026-11-22, a pedido de Fredy) Fase 1 de la Ficha de inicio del pedido: semáforo de 9 pasos por referencia de la preorden + asistente
// paso a paso + bibliotecas previas de colores y vinilos (se alistan antes y la ficha escoge de ahí).
// Colecciones: ficha_colores/{id}, ficha_vinilos/{id}, ficha_inicio/{preordenId}__{itemId}.
// La ficha guarda una COPIA (nombre y códigos) de los colores/vinilos escogidos: si luego se corrige la biblioteca, las fichas ya hechas no cambian solas.

export const COL_FICHA = "ficha_inicio";
export const COL_COLORES = "ficha_colores";
export const COL_VINILOS = "ficha_vinilos";
export const MAX_COLORES = 200;

export const PASOS_SEMAFORO = [
  "Hoja de vida", "Ficha de inicio", "Combinaciones de vinilo", "Contramuestra", "Alertas de insumos",
  "Ficha técnica", "Explosión de materiales", "Tela en bodega", "Corte",
];
export const PASO_FICHA = 1; // índice del paso que se llena solo desde la ficha
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
export function faltantesPaso(f, paso, item) {
  const m = [];
  if (paso === 0 && !f.clientes.length) m.push("elige al menos un cliente");
  if (paso === 1 && (!f.datos.categoria || !f.datos.tela)) m.push("completa categoría y tela");
  if (paso === 2 && !f.tallas.length) m.push("elige las tallas");
  if (paso === 3 && !f.colores.length) m.push("elige al menos un color");
  if (paso === 4 && !f.vinilos.length && !f.sinVinilos) m.push("elige los vinilos o marca «No lleva vinilos»");
  if (paso === 5) {
    if (!f.tallas.every((t) => num(f.pais.CO.curva[t]) > 0 || num(f.pais.VE.curva[t]) > 0)) m.push("falta la curva de alguna talla");
    if (totalFicha(f) !== totalPreorden(item)) m.push(`las cantidades (${totalFicha(f)}) no cuadran con la preorden (${totalPreorden(item)})`);
  }
  return m;
}
export const fichaCompleta = (f, item) => [0, 1, 2, 3, 4, 5].every((i) => !faltantesPaso(f, i, item).length);

// 0 pendiente · 1 en proceso (o por revisar) · 2 listo
export function estadoPasoFicha(f, item) {
  if (!f) return 0;
  if (f.listo) return fichaPorRevisar(f, item) ? 1 : 2;
  // «En proceso» solo cuando alguien ya la abrió y guardó (las cantidades precargadas desde la preorden no cuentan)
  const algo = (f.colores || []).length || (f.vinilos || []).length || f.guardada;
  return algo ? 1 : 0;
}

// Estado de los 9 pasos de una referencia: { estados:[0..8], porRevisar }
export function pasosDeReferencia(f, item) {
  const estados = PASOS_SEMAFORO.map((_, i) => num(((f || {}).pasos || {})[i]));
  estados[PASO_FICHA] = estadoPasoFicha(f, item);
  return { estados, porRevisar: fichaPorRevisar(f, item) };
}

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

// Pegar varios colores desde Excel: «nombre ; cód. proveedor ; cód. Busint» (o separados por tabulador / coma) por línea
export function parsearColoresPegados(texto, existentes) {
  const vistos = new Set((existentes || []).map((c) => plano(c.nombre)));
  const nuevos = [], repetidos = [];
  String(texto || "").split(/\r?\n/).forEach((linea) => {
    const l = linea.trim();
    if (!l) return;
    const partes = l.split(/\t|;|\|/).map((x) => x.trim());
    const nombre = partes[0];
    if (!nombre) return;
    if (vistos.has(plano(nombre))) { repetidos.push(nombre); return; }
    vistos.add(plano(nombre));
    nuevos.push({ nombre, codProveedor: partes[1] || "", codBusint: partes[2] || "" });
  });
  return { nuevos, repetidos };
}

export function snapshotColor(c) { return { id: c.id, nombre: c.nombre || "", codProveedor: c.codProveedor || "", codBusint: c.codBusint || "", hex: c.hex || "" }; }
export function snapshotVinilo(v) { return { id: v.id, nombre: v.nombre || "", codigo: v.codigo || "", tipo: v.tipo || "" }; }

// ───────────────── Seguimiento del PEDIDO: las mismas 9 etapas + candado de corte ─────────────────
// (2026-11-22, a pedido de Fredy) El «Seguimiento del Pedido» pasó de 17 etapas a estas 9 (las mismas del semáforo). Un pedido NO puede salir a cortar
// (etapa 9) mientras no estén hechas las 8 anteriores; solo el administrador puede saltarse el candado dejando el motivo. Los pedidos que ya tienen corte
// no se bloquean. Las etapas guardan su casilla en pedido.seguimiento[clave]; las claves conservan el nombre viejo cuando ya existía (así no se pierde lo marcado).
export const ETAPAS_PEDIDO = ["Hoja de Vida", "Ficha de inicio", "Combinaciones de vinilo", "Contramuestra", "Alertas de insumos", "Ficha Técnica", "Explosión de Materiales", "Tela en bodega", "Corte"];
export const ETAPA_CORTE = 8;
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
  const auto = ETAPAS_PEDIDO.map((_, i) => ETAPAS_DESDE_FICHA.includes(i) && refs.length > 0 && refs.every((e) => e[i] === 2));
  // Con referencias enlazadas, las etapas que salen de la ficha SOLO dependen de ella (no se pueden marcar a mano en el pedido); sin enlace, se marcan a mano
  const derivada = ETAPAS_PEDIDO.map((_, i) => ETAPAS_DESDE_FICHA.includes(i) && refs.length > 0);
  const hechas = ETAPAS_PEDIDO.map((k, i) => (derivada[i] ? auto[i] : !!seg[k] || auto[i]));
  const faltan = [];
  for (let i = 0; i < ETAPA_CORTE; i++) if (!hechas[i]) faltan.push(i);
  const puedeCortar = faltan.length === 0;
  const siguiente = hechas.findIndex((h) => !h);
  return { hechas, auto, derivada, faltan, puedeCortar, corteLibre: puedeCortar || !!yaCortado, total: hechas.filter(Boolean).length, siguiente };
}
