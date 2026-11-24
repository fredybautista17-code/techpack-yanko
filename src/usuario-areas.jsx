// ─── USUARIOS → «Qué ve este usuario»: accesos por ÁREAS de cada persona ─────────────────────────────────────────────
// (2026-11-24, a pedido de Fredy, maqueta «usuario-areas») Cada usuario puede usar lo que da su rol («Igual que su rol») o tener su propia lista de áreas
// («Lista propia», users/{id}.modulosPropios). La lista propia REEMPLAZA a la del rol; los permisos de acción siguen siendo los del rol. Se guardan las
// mismas llaves de módulo de Administración → Roles, así que todo lo que ya respeta esas llaves funciona sin tocar nada más.
import React, { useState } from "react";
import { entradaDe } from "./roles-admin";
import { LLAVES_AREA_PEDIDOS } from "./modulos-rol";

function Interruptor({ on, onClick, label, deshabilitado }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={deshabilitado} onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ position: "relative", width: 38, height: 22, borderRadius: 20, border: "none", background: on ? "#1B9467" : "#CFC8BC", flex: "none", cursor: deshabilitado ? "default" : "pointer", opacity: deshabilitado ? 0.55 : 1, transition: "background .15s", padding: 0 }}>
      <span style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transform: on ? "translateX(16px)" : "none", transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  );
}

// Pestañas de Gestión de Pedido y la llave que decide cada una (Por montar y Preórdenes comparten «preordenes»; Órdenes e Historial, «ordenes»).
const PESTANAS_GESTION = [
  { auto: true, t: "Flujo", par: "Aparece solo cuando ve algo de Pedidos (Pedidos, Clientes, Explosión, Lotes o Corte)" },
  { k: "preordenes", t: "Por montar", par: "Va junto con Preórdenes" },
  { k: "preordenes", t: "Preórdenes" },
  { k: "ordenes", t: "Órdenes" },
  { k: "ordenes", t: "Historial de Órdenes", par: "Va junto con Órdenes" },
  { k: "ficha_inicio", t: "Ficha de inicio" },
];
const CLAVES_GESTION = ["preordenes", "ordenes", "ficha_inicio"];

// Áreas del selector, en el orden del menú de ATLAS. Diseño y Pedidos se arman a mano (Pedidos lleva Gestión de Pedido y Corte adentro); las demás vienen
// tal cual de las de Roles (grupos), para que una llave nueva en Roles aparezca aquí sin tocar este archivo.
function armarAreas(disenoItems, grupos) {
  const etiqueta = (k, def) => { const x = (disenoItems || []).find((d) => d[0] === k); return x ? x[1] : def; };
  const diseno = {
    id: "diseno", area: "🎨 Diseño",
    items: [
      ["protos", etiqueta("protos", "Prototipos")], ["capsulas", etiqueta("capsulas", "Cápsulas")], ["stats", etiqueta("stats", "Estadísticas")], ["observaciones", etiqueta("observaciones", "Observaciones")],
      ["historial", etiqueta("historial", "Historial de Diseño")], ["bitacora", etiqueta("bitacora", "Bitácoras")], ["cronograma_muestras", etiqueta("cronograma_muestras", "Cronograma de Muestras")],
      ["admin_diseno", "⚙ Admin Diseño", "Acceso al panel de Administración de Diseño, independiente de ser administrador general"],
    ],
  };
  const pedidos = {
    id: "pedidos", area: "📦 Pedidos",
    items: [
      { grupo: "🧭 Gestión de Pedido", ayuda: "Pantalla completa con su propio menú" },
      ["pedidos", etiqueta("pedidos", "Pedidos"), "Pedidos de Busint, vigentes por cliente y disponible para despachar"],
      ["corte", etiqueta("corte", "✂ Corte"), "Módulo de Corte en pantalla completa"],
      ["pedidos_clientes", etiqueta("pedidos_clientes", "Clientes")],
      ["explosion_materiales", etiqueta("explosion_materiales", "Explosión de materiales")],
      ["lotes_por_integrar", etiqueta("lotes_por_integrar", "Lotes por integrar")],
      ["preordenes_vincular_pedido", "Vincular referencias a pedidos", "Aunque la preorden ya esté aprobada"],
      ["preordenes_pasar_a_orden", "Pasar referencias a Órdenes", "Botón «Pasar a Orden» con la tela confirmada"],
    ],
  };
  const resto = (grupos || []).filter((g) => g.area !== "🧾 Preórdenes y Órdenes").map((g) => ({ id: g.area, area: g.area, items: g.items }));
  return [diseno, pedidos, ...resto];
}
const clavesDeItem = (it) => (Array.isArray(it) ? [it[0]] : CLAVES_GESTION);
const clavesDeArea = (a) => [...new Set(a.items.flatMap(clavesDeItem))];

// Menú que verá la persona (aproximado: mismas reglas de visibilidad de ATLAS para cada área).
function menuDe(tiene, areas) {
  const out = [];
  areas.forEach((a) => {
    if (a.id === "pedidos") {
      const subs = [];
      const tabs = [];
      if (LLAVES_AREA_PEDIDOS.some(tiene)) tabs.push("Flujo");
      if (tiene("preordenes")) tabs.push("Por montar", "Preórdenes");
      if (tiene("ordenes")) tabs.push("Órdenes", "Historial de Órdenes");
      if (tiene("ficha_inicio")) tabs.push("Ficha de inicio");
      if (tabs.length) subs.push({ t: "🧭 Gestión de Pedido", hijos: tabs });
      [["pedidos", "Pedidos"], ["corte", "Corte"], ["pedidos_clientes", "Clientes"], ["explosion_materiales", "Explosión de materiales"], ["lotes_por_integrar", "Lotes por integrar"]].forEach(([k, t]) => { if (tiene(k)) subs.push({ t }); });
      if (subs.length) out.push({ area: a.area, subs });
      return;
    }
    // Las demás áreas se ven si tienen su llave de entrada; solo Diseño y Áreas muestran sus secciones debajo
    const claves = a.items.map((it) => it[0]);
    const entrada = a.id === "diseno" || a.area.includes("Áreas") ? claves : a.area.includes("Nómina") ? claves.filter((k) => k === "nomina" || k === "nomina_novedades" || k === "nomina_lider_area" || k === "nomina_lider_asistencia" || k === "nomina_lider_resumen")
      : a.area.includes("Contabilidad") ? ["contabilidad", "contabilidad_ordenes_compra"] : [claves[0]];
    if (!entrada.some(tiene)) return;
    const conSecciones = a.id === "diseno" || a.area.includes("Áreas");
    out.push({ area: a.area, subs: conSecciones ? a.items.filter((it) => tiene(it[0])).map((it) => ({ t: it[1] })) : [] });
  });
  return out;
}

export default function BloqueAreasUsuario({ form, setForm, editUser, rolBase, modulosRol, disenoItems, grupos, T }) {
  const [abiertos, setAbiertos] = useState(() => new Set(["pedidos"]));
  const [filtro, setFiltro] = useState("");
  const areas = armarAreas(disenoItems, grupos);
  const propia = Array.isArray(form.modulosPropios);
  const lista = propia ? form.modulosPropios : modulosRol;
  const tiene = (k) => lista.includes(k);
  const delRol = (k) => modulosRol.includes(k);
  const borde = `1px solid ${T.border}`;
  const nota = { fontSize: 11.5, color: T.slate, fontWeight: 600, lineHeight: 1.45 };
  const tagEstilo = (tipo) => ({ fontSize: 10.5, fontWeight: 800, borderRadius: 20, padding: "1px 8px", whiteSpace: "nowrap", background: tipo === "mas" ? "#E2F4EB" : tipo === "menos" ? "#FBE6E6" : "#EBF1F7", color: tipo === "mas" ? "#1B9467" : tipo === "menos" ? "#CB4646" : "#3D6B9E" });

  function poner(claves, encender) {
    if (!propia) return;
    setForm((f) => {
      const act = new Set(f.modulosPropios);
      claves.forEach((k) => {
        if (encender) {
          act.add(k);
          // Los secundarios de Bodega, Cotizaciones y Contabilidad solo sirven con su puerta de entrada: se enciende sola
          const ent = entradaDe(k);
          if (ent) act.add(ent.master);
        } else act.delete(k);
      });
      return { ...f, modulosPropios: [...act] };
    });
  }
  const elegirModo = (conLista) => setForm((f) => ({ ...f, modulosPropios: conLista ? [...modulosRol] : null }));

  // Marca frente al rol («extra», «quitado» o «distinto»)
  function marca(claves) {
    if (!propia) return null;
    const hay = claves.some(tiene), enRol = claves.some(delRol);
    if (hay && !enRol) return <span style={tagEstilo("mas")}>extra</span>;
    if (!hay && enRol) return <span style={tagEstilo("menos")}>quitado</span>;
    if (claves.every(tiene) !== claves.every(delRol)) return <span style={tagEstilo("")}>distinto al rol</span>;
    return null;
  }

  const fila = (clave, texto, ayuda, sub) => (
    <div key={`${clave}-${texto}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", paddingLeft: sub ? 26 : 0, borderBottom: "1px dashed #EEE9E1" }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: sub ? 600 : 700, lineHeight: 1.35, color: T.ink }}>{texto}{ayuda ? <div style={{ ...nota, marginTop: 1 }}>{ayuda}</div> : null}</div>
      {marca([clave])}
      <Interruptor on={tiene(clave)} label={texto} deshabilitado={!propia} onClick={() => poner([clave], !tiene(clave))} />
    </div>
  );

  const q = filtro.trim().toLowerCase();
  const textoDe = (it) => (Array.isArray(it) ? `${it[1]} ${it[2] || ""}` : `Gestión de Pedido ${PESTANAS_GESTION.map((p) => p.t).join(" ")}`);
  const menu = menuDe(tiene, areas);
  const extras = propia ? lista.filter((k) => !delRol(k)) : [];
  const quitados = propia ? modulosRol.filter((k) => !tiene(k)) : [];

  const bloqueAreas = (a) => {
    const items = q ? a.items.filter((it) => textoDe(it).toLowerCase().includes(q) || a.area.toLowerCase().includes(q)) : a.items;
    if (q && !items.length) return null;
    const claves = clavesDeArea(a);
    const act = claves.filter(tiene).length;
    const abierta = q ? true : abiertos.has(a.id);
    return (
      <section key={a.id} style={{ border: borde, borderRadius: 12, marginBottom: 8, background: T.white, overflow: "hidden" }}>
        <div role="button" tabIndex={0} onClick={() => setAbiertos((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAbiertos((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; }); } }}
          style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", cursor: "pointer", background: "#FCFBF9" }}>
          <span style={{ fontWeight: 800, fontSize: 14, flex: 1, color: T.ink }}>{a.area}</span>
          {marca(claves)}
          <span style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 20, padding: "1px 9px", background: act ? "#E2F4EB" : "#EFEBE4", color: act ? "#1B9467" : T.slate }}>{act}/{claves.length}</span>
          <Interruptor on={act === claves.length} label={`Todo ${a.area}`} deshabilitado={!propia} onClick={() => poner(claves, act !== claves.length)} />
          <span style={{ color: T.slate, fontSize: 12, width: 12 }}>{abierta ? "▾" : "▸"}</span>
        </div>
        {abierta && (
          <div style={{ borderTop: borde, padding: "4px 12px 8px" }}>
            {items.map((it) => {
              if (Array.isArray(it)) return fila(it[0], it[1], it[2], false);
              const todos = CLAVES_GESTION.every(tiene);
              return (
                <React.Fragment key="gestion">
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px dashed #EEE9E1" }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: T.ink }}>{it.grupo}<div style={{ ...nota, marginTop: 1 }}>{it.ayuda}</div></div>
                    {marca(CLAVES_GESTION)}
                    <Interruptor on={todos} label="Gestión de Pedido completa" deshabilitado={!propia} onClick={() => poner(CLAVES_GESTION, !todos)} />
                  </div>
                  {PESTANAS_GESTION.map((p) => p.auto ? (
                    <div key={p.t} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0 7px 26px", borderBottom: "1px dashed #EEE9E1" }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: T.ink }}>{p.t}<div style={{ ...nota, marginTop: 1 }}>{p.par}</div></div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.slate, background: "#EFEBE4", borderRadius: 8, padding: "2px 8px", whiteSpace: "nowrap" }}>{LLAVES_AREA_PEDIDOS.some(tiene) ? "se muestra" : "no se muestra"}</span>
                    </div>
                  ) : fila(p.k, p.t, p.par, true))}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, flex: 1, minWidth: 180 }}>Áreas que ve {rolBase ? <span style={{ ...nota, fontWeight: 700 }}>(rol base: {form.role})</span> : null}</div>
        <div role="group" aria-label="Modo de accesos" style={{ display: "inline-flex", background: T.canvas, borderRadius: 11, padding: 3, gap: 2 }}>
          {[[false, "Igual que su rol"], [true, "Lista propia"]].map(([v, t]) => (
            <button key={t} type="button" disabled={!editUser} onClick={() => elegirModo(v)}
              style={{ border: "none", background: propia === v ? T.white : "transparent", color: propia === v ? (v ? "#3D6B9E" : T.ink) : T.slate, boxShadow: propia === v ? "0 1px 3px rgba(26,26,46,.14)" : "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "7px 13px", borderRadius: 9, cursor: editUser ? "pointer" : "default" }}>{t}</button>
          ))}
        </div>
      </div>
      {form.isAdmin && <div style={{ background: "#FDF5E6", color: "#7a5410", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>⭐ Este usuario es administrador: ve todo en ATLAS, sin importar la lista.</div>}
      {!editUser ? (
        <div style={{ ...nota, background: T.canvas, borderRadius: 10, padding: "9px 12px", marginBottom: 10 }}>Al crearlo, este usuario ve lo que da su rol <b>{form.role}</b>. Después de crearlo, edítalo para darle una lista propia de áreas.</div>
      ) : propia ? (
        <div style={{ background: "#EBF1F7", color: "#3D6B9E", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}>Lista propia: lo que marques aquí es lo que ve. Frente al rol <b>{form.role}</b>: <b>{extras.length} extra</b> · <b>{quitados.length} quitados</b>. Los permisos de acción (editar, aprobar…) siguen siendo los del rol.</span>
          <button type="button" onClick={() => elegirModo(true)} style={{ font: "inherit", fontSize: 12, fontWeight: 700, border: "1px solid currentColor", background: "transparent", color: "inherit", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>Volver a copiar el rol</button>
        </div>
      ) : (
        <div style={{ background: T.canvas, color: T.slate, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Este usuario ve exactamente lo que da el rol <b>{form.role}</b>. Si cambias el rol en Roles, él cambia con el rol. Para que sea distinto a su rol, elige «Lista propia».</div>
      )}
      <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar un acceso (ej. Corte, Devoluciones)…" aria-label="Buscar acceso"
        style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 10, fontSize: 13.5, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit", marginBottom: 10 }} />
      {areas.map(bloqueAreas)}
      <div style={{ border: borde, borderRadius: 12, overflow: "hidden", marginTop: 12 }}>
        <div style={{ padding: "9px 12px", fontSize: 12.5, fontWeight: 800, color: T.ink, borderBottom: borde }}>Así verá el menú <span style={{ ...nota, fontWeight: 600 }}>(aproximado · {propia ? "lista propia" : "según su rol"})</span></div>
        <div style={{ background: "#1A1A2E", color: "#E8E4DC", padding: "10px 12px", fontSize: 13 }}>
          {menu.length === 0 ? <div style={{ color: "#9A958B", fontWeight: 600 }}>No ve ninguna área.</div> : menu.map((m) => (
            <div key={m.area} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 800 }}>{m.area}</div>
              {m.subs.map((s) => (
                <div key={s.t}>
                  <div style={{ paddingLeft: 22, color: s.hijos ? "#E9D9BE" : "#BDB8AE", fontWeight: s.hijos ? 800 : 600, fontSize: 12.5 }}>{s.t}</div>
                  {(s.hijos || []).map((h) => <div key={h} style={{ paddingLeft: 40, color: "#9A958B", fontWeight: 600, fontSize: 12 }}>{h}</div>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
