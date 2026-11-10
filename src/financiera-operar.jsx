// (2026-11-10, a pedido de Fredy) Financiera · «🎯 Lo que cuesta operar». Una sola pantalla: qué cuesta operar el mes (mano de obra + insumos y telas + gastos básicos),
// qué entró para cubrirlo, qué hay que pagar cada semana (con «Pagado» en cada pago) y cuánto se debe aparte (deuda). No reemplaza ninguna pantalla:
// cada cifra y cada pago lleva a su pantalla de detalle. Los cálculos viven en financiera-operar-calculo.js.
import React, { useEffect, useMemo, useState } from "react";
import { arrayRemove, arrayUnion, collection, doc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { C, caja, Boton, Tarjeta } from "./financiera-cuanto-pagar";
import { useMesFinanciero } from "./financiera-que-pagar";
import { useDeudaProveedores, leerOpciones } from "./financiera-proyeccion-deuda";
import { necesidadOperar } from "./financiera-insumos-calculo";
import { categoriasElegidas } from "./financiera-proyeccion-compras-calculo";
import { recogidoDeLotes } from "./costos-general-calculo";
import { armarOperar, COL_PAGOS_OPERAR, CONFIG_ID } from "./financiera-operar-calculo";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const fm = (n) => { const v = Math.round((Number(n) || 0) / 1e5) / 10; return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + " M"; };
const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const moverMes = (ym, d) => { const [a, m] = ym.split("-").map(Number); const t = a * 12 + (m - 1) + d; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const corto = (iso) => { const [, m, d] = String(iso).split("-").map(Number); return `${d} ${MESES[m - 1].slice(0, 3)}`; };
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "8px 8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left" };
const enlace = { background: "none", border: "none", padding: 0, color: C.blue, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

function useColeccion(db, nombre, filtro) {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    const ref = filtro ? query(collection(db, nombre), where(filtro[0], "==", filtro[1])) : collection(db, nombre);
    return onSnapshot(ref, (s) => setLista(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setLista([]));
  }, [db, nombre, filtro]);
  return lista;
}

// Necesito al mes en insumos y telas, con los mismos ajustes que deja «Insumos y telas».
function useInsumosOperar(db, ymHoy) {
  const compras = useColeccion(db, "contabilidad_compras");
  const presupuestos = useColeccion(db, "contabilidad_presupuestos");
  const catLista = useColeccion(db, "contabilidad_proyeccion_categorias_lista");
  const catPorConcepto = useColeccion(db, "contabilidad_proyeccion_categorias_concepto");
  return useMemo(() => {
    const o = leerOpciones();
    const catsSel = categoriasElegidas(o.catsOperar, catLista);
    const nec = necesidadOperar({ compras, presupuestos, categoriasLista: catLista, categoriasPorConcepto: catPorConcepto.map((x) => ({ ...x, codConcep: x.id })), catsSel, conceptosFuera: o.conceptosFuera, ymHoy, baseK: o.baseOperar });
    return { total: nec.totalNecesito, sinDatos: nec.sinDatos };
  }, [compras, presupuestos, catLista, catPorConcepto, ymHoy]);
}

// Lo que recogen los lotes aprobados este mes en Dado por Cumplido (el mismo número de «¿Cubro mis costos?»).
function useRecogidoMes(db, ym) {
  const [recogido, setRecogido] = useState(null);
  useEffect(() => {
    let vivo = true;
    const [a, m] = ym.split("-").map(Number);
    const inicio = new Date(Date.UTC(a, m - 1, 1, 5));
    const fin = new Date(Date.UTC(a, m, 1, 5));
    getDocs(query(collection(db, "dado_por_cumplido_lotes"), where("fechaAprobacion", ">=", inicio), where("fechaAprobacion", "<", fin)))
      .then((s) => { if (vivo) setRecogido(recogidoDeLotes(s.docs.map((d) => ({ ...d.data(), id: d.id })), []).aporte); })
      .catch(() => { if (vivo) setRecogido(null); });
    return () => { vivo = false; };
  }, [db, ym]);
  return recogido;
}

function Chip({ clase, onClick, titulo }) {
  const deuda = clase === "deuda";
  const estilo = { display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: deuda ? C.redBg : C.blueBg, color: deuda ? C.red : C.blue, border: "none", fontFamily: "inherit" };
  if (!onClick) return <span style={estilo}>{deuda ? "Deuda" : "Operar"}</span>;
  return <button onClick={onClick} title={titulo} style={{ ...estilo, cursor: "pointer", outline: `1px dashed ${deuda ? C.red : C.blue}` }}>{deuda ? "Deuda" : "Operar"} ⇄</button>;
}

// Días de pago de seguridad social/provisiones/gastos y qué proveedores cuentan como «operar» o como «deuda» (un documento compartido para todos los equipos).
function useConfigOperar(db) {
  const [cfg, setCfg] = useState({});
  useEffect(() => onSnapshot(doc(db, COL_PAGOS_OPERAR, CONFIG_ID), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({})), [db]);
  return cfg;
}

export default function LoQueCuestaOperarView({ db, isAdmin, usuario, onIr }) {
  const hoy = useMemo(() => hoyBogota(), []);
  const [ym, setYm] = useState(() => hoyBogota().slice(0, 7));
  const esActual = ym === hoy.slice(0, 7);
  const config = useConfigOperar(db);
  const datos = useMesFinanciero(db, ym);
  const deudaProv = useDeudaProveedores(db);
  const insumos = useInsumosOperar(db, ym);
  const recogido = useRecogidoMes(db, ym);
  const programados = useColeccion(db, "contabilidad_pagos_programados");
  const liqRetiro = useColeccion(db, "nomina_liquidaciones_retiro");
  const filtroNomina = useMemo(() => ["mesClave", ym], [ym]);
  const pagosNomina = useColeccion(db, "financiera_pagos_persona", filtroNomina);
  const pagadoNomina = useMemo(() => pagosNomina.reduce((s, p) => s + (Number(p.monto) || 0), 0), [pagosNomina]);
  const [filtro, setFiltro] = useState("todo");
  const [msg, setMsg] = useState("");
  const [trabajando, setTrabajando] = useState("");

  const r = useMemo(() => armarOperar({
    config, ym, hoy, est: datos.res.estimado, porCategoria: datos.cumpl.porCategoria, pagosMapa: datos.pagosMapa, cuotasLista: datos.res.actual.cuotasLista,
    programados, liqRetiro, pagadoNomina, insumos: insumos.total, deudaProv, recogido,
  }), [config, ym, hoy, datos.res, datos.cumpl, datos.pagosMapa, programados, liqRetiro, pagadoNomina, insumos.total, deudaProv, recogido]);

  const ir = (id) => { if (onIr && id) onIr(id); };
  const visible = (it) => filtro === "todo" || it.clase === (filtro === "operar" ? "operar" : "deuda");

  // «Pagado» escribe en el mismo lugar donde ya lo marca cada pantalla de detalle; «Deshacer» lo devuelve.
  async function guardarConfig(campos) {
    setMsg("");
    try { await setDoc(doc(db, COL_PAGOS_OPERAR, CONFIG_ID), { kind: "operar_config", ...campos, actualizadoEn: new Date().toISOString() }, { merge: true }); }
    catch (e) { setMsg(`No se pudo guardar el ajuste: ${e?.message || e}`); }
  }
  const guardarDia = (clave, texto) => { const n = Math.round(Number(texto)); guardarConfig({ diasPago: { [clave]: n >= 1 && n <= 31 ? n : 0 } }); };
  // Cambia el proveedor entero de «operar» a «deuda» (o al revés): se recuerda para todas sus facturas.
  const alternarProveedor = (it) => {
    const operar = it.clase === "operar";
    guardarConfig(operar
      ? { proveedoresDeuda: arrayUnion(it.provKey), proveedoresOperar: arrayRemove(it.provKey) }
      : { proveedoresOperar: arrayUnion(it.provKey), proveedoresDeuda: arrayRemove(it.provKey) });
  };
  async function marcar(it, pagado) {
    if (!it.accion || !esActual) return;
    setMsg("");
    setTrabajando(it.id);
    const ahora = new Date().toISOString();
    const a = it.accion;
    try {
      if (a.tipo === "op") {
        await setDoc(doc(db, COL_PAGOS_OPERAR, `op__${a.clave}__${ym}`), { kind: "operar_pago", clave: a.clave, ym, pagado: pagado ? Math.round(it.valor) : 0, pagadoEn: pagado ? hoy : "", pagadoPor: usuario || "", actualizadoEn: ahora }, { merge: true });
      } else if (a.tipo === "cuota") {
        await setDoc(doc(db, COL_PAGOS_OPERAR, `${a.cuotaId}__${ym}`), { kind: "pago", cuotaId: a.cuotaId, ym, pagado: pagado ? Math.round(it.valor) : 0, actualizadoEn: ahora });
      } else if (a.tipo === "liq") {
        await setDoc(doc(db, "nomina_liquidaciones_retiro", a.liqId), { estadoPago: pagado ? "pagada" : "no_pagada", pagadaEn: pagado ? hoy : "" }, { merge: true });
      } else if (a.tipo === "prov") {
        await setDoc(doc(db, "contabilidad_pagos_programados", a.id), pagado ? { estado: "pagado", pagadoEn: hoy, pagadoPor: usuario || "", actualizadoEn: ahora } : { estado: "programado", pagadoEn: null, pagadoPor: null, actualizadoEn: ahora }, { merge: true });
      }
    } catch (e) { setMsg(`No se pudo guardar: ${e?.message || e}`); }
    setTrabajando("");
  }

  const fila = (it) => {
    const parcial = !it.listo && it.pagado > 0;
    return (
      <tr key={it.id} style={it.listo ? { opacity: 0.55 } : undefined}>
        <td style={{ ...tdL, whiteSpace: "nowrap", color: it.atrasado ? C.red : C.slate, fontWeight: it.atrasado ? 800 : 600 }}>
          {it.dia ? corto(it.atrasadoOrigen || it.fecha) : "—"}{it.aprox ? <span title="Fecha aproximada" style={{ color: C.slate }}> ~</span> : null}
        </td>
        <td style={tdL}>
          <button onClick={() => ir(it.ir)} style={{ ...enlace, color: C.ink, fontWeight: 700, textAlign: "left" }} title="Ver el detalle">{it.concepto}</button>
          {it.sub ? <div style={{ fontSize: 11, color: C.slate }}>{it.sub}</div> : null}
          {it.atrasado ? <div style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>Atrasado</div> : null}
          {it.accion && it.accion.tipo === "op" && isAdmin ? (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
              Día de pago: <input type="number" min="0" max="31" defaultValue={it.diaCfg || ""} placeholder="—" aria-label={`Día de pago de ${it.concepto}`} key={`${it.id}-${it.diaCfg}`}
                onBlur={(e) => { if (Number(e.target.value || 0) !== it.diaCfg) guardarDia(it.accion.clave, e.target.value); }} style={{ width: 46, padding: "2px 4px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11.5, fontFamily: "inherit" }} />
            </div>
          ) : null}
        </td>
        <td style={{ ...td, textAlign: "center" }}>
          {it.accion && it.accion.tipo === "prov" && isAdmin && it.provKey
            ? <Chip clase={it.clase} onClick={() => alternarProveedor(it)} titulo={`Cambiar a ${it.clase === "operar" ? "deuda" : "operar"} todas las facturas de este proveedor`} />
            : <Chip clase={it.clase} />}
          {it.provManual ? <div style={{ fontSize: 9.5, color: C.slate }}>elegido por ti</div> : null}
        </td>
        <td style={{ ...td, fontWeight: 800 }}>{money(it.valor)}{parcial ? <div style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>falta {money(it.falta)}</div> : null}</td>
        <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
          {it.listo ? <span style={{ color: C.green, fontWeight: 800 }}>✓ Pagado</span> : null}
          {it.accion && isAdmin && esActual ? (
            it.listo
              ? <button style={{ ...enlace, marginLeft: 8, color: C.slate }} disabled={trabajando === it.id} onClick={() => marcar(it, false)}>Deshacer</button>
              : <Boton chico onClick={() => marcar(it, true)} disabled={trabajando === it.id}>Pagado</Boton>
          ) : null}
          {!it.accion && !it.listo ? <button style={enlace} onClick={() => ir(it.ir)}>Ver →</button> : null}
        </td>
      </tr>
    );
  };

  const k = r.kpi;
  const d = r.deuda;
  const [aH, mH, dH] = hoy.split("-").map(Number);
  const diaSemana = DIAS[new Date(Date.UTC(aH, mH - 1, dH)).getUTCDay()];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 21, fontWeight: 900, color: C.ink }}>Lo que cuesta operar · {MESES[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}</div>
          <button onClick={() => setYm(moverMes(ym, -1))} aria-label="Mes anterior" style={{ ...enlace, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 10px", fontSize: 14 }}>◀</button>
          <button onClick={() => setYm(moverMes(ym, 1))} aria-label="Mes siguiente" style={{ ...enlace, border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 10px", fontSize: 14 }}>▶</button>
          {!esActual ? <button onClick={() => setYm(hoy.slice(0, 7))} style={enlace}>Volver al mes en curso</button> : null}
        </div>
        {!esActual ? <div style={{ fontSize: 12, color: C.amber, marginTop: 4 }}>Estás viendo otro mes: es de consulta. El botón «Pagado» solo funciona en el mes en curso.</div> : null}
        <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, maxWidth: 860, lineHeight: 1.5 }}>
          Hoy {diaSemana} {dH} de {MESES[mH - 1]}. Una sola pantalla: qué cuesta operar el mes, qué entró para cubrirlo y qué toca pagar cada semana. Toca cualquier cifra o pago para ir a su detalle.
        </div>
      </div>

      {datos.cargando ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>Cargando nómina, gastos y cuotas del mes…</div> : null}
      {datos.error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>{datos.error}</div> : null}
      {msg ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>{msg}</div> : null}
      {insumos.sinDatos ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>Todavía no hay compras reales cargadas en Contabilidad: «Insumos y telas» queda en $0 hasta que las cargues.</div> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Tarjeta titulo="Cuesta operar el mes" valor={fm(k.cuestaOperar)} fondo={C.blueBg} colorValor={C.blue} sub="mano de obra + insumos y telas + gastos básicos" />
        <Tarjeta titulo="Esta semana debo tener" valor={esActual ? money(k.estaSemana) : "—"} fondo={esActual && k.atrasado > 0 ? C.redBg : undefined} colorValor={esActual && k.atrasado > 0 ? C.red : undefined} sub={esActual ? `${corto(k.lunes)} al ${corto(k.domingo)}${k.atrasado > 0 ? ` · incluye ${money(k.atrasado)} atrasado` : ""}` : "solo se calcula en el mes en curso"} />
        <Tarjeta titulo="Falta por pagar este mes" valor={fm(k.faltaTotal)} sub={`${fm(k.faltaOperar)} operar · ${fm(k.faltaDeuda)} deuda`} />
      </div>

      <div style={{ ...caja, overflowX: "auto", marginBottom: 14 }}>
        <div style={{ fontSize: 14.5, fontWeight: 900, color: C.ink }}>1 · ¿Qué cuesta operar y quién lo cubre?</div>
        <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 8px" }}>Cada renglón se compara con lo que entró para ese rubro. Los abonos de clientes se descuentan solo donde los clasificaste.</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr><th style={thL}>Rubro</th><th style={th}>Cuesta en el mes</th><th style={th}>Entró (abonos)</th><th style={th}>Falta cubrir</th><th style={th}>Ya pagado</th></tr>
          </thead>
          <tbody>
            {r.rubros.map((x) => (
              <tr key={x.k}>
                <td style={tdL}>
                  <button onClick={() => ir(x.ir)} style={{ ...enlace, color: C.ink, fontSize: 13, fontWeight: 800 }}>{x.label}</button>
                  {x.sub.length ? (
                    <div style={{ fontSize: 11, color: C.slate, marginTop: 2, lineHeight: 1.6 }}>
                      {x.sub.map(([n, v, destino], i) => <span key={n}>{i ? " · " : ""}<button onClick={() => ir(destino)} style={{ ...enlace, color: C.slate, fontWeight: 500, fontSize: 11 }}>{n} {money(v)}</button></span>)}
                    </div>
                  ) : null}
                </td>
                <td style={{ ...td, fontWeight: 800 }}>{money(x.cuesta)}</td>
                <td style={td}>{x.abono === null ? <span style={{ color: C.slate, fontSize: 11.5 }}>— {x.abonoNombre}</span> : <>{money(x.abono)}<div style={{ fontSize: 10.5, color: C.slate }}>{x.abonoNombre}</div></>}</td>
                <td style={{ ...td, fontWeight: 800, color: x.falta === null ? C.slate : x.falta > 0 ? C.red : C.green }}>{x.falta === null ? "—" : x.falta > 0 ? money(x.falta) : "✓ Cubierto"}</td>
                <td style={td}>{x.pagado > 0 ? money(x.pagado) : "—"}</td>
              </tr>
            ))}
            <tr style={{ background: C.canvas }}>
              <td style={{ ...tdL, fontWeight: 900 }}>Total</td>
              <td style={{ ...td, fontWeight: 900 }}>{money(r.cuestaOperar)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{money(r.rubros.reduce((s, x) => s + (x.abono || 0), 0))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{money(r.rubros.reduce((s, x) => s + (x.falta || 0), 0))}</td>
              <td style={{ ...td, fontWeight: 800 }}>{money(r.rubros.reduce((s, x) => s + x.pagado, 0))}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 10, background: C.canvas, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
          Cubro con los básicos del Dado por Cumplido:{" "}
          {r.dado.cubre === null ? <b>sin datos todavía</b> : <><b>{money(r.dado.recogido)}</b> acumulados en el mes frente a <b>{money(r.cuestaOperar)}</b> de costo de operar (<b style={{ color: r.dado.cubre >= 1 ? C.green : C.amber }}>{Math.round(r.dado.cubre * 100)} %</b>).</>}{" "}
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3 }}>Esto responde «¿mi estructura se paga sola?»; los abonos responden «¿ya me entró lo que pide cada rubro?». Tela no descuenta: por eso Insumos y telas no tiene abonos.</div>
        </div>
      </div>

      <div style={{ ...caja, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 14.5, fontWeight: 900, color: C.ink }}>2 · ¿Qué debo pagar y cuándo?</div>
          <div style={{ flex: 1 }} />
          {[["todo", "Todo"], ["operar", "Solo operar"], ["deuda", "Solo deuda"]].map(([id, t]) => (
            <button key={id} onClick={() => setFiltro(id)} style={{ padding: "5px 12px", borderRadius: 999, border: `1.5px solid ${filtro === id ? C.blue : C.border}`, background: filtro === id ? C.blueBg : C.white, color: filtro === id ? C.blue : C.slate, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{t}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 8, lineHeight: 1.5 }}>Todo lo que sale en el mes, por semana. Lo que programas en Endeudamiento y en Pagos a Proveedores aparece solo; al decir «Pagado» sale de lo que falta. Los pagos de nómina se marcan en «Pago de Nómina».</div>

        {r.semanas.map((s) => {
          const lista = s.items.filter(visible);
          const faltaSemana = lista.reduce((t, it) => t + it.falta, 0);
          return (
            <div key={s.lunes} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 8px", background: s.actual ? C.blueBg : C.canvas, borderRadius: 8 }}>
                <b style={{ fontSize: 12.5, color: s.actual ? C.blue : C.ink }}>{s.desde === s.hasta ? `Día ${s.desde}` : `Semana del ${s.desde} al ${s.hasta}`}{s.actual ? " · esta semana" : ""}</b>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: C.slate }}>falta pagar <b style={{ color: C.ink }}>{money(faltaSemana)}</b></span>
              </div>
              {lista.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>{lista.map(fila)}</tbody></table>
              ) : <div style={{ fontSize: 12, color: C.slate, padding: "6px 8px" }}>Nada que pagar con fecha en esta semana.</div>}
            </div>
          );
        })}

        {(() => {
          const lista = r.sinDia.filter(visible);
          if (!lista.length) return null;
          return (
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 8px", background: C.canvas, borderRadius: 8 }}>
                <b style={{ fontSize: 12.5, color: C.ink }}>Sin día fijo</b>
                <span style={{ fontSize: 11.5, color: C.slate }}>se pagan cuando toque en el mes</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: C.slate }}>falta pagar <b style={{ color: C.ink }}>{money(lista.reduce((t, it) => t + it.falta, 0))}</b></span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>{lista.map(fila)}</tbody></table>
            </div>
          );
        })()}
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, lineHeight: 1.5 }}>
          «Operar» = nómina, seguridad social, provisiones, gastos y facturas de insumos y telas que aún no vencen. «Deuda» = cuotas, liquidaciones y facturas de proveedores vencidas; toca el chip ⇄ de un proveedor para decidir tú si cuenta como operar o como deuda. Pon el día de pago de seguridad social, provisiones y gastos para verlos en su semana. Las fechas de nómina (15 y fin de mes) son aproximadas.
        </div>
      </div>

      <div style={{ ...caja, marginBottom: 14 }}>
        <div style={{ fontSize: 14.5, fontWeight: 900, color: C.ink }}>3 · Deuda, aparte</div>
        <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>No es costo de operar: es lo que ya se debe. Se paga con lo que sobre, empezando por lo vencido.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Tarjeta titulo="Vencido con proveedores" valor={d.vencidoProv === null ? "—" : money(d.vencidoProv)} fondo={d.vencidoProv > 0 ? C.redBg : undefined} sub={d.fechaCorte ? `Cuentas por Pagar, corte del ${d.fechaCorte}` : "No hay corte de Cuentas por Pagar"} />
          <Tarjeta titulo="Cuotas de Endeudamiento" valor={money(d.cuotasMes)} sub={`este mes${d.saldoCuotas > 0 ? ` · saldo ${fm(d.saldoCuotas)}` : ""}${d.cuotasSinFin ? ` · ${d.cuotasSinFin} sin fecha de fin` : ""}`} />
          <Tarjeta titulo="Liquidaciones pendientes" valor={money(d.liqPendTotal)} sub={`${d.liqPendN} ${d.liqPendN === 1 ? "persona" : "personas"}${d.liqProgramado > 0 ? ` · ${money(d.liqProgramado)} programados este mes` : ""}`} />
          <Tarjeta titulo="Deuda total" valor={fm(d.deudaTotal)} fondo={C.canvas} sub="vencido + saldo de cuotas + liquidaciones" />
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
          <button style={enlace} onClick={() => ir("pagos_proveedores")}>Pagos a Proveedores →</button>
          <button style={enlace} onClick={() => ir("endeudamiento")}>Endeudamiento →</button>
          <button style={enlace} onClick={() => ir("programacion_pagos")}>Proyección de Deuda →</button>
          <button style={enlace} onClick={() => ir("vencimientos")}>Vencimientos →</button>
          <button style={enlace} onClick={() => ir("estrategia_pago")}>Estrategia de Pago →</button>
        </div>
      </div>
    </div>
  );
}
