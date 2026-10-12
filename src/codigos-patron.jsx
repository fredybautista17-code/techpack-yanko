// ─── CÓDIGOS DE REFERENCIA POR PATRÓN ─────────────────────────────────────────
// (2026-10-12, a pedido de Fredy) Antes, cada regla amarraba Categoría + Línea
// + Grupo + Cliente a un prefijo y un rango, así que cada marca nueva obligaba
// a escribir decenas de reglas. Ahora el patrón se separa en dos tablas:
//   1) config.bloquesCategoria: UN bloque por categoría (Cachetero 1-99,
//      Byker 100-199, Falda 200-299...), igual para todas las marcas. El
//      desborde sigue el patrón ×10 (200-299 → 2000-2999) o se deja manual.
//   2) config.marcasPrefijos: UNA fila por marca/cliente con su prefijo por
//      grupo (Dama, Caballero, Niña, Niño).
// Código = prefijo de la marca y grupo + número del bloque de la categoría.
// Las reglas viejas (config.codigosReferencia) siguen funcionando: una regla
// puntual (con cliente, línea o grupo) le gana al patrón, y el patrón le gana
// a una regla genérica (ver buscarEntradaCodigoReferencia en App.js).
import React, { useState, useEffect, useMemo } from "react";

const uidLocal = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad3 = (n) => String(n).padStart(3, "0");

// Desborde automático ×10: el bloque 200-299 sigue en 2000-2999. Los bloques
// que empiezan por debajo de 100 (el 001-099) y los muy anchos (1000 o más)
// no tienen desborde automático.
export function desbordeAuto(inicio, fin) {
  const ini = Number(inicio);
  const f = Number(fin);
  if (!Number.isFinite(ini) || !Number.isFinite(f) || ini < 100 || f - ini >= 900) return null;
  const base = Math.floor(ini / 100) * 100;
  return { inicio: base * 10, fin: base * 10 + 999 };
}
// Desborde efectivo de un bloque según su modo: "auto" | "ninguno" | "manual"
export function desbordeDeBloque(b) {
  const modo = b?.desbordeModo || "auto";
  if (modo === "ninguno") return null;
  if (modo === "manual") {
    const i = Number(b.desbordeInicio);
    const f = Number(b.desbordeFin);
    return i > 0 && f >= i ? { inicio: i, fin: f } : null;
  }
  return desbordeAuto(b.inicio, b.fin);
}

// Una celda de la tabla de prefijos puede traer varios, separados por coma,
// espacio o punto y coma (ej. "98, 82"). El primero es el predeterminado.
export function listaPrefijos(valor) {
  const vistos = new Set();
  return String(valor || "").split(/[,;\s]+/).map((x) => x.trim()).filter((x) => {
    if (!x || vistos.has(x)) return false;
    vistos.add(x);
    return true;
  });
}

// Busca el código por patrón: prefijo de la marca (según el grupo de la línea)
// + bloque de la categoría. Devuelve el mismo formato de entrada que usa
// sugerirReferencia, o null si el patrón no alcanza.
export function buscarPorPatron(categoria, linea, cliente, config, prefijoElegido) {
  if (!categoria || !cliente) return null;
  const bloque = (config?.bloquesCategoria || []).find((b) => b.categoria === categoria);
  if (!bloque) return null;
  const marca = (config?.marcasPrefijos || []).find((m) => m.cliente === cliente);
  if (!marca) return null;
  const grupo = (config?.lineaGrupoMap || {})[linea] || "";
  const lista = listaPrefijos((marca.prefijos || {})[grupo]);
  if (!lista.length) return null;
  const prefijo = lista.includes(prefijoElegido) ? prefijoElegido : lista[0];
  const d = desbordeDeBloque(bloque);
  return {
    id: `patron-${marca.id}-${bloque.id}-${prefijo}`,
    categoria,
    cliente,
    grupo,
    prefijo,
    prefijosDisponibles: lista,
    rangoInicio: Number(bloque.inicio),
    rangoFin: Number(bloque.fin),
    desbordeInicio: d ? d.inicio : "",
    desbordeFin: d ? d.fin : "",
    origen: "patron",
  };
}

// Modelos disponibles para importar: cada combinación marca + grupo + prefijo
// que aparece en las reglas sueltas, y los prefijos de reglas sin marca.
export function modelosDeReglas(config) {
  const m = new Map();
  (config.codigosReferencia || []).forEach((c) => {
    if (!c.prefijo || !c.categoria) return;
    const prefijo = String(c.prefijo).trim();
    const clave = `${c.cliente || ""}|${c.grupo || ""}|${prefijo}`;
    if (!m.has(clave)) m.set(clave, { clave, cliente: c.cliente || "", grupo: c.grupo || "", prefijo, reglas: 0 });
    m.get(clave).reglas += 1;
  });
  return [...m.values()]
    .sort((a, b) => b.reglas - a.reglas)
    .map((x) => ({
      ...x,
      etiqueta: `${x.cliente || "Reglas sin marca"}${x.grupo ? " · " + x.grupo : ""} · prefijo ${x.prefijo} (${x.reglas} regla${x.reglas === 1 ? "" : "s"})`,
    }));
}

// Normaliza un nombre de categoría para detectar los casi iguales
// (Falda / Faldas, Capri / Capry, Cachetero / Short Cachetero).
function claveParecida(n) {
  return String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/y/g, "i").replace(/[^a-z0-9]/g, "").replace(/^short(?=.{4})/, "").replace(/s$/, "");
}
export function categoriasParecidas(nombres) {
  const lista = [...new Set((nombres || []).filter(Boolean))];
  const pares = [];
  lista.forEach((a, i) => lista.slice(i + 1).forEach((b) => {
    const ka = claveParecida(a);
    const kb = claveParecida(b);
    if (!ka || !kb) return;
    if (ka === kb) pares.push([a, b]);
  }));
  return pares;
}

// Arma las dos tablas a partir de las reglas sueltas. Los BLOQUES salen solo
// de las reglas del modelo elegido (una marca + grupo + prefijo), porque cada
// prefijo puede tener rangos propios (ej. el 82 usa rangos anchos) y mezclarlos
// todos daba bloques que se pisaban. Los PREFIJOS por marca y grupo salen de
// todas las reglas que traen cliente y grupo. Solo agrega lo que todavía no
// está (no pisa nada).
export function importarDesdeReglas(config, modeloClave) {
  const reglas = config.codigosReferencia || [];
  const rangoDe = (c) => {
    const tiene = c.rangoInicio != null && c.rangoInicio !== "";
    const base = (Number(c.segmento) || 0) * 100;
    return { ini: tiene ? Number(c.rangoInicio) : base + 1, fin: tiene ? Number(c.rangoFin) : base + 99 };
  };
  const masFrecuente = (mapa) => [...mapa.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const delModelo = modeloClave
    ? reglas.filter((c) => c.prefijo && c.categoria && `${c.cliente || ""}|${c.grupo || ""}|${String(c.prefijo).trim()}` === modeloClave)
    : [];
  const porCat = new Map();
  delModelo.forEach((c) => {
    const { ini, fin } = rangoDe(c);
    const tieneD = c.desbordeInicio !== "" && c.desbordeInicio != null && c.desbordeFin !== "" && c.desbordeFin != null;
    const clave = `${ini}|${fin}|${tieneD ? c.desbordeInicio : ""}|${tieneD ? c.desbordeFin : ""}`;
    if (!porCat.has(c.categoria)) porCat.set(c.categoria, new Map());
    const m = porCat.get(c.categoria);
    m.set(clave, (m.get(clave) || 0) + 1);
  });
  const yaCats = new Set((config.bloquesCategoria || []).map((b) => b.categoria));
  const bloquesNuevos = [];
  porCat.forEach((mapa, categoria) => {
    if (yaCats.has(categoria)) return;
    const [ini, fin, dI, dF] = masFrecuente(mapa).split("|");
    const bloque = { id: uidLocal(), categoria, inicio: Number(ini), fin: Number(fin), desbordeModo: "ninguno" };
    if (dI !== "" && dF !== "") {
      const auto = desbordeAuto(bloque.inicio, bloque.fin);
      if (auto && auto.inicio === Number(dI) && auto.fin === Number(dF)) bloque.desbordeModo = "auto";
      else { bloque.desbordeModo = "manual"; bloque.desbordeInicio = Number(dI); bloque.desbordeFin = Number(dF); }
    }
    bloquesNuevos.push(bloque);
  });

  const porMarca = new Map(); // cliente -> grupo -> Map(prefijo -> n)
  reglas.forEach((c) => {
    if (!c.cliente || !c.grupo || !c.prefijo) return;
    if (!porMarca.has(c.cliente)) porMarca.set(c.cliente, new Map());
    const g = porMarca.get(c.cliente);
    if (!g.has(c.grupo)) g.set(c.grupo, new Map());
    const p = g.get(c.grupo);
    p.set(String(c.prefijo).trim(), (p.get(String(c.prefijo).trim()) || 0) + 1);
  });
  const yaMarcas = new Set((config.marcasPrefijos || []).map((m) => m.cliente));
  const marcasNuevas = [];
  porMarca.forEach((grupos, cliente) => {
    if (yaMarcas.has(cliente)) return;
    const prefijos = {};
    grupos.forEach((mapa, grupo) => { prefijos[grupo] = masFrecuente(mapa); });
    marcasNuevas.push({ id: uidLocal(), cliente, prefijos });
  });
  return { bloquesNuevos, marcasNuevas };
}

// Celda que escribe en local y guarda al salir (evita una escritura por tecla)
function Celda({ value, onCommit, style, type = "text", placeholder, ancho }) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <input
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (String(v) !== String(value ?? "")) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ width: ancho || "100%", padding: "7px 8px", border: "1.5px solid #E8E2DB", borderRadius: 8, fontSize: 13, fontFamily: "inherit", fontVariantNumeric: "tabular-nums", ...style }}
    />
  );
}

export default function PatronCodigosReferencia({ config, onUpdateConfig, T, sugerir }) {
  const bloques = config.bloquesCategoria || [];
  const marcas = config.marcasPrefijos || [];
  const grupos = config.gruposLinea || ["Dama", "Caballero", "Niña", "Niño"];
  const clientes = (config.clientes || []).map((c) => c.nombre).filter(Boolean);
  const [nuevoBloque, setNuevoBloque] = useState({ categoria: "", inicio: "", fin: "" });
  const [nuevaMarca, setNuevaMarca] = useState({ cliente: "", copiarDe: "" });
  const [msg, setMsg] = useState("");
  const [prueba, setPrueba] = useState({ cliente: "", grupo: "", categoria: "", prefijo: "" });
  const modelos = useMemo(() => modelosDeReglas(config), [config]);
  const [modeloSel, setModeloSel] = useState("");
  const parecidas = useMemo(() => categoriasParecidas([...(config.categorias || []), ...bloques.map((b) => b.categoria)]), [config.categorias, bloques]);

  const bloquesOrdenados = useMemo(() => [...bloques].sort((a, b) => Number(a.inicio) - Number(b.inicio) || a.categoria.localeCompare(b.categoria)), [bloques]);

  // Choques: un rango (principal o desborde) que pisa el de OTRA categoría
  const choques = useMemo(() => {
    const rangos = [];
    bloques.forEach((b) => {
      rangos.push({ cat: b.categoria, ini: Number(b.inicio), fin: Number(b.fin), tipo: "principal" });
      const d = desbordeDeBloque(b);
      if (d) rangos.push({ cat: b.categoria, ini: d.inicio, fin: d.fin, tipo: "desborde" });
    });
    const m = new Map();
    rangos.forEach((a, i) => rangos.slice(i + 1).forEach((b) => {
      if (a.cat === b.cat) return;
      if (a.ini <= b.fin && b.ini <= a.fin) {
        if (!m.has(a.cat)) m.set(a.cat, new Set());
        if (!m.has(b.cat)) m.set(b.cat, new Set());
        m.get(a.cat).add(`${b.cat} (${a.tipo === "desborde" || b.tipo === "desborde" ? "desborde" : "bloque"})`);
        m.get(b.cat).add(`${a.cat} (${a.tipo === "desborde" || b.tipo === "desborde" ? "desborde" : "bloque"})`);
      }
    }));
    return m;
  }, [bloques]);

  function guardarBloques(lista) { onUpdateConfig({ bloquesCategoria: lista }); }
  function cambiarBloque(id, cambios) { guardarBloques(bloques.map((b) => (b.id === id ? { ...b, ...cambios } : b))); }
  function agregarBloque() {
    const ini = Number(nuevoBloque.inicio);
    const fin = Number(nuevoBloque.fin);
    if (!nuevoBloque.categoria || !(ini >= 0) || nuevoBloque.inicio === "" || !(fin >= ini)) { setMsg("Elige la categoría y escribe el inicio y el fin del bloque."); return; }
    guardarBloques([...bloques, { id: uidLocal(), categoria: nuevoBloque.categoria, inicio: ini, fin, desbordeModo: desbordeAuto(ini, fin) ? "auto" : "ninguno" }]);
    setNuevoBloque({ categoria: "", inicio: "", fin: "" });
    setMsg("");
  }
  function cambiarMarca(id, grupo, valor) {
    onUpdateConfig({ marcasPrefijos: marcas.map((m) => (m.id === id ? { ...m, prefijos: { ...(m.prefijos || {}), [grupo]: listaPrefijos(valor).join(", ") } } : m)) });
  }
  function agregarMarca() {
    if (!nuevaMarca.cliente) { setMsg("Elige la marca (cliente) que quieres agregar."); return; }
    const origen = marcas.find((m) => m.cliente === nuevaMarca.copiarDe);
    onUpdateConfig({ marcasPrefijos: [...marcas, { id: uidLocal(), cliente: nuevaMarca.cliente, prefijos: origen ? { ...(origen.prefijos || {}) } : {} }] });
    setNuevaMarca({ cliente: "", copiarDe: "" });
    setMsg("");
  }
  function importar() {
    if (!modeloSel) { setMsg("Primero elige de cuál marca y prefijo quieres tomar el patrón."); return; }
    const { bloquesNuevos, marcasNuevas } = importarDesdeReglas(config, modeloSel);
    if (!bloquesNuevos.length && !marcasNuevas.length) { setMsg("No encontré nada nuevo para tomar con ese modelo."); return; }
    onUpdateConfig({ bloquesCategoria: [...bloques, ...bloquesNuevos], marcasPrefijos: [...marcas, ...marcasNuevas] });
    setMsg(`✅ Tomé ${bloquesNuevos.length} bloque(s) de categoría y ${marcasNuevas.length} marca(s). Revísalos y corrige lo que haga falta.`);
  }
  function vaciar() {
    if (!bloques.length && !marcas.length) return;
    if (!window.confirm(`¿Vaciar las dos tablas del patrón (${bloques.length} bloques y ${marcas.length} marcas)? Tus reglas sueltas no se tocan.`)) return;
    onUpdateConfig({ bloquesCategoria: [], marcasPrefijos: [] });
    setMsg("Listo: las tablas del patrón quedaron vacías. Tus reglas sueltas siguen igual.");
  }
  const categoriasLibres = (config.categorias || []).filter((c) => !bloques.some((b) => b.categoria === c));
  const clientesLibres = clientes.filter((c) => !marcas.some((m) => m.cliente === c));

  // Prueba: usa un "linea" ficticia mapeada al grupo elegido
  const sugerencia = useMemo(() => {
    if (!prueba.cliente || !prueba.categoria || !prueba.grupo || !sugerir) return null;
    const cfgPrueba = { ...config, lineaGrupoMap: { ...(config.lineaGrupoMap || {}), __prueba__: prueba.grupo } };
    try { return sugerir(prueba.categoria, "__prueba__", prueba.cliente, cfgPrueba, prueba.prefijo); } catch (e) { return null; }
    // eslint-disable-next-line
  }, [prueba, config, sugerir]);

  const prefijosPrueba = listaPrefijos(((marcas.find((m) => m.cliente === prueba.cliente) || {}).prefijos || {})[prueba.grupo]);

  const th = (t, al) => <th style={{ background: T.ink, color: T.seam, textAlign: al || "left", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{t}</th>;
  const td = { padding: "6px 10px", borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
  const sel = { padding: "7px 8px", border: "1.5px solid #E8E2DB", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff" };

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: T.ink }}>Patrón de códigos</div>
          <div style={{ fontSize: 12.5, color: T.slate, marginTop: 3, maxWidth: 640, lineHeight: 1.5 }}>
            Escribe el patrón UNA vez. El código sale así: <b>prefijo de la marca y grupo</b> + <b>bloque de la categoría</b> + consecutivo. Una marca nueva es una sola fila en la segunda tabla.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>📥 Tomar el patrón de:</span>
        <select value={modeloSel} onChange={(e) => setModeloSel(e.target.value)} style={{ padding: "7px 8px", border: "1.5px solid #E8E2DB", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff", maxWidth: 440 }}>
          <option value="">— Elige una marca y prefijo —</option>
          {modelos.map((m) => <option key={m.clave} value={m.clave}>{m.etiqueta}</option>)}
        </select>
        <button onClick={importar} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: T.ink, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Importar</button>
        <span style={{ flex: 1 }} />
        <button onClick={vaciar} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${T.coral}55`, background: T.coralBg, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🗑 Vaciar tablas</button>
      </div>
      <div style={{ fontSize: 11, color: T.slate, margin: "-4px 0 10px", fontStyle: "italic" }}>Elige UN modelo limpio (por ejemplo Kamila · Dama · prefijo 98): de ahí salen los bloques. Cada prefijo puede tener rangos propios, así que no se mezclan todos.</div>
      {parecidas.length > 0 && (
        <div style={{ padding: "8px 12px", background: T.amberBg, color: T.amber, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
          <b>⚠ Categorías con nombres parecidos:</b> {parecidas.map(([a, b]) => `${a} ≈ ${b}`).join("  |  ")}. Si son la misma, deja una sola en Administración → Categorías para que el patrón no quede repartido.
        </div>
      )}
      {msg && <div style={{ padding: "8px 12px", background: msg.startsWith("✅") ? T.jadeBg : T.amberBg, color: msg.startsWith("✅") ? T.jade : T.amber, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{msg}</div>}

      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, margin: "14px 0 6px" }}>1) Bloques por categoría</div>
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead><tr>{th("Categoría")}{th("Inicio")}{th("Fin")}{th("Cuando se llena sigue en")}{th("")}</tr></thead>
          <tbody>
            {bloquesOrdenados.map((b) => {
              const d = desbordeDeBloque(b);
              const chocaCon = choques.get(b.categoria);
              return (
                <tr key={b.id}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {b.categoria}
                    {chocaCon && <div style={{ fontSize: 11, color: T.coral, fontWeight: 700 }}>⚠ choca con: {[...chocaCon].join(", ")}</div>}
                  </td>
                  <td style={{ ...td, width: 110 }}><Celda type="number" value={b.inicio} onCommit={(v) => cambiarBloque(b.id, { inicio: Number(v) || 0 })} /></td>
                  <td style={{ ...td, width: 110 }}><Celda type="number" value={b.fin} onCommit={(v) => cambiarBloque(b.id, { fin: Number(v) || 0 })} /></td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <select value={b.desbordeModo || "auto"} onChange={(e) => cambiarBloque(b.id, { desbordeModo: e.target.value })} style={sel}>
                        <option value="auto">Automático (×10)</option>
                        <option value="manual">Manual</option>
                        <option value="ninguno">Sin desborde</option>
                      </select>
                      {(b.desbordeModo || "auto") === "manual" ? (
                        <>
                          <Celda type="number" ancho={90} value={b.desbordeInicio ?? ""} onCommit={(v) => cambiarBloque(b.id, { desbordeInicio: Number(v) || 0 })} />
                          <span>–</span>
                          <Celda type="number" ancho={90} value={b.desbordeFin ?? ""} onCommit={(v) => cambiarBloque(b.id, { desbordeFin: Number(v) || 0 })} />
                        </>
                      ) : (
                        <span style={{ color: T.amber, fontWeight: 700, fontSize: 12 }}>{d ? `${d.inicio} – ${d.fin}` : "—"}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...td, width: 90, textAlign: "right" }}>
                    <button onClick={() => guardarBloques(bloques.filter((x) => x.id !== b.id))} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
            {!bloquesOrdenados.length && <tr><td colSpan={5} style={{ ...td, color: T.slate, fontStyle: "italic" }}>Todavía no hay bloques. Usa "Tomar el patrón de mis reglas actuales" o agrega el primero abajo.</td></tr>}
            <tr style={{ background: T.canvas }}>
              <td style={td}>
                <select value={nuevoBloque.categoria} onChange={(e) => setNuevoBloque((f) => ({ ...f, categoria: e.target.value }))} style={{ ...sel, width: "100%" }}>
                  <option value="">— Categoría —</option>
                  {categoriasLibres.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td style={td}><input type="number" placeholder="Ej: 200" value={nuevoBloque.inicio} onChange={(e) => setNuevoBloque((f) => ({ ...f, inicio: e.target.value }))} style={{ ...sel, width: "100%" }} /></td>
              <td style={td}><input type="number" placeholder="Ej: 299" value={nuevoBloque.fin} onChange={(e) => setNuevoBloque((f) => ({ ...f, fin: e.target.value }))} style={{ ...sel, width: "100%" }} /></td>
              <td style={{ ...td, color: T.slate, fontSize: 12 }}>{desbordeAuto(nuevoBloque.inicio, nuevoBloque.fin) ? `Automático: ${desbordeAuto(nuevoBloque.inicio, nuevoBloque.fin).inicio} – ${desbordeAuto(nuevoBloque.inicio, nuevoBloque.fin).fin}` : ""}</td>
              <td style={{ ...td, textAlign: "right" }}><button onClick={agregarBloque} style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Agregar</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, margin: "20px 0 6px" }}>2) Prefijos por marca</div>
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead><tr>{th("Marca / Cliente")}{grupos.map((g) => <React.Fragment key={g}>{th(g, "center")}</React.Fragment>)}{th("")}</tr></thead>
          <tbody>
            {marcas.map((m) => (
              <tr key={m.id}>
                <td style={{ ...td, fontWeight: 700 }}>{m.cliente}</td>
                {grupos.map((g) => (
                  <td key={g} style={{ ...td, width: 130 }}><Celda value={(m.prefijos || {})[g] || ""} placeholder="—" style={{ textAlign: "center", fontWeight: 800, color: T.denim }} onCommit={(v) => cambiarMarca(m.id, g, v)} /></td>
                ))}
                <td style={{ ...td, width: 90, textAlign: "right" }}>
                  <button onClick={() => onUpdateConfig({ marcasPrefijos: marcas.filter((x) => x.id !== m.id) })} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                </td>
              </tr>
            ))}
            {!marcas.length && <tr><td colSpan={grupos.length + 2} style={{ ...td, color: T.slate, fontStyle: "italic" }}>Todavía no hay marcas en el patrón.</td></tr>}
            <tr style={{ background: T.canvas }}>
              <td style={td}>
                <select value={nuevaMarca.cliente} onChange={(e) => setNuevaMarca((f) => ({ ...f, cliente: e.target.value }))} style={{ ...sel, width: "100%" }}>
                  <option value="">— Marca nueva —</option>
                  {clientesLibres.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td colSpan={grupos.length} style={td}>
                <select value={nuevaMarca.copiarDe} onChange={(e) => setNuevaMarca((f) => ({ ...f, copiarDe: e.target.value }))} style={sel}>
                  <option value="">Empezar vacía</option>
                  {marcas.map((m) => <option key={m.id} value={m.cliente}>Copiar prefijos de {m.cliente}</option>)}
                </select>
              </td>
              <td style={{ ...td, textAlign: "right" }}><button onClick={agregarMarca} style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Agregar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: T.slate, marginTop: 6, fontStyle: "italic" }}>
        Si una marca tiene varios prefijos en un grupo, escríbelos separados por coma (ej. 98, 82): el primero es el predeterminado y al crear el código eliges cuál usar. Las marcas salen de la lista de Clientes. Si un cliente no aparece, créalo primero en Administración → Clientes. Las reglas puntuales de la lista de abajo (por línea, grupo o cliente) siguen funcionando como excepciones y le ganan al patrón.
      </div>

      <div style={{ marginTop: 14, padding: "12px 14px", background: T.jadeBg, borderRadius: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <b>🧪 Probar:</b>
        <select value={prueba.cliente} onChange={(e) => setPrueba((p) => ({ ...p, cliente: e.target.value }))} style={sel}>
          <option value="">Marca</option>{marcas.map((m) => <option key={m.id} value={m.cliente}>{m.cliente}</option>)}
        </select>
        <select value={prueba.grupo} onChange={(e) => setPrueba((p) => ({ ...p, grupo: e.target.value }))} style={sel}>
          <option value="">Grupo</option>{grupos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={prueba.categoria} onChange={(e) => setPrueba((p) => ({ ...p, categoria: e.target.value }))} style={sel}>
          <option value="">Categoría</option>{(config.categorias || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {prefijosPrueba.length > 1 && (
          <select value={prefijosPrueba.includes(prueba.prefijo) ? prueba.prefijo : prefijosPrueba[0]} onChange={(e) => setPrueba((p) => ({ ...p, prefijo: e.target.value }))} style={sel}>
            {prefijosPrueba.map((x) => <option key={x} value={x}>Prefijo {x}</option>)}
          </select>
        )}
        {prueba.cliente && prueba.grupo && prueba.categoria && (
          sugerencia
            ? <span>→ el siguiente código sería <b style={{ fontSize: 18, color: T.jade }}>{sugerencia.codigo}</b> <span style={{ color: T.slate, fontSize: 12 }}>(rango {sugerencia.prefijo}-{pad3(sugerencia.rangoInicio)} a {sugerencia.prefijo}-{pad3(sugerencia.rangoFin)})</span></span>
            : <span style={{ color: T.coral, fontWeight: 700 }}>→ el patrón no alcanza: falta el bloque de esa categoría o el prefijo de esa marca y grupo.</span>
        )}
      </div>
    </div>
  );
}
