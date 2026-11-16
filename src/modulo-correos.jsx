import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

// ─── CORREOS (2026-11-16, a pedido de Fredy) ─────────────────────────────────────────────────────
// Fase 1: bandeja unificada de las cuentas de Gmail de la empresa. Una función de Firebase lee cada cuenta por IMAP
// (functions/correos.js) y guarda los mensajes en `correos_mensajes`; aquí se ven juntos, con filtro por cuenta,
// búsqueda y detalle. Solo el administrador (reglas de Firestore). ATLAS no marca nada como leído en Gmail ni envía
// ni borra correos: «leído» aquí es solo de ATLAS. Las cuentas y sus contraseñas de aplicación se administran en «Cuentas».
// Colecciones: correos_cuentas, correos_mensajes (y correos_secretos, solo servidor).

const firebaseConfig = {
  apiKey: "AIzaSyBDNvCaem-IbP0Z87eBt1pBtDy8sZdkEqc",
  authDomain: "techpack-yanko-f37b8.firebaseapp.com",
  projectId: "techpack-yanko-f37b8",
  storageBucket: "techpack-yanko-f37b8.firebasestorage.app",
  messagingSenderId: "700796768091",
  appId: "1:700796768091:web:5ab0db90c17390e6e7547e",
};
const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const functionsClient = getFunctions(fbApp);

const C = {
  ink: "#1A1A2E", slate: "#6B6B88", border: "#E9E3DB", canvas: "#F6F3EF", white: "#FFFFFF", navy: "#1E2142", field: "#FAF8F5",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#7B5EA7", violetBg: "#F3EEF9",
};
const FUENTE = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const COLORES_CUENTA = [[C.blue, C.blueBg], [C.violet, C.violetBg], [C.green, C.greenBg], [C.amber, C.amberBg], [C.red, C.redBg]];
const inp = { width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.field, color: C.ink, boxSizing: "border-box", fontFamily: "inherit" };
const btn = (bg, color, border) => ({ padding: "8px 14px", background: bg, color, border: `1.5px solid ${border || bg}`, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });

const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function fechaCorta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  if (mismoDia(d, hoy)) return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const ayer = new Date(hoy.getTime() - 86400000);
  if (mismoDia(d, ayer)) return "ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
const fechaLarga = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const quien = (p) => (p ? (p.nombre ? `${p.nombre} <${p.correo}>` : p.correo) : "");
const tamanoTxt = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : b ? `${b} B` : "");
const mensajeError = (e) => String((e && (e.message || e.details)) || e || "Error").replace(/^.*?:\s*(?=[A-ZÁÉÍÓÚ])/, "");

function Pastilla({ children, bg, color }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, background: bg, color, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
}

// ── Cuentas: lista, alta y edición ──
function PanelCuentas({ cuentas, colorDe, onCerrar, onSincronizar, sincronizando, notify }) {
  const vacia = { id: "", nombre: "", email: "", uso: "", password: "", activa: true };
  const [form, setForm] = useState(cuentas.length ? null : vacia);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ayuda, setAyuda] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function guardar() {
    setError("");
    setGuardando(true);
    try {
      await httpsCallable(functionsClient, "correosGuardarCuenta")({ id: form.id || undefined, nombre: form.nombre, email: form.email, uso: form.uso, password: form.password, activa: form.activa });
      notify?.(form.password ? "Cuenta guardada. Ya se está leyendo su bandeja." : "Cuenta actualizada.");
      setForm(null);
      onSincronizar();
    } catch (e) { setError(mensajeError(e)); }
    finally { setGuardando(false); }
  }
  async function alternar(c) {
    try { await updateDoc(doc(db, "correos_cuentas", c.id), { activa: c.activa === false }); }
    catch (e) { notify?.("No se pudo cambiar: " + mensajeError(e)); }
  }
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, width: "min(640px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: 22, fontFamily: FUENTE }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 18 }}>Cuentas de correo</div>
          <button onClick={onCerrar} style={btn(C.white, C.slate, C.border)}>Cerrar</button>
        </div>
        {!form && (
          <>
            {cuentas.map((c) => (
              <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: colorDe(c.id)[0], marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 800 }}>{c.nombre || c.email}</div>
                  <div style={{ fontSize: 12.5, color: C.slate }}>{c.email}{c.uso ? ` · ${c.uso}` : ""}</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: c.ultimoError ? C.red : C.slate }}>
                    {c.ultimoError ? `⚠ ${c.ultimoError}` : c.ultimaSync ? `Última lectura: ${fechaLarga(c.ultimaSync)} · ${c.totalCorreos || 0} correos guardados${c.pendientes ? " · trayendo el resto…" : ""}` : "Todavía no se ha leído (se lee cada 10 minutos o con «Sincronizar ahora»)."}
                  </div>
                </div>
                {c.activa === false && <Pastilla bg={C.amberBg} color={C.amber}>Pausada</Pastilla>}
                <button onClick={() => alternar(c)} style={btn(C.white, C.slate, C.border)}>{c.activa === false ? "Activar" : "Pausar"}</button>
                <button onClick={() => { setError(""); setForm({ id: c.id, nombre: c.nombre || "", email: c.email, uso: c.uso || "", password: "", activa: c.activa !== false }); }} style={btn(C.white, C.blue, C.blue)}>Editar</button>
              </div>
            ))}
            {!cuentas.length && <div style={{ color: C.slate, fontSize: 13, marginBottom: 12 }}>Todavía no hay cuentas. Agrega la primera para empezar a ver sus correos aquí.</div>}
            <button onClick={() => { setError(""); setForm(vacia); }} style={btn(C.navy, C.white)}>+ Agregar cuenta</button>
          </>
        )}
        {form && (
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{form.id ? "Editar cuenta" : "Agregar cuenta"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <label><div style={etiqueta}>Nombre</div><input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej.: Gerencia, Proveedores" style={inp} /></label>
              <label><div style={etiqueta}>Correo de Gmail</div><input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="correo@gmail.com" style={inp} /></label>
            </div>
            <label style={{ display: "block", marginTop: 12 }}><div style={etiqueta}>Para qué sirve</div><input value={form.uso} onChange={(e) => set("uso", e.target.value)} placeholder="Ej.: pedidos de clientes, facturas de proveedores…" style={inp} /></label>
            <label style={{ display: "block", marginTop: 12 }}>
              <div style={etiqueta}>Contraseña de aplicación de Google {form.id ? "(déjala vacía para no cambiarla)" : ""}</div>
              <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="16 letras, con o sin espacios" style={inp} />
            </label>
            <button onClick={() => setAyuda((a) => !a)} style={{ background: "none", border: "none", color: C.blue, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: "8px 0", fontFamily: "inherit" }}>{ayuda ? "▾" : "▸"} ¿Cómo la creo?</button>
            {ayuda && (
              <ol style={{ margin: "0 0 8px", paddingLeft: 20, fontSize: 12.5, color: C.slate, lineHeight: 1.6 }}>
                <li>Entra a esa cuenta de Google y activa la <b>Verificación en dos pasos</b> (si no la tiene).</li>
                <li>Abre <b>myaccount.google.com/apppasswords</b> con esa misma cuenta.</li>
                <li>Crea una contraseña con el nombre «ATLAS» y copia las 16 letras.</li>
                <li>Confirma que en Gmail → Configuración → Reenvío y correo POP/IMAP esté <b>activado IMAP</b>.</li>
              </ol>
            )}
            <div style={{ fontSize: 12, color: C.slate, background: C.field, borderRadius: 10, padding: "8px 10px", marginTop: 4 }}>🔒 La contraseña se prueba con Gmail y se guarda cifrada; nadie puede verla después. ATLAS solo <b>lee</b> la bandeja: no borra, no envía y no marca nada como leído en Gmail.</div>
            {error && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {cuentas.length > 0 && <button onClick={() => setForm(null)} disabled={guardando} style={btn(C.white, C.slate, C.border)}>Cancelar</button>}
              <div style={{ flex: 1 }} />
              <button onClick={guardar} disabled={guardando || !form.email.trim()} style={{ ...btn(C.green, C.white), opacity: guardando || !form.email.trim() ? 0.6 : 1 }}>{guardando ? "Probando con Gmail…" : "Probar y guardar"}</button>
            </div>
          </div>
        )}
        {!form && cuentas.length > 0 && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <button onClick={onSincronizar} disabled={sincronizando} style={{ ...btn(C.white, C.blue, C.blue), opacity: sincronizando ? 0.6 : 1 }}>{sincronizando ? "Leyendo…" : "↻ Sincronizar ahora"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
const etiqueta = { fontSize: 11, color: C.slate, fontWeight: 700, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 };

export default function CorreosView({ currentUser, onVolver, onLogout, notify }) {
  const [cuentas, setCuentas] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [cuentaSel, setCuentaSel] = useState("todas");
  const [q, setQ] = useState("");
  const [soloNuevos, setSoloNuevos] = useState(false);
  const [ocultarMasivos, setOcultarMasivos] = useState(false);
  const [selId, setSelId] = useState(null);
  const [panelCuentas, setPanelCuentas] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => onSnapshot(collection(db, "correos_cuentas"), (s) => setCuentas(s.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.creadoEn || "").localeCompare(String(b.creadoEn || "")))), (e) => setErrorCarga(mensajeError(e))), []);
  useEffect(() => onSnapshot(query(collection(db, "correos_mensajes"), orderBy("fecha", "desc"), limit(400)), (s) => { setMensajes(s.docs.map((d) => ({ ...d.data(), id: d.id }))); setCargado(true); }, (e) => { setErrorCarga(mensajeError(e)); setCargado(true); }), []);

  const colorDe = (id) => COLORES_CUENTA[Math.max(0, cuentas.findIndex((c) => c.id === id)) % COLORES_CUENTA.length];
  const nombreDe = (id) => { const c = cuentas.find((x) => x.id === id); return c ? (c.nombre || c.email) : id; };

  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtrados = useMemo(() => {
    const qn = norm(q);
    return mensajes
      .filter((m) => cuentaSel === "todas" || m.cuentaId === cuentaSel)
      .filter((m) => !soloNuevos || !m.leidoAtlas)
      .filter((m) => !ocultarMasivos || !m.esMasivo)
      .filter((m) => !qn || norm(`${m.asunto} ${m.de?.nombre} ${m.de?.correo} ${m.resumenCorto} ${m.texto}`).includes(qn));
  }, [mensajes, cuentaSel, soloNuevos, ocultarMasivos, q]);
  const sel = mensajes.find((m) => m.id === selId) || null;
  const nuevosPorCuenta = useMemo(() => { const o = {}; mensajes.forEach((m) => { if (!m.leidoAtlas) o[m.cuentaId] = (o[m.cuentaId] || 0) + 1; }); return o; }, [mensajes]);
  const totalNuevos = mensajes.filter((m) => !m.leidoAtlas).length;

  async function marcar(m, leido) {
    try { await updateDoc(doc(db, "correos_mensajes", m.id), { leidoAtlas: leido }); }
    catch (e) { notify?.("No se pudo marcar: " + mensajeError(e)); }
  }
  function abrir(m) { setSelId(m.id); if (!m.leidoAtlas) marcar(m, true); }
  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await httpsCallable(functionsClient, "correosSincronizarAhora")({});
      const lista = r.data?.cuentas || [];
      const nuevos = lista.reduce((a, x) => a + (x.nuevos || 0), 0);
      const fallas = lista.filter((x) => x.error);
      notify?.(fallas.length ? `Algunas cuentas fallaron: ${fallas.map((x) => x.correo).join(", ")}. Revisa «Cuentas».` : `Listo: ${nuevos} correo(s) nuevo(s).`);
    } catch (e) { notify?.("No se pudo sincronizar: " + mensajeError(e)); }
    finally { setSincronizando(false); }
  }

  if (!currentUser?.isAdmin) {
    return <div style={{ padding: 40, fontFamily: FUENTE }}><button onClick={onVolver} style={btn(C.white, C.slate, C.border)}>← Volver a ATLAS</button><p style={{ marginTop: 20, color: C.slate }}>Por ahora solo un administrador puede ver los correos.</p></div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: FUENTE, color: C.ink }}>
      <div style={{ background: C.navy, color: C.white, padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button onClick={onVolver} style={btn("transparent", C.white, "rgba(255,255,255,.35)")}>← Volver a ATLAS</button>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.3 }}>✉ Correos</div>
        {totalNuevos > 0 && <Pastilla bg={C.amberBg} color={C.amber}>{totalNuevos} sin leer</Pastilla>}
        <div style={{ flex: 1 }} />
        <button onClick={sincronizar} disabled={sincronizando || !cuentas.length} style={{ ...btn("transparent", C.white, "rgba(255,255,255,.35)"), opacity: sincronizando || !cuentas.length ? 0.6 : 1 }}>{sincronizando ? "Leyendo…" : "↻ Sincronizar ahora"}</button>
        <button onClick={() => setPanelCuentas(true)} style={btn("#C8B8A2", C.ink)}>⚙ Cuentas</button>
        {onLogout && <button onClick={onLogout} style={btn("transparent", "#B9BBDA", "rgba(255,255,255,.2)")}>Salir</button>}
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 24px" }}>
        {errorCarga && <div style={{ background: C.redBg, color: C.red, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>No se pudieron cargar los correos: {errorCarga}. Si es un error de permisos, falta publicar las reglas de Firestore (<code>firebase deploy --only firestore:rules</code>).</div>}
        {cargado && !cuentas.length && !errorCarga ? (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, maxWidth: 620, margin: "40px auto", textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>✉</div>
            <div style={{ fontWeight: 800, fontSize: 18, margin: "6px 0" }}>Aún no hay cuentas conectadas</div>
            <div style={{ fontSize: 13.5, color: C.slate, marginBottom: 16 }}>Agrega tus correos de Gmail con su contraseña de aplicación y aquí verás todas las bandejas juntas, con búsqueda y filtro por cuenta.</div>
            <button onClick={() => setPanelCuentas(true)} style={btn(C.navy, C.white)}>+ Agregar la primera cuenta</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
              {[{ id: "todas", nombre: "Todas" }, ...cuentas].map((c) => {
                const activo = cuentaSel === c.id;
                const n = c.id === "todas" ? totalNuevos : nuevosPorCuenta[c.id] || 0;
                return (
                  <button key={c.id} onClick={() => setCuentaSel(c.id)} style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", border: `1.5px solid ${activo ? C.navy : C.border}`, background: activo ? C.navy : C.white, color: activo ? C.white : C.slate, display: "flex", alignItems: "center", gap: 7 }}>
                    {c.id !== "todas" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorDe(c.id)[0] }} />}
                    {c.nombre || c.email}{n > 0 && <span style={{ background: activo ? C.white : C.amberBg, color: C.amber, borderRadius: 10, padding: "0 7px", fontSize: 11 }}>{n}</span>}
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <label style={{ fontSize: 12.5, color: C.slate, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={soloNuevos} onChange={(e) => setSoloNuevos(e.target.checked)} /> Solo sin leer</label>
              <label title="Esconde boletines y correos masivos (los que traen opción de darse de baja)" style={{ fontSize: 12.5, color: C.slate, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={ocultarMasivos} onChange={(e) => setOcultarMasivos(e.target.checked)} /> Ocultar boletines</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por remitente, asunto o texto…" style={{ ...inp, width: 280 }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) 1fr", gap: 14, alignItems: "start" }}>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", maxHeight: "calc(100vh - 190px)", overflowY: "auto" }}>
                {!cargado && <div style={{ padding: 24, color: C.slate, textAlign: "center" }}>Cargando…</div>}
                {cargado && !filtrados.length && <div style={{ padding: 28, color: C.slate, textAlign: "center", fontSize: 13 }}>{mensajes.length ? "Ningún correo coincide con el filtro." : "Todavía no hay correos guardados. Se leen cada 10 minutos, o pulsa «Sincronizar ahora»."}</div>}
                {filtrados.map((m) => {
                  const [col, bg] = colorDe(m.cuentaId);
                  const activo = m.id === selId;
                  return (
                    <div key={m.id} onClick={() => abrir(m)} style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: activo ? C.blueBg : C.white, borderLeft: `4px solid ${m.leidoAtlas ? "transparent" : col}` }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <div style={{ flex: 1, fontWeight: m.leidoAtlas ? 600 : 800, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.de?.nombre || m.de?.correo || "—"}</div>
                        <div style={{ fontSize: 11.5, color: C.slate, whiteSpace: "nowrap" }}>{fechaCorta(m.fecha)}</div>
                      </div>
                      <div style={{ fontWeight: m.leidoAtlas ? 500 : 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.adjuntos?.length ? "📎 " : ""}{m.asunto}</div>
                      <div style={{ fontSize: 12, color: C.slate, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "2px 0 5px" }}>{m.resumenCorto}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 8px", borderRadius: 10, background: bg, color: col }}>{nombreDe(m.cuentaId)}</span>
                        {m.esMasivo && <Pastilla bg={C.canvas} color={C.slate}>Boletín</Pastilla>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, minHeight: 320, position: "sticky", top: 12, maxHeight: "calc(100vh - 190px)", overflowY: "auto" }}>
                {!sel ? <div style={{ color: C.slate, textAlign: "center", marginTop: 90, fontSize: 14 }}>Elige un correo de la lista para leerlo.</div> : (
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 240, fontWeight: 800, fontSize: 18, lineHeight: 1.3 }}>{sel.asunto}</div>
                      <button onClick={() => marcar(sel, !sel.leidoAtlas)} style={btn(C.white, C.slate, C.border)}>{sel.leidoAtlas ? "Marcar sin leer" : "Marcar leído"}</button>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.slate, margin: "10px 0", lineHeight: 1.6 }}>
                      <div><b style={{ color: C.ink }}>De:</b> {quien(sel.de)}</div>
                      <div><b style={{ color: C.ink }}>Para:</b> {(sel.para || []).map(quien).join(", ") || "—"}</div>
                      {sel.copia?.length > 0 && <div><b style={{ color: C.ink }}>Cc:</b> {sel.copia.map(quien).join(", ")}</div>}
                      <div><b style={{ color: C.ink }}>Fecha:</b> {fechaLarga(sel.fecha)} · <span style={{ color: colorDe(sel.cuentaId)[0], fontWeight: 700 }}>{nombreDe(sel.cuentaId)}</span> ({sel.cuenta})</div>
                    </div>
                    {sel.adjuntos?.length > 0 && (
                      <div style={{ background: C.field, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12.5 }}>
                        {sel.adjuntos.map((a, i) => <div key={i}>📎 {a.nombre}{a.tamano ? <span style={{ color: C.slate }}> · {tamanoTxt(a.tamano)}</span> : null}</div>)}
                        <div style={{ color: C.slate, fontSize: 11.5, marginTop: 4 }}>Los adjuntos se ven en Gmail; aquí solo se muestran sus nombres.</div>
                      </div>
                    )}
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13.5, lineHeight: 1.6, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>{sel.texto || "(sin texto)"}</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {panelCuentas && <PanelCuentas cuentas={cuentas} colorDe={colorDe} onCerrar={() => setPanelCuentas(false)} onSincronizar={sincronizar} sincronizando={sincronizando} notify={notify} />}
    </div>
  );
}
