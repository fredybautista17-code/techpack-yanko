// (2026-11-10, a pedido de Fredy) Centro de Costo — Planeación, vista «Todas las áreas» ordenada para leerse rápido: una frase con la respuesta,
// una cinta con las cifras clave y las áreas de la que más ayuda necesita a la que menos (toca un área para ver a su gente). Es solo presentación:
// usa las mismas filas y los mismos totales de la pantalla; no cambia ningún cálculo. Las demás cifras quedan plegadas en «Más cifras del período».
// (2026-11-16, a pedido de Fredy) La fábrica se lee aparte de las plantas externas (MAQUILA no interviene en el equilibrio de la fábrica) y cada área/persona muestra
// sus Horas trabajadas y su Ayuda adicional (lo realmente puesto en Nómina por quincena, sin netear) junto a lo que genera y cuesta.
// (2026-11-17, a pedido de Fredy) Rediseño: el orden y el color dicen lo que de verdad costó (horas + ayuda de Nómina); «garantizado − producido» pasa a ser
// un «faltante» gris e informativo; cinta de 4 cifras; el detalle por persona trae barra de cobertura, etiqueta «fijo» (salario mínimo garantizado) y total del área.
import React, { useMemo, useState } from "react";
import { agruparPorArea, estadoCobertura } from "./centro-costo-resumen-areas-calculo";

const K = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", red: "#D24A38", redBg: "#FDF0EE", amber: "#B26F12", amberBg: "#FDF5E6", ambar: "#D99A2B", violet: "#6B4C9A", track: "#EFE9E1", panel: "#FBF9F6" };
const dinero = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const millones = (n) => (Number(n) < 0 ? "-$" : "$") + (Math.abs(Number(n) || 0) / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " M";
const esExterna = (f) => String(f.area || "").trim().toUpperCase() === "MAQUILA";
const esCorte = (f) => String(f.area || "").trim().toUpperCase() === "CORTE";
const entero = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const ESTADO = {
  mal: { fondo: K.redBg, color: K.red, barra: K.red },
  ojo: { fondo: K.amberBg, color: K.amber, barra: K.ambar },
  bien: { fondo: K.greenBg, color: K.green, barra: K.green },
  sin: { fondo: K.canvas, color: K.slate, barra: K.track },
};
const pill = (activo) => ({ border: `1.5px solid ${activo ? "#3D6B9E" : K.border}`, background: activo ? "#EBF1F7" : K.white, color: activo ? "#3D6B9E" : K.slate, borderRadius: 999, padding: "5px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });
const th = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: K.slate, padding: "8px 10px", textAlign: "right", fontWeight: 800 };
const td = { padding: "8px 10px", borderTop: `1px solid ${K.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 };

function Cifra({ etiqueta, valor, sub, color }) {
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#B9B9D0", fontWeight: 800 }}>{etiqueta}</div>
      <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: color || "#fff" }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11.5, color: "#B9B9D0" }}>{sub}</div> : null}
    </div>
  );
}

function MiniBarra({ cobertura }) {
  if (cobertura === null || cobertura === undefined) return <span style={{ color: K.slate }}>—</span>;
  const c = Math.max(0, Math.min(1, cobertura));
  const est = ESTADO[estadoCobertura(c).k];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }} title={`La producción cubrió el ${Math.round(c * 100)} % de lo garantizado`}>
      <span style={{ width: 64, height: 6, background: K.track, borderRadius: 99, overflow: "hidden", display: "inline-block" }}>
        <span style={{ display: "block", width: `${c * 100}%`, height: "100%", background: est.barra, borderRadius: 99 }} />
      </span>
      <span style={{ minWidth: 34, fontSize: 12, fontWeight: 800, color: est.color }}>{Math.round(c * 100)} %</span>
    </span>
  );
}

const COLS_AREA = "20px minmax(120px,170px) minmax(180px,1fr) 150px 120px 118px";

function FilaArea({ a, abierta, onToggle, onVerTrabajador, horasPorId, ayudaAdicionalPorId }) {
  const e = ESTADO[a.estado.k];
  const horasDe = (f) => Number(horasPorId && horasPorId[f.id]) || 0;
  const adicionalDe = (f) => Number(ayudaAdicionalPorId && ayudaAdicionalPorId[f.id]) || 0;
  const horasArea = a.filas.reduce((x, f) => x + horasDe(f), 0);
  const adicionalArea = a.filas.reduce((x, f) => x + adicionalDe(f), 0);
  const costoReal = horasArea + adicionalArea;
  const pct = a.cobertura === null ? 0 : Math.max(0, Math.min(100, a.cobertura * 100));
  const filasOrden = [...a.filas].sort((x, y) => (adicionalDe(y) + horasDe(y)) - (adicionalDe(x) + horasDe(x)) || (x.balance === null ? 1 : y.balance === null ? -1 : x.balance - y.balance));
  return (
    <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={onToggle} role="button" tabIndex={0} aria-expanded={abierta} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onToggle(); } }}
        style={{ display: "grid", gridTemplateColumns: COLS_AREA, gap: 14, alignItems: "center", padding: "12px 16px", cursor: "pointer", minWidth: 760 }}>
        <span style={{ color: K.slate, display: "inline-block", transform: abierta ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
        <div style={{ fontWeight: 900, fontSize: 15, color: K.ink }}>
          {a.area}
          <div style={{ fontWeight: 500, fontSize: 12, color: K.slate }}>{a.personas} {a.personas === 1 ? "persona" : "personas"}{a.ayudadas > 0 ? ` · ${a.ayudadas} bajo lo garantizado` : ""}</div>
        </div>
        <div>
          <div style={{ height: 10, background: K.track, borderRadius: 99, overflow: "hidden" }} title="Parte de lo garantizado que cubrió la producción">
            <div style={{ width: `${pct}%`, height: "100%", background: e.barra, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11.5, color: K.slate, marginTop: 3 }}>{a.cobertura === null ? "Sin sueldos cargados para comparar" : `Cubre ${Math.round(a.cobertura * 100)} % · produjo ${millones(a.producido)} de ${millones(a.garantizado)} garantizado`}</div>
        </div>
        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: costoReal > 0 ? K.amber : K.ink }}>{millones(costoReal)}</div>
          <div style={{ fontWeight: 500, fontSize: 11.5, color: K.slate }}>horas {millones(horasArea)} + ayuda {millones(adicionalArea)}</div>
        </div>
        <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }} title="Garantizado − producido de quienes quedaron por debajo. Es solo una comparación: no es plata puesta.">
          <div style={{ fontWeight: 800, fontSize: 14, color: K.slate }}>{millones(a.ayuda)}</div>
          <div style={{ fontWeight: 500, fontSize: 11.5, color: K.slate }}>faltante vs garantizado</div>
        </div>
        <span style={{ justifySelf: "end", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "3px 11px", background: e.fondo, color: e.color, whiteSpace: "nowrap" }}>{a.estado.texto}</span>
      </div>
      {abierta ? (
        <div style={{ borderTop: `1px solid ${K.border}`, background: K.panel, padding: "6px 16px 14px 44px", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead>
              <tr><th style={{ ...th, textAlign: "left" }}>Trabajador</th><th style={th}>Producido</th><th style={th}>Garantizado</th><th style={th}>Cubre</th><th style={th}>Faltante</th><th style={th}>Horas</th><th style={th}>Ayuda de Nómina</th></tr>
            </thead>
            <tbody>
              {filasOrden.map((f) => {
                const cob = f.sinSueldo || !(f.garantizado > 0) ? null : (Number(f.valorProducido) || 0) / f.garantizado;
                return (
                  <tr key={f.id} onClick={() => onVerTrabajador && onVerTrabajador(f)} style={{ cursor: onVerTrabajador ? "pointer" : "default" }} title="Ver lo que registró en el período">
                    <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>
                      {f.nombre}{f.huboCausado ? <span title="Incluye causado sin confirmar"> 🟡</span> : null}
                      {f.sueldoFijo ? <span title="Se le paga siempre el salario mínimo: lo que Nómina le completa es sueldo fijo, no ayuda por producir poco" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: K.violet, background: "#F0EBF7", borderRadius: 6, padding: "1px 6px" }}>fijo</span> : null}
                      <div style={{ fontWeight: 500, fontSize: 11.5, color: K.slate }}>{entero(f.unidades)} movimientos</div>
                    </td>
                    <td style={td}>{dinero(f.valorProducido)}</td>
                    <td style={td}>{f.sinSueldo ? <span style={{ color: K.amber }}>sin sueldo cargado</span> : dinero(f.garantizado)}</td>
                    <td style={td}><MiniBarra cobertura={cob} /></td>
                    <td style={{ ...td, color: K.slate }}>{f.balance === null ? "—" : f.balance < 0 ? dinero(-f.balance) : <span style={{ color: K.green }}>sobra {dinero(f.balance)}</span>}</td>
                    <td style={td}>{horasDe(f) > 0 ? dinero(horasDe(f)) : "—"}</td>
                    <td style={{ ...td, fontWeight: adicionalDe(f) > 0 ? 800 : 500, background: adicionalDe(f) > 0 ? "#FFF4D6" : undefined }}>{adicionalDe(f) > 0 ? dinero(adicionalDe(f)) : "—"}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...td, textAlign: "left", fontWeight: 900, borderTop: `2px solid ${K.border}` }}>Total del área</td>
                <td style={{ ...td, fontWeight: 900, borderTop: `2px solid ${K.border}` }}>{dinero(a.producido)}</td>
                <td style={{ ...td, fontWeight: 900, borderTop: `2px solid ${K.border}` }}>{dinero(a.garantizado)}</td>
                <td style={{ ...td, borderTop: `2px solid ${K.border}` }}><MiniBarra cobertura={a.cobertura} /></td>
                <td style={{ ...td, fontWeight: 900, color: K.slate, borderTop: `2px solid ${K.border}` }}>{dinero(a.ayuda)}</td>
                <td style={{ ...td, fontWeight: 900, borderTop: `2px solid ${K.border}` }}>{dinero(horasArea)}</td>
                <td style={{ ...td, fontWeight: 900, borderTop: `2px solid ${K.border}` }}>{dinero(adicionalArea)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// Estructura: las áreas y personas que se pagan con la Base del Dado por Cumplido se miden juntas contra la Base cobrada del período (un solo monto).
function FilaEstructura({ estructura, extraProduccion }) {
  const [abierta, setAbierta] = useState(false);
  const costoApoyo = estructura.personas.reduce((s, p) => s + (p.sinSueldo ? 0 : Number(p.costo) || 0), 0);
  const extra = Number(extraProduccion) || 0;
  const costo = costoApoyo + extra;
  const porArea = [...estructura.personas.reduce((m, p) => {
    const k = p.area || "Sin asignar";
    const x = m.get(k) || { area: k, personas: 0, costo: 0 };
    x.personas += 1;
    x.costo += p.sinSueldo ? 0 : Number(p.costo) || 0;
    return m.set(k, x);
  }, new Map()).values()].sort((a, b) => b.costo - a.costo);
  const base = Number(estructura.base) || 0;
  const balance = base - costo;
  const cobertura = costo > 0 ? base / costo : null;
  const est = estadoCobertura(cobertura === null ? null : Math.min(cobertura, 1));
  const e = ESTADO[est.k];
  const pct = cobertura === null ? 0 : Math.max(0, Math.min(100, cobertura * 100));
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: K.ink, marginBottom: 2 }}>Estructura · se paga con lo recogido en las bases</div>
      <div style={{ fontSize: 12, color: K.slate, marginBottom: 8 }}>Las áreas de apoyo (Diseño, Contabilidad, Bodega…) no producen por destajo: se miden juntas contra lo recogido con los básicos del Dado por Cumplido (la misma cifra de ¿Cubro mis costos?), junto con las horas y la ayuda de las áreas de producción. No suman a la ayuda de arriba ni incluyen los gastos del Excel (eso está en ¿Cubro mis costos?).</div>
      <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div onClick={() => setAbierta(!abierta)} role="button" tabIndex={0} aria-expanded={abierta} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setAbierta(!abierta); } }}
          style={{ display: "grid", gridTemplateColumns: "22px minmax(120px,190px) minmax(160px,1fr) 140px 140px", gap: 14, alignItems: "center", padding: "13px 16px", cursor: "pointer" }}>
          <span style={{ color: K.slate, display: "inline-block", transform: abierta ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
          <div style={{ fontWeight: 900, fontSize: 15, color: K.ink }}>Estructura<div style={{ fontWeight: 500, fontSize: 12, color: K.slate }}>{estructura.personas.length} {estructura.personas.length === 1 ? "persona" : "personas"}</div></div>
          <div>
            <div style={{ height: 14, background: K.track, borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: e.barra, borderRadius: 99 }} /></div>
            <div style={{ fontSize: 11.5, color: K.slate, marginTop: 3 }}>
              {cobertura === null ? "Sin nómina para comparar" : `Lo recogido en bases (${millones(base)}, ${estructura.lotes || 0} lote${estructura.lotes === 1 ? "" : "s"}) cubre el ${Math.round(cobertura * 100)} % de la nómina de apoyo (${millones(costoApoyo)})${extra > 0 ? ` + horas y ayuda de producción (${millones(extra)})` : ""}`}
            </div>
          </div>
          <div style={{ textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: balance < 0 ? K.red : K.green }}>{millones(balance)}<div style={{ fontWeight: 500, fontSize: 11.5, color: K.slate }}>bases − costo</div></div>
          <span style={{ justifySelf: "end", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "3px 11px", background: e.fondo, color: e.color, whiteSpace: "nowrap" }}>{est.texto}</span>
        </div>
        {abierta ? (
          <div style={{ borderTop: `1px solid ${K.border}`, background: K.panel, padding: "6px 16px 14px 52px", overflowX: "auto" }}>
            {!estructura.lotes ? <div style={{ fontSize: 12, color: K.amber, padding: "6px 0" }}>⚠ No hay lotes de Dado por Cumplido aprobados con fecha de aprobación en este período.</div> : null}
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 10 }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>Área de apoyo</th><th style={th}>Personas</th><th style={th}>Nómina del período</th></tr></thead>
              <tbody>
                {porArea.map((x) => (<tr key={x.area}><td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{x.area}</td><td style={td}>{x.personas}</td><td style={td}>{dinero(x.costo)}</td></tr>))}
                {extra > 0 ? <tr><td style={{ ...td, textAlign: "left", fontWeight: 800 }}>Horas + ayuda de las áreas de producción</td><td style={td}>—</td><td style={td}>{dinero(extra)}</td></tr> : null}
              </tbody>
            </table>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>Persona</th><th style={{ ...th, textAlign: "left" }}>Área</th><th style={th}>Costo nómina del período</th></tr></thead>
              <tbody>
                {estructura.personas.slice().sort((a, b) => (Number(b.costo) || 0) - (Number(a.costo) || 0)).map((p) => (
                  <tr key={p.id}><td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{p.nombre}</td><td style={{ ...td, textAlign: "left" }}>{p.area}</td><td style={td}>{p.sinSueldo ? <span style={{ color: K.amber }}>sin sueldo cargado</span> : dinero(p.costo)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// filas = SOLO las personas de producción (las de la «Base» van aparte en `estructura`); los totales de la cinta salen de esas mismas filas.
// estructura = { personas: [{ id, nombre, area, costo, sinSueldo }], base, lotes } — nómina de las áreas/personas que se pagan con la Base del Dado por Cumplido.
export default function ResumenAreasCC({
  filas, garantizadoDe, etiquetaPeriodo, unidadesTerminadas, unidadesDespachadas, unidadesCortadas, lotesAprobados, estructura,
  totalAyudaQuincenas, totalCostoIndirecto, hayCausado, vista, onVista, onVerTrabajador, onExcel, onDatosCargados, onSubirNomina, horasPorId, ayudaAdicionalPorId,
}) {
  // La fábrica (arriba) y las plantas externas (Maquila, abajo) se leen por separado: Maquila no interviene en el equilibrio de la fábrica.
  const filasExternas = useMemo(() => filas.filter(esExterna), [filas]);
  const filasCorte = useMemo(() => filas.filter(esCorte), [filas]);
  const filasFab = useMemo(() => filas.filter((f) => !esExterna(f) && !esCorte(f)), [filas]);
  const g = useMemo(() => agruparPorArea(filasFab, garantizadoDe), [filasFab, garantizadoDe]);
  const gExt = useMemo(() => agruparPorArea(filasExternas, garantizadoDe), [filasExternas, garantizadoDe]);
  const suma = (lista, mapa) => lista.reduce((x, f) => x + (Number(mapa && mapa[f.id]) || 0), 0);
  const totalHorasFab = suma(filasFab, horasPorId);
  const totalAdicionalFab = suma(filasFab, ayudaAdicionalPorId);
  const totalValor = filasFab.reduce((s, f) => s + (Number(f.valorProducido) || 0), 0);
  const totalCosto = filasFab.reduce((s, f) => s + (f.sinSueldo ? 0 : Number(f.costo) || 0), 0);
  const totalUnidades = filasFab.reduce((s, f) => s + (Number(f.unidades) || 0), 0);
  const totalAyuda = g.total.ayuda;
  const totalExcedente = g.areas.reduce((s, a) => s + a.excedente, 0);
  const [abiertas, setAbiertas] = useState(() => ({}));
  const [soloAyuda, setSoloAyuda] = useState(false);
  const costoRealArea = (a) => a.filas.reduce((x, f) => x + (Number(horasPorId && horasPorId[f.id]) || 0) + (Number(ayudaAdicionalPorId && ayudaAdicionalPorId[f.id]) || 0), 0);
  // Primero la que más costó de verdad (horas + ayuda de Nómina); a igualdad, la que más le faltó vs lo garantizado.
  const lista = g.areas.filter((a) => !soloAyuda || a.ayuda > 0).slice().sort((x, y) => costoRealArea(y) - costoRealArea(x) || y.ayuda - x.ayuda);
  const abierta = (a, i) => (abiertas[a.area] !== undefined ? abiertas[a.area] : i === 0 && costoRealArea(a) > 0);
  const cob = g.total.cobertura;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: K.ink }}>
          {totalHorasFab + totalAdicionalFab > 0
            ? <>En {etiquetaPeriodo} la fábrica costó <span style={{ color: K.red }}>{millones(totalHorasFab + totalAdicionalFab)}</span> de más</>
            : <>En {etiquetaPeriodo} la fábrica no tuvo costo extra por horas ni ayudas</>}
        </div>
        <div style={{ fontSize: 13, color: K.slate }}>
          Horas trabajadas <b>{millones(totalHorasFab)}</b> + ayuda de Nómina <b>{millones(totalAdicionalFab)}</b>.{" "}
          {cob === null ? "Todavía no hay sueldos cargados para comparar." : <>Contra lo garantizado ({millones(g.total.garantizado)}) la producción cubrió el <b>{Math.round(cob * 100)} %</b>; el faltante de {millones(totalAyuda)} es informativo ({g.total.ayudadas} {g.total.ayudadas === 1 ? "persona" : "personas"} por debajo).</>}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 28px", background: K.ink, color: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 16 }}>
        <Cifra etiqueta="Horas + ayuda de Nómina" valor={millones(totalHorasFab + totalAdicionalFab)} sub={`horas ${millones(totalHorasFab)} · ayuda ${millones(totalAdicionalFab)} · lo que de verdad costó de más`} color="#FFD27F" />
        <Cifra etiqueta="Costo nómina causado" valor={millones(totalCosto)} sub={hayCausado ? "🟡 incluye causado sin confirmar" : "áreas de producción (sin apoyo, Corte ni Maquila)"} />
        <Cifra etiqueta="Valor producido" valor={millones(totalValor)} sub={`${entero(totalUnidades)} movimientos de proceso`} />
        <Cifra etiqueta="Unidades despachadas" valor={entero(unidadesDespachadas)} sub={`${entero(unidadesTerminadas)} terminadas · ${entero(lotesAprobados)} lotes aprobados`} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: K.ink, marginRight: 4 }}>¿Dónde está el problema?</div>
        <button type="button" style={pill(vista === "area")} onClick={() => onVista("area")}>Por área</button>
        <button type="button" style={pill(vista === "trabajador")} onClick={() => onVista("trabajador")}>Por trabajador</button>
        {vista === "area" ? <button type="button" style={pill(soloAyuda)} onClick={() => setSoloAyuda(!soloAyuda)}>Solo áreas bajo lo garantizado</button> : null}
        <span style={{ flex: 1 }} />
        {onSubirNomina ? <button type="button" onClick={onSubirNomina} title="Sube el Excel de nómina de una quincena: producido, ayuda y pagado de cada persona" style={{ ...pill(false), color: "#3D6B9E", borderColor: "#3D6B9E" }}>📤 Subir nómina de la quincena</button> : null}
        {onDatosCargados ? <button type="button" onClick={onDatosCargados} title="Baja un Excel con el histórico que subiste, lo que hay guardado en Nómina por mes y lo que muestra esta pantalla" style={{ ...pill(false), color: "#3D6B9E", borderColor: "#3D6B9E" }}>🗂 Datos cargados</button> : null}
        {onExcel ? <button type="button" onClick={onExcel} style={{ ...pill(false), color: "#3D6B9E", borderColor: "#3D6B9E" }}>📥 Descargar Excel</button> : null}
      </div>

      {vista === "area" ? (
        <>
          <div style={{ fontSize: 12, color: K.slate, marginBottom: 8 }}>De la que más costó de verdad (horas + ayuda de Nómina) a la que menos. La barra es la parte de lo garantizado que cubrió la producción (rojo menos de 60 %, ámbar menos de 85 %, verde si se cubre). El faltante vs garantizado es solo una comparación, no plata puesta.</div>
          {lista.length ? lista.map((a, i) => (
            <FilaArea key={a.area} a={a} abierta={abierta(a, i)} onToggle={() => setAbiertas({ ...abiertas, [a.area]: !abierta(a, i) })} onVerTrabajador={onVerTrabajador} horasPorId={horasPorId} ayudaAdicionalPorId={ayudaAdicionalPorId} />
          )) : <div style={{ fontSize: 13, color: K.slate, padding: 10 }}>Ninguna área quedó por debajo de lo garantizado en este período.</div>}
          {filasCorte.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: K.ink, marginBottom: 2 }}>Corte · se mide por equipos y su costo ya va en el lote</div>
              <div style={{ fontSize: 12, color: K.slate, marginBottom: 8 }}>
                {filasCorte.length} {filasCorte.length === 1 ? "persona" : "personas"} · nómina {dinero(filasCorte.reduce((x, f) => x + (f.sinSueldo ? 0 : Number(f.costo) || 0), 0))}. No se cuenta como ayuda aquí; mira su medición en Corte → Centro de Costo.
              </div>
            </div>
          ) : null}
          {gExt.areas.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: K.ink, marginBottom: 2 }}>Plantas externas · no cuentan en el equilibrio de la fábrica</div>
              <div style={{ fontSize: 12, color: K.slate, marginBottom: 8 }}>Maquila se paga con sus propias ventas; su faltante vs garantizado de {millones(gExt.total.ayuda)} no suma a lo de arriba.</div>
              {gExt.areas.map((a) => (
                <FilaArea key={`ext-${a.area}`} a={a} abierta={abiertas[`ext-${a.area}`] === true} onToggle={() => setAbiertas({ ...abiertas, [`ext-${a.area}`]: !(abiertas[`ext-${a.area}`] === true) })} onVerTrabajador={onVerTrabajador} horasPorId={horasPorId} ayudaAdicionalPorId={ayudaAdicionalPorId} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {vista === "area" && estructura && estructura.personas.length > 0 ? <FilaEstructura estructura={estructura} extraProduccion={totalHorasFab + totalAdicionalFab} /> : null}

      <details style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 12, padding: "0 16px", marginTop: 6 }}>
        <summary style={{ cursor: "pointer", padding: "12px 0", fontWeight: 800, fontSize: 13, color: K.ink }}>Más cifras del período (unidades, movimientos, ayuda por quincena, costo indirecto)</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px 18px", paddingBottom: 14 }}>
          {[
            [entero(unidadesDespachadas), "Unidades despachadas de los lotes aprobados en el período (Dado por Cumplido, igual que ¿Cubro mis costos?)"],
            [entero(unidadesCortadas), "Unidades cortadas de esos mismos lotes"],
            [entero(unidadesTerminadas), "Unidades en Terminadas (proceso Terminación, toda la empresa)"],
            [entero(totalUnidades), "Movimientos de proceso (cada prenda cuenta una vez por proceso; no son prendas)"],
            [dinero(totalAyuda), "Faltante vs garantizado: garantizado − producido de quienes quedaron por debajo; solo compara, no es plata puesta"],
            [dinero(totalExcedente), "Excedente: lo que produjeron de más quienes superaron lo garantizado; no se resta"],
            [dinero(totalAdicionalFab), "Ayuda de Nómina: lo realmente puesto en Nómina por quincena (ajustes y complemento de salario mínimo), sin netear; solo la fábrica"],
            [dinero(totalHorasFab), "Costo indirecto: horas trabajadas causadas; no es costo del producto; solo la fábrica"],
          ].map(([v, t]) => (
            <div key={t}><b style={{ display: "block", fontSize: 18, fontVariantNumeric: "tabular-nums", color: K.ink }}>{v}</b><span style={{ fontSize: 12, color: K.slate }}>{t}</span></div>
          ))}
          <div><b style={{ display: "block", fontSize: 15, color: K.amber }}>Presupuesto</b><span style={{ fontSize: 12, color: K.slate }}>Se define por área: elige un área arriba para compararlo con su nómina.</span></div>
        </div>
      </details>
    </div>
  );
}
