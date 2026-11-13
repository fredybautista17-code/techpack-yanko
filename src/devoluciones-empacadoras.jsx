import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import {
  paramsEmpacadoras, empacadorasDeRegistros, procesosDeRegistros, repartirUnidades, estadisticasEmpacadoras, unidadesDevueltas,
  rangoPeriodo, PERIODOS, etiquetaMes,
} from "./devoluciones-empacadoras-calculo";

// ─── DEVOLUCIONES · EMPACADORAS ───────────────────────────────────────────────────────────────────────────────
// (2026-11-13, a pedido de Fredy) Quién empacó el lote de una devolución, para estadísticas de calidad. Sale de Nómina (producción del proceso
// «Terminación» del lote), se muestra a Calidad mientras cuenta y se guarda en la devolución: empacadoras [{id, nombre, und, devueltas}] y
// empacadorasOrigen ("nomina" | "nomina+manual" | "manual" | "sin_dato"). Configuración en config/devoluciones_empacadoras.
// Exporta: BloqueEmpacadoras (dentro del conteo de Calidad), EmpacadorasEstadisticasView (pestaña de Calidad) y LineaEmpacadoras (detalle).

const TEMA = {
  ink: "#1A1A2E", slate: "#5A5A7A", canvas: "#F7F4F0", white: "#FFFFFF", coral: "#E85D4A", coralBg: "#FDF0EE",
  jade: "#2D9E6B", jadeBg: "#EBF7F2", denim: "#3D6B9E", denimBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
  violet: "#7B5EA7", violetBg: "#F3EEF9", border: "#E8E2DB",
};
const CFG_COL = "config";
const CFG_ID = "devoluciones_empacadoras";
const fmt = (n) => Number(n || 0).toLocaleString("es-CO");
const pct = (n) => (n === null || n === undefined ? "—" : `${n.toFixed(n < 10 ? 1 : 0)}%`);
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const bt = (T, primario) => ({
  padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  border: primario ? "none" : `1px solid ${T.border}`, background: primario ? T.ink : T.white, color: primario ? T.white : T.ink,
});
const cmp = (T) => ({ height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, background: T.white, color: T.ink, boxSizing: "border-box", fontFamily: "inherit" });

// ── Datos ──
export function useParamsEmpacadoras(db) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    const un = onSnapshot(doc(db, CFG_COL, CFG_ID), (s) => setCfg(s.exists() ? s.data() : null), () => setCfg(null));
    return () => un();
  }, [db]);
  return useMemo(() => paramsEmpacadoras(cfg), [cfg]);
}
function useTrabajadoresActivos(db, habilitado) {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    if (!habilitado) return undefined;
    const un = onSnapshot(collection(db, "nomina_trabajadores"), (snap) => {
      setLista(snap.docs.map((x) => ({ ...x.data(), id: x.id })).filter((t) => t.activo !== false && t.nombre).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))));
    }, () => setLista([]));
    return () => un();
  }, [db, habilitado]);
  return lista;
}
// numLote se guarda como texto, pero por si alguna vez quedó como número se piden las dos formas (Firestore compara el tipo exacto).
export async function registrosNominaDeLote(db, lote) {
  const l = String(lote ?? "").trim();
  if (!l) return [];
  const valores = [l];
  const n = Number(l);
  if (Number.isFinite(n) && String(n) === l) valores.push(n);
  const s = await getDocs(query(collection(db, "nomina_produccion"), where("numLote", "in", valores)));
  return s.docs.map((x) => ({ ...x.data(), id: x.id }));
}

// ── Dentro del conteo de Calidad ──
export function BloqueEmpacadoras({ db, T: Tp, lote, devueltas, onCambio }) {
  const T = Tp || TEMA;
  const params = useParamsEmpacadoras(db);
  const [estado, setEstado] = useState({ cargando: true, regs: [], error: "" });
  const [quitados, setQuitados] = useState([]);
  const [manuales, setManuales] = useState([]);
  const [agregando, setAgregando] = useState(false);
  const trabajadores = useTrabajadoresActivos(db, agregando);

  useEffect(() => {
    let vivo = true;
    setEstado({ cargando: true, regs: [], error: "" });
    registrosNominaDeLote(db, lote)
      .then((regs) => { if (vivo) setEstado({ cargando: false, regs, error: "" }); })
      .catch((e) => { if (vivo) setEstado({ cargando: false, regs: [], error: e?.message || "No se pudo leer Nómina." }); });
    return () => { vivo = false; };
  }, [db, lote]);

  const deNomina = useMemo(() => empacadorasDeRegistros(estado.regs, params), [estado.regs, params]);
  const seleccion = useMemo(() => [
    ...deNomina.filter((e) => !quitados.includes(e.id)),
    ...manuales.filter((m) => !deNomina.some((e) => e.id === m.id)).map((m) => ({ id: m.id, nombre: m.nombre, und: 0, manual: true })),
  ], [deNomina, quitados, manuales]);
  const reparto = useMemo(() => repartirUnidades(seleccion, devueltas), [seleccion, devueltas]);
  const origen = seleccion.length === 0 ? "sin_dato" : deNomina.some((e) => !quitados.includes(e.id)) ? (manuales.length ? "nomina+manual" : "nomina") : "manual";

  useEffect(() => {
    if (estado.cargando) { onCambio({ lista: [], origen: "", cargando: true }); return; }
    onCambio({
      lista: reparto.map((e) => ({ id: e.id, nombre: e.nombre, und: e.und || 0, devueltas: e.devueltas || 0, ...(e.manual ? { manual: true } : {}) })),
      origen, cargando: false,
    });
  }, [reparto, origen, estado.cargando]);

  const procesosEncontrados = procesosDeRegistros(estado.regs);
  const yaEstan = new Set(seleccion.map((e) => e.id));
  const candidatos = trabajadores.filter((t) => !yaEstan.has(String(t.id)));

  return (
    <div style={{ marginTop: 14, padding: "12px 14px", background: T.violetBg, border: `1px solid ${T.violet}33`, borderRadius: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.violet, marginBottom: 6, letterSpacing: 0.3 }}>📦 QUIÉN EMPACÓ ESTE LOTE · desde Nómina, proceso Terminación</div>
      {estado.cargando ? (
        <div style={{ fontSize: 13, color: T.slate }}>Buscando en Nómina el lote {lote}…</div>
      ) : estado.error ? (
        <div style={{ fontSize: 13, color: T.coral }}>{estado.error} Puedes agregar a quien empacó a mano.</div>
      ) : !deNomina.length ? (
        <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.5 }}>
          {estado.regs.length
            ? <>El lote {lote} tiene registros en Nómina, pero ninguno de Terminación (solo: {procesosEncontrados.join(", ")}).</>
            : <>No aparece producción del lote {lote} en Nómina.</>}
          {" "}Puedes agregar a quien empacó a mano o dejarlo sin dato.
        </div>
      ) : (
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 4 }}>
          Las {fmt(devueltas)} unidades que cuentas se reparten según lo que empacó cada una.
        </div>
      )}

      {reparto.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {reparto.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: T.white, border: `1px solid ${T.border}`, borderRadius: 10, padding: "7px 12px" }}>
              <b style={{ color: T.ink, fontSize: 13 }}>{e.nombre}</b>
              <span style={{ fontSize: 12, color: T.slate }}>{e.manual ? "agregada a mano" : `empacó ${fmt(e.und)} und del lote`}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: e.devueltas ? T.coral : T.slate }}>{fmt(e.devueltas)} devuelta{e.devueltas === 1 ? "" : "s"}</span>
              <button type="button" onClick={() => (e.manual ? setManuales((m) => m.filter((x) => x.id !== e.id)) : setQuitados((q) => [...q, e.id]))} style={{ ...bt(T), padding: "3px 9px", fontSize: 11 }} title="Quitar de esta devolución">Quitar</button>
            </div>
          ))}
        </div>
      )}
      {quitados.length > 0 && (
        <div style={{ fontSize: 11, color: T.slate, marginTop: 6 }}>
          Quitaste a {deNomina.filter((e) => quitados.includes(e.id)).map((e) => e.nombre).join(", ")} de esta devolución. <button type="button" onClick={() => setQuitados([])} style={{ background: "none", border: "none", color: T.denim, cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0, fontFamily: "inherit" }}>Volver a ponerlas</button>
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!agregando ? (
          <button type="button" onClick={() => setAgregando(true)} style={bt(T)}>+ Agregar a otra persona</button>
        ) : (
          <>
            <select value="" onChange={(ev) => {
              const t = trabajadores.find((x) => String(x.id) === ev.target.value);
              if (t) setManuales((m) => [...m, { id: String(t.id), nombre: t.nombre }]);
            }} style={{ ...cmp(T), minWidth: 220 }}>
              <option value="">Elegir persona de Nómina…</option>
              {candidatos.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.area ? ` · ${t.area}` : ""}</option>)}
            </select>
            <button type="button" onClick={() => setAgregando(false)} style={bt(T)}>Listo</button>
          </>
        )}
        {origen === "sin_dato" && !estado.cargando && <span style={{ fontSize: 12, color: T.amber, fontWeight: 700 }}>Se guardará «sin dato de quién empacó».</span>}
      </div>
    </div>
  );
}

// Una línea para el detalle de una devolución ya revisada.
export function LineaEmpacadoras({ T: Tp, d }) {
  const T = Tp || TEMA;
  if (!d?.empacadoras?.length) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 13, color: T.ink }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: T.violet }}>📦 EMPACADO POR </span>
      {d.empacadoras.map((e, i) => <span key={e.id || i}>{i ? " · " : ""}<b>{e.nombre}</b> ({fmt(e.devueltas)} de {fmt(unidadesDevueltas(d))} devueltas)</span>)}
    </div>
  );
}

// ── Configuración ──
function ConfigEmpacadoras({ db, T, params, puedeEditar }) {
  const [proc, setProc] = useState(params.procesos.join(", "));
  const [excl, setExcl] = useState(null); // [{id,nombre}] — null = sin tocar
  const [agregar, setAgregar] = useState(false);
  const [msg, setMsg] = useState("");
  const trabajadores = useTrabajadoresActivos(db, true);
  const nombreDe = (id) => trabajadores.find((t) => String(t.id) === String(id))?.nombre || id;
  const excluidos = excl || params.excluidos.map((id) => ({ id, nombre: nombreDe(id) }));

  async function guardar() {
    setMsg("");
    try {
      const procesos = proc.split(",").map((x) => x.trim()).filter(Boolean);
      await setDoc(doc(db, CFG_COL, CFG_ID), { procesos: procesos.length ? procesos : ["Terminación"], excluidos: excluidos.map((e) => ({ id: String(e.id), nombre: e.nombre })), actualizadoEn: new Date().toISOString() }, { merge: true });
      setExcl(null); setMsg("Guardado.");
    } catch (e) { setMsg(e?.message || "No se pudo guardar."); }
  }
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ fontWeight: 800, color: T.ink, fontSize: 14, marginBottom: 4 }}>⚙ Configuración de empacadoras</div>
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 10, lineHeight: 1.5 }}>
        Las empacadoras no se escriben aquí: salen solas de Nómina. Aquí solo defines qué proceso cuenta como empaque y a quién <b>no</b> contar (por ejemplo la líder que registra Terminación pero no empaca). Cuando rotes personal no tienes que hacer nada: quien registre Terminación de un lote aparece.
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>PROCESO(S) QUE CUENTAN COMO EMPAQUE (separados por coma)</div>
      <input value={proc} onChange={(e) => setProc(e.target.value)} disabled={!puedeEditar} style={{ ...cmp(T), width: "100%", maxWidth: 420 }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, margin: "12px 0 4px" }}>PERSONAS QUE NO SE CUENTAN</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {!excluidos.length && <span style={{ fontSize: 12, color: T.slate }}>Ninguna: se cuenta a todo el que registre Terminación.</span>}
        {excluidos.map((e) => (
          <span key={e.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 12, color: T.ink, fontWeight: 600 }}>
            {e.nombre}
            {puedeEditar && <button type="button" onClick={() => setExcl(excluidos.filter((x) => x.id !== e.id))} style={{ background: "none", border: "none", cursor: "pointer", color: T.coral, fontWeight: 800, padding: 0 }} title="Volver a contarla">×</button>}
          </span>
        ))}
        {puedeEditar && (agregar ? (
          <select value="" onChange={(ev) => {
            const t = trabajadores.find((x) => String(x.id) === ev.target.value);
            if (t) { setExcl([...excluidos, { id: String(t.id), nombre: t.nombre }]); setAgregar(false); }
          }} style={{ ...cmp(T), minWidth: 200 }}>
            <option value="">Elegir persona…</option>
            {trabajadores.filter((t) => !excluidos.some((e) => String(e.id) === String(t.id))).map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.area ? ` · ${t.area}` : ""}</option>)}
          </select>
        ) : <button type="button" onClick={() => setAgregar(true)} style={bt(T)}>+ No contar a alguien</button>)}
      </div>
      {puedeEditar ? (
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={guardar} style={bt(T, true)}>Guardar configuración</button>
          {msg && <span style={{ fontSize: 12, color: msg === "Guardado." ? T.jade : T.coral }}>{msg}</span>}
        </div>
      ) : <div style={{ marginTop: 10, fontSize: 12, color: T.slate }}>Solo un administrador puede cambiar esto.</div>}
    </div>
  );
}

// ── Estadísticas ──
function Kpi({ T, valor, etiqueta, color, nota }) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: color || T.ink, lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginTop: 6 }}>{etiqueta}</div>
      {nota && <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{nota}</div>}
    </div>
  );
}
function BarraH({ T, valor, max, color }) {
  return (
    <div style={{ height: 8, background: T.canvas, borderRadius: 6, overflow: "hidden", minWidth: 80 }}>
      <div style={{ width: `${max > 0 ? Math.min(100, (valor / max) * 100) : 0}%`, height: "100%", background: color || T.coral, borderRadius: 6 }} />
    </div>
  );
}

export function EmpacadorasEstadisticasView({ db, T: Tp, currentUser }) {
  const T = Tp || TEMA;
  const params = useParamsEmpacadoras(db);
  const hoy = hoyBogota();
  const [per, setPer] = useState("3m");
  const [fDesde, setFDesde] = useState(hoy.slice(0, 8) + "01");
  const [fHasta, setFHasta] = useState(hoy);
  const [cliente, setCliente] = useState("");
  const [motivo, setMotivo] = useState("");
  const [verConfig, setVerConfig] = useState(false);
  const [devs, setDevs] = useState(null);
  const [produccion, setProduccion] = useState(null);
  const [errProd, setErrProd] = useState("");
  const [relleno, setRelleno] = useState({ trabajando: false, msg: "" });
  const esAdmin = !!currentUser?.isAdmin;
  const { desde, hasta } = rangoPeriodo(per, hoy, fDesde, fHasta);

  useEffect(() => {
    const un = onSnapshot(collection(db, "devoluciones_cliente"), (snap) => setDevs(snap.docs.map((x) => ({ ...x.data(), id: x.id }))), () => setDevs([]));
    return () => un();
  }, [db]);
  useEffect(() => {
    let vivo = true;
    setProduccion(null); setErrProd("");
    getDocs(query(collection(db, "nomina_produccion"), where("fecha", ">=", desde), where("fecha", "<=", hasta)))
      .then((s) => { if (vivo) setProduccion(s.docs.map((x) => x.data())); })
      .catch((e) => { if (vivo) { setProduccion([]); setErrProd(e?.message || "No se pudo leer Nómina."); } });
    return () => { vivo = false; };
  }, [db, desde, hasta]);

  const est = useMemo(() => (devs && produccion ? estadisticasEmpacadoras({ devs, produccion, params, desde, hasta, cliente, motivo }) : null), [devs, produccion, params, desde, hasta, cliente, motivo]);

  // Devoluciones revisadas antes de existir esto: se les busca en Nómina quién empacó y se guarda (no cambia su estado ni su historial).
  const sinEmpacadora = useMemo(() => (devs || []).filter((d) => (d.conteo?.length) && !(d.empacadoras?.length) && d.empacadorasOrigen !== "sin_dato" && d.lote), [devs]);
  async function completarHistoricas() {
    setRelleno({ trabajando: true, msg: "" });
    let ok = 0, sinDato = 0, fallos = 0;
    for (const d of sinEmpacadora) {
      try {
        const lista = empacadorasDeRegistros(await registrosNominaDeLote(db, d.lote), params);
        if (!lista.length) { sinDato += 1; continue; }
        const rep = repartirUnidades(lista, unidadesDevueltas(d)).map((e) => ({ id: e.id, nombre: e.nombre, und: e.und, devueltas: e.devueltas }));
        await updateDoc(doc(db, "devoluciones_cliente", d.id), { empacadoras: rep, empacadorasOrigen: "nomina" });
        ok += 1;
      } catch (e) { fallos += 1; }
    }
    setRelleno({ trabajando: false, msg: `Listo: ${ok} completada${ok === 1 ? "" : "s"}${sinDato ? ` · ${sinDato} sin registro de Terminación en Nómina` : ""}${fallos ? ` · ${fallos} con error` : ""}.` });
  }

  const maxDev = Math.max(1, ...(est?.ranking || []).map((r) => r.devueltas));
  const maxMes = Math.max(1, ...(est?.meses || []).map((m) => m.devueltas));
  const maxMotivo = Math.max(1, ...(est?.motivos || []).map((m) => m.und));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select value={per} onChange={(e) => setPer(e.target.value)} style={cmp(T)}>{PERIODOS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}</select>
        {per === "rango" && (
          <>
            <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={cmp(T)} />
            <span style={{ color: T.slate, fontSize: 12 }}>a</span>
            <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={cmp(T)} />
          </>
        )}
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} style={cmp(T)}>
          <option value="">Todos los clientes</option>
          {(est?.clientes || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={cmp(T)}>
          <option value="">Todos los motivos</option>
          {(est?.motivosDisponibles || []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={{ fontSize: 12, color: T.slate }}>{desde} → {hasta}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setVerConfig((v) => !v)} style={bt(T)}>⚙ Configurar</button>
      </div>

      {verConfig && <ConfigEmpacadoras db={db} T={T} params={params} puedeEditar={esAdmin} />}

      {esAdmin && sinEmpacadora.length > 0 && (
        <div style={{ background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: T.amber }}>
          <span style={{ flex: 1, minWidth: 240 }}>Hay <b>{sinEmpacadora.length}</b> devolución{sinEmpacadora.length === 1 ? "" : "es"} ya revisada{sinEmpacadora.length === 1 ? "" : "s"} sin empacadora guardada. Puedo buscarla en Nómina (por lote) y completarla; no cambia su estado.</span>
          <button type="button" disabled={relleno.trabajando} onClick={completarHistoricas} style={bt(T, true)}>{relleno.trabajando ? "Buscando…" : "Completar desde Nómina"}</button>
          {relleno.msg && <span style={{ flexBasis: "100%", color: T.ink }}>{relleno.msg}</span>}
        </div>
      )}
      {relleno.msg && !(esAdmin && sinEmpacadora.length > 0) && <div style={{ fontSize: 12, color: T.jade, marginBottom: 10 }}>{relleno.msg}</div>}
      {errProd && <div style={{ fontSize: 12, color: T.coral, marginBottom: 10 }}>{errProd}</div>}

      {!est ? <div style={{ padding: 24, color: T.slate, fontSize: 13 }}>Calculando…</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 16 }}>
            <Kpi T={T} valor={fmt(est.devueltasTotal)} etiqueta="Unidades devueltas" color={T.coral} nota={`${est.devoluciones} devolución${est.devoluciones === 1 ? "" : "es"} revisadas`} />
            <Kpi T={T} valor={fmt(est.empacadasTotal)} etiqueta="Unidades empacadas (Nómina)" nota="Terminación del período" />
            <Kpi T={T} valor={pct(est.tasaGlobal)} etiqueta="Tasa de devolución" color={T.denim} nota="devueltas ÷ empacadas" />
            <Kpi T={T} valor={fmt(est.sinAsignar)} etiqueta="Devueltas sin empacadora" color={est.sinAsignar ? T.amber : T.jade} nota={est.sinAsignar ? "no aparecieron en Nómina" : "todas asignadas"} />
          </div>

          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14, overflowX: "auto" }}>
            <div style={{ fontWeight: 800, color: T.ink, fontSize: 14, marginBottom: 2 }}>Por empacadora</div>
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 10 }}>Las devueltas de cada lote se reparten según lo que empacó cada una. Las devoluciones llegan semanas después de empacar, así que la tasa se estabiliza con períodos largos.</div>
            {!est.ranking.length ? <div style={{ padding: 16, color: T.slate, fontSize: 13 }}>No hay datos en este período.</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: T.slate, fontSize: 11 }}>
                    <th style={{ padding: "4px 8px" }}>Empacadora</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Empacó</th>
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Devueltas</th><th style={{ padding: "4px 8px", minWidth: 110 }} />
                    <th style={{ padding: "4px 8px", textAlign: "right" }}>Tasa</th><th style={{ padding: "4px 8px" }}>Motivo más frecuente</th>
                  </tr>
                </thead>
                <tbody>
                  {est.ranking.map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: "8px", fontWeight: 700, color: T.ink }}>{r.nombre}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{fmt(r.empacadas)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 800, color: r.devueltas ? T.coral : T.slate }}>{fmt(r.devueltas)}</td>
                      <td style={{ padding: "8px" }}><BarraH T={T} valor={r.devueltas} max={maxDev} /></td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{pct(r.tasa)}</td>
                      <td style={{ padding: "8px", color: T.slate }}>{r.motivoTop || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontWeight: 800, color: T.ink, fontSize: 14, marginBottom: 10 }}>Por motivo</div>
              {!est.motivos.length ? <div style={{ color: T.slate, fontSize: 13 }}>Sin datos.</div> : est.motivos.map((m) => (
                <div key={m.motivo} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1.2fr) 2fr 60px", gap: 10, alignItems: "center", marginBottom: 7, fontSize: 12 }}>
                  <span style={{ color: T.ink, fontWeight: 600 }}>{m.motivo}</span>
                  <BarraH T={T} valor={m.und} max={maxMotivo} color={T.denim} />
                  <span style={{ textAlign: "right", fontWeight: 700 }}>{fmt(m.und)}</span>
                </div>
              ))}
            </div>
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontWeight: 800, color: T.ink, fontSize: 14, marginBottom: 10 }}>Tendencia por mes (unidades devueltas)</div>
              {!est.meses.length ? <div style={{ color: T.slate, fontSize: 13 }}>Sin datos.</div> : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130, overflowX: "auto" }}>
                  {est.meses.map((m) => (
                    <div key={m.ym} style={{ flex: "1 0 44px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, marginBottom: 3 }}>{fmt(m.devueltas)}</span>
                      <div style={{ width: "70%", height: `${Math.max(3, (m.devueltas / maxMes) * 85)}px`, background: T.coral, borderRadius: "5px 5px 0 0" }} />
                      <span style={{ fontSize: 10, color: T.slate, marginTop: 4 }}>{etiquetaMes(m.ym)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", overflowX: "auto" }}>
            <div style={{ fontWeight: 800, color: T.ink, fontSize: 14, marginBottom: 10 }}>Detalle de devoluciones</div>
            {!est.detalle.length ? <div style={{ color: T.slate, fontSize: 13 }}>No hay devoluciones revisadas en este período.</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ textAlign: "left", color: T.slate, fontSize: 11 }}>
                  <th style={{ padding: "4px 8px" }}>Fecha</th><th style={{ padding: "4px 8px" }}>Devolución</th><th style={{ padding: "4px 8px" }}>Lote</th>
                  <th style={{ padding: "4px 8px" }}>Cliente</th><th style={{ padding: "4px 8px" }}>Motivo</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Und</th><th style={{ padding: "4px 8px" }}>Empacó</th>
                </tr></thead>
                <tbody>
                  {est.detalle.map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>{r.fecha}</td>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>{r.numero || "—"}</td>
                      <td style={{ padding: "7px 8px" }}>{r.lote || "—"}{r.ref ? ` · ${r.ref}` : ""}</td>
                      <td style={{ padding: "7px 8px" }}>{r.cliente || "—"}</td>
                      <td style={{ padding: "7px 8px" }}>{r.motivo || "—"}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{fmt(r.unidades)}</td>
                      <td style={{ padding: "7px 8px" }}>{r.empacadoras.length ? r.empacadoras.map((e) => `${e.nombre} (${fmt(e.devueltas)})`).join(" · ") : <span style={{ color: T.amber }}>sin dato</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
