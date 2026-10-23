// Asistente de voz de ATLAS (versión 1: solo lectura, solo administradores).
// La voz se hace en el navegador (SpeechRecognition / speechSynthesis, es-CO).
// Las respuestas las arma la Cloud Function `asistenteAtlas`, que valida el rol
// en el servidor y consulta datos con herramientas de solo lectura.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getApps } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const EJEMPLOS = [
  "¿En qué va el lote 7260?",
  "¿Cuánto necesito para pagar las órdenes de compra?",
  "Recuérdame mañana a las 8 revisar el lote 7260",
  "Envíame el resumen de la mañana",
];

function leerEnVoz(texto) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-CO";
    const voces = synth.getVoices();
    const v = voces.find((x) => x.lang === "es-CO") || voces.find((x) => x.lang && x.lang.startsWith("es"));
    if (v) u.voice = v;
    u.rate = 1.02;
    synth.speak(u);
  } catch { /* sin voz, se queda el texto */ }
}

export default function AsistenteAtlas() {
  const [habilitado, setHabilitado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]); // {role, texto, herramientas?}
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [hablar, setHablar] = useState(true);
  const [aviso, setAviso] = useState("");
  const [recordatorios, setRecordatorios] = useState([]);
  const [verRecs, setVerRecs] = useState(false);
  const recRef = useRef(null);
  const finRef = useRef(null);
  const fxRef = useRef(null);

  const funciones = useCallback(() => {
    if (!fxRef.current) fxRef.current = getFunctions(getApps()[0]);
    return fxRef.current;
  }, []);

  // Solo se muestra si el servidor confirma que el usuario es administrador.
  useEffect(() => {
    let vivo = true;
    let timer = null;
    const auth = getAuth(getApps()[0]);
    const comprobar = (intento) => {
      httpsCallable(funciones(), "asistenteAtlas")({ ping: true })
        .then((r) => { if (vivo && r?.data?.ok) { setHabilitado(true); setRecordatorios(r.data.recordatorios || []); } })
        .catch(() => {
          if (!vivo) return;
          if (intento < 1) timer = setTimeout(() => comprobar(intento + 1), 4000);
          else setHabilitado(false);
        });
    };
    const off = onAuthStateChanged(auth, (u) => {
      if (timer) clearTimeout(timer);
      if (!u) { setHabilitado(false); setAbierto(false); setMensajes([]); return; }
      comprobar(0);
    });
    return () => { vivo = false; if (timer) clearTimeout(timer); off(); };
  }, [funciones]);

  useEffect(() => { if (finRef.current) finRef.current.scrollIntoView({ block: "end" }); }, [mensajes, pensando]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); recRef.current?.abort(); } catch { /* nada */ } }, []);

  const refrescarRecs = useCallback(() => {
    httpsCallable(funciones(), "asistenteAtlas")({ ping: true }).then((r) => setRecordatorios(r?.data?.recordatorios || [])).catch(() => {});
  }, [funciones]);
  const marcarHecho = useCallback((id) => {
    setRecordatorios((prev) => prev.filter((x) => x.id !== id));
    httpsCallable(funciones(), "asistenteAtlas")({ accion: "hecho", id }).then((r) => setRecordatorios(r?.data?.recordatorios || [])).catch(() => {});
  }, [funciones]);
  // Mientras el asistente está abierto o hay avisos, se revisa cada minuto si ya llegó la hora de algún recordatorio.
  useEffect(() => {
    if (!habilitado) return undefined;
    const t = setInterval(refrescarRecs, 60000);
    return () => clearInterval(t);
  }, [habilitado, refrescarRecs]);

  const enviar = useCallback(async (preguntaCruda) => {
    const pregunta = String(preguntaCruda || "").trim();
    if (!pregunta || pensando) return;
    try { window.speechSynthesis?.cancel(); } catch { /* nada */ }
    setAviso("");
    setTexto("");
    const historial = [...mensajes, { role: "user", texto: pregunta }];
    setMensajes(historial);
    setPensando(true);
    try {
      const r = await httpsCallable(funciones(), "asistenteAtlas", { timeout: 300000 })({
        mensajes: historial.map((m) => ({ role: m.role, texto: m.texto })),
      });
      const resp = String(r?.data?.respuesta || "").trim() || "No obtuve respuesta.";
      setMensajes((prev) => [...prev, { role: "assistant", texto: resp, herramientas: r?.data?.herramientas || [] }]);
      if (hablar) leerEnVoz(resp);
      if ((r?.data?.herramientas || []).some((h) => /recordatorio/.test(h))) refrescarRecs();
    } catch (err) {
      const msg = err?.message || "No se pudo consultar al asistente.";
      setMensajes((prev) => [...prev, { role: "assistant", texto: `No pude responder: ${msg}`, error: true }]);
    } finally {
      setPensando(false);
    }
  }, [mensajes, pensando, hablar, funciones, refrescarRecs]);

  const escuchar = useCallback(() => {
    if (!SpeechRec) { setAviso("Este navegador no reconoce voz. Usa Chrome o Edge, o escribe tu pregunta."); return; }
    if (escuchando) { try { recRef.current?.stop(); } catch { /* nada */ } return; }
    try { window.speechSynthesis?.cancel(); } catch { /* nada */ }
    setAviso("");
    const rec = new SpeechRec();
    rec.lang = "es-CO";
    rec.interimResults = true;
    rec.continuous = false;
    let ultimo = "";
    rec.onresult = (ev) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      ultimo = t;
      setTexto(t);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setAviso("El navegador no tiene permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.");
      else if (ev.error === "no-speech") setAviso("No te escuché. Intenta de nuevo.");
      else if (ev.error !== "aborted") setAviso("No pude entender el audio. Intenta de nuevo o escribe.");
    };
    rec.onend = () => {
      setEscuchando(false);
      if (ultimo.trim()) enviar(ultimo);
    };
    recRef.current = rec;
    try { rec.start(); setEscuchando(true); } catch { setEscuchando(false); }
  }, [escuchando, enviar]);

  if (!habilitado) return null;

  const nVencidos = recordatorios.filter((r) => r.vencido).length;
  const C = { ink: "#1A1A2E", mut: "#5C5C70", line: "#E2E2EA", bg: "#FFFFFF", soft: "#F4F5F9", acc: "#1F4E79", err: "#B3261E" };

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        title="Asistente de voz de ATLAS"
        aria-label="Abrir asistente de voz"
        style={{ position: "fixed", right: 20, bottom: 20, zIndex: 9000, width: 56, height: 56, borderRadius: 28, border: "none", background: C.acc, color: "#fff", fontSize: 24, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,.28)" }}
      >🎙{nVencidos > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, background: "#D97706", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{nVencidos}</span>}</button>
    );
  }

  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 9000, width: "min(380px, calc(100vw - 24px))", height: "min(560px, calc(100vh - 40px))", display: "flex", flexDirection: "column", background: C.bg, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,.3)", fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: C.acc, color: "#fff" }}>
        <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Asistente ATLAS <span style={{ fontWeight: 500, opacity: 0.8, fontSize: 11 }}>· consulta y recordatorios</span></div>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={hablar} onChange={(e) => { setHablar(e.target.checked); if (!e.target.checked) { try { window.speechSynthesis?.cancel(); } catch { /* nada */ } } }} />
          Voz
        </label>
        {mensajes.length > 0 && <button onClick={() => { setMensajes([]); try { window.speechSynthesis?.cancel(); } catch { /* nada */ } }} title="Nueva conversación" style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.5)", borderRadius: 6, fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>Nueva</button>}
        <button onClick={() => { setAbierto(false); try { window.speechSynthesis?.cancel(); recRef.current?.abort(); } catch { /* nada */ } }} aria-label="Cerrar" style={{ background: "transparent", color: "#fff", border: "none", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {recordatorios.length > 0 && (
        <div style={{ borderBottom: `1px solid ${C.line}`, background: nVencidos ? "#FEF3C7" : C.bg }}>
          <button onClick={() => setVerRecs((v) => !v)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 12px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" }}>
            🔔 {recordatorios.length} recordatorio{recordatorios.length === 1 ? "" : "s"}{nVencidos ? ` · ${nVencidos} por atender` : ""} {verRecs ? "▲" : "▼"}
          </button>
          {(verRecs || nVencidos > 0) && (
            <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 5, maxHeight: 140, overflowY: "auto" }}>
              {recordatorios.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5 }}>
                  <div style={{ flex: 1, color: r.vencido ? "#92400E" : C.ink }}><b>{r.cuando}</b> — {r.texto}</div>
                  <button onClick={() => marcarHecho(r.id)} title="Marcar como hecho" style={{ border: `1px solid ${C.line}`, background: C.bg, borderRadius: 6, fontSize: 11, padding: "1px 7px", cursor: "pointer", color: C.ink }}>✓ Hecho</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10, background: C.soft }}>
        {mensajes.length === 0 && (
          <div style={{ fontSize: 13, color: C.mut, lineHeight: 1.5 }}>
            Pregúntame por un lote, un pedido, una referencia o las órdenes de compra. Toca el micrófono y habla, o escribe abajo.
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {EJEMPLOS.map((e) => (
                <button key={e} onClick={() => enviar(e)} style={{ textAlign: "left", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: C.ink, cursor: "pointer" }}>{e}</button>
              ))}
            </div>
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div style={{ background: m.role === "user" ? C.acc : C.bg, color: m.role === "user" ? "#fff" : m.error ? C.err : C.ink, border: m.role === "user" ? "none" : `1px solid ${C.line}`, borderRadius: 10, padding: "8px 11px", fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{m.texto}</div>
            {m.role === "assistant" && !m.error && (
              <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 11, color: C.mut }}>
                <button onClick={() => leerEnVoz(m.texto)} style={{ background: "none", border: "none", color: C.mut, cursor: "pointer", padding: 0, fontSize: 11 }}>🔊 Escuchar</button>
                {m.herramientas?.length > 0 && <span title={m.herramientas.join("\n")}>Consultó: {m.herramientas.map((h) => h.split("(")[0]).join(", ")}</span>}
              </div>
            )}
          </div>
        ))}
        {pensando && <div style={{ fontSize: 12.5, color: C.mut }}>Consultando los datos… (puede tardar si va a Busint)</div>}
        <div ref={finRef} />
      </div>

      {aviso && <div style={{ padding: "6px 12px", fontSize: 12, color: C.err, background: C.bg, borderTop: `1px solid ${C.line}` }}>{aviso}</div>}
      <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }} style={{ display: "flex", gap: 6, padding: 10, borderTop: `1px solid ${C.line}`, background: C.bg }}>
        <button type="button" onClick={escuchar} disabled={pensando} aria-label={escuchando ? "Detener" : "Hablar"} title={escuchando ? "Escuchando… toca para terminar" : "Hablar"} style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: escuchando ? C.err : C.acc, color: "#fff", fontSize: 18, cursor: pensando ? "not-allowed" : "pointer", flexShrink: 0 }}>{escuchando ? "■" : "🎙"}</button>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={escuchando ? "Te escucho…" : "Escribe tu pregunta"} disabled={pensando} style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: C.ink, background: C.bg }} />
        <button type="submit" disabled={pensando || !texto.trim()} style={{ border: "none", borderRadius: 8, background: C.ink, color: "#fff", padding: "0 14px", fontWeight: 700, fontSize: 13, cursor: pensando || !texto.trim() ? "not-allowed" : "pointer", opacity: pensando || !texto.trim() ? 0.5 : 1 }}>Enviar</button>
      </form>
    </div>
  );
}
