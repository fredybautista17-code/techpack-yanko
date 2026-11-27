// ─── VACACIONES ADELANTADAS (EXCESO) ─────────────────────────────────────────────────────────────────────────
// (2026-11-27, a pedido de Fredy) Cuando alguien disfruta más días de vacaciones de los que ha ganado (ej. Hubert: 15 días
// tomados contra 6,8 ganados), hoy la pantalla de Vacaciones muestra «0 pendientes / Al día» y el recibo de retiro «Vacaciones $0»:
// el adelanto no se veía. Estas funciones lo calculan; ATLAS NO lo descuenta de ninguna liquidación (es solo un aviso).
const NUM = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export const VAC_DIAS_POR_ANIO = 15;
// Menos de esto (días) no se avisa: es redondeo.
export const VAC_EXCESO_MINIMO = 0.05;

// diasBase = días trabajados (base 360, sin licencia no remunerada); tomados = días hábiles de vacaciones; sueldo = mensual.
// Devuelve { ganados, tomados, dias (exceso), valor (exceso × sueldo ÷ 30) }.
export function excesoVacaciones({ diasBase, tomados, sueldo }) {
  const ganados = (NUM(diasBase) / 360) * VAC_DIAS_POR_ANIO;
  const t = NUM(tomados);
  const dias = Math.max(0, t - ganados);
  const hay = dias >= VAC_EXCESO_MINIMO;
  return { ganados, tomados: t, dias: hay ? dias : 0, valor: hay ? dias * (NUM(sueldo) / 30) : 0 };
}

// Fecha hasta la cual proyectar: el fin de la última vacación registrada que termina después de hoy; si no hay, hoy.
// Así se ve el adelanto «cuando termine lo programado» (Hubert: 15/12 con 15 días tomados), no solo a la fecha de hoy.
export function fechaCorteVacaciones(ausencias, trabajadorId, hoy) {
  let max = hoy;
  (ausencias || []).forEach((a) => {
    if (!a || a.trabajadorId !== trabajadorId || norm(a.motivo) !== "VACACIONES") return;
    const f = String(a.fechaFin || a.fechaInicio || "").slice(0, 10);
    if (f > max) max = f;
  });
  return max;
}

// Texto corto de días con un decimal: 8,2
export const fmtDiasVac = (n) => (Math.round(NUM(n) * 10) / 10).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ─── CONTINUIDAD ENTRE CONTRATOS (2026-11-27, a pedido de Fredy) ─────────────────────────────────────────────
// Caso Hubert: trabajó en Yanko (13/01–30/06) y pasó a Indutex (01/07). Con la casilla «Continúa con el contrato anterior» de la ficha
// (continuaContrato + fechaInicioContinuidad) las vacaciones se cuentan desde la antigüedad continua, no solo desde el último ingreso.
// Los días que ya se pagaron en DINERO en una liquidación anterior se descuentan del saldo (si no, se pagarían dos veces).

// ¿La ficha pide contar la antigüedad continua? Devuelve la fecha de inicio o "".
export function inicioContinuidad(t) {
  if (!t || !t.continuaContrato) return "";
  const d = String(t.fechaInicioContinuidad || "").slice(0, 10);
  const ing = String(t.fechaIngreso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && ing && d < ing ? d : "";
}

// Días de vacaciones pagados en dinero en las liquidaciones de retiro ANTERIORES de esa persona.
// Una liquidación guarda diasBase, diasVacacionesTomados y vacaciones = sueldo/30 × (diasBase/24 − tomados): de ahí salen los días pagados.
// Las marcadas «vacacionesContinuan» (vacaciones = 0) no pagaron nada. Solo cuentan las que terminan antes de `antesDe` (el ingreso actual).
export function diasPagadosEnDinero(liquidaciones, trabajadorId, antesDe) {
  return (liquidaciones || []).reduce((suma, l) => {
    if (!l || l.trabajadorId !== trabajadorId || l.vacacionesContinuan) return suma;
    if (antesDe && !(String(l.fechaCorte || "").slice(0, 10) < antesDe)) return suma;
    if (!(NUM(l.vacaciones) > 0.5)) return suma;
    return suma + Math.max(0, (NUM(l.diasBase) / 360) * VAC_DIAS_POR_ANIO - NUM(l.diasVacacionesTomados));
  }, 0);
}
