// (2026-11-08, a pedido de Fredy) Financiera · «Dirección financiera»: una sola pantalla con tres pestañas.
//   Mapa de deuda    → todo lo que se debe (facturas de proveedores de Yanko e Indutex, cuotas de Endeudamiento, créditos, tarjetas, impuestos y
//                      otras deudas escritas a mano), por urgencia: lo legal, lo vencido, lo caro y el resto.
//   Salir de deudas  → ruta mes a mes hasta quedar libre; se mueve la tasa, el abono extra y si lo que se libera pasa a la deuda siguiente.
//   Costo del dinero → lo que cuestan los bancos (resumen mensual de los extractos) y los intereses de lo que se debe.
// Lee de ATLAS lo que ya existe y guarda solo lo que está fuera de ATLAS: financiera_deudas_externas y financiera_banco_resumen.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { useMesFinanciero } from "./financiera-que-pagar";
import { C, caja, Boton, Ventana } from "./financiera-cuanto-pagar";
import { sumarMes } from "./financiera-cuanto-pagar-calculo";
import { ultimoCorte, armarProveedoresPagar } from "./financiera-programar-pagos-calculo";
import { ingresosBase, proyectarDeuda } from "./financiera-proyeccion-deuda-calculo";
import { mapaDeuda, rutaSalida, costoDelDinero, totalesProveedores, TIPOS_DEUDA, GRUPOS_URGENCIA, tasaMensual } from "./financiera-direccion-calculo";
import { SEMILLA_EXTERNAS, SEMILLA_BANCO } from "./financiera-direccion-semilla";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const etq = (ym) => { const [a, m] = String(ym).split("-").map(Number); return `${MESES[m - 1]} ${String(a).slice(2)}`; };
const etqLargo = (ym) => { const [a, m] = String(ym).split("-").map(Number); return `${MESES[m - 1]} ${a}`; };
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const fm = (n) => { const v = Math.round((Number(n) || 0) / 1e5) / 10; return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + " M"; };
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" };
const thL = { ...th, textAlign: "left" };
const tdL = { ...td, textAlign: "left", fontWeight: 700 };
const entrada = { width: "100%", padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: C.ink };
const etiqueta = { display: "block", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, margin: "10px 0 3px" };
const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const COLOR_GRUPO = { legal: C.red, vencido: C.red, caro: C.amber, resto: C.slate };

const Cifra = ({ titulo, valor, sub, color }) => (
  <div style={{ flex: "1 1 190px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px" }}>
    <div style={{ fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
    <div style={{ fontSize: 22, fontWeight: 900, marginTop: 3, color: color || C.ink, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
    {sub ? <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, lineHeight: 1.4 }}>{sub}</div> : null}
  </div>
);
const Aviso = ({ tono = "b", children }) => {
  const [fondo, color] = { r: [C.redBg, "#a8392b"], a: [C.amberBg, "#8c5a12"], b: [C.blueBg, C.blue] }[tono];
  return <div style={{ background: fondo, color, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 8, lineHeight: 1.5 }}>{children}</div>;
};

// ─── Datos ───────────────────────────────────────────────────────────────────
// Facturas abiertas de Yanko e Indutex (último corte de cada una) → totales por vencimiento.
function useProveedoresTotales(db) {
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
    const hoy = hoyBogota();
    const de = (empresa) => {
      const corte = ultimoCorte(cortes, empresa);
      const man = manuales.filter((m) => (empresa === "indutex" ? m.empresa === "indutex" : m.empresa !== "indutex"));
      if (!corte && !man.length) return null;
      const provs = armarProveedoresPagar({ empresa, corte, facturasGuardadas: empresa === "yanko" ? facturas : {}, plazos, nombresProveedor: {}, manuales: man, hoy });
      return { ...totalesProveedores(provs), fechaCorte: corte ? corte.fechaCorte : "" };
    };
    return { yanko: de("yanko"), indutex: de("indutex") };
  }, [cortes, facturas, plazos, manuales]);
}
function useColeccion(db, nombre) {
  const [lista, setLista] = useState([]);
  const [listo, setListo] = useState(false);
  useEffect(() => onSnapshot(collection(db, nombre), (s) => { setLista(s.docs.map((d) => ({ ...d.data(), id: d.id }))); setListo(true); }, () => setListo(true)), [db, nombre]);
  return { lista, listo };
}

// ─── Gráficas ────────────────────────────────────────────────────────────────
// Quita la cola plana (deudas sin plan de pago que se quedan quietas) para que la gráfica no se estire por años.
// Escala con cortes redondos: n tramos y un tope que cubre el máximo.
const escala = (max, n) => {
  const bruto = Math.max(1, max) / n;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * pot).find((v) => v >= bruto);
  return { paso, tope: paso * n, ticks: Array.from({ length: n + 1 }, (_, i) => paso * i) };
};
const sinCola = (s) => { const r = s.slice(); while (r.length > 2 && Math.abs(r[r.length - 1] - r[r.length - 2]) < 1) r.pop(); return r; };
function GraficaRuta({ base: baseR, plan: planR, ymHoy }) {
  const W = 760, H = 250, L = 52, B = 28, T = 14, R = 12;
  const base = { serie: sinCola(baseR.serie) };
  const plan = { serie: sinCola(planR.serie) };
  const N = Math.max(base.serie.length, plan.serie.length) - 1;
  const { tope, ticks } = escala(Math.max(base.serie[0], plan.serie[0]), 4);
  const X = (i) => L + (i / Math.max(1, N)) * (W - L - R);
  const Y = (v) => H - B - (v / tope) * (H - B - T);
  const puntos = (s) => s.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  const marcas = [0, Math.round(N / 3), Math.round((2 * N) / 3)].filter((k, i, a) => a.indexOf(k) === i && k < N - 2);
  const nombreMes = (i) => etq(sumarMes(ymHoy, i - 1));
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Deuda total por mes" style={{ minWidth: 520 }}>
        {ticks.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke={C.border} />
            <text x={L - 6} y={Y(g) + 4} fontSize="11" textAnchor="end" fill={C.slate}>{fm(g)}</text>
          </g>
        ))}
        <polyline points={puntos(base.serie)} fill="none" stroke={C.seam} strokeWidth="3" strokeLinejoin="round" />
        <polyline points={puntos(plan.serie)} fill="none" stroke={C.green} strokeWidth="3" strokeLinejoin="round" />
        <circle cx={X(plan.serie.length - 1)} cy={Y(plan.serie[plan.serie.length - 1])} r="5" fill={C.green} />
        {marcas.map((k) => <text key={k} x={X(k)} y={H - 9} fontSize="10.5" textAnchor="middle" fill={C.slate}>{nombreMes(k)}</text>)}
        <text x={X(N)} y={H - 9} fontSize="10.5" textAnchor="end" fill={C.slate}>{nombreMes(N)}</text>
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.slate, marginTop: 4 }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.seam, marginRight: 5 }} />Como vas hoy</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.green, marginRight: 5 }} />Con tu plan</span>
      </div>
    </div>
  );
}
function GraficaBanco({ meses }) {
  const W = 760, H = 240, L = 50, B = 28, T = 16, R = 8;
  const { tope, ticks } = escala(Math.max(...meses.map((m) => m.costo)), 3);
  const bw = (W - L - R) / Math.max(1, meses.length);
  const Y = (v) => H - B - (v / tope) * (H - B - T);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Costo mensual del banco" style={{ minWidth: 520 }}>
        {ticks.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke={C.border} />
            <text x={L - 6} y={Y(g) + 4} fontSize="11" textAnchor="end" fill={C.slate}>{fm(g)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const x = L + i * bw + bw * 0.2, w = bw * 0.6;
          let y = H - B;
          const partes = [[m.c4x1000, C.ink], [m.comisiones, C.blue], [m.plan + m.cupo + m.sobregiro, C.seam]];
          return (
            <g key={m.ym}>
              {partes.map(([v, col], j) => { const h = (v / tope) * (H - B - T); y -= h; return <rect key={j} x={x} y={y} width={w} height={Math.max(0, h)} fill={col} />; })}
              <text x={x + w / 2} y={y - 4} fontSize="10.5" textAnchor="middle" fill={C.slate}>{(m.costo / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })}</text>
              <text x={x + w / 2} y={H - 9} fontSize="11" textAnchor="middle" fill={C.slate}>{etq(m.ym).split(" ")[0]}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.slate, marginTop: 4 }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.ink, marginRight: 5 }} />4x1000</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.blue, marginRight: 5 }} />Comisiones</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.seam, marginRight: 5 }} />Plan, cupo e intereses de sobregiro</span>
      </div>
    </div>
  );
}

// ─── Formularios ─────────────────────────────────────────────────────────────
function FormDeuda({ db, deuda, onClose }) {
  const nueva = !deuda;
  const [f, setF] = useState(() => ({ tipo: deuda?.tipo || "banco", nombre: deuda?.nombre || "", saldo: deuda ? String(deuda.saldo ?? "") : "", tasaEA: deuda ? String(deuda.tasaEA ?? "") : "", pagoMensual: deuda ? String(deuda.pagoMensual ?? "") : "", diaPago: deuda ? String(deuda.diaPago ?? "") : "", nota: deuda?.nota || "" }));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const cambia = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function guardar() {
    const saldo = Number(String(f.saldo).replace(/[^\d.-]/g, ""));
    if (!f.nombre.trim()) return setError("Escribe a quién se le debe.");
    if (!(saldo > 0)) return setError("El saldo debe ser mayor que cero.");
    setError("");
    setGuardando(true);
    try {
      const id = deuda?.id || `ext_${Date.now()}`;
      await setDoc(doc(db, "financiera_deudas_externas", id), { tipo: f.tipo, nombre: f.nombre.trim(), saldo, tasaEA: Number(f.tasaEA) || 0, pagoMensual: Number(f.pagoMensual) || 0, diaPago: Number(f.diaPago) || 0, nota: f.nota.trim(), actualizadoEn: new Date().toISOString() }, { merge: true });
      onClose();
    } catch (e) { setError(e?.message || "No se pudo guardar."); setGuardando(false); }
  }
  async function eliminar() {
    setGuardando(true);
    try { await deleteDoc(doc(db, "financiera_deudas_externas", deuda.id)); onClose(); } catch (e) { setError(e?.message || "No se pudo eliminar."); setGuardando(false); }
  }
  return (
    <Ventana titulo={nueva ? "Agregar una deuda" : "Editar deuda"} sub="Para lo que está fuera de ATLAS: créditos, tarjetas, impuestos, aportes u otras deudas. Las facturas de proveedores y las cuotas de Endeudamiento ya entran solas." onClose={onClose} ancho={520}>
      <label style={etiqueta}>Tipo</label>
      <select value={f.tipo} onChange={cambia("tipo")} style={entrada}>{TIPOS_DEUDA.map((t) => <option key={t.k} value={t.k}>{t.txt}</option>)}</select>
      <label style={etiqueta}>A quién se le debe</label>
      <input value={f.nombre} onChange={cambia("nombre")} style={entrada} placeholder="Ej.: Crédito Bancolombia, DIAN IVA, tarjeta Visa" />
      <label style={etiqueta}>Saldo que se debe hoy ($)</label>
      <input value={f.saldo} onChange={cambia("saldo")} style={entrada} inputMode="decimal" placeholder="Ej.: 63709958" />
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={etiqueta}>Tasa E.A. (%)</label><input value={f.tasaEA} onChange={cambia("tasaEA")} style={entrada} inputMode="decimal" placeholder="0 si no cobra" /></div>
        <div style={{ flex: 1 }}><label style={etiqueta}>Pago mensual ($)</label><input value={f.pagoMensual} onChange={cambia("pagoMensual")} style={entrada} inputMode="decimal" placeholder="0 si no hay plan" /></div>
        <div style={{ width: 90 }}><label style={etiqueta}>Día</label><input value={f.diaPago} onChange={cambia("diaPago")} style={entrada} inputMode="numeric" placeholder="24" /></div>
      </div>
      <label style={etiqueta}>Nota</label>
      <input value={f.nota} onChange={cambia("nota")} style={entrada} placeholder="Opcional" />
      {error ? <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        <Boton variante="oscuro" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Boton>
        <Boton onClick={onClose}>Cancelar</Boton>
        {!nueva ? <span style={{ marginLeft: "auto" }}>{confirmar ? <Boton variante="rojo" onClick={eliminar} disabled={guardando}>Sí, eliminar</Boton> : <Boton onClick={() => setConfirmar(true)}>Eliminar</Boton>}</span> : null}
      </div>
    </Ventana>
  );
}
function FormMes({ db, mes, onClose }) {
  const [f, setF] = useState(() => ({ ym: mes?.ym || "", abonos: mes ? String(mes.abonos) : "", cargos: mes ? String(mes.cargos) : "", c4x1000: mes ? String(mes.c4x1000) : "", comisiones: mes ? String(mes.comisiones) : "", plan: mes ? String(mes.plan) : "", cupo: mes ? String(mes.cupo) : "", sobregiro: mes ? String(mes.sobregiro) : "" }));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambia = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function guardar() {
    if (!/^\d{4}-\d{2}$/.test(f.ym)) return setError("El mes se escribe AAAA-MM, por ejemplo 2026-11.");
    setError("");
    setGuardando(true);
    const n = (v) => Number(String(v).replace(/[^\d.-]/g, "")) || 0;
    try {
      await setDoc(doc(db, "financiera_banco_resumen", f.ym), { ym: f.ym, banco: "Bancolombia · cuenta corriente", abonos: n(f.abonos), cargos: n(f.cargos), c4x1000: n(f.c4x1000), comisiones: n(f.comisiones), plan: n(f.plan), cupo: n(f.cupo), sobregiro: n(f.sobregiro), actualizadoEn: new Date().toISOString() }, { merge: true });
      onClose();
    } catch (e) { setError(e?.message || "No se pudo guardar."); setGuardando(false); }
  }
  const campo = (k, t) => <div style={{ flex: "1 1 45%" }}><label style={etiqueta}>{t}</label><input value={f[k]} onChange={cambia(k)} style={entrada} inputMode="decimal" /></div>;
  return (
    <Ventana titulo={mes ? `Resumen de ${etqLargo(mes.ym)}` : "Agregar un mes del banco"} sub="Valores del extracto de la cuenta corriente: lo que entró, lo que salió y lo que cobró el banco." onClose={onClose} ancho={560}>
      {!mes ? <><label style={etiqueta}>Mes (AAAA-MM)</label><input value={f.ym} onChange={cambia("ym")} style={entrada} placeholder="2026-11" /></> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 10px" }}>
        {campo("abonos", "Total abonos ($)")}{campo("cargos", "Total cargos ($)")}{campo("c4x1000", "4x1000 ($)")}{campo("comisiones", "Comisiones con IVA ($)")}{campo("plan", "Plan Canal Negocios ($)")}{campo("cupo", "Cupo rotativo ($)")}{campo("sobregiro", "Intereses de sobregiro ($)")}
      </div>
      {error ? <div style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Boton variante="oscuro" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Boton>
        <Boton onClick={onClose}>Cancelar</Boton>
      </div>
    </Ventana>
  );
}

// ─── Pantalla ────────────────────────────────────────────────────────────────
export default function DireccionFinancieraView({ db, isAdmin }) {
  const ymHoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7), []);
  const datos = useMesFinanciero(db, ymHoy);
  const prov = useProveedoresTotales(db);
  const ext = useColeccion(db, "financiera_deudas_externas");
  const bancoDocs = useColeccion(db, "financiera_banco_resumen");
  const [cacheTotal, setCacheTotal] = useState(null);
  const [cacheBusint, setCacheBusint] = useState(null);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_cache", "total_yanko"), (s) => setCacheTotal(s.exists() ? s.data() : null), () => {}), [db]);
  useEffect(() => onSnapshot(doc(db, "financiera_ingresos_cache", "main"), (s) => setCacheBusint(s.exists() ? s.data() : null), () => {}), [db]);

  const [tab, setTab] = useState("mapa");
  const [editando, setEditando] = useState(null); // null | "nueva" | deuda
  const [editMes, setEditMes] = useState(null); // null | "nuevo" | mes
  const [tasaSel, setTasaSel] = useState(null);
  const [extra, setExtra] = useState(0);
  const [rodar, setRodar] = useState(true);
  const [cupoTxt, setCupoTxt] = useState("");
  const [cargandoSemilla, setCargandoSemilla] = useState(false);
  const [confirmaSemilla, setConfirmaSemilla] = useState(false);
  const [errorSemilla, setErrorSemilla] = useState("");

  const externas = ext.lista;
  const mapa = useMemo(() => mapaDeuda({ yanko: prov.yanko, indutex: prov.indutex, cuotas: datos.cuotas, externas, ymHoy }), [prov, datos.cuotas, externas, ymHoy]);

  // Cupo mensual para proveedores sugerido por «Proyección de deuda» (escenario conservador, colchón 10 %): promedio de los próximos 6 meses.
  const base = useMemo(() => ingresosBase(cacheTotal || cacheBusint, ymHoy, 6), [cacheTotal, cacheBusint, ymHoy]);
  const ant = datos.res.anterior;
  const cupoSugerido = useMemo(() => {
    if (!base || !ant.hayDatos) return 0;
    const r = proyectarDeuda({ ymInicio: ymHoy, horizonte: 6, escenario: "cons", base, presupuestoMes: {}, operacion: { nomina: ant.nomina, seguridad: ant.seguridad, provisiones: ant.provisiones, gastos: ant.gastos }, cuotas: datos.cuotas, colchonPct: 0.1, nueva: { cuota: 0, plazo: 1, desde: sumarMes(ymHoy, 1) }, proveedores: null });
    return Math.round(r.meses.reduce((s, m) => s + m.paraProveedores, 0) / r.meses.length / 1e5) * 1e5;
  }, [base, ant, datos.cuotas, ymHoy]);
  // El asistente de ATLAS (servidor) no puede recalcular la Proyección de deuda: se le deja el cupo sugerido a la mano. Solo administradores, y solo si cambió.
  const cupoGuardado = useRef(null);
  useEffect(() => {
    if (!isAdmin || !(cupoSugerido > 0) || cupoGuardado.current === cupoSugerido) return;
    cupoGuardado.current = cupoSugerido;
    setDoc(doc(db, "financiera_direccion_resumen", "actual"), { cupoSugerido, ymHoy, actualizadoEn: new Date().toISOString() }, { merge: true }).catch(() => {});
  }, [db, isAdmin, cupoSugerido, ymHoy]);
  const cupo = cupoTxt === "" ? cupoSugerido : Number(String(cupoTxt).replace(/[^\d.-]/g, "")) || 0;
  const saldoProv = (prov.yanko ? prov.yanko.total : 0) + (prov.indutex ? prov.indutex.total : 0);

  const grande = useMemo(() => externas.filter((e) => e.tipo === "banco" && Number(e.saldo) > 0).sort((a, b) => Number(b.saldo) - Number(a.saldo))[0] || null, [externas]);
  const tasaActual = grande ? Number(grande.tasaEA) || 0 : 0;
  const tasaEfectiva = grande && tasaSel !== null && tasaSel < tasaActual ? tasaSel : null;
  const comun = useMemo(() => ({ externas, cuotas: datos.cuotas, saldoProveedores: saldoProv, cupoProveedores: cupo, ymHoy }), [externas, datos.cuotas, saldoProv, cupo, ymHoy]);
  const rutaBase = useMemo(() => rutaSalida({ ...comun, rodar: false, extra: 0, tasaNegociada: null }), [comun]);
  const rutaPlan = useMemo(() => rutaSalida({ ...comun, rodar, extra, tasaNegociada: tasaEfectiva }), [comun, rodar, extra, tasaEfectiva]);

  const costo = useMemo(() => costoDelDinero({ banco: bancoDocs.lista, externas }), [bancoDocs.lista, externas]);

  async function cargarSemilla() {
    setCargandoSemilla(true);
    setErrorSemilla("");
    try {
      const lote = writeBatch(db);
      const ahora = new Date().toISOString();
      SEMILLA_EXTERNAS.forEach(({ id, ...resto }) => lote.set(doc(db, "financiera_deudas_externas", id), { ...resto, actualizadoEn: ahora }, { merge: true }));
      SEMILLA_BANCO.forEach((b) => lote.set(doc(db, "financiera_banco_resumen", b.ym), { ...b, banco: "Bancolombia · cuenta corriente", actualizadoEn: ahora }, { merge: true }));
      await lote.commit();
      setConfirmaSemilla(false);
    } catch (e) { setErrorSemilla(e?.message || "No se pudieron cargar los datos."); }
    setCargandoSemilla(false);
  }

  const sinDatosPropios = externas.length === 0 && bancoDocs.lista.length === 0;
  const TABS = [["mapa", "Mapa de deuda"], ["salir", "Salir de deudas"], ["costo", "Costo del dinero"]];
  const mejora = rutaBase.n !== null && rutaPlan.n !== null ? rutaBase.n - rutaPlan.n : 0;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 900, color: C.ink }}>Dirección financiera</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, maxWidth: 860, lineHeight: 1.5 }}>
          Todo lo que se debe, la ruta para quedar libre de deudas y lo que cuesta el dinero. Lee de ATLAS las facturas de proveedores y las cuotas de Endeudamiento; el crédito, las tarjetas, los impuestos y el resumen del banco se anotan aquí.
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: `1.5px solid ${tab === k ? C.ink : C.border}`, background: tab === k ? C.ink : C.white, color: tab === k ? C.white : C.slate, borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{t}</button>
        ))}
      </div>

      {isAdmin && sinDatosPropios && ext.listo && bancoDocs.listo ? (
        <Aviso tono="b">
          <b>Todavía no hay datos de crédito, tarjetas ni del banco.</b> Puedes cargar los de tus extractos de Bancolombia (cuenta corriente enero–octubre 2026, crédito de noviembre y tarjetas del 15 de octubre) y editarlos después.{" "}
          <Boton chico variante="oscuro" onClick={() => setConfirmaSemilla(true)}>Cargar datos de mis extractos</Boton>
        </Aviso>
      ) : null}

      {/* ─── MAPA DE DEUDA ─── */}
      {tab === "mapa" ? (
        <div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Cifra titulo="Debes hoy" valor={money(mapa.total)} sub="Facturas, cuotas, créditos, tarjetas e impuestos" color={C.ink} />
            <Cifra titulo="Deuda cara" valor={money(mapa.saldoCaro)} sub={mapa.total > 0 ? `${Math.round((mapa.saldoCaro / mapa.total) * 100)} % del total, con 20 % E.A. o más` : ""} color={mapa.saldoCaro > 0 ? C.amber : C.ink} />
            <Cifra titulo="Vencido con proveedores" valor={money(mapa.porGrupo.vencido || 0)} color={(mapa.porGrupo.vencido || 0) > 0 ? C.red : C.green} sub={prov.yanko && prov.yanko.fechaCorte ? `Corte Yanko: ${prov.yanko.fechaCorte}` : ""} />
            <Cifra titulo="Lo legal" valor={money(mapa.porGrupo.legal || 0)} color={(mapa.porGrupo.legal || 0) > 0 ? C.red : C.ink} sub="Impuestos, aportes y embargos anotados" />
          </div>
          {!prov.yanko ? <Aviso tono="a">Falta el corte de Cuentas por Pagar de Yanko. Tráelo en Contabilidad → Cuentas por pagar → «Traer desde Busint» para que entren las facturas.</Aviso> : null}
          {!prov.indutex ? <Aviso tono="b">No hay corte de Indutex cargado: sus facturas no están contadas.</Aviso> : null}
          {mapa.sinFin.length ? <Aviso tono="a">Estas cuotas de Endeudamiento no tienen fecha final, por eso no se cuenta cuánto falta: {mapa.sinFin.map((c) => c.nombre || c.acreedor).join(", ")}.</Aviso> : null}
          <Aviso tono="b">Las facturas de proveedores normalmente no cobran interés, pero vencidas cuestan suministro y relación. Por eso el orden no es solo por tasa: primero lo legal, luego lo vencido, luego lo caro y al final el resto.</Aviso>

          {GRUPOS_URGENCIA.map((g) => {
            const filas = mapa.filas.filter((f) => f.grupo === g.k);
            if (!filas.length) return null;
            return (
              <div key={g.k} style={{ ...caja, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: COLOR_GRUPO[g.k] }}>{g.txt}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{money(mapa.porGrupo[g.k])}</div>
                </div>
                <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 6px" }}>{g.ayuda}</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={thL}>Deuda</th><th style={thL}>Tipo</th><th style={th}>Saldo</th><th style={thL}>Detalle</th>{isAdmin ? <th style={th} /> : null}</tr></thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.id}>
                          <td style={tdL}>{f.nombre}</td>
                          <td style={{ ...td, textAlign: "left", color: C.slate }}>{f.tipoTxt}</td>
                          <td style={{ ...td, fontWeight: 800 }}>{money(f.saldo)}</td>
                          <td style={{ ...td, textAlign: "left", color: C.slate, whiteSpace: "normal", minWidth: 200 }}>{f.detalle}</td>
                          {isAdmin ? <td style={td}>{f.externa ? <Boton chico onClick={() => setEditando(f.externa)}>Editar</Boton> : null}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {!mapa.filas.length ? <div style={{ ...caja, color: C.slate, fontSize: 13 }}>Todavía no hay deudas para mostrar.</div> : null}

          <div style={{ ...caja, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Por tipo</div>
            {Object.entries(mapa.porTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "190px 1fr 110px", gap: 10, alignItems: "center", padding: "3px 0", fontSize: 12.5 }}>
                <span>{t}</span>
                <span style={{ background: C.canvas, borderRadius: 6, height: 12, overflow: "hidden", display: "block" }}><span style={{ display: "block", height: "100%", width: `${mapa.total > 0 ? (v / mapa.total) * 100 : 0}%`, background: C.ink, borderRadius: 6 }} /></span>
                <span style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(v)}</span>
              </div>
            ))}
          </div>
          {isAdmin ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Boton variante="oscuro" onClick={() => setEditando("nueva")}>+ Agregar una deuda</Boton>
              {!sinDatosPropios ? <Boton onClick={() => setConfirmaSemilla(true)}>Cargar datos de mis extractos</Boton> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ─── SALIR DE DEUDAS ─── */}
      {tab === "salir" ? (
        <div>
          {!externas.length && !mapa.filas.length ? <Aviso tono="a">No hay deudas para armar la ruta. Agrega deudas en el Mapa de deuda.</Aviso> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Cifra titulo="Libre de deudas" valor={rutaPlan.ym ? etqLargo(rutaPlan.ym) : "Sin fecha"} color={rutaPlan.ym ? C.green : C.red} sub={rutaPlan.n ? `En ${rutaPlan.n} mes${rutaPlan.n === 1 ? "" : "es"}${mejora > 0 ? ` · ${mejora} menos que hoy` : ""}` : "Alguna deuda no tiene cómo pagarse"} />
            <Cifra titulo="Como vas hoy" valor={rutaBase.ym ? etqLargo(rutaBase.ym) : "Sin fecha"} color={C.slate} sub={rutaBase.n === null && rutaBase.sinPlan.length ? `Sin plan de pago hoy: ${rutaBase.sinPlan.join(", ")}` : "Con los pagos actuales, sin cambiar nada"} />
            <Cifra titulo="Intereses que ahorras" valor={money(Math.max(0, rutaBase.interes - rutaPlan.interes))} color={C.green} sub={`Intereses que faltan: ${fm(rutaPlan.interes)} (hoy: ${fm(rutaBase.interes)})`} />
            <Cifra titulo="Cuando termines" valor={`${fm(rutaPlan.presupuesto)} libres al mes`} color={C.ink} sub="Lo que hoy se va en pagos de deuda, cuotas y cupo de proveedores" />
          </div>
          <div style={{ ...caja, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Mueve los controles</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 280px" }}>
                <label style={{ ...etiqueta, display: "flex", justifyContent: "space-between", margin: "0 0 3px" }}>
                  <span>{grande ? `Tasa que consigas en «${grande.nombre}»` : "Tasa del crédito"}</span>
                  <span style={{ color: C.blue }}>{grande ? `${(tasaEfectiva !== null ? tasaEfectiva : tasaActual).toLocaleString("es-CO", { maximumFractionDigits: 2 })} % E.A.` : "—"}</span>
                </label>
                <input type="range" disabled={!grande} min={Math.max(0, tasaActual - 10)} max={tasaActual || 1} step={0.5} value={tasaEfectiva !== null ? tasaEfectiva : tasaActual} onChange={(e) => setTasaSel(Number(e.target.value))} style={{ width: "100%", accentColor: C.ink }} />
                <label style={{ ...etiqueta, display: "flex", justifyContent: "space-between", margin: "10px 0 3px" }}><span>Abono extra cada mes</span><span style={{ color: C.blue }}>{money(extra)}</span></label>
                <input type="range" min={0} max={5000000} step={100000} value={extra} onChange={(e) => setExtra(Number(e.target.value))} style={{ width: "100%", accentColor: C.ink }} />
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>
                  <input type="checkbox" checked={rodar} onChange={(e) => setRodar(e.target.checked)} /> Cuando una deuda termine, pasar su pago a la deuda siguiente
                </label>
              </div>
              <div style={{ flex: "1 1 260px" }}>
                <label style={{ ...etiqueta, margin: "0 0 3px" }}>Cupo mensual para proveedores ($)</label>
                <input value={cupoTxt} onChange={(e) => setCupoTxt(e.target.value)} style={entrada} inputMode="decimal" placeholder={String(cupoSugerido)} />
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4, lineHeight: 1.45 }}>
                  {cupoTxt === "" ? `Sugerido por Proyección de Deuda (conservador, colchón 10 %): ${money(cupoSugerido)} al mes.` : `Escrito por ti. Proyección de Deuda sugiere ${money(cupoSugerido)}.`} Con esto se pagan los {money(saldoProv)} de facturas de proveedores.
                </div>
              </div>
            </div>
          </div>
          {rutaPlan.sinPlan.length ? <Aviso tono="r">Estas deudas no tienen cómo pagarse con los datos de hoy (no tienen pago mensual): {rutaPlan.sinPlan.join(", ")}. Edítalas en el Mapa de deuda y ponles un pago mensual, o activa «pasar su pago a la deuda siguiente».</Aviso> : null}
          {rutaPlan.sinFinCuotas.length ? <Aviso tono="a">Las cuotas sin fecha final no se cuentan en la ruta: {rutaPlan.sinFinCuotas.map((c) => c.nombre || c.acreedor).join(", ")}.</Aviso> : null}
          <div style={{ ...caja, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Cuánta deuda te queda cada mes</div>
            <GraficaRuta base={rutaBase} plan={rutaPlan} ymHoy={ymHoy} />
          </div>
          <div style={{ ...caja, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Cuándo termina cada una</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={thL}>Deuda</th><th style={th}>Saldo hoy</th><th style={th}>Termina</th></tr></thead>
              <tbody>
                {rutaPlan.hitos.map((h) => (
                  <tr key={h.nombre}><td style={tdL}>{h.nombre}</td><td style={td}>{money(h.saldo0)}</td><td style={{ ...td, fontWeight: 800, color: h.ym ? C.green : C.red }}>{h.ym ? etqLargo(h.ym) : "Sin plan de pago"}</td></tr>
                ))}
                {rutaPlan.cuotasFin ? <tr><td style={tdL}>Cuotas de Endeudamiento</td><td style={td}>—</td><td style={{ ...td, fontWeight: 800, color: C.green }}>{etqLargo(rutaPlan.cuotasFin)}</td></tr> : null}
              </tbody>
            </table>
          </div>
          <Aviso tono="b"><b>Supuestos:</b> los pagos de cada deuda siguen igual; en las tarjetas el interés se calcula sobre todo el saldo (es una estimación que exagera un poco) y sin compras nuevas; las facturas de proveedores no cobran interés y se pagan con el cupo mensual. No incluye comisiones ni penalidades por prepago ni facturas nuevas que lleguen: confírmalo con el banco antes de decidir. Es una ayuda para analizar, no asesoría financiera.</Aviso>
        </div>
      ) : null}

      {/* ─── COSTO DEL DINERO ─── */}
      {tab === "costo" ? (
        <div>
          {!costo.n ? <Aviso tono="a">Todavía no hay resumen del banco. {isAdmin ? "Carga los datos de tus extractos o agrega un mes." : "Pídele a un administrador que lo cargue."}</Aviso> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Cifra titulo="Costo mensual del dinero" valor={money(costo.costoMensual)} sub={`Banco ${money(costo.bancoMensual)} + intereses estimados ${money(costo.interesMensual)}`} />
            <Cifra titulo="Frente a lo que entra" valor={costo.pctDelIngresoMensual === null ? "—" : `${(costo.pctDelIngresoMensual * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`} sub="Costo mensual ÷ abonos promedio" />
            <Cifra titulo="En 12 meses" valor={fm(costo.costo12)} sub="Si todo sigue igual" />
            <Cifra titulo="Del banco, es 4x1000" valor={costo.pct4x1000 === null ? "—" : `${Math.round(costo.pct4x1000 * 100)} %`} sub="Es impuesto, no tarifa del banco" color={C.ink} />
          </div>
          {costo.n ? (
            <>
              <div style={{ ...caja, marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Costo del banco por mes</div>
                <GraficaBanco meses={costo.meses} />
              </div>
              <div style={{ ...caja, marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Mes a mes</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={thL}>Mes</th><th style={th}>Entró</th><th style={th}>4x1000</th><th style={th}>Comisiones</th><th style={th}>Plan + cupo</th><th style={th}>Costo del banco</th><th style={th}>% de lo que entró</th>{isAdmin ? <th style={th} /> : null}</tr></thead>
                    <tbody>
                      {costo.meses.map((m) => (
                        <tr key={m.ym}>
                          <td style={tdL}>{etqLargo(m.ym)}</td><td style={td}>{money(m.abonos)}</td><td style={td}>{money(m.c4x1000)}</td><td style={td}>{money(m.comisiones)}</td><td style={td}>{money(m.plan + m.cupo + m.sobregiro)}</td>
                          <td style={{ ...td, fontWeight: 800 }}>{money(m.costo)}</td><td style={td}>{m.abonos > 0 ? `${((m.costo / m.abonos) * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %` : "—"}</td>
                          {isAdmin ? <td style={td}><Boton chico onClick={() => setEditMes(m)}>Editar</Boton></td> : null}
                        </tr>
                      ))}
                      <tr><td style={{ ...tdL, borderTop: `2px solid ${C.ink}` }}>Total {costo.n} meses</td><td style={{ ...td, borderTop: `2px solid ${C.ink}`, fontWeight: 800 }}>{money(costo.abonosTotal)}</td><td style={{ ...td, borderTop: `2px solid ${C.ink}`, fontWeight: 800 }}>{money(costo.porConcepto.c4x1000)}</td><td style={{ ...td, borderTop: `2px solid ${C.ink}`, fontWeight: 800 }}>{money(costo.porConcepto.comisiones)}</td><td style={{ ...td, borderTop: `2px solid ${C.ink}`, fontWeight: 800 }}>{money(costo.porConcepto.plan + costo.porConcepto.cupo + costo.porConcepto.sobregiro)}</td><td style={{ ...td, borderTop: `2px solid ${C.ink}`, fontWeight: 900 }}>{money(costo.costoTotal)}</td><td style={{ ...td, borderTop: `2px solid ${C.ink}`, fontWeight: 800 }}>{costo.pctIngreso === null ? "—" : `${(costo.pctIngreso * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`}</td>{isAdmin ? <td style={{ ...td, borderTop: `2px solid ${C.ink}` }} /> : null}</tr>
                    </tbody>
                  </table>
                </div>
                {isAdmin ? <div style={{ marginTop: 10 }}><Boton onClick={() => setEditMes("nuevo")}>+ Agregar un mes</Boton></div> : null}
              </div>
            </>
          ) : null}
          <div style={{ ...caja, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Intereses de lo que se debe (estimados)</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={thL}>Deuda</th><th style={th}>Saldo</th><th style={th}>Tasa E.A.</th><th style={th}>Interés al mes</th></tr></thead>
              <tbody>
                {externas.filter((e) => e.tipo !== "impuesto" && e.tipo !== "embargo" && Number(e.saldo) > 0 && Number(e.tasaEA) > 0).map((e) => (
                  <tr key={e.id}><td style={tdL}>{e.nombre}</td><td style={td}>{money(e.saldo)}</td><td style={td}>{Number(e.tasaEA).toLocaleString("es-CO")} %</td><td style={{ ...td, fontWeight: 800 }}>{money(Number(e.saldo) * tasaMensual(e.tasaEA))}</td></tr>
                ))}
                <tr><td style={{ ...tdL, borderTop: `2px solid ${C.ink}` }}>Total</td><td style={{ ...td, borderTop: `2px solid ${C.ink}` }} /><td style={{ ...td, borderTop: `2px solid ${C.ink}` }} /><td style={{ ...td, borderTop: `2px solid ${C.ink}`, fontWeight: 900 }}>{money(costo.interesMensual)}</td></tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>Interés del mes = saldo × tasa mensual. En tarjetas exagera un poco porque las compras a una cuota no cobran interés.</div>
          </div>
        </div>
      ) : null}

      {editando ? <FormDeuda db={db} deuda={editando === "nueva" ? null : editando} onClose={() => setEditando(null)} /> : null}
      {editMes ? <FormMes db={db} mes={editMes === "nuevo" ? null : editMes} onClose={() => setEditMes(null)} /> : null}
      {confirmaSemilla ? (
        <Ventana titulo="Cargar datos de mis extractos" sub="Se guardan el crédito Bancolombia, las dos tarjetas (corte 15 de octubre) y el resumen mensual de la cuenta corriente de enero a octubre de 2026. Si ya los habías cargado o editado, se reemplazan los de esos mismos nombres y meses." onClose={() => setConfirmaSemilla(false)} ancho={520}>
          {errorSemilla ? <div style={{ color: C.red, fontSize: 12.5, marginBottom: 10 }}>{errorSemilla}</div> : null}
          <div style={{ display: "flex", gap: 8 }}>
            <Boton variante="oscuro" onClick={cargarSemilla} disabled={cargandoSemilla}>{cargandoSemilla ? "Cargando…" : "Cargar"}</Boton>
            <Boton onClick={() => setConfirmaSemilla(false)}>Cancelar</Boton>
          </div>
        </Ventana>
      ) : null}
    </div>
  );
}
