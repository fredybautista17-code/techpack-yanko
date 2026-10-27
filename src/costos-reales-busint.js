// ─── COSTOS REALES DESDE BUSINT (sin React) ──────────────────────────────────
// (2026-10-26, a pedido de Fredy) "Ajustar costos reales" del Cotizador se
// precarga con el informe de Gerencia de Busint "Histórico de lote": por cada
// concepto (tela, insumo, mano de obra) lo REAL que costó el lote. Aquí vive
// el cálculo puro (emparejar conceptos de Busint con las líneas de la
// cotización y armar la copia de costos reales); la ventana está en
// costos-reales-busint-vista.jsx.
//
// Reglas:
//  - Costo real por prenda de un concepto = Real del lote ÷ prendas cortadas
//    (así lo calcula el informe de Busint y Dado por Cumplido).
//  - Tela: se conserva el consumo y se ajusta el precio por kilo para que el
//    costo por prenda sea EXACTAMENTE el real. Insumo: igual con el precio.
//    Proceso: el valor es el costo real por prenda.
//  - Lo que Busint trae y la cotización no tiene se agrega como línea nueva
//    (o se ignora, a elección). Lo que la cotización tiene y Busint no trae
//    para ese lote se pone en $0 (o se deja como estaba) y se avisa.
import { num, calcularCotizacion } from "./cotizador-calculo";

export function normConcepto(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
const sinMdeo = (n) => n.replace(/^MDEO\s+/, "");
const PROCESO_RE = /MDEO|TERMINACION|CONFECCION|CORTE|VINILO|ESPIGA|DTF|ESTAMP|SUBLIM|BORDAD|DESCARTON|APLIQUE|LAVAD|PLANCH|ADICIONAL|EMPAQUE|SERVICIO/;
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

// 0-100: qué tan parecido es el nombre del concepto de Busint al de una línea.
function puntaje(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const min = Math.min(a.length, b.length);
  if (min >= 5 && (a.startsWith(b + " ") || b.startsWith(a + " "))) return 85;
  const ta = new Set(a.split(" ").filter((t) => t.length > 1));
  const tb = new Set(b.split(" ").filter((t) => t.length > 1));
  const comunes = [...ta].filter((t) => tb.has(t)).length;
  const menor = Math.min(ta.size, tb.size);
  if (comunes >= 2 && menor > 0 && comunes / menor >= 0.6) return 60 + Math.round((comunes / menor) * 10);
  return 0;
}

// Una asignación por concepto de Busint:
// { tipo: "tela"|"insumo"|"proceso"|"nuevo_insumo"|"nuevo_proceso"|"ignorar", idx, puntaje }
export function sugerirAsignaciones(conceptos, v) {
  const candidatos = [];
  (v.telas || []).forEach((t, idx) => candidatos.push({ tipo: "tela", idx, norm: normConcepto(t.material) }));
  (v.insumos || []).forEach((t, idx) => candidatos.push({ tipo: "insumo", idx, norm: normConcepto(t.nombre) }));
  (v.procesos || []).forEach((t, idx) => candidatos.push({ tipo: "proceso", idx, norm: normConcepto(t.nombre) }));
  const usados = new Set();
  const orden = conceptos.map((c, i) => i).sort((a, b) => Math.abs(conceptos[b].real) - Math.abs(conceptos[a].real));
  const salida = new Array(conceptos.length);
  orden.forEach((i) => {
    const c = conceptos[i];
    const n = normConcepto(c.concepto);
    const esMdeo = /^MDEO\b/.test(n);
    let mejor = null;
    candidatos.forEach((cand) => {
      if (usados.has(`${cand.tipo}:${cand.idx}`)) return;
      if (esMdeo && cand.tipo !== "proceso") return;
      // Si el servidor ya dijo de qué tabla viene el concepto (tela / insumo / proceso), solo se empareja con líneas del mismo tipo.
      if (c.origen && cand.tipo !== c.origen) return;
      const p = Math.max(puntaje(n, cand.norm), esMdeo ? puntaje(sinMdeo(n), cand.norm) : 0);
      if (p < 60) return;
      if (!mejor || p > mejor.puntaje) mejor = { tipo: cand.tipo, idx: cand.idx, puntaje: p };
    });
    if (mejor) {
      usados.add(`${mejor.tipo}:${mejor.idx}`);
      salida[i] = mejor;
    } else if (!(Math.abs(c.real) > 0) && !(Math.abs(c.teorico) > 0)) {
      salida[i] = { tipo: "ignorar", idx: null, puntaje: 0 };
    } else {
      const esProceso = c.origen ? c.origen === "proceso" : PROCESO_RE.test(n);
      salida[i] = { tipo: esProceso ? "nuevo_proceso" : "nuevo_insumo", idx: null, puntaje: 0 };
    }
  });
  return salida;
}

// Costo por prenda que hoy tiene una línea de la cotización.
export function costoPrendaDeLinea(v, tipo, idx) {
  const k = calcularCotizacion(v);
  if (tipo === "tela") return k.telas[idx]?.porPrenda ?? 0;
  if (tipo === "insumo") return k.insumos[idx]?.porPrenda ?? 0;
  if (tipo === "proceso") return num(v.procesos?.[idx]?.valor);
  return 0;
}

// Arma la copia de costos reales. `asignaciones[i]` corresponde a `conceptos[i]`.
export function aplicarCostosReales({ v, conceptos, asignaciones, cantCortada, lote, quitarImprevistos, ponerEnCeroSinDato }) {
  const cant = Number(cantCortada) || 0;
  if (!(cant > 0)) throw new Error("Falta la cantidad cortada del lote para sacar el costo por prenda.");
  const nuevo = JSON.parse(JSON.stringify(v));
  nuevo.telas = nuevo.telas || [];
  nuevo.insumos = nuevo.insumos || [];
  nuevo.procesos = nuevo.procesos || [];
  const marca = (c, pp) => ({ lote: String(lote), concepto: c.concepto, real: c.real, porPrenda: pp });
  // Suma por línea (si dos conceptos van a la misma línea, se suman).
  const acum = new Map();
  const nuevos = [];
  const detalle = [];
  conceptos.forEach((c, i) => {
    const a = asignaciones[i] || { tipo: "ignorar" };
    const pp = r2((Number(c.real) || 0) / cant);
    if (a.tipo === "ignorar") { detalle.push({ concepto: c.concepto, destino: "No se usa", porPrenda: pp }); return; }
    if (a.tipo === "nuevo_insumo" || a.tipo === "nuevo_proceso") { nuevos.push({ c, pp, tipo: a.tipo }); return; }
    const k = `${a.tipo}:${a.idx}`;
    const e = acum.get(k) || { tipo: a.tipo, idx: a.idx, pp: 0, conceptos: [] };
    e.pp += pp; e.conceptos.push(c); acum.set(k, e);
  });
  acum.forEach((e) => {
    const c0 = e.conceptos[0];
    const marcaLinea = marca({ concepto: e.conceptos.map((c) => c.concepto).join(" + "), real: e.conceptos.reduce((s, c) => s + (Number(c.real) || 0), 0) }, r2(e.pp));
    if (e.tipo === "tela") {
      const t = nuevo.telas[e.idx];
      if (!t) return;
      const consumo = num(t.consumo) || 1;
      const rend = num(t.rendimiento) || 1;
      t.consumo = consumo;
      t.rendimiento = rend;
      t.precioKg = r4((e.pp * rend) / consumo);
      t.realBusint = marcaLinea;
      detalle.push({ concepto: c0.concepto, destino: `Tela: ${t.material}`, porPrenda: r2(e.pp) });
    } else if (e.tipo === "insumo") {
      const it = nuevo.insumos[e.idx];
      if (!it) return;
      const consumo = num(it.consumo) || 1;
      it.consumo = consumo;
      it.precio = r4(e.pp / consumo);
      it.realBusint = marcaLinea;
      detalle.push({ concepto: c0.concepto, destino: `Insumo: ${it.nombre}`, porPrenda: r2(e.pp) });
    } else {
      const p = nuevo.procesos[e.idx];
      if (!p) return;
      p.valor = r2(e.pp);
      p.realBusint = marcaLinea;
      detalle.push({ concepto: c0.concepto, destino: `Proceso: ${p.nombre}`, porPrenda: r2(e.pp) });
    }
  });
  nuevos.forEach(({ c, pp, tipo }) => {
    if (tipo === "nuevo_insumo") {
      nuevo.insumos.push({ nombre: c.concepto, codigo: "", precio: pp, consumo: 1, termo: false, realBusint: marca(c, pp) });
      detalle.push({ concepto: c.concepto, destino: "Insumo nuevo", porPrenda: pp });
    } else {
      nuevo.procesos.push({ nombre: c.concepto, valor: pp, imp: false, realBusint: marca(c, pp) });
      detalle.push({ concepto: c.concepto, destino: "Proceso nuevo", porPrenda: pp });
    }
  });
  if (quitarImprevistos) nuevo.tasas = { ...(nuevo.tasas || {}), imprevistos: 0 };
  // Líneas de la cotización que Busint no trajo para este lote: si tuvieron
  // costo en el estimado, en el lote real costaron $0 (el informe de Busint
  // trae todos los conceptos que se gastaron). Con `ponerEnCeroSinDato` se
  // dejan en cero y se avisa cuáles fueron; si no, quedan como estaban.
  const tocadas = new Set([...acum.keys()]);
  const sinDatoBusint = [];
  const poner0 = ponerEnCeroSinDato === true;
  const marca0 = { lote: String(lote), concepto: "(no aparece en Busint)", real: 0, porPrenda: 0 };
  nuevo.telas.forEach((t, i) => {
    if (tocadas.has(`tela:${i}`) || t.realBusint || !(num(t.consumo) > 0 && num(t.precioKg) > 0)) return;
    sinDatoBusint.push(`Tela: ${t.material}`);
    if (poner0) { t.precioKg = 0; t.realBusint = marca0; }
  });
  nuevo.insumos.forEach((t, i) => {
    if (tocadas.has(`insumo:${i}`) || t.realBusint || !(num(t.precio) > 0)) return;
    sinDatoBusint.push(`Insumo: ${t.nombre}`);
    if (poner0) { t.precio = 0; t.realBusint = marca0; }
  });
  nuevo.procesos.forEach((t, i) => {
    if (tocadas.has(`proceso:${i}`) || t.realBusint || !(num(t.valor) > 0)) return;
    sinDatoBusint.push(`Proceso: ${t.nombre}`);
    if (poner0) { t.valor = 0; t.realBusint = marca0; }
  });
  const costoDefinitivo = calcularCotizacion(nuevo).costoDefinitivo;
  const totalReal = conceptos.reduce((s, c, i) => s + ((asignaciones[i]?.tipo === "ignorar") ? 0 : (Number(c.real) || 0)), 0);
  return { v: nuevo, detalle, sinDatoBusint, costoDefinitivo, realPorPrenda: totalReal / cant };
}
