// ─── Contabilidad → «💲 Costos de muestras» ───────────────────────────────────────────────────────────────────────
// (2026-11-26, a pedido de Fredy) Antes vivía como pestaña «💲 Costos» dentro del Cronograma de Muestras. Ahora está en Contabilidad. Es la misma
// pantalla (CostosMuestrasView: sueldos, talleres, presupuesto, pagos y la tarifa por prenda que se calcula sola); este archivo solo le trae
// los datos que necesita (cronograma_muestras y la lista de talleres de muestra). Los datos siguen en centro_costo_muestras.
import React, { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { CostosMuestrasView } from "./muestras-estadisticas";

export default function CostosMuestrasContabilidad({ db, currentUser }) {
  const [muestras, setMuestras] = useState(null);
  const [talleres, setTalleres] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const u1 = onSnapshot(collection(db, "cronograma_muestras"), (s) => setMuestras(s.docs.map((d) => ({ ...d.data(), id: d.id }))), (e) => setError(e?.message || "No se pudo leer el cronograma de muestras."));
    const u2 = onSnapshot(doc(db, "config", "main"), (s) => setTalleres(Array.isArray(s.data()?.talleresMuestra) ? s.data().talleresMuestra : []), () => {});
    return () => { u1(); u2(); };
  }, [db]);
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>💲 Costos de muestras</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7 }}>Sueldos y precios de los talleres de muestra, presupuesto mensual y la tarifa por prenda que alimenta el Cotizador.</p>
      </div>
      {error ? <div style={{ color: "#E85D4A", fontSize: 13 }}>{error}</div>
        : muestras === null ? <div style={{ fontSize: 13, opacity: 0.7 }}>Cargando muestras…</div>
        : <CostosMuestrasView db={db} muestras={muestras} talleresConfig={talleres} usuarioNombre={(currentUser && (currentUser.name || currentUser.username)) || ""} />}
    </div>
  );
}
