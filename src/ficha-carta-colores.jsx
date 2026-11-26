// ─── CARTA DE COLORES · subir hex y Pantone desde un Excel ─────────────────────────────────────────────────────
// (2026-11-26, a pedido de Fredy) Los 546 colores ya están sincronizados con Busint pero sin hex ni Pantone. Aquí se baja una plantilla (Cód. Busint, Nombre, Hex, Pantone)
// con todos los colores, se llena (o se pasan las cartas de color a Excel) y se sube: cruza por el CÓDIGO de Busint, llena solo lo vacío y avisa de lo que ya tenía otro dato.
import React, { useMemo, useState } from "react";
import { doc, writeBatch } from "firebase/firestore";
import { COL_COLORES, leerCartaColores, planCartaColores, normCod, esHex } from "./ficha-inicio-calculo";
import { C, Boton, Ventana, Cuadrito } from "./ficha-ui";

export default function SubirCartaColores({ colores, db, onClose }) {
  const [info, setInfo] = useState(null);
  const [lectura, setLectura] = useState(null);
  const [pisar, setPisar] = useState(false);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [hecho, setHecho] = useState("");
  const plan = useMemo(() => (lectura ? planCartaColores(colores || [], lectura.filas, { pisar }) : null), [lectura, colores, pisar]);

  async function bajarPlantilla() {
    try {
      const XLSX = await import("xlsx");
      const filas = [["Cód. Busint", "Nombre", "Hex", "Pantone"], ...[...(colores || [])].sort((a, b) => normCod(a.codBusint).localeCompare(normCod(b.codBusint), "es", { numeric: true })).map((c) => [normCod(c.codBusint), c.nombre || "", esHex(c.hex) ? c.hex : "", c.pantone || ""])];
      const ws = XLSX.utils.aoa_to_sheet(filas);
      ws["!cols"] = [{ wch: 14 }, { wch: 34 }, { wch: 12 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Colores");
      XLSX.writeFile(wb, "plantilla-hex-pantone.xlsx");
    } catch (err) { setError(`No pude armar la plantilla: ${err.message || err}`); }
  }
  async function leer(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setLectura(null); setHecho("");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const r = leerCartaColores(filas);
      if (!r.filas.length && !r.invalidos.length) { setError("No encontré colores con hex o Pantone en ese archivo. Usa la plantilla: Cód. Busint, Nombre, Hex, Pantone."); return; }
      setInfo({ archivo: file.name }); setLectura(r);
    } catch (err) { setError(`No pude leer el archivo: ${err.message || err}`); }
  }
  async function aplicar() {
    if (!plan || trabajando || !plan.actualizar.length) return;
    setTrabajando(true); setError("");
    try {
      const ahora = new Date().toISOString();
      for (let i = 0; i < plan.actualizar.length; i += 400) {
        const lote = writeBatch(db);
        plan.actualizar.slice(i, i + 400).forEach((u) => lote.set(doc(db, COL_COLORES, u.ex.id), { ...u.datos, actualizadoEn: ahora }, { merge: true }));
        await lote.commit();
      }
      setHecho(`Listo: ${plan.actualizar.length} colores actualizados con su hex y Pantone.`);
      setLectura(null);
    } catch (err) { setError(`No se pudo guardar: ${err.message || err}`); }
    setTrabajando(false);
  }
  const tarjeta = (n, t, bg, col) => <div style={{ background: bg, borderRadius: 12, padding: "10px 12px" }}><div style={{ fontSize: 24, fontWeight: 800, color: col || C.ink, letterSpacing: -0.5 }}>{n}</div><div style={{ fontSize: 11.5, fontWeight: 700, color: C.slate }}>{t}</div></div>;
  const aviso = (children) => <div style={{ background: "#FFF8EA", border: `1px solid ${C.amberLine}`, borderRadius: 12, padding: "9px 12px", marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>{children}</div>;
  return (
    <Ventana titulo="📤 Subir hex y Pantone de los colores" onClose={onClose} ancho={780}>
      <p style={{ fontSize: 13, color: C.slate, fontWeight: 600, lineHeight: 1.5, margin: "0 0 12px" }}>Baja la plantilla, llena el <b>Hex</b> y el <b>Pantone</b> de los colores que ya tengas y súbela. Se cruza por el <b>código de Busint</b>; lo que ya tiene dato no se pisa (te avisa).</p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <Boton onClick={bajarPlantilla}>⬇ Bajar la plantilla ({(colores || []).length} colores)</Boton>
        <label style={{ cursor: "pointer" }}>
          <input data-testid="archivo-carta" type="file" accept=".xls,.xlsx,.csv" onChange={leer} style={{ display: "none" }} />
          <span style={{ background: C.ink, color: C.white, borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, display: "inline-block" }}>{info ? "Cambiar archivo" : "Escoger el Excel lleno"}</span>
        </label>
        {info && <span style={{ fontSize: 12.5, color: C.slate, fontWeight: 600 }}>{info.archivo}</span>}
      </div>
      {error && <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{error}</div>}
      {hecho && <div style={{ background: C.greenBg, color: C.green, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>✔ {hecho}</div>}
      {plan && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
            {tarjeta(plan.actualizar.length, "Colores que se actualizan", C.greenBg, C.green)}
            {tarjeta(plan.avisos.length, pisar ? "Avisos (ya los vas a reemplazar)" : "Ya tenían otro dato (no se pisan)", C.amberBg, C.amber)}
            {tarjeta(plan.sinCoincidencia.length, "No están en la biblioteca", C.greyBg)}
            {tarjeta(lectura.invalidos.length, "Hex mal escrito", C.redBg, C.red)}
          </div>
          {plan.actualizar.length > 0 && (
            <div style={{ maxHeight: 190, overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10 }}>
              {plan.actualizar.slice(0, 60).map((u) => (
                <div key={u.ex.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                  <Cuadrito hex={u.datos.hex || u.ex.hex} tam={22} /><b style={{ flex: 1 }}>{u.ex.nombre}</b><span style={{ color: C.slate }}>Busint {u.ex.codBusint || "—"}</span><span style={{ color: C.slate }}>{u.datos.hex || ""} {u.datos.pantone || ""}</span>
                </div>
              ))}
              {plan.actualizar.length > 60 && <div style={{ padding: "6px 12px", fontSize: 12, color: C.slate }}>… y {plan.actualizar.length - 60} más</div>}
            </div>
          )}
          {plan.avisos.length > 0 && aviso(<><b>{plan.avisos.length} color(es) ya tenían otro dato:</b> {plan.avisos.slice(0, 6).map((a) => `${a.ex.nombre} (${a.campo}: ${a.actual} → ${a.nuevo})`).join("; ")}{plan.avisos.length > 6 ? "…" : ""}. {pisar ? "Se van a reemplazar." : "No se tocan."}</>)}
          {plan.sinCoincidencia.length > 0 && aviso(<><b>{plan.sinCoincidencia.length} fila(s) no están en la biblioteca:</b> {plan.sinCoincidencia.slice(0, 8).map((s) => `${s.nombre || "?"} (${s.cod || "sin código"})`).join(", ")}{plan.sinCoincidencia.length > 8 ? "…" : ""}. Sincroniza con Busint primero o crea el color.</>)}
          {lectura.invalidos.length > 0 && aviso(<><b>Hex mal escrito:</b> {lectura.invalidos.slice(0, 6).map((s) => `${s.nombre || s.cod}: «${s.hex}»`).join(", ")}. Debe ser como #234654.</>)}
          {plan.repetidosArchivo > 0 && <p style={{ fontSize: 12.5, color: C.slate, fontWeight: 600, margin: "4px 0 8px" }}>{plan.repetidosArchivo} fila(s) repetidas en el archivo: se usó la primera.</p>}
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, margin: "8px 0" }}><input type="checkbox" checked={pisar} onChange={(e) => setPisar(e.target.checked)} /> Reemplazar también los que ya tenían otro dato</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Boton onClick={onClose}>Cancelar</Boton>
            <Boton tipo="ok" onClick={aplicar} disabled={trabajando || !plan.actualizar.length}>{trabajando ? "Guardando…" : `✔ Aplicar a ${plan.actualizar.length} ${plan.actualizar.length === 1 ? "color" : "colores"}`}</Boton>
          </div>
        </>
      )}
      {hecho && <div style={{ marginTop: 6 }}><Boton onClick={onClose}>Cerrar</Boton></div>}
    </Ventana>
  );
}
