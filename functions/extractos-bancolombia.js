// (2026-11-08, a pedido de Fredy) Lectura de extractos PDF de Bancolombia para «Dirección financiera»: cuenta corriente, crédito y tarjeta.
// Lectura EXACTA del texto del PDF (sin IA): lo que no reconoce lo dice, no lo inventa. La cuenta corriente se cuadra contra los totales impresos
// (abonos y cargos) para que se vea si faltó algún movimiento. Solo se guardan los ÚLTIMOS 4 DÍGITOS del número de cuenta / obligación / tarjeta.
// Probado con los extractos de ene–oct 2026, el crédito de nov 2026 y las tarjetas de oct 2026.
'use strict';

// ── Texto del PDF como líneas, con las columnas separadas por dos espacios o más (pdfjs-dist se carga con import() porque functions/ es CommonJS).
async function lineasDePdf(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const lineas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const contenido = await pagina.getTextContent();
    const items = contenido.items.filter((i) => i.str && i.str.trim() !== "").map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, s: i.str }));
    items.sort((a, b) => (Math.abs(b.y - a.y) > 2.5 ? b.y - a.y : a.x - b.x));
    let fila = [];
    let yFila = null;
    const cerrar = () => {
      if (!fila.length) return;
      fila.sort((a, b) => a.x - b.x);
      let txt = "";
      let finPrev = null;
      fila.forEach((it) => {
        if (finPrev === null) txt = it.s;
        else txt += (it.x - finPrev > 4 ? "  " : " ") + it.s;
        finPrev = it.x + it.w;
      });
      lineas.push(txt.replace(/\s+$/, ""));
      fila = [];
    };
    items.forEach((it) => {
      if (yFila === null || Math.abs(it.y - yFila) > 2.5) { cerrar(); yFila = it.y; }
      fila.push(it);
    });
    cerrar();
    lineas.push("\f");
  }
  return lineas;
}

// "1,968,505.49-" → -1968505.49 ; "-112,000.00" → -112000 ; ".00" → 0 ; "2,1155" (coma decimal) no se usa aquí.
function monto(s) {
  if (s === undefined || s === null) return 0;
  let t = String(s).trim();
  let neg = false;
  if (t.endsWith("-")) { neg = true; t = t.slice(0, -1); }
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  const n = Number(t.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}
const RE_MONTO = /-?[\d,]*\.\d\d-?/g;
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ult4 = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 4 ? d.slice(-4) : ""; };
const iso = (d, m, a) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// ── Cuenta corriente ────────────────────────────────────────────────────────
function leerCuenta(lineas) {
  const texto = lineas.join("\n");
  const periodo = /DESDE:\s*(\d{4})\/(\d{2})\/(\d{2})\s+HASTA:\s*(\d{4})\/(\d{2})\/(\d{2})/.exec(texto);
  if (!periodo) return { error: "No encontré el período («DESDE … HASTA …») del extracto." };
  const val = (rotulo) => { const m = new RegExp(`${rotulo}\\s+\\$?\\s*(-?[\\d,]*\\.?\\d*)`).exec(texto); return m ? monto(m[1]) : null; };
  const resumen = {
    saldoAnterior: val("SALDO ANTERIOR"), abonos: val("TOTAL ABONOS"), cargos: val("TOTAL CARGOS"), saldoActual: val("SALDO ACTUAL"),
    cupoSobregiro: val("CUPO SOBREGIRO"), interesesCobrados: val("VALOR INTERESES COBRADOS"),
  };
  if (resumen.abonos === null || resumen.cargos === null) return { error: "No encontré el RESUMEN (total abonos / total cargos) del extracto." };
  const sum = { abonos: 0, cargos: 0 };
  const costos = { c4x1000: 0, comisiones: 0, plan: 0, cupo: 0, sobregiro: 0 };
  const info = { embargos: { n: 0, total: 0 }, cuotaCredito: { n: 0, total: 0 }, pagosTarjeta: { n: 0, total: 0 }, cheques: { n: 0, total: 0 } };
  const detalle = {};
  let n = 0;
  lineas.forEach((l) => {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\s+(.*)$/.exec(l);
    if (!m) return;
    const resto = m[3];
    RE_MONTO.lastIndex = 0;
    const primero = RE_MONTO.exec(resto);
    if (!primero) return;
    const desc = resto.slice(0, primero.index).replace(/\s+/g, " ").trim();
    const v = monto(primero[0]);
    n += 1;
    if (v >= 0) sum.abonos += v; else sum.cargos += -v;
    const sumar = (k, nombre) => { costos[k] -= v; const d = detalle[k] || (detalle[k] = { n: 0, total: 0 }); d.n += 1; d.total -= v; return nombre; };
    if (desc.startsWith("IMPTO GOBIERNO 4X1000")) sumar("c4x1000");
    else if (desc.includes("CUOTA PLAN CANAL")) sumar("plan");
    else if (desc.includes("CUPO ROTATIVO")) sumar("cupo");
    else if (desc.includes("INTERESES SOBREG")) sumar("sobregiro");
    else if (v < 0 && (desc.startsWith("SERVICIO") || desc.startsWith("COBRO IVA") || desc.startsWith("COMIS") || desc.includes("COMISION"))) sumar("comisiones");
    else if (v < 0 && desc.includes("EMBARGO")) { info.embargos.n += 1; info.embargos.total -= v; }
    else if (v < 0 && /PAGO CUOTA CREDITO/.test(desc)) { info.cuotaCredito.n += 1; info.cuotaCredito.total -= v; }
    else if (v < 0 && /PAGO AUTOM TC/.test(desc)) { info.pagosTarjeta.n += 1; info.pagosTarjeta.total -= v; }
    else if (v < 0 && /^CHEQUE/.test(desc)) { info.cheques.n += 1; info.cheques.total -= v; }
  });
  const dif = { abonos: redondear(sum.abonos - resumen.abonos), cargos: redondear(sum.cargos - resumen.cargos) };
  const ok = Math.abs(dif.abonos) < 1 && Math.abs(dif.cargos) < 1;
  const nums = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, redondear(x)]));
  return {
    tipo: "cuenta",
    ym: `${periodo[4]}-${periodo[5]}`, desde: iso(periodo[3], periodo[2], periodo[1]), hasta: iso(periodo[6], periodo[5], periodo[4]),
    ref: ult4((/N[ÚU]MERO\s+(\d{6,})/.exec(texto) || [])[1]),
    resumen, movimientos: n, cuadre: { ok, diferenciaAbonos: dif.abonos, diferenciaCargos: dif.cargos },
    costos: nums(costos), detalle: Object.fromEntries(Object.entries(detalle).map(([k, d]) => [k, { n: d.n, total: redondear(d.total) }])),
    info: Object.fromEntries(Object.entries(info).map(([k, d]) => [k, { n: d.n, total: redondear(d.total) }])),
  };
}

// ── Crédito ─────────────────────────────────────────────────────────────────
function leerCredito(lineas) {
  const texto = lineas.join("\n");
  const m1 = (re) => { const m = re.exec(texto); return m ? m[1] : null; };
  const saldoCapital = m1(/SALDO DE CAPITAL\s+(-?[\d,]*\.?\d+)/);
  const tasa = m1(/TASA DE INTER[ÉE]S E\.A\.\s+([\d.]+)/);
  const cuotaLinea = /^\s*TOTAL\s+(-?[\d,]*\.\d\d)\s+(-?[\d,]*\.\d\d)/m.exec(texto);
  if (saldoCapital === null || tasa === null) return { error: "No encontré el saldo de capital o la tasa del crédito." };
  const fp = /FECHA DE PAGO:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  const fc = /FECHA CORTE EXTRACTO\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  const fd = /FECHA DE DESEMBOLSO\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  const linea = (/LÍNEA DE CRÉDITO\s+(.+)/.exec(texto) || [])[1] || "";
  return {
    tipo: "credito",
    ref: ult4((/OBLIGACI[ÓO]N\s*N[º°o]?:?\s*(\d{6,})/.exec(texto) || [])[1]),
    saldoCapital: monto(saldoCapital), tasaEA: Number(tasa),
    cuotaTotal: cuotaLinea ? monto(cuotaLinea[2]) : null, cuotaNumero: Number(m1(/CUOTA N[ÚU]MERO\s+(\d+)/) || 0) || null,
    fechaPago: fp ? iso(fp[2], fp[1], fp[3]) : null, // el extracto trae mes/día/año
    fechaCorte: fc ? iso(fc[2], fc[1], fc[3]) : null, fechaDesembolso: fd ? iso(fd[2], fd[1], fd[3]) : null,
    valorInicial: monto(m1(/VALOR INICIAL\s+(-?[\d,]*\.?\d+)/) || 0), enMora: monto(m1(/SALDO EN MORA CAPITAL\s+(-?[\d,]*\.?\d+)/) || 0), linea: linea.trim().slice(0, 80),
  };
}

// ── Tarjeta (pesos y, si hay, dólares) ──────────────────────────────────────
function leerTarjeta(lineas) {
  const texto = lineas.join("\n");
  const secciones = [];
  const partes = texto.split(/ESTADO DE CUENTA (?:CONSOLIDADO )?EN:\s*/);
  for (let i = 1; i < partes.length; i++) {
    const p = partes[i];
    const moneda = /^(PESOS|DOLARES|DÓLARES)/i.exec(p);
    if (!moneda) continue;
    // Dos formatos del banco: (A) «= Pagos total X = Pago mínimo Y» y (B) consolidado «Pague antes de / Pago mínimo / Saldo total» con los valores en la línea siguiente.
    let saldo = /=\s*Pagos total\s+(-?[\d,]*\.\d\d)\s+=\s*Pago m[ií]nimo\s+(-?[\d,]*\.\d\d)/i.exec(p);
    let consolidado = null;
    if (!saldo) {
      consolidado = /Pague antes de\s+Pago m[ií]nimo\s+Saldo total[^\n]*\n\s*(\d{2})\/(\d{2})\/(\d{4})\s+(?:US)?\$\s*(-?[\d,]*\.\d\d)\s+(?:US)?\$\s*(-?[\d,]*\.\d\d)/i.exec(p);
      if (consolidado) saldo = [null, consolidado[5], consolidado[4]];
    }
    if (!saldo) continue;
    const per = /Hasta:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(p);
    const pagar = consolidado ? [null, consolidado[1], consolidado[2], consolidado[3]] : /Pague antes de[^\n]*\n[^\n]*?(\d{2})\/(\d{2})\/(\d{4})/.exec(p) || /(\d{2})\/(\d{2})\/(\d{4})\s*$/m.exec((/Pague antes de[\s\S]{0,200}/.exec(p) || [""])[0]);
    const cupo = /Cupo Total[^\n]*\n\s*\$\s*(-?[\d,]*\.\d\d)/.exec(p);
    let tasas = [...p.matchAll(/(\d{1,2},\d{4})\s*%\s+(\d{1,2},\d{4})\s*%/g)].map((x) => Number(x[2].replace(",", ".")));
    if (!tasas.length) tasas = [...p.matchAll(/\d,\d{4}\s+(\d{1,2},\d{4})\s+\d+\/\d+/g)].map((x) => Number(x[1].replace(",", ".")));
    // Tasa implícita en pesos por dólar: valor original en pesos («VR MONEDA ORIG») ÷ valor en dólares de la compra.
    const razones = [];
    const ls = p.split("\n");
    ls.forEach((l, k) => {
      const mo = /VR MONEDA ORIG\s+([\d.]+)/.exec(l);
      if (!mo || k === 0) return;
      const ant = ls[k - 1];
      const mm = /\s(\d+\.\d\d)\s+\d,\d{4}\s+\d+,\d{4}/.exec(ant) || /\s(\d+\.\d\d)\s+\d+\.\d\d\s+\d+\.\d\d\s+\d+\/\d+/.exec(ant);
      if (mm && Number(mm[1]) > 0 && Number(mo[1]) > 0) { const r = Number(mo[1]) / Number(mm[1]); if (r >= 1500 && r <= 10000) razones.push(r); } // solo valores creíbles de pesos por dólar
    });
    razones.sort((a, b) => a - b);
    secciones.push({
      moneda: /^P/i.test(moneda[1]) ? "COP" : "USD",
      saldoTotal: monto(saldo[1]), pagoMinimo: monto(saldo[2]),
      hasta: per ? iso(per[1], per[2], per[3]) : null, pagarAntes: pagar ? iso(pagar[1], pagar[2], pagar[3]) : null,
      cupo: cupo ? monto(cupo[1]) : null, tasaEA: tasas.length ? Math.max(...tasas) : null,
      trmImplicita: razones.length ? Math.round(razones[Math.floor(razones.length / 2)]) : null,
    });
  }
  if (!secciones.length) return { error: "No reconocí el formato de esta tarjeta (busqué «ESTADO DE CUENTA EN» y «Pagos total / Pago mínimo»). Prueba con el extracto PDF más reciente que baja del banco." };
  const cop = secciones.find((s) => s.moneda === "COP") || null;
  const usd = secciones.find((s) => s.moneda === "USD") || null;
  const base = cop || usd;
  return {
    tipo: "tarjeta",
    ref: ult4((/TARJETA:\s*\*+(\d{4})/.exec(texto) || [])[1]),
    corte: base.hasta, pagarAntes: base.pagarAntes, cupo: base.cupo, tasaEA: Math.max(...secciones.map((s) => s.tasaEA || 0)) || null,
    pesos: cop ? { saldo: cop.saldoTotal, pagoMinimo: cop.pagoMinimo } : { saldo: 0, pagoMinimo: 0 },
    dolares: usd ? { saldo: usd.saldoTotal, pagoMinimo: usd.pagoMinimo } : null,
    trmImplicita: usd ? usd.trmImplicita : null,
  };
}

// ── Entrada ─────────────────────────────────────────────────────────────────
async function leerExtracto(buffer) {
  const lineas = await lineasDePdf(buffer);
  const texto = lineas.join("\n");
  if (!texto.trim()) return { error: "El PDF no trae texto (parece una imagen escaneada). Descárgalo de nuevo desde la sucursal virtual." };
  if (/CUENTA CORRIENTE|CUENTA DE AHORROS/.test(texto) && /TOTAL ABONOS/.test(texto)) return leerCuenta(lineas);
  if (/SALDO DE CAPITAL/.test(texto) && /OBLIGACI[ÓO]N/.test(texto)) return leerCredito(lineas);
  if (/ESTADO DE CUENTA (CONSOLIDADO )?EN:/.test(texto) && /Pago m[ií]nimo/i.test(texto)) return leerTarjeta(lineas);
  return { error: "No reconozco este PDF. Por ahora leo extractos de Bancolombia de cuenta corriente, crédito y tarjeta de crédito." };
}

module.exports = { leerExtracto, lineasDePdf, leerCuenta, leerCredito, leerTarjeta, monto };
