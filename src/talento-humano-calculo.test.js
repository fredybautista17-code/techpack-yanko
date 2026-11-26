import { proximaDotacion, aplicaDotacion, estadoFormato, formatosDe, porcentajeExpediente, alertasVencimiento, resumenTablero, avancePorArea, sumarMeses, sumarDias, diasEntre, sugerirFinPrueba, esActivo, LIMITE_DOTACION } from "./talento-humano-calculo";

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
