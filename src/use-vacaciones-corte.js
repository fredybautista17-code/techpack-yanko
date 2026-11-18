// Fichas y vacaciones de Nómina para las pantallas de Corte (solo lectura). Ver corte-vacaciones.js.
import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { esMotivoVacaciones } from "./meta-vacaciones";

export function useVacacionesCorte(db) {
  const [fichas, setFichas] = useState([]);
  const [ausencias, setAusencias] = useState([]);
  useEffect(() => {
    const u1 = onSnapshot(collection(db, "nomina_trabajadores"), (s) => setFichas(s.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || "" }))), () => {});
    const u2 = onSnapshot(collection(db, "nomina_ausencias"), (s) => setAusencias(
      s.docs.map((d) => d.data()).filter((x) => esMotivoVacaciones(x.motivo)).map((x) => ({ trabajadorId: x.trabajadorId, motivo: x.motivo, fechaInicio: x.fechaInicio, fechaFin: x.fechaFin }))
    ), () => {});
    return () => { u1(); u2(); };
  }, [db]);
  return useMemo(() => ({ fichas, ausencias }), [fichas, ausencias]);
}
