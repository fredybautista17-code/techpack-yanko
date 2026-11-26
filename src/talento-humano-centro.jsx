// ─── CENTRO DE TALENTO HUMANO: Tablero de alertas + Expediente por trabajador ─────────────────────────────────────────────────
// (2026-11-26, a pedido de Fredy) Pantalla de Nómina → Personal → «Centro de Talento Humano». La ven solo el administrador y quien tenga el
// interruptor «Centro de Talento Humano» (Administración → Usuarios): lleva datos personales y de salud (Ley 1581 de 2012).
// Los formatos se siguen firmando en papel: aquí se registra que están y se guarda la foto del firmado. Cálculo en talento-humano-calculo.js.
import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { hoyBogotaISO, resumenTablero, avancePorArea, mapaExpedientes, esActivo, formatosDe, porcentajeExpediente, pasoDe, PASOS_TH, fechaCorta, sugerirFinPrueba, aplicaDotacion, esTerminoFijo, diasEntre } from "./talento-humano-calculo";

const COL = "nomina_th_expedientes"; // prefijo nomina_: las reglas de Firestore ya la bloquean al rol Cliente
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6", green: "#2D9E6B", greenBg: "#EBF7F2",
};
const campo = { height: 34, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white, color: C.ink, boxSizing: "border-box", fontFamily: "inherit" };
const boton = (primario) => ({ height: 30, padding: "0 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: primario ? "none" : `1px solid ${C.border}`, background: primario ? C.ink : C.white, color: primario ? C.white : C.ink });
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: `1px solid ${C.border}` };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
const tarjeta = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 };

const colorPct = (p) => (p >= 90 ? C.green : p >= 70 ? C.amber : C.red);
function Pastilla({ bg, fg, children }) {
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>;
}
const pastillaPlazo = (d) => (d < 0 ? <Pastilla bg={C.redBg} fg={C.red}>Venció hace {-d} {-d === 1 ? "día" : "días"}</Pastilla> : d <= 7 ? <Pastilla bg={C.redBg} fg={C.red}>{d === 0 ? "Hoy" : `En ${d} ${d === 1 ? "día" : "días"}`}</Pastilla> : d <= 21 ? <Pastilla bg={C.amberBg} fg={C.amber}>En {d} días</Pastilla> : <Pastilla bg={C.blueBg} fg={C.blue}>En {d} días</Pastilla>);
const PASTILLA_ESTADO = {
  ok: <Pastilla bg={C.greenBg} fg={C.green}>Firmado</Pastilla>,
  pend: <Pastilla bg={C.redBg} fg={C.red}>Pendiente</Pastilla>,
  venc: <Pastilla bg={C.amberBg} fg={C.amber}>Desactualizado</Pastilla>,
  na: <Pastilla bg="#EEEEF3" fg={C.slate}>No aplica</Pastilla>,
};

function useExpedientes(db) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return undefined;
    return onSnapshot(collection(db, COL), (s) => { setError(""); setLista(s.docs.map((x) => ({ ...x.data(), id: x.id, trabajadorId: x.data().trabajadorId || x.id }))); }, (e) => { setError(e?.message || "No se pudieron leer los expedientes."); setLista([]); });
  }, [db]);
  return { lista, error };
}

function Indicador({ n, texto, tono }) {
  const color = tono === "rojo" && n > 0 ? C.red : tono === "ambar" && n > 0 ? C.amber : C.ink;
  return (
    <div style={{ ...tarjeta, padding: "12px 14px" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>{texto}</div>
    </div>
  );
}

function Tablero({ trabajadores, expedientes, candidatos, hoy, onAbrir }) {
  const r = useMemo(() => resumenTablero(trabajadores, expedientes, candidatos, hoy), [trabajadores, expedientes, candidatos, hoy]);
  const areas = useMemo(() => avancePorArea(trabajadores, expedientes), [trabajadores, expedientes]);
  const sinFechas = useMemo(() => {
    const m = mapaExpedientes(expedientes);
    return (trabajadores || []).filter(esActivo).filter((t) => esTerminoFijo(t, m[t.id]) && !(m[t.id] && m[t.id].fechaFinContrato)).length;
  }, [trabajadores, expedientes]);
  const d = r.dotacion;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
        <Indicador n={r.urgentes} texto="Vencen en 14 días o menos" tono="rojo" />
        <Indicador n={d.faltan} texto={`Dotaciones sin registrar (entrega legal en ${d.dias} días)`} tono="ambar" />
        <Indicador n={r.conPendientes} texto="Trabajadores con formatos pendientes" tono="ambar" />
        <Indicador n={r.sinInduccion} texto="Inducciones sin completar" />
        <Indicador n={r.candidatos} texto="Candidatos en Ingreso de Personal" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ ...tarjeta, gridColumn: "span 2", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Para actuar primero</div>
          <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Períodos de prueba y contratos a término fijo, del que se acaba antes al que se acaba después. En contratos fijos el plazo que cuenta es el último día para dar el preaviso legal de 30 días.</div>
          {r.alertas.length === 0 ? (
            <div style={{ padding: "14px 0", fontSize: 13, color: C.slate }}>
              Nada por vencer en las fechas registradas.
              {sinFechas > 0 && <> Hay <b>{sinFechas}</b> trabajadores a término fijo sin fecha de fin de contrato: ábrelos en «Expediente» y escríbela para que el tablero los vigile.</>}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Trabajador</th><th style={th}>Qué vence</th><th style={th}>Plazo</th><th style={th}>Qué hacer</th><th style={th} /></tr></thead>
                <tbody>
                  {r.alertas.map((a) => (
                    <tr key={a.t.id + a.tipo}>
                      <td style={td}><b>{a.t.nombre}</b><div style={{ fontSize: 12, color: C.slate }}>{a.t.area || "Sin asignar"}{a.t.zona ? ` · ${a.t.zona}` : ""}</div></td>
                      <td style={td}>{a.titulo}<div style={{ fontSize: 12, color: C.slate }}>{fechaCorta(a.fecha)}</div></td>
                      <td style={td}>{pastillaPlazo(a.d)}</td>
                      <td style={td}>{a.accion}</td>
                      <td style={td}><button style={boton(false)} onClick={() => onAbrir(a.t.id)}>Abrir expediente</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.alertas.length > 0 && sinFechas > 0 && <div style={{ marginTop: 10, fontSize: 12, color: C.amber }}>Hay {sinFechas} trabajadores a término fijo sin fecha de fin de contrato: el tablero no los puede vigilar hasta que la escribas en su expediente.</div>}
        </div>
        <div style={tarjeta}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Dotación de ley</div>
          <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Próxima entrega: {fechaCorta(d.fecha)}. Aplica a quien gana hasta 2 SMMLV. Fechas: 30 abr · 31 ago · 20 dic.</div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{d.dias}<span style={{ fontSize: 14, fontWeight: 600, color: C.slate }}> días</span></div>
          <div style={{ height: 8, background: "#EEEEF3", borderRadius: 4, overflow: "hidden", margin: "10px 0 6px" }}><div style={{ width: `${d.elegibles ? Math.round((100 * d.listos) / d.elegibles) : 0}%`, height: "100%", background: C.blue }} /></div>
          <div style={{ fontSize: 12, color: C.slate }}>{d.listos} de {d.elegibles} trabajadores con la entrega registrada (TH-FO-02).</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>Ojo: el registro de dotación es uno solo por trabajador. Después de cada entrega legal, marca de nuevo «Pendiente» el formato para llevar la siguiente.</div>
        </div>
      </div>
      <div style={tarjeta}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Expediente completo por área</div>
        <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Formatos firmados sobre los que aplican a cada trabajador activo ({r.activos}).</div>
        {areas.map((a) => (
          <div key={a.area} style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px", gap: 10, alignItems: "center", fontSize: 12, padding: "4px 0" }}>
            <span>{a.area} <span style={{ color: C.slate }}>({a.n})</span></span>
            <div style={{ height: 8, background: "#EEEEF3", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${a.pct}%`, height: "100%", background: colorPct(a.pct) }} /></div>
            <b style={{ textAlign: "right" }}>{a.pct} %</b>
          </div>
        ))}
        {areas.length === 0 && <div style={{ fontSize: 13, color: C.slate }}>No hay trabajadores activos.</div>}
      </div>
    </div>
  );
}

function Expediente({ trabajador: t, exp, hoy, onFecha, onFormato, onSubir, subiendo }) {
  const fmts = formatosDe(t, exp);
  const pct = porcentajeExpediente(t, exp);
  const paso = pasoDe(t, exp);
  const inputFoto = useRef(null);
  const [codigoFoto, setCodigoFoto] = useState("");
  const fin = exp && exp.fechaFinPrueba;
  return (
    <div style={{ ...tarjeta, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{t.nombre}</div>
          <div style={{ fontSize: 13, color: C.slate }}>{t.zona || "Sin cargo"} · {t.area || "Sin asignar"}{t.cedula ? ` · C.C. ${t.cedula}` : ""}</div>
        </div>
        <Pastilla bg={pct >= 90 ? C.greenBg : pct >= 70 ? C.amberBg : C.redBg} fg={colorPct(pct)}>{pct} % del expediente</Pastilla>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 14 }}>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Ingreso</div><div style={{ fontWeight: 600 }}>{fechaCorta(t.fechaIngreso)}</div></div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Contrato (de Nómina)</div><div style={{ fontWeight: 600 }}>{t.tipoContrato || "Sin clasificar"}</div></div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Fin del período de prueba</div>
          <input type="date" style={{ ...campo, height: 30, width: "100%" }} value={(exp && exp.fechaFinPrueba) || ""} onChange={(e) => onFecha(t, "fechaFinPrueba", e.target.value)} aria-label="Fin del período de prueba" />
          {!fin && sugerirFinPrueba(t) && <button style={{ ...boton(false), height: 24, marginTop: 4, fontSize: 11 }} onClick={() => onFecha(t, "fechaFinPrueba", sugerirFinPrueba(t))}>Sugerir: 2 meses desde el ingreso</button>}
        </div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase" }}>Vence el contrato (término fijo)</div>
          <input type="date" style={{ ...campo, height: 30, width: "100%" }} value={(exp && exp.fechaFinContrato) || ""} onChange={(e) => onFecha(t, "fechaFinContrato", e.target.value)} aria-label="Fecha en que vence el contrato" />
          {exp && exp.fechaFinContrato && <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>Faltan {diasEntre(hoy, exp.fechaFinContrato)} días</div>}
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.slate, marginBottom: 12 }}>
        <input type="checkbox" checked={aplicaDotacion(t, exp)} onChange={(e) => onFecha(t, "dotacion", e.target.checked ? true : false)} />
        Le corresponde la dotación de ley (gana hasta 2 SMMLV){Number(t.sueldo) > 0 ? "" : " — sin sueldo en la ficha: se asume que sí"}
      </label>
      <div style={{ display: "flex", gap: 4, marginBottom: 4, overflowX: "auto" }} aria-label="Pasos del procedimiento">
        {PASOS_TH.map((nombre, i) => <div key={nombre} title={nombre} style={{ flex: 1, minWidth: 28, height: 6, borderRadius: 3, background: i + 1 < paso ? C.green : i + 1 === paso ? C.amber : "#EEEEF3" }} />)}
      </div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>Paso {paso} de 10 del procedimiento TH-PR-01: {PASOS_TH[paso - 1]}</div>
      <input ref={inputFoto} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f && codigoFoto) onSubir(t, codigoFoto, f); }} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Código</th><th style={th}>Formato</th><th style={th}>Estado</th><th style={th} /></tr></thead>
          <tbody>
            {fmts.map((f) => {
              const manualNa = f.dato.estado === "na";
              return (
                <tr key={f.codigo}>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: C.slate, whiteSpace: "nowrap" }}>{f.codigo === "ANTEC" ? "—" : f.codigo}</td>
                  <td style={td}>{f.nombre}{f.sensible && <span style={{ marginLeft: 6, fontSize: 11, color: C.slate }}>· sensible</span>}
                    {f.estado === "ok" && f.dato.en && <div style={{ fontSize: 11, color: C.slate }}>Registrado el {fechaCorta(f.dato.en)}{f.dato.por ? ` por ${f.dato.por}` : ""}</div>}
                  </td>
                  <td style={td}>{PASTILLA_ESTADO[f.estado]}</td>
                  <td style={{ ...td, textAlign: "right", minWidth: 300 }}>
                    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {(f.estado === "pend" || f.estado === "venc") && <>
                        <button style={boton(true)} disabled={!!subiendo} onClick={() => { setCodigoFoto(f.codigo); setTimeout(() => inputFoto.current && inputFoto.current.click(), 0); }}>{subiendo === f.codigo ? "Subiendo…" : "Subir foto"}</button>
                        <button style={boton(false)} onClick={() => onFormato(t, f.codigo, { estado: "ok" })}>Firmado sin foto</button>
                        <button style={boton(false)} onClick={() => onFormato(t, f.codigo, { estado: "na" })}>No aplica</button>
                      </>}
                      {f.estado === "ok" && <>
                        {f.dato.url ? <a href={f.dato.url} target="_blank" rel="noopener noreferrer" style={{ ...boton(false), display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Ver foto</a> : <span style={{ fontSize: 11, color: C.slate, alignSelf: "center" }}>sin foto</span>}
                        <button style={boton(false)} onClick={() => onFormato(t, f.codigo, { estado: "venc" })}>Desactualizado</button>
                        <button style={boton(false)} onClick={() => onFormato(t, f.codigo, { estado: "pend", url: "", nombre: "" })}>Deshacer</button>
                      </>}
                      {f.estado === "na" && manualNa && <button style={boton(false)} onClick={() => onFormato(t, f.codigo, { estado: "pend" })}>Volver a aplicar</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CentroTalentoHumano({ db, storage, trabajadores, candidatos, currentUser }) {
  const { lista, error } = useExpedientes(db);
  const hoy = hoyBogotaISO();
  const [vista, setVista] = useState("tablero");
  const [sel, setSel] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [aviso, setAviso] = useState("");
  const [subiendo, setSubiendo] = useState("");
  const exps = useMemo(() => mapaExpedientes(lista || []), [lista]);
  const activos = useMemo(() => (trabajadores || []).filter(esActivo).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))), [trabajadores]);
  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? activos.filter((t) => `${t.nombre} ${t.area} ${t.zona} ${t.cedula || ""}`.toLowerCase().includes(q)) : activos;
  }, [activos, filtro]);
  const actual = activos.find((t) => t.id === sel) || visibles[0] || null;
  const quien = (currentUser && (currentUser.name || currentUser.username)) || "";

  async function guardar(t, parche) {
    setAviso("");
    try { await setDoc(doc(db, COL, t.id), { trabajadorId: t.id, ...parche }, { merge: true }); }
    catch (e) { console.error("No se pudo guardar el expediente:", e); setAviso("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo."); }
  }
  const onFecha = (t, campoNombre, valor) => guardar(t, { [campoNombre]: valor });
  const onFormato = (t, codigo, parche) => guardar(t, { formatos: { [codigo]: { fecha: hoy, ...parche, por: quien, en: new Date().toISOString() } } });
  async function onSubir(t, codigo, archivo) {
    if (archivo.size > 8 * 1024 * 1024) { setAviso("El archivo pesa más de 8 MB. Toma la foto con menos resolución o súbela en PDF liviano."); return; }
    setSubiendo(codigo); setAviso("");
    try {
      const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(archivo); });
      const seguro = String(archivo.name).replace(/[^\w.\-]+/g, "_");
      const ref = storageRef(storage, `hojas_de_vida/th_${t.id}_${codigo}_${Date.now()}_${seguro}`);
      await uploadString(ref, dataUrl, "data_url");
      const url = await getDownloadURL(ref);
      await guardar(t, { formatos: { [codigo]: { estado: "ok", fecha: hoy, url, nombre: archivo.name, por: quien, en: new Date().toISOString() } } });
    } catch (e) { console.error("No se pudo subir la foto del formato:", e); setAviso("La foto no se pudo subir. Revisa tu conexión e inténtalo de nuevo."); }
    finally { setSubiendo(""); }
  }

  return (
    <div style={{ padding: 4 }} data-testid="centro-th">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.ink }}>🧭 Centro de Talento Humano</div>
          <div style={{ fontSize: 13, color: C.slate }}>Alertas, vencimientos y el expediente de cada trabajador. Lo ven solo Talento Humano y gerencia: lleva datos personales y de salud.</div>
        </div>
        <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", background: C.white }} role="tablist">
          {[["tablero", "Tablero"], ["expediente", "Expediente"]].map(([id, nombre]) => (
            <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)} style={{ border: "none", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: vista === id ? C.ink : C.white, color: vista === id ? C.white : C.slate }}>{nombre}</button>
          ))}
        </div>
      </div>
      {error && <div style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {aviso && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{aviso}</div>}
      {lista === null ? <div style={{ padding: 20, color: C.slate }}>Cargando…</div> : vista === "tablero" ? (
        <Tablero trabajadores={trabajadores} expedientes={lista} candidatos={candidatos} hoy={hoy} onAbrir={(id) => { setSel(id); setVista("expediente"); }} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,300px) 1fr", gap: 16, alignItems: "start" }}>
          <div style={tarjeta}>
            <input style={{ ...campo, width: "100%", marginBottom: 10 }} placeholder="Buscar por nombre, área, cargo o cédula" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Buscar trabajador" />
            <div style={{ maxHeight: 620, overflowY: "auto" }}>
              {visibles.map((t) => {
                const p = porcentajeExpediente(t, exps[t.id]);
                const on = actual && actual.id === t.id;
                return (
                  <button key={t.id} onClick={() => setSel(t.id)} aria-current={on} style={{ display: "block", width: "100%", textAlign: "left", border: `1px solid ${on ? C.blue : "transparent"}`, background: on ? C.blueBg : "transparent", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", color: C.ink }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 600, fontSize: 13 }}><span>{t.nombre}</span><span style={{ fontSize: 12, color: C.slate }}>{p} %</span></div>
                    <div style={{ fontSize: 12, color: C.slate }}>{t.area || "Sin asignar"}{t.zona ? ` · ${t.zona}` : ""}</div>
                    <div style={{ height: 5, background: "#EEEEF3", borderRadius: 3, overflow: "hidden", marginTop: 5 }}><div style={{ width: `${p}%`, height: "100%", background: colorPct(p) }} /></div>
                  </button>
                );
              })}
              {visibles.length === 0 && <div style={{ fontSize: 13, color: C.slate, padding: 8 }}>Sin resultados.</div>}
            </div>
          </div>
          {actual ? <Expediente key={actual.id} trabajador={actual} exp={exps[actual.id]} hoy={hoy} onFecha={onFecha} onFormato={onFormato} onSubir={onSubir} subiendo={subiendo} /> : <div style={{ ...tarjeta, color: C.slate }}>No hay trabajadores activos.</div>}
        </div>
      )}
    </div>
  );
}
