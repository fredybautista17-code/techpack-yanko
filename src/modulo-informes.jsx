import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBDNvCaem-IbP0Z87eBt1pBtDy8sZdkEqc",
  authDomain: "techpack-yanko-f37b8.firebaseapp.com",
  projectId: "techpack-yanko-f37b8",
  storageBucket: "techpack-yanko-f37b8.firebasestorage.app",
  messagingSenderId: "700796768091",
  appId: "1:700796768091:web:5ab0db90c17390e6e7547e",
};
const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

// ─── TOKENS (mismos de los demás módulos) ──────────────────────────────────
const C = {
  ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2",
  green: "#2D9E6B", greenBg: "#EBF7F2", red: "#E85D4A", redBg: "#FDF0EE", blue: "#3D6B9E", blueBg: "#EBF1F7",
  amber: "#C47C1A", amberBg: "#FDF5E6", violet: "#7B5EA7", violetBg: "#F3EEF9",
};
function fmtNum(n) { return Number(n || 0).toLocaleString("es-CO"); }
function Tabla({ columnas, filas, vacio, onRowClick }) {
  if (!filas || !filas.length) {
    return <div style={{ padding: 30, textAlign: "center", color: C.slate, fontSize: 13 }}>{vacio || "Sin datos."}</div>;
  }
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.canvas }}>
            {columnas.map((c) => (
              <th key={c.key} style={{ padding: "10px 14px", fontSize: 10, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: c.align || "left" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} onClick={() => onRowClick && onRowClick(f)} style={{ borderTop: `1px solid ${C.border}`, cursor: onRowClick ? "pointer" : "default" }}>
              {columnas.map((c) => (
                <td key={c.key} style={{ padding: "10px 14px", fontSize: 13, color: C.ink, textAlign: c.align || "left" }}>{c.render ? c.render(f) : f[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function KPI({ icon, label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "16px 18px", border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}

// ─── Cálculo de vencidos — MISMA regla que usa Diseño en pantalla y que usa
// la Cloud Function que manda los avisos por correo (isOverdue en App.js /
// estaVencido en functions/index.js): un ítem que ya salió del pipeline
// interno de producción no cuenta, y el resto está vencido cuando lleva más
// días en su etapa actual (stageStartedAt) de los que esa etapa tiene
// configurados en config/main.stages. ────────────────────────────────────
const STAGES_TERMINALES = new Set(["enviado_cotizacion", "enviar_cliente", "enviado", "recibido_cliente", "aprobado", "declinado"]);
function diasDesde(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function estaVencido(item, stagesMap) {
  if (!item.currentStage || STAGES_TERMINALES.has(item.status)) return false;
  const limite = stagesMap.get(item.currentStage);
  if (limite == null || !item.stageStartedAt) return false;
  return diasDesde(item.stageStartedAt) > limite;
}

function VencidosView({ protos, capsulas, stages }) {
  const stagesMap = new Map(stages.map((s) => [s.id, s.days]));
  const stageLabel = (id) => stages.find((s) => s.id === id)?.label || id;

  const protosVencidos = protos
    .filter((p) => estaVencido(p, stagesMap))
    .map((p) => ({
      tipo: "Prototipo", nombre: p.name || "—", referencia: p.reference || "—", diseñador: p.assignedTo || "—",
      etapa: stageLabel(p.currentStage), dias: diasDesde(p.stageStartedAt), limite: stagesMap.get(p.currentStage),
    }));

  const capsulasVencidas = [];
  capsulas.forEach((cap) => {
    (cap.referencias || []).forEach((r) => {
      if (!estaVencido(r, stagesMap)) return;
      capsulasVencidas.push({
        tipo: "Cápsula", nombre: `${r.name || "—"} (${cap.name || "—"})`, referencia: r.reference || "—",
        diseñador: r.assignedTo || cap.assignedTo || "—", etapa: stageLabel(r.currentStage),
        dias: diasDesde(r.stageStartedAt), limite: stagesMap.get(r.currentStage),
      });
    });
  });

  const todos = [...protosVencidos, ...capsulasVencidas].sort((a, b) => b.dias - a.dias);
  const porDisenador = {};
  todos.forEach((x) => { porDisenador[x.diseñador] = (porDisenador[x.diseñador] || 0) + 1; });
  const disenadorTop = Object.entries(porDisenador).sort((a, b) => b[1] - a[1])[0];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
        <KPI icon="🚩" label="Total vencidos" value={fmtNum(todos.length)} color={C.red} bg={C.redBg} />
        <KPI icon="⬡" label="Prototipos vencidos" value={fmtNum(protosVencidos.length)} color={C.blue} bg={C.blueBg} />
        <KPI icon="⬢" label="Referencias de cápsula vencidas" value={fmtNum(capsulasVencidas.length)} color={C.violet} bg={C.violetBg} />
      </div>
      {disenadorTop && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: C.amberBg, borderRadius: 8, fontSize: 13, color: C.amber, fontWeight: 600 }}>
          ⚑ {disenadorTop[0]} tiene la mayor cantidad de vencidos ahora mismo ({disenadorTop[1]}).
        </div>
      )}
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 12 }}>
        Esta es la misma lista que ya manda el aviso automático por correo — acá la puedes ver en cualquier momento, sin esperar el correo.
      </div>
      <Tabla
        vacio="No hay prototipos ni referencias vencidas ahora mismo. 🎉"
        columnas={[
          { key: "tipo", label: "Tipo" },
          { key: "nombre", label: "Nombre" },
          { key: "referencia", label: "Ref" },
          { key: "diseñador", label: "Diseñador/a" },
          { key: "etapa", label: "Etapa" },
          { key: "dias", label: "Días", align: "right", render: (f) => <span style={{ fontWeight: 800, color: C.red }}>{f.dias}d / {f.limite}d</span> },
        ]}
        filas={todos}
      />
    </div>
  );
}

// ─── CIERRE MENSUAL DE DISEÑO ───────────────────────────────────────────────
// Reporte automático — no requiere que nadie "cierre" nada a mano. Se arma
// directo de `historial_diseno` (la misma colección que ya alimenta la
// pestaña Historial en Diseño: un prototipo se registra ahí al Aprobarse,
// una referencia de cápsula al Aprobarse o Declinarse, con el mes en que
// ocurrió). Elegir un mes muestra exactamente lo que se cerró ese mes —
// cualquier mes pasado se puede volver a consultar igual.
const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function labelMes(m) {
  if (!m) return "—";
  const [y, mm] = m.split("-");
  return `${MESES_ES[Number(mm) - 1] || mm} ${y}`;
}
function diasEntreFechas(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO) return null;
  const a = new Date(desdeISO), b = new Date(hastaISO);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}
function CierreDisenoView({ historial, protos, capsulas }) {
  const mesesDisponibles = useMemo(
    () => [...new Set(historial.map((h) => h.mes).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [historial]
  );
  const mesActual = new Date().toISOString().slice(0, 7);
  const [mesSel, setMesSel] = useState(null);
  const mes = mesSel || mesesDisponibles[0] || mesActual;

  function liveItem(h) {
    if (h.tipo === "proto") return protos.find((p) => p.id === h.itemId);
    const cap = capsulas.find((c) => c.id === h.capsulaId);
    return cap?.referencias?.find((r) => r.id === h.itemId);
  }

  const filasMes = useMemo(() => {
    return historial
      .filter((h) => h.mes === mes)
      .map((h) => {
        const item = liveItem(h);
        return {
          tipo: h.tipo === "proto" ? "Prototipo" : "Cápsula",
          nombre: h.nombre || "—",
          referencia: h.referencia || "—",
          cliente: h.cliente || "(Sin cliente)",
          diseñador: item?.assignedTo || "—",
          resultado: h.resultado,
          fecha: h.fecha,
          dias: diasEntreFechas(item?.createdAt, h.fecha),
        };
      })
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  }, [historial, mes, protos, capsulas]);

  const totalCerrados = filasMes.length;
  const aprobados = filasMes.filter((f) => f.resultado === "aprobado").length;
  const declinados = filasMes.filter((f) => f.resultado === "declinado").length;
  const pctAprobacion = totalCerrados ? Math.round((aprobados / totalCerrados) * 100) : 0;
  const diasValidos = filasMes.map((f) => f.dias).filter((d) => d != null && d >= 0);
  const diasPromedio = diasValidos.length ? Math.round(diasValidos.reduce((s, d) => s + d, 0) / diasValidos.length) : null;

  function agruparPor(campo) {
    const m = new Map();
    filasMes.forEach((f) => {
      const key = f[campo] || "—";
      if (!m.has(key)) m.set(key, { nombre: key, total: 0, aprobados: 0, declinados: 0 });
      const g = m.get(key);
      g.total += 1;
      if (f.resultado === "aprobado") g.aprobados += 1; else g.declinados += 1;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }
  const porDisenador = agruparPor("diseñador");
  const porCliente = agruparPor("cliente");

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [`CIERRE DE DISEÑO — ${labelMes(mes).toUpperCase()}`],
        [],
        ["Total Cerrados", "Aprobados", "Declinados", "% Aprobación", "Días Promedio"],
        [totalCerrados, aprobados, declinados, `${pctAprobacion}%`, diasPromedio ?? "—"],
        [],
        ["Tipo", "Nombre", "Referencia", "Cliente", "Diseñador/a", "Resultado", "Fecha", "Días"],
        ...filasMes.map((f) => [f.tipo, f.nombre, f.referencia, f.cliente, f.diseñador, f.resultado, (f.fecha || "").slice(0, 10), f.dias ?? ""]),
      ]),
      "Cierre Diseño"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["POR DISEÑADOR/A"], ["Diseñador/a", "Total", "Aprobados", "Declinados"], ...porDisenador.map((g) => [g.nombre, g.total, g.aprobados, g.declinados])]),
      "Por Diseñador"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["POR CLIENTE"], ["Cliente", "Total", "Aprobados", "Declinados"], ...porCliente.map((g) => [g.nombre, g.total, g.aprobados, g.declinados])]),
      "Por Cliente"
    );
    XLSX.writeFile(wb, `Cierre_Diseno_${mes}.xlsx`);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select
            value={mes}
            onChange={(e) => setMesSel(e.target.value)}
            style={{ padding: "9px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
          >
            {!mesesDisponibles.includes(mesActual) && <option value={mesActual}>{labelMes(mesActual)}</option>}
            {mesesDisponibles.map((m) => (
              <option key={m} value={m}>{labelMes(m)}</option>
            ))}
          </select>
        </div>
        {totalCerrados > 0 && (
          <button
            onClick={exportarExcel}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: C.ink, color: C.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            📤 Exportar Excel
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 16 }}>
        Este cierre se arma solo con lo que se aprobó o declinó ese mes (misma fuente que la pestaña Historial de Diseño) — no hay que hacer nada para "cerrarlo", simplemente elige el mes.
      </div>
      {!totalCerrados ? (
        <div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14, background: C.canvas, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          No hubo prototipos ni referencias aprobadas o declinadas en {labelMes(mes)}.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
            <KPI icon="📦" label="Total cerrados" value={fmtNum(totalCerrados)} color={C.ink} bg={C.canvas} />
            <KPI icon="✅" label="Aprobados" value={fmtNum(aprobados)} color={C.green} bg={C.greenBg} />
            <KPI icon="❌" label="Declinados" value={fmtNum(declinados)} color={C.red} bg={C.redBg} />
            <KPI icon="📈" label="% Aprobación" value={`${pctAprobacion}%`} color={C.blue} bg={C.blueBg} />
            <KPI icon="⏱" label="Días promedio" value={diasPromedio != null ? fmtNum(diasPromedio) : "—"} color={C.amber} bg={C.amberBg} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: C.ink, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Por Diseñador/a</div>
              <Tabla
                vacio="Sin datos."
                columnas={[
                  { key: "nombre", label: "Diseñador/a" },
                  { key: "total", label: "Total", align: "right" },
                  { key: "aprobados", label: "Aprob.", align: "right", render: (f) => <span style={{ color: C.green, fontWeight: 700 }}>{f.aprobados}</span> },
                  { key: "declinados", label: "Decl.", align: "right", render: (f) => <span style={{ color: C.red, fontWeight: 700 }}>{f.declinados}</span> },
                ]}
                filas={porDisenador}
              />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: C.ink, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Por Cliente</div>
              <Tabla
                vacio="Sin datos."
                columnas={[
                  { key: "nombre", label: "Cliente" },
                  { key: "total", label: "Total", align: "right" },
                  { key: "aprobados", label: "Aprob.", align: "right", render: (f) => <span style={{ color: C.green, fontWeight: 700 }}>{f.aprobados}</span> },
                  { key: "declinados", label: "Decl.", align: "right", render: (f) => <span style={{ color: C.red, fontWeight: 700 }}>{f.declinados}</span> },
                ]}
                filas={porCliente}
              />
            </div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 12, color: C.ink, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Detalle</div>
          <Tabla
            vacio="Sin datos."
            columnas={[
              { key: "tipo", label: "Tipo" },
              { key: "nombre", label: "Nombre" },
              { key: "referencia", label: "Ref" },
              { key: "cliente", label: "Cliente" },
              { key: "diseñador", label: "Diseñador/a" },
              { key: "resultado", label: "Resultado", render: (f) => (
                  <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: f.resultado === "aprobado" ? C.greenBg : C.redBg, color: f.resultado === "aprobado" ? C.green : C.red }}>
                    {f.resultado === "aprobado" ? "Aprobado" : "Declinado"}
                  </span>
                ) },
              { key: "fecha", label: "Fecha", render: (f) => (f.fecha ? new Date(f.fecha).toLocaleDateString("es-CO") : "—") },
              { key: "dias", label: "Días", align: "right", render: (f) => (f.dias ?? "—") },
            ]}
            filas={filasMes}
          />
        </>
      )}
    </div>
  );
}
function ProximamenteView({ titulo, desc }) {
  return (
    <div style={{ padding: 40, textAlign: "center", background: C.canvas, borderRadius: 12, border: `1px dashed ${C.border}` }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>🛠️</div>
      <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 13, color: C.slate, maxWidth: 420, margin: "0 auto" }}>{desc}</div>
    </div>
  );
}

// ─── RAÍZ DEL MÓDULO ────────────────────────────────────────────────────────
// Por ahora solo trae el informe de "Vencidos" (Diseño: prototipos +
// referencias de cápsula), que es lo que ya está construido y probado (es
// la misma data que usa el aviso automático por correo). Las demás pestañas
// quedan como espacio reservado para ir sumando informes de otras áreas
// (Bodega, Corte, Contabilidad...) sin tener que rehacer la estructura.
export default function ModuloInformes({ currentUser, onVolver, onLogout }) {
  const [subView, setSubView] = useState("vencidos");
  const [protos, setProtos] = useState([]);
  const [capsulas, setCapsulas] = useState([]);
  const [stages, setStages] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubProtos = onSnapshot(collection(db, "prototipos"), (snap) => setProtos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const unsubCapsulas = onSnapshot(collection(db, "capsulas"), (snap) => setCapsulas(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const unsubHistorial = onSnapshot(collection(db, "historial_diseno"), (snap) => setHistorial(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const unsubConfig = onSnapshot(doc(db, "config", "main"), (snap) => {
      setStages(snap.exists() ? snap.data().stages || [] : []);
      setLoading(false);
    });
    return () => { unsubProtos(); unsubCapsulas(); unsubHistorial(); unsubConfig(); };
  }, []);

  const NAV = [
    { id: "vencidos", icon: "🚩", label: "Vencidos (Diseño)" },
    { id: "cierre_diseno", icon: "🗓", label: "Cierre Mensual (Diseño)" },
    { id: "bodega", icon: "📦", label: "Bodega" },
    { id: "corte", icon: "✂", label: "Corte" },
    { id: "contabilidad", icon: "💰", label: "Contabilidad" },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ color: C.slate }}>Cargando Informes...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ width: 220, background: C.ink, padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>📋 Informes</div>
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>Toda la compañía</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#2A2A45", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${C.seam},#9E8870)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.ink, flexShrink: 0 }}>
            {(currentUser?.name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name}</div>
            <div style={{ fontSize: 10, color: C.seam }}>{currentUser?.role}</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((item) => {
            const active = subView === item.id;
            return (
              <button key={item.id} onClick={() => setSubView(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: active ? "#C8B8A2" : "transparent", color: active ? C.ink : "#8888AA", fontWeight: active ? 800 : 500, fontSize: 13, textAlign: "left" }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
              </button>
            );
          })}
          {onVolver && (
            <button onClick={onVolver} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "rgba(200,184,162,0.5)", fontWeight: 500, fontSize: 12, textAlign: "left", marginTop: 8 }}>
              ← Volver al Inicio
            </button>
          )}
          {onLogout && (
            <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "rgba(232,93,74,0.85)", fontWeight: 700, fontSize: 12, textAlign: "left", marginTop: onVolver ? 2 : 8 }}>
              ⏏ Cerrar sesión
            </button>
          )}
        </nav>
      </div>
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 900, color: C.ink }}>{NAV.find((n) => n.id === subView)?.label || ""}</h1>
          {subView === "vencidos" && <VencidosView protos={protos} capsulas={capsulas} stages={stages} />}
          {subView === "cierre_diseno" && <CierreDisenoView historial={historial} protos={protos} capsulas={capsulas} />}
          {subView === "bodega" && <ProximamenteView titulo="Informes de Bodega — próximamente" desc="Aquí van a ir los informes de despachos, abonos y saldo. Cuéntame qué necesitas ver primero y lo armamos." />}
          {subView === "corte" && <ProximamenteView titulo="Informes de Corte — próximamente" desc="Aquí van a ir los informes de cumplimiento, tendido y corte. Cuéntame qué necesitas ver primero y lo armamos." />}
          {subView === "contabilidad" && <ProximamenteView titulo="Informes de Contabilidad — próximamente" desc="Aquí van a ir los informes de flujo de caja y cuentas por pagar. Cuéntame qué necesitas ver primero y lo armamos." />}
        </div>
      </div>
    </div>
  );
}
