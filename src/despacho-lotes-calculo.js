// (2026-11-07, a pedido de Fredy) Disponible para despachar: (1) nombres claros para preórdenes (nueva orden / reprogramación) para que no se confundan
// con un pedido real y (2) la hoja «Lotes por despachar» con lo que falta despachar por pedido, lote y etapa y su valor a facturar. Funciones puras.

export const SITUACION_PRODUCIDO = "Producido · listo para facturar";
export const SITUACION_SIN_LOTE = "Producido · sin lote identificado";
export const SITUACION_SIN_CORTAR = "Sin cortar";
const ETAPAS_PANEL = [["corte", "En corte"], ["planta", "En planta"], ["semi", "Semiterminado"]];

// «Nueva orden» o «Reprogramación» y su programación (KC-03…) a partir de la preorden montada en Pedidos.
export function programacionDePreorden(p) {
  const tipoOrden = p && p.origenPantalla === "reprogramacion" ? "Reprogramación" : "Nueva orden";
  const programacion = p && p.numeroOrden ? `${p.siglasMarca ? p.siglasMarca + "-" : "N°-"}${String(p.numeroOrden).padStart(2, "0")}` : "";
  return { tipoOrden, programacion, etiqueta: programacion ? `${tipoOrden} ${programacion}` : "" };
}
// Texto que reemplaza al antiguo «Orden KC-04» (que parecía una orden real): siempre dice que es una preorden.
export function etiquetaPreorden(p) {
  const { etiqueta } = programacionDePreorden(p);
  if (etiqueta) return `Preorden · ${etiqueta}`;
  return p && p.nombre ? `Preorden · ${p.nombre}` : "Preorden";
}

const numPedOrden = (v) => { const n = Number(v); return Number.isFinite(n) ? n : Infinity; };

// Filas de la hoja «Lotes por despachar». `grupos` = [{ cliente, filas }] con las filas ya filtradas (las preórdenes no entran: no tienen lote).
// Por cada línea de pedido:
//  - Producido (Entradas de Planta por lote): lo producido de cada lote menos lo ya despachado. Busint no dice de qué lote sale cada factura:
//    el despacho se asigna a los lotes más antiguos primero. El total nunca pasa de «Disponible» del cuadro; si faltan unidades sin lote se
//    muestran aparte.
//  - En producción: lotes del Panel de Flujo de Busint en corte, planta o semiterminado (BPT no se repite: ya cuenta como producido).
//  - Sin cortar: lo que todavía no tiene lote.
export function filasLotesPorDespachar(grupos) {
  const out = [];
  (grupos || []).forEach((g) => {
    (g.filas || []).forEach((f) => {
      if (f.esPreorden || f.estado === "despachado") return;
      const precio = Number(f.precio) || 0;
      const fila = (extra) => ({ cliente: g.cliente, numPed: f.numPed, ref: f.ref, descripcion: f.descripcion || "", precio, listo: false, lote: "", ...extra, valor: Math.round((extra.unidades || 0) * precio) });
      // 1) producido pendiente por lote (FIFO)
      const disp = Math.max(0, Number(f.disponible) || 0);
      let porDespachar = Math.max(0, Number(f.despachado) || 0);
      const lotes = (f.lotesProducidos || [])
        .map((x) => ({ numLote: String(x.numLote ?? ""), fecha: String(x.fecha || ""), cantidad: Number(x.cantidad) || 0 }))
        .filter((x) => x.cantidad > 0)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || numPedOrden(a.numLote) - numPedOrden(b.numLote));
      const pend = lotes.map((l) => {
        const take = Math.min(porDespachar, l.cantidad);
        porDespachar -= take;
        return { numLote: l.numLote, unidades: l.cantidad - take };
      }).filter((l) => l.unidades > 0);
      let suma = pend.reduce((a, l) => a + l.unidades, 0);
      for (let i = pend.length - 1; i >= 0 && suma > disp; i--) { // si pasa de «Disponible», se recorta desde el lote más nuevo
        const quitar = Math.min(pend[i].unidades, suma - disp);
        pend[i].unidades -= quitar;
        suma -= quitar;
      }
      pend.filter((l) => l.unidades > 0).forEach((l) => out.push(fila({ lote: l.numLote, situacion: SITUACION_PRODUCIDO, unidades: l.unidades, listo: true })));
      if (disp > suma) out.push(fila({ situacion: SITUACION_SIN_LOTE, unidades: disp - suma, listo: true }));
      // 2) en producción (panel de flujo)
      (f.lotesPanel || []).forEach((l) => {
        ETAPAS_PANEL.forEach(([k, txt]) => {
          const u = Number(l[k]) || 0;
          if (u > 0) out.push(fila({ lote: String(l.numLote ?? ""), situacion: txt, unidades: u }));
        });
      });
      // 3) sin cortar
      if ((Number(f.etSinCortar) || 0) > 0) out.push(fila({ situacion: SITUACION_SIN_CORTAR, unidades: Number(f.etSinCortar) }));
    });
  });
  return out.sort((a, b) => a.cliente.localeCompare(b.cliente, "es") || numPedOrden(a.numPed) - numPedOrden(b.numPed) || String(a.numPed).localeCompare(String(b.numPed), "es") || a.ref.localeCompare(b.ref, "es"));
}
