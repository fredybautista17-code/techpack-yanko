// Pruebas de la lógica pura de la Ficha de inicio y del candado de corte (sin Firebase ni pantalla).
// Correr con: CI=true npx react-scripts test --watchAll=false src/ficha-inicio-calculo.test.js
import {
  PASOS_SEMAFORO, PASOS_MANUALES, ETAPAS_PEDIDO, ETAPA_CORTE, pasosDeReferencia, siguientePaso, pasosHechos,
  evaluarPedido, pedidoPorReferencia, itemsDePedido, distribuirPorTalla, tallasDeRango, parseCurva,
} from "./ficha-inicio-calculo";

const item = { itemId: "i1", referencia: "98-9024", colombiaCantidad: "100", rango: "Normal (S,M,L,XL)", pedidoVinculado: { numero: "500" } };
const pre = [
  { id: "p1", cliente: "Kamila Colombia", estado: "aprobada", items: [item, { itemId: "i2", referencia: "98-9025", colombiaCantidad: "60", rango: "Normal (S,M,L,XL)" }] },
  { id: "p2", cliente: "Otro", estado: "montada", items: [{ itemId: "i3", referencia: "11-1" }] },
];
const pedido = { id: "ped500", numero: "500", cliente: "Kamila Colombia", estado: "activo", referencias: [{ ref: "989024" }], seguimiento: {} };

test("los pasos y las etapas son 10 y «Montar pedido» va después de la Ficha técnica", () => {
  expect(PASOS_SEMAFORO).toHaveLength(10);
  expect(PASOS_SEMAFORO[5]).toBe("Ficha técnica");
  expect(PASOS_SEMAFORO[6]).toBe("Montar pedido");
  expect(ETAPAS_PEDIDO).toHaveLength(10);
  expect(ETAPAS_PEDIDO[ETAPA_CORTE]).toBe("Corte");
});

test("lo que la ficha guarda a mano (pasos 0, 3 y 5) no se corre al agregar pasos", () => {
  expect(PASOS_MANUALES).toEqual([0, 3, 5]);
});

test("el paso Montar pedido se marca solo cuando la referencia ya está en un pedido", () => {
  expect(pasosDeReferencia(null, item, true).estados[6]).toBe(2);
  expect(pasosDeReferencia(null, item, false).estados[6]).toBe(0);
});

test("siguientePaso y pasosHechos", () => {
  expect(siguientePaso([2, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
  expect(siguientePaso([2, 2, 2, 2, 2, 2, 2, 2, 2, 0])).toBe(-1);
  expect(pasosHechos([2, 1, 0, 2])).toBe(2);
});

test("un pedido no puede cortar hasta completar las 9 etapas anteriores, y Montar pedido siempre está hecha", () => {
  const { est } = evaluarPedido(pedido, pre, {}, false);
  expect(est.hechas[6]).toBe(true);
  expect(est.puedeCortar).toBe(false);
  expect(est.faltan).toHaveLength(8);
  expect(est.siguiente).toBe(0);
});

test("un pedido que ya se cortó no se bloquea", () => {
  expect(evaluarPedido(pedido, pre, {}, true).est.corteLibre).toBe(true);
});

test("un pedido sin preorden enlazada se marca a mano, pero Montar pedido igual está hecha", () => {
  const { enlaces, est } = evaluarPedido({ numero: "9", seguimiento: {} }, [], {}, false);
  expect(enlaces).toHaveLength(0);
  expect(est.hechas[6]).toBe(true);
  expect(est.derivada[0]).toBe(false);
});

test("con todas las etapas manuales marcadas y sin referencias enlazadas el pedido puede cortar", () => {
  const seg = {};
  ETAPAS_PEDIDO.slice(0, 9).forEach((k) => { seg[k] = true; });
  expect(evaluarPedido({ numero: "9", seguimiento: seg }, [], {}, false).est.puedeCortar).toBe(true);
});

test("el enlace pedido ↔ referencia solo usa preórdenes aprobadas", () => {
  expect(itemsDePedido(pedido, pre).map((x) => x.item.itemId)).toEqual(["i1"]);
  const mapa = pedidoPorReferencia([pedido], pre);
  expect(mapa["p1|i1"].numero).toBe("500");
  expect(mapa["p1|i2"]).toBeUndefined();
});

test("tallas y curvas", () => {
  expect(tallasDeRango("Normal (S,M,L,XL)")).toEqual(["S", "M", "L", "XL"]);
  expect(parseCurva("8-10-12-14")).toEqual([8, 10, 12, 14]);
  const d = distribuirPorTalla({ S: 1, M: 2, L: 2, XL: 1 }, 100, ["S", "M", "L", "XL"]);
  expect(Object.values(d).reduce((a, b) => a + b, 0)).toBe(100);
});

// ───────── Maestro de colores sincronizado con Busint ─────────
import { leerInformeBusintColores, planSincronizacion, parsearColoresPegados, normHex, esCombinado, estadoColor, colorSePuedePintar, snapshotColor } from "./ficha-inicio-calculo";

const filasBusint = [
  ["2026-11-24 -", "0.41"], [null, null, null, "Texto31"], ["ACTIVOS"],
  [null, "004", null, "NEGRO", "Sí"], [null, "034", null, "VERDE", "Sí"], [null, "042", null, "VERDE BENETTON", "Sí"],
  [null, "525", null, "AZUL BEBE", "Sí"], [null, "536", null, "AZUL BEBÉ", "Sí"], [null, "336", null, "AMARILLO/NEGRO", "Sí"],
  [null, "554", null, "", "Sí"], ["INACTIVOS"], [null, "038", null, "VERDE HOJA", "No"], [null, "7", null, "", "No"], ["Texto24:", "556"],
];

test("leerInformeBusintColores toma código, nombre y activo; ignora títulos y totales", () => {
  const r = leerInformeBusintColores(filasBusint);
  expect(r).toHaveLength(9);
  expect(r.find((x) => x.cod === "042")).toEqual({ cod: "042", nombre: "VERDE BENETTON", activo: true });
  expect(r.find((x) => x.cod === "554").nombre).toBe("");
  expect(r.find((x) => x.cod === "038").activo).toBe(false);
});

test("planSincronizacion: une por nombre, corrige el código, crea el resto y avisa lo raro", () => {
  const informe = leerInformeBusintColores(filasBusint);
  const existentes = [{ id: "a", nombre: "NEGRO", codBusint: "26", codProveedor: "10" }, { id: "b", nombre: "verde" }];
  const p = planSincronizacion(existentes, informe);
  expect(p.unidos.map((u) => [u.ex.id, u.cod, u.antes])).toEqual([["a", "004", "26"], ["b", "034", ""]]);
  expect(p.nuevos.map((n) => n.cod)).toEqual(["042", "525", "536", "336", "554"]);
  expect(p.nuevos.find((n) => n.cod === "336").combinado).toBe(true);
  expect(p.nuevos.find((n) => n.cod === "525").repetido).toBe(true); // AZUL BEBE = AZUL BEBÉ sin tildes
  expect(p.nuevos.find((n) => n.cod === "554").nombre).toBe("(sin nombre) 554");
  expect(p.sinNombre).toEqual(["554"]);
  expect(p.inactivosNoCargados).toBe(2);
  expect(p.huerfanos).toHaveLength(0);
});

test("planSincronizacion: lo que ya tiene el código no se duplica y un código raro queda como aviso", () => {
  const informe = leerInformeBusintColores(filasBusint);
  const p = planSincronizacion([{ id: "x", nombre: "VERDE BENETTON", codBusint: "042" }, { id: "y", nombre: "ROJO", codBusint: "999" }, { id: "z", nombre: "Verde hoja", codBusint: "038" }], informe);
  expect(p.vinculados).toBe(1);
  expect(p.porMarcar.map((m) => m.cod)).toEqual(["042"]);
  expect(p.nuevos.find((n) => n.cod === "042")).toBeUndefined();
  expect(p.huerfanos.map((h) => h.cod)).toEqual(["999"]);
  expect(p.inactivosMarcados.map((m) => m.cod)).toEqual(["038"]);
});

test("pegar colores: acepta hex y Pantone, usa el código de Busint como llave", () => {
  const r = parsearColoresPegados("LILA ; ; 106 ; B4A3CE ; 14-3612 TCX\nOTRO ; ; 106\nVerde ; PV ; ; #zzz", [{ nombre: "x", codBusint: "042" }]);
  expect(r.nuevos).toEqual([{ nombre: "LILA", codProveedor: "", codBusint: "106", hex: "#B4A3CE", pantone: "14-3612 TCX" }, { nombre: "Verde", codProveedor: "PV", codBusint: "" }]);
  expect(r.repetidos).toEqual(["OTRO"]);
  expect(parsearColoresPegados("X ; ; 042", [{ nombre: "x", codBusint: "042" }]).repetidos).toEqual(["X"]);
});

test("hex, combinados y estado de un color", () => {
  expect(normHex("b4a3ce")).toBe("#B4A3CE");
  expect(normHex("#12")).toBe("");
  expect(esCombinado("NEGRO/BLANCO")).toBe(true);
  expect(esCombinado("NEGRO")).toBe(false);
  expect(estadoColor({ busintSync: true })).toBe("busint");
  expect(estadoColor({ busintSync: true, activoBusint: false })).toBe("inactivo");
  expect(estadoColor({})).toBe("solo");
  expect(colorSePuedePintar({ hex: "#234654" })).toBe(true);
  expect(colorSePuedePintar({ hex: "" })).toBe(false);
  expect(snapshotColor({ id: "1", nombre: "A", hex: "#111111", pantone: "P" })).toMatchObject({ hex: "#111111", pantone: "P" });
});
