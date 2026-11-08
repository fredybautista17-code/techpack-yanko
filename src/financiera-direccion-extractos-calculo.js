// (2026-11-08, a pedido de Fredy) Dirección financiera · «Subir extractos»: pasa lo que lee el servidor (functions/extractos-bancolombia.js) a lo que se guarda.
// Funciones puras. Solo se guardan los últimos 4 dígitos del número de cuenta, obligación o tarjeta («ref»).
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const aNumero = (t) => { const n = Number(String(t ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const dia = (iso) => { const m = /^\d{4}-\d{2}-(\d{2})$/.exec(String(iso || "")); return m ? Number(m[1]) : 0; };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fechaCorta = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : ""; };

// Deuda existente a la que más probablemente corresponde el extracto: misma terminación (ref) → única deuda de ese tipo → ninguna (nueva).
export function sugerirDestino(r, externas) {
  const tipo = r.tipo === "credito" ? "banco" : "tarjeta";
  const delTipo = (externas || []).filter((e) => e.tipo === tipo);
  const porRef = r.ref ? delTipo.find((e) => String(e.ref || "") === String(r.ref)) : null;
  if (porRef) return porRef.id;
  const sinRef = delTipo.filter((e) => !e.ref);
  if (tipo === "banco" && delTipo.length === 1) return delTipo[0].id;
  if (tipo === "tarjeta" && sinRef.length === 1 && delTipo.length === 1) return sinRef[0].id;
  return "nueva";
}

// Total de la tarjeta en pesos: pesos + dólares × TRM (la TRM solo se necesita si hay saldo en dólares).
export function valoresTarjeta(r, trm) {
  const t = aNumero(trm);
  const usd = r.dolares ? num(r.dolares.saldo) : 0;
  const usdMin = r.dolares ? num(r.dolares.pagoMinimo) : 0;
  const faltaTRM = usd > 0 && !(t > 0);
  const saldo = num(r.pesos?.saldo) + (usd > 0 && t > 0 ? usd * t : 0);
  const pago = num(r.pesos?.pagoMinimo) + (usdMin > 0 && t > 0 ? usdMin * t : 0);
  return {
    faltaTRM, saldo: Math.round(saldo), pagoMensual: Math.round(pago),
    tasaEA: num(r.tasaEA), diaPago: dia(r.pagarAntes), saldoUSD: usd, trm: t > 0 ? t : null,
    nota: `Extracto con corte ${fechaCorta(r.corte)} · pagar antes del ${fechaCorta(r.pagarAntes)}${usd > 0 ? ` · incluye US$${usd.toLocaleString("es-CO")}` : ""}${r.cupo ? ` · cupo $${Math.round(r.cupo).toLocaleString("es-CO")}` : ""}`,
  };
}

export function valoresCredito(r) {
  return {
    saldo: Math.round(num(r.saldoCapital)), tasaEA: num(r.tasaEA), pagoMensual: Math.round(num(r.cuotaTotal)), diaPago: dia(r.fechaPago),
    nota: `Extracto con corte ${fechaCorta(r.fechaCorte)} · cuota ${r.cuotaNumero || "?"} · desembolsado ${fechaCorta(r.fechaDesembolso)} por $${Math.round(num(r.valorInicial)).toLocaleString("es-CO")}${num(r.enMora) > 0 ? ` · EN MORA $${Math.round(r.enMora).toLocaleString("es-CO")}` : ""}`,
  };
}

// Documento de financiera_banco_resumen/{ym}
export function valoresMes(r) {
  return {
    ym: r.ym, banco: "Bancolombia · cuenta corriente", abonos: num(r.resumen?.abonos), cargos: num(r.resumen?.cargos),
    c4x1000: Math.round(num(r.costos?.c4x1000)), comisiones: Math.round(num(r.costos?.comisiones)), plan: Math.round(num(r.costos?.plan)),
    cupo: Math.round(num(r.costos?.cupo)), sobregiro: Math.round(num(r.costos?.sobregiro)),
  };
}

// ¿Se puede guardar? La cuenta debe cuadrar con los totales del banco; la tarjeta con dólares necesita la TRM.
export function problemaParaGuardar(r, { trm } = {}) {
  if (!r || r.error) return r?.error || "No se pudo leer.";
  if (r.tipo === "cuenta" && !r.cuadre?.ok) return `No cuadra con los totales del banco (abonos ${r.cuadre?.diferenciaAbonos}, cargos ${r.cuadre?.diferenciaCargos}): puede faltar un movimiento.`;
  if (r.tipo === "tarjeta" && valoresTarjeta(r, trm).faltaTRM) return "Este extracto trae saldo en dólares: escribe cuántos pesos vale cada dólar.";
  return "";
}
