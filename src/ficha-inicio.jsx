// ─── FICHA DE INICIO DEL PEDIDO · semáforo de 9 pasos + asistente + bibliotecas de colores y vinilos ────────────────
// (2026-11-22, a pedido de Fredy) Fase 1. Se muestra dentro de cada Preorden APROBADA (Preórdenes → abrir la preorden):
//   · Semáforo: una fila por referencia con los 9 pasos (Hoja de vida, Ficha de inicio, Combinaciones, Contramuestra, Alertas de insumos, Ficha técnica,
//     Explosión de materiales, Tela en bodega, Corte). El paso 2 se pone verde solo cuando la ficha queda completa; Hoja de vida, Contramuestra y Ficha técnica
//     se marcan a mano; los demás se conectarán en fases siguientes.
//   · Asistente de ficha paso a paso (Cliente → Referencia → Tallas → Colores → Vinilos → Curva y cantidades → Resumen), precargado con lo de la preorden.
//   · Bibliotecas previas: los colores y los vinilos se alistan ANTES (📚) y la ficha los escoge de ahí.
// Si después de marcar la ficha como lista cambian las cantidades de la preorden, el paso queda «Por revisar» (ámbar).
// Quién edita lo decide el permiso «ficha_inicio» de Roles (el admin siempre); quien no lo tiene solo ve el semáforo.
import React, { useEffect, useMemo, useState } from "react";
import { getApps } from "firebase/app";
import { collection, deleteDoc, doc, getFirestore, onSnapshot, query, setDoc, where, writeBatch } from "firebase/firestore";
import {
  COL_FICHA, COL_COLORES, COL_VINILOS, MAX_COLORES, PASOS_SEMAFORO, PASO_FICHA, PASOS_MANUALES, TIPOS_VINILO, NOMBRES_ASISTENTE,
  idFicha, num, plano, tallasDeRango, distribuirPorTalla, completarFicha, totalPreorden, totalFicha, faltantesPaso, fichaCompleta,
  pasosDeReferencia, resumenSemaforo, parsearColoresPegados, snapshotColor, snapshotVinilo,
} from "./ficha-inicio-calculo";

const C = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", amber: "#C47C1A", amberBg: "#FBF3E4", amberLine: "#E3A33A", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", grey: "#B9B3A8", greyBg: "#EFEBE4" };
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const limpiar = (x) => JSON.parse(JSON.stringify(x));
const dbDe = () => getFirestore(getApps()[0]);

function useColeccion(nombre, filtro) {
  const [lista, setLista] = useState(null);
  const clave = filtro ? `${filtro[0]}=${filtro[1]}` : "";
  useEffect(() => {
    const db = dbDe();
    const ref = filtro ? query(collection(db, nombre), where(filtro[0], "==", filtro[1])) : collection(db, nombre);
    return onSnapshot(ref, (s) => setLista(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setLista([]));
  }, [nombre, clave]); // eslint-disable-line
  return lista;
}

const inp = { width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", background: C.white, color: C.ink, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, color: C.slate, marginBottom: 5 };

function Boton({ children, onClick, tipo = "sec", disabled, small, title }) {
  const col = tipo === "pri" ? { background: C.ink, color: C.white } : tipo === "ok" ? { background: C.green, color: C.white } : tipo === "rojo" ? { background: C.redBg, color: C.red } : { background: C.greyBg, color: C.ink };
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} style={{ border: "none", borderRadius: small ? 8 : 10, fontWeight: 700, fontSize: small ? 12 : 13, padding: small ? "5px 11px" : "9px 16px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, fontFamily: "inherit", ...col }}>{children}</button>
  );
}
function Chip({ activo, onClick, children, title }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : "#FAF8F4", color: activo ? C.white : C.ink, borderRadius: 20, padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>
  );
}
function Ventana({ titulo, onClose, ancho = 860, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: ancho, padding: "18px 20px", boxShadow: "0 12px 40px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>{titulo}</div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "transparent", fontSize: 22, color: C.slate, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────── BIBLIOTECAS (colores y vinilos) ─────────────────────────
function BibliotecasFicha({ onClose, puedeEditar, inicial = "colores" }) {
  const db = useMemo(dbDe, []);
  const colores = useColeccion(COL_COLORES);
  const vinilos = useColeccion(COL_VINILOS);
  const [tab, setTab] = useState(inicial);
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", a: "", b: "", tipo: TIPOS_VINILO[0] });
  const [pegar, setPegar] = useState("");
  const [msg, setMsg] = useState("");
  const [editId, setEditId] = useState(null);
  const [borrador, setBorrador] = useState({});

  const lista = useMemo(() => {
    const base = (tab === "colores" ? colores : vinilos) || [];
    const q = plano(buscar);
    return base
      .filter((x) => !q || plano(`${x.nombre} ${x.codProveedor || ""} ${x.codBusint || ""} ${x.codigo || ""}`).includes(q))
      .sort((a, b) => plano(a.nombre).localeCompare(plano(b.nombre)));
  }, [tab, colores, vinilos, buscar]);

  async function agregar() {
    const nombre = nuevo.nombre.trim();
    if (!nombre || !puedeEditar) return;
    const col = tab === "colores" ? COL_COLORES : COL_VINILOS;
    const existentes = (tab === "colores" ? colores : vinilos) || [];
    if (existentes.some((x) => plano(x.nombre) === plano(nombre))) { setMsg(`«${nombre}» ya está en la biblioteca.`); return; }
    const ref = doc(collection(db, col));
    const datos = tab === "colores"
      ? { nombre, codProveedor: nuevo.a.trim(), codBusint: nuevo.b.trim() }
      : { nombre, codigo: nuevo.a.trim(), tipo: nuevo.tipo };
    await setDoc(ref, { ...datos, creadoEn: new Date().toISOString() });
    setNuevo({ nombre: "", a: "", b: "", tipo: nuevo.tipo });
    setMsg("");
  }
  async function pegarColores() {
    const { nuevos, repetidos } = parsearColoresPegados(pegar, colores || []);
    if (!nuevos.length) { setMsg(repetidos.length ? `Todos ya estaban en la biblioteca (${repetidos.length}).` : "No encontré colores para agregar."); return; }
    const lote = writeBatch(db);
    nuevos.forEach((c) => lote.set(doc(collection(db, COL_COLORES)), { ...c, creadoEn: new Date().toISOString() }));
    await lote.commit();
    setPegar("");
    setMsg(`Se agregaron ${nuevos.length} colores${repetidos.length ? ` · ${repetidos.length} ya estaban y se omitieron` : ""}.`);
  }
  async function guardarEdicion(x) {
    const col = tab === "colores" ? COL_COLORES : COL_VINILOS;
    const nombre = (borrador.nombre || "").trim();
    if (!nombre) return;
    const datos = tab === "colores" ? { nombre, codProveedor: (borrador.codProveedor || "").trim(), codBusint: (borrador.codBusint || "").trim() } : { nombre, codigo: (borrador.codigo || "").trim(), tipo: borrador.tipo || TIPOS_VINILO[0] };
    await setDoc(doc(db, col, x.id), datos, { merge: true });
    setEditId(null);
  }
  async function borrar(x) {
    if (!window.confirm(`¿Quitar «${x.nombre}» de la biblioteca? Las fichas que ya lo usan lo conservan.`)) return;
    await deleteDoc(doc(db, tab === "colores" ? COL_COLORES : COL_VINILOS, x.id));
  }

  const cargando = colores === null || vinilos === null;
  const celda = { padding: "7px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 13 };
  return (
    <Ventana titulo="📚 Bibliotecas de la Ficha de inicio" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: C.slate, fontWeight: 600, margin: "0 0 12px", lineHeight: 1.5 }}>Se alistan antes: cada ficha escoge sus colores y vinilos de aquí. Si corriges algo en la biblioteca, las fichas ya terminadas conservan lo que tenían.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Chip activo={tab === "colores"} onClick={() => { setTab("colores"); setMsg(""); setEditId(null); }}>🎨 Colores ({(colores || []).length})</Chip>
        <Chip activo={tab === "vinilos"} onClick={() => { setTab("vinilos"); setMsg(""); setEditId(null); }}>🏷 Vinilos y logos ({(vinilos || []).length})</Chip>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="🔍 Buscar…" style={{ ...inp, maxWidth: 240, marginLeft: "auto" }} />
      </div>
      {puedeEditar && (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 10 }}>
          <div><label style={lbl}>{tab === "colores" ? "Color" : "Vinilo / logo"}</label><input style={inp} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") agregar(); }} placeholder={tab === "colores" ? "Ej. Verde menta" : "Ej. Logo Kamila pecho"} /></div>
          <div><label style={lbl}>{tab === "colores" ? "Cód. proveedor" : "Código"}</label><input style={inp} value={nuevo.a} onChange={(e) => setNuevo({ ...nuevo, a: e.target.value })} /></div>
          {tab === "colores"
            ? <div><label style={lbl}>Cód. Busint</label><input style={inp} value={nuevo.b} onChange={(e) => setNuevo({ ...nuevo, b: e.target.value })} /></div>
            : <div><label style={lbl}>Tipo</label><select style={inp} value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}>{TIPOS_VINILO.map((t) => <option key={t}>{t}</option>)}</select></div>}
          <Boton tipo="pri" onClick={agregar} disabled={!nuevo.nombre.trim()}>+ Agregar</Boton>
        </div>
      )}
      {puedeEditar && tab === "colores" && (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.blue }}>Pegar varios colores desde Excel</summary>
          <div style={{ marginTop: 8 }}>
            <textarea value={pegar} onChange={(e) => setPegar(e.target.value)} rows={4} placeholder={"Una línea por color: nombre ; cód. proveedor ; cód. Busint\nFucsia ; PV-2210 ; 100245"} style={{ ...inp, fontFamily: "inherit" }} />
            <div style={{ marginTop: 6 }}><Boton small tipo="pri" onClick={pegarColores} disabled={!pegar.trim()}>Agregar los pegados</Boton></div>
          </div>
        </details>
      )}
      {msg && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{msg}</div>}
      <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: C.canvas }}>
              {(tab === "colores" ? ["#", "Color", "Cód. proveedor", "Cód. Busint", ""] : ["#", "Vinilo / logo", "Código", "Tipo", ""]).map((h, i) => <th key={i} style={{ ...celda, textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.slate }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {cargando ? <tr><td colSpan={5} style={{ ...celda, color: C.slate }}>Cargando…</td></tr>
              : !lista.length ? <tr><td colSpan={5} style={{ ...celda, color: C.slate, fontStyle: "italic" }}>{buscar ? "Sin resultados." : "Todavía no hay nada en esta biblioteca."}</td></tr>
              : lista.map((x, i) => {
                const enEdicion = editId === x.id;
                return (
                  <tr key={x.id}>
                    <td style={{ ...celda, color: C.slate, width: 36 }}>{i + 1}</td>
                    {enEdicion ? (
                      <>
                        <td style={celda}><input style={inp} value={borrador.nombre || ""} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} /></td>
                        <td style={celda}><input style={inp} value={(tab === "colores" ? borrador.codProveedor : borrador.codigo) || ""} onChange={(e) => setBorrador({ ...borrador, [tab === "colores" ? "codProveedor" : "codigo"]: e.target.value })} /></td>
                        <td style={celda}>{tab === "colores" ? <input style={inp} value={borrador.codBusint || ""} onChange={(e) => setBorrador({ ...borrador, codBusint: e.target.value })} /> : <select style={inp} value={borrador.tipo || TIPOS_VINILO[0]} onChange={(e) => setBorrador({ ...borrador, tipo: e.target.value })}>{TIPOS_VINILO.map((t) => <option key={t}>{t}</option>)}</select>}</td>
                        <td style={{ ...celda, whiteSpace: "nowrap" }}><Boton small tipo="ok" onClick={() => guardarEdicion(x)}>Guardar</Boton> <Boton small onClick={() => setEditId(null)}>Cancelar</Boton></td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...celda, fontWeight: 700 }}>{x.nombre}</td>
                        <td style={celda}>{(tab === "colores" ? x.codProveedor : x.codigo) || "—"}</td>
                        <td style={celda}>{(tab === "colores" ? x.codBusint : x.tipo) || "—"}</td>
                        <td style={{ ...celda, whiteSpace: "nowrap", textAlign: "right" }}>
                          {puedeEditar && <><Boton small onClick={() => { setEditId(x.id); setBorrador({ ...x }); }}>✏️</Boton> <Boton small tipo="rojo" onClick={() => borrar(x)}>🗑</Boton></>}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {!puedeEditar && <p style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>Solo consulta: para agregar o corregir necesitas el permiso «Ficha de inicio» en Roles.</p>}
    </Ventana>
  );
}

// ───────────────────────── ASISTENTE DE FICHA ─────────────────────────
function AsistenteFicha({ preorden, item, guardada, config, onClose, usuario }) {
  const db = useMemo(dbDe, []);
  const colores = useColeccion(COL_COLORES);
  const vinilos = useColeccion(COL_VINILOS);
  const [f, setF] = useState(() => completarFicha(guardada, item, preorden));
  const [paso, setPaso] = useState(0);
  const [pais, setPais] = useState("CO");
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", a: "", b: "", tipo: TIPOS_VINILO[0] });
  const [biblio, setBiblio] = useState(null);
  const [tallaNueva, setTallaNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const faltan = faltantesPaso(f, paso, item);

  async function guardar(extra) {
    const tallas = f.tallas;
    const poda = (pa) => ({ ...pa, curva: Object.fromEntries(tallas.map((t) => [t, Math.max(0, num((pa.curva || {})[t]))])), cant: Math.max(0, Math.round(num(pa.cant))), porTalla: distribuirPorTalla(pa.curva || {}, pa.cant, tallas) });
    const datos = limpiar({ ...f, ...(extra || {}), pais: { CO: poda(f.pais.CO), VE: poda(f.pais.VE) }, guardada: true, preordenId: preorden.id, itemId: item.itemId, referencia: item.referencia || "", actualizadoPor: usuario || "", actualizadoEn: new Date().toISOString() });
    setGuardando(true);
    setError("");
    try { await setDoc(doc(db, COL_FICHA, idFicha(preorden.id, item.itemId)), datos); setF((p) => ({ ...p, ...(extra || {}), guardada: true })); return true; }
    catch (e) { setError(e?.message || String(e)); return false; }
    finally { setGuardando(false); }
  }
  async function mover(d) {
    if (d > 0 && faltan.length) return;
    if (await guardar()) setPaso((p) => Math.max(0, Math.min(NOMBRES_ASISTENTE.length - 1, p + d)));
  }
  async function irA(i) {
    for (let k = 0; k < i; k++) if (faltantesPaso(f, k, item).length) { setPaso(k); return; }
    setPaso(i);
  }
  async function marcarLista() {
    if (f.listo) { if (await guardar({ listo: false })) onClose(); return; }
    if (!fichaCompleta(f, item)) return;
    if (await guardar({ listo: true, listoEn: new Date().toISOString(), base: { co: Math.round(num(item.colombiaCantidad)), ve: Math.round(num(item.venezuelaCantidad)) } })) onClose();
  }
  async function crearColorRapido() {
    const nombre = nuevo.nombre.trim();
    if (!nombre) return;
    const ya = (colores || []).find((c) => plano(c.nombre) === plano(nombre));
    let c = ya;
    if (!c) {
      const ref = doc(collection(db, COL_COLORES));
      c = { id: ref.id, nombre, codProveedor: nuevo.a.trim(), codBusint: nuevo.b.trim() };
      await setDoc(ref, { nombre: c.nombre, codProveedor: c.codProveedor, codBusint: c.codBusint, creadoEn: new Date().toISOString() });
    }
    if (!f.colores.some((x) => x.id === c.id) && f.colores.length < MAX_COLORES) set({ colores: [...f.colores, snapshotColor(c)] });
    setNuevo({ ...nuevo, nombre: "", a: "", b: "" });
  }
  async function crearViniloRapido() {
    const nombre = nuevo.nombre.trim();
    if (!nombre) return;
    const ya = (vinilos || []).find((v) => plano(v.nombre) === plano(nombre));
    let v = ya;
    if (!v) {
      const ref = doc(collection(db, COL_VINILOS));
      v = { id: ref.id, nombre, codigo: nuevo.a.trim(), tipo: nuevo.tipo };
      await setDoc(ref, { nombre: v.nombre, codigo: v.codigo, tipo: v.tipo, creadoEn: new Date().toISOString() });
    }
    if (!f.vinilos.some((x) => x.id === v.id)) set({ vinilos: [...f.vinilos, snapshotVinilo(v)], sinVinilos: false });
    setNuevo({ ...nuevo, nombre: "", a: "" });
  }

  const clientesLista = useMemo(() => {
    const s = new Set([...(config?.clientes || []).map((c) => c.nombre).filter(Boolean), ...f.clientes, preorden.cliente].filter(Boolean));
    return [...s];
  }, [config, f.clientes, preorden.cliente]);

  const coloresFiltrados = useMemo(() => {
    const q = plano(buscar);
    return (colores || []).filter((c) => !q || plano(`${c.nombre} ${c.codProveedor} ${c.codBusint}`).includes(q)).sort((a, b) => plano(a.nombre).localeCompare(plano(b.nombre)));
  }, [colores, buscar]);
  const vinilosFiltrados = useMemo(() => {
    const q = plano(buscar);
    return (vinilos || []).filter((v) => !q || plano(`${v.nombre} ${v.codigo}`).includes(q)).sort((a, b) => plano(a.nombre).localeCompare(plano(b.nombre)));
  }, [vinilos, buscar]);

  const togCliente = (c) => set({ clientes: f.clientes.includes(c) ? f.clientes.filter((x) => x !== c) : [...f.clientes, c] });
  const togColor = (c) => set({ colores: f.colores.some((x) => x.id === c.id) ? f.colores.filter((x) => x.id !== c.id) : (f.colores.length < MAX_COLORES ? [...f.colores, snapshotColor(c)] : f.colores) });
  const togVinilo = (v) => set({ vinilos: f.vinilos.some((x) => x.id === v.id) ? f.vinilos.filter((x) => x.id !== v.id) : [...f.vinilos, snapshotVinilo(v)], sinVinilos: false });
  const setPaisDato = (k, campo, valor) => setF((p) => ({ ...p, pais: { ...p.pais, [k]: { ...p.pais[k], [campo]: valor } } }));
  const setCurva = (k, t, v) => setF((p) => ({ ...p, pais: { ...p.pais, [k]: { ...p.pais[k], curva: { ...p.pais[k].curva, [t]: v === "" ? "" : num(v) } } } }));
  function setGama(g) { const t = tallasDeRango(g); set({ gama: g, tallas: t.length ? t : f.tallas }); }
  function agregarTalla() { const t = tallaNueva.trim().toUpperCase(); if (t && !f.tallas.includes(t)) set({ tallas: [...f.tallas, t] }); setTallaNueva(""); }

  const tot = totalFicha(f), esp = totalPreorden(item), cuadra = tot === esp;
  const campo = (et, clave, opciones) => (
    <div><label style={lbl}>{et}</label>
      {opciones && opciones.length
        ? <select style={inp} value={f.datos[clave]} onChange={(e) => set({ datos: { ...f.datos, [clave]: e.target.value } })}><option value="">Escoger…</option>{[...new Set([...(opciones || []), f.datos[clave]].filter(Boolean))].map((o) => <option key={o}>{o}</option>)}</select>
        : <input style={inp} value={f.datos[clave]} onChange={(e) => set({ datos: { ...f.datos, [clave]: e.target.value } })} />}
    </div>
  );

  let panel = null;
  if (paso === 0) {
    panel = (
      <>
        <h3 style={tit}>¿Para qué cliente(s) es esta referencia?</h3>
        <p style={ayuda}>Puedes escoger uno o varios. La preorden es de <b>{preorden.cliente || "—"}</b>.</p>
        <input style={{ ...inp, maxWidth: 320, marginBottom: 12 }} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="🔍 Buscar cliente…" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {clientesLista.filter((c) => !buscar || plano(c).includes(plano(buscar))).map((c) => <Chip key={c} activo={f.clientes.includes(c)} onClick={() => togCliente(c)}>{c}</Chip>)}
        </div>
      </>
    );
  } else if (paso === 1) {
    panel = (
      <>
        <h3 style={tit}>Datos de la referencia</h3>
        <p style={ayuda}>Ya vienen de la preorden; corrige lo que haga falta.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          {campo("Categoría", "categoria", config?.categorias)}
          {campo("Silueta", "silueta", config?.siluetas)}
          {campo("Línea (Busint)", "linea")}
          {campo("Tela principal", "tela")}
        </div>
      </>
    );
  } else if (paso === 2) {
    panel = (
      <>
        <h3 style={tit}>Tallas</h3>
        <p style={ayuda}>Escoge el rango y las tallas se cargan solas; puedes quitar o agregar una talla.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(config?.rangos || []).map((g) => <Chip key={g} activo={f.gama === g} onClick={() => setGama(g)}>{g}</Chip>)}
        </div>
        <p style={{ ...ayuda, marginTop: 16 }}>Tallas de esta referencia (toca para quitar):</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {f.tallas.map((t) => <Chip key={t} activo onClick={() => set({ tallas: f.tallas.filter((x) => x !== t) })} title="Quitar talla">{t} ×</Chip>)}
          <input style={{ ...inp, width: 110 }} value={tallaNueva} onChange={(e) => setTallaNueva(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") agregarTalla(); }} onBlur={agregarTalla} placeholder="+ talla" />
        </div>
      </>
    );
  } else if (paso === 3) {
    panel = (
      <>
        <h3 style={tit}>Colores de la referencia</h3>
        <p style={ayuda}>Se escogen de la biblioteca (hasta {MAX_COLORES}). Si el color no está, créalo abajo y queda en la biblioteca.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input style={{ ...inp, maxWidth: 260 }} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="🔍 Buscar color o código…" />
          <Boton small onClick={() => set({ colores: [...f.colores, ...coloresFiltrados.filter((c) => !f.colores.some((x) => x.id === c.id)).map(snapshotColor)].slice(0, MAX_COLORES) })}>Marcar los {coloresFiltrados.length} visibles</Boton>
          <Boton small onClick={() => set({ colores: [] })} disabled={!f.colores.length}>Quitar todos</Boton>
          <Boton small onClick={() => setBiblio("colores")}>📚 Biblioteca</Boton>
          <b style={{ fontSize: 12.5, color: C.slate, marginLeft: "auto" }}>{f.colores.length} de {MAX_COLORES} escogidos</b>
        </div>
        <div style={{ maxHeight: 250, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 12 }}>
          {colores === null ? <div style={{ padding: 12, color: C.slate }}>Cargando…</div>
            : !coloresFiltrados.length ? <div style={{ padding: 12, color: C.slate, fontStyle: "italic" }}>{(colores || []).length ? "Sin resultados." : "La biblioteca de colores está vacía: crea el primero abajo o pega varios en 📚 Biblioteca."}</div>
            : coloresFiltrados.map((c) => {
              const on = f.colores.some((x) => x.id === c.id);
              return (
                <label key={c.id} style={{ display: "grid", gridTemplateColumns: "26px 1.4fr 1fr 1fr", gap: 8, alignItems: "center", padding: "7px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 13, cursor: "pointer", background: on ? C.greenBg : C.white }}>
                  <input type="checkbox" checked={on} onChange={() => togColor(c)} /><b>{c.nombre}</b><span style={{ color: C.slate }}>{c.codProveedor || "—"}</span><span style={{ color: C.slate }}>{c.codBusint || "—"}</span>
                </label>
              );
            })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 12 }}>
          <div><label style={lbl}>Crear color nuevo</label><input style={inp} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre del color" /></div>
          <div><label style={lbl}>Cód. proveedor</label><input style={inp} value={nuevo.a} onChange={(e) => setNuevo({ ...nuevo, a: e.target.value })} /></div>
          <div><label style={lbl}>Cód. Busint</label><input style={inp} value={nuevo.b} onChange={(e) => setNuevo({ ...nuevo, b: e.target.value })} /></div>
          <Boton tipo="pri" onClick={crearColorRapido} disabled={!nuevo.nombre.trim()}>+ Crear y escoger</Boton>
        </div>
      </>
    );
  } else if (paso === 4) {
    panel = (
      <>
        <h3 style={tit}>Vinilos y logos que lleva</h3>
        <p style={ayuda}>Escoge de la biblioteca los vinilos o logos de esta referencia. La ubicación sobre la prenda llega en la fase de Combinaciones.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input style={{ ...inp, maxWidth: 260 }} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="🔍 Buscar vinilo…" />
          <Boton small onClick={() => setBiblio("vinilos")}>📚 Biblioteca</Boton>
          <label style={{ fontSize: 13, fontWeight: 700, display: "inline-flex", gap: 6, alignItems: "center", marginLeft: "auto" }}><input type="checkbox" checked={f.sinVinilos} onChange={(e) => set({ sinVinilos: e.target.checked, vinilos: e.target.checked ? [] : f.vinilos })} /> No lleva vinilos</label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: f.sinVinilos ? 0.4 : 1, pointerEvents: f.sinVinilos ? "none" : "auto" }}>
          {vinilos === null ? <span style={{ color: C.slate }}>Cargando…</span>
            : !vinilosFiltrados.length ? <span style={{ color: C.slate, fontStyle: "italic" }}>{(vinilos || []).length ? "Sin resultados." : "La biblioteca de vinilos está vacía: crea el primero abajo."}</span>
            : vinilosFiltrados.map((v) => <Chip key={v.id} activo={f.vinilos.some((x) => x.id === v.id)} onClick={() => togVinilo(v)} title={`${v.tipo || ""} ${v.codigo || ""}`}>{v.nombre}{v.codigo ? ` · ${v.codigo}` : ""}</Chip>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 14 }}>
          <div><label style={lbl}>Crear vinilo nuevo</label><input style={inp} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre del vinilo o logo" /></div>
          <div><label style={lbl}>Código</label><input style={inp} value={nuevo.a} onChange={(e) => setNuevo({ ...nuevo, a: e.target.value })} /></div>
          <div><label style={lbl}>Tipo</label><select style={inp} value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}>{TIPOS_VINILO.map((t) => <option key={t}>{t}</option>)}</select></div>
          <Boton tipo="pri" onClick={crearViniloRapido} disabled={!nuevo.nombre.trim()}>+ Crear y escoger</Boton>
        </div>
      </>
    );
  } else if (paso === 5) {
    const d = f.pais[pais];
    const rep = distribuirPorTalla(d.curva, d.cant, f.tallas);
    const sumaRep = f.tallas.reduce((s, t) => s + rep[t], 0);
    panel = (
      <>
        <h3 style={tit}>Curva y cantidades por cliente</h3>
        <p style={ayuda}>Escribe la curva (prendas de cada talla por tanda) y la cantidad total: las cantidades por talla se calculan solas.</p>
        <div style={{ display: "inline-flex", background: "#ECE6DC", borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {[["CO", "🇨🇴 Colombia"], ["VE", "🇻🇪 Venezuela"]].map(([k, n]) => <button key={k} type="button" onClick={() => setPais(k)} style={{ border: "none", background: pais === k ? C.blue : "transparent", color: pais === k ? C.white : C.slate, fontWeight: 700, fontSize: 13, padding: "7px 16px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>{n}</button>)}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse" }}>
            <thead><tr><th />{f.tallas.map((t) => <th key={t} style={thc}>{t}</th>)}<th style={thc}>Total</th></tr></thead>
            <tbody>
              <tr><td style={rl}>Curva</td>{f.tallas.map((t) => <td key={t} style={tdc}><input type="number" min="0" style={{ ...inp, width: 64, textAlign: "center", padding: "7px 4px" }} value={d.curva[t] ?? ""} onChange={(e) => setCurva(pais, t, e.target.value)} /></td>)}<td /></tr>
              <tr><td style={rl}>Cantidad total</td><td style={{ ...tdc, textAlign: "left" }} colSpan={f.tallas.length}><input type="number" min="0" style={{ ...inp, width: 120 }} value={d.cant || ""} onChange={(e) => setPaisDato(pais, "cant", Math.round(num(e.target.value)))} /></td><td /></tr>
              <tr><td style={rl}>Por talla (auto)</td>{f.tallas.map((t) => <td key={t} style={{ ...tdc, fontWeight: 800, fontSize: 15, background: "#FAF8F4" }}>{rep[t]}</td>)}<td style={{ ...tdc, fontWeight: 800, fontSize: 15, background: "#FAF8F4" }}>{sumaRep}</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 16, padding: "12px 14px", borderRadius: 12, fontSize: 13, fontWeight: 700, background: cuadra ? C.greenBg : C.redBg, color: cuadra ? C.green : C.red }}>
          <span>{cuadra ? "✓ Cuadra con la preorden" : "⚠ No cuadra con la preorden"}</span>
          <span>Colombia {fmtNum(f.pais.CO.cant)} + Venezuela {fmtNum(f.pais.VE.cant)} = <b>{fmtNum(tot)}</b></span>
          <span>Preorden: <b>{fmtNum(esp)}</b> ({fmtNum(item.colombiaCantidad)} CO · {fmtNum(item.venezuelaCantidad)} VE)</span>
        </div>
        <p style={{ ...ayuda, marginTop: 10 }}>El reparto por color se define en la fase de Combinaciones; aquí solo se fija cuántas prendas van por talla.</p>
      </>
    );
  } else {
    const todo = fichaCompleta(f, item);
    const caja = (t, c) => <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", background: "#FAF8F4" }}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, fontWeight: 700, marginBottom: 6 }}>{t}</div><div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.55 }}>{c}</div></div>;
    panel = (
      <>
        <h3 style={tit}>Resumen de la ficha</h3>
        <p style={ayuda}>Revisa y marca la ficha como lista: el paso 2 del semáforo se pondrá en verde.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12 }}>
          {caja("Clientes", f.clientes.join(" · ") || "—")}
          {caja("Referencia", <>{f.datos.categoria || "—"} · {f.datos.silueta || "—"}<br />{f.datos.linea || "—"} · {f.datos.tela || "—"}</>)}
          {caja("Tallas", f.tallas.join(" · ") || "—")}
          {caja(`Colores (${f.colores.length})`, (f.colores.slice(0, 8).map((c) => c.nombre).join(", ") || "—") + (f.colores.length > 8 ? "…" : ""))}
          {caja(`Vinilos (${f.vinilos.length})`, f.sinVinilos ? "No lleva vinilos" : (f.vinilos.map((v) => v.nombre).join(", ") || "—"))}
          {caja("Cantidades", <>Colombia {fmtNum(f.pais.CO.cant)} · Venezuela {fmtNum(f.pais.VE.cant)}<br /><b>Total {fmtNum(tot)}</b> de {fmtNum(esp)} en la preorden</>)}
        </div>
        {!todo && <div style={{ marginTop: 12, background: C.amberBg, color: C.amber, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700 }}>Aún hay pasos incompletos: toca el paso en la barra de arriba para completarlo.</div>}
      </>
    );
  }

  const esUltimo = paso === NOMBRES_ASISTENTE.length - 1;
  return (
    <Ventana titulo={`Ficha de inicio · ${item.referencia || ""}${item.nombre ? ` — ${item.nombre}` : ""}`} onClose={onClose} ancho={980}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {NOMBRES_ASISTENTE.map((n, i) => {
          const hecho = i < paso && !faltantesPaso(f, i, item).length;
          return (
            <button key={n} type="button" onClick={() => irA(i)} style={{ flex: "1 1 110px", border: `1.5px solid ${i === paso ? C.ink : hecho ? "#BFE3D2" : C.border}`, background: hecho ? C.greenBg : C.white, color: hecho ? C.green : i === paso ? C.ink : C.slate, borderRadius: 12, padding: "8px 10px", textAlign: "left", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 }}>Paso {i + 1}{hecho ? " ✓" : ""}</div>{n}
            </button>
          );
        })}
      </div>
      <div style={{ minHeight: 300 }}>{panel}</div>
      {error && <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>No se pudo guardar: {error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Boton onClick={() => mover(-1)} disabled={paso === 0 || guardando}>← Atrás</Boton>
          <Boton onClick={async () => { if (await guardar()) onClose(); }} disabled={guardando}>Guardar y salir</Boton>
        </div>
        <span style={{ fontSize: 12.5, color: C.amber, fontWeight: 700 }}>{!esUltimo && faltan.length ? `Para seguir: ${faltan.join(", ")}` : ""}</span>
        {esUltimo
          ? <Boton tipo={f.listo ? "sec" : "ok"} onClick={marcarLista} disabled={guardando || (!f.listo && !fichaCompleta(f, item))}>{f.listo ? "✓ Ficha lista (desmarcar)" : "Marcar ficha como lista"}</Boton>
          : <Boton tipo="pri" onClick={() => mover(1)} disabled={guardando || !!faltan.length}>Siguiente →</Boton>}
      </div>
      {biblio && <BibliotecasFicha inicial={biblio} puedeEditar onClose={() => setBiblio(null)} />}
    </Ventana>
  );
}
const tit = { fontSize: 18, fontWeight: 800, margin: "0 0 4px", color: C.ink };
const ayuda = { fontSize: 13, color: C.slate, fontWeight: 600, margin: "0 0 14px", lineHeight: 1.5 };
const thc = { fontSize: 11, textTransform: "uppercase", color: C.slate, fontWeight: 700, padding: "4px 8px", textAlign: "center" };
const tdc = { padding: "4px 6px", textAlign: "center" };
const rl = { fontSize: 12, fontWeight: 700, color: C.slate, paddingRight: 12, whiteSpace: "nowrap" };

// ───────────────────────── SEMÁFORO EN LA PREORDEN ─────────────────────────
const COLOR_PUNTO = [
  { borde: C.grey, fondo: C.white, texto: C.grey },
  { borde: C.amberLine, fondo: C.amberBg, texto: C.amber },
  { borde: C.green, fondo: C.green, texto: C.white },
];
function Punto({ estado, onClick, titulo, futuro, halo }) {
  const c = COLOR_PUNTO[estado] || COLOR_PUNTO[0];
  return (
    <span role={onClick ? "button" : undefined} title={titulo} onClick={onClick} style={{ width: 24, height: 24, borderRadius: "50%", border: `2px ${futuro ? "dashed" : "solid"} ${c.borde}`, background: c.fondo, color: c.texto, display: "inline-grid", placeItems: "center", fontSize: 11, fontWeight: 800, cursor: onClick ? "pointer" : "default", opacity: futuro ? 0.7 : 1, boxShadow: halo ? "0 0 0 3px rgba(61,107,158,.25)" : "none" }}>{estado === 2 ? "✓" : ""}</span>
  );
}

export default function FichaInicioPreorden({ preorden, config, currentUser, puedeEditar }) {
  const db = useMemo(dbDe, []);
  const fichas = useColeccion(COL_FICHA, ["preordenId", preorden.id]);
  const [abierta, setAbierta] = useState(null); // itemId con el asistente abierto
  const [biblio, setBiblio] = useState(false);
  const aprobada = (preorden.estado || "montada") === "aprobada";
  const items = preorden.items || [];
  const porItem = useMemo(() => { const m = {}; (fichas || []).forEach((x) => { m[x.itemId] = x; }); return m; }, [fichas]);
  const fichasCompletas = useMemo(() => { const m = {}; items.forEach((it) => { m[it.itemId] = completarFicha(porItem[it.itemId], it, preorden); }); return m; }, [items, porItem, preorden]);
  const resumen = useMemo(() => resumenSemaforo(items, fichasCompletas), [items, fichasCompletas]);

  async function ciclo(it, i) {
    if (!puedeEditar) return;
    const f = fichasCompletas[it.itemId];
    const pasos = { ...(f.pasos || {}) };
    pasos[i] = (num(pasos[i]) + 1) % 3;
    await setDoc(doc(db, COL_FICHA, idFicha(preorden.id, it.itemId)), { preordenId: preorden.id, itemId: it.itemId, referencia: it.referencia || "", pasos, actualizadoPor: currentUser?.name || "", actualizadoEn: new Date().toISOString() }, { merge: true });
  }

  if (!items.length) return null;
  const itemAbierto = items.find((it) => it.itemId === abierta);
  const th = { padding: "6px 4px", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: C.slate, fontWeight: 700, textAlign: "center", verticalAlign: "bottom", lineHeight: 1.25 };
  return (
    <div style={{ marginTop: 20 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>🚦 Ficha de inicio · pasos antes de montar el pedido</div>
        {aprobada && <span style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>{resumen.listas} de {resumen.total} fichas listas{resumen.porRevisar ? ` · ${resumen.porRevisar} por revisar` : ""}</span>}
        <span style={{ marginLeft: "auto" }}><Boton small onClick={() => setBiblio(true)}>📚 Bibliotecas de colores y vinilos</Boton></span>
      </div>
      {!aprobada ? (
        <div style={{ background: C.canvas, border: `1px dashed ${C.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 12.5, color: C.slate, fontWeight: 600 }}>La ficha se empieza cuando el cliente aprueba la preorden. Mientras tanto puedes alistar las bibliotecas de colores y vinilos.</div>
      ) : (
        <>
          <div style={{ height: 8, background: C.greyBg, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}><div style={{ width: `${resumen.total ? (resumen.listas / resumen.total) * 100 : 0}%`, height: "100%", background: C.green, transition: "width .3s" }} /></div>
          <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: C.white }}>
                  <th style={{ ...th, textAlign: "left", paddingLeft: 10 }}>Referencia</th>
                  {PASOS_SEMAFORO.map((p, i) => <th key={p} style={th}>{i + 1}<br />{p}</th>)}
                  <th style={th}>Unidades</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const f = fichasCompletas[it.itemId];
                  const { estados, porRevisar } = pasosDeReferencia(f, it);
                  return (
                    <tr key={it.itemId} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 4px 8px 10px", fontSize: 13 }}><b>{it.referencia || "—"}</b><div style={{ fontSize: 11, color: C.slate, fontWeight: 600 }}>{it.nombre || ""}</div></td>
                      {PASOS_SEMAFORO.map((p, i) => (
                        <td key={p} style={{ textAlign: "center", padding: "8px 2px" }}>
                          {i === PASO_FICHA
                            ? <Punto estado={estados[i]} halo titulo={porRevisar ? "Las cantidades de la preorden cambiaron: revisar la ficha" : "Ficha de inicio"} onClick={puedeEditar ? () => setAbierta(it.itemId) : undefined} />
                            : PASOS_MANUALES.includes(i)
                              ? <Punto estado={estados[i]} titulo={puedeEditar ? "Tocar para cambiar: pendiente → en proceso → listo" : p} onClick={puedeEditar ? () => ciclo(it, i) : undefined} />
                              : <Punto estado={estados[i]} futuro titulo="Se conecta en una fase siguiente" />}
                        </td>
                      ))}
                      <td style={{ textAlign: "center", fontWeight: 700, fontSize: 13 }}>{fmtNum(totalPreorden(it))}</td>
                      <td style={{ padding: "0 8px", whiteSpace: "nowrap" }}>
                        {porRevisar ? <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberBg, borderRadius: 20, padding: "2px 9px" }}>Por revisar</span> : null}
                        {puedeEditar && <> <Boton small onClick={() => setAbierta(it.itemId)}>{estados[PASO_FICHA] === 2 ? "Ver ficha" : estados[PASO_FICHA] === 1 && !porRevisar ? "Continuar" : porRevisar ? "Revisar" : "Empezar"}</Boton></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>Sólido = se marca a mano (Hoja de vida, Contramuestra, Ficha técnica). Punteado = se conecta en una fase siguiente. El paso 2 se pone verde solo cuando la ficha queda lista.{!puedeEditar ? " Para llenar fichas necesitas el permiso «Ficha de inicio» en Roles." : ""}</div>
        </>
      )}
      {itemAbierto && <AsistenteFicha preorden={preorden} item={itemAbierto} guardada={porItem[itemAbierto.itemId]} config={config} usuario={currentUser?.name || ""} onClose={() => setAbierta(null)} />}
      {biblio && <BibliotecasFicha puedeEditar={puedeEditar} onClose={() => setBiblio(false)} />}
    </div>
  );
}
