// (2026-11-07, a pedido de Fredy) Historial del año de MAQUILA: se pega o sube la tabla mensual (VENTAS, GASTOS, RESULTADO,
// AHORRO DE LIQUIDACIONES, UNIDADES SERVICIO, UNIDADES MAQUILA) y queda guardada por mes en `centro_costo_historico_maquila`
// (doc `{AREA}__{AAAA-MM}`). Los meses sin histórico se muestran en vivo con lo que se cargue en ATLAS.
// Funciones puras: sin Firestore ni React.
import { servicioDeVenta, SIN_SERVICIO } from "./ventas-entradas-calculo";

export const MESES_HIST = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const COLECCION_HISTORICO_MAQUILA = "centro_costo_historico_maquila";

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

// Número de una celda: acepta 72.995.384 (miles con punto), -9.697.879, $ 1.234, (1.234) = negativo, 1.234,50 y números ya numéricos.
// Devuelve NaN si no se reconoce; vacío o guion = 0.
export function numeroDeCelda(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let t = String(v).trim().replace(/[$\s]/g, "");
  if (t === "" || t === "-" || t === "–" || t === "—") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  let n;
  if (/^\d+(\.\d{3})*(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
  else if (/^\d+(,\d{3})*(\.\d+)?$/.test(t)) n = Number(t.replace(/,/g, ""));
  else n = NaN;
  return neg ? -n : n;
}

// Texto pegado desde Excel (tabulaciones) o escrito con espacios -> filas de celdas.
export function textoAFilas(texto) {
  return String(texto || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim())
    .map((l) => (l.includes("\t") ? l.split("\t").map((c) => c.trim()) : l.trim().split(/\s+/)));
}

function indiceDeMes(celda) {
  const t = sinTildes(celda);
  if (!t) return -1;
  if (t.startsWith("SETIEMBRE")) return 8;
  return MESES_HIST.findIndex((m) => t.startsWith(m));
}

// Filas de celdas -> un registro por mes encontrado. Solo avisa; no guarda nada.
// {mes (1-12), nombre, ventas, gastos, resultado, ahorro, unidadesServicio, unidadesMaquila, vacio, invalida, avisos[]}
export function parsearHistorial(filas) {
  const porMes = new Map();
  (filas || []).forEach((cells) => {
    if (!cells || !cells.length) return;
    const idx = indiceDeMes(cells[0]);
    if (idx < 0) return;
    const vals = cells.slice(1, 7).map(numeroDeCelda);
    const avisos = [];
    let invalida = false;
    if (vals.some((x) => Number.isNaN(x))) { avisos.push("Hay un valor que no se reconoce como número."); invalida = true; }
    while (vals.length < 6) vals.push(0);
    const [ventas, gastos, resultado, ahorro, uServ, uMaq] = vals.map((x) => (Number.isNaN(x) ? 0 : x));
    const vacio = [ventas, gastos, resultado, ahorro, uServ, uMaq].every((x) => x === 0);
    if (!vacio && cells.length < 4) { avisos.push("Faltan columnas."); invalida = true; }
    if (!vacio && Math.abs(ventas - gastos - resultado) > 1) {
      avisos.push(`El resultado no cuadra: ventas − gastos da ${Math.round(ventas - gastos).toLocaleString("es-CO")}.`);
    }
    if (porMes.has(idx + 1)) avisos.push("El mes viene repetido: se usa la última fila.");
    porMes.set(idx + 1, { mes: idx + 1, nombre: MESES_HIST[idx], ventas, gastos, resultado, ahorro, unidadesServicio: uServ, unidadesMaquila: uMaq, vacio, invalida, avisos });
  });
  return [...porMes.values()].sort((a, b) => a.mes - b.mes);
}

export const idHistorico = (area, anio, mes) => `${String(area).toUpperCase()}__${anio}-${String(mes).padStart(2, "0")}`;

export function docHistoricoMes(fila, { area, anio, usuario, ahora }) {
  return {
    id: idHistorico(area, anio, fila.mes),
    area: String(area).toUpperCase(),
    anio: Number(anio),
    mes: fila.mes,
    ventas: fila.ventas,
    gastos: fila.gastos,
    resultado: fila.resultado,
    ahorroLiquidaciones: fila.ahorro,
    unidadesServicio: fila.unidadesServicio,
    unidadesMaquila: fila.unidadesMaquila,
    origen: "historial_importado",
    cargadoPor: usuario || "",
    creadoEn: ahora,
  };
}

// Resumen del año: por mes, el histórico guardado o, si no hay, lo que hay en vivo (ventas y gastos cargados en ATLAS).
// En vivo las unidades salen de las ventas por servicio: MAQUILA = unidades de maquila; el resto de servicios = unidades de servicio;
// las ventas «Sin tipo» no se cuentan en ninguna (se avisan en sinTipo).
export function resumenAnual({ anio, area, historico, ventas, gastos }) {
  const A = String(area).toUpperCase();
  const hist = new Map();
  (historico || []).forEach((h) => { if (String(h.area).toUpperCase() === A && Number(h.anio) === Number(anio)) hist.set(Number(h.mes), h); });
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const pref = `${anio}-${String(m).padStart(2, "0")}`;
    const h = hist.get(m);
    if (h) {
      meses.push({ mes: m, fuente: "historico", ventas: h.ventas || 0, gastos: h.gastos || 0, resultado: h.resultado ?? (h.ventas || 0) - (h.gastos || 0), ahorro: h.ahorroLiquidaciones || 0, unidadesServicio: h.unidadesServicio || 0, unidadesMaquila: h.unidadesMaquila || 0, sinTipo: 0 });
      continue;
    }
    const vs = (ventas || []).filter((v) => String(v.area).toUpperCase() === A && String(v.fecha || "").slice(0, 7) === pref);
    const gs = (gastos || []).filter((g) => String(g.area).toUpperCase() === A && String(g.fecha || "").slice(0, 7) === pref);
    if (!vs.length && !gs.length) { meses.push({ mes: m, fuente: null, ventas: 0, gastos: 0, resultado: 0, ahorro: 0, unidadesServicio: 0, unidadesMaquila: 0, sinTipo: 0 }); continue; }
    const tv = vs.reduce((a, v) => a + (Number(v.total) || 0), 0);
    const tg = gs.reduce((a, g) => a + (Number(g.monto) || 0), 0);
    let uS = 0, uM = 0, sinTipo = 0;
    vs.forEach((v) => {
      const k = servicioDeVenta(v);
      const c = Number(v.cantidad) || 0;
      if (k === "MAQUILA") uM += c;
      else if (k === SIN_SERVICIO) sinTipo += c;
      else uS += c;
    });
    meses.push({ mes: m, fuente: "vivo", ventas: tv, gastos: tg, resultado: tv - tg, ahorro: 0, unidadesServicio: uS, unidadesMaquila: uM, sinTipo });
  }
  const con = meses.filter((x) => x.fuente);
  const suma = (k) => con.reduce((a, x) => a + (x[k] || 0), 0);
  // El ahorro de liquidaciones es un saldo (sube y baja, se repite entre meses): se muestra el del último mes con histórico, no la suma.
  const ultimoAhorro = [...meses].reverse().find((x) => x.fuente === "historico" && x.ahorro);
  return {
    meses,
    totales: { ventas: suma("ventas"), gastos: suma("gastos"), resultado: suma("resultado"), unidadesServicio: suma("unidadesServicio"), unidadesMaquila: suma("unidadesMaquila"), sinTipo: suma("sinTipo"), mesesConDatos: con.length },
    ahorroSaldo: ultimoAhorro ? ultimoAhorro.ahorro : 0,
    ahorroMes: ultimoAhorro ? ultimoAhorro.mes : 0,
  };
}
