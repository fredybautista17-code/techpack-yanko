// ─── COMBINACIONES DE LA PRENDA · imágenes de la referencia + dibujo plano pintable ──────────────────────────────
// (2026-11-26, a pedido de Fredy)
//   · Cada referencia lleva 2 imágenes: 1) la FICHA con los datos y telas, 2) el DIBUJO PLANO (blanco = Material 1, lila = Material 2, gris = Material 3).
//     Se suben desde la cápsula/prototipo o desde la propia Ficha de inicio (referencias de reprogramación que no están en ATLAS) y quedan guardadas por referencia.
//   · VERIFICADOR: sin dibujo plano no se puede avanzar del paso «Colores»; si el dibujo no tiene zonas de color se avisa.
//   · Editor: se toca una zona o un material, se escoge el color de la biblioteca (con su hex) y el dibujo se pinta solo. Cada fila = un color de la prenda con el
//     color de cada material; de ahí salen los colores de la ficha y el paso «Combinaciones» del semáforo.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getApps } from "firebase/app";
import { collection, doc, getFirestore, onSnapshot, setDoc } from "firebase/firestore";
import { COL_FICHA, COL_COLORES, idFicha, completarFicha, esHex, normHex, snapshotColor, plano } from "./ficha-inicio-calculo";
import { COL_PRENDAS, idPrenda, MATERIALES, telasSugeridas, detectarZonas, verificarDibujo, pintarZonas, zonaEnPunto, recortarContenido, filaVacia, filaCompleta, nombreFila, coloresDeFilas } from "./combinaciones-prenda";
import { C, inp, Boton, Chip, Ventana, Cuadrito } from "./ficha-ui";

const dbDe = () => getFirestore(getApps()[0]);
const uid = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const limpiar = (x) => JSON.parse(JSON.stringify(x));

// ── Lee las imágenes guardadas de una referencia (null = todavía no hay nada) ──
export function usePrenda(referencia) {
  const [prenda, setPrenda] = useState(undefined);
  const id = idPrenda(referencia);
  useEffect(() => {
    if (!id) { setPrenda(null); return undefined; }
    setPrenda(undefined);
    return onSnapshot(doc(dbDe(), COL_PRENDAS, id), (s) => setPrenda(s.exists() ? s.data() : null), () => setPrenda(null));
  }, [id]);
  return prenda;
}

// ── Achica la foto en el navegador (JPEG) para que quepa en la base de datos ──
export function comprimirImagen(file, max, calidad, tope = 430000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > max || h > max) { if (w > h) { h = Math.round((h * max) / w); w = max; } else { w = Math.round((w * max) / h); h = max; } }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const cx = cv.getContext("2d");
      cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); // los PNG con fondo transparente quedan en blanco
      cx.drawImage(img, 0, 0, w, h);
      let q = calidad, out = cv.toDataURL("image/jpeg", q);
      while (out.length > tope && q > 0.4) { q -= 0.08; out = cv.toDataURL("image/jpeg", q); }
      if (out.length > tope) reject(new Error("La imagen es demasiado pesada; prueba con una más pequeña."));
      else resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No pude abrir esa imagen.")); };
    img.src = url;
  });
}

const RANURAS = [
  { campo: "fichaImg", titulo: "1 · Ficha con los datos", ayuda: "Foto o imagen con las telas, medidas y detalles de la referencia.", max: 1100, q: 0.78 },
  { campo: "planoImg", titulo: "2 · Dibujo plano", ayuda: "Dibujo de la prenda en blanco, lila y gris (Material 1, 2 y 3).", max: 1400, q: 0.88, obligatorio: true },
];

// ── Las dos imágenes de la referencia: se suben, se cambian y se quitan ──
export function ImagenesReferencia({ referencia, prenda, puedeEditar, usuario, compacto }) {
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState("");
  const id = idPrenda(referencia);
  async function subir(r, e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !id) return;
    setError(""); setSubiendo(r.campo);
    try {
      const img = await comprimirImagen(file, r.max, r.q);
      await setDoc(doc(dbDe(), COL_PRENDAS, id), { referencia: String(referencia || ""), [r.campo]: img, [`${r.campo}Por`]: usuario || "", [`${r.campo}En`]: new Date().toISOString() }, { merge: true });
    } catch (err) { setError(err.message || String(err)); }
    setSubiendo("");
  }
  async function quitar(r) {
    if (!id) return;
    setError("");
    try { await setDoc(doc(dbDe(), COL_PRENDAS, id), { [r.campo]: null, [`${r.campo}Por`]: usuario || "", [`${r.campo}En`]: new Date().toISOString() }, { merge: true }); }
    catch (err) { setError(err.message || String(err)); }
  }
  if (!id) return <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700 }}>Escribe el código de la referencia para poder guardar sus imágenes.</div>;
  return (
    <div data-testid="imagenes-referencia">
      <div style={{ display: "grid", gridTemplateColumns: compacto ? "1fr 1fr" : "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {RANURAS.map((r) => {
          const src = prenda && prenda[r.campo];
          return (
            <div key={r.campo} style={{ border: `1.5px ${src ? "solid" : "dashed"} ${src ? C.border : C.grey}`, borderRadius: 14, padding: 10, background: C.white }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: C.ink }}>{r.titulo}{r.obligatorio && !src ? <span style={{ color: C.red }}> · obligatorio</span> : null}</div>
              {!compacto && <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, margin: "2px 0 8px" }}>{r.ayuda}</div>}
              <div style={{ background: C.canvas, borderRadius: 10, minHeight: compacto ? 90 : 130, display: "grid", placeItems: "center", overflow: "hidden", margin: compacto ? "6px 0" : 0 }}>
                {src ? <img src={src} alt={r.titulo} style={{ width: "100%", maxHeight: compacto ? 140 : 220, objectFit: "contain", display: "block" }} /> : <span style={{ fontSize: 12, color: C.slate, fontWeight: 700 }}>{subiendo === r.campo ? "Subiendo…" : "Sin imagen"}</span>}
              </div>
              {puedeEditar && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                  <label style={{ cursor: "pointer" }}>
                    <input data-testid={`subir-${r.campo}`} type="file" accept="image/*" onChange={(e) => subir(r, e)} style={{ display: "none" }} />
                    <span style={{ background: C.ink, color: C.white, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, display: "inline-block" }}>{src ? "Cambiar" : "Subir imagen"}</span>
                  </label>
                  {src && <Boton small tipo="rojo" onClick={() => quitar(r)}>Quitar</Boton>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// ── Tarjeta lista para la cápsula / el prototipo (se conecta sola a la referencia) ──
export function ImagenesReferenciaTarjeta({ referencia, puedeEditar, usuario }) {
  const prenda = usePrenda(referencia);
  return (
    <div style={{ marginBottom: 16, padding: "12px 14px", background: "#FAF8F4", border: "1px solid #E8E2DB", borderRadius: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 2 }}>🖼 Imágenes de la referencia para la Ficha de inicio</div>
      <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, marginBottom: 8 }}>Se guardan por referencia ({referencia || "sin código"}). Sin el dibujo plano la ficha no deja avanzar al paso Colores.</div>
      <ImagenesReferencia referencia={referencia} prenda={prenda === undefined ? null : prenda} puedeEditar={puedeEditar} usuario={usuario} compacto />
    </div>
  );
}

// ── Editor de combinaciones ──
export function EditorCombinaciones({ f, set, colores, prenda, item, puedeEditar, usuario, onBiblioteca }) {
  const referencia = (item && item.referencia) || f.referencia || "";
  const cv = useRef(null);
  const base = useRef(null); // píxeles originales del dibujo recortado
  const [det, setDet] = useState(null);
  const [errImg, setErrImg] = useState("");
  const [foco, setFoco] = useState(0);
  const [activa, setActiva] = useState(null);
  const [q, setQ] = useState("");
  const [soloHex, setSoloHex] = useState(true);
  const [cambiarDib, setCambiarDib] = useState(false);
  const comb = f.combinaciones || { activos: [0], filas: [] };
  const filas = comb.filas || [];
  const planoImg = prenda && prenda.planoImg;

  // Detecta las zonas cada vez que cambia el dibujo plano
  useEffect(() => {
    setDet(null); setErrImg("");
    if (!planoImg) return undefined;
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      if (!vivo) return;
      const c0 = document.createElement("canvas");
      c0.width = img.width; c0.height = img.height;
      const x0 = c0.getContext("2d", { willReadFrequently: true });
      x0.drawImage(img, 0, 0);
      const full = x0.getImageData(0, 0, img.width, img.height);
      const r = recortarContenido(full.data, img.width, img.height);
      const recorte = x0.getImageData(r.x, r.y, r.w, r.h);
      base.current = recorte;
      setDet(detectarZonas(recorte.data, r.w, r.h));
    };
    img.onerror = () => { if (vivo) setErrImg("No pude abrir el dibujo plano guardado. Sube otro."); };
    img.src = planoImg;
    return () => { vivo = false; };
  }, [planoImg]);

  const ver = useMemo(() => (det ? verificarDibujo(det) : null), [det]);
  const activos = ver ? ver.activos : (comb.activos || [0]);

  // Guarda en la ficha los materiales detectados (de ahí sale el estado del semáforo)
  useEffect(() => {
    if (!ver || !ver.ok) return;
    if (JSON.stringify(comb.activos || []) !== JSON.stringify(ver.activos)) set({ combinaciones: { ...comb, activos: ver.activos, filas } });
  }, [ver]); // eslint-disable-line

  const fila = filas.find((x) => x.id === activa) || filas[0] || null;
  const hexesFila = fila ? [0, 1, 2].map((i) => (fila.m[i] && esHex(fila.m[i].hex) ? normHex(fila.m[i].hex) : null)) : [null, null, null];

  // Pinta el dibujo
  useEffect(() => {
    if (!det || !base.current || !cv.current) return;
    const c = cv.current;
    c.width = det.w; c.height = det.h;
    const out = pintarZonas(base.current.data, det, hexesFila, foco);
    c.getContext("2d").putImageData(new ImageData(out, det.w, det.h), 0, 0);
  }, [det, foco, fila && fila.id, JSON.stringify(hexesFila)]); // eslint-disable-line

  const guardarFilas = (nuevas) => set({ combinaciones: { activos, filas: nuevas }, colores: coloresDeFilas(nuevas, activos) });
  const telas = useMemo(() => telasSugeridas(`${f.datos.tela || ""},${(item && item.tela) || ""}`), [f.datos.tela, item]);
  const telaDe = (i) => (prenda && prenda.materiales && prenda.materiales[i]) || (telas[i === 0 ? 0 : 1] || telas[0] || "");
  async function elegirTela(i, valor) {
    const id = idPrenda(referencia);
    if (!id || !puedeEditar) return;
    const mats = [0, 1, 2].map(telaDe); mats[i] = valor;
    await setDoc(doc(dbDe(), COL_PRENDAS, id), { referencia: String(referencia || ""), materiales: mats }, { merge: true });
  }

  const primerActivo = activos[0] ?? 0;
  const agregarFila = () => { const nf = filaVacia(uid()); guardarFilas([...filas, nf]); setActiva(nf.id); setFoco(primerActivo); };
  const quitarFila = (id) => { const r = filas.filter((x) => x.id !== id); guardarFilas(r); if (activa === id) setActiva(null); };
  const elegirColor = (c) => {
    if (!puedeEditar) return;
    let objetivo = fila;
    let lista = filas;
    if (!objetivo) { objetivo = filaVacia(uid()); lista = [objetivo]; }
    const nuevo = { ...objetivo, m: objetivo.m.map((x, i) => (i === foco ? snapshotColor(c) : x)) };
    guardarFilas(lista.map((x) => (x.id === nuevo.id ? nuevo : x)).concat(lista.some((x) => x.id === nuevo.id) ? [] : [nuevo]));
    setActiva(nuevo.id);
    const sig = activos[activos.indexOf(foco) + 1];
    if (sig !== undefined) setFoco(sig);
  };
  const importarViejos = () => {
    const nuevas = (f.colores || []).map((c) => { const fl = filaVacia(uid()); fl.m[primerActivo] = c; return fl; });
    guardarFilas([...filas, ...nuevas]);
  };
  const clic = (e) => {
    if (!det || !cv.current) return;
    const r = cv.current.getBoundingClientRect();
    const z = zonaEnPunto(det, Math.floor(((e.clientX - r.left) / r.width) * det.w), Math.floor(((e.clientY - r.top) / r.height) * det.h));
    if (z >= 0 && activos.includes(z)) setFoco(z);
  };

  const lista = useMemo(() => {
    const t = plano(q);
    return (colores || [])
      .filter((c) => (!soloHex || esHex(c.hex)) && (!t || plano(`${c.nombre} ${c.codBusint || ""} ${c.pantone || ""} ${c.codProveedor || ""}`).includes(t)))
      .sort((a, b) => (esHex(b.hex) ? 1 : 0) - (esHex(a.hex) ? 1 : 0) || String(a.nombre).localeCompare(String(b.nombre), "es", { numeric: true }));
  }, [colores, q, soloHex]);
  const conHex = (colores || []).filter((c) => esHex(c.hex)).length;
  const completas = filas.filter((x) => filaCompleta(x, activos)).length;

  // ── Verificador: sin dibujo plano no se avanza ──
  if (prenda === undefined) return <div style={{ padding: 14, color: C.slate }}>Cargando la referencia…</div>;
  if (!planoImg || cambiarDib) {
    return (
      <div data-testid="verificador-sin-dibujo">
        {!planoImg && (
          <div style={{ background: C.amberBg, border: `1px solid ${C.amberLine}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: C.amber, fontSize: 14 }}>Falta el dibujo plano de la referencia {referencia || ""}</div>
            <div style={{ fontSize: 13, color: C.ink, marginTop: 4, lineHeight: 1.5 }}>Sin el dibujo plano no se pueden asignar los materiales ni los colores de la prenda, y la ficha no deja avanzar. Súbelo aquí (queda guardado para esta referencia) o en la cápsula / prototipo.</div>
          </div>
        )}
        <ImagenesReferencia referencia={referencia} prenda={prenda} puedeEditar={puedeEditar} usuario={usuario} />
        {planoImg && <div style={{ marginTop: 10 }}><Boton onClick={() => setCambiarDib(false)}>← Volver a las combinaciones</Boton></div>}
        {!puedeEditar && !planoImg && <p style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>Para subir imágenes necesitas el permiso «Ficha de inicio» en Roles.</p>}
      </div>
    );
  }
  return (
    <div data-testid="editor-combinaciones">
      {errImg && <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{errImg}</div>}
      {ver && ver.avisos.length > 0 && (
        <div data-testid="aviso-dibujo" style={{ background: ver.ok ? C.amberBg : C.redBg, border: `1px solid ${ver.ok ? C.amberLine : C.red}`, borderRadius: 12, padding: "9px 12px", marginBottom: 10, fontSize: 13, lineHeight: 1.5 }}>
          <b>{ver.ok ? "Revisa el dibujo plano:" : "Este dibujo no sirve todavía:"}</b> {ver.avisos.join(" ")}
          <div style={{ marginTop: 6 }}><Boton small onClick={() => setCambiarDib(true)}>Cambiar el dibujo plano</Boton></div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 6 }}>
            <canvas ref={cv} data-testid="dibujo-prenda" onClick={clic} style={{ width: "100%", height: "auto", display: "block", cursor: "pointer", borderRadius: 10 }} />
            {!det && !errImg && <div style={{ padding: 20, textAlign: "center", color: C.slate, fontWeight: 600 }}>Leyendo el dibujo…</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MATERIALES.map((m, i) => {
              if (!activos.includes(i)) return null;
              const col = fila && fila.m[i];
              const tela = telaDe(i);
              return (
                <div key={m.n} data-testid={`material-${m.n}`} onClick={() => setFoco(i)} role="button" style={{ flex: "1 1 150px", border: `2px solid ${foco === i ? C.ink : C.border}`, background: C.white, borderRadius: 12, padding: "8px 10px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 13 }}><Cuadrito hex={col && col.hex} tam={20} />{m.nombre}<span style={{ fontWeight: 600, fontSize: 11, color: C.slate }}>{det ? `${det.pct[i].toFixed(0)}%` : ""}</span></div>
                  <div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, margin: "2px 0 4px" }}>{m.color} del dibujo · {col ? col.nombre : "sin color"}</div>
                  {puedeEditar ? (
                    <select value={tela} onClick={(e) => e.stopPropagation()} onChange={(e) => elegirTela(i, e.target.value)} style={{ ...inp, padding: "4px 6px", fontSize: 12 }} aria-label={`Tela del ${m.nombre}`}>
                      {[...new Set([tela, ...telas].filter(Boolean))].map((t) => <option key={t} value={t}>{t}</option>)}
                      {!tela && !telas.length && <option value="">Tela…</option>}
                    </select>
                  ) : <span style={{ fontSize: 12, fontWeight: 800, color: C.blue }}>{tela || "—"}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800, color: C.slate }}>Colores de la prenda</div>
            <button type="button" onClick={() => setCambiarDib(true)} style={{ border: "none", background: "transparent", color: C.blue, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>🖼 Imágenes de la referencia</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto" }}>
            {filas.map((x, k) => (
              <div key={x.id} data-testid="fila-combinacion" onClick={() => { setActiva(x.id); }} role="button" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: `2px solid ${fila && fila.id === x.id ? C.ink : C.border}`, background: C.white, borderRadius: 12, cursor: "pointer" }}>
                <b style={{ fontSize: 12.5, color: C.slate, minWidth: 22 }}>{k + 1}</b>
                <span style={{ display: "flex" }}>{[0, 1, 2].filter((i) => activos.includes(i)).map((i) => <span key={i} style={{ marginRight: -6 }}><Cuadrito hex={x.m[i] && x.m[i].hex} tam={26} /></span>)}</span>
                <span style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombreFila(x, activos)}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: filaCompleta(x, activos) ? C.green : C.amber }}>{filaCompleta(x, activos) ? "Completo" : "Faltan colores"}</div>
                </span>
                {puedeEditar && <button type="button" aria-label="Quitar este color" onClick={(e) => { e.stopPropagation(); quitarFila(x.id); }} style={{ border: "none", background: "transparent", color: C.slate, fontSize: 18, cursor: "pointer" }}>×</button>}
              </div>
            ))}
            {!filas.length && <div style={{ fontSize: 12.5, color: C.slate, fontStyle: "italic", padding: "6px 2px" }}>Todavía no hay colores: escoge uno de la biblioteca o agrega una fila.</div>}
          </div>
          {puedeEditar && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" data-testid="agregar-fila" onClick={agregarFila} style={{ border: "1.5px dashed #c9c1b4", background: C.white, borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>+ Agregar color de la prenda</button>
              {!!(f.colores || []).length && !filas.length && <Boton small onClick={importarViejos}>Pasar los {f.colores.length} colores que ya tenía la ficha</Boton>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800, color: C.slate }}>Escoge el color de <span style={{ color: C.ink }}>{MATERIALES[foco].nombre} · {telaDe(foco) || MATERIALES[foco].color}</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...inp, flex: 1, minWidth: 160 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Nombre, código Busint o Pantone" />
            <Chip activo={soloHex} onClick={() => setSoloHex(true)}>Con color</Chip>
            <Chip activo={!soloHex} onClick={() => setSoloHex(false)}>Todos</Chip>
          </div>
          <div data-testid="selector-colores" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(124px,1fr))", gap: 10, maxHeight: 430, overflow: "auto", padding: 2 }}>
            {lista.slice(0, 150).map((c) => {
              const ok = esHex(c.hex);
              const sel = fila && fila.m[foco] && fila.m[foco].id === c.id;
              return (
                <button key={c.id} type="button" disabled={!ok || !puedeEditar} onClick={() => elegirColor(c)} title={ok ? c.nombre : "Este color todavía no tiene hex en la biblioteca"} style={{ border: `2px solid ${sel ? C.ink : C.border}`, borderRadius: 14, overflow: "hidden", background: C.white, cursor: ok && puedeEditar ? "pointer" : "not-allowed", opacity: ok ? 1 : 0.55, padding: 0, textAlign: "left", fontFamily: "inherit", color: C.ink }}>
                  <div style={{ height: 56, borderBottom: "1px solid rgba(0,0,0,.08)", background: ok ? normHex(c.hex) : "repeating-linear-gradient(45deg,#F2EEE6,#F2EEE6 6px,#fff 6px,#fff 12px)" }} />
                  <div style={{ padding: "6px 8px" }}>
                    <div style={{ fontWeight: 800, fontSize: 12, lineHeight: 1.2 }}>{c.nombre}</div>
                    <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 600, marginTop: 2 }}>Busint {c.codBusint || "—"}{c.pantone ? ` · ${c.pantone}` : ""}</div>
                    {ok ? <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 600 }}>{normHex(c.hex)}</div> : <span style={{ display: "inline-block", marginTop: 3, fontSize: 10, fontWeight: 800, background: C.amberBg, color: C.amber, borderRadius: 10, padding: "1px 7px" }}>Sin hex</span>}
                  </div>
                </button>
              );
            })}
            {!lista.length && <div style={{ gridColumn: "1/-1", fontSize: 12.5, color: C.slate, fontStyle: "italic" }}>{conHex ? "Sin resultados con ese filtro." : "Ningún color tiene hex todavía: sube el Excel con 📤 Subir hex y Pantone en la biblioteca."}</div>}
          </div>
          <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, lineHeight: 1.5 }}>Solo se pintan los colores que ya tienen su hex en la biblioteca ({conHex} de {(colores || []).length}). {onBiblioteca && <button type="button" onClick={onBiblioteca} style={{ border: "none", background: "transparent", color: C.blue, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0 }}>📚 Abrir la biblioteca</button>}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: filas.length && completas === filas.length ? C.green : C.slate }}>{filas.length ? `${completas} de ${filas.length} colores con su combinación completa` : "Agrega al menos un color de la prenda."}</div>
    </div>
  );
}

// ── Ventana del semáforo: abre las combinaciones de una referencia ──
export function VentanaCombinaciones({ preorden, item, guardada, onClose, puedeEditar, usuario }) {
  const db = useMemo(dbDe, []);
  const [colores, setColores] = useState(null);
  const [f, setF] = useState(() => completarFicha(guardada, item, preorden));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const prenda = usePrenda(item.referencia);
  useEffect(() => onSnapshot(collection(db, COL_COLORES), (s) => setColores(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => setColores([])), [db]);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  async function guardar() {
    setGuardando(true); setError("");
    try {
      await setDoc(doc(db, COL_FICHA, idFicha(preorden.id, item.itemId)), limpiar({ preordenId: preorden.id, itemId: item.itemId, referencia: item.referencia || "", combinaciones: f.combinaciones || null, colores: f.colores || [], actualizadoPor: usuario || "", actualizadoEn: new Date().toISOString() }), { merge: true });
      onClose();
    } catch (e) { setError(e?.message || String(e)); }
    setGuardando(false);
  }
  return (
    <Ventana titulo={`Combinaciones · ${item.referencia || ""}${item.nombre ? ` — ${item.nombre}` : ""}`} onClose={onClose} ancho={1040}>
      <EditorCombinaciones f={f} set={set} colores={colores || []} prenda={prenda} item={item} puedeEditar={puedeEditar} usuario={usuario} />
      {error && <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>No se pudo guardar: {error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <Boton onClick={onClose}>{puedeEditar ? "Cancelar" : "Cerrar"}</Boton>
        {puedeEditar && <Boton tipo="ok" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar combinaciones"}</Boton>}
      </div>
    </Ventana>
  );
}
