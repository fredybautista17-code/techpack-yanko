// Pruebas de la lógica pura de las combinaciones de la prenda.
// Correr con: CI=true npx react-scripts test --watchAll=false src/combinaciones-prenda.test.js
import { detectarZonas, materialesActivos, verificarDibujo, pintarZonas, zonaEnPunto, telasSugeridas, filaVacia, filaCompleta, nombreFila, coloresDeFilas, idPrenda, recortarContenido } from "./combinaciones-prenda";
import { estadoCombinaciones, faltantesPaso, pasosDeReferencia, PASOS_SEMAFORO } from "./ficha-inicio-calculo";

// Dibujo de juguete 40×20: fondo blanco, una prenda con borde negro; mitad izquierda blanca (M1), parte derecha lila (M2) y una franja gris (M3)
function dibujo() {
  const w = 40, h = 20, d = new Uint8ClampedArray(w * h * 4);
  const poner = (x, y, c) => { const k = 4 * (y * w + x); d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) poner(x, y, [255, 255, 255]);
  for (let y = 4; y <= 15; y++) for (let x = 5; x <= 34; x++) {
    const borde = y === 4 || y === 15 || x === 5 || x === 34;
    poner(x, y, borde ? [20, 20, 20] : x < 18 ? [255, 255, 255] : x < 28 ? [222, 200, 238] : [204, 203, 204]);
  }
  return { d, w, h };
}

test("detecta blanco, lila y gris y separa el fondo", () => {
  const { d, w, h } = dibujo();
  const det = detectarZonas(d, w, h);
  expect(det.lab[0]).toBe(-2); // esquina = fondo
  expect(det.lab[8 * w + 10]).toBe(0); // blanco dentro de la prenda
  expect(det.lab[8 * w + 22]).toBe(1);
  expect(det.lab[8 * w + 31]).toBe(2);
  expect(materialesActivos(det)).toEqual([0, 1, 2]);
  expect(det.pct[0] + det.pct[1] + det.pct[2]).toBeCloseTo(100, 5);
  expect(zonaEnPunto(det, 22, 8)).toBe(1);
  expect(zonaEnPunto(det, 5, 8)).toBe(0); // sobre la línea del borde: toma la zona de al lado
});

test("el verificador acepta un dibujo con zonas y rechaza una imagen sin prenda", () => {
  const { d, w, h } = dibujo();
  expect(verificarDibujo(detectarZonas(d, w, h)).ok).toBe(true);
  const vacio = new Uint8ClampedArray(w * h * 4).fill(255);
  const v = verificarDibujo(detectarZonas(vacio, w, h));
  expect(v.ok).toBe(false);
  expect(v.avisos.length).toBeGreaterThan(0);
});

test("pintar cambia solo la zona escogida y deja el fondo y las líneas", () => {
  const { d, w, h } = dibujo();
  const det = detectarZonas(d, w, h);
  const out = pintarZonas(d, det, ["#FF0000", "#00FF00", null], -1);
  const k = (x, y) => 4 * (y * w + x);
  expect([out[k(10, 8)], out[k(10, 8) + 1], out[k(10, 8) + 2]]).toEqual([255, 0, 0]); // M1 rojo
  expect(out[k(22, 8) + 1]).toBeGreaterThan(out[k(22, 8)]); // M2 verde
  expect(out[k(0, 0)]).toBe(255); // fondo intacto
  expect(out[k(5, 8)]).toBeLessThan(40); // borde negro intacto
  const foco = pintarZonas(d, det, ["#FF0000", "#00FF00", null], 0);
  expect(foco[k(22, 8)]).toBeGreaterThan(out[k(22, 8)]); // lo que no es el foco se aclara
});

test("telas sugeridas desde el texto de la ficha", () => {
  expect(telasSugeridas("AMORELA Y BOSSTEX")).toEqual(["Amorela", "Bosstex"]);
  expect(telasSugeridas("amorela / bosstex, amorela")).toEqual(["Amorela", "Bosstex"]);
  expect(telasSugeridas("")).toEqual([]);
});

test("filas: nombre, completa y colores de la ficha", () => {
  const a = { id: "a", nombre: "VERDE" }, b = { id: "b", nombre: "LILA" };
  const f1 = { id: "1", m: [a, b, a] }, f2 = { id: "2", m: [a, null, null] };
  expect(nombreFila(f1, [0, 1, 2])).toBe("VERDE / LILA");
  expect(filaCompleta(f1, [0, 1, 2])).toBe(true);
  expect(filaCompleta(f2, [0, 1, 2])).toBe(false);
  expect(filaCompleta(f2, [0])).toBe(true);
  expect(filaVacia("z").m).toEqual([null, null, null]);
  expect(coloresDeFilas([f1, f2], [0, 1, 2]).map((c) => c.id)).toEqual(["a"]);
  expect(idPrenda("98-521")).toBe("98521");
});

test("el paso Combinaciones del semáforo sale solo de las combinaciones de la ficha", () => {
  expect(PASOS_SEMAFORO[2]).toBe("Combinaciones");
  const c = (id) => ({ id });
  expect(estadoCombinaciones(null)).toBe(0);
  expect(estadoCombinaciones({ combinaciones: { activos: [0, 1], filas: [] } })).toBe(0);
  expect(estadoCombinaciones({ combinaciones: { activos: [0, 1], filas: [{ id: "1", m: [c("a"), null, null] }] } })).toBe(1);
  expect(estadoCombinaciones({ combinaciones: { activos: [0, 1], filas: [{ id: "1", m: [c("a"), c("b"), null] }] } })).toBe(2);
  const f = { colores: [], vinilos: [], pasos: {}, combinaciones: { activos: [0], filas: [{ id: "1", m: [c("a"), null, null] }] } };
  expect(pasosDeReferencia(f, { itemId: "i" }, false).estados[2]).toBe(2);
});

test("el paso Colores exige el dibujo plano y las combinaciones completas (solo cuando se pide)", () => {
  const f = { colores: [{ id: "x" }], combinaciones: null };
  expect(faltantesPaso(f, 3, {})).toEqual([]); // sin ctx: regla vieja (basta un color)
  expect(faltantesPaso(f, 3, {}, { exigirDibujo: true, tieneDibujo: false })[0]).toMatch(/dibujo plano/);
  expect(faltantesPaso(f, 3, {}, { exigirDibujo: true, tieneDibujo: true })[0]).toMatch(/al menos un color/);
  const f2 = { colores: [{ id: "x" }], combinaciones: { activos: [0, 1], filas: [{ id: "1", m: [{ id: "a" }, null, null] }] } };
  expect(faltantesPaso(f2, 3, {}, { exigirDibujo: true, tieneDibujo: true })[0]).toMatch(/le falta un material/);
  const f3 = { colores: [{ id: "x" }], combinaciones: { activos: [0, 1], filas: [{ id: "1", m: [{ id: "a" }, { id: "b" }, null] }] } };
  expect(faltantesPaso(f3, 3, {}, { exigirDibujo: true, tieneDibujo: true })).toEqual([]);
});

test("recortar: deja solo la prenda con su margen", () => {
  const { d, w, h } = dibujo();
  expect(recortarContenido(d, w, h, 2)).toEqual({ x: 3, y: 2, w: 34, h: 16 });
  expect(recortarContenido(new Uint8ClampedArray(w * h * 4).fill(255), w, h)).toEqual({ x: 0, y: 0, w, h });
});
