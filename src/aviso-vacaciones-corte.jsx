// Aviso de vacaciones en Centro de Costo de Corte: quién estuvo de vacaciones o con licencia y cómo afecta el costo.
// (2026-11-27) Se separa lo que SE PAGA (vacaciones: solo salen de la meta) de lo que NO SE PAGA (licencia no remunerada: sale de todo).
import React from "react";

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;
const dias = (n) => `${n} ${n === 1 ? "día" : "días"}`;
const lista = (arr, campo) => arr.map((x) => `${x.nombre} (${dias(x[campo])})`).join(", ");

// resumen: [{ nombre, dias, diasVac, diasLic }]  ·  reduccion: pesos que se restaron al costo de días trabajados
// reduccionVac / reduccionLic: lo mismo por separado (si no llegan, se muestra el aviso de siempre)  ·  sinFicha: nombres de Corte sin ficha en Nómina
export default function AvisoVacacionesCorte({ resumen, reduccion, reduccionVac, reduccionLic, sinFicha, etiqueta }) {
  const hay = resumen && resumen.length > 0;
  const faltan = sinFicha && sinFicha.length > 0;
  if (!hay && !faltan) return null;
  const separado = hay && (reduccionVac != null || reduccionLic != null) && resumen.some((x) => x.diasVac != null || x.diasLic != null);
  const caja = { padding: "10px 14px", borderRadius: 10, background: "#EBF1F7", border: "1px solid #C9D9E8", color: "#3D6B9E", fontSize: 13, fontWeight: 700, lineHeight: 1.5 };
  const chip = (txt, pagado) => (
    <span style={{ marginRight: 8, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: pagado ? "#EBF7F2" : "#FDF0EE", color: pagado ? "#2D9E6B" : "#E85D4A" }}>{txt}</span>
  );
  const conVac = separado ? resumen.filter((x) => x.diasVac > 0) : [];
  const conLic = separado ? resumen.filter((x) => x.diasLic > 0) : [];
  return (
    <div style={{ marginBottom: 18, display: "grid", gap: 8 }}>
      {hay && !separado ? (
        <div style={caja}>
          🏖 De vacaciones o licencia no remunerada {etiqueta ? `(${etiqueta})` : ""}: {resumen.map((x) => `${x.nombre} (${dias(x.dias)})`).join(", ")}.
          <span style={{ fontWeight: 600 }}> No cuentan en la meta: el costo de nómina ya descuenta {money(reduccion)} de su sueldo de esos días.</span>
        </div>
      ) : null}
      {hay && separado ? (
        <div style={caja}>
          🏖 Días fuera de la meta {etiqueta ? `(${etiqueta})` : ""}
          {conVac.length > 0 ? (
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              {chip("SE PAGA", true)}<b>Vacaciones:</b> {lista(conVac, "diasVac")} · {money(reduccionVac)}. No cuentan en la meta, pero sí son costo real.
            </div>
          ) : null}
          {conLic.length > 0 ? (
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              {chip("NO SE PAGA", false)}<b>Licencia no remunerada:</b> {lista(conLic, "diasLic")} · {money(reduccionLic)}. No cuentan en la meta ni en el costo.
            </div>
          ) : null}
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

// Línea roja (o verde) bajo la píldora de cobertura: la cobertura con el costo PAGADO. lectura = lecturaCostoPagado(...)
export function LineaCostoPagado({ lectura }) {
  if (!lectura || !lectura.hay) return null;
  const ok = lectura.falta <= 0;
  return (
    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.5, background: ok ? "#EBF7F2" : "#FDF0EE", border: `1px solid ${ok ? "#BFE4D3" : "#F3C9C3"}`, color: "#1A1A2E" }}>
      Con el <b style={{ color: ok ? "#2D9E6B" : "#E85D4A" }}>costo pagado</b> la cobertura es <b style={{ color: ok ? "#2D9E6B" : "#E85D4A" }}>{lectura.pct.toFixed(1).replace(".", ",")} %</b>
      {ok ? ": el corte también cubre las vacaciones pagadas." : `: faltan ${money(lectura.falta)} para cubrir también las vacaciones pagadas.`}
    </div>
  );
}
