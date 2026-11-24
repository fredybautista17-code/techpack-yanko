// ─── Accesos por ÁREAS: del rol y, si hace falta, propios de cada usuario ─────────────────────────────────────────────
// (2026-11-24, a pedido de Fredy, maqueta «usuario-areas») Hasta hoy lo que ve una persona lo decidía solo su rol (config.roles[].modulos), así que dos
// personas que ven cosas distintas necesitaban dos roles. Ahora cada usuario puede tener su propia lista de áreas (users/{id}.modulosPropios, un arreglo
// de las mismas llaves de módulo). Sin lista propia (null/ausente) todo sigue igual que siempre: manda el rol. Los permisos de acción (editar, aprobar...)
// se siguen definiendo en el rol.

// Claves granulares de sección dentro de Diseño (Corte y Contabilidad siempre se gestionan como llaves independientes, nunca implícitas en "diseno").
export const DISENO_SUBMODULOS = ["protos", "capsulas", "pedidos", "pedidos_clientes", "stats", "historial", "cronograma_muestras", "bitacora", "observaciones"];
// Claves granulares de pestaña dentro del módulo "Áreas" ("areas_internas" queda como llave de compatibilidad: habilita las 4).
export const AREAS_SUBMODULOS = ["areas_centro_costo", "areas_estadisticas", "areas_reclamos", "areas_programador"];

// Llaves que muestran (o no) la pestaña «Flujo» de Gestión de Pedido: es la misma condición del área Pedidos del menú (sin Preórdenes ni Órdenes).
export const LLAVES_AREA_PEDIDOS = ["pedidos", "pedidos_clientes", "explosion_materiales", "lotes_por_integrar", "corte"];

// Lista de llaves de un rol, ya expandida: las llaves viejas «diseno» y «areas_internas» pasan a sus secciones, y el permiso viejo «control_despacho»
// (de Permisos de flujo) cuenta como la llave de Bodega «bodega_control_despacho». Sirve de punto de partida para la lista propia de un usuario.
export function modulosDeRol(rol) {
  if (!rol) return [];
  const perms = Array.isArray(rol.perms) ? rol.perms : [];
  const base = Array.isArray(rol.modulos) ? rol.modulos : ["diseno", ...(perms.includes("corte") ? ["corte"] : []), ...(perms.includes("admin") ? ["contabilidad"] : [])];
  const salida = new Set(base.filter((m) => m !== "diseno" && m !== "areas_internas"));
  if (base.includes("diseno")) DISENO_SUBMODULOS.forEach((m) => salida.add(m));
  if (base.includes("areas_internas")) AREAS_SUBMODULOS.forEach((m) => salida.add(m));
  if (perms.includes("control_despacho")) salida.add("bodega_control_despacho");
  return [...salida];
}

// Datos de rol que se usan para decidir qué ve el usuario: si tiene lista propia, esa lista reemplaza a los módulos del rol (los permisos de acción
// siguen siendo los del rol). Sin lista propia devuelve el rol tal cual. El permiso viejo «control_despacho» se quita para que, con lista propia, solo
// cuente lo que esté marcado en la lista.
export function datosRolDeUsuario(rol, listaPropia) {
  if (!Array.isArray(listaPropia)) return rol;
  const base = rol || {};
  return { ...base, perms: (Array.isArray(base.perms) ? base.perms : []).filter((p) => p !== "control_despacho"), modulos: listaPropia };
}
