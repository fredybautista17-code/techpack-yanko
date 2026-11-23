// ─── ADMINISTRACIÓN: CENTRO DE PARÁMETROS ─────────────────────────────────────
// (2026-11-23, a pedido de Fredy) Pantalla de SOLO LECTURA que junta en un lugar lo que se parametriza en ATLAS: qué hay configurado,
// con qué valor y qué falta. No escribe nada ni crea colecciones. Lee lo que ya existe: config/main (llega por props), users (props),
// nomina_trabajadores / nomina_areas / nomina_turnos / nomina_grupos_trabajo, config/planta_modulos, cotizador_parametros,
// bodega_config/main y corte_config/main. Las filas de Administración tienen botón «Abrir»; las de otros módulos dicen en texto dónde se edita.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const lista = (v) => (Array.isArray(v) ? v : []);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const muestra = (arr, max = 6) => (arr.length <= max ? arr.join(", ") : `${arr.slice(0, max).join(", ")} y ${arr.length - max} más`);

// Lee una colección o un documento sin tumbar la pantalla si falla (permisos, red).
async function leerColeccion(db, nombre) {
  try {
    const s = await getDocs(collection(db, nombre));
    return { ok: true, data: s.docs.map((d) => ({ ...d.data(), id: d.id })) };
  } catch (e) {
    return { ok: false, data: [], error: e?.message || "sin permiso" };
  }
}
async function leerDoc(db, col, id) {
  try {
    const s = await getDoc(doc(db, col, id));
    return { ok: true, existe: s.exists(), data: s.exists() ? s.data() : null };
  } catch (e) {
    return { ok: false, existe: false, data: null, error: e?.message || "sin permiso" };
  }
}

const ESTADOS = {
  ok: { txt: "Completo", color: "jade", bg: "jadeBg" },
  aviso: { txt: "Revisar", color: "amber", bg: "amberBg" },
  falta: { txt: "Sin configurar", color: "coral", bg: "coralBg" },
  info: { txt: "Informativo", color: "denim", bg: "denimBg" },
};

// Arma todas las secciones a partir de los datos leídos. Función pura: se puede probar sin pantalla.
export function construirParametros({ config, users, datos }) {
  const cfg = config || {};
  const us = lista(users);
  const secciones = [];
  const fila = (id, nombre, estado, valor, donde, extra = {}) => ({ id, nombre, estado, valor, donde, ...extra });
  const noLeido = (d, nombre, donde) => fila("nl_" + nombre, nombre, "aviso", "No se pudo leer (" + (d.error || "sin permiso") + ")", donde);

  // ── Diseño y catálogos (Administración) ───────────────────────────────────
  const catalogo = (id, nombre, arr, tab, vacioMsg) => {
    const a = lista(arr);
    return fila(id, nombre, a.length ? "ok" : "falta", a.length ? `${a.length} · ${muestra(a.map((x) => (typeof x === "string" ? x : x.nombre || x.label || x.id)).filter(Boolean), 5)}` : vacioMsg || "Vacío", "Administración → " + nombre, { tab });
  };
  const etapas = lista(cfg.stages);
  const diasEtapas = etapas.reduce((s, e) => s + (Number(e.days) || 0), 0);
  const cats = lista(cfg.categorias);
  const conBloque = new Set([...lista(cfg.bloquesCategoria).map((b) => norm(b.categoria)), ...lista(cfg.codigosReferencia).map((c) => norm(c.categoria))]);
  const catsSinCodigo = cats.filter((c) => !conBloque.has(norm(c)));
  const clientes = lista(cfg.clientes);
  const extras = cfg.notificacionesExtras && typeof cfg.notificacionesExtras === "object" ? cfg.notificacionesExtras : {};
  const nExtras = Object.values(extras).reduce((s, a) => s + lista(a).length, 0);
  secciones.push({
    id: "diseno", titulo: "Diseño y catálogos", icono: "🎨", filas: [
      fila("etapas", "Etapas", etapas.length ? "ok" : "falta", etapas.length ? `${plural(etapas.length, "etapa", "etapas")} · ${diasEtapas} días en total` : "Sin etapas", "Administración → Etapas", { tab: "etapas" }),
      catalogo("categorias", "Categorías", cats, "categorias"),
      catalogo("siluetas", "Siluetas", cfg.siluetas, "siluetas"),
      fila("lineas", "Línea", lista(cfg.lineas).length ? "ok" : "falta", lista(cfg.lineas).length ? `${lista(cfg.lineas).length} líneas · ${Object.keys(cfg.lineaGrupoMap || {}).length} con grupo` : "Vacío: cargar líneas desde Busint", "Administración → Línea", { tab: "lineas" }),
      catalogo("rangos", "Rangos", cfg.rangos, "rangos"),
      fila("codigos", "Códigos de Referencia", catsSinCodigo.length ? "aviso" : cats.length ? "ok" : "falta",
        `${plural(lista(cfg.bloquesCategoria).length, "bloque", "bloques")} por categoría · ${plural(lista(cfg.codigosReferencia).length, "regla puntual", "reglas puntuales")}` + (catsSinCodigo.length ? ` · sin código: ${muestra(catsSinCodigo, 4)}` : ""), "Administración → Códigos de Referencia", { tab: "codigos_referencia" }),
      catalogo("disenadores", "Diseñadores", cfg.disenadores, "disenadores"),
      catalogo("kpi_areas", "Áreas (KPI)", cfg.kpiAreas, "kpi_areas"),
      catalogo("talleres", "Talleres de Muestra", cfg.talleresMuestra, "talleres"),
      catalogo("prioridades", "Prioridades de Muestra", cfg.prioridadesMuestra, "prioridades"),
      fila("clientes", "Clientes", clientes.length ? "ok" : "falta", clientes.length ? `${clientes.length} · ${muestra(clientes.map((c) => c.nombre).filter(Boolean), 5)}` : "Vacío", "Administración → Clientes", { tab: "clientes" }),
      fila("notif", "Notificaciones (destinatarios extra)", "info", nExtras ? `${plural(nExtras, "destinatario", "destinatarios")} en ${plural(Object.keys(extras).length, "aviso", "avisos")}` : "Sin destinatarios extra", "Administración → Notificaciones", { tab: "notificaciones" }),
    ],
  });

  // ── Accesos ───────────────────────────────────────────────────────────────
  const roles = lista(cfg.roles);
  const nombresRol = new Set(roles.map((r) => r.name));
  const rolesVacios = roles.filter((r) => !lista(r.modulos).length && !lista(r.perms).length).map((r) => r.name);
  const sinRol = us.filter((u) => u.role !== "Cliente" && !nombresRol.has(u.role)).map((u) => u.name || u.username);
  const admins = us.filter((u) => u.isAdmin).map((u) => u.name || u.username);
  const lideresSinArea = us.filter((u) => (u.nominaLiderArea || u.nominaLiderAsistencia) && !u.areaNomina).map((u) => u.name || u.username);
  secciones.push({
    id: "accesos", titulo: "Accesos", icono: "🔐", filas: [
      fila("roles", "Roles", roles.length ? (rolesVacios.length ? "aviso" : "ok") : "falta",
        roles.length ? `${plural(roles.length, "rol", "roles")}` + (rolesVacios.length ? ` · sin ningún acceso: ${muestra(rolesVacios, 4)}` : "") : "Sin roles", "Administración → Roles", { tab: "roles" }),
      fila("usuarios", "Usuarios", sinRol.length ? "aviso" : us.length ? "ok" : "falta",
        `${plural(us.length, "usuario", "usuarios")}` + (sinRol.length ? ` · con rol que ya no existe: ${muestra(sinRol, 4)}` : ""), "Administración → Usuarios", { tab: "usuarios" }),
      fila("admins", "Usuarios con «Acceso de administrador»", "info", admins.length ? `${admins.length} · ${muestra(admins, 6)}` : "Ninguno", "Administración → Usuarios → Accesos especiales", { tab: "usuarios" }),
      fila("lideres", "Líderes de área de Nómina con Área Interna", lideresSinArea.length ? "aviso" : "ok",
        lideresSinArea.length ? `Falta el Área Interna de: ${muestra(lideresSinArea, 5)}` : "Todos tienen su Área Interna", "Administración → Usuarios → Área Interna", { tab: "usuarios" }),
    ],
  });

  // ── Nómina ────────────────────────────────────────────────────────────────
  const dTr = datos.trabajadores, dAr = datos.areas, dTu = datos.turnos, dGr = datos.grupos;
  const nomina = [];
  if (!dTr.ok) nomina.push(noLeido(dTr, "Trabajadores", "Nómina → Administrativo → Trabajadores"));
  if (!dAr.ok) nomina.push(noLeido(dAr, "Área Interna", "Nómina → Administrativo → Área Interna"));
  if (dTr.ok && dAr.ok) {
    const activos = dTr.data.filter((t) => t.activo !== false);
    const nombresArea = new Set(dAr.data.map((a) => norm(a.nombre || a.id)));
    const sinArea = activos.filter((t) => !t.area || norm(t.area) === "sin asignar");
    const fueraCatalogo = [...new Set(activos.filter((t) => t.area && norm(t.area) !== "sin asignar" && !nombresArea.has(norm(t.area))).map((t) => t.area))];
    const sinTurno = activos.filter((t) => !t.turnoId);
    nomina.push(fila("trabajadores", "Trabajadores activos", sinArea.length ? "aviso" : activos.length ? "ok" : "falta",
      `${activos.length} activos` + (sinArea.length ? ` · ${sinArea.length} sin área asignada` : "") + (sinTurno.length ? ` · ${sinTurno.length} sin turno (horario completo)` : ""), "Nómina → Administrativo → Trabajadores"));
    nomina.push(fila("areas_fuera", "Áreas de trabajadores que no están en Área Interna", fueraCatalogo.length ? "aviso" : "ok",
      fueraCatalogo.length ? muestra(fueraCatalogo, 6) : "Todas las áreas existen en el catálogo", "Nómina → Administrativo → Área Interna"));
  }
  if (dAr.ok) {
    const sinGrupo = dAr.data.filter((a) => !a.grupoTrabajoId).map((a) => a.nombre || a.id);
    nomina.push(fila("areas", "Área Interna", dAr.data.length ? (sinGrupo.length ? "aviso" : "ok") : "falta",
      dAr.data.length ? `${plural(dAr.data.length, "área", "áreas")}` + (sinGrupo.length ? ` · sin Grupo de Trabajo: ${muestra(sinGrupo, 4)}` : "") : "Vacío", "Nómina → Administrativo → Área Interna"));
  }
  if (dGr.ok) nomina.push(fila("grupos", "Grupos de Trabajo", dGr.data.length ? "ok" : "info", dGr.data.length ? `${dGr.data.length} · ${muestra(dGr.data.map((g) => g.nombre).filter(Boolean), 5)}` : "Sin grupos (es solo organizativo)", "Nómina → Administrativo → Grupos de Trabajo"));
  else nomina.push(noLeido(dGr, "Grupos de Trabajo", "Nómina → Administrativo → Grupos de Trabajo"));
  if (dTu.ok) nomina.push(fila("turnos", "Turnos", dTu.data.length ? "ok" : "info", dTu.data.length ? `${dTu.data.length} · ${muestra(dTu.data.map((t) => t.nombre).filter(Boolean), 5)}` : "Sin turnos: todos con horario completo", "Nómina → Administrativo → Turnos"));
  else nomina.push(noLeido(dTu, "Turnos", "Nómina → Administrativo → Turnos"));
  secciones.push({ id: "nomina", titulo: "Nómina", icono: "👷", filas: nomina });

  // ── Planta Yanko ──────────────────────────────────────────────────────────
  const dPl = datos.planta;
  const planta = [];
  if (!dPl.ok) planta.push(noLeido(dPl, "Módulos de Planta", "Planta → Carga por Módulos → ⚙ Configurar módulos"));
  else {
    const p = dPl.data || {};
    const mods = lista(p.modulos);
    const sinCap = mods.filter((m) => !(Number(m.capacidadDia) > 0)).map((m) => m.nombre);
    const sinCats = mods.filter((m) => !lista(m.categorias).length).map((m) => m.nombre);
    planta.push(fila("mods", "Módulos de Planta", !mods.length ? "falta" : sinCap.length || sinCats.length ? "aviso" : "ok",
      !mods.length ? "Ningún módulo configurado" : `${plural(mods.length, "módulo", "módulos")}` + (sinCap.length ? ` · sin capacidad/día: ${muestra(sinCap, 4)}` : "") + (sinCats.length ? ` · sin categorías: ${muestra(sinCats, 4)}` : ""),
      "Planta → Carga por Módulos → ⚙ Configurar módulos"));
    planta.push(fila("horizonte", "Horizonte de carga", p.horizonteDias ? "ok" : "info", p.horizonteDias ? `${p.horizonteDias} días` : "Por defecto", "Planta → Carga por Módulos → ⚙ Configurar módulos"));
    const def = (v, d) => (v ? `${v}` : `${d}`);
    const porDefecto = [p.disenoPocoDias, p.disenoLeadDias, p.disenoMinEnCamino].some((v) => !v);
    planta.push(fila("que_disenar", "«Qué diseñar»: poco trabajo · tiempo de un diseño · diseños en camino", "ok",
      `${def(p.disenoPocoDias, 10)} días · ${def(p.disenoLeadDias, 45)} días · ${def(p.disenoMinEnCamino, 3)} diseños` + (porDefecto ? " (alguno es el valor por defecto)" : ""), "Planta → Carga por Módulos → ⚙ Configurar módulos"));
  }
  secciones.push({ id: "planta", titulo: "Planta Yanko", icono: "🏭", filas: planta });

  // ── Cotizaciones, Bodega, Corte ───────────────────────────────────────────
  const otros = [];
  const dCo = datos.cotParametros;
  if (!dCo.ok) otros.push(noLeido(dCo, "Parámetros de Cotizaciones", "Cotizaciones → Parámetros por cliente"));
  else {
    const tienen = new Set(dCo.data.flatMap((p) => [norm(p.id), norm(p.nombre)]));
    const sinPropios = clientes.map((c) => c.nombre).filter((n) => n && !tienen.has(norm(n)));
    const hayGeneral = dCo.data.some((p) => norm(p.id) === "general");
    otros.push(fila("cot_general", "Parámetros generales de Cotizaciones", hayGeneral ? "ok" : "falta", hayGeneral ? "Definidos" : "No existen (los clientes sin parámetros propios no pueden cotizar bien)", "Cotizaciones → Parámetros por cliente"));
    otros.push(fila("cot_clientes", "Parámetros por cliente", "info", `${plural(dCo.data.filter((p) => norm(p.id) !== "general").length, "cliente con parámetros propios", "clientes con parámetros propios")}` + (sinPropios.length ? ` · usan los generales: ${muestra(sinPropios, 5)}` : ""), "Cotizaciones → Parámetros por cliente"));
  }
  const dBo = datos.bodega;
  otros.push(!dBo.ok ? noLeido(dBo, "Bodega", "Bodega → Despacho y Saldo → Código Edición")
    : fila("bod_pin", "Código (PIN) de edición de despachos", dBo.data?.pinEdicion ? "ok" : "aviso", dBo.data?.pinEdicion ? "Definido" : "Sin definir: Contabilidad no puede editar despachos guardados", "Bodega → Despacho y Saldo → Código Edición"));
  const dCt = datos.corte;
  otros.push(!dCt.ok ? noLeido(dCt, "Corte", "Planeación → Corte → Configuración")
    : fila("corte", "Configuración de Corte", dCt.existe ? "ok" : "falta", dCt.existe ? `${plural(lista(dCt.data.plantas).length, "planta", "plantas")} configuradas` : "No existe el documento de configuración", "Planeación → Corte → Configuración"));
  secciones.push({ id: "otros", titulo: "Cotizaciones, Bodega y Corte", icono: "🧩", filas: otros });

  // ── Ajustes que viven solo en un equipo ───────────────────────────────────
  let local = null;
  try { local = typeof localStorage !== "undefined" ? localStorage.getItem("atlas_proyeccion_deuda_opciones") : null; } catch { local = null; }
  secciones.push({
    id: "local", titulo: "Ajustes guardados solo en este equipo", icono: "💻", filas: [
      fila("deuda", "Proyección de Deuda (ingreso, colchón, plazo de compras)", "info", local ? "Hay ajustes guardados en este navegador" : "Sin ajustes aquí: valen los de siempre (conservador, 10 %, compras a 30 días)", "Financiera → Proyección de Deuda · no se comparte entre equipos"),
    ],
  });
  return secciones;
}

export default function CentroParametros({ db, T, config, users, onIrTab }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busca, setBusca] = useState("");
  const [soloPend, setSoloPend] = useState(false);
  const [leidoEn, setLeidoEn] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [trabajadores, areas, turnos, grupos, planta, cotParametros, bodega, corte] = await Promise.all([
      leerColeccion(db, "nomina_trabajadores"), leerColeccion(db, "nomina_areas"), leerColeccion(db, "nomina_turnos"), leerColeccion(db, "nomina_grupos_trabajo"),
      leerDoc(db, "config", "planta_modulos"), leerColeccion(db, "cotizador_parametros"), leerDoc(db, "bodega_config", "main"), leerDoc(db, "corte_config", "main"),
    ]);
    setDatos({ trabajadores, areas, turnos, grupos, planta, cotParametros, bodega, corte });
    setLeidoEn(new Date());
    setCargando(false);
  }, [db]);
  useEffect(() => { cargar(); }, [cargar]);

  const secciones = useMemo(() => (datos ? construirParametros({ config, users, datos }) : []), [config, users, datos]);
  const todas = useMemo(() => secciones.flatMap((s) => s.filas), [secciones]);
  const cuenta = (e) => todas.filter((f) => f.estado === e).length;

  const q = norm(busca);
  const visibles = secciones
    .map((s) => ({ ...s, filas: s.filas.filter((f) => (!soloPend || f.estado === "aviso" || f.estado === "falta") && (!q || norm(`${f.nombre} ${f.valor} ${f.donde} ${s.titulo}`).includes(q))) }))
    .filter((s) => s.filas.length);

  const pill = (e) => {
    const x = ESTADOS[e];
    return <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: T[x.bg], color: T[x.color], whiteSpace: "nowrap" }}>{x.txt}</span>;
  };
  const kpi = (e, etiqueta) => (
    <div style={{ flex: "1 1 130px", minWidth: 130, padding: "10px 14px", borderRadius: 10, background: T[ESTADOS[e].bg] }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: T[ESTADOS[e].color], fontVariantNumeric: "tabular-nums" }}>{cuenta(e)}</div>
      <div style={{ fontSize: 12, color: T.slate }}>{etiqueta}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Centro de parámetros</div>
          <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>Todo lo que está parametrizado en ATLAS, con su valor actual y lo que falta. Es de consulta: aquí no se cambia nada.</div>
        </div>
        <button onClick={cargar} disabled={cargando} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.white, color: T.ink, fontSize: 12, fontWeight: 600, cursor: cargando ? "default" : "pointer" }}>
          {cargando ? "Leyendo…" : "↻ Volver a leer"}
        </button>
      </div>

      {cargando && !datos ? <div style={{ padding: 30, textAlign: "center", color: T.slate, fontSize: 13 }}>Leyendo la configuración…</div> : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {kpi("ok", "completos")}{kpi("aviso", "para revisar")}{kpi("falta", "sin configurar")}{kpi("info", "informativos")}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un parámetro…" style={{ flex: "1 1 220px", minWidth: 200, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, color: T.ink, background: T.white }} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.ink, cursor: "pointer" }}>
              <input type="checkbox" checked={soloPend} onChange={(e) => setSoloPend(e.target.checked)} /> Solo pendientes
            </label>
            {leidoEn && <span style={{ fontSize: 11, color: T.slate }}>Leído a las {leidoEn.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>

          {!visibles.length && <div style={{ padding: 24, textAlign: "center", color: T.slate, fontSize: 13 }}>{soloPend && !q ? "No hay nada pendiente. Todo lo revisado está configurado." : "Ningún parámetro coincide con la búsqueda."}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {visibles.map((s) => (
              <div key={s.id}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{s.icono} {s.titulo}</div>
                <div style={{ borderTop: `1px solid ${T.border}` }}>
                  {s.filas.map((f) => (
                    <div key={f.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 4px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" }}>
                      <div style={{ width: 112, flexShrink: 0, paddingTop: 1 }}>{pill(f.estado)}</div>
                      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{f.nombre}</div>
                        <div style={{ fontSize: 12.5, color: T.ink, marginTop: 2, overflowWrap: "anywhere" }}>{f.valor}</div>
                        <div style={{ fontSize: 11, color: T.slate, marginTop: 3 }}>Se edita en: {f.donde}</div>
                      </div>
                      {f.tab && onIrTab && (
                        <button onClick={() => onIrTab(f.tab)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.white, color: T.denim, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Abrir</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
