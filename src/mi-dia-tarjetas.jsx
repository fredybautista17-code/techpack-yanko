// ─── MI DÍA POR LÍDER (tarjetas elegidas en Usuarios) ────────────────────────
// (2026-10-26, a pedido de Fredy) Pantalla «☀️ Mi Día» para quien tiene marcadas tarjetas en Administrador general →
// Usuarios. Junta las piezas marcadas: cierre diario de SU área (la de «Área Interna»): meta de hoy, saldo acumulado,
// cubren su salario, meta día a día y cada trabajador. Usa los mismos cálculos del Tablero de costos
// (cierre-diario.jsx). Sin gráficas: tarjetas y tablas, en el estilo del Mi Día de Planeación. Solo lectura.
import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import ConsumoTelaCortePanel from "./consumo-tela-corte";
import { useCierreDiario, TablaTrabajadores } from "./cierre-diario";
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
// (2026-10-31, a pedido de Fredy) Consumo de tela de Corte: teórico contra real, con los trazos de ATLAS y el
// rendimiento de Busint (mismo panel del Centro de Costo de CORTE en Áreas).
function BloqueConsumoTela({ db }) {
  const hoyISO = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10), []);
  const [alcance, setAlcance] = useState("mes");
  const [pedidos, setPedidos] = useState([]);
  const functionsClient = useMemo(() => getFunctions(db.app), [db]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "pedidos_activos"), (snap) => setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    return () => unsub();
  }, [db]);
  const mesKey = hoyISO.slice(0, 7);
  const desde = alcance === "dia" ? hoyISO : alcance === "mes" ? `${mesKey}-01` : `${hoyISO.slice(0, 4)}-01-01`;
  const hasta = alcance === "dia" ? hoyISO : alcance === "mes" ? `${mesKey}-31` : `${hoyISO.slice(0, 4)}-12-31`;
  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Chip activo={alcance === "dia"} onClick={() => setAlcance("dia")}>Hoy</Chip>
        <Chip activo={alcance === "mes"} onClick={() => setAlcance("mes")}>Este mes</Chip>
        <Chip activo={alcance === "anio"} onClick={() => setAlcance("anio")}>Este año</Chip>
      </div>
      <div style={{ marginTop: -22 }}>
        <ConsumoTelaCortePanel pedidos={pedidos} desde={desde} hasta={hasta} functionsClient={functionsClient} />
      </div>
    </div>
  );
}

// (2026-10-31, a pedido de Fredy) Cierre diario moderno: dos preguntas, respuesta de un vistazo.
//   1) «Cómo terminó el día»: cumplió o no la meta (número grande) y si lo producido alcanzó para el salario.
//   2) «Cómo va el mes»: días que cumplieron, promedio por día, saldo y un calendario de colores.
// El detalle (cada trabajador, saldo día a día) queda cerrado hasta que se pida.
const corto = (n) => {
  const v = Math.round(Number(n) || 0);
  const a = Math.abs(v);
  const s = v >= 0 ? "+" : "−";
  if (a >= 1000000) return `${s}$ ${(a / 1000000).toFixed(1).replace(".", ",")} M`;
  if (a >= 1000) return `${s}$ ${fmt(a / 1000)} mil`;
  return `${s}$ ${a}`;
};
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie"];

function Colapsable({ titulo, children }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <div onClick={() => setAbierta(!abierta)} style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, color: C.blue, padding: "6px 2px" }}>
        {abierta ? "▼" : "▶"} {titulo}
      </div>
      {abierta ? <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "0 0 12px", marginTop: 4 }}>{children}</div> : null}
    </div>
  );
}
function Pastilla({ color, fondo, linea, children }) {
  return <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 800, color, background: fondo, border: `1px solid ${linea}` }}>{children}</span>;
}
function Loseta({ titulo, valor, sub, color, fondo, linea, extra }) {
  return (
    <div style={{ flex: "1 1 190px", minWidth: 170, background: fondo, border: `1px solid ${linea}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3 }}>{titulo}</div>
      <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1.1, marginTop: 4 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, lineHeight: 1.35 }}>{sub}</div> : null}
      {extra || null}
    </div>
  );
}

function BloqueCierre({ db, currentUser }) {
  const hoyISO = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10), []);
  const [diaSel, setDiaSel] = useState(hoyISO);
  const [alcance, setAlcance] = useState("mes");
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
  const etiquetaAlcance = alcance === "mes" ? MESES[mes - 1].toLowerCase() : alcance === "anio" ? `año ${anio}` : "total";

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

  // Promedio de unidades por día hábil del mes (hasta el día elegido)
  const resumenMes = useMemo(() => {
    if (!f || !f.porDia) return null;
    const dias = diasDelMesHasta(anio, mes, diaSel).filter(esHabilISO);
    const suma = dias.reduce((s, iso) => s + (f.porDia.get(iso) || 0), 0);
    return { n: dias.length, suma, prom: dias.length ? suma / dias.length : 0 };
  }, [f, anio, mes, diaSel]);

  // Calendario lunes a viernes del mes
  const semanas = useMemo(() => {
    const ult = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const out = [];
    for (let d = 1; d <= ult; d++) {
      const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (!out.length || dow === 1) out.push([null, null, null, null, null]);
      out[out.length - 1][dow - 1] = iso;
    }
    return out;
  }, [anio, mes]);

  const sinCierre = !!f && f.sinCierre && f.clave !== "CORTE";

  if (!areaClave) {
    return (
      <div style={{ marginBottom: 18, background: C.amberBg, border: `1px solid ${C.amberLn}`, borderRadius: 12, padding: "14px 18px", fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
        Tienes marcadas tarjetas del cierre diario, pero tu área ({currentUser?.areaNomina || "sin área asignada"}) todavía no lo tiene. Hoy lo tienen Corte, Zona calor y Control de calidad. Pídele al administrador que revise tu «Área Interna» en Usuarios.
      </div>
    );
  }

  const verMeta = !!f && f.meta > 0;
  const mostrarDia = !!f && (tiene("meta_hoy") || tiene("saldo_acumulado") || tiene("cubren_salario"));
  const mostrarMes = !!f && (tiene("meta_dia") || tiene("saldo_acumulado"));
  const verTrabajadores = !!f && (tiene("trabajadores") || tiene("cubren_salario"));
  const esHoy = diaSel === hoyISO;

  // ── Hero: cumplió o no la meta ──
  let hero = null;
  if (f && tiene("meta_hoy")) {
    const e = f.em;
    const u = Math.round(f.dia.unidades || 0);
    const conNivel = verMeta && !sinCierre && esHabil;
    const col = !conNivel ? C.slate : e.nivel === "cumple" ? C.green : e.nivel === "cerca" ? C.amber : C.red;
    const bg = !conNivel ? C.canvas : e.nivel === "cumple" ? C.greenBg : e.nivel === "cerca" ? C.amberBg : C.redBg;
    const ln = !conNivel ? C.border : e.nivel === "cumple" ? C.greenLn : e.nivel === "cerca" ? C.amberLn : C.redLn;
    let pill = "Sin meta diaria";
    let sub = "Tu área todavía no tiene meta diaria (se define en Nómina → Áreas → «Meta diaria de unidades»).";
    if (sinCierre) { pill = "Sin cierre"; sub = "Este día todavía no tiene cierre guardado."; }
    else if (!esHabil) { pill = "Día no hábil"; sub = "Fin de semana o festivo: cuenta lo producido, no se cobra sueldo."; }
    else if (verMeta) {
      pill = e.nivel === "cumple" ? "✓ Cumplió la meta" : e.nivel === "cerca" ? "Casi llega a la meta" : "✗ No cumplió la meta";
      const dif = Math.round(f.meta - f.dia.unidades);
      sub = dif > 0
        ? `${esHoy ? "Faltan" : "Faltaron"} ${fmt(dif)} und · ${esHoy ? "lleva" : "llegó a"} el ${Math.round(e.pct)} %`
        : `Pasó la meta por ${fmt(-dif)} und · ${Math.round(e.pct)} %`;
    }
    hero = (
      <div style={{ flex: "1.3 1 300px", background: bg, border: `1px solid ${ln}`, borderRadius: 16, padding: "18px 20px" }}>
        <Pastilla color={col} fondo={C.white} linea={ln}>{pill}</Pastilla>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ fontSize: 56, fontWeight: 900, color: col, lineHeight: 1 }}>{sinCierre ? "—" : fmt(u)}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.slate }}>{verMeta ? `de ${fmt(f.meta)} und` : "und"}</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.slate, marginTop: 8, lineHeight: 1.4 }}>{sub}</div>
      </div>
    );
  }

  // ── Salario del día ──
  let salario = null;
  if (f && (tiene("saldo_acumulado") || tiene("cubren_salario"))) {
    const ok = f.saldoDia >= 0;
    const verde = esHabil && !sinCierre && ok;
    const rojo = esHabil && !sinCierre && !ok;
    const col = verde ? C.green : rojo ? C.red : C.slate;
    const ln = verde ? C.greenLn : rojo ? C.redLn : C.border;
    const bg = verde ? C.greenBg : rojo ? C.redBg : C.canvas;
    salario = (
      <div style={{ flex: "1 1 260px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3 }}>¿Alcanzó para el salario?</div>
        {sinCierre ? (
          <div style={{ fontSize: 14, color: C.slate, marginTop: 10 }}>Sin cierre de este día todavía.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.ink }}>{money(f.dia.valor)}</div>
                <div style={{ fontSize: 12, color: C.slate }}>Produjo</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.ink }}>{esHabil ? money(f.dia.costoContado) : "—"}</div>
                <div style={{ fontSize: 12, color: C.slate }}>Salario del día</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ padding: "6px 14px", borderRadius: 10, background: bg, border: `1px solid ${ln}`, color: col, fontWeight: 900, fontSize: 15 }}>
                {!esHabil ? "Día no hábil" : ok ? `✓ Sí cubrió · ${signed(f.saldoDia)}` : `✗ No cubrió · ${signed(f.saldoDia)}`}
              </span>
              {tiene("cubren_salario") && esHabil && f.cubren.total ? <span style={{ fontSize: 12.5, color: C.slate }}>{f.cubren.si} de {f.cubren.total} cubren su salario</span> : null}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Calendario del mes ──
  const calendario = f && tiene("meta_dia") ? (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, maxWidth: 520 }}>
        {DIAS_CORTOS.map((d) => <div key={d} style={{ fontSize: 11, fontWeight: 800, color: C.slate, textAlign: "center" }}>{d}</div>)}
        {semanas.map((sem, i) => sem.map((iso, j) => {
          if (!iso) return <div key={`${i}-${j}`} />;
          const futuro = iso > hoyISO;
          const u = f.porDia ? f.porDia.get(iso) || 0 : 0;
          const ok = verMeta && u >= f.meta;
          const sel = iso === diaSel;
          const bg = futuro ? "transparent" : u === 0 ? C.canvas : !verMeta ? C.blueBg : ok ? C.greenBg : C.redBg;
          const col = futuro ? C.seam : u === 0 ? C.slate : !verMeta ? C.blue : ok ? C.green : C.red;
          return (
            <div
              key={iso}
              onClick={futuro ? undefined : () => setDiaSel(iso)}
              title={futuro ? "" : `${etiquetaDia(iso)}: ${fmt(u)}${verMeta ? ` de ${fmt(f.meta)}` : ""} und`}
              style={{ background: bg, border: `${sel ? 2 : 1}px solid ${sel ? C.ink : futuro ? C.border : "transparent"}`, borderRadius: 10, padding: "5px 6px 6px", cursor: futuro ? "default" : "pointer", minHeight: 46 }}
            >
              <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700 }}>{Number(iso.slice(8))}</div>
              <div style={{ fontSize: 13.5, fontWeight: 900, color: col, textAlign: "center", marginTop: 2 }}>{futuro ? "" : u === 0 ? "–" : fmt(u)}</div>
            </div>
          );
        }))}
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8 }}>
        <span style={{ color: C.green, fontWeight: 800 }}>Verde</span> cumplió la meta · <span style={{ color: C.red, fontWeight: 800 }}>rojo</span> no la alcanzó · gris sin producción. Toca un día para verlo arriba.
      </div>
    </div>
  ) : null;

  const pctProm = verMeta && resumenMes ? (resumenMes.prom / f.meta) * 100 : null;
  const colProm = pctProm === null ? C.blue : pctProm >= 100 ? C.green : pctProm >= 80 ? C.amber : C.red;
  const bgProm = pctProm === null ? C.blueBg : pctProm >= 100 ? C.greenBg : pctProm >= 80 ? C.amberBg : C.redBg;
  const lnProm = pctProm === null ? C.blueLn : pctProm >= 100 ? C.greenLn : pctProm >= 80 ? C.amberLn : C.redLn;

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Barra de día */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.ink, marginRight: 6 }}>
          {f ? f.nombre : "Tu área"} <span style={{ fontWeight: 700, color: C.slate }}>· {esHoy ? "hoy" : etiquetaDia(diaSel)}</span>
        </div>
        <button style={BOTON} onClick={() => setDiaSel(sumarDiasISO(diaSel, -1))} title="Día anterior">‹</button>
        <input type="date" value={diaSel} max={hoyISO} onChange={(e) => e.target.value && setDiaSel(e.target.value)} style={{ padding: "7px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", color: C.ink, background: C.white }} />
        <button style={{ ...BOTON, opacity: diaSel >= hoyISO ? 0.4 : 1 }} disabled={diaSel >= hoyISO} onClick={() => setDiaSel(sumarDiasISO(diaSel, 1))} title="Día siguiente">›</button>
        {!esHoy ? <button style={BOTON} onClick={() => setDiaSel(hoyISO)}>Hoy</button> : null}
        {cargando ? <span style={{ fontSize: 12, color: C.slate }}>Cargando…</span> : null}
      </div>

      {!marcadas.some((id) => ["meta_hoy", "saldo_acumulado", "cubren_salario", "meta_dia", "trabajadores"].includes(id)) ? (
        <div style={{ fontSize: 13, color: C.slate }}>No tienes tarjetas marcadas.</div>
      ) : null}

      {/* 1) Cómo terminó el día */}
      {mostrarDia ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.ink, margin: "2px 0 8px" }}>{esHoy ? "Cómo va el día" : "Cómo terminó el día"}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>{hero}{salario}</div>
        </>
      ) : null}

      {/* 2) Cómo va el mes */}
      {mostrarMes ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.ink, margin: "2px 0 8px" }}>Cómo va {MESES[mes - 1].toLowerCase()}</div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {tiene("meta_dia") && verMeta ? (
                <>
                  <Loseta
                    titulo="Días que cumplieron"
                    valor={<>{f.cumpl.cumplidos} <span style={{ fontSize: 16, fontWeight: 700, color: C.slate }}>de {f.cumpl.diasHabiles}</span></>}
                    sub="días hábiles con la meta lograda"
                    color={f.cumpl.cumplidos >= f.cumpl.diasHabiles * 0.8 ? C.green : f.cumpl.cumplidos >= f.cumpl.diasHabiles * 0.5 ? C.amber : C.red}
                    fondo={C.canvas} linea={C.border}
                  />
                  <Loseta
                    titulo="Promedio por día"
                    valor={resumenMes ? fmt(resumenMes.prom) : "—"}
                    sub={`und · meta ${fmt(f.meta)}${pctProm !== null ? ` · ${Math.round(pctProm)} %` : ""}`}
                    color={colProm} fondo={bgProm} linea={lnProm}
                  />
                </>
              ) : null}
              {tiene("saldo_acumulado") ? (
                <Loseta
                  titulo={`Saldo ${etiquetaAlcance}`}
                  valor={corto(f.saldoAlcance)}
                  sub={`${signed(f.saldoAlcance)} · ${f.saldoAlcance >= 0 ? "producido por encima del sueldo" : "falta para cubrir el sueldo"}`}
                  color={colorSaldo(f.saldoAlcance)} fondo={f.saldoAlcance >= 0 ? C.greenBg : C.redBg} linea={f.saldoAlcance >= 0 ? C.greenLn : C.redLn}
                  extra={(
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <Chip activo={alcance === "mes"} onClick={() => setAlcance("mes")}>Mes</Chip>
                      <Chip activo={alcance === "anio"} onClick={() => setAlcance("anio")}>Año</Chip>
                      <Chip activo={alcance === "total"} onClick={() => setAlcance("total")}>Total</Chip>
                    </div>
                  )}
                />
              ) : null}
            </div>
            {calendario}
          </div>
        </>
      ) : null}

      {/* Detalle, cerrado hasta que se pida */}
      {verTrabajadores ? (
        <Colapsable titulo={`Ver cada trabajador${f.dia && f.dia.trabajadores ? ` (${f.dia.trabajadores.length})` : ""}`}>
          <TablaTrabajadores fila={f} esHabil={esHabil} titulo="Cada trabajador" />
        </Colapsable>
      ) : null}
      {f && tiene("saldo_acumulado") ? (
        <Colapsable titulo="Ver el saldo día a día">
          {!filasDias.length ? (
            <div style={{ margin: "12px 16px 0", fontSize: 13, color: C.slate }}>{f.ac.fuente === "mes" ? "Este mes viene de un cierre mensual, sin detalle por día." : "Todavía no hay días con cierre este mes."}</div>
          ) : (
            <div style={{ overflow: "auto", margin: "12px 16px 0", border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Fecha</th>
                    <th style={th}>Producido</th>
                    <th style={th}>Costo del día</th>
                    <th style={th}>Saldo del día</th>
                    <th style={th}>Acumulado del mes</th>
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
          )}
        </Colapsable>
      ) : null}
      <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6, marginTop: 12 }}>
        Costo del día = sueldo del mes ÷ días hábiles; los fines de semana cuentan lo producido pero no cobran costo. Los días hábiles sin producción cuentan como no cumplidos. El acumulado del mes vuelve a cero el día 1.
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
  if (marcadas.includes("consumo_tela")) {
    secciones.push({ id: "consumo", icon: "🧵", label: "Consumo de tela", render: () => <BloqueConsumoTela db={db} /> });
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
