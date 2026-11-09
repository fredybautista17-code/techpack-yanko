// (2026-11-09, a pedido de Fredy) Financiera · «Insumos y telas»: cuánto hay que tener cada mes para OPERAR la fábrica (comprar telas e insumos).
// No es endeudamiento: es la provisión de gasto, calculada con lo que realmente se compró (facturado en Busint, contabilidad_compras) se haya pagado o no,
// frente al presupuesto de Proyección. Lo que ya se compró y está sin pagar es deuda (Cuentas por Pagar). Solo lectura: los ajustes se recuerdan en el navegador
// y la Proyección de Deuda los usa para restar estas compras antes del dinero para proveedores.
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { C, caja, Tarjeta } from "./financiera-cuanto-pagar";
import { sumarMes } from "./financiera-cuanto-pagar-calculo";
import { BASES, necesidadOperar, llaveConcepto, CONCEPTOS_PLANTA } from "./financiera-insumos-calculo";
import { categoriasElegidas } from "./financiera-proyeccion-compras-calculo";
import { leerOpciones, guardarOpciones, useDeudaProveedores } from "./financiera-proyeccion-deuda";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const etq = (ym) => { const [a, m] = String(ym).split("-").map(Number); return `${MESES[m - 1]} ${a}`; };
const etqCorto = (ym) => { const [, m] = String(ym).split("-").map(Number); return MESES[m - 1].slice(0, 3); };
const money = (n) => (Number(n) < 0 ? "-$" : "$") + Math.round(Math.abs(Number(n) || 0)).toLocaleString("es-CO");
const fm = (n) => { const v = Math.round((Number(n) || 0) / 1e5) / 10; return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + " M"; };
const th = { padding: "7px 8px", fontSize: 10.5, fontWeight: 800, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
const td = { padding: "7px 8px", fontSize: 12.5, color: C.ink, textAlign: "right", borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const entrada = { padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff", color: C.ink };

export default function InsumosOperarView({ db }) {
  const ymHoy = useMemo(() => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 7), []);
  const [compras, setCompras] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [catLista, setCatLista] = useState([]);
  const [catPorConcepto, setCatPorConcepto] = useState([]);
  useEffect(() => {
    const e = () => {};
    const u = [
      onSnapshot(collection(db, "contabilidad_compras"), (s) => setCompras(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_presupuestos"), (s) => setPresupuestos(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_proyeccion_categorias_lista"), (s) => setCatLista(s.docs.map((d) => ({ ...d.data(), id: d.id }))), e),
      onSnapshot(collection(db, "contabilidad_proyeccion_categorias_concepto"), (s) => setCatPorConcepto(s.docs.map((d) => ({ ...d.data(), codConcep: d.id }))), e),
    ];
    return () => u.forEach((f) => f());
  }, [db]);
  const deuda = useDeudaProveedores(db);

  const [catsOperar, setCatsOperar] = useState(() => leerOpciones().catsOperar);
  const [conceptosFuera, setConceptosFuera] = useState(() => leerOpciones().conceptosFuera);
  const [baseK, setBaseK] = useState(() => leerOpciones().baseOperar);
  const [abiertas, setAbiertas] = useState({});
  useEffect(() => { guardarOpciones({ catsOperar, conceptosFuera, baseOperar: baseK }); }, [catsOperar, conceptosFuera, baseK]);

  const catsSel = categoriasElegidas(catsOperar, catLista);
  const nec = useMemo(
    () => necesidadOperar({ compras, presupuestos, categoriasLista: catLista, categoriasPorConcepto: catPorConcepto, catsSel, conceptosFuera, ymHoy, baseK }),
    [compras, presupuestos, catLista, catPorConcepto, catsSel, conceptosFuera, ymHoy, baseK]
  );
  const base = BASES.find((b) => b.k === baseK) || BASES[0];
  const alternarCategoria = (id) => setCatsOperar(catsSel.includes(id) ? catsSel.filter((x) => x !== id) : [...catsSel, id]);
  const alternarConcepto = (cod) => setConceptosFuera(conceptosFuera.includes(cod) ? conceptosFuera.filter((x) => x !== cod) : [...conceptosFuera, cod]);
  const maxHist = Math.max(1, ...nec.historia.map((h) => h.total), nec.totalNecesito);
  const mesAnterior = sumarMes(ymHoy, -1);
  const dif = nec.totalUltimo - nec.totalPresupuestado;
  const hayPlantaFuera = conceptosFuera.some((c) => CONCEPTOS_PLANTA.includes(c));

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 21, fontWeight: 900, color: C.ink }}>Insumos y telas</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3, maxWidth: 860, lineHeight: 1.5 }}>
          Cuánto necesitas cada mes para <b>operar la fábrica</b> comprando telas e insumos. Se calcula con lo que realmente <b>compraste</b> (facturado en Busint), lo hayas pagado o no: es la provisión de gasto, no endeudamiento. Lo que ya compraste y no has pagado es deuda y sale de Cuentas por Pagar.
        </div>
      </div>

      {nec.sinDatos ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>Todavía no hay compras reales de meses cerrados cargadas en Contabilidad: sin ellas no puedo calcular lo que necesitas. Mientras tanto la Proyección de Deuda usa el presupuesto de Proyección.</div> : null}
      {!nec.sinDatos && nec.ultimo !== mesAnterior ? <div style={{ background: C.amberBg, color: C.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 10 }}>El último mes con compras cargadas es {etq(nec.ultimo)}; falta {etq(mesAnterior)}. Cárgalo en Contabilidad para que el cálculo use el mes más reciente.</div> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Tarjeta titulo="Necesito al mes para operar" valor={fm(nec.totalNecesito)} fondo={C.blueBg} colorValor={C.blue} sub={nec.sinDatos ? "Sin compras reales" : `${base.txt}: ${nec.usados.map(etq).join(", ")}`} />
        <Tarjeta titulo={`Comprado en ${nec.ultimo ? etq(nec.ultimo) : "el último mes"}`} valor={fm(nec.totalUltimo)} sub={nec.totalPresupuestado > 0 ? `Presupuestado ${fm(nec.totalPresupuestado)} · ${dif > 0 ? "te pasaste" : "quedaste"} ${fm(Math.abs(dif))}${dif > 0 ? "" : " por debajo"}` : "Sin presupuesto de ese mes en Proyección"} colorValor={dif > 0 ? C.red : C.ink} />
        <Tarjeta titulo="Ya debo a proveedores · vencido" valor={deuda ? fm(deuda.vencido) : "—"} fondo={deuda && deuda.vencido > 0 ? C.redBg : undefined} sub={deuda ? `Cuentas por Pagar de Yanko, corte del ${deuda.fechaCorte}` : "No hay corte de Cuentas por Pagar de Yanko"} />
        <Tarjeta titulo="Vence en 30 días" valor={deuda ? fm(deuda.dentro) : "—"} sub="Después de lo vencido (todos los proveedores)" />
      </div>

      <div style={{ ...caja, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>¿Con qué calculo lo que necesitas?</div>
          <div style={{ flex: 1 }} />
          <select value={baseK} onChange={(e) => setBaseK(e.target.value)} style={entrada}>
            {BASES.map((b) => <option key={b.k} value={b.k}>{b.txt}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11.5, color: C.slate, lineHeight: 1.5 }}>
          Marca abajo las categorías que cuentan como insumos y telas (por defecto, «Telas e insumos de confección»). Toca una categoría para ver sus conceptos y quitar los que no quieras contar. Esto lo usa la Proyección de Deuda para restar las compras futuras antes del dinero para proveedores.
        </div>
        {hayPlantaFuera ? <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4, lineHeight: 1.5 }}>Los conceptos <b>CHILA</b> (hilazas) y <b>REPUE</b> (repuestos de maquila) vienen sin contar porque ya entran como gastos de Planta. Si no los registras en Planta, márcalos de nuevo para que cuenten aquí.</div> : null}
      </div>

      <div style={{ ...caja, overflowX: "auto", marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Presupuesto contra lo real, por categoría{nec.ultimo ? <span style={{ fontWeight: 400, color: C.slate, fontSize: 12 }}> · {etq(nec.ultimo)}</span> : null}</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", width: 28 }} />
              <th style={{ ...th, textAlign: "left" }}>Categoría</th>
              <th style={th}>Presupuestado</th>
              <th style={th}>Real comprado</th>
              <th style={th}>Diferencia</th>
              {baseK !== "ultimo" ? <th style={th}>Necesito al mes</th> : null}
            </tr>
          </thead>
          <tbody>
            {nec.categorias.map((c) => {
              const d = c.ultimo - c.presupuestado;
              const abierta = !!abiertas[c.id || "_sin"];
              return (
                <React.Fragment key={c.id || "_sin"}>
                  <tr style={{ background: c.seleccionada ? C.blueBg : "transparent" }}>
                    <td style={{ ...td, textAlign: "left" }}><input type="checkbox" checked={c.seleccionada} onChange={() => alternarCategoria(c.id)} title="Cuenta como insumos y telas" /></td>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800, cursor: "pointer" }} onClick={() => setAbiertas((a) => ({ ...a, [c.id || "_sin"]: !abierta }))}>{abierta ? "▾" : "▸"} {c.label} <span style={{ fontWeight: 400, color: C.slate }}>({c.conceptos.length})</span></td>
                    <td style={td}>{c.presupuestado ? money(c.presupuestado) : "—"}</td>
                    <td style={td}>{c.ultimo ? money(c.ultimo) : "—"}</td>
                    <td style={{ ...td, fontWeight: 700, color: c.presupuestado && d > 0 ? C.red : c.presupuestado && d < 0 ? C.green : C.slate }}>{c.presupuestado || c.ultimo ? money(d) : "—"}</td>
                    {baseK !== "ultimo" ? <td style={td}>{c.real ? money(c.real) : "—"}</td> : null}
                  </tr>
                  {abierta ? c.conceptos.map((x) => {
                    const dc = x.ultimo - x.presupuestado;
                    return (
                      <tr key={llaveConcepto(x.codConcep, x.concepto)} style={{ opacity: x.fuera ? 0.55 : 1 }}>
                        <td style={{ ...td, textAlign: "left" }} />
                        <td style={{ ...td, textAlign: "left", paddingLeft: 22 }}><label style={{ cursor: "pointer" }}><input type="checkbox" checked={!x.fuera} onChange={() => alternarConcepto(x.codConcep)} title="Cuenta en lo que necesito" /> {x.concepto} <span style={{ color: C.slate, fontSize: 11 }}>({x.codConcep})</span></label></td>
                        <td style={td}>{x.presupuestado ? money(x.presupuestado) : "—"}</td>
                        <td style={td}>{x.ultimo ? money(x.ultimo) : "—"}</td>
                        <td style={{ ...td, color: x.presupuestado && dc > 0 ? C.red : x.presupuestado && dc < 0 ? C.green : C.slate }}>{x.presupuestado || x.ultimo ? money(dc) : "—"}</td>
                        {baseK !== "ultimo" ? <td style={td}>{x.real ? money(x.real) : "—"}</td> : null}
                      </tr>
                    );
                  }) : null}
                </React.Fragment>
              );
            })}
            {!nec.categorias.length ? <tr><td colSpan={6} style={{ ...td, textAlign: "left", color: C.slate }}>No hay compras ni presupuestos cargados.</td></tr> : null}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: C.slate, marginTop: 6, lineHeight: 1.5 }}>Real = compras facturadas en Busint (valor + IVA − retención), igual que en Proyección. Diferencia = real − presupuestado: en rojo te pasaste, en verde quedaste por debajo. Los conceptos sin marcar no suman.</div>
      </div>

      {nec.historia.length ? (
        <div style={{ ...caja }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>Lo comprado cada mes (categorías elegidas)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130, borderBottom: `1px solid ${C.border}`, position: "relative" }}>
            {nec.historia.map((h) => (
              <div key={h.ym} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <div style={{ fontSize: 10.5, color: C.slate, marginBottom: 2 }}>{fm(h.total)}</div>
                <div style={{ width: "62%", height: `${Math.max(2, (h.total / maxHist) * 100)}px`, background: C.blue, borderRadius: "4px 4px 0 0" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {nec.historia.map((h) => <div key={h.ym} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: C.slate, paddingTop: 4 }}>{etqCorto(h.ym)}</div>)}
          </div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>Lo que necesitas al mes con «{base.txt.toLowerCase()}»: <b style={{ color: C.ink }}>{money(nec.totalNecesito)}</b>.</div>
        </div>
      ) : null}
    </div>
  );
}
