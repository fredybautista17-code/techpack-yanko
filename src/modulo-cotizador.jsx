import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  TASAS_BASE, ETIQUETAS_TASAS, FIJOS_BASE, ETIQUETAS_FIJOS, PROCESOS_BASE,
  REGEX_INSUMO_TERMO, num, versionVacia, calcularCotizacion, parsearArchivoCotizacion,
} from "./cotizador-calculo";
import { descargarCotizacionesExcel } from "./cotizador-excel";
import {
  FILAS_VINILO, IMPREVISTOS_PCT, filasViniloVacias, calcularVinilo, aplicarInsumoAFila,
  tituloVinilo, mesLargo, descargarViniloExcel,
} from "./cotizador-vinilo";

// ─── COTIZADOR ───────────────────────────────────────────────────────────────
// (2026-10-06, a pedido de Fredy) Replica la hoja de costos de Excel
// ("975093 ULTACT 30.09.2026.xlsx") dentro de ATLAS. Cada cotización tiene
// VERSIONES con fecha (V1, V2, V3...). Los parámetros de "impuestos y
// administrativos" se guardan por CLIENTE (ficha General + una por cliente:
// Kamila, Surtiexport...) y cada versión guarda una COPIA de lo que usó, así
// que cambiar una ficha después no altera cotizaciones viejas. El precio que
// se aplica al prototipo / referencia de cápsula es el del escenario con
// margen, CON IVA, redondeado al peso.
// Colecciones Firestore: "cotizaciones" y "cotizador_parametros".

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
const functionsClient = getFunctions(fbApp);
const limpio = (o) => JSON.parse(JSON.stringify(o));
async function fsSet(col, id, data) {
  await setDoc(doc(db, col, id), limpio(data));
}
async function fsDel(col, id) {
  await deleteDoc(doc(db, col, id));
}

// (2026-10-06, a pedido de Fredy -- etapa 2) Precios de telas desde Busint: se
// usa la MISMA consulta que ya alimenta Corte ("estandar componentes prod"),
// que trae por tela+color el costo ("Costo") y el costo promedio ("ICprom").
// Se guarda en memoria para no repetir la consulta en cada fila.
let telasBusintPromesa = null;
function cargarTelasBusint(forzar) {
  if (!telasBusintPromesa || forzar) {
    telasBusintPromesa = httpsCallable(functionsClient, "getTelasStockBusintBD")()
      .then((r) => r.data?.telas || [])
      .catch((e) => { telasBusintPromesa = null; throw e; });
  }
  return telasBusintPromesa;
}
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2", seamDark: "#9E8870",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#7B5EA7", violetBg: "#F3EEF9",
};
const uid = () => Math.random().toString(36).slice(2, 9);
const hoyISO = () => new Date().toISOString().slice(0, 10);
const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtDec = (n) => (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) => ((Number(n) || 0) * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 }) + "%";
const fmtFecha = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "sin fecha");
const normRef = (v) => String(v || "").trim().toUpperCase().replace(/-/g, "");
const normTxt = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const slug = (v) => normTxt(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid();

const inp = { width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.white, color: C.ink, boxSizing: "border-box" };
const th = { textAlign: "left", fontSize: 11, color: C.slate, fontWeight: 700, padding: "6px 6px", textTransform: "uppercase", letterSpacing: 0.4 };
const td = { padding: "4px 4px", verticalAlign: "middle" };
const btn = (bg, color, border) => ({ padding: "8px 14px", background: bg, color, border: `1.5px solid ${border || bg}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" });

// Ficha de parámetros de un cliente: lo guardado, completado con los valores base.
function fichaCompleta(f) {
  return {
    nombre: f?.nombre || "General",
    tasas: { ...TASAS_BASE, ...(f?.tasas || {}) },
    fijos: { ...FIJOS_BASE, ...(f?.fijos || {}) },
    procesos: Array.isArray(f?.procesos) && f.procesos.length ? f.procesos : PROCESOS_BASE.map((p) => ({ ...p })),
  };
}
function buscarFicha(parametros, cliente) {
  const n = normTxt(cliente);
  const f = (parametros || []).find((p) => normTxt(p.nombre) === n) || (parametros || []).find((p) => p.id === "general");
  return fichaCompleta(f);
}
// Nueva versión en blanco con los parámetros de la ficha del cliente.
function versionDesdeFicha(ficha) {
  const v = versionVacia();
  v.tasas = { ...ficha.tasas };
  v.fijos = { ...ficha.fijos };
  v.procesos = ficha.procesos.map((p) => ({ nombre: p.nombre, valor: "", imp: !!p.imp }));
  return v;
}

function Pastilla({ children, bg, color }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, background: bg, color, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}
function Campo({ label, children, ancho }) {
  return (
    <label style={{ display: "block", minWidth: ancho || 0 }}>
      <div style={{ fontSize: 11, color: C.slate, fontWeight: 700, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      {children}
    </label>
  );
}
function Seccion({ titulo, sub, children, derecha, abierta = true, plegable }) {
  const [open, setOpen] = useState(abierta);
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14 }}>
      <div onClick={plegable ? () => setOpen(!open) : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: plegable ? "pointer" : "default" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{plegable ? (open ? "▾ " : "▸ ") : ""}{titulo}</div>
          {sub && <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{sub}</div>}
        </div>
        {derecha}
      </div>
      {open && <div style={{ padding: "0 16px 14px" }}>{children}</div>}
    </div>
  );
}

// Descarga con el formato de la hoja de Fredy (ver cotizador-excel.js).
async function descargarExcel(lista, nombre, imagen, notify) {
  try {
    const avisos = await descargarCotizacionesExcel(lista, nombre, { imagen });
    notify?.(avisos && avisos.length ? avisos.join(" ") : "Excel descargado");
  } catch (e) {
    notify?.("No se pudo generar el Excel: " + (e.message || e));
  }
}

// ─── EDITOR DE UNA COTIZACIÓN ────────────────────────────────────────────────
function CotizacionEditor({ inicial, parametros, clientes, protos, capsulas, onGuardar, onVolver, onEliminar, onAplicar, notify }) {
  const [cot, setCot] = useState(inicial);
  const [sucio, setSucio] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [telaBusint, setTelaBusint] = useState(null); // índice de la fila de tela que busca precio
  const ver = cot.versiones[cot.activa];
  const calc = useMemo(() => calcularCotizacion(ver.v), [ver.v]);

  function mutar(fn) {
    setCot((c) => {
      const n = limpio(c);
      fn(n);
      return n;
    });
    setSucio(true);
  }
  const setV = (fn) => mutar((n) => fn(n.versiones[n.activa].v));
  const setCab = (campo, valor) => mutar((n) => { n[campo] = valor; });

  // Al cambiar el cliente de una cotización NUEVA se cargan también los parámetros
  // (tasas y costos fijos) de ese cliente; en una ya guardada solo cambia el nombre
  // (los parámetros se recargan con el botón "Cargar ficha").
  function cambiarCliente(nuevo) {
    mutar((n) => {
      n.cliente = nuevo;
      if (!inicial.existe) {
        const f = buscarFicha(parametros, nuevo);
        const v = n.versiones[n.activa].v;
        v.tasas = { ...f.tasas };
        v.fijos = { ...f.fijos };
      }
    });
  }
  function cargarFicha() {
    const f = buscarFicha(parametros, cot.cliente);
    setV((v) => {
      v.tasas = { ...f.tasas };
      v.fijos = { ...f.fijos };
      // Solo ajusta el indicador de imprevistos de los procesos que ya existen.
      v.procesos.forEach((p) => {
        const base = f.procesos.find((x) => normTxt(x.nombre) === normTxt(p.nombre));
        if (base) p.imp = !!base.imp;
      });
    });
    notify?.(`Parámetros de "${f.nombre}" cargados en esta versión`);
  }
  function nuevaVersion() {
    mutar((n) => {
      const ultima = n.versiones[n.versiones.length - 1];
      n.versiones.push({ id: uid(), numero: ultima.numero + 1, fecha: hoyISO(), nota: "", v: limpio(ultima.v) });
      n.activa = n.versiones.length - 1;
    });
  }
  function borrarVersion() {
    if (cot.versiones.length <= 1) return;
    if (!window.confirm(`¿Borrar la V${ver.numero}? Esta acción no se puede deshacer.`)) return;
    mutar((n) => {
      n.versiones.splice(n.activa, 1);
      n.activa = Math.max(0, n.versiones.length - 1);
    });
  }
  async function guardar() {
    if (!String(cot.referencia).trim()) { notify?.("Escribe la referencia antes de guardar"); return; }
    await onGuardar(cot);
    setSucio(false);
    notify?.("Cotización guardada");
  }
  async function aplicarA(destino) {
    const valor = calc.precioAplicar;
    if (!(valor > 0)) { notify?.("El precio es 0 — completa los costos primero"); return; }
    const actualizado = {
      ...limpio(cot),
      vinculo: destino,
      precioAplicado: { valor, fecha: hoyISO(), version: ver.numero, destino: destino.label },
    };
    await onGuardar(actualizado);
    await onAplicar(destino, valor);
    setCot(actualizado);
    setSucio(false);
    setVincular(false);
    notify?.(`${fmtCOP(valor)} (con IVA) aplicado a ${destino.label}`);
  }

  // Filas de telas / insumos / procesos
  const telas = ver.v.telas;
  const insumos = ver.v.insumos;
  const procesos = ver.v.procesos;
  const celdaNum = (valor, onChange, ancho) => (
    <input type="text" inputMode="decimal" value={valor ?? ""} onChange={(e) => onChange(e.target.value)} style={{ ...inp, width: ancho || 90, textAlign: "right" }} />
  );
  const tasasEdit = Object.keys(ETIQUETAS_TASAS);
  const vinculoActual = cot.vinculo;
  // Foto del prototipo / referencia vinculada: va en el Excel, como en la hoja original.
  function imagenVinculada() {
    const vi = cot.vinculo;
    if (!vi) return null;
    if (vi.kind === "proto") return (protos || []).find((p) => p.id === vi.id)?.image || null;
    const cap = (capsulas || []).find((c) => c.id === vi.capsulaId);
    return cap?.referencias?.find((r) => r.id === vi.id)?.image || null;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => { if (!sucio || window.confirm("Hay cambios sin guardar. ¿Salir sin guardar?")) onVolver(); }} style={btn(C.white, C.slate, C.border)}>← Cotizaciones</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: C.ink }}>🧮 {cot.referencia || "Nueva cotización"} {cot.nombre ? <span style={{ color: C.slate, fontWeight: 600 }}>· {cot.nombre}</span> : null}</div>
        {sucio && <Pastilla bg={C.amberBg} color={C.amber}>Cambios sin guardar</Pastilla>}
        <div style={{ flex: 1 }} />
        {cot.id && inicial.existe && <button onClick={() => { if (window.confirm("¿Eliminar esta cotización con todas sus versiones?")) onEliminar(cot); }} style={btn(C.white, C.red, C.red)}>Eliminar</button>}
        <button onClick={() => descargarExcel([cot], `Cotizacion ${String(cot.referencia || "nueva").replace(/[\\/:*?"<>|]/g, "-")}.xlsx`, imagenVinculada(), notify)} style={btn(C.white, C.blue, C.blue)}>📥 Descargar Excel</button>
        <button onClick={guardar} style={btn(C.green, C.white)}>💾 Guardar versión</button>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <Campo label="Referencia"><input value={cot.referencia} onChange={(e) => setCab("referencia", e.target.value)} style={inp} placeholder="975093" /></Campo>
        <Campo label="Nombre / descripción"><input value={cot.nombre} onChange={(e) => setCab("nombre", e.target.value)} style={inp} placeholder="Camiseta ..." /></Campo>
        <Campo label="Cliente">
          <select value={cot.cliente || "General"} onChange={(e) => cambiarCliente(e.target.value)} style={inp}>
            {(clientes.includes(cot.cliente) || !cot.cliente ? clientes : [cot.cliente, ...clientes]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Prototipo / cápsula vinculado">
          <button onClick={() => setVincular(true)} style={{ ...inp, textAlign: "left", cursor: "pointer", color: vinculoActual ? C.ink : C.slate }}>
            {vinculoActual ? `${vinculoActual.kind === "proto" ? "⬡" : "⬢"} ${vinculoActual.label}` : "Elegir… (para aplicar el precio)"}
          </button>
        </Campo>
      </div>

      {/* Pestañas de versión */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {cot.versiones.map((vv, i) => (
          <button key={vv.id} onClick={() => mutar((n) => { n.activa = i; })}
            style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, border: `1.5px solid ${i === cot.activa ? C.ink : C.border}`, background: i === cot.activa ? C.ink : C.white, color: i === cot.activa ? C.white : C.slate }}>
            V{vv.numero} <span style={{ fontWeight: 500, opacity: 0.8 }}>· {fmtFecha(vv.fecha)}</span>
          </button>
        ))}
        <button onClick={nuevaVersion} style={btn(C.blueBg, C.blue, C.blue)}>+ Nueva versión</button>
        {cot.versiones.length > 1 && <button onClick={borrarVersion} style={{ ...btn(C.white, C.slate, C.border), fontWeight: 500 }}>Borrar V{ver.numero}</button>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <input type="date" value={ver.fecha || ""} onChange={(e) => mutar((n) => { n.versiones[n.activa].fecha = e.target.value; })} style={{ ...inp, width: 150 }} />
          <input value={ver.nota || ""} onChange={(e) => mutar((n) => { n.versiones[n.activa].nota = e.target.value; })} placeholder="Nota de la versión (qué cambió)" style={{ ...inp, width: 260 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }} className="cotizador-grid">
        <div style={{ minWidth: 0 }}>
          {/* TELAS */}
          <Seccion titulo="1 · Telas" sub="Precio por metro = precio por kilo ÷ rendimiento (m por kilo). Costo por prenda = consumo (m) × precio por metro."
            derecha={<button onClick={() => setV((v) => { v.telas.push({ material: "", precioKg: "", rendimiento: 1, ancho: "", consumo: "" }); })} style={btn(C.blueBg, C.blue, C.blue)}>+ Tela</button>}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead><tr><th style={th}>Material</th><th style={th}>$ / kg</th><th style={th}>Rend. m/kg</th><th style={th}>Ancho</th><th style={th}>Consumo m</th><th style={{ ...th, textAlign: "right" }}>$ / m</th><th style={{ ...th, textAlign: "right" }}>$ prenda</th><th /></tr></thead>
                <tbody>
                  {telas.map((t, i) => (
                    <tr key={i}>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <input value={t.material} onChange={(e) => setV((v) => { v.telas[i].material = e.target.value; })} style={{ ...inp, minWidth: 150 }} placeholder="Tela" />
                          <button title="Traer precio desde Busint" onClick={() => setTelaBusint(i)} style={{ ...btn(C.white, C.blue, C.blue), padding: "4px 8px" }}>🔎</button>
                        </div>
                        {t.fuente?.origen === "busint" && <div style={{ fontSize: 10, color: C.blue, marginTop: 2 }}>Busint · {fmtDec(t.fuente.valorBusint)} ({t.fuente.unidad === "kg" ? "por kilo" : t.fuente.unidad === "ml" ? "por ml" : "por m²"}) · {fmtFecha(t.fuente.fecha)}</div>}
                      </td>
                      <td style={td}>{celdaNum(t.precioKg, (x) => setV((v) => { v.telas[i].precioKg = x; }))}</td>
                      <td style={td}>{celdaNum(t.rendimiento, (x) => setV((v) => { v.telas[i].rendimiento = x; }), 70)}</td>
                      <td style={td}>{celdaNum(t.ancho, (x) => setV((v) => { v.telas[i].ancho = x; }), 70)}</td>
                      <td style={td}>{celdaNum(t.consumo, (x) => setV((v) => { v.telas[i].consumo = x; }), 80)}</td>
                      <td style={{ ...td, textAlign: "right", color: C.slate, fontSize: 13 }}>{fmtDec(calc.telas[i]?.precioM)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtDec(calc.telas[i]?.porPrenda)}</td>
                      <td style={td}>{telas.length > 1 && <button onClick={() => setV((v) => { v.telas.splice(i, 1); })} style={{ border: "none", background: "none", cursor: "pointer", color: C.red, fontSize: 16 }}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={6} style={{ ...td, textAlign: "right", fontWeight: 700, color: C.slate }}>Total telas</td><td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{fmtDec(calc.telasTotal)}</td><td /></tr></tfoot>
              </table>
            </div>
          </Seccion>

          {/* INSUMOS */}
          <Seccion titulo="2 · Insumos" sub="Marca «Imprevistos» en los insumos de termofijación / vinilo / DTF: sobre ellos se cobra el % de imprevistos."
            derecha={<button onClick={() => setV((v) => { v.insumos.push({ nombre: "", precio: "", consumo: 1, termo: false }); })} style={btn(C.blueBg, C.blue, C.blue)}>+ Insumo</button>}>
            {insumos.length === 0 && <div style={{ fontSize: 13, color: C.slate, padding: "6px 0" }}>Sin insumos todavía.</div>}
            {insumos.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead><tr><th style={th}>Insumo</th><th style={th}>Precio</th><th style={th}>Consumo</th><th style={th}>Imprevistos</th><th style={{ ...th, textAlign: "right" }}>$ prenda</th><th /></tr></thead>
                  <tbody>
                    {insumos.map((it, i) => (
                      <tr key={i}>
                        <td style={td}><input value={it.nombre} onChange={(e) => setV((v) => { v.insumos[i].nombre = e.target.value; if (!v.insumos[i].termoManual) v.insumos[i].termo = REGEX_INSUMO_TERMO.test(e.target.value); })} style={{ ...inp, minWidth: 190 }} placeholder="Hilo, etiqueta, vinilo…" /></td>
                        <td style={td}>{celdaNum(it.precio, (x) => setV((v) => { v.insumos[i].precio = x; }))}</td>
                        <td style={td}>{celdaNum(it.consumo, (x) => setV((v) => { v.insumos[i].consumo = x; }), 70)}</td>
                        <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!it.termo} onChange={(e) => setV((v) => { v.insumos[i].termo = e.target.checked; v.insumos[i].termoManual = true; })} /></td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtDec(calc.insumos[i]?.porPrenda)}</td>
                        <td style={td}><button onClick={() => setV((v) => { v.insumos.splice(i, 1); })} style={{ border: "none", background: "none", cursor: "pointer", color: C.red, fontSize: 16 }}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={4} style={{ ...td, textAlign: "right", fontWeight: 700, color: C.slate }}>Total insumos</td><td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{fmtDec(calc.insumosTotal)}</td><td /></tr></tfoot>
                </table>
              </div>
            )}
          </Seccion>

          {/* PROCESOS */}
          <Seccion titulo="3 · Procesos" sub={`Valor por prenda de cada proceso. Los marcados «Imp.» entran en la base del ${fmtPct(ver.v.tasas.imprevistos)} de imprevistos.`}
            derecha={<button onClick={() => setV((v) => { v.procesos.push({ nombre: "", valor: "", imp: false }); })} style={btn(C.blueBg, C.blue, C.blue)}>+ Proceso</button>}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                <thead><tr><th style={th}>Proceso</th><th style={th}>Valor / prenda</th><th style={th}>Imp.</th><th /></tr></thead>
                <tbody>
                  {procesos.map((p, i) => (
                    <tr key={i}>
                      <td style={td}><input value={p.nombre} onChange={(e) => setV((v) => { v.procesos[i].nombre = e.target.value; })} style={{ ...inp, minWidth: 190 }} /></td>
                      <td style={td}>{celdaNum(p.valor, (x) => setV((v) => { v.procesos[i].valor = x; }), 110)}</td>
                      <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!p.imp} onChange={(e) => setV((v) => { v.procesos[i].imp = e.target.checked; })} /></td>
                      <td style={td}><button onClick={() => setV((v) => { v.procesos.splice(i, 1); })} style={{ border: "none", background: "none", cursor: "pointer", color: C.red, fontSize: 16 }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td style={{ ...td, textAlign: "right", color: C.slate }}>Procesos</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtDec(calc.procesosBase)}</td><td colSpan={2} /></tr>
                  <tr><td style={{ ...td, textAlign: "right", color: C.slate }}>Imprevistos ({fmtPct(ver.v.tasas.imprevistos)})</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtDec(calc.imprevistos)}</td><td colSpan={2} /></tr>
                  <tr><td style={{ ...td, textAlign: "right", fontWeight: 700, color: C.slate }}>Total procesos</td><td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{fmtDec(calc.procesosTotal)}</td><td colSpan={2} /></tr>
                </tfoot>
              </table>
            </div>
          </Seccion>

          {/* PARÁMETROS (impuestos y administrativos) */}
          <Seccion plegable abierta={false} titulo="4 · Impuestos y administrativos" sub={`Copia propia de esta versión. Ficha base del cliente: «${buscarFicha(parametros, cot.cliente).nombre}».`}
            derecha={<button onClick={(e) => { e.stopPropagation(); cargarFicha(); }} style={btn(C.white, C.violet, C.violet)}>↻ Cargar ficha de {buscarFicha(parametros, cot.cliente).nombre}</button>}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.slate, margin: "4px 0 6px" }}>TASAS (en decimal: 0,005 = 0,5%)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              {tasasEdit.map((k) => (
                <Campo key={k} label={ETIQUETAS_TASAS[k]}>
                  <input type="text" inputMode="decimal" value={ver.v.tasas[k] ?? ""} onChange={(e) => setV((v) => { v.tasas[k] = e.target.value; })} style={inp} />
                </Campo>
              ))}
            </div>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.slate, margin: "4px 0 6px" }}>COSTOS FIJOS POR PRENDA ($)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              {Object.keys(ETIQUETAS_FIJOS).map((k) => (
                <Campo key={k} label={ETIQUETAS_FIJOS[k]}>
                  <input type="text" inputMode="decimal" value={ver.v.fijos[k] ?? ""} onChange={(e) => setV((v) => { v.fijos[k] = e.target.value; })} style={inp} />
                </Campo>
              ))}
            </div>
          </Seccion>
        </div>

        {/* PANEL DE RESULTADOS */}
        <div style={{ position: "sticky", top: 12 }}>
          <div style={{ background: C.ink, color: C.white, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, opacity: 0.7, fontWeight: 700 }}>PRECIO DE VENTA · V{ver.numero}</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{fmtCOP(calc.escMargen.precioConIva)}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>con IVA {fmtPct(ver.v.tasas.iva)} · sin IVA {fmtCOP(calc.escMargen.precioSinIva)}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Margen esperado</div>
              <input type="text" inputMode="decimal" value={ver.v.margen ?? ""} onChange={(e) => setV((v) => { v.margen = e.target.value; })} style={{ ...inp, width: 70, textAlign: "right" }} />
              <div style={{ fontSize: 11, opacity: 0.6 }}>0,05 = 5%</div>
            </div>
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>Utilidad por prenda: <b>{fmtCOP(calc.escMargen.utilidad)}</b></div>
            {ver.excelPrecio != null && (
              <div style={{ fontSize: 11, marginTop: 8, padding: "6px 8px", borderRadius: 6, background: Math.abs(ver.excelPrecio - calc.escMargen.precioSinIva) < 1 ? "rgba(45,158,107,.25)" : "rgba(232,93,74,.3)" }}>
                Excel (sin IVA): {fmtCOP(ver.excelPrecio)} {Math.abs(ver.excelPrecio - calc.escMargen.precioSinIva) < 1 ? "✓ coincide" : "≠ difiere"}
              </div>
            )}
            <button onClick={() => (vinculoActual ? aplicarA(vinculoActual) : setVincular(true))}
              style={{ ...btn(C.green, C.white), width: "100%", marginTop: 14, padding: "11px 14px" }}>
              {vinculoActual ? `Aplicar ${fmtCOP(calc.precioAplicar)} a ${vinculoActual.label.length > 26 ? vinculoActual.label.slice(0, 26) + "…" : vinculoActual.label}` : `Aplicar ${fmtCOP(calc.precioAplicar)} a un prototipo / cápsula`}
            </button>
            {vinculoActual && <button onClick={() => setVincular(true)} style={{ ...btn("transparent", C.white, "rgba(255,255,255,.3)"), width: "100%", marginTop: 8, fontWeight: 500, fontSize: 12 }}>Cambiar destino</button>}
            {cot.precioAplicado && (
              <div style={{ fontSize: 11, marginTop: 10, opacity: 0.75 }}>Último aplicado: {fmtCOP(cot.precioAplicado.valor)} (V{cot.precioAplicado.version}) a {cot.precioAplicado.destino} el {fmtFecha(cot.precioAplicado.fecha)}</div>
            )}
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, color: C.ink }}>Cómo se arma el costo</div>
            {[
              ["Telas", calc.telasTotal], ["Insumos", calc.insumosTotal], ["Procesos + imprevistos", calc.procesosTotal],
              ["Costo definitivo", calc.costoDefinitivo, true], [`Daños (${fmtPct(ver.v.tasas.danos)})`, calc.costoMasDanos - calc.costoDefinitivo],
              ["Impuestos y financieros", calc.impuestosTotal], ["Costos fijos", calc.fijosTotal],
              ["Costo total sin IVA", calc.costoTotalSinIva, true], ["Ajuste gastos financieros (sobre precio)", calc.ajusteFinanciero],
              ["Costo FULL", calc.costoFull, true],
            ].map(([et, val, fuerte]) => (
              <div key={et} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: fuerte ? 800 : 400, borderTop: fuerte ? `1px solid ${C.border}` : "none", marginTop: fuerte ? 4 : 0, color: fuerte ? C.ink : C.slate }}>
                <span>{et}</span><span>{fmtCOP(val)}</span>
              </div>
            ))}
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginTop: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, color: C.ink }}>Otros escenarios</div>
            <div style={{ color: C.slate, fontSize: 12, marginBottom: 2 }}>Precio tradicional (base {fmtDec(ver.v.tasas.baseUtilidad)})</div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{fmtCOP(calc.precioBase)} sin IVA · {fmtCOP(calc.precioBaseConIva)} con IVA</div>
            <Campo label="Si el cliente ofrece (con IVA)">
              <input type="text" inputMode="decimal" value={ver.v.precioClienteIva ?? ""} onChange={(e) => setV((v) => { v.precioClienteIva = e.target.value; })} style={inp} placeholder="Ej. 18500" />
            </Campo>
            {calc.escCliente && (
              <div style={{ marginTop: 6, fontSize: 12, color: calc.escCliente.utilidad >= 0 ? C.green : C.red, fontWeight: 700 }}>
                Utilidad {fmtCOP(calc.escCliente.utilidad)} · margen {fmtPct(calc.escCliente.margen)}
              </div>
            )}
            <div style={{ height: 10 }} />
            <Campo label="Utilidad fija por prenda ($)">
              <input type="text" inputMode="decimal" value={ver.v.utilidadFija ?? ""} onChange={(e) => setV((v) => { v.utilidadFija = e.target.value; })} style={inp} />
            </Campo>
            <div style={{ marginTop: 6, fontSize: 12, color: C.slate }}>Precio: <b style={{ color: C.ink }}>{fmtCOP(calc.escFijo.precioConIva)}</b> con IVA · margen {fmtPct(calc.escFijo.margen)}</div>
          </div>
        </div>
      </div>

      {telaBusint !== null && telas[telaBusint] && (
        <ModalTelaBusint inicial={telas[telaBusint].material} rendimiento={telas[telaBusint].rendimiento} onClose={() => setTelaBusint(null)}
          onElegir={(r) => { setV((v) => { Object.assign(v.telas[telaBusint], r); }); setTelaBusint(null); }} />
      )}
      {vincular && (
        <ModalVincular cot={cot} protos={protos} capsulas={capsulas} precio={calc.precioAplicar} onClose={() => setVincular(false)}
          onElegir={(dest) => aplicarA(dest)}
          onSoloVincular={(dest) => { setCab("vinculo", dest); setVincular(false); }} />
      )}
      <style>{`@media (max-width: 1000px) { .cotizador-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  );
}

// Traer el precio de una tela desde Busint. El usuario elige de dónde sale el
// número (Costo o Promedio) y en qué unidad viene, y ATLAS lo convierte a
// $/kg, que es como se escribe en la hoja de costos.
function ModalTelaBusint({ inicial, rendimiento, onElegir, onClose }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState(inicial || "");
  const [campo, setCampo] = useState("costo");
  const [unidad, setUnidad] = useState("kg");
  useEffect(() => {
    let vivo = true;
    cargarTelasBusint().then((f) => vivo && setFilas(f)).catch((e) => vivo && setError(e?.message || "No se pudo consultar Busint"));
    return () => { vivo = false; };
  }, []);
  const rend = num(rendimiento) || 1;
  const valorDe = (t) => (campo === "prom" ? t.icProm : t.costo);
  function aKg(t) {
    const v = Number(valorDe(t)) || 0;
    if (unidad === "kg") return v;
    if (unidad === "ml") return v * rend;
    return v * (t.ancho || 0) * rend; // por m²: m² por metro lineal = ancho
  }
  const palabras = normTxt(q).split(/\s+/).filter(Boolean);
  const lista = (filas || [])
    .filter((t) => t.activo !== false && (Number(valorDe(t)) || 0) > 0)
    .filter((t) => { const txt = normTxt(`${t.componente} ${t.color}`); return palabras.every((w) => txt.includes(w)); })
    .slice(0, 80);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(780px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>🔎 Precio de tela desde Busint</div>
          <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Busca la tela, revisa el número y confirma. Nada se cambia solo.</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o color…" style={inp} />
          <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", fontSize: 12, color: C.slate, alignItems: "center" }}>
            <label>Usar el valor: <select value={campo} onChange={(e) => setCampo(e.target.value)} style={{ ...inp, width: "auto" }}><option value="costo">Costo (Busint)</option><option value="prom">Costo promedio</option></select></label>
            <label>Ese valor viene: <select value={unidad} onChange={(e) => setUnidad(e.target.value)} style={{ ...inp, width: "auto" }}><option value="kg">por kilo</option><option value="ml">por metro lineal</option><option value="m2">por metro cuadrado</option></select></label>
            <span>Rendimiento de esta fila: <b>{fmtDec(rend)} m/kg</b></span>
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: 8 }}>
          {!filas && !error && <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>Consultando Busint…</div>}
          {error && <div style={{ padding: 16, color: C.red, fontSize: 13 }}>{error}</div>}
          {filas && lista.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay telas con precio que coincidan.</div>}
          {lista.map((t, i) => (
            <div key={(t.codcomp || "") + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.componente}{t.color ? ` · ${t.color}` : ""}</div>
                <div style={{ fontSize: 11, color: C.slate }}>Costo {fmtDec(t.costo)} · Promedio {fmtDec(t.icProm)} · ancho {fmtDec(t.ancho)} · actualizado {t.ufecha ? t.ufecha.slice(0, 10) : "—"}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12 }}><div style={{ color: C.slate }}>queda en</div><div style={{ fontWeight: 800 }}>{fmtCOP(aKg(t))} /kg</div></div>
              <button onClick={() => onElegir({ material: t.componente + (t.color ? ` ${t.color}` : ""), ancho: t.ancho || "", precioKg: Math.round(aKg(t) * 100) / 100, fuente: { origen: "busint", codcomp: t.codcomp || null, campo, unidad, valorBusint: Number(valorDe(t)) || 0, fecha: hoyISO() } })} style={{ ...btn(C.green, C.white), fontSize: 12 }}>Usar</button>
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, textAlign: "right" }}><button onClick={onClose} style={btn(C.white, C.slate, C.border)}>Cancelar</button></div>
      </div>
    </div>
  );
}
// Elegir a qué prototipo / referencia de cápsula se manda el precio.
function ModalVincular({ cot, protos, capsulas, precio, onElegir, onSoloVincular, onClose }) {
  const [q, setQ] = useState(cot.referencia || "");
  const opciones = useMemo(() => {
    const lista = [];
    (protos || []).filter((p) => !p.eliminado).forEach((p) => lista.push({ kind: "proto", id: p.id, label: `${p.reference || "s/ref"} · ${p.name || ""}`.trim(), reference: p.reference || "", cliente: p.cliente || p.colores?.[0] || "", precioActual: p.precioCotizacion }));
    (capsulas || []).filter((c) => !c.eliminado).forEach((cap) => (cap.referencias || []).forEach((r) => lista.push({ kind: "ref", id: r.id, capsulaId: cap.id, label: `${r.reference || "s/ref"} · ${r.name || ""} — ${cap.name}`, reference: r.reference || "", cliente: cap.cliente || "", precioActual: r.precioCotizacion })));
    return lista;
  }, [protos, capsulas]);
  const qn = normTxt(q);
  const qr = normRef(q);
  const filtradas = opciones
    .filter((o) => !qn || normTxt(o.label).includes(qn) || (qr && normRef(o.reference).includes(qr)))
    .sort((a, b) => (normRef(b.reference) === normRef(cot.referencia)) - (normRef(a.reference) === normRef(cot.referencia)))
    .slice(0, 60);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(640px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Aplicar {fmtCOP(precio)} (con IVA)</div>
          <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Elige el prototipo o la referencia de cápsula que recibe este precio.</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por referencia o nombre…" style={inp} />
        </div>
        <div style={{ overflowY: "auto", padding: 8 }}>
          {filtradas.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.slate, fontSize: 13 }}>No se encontró nada con ese texto.</div>}
          {filtradas.map((o) => {
            const igual = normRef(o.reference) === normRef(cot.referencia) && o.reference;
            return (
              <div key={o.kind + o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, borderBottom: `1px solid ${C.border}`, background: igual ? C.greenBg : "transparent" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.kind === "proto" ? "⬡" : "⬢"} {o.label}</div>
                  <div style={{ fontSize: 11, color: C.slate }}>{o.kind === "proto" ? "Prototipo" : "Referencia de cápsula"}{o.cliente ? ` · ${o.cliente}` : ""}{o.precioActual != null ? ` · precio actual ${fmtCOP(o.precioActual)}` : " · sin precio"}</div>
                </div>
                {igual && <Pastilla bg={C.green} color={C.white}>misma ref.</Pastilla>}
                <button onClick={() => onSoloVincular(o)} style={{ ...btn(C.white, C.slate, C.border), fontWeight: 500, fontSize: 12 }}>Solo vincular</button>
                <button onClick={() => onElegir(o)} style={{ ...btn(C.green, C.white), fontSize: 12 }}>Aplicar</button>
              </div>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, textAlign: "right" }}><button onClick={onClose} style={btn(C.white, C.slate, C.border)}>Cancelar</button></div>
      </div>
    </div>
  );
}

// ─── IMPORTAR EXCEL ──────────────────────────────────────────────────────────
function ModalImportar({ cotizaciones, parametros, clientes, onImportar, onClose }) {
  const [hojas, setHojas] = useState(null);
  const [error, setError] = useState("");
  const [cliente, setCliente] = useState("");
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState({});
  async function leer(file) {
    if (!file) return;
    setCargando(true); setError("");
    try {
      const r = await parsearArchivoCotizacion(file);
      if (!r.length) setError("No se encontraron hojas con cotización en el archivo.");
      setHojas(r);
      setSel(Object.fromEntries(r.map((_, i) => [i, true])));
    } catch (e) {
      setError("No se pudo leer el archivo: " + (e.message || e));
    }
    setCargando(false);
  }
  const elegidas = (hojas || []).filter((_, i) => sel[i]);
  const existentePorRef = (ref) => cotizaciones.find((c) => normRef(c.referencia) === normRef(ref));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(720px, 100%)", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>📥 Importar cotización desde Excel</div>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 14 }}>Cada hoja del archivo (V1, V2, V3…) se convierte en una versión. Las hojas de la misma referencia quedan en una sola cotización. Comparo el precio del Excel con el que calcula ATLAS para confirmar que coinciden.</div>
        <Campo label="Cliente de esta cotización">
          <select value={cliente || "General"} onChange={(e) => setCliente(e.target.value)} style={inp}>
            {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <div style={{ height: 12 }} />
        <input type="file" accept=".xlsx,.xlsm,.xls" onChange={(e) => leer(e.target.files?.[0])} />
        {cargando && <div style={{ marginTop: 10, fontSize: 13, color: C.slate }}>Leyendo archivo…</div>}
        {error && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{error}</div>}
        {hojas && hojas.length > 0 && (
          <div style={{ marginTop: 14, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr><th style={th} /><th style={th}>Hoja</th><th style={th}>Ref.</th><th style={th}>Fecha</th><th style={{ ...th, textAlign: "right" }}>Excel (sin IVA)</th><th style={{ ...th, textAlign: "right" }}>ATLAS (sin IVA)</th><th style={th}>Resultado</th></tr></thead>
              <tbody>
                {hojas.map((h, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}><input type="checkbox" checked={!!sel[i]} onChange={(e) => setSel({ ...sel, [i]: e.target.checked })} /></td>
                    <td style={{ ...td, fontSize: 13, fontWeight: 700 }}>{h.nombre}</td>
                    <td style={{ ...td, fontSize: 13 }}>{h.referencia || "—"}{existentePorRef(h.referencia) ? <div style={{ fontSize: 10, color: C.amber }}>ya existe: se agrega como versión</div> : null}</td>
                    <td style={{ ...td, fontSize: 12 }}>{fmtFecha(h.fecha)}</td>
                    <td style={{ ...td, textAlign: "right", fontSize: 13 }}>{h.precioExcel != null ? fmtCOP(h.precioExcel) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{fmtCOP(h.precioAtlas)}</td>
                    <td style={td}>{h.coincide === true ? <Pastilla bg={C.greenBg} color={C.green}>✓ Coincide</Pastilla> : h.coincide === false ? <Pastilla bg={C.redBg} color={C.red}>≠ Difiere</Pastilla> : <Pastilla bg={C.amberBg} color={C.amber}>Sin precio en Excel</Pastilla>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hojas.some((h) => h.coincide === false) && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>Hay hojas que no coinciden con el Excel: revisa esa versión antes de aplicar su precio.</div>}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={btn(C.white, C.slate, C.border)}>Cancelar</button>
          <button disabled={!elegidas.length} onClick={() => onImportar(elegidas, cliente)} style={{ ...btn(C.green, C.white), opacity: elegidas.length ? 1 : 0.4 }}>Importar {elegidas.length || ""} hoja(s)</button>
        </div>
      </div>
    </div>
  );
}

// ─── PARÁMETROS POR CLIENTE ──────────────────────────────────────────────────
function ParametrosView({ parametros, clientesApp, currentUser, notify }) {
  const fichasVirtuales = ["General", "Kamila", "Surtiexport"];
  const lista = useMemo(() => {
    const out = [];
    const vistos = new Set();
    const agregar = (nombre) => {
      const k = normTxt(nombre);
      if (!k || vistos.has(k)) return;
      vistos.add(k);
      const guardada = parametros.find((p) => normTxt(p.nombre) === k);
      out.push({ id: guardada?.id || (k === "general" ? "general" : slug(nombre)), guardada: !!guardada, ...fichaCompleta({ ...(guardada || {}), nombre: guardada?.nombre || nombre }) });
    };
    fichasVirtuales.forEach(agregar);
    parametros.forEach((p) => agregar(p.nombre));
    return out;
  }, [parametros]);
  const [selId, setSelId] = useState("general");
  const [nuevo, setNuevo] = useState("");
  const [borrador, setBorrador] = useState(null);
  const actual = lista.find((f) => f.id === selId) || lista[0];
  useEffect(() => { setBorrador(actual ? limpio(actual) : null); }, [selId, actual?.guardada, parametros]); // eslint-disable-line
  if (!borrador) return null;
  const setB = (fn) => setBorrador((b) => { const n = limpio(b); fn(n); return n; });
  async function guardar() {
    await fsSet("cotizador_parametros", borrador.id, { id: borrador.id, nombre: borrador.nombre, tasas: borrador.tasas, fijos: borrador.fijos, procesos: borrador.procesos, actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    notify?.(`Ficha "${borrador.nombre}" guardada. Las cotizaciones nuevas la usarán; las ya guardadas no cambian.`);
  }
  async function agregarCliente() {
    const n = nuevo.trim();
    if (!n) return;
    const id = slug(n);
    await fsSet("cotizador_parametros", id, { id, nombre: n, tasas: { ...TASAS_BASE }, fijos: { ...FIJOS_BASE }, procesos: PROCESOS_BASE.map((p) => ({ ...p })), actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    setNuevo(""); setSelId(id);
  }
  async function borrarFicha() {
    if (borrador.id === "general" || !actual.guardada) return;
    if (!window.confirm(`¿Quitar la ficha de ${borrador.nombre}? Sus cotizaciones guardadas no cambian.`)) return;
    await fsDel("cotizador_parametros", borrador.id);
    setSelId("general");
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 16, alignItems: "start" }} className="cotizador-grid">
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
        {lista.map((f) => (
          <button key={f.id} onClick={() => setSelId(f.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", marginBottom: 4, borderRadius: 8, border: "none", cursor: "pointer", fontWeight: f.id === selId ? 800 : 500, background: f.id === selId ? C.seam : "transparent", color: C.ink, fontSize: 13 }}>
            {f.nombre} {!f.guardada && <span style={{ fontSize: 10, color: C.slate }}>(valores base)</span>}
          </button>
        ))}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 10 }}>
          <input list="cotizador-clientes-par" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Agregar cliente…" style={inp} />
          <datalist id="cotizador-clientes-par">{clientesApp.filter((c) => !lista.some((f) => normTxt(f.nombre) === normTxt(c))).map((c) => <option key={c} value={c} />)}</datalist>
          <button onClick={agregarCliente} style={{ ...btn(C.blueBg, C.blue, C.blue), width: "100%", marginTop: 6 }}>+ Agregar cliente</button>
        </div>
      </div>
      <div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>Ficha: {borrador.nombre}</div>
          {actual.guardada && borrador.id !== "general" && <button onClick={borrarFicha} style={btn(C.white, C.red, C.red)}>Quitar ficha</button>}
          <button onClick={guardar} style={btn(C.green, C.white)}>💾 Guardar ficha</button>
        </div>
        <Seccion titulo="Tasas e impuestos" sub="En decimal: 0,005 = 0,5%. Se usan para las cotizaciones NUEVAS de este cliente.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {Object.keys(ETIQUETAS_TASAS).map((k) => (
              <Campo key={k} label={ETIQUETAS_TASAS[k]}><input type="text" inputMode="decimal" value={borrador.tasas[k] ?? ""} onChange={(e) => setB((b) => { b.tasas[k] = e.target.value; })} style={inp} /></Campo>
            ))}
          </div>
        </Seccion>
        <Seccion titulo="Costos fijos por prenda ($)" sub="Administrativos, bodega, diseño, empaque, transporte, servicios…">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {Object.keys(ETIQUETAS_FIJOS).map((k) => (
              <Campo key={k} label={ETIQUETAS_FIJOS[k]}><input type="text" inputMode="decimal" value={borrador.fijos[k] ?? ""} onChange={(e) => setB((b) => { b.fijos[k] = e.target.value; })} style={inp} /></Campo>
            ))}
          </div>
        </Seccion>
        <Seccion titulo="Procesos de la cotización" sub="Lista de procesos que aparece en cada cotización nueva de este cliente. «Imp.» = entra en la base de imprevistos."
          derecha={<button onClick={() => setB((b) => { b.procesos.push({ nombre: "", imp: false }); })} style={btn(C.blueBg, C.blue, C.blue)}>+ Proceso</button>}>
          {borrador.procesos.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input value={p.nombre} onChange={(e) => setB((b) => { b.procesos[i].nombre = e.target.value; })} style={{ ...inp, maxWidth: 300 }} />
              <label style={{ fontSize: 12, color: C.slate, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={!!p.imp} onChange={(e) => setB((b) => { b.procesos[i].imp = e.target.checked; })} />Imp.</label>
              <button onClick={() => setB((b) => { b.procesos.splice(i, 1); })} style={{ border: "none", background: "none", cursor: "pointer", color: C.red, fontSize: 16 }}>×</button>
            </div>
          ))}
        </Seccion>
      </div>
    </div>
  );
}

// ─── PANTALLA PRINCIPAL ──────────────────────────────────────────────────────
// ─── MINICOTIZADOR DE VINILO / DTF ───────────────────────────────────────────
// (2026-10-15, a pedido de Fredy) Ver src/cotizador-vinilo.js. Colección
// Firestore "cotizador_vinilo": un doc por referencia+mes (id "{REF}_{aaaa-mm}")
// y un doc "_estandar" con los valores de los procesos fijos (corte, espiga...).
// Catálogo de insumos de Busint ("maestro de insumos"): se consulta una sola vez
// y se guarda en memoria (igual que las telas).
let catalogoInsumosPromesa = null;
function cargarCatalogoInsumos(forzar) {
  if (!catalogoInsumosPromesa || forzar) {
    catalogoInsumosPromesa = httpsCallable(functionsClient, "getCatalogoInsumosBusint")()
      .then((r) => r.data?.insumos || [])
      .catch((e) => { catalogoInsumosPromesa = null; throw e; });
  }
  return catalogoInsumosPromesa;
}
function ModalInsumoBusint({ inicial, titulo, onElegir, onClose }) {
  const [cat, setCat] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState(inicial || "");
  useEffect(() => { cargarCatalogoInsumos().then(setCat).catch((e) => setError(e.message || String(e))); }, []);
  const lista = useMemo(() => {
    if (!cat) return [];
    const palabras = normTxt(q).split(/\s+/).filter(Boolean);
    return cat.filter((x) => palabras.every((w) => normTxt(x.insumo).includes(w))).slice(0, 60);
  }, [cat, q]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.45)", zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Insumos de Busint — {titulo}</div>
          <button onClick={onClose} style={btn(C.white, C.slate, C.border)}>Cerrar</button>
        </div>
        <div style={{ padding: "12px 18px" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe parte del nombre del insumo…" style={inp} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 16px" }}>
          {!cat && !error && <div style={{ padding: 20, textAlign: "center", color: C.slate, fontSize: 13 }}>Consultando el catálogo de Busint…</div>}
          {error && <div style={{ padding: 12, background: C.redBg, color: C.red, borderRadius: 8, fontSize: 13 }}>No se pudo consultar Busint: {error}</div>}
          {cat && lista.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.slate, fontSize: 13 }}>Ningún insumo coincide con la búsqueda.</div>}
          {lista.map((x) => (
            <div key={x.insumo} onClick={() => onElegir(x)} style={{ display: "flex", gap: 10, padding: "9px 6px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13, alignItems: "center" }}>
              <div style={{ flex: 1 }}>{x.insumo}{x.codigo && <span style={{ color: C.slate, fontSize: 11 }}> · {x.codigo}</span>}</div>
              <div style={{ color: C.slate, minWidth: 40 }}>{x.unidad}</div>
              <div style={{ fontWeight: 800, minWidth: 80, textAlign: "right", color: x.costo > 0 ? C.ink : C.amber }}>{x.costo > 0 ? "$" + fmtDec(x.costo) : "sin costo"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniVinilo({ currentUser, notify, onPasar }) {
  const [guardados, setGuardados] = useState([]);
  const [ref, setRef] = useState("");
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [pct, setPct] = useState(IMPREVISTOS_PCT);
  const [filas, setFilas] = useState(() => filasViniloVacias());
  const [buscandoFila, setBuscandoFila] = useState(null); // fila que está eligiendo insumo de Busint
  const [estandarAplicado, setEstandarAplicado] = useState(false);

  useEffect(() => onSnapshot(collection(db, "cotizador_vinilo"), (s) => setGuardados(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {}), []);

  // Los procesos fijos arrancan con el estándar guardado (si existe).
  useEffect(() => {
    if (estandarAplicado) return;
    const est = guardados.find((g) => g.id === "_estandar");
    if (!est) return;
    setEstandarAplicado(true);
    setFilas((fs) => fs.map((f) => {
      const e = (est.filas || []).find((x) => x.key === f.key);
      return e && f.tipo === "proceso" ? { ...f, valor: e.valor, base: e.base } : f;
    }));
  }, [guardados, estandarAplicado]);

  const calc = useMemo(() => calcularVinilo(filas, pct), [filas, pct]);
  const cambiar = (key, campo, valor) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, [campo]: valor } : f)));
  async function guardar() {
    if (!normRef(ref)) { notify?.("Escribe la referencia para guardar"); return; }
    await fsSet("cotizador_vinilo", `${normRef(ref)}_${mes}`, { ref: ref.trim(), mes, pct, filas, total: calc.total, actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    notify?.("Minicotización guardada");
  }
  async function guardarEstandar() {
    await fsSet("cotizador_vinilo", "_estandar", { filas: filas.filter((f) => f.tipo === "proceso").map((f) => ({ key: f.key, valor: f.valor, base: f.base })), actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    notify?.("Valores de procesos guardados como estándar");
  }
  function cargar(g) {
    setRef(g.ref || ""); setMes(g.mes || hoyISO().slice(0, 7)); setPct(g.pct ?? IMPREVISTOS_PCT); setFilas(g.filas || filasViniloVacias());
  }
  async function excel() {
    try { await descargarViniloExcel({ ref, mes, filas, pct }); } catch (e) { notify?.("No se pudo generar el Excel: " + (e.message || e)); }
  }

  const lista = guardados.filter((g) => g.id !== "_estandar").sort((a, b) => String(b.actualizado || "").localeCompare(String(a.actualizado || "")));
  const cel = { ...inp, textAlign: "right" };
  const money = (n) => "$" + fmtDec(n);

  return (
    <div>
      <Seccion titulo="🎨 Minicotizador de Vinilo / DTF" sub="En cada insumo usa 🔎 para tomar su costo del catálogo de Busint y digita el promedio (consumo); los demás son procesos con valor fijo. TOTAL = costo por unidad + BASE.">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Campo label="Referencia" ancho={150}><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej: 98-5644" style={inp} /></Campo>
          <Campo label="Mes" ancho={140}><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={inp} /></Campo>
          <Campo label="Imprevistos %" ancho={100}><input value={pct} onChange={(e) => setPct(e.target.value)} style={cel} /></Campo>
        </div>
      </Seccion>

      <Seccion titulo={tituloVinilo(ref.trim(), mes)} sub="El costo M.P viene del catálogo de Busint (🔎); todo se puede corregir a mano.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ background: "#FFF9C4" }}>
                <th style={th}>Proceso e insumo</th><th style={{ ...th, textAlign: "right" }}>Costo M.P</th><th style={{ ...th, textAlign: "right" }}>Promedio</th>
                <th style={th}>U</th><th style={{ ...th, textAlign: "right" }}>Costo x U</th><th style={{ ...th, textAlign: "right" }}>Base</th><th style={{ ...th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.key} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{f.nombre}</div>
                      {f.tipo === "insumo" && <button onClick={() => setBuscandoFila(f.key)} title="Buscar el insumo en el catálogo de Busint" style={{ ...btn(C.blueBg, C.blue, C.blueBg), padding: "3px 8px" }}>🔎</button>}
                    </div>
                    {f.fuente && <div style={{ fontSize: 11, color: f.fuente.startsWith("No está") ? C.amber : C.slate }}>{f.fuente}</div>}
                  </td>
                  {f.tipo === "insumo" ? (
                    <>
                      <td style={td}><input value={f.costoMP} onChange={(e) => cambiar(f.key, "costoMP", e.target.value)} style={cel} /></td>
                      <td style={td}><input value={f.consumo} onChange={(e) => cambiar(f.key, "consumo", e.target.value)} style={cel} /></td>
                      <td style={{ ...td, width: 60 }}><input value={f.unidad} onChange={(e) => cambiar(f.key, "unidad", e.target.value)} style={inp} /></td>
                      <td style={{ ...td, textAlign: "right", fontSize: 13 }}>{money(calc.detalle[i].costoXU)}</td>
                    </>
                  ) : (
                    <>
                      <td style={td} /><td style={td} /><td style={td} />
                      <td style={td}><input value={f.valor} onChange={(e) => cambiar(f.key, "valor", e.target.value)} style={cel} /></td>
                    </>
                  )}
                  <td style={td}><input value={f.base} onChange={(e) => cambiar(f.key, "base", e.target.value)} style={cel} /></td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 800, fontSize: 13 }}>{money(calc.detalle[i].total)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.ink}`, background: "#FFF9C4" }}>
                <td colSpan={6} style={{ ...td, textAlign: "right", fontWeight: 800, padding: 8 }}>SUMA VINILO + DTF</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{money(calc.suma)}</td>
              </tr>
              <tr style={{ background: "#FFF9C4" }}>
                <td colSpan={6} style={{ ...td, textAlign: "right", fontWeight: 800, padding: 8 }}>IMPREVISTOS {fmtDec(num(pct))}%</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{money(calc.imprevistos)}</td>
              </tr>
              <tr style={{ background: "#FFF176" }}>
                <td colSpan={6} style={{ ...td, textAlign: "right", fontWeight: 900, padding: 8, fontSize: 15 }}>TOTAL</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 900, fontSize: 15 }}>{money(calc.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={guardar} style={btn(C.green, C.white)}>💾 Guardar</button>
          <button onClick={excel} style={btn(C.white, C.blue, C.blue)}>📤 Descargar Excel</button>
          <button onClick={() => onPasar(ref, filas, calc)} style={btn(C.white, C.violet, C.violet)}>🧮 Pasar al cotizador</button>
          <div style={{ flex: 1 }} />
          <button onClick={guardarEstandar} title="Guarda los valores de corte, descartonado, espiga y bajada para las próximas referencias" style={btn(C.white, C.slate, C.border)}>Guardar procesos como estándar</button>
        </div>
      </Seccion>

      <Seccion titulo={`Minicotizaciones guardadas (${lista.length})`} plegable abierta={false}>
        {lista.length === 0 && <div style={{ fontSize: 13, color: C.slate }}>Aún no hay ninguna guardada.</div>}
        {lista.map((g) => (
          <div key={g.id} onClick={() => cargar(g)} style={{ display: "flex", gap: 12, padding: "8px 4px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13 }}>
            <b style={{ minWidth: 110 }}>{g.ref}</b><span style={{ color: C.slate, minWidth: 90 }}>{mesLargo(g.mes)}</span><span style={{ flex: 1, color: C.slate }}>{g.actualizadoPor || ""} · {fmtFecha(String(g.actualizado || "").slice(0, 10))}</span><b>{money(g.total)}</b>
          </div>
        ))}
      </Seccion>
      {buscandoFila && (() => {
        const def = FILAS_VINILO.find((d) => d.key === buscandoFila);
        const fila = filas.find((f) => f.key === buscandoFila);
        return <ModalInsumoBusint inicial={def?.buscar || ""} titulo={fila?.nombre || ""} onClose={() => setBuscandoFila(null)}
          onElegir={(x) => { setFilas((fs) => fs.map((f) => (f.key === buscandoFila ? aplicarInsumoAFila(f, x) : f))); setBuscandoFila(null); }} />;
      })()}
    </div>
  );
}

// ─── INICIO (DASHBOARD) DEL MÓDULO DE COTIZACIONES ───────────────────────────
// (2026-10-16, a pedido de Fredy) Pantalla de entrada del módulo, como la de
// Contabilidad: fichas de resumen, accesos a las tres pantallas y las últimas
// cotizaciones. Todo sale de las cotizaciones guardadas (nada se escribe aquí).
const DIAS_SIN_CAMBIOS = 30;
function estadoCotizacion(c) {
  if (c.precioAplicado) return { txt: "Aplicado", bg: C.greenBg, color: C.green };
  if (c.vinculo) return { txt: "Vinculada", bg: C.blueBg, color: C.blue };
  return { txt: "Sin aplicar", bg: C.amberBg, color: C.amber };
}
function InicioCotizaciones({ cotizaciones, minis, cargado, onIr, onNueva, onFiltro, onAbrir }) {
  const hoy = new Date();
  const mesActual = hoyISO().slice(0, 7);
  const clientes = new Set(cotizaciones.map((c) => c.cliente || "General"));
  const nVersiones = cotizaciones.reduce((s, c) => s + (c.versiones?.length || 0), 0);
  const versionesMes = cotizaciones.reduce((s, c) => s + (c.versiones || []).filter((v) => String(v.fecha || "").startsWith(mesActual)).length, 0);
  const aplicadas = cotizaciones.filter((c) => c.precioAplicado).length;
  const sinAplicar = cotizaciones.length - aplicadas;
  const sinVincular = cotizaciones.filter((c) => !c.vinculo && !c.precioAplicado).length;
  const viejas = cotizaciones.filter((c) => {
    const f = c.actualizado ? new Date(c.actualizado) : null;
    return f && (hoy - f) / 86400000 > DIAS_SIN_CAMBIOS;
  }).length;
  const ultimas = [...cotizaciones].sort((a, b) => String(b.actualizado || "").localeCompare(String(a.actualizado || ""))).slice(0, 6);
  const mesLbl = hoy.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const Ficha = ({ label, valor, sub, color }) => (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4, color: color || C.ink }}>{cargado ? valor : "…"}</div>
      <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{sub}</div>
    </div>
  );
  const Acceso = ({ icono, bg, titulo, desc, tab }) => (
    <div onClick={() => onIr(tab)} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, display: "grid", placeItems: "center", fontSize: 22 }}>{icono}</div>
      <div><div style={{ fontWeight: 800, fontSize: 14 }}>{titulo}</div><div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{desc}</div></div>
    </div>
  );
  const Pendiente = ({ n, bg, color, texto, filtro }) => (
    <div onClick={() => n > 0 && filtro && onFiltro(filtro)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderTop: `1px solid ${C.border}`, fontSize: 13, cursor: n > 0 && filtro ? "pointer" : "default" }}>
      <Pastilla bg={bg} color={color}>{cargado ? n : "…"}</Pastilla>{texto}
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 16 }}>
        <Ficha label="Cotizaciones" valor={cotizaciones.length} sub={`${clientes.size} cliente(s) · ${nVersiones} versiones`} />
        <Ficha label="Versiones este mes" valor={versionesMes} sub={mesLbl} />
        <Ficha label="Precio ya aplicado" valor={aplicadas} sub="en prototipos y cápsulas" color={C.green} />
        <Ficha label="Pendientes de aplicar" valor={sinAplicar} sub="cotizadas sin precio aplicado" color={C.amber} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginBottom: 16 }}>
        <Acceso icono="🧮" bg={C.blueBg} titulo="Cotizaciones" desc="Crear, versionar y aplicar precios" tab="cotizaciones" />
        <Acceso icono="🎨" bg={C.amberBg} titulo="Vinilo / DTF" desc="Minicotizador con datos de Busint" tab="vinilo" />
        <Acceso icono="⚙" bg={C.violetBg} titulo="Parámetros por cliente" desc="Impuestos, administrativos y procesos" tab="parametros" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", paddingBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Últimas cotizaciones</div>
            <button onClick={onNueva} style={{ ...btn(C.green, C.white), padding: "6px 12px" }}>+ Nueva cotización</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
              <thead><tr><th style={{ ...th, padding: "6px 16px" }}>Referencia</th><th style={th}>Cliente</th><th style={th}>Versión</th><th style={{ ...th, textAlign: "right" }}>Precio con IVA</th><th style={th}>Estado</th></tr></thead>
              <tbody>
                {cargado && ultimas.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: C.slate }}>Aún no hay cotizaciones.</td></tr>}
                {ultimas.map((c) => {
                  const ult = c.versiones?.[c.versiones.length - 1];
                  const r = ult ? calcularCotizacion(ult.v) : null;
                  const e = estadoCotizacion(c);
                  return (
                    <tr key={c.id} onClick={() => onAbrir(c)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <td style={{ padding: "9px 16px", fontWeight: 800 }}>{c.referencia || "—"}</td>
                      <td style={td}>{c.cliente || "General"}</td>
                      <td style={{ ...td, color: C.slate }}>V{ult?.numero} · {fmtFecha(ult?.fecha).slice(0, 5)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{r ? fmtCOP(r.precioAplicar) : "—"}</td>
                      <td style={td}><Pastilla bg={e.bg} color={e.color}>{e.txt}</Pastilla></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", alignSelf: "start" }}>
          <div style={{ fontWeight: 800, fontSize: 14, padding: "12px 16px" }}>Por atender</div>
          <Pendiente n={sinAplicar} bg={C.amberBg} color={C.amber} texto="Cotizadas sin precio aplicado" filtro="sinAplicar" />
          <Pendiente n={sinVincular} bg={C.redBg} color={C.red} texto="Sin vincular a prototipo ni cápsula" filtro="sinVincular" />
          <Pendiente n={viejas} bg={C.blueBg} color={C.blue} texto={`Con más de ${DIAS_SIN_CAMBIOS} días sin cambios`} filtro="viejas" />
          <Pendiente n={minis.length} bg={C.violetBg} color={C.violet} texto="Minicotizaciones de vinilo guardadas" />
        </div>
      </div>
    </div>
  );
}

export default function CotizadorView({ currentUser, config, protos, capsulas, iniciarDesde, onIniciarConsumido, onAplicarPrecio, onVolver, notify }) {
  const [tab, setTab] = useState("inicio");
  const [minis, setMinis] = useState([]); // minicotizaciones de vinilo guardadas (solo para el conteo del inicio)
  const [filtroEstado, setFiltroEstado] = useState(null); // "sinAplicar" | "sinVincular" | "viejas"
  const [cotizaciones, setCotizaciones] = useState([]);
  const [parametros, setParametros] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [edit, setEdit] = useState(null); // cotización en edición
  const [busqueda, setBusqueda] = useState("");
  const [importar, setImportar] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "cotizaciones"), (s) => { setCotizaciones(s.docs.map((d) => ({ ...d.data(), id: d.id }))); setCargado(true); }, () => setCargado(true));
    const u2 = onSnapshot(collection(db, "cotizador_parametros"), (s) => setParametros(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {});
    const u3 = onSnapshot(collection(db, "cotizador_vinilo"), (s) => setMinis(s.docs.filter((d) => d.id !== "_estandar").map((d) => ({ ...d.data(), id: d.id }))), () => {});
    return () => { u1(); u2(); u3(); };
  }, []);

  const clientesApp = useMemo(() => {
    const set = new Set(["General", "Kamila", "Surtiexport"]);
    (config?.clientes || []).forEach((c) => c?.nombre && set.add(c.nombre));
    parametros.forEach((p) => p.nombre && set.add(p.nombre));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [config, parametros]);

  function cotNueva(extra = {}) {
    const cliente = extra.cliente || "General";
    const ficha = buscarFicha(parametros, cliente);
    return {
      id: uid() + uid(), existe: false, referencia: "", nombre: "", cliente, vinculo: null, precioAplicado: null,
      versiones: [{ id: uid(), numero: 1, fecha: hoyISO(), nota: "", v: versionDesdeFicha(ficha) }], activa: 0,
      creadoPor: currentUser?.name || "", creado: new Date().toISOString(), ...extra,
    };
  }

  // Entrada desde el botón "🧮 Cotizar" de un prototipo / referencia.
  useEffect(() => {
    if (!iniciarDesde || !cargado) return;
    const existente = cotizaciones.find((c) => c.vinculo && c.vinculo.kind === iniciarDesde.kind && c.vinculo.id === iniciarDesde.id)
      || (iniciarDesde.reference ? cotizaciones.find((c) => normRef(c.referencia) === normRef(iniciarDesde.reference)) : null);
    if (existente) setEdit({ ...limpio(existente), existe: true });
    else setEdit(cotNueva({ referencia: iniciarDesde.reference || "", nombre: iniciarDesde.name || "", cliente: iniciarDesde.cliente || "General", vinculo: { kind: iniciarDesde.kind, id: iniciarDesde.id, capsulaId: iniciarDesde.capsulaId, label: iniciarDesde.label, reference: iniciarDesde.reference } }));
    setTab("cotizaciones");
    onIniciarConsumido?.();
  }, [iniciarDesde, cargado]); // eslint-disable-line

  async function guardar(cot) {
    const { existe, ...datos } = cot;
    await fsSet("cotizaciones", cot.id, { ...datos, actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    setEdit((e) => (e && e.id === cot.id ? { ...e, existe: true } : e));
  }
  async function eliminar(cot) {
    await fsDel("cotizaciones", cot.id);
    setEdit(null);
    notify?.("Cotización eliminada");
  }
  // Minicotizador de Vinilo / DTF -> cotización de la referencia (versión nueva).
  async function pasarAlCotizador(ref, filas, calc) {
    const k = normRef(ref);
    if (!k) { notify?.("Escribe la referencia para pasarla al cotizador"); return; }
    const existente = cotizaciones.find((c) => normRef(c.referencia) === k);
    const base = existente ? limpio(existente) : cotNueva({ referencia: String(ref).trim() });
    const ultima = base.versiones[base.versiones.length - 1];
    const v = limpio(ultima.v);
    v.procesos = v.procesos || [];
    v.insumos = v.insumos || [];
    const ponerProceso = (nombre, valor) => {
      const i = v.procesos.findIndex((p) => normTxt(p.nombre) === normTxt(nombre));
      if (i >= 0) v.procesos[i] = { ...v.procesos[i], valor };
      else v.procesos.push({ nombre, valor, imp: true });
    };
    const ponerInsumo = (nombre, precio, consumo) => {
      const i = v.insumos.findIndex((x) => normTxt(x.nombre) === normTxt(nombre));
      const nuevo = { nombre, precio, consumo, termo: true };
      if (i >= 0) v.insumos[i] = { ...v.insumos[i], ...nuevo };
      else v.insumos.push(nuevo);
    };
    const PROC = { dtf: "Aplique DTF", corte: "Corte vinilo", descartonado: "Descartonado", espiga: "Espiga", bajada: "Bajada de vinilo" };
    filas.forEach((f, i) => {
      const total = Math.round(calc.detalle[i].total * 100) / 100;
      if (PROC[f.key]) ponerProceso(PROC[f.key], total);
      else ponerInsumo(f.nombre, num(f.costoMP) + num(f.base) / (num(f.consumo) || 1), num(f.consumo));
    });
    const nota = "Desde minicotizador Vinilo/DTF";
    if (existente) {
      const numero = base.versiones.reduce((m, x) => Math.max(m, x.numero), 0) + 1;
      base.versiones.push({ id: uid(), numero, fecha: hoyISO(), nota, v });
      base.activa = base.versiones.length - 1;
    } else {
      base.versiones[0] = { ...ultima, nota, v };
      base.activa = 0;
    }
    await guardar(base);
    setEdit({ ...base, existe: true });
    setTab("cotizaciones");
    notify?.(existente ? `Versión V${base.versiones[base.versiones.length - 1].numero} creada en la cotización ${base.referencia}` : `Cotización ${base.referencia} creada`);
  }

  async function importarHojas(hojas, cliente) {
    const cli = cliente.trim() || "General";
    const porRef = new Map();
    hojas.forEach((h) => { const k = normRef(h.referencia) || h.nombre; if (!porRef.has(k)) porRef.set(k, []); porRef.get(k).push(h); });
    let ultimo = null;
    for (const [k, hs] of porRef) {
      const existente = cotizaciones.find((c) => normRef(c.referencia) === k);
      const base = existente ? limpio(existente) : cotNueva({ referencia: hs[0].referencia, nombre: "", cliente: cli });
      if (!existente) base.versiones = [];
      let numero = base.versiones.reduce((m, v) => Math.max(m, v.numero), 0);
      hs.forEach((h) => { numero += 1; base.versiones.push({ id: uid(), numero, fecha: h.fecha || hoyISO(), nota: `Importada del Excel (hoja ${h.nombre})`, v: h.version, excelPrecio: h.precioExcel }); });
      base.activa = base.versiones.length - 1;
      await guardar(base);
      ultimo = { ...base, existe: true };
    }
    setImportar(false);
    if (ultimo) setEdit(ultimo);
    notify?.(`${hojas.length} versión(es) importada(s)`);
  }

  const FILTROS_TXT = { sinAplicar: "Cotizadas sin precio aplicado", sinVincular: "Sin vincular a prototipo ni cápsula", viejas: "Con más de 30 días sin cambios" };
  const pasaFiltro = (c) => {
    if (filtroEstado === "sinAplicar") return !c.precioAplicado;
    if (filtroEstado === "sinVincular") return !c.vinculo && !c.precioAplicado;
    if (filtroEstado === "viejas") return !!c.actualizado && (Date.now() - new Date(c.actualizado).getTime()) / 86400000 > 30;
    return true;
  };
  const filtradas = cotizaciones
    .filter(pasaFiltro)
    .filter((c) => !busqueda || normTxt(`${c.referencia} ${c.nombre} ${c.cliente}`).includes(normTxt(busqueda)) || normRef(c.referencia).includes(normRef(busqueda)))
    .sort((a, b) => String(b.actualizado || "").localeCompare(String(a.actualizado || "")));

  if (edit) {
    return (
      <div style={{ padding: 20, background: C.canvas, minHeight: "100%" }}>
        <CotizacionEditor key={edit.id} inicial={edit} parametros={parametros} clientes={clientesApp} protos={protos} capsulas={capsulas}
          onGuardar={guardar} onVolver={() => setEdit(null)} onEliminar={eliminar} notify={notify}
          onAplicar={(destino, valor) => onAplicarPrecio(destino, valor)} />
      </div>
    );
  }
  return (
    <div style={{ padding: 20, background: C.canvas, minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {onVolver && <button onClick={onVolver} style={btn(C.white, C.slate, C.border)}>← Volver a ATLAS</button>}
        <div style={{ fontWeight: 800, fontSize: 20, color: C.ink, flex: 1 }}>🧮 Módulo de Cotizaciones</div>
        {["inicio", "cotizaciones", "vinilo", "parametros"].map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t !== "cotizaciones") setFiltroEstado(null); }} style={{ ...btn(tab === t ? C.ink : C.white, tab === t ? C.white : C.slate, tab === t ? C.ink : C.border) }}>{t === "inicio" ? "🏠 Inicio" : t === "cotizaciones" ? "Cotizaciones" : t === "vinilo" ? "🎨 Vinilo / DTF" : "⚙ Parámetros por cliente"}</button>
        ))}
      </div>

      {tab === "parametros" && <ParametrosView parametros={parametros} clientesApp={clientesApp} currentUser={currentUser} notify={notify} />}

      {tab === "inicio" && (
        <InicioCotizaciones cotizaciones={cotizaciones} minis={minis} cargado={cargado}
          onIr={(t) => { setFiltroEstado(null); setTab(t); }} onNueva={() => setEdit(cotNueva())}
          onFiltro={(f) => { setFiltroEstado(f); setTab("cotizaciones"); }} onAbrir={(c) => setEdit({ ...limpio(c), existe: true })} />
      )}

      {tab === "vinilo" && <MiniVinilo currentUser={currentUser} notify={notify} onPasar={pasarAlCotizador} />}

      {tab === "cotizaciones" && (
        <div>
          {filtroEstado && (
            <div style={{ marginBottom: 10 }}>
              <span onClick={() => setFiltroEstado(null)} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "5px 12px", borderRadius: 14, background: C.amberBg, color: C.amber, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Filtro: {FILTROS_TXT[filtroEstado]} ✕</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por referencia, nombre o cliente…" style={{ ...inp, maxWidth: 340 }} />
            <div style={{ flex: 1 }} />
            <button onClick={() => setImportar(true)} style={btn(C.white, C.blue, C.blue)}>📥 Importar Excel</button>
            <button disabled={!filtradas.length} onClick={() => descargarExcel(filtradas, `Cotizaciones ${hoyISO()}.xlsx`, null, notify)} style={{ ...btn(C.white, C.blue, C.blue), opacity: filtradas.length ? 1 : 0.4 }}>📤 Descargar Excel ({filtradas.length})</button>
            <button onClick={() => setEdit(cotNueva())} style={btn(C.green, C.white)}>+ Nueva cotización</button>
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr><th style={{ ...th, padding: 12 }}>Referencia</th><th style={th}>Nombre</th><th style={th}>Cliente</th><th style={th}>Versiones</th><th style={{ ...th, textAlign: "right" }}>Precio con IVA (última)</th><th style={th}>Aplicado a</th></tr></thead>
              <tbody>
                {!cargado && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.slate }}>Cargando…</td></tr>}
                {cargado && filtradas.length === 0 && <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: C.slate, fontSize: 13 }}>{cotizaciones.length ? "Ninguna cotización coincide con la búsqueda." : "Aún no hay cotizaciones. Crea una nueva o importa tu Excel (cada hoja = una versión)."}</td></tr>}
                {filtradas.map((c) => {
                  const ult = c.versiones?.[c.versiones.length - 1];
                  const r = ult ? calcularCotizacion(ult.v) : null;
                  return (
                    <tr key={c.id} onClick={() => setEdit({ ...limpio(c), existe: true })} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <td style={{ padding: 12, fontWeight: 800, fontSize: 14 }}>{c.referencia || "—"}</td>
                      <td style={{ ...td, fontSize: 13 }}>{c.nombre || "—"}</td>
                      <td style={{ ...td, fontSize: 13 }}>{c.cliente || "General"}</td>
                      <td style={{ ...td, fontSize: 12, color: C.slate }}>{c.versiones?.length || 0} · V{ult?.numero} {fmtFecha(ult?.fecha)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{r ? fmtCOP(r.precioAplicar) : "—"}</td>
                      <td style={{ ...td, fontSize: 12 }}>
                        {c.precioAplicado ? <span style={{ color: C.green, fontWeight: 700 }}>{fmtCOP(c.precioAplicado.valor)} → {c.precioAplicado.destino}</span> : c.vinculo ? <span style={{ color: C.slate }}>Vinculado: {c.vinculo.label}</span> : <span style={{ color: C.slate }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {importar && <ModalImportar cotizaciones={cotizaciones} parametros={parametros} clientes={clientesApp} onImportar={importarHojas} onClose={() => setImportar(false)} />}
    </div>
  );
}
