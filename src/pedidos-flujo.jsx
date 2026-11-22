// ─── FLUJO DE PEDIDOS · primera pantalla del área «Pedidos» ──────────────────────────────────────────────────────
// (2026-11-22, a pedido de Fredy) Dónde está todo el trabajo hoy, en el orden del proceso, con el número de pendientes en cada etapa:
//   Por montar (referencias aprobadas en cápsulas que aún no están en una preorden) → Preórdenes (por aprobar) → Órdenes (aprobadas con referencias sin pedido)
//   → Pedidos activos → Por cortar (unidades pendientes, con el aviso del candado de corte).
// Solo LEE lo que ya existe (cápsulas, preórdenes, pedidos y el avance de corte que ya calcula ATLAS); no cambia ningún dato.
// Al tocar una tarjeta se abre su lista abajo; «Pasar a Preorden» usa el mismo paso de Cápsulas.
import React, { useEffect, useMemo, useState } from "react";
import useAnchoCorto from "./use-ancho-corto";
import { CandadoCorteContext, useCandadoCorte } from "./ficha-candado";
import { itemsDePedido } from "./ficha-inicio-calculo";

const C = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", green: "#2D9E6B", greenBg: "#EBF7F2", amber: "#C47C1A", amberBg: "#FBF3E4", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7", grey: "#B9B3A8", greyBg: "#EFEBE4" };
const SOMBRA = "0 1px 2px rgba(26,26,46,.05),0 4px 14px rgba(26,26,46,.06)";
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const hoyISO = () => new Date().toISOString().slice(0, 10);
const dias = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const fecha = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

function Etiqueta({ tipo, children, title }) {
  const t = { a: [C.amber, C.amberBg], r: [C.red, C.redBg], v: [C.green, C.greenBg], b: [C.blue, C.blueBg], g: [C.slate, C.greyBg] }[tipo] || [C.slate, C.greyBg];
  return <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: t[0], background: t[1], borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{children}</span>;
}
function Boton({ children, onClick, pri, title }) {
  return <button type="button" title={title} onClick={onClick} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 11.5, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit", background: pri ? C.ink : C.greyBg, color: pri ? C.white : C.ink }}>{children}</button>;
}

export default function PedidosFlujo({ capsulas, preordenes, pedidos, etapaInicial, puedePasarAPreorden, onPasarAPreorden, onIrVista, onAbrirPedido, fechaAprobacion, cargarAvance, calcularAvance, protos, clienteDeCapsula, onAbrirCapsula, onAbrirProto }) {
  const corto = useAnchoCorto(900);
  const [sel, setSel] = useState(etapaInicial || "montar");
  useEffect(() => { if (etapaInicial) setSel(etapaInicial); }, [etapaInicial]);
  const [avance, setAvance] = useState(null);
  useEffect(() => {
    let vivo = true;
    Promise.resolve(cargarAvance ? cargarAvance(false) : null).then((d) => { if (vivo && d) setAvance(d); }).catch(() => {});
    return () => { vivo = false; };
  }, [cargarAvance]);
  const hoy = hoyISO();

  // 1) Por montar: referencias aprobadas en cápsulas sin enviar a preorden (la más antigua primero)
  const montar = useMemo(() => {
    const out = [];
    (capsulas || []).forEach((cap) => (cap.referencias || []).forEach((ref) => {
      if (ref.status !== "aprobado" || ref.enviadoAPreorden) return;
      const ap = fechaAprobacion ? fechaAprobacion(ref) : "";
      out.push({ cap, ref, ap, esperando: ap ? Math.max(0, dias(ap, hoy)) : null });
    }));
    return out.sort((a, b) => (b.esperando ?? -1) - (a.esperando ?? -1));
  }, [capsulas, fechaAprobacion, hoy]);
  // 2) Preórdenes por aprobar  3) Órdenes: aprobadas con referencias que aún no están en un pedido
  const pre = useMemo(() => (preordenes || []).filter((p) => (p.estado || "montada") !== "aprobada"), [preordenes]);
  const ord = useMemo(() => {
    const aprob = (preordenes || []).filter((p) => (p.estado || "montada") === "aprobada");
    const enPedido = new Set();
    (pedidos || []).forEach((p) => itemsDePedido(p, aprob).forEach(({ preorden, item }) => enPedido.add(`${preorden.id}|${item.itemId}`)));
    return aprob.map((p) => {
      const items = p.items || [];
      const sin = items.filter((it) => !enPedido.has(`${p.id}|${it.itemId}`) && !it.pedidoVinculado?.numero).length;
      return { p, refs: items.length, sin };
    }).filter((o) => o.sin > 0);
  }, [preordenes, pedidos]);
  // 4) Pedidos activos  5) Por cortar
  const activos = useMemo(() => (pedidos || []).filter((p) => !p.estado || p.estado === "activo"), [pedidos]);
  const cortar = useMemo(() => {
    if (!avance || !calcularAvance) return null;
    return activos.map((p) => { const a = calcularAvance(p, avance); return { p, total: a.total || 0, cortado: a.cortado || 0, pend: Math.max(0, (a.total || 0) - (a.cortado || 0)) }; })
      .filter((x) => x.pend > 0)
      .sort((a, b) => String(a.p.fechaDespacho || "9999").localeCompare(String(b.p.fechaDespacho || "9999")));
  }, [activos, avance, calcularAvance]);
  const candado = useCandadoCorte((p) => { const x = cortar && cortar.find((y) => y.p.id === p.id); return x ? x.cortado > 0 : true; });
  const noPueden = cortar ? cortar.filter((x) => { const i = candado.infoDe(x.p); return i && !i.libre; }).length : 0;
  const vencidos = activos.filter((p) => p.fechaDespacho && p.fechaDespacho < hoy).length;
  const porVencer = activos.filter((p) => p.fechaDespacho && p.fechaDespacho >= hoy && dias(hoy, p.fechaDespacho) <= 7).length;
  const viejas = montar.filter((m) => (m.esperando ?? 0) >= 7).length;
  const sinPedidoTot = ord.reduce((s, o) => s + o.sin, 0);

  const etapas = [
    { id: "montar", ic: "🧩", nm: "Por montar", n: montar.length, sb: "Referencias aprobadas en cápsulas que aún no están en una preorden", color: montar.length ? C.amber : C.ink, tags: [montar.length ? <Etiqueta key="a" tipo="a">{montar.length} esperando</Etiqueta> : null, viejas ? <Etiqueta key="b" tipo="r">{viejas} con más de 7 días</Etiqueta> : null] },
    { id: "pre", ic: "🧾", nm: "Preórdenes", n: pre.length, sb: "Montadas, esperando la aprobación del cliente", color: C.ink, tags: [] },
    { id: "ord", ic: "🧵", nm: "Órdenes", n: ord.length, sb: "Aprobadas con referencias que aún no están en un pedido", color: C.ink, tags: [sinPedidoTot ? <Etiqueta key="a" tipo="b">{sinPedidoTot} refs sin pedido</Etiqueta> : null] },
    { id: "ped", ic: "📦", nm: "Pedidos activos", n: activos.length, sb: "", color: C.ink, tags: [vencidos ? <Etiqueta key="a" tipo="r">{vencidos} vencido{vencidos === 1 ? "" : "s"}</Etiqueta> : null, porVencer ? <Etiqueta key="b" tipo="a">{porVencer} por vencer</Etiqueta> : null] },
    { id: "cor", ic: "✂", nm: "Por cortar", n: cortar ? fmt(cortar.reduce((s, x) => s + x.pend, 0)) : "…", sb: cortar ? "unidades pendientes por cortar" : "Cargando el avance de corte…", color: noPueden ? C.red : C.ink, tags: [noPueden ? <Etiqueta key="a" tipo="r">🚫 {noPueden} no pueden salir</Etiqueta> : null] },
  ];

  const th = { padding: "9px 12px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, fontWeight: 700, textAlign: "left", borderBottom: `1px solid ${C.border}`, background: "#FAF8F4" };
  const td = { padding: "10px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 13, verticalAlign: "middle" };
  const Tabla = ({ cols, filas }) => (
    <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
      <thead><tr>{cols.map((c, i) => <th key={i} style={th}>{c}</th>)}</tr></thead>
      <tbody>{filas}</tbody>
    </table></div>
  );
  const sub = (t) => <div style={{ fontSize: 11, color: C.slate, fontWeight: 600 }}>{t}</div>;

  let lista = null;
  if (sel === "montar") {
    lista = (
      <>
        <Cab icono="🧩" titulo="Referencias por montar en una preorden" n={montar.length} nota="Aprobadas en cápsulas y todavía sin preorden. La que más lleva esperando va primero." />
        {!montar.length ? <Vacio t="No hay referencias esperando: todo lo aprobado ya está en una preorden. 🎉" /> : (
          <Tabla cols={["Referencia", "Cápsula", "Cliente", "Esperando", ""]} filas={montar.map(({ cap, ref, esperando }) => {
            // (2026-11-22, a pedido de Fredy) Se ve y se abre la cápsula (con todas sus referencias) y, si la referencia nació de un prototipo, ese prototipo.
            const proto = ref.fromProtoId ? (protos || []).find((x) => x.id === ref.fromProtoId) : null;
            const numProto = (proto && (proto.numPrototipo || proto.reference)) || ref.numPrototipo || "";
            const enlace = { color: C.blue, fontWeight: 700, cursor: "pointer", textDecoration: "underline", background: "none", border: "none", padding: 0, font: "inherit", textAlign: "left" };
            return (
              <tr key={`${cap.id}-${ref.id}`} onClick={() => onAbrirCapsula && onAbrirCapsula(cap.id)} style={{ cursor: onAbrirCapsula ? "pointer" : "default" }} title={onAbrirCapsula ? "Abrir la cápsula con todas sus referencias" : ""}>
                <td style={td}><b>{ref.reference || "—"}</b>{sub(ref.name)}</td>
                <td style={td}>
                  <div>{onAbrirCapsula ? <button type="button" title="Abrir la cápsula con todas sus referencias" onClick={(e) => { e.stopPropagation(); onAbrirCapsula(cap.id); }} style={enlace}>{cap.name}</button> : cap.name}</div>
                  {(proto || numProto) && (
                    <div style={{ fontSize: 11.5, marginTop: 3 }}>
                      {proto && onAbrirProto
                        ? <button type="button" title="Abrir el prototipo de origen" onClick={(e) => { e.stopPropagation(); onAbrirProto(proto.id); }} style={{ ...enlace, fontSize: 11.5 }}>🧪 Prototipo {numProto}{proto.name ? ` · ${proto.name}` : ""}</button>
                        : <span style={{ color: C.slate, fontWeight: 600 }}>🧪 Prototipo {numProto}{proto?.name ? ` · ${proto.name}` : ""}</span>}
                    </div>
                  )}
                </td>
                <td style={td}>{(clienteDeCapsula ? clienteDeCapsula(cap) : cap.cliente) || proto?.cliente || "—"}</td>
                <td style={td}>{esperando == null ? <Etiqueta tipo="g">—</Etiqueta> : <Etiqueta tipo={esperando >= 7 ? "r" : esperando >= 4 ? "a" : "g"}>{esperando} día{esperando === 1 ? "" : "s"}</Etiqueta>}</td>
                <td style={{ ...td, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>{puedePasarAPreorden && <Boton pri onClick={() => onPasarAPreorden(cap, ref)}>🧾 Pasar a Preorden</Boton>}</td>
              </tr>
            );
          })} />
        )}
      </>
    );
  } else if (sel === "pre") {
    lista = (
      <>
        <Cab icono="🧾" titulo="Preórdenes por aprobar" n={pre.length} nota="Montadas; en cuanto el cliente las aprueba pasan a Órdenes y se llena la Ficha de inicio." accion={<Boton onClick={() => onIrVista("preordenes")}>Abrir Preórdenes →</Boton>} />
        {!pre.length ? <Vacio t="No hay preórdenes esperando aprobación." /> : (
          <Tabla cols={["Preorden", "Cliente", "Refs", "Unidades"]} filas={pre.map((p) => (
            <tr key={p.id} onClick={() => onIrVista("preordenes")} style={{ cursor: "pointer" }}><td style={td}><b>{etiqueta(p)}</b></td><td style={td}>{p.cliente || "—"}</td><td style={td}>{(p.items || []).length}</td><td style={td}>{fmt((p.items || []).reduce((s, it) => s + (Number(String(it.colombiaCantidad || 0).replace(/\D/g, "")) || 0) + (Number(String(it.venezuelaCantidad || 0).replace(/\D/g, "")) || 0), 0))}</td></tr>
          ))} />
        )}
      </>
    );
  } else if (sel === "ord") {
    lista = (
      <>
        <Cab icono="🧵" titulo="Órdenes con referencias sin pedido" n={ord.length} nota="Preórdenes aprobadas que van camino a ser pedido." accion={<Boton onClick={() => onIrVista("ordenes")}>Abrir Órdenes →</Boton>} />
        {!ord.length ? <Vacio t="Todas las órdenes aprobadas ya están en un pedido." /> : (
          <Tabla cols={["Orden", "Cliente", "Refs", "Sin pedido"]} filas={ord.map(({ p, refs, sin }) => (
            <tr key={p.id} onClick={() => onIrVista("ordenes")} style={{ cursor: "pointer" }}><td style={td}><b>{etiqueta(p)}</b></td><td style={td}>{p.cliente || "—"}</td><td style={td}>{refs}</td><td style={td}><Etiqueta tipo="b">{sin}</Etiqueta></td></tr>
          ))} />
        )}
      </>
    );
  } else if (sel === "ped") {
    lista = (
      <>
        <Cab icono="📦" titulo="Pedidos activos" n={activos.length} nota="Los mismos pedidos de la pantalla Pedidos, por fecha de despacho." accion={<Boton onClick={() => onIrVista("pedidos")}>Abrir Pedidos →</Boton>} />
        <Tabla cols={["Pedido", "Cliente", "Despacho", "Estado"]} filas={[...activos].sort((a, b) => String(a.fechaDespacho || "9999").localeCompare(String(b.fechaDespacho || "9999"))).map((p) => {
          const v = p.fechaDespacho && p.fechaDespacho < hoy; const pv = !v && p.fechaDespacho && dias(hoy, p.fechaDespacho) <= 7;
          return <tr key={p.id} onClick={() => onAbrirPedido(p.id)} style={{ cursor: "pointer" }}><td style={td}><b>#{p.numero}</b></td><td style={td}>{p.cliente || "—"}</td><td style={td}>{fecha(p.fechaDespacho)}</td><td style={td}>{v ? <Etiqueta tipo="r">Vencido</Etiqueta> : pv ? <Etiqueta tipo="a">Por vencer</Etiqueta> : <Etiqueta tipo="v">A tiempo</Etiqueta>}</td></tr>;
        })} />
      </>
    );
  } else {
    lista = (
      <>
        <Cab icono="✂" titulo="Pendiente por cortar" n={cortar ? cortar.length : null} nota="Igual que la Cola sugerida de Corte, ordenada por despacho; con el aviso del candado de corte." />
        {!cortar ? <Vacio t="Cargando el avance de corte…" /> : !cortar.length ? <Vacio t="No hay pendientes por cortar. 🎉" /> : (
          <CandadoCorteContext.Provider value={candado}>
            <Tabla cols={["Pedido", "Cliente", "Despacho", "Pendiente", "Corte"]} filas={cortar.map(({ p, pend, cortado }) => {
              const i = candado.infoDe(p);
              return (
                <tr key={p.id} onClick={() => onAbrirPedido(p.id)} style={{ cursor: "pointer" }}>
                  <td style={td}><b>#{p.numero}</b></td><td style={td}>{p.cliente || "—"}</td><td style={td}>{fecha(p.fechaDespacho)}</td><td style={td}><b>{fmt(pend)}</b> und</td>
                  <td style={td}>{cortado > 0 ? <Etiqueta tipo="b">✂ Ya tiene corte</Etiqueta> : i && !i.libre ? <Etiqueta tipo="r" title={`Faltan: ${i.faltan.join(", ")}`}>🚫 No puede salir</Etiqueta> : i ? <Etiqueta tipo="v">✅ Puede salir</Etiqueta> : <Etiqueta tipo="g">…</Etiqueta>}</td>
                </tr>
              );
            })} />
          </CandadoCorteContext.Provider>
        )}
      </>
    );
  }

  return (
    <div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>🧭 Flujo de Pedidos</h2>
      <p style={{ margin: "3px 0 14px", fontSize: 13, color: C.slate, fontWeight: 600, lineHeight: 1.5 }}>Dónde está todo el trabajo hoy: de la referencia aprobada en cápsulas hasta lo que falta por cortar.</p>
      <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {etapas.map((e, i) => (
          <React.Fragment key={e.id}>
            <button type="button" aria-pressed={sel === e.id} onClick={() => setSel(e.id)} style={{ flex: "1 1 170px", minWidth: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: C.white, border: `2px solid ${sel === e.id ? C.ink : "transparent"}`, borderRadius: 14, padding: "13px 14px", boxShadow: SOMBRA, display: "flex", flexDirection: "column", color: C.ink }}>
              <span style={{ fontSize: 18 }}>{e.ic}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 5 }}>{e.nm}</span>
              <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginTop: 2, color: e.color }}>{e.n}</span>
              <span style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, margin: "3px 0 4px", lineHeight: 1.35, minHeight: 30 }}>{e.sb}</span>
              <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{e.tags}</span>
            </button>
            {i < etapas.length - 1 && !corto && <span aria-hidden="true" style={{ alignSelf: "center", color: C.grey, fontWeight: 800, fontSize: 18 }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: SOMBRA, overflow: "hidden" }}>{lista}</div>
    </div>
  );
}

function etiqueta(p) {
  if (p.numeroOrden) {
    const n = String(p.numeroOrden).padStart(2, "0");
    const tipo = p.origenPantalla === "reprogramacion" ? "Reprogramación" : "Orden";
    return p.siglasMarca ? `${tipo} ${p.siglasMarca}-${n}` : `${tipo} N°-${n}`;
  }
  return p.nombre || p.cliente || "Preorden";
}
function Cab({ icono, titulo, n, nota, accion }) {
  return (
    <div style={{ padding: "14px 16px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.ink }}>{icono} {titulo}</h3>
        {n != null && <Etiqueta tipo="g">{n}</Etiqueta>}
        {accion && <span style={{ marginLeft: "auto" }}>{accion}</span>}
      </div>
      <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, marginTop: 3 }}>{nota}</div>
    </div>
  );
}
function Vacio({ t }) { return <div style={{ padding: "26px 16px", textAlign: "center", color: C.slate, fontSize: 13, fontWeight: 600 }}>{t}</div>; }
