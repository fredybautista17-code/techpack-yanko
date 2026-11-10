// (2026-11-10, a pedido de Fredy) Contabilidad → Comparativo por Concepto → «Importar compras Busint» → «Traer de Busint».
// Convierte lo que devuelve la función `getGastosMesBusint` (líneas por concepto + proveedor, por mes) en los MISMOS grupos que arma el Excel
// (`{mes, codConcep, concepto, valor, entradas}`), para reutilizar el paso 2 de la ventana (incluir / reemplazar mes). Funciones puras.

const MAX_MESES = 12;

export const mesActualYM = (hoy = new Date()) => `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

export function sumarMes(ym, n) {
  const [a, m] = String(ym).split("-").map(Number);
  const d = new Date(a, (m || 1) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Meses AAAA-MM de «desde» a «hasta» (incluidos). [] si el rango es inválido o pasa de MAX_MESES.
export function rangoMeses(desde, hasta) {
  const re = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!re.test(desde || "") || !re.test(hasta || "") || desde > hasta) return [];
  const out = [];
  for (let m = desde; m <= hasta && out.length <= MAX_MESES; m = sumarMes(m, 1)) out.push(m);
  return out.length > MAX_MESES ? [] : out;
}

// Rango sugerido: desde el mes siguiente al último cargado (o el mes actual si no hay nada o ya está al día) hasta el mes actual.
export function rangoSugerido(comprasExistentes, hoy = new Date()) {
  const actual = mesActualYM(hoy);
  const meses = (comprasExistentes || []).map((c) => c.mes).filter(Boolean).sort();
  const ultimo = meses[meses.length - 1];
  const desde = ultimo ? sumarMes(ultimo, 1) : actual;
  return { desde: desde > actual ? actual : desde, hasta: actual };
}

// Código comparable: mayúsculas, sin espacios ni asterisco inicial («*CMPA» = «CMPA»).
const normCod = (c) => String(c ?? "").trim().toUpperCase().replace(/^\*+/, "");

// Nombre más usado de cada código en las compras ya cargadas (Excel): Map(código normalizado -> nombre). El comparativo agrupa por código + nombre,
// así que un mes traído de Busint con el nombre vacío partía el rubro en dos filas.
export function nombresConocidos(comprasExistentes) {
  const conteo = new Map();
  (comprasExistentes || []).forEach((c) => {
    const nom = String(c.concepto ?? "").trim();
    const cod = normCod(c.codConcep);
    if (!cod || !nom) return;
    if (!conteo.has(cod)) conteo.set(cod, new Map());
    const m = conteo.get(cod);
    m.set(nom, (m.get(nom) || 0) + 1);
  });
  const out = new Map();
  conteo.forEach((m, cod) => out.set(cod, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]));
  return out;
}

// resp = respuesta de getGastosMesBusint con `porMes`. Suma por mes + código + concepto (se descartan los proveedores).
// Si una línea llega sin nombre, se usa el que ya tiene ese código en `conocidos` (ver nombresConocidos).
export function gruposDesdeBusint(resp, conocidos) {
  const grupos = new Map();
  (resp?.porMes || []).forEach(({ mes, lineas }) => {
    (lineas || []).forEach((l) => {
      const codConcep = String(l.codConcep ?? "").trim();
      const concepto = String(l.concepto ?? "").trim() || (conocidos && conocidos.get(normCod(codConcep))) || "";
      const clave = `${mes}__${codConcep}__${concepto}`;
      if (!grupos.has(clave)) grupos.set(clave, { mes, codConcep, concepto, valor: 0, entradas: 0 });
      const g = grupos.get(clave);
      g.valor += Number(l.valor) || 0;
      g.entradas += Number(l.entradas) || 0;
    });
  });
  return [...grupos.values()].filter((g) => g.valor !== 0).sort((a, b) => b.valor - a.valor);
}
