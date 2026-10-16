// ─── CONTABILIDAD → 🛒 ÓRDENES DE COMPRA (2026-10-16, a pedido de Fredy) ─────────
// Trae de Busint las órdenes de compra (cabecera + líneas) con la función
// getOrdenesCompraBusint y muestra: vencidas / pendientes por recibir, historial,
// historial de precio por insumo y control de costo (sube o baja frente a la compra anterior).
// Busint NO dice si la mercancía ya llegó, así que "recibida" se marca a mano
// (colección contabilidad_ordenes_compra_recibidas, un documento por orden). Para no llenar
// la pantalla de "vencidas" con años de órdenes viejas, solo se vigilan las que vencieron
// dentro de la ventana elegida (60 días por defecto); las anteriores quedan en el Historial.
// Precio neto = precio unitario − descuento, SIN IVA (para comparar entre compras).
import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const IVA = 0.19; // la cabecera de Busint trae 16 pero el PDF de la orden calcula 19 %
const fmtCOP = (n) => `$ ${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;
const fmtF = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "—");
const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const sumarDias = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const normTxt = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
let cacheDatos = null; // se conserva mientras la pestaña esté abierta, para no volver a consultar Busint al cambiar de pantalla

export default function OrdenesCompraView({ db, functionsClient, currentUser, C, Btn }) {
  const [datos, setDatos] = useState(cacheDatos);
  const [cargando, setCargando] = useState(!cacheDatos);
  const [error, setError] = useState("");
  const [marcas, setMarcas] = useState({});
  const [tab, setTab] = useState("pendientes");
  const [q, setQ] = useState("");
  const [prov, setProv] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ventana, setVentana] = useState(60);
  const [abierta, setAbierta] = useState(null);
  const [limite, setLimite] = useState(50);
  const [insumoSel, setInsumoSel] = useState(null);
  const [soloSubieron, setSoloSubieron] = useState(true);
  const [periodoCosto, setPeriodoCosto] = useState(180);
  const hoy = hoyISO();

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const resp = await httpsCallable(functionsClient, "getOrdenesCompraBusint", { timeout: 540000 })({});
      cacheDatos = resp.data;
      setDatos(resp.data);
    } catch (err) {
      setError(err?.message || "No se pudieron traer las órdenes de compra de Busint.");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { if (!cacheDatos) cargar(); }, []); // eslint-disable-line
  useEffect(() => onSnapshot(collection(db, "contabilidad_ordenes_compra_recibidas"), (s) => {
    const m = {};
    s.docs.forEach((d) => { m[d.id] = d.data(); });
    setMarcas(m);
  }, () => {}), [db]);
  useEffect(() => { setLimite(50); }, [tab, q, prov, desde, hasta, ventana]);

  // Órdenes con sus totales
  const ordenes = useMemo(() => {
    const nombres = datos?.insumos || {};
    return (datos?.ordenes || []).map((o) => {
      let bruto = 0, desc = 0, unidades = 0;
      const lineas = o.l.map(([cod, cant, costo, dsc]) => {
        const b = cant * costo, d = (b * dsc) / 100;
        bruto += b; desc += d; unidades += cant;
        return { cod, nombre: nombres[cod] || `Insumo cód. ${cod}`, cant, costo, dsc, neto: costo * (1 - dsc / 100), total: b - d };
      });
      const base = bruto - desc;
      return { ...o, lineas, unidades, bruto, desc, base, iva: base * IVA, total: base * (1 + IVA) };
    });
  }, [datos]);

  // Historial de precio por insumo (orden cronológico) y la compra anterior de cada línea
  const { porInsumo, anteriorDeLinea } = useMemo(() => {
    const m = new Map();
    ordenes.forEach((o) => o.lineas.forEach((l) => {
      if (!(l.neto > 0)) return;
      if (!m.has(l.cod)) m.set(l.cod, { cod: l.cod, nombre: l.nombre, compras: [] });
      m.get(l.cod).compras.push({ oc: o.n, fecha: o.fi || o.ff || "", prov: o.pn, cant: l.cant, costo: l.costo, dsc: l.dsc, neto: l.neto });
    }));
    const ant = new Map();
    m.forEach((ins) => {
      ins.compras.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.oc - b.oc);
      ins.compras.forEach((c, i) => {
        if (i > 0) { const p = ins.compras[i - 1]; ant.set(`${c.oc}|${ins.cod}`, { neto: p.neto, fecha: p.fecha, pct: ((c.neto - p.neto) / p.neto) * 100 }); }
      });
    });
    return { porInsumo: [...m.values()], anteriorDeLinea: ant };
  }, [ordenes]);

  // Estado de entrega de cada orden
  function estadoDe(o) {
    const marca = marcas[String(o.n)];
    if (marca) {
      const dif = o.ff && marca.fecha ? diasEntre(o.ff, marca.fecha) : null;
      const txt = dif === null ? `Recibida ${fmtF(marca.fecha)}` : dif > 0 ? `Recibida ${fmtF(marca.fecha)} · ${plural(dif, "día", "días")} tarde` : dif < 0 ? `Recibida ${fmtF(marca.fecha)} · ${plural(-dif, "día", "días")} antes` : `Recibida ${fmtF(marca.fecha)} · a tiempo`;
      return { clave: "recibida", txt, bg: C.canvas, color: C.slate, borde: C.border, dias: 0 };
    }
    if (!o.ff) return { clave: "sinfecha", txt: "Sin fecha de entrega", bg: C.canvas, color: C.slate, borde: C.border, dias: 0 };
    const d = diasEntre(hoy, o.ff); // >0 faltan, <0 vencida
    if (d < 0) {
      if (o.ff < sumarDias(hoy, -ventana)) return { clave: "antigua", txt: `Sin confirmar · venció hace ${-d} días`, bg: C.canvas, color: C.slate, borde: C.border, dias: d };
      return { clave: "vencida", txt: `Vencida hace ${plural(-d, "día", "días")}`, bg: C.redBg, color: C.red, borde: "#F3B9B1", dias: d };
    }
    if (d === 0) return { clave: "porvencer", txt: "Vence hoy", bg: C.amberBg, color: C.amber, borde: "#F0CF95", dias: d };
    if (d <= 7) return { clave: "porvencer", txt: `Vence en ${plural(d, "día", "días")}`, bg: C.amberBg, color: C.amber, borde: "#F0CF95", dias: d };
    return { clave: "atiempo", txt: `A tiempo · ${d} días`, bg: C.greenBg, color: C.green, borde: "#B9E3CF", dias: d };
  }
  const conEstado = useMemo(() => ordenes.map((o) => ({ ...o, est: estadoDe(o) })), [ordenes, marcas, hoy, ventana]); // eslint-disable-line

  const proveedores = useMemo(() => [...new Set(ordenes.map((o) => o.pn).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [ordenes]);
  const qn = normTxt(q);
  function pasaFiltros(o) {
    if (prov && o.pn !== prov) return false;
    if (desde && (o.ff || "") < desde) return false;
    if (hasta && (o.ff || "9999") > hasta) return false;
    if (qn && !(String(o.n).includes(qn) || normTxt(o.pn).includes(qn) || o.lineas.some((l) => normTxt(l.nombre).includes(qn) || l.cod === qn))) return false;
    return true;
  }
  const pendientes = conEstado.filter((o) => ["vencida", "porvencer", "atiempo", "sinfecha"].includes(o.est.clave) && !marcas[String(o.n)]);
  const vencidas = pendientes.filter((o) => o.est.clave === "vencida");
  const porVencer7 = pendientes.filter((o) => o.est.clave === "porvencer");
  const ordenarPend = (a, b) => (a.ff || "9999").localeCompare(b.ff || "9999") || a.n - b.n;
  const listaPend = (tab === "vencidas" ? vencidas : pendientes).filter(pasaFiltros).sort(ordenarPend);
  const listaHist = conEstado.filter(pasaFiltros).sort((a, b) => b.n - a.n);
  const mesActual = hoy.slice(0, 7), mesAnterior = sumarDias(`${mesActual}-01`, -1).slice(0, 7);
  const comprasMes = (mes) => ordenes.filter((o) => (o.fi || "").startsWith(mes)).reduce((s, o) => s + o.base, 0);
  const variacionMes = comprasMes(mesAnterior) > 0 ? ((comprasMes(mesActual) - comprasMes(mesAnterior)) / comprasMes(mesAnterior)) * 100 : null;

  async function marcarRecibida(o) {
    const f = window.prompt(`¿Qué día llegó la orden ${o.n} (${o.pn})? Formato AAAA-MM-DD`, hoy);
    if (!f) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.trim())) { window.alert("Escribe la fecha como AAAA-MM-DD, por ejemplo 2026-10-16."); return; }
    await setDoc(doc(db, "contabilidad_ordenes_compra_recibidas", String(o.n)), { fecha: f.trim(), por: currentUser?.name || "", marcadaEn: new Date().toISOString() });
  }
  async function quitarMarca(o) {
    if (!window.confirm(`¿Quitar la marca de recibida de la orden ${o.n}?`)) return;
    await deleteDoc(doc(db, "contabilidad_ordenes_compra_recibidas", String(o.n)));
  }
  async function exportar(filas, nombre) {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    XLSX.writeFile(wb, `${nombre} ${hoy}.xlsx`);
  }
  const filasOrdenes = (lista) => lista.map((o) => ({ Orden: o.n, Proveedor: o.pn, "Fecha orden": fmtF(o.fi), "Fecha entrega": fmtF(o.ff), Estado: o.est.txt, Unidades: o.unidades, Bruto: Math.round(o.bruto), Descuento: Math.round(o.desc), "Base sin IVA": Math.round(o.base), IVA: Math.round(o.iva), "Neto a pagar": Math.round(o.total), Elaboró: o.u }));

  // ── piezas visuales ──
  const th = { textAlign: "left", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, padding: "8px 10px", background: "#FAF8F5", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", borderBottom: "1px solid #F0ECE3", whiteSpace: "nowrap", fontSize: 13 };
  const num = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const campo = { padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, fontSize: 13, fontFamily: "inherit", color: C.ink };
  const Pastilla = ({ est }) => <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: est.bg, color: est.color, border: `1px solid ${est.borde}` }}>{est.txt}</span>;
  const Cambio = ({ pct }) => pct === undefined || pct === null ? <span style={{ color: C.slate }}>—</span>
    : Math.abs(pct) < 0.05 ? <span style={{ color: C.slate }}>● igual</span>
    : <span style={{ color: pct > 0 ? C.red : C.green, fontWeight: 700 }}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</span>;
  const Kpi = ({ titulo, valor, detalle, tono }) => (
    <div style={{ background: tono === "rojo" ? C.redBg : tono === "ambar" ? C.amberBg : C.white, border: `1px solid ${tono === "rojo" ? "#F3B9B1" : tono === "ambar" ? "#F0CF95" : C.border}`, borderRadius: 14, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tono === "rojo" ? C.red : tono === "ambar" ? C.amber : C.ink }}>{valor}</div>
      <div style={{ fontSize: 12, color: C.slate }}>{detalle}</div>
    </div>
  );

  function DetalleOrden({ o }) {
    return (
      <div style={{ margin: "4px 0 14px", border: "1.5px solid #C9D9EA", borderRadius: 14, background: C.white, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, padding: "14px 18px", background: "#F6F9FC", borderBottom: "1px solid #D9E4F0" }}>
          {[["Proveedor", o.pn || "—", `Código ${o.p || "—"}`], ["Fecha de la orden", fmtF(o.fi)], ["Fecha de entrega", fmtF(o.ff), o.est.clave === "vencida" ? o.est.txt : ""], ["Elaboró", o.u || "—"]].map(([l, v, s]) => (
            <div key={l}><div style={{ fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 700, color: l === "Fecha de entrega" && o.est.clave === "vencida" ? C.red : C.ink }}>{v}</div>{s ? <div style={{ fontSize: 11.5, color: l === "Fecha de entrega" ? C.red : C.slate }}>{s}</div> : null}</div>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Cód.</th><th style={th}>Insumo</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Precio unit.</th><th style={{ ...th, textAlign: "right" }}>Desc.</th><th style={{ ...th, textAlign: "right" }}>Precio neto</th><th style={{ ...th, textAlign: "right" }}>Total línea</th><th style={th}>Frente a la compra anterior</th></tr></thead>
            <tbody>
              {o.lineas.map((l, i) => {
                const a = anteriorDeLinea.get(`${o.n}|${l.cod}`);
                return (
                  <tr key={i}>
                    <td style={td}>{l.cod}</td><td style={td}>{l.nombre}</td>
                    <td style={{ ...td, ...num }}>{l.cant.toLocaleString("es-CO")}</td><td style={{ ...td, ...num }}>{fmtCOP(l.costo)}</td>
                    <td style={{ ...td, ...num }}>{l.dsc ? `${l.dsc} %` : "—"}</td><td style={{ ...td, ...num }}>{fmtCOP(l.neto)}</td><td style={{ ...td, ...num }}>{fmtCOP(l.total)}</td>
                    <td style={td}>{a ? <><Cambio pct={a.pct} /> <span style={{ fontSize: 11.5, color: C.slate }}>antes {fmtCOP(a.neto)} · {fmtF(a.fecha)}</span></> : <span style={{ fontSize: 12, color: C.slate }}>primera compra registrada</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", padding: "14px 18px 16px" }}>
          <div style={{ fontSize: 12, color: C.slate, alignSelf: "flex-end", maxWidth: 520 }}>{o.unidades.toLocaleString("es-CO")} unidades · {plural(o.lineas.length, "línea", "líneas")}. El precio neto es precio unitario − descuento, sin IVA, para poder comparar entre compras. El IVA se calcula al {IVA * 100} %.</div>
          <div style={{ background: "#FAF8F5", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", minWidth: 300 }}>
            {[["Valor bruto", fmtCOP(o.bruto)], ["Descuento", `− ${fmtCOP(o.desc)}`], ["Base gravable", fmtCOP(o.base)], [`IVA (${IVA * 100} %)`, fmtCOP(o.iva)]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: C.slate, fontSize: 13 }}><span>{l}</span><span>{v}</span></div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1.5px solid ${C.ink}`, marginTop: 5, paddingTop: 7, fontWeight: 800, fontSize: 15 }}><span>Neto a pagar</span><span>{fmtCOP(o.total)}</span></div>
          </div>
        </div>
      </div>
    );
  }

  function TablaOrdenes({ lista, conPaginacion }) {
    const visibles = conPaginacion ? lista.slice(0, limite) : lista;
    return (
      <div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Orden</th><th style={th}>Proveedor</th><th style={th}>Fecha orden</th><th style={th}>Entrega</th><th style={th}>Estado</th><th style={{ ...th, textAlign: "right" }}>Unidades</th><th style={{ ...th, textAlign: "right" }}>Base sin IVA</th><th style={{ ...th, textAlign: "right" }}>IVA</th><th style={{ ...th, textAlign: "right" }}>Neto a pagar</th><th style={th} /></tr></thead>
            <tbody>
              {visibles.map((o) => (
                <tr key={o.n} onClick={() => setAbierta(abierta === o.n ? null : o.n)} style={{ cursor: "pointer", background: abierta === o.n ? "#EEF4FA" : o.est.clave === "vencida" ? "#FFF8F6" : "transparent" }}>
                  <td style={{ ...td, fontWeight: 800 }}>{o.n}</td><td style={td}>{o.pn || "—"}</td><td style={td}>{fmtF(o.fi)}</td><td style={td}>{fmtF(o.ff)}</td>
                  <td style={td}><Pastilla est={o.est} /></td>
                  <td style={{ ...td, ...num }}>{o.unidades.toLocaleString("es-CO")}</td><td style={{ ...td, ...num }}>{fmtCOP(o.base)}</td><td style={{ ...td, ...num }}>{fmtCOP(o.iva)}</td><td style={{ ...td, ...num, fontWeight: 800 }}>{fmtCOP(o.total)}</td>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    {marcas[String(o.n)] ? <Btn variant="ghost" small onClick={() => quitarMarca(o)}>Quitar recibida</Btn> : <Btn variant="secondary" small onClick={() => marcarRecibida(o)}>✔ Marcar recibida</Btn>}
                  </td>
                </tr>
              ))}
              {!visibles.length && <tr><td colSpan={10} style={{ ...td, color: C.slate, textAlign: "center", padding: 24 }}>No hay órdenes con esos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        {abierta && visibles.some((o) => o.n === abierta) && <div style={{ padding: "10px 0 0" }}><DetalleOrden o={visibles.find((o) => o.n === abierta)} /></div>}
        {conPaginacion && lista.length > limite && <div style={{ textAlign: "center", padding: 12 }}><Btn variant="secondary" small onClick={() => setLimite(limite + 100)}>Mostrar más ({lista.length - limite} restantes)</Btn></div>}
      </div>
    );
  }

  // ── Por insumo / Control de costo ──
  const insumosFiltrados = useMemo(() => porInsumo
    .filter((i) => !qn || normTxt(i.nombre).includes(qn) || i.cod === qn)
    .map((i) => { const ult = i.compras[i.compras.length - 1]; const prom = i.compras.reduce((s, c) => s + c.neto, 0) / i.compras.length; return { ...i, ult, prom }; })
    .sort((a, b) => String(b.ult.fecha).localeCompare(String(a.ult.fecha))), [porInsumo, qn]);
  const cambios = useMemo(() => {
    const limiteF = sumarDias(hoy, -periodoCosto);
    return porInsumo.filter((i) => i.compras.length >= 2)
      .map((i) => { const u = i.compras[i.compras.length - 1], p = i.compras[i.compras.length - 2]; return { cod: i.cod, nombre: i.nombre, ult: u, ant: p, pct: ((u.neto - p.neto) / p.neto) * 100, dif: u.neto - p.neto }; })
      .filter((c) => String(c.ult.fecha) >= limiteF && (!qn || normTxt(c.nombre).includes(qn)) && (!soloSubieron || c.pct > 0.05))
      .sort((a, b) => b.pct - a.pct);
  }, [porInsumo, periodoCosto, qn, soloSubieron, hoy]);

  const tabs = [["vencidas", `⚠ Vencidas (${vencidas.length})`], ["pendientes", `Pendientes (${pendientes.length})`], ["historial", `Historial (${ordenes.length.toLocaleString("es-CO")})`], ["insumo", "Por insumo"], ["costo", "Control de costo"]];
  const mostrarFiltroBase = tab === "vencidas" || tab === "pendientes" || tab === "historial";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginBottom: 4 }}>🛒 Órdenes de compra</div>
          <div style={{ fontSize: 13, color: C.slate, maxWidth: 700 }}>Lo que se le pidió a cada proveedor, cuándo debe llegar y cuánto cuesta (datos de Busint). Las vencidas salen primero. Busint no dice si ya llegó la mercancía: márcala como recibida con el botón de cada orden.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {datos?.generado && <span style={{ fontSize: 12, color: C.slate }}>Datos de Busint: {new Date(datos.generado).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</span>}
          <Btn variant="secondary" small onClick={cargar} disabled={cargando}>{cargando ? "Consultando Busint…" : "↻ Actualizar"}</Btn>
        </div>
      </div>
      {error && <div style={{ background: C.redBg, border: "1px solid #F3B9B1", color: C.red, borderRadius: 10, padding: "10px 14px", margin: "10px 0", fontSize: 13 }}>⚠ {error}</div>}
      {cargando && !datos && <div style={{ padding: 40, textAlign: "center", color: C.slate }}>Trayendo las órdenes de compra de Busint… (puede tardar un minuto)</div>}
      {datos && (
        <>
          <div style={{ display: "flex", gap: 6, margin: "14px 0", flexWrap: "wrap" }}>
            {tabs.map(([id, txt]) => (
              <button key={id} onClick={() => { setTab(id); setAbierta(null); }} style={{ padding: "8px 14px", borderRadius: 20, border: `1px solid ${tab === id ? C.ink : C.border}`, background: tab === id ? C.ink : id === "vencidas" && vencidas.length ? C.redBg : C.white, color: tab === id ? C.white : id === "vencidas" && vencidas.length ? C.red : C.slate, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{txt}</button>
            ))}
          </div>

          {(tab === "vencidas" || tab === "pendientes") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 14 }}>
              <Kpi tono={vencidas.length ? "rojo" : ""} titulo="Vencidas" valor={plural(vencidas.length, "orden", "órdenes")} detalle={vencidas.length ? `${fmtCOP(vencidas.reduce((s, o) => s + o.base, 0))} sin IVA · la más antigua hace ${-Math.min(...vencidas.map((o) => o.est.dias))} días` : "Nada vencido"} />
              <Kpi tono={porVencer7.length ? "ambar" : ""} titulo="Vencen en 7 días" valor={plural(porVencer7.length, "orden", "órdenes")} detalle={fmtCOP(porVencer7.reduce((s, o) => s + o.base, 0)) + " sin IVA"} />
              <Kpi titulo="Pendientes en total" valor={plural(pendientes.length, "orden", "órdenes")} detalle={`${fmtCOP(pendientes.reduce((s, o) => s + o.base, 0))} sin IVA · ${new Set(pendientes.map((o) => o.pn)).size} proveedores`} />
              <Kpi titulo={`Compras de ${new Date(`${mesActual}-15`).toLocaleDateString("es-CO", { month: "long" })}`} valor={fmtCOP(comprasMes(mesActual))} detalle={variacionMes === null ? "sin base de comparación" : `${variacionMes >= 0 ? "▲" : "▼"} ${Math.abs(variacionMes).toLocaleString("es-CO", { maximumFractionDigits: 1 })} % vs mes anterior (sin IVA)`} />
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "insumo" || tab === "costo" ? "🔎 Buscar insumo…" : "🔎 Buscar orden, proveedor o insumo…"} style={{ ...campo, minWidth: 280 }} />
            {mostrarFiltroBase && (
              <>
                <select value={prov} onChange={(e) => setProv(e.target.value)} style={campo}><option value="">Proveedor: todos</option>{proveedores.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                <label style={{ fontSize: 12, color: C.slate }}>Entrega desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={campo} /></label>
                <label style={{ fontSize: 12, color: C.slate }}>hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={campo} /></label>
              </>
            )}
            {(tab === "vencidas" || tab === "pendientes") && (
              <label style={{ fontSize: 12, color: C.slate }} title="Las órdenes sin marcar que vencieron antes de esta ventana no cuentan como vencidas: quedan en el Historial como «sin confirmar»">Vigilar vencidas de los últimos <select value={ventana} onChange={(e) => setVentana(Number(e.target.value))} style={campo}>{[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} días</option>)}</select></label>
            )}
            {tab === "costo" && (
              <>
                <label style={{ fontSize: 12, color: C.slate }}>Compras de los últimos <select value={periodoCosto} onChange={(e) => setPeriodoCosto(Number(e.target.value))} style={campo}>{[30, 90, 180, 365, 3650].map((d) => <option key={d} value={d}>{d === 3650 ? "todo el historial" : `${d} días`}</option>)}</select></label>
                <label style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}><input type="checkbox" checked={soloSubieron} onChange={(e) => setSoloSubieron(e.target.checked)} /> Solo los que subieron</label>
              </>
            )}
            {(tab === "vencidas" || tab === "pendientes") && <Btn variant="secondary" small onClick={() => exportar(filasOrdenes(listaPend), "Ordenes de compra pendientes")}>⬇ Exportar a Excel</Btn>}
            {tab === "historial" && <Btn variant="secondary" small onClick={() => exportar(filasOrdenes(listaHist), "Historial ordenes de compra")}>⬇ Exportar a Excel</Btn>}
            {tab === "costo" && <Btn variant="secondary" small onClick={() => exportar(cambios.map((c) => ({ Cód: c.cod, Insumo: c.nombre, "Precio anterior": Math.round(c.ant.neto), "Fecha anterior": fmtF(c.ant.fecha), "Precio ahora": Math.round(c.ult.neto), "Fecha ahora": fmtF(c.ult.fecha), "Cambio %": Math.round(c.pct * 10) / 10, Proveedor: c.ult.prov })), "Control de costo compras")}>⬇ Exportar a Excel</Btn>}
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
            {(tab === "vencidas" || tab === "pendientes") && <TablaOrdenes lista={listaPend} />}
            {tab === "historial" && <TablaOrdenes lista={listaHist} conPaginacion />}

            {tab === "insumo" && (
              <div style={{ display: "grid", gridTemplateColumns: insumoSel ? "minmax(320px, 1fr) minmax(380px, 1.2fr)" : "1fr", gap: 18 }}>
                <div style={{ overflowX: "auto", maxHeight: 640, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={th}>Cód.</th><th style={th}>Insumo</th><th style={{ ...th, textAlign: "right" }}>Compras</th><th style={{ ...th, textAlign: "right" }}>Último neto</th><th style={{ ...th, textAlign: "right" }}>Promedio</th><th style={th}>Último proveedor</th></tr></thead>
                    <tbody>
                      {insumosFiltrados.slice(0, 300).map((i) => (
                        <tr key={i.cod} onClick={() => setInsumoSel(i.cod)} style={{ cursor: "pointer", background: insumoSel === i.cod ? "#EEF4FA" : "transparent" }}>
                          <td style={td}>{i.cod}</td><td style={td}>{i.nombre}</td><td style={{ ...td, ...num }}>{i.compras.length}</td><td style={{ ...td, ...num }}>{fmtCOP(i.ult.neto)}</td><td style={{ ...td, ...num }}>{fmtCOP(i.prom)}</td><td style={td}>{i.ult.prov}</td>
                        </tr>
                      ))}
                      {!insumosFiltrados.length && <tr><td colSpan={6} style={{ ...td, color: C.slate, textAlign: "center", padding: 24 }}>No hay insumos con esa búsqueda.</td></tr>}
                    </tbody>
                  </table>
                  {insumosFiltrados.length > 300 && <div style={{ fontSize: 12, color: C.slate, padding: 8 }}>Se muestran 300 de {insumosFiltrados.length}: afina la búsqueda.</div>}
                </div>
                {insumoSel && (() => {
                  const ins = porInsumo.find((i) => i.cod === insumoSel);
                  if (!ins) return null;
                  const lista = [...ins.compras].reverse();
                  return (
                    <div style={{ overflowX: "auto", maxHeight: 640, overflowY: "auto" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{ins.nombre} <span style={{ color: C.slate, fontWeight: 400 }}>· cód. {ins.cod}</span></div>
                        <Btn variant="ghost" small onClick={() => setInsumoSel(null)}>Cerrar</Btn>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr><th style={th}>Fecha</th><th style={th}>Orden</th><th style={th}>Proveedor</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Unit.</th><th style={{ ...th, textAlign: "right" }}>Desc.</th><th style={{ ...th, textAlign: "right" }}>Neto</th><th style={th}>Cambio</th></tr></thead>
                        <tbody>
                          {lista.map((c, k) => {
                            const prev = lista[k + 1];
                            return (
                              <tr key={`${c.oc}-${k}`}>
                                <td style={td}>{fmtF(c.fecha)}</td><td style={td}>{c.oc}</td><td style={td}>{c.prov}</td><td style={{ ...td, ...num }}>{c.cant.toLocaleString("es-CO")}</td><td style={{ ...td, ...num }}>{fmtCOP(c.costo)}</td><td style={{ ...td, ...num }}>{c.dsc ? `${c.dsc} %` : "—"}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{fmtCOP(c.neto)}</td>
                                <td style={td}>{prev ? <Cambio pct={((c.neto - prev.neto) / prev.neto) * 100} /> : <span style={{ color: C.slate, fontSize: 12 }}>primera</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {tab === "costo" && (
              <div style={{ overflowX: "auto" }}>
                <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Precio neto (sin IVA, con descuento) de la última compra de cada insumo frente a la anterior. {cambios.length} insumo(s) en este período.</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Cód.</th><th style={th}>Insumo</th><th style={th}>Proveedor</th><th style={{ ...th, textAlign: "right" }}>Antes</th><th style={{ ...th, textAlign: "right" }}>Ahora</th><th style={{ ...th, textAlign: "right" }}>Diferencia</th><th style={th}>Cambio</th><th style={th}>Última compra</th></tr></thead>
                  <tbody>
                    {cambios.slice(0, 300).map((c) => (
                      <tr key={c.cod} onClick={() => { setInsumoSel(c.cod); setTab("insumo"); setQ(""); }} style={{ cursor: "pointer" }}>
                        <td style={td}>{c.cod}</td><td style={td}>{c.nombre}</td><td style={td}>{c.ult.prov}</td><td style={{ ...td, ...num }}>{fmtCOP(c.ant.neto)}</td><td style={{ ...td, ...num }}>{fmtCOP(c.ult.neto)}</td>
                        <td style={{ ...td, ...num, color: c.dif > 0 ? C.red : C.green }}>{c.dif > 0 ? "+" : "−"}{fmtCOP(Math.abs(c.dif))}</td><td style={td}><Cambio pct={c.pct} /></td><td style={td}>{fmtF(c.ult.fecha)} · OC {c.ult.oc}</td>
                      </tr>
                    ))}
                    {!cambios.length && <tr><td colSpan={8} style={{ ...td, color: C.slate, textAlign: "center", padding: 24 }}>No hay insumos con cambios en este período.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
