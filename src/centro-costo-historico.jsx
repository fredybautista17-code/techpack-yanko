import React, { useState, useEffect, useMemo } from "react";
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

// ¿El día "dd/mm/aaaa" es de lunes a viernes?
function esDiaHabil(dia) {
  const [d, m, y] = String(dia).split("/").map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return w !== 0 && w !== 6;
}
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function nombreDia(dia) {
  const [d, m, y] = String(dia).split("/").map(Number);
  return DIAS_SEMANA[new Date(y, m - 1, d).getDay()];
}
const claveFechaDia = (dia) => String(dia).split("/").reverse().join("");

// Junta los cierres guardados en una sola lectura por área y mes: si hay cierre
// de MES se usa el último; si no, se juntan los cierres diarios del mes (el
// último por cada día).
//   - El VALOR PRODUCIDO se suma todos los días (si producen un sábado, cuenta).
//   - El COSTO de nómina solo se suma en días hábiles (lunes a viernes): el
//     cierre diario reparte el sueldo del mes entre los días hábiles, pero el
//     cierre automático corre también sábados y domingos; sumarlos cobraba la
//     nómina de más (30 cierres en vez de 22).
// `incluir(t)` decide qué trabajadores cuentan (solo destajo; CORTE completo).
// Devuelve Map "CLAVE|AAAA-MM" -> { valor, costo, dias, esMes, trabajadores, diasDet }.
function resolverCierres(cierres, incluir) {
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
    const esMes = !!acc.mes;
    const fuentes = esMes
      ? [{ c: acc.mes, dia: "" }]
      : [...acc.dias.entries()].map(([dia, c]) => ({ c, dia })).sort((a, b) => claveFechaDia(a.dia).localeCompare(claveFechaDia(b.dia)));
    if (!fuentes.length) return;
    const trab = new Map();
    const diasDet = [];
    let valor = 0;
    let costo = 0;
    fuentes.forEach(({ c, dia }) => {
      const habil = esMes ? true : esDiaHabil(dia);
      const det = c.detalle || [];
      let vDia = 0;
      let cDia = 0;
      let cOrig = 0;
      if (det.length) {
        det.forEach((d) => {
          if (d.sinSueldo) return;
          const t0 = { id: d.id || normTexto(d.nombre), nombre: d.nombre, area: claveArea(d.area || c.area) };
          if (!incluir(t0)) return;
          const v = Number(d.valorProducido) || 0;
          const co = Number(d.costo) || 0;
          const coContado = habil ? co : 0;
          if (!trab.has(t0.id)) trab.set(t0.id, { ...t0, valor: 0, costo: 0 });
          const t = trab.get(t0.id);
          t.valor += v;
          t.costo += coContado;
          vDia += v;
          cDia += coContado;
          cOrig += co;
        });
      } else {
        vDia = Number(c.totalValor) || 0;
        cOrig = Number(c.totalCosto) || 0;
        cDia = habil ? cOrig : 0;
      }
      valor += vDia;
      costo += cDia;
      if (!esMes) diasDet.push({ fecha: dia, habil, valor: vDia, costoDia: cOrig, costo: cDia });
    });
    out.set(key, { valor, costo, dias: esMes ? 0 : fuentes.length, esMes, trabajadores: [...trab.values()], diasDet, primerGuardado: fuentes.map((x) => x.c.fechaGuardado).filter(Boolean).sort()[0] || "" });
  });
  return out;
}

// Etiqueta de resultado de un trabajador (o del mes): ayuda si produjo menos que su nómina, excedente si más.
function EtiquetaResultado({ bal }) {
  if (Math.abs(bal) < 1) return <span style={{ fontSize: 11, fontWeight: 700, color: C.slate }}>Justo</span>;
  const ayuda = bal < 0;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 800, color: ayuda ? C.red : C.green, background: ayuda ? C.redBg : C.greenBg, padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {ayuda ? "Ayuda" : "Excedente"} {fmtMoney(Math.abs(bal))}
    </span>
  );
}
const thCell = (txt, right) => <th style={{ textAlign: right ? "right" : "left", padding: "7px 9px", fontSize: 10.5, color: C.slate, textTransform: "uppercase" }}>{txt}</th>;

// Detalle que se abre al tocar un mes del año.
function DetalleMes({ titulo, f, cierre, h, filasTrab }) {
  const [busq, setBusq] = useState("");
  const q = normTexto(busq);
  const todas = [...filasTrab].sort((a, b) => (a.valor - a.costo) - (b.valor - b.costo));
  const filas = todas.filter((t) => !q || normTexto(t.nombre).includes(q));
  const totAyuda = todas.reduce((s, t) => s + Math.max(0, t.costo - t.valor), 0);
  const totExced = todas.reduce((s, t) => s + Math.max(0, t.valor - t.costo), 0);
  const nAyudados = todas.filter((t) => t.costo - t.valor >= 1).length;
  const nExced = todas.filter((t) => t.valor - t.costo >= 1).length;
  return (
    <div style={{ background: C.canvas, borderRadius: 12, padding: 16, margin: "4px 0 12px" }}>
      <div style={{ fontWeight: 900, color: C.ink, fontSize: 14 }}>{titulo}</div>
      {f.fuente === "historico" && h && (
        <div style={{ fontSize: 12.5, color: C.ink, marginTop: 6, lineHeight: 1.6 }}>
          Cargado del Excel{h.archivo ? ` (${h.archivo})` : ""}{h.cargadoPor ? ` por ${h.cargadoPor}` : ""}{h.cargadoEn ? ` el ${String(h.cargadoEn).slice(0, 10).split("-").reverse().join("/")}` : ""}.<br />
          {h.unidades != null && <>Unidades: <strong>{fmtNum(h.unidades)}</strong> · </>}Valor producido: <strong>{fmtMoney(h.valor)}</strong> · Nómina: <strong>{fmtMoney(h.costo)}</strong> · <EtiquetaResultado bal={(Number(h.valor) || 0) - (Number(h.costo) || 0)} /><br />
          <span style={{ color: C.slate }}>El Excel solo trae el total del área; de este mes no hay detalle por trabajador.</span>
        </div>
      )}
      {f.fuente === "cierre" && cierre && (
        <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>
          {cierre.esMes
            ? "Sale del cierre del mes guardado en Centro de Costo."
            : `Sale de ${cierre.dias} cierres diarios. El valor producido se suma todos los días; el costo de nómina solo cuenta de lunes a viernes (el sueldo del mes ya está repartido entre los días hábiles).`}
        </div>
      )}
      {f.fuente === "vivo" && (
        <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>Cortes registrados en ATLAS este mes contra el sueldo de la nómina de Corte.</div>
      )}
      {todas.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, margin: "12px 0" }}>
            <div style={{ background: C.redBg, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>Ayudas del mes</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.red }}>{fmtMoney(totAyuda)}</div>
              <div style={{ fontSize: 11, color: C.slate }}>{nAyudados} {nAyudados === 1 ? "trabajador" : "trabajadores"}</div>
            </div>
            <div style={{ background: C.greenBg, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>Excedentes del mes</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: C.green }}>{fmtMoney(totExced)}</div>
              <div style={{ fontSize: 11, color: C.slate }}>{nExced} {nExced === 1 ? "trabajador" : "trabajadores"}</div>
            </div>
            <div style={{ background: C.white, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>Balance del mes</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: totExced - totAyuda >= 0 ? C.green : C.red }}>{fmtMoney(totExced - totAyuda)}</div>
              <div style={{ fontSize: 11, color: C.slate }}>excedentes − ayudas</div>
            </div>
          </div>
          <input value={busq} onChange={(e) => setBusq(e.target.value)} placeholder="Buscar trabajador…" style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, marginBottom: 8, width: 240 }} />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>{thCell("Trabajador")}{thCell("Produjo", true)}{thCell("Le pagamos (nómina)", true)}{thCell("Resultado", true)}</tr>
              </thead>
              <tbody>
                {filas.map((t) => (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 9px", fontWeight: 800, color: C.ink }}>{t.nombre}</td>
                    <td style={{ padding: "8px 9px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(t.valor)}</td>
                    <td style={{ padding: "8px 9px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{fmtMoney(t.costo)}</td>
                    <td style={{ padding: "8px 9px", textAlign: "right" }}><EtiquetaResultado bal={t.valor - t.costo} /></td>
                  </tr>
                ))}
                {!filas.length && <tr><td colSpan={4} style={{ padding: 12, color: C.slate, fontSize: 12.5 }}>Ningún trabajador coincide con la búsqueda.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {f.fuente === "cierre" && todas.length === 0 && (
        <div style={{ fontSize: 12.5, color: C.slate, marginTop: 8 }}>Este cierre no trae detalle por trabajador (solo totales).</div>
      )}
      {f.fuente === "cierre" && cierre && cierre.diasDet.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, color: C.ink, fontSize: 13, marginBottom: 6 }}>Día por día</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>{thCell("Fecha")}{thCell("Valor producido", true)}{thCell("Costo del cierre", true)}{thCell("Costo que cuenta", true)}{thCell("")}</tr>
              </thead>
              <tbody>
                {cierre.diasDet.map((d) => (
                  <tr key={d.fecha} style={{ borderBottom: `1px solid ${C.border}`, color: d.habil ? C.ink : C.slate, background: d.habil ? "transparent" : C.white }}>
                    <td style={{ padding: "6px 9px", fontWeight: 700 }}>{nombreDia(d.fecha)} {d.fecha}</td>
                    <td style={{ padding: "6px 9px", textAlign: "right" }}>{fmtMoney(d.valor)}</td>
                    <td style={{ padding: "6px 9px", textAlign: "right" }}>{fmtMoney(d.costoDia)}</td>
                    <td style={{ padding: "6px 9px", textAlign: "right", fontWeight: 700 }}>{fmtMoney(d.costo)}</td>
                    <td style={{ padding: "6px 9px", fontSize: 11 }}>{d.habil ? "" : "fin de semana: no suma costo"}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 900 }}>
                  <td style={{ padding: "8px 9px" }}>Total</td>
                  <td style={{ padding: "8px 9px", textAlign: "right", color: C.green }}>{fmtMoney(cierre.diasDet.reduce((s, d) => s + d.valor, 0))}</td>
                  <td style={{ padding: "8px 9px", textAlign: "right" }}>{fmtMoney(cierre.diasDet.reduce((s, d) => s + d.costoDia, 0))}</td>
                  <td style={{ padding: "8px 9px", textAlign: "right", color: C.amber }}>{fmtMoney(cierre.diasDet.reduce((s, d) => s + d.costo, 0))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
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
  const [mesAbierto, setMesAbierto] = useState(null);
  const [ordenHist, setOrdenHist] = useState("ayuda");
  const [busqHist, setBusqHist] = useState("");
  const [trabAbierto, setTrabAbierto] = useState(null);

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
  // Solo cuentan los trabajadores de destajo (Destajo y Fiscal Destajo); los Fiscal (sueldo fijo)
  // no se comparan. La nómina de CORTE no tiene ficha de tipo de nómina, así que entra completa.
  const tiposDestajo = useMemo(() => new Set(fichas.filter((f) => f.tipoNomina === "Destajo" || f.tipoNomina === "Fiscal Destajo").map((f) => f.id)), [fichas]);
  const incluir = useMemo(() => (t) => t.area === "CORTE" || !fichas.length || tiposDestajo.has(t.id), [fichas, tiposDestajo]);
  const cierresResueltos = useMemo(() => resolverCierres(cierres, incluir), [cierres, incluir]);

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

  // Historial por trabajador: por cada mes con cierre se compara lo que produjo contra su nómina;
  // si produjo menos es ayuda, si produjo más es excedente. Se acumula todo lo que ATLAS ha guardado.
  const ranking = useMemo(() => {
    const m = new Map();
    let primero = "";
    cierresResueltos.forEach((r, key) => {
      const [, mk] = key.split("|");
      if (r.primerGuardado && (!primero || r.primerGuardado < primero)) primero = r.primerGuardado;
      r.trabajadores.forEach((t) => {
        const k = `${t.area}|${t.id}`;
        if (!m.has(k)) m.set(k, { id: t.id, nombre: t.nombre, area: t.area, ayuda: 0, excedente: 0, mesesAyudado: 0, mesesExcedente: 0, mesesTotal: 0, meses: [] });
        const acc = m.get(k);
        const bal = t.valor - t.costo;
        acc.mesesTotal += 1;
        if (bal <= -1) { acc.ayuda += -bal; acc.mesesAyudado += 1; } else if (bal >= 1) { acc.excedente += bal; acc.mesesExcedente += 1; }
        acc.meses.push({ mk, valor: t.valor, costo: t.costo });
      });
    });
    const lista = [...m.values()];
    lista.forEach((x) => x.meses.sort((a, b) => a.mk.localeCompare(b.mk)));
    return { lista: lista.sort((a, b) => b.ayuda - a.ayuda), desde: primero };
  }, [cierresResueltos]);
  const rankArea = ranking.lista.filter((x) => x.area === claveSel);
  const topArea = rankArea.find((x) => x.ayuda > 0) || null;
  const topGlobal = ranking.lista.find((x) => x.ayuda > 0) || null;
  const histFiltrado = rankArea
    .filter((x) => !normTexto(busqHist) || normTexto(x.nombre).includes(normTexto(busqHist)))
    .sort((a, b) => (ordenHist === "excedente" ? b.excedente - a.excedente : ordenHist === "nombre" ? a.nombre.localeCompare(b.nombre) : b.ayuda - a.ayuda));

  // Detalle del mes abierto: trabajadores (cierres) o cortadores (CORTE en vivo)
  const filasTrabMes = useMemo(() => {
    if (!mesAbierto) return [];
    const f = sel.meses[mesAbierto];
    if (!f) return [];
    if (f.fuente === "cierre") return cierresResueltos.get(`${claveSel}|${anioSel}-${String(mesAbierto).padStart(2, "0")}`)?.trabajadores || [];
    if (f.fuente !== "vivo") return [];
    const mk = `${anioSel}-${String(mesAbierto).padStart(2, "0")}`;
    const porCortador = new Map();
    pedidos.forEach((p) => (p.cortesRealizados || []).forEach((c) => {
      if (String(c.fecha || "").slice(0, 7) !== mk) return;
      const nombre = String(c.cortador || "").trim() || "(Sin cortador asignado)";
      const k = normTexto(nombre);
      if (!porCortador.has(k)) porCortador.set(k, { nombre, valor: 0 });
      porCortador.get(k).valor += Number(c.ingresoCorte) || 0;
    }));
    const filas = [];
    const usados = new Set();
    trabajadoresCorte.filter((t) => !t.fechaSalida || mk <= String(t.fechaSalida).slice(0, 7)).forEach((t) => {
      const k = normTexto(t.nombre);
      usados.add(k);
      filas.push({ id: k, nombre: t.nombre, valor: porCortador.get(k)?.valor || 0, costo: Number(t.sueldo) || 0 });
    });
    porCortador.forEach((d, k) => { if (!usados.has(k)) filas.push({ id: k, nombre: d.nombre, valor: d.valor, costo: 0 }); });
    return filas.filter((x) => x.costo > 0);
  }, [mesAbierto, sel, cierresResueltos, claveSel, anioSel, pedidos, trabajadoresCorte]);

  const hoy = new Date();
  const mesActual = hoy.getFullYear() === Number(anioSel) ? hoy.getMonth() + 1 : hoy.getFullYear() > Number(anioSel) ? 12 : 0;
  const maxMonto = Math.max(1, ...Object.values(sel.meses).map((x) => Math.max(x.valor, x.costo)));
  const th = (txt, right) => <th style={{ textAlign: right ? "right" : "left", padding: "8px 10px", fontSize: 11, color: C.slate, textTransform: "uppercase" }}>{txt}</th>;
  const etiquetaFuente = (f) => {
    if (f.fuente === "vivo") return { txt: "en vivo (ATLAS)", color: C.green, bg: C.greenBg };
    if (f.fuente === "historico") return { txt: "histórico cargado", color: C.violet, bg: C.violetBg };
    return { txt: f.parcial ? `cierres diarios (${f.parcial} días, costo solo hábiles)` : "cierre guardado", color: C.teal, bg: C.tealBg };
  };
  const rentab = sel.valor - sel.costo;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.ink }}>📅 Estado del año — {nombreAreaPorClave(claveSel)}</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: C.slate, maxWidth: 760 }}>
            Mes a mes: valor producido contra valor de la nómina. Si lo producido supera la nómina hay excedente; si no, el mes cerró en pérdida. Toca un mes para ver el detalle por trabajador.
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
            <div style={{ fontSize: 13, color: C.slate, marginTop: 6 }}>Aún no hay cierres guardados con ayuda por trabajador.</div>
          )}
          <div style={{ fontSize: 11, color: C.slate, marginTop: 8 }}>
            Solo trabajadores de destajo (Fiscal no entra): lo que produjeron contra su nómina. Acumulado desde que ATLAS empezó a guardar cierres{ranking.desde ? ` (${ranking.desde.slice(0, 10).split("-").reverse().join("/")})` : ""}; el Excel no trae detalle por trabajador.
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
          <div style={{ fontSize: 11, color: C.slate, fontWeight: 700 }}>{rentab >= 0 ? "Excedente del año" : "Pérdida del año"}</div>
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
              const abierto = mesAbierto === m;
              return (
                <React.Fragment key={m}>
                <tr onClick={() => setMesAbierto(abierto ? null : m)} style={{ borderBottom: abierto ? "none" : `1px solid ${C.border}`, cursor: "pointer", background: abierto ? C.canvas : "transparent" }} title="Toca para ver el detalle de este mes">
                  <td style={{ padding: "9px 10px", fontWeight: 800, color: C.ink }}>{abierto ? "▾" : "▸"} {nombre}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(f.valor)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{fmtMoney(f.costo)}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: res >= 0 ? C.green : C.red, fontWeight: 800 }}>
                    {fmtMoney(res)}
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{res >= 0 ? "excedente" : "pérdida"}</div>
                  </td>
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
                {abierto && (
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td colSpan={7} style={{ padding: "0 6px" }}>
                      <DetalleMes
                        key={`${anioSel}-${m}`}
                        titulo={`${nombre} ${anioSel} — ${nombreAreaPorClave(claveSel)}`}
                        f={f}
                        cierre={f.fuente === "cierre" ? cierresResueltos.get(`${claveSel}|${anioSel}-${String(m).padStart(2, "0")}`) : null}
                        h={f.fuente === "historico" ? historico.find((x) => x.clave === claveSel && x.anio === Number(anioSel) && x.mes === m) : null}
                        filasTrab={filasTrabMes}
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
            <tr style={{ borderTop: `2px solid ${C.border}` }}>
              <td style={{ padding: "10px", fontWeight: 900, color: C.ink }}>Total {anioSel}</td>
              <td style={{ padding: "10px", textAlign: "right", color: C.green, fontWeight: 900 }}>{fmtMoney(sel.valor)}</td>
              <td style={{ padding: "10px", textAlign: "right", color: C.amber, fontWeight: 900 }}>{fmtMoney(sel.costo)}</td>
              <td style={{ padding: "10px", textAlign: "right", color: rentab >= 0 ? C.green : C.red, fontWeight: 900 }}>
                {fmtMoney(rentab)}
                <div style={{ fontSize: 10, fontWeight: 700 }}>{rentab >= 0 ? "excedente" : "pérdida"}</div>
              </td>
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
        <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 900, color: C.ink }}>👥 Historial por trabajador — {nombreAreaPorClave(claveSel)}</h4>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: C.slate, maxWidth: 760 }}>
          Por cada mes se compara lo que produjo con lo que se le pagó (su nómina): si produjo menos fue <strong>ayuda</strong>, si produjo más fue <strong>excedente</strong>. Aquí va lo acumulado desde que ATLAS guarda cierres. Toca un trabajador para ver mes a mes.
        </p>
        {!rankArea.length ? (
          <div style={{ fontSize: 13, color: C.slate }}>Todavía no hay cierres guardados con detalle por trabajador para esta área.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <input value={busqHist} onChange={(e) => setBusqHist(e.target.value)} placeholder="Buscar trabajador…" style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, width: 220 }} />
              {[["ayuda", "Más ayudados"], ["excedente", "Más excedente"], ["nombre", "Nombre"]].map(([id, txt]) => (
                <button key={id} onClick={() => setOrdenHist(id)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${ordenHist === id ? C.ink : C.border}`, background: ordenHist === id ? C.ink : C.white, color: ordenHist === id ? C.seam : C.slate, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{txt}</button>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>{th("Trabajador")}{th("Meses ayudado", true)}{th("Ayuda total", true)}{th("Meses con excedente", true)}{th("Excedente total", true)}</tr>
                </thead>
                <tbody>
                  {histFiltrado.map((t) => (
                    <React.Fragment key={t.id}>
                      <tr onClick={() => setTrabAbierto(trabAbierto === t.id ? null : t.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: trabAbierto === t.id ? C.canvas : "transparent" }}>
                        <td style={{ padding: "9px 10px", fontWeight: 800, color: C.ink }}>{trabAbierto === t.id ? "▾" : "▸"} {t.nombre}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>{t.mesesAyudado} de {t.mesesTotal}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: t.ayuda > 0 ? C.red : C.slate, fontWeight: 800 }}>{fmtMoney(t.ayuda)}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>{t.mesesExcedente} de {t.mesesTotal}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: t.excedente > 0 ? C.green : C.slate, fontWeight: 700 }}>{fmtMoney(t.excedente)}</td>
                      </tr>
                      {trabAbierto === t.id && (
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td colSpan={5} style={{ padding: "4px 6px 12px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, background: C.canvas, borderRadius: 10 }}>
                              <thead>
                                <tr style={{ borderBottom: `2px solid ${C.border}` }}>{thCell("Mes")}{thCell("Produjo", true)}{thCell("Le pagamos (nómina)", true)}{thCell("Resultado", true)}</tr>
                              </thead>
                              <tbody>
                                {t.meses.map((x) => (
                                  <tr key={x.mk} style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <td style={{ padding: "7px 9px", fontWeight: 700 }}>{MESES_LARGOS[Number(x.mk.slice(5, 7)) - 1]} {x.mk.slice(0, 4)}</td>
                                    <td style={{ padding: "7px 9px", textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtMoney(x.valor)}</td>
                                    <td style={{ padding: "7px 9px", textAlign: "right", color: C.amber, fontWeight: 700 }}>{fmtMoney(x.costo)}</td>
                                    <td style={{ padding: "7px 9px", textAlign: "right" }}><EtiquetaResultado bal={x.valor - x.costo} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {!histFiltrado.length && <tr><td colSpan={5} style={{ padding: 12, color: C.slate, fontSize: 12.5 }}>Ningún trabajador coincide con la búsqueda.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
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
