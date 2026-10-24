// ─── PROYECCIÓN POR ÁREA (Planeación) ─────────────────────────────────────────
// (2026-10-24, a pedido de Fredy) Cronograma hacia adelante del trabajo de cada
// área, de Corte a Terminación: cuánto le llega, cuánto alcanza a sacar por
// semana con su capacidad, cuánto se le acumula y qué pedidos llegarían tarde.
// Todo en unidades y en pesos (precio matriculado de Busint). La capacidad de
// cada área se puede mover aquí mismo para simular; solo el administrador la
// guarda como la oficial. El cálculo vive en proyeccion-calculo.js.
// Fase 2 (paso A): revisa los insumos de los lotes ya cortados con la misma cuenta de Lotes por integrar;
// un lote al que le faltan insumos no empieza a coserse hasta que llega su orden de compra.
// Todavía NO revisa la tela ni los pedidos sin cortar (paso B).
import React, { useState, useEffect, useMemo } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { AREAS_PROYECCION, simularProyeccion, capacidadSugerida, sumarDias } from "./proyeccion-calculo";
import { cargarLotesPorIntegrar, asignarInventario, clasificarUbicacion } from "./lotes-por-integrar";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE",
  blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => "$" + fmt(n);
const millones = (n) => {
  const v = Number(n) || 0;
  return Math.abs(v) >= 1e6 ? `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : money(v);
};
const normRef = (r) => String(r || "").trim().toUpperCase().replace(/-/g, "");
const hoyBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const fmtFecha = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const fmtFechaLarga = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const NOMBRE_AREA = { corte: "Corte", confeccion: "Confección", terminacion: "Terminación", bpt: "Ya en BPT" };

const ESTADOS = {
  atrasado: { txt: "Llega tarde", fg: C.red, bg: C.redBg },
  justo: { txt: "Justo", fg: C.amber, bg: C.amberBg },
  ok: { txt: "A tiempo", fg: C.green, bg: C.greenBg },
  sin_fecha: { txt: "Sin fecha de entrega", fg: C.slate, bg: C.canvas },
  sin_horizonte: { txt: "Fuera del horizonte", fg: C.red, bg: C.redBg },
};

function Boton({ children, onClick, disabled, variante = "sec", title }) {
  const principal = variante === "pri";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
        border: principal ? "none" : `1.5px solid ${C.border}`,
        background: principal ? C.ink : C.white, color: principal ? C.white : C.ink,
      }}
    >
      {children}
    </button>
  );
}
function Chip({ activo, onClick, children }) {
  return (
    <span
      onClick={onClick}
      style={{
        padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.slate,
      }}
    >
      {children}
    </span>
  );
}
function Tile({ titulo, valor, sub, color }) {
  return (
    <div style={{ flex: "1 1 200px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || C.ink, marginTop: 4 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 12, color: C.slate, marginTop: 2, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}
// Color de la celda de carga: qué tan llena está el área esa semana.
function colorCarga(carga, cola) {
  if (carga >= 0.95 && cola > 0.5) return { bg: "#F9D9D4", fg: "#9A3A2D" }; // saturada y todavía se acumula
  if (carga >= 0.95) return { bg: "#FBE8C8", fg: "#8A5A0C" };
  if (carga >= 0.6) return { bg: "#E3F0E8", fg: "#1E7A52" };
  if (carga > 0) return { bg: "#EEF3F0", fg: "#4B7F63" };
  return { bg: "transparent", fg: C.slate };
}

const TEXTO_MAT = { ok: "Completo", justo: "Completo (justo)", oc_ok: "Falta · llega OC", oc_tarde: "Falta · OC llega tarde", comprar: "Falta · sin OC", sin_ficha: "Sin ficha en Busint", sin_prendas: "Prendas por confirmar" };
const COLOR_MAT = {
  ok: { fg: "#1E7A52", bg: "#E3F5EC" }, justo: { fg: "#1E7A52", bg: "#E3F5EC" },
  oc_ok: { fg: "#2D5A8C", bg: "#E6EEF8" }, oc_tarde: { fg: "#A8660B", bg: "#FDF1DA" },
  comprar: { fg: "#9A3A2D", bg: "#FBE9E6" }, sin_ficha: { fg: C.slate, bg: C.canvas }, sin_prendas: { fg: C.slate, bg: C.canvas },
  integrado: { fg: "#1E7A52", bg: "#E3F5EC" }, sin_revisar: { fg: C.slate, bg: C.canvas },
};
// Con lo que devuelve Lotes por integrar arma, por lote ya cortado, qué insumos faltan y desde cuándo hay material.
export function armarMateriales(datos, dueDeLote, hoy, diasSinOC) {
  const base = (datos?.lotes || [])
    .map((l) => ({ ...l, ubicTipo: clasificarUbicacion(l.ubic ?? l.ub).tipo, despacho: dueDeLote.get(String(l.lote)) || null }))
    .filter((l) => l.ubicTipo !== "fuera");
  const res = asignarInventario({ lotes: base, fichas: datos?.fichas || {}, oc: datos?.oc || {} });
  const mapa = new Map();
  const sinOCISO = sumarDias(hoy, Math.max(0, Number(diasSinOC) || 0));
  res.forEach((l) => {
    const faltan = (l.insumos || []).filter((i) => i.estado === "comprar" || i.estado === "oc_ok" || i.estado === "oc_tarde");
    let disponibleISO = null;
    let sinOC = false;
    faltan.forEach((i) => {
      let f = hoy;
      if (i.comprar > 0.005) { sinOC = true; f = sinOCISO; }
      (i.oc || []).forEach((o) => { const ff = String(o.ff || "").slice(0, 10); if (ff > f) f = ff; });
      if (f > (disponibleISO || "")) disponibleISO = f;
    });
    const nombres = faltan.map((i) => i.insumo);
    mapa.set(String(l.lote), {
      estado: l.estado,
      pendientes: l.pendientes,
      disponibleISO: faltan.length ? disponibleISO : null,
      sinOC,
      faltan: nombres,
      texto: faltan.length
        ? `${nombres.slice(0, 2).join(", ")}${nombres.length > 2 ? ` y ${nombres.length - 2} más` : ""}`
        : "",
    });
  });
  return mapa;
}

export default function ProyeccionAreasView({ db, functionsClient, currentUser, lotes, fechaCarga, entradas }) {
  const esAdmin = !!currentUser?.isAdmin;
  const hoy = useMemo(hoyBogota, []);
  const [semanas, setSemanas] = useState(8);
  const [sabado, setSabado] = useState(false);
  const [colchon, setColchon] = useState(0);
  const [cfg, setCfg] = useState(null); // guardada en Firestore
  const [cfgCargada, setCfgCargada] = useState(false);
  const [capEdit, setCapEdit] = useState(null); // { corte, confeccion, terminacion } en texto
  const [precios, setPrecios] = useState(null);
  const [errorPrecios, setErrorPrecios] = useState("");
  const [incluirSinCortar, setIncluirSinCortar] = useState(false);
  const [sinCortar, setSinCortar] = useState(null);
  const [cargandoSC, setCargandoSC] = useState(false);
  const [errorSC, setErrorSC] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState("riesgo"); // riesgo | todos | justo
  const [busqueda, setBusqueda] = useState("");
  const [verTodo, setVerTodo] = useState(false);
  const [revisarMat, setRevisarMat] = useState(false);
  const [datosMat, setDatosMat] = useState(null);
  const [cargandoMat, setCargandoMat] = useState(false);
  const [errorMat, setErrorMat] = useState("");
  const [diasSinOC, setDiasSinOC] = useState(15);

  // Capacidad guardada
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "proyeccion_config", "main"),
      (snap) => { setCfg(snap.exists() ? snap.data() : null); setCfgCargada(true); },
      () => setCfgCargada(true)
    );
    return () => unsub();
  }, [db]);

  // Precios matriculados (rápido)
  useEffect(() => {
    let vivo = true;
    httpsCallable(functionsClient, "getPreciosMatriculadosBusint", { timeout: 120000 })()
      .then((r) => { if (vivo) setPrecios(r.data?.precios || {}); })
      .catch((e) => { if (vivo) { setPrecios({}); setErrorPrecios(e?.message || "No se pudieron traer los precios de Busint."); } });
    return () => { vivo = false; };
  }, [functionsClient]);

  // Lo que falta por cortar (lento, ~1 min): solo si lo piden
  async function cargarSinCortar() {
    setCargandoSC(true);
    setErrorSC("");
    try {
      const resp = await httpsCallable(functionsClient, "getDisponibleParaDespachar", { timeout: 540000 })({});
      const items = [];
      (resp.data?.porCliente || []).forEach((g) => (g.filas || []).forEach((f) => {
        if (f.esPreorden || !(Number(f.etSinCortar) > 0)) return;
        items.push({ cliente: g.cliente, ref: f.ref, numPed: f.numPed, unid: Number(f.etSinCortar) || 0, fechaDespacho: f.fechaDespacho, precio: Number(f.precio) || 0 });
      }));
      setSinCortar(items);
    } catch (e) {
      setErrorSC(e?.message || "No se pudo calcular lo que falta por cortar.");
      setIncluirSinCortar(false);
    }
    setCargandoSC(false);
  }
  useEffect(() => {
    if (incluirSinCortar && sinCortar === null && !cargandoSC) cargarSinCortar();
  }, [incluirSinCortar]);
  // Insumos de los lotes ya cortados (misma carga que Lotes por integrar, con caché)
  useEffect(() => {
    if (!revisarMat || datosMat || cargandoMat) return;
    setCargandoMat(true);
    setErrorMat("");
    cargarLotesPorIntegrar(functionsClient)
      .then((d) => setDatosMat(d))
      .catch((e) => { setErrorMat(e?.message || "No se pudieron revisar los insumos."); setRevisarMat(false); })
      .finally(() => setCargandoMat(false));
  }, [revisarMat]);

  const diasLab = sabado ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const sugerida = useMemo(() => capacidadSugerida(entradas, hoy, diasLab), [entradas, hoy, sabado]);
  const capGuardada = useMemo(() => {
    const g = cfg?.capacidad || {};
    const dflt = sugerida;
    return {
      corte: Number(g.corte) > 0 ? Number(g.corte) : dflt,
      confeccion: Number(g.confeccion) > 0 ? Number(g.confeccion) : dflt,
      terminacion: Number(g.terminacion) > 0 ? Number(g.terminacion) : dflt,
    };
  }, [cfg, sugerida]);
  // Al cargar la configuración se parte de la guardada; después el usuario la mueve a su gusto.
  useEffect(() => {
    if (!cfgCargada) return;
    setCapEdit((prev) => prev || {
      corte: String(capGuardada.corte), confeccion: String(capGuardada.confeccion), terminacion: String(capGuardada.terminacion),
    });
    if (cfg) {
      if (typeof cfg.sabado === "boolean") setSabado(cfg.sabado);
      if (Number.isFinite(Number(cfg.colchonDias))) setColchon(Number(cfg.colchonDias));
    }
  }, [cfgCargada]);

  const capacidad = useMemo(() => {
    const e = capEdit || {};
    return {
      corte: Number(e.corte) || 0,
      confeccion: Number(e.confeccion) || 0,
      terminacion: Number(e.terminacion) || 0,
    };
  }, [capEdit]);
  const hayCambiosCap = capEdit && AREAS_PROYECCION.some((a) => (Number(capEdit[a.id]) || 0) !== capGuardada[a.id]);

  const precioDe = useMemo(() => {
    const p = precios || {};
    return (ref) => Number(p[normRef(ref)]) || 0;
  }, [precios]);

  const materiales = useMemo(() => {
    if (!revisarMat || !datosMat) return null;
    const due = new Map();
    (lotes || []).forEach((l) => due.set(String(l.numLote), String(l.fechaEntregaPedidoISO || l.fechaEntregaConfISO || "").slice(0, 10) || null));
    return armarMateriales(datosMat, due, hoy, diasSinOC);
  }, [revisarMat, datosMat, lotes, hoy, diasSinOC]);

  const sim = useMemo(() => {
    if (!capEdit || precios === null) return null;
    return simularProyeccion({
      lotes: lotes || [],
      sinCortar: incluirSinCortar && Array.isArray(sinCortar) ? sinCortar : [],
      precioDe, capacidad, hoyISO: hoy, sabado, colchonDias: colchon, semanas, materiales,
    });
  }, [lotes, sinCortar, incluirSinCortar, precioDe, capacidad, hoy, sabado, colchon, semanas, capEdit, precios, materiales]);

  function ajustar(porcentaje) {
    setCapEdit((e) => {
      const n = {};
      AREAS_PROYECCION.forEach((a) => { n[a.id] = String(Math.max(0, Math.round((Number(e[a.id]) || 0) * (1 + porcentaje / 100)))); });
      return n;
    });
  }
  async function guardarCapacidad() {
    setGuardando(true);
    setAviso(null);
    try {
      await setDoc(doc(db, "proyeccion_config", "main"), {
        capacidad, sabado, colchonDias: colchon,
        actualizadoPor: currentUser?.name || currentUser?.username || "",
        actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setAviso({ ok: true, texto: "Capacidad guardada como la oficial." });
    } catch (e) {
      setAviso({ ok: false, texto: e?.message || "No se pudo guardar." });
    }
    setGuardando(false);
  }

  function estadoMaterial(l) {
    if (!revisarMat) return null;
    if (l.tipo !== "lote") return { clave: "sin_revisar", texto: "Falta revisar tela (paso B)" };
    if (!materiales) return { clave: "sin_revisar", texto: cargandoMat ? "Revisando…" : "Sin revisar" };
    const m = materiales.get(String(l.numLote));
    if (!m) return { clave: "integrado", texto: "Ya integrado" };
    const base = TEXTO_MAT[m.estado] || "Sin dato";
    if (m.estado === "oc_ok" || m.estado === "oc_tarde") return { clave: m.estado, texto: `${m.texto ? m.texto + " · " : ""}OC llega ${fmtFecha(m.disponibleISO)}${m.estado === "oc_tarde" ? " (tarde)" : ""}` };
    if (m.estado === "comprar") return { clave: "comprar", texto: `${m.texto ? m.texto + " · " : ""}sin OC` };
    return { clave: m.estado, texto: base };
  }
  const filasLotes = useMemo(() => {
    if (!sim) return [];
    const q = busqueda.trim().toLowerCase();
    return sim.lotes
      .filter((l) => (filtro === "riesgo" ? l.estado === "atrasado" || l.estado === "sin_horizonte" : filtro === "justo" ? l.estado === "justo" : filtro === "material" ? l.bloqueadas > 0 : true))
      .filter((l) => !q || [l.numLote, l.numPedido, l.ref, l.cliente, l.planta].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.atraso ?? 9999) - (a.atraso ?? 9999) || b.valor - a.valor);
  }, [sim, filtro, busqueda]);

  async function exportarExcel() {
    if (!sim) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sim.areas.map((a) => ({
      Área: a.label, "Capacidad (und/día)": a.capDia, "Pendiente hoy (und)": Math.round(a.colaHoy), "Pendiente hoy ($)": Math.round(a.valorHoy),
      "Trabajo que pasa por el área (und)": Math.round(a.trabajoTotal), "Días laborales de trabajo": a.diasTrabajo === null ? "SIN CAPACIDAD" : Math.round(a.diasTrabajo * 10) / 10,
    }))), "Resumen por área");
    const filasSem = [];
    sim.semanas.forEach((s) => AREAS_PROYECCION.forEach((a) => {
      const x = s.areas[a.id];
      filasSem.push({
        "Semana (lunes)": s.lunes, Área: a.label, "Entra (und)": Math.round(x.entra), "Procesa (und)": Math.round(x.sale), "Procesa ($)": Math.round(x.valorSale),
        "Capacidad de la semana (und)": Math.round(x.capSemana), "Carga %": Math.round(x.carga * 100), "Cola al cierre (und)": Math.round(x.cola), "Cola al cierre ($)": Math.round(x.colaValor),
      });
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasSem), "Semanas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sim.lotes.map((l) => ({
      Tipo: l.tipo === "lote" ? "Lote" : "Pedido sin cortar", Lote: l.numLote, Pedido: l.numPedido, Referencia: l.ref, Cliente: l.cliente, "Unidades": Math.round(l.unidades),
      "Valor ($)": Math.round(l.valor), "Dónde está": NOMBRE_AREA[l.dondeEsta] || "", ...(revisarMat ? { Materiales: estadoMaterial(l)?.texto || "", "Unidades esperando material": Math.round(l.bloqueadas || 0), "Material disponible desde": l.materialDesde || "" } : {}), Entrega: l.entrega, "Listo proyectado": l.listoISO || "Fuera del horizonte",
      "Días de atraso": l.atraso === null ? "" : l.atraso, Estado: ESTADOS[l.estado]?.txt || "",
    }))), "Lotes y pedidos");
    XLSX.writeFile(wb, `Proyeccion_por_area_${hoy}.xlsx`);
  }

  const sinLotes = !lotes || lotes.length === 0;
  const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.white, position: "sticky", top: 0 };
  const td = { padding: "7px 10px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Proyección por Área</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate, lineHeight: 1.5, maxWidth: 820 }}>
          Cuánto trabajo le llega a cada área de Corte a Terminación, cuánto alcanza a sacar por semana con su capacidad y qué pedidos llegarían tarde.
          Parte de lo que hay hoy en el tubo productivo{fechaCarga ? ` (carga de Busint del ${fmtFechaLarga(String(fechaCarga).slice(0, 10))})` : ""}, valorizado con el precio matriculado.
          Todavía no mira si hay tela e insumos.
        </p>
      </div>

      {sinLotes ? (
        <div style={{ padding: 20, background: C.amberBg, border: `1px solid ${C.border}`, borderRadius: 12, color: C.amber, fontSize: 14, fontWeight: 600 }}>
          No hay una carga de lotes de Busint. Entra a Informes y pulsa «Actualizar desde Busint» para traerla.
        </div>
      ) : null}

      {/* Controles */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Ver</span>
        {[4, 8, 12].map((n) => <Chip key={n} activo={semanas === n} onClick={() => setSemanas(n)}>{n} semanas</Chip>)}
        <Chip activo={sabado} onClick={() => setSabado((v) => !v)}>{sabado ? "✓ " : ""}Se trabaja el sábado</Chip>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginLeft: 6 }}>Colchón entre áreas</span>
        <select value={colchon} onChange={(e) => setColchon(Number(e.target.value))} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n === 0 ? "Sin colchón" : `${n} día${n > 1 ? "s" : ""}`}</option>)}
        </select>
        <Chip activo={incluirSinCortar} onClick={() => setIncluirSinCortar((v) => !v)}>
          {cargandoSC ? "Calculando lo que falta cortar… (~1 min)" : `${incluirSinCortar ? "✓ " : ""}Incluir lo que falta por cortar`}
        </Chip>
        <Chip activo={revisarMat} onClick={() => setRevisarMat((v) => !v)}>
          {cargandoMat ? "Revisando insumos…" : `${revisarMat ? "✓ " : ""}Revisar insumos de lotes cortados`}
        </Chip>
        {revisarMat ? (
          <>
            <span style={{ fontSize: 12, color: C.slate }}>Si un insumo no tiene orden de compra, suponer entrega en</span>
            <select value={diasSinOC} onChange={(e) => setDiasSinOC(Number(e.target.value))} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }}>
              {[7, 15, 21, 30].map((n) => <option key={n} value={n}>{n} días</option>)}
            </select>
          </>
        ) : null}
        <div style={{ marginLeft: "auto" }}>
          <Boton onClick={exportarExcel} disabled={!sim}>⬇ Excel</Boton>
        </div>
      </div>
      {errorMat ? <div style={{ marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>⚠ {errorMat}</div> : null}
      {errorSC ? <div style={{ marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>⚠ {errorSC}</div> : null}
      {errorPrecios ? <div style={{ marginBottom: 12, fontSize: 13, color: C.red, fontWeight: 600 }}>⚠ {errorPrecios} Los valores en pesos saldrán en $0.</div> : null}

      {/* Capacidad */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>Capacidad de cada área (unidades por día laboral)</div>
          <div style={{ fontSize: 12, color: C.slate }}>
            Sugerida por lo que de verdad entró a planta en las últimas 8 semanas: <b>{fmt(sugerida)}</b> und/día. Corte no tiene dato propio: ajústala.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {AREAS_PROYECCION.map((a) => (
            <label key={a.id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: C.slate }}>
              {a.label}
              <input
                type="number" min="0" value={capEdit ? capEdit[a.id] : ""}
                onChange={(e) => setCapEdit((prev) => ({ ...(prev || {}), [a.id]: e.target.value }))}
                style={{ width: 130, padding: "9px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 700, color: C.ink, fontFamily: "inherit" }}
              />
            </label>
          ))}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Boton onClick={() => ajustar(-10)}>−10%</Boton>
            <Boton onClick={() => ajustar(10)}>+10%</Boton>
            <Boton onClick={() => ajustar(20)}>+20%</Boton>
            {hayCambiosCap ? (
              <Boton onClick={() => setCapEdit({ corte: String(capGuardada.corte), confeccion: String(capGuardada.confeccion), terminacion: String(capGuardada.terminacion) })}>Volver a la guardada</Boton>
            ) : null}
            {esAdmin ? (
              <Boton variante="pri" onClick={guardarCapacidad} disabled={guardando} title="Queda como la capacidad oficial para todos">
                {guardando ? "Guardando…" : "Guardar como oficial"}
              </Boton>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: 12, color: hayCambiosCap ? C.amber : C.slate, marginTop: 8, fontWeight: hayCambiosCap ? 700 : 400 }}>
          {hayCambiosCap ? "Estás viendo un escenario: lo que cambies aquí no afecta a nadie hasta que un administrador lo guarde." : cfg?.actualizadoEn ? `Capacidad oficial guardada por ${cfg.actualizadoPor || "un administrador"} el ${fmtFechaLarga(String(cfg.actualizadoEn).slice(0, 10))}.` : "Todavía no hay una capacidad oficial guardada: se está usando la sugerida."}
        </div>
        {aviso ? <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: aviso.ok ? C.green : C.red }}>{aviso.ok ? "✓ " : "⚠ "}{aviso.texto}</div> : null}
        {sim && sim.sinCapacidad.length ? (
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: C.red }}>
            ⚠ {sim.sinCapacidad.map((id) => NOMBRE_AREA[id]).join(", ")} tiene trabajo pero capacidad 0: ese trabajo nunca sale en la proyección.
          </div>
        ) : null}
      </div>

      {!sim ? (
        <div style={{ padding: 30, textAlign: "center", color: C.slate }}>Calculando la proyección…</div>
      ) : (
        <>
          {/* Resumen */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Tile
              titulo="Trabajo pendiente"
              valor={`${fmt(sim.areas.reduce((s, a) => s + a.colaHoy, 0))} und`}
              sub={`${millones(sim.areas.reduce((s, a) => s + a.valorHoy, 0))} · ya en BPT: ${fmt(sim.listoHoy)} und`}
            />
            <Tile
              titulo="Cuello de botella"
              valor={sim.cuello ? sim.cuello.label : "—"}
              color={sim.cuello ? C.red : C.slate}
              sub={sim.cuello ? `${fmt(sim.cuello.trabajoTotal)} und por pasar: ${(Math.round(sim.cuello.semanasTrabajo * 10) / 10).toLocaleString("es-CO")} semanas de trabajo a ${fmt(sim.cuello.capDia)}/día` : "Falta definir capacidad."}
            />
            <Tile
              titulo="Llegarían tarde"
              valor={`${sim.enRiesgo.cantidad} ${sim.enRiesgo.cantidad === 1 ? "lote/pedido" : "lotes/pedidos"}`}
              color={sim.enRiesgo.cantidad ? C.red : C.green}
              sub={`${fmt(sim.enRiesgo.unidades)} und · ${millones(sim.enRiesgo.valor)} en juego`}
            />
            {materiales ? (
              <Tile
                titulo="Esperan material"
                valor={`${sim.esperanMaterial.lotes} ${sim.esperanMaterial.lotes === 1 ? "lote" : "lotes"} · ${fmt(sim.esperanMaterial.unidades)} und`}
                color={sim.esperanMaterial.lotes ? C.amber : C.green}
                sub={`${millones(sim.esperanMaterial.valor)} detenidos · ${sim.esperanMaterial.sinOC} sin orden de compra`}
              />
            ) : null}
            <Tile
              titulo="Todo listo hacia el"
              valor={(() => {
                const fin = sim.lotes.filter((l) => l.listoISO).map((l) => l.listoISO).sort().pop();
                const fuera = sim.lotes.some((l) => l.sinHorizonte);
                return fuera ? "Más allá del horizonte" : fin ? fmtFechaLarga(fin) : "—";
              })()}
              sub="Con la capacidad de arriba, sin imprevistos"
            />
          </div>
          {sim.sinPrecioUnid > 0 ? (
            <div style={{ marginBottom: 12, fontSize: 12, color: C.amber, fontWeight: 600 }}>
              {fmt(sim.sinPrecioUnid)} unidades no tienen precio matriculado en Busint: cuentan en unidades pero valen $0.
            </div>
          ) : null}

          {/* Matriz semana × área */}
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, margin: "6px 0 8px" }}>Semana a semana</div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left", left: 0, zIndex: 2 }}>Área</th>
                  <th style={{ ...th, textAlign: "left" }}>Medida</th>
                  <th style={th}>Hoy</th>
                  {sim.semanas.map((s) => <th key={s.lunes} style={th}>{`Sem ${fmtFecha(s.lunes)}`}</th>)}
                </tr>
              </thead>
              <tbody>
                {AREAS_PROYECCION.map((a) => {
                  const resumen = sim.areas.find((x) => x.id === a.id);
                  const medidas = [
                    ["Procesa (und)", (x) => fmt(x.sale)],
                    ["Procesa ($)", (x) => millones(x.valorSale)],
                    ["Carga", (x) => (x.capSemana > 0 ? `${Math.round(x.carga * 100)}%` : "—"), true],
                    ["Se acumula (und)", (x) => (x.cola > 0.5 ? fmt(x.cola) : "—")],
                    ...(a.id === "confeccion" && materiales ? [["Esperando material (und)", null, false, true]] : []),
                  ];
                  return medidas.map(([nombre, f, esCarga, esEspera], i) => (
                    <tr key={`${a.id}-${nombre}`}>
                      {i === 0 ? (
                        <td rowSpan={medidas.length} style={{ ...td, textAlign: "left", fontWeight: 800, verticalAlign: "top", background: C.canvas, borderRight: `1px solid ${C.border}` }}>
                          {a.label}
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.slate }}>{fmt(capacidad[a.id])} und/día</div>
                        </td>
                      ) : null}
                      <td style={{ ...td, textAlign: "left", color: esEspera ? C.amber : C.slate, fontSize: 12, fontWeight: esEspera ? 800 : 400 }}>{nombre}</td>
                      <td style={{ ...td, color: esEspera ? C.amber : C.slate, fontWeight: esEspera ? 800 : 400 }}>{esEspera ? (sim.esperandoHoy > 0.5 ? fmt(sim.esperandoHoy) : "—") : i === 0 ? fmt(resumen.colaHoy) : i === 1 ? millones(resumen.valorHoy) : ""}</td>
                      {sim.semanas.map((s) => {
                        if (esEspera) return <td key={s.lunes} style={{ ...td, color: C.amber, fontWeight: 800 }}>{s.esperando > 0.5 ? fmt(s.esperando) : "—"}</td>;
                        const x = s.areas[a.id];
                        const col = esCarga ? colorCarga(x.carga, x.cola) : null;
                        return (
                          <td key={s.lunes} style={{ ...td, fontWeight: esCarga ? 800 : 500, background: col ? col.bg : "transparent", color: col ? col.fg : C.ink }}>
                            {f(x)}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })}
                <tr>
                  <td style={{ ...td, textAlign: "left", fontWeight: 800, background: C.greenBg, color: C.green }} colSpan={2}>Sale terminado (und)</td>
                  <td style={{ ...td, background: C.greenBg, color: C.green }}>{fmt(sim.listoHoy)}</td>
                  {sim.semanas.map((s) => <td key={s.lunes} style={{ ...td, background: C.greenBg, color: C.green, fontWeight: 800 }}>{fmt(s.listo)}</td>)}
                </tr>
                <tr>
                  <td style={{ ...td, textAlign: "left", fontWeight: 800, background: C.greenBg, color: C.green }} colSpan={2}>Sale terminado ($)</td>
                  <td style={{ ...td, background: C.greenBg, color: C.green }}>{millones(sim.listoHoyValor)}</td>
                  {sim.semanas.map((s) => <td key={s.lunes} style={{ ...td, background: C.greenBg, color: C.green, fontWeight: 800 }}>{millones(s.listoValor)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 18, lineHeight: 1.6 }}>
            La columna «Hoy» es lo que cada área tiene pendiente ahora. Carga = lo que procesa ÷ lo que podría procesar esa semana: en rojo, el área va llena y todavía se le acumula trabajo.
            La semana de hoy cuenta solo los días que faltan. Cada área atiende primero lo que tiene la entrega más cercana. «Sale terminado» es lo que termina Terminación en la semana (lo que ya estaba en BPT va en «Hoy»).
          </div>

          {/* Lotes y pedidos */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>Lotes y pedidos</div>
            <Chip activo={filtro === "riesgo"} onClick={() => setFiltro("riesgo")}>Llegarían tarde</Chip>
            <Chip activo={filtro === "justo"} onClick={() => setFiltro("justo")}>Justos</Chip>
            {revisarMat ? <Chip activo={filtro === "material"} onClick={() => setFiltro("material")}>Esperan material</Chip> : null}
            <Chip activo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos</Chip>
            <input
              value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍  Lote, pedido, referencia, cliente…"
              style={{ flex: "1 1 240px", maxWidth: 360, padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }}
            />
            <span style={{ fontSize: 12, color: C.slate }}>{filasLotes.length} {filasLotes.length === 1 ? "fila" : "filas"}</span>
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxHeight: "60vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Lote / pedido</th>
                  <th style={{ ...th, textAlign: "left" }}>Referencia</th>
                  <th style={{ ...th, textAlign: "left" }}>Cliente</th>
                  <th style={th}>Und</th>
                  <th style={th}>Valor</th>
                  <th style={{ ...th, textAlign: "left" }}>Dónde está</th>
                  {revisarMat ? <th style={{ ...th, textAlign: "left" }}>Materiales</th> : null}
                  <th style={th}>Entrega</th>
                  <th style={th}>Listo proyectado</th>
                  <th style={th}>Atraso</th>
                  <th style={{ ...th, textAlign: "left" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {(verTodo ? filasLotes : filasLotes.slice(0, 150)).map((l) => {
                  const e = ESTADOS[l.estado] || ESTADOS.sin_fecha;
                  return (
                    <tr key={l.key}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>
                        {l.tipo === "lote" ? `Lote ${l.numLote}` : "Sin cortar"}
                        <span style={{ fontWeight: 500, color: C.slate }}>{l.numPedido ? `  · Ped. ${l.numPedido}` : ""}</span>
                      </td>
                      <td style={{ ...td, textAlign: "left" }}>{l.ref || "—"}</td>
                      <td style={{ ...td, textAlign: "left", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{l.cliente}</td>
                      <td style={td}>{fmt(l.unidades)}</td>
                      <td style={td}>{l.valor > 0 ? millones(l.valor) : "—"}</td>
                      <td style={{ ...td, textAlign: "left" }}>{NOMBRE_AREA[l.dondeEsta] || "—"}</td>
                      {revisarMat ? (() => {
                        const em = estadoMaterial(l);
                        const cm = COLOR_MAT[em.clave] || COLOR_MAT.sin_revisar;
                        return (
                          <td style={{ ...td, textAlign: "left" }}>
                            <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800, color: cm.fg, background: cm.bg }}>{em.texto}</span>
                          </td>
                        );
                      })() : null}
                      <td style={td}>{l.entrega ? fmtFechaLarga(l.entrega) : "—"}</td>
                      <td style={td}>{l.listoISO ? fmtFechaLarga(l.listoISO) : "Fuera del horizonte"}</td>
                      <td style={{ ...td, fontWeight: 800, color: l.atraso > 0 ? C.red : C.slate }}>{l.atraso === null ? "—" : l.atraso > 0 ? `+${l.atraso} d` : `${l.atraso} d`}</td>
                      <td style={{ ...td, textAlign: "left" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800, color: e.fg, background: e.bg }}>{e.txt}</span>
                      </td>
                    </tr>
                  );
                })}
                {!filasLotes.length ? (
                  <tr><td colSpan={11} style={{ ...td, textAlign: "center", color: C.slate, padding: 24 }}>No hay filas con este filtro.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {filasLotes.length > 150 && !verTodo ? (
            <div style={{ marginTop: 8 }}><Boton onClick={() => setVerTodo(true)}>Ver las {filasLotes.length} filas</Boton></div>
          ) : null}
          <div style={{ fontSize: 11, color: C.slate, marginTop: 10, lineHeight: 1.6 }}>
            Atraso en días de calendario contra la fecha de entrega del pedido (si no la tiene, la comprometida con el taller). «Justo» = termina con 2 días o menos de holgura.
            Confección junta planta propia y talleres externos como una sola capacidad. Con «Revisar insumos» se usa la misma cuenta de Lotes por integrar (inventario y órdenes de compra repartidos lote por lote); la tela y los pedidos sin cortar se revisan en el paso B.
          </div>
        </>
      )}
    </div>
  );
}
