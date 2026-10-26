// ─── TABLERO DE COSTOS — CIERRE DIARIO (pantalla) ────────────────────────────
// (2026-10-26, a pedido de Fredy) Para la persona encargada de costos: en una sola pantalla, cómo cerró cada área el
// día — lo producido contra el sueldo del día, el saldo del día, el saldo acumulado (se reinicia cada mes; también
// Año y Total), quiénes cubren su salario y si cada área cumple su meta diaria. Sin gráficas: tarjetas y tablas.
//   · Con costo: CORTE, ZONA CALOR, CONTROL DE CALIDAD (cierres de Centro de Costo; CORTE también en vivo).
//   · Solo unidades contra meta: CONFECCIÓN (Entradas de Planta), TERMINACIÓN (producción de Nómina en procesos de
//     Terminación), DESPACHOS (bitácora de despachos facturados).
// Solo lee, salvo las metas diarias que guarda el administrador en costos_config/main. Los cálculos viven en
// cierre-diario-calculo.js.
import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { useCentroCostoDatos } from "./centro-costo-historico";
import { claveArea } from "./centro-costo-historico-parser";
import { cargaEntradasActivaDe } from "./entradas-planta-util";
import {
  METAS_DEFECTO, cierresDiarios, indiceCortes, diaDeArea, cubrenDelDia, acumuladoMes, saldoMesCompleto, saldoAnioHasta,
  unidadesCortePorDia, unidadesDespachos, unidadesConfeccion, unidadesTerminacion, cumplimientoMeta, estadoMeta,
  diasDelMesHasta, esHabilISO, sumarDiasISO,
} from "./cierre-diario-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", greenLn: "#C5E6D8", red: "#E85D4A", redBg: "#FDF0EE", redLn: "#F0CCC6",
  blue: "#3D6B9E", blueBg: "#EBF1F7", blueLn: "#C9D9E8", amber: "#C47C1A", amberBg: "#FDF5E6", amberLn: "#EBD9B4",
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n) || 0));
const signed = (n) => `${Number(n) >= 0 ? "+" : "−"}$${fmt(Math.abs(Number(n) || 0))}`;
const millones = (n) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const txt = a >= 1e6 ? `$${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : `$${fmt(a)}`;
  return v < 0 ? `−${txt}` : txt;
};
const colorSaldo = (n) => (Math.round(Number(n) || 0) >= 0 ? C.green : C.red);
const etiquetaDia = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const AREAS_COSTO = [
  { clave: "CORTE", nombre: "Corte", metaClave: "corte" },
  { clave: "ZONACALOR", nombre: "Zona calor", metaClave: null },
  { clave: "CONTROLCALIDAD", nombre: "Control de calidad", metaClave: null },
];
const AREAS_UNIDADES = [
  { id: "confeccion", nombre: "Confección", fuente: "Entradas de Planta (planta propia y talleres)" },
  { id: "terminacion", nombre: "Terminación", fuente: "producción de Nómina en procesos de Terminación" },
  { id: "despachos", nombre: "Despachos", fuente: "bitácora de despachos facturados, netos de devoluciones" },
];

const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.white };
const td = { padding: "10px 10px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };

function Tarjeta({ titulo, valor, sub, color, fondo, linea }) {
  return (
    <div style={{ flex: "1 1 210px", background: fondo, border: `1px solid ${linea}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 13, color: C.slate }}>{titulo}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, marginTop: 2, lineHeight: 1.15 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginTop: 6, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}
function Chip({ activo, onClick, children }) {
  return (
    <span
      onClick={onClick}
      style={{ padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.slate }}
    >
      {children}
    </span>
  );
}
function Pastilla({ texto, color, fondo }) {
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800, color, background: fondo }}>{texto}</span>;
}
const BOTON = { padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink };

const ESTADO_CIERRE = {
  automatico: { t: "Automático 10 pm", c: C.green, f: C.greenBg },
  manual: { t: "Manual", c: C.blue, f: C.blueBg },
  calculado: { t: "Calculado, sin cierre guardado", c: C.amber, f: C.amberBg },
  sin_cierre: { t: "Sin cierre", c: C.red, f: C.redBg },
};

function celdaMeta(unidades, meta, nivelDe) {
  if (!(meta > 0)) return <Pastilla texto="sin meta" color={C.slate} fondo={C.canvas} />;
  const e = nivelDe;
  const col = e.nivel === "cumple" ? C.green : e.nivel === "cerca" ? C.amber : C.red;
  const bg = e.nivel === "cumple" ? C.greenBg : e.nivel === "cerca" ? C.amberBg : C.redBg;
  return <Pastilla texto={`${fmt(unidades)} de ${fmt(meta)} · ${Math.round(e.pct)} %`} color={col} fondo={bg} />;
}

// Tabla de cada trabajador de un área (día elegido y mes a la fecha). La usa el Tablero de costos y el Mi Día.
export function TablaTrabajadores({ fila: f, esHabil, titulo }) {
  const delMes = new Map(f.ac.trabajadores.map((t) => [t.id, t]));
  const ids = new Set([...f.dia.trabajadores.map((t) => t.id), ...f.ac.trabajadores.map((t) => t.id)]);
  const filas = [...ids].map((id) => {
    const d = f.dia.trabajadores.find((t) => t.id === id);
    const m = delMes.get(id);
    return { id, nombre: (d || m).nombre, d, m, res: m ? m.valor - m.costo : 0 };
  }).sort((a, b) => a.res - b.res);
  return (
    <>
      {titulo ? <div style={{ padding: "12px 16px 4px", fontSize: 13, fontWeight: 800, color: C.ink }}>{titulo}</div> : null}
      {filas.length ? (
        <div style={{ overflow: "auto", margin: "0 16px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Trabajador</th>
                <th style={th}>Produjo hoy</th>
                <th style={th}>Salario del día</th>
                <th style={th}>¿Cubre?</th>
                <th style={th}>Produjo en el mes</th>
                <th style={th}>Salario a la fecha</th>
                <th style={th}>Resultado a la fecha</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => {
                const cubre = r.d && r.d.costo > 0 && esHabil ? r.d.valor + 0.5 >= r.d.costo : null;
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{r.nombre}</td>
                    <td style={td}>{r.d ? money(r.d.valor) : "—"}</td>
                    <td style={td}>{r.d ? money(r.d.costoContado) : "—"}</td>
                    <td style={td}>{cubre === null ? "—" : cubre ? <Pastilla texto="cubre" color={C.green} fondo={C.greenBg} /> : <Pastilla texto={`faltan ${money(r.d.costo - r.d.valor)}`} color={C.red} fondo={C.redBg} />}</td>
                    <td style={td}>{r.m ? money(r.m.valor) : "—"}</td>
                    <td style={td}>{r.m ? money(r.m.costo) : "—"}</td>
                    <td style={{ ...td, fontWeight: 800, color: r.m ? colorSaldo(r.res) : C.slate }}>{r.m ? signed(r.res) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ margin: "0 16px", fontSize: 12.5, color: C.slate }}>No hay cierre guardado ni trabajadores para este día.</div>
      )}
    </>
  );
}

// Días hábiles del mes con su cantidad de unidades; en verde los que llegan a la meta.
export function ChipsMetaDias({ porDia, meta, anio, mes, diaSel }) {
  const dias = diasDelMesHasta(anio, mes, diaSel).filter(esHabilISO).map((iso) => ({ iso, u: porDia.get(iso) || 0 }));
  return (
    <>
      <div style={{ padding: "12px 16px 4px", fontSize: 13, fontWeight: 800, color: C.ink }}>Meta día a día ({MESES[mes - 1].toLowerCase()}, días hábiles)</div>
      <div style={{ margin: "0 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {dias.map((x) => {
          const ok = x.u >= meta;
          return (
            <span key={x.iso} title={`${etiquetaDia(x.iso)}: ${fmt(x.u)} de ${fmt(meta)}`} style={{ padding: "4px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, color: ok ? C.green : C.red, background: ok ? C.greenBg : C.redBg }}>
              {x.iso.slice(8)} · {fmt(x.u)}
            </span>
          );
        })}
      </div>
    </>
  );
}

// (2026-10-26) Todo el cálculo del cierre del día vive aquí para que lo usen la pantalla del Tablero de costos y el
// Mi Día de cada líder. `conUnidades` = también leer Confección, Terminación y Despachos (el Mi Día de un líder no lo necesita).
export function useCierreDiario(db, diaSel, alcance, conUnidades = true) {
  const anio = Number(diaSel.slice(0, 4));
  const mes = Number(diaSel.slice(5, 7));
  const { historico, pedidos, trabajadoresCorte, cargando, cierres, cierresResueltos, datosArea, construirDatosArea, incluirTrabajador } = useCentroCostoDatos(anio, "CORTE");

  // Metas diarias (costos_config/main) y metas por área de Nómina (Zona calor y Control de calidad)
  const [cfg, setCfg] = useState(null);
  const [areasNomina, setAreasNomina] = useState([]);
  useEffect(() => {
    const u1 = onSnapshot(doc(db, "costos_config", "main"), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({}));
    const u2 = onSnapshot(collection(db, "nomina_areas"), (s) => setAreasNomina(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {});
    return () => { u1(); u2(); };
  }, [db]);
  const metas = { ...METAS_DEFECTO, ...(cfg?.metas || {}) };
  const metaNomina = (clave) => Number(areasNomina.find((a) => claveArea(a.nombre) === clave)?.metaDiariaUnidades) || 0;

  // Unidades de Confección, Terminación y Despachos del mes elegido
  const [unid, setUnid] = useState({ confeccion: null, terminacion: null, despachos: null });
  const [errUnid, setErrUnid] = useState({});
  const inicioMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const finMes = `${anio}-${String(mes).padStart(2, "0")}-31`;
  useEffect(() => {
    if (!conUnidades) return undefined;
    let vivo = true;
    const listo = (id, mapa) => vivo && setUnid((u) => ({ ...u, [id]: mapa }));
    const fallo = (id, e) => { if (vivo) { setUnid((u) => ({ ...u, [id]: new Map() })); setErrUnid((x) => ({ ...x, [id]: e?.message || "No se pudo leer." })); } };
    setUnid({ confeccion: null, terminacion: null, despachos: null });
    getDocs(collection(db, "planta_entradas_cargas"))
      .then((s) => {
        const carga = cargaEntradasActivaDe(s.docs.map((d) => ({ ...d.data(), id: d.id })));
        const delMes = (carga?.entradas || []).filter((e) => String(e.fecha || "").slice(0, 10) >= inicioMes && String(e.fecha || "").slice(0, 10) <= finMes);
        listo("confeccion", unidadesConfeccion(delMes));
      })
      .catch((e) => fallo("confeccion", e));
    getDocs(query(collection(db, "nomina_produccion"), where("fecha", ">=", inicioMes), where("fecha", "<=", finMes)))
      .then((s) => listo("terminacion", unidadesTerminacion(s.docs.map((d) => d.data()))))
      .catch((e) => fallo("terminacion", e));
    getDocs(query(collection(db, "bitacora_despachos"), where("fecha", ">=", inicioMes), where("fecha", "<=", finMes)))
      .then((s) => listo("despachos", unidadesDespachos(s.docs.map((d) => d.data()))))
      .catch((e) => fallo("despachos", e));
    return () => { vivo = false; };
  }, [db, inicioMes, finMes, conUnidades]);

  const cierresMap = useMemo(() => cierresDiarios(cierres, claveArea, incluirTrabajador), [cierres, incluirTrabajador]);
  const corteIdx = useMemo(() => indiceCortes(pedidos), [pedidos]);
  const unidCorte = useMemo(() => unidadesCortePorDia(corteIdx), [corteIdx]);

  // Año más antiguo con datos (para «Total»)
  const primerAnio = useMemo(() => {
    let min = anio;
    historico.forEach((h) => { if (h.anio && h.anio < min) min = h.anio; });
    cierresResueltos.forEach((_, k) => { const y = Number(k.split("|")[1]?.slice(0, 4)); if (y && y < min) min = y; });
    return Math.max(min, anio - 5);
  }, [historico, cierresResueltos, anio]);

  const filasCosto = useMemo(() => AREAS_COSTO.map((a) => {
    const dia = diaDeArea(a.clave, diaSel, cierresMap, corteIdx, trabajadoresCorte);
    const mm = String(mes).padStart(2, "0");
    const ac = acumuladoMes({
      clave: a.clave, anio, mes, hastaISO: diaSel, cierresMap, corteIdx, trabajadoresCorte,
      datosMes: datosArea[a.clave]?.meses?.[mes] || null,
      trabajadoresMes: cierresResueltos.get(`${a.clave}|${anio}-${mm}`)?.trabajadores || [],
    });
    const saldoAnio = saldoAnioHasta(datosArea[a.clave], mes, ac.saldo);
    let saldoTotal = saldoAnio;
    for (let y = primerAnio; y < anio; y++) {
      const da = construirDatosArea(y, "CORTE")[a.clave];
      for (let m = 1; m <= 12; m++) saldoTotal += saldoMesCompleto(da, m);
    }
    const saldoAlcance = alcance === "mes" ? ac.saldo : alcance === "anio" ? saldoAnio : saldoTotal;
    const meta = a.metaClave ? Number(metas[a.metaClave]) || 0 : metaNomina(a.clave);
    const porDia = a.clave === "CORTE" ? unidCorte : (() => { const m = new Map(); diasDelMesHasta(anio, mes, null).forEach((iso) => { const g = cierresMap.get(`${a.clave}|${iso}`); if (g) m.set(iso, g.unidades); }); return m; })();
    const cubren = cubrenDelDia(dia, diaSel);
    const saldoDia = dia.valor - dia.costoContado;
    const meses = dia.estado === "sin_cierre" && !dia.trabajadores.length;
    return { ...a, dia, ac, saldoDia, saldoAlcance, meta, porDia, cubren, sinCierre: meses, cumpl: cumplimientoMeta(porDia, meta, anio, mes, diaSel), em: estadoMeta(dia.unidades, meta) };
  }), [diaSel, cierresMap, corteIdx, trabajadoresCorte, datosArea, cierresResueltos, alcance, anio, mes, primerAnio, construirDatosArea, cfg, areasNomina, unidCorte]); // eslint-disable-line

  const filasUnid = useMemo(() => AREAS_UNIDADES.map((a) => {
    const porDia = unid[a.id];
    const meta = Number(metas[a.id]) || 0;
    const u = porDia ? porDia.get(diaSel) || 0 : null;
    return { ...a, porDia, meta, u, em: u === null ? { pct: null, nivel: "sin_meta" } : estadoMeta(u, meta), cumpl: porDia ? cumplimientoMeta(porDia, meta, anio, mes, diaSel) : null };
  }), [unid, diaSel, anio, mes, cfg]); // eslint-disable-line

  const tot = useMemo(() => {
    const cierran = filasCosto.filter((f) => f.dia.estado === "automatico" || f.dia.estado === "manual");
    const faltan = filasCosto.filter((f) => f.dia.estado === "sin_cierre" || f.dia.estado === "calculado").map((f) => f.nombre);
    const valor = filasCosto.reduce((s, f) => s + f.dia.valor, 0);
    const costo = filasCosto.reduce((s, f) => s + f.dia.costoContado, 0);
    const si = filasCosto.reduce((s, f) => s + (f.cubren.habil ? f.cubren.si : 0), 0);
    const totalT = filasCosto.reduce((s, f) => s + (f.cubren.habil ? f.cubren.total : 0), 0);
    const saldoAlc = filasCosto.reduce((s, f) => s + f.saldoAlcance, 0);
    const conMeta = [...filasCosto.map((f) => f.em), ...filasUnid.map((f) => f.em)].filter((e) => e.nivel !== "sin_meta");
    return { cierran: cierran.length, faltan, valor, costo, saldoDia: valor - costo, si, totalT, saldoAlc, metasOk: conMeta.filter((e) => e.nivel === "cumple").length, metasN: conMeta.length };
  }, [filasCosto, filasUnid]);

  return { anio, mes, cargando, metas, errUnid, cierresMap, corteIdx, trabajadoresCorte, filasCosto, filasUnid, tot };
}

export default function CierreDiarioView({ db }) {
  const hoyISO = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10), []);
  const [diaSel, setDiaSel] = useState(hoyISO);
  const [alcance, setAlcance] = useState("mes"); // mes | anio | total
  const [abierta, setAbierta] = useState(null);
  const { anio, mes, cargando, metas, errUnid, filasCosto, filasUnid, tot } = useCierreDiario(db, diaSel, alcance);

  const etiquetaAlcance = alcance === "mes" ? `de ${MESES[mes - 1].toLowerCase()}` : alcance === "anio" ? `del año ${anio}` : "total";
  const esHabil = esHabilISO(diaSel);

  // Metas (editor del administrador)
  const [editMetas, setEditMetas] = useState(null);
  const [guardandoMetas, setGuardandoMetas] = useState(false);
  async function guardarMetas() {
    setGuardandoMetas(true);
    try {
      const m = {};
      Object.keys(METAS_DEFECTO).forEach((k) => { m[k] = Math.max(0, Number(editMetas[k]) || 0); });
      await setDoc(doc(db, "costos_config", "main"), { metas: m, actualizadoEn: new Date().toISOString() }, { merge: true });
      setEditMetas(null);
    } catch (e) { alert(`No se pudieron guardar las metas: ${e?.message || e}`); }
    setGuardandoMetas(false);
  }

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const filas = [
      ...filasCosto.map((f) => ({
        Área: f.nombre, Día: diaSel, Producido: Math.round(f.dia.valor), "Costo del día": Math.round(f.dia.costoContado), "Saldo del día": Math.round(f.saldoDia),
        [`Acumulado ${etiquetaAlcance}`]: Math.round(f.saldoAlcance), "Cubren salario": f.cubren.habil ? `${f.cubren.si} de ${f.cubren.total}` : "día no hábil",
        "Unidades del día": Math.round(f.dia.unidades), "Meta del día": f.meta || "", "Cierre": ESTADO_CIERRE[f.dia.estado]?.t || "",
      })),
      ...filasUnid.map((f) => ({ Área: f.nombre, Día: diaSel, "Unidades del día": f.u === null ? "" : Math.round(f.u), "Meta del día": f.meta || "", Cierre: "Solo unidades" })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Cierre del día");
    const trab = [];
    filasCosto.forEach((f) => {
      const delMes = new Map((f.ac.trabajadores || []).map((t) => [t.id, t]));
      f.dia.trabajadores.forEach((t) => {
        const m = delMes.get(t.id);
        trab.push({ Área: f.nombre, Trabajador: t.nombre, "Produjo en el día": Math.round(t.valor), "Salario del día": Math.round(t.costoContado), "Produjo en el mes": m ? Math.round(m.valor) : "", "Salario a la fecha": m ? Math.round(m.costo) : "", "Resultado a la fecha": m ? Math.round(m.valor - m.costo) : "" });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trab), "Trabajadores");
    XLSX.writeFile(wb, `Cierre_diario_${diaSel}.xlsx`);
  }

  const hayErrUnid = Object.keys(errUnid).length > 0;
  const filaDias = (porDia) => diasDelMesHasta(anio, mes, diaSel).filter(esHabilISO).map((iso) => ({ iso, u: porDia.get(iso) || 0 }));

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: C.ink }}>Cierre diario por área</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: C.slate, lineHeight: 1.5, maxWidth: 860 }}>
          Cómo cerró cada área el día: cuánto produjo frente a lo que cuesta, el saldo acumulado y quién va cumpliendo su salario y su meta. Solo lectura.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Día</span>
        <button style={BOTON} onClick={() => setDiaSel(sumarDiasISO(diaSel, -1))} title="Día anterior">‹</button>
        <input type="date" value={diaSel} max={hoyISO} onChange={(e) => e.target.value && setDiaSel(e.target.value)} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }} />
        <button style={{ ...BOTON, opacity: diaSel >= hoyISO ? 0.4 : 1 }} disabled={diaSel >= hoyISO} onClick={() => setDiaSel(sumarDiasISO(diaSel, 1))} title="Día siguiente">›</button>
        {diaSel !== hoyISO ? <button style={BOTON} onClick={() => setDiaSel(hoyISO)}>Hoy</button> : null}
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{etiquetaDia(diaSel)}{!esHabil ? " · no hábil" : ""}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginLeft: 10 }}>Acumulado</span>
        <Chip activo={alcance === "mes"} onClick={() => setAlcance("mes")}>Este mes</Chip>
        <Chip activo={alcance === "anio"} onClick={() => setAlcance("anio")}>Año</Chip>
        <Chip activo={alcance === "total"} onClick={() => setAlcance("total")}>Total</Chip>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={BOTON} onClick={() => setEditMetas(editMetas ? null : { ...metas })}>Metas diarias</button>
          <button style={BOTON} onClick={exportarExcel}>⬇ Excel</button>
        </div>
      </div>

      {editMetas ? (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Metas diarias en unidades</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            {[["corte", "Corte"], ["confeccion", "Confección"], ["terminacion", "Terminación"], ["despachos", "Despachos"]].map(([k, l]) => (
              <label key={k} style={{ fontSize: 12, fontWeight: 700, color: C.slate, display: "flex", flexDirection: "column", gap: 4 }}>
                {l}
                <input type="number" min="0" value={editMetas[k]} onChange={(e) => setEditMetas({ ...editMetas, [k]: e.target.value })} style={{ width: 110, padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
              </label>
            ))}
            <button style={{ ...BOTON, background: C.ink, color: C.white, borderColor: C.ink }} disabled={guardandoMetas} onClick={guardarMetas}>{guardandoMetas ? "Guardando…" : "Guardar"}</button>
            <button style={BOTON} onClick={() => setEditMetas(null)}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8, lineHeight: 1.5 }}>La meta de Zona calor y Control de calidad se cambia donde ya estaba: Nómina → Áreas → «Meta diaria de unidades».</div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Tarjeta
          titulo="Áreas con cierre del día" valor={`${tot.cierran} de ${AREAS_COSTO.length}`}
          color={tot.cierran === AREAS_COSTO.length ? C.green : C.amber} fondo={tot.cierran === AREAS_COSTO.length ? C.greenBg : C.amberBg} linea={tot.cierran === AREAS_COSTO.length ? C.greenLn : C.amberLn}
          sub={tot.faltan.length ? `Falta el cierre de ${tot.faltan.join(", ")}` : "Todas cerraron"}
        />
        <Tarjeta
          titulo="Saldo del día (áreas con costo)" valor={esHabil || tot.valor ? signed(tot.saldoDia) : "—"}
          color={colorSaldo(tot.saldoDia)} fondo={tot.saldoDia >= 0 ? C.greenBg : C.redBg} linea={tot.saldoDia >= 0 ? C.greenLn : C.redLn}
          sub={`Producido ${millones(tot.valor)} · costo ${millones(tot.costo)}`}
        />
        <Tarjeta
          titulo={`Saldo acumulado ${etiquetaAlcance}`} valor={signed(tot.saldoAlc)}
          color={colorSaldo(tot.saldoAlc)} fondo={tot.saldoAlc >= 0 ? C.greenBg : C.redBg} linea={tot.saldoAlc >= 0 ? C.greenLn : C.redLn}
          sub={alcance === "mes" ? "Se reinicia el día 1 de cada mes" : alcance === "anio" ? "Suma los meses del año hasta este día" : "Suma todos los años con datos"}
        />
        <Tarjeta
          titulo="Trabajadores que cubren su salario" valor={esHabil && tot.totalT ? `${tot.si} de ${tot.totalT}` : "—"}
          color={C.blue} fondo={C.blueBg} linea={C.blueLn}
          sub={esHabil ? "Abre un área para ver quiénes" : "Día no hábil: el sueldo no se cobra"}
        />
        <Tarjeta
          titulo="Áreas que cumplen su meta del día" valor={tot.metasN ? `${tot.metasOk} de ${tot.metasN}` : "—"}
          color={tot.metasN && tot.metasOk === tot.metasN ? C.green : C.amber} fondo={tot.metasN && tot.metasOk === tot.metasN ? C.greenBg : C.amberBg} linea={tot.metasN && tot.metasOk === tot.metasN ? C.greenLn : C.amberLn}
          sub="Corte, Zona calor, Control de calidad, Confección, Terminación y Despachos"
        />
      </div>

      <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginBottom: 8 }}>Cierre del día por área {cargando ? <span style={{ fontSize: 12, fontWeight: 600, color: C.slate }}>· cargando…</span> : null}</div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "auto", marginBottom: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Área</th>
              <th style={th}>Producido</th>
              <th style={th}>Costo del día</th>
              <th style={th}>Saldo del día</th>
              <th style={th}>Acumulado {etiquetaAlcance}</th>
              <th style={th}>Cubren salario</th>
              <th style={th}>Meta del día</th>
              <th style={th}>Días con meta (mes)</th>
              <th style={th}>Cierre</th>
            </tr>
          </thead>
          <tbody>
            {filasCosto.map((f) => {
              const st = ESTADO_CIERRE[f.dia.estado];
              const abre = abierta === f.clave;
              return (
                <React.Fragment key={f.clave}>
                  <tr onClick={() => setAbierta(abre ? null : f.clave)} style={{ cursor: "pointer", background: abre ? C.canvas : C.white }} title="Clic para ver trabajadores y días">
                    <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{abre ? "▾" : "▸"} {f.nombre}</td>
                    <td style={td}>{f.sinCierre ? "—" : money(f.dia.valor)}</td>
                    <td style={td}>{f.sinCierre ? "—" : money(f.dia.costoContado)}</td>
                    <td style={{ ...td, fontWeight: 800, color: f.sinCierre ? C.slate : colorSaldo(f.saldoDia) }}>{f.sinCierre ? "—" : signed(f.saldoDia)}</td>
                    <td style={{ ...td, fontWeight: 800, color: colorSaldo(f.saldoAlcance) }}>{f.ac.fuente || alcance !== "mes" ? signed(f.saldoAlcance) : "—"}</td>
                    <td style={td}>{f.cubren.habil && f.cubren.total ? `${f.cubren.si} de ${f.cubren.total}` : "—"}</td>
                    <td style={td}>{f.sinCierre && f.clave !== "CORTE" ? <Pastilla texto={f.meta > 0 ? `meta ${fmt(f.meta)}` : "sin meta"} color={C.slate} fondo={C.canvas} /> : celdaMeta(f.dia.unidades, f.meta, f.em)}</td>
                    <td style={td}>{f.meta > 0 ? `${f.cumpl.cumplidos} de ${f.cumpl.diasHabiles}` : "—"}</td>
                    <td style={td}><Pastilla texto={st.t} color={st.c} fondo={st.f} /></td>
                  </tr>
                  {abre ? (
                    <tr>
                      <td colSpan={9} style={{ padding: "0 0 14px", background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
                        <TablaTrabajadores fila={f} esHabil={esHabil} titulo={`${f.nombre} · cada trabajador`} />
                        {f.meta > 0 ? <ChipsMetaDias porDia={f.porDia} meta={f.meta} anio={anio} mes={mes} diaSel={diaSel} /> : null}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
            {filasUnid.map((f) => {
              const abre = abierta === f.id;
              return (
                <React.Fragment key={f.id}>
                  <tr onClick={() => setAbierta(abre ? null : f.id)} style={{ cursor: "pointer", background: abre ? C.canvas : C.white }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{abre ? "▾" : "▸"} {f.nombre}</td>
                    <td colSpan={5} style={{ ...td, textAlign: "left", color: C.slate, fontSize: 12.5 }}>
                      {errUnid[f.id] ? `No se pudo leer: ${errUnid[f.id]}` : f.u === null ? "Leyendo…" : "Se mide solo por unidades (todavía sin costo diario)"}
                    </td>
                    <td style={td}>{f.u === null ? "—" : celdaMeta(f.u, f.meta, f.em)}</td>
                    <td style={td}>{f.cumpl && f.meta > 0 ? `${f.cumpl.cumplidos} de ${f.cumpl.diasHabiles}` : "—"}</td>
                    <td style={td}><Pastilla texto="Solo unidades" color={C.slate} fondo={C.canvas} /></td>
                  </tr>
                  {abre && f.porDia ? (
                    <tr>
                      <td colSpan={9} style={{ padding: "10px 16px 14px", background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 12, color: C.slate, marginBottom: 6 }}>Fuente: {f.fuente}. Días hábiles de {MESES[mes - 1].toLowerCase()} hasta el día elegido; en verde los que cumplen la meta.</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {filaDias(f.porDia).map((x) => {
                            const ok = f.meta > 0 && x.u >= f.meta;
                            return (
                              <span key={x.iso} title={`${etiquetaDia(x.iso)}: ${fmt(x.u)}${f.meta ? ` de ${fmt(f.meta)}` : ""}`} style={{ padding: "4px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, color: ok ? C.green : f.meta ? C.red : C.slate, background: ok ? C.greenBg : f.meta ? C.redBg : C.white }}>
                                {x.iso.slice(8)} · {fmt(x.u)}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
            <tr>
              <td style={{ ...td, textAlign: "left", fontWeight: 900, background: C.canvas }}>Total áreas con costo</td>
              <td style={{ ...td, fontWeight: 900, background: C.canvas }}>{money(tot.valor)}</td>
              <td style={{ ...td, fontWeight: 900, background: C.canvas }}>{money(tot.costo)}</td>
              <td style={{ ...td, fontWeight: 900, background: C.canvas, color: colorSaldo(tot.saldoDia) }}>{signed(tot.saldoDia)}</td>
              <td style={{ ...td, fontWeight: 900, background: C.canvas, color: colorSaldo(tot.saldoAlc) }}>{signed(tot.saldoAlc)}</td>
              <td style={{ ...td, fontWeight: 900, background: C.canvas }}>{esHabil && tot.totalT ? `${tot.si} de ${tot.totalT}` : "—"}</td>
              <td colSpan={3} style={{ ...td, background: C.canvas }} />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.7, marginBottom: 8 }}>
        Costo del día = sueldo del mes ÷ días hábiles; los fines de semana cuentan lo producido pero no cobran costo. Un trabajador «cubre» cuando lo que produjo en el día alcanza su sueldo del día.
        El acumulado suma día a día (producido − costo) y vuelve a cero el día 1 de cada mes; «Año» y «Total» suman los meses. Corte sin cierre guardado se calcula en vivo con los cortes de ATLAS.
        Zona calor y Control de calidad solo muestran lo que se cerró (automático a las 10 pm o manual). Meta de Zona calor y Control de calidad: la de cada área en Nómina.
        {hayErrUnid ? " Alguna fuente de unidades no se pudo leer: revisa que tengas acceso." : ""}
      </div>
    </div>
  );
}
