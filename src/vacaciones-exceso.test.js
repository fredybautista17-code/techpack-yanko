import { excesoVacaciones, fechaCorteVacaciones, fmtDiasVac } from "./vacaciones-exceso";

describe("excesoVacaciones", () => {
  test("Hubert al 15/12: 164 días trabajados, 15 tomados → ~8,2 días ($517 mil)", () => {
    const r = excesoVacaciones({ diasBase: 164, tomados: 15, sueldo: 1900000 });
    expect(r.ganados).toBeCloseTo(6.833, 3);
    expect(r.dias).toBeCloseTo(8.167, 3);
    expect(Math.round(r.valor)).toBe(517222);
  });
  test("hoy: 146 días, 5 tomados → sin exceso", () => {
    const r = excesoVacaciones({ diasBase: 146, tomados: 5, sueldo: 1900000 });
    expect(r.dias).toBe(0); expect(r.valor).toBe(0);
  });
  test("redondeo mínimo no avisa", () => {
    expect(excesoVacaciones({ diasBase: 120, tomados: 5.02, sueldo: 1000000 }).dias).toBe(0);
  });
  test("datos vacíos no rompen", () => {
    expect(excesoVacaciones({})).toEqual({ ganados: 0, tomados: 0, dias: 0, valor: 0 });
  });
});

describe("fechaCorteVacaciones", () => {
  const aus = [
    { trabajadorId: "h", motivo: "Vacaciones", fechaInicio: "2026-10-05", fechaFin: "2026-10-09" },
    { trabajadorId: "h", motivo: "Vacaciones", fechaInicio: "2026-12-01", fechaFin: "2026-12-15" },
    { trabajadorId: "h", motivo: "Licencia No Remunerada", fechaInicio: "2026-12-20", fechaFin: "2026-12-22" },
    { trabajadorId: "x", motivo: "Vacaciones", fechaInicio: "2027-01-05", fechaFin: "2027-01-20" },
  ];
  test("toma el fin de la última vacación posterior a hoy de esa persona", () => {
    expect(fechaCorteVacaciones(aus, "h", "2026-11-27")).toBe("2026-12-15");
  });
  test("sin vacaciones programadas devuelve hoy", () => {
    expect(fechaCorteVacaciones(aus, "h", "2026-12-30")).toBe("2026-12-30");
    expect(fechaCorteVacaciones([], "h", "2026-11-27")).toBe("2026-11-27");
  });
});

test("formato de días", () => { expect(fmtDiasVac(8.167)).toBe("8,2"); expect(fmtDiasVac(0)).toBe("0,0"); });
