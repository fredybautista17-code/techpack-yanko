// (2026-11-18, a pedido de Fredy) «Subir nómina de la quincena» — Centro de Costo → Por área. Se suben uno o VARIOS Excel de nómina tal cual (hoja CONSOLIDADO):
// la quincena de cada archivo se detecta del nombre (y se puede corregir), se revisa un resumen por archivo y la lista de personas (cada nombre se cruza UNA
// sola vez con su ficha y esa decisión se recuerda para todas las quincenas), y se guarda en nomina_historico_quincena (una fila por persona y quincena;
// subir de nuevo la misma quincena la reemplaza). «Por área» usa esos datos reales en las quincenas que no tienen liquidación en ATLAS.
// Escribe solo en nomina_historico_quincena y nomina_historico_config/alias; no toca la nómina de ATLAS.
import React, { useMemo, useState } from "react";
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from "firebase/firestore";
import { leerNominaConsolidado, cruzarConTrabajadores, sugerirPeriodo, hojaConsolidado, docNominaQuincena, periodoIdDe } from "./centro-costo-nomina-quincena";

export const COLECCION_NOMINA_QUINCENA = "nomina_historico_quincena";
export const COLECCION_NOMINA_CONFIG = "nomina_historico_config"; // doc «alias»: { mapa: { NOMBRE_NORMALIZADO: idFicha | NINGUNA } }
export const NINGUNA = "__ninguna__";
const K = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", panel: "#FBF9F6", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", red: "#D24A38", redBg: "#FDF0EE", amber: "#B26F12", amberBg: "#FDF5E6", blue: "#3D6B9E", blueBg: "#EBF1F7", track: "#EFE9E1" };
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dinero = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const millones = (n) => "$" + (Math.abs(Number(n) || 0) / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " M";
const th = { position: "sticky", top: 0, background: K.panel, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: K.slate, padding: "8px 10px", textAlign: "right", fontWeight: 800, borderBottom: `1px solid ${K.border}` };
const td = { padding: "7px 10px", borderTop: `1px solid ${K.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 };
const campo = { border: `1.5px solid ${K.border}`, borderRadius: 10, padding: "8px 11px", fontSize: 14, fontWeight: 700, background: K.white, color: K.ink, fontFamily: "inherit" };
const etiqueta = { display: "block", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: K.slate, marginBottom: 4 };
const chip = (ok) => ({ display: "inline-block", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 800, background: ok ? K.greenBg : K.redBg, color: ok ? K.green : K.red });
const enlace = { border: "none", background: "none", color: K.blue, fontWeight: 800, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", padding: 0 };
const caja = { background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 };
const suma = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);

// Lee un archivo (solo la hoja CONSOLIDADO: el libro trae cientos de hojas por lote que no hacen falta).
async function leerArchivoNomina(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const nombres = XLSX.read(buf, { type: "array", bookSheets: true }).SheetNames || [];
  const hoja = hojaConsolidado(nombres);
  if (!hoja) throw new Error("No encontré una hoja llamada CONSOLIDADO.");
  const wb = XLSX.read(buf, { type: "array", sheets: hoja, cellFormula: false, cellStyles: false, cellHTML: false });
  return leerNominaConsolidado(XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null }));
}

export default function SubirNominaQuincenaModal({ db, trabajadores, currentUser, existentes, alias, anioInicial, onClose }) {
  const ahora = new Date();
  const [anio, setAnio] = useState(Number(anioInicial) || ahora.getFullYear());
  const [lotes, setLotes] = useState([]); // { id, archivo, mes, q, lectura, error, leyendo }
  const [asignaciones, setAsignaciones] = useState({}); // elegidas en esta sesión: nombreNorm → idFicha | NINGUNA
  const [editando, setEditando] = useState({});
  const [soloSinFicha, setSoloSinFicha] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const subidas = useMemo(() => {
    const m = new Map();
    (existentes || []).forEach((d) => m.set(d.periodoId, (m.get(d.periodoId) || 0) + 1));
    return m;
  }, [existentes]);
  const listaTrab = useMemo(() => [...(trabajadores || [])].filter((t) => t && t.nombre).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")), [trabajadores]);

  // Cada archivo con su quincena; si dos archivos caen en la misma quincena, solo cuenta el primero.
  const archivos = useMemo(() => {
    const vistos = new Set();
    return lotes.map((l) => {
      const pid = periodoIdDe(anio, l.mes, l.q);
      const repetido = !!l.lectura && vistos.has(pid);
      if (l.lectura && !repetido) vistos.add(pid);
      return { ...l, pid, repetido, incluir: !!l.lectura && !repetido, yaGuardada: subidas.get(pid) || 0 };
    });
  }, [lotes, anio, subidas]);
  const incluidos = useMemo(() => archivos.filter((a) => a.incluir), [archivos]);

  // Personas distintas de todos los archivos incluidos (cada nombre se cruza una sola vez).
  const personas = useMemo(() => {
    const m = new Map();
    incluidos.forEach((a) => a.lectura.personas.forEach((p) => {
      const x = m.get(p.nombreNorm) || { nombre: p.nombre, nombreNorm: p.nombreNorm, tipoNomina: p.tipoNomina, quincenas: 0, ayuda: 0, producido: 0, pagado: 0 };
      x.quincenas += 1; x.ayuda += p.ayuda; x.producido += p.producido; x.pagado += p.pagado; x.tipoNomina = p.tipoNomina;
      m.set(p.nombreNorm, x);
    }));
    return [...m.values()];
  }, [incluidos]);
  const cruzadas = useMemo(() => cruzarConTrabajadores(personas, trabajadores), [personas, trabajadores]);
  // Prioridad: lo elegido ahora > lo recordado de cargas anteriores > el cruce automático por nombre.
  const filas = useMemo(() => {
    const recordadas = alias || {};
    const resolver = (p) => {
      const elegido = asignaciones[p.nombreNorm] !== undefined ? asignaciones[p.nombreNorm] : recordadas[p.nombreNorm];
      if (elegido === NINGUNA) return { ...p, trabajadorId: "", trabajadorNombre: "", area: "", cruce: null, decidido: true };
      const t = elegido ? (trabajadores || []).find((x) => x.id === elegido) : null;
      if (t) return { ...p, trabajadorId: t.id, trabajadorNombre: t.nombre, area: t.area || "", cruce: asignaciones[p.nombreNorm] !== undefined ? "manual" : "recordada" };
      return p;
    };
    return cruzadas.map(resolver).sort((a, b) => b.ayuda - a.ayuda || b.producido - a.producido);
  }, [cruzadas, asignaciones, alias, trabajadores]);
  const sinFicha = filas.filter((p) => !p.trabajadorId && !p.decidido).length;
  const visibles = soloSinFicha ? filas.filter((p) => !p.trabajadorId && !p.decidido) : filas;
  const porNombre = useMemo(() => new Map(filas.map((p) => [p.nombreNorm, p])), [filas]);

  async function agregarArchivos(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setError("");
    setMensaje("");
    for (const file of files) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const s = sugerirPeriodo(file.name);
      setLotes((prev) => [...prev, { id, archivo: file.name, mes: s.mes || 1, q: s.quincena || 1, lectura: null, error: "", leyendo: true, sinSugerencia: !s.mes || !s.quincena }]);
      try {
        const lectura = await leerArchivoNomina(file);
        setLotes((prev) => prev.map((l) => (l.id === id ? { ...l, lectura, leyendo: false } : l)));
      } catch (e) {
        setLotes((prev) => prev.map((l) => (l.id === id ? { ...l, error: e && e.message ? e.message : String(e), leyendo: false } : l)));
      }
    }
  }
  const cambiarLote = (id, campos) => setLotes((prev) => prev.map((l) => (l.id === id ? { ...l, ...campos, sinSugerencia: false } : l)));
  const quitarLote = (id) => setLotes((prev) => prev.filter((l) => l.id !== id));

  async function guardar() {
    if (!incluidos.length || guardando) return;
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const quien = currentUser?.name || currentUser?.username || currentUser?.email || "";
      const cuando = new Date().toISOString();
      let nPersonas = 0;
      let k = 0;
      for (const a of incluidos) {
        k += 1;
        setProgreso(`Guardando ${k} de ${incluidos.length}: ${MESES[a.mes - 1]} Q${a.q}…`);
        const docs = a.lectura.personas.map((p) => docNominaQuincena({ ...p, ...(porNombre.get(p.nombreNorm) || {}), nombre: p.nombre, nombreNorm: p.nombreNorm }, { anio, mes: a.mes, quincena: a.q, archivo: a.archivo, quien, cuando }));
        const ids = new Set(docs.map((d) => d.id));
        const previos = await getDocs(query(collection(db, COLECCION_NOMINA_QUINCENA), where("periodoId", "==", a.pid)));
        for (let i = 0; i < docs.length; i += 100) await Promise.all(docs.slice(i, i + 100).map((d) => setDoc(doc(db, COLECCION_NOMINA_QUINCENA, d.id), d.datos)));
        // Subir de nuevo la misma quincena la reemplaza: se borran las filas viejas que ya no vienen en el archivo.
        await Promise.all(previos.docs.filter((d) => !ids.has(d.id)).map((d) => deleteDoc(d.ref)));
        nPersonas += docs.length;
      }
      // Se recuerdan las fichas elegidas a mano para todas las próximas quincenas.
      if (Object.keys(asignaciones).length) {
        await setDoc(doc(db, COLECCION_NOMINA_CONFIG, "alias"), { mapa: { ...(alias || {}), ...asignaciones }, actualizadoPor: quien, actualizadoEn: cuando });
      }
      setMensaje(`✓ ${incluidos.length} ${incluidos.length === 1 ? "quincena guardada" : "quincenas guardadas"} (${nPersonas} filas de personas). Las fichas que elegiste quedan recordadas.`);
      setLotes([]);
      setAsignaciones({});
      setEditando({});
    } catch (e) {
      setError(`No se pudo guardar: ${e && e.message ? e.message : e}`);
    }
    setProgreso("");
    setGuardando(false);
  }

  const leyendoAlguno = lotes.some((l) => l.leyendo);
  const avisosTodos = incluidos.flatMap((a) => a.lectura.avisos.map((t) => `${MESES[a.mes - 1]} Q${a.q}: ${t}`));
  const aniosLista = [ahora.getFullYear() + 1, ahora.getFullYear(), ahora.getFullYear() - 1, ahora.getFullYear() - 2];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: K.canvas, borderRadius: 16, width: "100%", maxWidth: 1060, padding: "18px 20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: K.ink, flex: 1 }}>📤 Subir nómina de las quincenas</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: K.slate }} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: K.slate, marginBottom: 14 }}>Sube uno o varios Excel de nómina tal cual (se lee la hoja CONSOLIDADO): de cada persona se guarda lo producido, la ayuda («AUXILIO») y lo pagado. «Por área» usa estos datos reales en las quincenas que no están liquidadas en ATLAS.</div>

        <div style={caja}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>1 · Año y archivos</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><label style={etiqueta}>Año de estas nóminas</label><select style={campo} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{aniosLista.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            <div style={{ flex: 1, minWidth: 260, background: K.panel, border: `1.5px dashed ${K.border}`, borderRadius: 12, padding: "10px 14px" }}>
              <input type="file" multiple accept=".xlsx,.xlsm,.xls" disabled={guardando} onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ""; }} />
              <div style={{ fontSize: 12, color: K.slate, marginTop: 4 }}>Puedes elegir varios archivos a la vez. La quincena se detecta del nombre del archivo y la puedes corregir abajo.</div>
            </div>
          </div>
        </div>

        {error ? <div style={{ background: K.redBg, border: `1px solid ${K.red}`, color: K.red, borderRadius: 10, padding: "9px 13px", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{error}</div> : null}
        {mensaje ? <div style={{ background: K.greenBg, border: `1px solid ${K.green}`, color: K.green, borderRadius: 10, padding: "9px 13px", fontSize: 13, fontWeight: 800, marginBottom: 12 }}>{mensaje}</div> : null}

        {lotes.length ? (
          <div style={caja}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>2 · Archivos y su quincena</div>
            <div style={{ overflow: "auto", border: `1px solid ${K.border}`, borderRadius: 12 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
                <thead><tr><th style={{ ...th, textAlign: "left" }}>Archivo</th><th style={{ ...th, textAlign: "left" }}>Quincena</th><th style={th}>Personas</th><th style={th}>Producido</th><th style={th}>Ayuda</th><th style={th}>Pagado</th><th style={{ ...th, textAlign: "left" }}>Estado</th><th style={th} /></tr></thead>
                <tbody>
                  {archivos.map((a) => {
                    const t = a.lectura ? a.lectura.totales : null;
                    return (
                      <tr key={a.id} style={{ background: a.error ? K.redBg : a.repetido ? K.amberBg : undefined }}>
                        <td style={{ ...td, textAlign: "left", fontWeight: 700, fontSize: 12 }}>{a.archivo}</td>
                        <td style={{ ...td, textAlign: "left", whiteSpace: "nowrap" }}>
                          <select style={{ ...campo, padding: "4px 8px", fontSize: 12 }} value={a.mes} onChange={(e) => cambiarLote(a.id, { mes: Number(e.target.value) })}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>{" "}
                          <select style={{ ...campo, padding: "4px 8px", fontSize: 12 }} value={a.q} onChange={(e) => cambiarLote(a.id, { q: Number(e.target.value) })}><option value={1}>Q1 (1–15)</option><option value={2}>Q2 (16–fin)</option></select>
                        </td>
                        <td style={td}>{t ? t.personas : "—"}</td>
                        <td style={td}>{t ? millones(t.producido) : "—"}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{t ? dinero(t.ayuda) : "—"}</td>
                        <td style={td}>{t ? millones(t.pagado) : "—"}</td>
                        <td style={{ ...td, textAlign: "left", fontSize: 12 }}>
                          {a.leyendo ? <span style={{ color: K.slate }}>Leyendo…</span>
                            : a.error ? <span style={{ color: K.red, fontWeight: 700 }}>{a.error}</span>
                            : a.repetido ? <span style={{ color: K.amber, fontWeight: 700 }}>Otra quincena igual en la lista: este se ignora</span>
                            : a.sinSugerencia ? <span style={{ color: K.amber, fontWeight: 700 }}>No pude leer la quincena del nombre: revísala</span>
                            : a.yaGuardada ? <span style={{ color: K.amber, fontWeight: 700 }}>Ya subida ({a.yaGuardada} personas): se reemplaza</span>
                            : <span style={{ color: K.green, fontWeight: 700 }}>✓ Lista</span>}
                        </td>
                        <td style={td}><button type="button" onClick={() => quitarLote(a.id)} disabled={guardando} style={{ ...enlace, color: K.slate }}>Quitar</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {avisosTodos.map((t) => <div key={t} style={{ fontSize: 12.5, color: K.amber, background: K.amberBg, borderRadius: 8, padding: "6px 10px", marginTop: 6 }}>⚠ {t}</div>)}
          </div>
        ) : null}

        {incluidos.length ? (
          <div style={caja}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>3 · Resumen y fichas de las personas</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", background: K.ink, borderRadius: 14, padding: "14px 20px", marginBottom: 12 }}>
              {[["Quincenas", String(incluidos.length), `${personas.length} personas distintas`, "#fff"], ["Producido", millones(suma(incluidos.map((a) => a.lectura.totales), "producido")), "lo que hizo cada persona", "#fff"], ["Ayuda", dinero(suma(incluidos.map((a) => a.lectura.totales), "ayuda")), "columna «AUXILIO»", "#FFD27F"], ["Pagado", millones(suma(incluidos.map((a) => a.lectura.totales), "pagado")), "columna «TOTAL» del final", "#fff"]].map(([e, v, s, c]) => (
                <div key={e} style={{ minWidth: 150 }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#B9B9D0", fontWeight: 800 }}>{e}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  <div style={{ fontSize: 11.5, color: "#B9B9D0" }}>{s}</div>
                </div>
              ))}
            </div>
            {sinFicha > 0 ? (
              <div style={{ fontSize: 12.5, color: K.red, background: K.redBg, borderRadius: 8, padding: "6px 10px", marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span>{sinFicha} {sinFicha === 1 ? "persona no coincide" : "personas no coinciden"} con una ficha. Elige a quién corresponde (una sola vez: queda recordado para todas las quincenas) o déjalas sin ficha: se guardan igual, pero no cuentan en «Por área» hasta que tengan una.</span>
                <label style={{ fontWeight: 800, cursor: "pointer" }}><input type="checkbox" checked={soloSinFicha} onChange={(e) => setSoloSinFicha(e.target.checked)} /> ver solo esas</label>
              </div>
            ) : <div style={{ fontSize: 12.5, color: K.green, marginBottom: 8, fontWeight: 700 }}>✓ Todas las personas están cruzadas con una ficha o decididas sin ficha.</div>}
            <div style={{ overflow: "auto", maxHeight: 440, border: `1px solid ${K.border}`, borderRadius: 12 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820 }}>
                <thead><tr><th style={{ ...th, textAlign: "left" }}>Persona</th><th style={th}>Tipo</th><th style={th}>Quincenas</th><th style={th}>Producido</th><th style={th}>Ayuda</th><th style={{ ...th, textAlign: "left" }}>Ficha en ATLAS</th></tr></thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.nombreNorm} style={{ background: !p.trabajadorId && !p.decidido ? K.redBg : undefined }}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{p.nombre}</td>
                      <td style={td}>{p.tipoNomina}</td>
                      <td style={td}>{p.quincenas}</td>
                      <td style={td}>{dinero(p.producido)}</td>
                      <td style={{ ...td, background: p.ayuda > 0 ? "#FFF4D6" : undefined, fontWeight: p.ayuda > 0 ? 800 : 500 }}>{p.ayuda > 0 ? dinero(p.ayuda) : "—"}</td>
                      <td style={{ ...td, textAlign: "left" }}>
                        {(p.trabajadorId || p.decidido) && !editando[p.nombreNorm] ? (
                          <span title={p.cruce === "exacto" ? "Mismo nombre" : p.cruce === "manual" ? "Elegida ahora" : p.cruce === "recordada" ? "Elegida en una carga anterior" : p.decidido ? "Decidido: sin ficha" : "Nombre parecido: revísalo"}>
                            {p.trabajadorId ? <><span style={chip(true)}>✓ {p.area || "sin área"}</span><span style={{ fontSize: 11.5, color: K.slate }}> · {p.trabajadorNombre}{p.cruce === "manual" ? " (a mano)" : p.cruce === "recordada" ? " (recordada)" : ""}</span></> : <span style={{ ...chip(true), background: K.track, color: K.slate }}>sin ficha (decidido)</span>}{" "}
                            <button type="button" onClick={() => setEditando({ ...editando, [p.nombreNorm]: true })} style={enlace}>Cambiar</button>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <select style={{ ...campo, padding: "4px 8px", fontSize: 12, minWidth: 200 }} value={p.trabajadorId || ""} onChange={(e) => { const v = e.target.value; if (!v) return; setAsignaciones({ ...asignaciones, [p.nombreNorm]: v }); setEditando({ ...editando, [p.nombreNorm]: false }); }}>
                              <option value="">Elegir ficha…</option>
                              <option value={NINGUNA}>— Dejar sin ficha —</option>
                              {listaTrab.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.area ? ` · ${x.area}` : ""}</option>)}
                            </select>
                            {p.trabajadorId || p.decidido ? <button type="button" onClick={() => setEditando({ ...editando, [p.nombreNorm]: false })} style={{ ...enlace, color: K.slate, textDecoration: "none" }}>Cancelar</button> : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" disabled={guardando || leyendoAlguno} onClick={guardar} style={{ background: K.ink, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 14, cursor: guardando ? "default" : "pointer", opacity: guardando || leyendoAlguno ? 0.6 : 1, fontFamily: "inherit" }}>{guardando ? "Guardando…" : `Guardar ${incluidos.length} ${incluidos.length === 1 ? "quincena" : "quincenas"}`}</button>
              <button type="button" disabled={guardando} onClick={() => { setLotes([]); setAsignaciones({}); setEditando({}); }} style={{ background: K.white, color: K.ink, border: `1.5px solid ${K.border}`, borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
              {progreso ? <span style={{ fontSize: 13, color: K.slate, fontWeight: 700 }}>{progreso}</span> : null}
            </div>
          </div>
        ) : null}

        <div style={caja}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Quincenas ya subidas · {anio}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(66px, 1fr))", gap: 6 }}>
            {MESES.map((m, i) => (
              <div key={m} style={{ border: `1px solid ${K.border}`, borderRadius: 10, padding: 6, textAlign: "center", background: K.white }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: K.slate, textTransform: "uppercase", marginBottom: 4 }}>{m.slice(0, 3)}</div>
                {[1, 2].map((qq) => {
                  const n = subidas.get(periodoIdDe(anio, i + 1, qq)) || 0;
                  const sel = incluidos.some((a) => a.mes === i + 1 && a.q === qq);
                  return <div key={qq} title={n ? `${n} personas guardadas` : "sin subir"} style={{ height: 22, borderRadius: 6, marginBottom: 4, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", background: n ? K.green : K.track, color: n ? "#fff" : "#9a928a", border: sel ? `2px solid ${K.blue}` : "2px solid transparent" }}>Q{qq}</div>;
                })}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: K.slate, marginTop: 6 }}>Verde = quincena subida · gris = falta · borde azul = las que estás subiendo ahora.</div>
        </div>
      </div>
    </div>
  );
}
