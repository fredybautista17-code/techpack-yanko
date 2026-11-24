// ─── CANDADO DE CORTE · aviso en el módulo de Corte ──────────────────────────────────────────────────────────
// (2026-11-22, a pedido de Fredy) Un pedido NO debe salir a cortar si no están hechas las 9 etapas anteriores del Seguimiento del Pedido.
// Aquí se calcula, con la misma regla de «Seguimiento del Pedido» (evaluarPedido), si cada pedido activo puede cortar y se muestra un AVISO ROJO en Corte
// (cola sugerida, detalle del pedido, programación y registro del corte). Además BLOQUEA «Entrada de Corte» (modal ProgramarCorteModal en modulo-corte.jsx); el registro manual de un corte histórico no se bloquea.
// Los pedidos que ya tienen corte no se avisan, ni los que el administrador habilitó con motivo.
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { getApps } from "firebase/app";
import { collection, doc, getFirestore, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { COL_FICHA, PASOS_SEMAFORO, ETAPAS_PEDIDO, ETAPA_CORTE, evaluarPedido } from "./ficha-inicio-calculo";

export const CandadoCorteContext = createContext(null);

// (2026-11-24, a pedido de Fredy) Interruptor global del candado de corte: mientras la Ficha de inicio no esté al día se puede DESACTIVAR para que se pueda cortar
// sin cumplir las etapas. Se guarda en config/candado_corte { activo }. Sin documento = desactivado (así sale la primera vez); el administrador lo enciende cuando quiera exigirlo.
// Desactivado: Corte no bloquea ni avisa, el menú no cuenta pedidos y el Seguimiento del Pedido deja la casilla «Corte» libre (la franja «Dónde va» sigue como guía).
export function useCandadoActivo() {
  const [estado, setEstado] = useState({ activo: false, cargado: false, por: "", en: "" });
  useEffect(() => {
    const db = getFirestore(getApps()[0]);
    return onSnapshot(doc(db, "config", "candado_corte"), (s) => {
      const d = s.exists() ? s.data() : {};
      setEstado({ activo: d.activo === true, cargado: true, por: d.por || "", en: d.en || "" });
    }, () => setEstado({ activo: false, cargado: true, por: "", en: "" }));
  }, []);
  return estado;
}

// Interruptor para el administrador (en el tablero de la Ficha de inicio).
export function InterruptorCandadoCorte({ esAdmin, usuario }) {
  const { activo, cargado, por, en } = useCandadoActivo();
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState("");
  if (!cargado) return null;
  async function cambiar() {
    setOcupado(true); setErr("");
    try {
      const db = getFirestore(getApps()[0]);
      await setDoc(doc(db, "config", "candado_corte"), { activo: !activo, por: usuario || "", en: new Date().toISOString() }, { merge: true });
    } catch (e) { setErr(e?.message || "No se pudo guardar el cambio."); }
    finally { setOcupado(false); }
  }
  const colorFg = activo ? "#1E7A52" : "#B25E0E";
  const colorBg = activo ? "#EBF7F2" : "#FBF3E4";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: colorBg, color: colorFg, borderRadius: 12, padding: "9px 14px", marginBottom: 12, fontSize: 13, fontWeight: 700 }}>
      <span>{activo ? "🔒 Candado de corte ACTIVADO: no se corta hasta cumplir las etapas." : "🔓 Candado de corte DESACTIVADO: se puede cortar aunque falten etapas (solo informativo)."}</span>
      {en && por ? <span style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.85 }}>Último cambio: {por}, {new Date(en).toLocaleDateString("es-CO")}</span> : null}
      {esAdmin ? (
        <button disabled={ocupado} onClick={cambiar} style={{ marginLeft: "auto", border: `1.5px solid ${colorFg}`, background: "#fff", color: colorFg, borderRadius: 10, padding: "6px 14px", fontWeight: 800, fontSize: 12.5, cursor: ocupado ? "default" : "pointer", fontFamily: "inherit" }}>
          {activo ? "Desactivar candado" : "Activar candado"}
        </button>
      ) : null}
      {err ? <span style={{ flexBasis: "100%", fontSize: 12, color: "#C0392B" }}>{err}</span> : null}
    </div>
  );
}

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
  const { activo } = useCandadoActivo();
  useEffect(() => {
    const db = getFirestore(getApps()[0]);
    const a = onSnapshot(query(collection(db, "bitacora_preordenes"), where("estado", "==", "aprobada")), (s) => setPre(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setPre([]));
    const b = onSnapshot(collection(db, COL_FICHA), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setFich(m); }, () => setFich({}));
    return () => { a(); b(); };
  }, []);
  return {
    infoDe: (pedido) => {
      if (!activo || !pre || !fich || !pedido || (pedido.estado && pedido.estado !== "activo")) return null; // candado desactivado → ni bloquea ni avisa
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

// ─── INSIGNIAS DEL MENÚ (2026-11-22, a pedido de Fredy) ───────────────────────────────────────────────────────
// Burbuja con un número junto a un ítem del menú. `rojo` = requiere atención.
export function Insignia({ n, rojo, title }) {
  if (!n) return null;
  return (
    <span title={title} style={{ marginLeft: "auto", minWidth: 18, textAlign: "center", fontSize: 10.5, fontWeight: 800, lineHeight: "18px", height: 18, padding: "0 6px", borderRadius: 9, color: "#fff", background: rojo ? "#E85D4A" : "#7A7A99" }}>{n > 99 ? "99+" : n}</span>
  );
}

// Pedidos activos que no pueden salir a cortar (misma regla que el tablero: «ya cortó» = el pedido tiene cortesRealizados).
export function InsigniaNoPueden({ pedidos }) {
  const candado = useCandadoCorte((p) => (p.cortesRealizados || []).length > 0);
  const n = (pedidos || []).filter((p) => { const i = candado.infoDe(p); return !!i && !i.libre; }).length;
  return <Insignia n={n} rojo title={`${n} pedido(s) activo(s) que no pueden salir a cortar todavía`} />;
}
