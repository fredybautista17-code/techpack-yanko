// ─── ADMINISTRACIÓN → USUARIOS: formulario «Nuevo / Editar usuario» por secciones ───────────────────────────────
// (2026-11-22, a pedido de Fredy, maqueta v16) Mismo formulario y mismos campos de siempre, ordenado en secciones con un resumen en vivo de lo que
// verá la persona. Los datos se guardan EXACTAMENTE igual (form → saveUser en App.js); aquí solo cambia cómo se ve y se opera.
import React, { useState } from "react";
import useAnchoCorto from "./use-ancho-corto";
import BloqueAreasUsuario from "./usuario-areas";

function Interruptor({ on, onClick, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      style={{ position: "relative", width: 38, height: 22, borderRadius: 20, border: "none", background: on ? "#1B9467" : "#CFC8BC", flex: "none", cursor: "pointer", transition: "background .15s", padding: 0 }}>
      <span style={{ position: "absolute", top: 3, left: 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transform: on ? "translateX(16px)" : "none", transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  );
}

export default function FormularioUsuario({ form, setForm, editUser, users, config, areasNomina, procesosNomina, roleOptions, rolesConfigurados, rolBase, modulosRol, disenoItems, grupos, error, creando, onSave, onCancel, T,
  MODULOS_CLIENTE_OPCIONES, GRUPOS_CLIENTE_PRODUCCION, GRUPOS_MI_DIA, TARJETAS_DEFECTO_MIDIA, claveCierreDeArea, esAreaCorte, sanitizarUsername }) {
  const [sec, setSec] = useState("acceso");
  const angosto = useAnchoCorto(1000);
  const esCliente = form.role === "Cliente";
  const borde = `1px solid ${T.border}`;
  const tarjeta = { background: T.white, border: borde, borderRadius: 14, boxShadow: "0 1px 2px rgba(26,26,46,.05),0 4px 14px rgba(26,26,46,.06)" };
  const input = { width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 10, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" };
  const etiqueta = { fontSize: 11, fontWeight: 800, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" };
  const nota = { fontSize: 11.5, color: T.slate, fontWeight: 600, marginTop: 5, lineHeight: 1.45 };
  const bloque = (req) => ({ border: `1px solid ${req ? "#F0B8B8" : T.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: req ? "#FFF7F7" : "#FAF8F4" });
  const tag = (txt, tipo) => <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 20, padding: "2px 8px", background: tipo === "r" ? "#FBE6E6" : tipo === "v" ? "#E2F4EB" : "#EFEBE4", color: tipo === "r" ? "#CB4646" : tipo === "v" ? "#1B9467" : T.slate }}>{txt}</span>;
  const chip = (on) => ({ border: `1.5px solid ${on ? T.ink : T.border}`, background: on ? T.ink : T.white, color: on ? "#fff" : T.ink, borderRadius: 20, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const fila = { display: "flex", gap: 12, alignItems: "center", border: borde, borderRadius: 11, padding: "10px 12px", background: T.white, marginBottom: 8 };
  const btn = { border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12.5, padding: "8px 14px", background: "#EFEBE4", color: T.ink, cursor: "pointer", fontFamily: "inherit" };
  const alternarLista = (campo, valor) => setForm((f) => { const a = f[campo] || []; return { ...f, [campo]: a.includes(valor) ? a.filter((x) => x !== valor) : [...a, valor] }; });
  const iniciales = (n) => (n || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const tieneProd = (form.clientesProduccion || []).length > 0 || !!form.clienteProduccion;
  const necesitaProd = esCliente && ((form.modulosCliente || []).includes("produccion") || (form.modulosCliente || []).includes("devoluciones"));
  const faltaProd = necesitaProd && !tieneProd;

  const secciones = [["acceso", "🔑", "Datos de acceso"], ["ve", "👁", "Qué ve este usuario"]];
  if (!esCliente) secciones.push(["trabajo", "🏭", "Área y trabajo"]);
  secciones.push(["especial", "⭐", "Accesos especiales"]);
  if (!esCliente && editUser) secciones.push(["midia", "☀️", "Tarjetas de Mi Día"]);
  const secActual = secciones.some((s) => s[0] === sec) ? sec : "ve";

  // ── Paneles ──
  const panelAcceso = (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Datos de acceso</h3>
      <div style={{ ...nota, marginTop: 2, marginBottom: 14 }}>Con qué entra la persona y qué rol tiene.</div>
      <div style={{ display: "grid", gridTemplateColumns: angosto ? "1fr" : "1fr 1fr", gap: 12 }}>
        <div>
          <label style={etiqueta}>Nombre completo</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Laura Sánchez" style={input} />
        </div>
        <div>
          <label style={etiqueta}>Usuario</label>
          {/* Se limpia mientras se escribe (minúsculas, sin espacios ni acentos): arma por detrás el correo interno de acceso */}
          <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: sanitizarUsername(e.target.value) }))} placeholder="Ej: laura" disabled={!!editUser} style={{ ...input, background: editUser ? "#FAF8F4" : T.white, color: editUser ? T.slate : T.ink }} />
          <div style={nota}>{editUser ? "No se puede cambiar una vez creado." : "Sin espacios ni tildes — así se escribe para iniciar sesión."}</div>
        </div>
        <div>
          <label style={etiqueta}>Contraseña</label>
          {editUser ? (
            <div style={{ ...input, background: "#FAF8F4", color: T.slate, fontSize: 12.5 }}>Usa el botón «🔑 Clave» para cambiarla.</div>
          ) : (
            <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" style={input} />
          )}
        </div>
        <div>
          <label style={etiqueta}>Rol</label>
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={input}>
            {roleOptions.map((r) => <option key={r} value={r}>{rolesConfigurados.includes(r) ? r : `${r} (sin permisos configurados)`}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={etiqueta}>Correo (opcional)</label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="nombre@empresa.com" style={input} />
          <div style={nota}>Para poder mandarle avisos por correo (ej. prototipos/cápsulas vencidos).</div>
        </div>
      </div>
    </div>
  );

  const clientes = config.clientes || [];
  const panelVe = (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Qué ve este usuario</h3>
      <div style={{ ...nota, marginTop: 2, marginBottom: 14 }}>{esCliente ? "Para un usuario Cliente, aquí defines de qué clientes ve información y qué módulos tiene." : "Qué áreas ve esta persona (las de su rol o una lista propia) y, si hace falta, de qué clientes ve información."}</div>
      {!esCliente && (
        <div style={bloque(false)}>
          <BloqueAreasUsuario form={form} setForm={setForm} editUser={editUser} rolBase={rolBase} modulosRol={modulosRol || []} disenoItems={disenoItems} grupos={grupos} T={T} />
        </div>
      )}
      <div style={bloque(false)}>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>{esCliente ? "1 · " : ""}De qué clientes ve información {tag((form.clientesAsociados || []).length ? `${form.clientesAsociados.length} marcado(s)` : "todos", "g")}</div>
        {clientes.length === 0 ? <div style={{ fontSize: 12, color: T.slate }}>No hay clientes cargados todavía.</div> : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 180, overflowY: "auto" }}>
            {clientes.map((cl) => { const on = (form.clientesAsociados || []).includes(cl.nombre); return <button key={cl.nombre} type="button" onClick={() => alternarLista("clientesAsociados", cl.nombre)} style={chip(on)}>{cl.nombre}</button>; })}
          </div>
        )}
        <div style={nota}>Si marcas uno o más, este usuario solo ve lo de esos clientes{esCliente ? " (en los módulos que le actives abajo)" : ""}. Sin ninguno marcado, ve todos los clientes.</div>
      </div>
      {esCliente && (
        <>
          <div style={bloque(false)}>
            <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>2 · Módulos que puede ver {tag((form.modulosCliente || []).length ? `${form.modulosCliente.length} activos` : "todos los de cliente", (form.modulosCliente || []).length ? "v" : "g")}</div>
            {MODULOS_CLIENTE_OPCIONES.map((m) => {
              const on = (form.modulosCliente || []).includes(m.id);
              const corto = m.label.indexOf(" (") > 0 ? m.label.slice(0, m.label.indexOf(" (")) : m.label;
              const ayuda = m.label.indexOf(" (") > 0 ? m.label.slice(m.label.indexOf(" (") + 2, -1) : "";
              return (
                <div key={m.id} style={fila}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.4, color: T.ink }}>{corto}{ayuda ? <div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, marginTop: 2 }}>{ayuda.charAt(0).toUpperCase() + ayuda.slice(1)}</div> : null}</div>
                  <Interruptor on={on} label={corto} onClick={() => alternarLista("modulosCliente", m.id)} />
                </div>
              );
            })}
            <div style={nota}>Sin ninguno activo ve todos los módulos de cliente (como hoy). Si activas alguno, ve solo esos.</div>
          </div>
          {necesitaProd && (
            <div style={bloque(faltaProd)}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>3 · Clientes de Producción {faltaProd ? tag("obligatorio", "r") : tag("listo", "v")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {GRUPOS_CLIENTE_PRODUCCION.map((g) => <button key={g.id} type="button" onClick={() => alternarLista("clientesProduccion", g.id)} style={chip((form.clientesProduccion || []).includes(g.id))}>{g.label}</button>)}
              </div>
              <div style={nota}>{faltaProd ? <b style={{ color: "#CB4646" }}>Sin esto, Devoluciones y Producción NO le aparecen, aunque estén activos arriba.</b> : "Verá los datos de producción y devoluciones de este grupo de Busint."} Define de qué cliente(s) de Busint ve los datos. Si marcas más de uno, el usuario podrá elegir entre ellos dentro de la pantalla. Si no ves el cliente que necesitas, pide que lo agreguen a la lista.</div>
            </div>
          )}
          <div style={fila}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.ink }}>🔒 Solo lectura<div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, marginTop: 2 }}>No puede aprobar, declinar, vincular a pedido ni editar nada. Solo ve el avance. No afecta a otros usuarios del rol Cliente.</div></div>
            <Interruptor on={!!form.soloLecturaCliente} label="Solo lectura" onClick={() => setForm((f) => ({ ...f, soloLecturaCliente: !f.soloLecturaCliente }))} />
          </div>
        </>
      )}
    </div>
  );

  const procesos = procesosNomina || [];
  const panelTrabajo = (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Área y trabajo</h3>
      <div style={{ ...nota, marginTop: 2, marginBottom: 14 }}>Para líderes de área y quien programa procesos.</div>
      <label style={etiqueta}>Área interna (opcional)</label>
      <select value={form.areaNomina} onChange={(e) => setForm((f) => ({ ...f, areaNomina: e.target.value }))} style={input}>
        <option value="">— Ninguna (no es líder de área) —</option>
        {(areasNomina || []).map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
      </select>
      <div style={nota}>Si eliges un área, este usuario entra a Nómina con una pantalla simple para registrar solo la producción/permisos de su gente (los trabajadores con esa misma «Área Interna» en Trabajadores — distinta de «Área TNS»). Las áreas se administran en Nómina → Administrativo → Área Interna. Necesita también acceso al módulo «Nómina» en su rol.</div>
      <div style={{ ...bloque(false), marginTop: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>Procesos que puede programar {tag(`${(form.procesosPlaneacion || []).length} marcado(s)`, "g")}</div>
        {procesos.length === 0 ? <div style={{ fontSize: 12, color: T.slate }}>No hay procesos cargados en Nómina → Administrativo → Procesos.</div> : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 200, overflowY: "auto" }}>
            {procesos.map((p) => <button key={p.id} type="button" onClick={() => alternarLista("procesosPlaneacion", p.proceso)} style={chip((form.procesosPlaneacion || []).includes(p.proceso))}>{p.proceso}</button>)}
          </div>
        )}
        <div style={nota}>Si marcas uno o más procesos, le aparece en el menú lateral un «Programador de Procesos» aparte (además de «Mi Día») donde solo ve/programa lotes en esos procesos (ej. Anny Beltrán: Postura Dije, Proceso Adicio. Cordón, Terminación) — no depende del acceso al módulo completo de Planeación. Para el selector de «trabajador de tu equipo» también necesita tener puesta el Área Interna arriba.</div>
      </div>
    </div>
  );

  const especial = (campo, titulo, ayuda) => (
    <div style={fila} key={campo}>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, lineHeight: 1.4, color: T.ink }}>{titulo}<div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, marginTop: 2 }}>{ayuda}</div></div>
      <Interruptor on={!!form[campo]} label={titulo} onClick={() => setForm((f) => ({ ...f, [campo]: !f[campo] }))} />
    </div>
  );
  // (2026-11-23, a pedido de Fredy) Áreas que ve en la Auditoría Busint vs Nómina. Ninguna marcada = todas (Talento Humano, Contabilidad).
  const bloqueAreasAuditoria = () => (
    <div style={{ border: borde, borderRadius: 12, padding: "12px 14px", margin: "-2px 0 12px", background: "#FAF8F4" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 4 }}>🔍 Auditoría de Nómina: ¿de qué áreas?</div>
      {!editUser ? (
        <div style={{ ...nota, marginTop: 0 }}>Las áreas se eligen al editar el usuario, después de crearlo. Mientras tanto ve todas.</div>
      ) : (
        <>
          <div style={{ ...nota, marginTop: 0, marginBottom: 8 }}>Marca las áreas cuya Auditoría puede ver. Si no marcas ninguna, ve todas (Talento Humano, Contabilidad). El administrador siempre ve todas.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(areasNomina || []).slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")).map((a) => {
              const on = (form.areasAuditoria || []).includes(a.nombre);
              return <button key={a.id} type="button" style={chip(on)} onClick={() => setForm((f) => { const l = f.areasAuditoria || []; return { ...f, areasAuditoria: on ? l.filter((x) => x !== a.nombre) : [...l, a.nombre] }; })}>{a.nombre}</button>;
            })}
            {!(areasNomina || []).length && <span style={nota}>No hay áreas cargadas en Nómina todavía.</span>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {form.areaNomina && <button type="button" style={btn} onClick={() => setForm((f) => ({ ...f, areasAuditoria: [f.areaNomina] }))}>Solo mi Área Interna ({form.areaNomina})</button>}
            {(form.areasAuditoria || []).length > 0 && <button type="button" style={btn} onClick={() => setForm((f) => ({ ...f, areasAuditoria: [] }))}>Quitar (ver todas)</button>}
          </div>
        </>
      )}
    </div>
  );
  const panelEspecial = (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Accesos especiales</h3>
      <div style={{ ...nota, marginTop: 2, marginBottom: 14 }}>Permisos extra que se dan a una persona puntual.</div>
      {especial("isAdmin", "Acceso de administrador", "Ve y puede hacer todo en ATLAS.")}
      {especial("landingAreas", "Mostrar «☀️ Mi Día» (Auditoría de Nómina)", "Le agrega el botón «☀️ Mi Día» a su menú lateral (sin quitarle nada de lo demás) donde ve la Auditoría Busint vs Nómina. Abajo eliges de qué áreas (sin marcar ninguna ve todas). Verifica que su rol tenga el permiso «Centro de Costo» en 🗂️ Áreas (Admin → Roles).")}
      {form.landingAreas && bloqueAreasAuditoria()}
      {!esCliente && !form.isAdmin && (
        <div style={{ ...fila, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, color: T.ink }}>✉ Correos (en Financiera)<div style={{ fontSize: 11.5, color: T.slate, fontWeight: 600, marginTop: 2 }}>Elige qué ve esta persona en «Correos». No necesita tener el área Financiera: le aparece un menú solo con Correos. Debe volver a entrar a ATLAS una vez para que el cambio se active.</div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["", "Sin acceso"], ["facturas", "Solo Facturas recibidas"], ["total", "Acceso total (como el administrador)"]].map(([v, t]) => (
              <button key={v || "ninguno"} type="button" style={chip((form.correosAcceso || "") === v)} onClick={() => setForm((f) => ({ ...f, correosAcceso: v }))}>{t}</button>
            ))}
          </div>
          {form.correosAcceso === "facturas" && <div style={nota}>Solo ve los correos clasificados como factura de proveedor: puede marcarlas y abrir sus adjuntos. No ve las cuentas ni el resto de correos, ni sincroniza ni clasifica.</div>}
          {form.correosAcceso === "total" && <div style={nota}>Ve todas las bandejas, cuentas conectadas (y sus contraseñas de aplicación se guardan en el servidor, no se muestran), sincroniza y clasifica igual que el administrador.</div>}
        </div>
      )}
      {!esCliente && especial("nominaLiderArea", "Líder de área: Producción, Horas y Permisos (Nómina)", "Entra a Nómina con solo Registrar Producción, Registrar Horas y Permisos (Calendario) de los trabajadores de su «Área Interna» (se asigna en «Área y trabajo»). No le da la Nómina completa.")}
      {!esCliente && especial("costosMuestras", "Costos de muestras (Contabilidad)", "Ve «💲 Costos de muestras» dentro de Contabilidad (necesita también acceso al módulo Contabilidad): sueldos del personal de muestra, precio por muestra, presupuesto por taller y lo que se debe pagar a talleres externos. Son valores en dinero.")}
      {!esCliente && especial("nominaTodasAreas", "Ve todas las áreas (Nómina)", "Para Talento Humano: aunque tenga un «Área Interna» (la usa en Mi Día), en Nómina deja de limitarse a su área y ve a los trabajadores de todas (Permisos, lupa y «Dar un permiso» incluidos). Solo actúa si su rol de Nómina es Completa o Solo Novedades; un líder con solo los accesos de líder no lo recibe.")}
      {!esCliente && especial("centroTalentoHumano", "Centro de Talento Humano (Nómina)", "Le abre en Nómina → Personal el «🧭 Centro de Talento Humano»: tablero de vencimientos (período de prueba, contratos a término fijo, dotación) y el expediente de cada trabajador con sus formatos y fotos de los firmados. Lleva datos personales y de salud: dáselo solo a Talento Humano y gerencia. Necesita además Nómina (Completa o Solo Novedades).")}
      {!esCliente && especial("nominaLiquidaciones", "Liquidaciones (Nómina)", "Le abre en Nómina solo el grupo «🧮 Liquidaciones»: Liquidación de Trabajador (con su recibo), Incapacidades por cobrar, Días No Justificados, Provisión (hasta hoy) y Préstamos, de todos los trabajadores. No ve producción, horas ni el resto de Nómina. Si su rol ya tiene Nómina Completa, ya las ve y este interruptor no cambia nada.")}
      {!esCliente && especial("nominaLiderResumen", "Líder de área: Resumen (Nómina)", "Entra a Nómina con el «💰 Resumen» de la quincena de los trabajadores de su «Área Interna»: lo producido, las horas, el pago y la ayuda (incluye valores en dinero). Se puede combinar con los otros dos interruptores de líder.")}
      {!esCliente && especial("nominaLiderAsistencia", "Líder de área: Asistencia (Nómina)", "Entra a Nómina con solo Tabulador de Asistencia, Historial de Asistencia, Estadísticas de Permisos y Retardos del mes de los trabajadores de su «Área Interna» (sin valores en dinero). Se puede combinar con el interruptor de Producción, Horas y Permisos.")}
      {especial("costosPlanta", "Costos y ventas de planta (Planta Yanko)", "Le muestra la pestaña «💵 Costos y ventas» dentro de Planta Yanko para cargar y borrar gastos de insumos y ventas de MAQUILA, ver la ganancia real y cerrar el mes. Necesita además acceso al módulo Planta. Se guarda al editar un usuario que ya existe.")}
      {!esCliente && especial("actualizaIngresos", "Actualizar Ingresos de clientes (Financiera)", "Le muestra el botón «🔄 Traer desde…» en Financiera → Ingresos para traer de TNS y Busint lo que han pagado los clientes. Sin este interruptor solo lo ve el administrador. Necesita además acceso al módulo Financiera. Se guarda al editar un usuario que ya existe.")}
      {!esCliente && especial("clasificaIngresos", "Clasificar Ingresos de clientes (Financiera)", "Le muestra «🏷 Clasificar ingresos» y la ventana «¿Para qué fue cada ingreso?» en Financiera → Ingresos, para decir si cada cobro fue para Nómina, Seg. social, Provisiones, Gastos, Cuotas o Tela. Es lo que baja «Debo pagar». Sin este interruptor solo lo ve el administrador. Los cobros a clasificar se traen con «🔄 Traer desde…», así que para Tesorería activa también «Actualizar Ingresos de clientes». Necesita además acceso al módulo Financiera. Se guarda al editar un usuario que ya existe.")}
    </div>
  );

  const panelMiDia = (() => {
    if (!editUser) return null;
    const tiene = (id) => (form.tarjetasMiDia || []).includes(id);
    const alternar = (id, on) => setForm((f) => { const a = f.tarjetasMiDia || []; return { ...f, tarjetasMiDia: on ? [...new Set([...a, id])] : a.filter((x) => x !== id) }; });
    const hayArea = !!claveCierreDeArea(form.areaNomina);
    const hayCorte = esAreaCorte(form.areaNomina);
    const hayProcesos = (form.procesosPlaneacion || []).length > 0;
    const otrosConTarjetas = users.filter((u) => u.id !== editUser.id && (u.tarjetasMiDia || []).length > 0);
    const delArea = form.areaNomina ? users.filter((u) => u.id !== editUser.id && u.areaNomina === form.areaNomina) : [];
    return (
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Tarjetas de «☀️ Mi Día»</h3>
        <div style={{ ...nota, marginTop: 2, marginBottom: 14 }}>Marca lo que quieres que vea en su Mi Día; se muestran una debajo de otra. Si no marcas ninguna, ve su Mi Día de siempre.</div>
        {GRUPOS_MI_DIA.map((g) => {
          const bloqueado = (g.requiere === "area" && !hayArea) || (g.requiere === "areaInterna" && !form.areaNomina) || (g.requiere === "procesos" && !hayProcesos) || (g.requiere === "areaCorte" && !hayCorte);
          return (
            <div key={g.id} style={{ marginBottom: 12, opacity: bloqueado ? 0.6 : 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{g.titulo}</div>
              {bloqueado && (
                <div style={{ ...nota, marginTop: 0, marginBottom: 6 }}>
                  {g.requiere === "areaCorte" ? "Solo para quien tiene «Área Interna» = CORTE." : g.requiere === "area" ? "Primero elige su «Área Interna» (hoy con cierre diario: Corte, Zona calor y Control de calidad)." : g.requiere === "areaInterna" ? "Primero elige su «Área Interna»: de ahí salen sus procesos (Nómina → Área Interna) y su equipo." : "Primero marca los procesos que puede programar."}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0 12px" }}>
                {g.tarjetas.map((t) => (
                  <div key={t.id} style={{ ...fila, opacity: bloqueado ? 0.7 : 1 }}>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.ink }}>{t.label}</div>
                    <Interruptor on={tiene(t.id)} label={t.label} onClick={() => { if (!bloqueado) alternar(t.id, !tiene(t.id)); }} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {tiene("auditoria_nomina") && bloqueAreasAuditoria()}
        {tiene("cumpleanos") && (
          <div style={{ border: borde, borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "#FAF8F4" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 4 }}>🎂 Cumpleaños: ¿de qué áreas?</div>
            <div style={{ ...nota, marginTop: 0, marginBottom: 8 }}>Marca las áreas cuyos cumpleaños debe ver en su Mi Día. Si no marcas ninguna, ve los de todas las áreas (Talento Humano). El correo diario no cambia.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(areasNomina || []).slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")).map((a) => {
                const on = (form.areasCumpleanos || []).includes(a.nombre);
                return <button key={a.id} type="button" style={chip(on)} onClick={() => setForm((f) => { const l = f.areasCumpleanos || []; return { ...f, areasCumpleanos: on ? l.filter((x) => x !== a.nombre) : [...l, a.nombre] }; })}>{a.nombre}</button>;
              })}
              {!(areasNomina || []).length && <span style={nota}>No hay áreas cargadas en Nómina todavía.</span>}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
          {hayArea && <button type="button" style={btn} onClick={() => setForm((f) => ({ ...f, tarjetasMiDia: [...new Set([...(f.tarjetasMiDia || []), ...TARJETAS_DEFECTO_MIDIA])] }))}>Marcar las recomendadas del cierre</button>}
          <button type="button" style={btn} onClick={() => setForm((f) => ({ ...f, tarjetasMiDia: [] }))}>Quitar todas</button>
          {otrosConTarjetas.length > 0 && (
            <select value="" onChange={(e) => { const u = users.find((x) => x.id === e.target.value); if (u) setForm((f) => ({ ...f, tarjetasMiDia: [...(u.tarjetasMiDia || [])] })); }} style={{ ...btn, fontWeight: 600 }}>
              <option value="">Copiar de otro líder…</option>
              {otrosConTarjetas.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
        {delArea.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, color: T.ink, marginTop: 10 }}>
            <input type="checkbox" checked={!!form.aplicarTarjetasArea} onChange={(e) => setForm((f) => ({ ...f, aplicarTarjetasArea: e.target.checked }))} />
            Aplicar estas mismas tarjetas a los otros {delArea.length} usuario{delArea.length === 1 ? "" : "s"} de su Área Interna ({form.areaNomina})
          </label>
        )}
      </div>
    );
  })();

  // ── Resumen en vivo ──
  const nombresModulos = (form.modulosCliente || []).map((id) => { const m = MODULOS_CLIENTE_OPCIONES.find((x) => x.id === id); return m ? (m.label.indexOf(" (") > 0 ? m.label.slice(0, m.label.indexOf(" (")) : m.label) : id; });
  const nombresProd = (form.clientesProduccion || []).map((id) => { const g = GRUPOS_CLIENTE_PRODUCCION.find((x) => x.id === id); return g ? g.label : id; });
  const items = [["👤", <span key="r">Rol: <b>{form.role}</b></span>]];
  items.push(["🏢", <span key="c">Clientes: <b>{(form.clientesAsociados || []).length ? form.clientesAsociados.join(", ") : "todos"}</b></span>]);
  if (esCliente) {
    items.push(["🧩", <span key="m">Módulos: <b>{nombresModulos.length ? nombresModulos.join(", ") : "todos los de cliente"}</b></span>]);
    if (necesitaProd) items.push(["🏭", <span key="p">Producción de: <b>{nombresProd.length ? nombresProd.join(", ") : (form.clienteProduccion || "— sin elegir —")}</b></span>]);
    items.push(["🔒", <span key="s"><b>{form.soloLecturaCliente ? "Solo lectura" : "Puede aprobar y editar"}</b></span>]);
  } else {
    items.push(["🧭", <span key="ar">Áreas: <b>{Array.isArray(form.modulosPropios) ? `lista propia (${form.modulosPropios.length} accesos)` : "las de su rol"}</b></span>]);
    items.push(["🏭", <span key="a">Área: <b>{form.areaNomina || "ninguna"}</b></span>]);
    items.push(["⚙️", <span key="pr">Procesos a programar: <b>{(form.procesosPlaneacion || []).length || "ninguno"}</b></span>]);
  }
  if (form.isAdmin) items.push(["⭐", <span key="ad"><b>Administrador</b></span>]);
  if (form.landingAreas) items.push(["☀️", (form.areasAuditoria || []).length ? <span key="md">Auditoría en <b>Mi Día</b>: <b>{form.areasAuditoria.join(", ")}</b></span> : <span key="md">Con <b>Mi Día</b> de todas las áreas</span>]);
  if (form.costosPlanta) items.push(["💵", <span key="cp">Con <b>Costos y ventas</b> de planta</span>]);
  if (form.actualizaIngresos) items.push(["🔄", <span key="ai">Puede <b>actualizar Ingresos</b> de clientes</span>]);
  if (form.nominaLiquidaciones) items.push(["🧮", <span key="nl">Ve las <b>Liquidaciones</b> de Nómina</span>]);
  if (form.clasificaIngresos) items.push(["🏷", <span key="ci">Puede <b>clasificar Ingresos</b> de clientes</span>]);

  const panel = { acceso: panelAcceso, ve: panelVe, trabajo: panelTrabajo, especial: panelEspecial, midia: panelMiDia }[secActual];

  return (
    <div style={{ background: T.canvas, borderRadius: 12, padding: 20, border: `1.5px solid ${T.denim}`, marginBottom: 20 }}>
      <div style={{ ...tarjeta, display: "flex", gap: 12, alignItems: "center", padding: "14px 18px", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ width: 42, height: 42, borderRadius: "50%", background: "#C8B8A2", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, flex: "none", color: T.ink }}>{iniciales(form.name)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{editUser ? `Editar: ${editUser.name}` : "Nuevo usuario"}</div>
          <div style={{ fontSize: 12, color: T.slate, fontWeight: 600, marginTop: 2 }}>{form.username ? `@${form.username} · ` : ""}{form.role}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: angosto ? "1fr" : "220px minmax(0,1fr) 260px", gap: 16, alignItems: "start" }}>
        <nav style={{ ...tarjeta, padding: 8, display: "flex", flexDirection: angosto ? "row" : "column", gap: 2, overflowX: angosto ? "auto" : "visible", position: angosto ? "static" : "sticky", top: 12 }}>
          {secciones.map(([id, ic, n]) => (
            <button key={id} type="button" onClick={() => setSec(id)}
              style={{ display: "flex", gap: 10, alignItems: "center", width: angosto ? "auto" : "100%", whiteSpace: "nowrap", border: "none", background: secActual === id ? T.ink : "transparent", color: secActual === id ? "#fff" : T.slate, borderRadius: 10, padding: 10, textAlign: "left", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              <span>{ic}</span>{n}{id === "ve" && faltaProd ? <span style={{ marginLeft: "auto", color: secActual === id ? "#FFB3B3" : "#CB4646", fontWeight: 800 }}>!</span> : null}
            </button>
          ))}
        </nav>
        <div style={{ ...tarjeta, padding: "18px 20px", minWidth: 0 }}>{panel}</div>
        <aside style={{ ...tarjeta, padding: 16, position: angosto ? "static" : "sticky", top: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: T.ink }}>Resumen: lo que verá</div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 7, margin: 0, padding: 0 }}>
            {items.map(([ic, txt], i) => <li key={i} style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, display: "flex", gap: 8, color: T.ink }}><span>{ic}</span>{txt}</li>)}
          </ul>
          {faltaProd
            ? <div style={{ marginTop: 12, background: "#FBE6E6", color: "#CB4646", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>⚠ Falta elegir el «Cliente de Producción». Sin eso, Devoluciones y Producción no le aparecerán.</div>
            : <div style={{ marginTop: 12, background: "#E2F4EB", color: "#1B9467", borderRadius: 10, padding: "9px 11px", fontSize: 12, fontWeight: 700 }}>✓ Todo listo para guardar</div>}
        </aside>
      </div>
      {error && <div style={{ marginTop: 12, padding: "8px 12px", background: T.coralBg, borderRadius: 8, fontSize: 13, color: T.coral, fontWeight: 600 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={btn}>Cancelar</button>
        <button type="button" onClick={onSave} disabled={creando} style={{ ...btn, background: T.ink, color: "#fff", opacity: creando ? 0.6 : 1 }}>{creando ? "Creando..." : (editUser ? "Guardar cambios" : "Crear Usuario")}</button>
      </div>
    </div>
  );
}
