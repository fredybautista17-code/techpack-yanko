import { useState } from "react";
import { createRoot } from "react-dom/client";
import { getApps } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// (2026-10-28, a pedido de Fredy) Motivos ESTANDARIZADOS por los que un lote se quita, se cambia o no se entrega.
// Antes cada quien escribía el motivo a mano; ahora se elige de una lista por área (y "Otro" deja escribir).
// Cada motivo elegido también queda guardado en "programacion_incumplimientos" para armar reportes después.
export const OTRO_MOTIVO = "Otro";
export const MOTIVOS_INCUMPLIMIENTO = {
  planta: ["Planchado", "Despeluzado", "Revisado", "Sin terminar", "Falta de insumo"],
  calidad: ["Arreglos pendientes", "Prendas en proceso de lavado", "Falta de insumo", "Cambio o ajuste de programación", "Dificultad de lote", "Ausencia de personal"],
  zonacalor: ["Falta de insumo", "Tiempos adicionales", "Ausencia de personal", "Reproceso de lotes", "Falta de registro oportuno de lote terminado", "Daños o fallas de maquinaria", "Cambios o ajustes de programación"],
  // Cualquier otra área de Planeación (no era parte del pedido): lista corta general.
  otras: ["Falta de insumo", "Ausencia de personal", "Daños o fallas de maquinaria", "Cambio o ajuste de programación"],
};
export const NOMBRE_AREA_MOTIVO = { planta: "Planta de confección", calidad: "Control de calidad", zonacalor: "Zona calor", otras: "Otra área" };
function norm(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
// Del texto del área (nombre del área en Nómina / "programadoDesdeArea") a la lista de motivos que le toca.
export function claveAreaMotivo(texto) {
  const t = norm(texto);
  if (/calor|termo/.test(t)) return "zonacalor";
  if (/calidad|empaque|revis|arreglo/.test(t)) return "calidad";
  if (/planta|confecc/.test(t)) return "planta";
  return "otras";
}
const campo = { width: "100%", padding: "9px 12px", border: "1.5px solid #E8E2DB", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#1A1A2E" };
// Lista desplegable de motivos + cuadro para escribir si elige "Otro". Entrega el motivo final con onChange("texto").
// El motivo queda vacío mientras no haya una elección válida, así el botón de guardar sigue bloqueado.
export function SelectorMotivo({ area, onChange, autoFocus }) {
  const lista = MOTIVOS_INCUMPLIMIENTO[area] || MOTIVOS_INCUMPLIMIENTO.otras;
  const [sel, setSel] = useState("");
  const [otro, setOtro] = useState("");
  function cambiar(nuevoSel, nuevoOtro) {
    setSel(nuevoSel);
    setOtro(nuevoOtro);
    onChange(nuevoSel === OTRO_MOTIVO ? nuevoOtro.trim() : nuevoSel);
  }
  return (
    <div>
      <select autoFocus={autoFocus} value={sel} onChange={(e) => cambiar(e.target.value, otro)} style={campo}>
        <option value="">Elige el motivo…</option>
        {lista.map((m) => <option key={m} value={m}>{m}</option>)}
        <option value={OTRO_MOTIVO}>{OTRO_MOTIVO} (escribir)</option>
      </select>
      {sel === OTRO_MOTIVO && (
        <input value={otro} onChange={(e) => cambiar(sel, e.target.value)} placeholder="Escribe el motivo (mínimo 3 letras)" style={{ ...campo, marginTop: 8 }} />
      )}
    </div>
  );
}
function MotivoDialogo({ area, titulo, detalle, onResolver }) {
  const [motivo, setMotivo] = useState("");
  const puede = motivo.trim().length >= 3;
  const btn = { borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div onClick={() => onResolver(null)} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "min(460px,100%)", padding: 22, boxShadow: "0 24px 70px rgba(16,24,40,0.3)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#1A1A2E" }}>{titulo}</div>
        {detalle && <div style={{ fontSize: 12.5, color: "#5A5A7A", marginTop: 4 }}>{detalle}</div>}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5A5A7A", textTransform: "uppercase", letterSpacing: "0.06em", margin: "16px 0 6px" }}>Motivo (va en el correo)</div>
        <SelectorMotivo area={area} onChange={setMotivo} autoFocus />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={() => onResolver(null)} style={{ ...btn, border: "1px solid #E8E2DB", background: "#F7F4F0", color: "#1A1A2E" }}>Cancelar</button>
          <button onClick={() => puede && onResolver(motivo.trim())} disabled={!puede} style={{ ...btn, border: "none", background: "#1A1A2E", color: "#fff", opacity: puede ? 1 : 0.5, cursor: puede ? "pointer" : "not-allowed" }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
// Reemplazo de window.prompt: abre el diálogo con la lista de motivos y devuelve el motivo elegido (o null si cancela).
export function pedirMotivoIncumplimiento({ area, titulo, detalle }) {
  return new Promise((resolver) => {
    const cont = document.createElement("div");
    document.body.appendChild(cont);
    const raiz = createRoot(cont);
    const cerrar = (valor) => {
      raiz.unmount();
      cont.remove();
      resolver(valor);
    };
    raiz.render(<MotivoDialogo area={area} titulo={titulo} detalle={detalle} onResolver={cerrar} />);
  });
}
// Deja constancia (sin bloquear nada si falla) de cada lote quitado/cambiado con su motivo estándar.
export function registrarIncumplimiento(datos) {
  try {
    const app = getApps()[0];
    if (!app) return;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const limpio = {};
    Object.entries(datos || {}).forEach(([k, v]) => { limpio[k] = v === undefined ? null : v; });
    setDoc(doc(getFirestore(app), "programacion_incumplimientos", id), { id, ...limpio, creadoEn: new Date().toISOString() }).catch(() => {});
  } catch (e) {
    // El registro nunca debe impedir quitar o cambiar un lote.
  }
}
