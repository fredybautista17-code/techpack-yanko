// (2026-11-19, a pedido de Fredy) Ventana «Programación de mesones — hoy» (Mi Día de Planeación): una tarjeta por mesón con su línea de
// tiempo, un corte por línea (no un color por fila), el promedio de su tela y avisos cuando el horario no coincide. Solo lectura.
import React, { useState, useMemo } from "react";
import { armarMesones } from "./corte-promedios";
import { fmtDuracionMin, fmtHoraMin, colorDeLote, nombreMesonBonito } from "./mesones-libre";

const P = {
  ink: "#1A1A2E", slate: "#5A5A7A", line: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", amber: "#C47C1A", amberBg: "#FDF5E6", blue: "#3D6B9E", blueBg: "#EBF1F7", violet: "#6B4FA0", violetBg: "#F1ECFA",
};
const H0 = 6 * 60;
const H1 = 20 * 60;
const pct = (min) => Math.min(100, Math.max(0, ((min - H0) / (H1 - H0)) * 100));
const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");

function Pildora({ color, bg, children }) {
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11.5, fontWeight: 800, color, background: bg, whiteSpace: "nowrap" }}>{children}</span>;
}
function Aviso({ tono, children }) {
  const t = tono === "a" ? { c: P.amber, b: P.amberBg } : tono === "b" ? { c: P.blue, b: P.blueBg } : { c: P.violet, b: P.violetBg };
  return <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, borderRadius: 9, padding: "7px 10px", color: t.c, background: t.b }}>{children}</div>;
}
function Tile({ etiqueta, valor, sub, alerta }) {
  return (
    <div style={{ flex: "1 1 130px", padding: "10px 16px", borderRight: `1px solid ${P.line}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: P.slate, textTransform: "uppercase", letterSpacing: "0.05em" }}>{etiqueta}</div>
      <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, color: alerta ? P.amber : P.ink }}>
        {valor} {sub ? <span style={{ fontSize: 12.5, fontWeight: 700, color: P.slate }}>{sub}</span> : null}
      </div>
    </div>
  );
}

function TarjetaCorte({ c, abierto, onToggle, resaltado }) {
  const sinTela = !c.tela;
  let pildora = <Pildora color={P.slate} bg={P.canvas}>sin promedio</Pildora>;
  const avisos = [];
  if (c.evaluacion === "ok") pildora = <Pildora color={P.green} bg={P.greenBg}>✓ dentro del promedio</Pildora>;
  else if (c.evaluacion === "largo") {
    pildora = <Pildora color={P.blue} bg={P.blueBg}>horario más largo</Pildora>;
    avisos.push(["b", `El horario (${fmtDuracionMin(c.progMin)}) es ${fmtDuracionMin(c.progMin - c.est.total)} más largo que el promedio de ${c.tela} (${fmtDuracionMin(c.est.total)}). Si sobra tiempo, el mesón puede recibir otro corte.`]);
  } else if (c.evaluacion === "corto") {
    pildora = <Pildora color={P.amber} bg={P.amberBg}>no alcanza</Pildora>;
    avisos.push(["a", `El horario (${fmtDuracionMin(c.progMin)}) es ${fmtDuracionMin(c.est.total - c.progMin)} más corto que el promedio de ${c.tela} (${fmtDuracionMin(c.est.total)}). Probablemente termine a las ${fmtHoraMin(c.estFinPropio)} y no a las ${c.horaFin}.`]);
  } else if (c.progMin === null) {
    pildora = <Pildora color={P.amber} bg={P.amberBg}>sin horario</Pildora>;
    if (c.est) avisos.push(["n", `Todavía no tiene horario. Según el promedio de ${c.tela} dura ~${fmtDuracionMin(c.est.total)}.`]);
  } else if (sinTela) {
    avisos.push(["n", "Este corte no tiene tela asignada: no se puede calcular el promedio."]);
  } else if (!c.est) {
    avisos.push(["n", `${c.tela} todavía no tiene estadística de corte. Al terminar, registra las horas de tendido y de corte para empezar a tener el dato.`]);
  }
  if (c.est && !c.est.tendidoHist) {
    avisos.push(["n", `Tendido calculado con la regla fija de 20 s por metro: ${c.tela} no tiene aún 3 cortes con tendido registrado. Registra las horas de tendido al cortar.`]);
  }
  return (
    <div id={`corte-hoy-${c.key}`} style={{ border: `1.5px solid ${resaltado ? P.ink : P.line}`, borderRadius: 12, padding: "10px 12px", background: P.white }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: colorDeLote(c.referencia), flex: "none" }} />
            {c.cliente} · #{c.numPedido} · {c.referencia}
            {c.numeroCorte ? <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: P.violetBg, color: P.violet }}>{c.numeroCorte}</span> : null}
          </div>
          <div style={{ color: P.slate, fontSize: 12.5, marginTop: 1 }}>
            {c.colores.length} color{c.colores.length !== 1 ? "es" : ""} · {fmtN(c.prendas)} prendas · {c.tela ? `tela ${c.tela}` : "sin tela"}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: c.progMin === null ? P.amber : P.ink }}>{c.progMin === null ? "Sin horario" : `${c.horaInicio} – ${c.horaFin}`}</div>
          {c.progMin !== null ? <div style={{ color: P.slate, fontSize: 12 }}>programado · {fmtDuracionMin(c.progMin)}</div> : null}
        </div>
        <div style={{ fontSize: 12.5, color: P.slate, fontVariantNumeric: "tabular-nums" }}>
          {c.est ? (
            <>
              Promedio <b style={{ color: P.ink }}>{fmtDuracionMin(c.est.total)}</b>
              <div style={{ fontSize: 12 }}>tendido {fmtDuracionMin(c.est.tendido)} + corte {fmtDuracionMin(c.est.corte)}</div>
            </>
          ) : "—"}
        </div>
        <div>{pildora}</div>
      </div>
      {avisos.map((a, i) => <Aviso key={i} tono={a[0]}>{a[1]}</Aviso>)}
      <button type="button" onClick={onToggle} aria-expanded={abierto} style={{ marginTop: 6, background: "none", border: 0, padding: 0, color: P.blue, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
        {abierto ? "▲ Ocultar" : "▼ Ver"} {c.colores.length === 1 ? "el color" : `los ${c.colores.length} colores`}
      </button>
      {abierto ? (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {c.colores.map((x, i) => (
            <span key={i} style={{ fontSize: 12, background: P.canvas, borderRadius: 8, padding: "3px 9px", fontVariantNumeric: "tabular-nums" }}>{x.nombre || "—"} <b>{fmtN(x.cantidad)}</b></span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// items: lo que devuelve generarMesonesHoy · estadisticas: { tela → {…} } o null si todavía carga / no hay permiso
export default function TableroMesonesHoy({ items, estadisticas, cargandoEstadisticas }) {
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [resaltado, setResaltado] = useState(null);
  const { mesones, resumen } = useMemo(() => armarMesones(items, estadisticas), [items, estadisticas]);
  const alternar = (k) => setAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  if (!mesones.length) {
    return <div style={{ textAlign: "center", padding: 40, color: P.slate, fontSize: 14, border: `1.5px dashed ${P.line}`, borderRadius: 10 }}>No hay cortes programados para hoy en Corte.</div>;
  }
  const horas = [];
  for (let m = H0; m <= H1; m += 120) horas.push(m);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", background: P.canvas, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        <Tile etiqueta="Cortes de hoy" valor={fmtN(resumen.cortes)} />
        <Tile etiqueta="Prendas" valor={fmtN(resumen.prendas)} />
        <Tile etiqueta="Mesones en uso" valor={fmtN(resumen.mesonesEnUso)} />
        <Tile etiqueta="Horarios que no alcanzan" valor={fmtN(resumen.noAlcanzan)} alerta={resumen.noAlcanzan > 0} />
        <Tile etiqueta="Sin dato de tendido" valor={fmtN(resumen.sinTendido)} sub={`de ${fmtN(resumen.cortes)}`} />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: P.slate, marginBottom: 12, alignItems: "center" }}>
        <span><i style={{ display: "inline-block", width: 22, height: 8, borderRadius: 4, marginRight: 5, verticalAlign: "middle", background: "repeating-linear-gradient(90deg, rgba(26,26,46,.55) 0 4px, transparent 4px 7px)" }} />Lo que dura según el promedio de la tela</span>
        <span><i style={{ display: "inline-block", width: 22, height: 8, borderRadius: 4, marginRight: 5, verticalAlign: "middle", background: "repeating-linear-gradient(90deg, rgba(196,124,26,.9) 0 4px, transparent 4px 7px)" }} />El horario programado no alcanza</span>
        {cargandoEstadisticas ? <span>Calculando promedios…</span> : null}
        {!cargandoEstadisticas && !estadisticas ? <span style={{ color: P.amber, fontWeight: 700 }}>No se pudieron leer las estadísticas de corte: se muestra solo el horario programado.</span> : null}
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        {mesones.map((m) => {
          const malTermina = m.terminaEstMin !== null && m.finProgMin !== null && m.terminaEstMin > m.finProgMin + 10;
          return (
            <div key={m.key} style={{ border: `1px solid ${P.line}`, borderRadius: 14, padding: "14px 16px 12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{nombreMesonBonito(m.meson)}</div>
                <div style={{ fontSize: 12.5, color: P.slate }}>{m.planta}{m.cortador && m.cortador !== "—" ? ` · ${m.cortador}` : ""}</div>
                {m.finProgMin !== null ? (
                  <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 12.5, color: P.slate, fontVariantNumeric: "tabular-nums" }}>
                    Programado hasta <b style={{ color: P.ink }}>{fmtHoraMin(m.finProgMin)}</b>
                    {m.hayEstimado && m.terminaEstMin !== null ? <> · <b style={{ color: malTermina ? P.amber : P.ink }}>según promedio termina ~{fmtHoraMin(m.terminaEstMin)}</b></> : null}
                  </div>
                ) : null}
              </div>
              <div style={{ position: "relative", height: 46, borderRadius: 9, background: "#FBF9F6", border: `1px solid ${P.line}`, overflow: "hidden" }}>
                {horas.slice(1, -1).map((h) => <i key={h} style={{ position: "absolute", top: 0, bottom: 0, width: 1, left: `${pct(h)}%`, background: "rgba(26,26,46,.07)" }} />)}
                {m.bloqueos.filter((b) => b.iniMin !== null && b.finMin !== null && b.finMin > b.iniMin).map((b) => (
                  <div key={b.id} title={`Bloqueo: ${b.referencia} — ${b.horaInicioEstimada} a ${b.horaFinEstimada}`} style={{ position: "absolute", top: 4, height: 24, left: `${pct(b.iniMin)}%`, width: `calc(${pct(b.finMin) - pct(b.iniMin)}% - 2px)`, background: P.line, color: P.slate, borderRadius: 6, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", padding: "0 7px", overflow: "hidden", whiteSpace: "nowrap" }}>
                    🔒 {b.referencia}
                  </div>
                ))}
                {m.cortes.filter((c) => c.progMin !== null).map((c) => (
                  <React.Fragment key={c.key}>
                    <button
                      type="button"
                      onClick={() => { setResaltado(c.key); const el = document.getElementById(`corte-hoy-${c.key}`); if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}
                      title={`${c.referencia}${c.numeroCorte ? " · " + c.numeroCorte : ""} · ${c.horaInicio}–${c.horaFin}`}
                      style={{ position: "absolute", top: 4, height: 24, left: `${pct(c.iniMin)}%`, width: `calc(${pct(c.finMin) - pct(c.iniMin)}% - 2px)`, background: colorDeLote(c.referencia), color: "#fff", border: 0, borderRadius: 6, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", padding: "0 7px", overflow: "hidden", whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", outline: resaltado === c.key ? `3px solid ${P.ink}` : "none", outlineOffset: 1 }}
                    >
                      {c.referencia}{c.numeroCorte ? ` · C${String(c.numeroCorte).replace(/\D/g, "") || c.numeroCorte}` : ""}
                    </button>
                    {c.est ? (
                      <i title={`Según el promedio de ${c.tela} dura ~${fmtDuracionMin(c.est.total)}`} style={{ position: "absolute", top: 32, height: 8, borderRadius: 4, left: `${pct(c.iniMin)}%`, width: `calc(${pct(Math.min(H1, c.iniMin + c.est.total)) - pct(c.iniMin)}% - 2px)`, background: c.evaluacion === "corto" ? "repeating-linear-gradient(90deg, rgba(196,124,26,.9) 0 4px, transparent 4px 7px)" : "repeating-linear-gradient(90deg, rgba(26,26,46,.55) 0 4px, transparent 4px 7px)" }} />
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ position: "relative", height: 18, marginTop: 4, fontSize: 11, color: P.slate, fontVariantNumeric: "tabular-nums" }}>
                {horas.map((h, i) => (
                  <span key={h} style={{ position: "absolute", left: `${pct(h)}%`, transform: i === 0 ? "none" : i === horas.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{String(h / 60).padStart(2, "0")}:00</span>
                ))}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {m.cortes.map((c) => <TarjetaCorte key={c.key} c={c} abierto={abiertos.has(c.key)} onToggle={() => alternar(c.key)} resaltado={resaltado === c.key} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: P.slate, background: P.canvas, border: `1px dashed ${P.line}`, borderRadius: 10, padding: "9px 12px", margin: "14px 0 4px" }}>
        Cómo se calcula: corte = prendas del corte ÷ prendas por minuto de la tela; tendido = metros × min/m de tendido de la tela (si no tiene al menos 3 cortes con tendido registrado se usa 20 s por metro y se avisa). «Termina» suma esos minutos desde la hora de inicio de cada corte. Margen de ±15 % para no avisar por diferencias pequeñas. Solo informa: no cambia ni bloquea el horario.
      </div>
    </div>
  );
}
