// (2026-11-18, a pedido de Fredy) «Subir nómina de la quincena» — Centro de Costo → Por área. Se sube el Excel de nómina tal cual (hoja CONSOLIDADO),
// se elige el año, el mes y la quincena, se revisa la vista previa (producido, ayuda y pagado por persona, y el cruce con las fichas) y se guarda en
// nomina_historico_quincena (un documento por persona y quincena; subir de nuevo la misma quincena la reemplaza). «Por área» usa esos datos reales para
// las quincenas que no tienen liquidación en ATLAS. Solo escribe en esa colección; no toca la nómina de ATLAS.
import React, { useMemo, useState } from "react";
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from "firebase/firestore";
import { leerNominaConsolidado, cruzarConTrabajadores, sugerirPeriodo, hojaConsolidado, docNominaQuincena, periodoIdDe } from "./centro-costo-nomina-quincena";

export const COLECCION_NOMINA_QUINCENA = "nomina_historico_quincena";
const K = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", panel: "#FBF9F6", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", red: "#D24A38", redBg: "#FDF0EE", amber: "#B26F12", amberBg: "#FDF5E6", blue: "#3D6B9E", blueBg: "#EBF1F7", track: "#EFE9E1" };
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dinero = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const millones = (n) => "$" + (Math.abs(Number(n) || 0) / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " M";
const th = { position: "sticky", top: 0, background: K.panel, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: K.slate, padding: "8px 10px", textAlign: "right", fontWeight: 800, borderBottom: `1px solid ${K.border}` };
const td = { padding: "7px 10px", borderTop: `1px solid ${K.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 };
const campo = { border: `1.5px solid ${K.border}`, borderRadius: 10, padding: "8px 11px", fontSize: 14, fontWeight: 700, background: K.white, color: K.ink, fontFamily: "inherit" };
const etiqueta = { display: "block", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: K.slate, marginBottom: 4 };
const chip = (ok) => ({ display: "inline-block", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 800, background: ok ? K.greenBg : K.redBg, color: ok ? K.green : K.red });

export default function SubirNominaQuincenaModal({ db, trabajadores, currentUser, existentes, anioInicial, onClose }) {
  const ahora = new Date();
  const [anio, setAnio] = useState(Number(anioInicial) || ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [q, setQ] = useState(ahora.getDate() > 15 ? 2 : 1);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [lectura, setLectura] = useState(null);
  const [asignaciones, setAsignaciones] = useState({});
  const [soloSinFicha, setSoloSinFicha] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const pid = periodoIdDe(anio, mes, q);
  const etiquetaQ = `Q${q} ${MESES[mes - 1]} ${anio}`;
  const subidas = useMemo(() => {
    const m = new Map();
    (existentes || []).forEach((d) => m.set(d.periodoId, (m.get(d.periodoId) || 0) + 1));
    return m;
  }, [existentes]);
  const yaGuardadas = subidas.get(pid) || 0;
  const listaTrab = useMemo(() => [...(trabajadores || [])].filter((t) => t && t.nombre).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")), [trabajadores]);
  const filas = useMemo(() => {
    if (!lectura) return [];
    return cruzarConTrabajadores(lectura.personas, trabajadores).map((p) => {
      const idManual = asignaciones[p.nombreNorm];
      const t = idManual ? (trabajadores || []).find((x) => x.id === idManual) : null;
      return t ? { ...p, trabajadorId: t.id, trabajadorNombre: t.nombre, area: t.area || "", cruce: "manual" } : p;
    }).sort((a, b) => b.ayuda - a.ayuda || b.producido - a.producido);
  }, [lectura, trabajadores, asignaciones]);
  const sinFicha = filas.filter((p) => !p.trabajadorId).length;
  const visibles = soloSinFicha ? filas.filter((p) => !p.trabajadorId) : filas;

  async function leerArchivo(file) {
    if (!file) return;
    setLeyendo(true);
    setError("");
    setMensaje("");
    setLectura(null);
    setAsignaciones({});
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const nombres = XLSX.read(buf, { type: "array", bookSheets: true }).SheetNames || [];
      const hoja = hojaConsolidado(nombres);
      if (!hoja) throw new Error("No encontré una hoja llamada CONSOLIDADO en el archivo.");
      // Solo se lee esa hoja: el libro trae cientos de hojas por lote que no hacen falta.
      const wb = XLSX.read(buf, { type: "array", sheets: hoja, cellFormula: false, cellStyles: false, cellHTML: false });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
      setLectura(leerNominaConsolidado(aoa));
      setNombreArchivo(file.name);
      const s = sugerirPeriodo(file.name);
      if (s.mes) setMes(s.mes);
      if (s.quincena) setQ(s.quincena);
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    }
    setLeyendo(false);
  }

  async function guardar() {
    if (!lectura || guardando) return;
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const quien = currentUser?.name || currentUser?.username || currentUser?.email || "";
      const cuando = new Date().toISOString();
      const docs = filas.map((p) => docNominaQuincena(p, { anio, mes, quincena: q, archivo: nombreArchivo, quien, cuando }));
      const ids = new Set(docs.map((d) => d.id));
      const previos = await getDocs(query(collection(db, COLECCION_NOMINA_QUINCENA), where("periodoId", "==", pid)));
      await Promise.all(docs.map((d) => setDoc(doc(db, COLECCION_NOMINA_QUINCENA, d.id), d.datos)));
      // Subir de nuevo la misma quincena la reemplaza: se borran las filas viejas que ya no vienen en el archivo.
      await Promise.all(previos.docs.filter((d) => !ids.has(d.id)).map((d) => deleteDoc(d.ref)));
      setMensaje(`✓ ${etiquetaQ} guardada: ${docs.length} personas${previos.size ? " (reemplazó lo que había)" : ""}.`);
      setLectura(null);
      setNombreArchivo("");
    } catch (e) {
      setError(`No se pudo guardar: ${e && e.message ? e.message : e}`);
    }
    setGuardando(false);
  }

  const t = lectura ? lectura.totales : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: K.canvas, borderRadius: 16, width: "100%", maxWidth: 1020, padding: "18px 20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: K.ink, flex: 1 }}>📤 Subir nómina de la quincena</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: K.slate }} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: K.slate, marginBottom: 14 }}>Sube el Excel de nómina tal cual (se lee la hoja CONSOLIDADO): de cada persona se guarda lo producido, la ayuda («AUXILIO») y lo pagado. «Por área» usa estos datos reales en las quincenas que no están liquidadas en ATLAS.</div>

        <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>1 · ¿De qué quincena es este archivo?</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><label style={etiqueta}>Año</label><select style={campo} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{[ahora.getFullYear() + 1, ahora.getFullYear(), ahora.getFullYear() - 1, ahora.getFullYear() - 2].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            <div><label style={etiqueta}>Mes</label><select style={campo} value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
            <div><label style={etiqueta}>Quincena</label><select style={campo} value={q} onChange={(e) => setQ(Number(e.target.value))}><option value={1}>Q1 · del 1 al 15</option><option value={2}>Q2 · del 16 al fin de mes</option></select></div>
          </div>
          <div style={{ fontSize: 12, color: K.slate, marginTop: 8 }}>El período lo eliges tú; el título que trae el Excel no se usa.</div>
          {yaGuardadas > 0 ? <div style={{ fontSize: 12.5, color: K.amber, background: K.amberBg, borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>⚠ {etiquetaQ} ya tiene {yaGuardadas} personas guardadas: al guardar de nuevo se reemplazan.</div> : null}
        </div>

        <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>2 · Archivo de nómina</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: K.panel, border: `1.5px dashed ${K.border}`, borderRadius: 12, padding: "10px 14px" }}>
            <input type="file" accept=".xlsx,.xlsm,.xls" disabled={leyendo || guardando} onChange={(e) => { leerArchivo(e.target.files && e.target.files[0]); e.target.value = ""; }} />
            {leyendo ? <span style={{ fontSize: 13, color: K.slate }}>Leyendo el archivo…</span> : null}
            {lectura ? <span style={chip(true)}>✓ {lectura.totales.personas} personas leídas · {nombreArchivo}</span> : null}
          </div>
        </div>

        {error ? <div style={{ background: K.redBg, border: `1px solid ${K.red}`, color: K.red, borderRadius: 10, padding: "9px 13px", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{error}</div> : null}
        {mensaje ? <div style={{ background: K.greenBg, border: `1px solid ${K.green}`, color: K.green, borderRadius: 10, padding: "9px 13px", fontSize: 13, fontWeight: 800, marginBottom: 12 }}>{mensaje}</div> : null}

        {lectura ? (
          <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>3 · Vista previa — {etiquetaQ}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", background: K.ink, borderRadius: 14, padding: "14px 20px", marginBottom: 12 }}>
              {[["Producido", millones(t.producido), "lo que hizo cada persona", "#fff"], ["Ayuda", dinero(t.ayuda), `columna «AUXILIO» · ${t.conAyuda} personas`, "#FFD27F"], ["Pagado", millones(t.pagado), "columna «TOTAL» del final", "#fff"], ["Personas", String(t.personas), `${t.destajo} destajo · ${t.personas - t.destajo} nómina fija`, "#fff"]].map(([e, v, s, c]) => (
                <div key={e} style={{ minWidth: 150 }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#B9B9D0", fontWeight: 800 }}>{e}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  <div style={{ fontSize: 11.5, color: "#B9B9D0" }}>{s}</div>
                </div>
              ))}
            </div>
            {lectura.avisos.map((a) => <div key={a} style={{ fontSize: 12.5, color: K.amber, background: K.amberBg, borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>⚠ {a}</div>)}
            {sinFicha > 0 ? (
              <div style={{ fontSize: 12.5, color: K.red, background: K.redBg, borderRadius: 8, padding: "6px 10px", marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span>{sinFicha} {sinFicha === 1 ? "persona no coincide" : "personas no coinciden"} con una ficha. Elige a quién corresponde; las que queden sin ficha se guardan pero no cuentan en «Por área» hasta que tengan una.</span>
                <label style={{ fontWeight: 800, cursor: "pointer" }}><input type="checkbox" checked={soloSinFicha} onChange={(e) => setSoloSinFicha(e.target.checked)} /> ver solo esas</label>
              </div>
            ) : <div style={{ fontSize: 12.5, color: K.green, marginBottom: 8, fontWeight: 700 }}>✓ Todas las personas se cruzaron con una ficha.</div>}
            <div style={{ overflow: "auto", maxHeight: 420, border: `1px solid ${K.border}`, borderRadius: 12 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 800 }}>
                <thead><tr><th style={{ ...th, textAlign: "left" }}>Persona</th><th style={th}>Tipo</th><th style={th}>Producido</th><th style={th}>Base salario</th><th style={th}>Ayuda</th><th style={th}>Pagado</th><th style={{ ...th, textAlign: "left" }}>Ficha en ATLAS</th></tr></thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.nombreNorm} style={{ background: !p.trabajadorId ? K.redBg : undefined }}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{p.nombre}</td>
                      <td style={td}>{p.tipoNomina}</td>
                      <td style={td}>{dinero(p.producido)}</td>
                      <td style={td}>{dinero(p.baseSalario)}</td>
                      <td style={{ ...td, background: p.ayuda > 0 ? "#FFF4D6" : undefined, fontWeight: p.ayuda > 0 ? 800 : 500 }}>{p.ayuda > 0 ? dinero(p.ayuda) : "—"}</td>
                      <td style={td}>{dinero(p.pagado)}</td>
                      <td style={{ ...td, textAlign: "left" }}>
                        {p.trabajadorId ? (
                          <span title={p.cruce === "exacto" ? "Mismo nombre" : p.cruce === "manual" ? "Elegida a mano" : "Nombre parecido: revísalo"}>
                            <span style={chip(true)}>✓ {p.area || "sin área"}</span>{p.cruce === "palabras" || p.cruce === "parcial" ? <span style={{ fontSize: 11.5, color: K.slate }}> · {p.trabajadorNombre}</span> : null}
                          </span>
                        ) : (
                          <select style={{ ...campo, padding: "4px 8px", fontSize: 12, minWidth: 190 }} value="" onChange={(e) => setAsignaciones({ ...asignaciones, [p.nombreNorm]: e.target.value })}>
                            <option value="">Elegir ficha…</option>
                            {listaTrab.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.area ? ` · ${x.area}` : ""}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lectura.ignoradas.length ? <div style={{ fontSize: 12, color: K.slate, marginTop: 8 }}>Se ignoran {lectura.ignoradas.length} filas que no son personas: {lectura.ignoradas.join(", ")}.</div> : null}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
              <button type="button" disabled={guardando} onClick={guardar} style={{ background: K.ink, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 14, cursor: guardando ? "default" : "pointer", opacity: guardando ? 0.6 : 1, fontFamily: "inherit" }}>{guardando ? "Guardando…" : `Guardar ${etiquetaQ}`}</button>
              <button type="button" onClick={() => { setLectura(null); setNombreArchivo(""); }} style={{ background: K.white, color: K.ink, border: `1.5px solid ${K.border}`, borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
            </div>
          </div>
        ) : null}

        <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Quincenas ya subidas · {anio}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(66px, 1fr))", gap: 6 }}>
            {MESES.map((m, i) => (
              <div key={m} style={{ border: `1px solid ${K.border}`, borderRadius: 10, padding: 6, textAlign: "center", background: K.white }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: K.slate, textTransform: "uppercase", marginBottom: 4 }}>{m.slice(0, 3)}</div>
                {[1, 2].map((qq) => {
                  const n = subidas.get(periodoIdDe(anio, i + 1, qq)) || 0;
                  const sel = i + 1 === mes && qq === q;
                  return <div key={qq} title={n ? `${n} personas guardadas` : "sin subir"} style={{ height: 22, borderRadius: 6, marginBottom: 4, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", background: n ? K.green : K.track, color: n ? "#fff" : "#9a928a", border: sel ? `2px solid ${K.blue}` : "2px solid transparent" }}>Q{qq}</div>;
                })}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: K.slate, marginTop: 6 }}>Verde = quincena subida · gris = falta · borde azul = la que estás subiendo.</div>
        </div>
      </div>
    </div>
  );
}
