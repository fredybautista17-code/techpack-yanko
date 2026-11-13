// ─── DISEÑO: PROTOTIPOS APROBADOS SIN CÁPSULA («mi línea de trabajo») ────────────
// (2026-11-12, a pedido de Fredy) Para Diseño y la Dirección Creativa: los prototipos que ya se aprobaron pero a los que
// nadie les ha creado una cápsula (promotedTo vacío). Es lo que hay que diseñar/promover para alimentar el tubo productivo.
// Solo lectura: lee la colección «prototipos» en vivo, no escribe nada. Sale como tarjeta del «Mi Día» (catálogo: diseno_sin_capsula).
// (2026-11-13) Cronograma: a cada prototipo se le pone fecha objetivo y responsable (colección «diseno_cronograma», un documento por
// prototipo, no toca el prototipo); hay vista por semanas con vencidos y sin fecha. Sale de la lista solo al promoverlo (cápsula o tela).
// «Aprobado» = status "aprobado"; la fecha sale del cambio de estado en la Hoja de Vida del prototipo (si no está, fecha de la etapa o de creación).
import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const DIAS_ATENCION = 14;
const DIAS_URGENTE = 30;
const TEXTO_APROBADO = 'Estado → "Aprobado".';

const BOTON = { padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink };
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "left", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.canvas, position: "sticky", top: 0 };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, textAlign: "left", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", verticalAlign: "middle" };

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function lunesDe(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const x = new Date(y, m - 1, d);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}
function etiquetaSemana(lunes) {
  const fin = new Date(lunes); fin.setDate(fin.getDate() + 6);
  return `Semana del ${lunes.getDate()} ${MES[lunes.getMonth()]} al ${fin.getDate()} ${MES[fin.getMonth()]}`;
}
const fechaCorta = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const norm = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function diasDesde(iso) {
  if (!iso) return 0;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return 0;
  const hoy = new Date();
  return Math.max(0, Math.floor((Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - Date.UTC(y, m - 1, d)) / 86400000));
}
function fechaAprobacion(p) {
  const o = [...(p.observations || [])].reverse().find((ob) => ob && ob.type === "update" && ob.text === TEXTO_APROBADO);
  return String(o?.date || p.stageStartedAt || p.createdAt || "").slice(0, 10);
}
function semaforo(dias) {
  if (dias > DIAS_URGENTE) return { label: "Urgente", color: C.red, bg: C.redBg };
  if (dias > DIAS_ATENCION) return { label: "Atención", color: C.amber, bg: C.amberBg };
  return { label: "Reciente", color: C.green, bg: C.greenBg };
}

function Kpi({ icon, label, value, sub, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4, fontWeight: 700 }}>{label}</div>
      {sub ? <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
function Chip({ activo, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.ink }}>
      {children}
    </button>
  );
}

export function BloqueDisenoSinCapsula({ db, currentUser }) {
  const [protos, setProtos] = useState(null);
  const [error, setError] = useState("");
  const [cliente, setCliente] = useState("");
  const [soloMios, setSoloMios] = useState(false);
  const [agrupar, setAgrupar] = useState(false);
  const [crono, setCrono] = useState({});
  const [vista, setVista] = useState("lista");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "prototipos"),
      (snap) => setProtos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
      (e) => setError(e?.message || "No se pudo leer los prototipos.")
    );
    return () => unsub();
  }, [db]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "diseno_cronograma"),
      (snap) => { const m = {}; snap.docs.forEach((d) => { m[d.id] = d.data(); }); setCrono(m); },
      () => {}
    );
    return () => unsub();
  }, [db]);
  async function guardarCrono(p, cambio) {
    await setDoc(doc(db, "diseno_cronograma", p.id), { protoId: p.id, ...cambio, actualizadoPor: currentUser?.name || "", actualizadoEn: new Date().toISOString() }, { merge: true });
  }
  const pendientes = useMemo(() => {
    return (protos || [])
      .filter((p) => !p.eliminado && p.status === "aprobado" && !p.promotedTo)
      .map((p) => {
        const aprobado = fechaAprobacion(p);
        const dias = diasDesde(aprobado);
        const objetivo = crono[p.id]?.fechaObjetivo || "";
        const responsable = crono[p.id]?.responsable || p.assignedTo || "";
        return { ...p, aprobado, dias, sem: semaforo(dias), objetivo, responsable, vencido: !!objetivo && objetivo < isoLocal(new Date()), clienteTxt: p.cliente || p.colores?.[0] || "(Sin cliente)" };
      })
      .sort((a, b) => b.dias - a.dias);
  }, [protos, crono]);
  const nombresDisenadores = useMemo(() => [...new Set((protos || []).map((x) => x.assignedTo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [protos]);

  const miNombre = norm(currentUser?.name);
  const hayMios = !!miNombre && pendientes.some((p) => norm(p.responsable) === miNombre);
  const clientes = [...new Set(pendientes.map((p) => p.clienteTxt))].sort((a, b) => a.localeCompare(b, "es"));
  const filas = pendientes.filter((p) => (!cliente || p.clienteTxt === cliente) && (!soloMios || norm(p.responsable) === miNombre));

  const urgentes = filas.filter((p) => p.dias > DIAS_URGENTE).length;
  const atencion = filas.filter((p) => p.dias > DIAS_ATENCION && p.dias <= DIAS_URGENTE).length;
  const masViejo = filas[0];
  const vencidos = filas.filter((p) => p.vencido).length;
  const sinFecha = filas.filter((p) => !p.objetivo).length;
  const grupos = useMemo(() => {
    const m = new Map();
    filas.forEach((p) => m.set(p.clienteTxt, [...(m.get(p.clienteTxt) || []), p]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filas]);

  async function exportar() {
    const XLSX = await import("xlsx");
    const cab = ["Cliente", "Referencia", "Prototipo", "Categoría", "Línea", "Responsable", "Fecha objetivo", "Aprobado el", "Días sin hacer nada", "Prioridad"];
    const orden = [...filas].sort((a, b) => a.clienteTxt.localeCompare(b.clienteTxt, "es") || b.dias - a.dias);
    const ws = XLSX.utils.aoa_to_sheet([cab, ...orden.map((p) => [p.clienteTxt, p.reference || "", p.name || "", p.categoria || "", p.linea || "", p.responsable || "", p.objetivo ? fechaCorta(p.objetivo) : "", fechaCorta(p.aprobado), p.dias, p.sem.label])]);
    ws["!cols"] = [28, 14, 30, 16, 14, 22, 14, 12, 12, 11].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Aprobados sin capsula");
    XLSX.writeFile(wb, `Aprobados_sin_capsula_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (error) return <div style={{ padding: 16, color: C.red, fontSize: 13 }}>{error}</div>;
  if (!protos) return <div style={{ padding: 16, color: C.slate, fontSize: 13 }}>Cargando prototipos…</div>;

  const fila = (p) => (
    <tr key={p.id}>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {p.image ? <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 7, objectFit: "cover", border: `1px solid ${C.border}` }} /> : <div style={{ width: 36, height: 36, borderRadius: 7, background: C.canvas, border: `1px solid ${C.border}` }} />}
          <div><b>{p.reference || "—"}</b><div style={{ fontSize: 11, color: C.slate }}>{p.name}</div></div>
        </div>
      </td>
      {!agrupar && <td style={td}>{p.clienteTxt}</td>}
      <td style={td}>{[p.categoria, p.linea].filter(Boolean).join(" · ") || "—"}</td>
      <td style={td}>
        <select value={p.responsable} onChange={(e) => guardarCrono(p, { responsable: e.target.value })} style={{ padding: "4px 6px", border: `1.5px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: C.white, color: C.ink, maxWidth: 150 }}>
          <option value="">—</option>
          {[...new Set([...nombresDisenadores, p.responsable].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </td>
      <td style={td}>
        <input type="date" value={p.objetivo} onChange={(e) => guardarCrono(p, { fechaObjetivo: e.target.value })} style={{ padding: "4px 6px", border: `1.5px solid ${p.vencido ? C.red : C.border}`, borderRadius: 7, fontSize: 12, fontFamily: "inherit", background: p.vencido ? C.redBg : C.white, color: p.vencido ? C.red : C.ink }} />
        {p.vencido && <div style={{ fontSize: 10, fontWeight: 800, color: C.red }}>Vencido</div>}
      </td>
      <td style={td}>{fechaCorta(p.aprobado)}</td>
      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: p.sem.color }}>{p.dias} d</td>
      <td style={td}><span style={{ padding: "2px 10px", borderRadius: 20, background: p.sem.bg, color: p.sem.color, fontWeight: 700, fontSize: 11 }}>{p.sem.label}</span></td>
    </tr>
  );
  const gruposSemana = (() => {
    const m = new Map();
    const venc = [], sin = [];
    filas.forEach((p) => {
      if (!p.objetivo) { sin.push(p); return; }
      if (p.vencido) { venc.push(p); return; }
      const k = isoLocal(lunesDe(p.objetivo));
      m.set(k, [...(m.get(k) || []), p]);
    });
    const semanas = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, items]) => ({ k, titulo: etiquetaSemana(lunesDe(k)), items: items.sort((a, b) => a.objetivo.localeCompare(b.objetivo)), color: C.blue, bg: C.blueBg }));
    const out = [];
    if (venc.length) out.push({ k: "venc", titulo: "⏰ Vencidos (la fecha objetivo ya pasó)", items: venc.sort((a, b) => a.objetivo.localeCompare(b.objetivo)), color: C.red, bg: C.redBg });
    out.push(...semanas);
    if (sin.length) out.push({ k: "sin", titulo: "Sin fecha objetivo (asígnala en la vista Lista)", items: sin, color: C.amber, bg: C.amberBg });
    return out;
  })();
  const renderSemanas = () => (
    <div style={{ display: "grid", gap: 12 }}>
      {gruposSemana.map((g) => (
        <div key={g.k} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: g.bg, color: g.color, fontWeight: 800, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span>{g.titulo}</span><span>{g.items.length} prototipo{g.items.length === 1 ? "" : "s"}</span>
          </div>
          {g.items.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap", fontSize: 13 }}>
              <div style={{ flex: "1 1 190px", minWidth: 0 }}><b>{p.reference || "—"}</b> <span style={{ color: C.slate }}>{p.name}</span><div style={{ fontSize: 11, color: C.slate }}>{p.clienteTxt}</div></div>
              <div style={{ fontSize: 12, color: C.slate }}>{p.responsable || "Sin responsable"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: p.vencido ? C.red : C.ink, minWidth: 80, textAlign: "right" }}>{p.objetivo ? fechaCorta(p.objetivo) : "—"}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
  const encabezado = (
    <tr>
      <th style={th}>Prototipo</th>
      {!agrupar && <th style={th}>Cliente</th>}
      <th style={th}>Categoría · línea</th>
      <th style={th}>Responsable</th>
      <th style={th}>Fecha objetivo</th>
      <th style={th}>Aprobado el</th>
      <th style={{ ...th, textAlign: "right" }}>Sin hacer nada</th>
      <th style={th}>Prioridad</th>
    </tr>
  );

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
        Prototipos que ya fueron <b>aprobados</b> y todavía no se pasaron a una cápsula: es lo que hay que convertir para alimentar el tubo productivo. Del más antiguo al más reciente.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Kpi icon="📭" label="Aprobados sin cápsula" value={filas.length} color={C.blue} bg={C.blueBg} sub={`${clientes.length} cliente${clientes.length === 1 ? "" : "s"}`} />
        <Kpi icon="🔴" label={`Más de ${DIAS_URGENTE} días parados`} value={urgentes} color={C.red} bg={C.redBg} />
        <Kpi icon="🟠" label={`Entre ${DIAS_ATENCION + 1} y ${DIAS_URGENTE} días`} value={atencion} color={C.amber} bg={C.amberBg} />
        <Kpi icon="⏰" label="Con fecha objetivo vencida" value={vencidos} color={C.red} bg={C.redBg} sub={sinFecha ? `${sinFecha} sin fecha objetivo` : "Todos con fecha"} />
        <Kpi icon="⏳" label="El más antiguo" value={masViejo ? `${masViejo.dias} d` : "—"} color={C.ink} bg={C.canvas} sub={masViejo ? masViejo.reference || masViejo.name : "Todo al día"} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Chip activo={!cliente} onClick={() => setCliente("")}>Todos los clientes</Chip>
        {clientes.map((c) => <Chip key={c} activo={cliente === c} onClick={() => setCliente(cliente === c ? "" : c)}>{c}</Chip>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Chip activo={vista === "lista"} onClick={() => setVista("lista")}>📋 Lista</Chip>
        <Chip activo={vista === "semanas"} onClick={() => setVista("semanas")}>🗓 Cronograma por semanas</Chip>
        {hayMios && <Chip activo={soloMios} onClick={() => setSoloMios(!soloMios)}>Solo los míos</Chip>}
        <Chip activo={agrupar} onClick={() => setAgrupar(!agrupar)}>Agrupar por cliente</Chip>
        <button onClick={exportar} disabled={!filas.length} style={{ ...BOTON, marginLeft: "auto", opacity: filas.length ? 1 : 0.5, cursor: filas.length ? "pointer" : "default" }}>📥 Informe en Excel</button>
      </div>
      {vista === "semanas" && filas.length ? renderSemanas() : !filas.length ? (
        <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          {pendientes.length ? "Ninguno coincide con el filtro." : "No hay prototipos aprobados esperando cápsula. ✅"}
        </div>
      ) : agrupar ? (
        grupos.map(([nombre, items]) => (
          <div key={nombre} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 14, margin: "4px 0 6px" }}>{nombre} <span style={{ color: C.slate, fontWeight: 600, fontSize: 12 }}>· {items.length} sin cápsula</span></div>
            <div style={{ overflow: "auto", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}><thead>{encabezado}</thead><tbody>{items.map(fila)}</tbody></table>
            </div>
          </div>
        ))
      ) : (
        <div style={{ overflow: "auto", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: "65vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}><thead>{encabezado}</thead><tbody>{filas.map(fila)}</tbody></table>
        </div>
      )}
      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6, marginTop: 12 }}>
        Los días se cuentan desde que el prototipo quedó en «Aprobado». Para sacarlo de esta lista, se promueve (a cápsula o a programación de tela) desde Diseño → Prototipos (botón «⬆ Promover»). La fecha objetivo y el responsable se guardan aparte, sin tocar el prototipo.
      </div>
    </div>
  );
}

export default BloqueDisenoSinCapsula;
