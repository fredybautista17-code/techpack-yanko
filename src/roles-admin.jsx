// ─── ADMINISTRACIÓN → ROLES (pantalla ordenada) ───────────────────────────────────────────────────────────────
// (2026-11-22, a pedido de Fredy, maqueta v15) Lista de roles a la izquierda y detalle a la derecha en 3 pestañas:
// Permisos de flujo, Módulos visibles (por área, con interruptores y buscador) y Usuarios. Los datos se guardan EXACTAMENTE igual que antes
// (config.roles[].perms y config.roles[].modulos), solo cambia cómo se ve y se opera. Sin colecciones nuevas.
import React, { useState } from "react";
import useAnchoCorto from "./use-ancho-corto";

export const PERMISOS_FLUJO = [
  ["editar", "Crear y editar", "Crea y modifica prototipos, cápsulas y datos del flujo de diseño."],
  ["aprobar", "Aprobar", "Aprueba prototipos, cápsulas y pedidos."],
  ["declinar", "Declinar", "Declina prototipos y cápsulas."],
  ["admin", "Administrador", "Permisos de administrador general (por ejemplo, ver Contabilidad por defecto)."],
  ["corte", "Corte", "Trabaja con el módulo de Corte."],
  ["ilustracion", "Ilustración", "Aprueba o devuelve la ilustración (rol tipo Directora Creativa), sin los demás permisos de administrador."],
  ["aprobar_corte", "Aprobar corte", "Revisa y aprueba la Programación de Mesones que ingresó el cortador."],
  ["aprobar_despacho", "Aprobar despacho", "Aprueba los despachos que montó la persona de Bodega."],
  ["editar_kpis", "Editar KPIs", "Edita puestos, funciones y el catálogo de KPIs."],
  ["marcar_observaciones", "Marcar observaciones", "Marca como hechas las observaciones de Diseño."],
  ["revision_diseno", "Revisión de diseño", "Hace la revisión de diseño de las muestras que vuelven de taller."],
];
// Módulos con una «puerta de entrada» (switch principal) y switches secundarios que solo funcionan DENTRO del módulo: sin la entrada el usuario no ve nada.
// Si un rol tiene secundarios encendidos sin la entrada, se avisa; y al encender un secundario se enciende la entrada sola.
const ENTRADAS = [
  { grupo: "Cotizaciones", master: "cotizador", nombre: "Puede entrar a Cotizaciones (solo consulta)", esSub: (m) => m.startsWith("cotizador_") },
  { grupo: "Bodega", master: "bodega", nombre: "Bodega", esSub: (m) => m.startsWith("bodega_") },
  { grupo: "Contabilidad", master: "contabilidad", nombre: "Contabilidad", esSub: (m) => m.startsWith("contabilidad_") && m !== "contabilidad_ordenes_compra" },
];
export const entradaDe = (mod) => ENTRADAS.find((e) => e.esSub(mod));
const PROTEGIDOS = ["r1", "r2"]; // Equipo Interno y Cliente vienen con ATLAS (igual que antes: no se pueden eliminar)

function Interruptor({ on, onClick, label, T }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ position: "relative", width: 38, height: 22, borderRadius: 20, border: "none", background: on ? "#1B9467" : "#CFC8BC", flex: "none", cursor: "pointer", transition: "background .15s", padding: 0 }}>
      <span style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transform: on ? "translateX(16px)" : "none", transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  );
}

export default function RolesAdmin({ config, users, onUpdateConfig, effectiveModulos, disenoItems, disenoBasicas, grupos, T, uid }) {
  const roles = config.roles || [];
  const [sel, setSel] = useState(roles[0] ? roles[0].id : null);
  const [pestana, setPestana] = useState("perms");
  const [abiertos, setAbiertos] = useState(() => new Set(["diseno"]));
  const [filtro, setFiltro] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const angosto = useAnchoCorto(860);

  const rol = roles.find((r) => r.id === sel) || roles[0] || null;
  const normRol = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const cu = (nombre) => (users || []).filter((u) => normRol(u.role) === normRol(nombre));

  // Grupos de módulos: Diseño (con "Admin Diseño" al final) + los grupos por área de GRUPOS_MODULOS_DEF
  const todosGrupos = [
    {
      id: "diseno", area: "🎨 Diseño", conteo: "básicas",
      items: [...disenoItems.map(([m, l]) => [m, l]), ["admin_diseno", "⚙ Admin Diseño", "Acceso al panel de Administración de Diseño (etapas, categorías, roles, usuarios...), independiente de ser Admin general"]],
      // El interruptor general NO toca Admin Diseño ni las demás secciones: solo las 9 secciones básicas (igual que antes)
      claveGrupo: disenoBasicas,
    },
    ...grupos.map((g) => ({ id: g.area, area: g.area, items: g.items, claveGrupo: g.items.map(([m]) => m) })),
  ];
  // «cotizador» aparece en Diseño y en Cotizaciones (es la misma llave): se cuenta una sola vez
  const totalModulos = new Set(todosGrupos.flatMap((g) => g.items.map(([m]) => m))).size;

  function guardarRol(id, cambios) {
    onUpdateConfig({ roles: roles.map((r) => (r.id !== id ? r : { ...r, ...cambios })) });
  }
  function alternarPermiso(r, perm) {
    guardarRol(r.id, { perms: r.perms.includes(perm) ? r.perms.filter((p) => p !== perm) : [...r.perms, perm] });
  }
  // «Control de Despacho» antes era el permiso "control_despacho" (Permisos de flujo): se sigue respetando y, al apagarlo aquí, se quita también el permiso viejo.
  const activosDe = (r) => [...new Set([...effectiveModulos(r), ...(r.perms.includes("control_despacho") ? ["bodega_control_despacho"] : [])])];
  const sinLegado = (r, keys) => (keys.includes("bodega_control_despacho") ? r.perms.filter((p) => p !== "control_despacho") : r.perms);
  function alternarModulo(r, mod) {
    const act = activosDe(r);
    const apagar = act.includes(mod);
    // Al encender un switch secundario se enciende también la entrada del módulo (sin ella no serviría)
    const ent = !apagar ? entradaDe(mod) : null;
    const conEntrada = ent && !act.includes(ent.master) ? [ent.master] : [];
    guardarRol(r.id, { modulos: apagar ? effectiveModulos(r).filter((m) => m !== mod) : [...effectiveModulos(r), mod, ...conEntrada], ...(apagar ? { perms: sinLegado(r, [mod]) } : {}) });
  }
  function alternarGrupo(r, keys) {
    const act = activosDe(r);
    const todos = keys.every((m) => act.includes(m));
    const resto = effectiveModulos(r).filter((m) => !keys.includes(m));
    guardarRol(r.id, { modulos: todos ? resto : [...resto, ...keys], ...(todos ? { perms: sinLegado(r, keys) } : {}) });
  }
  function ponerTodos(r, activar) {
    // «Activar todos» no concede Admin Diseño: ese acceso se da siempre de forma explícita
    const claves = todosGrupos.flatMap((g) => g.items.map(([m]) => m)).filter((m) => m !== "admin_diseno");
    const act = effectiveModulos(r);
    guardarRol(r.id, { modulos: activar ? [...new Set([...act, ...claves])] : act.filter((m) => !claves.includes(m)), ...(activar ? {} : { perms: sinLegado(r, claves) }) });
  }
  function crear() {
    const n = nuevo.trim();
    if (!n) return;
    const id = uid();
    onUpdateConfig({ roles: [...roles, { id, name: n, perms: ["editar"], modulos: [...disenoBasicas] }] });
    setNuevo(""); setSel(id); setPestana("perms"); setFiltro("");
  }
  function duplicar(r) {
    const id = uid();
    onUpdateConfig({ roles: [...roles, { id, name: `${r.name} (copia)`, perms: [...r.perms], modulos: [...effectiveModulos(r)] }] });
    setSel(id); setConfirmarEliminar(false);
  }
  function eliminar(r) {
    onUpdateConfig({ roles: roles.filter((x) => x.id !== r.id) });
    setSel(roles.find((x) => x.id !== r.id)?.id || null); setConfirmarEliminar(false);
  }

  const borde = `1px solid ${T.border}`;
  const tarjeta = { background: T.white, border: borde, borderRadius: 14, boxShadow: "0 1px 2px rgba(26,26,46,.05),0 4px 14px rgba(26,26,46,.06)" };
  const iniciales = (n) => (n || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const chip = { fontSize: 10.5, background: "#EFEBE4", borderRadius: 20, padding: "1px 7px", marginLeft: 6, fontWeight: 800 };
  const av = (n, size) => <span style={{ width: size, height: size, borderRadius: 10, background: T.ink, color: "#fff", fontWeight: 800, fontSize: size > 40 ? 14 : 12, display: "grid", placeItems: "center", flex: "none" }}>{iniciales(n)}</span>;

  if (!rol) {
    return <div style={{ ...tarjeta, padding: 18, fontSize: 13, color: T.slate, fontWeight: 600 }}>No hay roles todavía.</div>;
  }
  const modActivos = activosDe(rol);
  const usuarios = cu(rol.name);
  const q = filtro.trim().toLowerCase();

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 18, color: T.ink }}>Roles</div>
      <div style={{ fontSize: 13, color: T.slate, fontWeight: 600, margin: "3px 0 16px", lineHeight: 1.5 }}>Elige un rol a la izquierda y ajusta lo que puede hacer y ver. Cada cambio se guarda al activar o desactivar la opción.</div>
      <div style={{ display: "grid", gridTemplateColumns: angosto ? "1fr" : "290px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        {/* ── Lista de roles ── */}
        <aside style={tarjeta}>
          <div style={{ padding: 8, display: "flex", flexDirection: angosto ? "row" : "column", gap: 4, overflowX: angosto ? "auto" : "visible" }}>
            {roles.map((r) => {
              const on = r.id === rol.id;
              return (
                <button key={r.id} type="button" onClick={() => { setSel(r.id); setFiltro(""); setConfirmarEliminar(false); }}
                  style={{ display: "flex", gap: 11, alignItems: "center", border: `1.5px solid ${on ? T.ink : "transparent"}`, background: on ? "#FAF8F4" : "transparent", borderRadius: 11, padding: 10, textAlign: "left", width: angosto ? 230 : "100%", flex: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {av(r.name, 36)}
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: T.ink }}>{r.name}</div>
                    <div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, marginTop: 2 }}>{r.perms.length} {r.perms.length === 1 ? "permiso" : "permisos"} · {effectiveModulos(r).length} {effectiveModulos(r).length === 1 ? "módulo" : "módulos"}</div>
                  </span>
                  <span title="Usuarios con este rol" style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, background: "#EFEBE4", borderRadius: 20, padding: "2px 9px", whiteSpace: "nowrap", color: T.ink }}>👤 {cu(r.name).length}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: borde }}>
            <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && crear()} placeholder="Nombre del nuevo rol…" aria-label="Nombre del nuevo rol"
              style={{ flex: 1, minWidth: 0, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "8px 10px", background: T.white, fontSize: 13.5, color: T.ink, fontFamily: "inherit", outline: "none" }} />
            <button type="button" onClick={crear} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: T.ink, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>+ Crear</button>
          </div>
        </aside>

        {/* ── Detalle del rol ── */}
        <section style={tarjeta}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "16px 18px", borderBottom: borde, flexWrap: "wrap" }}>
            {av(rol.name, 44)}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>{rol.name}</div>
              <div style={{ fontSize: 12, color: T.slate, fontWeight: 600, marginTop: 2 }}>{usuarios.length} {usuarios.length === 1 ? "usuario" : "usuarios"} · {rol.perms.length} {rol.perms.length === 1 ? "permiso" : "permisos"} · {modActivos.length} {modActivos.length === 1 ? "módulo visible" : "módulos visibles"}</div>
            </div>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => duplicar(rol)} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: "#EFEBE4", color: T.ink, cursor: "pointer", fontFamily: "inherit" }}>⧉ Duplicar rol</button>
          </div>
          {(rol.name || "").trim() === "Cliente" && (
            <div style={{ margin: "14px 18px 0", padding: "11px 14px", background: "#EAF1FB", border: "1px solid #C6D8F1", borderRadius: 11, fontSize: 12.5, lineHeight: 1.5, color: T.ink, fontWeight: 600 }}>
              ℹ️ <b>Los módulos de cada cliente se activan por usuario, no aquí.</b> Esta lista no decide qué ve cada cliente. Para dar Devoluciones, Producción, Pedidos u otros a una persona: Administración → Usuarios → Editar → «Qué ve este usuario». Para Devoluciones y Producción también debe tener marcado un «Cliente de Producción».
            </div>
          )}
          <div style={{ display: "flex", gap: 4, padding: "10px 14px 0", borderBottom: borde, flexWrap: "wrap" }}>
            {[["perms", "Permisos de flujo", `${rol.perms.length}/${PERMISOS_FLUJO.length}`], ["mods", "Módulos visibles", `${modActivos.length}/${totalModulos}`], ["usr", "Usuarios", String(usuarios.length)]].map(([k, n, c]) => (
              <button key={k} type="button" onClick={() => setPestana(k)}
                style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: 13, color: pestana === k ? T.ink : T.slate, padding: "9px 14px", borderBottom: `3px solid ${pestana === k ? T.ink : "transparent"}`, marginBottom: -1, cursor: "pointer", fontFamily: "inherit" }}>
                {n}<span style={chip}>{c}</span>
              </button>
            ))}
          </div>

          <div style={{ padding: "16px 18px" }}>
            {pestana === "perms" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 8 }}>
                {PERMISOS_FLUJO.map(([k, n, d]) => (
                  <div key={k} style={{ display: "flex", gap: 12, alignItems: "center", border: borde, borderRadius: 11, padding: "10px 12px", background: T.white }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{n} <span style={{ color: "#A8A39A", fontWeight: 600, fontSize: 11 }}>· {k}</span></div>
                      <div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>{d}</div>
                    </div>
                    <Interruptor on={rol.perms.includes(k)} label={n} onClick={() => alternarPermiso(rol, k)} T={T} />
                  </div>
                ))}
              </div>
            )}

            {pestana === "mods" && (
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                  <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="🔍 Buscar módulo u opción (ej. nómina, precio, bodega)…" aria-label="Buscar módulo"
                    style={{ flex: 1, minWidth: 200, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "9px 12px", background: T.white, fontSize: 13.5, color: T.ink, fontFamily: "inherit", outline: "none" }} />
                  <button type="button" onClick={() => ponerTodos(rol, true)} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: "#EFEBE4", color: T.ink, cursor: "pointer", fontFamily: "inherit" }}>Activar todos</button>
                  <button type="button" onClick={() => ponerTodos(rol, false)} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: "#EFEBE4", color: T.ink, cursor: "pointer", fontFamily: "inherit" }}>Quitar todos</button>
                </div>
                {(() => {
                  const visibles = todosGrupos.map((g) => ({ g, items: g.items.filter((it) => !q || `${it[1]} ${g.area}`.toLowerCase().includes(q)) })).filter((x) => x.items.length);
                  if (!visibles.length) return <div style={{ color: T.slate, fontSize: 13, fontWeight: 600, padding: "18px 0" }}>No hay módulos que coincidan con “{filtro}”.</div>;
                  return visibles.map(({ g, items }) => {
                    const claves = g.items.map(([m]) => m);
                    const cuenta = g.id === "diseno" ? g.claveGrupo : claves;
                    const act = cuenta.filter((m) => modActivos.includes(m)).length;
                    const abierto = !!q || abiertos.has(g.id);
                    // Opciones del módulo encendidas sin su entrada: no le saldría nada al usuario
                    const ent = ENTRADAS.find((e) => g.area.includes(e.grupo));
                    const sinEntrada = !!ent && !modActivos.includes(ent.master) && modActivos.some(ent.esSub);
                    return (
                      <div key={g.id} style={{ border: borde, borderRadius: 12, marginBottom: 8, overflow: "hidden", background: T.white }}>
                        <div onClick={() => setAbiertos((p) => { const n = new Set(p); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                          style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 14px", background: "#FAF8F4", cursor: "pointer" }}>
                          <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1, color: T.ink }}>{g.area}</span>
                          <span title={g.id === "diseno" ? "El interruptor general activa las 9 secciones básicas de Diseño (no incluye Admin Diseño)" : undefined}
                            style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "2px 8px", background: act ? "#E2F4EB" : "#EFEBE4", color: act ? "#1B9467" : T.slate }}>{act}/{cuenta.length} {g.id === "diseno" ? "básicas" : "activas"}</span>
                          {sinEntrada && <span title={`Tiene opciones de ${ent.grupo} pero no el acceso al módulo`} style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "2px 8px", background: "#FDF5E6", color: "#C47C1A" }}>⚠ sin acceso</span>}
                          <Interruptor on={g.claveGrupo.length > 0 && g.claveGrupo.every((m) => modActivos.includes(m))} label={`Activar todo ${g.area}`} onClick={() => alternarGrupo(rol, g.claveGrupo)} T={T} />
                          <span style={{ fontSize: 11, color: "#A8A39A", transform: abierto ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
                        </div>
                        {abierto && (
                          <div style={{ padding: "4px 14px 8px" }}>
                            {sinEntrada && (
                              <div style={{ margin: "8px 0 4px", padding: "9px 12px", borderRadius: 9, background: "#FDF5E6", color: "#8A5A10", fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>
                                ⚠ Este rol tiene opciones de {ent.grupo} encendidas pero <b>no puede entrar al módulo</b>, así que a sus usuarios no les sale nada. Activa «{ent.nombre}».
                                <button type="button" onClick={() => alternarModulo(rol, ent.master)} style={{ marginLeft: 10, border: "none", borderRadius: 7, padding: "4px 10px", background: "#C47C1A", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Activar acceso</button>
                              </div>
                            )}
                            {items.map(([m, label, ayuda], i) => (
                              <div key={m} title={ayuda || undefined} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0", borderTop: i ? borde : "none" }}>
                                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: T.ink }}>
                                  {label}
                                  {ayuda ? <div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600 }}>{ayuda}</div> : null}
                                </div>
                                <Interruptor on={modActivos.includes(m)} label={label} onClick={() => alternarModulo(rol, m)} T={T} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {pestana === "usr" && (
              usuarios.length ? usuarios.map((u) => (
                <div key={u.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: borde }}>
                  <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#C8B8A2", color: T.ink, fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>{iniciales(u.name)}</span>
                  <div><div style={{ fontWeight: 800, fontSize: 13, color: T.ink }}>{u.name}{u.activo === false ? " · desactivado" : ""}{Array.isArray(u.modulosPropios) ? <span title="Este usuario tiene su propia lista de áreas: lo que ve no sale de este rol" style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, background: "#EBF1F7", color: "#3D6B9E", borderRadius: 20, padding: "1px 8px" }}>lista propia</span> : null}</div><div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600 }}>@{u.username}</div></div>
                </div>
              )) : <div style={{ color: T.slate, fontSize: 13, fontWeight: 600, padding: "18px 0" }}>Ningún usuario tiene este rol todavía. Asígnalo en Administración → Usuarios.</div>
            )}

            <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px dashed ${T.border}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, fontSize: 12, color: T.slate, fontWeight: 600, minWidth: 200 }}>
                {PROTEGIDOS.includes(rol.id) ? "Los roles Equipo Interno y Cliente vienen con ATLAS y no se pueden eliminar." : (usuarios.length ? `Este rol lo tienen ${usuarios.length} usuario(s): al eliminarlo quedarán con un rol sin permisos configurados.` : "Eliminar el rol no afecta a ningún usuario.")}
              </div>
              {!PROTEGIDOS.includes(rol.id) && (confirmarEliminar ? (
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" onClick={() => eliminar(rol)} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: "#CB4646", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Sí, eliminar</button>
                  <button type="button" onClick={() => setConfirmarEliminar(false)} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: "#EFEBE4", color: T.ink, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmarEliminar(true)} style={{ border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: "#FBE6E6", color: "#CB4646", cursor: "pointer", fontFamily: "inherit" }}>Eliminar rol</button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
