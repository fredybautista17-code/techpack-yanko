// ─── TABLERO DE COSTOS (Planeación) ──────────────────────────────────────────
// (2026-10-26, a pedido de Fredy) Un solo lugar para analizar costos. Primera versión, con los datos que ya
// existen en ATLAS:
//   1. Mano de obra por área: lo producido frente a la nómina de cada mes (Centro de Costo: histórico cargado,
//      CORTE en vivo o cierres guardados) en CORTE, ZONA CALOR y CONTROL DE CALIDAD, con el año mes a mes.
//   2. Cotizado frente a real: cotizaciones aprobadas con costos reales (Cotizador) y cuáles hay que renegociar.
// Pendiente (siguientes versiones): materiales por comprar, trabajo en curso y Confección/Terminación.
// Solo lee; no escribe nada. Solo administrador (lo decide el menú de Planeación).
import React, { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useCentroCostoDatos } from "./centro-costo-historico";
import { AREAS_HISTORICO } from "./centro-costo-historico-parser";
import { cotizadoVsReal, resumenAreaMes } from "./costos-calculo";
import CierreDiarioView from "./cierre-diario";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE",
  blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n) || 0));
const millones = (n) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const txt = a >= 1e6 ? `$${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : `$${fmt(a)}`;
  return v < 0 ? `-${txt}` : txt;
};
const pct0 = (x) => (x === null || x === undefined ? "—" : `${Math.round(x)}%`);
const pctDif = (x) => `${x >= 0 ? "+" : "−"}${(Math.abs(x) * 100).toFixed(1).replace(".", ",")}%`;
const colorCob = (cob) => (cob === null || cob === undefined ? C.slate : cob >= 100 ? C.green : cob >= 80 ? C.amber : C.red);
const bgCob = (cob) => (cob === null || cob === undefined ? C.canvas : cob >= 100 ? C.greenBg : cob >= 80 ? C.amberBg : C.redBg);
const FUENTE = { vivo: "en vivo (ATLAS)", historico: "histórico cargado", cierre: "cierre guardado" };

function Tile({ titulo, valor, sub, color }) {
  return (
    <div style={{ flex: "1 1 200px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || C.ink, marginTop: 4 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 12, color: C.slate, marginTop: 2, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}
function Chip({ activo, onClick, children }) {
  return (
    <span
      onClick={onClick}
      style={{
        padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.slate,
      }}
    >
      {children}
    </span>
  );
}
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.white };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };

function ManoDeObraYCotizaciones({ db }) {
  const hoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000), []);
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth() + 1);
  const { datosArea, cargando } = useCentroCostoDatos(anio, "CORTE");
  const [cotizaciones, setCotizaciones] = useState(null);
  const [parametros, setParametros] = useState([]);
  const [errorCot, setErrorCot] = useState("");
  const [soloReneg, setSoloReneg] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([getDocs(collection(db, "cotizaciones")), getDocs(collection(db, "cotizador_parametros"))])
      .then(([cs, ps]) => {
        if (!vivo) return;
        setCotizaciones(cs.docs.map((d) => ({ ...d.data(), id: d.id })));
        setParametros(ps.docs.map((d) => ({ ...d.data(), id: d.id })));
      })
      .catch((e) => { if (vivo) { setCotizaciones([]); setErrorCot(e?.message || "No se pudieron leer las cotizaciones."); } });
    return () => { vivo = false; };
  }, [db]);

  const filasAreas = useMemo(() => AREAS_HISTORICO.map((a) => ({ clave: a.clave, nombre: a.nombre, datos: datosArea[a.clave], r: resumenAreaMes(datosArea[a.clave], mes) })), [datosArea, mes]);
  const totales = useMemo(() => {
    const conDato = filasAreas.filter((f) => f.r.mes);
    const valor = conDato.reduce((s, f) => s + f.r.mes.valor, 0);
    const costo = conDato.reduce((s, f) => s + f.r.mes.costo, 0);
    const vA = filasAreas.reduce((s, f) => s + f.r.anio.valor, 0);
    const cA = filasAreas.reduce((s, f) => s + f.r.anio.costo, 0);
    return { valor, costo, resultado: valor - costo, cobertura: costo > 0 ? (valor / costo) * 100 : null, hay: conDato.length > 0, vA, cA };
  }, [filasAreas]);
  const filasCot = useMemo(() => (cotizaciones ? cotizadoVsReal(cotizaciones, parametros) : []), [cotizaciones, parametros]);
  const nReneg = filasCot.filter((f) => f.supera).length;
  const filasCotVista = soloReneg ? filasCot.filter((f) => f.supera) : filasCot;

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasAreas.map((f) => ({
      Área: f.nombre, [`Producido ${MESES[mes - 1]} ${anio}`]: f.r.mes ? Math.round(f.r.mes.valor) : "", [`Nómina ${MESES[mes - 1]}`]: f.r.mes ? Math.round(f.r.mes.costo) : "",
      Resultado: f.r.mes ? Math.round(f.r.mes.resultado) : "", "Cobertura %": f.r.mes && f.r.mes.cobertura !== null ? Math.round(f.r.mes.cobertura) : "", Fuente: f.r.mes ? FUENTE[f.r.mes.fuente] || "" : "Sin datos",
      "Producido en el año": Math.round(f.r.anio.valor), "Nómina en el año": Math.round(f.r.anio.costo), "Resultado del año": Math.round(f.r.anio.resultado),
    }))), "Mano de obra por área");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasCot.map((f) => ({
      Cliente: f.cliente, Referencia: f.referencia, Versión: f.version, "Precio aprobado": Math.round(f.fijo), "Precio con costos reales": Math.round(f.nuevo),
      "Diferencia $": Math.round(f.dif), "Diferencia %": Math.round(f.pct * 1000) / 10, "Margen real %": Math.round(f.margenReal * 1000) / 10,
      "Aviso desde %": Math.round(f.umbral * 1000) / 10, Estado: f.supera ? "Para renegociar" : f.revisada ? "Revisada" : "Dentro del aviso",
    }))), "Cotizado vs real");
    XLSX.writeFile(wb, `Tablero_de_costos_${anio}-${String(mes).padStart(2, "0")}.xlsx`);
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Tablero de costos</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate, lineHeight: 1.5, maxWidth: 820 }}>
          Cuánto produjo cada área frente a lo que cuesta su nómina, y qué cotizaciones aprobadas ya no cubren sus costos reales.
          Es la primera versión: usa los datos que ATLAS ya tiene. Solo lectura.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Mes</span>
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }}>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }}>
          {[hoy.getUTCFullYear() - 1, hoy.getUTCFullYear()].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={exportarExcel} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}>⬇ Excel</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Tile titulo={`Producido · ${MESES[mes - 1]}`} valor={totales.hay ? millones(totales.valor) : "—"} sub={`En lo corrido del año: ${millones(totales.vA)}`} />
        <Tile titulo={`Nómina de esas áreas · ${MESES[mes - 1]}`} valor={totales.hay ? millones(totales.costo) : "—"} sub={`En lo corrido del año: ${millones(totales.cA)}`} />
        <Tile
          titulo="Resultado del mes"
          valor={totales.hay ? `${totales.resultado >= 0 ? "+" : ""}${millones(totales.resultado)}` : "—"}
          color={totales.hay ? (totales.resultado >= 0 ? C.green : C.red) : C.slate}
          sub={totales.hay ? `Lo producido cubre el ${pct0(totales.cobertura)} de la nómina` : "No hay datos de este mes"}
        />
        <Tile
          titulo="Cotizaciones para renegociar"
          valor={cotizaciones === null ? "…" : String(nReneg)}
          color={nReneg ? C.red : C.green}
          sub={`${filasCot.length} cotizaciones con costos reales`}
        />
      </div>

      <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 8 }}>1. Mano de obra por área</div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", marginBottom: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Área</th>
              <th style={th}>Producido</th>
              <th style={th}>Nómina</th>
              <th style={th}>Resultado</th>
              <th style={th}>Cobertura</th>
              <th style={{ ...th, textAlign: "left" }}>Fuente</th>
              <th style={th}>Resultado del año</th>
              <th style={{ ...th, textAlign: "center" }}>Cobertura mes a mes ({anio})</th>
            </tr>
          </thead>
          <tbody>
            {filasAreas.map((f) => (
              <tr key={f.clave}>
                <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{f.nombre}</td>
                {f.r.mes ? (
                  <>
                    <td style={td}>{millones(f.r.mes.valor)}</td>
                    <td style={td}>{millones(f.r.mes.costo)}</td>
                    <td style={{ ...td, fontWeight: 800, color: f.r.mes.resultado >= 0 ? C.green : C.red }}>{f.r.mes.resultado >= 0 ? "+" : ""}{millones(f.r.mes.resultado)}</td>
                    <td style={td}><span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800, color: colorCob(f.r.mes.cobertura), background: bgCob(f.r.mes.cobertura) }}>{pct0(f.r.mes.cobertura)}</span></td>
                    <td style={{ ...td, textAlign: "left", color: C.slate, fontSize: 12 }}>{FUENTE[f.r.mes.fuente] || ""}</td>
                  </>
                ) : (
                  <td colSpan={5} style={{ ...td, textAlign: "left", color: C.slate }}>{cargando ? "Cargando…" : "Sin datos de este mes"}</td>
                )}
                <td style={{ ...td, fontWeight: 800, color: f.r.anio.resultado >= 0 ? C.green : C.red }}>{f.r.anio.costo > 0 ? `${f.r.anio.resultado >= 0 ? "+" : ""}${millones(f.r.anio.resultado)}` : "—"}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 3 }}>
                    {MESES_CORTOS.map((l, i) => {
                      const m = f.datos?.meses?.[i + 1];
                      const cob = m && m.costo > 0 ? (m.valor / m.costo) * 100 : null;
                      return (
                        <span
                          key={i}
                          title={m ? `${MESES[i]}: produjo ${millones(m.valor)} · nómina ${millones(m.costo)} · cobertura ${pct0(cob)}` : `${MESES[i]}: sin datos`}
                          style={{ width: 20, height: 20, borderRadius: 4, fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", color: colorCob(cob), background: bgCob(cob), outline: i + 1 === mes ? `2px solid ${C.ink}` : "none" }}
                        >
                          {l}
                        </span>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, textAlign: "left", color: C.slate }}>Confección y Terminación</td>
              <td colSpan={7} style={{ ...td, textAlign: "left", color: C.slate, fontSize: 12 }}>Todavía sin datos: falta definir de dónde sale su costo (talleres externos y planta propia).</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 22, lineHeight: 1.6 }}>
        Producido = lo que hizo cada trabajador (valor de Busint). Nómina = lo que cuesta su sueldo. Cobertura = producido ÷ nómina: verde desde 100 %, ámbar desde 80 %, rojo por debajo.
        Es la misma lectura del panel «Año» de Centro de Costo; los cuadritos son los meses de enero a diciembre y el marcado es el mes elegido.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>2. Cotizado frente a real</div>
        <Chip activo={soloReneg} onClick={() => setSoloReneg((v) => !v)}>{soloReneg ? "✓ " : ""}Solo para renegociar</Chip>
        <span style={{ fontSize: 12, color: C.slate }}>{filasCotVista.length} {filasCotVista.length === 1 ? "cotización" : "cotizaciones"}</span>
      </div>
      {errorCot ? <div style={{ marginBottom: 10, fontSize: 13, color: C.red, fontWeight: 600 }}>⚠ {errorCot}</div> : null}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxHeight: "50vh", marginBottom: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Cliente</th>
              <th style={{ ...th, textAlign: "left" }}>Referencia</th>
              <th style={th}>Precio aprobado</th>
              <th style={th}>Con costos reales</th>
              <th style={th}>Diferencia</th>
              <th style={th}>Margen real</th>
              <th style={{ ...th, textAlign: "left" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filasCotVista.map((f) => (
              <tr key={f.id}>
                <td style={{ ...td, textAlign: "left", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{f.cliente}</td>
                <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{f.referencia || "—"} <span style={{ fontWeight: 500, color: C.slate }}>V{f.version}</span></td>
                <td style={td}>{money(f.fijo)}</td>
                <td style={td}>{money(f.nuevo)}</td>
                <td style={{ ...td, fontWeight: 800, color: f.supera ? C.red : f.pct > 0 ? C.amber : C.green }}>{pctDif(f.pct)} <span style={{ fontWeight: 500, color: C.slate }}>({f.dif >= 0 ? "+" : "−"}{money(Math.abs(f.dif))})</span></td>
                <td style={td}>{(f.margenReal * 100).toFixed(1).replace(".", ",")}%</td>
                <td style={{ ...td, textAlign: "left" }}>
                  <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800, color: f.supera ? C.red : f.revisada ? C.blue : C.green, background: f.supera ? C.redBg : f.revisada ? C.blueBg : C.greenBg }}>
                    {f.supera ? "Para renegociar" : f.revisada ? "Revisada" : `Dentro del aviso (${(f.umbral * 100).toFixed(0)}%)`}
                  </span>
                </td>
              </tr>
            ))}
            {cotizaciones === null ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: C.slate, padding: 24 }}>Leyendo cotizaciones…</td></tr>
            ) : !filasCotVista.length ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: C.slate, padding: 24 }}>{soloReneg ? "Ninguna cotización para renegociar." : "Todavía no hay cotizaciones aprobadas con costos reales."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 22, lineHeight: 1.6 }}>
        Los costos reales los ajusta Contabilidad al dar por cumplido un lote, sin mover el precio aprobado. «Con costos reales» es el precio que daría con ese costo y el mismo margen; «Margen real» es la utilidad que deja el precio aprobado con esos costos.
        Para renegociar = la subida llega al aviso del cliente (3 % si no tiene otro) y nadie la ha marcado como revisada.
      </div>

      <div style={{ background: C.amberBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", fontSize: 13, color: C.amber, fontWeight: 600, lineHeight: 1.5 }}>
        Próximas versiones: materiales por comprar (con su costo), trabajo en curso frente a su costo estimado y los costos de Confección y Terminación.
      </div>
    </div>
  );
}

// (2026-10-26) Dos pestañas: el cierre diario por área (para la persona encargada de costos) y lo que ya había
// (mano de obra por mes y cotizado frente a real).
export default function TableroCostosView({ db }) {
  const [pestana, setPestana] = useState("cierre");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Chip activo={pestana === "cierre"} onClick={() => setPestana("cierre")}>Cierre diario</Chip>
        <Chip activo={pestana === "analisis"} onClick={() => setPestana("analisis")}>Mano de obra y cotizaciones</Chip>
      </div>
      {pestana === "cierre" ? <CierreDiarioView db={db} /> : <ManoDeObraYCotizaciones db={db} />}
    </div>
  );
}
