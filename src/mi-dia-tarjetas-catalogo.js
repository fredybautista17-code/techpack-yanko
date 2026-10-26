// ─── MI DÍA POR LÍDER — catálogo de tarjetas ─────────────────────────────────
// (2026-10-26, a pedido de Fredy) Cada usuario puede tener marcadas las tarjetas que ve en su «Mi Día»
// (campo `tarjetasMiDia` en su ficha de Usuarios). Primera entrega: las del cierre diario de su área.
// Si el usuario no tiene ninguna marcada, su Mi Día sigue siendo el de siempre.
import { claveArea } from "./centro-costo-historico-parser";

export const TARJETAS_MI_DIA = [
  { id: "meta_hoy", label: "Meta de hoy", grupo: "Cierre diario de su área" },
  { id: "saldo_acumulado", label: "Saldo acumulado (mes / año / total)", grupo: "Cierre diario de su área" },
  { id: "cubren_salario", label: "Cubren su salario hoy", grupo: "Cierre diario de su área" },
  { id: "meta_dia", label: "Meta día a día", grupo: "Cierre diario de su área" },
  { id: "trabajadores", label: "Cada trabajador del área", grupo: "Cierre diario de su área" },
];
export const TARJETAS_DEFECTO_MIDIA = ["meta_hoy", "saldo_acumulado", "cubren_salario", "meta_dia"];

const AREAS_CON_CIERRE = ["CORTE", "ZONACALOR", "CONTROLCALIDAD"];
// Clave del área con cierre diario a partir de su «Área Interna» (null si su área no tiene cierre diario todavía).
export function claveCierreDeArea(areaNomina) {
  if (!areaNomina) return null;
  const c = claveArea(areaNomina);
  return AREAS_CON_CIERRE.includes(c) ? c : null;
}
