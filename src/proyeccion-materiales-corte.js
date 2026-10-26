// ─── PROYECCIÓN POR ÁREA — MATERIAL DE LO QUE FALTA POR CORTAR (sin pantalla) ─
// (2026-10-26, a pedido de Fredy) Fase 2, paso B. Para cada pedido+referencia que
// todavía falta por cortar revisa si hay tela e insumos (ficha de Busint × unidades)
// y, si no hay, desde cuándo llegarían (órdenes de compra) para que Corte no los
// proyecte antes de esa fecha.
//
//  - Se reparte el inventario y las órdenes de compra pedido por pedido, primero
//    la fecha de despacho más cercana (para no contar dos veces la misma tela).
//  - Tela: stock por nombre+color (Ml o M²) · Insumo: stock sumado por nombre.
//  - Lo que no alcanza se cubre con las órdenes de compra vigentes (fecha de entrega).
//    Lo que no alcanza ni con órdenes de compra se supone que llega en hoy + N días.
//  - Simplificación: NO descuenta lo que ya tienen asignado los lotes cortados
//    (Lotes por integrar) ni usa la merma de Explosión de materiales.

const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const refSG = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const claveInsumo = (s) => String(s || "").toUpperCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
function tipoUnidadTela(u) {
  const t = String(u || "").trim().toLowerCase().replace(/\./g, "");
  if (t === "m2" || t === "m²") return "m2";
  if (t === "kg" || t === "kilo" || t === "kilos" || t === "kgs") return "kg";
  return "m";
}
function sumarDias(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const soloFecha = (v) => {
  const s = String(v || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

// Une los pedidos que se repiten (mismo pedido+referencia) en una sola fila.
export function agruparSinCortar(sinCortar) {
  const mapa = new Map();
  (sinCortar || []).forEach((s) => {
    const key = `P|${s.numPed ?? ""}|${String(s.ref || "").trim()}`;
    const x = mapa.get(key);
    if (x) {
      x.unid += NUM(s.unid);
      if (!(x.precio > 0) && NUM(s.precio) > 0) x.precio = NUM(s.precio);
      if (!x.fechaDespacho && s.fechaDespacho) x.fechaDespacho = s.fechaDespacho;
    } else mapa.set(key, { ...s, key, unid: NUM(s.unid), precio: NUM(s.precio) });
  });
  return [...mapa.values()];
}

// Parte las unidades de cada pedido+referencia entre sus colores (pinta · color) según
// lo que ATLAS tiene pendiente en el pedido. Si ATLAS no tiene ese pedido/referencia,
// queda una sola línea sin color (la ficha usa el primer color de Busint: aproximado).
export function lineasDeSinCortar(items, pedidosAtlas) {
  const porNumero = new Map();
  (pedidosAtlas || []).forEach((p) => porNumero.set(String(p.numero ?? p.id ?? "").trim(), p));
  return items.map((s) => {
    const p = porNumero.get(String(s.numPed ?? "").trim());
    const refs = p ? (p.referencias || []).filter((r) => refSG(r.ref) === refSG(s.ref)) : [];
    if (!refs.length) return { ...s, lineas: [{ pinta: "", color: "", unid: s.unid }], aprox: true };
    const cortesRefs = (p.cortesRealizados || []).flatMap((c) => c.refs || []);
    const pesos = refs.map((r) => {
      const total = NUM(r.total);
      const cortado = cortesRefs.filter((cr) => cr.refId === r.id).reduce((a, cr) => a + Object.values(cr.tallas || {}).reduce((x, v) => x + NUM(v), 0), 0);
      return Math.max(0, total - cortado);
    });
    let suma = pesos.reduce((a, b) => a + b, 0);
    const base = suma > 0 ? pesos : refs.map((r) => NUM(r.total) || 1);
    suma = base.reduce((a, b) => a + b, 0) || 1;
    let resto = s.unid;
    const lineas = refs.map((r, i) => {
      const u = i === refs.length - 1 ? resto : Math.round((s.unid * base[i]) / suma);
      resto -= u;
      const [pinta, ...c] = String(r.descripcion || "").split(" · ");
      return { pinta: pinta.trim(), color: c.join(" · ").trim(), unid: Math.max(0, u) };
    }).filter((l) => l.unid > 0);
    return { ...s, lineas: lineas.length ? lineas : [{ pinta: "", color: "", unid: s.unid }], aprox: !lineas.length };
  });
}

// Órdenes de compra vigentes → Map(código de Busint → [{ ff, resto }]) por fecha de entrega.
// ordenes: [{ n, ff, dx, l:[[cod, cant, costo, dsc]] }] · marcas: Set de órdenes marcadas como recibidas.
export function ocPorCodigo(ordenes, marcas, hoyISO) {
  const mapa = new Map();
  (ordenes || []).forEach((o) => {
    if (o.dx || (marcas && marcas.has(String(o.n))) || !o.ff) return;
    const ff = String(o.ff).slice(0, 10);
    if (ff < hoyISO) return; // vencidas: no se cuentan (igual que en Explosión de materiales)
    (o.l || []).forEach(([cod, cant]) => {
      const c = String(cod ?? "").trim();
      if (!c || !(NUM(cant) > 0)) return;
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c).push({ ff, resto: NUM(cant), n: o.n });
    });
  });
  mapa.forEach((l) => l.sort((a, b) => a.ff.localeCompare(b.ff)));
  return mapa;
}

// Capacidad de Corte sugerida: promedio de unidades cortadas por día laboral (últimas 8 semanas)
// según los cortes registrados en ATLAS (pedidos_activos[].cortesRealizados: fecha, totalUnidades).
export function capacidadCorteSugerida(pedidosAtlas, hoyISO, diasLaborales = [1, 2, 3, 4, 5]) {
  const desde = sumarDias(hoyISO, -56);
  let total = 0;
  (pedidosAtlas || []).forEach((p) => (p.cortesRealizados || []).forEach((c) => {
    const f = soloFecha(c.fecha);
    if (f && f >= desde && f <= hoyISO) total += NUM(c.totalUnidades);
  }));
  let laborales = 0;
  for (let i = 0; i < 56; i++) {
    const dow = new Date(`${sumarDias(hoyISO, -i)}T00:00:00Z`).getUTCDay();
    if (diasLaborales.includes(dow)) laborales += 1;
  }
  return laborales ? Math.max(0, Math.round(total / laborales)) : 0;
}

// Reparte inventario y órdenes de compra entre los pedidos (primero el despacho más cercano).
// grupos: salida de lineasDeSinCortar · fichas: Map(`${ref}|${pinta}` → ficha de getFichaMaterialesBusint)
// oc: salida de ocPorCodigo (se consume al asignar: genera una nueva en cada cálculo)
// Devuelve Map(key del pedido → { estado, tandas:[{unid, disponibleISO|null}], bloqueadas, disponibleISO,
//   sinOC, faltan:[nombres], texto, aprox, sinDato })
export function repartirMaterialSinCortar({ grupos, fichas, oc, hoyISO, diasSinOC = 15 }) {
  const sinOCISO = sumarDias(hoyISO, Math.max(0, NUM(diasSinOC)));
  const orden = [...grupos].sort((a, b) => (soloFecha(a.fechaDespacho) || "9999").localeCompare(soloFecha(b.fechaDespacho) || "9999") || String(a.key).localeCompare(String(b.key)));
  const stock = new Map(); // clave de material → existencia que queda
  const resultado = new Map();
  const PESO = { ok: 0, oc: 1, comprar: 2 };

  // Órdenes de compra de una lista de códigos (sin repetir la misma entrega), por fecha.
  const ocDe = (cods) => {
    const vistos = new Set();
    const lista = [];
    (cods || []).forEach((c) => (oc.get(String(c).trim()) || []).forEach((o) => { if (!vistos.has(o)) { vistos.add(o); lista.push(o); } }));
    return lista.sort((a, b) => a.ff.localeCompare(b.ff));
  };
  // Cubre `necesito` con lo que hay: devuelve la fecha desde la que hay material.
  const cubrir = (clave, existencia, necesito, cods) => {
    if (!stock.has(clave)) stock.set(clave, Math.max(0, NUM(existencia)));
    const usa = Math.min(necesito, stock.get(clave));
    stock.set(clave, stock.get(clave) - usa);
    let falta = necesito - usa;
    if (falta <= 0.005) return { fecha: null, tipo: "ok" };
    let fecha = hoyISO;
    for (const o of ocDe(cods)) {
      if (falta <= 0.005) break;
      if (o.resto <= 0) continue;
      const toma = Math.min(o.resto, falta);
      o.resto -= toma; falta -= toma;
      if (o.ff > fecha) fecha = o.ff;
    }
    if (falta > 0.005) return { fecha: sinOCISO, tipo: "comprar" };
    return { fecha, tipo: "oc" };
  };

  orden.forEach((g) => {
    let peor = "ok";
    let sinOC = false;
    let sinFicha = false;
    let sinDato = 0;
    const faltan = new Set();
    const porFecha = new Map(); // fecha|"" → unidades
    g.lineas.forEach((ln) => {
      const ficha = fichas.get(`${String(g.ref).trim()}|${ln.pinta}`);
      if (!ficha || (!ficha.tieneTelas && !ficha.tieneInsumos)) {
        sinFicha = true;
        porFecha.set("", (porFecha.get("") || 0) + ln.unid);
        return;
      }
      let fechaLinea = null;
      (ficha.telas || []).forEach((t) => {
        const tipo = tipoUnidadTela(t.unidad);
        const existencia = tipo === "m" ? t.stockMl : tipo === "m2" ? t.stockM2 : null;
        if (t.motivo !== "ok" || existencia === null || existencia === undefined || !(NUM(t.consumo) > 0)) { sinDato += 1; return; }
        const r = cubrir(`T|${t.nombre}|${t.color || "?"}|${tipo}`, existencia, ln.unid * NUM(t.consumo), [t.codcomp]);
        if (PESO[r.tipo] > PESO[peor]) peor = r.tipo;
        if (r.tipo !== "ok") {
          faltan.add(`${t.nombre}${t.color ? " " + t.color : ""}`);
          if (r.tipo === "comprar") sinOC = true;
          if (!fechaLinea || r.fecha > fechaLinea) fechaLinea = r.fecha;
        }
      });
      (ficha.insumos || []).forEach((ins) => {
        if (!ins.material || !(NUM(ins.cant) > 0)) return;
        const inv = ins.inventario || {};
        const r = cubrir(`I|${claveInsumo(ins.insumo)}`, inv.cantidad, ln.unid * NUM(ins.cant), inv.codcomps || []);
        if (PESO[r.tipo] > PESO[peor]) peor = r.tipo;
        if (r.tipo !== "ok") {
          faltan.add(ins.insumo);
          if (r.tipo === "comprar") sinOC = true;
          if (!fechaLinea || r.fecha > fechaLinea) fechaLinea = r.fecha;
        }
      });
      porFecha.set(fechaLinea || "", (porFecha.get(fechaLinea || "") || 0) + ln.unid);
    });
    const tandas = [...porFecha.entries()].map(([f, unid]) => ({ unid, disponibleISO: f || null }));
    const bloqueadas = tandas.filter((t) => t.disponibleISO && t.disponibleISO > hoyISO).reduce((s, t) => s + t.unid, 0);
    const disponibleISO = tandas.reduce((m, t) => (t.disponibleISO && t.disponibleISO > (m || "") ? t.disponibleISO : m), null);
    const nombres = [...faltan];
    let estado = peor === "comprar" ? "comprar" : peor === "oc" ? "oc_ok" : "ok";
    if (sinFicha && !nombres.length && estado === "ok" && g.lineas.every((ln) => !fichas.get(`${String(g.ref).trim()}|${ln.pinta}`))) estado = "sin_ficha";
    resultado.set(g.key, {
      estado,
      tandas,
      bloqueadas,
      disponibleISO: nombres.length ? disponibleISO : null,
      sinOC,
      faltan: nombres,
      sinDato,
      aprox: !!g.aprox,
      texto: nombres.length ? `${nombres.slice(0, 2).join(", ")}${nombres.length > 2 ? ` y ${nombres.length - 2} más` : ""}` : "",
    });
  });
  return resultado;
}
