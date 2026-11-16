// ─── AYUDA POR QUINCENA (Nómina) — cálculo sin pantalla ──────────────────────────────────────────────────────────
// (2026-11-04, a pedido de Fredy) Ayuda por quincena de cada persona de destajo, para que «¿Cubro mis costos?» muestre quién
// está recibiendo ayuda. SIN netear entre quincenas.
// (2026-11-16, a pedido de Fredy) La ayuda es LO QUE DE VERDAD SE PUSO en la nómina, no «mínimo de la ficha − producido» (ese mínimo
// era una suposición: a Glenda se le completó a $900.000 y no a $1.000.000, y salían $267.260 en vez de $67.260):
//   · Ajuste manual de Nómina Destajo (`nomina_ajustes_destajo`, id trabajador__periodo, solo si es positivo; los negativos son descuentos).
//   · + Ayuda salario mínimo (`ayudaSalarioMinimo` de la liquidación) de quien tiene «mínimo garantizado» (ahí el ajuste manual no aplica).
//   · Quincena con liquidación confirmada → esas dos cifras. Sin liquidación: si ya hay un Ajuste manual, se usa; si hay producción u
//     horas registradas se ESTIMA lo que falta para el mínimo de la ficha ((sueldo + auxilio) ÷ 2); si no hay nada, queda «sin liquidar» (0).
//   · Una quincena que aún no termina NO se cuenta (queda marcada «en curso»).
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
// datos: { fichas, liquidaciones, horas, produccion, causaciones, ajustes }
// Devuelve Map(id → { total, enCurso, sinLiquidar, quincenas: [{ pid, esperado, produjo, horas, ayuda, fuente }] }) solo para personas de destajo.
export function ayudaQuincenasPorPersona(ym, personas, datos, hoyISO) {
  const { fichas = [], liquidaciones = [], horas = [], produccion = [], causaciones = [], ajustes = [] } = datos || {};
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
    let sinLiquidar = false;
    const finQ = (x) => { total += x.ayuda; return x; };
    const detalle = quincenas.map((q) => {
      if (q.fin >= hoyISO) {
        enCurso = true;
        return { pid: q.pid, esperado, produjo: 0, horas: 0, ayuda: 0, fuente: "en curso" };
      }
      const liq = liquidaciones.find((l) => l.trabajadorId === p.id && l.periodoId === q.pid);
      const ajusteDoc = ajustes.find((x) => x.id === `${p.id}__${q.pid}`);
      const ajusteManual = ajusteDoc ? Math.max(0, num(ajusteDoc.valor)) : liq ? Math.max(0, num(liq.ajusteValor)) : 0;
      if (liq) {
        const minimo = liq.salarioMinimoGarantizado ? num(liq.ayudaSalarioMinimo) : 0;
        const manual = liq.salarioMinimoGarantizado ? 0 : ajusteManual;
        const produjoL = liq.pagoPorDia ? num(liq.pagoDias) : num(liq.produccionReal);
        const ayudaL = manual + minimo;
        total += ayudaL;
        return { pid: q.pid, esperado, produjo: produjoL, horas: num(liq.totalHoras), ayuda: ayudaL, ajusteManual: manual, ayudaMinimo: minimo, fuente: "liquidación" };
      }
      const caus = causaciones.find((c) => c.id === `${p.id}__${q.pid}`);
      const filasProd = produccion.filter((r) => r.trabajadorId === p.id && r.fecha >= q.inicio && r.fecha <= q.fin);
      const filasHoras = horas.filter((r) => r.trabajadorId === p.id && r.fecha >= q.inicio && r.fecha <= q.fin);
      if (ajusteDoc && ajusteManual > 0) {
        total += ajusteManual;
        return { pid: q.pid, esperado, produjo: 0, horas: 0, ayuda: ajusteManual, ajusteManual, ayudaMinimo: 0, fuente: "ajuste manual (sin confirmar)" };
      }
      if (!caus && !filasProd.length && !filasHoras.length) {
        sinLiquidar = true;
        return { pid: q.pid, esperado, produjo: 0, horas: 0, ayuda: 0, fuente: "sin liquidar" };
      }
      const produjo = caus ? num(caus.valor) : filasProd.reduce((x, r) => x + num(r.total), 0);
      const h = filasHoras.reduce((x, r) => x + num(r.total), 0);
      const fuente = "estimada (sin liquidar)";
      const ayuda = Math.max(0, esperado - (produjo + h));
      return finQ({ pid: q.pid, esperado, produjo, horas: h, ayuda, fuente });
    });
    out.set(p.id, { total, enCurso, sinLiquidar, quincenas: detalle });
  });
  return out;
}
