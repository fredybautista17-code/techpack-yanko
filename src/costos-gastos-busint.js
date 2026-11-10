// ─── GASTOS DEL MES TRAÍDOS DE BUSINT (lógica pura, sin Firestore ni React) ──────────────────────────────────────────
// (2026-11-10, a pedido de Fredy) «Traer de Busint» en Tablero de Costos → Gastos del mes. La función del servidor `getGastosMesBusint`
// devuelve las compras del mes por concepto y proveedor; aquí se convierten en las MISMAS líneas que lee el Excel de gastos
// (empresa, concepto, valor, incluir…) para que todo lo demás (Financiera, promedio, correo) funcione igual.
// Reglas: lo que ya cuenta en otra parte queda fuera por defecto; las marcas del mes anterior se heredan; lo que ya está en el Excel
// del mes no se duplica; las líneas manuales o del Excel no se tocan.
import { categoriaDe } from "./financiera-insumos-calculo";

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
// El código con asterisco (*CTEL) es el mismo concepto con IVA/sin IVA: para las reglas se compara sin el asterisco.
const codigoBase = (cod) => String(cod ?? "").trim().replace(/^\*+/, "").toUpperCase();

export const FUERA_POR_CODIGO = {
  NOMIN: "Nómina: ya está en la nómina fiscal",
  PARAF: "Seguridad social: ya está en la nómina fiscal",
  PRESF: "Prestaciones: ya están en la nómina fiscal",
  CHILA: "Hilazas: ya es gasto de Planta",
  REPUE: "Repuestos de maquila: ya es gasto de Planta",
  OBFIN: "Obligaciones financieras: ya están en las cuotas de Endeudamiento",
};
const REGLAS_NOMBRE = [
  [/NOMINA/, "Nómina: ya está en la nómina fiscal"],
  [/SEGURIDAD SOCIAL|PARAFISCAL/, "Seguridad social: ya está en la nómina fiscal"],
  [/PRESTACION/, "Prestaciones: ya están en la nómina fiscal"],
  [/OBLIGACION(ES)? FINANCIERA|PRESTAMO|CREDITO|CUOTA/, "Deuda: ya está en las cuotas de Endeudamiento"],
  [/TELA|HILO|HILAZA|INSUMO|CONFECCION|MAQUILA|ETIQUETA|EMPAQUE|CORDON|CREMALLERA|BOTON/, "Telas, insumos o confección: van en «Insumos y telas»"],
];

// Por qué una línea de Busint queda fuera por defecto ("" si cuenta). categoriaLabel = nombre de la categoría de la Proyección, si tiene.
export function motivoFueraBusint({ codConcep, concepto, categoriaLabel }) {
  const porCodigo = FUERA_POR_CODIGO[codigoBase(codConcep)];
  if (porCodigo) return porCodigo;
  const texto = sinAcentos(concepto);
  for (const [re, motivo] of REGLAS_NOMBRE) if (re.test(texto)) return motivo;
  if (/TELA|INSUMO/.test(sinAcentos(categoriaLabel))) return "Telas, insumos o confección: van en «Insumos y telas»";
  return "";
}

// Identifica la misma línea de un mes a otro: concepto + proveedor.
export const llaveBusint = (l) => `${String(l.codConcep ?? "").trim().toUpperCase()}|${sinAcentos(l.proveedorCodigo || l.proveedor || "")}`;

// ¿El nombre de Busint ya está escrito en una línea del Excel (o viceversa)? Compara nombres sin acentos, uno dentro del otro.
function coincideNombre(a, b) {
  const x = sinAcentos(a);
  const y = sinAcentos(b);
  if (x.length < 5 || y.length < 5) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// resp = respuesta de getGastosMesBusint; previas = líneas guardadas (este mes o el último cargado); manuales = líneas del Excel o a mano del mes
// categoriasLista / categoriasPorConcepto = las de la Proyección (para saber qué es tela e insumos).
export function lineasDesdeBusint(resp, { previas = [], manuales = [], categoriasLista = [], categoriasPorConcepto = [] } = {}) {
  const heredadas = new Map();
  (previas || []).filter((l) => l && l.origen === "busint").forEach((l) => heredadas.set(llaveBusint(l), l));
  const etiquetaCategoria = (cod) => {
    const id = categoriaDe(cod, categoriasLista, categoriasPorConcepto) || categoriaDe(codigoBase(cod), categoriasLista, categoriasPorConcepto) || categoriaDe(`*${codigoBase(cod)}`, categoriasLista, categoriasPorConcepto);
    const cat = (categoriasLista || []).find((c) => c.id === id);
    return cat ? cat.label : "";
  };
  const excel = (manuales || []).filter((l) => l && l.origen !== "busint");
  let nuevos = 0;
  const lineas = (resp?.lineas || []).map((b) => {
    const nombre = b.proveedor || b.concepto || b.codConcep;
    const base = {
      empresa: "YANKO", dia: "", concepto: b.proveedor && b.concepto ? `${b.proveedor} · ${b.concepto}` : nombre, valor: Number(b.valor) || 0,
      frecuencia: `Busint · ${b.entradas || 1} compra${(b.entradas || 1) === 1 ? "" : "s"}`, observaciones: "",
      origen: "busint", codConcep: b.codConcep || "", conceptoBusint: b.concepto || "", proveedorCodigo: b.proveedorCodigo || "", proveedor: b.proveedor || "", entradas: b.entradas || 1,
    };
    const previa = heredadas.get(llaveBusint(base));
    const enExcel = excel.find((e) => coincideNombre(e.concepto, b.proveedor || "") || (!b.proveedor && coincideNombre(e.concepto, b.concepto)));
    let incluir;
    let motivo = "";
    if (previa) {
      incluir = !!previa.incluir;
      motivo = incluir ? "" : previa.motivo || "Lo dejaste fuera el mes anterior";
    } else {
      motivo = motivoFueraBusint({ codConcep: b.codConcep, concepto: b.concepto, categoriaLabel: etiquetaCategoria(b.codConcep) });
      incluir = !motivo;
    }
    if (incluir && enExcel) { incluir = false; motivo = `Ya está en el Excel: «${enExcel.concepto}»`; }
    if (!previa && incluir) nuevos++;
    return { ...base, incluir, motivo };
  });
  return { lineas, nuevos };
}

// Reemplaza solo las líneas que vinieron de Busint; deja las del Excel y las manuales.
export const fusionarBusint = (actuales, nuevas) => [...(actuales || []).filter((l) => l && l.origen !== "busint"), ...(nuevas || [])];
