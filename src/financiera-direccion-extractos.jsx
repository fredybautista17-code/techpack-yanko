// (2026-11-08, a pedido de Fredy) Dirección financiera · «Subir extractos»: se suben PDF de Bancolombia (cuenta corriente, crédito, tarjeta), el servidor los lee
// (functions/extractos-bancolombia.js, lectura exacta del texto, sin IA), aquí se REVISA lo que leyó y solo si el administrador confirma se guarda.
// Cuenta corriente → financiera_banco_resumen/{AAAA-MM}; crédito y tarjeta → financiera_deudas_externas (actualiza la deuda elegida o crea una nueva).
// El PDF no se guarda en ningún lado y de los números de cuenta solo se conservan los últimos 4 dígitos.
import React, { useMemo, useRef, useState } from "react";
import { doc, writeBatch } from "firebase/firestore";
import { getApps } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { C, Boton, Ventana } from "./financiera-cuanto-pagar";
import { sugerirDestino, valoresTarjeta, valoresCredito, valoresMes, problemaParaGuardar, fechaCorta } from "./financiera-direccion-extractos-calculo";

const MAX_BYTES = 6 * 1024 * 1024;
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesLargo = (ym) => { const [a, m] = String(ym).split("-").map(Number); return `${MESES_LARGO[m - 1] || ym} ${a}`; };
const etiqueta = { display: "block", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, margin: "8px 0 3px" };
const entrada = { width: "100%", padding: "7px 9px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: C.ink };
const celda = { padding: "5px 8px", fontSize: 12.5, borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" };

function aBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result || "").split(",")[1] || "");
    lector.onerror = () => reject(new Error("No pude abrir el archivo."));
    lector.readAsDataURL(archivo);
  });
}

function Fila({ k, v, dest, fuerte }) {
  return (
    <tr>
      <td style={{ ...celda, color: C.slate }}>{k}</td>
      <td style={{ ...celda, textAlign: "right", fontWeight: fuerte ? 800 : 600, color: C.ink }}>{v}</td>
      <td style={{ ...celda, textAlign: "right", color: C.gris, fontSize: 11.5 }}>{dest || ""}</td>
    </tr>
  );
}

function TarjetaExtracto({ it, externas, bancoPorMes, onCambia }) {
  const r = it.r;
  const marco = { border: `1.5px solid ${it.marcar && !it.problema ? C.green : C.border}`, borderRadius: 10, padding: "10px 12px", background: C.white, marginBottom: 10 };
  const cabecera = (titulo, sub) => (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <input type="checkbox" checked={!!it.marcar} disabled={!!it.problema} onChange={(e) => onCambia({ marcar: e.target.checked })} style={{ marginTop: 3 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: C.gris }}>{sub} · {it.nombre}</div>
      </div>
    </div>
  );
  if (it.estado === "leyendo") return <div style={marco}>Leyendo <b>{it.nombre}</b>…</div>;
  if (it.estado === "error" || !r || r.error) return <div style={{ ...marco, borderColor: C.red, background: C.redBg }}><b>{it.nombre}</b><div style={{ color: C.red, fontSize: 12.5, marginTop: 3 }}>{(r && r.error) || it.msg || "No se pudo leer."}</div></div>;

  if (r.tipo === "cuenta") {
    const v = valoresMes(r);
    const antes = bancoPorMes[r.ym];
    return (
      <div style={marco}>
        {cabecera(`Cuenta corriente · ${mesLargo(r.ym)}`, `${r.movimientos} movimientos${r.ref ? ` · terminada en ${r.ref}` : ""}`)}
        <div style={{ fontSize: 12, margin: "6px 0", color: r.cuadre.ok ? C.green : C.red, fontWeight: 700 }}>
          {r.cuadre.ok ? "✓ Cuadra con los totales de abonos y cargos que imprime el banco." : `✗ No cuadra con el banco (abonos ${money(r.cuadre.diferenciaAbonos)}, cargos ${money(r.cuadre.diferenciaCargos)}).`}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <Fila k="Total abonos (lo que entró)" v={money(v.abonos)} dest={antes ? `antes ${money(antes.abonos)}` : ""} />
            <Fila k="Total cargos (lo que salió)" v={money(v.cargos)} dest={antes ? `antes ${money(antes.cargos)}` : ""} />
            <Fila k={`4x1000 (${(r.detalle.c4x1000 || { n: 0 }).n} cobros)`} v={money(v.c4x1000)} dest={antes ? `antes ${money(antes.c4x1000)}` : ""} fuerte />
            <Fila k="Comisiones y servicios con IVA" v={money(v.comisiones)} dest={antes ? `antes ${money(antes.comisiones)}` : ""} />
            <Fila k="Plan Canal Negocios" v={money(v.plan)} dest={antes ? `antes ${money(antes.plan)}` : ""} />
            <Fila k="Cupo rotativo" v={money(v.cupo)} dest={antes ? `antes ${money(antes.cupo)}` : ""} />
            <Fila k="Intereses de sobregiro" v={money(v.sobregiro)} dest={antes ? `antes ${money(antes.sobregiro)}` : ""} />
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, lineHeight: 1.5 }}>
          Para tu información (no se guarda): {r.info.embargos.n ? <b style={{ color: C.red }}>embargos {money(r.info.embargos.total)} ({r.info.embargos.n}) · </b> : null}
          cuota del crédito {money(r.info.cuotaCredito.total)} · pagos a tarjetas {money(r.info.pagosTarjeta.total)} · cheques {money(r.info.cheques.total)} ({r.info.cheques.n}).
        </div>
        <div style={{ fontSize: 11.5, color: antes ? C.amber : C.gris, marginTop: 4 }}>{antes ? `Ya había un resumen de ${mesLargo(r.ym)}: al confirmar se reemplaza.` : `Se guarda como un mes nuevo (${mesLargo(r.ym)}).`}</div>
      </div>
    );
  }

  const esCredito = r.tipo === "credito";
  const candidatas = externas.filter((e) => e.tipo === (esCredito ? "banco" : "tarjeta"));
  const destino = candidatas.find((e) => e.id === it.destino) || null;
  const v = esCredito ? valoresCredito(r) : valoresTarjeta(r, it.trm);
  return (
    <div style={marco}>
      {cabecera(esCredito ? "Crédito bancario" : "Tarjeta de crédito", `${esCredito ? `obligación terminada en ${r.ref}` : `terminada en ${r.ref}`}${r.corte || r.fechaCorte ? ` · corte ${fechaCorta(r.corte || r.fechaCorte)}` : ""}`)}
      {esCredito && r.enMora > 0 ? <div style={{ color: C.red, fontWeight: 800, fontSize: 12.5, marginTop: 4 }}>⚠ Trae saldo en mora: {money(r.enMora)}</div> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <div style={{ flex: "1 1 240px" }}>
          <label style={etiqueta}>Guardar en</label>
          <select value={it.destino} onChange={(e) => onCambia({ destino: e.target.value })} style={entrada}>
            {candidatas.map((e) => <option key={e.id} value={e.id}>Actualizar «{e.nombre}» (saldo hoy {money(e.saldo)})</option>)}
            <option value="nueva">Crear una deuda nueva</option>
          </select>
        </div>
        {it.destino === "nueva" ? (
          <div style={{ flex: "1 1 200px" }}><label style={etiqueta}>Nombre de la deuda nueva</label><input value={it.nombreNuevo} onChange={(e) => onCambia({ nombreNuevo: e.target.value })} style={entrada} /></div>
        ) : null}
        {!esCredito && r.dolares ? (
          <div style={{ flex: "1 1 170px" }}>
            <label style={etiqueta}>Pesos por dólar (US${Number(r.dolares.saldo).toLocaleString("es-CO")})</label>
            <input value={it.trm} onChange={(e) => onCambia({ trm: e.target.value, marcar: true })} style={{ ...entrada, borderColor: v.faltaTRM ? C.red : C.border }} inputMode="decimal" placeholder="Ej.: 3.900" />
          </div>
        ) : null}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <tbody>
          <Fila k={esCredito ? "Saldo de capital" : "Saldo total (pesos + dólares)"} v={money(v.saldo)} dest={destino ? `antes ${money(destino.saldo)}` : ""} fuerte />
          <Fila k="Tasa E.A." v={`${Number(v.tasaEA).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`} dest={destino ? `antes ${Number(destino.tasaEA || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %` : ""} />
          <Fila k={esCredito ? "Cuota mensual" : "Pago mínimo"} v={money(v.pagoMensual)} dest={destino ? `antes ${money(destino.pagoMensual)}` : ""} />
          <Fila k="Día de pago" v={v.diaPago || "—"} dest={destino && destino.diaPago ? `antes ${destino.diaPago}` : ""} />
        </tbody>
      </table>
      <div style={{ fontSize: 11.5, color: C.gris, marginTop: 5 }}>{v.nota}</div>
    </div>
  );
}

export default function SubirExtractos({ db, externas, bancoLista, onClose }) {
  const [items, setItems] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const contador = useRef(0);
  const bancoPorMes = useMemo(() => { const m = {}; (bancoLista || []).forEach((b) => { m[b.ym] = b; }); return m; }, [bancoLista]);

  const cambia = (id, parche) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...parche } : x)));

  async function leer(archivos) {
    setError("");
    setHecho("");
    const lista = Array.from(archivos || []);
    const nuevos = lista.map((f) => ({ id: ++contador.current, nombre: f.name, estado: "leyendo", r: null, msg: "", marcar: false, destino: "nueva", nombreNuevo: "", trm: "", problema: "", archivo: f }));
    setItems((prev) => [...prev, ...nuevos]);
    const fx = httpsCallable(getFunctions(getApps()[0]), "leerExtractoBancario");
    for (const it of nuevos) {
      try {
        if (!/\.pdf$/i.test(it.nombre)) throw new Error("Solo PDF.");
        if (it.archivo.size > MAX_BYTES) throw new Error("El PDF pesa más de 6 MB.");
        const pdfBase64 = await aBase64(it.archivo);
        const resp = await fx({ nombre: it.nombre, pdfBase64 });
        const r = resp?.data?.resultado || { error: "El servidor no devolvió nada." };
        if (r.error) { cambia(it.id, { estado: "error", r, problema: r.error }); continue; }
        const destino = r.tipo === "cuenta" ? "" : sugerirDestino(r, externas);
        const trm = r.tipo === "tarjeta" && r.dolares ? String((destino && destino !== "nueva" && (externas.find((e) => e.id === destino) || {}).trm) || r.trmImplicita || "") : "";
        const problema = problemaParaGuardar(r, { trm });
        cambia(it.id, { estado: "listo", r, destino, trm, nombreNuevo: r.tipo === "credito" ? "Crédito Bancolombia" : r.tipo === "tarjeta" ? `Tarjeta terminada en ${r.ref}` : "", marcar: !problema });
      } catch (e) {
        cambia(it.id, { estado: "error", r: { error: e?.message || "No se pudo leer este archivo." } });
      }
    }
  }

  // Recalcula el problema de cada uno (por ejemplo, al escribir la TRM) y detecta archivos repetidos de la misma cuenta o tarjeta.
  const vista = useMemo(() => {
    const llaves = {};
    const conProblema = items.map((it) => {
      if (it.estado !== "listo") return { ...it, problema: it.problema || "" };
      const p = problemaParaGuardar(it.r, { trm: it.trm });
      const llave = it.r.tipo === "cuenta" ? `cuenta|${it.r.ym}` : it.destino !== "nueva" ? `dest|${it.destino}` : `nueva|${it.r.tipo}|${it.r.ref}`;
      return { ...it, problema: p, llave, marcar: it.marcar && !p };
    });
    conProblema.forEach((it) => { if (it.marcar && it.llave) llaves[it.llave] = (llaves[it.llave] || 0) + 1; });
    return conProblema.map((it) => ({ ...it, repetido: !!(it.marcar && it.llave && llaves[it.llave] > 1) }));
  }, [items]);
  const aGuardar = vista.filter((it) => it.estado === "listo" && it.marcar);
  const hayRepetidos = aGuardar.some((it) => it.repetido);

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const lote = writeBatch(db);
      const ahora = new Date().toISOString();
      const marca = Date.now();
      aGuardar.forEach((it, i) => {
        const r = it.r;
        if (r.tipo === "cuenta") {
          lote.set(doc(db, "financiera_banco_resumen", r.ym), { ...valoresMes(r), ref: r.ref || "", fuente: "extracto PDF", actualizadoEn: ahora }, { merge: true });
          return;
        }
        const v = r.tipo === "credito" ? valoresCredito(r) : valoresTarjeta(r, it.trm);
        const nueva = it.destino === "nueva";
        const datos = { tipo: r.tipo === "credito" ? "banco" : "tarjeta", saldo: v.saldo, tasaEA: v.tasaEA, pagoMensual: v.pagoMensual, diaPago: v.diaPago || 0, nota: v.nota, ref: r.ref || "", actualizadoEn: ahora };
        if (r.tipo === "tarjeta" && r.dolares) { datos.saldoUSD = v.saldoUSD; datos.trm = v.trm; }
        if (nueva) datos.nombre = (it.nombreNuevo || "").trim() || (r.tipo === "credito" ? "Crédito" : `Tarjeta terminada en ${r.ref}`);
        lote.set(doc(db, "financiera_deudas_externas", nueva ? `ext_${marca}_${i}` : it.destino), datos, { merge: true });
      });
      await lote.commit();
      setHecho(`Guardado: ${aGuardar.length} extracto${aGuardar.length === 1 ? "" : "s"}. Ya se ven en el Mapa de deuda y en Costo del dinero.`);
      setItems([]);
    } catch (e) { setError(e?.message || "No se pudo guardar."); }
    setGuardando(false);
  }

  return (
    <Ventana titulo="Subir extractos del banco" sub="Sube los PDF de Bancolombia (cuenta corriente, crédito o tarjeta). ATLAS los lee, te muestra lo que encontró y solo guarda lo que tú confirmes. El PDF no se guarda." onClose={onClose} ancho={860}>
      <label style={{ display: "block", border: `2px dashed ${C.seam}`, borderRadius: 12, padding: "16px 12px", textAlign: "center", cursor: "pointer", background: C.white, color: C.slate, fontSize: 13 }}>
        <b style={{ color: C.ink }}>Elegir PDF</b> (puedes escoger varios a la vez)
        <input type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }} onChange={(e) => { leer(e.target.files); e.target.value = ""; }} />
      </label>
      {hecho ? <div style={{ background: C.greenBg, color: C.green, borderRadius: 8, padding: "8px 12px", marginTop: 10, fontSize: 13, fontWeight: 700 }}>{hecho}</div> : null}
      <div style={{ marginTop: 12 }}>
        {vista.map((it) => <TarjetaExtracto key={it.id} it={it} externas={externas} bancoPorMes={bancoPorMes} onCambia={(parche) => cambia(it.id, parche)} />)}
      </div>
      {hayRepetidos ? <div style={{ color: C.amber, fontSize: 12.5, marginBottom: 8 }}>Hay dos marcados para la misma cuenta, tarjeta o mes. Deja marcado solo uno (o elige otra tarjeta en «Guardar en»).</div> : null}
      {error ? <div style={{ color: C.red, fontSize: 12.5, marginBottom: 8 }}>{error}</div> : null}
      {items.length ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "sticky", bottom: 0, background: C.canvas, paddingTop: 8 }}>
          <Boton variante="oscuro" onClick={guardar} disabled={guardando || !aGuardar.length || hayRepetidos}>{guardando ? "Guardando…" : `Confirmar y guardar (${aGuardar.length})`}</Boton>
          <Boton onClick={onClose}>Cerrar</Boton>
          <span style={{ fontSize: 11.5, color: C.gris }}>Revisa las cifras contra el extracto antes de confirmar.</span>
        </div>
      ) : null}
    </Ventana>
  );
}
