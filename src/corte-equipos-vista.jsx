// ─── EQUIPOS DE CORTE — pantalla ─────────────────────────────────────────────
// (2026-11-04, a pedido de Fredy) Se muestra encima de la tabla de cortadores del Centro de Costo de Corte.
// Cortador + su ayudante forman un equipo; los excedentes de los equipos se suman y cubren a la persona de apoyo
// (marras y segundas); lo que quede sin cubrir es la ayuda general de Corte. Quién es quién se guarda en
// costos_config/corte_equipos. No toca nada más: solo lee `filas` (lo que ya calcula la pantalla) y escribe esa configuración.
import React, { useState, useEffect, useMemo } from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { calcularEquiposCorte, ROLES_EQUIPO, mismoNombre } from "./corte-equipos";

const K = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n) || 0));
const signo = (n) => (Number(n) < 0 ? "−" : "+") + "$" + fmt(Math.abs(Number(n) || 0));
const bonito = (n) => String(n || "").toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
const corto = (n) => bonito(n).split(/\s+/).slice(0, 2).join(" ");

function Tarjeta({ titulo, valor, sub, color, fondo }) {
  return (
    <div style={{ flex: "1 1 200px", background: fondo || K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: K.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || K.ink, marginTop: 3 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11.5, color: K.slate, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
function Linea({ texto, valor, color, fuerte }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "3px 0", color: K.slate }}>
      <span>{texto}</span>
      <b style={{ color: color || K.ink, fontWeight: fuerte ? 800 : 700, whiteSpace: "nowrap" }}>{valor}</b>
    </div>
  );
}
const caja = { flex: "1 1 320px", background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px" };
const cabCaja = { fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: K.slate, marginBottom: 6 };
const tot = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, fontWeight: 800, borderTop: `1px solid ${K.border}`, marginTop: 6, paddingTop: 7 };
const sel = { padding: "6px 8px", border: `1.5px solid ${K.border}`, borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", background: K.white, color: K.ink };
const btn = (primario, off) => ({ padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: off ? "default" : "pointer", opacity: off ? 0.55 : 1, border: `1.5px solid ${primario ? K.ink : K.border}`, background: primario ? K.ink : K.white, color: primario ? K.white : K.ink });

export default function EquiposCorteVista({ db, filas }) {
  const [miembros, setMiembros] = useState(null); // null = leyendo
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "costos_config", "corte_equipos"), (d) => setMiembros(d.exists() && Array.isArray(d.data().miembros) ? d.data().miembros : []), () => setMiembros([]));
    return () => unsub();
  }, [db]);

  const r = useMemo(() => calcularEquiposCorte(filas, miembros || []), [filas, miembros]);

  function abrirEditor() {
    setBorrador((filas || []).map((f) => {
      const m = (miembros || []).find((x) => mismoNombre(x.nombre, f.nombre));
      return { nombre: f.nombre, rol: m?.rol || "", ayudanteDe: m?.ayudanteDe || "" };
    }));
    setMsg("");
    setEditando(true);
  }
  function cambiar(i, campo, valor) {
    setBorrador(borrador.map((b, k) => (k === i ? { ...b, [campo]: valor, ...(campo === "rol" && valor !== "ayudante" ? { ayudanteDe: "" } : {}) } : b)));
  }
  // Respaldo del estado anterior: el primero de cada día, solo si había roles. Nunca bloquea el guardado.
  async function respaldarEquipos(previos) {
    try {
      if (!previos.length) return;
      const ref = doc(db, "costos_config", `respaldo_corte_equipos_${new Date().toISOString().slice(0, 10)}`);
      if ((await getDoc(ref)).exists()) return;
      await setDoc(ref, { miembros: previos, respaldoEn: new Date().toISOString() });
    } catch (e) {
      console.warn("No se pudo guardar el respaldo de los equipos de Corte", e);
    }
  }
  async function guardar() {
    setGuardando(true);
    setMsg("");
    try {
      const limpio = borrador.filter((b) => b.rol).map((b) => ({ nombre: b.nombre, rol: b.rol, ...(b.rol === "ayudante" && b.ayudanteDe ? { ayudanteDe: b.ayudanteDe } : {}) }));
      // (2026-11-14) El editor solo lista a quien aparece hoy en pantalla (nómina de Corte). Si esa lista venía incompleta, guardar borraba los roles de
      // todos los demás. Ahora se conservan los roles de quien NO está en pantalla, y antes de guardar se deja un respaldo del día.
      const previos = Array.isArray(miembros) ? miembros : [];
      const ausentes = previos.filter((m) => !borrador.some((b) => mismoNombre(b.nombre, m.nombre)));
      await respaldarEquipos(previos);
      await setDoc(doc(db, "costos_config", "corte_equipos"), { miembros: [...limpio, ...ausentes], actualizadoEn: new Date().toISOString() });
      setEditando(false);
    } catch (e) {
      setMsg(`No se pudo guardar: ${e?.message || e}`);
    } finally {
      setGuardando(false);
    }
  }

  if (miembros === null || !(filas || []).length) return null;

  const cortadoresBorrador = borrador.filter((b) => b.rol === "cortador");
  const editor = editando ? (
    <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: K.ink, marginBottom: 4 }}>Armar los equipos de Corte</div>
      <div style={{ fontSize: 12.5, color: K.slate, lineHeight: 1.5, marginBottom: 10 }}>Elige qué es cada persona. A cada ayudante dile de qué cortador es. «Apoyo» es quien hace marras y segundas: lo cubre el excedente de los equipos. Lo que no tenga rol se mide solo. Se guarda y vale para todos los meses.</div>
      {borrador.map((b, i) => (
        <div key={b.nombre} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: i ? `1px solid ${K.border}` : "none" }}>
          <div style={{ flex: "1 1 220px", fontSize: 13, fontWeight: 700, color: K.ink }}>{bonito(b.nombre)}</div>
          <select value={b.rol} onChange={(e) => cambiar(i, "rol", e.target.value)} style={sel}>
            <option value="">Sin rol (se mide solo)</option>
            {ROLES_EQUIPO.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          {b.rol === "ayudante" ? (
            <select value={b.ayudanteDe} onChange={(e) => cambiar(i, "ayudanteDe", e.target.value)} style={sel}>
              <option value="">¿De qué cortador?</option>
              {cortadoresBorrador.map((c) => <option key={c.nombre} value={c.nombre}>{corto(c.nombre)}</option>)}
            </select>
          ) : null}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={guardar} disabled={guardando || !cortadoresBorrador.length} style={btn(true, guardando || !cortadoresBorrador.length)}>Guardar equipos</button>
        <button onClick={() => setEditando(false)} style={btn(false)}>Cancelar</button>
        {!cortadoresBorrador.length ? <span style={{ fontSize: 12, color: K.amber }}>Marca al menos un cortador.</span> : null}
        {msg ? <span style={{ fontSize: 12, color: K.red }}>{msg}</span> : null}
      </div>
    </div>
  ) : null;

  if (!r) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ background: K.canvas, border: `1px solid ${K.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: editando ? 12 : 0 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: K.ink }}>Equipos de Corte</div>
            <div style={{ fontSize: 12.5, color: K.slate, lineHeight: 1.5 }}>Mide a cada cortador con su ayudante y suma los excedentes para cubrir a quien hace marras y segundas, en vez de ver a los ayudantes en rojo.</div>
          </div>
          {!editando ? <button onClick={abrirEditor} style={btn(true)}>Armar equipos</button> : null}
        </div>
        {editor}
      </div>
    );
  }

  const haySobrante = r.resultadoGeneral >= 0;
  const apoyoResultado = r.apoyoIngreso + r.apoyoRecibe - r.apoyoCosto;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: K.ink }}>Equipo de Corte</div>
        <div style={{ flex: 1 }} />
        {!editando ? <button onClick={abrirEditor} style={btn(false)}>✎ Editar equipos</button> : null}
      </div>
      {editor}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <Tarjeta titulo="Ingreso del equipo" valor={money(r.ingresoTotal)} sub={`${fmt(r.unidadesTotal)} unidades cortadas`} />
        <Tarjeta titulo="Costo del equipo" valor={money(r.costoTotal)} sub={`${filas.length} personas`} />
        <Tarjeta titulo="Equipo cubierto" valor={r.cobertura === null ? "—" : `${r.cobertura.toFixed(1).replace(".", ",")} %`} color={haySobrante ? K.green : K.amber} fondo={haySobrante ? K.greenBg : K.amberBg} sub={haySobrante ? "cubre todo su costo" : `faltan ≈ ${fmt(r.unidadesQueFaltan)} unidades para cubrir todo`} />
        <Tarjeta titulo={haySobrante ? "Sobra" : "Falta por cubrir (ayuda de Corte)"} valor={money(haySobrante ? r.excedenteGeneral : r.ayudaGeneral)} color={haySobrante ? K.green : K.red} fondo={haySobrante ? K.greenBg : K.redBg} sub={haySobrante ? "los excedentes no se restan" : "es la que cuenta en «¿Cubro mis costos?»"} />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={caja}>
          <div style={cabCaja}>1 · Cortadores y ayudantes</div>
          {r.equipos.map((e, i) => (
            <Linea key={i} texto={`${corto(e.cortador.nombre)}${e.ayudantes.length ? ` + ${e.ayudantes.map((a) => corto(a.nombre)).join(" + ")}` : e.sinRol ? " (sin rol)" : ""}`} valor={signo(e.resultado)} color={e.resultado >= 0 ? K.green : K.red} />
          ))}
          <div style={tot}><span>Suma de excedentes</span><span style={{ color: r.excedenteEquipos >= 0 ? K.green : K.red }}>{signo(r.excedenteEquipos)}</span></div>
        </div>
        {r.apoyo.length ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 120px", textAlign: "center", fontSize: 12, fontWeight: 700, color: K.green, background: K.greenBg, borderRadius: 14, padding: 8, lineHeight: 1.4 }}>el excedente pasa a {r.apoyo.map((a) => corto(a.nombre).split(" ")[0]).join(" y ")} →</div>
            <div style={caja}>
              <div style={cabCaja}>2 · Apoyo (marras y segundas)</div>
              <Linea texto={`Lo que registró: ${fmt(r.apoyoUnidades)} piezas`} valor={money(r.apoyoIngreso)} />
              <Linea texto="Excedente que le llega" valor={signo(r.apoyoRecibe)} color={r.apoyoRecibe >= 0 ? K.green : K.red} />
              <Linea texto="Su sueldo" valor={`− ${money(r.apoyoCosto)}`} />
              <div style={tot}><span>{apoyoResultado >= 0 ? "Le sobra" : "Le falta (ayuda)"}</span><span style={{ color: apoyoResultado >= 0 ? K.green : K.red }}>{signo(apoyoResultado)}</span></div>
            </div>
          </>
        ) : null}
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${K.border}`, borderRadius: 14, background: K.white }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${K.border}` }}>
              {["Persona", "Unidades", "Ingreso", "Costo", "Resultado del equipo"].map((t, i) => <th key={t} style={{ textAlign: i ? "right" : "left", padding: "8px 10px", fontSize: 11, color: K.slate, textTransform: "uppercase" }}>{t}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.equipos.map((e, i) => (
              <React.Fragment key={i}>
                <tr style={{ borderBottom: `1px solid ${K.border}` }}>
                  <td style={{ padding: "9px 10px", fontWeight: 800, color: K.ink }}>{bonito(e.cortador.nombre)} <span style={{ fontSize: 11, fontWeight: 600, color: K.slate }}>· {e.sinRol ? "sin rol" : "cortador"}</span></td>
                  <td style={{ padding: "9px 10px", textAlign: "right" }}>{fmt(e.cortador.unidades)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: K.green, fontWeight: 700 }}>{money(e.cortador.ingreso)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: K.amber, fontWeight: 700 }}>{money(e.cortador.costo)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, color: e.resultado >= 0 ? K.green : K.red }} rowSpan={1 + e.ayudantes.length}>{signo(e.resultado)}</td>
                </tr>
                {e.ayudantes.map((a, j) => (
                  <tr key={j} style={{ borderBottom: `1px solid ${K.border}` }}>
                    <td style={{ padding: "8px 10px 8px 30px", color: K.slate }}>↳ {bonito(a.nombre)} <span style={{ fontSize: 11 }}>· ayudante</span></td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: K.slate }}>—</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: K.slate }}>{a.ingreso ? money(a.ingreso) : "—"}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: K.amber, fontWeight: 700 }}>{money(a.costo)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {r.apoyo.map((a, i) => (
              <tr key={`ap${i}`} style={{ borderBottom: `1px solid ${K.border}`, background: K.canvas }}>
                <td style={{ padding: "9px 10px", fontWeight: 800, color: K.ink }}>{bonito(a.nombre)} <span style={{ fontSize: 11, fontWeight: 600, color: K.slate }}>· apoyo (marras y segundas)</span></td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>{fmt(a.unidades)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: K.green, fontWeight: 700 }}>{money(a.ingreso)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", color: K.amber, fontWeight: 700 }}>{money(a.costo)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, color: apoyoResultado >= 0 ? K.green : K.red }}>{signo(apoyoResultado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: K.slate, lineHeight: 1.6, marginTop: 8 }}>
        Los ayudantes no cortan: su costo lo cubre lo que corta su cortador. Los excedentes de los equipos se suman y cubren a quien hace marras y segundas; lo que registre como cortes suma como ingreso. Lo que quede sin cubrir es la ayuda de Corte.
      </div>
    </div>
  );
}
