// (2026-11-18, a pedido de Fredy) «Subir nómina de la quincena» (Centro de Costo → Por área): lee la hoja CONSOLIDADO del Excel de nómina
// tal cual lo lleva Fredy (una fila por persona, columnas TIPO NOMINA, TOTAL = producido, SALARIO BASE, SALARIO POR DESTAJO, DIAS, BASE SALARIO,
// AUXILIO = lo que se ayudó, BONF, DESCUENTOS, TOTAL = pagado, OBSERVACION) y lo cruza con las fichas de los trabajadores.
// Funciones puras (sin React ni Firebase): reciben la matriz de la hoja (XLSX.utils.sheet_to_json con header:1) y devuelven datos.
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export const periodoIdDe = (anio, mes, quincena) => `${anio}-${String(mes).padStart(2, "0")}-Q${quincena}`;
export const idDocNominaQuincena = (periodoId, nombre) => `${periodoId}__${norm(nombre).replace(/ /g, "_")}`;

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
// «NOMINA_DEL_16-31_DE_ENERO.xlsx» → { mes: 1, quincena: 2 }. Solo es una sugerencia: el período lo confirma quien sube el archivo.
export function sugerirPeriodo(nombreArchivo) {
  const t = norm(String(nombreArchivo || "").replace(/_/g, " "));
  const mes = MESES.findIndex((m) => t.includes(m)) + 1;
  const dias = /(\d{1,2}) ?(?:AL?|-|Y)? ?(\d{1,2})/.exec(String(nombreArchivo || "").replace(/_/g, " "));
  const primero = dias ? Number(dias[1]) : 0;
  return { mes: mes || null, quincena: primero >= 16 ? 2 : primero >= 1 ? 1 : null };
}

// Nombre de la hoja que se lee (la que se llama CONSOLIDADO o parecido).
export function hojaConsolidado(nombresHojas) {
  const lista = nombresHojas || [];
  return lista.find((n) => norm(n) === "CONSOLIDADO") || lista.find((n) => norm(n).includes("CONSOLID")) || null;
}

function colDe(fila, etiqueta, desde = 0) {
  for (let j = desde; j < (fila || []).length; j++) if (norm(fila[j]) === etiqueta) return j;
  return -1;
}

// aoa = matriz de la hoja CONSOLIDADO. Devuelve { personas, totales, totalesArchivo, ignoradas, avisos }. Lanza Error si no reconoce el formato.
export function leerNominaConsolidado(aoa) {
  const filas = aoa || [];
  let hdr = -1;
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    if (colDe(filas[i], "SALARIO BASE") >= 0 && colDe(filas[i], "AUXILIO") >= 0) { hdr = i; break; }
  }
  if (hdr < 0) throw new Error("No reconozco la hoja: busco una fila con «SALARIO BASE» y «AUXILIO» en las primeras filas de CONSOLIDADO.");
  const h = filas[hdr];
  const sub = filas[hdr + 1] || [];
  const c = {
    nombre: Math.max(0, colDe(h, "COLABORADORES")),
    tipo: colDe(sub, "TIPO NOMINA"),
    salarioBase: colDe(h, "SALARIO BASE"),
    salarioDestajo: colDe(h, "SALARIO POR DESTAJO"),
    dias: colDe(h, "DIAS"),
    baseSalario: colDe(h, "BASE SALARIO"),
    auxilio: colDe(h, "AUXILIO"),
    bonf: colDe(h, "BONF"),
    descuentos: colDe(h, "DESCUENTOS"),
    obs: colDe(h, "OBSERVACION"),
  };
  c.producido = c.tipo >= 0 ? colDe(sub, "TOTAL", c.tipo + 1) : -1;
  c.pagado = c.descuentos >= 0 ? colDe(h, "TOTAL", c.descuentos + 1) : -1;
  const faltan = Object.entries({ "TIPO NOMINA": c.tipo, "TOTAL (producido)": c.producido, "AUXILIO": c.auxilio, "DESCUENTOS": c.descuentos, "TOTAL (pagado)": c.pagado }).filter(([, v]) => v < 0).map(([k]) => k);
  if (faltan.length) throw new Error(`No encontré estas columnas en CONSOLIDADO: ${faltan.join(", ")}.`);

  const personas = [];
  const ignoradas = [];
  let totalesArchivo = null;
  let pasoTotales = false;
  for (let i = hdr + 2; i < filas.length; i++) {
    const f = filas[i] || [];
    const nombre = String(f[c.nombre] == null ? "" : f[c.nombre]).replace(/\s+/g, " ").trim();
    if (!nombre) continue;
    const n = norm(nombre);
    if (n === "TOTALES") {
      pasoTotales = true;
      totalesArchivo = { producido: num(f[c.producido]), ayuda: num(f[c.auxilio]), pagado: num(f[c.pagado]) };
      continue;
    }
    const tipo = norm(f[c.tipo]);
    if (!pasoTotales && (tipo === "DESTAJO" || tipo === "NOMINA")) {
      personas.push({
        nombre,
        nombreNorm: n,
        tipoNomina: tipo === "DESTAJO" ? "Destajo" : "Nómina fija",
        producido: Math.round(num(f[c.producido])),
        salarioBase: Math.round(num(f[c.salarioBase])),
        salarioDestajo: c.salarioDestajo >= 0 ? Math.round(num(f[c.salarioDestajo])) : 0,
        dias: c.dias >= 0 ? num(f[c.dias]) : 0,
        baseSalario: c.baseSalario >= 0 ? Math.round(num(f[c.baseSalario])) : 0,
        // «AUXILIO» en este archivo es lo que se ayudó (completa lo que le faltó producir); solo cuenta como ayuda en destajo.
        ayuda: tipo === "DESTAJO" ? Math.round(num(f[c.auxilio])) : 0,
        auxilioArchivo: Math.round(num(f[c.auxilio])),
        bonificacion: c.bonf >= 0 ? Math.round(num(f[c.bonf])) : 0,
        descuentos: Math.round(num(f[c.descuentos])),
        pagado: Math.round(num(f[c.pagado])),
        observacion: c.obs >= 0 && f[c.obs] ? String(f[c.obs]).trim() : "",
      });
    } else if (ignoradas.length < 20) ignoradas.push(nombre);
  }
  if (!personas.length) throw new Error("No encontré personas con TIPO NOMINA «DESTAJO» o «NOMINA» en la hoja CONSOLIDADO.");
  const sum = (k) => personas.reduce((s, p) => s + p[k], 0);
  const totales = { personas: personas.length, destajo: personas.filter((p) => p.tipoNomina === "Destajo").length, conAyuda: personas.filter((p) => p.ayuda > 0).length, producido: sum("producido"), ayuda: sum("ayuda"), pagado: sum("pagado"), descuentos: sum("descuentos") };
  const avisos = [];
  if (totalesArchivo) {
    const tol = personas.length + 2; // cada fila se redondea a pesos
    if (Math.abs(totalesArchivo.producido - totales.producido) > tol) avisos.push(`El producido del archivo (${totalesArchivo.producido.toLocaleString("es-CO")}) no coincide con la suma de las personas (${totales.producido.toLocaleString("es-CO")}).`);
    if (Math.abs(totalesArchivo.ayuda - totales.ayuda) > tol) avisos.push(`La ayuda del archivo (${totalesArchivo.ayuda.toLocaleString("es-CO")}) no coincide con la suma de las personas (${totales.ayuda.toLocaleString("es-CO")}).`);
    if (Math.abs(totalesArchivo.pagado - totales.pagado) > tol) avisos.push(`Lo pagado del archivo (${totalesArchivo.pagado.toLocaleString("es-CO")}) no coincide con la suma de las personas (${totales.pagado.toLocaleString("es-CO")}).`);
  } else avisos.push("No encontré la fila «Totales» para comparar las sumas.");
  const vistos = new Map();
  personas.forEach((p) => vistos.set(p.nombreNorm, (vistos.get(p.nombreNorm) || 0) + 1));
  [...vistos.entries()].filter(([, v]) => v > 1).forEach(([k]) => avisos.push(`El nombre «${k}» aparece más de una vez: solo se guardaría una fila.`));
  return { personas, totales, totalesArchivo, ignoradas, avisos };
}

const tokens = (s) => norm(s).split(" ").filter(Boolean);
const clavePalabras = (s) => tokens(s).sort().join(" ");

// Cruza cada persona del Excel con la ficha de un trabajador (por nombre). trabajadores: [{ id, nombre, area, activo }].
export function cruzarConTrabajadores(personas, trabajadores) {
  const lista = (trabajadores || []).filter((t) => t && t.nombre);
  const porNorm = new Map();
  const porPalabras = new Map();
  lista.forEach((t) => {
    const k = norm(t.nombre);
    (porNorm.get(k) || porNorm.set(k, []).get(k)).push(t);
    const kp = clavePalabras(t.nombre);
    (porPalabras.get(kp) || porPalabras.set(kp, []).get(kp)).push(t);
  });
  const unico = (arr) => {
    if (!arr || !arr.length) return null;
    if (arr.length === 1) return arr[0];
    const activos = arr.filter((t) => t.activo !== false);
    return activos.length === 1 ? activos[0] : null;
  };
  return (personas || []).map((p) => {
    let t = unico(porNorm.get(p.nombreNorm));
    let cruce = t ? "exacto" : null;
    if (!t) { t = unico(porPalabras.get(clavePalabras(p.nombre))); if (t) cruce = "palabras"; }
    if (!t) {
      // Parcial: todas las palabras del más corto están en el más largo (mínimo 2 palabras en común) y hay un único candidato.
      const tp = new Set(tokens(p.nombre));
      const cand = lista.filter((x) => {
        const tx = new Set(tokens(x.nombre));
        const comunes = [...tp].filter((w) => tx.has(w)).length;
        return comunes >= 2 && (comunes === tp.size || comunes === tx.size);
      });
      const u = cand.length === 1 ? cand[0] : cand.filter((x) => x.activo !== false).length === 1 ? cand.find((x) => x.activo !== false) : null;
      if (u) { t = u; cruce = "parcial"; }
    }
    return { ...p, trabajadorId: t ? t.id : "", trabajadorNombre: t ? t.nombre : "", area: t ? t.area || "" : "", cruce };
  });
}

// Documento que se guarda por persona y quincena en nomina_historico_quincena.
export function docNominaQuincena(p, { anio, mes, quincena, archivo, quien, cuando }) {
  const periodoId = periodoIdDe(anio, mes, quincena);
  return {
    id: idDocNominaQuincena(periodoId, p.nombre),
    datos: {
      periodoId, anio: Number(anio), mes: Number(mes), quincena: Number(quincena),
      nombre: p.nombre, nombreNorm: p.nombreNorm, tipoNomina: p.tipoNomina,
      producido: p.producido, ayuda: p.ayuda, pagado: p.pagado,
      baseSalario: p.baseSalario, salarioBase: p.salarioBase, salarioDestajo: p.salarioDestajo, dias: p.dias,
      bonificacion: p.bonificacion, descuentos: p.descuentos, observacion: p.observacion || "",
      trabajadorId: p.trabajadorId || "", trabajadorNombre: p.trabajadorNombre || "", area: p.area || "", cruce: p.cruce || "",
      archivo: archivo || "", cargadoPor: quien || "", cargadoEn: cuando || new Date().toISOString(),
    },
  };
}
