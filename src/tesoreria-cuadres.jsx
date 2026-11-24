// ─── MI DÍA DE TESORERÍA: lo que no cuadra ───────────────────────────────────
// (2026-11-24, a pedido de Fredy) Pieza de «Mi Día» para Tesorería: muestra solo lo que tiene diferencia en
//   · Cuentas por pagar (Busint contra TNS, tarjeta `tes_cxp`),
//   · Cartera (Saldos de clientes, Busint contra TNS, tarjeta `tes_cartera`),
//   · Auditoría Busint vs Nómina (resumen de áreas con diferencia; sale si tiene marcada `auditoria_nomina`).
// Usa los MISMOS cálculos de Contabilidad (calcularCuadreCxp y calcularFilasSaldosClientes), así que las cifras son las de esas
// pantallas. Solo lectura. Al abrir consulta Busint y TNS en vivo (botón «Actualizar» para repetir). No guarda nada.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { calcularCuadreCxp, calcularFilasSaldosClientes, mezclarCarteraTns, TOLERANCIA_SALDO } from "./modulo-contabilidad";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const fmt = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(Number(n) || 0)).toLocaleString("es-CO")}`;
const normArea = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

// Filas de Cuentas por pagar que no cuadran: «Revisar» (existe en los dos y difiere) y «Solo Busint» (sin tercero en TNS).
// Los talleres/personas que se marcaron como «no se registran en TNS» no cuentan.
export function filasCxpPorRevisar(todas) {
  return (todas || [])
    .filter((r) => r.estado === "revisar" || r.estado === "solobusint")
    .map((r) => ({ id: r.clave, nombre: r.nombre, estado: r.estado === "revisar" ? "Revisar" : "Solo Busint", tns: r.estado === "solobusint" ? null : r.tns, busint: r.busint, dif: r.tns - r.busint }))
    .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
}
// Filas de Cartera que no cuadran, con las mismas reglas del estado de Saldos de clientes.
export function filasCarteraPorRevisar(filas) {
  const cero = (n) => Math.abs(Number(n) || 0) < TOLERANCIA_SALDO;
  const out = [];
  let sinClasificar = 0;
  (filas || []).forEach((f) => {
    const bus = Number(f.busint) || 0;
    const tyRaw = f.tnsPorEmpresa?.yanko;
    const hayTy = tyRaw !== null && tyRaw !== undefined;
    const ty = Number(tyRaw) || 0;
    const tin = Number(f.tnsPorEmpresa?.indutex) || 0;
    if (f.codigo === null || f.codigo === undefined) {
      if (f.donde === "tns") return;
      if (cero(ty + tin)) return;
      out.push({ id: f.clave, nombre: f.nombre, estado: "Solo TNS sin pareja", busint: null, tns: ty + tin, dif: ty + tin });
      return;
    }
    if (f.donde === "tns") {
      if (!cero(bus)) out.push({ id: f.clave, nombre: f.nombre, estado: "Busint debería estar en cero", busint: bus, tns: hayTy ? ty : null, dif: bus });
    } else if (f.donde === "busint") {
      if (hayTy && !cero(ty)) out.push({ id: f.clave, nombre: f.nombre, estado: "Tiene saldo en TNS Yanko", busint: bus, tns: ty, dif: ty });
    } else if (f.donde === "ambos") {
      if (hayTy) {
        if (!cero(bus - ty)) out.push({ id: f.clave, nombre: f.nombre, estado: f.traslado ? "Por revisar · incluye traslado externo" : "Por revisar", busint: bus, tns: ty, dif: ty - bus });
      } else if (!cero(bus)) {
        out.push({ id: f.clave, nombre: f.nombre, estado: "Por revisar (sin saldo en TNS)", busint: bus, tns: null, dif: null });
      }
    } else if (f.magnitud >= TOLERANCIA_SALDO) {
      sinClasificar += 1;
    }
  });
  out.sort((a, b) => Math.abs(b.dif ?? b.busint ?? 0) - Math.abs(a.dif ?? a.busint ?? 0));
  return { filas: out, sinClasificar };
}

function useCuadresTesoreria(db, functionsClient, { cxp, cartera }) {
  const [cortes, setCortes] = useState([]);
  const [enlacesDoc, setEnlacesDoc] = useState({ enlaces: {}, sinTns: {} });
  const [nombresProv, setNombresProv] = useState({});
  const [tnsCartera, setTnsCartera] = useState({});
  const [saldosConfig, setSaldosConfig] = useState({ donde: {}, enlaces: {} });
  const [nombresCli, setNombresCli] = useState({});
  const [cxpTns, setCxpTns] = useState(null);
  const [busint, setBusint] = useState(null);
  const [traslados, setTraslados] = useState(null);
  const [cargando, setCargando] = useState({ cxp: false, cartera: false });
  const [errores, setErrores] = useState({ cxp: "", cartera: "" });
  const [actualizadoEn, setActualizadoEn] = useState(null);

  useEffect(() => {
    const subs = [];
    if (cxp) {
      subs.push(onSnapshot(collection(db, "contabilidad_cxp_cortes"), (s) => setCortes(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}));
      subs.push(onSnapshot(doc(db, "contabilidad_cxp_enlaces", "main"), (s) => setEnlacesDoc({ enlaces: s.exists() ? s.data()?.enlaces || {} : {}, sinTns: s.exists() ? s.data()?.sinTns || {} : {} }), () => {}));
      subs.push(onSnapshot(collection(db, "contabilidad_cxp_nombres_proveedor"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data()?.nombre || ""; }); setNombresProv(m); }, () => {}));
    }
    if (cartera) {
      subs.push(onSnapshot(collection(db, "contabilidad_saldos_tns"), (s) => setTnsCartera(mezclarCarteraTns(s.docs)), () => {}));
      subs.push(onSnapshot(doc(db, "contabilidad_saldos_config", "main"), (s) => { const d = s.exists() ? s.data() : {}; setSaldosConfig({ donde: d.donde || {}, enlaces: d.enlaces || {} }); }, () => {}));
      subs.push(onSnapshot(collection(db, "contabilidad_nombres_cliente_busint"), (s) => { const m = {}; s.docs.forEach((d) => { const n = String(d.data().nombre || "").trim(); if (n) m[d.id] = n; }); setNombresCli(m); }, () => {}));
    }
    return () => subs.forEach((u) => u());
  }, [db, cxp, cartera]);

  const actualizar = useCallback(async () => {
    const trabajos = [];
    if (cxp) {
      setCargando((c) => ({ ...c, cxp: true }));
      setErrores((e) => ({ ...e, cxp: "" }));
      trabajos.push(
        httpsCallable(functionsClient, "getCuentasPorPagarTNS", { timeout: 300000 })({ empresa: "yanko" })
          .then((r) => setCxpTns(r.data))
          .catch((err) => setErrores((e) => ({ ...e, cxp: err?.message || "No se pudo traer TNS." })))
          .finally(() => setCargando((c) => ({ ...c, cxp: false })))
      );
    }
    if (cartera) {
      setCargando((c) => ({ ...c, cartera: true }));
      setErrores((e) => ({ ...e, cartera: "" }));
      trabajos.push(
        httpsCallable(functionsClient, "getSaldoTrasladosExternosBusint", { timeout: 300000 })({})
          .then((r) => setTraslados(r.data))
          .catch((err) => setTraslados({ error: err?.message || "No se pudo calcular el traslado externo." }))
      );
      trabajos.push(
        httpsCallable(functionsClient, "getResumenCarteraClientesBusintBD", { timeout: 300000 })({})
          .then((r) => setBusint(r.data?.clientes || []))
          .catch((err) => setErrores((e) => ({ ...e, cartera: err?.message || "No se pudo consultar la cartera de Busint." })))
          .finally(() => setCargando((c) => ({ ...c, cartera: false })))
      );
    }
    await Promise.all(trabajos);
    setActualizadoEn(new Date());
  }, [functionsClient, cxp, cartera]);
  useEffect(() => { actualizar(); }, [actualizar]);

  const corte = useMemo(() => {
    const yanko = cortes.filter((c) => c.empresa !== "indutex");
    return [...yanko].sort((a, b) => String(b.creadoEn || b.fechaCorte || "").localeCompare(String(a.creadoEn || a.fechaCorte || "")))[0] || null;
  }, [cortes]);
  const cxpFilas = useMemo(() => {
    if (!cxp || !corte || !cxpTns) return null;
    const proveedoresBusint = (corte.proveedores || []).map((p) => {
      const m = /^Proveedor (\d+)$/.exec(p.nombre || "");
      return { ...p, nombreMostrado: (m && nombresProv[m[1]]) || p.nombre };
    });
    return filasCxpPorRevisar(calcularCuadreCxp({ proveedoresBusint, tnsProveedores: cxpTns.proveedores, enlaces: enlacesDoc.enlaces, sinTns: enlacesDoc.sinTns }));
  }, [cxp, corte, cxpTns, nombresProv, enlacesDoc]);
  const carteraRes = useMemo(() => {
    if (!cartera || !busint) return null;
    const busintN = busint.map((c) => (nombresCli[String(c.codigo)] ? { ...c, nombre: nombresCli[String(c.codigo)] } : c));
    const filas = calcularFilasSaldosClientes({ busintN, tns: tnsCartera, config: saldosConfig, traslados: traslados && !traslados.error ? traslados : null, nombresManual: nombresCli });
    return filasCarteraPorRevisar(filas);
  }, [cartera, busint, tnsCartera, saldosConfig, traslados, nombresCli]);
  return { cxpFilas, carteraRes, corte, cxpTns, cargando, errores, actualizadoEn, actualizar, trasladosError: traslados?.error || "" };
}

function useAuditoriaResumen(db, activo, currentUser) {
  const [hist, setHist] = useState(null);
  useEffect(() => {
    if (!activo) return undefined;
    return onSnapshot(collection(db, "centro_costo_auditoria_busint"), (s) => setHist(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setHist([]));
  }, [db, activo]);
  return useMemo(() => {
    if (!hist) return null;
    const marcadas = !currentUser?.isAdmin && Array.isArray(currentUser?.areasAuditoria) ? currentUser.areasAuditoria.map(normArea).filter(Boolean) : [];
    const ultima = {};
    hist.forEach((h) => { if (!h.area) return; if (marcadas.length && !marcadas.includes(normArea(h.area))) return; if (!ultima[h.area] || String(h.fecha || "") > String(ultima[h.area].fecha || "")) ultima[h.area] = h; });
    const lista = Object.values(ultima);
    return { conDif: lista.filter((h) => (h.totalDiscrepancias || 0) > 0).sort((a, b) => (b.totalDiscrepancias || 0) - (a.totalDiscrepancias || 0)), total: lista.length };
  }, [hist, currentUser]);
}

function Chip({ tono, children }) {
  const m = { r: [C.redBg, C.red], g: [C.greenBg, C.green], a: [C.amberBg, C.amber], b: [C.blueBg, C.blue] }[tono] || [C.canvas, C.slate];
  return <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 20, background: m[0], color: m[1], whiteSpace: "nowrap" }}>{children}</span>;
}
function Tarjeta({ titulo, sub, cargando, onActualizar, children, pie }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{titulo}</div>
          {sub && <div style={{ fontSize: 12, color: C.slate }}>{sub}</div>}
        </div>
        {onActualizar && (
          <button onClick={onActualizar} disabled={cargando} style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: cargando ? "wait" : "pointer", color: C.ink, fontFamily: "inherit" }}>
            {cargando ? "Consultando Busint y TNS…" : "🔄 Actualizar"}
          </button>
        )}
      </div>
      {children}
      {pie && <div style={{ padding: "10px 18px", fontSize: 12, color: C.slate, borderTop: `1px solid ${C.border}` }}>{pie}</div>}
    </div>
  );
}
function TablaDif({ filas, colA, colB }) {
  const th = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: C.slate, textAlign: "right", padding: "9px 14px", fontWeight: 700, borderBottom: `1px solid ${C.border}` };
  const td = { padding: "10px 14px", textAlign: "right", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontVariantNumeric: "tabular-nums" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={{ ...th, textAlign: "left" }}>Nombre</th><th style={th}>Estado</th><th style={th}>{colA}</th><th style={th}>{colB}</th><th style={th}>Diferencia</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td style={{ ...td, textAlign: "left", fontWeight: 800, color: C.ink }}>{f.nombre}</td>
              <td style={td}><Chip tono={f.estado === "Revisar" || f.estado.startsWith("Por revisar") ? "r" : "a"}>{f.estado}</Chip></td>
              <td style={td}>{f.a === null || f.a === undefined ? "—" : fmt(f.a)}</td>
              <td style={td}>{f.b === null || f.b === undefined ? "—" : fmt(f.b)}</td>
              <td style={{ ...td, fontWeight: 800, color: f.dif === null ? C.slate : f.dif < 0 ? C.red : C.amber }}>{f.dif === null ? "—" : fmt(f.dif)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const Todo = ({ children }) => <div style={{ padding: 22, textAlign: "center", color: C.green, fontWeight: 800, background: C.greenBg }}>✓ {children}</div>;
const Aviso = ({ children, tono = "a" }) => <div style={{ padding: "10px 18px", fontSize: 12, fontWeight: 700, background: tono === "r" ? C.redBg : C.amberBg, color: tono === "r" ? C.red : C.amber }}>{children}</div>;

export default function TesoreriaMiDia({ db, marcadas, currentUser }) {
  const functionsClient = useMemo(() => getFunctions(db.app), [db]);
  const cxp = marcadas.includes("tes_cxp");
  const cartera = marcadas.includes("tes_cartera");
  const aud = marcadas.includes("auditoria_nomina");
  const d = useCuadresTesoreria(db, functionsClient, { cxp, cartera });
  const au = useAuditoriaResumen(db, aud, currentUser);
  const tabs = [{ id: "resumen", label: "Resumen" }, ...(cxp ? [{ id: "cxp", label: "💳 Cuentas por pagar" }] : []), ...(cartera ? [{ id: "cartera", label: "📒 Cartera" }] : [])];
  const [tab, setTab] = useState("resumen");
  const nCxp = d.cxpFilas ? d.cxpFilas.length : null;
  const nCar = d.carteraRes ? d.carteraRes.filas.length : null;
  const nAud = au ? au.conDif.length : null;
  const cuenta = (n) => (n === null ? "…" : n > 0 ? n : "✓");
  const color = (n) => (n === null ? C.slate : n > 0 ? C.red : C.green);
  const totalPend = (nCxp || 0) + (nCar || 0) + (nAud || 0);
  const listo = (!cxp || nCxp !== null) && (!cartera || nCar !== null) && (!aud || nAud !== null);
  const hora = d.actualizadoEn ? d.actualizadoEn.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
  const cargandoAlgo = d.cargando.cxp || d.cargando.cartera;

  const sem = (key, titulo, n, valor, sub, ir) => (
    <div key={key} onClick={ir ? () => setTab(ir) : undefined} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", cursor: ir ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: C.slate }}>
        <span>{titulo}</span>
        {n === null ? <Chip tono="b">consultando…</Chip> : n > 0 ? <Chip tono="r">{n} por revisar</Chip> : <Chip tono="g">Cuadra</Chip>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, margin: "4px 0 2px", color: C.ink }}>{valor}</div>
      <div style={{ fontSize: 12, color: C.slate }}>{sub}</div>
    </div>
  );
  // Suma de diferencias sin signo (para que unas no tapen a otras); «Solo Busint» se cuenta por lo que debe según Busint.
  const difCxp = (d.cxpFilas || []).reduce((s, f) => s + Math.abs(f.dif), 0);
  const difCar = ((d.carteraRes && d.carteraRes.filas) || []).reduce((s, f) => s + Math.abs(f.dif ?? f.busint ?? 0), 0);

  return (
    <div>
      {tabs.length > 1 && (
        <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, padding: 4, background: "#EFE9E1", borderRadius: 12, marginBottom: 16 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: tab === t.id ? C.white : "transparent", color: tab === t.id ? C.ink : C.slate, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {t.label}
              {t.id === "cxp" && <span style={{ marginLeft: 6, color: color(nCxp) }}>{cuenta(nCxp)}</span>}
              {t.id === "cartera" && <span style={{ marginLeft: 6, color: color(nCar) }}>{cuenta(nCar)}</span>}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>
        {cargandoAlgo ? "Consultando Busint y TNS en vivo…" : hora ? `Actualizado hoy a las ${hora}` : ""}
        {d.corte && cxp ? ` · Cuentas por pagar de Busint: corte del ${d.corte.fechaCorte}` : ""}
      </div>

      {tab === "resumen" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12, marginBottom: 16 }}>
            {aud && sem("aud", "🔍 Auditoría Busint", nAud, nAud ? `${nAud} área${nAud === 1 ? "" : "s"}` : nAud === 0 ? "Sin diferencias" : "…", nAud ? `${au.conDif.map((h) => h.area).join(", ")} (ver pestaña Auditoría Nómina)` : "todas las áreas cuadran con Nómina", null)}
            {cxp && sem("cxp", "💳 Cuentas por pagar", nCxp, nCxp ? fmt(difCxp) : nCxp === 0 ? "Sin diferencias" : "…", nCxp ? "suma de las diferencias entre TNS y Busint" : "todos los proveedores cuadran", "cxp")}
            {cartera && sem("car", "📒 Cartera", nCar, nCar ? fmt(difCar) : nCar === 0 ? "Sin diferencias" : "…", nCar ? "suma de las diferencias entre Busint y TNS" : "todos los clientes cuadran", "cartera")}
          </div>
          {listo && (totalPend > 0
            ? <Aviso tono="r">Hoy hay {totalPend} cosa{totalPend === 1 ? "" : "s"} por revisar. Toca una tarjeta para ver cuáles.</Aviso>
            : <Todo>Todo cuadra hoy. No hay nada por revisar.</Todo>)}
          {d.errores.cxp && <Aviso>Cuentas por pagar: {d.errores.cxp}</Aviso>}
          {d.errores.cartera && <Aviso>Cartera: {d.errores.cartera}</Aviso>}
        </>
      )}

      {tab === "cxp" && cxp && (
        <Tarjeta titulo="💳 Cuentas por pagar: Busint contra TNS" sub="Industrias Yanko · solo lo que no cuadra" cargando={d.cargando.cxp} onActualizar={d.actualizar} pie="Diferencias menores a $1.000 no se muestran. Para corregir: Contabilidad → Cuentas por pagar → Comparar.">
          {d.errores.cxp ? <Aviso tono="r">{d.errores.cxp}</Aviso> : !d.corte && !d.cargando.cxp && <Aviso>Todavía no hay un corte de Busint guardado. Pide que lo traigan en Contabilidad → Cuentas por pagar.</Aviso>}
          {d.cxpFilas === null ? <div style={{ padding: 22, color: C.slate, fontSize: 13 }}>Consultando…</div>
            : d.cxpFilas.length === 0 ? <Todo>Todos los proveedores cuadran entre Busint y TNS</Todo>
            : <TablaDif filas={d.cxpFilas.map((f) => ({ ...f, a: f.tns, b: f.busint }))} colA="Debe según TNS" colB="Debe según Busint" />}
        </Tarjeta>
      )}

      {tab === "cartera" && cartera && (
        <Tarjeta titulo="📒 Cartera: Busint contra TNS" sub="Clientes · solo lo que no cuadra" cargando={d.cargando.cartera} onActualizar={d.actualizar} pie="Para corregir o clasificar: Contabilidad → Saldos de clientes.">
          {d.errores.cartera && <Aviso tono="r">{d.errores.cartera}</Aviso>}
          {d.trasladosError && <Aviso>No se pudo calcular el traslado externo ({d.trasladosError}); los clientes con traslado pueden salir con diferencia.</Aviso>}
          {d.carteraRes === null ? <div style={{ padding: 22, color: C.slate, fontSize: 13 }}>Consultando…</div>
            : d.carteraRes.filas.length === 0 ? <Todo>Todos los clientes cuadran entre Busint y TNS</Todo>
            : <TablaDif filas={d.carteraRes.filas.map((f) => ({ ...f, a: f.busint, b: f.tns }))} colA="Saldo Busint" colB="Saldo TNS" />}
          {d.carteraRes && d.carteraRes.sinClasificar > 0 && <div style={{ padding: "10px 18px", fontSize: 12, color: C.slate }}>Además hay {d.carteraRes.sinClasificar} cliente{d.carteraRes.sinClasificar === 1 ? "" : "s"} con saldo sin clasificar («Por definir») en Saldos de clientes.</div>}
        </Tarjeta>
      )}
    </div>
  );
}
