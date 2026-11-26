// ─── FICHA DE CONFECCIÓN · «Proceso operativo de muestra» de prototipos y referencias de cápsula ───────────────
// (2026-11-26, a pedido de Fredy) Reemplaza el formato en Excel/papel: encabezado que sale de la referencia + secuencia de operaciones
// (descripción, máquina, aguja, puntada, repetición, observaciones, tiempo en MINUTOS) + observaciones generales.
// Se guarda en el mismo documento del prototipo/referencia: item.fichaConfeccion = { descripcion, operaciones:[…], observaciones, editadoPor, editadoEn }.
// Todo aquí es lógica pura (sin pantalla) para poder probarla.

export const FILAS_MINIMAS_EXCEL = 15; // el formato trae 15 filas; si hay más operaciones el Excel crece

// Sugerencias iniciales (solo ayudan a escribir; lo que se use en las fichas se suma solo y pasa adelante)
export const SEMILLA_MAQUINAS = ["Fileteadora 4 hilos", "Fileteadora 3 hilos", "Plana 1 aguja", "Plana 2 agujas", "Recubridora 2 agujas", "Recubridora 3 agujas", "Collarín", "Presilladora", "Ojaladora", "Botonadora", "Manual"];
export const SEMILLA_PUNTADAS = ["Seguridad", "Recta", "Recubierta", "Zigzag", "Overlock", "Presilla"];

export const nuevoId = () => Math.random().toString(36).slice(2, 9);
export const opVacia = () => ({ id: nuevoId(), d: "", m: "", a: "", p: "", r: "1", o: "", t: "" });

const txt = (x) => (x == null ? "" : String(x));

// «0,45» o «0.45» o 1 → número (0 si no se entiende)
export function parseNum(s) {
  const n = parseFloat(txt(s).replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
export const fmtMin = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",");

// Ficha tal como está guardada (o vacía) → borrador editable (todo texto, para escribir con coma)
export function aBorrador(ficha) {
  const f = ficha || {};
  return {
    descripcion: txt(f.descripcion),
    observaciones: txt(f.observaciones),
    operaciones: (f.operaciones || []).map((o) => ({
      id: o.id || nuevoId(),
      d: txt(o.d), m: txt(o.m), a: txt(o.a), p: txt(o.p),
      r: txt(o.r === "" || o.r == null ? "1" : o.r),
      o: txt(o.o),
      t: o.t === "" || o.t == null ? "" : txt(o.t).replace(".", ","),
    })),
  };
}

// Borrador → lo que se guarda: sin filas totalmente vacías, números como números
export function aGuardar(borrador, usuario, ahora) {
  const ops = (borrador.operaciones || [])
    .filter((o) => [o.d, o.m, o.a, o.p, o.o, o.t].some((v) => txt(v).trim()))
    .map((o) => ({
      id: o.id || nuevoId(),
      d: txt(o.d).trim(), m: txt(o.m).trim(), a: txt(o.a).trim(), p: txt(o.p).trim(),
      r: Math.max(1, Math.round(parseNum(o.r)) || 1),
      o: txt(o.o).trim(),
      t: parseNum(o.t),
    }));
  return {
    descripcion: txt(borrador.descripcion).trim(),
    observaciones: txt(borrador.observaciones).trim(),
    operaciones: ops,
    editadoPor: usuario || "",
    editadoEn: ahora || new Date().toISOString(),
  };
}

// ¿el borrador cambió respecto a lo guardado?
export function hayCambios(borrador, ficha) {
  const g = aGuardar(borrador, "", "");
  const a = aGuardar(aBorrador(ficha), "", "");
  const quitar = (x) => ({ ...x, editadoPor: "", editadoEn: "", operaciones: x.operaciones.map(({ id, ...r }) => r) });
  return JSON.stringify(quitar(g)) !== JSON.stringify(quitar(a));
}

export const totalMinutos = (ops) => (ops || []).reduce((s, o) => s + parseNum(o.t), 0);
export const contarOperaciones = (ops) => (ops || []).filter((o) => txt(o.d).trim()).length;
export const tiposDeMaquina = (ops) => new Set((ops || []).map((o) => txt(o.m).trim().toLowerCase()).filter(Boolean)).size;

// Qué escribió la gente antes en todas las fichas (prototipos y referencias): las más usadas primero, con la semilla al final
export function sugerencias(items) {
  const cuenta = { m: new Map(), a: new Map(), p: new Map() };
  const guardar = (campo, valor) => {
    const v = txt(valor).trim();
    if (!v) return;
    const k = v.toLowerCase();
    const prev = cuenta[campo].get(k);
    cuenta[campo].set(k, prev ? { v: prev.v, n: prev.n + 1 } : { v, n: 1 });
  };
  (items || []).forEach((it) => ((it && it.fichaConfeccion && it.fichaConfeccion.operaciones) || []).forEach((o) => { guardar("m", o.m); guardar("a", o.a); guardar("p", o.p); }));
  const ordenar = (mapa, semilla) => {
    const usados = [...mapa.values()].sort((x, y) => y.n - x.n || x.v.localeCompare(y.v, "es")).map((x) => x.v);
    const vistos = new Set(usados.map((x) => x.toLowerCase()));
    return [...usados, ...semilla.filter((s) => !vistos.has(s.toLowerCase()))];
  };
  return { maquinas: ordenar(cuenta.m, SEMILLA_MAQUINAS), agujas: ordenar(cuenta.a, []), puntadas: ordenar(cuenta.p, SEMILLA_PUNTADAS) };
}

// Datos del encabezado: salen de la referencia, no se escriben
export function encabezadoFicha(item, kind, capsula) {
  const it = item || {};
  const talla = it.rango || (Array.isArray(it.tallas) ? it.tallas.filter(Boolean).join(", ") : txt(it.tallas));
  return {
    capsula: (capsula && capsula.name) || "",
    fechaColeccion: (capsula && capsula.createdAt) || "",
    categoria: txt(it.categoria),
    talla: txt(talla),
    silueta: txt(it.silueta),
    textil: txt(it.tipoTela),
    prototipo: txt(it.numPrototipo) || (kind === "proto" ? txt(it.reference) : ""),
    referencia: txt(it.reference),
    base: txt(it.baseMolderia),
  };
}

// Todas las operaciones guardadas de un conjunto de ítems (para sugerencias): se pasa la lista ya aplanada de prototipos + referencias
export function itemsConFicha(protos, capsulas) {
  const lista = [...(protos || [])];
  (capsulas || []).forEach((c) => (c.referencias || []).forEach((r) => lista.push(r)));
  return lista;
}

export function nombreArchivoFicha(item, fechaISO) {
  const f = fechaISO || new Date().toISOString().slice(0, 10);
  return `PROCESO-MUESTRA_${(item && (item.reference || item.name)) || "referencia"}_${f}.xlsx`.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
