// ─── DISEÑO: PROTOTIPOS APROBADOS SIN CÁPSULA («mi línea de trabajo») ────────────
// (2026-11-12, a pedido de Fredy) Para Diseño y la Dirección Creativa: los prototipos que ya se aprobaron pero a los que
// nadie les ha creado una cápsula (promotedTo vacío). Es lo que hay que diseñar/promover para alimentar el tubo productivo.
// Lee la colección «prototipos» en vivo y NO la modifica (solo escribe en «diseno_cronograma»). Sale como tarjeta del «Mi Día» (catálogo: diseno_sin_capsula).
// (2026-11-13) Rediseño para muchos clientes: una línea por cliente (acordeón), buscador, filtros, y fecha/responsable a varios a la vez.
// (2026-11-13) Cronograma: a cada prototipo se le pone fecha objetivo y responsable (colección «diseno_cronograma», un documento por
// prototipo, no toca el prototipo); hay vista por semanas con vencidos y sin fecha. Sale de la lista solo al promoverlo (cápsula o tela).
// «Aprobado» = status "aprobado"; la fecha sale del cambio de estado en la Hoja de Vida del prototipo (si no está, fecha de la etapa o de creación).
import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const DIAS_ATENCION = 14;
const DIAS_URGENTE = 30;
const TEXTO_APROBADO = 'Estado → "Aprobado".';

const BOTON = { padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink };

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

const referenciaUtil = (r) => !!r && !["-", "n/a", "na"].includes(norm(r));
const COLUMNAS = "22px 40px minmax(190px, 1fr) 150px 150px 78px";
const CAMPO = { padding: "5px 7px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: C.white, color: C.ink, width: "100%", minWidth: 0 };

function Dato({ valor, etiqueta, color, bg }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "8px 14px", borderRadius: 10, background: bg, color, fontSize: 12, fontWeight: 700 }}>
      <b style={{ fontSize: 20, lineHeight: 1 }}>{valor}</b><span>{etiqueta}</span>
    </div>
  );
}
function Chip({ activo, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 13px", border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.ink, borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>
  );
}
function Fila({ p, marcado, onMarcar, nombres, onResponsable, onFecha, sinCliente }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: COLUMNAS, gap: 12, alignItems: "center", padding: "8px 14px", borderTop: `1px solid ${C.border}`, fontSize: 13, minWidth: 760 }}>
      <input type="checkbox" checked={marcado} onChange={onMarcar} aria-label="Seleccionar prototipo" />
      {p.image ? <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 7, objectFit: "cover", border: `1px solid ${C.border}` }} /> : <div style={{ width: 36, height: 36, borderRadius: 7, background: C.canvas, border: `1px solid ${C.border}` }} />}
      <div style={{ minWidth: 0 }}>
        <b>{referenciaUtil(p.reference) ? `${p.reference} · ` : ""}{p.name}</b>
        <div style={{ fontSize: 11, color: C.slate }}>{[p.categoria, p.linea, sinCliente ? null : p.clienteTxt].filter(Boolean).join(" · ")}</div>
      </div>
      <select value={p.responsable} onChange={(e) => onResponsable(e.target.value)} style={CAMPO} aria-label="Responsable">
        <option value="">Sin responsable</option>
        {[...new Set([...nombres, p.responsable].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <div>
        <input type="date" value={p.objetivo} onChange={(e) => onFecha(e.target.value)} style={{ ...CAMPO, borderColor: p.vencido ? C.red : C.border, background: p.vencido ? C.redBg : C.white }} aria-label="Fecha objetivo" />
        {p.vencido && <div style={{ fontSize: 10, fontWeight: 800, color: C.red }}>Vencido</div>}
      </div>
      <div style={{ textAlign: "right", fontWeight: 800, color: p.sem.color }}>{p.dias} d<div style={{ fontSize: 11 }}>{p.sem.label}</div></div>
    </div>
  );
}

export function BloqueDisenoSinCapsula({ db, currentUser }) {
  const [protos, setProtos] = useState(null);
  const [error, setError] = useState("");
  const [crono, setCrono] = useState({});
  const [q, setQ] = useState("");
  const [resp, setResp] = useState("");
  const [prio, setPrio] = useState("");
  const [vista, setVista] = useState("cli");
  const [abiertos, setAbiertos] = useState([]);
  const [sel, setSel] = useState([]);
  const [bulk, setBulk] = useState({ fecha: "", resp: "" });
  const inicial = useRef(false);

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

  const estampa = () => ({ actualizadoPor: currentUser?.name || "", actualizadoEn: new Date().toISOString() });
  async function guardarCrono(id, cambio) {
    await setDoc(doc(db, "diseno_cronograma", id), { protoId: id, ...cambio, ...estampa() }, { merge: true });
  }
  async function aplicarEnBloque() {
    const cambio = {};
    if (bulk.fecha) cambio.fechaObjetivo = bulk.fecha;
    if (bulk.resp) cambio.responsable = bulk.resp;
    if (!Object.keys(cambio).length || !sel.length) return;
    await Promise.all(sel.map((id) => guardarCrono(id, cambio)));
    setSel([]);
    setBulk({ fecha: "", resp: "" });
  }

  const pendientes = useMemo(() => {
    const hoy = isoLocal(new Date());
    return (protos || [])
      .filter((p) => !p.eliminado && p.status === "aprobado" && !p.promotedTo)
      .map((p) => {
        const aprobado = fechaAprobacion(p);
        const dias = diasDesde(aprobado);
        const objetivo = crono[p.id]?.fechaObjetivo || "";
        const responsable = crono[p.id]?.responsable || p.assignedTo || "";
        const sem = semaforo(dias);
        return { ...p, aprobado, dias, sem, objetivo, responsable, vencido: !!objetivo && objetivo < hoy, clienteTxt: p.cliente || p.colores?.[0] || "(Sin cliente)" };
      })
      .sort((a, b) => b.dias - a.dias);
  }, [protos, crono]);
  const nombres = useMemo(() => [...new Set((protos || []).map((x) => x.assignedTo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [protos]);

  const textoQ = norm(q);
  const filas = pendientes.filter((p) => (
    (!textoQ || norm([p.name, p.reference, p.clienteTxt, p.categoria, p.linea].join(" ")).includes(textoQ))
    && (!resp || p.responsable === resp)
    && (!prio || p.sem.label === prio)
  ));
  const clientesCount = new Set(filas.map((p) => p.clienteTxt)).size;
  const urgentes = filas.filter((p) => p.dias > DIAS_URGENTE).length;
  const atencion = filas.filter((p) => p.dias > DIAS_ATENCION && p.dias <= DIAS_URGENTE).length;
  const vencidos = filas.filter((p) => p.vencido).length;
  const sinFecha = filas.filter((p) => !p.objetivo).length;

  const grupos = useMemo(() => {
    const m = new Map();
    filas.forEach((p) => m.set(p.clienteTxt, [...(m.get(p.clienteTxt) || []), p]));
    return [...m.entries()]
      .map(([nombre, items]) => ({ nombre, items, urg: items.filter((p) => p.dias > DIAS_URGENTE).length, aten: items.filter((p) => p.dias > DIAS_ATENCION && p.dias <= DIAS_URGENTE).length, viejo: Math.max(...items.map((p) => p.dias)) }))
      .sort((a, b) => b.urg - a.urg || b.viejo - a.viejo || a.nombre.localeCompare(b.nombre, "es"));
  }, [filas]);
  const primerGrupo = grupos[0]?.nombre;
  useEffect(() => {
    if (!inicial.current && primerGrupo) { inicial.current = true; setAbiertos([primerGrupo]); }
  }, [primerGrupo]);

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

  const alternar = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const fila = (p, sinCliente) => (
    <Fila key={p.id} p={p} sinCliente={sinCliente} marcado={sel.includes(p.id)} onMarcar={() => alternar(p.id)} nombres={nombres}
      onResponsable={(v) => guardarCrono(p.id, { responsable: v })} onFecha={(v) => guardarCrono(p.id, { fechaObjetivo: v })} />
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
    const out = [];
    if (venc.length) out.push({ k: "venc", titulo: "⏰ Vencidos (la fecha objetivo ya pasó)", items: venc.sort((a, b) => a.objetivo.localeCompare(b.objetivo)), color: C.red, bg: C.redBg });
    [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, items]) => out.push({ k, titulo: etiquetaSemana(lunesDe(k)), items: items.sort((a, b) => a.objetivo.localeCompare(b.objetivo)), color: C.blue, bg: C.blueBg }));
    if (sin.length) out.push({ k: "sin", titulo: "Sin fecha objetivo (asígnala en «Por cliente» o «Lista», también a varios a la vez)", items: sin, color: C.amber, bg: C.amberBg });
    return out;
  })();

  const cuerpo = !filas.length ? (
    <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
      {pendientes.length ? "Ninguno coincide con el filtro." : "No hay prototipos aprobados esperando cápsula. ✅"}
    </div>
  ) : vista === "lista" ? (
    <div style={{ overflowX: "auto", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <div style={{ marginTop: -1 }}>{filas.map((p) => fila(p, false))}</div>
    </div>
  ) : vista === "sem" ? (
    <div style={{ display: "grid", gap: 10 }}>
      {gruposSemana.map((g) => (
        <div key={g.k} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: g.bg, color: g.color, fontWeight: 800, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span>{g.titulo}</span><span>{g.items.length} prototipo{g.items.length === 1 ? "" : "s"}</span>
          </div>
          {g.items.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap", fontSize: 13 }}>
              <div style={{ flex: "1 1 190px", minWidth: 0 }}><b>{referenciaUtil(p.reference) ? `${p.reference} · ` : ""}{p.name}</b><div style={{ fontSize: 11, color: C.slate }}>{p.clienteTxt}</div></div>
              <div style={{ fontSize: 12, color: C.slate }}>{p.responsable || "Sin responsable"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: p.vencido ? C.red : C.ink, minWidth: 80, textAlign: "right" }}>{p.objetivo ? fechaCorta(p.objetivo) : "—"}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  ) : (
    grupos.map((g) => {
      const abierto = !!textoQ || abiertos.includes(g.nombre);
      const nVerde = g.items.length - g.urg - g.aten;
      const marcadosGrupo = g.items.filter((p) => sel.includes(p.id)).length;
      return (
        <div key={g.nombre} style={{ border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, overflow: "hidden", background: C.white }}>
          <div onClick={() => setAbiertos((a) => (a.includes(g.nombre) ? a.filter((x) => x !== g.nombre) : [...a, g.nombre]))} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", flexWrap: "wrap", background: abierto ? C.canvas : C.white }}>
            <span style={{ width: 14, fontSize: 11, color: C.slate }}>{abierto ? "▼" : "▶"}</span>
            <b style={{ flex: "1 1 200px", minWidth: 0 }}>{g.nombre}</b>
            <span title="Rojo: urgentes · naranja: atención · verde: recientes" style={{ display: "flex", height: 6, width: 90, borderRadius: 4, overflow: "hidden", background: C.border }}>
              <i style={{ width: `${(g.urg / g.items.length) * 100}%`, background: C.red }} />
              <i style={{ width: `${(g.aten / g.items.length) * 100}%`, background: C.amber }} />
              <i style={{ width: `${(nVerde / g.items.length) * 100}%`, background: C.green }} />
            </span>
            <span style={{ padding: "2px 10px", borderRadius: 99, background: C.blueBg, color: C.blue, fontSize: 11, fontWeight: 800 }}>{g.items.length} sin cápsula</span>
            {g.urg > 0 && <span style={{ padding: "2px 10px", borderRadius: 99, background: C.redBg, color: C.red, fontSize: 11, fontWeight: 800 }}>{g.urg} urgente{g.urg > 1 ? "s" : ""}</span>}
            <span style={{ fontSize: 12, color: C.slate, minWidth: 90, textAlign: "right" }}>más viejo {g.viejo} d</span>
          </div>
          {abierto && (
            <div style={{ overflowX: "auto" }}>
              <div style={{ padding: "6px 14px", borderTop: `1px solid ${C.border}`, fontSize: 12 }}>
                <button onClick={() => setSel((s) => (marcadosGrupo === g.items.length ? s.filter((id) => !g.items.some((p) => p.id === id)) : [...new Set([...s, ...g.items.map((p) => p.id)])]))} style={{ ...BOTON, padding: "3px 10px", fontSize: 12 }}>{marcadosGrupo === g.items.length ? "Quitar los de este cliente" : `Marcar los ${g.items.length} de este cliente`}</button>
              </div>
              {g.items.map((p) => fila(p, true))}
            </div>
          )}
        </div>
      );
    })
  );

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 12, lineHeight: 1.5 }}>
        Prototipos <b>aprobados</b> que todavía no se pasaron a una cápsula: es lo que hay que convertir para alimentar el tubo productivo. Ponles responsable y fecha objetivo.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Dato valor={filas.length} etiqueta={`sin cápsula · ${clientesCount} cliente${clientesCount === 1 ? "" : "s"}`} color={C.blue} bg={C.blueBg} />
        <Dato valor={urgentes} etiqueta={`urgentes (+${DIAS_URGENTE} d)`} color={C.red} bg={C.redBg} />
        <Dato valor={atencion} etiqueta="en atención" color={C.amber} bg={C.amberBg} />
        <Dato valor={filas[0] ? `${filas[0].dias} d` : "—"} etiqueta="el más antiguo" color={C.ink} bg={C.canvas} />
        <Dato valor={sinFecha} etiqueta="sin fecha objetivo" color={C.slate} bg={C.canvas} />
        {vencidos > 0 && <Dato valor={vencidos} etiqueta="con fecha objetivo vencida" color={C.red} bg={C.redBg} />}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar prototipo, referencia o cliente…" aria-label="Buscar" style={{ ...CAMPO, flex: "1 1 220px", width: "auto", padding: "8px 10px", fontSize: 13 }} />
        <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsable" style={{ ...CAMPO, width: "auto", padding: "8px 10px", fontSize: 13 }}>
          <option value="">Todos los responsables</option>
          {nombres.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Prioridad" style={{ ...CAMPO, width: "auto", padding: "8px 10px", fontSize: 13 }}>
          <option value="">Todas las prioridades</option>
          <option value="Urgente">🔴 Urgentes</option>
          <option value="Atención">🟠 Atención</option>
          <option value="Reciente">🟢 Recientes</option>
        </select>
        <div style={{ display: "flex", gap: 6 }}>
          <Chip activo={vista === "cli"} onClick={() => setVista("cli")}>Por cliente</Chip>
          <Chip activo={vista === "lista"} onClick={() => setVista("lista")}>Lista</Chip>
          <Chip activo={vista === "sem"} onClick={() => setVista("sem")}>Por semanas</Chip>
        </div>
        <button onClick={exportar} disabled={!filas.length} style={{ ...BOTON, marginLeft: "auto", opacity: filas.length ? 1 : 0.5, cursor: filas.length ? "pointer" : "default" }}>📥 Excel</button>
      </div>
      {sel.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "9px 12px", borderRadius: 10, background: C.blueBg, color: C.blue, fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>
          <span>{sel.length} seleccionado{sel.length === 1 ? "" : "s"}</span>
          <span>Fecha objetivo</span>
          <input type="date" value={bulk.fecha} onChange={(e) => setBulk((b) => ({ ...b, fecha: e.target.value }))} style={{ ...CAMPO, width: "auto" }} />
          <span>Responsable</span>
          <select value={bulk.resp} onChange={(e) => setBulk((b) => ({ ...b, resp: e.target.value }))} style={{ ...CAMPO, width: "auto" }}>
            <option value="">(sin cambiar)</option>
            {nombres.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={aplicarEnBloque} disabled={!bulk.fecha && !bulk.resp} style={{ ...BOTON, background: C.green, borderColor: C.green, color: C.white, opacity: bulk.fecha || bulk.resp ? 1 : 0.5 }}>Aplicar a los {sel.length}</button>
          <button onClick={() => setSel([])} style={BOTON}>Quitar selección</button>
        </div>
      )}
      {cuerpo}
      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6, marginTop: 12 }}>
        Los días se cuentan desde que el prototipo quedó en «Aprobado». Para sacarlo de esta lista, se promueve (a cápsula o a programación de tela) desde Diseño → Prototipos (botón «⬆ Promover»). La fecha objetivo y el responsable se guardan aparte, sin tocar el prototipo.
      </div>
    </div>
  );
}

export default BloqueDisenoSinCapsula;
