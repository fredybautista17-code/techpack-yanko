// ─── CUMPLEAÑOS DE LOS TRABAJADORES (Talento Humano) ─────────────────────────
// (2026-11-10, a pedido de Fredy) Talento Humano (antes Yuleisi Moreno, ahora Midalys) necesita saber a tiempo quién cumple años.
// Dos piezas que comparten la colección Firestore «nomina_cumpleanos» ({nombre, mes, dia, activo?}; solo día y mes, sin año):
//   CumpleanosView   -> pantalla Nómina → Personal → Cumpleaños: ver por mes, agregar, corregir y quitar; carga la lista inicial del documento.
//   BloqueCumpleanos -> tarjeta «🎂 Cumpleaños» del Mi Día: hoy, próximos 3 días y próximos 30 días.
// El correo automático (3 días antes y el mismo día) está en functions (avisarCumpleanos) y llega a quien tenga marcada esa tarjeta.
import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { SEMILLA } from "./cumpleanos-semilla";
import { MESES, diaValido, fechaTexto, nombreBonito, hoyBogotaISO, agruparProximos, cumpleanosSinDia } from "./cumpleanos-calculo";

const COL = "nomina_cumpleanos";
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6", green: "#2D9E6B", greenBg: "#EBF7F2",
};
const campo = { height: 34, padding: "0 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.white, color: C.ink, boxSizing: "border-box", fontFamily: "inherit" };
const boton = (primario) => ({ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: primario ? "none" : `1px solid ${C.border}`, background: primario ? C.ink : C.white, color: primario ? C.white : C.ink });
const botonChico = { height: 28, padding: "0 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.border}`, background: C.white, color: C.ink };
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", borderBottom: `1px solid ${C.border}` };
const td = { padding: "8px 10px", fontSize: 13, color: C.ink, borderBottom: `1px solid ${C.border}` };

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
// Ids fijos para la lista inicial: si alguien toca el botón dos veces, no se duplica nadie.
const idSemilla = (x) => `c_${String(x.mes).padStart(2, "0")}${String(x.dia || 0).padStart(2, "0")}_${slug(x.nombre)}`;
const aEntero = (v) => (String(v).trim() === "" ? null : Number(v));

function useCumpleanos(db) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return undefined;
    return onSnapshot(
      collection(db, COL),
      (s) => { setError(""); setLista(s.docs.map((x) => ({ ...x.data(), id: x.id }))); },
      (e) => { setError(e?.message || "No se pudo leer la lista de cumpleaños."); setLista([]); }
    );
  }, [db]);
  return { lista, error };
}

function Pastilla({ faltan }) {
  const [bg, fg, txt] = faltan === 0 ? [C.red, "#fff", "Hoy"] : faltan === 1 ? [C.amberBg, C.amber, "Mañana"] : faltan <= 3 ? [C.amberBg, C.amber, `En ${faltan} días`] : [C.blueBg, C.blue, `En ${faltan} días`];
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: fg, whiteSpace: "nowrap" }}>{txt}</span>;
}

// ─── Tarjeta del Mi Día ───
export function BloqueCumpleanos({ db }) {
  const { lista, error } = useCumpleanos(db);
  const hoy = hoyBogotaISO();
  const g = useMemo(() => agruparProximos(lista || [], hoy, 30), [lista, hoy]);
  const grupo = (titulo, arr, vacio) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{titulo}</div>
      {arr.length ? arr.map((x) => (
        <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "9px 0", borderTop: `1px solid ${C.border}`, fontSize: 14 }}>
          <b>{nombreBonito(x.nombre)}</b>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.slate, whiteSpace: "nowrap" }}>{fechaTexto(x.mes, x.dia, hoy)}</span>
            <Pastilla faltan={x.faltan} />
          </span>
        </div>
      )) : <div style={{ fontSize: 13, color: C.slate, padding: "6px 0" }}>{vacio}</div>}
    </div>
  );
  const resumen = g.hoy.length
    ? `Hoy cumple${g.hoy.length === 1 ? "" : "n"} años ${g.hoy.length} ${g.hoy.length === 1 ? "persona" : "personas"}.`
    : g.proximos3.length ? `Hoy no hay cumpleaños. En los próximos 3 días: ${g.proximos3.length}.` : "Hoy no hay cumpleaños ni en los próximos 3 días.";
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", maxWidth: 820 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>🎂 Cumpleaños</div>
      {error ? <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{error}</div> : null}
      {lista === null ? <div style={{ fontSize: 13, color: C.slate, marginTop: 8 }}>Cargando…</div>
        : !lista.length ? <div style={{ fontSize: 13, color: C.amber, marginTop: 8 }}>Todavía no hay cumpleaños cargados. Se cargan en Nómina → Personal → Cumpleaños.</div>
        : (
          <>
            <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{resumen}</div>
            {grupo("Hoy", g.hoy, "Hoy no cumple años nadie.")}
            {grupo("En los próximos 3 días (hay que prepararse)", g.proximos3, "Nadie cumple años en los próximos 3 días.")}
            {grupo("Más adelante (30 días)", g.adelante, "Nadie más en los próximos 30 días.")}
          </>
        )}
    </div>
  );
}

// ─── Pantalla de Nómina → Personal → Cumpleaños ───
export default function CumpleanosView({ db, puedeEditar = true }) {
  const { lista, error } = useCumpleanos(db);
  const hoy = hoyBogotaISO();
  const [mesSel, setMesSel] = useState(Number(hoy.slice(5, 7)));
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", mes: String(Number(hoy.slice(5, 7))), dia: "" });
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ nombre: "", mes: "1", dia: "" });
  const [quitarId, setQuitarId] = useState(null);
  const [msg, setMsg] = useState({ ok: true, txt: "" });
  const [ocupado, setOcupado] = useState(false);

  const todos = useMemo(() => lista || [], [lista]);
  const sinDia = useMemo(() => cumpleanosSinDia(todos), [todos]);
  const cuantosPorMes = (m) => todos.filter((x) => Number(x.mes) === m).length;
  const t = q.trim().toLowerCase();
  const visibles = (t
    ? todos.filter((x) => String(x.nombre || "").toLowerCase().includes(t))
    : todos.filter((x) => Number(x.mes) === mesSel)
  ).slice().sort((a, b) => Number(a.mes) - Number(b.mes) || (Number(a.dia) || 99) - (Number(b.dia) || 99) || String(a.nombre).localeCompare(String(b.nombre), "es"));

  const avisar = (ok, txt) => setMsg({ ok, txt });
  async function cargarSemilla() {
    setOcupado(true); avisar(true, "");
    try {
      const batch = writeBatch(db);
      SEMILLA.forEach((x) => batch.set(doc(db, COL, idSemilla(x)), { nombre: x.nombre, mes: x.mes, dia: x.dia, activo: true, creadoEn: new Date().toISOString() }));
      await batch.commit();
      avisar(true, `Listo: se cargaron ${SEMILLA.length} cumpleaños del documento.`);
    } catch (e) { avisar(false, e?.message || "No se pudo cargar la lista."); }
    setOcupado(false);
  }
  async function agregar() {
    const nombre = nuevo.nombre.trim().toUpperCase();
    const mes = Number(nuevo.mes), dia = aEntero(nuevo.dia);
    if (!nombre) { avisar(false, "Escribe el nombre."); return; }
    if (!diaValido(mes, dia)) { avisar(false, `Escribe un día válido para ${MESES[mes - 1]}.`); return; }
    setOcupado(true);
    try {
      await setDoc(doc(db, COL, `c_${Date.now()}`), { nombre, mes, dia, activo: true, creadoEn: new Date().toISOString() });
      setNuevo({ nombre: "", mes: nuevo.mes, dia: "" }); setMesSel(mes); setQ("");
      avisar(true, `${nombreBonito(nombre)} quedó el ${dia} de ${MESES[mes - 1].toLowerCase()}.`);
    } catch (e) { avisar(false, e?.message || "No se pudo agregar."); }
    setOcupado(false);
  }
  function empezarEdicion(x) {
    setQuitarId(null); setEditId(x.id);
    setEdit({ nombre: x.nombre || "", mes: String(Number(x.mes) || 1), dia: x.dia ? String(x.dia) : "" });
  }
  async function guardarEdicion(x) {
    const nombre = edit.nombre.trim().toUpperCase();
    const mes = Number(edit.mes), dia = aEntero(edit.dia);
    if (!nombre) { avisar(false, "Escribe el nombre."); return; }
    if (!diaValido(mes, dia)) { avisar(false, `Escribe un día válido para ${MESES[mes - 1]}.`); return; }
    setOcupado(true);
    try {
      await setDoc(doc(db, COL, x.id), { nombre, mes, dia, actualizadoEn: new Date().toISOString() }, { merge: true });
      setEditId(null); avisar(true, "Cambio guardado.");
    } catch (e) { avisar(false, e?.message || "No se pudo guardar."); }
    setOcupado(false);
  }
  async function quitar(x) {
    setOcupado(true);
    try { await deleteDoc(doc(db, COL, x.id)); setQuitarId(null); avisar(true, `${nombreBonito(x.nombre)} se quitó de la lista.`); }
    catch (e) { avisar(false, e?.message || "No se pudo quitar."); }
    setOcupado(false);
  }

  const tarjeta = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 };
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginBottom: 4 }}>🎂 Cumpleaños</div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>Talento Humano recibe el aviso en su Mi Día y por correo, 3 días antes y el mismo día. Aquí se agregan, corrigen y quitan las personas.</div>
      {error ? <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{error}</div> : null}
      {msg.txt ? <div style={{ background: msg.ok ? C.greenBg : C.redBg, color: msg.ok ? C.green : C.red, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{msg.txt}</div> : null}
      {lista === null ? <div style={{ fontSize: 13, color: C.slate }}>Cargando…</div> : (
        <div style={tarjeta}>
          {!todos.length && puedeEditar ? (
            <div style={{ background: C.amberBg, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>La lista está vacía</div>
              <div style={{ fontSize: 12, color: C.slate, margin: "4px 0 10px" }}>Carga los {SEMILLA.length} cumpleaños del documento «Cumpleaños Yanko Principal». Después puedes corregir lo que haga falta.</div>
              <button disabled={ocupado} onClick={cargarSemilla} style={boton(true)}>{ocupado ? "Cargando…" : `Cargar los ${SEMILLA.length} cumpleaños`}</button>
            </div>
          ) : null}
          {sinDia.length ? (
            <div style={{ background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
              {sinDia.length === 1 ? "1 persona sin día" : `${sinDia.length} personas sin día`} ({sinDia.map((x) => `${nombreBonito(x.nombre)}, ${MESES[Number(x.mes) - 1]?.toLowerCase() || "sin mes"}`).join("; ")}): completa el día con «Editar» para que se le avise. Hasta entonces no sale en los avisos.
            </div>
          ) : null}
          {puedeEditar ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
              <div><div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Nombre</div><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. MIDALYS APELLIDO" style={{ ...campo, width: 240 }} /></div>
              <div><div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Mes</div>
                <select value={nuevo.mes} onChange={(e) => setNuevo({ ...nuevo, mes: e.target.value })} style={campo}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
              <div><div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Día</div><input type="number" min="1" max="31" value={nuevo.dia} onChange={(e) => setNuevo({ ...nuevo, dia: e.target.value })} style={{ ...campo, width: 70 }} /></div>
              <button disabled={ocupado} onClick={agregar} style={boton(true)}>Agregar</button>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
            {MESES.map((m, i) => {
              const act = !t && mesSel === i + 1;
              return <button key={m} onClick={() => { setQ(""); setMesSel(i + 1); }} style={{ ...botonChico, background: act ? C.blueBg : C.white, borderColor: act ? C.blue : C.border, color: act ? C.blue : C.slate }}>{m.slice(0, 3)} ({cuantosPorMes(i + 1)})</button>;
            })}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar por nombre" style={{ ...campo, width: 180, marginLeft: "auto" }} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
              <thead><tr><th style={th}>Nombre</th>{t ? <th style={th}>Mes</th> : null}<th style={th}>Día</th><th style={{ ...th, textAlign: "right" }}> </th></tr></thead>
              <tbody>
                {!visibles.length ? <tr><td style={{ ...td, color: C.slate }} colSpan={4}>{t ? "Nadie con ese nombre." : `No hay cumpleaños en ${MESES[mesSel - 1].toLowerCase()}.`}</td></tr> : null}
                {visibles.map((x) => (editId === x.id ? (
                  <tr key={x.id}>
                    <td style={td}><input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} aria-label="Nombre" style={{ ...campo, width: "100%", minWidth: 160 }} /></td>
                    <td style={td} colSpan={t ? 2 : 1}>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <select value={edit.mes} onChange={(e) => setEdit({ ...edit, mes: e.target.value })} aria-label="Mes" style={campo}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                        <input type="number" min="1" max="31" value={edit.dia} onChange={(e) => setEdit({ ...edit, dia: e.target.value })} aria-label="Día" style={{ ...campo, width: 64 }} />
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button disabled={ocupado} onClick={() => guardarEdicion(x)} style={{ ...botonChico, background: C.ink, color: C.white, border: "none" }}>Guardar</button>{" "}
                      <button onClick={() => setEditId(null)} style={botonChico}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={x.id}>
                    <td style={td}>{nombreBonito(x.nombre)}</td>
                    {t ? <td style={td}>{MESES[Number(x.mes) - 1] || "—"}</td> : null}
                    <td style={td}>{diaValido(Number(x.mes), Number(x.dia)) ? x.dia : <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: C.amberBg, color: C.amber }}>Falta el día</span>}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {puedeEditar ? (quitarId === x.id ? (
                        <>
                          <span style={{ fontSize: 12, color: C.red, marginRight: 6 }}>¿Quitar a {nombreBonito(x.nombre)}?</span>
                          <button disabled={ocupado} onClick={() => quitar(x)} style={{ ...botonChico, background: C.red, color: C.white, border: "none" }}>Sí, quitar</button>{" "}
                          <button onClick={() => setQuitarId(null)} style={botonChico}>No</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => empezarEdicion(x)} style={botonChico}>Editar</button>{" "}
                          <button onClick={() => { setEditId(null); setQuitarId(x.id); }} style={botonChico}>Quitar</button>
                        </>
                      )) : null}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 10 }}>{todos.length} {todos.length === 1 ? "persona" : "personas"} en la lista. Solo se guardan día y mes (no el año).</div>
        </div>
      )}
    </div>
  );
}
