// ─── TELA PROGRAMADA QUE YA SE CORTÓ ─────────────────────────────────────────────────────────────────────────────
// (2026-11-13, a pedido de Fredy) Una referencia marcada «Tela programada (en camino)» se queda así para siempre si nadie pulsa que la tela llegó
// (caso 98-623 de Kamila Colombia: esperada el 13/10 y ya cortada). Si Corte ya registró un corte de esa referencia DESPUÉS de programar la tela,
// es porque la tela llegó: esta función dice cuáles referencias programadas se pueden dar por llegadas. Funciones puras, sin Firestore.
//
// Cómo se encuentra el pedido donde se cortó: si la preorden o la referencia ya tienen pedido vinculado (pedidoVinculado / numPedido) se usa ese; si no,
// el mismo criterio de Disponible para despachar: pedido del mismo cliente con la misma referencia y una cantidad entre el 80 % y el 120 % de la de la
// preorden. Solo cuentan los cortes con fecha igual o posterior al día en que se programó la tela (así un pedido viejo de la misma referencia no la
// da por llegada). Los cortes viven en pedidos_activos[].cortesRealizados[].refs[] (los escribe el módulo Corte).
import { RANGO_CANTIDAD_PREORDEN_CONVERTIDA, normTxt } from "./disponible-despachar";

const refKey = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Unidades cortadas de una referencia en un pedido, solo cortes desde `desde` (AAAA-MM-DD; vacío = todos).
export function cortadoDeReferencia(pedido, rk, desde = "") {
  let total = 0;
  (pedido?.cortesRealizados || []).forEach((c) => {
    if (desde && c.fecha && String(c.fecha).slice(0, 10) < desde) return;
    (c.refs || []).forEach((cr) => {
      if (refKey(cr.ref) !== rk) return;
      const porTalla = Object.values(cr.tallas || {}).reduce((s, v) => s + num(v), 0);
      total += porTalla > 0 ? porTalla : num(cr.total);
    });
  });
  return total;
}
const pedidoDeReferencia = (pedido, rk) => (pedido?.referencias || []).filter((r) => refKey(r.ref) === rk).reduce((s, r) => s + num(r.total), 0);

// → [{ preordenId, itemId, referencia, pedido (número), cortadas, cantidadPedido }]
export function telasProgramadasYaCortadas(preordenes, pedidos) {
  const salida = [];
  (preordenes || []).forEach((p) => {
    if (p.estado === "cerrada") return;
    const kp = normTxt(p.cliente);
    (p.items || []).forEach((it) => {
      if (!it.telaProgramada || it.telaComprada) return;
      const rk = refKey(it.referencia);
      if (!rk) return;
      const desde = String(it.telaProgramadaEn || "").slice(0, 10);
      const cant = num(it.colombiaCantidad) + num(it.venezuelaCantidad);
      const vinc = String(it.pedidoVinculado || p.numPedido || "").trim();
      const candidatos = [];
      (pedidos || []).forEach((pd) => {
        const cortadas = cortadoDeReferencia(pd, rk, desde);
        if (!(cortadas > 0)) return;
        const cantidadPedido = pedidoDeReferencia(pd, rk);
        if (vinc) {
          if (String(pd.numero ?? "").trim() !== vinc) return;
        } else {
          const kx = normTxt(pd.cliente);
          if (!kp || !kx || !(kx.includes(kp) || kp.includes(kx))) return;
          if (!(cant > 0 && cantidadPedido >= cant * RANGO_CANTIDAD_PREORDEN_CONVERTIDA[0] && cantidadPedido <= cant * RANGO_CANTIDAD_PREORDEN_CONVERTIDA[1])) return;
        }
        candidatos.push({ pedido: String(pd.numero ?? pd.id ?? ""), cortadas, cantidadPedido });
      });
      if (!candidatos.length) return;
      candidatos.sort((a, b) => Math.abs(a.cantidadPedido - cant) - Math.abs(b.cantidadPedido - cant));
      salida.push({ preordenId: p.id, itemId: it.itemId, referencia: it.referencia, ...candidatos[0] });
    });
  });
  return salida;
}
