import { periodoCosto, fechaISOBogota, lotesDelPeriodo, cierreGeneral } from "./costos-general-calculo";

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
