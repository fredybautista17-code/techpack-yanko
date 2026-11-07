// (2026-11-07, a pedido de Fredy) Saldo de Kamila Colombia y lo remisionado sin facturar, tomados de los Excel de TNS que ya se suben en
// Contabilidad → Cuadre por cliente (colecciones contabilidad_saldos_tns y contabilidad_remisiones_tns). Funciones puras.
// OJO: normalizarNombreCliente y mezclarCarteraTnsDocs son copia de las de modulo-contabilidad.jsx: si allá cambia la forma de leer la cartera, cambiarla acá también.

export const IVA_REMISIONES_KAMILA = 1.19;
export const EMPRESAS_CUADRE_TNS = [
  { id: "yanko", nombre: "Industrias Yanko" },
  { id: "indutex", nombre: "Indutex" },
];

export function normalizarNombreCliente(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !["SAS", "LTDA", "SA", "CIA", "LIMITADA", "S", "A"].includes(t))
    .join(" ");
}

// docs = documentos de contabilidad_saldos_tns ({ id, data() }); el corte «en vivo» (id "<empresa>_vivo") manda sobre el Excel si es más reciente.
export function mezclarCarteraTnsDocs(docs) {
  const excel = {};
  const vivo = {};
  (docs || []).forEach((d) => {
    if (d.id.endsWith("_vivo")) vivo[d.id.slice(0, -5)] = d.data();
    else excel[d.id] = d.data();
  });
  const out = { ...excel };
  Object.keys(vivo).forEach((emp) => {
    const v = vivo[emp];
    const x = excel[emp];
    if (!x || String(v.traidoEn || "") > String(x.cargadoEn || "")) out[emp] = { ...(x || {}), ...v, enVivo: true };
  });
  return out;
}

// Kamila Colombia = clientes de TNS cuyo nombre trae KAMILA y no trae VENEZUELA (Kamila Venezuela no se factura por TNS como Colombia).
export function esKamilaColombia(nombre) {
  const n = normalizarNombreCliente(nombre);
  return n.includes("KAMILA") && !n.includes("VENEZUELA");
}
const esKamila = (nombre) => normalizarNombreCliente(nombre).includes("KAMILA");
const num = (v) => Number(v) || 0;

// cartera = { yanko: doc, indutex: doc } (ya mezclada); remisiones = { yanko: doc, indutex: doc }; quitadas = contabilidad_cuadre_config/main.quitadas
// Devuelve el saldo de cartera (positivo = Kamila Colombia debe), lo remisionado sin facturar con y sin IVA, y los avisos de datos que faltan.
export function kamilaColombiaTns(cartera, remisiones, quitadas) {
  const q = quitadas || {};
  const out = { saldo: 0, remisionadoConIva: 0, remisionadoSinIva: 0, unidadesRemisionadas: 0, remisionesQuitadas: 0, porEmpresa: {}, clientesTomados: [], clientesExcluidos: [], avisos: [] };
  const tomados = new Set();
  const excluidos = new Set();
  EMPRESAS_CUADRE_TNS.forEach((emp) => {
    const dc = cartera?.[emp.id];
    const dr = remisiones?.[emp.id];
    const fila = { saldo: 0, remisionConIva: 0, unidades: 0, hayCartera: !!dc, hayRemisiones: !!dr, corteCartera: dc?.corte || "", corteRemisiones: dr?.corte || "" };
    (dc?.clientes || []).forEach((t) => {
      if (esKamilaColombia(t.nombre)) { fila.saldo += num(t.saldo); tomados.add(t.nombre); }
      else if (esKamila(t.nombre)) excluidos.add(t.nombre);
    });
    (dr?.clientes || []).forEach((t) => {
      if (!esKamilaColombia(t.nombre)) { if (esKamila(t.nombre)) excluidos.add(t.nombre); return; }
      tomados.add(t.nombre);
      fila.remisionConIva += num(t.valorPendiente);
      fila.unidades += num(t.pendiente);
      // Las remisiones «quitadas» a mano en Contabilidad (ej. una duplicada) no cuentan.
      (t.pendientes || []).forEach((p) => {
        if (q[`${emp.id}__${p.ref}`]) {
          fila.remisionConIva -= num(p.valorPend);
          fila.unidades -= num(p.pendiente);
          out.remisionesQuitadas += 1;
        }
      });
    });
    if (!dc) out.avisos.push(`Falta la cartera de TNS de ${emp.nombre} (Contabilidad → Saldos de clientes): el saldo de Kamila Colombia puede estar incompleto.`);
    if (!dr) out.avisos.push(`Faltan las remisiones de TNS de ${emp.nombre} (Contabilidad → Cuadre por cliente): lo remisionado puede estar incompleto.`);
    out.porEmpresa[emp.id] = fila;
    out.saldo += fila.saldo;
    out.remisionadoConIva += fila.remisionConIva;
    out.unidadesRemisionadas += fila.unidades;
  });
  out.remisionadoSinIva = Math.round(out.remisionadoConIva / IVA_REMISIONES_KAMILA);
  out.clientesTomados = [...tomados];
  out.clientesExcluidos = [...excluidos];
  if (!out.clientesTomados.length && !out.avisos.length) out.avisos.push("No encontré ningún cliente «Kamila» (sin Venezuela) en los Excel de TNS: saldo y remisionado de Colombia salen en $0.");
  return out;
}
