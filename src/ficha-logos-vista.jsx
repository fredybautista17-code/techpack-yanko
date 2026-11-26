// ─── LOGOS · subir fotos de logos/vinilos: el navegador lee el texto de la foto y arma nombre, código y tipo ──────
// (2026-11-26, a pedido de Fredy) Igual que en colores: se suben varias fotos de una vez, se ve una vista previa con lo que se leyó (se puede corregir)
// y al aplicar se crean los logos con su miniatura en la biblioteca «Vinilos y logos». Lo que ya existe (mismo nombre o código) no se duplica ni se pisa.
// La lectura del texto (OCR, tesseract.js) corre en el navegador y se baja de internet la primera vez que se usa.
import React, { useMemo, useRef, useState } from "react";
import { collection, doc, writeBatch } from "firebase/firestore";
import { COL_VINILOS, TIPOS_VINILO } from "./ficha-inicio-calculo";
import { interpretarTextoLogo, planLogos, tipoValido } from "./ficha-logos";
import { comprimirImagen } from "./combinaciones-prenda-vista";
import { C, inp, Boton, Ventana } from "./ficha-ui";

const URL_OCR = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let promesaOcr = null;
function cargarTesseract() {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador"));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!promesaOcr) {
    promesaOcr = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = URL_OCR;
      s.async = true;
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("No cargó el lector de texto")));
      s.onerror = () => { promesaOcr = null; reject(new Error("No pude bajar el lector de texto (se necesita internet)")); };
      document.head.appendChild(s);
    });
  }
  return promesaOcr;
}

// Foto → lienzo más grande y en escala de grises (el OCR lee mejor letra pequeña así)
function prepararParaLeer(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const objetivo = Math.max(1400, Math.min(2200, img.width));
      const k = objetivo / img.width;
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const cx = cv.getContext("2d");
      cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
      cx.filter = "grayscale(1) contrast(1.25)";
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      resolve(cv);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No pude abrir esa imagen.")); };
    img.src = url;
  });
}

// Miniatura del logo (como el cuadrito del color)
export function Miniatura({ src, tam = 40, titulo }) {
  const caja = { width: tam, height: tam, borderRadius: Math.round(tam * 0.22), border: `1px solid ${C.border}`, background: C.white, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", verticalAlign: "middle" };
  return src
    ? <span title={titulo} style={caja}><img src={src} alt={titulo || "Logo"} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></span>
    : <span title="Sin foto todavía" style={{ ...caja, background: C.canvas, color: C.slate, fontSize: Math.round(tam * 0.42) }}>🏷</span>;
}

// En la fila en edición de la biblioteca: cambiar o quitar la foto del logo
export function CambiarFotoLogo({ imagen, onChange, onError }) {
  async function elegir(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try { onChange(await comprimirImagen(f, 420, 0.82, 90000)); } catch (err) { if (onError) onError(err.message || String(err)); }
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <Miniatura src={imagen} />
      <label style={{ cursor: "pointer" }}>
        <input data-testid="cambiar-foto-logo" type="file" accept="image/*" onChange={elegir} style={{ display: "none" }} />
        <span style={{ background: "#ECE6DC", color: C.ink, borderRadius: 8, padding: "5px 9px", fontWeight: 700, fontSize: 12 }}>{imagen ? "Cambiar" : "Subir"}</span>
      </label>
      {imagen && <button type="button" onClick={() => onChange("")} style={{ border: "none", background: C.redBg, color: C.red, borderRadius: 8, padding: "5px 9px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Quitar</button>}
    </span>
  );
}

export default function SubirLogos({ vinilos, db, usuario, onClose }) {
  const [items, setItems] = useState([]);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState("");
  const consecutivo = useRef(0);

  const plan = useMemo(() => {
    const p = planLogos(vinilos || [], items);
    return p;
  }, [items, vinilos]);
  const set = (key, cambios) => setItems((prev) => prev.map((x) => (x.key === key ? { ...x, ...cambios } : x)));
  const quitar = (key) => setItems((prev) => prev.filter((x) => x.key !== key));

  async function leer(e) {
    const archivos = Array.from((e.target.files) || []);
    e.target.value = "";
    if (!archivos.length) return;
    setError(""); setAviso(""); setHecho(""); setLeyendo(true);
    let worker = null;
    let ocrOk = true;
    try {
      setProgreso("Preparando el lector de texto…");
      const T = await cargarTesseract();
      worker = await T.createWorker("spa");
    } catch (err) {
      ocrOk = false;
      setAviso(`${err.message || err}. Se usó el nombre del archivo como nombre del logo; corrígelo aquí abajo.`);
    }
    for (let i = 0; i < archivos.length; i++) {
      const file = archivos[i];
      setProgreso(`Leyendo foto ${i + 1} de ${archivos.length}…`);
      const key = `l${++consecutivo.current}`;
      try {
        const imagen = await comprimirImagen(file, 420, 0.82, 90000);
        let texto = "";
        if (ocrOk && worker) {
          try {
            const cv = await prepararParaLeer(file);
            const r = await worker.recognize(cv);
            texto = (r && r.data && r.data.text) || "";
          } catch (_) { texto = ""; }
        }
        const lec = interpretarTextoLogo(texto, file.name);
        setItems((prev) => [...prev, { key, archivo: file.name, imagen, texto, nombre: lec.nombre, codigo: lec.codigo, tipo: tipoValido(lec.tipo), tipoLeido: !!lec.tipo, deArchivo: lec.deArchivo, incluir: true }]);
      } catch (err) {
        setError(`«${file.name}»: ${err.message || err}`);
      }
    }
    try { if (worker) await worker.terminate(); } catch (_) { /* nada */ }
    setProgreso(""); setLeyendo(false);
  }

  // Qué se va a guardar: logos nuevos, y la foto para logos que ya existían sin foto
  const aCrear = plan.filter((x) => x.incluir && x.estado === "nuevo");
  const aFoto = plan.filter((x) => x.incluir && x.estado === "existe" && x.dup && !x.dup.imagen);

  async function aplicar() {
    if (guardando || (!aCrear.length && !aFoto.length)) return;
    setGuardando(true); setError("");
    try {
      const ahora = new Date().toISOString();
      const ops = [];
      aCrear.forEach((x) => ops.push((b) => b.set(doc(collection(db, COL_VINILOS)), { nombre: x.nombre.trim(), codigo: (x.codigo || "").trim(), tipo: tipoValido(x.tipo), imagen: x.imagen, creadoEn: ahora, creadoPor: usuario || "", origenFoto: true })));
      aFoto.forEach((x) => ops.push((b) => b.set(doc(db, COL_VINILOS, x.dup.id), { imagen: x.imagen, actualizadoEn: ahora }, { merge: true })));
      for (let i = 0; i < ops.length; i += 100) {
        const lote = writeBatch(db);
        ops.slice(i, i + 100).forEach((op) => op(lote));
        await lote.commit();
      }
      setHecho(`Listo: ${aCrear.length} ${aCrear.length === 1 ? "logo creado" : "logos creados"}${aFoto.length ? ` y ${aFoto.length} ${aFoto.length === 1 ? "foto agregada" : "fotos agregadas"} a logos que ya existían` : ""}.`);
      setItems([]);
    } catch (err) { setError(`No se pudo guardar: ${err.message || err}`); }
    setGuardando(false);
  }

  const etiqueta = (x) => {
    if (x.estado === "sinNombre") return <span style={{ color: C.red, fontWeight: 700 }}>Falta el nombre</span>;
    if (x.estado === "repetidoLote") return <span style={{ color: C.amber, fontWeight: 700 }}>Repetido en esta tanda: no se crea</span>;
    if (x.estado === "existe") return x.dup && !x.dup.imagen
      ? <span style={{ color: C.amber, fontWeight: 700 }}>Ya existe «{x.dup.nombre}» sin foto: se le agrega esta foto</span>
      : <span style={{ color: C.amber, fontWeight: 700 }}>Ya existe «{x.dup.nombre}» con foto: no se toca</span>;
    return <span style={{ color: C.green, fontWeight: 700 }}>Nuevo</span>;
  };
  const habilitado = (x) => x.estado === "nuevo" || (x.estado === "existe" && x.dup && !x.dup.imagen);
  const tarjeta = (n, t, bg, col) => <div style={{ background: bg, borderRadius: 12, padding: "10px 12px" }}><div style={{ fontSize: 24, fontWeight: 800, color: col || C.ink, letterSpacing: -0.5 }}>{n}</div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.slate }}>{t}</div></div>;

  return (
    <Ventana titulo="📤 Subir logos desde foto" onClose={onClose} ancho={860}>
      <p style={{ fontSize: 13, color: C.slate, fontWeight: 600, lineHeight: 1.5, margin: "0 0 12px" }}>Escoge las fotos de los logos (una o varias). ATLAS lee el texto de cada foto para sacar el <b>nombre</b>, el <b>código</b> y el <b>tipo</b>; revisa lo leído, corrige lo que haga falta y aplica. Lo que ya existe no se duplica.</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ cursor: leyendo ? "wait" : "pointer" }}>
          <input data-testid="archivos-logos" type="file" accept="image/*" multiple disabled={leyendo} onChange={leer} style={{ display: "none" }} />
          <span style={{ background: C.ink, color: C.white, borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, display: "inline-block", opacity: leyendo ? 0.6 : 1 }}>{items.length ? "Agregar más fotos" : "Escoger las fotos"}</span>
        </label>
        {progreso && <span data-testid="progreso-logos" style={{ fontSize: 12.5, color: C.slate, fontWeight: 600 }}>⏳ {progreso}</span>}
      </div>
      {error && <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{error}</div>}
      {aviso && <div data-testid="aviso-logos" style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{aviso}</div>}
      {hecho && <div style={{ background: C.greenBg, color: C.green, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>✔ {hecho}</div>}
      {plan.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
            {tarjeta(aCrear.length, "Logos nuevos", C.greenBg, C.green)}
            {tarjeta(aFoto.length, "Fotos para logos existentes", C.amberBg, C.amber)}
            {tarjeta(plan.length - aCrear.length - aFoto.length, "No se guardan", C.greyBg)}
          </div>
          <div style={{ maxHeight: 360, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10 }}>
            {plan.map((x) => (
              <div key={x.key} data-testid="fila-logo-foto" style={{ display: "grid", gridTemplateColumns: "auto 56px 1.4fr .8fr .9fr auto", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, opacity: x.incluir ? 1 : 0.5 }}>
                <input type="checkbox" aria-label="Incluir" checked={x.incluir && habilitado(x)} disabled={!habilitado(x)} onChange={(e) => set(x.key, { incluir: e.target.checked })} />
                <Miniatura src={x.imagen} tam={52} titulo={x.archivo} />
                <div style={{ minWidth: 0 }}>
                  <input style={inp} value={x.nombre} onChange={(e) => set(x.key, { nombre: e.target.value, deArchivo: false })} placeholder="Nombre del logo" aria-label="Nombre" />
                  <div style={{ fontSize: 11.5, marginTop: 3 }}>{etiqueta(x)}{x.deArchivo && <span style={{ color: C.slate, fontWeight: 600 }}> · no leí texto: puse el nombre del archivo</span>}</div>
                </div>
                <input style={inp} value={x.codigo} onChange={(e) => set(x.key, { codigo: e.target.value })} placeholder="Código" aria-label="Código" />
                <select style={inp} value={x.tipo} onChange={(e) => set(x.key, { tipo: e.target.value })} aria-label="Tipo">{TIPOS_VINILO.map((t) => <option key={t}>{t}</option>)}</select>
                <button type="button" onClick={() => quitar(x.key)} title="Quitar de la lista" style={{ border: "none", background: C.redBg, color: C.red, borderRadius: 8, padding: "6px 9px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
                {x.texto && x.texto.trim() && (
                  <details style={{ gridColumn: "2 / -1", fontSize: 11.5, color: C.slate }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>Texto leído en la foto</summary>
                    <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", fontFamily: "inherit" }}>{x.texto.trim()}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Boton onClick={onClose}>Cancelar</Boton>
            <Boton tipo="ok" onClick={aplicar} disabled={guardando || leyendo || (!aCrear.length && !aFoto.length)}>{guardando ? "Guardando…" : `✔ Aplicar (${aCrear.length + aFoto.length})`}</Boton>
          </div>
        </>
      )}
      {!plan.length && !hecho && !leyendo && <p style={{ fontSize: 12.5, color: C.slate, fontStyle: "italic" }}>Todavía no has escogido fotos.</p>}
      {hecho && <div style={{ marginTop: 6 }}><Boton onClick={onClose}>Cerrar</Boton></div>}
    </Ventana>
  );
}
