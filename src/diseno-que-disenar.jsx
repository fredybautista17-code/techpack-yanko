// ─── DISEÑO: TARJETA «QUÉ DISEÑAR» DEL MI DÍA ────────────────────────────────────────────────────────────────────
// (2026-11-13, a pedido de Fredy) Dice qué categorías tienen poco trabajo en los módulos de Planta y, descontando lo que Diseño ya tiene en
// camino, cuáles conviene diseñar ya. Solo consulta. El cálculo vive en diseno-que-disenar-calculo.js; la capacidad y las categorías de cada
// módulo y los 3 parámetros se configuran en Planta → Carga por Módulos → ⚙ Configurar módulos (documento config/planta_modulos).
import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { calcularQueDisenar, paramsDeConfig } from "./diseno-que-disenar-calculo";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6",
};
const NIVEL = {
  rojo: { label: "Diseñar ya", color: C.red, bg: C.redBg, txt: "Ya tiene poco trabajo" },
  ambar: { label: "Diseñar pronto", color: C.amber, bg: C.amberBg, txt: "No alcanzará hasta que llegue lo que se diseñe hoy" },
  azul: { label: "Ya hay diseño en camino", color: C.blue, bg: C.blueBg, txt: "Justa, pero Diseño ya tiene diseños en camino" },
  verde: { label: "Cubierta", color: C.green, bg: C.greenBg, txt: "Trabajo de sobra" },
  sin_modulo: { label: "Sin módulo asignado", color: C.slate, bg: "#EDEDF2", txt: "Tiene carga pero ningún módulo la hace" },
};
const fmt = (n) => Number(n || 0).toLocaleString("es-CO");

function useDoc(db, col, id) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, col, id), (s) => setD(s.exists() ? s.data() : null), () => setD(null));
    return () => unsub();
  }, [db, col, id]);
  return d;
}
function useColeccion(db, nombre) {
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, nombre), (snap) => setDatos(snap.docs.map((x) => ({ ...x.data(), id: x.id }))), () => setDatos([]));
    return () => unsub();
  }, [db, nombre]);
  return datos;
}
// Última carga de Planeación (la misma que usa Planta). Se piden pocas para no traer todo el historial.
function useUltimaCarga(db) {
  const [carga, setCarga] = useState(undefined);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "planeacion_cargas"), orderBy("creadoEn", "desc"), limit(3)), (snap) => {
      const lista = snap.docs.map((x) => ({ ...x.data(), id: x.id }));
      setCarga(lista[0] || null);
    }, () => setCarga(null));
    return () => unsub();
  }, [db]);
  return carga;
}

function Barra({ dias, poco, umbral }) {
  const tope = Math.max(umbral * 1.4, (dias || 0) * 1.05, 1);
  const pct = (v) => `${Math.min(100, (v / tope) * 100)}%`;
  return (
    <div style={{ position: "relative", height: 10, background: C.canvas, borderRadius: 6, border: `1px solid ${C.border}` }} title={dias === null ? "Sin capacidad" : `${dias.toFixed(1)} días de trabajo`}>
      <div style={{ width: pct(dias || 0), height: "100%", background: dias === null ? "transparent" : dias < poco ? C.red : dias < umbral ? C.amber : C.green, borderRadius: 6 }} />
      <div style={{ position: "absolute", left: pct(poco), top: -3, bottom: -3, width: 2, background: C.red }} title={`${poco} días: poco trabajo`} />
      <div style={{ position: "absolute", left: pct(umbral), top: -3, bottom: -3, width: 2, background: C.ink }} title={`${umbral} días: lo que tarda un diseño + colchón`} />
    </div>
  );
}

export default function BloqueQueDisenar({ db }) {
  const carga = useUltimaCarga(db);
  const cfg = useDoc(db, "config", "planta_modulos");
  const protos = useColeccion(db, "prototipos");
  const capsulas = useColeccion(db, "capsulas");
  const muestras = useColeccion(db, "cronograma_muestras");
  const [verTodas, setVerTodas] = useState(false);

  const res = useMemo(() => {
    if (carga === undefined || cfg === undefined || !protos || !capsulas || !muestras) return null;
    const catProto = new Map(protos.map((p) => [p.id, p.categoria]));
    const catRef = new Map();
    capsulas.forEach((c) => (c.referencias || []).forEach((r) => catRef.set(r.id, r.categoria)));
    const cronograma = muestras.map((m) => ({ ...m, categoria: m.categoria || (m.kind === "ref" ? catRef.get(m.itemId) : catProto.get(m.itemId)) || "" }));
    return calcularQueDisenar({ carga, modulos: cfg?.modulos || [], protos, cronograma, params: paramsDeConfig(cfg) });
  }, [carga, cfg, protos, capsulas, muestras]);

  if (!res) return <div style={{ padding: 16, color: C.slate, fontSize: 13 }}>Calculando…</div>;
  const { filas, params, habiles, umbral } = res;
  const sinConfig = !(cfg?.modulos || []).some((m) => (m.categorias || []).length && Number(m.capacidadDia) > 0);
  const urgentes = filas.filter((f) => f.nivel === "rojo" || f.nivel === "ambar");
  const lista = verTodas ? filas : filas.filter((f) => f.nivel !== "verde");
  const cuenta = (n) => filas.filter((f) => f.nivel === n).length;

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
        Categorías con poco trabajo en los módulos de Planta. «Poco» = menos de <b>{params.poco} días</b> de trabajo; un diseño tarda <b>{params.lead} días</b> (≈ {habiles} hábiles) en llegar a planta, así que se avisa
        también cuando <b>no alcanzará hasta que llegue lo que se diseñe hoy</b>. Cuenta lo que Diseño ya tiene en camino (aprobados sin cápsula y muestras en curso).
      </div>

      {sinConfig && (
        <div style={{ padding: "12px 14px", background: C.amberBg, border: `1px solid ${C.amber}55`, borderRadius: 10, color: C.amber, fontSize: 13, fontWeight: 700, marginBottom: 14, lineHeight: 1.5 }}>
          Falta configurar los módulos: en Planta → Carga por Módulos → ⚙ Configurar módulos pon la capacidad por día y las categorías que hace cada módulo. Mientras tanto no se pueden calcular los días de trabajo.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        {[["rojo", "🔴"], ["ambar", "🟠"], ["azul", "🔵"], ["verde", "🟢"]].map(([n, ic]) => (
          <div key={n} style={{ background: NIVEL[n].bg, borderRadius: 12, padding: "12px 14px", border: `1px solid ${NIVEL[n].color}22` }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: NIVEL[n].color, lineHeight: 1 }}>{cuenta(n)}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, marginTop: 4 }}>{ic} {NIVEL[n].label}</div>
          </div>
        ))}
      </div>

      {urgentes.length > 0 && (
        <div style={{ padding: "10px 14px", background: C.white, border: `1.5px solid ${C.red}55`, borderRadius: 10, fontSize: 13, color: C.ink, marginBottom: 14 }}>
          <b>Para diseñar primero:</b> {urgentes.slice(0, 5).map((f) => f.categoria).join(", ")}{urgentes.length > 5 ? ` y ${urgentes.length - 5} más` : ""}.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: C.slate, marginBottom: 8, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 3, background: C.red, marginRight: 4 }} />{params.poco} días: poco trabajo</span>
        <span><span style={{ display: "inline-block", width: 10, height: 3, background: C.ink, marginRight: 4 }} />{umbral} días: lo que tarda un diseño + colchón</span>
        {carga ? <span>Carga de Planeación del {carga.fecha || "—"}</span> : <span style={{ color: C.amber, fontWeight: 700 }}>No hay carga de Planeación cargada</span>}
        <button onClick={() => setVerTodas((v) => !v)} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${C.border}`, background: C.white, color: C.ink, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{verTodas ? "Ver solo las que requieren diseño" : "Ver todas las categorías"}</button>
      </div>

      {!lista.length ? (
        <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          {filas.length ? "Todas las categorías tienen trabajo de sobra. ✅" : "No hay categorías con carga en Planta Yanko."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lista.map((f) => {
            const nv = NIVEL[f.nivel];
            return (
              <div key={f.clave} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1.1fr) minmax(140px, 2fr) minmax(120px, 1.4fr)", gap: 14, alignItems: "center", padding: "12px 14px", background: C.white, border: `1px solid ${C.border}`, borderLeft: `4px solid ${nv.color}`, borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>{f.categoria}</div>
                  <span style={{ display: "inline-block", marginTop: 4, padding: "2px 10px", borderRadius: 20, background: nv.bg, color: nv.color, fontWeight: 700, fontSize: 11 }}>{nv.label}</span>
                </div>
                <div>
                  <Barra dias={f.dias} poco={params.poco} umbral={umbral} />
                  <div style={{ fontSize: 12, color: C.slate, marginTop: 6 }}>
                    {f.dias === null ? `${fmt(f.und)} und en planta · ningún módulo la hace` : <><b style={{ color: C.ink }}>{f.dias.toFixed(1)} días</b> de trabajo · {fmt(f.und)} und en planta</>}
                  </div>
                  <div style={{ fontSize: 11, color: C.slate }}>{f.modulos.length ? `Módulos: ${f.modulos.map((m) => m.nombre).join(", ")}` : "Sin módulos asignados"}</div>
                </div>
                <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.5 }}>
                  <div><b style={{ color: C.ink }}>En camino en Diseño: {f.enCamino}</b></div>
                  <div>{f.aprobados.length} aprobado{f.aprobados.length === 1 ? "" : "s"} sin cápsula · {f.muestras} muestra{f.muestras === 1 ? "" : "s"} en curso</div>
                  <div style={{ color: nv.color, fontWeight: 700 }}>{nv.txt}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
