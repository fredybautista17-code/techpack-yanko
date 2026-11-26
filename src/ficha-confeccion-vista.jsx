// ─── FICHA DE CONFECCIÓN · pestaña del detalle de prototipos y referencias de cápsula ───────────────────────────
// (2026-11-26, a pedido de Fredy) «Proceso operativo de muestra»: encabezado automático, tabla de operaciones, observaciones y Excel con el mismo formato.
// Se escribe en un borrador y se guarda con el botón (o solo al salir de la pestaña si quedaron cambios). Quien no puede editar la ve en solo lectura.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FILAS_MINIMAS_EXCEL, aBorrador, aGuardar, hayCambios, opVacia, totalMinutos, contarOperaciones, tiposDeMaquina, fmtMin, parseNum,
  sugerencias, itemsConFicha, encabezadoFicha, nombreArchivoFicha,
} from "./ficha-confeccion";

// ── Excel con el mismo orden y títulos del formato «Proceso operativo de muestra» ──
export async function exportarFichaConfeccion(item, kind, capsula, borrador) {
  const XLSX = await import("xlsx-js-style");
  const enc = encabezadoFicha(item, kind, capsula);
  const ops = aGuardar(borrador, "", "").operaciones;
  const nFilas = Math.max(FILAS_MINIMAS_EXCEL, ops.length);
  const total = totalMinutos(ops);
  const NC = 11; // columnas A..K
  const filas = [];
  const merges = [];
  const R = {}; // fila de cada bloque
  const vacia = () => Array(NC).fill("");
  const fila = (celdas) => { const f = vacia(); Object.keys(celdas).forEach((c) => { f[c] = celdas[c]; }); filas.push(f); return filas.length - 1; };
  const unir = (r, c1, r2, c2) => merges.push({ s: { r, c: c1 }, e: { r: r2, c: c2 } });

  R.titulo = fila({ 0: "PROCESO OPERATIVO DE MUESTRA" }); unir(R.titulo, 0, R.titulo, 10);
  R.capLbl = fila({ 0: "CAPSULA:" }); unir(R.capLbl, 0, R.capLbl, 10);
  R.cap = fila({ 0: enc.capsula || "—" }); fila({}); fila({}); unir(R.cap, 0, R.cap + 2, 10);
  R.fecha = fila({ 0: `FECHA DE CREACIÓN DE COLECCION: ${enc.fechaColeccion || "—"}` }); unir(R.fecha, 0, R.fecha, 10);
  R.cat = fila({ 0: "CATEGORÍA:", 3: enc.categoria || "—", 5: "TALLA:", 6: enc.talla || "—", 8: "SILUETA:", 9: enc.silueta || "—", 10: `TEXTIL: ${enc.textil || "—"}` });
  unir(R.cat, 0, R.cat, 2); unir(R.cat, 3, R.cat, 4); unir(R.cat, 6, R.cat, 7);
  R.pro = fila({ 0: "PROTOTIPO No:", 3: enc.prototipo || "—", 5: "REFERENCIA", 6: enc.referencia || "—", 8: "BASE:", 9: enc.base || "—" });
  unir(R.pro, 0, R.pro, 2); unir(R.pro, 3, R.pro, 4); unir(R.pro, 6, R.pro, 7); unir(R.pro, 9, R.pro, 10);
  R.desc = fila({ 0: `DESCRIPCIÓN DE LA PRENDA: ${borrador.descripcion || ""}` }); fila({}); unir(R.desc, 0, R.desc + 1, 10);
  R.opsT = fila({ 0: "OPERACIONES" }); unir(R.opsT, 0, R.opsT, 10);
  R.head = fila({ 0: "SECUENCIA", 1: "DESCRIPCION DE LA OPERACION", 4: "MAQUINA", 5: "AGUJA", 6: "PUNTADA", 7: "REPETICIÓN", 8: "OBSERVACIONES", 10: "TIEMPO" });
  unir(R.head, 1, R.head, 3); unir(R.head, 8, R.head, 9);
  R.primera = filas.length;
  for (let i = 0; i < nFilas; i++) {
    const o = ops[i];
    const r = fila({ 0: i + 1, 1: o ? o.d : "", 4: o ? o.m : "", 5: o ? o.a : "", 6: o ? o.p : "", 7: o ? o.r : "", 8: o ? o.o : "", 10: o ? o.t : "" });
    unir(r, 1, r, 3); unir(r, 8, r, 9);
  }
  R.ultima = filas.length - 1;
  R.total = fila({ 0: "TIEMPO TOTAL (minutos)", 10: Math.round(total * 100) / 100 }); unir(R.total, 0, R.total, 9);
  R.obsT = fila({ 0: "OBSERVACIONES" }); unir(R.obsT, 0, R.obsT, 10);
  R.obs = fila({ 0: borrador.observaciones || "" }); fila({}); unir(R.obs, 0, R.obs + 1, 10);

  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws["!merges"] = merges;
  ws["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  ws["!sheetPr"] = { pageSetUpPr: { fitToPage: true } };
  ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  ws["!rows"] = filas.map((_, i) => {
    if (i === R.titulo) return { hpt: 24 };
    if (i >= R.cap && i <= R.cap + 2) return { hpt: 22 };
    if (i === R.desc || i === R.desc + 1 || i === R.obs || i === R.obs + 1) return { hpt: 24 };
    if (i === R.head) return { hpt: 26 };
    return { hpt: 20 };
  });
  const INK = "1A1A2E", SEAM = "C8B8A2", CANVAS = "F7F4F0";
  const L = { style: "thin", color: { rgb: "A89F94" } };
  const BOX = { top: L, bottom: L, left: L, right: L };
  const esEtiqueta = (r, c) => (r === R.capLbl) || (r === R.cat && [0, 5, 8].includes(c)) || (r === R.pro && [0, 5, 8].includes(c)) || r === R.obsT || r === R.total;
  for (let r = 0; r < filas.length; r++) {
    for (let c = 0; c < NC; c++) {
      const a = XLSX.utils.encode_cell({ r, c });
      if (!ws[a]) ws[a] = { t: "s", v: "" };
      let s = { border: BOX, font: { sz: 10, color: { rgb: INK } }, alignment: { vertical: "center", horizontal: "left", wrapText: true }, fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } } };
      if (r === R.titulo || r === R.opsT) { s.font = { bold: true, sz: r === R.titulo ? 14 : 11, color: { rgb: SEAM } }; s.fill = { patternType: "solid", fgColor: { rgb: INK } }; s.alignment.horizontal = "center"; }
      else if (r === R.head) { s.font = { bold: true, sz: 9, color: { rgb: INK } }; s.fill = { patternType: "solid", fgColor: { rgb: "E8E2DB" } }; s.alignment.horizontal = "center"; }
      else if (esEtiqueta(r, c)) { s.font = { bold: true, sz: 10, color: { rgb: INK } }; s.fill = { patternType: "solid", fgColor: { rgb: CANVAS } }; if (r === R.total) s.alignment.horizontal = "right"; }
      else if (r === R.cap) { s.font = { bold: true, sz: 14, color: { rgb: INK } }; s.alignment = { vertical: "center", horizontal: "center", wrapText: true }; }
      else if (r >= R.primera && r <= R.ultima) { if (c === 0 || c === 5 || c === 7) s.alignment.horizontal = "center"; if (c === 10) s.alignment.horizontal = "right"; if (c === 0) s.font = { bold: true, sz: 10, color: { rgb: INK } }; }
      if (r === R.total && c === 10) { s.font = { bold: true, sz: 11, color: { rgb: INK } }; s.alignment.horizontal = "right"; s.fill = { patternType: "solid", fgColor: { rgb: "FFFFFF" } }; }
      if ((r >= R.primera && r <= R.ultima && c === 10 && ws[a].v !== "") || (r === R.total && c === 10)) ws[a].z = "0.00";
      ws[a].s = s;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Proceso de muestra");
  XLSX.writeFile(wb, nombreArchivoFicha(item));
}

export default function FichaConfeccionPanel({ item, kind, canEdit, onPatch, capsula, protos, capsulas, currentUser, T, Btn }) {
  const [b, setB] = useState(() => aBorrador(item.fichaConfeccion));
  const [vista, setVista] = useState("editar");
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");
  const idItem = useRef(item.id);
  const ultimo = useRef({ b, item, canEdit });
  ultimo.current = { b, item, canEdit };

  // otra referencia → otro borrador
  useEffect(() => {
    if (idItem.current !== item.id) { idItem.current = item.id; setB(aBorrador(item.fichaConfeccion)); setGuardado(false); }
  }, [item.id, item.fichaConfeccion]);

  const enc = useMemo(() => encabezadoFicha(item, kind, capsula), [item, kind, capsula]);
  const sug = useMemo(() => sugerencias(itemsConFicha(protos, capsulas).concat([item])), [protos, capsulas, item]);
  const cambios = canEdit && hayCambios(b, item.fichaConfeccion);
  const ops = b.operaciones;
  const total = totalMinutos(ops);
  const usuario = typeof currentUser === "string" ? currentUser : (currentUser && currentUser.name) || "";

  function guardar() {
    onPatch({ fichaConfeccion: aGuardar(b, usuario, new Date().toISOString()) });
    setGuardado(true); setError("");
    setTimeout(() => setGuardado(false), 2500);
  }
  // si se sale de la pestaña con cambios sin guardar, se guardan (no se pierde lo escrito)
  useEffect(() => () => {
    const u = ultimo.current;
    if (u.canEdit && hayCambios(u.b, u.item.fichaConfeccion)) onPatch({ fichaConfeccion: aGuardar(u.b, usuario, new Date().toISOString()) });
  }, []);

  const setOp = (id, k, v) => setB((p) => ({ ...p, operaciones: p.operaciones.map((o) => (o.id === id ? { ...o, [k]: v } : o)) }));
  const mover = (i, d) => setB((p) => { const a = p.operaciones.slice(); const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, operaciones: a }; });
  const quitar = (id) => setB((p) => ({ ...p, operaciones: p.operaciones.filter((o) => o.id !== id) }));
  const agregar = () => setB((p) => ({ ...p, operaciones: [...p.operaciones, opVacia()] }));

  async function bajar() {
    try { setError(""); await exportarFichaConfeccion(item, kind, capsula, b); } catch (e) { setError(`No pude armar el Excel: ${e.message || e}`); }
  }

  const inp = { width: "100%", boxSizing: "border-box", border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", color: T.ink, background: "#fff" };
  const lblS = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, color: T.slate };
  const th = { background: T.canvas, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: T.slate, textAlign: "left", padding: "9px 8px", whiteSpace: "nowrap" };
  const td = { padding: "6px 6px", borderTop: `1px solid ${T.border}`, verticalAlign: "middle" };
  const lec = { padding: "8px 8px", borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.ink };
  const campos = [["Cápsula", enc.capsula, true], ["Fecha creación colección", enc.fechaColeccion], ["Categoría", enc.categoria], ["Talla", enc.talla], ["Silueta", enc.silueta], ["Textil", enc.textil], ["Prototipo No.", enc.prototipo], ["Referencia", enc.referencia], ["Base", enc.baseMolderia || enc.base]];
  const kpi = (n, t) => <div style={{ background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 14px", fontSize: 11.5, color: T.slate, fontWeight: 700 }}><b style={{ display: "block", fontSize: 20, color: T.ink }}>{n}</b>{t}</div>;

  return (
    <div data-testid="ficha-confeccion">
      <datalist id="fc-maq">{sug.maquinas.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="fc-agu">{sug.agujas.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="fc-pun">{sug.puntadas.map((x) => <option key={x} value={x} />)}</datalist>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Ficha de confección</div>
          <div style={{ fontSize: 12, color: T.slate }}>Proceso operativo de muestra: cómo se arma la prenda, operación por operación.</div>
        </div>
        <Btn variant="ghost" small onClick={bajar}>📊 Exportar Excel</Btn>
      </div>

      <div style={{ display: "inline-flex", background: "#ECE6DC", borderRadius: 12, padding: 3, gap: 2, marginBottom: 14 }}>
        {[["editar", canEdit ? "✏️ Editar" : "👁 Ver"], ["formato", "📄 Cómo sale en el Excel"]].map(([k, t]) => (
          <button key={k} type="button" data-testid={`modo-${k}`} onClick={() => setVista(k)} style={{ border: "none", background: vista === k ? T.ink : "transparent", color: vista === k ? "#fff" : T.slate, fontWeight: 700, fontSize: 12.5, padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>{t}</button>
        ))}
      </div>

      {error && <div style={{ background: "#FDECE9", color: "#C0392B", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{error}</div>}

      <div style={{ background: T.canvas, borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 8 }}>
        {campos.map(([k, v, ancho]) => (
          <div key={k} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", minWidth: 0, gridColumn: ancho ? "span 2" : undefined }}>
            <div style={lblS}>{k}</div>
            <div style={{ fontWeight: 700, fontSize: 14, overflowWrap: "anywhere" }}>{v || "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, marginBottom: 14 }}><b style={{ color: T.jade }}>● Automático:</b> estos datos salen de la referencia{canEdit ? "; solo la descripción de la prenda se escribe aquí" : ""}.</div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ ...lblS, marginBottom: 5 }}>Descripción de la prenda</div>
        {canEdit && vista === "editar"
          ? <textarea data-testid="fc-desc" rows={2} value={b.descripcion} onChange={(e) => setB({ ...b, descripcion: e.target.value })} placeholder="Ej: Camiseta sisa, espalda nadadora, cuello redondo recubierto…" style={{ ...inp, resize: "vertical" }} />
          : <div style={{ fontSize: 13, color: T.ink, padding: "4px 0" }}>{b.descripcion || "—"}</div>}
      </div>

      {vista === "editar" ? (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
            {kpi(contarOperaciones(ops), "operaciones")}
            {kpi(`${fmtMin(total)} min`, "tiempo total de la muestra")}
            {kpi(tiposDeMaquina(ops), "tipos de máquina")}
          </div>
          {!ops.length && !canEdit && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 24 }}>Sin operaciones registradas.</div>}
          {(ops.length > 0 || canEdit) && (
            <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 12 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: canEdit ? 1040 : 820 }}>
                <thead>
                  <tr>
                    <th style={th}>Secuencia</th><th style={{ ...th, minWidth: 240 }}>Descripción de la operación</th><th style={{ ...th, minWidth: 170 }}>Máquina</th><th style={th}>Aguja</th><th style={{ ...th, minWidth: 110 }}>Puntada</th><th style={th}>Repet.</th><th style={{ ...th, minWidth: 170 }}>Observaciones</th><th style={th}>Tiempo (min)</th>{canEdit && <th style={th} />}
                  </tr>
                </thead>
                <tbody>
                  {ops.map((o, i) => canEdit ? (
                    <tr key={o.id} data-testid="fc-fila">
                      <td style={{ ...td, whiteSpace: "nowrap", width: 76 }}>
                        <span style={{ display: "inline-flex", width: 26, height: 26, borderRadius: "50%", background: T.ink, color: "#fff", fontWeight: 700, fontSize: 12, alignItems: "center", justifyContent: "center", marginRight: 6 }}>{i + 1}</span>
                        <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, verticalAlign: "middle" }}>
                          <button type="button" title="Subir" data-testid="fc-subir" onClick={() => mover(i, -1)} style={{ border: "none", background: T.canvas, borderRadius: 6, width: 22, height: 22, fontSize: 11, color: T.slate, cursor: "pointer", padding: 0 }}>▲</button>
                          <button type="button" title="Bajar" onClick={() => mover(i, 1)} style={{ border: "none", background: T.canvas, borderRadius: 6, width: 22, height: 22, fontSize: 11, color: T.slate, cursor: "pointer", padding: 0 }}>▼</button>
                        </span>
                      </td>
                      <td style={td}><input data-testid="fc-d" style={inp} value={o.d} onChange={(e) => setOp(o.id, "d", e.target.value)} placeholder="Describe la operación" /></td>
                      <td style={td}><input data-testid="fc-m" style={inp} list="fc-maq" value={o.m} onChange={(e) => setOp(o.id, "m", e.target.value)} /></td>
                      <td style={td}><input style={{ ...inp, width: 84 }} list="fc-agu" value={o.a} onChange={(e) => setOp(o.id, "a", e.target.value)} /></td>
                      <td style={td}><input style={inp} list="fc-pun" value={o.p} onChange={(e) => setOp(o.id, "p", e.target.value)} /></td>
                      <td style={td}><input style={{ ...inp, width: 60, textAlign: "center" }} inputMode="numeric" value={o.r} onChange={(e) => setOp(o.id, "r", e.target.value)} /></td>
                      <td style={td}><input style={inp} value={o.o} onChange={(e) => setOp(o.id, "o", e.target.value)} /></td>
                      <td style={td}><input data-testid="fc-t" style={{ ...inp, width: 78, textAlign: "right" }} inputMode="decimal" value={o.t} onChange={(e) => setOp(o.id, "t", e.target.value)} /></td>
                      <td style={td}><button type="button" title="Quitar" onClick={() => quitar(o.id)} style={{ border: "none", background: "#FDECE9", color: "#E8604C", borderRadius: 8, padding: "5px 9px", fontWeight: 700, cursor: "pointer" }}>✕</button></td>
                    </tr>
                  ) : (
                    <tr key={o.id}>
                      <td style={{ ...lec, fontWeight: 700 }}>{i + 1}</td><td style={lec}>{o.d}</td><td style={lec}>{o.m}</td><td style={lec}>{o.a}</td><td style={lec}>{o.p}</td><td style={lec}>{o.r}</td><td style={lec}>{o.o}</td><td style={{ ...lec, textAlign: "right" }}>{o.t ? fmtMin(parseNum(o.t)) : ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={7} style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, background: "#FAF8F4", borderTop: `2px solid ${T.border}` }}>Tiempo total de la muestra</td><td data-testid="fc-total" style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, background: "#FAF8F4", borderTop: `2px solid ${T.border}` }}>{fmtMin(total)}</td>{canEdit && <td style={{ background: "#FAF8F4", borderTop: `2px solid ${T.border}` }} />}</tr></tfoot>
              </table>
            </div>
          )}
          {canEdit && <div style={{ marginTop: 10 }}><Btn variant="secondary" small onClick={agregar}>+ Agregar operación</Btn></div>}
        </>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table data-testid="fc-formato" style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontSize: 12.5, border: "1px solid #333" }}>
            <tbody>
              <tr><td colSpan={9} style={{ background: T.ink, color: "#C8B8A2", textAlign: "center", fontWeight: 700, fontSize: 15, padding: 8, border: "1px solid #333" }}>PROCESO OPERATIVO DE MUESTRA</td></tr>
              {[["CAPSULA:", enc.capsula], ["FECHA DE CREACIÓN DE COLECCION:", enc.fechaColeccion]].map(([k, v]) => <tr key={k}><td style={{ ...fx, ...fxg }} colSpan={2}>{k}</td><td style={fx} colSpan={7}>{v || "—"}</td></tr>)}
              <tr><td style={{ ...fx, ...fxg }}>CATEGORÍA:</td><td style={fx}>{enc.categoria || "—"}</td><td style={{ ...fx, ...fxg }}>TALLA:</td><td style={fx} colSpan={2}>{enc.talla || "—"}</td><td style={{ ...fx, ...fxg }}>SILUETA:</td><td style={fx}>{enc.silueta || "—"}</td><td style={fx} colSpan={2}>TEXTIL: {enc.textil || "—"}</td></tr>
              <tr><td style={{ ...fx, ...fxg }}>PROTOTIPO No:</td><td style={fx}>{enc.prototipo || "—"}</td><td style={{ ...fx, ...fxg }}>REFERENCIA</td><td style={fx} colSpan={2}>{enc.referencia || "—"}</td><td style={{ ...fx, ...fxg }}>BASE:</td><td style={fx} colSpan={3}>{enc.base || "—"}</td></tr>
              <tr><td style={{ ...fx, ...fxg }} colSpan={2}>DESCRIPCIÓN DE LA PRENDA:</td><td style={fx} colSpan={7}>{b.descripcion}</td></tr>
              <tr><td colSpan={9} style={{ background: T.ink, color: "#C8B8A2", textAlign: "center", fontWeight: 700, padding: 6, border: "1px solid #333" }}>OPERACIONES</td></tr>
              <tr>{["SECUENCIA", "DESCRIPCION DE LA OPERACION", "MAQUINA", "AGUJA", "PUNTADA", "REPETICIÓN", "OBSERVACIONES", "TIEMPO"].map((h, i) => <td key={h} colSpan={i === 1 ? 2 : 1} style={{ ...fx, ...fxg, textAlign: "center", fontSize: 11 }}>{h}</td>)}</tr>
              {Array.from({ length: Math.max(FILAS_MINIMAS_EXCEL, ops.length) }).map((_, i) => { const o = ops[i] || {}; return (
                <tr key={i}><td style={{ ...fx, textAlign: "center" }}>{i + 1}</td><td style={fx} colSpan={2}>{o.d || ""}</td><td style={fx}>{o.m || ""}</td><td style={fx}>{o.a || ""}</td><td style={fx}>{o.p || ""}</td><td style={{ ...fx, textAlign: "center" }}>{o.d ? o.r : ""}</td><td style={fx}>{o.o || ""}</td><td style={{ ...fx, textAlign: "right" }}>{o.t ? fmtMin(parseNum(o.t)) : ""}</td></tr>
              ); })}
              <tr><td style={{ ...fx, ...fxg, textAlign: "right" }} colSpan={8}>TIEMPO TOTAL (minutos)</td><td style={{ ...fx, textAlign: "right", fontWeight: 700 }}>{fmtMin(total)}</td></tr>
              <tr><td style={{ ...fx, ...fxg }} colSpan={9}>OBSERVACIONES</td></tr>
              <tr><td style={{ ...fx, height: 50, verticalAlign: "top" }} colSpan={9}>{b.observaciones}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {vista === "editar" && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 4 }}>Observaciones</div>
          <div style={{ fontSize: 12, color: T.slate, marginBottom: 8 }}>Nota final de la ficha (distinta del historial de Observaciones).</div>
          {canEdit
            ? <textarea data-testid="fc-obs" rows={3} value={b.observaciones} onChange={(e) => setB({ ...b, observaciones: e.target.value })} style={{ ...inp, resize: "vertical" }} />
            : <div style={{ padding: "12px 14px", background: T.canvas, borderRadius: 8, fontSize: 13, color: T.ink, minHeight: 40 }}>{b.observaciones || "—"}</div>}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: T.slate, fontWeight: 600 }}>
        <span>{item.fichaConfeccion && item.fichaConfeccion.editadoPor ? `Última edición: ${item.fichaConfeccion.editadoPor}${item.fichaConfeccion.editadoEn ? ` · ${new Date(item.fichaConfeccion.editadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}` : ""}` : "Todavía no se ha guardado."}</span>
        {canEdit && (
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
            {cambios && <span data-testid="fc-sin-guardar" style={{ color: "#C47C1A" }}>● Cambios sin guardar</span>}
            {guardado && <span data-testid="fc-guardado" style={{ color: T.jade }}>✔ Guardada</span>}
            <Btn onClick={guardar} disabled={!cambios}>💾 Guardar ficha</Btn>
          </span>
        )}
      </div>
    </div>
  );
}

const fx = { border: "1px solid #333", padding: "4px 7px", fontFamily: "Calibri, Arial, sans-serif" };
const fxg = { background: "#E8E2DB", fontWeight: 700 };
