// ─── PROYECCIÓN POR ÁREA — vista «Por pedido» (semáforo) ──────────────────────
// (2026-10-26, a pedido de Fredy) Cada pedido con su semáforo, las unidades que hay en cada etapa y, al abrirlo, sus
// referencias (lotes, área actual, listo proyectado, atraso). Cálculo en proyeccion-pedidos.js. Sin gráficas.
import React, { useMemo, useState } from "react";
import { ETAPAS } from "./proyeccion-pedidos";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", amber: "#C47C1A", amberBg: "#FDF5E6", blue: "#3D6B9E", blueBg: "#EBF1F7",
};
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const SEM = {
  3: { fg: C.red, bg: C.redBg, dot: "#E85D4A" },
  2: { fg: C.amber, bg: C.amberBg, dot: "#E8A33D" },
  1: { fg: C.slate, bg: C.canvas, dot: "#9A93A8" },
  0: { fg: C.green, bg: C.greenBg, dot: "#2D9E6B" },
};
function Semaforo({ rango, texto }) {
  const s = SEM[rango] || SEM[1];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, color: s.fg }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {texto}
    </span>
  );
}
function Etapas({ etapas, principal }) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {ETAPAS.map((e) => {
        const n = Math.round(Number(etapas[e.id]) || 0);
        const hay = n > 0;
        const esBpt = e.id === "bpt";
        const bg = !hay ? "#F1ECE6" : esBpt ? C.greenBg : C.blueBg;
        const fg = !hay ? "#9A93A8" : esBpt ? C.green : C.blue;
        return (
          <span key={e.id} style={{ minWidth: 56, padding: "4px 6px", borderRadius: 7, background: bg, color: fg, fontSize: 11, textAlign: "center", lineHeight: 1.25, boxShadow: e.id === principal ? `inset 0 0 0 1.5px ${esBpt ? C.green : C.blue}` : "none" }}>
            <b style={{ display: "block", fontSize: 12, color: hay ? C.ink : "#9A93A8", fontWeight: 800 }}>{fmt(n)}</b>
            {e.label}
          </span>
        );
      })}
    </span>
  );
}
function Chip({ activo, color, bg, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${activo ? color : "transparent"}`, background: bg, color, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
const th = { padding: "10px 12px", fontSize: 10.5, fontWeight: 800, color: C.seam, textAlign: "right", whiteSpace: "nowrap", background: C.ink, position: "sticky", top: 0, zIndex: 1, letterSpacing: 0.4 };
const td = { padding: "10px 12px", fontSize: 12.5, color: C.ink, textAlign: "right", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" };
const L = { textAlign: "left" };
const colorAtraso = (a) => (a === null || a === undefined ? C.slate : a > 0 ? C.red : a >= -2 ? C.amber : C.green);
const textoAtraso = (a) => (a === null || a === undefined ? "—" : a > 0 ? `+${a} d` : `${a} d`);

export default function PedidosSemaforoView({ pedidos }) {
  const [filtro, setFiltro] = useState("riesgo"); // riesgo | justo | ok | todos
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [verTodo, setVerTodo] = useState(false);
  const cuenta = useMemo(() => ({
    riesgo: pedidos.filter((p) => p.rango === 3).length,
    justo: pedidos.filter((p) => p.rango === 2).length,
    ok: pedidos.filter((p) => p.rango <= 1).length,
    todos: pedidos.length,
  }), [pedidos]);
  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos
      .filter((p) => (filtro === "riesgo" ? p.rango === 3 : filtro === "justo" ? p.rango === 2 : filtro === "ok" ? p.rango <= 1 : true))
      .filter((p) => !q || [p.pedido, p.cliente, ...p.refs.map((r) => `${r.ref} ${r.lotes.join(" ")}`)].join(" ").toLowerCase().includes(q));
  }, [pedidos, filtro, busqueda]);
  const visibles = verTodo ? filas : filas.slice(0, 80);
  function alternar(id) {
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>🚦 Pedidos: qué referencias hay que tener en cuenta para cumplir</div>
      <div style={{ fontSize: 12, color: C.slate, margin: "4px 0 12px", lineHeight: 1.5 }}>
        Cada pedido con su semáforo (la proyección contra su fecha de entrega), dónde está cada referencia y qué falta para que quede listo. Abre un pedido con la flecha para ver sus referencias.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <Chip activo={filtro === "riesgo"} color={C.red} bg={C.redBg} onClick={() => setFiltro("riesgo")}>🔴 Llegarían tarde ({cuenta.riesgo})</Chip>
        <Chip activo={filtro === "justo"} color={C.amber} bg={C.amberBg} onClick={() => setFiltro("justo")}>🟠 Justos ({cuenta.justo})</Chip>
        <Chip activo={filtro === "ok"} color={C.green} bg={C.greenBg} onClick={() => setFiltro("ok")}>🟢 A tiempo ({cuenta.ok})</Chip>
        <Chip activo={filtro === "todos"} color={C.ink} bg={C.white} onClick={() => setFiltro("todos")}>Todos ({cuenta.todos})</Chip>
        <input
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍  Pedido, referencia, lote, cliente…"
          style={{ flex: "1 1 240px", maxWidth: 360, marginLeft: "auto", padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }}
        />
      </div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxHeight: "65vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, ...L }}>SEMÁFORO</th>
              <th style={{ ...th, ...L }}>PEDIDO</th>
              <th style={{ ...th, ...L }}>CLIENTE</th>
              <th style={th}>ENTREGA</th>
              <th style={th}>UND</th>
              <th style={{ ...th, ...L }}>DÓNDE ESTÁ (UNIDADES POR ETAPA)</th>
              <th style={th}>LISTO PROYECTADO</th>
              <th style={th}>ATRASO</th>
              <th style={{ ...th, ...L }}>FALTA</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const abierto = abiertos.has(p.pedido);
              const s = SEM[p.listoTodo ? 0 : p.rango] || SEM[1];
              const dias = p.diasEntrega;
              return (
                <React.Fragment key={p.pedido || "sin-pedido"}>
                  <tr onClick={() => alternar(p.pedido)} style={{ cursor: "pointer", background: abierto ? C.canvas : C.white }}>
                    <td style={{ ...td, ...L }}><Semaforo rango={p.listoTodo ? 0 : p.rango} texto={p.estadoTxt} /></td>
                    <td style={{ ...td, ...L, fontWeight: 800 }}>{abierto ? "▾" : "▸"} Pedido {p.nombre}</td>
                    <td style={{ ...td, ...L, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{p.cliente}</td>
                    <td style={td}>
                      {p.entrega ? fmtFecha(p.entrega) : "—"}
                      {dias !== null && dias !== undefined && !p.listoTodo ? (
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: dias < 0 ? C.red : dias <= 7 ? C.amber : C.slate }}>{dias < 0 ? `venció hace ${-dias} d` : dias === 0 ? "hoy" : `en ${dias} días`}</div>
                      ) : null}
                    </td>
                    <td style={td}>{fmt(p.unidades)}</td>
                    <td style={{ ...td, ...L }}><Etapas etapas={p.etapas} principal={null} /></td>
                    <td style={td}>{p.listoTodo ? "Ya listo" : p.listoISO ? fmtFecha(p.listoISO) : "Fuera del horizonte"}</td>
                    <td style={{ ...td, fontWeight: 800, color: p.listoTodo ? C.slate : colorAtraso(p.atraso) }}>{p.listoTodo ? "—" : textoAtraso(p.atraso)}</td>
                    <td style={{ ...td, ...L, fontSize: 11.5, fontWeight: 700, color: s.fg }}>{p.faltaTxt}</td>
                  </tr>
                  {abierto ? (
                    <>
                      {p.refs.map((r) => (
                        <tr key={`${p.pedido}|${r.ref}`} style={{ background: C.canvas }}>
                          <td style={{ ...td, ...L, paddingLeft: 30 }}><Semaforo rango={r.rango} texto={r.estadoTxt} /></td>
                          <td style={{ ...td, ...L }} colSpan={2}>
                            <b>{r.ref || "(sin referencia)"}</b>
                            <span style={{ color: C.slate }}>{r.lotes.length ? `  · ${r.lotes.length === 1 ? "lote" : "lotes"} ${r.lotes.join(", ")}` : "  · sin cortar"}</span>
                          </td>
                          <td style={td}>{r.areaActual}</td>
                          <td style={td}>{fmt(r.unidades)}</td>
                          <td style={{ ...td, ...L }}><Etapas etapas={r.etapas} principal={r.etapa} /></td>
                          <td style={td}>{r.listoTodo ? "Ya listo" : r.listoISO ? fmtFecha(r.listoISO) : "Fuera del horizonte"}</td>
                          <td style={{ ...td, fontWeight: 800, color: r.listoTodo ? C.slate : colorAtraso(r.atraso) }}>{r.listoTodo ? "—" : textoAtraso(r.atraso)}</td>
                          <td style={{ ...td, ...L, fontSize: 11.5, color: C.amber, fontWeight: 700 }}>{r.bloqueadas > 0.5 ? `${fmt(r.bloqueadas)} und esperan material${r.materialDesde ? ` hasta ${fmtFecha(r.materialDesde).slice(0, 5)}` : ""}` : ""}</td>
                        </tr>
                      ))}
                    </>
                  ) : null}
                </React.Fragment>
              );
            })}
            {!filas.length ? (
              <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: C.slate, padding: 24 }}>No hay pedidos con este filtro.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {filas.length > 80 && !verTodo ? (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setVerTodo(true)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.canvas, color: C.ink, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Ver los {filas.length} pedidos</button>
        </div>
      ) : null}
      <div style={{ fontSize: 11, color: C.slate, marginTop: 10, lineHeight: 1.6 }}>
        Etapas: Sin cortar → Corte/BMP → Planta (Confección) → Semiterminado/proceso → BPT (listo). El recuadro marca dónde está la mayor parte de cada referencia. El color del pedido es el de su referencia más atrasada;
        «Listo proyectado» es cuando quedaría terminada su última referencia con la capacidad de cada área. Solo aparecen los pedidos y referencias que están en la carga de Busint (un lote ya despachado del todo puede no contarse).
        «Sin cortar» y «esperan material» salen al activar «Incluir lo que falta por cortar» y las revisiones de insumos.
      </div>
    </div>
  );
}
