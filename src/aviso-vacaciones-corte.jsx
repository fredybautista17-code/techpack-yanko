// Aviso de vacaciones en Centro de Costo de Corte: quién estuvo de vacaciones y cuánto bajó el costo de nómina.
import React from "react";

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;

// resumen: [{ nombre, dias }]  ·  reduccion: pesos que se restaron al costo  ·  sinFicha: nombres de Corte sin ficha en Nómina
export default function AvisoVacacionesCorte({ resumen, reduccion, sinFicha, etiqueta }) {
  const hay = resumen && resumen.length > 0;
  const faltan = sinFicha && sinFicha.length > 0;
  if (!hay && !faltan) return null;
  return (
    <div style={{ marginBottom: 18, display: "grid", gap: 8 }}>
      {hay ? (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#EBF1F7", border: "1px solid #C9D9E8", color: "#3D6B9E", fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
          🏖 De vacaciones o licencia no remunerada {etiqueta ? `(${etiqueta})` : ""}: {resumen.map((x) => `${x.nombre} (${x.dias} ${x.dias === 1 ? "día" : "días"})`).join(", ")}.
          <span style={{ fontWeight: 600 }}> No cuentan en la meta: el costo de nómina ya descuenta {money(reduccion)} de su sueldo de esos días.</span>
        </div>
      ) : null}
      {faltan ? (
        <div style={{ fontSize: 12, color: "#5A5A7A", lineHeight: 1.5 }}>
          Sin ficha de Nómina que coincida: {sinFicha.join(", ")}. Si alguno tiene vacaciones o licencia no remunerada no se puede detectar; el nombre en Corte debe tener al menos dos palabras que estén en el de la ficha (o ser idéntico).
        </div>
      ) : null}
    </div>
  );
}
