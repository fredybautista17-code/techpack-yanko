// (2026-11-09, a pedido de Fredy) Lectura de los gastos de Planta (área MAQUILA: repuestos, hilazas…) que se registran en Planta / Centro de Costo
// (colección centro_costo_gastos) para que entren como provisión en todo Financiera. Solo lectura. El cálculo está en financiera-cuanto-pagar-calculo.js.
import { collection, getDocs, query, where } from "firebase/firestore";
import { sumarMes } from "./financiera-cuanto-pagar-calculo";

export const esAreaMaquila = (g) => String((g && g.area) || "").trim().toUpperCase() === "MAQUILA";

// Gastos de MAQUILA desde 12 meses antes de ym (alcanza para promediar 6 meses en cada mes de la ventana de cálculo). Si falla la lectura devuelve [].
export async function leerGastosPlanta(db, ym) {
  const desde = `${sumarMes(ym, -12)}-01`;
  const snap = await getDocs(query(collection(db, "centro_costo_gastos"), where("fecha", ">=", desde)));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter(esAreaMaquila);
}
