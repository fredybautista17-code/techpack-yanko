import { areasDe, planLote, proximaDotacion, aplicaDotacion, estadoFormato, formatosDe, porcentajeExpediente, alertasVencimiento, resumenTablero, avancePorArea, sumarMeses, sumarDias, diasEntre, sugerirFinPrueba, esActivo, LIMITE_DOTACION } from "./talento-humano-calculo";

const HOY = "2026-11-26";
const T = (id, o = {}) => ({ id, nombre: "N" + id, area: "Confección", sueldo: 1750905, tipoContrato: "Término Fijo", fechaIngreso: "2026-10-05", ...o });
const ok = (extra = {}) => ({ estado: "ok", ...extra });

test("fechas: días, meses y cruce de fin de mes", () => {
  expect(diasEntre("2026-11-26", "2026-12-20")).toBe(24);
  expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  expect(sumarMeses("2026-12-31", 2)).toBe("2027-02-28");
  expect(sumarMeses("2026-10-05", 2)).toBe("2026-12-05");
  expect(sugerirFinPrueba({ fechaIngreso: "2026-10-05" })).toBe("2026-12-04");
  expect(sugerirFinPrueba({})).toBe("");
});

test("próxima dotación de ley: 30-abr, 31-ago, 20-dic y cruce de año", () => {
  expect(proximaDotacion("2026-11-26")).toEqual({ fecha: "2026-12-20", dias: 24 });
  expect(proximaDotacion("2026-12-20").dias).toBe(0);
  expect(proximaDotacion("2026-12-21")).toEqual({ fecha: "2027-04-30", dias: 130 });
  expect(proximaDotacion("2026-05-01").fecha).toBe("2026-08-31");
});

test("dotación: aplica hasta 2 SMMLV y se puede marcar que no", () => {
  expect(aplicaDotacion(T(1), null)).toBe(true);
  expect(aplicaDotacion(T(1, { sueldo: LIMITE_DOTACION }), null)).toBe(true);
  expect(aplicaDotacion(T(1, { sueldo: LIMITE_DOTACION + 1 }), null)).toBe(false);
  expect(aplicaDotacion(T(1, { sueldo: 0 }), null)).toBe(true);
  expect(aplicaDotacion(T(1), { dotacion: false })).toBe(false);
});

test("estado de un formato: pendiente por defecto, no aplica sin prueba o sin dotación, manda lo marcado", () => {
  const t = T(1);
  expect(estadoFormato(t, null, "TH-FO-19")).toBe("pend");
  expect(estadoFormato(t, null, "TH-FO-04")).toBe("na"); // sin fecha de fin de prueba
  expect(estadoFormato(t, { fechaFinPrueba: "2026-12-04" }, "TH-FO-04")).toBe("pend");
  expect(estadoFormato(T(2, { sueldo: 9999999 }), null, "TH-FO-02")).toBe("na");
  expect(estadoFormato(t, { formatos: { "TH-FO-19": ok() } }, "TH-FO-19")).toBe("ok");
  expect(estadoFormato(t, { formatos: { "TH-FO-19": { estado: "venc" } } }, "TH-FO-19")).toBe("venc");
  expect(estadoFormato(t, { formatos: { "TH-FO-19": { estado: "pend" } } }, "TH-FO-19")).toBe("pend");
  expect(formatosDe(t, null).length).toBe(14);
});

test("porcentaje del expediente cuenta solo los formatos que aplican", () => {
  const t = T(1);
  expect(porcentajeExpediente(t, null)).toBe(0);
  const formatos = {};
  ["TH-FO-19", "TH-FO-20", "TH-FO-01", "ANTEC", "TH-FO-21", "TH-FO-16", "TH-FO-17", "TH-FO-12", "TH-FO-18", "TH-FO-05", "TH-FO-06", "TH-FO-02", "TH-FO-03"].forEach((c) => { formatos[c] = ok(); });
  expect(porcentajeExpediente(t, { formatos })).toBe(100); // TH-FO-04 no aplica: no hay período de prueba
  expect(porcentajeExpediente(t, { fechaFinPrueba: "2026-12-04", formatos })).toBe(93); // 13 de 14
});

test("alertas: prueba por terminar, preaviso del contrato (30 días antes) y orden por urgencia", () => {
  const trab = [
    T("a", { nombre: "Laura" }), T("b", { nombre: "Marcela" }), T("c", { nombre: "Yesenia" }), T("d", { nombre: "Lejano" }), T("e", { nombre: "Retirado", fechaRetiro: "2026-11-01" }), T("f", { nombre: "Indefinido", tipoContrato: "Término Indefinido" }),
  ];
  const exps = [
    { trabajadorId: "a", fechaFinPrueba: "2026-12-04" },
    { trabajadorId: "b", fechaFinContrato: "2026-12-31" }, // límite de preaviso 1 dic → en 5 días
    { trabajadorId: "c", fechaFinContrato: "2027-01-15" }, // límite 16 dic → en 20 días
    { trabajadorId: "d", fechaFinContrato: "2027-06-01" }, // fuera de la ventana
    { trabajadorId: "e", fechaFinPrueba: "2026-12-01" },   // retirado: no cuenta
    { trabajadorId: "f", fechaFinPrueba: "2026-12-20" },
  ];
  const al = alertasVencimiento(trab, exps, HOY);
  expect(al.map((x) => x.t.nombre)).toEqual(["Marcela", "Laura", "Yesenia", "Indefinido"]);
  expect(al[0]).toMatchObject({ tipo: "contrato", limite: "2026-12-01", d: 5 });
  expect(al[0].accion).toMatch(/1 dic 2026/);
  expect(al[1]).toMatchObject({ tipo: "prueba", d: 8 });
});

test("alertas: con la evaluación de desempeño firmada ya no avisa; prueba vencida sin evaluación sí; preaviso vencido avisa", () => {
  const trab = [T("a"), T("b"), T("c")];
  const exps = [
    { trabajadorId: "a", fechaFinPrueba: "2026-12-04", formatos: { "TH-FO-04": ok() } },
    { trabajadorId: "b", fechaFinPrueba: "2026-11-20" },
    { trabajadorId: "c", fechaFinContrato: "2026-12-10" }, // el límite fue el 10 nov → ya pasó
  ];
  const al = alertasVencimiento(trab, exps, HOY);
  expect(al.map((x) => x.t.id)).toEqual(["c", "b"]);
  expect(al[0].d).toBeLessThan(0);
  expect(al[0].accion).toMatch(/asesor laboral/);
  expect(al[1].titulo).toMatch(/sin evaluación/);
});

test("tablero: números de dotación, pendientes, inducciones y candidatos", () => {
  const trab = [T("a"), T("b"), T("c", { sueldo: 9000000 }), T("d", { fechaRetiro: "2026-10-01" })];
  const exps = [{ trabajadorId: "a", formatos: { "TH-FO-02": ok(), "TH-FO-05": ok(), "TH-FO-06": ok() } }];
  const r = resumenTablero(trab, exps, [{ id: 1 }, { id: 2 }], HOY);
  expect(r.activos).toBe(3);
  expect(r.dotacion).toMatchObject({ fecha: "2026-12-20", dias: 24, elegibles: 2, listos: 1, faltan: 1 });
  expect(r.sinInduccion).toBe(2);
  expect(r.conPendientes).toBe(3);
  expect(r.candidatos).toBe(2);
  expect(esActivo(trab[3])).toBe(false);
});

test("avance por área, de menor a mayor", () => {
  const trab = [T("a", { area: "Corte" }), T("b", { area: "Empaque" })];
  const formatos = {};
  ["TH-FO-19", "TH-FO-20", "TH-FO-01", "ANTEC", "TH-FO-21", "TH-FO-16", "TH-FO-17", "TH-FO-12", "TH-FO-18", "TH-FO-05", "TH-FO-06", "TH-FO-02", "TH-FO-03"].forEach((c) => { formatos[c] = ok(); });
  const r = avancePorArea(trab, [{ trabajadorId: "b", formatos }]);
  expect(r).toEqual([{ area: "Corte", n: 1, pct: 0 }, { area: "Empaque", n: 1, pct: 100 }]);
});

test("líder de área: los formatos sensibles no se ven ni cuentan", () => {
  const t = T("a");
  expect(formatosDe(t, null, { sinSensibles: true }).length).toBe(11);
  expect(formatosDe(t, null, { sinSensibles: true }).some((f) => f.sensible)).toBe(false);
  const formatos = {};
  formatosDe(t, null, { sinSensibles: true }).forEach((f) => { if (f.estado !== "na") formatos[f.codigo] = ok(); });
  expect(porcentajeExpediente(t, { formatos }, { sinSensibles: true })).toBe(100); // sin los 3 sensibles
  expect(porcentajeExpediente(t, { formatos })).toBeLessThan(100); // con ellos no
  const r = resumenTablero([t], [{ trabajadorId: "a", formatos }], [], HOY, { sinSensibles: true });
  expect(r.conPendientes).toBe(0);
});

test("áreas distintas de los activos", () => {
  expect(areasDe([T("a", { area: "Corte" }), T("b", { area: "Bodega" }), T("c", { area: "Corte" }), T("d", { area: "X", fechaRetiro: "2026-01-01" }), T("e", { area: "" })])).toEqual(["Bodega", "Corte", "Sin asignar"]);
});

test("carga por lote: omite a quien no le aplica o ya está en ese estado", () => {
  const trab = [T("a"), T("b", { sueldo: 9000000 }), T("c")];
  const exps = [{ trabajadorId: "c", formatos: { "TH-FO-02": ok() } }];
  const r = planLote(trab, exps, "TH-FO-02", "ok");
  expect(r.aplicar.map((x) => x.id)).toEqual(["a"]);
  expect(r.omitir.map((x) => [x.t.id, x.motivo])).toEqual([["b", "no le aplica"], ["c", "ya está firmado"]]);
  expect(planLote(trab, [], "TH-FO-19", "ok").aplicar.length).toBe(3);
  expect(planLote(trab, [], "TH-FO-19", "pend").omitir.length).toBe(3);
  expect(planLote(trab, [], "TH-FO-19", "na").aplicar.length).toBe(3);
});

import { calcularEvaluacion, semaforoEvaluacion, tabulacionEvaluaciones, evaluacionesDe, nivelNota, FACTORES_TRABAJO, FACTORES_PERSONAL, FACTORES_SST } from "./talento-humano-calculo";

const todo = (n, s) => ({
  trabajo: Object.fromEntries(FACTORES_TRABAJO.map((f) => [f.id, n])),
  personal: Object.fromEntries(FACTORES_PERSONAL.map((f) => [f.id, n])),
  sst: Object.fromEntries(FACTORES_SST.map((f) => [f.id, s])),
});

test("evaluación: 7 + 7 + 7 factores y promedios", () => {
  expect(FACTORES_TRABAJO.length + FACTORES_PERSONAL.length + FACTORES_SST.length).toBe(21);
  const c = calcularEvaluacion(todo(8, 5));
  expect(c).toMatchObject({ promTrabajo: 8, promPersonal: 8, promGeneral: 8, promSst: 5, respondidos: 21, completa: true });
  const ev = todo(8, 5); ev.trabajo.calidad = 10; ev.personal.iniciativa = 4;
  expect(calcularEvaluacion(ev)).toMatchObject({ promTrabajo: 8.29, promPersonal: 7.43, promGeneral: 7.86 });
});

test("evaluación: incompleta, valores inválidos y SST «No aplica» no cuenta", () => {
  expect(calcularEvaluacion(null)).toMatchObject({ promGeneral: null, promSst: null, completa: false, respondidos: 0 });
  const ev = todo(9, 3); ev.sst.epp = 0; ev.sst.salud = 5;
  const c = calcularEvaluacion(ev);
  expect(c.promSst).toBe(3.33); // (3*5 + 5) / 6, sin el 0
  expect(c.completa).toBe(true);
  ev.trabajo.equipo = 11; ev.personal.integridad = 0; ev.sst.mejora = 2; // fuera de escala
  const d = calcularEvaluacion(ev);
  expect(d.completa).toBe(false);
  expect(d.respondidos).toBe(18);
});

test("semáforo del formato: desempeño 70/80 % y SST 60/80 %", () => {
  expect(["", null, undefined].map((x) => semaforoEvaluacion(x))).toEqual(["", "", ""]);
  expect(semaforoEvaluacion(6.9)).toBe("rojo"); expect(semaforoEvaluacion(7)).toBe("ambar"); expect(semaforoEvaluacion(7.9)).toBe("ambar"); expect(semaforoEvaluacion(8)).toBe("verde");
  expect(semaforoEvaluacion(2.9, "sst")).toBe("rojo"); expect(semaforoEvaluacion(3, "sst")).toBe("ambar"); expect(semaforoEvaluacion(3.9, "sst")).toBe("ambar"); expect(semaforoEvaluacion(4, "sst")).toBe("verde");
  expect(["Insatisfactorio", "Deficiente", "Bueno", "Muy bueno", "Excelente", "Excelente", ""]).toEqual([5, 6, 7, 8, 9, 10, 0].map(nivelNota));
});

test("tabulación: promedio por factor sobre varias personas", () => {
  const a = todo(10, 5), b = todo(6, 1); b.sst.epp = 0;
  const t = tabulacionEvaluaciones([a, b]);
  expect(t.n).toBe(2);
  expect(t.trabajo[0]).toMatchObject({ id: "calidad", n: 2, prom: 8 });
  expect(t.sst.find((x) => x.id === "epp")).toMatchObject({ n: 1, prom: 5 }); // el 0 no cuenta
  expect(t.sst.find((x) => x.id === "politicas").prom).toBe(3);
  expect(t.promGeneral).toBe(8);
  expect(tabulacionEvaluaciones([]).promGeneral).toBeNull();
});

test("evaluaciones de los activos de la lista, la más reciente primero", () => {
  const trab = [T("a", { nombre: "Ana" }), T("b", { nombre: "Beto" }), T("c", { nombre: "Ceci", fechaRetiro: "2026-10-01" }), T("d")];
  const evs = [{ id: "a", trabajadorId: "a", fecha: "2026-11-01", ...todo(8, 5) }, { id: "b", trabajadorId: "b", fecha: "2026-11-20", ...todo(7, 3) }, { id: "c", trabajadorId: "c", fecha: "2026-11-25", ...todo(7, 3) }];
  const r = evaluacionesDe(trab, evs);
  expect(r.map((x) => x.t.nombre)).toEqual(["Beto", "Ana"]);
  expect(r[0].calc.promGeneral).toBe(7);
});
