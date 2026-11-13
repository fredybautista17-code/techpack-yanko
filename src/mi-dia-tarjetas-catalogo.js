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
    // (2026-11-10, a pedido de Fredy) Ya no exige que el usuario sea del área CORTE: la persona de costos también ve el saldo de la tela.
    id: "consumo_tela", titulo: "Costo de tela (teórico contra real)",
    tarjetas: [{ id: "consumo_tela", label: "Saldo de costo de la tela: consumo teórico contra real, con lo pagado de más en pesos (trazos de ATLAS y rendimiento de Busint)" }],
  },
  {
    // (2026-11-10, a pedido de Fredy) Para la persona de costos: mismas órdenes de Contabilidad → Órdenes de compra. Su rol necesita ese permiso.
    id: "ordenes_compra", titulo: "Órdenes de compra",
    tarjetas: [
      { id: "oc_vencidas", label: "Órdenes de compra vencidas y por vencer" },
      { id: "oc_precios", label: "Precios de compra: insumos que subieron frente a la compra anterior" },
    ],
  },
  {
    // (2026-11-10, a pedido de Fredy) Cierre diario de áreas que NO son la del usuario (cumple / no cumple la meta). No exige «Área Interna».
    id: "cierre_areas", titulo: "Cierre de otras áreas (¿cumplen la meta?)",
    tarjetas: [
      { id: "cierre_corte", label: "Corte" },
      { id: "cierre_calidad", label: "Control de calidad" },
      { id: "cierre_zona_calor", label: "Zona de calor" },
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
    id: "lista", titulo: "Lista de pendientes por programar", requiere: "areaInterna",
    tarjetas: [{ id: "lista_programar", label: "Mi lista por programar (lotes de mi proceso: por programar, programados, vencidos, cumplidos)" }],
  },
  {
    id: "programacion", titulo: "Programación de procesos", requiere: "procesos",
    tarjetas: [{ id: "programador", label: "Mi programación (Programador de Procesos)" }],
  },
  {
    id: "nomina", titulo: "Nómina",
    tarjetas: [{ id: "auditoria_nomina", label: "Auditoría Busint vs Nómina (todas las áreas)" }],
  },
  {
    // (2026-11-10, a pedido de Fredy) Para Talento Humano (Midalys): quién cumple años hoy, en los próximos 3 días y en los próximos 30.
    // Quien tenga esta tarjeta marcada también recibe el correo automático (3 días antes y el mismo día). La lista se cambia en Nómina → Personal → Cumpleaños.
    id: "talento_humano", titulo: "Talento Humano",
    // (2026-11-11, a pedido de Fredy) Gastos de Talento Humano (conceptos ACTIV y *ACTI de Busint): lo gastado en el año, el presupuesto del año siguiente y las últimas facturas.
    tarjetas: [
      { id: "cumpleanos", label: "Cumpleaños de los trabajadores: hoy y próximos días (y recibe el correo de aviso, 3 días antes y el mismo día)" },
      { id: "gastos_talento", label: "Gastos de Talento Humano: lo gastado en el año, presupuesto del año siguiente y últimas facturas" },
    ],
  },
  {
    // (2026-11-12, a pedido de Fredy) Para Diseño y la Dirección Creativa: prototipos aprobados a los que nadie les ha creado cápsula (su «línea de trabajo»).
    id: "diseno", titulo: "Diseño",
    tarjetas: [
      { id: "diseno_sin_capsula", label: "Prototipos aprobados sin cápsula: su línea de trabajo, con fecha objetivo, responsable, cronograma por semanas e informe en Excel" },
      { id: "diseno_muestras", label: "Muestras por diseñadora: en taller, por revisar, a modificar y vencidas" },
      { id: "diseno_solicitudes_tela", label: "Solicitudes de tela: prototipos promovidos para programación de tela y avance de la tela" },
    ],
  },
];

const ids = (grupo) => GRUPOS_MI_DIA.find((g) => g.id === grupo).tarjetas.map((t) => t.id);
export const IDS_CIERRE = ids("cierre");
export const IDS_PLANEACION = ids("planeacion");
export const IDS_ORDENES_COMPRA = ids("ordenes_compra");
export const IDS_CIERRE_AREAS = ids("cierre_areas");
// «Área Interna» con la que se abre el cierre de cada tarjeta de «Cierre de otras áreas».
export const AREA_DE_TARJETA_CIERRE = { cierre_corte: "Corte", cierre_calidad: "Control de calidad", cierre_zona_calor: "Zona calor" };
export const TARJETAS_MI_DIA = GRUPOS_MI_DIA.flatMap((g) => g.tarjetas.map((t) => ({ ...t, grupo: g.titulo })));
export const TARJETAS_DEFECTO_MIDIA = ["meta_hoy", "saldo_acumulado", "cubren_salario", "meta_dia"];

// (2026-10-31) true si su «Área Interna» es CORTE (la tarjeta de consumo de tela solo aplica a Corte).
export function esAreaCorte(areaNomina) {
  return !!areaNomina && claveArea(areaNomina) === "CORTE";
}
const AREAS_CON_CIERRE = ["CORTE", "ZONACALOR", "CONTROLCALIDAD"];
// Clave del área con cierre diario a partir de su «Área Interna» (null si su área no tiene cierre diario todavía).
export function claveCierreDeArea(areaNomina) {
  if (!areaNomina) return null;
  const c = claveArea(areaNomina);
  return AREAS_CON_CIERRE.includes(c) ? c : null;
}
