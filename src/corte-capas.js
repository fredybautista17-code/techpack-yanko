// (2026-11-19, a pedido de Fredy) Capas × prendas por capa (marcada) POR COLOR.
// Fredy decide cuántas prendas marca por capa en cada color: más marcadas = menos capas, menos marcadas = más capas.
// Por eso la comprobación de un color usa SU marcada (el campo «prendas por capa» del color) y no una global.
// Funciones puras, sin Firestore.

// Prendas por capa de un color: la que se escribió en el color, o la de la curva de tallas si no hay.
export function marcadaDeColor(prendasPorCapaTexto, marcadasCurva) {
  const d = parseFloat(prendasPorCapaTexto);
  if (d > 0) return d;
  const m = Number(marcadasCurva);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

// Combinaciones «N capas de M prendas» que dan EXACTAMENTE el pedido, las más parecidas a las capas actuales primero.
// Ej.: pedido 96, 12 capas → [12 de 8, 8 de 12, 16 de 6, 6 de 16].
export function opcionesCapasMarcada(pedido, capasActual, maxOpciones = 4, maxCapas = 80, maxMarcada = 48) {
  const p = Math.round(Number(pedido) || 0);
  if (p <= 0) return [];
  const actual = Number(capasActual) || 0;
  const out = [];
  for (let capas = 1; capas <= maxCapas; capas++) {
    if (p % capas !== 0) continue;
    const marcada = p / capas;
    if (marcada < 1 || marcada > maxMarcada) continue;
    out.push({ capas, marcada });
  }
  out.sort((a, b) => Math.abs(a.capas - actual) - Math.abs(b.capas - actual) || a.capas - b.capas);
  return out.slice(0, maxOpciones);
}
