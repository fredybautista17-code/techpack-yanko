// ─── MI DÍA · ÓRDENES DE COMPRA (tarjetas `oc_vencidas` y `oc_precios`) ─────────────────────────────────────────────────────
// (2026-11-10, a pedido de Fredy) Para la persona de costos: qué órdenes de compra están vencidas y si lo que se compra subió de precio.
// Usa la misma función de Busint y las mismas marcas de «recibida» de Contabilidad → Órdenes de compra (getOrdenesCompraBusint +
// contabilidad_ordenes_compra_recibidas) y el cálculo de ordenes-compra-calculo.js. Solo lectura.
import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { armarOrdenes, resumenOrdenes, cambiosDePrecio, VENTANA_DEFECTO } from "./ordenes-compra-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", greenLn: "#C5E6D8", red: "#E85D4A", redBg: "#FDF0EE", redLn: "#F0CCC6",
  blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6", amberLn: "#EBD9B4",
};
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => `$${fmt(n)}`;
const fmtF = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "—");
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.white };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const BOTON = { padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink };

let cacheOC = null; // { datos, en } — se conserva al cambiar de pestaña para no volver a consultar Busint (tarda)

function Chip({ activo, onClick, children }) {
  return (
    <span onClick={onClick} style={{ padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.ink, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
function Loseta({ titulo, valor, sub, color, fondo, linea }) {
  return (
    <div style={{ flex: "1 1 200px", minWidth: 180, background: fondo, border: `1px solid ${linea}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3 }}>{titulo}</div>
      <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1.1, marginTop: 4 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, lineHeight: 1.35 }}>{sub}</div> : null}
    </div>
  );
}
function Titulo({ children }) {
  return <div style={{ fontSize: 15, fontWeight: 900, color: C.ink, margin: "2px 0 8px" }}>{children}</div>;
}
function Tabla({ cabeza, filas, vacio }) {
  if (!filas.length) return <div style={{ fontSize: 13, color: C.slate, padding: "6px 2px 14px" }}>{vacio}</div>;
  return (
    <div style={{ overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.white, marginBottom: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{cabeza.map((h, i) => <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>{filas}</tbody>
      </table>
    </div>
  );
}

export default function BloqueOrdenesCompra({ db, visibles }) {
  const functionsClient = useMemo(() => getFunctions(db.app), [db]);
  const [datos, setDatos] = useState(cacheOC ? cacheOC.datos : null);
  const [en, setEn] = useState(cacheOC ? cacheOC.en : null);
  const [cargando, setCargando] = useState(!cacheOC);
  const [error, setError] = useState("");
  const [marcas, setMarcas] = useState({});
  const [verTodas, setVerTodas] = useState(false);
  const [umbral, setUmbral] = useState(5);
  const [dias, setDias] = useState(60);
  const hoy = hoyBogota();
  const ver = (id) => (visibles || []).includes(id);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const resp = await httpsCallable(functionsClient, "getOrdenesCompraBusint", { timeout: 540000 })({});
      cacheOC = { datos: resp.data, en: Date.now() };
      setDatos(resp.data);
      setEn(cacheOC.en);
    } catch (err) {
      const sinPermiso = String(err?.code || "").includes("permission-denied");
      setError(sinPermiso
        ? "Este usuario no tiene permiso para ver las órdenes de compra. Pídele al administrador que le active «Contabilidad → Órdenes de compra» en su rol."
        : err?.message || "No se pudieron traer las órdenes de compra de Busint.");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { if (!cacheOC) cargar(); }, []); // eslint-disable-line
  useEffect(() => onSnapshot(collection(db, "contabilidad_ordenes_compra_recibidas"), (s) => {
    const m = {};
    s.docs.forEach((d) => { m[d.id] = d.data(); });
    setMarcas(m);
  }, () => {}), [db]);

  const res = useMemo(() => (datos ? resumenOrdenes(datos, marcas, hoy, VENTANA_DEFECTO) : null), [datos, marcas, hoy]);
  const camb = useMemo(() => (datos ? cambiosDePrecio(armarOrdenes(datos), hoy, dias, umbral) : null), [datos, hoy, dias, umbral]);

  const barra = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <button style={BOTON} onClick={cargar} disabled={cargando}>{cargando ? "Consultando Busint…" : "↻ Actualizar desde Busint"}</button>
      {en ? <span style={{ fontSize: 12, color: C.slate }}>Última consulta: {new Date(en).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span> : null}
    </div>
  );
  if (error) return <div>{barra}<div style={{ background: C.redBg, border: `1px solid ${C.redLn}`, borderRadius: 12, padding: "14px 18px", fontSize: 14, color: C.red, fontWeight: 600, lineHeight: 1.5 }}>{error}</div></div>;
  if (!res) return <div>{barra}<div style={{ fontSize: 14, color: C.slate }}>Trayendo las órdenes de compra de Busint… puede tardar un minuto.</div></div>;

  const vencidasMostradas = verTodas ? res.vencidas : res.vencidas.slice(0, 12);
  const hayVenc = res.vencidas.length > 0;

  return (
    <div>
      {barra}

      {ver("oc_vencidas") ? (
        <>
          <Titulo>Órdenes de compra vencidas</Titulo>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Loseta
              titulo="Vencidas" valor={hayVenc ? res.vencidas.length : "✓ 0"}
              sub={hayVenc ? `${money(res.valorVencidas)} con IVA · ${res.proveedoresVencidos} proveedor${res.proveedoresVencidos === 1 ? "" : "es"}` : "Ninguna orden vencida sin recibir"}
              color={hayVenc ? C.red : C.green} fondo={hayVenc ? C.redBg : C.greenBg} linea={hayVenc ? C.redLn : C.greenLn}
            />
            <Loseta
              titulo="Vencen en 7 días o menos" valor={res.porVencer.length}
              sub={res.porVencer.length ? `${money(res.valorPorVencer)} con IVA` : "Nada por vencer esta semana"}
              color={res.porVencer.length ? C.amber : C.slate} fondo={res.porVencer.length ? C.amberBg : C.canvas} linea={res.porVencer.length ? C.amberLn : C.border}
            />
            <Loseta
              titulo={`Sin confirmar (+${VENTANA_DEFECTO} días)`} valor={res.antiguas}
              sub="Vencieron hace más de 60 días y nadie las marcó como recibidas: se revisan en Contabilidad → Órdenes de compra → Historial."
              color={C.slate} fondo={C.canvas} linea={C.border}
            />
          </div>
          <Tabla
            cabeza={["Orden", "Proveedor", "Entrega", "Atraso", "Valor con IVA"]}
            vacio="No hay órdenes vencidas. ✓"
            filas={vencidasMostradas.map((o) => (
              <tr key={o.n}>
                <td style={{ ...td, textAlign: "left", fontWeight: 800 }}>{o.n}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "normal" }}>{o.pn || "—"}</td>
                <td style={td}>{fmtF(o.ff)}</td>
                <td style={{ ...td, fontWeight: 800, color: C.red }}>{-o.est.dias} día{-o.est.dias === 1 ? "" : "s"}</td>
                <td style={td}>{money(o.total)}</td>
              </tr>
            ))}
          />
          {res.vencidas.length > 12 ? <div style={{ marginBottom: 14 }}><button style={BOTON} onClick={() => setVerTodas(!verTodas)}>{verTodas ? "Ver menos" : `Ver las ${res.vencidas.length} vencidas`}</button></div> : null}
        </>
      ) : null}

      {ver("oc_precios") && camb ? (
        <>
          <Titulo>¿Se está comprando al precio que es?</Titulo>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.slate }}>Subió más de</span>
            {[3, 5, 10].map((u) => <Chip key={u} activo={umbral === u} onClick={() => setUmbral(u)}>{u} %</Chip>)}
            <span style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginLeft: 8 }}>en compras de los últimos</span>
            {[30, 60, 90].map((d) => <Chip key={d} activo={dias === d} onClick={() => setDias(d)}>{d} días</Chip>)}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Loseta
              titulo="Insumos que subieron" valor={camb.subieron.length}
              sub={camb.subieron.length ? `${money(camb.impactoSubieron)} de más en la última compra de cada uno` : `Ninguno subió más de ${umbral} % frente a su compra anterior`}
              color={camb.subieron.length ? C.red : C.green} fondo={camb.subieron.length ? C.redBg : C.greenBg} linea={camb.subieron.length ? C.redLn : C.greenLn}
            />
            <Loseta titulo="Insumos que bajaron" valor={camb.bajaron.length} sub={`Más de ${umbral} % por debajo de su compra anterior`} color={C.blue} fondo={C.blueBg} linea="#C9D9E8" />
          </div>
          <Tabla
            cabeza={["Insumo", "Proveedor", "Fecha", "Precio anterior", "Precio ahora", "Cambio", "Pesos de más"]}
            vacio="Ningún insumo subió de precio con ese filtro. ✓"
            filas={camb.subieron.slice(0, 25).map((f) => (
              <tr key={f.cod}>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, whiteSpace: "normal", minWidth: 180 }}>{f.nombre}</td>
                <td style={{ ...td, whiteSpace: "normal" }}>{f.ult.prov || "—"}</td>
                <td style={td}>{fmtF(f.ult.fecha)}</td>
                <td style={td}>{money(f.ant.neto)}</td>
                <td style={{ ...td, fontWeight: 800 }}>{money(f.ult.neto)}</td>
                <td style={{ ...td, fontWeight: 800, color: C.red }}>▲ {f.pct.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(f.impacto)}</td>
              </tr>
            ))}
          />
          {camb.cambioUnidad.length ? <div style={{ fontSize: 12, color: C.amber, marginBottom: 8 }}>⇄ {camb.cambioUnidad.length} insumo{camb.cambioUnidad.length === 1 ? "" : "s"} cambiaron de unidad (kilos ↔ metros) y no se pueden comparar.</div> : null}
          <div style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.6 }}>
            Compara la última compra de cada insumo con la anterior, en la misma unidad. Precio sin IVA y con el descuento ya aplicado. «Pesos de más» = lo que subió cada unidad × las unidades de la última compra.
          </div>
        </>
      ) : null}
    </div>
  );
}
