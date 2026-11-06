// ─── GASTOS DESDE FACTURAS DE COMPRA DE BUSINT ────────────────────────────────
// (2026-11-06, a pedido de Fredy) «Traer gastos» en Costos y ventas: lista las facturas de compra de proveedores concretos
// (por defecto «repuestos de maquila» e «hilazas») para escogerlas con casillas y cargarlas como gastos del área.
// El gasto se fecha con la fecha de la FACTURA. Funciones puras (sin Firestore) para poder probarlas.

export const PROVEEDORES_GASTOS_BUSINT = ["repuestos de maquila", "hilazas"];

const normTxt = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const normFactura = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Misma clave para no duplicar: código de proveedor de Busint + número de factura
export const claveGastoBusint = (f) => `${String(f.codigo ?? "").trim().toUpperCase()}|${String(f.numeroFactura ?? "").trim().toUpperCase()}`;

export function proveedoresDeTexto(texto) {
  return String(texto || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
}

// Filas candidatas a cargar como gasto
export function candidatosGastos({ facturas, gastosExistentes, proveedorCodigo, busqueda }) {
  const cargadas = new Set();
  const porNumero = new Map(); // factura normalizada -> nombres de proveedor normalizados con gasto ya digitado
  (gastosExistentes || []).forEach((g) => {
    if (g.claveBusint) cargadas.add(g.claveBusint);
    const nf = normFactura(g.numeroFactura);
    if (nf) {
      if (!porNumero.has(nf)) porNumero.set(nf, new Set());
      porNumero.get(nf).add(normTxt(g.proveedor));
    }
  });
  const q = normTxt(busqueda);
  return (facturas || [])
    .filter((f) => {
      if (proveedorCodigo && f.codigo !== proveedorCodigo) return false;
      if (q && !normTxt(`${f.proveedor} ${f.numeroFactura}`).includes(q)) return false;
      return true;
    })
    .map((f) => {
      const clave = claveGastoBusint(f);
      const yaCargada = cargadas.has(clave);
      const prevs = porNumero.get(normFactura(f.numeroFactura));
      return {
        clave,
        codigo: f.codigo,
        proveedor: f.proveedor,
        numeroFactura: f.numeroFactura,
        fecha: f.fecha,
        fechaVcto: f.fechaVcto || null,
        monto: Number(f.total) || 0,
        yaCargada,
        posibleDuplicado: !yaCargada && !!prevs && prevs.has(normTxt(f.proveedor)),
      };
    });
}

// Gasto (centro_costo_gastos) a partir de una fila de factura
export function gastoDeFactura(fila, { id, area, usuario, ahora }) {
  return {
    id,
    area,
    proveedor: fila.proveedor,
    numeroFactura: fila.numeroFactura,
    monto: fila.monto,
    fecha: fila.fecha,
    facturaUrl: "",
    creadoEn: ahora,
    origen: "busint",
    claveBusint: fila.clave,
    codigoProveedorBusint: fila.codigo,
    cargadoPor: usuario || "",
  };
}
