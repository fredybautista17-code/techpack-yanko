// ─── MI DÍA POR LÍDER (tarjetas elegidas en Usuarios) ────────────────────────
// (2026-10-26, a pedido de Fredy) Pantalla «☀️ Mi Día» para quien tiene marcadas tarjetas en Administrador general →
// Usuarios. Junta las piezas marcadas: cierre diario de SU área (la de «Área Interna»): meta de hoy, saldo acumulado,
// cubren su salario, meta día a día y cada trabajador. Usa los mismos cálculos del Tablero de costos
// (cierre-diario.jsx). Sin gráficas: tarjetas y tablas, en el estilo del Mi Día de Planeación. Solo lectura.
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useCierreDiario, TablaTrabajadores, ChipsMetaDias } from "./cierre-diario";
import { diaDeArea, diasDelMesHasta, esHabilISO, sumarDiasISO } from "./cierre-diario-calculo";
import { claveCierreDeArea, IDS_CIERRE, IDS_PLANEACION } from "./mi-dia-tarjetas-catalogo";
import { MiDiaPlaneacionBloque, ProgramadorProcesosStandalone, MiDiaNominaStandalone, ListaPorProgramarBloque } from "./modulo-planeacion";

const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", greenLn: "#C5E6D8", red: "#E85D4A", redBg: "#FDF0EE", redLn: "#F0CCC6",
  blue: "#3D6B9E", blueBg: "#EBF1F7", blueLn: "#C9D9E8", amber: "#C47C1A", amberBg: "#FDF5E6", amberLn: "#EBD9B4",
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CO");
const money = (n) => (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n) || 0));
const signed = (n) => `${Number(n) >= 0 ? "+" : "−"}$${fmt(Math.abs(Number(n) || 0))}`;
const colorSaldo = (n) => (Math.round(Number(n) || 0) >= 0 ? C.green : C.red);
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", background: C.white };
const td = { padding: "9px 10px", fontSize: 13, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const BOTON = { padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${C.border}`, background: C.white, color: C.ink };
const etiquetaDia = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function Chip({ activo, onClick, children }) {
  return (
    <span onClick={onClick} style={{ padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${activo ? C.ink : C.border}`, background: activo ? C.ink : C.white, color: activo ? C.white : C.slate }}>
      {children}
    </span>
  );
}
function Tarjeta({ icono, valor, texto, color, fondo, linea, activa, onClick }) {
  return (
    <div onClick={onClick} style={{ flex: "1 1 220px", background: fondo, border: `${activa ? 2 : 1}px solid ${activa ? color : linea}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer" }}>
      <div style={{ fontSize: 24 }}>{icono}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color, marginTop: 2, lineHeight: 1.15 }}>{valor}</div>
      <div style={{ fontSize: 13, color: C.slate, marginTop: 2, lineHeight: 1.35 }}>{texto}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginTop: 6 }}>{activa ? "Ocultar detalle ↑" : "Ver detalle →"}</div>
    </div>
  );
}
function Seccion({ titulo, children }) {
  const [abierta, setAbierta] = useState(true);
  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => setAbierta(!abierta)} style={{ cursor: "pointer", margin: "4px 0 8px", fontSize: 15, fontWeight: 800, color: C.ink }}>
        {titulo} <span style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginLeft: 6 }}>{abierta ? "▼ ocultar" : "▶ ver"}</span>
      </div>
      {abierta ? <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "4px 0 14px" }}>{children}</div> : null}
    </div>
  );
}

function BloqueCierre({ db, currentUser }) {
  const hoyISO = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10), []);
  const [diaSel, setDiaSel] = useState(hoyISO);
  const [alcance, setAlcance] = useState("mes");
  const [detalle, setDetalle] = useState(null);
  const marcadas = currentUser?.tarjetasMiDia || [];
  const tiene = (id) => marcadas.includes(id);
  const areaClave = claveCierreDeArea(currentUser?.areaNomina);
  const { anio, mes, cargando, cierresMap, corteIdx, trabajadoresCorte, filasCosto } = useCierreDiario(db, diaSel, alcance, false);
  const f = filasCosto.find((x) => x.clave === areaClave) || null;

  // Zona calor y Control de calidad no tienen cierre hasta que se guarda: si hoy no hay, muestra el último cierre (últimos 10 días).
  const ajustado = useRef(false);
  useEffect(() => {
    if (ajustado.current || !areaClave || areaClave === "CORTE" || !cierresMap.size) return;
    ajustado.current = true;
    if (cierresMap.has(`${areaClave}|${hoyISO}`)) return;
    for (let i = 1; i <= 10; i++) {
      const iso = sumarDiasISO(hoyISO, -i);
      if (cierresMap.has(`${areaClave}|${iso}`)) { setDiaSel(iso); return; }
    }
  }, [cierresMap, areaClave, hoyISO]);

  const esHabil = esHabilISO(diaSel);
  const etiquetaAlcance = alcance === "mes" ? `de ${MESES[mes - 1].toLowerCase()}` : alcance === "anio" ? `del año ${anio}` : "total";

  // Día a día del mes (detalle del saldo acumulado)
  const filasDias = useMemo(() => {
    if (!f || f.ac.fuente !== "dias") return [];
    let acum = 0;
    const out = [];
    diasDelMesHasta(anio, mes, diaSel).forEach((iso) => {
      const d = diaDeArea(f.clave, iso, cierresMap, corteIdx, trabajadoresCorte);
      if (d.estado === "sin_cierre") return;
      if (!esHabilISO(iso) && !d.valor) return;
      const saldo = d.valor - d.costoContado;
      acum += saldo;
      out.push({ iso, valor: d.valor, costo: d.costoContado, saldo, acum });
    });
    return out;
  }, [f, anio, mes, diaSel, cierresMap, corteIdx, trabajadoresCorte]);

  const alterna = (id) => setDetalle(detalle === id ? null : id);
  const sinCierre = !!f && f.sinCierre && f.clave !== "CORTE";

  function contenidoDetalle(id) {
    if (!f) return null;
    if (id === "meta_hoy" || id === "meta_dia") return f.meta > 0 ? <ChipsMetaDias porDia={f.porDia} meta={f.meta} anio={anio} mes={mes} diaSel={diaSel} /> : <div style={{ margin: "12px 16px 0", fontSize: 13, color: C.slate }}>Tu área todavía no tiene meta diaria (se define en Nómina → Áreas → «Meta diaria de unidades»).</div>;
    if (id === "cubren_salario" || id === "trabajadores") return <TablaTrabajadores fila={f} esHabil={esHabil} titulo="Cada trabajador" />;
    if (id === "saldo_acumulado") {
      if (!filasDias.length) return <div style={{ margin: "12px 16px 0", fontSize: 13, color: C.slate }}>{f.ac.fuente === "mes" ? "Este mes viene de un cierre mensual, sin detalle por día." : "Todavía no hay días con cierre este mes."}</div>;
      return (
        <div style={{ overflow: "auto", margin: "12px 16px 0", border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Fecha</th>
                <th style={th}>Producido</th>
                <th style={th}>Costo del día</th>
                <th style={th}>Saldo del día</th>
                <th style={th}>Saldo acumulado del mes</th>
              </tr>
            </thead>
            <tbody>
              {filasDias.map((r) => (
                <tr key={r.iso}>
                  <td style={{ ...td, textAlign: "left" }}>{etiquetaDia(r.iso)}</td>
                  <td style={td}>{money(r.valor)}</td>
                  <td style={td}>{money(r.costo)}</td>
                  <td style={{ ...td, fontWeight: 700, color: colorSaldo(r.saldo) }}>{signed(r.saldo)}</td>
                  <td style={{ ...td, fontWeight: 800, color: colorSaldo(r.acum) }}>{signed(r.acum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return null;
  }

  const tarjetas = [];
  if (f && tiene("meta_hoy")) {
    const e = f.em;
    const col = e.nivel === "cumple" ? C.green : e.nivel === "cerca" ? C.amber : e.nivel === "bajo" ? C.red : C.slate;
    const bg = e.nivel === "cumple" ? C.greenBg : e.nivel === "cerca" ? C.amberBg : e.nivel === "bajo" ? C.redBg : C.canvas;
    const ln = e.nivel === "cumple" ? C.greenLn : e.nivel === "cerca" ? C.amberLn : e.nivel === "bajo" ? C.redLn : C.border;
    tarjetas.push({ id: "meta_hoy", icono: "🎯", valor: f.meta > 0 && !sinCierre ? `${Math.round(e.pct)} %` : "—", texto: sinCierre ? "Sin cierre de este día todavía" : f.meta > 0 ? `Meta del día (${fmt(f.dia.unidades)} de ${fmt(f.meta)} und)` : "Tu área no tiene meta diaria", color: col, fondo: bg, linea: ln });
  }
  if (f && tiene("saldo_acumulado")) {
    tarjetas.push({ id: "saldo_acumulado", icono: f.saldoAlcance >= 0 ? "📈" : "📉", valor: signed(f.saldoAlcance), texto: `Saldo acumulado ${etiquetaAlcance}`, color: colorSaldo(f.saldoAlcance), fondo: f.saldoAlcance >= 0 ? C.greenBg : C.redBg, linea: f.saldoAlcance >= 0 ? C.greenLn : C.redLn });
  }
  if (f && tiene("cubren_salario")) {
    tarjetas.push({ id: "cubren_salario", icono: "👥", valor: esHabil && f.cubren.total && !sinCierre ? `${f.cubren.si} de ${f.cubren.total}` : "—", texto: !esHabil ? "Día no hábil: el sueldo no se cobra" : sinCierre ? "Sin cierre de este día todavía" : "Cubren su salario del día", color: C.blue, fondo: C.blueBg, linea: C.blueLn });
  }

  if (!areaClave) {
    return (
      <div style={{ marginBottom: 18, background: C.amberBg, border: `1px solid ${C.amberLn}`, borderRadius: 12, padding: "14px 18px", fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
        Tienes marcadas tarjetas del cierre diario, pero tu área ({currentUser?.areaNomina || "sin área asignada"}) todavía no lo tiene. Hoy lo tienen Corte, Zona calor y Control de calidad. Pídele al administrador que revise tu «Área Interna» en Usuarios.
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: C.slate, margin: "2px 0 14px" }}>
          Cómo va {f ? f.nombre : "tu área"} {diaSel === hoyISO ? "hoy" : `el ${etiquetaDia(diaSel)}`}. Haz clic en una tarjeta para ver el detalle.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <button style={BOTON} onClick={() => setDiaSel(sumarDiasISO(diaSel, -1))} title="Día anterior">‹</button>
          <input type="date" value={diaSel} max={hoyISO} onChange={(e) => e.target.value && setDiaSel(e.target.value)} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }} />
          <button style={{ ...BOTON, opacity: diaSel >= hoyISO ? 0.4 : 1 }} disabled={diaSel >= hoyISO} onClick={() => setDiaSel(sumarDiasISO(diaSel, 1))} title="Día siguiente">›</button>
          {diaSel !== hoyISO ? <button style={BOTON} onClick={() => setDiaSel(hoyISO)}>Hoy</button> : null}
          {tiene("saldo_acumulado") ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.slate, marginLeft: 10 }}>Acumulado</span>
              <Chip activo={alcance === "mes"} onClick={() => setAlcance("mes")}>Este mes</Chip>
              <Chip activo={alcance === "anio"} onClick={() => setAlcance("anio")}>Año</Chip>
              <Chip activo={alcance === "total"} onClick={() => setAlcance("total")}>Total</Chip>
            </>
          ) : null}
          {cargando ? <span style={{ fontSize: 12, color: C.slate }}>Cargando…</span> : null}
        </div>
        {!marcadas.some((id) => ["meta_hoy", "saldo_acumulado", "cubren_salario", "meta_dia", "trabajadores"].includes(id)) ? (
          <div style={{ fontSize: 13, color: C.slate }}>No tienes tarjetas marcadas.</div>
        ) : null}
        {tarjetas.length ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            {tarjetas.map((t) => <Tarjeta key={t.id} {...t} activa={detalle === t.id} onClick={() => alterna(t.id)} />)}
          </div>
        ) : null}
        {detalle && f ? (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "0 0 14px", marginBottom: 18 }}>
            {contenidoDetalle(detalle)}
          </div>
        ) : null}
        {f && tiene("meta_dia") && f.meta > 0 ? <Seccion titulo="Meta día a día"><ChipsMetaDias porDia={f.porDia} meta={f.meta} anio={anio} mes={mes} diaSel={diaSel} /></Seccion> : null}
        {f && tiene("trabajadores") ? <Seccion titulo="Cada trabajador"><TablaTrabajadores fila={f} esHabil={esHabil} /></Seccion> : null}
        <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6, marginTop: 6 }}>
          Costo del día = sueldo del mes ÷ días hábiles; los fines de semana cuentan lo producido pero no cobran costo. Un trabajador «cubre» cuando lo que produjo en el día alcanza su sueldo del día. El acumulado del mes vuelve a cero el día 1.
        </div>
    </div>
  );
}

// Pantalla «☀️ Mi Día» por tarjetas: una barra de pestañas con UNA sección a la vez (en vez de apilar todo y obligar a bajar),
// solo con las piezas que el administrador marcó para este usuario.
export default function MiDiaTarjetasStandalone({ db, currentUser, onVolver, onLogout }) {
  const marcadas = currentUser?.tarjetasMiDia || [];
  const hayCierre = marcadas.some((id) => IDS_CIERRE.includes(id));
  const idsPlaneacion = marcadas.filter((id) => IDS_PLANEACION.includes(id));
  const secciones = [];
  if (marcadas.includes("programador")) {
    secciones.push({ id: "programador", icon: "📋", label: "Programación", render: () => <ProgramadorProcesosStandalone currentUser={currentUser} incrustado /> });
  }
  if (marcadas.includes("lista_programar")) {
    secciones.push({ id: "lista", icon: "📝", label: "Mi lista por programar", render: () => <ListaPorProgramarBloque currentUser={currentUser} /> });
  }
  if (hayCierre) {
    secciones.push({ id: "cierre", icon: "💰", label: "Cierre diario", render: () => <BloqueCierre db={db} currentUser={currentUser} /> });
  }
  if (idsPlaneacion.length) {
    secciones.push({ id: "planeacion", icon: "📊", label: "Planeación", render: () => <MiDiaPlaneacionBloque visibles={idsPlaneacion} /> });
  }
  if (marcadas.includes("auditoria_nomina")) {
    secciones.push({ id: "auditoria", icon: "🔍", label: "Auditoría Nómina", render: () => <MiDiaNominaStandalone currentUser={currentUser} incrustado /> });
  }
  const [elegida, setElegida] = useState(null);
  const actual = secciones.find((x) => x.id === elegida) || secciones[0];
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 32px", background: C.ink }}>
        {onVolver && <button onClick={onVolver} style={{ background: "transparent", border: "1px solid rgba(200,184,162,0.3)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13, color: C.seam }}>← Volver</button>}
        <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: C.white }}>☀️ Mi Día — {currentUser?.name}</div>
        {onLogout && <button onClick={onLogout} style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(232,93,74,0.85)", fontWeight: 700, fontSize: 12 }}>⏏ Cerrar sesión</button>}
      </div>
      <div style={{ padding: "22px 32px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 900, color: C.ink }}>☀️ Mi Día</h1>
          {secciones.length > 1 && (
            <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, padding: 5, background: "#EFE9E1", borderRadius: 14, marginBottom: 18 }}>
              {secciones.map((x) => {
                const act = actual && actual.id === x.id;
                return (
                  <button
                    key={x.id}
                    onClick={() => setElegida(x.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 10, border: "none", background: act ? C.white : "transparent", color: act ? C.ink : "#5A5A7A", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: act ? "0 1px 4px rgba(15,15,25,0.10)" : "none", fontFamily: "inherit" }}
                  >
                    <span style={{ fontSize: 15 }}>{x.icon}</span> {x.label}
                  </button>
                );
              })}
            </div>
          )}
          {actual ? <div key={actual.id}>{actual.render()}</div> : null}
        </div>
      </div>
    </div>
  );
}
