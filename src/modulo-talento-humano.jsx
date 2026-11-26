// Módulo «Talento Humano» (2026-11-26, a pedido de Fredy): sale de Nómina y queda como módulo propio.
// Dos formas de entrar:
//  · Completo (verTodo): Talento Humano y gerencia ven a todos los trabajadores, incluidos salud, antecedentes y hoja de vida.
//  · Por área (areaLider): el jefe/líder ve SOLO a su gente (según su «Área Interna» en Usuarios), en solo lectura y sin datos sensibles.
import { useState, useEffect, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import CentroTalentoHumano from "./talento-humano-centro";

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
const storage = getStorage(fbApp);

const C = { ink: "#1A1A2E", slate: "#5A5A7A", border: "#E8E2DB", canvas: "#F7F4F0", white: "#FFFFFF", seam: "#C8B8A2", red: "#E85D4A", amber: "#C47C1A", amberBg: "#FDF5E6" };

function useColeccion(nombre) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const quitar = onSnapshot(
      collection(db, nombre),
      (snap) => { setLista(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(""); },
      (e) => { console.error(`No se pudo leer ${nombre}:`, e); setLista([]); setError("No se pudo cargar la información. Revisa tu conexión y recarga la página."); }
    );
    return quitar;
  }, [nombre]);
  return { lista, error };
}

// verTodo: acceso completo. areaLider: nombre del área del líder (su «Área Interna»); si no hay verTodo, solo ve esa área.
export default function ModuloTalentoHumano({ currentUser, onVolver, onLogout, verTodo = false, areaLider = "", canNomina = false, onIrANomina }) {
  const { lista: trabajadoresTodos, error: errT } = useColeccion("nomina_trabajadores");
  const { lista: candidatos } = useColeccion("nomina_candidatos");
  const [vista, setVista] = useState("tablero");
  const porArea = !verTodo;
  const trabajadores = useMemo(() => {
    const t = trabajadoresTodos || [];
    return porArea ? t.filter((x) => (x.area || "Sin asignar") === areaLider) : t;
  }, [trabajadoresTodos, porArea, areaLider]);

  const NAV = [
    { id: "tablero", icon: "📊", label: "Tablero" },
    { id: "expediente", icon: "🗂️", label: porArea ? "Mi gente" : "Expediente" },
    ...(verTodo ? [{ id: "lote", icon: "⚡", label: "Carga por lote" }] : []),
  ];
  const sinArea = porArea && !String(areaLider || "").trim();
  const iniciales = String(currentUser?.name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const botonMenu = (activo) => ({ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", background: activo ? C.seam : "transparent", color: activo ? C.ink : "#8888AA", fontWeight: activo ? 800 : 500, fontSize: 13, textAlign: "left" });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.canvas, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ width: 220, background: C.ink, padding: "20px 12px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <div style={{ color: C.white, fontWeight: 800, fontSize: 15, padding: "0 6px 2px" }}>🧭 Talento Humano</div>
        <div style={{ color: C.seam, fontSize: 11, padding: "0 6px 12px" }}>{porArea ? `Líder · ${areaLider || "sin área"}` : "Acceso completo"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 6px 14px" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.seam, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.ink, flexShrink: 0 }}>{iniciales}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name}</div>
            <div style={{ fontSize: 10, color: C.seam }}>{currentUser?.role}</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setVista(n.id)} style={botonMenu(vista === n.id)} aria-current={vista === n.id}><span style={{ fontSize: 14 }}>{n.icon}</span>{n.label}</button>
          ))}
          {canNomina && onIrANomina && <button onClick={onIrANomina} style={{ ...botonMenu(false), marginTop: 8 }}><span style={{ fontSize: 14 }}>💼</span>Ir a Nómina</button>}
          {onVolver && <button onClick={onVolver} style={{ ...botonMenu(false), color: "rgba(200,184,162,0.5)", fontWeight: 500, fontSize: 12, marginTop: 8 }}>← Volver al Inicio</button>}
          {onLogout && <button onClick={onLogout} style={{ ...botonMenu(false), color: "rgba(232,93,74,0.85)", fontWeight: 700, fontSize: 12 }}>⏏ Cerrar sesión</button>}
        </nav>
      </div>
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto", minWidth: 0 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {errT && <div style={{ background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>{errT}</div>}
          {sinArea ? (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, color: C.ink, maxWidth: 560 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Todavía no tienes un área asignada</div>
              <div style={{ fontSize: 13, color: C.slate }}>Para ver a tu gente, Talento Humano o el administrador debe poner tu «Área Interna» en Usuarios. Después de eso aparecerá aquí tu equipo.</div>
            </div>
          ) : trabajadoresTodos === null ? (
            <div style={{ padding: 20, color: C.slate }}>Cargando…</div>
          ) : (
            <CentroTalentoHumano db={db} storage={storage} trabajadores={trabajadores} candidatos={verTodo ? candidatos || [] : []} currentUser={currentUser} soloLectura={porArea} ocultarSensibles={porArea} vista={vista} onVista={setVista} />
          )}
        </div>
      </div>
    </div>
  );
}
