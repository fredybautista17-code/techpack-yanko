import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { datosFactura, buscarEnBusint, estadoFactura, diasDesde, diasHasta, urgenciaFactura } from "./correos-facturas-calculo";

// ─── CORREOS (2026-11-16, a pedido de Fredy) ─────────────────────────────────────────────────────
// Fase 1: bandeja unificada de las cuentas de Gmail de la empresa. Una función de Firebase lee cada cuenta por IMAP
// (functions/correos.js) y guarda los mensajes en `correos_mensajes`; aquí se ven juntos, con filtro por cuenta,
// búsqueda y detalle. Solo el administrador (reglas de Firestore). ATLAS no marca nada como leído en Gmail ni envía
// ni borra correos: «leído» aquí es solo de ATLAS. Las cuentas y sus contraseñas de aplicación se administran en «Cuentas».
// Colecciones: correos_cuentas, correos_mensajes (y correos_secretos, solo servidor).
// Fase 2: una función (functions/correos-ia.js) clasifica cada correo con IA y guarda `clasificacion` {categoria, prioridad,
// requiereAccion, accion, resumen, datos}. Aquí se ve como etiqueta, se filtra por categoría / «requieren acción» y el
// administrador puede corregir la categoría. Solo clasifica: no responde ni envía nada.
// «Facturas recibidas»: las facturas de proveedores que llegan por correo se listan con su estado (por registrar / registrada
// en Busint / descartada). NO crean deuda: Cuentas por Pagar viene de Busint; aquí solo se compara con el último corte
// (contabilidad_cxp_facturas) para saber si contabilidad ya la registró y avisar de las que se acercan a vencer.

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
// Categorías de la clasificación con IA (las mismas claves de functions/correos-ia.js).
const CATEGORIAS = {
  factura_proveedor: { nombre: "Facturas", color: C.amber, bg: C.amberBg },
  cartera_descuentos: { nombre: "Cartera y descuentos", color: C.violet, bg: C.violetBg },
  despacho_proveedor: { nombre: "Despachos", color: C.blue, bg: C.blueBg },
  banco_dian: { nombre: "Banco / DIAN", color: C.red, bg: C.redBg },
  cliente_pedido: { nombre: "Clientes", color: C.green, bg: C.greenBg },
  publicidad: { nombre: "Publicidad", color: C.slate, bg: "#F1EEE9" },
  otro: { nombre: "Otro", color: C.slate, bg: "#F1EEE9" },
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
const chipCat = (activo, color) => ({ padding: "4px 12px", borderRadius: 16, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", border: `1.5px solid ${activo ? color : C.border}`, background: activo ? color : C.white, color: activo ? C.white : C.slate });
const etiqueta = { fontSize: 11, color: C.slate, fontWeight: 700, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 };

const pesos = (v) => (v ? `$${Math.round(v).toLocaleString("es-CO")}` : "—");
const fechaDia = (aaaammdd) => { const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(aaaammdd || "")); return p ? new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3])).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—"; };
const URGENCIA = { alta: { color: C.red, bg: C.redBg }, media: { color: C.amber, bg: C.amberBg }, normal: { color: "transparent", bg: C.white } };

// ── Control de facturas de proveedores recibidas por correo ──
function FacturasRecibidas({ filas, errorCxp, fechaCorte, colorDe, nombreDe, onVer, onEstado }) {
  const [filtro, setFiltro] = useState("por_registrar");
  const cuenta = (e) => filas.filter((f) => f.estado === e).length;
  const porRegistrar = filas.filter((f) => f.estado === "por_registrar");
  const suma = porRegistrar.reduce((a, f) => a + (f.datos.valor || 0), 0);
  const nPronto = porRegistrar.filter((f) => { const h = diasHasta(f.datos.vence); return h !== null && h <= 7; }).length;
  const nViejas = porRegistrar.filter((f) => { const d = diasDesde(f.m.fecha); return d !== null && d >= 3; }).length;
  const peso = { alta: 0, media: 1, normal: 2 };
  const visibles = filas
    .filter((f) => filtro === "todas" || f.estado === filtro)
    .sort((a, b) => (a.estado === "por_registrar" && b.estado === "por_registrar" ? (peso[a.urg] - peso[b.urg]) || String(a.datos.vence || "9999").localeCompare(String(b.datos.vence || "9999")) : 0) || String(b.m.fecha).localeCompare(String(a.m.fecha)));
  const tile = (titulo, valor, sub, color, bg) => (
    <div style={{ background: bg, borderRadius: 12, padding: "12px 16px", minWidth: 190, flex: "1 1 190px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{valor}</div>
      <div style={{ fontSize: 12, color: C.slate }}>{sub}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {tile("Por registrar", porRegistrar.length, suma ? `${pesos(suma)} en facturas` : "Facturas recibidas que contabilidad aún no registra", C.amber, C.amberBg)}
        {tile("Vencen en 7 días o ya vencieron", nPronto, "Entre las que aún están por registrar", nPronto ? C.red : C.green, nPronto ? C.redBg : C.greenBg)}
        {tile("Llevan 3 días o más sin registrar", nViejas, "Desde que llegó el correo", nViejas ? C.amber : C.green, nViejas ? C.amberBg : C.greenBg)}
      </div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 12, lineHeight: 1.5 }}>
        {errorCxp ? <span style={{ color: C.red }}>No se pudo leer Cuentas por Pagar ({errorCxp}); el estado se maneja a mano.</span> : fechaCorte ? `Se compara con el corte de Cuentas por Pagar de Busint del ${fechaDia(String(fechaCorte).slice(0, 10))}. Cuando contabilidad registre la factura en Busint, aquí pasa sola a «Registrada».` : "Todavía no hay un corte de Cuentas por Pagar para comparar; el estado se maneja a mano."} Esta lista no crea deuda ni escribe en Busint. Los datos los detecta la IA: verifícalos con el correo.
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[["por_registrar", "Por registrar"], ["registrada", "Registradas"], ["descartada", "Descartadas"], ["todas", "Todas"]].map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} style={chipCat(filtro === k, C.navy)}>{t} <span style={{ opacity: 0.75 }}>{k === "todas" ? filas.length : cuenta(k)}</span></button>
        ))}
      </div>
      {!visibles.length ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, color: C.slate, textAlign: "center", fontSize: 13.5 }}>
          {filas.length ? "No hay facturas en este filtro." : "Todavía no hay facturas detectadas. Pulsa «✨ Clasificar con IA» en la bandeja: las facturas de proveedores aparecen aquí solas."}
        </div>
      ) : (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflowX: "auto" }}>
          {visibles.map((f) => {
            const u = URGENCIA[f.urg] || URGENCIA.normal;
            const h = diasHasta(f.datos.vence);
            const d = diasDesde(f.m.fecha);
            const col = colorDe(f.m.cuentaId)[0];
            return (
              <div key={f.m.id} style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "11px 14px", borderBottom: `1px solid ${C.border}`, borderLeft: `4px solid ${f.estado === "por_registrar" ? u.color : "transparent"}`, background: f.estado === "por_registrar" ? u.bg : C.white, opacity: f.estado === "descartada" ? 0.65 : 1 }}>
                <div style={{ flex: "2 1 220px", minWidth: 200 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5 }}>{f.datos.proveedor || "Proveedor sin identificar"}</div>
                  <div style={{ fontSize: 12, color: C.slate }}>{f.datos.numero ? `Factura ${f.datos.numero}` : "Sin número detectado"} · <span style={{ color: col, fontWeight: 700 }}>{nombreDe(f.m.cuentaId)}</span></div>
                </div>
                <div style={{ flex: "1 1 110px", fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{pesos(f.datos.valor)}</div>
                <div style={{ flex: "1 1 130px", fontSize: 12.5 }}>
                  <div>{f.datos.vence ? `Vence ${fechaDia(f.datos.vence)}` : "Sin fecha de pago"}</div>
                  {f.estado === "por_registrar" && h !== null && <div style={{ fontWeight: 700, color: h <= 3 ? C.red : h <= 7 ? C.amber : C.slate }}>{h < 0 ? `Venció hace ${-h} día(s)` : h === 0 ? "Vence hoy" : `En ${h} día(s)`}</div>}
                </div>
                <div style={{ flex: "1 1 130px", fontSize: 12.5, color: C.slate }}>
                  <div>Llegó {fechaCorta(f.m.fecha)}</div>
                  {f.estado === "por_registrar" && d !== null && d >= 1 && <div style={{ fontWeight: 700, color: d >= 3 ? C.amber : C.slate }}>Hace {d} día(s)</div>}
                </div>
                <div style={{ flex: "2 1 230px", fontSize: 12.5 }}>
                  {f.estado === "por_registrar" && <Pastilla bg={C.amberBg} color={C.amber}>Por registrar</Pastilla>}
                  {f.estado === "descartada" && <Pastilla bg={C.canvas} color={C.slate}>Descartada</Pastilla>}
                  {f.estado === "registrada" && <Pastilla bg={C.greenBg} color={C.green}>Registrada</Pastilla>}
                  {f.estado === "registrada" && (f.coincidencia ? <div style={{ color: C.slate, marginTop: 3 }}>En Busint: {f.coincidencia.proveedor} · factura {f.coincidencia.nfact}{f.coincidencia.tipo === "valor" ? " (coincide por valor y proveedor)" : ""}</div> : <div style={{ color: C.slate, marginTop: 3 }}>Marcada por ti</div>)}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => onVer(f.m)} style={btn(C.white, C.blue, C.blue)}>Ver correo</button>
                  {f.estado === "por_registrar" && <button onClick={() => onEstado(f.m, "registrada")} style={btn(C.white, C.green, C.green)}>Ya está registrada</button>}
                  {f.estado === "por_registrar" && <button onClick={() => onEstado(f.m, "descartada")} style={btn(C.white, C.slate, C.border)}>Descartar</button>}
                  {f.estado !== "por_registrar" && !f.coincidencia && <button onClick={() => onEstado(f.m, null)} style={btn(C.white, C.slate, C.border)}>Volver a por registrar</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const [catSel, setCatSel] = useState("todas");
  const [soloAccion, setSoloAccion] = useState(false);
  const [clasificando, setClasificando] = useState(false);
  const [vista, setVista] = useState("bandeja");
  const [cxp, setCxp] = useState(null);
  const [errorCxp, setErrorCxp] = useState("");

  useEffect(() => onSnapshot(collection(db, "correos_cuentas"), (s) => setCuentas(s.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.creadoEn || "").localeCompare(String(b.creadoEn || "")))), (e) => setErrorCarga(mensajeError(e))), []);
  useEffect(() => onSnapshot(query(collection(db, "correos_mensajes"), orderBy("fecha", "desc"), limit(400)), (s) => { setMensajes(s.docs.map((d) => ({ ...d.data(), id: d.id }))); setCargado(true); }, (e) => { setErrorCarga(mensajeError(e)); setCargado(true); }), []);

  // Facturas abiertas del último corte de Cuentas por Pagar (Busint), para saber si contabilidad ya registró cada factura.
  useEffect(() => onSnapshot(collection(db, "contabilidad_cxp_facturas"), (s) => { setCxp(s.docs.map((d) => d.data())); setErrorCxp(""); }, (e) => { setCxp([]); setErrorCxp(mensajeError(e)); }), []);

  const colorDe = (id) => COLORES_CUENTA[Math.max(0, cuentas.findIndex((c) => c.id === id)) % COLORES_CUENTA.length];
  const nombreDe = (id) => { const c = cuentas.find((x) => x.id === id); return c ? (c.nombre || c.email) : id; };

  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtrados = useMemo(() => {
    const qn = norm(q);
    return mensajes
      .filter((m) => cuentaSel === "todas" || m.cuentaId === cuentaSel)
      .filter((m) => !soloNuevos || !m.leidoAtlas)
      .filter((m) => catSel === "todas" || m.clasificacion?.categoria === catSel)
      .filter((m) => !soloAccion || m.clasificacion?.requiereAccion)
      // «Ocultar publicidad»: con IA se esconde solo lo clasificado como publicidad (así las facturas que llegan por
      // plataformas automáticas no se pierden); si el correo aún no está clasificado se usa la marca de envío masivo.
      .filter((m) => !ocultarMasivos || (m.clasificacion ? m.clasificacion.categoria !== "publicidad" : !m.esMasivo))
      .filter((m) => !qn || norm(`${m.asunto} ${m.de?.nombre} ${m.de?.correo} ${m.resumenCorto} ${m.texto}`).includes(qn));
  }, [mensajes, cuentaSel, soloNuevos, ocultarMasivos, q, catSel, soloAccion]);
  const pendientesIA = mensajes.filter((m) => !m.clasificacion).length;
  const filasFactura = useMemo(() => mensajes.filter((m) => m.clasificacion?.categoria === "factura_proveedor").map((m) => {
    const datos = datosFactura(m);
    const coincidencia = cxp ? buscarEnBusint(datos, cxp) : null;
    const estado = estadoFactura(m, coincidencia);
    return { m, datos, coincidencia, estado, urg: estado === "por_registrar" ? urgenciaFactura(datos, m.fecha) : "normal" };
  }), [mensajes, cxp]);
  const nFacturasPorRegistrar = filasFactura.filter((f) => f.estado === "por_registrar").length;
  const fechaCorteCxp = (cxp || []).reduce((a, d) => (String(d.fechaCorte || "") > a ? String(d.fechaCorte) : a), "");
  const conteoCat = useMemo(() => { const o = {}; mensajes.filter((m) => cuentaSel === "todas" || m.cuentaId === cuentaSel).forEach((m) => { const k = m.clasificacion?.categoria; if (k) o[k] = (o[k] || 0) + 1; }); return o; }, [mensajes, cuentaSel]);
  const nAccion = mensajes.filter((m) => (cuentaSel === "todas" || m.cuentaId === cuentaSel) && m.clasificacion?.requiereAccion).length;
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

  async function clasificar() {
    setClasificando(true);
    try {
      const r = (await httpsCallable(functionsClient, "correosClasificarAhora")({})).data || {};
      if (r.error) notify?.("No se pudo clasificar: " + r.error);
      else notify?.(`Listo: ${r.clasificados || 0} correo(s) clasificado(s)${r.pendientes ? `; faltan ${r.pendientes} (se siguen clasificando solos cada 10 minutos)` : ""}.`);
    } catch (e) { notify?.("No se pudo clasificar: " + mensajeError(e)); }
    finally { setClasificando(false); }
  }
  async function marcarFactura(m, estado) {
    try { await updateDoc(doc(db, "correos_mensajes", m.id), { factura: estado ? { estado, en: new Date().toISOString() } : null }); }
    catch (e) { notify?.("No se pudo cambiar el estado: " + mensajeError(e)); }
  }
  function verCorreo(m) {
    setVista("bandeja"); setCuentaSel("todas"); setCatSel("todas"); setSoloNuevos(false); setSoloAccion(false); setOcultarMasivos(false); setQ("");
    abrir(m);
  }
  async function corregirCategoria(m, categoria) {
    try { await updateDoc(doc(db, "correos_mensajes", m.id), { "clasificacion.categoria": categoria, "clasificacion.corregida": true }); }
    catch (e) { notify?.("No se pudo cambiar la categoría: " + mensajeError(e)); }
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
        <div style={{ display: "flex", gap: 6, marginLeft: 6 }}>
          <button onClick={() => setVista("bandeja")} style={btn(vista === "bandeja" ? "#C8B8A2" : "transparent", vista === "bandeja" ? C.ink : C.white, vista === "bandeja" ? "#C8B8A2" : "rgba(255,255,255,.35)")}>Bandeja</button>
          <button onClick={() => setVista("facturas")} style={btn(vista === "facturas" ? "#C8B8A2" : "transparent", vista === "facturas" ? C.ink : C.white, vista === "facturas" ? "#C8B8A2" : "rgba(255,255,255,.35)")}>🧾 Facturas recibidas{nFacturasPorRegistrar > 0 ? ` (${nFacturasPorRegistrar})` : ""}</button>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={sincronizar} disabled={sincronizando || !cuentas.length} style={{ ...btn("transparent", C.white, "rgba(255,255,255,.35)"), opacity: sincronizando || !cuentas.length ? 0.6 : 1 }}>{sincronizando ? "Leyendo…" : "↻ Sincronizar ahora"}</button>
        <button onClick={clasificar} disabled={clasificando || !cuentas.length} title="La IA le pone categoría, prioridad y resumen a cada correo. Solo clasifica: no responde ni envía nada." style={{ ...btn("transparent", C.white, "rgba(255,255,255,.35)"), opacity: clasificando || !cuentas.length ? 0.6 : 1 }}>{clasificando ? "Clasificando…" : `✨ Clasificar con IA${pendientesIA ? ` (${pendientesIA})` : ""}`}</button>
        <button onClick={() => setPanelCuentas(true)} style={btn("#C8B8A2", C.ink)}>⚙ Cuentas</button>
        {onLogout && <button onClick={onLogout} style={btn("transparent", "#B9BBDA", "rgba(255,255,255,.2)")}>Salir</button>}
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 24px" }}>
        {errorCarga && <div style={{ background: C.redBg, color: C.red, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>No se pudieron cargar los correos: {errorCarga}. Si es un error de permisos, falta publicar las reglas de Firestore (<code>firebase deploy --only firestore:rules</code>).</div>}
        {vista === "facturas" ? (
          <FacturasRecibidas filas={filasFactura} errorCxp={errorCxp} fechaCorte={fechaCorteCxp} colorDe={colorDe} nombreDe={nombreDe} onVer={verCorreo} onEstado={marcarFactura} />
        ) : cargado && !cuentas.length && !errorCarga ? (
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
              <label title="Esconde lo que la IA clasificó como publicidad. Las facturas de proveedores no se esconden." style={{ fontSize: 12.5, color: C.slate, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={ocultarMasivos} onChange={(e) => setOcultarMasivos(e.target.checked)} /> Ocultar publicidad</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por remitente, asunto o texto…" style={{ ...inp, width: 280 }} />
            </div>

            {(Object.keys(conteoCat).length > 0 || nAccion > 0) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                <button onClick={() => setCatSel("todas")} style={chipCat(catSel === "todas", C.navy)}>Todas las categorías</button>
                {Object.keys(CATEGORIAS).filter((k) => conteoCat[k]).map((k) => (
                  <button key={k} onClick={() => setCatSel(catSel === k ? "todas" : k)} style={chipCat(catSel === k, CATEGORIAS[k].color)}>{CATEGORIAS[k].nombre} <span style={{ opacity: 0.75 }}>{conteoCat[k]}</span></button>
                ))}
                <div style={{ flex: 1 }} />
                <label style={{ fontSize: 12.5, color: C.slate, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={soloAccion} onChange={(e) => setSoloAccion(e.target.checked)} /> Solo los que requieren acción ({nAccion})</label>
              </div>
            )}

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
                      <div style={{ fontSize: 12, color: C.slate, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "2px 0 5px" }}>{m.clasificacion?.resumen || m.resumenCorto}</div>
                      {m.clasificacion?.requiereAccion && m.clasificacion.accion && <div style={{ fontSize: 12, fontWeight: 700, color: m.clasificacion.prioridad === "alta" ? C.red : C.amber, margin: "0 0 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>➜ {m.clasificacion.accion}</div>}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 8px", borderRadius: 10, background: bg, color: col }}>{nombreDe(m.cuentaId)}</span>
                        {m.clasificacion?.categoria && <Pastilla bg={(CATEGORIAS[m.clasificacion.categoria] || CATEGORIAS.otro).bg} color={(CATEGORIAS[m.clasificacion.categoria] || CATEGORIAS.otro).color}>{(CATEGORIAS[m.clasificacion.categoria] || CATEGORIAS.otro).nombre}</Pastilla>}
                        {m.clasificacion?.prioridad === "alta" && <Pastilla bg={C.redBg} color={C.red}>Prioridad alta</Pastilla>}
                        {!m.clasificacion && m.esMasivo && <Pastilla bg={C.canvas} color={C.slate}>Boletín</Pastilla>}
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
                    {sel.clasificacion ? (
                      <div style={{ background: C.blueBg, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13, lineHeight: 1.55 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                          <b style={{ color: C.blue, fontSize: 12 }}>✨ Clasificado por IA</b>
                          <select value={sel.clasificacion.categoria || "otro"} onChange={(e) => corregirCategoria(sel, e.target.value)} title="Si la IA se equivocó, corrige la categoría" style={{ ...inp, width: "auto", padding: "3px 8px", fontSize: 12 }}>
                            {Object.keys(CATEGORIAS).map((k) => <option key={k} value={k}>{CATEGORIAS[k].nombre}</option>)}
                          </select>
                          <Pastilla bg={sel.clasificacion.prioridad === "alta" ? C.redBg : C.white} color={sel.clasificacion.prioridad === "alta" ? C.red : C.slate}>Prioridad {sel.clasificacion.prioridad || "media"}</Pastilla>
                          {sel.clasificacion.corregida && <Pastilla bg={C.greenBg} color={C.green}>Corregida por ti</Pastilla>}
                        </div>
                        {sel.clasificacion.resumen && <div>{sel.clasificacion.resumen}</div>}
                        {sel.clasificacion.requiereAccion && sel.clasificacion.accion && <div style={{ fontWeight: 700, color: C.amber }}>➜ {sel.clasificacion.accion}</div>}
                        {(sel.clasificacion.datos?.proveedor || sel.clasificacion.datos?.numero || sel.clasificacion.datos?.valor || sel.clasificacion.datos?.vence) && (
                          <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
                            Datos detectados (verifícalos): {[sel.clasificacion.datos.proveedor, sel.clasificacion.datos.numero ? `factura ${sel.clasificacion.datos.numero}` : "", sel.clasificacion.datos.valor ? `$${Number(sel.clasificacion.datos.valor).toLocaleString("es-CO")}` : "", sel.clasificacion.datos.vence ? `vence ${sel.clasificacion.datos.vence}` : ""].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ background: C.field, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, color: C.slate }}>Este correo aún no está clasificado. Pulsa «✨ Clasificar con IA» arriba (o espera: se clasifica solo cada 10 minutos).</div>
                    )}
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
