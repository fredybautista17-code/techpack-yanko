// ─── AYUDA POR QUINCENA (Nómina) — cálculo sin pantalla ──────────────────────────────────────────────────────────
// (2026-11-04, a pedido de Fredy) Es la misma cifra de «Ayuda por quincena» de Centro de Costo (Planeación): por cada
// quincena y por cada persona de destajo, lo que le falta a (producido + horas trabajadas) para llegar a su mínimo
// garantizado (sueldo + auxilio de la ficha ÷ 2). SIN netear entre quincenas. Así «¿Cubro mis costos?» muestra quién
// está recibiendo esa ayuda real, aparte de la ayuda del mes (garantizado − producido).
//   · Producido de la quincena: liquidación confirmada en Nómina (produccionReal, o pagoDias si es "por día"); si todavía no
//     está confirmada: causación manual de la quincena o, si no hay, la suma de Registrar Producción en las fechas.
//   · Horas: suma de «nomina_horas» (campo total) de la persona en las fechas de la quincena.
//   · Una quincena que aún no termina NO se cuenta (queda marcada «en curso»): el prorrateo por días hábiles solo existe en Planeación.
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function quincenasDelMes(ym) {
  const [anio, mes] = String(ym).split("-");
  const ultimo = new Date(Number(anio), Number(mes), 0).getDate();
  return [
    { pid: `${ym}-Q1`, inicio: `${ym}-01`, fin: `${ym}-15` },
    { pid: `${ym}-Q2`, inicio: `${ym}-16`, fin: `${ym}-${String(ultimo).padStart(2, "0")}` },
  ];
}

// personas: [{ id, nombre, tipoNomina }] — tipoNomina viene de la ficha. hoyISO: "YYYY-MM-DD" (hora de Colombia).
// datos: { fichas, liquidaciones, horas, produccion, causaciones }
// Devuelve Map(id → { total, enCurso, quincenas: [{ pid, esperado, produjo, horas, ayuda, fuente }] }) solo para personas de destajo.
export function ayudaQuincenasPorPersona(ym, personas, datos, hoyISO) {
  const { fichas = [], liquidaciones = [], horas = [], produccion = [], causaciones = [] } = datos || {};
  const out = new Map();
  const quincenas = quincenasDelMes(ym);
  (personas || []).forEach((p) => {
    const ficha = fichas.find((f) => f.id === p.id) || null;
    const tipo = ficha?.tipoNomina || p.tipoNomina || "";
    if (tipo !== "Destajo" || ficha?.pagoPorDia) return;
    const sueldo = num(ficha?.sueldo);
    const aux = num(ficha?.auxilioTransporte);
    const esperado = (sueldo + aux) / 2;
    let total = 0;
    let enCurso = false;
    const detalle = quincenas.map((q) => {
      if (q.fin >= hoyISO) {
        enCurso = true;
        return { pid: q.pid, esperado, produjo: 0, horas: 0, ayuda: 0, fuente: "en curso" };
      }
      const liq = liquidaciones.find((l) => l.trabajadorId === p.id && l.periodoId === q.pid);
      let produjo;
      let fuente;
      if (liq) {
        produjo = liq.pagoPorDia ? num(liq.pagoDias) : num(liq.produccionReal);
        fuente = "liquidación";
      } else {
        const caus = causaciones.find((c) => c.id === `${p.id}__${q.pid}`);
        produjo = caus ? num(caus.valor) : produccion.filter((r) => r.trabajadorId === p.id && r.fecha >= q.inicio && r.fecha <= q.fin).reduce((s, r) => s + num(r.total), 0);
        fuente = caus ? "causación manual" : "registro de producción";
      }
      const h = horas.filter((r) => r.trabajadorId === p.id && r.fecha >= q.inicio && r.fecha <= q.fin).reduce((s, r) => s + num(r.total), 0);
      const ayuda = Math.max(0, esperado - (produjo + h));
      total += ayuda;
      return { pid: q.pid, esperado, produjo, horas: h, ayuda, fuente };
    });
    out.set(p.id, { total, enCurso, quincenas: detalle });
  });
  return out;
}
