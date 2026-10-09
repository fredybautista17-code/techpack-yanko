// Entradas de Planta: las cargas viven en la colección "planta_entradas_cargas".
//   - Cargas "base": el Excel que se sube a mano o el documento viejo
//     "sync-busint" (no traen el campo `anio`).
//   - Cargas por AÑO: "sync-busint-2025", "sync-busint-2026"... las guarda la
//     sincronización con Busint (traen `anio`), una por año para no pasar el
//     límite de 1 MB de Firestore.
// La carga ACTIVA es la base más reciente con lo de cada año encima (lo que
// trae Busint reemplaza los campos de la misma entrada). Misma lógica que
// functions/entradas-planta.js.
export const claveEntradaPlanta = (e) => `${e.numEnt}|${e.fecha}|${e.esDevolucion ? "D" : "E"}`;

const marcaTiempo = (c) => c.creadoEn || c.fecha || "";

export function fusionarEntradasPlanta(base, extra) {
  const mapa = new Map(base.map((e) => [claveEntradaPlanta(e), e]));
  extra.forEach((b) => {
    const k = claveEntradaPlanta(b);
    const previa = mapa.get(k);
    if (!previa) {
      mapa.set(k, b);
      return;
    }
    const fusion = { ...previa };
    Object.keys(b).forEach((c) => {
      const v = b[c];
      if (v !== null && v !== undefined && v !== "" && v !== "(Sin categoría)") fusion[c] = v;
    });
    mapa.set(k, fusion);
  });
  return [...mapa.values()];
}

export function cargaEntradasActivaDe(cargas) {
  if (!cargas || !cargas.length) return null;
  const ordenadas = [...cargas].sort((a, b) => marcaTiempo(b).localeCompare(marcaTiempo(a)));
  const base = ordenadas.find((c) => !c.anio) || null;
  const porAnio = cargas.filter((c) => c.anio).sort((a, b) => Number(a.anio) - Number(b.anio));
  if (!porAnio.length) return base;
  const entradas = porAnio
    .reduce((acc, c) => fusionarEntradasPlanta(acc, c.entradas || []), base ? [...(base.entradas || [])] : [])
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") || a.numEnt - b.numEnt);
  const masReciente = ordenadas[0];
  return {
    ...(base || masReciente),
    id: (base || masReciente).id,
    fecha: masReciente.fecha,
    creadoEn: masReciente.creadoEn,
    subidoPor: masReciente.subidoPor,
    origen: masReciente.origen,
    entradas,
    anios: porAnio.map((c) => c.anio),
  };
}
