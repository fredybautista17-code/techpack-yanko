{ key: "numLote", label: "Num Lote" },
{ key: "referencia", label: "Referencia" },
{ key: "planta", label: "Planta" },
{ key: "categoria", label: "Categoría" },
{ key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
{ key: "fechaEntregaConf", label: "Fecha Entrega Conf.", render: (f) => fmtFechaISO(f.fechaEntregaConf) },
]}
filas={filasSemanaSel}
/>
</Modal>
)}
<div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "auto", maxHeight: 560 }}>
<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
<thead>
<tr style={{ background: C.ink, position: "sticky", top: 0 }}>
{["Lote", "Referencia", "Planta", "Categoría"].map((h) => (
<th key={h} style={{ padding: "8px 10px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
))}
{semanas.map((s) => (
<th
key={s}
onClick={() => setSemanaSel(s)}
title="Ver lotes de esta semana"
style={{ padding: "8px 10px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
>
{fmtFechaISO(s)}
</th>
))}
<th style={{ padding: "8px 10px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>Total Unid.</th>
</tr>
</thead>
<tbody>
{filas.map((f, i) => (
<tr key={`${f.numLote}-${i}`} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
<td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{f.numLote}</td>
<td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{f.referencia}</td>
<td style={{ padding: "6px 10px" }}>{f.planta}</td>
<td style={{ padding: "6px 10px" }}>{f.categoria}</td>
{semanas.map((s) => (
<td key={s} style={{ padding: "6px 10px", textAlign: "right", fontWeight: f.semana === s ? 700 : 400, color: f.semana === s ? C.ink : C.slate }}>
{f.semana === s ? fmtNum(f.unidades) : ""}
</td>
))}
<td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>{fmtNum(f.unidades)}</td>
</tr>
))}
</tbody>
<tfoot>
<tr style={{ background: "#DDEBF7" }}>
<td colSpan={4} style={{ padding: "7px 10px", fontWeight: 800 }}>TOTAL UNIDADES / SEMANA</td>
{totalPorSemana.map((t, i) => (
<td key={i} style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(t)}</td>
))}
<td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(filas.reduce((s, f) => s + f.unidades, 0))}</td>
</tr>
<tr style={{ background: "#DDEBF7" }}>
<td colSpan={4} style={{ padding: "7px 10px", fontWeight: 800 }}>TOTAL LOTES / SEMANA</td>
{lotesPorSemana.map((t, i) => (
<td key={i} style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(t)}</td>
))}
<td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtNum(filas.length)}</td>
</tr>
</tfoot>
</table>
</div>
</div>
);
}
// Informe "BPT": resumen por cliente (Lotes/Unidades) arriba, y detalle por
// lote (Cliente/Num Lote/Referencia/Cantidad/Días en BPT) abajo, ordenado
// por más días primero para ver de inmediato lo que lleva más tiempo ahí.
function BloqueBPT({ data }) {
const { filas, resumen, totalLotes, totalUnidades } = data;
return (
<div>
{resumen.length > 0 && (
<div style={{ marginBottom: 20 }}>
<div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>RESUMEN POR CLIENTE</div>
<div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
<thead>
<tr style={{ background: C.ink }}>
<th style={{ padding: "9px 12px", color: C.seam, textAlign: "left", fontWeight: 700, fontSize: 10 }}>Cliente</th>
<th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Lotes</th>
<th style={{ padding: "9px 12px", color: C.seam, textAlign: "right", fontWeight: 700, fontSize: 10 }}>Unidades</th>
</tr>
</thead>
<tbody>
{resumen.map((r, i) => (
<tr key={r.cliente} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
<td style={{ padding: "7px 12px" }}>{r.cliente}</td>
<td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.lotes)}</td>
<td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.unidades)}</td>
</tr>
))}
</tbody>
<tfoot>
<tr style={{ background: "#FFF2CC" }}>
<td style={{ padding: "8px 12px", fontWeight: 800, color: C.ink }}>TOTAL EN BPT</td>
<td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalLotes)}</td>
<td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right", color: C.ink }}>{fmtNum(totalUnidades)}</td>
</tr>
</tfoot>
</table>
</div>
</div>
)}
<div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>DETALLE POR LOTE</div>
<Tabla
vacio="Sin lotes en BPT."
columnas={[
{ key: "cliente", label: "Cliente" },
{ key: "numLote", label: "Num Lote", align: "right" },
{ key: "referencia", label: "Referencia" },
{ key: "categoria", label: "Categoría" },
{ key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
{ key: "diasEnBPT", label: "Días en BPT", align: "right", render: (f) => (f.diasEnBPT === null || f.diasEnBPT === undefined ? "—" : fmtNum(f.diasEnBPT)) },
]}
filas={filas}
/>
</div>
);
}
// ─── VISTA PRINCIPAL: INFORMES ─────────────────────────────────────────────────
const REPORTES = [
{ id: "en_planta", label: "En Planta", icon: "🏭" },
{ id: "semiterminado", label: "Semiterminado", icon: "🧶" },
{ id: "bpt", label: "BPT", icon: "🏷" },
{ id: "por_cliente", label: "Por Cliente", icon: "🤝" },
{ id: "cliente_agrupado", label: "Cliente Agrupado", icon: "🏢" },
{ id: "cronograma", label: "Cronograma Entrega", icon: "📅" },
{ id: "por_pedido", label: "Por Pedido", icon: "📦" },
{ id: "bmp", label: "BMP", icon: "🧵" },
{ id: "programacion_yanko", label: "Programación Yanko", icon: "🎯" },
];
function InformesView({ cargas, onAddCarga, onDeleteCarga, isAdmin }) {
const [showUpload, setShowUpload] = useState(false);
const [cargaId, setCargaId] = useState(null);
const [tab, setTab] = useState("en_planta");
// Ordena por `creadoEn` (timestamp completo con hora) cuando existe, para
// que dos cargas del mismo día queden en el orden real en que se subieron
// — antes solo se ordenaba por `fecha` (solo día), así que el orden entre
// cargas del mismo día no era confiable.
const cargasOrdenadas = [...cargas].sort(
(a, b) => (b.creadoEn || b.fecha).localeCompare(a.creadoEn || a.fecha)
);
const cargaActiva = cargaId ? cargasOrdenadas.find((c) => c.id === cargaId) || cargasOrdenadas[0] : cargasOrdenadas[0];
const lotes = useMemo(() => cargaActiva?.lotes || [], [cargaActiva]);
const reporteSemiterminado = useMemo(() => generarSeguimientoSemiterminado(lotes), [lotes]);
const reportePlanta = useMemo(() => generarAgrupadoPlanta(lotes, "nombrePlanta"), [lotes]);
const reporteCliente = useMemo(() => generarAgrupadoPlanta(lotes, "nombreCliente"), [lotes]);
const reporteClienteAgrupado = useMemo(() => generarAgrupadoPlanta(lotes, "clienteAgrupado"), [lotes]);
const reporteCronograma = useMemo(() => generarCronograma(lotes), [lotes]);
const reportePorPedido = useMemo(() => generarPorPedido(lotes), [lotes]);
const reporteBMP = useMemo(() => generarBMP(lotes), [lotes]);
const reporteBPT = useMemo(() => generarBPT(lotes), [lotes]);
const reporteYanko = useMemo(() => generarProgramacionYanko(lotes), [lotes]);
const kpis = useMemo(
() => ({
total: lotes.length,
enPlanta: lotes.filter((l) => l.invPlanta > 0).length,
enBMP: lotes.filter((l) => l.invBMP > 0).length,
enSemiterminado: lotes.filter((l) => l.invSemiterminado > 0).length,
vencidos: lotes.filter((l) => l.fechaEntregaPedidoISO && diasEntre(l.fechaEntregaPedidoISO) < 0).length,
}),
[lotes]
);
async function exportarExcel() {
const XLSX = await import("xlsx");
const wb = XLSX.utils.book_new();
// "Informe de Seguimiento": dashboard con KPIs + resumen por proceso (con
// % de unidades) + detalle de lotes lado a lado, en vez de la antigua
// hoja plana "Informe Semiterminado".
{
const { filas: segFilas, resumen: segResumen, totalLotes: segTotalLotes, totalUnidades: segTotalUnidades, procesosDistintos: segProcesos } = reporteSemiterminado;
const resumenRows = [
["Proceso Donde Quedó", "Lotes", "Unidades", "% Unidades"],
...segResumen.map((r) => [r.proceso, r.lotes, r.unidades, `${Math.round(r.pct * 100)}%`]),
["TOTAL", segTotalLotes, segTotalUnidades, "100%"],
];
const detalleRows = [
["Proceso Donde Quedó", "Num Lote", "Referencia", "Categoría", "Unidades", "Última Salida"],
...segFilas.map((f) => [f.procesoDondeQuedo, f.numLote, f.referencia, f.categoria, f.unidades, f.ultimaSalida]),
];
const maxRows = Math.max(resumenRows.length, detalleRows.length);
const combined = [];
for (let i = 0; i < maxRows; i++) {
const left = resumenRows[i] || ["", "", "", ""];
const right = detalleRows[i] || ["", "", "", "", "", ""];
combined.push([...left, "", ...right]);
}
XLSX.utils.book_append_sheet(
wb,
XLSX.utils.aoa_to_sheet([
["DASHBOARD DE SEGUIMIENTO — SEMITERMINADO POR PROCESO"],
["Lotes en semiterminado agrupados por el proceso donde quedaron (Hoja1)"],
[],
["Total Lotes", "Total Unidades", "Procesos Distintos"],
[segTotalLotes, segTotalUnidades, segProcesos],
[],
["RESUMEN POR PROCESO", "", "", "", "", "DETALLE DE LOTES POR PROCESO"],
...combined,
]),
"Informe de Seguimiento"
);
}
function hojaAgrupada(nombreHoja, primeraCol, data) {
const filas = [
[primeraCol, "Categoría", "Num Lote", "Referencia", "Cant. en Planta"],
...data.filas.map((f) => [f.grupo, f.categoria, f.numLote, f.referencia, f.cantidad]),
[],
["RESUMEN POR " + primeraCol.toUpperCase()],
[primeraCol, "Lotes", "Unidades"],
...data.resumen.map((r) => [r.grupo, r.lotes, r.unidades]),
["TOTAL EN PLANTA", data.totalLotes, data.totalUnidades],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombreHoja);
}
hojaAgrupada("Informe En Planta", "Nombre Planta", reportePlanta);
hojaAgrupada("Informe Por Cliente", "Nombre Cliente", reporteCliente);
hojaAgrupada("Informe Cliente Agrupado", "Cliente Agrupado", reporteClienteAgrupado);
const semanas = reporteCronograma.semanas;
const filasCron = reporteCronograma.filas.map((f) => {
const row = [f.numLote, f.referencia, f.planta, f.categoria];
semanas.forEach((s) => row.push(f.semana === s ? f.unidades : ""));
row.push(f.unidades);
return row;
});
const totalPorSemana = semanas.map((s) => reporteCronograma.filas.filter((f) => f.semana === s).reduce((sum, f) => sum + f.unidades, 0));
const lotesPorSemana = semanas.map((s) => reporteCronograma.filas.filter((f) => f.semana === s).length);
XLSX.utils.book_append_sheet(
wb,
XLSX.utils.aoa_to_sheet([
["Lote", "Referencia", "Planta", "Categoría", ...semanas.map(fmtFechaISO), "Total Unid."],
...filasCron,
["TOTAL UNIDADES / SEMANA", "", "", "", ...totalPorSemana, reporteCronograma.filas.reduce((s, f) => s + f.unidades, 0)],
["TOTAL LOTES / SEMANA", "", "", "", ...lotesPorSemana, reporteCronograma.filas.length],
]),
"Cronograma Entrega"
);
XLSX.utils.book_append_sheet(
wb,
XLSX.utils.aoa_to_sheet([
["Num Pedido", "Num Lote", "Referencia", "Categoría", "Nombre Planta", "Ubicación Actual", "Unidades", "Fecha Entrega Conf", "Fecha Entrega Pedido", "Días Restantes", "Estado"],
...reportePorPedido.map((r) => [
r.numPedido, r.numLote, r.referencia, r.categoria, r.nombrePlanta, r.ubicacionActual, r.unidades,
fmtFechaISO(r.fechaEntregaConf), fmtFechaISO(r.fechaEntregaPedido), r.diasRestantes, r.estado,
]),
]),
"Informe Por Pedido"
);
XLSX.utils.book_append_sheet(
wb,
XLSX.utils.aoa_to_sheet([
["Categoría", "Cliente", "Referencia", "Num Lote", "Cantidad BMP", "Fecha Corte", "Días para Corte", "Fecha Entrega Pedido", "Días Rest. Pedido"],
...reporteBMP.map((r) => [
r.categoria, r.cliente, r.referencia, r.numLote, r.cantidadBMP,
fmtFechaISO(r.fechaCorte), r.diasParaCorte, fmtFechaISO(r.fechaEntregaPedido), r.diasRestantesPedido,
]),
]),
"Informe BMP"
);
XLSX.utils.book_append_sheet(
wb,
XLSX.utils.aoa_to_sheet([
["Cliente", "Num Lote", "Referencia", "Categoría", "Cantidad", "Fecha Ent. BPT", "Días en BPT"],
...reporteBPT.filas.map((f) => [f.cliente, f.numLote, f.referencia, f.categoria, f.cantidad, fmtFechaISO(f.fechaEntBPT), f.diasEnBPT]),
[],
["RESUMEN POR CLIENTE"],
["Cliente", "Lotes", "Unidades"],
...reporteBPT.resumen.map((r) => [r.cliente, r.lotes, r.unidades]),
["TOTAL EN BPT", reporteBPT.totalLotes, reporteBPT.totalUnidades],
]),
"Informe BPT"
);
const totalKamila = reporteYanko.comparacion.reduce(
(acc, r) => ({
plantaUnid: acc.plantaUnid + r.plantaUnid,
plantaLotes: acc.plantaLotes + r.plantaLotes,
bmpUnid: acc.bmpUnid + r.bmpUnid,
bmpLotes: acc.bmpLotes + r.bmpLotes,
total: acc.total + r.total,
}),
{ plantaUnid: 0, plantaLotes: 0, bmpUnid: 0, bmpLotes: 0, total: 0 }
);
XLSX.utils.book_append_sheet(
wb,
XLSX.utils.aoa_to_sheet([
["Categoría", "Num Pedido", "Num Lote", "Referencia", "Cantidad", "Fecha Entrega Pedido", "Días Restantes"],
...reporteYanko.filas.map((r) => [r.categoria, r.numPedido, r.numLote, r.referencia, r.cantidad, fmtFechaISO(r.fechaEntregaPedido), r.diasRestantes]),
[],
[],
["COMPARACIÓN KAMILA — PLANTA vs BMP"],
["Categoría", "Planta Unid", "Lotes Planta", "BMP Unid", "Lotes BMP", "Total Unid"],
...reporteYanko.comparacion.map((r) => [r.categoria, r.plantaUnid, r.plantaLotes, r.bmpUnid, r.bmpLotes, r.total]),
["TOTAL KAMILA", totalKamila.plantaUnid, totalKamila.plantaLotes, totalKamila.bmpUnid, totalKamila.bmpLotes, totalKamila.total],
]),
"Programación Planta Yanko"
);
XLSX.writeFile(wb, `Informes_Planta_${cargaActiva.fecha}.xlsx`);
}
return (
<div>
{showUpload && (
<SubirHoja1Modal
onConfirm={(lotesNuevos) => {
const nuevaCarga = { id: uid(), fecha: today(), lotes: lotesNuevos, creadoEn: new Date().toISOString() };
onAddCarga(nuevaCarga);
setCargaId(nuevaCarga.id);
}}
onClose={() => setShowUpload(false)}
/>
)}
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
<div>
<h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Informes</h2>
<p style={{ margin: "4px 0 0", fontSize: 13, color: C.slate }}>
{cargaActiva
? `Carga del ${cargaActiva.fecha}${cargaActiva.creadoEn ? ` · Actualizado ${fmtFechaHora(cargaActiva.creadoEn)}` : ""}`
: "Sin cargas de Hoja1 todavía"}
</p>
</div>
<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
{cargasOrdenadas.length > 1 && (
<select
value={cargaActiva?.id || ""}
onChange={(e) => setCargaId(e.target.value)}
style={{ padding: "8px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.ink, background: C.white, outline: "none", fontFamily: "inherit" }}
>
{cargasOrdenadas.map((c) => (
<option key={c.id} value={c.id}>
Carga {c.fecha}
{c.creadoEn ? ` · ${fmtFechaHora(c.creadoEn).split(" ")[1]}` : ""}
</option>
))}
</select>
)}
{cargaActiva && (
<Btn variant="secondary" onClick={exportarExcel}>📤 Exportar Excel</Btn>
)}
<Btn variant="danger" onClick={() => setShowUpload(true)}>📥 Subir Hoja1</Btn>
{isAdmin && cargaActiva && (
<button
onClick={() => onDeleteCarga(cargaActiva.id)}
title="Eliminar esta carga"
style={{ background: C.redBg, border: "none", borderRadius: 8, padding: "9px 12px", color: C.red, fontWeight: 700, cursor: "pointer" }}
>
🗑
</button>
)}
</div>
</div>
{!cargaActiva ? (
<div style={{ textAlign: "center", padding: 48, color: C.slate, fontSize: 14 }}>
Aún no has subido ninguna Hoja1. Usa "Subir Hoja1" para generar el primer set de informes.
</div>
) : (
<>
<div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
<KPI icon="📦" label="Total lotes" value={fmtNum(kpis.total)} color={C.ink} bg={C.canvas} />
<KPI icon="🏭" label="En Planta" value={fmtNum(kpis.enPlanta)} color={C.green} bg={C.greenBg} />
<KPI icon="🧵" label="En BMP" value={fmtNum(kpis.enBMP)} color={C.amber} bg={C.amberBg} />
<KPI icon="🧶" label="Semiterminado" value={fmtNum(kpis.enSemiterminado)} color={C.violet} bg={C.violetBg} />
<KPI icon="⚠" label="Pedidos vencidos" value={fmtNum(kpis.vencidos)} color={C.red} bg={C.redBg} />
</div>
<div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
{REPORTES.map((r) => (
<button
key={r.id}
onClick={() => setTab(r.id)}
style={{
padding: "8px 14px",
borderRadius: 20,
border: `1.5px solid ${tab === r.id ? C.ink : C.border}`,
background: tab === r.id ? C.ink : C.white,
color: tab === r.id ? C.white : C.ink,
fontWeight: 700,
fontSize: 12,
cursor: "pointer",
whiteSpace: "nowrap",
}}
>
{r.icon} {r.label}
</button>
))}
</div>
{tab === "semiterminado" && <BloqueSeguimientoSemiterminado data={reporteSemiterminado} />}
{tab === "bpt" && <BloqueBPT data={reporteBPT} />}
{tab === "en_planta" && <BloqueAgrupado titulo="Planta" primeraColLabel="Nombre Planta" data={reportePlanta} mostrarFechaEntrega />}
{tab === "por_cliente" && <BloqueAgrupado titulo="Cliente" primeraColLabel="Nombre Cliente" data={reporteCliente} />}
{tab === "cliente_agrupado" && <BloqueAgrupado titulo="Cliente Agrupado" primeraColLabel="Cliente Agrupado" data={reporteClienteAgrupado} />}
{tab === "cronograma" && <BloqueCronograma data={reporteCronograma} />}
{tab === "por_pedido" && (
<Tabla
vacio="Sin pedidos."
columnas={[
{ key: "numPedido", label: "Num Pedido" },
{ key: "numLote", label: "Num Lote" },
{ key: "referencia", label: "Referencia" },
{ key: "categoria", label: "Categoría" },
{ key: "nombrePlanta", label: "Nombre Planta", render: (f) => f.nombrePlanta || "—" },
{ key: "ubicacionActual", label: "Ubicación Actual" },
{ key: "unidades", label: "Unidades", align: "right", render: (f) => fmtNum(f.unidades) },
{ key: "fechaEntregaConf", label: "Fecha Entrega Conf", render: (f) => fmtFechaISO(f.fechaEntregaConf) || "—" },
{ key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
{ key: "diasRestantes", label: "Días Restantes", align: "right", render: (f) => (f.diasRestantes ?? "—"), color: (f) => (f.diasRestantes < 0 ? C.red : C.ink) },
{ key: "estado", label: "Estado", render: (f) => <EstadoBadge estado={f.estado} /> },
]}
filas={reportePorPedido}
/>
)}
{tab === "bmp" && (
<Tabla
vacio="Sin lotes en BMP."
columnas={[
{ key: "categoria", label: "Categoría" },
{ key: "cliente", label: "Cliente" },
{ key: "referencia", label: "Referencia" },
{ key: "numLote", label: "Num Lote" },
{ key: "cantidadBMP", label: "Cantidad BMP", align: "right", render: (f) => fmtNum(f.cantidadBMP) },
{ key: "fechaCorte", label: "Fecha Corte", render: (f) => fmtFechaISO(f.fechaCorte) || "—" },
{ key: "diasParaCorte", label: "Días para Corte", align: "right", render: (f) => (f.diasParaCorte ?? "—"), color: (f) => (f.diasParaCorte < 0 ? C.red : C.ink) },
{ key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
{ key: "diasRestantesPedido", label: "Días Rest. Pedido", align: "right", render: (f) => (f.diasRestantesPedido ?? "—"), color: (f) => (f.diasRestantesPedido < 0 ? C.red : C.ink) },
]}
filas={reporteBMP}
/>
)}
{tab === "programacion_yanko" && (
<div>
<Tabla
vacio="Sin lotes en Industrias Yanko Módulo Centro."
columnas={[
{ key: "categoria", label: "Categoría" },
{ key: "numPedido", label: "Num Pedido" },
{ key: "numLote", label: "Num Lote" },
{ key: "referencia", label: "Referencia" },
{ key: "cantidad", label: "Cantidad", align: "right", render: (f) => fmtNum(f.cantidad) },
{ key: "fechaEntregaPedido", label: "Fecha Entrega Pedido", render: (f) => fmtFechaISO(f.fechaEntregaPedido) || "—" },
{ key: "diasRestantes", label: "Días Restantes", align: "right", render: (f) => (f.diasRestantes ?? "—"), color: (f) => (f.diasRestantes < 0 ? C.red : C.ink) },
]}
filas={reporteYanko.filas}
/>
{reporteYanko.comparacion.length > 0 && (
<div style={{ marginTop: 24 }}>
<div style={{ fontWeight: 800, fontSize: 13, color: C.ink, marginBottom: 10 }}>COMPARACIÓN KAMILA — PLANTA vs BMP</div>
<div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
<thead>
<tr style={{ background: C.ink }}>
{["Categoría", "Planta Unid", "Lotes Planta", "BMP Unid", "Lotes BMP", "Total Unid"].map((h) => (
<th key={h} style={{ padding: "9px 12px", color: C.seam, textAlign: h === "Categoría" ? "left" : "right", fontWeight: 700, fontSize: 10 }}>{h}</th>
))}
</tr>
</thead>
<tbody>
{reporteYanko.comparacion.map((r, i) => (
<tr key={r.categoria} style={{ background: i % 2 === 0 ? C.canvas : C.white, borderBottom: `1px solid ${C.border}` }}>
<td style={{ padding: "7px 12px" }}>{r.categoria}</td>
<td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.plantaUnid)}</td>
<td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.plantaLotes)}</td>
<td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.bmpUnid)}</td>
<td style={{ padding: "7px 12px", textAlign: "right" }}>{fmtNum(r.bmpLotes)}</td>
<td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700 }}>{fmtNum(r.total)}</td>
</tr>
                       
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#FFF2CC" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 800 }}>TOTAL KAMILA</td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.plantaUnid, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.plantaLotes, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.bmpUnid, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.bmpLotes, 0))}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 800, textAlign: "right" }}>
                            {fmtNum(reporteYanko.comparacion.reduce((s, r) => s + r.total, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
// ─── HOME PLANEACIÓN ────────────────────────────────────────────────────────────
function HomePlaneacion({ onGoInformes }) {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.ink }}>📋 Planeación</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: C.slate }}>Informes de producción de Industrias Yanko</p>
      </div>
      <div
        onClick={onGoInformes}
        style={{ background: C.white, borderRadius: 14, padding: 22, border: `1.5px solid ${C.border}`, cursor: "pointer", maxWidth: 320, transition: "all 0.2s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = C.blue; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = C.border; }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 12, background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 14 }}>📊</div>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 6 }}>Informes</div>
        <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.5, marginBottom: 12 }}>
          Sube la Hoja1 y genera Semiterminado, En Planta, Por Cliente, Cronograma de Entrega, Por Pedido, BMP y Programación Yanko.
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>Entrar →</div>
      </div>
    </div>
  );
}
// ─── ROOT MÓDULO PLANEACIÓN ─────────────────────────────────────────────────────
export default function ModuloPlaneacion({ currentUser, onVolver, onLogout }) {
  const [subView, setSubView] = useState("informes");
  const [cargas, setCargas] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planeacion_cargas"), (snap) => {
      setCargas(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setLoading(false);
    });
    return () => unsub();
  }, []);
  async function addCarga(carga) {
    setCargas((cs) => [...cs, carga]);
    await fsSave("planeacion_cargas", carga.id, carga);
  }
  async function deleteCarga(id) {
    setCargas((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("planeacion_cargas", id);
  }
  const isAdmin = currentUser?.isAdmin;
  const NAV = [
    { id: "home", icon: "◉", label: "Inicio" },
    { id: "informes", icon: "📊", label: "Informes" },
  ];
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.canvas }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ color: C.slate }}>Cargando Planeación...</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, fontFamily: "'Inter',-apple-system,sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ width: 220, background: C.ink, padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.white }}>📋 Planeación</div>
          <div style={{ fontSize: 10, color: C.seam, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>Industrias Yanko</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#2A2A45", borderRadius: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${C.seam},#9E8870)`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.ink, flexShrink: 0,
            }}
          >
            {(currentUser?.name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name}</div>
            <div style={{ fontSize: 10, color: C.seam }}>{currentUser?.role}</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((item) => {
            const active = subView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSubView(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer",
                  background: active ? "#C8B8A2" : "transparent", color: active ? C.ink : "#8888AA", fontWeight: active ? 800 : 500, fontSize: 13, textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
          {onVolver && (
            <button
              onClick={onVolver}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "rgba(200,184,162,0.5)", fontWeight: 500, fontSize: 12, textAlign: "left", marginTop: 8 }}
            >
              ← Volver al Inicio
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "rgba(232,93,74,0.85)", fontWeight: 700, fontSize: 12, textAlign: "left", marginTop: onVolver ? 2 : 8 }}
            >
              ⏏ Cerrar sesión
            </button>
          )}
        </nav>
      </div>
      <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {subView === "home" && <HomePlaneacion onGoInformes={() => setSubView("informes")} />}
          {subView === "informes" && <InformesView cargas={cargas} onAddCarga={addCarga} onDeleteCarga={deleteCarga} isAdmin={isAdmin} />}
        </div>
      </div>
    </div>
  );
}
