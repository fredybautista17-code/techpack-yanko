// (2026-11-09, a pedido de Fredy) Financiera · «Insumos y telas»: cuánto hay que tener cada mes para OPERAR la fábrica (comprar telas e insumos).
// No es deuda: es la PROVISIÓN de gasto, calculada con lo que realmente se compró (facturado en Busint, contabilidad_compras), se haya pagado o no.
// Lo que ya se compró y está sin pagar es deuda y sale de Cuentas por Pagar. Funciones puras (sin Firestore ni React).
import { sumarMes } from "./financiera-cuanto-pagar-calculo";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const netoDe = (c) => num(c.valor) + num(c.iva) - num(c.retencion); // igual que la pantalla Proyección
export const BASES = [
  { k: "ultimo", n: 1, txt: "Último mes cerrado" },
  { k: "3", n: 3, txt: "Promedio de 3 meses" },
  { k: "6", n: 6, txt: "Promedio de 6 meses" },
];
// Conceptos que ya cuentan como gastos de Planta (repuestos de maquila, hilazas): se dejan fuera por defecto para no contarlos dos veces.
export const CONCEPTOS_PLANTA = ["CHILA", "REPUE"];
export const llaveConcepto = (cod, concepto) => `${cod}__${concepto}`;

export function categoriaDe(codConcep, categoriasLista, categoriasPorConcepto) {
  const valida = new Set((categoriasLista || []).map((c) => c.id));
  const c = (categoriasPorConcepto || []).find((x) => x.codConcep === codConcep);
  return c && valida.has(c.categoria) ? c.categoria : "";
}

// compras = [{ mes, codConcep, concepto, valor, iva, retencion }] → { "AAAA-MM": { llave: { codConcep, concepto, total } } }
export function realPorMesConcepto(compras) {
  const m = {};
  (compras || []).forEach((c) => {
    if (!c || !c.mes) return;
    const k = llaveConcepto(c.codConcep, c.concepto);
    if (!m[c.mes]) m[c.mes] = {};
    if (!m[c.mes][k]) m[c.mes][k] = { codConcep: c.codConcep, concepto: c.concepto, total: 0 };
    m[c.mes][k].total += netoDe(c);
  });
  return m;
}

// catsSel: ids de categoría que cuentan · conceptosFuera: códigos de concepto que no cuentan · baseK: "ultimo" | "3" | "6".
// presupuestos = contabilidad_presupuestos { mes, items: [{ codConcep, concepto, incluido, valorFinal }] } (se compara el del último mes cerrado).
export function necesidadOperar({ compras, presupuestos, categoriasLista, categoriasPorConcepto, catsSel, conceptosFuera, ymHoy, baseK }) {
  const porMes = realPorMesConcepto(compras);
  const cerrados = Object.keys(porMes).filter((ym) => ym < ymHoy).sort();
  const n = (BASES.find((b) => b.k === baseK) || BASES[0]).n;
  const usados = cerrados.slice(-n);
  const ultimo = cerrados.length ? cerrados[cerrados.length - 1] : "";
  const sel = new Set(catsSel || []);
  const fuera = new Set(conceptosFuera || []);
  const etiqueta = (id) => (id ? ((categoriasLista || []).find((c) => c.id === id) || {}).label || id : "Sin categoría");

  const cats = {}; // id → { id, label, conceptos: { llave: {...} } }
  const concepto = (cod, nombre) => {
    const id = categoriaDe(cod, categoriasLista, categoriasPorConcepto);
    if (!cats[id]) cats[id] = { id, label: etiqueta(id), conceptos: {} };
    const k = llaveConcepto(cod, nombre);
    if (!cats[id].conceptos[k]) cats[id].conceptos[k] = { codConcep: cod, concepto: nombre, real: 0, ultimo: 0, presupuestado: 0, fuera: fuera.has(cod) };
    return cats[id].conceptos[k];
  };
  usados.forEach((ym) => Object.values(porMes[ym]).forEach((x) => { concepto(x.codConcep, x.concepto).real += x.total / usados.length; }));
  if (ultimo) Object.values(porMes[ultimo] || {}).forEach((x) => { concepto(x.codConcep, x.concepto).ultimo = x.total; });
  (presupuestos || []).filter((p) => ultimo && p.mes === ultimo).forEach((p) => (p.items || []).filter((i) => i.incluido).forEach((i) => { concepto(i.codConcep, i.concepto).presupuestado += num(i.valorFinal); }));

  const categorias = Object.values(cats).map((c) => {
    const lista = Object.values(c.conceptos).sort((a, b) => b.real - a.real);
    const cuenta = (campo) => lista.filter((x) => !x.fuera).reduce((s, x) => s + x[campo], 0);
    return {
      id: c.id, label: c.label, conceptos: lista, seleccionada: sel.has(c.id),
      real: cuenta("real"), ultimo: cuenta("ultimo"), presupuestado: cuenta("presupuestado"),
    };
  }).sort((a, b) => b.real - a.real || b.presupuestado - a.presupuestado);

  const elegidas = categorias.filter((c) => c.seleccionada);
  const historia = cerrados.slice(-6).map((ym) => ({
    ym,
    total: elegidas.reduce((s, c) => s + c.conceptos.filter((x) => !x.fuera).reduce((t, x) => t + num(porMes[ym][llaveConcepto(x.codConcep, x.concepto)] && porMes[ym][llaveConcepto(x.codConcep, x.concepto)].total), 0), 0),
  }));
  return {
    usados, ultimo, categorias, historia, sinDatos: usados.length === 0,
    totalNecesito: elegidas.reduce((s, c) => s + c.real, 0),
    totalUltimo: elegidas.reduce((s, c) => s + c.ultimo, 0),
    totalPresupuestado: elegidas.reduce((s, c) => s + c.presupuestado, 0),
    totalTodas: categorias.reduce((s, c) => s + c.real, 0),
  };
}

// Pago mes a mes de la provisión: se compra cada mes futuro lo mismo (provision) y se paga «plazoMeses» después. Lo comprado hasta hoy ya está en Cuentas por Pagar.
export function pagoDeProvision({ provision, ymInicio, horizonte, plazoMeses }) {
  const plazo = Math.max(0, Math.round(num(plazoMeses)));
  const pagoMes = {};
  for (let i = 0; i < horizonte; i++) {
    const ym = sumarMes(ymInicio, i);
    pagoMes[ym] = sumarMes(ym, -plazo) > ymInicio ? num(provision) : 0;
  }
  return pagoMes;
}
