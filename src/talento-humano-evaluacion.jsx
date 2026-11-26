// Evaluación del desempeño (TH-FO-04) en ATLAS: formulario del jefe, impresión para la firma y pestaña «Evaluaciones» (hoja de tabulación).
// La firma sigue siendo en papel: ATLAS guarda la calificación y se puede imprimir el formato para firmarlo.
import React, { useState, useMemo } from "react";
import { FACTORES_TRABAJO, FACTORES_PERSONAL, FACTORES_SST, OPCIONES_SST, nivelNota, calcularEvaluacion, semaforoEvaluacion, tabulacionEvaluaciones, evaluacionesDe, areasDe, fechaCorta } from "./talento-humano-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6", green: "#2D9E6B", greenBg: "#EBF7F2",
};
const campo = { height: 34, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white, color: C.ink, boxSizing: "border-box", fontFamily: "inherit" };
const boton = (primario) => ({ height: 32, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: primario ? "none" : `1px solid ${C.border}`, background: primario ? C.ink : C.white, color: primario ? C.white : C.ink });
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: `1px solid ${C.border}` };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" };
const tarjeta = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 };

const TONO = { rojo: { fg: C.red, bg: C.redBg, t: "Por mejorar" }, ambar: { fg: C.amber, bg: C.amberBg, t: "Aceptable" }, verde: { fg: C.green, bg: C.greenBg, t: "Satisfactorio" }, "": { fg: C.slate, bg: "#EEEEF3", t: "—" } };
const fmtNum = (n) => (n === null || n === undefined ? "—" : String(n).replace(".", ","));

function Pastilla({ prom, tipo, conTexto }) {
  const s = semaforoEvaluacion(prom, tipo);
  const k = TONO[s];
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: k.bg, color: k.fg, whiteSpace: "nowrap" }}>{fmtNum(prom)}{conTexto && s ? ` · ${k.t}` : ""}</span>;
}

const hoyLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// ───────── Formulario ─────────
function FilaFactor({ factor, valor, onCambia, opciones }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{factor.nombre}</div>
      <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 6px" }}>{factor.desc}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} role="radiogroup" aria-label={factor.nombre}>
        {opciones.map((o) => {
          const on = valor === o.v;
          return (
            <button key={o.v} type="button" role="radio" aria-checked={on} onClick={() => onCambia(o.v)} title={o.t || nivelNota(o.v)}
              style={{ minWidth: o.t ? 0 : 34, padding: o.t ? "0 12px" : 0, height: 32, borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? C.ink : C.border}`, background: on ? C.ink : C.white, color: on ? C.white : C.ink }}>
              {o.t ? `${o.t}${o.v > 0 ? ` (${o.v})` : ""}` : o.v}
            </button>
          );
        })}
        {valor !== undefined && valor !== null && <span style={{ fontSize: 12, color: C.slate, marginLeft: 6 }}>{opciones[0].t ? (opciones.find((x) => x.v === valor) || {}).t : nivelNota(valor)}</span>}
      </div>
    </div>
  );
}
const NOTAS = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));

export function FormularioEvaluacion({ trabajador: t, evaluacion, evaluadorInicial, guardando, error, onGuardar, onCancelar, onImprimir }) {
  const ini = evaluacion || {};
  const [fecha, setFecha] = useState(ini.fecha || hoyLocal());
  const [periodo, setPeriodo] = useState(ini.periodo || "Período de prueba");
  const [evaluador, setEvaluador] = useState(ini.evaluador || evaluadorInicial || "");
  const [cargoEvaluador, setCargoEvaluador] = useState(ini.cargoEvaluador || "");
  const [trabajo, setTrabajo] = useState(ini.trabajo || {});
  const [personal, setPersonal] = useState(ini.personal || {});
  const [sst, setSst] = useState(ini.sst || {});
  const [obsTrabajo, setObsTrabajo] = useState(ini.obsTrabajo || "");
  const [obsPersonal, setObsPersonal] = useState(ini.obsPersonal || "");
  const [obsSst, setObsSst] = useState(ini.obsSst || "");
  const datos = { fecha, periodo, evaluador, cargoEvaluador, trabajo, personal, sst, obsTrabajo, obsPersonal, obsSst };
  const calc = calcularEvaluacion(datos);
  const falta = calc.total - calc.respondidos;
  const puedeGuardar = calc.completa && fecha && evaluador.trim() && !guardando;
  return (
    <div style={{ ...tarjeta, minWidth: 0, maxWidth: 940 }} data-testid="form-evaluacion">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>TH-FO-04 · EVALUACIÓN DEL DESEMPEÑO</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{t.nombre}</div>
          <div style={{ fontSize: 13, color: C.slate }}>{t.zona || "Sin cargo"} · {t.area || "Sin asignar"}{t.cedula ? ` · C.C. ${t.cedula}` : ""}</div>
        </div>
        <button style={boton(false)} onClick={onCancelar}>← Volver sin guardar</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>Fecha<input type="date" style={{ ...campo, width: "100%", display: "block", marginTop: 3 }} value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha de la evaluación" /></label>
        <label style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>Período de evaluación<input style={{ ...campo, width: "100%", display: "block", marginTop: 3 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período de evaluación" /></label>
        <label style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>Nombre del evaluador<input style={{ ...campo, width: "100%", display: "block", marginTop: 3 }} value={evaluador} onChange={(e) => setEvaluador(e.target.value)} aria-label="Nombre del evaluador" /></label>
        <label style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>Cargo del evaluador<input style={{ ...campo, width: "100%", display: "block", marginTop: 3 }} value={cargoEvaluador} onChange={(e) => setCargoEvaluador(e.target.value)} aria-label="Cargo del evaluador" /></label>
      </div>

      <h3 style={{ fontSize: 14, margin: "16px 0 0" }}>Aspectos de trabajo <span style={{ fontWeight: 400, color: C.slate, fontSize: 12 }}>· de 1 (insatisfactorio) a 10 (excelente)</span></h3>
      {FACTORES_TRABAJO.map((f) => <FilaFactor key={f.id} factor={f} valor={trabajo[f.id]} opciones={NOTAS} onCambia={(v) => setTrabajo((x) => ({ ...x, [f.id]: v }))} />)}
      <textarea style={{ ...campo, width: "100%", height: 54, padding: 8, marginTop: 8 }} placeholder="Observaciones de los aspectos de trabajo (opcional)" value={obsTrabajo} onChange={(e) => setObsTrabajo(e.target.value)} aria-label="Observaciones de aspectos de trabajo" />

      <h3 style={{ fontSize: 14, margin: "18px 0 0" }}>Aspectos personales <span style={{ fontWeight: 400, color: C.slate, fontSize: 12 }}>· de 1 a 10</span></h3>
      {FACTORES_PERSONAL.map((f) => <FilaFactor key={f.id} factor={f} valor={personal[f.id]} opciones={NOTAS} onCambia={(v) => setPersonal((x) => ({ ...x, [f.id]: v }))} />)}
      <textarea style={{ ...campo, width: "100%", height: 54, padding: 8, marginTop: 8 }} placeholder="Observaciones de los aspectos personales (opcional)" value={obsPersonal} onChange={(e) => setObsPersonal(e.target.value)} aria-label="Observaciones de aspectos personales" />

      <h3 style={{ fontSize: 14, margin: "18px 0 0" }}>Seguridad y Salud en el Trabajo (SG-SST) <span style={{ fontWeight: 400, color: C.slate, fontSize: 12 }}>· 1 insatisfactorio, 3 aceptable, 5 excelente, 0 no aplica</span></h3>
      {FACTORES_SST.map((f) => <FilaFactor key={f.id} factor={f} valor={sst[f.id]} opciones={OPCIONES_SST} onCambia={(v) => setSst((x) => ({ ...x, [f.id]: v }))} />)}
      <textarea style={{ ...campo, width: "100%", height: 54, padding: 8, marginTop: 8 }} placeholder="Observaciones de SST (opcional)" value={obsSst} onChange={(e) => setObsSst(e.target.value)} aria-label="Observaciones de SST" />

      <div style={{ position: "sticky", bottom: 0, background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginTop: 16, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: C.slate }}>Trabajo <b style={{ color: C.ink }}>{fmtNum(calc.promTrabajo)}</b></div>
        <div style={{ fontSize: 12, color: C.slate }}>Personales <b style={{ color: C.ink }}>{fmtNum(calc.promPersonal)}</b></div>
        <div style={{ fontSize: 12, color: C.slate }}>Calificación final <Pastilla prom={calc.promGeneral} conTexto /></div>
        <div style={{ fontSize: 12, color: C.slate }}>SST <Pastilla prom={calc.promSst} tipo="sst" conTexto /></div>
        <div style={{ flex: 1 }} />
        {falta > 0 && <span style={{ fontSize: 12, color: C.amber }}>Faltan {falta} {falta === 1 ? "factor" : "factores"} por calificar</span>}
        {falta === 0 && !evaluador.trim() && <span style={{ fontSize: 12, color: C.amber }}>Escribe el nombre del evaluador</span>}
        <button style={boton(false)} onClick={() => onImprimir(datos)}>Imprimir para firma</button>
        <button style={{ ...boton(true), opacity: puedeGuardar ? 1 : 0.5 }} disabled={!puedeGuardar} onClick={() => onGuardar(datos)}>{guardando ? "Guardando…" : evaluacion ? "Guardar cambios" : "Guardar evaluación"}</button>
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 13, color: C.red }}>{error}</div>}
    </div>
  );
}

// ───────── Pestaña «Evaluaciones» (hoja de tabulación) ─────────
function BarraFactor({ prom, tipo }) {
  const max = tipo === "sst" ? 5 : 10;
  const k = TONO[semaforoEvaluacion(prom, tipo)];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
      <div style={{ flex: 1, height: 8, background: "#EEEEF3", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${prom ? Math.min(100, (prom / max) * 100) : 0}%`, height: "100%", background: k.fg }} /></div>
      <span style={{ fontSize: 12, fontWeight: 700, color: k.fg, width: 36, textAlign: "right" }}>{fmtNum(prom)}</span>
    </div>
  );
}

export function PestanaEvaluaciones({ trabajadores, evaluaciones, onAbrir }) {
  const [area, setArea] = useState("");
  const areas = useMemo(() => areasDe(trabajadores), [trabajadores]);
  const lista = useMemo(() => evaluacionesDe((trabajadores || []).filter((t) => !area || (t.area || "Sin asignar") === area), evaluaciones), [trabajadores, evaluaciones, area]);
  const tab = useMemo(() => tabulacionEvaluaciones(lista.map((x) => x.ev)), [lista]);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {areas.length > 1 && (
          <select style={campo} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filtrar evaluaciones por área">
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <span style={{ fontSize: 13, color: C.slate }}>{lista.length} {lista.length === 1 ? "persona evaluada" : "personas evaluadas"}</span>
      </div>
      {lista.length === 0 ? (
        <div style={{ ...tarjeta, color: C.slate, fontSize: 13 }}>Todavía no hay evaluaciones{area ? ` en ${area}` : ""}. Se hacen desde el expediente de cada trabajador, con el botón «Evaluar» del formato TH-FO-04.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            <div style={{ ...tarjeta, padding: "12px 14px" }}><div style={{ fontSize: 12, color: C.slate }}>Promedio general</div><div style={{ marginTop: 6 }}><Pastilla prom={tab.promGeneral} conTexto /></div></div>
            <div style={{ ...tarjeta, padding: "12px 14px" }}><div style={{ fontSize: 12, color: C.slate }}>Aspectos de trabajo</div><div style={{ marginTop: 6 }}><Pastilla prom={tab.promTrabajo} /></div></div>
            <div style={{ ...tarjeta, padding: "12px 14px" }}><div style={{ fontSize: 12, color: C.slate }}>Aspectos personales</div><div style={{ marginTop: 6 }}><Pastilla prom={tab.promPersonal} /></div></div>
            <div style={{ ...tarjeta, padding: "12px 14px" }}><div style={{ fontSize: 12, color: C.slate }}>SST (sobre 5)</div><div style={{ marginTop: 6 }}><Pastilla prom={tab.promSst} tipo="sst" conTexto /></div></div>
          </div>
          <div style={tarjeta}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Promedio por factor</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Factor</th><th style={th}>Evaluados</th><th style={th}>Promedio</th></tr></thead>
                <tbody>
                  {[["Aspectos de trabajo", tab.trabajo, ""], ["Aspectos personales", tab.personal, ""], ["Seguridad y Salud en el Trabajo (sobre 5)", tab.sst, "sst"]].map(([titulo, filas, tipo]) => (
                    <React.Fragment key={titulo}>
                      <tr><td colSpan={3} style={{ ...td, fontWeight: 800, background: C.canvas, fontSize: 12 }}>{titulo}</td></tr>
                      {filas.map((f) => <tr key={f.id}><td style={td}>{f.nombre}</td><td style={td}>{f.n}</td><td style={td}><BarraFactor prom={f.prom} tipo={tipo} /></td></tr>)}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={tarjeta}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Evaluados</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Trabajador</th><th style={th}>Área</th><th style={th}>Fecha</th><th style={th}>Final</th><th style={th}>SST</th><th style={th} /></tr></thead>
                <tbody>
                  {lista.map(({ t, ev, calc }) => (
                    <tr key={t.id}>
                      <td style={td}>{t.nombre}{ev.evaluador && <div style={{ fontSize: 11, color: C.slate }}>Evaluó: {ev.evaluador}</div>}</td>
                      <td style={td}>{t.area || "Sin asignar"}</td>
                      <td style={td}>{fechaCorta(ev.fecha)}</td>
                      <td style={td}><Pastilla prom={calc.promGeneral} /></td>
                      <td style={td}><Pastilla prom={calc.promSst} tipo="sst" /></td>
                      <td style={{ ...td, textAlign: "right" }}><button style={{ ...boton(false), height: 28, fontSize: 12 }} onClick={() => onAbrir(t.id)}>Ver / editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ───────── Impresión para la firma ─────────
const esc = (s) => String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function htmlEvaluacion(t, ev) {
  const e = ev || {};
  const calc = calcularEvaluacion(e);
  const tabla = (titulo, factores, valores, escala) => {
    const cab = escala.map((n) => `<th class="n">${esc(n.t || n.v)}</th>`).join("");
    const filas = factores.map((f) => `<tr><td><b>${esc(f.nombre)}</b>: ${esc(f.desc)}</td>${escala.map((n) => `<td class="n">${valores && valores[f.id] === n.v ? "X" : ""}</td>`).join("")}</tr>`).join("");
    return `<h3>${esc(titulo)}</h3><table><tr><th>Factor</th>${cab}</tr>${filas}</table>`;
  };
  const sstEscala = [{ v: 1, t: "1 Insatisf." }, { v: 3, t: "3 Aceptable" }, { v: 5, t: "5 Excelente" }, { v: 0, t: "0 No aplica" }];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>TH-FO-04 ${esc(t && t.nombre)}</title><style>
body{font:11px Arial,sans-serif;margin:14mm;color:#111}h2{margin:0}h3{margin:14px 0 4px;font-size:12px}table{width:100%;border-collapse:collapse;margin-bottom:4px}
td,th{border:1px solid #444;padding:3px 5px;vertical-align:top}th{background:#eee;text-align:left}.n{text-align:center;width:34px}.cab td{border:1px solid #444}.firmas{display:flex;gap:24px;margin-top:46px}.firmas div{flex:1;border-top:1px solid #111;padding-top:3px;text-align:center;font-size:10px}
</style></head><body>
<table class="cab"><tr><td><b>GESTIÓN DE TALENTO HUMANO</b><br><h2>EVALUACIÓN DEL DESEMPEÑO</h2></td><td style="width:120px">Código: TH-FO-04<br>Versión: 1</td></tr></table>
<table><tr><td>Fecha: <b>${esc(e.fecha)}</b></td><td>Período de evaluación: <b>${esc(e.periodo)}</b></td></tr>
<tr><td>Nombre del empleado: <b>${esc(t && t.nombre)}</b></td><td>Cargo: <b>${esc(t && t.zona)}</b> · Área: <b>${esc(t && t.area)}</b>${t && t.cedula ? ` · C.C. ${esc(t.cedula)}` : ""}</td></tr>
<tr><td>Nombre del evaluador: <b>${esc(e.evaluador)}</b></td><td>Cargo del evaluador: <b>${esc(e.cargoEvaluador)}</b></td></tr></table>
${tabla("Aspectos de trabajo (1 a 10)", FACTORES_TRABAJO, e.trabajo, Array.from({ length: 10 }, (_, i) => ({ v: i + 1 })))}
<div>Observaciones: ${esc(e.obsTrabajo)}</div>
${tabla("Aspectos personales (1 a 10)", FACTORES_PERSONAL, e.personal, Array.from({ length: 10 }, (_, i) => ({ v: i + 1 })))}
<div>Observaciones: ${esc(e.obsPersonal)}</div>
<h3>Calificación final (puntaje total / ítems evaluados): ${esc(fmtNum(calc.promGeneral))}</h3>
${tabla("Aspectos de Seguridad y Salud en el Trabajo", FACTORES_SST, e.sst, sstEscala)}
<div>Observaciones: ${esc(e.obsSst)}</div>
<h3>Calificación final SST: ${esc(fmtNum(calc.promSst))}</h3>
<div class="firmas"><div>FIRMA EVALUADO</div><div>FIRMA LÍDER O JEFE INMEDIATO</div><div>FIRMA EVALUADOR SST</div><div>FIRMA LÍDER DE TALENTO HUMANO</div></div>
</body></html>`;
}

// Abre el formato en otra ventana y lo manda a imprimir. Devuelve false si el navegador bloqueó la ventana.
export function imprimirEvaluacion(t, ev) {
  const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (!w) return false;
  w.document.write(htmlEvaluacion(t, ev));
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* el usuario puede imprimir desde la ventana */ } }, 300);
  return true;
}
