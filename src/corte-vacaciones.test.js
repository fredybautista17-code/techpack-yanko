import { costoCorteConVacaciones, resumenVacacionesCorte, sueldoDelDia, diasAusenciaDe } from "./corte-vacaciones";
import { tipoAusenciaDia } from "./meta-vacaciones";

const fichas = [{ id: "f1", nombre: "ANDRES VEGA PEREZ" }, { id: "f2", nombre: "BERTA MARIA RUIZ" }];
const t = { nombre: "ANDRES VEGA PEREZ", sueldo: 2600000 };
const fechas = { fechaDia: "2026-10-06", mesSel: 10, anioSel: 2026 };
const vac = { trabajadorId: "f1", motivo: "Vacaciones", fechaInicio: "2026-10-05", fechaFin: "2026-10-07" }; // lun-mié
const lic = { trabajadorId: "f1", motivo: "Licencia No Remunerada", fechaInicio: "2026-10-08", fechaFin: "2026-10-08" };
const dia = sueldoDelDia(2600000, "2026-10-05");

describe("tipoAusenciaDia", () => {
  test("distingue vacaciones y licencia; sin ausencia = null", () => {
    expect(tipoAusenciaDia([vac, lic], "f1", "2026-10-06")).toBe("vacaciones");
    expect(tipoAusenciaDia([vac, lic], "f1", "2026-10-08")).toBe("licencia");
    expect(tipoAusenciaDia([vac, lic], "f1", "2026-10-09")).toBeNull();
    expect(tipoAusenciaDia([vac, lic], "f2", "2026-10-06")).toBeNull();
  });
  test("si coinciden las dos el mismo día, manda la licencia", () => {
    const solapa = { trabajadorId: "f1", motivo: "Vacaciones", fechaInicio: "2026-10-08", fechaFin: "2026-10-09" };
    expect(tipoAusenciaDia([solapa, lic], "f1", "2026-10-08")).toBe("licencia");
    expect(tipoAusenciaDia([lic, solapa], "f1", "2026-10-08")).toBe("licencia");
  });
});

describe("costoCorteConVacaciones (mes)", () => {
  test("solo vacaciones: días trabajados baja, costo pagado no cambia", () => {
    const r = costoCorteConVacaciones(t, 2600000, "mes", fechas, { fichas, ausencias: [vac] });
    expect(r.diasVac).toHaveLength(3); expect(r.diasLic).toHaveLength(0);
    expect(r.reduccionVac).toBeCloseTo(3 * dia, 5); expect(r.reduccionLic).toBe(0);
    expect(r.costo).toBeCloseTo(2600000 - 3 * dia, 5);
    expect(r.costoPagado).toBe(2600000);
    expect(r.reduccion).toBeCloseTo(3 * dia, 5);
  });
  test("solo licencia: baja los dos costos", () => {
    const r = costoCorteConVacaciones(t, 2600000, "mes", fechas, { fichas, ausencias: [lic] });
    expect(r.diasLic).toHaveLength(1); expect(r.diasVac).toHaveLength(0);
    expect(r.costo).toBeCloseTo(2600000 - dia, 5);
    expect(r.costoPagado).toBeCloseTo(2600000 - dia, 5);
  });
  test("las dos: pagado descuenta solo la licencia", () => {
    const r = costoCorteConVacaciones(t, 2600000, "mes", fechas, { fichas, ausencias: [vac, lic] });
    expect(r.costo).toBeCloseTo(2600000 - 4 * dia, 5);
    expect(r.costoPagado).toBeCloseTo(2600000 - dia, 5);
    expect(r.dias).toHaveLength(4);
  });
  test("sin ficha o sin ausencias: todo igual", () => {
    const r = costoCorteConVacaciones({ nombre: "ZZ", sueldo: 1000 }, 1000, "mes", fechas, { fichas, ausencias: [vac] });
    expect(r.costo).toBe(1000); expect(r.costoPagado).toBe(1000); expect(r.dias).toHaveLength(0);
  });
  test("periodo día: solo cuenta ese día", () => {
    const r = costoCorteConVacaciones(t, dia, "dia", fechas, { fichas, ausencias: [vac, lic] });
    expect(r.diasVac).toEqual(["2026-10-06"]); expect(r.costo).toBe(0); expect(r.costoPagado).toBeCloseTo(dia, 5);
  });
});

describe("resumen y diasAusenciaDe", () => {
  test("resumen trae vac y lic por separado", () => {
    const r = resumenVacacionesCorte([t, { nombre: "BERTA MARIA RUIZ", sueldo: 1 }], "mes", fechas, { fichas, ausencias: [vac, lic] });
    expect(r).toEqual([{ nombre: "ANDRES VEGA PEREZ", dias: 4, diasVac: 3, diasLic: 1 }]);
  });
  test("respeta la fecha de salida", () => {
    const d = diasAusenciaDe({ ...t, fechaSalida: "2026-10-06" }, { fichas, ausencias: [vac, lic] }, "2026-10-01", "2026-10-31");
    expect(d.vac).toEqual(["2026-10-05", "2026-10-06"]); expect(d.lic).toEqual([]);
  });
});

import { ajustarCostoPagadoCorte, primerMesAusencias, reduccionLicenciaPersonaMes, lecturaCostoPagado, textoDiasAusencia } from "./corte-vacaciones";

describe("Estado del año: costo pagado", () => {
  const trabs = [t, { nombre: "BERTA MARIA RUIZ", sueldo: 1500000 }];
  const ctx = { fichas, ausencias: [vac, lic] }; // octubre 2026
  const dato = { meses: {
    7: { valor: 100, costo: 4100000, fuente: "vivo", congelado: true },
    10: { valor: 5000000, costo: 4100000, fuente: "vivo", congelado: true },
    11: { valor: 10, costo: 4100000, fuente: "vivo" },
    9: { valor: 7, costo: 999, fuente: "historico" },
  }, valor: 0, costo: 0, cobertura: 0, mesesConDato: 4 };
  const r = ajustarCostoPagadoCorte(dato, 2026, trabs, ctx);
  test("primer mes con ausencias", () => { expect(primerMesAusencias(ctx.ausencias)).toBe("2026-10"); expect(primerMesAusencias([])).toBeNull(); });
  test("octubre descuenta solo la licencia; vacaciones quedan pagadas", () => {
    expect(r.ajustado).toBe(true);
    expect(r.meses[10].costo).toBeCloseTo(4100000 - dia, 5);
    expect(r.meses[10].costoTrabajado).toBe(4100000);
    expect(r.meses[10].ausencias.diasVac).toBe(3); expect(r.meses[10].ausencias.diasLic).toBe(1);
    expect(r.meses[10].ausencias.reduccionVac).toBeCloseTo(3 * dia, 5);
  });
  test("meses antes de las Ausencias y el histórico no se tocan; noviembre sin ausencias igual", () => {
    expect(r.meses[7].costo).toBe(4100000); expect(r.mesesSinAusencias).toEqual([7]);
    expect(r.meses[9].costo).toBe(999);
    expect(r.meses[11].costo).toBe(4100000);
  });
  test("totales recalculados y sin Ausencias no ajusta nada", () => {
    expect(r.costo).toBeCloseTo(4100000 - dia + 4100000 + 4100000 + 999, 4);
    const sin = ajustarCostoPagadoCorte(dato, 2026, trabs, { fichas, ausencias: [] });
    expect(sin.ajustado).toBe(false); expect(sin.meses[10].costo).toBe(4100000);
  });
  test("reducción por persona del mes", () => {
    expect(reduccionLicenciaPersonaMes(t, ctx, "2026-10")).toBeCloseTo(dia, 5);
    expect(reduccionLicenciaPersonaMes(trabs[1], ctx, "2026-10")).toBe(0);
  });
});

describe("lecturaCostoPagado y texto", () => {
  test("hay solo con vacaciones pagadas", () => {
    const filas = [{ costo: 900, costoPagado: 1000, vacReduccionVac: 100, vacReduccionLic: 0 }, { costo: 500 }];
    const l = lecturaCostoPagado(filas, 1200);
    expect(l.hay).toBe(true); expect(l.costoPagado).toBe(1500); expect(l.resultado).toBe(-300); expect(l.falta).toBe(300); expect(l.pct).toBeCloseTo(80, 5);
    expect(lecturaCostoPagado([{ costo: 900, costoPagado: 900, vacReduccionLic: 50 }], 1000).hay).toBe(false);
  });
  test("texto de chip", () => {
    expect(textoDiasAusencia({ vacDiasVac: 3, vacDiasLic: 1 })).toBe("3 días de vacaciones · 1 día de licencia sin pago");
    expect(textoDiasAusencia({ vacDias: 1 })).toBe("1 día de vacaciones");
  });
});
