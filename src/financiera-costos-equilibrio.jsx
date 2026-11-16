// (2026-11-16, a pedido de Fredy) Financiera · «⚖️ Costos y equilibrio». Reúne en un solo lugar lo que antes vivía en Planeación:
// «Por área» (la misma pantalla de Planeación → Centro de Costo) y el Tablero de Costos (Cierre diario, Mano de obra y cotizaciones, ¿Cubro mis costos?).
// Centro de Costo sigue también en Planeación, Corte y Áreas para los líderes de área; aquí es la misma pantalla, no una copia. El Tablero solo lo ven administradores.
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { CentroCostoPlaneacionView } from "./modulo-planeacion";
import TableroCostosView from "./tablero-costos";

const SIN_ACCION = () => {};

function CentroCostoPorArea({ db, currentUser }) {
  const [trabajadores, setTrabajadores] = useState([]);
  const [produccion, setProduccion] = useState([]);
  const [areas, setAreas] = useState(null);
  const [reclamos, setReclamos] = useState([]);
  const [movimientos, setMovimientos] = useState(null);
  useEffect(() => {
    const u1 = onSnapshot(collection(db, "nomina_trabajadores"), (s) => setTrabajadores(s.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const u2 = onSnapshot(collection(db, "nomina_produccion"), (s) => setProduccion(s.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const u3 = onSnapshot(collection(db, "nomina_areas"), (s) => setAreas(s.docs.map((d) => ({ ...d.data(), id: d.id }))));
    const u4 = onSnapshot(collection(db, "planeacion_control_calidad"), (s) => setReclamos(s.docs.map((d) => ({ ...d.data(), id: d.id }))), () => {});
    const u5 = onSnapshot(doc(db, "planeacion_cache", "movimientos_procesos"), (s) => { if (s.exists()) setMovimientos(s.data()); }, () => {});
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [db]);
  if (areas === null) return <div style={{ padding: 40, textAlign: "center", color: "#5A5A7A", fontSize: 13 }}>Cargando Centro de Costo...</div>;
  return (
    <CentroCostoPlaneacionView
      trabajadores={trabajadores}
      produccion={produccion}
      areasNomina={areas}
      movimientos={movimientos}
      cargandoMovimientos={false}
      onActualizarMovimientos={SIN_ACCION}
      reclamosCalidad={reclamos}
      currentUser={currentUser}
    />
  );
}

export default function CostosEquilibrioView({ db, currentUser }) {
  if (!currentUser?.isAdmin) return <CentroCostoPorArea db={db} currentUser={currentUser} />;
  return <TableroCostosView db={db} extra={{ id: "por_area", label: "Por área", render: () => <CentroCostoPorArea db={db} currentUser={currentUser} /> }} />;
}
