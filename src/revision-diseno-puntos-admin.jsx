// ─── Administración → «🔍 Revisión de diseño»: editar los puntos de la lista que se marca Bien / Corregir ─────────────
// (2026-11-26, a pedido de Fredy) Se guarda en config/main.checklistRevision y lo lee el formulario «🔍 Revisión de diseño» de las muestras.
import React, { useEffect, useState } from "react";
import { PUNTOS_REVISION_BASE, MAX_PUNTOS_REVISION, MAX_LARGO_PUNTO, puntosRevision, agregarPunto, renombrarPunto, quitarPunto, moverPunto } from "./revision-diseno-puntos";

function FilaPunto({ valor, indice, total, T, onRenombrar, onMover, onQuitar }) {
  const [txt, setTxt] = useState(valor);
  useEffect(() => { setTxt(valor); }, [valor]);
  const sube = { width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.white, color: T.ink, cursor: "pointer", fontWeight: 800 };
  const confirmar = () => { if (txt.trim() !== valor) onRenombrar(indice, txt); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.canvas, borderRadius: 8, border: `1px solid ${T.border}` }} data-testid="punto-revision">
      <span style={{ width: 22, fontSize: 12, fontWeight: 800, color: T.slate }}>{indice + 1}</span>
      <input value={txt} maxLength={MAX_LARGO_PUNTO} onChange={(e) => setTxt(e.target.value)} onBlur={confirmar} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setTxt(valor); }}
        style={{ flex: 1, minWidth: 0, padding: "7px 10px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600, color: T.ink, background: T.white, fontFamily: "inherit" }} aria-label={`Punto ${indice + 1}`} />
      <button type="button" title="Subir" disabled={indice === 0} onClick={() => onMover(indice, -1)} style={{ ...sube, opacity: indice === 0 ? 0.35 : 1 }}>↑</button>
      <button type="button" title="Bajar" disabled={indice === total - 1} onClick={() => onMover(indice, 1)} style={{ ...sube, opacity: indice === total - 1 ? 0.35 : 1 }}>↓</button>
      <button type="button" title="Quitar" onClick={() => onQuitar(indice)} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "5px 10px", color: T.coral, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>✕</button>
    </div>
  );
}

export default function PuntosRevisionAdmin({ config, onUpdateConfig, T, Btn }) {
  const lista = puntosRevision(config);
  const [nuevo, setNuevo] = useState("");
  const [msg, setMsg] = useState("");
  const guardar = (nueva) => onUpdateConfig({ checklistRevision: nueva });
  const aplicar = (r) => { setMsg(r.motivo || ""); if (r.ok) guardar(r.lista); return r.ok; };
  const esBase = lista.length === PUNTOS_REVISION_BASE.length && lista.every((x, i) => x === PUNTOS_REVISION_BASE[i]);
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 6 }}>Puntos de la Revisión de diseño</div>
      <div style={{ fontSize: 12.5, color: T.slate, marginBottom: 16, lineHeight: 1.5, maxWidth: 680 }}>
        Son los puntos que Diseño marca como <strong>Bien</strong> o <strong>Corregir</strong> cuando una muestra vuelve del taller. Los cambios se guardan al instante y aplican a las revisiones nuevas; las ya hechas conservan los nombres que tenían.
        Si cambias el nombre de un punto, en la ficha de talleres cuenta aparte del anterior. Máximo {MAX_PUNTOS_REVISION} puntos.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, maxWidth: 680 }}>
        <input value={nuevo} maxLength={MAX_LARGO_PUNTO} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && aplicar(agregarPunto(lista, nuevo))) setNuevo(""); }} placeholder="Nuevo punto (ej: Cierre y botones)…"
          style={{ flex: 1, minWidth: 0, padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} aria-label="Nuevo punto" />
        <Btn onClick={() => { if (aplicar(agregarPunto(lista, nuevo))) setNuevo(""); }}>+ Agregar</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 680 }}>
        {lista.map((p, i) => (
          <FilaPunto key={`${i}-${p}`} valor={p} indice={i} total={lista.length} T={T}
            onRenombrar={(idx, t) => aplicar(renombrarPunto(lista, idx, t))}
            onMover={(idx, d) => guardar(moverPunto(lista, idx, d))}
            onQuitar={(idx) => aplicar(quitarPunto(lista, idx))} />
        ))}
      </div>
      {msg && <div style={{ fontSize: 12.5, color: T.coral, fontWeight: 700, marginTop: 10 }}>{msg}</div>}
      <div style={{ marginTop: 16 }}>
        <Btn variant="secondary" small disabled={esBase && Array.isArray(config && config.checklistRevision) === false} onClick={() => { if (window.confirm("¿Volver a los 6 puntos originales? Las revisiones ya hechas no cambian.")) { setMsg(""); guardar(PUNTOS_REVISION_BASE.slice()); } }}>↺ Restaurar los 6 originales</Btn>
      </div>
    </div>
  );
}
