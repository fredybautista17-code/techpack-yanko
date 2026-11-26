// ─── FICHA DE INICIO · piezas de pantalla compartidas (colores, campos, botones, ventana) ───
// (2026-11-26) Salieron de ficha-inicio.jsx tal cual para que las pantallas nuevas (combinaciones de la prenda, carta de colores) las usen sin repetirlas.
import React from "react";
import { esHex, normHex } from "./ficha-inicio-calculo";

export const C = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", amber: "#C47C1A", amberBg: "#FBF3E4", amberLine: "#E3A33A", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", grey: "#B9B3A8", greyBg: "#EFEBE4" };
export const inp = { width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", background: C.white, color: C.ink, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
export const lbl = { display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, color: C.slate, marginBottom: 5 };

export function Boton({ children, onClick, tipo = "sec", disabled, small, title }) {
  const col = tipo === "pri" ? { background: C.ink, color: C.white } : tipo === "ok" ? { background: C.green, color: C.white } : tipo === "rojo" ? { background: C.redBg, color: C.red } : { background: C.greyBg, color: C.ink };
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} style={{ border: "none", borderRadius: small ? 8 : 10, fontWeight: 700, fontSize: small ? 12 : 13, padding: small ? "5px 11px" : "9px 16px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, fontFamily: "inherit", ...col }}>{children}</button>
  );
}

export function Chip({ activo, onClick, children, title }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : "#FAF8F4", color: activo ? C.white : C.ink, borderRadius: 20, padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>
  );
}

export function Ventana({ titulo, onClose, ancho = 860, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: ancho, padding: "18px 20px", boxShadow: "0 12px 40px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>{titulo}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "transparent", fontSize: 22, color: C.slate, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Cuadrito({ hex, tam = 28 }) {
  const ok = esHex(hex);
  return <span title={ok ? normHex(hex) : "Sin color todavía"} style={{ display: "inline-block", width: tam, height: tam, borderRadius: Math.round(tam * 0.3), flex: "none", verticalAlign: "middle", border: ok ? "1px solid rgba(26,26,46,.18)" : `1px dashed ${C.grey}`, background: ok ? normHex(hex) : "repeating-linear-gradient(45deg,#F2EEE6,#F2EEE6 4px,#E3DDD1 4px,#E3DDD1 8px)" }} />;
}
