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

// (2026-11-07) Tasa de IVA que se suma a lo de Colombia por despachar y a lo remisionado de Colombia (Venezuela no lleva IVA).
export const TASA_IVA_CUADRE = 0.19;

// Filas del cuadre con los signos COMO VIENEN: negativo = a favor de Kamila (Estado de Cuenta y TNS); positivo = lo que Kamila debe o va a deber.
// Cada fila: valor (sin IVA), iva (valor × tasa si aplica) y total (valor + iva). Resultado = suma de los totales: negativo = queda a favor; positivo = falta por cobrar.
export function filasCuadre({ saldoEstado, saldoColombia, pendienteColombia, pendienteVenezuela, remisionadoSinIva }, tasa = TASA_IVA_CUADRE) {
  const base = [
    { k: "estado", concepto: "Saldo Total del Estado de Cuenta (Venezuela + Segundas Reprogramación)", valor: Number(saldoEstado) || 0, conIva: false },
    { k: "colombiaSaldo", concepto: "Saldo de Kamila Colombia en TNS (Yanko + Indutex; ya trae IVA)", valor: Number(saldoColombia) || 0, conIva: false },
    { k: "pendCol", concepto: "Por cortar y despachar — Kamila Colombia", valor: Number(pendienteColombia) || 0, conIva: true },
    { k: "pendVen", concepto: "Por cortar y despachar — Kamila Venezuela", valor: Number(pendienteVenezuela) || 0, conIva: false },
    { k: "remis", concepto: "Remisionado sin facturar — Kamila Colombia", valor: Number(remisionadoSinIva) || 0, conIva: true },
  ];
  return base.map((f) => {
    const iva = f.conIva ? Math.round(f.valor * tasa) : 0;
    return { ...f, iva, total: f.valor + iva };
  });
}

// grupos = porCliente de getDisponibleParaDespachar ([{ cliente, filas }]); saldoEstado = Saldo Total del Estado de Cuenta (negativo = a favor de Kamila);
// colombia = { saldo, remisionadoSinIva } de cuadre-kamila-tns (saldo negativo = a favor).
export function armarCuadreKamila(grupos, saldoEstado, colombia, tasa = TASA_IVA_CUADRE) {
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
  const filas = filasCuadre({
    saldoEstado,
    saldoColombia: colombia?.saldo,
    pendienteColombia: paises.Colombia.total,
    pendienteVenezuela: paises.Venezuela.total,
    remisionadoSinIva: colombia?.remisionadoSinIva,
  }, tasa);
  const resultado = filas.reduce((a, f) => a + f.total, 0);
  return { paises, filas, tasa, resultado, faltaCobrar: resultado, ivaTotal: filas.reduce((a, f) => a + f.iva, 0) };
}
