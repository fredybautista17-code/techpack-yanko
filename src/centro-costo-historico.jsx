import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { AREAS_HISTORICO, claveArea, nombreAreaPorClave, normTexto, parsearHojaHistorico, unirResultados } from "./centro-costo-historico-parser";

// ─── CENTRO DE COSTO — HISTÓRICO DEL AÑO POR ÁREA ───────────────────────────
// (2026-10-07, a pedido de Fredy) Para ver cómo va el año completo de cada
// centro de costo (CORTE, ZONA CALOR, CONTROL DE CALIDAD) aunque ATLAS solo
// tenga datos reales de los últimos meses:
//   1. "Cargar histórico del año": se sube el Excel (bloques CORTE /
//      EMPAQUE PROCESOS = Control de Calidad / TERMOFIJACION = Zona Calor,
//      meses de ENERO a DICIEMBRE), se ve una VISTA PREVIA y recién ahí se
//      guarda en la colección centro_costo_historico_mes (un documento por
//      área y mes: valor producido, costo de nómina, unidades).
//   2. "Año" del Centro de Costo: tabla mes a mes del área, tarjetas de
//      "Área más rentable" (mayor cobertura = valor producido / costo) y
//      "Trabajador más ayudado" (a quién más se le ha cubierto el salario
//      con lo que NO produjo).
// De dónde sale cada mes (de más a menos confiable):
//   - CORTE: si ATLAS tiene cortes registrados ese mes -> datos en vivo
//     (pedidos_activos + nómina de corte_config), igual que Centro de Costo
//     — Corte. Si no, lo cargado del Excel.
//   - ZONA CALOR / CONTROL DE CALIDAD: lo cargado del Excel; si ese mes no
//     está cargado, el cierre guardado en Centro de Costo Cierre.
// El ranking de trabajadores solo cuenta lo que ATLAS ha guardado en cierres
// (centro_costo_historial_ayuda); el Excel no trae detalle por trabajador.
// Archivo propio, mismo patrón de los otros módulos (reinicia firebase con
// getApps). Solo ESCRIBE en centro_costo_historico_mes; lo demás lo lee.
const firebaseConfig = {
  apiKey: "AIzaSyBDNvCaem-IbP0Z87eBt1pBtDy8sZdkEqc",
  authDomain: "techpack-yanko-f37b8.firebaseapp.com",
  projectId: "techpack-yanko-f37b8",
  storageBucket: "techpack-yanko-f37b8.firebasestorage.app",
  messagingSenderId: "700796768091",
  appId: "1:700796768091:web:5ab0db90c17390e6e7547e",
};
const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#7B5EA7", violetBg: "#F3EEF9", teal: "#2A8C99", tealBg: "#EAF6F7",
};
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}
function fmtMoney(n) {
  const v = Number(n || 0);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}
const colorCobertura = (pct) => (pct >= 100 ? C.green : pct >= 80 ? C.amber : C.red);

// Mes (1-12) y año de un cierre guardado en centro_costo_historial_ayuda.
// periodo "mes" -> etiqueta "Oct 2026"; periodo "dia" -> "07/10/2026".
function ubicarCierre(c) {
  const et = String(c.etiquetaPeriodo || "").trim();
  if (c.periodo === "mes") {
    const m = et.match(/^([A-Za-zÁÉÍÓÚáéíóú]{3})\S*\s+(\d{4})$/);
    if (!m) return null;
    const idx = MESES_CORTOS.findIndex((x) => normTexto(x) === normTexto(m[1]));
    return idx < 0 ? null : { anio: Number(m[2]), mes: idx + 1, tipo: "mes", dia: "" };
  }
  if (c.periodo === "dia") {
    const m = et.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? { anio: Number(m[3]), mes: Number(m[2]), tipo: "dia", dia: et } : null;
  }
  return null;
}

// Junta los cierres guardados en una sola lectura por área y mes: si hay cierre
// de MES se usa el último; si no, se suman los cierres diarios del mes (el
// último por cada día). Devuelve Map "CLAVE|AAAA-MM" -> { valor, costo, dias, trabajadores }.
function resolverCierres(cierres) {
  const porMes = new Map(); // key -> { mes: cierre|null, dias: Map(dia -> cierre) }
  cierres.forEach((c) => {
    const u = ubicarCierre(c);
    if (!u) return;
    const key = `${claveArea(c.area)}|${u.anio}-${String(u.mes).padStart(2, "0")}`;
    if (!porMes.has(key)) porMes.set(key, { mes: null, dias: new Map() });
    const acc = porMes.get(key);
    const mejorQue = (a, b) => !a || String(b.fechaGuardado || "") > String(a.fechaGuardado || "");
    if (u.tipo === "mes") { if (mejorQue(acc.mes, c)) acc.mes = c; }
    else if (mejorQue(acc.dias.get(u.dia), c)) acc.dias.set(u.dia, c);
  });
  const out = new Map();
  porMes.forEach((acc, key) => {
    const fuentes = acc.mes ? [acc.mes] : [...acc.dias.values()];
    if (!fuentes.length) return;
    const trab = new Map();
    let valor = 0;
    let costo = 0;
    fuentes.forEach((c) => {
      valor += Number(c.totalValor) || 0;
      costo += Number(c.totalCosto) || 0;
      (c.detalle || []).forEach((d) => {
        if (d.sinSueldo) return;
        const k = d.id || normTexto(d.nombre);
        if (!trab.has(k)) trab.set(k, { id: k, nombre: d.nombre, area: claveArea(d.area || c.area), valor: 0, costo: 0 });
        const t = trab.get(k);
        t.valor += Number(d.valorProducido) || 0;
        t.costo += Number(d.costo) || 0;
      });
    });
    out.set(key, { valor, costo, dias: acc.mes ? 0 : fuentes.length, esMes: !!acc.mes, trabajadores: [...trab.values()], primerGuardado: fuentes.map((c) => c.fechaGuardado).filter(Boolean).sort()[0] || "" });
  });
  return out;
}

// ─── MODAL: CARGAR HISTÓRICO ─────────────────────────────────────────────────
function CargarHistoricoModal({ onClose, currentUser, anioInicial }) {
  const [archivo, setArchivo] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [anio, setAnio] = useState(anioInicial);
  const [areasOk, setAreasOk] = useState({});
  // Meses de CORTE que se quedan con el Excel aunque ATLAS tenga cortes (julio fue de prueba en ATLAS).
  const [sobreAtlas, setSobreAtlas] = useState({ 7: true });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function leerArchivo(file) {
    if (!file) return;
    setLeyendo(true);
    setError("");
    setMensaje("");
    setResultado(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const partes = wb.SheetNames.map((nombre) => parsearHojaHistorico(XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null }), nombre));
      const r = unirResultados(partes);
      setArchivo(file.name);
      setResultado(r);
      if (r.anioSugerido) setAnio(r.anioSugerido);
      const ok = {};
      Object.keys(r.areas).forEach((k) => { ok[k] = true; });
      setAreasOk(ok);
      if (!Object.keys(r.areas).length) setError("No encontré ningún bloque de área con meses. Revisa que el archivo tenga los títulos CORTE / TERMOFIJACION / EMPAQUE PROCESOS y una fila con ENERO, FEBRERO…");
    } catch (e) {
      setError(`No pude leer el archivo: ${e.message || e}`);
    } finally {
      setLeyendo(false);
    }
  }

  const mesesDeArea = (clave) => {
    const meses = resultado?.areas?.[clave]?.meses || {};
    return Object.keys(meses)
      .map(Number)
      .filter((m) => (Number(meses[m].valor) || 0) !== 0 || (Number(meses[m].costo) || 0) !== 0)
      .sort((a, b) => a - b);
  };
  const totalDocs = Object.keys(resultado?.areas || {}).filter((k) => areasOk[k]).reduce((s, k) => s + mesesDeArea(k).length, 0);

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const ahora = new Date().toISOString();
      const quien = currentUser?.name || currentUser?.email || "";
      const escrituras = [];
      Object.keys(resultado.areas).filter((k) => areasOk[k]).forEach((clave) => {
        mesesDeArea(clave).forEach((mes) => {
          const d = resultado.areas[clave].meses[mes];
          const id = `${clave}_${anio}-${String(mes).padStart(2, "0")}`;
          const datos = {
            clave,
            area: nombreAreaPorClave(clave),
            anio: Number(anio),
            mes,
            valor: Number(d.valor) || 0,
            costo: Number(d.costo) || 0,
            fuente: "excel",
            prioridad: clave === "CORTE" && !!sobreAtlas[mes],
            archivo,
            cargadoPor: quien,
            cargadoEn: ahora,
          };
          if (d.unidades != null) datos.unidades = Number(d.unidades) || 0;
          escrituras.push(setDoc(doc(db, "centro_costo_historico_mes", id), datos));
        });
      });
      await Promise.all(escrituras);
      setMensaje(`✓ Guardados ${escrituras.length} meses del ${anio}.`);
      setResultado(null);
    } catch (e) {
      setError(`No se pudo guardar: ${e.message || e}`);
    } finally {
      setGuardando(false);
    }
  }

  const th = (txt, right) => <th style={{ textAlign: right ? "right" : "left", padding: "6px 8px", fontSize: 10.5, color: C.slate, textTransform: "uppercase" }}>{txt}</th>;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: 16, padding: 24, width: "100%", maxWidth: 980 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.ink }}>📤 Cargar histórico del año</h3>
            <p style={{ margin: "4px 0 14px", fontSize: 13, color: C.slate, maxWidth: 720 }}>
              Sube tu Excel (bloques CORTE, EMPAQUE PROCESOS y TERMOFIJACION con los meses en columnas). Primero ves la vista previa; no se guarda nada hasta que le des "Guardar".
              Equivalencias: <strong>TERMOFIJACION → ZONA CALOR</strong> y <strong>EMPAQUE PROCESOS → CONTROL DE CALIDAD</strong>.
            </p>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: C.slate }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => leerArchivo(e.target.files?.[0])} />
          <label style={{ fontSize: 12.5, color: C.slate, fontWeight: 700 }}>
            Año del archivo{" "}
            <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} style={{ width: 80, padding: "6px 8px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          </label>
          {leyendo && <span style={{ fontSize: 12.5, color: C.slate }}>Leyendo archivo…</span>}
        </div>
        {error && <div style={{ background: C.redBg, color: C.red, padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 12, fontWeight: 700 }}>{error}</div>}
        {mensaje && <div style={{ background: C.greenBg, color: C.green, padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 12, fontWeight: 800 }}>{mensaje}</div>}
        {resultado && Object.keys(resultado.areas).map((clave) => {
          const meses = mesesDeArea(clave);
          const datos = resultado.areas[clave].meses;
          const totV = meses.reduce((s, m) => s + (Number(datos[m].valor) || 0), 0);
          const totC = meses.reduce((s, m) => s + (Number(datos[m].costo) || 0), 0);
          return (
            <div key={clave} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900, color: C.ink, fontSize: 14, marginBottom: 8 }}>
                <input type="checkbox" checked={!!areasOk[clave]} onChange={(e) => setAreasOk({ ...areasOk, [clave]: e.target.checked })} />
                {nombreAreaPorClave(clave)}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.slate }}>· {meses.length} meses con datos · cobertura del periodo {totC > 0 ? fmtPct((totV / totC) * 100) : "—"}</span>
              </label>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      {th("")}
                      {meses.map((m) => <th key={m} style={{ textAlign: "right", padding: "6px 8px", fontSize: 10.5, color: C.slate, textTransform: "uppercase" }}>{MESES_CORTOS[m - 1]}</th>)}
                      {th("Total", true)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: C.ink }}>Valor producido</td>
                      {meses.map((m) => <td key={m} style={{ padding: "6px 8px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(datos[m].valor)}</td>)}
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 900, color: C.green }}>{fmtMoney(totV)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: C.ink }}>Costo de nómina</td>
                      {meses.map((m) => <td key={m} style={{ padding: "6px 8px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{datos[m].costo != null ? fmtMoney(datos[m].costo) : "—"}</td>)}
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 900, color: C.amber }}>{fmtMoney(totC)}</td>
                    </tr>
                    {clave === "CORTE" && (
                      <tr>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: C.violet }}>Usar el Excel, no ATLAS</td>
                        {meses.map((m) => (
                          <td key={m} style={{ padding: "6px 8px", textAlign: "right" }}>
                            <input type="checkbox" checked={!!sobreAtlas[m]} onChange={(e) => setSobreAtlas({ ...sobreAtlas, [m]: e.target.checked })} title={`${MESES_LARGOS[m - 1]}: usar los datos del Excel aunque ATLAS tenga cortes ese mes`} />
                          </td>
                        ))}
                        <td />
                      </tr>
                    )}
                    {meses.some((m) => datos[m].unidades != null) && (
                      <tr>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: C.ink }}>Unidades</td>
                        {meses.map((m) => <td key={m} style={{ padding: "6px 8px", textAlign: "right", color: C.slate }}>{datos[m].unidades != null ? fmtNum(datos[m].unidades) : "—"}</td>)}
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>
                Filas leídas: {resultado.areas[clave].lecturas.map((l) => `"${l.etiqueta}" (fila ${l.fila}) como ${l.tipo === "valor" ? "valor producido" : l.tipo === "costo" ? "costo de nómina" : "unidades"}`).join(" · ")}
              </div>
            </div>
          );
        })}
        {resultado && (resultado.ignoradas.length > 0 || resultado.avisos.length > 0) && (
          <div style={{ background: C.amberBg, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.ink, marginBottom: 12 }}>
            {resultado.avisos.map((a, i) => <div key={`a${i}`}>⚠ {a}</div>)}
            {resultado.ignoradas.length > 0 && (
              <div>
                Filas con números que no reconocí y NO se cargan: {resultado.ignoradas.slice(0, 12).map((x) => `"${x.etiqueta}" (fila ${x.fila}, ${nombreAreaPorClave(x.area)})`).join(" · ")}
                {resultado.ignoradas.length > 12 ? "…" : ""}
              </div>
            )}
          </div>
        )}
        {resultado && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={guardar}
              disabled={guardando || totalDocs === 0}
              style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: totalDocs === 0 ? C.border : C.green, color: C.white, fontWeight: 800, fontSize: 13.5, cursor: totalDocs === 0 ? "default" : "pointer" }}
            >
              {guardando ? "Guardando…" : `💾 Guardar ${totalDocs} meses del ${anio}`}
            </button>
            <span style={{ fontSize: 12, color: C.slate, maxWidth: 560 }}>
              Si ya había datos cargados de esas áreas y meses, se reemplazan. Para CORTE, los meses donde ATLAS ya tiene cortes se siguen mostrando con los datos de ATLAS, salvo los que dejes marcados en "Usar el Excel, no ATLAS" (julio viene marcado porque fue de prueba).
            </span>
          </div>
        )}
        {!resultado && mensaje && (
          <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, fontWeight: 800, cursor: "pointer", color: C.ink }}>Cerrar</button>
        )}
      </div>
    </div>
  );
}

// ─── PANEL "AÑO" ─────────────────────────────────────────────────────────────
export default function CentroCostoAnioPanel({ areaNombre, anioInicial, currentUser, puedeCargar }) {
  const [anioSel, setAnioSel] = useState(anioInicial || new Date().getFullYear());
  const [historico, setHistorico] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [trabajadoresCorte, setTrabajadoresCorte] = useState([]);
  const [fichas, setFichas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "centro_costo_historico_mes"), (snap) => { setHistorico(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); setCargando(false); }, () => setCargando(false)),
      onSnapshot(collection(db, "centro_costo_historial_ayuda"), (snap) => setCierres(snap.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}),
      onSnapshot(collection(db, "pedidos_activos"), (snap) => setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}),
      onSnapshot(collection(db, "nomina_trabajadores"), (snap) => setFichas(snap.docs.map((d) => ({ id: d.id, tipoNomina: d.data().tipoNomina }))), () => {}),
      onSnapshot(collection(db, "corte_config"), (snap) => {
        const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        const cfg = docs.find((d) => d.id === "main") || docs[0];
        setTrabajadoresCorte(cfg?.nomina?.trabajadores || []);
      }, () => {}),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const claveSel = claveArea(areaNombre || "CORTE");
  const cierresResueltos = useMemo(() => resolverCierres(cierres), [cierres]);

  // CORTE en vivo por mes (cortes registrados en ATLAS + sueldos de la nómina de corte)
  const corteVivo = useMemo(() => {
    const meses = {};
    pedidos.forEach((p) => {
      (p.cortesRealizados || []).forEach((c) => {
        const f = String(c.fecha || "");
        if (f.slice(0, 4) !== String(anioSel)) return;
        const m = Number(f.slice(5, 7));
        if (!m) return;
        if (!meses[m]) meses[m] = { valor: 0, unidades: 0 };
        meses[m].valor += Number(c.ingresoCorte) || 0;
        meses[m].unidades += Number(c.totalUnidades) || 0;
      });
    });
    Object.keys(meses).forEach((m) => {
      const mk = `${anioSel}-${String(m).padStart(2, "0")}`;
      meses[m].costo = trabajadoresCorte.filter((t) => !t.fechaSalida || mk <= String(t.fechaSalida).slice(0, 7)).reduce((s, t) => s + (Number(t.sueldo) || 0), 0);
    });
    return meses;
  }, [pedidos, trabajadoresCorte, anioSel]);

  // Una lectura por área y mes: { valor, costo, unidades, fuente }
  const datosArea = useMemo(() => {
    const out = {};
    const claves = new Set([...AREAS_HISTORICO.map((a) => a.clave), claveSel]);
    claves.forEach((clave) => {
      const meses = {};
      for (let m = 1; m <= 12; m++) {
        const mk = `${anioSel}-${String(m).padStart(2, "0")}`;
        const vivo = clave === "CORTE" ? corteVivo[m] : null;
        const h = historico.find((x) => x.clave === clave && x.anio === Number(anioSel) && x.mes === m);
        const cierre = cierresResueltos.get(`${clave}|${mk}`);
        if (h && h.prioridad) meses[m] = { valor: Number(h.valor) || 0, costo: Number(h.costo) || 0, unidades: h.unidades, fuente: "historico" };
        else if (vivo && vivo.valor > 0) meses[m] = { valor: vivo.valor, costo: vivo.costo, unidades: vivo.unidades, fuente: "vivo" };
        else if (h) meses[m] = { valor: Number(h.valor) || 0, costo: Number(h.costo) || 0, unidades: h.unidades, fuente: "historico" };
        else if (cierre && (cierre.valor > 0 || cierre.costo > 0)) meses[m] = { valor: cierre.valor, costo: cierre.costo, fuente: "cierre", parcial: !cierre.esMes ? cierre.dias : 0 };
      }
      const lista = Object.values(meses);
      const valor = lista.reduce((s, x) => s + x.valor, 0);
      const costo = lista.reduce((s, x) => s + x.costo, 0);
      out[clave] = { meses, valor, costo, cobertura: costo > 0 ? (valor / costo) * 100 : 0, mesesConDato: lista.length };
    });
    return out;
  }, [historico, cierresResueltos, corteVivo, anioSel, claveSel]);

  const resumenAreas = Object.entries(datosArea)
    .filter(([, d]) => d.mesesConDato > 0 && d.costo > 0)
    .map(([clave, d]) => ({ clave, nombre: nombreAreaPorClave(clave), ...d }))
    .sort((a, b) => b.cobertura - a.cobertura);
  const areaTop = resumenAreas[0] || null;
  const sel = datosArea[claveSel] || { meses: {}, valor: 0, costo: 0, cobertura: 0, mesesConDato: 0 };

  // Trabajadores más ayudados: se suma por trabajador lo producido y lo que costó en
  // cada mes con cierre (ayuda = costo - producido cuando es positiva).
  const tiposDestajo = useMemo(() => new Set(fichas.filter((f) => f.tipoNomina === "Destajo" || f.tipoNomina === "Fiscal Destajo").map((f) => f.id)), [fichas]);
  const ranking = useMemo(() => {
    const m = new Map();
    let primero = "";
    cierresResueltos.forEach((r, key) => {
      const [, mk] = key.split("|");
      if (!mk.startsWith(`${anioSel}-`)) return;
      if (r.primerGuardado && (!primero || r.primerGuardado < primero)) primero = r.primerGuardado;
      r.trabajadores.forEach((t) => {
        // Solo cuentan los de destajo (Destajo y Fiscal Destajo): los Fiscal (sueldo fijo) no se
        // comparan. La nómina de CORTE no tiene ficha de tipo de nómina, así que entra completa.
        if (t.area !== "CORTE" && !tiposDestajo.has(t.id)) return;
        const k = `${t.area}|${t.id}`;
        if (!m.has(k)) m.set(k, { id: t.id, nombre: t.nombre, area: t.area, ayuda: 0, excedente: 0, mesesAyudado: 0, mesesTotal: 0 });
        const acc = m.get(k);
        const bal = t.valor - t.costo;
        acc.mesesTotal += 1;
        if (bal < 0) { acc.ayuda += -bal; acc.mesesAyudado += 1; } else acc.excedente += bal;
      });
    });
    return { lista: [...m.values()].filter((x) => x.ayuda > 0).sort((a, b) => b.ayuda - a.ayuda), desde: primero };
  }, [cierresResueltos, anioSel, tiposDestajo]);
  const rankArea = ranking.lista.filter((x) => x.area === claveSel);
  const topArea = rankArea[0] || null;
  const topGlobal = ranking.lista[0] || null;

  const hoy = new Date();
  const mesActual = hoy.getFullYear() === Number(anioSel) ? hoy.getMonth() + 1 : hoy.getFullYear() > Number(anioSel) ? 12 : 0;
  const maxMonto = Math.max(1, ...Object.values(sel.meses).map((x) => Math.max(x.valor, x.costo)));
  const th = (txt, right) => <th style={{ textAlign: right ? "right" : "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>{txt}</th>;
  const etiquetaFuente = (f) => {
    if (f.fuente === "vivo") return { txt: "en vivo (ATLAS)", color: C.green, bg: C.greenBg };
    if (f.fuente === "historico") return { txt: "histórico cargado", color: C.violet, bg: C.violetBg };
    return { txt: f.parcial ? `cierres diarios (${f.parcial} días)` : "cierre guardado", color: C.teal, bg: C.tealBg };
  };
  const rentab = sel.valor - sel.costo;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.ink }}>📅 Estado del año — {nombreAreaPorClave(claveSel)}</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.slate, maxWidth: 760 }}>
            Mes a mes: valor producido contra costo de nómina. Cobertura = valor producido ÷ costo de nómina (100% = el área paga su nómina).
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value) || anioSel)} style={{ width: 84, padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
          {puedeCargar && (
            <button onClick={() => setModal(true)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.violet}`, background: C.white, color: C.violet, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
              📤 Cargar histórico del año
            </button>
          )}
        </div>
      </div>
      {cargando && <div style={{ padding: 16, color: C.slate, fontSize: 13 }}>Cargando histórico…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 18 }}>
        <div style={{ background: C.greenBg, border: `1px solid ${C.green}33`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em" }}>🏆 Área más rentable del año</div>
          {areaTop ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.green, marginTop: 4 }}>{areaTop.nombre}</div>
              <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>
                Cobertura <strong>{fmtPct(areaTop.cobertura)}</strong> · {areaTop.valor - areaTop.costo >= 0 ? "sobra" : "falta"} {fmtMoney(Math.abs(areaTop.valor - areaTop.costo))} en {areaTop.mesesConDato} {areaTop.mesesConDato === 1 ? "mes" : "meses"}
              </div>
              {resumenAreas.length > 1 && (
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>
                  {resumenAreas.slice(1).map((a) => `${a.nombre} ${fmtPct(a.cobertura)}`).join(" · ")}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.slate, marginTop: 6 }}>Aún no hay datos del {anioSel}. Carga el histórico para compararlas.</div>
          )}
        </div>
        <div style={{ background: C.redBg, border: `1px solid ${C.red}33`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em" }}>🆘 Trabajador más ayudado</div>
          {topArea || topGlobal ? (
            <>
              {topArea && (
                <>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.red, marginTop: 4 }}>{topArea.nombre}</div>
                  <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>
                    {nombreAreaPorClave(claveSel)}: ayuda acumulada <strong>{fmtMoney(topArea.ayuda)}</strong> · ayudado en {topArea.mesesAyudado} de {topArea.mesesTotal} {topArea.mesesTotal === 1 ? "mes" : "meses"}
                  </div>
                </>
              )}
              {topGlobal && (!topArea || topGlobal.id !== topArea.id) && (
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>Entre todas las áreas: {topGlobal.nombre} ({nombreAreaPorClave(topGlobal.area)}) {fmtMoney(topGlobal.ayuda)}</div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.slate, marginTop: 6 }}>Aún no hay cierres guardados con detalle por trabajador en {anioSel}.</div>
          )}
          <div style={{ fontSize: 11, color: C.slate, marginTop: 8 }}>
            Solo trabajadores de destajo (Fiscal no entra), comparados contra su costo de nómina (sueldo + auxilio de transporte). Cuenta solo desde que ATLAS empezó a guardar cierres{ranking.desde ? ` (${ranking.desde.slice(0, 10).split("-").reverse().join("/")})` : ""}; el Excel no trae detalle por trabajador.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.greenBg, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>Valor producido {anioSel}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.green }}>{fmtMoney(sel.valor)}</div>
        </div>
        <div style={{ background: C.amberBg, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>Costo de nómina {anioSel}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.amber }}>{fmtMoney(sel.costo)}</div>
        </div>
        <div style={{ background: rentab >= 0 ? C.greenBg : C.redBg, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>Resultado del año</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: rentab >= 0 ? C.green : C.red }}>{fmtMoney(rentab)}</div>
        </div>
        <div style={{ background: C.canvas, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>Cobertura del año</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: sel.costo > 0 ? colorCobertura(sel.cobertura) : C.slate }}>{sel.costo > 0 ? fmtPct(sel.cobertura) : "—"}</div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {th("Mes")}{th("Valor producido", true)}{th("Costo nómina", true)}{th("Resultado", true)}{th("Cobertura", true)}{th("")}{th("Fuente")}
            </tr>
          </thead>
          <tbody>
            {MESES_LARGOS.map((nombre, i) => {
              const m = i + 1;
              const f = sel.meses[m];
              const futuro = m > mesActual && !f;
              if (!f) {
                return (
                  <tr key={m} style={{ borderBottom: `1px solid ${C.border}`, color: C.slate }}>
                    <td style={{ padding: "9px 10px", fontWeight: 700 }}>{nombre}</td>
                    <td colSpan={6} style={{ padding: "9px 10px", fontSize: 12, fontStyle: "italic" }}>{futuro ? "—" : "sin dato cargado"}</td>
                  </tr>
                );
              }
              const res = f.valor - f.costo;
              const cob = f.costo > 0 ? (f.valor / f.costo) * 100 : 0;
              const et = etiquetaFuente(f);
              return (
                <tr key={m} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "9px 10px", fontWeight: 800, color: C.ink }}>{nombre}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(f.valor)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{fmtMoney(f.costo)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: res >= 0 ? C.green : C.red, fontWeight: 800 }}>{fmtMoney(res)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: f.costo > 0 ? colorCobertura(cob) : C.slate, fontWeight: 800 }}>{f.costo > 0 ? fmtPct(cob) : "—"}</td>
                  <td style={{ padding: "9px 10px", minWidth: 120 }}>
                    <div style={{ position: "relative", height: 8, background: C.canvas, borderRadius: 4 }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(f.valor / maxMonto) * 100}%`, background: C.green, borderRadius: 4, opacity: 0.85 }} />
                      <div style={{ position: "absolute", top: -2, bottom: -2, left: `${(f.costo / maxMonto) * 100}%`, width: 2, background: C.amber }} />
                    </div>
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: et.color, background: et.bg, padding: "2px 8px", borderRadius: 10 }}>{et.txt}</span>
                  </td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td style={{ padding: "10px", fontWeight: 900, color: C.ink }}>Total {anioSel}</td>
              <td style={{ padding: "10px", textAlign: "right", color: C.green, fontWeight: 900 }}>{fmtMoney(sel.valor)}</td>
              <td style={{ padding: "10px", textAlign: "right", color: C.amber, fontWeight: 900 }}>{fmtMoney(sel.costo)}</td>
              <td style={{ padding: "10px", textAlign: "right", color: rentab >= 0 ? C.green : C.red, fontWeight: 900 }}>{fmtMoney(rentab)}</td>
              <td style={{ padding: "10px", textAlign: "right", fontWeight: 900, color: sel.costo > 0 ? colorCobertura(sel.cobertura) : C.slate }}>{sel.costo > 0 ? fmtPct(sel.cobertura) : "—"}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>La barra verde es el valor producido; la raya naranja marca el costo de nómina de ese mes.</div>

      {resumenAreas.length > 1 && (
        <div style={{ marginTop: 22 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 900, color: C.ink }}>Todas las áreas — {anioSel}</h4>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("Área")}{th("Meses con dato", true)}{th("Valor producido", true)}{th("Costo nómina", true)}{th("Resultado", true)}{th("Cobertura", true)}</tr>
              </thead>
              <tbody>
                {resumenAreas.map((a) => (
                  <tr key={a.clave} style={{ borderBottom: `1px solid ${C.border}`, background: a.clave === claveSel ? C.canvas : "transparent" }}>
                    <td style={{ padding: "9px 10px", fontWeight: 800, color: C.ink }}>{a.nombre}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>{a.mesesConDato}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(a.valor)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{fmtMoney(a.costo)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: a.valor - a.costo >= 0 ? C.green : C.red, fontWeight: 800 }}>{fmtMoney(a.valor - a.costo)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: colorCobertura(a.cobertura), fontWeight: 900 }}>{fmtPct(a.cobertura)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: C.slate, marginTop: 6 }}>Cada área suma solo los meses que tiene con dato; si una tiene más meses cargados que otra, compara también la cobertura (no solo el total).</div>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 900, color: C.ink }}>🆘 Trabajadores más ayudados — {nombreAreaPorClave(claveSel)} {anioSel}</h4>
        {!rankArea.length ? (
          <div style={{ fontSize: 13, color: C.slate }}>Todavía no hay trabajadores con ayuda registrada en los cierres de {anioSel} para esta área.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("#")}{th("Trabajador")}{th("Meses ayudado", true)}{th("Ayuda acumulada", true)}{th("Excedente acumulado", true)}</tr>
              </thead>
              <tbody>
                {rankArea.slice(0, 10).map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 10px", color: C.slate, fontWeight: 800 }}>{i + 1}</td>
                    <td style={{ padding: "9px 10px", fontWeight: 800, color: C.ink }}>{t.nombre}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>{t.mesesAyudado} de {t.mesesTotal}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: C.red, fontWeight: 800 }}>{fmtMoney(t.ayuda)}</td>
                    <td style={{ padding: "9px 10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(t.excedente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {puedeCargar && historico.some((h) => h.anio === Number(anioSel) && h.clave === claveSel) && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={async () => {
              if (!window.confirm(`¿Borrar lo cargado del Excel para ${nombreAreaPorClave(claveSel)} ${anioSel}? (No toca los datos reales de ATLAS ni los cierres.)`)) return;
              const ids = historico.filter((h) => h.anio === Number(anioSel) && h.clave === claveSel).map((h) => h.id);
              await Promise.all(ids.map((id) => deleteDoc(doc(db, "centro_costo_historico_mes", id))));
            }}
            style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.red}55`, background: C.white, color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            🗑 Borrar histórico cargado de {nombreAreaPorClave(claveSel)} {anioSel}
          </button>
        </div>
      )}
      {modal && <CargarHistoricoModal onClose={() => setModal(false)} currentUser={currentUser} anioInicial={Number(anioSel)} />}
    </div>
  );
}
