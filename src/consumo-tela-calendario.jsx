import { useState, useMemo } from "react";
import { esFestivoColombiaISO } from "./dias-habiles";

// Calendario del ahorro de tela (2026-11-11, a pedido de Fredy).
// Cada día suma lo que se ahorró (o se gastó de más) en los lotes cortados ese día, contra lo cotizado
// (o contra la ficha de telas cuando la referencia no tiene cotización aprobada). Usa las mismas filas
// que las tarjetas de «Consumo de tela»; al tocar un día salen sus lotes con la tarjeta de siempre.
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", soft: "#FBF9F6",
  green: "#2D9E6B", greenInk: "#1B6B47", greenBg: "#EBF7F2", red: "#D9483A", redInk: "#A32F24", redBg: "#FDF0EE",
  amber: "#B26B0F", amberBg: "#FDF5E6", uso: "#5B4FCF",
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_SEM = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const nf = (d) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const f0 = nf(0);
const f1 = nf(1);
const f2 = nf(2);
const pesos = (v) => `${v < 0 ? "−" : ""}$ ${f0.format(Math.abs(Math.round(v)))}`;
const pesosCorto = (v) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "+";
  return a >= 1e6 ? `${s}$${f2.format(a / 1e6)} M` : `${s}$${f0.format(Math.round(a / 1000))} mil`;
};
const conSigno = (v, t) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${t}`;
const isoDe = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const diaSemana = (iso) => new Date(`${iso}T12:00:00`).getDay(); // 0 = domingo

const completa = (f) => f.tipo === "mas" || f.tipo === "menos" || f.tipo === "normal";
const tienePesos = (f) => completa(f) && f.pagadoDeMas !== null && f.pagadoDeMas !== undefined;

// Resumen de un grupo de filas (un día, una semana o el mes). Positivo = ahorro.
export function resumenAhorro(filas) {
  const comp = filas.filter(completa);
  const conPesos = comp.filter(tienePesos);
  const base = comp.reduce((s, f) => s + (f.baseM || 0), 0);
  const real = comp.reduce((s, f) => s + (f.realM || 0), 0);
  return {
    n: filas.length,
    nc: comp.length,
    pesos: -conPesos.reduce((s, f) => s + f.pagadoDeMas, 0),
    nPesos: conPesos.length,
    metros: base - real,
    base,
    real,
    pct: base > 0 ? ((base - real) / base) * 100 : 0,
    ahorraron: filas.filter((f) => f.tipo === "menos").length,
    gastaron: filas.filter((f) => f.tipo === "mas").length,
    esperando: filas.filter((f) => f.tipo === "falta").length,
  };
}

export default function CalendarioAhorroTela({ filas, renderLote }) {
  const hoy = hoyBogota();
  const [mesSel, setMesSel] = useState("");
  const [modoSel, setModoSel] = useState("pesos");
  const [diaSel, setDiaSel] = useState("");

  const conFecha = useMemo(() => filas.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha || ""))), [filas]);
  const sinFecha = filas.length - conFecha.length;
  const meses = useMemo(() => [...new Set(conFecha.map((f) => f.fecha.slice(0, 7)))].sort(), [conFecha]);
  const mes = meses.includes(mesSel) ? mesSel : meses.includes(hoy.slice(0, 7)) ? hoy.slice(0, 7) : meses[meses.length - 1] || hoy.slice(0, 7);
  const [Y, M] = mes.split("-").map(Number);
  const idxMes = meses.indexOf(mes);

  const filasMes = useMemo(() => conFecha.filter((f) => f.fecha.startsWith(mes)), [conFecha, mes]);
  const resMes = useMemo(() => resumenAhorro(filasMes), [filasMes]);
  // Si todavía no hay precios de tela, el calendario se muestra en metros para no dejar los días en blanco.
  const hayPesos = resMes.nPesos > 0;
  const modo = modoSel === "pesos" && !hayPesos && resMes.nc > 0 ? "metros" : modoSel;
  const valor = (r) => (modo === "pesos" ? r.pesos : modo === "metros" ? r.metros : r.pct);
  const texto = (v, corto) => (modo === "pesos" ? (corto ? pesosCorto(v) : pesos(v)) : modo === "metros" ? conSigno(v, `${f1.format(Math.abs(v))} m`) : conSigno(v, `${f1.format(Math.abs(v))} %`));

  const dias = useMemo(() => {
    const dim = new Date(Y, M, 0).getDate();
    const out = [];
    for (let d = 1; d <= dim; d += 1) {
      const f = isoDe(Y, M, d);
      const ls = filasMes.filter((x) => x.fecha === f);
      out.push({ d, f, ls, r: resumenAhorro(ls) });
    }
    return out;
  }, [Y, M, filasMes]);
  const conDato = dias.filter((x) => x.r.nc > 0);
  const maxAbs = Math.max(1e-9, ...conDato.map((x) => Math.abs(valor(x.r))));
  const mejor = conDato.length ? conDato.reduce((a, b) => (valor(b.r) > valor(a.r) ? b : a)) : null;
  const dia = dias.some((x) => x.f === diaSel && x.ls.length) ? diaSel : mejor ? mejor.f : (dias.find((x) => x.ls.length) || {}).f || "";

  const primero = (new Date(Y, M - 1, 1).getDay() + 6) % 7;
  const celdas = [...Array(primero).fill(null), ...dias];
  while (celdas.length % 7) celdas.push(null);
  const semanas = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  const semR = semanas.map((s) => resumenAhorro(s.filter(Boolean).flatMap((x) => x.ls)));
  const maxSem = Math.max(1e-9, ...semR.map((r) => Math.abs(valor(r))));

  // Gráfica del ahorro acumulado
  const pts = useMemo(() => {
    let acc = 0;
    return dias.filter((x) => x.f <= hoy).map((x) => { acc += valor(x.r); return { d: x.d, v: acc }; });
  }, [dias, hoy, modo]);

  const sel = dias.find((x) => x.f === dia);
  const vMes = valor(resMes);
  const botonSeg = (activo) => ({ border: 0, background: activo ? C.ink : "transparent", color: activo ? C.white : C.slate, padding: "6px 14px", borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });
  const etiquetaModo = { pesos: "Ahorro del mes", metros: "Tela que no se gastó", pct: "Diferencia contra lo cotizado" }[modo];

  const W = 400, H = 150, pl = 8, pr = 52, pt = 14, pb = 24;
  const vmin = Math.min(0, ...pts.map((p) => p.v));
  const vmax = Math.max(0, ...pts.map((p) => p.v));
  const rng = vmax - vmin || 1;
  const X = (d) => pl + ((d - 1) / Math.max(1, dias.length - 1)) * (W - pl - pr);
  const Yv = (v) => pt + (1 - (v - vmin) / rng) * (H - pt - pb);
  const ult = pts[pts.length - 1] || { d: 1, v: 0 };
  const pri = pts[0] || ult;
  const linea = pts.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)} ${Yv(p.v).toFixed(1)}`).join(" ");
  const colorLinea = ult.v >= 0 ? C.green : C.red;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div role="group" aria-label="Mes" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.white, border: `1px solid ${C.border}`, borderRadius: 999, padding: 3 }}>
          <button onClick={() => setMesSel(meses[idxMes - 1])} disabled={idxMes <= 0} aria-label="Mes anterior" style={{ border: 0, background: "transparent", width: 30, height: 30, borderRadius: "50%", fontSize: 17, fontWeight: 800, color: C.ink, opacity: idxMes <= 0 ? 0.3 : 1, cursor: idxMes <= 0 ? "default" : "pointer" }}>‹</button>
          <b style={{ minWidth: 130, textAlign: "center", color: C.ink }}>{MESES[M - 1]} {Y}</b>
          <button onClick={() => setMesSel(meses[idxMes + 1])} disabled={idxMes < 0 || idxMes >= meses.length - 1} aria-label="Mes siguiente" style={{ border: 0, background: "transparent", width: 30, height: 30, borderRadius: "50%", fontSize: 17, fontWeight: 800, color: C.ink, opacity: idxMes < 0 || idxMes >= meses.length - 1 ? 0.3 : 1, cursor: idxMes < 0 || idxMes >= meses.length - 1 ? "default" : "pointer" }}>›</button>
        </div>
        <div role="group" aria-label="Ver en" style={{ display: "inline-flex", background: C.white, border: `1px solid ${C.border}`, borderRadius: 999, padding: 3 }}>
          {[["pesos", "Pesos"], ["metros", "Metros"], ["pct", "%"]].map(([id, t]) => (
            <button key={id} onClick={() => setModoSel(id)} aria-pressed={modo === id} style={botonSeg(modo === id)}>{t}</button>
          ))}
        </div>
      </div>

      {!meses.length ? (
        <div style={{ padding: 20, color: C.slate, fontSize: 13 }}>Todavía no hay lotes con fecha de corte en este periodo.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginBottom: 14 }}>
            <section aria-label="Resumen del mes" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 22px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.slate }}>{etiquetaModo}{resMes.nc > 0 && vMes < 0 ? " · en contra" : ""}</div>
              <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "6px 0 8px", color: resMes.nc === 0 ? C.slate : vMes >= 0 ? C.green : C.red }}>
                {resMes.nc > 0 ? texto(vMes, false).replace(/^\+/, "") : "—"}
              </div>
              {resMes.nc > 0 ? (
                <div style={{ fontSize: 13.5, color: C.slate }}>
                  En <b style={{ color: C.ink }}>{resMes.nc} {resMes.nc === 1 ? "lote" : "lotes"}</b> se usaron <b style={{ color: C.ink }}>{f1.format(resMes.real)} m</b> y lo previsto era <b style={{ color: C.ink }}>{f1.format(resMes.base)} m</b>:{" "}
                  <b style={{ color: C.ink }}>{f1.format(Math.abs(resMes.metros))} m {resMes.metros >= 0 ? "menos" : "más"}</b> ({f1.format(Math.abs(resMes.pct))} %).
                </div>
              ) : (
                <div style={{ fontSize: 13.5, color: C.slate }}>Este mes todavía no tiene lotes con consumo real de Busint.</div>
              )}
              {modoSel === "pesos" && !hayPesos && resMes.nc > 0 && <div style={{ fontSize: 12.5, color: C.amber, marginTop: 6 }}>Aún no hay precio de tela de Busint para estos lotes, por eso se muestra en metros.</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, borderTop: `1px dashed ${C.border}`, marginTop: 12, paddingTop: 12 }}>
                {[["Ahorraron", resMes.ahorraron, C.green], ["Gastaron de más", resMes.gastaron, C.red], ["Esperando Busint", resMes.esperando, C.ink]].map(([t, n, col]) => (
                  <div key={t}><div style={{ fontSize: 11, fontWeight: 700, color: C.slate }}>{t}</div><span style={{ fontSize: 20, fontWeight: 900, color: col }}>{n}</span> <span style={{ fontSize: 11, color: C.slate }}>lotes</span></div>
                ))}
              </div>
            </section>
            <section aria-label="Ahorro acumulado" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 20px 10px" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{modo === "pct" ? "Diferencia por día (suma de %)" : modo === "metros" ? "Metros ahorrados, acumulado" : "Ahorro acumulado"}</div>
              <div style={{ fontSize: 12, color: C.slate }}>Día a día, sumando lo de cada corte</div>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ahorro acumulado por día" style={{ width: "100%", height: "auto", display: "block", marginTop: 6 }}>
                <line x1={pl} x2={W - pr} y1={Yv(0)} y2={Yv(0)} stroke={C.border} strokeWidth="1.5" strokeDasharray="3 4" />
                {pts.length > 0 && <path d={`${linea} L${X(ult.d).toFixed(1)} ${Yv(0).toFixed(1)} L${X(pri.d).toFixed(1)} ${Yv(0).toFixed(1)} Z`} fill={colorLinea} fillOpacity="0.14" />}
                {pts.length > 0 && <path d={linea} fill="none" stroke={colorLinea} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />}
                {pts.length > 0 && <circle cx={X(ult.d)} cy={Yv(ult.v)} r="5" fill={colorLinea} stroke={C.white} strokeWidth="2" />}
                {pts.length > 0 && <text x={X(ult.d) + 9} y={Yv(ult.v) + 4} fontSize="12" fontWeight="900" fill={colorLinea}>{texto(ult.v, true).replace(/^\+/, "")}</text>}
                <text x={pl + 2} y={Yv(0) - 5} fontSize="10.5" fontWeight="700" fill={C.slate}>0</text>
                <text x={pl} y={H - 6} fontSize="10.5" fontWeight="700" fill={C.slate}>1</text>
                <text x={(W - pr) / 2} y={H - 6} fontSize="10.5" fontWeight="700" fill={C.slate} textAnchor="middle">{Math.round(dias.length / 2)}</text>
                <text x={W - pr} y={H - 6} fontSize="10.5" fontWeight="700" fill={C.slate} textAnchor="end">{dias.length}</text>
              </svg>
            </section>
          </div>

          <section aria-label="Calendario" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 16px 14px", marginBottom: 14 }}>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(84px,1fr)) minmax(104px,1.1fr)", gap: 6, minWidth: 700 }}>
                {DIAS_SEM.map((x) => <div key={x} style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.slate, padding: "2px 4px 4px" }}>{x}</div>)}
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.slate, padding: "2px 4px 4px", textAlign: "right" }}>Semana</div>
                {semanas.map((s, si) => {
                  const r = semR[si];
                  const vs = valor(r);
                  return [
                    ...s.map((x, ci) => {
                      if (!x) return <div key={`v${si}-${ci}`} />;
                      const fest = esFestivoColombiaISO(x.f);
                      const tiene = x.r.nc > 0;
                      const v = valor(x.r);
                      const i = tiene ? Math.min(1, Math.sqrt(Math.abs(v) / maxAbs)) : 0;
                      const fondo = tiene ? `color-mix(in srgb, ${v >= 0 ? C.green : C.red} ${Math.round(i * (v >= 0 ? 62 : 55))}%, ${C.white})` : "transparent";
                      const esSel = dia === x.f;
                      return (
                        <button
                          key={x.f}
                          disabled={!x.ls.length}
                          onClick={() => setDiaSel(x.f)}
                          aria-pressed={esSel}
                          aria-label={`${x.d} de ${MESES[M - 1]}: ${x.ls.length ? `${tiene ? texto(v, false) + ", " : ""}${x.ls.length} lotes` : "sin cortes"}`}
                          style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6, minHeight: 92, padding: "8px 10px", borderRadius: 12, border: tiene ? `1px solid ${C.border}` : `1px dashed ${C.border}`, background: x.ls.length && !tiene ? C.soft : fondo, textAlign: "left", color: C.ink, fontFamily: "inherit", cursor: x.ls.length ? "pointer" : "default", opacity: x.f > hoy ? 0.5 : 1, outline: esSel ? `3px solid ${C.ink}` : "none", outlineOffset: 1 }}
                        >
                          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: 12, width: "100%" }}>
                            <span>{x.d}</span>
                            {x.f === hoy ? <span style={{ background: C.ink, color: C.white, borderRadius: 999, padding: "0 7px", fontSize: 10, letterSpacing: "0.04em" }}>Hoy</span>
                              : fest ? <em style={{ fontStyle: "normal", fontSize: 10, color: C.slate, letterSpacing: "0.04em", textTransform: "uppercase" }}>Festivo</em>
                                : diaSemana(x.f) === 0 ? <em style={{ fontStyle: "normal", fontSize: 10, color: C.slate, letterSpacing: "0.04em", textTransform: "uppercase" }}>Dom</em> : null}
                          </span>
                          {mejor && mejor.f === x.f && v > 0 && <span style={{ position: "absolute", top: -8, right: 8, background: C.amber, color: C.white, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", padding: "1px 8px", borderRadius: 999 }}>MEJOR DÍA</span>}
                          <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1, color: tiene ? (v >= 0 ? C.greenInk : C.redInk) : C.slate }}>{tiene ? texto(v, true) : x.r.esperando ? "Esperando" : ""}</span>
                          <span style={{ display: "flex", gap: 3, flexWrap: "wrap", minHeight: 8 }}>
                            {x.ls.map((l, k) => (
                              <span key={`${l.key}-${k}`} style={{ width: 8, height: 8, borderRadius: "50%", background: l.tipo === "menos" ? C.green : l.tipo === "mas" ? C.red : l.tipo === "falta" ? "transparent" : C.slate, opacity: l.tipo === "normal" ? 0.55 : 1, border: l.tipo === "falta" ? `1.5px dashed ${C.slate}` : "none", boxSizing: "border-box" }} />
                            ))}
                          </span>
                        </button>
                      );
                    }),
                    <div key={`s${si}`} style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, padding: "8px 10px", borderRadius: 12, background: C.white, border: `1px solid ${C.border}`, minHeight: 92 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.slate, letterSpacing: "0.05em", textTransform: "uppercase" }}>Sem. {si + 1}</span>
                      {r.nc > 0 ? (
                        <>
                          <b style={{ fontSize: 16, fontWeight: 900, textAlign: "right", color: vs >= 0 ? C.greenInk : C.redInk }}>{texto(vs, true)}</b>
                          <i style={{ display: "block", height: 5, borderRadius: 99, background: C.border, position: "relative", overflow: "hidden" }}>
                            <s style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 99, background: vs >= 0 ? C.green : C.red, width: `${Math.min(100, (Math.abs(vs) / maxSem) * 100)}%` }} />
                          </i>
                        </>
                      ) : <b style={{ fontSize: 16, textAlign: "right", color: C.slate }}>—</b>}
                    </div>,
                  ];
                })}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginTop: 14, color: C.slate, fontSize: 12, fontWeight: 700 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Gastó de más
                <span aria-hidden="true" style={{ width: 120, height: 10, borderRadius: 99, background: `linear-gradient(90deg, color-mix(in srgb, ${C.red} 55%, ${C.white}), ${C.white} 50%, color-mix(in srgb, ${C.green} 62%, ${C.white}))`, border: `1px solid ${C.border}` }} />
                Ahorró
              </span>
              {[["Ahorró", C.green, false], ["Normal", C.slate, false], ["Gastó de más", C.red, false], ["Esperando Busint", C.slate, true]].map(([t, col, hueco]) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: hueco ? "transparent" : col, border: hueco ? `1.5px dashed ${col}` : "none", boxSizing: "border-box", opacity: t === "Normal" ? 0.55 : 1 }} />{t}
                </span>
              ))}
            </div>
          </section>

          <section aria-live="polite" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px" }}>
            {sel && sel.ls.length ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: C.ink }}>{NOMBRE_DIA[diaSemana(sel.f)].replace(/^./, (c) => c.toUpperCase())} {sel.d} de {MESES[M - 1].toLowerCase()}</h4>
                  <span style={{ fontSize: 13, color: C.slate }}>{sel.ls.length} {sel.ls.length === 1 ? "lote" : "lotes"}{sel.r.esperando ? ` · ${sel.r.esperando} esperando Busint` : ""}</span>
                  {sel.r.nc > 0 && <b style={{ fontSize: 19, fontWeight: 900, color: valor(sel.r) >= 0 ? C.green : C.red }}>{texto(valor(sel.r), false)}</b>}
                </div>
                {[...sel.ls].sort((a, b) => (b.tipo === "falta" ? -1e12 : -(b.pagadoDeMas || 0)) - (a.tipo === "falta" ? -1e12 : -(a.pagadoDeMas || 0))).map((f) => renderLote(f))}
              </>
            ) : (
              <div style={{ color: C.slate, textAlign: "center", padding: "16px 0" }}>Toca un día del calendario para ver sus lotes.</div>
            )}
          </section>
          {sinFecha > 0 && <p style={{ margin: "8px 0 0", fontSize: 12, color: C.slate }}>{sinFecha} {sinFecha === 1 ? "fila" : "filas"} de Busint sin fecha de corte no aparecen en el calendario (sí en las tarjetas).</p>}
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: C.slate }}><b>Cómo se lee:</b> cada día suma el ahorro (verde) o el gasto de más (rojo) de los lotes que se cortaron ese día, contra lo cotizado. Los lotes que esperan el consumo real de Busint no suman todavía.</p>
        </>
      )}
    </div>
  );
}
