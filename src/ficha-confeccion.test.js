import { parseNum, fmtMin, aBorrador, aGuardar, hayCambios, totalMinutos, contarOperaciones, tiposDeMaquina, sugerencias, encabezadoFicha, itemsConFicha, nombreArchivoFicha, opVacia } from "./ficha-confeccion";

test("parseNum acepta coma y punto, nunca negativos ni basura", () => {
  expect(parseNum("0,45")).toBe(0.45);
  expect(parseNum("1.5")).toBe(1.5);
  expect(parseNum("abc")).toBe(0);
  expect(parseNum("-3")).toBe(0);
  expect(fmtMin(5.055)).toBe("5,06");
});

test("aGuardar quita filas vacías, convierte números y exige repetición ≥ 1", () => {
  const b = { descripcion: " Camiseta ", observaciones: "", operaciones: [{ id: "a", d: "Cerrar hombros", m: "Fileteadora", a: "14", p: "", r: "2", o: "", t: "0,45" }, opVacia(), { id: "b", d: "x", m: "", a: "", p: "", r: "0", o: "", t: "" }] };
  const g = aGuardar(b, "Laura", "2026-11-26T10:00:00Z");
  expect(g.descripcion).toBe("Camiseta");
  expect(g.operaciones.length).toBe(2);
  expect(g.operaciones[0]).toMatchObject({ r: 2, t: 0.45, m: "Fileteadora" });
  expect(g.operaciones[1].r).toBe(1);
  expect(g.editadoPor).toBe("Laura");
});

test("ida y vuelta guardado→borrador→guardado no cambia nada", () => {
  const g = aGuardar({ descripcion: "d", observaciones: "o", operaciones: [{ id: "a", d: "x", m: "m", a: "", p: "", r: "1", o: "", t: "0,5" }] }, "u", "t");
  expect(hayCambios(aBorrador(g), g)).toBe(false);
  const b = aBorrador(g); b.operaciones[0].t = "0,7";
  expect(hayCambios(b, g)).toBe(true);
  expect(hayCambios(aBorrador(null), null)).toBe(false);
});

test("totales", () => {
  const ops = [{ d: "a", m: "X", t: "0,45" }, { d: "b", m: "x", t: "0.55" }, { d: "", m: "", t: "" }];
  expect(totalMinutos(ops)).toBeCloseTo(1.0);
  expect(contarOperaciones(ops)).toBe(2);
  expect(tiposDeMaquina(ops)).toBe(1);
});

test("sugerencias: lo más usado primero y la semilla al final sin repetir", () => {
  const items = [
    { fichaConfeccion: { operaciones: [{ m: "Recubridora 2 agujas", a: "14", p: "Recubierta" }, { m: "Plana 1 aguja", a: "14" }] } },
    { fichaConfeccion: { operaciones: [{ m: "recubridora 2 agujas", a: "11" }] } },
    {}, null,
  ];
  const s = sugerencias(items);
  expect(s.maquinas[0]).toBe("Recubridora 2 agujas");
  expect(s.maquinas.filter((x) => x.toLowerCase() === "plana 1 aguja").length).toBe(1);
  expect(s.maquinas).toContain("Collarín");
  expect(s.agujas[0]).toBe("14");
});

test("encabezado sale de la referencia", () => {
  const e = encabezadoFicha({ categoria: "Sisa", silueta: "Slimfit", rango: "Normal (S,M,L,XL)", tipoTela: "ONEAL", reference: "98-6678", numPrototipo: "P-1", baseMolderia: "BM-5" }, "ref", { name: "Kamila", createdAt: "2026-08-12" });
  expect(e).toMatchObject({ capsula: "Kamila", fechaColeccion: "2026-08-12", textil: "ONEAL", prototipo: "P-1", base: "BM-5" });
  expect(encabezadoFicha({ reference: "9-1", tallas: ["S", "M"] }, "proto", null)).toMatchObject({ prototipo: "9-1", talla: "S, M", capsula: "" });
});

test("itemsConFicha junta prototipos y referencias de cápsula; nombre de archivo limpio", () => {
  expect(itemsConFicha([{ id: 1 }], [{ referencias: [{ id: 2 }, { id: 3 }] }, {}]).length).toBe(3);
  expect(nombreArchivoFicha({ reference: "98 6678/x" }, "2026-11-26")).toBe("PROCESO-MUESTRA_98_6678_x_2026-11-26.xlsx");
});
