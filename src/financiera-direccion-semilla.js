// (2026-11-08) Datos de los extractos de Bancolombia de Fredy (cuenta corriente ene–oct 2026, crédito corte nov 2026, tarjetas corte 15 oct 2026)
// para el botón «Cargar datos de mis extractos» de Dirección financiera. Sin números de cuenta. Se pueden editar después en la pantalla.
export const SEMILLA_EXTERNAS = [
  { id: "ext_credito_bancolombia", tipo: "banco", nombre: "Crédito Bancolombia", saldo: 63709958, tasaEA: 28.32, pagoMensual: 3686699, diaPago: 24, nota: "Cuota 31 · desembolsado en abr 2024 por $136,9 M · extracto nov 2026" },
  { id: "ext_tarjeta_visa", tipo: "tarjeta", nombre: "Tarjeta Visa", saldo: 5105856, tasaEA: 28.56, pagoMensual: 724985, diaPago: 3, nota: "Corte 15 oct 2026 · cupo $5 M agotado · pago mínimo" },
  { id: "ext_tarjeta_master", tipo: "tarjeta", nombre: "Tarjeta Master (pesos y dólares)", saldo: 5213634, tasaEA: 28.56, pagoMensual: 865000, diaPago: 3, nota: "Corte 15 oct 2026 · $1.560.258 + US$1.136 al cambio de ~$3.216 · pago mínimo $627.000 + US$74" },
];

export const SEMILLA_BANCO = [
  { ym: "2026-01", abonos: 127150000, cargos: 127251605.25, c4x1000: 506978, comisiones: 14244, plan: 69486, cupo: 59381, sobregiro: 0 },
  { ym: "2026-02", abonos: 406813103.11, cargos: 382212883.28, c4x1000: 1522689, comisiones: 366810, plan: 64356, cupo: 52728, sobregiro: 0 },
  { ym: "2026-03", abonos: 510480808, cargos: 535084417.37, c4x1000: 2129824, comisiones: 61997, plan: 74256, cupo: 59381, sobregiro: 0 },
  { ym: "2026-04", abonos: 474157999, cargos: 474157999, c4x1000: 1729306, comisiones: 46231, plan: 74256, cupo: 59381, sobregiro: 0 },
  { ym: "2026-05", abonos: 374600000, cargos: 373961321.63, c4x1000: 1651641, comisiones: 520446, plan: 74256, cupo: 59381, sobregiro: 0 },
  { ym: "2026-06", abonos: 236806608, cargos: 228208411.54, c4x1000: 909197, comisiones: 462489, plan: 74256, cupo: 59381, sobregiro: 0 },
  { ym: "2026-07", abonos: 476360508, cargos: 485593583.94, c4x1000: 1934636, comisiones: 20825, plan: 74256, cupo: 59381, sobregiro: 0 },
  { ym: "2026-08", abonos: 559950174.5, cargos: 559953973.39, c4x1000: 2195064, comisiones: 443763, plan: 71781, cupo: 59381, sobregiro: 0 },
  { ym: "2026-09", abonos: 688882194, cargos: 688872054.77, c4x1000: 2774377, comisiones: 367924, plan: 74256, cupo: 59381, sobregiro: 0 },
  { ym: "2026-10", abonos: 424612001, cargos: 424645546.18, c4x1000: 1691815, comisiones: 279674, plan: 74256, cupo: 59381, sobregiro: 233 },
];
