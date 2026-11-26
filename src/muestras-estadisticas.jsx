// ─── Cronograma de Muestras: pestañas «📈 Estadísticas» y «💲 Costos» ─────────────────────────────────────────────
// (2026-11-24, a pedido de Fredy; maquetas «estadisticas» y «costos».) El cálculo vive en muestras-calculo.js.
//  · EstadisticasMuestrasView: solo lectura, sale de `cronograma_muestras`.
//  · CostosMuestrasView: sueldos del personal de muestra, precio por muestra de talleres externos, presupuesto mensual por taller y lista de
//    pago. Se guarda en `centro_costo_muestras/main` y `centro_costo_muestras/pagos`. Solo administrador o quien tenga «costosMuestras».
import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import TarifaMuestrasCard from "./muestras-tarifa-vista";
import {
  estadisticasMuestras, costosDelMes, rangoPeriodo, isoLocal, mesAnterior, claveTexto, f10, costoPersona, conPrestaciones, pctDedicacion, resumenMesesMuestras, mesPorDefecto,
} from "./muestras-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#6B4FA0", violetBg: "#F1ECF8",
};
const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 16 };
const h2 = { margin: "0 0 4px", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.slate };
const nota = { fontSize: 12, color: C.slate, margin: "0 0 12px" };
const th = { textAlign: "left", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.slate, padding: "7px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "10px", borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.ink, verticalAlign: "middle" };
const sel = { padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.white, fontSize: 13, fontFamily: "inherit", color: C.ink };
const btnS = (on) => ({ padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${on ? C.ink : C.border}`, background: on ? C.ink : C.white, color: on ? C.white : C.slate, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" });
const btnG = { padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, color: C.ink, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" };
const btnD = { ...btnG, background: C.ink, borderColor: C.ink, color: C.white };

const money = (n) => (n === null || n === undefined || Number.isNaN(n) ? "—" : `$${Math.round(n).toLocaleString("es-CO")}`);
const num1 = (n) => (n === null || n === undefined ? "—" : n.toFixed(1).replace(".", ","));
const dias = (n) => (n === null || n === undefined ? "—" : `${num1(n)} d`);
const pctTxt = (n) => (n === null || n === undefined ? "—" : `${n}%`);
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesTxt = (m) => { const [y, mm] = m.split("-").map(Number); return `${MESES[mm - 1]} ${y}`; };
const fechaCorta = (iso) => (iso ? f10(iso).split("-").reverse().join("/") : "—");

function Barra({ valor, bueno = 60, medio = 0 }) {
  if (valor === null || valor === undefined) return <span style={{ color: C.slate }}>sin dato</span>;
  const col = valor >= bueno ? C.blue : valor >= medio && medio ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}>
      <div style={{ width: 90, height: 7, borderRadius: 5, background: C.border, overflow: "hidden", flex: "none" }}><div style={{ width: `${Math.min(100, valor)}%`, height: "100%", background: col }} /></div>
      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{valor}%</strong>
    </div>
  );
}
function Kpi({ label, valor, pie, colorPie, colorValor }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, color: colorValor || C.ink, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      {pie && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: colorPie || C.slate }}>{pie}</div>}
    </div>
  );
}
const deltaTxt = (a, b, unidad = "%") => {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const d = a - b;
  if (!d) return { t: "igual que el período anterior", c: C.slate };
  return { t: `${d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(d * 10) / 10)}${unidad === "%" ? " pts" : ""} vs. anterior`, c: d > 0 ? C.green : C.red };
};

// ─── ESTADÍSTICAS ──────────────────────────────────────────────────────────────────────────────────────────────────
function GraficaMeses({ meses }) {
  const max = Math.max(5, ...meses.flatMap((m) => [m.enviadas, m.aprobadas]));
  const paso = max <= 10 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : 20;
  const tope = Math.ceil(max / paso) * paso;
  const W = 560, H = 230, x0 = 40, x1 = 550, yB = 200, yT = 20;
  const esc = (v) => yB - (v / tope) * (yB - yT);
  const ancho = (x1 - x0) / meses.length;
  const bw = Math.min(30, ancho / 2 - 6);
  const marcas = []; for (let v = 0; v <= tope; v += paso) marcas.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Muestras enviadas y aprobadas por mes">
      {marcas.map((v) => (<g key={v}><line x1={x0} y1={esc(v)} x2={x1} y2={esc(v)} stroke={C.border} strokeWidth="1" /><text x={x0 - 6} y={esc(v) + 4} fontSize="11" fill={C.slate} textAnchor="end">{v}</text></g>))}
      {meses.map((m, i) => {
        const cx = x0 + ancho * i + ancho / 2;
        const [y, mm] = m.mes.split("-").map(Number);
        return (
          <g key={m.mes}>
            <rect x={cx - bw - 2} y={esc(m.enviadas)} width={bw} height={Math.max(0, yB - esc(m.enviadas))} rx="4" fill={C.blue} />
            <rect x={cx + 2} y={esc(m.aprobadas)} width={bw} height={Math.max(0, yB - esc(m.aprobadas))} rx="4" fill={C.green} />
            {m.enviadas > 0 && <text x={cx - bw / 2 - 2} y={esc(m.enviadas) - 5} fontSize="11" fontWeight="700" fill={C.ink} textAnchor="middle">{m.enviadas}</text>}
            {m.aprobadas > 0 && <text x={cx + bw / 2 + 2} y={esc(m.aprobadas) - 5} fontSize="11" fontWeight="700" fill={C.ink} textAnchor="middle">{m.aprobadas}</text>}
            <text x={cx} y={218} fontSize="11.5" fill={C.slate} textAnchor="middle">{MESES_CORTO[mm - 1]}{meses.length > 6 || mm === 1 ? ` ${String(y).slice(2)}` : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function EstadisticasMuestrasView({ muestras, responsablePorItem }) {
  const hoy = isoLocal(new Date());
  const [periodo, setPeriodo] = useState("6");
  const [taller, setTaller] = useState("");
  const [cliente, setCliente] = useState("");
  const [agrupar, setAgrupar] = useState("disenadora");
  const rango = rangoPeriodo(periodo, hoy);
  const r = useMemo(
    () => estadisticasMuestras(muestras, { desde: periodo === "todo" ? "" : rango.desde, hasta: rango.hasta, taller, cliente, hoy, responsablePorItem }),
    [muestras, periodo, taller, cliente, hoy, responsablePorItem]
  );
  const a = r.actual;
  const dEnv = r.anterior ? (a.enviadas - r.anterior.enviadas) : null;
  const dPrim = r.anterior ? deltaTxt(a.primeraPct, r.anterior.primeraPct) : null;
  const titulosGrupo = { disenadora: "Diseñadora", cliente: "Cliente", categoria: "Categoría" };
  const sinDato = { disenadora: "Sin diseñadora", cliente: "Sin cliente", categoria: "Sin categoría" }[agrupar];
  if (!(muestras || []).length) return <div style={{ ...card, textAlign: "center", color: C.slate }}>Todavía no hay muestras en el cronograma. Las estadísticas se arman solas cuando se envían muestras a taller.</div>;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {[["30", "30 días"], ["90", "90 días"], ["6", "6 meses"], ["todo", "Todo"]].map(([v, l]) => <button key={v} onClick={() => setPeriodo(v)} style={btnS(periodo === v)}>{l}</button>)}
        <span style={{ ...sel, color: C.slate }}>{fechaCorta(r.desde)} → {fechaCorta(r.hasta)}</span>
        <select value={taller} onChange={(e) => setTaller(e.target.value)} style={sel}><option value="">Todos los talleres</option>{r.talleres.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        {r.clientes.length > 1 && <select value={cliente} onChange={(e) => setCliente(e.target.value)} style={sel}><option value="">Todos los clientes</option>{r.clientes.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 18 }}>
        <Kpi label="ENVIADAS" valor={a.enviadas} pie={dEnv === null ? null : dEnv === 0 ? "igual que el período anterior" : `${dEnv > 0 ? "▲" : "▼"} ${Math.abs(dEnv)} vs. anterior`} colorPie={dEnv > 0 ? C.green : dEnv < 0 ? C.red : C.slate} />
        <Kpi label="ENTREGADAS POR EL TALLER" valor={a.terminadas} pie={a.enviadas ? `${Math.round((a.terminadas / a.enviadas) * 100)}% de las enviadas` : null} />
        <Kpi label="APROBADAS A LA 1.ª" valor={pctTxt(a.primeraPct)} pie={dPrim ? dPrim.t : `de ${a.primeraN} revisadas`} colorPie={dPrim ? dPrim.c : undefined} />
        <Kpi label="ENTREGADAS A TIEMPO" valor={pctTxt(a.aTiempoPct)} pie={`de ${a.conFechaEsperada} con fecha esperada`} />
        <Kpi label="ATRASO PROMEDIO" valor={dias(a.atrasoProm)} pie="solo las entregadas tarde" />
        <Kpi label="VENCIDAS AHORA" valor={r.atrasadas.length} colorValor={r.atrasadas.length ? C.red : C.ink} pie={`${r.enCurso} en curso`} />
      </div>

      <div style={card}>
        <h3 style={h2}>Por taller</h3>
        <p style={nota}>Cada muestra cuenta una vez. «A tiempo» compara la fecha de entrega esperada con la fecha en que el taller la entregó. «En curso» es lo que tiene hoy.</p>
        {!r.filasTaller.length ? <div style={{ color: C.slate, fontSize: 13 }}>No hay muestras en este período.</div> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Taller", "Enviadas", "En curso", "Entregadas a tiempo", "Atraso prom.", "Aprobadas a la 1.ª", "Días de entrega"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{r.filasTaller.map((f) => (
              <tr key={f.taller}>
                <td style={td}><strong>{f.taller}</strong>{r.mejor === f.taller && <span style={{ marginLeft: 8, padding: "2px 9px", borderRadius: 10, background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 800 }}>⭐ Mejor resultado</span>}</td>
                <td style={td}>{f.enviadas}</td><td style={td}>{f.enCurso}</td>
                <td style={td}><Barra valor={f.aTiempoPct} bueno={75} medio={50} /></td>
                <td style={td}>{dias(f.atrasoProm)}</td>
                <td style={td}><Barra valor={f.primeraPct} bueno={60} /></td>
                <td style={td}>{dias(f.diasEntregaProm)}</td>
              </tr>))}</tbody>
          </table></div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
        <div style={card}>
          <h3 style={h2}>Por mes</h3>
          <p style={nota}>Muestras enviadas contra aprobadas en cada mes.</p>
          <div style={{ display: "flex", gap: 16, fontSize: 12, fontWeight: 700, color: C.slate, marginBottom: 6 }}>
            <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: C.blue, marginRight: 6 }} />Enviadas</span>
            <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: C.green, marginRight: 6 }} />Aprobadas</span>
          </div>
          <GraficaMeses meses={r.meses} />
          <div style={{ fontSize: 11.5, color: C.slate }}>El mes en curso aún no termina. «Aprobadas» cuenta el mes en que Diseño aprobó la muestra.</div>
        </div>
        <div style={card}>
          <h3 style={h2}>Atrasadas hoy</h3>
          <p style={nota}>Las que ya pasaron su fecha de entrega y siguen en el taller, de más a menos días.</p>
          {!r.atrasadas.length ? <div style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>✓ No hay muestras atrasadas.</div> : (
            <div style={{ maxHeight: 330, overflowY: "auto" }}>{r.atrasadas.slice(0, 30).map((x) => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.red, minWidth: 46, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{x.dias} d</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.nombre}{x.referencia ? ` · ${x.referencia}` : ""}</div>
                  <div style={{ fontSize: 11.5, color: C.slate }}>{x.taller}{x.cliente ? ` · ${x.cliente}` : ""}{x.disenadora ? ` · ${x.disenadora}` : ""}</div>
                </div>
                <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 800, background: x.estado === "asignado" ? C.amberBg : "#EDEDF2", color: x.estado === "asignado" ? C.amber : C.slate }}>{x.estado === "asignado" ? "Asignado" : "Sin asignar"}</span>
              </div>))}
              {r.atrasadas.length > 30 && <div style={{ fontSize: 12, color: C.slate, paddingTop: 8 }}>… y {r.atrasadas.length - 30} más.</div>}
            </div>)}
        </div>
      </div>

      <div style={card}>
        <h3 style={h2}>Quién y qué se muestrea</h3>
        <div style={{ display: "flex", gap: 6, margin: "6px 0 10px" }}>
          {[["disenadora", "Por diseñadora"], ["cliente", "Por cliente"], ["categoria", "Por categoría"]].map(([v, l]) => <button key={v} onClick={() => setAgrupar(v)} style={{ ...btnS(agrupar === v), padding: "5px 12px", fontSize: 12 }}>{l}</button>)}
        </div>
        {!r.grupos[agrupar].length ? <div style={{ color: C.slate, fontSize: 13 }}>No hay muestras en este período.</div> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{[titulosGrupo[agrupar], "Muestras", "Aprobadas a la 1.ª", "A modificar", "Días hasta aprobar"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{r.grupos[agrupar].map((g) => (
              <tr key={g.nombre || "_"}><td style={td}><strong>{g.nombre || sinDato}</strong></td><td style={td}>{g.n}</td><td style={td}><Barra valor={g.primeraPct} bueno={60} /></td><td style={td}>{g.aModificar}</td><td style={td}>{dias(g.diasAprobar)}</td></tr>))}</tbody>
          </table></div>)}
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10 }}>«Días hasta aprobar» va desde el envío al taller hasta que Diseño la aprueba (incluye las rondas de modificación). La diseñadora sale del prototipo o referencia.</div>
      </div>
    </div>
  );
}

// ─── COSTOS ────────────────────────────────────────────────────────────────────────────────────────────────────────
const nuevoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function InputPesos({ valor, onGuardar, ancho = 130, placeholder = "$0" }) {
  const [txt, setTxt] = useState(null);
  const mostrado = txt !== null ? txt : (valor || valor === 0) && valor !== "" ? money(valor) : "";
  const termina = () => {
    if (txt === null) return;
    const n = Number(String(txt).replace(/[^\d]/g, ""));
    setTxt(null);
    if (String(txt).trim() === "") { if (valor) onGuardar(0); return; }
    if (n !== Number(valor)) onGuardar(n);
  };
  return <input value={mostrado} placeholder={placeholder} onFocus={(e) => { setTxt(valor ? String(valor) : ""); e.target.select(); }} onChange={(e) => setTxt(e.target.value)} onBlur={termina} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    style={{ width: ancho, padding: "6px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", textAlign: "right", fontVariantNumeric: "tabular-nums", background: C.white, color: C.ink }} />;
}
function InputTexto({ valor, onGuardar, ancho = 160, placeholder }) {
  const [txt, setTxt] = useState(null);
  return <input value={txt !== null ? txt : valor || ""} placeholder={placeholder} onFocus={() => setTxt(valor || "")} onChange={(e) => setTxt(e.target.value)} onBlur={() => { if (txt !== null && txt.trim() !== (valor || "")) onGuardar(txt.trim()); setTxt(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    style={{ width: ancho, padding: "6px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: C.white, color: C.ink }} />;
}

function TraerPersonalModal({ db, existentes, talleres, conPrestPorDefecto, onAgregar, onCerrar }) {
  const [lista, setLista] = useState(null);
  const [err, setErr] = useState("");
  const [marca, setMarca] = useState({});
  const [taller, setTaller] = useState(talleres[0] || "");
  const [q, setQ] = useState("");
  useEffect(() => {
    let vivo = true;
    getDocs(collection(db, "nomina_trabajadores")).then((snap) => {
      if (!vivo) return;
      const ya = new Set(existentes.map((n) => claveTexto(n)));
      const l = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((t) => t.activo !== false && t.nombre)
        .map((t) => ({ id: t.id, nombre: String(t.nombre).trim().toUpperCase(), area: String(t.area || "").trim(), sueldo: Number(t.sueldo) || 0, yaEsta: ya.has(claveTexto(t.nombre)) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      setLista(l);
    }).catch((e) => vivo && setErr(e?.message || "No se pudo leer Personal."));
    return () => { vivo = false; };
  }, [db]);
  const vis = (lista || []).filter((t) => !q || claveTexto(t.nombre + " " + t.area).includes(claveTexto(q)));
  const elegidos = (lista || []).filter((t) => marca[t.id] && !t.yaEsta);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCerrar}>
      <div style={{ background: C.white, borderRadius: 16, width: 640, maxWidth: "100%", maxHeight: "86vh", display: "flex", flexDirection: "column", padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><strong style={{ fontSize: 17 }}>↧ Traer desde Personal</strong><button onClick={onCerrar} style={{ ...btnG, padding: "4px 10px" }}>✕</button></div>
        <p style={nota}>Marca a quienes hacen muestras y elige su taller. Se copia el sueldo que tienen en Nómina → Personal; después lo puedes corregir aquí.</p>
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
        {!lista && !err && <div style={{ color: C.slate, fontSize: 13 }}>Buscando…</div>}
        {lista && (<>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o área…" style={{ ...sel, flex: 1, minWidth: 180 }} />
            <select value={taller} onChange={(e) => setTaller(e.target.value)} style={sel}>{talleres.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div style={{ overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
            {vis.map((t) => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 13, opacity: t.yaEsta ? 0.5 : 1, cursor: t.yaEsta ? "default" : "pointer" }}>
                <input type="checkbox" disabled={t.yaEsta} checked={!!marca[t.id] && !t.yaEsta} onChange={(e) => setMarca((m) => ({ ...m, [t.id]: e.target.checked }))} />
                <span style={{ flex: 1 }}><strong>{t.nombre}</strong><span style={{ color: C.slate }}> · {t.area || "sin área"}</span>{t.yaEsta && <span style={{ color: C.slate }}> · ya está</span>}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{t.sueldo ? money(t.sueldo) : "sin sueldo"}</span>
              </label>))}
            {!vis.length && <div style={{ padding: 14, color: C.slate, fontSize: 13 }}>No hay coincidencias.</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button onClick={onCerrar} style={btnG}>Cancelar</button>
            <button disabled={!elegidos.length || !taller} onClick={() => { onAgregar(elegidos.map((t) => ({ id: nuevoId(), nombre: t.nombre, taller, sueldo: t.sueldo, conPrest: !!conPrestPorDefecto, pctMuestras: 100, activa: true }))); onCerrar(); }} style={{ ...btnD, opacity: !elegidos.length || !taller ? 0.5 : 1 }}>Agregar {elegidos.length || ""}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

function exportarCSV(nombreArchivo, filas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const texto = "﻿" + filas.map((f) => f.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = nombreArchivo; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export function CostosMuestrasView({ db, muestras, talleresConfig, usuarioNombre }) {
  const hoy = isoLocal(new Date());
  const mesActual = hoy.slice(0, 7);
  const [cfg, setCfg] = useState(null);
  const [pagos, setPagos] = useState(null);
  const [error, setError] = useState("");
  const [mesElegido, setMesElegido] = useState(null);
  const [traer, setTraer] = useState(false);
  const [tallerPago, setTallerPago] = useState("");
  useEffect(() => {
    const u1 = onSnapshot(doc(db, "centro_costo_muestras", "main"), (s) => setCfg(s.exists() ? s.data() : {}), (e) => setError(e?.message || "No se pudo leer la configuración de costos."));
    const u2 = onSnapshot(doc(db, "centro_costo_muestras", "pagos"), (s) => setPagos(s.exists() ? (s.data().pagos || {}) : {}), (e) => setError(e?.message || "No se pudieron leer los pagos."));
    return () => { u1(); u2(); };
  }, [db]);
  async function guardar(parcial) {
    try { await setDoc(doc(db, "centro_costo_muestras", "main"), parcial, { merge: true }); } catch (e) { setError(e?.message || "No se pudo guardar."); }
  }
  async function guardarPago(id, parcial) {
    try { await setDoc(doc(db, "centro_costo_muestras", "pagos"), { pagos: { [id]: parcial } }, { merge: true }); } catch (e) { setError(e?.message || "No se pudo guardar el pago."); }
  }
  // Se abre en el mes más reciente que tenga muestras entregadas (el actual si ya tiene alguna).
  const resumenMeses = useMemo(() => resumenMesesMuestras(muestras), [muestras]);
  const mes = mesElegido || mesPorDefecto(resumenMeses.conteo, mesActual);
  const setMes = setMesElegido;
  const datos = cfg || {};
  const r = useMemo(() => (cfg && pagos ? costosDelMes(muestras, datos, pagos, mes) : null), [muestras, cfg, pagos, mes]);
  const previo = useMemo(() => (cfg && pagos ? costosDelMes(muestras, datos, pagos, mesAnterior(mes)) : null), [muestras, cfg, pagos, mes]);
  const opcionesMes = useMemo(() => { const l = []; let m = mesActual; for (let i = 0; i < 14; i++) { l.push(m); m = mesAnterior(m); } return l; }, [mesActual]);
  if (error) return <div style={{ ...card, color: C.red, fontSize: 13 }}>{error}</div>;
  if (!r) return <div style={{ ...card, color: C.slate, fontSize: 13 }}>Cargando costos…</div>;

  const personal = datos.personal || [];
  const todosTalleres = [...new Set([...(talleresConfig || []), ...(muestras || []).map((c) => String(c.taller || "").trim()).filter(Boolean), ...personal.map((p) => p.taller).filter(Boolean), ...Object.values(datos.talleres || {}).map((t) => t.nombre).filter(Boolean)])].sort();
  const setPersonal = (lista) => guardar({ personal: lista });
  const editarPersona = (id, patch) => setPersonal(personal.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const totalSueldos = personal.filter((p) => p.activa !== false).reduce((s, p) => s + costoPersona(p, datos), 0);
  const guardarTaller = (nombre, patch) => guardar({ talleres: { [claveTexto(nombre)]: { nombre, ...((datos.talleres || {})[claveTexto(nombre)] || {}), ...patch } } });
  const guardarPresupuesto = (nombre, valor) => guardar({ presupuestos: { [mes]: { [claveTexto(nombre)]: Number(valor) || 0 } } });
  const externos = r.filas.filter((f) => f.modo === "precio");
  const filaPago = externos.find((f) => f.taller === tallerPago) || externos[0] || null;
  const dCosto = previo && previo.costoPorMuestra && r.costoPorMuestra ? Math.round(((r.costoPorMuestra - previo.costoPorMuestra) / previo.costoPorMuestra) * 100) : null;
  const enCurso = mes === mesActual;

  return (
    <div>
      {traer && <TraerPersonalModal db={db} existentes={personal.map((p) => p.nombre)} talleres={todosTalleres} conPrestPorDefecto={Number(datos.prestacionesPct) > 0} onAgregar={(nuevos) => setPersonal([...personal, ...nuevos])} onCerrar={() => setTraer(false)} />}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...sel, minWidth: 250 }}>{opcionesMes.map((m) => { const n = resumenMeses.conteo[m] || 0; const est = resumenMeses.estimadas[m] || 0; return <option key={m} value={m}>{mesTxt(m)}{m === mesActual ? " (en curso)" : ""} · {n ? `${n} ${n === 1 ? "muestra" : "muestras"}${est ? (est === n ? " (estimadas)" : ` (${est} estimadas)`) : ""}` : "sin muestras"}</option>; })}</select>
        <span style={{ padding: "6px 12px", borderRadius: 10, background: C.canvas, color: C.slate, fontSize: 12, fontWeight: 700 }}>🔒 Solo administrador y quien tenga el acceso «Costos de muestras»</span>
      </div>
      {r.terminadas === 0 && (
        <div style={{ background: C.blueBg, color: C.blue, borderRadius: 12, padding: "12px 16px", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
          <strong>En {mesTxt(mes).split(" ")[0]} ningún taller entregó muestras registradas.</strong>{" "}
          Una muestra cuenta cuando se marca «Recibida del taller»{resumenMeses.primera ? `; ese registro empezó el ${fechaCorta(resumenMeses.primera)}` : "; todavía no hay ninguna registrada"}. Por eso los sueldos de este mes no se pueden repartir por muestra.{Object.keys(resumenMeses.conteo).length ? " Elige un mes que tenga muestras." : ""}
        </div>
      )}
      {r.estimadas > 0 && <div style={{ background: C.blueBg, color: C.blue, borderRadius: 12, padding: "12px 16px", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}><strong>{r.estimadas === r.terminadas ? "Todas las muestras de este mes son estimadas." : `${r.estimadas} de las ${r.terminadas} muestras de este mes son estimadas.`}</strong> {resumenMeses.primera ? `Antes del ${fechaCorta(resumenMeses.primera)} no se registraba «Recibida del taller»` : "Todavía no hay entregas registradas con «Recibida del taller»"}, así que se cuentan en el mes de su fecha de entrega esperada. Desde que se marca «Recibida» se usa la fecha real.</div>}
      {enCurso && r.terminadas > 0 && <div style={{ background: C.blueBg, color: C.blue, borderRadius: 12, padding: "12px 16px", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}><strong>Mes en curso.</strong> Se suma el sueldo completo del mes, pero solo cuentan las muestras entregadas hasta hoy: el costo por muestra bajará a medida que el taller entregue más.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 16 }}>
        <Kpi label={r.filas.some((f) => f.modo === "precio" && f.total > 0) ? "COSTO TOTAL DEL MES" : "SUELDOS DEL MES (PARA MUESTRAS)"} valor={money(r.total)} pie={r.terminadas === 0 ? "sin muestras que dividir" : r.filas.some((f) => f.modo === "precio" && f.total > 0) ? "sueldos + pago a externos" : "con prestaciones y % de dedicación"} />
        <Kpi label="MUESTRAS ENTREGADAS" valor={r.terminadas} pie={!r.terminadas ? "en este mes" : r.estimadas ? (r.estimadas === r.terminadas ? "estimadas por la fecha de entrega esperada" : `${r.terminadas - r.estimadas} reales · ${r.estimadas} estimadas`) : "marcadas «Recibida del taller»"} />
        <Kpi label="COSTO POR MUESTRA" valor={r.costoPorMuestra === null ? "—" : money(r.costoPorMuestra)} colorValor={r.costoPorMuestra === null ? C.slate : undefined} pie={r.costoPorMuestra === null ? "no se puede calcular" : `${money(r.total)} ÷ ${r.terminadas}${dCosto === null ? "" : ` · ${dCosto > 0 ? "▲" : "▼"} ${Math.abs(dCosto)}% vs. mes anterior`}`} />
        <Kpi label="GASTADO vs. PRESUPUESTO" valor={r.uso === null ? "—" : `${Math.round(r.uso * 100)}%`} pie={r.presupuesto ? `${money(r.total)} de ${money(r.presupuesto)}` : "sin presupuesto definido"} colorValor={r.uso === null ? C.slate : r.uso > 1 ? C.red : C.ink} />
      </div>

      <TarifaMuestrasCard db={db} muestras={muestras} cfg={datos} pagos={pagos} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginBottom: 16 }}>
        {r.filas.map((f) => {
          const pass = f.uso !== null && f.uso > 1;
          return (
            <div key={f.clave} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{f.taller}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, marginBottom: 10 }}>{f.modo === "sueldos" ? `MODO: POR SUELDOS · ${f.personas} ${f.personas === 1 ? "persona" : "personas"}` : `MODO: PRECIO POR MUESTRA · ${money(f.precio)}`}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.slate }}>COSTO POR MUESTRA</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{f.costoPorMuestra === null ? "—" : money(f.costoPorMuestra)}</div>
              <div style={{ fontSize: 12, color: C.slate }}>{f.terminadas === 0 ? "0 muestras entregadas este mes" : `${money(f.total)} ÷ ${f.terminadas} entregadas${f.estimadas ? (f.estimadas === f.terminadas ? " (estimadas)" : ` (${f.estimadas} estimadas)`) : ""}`}</div>
              {f.presupuesto > 0 ? (<>
                <div style={{ height: 9, borderRadius: 6, background: C.border, overflow: "hidden", margin: "6px 0 4px" }}><div style={{ width: `${Math.min(100, (f.uso || 0) * 100)}%`, height: "100%", background: pass ? C.red : f.uso > 0.85 ? C.amber : C.blue }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.slate, fontVariantNumeric: "tabular-nums", gap: 8 }}>
                  <span style={pass ? { color: C.red, fontWeight: 800 } : undefined}>{pass ? `Se pasó ${money(f.total - f.presupuesto)}` : `Gastado ${money(f.total)}`}</span>
                  <span>Presupuesto {money(f.presupuesto)} · {Math.round(f.uso * 100)}%</span>
                </div>
              </>) : <div style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>Sin presupuesto: defínelo abajo.</div>}
              {f.modo === "precio" && !f.precio && <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginTop: 4 }}>Falta el precio por muestra: defínelo abajo.</div>}
              {f.modo === "sueldos" && !f.personas && <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginTop: 4 }}>No hay personal en este taller: agrégalo abajo.</div>}
            </div>);
        })}
        {!r.filas.length && <div style={{ ...card, margin: 0, color: C.slate, fontSize: 13 }}>Todavía no hay talleres ni personal cargado. Agrega el personal de muestra abajo y define cada taller.</div>}
      </div>

      <div>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div><h3 style={h2}>Personal de muestra</h3><p style={nota}>El costo para muestras de cada persona = sueldo × prestaciones × % que dedica a muestras. El costo del taller en «Por sueldos» es la suma de los suyos.</p></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnG} onClick={() => setTraer(true)}>↧ Traer desde Personal</button>
              <button style={btnD} onClick={() => setPersonal([...personal, { id: nuevoId(), nombre: "", taller: todosTalleres[0] || "", sueldo: 0, conPrest: Number(datos.prestacionesPct) > 0, pctMuestras: 100, activa: true }])}>+ Agregar persona</button>
            </div>
          </div>
          <div style={{ background: C.canvas, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: C.ink, margin: "0 0 12px", lineHeight: 1.8 }}>
            <strong>Prestaciones:</strong> <InputTexto ancho={60} valor={String(datos.prestacionesPct ?? 0)} onGuardar={(v) => guardar({ prestacionesPct: Math.max(0, Number(String(v).replace(",", ".").replace(/[^\d.]/g, "")) || 0) })} /> % sobre el sueldo (lo defines una vez; se aplica a quien tenga la casilla «Con prestaciones»).
          </div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Persona</th><th style={th}>Taller</th><th style={{ ...th, textAlign: "right" }}>Sueldo mensual</th><th style={th}>Con prest.</th><th style={{ ...th, textAlign: "right" }}>% a muestras</th><th style={{ ...th, textAlign: "right" }}>Costo para muestras</th><th style={th}>Cuenta</th><th style={th} /></tr></thead>
            <tbody>
              {personal.map((p) => (
                <tr key={p.id} style={{ opacity: p.activa === false ? 0.5 : 1 }}>
                  <td style={td}><InputTexto ancho={128} valor={p.nombre} placeholder="Nombre" onGuardar={(v) => editarPersona(p.id, { nombre: v.toUpperCase() })} /></td>
                  <td style={td}><select value={p.taller || ""} onChange={(e) => editarPersona(p.id, { taller: e.target.value })} style={{ ...sel, padding: "6px 6px", fontSize: 12, maxWidth: 150 }}><option value="">— taller —</option>{todosTalleres.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                  <td style={{ ...td, textAlign: "right" }}><InputPesos ancho={104} valor={p.sueldo} onGuardar={(v) => editarPersona(p.id, { sueldo: v })} /></td>
                  <td style={td}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={conPrestaciones(p, datos)} onChange={(e) => editarPersona(p.id, { conPrest: e.target.checked })} />{conPrestaciones(p, datos) ? "Sí" : "No"}
                    </label>
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}><InputTexto ancho={56} valor={String(pctDedicacion(p))} onGuardar={(v) => { const n = Number(String(v).replace(",", ".").replace(/[^\d.]/g, "")); editarPersona(p.id, { pctMuestras: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100 }); }} /> %</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{money(costoPersona(p, datos))}</strong>
                    <div style={{ fontSize: 11, color: C.slate, whiteSpace: "nowrap" }}>{money(p.sueldo)}{conPrestaciones(p, datos) ? ` × ${(1 + (Number(datos.prestacionesPct) || 0) / 100).toFixed(2).replace(".", ",")}` : ""} × {pctDedicacion(p)}%</div>
                    {conPrestaciones(p, datos) && !(Number(datos.prestacionesPct) > 0) && <div style={{ fontSize: 11, color: C.amber, fontWeight: 700 }}>Define el % de prestaciones</div>}
                  </td>
                  <td style={td}><button style={{ ...btnS(p.activa !== false), padding: "4px 10px", fontSize: 11.5 }} onClick={() => editarPersona(p.id, { activa: p.activa === false })}>{p.activa === false ? "Inactiva" : "Activa"}</button></td>
                  <td style={td}><button title="Quitar" style={{ ...btnG, padding: "4px 9px" }} onClick={() => { if (window.confirm(`¿Quitar a ${p.nombre || "esta persona"} del personal de muestra?`)) setPersonal(personal.filter((x) => x.id !== p.id)); }}>✕</button></td>
                </tr>))}
              {!personal.length && <tr><td colSpan={7} style={{ ...td, color: C.slate }}>Aún no hay personal. Usa «Traer desde Personal» o «+ Agregar persona».</td></tr>}
              {personal.length > 0 && <tr><td style={{ ...td, fontWeight: 800, borderTop: `2px solid ${C.border}` }} colSpan={5}>Total para muestras del mes</td><td style={{ ...td, fontWeight: 800, textAlign: "right", borderTop: `2px solid ${C.border}` }}>{money(totalSueldos)}</td><td colSpan={2} style={{ ...td, borderTop: `2px solid ${C.border}` }} /></tr>}
            </tbody>
          </table></div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10 }}>Si alguien hace muestras todo el tiempo: 100%. Si dedica la mitad del tiempo: 50%. Si no quieres sumar prestaciones a una persona, desmarca «Con prestaciones».</div>
        </div>

        <div style={card}>
          <h3 style={h2}>Presupuesto mensual y precio por taller</h3>
          <p style={nota}>El presupuesto es de {mesTxt(mes)}; si un mes no tiene el suyo, rige el del último mes anterior que sí lo tiene.</p>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Taller</th><th style={th}>Modo de costo</th><th style={{ ...th, textAlign: "right" }}>Precio x muestra</th><th style={{ ...th, textAlign: "right" }}>Presupuesto</th></tr></thead>
            <tbody>
              {todosTalleres.map((t) => {
                const clave = claveTexto(t);
                const fila = r.filas.find((x) => x.clave === clave);
                const modo = fila ? fila.modo : "precio";
                return (
                  <tr key={t}>
                    <td style={td}><strong>{t}</strong></td>
                    <td style={td}><select value={modo} onChange={(e) => guardarTaller(t, { modo: e.target.value })} style={{ ...sel, padding: "6px 8px", fontSize: 12.5 }}><option value="sueldos">Por sueldos</option><option value="precio">Precio por muestra</option></select></td>
                    <td style={{ ...td, textAlign: "right" }}>{modo === "precio" ? <InputPesos valor={(datos.talleres || {})[clave]?.precio || 0} onGuardar={(v) => guardarTaller(t, { precio: v })} ancho={110} /> : <span style={{ color: C.slate }}>—</span>}</td>
                    <td style={{ ...td, textAlign: "right" }}><InputPesos valor={fila ? fila.presupuesto : 0} onGuardar={(v) => guardarPresupuesto(t, v)} ancho={120} />{fila && fila.presupuestoHeredado && <div style={{ fontSize: 10.5, color: C.slate }}>heredado</div>}</td>
                  </tr>);
              })}
              {!todosTalleres.length && <tr><td colSpan={4} style={{ ...td, color: C.slate }}>No hay talleres todavía (Administración → Talleres de Muestra).</td></tr>}
              {todosTalleres.length > 0 && <tr><td style={{ ...td, fontWeight: 800, borderTop: `2px solid ${C.border}` }} colSpan={3}>Presupuesto total</td><td style={{ ...td, fontWeight: 800, textAlign: "right", borderTop: `2px solid ${C.border}` }}>{money(r.presupuesto)}</td></tr>}
            </tbody>
          </table></div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10 }}>«Por sueldos»: la suma de los sueldos del taller ÷ muestras terminadas en el mes. «Precio por muestra»: un valor fijo por muestra que se puede ajustar en cada una (abajo). Las muestras terminadas son las que el taller entregó ese mes.</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div><h3 style={h2}>A pagar · {mesTxt(mes)}</h3><p style={nota}>Muestras entregadas por talleres con «Precio por muestra». Las plantas propias se pagan por Nómina.</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            {externos.length > 1 && <select value={filaPago ? filaPago.taller : ""} onChange={(e) => setTallerPago(e.target.value)} style={sel}>{externos.map((f) => <option key={f.clave} value={f.taller}>{f.taller}</option>)}</select>}
            {filaPago && filaPago.lineas.length > 0 && <button style={btnG} onClick={() => exportarCSV(`a-pagar-${claveTexto(filaPago.taller)}-${mes}.csv`, [["Referencia", "Muestra", "Recibida", "Valor", "Estado"], ...filaPago.lineas.map((l) => [l.referencia, l.nombre, fechaCorta(l.recibida), l.valor, l.pagada ? "Pagada" : "Por pagar"]), ["", "", "Total", filaPago.total, ""]])}>⬇ Exportar CSV</button>}
          </div>
        </div>
        {!filaPago ? <div style={{ color: C.slate, fontSize: 13 }}>Ningún taller está en modo «Precio por muestra». Cámbialo arriba en el taller externo.</div> : !filaPago.lineas.length ? <div style={{ color: C.slate, fontSize: 13 }}>{filaPago.taller} no entregó muestras en {mesTxt(mes)}.</div> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Referencia", "Muestra", "Recibida"].map((h) => <th key={h} style={th}>{h}</th>)}<th style={{ ...th, textAlign: "right" }}>Valor</th><th style={th}>Estado de pago</th></tr></thead>
            <tbody>
              {filaPago.lineas.map((l) => (
                <tr key={l.id}>
                  <td style={td}>{l.referencia || "—"}</td><td style={td}>{l.nombre}</td><td style={td}>{fechaCorta(l.recibida)}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}><InputPesos valor={l.valor} ancho={105} onGuardar={(v) => guardarPago(l.id, { valor: v })} />{l.ajustado && <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 10, background: C.amberBg, color: C.amber, fontSize: 11, fontWeight: 800 }}>ajustado</span>}</td>
                  <td style={td}>
                    <button onClick={() => guardarPago(l.id, { pagada: !l.pagada, por: usuarioNombre || "", en: new Date().toISOString() })} title={l.pagada && l.por ? `Marcada por ${l.por} el ${fechaCorta(l.en)}` : "Marcar como pagada"}
                      style={{ padding: "3px 11px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 11.5, background: l.pagada ? C.greenBg : C.amberBg, color: l.pagada ? C.green : C.amber, fontFamily: "inherit" }}>{l.pagada ? "✓ Pagada" : "Por pagar"}</button>
                  </td>
                </tr>))}
              <tr><td colSpan={3} style={{ ...td, fontWeight: 800, borderTop: `2px solid ${C.border}` }}>Total del mes ({filaPago.lineas.length} {filaPago.lineas.length === 1 ? "muestra" : "muestras"})</td><td style={{ ...td, fontWeight: 800, textAlign: "right", borderTop: `2px solid ${C.border}` }}>{money(filaPago.total)}</td><td style={{ ...td, borderTop: `2px solid ${C.border}` }}><span style={{ padding: "3px 11px", borderRadius: 10, background: filaPago.porPagar ? C.amberBg : C.greenBg, color: filaPago.porPagar ? C.amber : C.green, fontSize: 11.5, fontWeight: 800 }}>{filaPago.porPagar ? `Por pagar ${money(filaPago.porPagar)}` : "Todo pagado"}</span></td></tr>
            </tbody>
          </table></div>)}
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10 }}>Al marcar «Pagada» queda anotado quién y cuándo (pasa el cursor sobre la etiqueta). El valor de cada muestra se puede ajustar a mano cuando una es más compleja.</div>
      </div>
    </div>
  );
}
