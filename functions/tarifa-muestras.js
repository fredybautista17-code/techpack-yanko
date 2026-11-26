// ─── Tarifa de muestras por prenda (tipo CIF) — cálculo en el SERVIDOR ───────────────────────────────────────────
// (2026-11-26, a pedido de Fredy: «que se autocalcule siempre».) Funciones puras (sin Firestore ni red). La función programada de index.js
// (calcularTarifaMuestrasDiaria / recalcularTarifaMuestrasAhora) lee los datos, llama a calcularTarifaAutomatica y escribe SOLO el número en
// cotizador_tarifas/muestras. Aquí van copiadas, con el mismo comportamiento, las reglas de src/muestras-calculo.js (costosDelMes) y de
// src/muestras-tarifa.js; la prueba src/tarifa-muestras-servidor.test.js comprueba que dan el mismo resultado: si cambias una, cambia la otra.

const SIN_TALLER = "(Sin taller)";
const ESTADOS_ENTREGADA = ["recibida", "aprobado", "modificar", "enviado", "terminada"];
const NUM = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const f10 = (v) => String(v || "").slice(0, 10);
const mesDe = (iso) => f10(iso).slice(0, 7);
const tallerDe = (c) => String(c.taller || "").trim() || SIN_TALLER;
const claveTexto = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function mesAnteriorDe(mes) {
  const [y, m] = String(mes).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Fecha en que cuenta una muestra como entregada por el taller (igual que fechaEntregaCosto del navegador). `hoy` = AAAA-MM-DD (hora de Colombia).
function fechaEntregaCosto(c, hoy) {
  const r0 = (c.revisiones || [])[0];
  const real = f10(c.fechaRecibida || (r0 && r0.fecha) || c.fechaRevision || "");
  if (real) return { fecha: real, estimada: false };
  if (ESTADOS_ENTREGADA.includes(c.estado || "")) {
    const f = f10(c.fechaEntrega || c.createdAt || c.fechaTerminada || "");
    if (f) return { fecha: f > hoy ? hoy : f, estimada: true };
  }
  return { fecha: "", estimada: false };
}

const conPrestaciones = (p, cfg) => (typeof p.conPrest === "boolean" ? p.conPrest : !!(cfg && cfg.prestacionesOn));
const pctDedicacion = (p) => (typeof p.pctMuestras === "number" && p.pctMuestras >= 0 ? p.pctMuestras : 100);
function costoPersona(p, cfg) {
  const pr = conPrestaciones(p, cfg) ? 1 + (Number(cfg && cfg.prestacionesPct) || 0) / 100 : 1;
  return Math.round((Number(p.sueldo) || 0) * pr * (pctDedicacion(p) / 100));
}
function modoDeTaller(cfg, nombreTaller, personal) {
  const c = (cfg.talleres || {})[claveTexto(nombreTaller)];
  if (c && (c.modo === "sueldos" || c.modo === "precio")) return c.modo;
  return (personal || []).some((p) => p.activa !== false && claveTexto(p.taller) === claveTexto(nombreTaller)) ? "sueldos" : "precio";
}

// Costo total de muestras de un mes (= costosDelMes(...).total del navegador)
function costoMesTotal(muestras, cfg, pagos, mes, hoy) {
  cfg = cfg || {};
  const personal = cfg.personal || [];
  const todas = (muestras || []).filter((c) => c && !c.eliminado);
  const terminadasMes = todas.map((c) => ({ c, ...fechaEntregaCosto(c, hoy) })).filter((x) => mesDe(x.fecha) === mes);
  const nombres = new Map();
  terminadasMes.forEach(({ c }) => nombres.set(claveTexto(tallerDe(c)), tallerDe(c)));
  personal.forEach((p) => { if (p.taller) nombres.set(claveTexto(p.taller), p.taller); });
  Object.values(cfg.talleres || {}).forEach((t) => { if (t && t.nombre) nombres.set(claveTexto(t.nombre), t.nombre); });
  Object.keys((cfg.presupuestos || {})[mes] || {}).forEach((k) => { if (!nombres.has(k)) nombres.set(k, (cfg.talleres && cfg.talleres[k] && cfg.talleres[k].nombre) || k); });
  let total = 0;
  [...nombres.values()].forEach((nombre) => {
    const clave = claveTexto(nombre);
    const modo = modoDeTaller(cfg, nombre, personal);
    if (modo === "sueldos") {
      total += personal.filter((p) => p.activa !== false && claveTexto(p.taller) === clave).reduce((s, p) => s + costoPersona(p, cfg), 0);
    } else {
      const precio = Number((cfg.talleres || {})[clave] && (cfg.talleres || {})[clave].precio) || 0;
      terminadasMes.filter((x) => claveTexto(tallerDe(x.c)) === clave).forEach(({ c }) => {
        const p = (pagos || {})[c.id] || {};
        total += typeof p.valor === "number" ? p.valor : precio;
      });
    }
  });
  return total;
}

// Unidades cortadas por mes a partir de pedidos_activos[].cortesRealizados[]
function prendasCortadasPorMes(pedidos) {
  const por = {};
  (pedidos || []).forEach((p) => ((p && p.cortesRealizados) || []).forEach((c) => {
    const mes = String((c && c.fecha) || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    const u = NUM(c.totalUnidades) || (c.refs || []).reduce((s, r) => s + NUM(r && r.total), 0);
    if (u > 0) por[mes] = (por[mes] || 0) + u;
  }));
  return por;
}

// base: «prom3» = promedio de los últimos 3 meses CERRADOS (suma de costos ÷ suma de prendas); «mes» = solo el último mes cerrado.
// El mes en curso nunca entra: así la tarifa no sube y baja mientras el mes está a medias.
function mesesDeBase(hoy, base) {
  const ultimo = mesAnteriorDe(String(hoy).slice(0, 7));
  return base === "mes" ? [ultimo] : [ultimo, mesAnteriorDe(ultimo), mesAnteriorDe(mesAnteriorDe(ultimo))];
}

function calcularTarifaAutomatica({ hoy, base, muestras, cfg, pagos, pedidos }) {
  const meses = mesesDeBase(hoy, base === "mes" ? "mes" : "prom3");
  const prendasPorMes = prendasCortadasPorMes(pedidos);
  const filas = meses.map((m) => ({ mes: m, costo: costoMesTotal(muestras, cfg, pagos, m, hoy), prendas: NUM(prendasPorMes[m]) }));
  const costo = filas.reduce((s, f) => s + f.costo, 0);
  const prendas = filas.reduce((s, f) => s + f.prendas, 0);
  const valor = costo > 0 && prendas > 0 ? Math.round(costo / prendas) : null;
  let aviso = "";
  if (!prendas) aviso = "No hay prendas cortadas en esos meses.";
  else if (!costo) aviso = "El costo de muestras de esos meses es $0.";
  return { base: base === "mes" ? "mes" : "prom3", meses, filas, costo, prendas, valor, aviso };
}

// Lo que se escribe en cotizador_tarifas/muestras: SOLO el número y su contexto (sin costos ni sueldos).
function documentoTarifaAutomatica(calculo, ahoraISO) {
  return {
    valorPorPrenda: calculo.valor,
    base: calculo.base,
    meses: calculo.meses,
    prendas: Math.round(calculo.prendas),
    automatica: true,
    calculadoEn: ahoraISO,
    aviso: "",
  };
}

module.exports = { costoMesTotal, prendasCortadasPorMes, mesesDeBase, calcularTarifaAutomatica, documentoTarifaAutomatica, mesAnteriorDe, fechaEntregaCosto };
