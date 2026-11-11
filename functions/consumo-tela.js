"use strict";
// Consumo de tela por lote y por tela (Busint) — teórico contra real (2026-11-11, a pedido de Fredy).
// Cálculo puro (sin Firebase) para poder probarlo con node. Cruza tres tablas de la API de Busint:
//   - "telas": ficha por referencia (Ref, Tela1..Tela10 = nombre, Tela1ml..Tela10ml = metros lineales por prenda).
//   - "orden produccion detalles telas": lo cortado por lote (NumLote, Codcomp, Largo, Ncapas, Ajuste, Costotela).
//     Metros reales de la fila = Largo × Ncapas + Ajuste.
//   - "estandar componentes prod": traduce Codcomp → Componente (nombre de la tela).
// Teórico de una tela = TelaNml × unidades de la referencia en el lote (se suman las referencias del lote).

function sinTildes(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const normTela = (s) => sinTildes(s).toUpperCase().replace(/\s+/g, " ").trim();
const normRef = (s) => sinTildes(s).toUpperCase().replace(/\s+/g, "");
const redondear = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  const limpio = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// Nombre real de una columna, sin importar mayúsculas (la API trae "Tela6-cons" pero "Tela6ml").
function colDe(muestra, ...opciones) {
  const ks = Object.keys(muestra || {});
  for (const o of opciones) {
    const h = ks.find((k) => k.toLowerCase() === o.toLowerCase());
    if (h) return h;
  }
  return null;
}

// lotes: Map | objeto { "7462": [{ ref: "DG-100", total: 168 }] }
function armarConsumoTelaPorLote({ lotes, filasDetalle, filasComponentes, filasTelas }) {
  const pedidos = lotes instanceof Map ? lotes : new Map(Object.entries(lotes || {}));
  const nombrePorCod = new Map();
  const cCod = colDe((filasComponentes || [])[0], "Codcomp");
  const cNom = colDe((filasComponentes || [])[0], "Componente");
  if (cCod && cNom) {
    filasComponentes.forEach((f) => {
      const cod = String(f[cCod] ?? "").trim();
      const nombre = String(f[cNom] ?? "").trim();
      if (cod && nombre) nombrePorCod.set(cod, nombre);
    });
  }
  // Ficha de cada referencia: Map(normTela → { nombre, ml })
  const fichas = new Map();
  const muestraT = (filasTelas || [])[0];
  const cRef = colDe(muestraT, "Ref");
  const colsTela = [];
  for (let n = 1; n <= 10; n++) colsTela.push({ nombre: colDe(muestraT, `Tela${n}`), ml: colDe(muestraT, `Tela${n}ml`) });
  if (cRef) {
    filasTelas.forEach((f) => {
      const ref = normRef(f[cRef]);
      if (!ref) return;
      const telas = new Map();
      colsTela.forEach((c) => {
        if (!c.nombre || !c.ml) return;
        const nombre = String(f[c.nombre] ?? "").trim();
        const ml = num(f[c.ml]);
        if (!nombre || !(ml > 0)) return;
        const k = normTela(nombre);
        telas.set(k, { nombre, ml: (telas.get(k)?.ml || 0) + ml });
      });
      fichas.set(ref, telas);
    });
  }
  // Lo cortado: por lote → por tela
  const muestraD = (filasDetalle || [])[0];
  const dLote = colDe(muestraD, "NumLote");
  const dCod = colDe(muestraD, "Codcomp");
  const dLargo = colDe(muestraD, "Largo");
  const dCapas = colDe(muestraD, "Ncapas");
  const dAjuste = colDe(muestraD, "Ajuste");
  const dCosto = colDe(muestraD, "Costotela");
  const real = new Map(); // lote → { metros, valor, telas: Map(normTela → { nombre, metros, valor }) }
  if (dLote) {
    (filasDetalle || []).forEach((f) => {
      const lote = String(f[dLote] ?? "").trim();
      if (!pedidos.has(lote)) return;
      const metros = (num(dLargo && f[dLargo]) || 0) * (num(dCapas && f[dCapas]) || 0) + (num(dAjuste && f[dAjuste]) || 0);
      if (metros === 0) return;
      const costoMetro = num(dCosto && f[dCosto]) || 0;
      const cod = String((dCod && f[dCod]) ?? "").trim();
      const nombre = nombrePorCod.get(cod) || `Código ${cod || "?"}`;
      if (!real.has(lote)) real.set(lote, { metros: 0, valor: 0, telas: new Map() });
      const l = real.get(lote);
      l.metros += metros;
      l.valor += metros * costoMetro;
      const k = normTela(nombre);
      if (!l.telas.has(k)) l.telas.set(k, { nombre, metros: 0, valor: 0 });
      const t = l.telas.get(k);
      t.metros += metros;
      t.valor += metros * costoMetro;
    });
  }
  const salida = {};
  real.forEach((l, lote) => {
    const refs = pedidos.get(lote) || [];
    const unidades = refs.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const teor = new Map(); // normTela → { nombre, metros }
    const sinFicha = [];
    refs.forEach((r) => {
      const ficha = fichas.get(normRef(r.ref));
      if (!ficha) { sinFicha.push(String(r.ref)); return; }
      ficha.forEach((t, k) => {
        if (!teor.has(k)) teor.set(k, { nombre: t.nombre, metros: 0 });
        teor.get(k).metros += t.ml * (Number(r.total) || 0);
      });
    });
    const claves = [...new Set([...l.telas.keys(), ...teor.keys()])];
    const telas = claves.map((k) => {
      const r = l.telas.get(k);
      const t = teor.get(k);
      const realM = r ? r.metros : 0;
      const teorM = t ? t.metros : 0;
      return {
        tela: (r && r.nombre) || (t && t.nombre) || k,
        realM: redondear(realM),
        teorM: redondear(teorM),
        difM: redondear(realM - teorM),
        costoMetro: r && r.metros > 0 ? redondear(r.valor / r.metros) : null,
        sinPareja: sinFicha.length === 0 && (!r || !t),
      };
    }).sort((a, b) => b.realM - a.realM);
    const teorTotal = [...teor.values()].reduce((s, t) => s + t.metros, 0);
    salida[lote] = {
      metros: redondear(l.metros),
      valor: Math.round(l.valor),
      costoPorMetro: l.metros > 0 ? redondear(l.valor / l.metros) : null,
      unidades,
      realM: redondear(l.metros),
      teorM: refs.length && sinFicha.length === 0 && teorTotal > 0 ? redondear(teorTotal) : null,
      sinFicha,
      telas,
    };
  });
  return salida;
}

module.exports = { armarConsumoTelaPorLote, normTela, normRef };
