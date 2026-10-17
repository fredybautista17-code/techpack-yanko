// ─── EXPLOSIÓN DE MATERIALES ──────────────────────────────────────────────────
// (2026-10-17, a pedido de Fredy) Pestaña de Pedidos: se eligen uno o varios
// pedidos y se calcula, con la ficha técnica de cada referencia en Busint
// (función "getFichaMaterialesBusint"), cuánto material hace falta, cuánto hay
// en bodega, cuánto viene en órdenes de compra vigentes ("getOrdenesCompraBusint",
// solo administradores) y cuánto falta comprar.
//   Necesito = Σ (unidades × consumo por prenda) × (1 + merma)
//   Falta    = Necesito − Tengo − En camino   (nunca menor que 0)
// Unidades = lo pedido, o solo lo que falta por cortar (opción, activa por
// defecto) para no pedir de nuevo lo que ya se cortó.
import React, { useState, useMemo, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const fmt = (n, dec = 2) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("es-CO", { maximumFractionDigits: dec }) : "—");
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const normTxt = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const sumarDias = (iso, d) => { const f = new Date(iso + "T12:00:00"); f.setDate(f.getDate() + d); return f.toISOString().slice(0, 10); };
const LS = "atlasExplosion_opciones";
let cacheOC = null; // { en: Date.now(), datos }

function leerOpciones() {
  try { return { mermaTela: 0, mermaInsumo: 0, soloPorCortar: true, ...(JSON.parse(localStorage.getItem(LS) || "{}")) }; } catch { return { mermaTela: 0, mermaInsumo: 0, soloPorCortar: true }; }
}
function guardarOpciones(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch {} }

// Unidades pendientes de una referencia del pedido (pedido − ya cortado)
export function unidadesPendientes(pedido, r) {
  const cortado = (pedido.cortesRealizados || []).flatMap((c) => c.refs || []).filter((cr) => cr.refId === r.id)
    .reduce((s, cr) => s + Object.values(cr.tallas || {}).reduce((a, v) => a + (Number(v) || 0), 0), 0);
  return { total: Number(r.total) || 0, cortado, pendiente: Math.max(0, (Number(r.total) || 0) - cortado) };
}

function tipoUnidadTela(u) {
  const t = String(u || "").trim().toLowerCase().replace(/\./g, "");
  if (t === "m2" || t === "m²") return "m2";
  if (t === "kg" || t === "kgs" || t === "kilo" || t === "kilos") return "kg";
  return "m"; // vacío, Mt, ML, m...
}

// Núcleo del cálculo (función pura)
export function calcularExplosion({ lineas, fichas, enCamino, mermaTela, mermaInsumo }) {
  const telas = new Map();
  const insumos = new Map();
  const otros = new Map();
  const sinFicha = new Map();
  const avisosTela = [];
  lineas.forEach((l) => {
    const ficha = fichas.get(`${l.ref}|${l.pinta}`);
    if (!ficha) return;
    if (!ficha.tieneTelas && !ficha.tieneInsumos) { sinFicha.set(l.ref, (sinFicha.get(l.ref) || 0) + l.unidades); return; }
    if (!ficha.tieneTelas) avisosTela.push(`${l.ref}: sin tela registrada en Busint`);
    ficha.telas.forEach((t) => {
      const tipo = tipoUnidadTela(t.unidad);
      const clave = `${t.nombre}|${t.color || "?"}|${tipo}`;
      let a = telas.get(clave);
      if (!a) {
        const tengo = tipo === "m" ? t.stockMl : tipo === "m2" ? t.stockM2 : null;
        a = { clave, tipo: "tela", nombre: t.nombre, color: t.color, codcomp: t.codcomp, unidad: tipo === "m" ? "m" : tipo === "m2" ? "m²" : "kg", necesito: 0, tengo: t.motivo === "ok" ? tengo : null, promedio: t.promedio, motivo: t.motivo, enCamino: 0, vencidas: 0, usos: [] };
        telas.set(clave, a);
      }
      const cant = l.unidades * t.consumo * (1 + mermaTela / 100);
      a.necesito += cant;
      a.usos.push({ pedido: l.pedido, ref: l.ref, color: l.color, unidades: l.unidades, consumo: t.consumo, cant });
      if (t.motivo !== "ok") avisosTela.push(`${l.ref} (${l.pinta}) · ${t.nombre}: ${({ sin_detalle_color: "sin detalle de color en Busint", slot_sin_color: "sin color asignado", color_no_en_inventario: "ese color no está en inventario" })[t.motivo] || t.motivo}`);
    });
    ficha.insumos.forEach((ins) => {
      if (!ins.material) {
        const o = otros.get(ins.insumo) || { nombre: ins.insumo, refs: new Set(), cant: ins.cant };
        o.refs.add(l.ref); otros.set(ins.insumo, o); return;
      }
      if (!(ins.cant > 0)) return;
      const clave = ins.insumo.toUpperCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
      let a = insumos.get(clave);
      if (!a) {
        a = { clave, tipo: "insumo", nombre: ins.insumo, unidad: ins.inventario.unidad || "", necesito: 0, tengo: ins.inventario.cantidad, colores: ins.inventario.colores, promedio: ins.inventario.promedio, codcomps: ins.inventario.codcomps, enCamino: 0, vencidas: 0, usos: [] };
        insumos.set(clave, a);
      }
      const cant = l.unidades * ins.cant * (1 + mermaInsumo / 100);
      a.necesito += cant;
      a.usos.push({ pedido: l.pedido, ref: l.ref, color: l.color, unidades: l.unidades, consumo: ins.cant, cant, ubicacion: ins.ubicacion });
    });
  });
  const cerrar = (a) => {
    if (a.tipo === "tela") {
      if (a.codcomp && enCamino.has(a.codcomp)) { a.enCamino = enCamino.get(a.codcomp).vig; a.vencidas = enCamino.get(a.codcomp).venc; }
    } else {
      (a.codcomps || []).forEach((c) => { const e = enCamino.get(c); if (e) { a.enCamino += e.vig; a.vencidas += e.venc; } });
    }
    if (a.tengo === null || a.tengo === undefined) { a.falta = null; a.estado = "sindato"; }
    else {
      a.falta = Math.max(0, a.necesito - a.tengo - a.enCamino);
      a.estado = a.falta > 0.005 ? "comprar" : a.tengo >= a.necesito - 0.005 ? "cubierto" : "cubierto_oc";
    }
    a.costoFalta = a.falta && a.promedio > 0 ? a.falta * a.promedio : 0;
    return a;
  };
  const orden = { comprar: 0, sindato: 1, cubierto_oc: 2, cubierto: 3 };
  const ordenar = (arr) => arr.map(cerrar).sort((x, y) => orden[x.estado] - orden[y.estado] || (y.falta || 0) - (x.falta || 0) || x.nombre.localeCompare(y.nombre, "es"));
  return {
    telas: ordenar([...telas.values()]),
    insumos: ordenar([...insumos.values()]),
    otros: [...otros.values()].map((o) => ({ ...o, refs: [...o.refs] })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    sinFicha: [...sinFicha.entries()].map(([ref, unidades]) => ({ ref, unidades })),
    avisosTela: [...new Set(avisosTela)],
  };
}

const ESTADOS = {
  comprar: { txt: "Comprar", fg: "#9A3A2D", bg: "#FBE9E6" },
  sindato: { txt: "Sin dato de bodega", fg: "#3F5565", bg: "#E8EEF2" },
  cubierto_oc: { txt: "Cubierto con OC", fg: "#A8660B", bg: "#FDF1DA" },
  cubierto: { txt: "Hay suficiente", fg: "#1E7A52", bg: "#E3F5EC" },
};

export default function ExplosionMaterialesView({ db, functionsClient, T, pedidos, currentUser }) {
  const [opc, setOpc] = useState(leerOpciones);
  const [sel, setSel] = useState({});
  const [q, setQ] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState("");
  const [avisoOC, setAvisoOC] = useState("");
  const [datos, setDatos] = useState(null); // { fichas: Map, enCamino: Map, lineas, generado }
  const [tab, setTab] = useState("telas");
  const [soloFalta, setSoloFalta] = useState(false);
  const [abierto, setAbierto] = useState({});

  useEffect(() => { guardarOpciones(opc); }, [opc]);

  const candidatos = useMemo(() => (pedidos || []).filter((p) => p.estado === "activo").map((p) => {
    const unidades = (p.referencias || []).reduce((s, r) => s + unidadesPendientes(p, r).pendiente, 0);
    const total = (p.referencias || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
    return { p, unidades, total };
  }).sort((a, b) => String(a.p.fechaDespacho || "9999").localeCompare(String(b.p.fechaDespacho || "9999"))), [pedidos]);
  const visibles = useMemo(() => {
    const k = normTxt(q);
    return !k ? candidatos : candidatos.filter(({ p }) => normTxt(`${p.numero} ${p.cliente} ${(p.referencias || []).map((r) => r.ref).join(" ")}`).includes(k));
  }, [candidatos, q]);
  const elegidos = candidatos.filter(({ p }) => sel[p.id]);

  // Líneas (ref + color + unidades) de los pedidos elegidos, según la opción de unidades
  const lineas = useMemo(() => {
    const out = [];
    elegidos.forEach(({ p }) => (p.referencias || []).forEach((r) => {
      const u = unidadesPendientes(p, r);
      const unidades = opc.soloPorCortar ? u.pendiente : u.total;
      if (unidades <= 0) return;
      const [pinta, ...resto] = String(r.descripcion || "").split(" · ");
      out.push({ pedido: p.numero, cliente: p.cliente, ref: String(r.ref || "").trim(), pinta: pinta.trim(), color: resto.join(" · ").trim(), unidades });
    }));
    return out;
  }, [elegidos, opc.soloPorCortar]); // eslint-disable-line

  async function calcular() {
    if (!lineas.length) return;
    setCalculando(true); setError(""); setAvisoOC("");
    try {
      const unicos = [...new Map(lineas.map((l) => [`${l.ref}|${l.pinta}`, { ref: l.ref, pinta: l.pinta }])).values()];
      const pFicha = httpsCallable(functionsClient, "getFichaMaterialesBusint", { timeout: 540000 })({ items: unicos });
      const pOC = (async () => {
        if (cacheOC && Date.now() - cacheOC.en < 15 * 60 * 1000) return cacheOC.datos;
        try {
          const [resp, marcasSnap] = await Promise.all([
            httpsCallable(functionsClient, "getOrdenesCompraBusint", { timeout: 540000 })({}),
            getDocs(collection(db, "contabilidad_ordenes_compra_recibidas")),
          ]);
          const marcas = new Set(marcasSnap.docs.map((d) => d.id));
          const hoy = hoyISO();
          const desde = sumarDias(hoy, -60);
          const mapa = new Map();
          (resp.data?.ordenes || []).forEach((o) => {
            if (o.dx || marcas.has(String(o.n)) || !o.ff) return;
            const vigente = o.ff >= hoy;
            if (!vigente && o.ff < desde) return;
            (o.l || []).forEach(([cod, cant]) => {
              const e = mapa.get(cod) || { vig: 0, venc: 0 };
              if (vigente) e.vig += cant; else e.venc += cant;
              mapa.set(cod, e);
            });
          });
          cacheOC = { en: Date.now(), datos: mapa };
          return mapa;
        } catch (err) {
          setAvisoOC("No pude traer las órdenes de compra (la consulta es solo para administradores o falló). \"En camino\" queda en 0.");
          return new Map();
        }
      })();
      const [respFicha, enCamino] = await Promise.all([pFicha, pOC]);
      const fichas = new Map((respFicha.data?.items || []).map((i) => [`${i.ref}|${i.pinta}`, i]));
      setDatos({ fichas, enCamino, lineas, generado: respFicha.data?.generado });
      setAbierto({});
    } catch (err) {
      setError(err?.message || "No se pudo consultar Busint.");
    } finally {
      setCalculando(false);
    }
  }

  const resultado = useMemo(() => datos ? calcularExplosion({ lineas: datos.lineas, fichas: datos.fichas, enCamino: datos.enCamino, mermaTela: Number(opc.mermaTela) || 0, mermaInsumo: Number(opc.mermaInsumo) || 0 }) : null, [datos, opc.mermaTela, opc.mermaInsumo]);

  async function exportar() {
    if (!resultado) return;
    const XLSX = await import("xlsx");
    const fila = (a) => ({ Tipo: a.tipo === "tela" ? "Tela" : "Insumo", Material: a.nombre, "Color (cód.)": a.color || "", Unidad: a.unidad, Necesito: +a.necesito.toFixed(2), Tengo: a.tengo == null ? "" : +a.tengo.toFixed(2), "En camino (OC)": +a.enCamino.toFixed(2), "Falta comprar": a.falta == null ? "" : +a.falta.toFixed(2), "Costo prom. unidad": Math.round(a.promedio || 0), "Costo estimado": Math.round(a.costoFalta || 0), Estado: ESTADOS[a.estado].txt });
    const todo = [...resultado.telas, ...resultado.insumos];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todo.map(fila)), "Explosión");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todo.filter((a) => a.estado === "comprar").map(fila)), "Para comprar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todo.flatMap((a) => a.usos.map((u) => ({ Material: a.nombre, "Color (cód.)": a.color || "", Pedido: u.pedido, Referencia: u.ref, Color: u.color, Unidades: u.unidades, "Consumo por prenda": u.consumo, Cantidad: +u.cant.toFixed(2) })))), "Detalle por referencia");
    XLSX.writeFile(wb, `Explosion de materiales ${hoyISO()}.xlsx`);
  }

  const th = { textAlign: "left", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.slate, padding: "8px 10px", background: "#FAF8F5", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", borderBottom: "1px solid #F0ECE3", fontSize: 13 };
  const nu = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const campo = { padding: "7px 10px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: T.ink, background: T.white };
  const Pill = ({ e }) => <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: ESTADOS[e].bg, color: ESTADOS[e].fg, whiteSpace: "nowrap" }}>{ESTADOS[e].txt}</span>;
  const Kpi = ({ t, v, d, rojo }) => (
    <div style={{ background: rojo ? "#FBE9E6" : T.white, border: `1px solid ${rojo ? "#F3B9B1" : T.border}`, borderRadius: 14, padding: "12px 16px", minWidth: 150 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.slate, fontWeight: 700 }}>{t}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: rojo ? "#9A3A2D" : T.ink }}>{v}</div>
      <div style={{ fontSize: 12, color: T.slate }}>{d}</div>
    </div>
  );

  const lista = resultado ? (tab === "telas" ? resultado.telas : resultado.insumos) : [];
  const listaVista = soloFalta ? lista.filter((a) => a.estado === "comprar" || a.estado === "sindato") : lista;
  const todos = resultado ? [...resultado.telas, ...resultado.insumos] : [];
  const aComprar = todos.filter((a) => a.estado === "comprar");
  const costoTotal = aComprar.reduce((s, a) => s + a.costoFalta, 0);

  return (
    <div>
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, color: T.ink, fontSize: 15 }}>1. Elige los pedidos</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 N° pedido, cliente o referencia" style={{ ...campo, minWidth: 260 }} />
          <button onClick={() => setSel((s) => { const n = { ...s }; visibles.forEach(({ p }) => { n[p.id] = true; }); return n; })} style={{ ...campo, cursor: "pointer", fontWeight: 600 }}>Seleccionar los visibles</button>
          <button onClick={() => setSel({})} style={{ ...campo, cursor: "pointer", fontWeight: 600 }}>Quitar selección</button>
        </div>
        <div style={{ maxHeight: 260, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}></th><th style={th}>Pedido</th><th style={th}>Cliente</th><th style={{ ...th, textAlign: "right" }}>Pedido</th><th style={{ ...th, textAlign: "right" }}>Por cortar</th><th style={th}>Despacho</th></tr></thead>
            <tbody>
              {visibles.map(({ p, unidades, total }) => (
                <tr key={p.id} onClick={() => setSel((s) => ({ ...s, [p.id]: !s[p.id] }))} style={{ cursor: "pointer", background: sel[p.id] ? T.denimBg : "transparent" }}>
                  <td style={td}><input type="checkbox" checked={!!sel[p.id]} readOnly /></td>
                  <td style={{ ...td, fontWeight: 700 }}>{p.numero}</td>
                  <td style={td}>{p.cliente}</td>
                  <td style={{ ...td, ...nu }}>{fmt(total, 0)}</td>
                  <td style={{ ...td, ...nu }}>{fmt(unidades, 0)}</td>
                  <td style={td}>{p.fechaDespacho || "—"}</td>
                </tr>
              ))}
              {!visibles.length && <tr><td style={{ ...td, color: T.slate }} colSpan={6}>No hay pedidos activos que coincidan.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={opc.soloPorCortar} onChange={(e) => setOpc({ ...opc, soloPorCortar: e.target.checked })} /> Solo lo que falta por cortar
          </label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>Merma telas
            <input type="number" min="0" max="50" step="0.5" value={opc.mermaTela} onChange={(e) => setOpc({ ...opc, mermaTela: e.target.value })} style={{ ...campo, width: 64 }} /> %
          </label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>Merma insumos
            <input type="number" min="0" max="50" step="0.5" value={opc.mermaInsumo} onChange={(e) => setOpc({ ...opc, mermaInsumo: e.target.value })} style={{ ...campo, width: 64 }} /> %
          </label>
          <button disabled={!lineas.length || calculando} onClick={calcular} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: lineas.length ? T.ink : T.border, color: T.white, fontWeight: 700, cursor: lineas.length ? "pointer" : "default" }}>
            {calculando ? "Consultando Busint… (puede tardar 1–2 min)" : `🧮 Calcular materiales${elegidos.length ? ` (${elegidos.length} pedido${elegidos.length === 1 ? "" : "s"} · ${fmt(lineas.reduce((s, l) => s + l.unidades, 0), 0)} prendas)` : ""}`}
          </button>
        </div>
      </div>

      {error && <div style={{ background: "#FBE9E6", color: "#9A3A2D", border: "1px solid #F3B9B1", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      {avisoOC && <div style={{ background: T.amberBg, color: T.amber, border: "1px solid #F0CF95", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>{avisoOC}</div>}

      {resultado && (
        <div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Kpi t="Materiales" v={todos.length} d={`${resultado.telas.length} telas · ${resultado.insumos.length} insumos`} />
            <Kpi t="Hay que comprar" v={aComprar.length} d={costoTotal ? `≈ ${money(costoTotal)} al costo promedio` : "materiales con faltante"} rojo={aComprar.length > 0} />
            <Kpi t="Cubiertos con OC" v={todos.filter((a) => a.estado === "cubierto_oc").length} d="falta bodega pero viene en camino" />
            <Kpi t="Hay suficiente" v={todos.filter((a) => a.estado === "cubierto").length} d="ya está en bodega" />
            <Kpi t="Sin dato de bodega" v={todos.filter((a) => a.estado === "sindato").length} d="revisar a mano" />
          </div>

          {(resultado.sinFicha.length > 0 || resultado.avisosTela.length > 0) && (
            <div style={{ background: T.amberBg, border: "1px solid #F0CF95", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: T.ink }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Revisa antes de comprar</div>
              {resultado.sinFicha.length > 0 && <div>Sin ficha de materiales en Busint (no entran al cálculo): {resultado.sinFicha.map((s) => `${s.ref} (${fmt(s.unidades, 0)} u)`).join(", ")}.</div>}
              {resultado.avisosTela.slice(0, 12).map((a, i) => <div key={i}>• {a}</div>)}
              {resultado.avisosTela.length > 12 && <div>… y {resultado.avisosTela.length - 12} avisos más.</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {[["telas", `Telas (${resultado.telas.length})`], ["insumos", `Insumos (${resultado.insumos.length})`], ["fichas", "Fichas leídas"], ["otros", `Otras filas de la ficha (${resultado.otros.length})`]].map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${tab === v ? T.ink : T.border}`, background: tab === v ? T.ink : T.white, color: tab === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
            ))}
            {(tab === "telas" || tab === "insumos") && <label style={{ fontSize: 13, marginLeft: 8, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={soloFalta} onChange={(e) => setSoloFalta(e.target.checked)} /> Solo lo que falta</label>}
            <button onClick={exportar} style={{ ...campo, marginLeft: "auto", cursor: "pointer", fontWeight: 700 }}>⬇ Excel (todo + lista para comprar)</button>
          </div>

          {(tab === "telas" || tab === "insumos") && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Material</th><th style={{ ...th, textAlign: "right" }}>Necesito</th><th style={{ ...th, textAlign: "right" }}>Tengo</th><th style={{ ...th, textAlign: "right" }}>En camino (OC)</th><th style={{ ...th, textAlign: "right" }}>Falta comprar</th><th style={th}>Estado</th></tr></thead>
                <tbody>
                  {listaVista.map((a) => (
                    <React.Fragment key={a.clave}>
                      <tr onClick={() => setAbierto((s) => ({ ...s, [a.clave]: !s[a.clave] }))} style={{ cursor: "pointer" }}>
                        <td style={td}>
                          <div style={{ fontWeight: 700 }}>{abierto[a.clave] ? "▾" : "▸"} {a.nombre}</div>
                          <div style={{ fontSize: 11.5, color: T.slate }}>
                            {a.tipo === "tela" ? `Color ${a.color || "sin asignar"}${a.codcomp ? ` · Cód. ${a.codcomp}` : ""}` : `${a.colores} color${a.colores === 1 ? "" : "es"} en bodega (se suman)`} · {a.usos.length} uso{a.usos.length === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td style={{ ...td, ...nu }}>{fmt(a.necesito)} {a.unidad}</td>
                        <td style={{ ...td, ...nu }}>{a.tengo == null ? "—" : `${fmt(a.tengo)} ${a.unidad}`}</td>
                        <td style={{ ...td, ...nu }}>{a.enCamino ? fmt(a.enCamino) : "—"}{a.vencidas ? <div style={{ fontSize: 11, color: T.slate }}>+{fmt(a.vencidas)} en OC vencidas</div> : null}</td>
                        <td style={{ ...td, ...nu, fontWeight: 800, color: a.falta > 0 ? "#9A3A2D" : T.ink }}>{a.falta == null ? "?" : a.falta > 0 ? `${fmt(a.falta)} ${a.unidad}` : "0"}{a.costoFalta ? <div style={{ fontSize: 11, color: T.slate, fontWeight: 400 }}>≈ {money(a.costoFalta)}</div> : null}</td>
                        <td style={td}><Pill e={a.estado} /></td>
                      </tr>
                      {abierto[a.clave] && (
                        <tr><td colSpan={6} style={{ ...td, background: "#FAF8F5" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                            <thead><tr><th style={th}>Pedido</th><th style={th}>Referencia</th><th style={th}>Color</th><th style={{ ...th, textAlign: "right" }}>Prendas</th><th style={{ ...th, textAlign: "right" }}>Consumo por prenda</th><th style={{ ...th, textAlign: "right" }}>Cantidad</th></tr></thead>
                            <tbody>{a.usos.map((u, i) => (
                              <tr key={i}><td style={td}>{u.pedido}</td><td style={td}>{u.ref}</td><td style={td}>{u.color || "—"}{u.ubicacion ? ` · ${u.ubicacion}` : ""}</td><td style={{ ...td, ...nu }}>{fmt(u.unidades, 0)}</td><td style={{ ...td, ...nu }}>{fmt(u.consumo, 4)}</td><td style={{ ...td, ...nu }}>{fmt(u.cant)}</td></tr>
                            ))}</tbody>
                          </table>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                  {!listaVista.length && <tr><td colSpan={6} style={{ ...td, color: T.slate }}>{soloFalta ? "Nada por comprar en esta lista." : "No hay materiales de este tipo."}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === "fichas" && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, fontSize: 13 }}>
              <div style={{ color: T.slate, marginBottom: 10 }}>Esto es lo que ATLAS leyó de la ficha de cada referencia en Busint, por prenda. Compáralo con tu ficha técnica para confirmar que el consumo está bien.</div>
              {[...datos.fichas.values()].map((f) => (
                <div key={`${f.ref}|${f.pinta}`} style={{ borderTop: `1px solid ${T.border}`, padding: "8px 0" }}>
                  <div style={{ fontWeight: 800 }}>{f.ref} <span style={{ fontWeight: 500, color: T.slate }}>· pinta {f.pinta || "—"}</span></div>
                  {f.telas.map((t) => <div key={t.slot}>🧵 {t.nombre} · color {t.color || "?"} · {fmt(t.consumo, 4)} {t.unidad || "m"} por prenda{t.usaSesgo ? " (con sesgo)" : ""}{!f.telas.length ? "" : ""}</div>)}
                  {!f.telas.length && <div style={{ color: T.slate }}>Sin tela registrada.</div>}
                  {f.insumos.filter((i) => i.material).map((i, k) => <div key={k}>🔩 {i.insumo} · {fmt(i.cant, 4)} por prenda{i.ubicacion ? ` · ${i.ubicacion}` : ""}</div>)}
                  {!f.insumos.some((i) => i.material) && <div style={{ color: T.slate }}>Sin insumos con inventario en Busint.</div>}
                </div>
              ))}
            </div>
          )}

          {tab === "otros" && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "auto" }}>
              <div style={{ padding: 12, fontSize: 13, color: T.slate }}>Filas de la ficha que no coinciden con ningún insumo del inventario (procesos, mano de obra, servicios u otros nombres). No entran al cálculo. Si aquí aparece un material real, dímelo para ajustarlo.</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Fila de la ficha</th><th style={{ ...th, textAlign: "right" }}>Valor "Cant"</th><th style={th}>Referencias</th></tr></thead>
                <tbody>{resultado.otros.map((o) => <tr key={o.nombre}><td style={td}>{o.nombre}</td><td style={{ ...td, ...nu }}>{fmt(o.cant, 4)}</td><td style={td}>{o.refs.slice(0, 6).join(", ")}{o.refs.length > 6 ? ` +${o.refs.length - 6}` : ""}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
