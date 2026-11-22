// ─── CANDADO DE CORTE · aviso en el módulo de Corte ──────────────────────────────────────────────────────────
// (2026-11-22, a pedido de Fredy) Un pedido NO debe salir a cortar si no están hechas las 9 etapas anteriores del Seguimiento del Pedido.
// Aquí se calcula, con la misma regla de «Seguimiento del Pedido» (evaluarPedido), si cada pedido activo puede cortar y se muestra un AVISO ROJO en Corte
// (cola sugerida, detalle del pedido, programación y registro del corte). Es solo un aviso: no bloquea el guardado.
// Los pedidos que ya tienen corte no se avisan, ni los que el administrador habilitó con motivo.
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { getApps } from "firebase/app";
import { collection, getFirestore, onSnapshot, query, where } from "firebase/firestore";
import { COL_FICHA, PASOS_SEMAFORO, ETAPAS_PEDIDO, ETAPA_CORTE, evaluarPedido } from "./ficha-inicio-calculo";

export const CandadoCorteContext = createContext(null);

export function estadoCandadoDePedido(pedido, preordenesAprobadas, fichasPorId, yaCortado) {
  // Misma función que usan el Seguimiento del Pedido y el tablero de viabilidad (una sola regla)
  const { enlaces, est } = evaluarPedido(pedido, preordenesAprobadas, fichasPorId, yaCortado);
  const excepcion = !!(pedido.seguimiento && pedido.seguimiento[ETAPAS_PEDIDO[ETAPA_CORTE]] && pedido.seguimientoExcepcion);
  return {
    libre: est.corteLibre || excepcion,
    siguiente: est.siguiente,
    faltan: est.faltan.map((i) => `${i + 1}. ${PASOS_SEMAFORO[i]}`),
    sinEnlace: enlaces.length === 0,
  };
}

// yaCortadoFn(pedido) → true si el pedido ya tiene corte (lo define quien llama: Corte usa su propio cálculo de cortado)
export function useCandadoCorte(yaCortadoFn) {
  const [pre, setPre] = useState(null);
  const [fich, setFich] = useState(null);
  const fnRef = useRef(yaCortadoFn);
  fnRef.current = yaCortadoFn;
  useEffect(() => {
    const db = getFirestore(getApps()[0]);
    const a = onSnapshot(query(collection(db, "bitacora_preordenes"), where("estado", "==", "aprobada")), (s) => setPre(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setPre([]));
    const b = onSnapshot(collection(db, COL_FICHA), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setFich(m); }, () => setFich({}));
    return () => { a(); b(); };
  }, []);
  return {
    infoDe: (pedido) => {
      if (!pre || !fich || !pedido || (pedido.estado && pedido.estado !== "activo")) return null;
      const ya = fnRef.current ? !!fnRef.current(pedido) : false;
      return estadoCandadoDePedido(pedido, pre, fich, ya);
    },
  };
}

export function AvisoCandadoCorte({ pedido, chico }) {
  const ctx = useContext(CandadoCorteContext);
  const info = ctx ? ctx.infoDe(pedido) : null;
  if (!info || info.libre) return null;
  if (chico) {
    return <div title={`Faltan: ${info.faltan.join(" · ")}`} style={{ display: "inline-block", marginTop: 4, fontSize: 10.5, fontWeight: 800, color: "#E85D4A", background: "#FDF0EE", borderRadius: 20, padding: "2px 8px" }}>🚫 No puede salir a cortar</div>;
  }
  return (
    <div style={{ background: "#FDF0EE", color: "#E85D4A", border: "1px solid #F3C5BE", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12, lineHeight: 1.5 }}>
      🚫 No puede salir a cortar todavía. Va en: <b>{info.siguiente >= 0 ? `${info.siguiente + 1}. ${PASOS_SEMAFORO[info.siguiente]}` : "—"}</b> · Faltan: {info.faltan.join(" · ")}
      <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 3 }}>{info.sinEnlace ? "Este pedido no está enlazado a una preorden aprobada: las etapas se marcan a mano en Pedidos → Seguimiento del Pedido. " : ""}Se completa en Ficha de inicio y en el Seguimiento del Pedido. Solo el administrador puede habilitarlo con un motivo.</div>
    </div>
  );
}
