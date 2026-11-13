// ─── DISEÑO: MUESTRAS POR DISEÑADORA y SOLICITUDES DE TELA (tarjetas del «Mi Día») ───────────────────────────────
// (2026-11-13, a pedido de Fredy)
//  · BloqueMuestrasDisenadoras: qué muestras está haciendo cada diseñadora (en taller, por revisar, por modificar, vencidas).
//    Lee «cronograma_muestras» y la diseñadora sale del prototipo / referencia (assignedTo). Solo lectura.
//  · BloqueCronogramaMuestras (2026-11-13): el Cronograma de Muestras en el Mi Día, por taller o por semana de entrega. Solo consulta.
//  · BloqueSolicitudesTela: solicitudes creadas al «Promover para programación de tela» (colección «solicitudes_tela»).
//    Solo lectura: el estado de la tela se cambia desde el prototipo (Diseño → Prototipos).
import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#6B4FA0", violetBg: "#F1ECF8",
};
const ESTADO = {
  pendiente: { label: "Sin asignar", color: C.slate, bg: "#EDEDF2" },
  asignado: { label: "En taller", color: C.amber, bg: C.amberBg },
  recibida: { label: "Por revisar", color: C.violet, bg: C.violetBg },
  modificar: { label: "A modificar", color: C.red, bg: C.redBg },
};
const TELA = {
  por_programar: { label: "Por programar", color: C.amber, bg: C.amberBg },
  programada: { label: "Programada", color: C.blue, bg: C.blueBg },
  en_camino: { label: "Tela en camino", color: C.violet, bg: C.violetBg },
  llego: { label: "Llegó", color: C.green, bg: C.greenBg },
};
const DIAS_REVISION = 2;
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "left", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.canvas };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" };
const norm = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fechaCorta = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
function diasDesde(iso) {
  if (!iso) return 0;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return 0;
  const hoy = new Date();
  return Math.max(0, Math.floor((Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - Date.UTC(y, m - 1, d)) / 86400000));
}
function Pill({ def }) {
  return <span style={{ padding: "2px 10px", borderRadius: 20, background: def.bg, color: def.color, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{def.label}</span>;
}
function Kpi({ icon, label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.slate, marginTop: 4, fontWeight: 700 }}>{label}</div>
    </div>
  );
}
function useColeccion(db, nombre) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const unsub = onSnapshot(collection(db, nombre), (snap) => setDatos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))), (e) => setError(e?.message || `No se pudo leer ${nombre}.`));
    return () => unsub();
  }, [db, nombre]);
  return [datos, error];
}

export function BloqueMuestrasDisenadoras({ db, currentUser, onAbrir, puedeAbrir }) {
  const [muestras, e1] = useColeccion(db, "cronograma_muestras");
  const [protos, e2] = useColeccion(db, "prototipos");
  const [capsulas, e3] = useColeccion(db, "capsulas");
  const [soloMias, setSoloMias] = useState(false);
  const error = e1 || e2 || e3;
  const hoy = isoLocal(new Date());
  // Clic para llegar a donde está la muestra (prototipo, referencia de cápsula o, si no tiene vínculo, el Cronograma de Muestras).
  const destino = (m) => (m.kind === "ref" && m.itemId && m.capsulaId ? { kind: "ref", itemId: m.itemId, capsulaId: m.capsulaId } : m.kind === "proto" && m.itemId ? { kind: "proto", itemId: m.itemId } : { kind: "cronograma" });
  const puedeClic = (m) => !!(onAbrir && puedeAbrir && puedeAbrir[destino(m).kind]);
  const atributosClic = (m) => (puedeClic(m) ? { onClick: () => onAbrir(destino(m)), role: "button", tabIndex: 0, title: "Abrir en Diseño", onKeyDown: (e) => { if (e.key === "Enter") onAbrir(destino(m)); } } : {});

  const porDisenadora = useMemo(() => {
    if (!muestras || !protos || !capsulas) return null;
    const disProto = new Map(protos.map((p) => [p.id, p.assignedTo]));
    const disRef = new Map();
    capsulas.forEach((c) => (c.referencias || []).forEach((r) => disRef.set(r.id, r.assignedTo)));
    const mapa = new Map();
    muestras
      .filter((m) => ["pendiente", "asignado", "recibida", "modificar"].includes(m.estado || "pendiente"))
      .forEach((m) => {
        const nombre = (m.kind === "ref" ? disRef.get(m.itemId) : disProto.get(m.itemId)) || m.disenador || "Sin diseñadora asignada";
        const estado = m.estado || "pendiente";
        const esperando = estado === "recibida" ? diasDesde(m.fechaRecibida) : 0;
        const vencida = ["pendiente", "asignado"].includes(estado) && !!m.fechaEntrega && m.fechaEntrega < hoy;
        mapa.set(nombre, [...(mapa.get(nombre) || []), { ...m, estado, esperando, vencida, atrasadaRevision: estado === "recibida" && esperando > DIAS_REVISION }]);
      });
    return [...mapa.entries()]
      .map(([nombre, items]) => ({ nombre, items: items.sort((a, b) => (a.fechaEntrega || "9999").localeCompare(b.fechaEntrega || "9999")) }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [muestras, protos, capsulas, hoy]);

  if (error) return <div style={{ padding: 16, color: C.red, fontSize: 13 }}>{error}</div>;
  if (!porDisenadora) return <div style={{ padding: 16, color: C.slate, fontSize: 13 }}>Cargando muestras…</div>;

  const miNombre = norm(currentUser?.name);
  const hayMias = !!miNombre && porDisenadora.some((d) => norm(d.nombre) === miNombre);
  const lista = porDisenadora.filter((d) => !soloMias || norm(d.nombre) === miNombre);
  const todas = lista.flatMap((d) => d.items);
  const porRevisar = todas.filter((m) => m.estado === "recibida").length;
  const revisionAtrasada = todas.filter((m) => m.atrasadaRevision).length;
  const vencidas = todas.filter((m) => m.vencida).length;

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
        Muestras que cada diseñadora tiene en curso: en taller, recibidas por revisar y devueltas para modificar. Las recibidas con más de {DIAS_REVISION} días sin revisión de diseño salen en rojo.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Kpi icon="🧵" label="Muestras en curso" value={todas.length} color={C.blue} bg={C.blueBg} />
        <Kpi icon="🔍" label="Por revisar (diseño)" value={porRevisar} color={C.violet} bg={C.violetBg} />
        <Kpi icon="🔴" label={`Revisión con más de ${DIAS_REVISION} días`} value={revisionAtrasada} color={C.red} bg={C.redBg} />
        <Kpi icon="⏰" label="Entrega vencida (en taller)" value={vencidas} color={C.amber} bg={C.amberBg} />
      </div>
      {onAbrir && puedeAbrir && !puedeAbrir.proto && !puedeAbrir.ref && <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 10 }}>Sin acceso a Diseño: desde aquí no se pueden abrir las muestras.</div>}
      {hayMias && (
        <button onClick={() => setSoloMias(!soloMias)} style={{ marginBottom: 12, padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${soloMias ? C.ink : C.border}`, background: soloMias ? C.ink : C.white, color: soloMias ? C.white : C.ink }}>Solo las mías</button>
      )}
      {!lista.length ? (
        <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>No hay muestras en curso. ✅</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
          {lista.map((d) => {
            const cuenta = (e) => d.items.filter((m) => m.estado === e).length;
            return (
              <div key={d.nombre} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: C.canvas, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 14 }}>{d.nombre}</b>
                  <span style={{ fontSize: 12, color: C.slate }}>{d.items.length} en curso · {cuenta("asignado") + cuenta("pendiente")} en taller · {cuenta("recibida")} por revisar · {cuenta("modificar")} a modificar</span>
                </div>
                {d.items.map((m) => (
                  <div key={m.id} {...atributosClic(m)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap", fontSize: 13, cursor: puedeClic(m) ? "pointer" : "default" }}>
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <b>{m.referencia || "—"}</b> <span style={{ color: C.slate }}>{m.nombre}</span>
                      <div style={{ fontSize: 11, color: C.slate }}>{m.taller || "Sin taller"}{m.cliente ? ` · ${m.cliente}` : ""}</div>
                    </div>
                    {puedeClic(m) && <span style={{ fontSize: 12, fontWeight: 800, color: C.blue }}>Abrir ›</span>}
                    <Pill def={ESTADO[m.estado] || ESTADO.pendiente} />
                    {m.estado === "recibida" ? (
                      <span style={{ fontSize: 12, fontWeight: 800, color: m.atrasadaRevision ? C.red : C.violet }}>{m.esperando === 0 ? "hoy" : `${m.esperando} d`} esperando</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: m.vencida ? C.red : C.slate }}>{m.fechaEntrega ? `Entrega ${fechaCorta(m.fechaEntrega)}` : "Sin fecha"}{m.vencida ? " · vencida" : ""}</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BloqueSolicitudesTela({ db, onAbrir, puedeAbrir }) {
  const [solicitudes, error] = useColeccion(db, "solicitudes_tela");
  const [verLlegaron, setVerLlegaron] = useState(false);
  if (error) return <div style={{ padding: 16, color: C.red, fontSize: 13 }}>{error}</div>;
  if (!solicitudes) return <div style={{ padding: 16, color: C.slate, fontSize: 13 }}>Cargando solicitudes…</div>;
  const filas = solicitudes.filter((x) => (verLlegaron ? x.estado === "llego" : x.estado !== "llego")).sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const pendientes = solicitudes.filter((x) => x.estado !== "llego");
  const porProgramar = pendientes.filter((x) => (x.estado || "por_programar") === "por_programar").length;
  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
        Solicitudes de tela que salen cuando Diseño promueve un prototipo «para programación de tela». El estado de la tela se actualiza desde el prototipo (Diseño → Prototipos → En programación de tela).
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Kpi icon="🧵" label="Solicitudes abiertas" value={pendientes.length} color={C.violet} bg={C.violetBg} />
        <Kpi icon="🟠" label="Por programar" value={porProgramar} color={C.amber} bg={C.amberBg} />
        <Kpi icon="🚚" label="Tela en camino" value={pendientes.filter((x) => x.estado === "en_camino").length} color={C.blue} bg={C.blueBg} />
      </div>
      {onAbrir && puedeAbrir && !puedeAbrir.proto && <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 10 }}>Sin acceso a Diseño: desde aquí no se puede abrir el prototipo.</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[[false, "Abiertas"], [true, "Ya llegaron"]].map(([v, l]) => (
          <button key={l} onClick={() => setVerLlegaron(v)} style={{ padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${verLlegaron === v ? C.ink : C.border}`, background: verLlegaron === v ? C.ink : C.white, color: verLlegaron === v ? C.white : C.ink }}>{l}</button>
        ))}
      </div>
      {!filas.length ? (
        <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13, background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>{verLlegaron ? "Todavía no ha llegado ninguna." : "No hay solicitudes de tela abiertas. ✅"}</div>
      ) : (
        <div style={{ overflow: "auto", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead><tr><th style={th}>Prototipo</th><th style={th}>Cliente</th><th style={th}>Tela</th><th style={th}>Proveedor · país</th><th style={th}>Fecha esperada</th><th style={th}>Estado</th><th style={th}>Solicitada</th></tr></thead>
            <tbody>
              {filas.map((x) => (
                <tr key={x.id} onClick={onAbrir && puedeAbrir?.proto && x.protoId ? () => onAbrir({ kind: "proto", itemId: x.protoId }) : undefined} title={onAbrir && puedeAbrir?.proto && x.protoId ? "Abrir el prototipo en Diseño" : undefined} style={{ cursor: onAbrir && puedeAbrir?.proto && x.protoId ? "pointer" : "default" }}>
                  <td style={td}><b style={{ color: onAbrir && puedeAbrir?.proto && x.protoId ? C.blue : C.ink }}>{x.referencia || x.numPrototipo || "—"}</b><div style={{ fontSize: 11, color: C.slate }}>{x.nombre}</div></td>
                  <td style={td}>{x.cliente || "—"}</td>
                  <td style={td}>{x.tela || "—"}</td>
                  <td style={td}>{[x.proveedor, x.pais].filter(Boolean).join(" · ") || "—"}</td>
                  <td style={td}>{fechaCorta(x.fechaEsperada)}</td>
                  <td style={td}><Pill def={TELA[x.estado] || TELA.por_programar} /></td>
                  <td style={td}>{fechaCorta(x.fecha)}{x.solicitadoPor ? <div style={{ fontSize: 11, color: C.slate }}>{x.solicitadoPor}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Cronograma de muestras en el Mi Día (por taller / por semana de entrega) ───────────────────────────────────
const ACTIVOS = ["pendiente", "asignado", "recibida", "modificar"];
const diasEntreISO = (a, b2) => {
  const f = (x) => { const [y, m, d] = String(x).slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((f(a) - f(b2)) / 86400000);
};
const GRUPOS_SEMANA = [["venc", "Vencidas", C.red, C.redBg], ["rev", "Por revisar (recibidas del taller)", C.violet, C.violetBg], ["mod", "A modificar", C.red, C.redBg], ["sem", "Esta semana", C.amber, C.amberBg], ["prox", "Próxima semana", C.blue, C.blueBg], ["mas", "Más adelante", C.slate, C.canvas], ["sin", "Sin fecha de entrega", C.slate, C.canvas]];

export function BloqueCronogramaMuestras({ db, currentUser, onAbrir, puedeAbrir }) {
  const [muestras, e1] = useColeccion(db, "cronograma_muestras");
  const [protos, e2] = useColeccion(db, "prototipos");
  const [capsulas, e3] = useColeccion(db, "capsulas");
  const [talleresCfg, setTalleresCfg] = useState([]);
  const [vista, setVista] = useState("taller");
  const [q, setQ] = useState("");
  const [fTaller, setFTaller] = useState("");
  const [fDis, setFDis] = useState("");
  const [abiertos, setAbiertos] = useState({});
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "main"), (s) => setTalleresCfg(Array.isArray(s.data()?.talleresMuestra) ? s.data().talleresMuestra : []), () => {});
    return () => unsub();
  }, [db]);
  const error = e1 || e2 || e3;
  const hoy = isoLocal(new Date());
  const destino = (m) => (m.kind === "ref" && m.itemId && m.capsulaId ? { kind: "ref", itemId: m.itemId, capsulaId: m.capsulaId } : m.kind === "proto" && m.itemId ? { kind: "proto", itemId: m.itemId } : { kind: "cronograma" });
  const puedeClic = (m) => !!(onAbrir && puedeAbrir && puedeAbrir[destino(m).kind]);

  const filas = useMemo(() => {
    if (!muestras || !protos || !capsulas) return null;
    const disProto = new Map(protos.map((p) => [p.id, p.assignedTo]));
    const disRef = new Map();
    capsulas.forEach((c) => (c.referencias || []).forEach((r) => disRef.set(r.id, r.assignedTo)));
    return muestras.filter((m) => ACTIVOS.includes(m.estado || "pendiente")).map((m) => {
      const estado = m.estado || "pendiente";
      const dias = m.fechaEntrega ? diasEntreISO(m.fechaEntrega, hoy) : null;
      const vencida = ["pendiente", "asignado"].includes(estado) && dias !== null && dias < 0;
      const grupo = vencida ? "venc" : estado === "recibida" ? "rev" : estado === "modificar" ? "mod" : dias === null ? "sin" : dias <= 7 ? "sem" : dias <= 14 ? "prox" : "mas";
      return { ...m, estado, dias, vencida, grupo, tallerTxt: m.taller || "Sin taller", disenadora: (m.kind === "ref" ? disRef.get(m.itemId) : disProto.get(m.itemId)) || m.disenador || "", esperando: estado === "recibida" ? diasDesde(m.fechaRecibida) : 0 };
    });
  }, [muestras, protos, capsulas, hoy]);

  if (error) return <div style={{ padding: 16, color: C.red, fontSize: 13 }}>{error}</div>;
  if (!filas) return <div style={{ padding: 16, color: C.slate, fontSize: 13 }}>Cargando cronograma…</div>;

  const talleres = [...new Set([...talleresCfg, ...filas.map((m) => m.taller).filter(Boolean)])].sort();
  const disenadoras = [...new Set(filas.map((m) => m.disenadora).filter(Boolean))].sort();
  const sinTrabajo = talleres.filter((t) => !filas.some((m) => m.taller === t && ["pendiente", "asignado", "modificar"].includes(m.estado)));
  const tq = norm(q);
  const L = filas.filter((m) => (!fTaller || m.tallerTxt === fTaller) && (!fDis || m.disenadora === fDis) && (!tq || norm(`${m.referencia} ${m.nombre} ${m.cliente} ${m.taller}`).includes(tq)));
  const esSemana = L.filter((m) => ["pendiente", "asignado"].includes(m.estado) && m.dias !== null && m.dias >= 0 && m.dias <= 7).length;
  const vencidas = L.filter((m) => m.vencida).length;
  const porRevisar = L.filter((m) => m.estado === "recibida").length;
  const ordenFecha = (a, b2) => (a.fechaEntrega || "9999").localeCompare(b2.fechaEntrega || "9999");
  const hayAcceso = !!(puedeAbrir && (puedeAbrir.proto || puedeAbrir.ref || puedeAbrir.cronograma));

  async function exportar() {
    const XLSX = await import("xlsx");
    const cab = ["Taller", "Referencia", "Nombre", "Cliente", "Diseñadora", "Estado", "Fecha de entrega", "Vencida"];
    const ws = XLSX.utils.aoa_to_sheet([cab, ...[...L].sort((a, b2) => a.tallerTxt.localeCompare(b2.tallerTxt) || ordenFecha(a, b2)).map((m) => [m.tallerTxt, m.referencia || "", m.nombre || "", m.cliente || "", m.disenadora || "", (ESTADO[m.estado] || ESTADO.pendiente).label, m.fechaEntrega ? fechaCorta(m.fechaEntrega) : "", m.vencida ? "Sí" : ""])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cronograma de muestras");
    XLSX.writeFile(wb, `Cronograma_muestras_${hoy}.xlsx`);
  }

  const fila = (m) => (
    <div key={m.id} onClick={puedeClic(m) ? () => onAbrir(destino(m)) : undefined} role={puedeClic(m) ? "button" : undefined} tabIndex={puedeClic(m) ? 0 : undefined} onKeyDown={puedeClic(m) ? (e) => { if (e.key === "Enter") onAbrir(destino(m)); } : undefined}
      title={puedeClic(m) ? "Abrir en Diseño" : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderTop: `1px solid ${C.border}`, flexWrap: "wrap", fontSize: 13, cursor: puedeClic(m) ? "pointer" : "default" }}>
      <div style={{ flex: "1 1 190px", minWidth: 0 }}>
        <b style={{ color: puedeClic(m) ? C.blue : C.ink }}>{m.referencia || "—"} <span style={{ fontWeight: 600 }}>{m.nombre}</span>{puedeClic(m) ? " ›" : ""}</b>
        <div style={{ fontSize: 11, color: C.slate }}>{vista === "semana" ? `${m.tallerTxt} · ` : ""}{m.cliente || "Sin cliente"}{m.disenadora ? ` · ${m.disenadora}` : ""}</div>
      </div>
      <Pill def={ESTADO[m.estado] || ESTADO.pendiente} />
      <div style={{ flex: "0 0 128px", textAlign: "right", fontSize: 12, fontWeight: 700, color: m.vencida || (m.estado === "recibida" && m.esperando > DIAS_REVISION) ? C.red : C.ink }}>
        {m.estado === "recibida" ? `${m.esperando === 0 ? "Recibida hoy" : `${m.esperando} d esperando`}` : m.estado === "modificar" ? "Devuelta al taller" : m.fechaEntrega ? `${m.vencida ? "Vencida · " : ""}${fechaCorta(m.fechaEntrega)}` : "Sin fecha"}
        {["pendiente", "asignado"].includes(m.estado) && m.dias !== null && <div style={{ fontSize: 11, fontWeight: 600, color: C.slate }}>{m.dias < 0 ? `${-m.dias} d de atraso` : m.dias === 0 ? "hoy" : `en ${m.dias} d`}</div>}
      </div>
    </div>
  );
  const BOT = { padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink };

  return (
    <div>
      <div style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.5 }}>
        El Cronograma de Muestras a la vista: lo que cada taller tiene en curso y lo que se entrega cada semana. Es solo consulta; recibir, revisar o cerrar una muestra se hace en su detalle o en el Cronograma.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Kpi icon="🧵" label="Muestras en curso" value={L.length} color={C.blue} bg={C.blueBg} />
        <Kpi icon="📅" label="Entregan esta semana" value={esSemana} color={C.amber} bg={C.amberBg} />
        <Kpi icon="⏰" label="Vencidas" value={vencidas} color={C.red} bg={C.redBg} />
        <Kpi icon="🔍" label="Por revisar" value={porRevisar} color={C.violet} bg={C.violetBg} />
        <Kpi icon="🪑" label="Talleres sin trabajo" value={sinTrabajo.length} color={C.green} bg={C.greenBg} />
      </div>
      {onAbrir && puedeAbrir && !hayAcceso && <div style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginBottom: 10 }}>Sin acceso a Diseño: desde aquí no se pueden abrir las muestras.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Buscar referencia o cliente…" style={{ flex: "1 1 180px", minWidth: 0, padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
        <select value={fTaller} onChange={(e) => setFTaller(e.target.value)} style={{ ...BOT, fontWeight: 600 }}><option value="">Todos los talleres</option>{[...new Set([...talleres, ...(filas.some((m) => !m.taller) ? ["Sin taller"] : [])])].map((t) => <option key={t} value={t}>{t}</option>)}</select>
        {disenadoras.length > 1 && <select value={fDis} onChange={(e) => setFDis(e.target.value)} style={{ ...BOT, fontWeight: 600 }}><option value="">Todas las diseñadoras</option>{disenadoras.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
        <div style={{ display: "flex", gap: 6 }}>
          {[["taller", "Por taller"], ["semana", "Por semana"]].map(([v, l]) => <button key={v} onClick={() => setVista(v)} style={{ ...BOT, background: vista === v ? C.ink : C.white, color: vista === v ? C.white : C.ink, borderColor: vista === v ? C.ink : C.border }}>{l}</button>)}
        </div>
        <button onClick={exportar} disabled={!L.length} style={{ ...BOT, opacity: L.length ? 1 : 0.5 }}>📥 Excel</button>
        {onAbrir && puedeAbrir?.cronograma && <button onClick={() => onAbrir({ kind: "cronograma" })} style={BOT}>Abrir cronograma completo ›</button>}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, overflow: "hidden" }}>
        {vista === "taller" ? (
          (() => {
            const lista = (fTaller ? talleres.concat(filas.some((m) => !m.taller) ? ["Sin taller"] : []).filter((t) => t === fTaller) : [...talleres, ...(filas.some((m) => !m.taller) ? ["Sin taller"] : [])]);
            if (!lista.length) return <div style={{ padding: 26, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay talleres ni muestras en curso.</div>;
            return lista.map((t, i) => {
              const ms = L.filter((m) => m.tallerTxt === t).sort(ordenFecha);
              const libre = sinTrabajo.includes(t);
              const ven = ms.filter((m) => m.vencida).length;
              const abierto = abiertos[t] !== undefined ? abiertos[t] : ven > 0 || (i === 0 && ms.length > 0);
              return (
                <div key={t}>
                  <div onClick={() => setAbiertos({ ...abiertos, [t]: !abierto })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: C.canvas, borderTop: i ? `1px solid ${C.border}` : "none", cursor: "pointer", flexWrap: "wrap" }}>
                    <span style={{ width: 14, color: C.slate }}>{abierto ? "▾" : "▸"}</span>
                    <b style={{ fontSize: 14 }}>{t}</b>
                    <span style={{ padding: "2px 10px", borderRadius: 20, background: C.blueBg, color: C.blue, fontWeight: 800, fontSize: 11 }}>{ms.length} muestra{ms.length === 1 ? "" : "s"}</span>
                    {ven > 0 && <span style={{ padding: "2px 10px", borderRadius: 20, background: C.redBg, color: C.red, fontWeight: 800, fontSize: 11 }}>{ven} vencida{ven === 1 ? "" : "s"}</span>}
                    {libre && !tq && !fDis && <span style={{ padding: "2px 10px", borderRadius: 20, background: C.amberBg, color: C.amber, fontWeight: 800, fontSize: 11 }}>Sin trabajo</span>}
                  </div>
                  {abierto && (ms.length ? ms.map(fila) : <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: C.amberBg, color: C.amber, fontWeight: 700, fontSize: 13 }}>Sin muestras. Este taller está libre: se le puede mandar una muestra.</div>)}
                </div>
              );
            });
          })()
        ) : (
          !L.length ? <div style={{ padding: 26, textAlign: "center", color: C.slate, fontSize: 13 }}>No hay muestras en curso. ✅</div>
            : GRUPOS_SEMANA.map(([k, etiqueta, color, bg]) => {
              const ms = L.filter((m) => m.grupo === k).sort(ordenFecha);
              if (!ms.length) return null;
              return (
                <div key={k}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: C.canvas, borderTop: `1px solid ${C.border}`, fontWeight: 800 }}>
                    <span>{etiqueta}</span><span style={{ padding: "2px 10px", borderRadius: 20, background: bg, color, fontWeight: 800, fontSize: 11 }}>{ms.length}</span>
                  </div>
                  {ms.map(fila)}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
