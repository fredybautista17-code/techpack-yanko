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

// (2026-11-07) Tasa de IVA que se suma a lo de Colombia por despachar y a lo remisionado de Colombia (Venezuela y lo demás va sin IVA).
export const TASA_IVA_CUADRE = 0.19;

// Cuadre general de Kamila, con los signos COMO VIENEN: negativo = lo que debemos (saldos a favor de Kamila en el Estado de Cuenta y en TNS, cuentas por pagar);
// positivo = lo que tenemos por entregar o en inventario. Bloque 1 = saldos y cuentas por pagar; bloque 2 = por despachar, remisiones e inventarios;
// SALDO = TOTAL 1 + TOTAL 2 (positivo: lo que tenemos supera lo que debemos; negativo: lo que debemos supera lo que tenemos).
// grupos = porCliente de getDisponibleParaDespachar; saldoEstado = Saldo Total del Estado de Cuenta (negativo = a favor de Kamila);
// colombia = { saldo, remisionadoSinIva } de cuadre-kamila-tns; manual = { cxp: [{ nombre, valor }] (valor positivo = lo que debemos), tela, insumos }.
export function armarCuadreKamila(grupos, saldoEstado, colombia, manual, tasa = TASA_IVA_CUADRE) {
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
  const fila = (k, concepto, valor, conIva) => {
    const v = Number(valor) || 0;
    const iva = conIva ? Math.round(v * tasa) : 0;
    return { k, concepto, valor: v, conIva: !!conIva, iva, total: v + iva };
  };
  const suma = (filas, campo) => filas.reduce((a, f) => a + f[campo], 0);
  const cxp = ((manual && manual.cxp) || []).map((c, i) => fila(`cxp${i}`, (c.nombre || "").trim() || `Nombre ${i + 1}`, -(Number(c.valor) || 0), false));
  const filas1 = [
    fila("salCol", "Saldo Colombia", colombia && colombia.saldo, false),
    fila("salVen", "Saldo Venezuela", saldoEstado, false),
    ...cxp,
  ];
  const filas2 = [
    fila("pdCol", "Por despachar Colombia", paises.Colombia.total, true),
    fila("pdVen", "Por despachar Venezuela", paises.Venezuela.total, false),
    fila("rem", "Remisiones Colombia", colombia && colombia.remisionadoSinIva, true),
    fila("tela", "Inventario tela", manual && manual.tela, false),
    fila("insumos", "Inventario insumos", manual && manual.insumos, false),
  ];
  const bloque1 = { filas: filas1, valor: suma(filas1, "valor"), iva: suma(filas1, "iva"), total: suma(filas1, "total") };
  const bloque2 = { filas: filas2, valor: suma(filas2, "valor"), iva: suma(filas2, "iva"), total: suma(filas2, "total") };
  return { paises, bloque1, bloque2, tasa, saldo: bloque1.total + bloque2.total, ivaTotal: bloque1.iva + bloque2.iva };
}
