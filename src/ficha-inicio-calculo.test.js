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
