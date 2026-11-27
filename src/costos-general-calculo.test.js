import { periodoCosto, fechaISOBogota, lotesDelPeriodo, cierreGeneral, estimarQuincenaFiscal, costoTotalLiquidacion, resumenFiscal, detalleFiscal, TIPO_FISCAL, TIPO_FISCAL_DESTAJO, TIPO_PRESTACION } from "./costos-general-calculo";

describe("periodoCosto (prorrateo por días de trabajo)", () => {
  const nov = (tipo, hoyISO = "2026-11-27") => periodoCosto({ anio: 2026, mes: 11, tipo, hoyISO });
  test("mes completo: factor 1 y las dos quincenas", () => {
    const p = nov("mes");
    expect(p.factor).toBe(1);
    expect(p.esMes).toBe(true);
    expect(p.quincenas).toEqual(["Q1", "Q2"]);
    expect(p.dias).toBe(p.diasMes);
  });
  test("las dos quincenas suman el mes y cada una trae su rango", () => {
    const q1 = nov("q1");
    const q2 = nov("q2");
    expect(q1.desde).toBe("2026-11-01");
    expect(q1.hasta).toBe("2026-11-15");
    expect(q2.desde).toBe("2026-11-16");
    expect(q2.hasta).toBe("2026-11-30");
    expect(q1.dias + q2.dias).toBe(q1.diasMes);
    expect(q1.factor + q2.factor).toBeCloseTo(1, 10);
    expect(q1.quincenas).toEqual(["Q1"]);
    expect(q2.quincenas).toEqual(["Q2"]);
  });
  test("hasta hoy en el mes en curso cuenta solo hasta ese día", () => {
    const h = nov("hoy", "2026-11-27");
    expect(h.tipo).toBe("hoy");
    expect(h.hasta).toBe("2026-11-27");
    expect(h.dias).toBeLessThanOrEqual(h.diasMes);
    expect(h.dias).toBeGreaterThan(nov("q1").dias);
    expect(h.quincenas).toEqual(["Q1", "Q2"]);
    // primer día del mes: casi nada y solo la primera quincena
    const d1 = nov("hoy", "2026-11-03");
    expect(d1.quincenas).toEqual(["Q1"]);
    expect(d1.factor).toBeLessThan(0.2);
  });
  test("hasta hoy en un mes ya pasado o futuro es el mes completo", () => {
    expect(nov("hoy", "2026-12-05").esMes).toBe(true);
    expect(nov("hoy", "2026-10-20").factor).toBe(1);
  });
  test("domingos y festivos no cuentan (1 de noviembre festivo de 2026 cae lunes 2)", () => {
    // 1 al 3 de noviembre de 2026: dom 1, lun 2 festivo (Todos los Santos), mar 3 -> solo el 3 es día de trabajo
    expect(nov("hoy", "2026-11-03").dias).toBe(1);
  });
});

describe("fechaISOBogota y lotesDelPeriodo", () => {
  test("Timestamp de Firestore a fecha de Bogotá", () => {
    const ts = { toDate: () => new Date("2026-11-16T03:00:00Z") }; // 15/11 22:00 en Bogotá
    expect(fechaISOBogota(ts)).toBe("2026-11-15");
    expect(fechaISOBogota("2026-11-20")).toBe("2026-11-20");
    expect(fechaISOBogota(null)).toBe("");
  });
  test("filtra lotes por fecha de aprobación dentro del periodo", () => {
    const l = (id, iso) => ({ id, fechaAprobacion: { toDate: () => new Date(`${iso}T15:00:00Z`) } });
    const lotes = [l("a", "2026-11-05"), l("b", "2026-11-15"), l("c", "2026-11-16"), l("d", "2026-11-29")];
    const q1 = periodoCosto({ anio: 2026, mes: 11, tipo: "q1" });
    const q2 = periodoCosto({ anio: 2026, mes: 11, tipo: "q2" });
    const mes = periodoCosto({ anio: 2026, mes: 11, tipo: "mes" });
    expect(lotesDelPeriodo(lotes, q1).map((x) => x.id)).toEqual(["a", "b"]);
    expect(lotesDelPeriodo(lotes, q2).map((x) => x.id)).toEqual(["c", "d"]);
    expect(lotesDelPeriodo(lotes, mes)).toHaveLength(4);
  });
});

describe("cierreGeneral con factorPeriodo", () => {
  const gastos = [{ incluir: true, valor: 10000000 }, { incluir: false, valor: 5000000 }];
  const base = { lotes: [], bases: [], gastos, liquidacionesFiscal: [], areasDestajo: [], fichas: [], areasFuera: [], excepciones: {}, equiposCorte: [], destajoOpc: {} };
  test("sin factor todo queda como siempre", () => {
    const r = cierreGeneral(base);
    expect(r.gastos.total).toBe(10000000);
    expect(r.estructura).toBe(10000000);
    expect(r.factorPeriodo).toBe(1);
  });
  test("con factor 0,5 los gastos del Excel se reparten y se conserva el total del mes", () => {
    const r = cierreGeneral({ ...base, factorPeriodo: 0.5 });
    expect(r.gastos.total).toBe(5000000);
    expect(r.gastos.totalMes).toBe(10000000);
    expect(r.estructura).toBe(5000000);
  });
  test("factor inválido se ignora", () => {
    expect(cierreGeneral({ ...base, factorPeriodo: NaN }).gastos.total).toBe(10000000);
  });
});

describe("estimarQuincenaFiscal (2.ª quincena sin liquidar, día a día)", () => {
  const liq = (o) => ({ id: "L1", trabajadorId: "t1", nombre: "Ana", periodoId: "2026-11-Q1", tipoNomina: TIPO_FISCAL, netoAPagar: 800000, epsTrabajador: 0, pensionTrabajador: 0, pensionEmpleador: 100000, arlEmpleador: 0, cajaCompensacionEmpleador: 0, epsEmpleador: 0, cesantiasPeriodo: 50000, interesesPeriodo: 0, primaPeriodo: 50000, vacacionesPeriodo: 0, ...o });
  const per = (tipo, hoyISO = "2026-11-27") => periodoCosto({ anio: 2026, mes: 11, tipo, hoyISO });
  const hoy = "2026-11-27";
  test("«Hasta hoy» (día 27): 9 de 10 días de la 2.ª quincena = 90 %", () => {
    const e = estimarQuincenaFiscal([liq()], per("hoy"), hoy, []);
    expect(e).toHaveLength(1);
    expect(e[0].factorEstimado).toBeCloseTo(0.9, 5);
    expect(e[0].periodoId).toBe("2026-11-Q2");
    expect(costoTotalLiquidacion(e[0])).toBeCloseTo(0.9 * 1000000, 2);
  });
  test("«Mes completo» proyecta la 2.ª al 100 %; «2.ª quincena» también", () => {
    expect(estimarQuincenaFiscal([liq()], per("mes"), hoy, [])[0].factorEstimado).toBe(1);
    expect(estimarQuincenaFiscal([liq()], per("q2"), hoy, [])[0].factorEstimado).toBeCloseTo(0.9 * 0 + (per("q2").dias ? 1 : 0), 5);
  });
  test("«1.ª quincena» y «hasta hoy» antes del día 16 no estiman nada", () => {
    expect(estimarQuincenaFiscal([liq()], per("q1"), hoy, [])).toEqual([]);
    expect(estimarQuincenaFiscal([liq()], per("hoy", "2026-11-10"), "2026-11-10", [])).toEqual([]);
  });
  test("un mes que no es el actual no se estima", () => {
    expect(estimarQuincenaFiscal([liq({ periodoId: "2026-10-Q1" })], periodoCosto({ anio: 2026, mes: 10, tipo: "mes" }), hoy, [])).toEqual([]);
  });
  test("si ya hay liquidación real de la 2.ª para esa persona, no se estima (sin doble conteo)", () => {
    const reales = [liq(), liq({ id: "L2", periodoId: "2026-11-Q2" })];
    expect(estimarQuincenaFiscal(reales, per("mes"), hoy, [])).toEqual([]);
  });
  test("solo la que falta: otra persona sin Q2 sí se estima", () => {
    const l = [liq(), liq({ id: "L2", periodoId: "2026-11-Q2" }), liq({ id: "L3", trabajadorId: "t2", nombre: "Luis" })];
    const e = estimarQuincenaFiscal(l, per("mes"), hoy, []);
    expect(e.map((x) => x.trabajadorId)).toEqual(["t2"]);
  });
  test("Fiscal Destajo se estima; Prestación de Servicios no", () => {
    const l = [liq({ id: "D", trabajadorId: "d1", tipoNomina: TIPO_FISCAL_DESTAJO }), liq({ id: "P", trabajadorId: "p1", tipoNomina: TIPO_PRESTACION })];
    expect(estimarQuincenaFiscal(l, per("mes"), hoy, []).map((x) => x.trabajadorId)).toEqual(["d1"]);
  });
  test("persona retirada (ficha inactiva o retiro antes del día 16) no se estima", () => {
    expect(estimarQuincenaFiscal([liq()], per("mes"), hoy, [{ id: "t1", activo: false }])).toEqual([]);
    expect(estimarQuincenaFiscal([liq()], per("mes"), hoy, [{ id: "t1", activo: true, fechaRetiro: "2026-11-12" }])).toEqual([]);
    expect(estimarQuincenaFiscal([liq()], per("mes"), hoy, [{ id: "t1", activo: true }])).toHaveLength(1);
  });
  test("resumenFiscal: las estimadas no cuentan como quincena confirmada y se informan aparte; detalleFiscal las separa", () => {
    const l = [liq(), ...estimarQuincenaFiscal([liq()], per("hoy"), hoy, [])];
    const r = resumenFiscal(l, [], [], {});
    expect(r.quincenas).toEqual(["2026-11-Q1"]);
    expect(r.estimado.todo).toBeCloseTo(900000, 2);
    expect(r.totalTodo).toBeCloseTo(1900000, 2);
    const d = detalleFiscal(l, [], [], {});
    expect(d).toHaveLength(1);
    expect(d[0].quincenas).toEqual(["2026-11-Q1"]);
    expect(d[0].fraccionEstimada).toBeCloseTo(0.9, 5);
    expect(d[0].costoEstimado).toBeCloseTo(900000, 2);
    expect(d[0].costo).toBeCloseTo(1900000, 2);
  });
});
