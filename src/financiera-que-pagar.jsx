// ─── FINANCIERA · ¿Qué pagar primero? ────────────────────────────────────────────────────────────────────────────────────────────────
// (2026-11-05, a pedido de Fredy) Bloque que va arriba de «Estrategia de Pago». Cruza lo que entra (abonos de clientes y presupuesto de clientes del mes)
// con lo que sale sí o sí (estimado de «Cuánto debo pagar»: nómina, seguridad social, provisiones, gastos del Excel y cuotas) y dice cuánto queda para
// proveedores y a quiénes pagar con ese cupo (cuentas ya ordenadas por urgencia en Estrategia de Pago). Es solo lectura: no cambia el calendario de Cuentas por Pagar.
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { cuantoPagarMes, cuotasConLiquidaciones, cumplimientoPresupuesto, repartirCupo, calendarioObligaciones, sumarMes } from "./financiera-cuanto-pagar-calculo";

const C = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", amber: "#C47C1A", amberBg: "#FDF5E6", blue: "#3D6B9E" };
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "8px 8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left" };

// Lo que entra y lo que sale este mes, en vivo.
function useMesFinanciero(db, ym) {
  const [liq, setLiq] = useState({});
  const [gastos, setGastos] = useState([]);
  const [cuotasManuales, setCuotasManuales] = useState([]);
  const [pagosCuotas, setPagosCuotas] = useState([]); // (2026-11-06) pagos de cuotas del mes y plan de liquidaciones (contabilidad_cuotas_pagos)
  const [pres, setPres] = useState([]);
  const [movs, setMovs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => onSnapshot(collection(db, "financiera_cuotas"), (s) => setCuotasManuales(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db]);
  useEffect(() => onSnapshot(collection(db, "contabilidad_cuotas_pagos"), (s) => setPagosCuotas(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db]);
  const cuotas = useMemo(() => cuotasConLiquidaciones(cuotasManuales, pagosCuotas), [cuotasManuales, pagosCuotas]);
  const [liqRetiro, setLiqRetiro] = useState([]);
  useEffect(() => onSnapshot(collection(db, "nomina_liquidaciones_retiro"), (s) => setLiqRetiro(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db]);
  // Mapa de pagos por «{idCuota}__{mes}». Para las liquidaciones de retiro, lo pagado = lo escrito a mano o, si no hay, lo marcado «Pagada» este mes en Nómina.
  const pagosMapa = useMemo(() => {
    const o = {};
    pagosCuotas.forEach((x) => { o[x.id] = x; });
    const plan = pagosCuotas.find((x) => x.id === `plan_liquidaciones__${ym}`);
    if (plan) {
      const auto = liqRetiro.filter((l) => l.estadoPago === "pagada" && String(l.pagadaEn || "").slice(0, 7) === ym).reduce((t, l) => t + (Number(l.totalAPagar) || 0), 0);
      const manual = plan.pagadoManual !== undefined && plan.pagadoManual !== null && plan.pagadoManual !== "";
      o[`plan_liquidaciones__${ym}__${ym}`] = { pagado: manual ? Number(plan.pagadoManual) || 0 : auto };
    }
    return o;
  }, [pagosCuotas, liqRetiro, ym]);
  useEffect(() => onSnapshot(query(collection(db, "contabilidad_presupuestos_cliente"), where("mes", "==", ym)), (s) => setPres(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db, ym]);
  useEffect(() => onSnapshot(query(collection(db, "contabilidad_movimientos"), where("tipo", "==", "ingreso")), (s) => setMovs(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db]);
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError("");
    const desde = `${sumarMes(ym, -1)}-Q1`;
    const hasta = `${ym}-Q2`;
    const leer = (col) => getDocs(query(collection(db, col), where("periodoId", ">=", desde), where("periodoId", "<=", hasta)));
    Promise.all([leer("nomina_fiscal_liquidaciones"), leer("nomina_fiscal_destajo_liquidaciones"), leer("nomina_destajo_liquidaciones"), leer("nomina_prestacion_servicios_liquidaciones"), getDocs(collection(db, "costos_gastos_mes"))])
      .then(([f, fd, d, ps, g]) => {
        if (!vivo) return;
        const lista = (s) => s.docs.map((x) => ({ ...x.data(), id: x.id }));
        setLiq({ "Fiscal": lista(f), "Fiscal Destajo": lista(fd), "Destajo": lista(d), "Prestación de Servicios": lista(ps) });
        setGastos(lista(g));
        setCargando(false);
      })
      .catch((e) => { if (vivo) { setError(e?.message || "No se pudieron leer los datos."); setCargando(false); } });
    return () => { vivo = false; };
  }, [db, ym]);
  const res = useMemo(() => cuantoPagarMes({ ym, liquidaciones: liq, gastosDocs: gastos, cuotas }), [ym, liq, gastos, cuotas]);
  const cumpl = useMemo(() => cumplimientoPresupuesto({ ym, presupuestos: pres, movimientos: movs, confirmado: res.actual, estimado: res.estimado, hoyISO: `${ym}-15`, diasTotal: 0, diasTranscurridos: 0 }), [ym, pres, movs, res]);
  return { res, cumpl, cargando, error, pagosMapa };
}

function Dato({ titulo, valor, sub, color, fondo }) {
  return (
    <div style={{ flex: "1 1 200px", background: fondo || C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 21, fontWeight: 900, marginTop: 3, color: color || C.ink, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}
function Celda({ r }) {
  if (r.total <= 0) return <span style={{ color: C.slate }}>—</span>;
  if (r.paga >= r.total) return <span style={{ color: C.green, fontWeight: 800 }}>✓ Se paga todo</span>;
  if (r.paga > 0) return <span style={{ color: C.amber, fontWeight: 800 }}>Parcial: {money(r.paga)} · falta {money(r.falta)}</span>;
  return <span style={{ color: C.red, fontWeight: 700 }}>Negociar o aplazar</span>;
}

// (2026-11-08) Cupo para proveedores del mes en curso, para «Programar pagos a proveedores».
export function useCupoProveedores(db) {
  const ym = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7), []);
  const d = useMesFinanciero(db, ym);
  const salida = d.res.estimado.total;
  return { ym, cargando: d.cargando, error: d.error, abonado: d.cumpl.abonado, presupuestado: d.cumpl.presupuestado, salida, cupoCons: d.cumpl.abonado - salida, cupoPres: d.cumpl.presupuestado - salida, sinPresupuesto: d.cumpl.nivel === "sin_presupuesto" };
}

// items = cuentas por pagar ya ordenadas por urgencia: [{ nombre, total, tier, etiqueta }]
export default function QuePagarPrimero({ db, items }) {
  const ym = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7), []);
  const datos = useMesFinanciero(db, ym);
  return <QuePagarPrimeroVista items={items} ym={ym} res={datos.res} cumpl={datos.cumpl} cargando={datos.cargando} error={datos.error} pagosMapa={datos.pagosMapa} />;
}
export function QuePagarPrimeroVista({ items, ym, res, cumpl, cargando, error, pagosMapa }) {
  const [verTodas, setVerTodas] = useState(false);
  const est = res.estimado;
  const salida = est.total;
  const cupoCons = cumpl.abonado - salida;
  const cupoPres = cumpl.presupuestado - salida;
  const repCons = useMemo(() => repartirCupo(items, cupoCons), [items, cupoCons]);
  const repPres = useMemo(() => repartirCupo(items, cupoPres), [items, cupoPres]);
  const deudaTotal = (items || []).reduce((s, f) => s + f.total, 0);
  const cubreCons = repCons.reduce((s, r) => s + r.paga, 0);
  const cubrenCons = repCons.filter((r) => r.total > 0 && r.paga >= r.total).length;
  const cal = useMemo(() => calendarioObligaciones(est, res.actual.cuotasLista, ym, pagosMapa), [est, res, ym, pagosMapa]);
  const mesTxt = `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const filas = verTodas ? repCons : repCons.slice(0, 12);
  const sinPresupuesto = cumpl.nivel === "sin_presupuesto";

  return (
    <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 22 }}>
      <div style={{ fontSize: 17, fontWeight: 900, color: C.ink }}>¿Qué puedo pagar a proveedores en {mesTxt}?</div>
      <div style={{ fontSize: 12.5, color: C.slate, margin: "4px 0 12px", maxWidth: 860, lineHeight: 1.5 }}>
        Primero se separa lo que sale sí o sí (nómina, seguridad social, provisiones, gastos del Excel y cuotas, según «Cuánto debo pagar»). Lo que sobra de lo que entra es el cupo para proveedores, y se reparte en el orden de urgencia de abajo. Es una guía de lectura: no cambia el calendario de Cuentas por Pagar.
      </div>
      {error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>{error}</div> : null}
      {cargando ? <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Leyendo nómina, gastos y abonos…</div> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Dato titulo="Entra · abonado hasta hoy" valor={money(cumpl.abonado)} color={C.blue} sub={sinPresupuesto ? "No hay presupuesto de clientes cargado este mes" : `de ${money(cumpl.presupuestado)} presupuestados (sin Anticipo Tela)`} />
        <Dato titulo="Sale sí o sí · estimado del mes" valor={money(salida)} fondo={C.amberBg} sub={`Confirmado hoy: ${money(res.actual.total)}. El resto se estima con el mes anterior`} />
        <Dato titulo="Cupo para proveedores · conservador" valor={cupoCons >= 0 ? money(cupoCons) : `Faltan ${money(-cupoCons)}`} color={cupoCons >= 0 ? C.green : C.red} fondo={cupoCons >= 0 ? C.greenBg : C.redBg} sub="Solo con lo ya abonado" />
        <Dato titulo="Cupo para proveedores · presupuesto completo" valor={sinPresupuesto ? "—" : cupoPres >= 0 ? money(cupoPres) : `Faltan ${money(-cupoPres)}`} color={sinPresupuesto ? C.slate : cupoPres >= 0 ? C.green : C.red} sub="Si los clientes abonan todo lo presupuestado" />
      </div>
      {cupoCons < 0 ? (
        <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
          Con lo abonado hasta hoy todavía no se cubre ni lo obligatorio del mes: faltan {money(-cupoCons)} antes de poder pagarle a un solo proveedor.
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.ink, marginBottom: 12, lineHeight: 1.5 }}>
          Con el cupo conservador se pagan <b>{cubrenCons}</b> {cubrenCons === 1 ? "cuenta completa" : "cuentas completas"} y se cubre <b>{money(cubreCons)}</b> de <b>{money(deudaTotal)}</b> de deuda total con proveedores.
        </div>
      )}
      {items.length ? (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: C.canvas }}><th style={{ ...thL, width: 34 }}>#</th><th style={thL}>Proveedor</th><th style={thL}>Urgencia</th><th style={th}>Deuda</th><th style={thL}>Con el cupo conservador</th><th style={thL}>Con el presupuesto completo</th></tr></thead>
            <tbody>
              {filas.map((r, i) => (
                <tr key={`${r.nombre}-${i}`} style={{ opacity: r.paga <= 0 ? 0.65 : 1 }}>
                  <td style={{ ...tdL, color: C.slate }}>{i + 1}</td>
                  <td style={{ ...tdL, fontWeight: 700 }}>{r.nombre}</td>
                  <td style={{ ...tdL, fontSize: 11.5, color: C.slate }}>{r.etiqueta}</td>
                  <td style={td}>{money(r.total)}</td>
                  <td style={tdL}><Celda r={r} /></td>
                  <td style={tdL}>{sinPresupuesto ? <span style={{ color: C.slate }}>—</span> : <Celda r={repPres[i]} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 6 }}>No hay cuentas por pagar registradas todavía.</div>}
      {items.length > 12 ? (
        <button onClick={() => setVerTodas(!verTodas)} style={{ border: `1.5px solid ${C.border}`, background: C.white, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>{verTodas ? "Ver solo las 12 más urgentes" : `Ver las ${items.length} cuentas`}</button>
      ) : null}

      <div style={{ fontSize: 13.5, fontWeight: 800, margin: "12px 0 6px", color: C.ink }}>Qué sale en {mesTxt} y cuándo</div>
      <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: C.canvas }}><th style={{ ...thL, width: 90 }}>Día</th><th style={thL}>Concepto</th><th style={th}>Valor</th></tr></thead>
          <tbody>
            {cal.conFecha.map((f, i) => (<tr key={`c${i}`} style={{ background: f.pagado >= f.valor && f.valor > 0 ? C.greenBg : undefined }}><td style={tdL}>{f.dia}{f.aprox ? " (aprox.)" : ""}</td><td style={{ ...tdL, fontWeight: 700 }}><span style={{ textDecoration: f.pagado >= f.valor && f.valor > 0 ? "line-through" : "none" }}>{f.concepto}</span>{f.pagado >= f.valor && f.valor > 0 ? <span style={{ color: C.green, fontSize: 11.5, marginLeft: 8 }}>✓ pagada</span> : f.pagado > 0 ? <span style={{ color: C.amber, fontSize: 11.5, marginLeft: 8 }}>pagado {money(f.pagado)} · falta {money(f.valor - f.pagado)}</span> : null}</td><td style={td}>{money(f.valor)}</td></tr>))}
            {cal.sinDia.map((f, i) => (<tr key={`s${i}`} style={{ background: f.pagado >= f.valor && f.valor > 0 ? C.greenBg : undefined }}><td style={{ ...tdL, color: C.slate }}>Sin día fijo</td><td style={{ ...tdL, fontWeight: 700 }}><span style={{ textDecoration: f.pagado >= f.valor && f.valor > 0 ? "line-through" : "none" }}>{f.concepto}</span>{f.pagado >= f.valor && f.valor > 0 ? <span style={{ color: C.green, fontSize: 11.5, marginLeft: 8 }}>✓ pagada</span> : f.pagado > 0 ? <span style={{ color: C.amber, fontSize: 11.5, marginLeft: 8 }}>pagado {money(f.pagado)} · falta {money(f.valor - f.pagado)}</span> : null}</td><td style={td}>{money(f.valor)}</td></tr>))}
            <tr style={{ background: C.canvas }}><td style={tdL} /><td style={{ ...tdL, fontWeight: 900 }}>Total estimado del mes</td><td style={{ ...td, fontWeight: 900 }}>{money(salida)}</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.6, marginTop: 8 }}>
        Los abonos salen de los ingresos que clasificas en Financiera → Ingresos. Las fechas de nómina son aproximadas (día 15 y fin de mes); las cuotas usan su día de pago. Las cuentas por pagar son las del corte más reciente más las manuales, del mismo orden de urgencia que la tabla de abajo.
      </div>
    </div>
  );
}
