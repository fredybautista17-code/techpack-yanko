// ─── TABLERO DE COSTOS — CÁLCULOS (sin pantalla) ──────────────────────────────
// (2026-10-26, a pedido de Fredy) Cotizado frente a real: para cada cotización cuya última versión
// aprobada tiene costos reales (`version.real.v`, los que ajusta Contabilidad al dar por cumplido), compara
// el precio aprobado (fijo) con el que daría con los costos reales y el mismo margen. Es la misma cuenta del
// Cotizador (resumenCostosReales / renegociacionDe), repetida aquí para no depender de su pantalla.
import { calcularCotizacion } from "./cotizador-calculo";

const UMBRAL_BASE = 0.03;
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

// Subida que activa el aviso «Para renegociar» para un cliente (campo umbralRenegociar de su ficha, decimal 0,03).
export function umbralDeCliente(parametros, cliente) {
  const n = norm(cliente);
  const ficha = (parametros || []).find((p) => norm(p.nombre) === n) || (parametros || []).find((p) => p.id === "general");
  const u = Number(String(ficha?.umbralRenegociar ?? "").replace(",", "."));
  return Number.isFinite(u) && u > 0 ? u : UMBRAL_BASE;
}

const precioAprobadoDe = (c, v) => Number(v?.precio) || (c?.precioAplicado && c.precioAplicado.version === v?.numero ? Number(c.precioAplicado.valor) : 0) || 0;

// Una fila por cotización con costos reales, la que más sube primero.
export function cotizadoVsReal(cotizaciones, parametros) {
  const filas = [];
  (cotizaciones || []).forEach((c) => {
    const aprobadas = (c.versiones || []).filter((v) => v.estado === "aprobada");
    const v = aprobadas[aprobadas.length - 1];
    if (!v || !v.real?.v) return;
    const fijo = precioAprobadoDe(c, v);
    if (!(fijo > 0)) return;
    let k;
    try { k = calcularCotizacion(v.real.v); } catch (e) { return; }
    const iva = k.escMargen.precioSinIva > 0 ? k.escMargen.precioConIva / k.escMargen.precioSinIva - 1 : 0.19;
    const sinIva = fijo / (1 + iva);
    const nuevo = k.precioAplicar;
    const pct = (nuevo - fijo) / fijo;
    const umbral = umbralDeCliente(parametros, c.cliente);
    const utilidad = sinIva - k.costoFull;
    filas.push({
      id: c.id,
      cliente: c.cliente || "",
      referencia: c.referencia || "",
      version: v.numero,
      fijo,
      nuevo,
      dif: nuevo - fijo,
      pct,
      umbral,
      margenReal: sinIva > 0 ? utilidad / sinIva : 0,
      revisada: !!v.real.revisada,
      supera: pct >= umbral && !v.real.revisada,
    });
  });
  return filas.sort((a, b) => b.pct - a.pct);
}

// Resumen de un área en un mes y en lo corrido del año (hasta ese mes).
// datosArea: { meses: { 1: { valor, costo, fuente, ... }, ... } }
export function resumenAreaMes(datosArea, mes) {
  const meses = datosArea?.meses || {};
  const m = meses[mes] || null;
  let valorAnio = 0;
  let costoAnio = 0;
  for (let i = 1; i <= mes; i++) {
    if (meses[i]) { valorAnio += meses[i].valor; costoAnio += meses[i].costo; }
  }
  return {
    mes: m ? { valor: m.valor, costo: m.costo, resultado: m.valor - m.costo, cobertura: m.costo > 0 ? (m.valor / m.costo) * 100 : null, fuente: m.fuente } : null,
    anio: { valor: valorAnio, costo: costoAnio, resultado: valorAnio - costoAnio, cobertura: costoAnio > 0 ? (valorAnio / costoAnio) * 100 : null },
  };
}
