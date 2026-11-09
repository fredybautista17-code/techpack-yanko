// (2026-11-08, a pedido de Fredy) Financiera · «Proyección de deuda» (reemplaza a «Programación de Pagos» en el menú; la pantalla anterior queda
// al final, plegada, como «Programación anterior»). Con el ingreso mensual, cuánto queda libre cada mes después de lo que sale sí o sí y de las
// cuotas, cuánta deuda nueva cabe (simulador) y cuándo se pone al día con proveedores. Solo lectura y cálculo: no guarda nada.
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useMesFinanciero } from "./financiera-que-pagar";
import { C, caja, Boton, Ventana, Tarjeta } from "./financiera-cuanto-pagar";
import { sumarMes } from "./financiera-cuanto-pagar-calculo";
import { HORIZONTE, ESCENARIOS, ingresosBase, presupuestoClientesPorMes, proyectarDeuda, operacionDe } from "./financiera-proyeccion-deuda-calculo";
import { ultimoCorte, armarProveedoresPagar } from "./financiera-programar-pagos-calculo";
import { comprasProyectadas, categoriaDeMateriales } from "./financiera-proyeccion-compras-calculo";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const etq = (ym) => { const [a, m] = String(ym).split("-").map(Number); return `${MESES[m - 1]} ${String(a).slice(2)}`; };
const etqLargo = (ym) => { const [a, m] = String(ym).split("-").map(Number); return `${MESES[m - 1]} ${a}`; };
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const fm = (n) => { const v = Math.round((Number(n) || 0) / 1e5) / 10; return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + " M"; };
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "7px 8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left", fontWeight: 700 };
const entrada = { width: "100%", padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: C.ink };
const etiquetaSim = { display: "block", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, margin: "9px 0 3px" };
const ESTADOS = { noAlcanza: ["No alcanza", C.red, C.redBg], ajustado: ["Ajustado", C.amber, C.amberBg], colchon: ["Con colchón", C.green, C.greenBg] };
const Pastilla = ({ k }) => <span style={{ background: ESTADOS[k][2], color: ESTADOS[k][1], borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{ESTADOS[k][0]}</span>;
const Bloque = ({ titulo, children }) => (
  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{titulo}</div>
    {children}
  </div>
);
const Linea = ({ t, v, color, fuerte, sub }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 13, ...(fuerte ? { borderTop: `2px solid ${C.ink}`, marginTop: 4, paddingTop: 6, fontWeight: 900 } : null) }}>
    <span>{t}{sub ? <div style={{ fontSize: 11, color: C.slate, fontWeight: 400 }}>{sub}</div> : null}</span>
    <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: color || C.ink, whiteSpace: "nowrap" }}>{v}</span>
  </div>
);

// Facturas abiertas de Yanko (último corte de Busint) → lo vencido y lo que vence en 30 días.
function useDeudaProveedores(db) {
  const [cortes, setCortes] = useState([]);
  const [facturas, setFacturas] = useState({});
  const [plazos, setPlazos] = useState({});
  const [manuales, setManuales] = useState([]);
  useEffect(() => {
    const e = () => {};
    const u = [
      onSnapshot(collection(db, "contabilidad_cxp_cortes"), (s) => setCortes(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_cxp_facturas"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setFacturas(m); }, e),
      onSnapshot(doc(db, "contabilidad_cxp_plazos", "main"), (s) => setPlazos(s.exists() ? s.data()?.plazos || {} : {}), e),
      onSnapshot(collection(db, "contabilidad_cxp_manual"), (s) => setManuales(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
    ];
    return () => u.forEach((f) => f());
  }, [db]);
  return useMemo(() => {
    const corte = ultimoCorte(cortes, "yanko");
    if (!corte) return null;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const provs = armarProveedoresPagar({ empresa: "yanko", corte, facturasGuardadas: facturas, plazos, nombresProveedor: {}, manuales: manuales.filter((m) => m.empresa !== "indutex"), hoy });
    const suma = (clase) => provs.reduce((s, p) => s + p.items.filter((i) => i.clase === clase).reduce((t, i) => t + i.saldo, 0), 0);
    return { vencido: suma("vencido"), dentro: suma("dentro"), fechaCorte: corte.fechaCorte };
  }, [cortes, facturas, plazos, manuales]);
}

// (2026-11-09) Los ajustes que Fredy deja en esta pantalla (ingreso, colchón, compras de materiales) se recuerdan en el navegador para que
// Estrategia de Pago y Vencimientos calculen con los mismos supuestos. Si no hay nada guardado, valen los de siempre.
const OPC_KEY = "atlas_proyeccion_deuda_opciones";
export function leerOpciones() {
  let o = {};
  try { o = JSON.parse(window.localStorage.getItem(OPC_KEY) || "{}") || {}; } catch (e) { o = {}; }
  return {
    escenario: ESCENARIOS.some((x) => x.k === o.escenario) ? o.escenario : "cons",
    colchonPct: [0, 0.1, 0.2].includes(o.colchonPct) ? o.colchonPct : 0.1,
    incluirCompras: o.incluirCompras !== false,
    catMat: typeof o.catMat === "string" ? o.catMat : "",
    plazoCompra: [0, 1, 2].includes(o.plazoCompra) ? o.plazoCompra : 1,
    gastosModo: o.gastosModo === "anterior" ? "anterior" : "promedio",
  };
}
function guardarOpciones(o) {
  try { window.localStorage.setItem(OPC_KEY, JSON.stringify(o)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
}

// Lo que sale y lo que queda libre MES A MES según la Proyección de Deuda (sin deuda nueva simulada), para Estrategia de Pago y Vencimientos.
// meses[ym] = { ingreso, operacion, compras, cuotas, salidas (= operación + compras + cuotas), margen, colchon, paraProveedores }.
export function useProyeccionMensual(db, horizonte = 26) {
  const ymHoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7), []);
  const datos = useMesFinanciero(db, ymHoy);
  const [cacheTotal, setCacheTotal] = useState(null);
  const [cacheBusint, setCacheBusint] = useState(null);
  const [presClientes, setPresClientes] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [catLista, setCatLista] = useState([]);
  const [catPorConcepto, setCatPorConcepto] = useState([]);
  useEffect(() => {
    const e = () => {};
    const u = [
      onSnapshot(doc(db, "financiera_ingresos_cache", "total_yanko"), (s) => setCacheTotal(s.exists() ? s.data() : null), e),
      onSnapshot(doc(db, "financiera_ingresos_cache", "main"), (s) => setCacheBusint(s.exists() ? s.data() : null), e),
      onSnapshot(collection(db, "contabilidad_presupuestos_cliente"), (s) => setPresClientes(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_presupuestos"), (s) => setPresupuestos(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_proyeccion_categorias_lista"), (s) => setCatLista(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_proyeccion_categorias_concepto"), (s) => setCatPorConcepto(s.docs.map((d) => ({ ...d.data(), codConcep: d.id }))), e),
    ];
    return () => u.forEach((f) => f());
  }, [db]);
  const opc = useMemo(() => leerOpciones(), []);
  const base = useMemo(() => ingresosBase(cacheTotal || cacheBusint, ymHoy, 6), [cacheTotal, cacheBusint, ymHoy]);
  const presupuestoMes = useMemo(() => presupuestoClientesPorMes(presClientes), [presClientes]);
  const ant = datos.res.anterior;
  const operacion = useMemo(() => operacionDe(datos.res, opc.gastosModo), [datos.res, opc]);
  const catEfectiva = opc.catMat && catLista.some((c) => c.id === opc.catMat) ? opc.catMat : categoriaDeMateriales(catLista);
  const comprasMes = useMemo(() => (opc.incluirCompras && catEfectiva
    ? comprasProyectadas({ presupuestos, categoriasLista: catLista, categoriasPorConcepto: catPorConcepto, categoriaId: catEfectiva, ymInicio: ymHoy, horizonte, plazoMeses: opc.plazoCompra }).pagoMes
    : null), [opc, catEfectiva, presupuestos, catLista, catPorConcepto, ymHoy, horizonte]);
  const r = useMemo(() => proyectarDeuda({
    ymInicio: ymHoy, horizonte, escenario: opc.escenario, base, presupuestoMes, operacion, cuotas: datos.cuotas, colchonPct: opc.colchonPct,
    nueva: { cuota: 0, plazo: 1, desde: sumarMes(ymHoy, 1) }, proveedores: null, comprasMes,
  }), [ymHoy, horizonte, opc, base, presupuestoMes, operacion, datos.cuotas, comprasMes]);
  const meses = useMemo(() => {
    const m = {};
    r.meses.forEach((x) => { m[x.ym] = { ingreso: x.ingreso, operacion: x.operacion, compras: x.compras, cuotas: x.cuotas, salidas: x.operacion + x.compras + x.cuotas, margen: x.margen, colchon: x.colchon, paraProveedores: x.paraProveedores }; });
    return m;
  }, [r]);
  const esc = ESCENARIOS.find((x) => x.k === opc.escenario);
  return {
    listo: !datos.cargando, error: datos.error, meses, ymHoy, sinIngresos: !base, sinNomina: !ant.hayDatos,
    resumen: `ingreso ${esc ? esc.txt.toLowerCase() : "conservador"}, colchón del ${Math.round(opc.colchonPct * 100)} %, ${comprasMes ? `compras de materiales a ${opc.plazoCompra === 0 ? "contado" : `${opc.plazoCompra * 30} días`}` : "sin compras de materiales"}`,
  };
}

export default function ProyeccionDeudaView({ db, isAdmin, vistaAnterior, vistaPresupuesto }) {
  const ymHoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7), []);
  const datos = useMesFinanciero(db, ymHoy);
  const deudaProv = useDeudaProveedores(db);
  const [cacheTotal, setCacheTotal] = useState(null);
  const [cacheBusint, setCacheBusint] = useState(null);
  const [presClientes, setPresClientes] = useState([]);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_cache", "total_yanko"), (s) => setCacheTotal(s.exists() ? s.data() : null), () => {}), [db]);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_cache", "main"), (s) => setCacheBusint(s.exists() ? s.data() : null), () => {}), [db]);
  useEffect(() => onSnapshot(collection(db, "contabilidad_presupuestos_cliente"), (s) => setPresClientes(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), [db]);

  const [escenario, setEscenario] = useState(() => leerOpciones().escenario);
  const [colchonPct, setColchonPct] = useState(() => leerOpciones().colchonPct);
  const [gastosModo, setGastosModo] = useState(() => leerOpciones().gastosModo);
  const [cuotaTxt, setCuotaTxt] = useState("");
  const [plazoTxt, setPlazoTxt] = useState("24");
  const [desde, setDesde] = useState(sumarMes(ymHoy, 1));
  const [detalle, setDetalle] = useState(null);
  const [verAnterior, setVerAnterior] = useState(false);
  const [verPresupuesto, setVerPresupuesto] = useState(false);
  // (2026-11-09) Compras de materiales que se vienen (del presupuesto de Proyección): se restan antes del dinero para proveedores.
  const [incluirCompras, setIncluirCompras] = useState(() => leerOpciones().incluirCompras);
  const [catMat, setCatMat] = useState(() => leerOpciones().catMat);
  const [plazoCompra, setPlazoCompra] = useState(() => leerOpciones().plazoCompra);
  useEffect(() => { guardarOpciones({ escenario, colchonPct, incluirCompras, catMat, plazoCompra, gastosModo }); }, [escenario, colchonPct, incluirCompras, catMat, plazoCompra, gastosModo]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [catLista, setCatLista] = useState([]);
  const [catPorConcepto, setCatPorConcepto] = useState([]);
  useEffect(() => {
    const e = () => {};
    const u = [
      onSnapshot(collection(db, "contabilidad_presupuestos"), (s) => setPresupuestos(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_proyeccion_categorias_lista"), (s) => setCatLista(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_proyeccion_categorias_concepto"), (s) => setCatPorConcepto(s.docs.map((d) => ({ ...d.data(), codConcep: d.id }))), e),
    ];
    return () => u.forEach((f) => f());
  }, [db]);
  const catEfectiva = catMat && catLista.some((c) => c.id === catMat) ? catMat : categoriaDeMateriales(catLista);
  const compras = useMemo(() => comprasProyectadas({
    presupuestos, categoriasLista: catLista, categoriasPorConcepto: catPorConcepto, categoriaId: catEfectiva, ymInicio: ymHoy, horizonte: HORIZONTE, plazoMeses: plazoCompra,
  }), [presupuestos, catLista, catPorConcepto, catEfectiva, ymHoy, plazoCompra]);
  const comprasMes = incluirCompras && catEfectiva ? compras.pagoMes : null;

  const base = useMemo(() => ingresosBase(cacheTotal || cacheBusint, ymHoy, 6), [cacheTotal, cacheBusint, ymHoy]);
  const presupuestoMes = useMemo(() => presupuestoClientesPorMes(presClientes), [presClientes]);
  const ant = datos.res.anterior;
  const hayBase = !!ant.hayDatos;
  const operacion = useMemo(() => operacionDe(datos.res, gastosModo), [datos.res, gastosModo]);
  const r = useMemo(() => proyectarDeuda({
    ymInicio: ymHoy, escenario, base, presupuestoMes, operacion, cuotas: datos.cuotas, colchonPct,
    nueva: { cuota: Number(cuotaTxt) || 0, plazo: Number(plazoTxt) || 1, desde }, proveedores: deudaProv, comprasMes,
  }), [ymHoy, escenario, base, presupuestoMes, operacion, datos.cuotas, colchonPct, cuotaTxt, plazoTxt, desde, deudaProv, comprasMes]);
  const hoy = r.meses[0];
  const pctColchon = Math.round(colchonPct * 100);
  const esc = ESCENARIOS.find((e) => e.k === escenario);
  const mesDetalle = detalle !== null ? r.meses[detalle] : null;

  // Veredicto del simulador
  let veredicto;
  if (!(r.cuotaNueva > 0)) veredicto = { c: "med", t: `Escribe una cuota para ver si te cabe. La máxima segura en esa ventana es ${fm(r.cuotaMaxSegura)}.` };
  else if (r.mesesNoAlcanzan.length) veredicto = { c: "mal", t: `No te cabe: en ${r.mesesNoAlcanzan.length} mes${r.mesesNoAlcanzan.length > 1 ? "es" : ""} no alcanzaría (desde ${etqLargo(r.mesesNoAlcanzan[0].ym)}). La cuota máxima segura con esas fechas es ${fm(r.cuotaMaxSegura)}.` };
  else if (r.mesesAjustados.length) veredicto = { c: "med", t: `Te cabe, pero ajustado: en ${r.mesesAjustados.length} mes${r.mesesAjustados.length > 1 ? "es" : ""} quedas por debajo del colchón del ${pctColchon} %. El mes más apretado deja ${fm(r.peorMesNuevo.margen)} libres.` };
  else veredicto = { c: "ok", t: `Te cabe con colchón. El mes más apretado deja ${fm(r.peorMesNuevo ? r.peorMesNuevo.margen : 0)} libres y nunca bajas del ${pctColchon} % de reserva.` };
  const COLV = { ok: [C.greenBg, C.green], med: [C.amberBg, C.amber], mal: [C.redBg, C.red] }[veredicto.c];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 900, color: C.ink }}>Proyección de deuda</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, maxWidth: 860, lineHeight: 1.5 }}>
          Con el ingreso que entra cada mes: cuánto te queda libre después de lo que sale sí o sí y de las cuotas, cuánta deuda nueva te cabe y cuándo te pones al día con proveedores. La operación se repite todos los meses (no ve temporadas): nómina, seguridad social y provisiones del <b>mes anterior</b>, y los gastos (Excel y Planta: repuestos, hilazas) como <b>promedio de los meses anteriores</b> (o solo el mes anterior, a tu elección).
        </div>
      </div>
      {datos.error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>{datos.error}</div> : null}
      {datos.cargando ? <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Leyendo nómina, gastos y cuotas…</div> : null}
      {!base ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>Todavía no hay abonos de clientes guardados. Entra a Financiera → Ingresos y pulsa «Traer desde TNS y Busint»; sin eso el ingreso queda en $0.</div> : null}
      {!hayBase && !datos.cargando ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>No hay nómina confirmada del mes anterior ({etqLargo(ant.ym)}): la operación sale en $0 y el margen se vería mejor de lo real. Confirma las quincenas en Pago de Nómina.</div> : null}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: C.slate, marginRight: 4 }}>Ingreso mensual:</span>
        {ESCENARIOS.map((e) => (
          <button key={e.k} onClick={() => setEscenario(e.k)} title={e.ayuda} style={{ border: `1.5px solid ${escenario === e.k ? C.ink : C.border}`, background: escenario === e.k ? C.ink : C.white, color: escenario === e.k ? C.white : C.ink, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{e.txt}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.slate }}>Gastos:</span>
        <select value={gastosModo} onChange={(e) => setGastosModo(e.target.value)} style={{ ...entrada, width: "auto" }} title="Excel de gastos + gastos de Planta (repuestos, hilazas)">
          <option value="promedio">Promedio de meses anteriores</option><option value="anterior">Solo el mes anterior</option>
        </select>
        <span style={{ fontSize: 12, color: C.slate }}>Colchón de seguridad:</span>
        <select value={colchonPct} onChange={(e) => setColchonPct(Number(e.target.value))} style={{ ...entrada, width: "auto" }}>
          <option value={0}>Sin colchón</option><option value={0.1}>10 % del ingreso</option><option value={0.2}>20 % del ingreso</option>
        </select>
      </div>

      <div style={{ ...caja, marginBottom: 12, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 800, color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={incluirCompras} onChange={(e) => setIncluirCompras(e.target.checked)} />
            Incluir compras futuras de materiales
          </label>
          <div style={{ flex: 1 }} />
          {incluirCompras ? (
            <>
              <span style={{ fontSize: 12, color: C.slate }}>Categoría:</span>
              <select value={catEfectiva} onChange={(e) => setCatMat(e.target.value)} style={{ ...entrada, width: "auto", maxWidth: 260 }}>
                {!catEfectiva ? <option value="">Elige la categoría de telas…</option> : null}
                {catLista.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <span style={{ fontSize: 12, color: C.slate }}>Se paga a:</span>
              <select value={plazoCompra} onChange={(e) => setPlazoCompra(Number(e.target.value))} style={{ ...entrada, width: "auto" }}>
                <option value={0}>Contado (el mismo mes)</option><option value={1}>30 días</option><option value={2}>60 días</option>
              </select>
            </>
          ) : null}
        </div>
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, lineHeight: 1.5 }}>
          {!incluirCompras ? "Apagado: la proyección solo cuenta nómina, gastos y cuotas, y deja libre la plata que en realidad se va en comprar tela e insumos."
            : !catEfectiva ? "No encuentro la categoría de telas e insumos en Proyección. Elígela arriba (o créala en Financiera → Administración)."
            : compras.sinDatos ? "La categoría elegida no tiene presupuesto en Proyección: no hay compras que restar. Crea el presupuesto de un mes abajo, en «Presupuesto de compras (Proyección)»."
            : `Promedio presupuestado: ${fm(compras.base.promedio)} al mes (${compras.base.meses.map((x) => etq(x.ym)).join(", ")}); los meses sin presupuesto usan ese promedio. Se resta lo que se pague desde ${etqLargo(sumarMes(ymHoy, plazoCompra))}; lo comprado hasta hoy ya está en Cuentas por Pagar.`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Tarjeta titulo="Ingreso mensual esperado" valor={fm(hoy.ingreso)} sub={base ? `${esc.ayuda} (${etq(base.desde)}–${etq(base.hasta)})` : "Sin datos de ingresos"} />
        <Tarjeta titulo="Sale sí o sí" valor={fm(r.operacionTotal)} fondo={C.amberBg} sub={`Nómina, seguridad y provisiones de ${etqLargo(ant.ym)}; gastos ${r.operacion.gastosModo === "promedio" ? "promedio de meses anteriores" : "del mes anterior"}`} />
        <Tarjeta titulo="Cuotas de hoy" valor={fm(hoy.cuotas)} sub={`${hoy.cuotasLista.length} cuota${hoy.cuotasLista.length === 1 ? "" : "s"} vigente${hoy.cuotasLista.length === 1 ? "" : "s"}${hoy.ingreso > 0 ? ` · ${Math.round((hoy.cuotas / hoy.ingreso) * 100)} % del ingreso` : ""}`} />
        <Tarjeta titulo="Margen libre hoy" valor={fm(hoy.margenBase)} colorValor={hoy.margenBase >= 0 ? C.green : C.red} fondo={hoy.margenBase >= hoy.colchon ? C.greenBg : C.redBg} sub="Ingreso − lo que sale − cuotas" />
        <Tarjeta titulo="Cuota máxima segura" valor={fm(r.cuotaMaxSegura)} colorValor={C.blue} fondo={C.blueBg} sub={`Deuda nueva que cabe en ${r.plazo} meses desde ${etq(r.desde)}, con colchón del ${pctColchon} %`} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ ...caja, flex: "1.6 1 520px", minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Ingreso contra lo que sale, mes a mes</div>
          <Grafica meses={r.meses} onMes={setDetalle} />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: C.slate, marginTop: 6 }}>
            <span><i style={{ display: "inline-block", width: 10, height: 10, background: "#8A8FA8", borderRadius: 2, marginRight: 5 }} />Sale sí o sí</span>
            {r.comprasTotal > 0 ? <span><i style={{ display: "inline-block", width: 10, height: 10, background: C.amber, borderRadius: 2, marginRight: 5 }} />Compras de tela e insumos</span> : null}
            <span><i style={{ display: "inline-block", width: 10, height: 10, background: C.red, borderRadius: 2, marginRight: 5 }} />Cuotas de hoy</span>
            <span><i style={{ display: "inline-block", width: 10, height: 10, background: C.violet, borderRadius: 2, marginRight: 5 }} />Deuda nueva simulada</span>
            <span><i style={{ display: "inline-block", width: 10, height: 10, background: C.green, borderRadius: 2, marginRight: 5 }} />Línea: ingreso esperado</span>
          </div>
        </div>
        <div style={{ ...caja, flex: "1 1 300px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>¿Me cabe esta deuda?</div>
          <div style={{ fontSize: 11.5, color: C.slate, margin: "2px 0 2px" }}>Escribe la cuota, el plazo y desde cuándo, y mira cómo cambian los meses. No se guarda nada.</div>
          <label style={etiquetaSim}>Cuota mensual (pesos)</label>
          <input value={cuotaTxt} inputMode="numeric" placeholder={`Máxima segura: ${money(r.cuotaMaxSegura)}`} onChange={(e) => setCuotaTxt(e.target.value.replace(/[^\d]/g, ""))} style={entrada} />
          {r.cuotaMaxSegura > 0 ? <div style={{ marginTop: 5 }}><Boton chico onClick={() => setCuotaTxt(String(Math.floor(r.cuotaMaxSegura)))}>Usar la máxima segura</Boton></div> : null}
          <label style={etiquetaSim}>Plazo (meses)</label>
          <input value={plazoTxt} inputMode="numeric" onChange={(e) => setPlazoTxt(e.target.value.replace(/[^\d]/g, "").slice(0, 2))} style={entrada} />
          <label style={etiquetaSim}>Empieza en</label>
          <select value={desde} onChange={(e) => setDesde(e.target.value)} style={entrada}>
            {r.meses.map((m) => <option key={m.ym} value={m.ym}>{etqLargo(m.ym)}</option>)}
          </select>
          <div style={{ marginTop: 12, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, lineHeight: 1.5, background: COLV[0], color: COLV[1] }}>{veredicto.t}</div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>Cuota máxima segura = margen del peor mes de esa ventana, menos el colchón.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ ...caja, flex: "1.6 1 420px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>Cuándo te pones al día con proveedores</div>
          {deudaProv ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <Tarjeta titulo="Vencido en Cuentas por Pagar" valor={fm(deudaProv.vencido)} sub={`Corte de Yanko del ${deudaProv.fechaCorte}`} />
                <Tarjeta titulo="Vence en los próximos 30 días" valor={fm(deudaProv.dentro)} sub="Después de lo vencido" />
              </div>
              <div style={{ height: 10, borderRadius: 6, background: C.canvas, overflow: "hidden", margin: "6px 0 4px" }}>
                <div style={{ height: "100%", width: `${Math.min(100, deudaProv.vencido + deudaProv.dentro > 0 ? (r.acumProveedores / (deudaProv.vencido + deudaProv.dentro)) * 100 : 0)}%`, background: C.green }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {deudaProv.vencido <= 0 && deudaProv.dentro <= 0 ? "No hay facturas vencidas ni por vencer en 30 días en el último corte."
                  : r.cubreVencido === null && deudaProv.vencido > 0 ? <span style={{ color: C.red }}>En los próximos {HORIZONTE} meses no alcanzas a cubrir ni lo vencido (cubres {fm(r.acumProveedores)} de {fm(deudaProv.vencido)}).</span>
                  : <span>{deudaProv.vencido > 0 ? <>Cubres lo vencido en <span style={{ color: C.green }}>{r.cubreVencido + 1} mes{r.cubreVencido ? "es" : ""} ({etqLargo(r.meses[r.cubreVencido].ym)})</span></> : "No tienes vencido"}{r.cubreTodo !== null ? ` y lo de 30 días en ${etqLargo(r.meses[r.cubreTodo].ym)}.` : "; lo de 30 días no alcanza a cubrirse en este horizonte."}</span>}
              </div>
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>Cada mes se destina a proveedores el margen libre después del colchón: primero lo vencido y luego lo de 30 días. Los anticipos a proveedores no se restan.</div>
            </>
          ) : <div style={{ fontSize: 12.5, color: C.slate }}>No hay un corte de Cuentas por Pagar de Yanko. Tráelo desde Contabilidad → Cuentas por pagar → «Traer desde Busint».</div>}
        </div>
        <div style={{ ...caja, flex: "1 1 320px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Indicadores para decidir</div>
          <Linea t="Cuotas sobre el ingreso (hoy)" v={hoy.ingreso > 0 ? `${Math.round((hoy.cuotas / hoy.ingreso) * 100)} %` : "—"} />
          <Linea t="Cobertura del mes más apretado (ingreso ÷ salidas)" v={r.coberturaMinima === null ? "—" : `${r.coberturaMinima.toFixed(2).replace(".", ",")} ×`} color={r.coberturaMinima === null ? C.ink : r.coberturaMinima >= 1.1 ? C.green : r.coberturaMinima >= 1 ? C.amber : C.red} />
          <Linea t="Meses que no alcanzan en el horizonte" v={`${r.mesesNoAlcanzan.length} de ${HORIZONTE}`} color={r.mesesNoAlcanzan.length ? C.red : C.green} />
          {r.libera.slice(0, 4).map((c) => <Linea key={c.nombre + c.hasta} t={`Se libera ${fm(c.valor)} al mes cuando termina «${c.nombre}»`} v={etq(c.liberaEn)} />)}
          {!r.libera.length ? <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>Ninguna cuota termina dentro de los próximos {HORIZONTE} meses (o no tienen fecha de fin).</div> : null}
        </div>
      </div>

      <div style={{ ...caja, overflowX: "auto", marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Mes a mes <span style={{ fontWeight: 400, color: C.slate, fontSize: 12 }}>· toca un mes (o una barra de la gráfica) para ver qué tiene</span></div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={thL}>Mes</th><th style={th}>Ingreso</th><th style={th}>Sale sí o sí</th>{r.comprasTotal > 0 ? <th style={th}>Compras tela</th> : null}<th style={th}>Cuotas hoy</th><th style={th}>Deuda nueva</th><th style={th}>Margen libre</th><th style={th}>Para proveedores</th><th style={th}>Estado</th><th style={th} /></tr></thead>
          <tbody>
            {r.meses.map((m) => (
              <tr key={m.ym} onClick={() => setDetalle(m.i)} style={{ cursor: "pointer" }}>
                <td style={tdL}>{etq(m.ym)}</td>
                <td style={td}>{fm(m.ingreso)}</td>
                <td style={td}>{fm(m.operacion)}</td>
                {r.comprasTotal > 0 ? <td style={td}>{m.compras ? fm(m.compras) : "—"}</td> : null}
                <td style={td}>{fm(m.cuotas)}</td>
                <td style={td}>{m.nueva ? fm(m.nueva) : "—"}</td>
                <td style={{ ...td, fontWeight: 800, color: m.margen >= 0 ? C.ink : C.red }}>{fm(m.margen)}</td>
                <td style={td}>{fm(m.paraProveedores)}</td>
                <td style={td}><Pastilla k={m.estado} /></td>
                <td style={{ ...td, color: C.red, fontWeight: 700 }}>ver detalle ›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {vistaPresupuesto ? (
        <div style={{ ...caja, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Presupuesto de compras (Proyección)</div>
              <div style={{ fontSize: 12, color: C.slate }}>Aquí se crean y se ajustan los presupuestos por mes de compras (telas, insumos, servicios…). De la categoría de telas e insumos salen las «Compras de materiales proyectadas» de arriba.</div>
            </div>
            <Boton chico onClick={() => setVerPresupuesto((v) => !v)}>{verPresupuesto ? "Ocultar" : "Ver"}</Boton>
          </div>
          {verPresupuesto ? <div style={{ marginTop: 14 }}>{vistaPresupuesto}</div> : null}
        </div>
      ) : null}

      {vistaAnterior ? (
        <div style={{ ...caja }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Programación anterior (presupuesto de compras)</div>
              <div style={{ fontSize: 12, color: C.slate }}>La pantalla de antes: ingresos del presupuesto de clientes contra las compras de Proyección y el calendario de Cuentas por Pagar, a 24 meses. No incluye nómina ni cuotas. Se deja aquí para comparar.</div>
            </div>
            <Boton chico onClick={() => setVerAnterior((v) => !v)}>{verAnterior ? "Ocultar" : "Ver"}</Boton>
          </div>
          {verAnterior ? <div style={{ marginTop: 14 }}>{vistaAnterior}</div> : null}
        </div>
      ) : null}

      {mesDetalle ? <DetalleMes m={mesDetalle} r={r} escenario={escenario} pctColchon={pctColchon} total={deudaProv ? deudaProv.vencido + deudaProv.dentro : 0} onClose={() => setDetalle(null)} /> : null}
    </div>
  );
}

function DetalleMes({ m, r, escenario, pctColchon, total, onClose }) {
  const msg = m.estado === "noAlcanza" ? `Este mes NO alcanza: faltan ${money(-m.margen)} para cubrir todo lo que sale.` : m.estado === "ajustado" ? `Alcanza, pero queda por debajo del colchón del ${pctColchon} % (${money(m.colchon)}).` : `Alcanza con colchón: después de reservar el ${pctColchon} % del ingreso quedan ${money(m.margen - m.colchon)} para proveedores.`;
  const c = ESTADOS[m.estado];
  const op = r.operacion;
  const cambios = [
    ...m.terminaron.map((x) => ({ t: `«${x.nombre}» terminó en ${etq(x.hasta)}`, v: `libera ${money(x.valorMensual)}` })),
    ...m.terminan.map((x) => ({ t: `«${x.nombre}» termina este mes (última cuota)`, v: `libera ${money(x.valorMensual)} después` })),
    ...m.empiezan.map((x) => ({ t: `«${x.nombre}» empieza este mes`, v: `suma ${money(x.valorMensual)}` })),
  ];
  return (
    <Ventana titulo={`${etqLargo(m.ym)} · ${c[0]}`} sub="Qué tiene este mes: de dónde entra, qué sale y cuánto queda" onClose={onClose} ancho={720}>
      <div style={{ background: c[2], color: c[1], borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>{msg}</div>
      <Bloque titulo="Entra"><Linea t={`Ingreso esperado (${m.ingresoOrigen})`} v={money(m.ingreso)} /></Bloque>
      <Bloque titulo="Sale sí o sí · nómina del mes anterior, gastos según tu elección">
        <Linea t="Nómina (neto a pagar)" v={money(op.nomina)} />
        <Linea t="Seguridad social" v={money(op.seguridad)} />
        <Linea t="Provisiones (cesantías, intereses, prima, vacaciones)" v={money(op.provisiones)} />
        <Linea t="Gastos del Excel" sub={op.gastosModo === "promedio" ? "Promedio de los meses anteriores con gastos" : "Del mes anterior"} v={money(op.gastosExcel)} />
        <Linea t="Gastos de Planta (repuestos, hilazas…)" sub={op.gastosModo === "promedio" ? "Promedio de los meses anteriores con gastos registrados en Planta" : "Del mes anterior"} v={money(op.gastosPlanta)} />
        <Linea fuerte t="Total que sale sí o sí" v={money(m.operacion)} />
      </Bloque>
      {m.compras > 0 ? <Bloque titulo="Compras de materiales proyectadas"><Linea t="Pago de tela e insumos que se compran más adelante" sub="Del presupuesto de Proyección, según el plazo de pago elegido" v={money(m.compras)} /></Bloque> : null}
      <Bloque titulo="Cuotas de endeudamiento este mes">
        {m.cuotasLista.length ? m.cuotasLista.map((x, k) => <Linea key={x.id || k} t={x.nombre} sub={`${x.acreedor ? `${x.acreedor} · ` : ""}${x.hasta ? (x.hasta === m.ym ? "Última cuota este mes" : `Termina en ${etq(x.hasta)}`) : "Sin fecha de fin"}`} v={money(x.valorMensual)} />) : <Linea t="Sin cuotas vigentes: ya no hay deuda por cuotas." v="$0" />}
        <Linea fuerte t="Total cuotas" v={money(m.cuotas)} />
      </Bloque>
      {m.nueva > 0 ? <Bloque titulo="Deuda nueva simulada"><Linea t={`Cuota nueva (${r.plazo} meses desde ${etq(r.desde)})`} v={money(m.nueva)} /></Bloque> : null}
      {cambios.length ? <Bloque titulo="Qué cambió frente a hoy">{cambios.map((x, k) => <Linea key={k} t={x.t} v={x.v} />)}</Bloque> : null}
      <Bloque titulo="Resultado del mes">
        <Linea t={`Ingreso − lo que sale${m.compras ? " − compras" : ""} − cuotas${m.nueva ? " − deuda nueva" : ""}`} v={money(m.margen)} color={m.margen >= 0 ? C.green : C.red} />
        <Linea t={`Colchón de seguridad (${pctColchon} % del ingreso)`} v={money(m.colchon)} />
        <Linea t="Disponible para proveedores" v={money(m.paraProveedores)} />
        {total > 0 ? <Linea t="Acumulado para proveedores hasta este mes" v={`${money(m.acumProveedores)} de ${money(total)}`} /> : null}
        <Linea t="Cobertura (ingreso ÷ salidas)" v={m.cobertura === null ? "—" : `${m.cobertura.toFixed(2).replace(".", ",")} ×`} />
      </Bloque>
    </Ventana>
  );
}

function Grafica({ meses, onMes }) {
  const W = 900, H = 270, pl = 46, pr = 10, pt = 14, pb = 34;
  const N = meses.length;
  const maxBruto = Math.max(1, ...meses.map((m) => Math.max(m.ingreso, m.operacion + m.compras + m.cuotas + m.nueva))) * 1.08 / 1e6;
  const paso = Math.max(10, Math.ceil(maxBruto / 5 / 50) * 50);
  const maxV = paso * 5;
  const iw = (W - pl - pr) / N, bw = iw * 0.62;
  const y = (v) => pt + (H - pt - pb) * (1 - v / maxV);
  const mm = (v) => v / 1e6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gráfica de ingreso contra salidas por mes" style={{ display: "block" }}>
      <text x={pl} y={10} fontSize="10" fill={C.slate}>millones de pesos</text>
      {[0, 1, 2, 3, 4, 5].map((g) => <g key={g}><line x1={pl} x2={W - pr} y1={y(g * paso)} y2={y(g * paso)} stroke={C.border} strokeWidth="1" /><text x={pl - 6} y={y(g * paso) + 4} textAnchor="end" fontSize="10" fill={C.slate}>{g * paso}</text></g>)}
      {meses.map((m) => {
        const x = pl + m.i * iw + (iw - bw) / 2;
        let acum = 0;
        const partes = [[m.operacion, "#8A8FA8"], [m.compras, C.amber], [m.cuotas, C.red], [m.nueva, C.violet]];
        const total = mm(m.operacion + m.compras + m.cuotas + m.nueva);
        return (
          <g key={m.ym} style={{ cursor: "pointer" }} onClick={() => onMes(m.i)}>
            <rect x={pl + m.i * iw} y={pt} width={iw} height={H - pt - pb} fill="transparent" />
            {partes.map(([v, col], k) => { if (!(v > 0)) return null; const h0 = y(acum), h1 = y(acum + mm(v)); acum += mm(v); return <rect key={k} x={x} y={h1} width={bw} height={h0 - h1} fill={col} />; })}
            {total > mm(m.ingreso) ? <rect x={x - 2} y={y(total)} width={bw + 4} height={y(mm(m.ingreso)) - y(total)} fill="none" stroke={C.red} strokeWidth="1.5" strokeDasharray="3 2" /> : null}
            <text x={x + bw / 2} y={H - pb + 14} textAnchor="middle" fontSize="9.5" fill={C.slate}>{etq(m.ym).split(" ")[0]}</text>
            {(m.i === 0 || m.ym.endsWith("-01")) ? <text x={x + bw / 2} y={H - pb + 26} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={C.ink}>{m.ym.slice(0, 4)}</text> : null}
          </g>
        );
      })}
      <path d={meses.map((m, k) => `${k ? "L" : "M"}${pl + m.i * iw + iw / 2} ${y(mm(m.ingreso))}`).join(" ")} fill="none" stroke={C.green} strokeWidth="2.5" strokeDasharray="6 3" />
      {meses.map((m) => <circle key={m.ym} cx={pl + m.i * iw + iw / 2} cy={y(mm(m.ingreso))} r="2.8" fill={C.green} />)}
    </svg>
  );
}
