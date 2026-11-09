// (2026-11-09, a pedido de Fredy) Proyección de deuda · «Compras de materiales»: las compras de telas e insumos que se vienen (del presupuesto de la pantalla
// Proyección) para restarlas antes del dinero que queda para pagar proveedores. Funciones puras.
// Regla: lo comprado hasta hoy YA está en Cuentas por Pagar (se paga con «para proveedores»); aquí solo entra lo que se compre desde el mes siguiente,
// y se paga «plazoMeses» después (0 = en el mismo mes que se compra).
import { sumarMes } from "./financiera-cuanto-pagar-calculo";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Categoría de Proyección que parece ser la de telas e insumos (la primera cuyo nombre lo dice); "" si no hay.
export function categoriaDeMateriales(categoriasLista) {
  const c = (categoriasLista || []).find((x) => /telas?\s+e\s+insumos/.test(norm(x.label)));
  return c ? c.id : "";
}

// Total del presupuesto de un mes dentro de una categoría (solo rubros incluidos). presupuesto = { mes, items: [{ codConcep, incluido, valorFinal }] }.
export function totalCategoriaPresupuesto(presupuesto, categoriaId, categoriasPorConcepto, categoriasLista) {
  const valida = new Set((categoriasLista || []).map((c) => c.id));
  const catDe = (cod) => { const c = (categoriasPorConcepto || []).find((x) => x.codConcep === cod); return c && valida.has(c.categoria) ? c.categoria : ""; };
  return (presupuesto?.items || []).filter((i) => i.incluido && catDe(i.codConcep) === categoriaId).reduce((s, i) => s + num(i.valorFinal), 0);
}

// Devuelve { comprasMes: {ym: comprado}, pagoMes: {ym: pagado ese mes}, base: {meses: [{ym,total}], promedio}, sinDatos }
export function comprasProyectadas({ presupuestos, categoriasLista, categoriasPorConcepto, categoriaId, ymInicio, horizonte, plazoMeses }) {
  const porMes = {};
  (presupuestos || []).forEach((p) => {
    if (!p.mes) return;
    porMes[p.mes] = (porMes[p.mes] || 0) + totalCategoriaPresupuesto(p, categoriaId, categoriasPorConcepto, categoriasLista);
  });
  const conDatos = Object.keys(porMes).filter((ym) => porMes[ym] > 0).sort();
  const promedio = conDatos.length ? conDatos.reduce((s, ym) => s + porMes[ym], 0) / conDatos.length : 0;
  const plazo = Math.max(0, Math.round(num(plazoMeses)));
  const comprasMes = {};
  const pagoMes = {};
  for (let i = 1; i <= horizonte; i++) {
    const ym = sumarMes(ymInicio, i);
    comprasMes[ym] = porMes[ym] > 0 ? porMes[ym] : promedio; // solo meses futuros; si ese mes no tiene presupuesto, el promedio
  }
  for (let i = 0; i < horizonte; i++) {
    const ym = sumarMes(ymInicio, i);
    pagoMes[ym] = num(comprasMes[sumarMes(ym, -plazo)]); // solo hay compra futura si el mes de compra es > ymInicio
  }
  return { comprasMes, pagoMes, base: { meses: conDatos.map((ym) => ({ ym, total: porMes[ym] })), promedio }, sinDatos: !conDatos.length };
}
