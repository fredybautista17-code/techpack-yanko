// ─── ¿CUBRO MIS COSTOS? (Tablero de Costos) ──────────────────────────────────
// (2026-11-04, a pedido de Fredy) Cierre mensual del centro de costo general:
//   · Recogido con los básicos: lo que dejan los lotes aprobados en el mes en Dado por Cumplido (base × cortadas + los dos
//     porcentajes), por categoría BASE.
//   · Por pagar fuera de los lotes: gastos del Excel (se cargan aquí cada mes) + nómina fiscal confirmada + lo que se pone
//     de más en destajo (solo las ayudas, de los cierres de Centro de Costo; los excedentes no se restan) + provisión de cesantías, prima, intereses
//     y vacaciones de esos trabajadores.
//   · A quién estamos ayudando: lista por trabajador con lo que produjo, lo que se le pagó y su provisión.
// Lo que producen los de destajo ya está dentro del costo del lote; por eso aquí solo entra la diferencia.
// Escribe solo en costos_gastos_mes (gastos cargados) y costos_cierres_mes (foto del cierre). Lo demás solo lo lee.
import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getApps } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useCentroCostoDatos, filasCorteVivo } from "./centro-costo-historico";
import { AREAS_HISTORICO, normTexto } from "./centro-costo-historico-parser";
import { ayudaQuincenasPorPersona } from "./ayuda-quincena";
import { mismoNombre } from "./corte-equipos";
import { unirPorAlias } from "./nombres-alias";
import { lineasDesdeBusint, fusionarBusint } from "./costos-gastos-busint";
import { cierreGeneral, parsearGastos, totalGastos, detalleLotes, detalleFiscal, AREAS_FUERA_DEFECTO, cuentaPorDefecto, TIPO_FISCAL, TIPO_FISCAL_DESTAJO, TIPO_PRESTACION, DESTAJO_AYUDA_FUERA_DEFECTO, DESTAJO_PROVISION_FUERA_DEFECTO } from "./costos-general-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE",
  blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n) || 0));
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.white };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const tdL = { ...td, textAlign: "left", fontWeight: 700 };
const thL = { ...th, textAlign: "left" };
const tabla = { width: "100%", borderCollapse: "collapse", background: C.white };
const caja = { overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, marginBottom: 22 };

function Tile({ titulo, valor, sub, color, fondo, onClick }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? "Clic para ver de dónde sale" : undefined}
      style={{ flex: "1 1 220px", background: fondo || C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", cursor: onClick ? "pointer" : "default" }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}{onClick ? " ▸" : ""}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || C.ink, marginTop: 4 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 12, color: C.slate, marginTop: 2, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}
function Boton({ onClick, children, disabled, primario }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, border: `1.5px solid ${primario ? C.ink : C.border}`, background: primario ? C.ink : C.white, color: primario ? C.white : C.ink }}
    >
      {children}
    </button>
  );
}
function Etiqueta({ valor }) {
  const ayuda = valor < 0;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: ayuda ? C.redBg : C.greenBg, color: ayuda ? C.red : C.green }}>
      {ayuda ? "Ayuda " : "Excedente "}{money(Math.abs(valor))}
    </span>
  );
}

// Ventana con el detalle de una cifra: tabla, buscador, total y Excel. Se cierra con la X, Esc o un clic afuera.
//   columnas: [{ k, label, izq?, suma?, ver?(fila) }]  ·  filas: objetos; si traen `abrir`, la fila abre otra ventana.
function Ventana({ titulo, sub, total, columnas, filas, nombreExcel, nota, vacio, onClose, onAbrir, accion }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const buscarEn = (f) => normTexto(columnas.map((c) => (typeof f[c.k] === "string" ? f[c.k] : "")).join(" "));
  const visibles = q ? filas.filter((f) => buscarEn(f).includes(normTexto(q))) : filas;
  const sumas = columnas.filter((c) => c.suma).map((c) => ({ k: c.k, v: visibles.reduce((s, f) => s + (f.sinSuma && f.sinSuma.includes(c.k) ? 0 : Number(f[c.k]) || 0), 0) }));
  async function bajarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const datos = visibles.map((f) => Object.fromEntries(columnas.map((c) => [c.label, c.excel ? c.excel(f) : (typeof f[c.k] === "number" ? Math.round(f[c.k]) : f[c.k] ?? "")])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Detalle");
    XLSX.writeFile(wb, `${nombreExcel || "Detalle"}.xlsx`);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.canvas, borderRadius: 14, width: "min(1100px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{titulo}</div>
            {sub ? <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, lineHeight: 1.5 }}>{sub}</div> : null}
          </div>
          {total !== undefined ? <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>{total}</div> : null}
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1, cursor: "pointer", color: C.slate }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 20px" }}>
          {filas.length > 6 ? <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, width: 220, fontFamily: "inherit" }} /> : null}
          {filas.length > 0 ? <Boton onClick={bajarExcel}>⬇ Excel</Boton> : null}
          {accion}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: C.slate }}>{visibles.length} {visibles.length === 1 ? "fila" : "filas"}</div>
        </div>
        <div style={{ overflow: "auto", padding: "0 20px 8px" }}>
          <div style={{ ...caja, marginBottom: 12 }}>
            <table style={tabla}>
              <thead><tr>{columnas.map((c) => <th key={c.k} style={{ ...(c.izq ? thL : th), ...(c.resalta ? { background: "#FFE9A8", color: "#7A5200" } : null) }}>{c.label}</th>)}</tr></thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={i} onClick={f.abrir ? () => onAbrir(f.abrir) : undefined} style={{ cursor: f.abrir ? "pointer" : "default", opacity: f.apagada ? 0.55 : 1 }}>
                    {columnas.map((c, j) => {
                      const v = c.ver ? c.ver(f) : (typeof f[c.k] === "number" ? money(f[c.k]) : f[c.k]);
                      return <td key={c.k} style={{ ...(c.izq ? (j === 0 ? tdL : { ...td, textAlign: "left" }) : td), ...(c.resalta ? { background: "#FFF4D6" } : null) }}>{j === 0 && f.abrir ? "▸ " : ""}{v}</td>;
                    })}
                  </tr>
                ))}
                {!visibles.length && <tr><td colSpan={columnas.length} style={{ ...td, textAlign: "left", color: C.slate }}>{vacio || "Sin filas para mostrar."}</td></tr>}
                {visibles.length > 0 && sumas.length > 0 && (
                  <tr style={{ background: C.canvas }}>
                    {columnas.map((c, j) => {
                      const sm = sumas.find((x) => x.k === c.k);
                      return <td key={c.k} style={{ ...(c.izq ? tdL : td), fontWeight: 800 }}>{j === 0 ? "Total" : sm ? (c.sumaFmt ? c.sumaFmt(sm.v) : money(sm.v)) : ""}</td>;
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {nota ? <div style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.6, marginBottom: 12 }}>{nota}</div> : null}
        </div>
      </div>
    </div>
  );
}

// Interruptor para decidir qué cuenta como estructura: verde = cuenta, rojo = no cuenta (ya va en el lote), ámbar = mixto (solo en áreas).
function Interruptor({ estado, onClick, titulo }) {
  const fondo = estado === "on" ? C.green : estado === "mixto" ? C.amber : C.red;
  const izq = estado === "on" ? 19 : estado === "mixto" ? 11 : 3;
  return (
    <button onClick={onClick} title={titulo} aria-label={titulo} style={{ width: 38, height: 22, borderRadius: 12, border: "none", background: fondo, position: "relative", cursor: "pointer", padding: 0, flex: "none" }}>
      <span style={{ position: "absolute", top: 3, left: izq, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </button>
  );
}
// Cifra que cuenta o no cuenta: apagada se ve tachada y gris con su valor completo.
const tachado = { textDecoration: "line-through", opacity: 0.55 };
function Cifra({ valor, bruto, cuenta }) {
  return cuenta ? money(valor) : <span style={tachado}>{money(bruto)}</span>;
}
function MarcaApagada({ estado, bruto }) {
  if (estado === "on" || !(bruto > 0)) return null;
  return <div style={{ fontSize: 10.5, fontWeight: 700, color: estado === "off" ? C.red : C.amber }}>{estado === "off" ? `No cuenta (${money(bruto)})` : "Cuenta una parte"}</div>;
}
const textoEstado = (e) => (e === "on" ? "Cuenta" : e === "off" ? "No cuenta" : "Parcial");
// Interruptores de Ayuda y Provisión de cada área de destajo (cual: "ayuda" | "provision" | undefined = los dos).
function ControlesArea({ areas, cual, onAlternar }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {areas.map((a) => (
        <div key={a.clave} style={{ display: "flex", alignItems: "center", gap: 10, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "5px 11px", fontSize: 12.5 }}>
          <b>{a.nombre}</b>
          {cual !== "provision" ? <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.slate }}>Ayuda<Interruptor estado={a.estadoAyuda} onClick={() => onAlternar("ayuda", a)} titulo={a.estadoAyuda === "on" ? `Que la ayuda de ${a.nombre} no cuente` : `Que la ayuda de ${a.nombre} cuente`} /></span> : null}
          {cual !== "ayuda" ? <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.slate }}>Provisión<Interruptor estado={a.estadoProvision} onClick={() => onAlternar("provision", a)} titulo={a.estadoProvision === "on" ? `Que la provisión de ${a.nombre} no cuente (ya va en el costo del lote)` : `Que la provisión de ${a.nombre} cuente`} /></span> : null}
        </div>
      ))}
    </div>
  );
}
const COLORES_AREA = ["#3D6B9E", "#9E5B8F", "#C47C1A", "#D2613A", "#2D9E6B", "#5B7FA8", "#8A6BB0", "#B5654A"];
const colorDeArea = (a) => COLORES_AREA[[...String(a)].reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLORES_AREA.length];
const iniciales = (n) => { const p = String(n || "").split(/\s+/).filter(Boolean); return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?"; };
const bonito = (n) => String(n || "").toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());

// Nómina fiscal del mes, persona por persona y agrupada por área; cada persona y cada área tiene su interruptor.
function VentanaFiscal({ mesTxt, ym, quincenas, resumen, filas, marcas, onArea, onPersona, msg, onClose }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const k = normTexto(q);
  const visibles = k ? filas.filter((f) => normTexto(`${f.nombre} ${f.area}`).includes(k)) : filas;
  const porArea = new Map();
  filas.forEach((f) => { if (!porArea.has(f.area)) porArea.set(f.area, []); porArea.get(f.area).push(f); });
  const grupos = [...porArea.entries()].map(([area, todas]) => {
    const cuentan = todas.filter((f) => f.cuenta).length;
    return { area, todas, personas: todas.filter((f) => visibles.includes(f)), cuentan, estado: cuentan === todas.length ? "on" : cuentan === 0 ? "off" : "mixto", suma: todas.filter((f) => f.cuenta).reduce((s, f) => s + f.costo, 0), total: todas.reduce((s, f) => s + f.costo, 0) };
  }).filter((g) => g.personas.length).sort((a, b) => b.suma - a.suma || b.total - a.total);
  const dentro = grupos.filter((g) => g.estado !== "off");
  const fuera = grupos.filter((g) => g.estado === "off");
  async function bajarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const datos = visibles.map((f) => ({ Trabajador: f.nombre, Área: f.area, Quincenas: f.quincenas.join(", "), Neto: Math.round(f.neto), "Seguridad social": Math.round(f.seguridad), Prestaciones: Math.round(f.prestaciones), "Costo total": Math.round(f.costo), Tipo: f.tipoNomina, Estado: f.cuenta ? "Cuenta" : "No cuenta", "Suma a la estructura": Math.round(f.costoCuenta) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Nómina fiscal");
    XLSX.writeFile(wb, `Nomina_fiscal_${ym}.xlsx`);
  }
  const mini = { width: 104, textAlign: "right", fontSize: 12.5, color: C.slate, whiteSpace: "nowrap" };
  const miniEt = { display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3, color: "#A0A0B5", marginBottom: 1 };
  const persona = (f, col) => (
    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${col}22`, color: col, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12.5, flex: "none", filter: f.cuenta ? "none" : "grayscale(1)", opacity: f.cuenta ? 1 : 0.6 }}>{iniciales(f.nombre)}</div>
      <div style={{ flex: 1, minWidth: 0, opacity: f.cuenta ? 1 : 0.6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bonito(f.nombre)}{f.tipoNomina && f.tipoNomina !== TIPO_FISCAL ? <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: f.tipoNomina === TIPO_FISCAL_DESTAJO ? "#EFE9F7" : C.blueBg, color: f.tipoNomina === TIPO_FISCAL_DESTAJO ? "#6B4C9A" : C.blue }}>{f.tipoNomina}</span> : null}</div>
        <div style={{ fontSize: 11.5, color: C.slate }}>{f.quincenas.length >= 2 ? "Quincenas 1 y 2" : f.quincenas.length === 1 ? `Quincena ${f.quincenas[0].slice(-1)}` : "—"}</div>
        {marcas && marcas.get(f.id) ? <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginTop: 2 }}>{marcas.get(f.id)}</div> : null}
      </div>
      <div style={{ ...mini, opacity: f.cuenta ? 1 : 0.6 }}><span style={miniEt}>Neto</span>{money(f.neto)}</div>
      <div style={{ ...mini, opacity: f.cuenta ? 1 : 0.6 }}><span style={miniEt}>Seg. social</span>{money(f.seguridad)}</div>
      <div style={{ ...mini, opacity: f.cuenta ? 1 : 0.6 }}><span style={miniEt}>Prestaciones</span>{money(f.prestaciones)}</div>
      <div style={{ width: 118, textAlign: "right", fontWeight: 800, fontSize: 15, color: C.ink, textDecoration: f.cuenta ? "none" : "line-through", opacity: f.cuenta ? 1 : 0.6 }}>{money(f.costo)}</div>
      <Interruptor estado={f.cuenta ? "on" : "off"} onClick={() => onPersona(f)} titulo={f.cuenta ? "Clic para sacarla: ya va dentro del lote" : "Clic para volver a contarla"} />
    </div>
  );
  const seccion = (g) => {
    const col = colorDeArea(g.area);
    return (
      <div key={g.area} style={{ background: g.estado === "off" ? "#FAF8F5" : C.white, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "#FBF9F6" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: g.estado === "off" ? "#9A9AB0" : col, flex: "none" }} />
          <b style={{ fontSize: 13.5, letterSpacing: 0.3 }}>{g.area}</b>
          <span style={{ fontSize: 12, color: C.slate }}>{g.todas.length} {g.todas.length === 1 ? "persona" : "personas"}</span>
          {g.estado === "off" ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.amber, background: C.amberBg, padding: "2px 9px", borderRadius: 12 }}>Ya va en el costo del lote</span> : null}
          <div style={{ flex: 1 }} />
          <span style={{ fontWeight: 800, fontSize: 14, textDecoration: g.estado === "off" ? "line-through" : "none" }}>{money(g.estado === "off" ? g.total : g.suma)}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: g.estado === "on" ? C.green : g.estado === "off" ? C.red : C.amber, minWidth: 88, textAlign: "right" }}>{g.estado === "on" ? "Cuenta" : g.estado === "off" ? "No cuenta" : `Cuenta ${g.cuentan} de ${g.todas.length}`}</span>
          <Interruptor estado={g.estado} onClick={() => onArea(g.area, g.todas)} titulo={g.estado === "on" ? "Apagar toda el área: ya va dentro del lote" : "Encender toda el área"} />
        </div>
        {g.personas.map((f) => persona(f, col))}
      </div>
    );
  };
  const stat = (titulo, valor, sub, color, fondo) => (
    <div style={{ flex: 1, background: fondo || C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.ink, marginTop: 3 }}>{valor}</div>
      <div style={{ fontSize: 11.5, color: C.slate }}>{sub}</div>
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.canvas, borderRadius: 18, width: "min(1180px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 26px 12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Nómina fiscal completa — {mesTxt}</div>
            <div style={{ fontSize: 12.5, color: C.slate, marginTop: 4, lineHeight: 1.5 }}>Liquidaciones confirmadas de Fiscal ({quincenas} de 2 quincenas), Fiscal Destajo y Prestación de Servicios. Costo para la empresa = neto + seguridad social + prestaciones (Prestación de Servicios: lo que se le paga). El interruptor decide si esa persona (o toda el área) cuenta como estructura. Arrancan apagados: las áreas con centro de costo (Fiscal Destajo) y toda la Prestación de Servicios (puede estar ya en el Excel de gastos).</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "transparent", fontSize: 26, lineHeight: 1, cursor: "pointer", color: C.slate }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 12, padding: "0 26px 14px", flexWrap: "wrap" }}>
          {stat("Suma a la estructura", money(resumen.total), `${resumen.personas} ${resumen.personas === 1 ? "persona" : "personas"} con el interruptor encendido`, C.amber, C.amberBg)}
          {stat("Ya va en el costo del lote", money(resumen.fuera.total), `${resumen.fuera.personas} ${resumen.fuera.personas === 1 ? "persona" : "personas"} · no suman`, C.green, C.greenBg)}
          {stat("Nómina fiscal total del mes", money(resumen.totalTodo), `${filas.length} personas`)}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "0 26px 12px" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o área…" style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, width: 240, fontFamily: "inherit" }} />
          {filas.length > 0 ? <Boton onClick={bajarExcel}>⬇ Excel</Boton> : null}
          {msg ? <span style={{ fontSize: 12, color: C.red }}>{msg}</span> : null}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: C.slate }}>{visibles.length} {visibles.length === 1 ? "persona" : "personas"}</div>
        </div>
        <div style={{ overflow: "auto", padding: "0 26px 20px" }}>
          {!filas.length ? <div style={{ fontSize: 13, color: C.slate, padding: "10px 2px" }}>No hay liquidaciones fiscales confirmadas este mes.</div> : null}
          {dentro.map(seccion)}
          {fuera.length ? (
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, margin: "16px 2px 10px", display: "flex", alignItems: "center", gap: 10 }}>
              Ya van dentro del costo del lote · no suman<span style={{ flex: 1, height: 1, background: C.border }} />
            </div>
          ) : null}
          {fuera.map(seccion)}
          <div style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.6 }}>
            Lo que decidas se guarda y vale para todos los meses. De quien quede fuera de un área con centro de costo solo cuenta lo que se le paga de más (ayuda) y su provisión, que salen de Centro de Costo (hoy MAQUILA no tiene cierre, así que no suma).
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CostosGeneralView({ db }) {
  const hoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000), []);
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth() + 1);
  const ym = `${anio}-${String(mes).padStart(2, "0")}`;
  const { cierresResueltos, datosArea, pedidos: pedidosCorte, trabajadoresCorte, cargando: cargandoCC } = useCentroCostoDatos(anio, "CORTE");

  const [recarga, setRecarga] = useState(0);
  const [areasFuera, setAreasFuera] = useState(AREAS_FUERA_DEFECTO);
  const [excepciones, setExcepciones] = useState({});
  // Interruptores de destajo: qué áreas/personas NO suman su ayuda o su provisión. CORTE arranca sin provisión (ya va en el costo del lote).
  const [destajoCfg, setDestajoCfg] = useState({ ayudaFuera: DESTAJO_AYUDA_FUERA_DEFECTO, provisionFuera: DESTAJO_PROVISION_FUERA_DEFECTO, ayudaExc: {}, provisionExc: {} });
  const [msgAreas, setMsgAreas] = useState("");
  const [equiposCorte, setEquiposCorte] = useState([]);
  // Nombres anteriores de los trabajadores de Corte (se guardan al renombrar en Admin Corte → Nómina).
  const [aliasCorte, setAliasCorte] = useState({});
  // Datos de Nómina para la «Ayuda por quincena»: liquidaciones de destajo, horas, producción y causación manual del mes.
  const [nominaQ, setNominaQ] = useState({ liquidaciones: [], horas: [], produccion: [], causaciones: [] });
  useEffect(() => {
    let vivo = true;
    getDoc(doc(db, "costos_config", "general"))
      .then((d) => {
        if (!vivo || !d.exists()) return;
        if (Array.isArray(d.data().areasFuera)) setAreasFuera(d.data().areasFuera);
        if (d.data().excepciones && typeof d.data().excepciones === "object") setExcepciones(d.data().excepciones);
        const g = d.data();
        const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
        setDestajoCfg((c) => ({
          ayudaFuera: Array.isArray(g.destajoAyudaFuera) ? g.destajoAyudaFuera : c.ayudaFuera,
          provisionFuera: Array.isArray(g.destajoProvisionFuera) ? g.destajoProvisionFuera : c.provisionFuera,
          ayudaExc: obj(g.destajoAyudaExc),
          provisionExc: obj(g.destajoProvisionExc),
        }));
      })
      .catch(() => {});
    // Equipos de Corte (quién es cortador, ayudante o apoyo): se arman en Corte → Centro de Costo.
    getDoc(doc(db, "costos_config", "corte_equipos"))
      .then((d) => { if (vivo && d.exists() && Array.isArray(d.data().miembros)) setEquiposCorte(d.data().miembros); })
      .catch(() => {});
    getDoc(doc(db, "corte_config", "main"))
      .then((d) => { if (vivo && d.exists() && d.data().nomina?.nombresAnteriores) setAliasCorte(d.data().nomina.nombresAnteriores); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [db]);
  async function guardarEleccion(nuevasAreas, nuevasExc) {
    setAreasFuera(nuevasAreas);
    setExcepciones(nuevasExc);
    setMsgAreas("");
    try { await setDoc(doc(db, "costos_config", "general"), { areasFuera: nuevasAreas, excepciones: nuevasExc, actualizadoEn: new Date().toISOString() }, { merge: true }); }
    catch (e) { setMsgAreas(`No se pudo guardar la elección: ${e?.message || e}`); }
  }
  // Interruptor del área: si todas sus personas cuentan la apaga; si no, la enciende. Borra las excepciones de sus personas
  // (menos las que, aun con el área encendida, arrancan apagadas por su tipo —Prestación de Servicios, Fiscal Destajo con centro de costo—: esas quedan encendidas con excepción).
  function alternarArea(area, personas) {
    const k = normTexto(area);
    const todasCuentan = personas.every((p) => p.cuenta);
    const sinArea = areasFuera.filter((a) => normTexto(a) !== k);
    const nuevasAreas = todasCuentan ? [...sinArea, area] : sinArea;
    const nuevasExc = { ...excepciones };
    personas.forEach((p) => {
      delete nuevasExc[p.id];
      if (!todasCuentan && !cuentaPorDefecto(p.area, nuevasAreas, p.tipoNomina)) nuevasExc[p.id] = true;
    });
    guardarEleccion(nuevasAreas, nuevasExc);
  }
  // Interruptor de una persona: guarda excepción solo si difiere de lo que diría su área y su tipo de nómina.
  function alternarPersona(p) {
    const deseada = !p.cuenta;
    const porDefecto = cuentaPorDefecto(p.area, areasFuera, p.tipoNomina);
    const nuevasExc = { ...excepciones };
    if (deseada === porDefecto) delete nuevasExc[p.id]; else nuevasExc[p.id] = deseada;
    guardarEleccion(areasFuera, nuevasExc);
  }
  async function guardarDestajo(nuevo) {
    setDestajoCfg(nuevo);
    setMsgAreas("");
    try { await setDoc(doc(db, "costos_config", "general"), { destajoAyudaFuera: nuevo.ayudaFuera, destajoProvisionFuera: nuevo.provisionFuera, destajoAyudaExc: nuevo.ayudaExc, destajoProvisionExc: nuevo.provisionExc, actualizadoEn: new Date().toISOString() }, { merge: true }); }
    catch (e) { setMsgAreas(`No se pudo guardar la elección: ${e?.message || e}`); }
  }
  // tipo: "ayuda" | "provision". Interruptor del área: si todo cuenta lo apaga; si no, lo enciende. Borra las excepciones de sus personas.
  function alternarAreaDestajo(tipo, a) {
    const kF = tipo === "ayuda" ? "ayudaFuera" : "provisionFuera";
    const kE = tipo === "ayuda" ? "ayudaExc" : "provisionExc";
    const estado = tipo === "ayuda" ? a.estadoAyuda : a.estadoProvision;
    const sinArea = destajoCfg[kF].filter((x) => normTexto(x) !== normTexto(a.clave));
    const exc = { ...destajoCfg[kE] };
    a.personas.forEach((p) => { delete exc[p.key]; });
    guardarDestajo({ ...destajoCfg, [kF]: estado === "on" ? [...sinArea, a.clave] : sinArea, [kE]: exc });
  }
  // Interruptor de una persona: guarda excepción solo si difiere de lo que diría su área.
  function alternarPersonaDestajo(tipo, p) {
    const kF = tipo === "ayuda" ? "ayudaFuera" : "provisionFuera";
    const kE = tipo === "ayuda" ? "ayudaExc" : "provisionExc";
    const actual = tipo === "ayuda" ? p.cuentaAyuda : p.cuentaProvision;
    const porArea = !destajoCfg[kF].some((x) => normTexto(x) === normTexto(p.claveArea));
    const exc = { ...destajoCfg[kE] };
    if (!actual === porArea) delete exc[p.key]; else exc[p.key] = !actual;
    guardarDestajo({ ...destajoCfg, [kE]: exc });
  }
  const [datos, setDatos] = useState({ cargando: true, error: "", lotes: [], bases: [], fichas: [], liqFiscal: [], liqFD: [], liqPS: [], gastosMes: null, gastosAnterior: null, cierreGuardado: null });
  const [gastosEdit, setGastosEdit] = useState(null);
  const [archivoGastos, setArchivoGastos] = useState("");
  const [msgGastos, setMsgGastos] = useState("");
  const [trayendo, setTrayendo] = useState(false);
  const [diagBusint, setDiagBusint] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [msgCierre, setMsgCierre] = useState("");
  const [busq, setBusq] = useState("");
  const [verGastos, setVerGastos] = useState(false);
  const [ventana, setVentana] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDatos((d) => ({ ...d, cargando: true, error: "" }));
    setGastosEdit(null);
    setArchivoGastos("");
    const inicio = new Date(Date.UTC(anio, mes - 1, 1, 5));
    const fin = new Date(Date.UTC(anio, mes, 1, 5));
    Promise.all([
      getDocs(query(collection(db, "dado_por_cumplido_lotes"), where("fechaAprobacion", ">=", inicio), where("fechaAprobacion", "<", fin))),
      getDocs(collection(db, "dado_por_cumplido_bases")),
      getDocs(collection(db, "nomina_trabajadores")),
      getDocs(query(collection(db, "nomina_fiscal_liquidaciones"), where("periodoId", ">=", `${ym}-Q1`), where("periodoId", "<=", `${ym}-Q2`))),
      getDocs(collection(db, "costos_gastos_mes")),
      getDocs(collection(db, "costos_cierres_mes")),
      // Fiscal Destajo y Prestación de Servicios se guardan en sus propias colecciones de Nómina.
      getDocs(query(collection(db, "nomina_fiscal_destajo_liquidaciones"), where("periodoId", ">=", `${ym}-Q1`), where("periodoId", "<=", `${ym}-Q2`))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, "nomina_prestacion_servicios_liquidaciones"), where("periodoId", ">=", `${ym}-Q1`), where("periodoId", "<=", `${ym}-Q2`))).catch(() => ({ docs: [] })),
    ])
      .then(([lotes, bases, fichas, liq, gastos, cierres, liqFD, liqPS]) => {
        if (!vivo) return;
        const gs = gastos.docs.map((d) => ({ ...d.data(), id: d.id }));
        const anteriores = gs.filter((g) => g.id < ym).sort((a, b) => (a.id < b.id ? 1 : -1));
        setDatos({
          cargando: false,
          error: "",
          lotes: lotes.docs.map((d) => ({ ...d.data(), id: d.id })).filter((l) => l.estado === "aprobado"),
          bases: bases.docs.map((d) => ({ ...d.data(), id: d.id })),
          fichas: fichas.docs.map((d) => ({ ...d.data(), id: d.id })),
          liqFiscal: liq.docs.map((d) => ({ ...d.data(), id: d.id })),
          liqFD: liqFD.docs.map((d) => ({ ...d.data(), id: d.id })),
          liqPS: liqPS.docs.map((d) => ({ ...d.data(), id: d.id })),
          gastosMes: gs.find((g) => g.id === ym) || null,
          gastosAnterior: anteriores[0] || null,
          cierreGuardado: cierres.docs.map((d) => ({ ...d.data(), id: d.id })).find((c) => c.id === ym) || null,
        });
      })
      .catch((e) => { if (vivo) setDatos((d) => ({ ...d, cargando: false, error: e?.message || "No se pudieron leer los datos." })); });
    return () => { vivo = false; };
  }, [db, anio, mes, ym, recarga]);

  useEffect(() => {
    let vivo = true;
    const ini = `${ym}-01`;
    const fin = `${ym}-31`;
    Promise.all([
      getDocs(query(collection(db, "nomina_destajo_liquidaciones"), where("periodoId", ">=", `${ym}-Q1`), where("periodoId", "<=", `${ym}-Q2`))),
      getDocs(query(collection(db, "nomina_horas"), where("fecha", ">=", ini), where("fecha", "<=", fin))),
      getDocs(query(collection(db, "nomina_produccion"), where("fecha", ">=", ini), where("fecha", "<=", fin))),
      getDocs(collection(db, "nomina_causacion_manual")),
    ])
      .then(([liq, hor, pro, cau]) => {
        if (!vivo) return;
        const f = (s) => s.docs.map((d) => ({ ...d.data(), id: d.id }));
        setNominaQ({ liquidaciones: f(liq), horas: f(hor), produccion: f(pro), causaciones: f(cau).filter((c) => String(c.id).includes(`__${ym}-Q`)) });
      })
      .catch(() => { if (vivo) setNominaQ({ liquidaciones: [], horas: [], produccion: [], causaciones: [] }); });
    return () => { vivo = false; };
  }, [db, ym]);

  const origenGastos = gastosEdit ? "edicion" : datos.gastosMes ? "guardado" : datos.gastosAnterior ? "anterior" : "ninguno";
  const lineasGastos = gastosEdit || datos.gastosMes?.lineas || datos.gastosAnterior?.lineas || [];

  // Misma regla de fuentes que el panel «Año» de Centro de Costo: histórico con prioridad > CORTE en vivo (cortes de ATLAS) > histórico > cierres diarios.
  const areasDestajo = useMemo(() => AREAS_HISTORICO.map((a) => {
    const r = cierresResueltos.get(`${a.clave}|${ym}`);
    const m = datosArea[a.clave]?.meses?.[mes];
    if (a.clave === "CORTE" && m?.fuente === "vivo") {
      const filas = filasCorteVivo(pedidosCorte, trabajadoresCorte, ym);
      if (filas.length) return { clave: a.clave, nombre: a.nombre, trabajadores: filas, dias: 0, fuente: "vivo" };
    }
    if (m?.fuente !== "historico" && r && r.trabajadores?.length) return { clave: a.clave, nombre: a.nombre, trabajadores: a.clave === "CORTE" ? unirPorAlias(r.trabajadores, aliasCorte) : r.trabajadores, dias: r.dias, fuente: "cierre" };
    if (m && (m.valor > 0 || m.costo > 0)) return { clave: a.clave, nombre: a.nombre, agregado: { valor: m.valor, costo: m.costo }, fuente: m.fuente };
    return null;
  }).filter(Boolean), [cierresResueltos, datosArea, ym, mes, aliasCorte, pedidosCorte, trabajadoresCorte]);

  // Toda la nómina que no es destajo puro, con su tipo: Fiscal, Fiscal Destajo y Prestación de Servicios.
  const liqTodas = useMemo(() => [
    ...datos.liqFiscal.map((l) => ({ ...l, tipoNomina: TIPO_FISCAL })),
    ...datos.liqFD.map((l) => ({ ...l, tipoNomina: TIPO_FISCAL_DESTAJO })),
    ...datos.liqPS.map((l) => ({ ...l, tipoNomina: TIPO_PRESTACION })),
  ], [datos.liqFiscal, datos.liqFD, datos.liqPS]);
  const r = useMemo(() => cierreGeneral({ lotes: datos.lotes, bases: datos.bases, gastos: lineasGastos, liquidacionesFiscal: liqTodas, areasDestajo, fichas: datos.fichas, areasFuera, excepciones, equiposCorte, destajoOpc: destajoCfg }), [datos, liqTodas, lineasGastos, areasDestajo, areasFuera, excepciones, equiposCorte, destajoCfg]);

  const ayudaQ = useMemo(
    () => ayudaQuincenasPorPersona(ym, r.destajo.personas, { fichas: datos.fichas, ...nominaQ }, hoy.toISOString().slice(0, 10)),
    [ym, r, datos.fichas, nominaQ, hoy]
  );

  // Personas que están en la nómina fiscal Y en un centro de costo (destajo): si la fiscal las cuenta, se suman en los dos lados.
  const filasFiscal = useMemo(() => detalleFiscal(liqTodas, datos.fichas, areasFuera, excepciones), [liqTodas, datos.fichas, areasFuera, excepciones]);
  const cruce = useMemo(() => {
    const porPersona = new Map();
    const marcas = new Map();
    r.destajo.personas.forEach((p) => {
      const f = filasFiscal.find((x) => x.id === p.id) || filasFiscal.find((x) => mismoNombre(x.nombre, p.nombre));
      if (!f) return;
      porPersona.set(p.id ?? p.nombre, f);
      marcas.set(f.id, `También en ${p.area} (centro de costo): ayuda y provisión ${money(p.extra)}${f.cuenta ? " — se suma en los dos lados" : " — aquí está apagada, cuenta solo en destajo"}`);
    });
    const cuentan = r.destajo.personas.filter((p) => porPersona.get(p.id ?? p.nombre)?.cuenta);
    return { porPersona, marcas, total: porPersona.size, cuentan: cuentan.length, dobles: cuentan.reduce((t, p) => t + p.extra, 0) };
  }, [r, filasFiscal]);
  const fiscalDePersona = cruce.porPersona;
  const marcasFiscal = cruce.marcas;

  function moverMes(d) {
    let m = mes + d;
    let a = anio;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMes(m);
    setAnio(a);
    setMsgGastos("");
    setMsgCierre("");
  }

  async function leerExcelGastos(file) {
    if (!file) return;
    setMsgGastos("Leyendo el archivo…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      let res = null;
      for (const nombre of wb.SheetNames) {
        const p = parsearGastos(XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null }));
        if (p.lineas.length) { res = p; break; }
        if (!res) res = p;
      }
      if (!res || !res.lineas.length) { setMsgGastos(res?.error || "No encontré gastos en el archivo."); return; }
      setGastosEdit(res.lineas);
      setArchivoGastos(file.name);
      setVerGastos(true);
      setMsgGastos(`Leí ${res.lineas.length} gastos de «${file.name}». Revísalos y pulsa «Guardar gastos de ${MESES[mes - 1].toLowerCase()}».`);
    } catch (e) {
      setMsgGastos(`No pude leer el archivo: ${e?.message || e}`);
    }
  }
  // (2026-11-10, a pedido de Fredy) Trae de Busint las compras del mes por concepto y proveedor y las deja como líneas de gastos.
  // Solo reemplaza las líneas que ya venían de Busint; las del Excel o a mano no se tocan. No guarda hasta pulsar «Guardar gastos».
  async function traerDeBusint() {
    setTrayendo(true);
    setDiagBusint(null);
    setMsgGastos("Consultando Busint… puede tardar un minuto.");
    try {
      const fx = getFunctions(getApps()[0]);
      const resp = (await httpsCallable(fx, "getGastosMesBusint")({ mes: ym })).data;
      if (!resp?.encontrada) {
        setDiagBusint(resp?.diagnostico || { mensaje: "Busint no devolvió datos." });
        setMsgGastos("No encontré la tabla de compras por concepto en Busint. Abajo está el diagnóstico para enviárselo a Claude.");
        return;
      }
      const [lista, porConcepto] = await Promise.all([
        getDocs(collection(db, "contabilidad_proyeccion_categorias_lista")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "contabilidad_proyeccion_categorias_concepto")).catch(() => ({ docs: [] })),
      ]);
      const r2 = lineasDesdeBusint(resp, {
        previas: [...(datos.gastosAnterior?.lineas || []), ...(datos.gastosMes?.lineas || [])],
        manuales: lineasGastos,
        categoriasLista: lista.docs.map((d) => ({ ...d.data(), id: d.id })),
        categoriasPorConcepto: porConcepto.docs.map((d) => ({ ...d.data(), codConcep: d.id })),
      });
      if (!r2.lineas.length) {
        setMsgGastos(resp.filasMes
          ? `Busint trajo ${resp.filasMes} compras de ${MESES[mes - 1].toLowerCase()} pero todas sumaron cero.`
          : `Busint no tiene compras de ${MESES[mes - 1].toLowerCase()} ${anio} en la tabla «${resp.tabla}» (sus fechas van de ${resp.fechasTabla?.desde || "—"} a ${resp.fechasTabla?.hasta || "—"}).`);
        return;
      }
      setGastosEdit(fusionarBusint(lineasGastos, r2.lineas));
      setVerGastos(true);
      const fuera = r2.lineas.filter((l) => !l.incluir).length;
      setMsgGastos(`Traje ${r2.lineas.length} conceptos de Busint (tabla «${resp.tabla}», ${resp.filasMes} compras del mes): ${r2.lineas.length - fuera} cuentan y ${fuera} quedaron fuera. ${r2.nuevos ? `${r2.nuevos} son nuevos: revísalos. ` : ""}Pulsa «Guardar gastos de ${MESES[mes - 1].toLowerCase()}» para dejarlos.`);
    } catch (e) {
      setMsgGastos(`No pude traer los gastos de Busint: ${e?.message || e}`);
    } finally {
      setTrayendo(false);
    }
  }
  function alternarGasto(i) {
    setGastosEdit(lineasGastos.map((l, k) => (k === i ? { ...l, incluir: !l.incluir } : l)));
  }
  async function guardarGastos() {
    setGuardando(true);
    setMsgGastos("");
    try {
      await setDoc(doc(db, "costos_gastos_mes", ym), { anio, mes, lineas: lineasGastos, archivo: archivoGastos || datos.gastosMes?.archivo || datos.gastosAnterior?.archivo || "", guardadoEn: new Date().toISOString() });
      setMsgGastos("Gastos guardados.");
      setRecarga((x) => x + 1);
    } catch (e) {
      setMsgGastos(`No se pudieron guardar: ${e?.message || e}`);
    } finally {
      setGuardando(false);
    }
  }
  async function cerrarMes() {
    setGuardando(true);
    setMsgCierre("");
    try {
      const limpio = (p) => ({ nombre: p.nombre, area: p.area, valor: Math.round(p.valor), costo: Math.round(p.costo), provision: Math.round(p.provision), cuentaAyuda: !!p.cuentaAyuda, cuentaProvision: !!p.cuentaProvision });
      await setDoc(doc(db, "costos_cierres_mes", ym), {
        anio, mes, guardadoEn: new Date().toISOString(), gastosOrigen: origenGastos, areasFueraDeNominaFiscal: areasFuera, excepcionesNominaFiscal: excepciones, destajoAyudaFuera: destajoCfg.ayudaFuera, destajoProvisionFuera: destajoCfg.provisionFuera, destajoAyudaExc: destajoCfg.ayudaExc, destajoProvisionExc: destajoCfg.provisionExc,
        resumen: {
          aporte: Math.round(r.recogido.aporte), basicos: Math.round(r.recogido.basicos), porcentajes: Math.round(r.recogido.porcentajes), lotes: r.recogido.lotes, cortadas: r.recogido.cortadas, despachadas: r.recogido.despachadas,
          gastos: Math.round(r.gastos.total), fiscal: Math.round(r.fiscal.total), fiscalFuera: Math.round(r.fiscal.fuera.total), fiscalPorTipo: r.fiscal.porTipo.map((t) => ({ tipo: t.tipo, total: Math.round(t.total), personas: t.personas, fueraTotal: Math.round(t.fueraTotal), fueraPersonas: t.fueraPersonas })), destajoAyudas: Math.round(r.destajo.ayudas), destajoExcedentes: Math.round(r.destajo.excedentes), destajoProvision: Math.round(r.destajo.provision), destajoAyudasTodas: Math.round(r.destajo.ayudasTodas), destajoProvisionTodas: Math.round(r.destajo.provisionTodas),
          estructura: Math.round(r.estructura), resultado: Math.round(r.resultado),
        },
        areas: r.destajo.areas.map((a) => ({ clave: a.clave, nombre: a.nombre, ayudas: Math.round(a.ayudas), ayudasTodas: Math.round(a.ayudasTodas), excedentes: Math.round(a.excedentes), provision: Math.round(a.provision), provisionTodas: Math.round(a.provisionTodas), cuentaAyuda: a.estadoAyuda, cuentaProvision: a.estadoProvision })),
        personas: r.destajo.personas.map(limpio),
      });
      setMsgCierre("Cierre del mes guardado.");
      setRecarga((x) => x + 1);
    } catch (e) {
      setMsgCierre(`No se pudo guardar el cierre: ${e?.message || e}`);
    } finally {
      setGuardando(false);
    }
  }

  // Qué muestra cada ventana (clic en una fila o tarjeta).
  function armarVentana(v) {
    const mesTxt = `${MESES[mes - 1]} ${anio}`;
    const cerrar = () => setVentana(null);
    const sinDetalle = r.destajo.areas.filter((a) => !a.detalle);
    const porEquipos = r.destajo.areas.filter((a) => a.porEquipos);
    const personasAyuda = r.destajo.personas.filter((p) => p.resultado < 0);
    if (v.tipo === "lotes") {
      const cat = v.categoria === undefined || v.categoria === null ? null : r.recogido.categorias.find((c) => c.id === v.categoria);
      const filas = detalleLotes(datos.lotes, datos.bases, v.categoria);
      return {
        titulo: cat ? `Lotes de ${cat.nombre} — ${mesTxt}` : `Lotes aprobados en ${mesTxt}`,
        sub: "Lotes aprobados por Contabilidad en Dado por Cumplido este mes. Aporte = base × cortadas + % sobre costo + % sobre venta.",
        total: money(filas.reduce((s, f) => s + f.aporte, 0)),
        columnas: [
          { k: "numLote", label: "Lote", izq: true }, { k: "referencia", label: "Referencia", izq: true }, { k: "cliente", label: "Cliente", izq: true }, { k: "categoria", label: "Categoría", izq: true },
          { k: "cortadas", label: "Cortadas", suma: true, ver: (f) => fmt(f.cortadas), sumaFmt: fmt }, { k: "despachadas", label: "Despachadas", suma: true, ver: (f) => fmt(f.despachadas), sumaFmt: fmt },
          { k: "basicos", label: "Básicos", suma: true }, { k: "porcentajes", label: "Porcentajes", suma: true }, { k: "aporte", label: "Aporte", suma: true },
        ],
        filas, nombreExcel: `Lotes_${ym}`, vacio: "Ningún lote aprobado en este mes.", onClose: cerrar,
      };
    }
    if (v.tipo === "gastos") {
      const filas = lineasGastos.map((l) => ({ estado: l.incluir ? "Incluido" : "Fuera", empresa: l.empresa, concepto: l.concepto, dia: l.dia || "", valor: Number(l.valor) || 0, nota: l.motivo || l.frecuencia || "", apagada: !l.incluir, incluido: l.incluir ? Number(l.valor) || 0 : 0 }));
      return {
        titulo: `Gastos — ${mesTxt}`,
        sub: origenGastos === "anterior" ? `Este mes no tiene gastos guardados: son los del último mes cargado (${datos.gastosAnterior?.id}).` : origenGastos === "ninguno" ? "Todavía no hay gastos cargados." : "Gastos del Excel de control de gastos y vencimientos. Los que están «Fuera» no suman.",
        total: money(r.gastos.total),
        columnas: [
          { k: "estado", label: "Estado", izq: true }, { k: "empresa", label: "Empresa", izq: true }, { k: "concepto", label: "Concepto", izq: true }, { k: "dia", label: "Día" },
          { k: "valor", label: "Valor mensual", ver: (f) => (f.valor > 0 ? money(f.valor) : "Por definir") }, { k: "incluido", label: "Cuenta", suma: true }, { k: "nota", label: "Nota", izq: true },
        ],
        filas, nombreExcel: `Gastos_${ym}`, vacio: "Sin gastos cargados. Usa «Cargar Excel de gastos».", onClose: cerrar,
        accion: <Boton onClick={() => { cerrar(); setVerGastos(true); }}>Ver y ajustar abajo</Boton>,
        nota: "Para cambiar qué gastos cuentan, usa las casillas de la sección «Gastos del mes».",
      };
    }
    const nada = { ayuda: 0, ayudaRaw: 0, ayudaCuenta: true, excedente: 0, provision: 0, provisionRaw: 0, provCuenta: true, cesantias: 0, cesantiasRaw: 0, prima: 0, primaRaw: 0, intereses: 0, interesesRaw: 0, vacaciones: 0, vacacionesRaw: 0 };
    const filasPersonas = (lista) => lista.map((p) => {
      const cp = p.cuentaProvision;
      return {
        ...nada, nombre: p.nombre, area: p.area, ayudaQ: p.porEquipos ? null : (ayudaQ.get(p.id)?.total ?? null),
        fiscalTxt: fiscalDePersona.has(p.id ?? p.nombre) ? (fiscalDePersona.get(p.id ?? p.nombre).cuenta ? "También en nómina fiscal · cuenta" : "En nómina fiscal · fuera") : "—", fiscalCuenta: !!fiscalDePersona.get(p.id ?? p.nombre)?.cuenta,
        valor: p.valor, costo: p.costo, ayuda: p.ayuda, ayudaRaw: p.ayudaRaw, ayudaCuenta: p.cuentaAyuda, excedente: Math.max(0, p.resultado),
        cesantias: cp ? p.cesantias : 0, cesantiasRaw: p.cesantias, prima: cp ? p.prima : 0, primaRaw: p.prima, intereses: cp ? p.intereses : 0, interesesRaw: p.intereses, vacaciones: cp ? p.vacaciones : 0, vacacionesRaw: p.vacaciones,
        provision: p.provisionCuenta, provisionRaw: p.provision, provCuenta: cp, extra: p.extra,
        swAyuda: p.porEquipos ? null : { estado: p.cuentaAyuda ? "on" : "off", onClick: () => alternarPersonaDestajo("ayuda", p) },
        swProv: { estado: cp ? "on" : "off", onClick: () => alternarPersonaDestajo("provision", p) },
      };
    });
    const filasAreaSinDetalle = (lista) => lista.map((a) => ({
      ...nada, nombre: `${a.nombre} (total del área, sin detalle por trabajador)`, area: a.nombre, valor: 0, costo: 0,
      ayuda: a.ayudas, ayudaRaw: a.ayudasTodas, ayudaCuenta: a.estadoAyuda !== "off", excedente: a.excedentes,
      provision: a.provision, provisionRaw: a.provisionTodas, provCuenta: a.estadoProvision !== "off", extra: a.ayudas + a.provision,
      swAyuda: { estado: a.estadoAyuda, onClick: () => alternarAreaDestajo("ayuda", a) }, swProv: { estado: a.estadoProvision, onClick: () => alternarAreaDestajo("provision", a) },
    }));
    const filasPorEquipos = (lista) => lista.map((a) => ({
      ...nada, nombre: `${a.nombre}: ayuda por equipos (los excedentes de los equipos ya se compensaron)`, area: a.nombre, valor: a.equipos.ingresoTotal, costo: a.equipos.costoTotal,
      ayuda: a.ayudas, ayudaRaw: a.ayudasTodas, ayudaCuenta: a.estadoAyuda !== "off", excedente: a.excedentes, extra: a.ayudas,
      // Produjo y Le pagamos de los equipos ya son la suma de las personas de abajo: se muestran pero no entran al Total.
      sinSuma: ["valor", "costo"],
      swAyuda: { estado: a.estadoAyuda, onClick: () => alternarAreaDestajo("ayuda", a) }, swProv: null,
    }));
    // Columnas con interruptor y cifras que se tachan cuando no cuentan.
    const colSw = (tipo) => {
      const campo = tipo === "ayuda" ? "swAyuda" : "swProv";
      return {
        k: campo, label: tipo === "ayuda" ? "¿Cuenta la ayuda?" : "¿Cuenta la provisión?",
        excel: (f) => (f[campo] ? textoEstado(f[campo].estado) : ""),
        ver: (f) => (f[campo] ? <Interruptor estado={f[campo].estado} onClick={f[campo].onClick} titulo={f[campo].estado === "on" ? "Clic para que no cuente" : "Clic para que cuente"} /> : <span style={{ fontSize: 11.5, color: C.slate }}>{tipo === "ayuda" ? "Por equipos" : "—"}</span>),
      };
    };
    const colAyuda = (label) => ({ k: "ayuda", label, suma: true, ver: (f) => <Cifra valor={f.ayuda} bruto={f.ayudaRaw} cuenta={f.ayudaCuenta} /> });
    const colProv = (k, label) => ({ k, label, suma: true, ver: (f) => <Cifra valor={f[k]} bruto={f[`${k}Raw`]} cuenta={f.provCuenta} /> });
    const colFiscal = { k: "fiscalTxt", label: "Nómina fiscal", izq: true, ver: (f) => (f.fiscalTxt ? <span style={{ color: f.fiscalCuenta ? C.amber : C.slate, fontWeight: f.fiscalCuenta ? 800 : 600 }}>{f.fiscalTxt}</span> : "") };
    const avisoApagado = "Lo que apagues no suma a «¿Cubro mis costos?»: se ve tachado con su valor completo. La elección se guarda y vale para todos los meses.";
    if (v.tipo === "ayudas") {
      const filas = [...filasPersonas(personasAyuda), ...filasAreaSinDetalle(sinDetalle.filter((a) => a.ayudasTodas > 0)), ...filasPorEquipos(porEquipos.filter((a) => a.ayudasTodas > 0))].sort((a, b) => b.ayudaRaw - a.ayudaRaw);
      return {
        titulo: `Destajo: ayudas — ${mesTxt}`,
        sub: "Personas a las que se les pagó más de lo que produjeron. Ayuda = le pagamos − produjo. Los excedentes no se restan.",
        total: money(r.destajo.ayudas),
        columnas: [
          { k: "nombre", label: "Trabajador", izq: true }, { k: "area", label: "Área", izq: true }, { k: "valor", label: "Produjo", suma: true }, { k: "costo", label: "Le pagamos", suma: true }, colAyuda("Ayuda"), colSw("ayuda"), colFiscal,
        ],
        filas, nombreExcel: `Destajo_ayudas_${ym}`, vacio: "Nadie recibió ayuda este mes (o aún no hay cierres de Centro de Costo).", onClose: cerrar,
        accion: <ControlesArea areas={r.destajo.areas.filter((a) => a.ayudasTodas > 0)} cual="ayuda" onAlternar={alternarAreaDestajo} />,
        nota: `${avisoApagado}${msgAreas ? ` ${msgAreas}` : ""}`,
      };
    }
    if (v.tipo === "provision" || v.tipo === "area") {
      const delArea = v.tipo === "area";
      const lista = delArea ? r.destajo.personas.filter((p) => p.claveArea === v.clave) : r.destajo.personas;
      const areasSin = delArea ? sinDetalle.filter((a) => a.clave === v.clave) : sinDetalle;
      const filas = [...filasPersonas(lista), ...filasAreaSinDetalle(areasSin), ...(delArea ? filasPorEquipos(porEquipos.filter((a) => a.clave === v.clave)) : [])].sort((a, b) => (delArea ? (b.ayudaRaw + b.provisionRaw) - (a.ayudaRaw + a.provisionRaw) : b.provisionRaw - a.provisionRaw));
      const areaV = delArea ? r.destajo.areas.find((a) => a.clave === v.clave) : null;
      const nombreArea = areaV?.nombre || "";
      if (delArea) {
        return {
          titulo: `${nombreArea} — ${mesTxt}`,
          sub: "Cada trabajador del área: lo que produjo, lo que se le pagó, su ayuda o excedente y su provisión. Extra = ayuda del mes + provisión (solo lo que cuenta). «Ayuda por quincena (Nómina)» es la misma de Centro de Costo: cuenta las horas trabajadas y no netea entre quincenas; no se suma al extra.",
          total: money(filas.reduce((s, f) => s + f.extra, 0)),
          columnas: [
            { k: "nombre", label: "Trabajador", izq: true }, { k: "valor", label: "Produjo", suma: true }, { k: "costo", label: "Le pagamos", suma: true }, colAyuda("Ayuda del mes"), colSw("ayuda"), { k: "ayudaQ", label: "Ayuda por quincena (Nómina)", suma: true, resalta: true, ver: (f) => (f.ayudaQ == null ? "—" : money(f.ayudaQ)) }, { k: "excedente", label: "Excedente (no se resta)", suma: true }, colProv("provision", "Provisión"), colSw("provision"), { k: "extra", label: "Extra total", suma: true }, colFiscal,
          ],
          filas, nombreExcel: `${nombreArea.replace(/ /g, "_")}_${ym}`, vacio: "Sin trabajadores para este mes.", onClose: cerrar,
          accion: areaV ? <ControlesArea areas={[areaV]} onAlternar={alternarAreaDestajo} /> : null,
          nota: `${avisoApagado} ${[...ayudaQ.values()].some((x) => x.enCurso) ? "La «Ayuda por quincena» solo cuenta quincenas ya terminadas; la que sigue en curso se suma cuando termine. «—» = persona que no es de destajo o que se mide por equipos." : "«—» = persona que no es de destajo o que se mide por equipos (Corte). Las quincenas sin liquidación confirmada usan la causación manual o el registro de producción."}${msgAreas ? ` ${msgAreas}` : ""}`,
        };
      }
      return {
        titulo: `Destajo: provisión — ${mesTxt}`,
        sub: "Cesantías, prima, intereses y vacaciones de los trabajadores de destajo, proporcional a lo pagado en el mes. Mismas tasas de Nómina.",
        total: money(r.destajo.provision),
        columnas: [
          { k: "nombre", label: "Trabajador", izq: true }, { k: "area", label: "Área", izq: true }, colProv("cesantias", "Cesantías"), colProv("prima", "Prima"), colProv("intereses", "Intereses"), colProv("vacaciones", "Vacaciones"), colProv("provision", "Provisión"), colSw("provision"), colFiscal,
        ],
        filas, nombreExcel: `Destajo_provision_${ym}`, vacio: "Sin trabajadores para este mes.", onClose: cerrar,
        accion: <ControlesArea areas={r.destajo.areas} cual="provision" onAlternar={alternarAreaDestajo} />,
        nota: `Destajo y Fiscal Destajo: cesantías y prima sobre sueldo + auxilio, intereses 12 % de las cesantías, vacaciones solo sobre el sueldo. CORTE arranca apagada porque su sueldo y prestaciones ya van en el costo del lote. ${avisoApagado}${msgAreas ? ` ${msgAreas}` : ""}`,
      };
    }
    // estructura: desglose de «Por pagar fuera de los lotes»
    const piezas = [
      { concepto: "Gastos del Excel", valor: r.gastos.total, abrir: { tipo: "gastos" } },
      { concepto: "Nómina fiscal completa", valor: r.fiscal.total, abrir: { tipo: "fiscal" } },
      { concepto: "Destajo: ayudas", valor: r.destajo.neta, abrir: { tipo: "ayudas" } },
      { concepto: "Destajo: provisión", valor: r.destajo.provision, abrir: { tipo: "provision" } },
    ].map((x) => ({ ...x, porc: r.estructura > 0 ? `${Math.round((x.valor / r.estructura) * 100)} %` : "—" }));
    return {
      titulo: `Por pagar fuera de los lotes — ${mesTxt}`,
      sub: "Haz clic en una fila para ver su detalle.",
      total: money(r.estructura),
      columnas: [{ k: "concepto", label: "Concepto", izq: true }, { k: "valor", label: "Valor del mes", suma: true }, { k: "porc", label: "% del total" }],
      filas: piezas, nombreExcel: `Por_pagar_${ym}`, onClose: cerrar,
    };
  }

  const personas = useMemo(() => {
    const q = normTexto(busq);
    return r.destajo.personas.filter((p) => !q || normTexto(p.nombre).includes(q) || normTexto(p.area).includes(q));
  }, [r, busq]);

  const alcanza = r.resultado >= 0;
  const sinDatos = r.recogido.lotes === 0 && r.estructura === 0;
  const quincenasFiscal = r.fiscal.quincenas.length;
  const sinDetalle = r.destajo.areas.filter((a) => !a.detalle);
  // «Ayuda por quincena (Nómina)» por área: suma de las personas de destajo del área (las de Corte por equipos no la llevan).
  const ayudaQAreas = new Map(r.destajo.areas.map((a) => {
    const v = a.porEquipos ? [] : a.personas.map((p) => ayudaQ.get(p.id)).filter(Boolean);
    return [a.clave, v.length ? v.reduce((t, x) => t + x.total, 0) : null];
  }));
  const ayudaQTotal = [...ayudaQAreas.values()].reduce((t, v) => t + (v || 0), 0);

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.6, maxWidth: 900 }}>
        ¿Lo que recogen los lotes con los básicos paga lo que está fuera del costo del lote? Lo que producen los trabajadores de destajo ya entra al lote; aquí solo se suman las ayudas (los excedentes no se restan, son montos extras) y su provisión de cesantías, prima, intereses y vacaciones.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <Boton onClick={() => moverMes(-1)}>‹</Boton>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, minWidth: 150, textAlign: "center" }}>{MESES[mes - 1]} {anio}</div>
        <Boton onClick={() => moverMes(1)}>›</Boton>
        <div style={{ flex: 1 }} />
        <Boton primario onClick={cerrarMes} disabled={guardando || datos.cargando || sinDatos}>💾 Cerrar el mes y guardar</Boton>
      </div>
      {msgCierre ? <div style={{ fontSize: 12.5, color: C.green, fontWeight: 700, marginBottom: 10 }}>{msgCierre}</div> : null}
      {datos.cierreGuardado ? (
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>
          Último cierre guardado: {String(datos.cierreGuardado.guardadoEn || "").slice(0, 10).split("-").reverse().join("/")} · resultado {money(datos.cierreGuardado.resumen?.resultado)}.
        </div>
      ) : null}
      {datos.error ? <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>{datos.error}</div> : null}
      {(datos.cargando || cargandoCC) ? <div style={{ fontSize: 13, color: C.slate, marginBottom: 14 }}>Leyendo lotes, nómina y cierres…</div> : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <Tile onClick={() => setVentana({ tipo: "lotes", categoria: null })} titulo="Recogido con los básicos" valor={money(r.recogido.aporte)} color={C.green} sub={`${r.recogido.lotes} lotes aprobados · ${fmt(r.recogido.cortadas)} prendas cortadas`} />
        <Tile onClick={() => setVentana({ tipo: "estructura" })} titulo="Por pagar fuera de los lotes" valor={money(r.estructura)} color={C.amber} sub="gastos + nómina fiscal + destajo (ayudas y provisión)" />
        <Tile
          titulo={alcanza ? "Me alcanza" : "Me falta"}
          valor={`${alcanza ? "+" : "−"}${money(Math.abs(r.resultado))}`}
          color={alcanza ? C.green : C.red}
          fondo={alcanza ? C.greenBg : C.redBg}
          sub={`${r.cobertura === null ? "—" : Math.round(r.cobertura)} % cubierto${!alcanza && r.prendasQueFaltan ? ` · faltan ≈ ${fmt(r.prendasQueFaltan)} prendas` : ""}`}
        />
        <Tile titulo="Punto de equilibrio" valor={r.prendasEquilibrio ? `${fmt(r.prendasEquilibrio)} und` : "—"} sub={r.aportePorPrenda ? `aporte por prenda ${money(r.aportePorPrenda)}` : "sin lotes aprobados en el mes"} />
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8 }}>1 · Lo que recogí con los básicos</div>
      <div style={caja}>
        <table style={tabla}>
          <thead><tr><th style={thL}>Categoría BASE</th><th style={th}>Lotes</th><th style={th}>Cortadas</th><th style={th}>Despachadas</th><th style={th}>Básicos</th><th style={th}>Porcentajes</th><th style={th}>Aporte</th></tr></thead>
          <tbody>
            {r.recogido.categorias.map((c) => (
              <tr key={c.id || "sin"} onClick={() => setVentana({ tipo: "lotes", categoria: c.id })} style={{ cursor: "pointer" }}><td style={tdL}>▸ {c.nombre}</td><td style={td}>{c.lotes}</td><td style={td}>{fmt(c.cortadas)}</td><td style={td}>{fmt(c.despachadas)}</td><td style={td}>{money(c.basicos)}</td><td style={td}>{money(c.porcentajes)}</td><td style={{ ...td, fontWeight: 800 }}>{money(c.aporte)}</td></tr>
            ))}
            {!r.recogido.categorias.length && <tr><td colSpan={7} style={{ ...td, textAlign: "left", color: C.slate }}>Ningún lote aprobado en Dado por Cumplido en este mes.</td></tr>}
            {r.recogido.categorias.length > 0 && (
              <tr onClick={() => setVentana({ tipo: "lotes", categoria: null })} style={{ background: C.canvas, cursor: "pointer" }}><td style={tdL}>▸ Total (ver todos los lotes)</td><td style={{ ...td, fontWeight: 800 }}>{r.recogido.lotes}</td><td style={{ ...td, fontWeight: 800 }}>{fmt(r.recogido.cortadas)}</td><td style={{ ...td, fontWeight: 800 }}>{fmt(r.recogido.despachadas)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.recogido.basicos)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.recogido.porcentajes)}</td><td style={{ ...td, fontWeight: 800, color: C.green }}>{money(r.recogido.aporte)}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8 }}>2 · Lo que hay que pagar fuera de los lotes</div>
      <div style={caja}>
        <table style={tabla}>
          <thead><tr><th style={thL}>Concepto</th><th style={thL}>De dónde sale</th><th style={th}>Valor del mes</th></tr></thead>
          <tbody>
            <tr onClick={() => setVentana({ tipo: "gastos" })} style={{ cursor: "pointer" }}><td style={tdL}>▸ Gastos del Excel</td><td style={{ ...td, textAlign: "left", color: C.slate }}>{r.gastos.incluidas} gastos incluidos{r.gastos.excluidas ? ` · ${r.gastos.excluidas} fuera (${money(r.gastos.excluidoValor)})` : ""}{origenGastos === "anterior" ? " · del mes anterior" : origenGastos === "ninguno" ? " · sin cargar" : ""}</td><td style={td}>{money(r.gastos.total)}</td></tr>
            <tr onClick={() => setVentana({ tipo: "fiscal" })} style={{ cursor: "pointer" }}><td style={tdL}>▸ Nómina fiscal completa</td><td style={{ ...td, textAlign: "left", color: C.slate }}>{r.fiscal.personas} personas · {quincenasFiscal} de 2 quincenas confirmadas (neto + seguridad social + prestaciones){r.fiscal.porTipo.filter((t) => t.tipo !== TIPO_FISCAL && (t.personas || t.fueraPersonas)).map((t) => ` · ${t.tipo}: ${t.personas} ${money(t.total)}${t.fueraPersonas ? ` (${t.fueraPersonas} apagadas, ${money(t.fueraTotal)})` : ""}`).join("")}{r.fiscal.fuera.personas ? ` · ${r.fiscal.fuera.personas} ${r.fiscal.fuera.personas === 1 ? "persona" : "personas"} (${money(r.fiscal.fuera.total)}) apagadas: no suman` : ""}</td><td style={td}>{money(r.fiscal.total)}</td></tr>
            <tr onClick={() => setVentana({ tipo: "ayudas" })} style={{ cursor: "pointer" }}><td style={tdL}>▸ Destajo: ayudas</td><td style={{ ...td, textAlign: "left", color: C.slate }}>{r.destajo.areas.reduce((s, a) => s + (a.porEquipos ? 0 : a.ayudados), 0)} personas ayudadas{r.destajo.areas.some((a) => a.porEquipos) ? " + Corte medido por equipos" : ""} · los excedentes ({money(r.destajo.excedentes)}) no se restan</td><td style={td}>{money(r.destajo.neta)}</td></tr>
            <tr onClick={() => setVentana({ tipo: "provision" })} style={{ cursor: "pointer" }}><td style={tdL}>▸ Destajo: provisión</td><td style={{ ...td, textAlign: "left", color: C.slate }}>Cesantías, prima, intereses y vacaciones</td><td style={td}>{money(r.destajo.provision)}</td></tr>
            <tr style={{ background: C.canvas }}><td style={tdL}>Total por pagar</td><td style={td} /><td style={{ ...td, fontWeight: 800, color: C.amber }}>{money(r.estructura)}</td></tr>
          </tbody>
        </table>
      </div>

      {cruce.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: cruce.cuentan > 0 ? C.amberBg : C.canvas, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            {cruce.cuentan > 0
              ? <><b>{cruce.cuentan} {cruce.cuentan === 1 ? "persona está" : "personas están"} en nómina fiscal (contando) y en un centro de costo.</b> Su ayuda y su provisión ({money(cruce.dobles)}) se suman además de su costo fiscal. Revísalas con los interruptores de la nómina fiscal.</>
              : <>{cruce.total} {cruce.total === 1 ? "persona aparece" : "personas aparecen"} en nómina fiscal y en un centro de costo, pero en la fiscal están apagadas: cuentan una sola vez.</>}
          </div>
          <Boton onClick={() => setVentana({ tipo: "fiscal" })}>Revisar en nómina fiscal</Boton>
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8 }}>3 · Áreas de destajo: lo que pone la estructura</div>
      <div style={caja}>
        <table style={tabla}>
          <thead><tr><th style={thL}>Área</th><th style={th}>Personas ayudadas</th><th style={th}>Ayudas</th><th style={{ ...th, background: "#FFE9A8", color: "#7A5200" }}>Ayuda por quincena (Nómina)</th><th style={th}>Excedentes (no se restan)</th><th style={th}>Provisión</th><th style={th}>Extra que pone la estructura</th></tr></thead>
          <tbody>
            {r.destajo.areas.map((a) => (
              <tr key={a.clave} onClick={() => setVentana({ tipo: "area", clave: a.clave })} style={{ cursor: "pointer" }}><td style={tdL}>▸ {a.nombre}</td><td style={td}>{a.porEquipos ? "por equipos" : a.detalle ? `${a.ayudados} de ${a.total}` : "—"}</td><td style={{ ...td, color: C.red }}>{money(a.ayudas)}<MarcaApagada estado={a.estadoAyuda} bruto={a.ayudasTodas} /></td><td style={{ ...td, background: "#FFF4D6" }}>{ayudaQAreas.get(a.clave) == null ? "—" : money(ayudaQAreas.get(a.clave))}</td><td style={{ ...td, color: C.slate }}>{money(a.excedentes)}</td><td style={td}>{money(a.provision)}<MarcaApagada estado={a.estadoProvision} bruto={a.provisionTodas} /></td><td style={{ ...td, fontWeight: 800 }}>{money(a.extra)}</td></tr>
            ))}
            {!r.destajo.areas.length && <tr><td colSpan={7} style={{ ...td, textAlign: "left", color: C.slate }}>Todavía no hay cierres de Centro de Costo de este mes.</td></tr>}
            {r.destajo.areas.length > 0 && (
              <tr style={{ background: C.canvas }}><td style={tdL}>Total destajo</td><td style={td} /><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.ayudas)}</td><td style={{ ...td, fontWeight: 800, background: "#FFF4D6" }}>{money(ayudaQTotal)}</td><td style={{ ...td, fontWeight: 800, color: C.slate }}>{money(r.destajo.excedentes)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.provision)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.extra)}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8 }}>4 · A quién estamos ayudando este mes</div>
      <input value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="Buscar trabajador o área…" style={{ padding: "8px 11px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, marginBottom: 8, width: 260, fontFamily: "inherit" }} />
      <div style={caja}>
        <table style={tabla}>
          <thead><tr><th style={thL}>Trabajador</th><th style={thL}>Área</th><th style={th}>Produjo</th><th style={th}>Le pagamos</th><th style={th}>Resultado</th><th style={th}>Provisión del mes</th><th style={th}>Extra total</th></tr></thead>
          <tbody>
            {personas.map((p) => (
              <tr key={`${p.claveArea}|${p.id}`}>
                <td style={tdL}>{p.nombre}{p.sinFicha ? <span title="No encontré su ficha en Nómina; la provisión se calculó con el mínimo" style={{ color: C.amber }}> *</span> : null}</td>
                <td style={{ ...td, textAlign: "left" }}>{p.area}</td>
                <td style={{ ...td, color: C.green }}>{money(p.valor)}</td>
                <td style={{ ...td, color: C.amber }}>{money(p.costo)}</td>
                <td style={td}>{p.porEquipos ? <span style={{ fontSize: 12, color: C.slate }}>Se mide por equipos</span> : <Etiqueta valor={p.resultado} />}{!p.porEquipos && p.resultado < 0 && !p.cuentaAyuda ? <span style={{ fontSize: 11, color: C.slate, marginLeft: 6 }}>(ayuda no cuenta)</span> : null}</td>
                <td style={td}><Cifra valor={p.provisionCuenta} bruto={p.provision} cuenta={p.cuentaProvision} /></td>
                <td style={{ ...td, fontWeight: 800 }}>{money(p.extra)}</td>
              </tr>
            ))}
            {!personas.length && <tr><td colSpan={7} style={{ ...td, textAlign: "left", color: C.slate }}>Sin trabajadores para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 22, lineHeight: 1.6 }}>
        Resultado = lo que produjo − lo que se le pagó (excedente si es positivo, ayuda si es negativo). Extra total = su ayuda (si la hay) + su provisión; los excedentes no se restan porque son montos extras. La provisión usa las mismas tasas de Nómina (cesantías y prima 8,33 %, intereses 12 % de las cesantías, vacaciones 4,17 %) y se proporciona a lo pagado en el mes. * = sin ficha en Nómina: se usó el mínimo legal.
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        5 · Gastos del mes
        <Boton onClick={() => setVerGastos((v) => !v)}>{verGastos ? "Ocultar" : `Ver y ajustar (${lineasGastos.length})`}</Boton>
        <label style={{ display: "inline-block" }}>
          <input type="file" accept=".xls,.xlsx" style={{ display: "none" }} onChange={(e) => { leerExcelGastos(e.target.files?.[0]); e.target.value = ""; }} />
          <span style={{ display: "inline-block", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}>📂 Cargar Excel de gastos</span>
        </label>
        <Boton onClick={traerDeBusint} disabled={trayendo}>{trayendo ? "Consultando Busint…" : "📥 Traer de Busint"}</Boton>
        {(gastosEdit || origenGastos === "anterior") ? <Boton primario onClick={guardarGastos} disabled={guardando || !lineasGastos.length}>Guardar gastos de {MESES[mes - 1].toLowerCase()}</Boton> : null}
      </div>
      {msgGastos ? <div style={{ fontSize: 12.5, color: C.blue, fontWeight: 700, marginBottom: 8 }}>{msgGastos}</div> : null}
      {diagBusint ? (
        <div style={{ background: C.amberBg, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.amber, marginBottom: 10 }}>
          <div style={{ marginBottom: 6 }}>{diagBusint.mensaje || "Sin detalle."} Probé {diagBusint.tablasProbadas?.length || 0} tablas de las {diagBusint.tablasDeLaApi || 0} de la API.</div>
          <Boton onClick={() => { const t = JSON.stringify(diagBusint, null, 2); try { navigator.clipboard.writeText(t); setMsgGastos("Diagnóstico copiado: pégalo en el chat con Claude."); } catch { setMsgGastos("No pude copiar; selecciona el texto de abajo."); } }}>📋 Copiar diagnóstico para Claude</Boton>
          <textarea readOnly value={JSON.stringify(diagBusint, null, 2)} style={{ width: "100%", height: 90, marginTop: 8, fontSize: 11, fontFamily: "monospace", boxSizing: "border-box" }} />
        </div>
      ) : null}
      {origenGastos === "anterior" ? (
        <div style={{ background: C.amberBg, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.amber, marginBottom: 10 }}>
          Este mes no tiene gastos guardados: se están usando los del último mes cargado ({datos.gastosAnterior?.id}). Carga el Excel del mes o pulsa «Guardar gastos» para dejar estos.
        </div>
      ) : null}
      {origenGastos === "ninguno" ? (
        <div style={{ background: C.amberBg, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.amber, marginBottom: 10 }}>
          Todavía no hay gastos cargados. Sube el Excel «Control de gastos y vencimientos» y revisa qué se incluye.
        </div>
      ) : null}
      {verGastos && lineasGastos.length > 0 ? (
        <div style={caja}>
          <table style={tabla}>
            <thead><tr><th style={th}>Incluir</th><th style={thL}>Empresa</th><th style={thL}>Concepto</th><th style={th}>Día</th><th style={th}>Valor mensual</th><th style={thL}>Nota</th></tr></thead>
            <tbody>
              {lineasGastos.map((l, i) => (
                <tr key={i} style={{ opacity: l.incluir ? 1 : 0.55 }}>
                  <td style={td}><input type="checkbox" checked={!!l.incluir} onChange={() => alternarGasto(i)} /></td>
                  <td style={{ ...td, textAlign: "left" }}>{l.empresa}</td>
                  <td style={tdL}>{l.concepto}</td>
                  <td style={td}>{l.dia || "—"}</td>
                  <td style={td}>{l.valor > 0 ? money(l.valor) : <span style={{ color: C.amber }}>Por definir</span>}</td>
                  <td style={{ ...td, textAlign: "left", color: C.slate }}>{l.origen === "busint" ? <span style={{ background: C.blueBg, color: C.blue, borderRadius: 6, padding: "1px 6px", fontSize: 11, fontWeight: 700, marginRight: 6 }}>Busint</span> : null}{l.motivo || l.frecuencia}</td>
                </tr>
              ))}
              <tr style={{ background: C.canvas }}><td style={td} /><td style={tdL} colSpan={3}>Total incluido ({totalGastos(lineasGastos).incluidas})</td><td style={{ ...td, fontWeight: 800 }}>{money(totalGastos(lineasGastos).total)}</td><td style={td} /></tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <div style={{ background: C.amberBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", fontSize: 12.5, color: C.amber, lineHeight: 1.6 }}>
        Antes de decidir con estas cifras: {quincenasFiscal < 2 ? `la nómina fiscal solo tiene ${quincenasFiscal} de 2 quincenas confirmadas este mes; ` : ""}
        {sinDetalle.length ? `${sinDetalle.map((a) => a.nombre).join(", ")} sin detalle por trabajador (se usó el total del área); ` : ""}
        el aporte cuenta cuando Contabilidad aprueba el lote en Dado por Cumplido; Confección y Terminación todavía no tienen cierre de ayuda; Prestación de Servicios aparece en la nómina fiscal pero apagada: enciéndela solo si esos pagos no están ya en los gastos del Excel.
      </div>
      {ventana?.tipo === "fiscal" ? (
        <VentanaFiscal
          mesTxt={`${MESES[mes - 1]} ${anio}`} ym={ym} quincenas={quincenasFiscal} resumen={r.fiscal}
          filas={filasFiscal} marcas={marcasFiscal}
          onArea={alternarArea} onPersona={alternarPersona} msg={msgAreas} onClose={() => setVentana(null)}
        />
      ) : ventana ? <Ventana {...armarVentana(ventana)} onAbrir={setVentana} /> : null}
    </div>
  );
}
