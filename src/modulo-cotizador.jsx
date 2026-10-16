import { useState, useEffect, useMemo, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  TASAS_BASE, ETIQUETAS_TASAS, FIJOS_BASE, ETIQUETAS_FIJOS, PROCESOS_BASE, INSUMOS_BASE, insumosSugeridos,
  REGEX_INSUMO_TERMO, num, versionVacia, calcularCotizacion, parsearArchivoCotizacion,
} from "./cotizador-calculo";
import { descargarCotizacionesExcel } from "./cotizador-excel";
import {
  FILAS_VINILO, IMPREVISTOS_PCT, filasViniloVacias, calcularVinilo, aplicarInsumoAFila,
  tituloVinilo, mesLargo, descargarViniloExcel, baseVigente, aplicarBases, normalizarFilas, grupoFila,
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
  ink: "#1A1A2E", slate: "#6B6B88", border: "#E9E3DB", canvas: "#F6F3EF", white: "#FFFFFF", seam: "#C8B8A2", seamDark: "#9E8870", navy: "#1E2142", navy2: "#2A2E58", field: "#FAF8F5",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#7B5EA7", violetBg: "#F3EEF9",
};
// Misma tipografía que el resto de ATLAS (este módulo se abre a pantalla completa, fuera del contenedor que la define).
const FUENTE = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const uid = () => Math.random().toString(36).slice(2, 9);
const hoyISO = () => new Date().toISOString().slice(0, 10);
const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtDec = (n) => (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtPct = (n) => ((Number(n) || 0) * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 }) + "%";
const fmtFecha = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "sin fecha");
const normRef = (v) => String(v || "").trim().toUpperCase().replace(/-/g, "");
const normTxt = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const slug = (v) => normTxt(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid();

const inp = { width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.field, color: C.ink, boxSizing: "border-box", fontFamily: "inherit" };
const th = { textAlign: "left", fontSize: 11, color: C.slate, fontWeight: 700, padding: "6px 6px", textTransform: "uppercase", letterSpacing: 0.4 };
const td = { padding: "4px 4px", verticalAlign: "middle" };
const btn = (bg, color, border) => ({ padding: "8px 14px", background: bg, color, border: `1.5px solid ${border || bg}`, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });

// Ficha de parámetros de un cliente: lo guardado, completado con los valores base.
function fichaCompleta(f) {
  return {
    nombre: f?.nombre || "General",
    tasas: { ...TASAS_BASE, ...(f?.tasas || {}) },
    fijos: { ...FIJOS_BASE, ...(f?.fijos || {}) },
    procesos: Array.isArray(f?.procesos) && f.procesos.length ? f.procesos : PROCESOS_BASE.map((p) => ({ ...p })),
    insumos: Array.isArray(f?.insumos) ? f.insumos : (insumosSugeridos(f?.nombre) || INSUMOS_BASE.map((x) => ({ ...x }))),
  };
}
// Insumos básicos de la ficha, listos para ponerlos en una versión nueva.
// «basico» marca los que vienen de la ficha (al cambiar de cliente se reemplazan).
function insumosDesdeFicha(ficha) {
  return (ficha.insumos || []).filter((x) => String(x.nombre || "").trim()).map((x) => ({
    nombre: x.nombre, precio: x.precio ?? "", consumo: x.consumo ?? 1, termo: !!x.termo, codigo: x.codigo || "", basico: true,
  }));
}
function buscarFicha(parametros, cliente) {
  const n = normTxt(cliente);
  const propia = (parametros || []).find((p) => normTxt(p.nombre) === n);
  if (propia) return fichaCompleta(propia);
  // Cliente sin ficha propia: parámetros de General, pero con los insumos de sus cotizaciones si los hay.
  const ficha = fichaCompleta((parametros || []).find((p) => p.id === "general"));
  const sug = insumosSugeridos(cliente);
  if (sug) { ficha.insumos = sug; ficha.nombre = cliente; }
  return ficha;
}
// Busca un código de Busint en el inventario. Solo rellena si coincide con UN insumo
// (los códigos con espacios o guiones, como «3731 - 3732», quedan como texto libre).
async function buscarInsumoPorCodigo(codigo) {
  const c = String(codigo || "").trim();
  if (!c || !/^[A-Za-z0-9]+$/.test(c)) return { estado: "libre" };
  try {
    const cat = await cargarCatalogoInsumos();
    const hit = cat.filter((x) => String(x.codcomp ?? "").trim() === c);
    if (hit.length === 1) return { estado: "ok", x: hit[0] };
    return { estado: hit.length ? "varios" : "nada" };
  } catch (e) { return { estado: "error", msg: e.message || String(e) }; }
}
function precioBusint(x) { return x.promedio > 0 ? x.promedio : (x.costo > 0 ? x.costo : null); }
// Nueva versión en blanco con los parámetros de la ficha del cliente.
function versionDesdeFicha(ficha) {
  const v = versionVacia();
  v.tasas = { ...ficha.tasas };
  v.fijos = { ...ficha.fijos };
  v.procesos = ficha.procesos.map((p) => ({ nombre: p.nombre, valor: "", imp: !!p.imp }));
  v.insumos = insumosDesdeFicha(ficha);
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
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 14, boxShadow: "0 1px 2px rgba(26,26,46,.04), 0 4px 14px rgba(26,26,46,.03)" }}>
      <div onClick={plegable ? () => setOpen(!open) : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", cursor: plegable ? "pointer" : "default" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>{plegable ? (open ? "▾ " : "▸ ") : ""}{titulo}</div>
          {sub && <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{sub}</div>}
        </div>
        {derecha}
      </div>
      {open && <div style={{ padding: "0 20px 16px" }}>{children}</div>}
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

// Pasa las filas de una hoja de Vinilo / DTF a una versión de cotización: el DTF, corte,
// descartonado, espiga y bajada entran como procesos; alta, poliamida y reflectivo como
// insumos de termofijación. Las filas quedan marcadas «vinilo» (para poder actualizarlas).
function volcarVinilo(v, filas, calc) {
  v.procesos = v.procesos || [];
  v.insumos = v.insumos || [];
  // Una fila que ya no se usa (sin «Usa» o en 0) se quita de la cotización si venía del vinilo
  // (o si quedó en 0); un valor que el usuario puso a mano en una fila sin marca no se toca.
  const quitar = (lista, nombre, valorDe) => {
    const i = lista.findIndex((x) => normTxt(x.nombre) === normTxt(nombre));
    if (i >= 0 && (lista[i].vinilo || !(valorDe(lista[i]) > 0))) lista.splice(i, 1);
  };
  const ponerProceso = (nombre, valor) => {
    const i = v.procesos.findIndex((p) => normTxt(p.nombre) === normTxt(nombre));
    if (i >= 0) v.procesos[i] = { ...v.procesos[i], valor, vinilo: true };
    else v.procesos.push({ nombre, valor, imp: true, vinilo: true });
  };
  const ponerInsumo = (nombre, precio, consumo, codigo) => {
    const i = v.insumos.findIndex((x) => normTxt(x.nombre) === normTxt(nombre));
    const nuevo = { nombre, precio, consumo, termo: true, vinilo: true, ...(codigo ? { codigo } : {}) };
    if (i >= 0) v.insumos[i] = { ...v.insumos[i], ...nuevo };
    else v.insumos.push(nuevo);
  };
  const PROC = { dtf: "Aplique DTF", corte: "Corte vinilo", descartonado: "Descartonado", espiga: "Espiga", bajada: "Bajada de vinilo" };
  // Las bajadas (hasta 5 por prenda) pasan sumadas como un solo proceso.
  const sumaGrupo = {};
  filas.forEach((f, i) => { if (f.usa !== false) sumaGrupo[grupoFila(f)] = (sumaGrupo[grupoFila(f)] || 0) + calc.detalle[i].total; });
  const hechos = new Set();
  filas.forEach((f, i) => {
    const g = grupoFila(f);
    if (PROC[g]) {
      if (hechos.has(g)) return;
      hechos.add(g);
      const suma = Math.round((sumaGrupo[g] || 0) * 100) / 100;
      if (suma > 0) ponerProceso(PROC[g], suma);
      else quitar(v.procesos, PROC[g], (p) => num(p.valor));
    } else if (f.usa !== false && num(f.consumo) > 0) {
      ponerInsumo(f.nombre, num(f.costoMP) + num(f.base) / (num(f.consumo) || 1), num(f.consumo), f.codigo);
    } else quitar(v.insumos, f.nombre, (x) => num(x.precio) * num(x.consumo));
  });
  return v;
}

// ─── APROBACIÓN (2026-10-16) ─────────────────────────────────────────────────
// Cada versión tiene un estado: sin estado/"borrador" -> "aprobacion" (enviada) ->
// "aprobada" o "devuelta". Quien tiene el permiso cotizador_aprobar aprueba y el
// precio con IVA se aplica solo al prototipo / referencia vinculada.
const ultimaVersion = (c) => c.versiones?.[c.versiones.length - 1];
const estadoUltima = (c) => ultimaVersion(c)?.estado || "borrador";
const ICONO_ESTADO = { aprobacion: "⏳", aprobada: "✔", devuelta: "↩" };

// Cliente de una cápsula: el suyo o, si no tiene, el de alguna de sus referencias (igual que en ATLAS).
const clienteCapsula = (cap) => cap.cliente || (cap.referencias || []).map((r) => r.cliente || r.colores?.[0]).find(Boolean) || "";
// Referencia a mostrar de un prototipo / referencia de cápsula: su REF o, si aún no la tiene, su # Prototipo.
// Un REF que solo es un guion o «s/ref» (relleno, no una referencia real) cuenta como vacío.
const refReal = (t) => { const v = String(t ?? "").trim(); return /^[\s\-–—_.]*$/.test(v) || /^(s\/ref|sin ref|n\/a|na)$/i.test(v) ? "" : v; };
const textoRef = (x) => refReal(x?.reference) || refReal(x?.numPrototipo);
// Etiqueta del vínculo tomada en vivo del prototipo / cápsula (así los vínculos viejos con "-" también se corrigen).
function etiquetaVinculo(v, protos, capsulas) {
  if (!v) return "";
  if (v.kind === "proto") {
    const p = (protos || []).find((x) => x.id === v.id);
    return p ? `${textoRef(p) || "s/ref"} · ${p.name || ""}`.trim() : v.label;
  }
  const cap = (capsulas || []).find((c) => c.id === v.capsulaId);
  const r = cap?.referencias?.find((x) => x.id === v.id);
  return r ? `${textoRef(r) || "s/ref"} · ${r.name || ""} — ${cap.name}` : v.label;
}

// ─── EDITOR DE UNA COTIZACIÓN ────────────────────────────────────────────────
function CotizacionEditor({ inicial, minis, parametros, clientes, protos, capsulas, cotizaciones, onGuardar, onVolver, onEliminar, onAplicar, onSucio, puedeBorrar, puedeAprobar, usuario, notify }) {
  const [cot, setCot] = useState(inicial);
  const [sucio, setSucio] = useState(false);
  useEffect(() => { onSucio?.(sucio); }, [sucio]); // eslint-disable-line
  const [vincular, setVincular] = useState(false); // false | "solo" (vincular) | "aprobar" (aprobar y aplicar)
  const [devolviendo, setDevolviendo] = useState(false);
  const [comentario, setComentario] = useState("");
  const [telaBusint, setTelaBusint] = useState(null); // índice de la fila de tela que busca precio
  const [insBusint, setInsBusint] = useState(null); // índice de la fila de insumo que busca precio en Busint
  const codOrig = useRef("");
  const [viniloGrande, setViniloGrande] = useState(() => { try { return localStorage.getItem("cotizador_vinilo_grande") === "1"; } catch (e) { return false; } }); // ventana de Vinilo / DTF en pantalla casi completa
  const alternarViniloGrande = () => setViniloGrande((g) => { try { localStorage.setItem("cotizador_vinilo_grande", g ? "0" : "1"); } catch (e) { /* sin almacenamiento */ } return !g; });
  const [viniloModal, setViniloModal] = useState(null); // {id} = hoja de Vinilo / DTF abierta sobre esta cotización
  const ver = cot.versiones[cot.activa];
  const calc = useMemo(() => calcularCotizacion(ver.v), [ver.v]);
  const estadoV = ver.estado || "borrador";
  const bloqueada = (estadoV === "aprobacion" && !puedeAprobar) || estadoV === "aprobada"; // quien envía no edita mientras espera; el aprobador sí; una aprobada se cambia con versión nueva

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
        // Insumos básicos del nuevo cliente (los que agregó a mano se conservan).
        v.insumos = [...insumosDesdeFicha(f), ...(v.insumos || []).filter((x) => !x.basico)];
      }
    });
  }
  function cargarFicha() {
    const f = buscarFicha(parametros, cot.cliente);
    setV((v) => {
      v.tasas = { ...f.tasas };
      v.fijos = { ...f.fijos };
      // Suma los insumos del cliente que esta versión no tenga (no pisa los que ya están).
      v.insumos = v.insumos || [];
      insumosDesdeFicha(f).forEach((x) => { if (!v.insumos.some((y) => normTxt(y.nombre) === normTxt(x.nombre))) v.insumos.push(x); });
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
    let a = cot;
    // Si el aprobador corrigió una versión que espera aprobación, el precio enviado se actualiza.
    if (estadoV === "aprobacion" && puedeAprobar && ver.precio !== calc.precioAplicar) {
      a = limpio(cot);
      a.versiones[a.activa].precio = calc.precioAplicar;
      a.historial = [...(a.historial || []), { fecha: new Date().toISOString(), quien: usuario || "—", v: ver.numero, txt: `ajustó la V${ver.numero} en aprobación (${fmtCOP(calc.precioAplicar)} con IVA)` }];
      setCot(a);
    }
    await onGuardar(a);
    setSucio(false);
    notify?.("Cotización guardada");
  }
  // Al escribir un código de Busint en un insumo: si coincide con uno solo, trae su precio (y el nombre si está vacío).
  async function autollenarCodigo(i) {
    const cod = insumos[i]?.codigo;
    if (String(cod || "").trim() === codOrig.current) return;
    const r = await buscarInsumoPorCodigo(cod);
    if (r.estado === "ok") {
      const p = precioBusint(r.x);
      setV((v) => { const it = v.insumos[i]; if (!it) return; if (p != null) it.precio = p; if (!String(it.nombre || "").trim()) it.nombre = r.x.componente; });
      notify?.(`Cód. ${String(cod).trim()}: ${r.x.componente}${p != null ? ` · promedio ${fmtCOP(p)}` : " · sin precio en Busint"}`);
    } else if (r.estado === "nada") notify?.(`El código ${String(cod).trim()} no está en el inventario de Busint; queda como lo escribiste.`);
    else if (r.estado === "varios") notify?.(`El código ${String(cod).trim()} coincide con varios insumos de Busint; usa la lupa para elegir.`);
    else if (r.estado === "error") notify?.("No se pudo consultar Busint: " + r.msg);
  }

  // ── Vinilo / DTF dentro de la cotización ──
  const miniLink = ver.v.vinilo ? (minis || []).find((m) => m.id === ver.v.vinilo.miniId) : null;
  const miniCambio = !!miniLink && !!miniLink.actualizado && miniLink.actualizado !== ver.v.vinilo.actualizado;
  const miniSugerida = !ver.v.vinilo && normRef(cot.referencia)
    ? (minis || []).filter((m) => normRef(m.ref) === normRef(cot.referencia)).sort((a, b) => String(b.mes).localeCompare(String(a.mes)))[0] || null
    : null;
  function usarVinilo(ref, filas, c, mes, stamp) {
    setV((v) => { volcarVinilo(v, filas, c); v.vinilo = { miniId: `${normRef(ref)}_${mes}`, ref: String(ref).trim(), mes, total: Math.round(c.total * 100) / 100, actualizado: stamp }; });
    setViniloModal(null);
    notify?.(`Vinilo / DTF de ${String(ref).trim()} agregado a la V${ver.numero}`);
  }
  function traerMini(m) {
    usarVinilo(m.ref, m.filas, calcularVinilo(m.filas, m.pct ?? IMPREVISTOS_PCT), m.mes, m.actualizado);
  }
  function actualizarVinilo() {
    const m = miniLink;
    if (!m) return;
    setV((v) => { const c = calcularVinilo(m.filas, m.pct ?? IMPREVISTOS_PCT); volcarVinilo(v, m.filas, c); v.vinilo = { ...v.vinilo, total: Math.round(c.total * 100) / 100, actualizado: m.actualizado }; });
    notify?.("Filas de Vinilo / DTF actualizadas con la hoja");
  }

  // Al elegir el prototipo / referencia de cápsula se llenan la referencia y el nombre de la cotización
  // (el nombre solo si está vacío; la referencia pide confirmar si ya tenía otra distinta).
  // Cliente del prototipo / cápsula vinculado: si la cotización está en «General» o sin cliente lo toma
  // solo; si ya tiene otro, pregunta. Devuelve el cliente nuevo o null (llamar fuera de mutar).
  function decidirCliente(dest) {
    const nuevo = String(dest?.cliente || "").trim();
    const actual = String(cot.cliente || "").trim();
    if (!nuevo || normTxt(nuevo) === normTxt(actual)) return null;
    if (actual && normTxt(actual) !== "general" && !window.confirm(`El destino es del cliente «${nuevo}» y la cotización dice «${actual}». ¿Cambiar el cliente a ${nuevo}?`)) return null;
    return nuevo;
  }
  // Pone el cliente nuevo; en una cotización sin guardar también carga sus parámetros (igual que al escogerlo a mano).
  function ponerCliente(n, nuevo) {
    if (!nuevo) return;
    n.cliente = nuevo;
    if (!inicial.existe) {
      const f = buscarFicha(parametros, nuevo);
      const v = n.versiones[n.activa].v;
      v.tasas = { ...f.tasas };
      v.fijos = { ...f.fijos };
      v.insumos = [...insumosDesdeFicha(f), ...(v.insumos || []).filter((x) => !x.basico)];
    }
  }
  function camposDeDestino(dest) {
    const out = {};
    const ref = String(dest.reference || "").trim();
    const actual = String(cot.referencia || "").trim();
    if (ref && normRef(actual) !== normRef(ref)) {
      if (!actual || window.confirm(`La cotización tiene la referencia «${actual}» y el destino es «${ref}». ¿Cambiar la referencia a ${ref}?`)) out.referencia = ref;
    }
    if (!String(cot.nombre || "").trim() && dest.nombre) out.nombre = dest.nombre;
    return out;
  }

  // ── Flujo de aprobación ──
  function conEvento(n, txt) {
    n.historial = [...(n.historial || []), { fecha: new Date().toISOString(), quien: usuario || "—", v: n.versiones[n.activa].numero, txt }];
  }
  async function persistir(n, msg) {
    await onGuardar(n);
    setCot(n);
    setSucio(false);
    if (msg) notify?.(msg);
  }
  async function enviarAprobacion() {
    if (!String(cot.referencia).trim()) { notify?.("Escribe la referencia antes de enviar a aprobación"); return; }
    const valor = calc.precioAplicar;
    if (!(valor > 0)) { notify?.("El precio es 0 — completa los costos primero"); return; }
    const n = limpio(cot);
    const vv = n.versiones[n.activa];
    vv.estado = "aprobacion"; vv.envio = { por: usuario || "", fecha: new Date().toISOString() }; vv.precio = valor; delete vv.decision;
    conEvento(n, `envió la V${vv.numero} a aprobación (${fmtCOP(valor)} con IVA)`);
    await persistir(n, `V${vv.numero} enviada a aprobación`);
  }
  async function retirarEnvio() {
    const n = limpio(cot);
    const vv = n.versiones[n.activa];
    vv.estado = "borrador"; delete vv.envio;
    conEvento(n, `retiró la V${vv.numero} de aprobación`);
    await persistir(n, `V${vv.numero} retirada de aprobación`);
  }
  // Aprueba la versión activa y, si hay destino, aplica el precio con IVA a ese prototipo / referencia.
  async function aprobarYAplicar(destino) {
    const valor = calc.precioAplicar;
    if (!(valor > 0)) { notify?.("El precio es 0 — completa los costos primero"); return; }
    const mismoDestino = destino && cot.vinculo && cot.vinculo.id === destino.id && cot.vinculo.kind === destino.kind;
    const campos = destino && !mismoDestino ? camposDeDestino(destino) : {};
    const clienteNuevo = destino && !mismoDestino ? decidirCliente(destino) : null;
    const n = { ...limpio(cot), ...campos };
    ponerCliente(n, clienteNuevo);
    const vv = n.versiones[n.activa];
    vv.estado = "aprobada"; vv.decision = { por: usuario || "", fecha: new Date().toISOString(), comentario: "" }; vv.precio = valor;
    if (destino) {
      n.vinculo = destino;
      n.precioAplicado = { valor, fecha: hoyISO(), version: vv.numero, destino: destino.label };
    }
    conEvento(n, destino ? `aprobó la V${vv.numero} y aplicó ${fmtCOP(valor)} a ${destino.label}` : `aprobó la V${vv.numero} (${fmtCOP(valor)}, sin destino para aplicar)`);
    await onGuardar(n);
    if (destino) await onAplicar(destino, valor);
    setCot(n);
    setSucio(false);
    setVincular(false);
    notify?.(destino ? `${fmtCOP(valor)} (con IVA) aprobado y aplicado a ${destino.label}` : `V${vv.numero} aprobada`);
  }
  function pedirAprobar(destino) {
    const txt = destino ? `¿Aprobar la V${ver.numero} y aplicar ${fmtCOP(calc.precioAplicar)} (con IVA) a ${destino.label}?` : `¿Aprobar la V${ver.numero} sin aplicar el precio a ningún prototipo?`;
    const aviso = !(calc.telasTotal > 0) ? "\n\nOjo: esta versión no tiene costo de telas cargado." : "";
    if (window.confirm(txt + aviso)) aprobarYAplicar(destino);
  }
  // Quien aprueba puede reabrir una versión aprobada (p. ej. si se aprobó sin querer). El precio ya
  // aplicado al prototipo no se revierte solo: se reemplaza al volver a aprobar.
  async function reabrir() {
    const ap = cot.precioAplicado && cot.precioAplicado.version === ver.numero;
    if (!window.confirm(`¿Reabrir la V${ver.numero} para seguir editándola?${ap ? `\n\nEl precio ${fmtCOP(cot.precioAplicado.valor)} ya aplicado a ${cot.precioAplicado.destino} no se revierte solo: se reemplaza cuando la vuelvas a aprobar.` : ""}`)) return;
    const n = limpio(cot);
    const vv = n.versiones[n.activa];
    vv.estado = "borrador"; delete vv.decision; delete vv.envio;
    conEvento(n, `reabrió la V${vv.numero}`);
    await persistir(n, `V${vv.numero} reabierta`);
  }
  async function devolver() {
    if (!comentario.trim()) { notify?.("Escribe qué debe corregir quien la envió"); return; }
    const n = limpio(cot);
    const vv = n.versiones[n.activa];
    vv.estado = "devuelta"; vv.decision = { por: usuario || "", fecha: new Date().toISOString(), comentario: comentario.trim() };
    conEvento(n, `devolvió la V${vv.numero}: «${comentario.trim()}»`);
    await persistir(n, `V${vv.numero} devuelta`);
    setDevolviendo(false); setComentario("");
  }

  // Filas de telas / insumos / procesos
  const telas = ver.v.telas;
  const insumos = ver.v.insumos;
  const procesos = ver.v.procesos;
  const celdaNum = (valor, onChange, ancho) => (
    <input type="text" inputMode="decimal" value={valor ?? ""} onChange={(e) => onChange(e.target.value)} style={{ ...inp, width: ancho || 90, textAlign: "right" }} />
  );
  const tasasEdit = Object.keys(ETIQUETAS_TASAS);
  const vinculoActual = cot.vinculo ? { ...cot.vinculo, label: etiquetaVinculo(cot.vinculo, protos, capsulas) } : null;
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
        <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: -0.4, color: C.ink }}>{cot.referencia || "Nueva cotización"} {cot.nombre ? <span style={{ color: C.slate, fontWeight: 600, fontSize: 16 }}>· {cot.nombre}</span> : null}</div>
        {cot.precioAplicado && <Pastilla bg={C.greenBg} color={C.green}>Aplicado a {cot.precioAplicado.destino}</Pastilla>}
        {sucio && <Pastilla bg={C.amberBg} color={C.amber}>Cambios sin guardar</Pastilla>}
        <div style={{ flex: 1 }} />
        {cot.id && inicial.existe && puedeBorrar && <button onClick={() => onEliminar(cot)} style={btn(C.white, C.red, C.red)}>Eliminar</button>}
        <button onClick={() => setViniloModal({ id: ver.v.vinilo?.miniId || null })} disabled={bloqueada} title="Abre la hoja de Vinilo / DTF de esta referencia y pasa sus valores a esta versión" style={{ ...btn(C.white, C.amber, C.amber), opacity: bloqueada ? 0.5 : 1 }}>🎨 Vinilo / DTF</button>
        <button onClick={() => descargarExcel([cot], `Cotizacion ${String(cot.referencia || "nueva").replace(/[\\/:*?"<>|]/g, "-")}.xlsx`, imagenVinculada(), notify)} style={btn(C.white, C.blue, C.blue)}>📥 Descargar Excel</button>
        <button onClick={guardar} style={btn(C.green, C.white)}>💾 Guardar versión</button>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 18px", marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, boxShadow: "0 1px 2px rgba(26,26,46,.04), 0 4px 14px rgba(26,26,46,.03)" }}>
        <Campo label="Referencia"><input value={cot.referencia} onChange={(e) => setCab("referencia", e.target.value)} style={inp} placeholder="975093" /></Campo>
        <Campo label="Nombre / descripción"><input value={cot.nombre} onChange={(e) => setCab("nombre", e.target.value)} style={inp} placeholder="Camiseta ..." /></Campo>
        <Campo label="Cliente">
          <select value={cot.cliente || "General"} onChange={(e) => cambiarCliente(e.target.value)} style={inp}>
            {(clientes.includes(cot.cliente) || !cot.cliente ? clientes : [cot.cliente, ...clientes]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Prototipo / cápsula vinculado">
          <button onClick={() => setVincular("solo")} style={{ ...inp, textAlign: "left", cursor: "pointer", color: vinculoActual ? C.ink : C.slate }}>
            {vinculoActual ? `${vinculoActual.kind === "proto" ? "⬡" : "⬢"} ${vinculoActual.label}` : "Elegir… (para aplicar el precio)"}
          </button>
        </Campo>
      </div>

      {estadoV === "aprobacion" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.amberBg, border: "1.5px solid #F0CF95", borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>⏳</span>
          <div style={{ flex: 1, fontSize: 13 }}>
            <b style={{ color: C.amber }}>{puedeAprobar ? "Esta versión espera tu aprobación." : "Esta versión espera aprobación."}</b>{" "}
            Enviada por {ver.envio?.por || "—"}{ver.envio?.fecha ? ` el ${fmtFecha(ver.envio.fecha.slice(0, 10))}` : ""}.{" "}
            {puedeAprobar ? (vinculoActual ? <>Al aprobarla, <b>{fmtCOP(calc.precioAplicar)}</b> pasa solo como precio de <b>{vinculoActual.label}</b>.</> : "No tiene prototipo ni cápsula vinculado: puedes elegirlo al aprobar.") : "No se puede editar hasta que la aprueben o la devuelvan."}
            {puedeAprobar && " Como aprobador puedes corregirla aquí mismo; al guardar se actualiza el precio enviado."}
          </div>
          {!sucio && <button onClick={retirarEnvio} style={btn(C.white, C.amber, C.amber)}>Retirar de aprobación</button>}
        </div>
      )}
      {estadoV === "aprobada" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.greenBg, border: "1.5px solid #B9E3CF", borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>✔</span>
          <div style={{ flex: 1, fontSize: 13 }}>
            <b style={{ color: C.green }}>Versión aprobada</b>{ver.decision?.por ? ` por ${ver.decision.por}` : ""}{ver.decision?.fecha ? ` el ${fmtFecha(ver.decision.fecha.slice(0, 10))}` : ""}.
            {cot.precioAplicado && cot.precioAplicado.version === ver.numero ? ` ${fmtCOP(cot.precioAplicado.valor)} aplicado a ${cot.precioAplicado.destino}.` : ""} Para cambiar algo, crea una versión nueva (volverá a pasar por aprobación).
          </div>
          {puedeAprobar && <button onClick={reabrir} style={btn(C.white, C.amber, C.amber)}>Reabrir esta versión</button>}
          <button onClick={nuevaVersion} style={btn(C.white, C.green, C.green)}>+ Crear versión nueva para editar</button>
        </div>
      )}
      {estadoV === "devuelta" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.redBg, border: "1.5px solid #F3B9B1", borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>↩</span>
          <div style={{ flex: 1, fontSize: 13 }}>
            <b style={{ color: C.red }}>Devuelta{ver.decision?.por ? ` por ${ver.decision.por}` : ""}.</b> {ver.decision?.comentario ? `«${ver.decision.comentario}»` : ""} Corrige y vuelve a enviarla a aprobación.
          </div>
        </div>
      )}

      {ver.v.vinilo && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.blueBg, border: `1.5px solid ${miniCambio ? "#F0CF95" : "#C9D9EA"}`, borderRadius: 14, padding: "10px 16px", marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>🎨</span>
          <div style={{ flex: 1, fontSize: 13, minWidth: 240 }}>
            <b style={{ color: C.blue }}>Vinilo / DTF</b> desde la hoja de {ver.v.vinilo.ref} ({mesLargo(ver.v.vinilo.mes)}) · {fmtCOP(ver.v.vinilo.total)}
            {miniCambio && <> · <b style={{ color: C.amber }}>La hoja cambió{miniLink.actualizadoPor ? ` (${miniLink.actualizadoPor}, ${fmtFecha(String(miniLink.actualizado).slice(0, 10))})` : ""}.</b></>}
            {!miniLink && <span style={{ color: C.slate }}> · la hoja ya no existe</span>}
          </div>
          {miniCambio && !bloqueada && <button onClick={actualizarVinilo} style={btn(C.amber, C.white)}>↻ Actualizar filas</button>}
          {miniCambio && bloqueada && <span style={{ fontSize: 12, color: C.slate }}>Crea una versión nueva para actualizar.</span>}
          {miniLink && !bloqueada && <button onClick={() => setViniloModal({ id: ver.v.vinilo.miniId })} style={btn(C.white, C.blue, C.blue)}>Abrir hoja</button>}
        </div>
      )}
      {miniSugerida && !bloqueada && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.amberBg, border: "1.5px solid #F0CF95", borderRadius: 14, padding: "10px 16px", marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>🎨</span>
          <div style={{ flex: 1, fontSize: 13, minWidth: 240 }}>Hay una hoja de <b>Vinilo / DTF</b> guardada para la referencia {cot.referencia} ({mesLargo(miniSugerida.mes)}) por {fmtCOP(miniSugerida.total)}.</div>
          <button onClick={() => traerMini(miniSugerida)} style={btn(C.amber, C.white)}>Traerla a esta versión</button>
        </div>
      )}

      {/* Pestañas de versión */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {cot.versiones.map((vv, i) => (
          <button key={vv.id} onClick={() => mutar((n) => { n.activa = i; })}
            style={{ padding: "7px 14px", borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", border: `1.5px solid ${i === cot.activa ? C.navy : C.border}`, background: i === cot.activa ? C.navy : C.white, color: i === cot.activa ? C.white : C.slate }}>
            V{vv.numero} <span style={{ fontWeight: 500, opacity: 0.8 }}>· {fmtFecha(vv.fecha)}</span>{ICONO_ESTADO[vv.estado] ? ` ${ICONO_ESTADO[vv.estado]}` : ""}
          </button>
        ))}
        <button onClick={nuevaVersion} style={btn(C.blueBg, C.blue, C.blue)}>+ Nueva versión</button>
        {cot.versiones.length > 1 && <button onClick={borrarVersion} disabled={bloqueada} style={{ ...btn(C.white, C.slate, C.border), fontWeight: 500 }}>Borrar V{ver.numero}</button>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <input type="date" disabled={bloqueada} value={ver.fecha || ""} onChange={(e) => mutar((n) => { n.versiones[n.activa].fecha = e.target.value; })} style={{ ...inp, width: 150 }} />
          <input disabled={bloqueada} value={ver.nota || ""} onChange={(e) => mutar((n) => { n.versiones[n.activa].nota = e.target.value; })} placeholder="Nota de la versión (qué cambió)" style={{ ...inp, width: 260 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }} className="cotizador-grid">
        <fieldset disabled={bloqueada} style={{ minWidth: 0, border: 0, margin: 0, padding: 0 }}>
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
            {insBusint !== null && insumos[insBusint] && (
              <ModalInsumoBusint inicial={insumos[insBusint].nombre} titulo={insumos[insBusint].nombre || "insumo"} onClose={() => setInsBusint(null)}
                onElegir={(x) => { const i = insBusint; setInsBusint(null); setV((v) => { const it = v.insumos[i]; if (!it) return; it.precio = x.promedio > 0 ? x.promedio : (x.costo > 0 ? x.costo : it.precio); it.codigo = x.codcomp || ""; if (!String(it.nombre || "").trim()) it.nombre = x.componente; }); }} />
            )}
            {insumos.length === 0 && <div style={{ fontSize: 13, color: C.slate, padding: "6px 0" }}>Sin insumos todavía.</div>}
            {insumos.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 660 }}>
                  <thead><tr><th style={th}>Insumo</th><th style={th}>Cód.</th><th style={th}>Precio</th><th style={th}>Consumo</th><th style={th}>Imprevistos</th><th style={{ ...th, textAlign: "right" }}>$ prenda</th><th /></tr></thead>
                  <tbody>
                    {insumos.map((it, i) => (
                      <tr key={i}>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <button title="Traer precio promedio y código desde el inventario de Busint" onClick={() => setInsBusint(i)} style={{ border: `1px solid ${C.border}`, background: C.field, borderRadius: 8, cursor: "pointer", padding: "6px 8px" }}>🔎</button>
                            <input value={it.nombre} onChange={(e) => setV((v) => { v.insumos[i].nombre = e.target.value; if (!v.insumos[i].termoManual) v.insumos[i].termo = REGEX_INSUMO_TERMO.test(e.target.value); })} style={{ ...inp, minWidth: 170 }} placeholder="Hilo, etiqueta, vinilo…" />
                            {it.vinilo && <Pastilla bg={C.amberBg} color={C.amber}>Vinilo</Pastilla>}
                          </div>
                        </td>
                        <td style={td}><input value={it.codigo || ""} onFocus={() => { codOrig.current = String(it.codigo || "").trim(); }} onBlur={() => autollenarCodigo(i)} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} onChange={(e) => setV((v) => { v.insumos[i].codigo = e.target.value; })} style={{ ...inp, width: 96 }} placeholder="Código" /></td>
                        <td style={td}>{celdaNum(it.precio, (x) => setV((v) => { v.insumos[i].precio = x; }))}</td>
                        <td style={td}>{celdaNum(it.consumo, (x) => setV((v) => { v.insumos[i].consumo = x; }), 70)}</td>
                        <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!it.termo} onChange={(e) => setV((v) => { v.insumos[i].termo = e.target.checked; v.insumos[i].termoManual = true; })} /></td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, fontSize: 13 }}>{fmtDec(calc.insumos[i]?.porPrenda)}</td>
                        <td style={td}><button onClick={() => setV((v) => { v.insumos.splice(i, 1); })} style={{ border: "none", background: "none", cursor: "pointer", color: C.red, fontSize: 16 }}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={5} style={{ ...td, textAlign: "right", fontWeight: 700, color: C.slate }}>Total insumos</td><td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{fmtDec(calc.insumosTotal)}</td><td /></tr></tfoot>
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
                      <td style={td}><div style={{ display: "flex", gap: 6, alignItems: "center" }}><input value={p.nombre} onChange={(e) => setV((v) => { v.procesos[i].nombre = e.target.value; })} style={{ ...inp, minWidth: 190 }} />{p.vinilo && <Pastilla bg={C.amberBg} color={C.amber}>Vinilo</Pastilla>}</div></td>
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

          {(cot.historial || []).length > 0 && (
            <Seccion plegable abierta={false} titulo="Historial de aprobación" sub={`${cot.historial.length} movimiento(s)`}>
              <div style={{ borderLeft: `2px solid ${C.border}`, marginLeft: 6, paddingLeft: 16 }}>
                {[...cot.historial].reverse().map((h, i) => (
                  <div key={i} style={{ padding: "5px 0", fontSize: 13 }}>
                    <b>{h.quien}</b> {h.txt} <span style={{ color: C.slate, fontSize: 11 }}>· {fmtFecha(String(h.fecha).slice(0, 10))} {String(h.fecha).slice(11, 16)}</span>
                  </div>
                ))}
              </div>
            </Seccion>
          )}
        </fieldset>

        {/* PANEL DE RESULTADOS */}
        <div style={{ position: "sticky", top: 12 }}>
          <div style={{ background: C.navy, color: C.white, borderRadius: 18, padding: 22, marginBottom: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, opacity: 0.7, fontWeight: 700 }}>PRECIO DE VENTA · V{ver.numero}</div>
            <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.5, marginTop: 6 }}>{fmtCOP(calc.escMargen.precioConIva)}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>con IVA {fmtPct(ver.v.tasas.iva)} · sin IVA {fmtCOP(calc.escMargen.precioSinIva)}</div>
            {(() => {
              const total = calc.escMargen.precioSinIva;
              if (!(total > 0)) return null;
              const partes = [["Telas", calc.telasTotal, "#C8B8A2"], ["Insumos", calc.insumosTotal, "#9E8870"], ["Procesos", calc.procesosTotal, "#6F6A8E"]];
              const resto = Math.max(0, total - partes.reduce((a, x) => a + x[1], 0));
              const todas = [...partes, ["Impuestos, fijos y utilidad", resto, "#E8E1D4"]];
              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", height: 9, borderRadius: 6, overflow: "hidden", gap: 2 }}>
                    {todas.map(([et, val, col]) => <span key={et} style={{ width: `${Math.max(0, (val / total) * 100)}%`, background: col }} />)}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, opacity: 0.85, marginTop: 8 }}>
                    {todas.map(([et, val, col]) => <span key={et}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: col, marginRight: 5 }} />{et} {Math.round((val / total) * 100)}%</span>)}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Margen esperado</div>
              <input type="text" inputMode="decimal" disabled={bloqueada} value={ver.v.margen ?? ""} onChange={(e) => setV((v) => { v.margen = e.target.value; })} style={{ ...inp, width: 70, textAlign: "right" }} />
              <div style={{ fontSize: 11, opacity: 0.6 }}>0,05 = 5%</div>
            </div>
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>Utilidad por prenda: <b>{fmtCOP(calc.escMargen.utilidad)}</b></div>
            {ver.excelPrecio != null && (
              <div style={{ fontSize: 11, marginTop: 8, padding: "6px 8px", borderRadius: 6, background: Math.abs(ver.excelPrecio - calc.escMargen.precioSinIva) < 1 ? "rgba(45,158,107,.25)" : "rgba(232,93,74,.3)" }}>
                Excel (sin IVA): {fmtCOP(ver.excelPrecio)} {Math.abs(ver.excelPrecio - calc.escMargen.precioSinIva) < 1 ? "✓ coincide" : "≠ difiere"}
              </div>
            )}
            {puedeAprobar ? (
              estadoV === "aprobada" ? (
                <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(45,158,107,.25)", fontSize: 13, fontWeight: 700 }}>✔ Versión aprobada</div>
              ) : (
                <>
                  <button onClick={() => (vinculoActual ? pedirAprobar(vinculoActual) : setVincular("aprobar"))}
                    style={{ ...btn(C.seam, C.ink), width: "100%", marginTop: 16, padding: "12px 14px" }}>
                    {vinculoActual ? `✔ Aprobar y aplicar ${fmtCOP(calc.precioAplicar)} a ${vinculoActual.label.length > 24 ? vinculoActual.label.slice(0, 24) + "…" : vinculoActual.label}` : `✔ Aprobar y aplicar ${fmtCOP(calc.precioAplicar)} a un prototipo / cápsula`}
                  </button>
                  {!vinculoActual && <button onClick={() => pedirAprobar(null)} style={{ ...btn("transparent", C.white, "rgba(255,255,255,.3)"), width: "100%", marginTop: 8, fontWeight: 500, fontSize: 12 }}>Aprobar sin aplicar el precio</button>}
                  {estadoV === "aprobacion" && <button onClick={() => setDevolviendo(true)} style={{ ...btn("transparent", "#E4E1F5", "#6a6a90"), width: "100%", marginTop: 8 }}>↩ Devolver con comentario</button>}
                  {vinculoActual && <button onClick={() => setVincular("solo")} style={{ ...btn("transparent", C.white, "rgba(255,255,255,.3)"), width: "100%", marginTop: 8, fontWeight: 500, fontSize: 12 }}>Cambiar destino</button>}
                </>
              )
            ) : (
              estadoV === "aprobada" ? (
                <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(45,158,107,.25)", fontSize: 13, fontWeight: 700 }}>✔ Versión aprobada</div>
              ) : estadoV === "aprobacion" ? (
                <>
                  <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(242,184,75,.22)", fontSize: 13, fontWeight: 700 }}>⏳ Esperando aprobación</div>
                  <button onClick={retirarEnvio} style={{ ...btn("transparent", C.white, "rgba(255,255,255,.3)"), width: "100%", marginTop: 8, fontWeight: 500, fontSize: 12 }}>Retirar de aprobación</button>
                </>
              ) : (
                <>
                  <button onClick={enviarAprobacion} style={{ ...btn(C.seam, C.ink), width: "100%", marginTop: 16, padding: "12px 14px" }}>
                    {estadoV === "devuelta" ? "Corregir y volver a enviar a aprobación" : "Enviar a aprobación"}
                  </button>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>El precio se aplica al prototipo / cápsula cuando lo apruebe quien tiene el permiso.</div>
                  {vinculoActual && <button onClick={() => setVincular("solo")} style={{ ...btn("transparent", C.white, "rgba(255,255,255,.3)"), width: "100%", marginTop: 8, fontWeight: 500, fontSize: 12 }}>Cambiar destino</button>}
                </>
              )
            )}
            {cot.precioAplicado && (
              <div style={{ fontSize: 11, marginTop: 10, opacity: 0.75 }}>Último aplicado: {fmtCOP(cot.precioAplicado.valor)} (V{cot.precioAplicado.version}) a {cot.precioAplicado.destino} el {fmtFecha(cot.precioAplicado.fecha)}</div>
            )}
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", fontSize: 13 }}>
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

          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginTop: 14, fontSize: 13 }}>
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
        <ModalVincular cot={cot} protos={protos} capsulas={capsulas} cotizaciones={cotizaciones} precio={calc.precioAplicar} onClose={() => setVincular(false)}
          onElegir={puedeAprobar && vincular === "aprobar" ? (dest) => pedirAprobar(dest) : undefined}
          onSoloVincular={(dest) => { const campos = camposDeDestino(dest); const clienteNuevo = decidirCliente(dest); mutar((n) => { n.vinculo = dest; Object.assign(n, campos); ponerCliente(n, clienteNuevo); }); setVincular(false); }} />
      )}
      {viniloModal && (
        <div onClick={() => setViniloModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 900, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: viniloGrande ? 8 : 16, overflowY: viniloGrande ? "hidden" : "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.canvas, borderRadius: 16, width: viniloGrande ? "100%" : "min(1100px, 100%)", ...(viniloGrande ? { height: "100%", overflowY: "auto" } : {}), padding: 16, fontFamily: FUENTE }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, position: "sticky", top: -16, zIndex: 5, background: C.canvas, padding: "6px 0" }}>
              <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>Vinilo / DTF para {cot.referencia || "esta cotización"} · V{ver.numero}</div>
              <button onClick={alternarViniloGrande} title={viniloGrande ? "Volver al tamaño normal" : "Ocupar casi toda la pantalla"} style={btn(C.white, C.blue, C.blue)}>{viniloGrande ? "⤡ Reducir" : "⤢ Agrandar"}</button>
              <button onClick={() => setViniloModal(null)} style={btn(C.white, C.slate, C.border)}>Cerrar</button>
            </div>
            <MiniVinilo currentUser={{ name: usuario }} notify={notify} refInicial={cot.referencia} inicialId={viniloModal.id} etiquetaPasar="✔ Usar en esta cotización" onPasar={usarVinilo} puedeBorrar={puedeBorrar} />
          </div>
        </div>
      )}
      {devolviendo && (
        <div onClick={() => setDevolviendo(false)} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(480px, 100%)", padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Devolver la V{ver.numero}</div>
            <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>Escribe qué debe corregir quien la envió. La versión queda editable otra vez.</div>
            <textarea autoFocus rows={4} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej.: Revisa el consumo del cordón, parece alto." style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setDevolviendo(false)} style={btn(C.white, C.slate, C.border)}>Cancelar</button>
              <button onClick={devolver} style={btn(C.red, C.white)}>↩ Devolver</button>
            </div>
          </div>
        </div>
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
function ModalVincular({ cot, protos, capsulas, cotizaciones, precio, onElegir, onSoloVincular, onClose }) {
  const [q, setQ] = useState("");
  const [soloSin, setSoloSin] = useState(true);
  const opciones = useMemo(() => {
    const lista = [];
    (protos || []).filter((p) => !p.eliminado).forEach((p) => lista.push({ kind: "proto", id: p.id, nombre: p.name || "", label: `${textoRef(p) || "s/ref"} · ${p.name || ""}`.trim(), reference: textoRef(p), cliente: p.cliente || p.colores?.[0] || "", precioActual: p.precioCotizacion }));
    (capsulas || []).filter((c) => !c.eliminado).forEach((cap) => (cap.referencias || []).forEach((r) => lista.push({ kind: "ref", id: r.id, nombre: r.name || "", capsulaId: cap.id, label: `${textoRef(r) || "s/ref"} · ${r.name || ""} — ${cap.name}`, reference: textoRef(r), cliente: clienteCapsula(cap), precioActual: r.precioCotizacion })));
    return lista;
  }, [protos, capsulas]);
  // Una fila "tiene cotización" si otra cotización ya está vinculada a ella o si ya tiene precio de cotización.
  const conCot = useMemo(() => {
    const set = new Set();
    (cotizaciones || []).forEach((c) => { if (c.vinculo && c.id !== cot.id) set.add(c.vinculo.kind + c.vinculo.id); });
    return set;
  }, [cotizaciones, cot.id]);
  const tieneCot = (o) => conCot.has(o.kind + o.id) || o.precioActual != null;
  const esActual = (o) => cot.vinculo && cot.vinculo.kind === o.kind && cot.vinculo.id === o.id;
  const esMismaRef = (o) => o.reference && normRef(o.reference) === normRef(cot.referencia);
  const nSin = opciones.filter((o) => !tieneCot(o)).length;
  const qn = normTxt(q);
  const qr = normRef(q);
  const filtradas = opciones
    .filter((o) => !soloSin || !tieneCot(o) || esActual(o) || esMismaRef(o))
    .filter((o) => !qn || normTxt(o.label).includes(qn) || (qr && normRef(o.reference).includes(qr)))
    .sort((a, b) => (normRef(b.reference) === normRef(cot.referencia)) - (normRef(a.reference) === normRef(cot.referencia)))
    .slice(0, 60);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "min(640px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{onElegir ? `Aplicar ${fmtCOP(precio)} (con IVA)` : "Vincular a prototipo o cápsula"}</div>
          <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 10px" }}>{onElegir ? "Elige el prototipo o la referencia de cápsula que recibe este precio. Haz clic en una fila para vincularla. «Aplicar» además aprueba la versión y pone el precio." : "Haz clic en el prototipo o la referencia de cápsula que corresponde. El precio se aplicará cuando lo apruebe quien tiene el permiso."}</div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por referencia o nombre…" style={inp} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} /> Solo sin cotización <span style={{ color: C.slate }}>({nSin} de {opciones.length})</span>
          </label>
        </div>
        <div style={{ overflowY: "auto", padding: 8 }}>
          {filtradas.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.slate, fontSize: 13 }}>No se encontró nada con ese texto.</div>}
          {filtradas.map((o) => {
            const igual = normRef(o.reference) === normRef(cot.referencia) && o.reference;
            return (
              <div key={o.kind + o.id} onClick={() => onSoloVincular(o)} title="Clic para vincular" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, borderBottom: `1px solid ${C.border}`, background: igual ? C.greenBg : "transparent", cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.kind === "proto" ? "⬡" : "⬢"} {o.label}</div>
                  <div style={{ fontSize: 11, color: C.slate }}>{o.kind === "proto" ? "Prototipo" : "Referencia de cápsula"}{o.cliente ? ` · ${o.cliente}` : ""}{o.precioActual != null ? ` · precio actual ${fmtCOP(o.precioActual)}` : " · sin precio"}</div>
                </div>
                {igual && <Pastilla bg={C.green} color={C.white}>misma ref.</Pastilla>}
                <Pastilla bg={tieneCot(o) ? C.amberBg : C.blueBg} color={tieneCot(o) ? C.amber : C.blue}>{tieneCot(o) ? "con cotización" : "sin cotización"}</Pastilla>
                <button onClick={(e) => { e.stopPropagation(); onSoloVincular(o); }} style={{ ...btn(C.white, C.slate, C.border), fontWeight: 500, fontSize: 12 }}>{onElegir ? "Solo vincular" : "Vincular"}</button>
                {onElegir && <button onClick={(e) => { e.stopPropagation(); onElegir(o); }} style={{ ...btn(C.green, C.white), fontSize: 12 }}>Aplicar</button>}
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
  const fichasVirtuales = ["General", "Kamila", "Surtiexport", "Conbot", "Mary Bautista"];
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
  const [insBusintPar, setInsBusintPar] = useState(null);
  const codOrigPar = useRef("");
  const actual = lista.find((f) => f.id === selId) || lista[0];
  useEffect(() => { setBorrador(actual ? limpio(actual) : null); }, [selId, actual?.guardada, parametros]); // eslint-disable-line
  if (!borrador) return null;
  const setB = (fn) => setBorrador((b) => { const n = limpio(b); fn(n); return n; });
  async function guardar() {
    await fsSet("cotizador_parametros", borrador.id, { id: borrador.id, nombre: borrador.nombre, tasas: borrador.tasas, fijos: borrador.fijos, procesos: borrador.procesos, insumos: borrador.insumos || [], actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    notify?.(`Ficha "${borrador.nombre}" guardada. Las cotizaciones nuevas la usarán; las ya guardadas no cambian.`);
  }
  async function autollenarCodigoPar(i) {
    const cod = borrador.insumos?.[i]?.codigo;
    if (String(cod || "").trim() === codOrigPar.current) return;
    const r = await buscarInsumoPorCodigo(cod);
    if (r.estado === "ok") {
      const p = precioBusint(r.x);
      setB((b) => { const it = b.insumos[i]; if (!it) return; if (p != null) it.precio = p; if (!String(it.nombre || "").trim()) it.nombre = r.x.componente; });
      notify?.(`Cód. ${String(cod).trim()}: ${r.x.componente}${p != null ? ` · promedio ${fmtCOP(p)}` : " · sin precio en Busint"}`);
    } else if (r.estado === "nada") notify?.(`El código ${String(cod).trim()} no está en el inventario de Busint; queda como lo escribiste.`);
    else if (r.estado === "varios") notify?.(`El código ${String(cod).trim()} coincide con varios insumos de Busint; usa la lupa para elegir.`);
    else if (r.estado === "error") notify?.("No se pudo consultar Busint: " + r.msg);
  }
  function cargarSugeridos() {
    const sug = insumosSugeridos(borrador.nombre);
    if (!sug) return;
    if ((borrador.insumos || []).some((x) => String(x.nombre || "").trim()) && !window.confirm(`¿Reemplazar los insumos básicos de ${borrador.nombre} por los de sus cotizaciones (${sug.length})? Después debes guardar la ficha.`)) return;
    setB((b) => { b.insumos = sug; });
  }
  async function agregarCliente() {
    const n = nuevo.trim();
    if (!n) return;
    const id = slug(n);
    await fsSet("cotizador_parametros", id, { id, nombre: n, tasas: { ...TASAS_BASE }, fijos: { ...FIJOS_BASE }, procesos: PROCESOS_BASE.map((p) => ({ ...p })), insumos: INSUMOS_BASE.map((x) => ({ ...x })), actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
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
        <Seccion titulo="Insumos básicos" sub="Ya aparecen cargados en cada cotización nueva de este cliente, para que nadie tenga que agregarlos. Precio fijo o con 🔎 desde Busint (promedio). «Imprev.» = va en la base de imprevistos."
          derecha={<div style={{ display: "flex", gap: 8 }}>
            {insumosSugeridos(borrador.nombre) && <button onClick={cargarSugeridos} title="Carga los insumos que salen en las cotizaciones de este cliente" style={btn(C.white, C.violet, C.violet)}>↻ Insumos de sus cotizaciones</button>}
            <button onClick={() => setB((b) => { b.insumos = b.insumos || []; b.insumos.push({ nombre: "", precio: "", consumo: 1, termo: false }); })} style={btn(C.blueBg, C.blue, C.blue)}>+ Insumo</button>
          </div>}>
          {insBusintPar !== null && borrador.insumos?.[insBusintPar] && (
            <ModalInsumoBusint inicial={borrador.insumos[insBusintPar].nombre} titulo={borrador.insumos[insBusintPar].nombre || "insumo"} onClose={() => setInsBusintPar(null)}
              onElegir={(x) => { const i = insBusintPar; setInsBusintPar(null); setB((b) => { const it = b.insumos[i]; if (!it) return; it.precio = x.promedio > 0 ? x.promedio : (x.costo > 0 ? x.costo : it.precio); it.codigo = x.codcomp || ""; if (!String(it.nombre || "").trim()) it.nombre = x.componente; }); }} />
          )}
          {(borrador.insumos || []).length === 0 && <div style={{ fontSize: 13, color: C.slate }}>Sin insumos básicos: las cotizaciones nuevas de este cliente arrancan sin insumos.</div>}
          {(borrador.insumos || []).length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead><tr><th style={th}>Insumo</th><th style={th}>Cód.</th><th style={th}>Precio</th><th style={th}>Consumo</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={th}>Imprev.</th><th /></tr></thead>
                <tbody>
                  {borrador.insumos.map((it, i) => (
                    <tr key={i}>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button title="Traer precio promedio y código desde Busint" onClick={() => setInsBusintPar(i)} style={{ border: `1px solid ${C.border}`, background: C.field, borderRadius: 8, cursor: "pointer", padding: "6px 8px" }}>🔎</button>
                          <input value={it.nombre} onChange={(e) => setB((b) => { b.insumos[i].nombre = e.target.value; })} style={{ ...inp, minWidth: 190 }} />
                        </div>
                      </td>
                      <td style={td}><input value={it.codigo || ""} onFocus={() => { codOrigPar.current = String(it.codigo || "").trim(); }} onBlur={() => autollenarCodigoPar(i)} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} onChange={(e) => setB((b) => { b.insumos[i].codigo = e.target.value; })} style={{ ...inp, width: 100 }} placeholder="Código" /></td>
                      <td style={td}><input type="text" inputMode="decimal" value={it.precio ?? ""} onChange={(e) => setB((b) => { b.insumos[i].precio = e.target.value; })} style={{ ...inp, width: 100, textAlign: "right" }} /></td>
                      <td style={td}><input type="text" inputMode="decimal" value={it.consumo ?? ""} onChange={(e) => setB((b) => { b.insumos[i].consumo = e.target.value; })} style={{ ...inp, width: 70, textAlign: "right" }} /></td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtDec(num(it.precio) * num(it.consumo))}</td>
                      <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={!!it.termo} onChange={(e) => setB((b) => { b.insumos[i].termo = e.target.checked; })} /></td>
                      <td style={td}><button onClick={() => setB((b) => { b.insumos.splice(i, 1); })} style={{ border: "none", background: "none", cursor: "pointer", color: C.red, fontSize: 16 }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={4} style={{ ...td, textAlign: "right", fontWeight: 700, color: C.slate }}>Total insumos</td><td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{fmtDec(borrador.insumos.reduce((a, it) => a + num(it.precio) * num(it.consumo), 0))}</td><td colSpan={2} /></tr></tfoot>
              </table>
            </div>
          )}
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
// Inventario de insumos de Busint (costo PROMEDIO y cantidad en bodega): se
// consulta una sola vez y se guarda en memoria (igual que las telas).
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
    return cat.filter((x) => palabras.every((w) => normTxt(`${x.componente} ${x.color} ${x.codcomp || ""}`).includes(w))).slice(0, 80);
  }, [cat, q]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.45)", zIndex: 1000, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, width: "100%", maxWidth: 820, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Inventario de insumos (Busint) — {titulo}</div>
          <button onClick={onClose} style={btn(C.white, C.slate, C.border)}>Cerrar</button>
        </div>
        <div style={{ padding: "12px 18px" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe parte del nombre, del color o el código del insumo…" style={inp} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px 16px" }}>
          {!cat && !error && <div style={{ padding: 20, textAlign: "center", color: C.slate, fontSize: 13 }}>Consultando el inventario de Busint…</div>}
          {error && <div style={{ padding: 12, background: C.redBg, color: C.red, borderRadius: 8, fontSize: 13 }}>No se pudo consultar Busint: {error}</div>}
          {cat && lista.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.slate, fontSize: 13 }}>Ningún insumo coincide con la búsqueda.</div>}
          {cat && lista.length > 0 && (
            <div style={{ display: "flex", gap: 10, padding: "4px 6px", fontSize: 11, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <div style={{ minWidth: 56 }}>Cód.</div><div style={{ flex: 1 }}>Insumo</div><div style={{ minWidth: 70, textAlign: "right" }}>En bodega</div><div style={{ minWidth: 90, textAlign: "right" }}>Promedio</div><div style={{ minWidth: 90, textAlign: "right" }}>Costo ficha</div>
            </div>
          )}
          {lista.map((x, i) => (
            <div key={`${x.codcomp || x.componente}-${i}`} onClick={() => onElegir(x)} style={{ display: "flex", gap: 10, padding: "9px 6px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13, alignItems: "center" }}>
              <div style={{ minWidth: 56, color: C.slate, fontSize: 12 }}>{x.codcomp || "—"}</div>
              <div style={{ flex: 1 }}>{x.componente}{x.color && <span style={{ color: C.slate }}> · {x.color}</span>}{x.unidad && <span style={{ color: C.slate, fontSize: 11 }}> ({x.unidad})</span>}</div>
              <div style={{ minWidth: 70, textAlign: "right", color: C.slate }}>{fmtDec(x.cantidad)}</div>
              <div style={{ minWidth: 90, textAlign: "right", fontWeight: 800, color: x.promedio > 0 ? C.ink : C.amber }}>{x.promedio > 0 ? "$" + fmtDec(x.promedio) : "sin promedio"}</div>
              <div style={{ minWidth: 90, textAlign: "right", color: C.slate }}>{x.costo > 0 ? "$" + fmtDec(x.costo) : "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function MiniVinilo({ currentUser, notify, onPasar, refInicial, inicialId, etiquetaPasar, puedeBorrar }) {
  const [guardados, setGuardados] = useState([]);
  const [ref, setRef] = useState(refInicial || "");
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [pct, setPct] = useState(IMPREVISTOS_PCT);
  const [filas, setFilas] = useState(() => filasViniloVacias());
  const [buscandoFila, setBuscandoFila] = useState(null); // fila que está eligiendo insumo de Busint
  const [estandarAplicado, setEstandarAplicado] = useState(false);
  const [bases, setBases] = useState(null); // registros de "Bases Vinilo y DTF" (null = cargando)
  const [guardadosListo, setGuardadosListo] = useState(false);

  useEffect(() => onSnapshot(collection(db, "cotizador_vinilo"), (s) => { setGuardados(s.docs.map((d) => ({ ...d.data(), id: d.id }))); setGuardadosListo(true); }, () => setGuardadosListo(true)), []);
  useEffect(() => onSnapshot(collection(db, "cotizador_bases"), (s) => setBases(s.docs.find((d) => d.id === "vinilo")?.data().registros || []), () => setBases([])), []);

  const estandarViejo = guardados.find((g) => g.id === "_estandar")?.filas;
  // La hoja nueva arranca con las bases vigentes en su mes (y, si una fila aún no tiene registro, con el estándar anterior).
  useEffect(() => {
    if (estandarAplicado || bases === null || !guardadosListo) return;
    setEstandarAplicado(true);
    // Abierta desde una cotización: arranca con la hoja guardada de esa referencia (si la hay).
    const previa = (inicialId && guardados.find((g) => g.id === inicialId))
      || (refInicial ? guardados.filter((g) => g.id !== "_estandar" && normRef(g.ref) === normRef(refInicial)).sort((a, b) => String(b.mes).localeCompare(String(a.mes)))[0] : null);
    if (previa) { cargar(previa); return; }
    setFilas((fs) => aplicarBases(fs, bases, `${mes}-31`, estandarViejo));
  }, [bases, guardadosListo, estandarAplicado]); // eslint-disable-line

  const calc = useMemo(() => calcularVinilo(filas, pct), [filas, pct]);
  const cambiar = (key, campo, valor) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, [campo]: valor } : f)));
  async function guardar() {
    if (!normRef(ref)) { notify?.("Escribe la referencia para guardar"); return null; }
    const stamp = new Date().toISOString();
    await fsSet("cotizador_vinilo", `${normRef(ref)}_${mes}`, { ref: ref.trim(), mes, pct, filas, total: calc.total, actualizadoPor: currentUser?.name || "", actualizado: stamp });
    notify?.("Minicotización guardada");
    return stamp;
  }
  function aplicarBasesVigentes() {
    setFilas((fs) => aplicarBases(fs, bases || [], `${mes}-31`, estandarViejo));
    notify?.(`Bases vigentes en ${mesLargo(mes)} aplicadas`);
  }
  function cargar(g) {
    setRef(g.ref || ""); setMes(g.mes || hoyISO().slice(0, 7)); setPct(g.pct ?? IMPREVISTOS_PCT); setFilas(normalizarFilas(g.filas));
  }
  // Borra una minicotización guardada (la hoja exacta de la fila). Pide confirmación.
  async function borrarGuardada(g) {
    if (!puedeBorrar) { notify?.("Tu rol no tiene permiso para borrar"); return; }
    if (!window.confirm(`¿Borrar la minicotización ${g.ref} de ${mesLargo(g.mes)} (${money(g.total)})?\n\nNo se puede deshacer. Si alguna cotización la tenía adjunta, conserva los valores ya pasados.`)) return;
    try {
      await fsDel("cotizador_vinilo", g.id);
      // Si era la hoja abierta en pantalla, el formulario vuelve a empezar.
      if (`${normRef(ref)}_${mes}` === g.id) { setRef(refInicial || ""); setFilas(aplicarBases(filasViniloVacias(), bases || [], `${mes}-31`, estandarViejo)); }
      notify?.(`Minicotización ${g.ref} borrada`);
    } catch (e) { notify?.("No se pudo borrar: " + (e.message || e)); }
  }
  async function excel() {
    try { await descargarViniloExcel({ ref, mes, filas, pct }); } catch (e) { notify?.("No se pudo generar el Excel: " + (e.message || e)); }
  }

  const lista = guardados.filter((g) => g.id !== "_estandar").sort((a, b) => String(b.actualizado || "").localeCompare(String(a.actualizado || "")));
  const cel = { ...inp, textAlign: "right" };
  const money = (n) => "$" + fmtDec(n);

  return (
    <div>
      <Seccion titulo="🎨 Minicotizador de Vinilo / DTF" sub="En cada insumo usa 🔎 para tomar su costo PROMEDIO del inventario de Busint y digita el promedio (consumo); los demás son procesos con valor fijo. TOTAL = costo por unidad + BASE.">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Campo label="Referencia" ancho={150}><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej: 98-5644" style={inp} /></Campo>
          <Campo label="Mes" ancho={140}><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={inp} /></Campo>
          <Campo label="Imprevistos %" ancho={100}><input value={pct} onChange={(e) => setPct(e.target.value)} style={cel} /></Campo>
        </div>
      </Seccion>

      <Seccion titulo={tituloVinilo(ref.trim(), mes)} sub="El costo M.P viene del costo promedio del inventario de Busint (🔎); el BASE viene de «Bases Vinilo y DTF» (el vigente en el mes). Todo se puede corregir a mano.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr style={{ background: "#FFF9C4" }}>
                <th style={{ ...th, textAlign: "center" }}>Usa</th><th style={th}>Proceso e insumo</th><th style={{ ...th, textAlign: "right" }}>Costo M.P</th><th style={{ ...th, textAlign: "right" }}>Promedio</th>
                <th style={th}>U</th><th style={{ ...th, textAlign: "right" }}>Costo x U</th><th style={{ ...th, textAlign: "right" }}>Base</th><th style={{ ...th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <FragmentFila key={f.key}>
                <tr style={{ borderTop: `1px solid ${C.border}`, opacity: f.usa === false ? 0.45 : 1 }}>
                  <td style={{ ...td, textAlign: "center", width: 44 }}><input type="checkbox" title="Si no la marcas, esta fila no suma ni pasa a la cotización" checked={f.usa !== false} onChange={(e) => cambiar(f.key, "usa", e.target.checked)} /></td>
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
                {f.key === "bajada5" && (() => {
                  const marcadas = filas.filter((x) => grupoFila(x) === "bajada" && x.usa !== false).length;
                  const suma = filas.reduce((a, x, j) => a + (grupoFila(x) === "bajada" && x.usa !== false ? calc.detalle[j].total : 0), 0);
                  return (
                    <tr style={{ background: "#FFF3B0", borderTop: `1px solid ${C.border}` }}>
                      <td colSpan={7} style={{ ...td, textAlign: "right", fontWeight: 800, padding: 8 }}>TOTAL BAJADAS ({marcadas} de 5 vinilos)</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{money(suma)}</td>
                    </tr>
                  );
                })()}
                </FragmentFila>
              ))}
              <tr style={{ borderTop: `2px solid ${C.ink}`, background: "#FFF9C4" }}>
                <td colSpan={7} style={{ ...td, textAlign: "right", fontWeight: 800, padding: 8 }}>SUMA VINILO + DTF</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{money(calc.suma)}</td>
              </tr>
              <tr style={{ background: "#FFF9C4" }}>
                <td colSpan={7} style={{ ...td, textAlign: "right", fontWeight: 800, padding: 8 }}>IMPREVISTOS {fmtDec(num(pct))}%</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{money(calc.imprevistos)}</td>
              </tr>
              <tr style={{ background: "#FFF176" }}>
                <td colSpan={7} style={{ ...td, textAlign: "right", fontWeight: 900, padding: 8, fontSize: 15 }}>TOTAL</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 900, fontSize: 15 }}>{money(calc.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={guardar} style={btn(C.green, C.white)}>💾 Guardar</button>
          <button onClick={excel} style={btn(C.white, C.blue, C.blue)}>📤 Descargar Excel</button>
          <button onClick={async () => { const st = await guardar(); if (st) onPasar(ref, filas, calc, mes, st); }} style={btn(C.white, C.violet, C.violet)}>{etiquetaPasar || "🧮 Pasar al cotizador"}</button>
          <div style={{ flex: 1 }} />
          <button onClick={aplicarBasesVigentes} title="Vuelve a poner el BASE (y el valor de los procesos) que rige en el mes de esta hoja, según «Bases Vinilo y DTF»" style={btn(C.white, C.slate, C.border)}>↻ Aplicar bases vigentes</button>
        </div>
      </Seccion>

      <Seccion titulo={`Minicotizaciones guardadas (${lista.length})`} plegable abierta={false}>
        {lista.length === 0 && <div style={{ fontSize: 13, color: C.slate }}>Aún no hay ninguna guardada.</div>}
        {lista.map((g) => (
          <div key={g.id} onClick={() => cargar(g)} style={{ display: "flex", gap: 12, padding: "8px 4px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13 }}>
            <b style={{ minWidth: 110 }}>{g.ref}</b><span style={{ color: C.slate, minWidth: 90 }}>{mesLargo(g.mes)}</span><span style={{ flex: 1, color: C.slate }}>{g.actualizadoPor || ""} · {fmtFecha(String(g.actualizado || "").slice(0, 10))}</span><b>{money(g.total)}</b>
            {puedeBorrar && <button onClick={(e) => { e.stopPropagation(); borrarGuardada(g); }} title="Borrar esta minicotización" style={{ ...btn(C.white, C.red, C.red), padding: "3px 10px", fontSize: 12 }}>🗑 Borrar</button>}
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

// ─── BASES VINILO Y DTF ──────────────────────────────────────────────────────
// (2026-10-16, a pedido de Fredy) Registro del valor BASE de cada concepto del
// minicotizador, con vigencia e historial. Colección "cotizador_bases", doc
// "vinilo": { registros: [{id, key, desde, valor, base, nota, por, creado}] }.
// Solo cambia bases quien aprueba cotizaciones (o el admin); los demás las ven.
function BasesVinilo({ currentUser, puedeEditar, notify }) {
  const [registros, setRegistros] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [editando, setEditando] = useState(null);
  const [editId, setEditId] = useState(null); // id del registro que se está corrigiendo (null = registro nuevo)
  const [form, setForm] = useState({ desde: hoyISO(), valor: "", base: "", nota: "" });
  useEffect(() => onSnapshot(collection(db, "cotizador_bases"), (s) => { setRegistros(s.docs.find((d) => d.id === "vinilo")?.data().registros || []); setCargado(true); }, () => setCargado(true)), []);
  const hoy = hoyISO();
  const money = (n) => "$" + fmtDec(n);
  const cel = { ...inp, textAlign: "right" };
  function abrirForm(f, reg) {
    const v = reg || baseVigente(registros, f.key, hoy);
    setForm({ desde: reg ? reg.desde : hoy, valor: f.tipo === "proceso" ? String(v?.valor ?? f.valor ?? "") : "", base: v?.base != null ? String(v.base) : "", nota: reg ? (reg.nota || "") : "" });
    setEditId(reg ? reg.id : null);
    setEditando(f.key);
  }
  async function borrarRegistro(f, r) {
    if (!puedeEditar) { notify?.("Tu rol no puede cambiar las bases"); return; }
    if (!window.confirm(`¿Borrar el registro de ${f.nombre}: BASE ${money(r.base)} desde ${fmtFecha(r.desde)}?\n\nLas minicotizaciones ya guardadas no cambian; las nuevas tomarán la base anterior.`)) return;
    await fsSet("cotizador_bases", "vinilo", { registros: registros.filter((x) => x.id !== r.id), actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    notify?.("Registro borrado");
  }
  async function registrar(f) {
    if (!puedeEditar) { notify?.("Tu rol no puede cambiar las bases"); return; }
    if (!form.desde) { notify?.("Indica desde qué fecha rige"); return; }
    if (String(form.base).trim() === "") { notify?.("Escribe el valor BASE (puede ser 0)"); return; }
    const datos = { desde: form.desde, valor: f.tipo === "proceso" && String(form.valor).trim() !== "" ? num(form.valor) : null, base: num(form.base), nota: form.nota.trim() };
    const nuevos = editId
      ? registros.map((r) => (r.id === editId ? { ...r, ...datos, editadoPor: currentUser?.name || "", editado: new Date().toISOString() } : r))
      : [...registros, { id: uid(), key: f.key, ...datos, por: currentUser?.name || "", creado: new Date().toISOString() }];
    await fsSet("cotizador_bases", "vinilo", { registros: nuevos, actualizadoPor: currentUser?.name || "", actualizado: new Date().toISOString() });
    setEditando(null);
    setEditId(null);
    setAbierto(f.key);
    notify?.(editId ? `Registro de ${f.nombre} corregido` : `Base de ${f.nombre} registrada desde ${fmtFecha(form.desde)}`);
  }
  return (
    <div>
      <Seccion titulo="▦ Bases Vinilo y DTF" sub="El BASE es «lo que siempre cuesta hacerlo»: TOTAL = costo × consumo + BASE. Cada cambio queda registrado con la fecha desde la que rige; el minicotizador toma el vigente en el mes de la hoja.">
        {!puedeEditar && <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Solo quien aprueba cotizaciones puede cambiar las bases. Aquí las puedes consultar.</div>}
        {cargado && registros.length === 0 && <div style={{ fontSize: 13, color: C.amber, background: C.amberBg, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>Todavía no hay bases registradas: el minicotizador usa BASE 0 y los valores estándar de los procesos. Registra la primera de cada concepto.</div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead><tr><th style={th}>Concepto</th><th style={{ ...th, textAlign: "right" }}>Valor del proceso</th><th style={{ ...th, textAlign: "right" }}>BASE vigente</th><th style={th}>Rige desde</th><th /></tr></thead>
            <tbody>
              {FILAS_VINILO.filter((f) => !f.extra).map((f) => {
                const v = baseVigente(registros, f.key, hoy);
                const historial = registros.filter((r) => r.key === f.key).sort((a, b) => String(b.desde).localeCompare(String(a.desde)) || String(b.creado || "").localeCompare(String(a.creado || "")));
                return (
                  <FragmentFila key={f.key}>
                    <tr style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...td, padding: "10px 6px" }}><div style={{ fontWeight: 700, fontSize: 13 }}>{f.nombre}</div><div style={{ fontSize: 11, color: C.slate }}>{f.key === "bajada" ? "Proceso · rige para cada una de las 5 bajadas" : f.tipo === "proceso" ? "Proceso" : "Insumo (Busint)"}</div></td>
                      <td style={{ ...td, textAlign: "right" }}>{f.tipo === "proceso" ? (v?.valor != null ? money(v.valor) : <span style={{ color: C.slate }}>{money(f.valor)} (estándar)</span>) : "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{v ? money(v.base) : <span style={{ color: C.amber, fontWeight: 600 }}>Sin registrar</span>}</td>
                      <td style={{ ...td, fontSize: 12, color: C.slate }}>{v ? fmtFecha(v.desde) : "—"}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={() => setAbierto(abierto === f.key ? null : f.key)} style={{ ...btn(C.white, C.slate, C.border), padding: "4px 10px", fontSize: 12 }}>{abierto === f.key ? "▾" : "▸"} Historial ({historial.length})</button>{" "}
                        {puedeEditar && <button onClick={() => (editando === f.key && !editId ? setEditando(null) : abrirForm(f))} style={{ ...btn(C.blueBg, C.blue, C.blue), padding: "4px 10px", fontSize: 12 }}>✏ Cambiar</button>}
                      </td>
                    </tr>
                    {editando === f.key && (
                      <tr><td colSpan={5} style={{ padding: "0 6px 12px" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", background: C.field, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                          <Campo label="Rige desde" ancho={150}><input type="date" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} style={inp} /></Campo>
                          {f.tipo === "proceso" && <Campo label="Valor del proceso" ancho={130}><input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} style={cel} /></Campo>}
                          <Campo label="BASE" ancho={130}><input value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} style={cel} /></Campo>
                          <Campo label="Nota (opcional)" ancho={240}><input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Ej.: subió el operario" style={inp} /></Campo>
                          <div style={{ flexBasis: "100%", fontSize: 12, fontWeight: 700, color: editId ? C.amber : C.slate }}>{editId ? "Corrigiendo un registro del historial" : "Nuevo registro de base"}</div>
                          <button onClick={() => registrar(f)} style={btn(C.green, C.white)}>{editId ? "Guardar corrección" : "Registrar"}</button>
                          <button onClick={() => { setEditando(null); setEditId(null); }} style={btn(C.white, C.slate, C.border)}>Cancelar</button>
                        </div>
                      </td></tr>
                    )}
                    {abierto === f.key && (
                      <tr><td colSpan={5} style={{ padding: "0 6px 12px" }}>
                        {historial.length === 0 && <div style={{ fontSize: 12, color: C.slate }}>Sin registros todavía.</div>}
                        {historial.map((r) => (
                          <div key={r.id} style={{ display: "flex", gap: 12, fontSize: 12, padding: "4px 0", borderTop: `1px dashed ${C.border}`, alignItems: "center", flexWrap: "wrap" }}>
                            <b style={{ minWidth: 70 }}>{fmtFecha(r.desde)}</b>
                            <span style={{ minWidth: 110 }}>BASE {money(r.base)}</span>
                            {r.valor != null && <span style={{ minWidth: 120 }}>Proceso {money(r.valor)}</span>}
                            <span style={{ flex: 1, color: C.slate }}>{r.nota || ""}{r.nota && r.por ? " · " : ""}{r.por || ""}{r.editadoPor ? ` · corregido por ${r.editadoPor}` : ""}</span>
                            {v && v.id === r.id && <Pastilla bg={C.greenBg} color={C.green}>vigente hoy</Pastilla>}
                            {puedeEditar && <>
                              <button onClick={() => abrirForm(f, r)} style={{ ...btn(C.white, C.navy, C.border), padding: "2px 8px", fontSize: 11 }}>✏ Editar</button>
                              <button onClick={() => borrarRegistro(f, r)} style={{ ...btn(C.white, C.red, C.red), padding: "2px 8px", fontSize: 11 }}>🗑 Borrar</button>
                            </>}
                          </div>
                        ))}
                      </td></tr>
                    )}
                  </FragmentFila>
                );
              })}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  );
}
const FragmentFila = ({ children }) => <>{children}</>;

// ─── INICIO (DASHBOARD) DEL MÓDULO DE COTIZACIONES ───────────────────────────
// (2026-10-16, a pedido de Fredy) Pantalla de entrada del módulo, como la de
// Contabilidad: fichas de resumen, accesos a las tres pantallas y las últimas
// cotizaciones. Todo sale de las cotizaciones guardadas (nada se escribe aquí).
const DIAS_SIN_CAMBIOS = 30;
function estadoCotizacion(c) {
  const e = estadoUltima(c);
  if (e === "aprobacion") return { txt: "En aprobación", bg: C.amberBg, color: C.amber };
  if (e === "devuelta") return { txt: "Devuelta", bg: C.redBg, color: C.red };
  if (c.precioAplicado) return { txt: "Aplicado", bg: C.greenBg, color: C.green };
  if (c.vinculo) return { txt: "Vinculada", bg: C.blueBg, color: C.blue };
  return { txt: "Sin aplicar", bg: C.amberBg, color: C.amber };
}
// Botones de cada fila: Editar (todos) y Borrar (solo roles con el permiso).
function AccionesCotizacion({ c, onEditar, onBorrar, puedeBorrar }) {
  const chico = { padding: "4px 10px", fontSize: 12 };
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
      <button onClick={() => onEditar(c)} style={{ ...btn(C.white, C.navy, C.border), ...chico }}>✏ Editar</button>
      {puedeBorrar && <button onClick={() => onBorrar(c)} style={{ ...btn(C.white, C.red, C.red), ...chico }}>🗑 Borrar</button>}
    </div>
  );
}
function InicioCotizaciones({ protos, capsulas, cotizaciones, minis, cargado, puedeAprobar, puedeBorrar, onBorrar, onIr, onNueva, onFiltro, onAbrir }) {
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
  const porAprobar = cotizaciones.filter((c) => estadoUltima(c) === "aprobacion");
  const devueltas = cotizaciones.filter((c) => estadoUltima(c) === "devuelta").length;
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
        <div onClick={() => porAprobar.length > 0 && onFiltro("porAprobar")} style={{ background: porAprobar.length ? C.amberBg : C.white, border: `1px solid ${porAprobar.length ? "#EBD3A0" : C.border}`, borderRadius: 12, padding: "14px 16px", cursor: porAprobar.length ? "pointer" : "default" }}>
          <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{puedeAprobar ? "Por aprobar" : "En aprobación"}</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4, color: C.amber }}>{cargado ? porAprobar.length : "…"}</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{puedeAprobar ? "esperan tu aprobación" : "esperan que las aprueben"}</div>
        </div>
        <Ficha label="Cotizaciones" valor={cotizaciones.length} sub={`${clientes.size} cliente(s) · ${nVersiones} versiones`} />
        <Ficha label="Versiones este mes" valor={versionesMes} sub={mesLbl} />
        <Ficha label="Precio ya aplicado" valor={aplicadas} sub="en prototipos y cápsulas" color={C.green} />
        <Ficha label="Pendientes de aplicar" valor={sinAplicar} sub="cotizadas sin precio aplicado" color={C.amber} />
      </div>
      {porAprobar.length > 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", padding: "12px 16px" }}><div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{puedeAprobar ? "Esperan tu aprobación" : "En espera de aprobación"}</div><div style={{ color: C.slate, fontSize: 12 }}>{porAprobar.length} pendiente(s)</div></div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
              <thead><tr><th style={{ ...th, padding: "6px 16px" }}>Referencia</th><th style={th}>Enviada por</th><th style={th}>Destino</th><th style={{ ...th, textAlign: "right" }}>Precio con IVA</th><th style={th} /></tr></thead>
              <tbody>
                {porAprobar.map((c) => {
                  const ult = ultimaVersion(c);
                  const r = ult ? calcularCotizacion(ult.v) : null;
                  return (
                    <tr key={c.id} onClick={() => onAbrir(c)} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <td style={{ padding: "9px 16px", fontWeight: 800 }}>{c.referencia || "—"} <span style={{ color: C.slate, fontWeight: 500 }}>V{ult?.numero}</span></td>
                      <td style={td}>{ult?.envio?.por || "—"}{ult?.envio?.fecha ? <span style={{ color: C.slate }}> · {fmtFecha(ult.envio.fecha.slice(0, 10)).slice(0, 5)}</span> : null}</td>
                      <td style={{ ...td, color: c.vinculo ? C.ink : C.slate }}>{c.vinculo ? etiquetaVinculo(c.vinculo, protos, capsulas) : "Sin vincular"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{r ? fmtCOP(r.precioAplicar) : "—"}</td>
                      <td style={{ ...td, textAlign: "right", paddingRight: 16 }}><span style={{ background: C.navy, color: C.white, padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{puedeAprobar ? "Revisar" : "Ver"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginBottom: 16 }}>
        <Acceso icono="🧮" bg={C.blueBg} titulo="Cotizaciones" desc="Crear, versionar y aplicar precios" tab="cotizaciones" />
        <Acceso icono="🎨" bg={C.amberBg} titulo="Vinilo / DTF" desc="Minicotizador con datos de Busint" tab="vinilo" />
        <Acceso icono="▦" bg={C.greenBg} titulo="Bases Vinilo y DTF" desc="Valor BASE de cada proceso, con vigencia" tab="bases" />
        <Acceso icono="⚙" bg={C.violetBg} titulo="Parámetros por cliente" desc="Impuestos, administrativos y procesos" tab="parametros" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", paddingBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Últimas cotizaciones</div>
            <button onClick={onNueva} style={{ ...btn(C.green, C.white), padding: "6px 12px" }}>+ Nueva cotización</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
              <thead><tr><th style={{ ...th, padding: "6px 16px" }}>Referencia</th><th style={th}>Cliente</th><th style={th}>Versión</th><th style={{ ...th, textAlign: "right" }}>Precio con IVA</th><th style={th}>Estado</th><th style={th} /></tr></thead>
              <tbody>
                {cargado && ultimas.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: C.slate }}>Aún no hay cotizaciones.</td></tr>}
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
                      <td style={{ ...td, paddingRight: 8 }}><AccionesCotizacion c={c} onEditar={onAbrir} onBorrar={onBorrar} puedeBorrar={puedeBorrar} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", alignSelf: "start" }}>
          <div style={{ fontWeight: 800, fontSize: 14, padding: "12px 16px" }}>Por atender</div>
          <Pendiente n={porAprobar.length} bg={C.amberBg} color={C.amber} texto={puedeAprobar ? "Esperan tu aprobación" : "En espera de aprobación"} filtro="porAprobar" />
          <Pendiente n={devueltas} bg={C.redBg} color={C.red} texto="Devueltas para corregir" filtro="devueltas" />
          <Pendiente n={sinAplicar} bg={C.amberBg} color={C.amber} texto="Cotizadas sin precio aplicado" filtro="sinAplicar" />
          <Pendiente n={sinVincular} bg={C.redBg} color={C.red} texto="Sin vincular a prototipo ni cápsula" filtro="sinVincular" />
          <Pendiente n={viejas} bg={C.blueBg} color={C.blue} texto={`Con más de ${DIAS_SIN_CAMBIOS} días sin cambios`} filtro="viejas" />
          <Pendiente n={minis.length} bg={C.violetBg} color={C.violet} texto="Minicotizaciones de vinilo guardadas" />
        </div>
      </div>
    </div>
  );
}

// Menú vertical del módulo (mismo estilo que Bodega): azul marino, activo en beige.
const ITEMS_MENU = [["inicio", "◉", "Inicio"], ["cotizaciones", "▤", "Cotizaciones"], ["aprobar", "✓", "Por aprobar"], ["vinilo", "◈", "Vinilo / DTF"], ["bases", "▦", "Bases Vinilo y DTF"], ["parametros", "⚙", "Parámetros por cliente"]];
function MenuCotizaciones({ activo, onIr, onVolver, onLogout, currentUser, nAprobar, puedeAprobar }) {
  const inicial = String(currentUser?.name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="cotz-side" style={{ width: 268, flexShrink: 0, background: C.navy, color: "#C9C8DE", padding: "18px 14px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start", boxSizing: "border-box" }}>
      <div style={{ padding: "0 6px 14px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>🧮 Cotizaciones</div>
        <div style={{ letterSpacing: 1.6, color: "#8B8AAE", fontSize: 11, fontWeight: 600 }}>PRECIOS</div>
      </div>
      <div style={{ background: C.navy2, borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "center", margin: "6px 0 16px" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.seam, color: C.ink, display: "grid", placeItems: "center", fontWeight: 800 }}>{inicial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name || "Usuario"}</div>
          <div style={{ color: "#8B8AAE", fontSize: 11 }}>{currentUser?.role || ""}</div>
        </div>
      </div>
      <div className="cotz-items">
        {ITEMS_MENU.map(([id, icono, texto]) => {
          const on = activo === id;
          return (
            <button key={id} onClick={() => onIr(id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 12px", border: "none", borderRadius: 10, marginBottom: 3, fontSize: 14, fontFamily: "inherit", cursor: "pointer", textAlign: "left", background: on ? C.seam : "transparent", color: on ? C.ink : "#C9C8DE", fontWeight: on ? 800 : 500 }}>
              <span style={{ width: 18, textAlign: "center", fontSize: 15, color: on ? C.ink : "#8B8AAE" }}>{icono}</span>{id === "aprobar" && !puedeAprobar ? "En aprobación" : texto}
              {id === "aprobar" && nAprobar > 0 && <span style={{ marginLeft: "auto", background: C.amber, color: "#fff", borderRadius: 10, minWidth: 22, height: 20, padding: "0 6px", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>{nAprobar}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1 }} className="cotz-sp" />
      {onVolver && <button onClick={onVolver} style={{ background: "none", border: "none", color: "#8B8AAE", padding: "8px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>← Volver al Inicio</button>}
      {onLogout && <button onClick={onLogout} style={{ background: "none", border: "none", color: "#E8786A", fontWeight: 700, padding: "8px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>⏏ Cerrar sesión</button>}
    </div>
  );
}

export default function CotizadorView({ currentUser, config, protos, capsulas, iniciarDesde, onIniciarConsumido, onAplicarPrecio, onVolver, onLogout, puedeBorrar, puedeAprobar, notify }) {
  const [edSucio, setEdSucio] = useState(false); // el editor abierto tiene cambios sin guardar
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
    setEdSucio(false);
    notify?.("Cotización eliminada");
  }
  // Borrar pide confirmación con el nombre, las versiones que se pierden y si ya tenía precio aplicado.
  async function pedirBorrar(cot) {
    if (!puedeBorrar) { notify?.("Tu rol no tiene permiso para borrar cotizaciones"); return; }
    const n = cot.versiones?.length || 0;
    const nombre = `${cot.referencia || "sin referencia"}${cot.nombre ? " · " + cot.nombre : ""}`;
    const aviso = cot.precioAplicado ? `\n\nOjo: ya tenía un precio aplicado (${fmtCOP(cot.precioAplicado.valor)} a ${cot.precioAplicado.destino}). Ese precio NO cambia en el prototipo; solo se pierde el historial de la cotización.` : "";
    if (!window.confirm(`¿Borrar la cotización ${nombre}?\n\nSe pierden sus ${n} versión(es). No se puede deshacer.${aviso}`)) return;
    await eliminar(cot);
  }
  // Minicotizador de Vinilo / DTF -> cotización de la referencia (versión nueva).
  async function pasarAlCotizador(ref, filas, calc, mes, stamp) {
    const k = normRef(ref);
    if (!k) { notify?.("Escribe la referencia para pasarla al cotizador"); return; }
    const existente = cotizaciones.find((c) => normRef(c.referencia) === k);
    const base = existente ? limpio(existente) : cotNueva({ referencia: String(ref).trim() });
    const ultima = base.versiones[base.versiones.length - 1];
    const v = limpio(ultima.v);
    volcarVinilo(v, filas, calc);
    v.vinilo = { miniId: `${k}_${mes}`, ref: String(ref).trim(), mes, total: Math.round(calc.total * 100) / 100, actualizado: stamp };
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

  const FILTROS_TXT = { porAprobar: "Esperan aprobación", devueltas: "Devueltas para corregir", sinAplicar: "Cotizadas sin precio aplicado", sinVincular: "Sin vincular a prototipo ni cápsula", viejas: "Con más de 30 días sin cambios" };
  const pasaFiltro = (c) => {
    const fe = tab === "aprobar" ? "porAprobar" : filtroEstado;
    if (fe === "porAprobar") return estadoUltima(c) === "aprobacion";
    if (fe === "devueltas") return estadoUltima(c) === "devuelta";
    if (filtroEstado === "sinAplicar") return !c.precioAplicado;
    if (filtroEstado === "sinVincular") return !c.vinculo && !c.precioAplicado;
    if (filtroEstado === "viejas") return !!c.actualizado && (Date.now() - new Date(c.actualizado).getTime()) / 86400000 > 30;
    return true;
  };
  const filtradas = cotizaciones
    .filter(pasaFiltro)
    .filter((c) => !busqueda || normTxt(`${c.referencia} ${c.nombre} ${c.cliente}`).includes(normTxt(busqueda)) || normRef(c.referencia).includes(normRef(busqueda)))
    .sort((a, b) => String(b.actualizado || "").localeCompare(String(a.actualizado || "")));

  function irA(t) {
    if (edit && edSucio && !window.confirm("Hay cambios sin guardar en la cotización. ¿Salir sin guardar?")) return;
    setEdit(null); setEdSucio(false); setFiltroEstado(null); setTab(t);
  }
  const TITULOS = { inicio: "Inicio", cotizaciones: "Cotizaciones", vinilo: "Vinilo / DTF", bases: "Bases Vinilo y DTF", parametros: "Parámetros por cliente", aprobar: puedeAprobar ? "Por aprobar" : "En aprobación" };
  return (
    <div className="cotz-root" style={{ display: "flex", minHeight: "100vh", background: C.canvas, fontFamily: FUENTE, color: C.ink }}>
      <MenuCotizaciones activo={edit ? "cotizaciones" : tab} onIr={irA} onVolver={onVolver} onLogout={onLogout} currentUser={currentUser} nAprobar={cotizaciones.filter((c) => estadoUltima(c) === "aprobacion").length} puedeAprobar={puedeAprobar} />
      <div style={{ flex: 1, minWidth: 0, padding: "24px 34px", boxSizing: "border-box" }}>
      {edit ? (
        <CotizacionEditor key={edit.id} inicial={edit} minis={minis} parametros={parametros} clientes={clientesApp} protos={protos} capsulas={capsulas} cotizaciones={cotizaciones}
          onGuardar={guardar} onVolver={() => { setEdit(null); setEdSucio(false); }} onEliminar={pedirBorrar} puedeBorrar={puedeBorrar} onSucio={setEdSucio} puedeAprobar={puedeAprobar} usuario={currentUser?.name || ""} notify={notify}
          onAplicar={(destino, valor) => onAplicarPrecio(destino, valor)} />
      ) : (
      <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: -0.4 }}>{TITULOS[tab]}</div>
        <div style={{ color: C.slate, fontWeight: 600 }}>· Cotizaciones</div>
      </div>

      {tab === "parametros" && <ParametrosView parametros={parametros} clientesApp={clientesApp} currentUser={currentUser} notify={notify} />}

      {tab === "inicio" && (
        <InicioCotizaciones protos={protos} capsulas={capsulas} cotizaciones={cotizaciones} minis={minis} cargado={cargado} puedeAprobar={puedeAprobar} puedeBorrar={puedeBorrar} onBorrar={pedirBorrar}
          onIr={(t) => { setFiltroEstado(null); setTab(t); }} onNueva={() => setEdit(cotNueva())}
          onFiltro={(f) => { setFiltroEstado(f); setTab("cotizaciones"); }} onAbrir={(c) => setEdit({ ...limpio(c), existe: true })} />
      )}

      {tab === "vinilo" && <MiniVinilo currentUser={currentUser} notify={notify} onPasar={pasarAlCotizador} puedeBorrar={puedeBorrar} />}
      {tab === "bases" && <BasesVinilo currentUser={currentUser} puedeEditar={puedeAprobar} notify={notify} />}

      {(tab === "cotizaciones" || tab === "aprobar") && (
        <div>
          {tab === "cotizaciones" && filtroEstado && (
            <div style={{ marginBottom: 10 }}>
              <span onClick={() => setFiltroEstado(null)} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "5px 12px", borderRadius: 14, background: C.amberBg, color: C.amber, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Filtro: {FILTROS_TXT[filtroEstado]} ✕</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por referencia, nombre o cliente…" style={{ ...inp, maxWidth: 340 }} />
            <div style={{ flex: 1 }} />
            {tab === "cotizaciones" && <>
            <button onClick={() => setImportar(true)} style={btn(C.white, C.blue, C.blue)}>📥 Importar Excel</button>
            <button disabled={!filtradas.length} onClick={() => descargarExcel(filtradas, `Cotizaciones ${hoyISO()}.xlsx`, null, notify)} style={{ ...btn(C.white, C.blue, C.blue), opacity: filtradas.length ? 1 : 0.4 }}>📤 Descargar Excel ({filtradas.length})</button>
            <button onClick={() => setEdit(cotNueva())} style={btn(C.green, C.white)}>+ Nueva cotización</button>
            </>}
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead><tr><th style={{ ...th, padding: 12 }}>Referencia</th><th style={th}>Nombre</th><th style={th}>Cliente</th><th style={th}>Versiones</th><th style={{ ...th, textAlign: "right" }}>Precio con IVA (última)</th><th style={th}>Estado</th><th style={th}>Aplicado a</th><th style={th} /></tr></thead>
              <tbody>
                {!cargado && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: C.slate }}>Cargando…</td></tr>}
                {cargado && filtradas.length === 0 && <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: C.slate, fontSize: 13 }}>{tab === "aprobar" ? "No hay cotizaciones esperando aprobación." : cotizaciones.length ? "Ninguna cotización coincide con la búsqueda." : "Aún no hay cotizaciones. Crea una nueva o importa tu Excel (cada hoja = una versión)."}</td></tr>}
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
                      <td style={td}>{(() => { const e = estadoCotizacion(c); return <Pastilla bg={e.bg} color={e.color}>{e.txt}</Pastilla>; })()}</td>
                      <td style={{ ...td, fontSize: 12 }}>
                        {c.precioAplicado ? <span style={{ color: C.green, fontWeight: 700 }}>{fmtCOP(c.precioAplicado.valor)} → {c.precioAplicado.destino}</span> : c.vinculo ? <span style={{ color: C.slate }}>Vinculado: {etiquetaVinculo(c.vinculo, protos, capsulas)}</span> : <span style={{ color: C.slate }}>—</span>}
                      </td>
                      <td style={{ ...td, paddingRight: 12 }}><AccionesCotizacion c={c} onEditar={(x) => setEdit({ ...limpio(x), existe: true })} onBorrar={pedirBorrar} puedeBorrar={puedeBorrar} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {importar && <ModalImportar cotizaciones={cotizaciones} parametros={parametros} clientes={clientesApp} onImportar={importarHojas} onClose={() => setImportar(false)} />}
      </>
      )}
      </div>
      <style>{`@media (max-width: 900px) { .cotz-root { flex-direction: column !important; } .cotz-side { width: auto !important; height: auto !important; position: static !important; } .cotz-sp { display: none; } }`}</style>
    </div>
  );
}
