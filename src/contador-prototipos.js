// ─── CONTADOR DE PROTOTIPOS (2026-10-16, a pedido de Fredy) ──────────────────
// El campo «# Prototipo» lleva un consecutivo según el tipo del prototipo:
//   · Tela  -> PK-1, PK-2, PK-3 …
//   · Molde -> 890, 891, 892 …  (números solos, desde 890)
// El siguiente número se calcula con TODO lo que ya hay en ATLAS (prototipos y
// referencias de cápsula) y con el contador guardado: gana el más alto.
export const BASE_MOLDE = 890;

// Lee un «# Prototipo» y dice a qué serie pertenece. «PTGM170» y otros estilos no cuentan.
export function parsearNumProto(txt) {
  const t = String(txt ?? "").trim();
  let m = /^PK[\s\-_.]*(\d+)$/i.exec(t);
  if (m) return { tipo: "tela", n: parseInt(m[1], 10) };
  m = /^(\d{3,})$/.exec(t);
  if (m && parseInt(m[1], 10) >= BASE_MOLDE) return { tipo: "molde", n: parseInt(m[1], 10) };
  return null;
}
// Mayor número usado de cada serie en una lista de textos.
export function maxNumeros(textos) {
  const out = { tela: 0, molde: 0 };
  (textos || []).forEach((t) => {
    const p = parsearNumProto(t);
    if (p && p.n > out[p.tipo]) out[p.tipo] = p.n;
  });
  return out;
}
export function formatearNumProto(tipo, n) {
  return tipo === "tela" ? `PK-${n}` : String(n);
}
// Siguiente número de la serie: el más alto entre lo que hay en ATLAS y el contador, más 1.
export function siguienteNumProto(tipo, textos, contador) {
  const base = tipo === "molde" ? BASE_MOLDE - 1 : 0;
  return Math.max(base, maxNumeros(textos)[tipo] || 0, Number(contador?.[tipo]) || 0) + 1;
}
// ¿Ese número ya lo tiene otro prototipo? (se compara sin espacios ni mayúsculas, y PK-5 = PK5)
export function numProtoRepetido(txt, textos, ignorar) {
  const clave = (x) => {
    const p = parsearNumProto(x);
    return p ? `${p.tipo}:${p.n}` : String(x ?? "").trim().toLowerCase();
  };
  const k = clave(txt);
  if (!k) return false;
  let veces = 0;
  (textos || []).forEach((t) => { if (clave(t) === k) veces += 1; });
  return veces > (ignorar && clave(ignorar) === k ? 1 : 0);
}
