// (2026-11-08, a pedido de Fredy) Financiera · «Programar pagos a proveedores».
// Carga solo las facturas desde Cuentas por Pagar (último corte de Busint de Yanko + cortes de TNS de Indutex + proveedores manuales),
// se programa POR FACTURA (fecha y valor, se puede abonar parte) y se marca «Pagado». Lo programado se guarda en
// contabilidad_pagos_programados (una fila por programación). Se compara contra el cupo de «¿Qué puedo pagar a proveedores este mes?».
// Solo administradores programan; los demás ven.
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { useCupoProveedores } from "./financiera-que-pagar";
import { C, caja, Boton, Ventana, Tarjeta } from "./financiera-cuanto-pagar";
import {
  sumarDiasISO, lunesDe, viernesDe, esISO, ultimoCorte, armarProveedoresPagar, aplicarProgramacion, resumenPorSemana, sugerirProgramacion,
} from "./financiera-programar-pagos-calculo";

const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (iso) => { if (!esISO(iso)) return "—"; const [a, m, d] = iso.split("-").map(Number); return `${d} ${MESES[m - 1]} ${a}`; };
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "8px 8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left", whiteSpace: "normal" };
const entrada = { padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, fontFamily: "inherit", boxSizing: "border-box" };
const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const nuevoId = () => `pp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const CLASES = { vencido: ["Vencida", C.red, C.redBg], dentro: ["≤ 30 días", C.amber, C.amberBg], despues: ["Más de 30 días", C.slate, C.canvas], sinFecha: ["Sin fecha", C.blue, C.blueBg] };
function Pastilla({ clase, dias }) {
  const [txt, color, fondo] = CLASES[clase] || CLASES.sinFecha;
  const extra = clase === "vencido" && dias !== null && dias !== undefined && dias < -1 ? ` ${-dias} d` : clase === "dentro" && dias !== null && dias !== undefined ? ` · en ${dias} d` : "";
  return <span style={{ background: fondo, color, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{txt}{extra}</span>;
}
const semanaTxt = (lunes) => `${fechaCorta(lunes).slice(0, -5)} – ${fechaCorta(sumarDiasISO(lunes, 6)).slice(0, -5)}`;

export default function ProgramarPagosView({ db, isAdmin, usuario }) {
  const hoy = useMemo(() => hoyBogota(), []);
  const cupo = useCupoProveedores(db);
  const [cortes, setCortes] = useState([]);
  const [facturasG, setFacturasG] = useState({});
  const [plazos, setPlazos] = useState({});
  const [manuales, setManuales] = useState([]);
  const [nombres, setNombres] = useState({});
  const [programados, setProgramados] = useState([]);
  const [errorLectura, setErrorLectura] = useState("");
  const [empresaSel, setEmpresaSel] = useState("yanko");
  const [tab, setTab] = useState("proveedores");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("urgentes"); // urgentes | todos | programados
  const [abierto, setAbierto] = useState(null); // clave del proveedor
  const [sugerencia, setSugerencia] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const err = (e) => setErrorLectura(e?.message || "No se pudo leer Cuentas por Pagar.");
    const u = [
      onSnapshot(collection(db, "contabilidad_cxp_cortes"), (s) => setCortes(s.docs.map((d) => ({ ...d.data(), id: d.id }))), err),
      onSnapshot(collection(db, "contabilidad_cxp_facturas"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setFacturasG(m); }, err),
      onSnapshot(doc(db, "contabilidad_cxp_plazos", "main"), (s) => setPlazos(s.exists() ? s.data()?.plazos || {} : {}), err),
      onSnapshot(collection(db, "contabilidad_cxp_manual"), (s) => setManuales(s.docs.map((d) => ({ ...d.data(), id: d.id }))), err),
      onSnapshot(collection(db, "contabilidad_cxp_nombres_proveedor"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data()?.nombre || ""; }); setNombres(m); }, err),
      onSnapshot(collection(db, "contabilidad_pagos_programados"), (s) => setProgramados(s.docs.map((d) => ({ ...d.data(), id: d.id }))), err),
    ];
    return () => u.forEach((f) => f());
  }, [db]);

  const corteY = useMemo(() => ultimoCorte(cortes, "yanko"), [cortes]);
  const corteI = useMemo(() => ultimoCorte(cortes, "indutex"), [cortes]);
  const base = useMemo(() => {
    const lista = [];
    if (empresaSel !== "indutex") lista.push(...armarProveedoresPagar({ empresa: "yanko", corte: corteY, facturasGuardadas: facturasG, plazos, nombresProveedor: nombres, manuales: manuales.filter((m) => m.empresa !== "indutex"), hoy }));
    if (empresaSel !== "yanko") lista.push(...armarProveedoresPagar({ empresa: "indutex", corte: corteI, facturasGuardadas: {}, plazos: {}, nombresProveedor: nombres, manuales: manuales.filter((m) => m.empresa === "indutex"), hoy }));
    return lista;
  }, [empresaSel, corteY, corteI, facturasG, plazos, nombres, manuales, hoy]);
  const progVisibles = useMemo(() => programados.filter((x) => empresaSel === "ambas" || (x.empresa || "yanko") === empresaSel), [programados, empresaSel]);
  const { proveedores, huerfanas } = useMemo(() => aplicarProgramacion(base, progVisibles, { yanko: corteY?.id, indutex: corteI?.id }), [base, progVisibles, corteY, corteI]);

  const pendientes = useMemo(() => progVisibles.filter((x) => x.estado !== "pagado"), [progVisibles]);
  const pagados = useMemo(() => progVisibles.filter((x) => x.estado === "pagado").sort((a, b) => String(b.pagadoEn || "").localeCompare(String(a.pagadoEn || ""))), [progVisibles]);
  const resumen = useMemo(() => resumenPorSemana(progVisibles, hoy), [progVisibles, hoy]);
  const programadoMes = pendientes.filter((x) => String(x.fecha || "").slice(0, 7) <= cupo.ym).reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const pagadoMes = pagados.filter((x) => String(x.pagadoEn || "").slice(0, 7) === cupo.ym).reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const cupoLibre = cupo.cupoCons - pagadoMes - programadoMes;
  const porProgramar = proveedores.reduce((s, p) => s + p.items.filter((i) => i.clase === "vencido" || i.clase === "dentro").reduce((t, i) => t + i.restante, 0), 0);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return proveedores
      .filter((p) => !q || String(p.nombreMostrado).toLowerCase().includes(q))
      .filter((p) => filtro === "todos" || (filtro === "programados" ? p.programado > 0 : p.items.some((i) => (i.clase === "vencido" || i.clase === "dentro") && i.restante > 0)))
      .sort((a, b) => b.vencido - a.vencido || b.dentro - a.dentro || b.total - a.total);
  }, [proveedores, busqueda, filtro]);
  const proveedorAbierto = abierto ? proveedores.find((p) => p.clave === abierto) : null;
  const cortesInfo = [corteY ? `Yanko: corte del ${fechaCorta(corteY.fechaCorte)}` : null, empresaSel !== "yanko" && corteI ? `Indutex: corte del ${fechaCorta(corteI.fechaCorte)}` : null].filter(Boolean).join(" · ");

  async function programar(filas) {
    // filas = [{ prov, it, valor, fecha }]
    try {
      const lote = writeBatch(db);
      filas.forEach(({ prov, it, valor, fecha }) => {
        const id = nuevoId();
        lote.set(doc(db, "contabilidad_pagos_programados", id), {
          facturaKey: it.key, empresa: prov.empresa, proveedor: prov.nombre, proveedorMostrado: prov.nombreMostrado, concepto: it.concepto, nfact: it.nfact || "",
          vence: it.vence || null, saldo: it.saldo, valor: Math.round(valor), fecha, estado: "programado",
          corteId: (prov.empresa === "indutex" ? corteI : corteY)?.id || "", creadoEn: new Date().toISOString(), creadoPor: usuario || "",
        });
      });
      await lote.commit();
      setMsg(`Se programaron ${filas.length} pago${filas.length === 1 ? "" : "s"}.`);
      return true;
    } catch (e) {
      setMsg("No se pudo programar: " + (e?.message || e));
      return false;
    }
  }
  const guardarCampos = (reg, campos) => setDoc(doc(db, "contabilidad_pagos_programados", reg.id), { ...campos, actualizadoEn: new Date().toISOString() }, { merge: true }).catch((e) => setMsg("No se pudo guardar: " + (e?.message || e)));
  const marcarPagado = (reg) => guardarCampos(reg, { estado: "pagado", pagadoEn: hoy, pagadoPor: usuario || "" });
  const deshacerPagado = (reg) => guardarCampos(reg, { estado: "programado", pagadoEn: null, pagadoPor: null });
  const quitar = (reg) => {
    if (!window.confirm(`¿Quitar esta programación de ${money(reg.valor)} (${reg.proveedorMostrado || reg.proveedor} · ${reg.concepto})? No se borra la factura, solo la programación.`)) return;
    deleteDoc(doc(db, "contabilidad_pagos_programados", reg.id)).catch((e) => setMsg("No se pudo quitar: " + (e?.message || e)));
  };

  function abrirSugerencia() {
    const s = sugerirProgramacion(proveedores, cupoLibre, hoy);
    setSugerencia({ ...s, marcadas: Object.fromEntries(s.filas.map((f) => [f.facturaKey, true])) });
  }
  async function aplicarSugerencia() {
    const filas = sugerencia.filas.filter((f) => sugerencia.marcadas[f.facturaKey]).map((f) => {
      const prov = proveedores.find((p) => p.clave === f.proveedorClave);
      const it = prov?.items.find((i) => i.key === f.facturaKey);
      return prov && it ? { prov, it, valor: f.valor, fecha: f.fecha } : null;
    }).filter(Boolean);
    if (filas.length && (await programar(filas))) setSugerencia(null);
  }

  const sinCorte = !corteY && !(empresaSel !== "yanko" && corteI);
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.ink }}>Programar pagos a proveedores</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, maxWidth: 860, lineHeight: 1.5 }}>
          Las facturas se cargan solas desde Cuentas por Pagar. Abre un proveedor, elige las facturas, la fecha y el valor (puedes abonar solo una parte) y quedan programadas. Cuando pagues, marca «Pagado».
          {cortesInfo ? ` Datos: ${cortesInfo}.` : ""}
        </div>
      </div>
      {errorLectura ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>{errorLectura}</div> : null}
      {msg ? <div onClick={() => setMsg("")} style={{ background: C.blueBg, color: C.blue, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10, cursor: "pointer" }}>{msg} <span style={{ opacity: 0.7 }}>(toca para cerrar)</span></div> : null}
      {sinCorte ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>Todavía no hay un corte de Cuentas por Pagar. Tráelo desde Contabilidad → Cuentas por pagar → «Traer desde Busint».</div> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Tarjeta titulo="Cupo para proveedores · conservador" valor={cupo.cargando ? "…" : cupo.cupoCons >= 0 ? money(cupo.cupoCons) : `Faltan ${money(-cupo.cupoCons)}`} colorValor={cupo.cupoCons >= 0 ? C.green : C.red} fondo={cupo.cupoCons >= 0 ? C.greenBg : C.redBg} sub="Lo abonado por clientes menos lo que sale sí o sí este mes" />
        <Tarjeta titulo="Programado este mes (sin pagar)" valor={money(programadoMes)} sub={`Ya pagado este mes: ${money(pagadoMes)}`} />
        <Tarjeta titulo="Cupo que queda" valor={cupo.cargando ? "…" : cupoLibre >= 0 ? money(cupoLibre) : `Te pasas por ${money(-cupoLibre)}`} colorValor={cupoLibre >= 0 ? C.green : C.red} fondo={cupoLibre >= 0 ? C.white : C.redBg} sub="Cupo − lo ya pagado − lo programado este mes" />
        <Tarjeta titulo="Por programar · vencido y ≤ 30 días" valor={money(porProgramar)} sub="Facturas que aún no tienen fecha de pago" />
      </div>
      {cupo.error ? <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>No se pudo calcular el cupo: {cupo.error}</div> : null}

      {resumen.atrasado > 0 || resumen.semanas.length ? (
        <div style={{ ...caja, marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>Cuánto sale cada semana</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {resumen.atrasado > 0 ? <div style={{ background: C.redBg, borderRadius: 10, padding: "8px 12px" }}><div style={{ fontSize: 11, fontWeight: 800, color: C.red }}>ATRASADO · fecha ya pasó</div><div style={{ fontSize: 16, fontWeight: 900, color: C.red }}>{money(resumen.atrasado)}</div><div style={{ fontSize: 11, color: C.slate }}>{resumen.nAtrasado} pago{resumen.nAtrasado === 1 ? "" : "s"} sin marcar</div></div> : null}
            {resumen.semanas.map((s) => (
              <div key={s.lunes} style={{ background: s.lunes === lunesDe(hoy) ? C.amberBg : C.canvas, borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.slate }}>{s.lunes === lunesDe(hoy) ? "ESTA SEMANA" : "SEMANA"} · {semanaTxt(s.lunes)}</div>
                <div style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{money(s.programado)}</div>
                <div style={{ fontSize: 11, color: C.slate }}>{s.n} pago{s.n === 1 ? "" : "s"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {[["proveedores", "Por proveedor"], ["agenda", `Agenda de pagos (${pendientes.length})`], ["historial", `Pagados (${pagados.length})`]].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: `1.5px solid ${tab === k ? C.ink : C.border}`, background: tab === k ? C.ink : C.white, color: tab === k ? C.white : C.ink, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{t}</button>
        ))}
        <div style={{ flex: 1 }} />
        <select value={empresaSel} onChange={(e) => setEmpresaSel(e.target.value)} style={entrada}>
          <option value="yanko">Yanko</option>
          <option value="indutex">Indutex</option>
          <option value="ambas">Ambas</option>
        </select>
        {isAdmin ? <Boton variante="oscuro" onClick={abrirSugerencia} disabled={!proveedores.length}>✨ Sugerir según el cupo</Boton> : null}
      </div>

      {huerfanas.length > 0 ? (
        <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 }}>
          {huerfanas.length} pago{huerfanas.length === 1 ? "" : "s"} programado{huerfanas.length === 1 ? "" : "s"} ya no aparece{huerfanas.length === 1 ? "" : "n"} en el corte actual (puede que ya se pagara o que el corte cambió). Míralos en la Agenda y márcalos como pagados o quítalos.
        </div>
      ) : null}

      {tab === "proveedores" && (
        <div style={{ ...caja, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar proveedor…" style={{ ...entrada, minWidth: 220 }} />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={entrada}>
              <option value="urgentes">Con vencido o a 30 días por programar</option>
              <option value="programados">Con algo programado</option>
              <option value="todos">Todos</option>
            </select>
            <span style={{ fontSize: 12, color: C.slate }}>{visibles.length} de {proveedores.length} proveedores</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Proveedor</th><th style={th}>Facturas</th><th style={th}>Saldo total</th><th style={th}>Vencido</th><th style={th}>Vence ≤ 30 d</th><th style={th}>Programado</th><th style={th}>Por programar</th><th style={th} /></tr></thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.clave} onClick={() => setAbierto(p.clave)} style={{ cursor: "pointer" }}>
                  <td style={{ ...tdL, fontWeight: 700 }}>{p.nombreMostrado}{p.empresa === "indutex" ? <span style={{ marginLeft: 6, fontSize: 10.5, color: C.violet, fontWeight: 800 }}>INDUTEX</span> : null}</td>
                  <td style={td}>{p.items.length}</td>
                  <td style={td}>{money(p.total)}</td>
                  <td style={{ ...td, color: p.vencido > 0 ? C.red : C.slate, fontWeight: p.vencido > 0 ? 800 : 400 }}>{money(p.vencido)}</td>
                  <td style={td}>{money(p.dentro)}</td>
                  <td style={{ ...td, color: p.programado > 0 ? C.green : C.slate, fontWeight: p.programado > 0 ? 800 : 400 }}>{money(p.programado)}</td>
                  <td style={td}>{money(p.restante)}</td>
                  <td style={{ ...td, color: C.red, fontWeight: 700 }}>programar ›</td>
                </tr>
              ))}
              {!visibles.length ? <tr><td colSpan={8} style={{ ...tdL, color: C.slate }}>{proveedores.length ? "Ningún proveedor coincide con el filtro." : "No hay facturas abiertas para mostrar."}</td></tr> : null}
              {visibles.length ? (
                <tr>
                  <td style={{ ...tdL, fontWeight: 800, borderTop: `2px solid ${C.ink}` }}>Total</td>
                  <td style={{ ...td, borderTop: `2px solid ${C.ink}` }}>{visibles.reduce((s, p) => s + p.items.length, 0)}</td>
                  {[["total"], ["vencido"], ["dentro"], ["programado"], ["restante"]].map(([k]) => <td key={k} style={{ ...td, fontWeight: 800, borderTop: `2px solid ${C.ink}` }}>{money(visibles.reduce((s, p) => s + p[k], 0))}</td>)}
                  <td style={{ ...td, borderTop: `2px solid ${C.ink}` }} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {tab === "agenda" && <AgendaPagos pendientes={pendientes} huerfanas={huerfanas} hoy={hoy} isAdmin={isAdmin} guardarCampos={guardarCampos} marcarPagado={marcarPagado} quitar={quitar} />}

      {tab === "historial" && (
        <div style={{ ...caja, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Pagado el</th><th style={thL}>Proveedor</th><th style={thL}>Factura</th><th style={th}>Valor</th><th style={th}>Programado para</th><th style={th} /></tr></thead>
            <tbody>
              {pagados.slice(0, 200).map((x) => (
                <tr key={x.id}>
                  <td style={tdL}>{fechaCorta(x.pagadoEn)}</td>
                  <td style={{ ...tdL, fontWeight: 700 }}>{x.proveedorMostrado || x.proveedor}</td>
                  <td style={tdL}>{x.concepto}</td>
                  <td style={td}>{money(x.valor)}</td>
                  <td style={td}>{fechaCorta(x.fecha)}</td>
                  <td style={td}>{isAdmin ? <Boton chico onClick={() => deshacerPagado(x)}>Deshacer</Boton> : null}</td>
                </tr>
              ))}
              {!pagados.length ? <tr><td colSpan={6} style={{ ...tdL, color: C.slate }}>Todavía no has marcado pagos como pagados.</td></tr> : null}
            </tbody>
          </table>
          {pagados.length > 200 ? <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8 }}>Se muestran los 200 más recientes.</div> : null}
        </div>
      )}

      {proveedorAbierto ? (
        <DetalleProveedor
          prov={proveedorAbierto} hoy={hoy} isAdmin={isAdmin} onClose={() => setAbierto(null)} programar={programar}
          guardarCampos={guardarCampos} marcarPagado={marcarPagado} quitar={quitar}
        />
      ) : null}

      {sugerencia ? (
        <Ventana titulo="Sugerencia de pagos según el cupo" sub={`Cupo que queda este mes: ${money(Math.max(0, cupoLibre))}. Se arma por urgencia (vencidas primero, luego por fecha de vencimiento) y cada pago va al viernes de su semana. Revisa y desmarca lo que no quieras.`} onClose={() => setSugerencia(null)} ancho={900}>
          {!sugerencia.filas.length ? (
            <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.6 }}>{cupoLibre <= 0 ? "No hay cupo libre este mes para programar más pagos." : "No hay facturas vencidas o a 30 días pendientes por programar."}</div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th} /><th style={thL}>Proveedor</th><th style={thL}>Factura</th><th style={th}>Vence</th><th style={th}>Valor</th><th style={th}>Fecha de pago</th></tr></thead>
                  <tbody>
                    {sugerencia.filas.map((f) => (
                      <tr key={f.facturaKey}>
                        <td style={td}><input type="checkbox" checked={!!sugerencia.marcadas[f.facturaKey]} onChange={(e) => setSugerencia((s) => ({ ...s, marcadas: { ...s.marcadas, [f.facturaKey]: e.target.checked } }))} /></td>
                        <td style={{ ...tdL, fontWeight: 700 }}>{f.proveedorMostrado}</td>
                        <td style={tdL}>{f.concepto}</td>
                        <td style={td}>{fechaCorta(f.vence)}</td>
                        <td style={td}>{money(f.valor)}{f.parcial ? <div style={{ fontSize: 10.5, color: C.amber }}>abono (saldo {money(f.saldo)})</div> : null}</td>
                        <td style={td}>{fechaCorta(f.fecha)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Total marcado: {money(sugerencia.filas.filter((f) => sugerencia.marcadas[f.facturaKey]).reduce((s, f) => s + f.valor, 0))}</div>
                <div style={{ flex: 1 }} />
                <Boton onClick={() => setSugerencia(null)}>Cancelar</Boton>
                {isAdmin ? <Boton variante="rojo" onClick={aplicarSugerencia}>Programar lo marcado</Boton> : null}
              </div>
            </>
          )}
        </Ventana>
      ) : null}
    </div>
  );
}

// ─── Agenda: todo lo programado y sin pagar, por semana ─────────────────────────────────────────────
function AgendaPagos({ pendientes, huerfanas, hoy, isAdmin, guardarCampos, marcarPagado, quitar }) {
  const idsHuerfanas = new Set(huerfanas.map((h) => h.id));
  const grupos = useMemo(() => {
    const m = new Map();
    pendientes.forEach((x) => {
      const clave = !esISO(x.fecha) ? "sin" : x.fecha < hoy ? "atrasado" : lunesDe(x.fecha);
      if (!m.has(clave)) m.set(clave, []);
      m.get(clave).push(x);
    });
    const orden = [...m.keys()].sort((a, b) => (a === "atrasado" ? -1 : b === "atrasado" ? 1 : a === "sin" ? 1 : b === "sin" ? -1 : a.localeCompare(b)));
    return orden.map((k) => ({ k, filas: m.get(k).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.proveedorMostrado).localeCompare(String(b.proveedorMostrado))) }));
  }, [pendientes, hoy]);
  if (!grupos.length) return <div style={{ ...caja, fontSize: 13, color: C.slate }}>Todavía no hay pagos programados. Abre un proveedor en «Por proveedor» o usa «Sugerir según el cupo».</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {grupos.map((g) => {
        const total = g.filas.reduce((s, x) => s + (Number(x.valor) || 0), 0);
        const titulo = g.k === "atrasado" ? "Atrasado · la fecha ya pasó y no se ha marcado pagado" : g.k === "sin" ? "Sin fecha" : `${g.k === lunesDe(hoy) ? "Esta semana" : "Semana"} · ${semanaTxt(g.k)}`;
        return (
          <div key={g.k} style={{ ...caja, overflowX: "auto", borderColor: g.k === "atrasado" ? C.red : C.border }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: g.k === "atrasado" ? C.red : C.ink }}>{titulo}</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 14, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{money(total)}</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={thL}>Proveedor</th><th style={thL}>Factura</th><th style={th}>Vence</th><th style={th}>Valor</th><th style={th}>Fecha de pago</th><th style={th} /></tr></thead>
              <tbody>
                {g.filas.map((x) => (
                  <tr key={x.id}>
                    <td style={{ ...tdL, fontWeight: 700 }}>{x.proveedorMostrado || x.proveedor}{idsHuerfanas.has(x.id) ? <div style={{ fontSize: 10.5, color: C.amber, fontWeight: 700 }}>Ya no está en el corte actual</div> : null}</td>
                    <td style={tdL}>{x.concepto}</td>
                    <td style={td}>{fechaCorta(x.vence)}</td>
                    <td style={td}>{isAdmin ? <InputValor valor={x.valor} onGuardar={(v) => guardarCampos(x, { valor: v })} /> : money(x.valor)}</td>
                    <td style={td}>{isAdmin ? <input type="date" value={x.fecha || ""} onChange={(e) => e.target.value && guardarCampos(x, { fecha: e.target.value })} style={entrada} /> : fechaCorta(x.fecha)}</td>
                    <td style={td}>{isAdmin ? <span style={{ display: "inline-flex", gap: 6 }}><Boton chico variante="oscuro" onClick={() => marcarPagado(x)}>Pagado</Boton><Boton chico onClick={() => quitar(x)}>Quitar</Boton></span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
function InputValor({ valor, onGuardar }) {
  const [v, setV] = useState(String(Math.round(Number(valor) || 0)));
  useEffect(() => setV(String(Math.round(Number(valor) || 0))), [valor]);
  return <input value={v} inputMode="numeric" onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} onBlur={() => { const n = Number(v); if (n > 0 && n !== Math.round(Number(valor) || 0)) onGuardar(n); else setV(String(Math.round(Number(valor) || 0))); }} style={{ ...entrada, width: 120, textAlign: "right" }} />;
}

// ─── Detalle de un proveedor: sus facturas y la programación de cada una ────────────────────────────
function DetalleProveedor({ prov, hoy, isAdmin, onClose, programar, guardarCampos, marcarPagado, quitar }) {
  const [sel, setSel] = useState({});
  const [vals, setVals] = useState({});
  const [fechas, setFechas] = useState({});
  const [fechaGeneral, setFechaGeneral] = useState(viernesDe(hoy) < hoy ? sumarDiasISO(viernesDe(hoy), 7) : viernesDe(hoy));
  const [error, setError] = useState("");
  const programables = prov.items.filter((i) => i.restante > 0);
  const valorDe = (i) => (vals[i.key] !== undefined ? Number(vals[i.key]) || 0 : i.restante);
  const fechaDe = (i) => fechas[i.key] || fechaGeneral;
  const marcadas = programables.filter((i) => sel[i.key]);
  const totalMarcado = marcadas.reduce((s, i) => s + valorDe(i), 0);
  const marcarTodas = (clases) => setSel(Object.fromEntries(programables.filter((i) => clases.includes(i.clase)).map((i) => [i.key, true])));

  async function enviar() {
    setError("");
    if (!marcadas.length) { setError("Marca al menos una factura."); return; }
    for (const i of marcadas) {
      const v = valorDe(i);
      if (!(v > 0)) { setError(`${i.concepto}: el valor debe ser mayor que 0.`); return; }
      if (v > i.restante + 1) { setError(`${i.concepto}: no puedes programar más de lo que falta (${money(i.restante)}).`); return; }
      if (!esISO(fechaDe(i)) || fechaDe(i) < hoy) { setError(`${i.concepto}: elige una fecha de hoy en adelante.`); return; }
    }
    const ok = await programar(marcadas.map((i) => ({ prov, it: i, valor: valorDe(i), fecha: fechaDe(i) })));
    if (ok) { setSel({}); setVals({}); setFechas({}); }
  }

  return (
    <Ventana titulo={prov.nombreMostrado} sub={`${prov.items.length} factura${prov.items.length === 1 ? "" : "s"} abierta${prov.items.length === 1 ? "" : "s"} · saldo ${money(prov.total)} · vencido ${money(prov.vencido)}`} onClose={onClose} ancho={1100}>
      {!prov.conDetalle && prov.origen === "corte" ? (
        <div style={{ background: C.blueBg, color: C.blue, borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          Este proveedor no tiene el detalle por factura en el corte (viene de TNS o el detalle no está guardado). Se programa por monto: «vencido» y «por vencer». Para ver facturas, trae el corte desde Busint en Contabilidad.
        </div>
      ) : null}
      {prov.conDetalle && !prov.plazo ? <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8 }}>Los vencimientos son los de Busint (este proveedor no tiene plazo definido en «⏱ Plazos de pago»).</div> : null}
      {prov.conDetalle && prov.plazo ? <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 8 }}>Vencimiento = emisión + {prov.plazo} días (plazo definido para este proveedor).</div> : null}
      {prov.anticipos > 0 ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>Este proveedor tiene anticipos por {money(prov.anticipos)}. No se restan de las facturas de abajo: si ya los cruzaste, págale solo la diferencia ({money(Math.max(0, prov.total - prov.anticipos))} neto).</div> : null}
      {isAdmin && programables.length ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: C.slate }}>Marcar:</span>
          <Boton chico onClick={() => marcarTodas(["vencido"])}>Vencidas</Boton>
          <Boton chico onClick={() => marcarTodas(["vencido", "dentro"])}>Vencidas y ≤ 30 días</Boton>
          <Boton chico onClick={() => marcarTodas(["vencido", "dentro", "despues", "sinFecha"])}>Todas</Boton>
          <Boton chico onClick={() => setSel({})}>Ninguna</Boton>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: C.slate }}>Fecha de pago para las marcadas:</span>
          <input type="date" value={fechaGeneral} min={hoy} onChange={(e) => { setFechaGeneral(e.target.value); setFechas({}); }} style={entrada} />
        </div>
      ) : null}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{isAdmin ? <th style={th} /> : null}<th style={thL}>Factura</th><th style={th}>Emisión</th><th style={th}>Vence</th><th style={th}>Estado</th><th style={th}>Saldo</th><th style={th}>Programado</th><th style={th}>Pagado</th><th style={th}>Por programar</th>{isAdmin ? <><th style={th}>Valor a programar</th><th style={th}>Fecha de pago</th></> : null}</tr></thead>
          <tbody>
            {prov.items.map((i) => (
              <React.Fragment key={i.key}>
                <tr>
                  {isAdmin ? <td style={td}>{i.restante > 0 ? <input type="checkbox" checked={!!sel[i.key]} onChange={(e) => setSel((s) => ({ ...s, [i.key]: e.target.checked }))} /> : null}</td> : null}
                  <td style={{ ...tdL, fontWeight: 700 }}>{i.concepto}</td>
                  <td style={td}>{fechaCorta(i.emision)}</td>
                  <td style={td}>{fechaCorta(i.vence)}</td>
                  <td style={td}><Pastilla clase={i.clase} dias={i.dias} /></td>
                  <td style={td}>{money(i.saldo)}</td>
                  <td style={{ ...td, color: i.programado > 0 ? C.green : C.slate }}>{money(i.programado)}</td>
                  <td style={td}>{i.pagado > 0 ? money(i.pagado) : "—"}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{money(i.restante)}</td>
                  {isAdmin ? (
                    <>
                      <td style={td}>{i.restante > 0 ? <input value={vals[i.key] !== undefined ? vals[i.key] : String(Math.round(i.restante))} inputMode="numeric" onChange={(e) => setVals((v) => ({ ...v, [i.key]: e.target.value.replace(/[^\d]/g, "") }))} style={{ ...entrada, width: 110, textAlign: "right" }} /> : null}</td>
                      <td style={td}>{i.restante > 0 ? <input type="date" value={fechaDe(i)} min={hoy} onChange={(e) => setFechas((f) => ({ ...f, [i.key]: e.target.value }))} style={entrada} /> : null}</td>
                    </>
                  ) : null}
                </tr>
                {i.regs.filter((r) => r.estado !== "pagado").map((r) => (
                  <tr key={r.id}>
                    <td colSpan={isAdmin ? 11 : 9} style={{ ...tdL, background: C.greenBg, fontSize: 12, padding: "5px 10px 5px 30px" }}>
                      <span style={{ fontWeight: 800, color: C.green }}>Programado:</span> {money(r.valor)} para el {fechaCorta(r.fecha)}
                      {isAdmin ? (
                        <span style={{ marginLeft: 12, display: "inline-flex", gap: 6 }}>
                          <input type="date" value={r.fecha || ""} onChange={(e) => e.target.value && guardarCampos(r, { fecha: e.target.value })} style={{ ...entrada, padding: "3px 6px" }} />
                          <Boton chico variante="oscuro" onClick={() => marcarPagado(r)}>Pagado</Boton>
                          <Boton chico onClick={() => quitar(r)}>Quitar</Boton>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, marginTop: 10 }}>{error}</div> : null}
      {isAdmin ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{marcadas.length} marcada{marcadas.length === 1 ? "" : "s"} · {money(totalMarcado)}</div>
          <div style={{ flex: 1 }} />
          <Boton onClick={onClose}>Cerrar</Boton>
          <Boton variante="rojo" disabled={!marcadas.length} onClick={enviar}>Programar lo marcado</Boton>
        </div>
      ) : <div style={{ fontSize: 12, color: C.slate, marginTop: 12 }}>Solo los administradores pueden programar pagos.</div>}
    </Ventana>
  );
}
