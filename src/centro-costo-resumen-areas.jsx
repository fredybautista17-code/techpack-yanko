// (2026-11-10, a pedido de Fredy) Centro de Costo — Planeación, vista «Todas las áreas» ordenada para leerse rápido: una frase con la respuesta,
// una cinta con las cifras clave y las áreas de la que más ayuda necesita a la que menos (toca un área para ver a su gente). Es solo presentación:
// usa las mismas filas y los mismos totales de la pantalla; no cambia ningún cálculo. Las demás cifras quedan plegadas en «Más cifras del período».
import React, { useMemo, useState } from "react";
import { agruparPorArea, estadoCobertura } from "./centro-costo-resumen-areas-calculo";

const K = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", red: "#D24A38", redBg: "#FDF0EE", amber: "#B26F12", amberBg: "#FDF5E6", ambar: "#D99A2B", violet: "#6B4C9A", track: "#EFE9E1", panel: "#FBF9F6" };
const dinero = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const millones = (n) => (Number(n) < 0 ? "-$" : "$") + (Math.abs(Number(n) || 0) / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " M";
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

function FilaArea({ a, abierta, onToggle, onVerTrabajador }) {
  const e = ESTADO[a.estado.k];
  const pct = a.cobertura === null ? 0 : Math.max(0, Math.min(100, a.cobertura * 100));
  return (
    <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={onToggle} role="button" tabIndex={0} aria-expanded={abierta} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onToggle(); } }}
        style={{ display: "grid", gridTemplateColumns: "22px minmax(120px,190px) minmax(160px,1fr) 140px 140px", gap: 14, alignItems: "center", padding: "13px 16px", cursor: "pointer" }}>
        <span style={{ color: K.slate, display: "inline-block", transform: abierta ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
        <div style={{ fontWeight: 900, fontSize: 15, color: K.ink }}>
          {a.area}
          <div style={{ fontWeight: 500, fontSize: 12, color: K.slate }}>{a.personas} {a.personas === 1 ? "persona" : "personas"}{a.ayudadas > 0 ? ` · ${a.ayudadas} con ayuda` : ""}</div>
        </div>
        <div>
          <div style={{ height: 14, background: K.track, borderRadius: 99, overflow: "hidden" }} title="Parte de lo garantizado que cubrió la producción">
            <div style={{ width: `${pct}%`, height: "100%", background: e.barra, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11.5, color: K.slate, marginTop: 3 }}>{a.cobertura === null ? "Sin sueldos cargados para comparar" : `La producción cubrió el ${Math.round(a.cobertura * 100)} % de lo garantizado (${millones(a.garantizado)})`}</div>
        </div>
        <div style={{ textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: a.ayuda > 0 ? K.red : K.ink }}>
          {millones(a.ayuda)}
          <div style={{ fontWeight: 500, fontSize: 11.5, color: K.slate }}>de ayuda</div>
        </div>
        <span style={{ justifySelf: "end", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "3px 11px", background: e.fondo, color: e.color, whiteSpace: "nowrap" }}>{a.estado.texto}</span>
      </div>
      {abierta ? (
        <div style={{ borderTop: `1px solid ${K.border}`, background: K.panel, padding: "6px 16px 14px 52px", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr><th style={{ ...th, textAlign: "left" }}>Trabajador</th><th style={th}>Unidades</th><th style={th}>Valor producido</th><th style={th}>Garantizado</th><th style={th}>Balance</th></tr>
            </thead>
            <tbody>
              {a.filas.map((f) => (
                <tr key={f.id} onClick={() => onVerTrabajador && onVerTrabajador(f)} style={{ cursor: onVerTrabajador ? "pointer" : "default" }} title="Ver lo que registró en el período">
                  <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{f.nombre}{f.huboCausado ? <span title="Incluye causado sin confirmar"> 🟡</span> : null}</td>
                  <td style={td}>{entero(f.unidades)}</td>
                  <td style={td}>{dinero(f.valorProducido)}</td>
                  <td style={td}>{f.sinSueldo ? <span style={{ color: K.amber }}>sin sueldo cargado</span> : dinero(f.garantizado)}</td>
                  <td style={td}>
                    {f.balance === null ? "—" : <span style={{ fontWeight: 900, borderRadius: 8, padding: "2px 9px", background: f.balance < 0 ? K.redBg : K.greenBg, color: f.balance < 0 ? K.red : K.green }}>{dinero(f.balance)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// Estructura: las áreas y personas que se pagan con la Base del Dado por Cumplido se miden juntas contra la Base cobrada del período (un solo monto).
function FilaEstructura({ estructura }) {
  const [abierta, setAbierta] = useState(false);
  const costo = estructura.personas.reduce((s, p) => s + (p.sinSueldo ? 0 : Number(p.costo) || 0), 0);
  const base = Number(estructura.base) || 0;
  const balance = base - costo;
  const cobertura = costo > 0 ? base / costo : null;
  const est = estadoCobertura(cobertura === null ? null : Math.min(cobertura, 1));
  const e = ESTADO[est.k];
  const pct = cobertura === null ? 0 : Math.max(0, Math.min(100, cobertura * 100));
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: K.ink, marginBottom: 2 }}>Estructura · se paga con la Base</div>
      <div style={{ fontSize: 12, color: K.slate, marginBottom: 8 }}>Áreas y personas medidas contra la Base cobrada del Dado por Cumplido (un solo monto para todas). No suman a la ayuda de arriba.</div>
      <div style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div onClick={() => setAbierta(!abierta)} role="button" tabIndex={0} aria-expanded={abierta} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setAbierta(!abierta); } }}
          style={{ display: "grid", gridTemplateColumns: "22px minmax(120px,190px) minmax(160px,1fr) 140px 140px", gap: 14, alignItems: "center", padding: "13px 16px", cursor: "pointer" }}>
          <span style={{ color: K.slate, display: "inline-block", transform: abierta ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
          <div style={{ fontWeight: 900, fontSize: 15, color: K.ink }}>Estructura<div style={{ fontWeight: 500, fontSize: 12, color: K.slate }}>{estructura.personas.length} {estructura.personas.length === 1 ? "persona" : "personas"}</div></div>
          <div>
            <div style={{ height: 14, background: K.track, borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: e.barra, borderRadius: 99 }} /></div>
            <div style={{ fontSize: 11.5, color: K.slate, marginTop: 3 }}>
              {cobertura === null ? "Sin nómina para comparar" : `La Base cobrada (${millones(base)}, ${estructura.lotes || 0} lote${estructura.lotes === 1 ? "" : "s"}) cubre el ${Math.round(cobertura * 100)} % de la nómina (${millones(costo)})`}
            </div>
          </div>
          <div style={{ textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: balance < 0 ? K.red : K.green }}>{millones(balance)}<div style={{ fontWeight: 500, fontSize: 11.5, color: K.slate }}>Base − costo</div></div>
          <span style={{ justifySelf: "end", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "3px 11px", background: e.fondo, color: e.color, whiteSpace: "nowrap" }}>{est.texto}</span>
        </div>
        {abierta ? (
          <div style={{ borderTop: `1px solid ${K.border}`, background: K.panel, padding: "6px 16px 14px 52px", overflowX: "auto" }}>
            {!estructura.lotes ? <div style={{ fontSize: 12, color: K.amber, padding: "6px 0" }}>⚠ No hay lotes de Dado por Cumplido aprobados con fecha de aprobación en este período.</div> : null}
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
  filas, garantizadoDe, etiquetaPeriodo, unidadesTerminadas, estructura,
  totalAyudaQuincenas, totalCostoIndirecto, hayCausado, vista, onVista, onVerTrabajador, onExcel,
}) {
  const g = useMemo(() => agruparPorArea(filas, garantizadoDe), [filas, garantizadoDe]);
  const totalValor = filas.reduce((s, f) => s + (Number(f.valorProducido) || 0), 0);
  const totalCosto = filas.reduce((s, f) => s + (f.sinSueldo ? 0 : Number(f.costo) || 0), 0);
  const totalUnidades = filas.reduce((s, f) => s + (Number(f.unidades) || 0), 0);
  const totalAyuda = g.total.ayuda;
  const totalExcedente = g.areas.reduce((s, a) => s + a.excedente, 0);
  const [abiertas, setAbiertas] = useState(() => ({}));
  const [soloAyuda, setSoloAyuda] = useState(false);
  const lista = g.areas.filter((a) => !soloAyuda || a.ayuda > 0);
  const abierta = (a, i) => (abiertas[a.area] !== undefined ? abiertas[a.area] : i === 0 && a.ayuda > 0);
  const cob = g.total.cobertura;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: K.ink }}>
          {g.total.ayudadas > 0
            ? <>En {etiquetaPeriodo} se ayudó con <span style={{ color: K.red }}>{millones(totalAyuda)}</span> a {g.total.ayudadas} {g.total.ayudadas === 1 ? "persona" : "personas"}</>
            : <>En {etiquetaPeriodo} nadie quedó por debajo de lo garantizado</>}
        </div>
        <div style={{ fontSize: 13, color: K.slate }}>
          {cob === null ? "Todavía no hay sueldos cargados para comparar." : <>La producción cubrió el <b>{Math.round(cob * 100)} %</b> de lo garantizado ({millones(g.total.garantizado)}). Ayuda = lo garantizado menos lo producido de quien quedó por debajo.</>}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 28px", background: K.ink, color: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 16 }}>
        <Cifra etiqueta="Costo nómina causado" valor={millones(totalCosto)} sub={hayCausado ? "🟡 incluye causado sin confirmar" : "áreas de producción"} />
        <Cifra etiqueta="Valor producido" valor={millones(totalValor)} sub={`${entero(totalUnidades)} unidades`} />
        <Cifra etiqueta="Total ayudado" valor={millones(totalAyuda)} sub="garantizado − producido" color="#FF9C8E" />
        <Cifra etiqueta="Total excedente" valor={millones(totalExcedente)} sub="no se resta" color="#7FD9AE" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: K.ink, marginRight: 4 }}>¿Dónde está el problema?</div>
        <button type="button" style={pill(vista === "area")} onClick={() => onVista("area")}>Por área</button>
        <button type="button" style={pill(vista === "trabajador")} onClick={() => onVista("trabajador")}>Por trabajador</button>
        {vista === "area" ? <button type="button" style={pill(soloAyuda)} onClick={() => setSoloAyuda(!soloAyuda)}>Solo áreas con ayuda</button> : null}
        <span style={{ flex: 1 }} />
        {onExcel ? <button type="button" onClick={onExcel} style={{ ...pill(false), color: "#3D6B9E", borderColor: "#3D6B9E" }}>📥 Descargar Excel</button> : null}
      </div>

      {vista === "area" ? (
        <>
          <div style={{ fontSize: 12, color: K.slate, marginBottom: 8 }}>De la que más ayuda necesita a la que menos. La barra es la parte de lo garantizado que cubrió la producción (rojo menos de 60 %, ámbar menos de 85 %, verde si se cubre).</div>
          {lista.length ? lista.map((a, i) => (
            <FilaArea key={a.area} a={a} abierta={abierta(a, i)} onToggle={() => setAbiertas({ ...abiertas, [a.area]: !abierta(a, i) })} onVerTrabajador={onVerTrabajador} />
          )) : <div style={{ fontSize: 13, color: K.slate, padding: 10 }}>Ninguna área necesitó ayuda en este período.</div>}
        </>
      ) : null}

      {vista === "area" && estructura && estructura.personas.length > 0 ? <FilaEstructura estructura={estructura} /> : null}

      <details style={{ background: K.white, border: `1px solid ${K.border}`, borderRadius: 12, padding: "0 16px", marginTop: 6 }}>
        <summary style={{ cursor: "pointer", padding: "12px 0", fontWeight: 800, fontSize: 13, color: K.ink }}>Más cifras del período (unidades, ayuda por quincena, costo indirecto)</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px 18px", paddingBottom: 14 }}>
          {[
            [entero(totalUnidades), "Unidades producidas"],
            [entero(unidadesTerminadas), "Unidades en Terminadas (proceso Terminación, toda la empresa)"],
            [dinero(totalAyudaQuincenas), "Ayuda por quincena (Nómina): cuenta las horas trabajadas, sin netear entre quincenas"],
            [dinero(totalCostoIndirecto), "Costo indirecto: horas trabajadas causadas; no es costo del producto"],
          ].map(([v, t]) => (
            <div key={t}><b style={{ display: "block", fontSize: 18, fontVariantNumeric: "tabular-nums", color: K.ink }}>{v}</b><span style={{ fontSize: 12, color: K.slate }}>{t}</span></div>
          ))}
          <div><b style={{ display: "block", fontSize: 15, color: K.amber }}>Presupuesto</b><span style={{ fontSize: 12, color: K.slate }}>Se define por área: elige un área arriba para compararlo con su nómina.</span></div>
        </div>
      </details>
    </div>
  );
}
