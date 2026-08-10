import { useState, useEffect } from "react";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubProtos = onSnapshot(collection(db, "prototipos"), (snap) => setProtos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const unsubCapsulas = onSnapshot(collection(db, "capsulas"), (snap) => setCapsulas(snap.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const unsubConfig = onSnapshot(doc(db, "config", "main"), (snap) => {
      setStages(snap.exists() ? snap.data().stages || [] : []);
      setLoading(false);
    });
    return () => { unsubProtos(); unsubCapsulas(); unsubConfig(); };
  }, []);

  const NAV = [
    { id: "vencidos", icon: "🚩", label: "Vencidos (Diseño)" },
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
          {subView === "bodega" && <ProximamenteView titulo="Informes de Bodega — próximamente" desc="Aquí van a ir los informes de despachos, abonos y saldo. Cuéntame qué necesitas ver primero y lo armamos." />}
          {subView === "corte" && <ProximamenteView titulo="Informes de Corte — próximamente" desc="Aquí van a ir los informes de cumplimiento, tendido y corte. Cuéntame qué necesitas ver primero y lo armamos." />}
          {subView === "contabilidad" && <ProximamenteView titulo="Informes de Contabilidad — próximamente" desc="Aquí van a ir los informes de flujo de caja y cuentas por pagar. Cuéntame qué necesitas ver primero y lo armamos." />}
        </div>
      </div>
    </div>
  );
}
