import { excesoVacaciones, fechaCorteVacaciones, fmtDiasVac, inicioContinuidad, diasPagadosEnDinero } from "./vacaciones-exceso";

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

describe("continuidad entre contratos (Hubert: Yanko → Indutex)", () => {
  const hubert = { id: "h", fechaIngreso: "2026-07-01", continuaContrato: true, fechaInicioContinuidad: "2026-01-13" };
  const yanko = { trabajadorId: "h", fechaCorte: "2026-06-30", diasBase: 168, diasVacacionesTomados: 0, vacaciones: 443333 };
  test("inicioContinuidad: solo si la casilla está activa y la fecha es anterior al ingreso", () => {
    expect(inicioContinuidad(hubert)).toBe("2026-01-13");
    expect(inicioContinuidad({ ...hubert, continuaContrato: false })).toBe("");
    expect(inicioContinuidad({ ...hubert, fechaInicioContinuidad: "2026-07-02" })).toBe("");
    expect(inicioContinuidad({ ...hubert, fechaInicioContinuidad: "" })).toBe("");
    expect(inicioContinuidad(null)).toBe("");
  });
  test("días pagados en dinero: 168 días → 7 días", () => {
    expect(diasPagadosEnDinero([yanko], "h", "2026-07-01")).toBeCloseTo(7, 5);
  });
  test("si las vacaciones de Yanko continúan (no se pagaron), no hay días pagados", () => {
    expect(diasPagadosEnDinero([{ ...yanko, vacaciones: 0, vacacionesContinuan: true }], "h", "2026-07-01")).toBe(0);
    expect(diasPagadosEnDinero([{ ...yanko, vacaciones: 0 }], "h", "2026-07-01")).toBe(0);
  });
  test("otra persona o una liquidación que no es anterior al ingreso no cuenta", () => {
    expect(diasPagadosEnDinero([{ ...yanko, trabajadorId: "x" }], "h", "2026-07-01")).toBe(0);
    expect(diasPagadosEnDinero([{ ...yanko, fechaCorte: "2026-07-01" }], "h", "2026-07-01")).toBe(0);
  });
  test("resta los tomados dentro de lo pagado y nunca da negativo", () => {
    expect(diasPagadosEnDinero([{ ...yanko, diasVacacionesTomados: 3 }], "h", "2026-07-01")).toBeCloseTo(4, 5);
    expect(diasPagadosEnDinero([{ ...yanko, diasVacacionesTomados: 20, vacaciones: 1000 }], "h", "2026-07-01")).toBe(0);
  });
  test("con continuidad y sin pagar en dinero: 337 días → ~14 ganados, 15 tomados → adelanto de ~1 día; pagando 7 días en dinero vuelve a ~8", () => {
    const sinPago = excesoVacaciones({ diasBase: 337, tomados: 15, sueldo: 1900000 });
    expect(sinPago.dias).toBeCloseTo(15 - (337 / 360) * 15, 5);
    expect(sinPago.dias).toBeLessThan(1.1);
    const conPago = excesoVacaciones({ diasBase: 337, tomados: 15 + 7, sueldo: 1900000 });
    expect(conPago.dias).toBeGreaterThan(7.9);
  });
});
