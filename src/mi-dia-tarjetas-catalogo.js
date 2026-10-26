// ─── MI DÍA POR LÍDER — catálogo de tarjetas ─────────────────────────────────
// (2026-10-26, a pedido de Fredy) Cada usuario puede tener marcadas las piezas que ve en su «Mi Día» (campo
// `tarjetasMiDia` en su ficha de Usuarios). Las piezas marcadas se suman, una debajo de otra. Si el usuario no tiene
// ninguna marcada, su Mi Día sigue siendo el de siempre.
import { claveArea } from "./centro-costo-historico-parser";

export const GRUPOS_MI_DIA = [
  {
    id: "cierre", titulo: "Cierre diario de su área", requiere: "area",
    tarjetas: [
      { id: "meta_hoy", label: "Meta de hoy" },
      { id: "saldo_acumulado", label: "Saldo acumulado (mes / año / total)" },
      { id: "cubren_salario", label: "Cubren su salario hoy" },
      { id: "meta_dia", label: "Meta día a día" },
      { id: "trabajadores", label: "Cada trabajador del área" },
    ],
  },
  {
    id: "planeacion", titulo: "Planeación",
    tarjetas: [
      { id: "recibir_hoy", label: "Lotes por recibir hoy" },
      { id: "mesones_hoy", label: "Programación de mesones (hoy)" },
      { id: "bmp_vencidos", label: "BMP vencidos (pedido)" },
      { id: "bmp_urgentes", label: "BMP urgentes (≤7 días)" },
      { id: "plantas_vencidas", label: "Plantas vencidas" },
      { id: "plantas_urgentes", label: "Plantas urgentes (≤7 días)" },
      { id: "tabla_plantas", label: "Tabla: plantas, cumplimiento de pedidos" },
      { id: "tabla_bmp", label: "Tabla: BMP pendiente de programar" },
    ],
  },
  {
    id: "programacion", titulo: "Programación de procesos", requiere: "procesos",
    tarjetas: [{ id: "programador", label: "Mi programación (Programador de Procesos)" }],
  },
  {
    id: "nomina", titulo: "Nómina",
    tarjetas: [{ id: "auditoria_nomina", label: "Auditoría Busint vs Nómina (todas las áreas)" }],
  },
];

const ids = (grupo) => GRUPOS_MI_DIA.find((g) => g.id === grupo).tarjetas.map((t) => t.id);
export const IDS_CIERRE = ids("cierre");
export const IDS_PLANEACION = ids("planeacion");
export const TARJETAS_MI_DIA = GRUPOS_MI_DIA.flatMap((g) => g.tarjetas.map((t) => ({ ...t, grupo: g.titulo })));
export const TARJETAS_DEFECTO_MIDIA = ["meta_hoy", "saldo_acumulado", "cubren_salario", "meta_dia"];

const AREAS_CON_CIERRE = ["CORTE", "ZONACALOR", "CONTROLCALIDAD"];
// Clave del área con cierre diario a partir de su «Área Interna» (null si su área no tiene cierre diario todavía).
export function claveCierreDeArea(areaNomina) {
  if (!areaNomina) return null;
  const c = claveArea(areaNomina);
  return AREAS_CON_CIERRE.includes(c) ? c : null;
}
