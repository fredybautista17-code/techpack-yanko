import { PUNTOS_REVISION_BASE, MAX_PUNTOS_REVISION, limpiarPuntos, puntosRevision, agregarPunto, renombrarPunto, quitarPunto, moverPunto } from "./revision-diseno-puntos";

test("sin configuración (o vacía) se usan los 6 de siempre", () => {
  expect(puntosRevision(undefined)).toEqual(PUNTOS_REVISION_BASE);
  expect(puntosRevision({ checklistRevision: [] })).toEqual(PUNTOS_REVISION_BASE);
  expect(puntosRevision({ checklistRevision: ["", "  "] })).toEqual(PUNTOS_REVISION_BASE);
  expect(puntosRevision({}).length).toBe(6);
});

test("la lista configurada manda; se limpian espacios, vacíos y repetidos (sin importar tildes ni mayúsculas)", () => {
  expect(puntosRevision({ checklistRevision: ["  Largo  total ", "Medidas", "medidas", "MEDÍDAS", "", "Cierre"] })).toEqual(["Largo total", "Medidas", "Cierre"]);
  expect(limpiarPuntos(Array.from({ length: 30 }, (_, i) => `Punto ${i}`)).length).toBe(MAX_PUNTOS_REVISION);
  expect(limpiarPuntos(null)).toEqual([]);
});

test("el punto base no se comparte por referencia (editar no daña los 6 originales)", () => {
  const a = puntosRevision({});
  a.push("X");
  expect(puntosRevision({}).length).toBe(6);
});

test("agregar: vacío, repetido y tope", () => {
  expect(agregarPunto(["A"], "  ").ok).toBe(false);
  expect(agregarPunto(["Medidas"], "medidas").motivo).toMatch(/ya está/);
  const r = agregarPunto(["A"], " Cierre  y  botones ");
  expect(r).toEqual({ ok: true, lista: ["A", "Cierre y botones"], motivo: "" });
  const llena = Array.from({ length: MAX_PUNTOS_REVISION }, (_, i) => `P${i}`);
  expect(agregarPunto(llena, "Otro").ok).toBe(false);
});

test("renombrar: no deja vacío ni repetir otro punto, pero sí cambiar mayúsculas del mismo", () => {
  const l = ["Medidas", "Tela"];
  expect(renombrarPunto(l, 0, "").ok).toBe(false);
  expect(renombrarPunto(l, 0, "tela").motivo).toMatch(/otro punto/);
  expect(renombrarPunto(l, 0, "MEDIDAS").lista).toEqual(["MEDIDAS", "Tela"]);
  expect(renombrarPunto(l, 5, "X").ok).toBe(false);
  expect(l).toEqual(["Medidas", "Tela"]); // no muta
});

test("quitar: siempre queda al menos uno; mover sube y baja sin salirse", () => {
  expect(quitarPunto(["A"], 0).ok).toBe(false);
  expect(quitarPunto(["A", "B", "C"], 1).lista).toEqual(["A", "C"]);
  expect(moverPunto(["A", "B", "C"], 1, -1)).toEqual(["B", "A", "C"]);
  expect(moverPunto(["A", "B", "C"], 2, 1)).toEqual(["A", "B", "C"]);
  expect(moverPunto(["A", "B", "C"], 0, -1)).toEqual(["A", "B", "C"]);
});
