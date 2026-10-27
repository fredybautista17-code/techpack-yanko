// ─── CONTABILIDAD → 🛒 ÓRDENES DE COMPRA (2026-10-16, a pedido de Fredy) ─────────
// Trae de Busint las órdenes de compra (cabecera + líneas) con la función
// getOrdenesCompraBusint y muestra: vigentes y vencidas (por recibir), historial,
// historial de precio por insumo y control de costo (sube o baja frente a la compra anterior).
// Busint NO dice si la mercancía ya llegó, así que "recibida" se marca a mano
// (colección contabilidad_ordenes_compra_recibidas, un documento por orden). Para no llenar
// la pantalla de "vencidas" con años de órdenes viejas, solo se vigilan las que vencieron
// dentro de la ventana elegida (60 días por defecto); las anteriores quedan en el Historial.
// Precio neto = precio unitario − descuento, SIN IVA (para comparar entre compras).
import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const IVA = 0.19; // la cabecera de Busint trae 16 pero el PDF de la orden calcula 19 %
const fmtCOP = (n) => `$ ${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;
const fmtF = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "—");
const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const sumarDias = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const normTxt = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const unidadesCompatibles = (a, b) => !a.und || !b.und || a.und === b.und;
const etqUnidad = (u) => (u === "KG" ? "kg" : u === "M" ? "m" : "?");
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
let cacheDatos = null; // se conserva mientras la pestaña esté abierta, para no volver a consultar Busint al cambiar de pantalla

export default function OrdenesCompraView({ db, functionsClient, currentUser, C, Btn }) {
  const [datos, setDatos] = useState(cacheDatos);
  const [cargando, setCargando] = useState(!cacheDatos);
  const [error, setError] = useState("");
  const [marcas, setMarcas] = useState({});
  const [tab, setTab] = useState("vigentes");
  const [seleccion, setSeleccion] = useState({});
  const [diasBloque, setDiasBloque] = useState(30);
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
  useEffect(() => {
    if (!abierta) return undefined;
    const alTeclear = (e) => { if (e.key === "Escape") setAbierta(null); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierta]);

  // Órdenes con sus totales
  const ordenes = useMemo(() => {
    const nombres = datos?.insumos || {};
    return (datos?.ordenes || []).map((o) => {
      let bruto = 0, desc = 0, unidades = 0;
      const lineas = o.l.map(([cod, cant, costo, dsc, und]) => {
        const b = cant * costo, d = (b * dsc) / 100;
        bruto += b; desc += d; unidades += cant;
        return { cod, nombre: nombres[cod] || `Insumo cód. ${cod}`, cant, costo, dsc, und: und || "", neto: costo * (1 - dsc / 100), total: b - d };
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
      m.get(l.cod).compras.push({ oc: o.n, fecha: o.fi || o.ff || "", prov: o.pn, cant: l.cant, costo: l.costo, dsc: l.dsc, neto: l.neto, und: l.und });
    }));
    // (2026-10-27) Solo se comparan compras de la MISMA unidad (kilos con kilos, metros con metros). Si la unidad de una
    // de las dos no se pudo leer ("?"), se compara igual que antes. Si las dos son conocidas y distintas, no es comparable.
    const ant = new Map();
    m.forEach((ins) => {
      ins.compras.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.oc - b.oc);
      ins.compras.forEach((c, i) => {
        if (i === 0) return;
        let p = null;
        for (let j = i - 1; j >= 0; j--) { if (unidadesCompatibles(ins.compras[j], c)) { p = ins.compras[j]; break; } }
        if (p) ant.set(`${c.oc}|${ins.cod}`, { neto: p.neto, fecha: p.fecha, pct: ((c.neto - p.neto) / p.neto) * 100 });
        else { const q = ins.compras[i - 1]; ant.set(`${c.oc}|${ins.cod}`, { cambioUnidad: true, neto: q.neto, fecha: q.fecha, und: c.und, undAnt: q.und }); }
      });
    });
    return { porInsumo: [...m.values()], anteriorDeLinea: ant };
  }, [ordenes]);

  // Estado de entrega de cada orden
  function estadoDe(o) {
    const marca = marcas[String(o.n)];
    if (marca) {
      const dif = o.ff && marca.fecha ? diasEntre(o.ff, marca.fecha) : null;
      if (marca.bloque) return { clave: "recibida", txt: "Recibida (confirmada en bloque)", bg: C.canvas, color: C.slate, borde: C.border, dias: 0 };
      const txt = dif === null ? `Recibida ${fmtF(marca.fecha)}` : dif > 0 ? `Recibida ${fmtF(marca.fecha)} · ${plural(dif, "día", "días")} tarde` : dif < 0 ? `Recibida ${fmtF(marca.fecha)} · ${plural(-dif, "día", "días")} antes` : `Recibida ${fmtF(marca.fecha)} · a tiempo`;
      return { clave: "recibida", txt, bg: C.canvas, color: C.slate, borde: C.border, dias: 0 };
    }
    if (o.dx) return { clave: "cumplida", txt: `Cumplida en Busint${o.dx.f ? ` ${fmtF(o.dx.f)}` : ""}`, bg: C.blueBg, color: C.blue, borde: "#C9D9EA", dias: 0 };
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
  const vigentes = pendientes.filter((o) => o.est.clave !== "vencida");
  const cumplidasBusint = conEstado.filter((o) => o.est.clave === "cumplida");
  const cumplidasQueVencerian = cumplidasBusint.filter((o) => o.ff && o.ff < hoy && o.ff >= sumarDias(hoy, -ventana));
  const porVencer7 = pendientes.filter((o) => o.est.clave === "porvencer");
  const ordenarPend = (a, b) => (a.ff || "9999").localeCompare(b.ff || "9999") || a.n - b.n;
  const listaPend = (tab === "vencidas" ? vencidas : vigentes).filter(pasaFiltros).sort(ordenarPend);
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
  async function marcarEnBloque(lista, motivo) {
    if (!lista.length) { window.alert("No hay órdenes para marcar."); return; }
    if (!window.confirm(`${motivo}\n\nSe marcarán ${lista.length} órdenes como recibidas (confirmadas en bloque), usando su fecha de entrega como fecha de llegada. No cuentan en las estadísticas de a tiempo o tarde. ¿Continuar?`)) return;
    try {
      const marcadaEn = new Date().toISOString();
      for (let i = 0; i < lista.length; i += 400) {
        const lote = writeBatch(db);
        lista.slice(i, i + 400).forEach((o) => lote.set(doc(db, "contabilidad_ordenes_compra_recibidas", String(o.n)), { fecha: o.ff, por: currentUser?.name || "", marcadaEn, bloque: true }));
        await lote.commit();
      }
      setSeleccion({});
    } catch (err) {
      window.alert(`No se pudieron marcar: ${err?.message || err}`);
    }
  }
  async function exportar(filas, nombre) {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    XLSX.writeFile(wb, `${nombre} ${hoy}.xlsx`);
  }
  const filasOrdenes = (lista) => [...lista.map((o) => ({ Orden: o.n, Proveedor: o.pn, "Fecha orden": fmtF(o.fi), "Fecha entrega": fmtF(o.ff), Estado: o.est.txt, Unidades: o.unidades, Bruto: Math.round(o.bruto), Descuento: Math.round(o.desc), "Base sin IVA": Math.round(o.base), IVA: Math.round(o.iva), "Neto a pagar": Math.round(o.total), Elaboró: o.u })), ...(lista.length ? [{ Orden: "TOTAL", Proveedor: `${lista.length} órdenes`, Unidades: Math.round(lista.reduce((x, o) => x + o.unidades, 0)), Bruto: Math.round(lista.reduce((x, o) => x + o.bruto, 0)), Descuento: Math.round(lista.reduce((x, o) => x + o.desc, 0)), "Base sin IVA": Math.round(lista.reduce((x, o) => x + o.base, 0)), IVA: Math.round(lista.reduce((x, o) => x + o.iva, 0)), "Neto a pagar": Math.round(lista.reduce((x, o) => x + o.total, 0)) }] : [])];

  // ── piezas visuales ──
  const th = { textAlign: "left", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, padding: "8px 10px", background: "#FAF8F5", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", borderBottom: "1px solid #F0ECE3", whiteSpace: "nowrap", fontSize: 13 };
  const num = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const campo = { padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, fontSize: 13, fontFamily: "inherit", color: C.ink };
  const Pastilla = ({ est }) => <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: est.bg, color: est.color, border: `1px solid ${est.borde}` }}>{est.txt}</span>;
  const Cambio = ({ pct }) => pct === undefined || pct === null ? <span style={{ color: C.slate }}>—</span>
    : Math.abs(pct) < 0.05 ? <span style={{ color: C.slate }}>● igual</span>
    : <span style={{ color: pct > 0 ? C.red : C.green, fontWeight: 700 }}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</span>;
  const CambioUnidad = ({ ahora, antes }) => <span title="La compra anterior está en otra unidad (kilos vs metros): el precio no es comparable." style={{ color: C.amber, fontWeight: 700 }}>⇄ cambio de unidad ({etqUnidad(antes)} → {etqUnidad(ahora)})</span>;
  const Kpi = ({ titulo, valor, detalle, tono }) => (
    <div style={{ background: tono === "rojo" ? C.redBg : tono === "ambar" ? C.amberBg : C.white, border: `1px solid ${tono === "rojo" ? "#F3B9B1" : tono === "ambar" ? "#F0CF95" : C.border}`, borderRadius: 14, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tono === "rojo" ? C.red : tono === "ambar" ? C.amber : C.ink }}>{valor}</div>
      <div style={{ fontSize: 12, color: C.slate }}>{detalle}</div>
    </div>
  );

  function DetalleOrden({ o }) {
    return (
      <div style={{ border: "1.5px solid #C9D9EA", borderRadius: 14, background: C.white, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, padding: "14px 18px", background: "#F6F9FC", borderBottom: "1px solid #D9E4F0" }}>
          {[["Proveedor", o.pn || "—", `Código ${o.p || "—"}`], ["Fecha de la orden", fmtF(o.fi)], ["Fecha de entrega", fmtF(o.ff), o.est.clave === "vencida" ? o.est.txt : ""], ["Elaboró", o.u || "—"], ...(o.dx ? [["Cumplida en Busint", o.dx.f ? fmtF(o.dx.f) : "Sí", o.dx.u ? `por ${o.dx.u}` : ""]] : [])].map(([l, v, s]) => (
            <div key={l}><div style={{ fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 700, color: l === "Fecha de entrega" && o.est.clave === "vencida" ? C.red : C.ink }}>{v}</div>{s ? <div style={{ fontSize: 11.5, color: l === "Fecha de entrega" ? C.red : C.slate }}>{s}</div> : null}</div>
          ))}
        </div>
        {!o.lineas.length && <div style={{ padding: "18px", color: C.slate, fontSize: 13 }}>Esta orden no tiene líneas registradas en Busint (0 unidades, $0).</div>}
        <div style={{ overflowX: "auto", display: o.lineas.length ? "block" : "none" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Cód.</th><th style={th}>Insumo</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Precio unit.</th><th style={{ ...th, textAlign: "right" }}>Desc.</th><th style={{ ...th, textAlign: "right" }}>Precio neto</th><th style={{ ...th, textAlign: "right" }}>Total línea</th><th style={th}>Frente a la compra anterior</th></tr></thead>
            <tbody>
              {o.lineas.map((l, i) => {
                const a = anteriorDeLinea.get(`${o.n}|${l.cod}`);
                return (
                  <tr key={i}>
                    <td style={td}>{l.cod}</td><td style={td}>{l.nombre}</td>
                    <td style={{ ...td, ...num }}>{l.cant.toLocaleString("es-CO")}{l.und ? ` ${etqUnidad(l.und)}` : ""}</td><td style={{ ...td, ...num }}>{fmtCOP(l.costo)}{l.und ? ` /${etqUnidad(l.und)}` : ""}</td>
                    <td style={{ ...td, ...num }}>{l.dsc ? `${l.dsc} %` : "—"}</td><td style={{ ...td, ...num }}>{fmtCOP(l.neto)}</td><td style={{ ...td, ...num }}>{fmtCOP(l.total)}</td>
                    <td style={td}>{a ? (a.cambioUnidad ? <><CambioUnidad ahora={a.und} antes={a.undAnt} /> <span style={{ fontSize: 11.5, color: C.slate }}>antes {fmtCOP(a.neto)} · {fmtF(a.fecha)}</span></> : <><Cambio pct={a.pct} /> <span style={{ fontSize: 11.5, color: C.slate }}>antes {fmtCOP(a.neto)} · {fmtF(a.fecha)}</span></>) : <span style={{ fontSize: 12, color: C.slate }}>primera compra registrada</span>}</td>
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

  // (2026-10-22, a pedido de Fredy) Cuánto se necesita para pagar todas las órdenes que están a la vista (respeta los filtros).
  const sumarOrdenes = (lista) => lista.reduce((t, o) => ({ n: t.n + 1, unidades: t.unidades + o.unidades, bruto: t.bruto + o.bruto, desc: t.desc + o.desc, base: t.base + o.base, iva: t.iva + o.iva, total: t.total + o.total }), { n: 0, unidades: 0, bruto: 0, desc: 0, base: 0, iva: 0, total: 0 });
  function ResumenPagar({ lista, titulo }) {
    if (!lista.length) return null;
    const t = sumarOrdenes(lista);
    const porProv = new Map();
    lista.forEach((o) => {
      const k = o.pn || "Sin proveedor";
      const x = porProv.get(k) || { prov: k, n: 0, base: 0, iva: 0, total: 0 };
      x.n += 1; x.base += o.base; x.iva += o.iva; x.total += o.total;
      porProv.set(k, x);
    });
    const filasProv = [...porProv.values()].sort((a, b) => b.total - a.total);
    return (
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, background: "#FAF8F5" }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{titulo}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.ink }}>{fmtCOP(t.total)}</div>
            <div style={{ fontSize: 12, color: C.slate }}>{plural(t.n, "orden", "órdenes")} · {filasProv.length} {filasProv.length === 1 ? "proveedor" : "proveedores"} · neto a pagar con IVA</div>
          </div>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 12.5, color: C.slate, fontVariantNumeric: "tabular-nums" }}>
            <span>Valor bruto<br /><strong style={{ color: C.ink, fontSize: 14 }}>{fmtCOP(t.bruto)}</strong></span>
            <span>Descuento<br /><strong style={{ color: C.ink, fontSize: 14 }}>− {fmtCOP(t.desc)}</strong></span>
            <span>Base sin IVA<br /><strong style={{ color: C.ink, fontSize: 14 }}>{fmtCOP(t.base)}</strong></span>
            <span>IVA ({IVA * 100} %)<br /><strong style={{ color: C.ink, fontSize: 14 }}>{fmtCOP(t.iva)}</strong></span>
          </div>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.ink }}>Cuánto se le paga a cada proveedor</summary>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Proveedor</th><th style={{ ...th, textAlign: "right" }}>Órdenes</th><th style={{ ...th, textAlign: "right" }}>Base sin IVA</th><th style={{ ...th, textAlign: "right" }}>IVA</th><th style={{ ...th, textAlign: "right" }}>Neto a pagar</th></tr></thead>
              <tbody>
                {filasProv.map((x) => (
                  <tr key={x.prov}><td style={td}>{x.prov}</td><td style={{ ...td, ...num }}>{x.n}</td><td style={{ ...td, ...num }}>{fmtCOP(x.base)}</td><td style={{ ...td, ...num }}>{fmtCOP(x.iva)}</td><td style={{ ...td, ...num, fontWeight: 800 }}>{fmtCOP(x.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    );
  }

  function TablaOrdenes({ lista, conPaginacion, seleccionable }) {
    const visibles = conPaginacion ? lista.slice(0, limite) : lista;
    return (
      <div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{seleccionable && <th style={th}><input type="checkbox" aria-label="Seleccionar todas" checked={lista.length > 0 && lista.every((o) => seleccion[o.n])} onChange={(e) => { const m = {}; if (e.target.checked) lista.forEach((o) => { m[o.n] = true; }); setSeleccion(m); }} /></th>}<th style={th}>Orden</th><th style={th}>Proveedor</th><th style={th}>Fecha orden</th><th style={th}>Entrega</th><th style={th}>Estado</th><th style={{ ...th, textAlign: "right" }}>Unidades</th><th style={{ ...th, textAlign: "right" }}>Base sin IVA</th><th style={{ ...th, textAlign: "right" }}>IVA</th><th style={{ ...th, textAlign: "right" }}>Neto a pagar</th><th style={th} /></tr></thead>
            <tbody>
              {visibles.map((o) => (
                <tr key={o.n} onClick={() => setAbierta(abierta === o.n ? null : o.n)} style={{ cursor: "pointer", background: abierta === o.n ? "#EEF4FA" : o.est.clave === "vencida" ? "#FFF8F6" : "transparent" }}>
                  {seleccionable && <td style={td} onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar orden ${o.n}`} checked={!!seleccion[o.n]} onChange={(e) => setSeleccion({ ...seleccion, [o.n]: e.target.checked })} /></td>}
                  <td style={{ ...td, fontWeight: 800 }}>{o.n}</td><td style={td}>{o.pn || "—"}</td><td style={td}>{fmtF(o.fi)}</td><td style={td}>{fmtF(o.ff)}</td>
                  <td style={td}><Pastilla est={o.est} /></td>
                  <td style={{ ...td, ...num }}>{o.unidades.toLocaleString("es-CO")}</td><td style={{ ...td, ...num }}>{fmtCOP(o.base)}</td><td style={{ ...td, ...num }}>{fmtCOP(o.iva)}</td><td style={{ ...td, ...num, fontWeight: 800 }}>{fmtCOP(o.total)}</td>
                  <td style={td} onClick={(e) => e.stopPropagation()}>
                    {marcas[String(o.n)] ? <Btn variant="ghost" small onClick={() => quitarMarca(o)}>Quitar recibida</Btn> : o.est.clave === "cumplida" ? null : <Btn variant="secondary" small onClick={() => marcarRecibida(o)}>✔ Marcar recibida</Btn>}
                  </td>
                </tr>
              ))}
              {lista.length > 0 && (() => {
                const t = sumarOrdenes(lista);
                const tdT = { ...td, ...num, fontWeight: 800, background: "#FAF8F5", borderTop: `1.5px solid ${C.ink}` };
                return (
                  <tr>
                    <td style={{ ...tdT, textAlign: "left" }} colSpan={seleccionable ? 6 : 5}>TOTAL · {plural(t.n, "orden", "órdenes")}</td>
                    <td style={tdT}>{t.unidades.toLocaleString("es-CO")}</td><td style={tdT}>{fmtCOP(t.base)}</td><td style={tdT}>{fmtCOP(t.iva)}</td><td style={tdT}>{fmtCOP(t.total)}</td><td style={tdT} />
                  </tr>
                );
              })()}
              {!visibles.length && <tr><td colSpan={11} style={{ ...td, color: C.slate, textAlign: "center", padding: 24 }}>No hay órdenes con esos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
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
    // (2026-10-27) Se compara la última compra con la anterior de la MISMA unidad. Si la anterior está en otra unidad
    // (kilos vs metros) la fila sale marcada "cambio de unidad", sin porcentaje, y no cuenta como aumento.
    return porInsumo.filter((i) => i.compras.length >= 2)
      .map((i) => {
        const u = i.compras[i.compras.length - 1];
        const previas = i.compras.slice(0, -1);
        const p = [...previas].reverse().find((x) => unidadesCompatibles(x, u));
        if (p) return { cod: i.cod, nombre: i.nombre, ult: u, ant: p, pct: ((u.neto - p.neto) / p.neto) * 100, dif: u.neto - p.neto, cambioUnidad: false };
        const q = previas[previas.length - 1];
        return { cod: i.cod, nombre: i.nombre, ult: u, ant: q, pct: null, dif: null, cambioUnidad: true };
      })
      .filter((c) => String(c.ult.fecha) >= limiteF && (!qn || normTxt(c.nombre).includes(qn)) && (!soloSubieron || (!c.cambioUnidad && c.pct > 0.05)))
      .sort((a, b) => (a.cambioUnidad ? 1 : 0) - (b.cambioUnidad ? 1 : 0) || (b.pct ?? 0) - (a.pct ?? 0));
  }, [porInsumo, periodoCosto, qn, soloSubieron, hoy]);

  // Cuadro al frente con el detalle de la orden (se abre al hacer clic en una fila)
  const ordenAbierta = abierta ? conEstado.find((o) => o.n === abierta) : null;
  const listaNavegable = tab === "historial" ? listaHist : listaPend;
  const posAbierta = ordenAbierta ? listaNavegable.findIndex((o) => o.n === ordenAbierta.n) : -1;
  const irA = (delta) => { const o = listaNavegable[posAbierta + delta]; if (o) setAbierta(o.n); };
  const tabs = [["vigentes", `Vigentes (${vigentes.length})`], ["vencidas", `⚠ Vencidas (${vencidas.length})`], ["historial", `Historial (${ordenes.length.toLocaleString("es-CO")})`], ["insumo", "Por insumo"], ["costo", "Control de costo"]];
  const mostrarFiltroBase = tab === "vencidas" || tab === "vigentes" || tab === "historial";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, marginBottom: 4 }}>🛒 Órdenes de compra</div>
          <div style={{ fontSize: 13, color: C.slate, maxWidth: 700 }}>Lo que se le pidió a cada proveedor, cuándo debe llegar y cuánto cuesta (datos de Busint). Vigentes son las que aún están dentro de su fecha de entrega. Las que Busint ya dio por cumplidas salen solas; para el resto, márcalas como recibidas con el botón de cada orden o en bloque desde Vencidas.</div>
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

          {(tab === "vencidas" || tab === "vigentes") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
              <Kpi titulo="Vigentes" valor={plural(vigentes.length, "orden", "órdenes")} detalle={`${fmtCOP(vigentes.reduce((s2, o) => s2 + o.base, 0))} sin IVA · ${new Set(vigentes.map((o) => o.pn)).size} proveedores`} />
              <Kpi tono={porVencer7.length ? "ambar" : ""} titulo="Vencen en 7 días" valor={plural(porVencer7.length, "orden", "órdenes")} detalle={fmtCOP(porVencer7.reduce((s2, o) => s2 + o.base, 0)) + " sin IVA"} />
              <Kpi tono={vencidas.length ? "rojo" : ""} titulo="Vencidas" valor={plural(vencidas.length, "orden", "órdenes")} detalle={vencidas.length ? `${fmtCOP(vencidas.reduce((s2, o) => s2 + o.base, 0))} sin IVA · la más antigua hace ${-Math.min(...vencidas.map((o) => o.est.dias))} días` : "Nada vencido"} />
              <Kpi titulo="Cumplidas en Busint" valor={cumplidasBusint.length.toLocaleString("es-CO")} detalle={`${plural(cumplidasQueVencerian.length, "ya había pasado", "ya habían pasado")} su fecha de entrega en los últimos ${ventana} días: sin esto saldrían vencidas`} />
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
            {(tab === "vencidas" || tab === "vigentes") && (
              <label style={{ fontSize: 12, color: C.slate }} title="Las órdenes sin marcar que vencieron antes de esta ventana no cuentan como vencidas: quedan en el Historial como «sin confirmar»">Vigilar vencidas de los últimos <select value={ventana} onChange={(e) => setVentana(Number(e.target.value))} style={campo}>{[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} días</option>)}</select></label>
            )}
            {tab === "costo" && (
              <>
                <label style={{ fontSize: 12, color: C.slate }}>Compras de los últimos <select value={periodoCosto} onChange={(e) => setPeriodoCosto(Number(e.target.value))} style={campo}>{[30, 90, 180, 365, 3650].map((d) => <option key={d} value={d}>{d === 3650 ? "todo el historial" : `${d} días`}</option>)}</select></label>
                <label style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}><input type="checkbox" checked={soloSubieron} onChange={(e) => setSoloSubieron(e.target.checked)} /> Solo los que subieron</label>
              </>
            )}
            {(tab === "vencidas" || tab === "vigentes") && <Btn variant="secondary" small onClick={() => exportar(filasOrdenes(listaPend), tab === "vencidas" ? "Ordenes de compra vencidas" : "Ordenes de compra vigentes")}>⬇ Exportar a Excel</Btn>}
            {tab === "vencidas" && (() => {
              const elegidas = listaPend.filter((o) => seleccion[o.n]);
              const viejas = vencidas.filter((o) => -o.est.dias > diasBloque);
              return (
                <>
                  <Btn variant="success" small disabled={!elegidas.length} onClick={() => marcarEnBloque(elegidas, "Las órdenes seleccionadas llegaron.")}>✔ Marcar seleccionadas como recibidas ({elegidas.length})</Btn>
                  <label style={{ fontSize: 12, color: C.slate }}>Marcar recibidas las vencidas de hace más de <select value={diasBloque} onChange={(e) => setDiasBloque(Number(e.target.value))} style={campo}>{[7, 15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} días</option>)}</select></label>
                  <Btn variant="secondary" small disabled={!viejas.length} onClick={() => marcarEnBloque(viejas, `Todas las vencidas de hace más de ${diasBloque} días (de todos los proveedores) ya llegaron.`)}>Marcar {viejas.length}</Btn>
                </>
              );
            })()}
            {tab === "historial" && <Btn variant="secondary" small onClick={() => exportar(filasOrdenes(listaHist), "Historial ordenes de compra")}>⬇ Exportar a Excel</Btn>}
            {tab === "costo" && <Btn variant="secondary" small onClick={() => exportar(cambios.map((c) => ({ Cód: c.cod, Insumo: c.nombre, "Unidad anterior": etqUnidad(c.ant.und), "Precio anterior": Math.round(c.ant.neto), "Fecha anterior": fmtF(c.ant.fecha), "Unidad ahora": etqUnidad(c.ult.und), "Precio ahora": Math.round(c.ult.neto), "Fecha ahora": fmtF(c.ult.fecha), "Cambio %": c.cambioUnidad ? "" : Math.round(c.pct * 10) / 10, Nota: c.cambioUnidad ? "Cambio de unidad: no comparable" : "", Proveedor: c.ult.prov })), "Control de costo compras")}>⬇ Exportar a Excel</Btn>}
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
            {(tab === "vencidas" || tab === "vigentes") && <ResumenPagar lista={listaPend} titulo={tab === "vencidas" ? "Necesito para pagar todas las vencidas" : "Necesito para pagar todas las vigentes"} />}
            {tab === "historial" && <ResumenPagar lista={listaHist} titulo="Total de las órdenes a la vista (historial)" />}
            {(tab === "vencidas" || tab === "vigentes") && <TablaOrdenes lista={listaPend} seleccionable={tab === "vencidas"} />}
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
                            const prev = lista.slice(k + 1).find((x) => unidadesCompatibles(x, c));
                            const prevOtraUnidad = !prev ? lista[k + 1] : null;
                            return (
                              <tr key={`${c.oc}-${k}`}>
                                <td style={td}>{fmtF(c.fecha)}</td><td style={td}>{c.oc}</td><td style={td}>{c.prov}</td><td style={{ ...td, ...num }}>{c.cant.toLocaleString("es-CO")}{c.und ? ` ${etqUnidad(c.und)}` : ""}</td><td style={{ ...td, ...num }}>{fmtCOP(c.costo)}{c.und ? ` /${etqUnidad(c.und)}` : ""}</td><td style={{ ...td, ...num }}>{c.dsc ? `${c.dsc} %` : "—"}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{fmtCOP(c.neto)}</td>
                                <td style={td}>{prev ? <Cambio pct={((c.neto - prev.neto) / prev.neto) * 100} /> : prevOtraUnidad ? <CambioUnidad ahora={c.und} antes={prevOtraUnidad.und} /> : <span style={{ color: C.slate, fontSize: 12 }}>primera</span>}</td>
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
                <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Precio neto (sin IVA, con descuento) de la última compra de cada insumo frente a la anterior <b>de la misma unidad</b> (kilos con kilos, metros con metros; la unidad se lee de la observación de la orden). {cambios.length} insumo(s) en este período{cambios.some((c) => c.cambioUnidad) ? <> · <span style={{ color: C.amber, fontWeight: 700 }}>{cambios.filter((c) => c.cambioUnidad).length} con cambio de unidad (no comparables, van al final y no cuentan como aumento)</span></> : ""}.</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Cód.</th><th style={th}>Insumo</th><th style={th}>Proveedor</th><th style={{ ...th, textAlign: "right" }}>Antes</th><th style={{ ...th, textAlign: "right" }}>Ahora</th><th style={{ ...th, textAlign: "right" }}>Diferencia</th><th style={th}>Cambio</th><th style={th}>Última compra</th></tr></thead>
                  <tbody>
                    {cambios.slice(0, 300).map((c) => (
                      <tr key={c.cod} onClick={() => { setInsumoSel(c.cod); setTab("insumo"); setQ(""); }} style={{ cursor: "pointer" }}>
                        <td style={td}>{c.cod}</td><td style={td}>{c.nombre}</td><td style={td}>{c.ult.prov}</td><td style={{ ...td, ...num }}>{fmtCOP(c.ant.neto)}{c.ant.und ? ` /${etqUnidad(c.ant.und)}` : ""}</td><td style={{ ...td, ...num }}>{fmtCOP(c.ult.neto)}{c.ult.und ? ` /${etqUnidad(c.ult.und)}` : ""}</td>
                        <td style={{ ...td, ...num, color: c.cambioUnidad ? C.slate : c.dif > 0 ? C.red : C.green }}>{c.cambioUnidad ? "—" : <>{c.dif > 0 ? "+" : "−"}{fmtCOP(Math.abs(c.dif))}</>}</td><td style={td}>{c.cambioUnidad ? <CambioUnidad ahora={c.ult.und} antes={c.ant.und} /> : <Cambio pct={c.pct} />}</td><td style={td}>{fmtF(c.ult.fecha)} · OC {c.ult.oc}</td>
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
      {ordenAbierta && (
        <div onClick={() => setAbierta(null)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Orden de compra ${ordenAbierta.n}`} style={{ background: C.canvas, borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", width: "100%", maxWidth: 1000, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Orden de compra {ordenAbierta.n}</div>
                <Pastilla est={ordenAbierta.est} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {posAbierta >= 0 && <Btn variant="secondary" small onClick={() => irA(-1)} disabled={posAbierta <= 0}>← Anterior</Btn>}
                {posAbierta >= 0 && <span style={{ fontSize: 12, color: C.slate }}>{posAbierta + 1} de {listaNavegable.length}</span>}
                {posAbierta >= 0 && <Btn variant="secondary" small onClick={() => irA(1)} disabled={posAbierta >= listaNavegable.length - 1}>Siguiente →</Btn>}
                <button onClick={() => setAbierta(null)} aria-label="Cerrar" style={{ border: "none", background: C.white, borderRadius: 8, width: 34, height: 34, fontSize: 18, cursor: "pointer", color: C.ink, boxShadow: `0 0 0 1px ${C.border}` }}>✕</button>
              </div>
            </div>
            <DetalleOrden o={ordenAbierta} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              {marcas[String(ordenAbierta.n)]
                ? <Btn variant="ghost" onClick={() => quitarMarca(ordenAbierta)}>Quitar recibida</Btn>
                : ordenAbierta.est.clave === "cumplida" ? <span style={{ alignSelf: "center", fontSize: 12.5, color: C.blue, fontWeight: 700 }}>Busint ya la dio por cumplida</span>
                : <Btn variant="success" onClick={() => marcarRecibida(ordenAbierta)}>✔ Marcar recibida</Btn>}
              <Btn variant="secondary" onClick={() => setAbierta(null)}>Cerrar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
