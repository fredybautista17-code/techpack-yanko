// (2026-11-07, a pedido de Fredy) Cuadre de Kamila: lo que falta por cortar y despachar de Kamila Colombia y Kamila Venezuela (pedidos reales, sin preórdenes,
// precios sin IVA) contra el saldo del Estado de Cuenta. Funciones puras: reutilizan filasLotesPorDespachar (misma regla de «Disponible para despachar»).
import { filasLotesPorDespachar, SITUACION_PRODUCIDO, SITUACION_SIN_LOTE, SITUACION_SIN_CORTAR } from "./despacho-lotes-calculo";

export const PAISES_KAMILA = ["Colombia", "Venezuela"];
// Orden de las etapas en el cuadre (de lo más atrás a lo ya listo)
export const ETAPAS_CUADRE = [
  { k: "sinCortar", txt: "Sin cortar" },
  { k: "corte", txt: "En corte" },
  { k: "planta", txt: "En planta" },
  { k: "semi", txt: "Semiterminado" },
  { k: "producido", txt: "Producido sin despachar" },
];

const sinTildes = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// «KAMILA GROUP SAS-KAMILA COLOMBIA» → "Colombia"; «KAMILA VENEZUELA-KAMILA VENEZUELA» → "Venezuela"; cualquier otro → null.
export function paisKamila(nombreCliente) {
  const t = sinTildes(nombreCliente);
  if (!t.includes("KAMILA")) return null;
  if (t.includes("VENEZUELA")) return "Venezuela";
  if (t.includes("COLOMBIA")) return "Colombia";
  return null;
}

export function etapaDeSituacion(situacion) {
  if (situacion === SITUACION_SIN_CORTAR) return "sinCortar";
  if (situacion === "En corte") return "corte";
  if (situacion === "En planta") return "planta";
  if (situacion === "Semiterminado") return "semi";
  if (situacion === SITUACION_PRODUCIDO || situacion === SITUACION_SIN_LOTE) return "producido";
  return "producido";
}

// grupos = porCliente de getDisponibleParaDespachar ([{ cliente, filas }]); saldoEstado = Saldo Total del Estado de Cuenta (positivo = Kamila debe; negativo =
// Kamila ha abonado más de lo despachado, a favor); colombia = { saldo, remisionadoSinIva } de cuadre-kamila-tns (saldo positivo = Kamila Colombia debe).
// Resultado = a favor del Estado de Cuenta − saldo de Kamila Colombia − por cortar y despachar (Colombia + Venezuela) − remisionado de Colombia.
// Positivo = queda a favor de Kamila; negativo = falta por cobrar.
export function armarCuadreKamila(grupos, saldoEstado, colombia) {
  const porPais = { Colombia: [], Venezuela: [] };
  (grupos || []).forEach((g) => {
    const pais = paisKamila(g.cliente);
    if (pais) porPais[pais].push(g);
  });
  const paises = {};
  PAISES_KAMILA.forEach((pais) => {
    const lotes = filasLotesPorDespachar(porPais[pais]).map((l) => ({ ...l, pais, etapa: etapaDeSituacion(l.situacion) }));
    const porEtapa = {};
    ETAPAS_CUADRE.forEach((e) => { porEtapa[e.k] = { unidades: 0, valor: 0 }; });
    lotes.forEach((l) => { porEtapa[l.etapa].unidades += l.unidades; porEtapa[l.etapa].valor += l.valor; });
    const total = lotes.reduce((a, l) => a + l.valor, 0);
    paises[pais] = {
      pais,
      clientes: porPais[pais].map((g) => g.cliente),
      encontrado: porPais[pais].length > 0,
      lotes,
      porEtapa,
      unidades: lotes.reduce((a, l) => a + l.unidades, 0),
      total,
      listo: lotes.filter((l) => l.listo).reduce((a, l) => a + l.valor, 0),
      sinPrecio: lotes.filter((l) => !(l.precio > 0)).length,
    };
  });
  const saldo = Number(saldoEstado) || 0;
  const saldoColombia = Number(colombia?.saldo) || 0;
  const remisionado = Number(colombia?.remisionadoSinIva) || 0;
  const aFavorEstado = -saldo;
  const resultado = aFavorEstado - saldoColombia - paises.Colombia.total - paises.Venezuela.total - remisionado;
  return { paises, saldo, aFavorEstado, saldoColombia, remisionado, pendienteColombia: paises.Colombia.total, pendienteVenezuela: paises.Venezuela.total, resultado, faltaCobrar: -resultado };
}
