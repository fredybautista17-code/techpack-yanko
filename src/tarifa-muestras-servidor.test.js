// La tarifa se calcula en el servidor (functions/tarifa-muestras.js) y se muestra en Costos con el código del navegador (muestras-calculo.js):
// esta prueba exige que den EXACTAMENTE el mismo costo y las mismas prendas. Si cambias una regla en uno, cámbiala en el otro.
import { costosDelMes, isoLocal } from "./muestras-calculo";
import { prendasCortadasPorMes } from "./muestras-tarifa";
const srv = require("../functions/tarifa-muestras");

const hoy = isoLocal(new Date());
const futuro = "2099-01-15";
const muestras = [
  { id: "a", taller: "Planta Yanko", fechaRecibida: "2026-10-05", estado: "recibida" },
  { id: "b", taller: "Planta Yanko", revisiones: [{ fecha: "2026-10-20" }], estado: "aprobado" },
  { id: "c", taller: "Planta Yanko", fechaEntrega: "2026-09-10", estado: "terminada" }, // estimada
  { id: "d", taller: "Taller Externo", fechaRecibida: "2026-10-08", estado: "recibida" },
  { id: "e", taller: "Taller Externo", fechaRecibida: "2026-10-09", estado: "recibida" },
  { id: "f", taller: "Taller Externo", fechaRecibida: "2026-10-10", estado: "recibida", eliminado: true },
  { id: "g", taller: "", fechaEntrega: futuro, estado: "enviado" }, // estimada en el futuro: se topa en hoy
  { id: "h", taller: "Taller Externo", fechaEntrega: "2026-09-20", estado: "pendiente" }, // no cuenta
  { id: "i", taller: "Otro", fechaRecibida: "2026-08-03", estado: "recibida" },
];
const cfg = {
  prestacionesPct: 52,
  personal: [
    { id: "p1", nombre: "ANA", taller: "Planta Yanko", sueldo: 2150000, conPrest: true, pctMuestras: 50, activa: true },
    { id: "p2", nombre: "LUZ", taller: "Planta Yanko", sueldo: 1800000, conPrest: false, pctMuestras: 100, activa: true },
    { id: "p3", nombre: "OFF", taller: "Planta Yanko", sueldo: 999999, activa: false },
    { id: "p4", nombre: "SIN", taller: "Otro", sueldo: 1000000 }, // sin conPrest ni pct: 100 %, sin prestaciones
  ],
  talleres: { taller_externo: { nombre: "Taller Externo", modo: "precio", precio: 60000 }, solo_presupuesto: { nombre: "Solo presupuesto", modo: "precio", precio: 1 } },
  presupuestos: { "2026-10": { solo_presupuesto: 5000000 } },
};
const pagos = { d: { valor: 75000 }, e: { pagada: true } };

test("el costo total de cada mes es el mismo en el servidor y en la pantalla", () => {
  ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2099-01"].forEach((mes) => {
    const pantalla = costosDelMes(muestras, cfg, pagos, mes).total;
    const servidor = srv.costoMesTotal(muestras, cfg, pagos, mes, hoy);
    expect(servidor).toBe(pantalla);
  });
  // y no es un cero trivial
  expect(srv.costoMesTotal(muestras, cfg, pagos, "2026-10", hoy)).toBeGreaterThan(0);
});

test("prendas cortadas: mismo resultado y base «prom3» / «mes» sobre meses cerrados", () => {
  const pedidos = [{ cortesRealizados: [{ fecha: "2026-10-03", totalUnidades: 1200 }, { fecha: "2026-11-10", totalUnidades: 999 }, { fecha: "2026-09-01", refs: [{ total: 400 }, { total: 100 }] }] }];
  expect(srv.prendasCortadasPorMes(pedidos)).toEqual(prendasCortadasPorMes(pedidos));
  expect(srv.mesesDeBase("2026-11-26", "prom3")).toEqual(["2026-10", "2026-09", "2026-08"]);
  expect(srv.mesesDeBase("2026-11-26", "mes")).toEqual(["2026-10"]);
  expect(srv.mesesDeBase("2027-01-02", "prom3")).toEqual(["2026-12", "2026-11", "2026-10"]);
  const r = srv.calcularTarifaAutomatica({ hoy: "2026-11-26", base: "prom3", muestras, cfg, pagos, pedidos });
  expect(r.prendas).toBe(1700); // el mes en curso (noviembre) no entra
  expect(r.valor).toBe(Math.round(r.costo / 1700));
  expect(r.filas.map((f) => f.mes)).toEqual(["2026-10", "2026-09", "2026-08"]);
});

test("sin datos no hay valor; el documento a escribir solo trae el número y su contexto", () => {
  expect(srv.calcularTarifaAutomatica({ hoy: "2026-11-26", base: "prom3", muestras, cfg, pagos, pedidos: [] }).valor).toBeNull();
  const r = srv.calcularTarifaAutomatica({ hoy: "2026-11-26", base: "mes", muestras, cfg, pagos, pedidos: [{ cortesRealizados: [{ fecha: "2026-10-02", totalUnidades: 2000 }] }] });
  const d = srv.documentoTarifaAutomatica(r, "2026-11-26T08:00:00Z");
  expect(Object.keys(d).sort()).toEqual(["automatica", "aviso", "base", "calculadoEn", "meses", "prendas", "valorPorPrenda"]);
  expect(d.valorPorPrenda).toBe(r.valor);
  expect(JSON.stringify(d)).not.toMatch(new RegExp(String(r.costo)));
});
