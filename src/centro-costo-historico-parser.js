// Lector del Excel "histórico del año por área" para Centro de Costo.
// (2026-10-07, a pedido de Fredy) Archivo puro (sin React ni Firebase) para
// poder probarlo solo. Recibe las filas de una hoja como matriz (lo que
// entrega XLSX.utils.sheet_to_json con header:1) y devuelve, por área, los
// valores de cada mes: valor producido, costo de nómina y unidades.
//
// El archivo de Fredy trae varios bloques (CORTE / EMPAQUE PROCESOS /
// TERMOFIJACION), cada uno con una fila de meses (ENERO … DICIEMBRE) y debajo
// filas con su nombre al lado izquierdo (valor producido, costo de nómina,
// unidades…). El lector NO depende de posiciones fijas: busca los títulos de
// área, las filas que traen nombres de mes, y clasifica cada fila por su
// etiqueta. Lo que no reconoce lo devuelve en "ignoradas" para mostrarlo en
// la vista previa en vez de adivinar.

export const AREAS_HISTORICO = [
  { clave: "CORTE", nombre: "CORTE", alias: ["CORTE"] },
  { clave: "ZONACALOR", nombre: "ZONA CALOR", alias: ["TERMOFIJACION", "TERMOFIJADO", "ZONA CALOR", "ZONA DE CALOR"] },
  { clave: "CONTROLCALIDAD", nombre: "CONTROL DE CALIDAD", alias: ["EMPAQUE PROCESOS", "EMPAQUE Y PROCESOS", "EMPAQUE", "CONTROL DE CALIDAD", "CONTROL CALIDAD"] },
];

export function normTexto(s) {
  return String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Clave estable de un área (sirve para unir "TERMOFIJACION" del Excel con
// "ZONA CALOR" de ATLAS, y "ZONA DE CALOR" con "ZONA CALOR").
export function claveArea(nombre) {
  const n = normTexto(nombre);
  for (const a of AREAS_HISTORICO) {
    if (a.alias.some((x) => normTexto(x) === n)) return a.clave;
  }
  return n.replace(/[^A-Z0-9]/g, "");
}

export function nombreAreaPorClave(clave) {
  return AREAS_HISTORICO.find((a) => a.clave === clave)?.nombre || clave;
}

const MESES_TOKEN = {
  ENERO: 1, ENE: 1, FEBRERO: 2, FEB: 2, MARZO: 3, MAR: 3, ABRIL: 4, ABR: 4, MAYO: 5, MAY: 5, JUNIO: 6, JUN: 6,
  JULIO: 7, JUL: 7, AGOSTO: 8, AGO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, SEPT: 9, SEP: 9, OCTUBRE: 10, OCT: 10,
  NOVIEMBRE: 11, NOV: 11, DICIEMBRE: 12, DIC: 12,
};

export function mesDeTexto(v) {
  if (v == null || typeof v === "number") return 0;
  return MESES_TOKEN[normTexto(v).replace(/[^A-Z]/g, "")] || 0;
}

// Número desde una celda: acepta números, "$ 1.234.567", "1,234,567.89",
// "(1.234)" = negativo. Devuelve null si no es un número (texto, vacío, %).
export function parseNumero(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s || s.includes("%")) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const tienePunto = s.includes(".");
  const tieneComa = s.includes(",");
  if (tienePunto && tieneComa) {
    const decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    s = s.split(miles).join("").replace(decimal, ".");
  } else if (tienePunto || tieneComa) {
    const sep = tienePunto ? "." : ",";
    const partes = s.split(sep);
    // "1.234.567" o "1.234" (grupos de 3) = miles; "1234.5" = decimal
    const esMiles = partes.length > 2 || (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3 && partes[0] !== "0");
    s = esMiles ? partes.join("") : partes.join(".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// Qué es una fila según su etiqueta. "ignorar" = % de cobertura, rentabilidad,
// etc. (se recalculan en ATLAS). null = no se reconoce.
export function clasificarEtiqueta(label) {
  const n = normTexto(label);
  if (!n) return null;
  if (n.includes("%") || /COBERTURA|PORCENT|RENTAB|RESULTADO|BALANCE|DIFERENCIA|AYUDA|EXCEDENTE|SUPERAVIT|DEFICIT/.test(n)) return "ignorar";
  if (/COSTO|NOMINA|SUELDO|SALARIO/.test(n)) return "costo";
  if (/UNID|UNDAD|PRENDAS|CANTIDAD/.test(n)) return "unidades";
  if (/VALOR|PRODUCID|INGRESO|VENTA/.test(n)) return "valor";
  return null;
}

function tituloAreaDeCelda(v) {
  if (v == null || typeof v === "number") return null;
  const n = normTexto(v);
  if (!n) return null;
  for (const a of AREAS_HISTORICO) {
    if (a.alias.some((x) => normTexto(x) === n)) return a.clave;
  }
  return null;
}

// Devuelve { areas: { CLAVE: { meses: {1:{valor,costo,unidades},…}, lecturas:[…] } },
//            ignoradas: [{ fila, etiqueta, area }], avisos: [], anioSugerido }
export function parsearHojaHistorico(aoa, nombreHoja) {
  const areas = {};
  const ignoradas = [];
  const avisos = [];
  let anioSugerido = null;
  const titulos = []; // { clave, fila, col }
  let grupos = []; // grupos de columnas de meses activos: { clave, cols: Map(mes→col), colIni }
  const filas = Array.isArray(aoa) ? aoa : [];

  filas.forEach((fila, r) => {
    const celdas = Array.isArray(fila) ? fila : [];
    if (anioSugerido == null && r < 12) {
      for (const c of celdas) {
        const m = typeof c === "string" ? c.match(/\b(20\d{2})\b/) : typeof c === "number" && c >= 2000 && c <= 2100 ? [null, String(c)] : null;
        if (m) { anioSugerido = Number(m[1]); break; }
      }
    }
    // títulos de área en esta fila
    celdas.forEach((c, col) => {
      const clave = tituloAreaDeCelda(c);
      if (clave) titulos.push({ clave, fila: r, col });
    });
    // ¿es fila de meses?
    const colsMeses = [];
    celdas.forEach((c, col) => {
      const mes = mesDeTexto(c);
      if (mes) colsMeses.push({ mes, col });
    });
    if (colsMeses.length >= 3) {
      // separa en grupos cuando el número de mes deja de crecer (bloques lado a lado)
      const nuevos = [];
      let actual = null;
      colsMeses.forEach((x) => {
        if (!actual || x.mes <= actual.ultimoMes) {
          actual = { cols: new Map(), colIni: x.col, ultimoMes: 0 };
          nuevos.push(actual);
        }
        actual.cols.set(x.mes, x.col);
        actual.ultimoMes = x.mes;
      });
      grupos = nuevos.map((g) => {
        // área = el título más reciente (fila ≤ actual) cuya columna esté a la izquierda del grupo o cerca
        const candidatos = titulos.filter((t) => t.fila <= r && t.col <= g.colIni + 1);
        let elegido = null;
        candidatos.forEach((t) => {
          const mejor = !elegido || t.fila > elegido.fila || (t.fila === elegido.fila && t.col > elegido.col);
          if (mejor) elegido = t;
        });
        if (!elegido) {
          // último recurso: el título más reciente sin importar columna
          titulos.filter((t) => t.fila <= r).forEach((t) => { if (!elegido || t.fila >= elegido.fila) elegido = t; });
        }
        return { clave: elegido?.clave || null, cols: g.cols, colIni: g.colIni };
      });
      grupos.forEach((g) => {
        if (!g.clave) avisos.push(`${nombreHoja || "Hoja"}, fila ${r + 1}: encontré meses pero no el título del área (CORTE / TERMOFIJACION / EMPAQUE PROCESOS).`);
        else if (!areas[g.clave]) areas[g.clave] = { meses: {}, lecturas: [] };
      });
      return;
    }
    // fila de datos de los grupos activos
    if (!grupos.length) return;
    grupos.forEach((g, gi) => {
      // etiqueta = texto más cercano a la izquierda de la primera columna de mes del grupo
      const limiteIzq = gi > 0 ? Math.max(...[...grupos[gi - 1].cols.values()]) : -1;
      let etiqueta = "";
      for (let col = g.colIni - 1; col > limiteIzq; col--) {
        const v = celdas[col];
        if (typeof v === "string" && v.trim()) { etiqueta = v.trim(); break; }
      }
      const valoresFila = [...g.cols.entries()].map(([mes, col]) => ({ mes, v: parseNumero(celdas[col]) }));
      const hayNumeros = valoresFila.some((x) => x.v != null);
      if (!etiqueta) {
        if (hayNumeros) ignoradas.push({ fila: r + 1, etiqueta: "(sin nombre en la fila)", area: g.clave });
        return;
      }
      if (!g.clave) return;
      const tipo = clasificarEtiqueta(etiqueta);
      if (tipo === "ignorar") return;
      if (!tipo) {
        if (hayNumeros && !tituloAreaDeCelda(etiqueta)) ignoradas.push({ fila: r + 1, etiqueta, area: g.clave });
        return;
      }
      if (!hayNumeros) return;
      const ar = areas[g.clave];
      if (ar.lecturas.some((l) => l.tipo === tipo)) {
        avisos.push(`${nombreHoja || "Hoja"}, fila ${r + 1}: "${etiqueta}" aparece otra vez para ${nombreAreaPorClave(g.clave)}; se usó la primera.`);
        return;
      }
      ar.lecturas.push({ tipo, etiqueta, fila: r + 1 });
      valoresFila.forEach(({ mes, v }) => {
        if (v == null) return;
        if (!ar.meses[mes]) ar.meses[mes] = {};
        ar.meses[mes][tipo] = v;
      });
    });
  });
  return { areas, ignoradas, avisos, anioSugerido };
}

// Une el resultado de varias hojas (si el libro trae más de una).
export function unirResultados(lista) {
  const out = { areas: {}, ignoradas: [], avisos: [], anioSugerido: null };
  lista.forEach((r) => {
    if (out.anioSugerido == null) out.anioSugerido = r.anioSugerido;
    out.ignoradas.push(...r.ignoradas);
    out.avisos.push(...r.avisos);
    Object.entries(r.areas).forEach(([clave, datos]) => {
      if (!out.areas[clave]) { out.areas[clave] = datos; return; }
      out.avisos.push(`${nombreAreaPorClave(clave)} aparece en más de una hoja; se usó la primera.`);
    });
  });
  return out;
}
