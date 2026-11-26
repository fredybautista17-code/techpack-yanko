import { ETIQUETAS_FIJOS, FIJOS_BASE, tasasYFijosEfectivos, calcularCotizacion } from "./cotizador-calculo";
import { prendasCortadasPorMes, calcularTarifaMuestras, mesesDeTarifa, tarifaVigente, aplicarTarifaMuestras, mesAnteriorDe, ultimoMesCerrado, periodoTarifa } from "./muestras-tarifa";

const pedidos = [
  { id: "1", cortesRealizados: [{ fecha: "2026-10-03", totalUnidades: 1200 }, { fecha: "2026-10-20", totalUnidades: 800 }, { fecha: "2026-09-28", totalUnidades: 500 }] },
  { id: "2", cortesRealizados: [{ fecha: "2026-10-30", refs: [{ total: 100 }, { total: 50 }] }, { fecha: "", totalUnidades: 9 }, { fecha: "2026-10-05", totalUnidades: 0 }] },
  { id: "3" },
];

test("prendas cortadas por mes: suma unidades, usa refs si falta el total, ignora fechas malas", () => {
  expect(prendasCortadasPorMes(pedidos)).toEqual({ "2026-10": 2150, "2026-09": 500 });
  expect(prendasCortadasPorMes(null)).toEqual({});
});

test("meses de la ventana y cruce de año", () => {
  expect(mesAnteriorDe("2026-01")).toBe("2025-12");
  expect(mesesDeTarifa("2026-01", "prom3")).toEqual(["2026-01", "2025-12", "2025-11"]);
  expect(mesesDeTarifa("2026-10", "mes")).toEqual(["2026-10"]);
});

test("tarifa del mes = costo ÷ prendas, redondeada al peso", () => {
  const r = calcularTarifaMuestras({ mes: "2026-10", modo: "mes", costoPorMes: { "2026-10": 4300000 }, prendasPorMes: { "2026-10": 2150 } });
  expect(r.valor).toBe(2000);
  expect(r.costo).toBe(4300000);
  expect(r.prendas).toBe(2150);
  expect(r.aviso).toBe("");
  const r2 = calcularTarifaMuestras({ mes: "2026-10", costoPorMes: { "2026-10": 1000 }, prendasPorMes: { "2026-10": 3 } });
  expect(r2.valor).toBe(333);
});

test("promedio de 3 meses = suma de costos ÷ suma de prendas (no promedio de tarifas)", () => {
  const r = calcularTarifaMuestras({
    mes: "2026-10", modo: "prom3",
    costoPorMes: { "2026-10": 3000000, "2026-09": 1000000, "2026-08": 0 },
    prendasPorMes: { "2026-10": 1000, "2026-09": 1000, "2026-08": 2000 },
  });
  expect(r.valor).toBe(1000); // 4.000.000 ÷ 4.000
  expect(r.meses.length).toBe(3);
});

test("sin prendas cortadas: no hay tarifa y avisa", () => {
  const sin = calcularTarifaMuestras({ mes: "2026-10", costoPorMes: { "2026-10": 900000 }, prendasPorMes: {} });
  expect(sin.valor).toBeNull();
  expect(sin.aviso).toMatch(/No hay prendas/);
});

test("sin costo: avisa y no publica", () => {
  const r = calcularTarifaMuestras({ mes: "2026-10", costoPorMes: {}, prendasPorMes: { "2026-10": 100 } });
  expect(r.valor).toBeNull();
  expect(r.aviso).toMatch(/\$0/);
});

test("último mes cerrado y periodo en texto (también con el formato anterior)", () => {
  expect(ultimoMesCerrado("2026-11-26")).toBe("2026-10");
  expect(ultimoMesCerrado("2026-01-02")).toBe("2025-12");
  expect(periodoTarifa({ meses: ["2026-10", "2026-09", "2026-08"] })).toBe("promedio de agosto 2026 a octubre 2026");
  expect(periodoTarifa({ meses: ["2026-10"] })).toBe("octubre 2026");
  expect(periodoTarifa({ mes: "2026-09" })).toBe("septiembre 2026");
  expect(periodoTarifa(null)).toBe("");
});

test("tarifa vigente y fichas del cotizador con el valor publicado", () => {
  expect(tarifaVigente(null)).toBeNull();
  expect(tarifaVigente({ valorPorPrenda: 0 })).toBeNull();
  expect(tarifaVigente({ valorPorPrenda: "1234.6" }).valorPorPrenda).toBe(1235);
  const params = [{ id: "general", nombre: "General", fijos: { diseno: 400, bodega: 100 } }, { id: "kamila", nombre: "Kamila", fijos: { diseno: 400 } }];
  const out = aplicarTarifaMuestras(params, { valorPorPrenda: 2000 });
  expect(out[0].fijos).toEqual({ diseno: 400, muestras: 2000, bodega: 100 }); // diseño NO se toca
  expect(out[1].fijos.diseno).toBe(400);
  expect(out[1].fijos.muestras).toBe(2000);
  expect(params[0].fijos.muestras).toBeUndefined(); // no muta
  expect(aplicarTarifaMuestras(params, null)).toBe(params);
  // sin ficha General guardada: se agrega una para que la tarifa llegue
  const sinGeneral = aplicarTarifaMuestras([{ id: "kamila", nombre: "Kamila", fijos: {} }], { valorPorPrenda: 700 });
  expect(sinGeneral.find((p) => p.id === "general").fijos.muestras).toBe(700);
});

test("cotizador: «Área de diseño» y «Área de muestras» son dos líneas y las dos suman al costo fijo", () => {
  expect(ETIQUETAS_FIJOS.diseno).toBe("Área de diseño");
  expect(ETIQUETAS_FIJOS.muestras).toBe("Área de muestras");
  expect(FIJOS_BASE.diseno).toBe(400);
  expect(FIJOS_BASE.muestras).toBe(0); // sin tarifa no suma nada
  const [ficha] = aplicarTarifaMuestras([{ id: "general", nombre: "General", fijos: {} }], { valorPorPrenda: 65 });
  const { fijos } = tasasYFijosEfectivos({ fijos: ficha.fijos });
  expect(fijos.diseno).toBe(400);
  expect(fijos.muestras).toBe(65);
  const base = calcularCotizacion({ fijos: { diseno: 400 } }).fijosTotal;
  expect(calcularCotizacion({ fijos: ficha.fijos }).fijosTotal).toBe(base + 65);
  // una cotización guardada antes de este cambio (sin «muestras») queda igual
  expect(calcularCotizacion({ fijos: { diseno: 65 } }).fijosTotal).toBe(base - 400 + 65);
});
