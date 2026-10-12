// ─── CÓDIGOS DE REFERENCIA POR PATRÓN ─────────────────────────────────────────
// (2026-10-12, a pedido de Fredy) Antes, cada regla amarraba Categoría + Línea
// + Grupo + Cliente a un prefijo y un rango, así que cada marca nueva obligaba
// a escribir decenas de reglas. Ahora el patrón se separa en dos tablas:
//   1) config.bloquesCategoria: UN bloque por categoría (Cachetero 1-99,
//      Byker 100-199, Falda 200-299...), igual para todos los prefijos salvo
//      que el bloque traiga "prefijos" (excepción de un prefijo). El
//      desborde sigue el patrón ×10 (200-299 → 2000-2999) o se deja manual.
//   2) config.marcasPrefijos: UNA entrada por marca/cliente con su lista de
//      prefijos matriculados (cada uno con su grupo: Dama, Caballero...).
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

// Bloque de una categoría para un prefijo: el bloque propio de ese prefijo
// (columna "Prefijos" de la tabla) gana; si no hay, vale el bloque general
// (el que tiene la columna "Prefijos" vacía).
export function bloqueParaPrefijo(bloques, categoria, prefijo) {
  const delCat = (bloques || []).filter((b) => b.categoria === categoria);
  return (
    delCat.find((b) => listaPrefijos(b.prefijos).includes(prefijo)) ||
    delCat.find((b) => !listaPrefijos(b.prefijos).length) ||
    null
  );
}

export function buscarPorPatron(categoria, linea, cliente, config, prefijoElegido) {
  if (!categoria || !cliente) return null;
  const bloques = config?.bloquesCategoria || [];
  if (!bloques.some((b) => b.categoria === categoria)) return null;
  const marca = (config?.marcasPrefijos || []).find((m) => m.cliente === cliente);
  if (!marca) return null;
  const grupo = (config?.lineaGrupoMap || {})[linea] || "";
  const lista = prefijosDeGrupo(marca, grupo);
  // Solo los prefijos que tienen bloque para esta categoría
  const conBloque = lista.filter((x) => bloqueParaPrefijo(bloques, categoria, x));
  if (!conBloque.length) return null;
  const prefijo = conBloque.includes(prefijoElegido) ? prefijoElegido : conBloque[0];
  const bloque = bloqueParaPrefijo(bloques, categoria, prefijo);
  const d = desbordeDeBloque(bloque);
  return {
    id: `patron-${marca.id}-${bloque.id}-${prefijo}`,
    categoria,
    cliente,
    grupo,
    prefijo,
    prefijosDisponibles: conBloque,
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

// Prefijos de un bloque: solo se muestran los marcados (con x para quitarlos) y
// un campo con búsqueda para agregar otro entre los matriculados. Sin ninguno
// marcado el bloque vale para todos los prefijos. Usa el <datalist id="dl-prefijos">
// que dibuja la pantalla una sola vez.
function SelectorPrefijos({ opciones, valor, onChange, T }) {
  const marcados = listaPrefijos(valor);
  const [txt, setTxt] = useState("");
  const agregar = (x) => {
    const v = String(x || "").trim();
    if (!v || !opciones.includes(v)) return false;
    if (!marcados.includes(v)) onChange([...marcados, v].join(", "));
    setTxt("");
    return true;
  };
  const quitar = (x) => onChange(marcados.filter((y) => y !== x).join(", "));
  const noExiste = txt.trim() !== "" && !opciones.includes(txt.trim());
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {marcados.map((x) => {
        const huerfano = !opciones.includes(x);
        return (
          <span key={x} title={huerfano ? "Este prefijo ya no está matriculado" : ""} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 9px", borderRadius: 999, border: `1.5px solid ${huerfano ? T.coral : T.denim}`, background: huerfano ? T.coralBg : T.denim, color: huerfano ? T.coral : "#fff", fontWeight: 800, fontSize: 12 }}>
            {x}{huerfano ? " ⚠" : ""}
            <button type="button" onClick={() => quitar(x)} title="Quitar" style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 900, fontSize: 13, padding: "0 4px", lineHeight: 1 }}>×</button>
          </span>
        );
      })}
      {!marcados.length && <span style={{ fontSize: 11, color: T.slate, fontWeight: 700 }}>Todos</span>}
      <input
        list="dl-prefijos"
        value={txt}
        placeholder="+ prefijo"
        title={noExiste ? "Ese prefijo no está matriculado" : "Escribe o elige un prefijo matriculado"}
        onChange={(e) => {
          const t = e.nativeEvent && e.nativeEvent.inputType;
          setTxt(e.target.value);
          if ((t === undefined || t === "insertReplacementText") && opciones.includes(e.target.value.trim())) agregar(e.target.value);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") agregar(txt); }}
        style={{ width: 84, padding: "3px 8px", border: `1.5px solid ${noExiste ? T.coral : T.border}`, borderRadius: 999, fontSize: 12, fontFamily: "inherit" }}
      />
    </div>
  );
}

export default function PatronCodigosReferencia({ config, onUpdateConfig, T, sugerir }) {
  const bloques = config.bloquesCategoria || [];
  const marcas = config.marcasPrefijos || [];
  const grupos = config.gruposLinea || ["Dama", "Caballero", "Niña", "Niño"];
  const clientes = (config.clientes || []).map((c) => c.nombre).filter(Boolean);
  const [nuevoBloque, setNuevoBloque] = useState({ categoria: "", inicio: "", fin: "", prefijos: "" });
  const [nuevaMarca, setNuevaMarca] = useState({ cliente: "", copiarDe: "" });
  const [nuevosPref, setNuevosPref] = useState({});
  const [busquedaEmp, setBusquedaEmp] = useState("");
  const [abiertaId, setAbiertaId] = useState("");
  const [msg, setMsg] = useState("");
  const [prueba, setPrueba] = useState({ cliente: "", grupo: "", categoria: "", prefijo: "" });
  const modelos = useMemo(() => modelosDeReglas(config), [config]);
  const [modeloSel, setModeloSel] = useState("");
  const parecidas = useMemo(() => categoriasParecidas([...(config.categorias || []), ...bloques.map((b) => b.categoria)]), [config.categorias, bloques]);

  const bloquesOrdenados = useMemo(() => [...bloques].sort((a, b) => Number(a.inicio) - Number(b.inicio) || a.categoria.localeCompare(b.categoria)), [bloques]);

  // Choques POR PREFIJO: para cada prefijo se arma el bloque que le toca a cada
  // categoría (el propio del prefijo, o el general) y se comparan entre sí.
  // Así el 1000-1999 de Byker en el 98 no choca con el Vestido del 96.
  const choques = useMemo(() => {
    const m = new Map(); // id de bloque -> Set de textos
    const agregar = (id, txt) => { if (!m.has(id)) m.set(id, new Set()); m.get(id).add(txt); };
    const universo = new Set([""]);
    bloques.forEach((b) => listaPrefijos(b.prefijos).forEach((x) => universo.add(x)));
    const cats = [...new Set(bloques.map((b) => b.categoria))];
    universo.forEach((pref) => {
      const efectivos = cats
        .map((c) => (pref ? bloqueParaPrefijo(bloques, c, pref) : bloques.find((b) => b.categoria === c && !listaPrefijos(b.prefijos).length)))
        .filter(Boolean);
      const rangos = [];
      efectivos.forEach((b) => {
        const general = !listaPrefijos(b.prefijos).length;
        rangos.push({ b, general, ini: Number(b.inicio), fin: Number(b.fin), tipo: "principal" });
        const d = desbordeDeBloque(b);
        if (d) rangos.push({ b, general, ini: d.inicio, fin: d.fin, tipo: "desborde" });
      });
      rangos.forEach((x, i) => rangos.slice(i + 1).forEach((y) => {
        if (x.b.categoria === y.b.categoria) return;
        if (pref && x.general && y.general) return; // ya se revisó en el caso general
        if (x.ini <= y.fin && y.ini <= x.fin) {
          const tipo = x.tipo === "desborde" || y.tipo === "desborde" ? "desborde" : "bloque";
          const tag = pref ? ` en prefijo ${pref}` : "";
          agregar(x.b.id, `${y.b.categoria} (${tipo})${tag}`);
          agregar(y.b.id, `${x.b.categoria} (${tipo})${tag}`);
        }
      }));
    });
    return m;
  }, [bloques]);

  // Dos bloques de la MISMA categoría que valen para el mismo prefijo
  const duplicados = useMemo(() => {
    const m = new Map();
    bloques.forEach((x, i) => bloques.slice(i + 1).forEach((y) => {
      if (x.categoria !== y.categoria) return;
      const px = listaPrefijos(x.prefijos);
      const py = listaPrefijos(y.prefijos);
      if ((!px.length && !py.length) || px.some((v) => py.includes(v))) { m.set(x.id, true); m.set(y.id, true); }
    }));
    return m;
  }, [bloques]);

  function guardarBloques(lista) { onUpdateConfig({ bloquesCategoria: lista }); }
  function cambiarBloque(id, cambios) { guardarBloques(bloques.map((b) => (b.id === id ? { ...b, ...cambios } : b))); }
  function agregarBloque() {
    const ini = Number(nuevoBloque.inicio);
    const fin = Number(nuevoBloque.fin);
    if (!nuevoBloque.categoria || !(ini >= 0) || nuevoBloque.inicio === "" || !(fin >= ini)) { setMsg("Elige la categoría y escribe el inicio y el fin del bloque."); return; }
    const pref = listaPrefijos(nuevoBloque.prefijos);
    const yaHay = bloques.some((b) => {
      if (b.categoria !== nuevoBloque.categoria) return false;
      const pb = listaPrefijos(b.prefijos);
      return (!pb.length && !pref.length) || pb.some((v) => pref.includes(v));
    });
    if (yaHay) { setMsg(pref.length ? "Esa categoría ya tiene un bloque para ese prefijo. Edítalo en la tabla." : "Esa categoría ya tiene un bloque general. Si es una excepción de un prefijo, escribe el prefijo en la columna Prefijos."); return; }
    guardarBloques([...bloques, { id: uidLocal(), categoria: nuevoBloque.categoria, inicio: ini, fin, prefijos: pref.join(", "), desbordeModo: desbordeAuto(ini, fin) ? "auto" : "ninguno" }]);
    setNuevoBloque({ categoria: "", inicio: "", fin: "", prefijos: "" });
    setMsg("");
  }
  const limpiarPrefijo = (v) => String(v || "").trim().replace(/[\s,;]+/g, "");
  function derivarPrefijos(lista) {
    const o = {};
    lista.forEach((x) => { if (x.prefijo && x.grupo) o[x.grupo] = o[x.grupo] ? `${o[x.grupo]}, ${x.prefijo}` : x.prefijo; });
    return o;
  }
  function guardarLista(marcaId, lista) {
    onUpdateConfig({ marcasPrefijos: marcas.map((m) => (m.id === marcaId ? { ...m, lista, prefijos: derivarPrefijos(lista) } : m)) });
  }
  function cambiarFila(m, id, cambios) {
    const lista = listaMatriculados(m);
    const actual = lista.find((x) => x.id === id);
    if (!actual) return;
    const nuevo = { ...actual, ...cambios };
    if (!nuevo.prefijo) { setMsg("El prefijo no puede quedar vacío. Para quitarlo usa Eliminar."); return; }
    if (lista.some((x) => x.id !== id && x.prefijo === nuevo.prefijo && x.grupo === nuevo.grupo)) { setMsg(`${m.cliente} ya tiene matriculado el prefijo ${nuevo.prefijo} en ${nuevo.grupo}.`); return; }
    setMsg("");
    guardarLista(m.id, lista.map((x) => (x.id === id ? nuevo : x)));
  }
  function matricular(m) {
    const n = nuevosPref[m.id] || {};
    const prefijo = limpiarPrefijo(n.prefijo);
    if (!prefijo || !n.grupo) { setMsg("Escribe el prefijo y elige el grupo para matricularlo."); return; }
    const lista = listaMatriculados(m);
    if (lista.some((x) => x.prefijo === prefijo && x.grupo === n.grupo)) { setMsg(`${m.cliente} ya tiene matriculado el prefijo ${prefijo} en ${n.grupo}.`); return; }
    guardarLista(m.id, [...lista, { id: uidLocal(), prefijo, grupo: n.grupo, nota: String(n.nota || "").trim() }]);
    setNuevosPref((x) => ({ ...x, [m.id]: { prefijo: "", grupo: n.grupo, nota: "" } }));
    setMsg("");
  }
  function agregarMarca() {
    const nombre = String(nuevaMarca.cliente || "").trim();
    if (!nombre || !clientes.includes(nombre)) { setMsg("Escribe y elige una empresa de la lista de Clientes."); return; }
    if (marcas.some((m) => m.cliente === nombre)) { setMsg("Esa empresa ya está en el patrón."); return; }
    const origen = marcas.find((m) => m.cliente === String(nuevaMarca.copiarDe || "").trim());
    const lista = origen ? listaMatriculados(origen).map((x) => ({ ...x, id: uidLocal() })) : [];
    const nueva = { id: uidLocal(), cliente: nombre, lista, prefijos: derivarPrefijos(lista) };
    onUpdateConfig({ marcasPrefijos: [...marcas, nueva] });
    setAbiertaId(nueva.id);
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
  const categoriasLibres = config.categorias || [];
  const prefijosMatriculados = useMemo(() => {
    const set = new Set();
    marcas.forEach((m) => listaMatriculados(m).forEach((x) => { if (x.prefijo) set.add(String(x.prefijo)); }));
    return [...set].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [marcas]);
  const clientesLibres = clientes.filter((c) => !marcas.some((m) => m.cliente === c));

  // Prueba: usa un "linea" ficticia mapeada al grupo elegido
  const sugerencia = useMemo(() => {
    if (!prueba.cliente || !prueba.categoria || !prueba.grupo || !sugerir) return null;
    const cfgPrueba = { ...config, lineaGrupoMap: { ...(config.lineaGrupoMap || {}), __prueba__: prueba.grupo } };
    try { return sugerir(prueba.categoria, "__prueba__", prueba.cliente, cfgPrueba, prueba.prefijo); } catch (e) { return null; }
    // eslint-disable-next-line
  }, [prueba, config, sugerir]);

  const norm = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const empresasVista = useMemo(() => {
    const q = norm(busquedaEmp);
    const orden = [...marcas].sort((x, y) => String(x.cliente).localeCompare(String(y.cliente), "es"));
    if (!q) return orden;
    return orden.filter((m) => norm(m.cliente).includes(q) || listaMatriculados(m).some((x) => norm(x.prefijo) === q || norm(x.prefijo).startsWith(q)));
    // eslint-disable-next-line
  }, [marcas, busquedaEmp]);

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

      <datalist id="dl-prefijos">{prefijosMatriculados.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="dl-clientes-libres">{clientesLibres.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="dl-marcas">{marcas.map((m) => <option key={m.id} value={m.cliente} />)}</datalist>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, margin: "14px 0 6px" }}>1) Bloques por categoría</div>
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead><tr>{th("Categoría")}{th("Prefijos")}{th("Inicio")}{th("Fin")}{th("Cuando se llena sigue en")}{th("")}</tr></thead>
          <tbody>
            {bloquesOrdenados.map((b) => {
              const d = desbordeDeBloque(b);
              const chocaCon = choques.get(b.id);
              return (
                <tr key={b.id}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {b.categoria}
                    {chocaCon && <div style={{ fontSize: 11, color: T.coral, fontWeight: 700 }}>⚠ choca con: {[...chocaCon].join(", ")}</div>}
                    {duplicados.get(b.id) && <div style={{ fontSize: 11, color: T.coral, fontWeight: 700 }}>⚠ hay otro bloque de esta categoría para el mismo prefijo</div>}
                  </td>
                  <td style={{ ...td, width: 190 }}><SelectorPrefijos T={T} opciones={prefijosMatriculados} valor={b.prefijos || ""} onChange={(v) => cambiarBloque(b.id, { prefijos: v })} /></td>
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
            {!bloquesOrdenados.length && <tr><td colSpan={6} style={{ ...td, color: T.slate, fontStyle: "italic" }}>Todavía no hay bloques. Usa "Tomar el patrón de mis reglas actuales" o agrega el primero abajo.</td></tr>}
            <tr style={{ background: T.canvas }}>
              <td style={td}>
                <select value={nuevoBloque.categoria} onChange={(e) => setNuevoBloque((f) => ({ ...f, categoria: e.target.value }))} style={{ ...sel, width: "100%" }}>
                  <option value="">— Categoría —</option>
                  {categoriasLibres.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td style={td}><SelectorPrefijos T={T} opciones={prefijosMatriculados} valor={nuevoBloque.prefijos} onChange={(v) => setNuevoBloque((f) => ({ ...f, prefijos: v }))} /></td>
              <td style={td}><input type="number" placeholder="Ej: 200" value={nuevoBloque.inicio} onChange={(e) => setNuevoBloque((f) => ({ ...f, inicio: e.target.value }))} style={{ ...sel, width: "100%" }} /></td>
              <td style={td}><input type="number" placeholder="Ej: 299" value={nuevoBloque.fin} onChange={(e) => setNuevoBloque((f) => ({ ...f, fin: e.target.value }))} style={{ ...sel, width: "100%" }} /></td>
              <td style={{ ...td, color: T.slate, fontSize: 12 }}>{desbordeAuto(nuevoBloque.inicio, nuevoBloque.fin) ? `Automático: ${desbordeAuto(nuevoBloque.inicio, nuevoBloque.fin).inicio} – ${desbordeAuto(nuevoBloque.inicio, nuevoBloque.fin).fin}` : ""}</td>
              <td style={{ ...td, textAlign: "right" }}><button onClick={agregarBloque} style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Agregar</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: T.slate, marginTop: 6, fontStyle: "italic" }}>
        En la columna <b>Prefijos</b>, sin marcar significa que el bloque vale para todos los prefijos. Si un prefijo usa los números de otra forma (por ejemplo el 98-1000 a 1999 es Byker pero el 96-1100 a 1999 es Vestido), agrega una fila de esa categoría y marca ese prefijo: esa gana sobre la general solo para ese prefijo. Los avisos de choque se revisan prefijo por prefijo.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "20px 0 6px" }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>2) Prefijos matriculados por empresa</span>
        <span style={{ fontSize: 12, color: T.slate }}>{marcas.length} empresa{marcas.length === 1 ? "" : "s"}</span>
        <input type="text" value={busquedaEmp} onChange={(e) => setBusquedaEmp(e.target.value)} placeholder="🔎 Buscar empresa o prefijo…" style={{ ...sel, flex: 1, minWidth: 220, maxWidth: 360 }} />
      </div>
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, maxHeight: 480, overflowY: "auto" }}>
        {empresasVista.map((m) => {
          const abierta = abiertaId === m.id;
          const lista = listaMatriculados(m);
          const nuevo = nuevosPref[m.id] || { prefijo: "", grupo: "", nota: "" };
          return (
            <div key={m.id} style={{ borderBottom: `1px solid ${T.border}` }}>
              <div role="button" tabIndex={0} onClick={() => setAbiertaId(abierta ? "" : m.id)} onKeyDown={(e) => { if (e.key === "Enter") setAbiertaId(abierta ? "" : m.id); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", cursor: "pointer", background: abierta ? T.canvas : T.white, flexWrap: "wrap" }}>
                <span style={{ width: 14, color: T.slate }}>{abierta ? "▾" : "▸"}</span>
                <b style={{ fontSize: 14, color: T.ink, minWidth: 190 }}>{m.cliente}</b>
                <span style={{ flex: 1, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: T.slate }}>
                  {grupos.map((g) => {
                    const ps = prefijosDeGrupo(m, g);
                    return ps.length ? <span key={g}>{g}: <b style={{ color: T.denim }}>{ps.join(" · ")}</b></span> : null;
                  })}
                  {!lista.length && <i>sin prefijos</i>}
                </span>
                <span style={{ fontSize: 11, color: T.slate }}>{lista.length} prefijo{lista.length === 1 ? "" : "s"}</span>
              </div>
              {abierta && (
                <div style={{ padding: "0 0 10px", background: T.canvas }}>
                  <div style={{ overflow: "auto", background: T.white }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                      <thead><tr>{th("Prefijo")}{th("Grupo")}{th("Nota (opcional)")}{th("")}</tr></thead>
                      <tbody>
                        {lista.map((x) => (
                          <tr key={x.id}>
                            <td style={{ ...td, width: 130 }}><Celda value={x.prefijo} style={{ textAlign: "center", fontWeight: 800, color: T.denim }} onCommit={(v) => cambiarFila(m, x.id, { prefijo: limpiarPrefijo(v) })} /></td>
                            <td style={{ ...td, width: 200 }}>
                              <select value={x.grupo} onChange={(e) => cambiarFila(m, x.id, { grupo: e.target.value })} style={{ ...sel, width: "100%" }}>
                                {[...new Set([...grupos, x.grupo])].map((g) => <option key={g} value={g}>{g}</option>)}
                              </select>
                            </td>
                            <td style={td}><Celda value={x.nota || ""} placeholder="Ej: vestidos" onCommit={(v) => cambiarFila(m, x.id, { nota: String(v).trim() })} /></td>
                            <td style={{ ...td, width: 90, textAlign: "right" }}>
                              <button onClick={() => guardarLista(m.id, lista.filter((y) => y.id !== x.id))} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                            </td>
                          </tr>
                        ))}
                        {!lista.length && <tr><td colSpan={4} style={{ ...td, color: T.slate, fontStyle: "italic" }}>Esta empresa todavía no tiene prefijos matriculados.</td></tr>}
                        <tr style={{ background: T.canvas }}>
                          <td style={td}><input type="text" placeholder="Ej: 98" value={nuevo.prefijo} onChange={(e) => setNuevosPref((x) => ({ ...x, [m.id]: { ...nuevo, prefijo: e.target.value } }))} onKeyDown={(e) => { if (e.key === "Enter") matricular(m); }} style={{ ...sel, width: "100%", textAlign: "center", fontWeight: 800 }} /></td>
                          <td style={td}>
                            <select value={nuevo.grupo} onChange={(e) => setNuevosPref((x) => ({ ...x, [m.id]: { ...nuevo, grupo: e.target.value } }))} style={{ ...sel, width: "100%" }}>
                              <option value="">— Grupo —</option>
                              {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </td>
                          <td style={td}><input type="text" placeholder="Ej: vestidos" value={nuevo.nota} onChange={(e) => setNuevosPref((x) => ({ ...x, [m.id]: { ...nuevo, nota: e.target.value } }))} onKeyDown={(e) => { if (e.key === "Enter") matricular(m); }} style={{ ...sel, width: "100%" }} /></td>
                          <td style={{ ...td, textAlign: "right" }}><button onClick={() => matricular(m)} style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Matricular</button></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ textAlign: "right", padding: "8px 12px 0" }}>
                    <button onClick={() => { if (window.confirm(`¿Quitar a ${m.cliente} del patrón? Se borran sus prefijos matriculados (el cliente no se borra).`)) { onUpdateConfig({ marcasPrefijos: marcas.filter((x) => x.id !== m.id) }); setAbiertaId(""); } }} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Quitar empresa</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!empresasVista.length && <div style={{ padding: "12px 14px", color: T.slate, fontStyle: "italic", fontSize: 13 }}>{marcas.length ? "Ninguna empresa coincide con la búsqueda." : "Todavía no hay empresas en el patrón."}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 12, marginTop: 10 }}>
        <input list="dl-clientes-libres" value={nuevaMarca.cliente} onChange={(e) => setNuevaMarca((f) => ({ ...f, cliente: e.target.value }))} placeholder="Empresa nueva (escribe para buscar)" style={{ ...sel, minWidth: 260 }} />
        <input list="dl-marcas" value={nuevaMarca.copiarDe} onChange={(e) => setNuevaMarca((f) => ({ ...f, copiarDe: e.target.value }))} placeholder="Copiar prefijos de… (opcional)" style={{ ...sel, minWidth: 240 }} />
        <button onClick={agregarMarca} style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Agregar empresa</button>
      </div>
      <div style={{ fontSize: 11, color: T.slate, marginTop: 6, fontStyle: "italic" }}>
        Haz clic en una empresa para ver o editar sus prefijos. Matricula cada prefijo una sola vez, con su grupo. Si una empresa tiene varios prefijos en un grupo (por ejemplo Dama 98 y 96), al crear el código eliges cuál usar. Los prefijos matriculados son los que se pueden agregar en la tabla de bloques. Las empresas salen de la lista de Clientes: si una no aparece, créala primero en Administración → Clientes. Las reglas puntuales de la lista de abajo (por línea, grupo o cliente) siguen funcionando como excepciones y le ganan al patrón.
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
            : <span style={{ color: T.coral, fontWeight: 700 }}>→ el patrón no alcanza: falta el bloque de esa categoría o el prefijo de esa marca y grupo.</span>
        )}
      </div>
    </div>
  );
}
