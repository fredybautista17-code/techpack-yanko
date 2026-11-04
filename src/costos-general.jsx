// ─── ¿CUBRO MIS COSTOS? (Tablero de Costos) ──────────────────────────────────
// (2026-11-04, a pedido de Fredy) Cierre mensual del centro de costo general:
//   · Recogido con los básicos: lo que dejan los lotes aprobados en el mes en Dado por Cumplido (base × cortadas + los dos
//     porcentajes), por categoría BASE.
//   · Por pagar fuera de los lotes: gastos del Excel (se cargan aquí cada mes) + nómina fiscal confirmada + lo que se pone
//     de más en destajo (ayudas − excedentes, de los cierres de Centro de Costo) + provisión de cesantías, prima, intereses
//     y vacaciones de esos trabajadores.
//   · A quién estamos ayudando: lista por trabajador con lo que produjo, lo que se le pagó y su provisión.
// Lo que producen los de destajo ya está dentro del costo del lote; por eso aquí solo entra la diferencia.
// Escribe solo en costos_gastos_mes (gastos cargados) y costos_cierres_mes (foto del cierre). Lo demás solo lo lee.
import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { useCentroCostoDatos } from "./centro-costo-historico";
import { AREAS_HISTORICO, normTexto } from "./centro-costo-historico-parser";
import { cierreGeneral, parsearGastos, totalGastos } from "./costos-general-calculo";

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

function Tile({ titulo, valor, sub, color, fondo }) {
  return (
    <div style={{ flex: "1 1 220px", background: fondo || C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
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

export default function CostosGeneralView({ db }) {
  const hoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000), []);
  const [anio, setAnio] = useState(hoy.getUTCFullYear());
  const [mes, setMes] = useState(hoy.getUTCMonth() + 1);
  const ym = `${anio}-${String(mes).padStart(2, "0")}`;
  const { cierresResueltos, datosArea, cargando: cargandoCC } = useCentroCostoDatos(anio, "CORTE");

  const [recarga, setRecarga] = useState(0);
  const [datos, setDatos] = useState({ cargando: true, error: "", lotes: [], bases: [], fichas: [], liqFiscal: [], gastosMes: null, gastosAnterior: null, cierreGuardado: null });
  const [gastosEdit, setGastosEdit] = useState(null);
  const [archivoGastos, setArchivoGastos] = useState("");
  const [msgGastos, setMsgGastos] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msgCierre, setMsgCierre] = useState("");
  const [busq, setBusq] = useState("");
  const [verGastos, setVerGastos] = useState(false);

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
    ])
      .then(([lotes, bases, fichas, liq, gastos, cierres]) => {
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
          gastosMes: gs.find((g) => g.id === ym) || null,
          gastosAnterior: anteriores[0] || null,
          cierreGuardado: cierres.docs.map((d) => ({ ...d.data(), id: d.id })).find((c) => c.id === ym) || null,
        });
      })
      .catch((e) => { if (vivo) setDatos((d) => ({ ...d, cargando: false, error: e?.message || "No se pudieron leer los datos." })); });
    return () => { vivo = false; };
  }, [db, anio, mes, ym, recarga]);

  const origenGastos = gastosEdit ? "edicion" : datos.gastosMes ? "guardado" : datos.gastosAnterior ? "anterior" : "ninguno";
  const lineasGastos = gastosEdit || datos.gastosMes?.lineas || datos.gastosAnterior?.lineas || [];

  const areasDestajo = useMemo(() => AREAS_HISTORICO.map((a) => {
    const r = cierresResueltos.get(`${a.clave}|${ym}`);
    const m = datosArea[a.clave]?.meses?.[mes];
    if (r && r.trabajadores?.length) return { clave: a.clave, nombre: a.nombre, trabajadores: r.trabajadores, dias: r.dias, fuente: "cierre" };
    if (m && (m.valor > 0 || m.costo > 0)) return { clave: a.clave, nombre: a.nombre, agregado: { valor: m.valor, costo: m.costo }, fuente: m.fuente };
    return null;
  }).filter(Boolean), [cierresResueltos, datosArea, ym, mes]);

  const r = useMemo(() => cierreGeneral({ lotes: datos.lotes, bases: datos.bases, gastos: lineasGastos, liquidacionesFiscal: datos.liqFiscal, areasDestajo, fichas: datos.fichas }), [datos, lineasGastos, areasDestajo]);

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
      const limpio = (p) => ({ nombre: p.nombre, area: p.area, valor: Math.round(p.valor), costo: Math.round(p.costo), provision: Math.round(p.provision) });
      await setDoc(doc(db, "costos_cierres_mes", ym), {
        anio, mes, guardadoEn: new Date().toISOString(), gastosOrigen: origenGastos,
        resumen: {
          aporte: Math.round(r.recogido.aporte), basicos: Math.round(r.recogido.basicos), porcentajes: Math.round(r.recogido.porcentajes), lotes: r.recogido.lotes, cortadas: r.recogido.cortadas, despachadas: r.recogido.despachadas,
          gastos: Math.round(r.gastos.total), fiscal: Math.round(r.fiscal.total), destajoAyudas: Math.round(r.destajo.ayudas), destajoExcedentes: Math.round(r.destajo.excedentes), destajoProvision: Math.round(r.destajo.provision),
          estructura: Math.round(r.estructura), resultado: Math.round(r.resultado),
        },
        areas: r.destajo.areas.map((a) => ({ clave: a.clave, nombre: a.nombre, ayudas: Math.round(a.ayudas), excedentes: Math.round(a.excedentes), provision: Math.round(a.provision) })),
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

  const personas = useMemo(() => {
    const q = normTexto(busq);
    return r.destajo.personas.filter((p) => !q || normTexto(p.nombre).includes(q) || normTexto(p.area).includes(q));
  }, [r, busq]);

  const alcanza = r.resultado >= 0;
  const sinDatos = r.recogido.lotes === 0 && r.estructura === 0;
  const quincenasFiscal = r.fiscal.quincenas.length;
  const sinDetalle = r.destajo.areas.filter((a) => !a.detalle);

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.6, maxWidth: 900 }}>
        ¿Lo que recogen los lotes con los básicos paga lo que está fuera del costo del lote? Lo que producen los trabajadores de destajo ya entra al lote; aquí solo se suma lo que ponemos de más (ayudas menos excedentes) y su provisión de cesantías, prima, intereses y vacaciones.
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
        <Tile titulo="Recogido con los básicos" valor={money(r.recogido.aporte)} color={C.green} sub={`${r.recogido.lotes} lotes aprobados · ${fmt(r.recogido.cortadas)} prendas cortadas`} />
        <Tile titulo="Por pagar fuera de los lotes" valor={money(r.estructura)} color={C.amber} sub="gastos + nómina fiscal + destajo (ayuda y provisión)" />
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
              <tr key={c.id || "sin"}><td style={tdL}>{c.nombre}</td><td style={td}>{c.lotes}</td><td style={td}>{fmt(c.cortadas)}</td><td style={td}>{fmt(c.despachadas)}</td><td style={td}>{money(c.basicos)}</td><td style={td}>{money(c.porcentajes)}</td><td style={{ ...td, fontWeight: 800 }}>{money(c.aporte)}</td></tr>
            ))}
            {!r.recogido.categorias.length && <tr><td colSpan={7} style={{ ...td, textAlign: "left", color: C.slate }}>Ningún lote aprobado en Dado por Cumplido en este mes.</td></tr>}
            {r.recogido.categorias.length > 0 && (
              <tr style={{ background: C.canvas }}><td style={tdL}>Total</td><td style={{ ...td, fontWeight: 800 }}>{r.recogido.lotes}</td><td style={{ ...td, fontWeight: 800 }}>{fmt(r.recogido.cortadas)}</td><td style={{ ...td, fontWeight: 800 }}>{fmt(r.recogido.despachadas)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.recogido.basicos)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.recogido.porcentajes)}</td><td style={{ ...td, fontWeight: 800, color: C.green }}>{money(r.recogido.aporte)}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8 }}>2 · Lo que hay que pagar fuera de los lotes</div>
      <div style={caja}>
        <table style={tabla}>
          <thead><tr><th style={thL}>Concepto</th><th style={thL}>De dónde sale</th><th style={th}>Valor del mes</th></tr></thead>
          <tbody>
            <tr><td style={tdL}>Gastos del Excel</td><td style={{ ...td, textAlign: "left", color: C.slate }}>{r.gastos.incluidas} gastos incluidos{r.gastos.excluidas ? ` · ${r.gastos.excluidas} fuera (${money(r.gastos.excluidoValor)})` : ""}{origenGastos === "anterior" ? " · del mes anterior" : origenGastos === "ninguno" ? " · sin cargar" : ""}</td><td style={td}>{money(r.gastos.total)}</td></tr>
            <tr><td style={tdL}>Nómina fiscal completa</td><td style={{ ...td, textAlign: "left", color: C.slate }}>{r.fiscal.personas} personas · {quincenasFiscal} de 2 quincenas confirmadas (neto + seguridad social + prestaciones)</td><td style={td}>{money(r.fiscal.total)}</td></tr>
            <tr><td style={tdL}>Destajo: ayuda neta</td><td style={{ ...td, textAlign: "left", color: C.slate }}>{money(r.destajo.ayudas)} de ayudas − {money(r.destajo.excedentes)} de excedentes</td><td style={td}>{money(r.destajo.neta)}</td></tr>
            <tr><td style={tdL}>Destajo: provisión</td><td style={{ ...td, textAlign: "left", color: C.slate }}>Cesantías, prima, intereses y vacaciones</td><td style={td}>{money(r.destajo.provision)}</td></tr>
            <tr style={{ background: C.canvas }}><td style={tdL}>Total por pagar</td><td style={td} /><td style={{ ...td, fontWeight: 800, color: C.amber }}>{money(r.estructura)}</td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8 }}>3 · Áreas de destajo: lo que pone la estructura</div>
      <div style={caja}>
        <table style={tabla}>
          <thead><tr><th style={thL}>Área</th><th style={th}>Personas ayudadas</th><th style={th}>Ayudas</th><th style={th}>Excedentes</th><th style={th}>Ayuda neta</th><th style={th}>Provisión</th><th style={th}>Extra que pone la estructura</th></tr></thead>
          <tbody>
            {r.destajo.areas.map((a) => (
              <tr key={a.clave}><td style={tdL}>{a.nombre}</td><td style={td}>{a.detalle ? `${a.ayudados} de ${a.total}` : "—"}</td><td style={{ ...td, color: C.red }}>{money(a.ayudas)}</td><td style={{ ...td, color: C.green }}>{money(a.excedentes)}</td><td style={td}>{money(a.neta)}</td><td style={td}>{money(a.provision)}</td><td style={{ ...td, fontWeight: 800 }}>{money(a.extra)}</td></tr>
            ))}
            {!r.destajo.areas.length && <tr><td colSpan={7} style={{ ...td, textAlign: "left", color: C.slate }}>Todavía no hay cierres de Centro de Costo de este mes.</td></tr>}
            {r.destajo.areas.length > 0 && (
              <tr style={{ background: C.canvas }}><td style={tdL}>Total destajo</td><td style={td} /><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.ayudas)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.excedentes)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.neta)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.provision)}</td><td style={{ ...td, fontWeight: 800 }}>{money(r.destajo.extra)}</td></tr>
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
                <td style={td}><Etiqueta valor={p.resultado} /></td>
                <td style={td}>{money(p.provision)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{money(p.extra)}</td>
              </tr>
            ))}
            {!personas.length && <tr><td colSpan={7} style={{ ...td, textAlign: "left", color: C.slate }}>Sin trabajadores para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 22, lineHeight: 1.6 }}>
        Resultado = lo que produjo − lo que se le pagó (excedente si es positivo, ayuda si es negativo). Extra total = su ayuda (si la hay) + su provisión; los excedentes se restan en el total del área. La provisión usa las mismas tasas de Nómina (cesantías y prima 8,33 %, intereses 12 % de las cesantías, vacaciones 4,17 %) y se proporciona a lo pagado en el mes. * = sin ficha en Nómina: se usó el mínimo legal.
      </div>

      <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        5 · Gastos del mes
        <Boton onClick={() => setVerGastos((v) => !v)}>{verGastos ? "Ocultar" : `Ver y ajustar (${lineasGastos.length})`}</Boton>
        <label style={{ display: "inline-block" }}>
          <input type="file" accept=".xls,.xlsx" style={{ display: "none" }} onChange={(e) => { leerExcelGastos(e.target.files?.[0]); e.target.value = ""; }} />
          <span style={{ display: "inline-block", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink }}>📂 Cargar Excel de gastos</span>
        </label>
        {(gastosEdit || origenGastos === "anterior") ? <Boton primario onClick={guardarGastos} disabled={guardando || !lineasGastos.length}>Guardar gastos de {MESES[mes - 1].toLowerCase()}</Boton> : null}
      </div>
      {msgGastos ? <div style={{ fontSize: 12.5, color: C.blue, fontWeight: 700, marginBottom: 8 }}>{msgGastos}</div> : null}
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
                  <td style={{ ...td, textAlign: "left", color: C.slate }}>{l.motivo || l.frecuencia}</td>
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
        el aporte cuenta cuando Contabilidad aprueba el lote en Dado por Cumplido; Confección y Terminación todavía no tienen cierre de ayuda; la prestación de servicios no está incluida (si va en los gastos del Excel, ya cuenta ahí).
      </div>
    </div>
  );
}
