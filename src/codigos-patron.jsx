// ─── CÓDIGOS DE REFERENCIA POR PATRÓN ─────────────────────────────────────────
// (2026-10-12, a pedido de Fredy) Antes, cada regla amarraba Categoría + Línea
// + Grupo + Cliente a un prefijo y un rango, así que cada marca nueva obligaba
// a escribir decenas de reglas. Ahora el patrón se separa en dos tablas:
//   1) config.bloquesCategoria: UN bloque por categoría (Cachetero 1-99,
//      Byker 100-199, Falda 200-299...), igual para todos los prefijos salvo
//      que el bloque traiga "prefijos" (excepción de un prefijo). El
//      desborde sigue el patrón ×10 (200-299 → 2000-2999) o se deja manual.
//   2) config.marcasPrefijos: UNA entrada por marca/cliente con su lista de
//      prefijos matriculados (cada uno con su grupo y las categorías donde se
//      usa; se edita desde Administración → Clientes con PrefijosDeCliente).
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
// Prefijos MATRICULADOS de una empresa: lista de { id, prefijo, grupo, nota }.
// Las marcas guardadas antes de existir la lista (solo con "prefijos" por
// grupo) se convierten al vuelo, sin perder nada.
export function listaMatriculados(marca) {
  if (Array.isArray(marca?.lista)) return marca.lista;
  const out = [];
  Object.entries(marca?.prefijos || {}).forEach(([grupo, v]) => {
    listaPrefijos(v).forEach((pref) => out.push({ id: `${marca.id}-${grupo}-${pref}`, prefijo: pref, grupo, nota: "" }));
  });
  return out;
}
// Prefijos de una empresa para un grupo (Dama, Caballero...), en el orden matriculado
export function prefijosDeGrupo(marca, grupo) {
  const vistos = new Set();
  return listaMatriculados(marca)
    .filter((x) => x.grupo === grupo)
    .map((x) => String(x.prefijo || "").trim())
    .filter((x) => x && !vistos.has(x) && vistos.add(x));
}

// Prefijos que una empresa tiene asignados para un grupo y una categoría. Una
// fila matriculada sin categorías vale para todas.
export function prefijosParaCategoria(marca, grupo, categoria) {
  const vistos = new Set();
  return listaMatriculados(marca)
    .filter((x) => x.grupo === grupo && (!(x.categorias || []).length || x.categorias.includes(categoria)))
    .map((x) => String(x.prefijo || "").trim())
    .filter((x) => x && !vistos.has(x) && vistos.add(x));
}

// Rango de una categoría: es el mismo para todas las marcas y prefijos.
export function bloqueDeCategoria(bloques, categoria) {
  const delCat = (bloques || []).filter((b) => b.categoria === categoria);
  return delCat.find((b) => !listaPrefijos(b.prefijos).length) || delCat[0] || null;
}

export function buscarPorPatron(categoria, linea, cliente, config, prefijoElegido) {
  if (!categoria || !cliente) return null;
  const bloque = bloqueDeCategoria(config?.bloquesCategoria, categoria);
  if (!bloque) return null;
  const marca = (config?.marcasPrefijos || []).find((m) => m.cliente === cliente);
  if (!marca) return null;
  const grupo = (config?.lineaGrupoMap || {})[linea] || "";
  const lista = prefijosParaCategoria(marca, grupo, categoria);
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

const limpiarPrefijo = (v) => String(v || "").trim().replace(/[\s,;]+/g, "");
function derivarPrefijos(lista) {
  const o = {};
  lista.forEach((x) => { if (x.prefijo && x.grupo) o[x.grupo] = o[x.grupo] ? `${o[x.grupo]}, ${x.prefijo}` : x.prefijo; });
  return o;
}

// Categorías de un prefijo: etiquetas con × y un campo con búsqueda para
// agregar otra. Sin ninguna significa "todas las categorías".
function SelectorCategorias({ opciones, valor, onChange, T, idLista }) {
  const marcadas = Array.isArray(valor) ? valor : [];
  const [txt, setTxt] = useState("");
  const buscar = (x) => opciones.find((o) => o.toLowerCase() === String(x || "").trim().toLowerCase());
  const agregar = (x) => {
    const real = buscar(x);
    if (!real) return;
    if (!marcadas.includes(real)) onChange([...marcadas, real]);
    setTxt("");
  };
  const quitar = (x) => onChange(marcadas.filter((y) => y !== x));
  const noExiste = txt.trim() !== "" && !buscar(txt);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      <datalist id={idLista}>{opciones.filter((o) => !marcadas.includes(o)).map((o) => <option key={o} value={o} />)}</datalist>
      {marcadas.map((x) => {
        const huerfana = !opciones.includes(x);
        return (
          <span key={x} title={huerfana ? "Esta categoría ya no existe" : ""} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 10px", borderRadius: 999, border: `1.5px solid ${huerfana ? T.coral : T.denim}`, background: huerfana ? T.coralBg : T.denim, color: huerfana ? T.coral : "#fff", fontWeight: 700, fontSize: 12 }}>
            {x}{huerfana ? " ⚠" : ""}
            <button type="button" onClick={() => quitar(x)} title="Quitar" style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 900, fontSize: 13, padding: "0 4px", lineHeight: 1 }}>×</button>
          </span>
        );
      })}
      {!marcadas.length && <span style={{ padding: "2px 10px", borderRadius: 999, background: T.jadeBg, color: T.jade, fontWeight: 700, fontSize: 12 }}>Todas las categorías</span>}
      <input
        list={idLista}
        value={txt}
        placeholder="+ categoría"
        title={noExiste ? "Esa categoría no existe" : "Escribe o elige una categoría"}
        onChange={(e) => {
          const t = e.nativeEvent && e.nativeEvent.inputType;
          setTxt(e.target.value);
          if ((t === undefined || t === "insertReplacementText") && buscar(e.target.value)) agregar(e.target.value);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") agregar(txt); }}
        style={{ width: 118, padding: "3px 10px", border: `1.5px solid ${noExiste ? T.coral : T.border}`, borderRadius: 999, fontSize: 12, fontFamily: "inherit" }}
      />
    </div>
  );
}

// Matrícula de prefijos de UN cliente (se muestra dentro de Administración →
// Clientes). Cada prefijo lleva el grupo (para quién) y las categorías donde
// se usa. Se guarda en config.marcasPrefijos (una entrada por cliente).
export function PrefijosDeCliente({ cliente, config, onUpdateConfig, T }) {
  const marcas = config.marcasPrefijos || [];
  const marca = marcas.find((m) => m.cliente === cliente);
  const lista = marca ? listaMatriculados(marca) : [];
  const grupos = config.gruposLinea || ["Dama", "Caballero", "Niña", "Niño"];
  const categorias = config.categorias || [];
  const [msg, setMsg] = useState("");
  const [nuevo, setNuevo] = useState({ prefijo: "", grupo: "", categorias: [] });
  const th = (t) => <th style={{ background: T.ink, color: T.seam, textAlign: "left", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{t}</th>;
  const td = { padding: "8px 10px", borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
  const sel = { padding: "7px 8px", border: "1.5px solid #E8E2DB", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff" };

  function guardar(nuevaLista) {
    const datos = { lista: nuevaLista, prefijos: derivarPrefijos(nuevaLista) };
    if (marca) onUpdateConfig({ marcasPrefijos: marcas.map((m) => (m.id === marca.id ? { ...m, ...datos } : m)) });
    else onUpdateConfig({ marcasPrefijos: [...marcas, { id: uidLocal(), cliente, ...datos }] });
  }
  function cambiarFila(id, cambios) {
    const actual = lista.find((x) => x.id === id);
    if (!actual) return;
    const fila = { ...actual, ...cambios };
    if (!fila.prefijo) { setMsg("El prefijo no puede quedar vacío. Para quitarlo usa Eliminar."); return; }
    if (lista.some((x) => x.id !== id && x.prefijo === fila.prefijo && x.grupo === fila.grupo)) { setMsg(`Ya tiene el prefijo ${fila.prefijo} para ${fila.grupo}. Agrega las categorías en esa misma fila.`); return; }
    setMsg("");
    guardar(lista.map((x) => (x.id === id ? fila : x)));
  }
  function matricular() {
    const prefijo = limpiarPrefijo(nuevo.prefijo);
    if (!prefijo || !nuevo.grupo) { setMsg("Escribe el prefijo y elige para quién es (el grupo)."); return; }
    if (lista.some((x) => x.prefijo === prefijo && x.grupo === nuevo.grupo)) { setMsg(`Ya tiene el prefijo ${prefijo} para ${nuevo.grupo}. Agrega las categorías en esa misma fila.`); return; }
    guardar([...lista, { id: uidLocal(), prefijo, grupo: nuevo.grupo, categorias: nuevo.categorias }]);
    setNuevo({ prefijo: "", grupo: nuevo.grupo, categorias: [] });
    setMsg("");
  }

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
      <div style={{ padding: "10px 14px", background: T.canvas, borderBottom: `1px solid ${T.border}`, fontSize: 12, color: T.slate }}>
        <b style={{ color: T.ink }}>Prefijos de {cliente}</b> — matricula cada prefijo con <b>para quién</b> es y <b>en qué categorías</b> se usa. Sin categorías significa todas. Los rangos por categoría se definen en Códigos de Referencia y valen para todas las marcas.
      </div>
      {msg && <div style={{ padding: "8px 14px", background: T.amberBg, color: T.amber, fontSize: 12, fontWeight: 600 }}>{msg}</div>}
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
          <thead><tr>{th("Prefijo")}{th("Para quién")}{th("Categorías donde se usa")}{th("")}</tr></thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.id}>
                <td style={{ ...td, width: 110 }}><Celda value={x.prefijo} style={{ textAlign: "center", fontWeight: 800, color: T.denim }} onCommit={(v) => cambiarFila(x.id, { prefijo: limpiarPrefijo(v) })} /></td>
                <td style={{ ...td, width: 170 }}>
                  <select value={x.grupo} onChange={(e) => cambiarFila(x.id, { grupo: e.target.value })} style={{ ...sel, width: "100%" }}>
                    {[...new Set([...grupos, x.grupo])].map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>
                <td style={td}><SelectorCategorias T={T} idLista={`dl-cat-${x.id}`} opciones={categorias} valor={x.categorias || []} onChange={(v) => cambiarFila(x.id, { categorias: v })} /></td>
                <td style={{ ...td, width: 90, textAlign: "right" }}>
                  <button onClick={() => guardar(lista.filter((y) => y.id !== x.id))} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={4} style={{ ...td, color: T.slate, fontStyle: "italic" }}>Este cliente todavía no tiene prefijos matriculados.</td></tr>}
            <tr style={{ background: T.canvas }}>
              <td style={td}><input type="text" placeholder="Ej: 98" value={nuevo.prefijo} onChange={(e) => setNuevo((f) => ({ ...f, prefijo: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") matricular(); }} style={{ ...sel, width: "100%", textAlign: "center", fontWeight: 800 }} /></td>
              <td style={td}>
                <select value={nuevo.grupo} onChange={(e) => setNuevo((f) => ({ ...f, grupo: e.target.value }))} style={{ ...sel, width: "100%" }}>
                  <option value="">— Para quién —</option>
                  {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </td>
              <td style={td}><SelectorCategorias T={T} idLista="dl-cat-nuevo" opciones={categorias} valor={nuevo.categorias} onChange={(v) => setNuevo((f) => ({ ...f, categorias: v }))} /></td>
              <td style={{ ...td, textAlign: "right" }}><button onClick={matricular} style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Matricular</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PatronCodigosReferencia({ config, onUpdateConfig, T, sugerir }) {
  const bloques = config.bloquesCategoria || [];
  const marcas = config.marcasPrefijos || [];
  const grupos = config.gruposLinea || ["Dama", "Caballero", "Niña", "Niño"];
  const [nuevoBloque, setNuevoBloque] = useState({ categoria: "", inicio: "", fin: "" });
  const [busquedaPref, setBusquedaPref] = useState("");
  const [msg, setMsg] = useState("");
  const [prueba, setPrueba] = useState({ cliente: "", grupo: "", categoria: "", prefijo: "" });
  const modelos = useMemo(() => modelosDeReglas(config), [config]);
  const [modeloSel, setModeloSel] = useState("");
  const parecidas = useMemo(() => categoriasParecidas([...(config.categorias || []), ...bloques.map((b) => b.categoria)]), [config.categorias, bloques]);

  const bloquesOrdenados = useMemo(() => [...bloques].sort((a, b) => Number(a.inicio) - Number(b.inicio) || a.categoria.localeCompare(b.categoria)), [bloques]);

  // Choques: dos rangos de categorías distintas que se pisan, pero SOLO si
  // alguna empresa asignó esas dos categorías al MISMO prefijo (un prefijo sin
  // categorías vale para todas). Así el 98 con Byker y el 96 con Vestido no
  // chocan aunque los números se crucen.
  const choques = useMemo(() => {
    const m = new Map(); // id de bloque -> Set de textos
    const agregar = (id, txt) => { if (!m.has(id)) m.set(id, new Set()); m.get(id).add(txt); };
    const todasCats = [...new Set(bloques.map((b) => b.categoria))];
    const porPref = new Map(); // prefijo -> Set de categorías
    marcas.forEach((mm) => listaMatriculados(mm).forEach((x) => {
      if (!x.prefijo) return;
      const k = String(x.prefijo);
      const cats = (x.categorias || []).length ? x.categorias : todasCats;
      if (!porPref.has(k)) porPref.set(k, new Set());
      cats.forEach((c) => porPref.get(k).add(c));
    }));
    const conjuntos = new Map(); // mismas categorías -> prefijos que las comparten
    porPref.forEach((set, pref) => {
      const cats = [...set].filter((c) => todasCats.includes(c)).sort();
      if (cats.length < 2) return;
      const k = cats.join("|");
      if (!conjuntos.has(k)) conjuntos.set(k, { cats, prefijos: [] });
      conjuntos.get(k).prefijos.push(pref);
    });
    conjuntos.forEach(({ cats, prefijos }) => {
      const rangos = [];
      cats.map((c) => bloqueDeCategoria(bloques, c)).filter(Boolean).forEach((b) => {
        rangos.push({ b, ini: Number(b.inicio), fin: Number(b.fin), tipo: "principal" });
        const d = desbordeDeBloque(b);
        if (d) rangos.push({ b, ini: d.inicio, fin: d.fin, tipo: "desborde" });
      });
      const tag = ` · mismo prefijo: ${prefijos.slice(0, 3).join(", ")}${prefijos.length > 3 ? "…" : ""}`;
      rangos.forEach((x, i) => rangos.slice(i + 1).forEach((y) => {
        if (x.b.categoria === y.b.categoria) return;
        if (x.ini <= y.fin && y.ini <= x.fin) {
          const tipo = x.tipo === "desborde" || y.tipo === "desborde" ? "desborde" : "bloque";
          agregar(x.b.id, `${y.b.categoria} (${tipo})${tag}`);
          agregar(y.b.id, `${x.b.categoria} (${tipo})${tag}`);
        }
      }));
    });
    return m;
  }, [bloques, marcas]);

  // Dos filas de la MISMA categoría
  const duplicados = useMemo(() => {
    const m = new Map();
    bloques.forEach((x, i) => bloques.slice(i + 1).forEach((y) => {
      if (x.categoria === y.categoria) { m.set(x.id, true); m.set(y.id, true); }
    }));
    return m;
  }, [bloques]);

  function guardarBloques(lista) { onUpdateConfig({ bloquesCategoria: lista }); }
  function cambiarBloque(id, cambios) { guardarBloques(bloques.map((b) => (b.id === id ? { ...b, ...cambios } : b))); }
  function agregarBloque() {
    const ini = Number(nuevoBloque.inicio);
    const fin = Number(nuevoBloque.fin);
    if (!nuevoBloque.categoria || !(ini >= 0) || nuevoBloque.inicio === "" || !(fin >= ini)) { setMsg("Elige la categoría y escribe el inicio y el fin del rango."); return; }
    if (bloques.some((b) => b.categoria === nuevoBloque.categoria)) { setMsg("Esa categoría ya tiene su rango. Edítalo en la tabla."); return; }
    guardarBloques([...bloques, { id: uidLocal(), categoria: nuevoBloque.categoria, inicio: ini, fin, desbordeModo: desbordeAuto(ini, fin) ? "auto" : "ninguno" }]);
    setNuevoBloque({ categoria: "", inicio: "", fin: "" });
    setMsg("");
  }
  function importar() {
    if (!modeloSel) { setMsg("Primero elige de cuál marca y prefijo quieres tomar el patrón."); return; }
    const { bloquesNuevos, marcasNuevas } = importarDesdeReglas(config, modeloSel);
    if (!bloquesNuevos.length && !marcasNuevas.length) { setMsg("No encontré nada nuevo para tomar con ese modelo."); return; }
    onUpdateConfig({ bloquesCategoria: [...bloques, ...bloquesNuevos], marcasPrefijos: [...marcas, ...marcasNuevas] });
    setMsg(`✅ Tomé ${bloquesNuevos.length} rango(s) de categoría y ${marcasNuevas.length} empresa(s) con sus prefijos. Revísalos y corrige lo que haga falta.`);
  }
  function vaciar() {
    if (!bloques.length) return;
    if (!window.confirm(`¿Vaciar los ${bloques.length} rangos por categoría? Los prefijos de cada cliente y tus reglas sueltas no se tocan.`)) return;
    onUpdateConfig({ bloquesCategoria: [] });
    setMsg("Listo: los rangos quedaron vacíos. Los prefijos de los clientes y tus reglas sueltas siguen igual.");
  }
  const categoriasLibres = config.categorias || [];

  // Quién usa un prefijo
  const usuariosPrefijo = useMemo(() => {
    const q = String(busquedaPref || "").trim().toLowerCase();
    if (!q) return [];
    const out = [];
    marcas.forEach((m) => listaMatriculados(m).forEach((x) => {
      if (String(x.prefijo).toLowerCase() === q) out.push({ cliente: m.cliente, grupo: x.grupo, categorias: x.categorias || [] });
    }));
    return out.sort((a, b) => String(a.cliente).localeCompare(String(b.cliente), "es"));
  }, [marcas, busquedaPref]);
  const totalPrefijos = useMemo(() => marcas.reduce((n, m) => n + listaMatriculados(m).length, 0), [marcas]);

  // Prueba: usa un "linea" ficticia mapeada al grupo elegido
  const sugerencia = useMemo(() => {
    if (!prueba.cliente || !prueba.categoria || !prueba.grupo || !sugerir) return null;
    const cfgPrueba = { ...config, lineaGrupoMap: { ...(config.lineaGrupoMap || {}), __prueba__: prueba.grupo } };
    try { return sugerir(prueba.categoria, "__prueba__", prueba.cliente, cfgPrueba, prueba.prefijo); } catch (e) { return null; }
    // eslint-disable-next-line
  }, [prueba, config, sugerir]);

  const th = (t, al) => <th style={{ background: T.ink, color: T.seam, textAlign: al || "left", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{t}</th>;
  const td = { padding: "6px 10px", borderBottom: `1px solid ${T.border}`, verticalAlign: "middle" };
  const sel = { padding: "7px 8px", border: "1.5px solid #E8E2DB", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff" };

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: T.ink }}>Patrón de códigos</div>
          <div style={{ fontSize: 12.5, color: T.slate, marginTop: 3, maxWidth: 640, lineHeight: 1.5 }}>
            Los rangos por categoría son iguales para todas las marcas. El prefijo de cada empresa se matricula en <b>Administración → Clientes</b> (botón 🔢 Prefijos). El código sale así: <b>prefijo</b> + <b>número del rango de la categoría</b> + consecutivo.
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
        <button onClick={vaciar} style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${T.coral}55`, background: T.coralBg, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🗑 Vaciar rangos</button>
      </div>
      <div style={{ fontSize: 11, color: T.slate, margin: "-4px 0 10px", fontStyle: "italic" }}>Elige UN modelo limpio (por ejemplo Kamila · Dama · prefijo 98): de ahí salen los rangos, y sus prefijos quedan matriculados en cada empresa.</div>
      {parecidas.length > 0 && (
        <div style={{ padding: "8px 12px", background: T.amberBg, color: T.amber, borderRadius: 8, fontSize: 12, marginBottom: 10 }}>
          <b>⚠ Categorías con nombres parecidos:</b> {parecidas.map(([a, b]) => `${a} ≈ ${b}`).join("  |  ")}. Si son la misma, deja una sola en Administración → Categorías para que el patrón no quede repartido.
        </div>
      )}
      {msg && <div style={{ padding: "8px 12px", background: msg.startsWith("✅") ? T.jadeBg : T.amberBg, color: msg.startsWith("✅") ? T.jade : T.amber, borderRadius: 8, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{msg}</div>}

      <datalist id="dl-marcas">{marcas.map((m) => <option key={m.id} value={m.cliente} />)}</datalist>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, margin: "14px 0 6px" }}>1) Rangos por categoría</div>
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead><tr>{th("Categoría")}{th("Inicio")}{th("Fin")}{th("Cuando se llena sigue en")}{th("")}</tr></thead>
          <tbody>
            {bloquesOrdenados.map((b) => {
              const d = desbordeDeBloque(b);
              const chocaCon = choques.get(b.id);
              return (
                <tr key={b.id}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {b.categoria}
                    {chocaCon && <div style={{ fontSize: 11, color: T.coral, fontWeight: 700 }}>⚠ choca con: {[...chocaCon].join(", ")}</div>}
                    {duplicados.get(b.id) && <div style={{ fontSize: 11, color: T.coral, fontWeight: 700 }}>⚠ esta categoría tiene dos filas de rango</div>}
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
            {!bloquesOrdenados.length && <tr><td colSpan={5} style={{ ...td, color: T.slate, fontStyle: "italic" }}>Todavía no hay rangos. Usa "Tomar el patrón de mis reglas actuales" o agrega el primero abajo.</td></tr>}
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

      <div style={{ fontSize: 11, color: T.slate, marginTop: 6, fontStyle: "italic" }}>
        Estos rangos valen para todas las marcas. Lo que cambia por empresa es el prefijo y en qué categorías lo usa (se matricula en Administración → Clientes). Un aviso de choque solo aparece cuando dos categorías con números que se cruzan están asignadas al mismo prefijo.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "20px 0 6px" }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>2) ¿Quién usa un prefijo?</span>
        <span style={{ fontSize: 12, color: T.slate }}>{totalPrefijos} prefijo{totalPrefijos === 1 ? "" : "s"} matriculado{totalPrefijos === 1 ? "" : "s"} en {marcas.length} empresa{marcas.length === 1 ? "" : "s"}</span>
      </div>
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px" }}>
        <input type="text" value={busquedaPref} onChange={(e) => setBusquedaPref(e.target.value)} placeholder="Escribe un prefijo, por ejemplo DG" style={{ ...sel, width: 260 }} />
        {busquedaPref.trim() ? (
          usuariosPrefijo.length ? (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              {usuariosPrefijo.map((u, i) => (
                <div key={i}><b>{u.cliente}</b> · {u.grupo} · <span style={{ color: T.slate }}>{u.categorias.length ? u.categorias.join(", ") : "todas las categorías"}</span></div>
              ))}
            </div>
          ) : <div style={{ marginTop: 10, fontSize: 12.5, color: T.slate, fontStyle: "italic" }}>Ninguna empresa tiene matriculado ese prefijo.</div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 12, color: T.slate, fontStyle: "italic" }}>Los prefijos se matriculan por empresa en Administración → Clientes → 🔢 Prefijos. Aquí solo los consultas.</div>
        )}
      </div>

      <div style={{ marginTop: 14, padding: "12px 14px", background: T.jadeBg, borderRadius: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <b>🧪 Probar:</b>
        <input list="dl-marcas" value={prueba.cliente} onChange={(e) => setPrueba((p) => ({ ...p, cliente: e.target.value }))} placeholder="Marca (escribe para buscar)" style={{ ...sel, minWidth: 220 }} />
        <select value={prueba.grupo} onChange={(e) => setPrueba((p) => ({ ...p, grupo: e.target.value }))} style={sel}>
          <option value="">Grupo</option>{grupos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={prueba.categoria} onChange={(e) => setPrueba((p) => ({ ...p, categoria: e.target.value }))} style={sel}>
          <option value="">Categoría</option>{(config.categorias || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {sugerencia?.prefijosDisponibles?.length > 1 && (
          <select value={sugerencia.prefijo} onChange={(e) => setPrueba((p) => ({ ...p, prefijo: e.target.value }))} style={sel}>
            {sugerencia.prefijosDisponibles.map((x) => <option key={x} value={x}>Prefijo {x}</option>)}
          </select>
        )}
        {prueba.cliente && prueba.grupo && prueba.categoria && (
          sugerencia
            ? <span>→ el siguiente código sería <b style={{ fontSize: 18, color: T.jade }}>{sugerencia.codigo}</b> <span style={{ color: T.slate, fontSize: 12 }}>(rango {sugerencia.prefijo}-{pad3(sugerencia.rangoInicio)} a {sugerencia.prefijo}-{pad3(sugerencia.rangoFin)})</span></span>
            : <span style={{ color: T.coral, fontWeight: 700 }}>→ el patrón no alcanza: falta el rango de esa categoría o un prefijo de esa marca para ese grupo y categoría.</span>
        )}
      </div>
    </div>
  );
}
