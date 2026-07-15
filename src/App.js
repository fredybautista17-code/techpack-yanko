import React, { useState, useRef, useEffect, useCallback } from "react";
import ModuloCorte from "./modulo-corte";
import ModuloContabilidad from "./modulo-contabilidad";
import ModuloPlaneacion from "./modulo-planeacion";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyBDNvCaem-IbP0Z87eBt1pBtDy8sZdkEqc",
  authDomain: "techpack-yanko-f37b8.firebaseapp.com",
  projectId: "techpack-yanko-f37b8",
  storageBucket: "techpack-yanko-f37b8.firebasestorage.app",
  messagingSenderId: "700796768091",
  appId: "1:700796768091:web:5ab0db90c17390e6e7547e",
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
async function fsGet(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}
async function fsSave(col, id, data) {
  await setDoc(doc(db, col, id), data, { merge: true });
}
// A diferencia de fsSave (que espera el documento COMPLETO y por eso, si
// quien llama tiene una copia local desactualizada de campos que no está
// tocando, esos campos viejos pisan los datos reales de Firestore), fsUpdate
// solo escribe las llaves presentes en `patch` — el resto del documento
// (p.ej. "clientes" cuando solo se está cambiando "roles") queda intacto sin
// importar qué tan vieja esté la copia local del resto. Esto es lo que evita
// que guardar un cambio de roles/etapas/categorías borre la lista de
// clientes por una condición de carrera con otra pestaña/usuario.
async function fsUpdate(col, id, patch) {
  try {
    await updateDoc(doc(db, col, id), patch);
  } catch (e) {
    // El documento aún no existe (p.ej. antes de que termine de sembrarse) —
    // se crea con merge como respaldo, sin arriesgar el resto del documento.
    await setDoc(doc(db, col, id), patch, { merge: true });
  }
}
async function fsDelete(col, id) {
  await deleteDoc(doc(db, col, id));
}
async function fsBatch(col, items) {
  const batch = writeBatch(db);
  items.forEach((item) => batch.set(doc(db, col, item.id), item));
  await batch.commit();
}

async function exportHojaDeVidaXLSX(item, kind, capsulaName) {
  const XLSX = await import("xlsx");
  const fecha = new Date().toISOString().slice(0, 10);
  const titulo =
    kind === "proto"
      ? `Prototipo_${item.reference}`
      : `Ref_${item.reference}_${capsulaName || ""}`;
  const cliente = item.cliente || item.colores?.[0] || "—";
  const statusLabel = {
    aprobado: "Aprobado",
    declinado: "Declinado",
    en_proceso: "En proceso",
    en_revision: "En revisión",
    enviado_cotizacion: "En cotización",
    enviar_cliente: "Enviar al Cliente",
    enviado: "Enviado",
    recibido_cliente: "Recibido por Cliente",
    borrador: "Borrador",
  };
  const userObs = (item.observations || []).filter(
    (o) => o.type !== "update" && o.user !== "Sistema"
  );
  const wsData = [
    ["HOJA DE VIDA — TECHPACK YANKO", "", "", "", "", ""],
    [
      `${kind === "proto" ? "Prototipo" : "Referencia"} · ${item.reference}`,
      "",
      "",
      "",
      "",
      "",
    ],
    [
      `Exportado el ${new Date().toLocaleDateString("es-CO", {
        dateStyle: "long",
      })}`,
      "",
      "",
      "",
      "",
      "",
    ],
    ["", "", "", "", "", ""],
    ["DATOS GENERALES", "", "", "", "", ""],
    ["Nombre", item.name || "", "", "Ref", item.reference || "", ""],
    [
      "Categoría",
      item.categoria || "—",
      "",
      "Silueta",
      item.silueta || "—",
      "",
    ],
    ["Rango", item.rango || "—", "", "Cliente", cliente, ""],
    [
      "Tipo de Tela",
      item.tipoTela || "—",
      "",
      "Base de Moldería",
      item.baseMolderia || "—",
      "",
    ],
    [
      "Responsable",
      item.assignedTo || "—",
      "",
      "Estado",
      statusLabel[item.status] || item.status || "—",
      "",
    ],
    [
      "Fecha Creación",
      item.createdAt || "—",
      "",
      "Etapa actual",
      item.currentStage || "—",
      "",
    ],
    ...(kind === "ref"
      ? [["Cápsula", capsulaName || "—", "", "", "", ""]]
      : [["Promovido a Cápsula", item.promotedTo ? "Sí" : "No", "", "", "", ""]]),
    ["", "", "", "", "", ""],
    ["OBSERVACIONES Y MODIFICACIONES", "", "", "", "", ""],
    ["#", "Fecha", "Usuario", "Rol", "Observación", "Estado"],
    ...userObs.map((o, i) => [
      i + 1,
      o.date ? new Date(o.date).toLocaleString("es-CO") : "",
      o.user || "",
      o.role || "",
      o.text || "",
      o.done ? "✓ Resuelta" : "⏳ Pendiente",
    ]),
    ...(userObs.length === 0
      ? [["", "Sin observaciones registradas.", "", "", "", ""]]
      : []),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 4 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 5 } },
    {
      s: { r: wsData.length - userObs.length - 3, c: 0 },
      e: { r: wsData.length - userObs.length - 3, c: 5 },
    },
  ];
  const darkBg = { fgColor: { rgb: "1A1A2E" } };
  const jadeBg = { fgColor: { rgb: "EBF7F2" } };
  const jadeFg = { rgb: "2D9E6B" };
  const amberBg = { fgColor: { rgb: "FDF5E6" } };
  const amberFg = { rgb: "C47C1A" };
  const grayBg = { fgColor: { rgb: "F7F4F0" } };
  const borderThin = { style: "thin", color: { rgb: "E8E2DB" } };
  const allBorders = {
    top: borderThin,
    bottom: borderThin,
    left: borderThin,
    right: borderThin,
  };
  function styleCell(addr, fill, fontColor, bold, sz, align) {
    if (!ws[addr]) return;
    ws[addr].s = {
      fill: fill ? { patternType: "solid", ...fill } : { patternType: "none" },
      font: {
        bold: bold || false,
        sz: sz || 11,
        color: fontColor ? { rgb: fontColor } : { rgb: "1A1A2E" },
      },
      alignment: { horizontal: align || "left", vertical: "center", wrapText: true },
      border: allBorders,
    };
  }
  styleCell("A1", darkBg, "C8B8A2", true, 16, "center");
  styleCell("A2", darkBg, "C8B8A2", true, 12, "center");
  styleCell("A3", { fgColor: { rgb: "2D1B69" } }, "C8B8A2", false, 10, "center");
  styleCell("A5", darkBg, "C8B8A2", true, 11, "left");
  const dataRows = [6, 7, 8, 9, 10, 11, 12];
  dataRows.forEach((r) => {
    const ra = r - 1;
    if (wsData[ra]) {
      styleCell(`A${r}`, grayBg, "5A5A7A", true, 10);
      styleCell(`B${r}`, { fgColor: { rgb: "FFFFFF" } }, "1A1A2E", false, 11);
      styleCell(`D${r}`, grayBg, "5A5A7A", true, 10);
      styleCell(`E${r}`, { fgColor: { rgb: "FFFFFF" } }, "1A1A2E", false, 11);
    }
  });
  const obsHeaderRow = wsData.length - userObs.length - 2;
  styleCell(`A${obsHeaderRow}`, darkBg, "C8B8A2", true, 11);
  const colHeaderRow = obsHeaderRow + 1;
  ["A", "B", "C", "D", "E", "F"].forEach((col) => {
    styleCell(`${col}${colHeaderRow}`, { fgColor: { rgb: "2D1B69" } }, "C8B8A2", true, 10);
  });
  userObs.forEach((_, i) => {
    const r = colHeaderRow + 1 + i;
    const isEven = i % 2 === 0;
    const bg = isEven ? grayBg : { fgColor: { rgb: "FFFFFF" } };
    ["A", "B", "C", "D", "E"].forEach((col) => styleCell(`${col}${r}`, bg, "1A1A2E", false, 10));
    const isDone = userObs[i].done;
    styleCell(`F${r}`, isDone ? jadeBg : amberBg, isDone ? jadeFg.rgb : amberFg.rgb, true, 10, "center");
  });
  ws["!rows"] = wsData.map((_, i) => {
    if (i === 0) return { hpt: 28 };
    if (i === 1) return { hpt: 20 };
    if (i === 4 || i === obsHeaderRow - 1) return { hpt: 20 };
    return { hpt: 16 };
  });
  XLSX.utils.book_append_sheet(wb, ws, "Hoja de Vida");
  XLSX.writeFile(wb, `HojaDeVida_${titulo}_${fecha}.xlsx`);
}

function exportHojaDeVidaHTML(item, kind, capsulaName) {
  const fecha = new Date().toISOString().slice(0, 10);
  const cliente = item.cliente || item.colores?.[0] || "—";
  const statusColors = {
    aprobado: "#2D9E6B",
    declinado: "#E85D4A",
    en_proceso: "#3D6B9E",
    en_revision: "#C47C1A",
    enviado_cotizacion: "#7B5EA7",
    borrador: "#5A5A7A",
  };
  const statusLabel = {
    aprobado: "Aprobado",
    declinado: "Declinado",
    en_proceso: "En proceso",
    en_revision: "En revisión",
    enviado_cotizacion: "En cotización",
    borrador: "Borrador",
  };
  const stColor = statusColors[item.status] || "#5A5A7A";
  const stLabel = statusLabel[item.status] || item.status || "";
  const obsHTML = (item.observations || [])
    .filter((o) => o.type !== "update" && o.user !== "Sistema")
    .map(
      (o, i) => `
    <tr style="background:${i % 2 === 0 ? "#F7F4F0" : "#fff"}">
      <td style="padding:10px 12px;font-weight:700;color:#1A1A2E;text-align:center">${i + 1}</td>
      <td style="padding:10px 12px;color:#5A5A7A;font-size:12px">${
        o.date ? new Date(o.date).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : ""
      }</td>
      <td style="padding:10px 12px;font-weight:600;color:#1A1A2E">${o.user || ""}</td>
      <td style="padding:10px 12px;color:#5A5A7A">${o.role || ""}</td>
      <td style="padding:10px 12px;color:#1A1A2E;line-height:1.5">${(o.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
      <td style="padding:10px 12px;text-align:center">
        <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${
          o.done ? "#EBF7F2" : "#FDF5E6"
        };color:${o.done ? "#2D9E6B" : "#C47C1A"}">${o.done ? "✓ Resuelta" : "⏳ Pendiente"}</span>
      </td>
    </tr>`
    )
    .join("");
  const imgHTML = item.image
    ? `<img src="${item.image}" style="width:180px;height:180px;object-fit:cover;border-radius:10px;border:2px solid #E8E2DB;display:block" alt="ref"/>`
    : `<div style="width:180px;height:180px;border-radius:10px;border:2px dashed #E8E2DB;display:flex;align-items:center;justify-content:center;color:#5A5A7A;font-size:13px">Sin imagen</div>`;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Hoja de Vida — ${item.reference}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#F7F4F0;color:#1A1A2E;padding:32px}
  @media print{body{padding:0;background:#fff}}
  .page{max-width:900px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 32px rgba(26,26,46,0.1)}
  .header{background:linear-gradient(135deg,#1A1A2E 0%,#2D1B69 100%);padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
  .header-left h1{color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px}
  .header-left p{color:#C8B8A2;font-size:13px;margin-top:4px}
  .header-right{text-align:right}
  .header-right .ref-badge{background:rgba(200,184,162,0.2);border:1px solid #C8B8A2;border-radius:8px;padding:8px 16px;color:#C8B8A2;font-size:13px;font-weight:700}
  .body{padding:28px 32px}
  .foto-info{display:flex;gap:24px;margin-bottom:24px}
  .info-table{flex:1}
  .info-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .info-card{background:#F7F4F0;border-radius:8px;padding:12px 14px;border:1px solid #E8E2DB}
  .info-card label{display:block;font-size:10px;font-weight:700;color:#5A5A7A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px}
  .info-card span{font-size:14px;font-weight:700;color:#1A1A2E}
  .status-badge{display:inline-block;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:800;color:#fff;background:${stColor}}
  .section-title{font-size:15px;font-weight:800;color:#1A1A2E;margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid #E8E2DB;display:flex;align-items:center;gap:8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#1A1A2E;color:#C8B8A2;padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em}
  .footer{background:#F7F4F0;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E8E2DB;font-size:12px;color:#5A5A7A}
  .no-obs{text-align:center;padding:32px;color:#5A5A7A;font-size:13px}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>🧵 Hoja de Vida</h1>
      <p>${kind === "proto" ? "Prototipo" : "Referencia en Cápsula"}${kind === "ref" && capsulaName ? ` · ${capsulaName}` : ""}</p>
    </div>
    <div class="header-right">
      <div class="ref-badge">${item.reference || ""}</div>
      <div style="color:#C8B8A2;font-size:11px;margin-top:8px">${fecha}</div>
    </div>
  </div>
  <div class="body">
    <div class="foto-info">
      <div>${imgHTML}</div>
      <div class="info-table" style="flex:1">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <h2 style="font-size:20px;font-weight:900;color:#1A1A2E">${item.name || ""}</h2>
          <span class="status-badge">${stLabel}</span>
        </div>
        <div class="info-row">
          <div class="info-card"><label>Categoría</label><span>${item.categoria || "—"}</span></div>
          <div class="info-card"><label>Silueta</label><span>${item.silueta || "—"}</span></div>
        </div>
        <div class="info-row">
          <div class="info-card"><label>Rango</label><span>${item.rango || "—"}</span></div>
          <div class="info-card"><label>Cliente</label><span>${cliente}</span></div>
        </div>
        <div class="info-row">
          <div class="info-card"><label>Tipo de Tela</label><span>${item.tipoTela || "—"}</span></div>
          <div class="info-card"><label>Base de Moldería</label><span>${item.baseMolderia || "—"}</span></div>
        </div>
        <div class="info-row">
          <div class="info-card"><label>Responsable</label><span>${item.assignedTo || "—"}</span></div>
          <div class="info-card"><label>Fecha Creación</label><span>${item.createdAt || "—"}</span></div>
        </div>
      </div>
    </div>
    <div class="section-title">📋 Observaciones y Modificaciones</div>
    ${
      (item.observations || []).filter((o) => o.type !== "update" && o.user !== "Sistema").length === 0
        ? `<div class="no-obs">Sin observaciones registradas.</div>`
        : `<table>
          <thead><tr>
            <th style="width:40px">#</th>
            <th style="width:120px">Fecha</th>
            <th style="width:120px">Usuario</th>
            <th style="width:100px">Rol</th>
            <th>Observación</th>
            <th style="width:100px">Estado</th>
          </tr></thead>
          <tbody>${obsHTML}</tbody>
        </table>`
    }
  </div>
  <div class="footer">
    <span>TechPack · Industrias Yanko</span>
    <span>Generado el ${new Date().toLocaleDateString("es-CO", { dateStyle: "long" })}</span>
    <button onclick="window.print()" style="background:#1A1A2E;color:#C8B8A2;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:700">🖨 Imprimir / PDF</button>
  </div>
</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `HojaDeVida_${item.reference}_${fecha}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
function exportHojaDeVida(item, kind, capsulaName) {
  exportHojaDeVidaHTML(item, kind, capsulaName);
  setTimeout(() => exportHojaDeVidaXLSX(item, kind, capsulaName), 600);
}
function exportToExcel(protos, capsulas) {
  const statusLabel = {
    borrador: "Borrador",
    en_proceso: "En proceso",
    en_revision: "En revisión",
    aprobado: "Aprobado",
    enviado_cotizacion: "En cotización",
    declinado: "Declinado",
    bloqueado: "Bloqueado",
  };
  const protosData = protos.map((p) => ({
    Referencia: p.reference || "",
    Nombre: p.name || "",
    Categoría: p.categoria || "",
    Silueta: p.silueta || "",
    Rango: p.rango || "",
    Estado: statusLabel[p.status] || p.status,
    "Etapa Actual": p.currentStage || "",
    Responsable: p.assignedTo || "",
    "Fecha Creación": p.createdAt || "",
    Promovido: p.promotedTo ? "Sí" : "No",
    Observaciones: p.observations?.length || 0,
  }));
  const refsData = capsulas.flatMap((cap) =>
    cap.referencias.map((r) => ({
      Cápsula: cap.name || "",
      Temporada: cap.season || "",
      Referencia: r.reference || "",
      Nombre: r.name || "",
      Categoría: r.categoria || "",
      Silueta: r.silueta || "",
      Rango: r.rango || "",
      Estado: statusLabel[r.status] || r.status,
      "Etapa Actual": r.currentStage || "",
      Responsable: r.assignedTo || "",
      Colores: (r.colores || []).join(", "),
      Tallas: (r.tallas || []).join(", "),
      "Fecha Creación": r.createdAt || "",
      "Desde Prototipo": r.fromProtoId ? "Sí" : "No",
    }))
  );
  const capsulasData = capsulas.map((cap) => ({
    "Nombre Cápsula": cap.name || "",
    Temporada: cap.season || "",
    "Fecha Creación": cap.createdAt || "",
    "Total Referencias": cap.referencias.length,
    Aprobadas: cap.referencias.filter((r) => r.status === "aprobado").length,
    "En Proceso": cap.referencias.filter((r) => r.status === "en_proceso").length,
    Declinadas: cap.referencias.filter((r) => r.status === "declinado").length,
  }));
  function toCSV(data) {
    if (!data.length) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => `"${(row[h] || "").toString().replace(/"/g, '""')}"`).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }
  function downloadCSV(data, filename) {
    const csv = toCSV(data);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  const fecha = new Date().toISOString().slice(0, 10);
  downloadCSV(protosData, `Prototipos_${fecha}.csv`);
  setTimeout(() => downloadCSV(refsData, `Referencias_${fecha}.csv`), 500);
  setTimeout(() => downloadCSV(capsulasData, `Capsulas_${fecha}.csv`), 1000);
}

const T = {
  ink: "#1A1A2E",
  slate: "#5A5A7A",
  seam: "#C8B8A2",
  seamDark: "#9E8870",
  canvas: "#F7F4F0",
  white: "#FFFFFF",
  coral: "#E85D4A",
  coralBg: "#FDF0EE",
  jade: "#2D9E6B",
  jadeBg: "#EBF7F2",
  denim: "#3D6B9E",
  denimBg: "#EBF1F7",
  amber: "#C47C1A",
  amberBg: "#FDF5E6",
  violet: "#7B5EA7",
  violetBg: "#F3EEF9",
  border: "#E8E2DB",
};
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTHS_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const INIT_USERS = [
  { id: "u1", username: "admin", password: "admin123", name: "Administrador", role: "Equipo Interno", avatar: "AD", isAdmin: true },
  { id: "u2", username: "laura", password: "laura123", name: "Laura Sánchez", role: "Equipo Interno", avatar: "LS", isAdmin: false },
  { id: "u3", username: "maria", password: "maria123", name: "María García", role: "Equipo Interno", avatar: "MG", isAdmin: false },
  { id: "u4", username: "pedro", password: "pedro123", name: "Pedro Martínez", role: "Equipo Interno", avatar: "PM", isAdmin: false },
  { id: "u5", username: "cliente", password: "cliente123", name: "Carlos Ruiz", role: "Cliente", avatar: "CR", isAdmin: false },
];
const INIT_CONFIG = {
  id: "main",
  stages: [
    { id: "ilustracion", label: "Ilustración", short: "ILUS", days: 3 },
    { id: "pds", label: "PDS", short: "PDS", days: 2 },
    { id: "corte", label: "Corte", short: "CORT", days: 4 },
    { id: "confeccion", label: "Confección", short: "CONF", days: 5 },
    { id: "cotizacion", label: "Cotización", short: "COT", days: 1 },
  ],
  categorias: ["Cachetero","Byker","Capry","Leggins","Camiseta","Sisa","Top","Buso","Short","Enterizo","Body","Conjunto","Vestido","Blusa","Pantaloneta","Jogger","Traje de Baño","Bóxer","Pantys"],
  siluetas: ["Slimfit","Regularfit","Silueta Amplia","Oversize","Super Oversize","Estándar"],
  rangos: ["Normal (S,M,L,XL)","Doble Talla (S/M - M/L)","Talla U","Plus","Plus (1XL-2XL-3XL)"],
  disenadores: [],
  talleresMuestra: [],
  prioridadesMuestra: ["Media", "Urgente", "Súper urgente", "Espera", "Modificación"],
  roles: [
    { id: "r1", name: "Equipo Interno", perms: ["editar", "aprobar", "declinar", "admin", "corte"], modulos: ["protos", "capsulas", "pedidos", "pedidos_clientes", "corte", "stats", "historial", "contabilidad"] },
    { id: "r2", name: "Cliente", perms: ["aprobar", "declinar"], modulos: ["protos", "capsulas", "pedidos", "pedidos_clientes", "stats", "historial"] },
    { id: "r3", name: "Diseñador", perms: ["editar"], modulos: ["protos", "capsulas", "pedidos", "pedidos_clientes", "stats", "historial"] },
    { id: "r4", name: "Planeador", perms: ["corte"], modulos: ["pedidos", "corte", "planeacion"] },
  ],
  clientes: [],
};
const PEDIDO_STAGES = [
  "Hoja de Vida","Verificación de Colorido","Carta de Combinaciones, Textiles e Insumos","Verificación de Ilustración","Muestra","Revisión de Insumos","Cotización","Ficha Técnica","Pedido en Busint","Explosión de Materiales","Corte","Control de Muestra de Corte","Bodega de Materia Prima","Confección","Inventario de Procesos","Semiterminado","Despacho",
];
const STATUS = {
  borrador: { label: "Borrador", color: T.slate, bg: "#EDEDF2" },
  en_proceso: { label: "En proceso", color: T.denim, bg: T.denimBg },
  en_revision: { label: "En revisión", color: T.amber, bg: T.amberBg },
  aprobado: { label: "Aprobado", color: T.jade, bg: T.jadeBg },
  enviado_cotizacion: { label: "En cotización", color: T.violet, bg: T.violetBg },
  enviar_cliente: { label: "Enviar al Cliente", color: "#0E7490", bg: "#ECFEFF" },
  enviado: { label: "Enviado", color: "#0369A1", bg: "#EFF6FF" },
  recibido_cliente: { label: "Recibido por Cliente", color: T.jade, bg: T.jadeBg },
  declinado: { label: "Declinado", color: T.coral, bg: T.coralBg },
  bloqueado: { label: "Bloqueado", color: "#888", bg: "#F0F0F0" },
};
// --- Cronograma de Muestras ---
// Estado propio de cada envío a taller de muestra (independiente del status
// del prototipo/referencia en Diseño): arranca "pendiente" (sin resultado
// todavía), el usuario lo pasa a "aprobado" o "modificar" según lo que
// vuelva del taller, y "enviado" se pone solo cuando el prototipo/referencia
// pasa a status "enviado" (ver syncCronogramaEnviado).
const ESTADO_MUESTRA = {
  pendiente: { label: "Sin asignar", color: T.amber, bg: T.amberBg },
  aprobado: { label: "Aprobado", color: T.jade, bg: T.jadeBg },
  modificar: { label: "Modificar", color: T.coral, bg: T.coralBg },
  enviado: { label: "Enviado", color: "#0369A1", bg: "#EFF6FF" },
};
// La lista de prioridades (Media, Urgente, etc.) ahora vive en
// config.prioridadesMuestra — editable en Administrador General, igual que
// Diseñadores y Talleres de Muestra — en vez de quedar fija en el código.
// Este mapa de colores es solo una guía visual: una prioridad agregada desde
// Admin que no esté aquí simplemente se ve con el color neutro (T.border).
const PRIORIDAD_MUESTRA_COLOR = { "Media": T.denim, "Urgente": T.amber, "Súper urgente": T.coral, "Espera": T.slate, "Modificación": T.violet };
const TIPO_GENERO_MUESTRA = ["Dama", "Caballero", "Niña", "Niño"];
const TIPO_DESARROLLO_MUESTRA = ["Cápsula nueva", "Contramuestra para producción", "Tela nueva"];
// Aprobación de Ilustración a nivel de Cápsula: una cápsula se puede crear
// libremente (nombre/temporada/cliente, sin referencias), pero para
// agregarle referencias — sea creando una nueva o promoviendo un prototipo —
// la Dirección Creativa debe aprobar primero la ilustración/concepto de la
// cápsula completa. Empieza "pendiente", puede ir a "en_revision" (con nota
// obligatoria) y finalmente "aprobado".
const ILUSTRACION_CAPSULA_ESTADO = {
  pendiente: { label: "Ilustración pendiente de aprobación", color: T.amber, bg: T.amberBg },
  en_revision: { label: "Ilustración en revisión", color: T.coral, bg: T.coralBg },
  aprobado: { label: "Ilustración aprobada", color: T.jade, bg: T.jadeBg },
};
// Compatibilidad con cápsulas creadas antes de este control: si nunca se le
// asignó "ilustracionEstado", se trata como ya aprobada (no se le retiene
// retroactivamente la posibilidad de agregar referencias).
function ilustracionAprobada(cap) { return !cap.ilustracionEstado || cap.ilustracionEstado === "aprobado"; }
// Busca en las observaciones de un ítem la fecha real en la que pasó a un
// estado dado (ej. "Aprobado"), usada por el backfill de Historial para
// reconstruir fechas reales en vez de usar "hoy" para ítems que ya estaban
// aprobados/declinados antes de que existiera el registro de Historial.
function buscarFechaEstado(item, status) {
  const label = STATUS[status]?.label;
  if (!label) return null;
  const texto = `Estado → "${label}".`;
  const obs = (item.observations || []).filter((o) => o.type === "update" && o.text === texto);
  return obs.length ? obs[obs.length - 1].date : null;
}
function uid() { return Math.random().toString(36).slice(2, 9); }
function daysAgo(d) { return Math.floor((Date.now() - new Date(d)) / 86400000); }
function isOverdue(item, stages) {
  // Una vez el ítem salió del pipeline interno de producción (cotización
  // enviada, enviado al cliente, recibido, aprobado o declinado), la Ruta
  // Crítica ya no debe marcarse como "vencida" — esos días ya no dependen de
  // producción interna. Antes esto no se revisaba y un ítem podía verse
  // "Vencido" en la etapa aunque ya estuviera Enviado, porque el status y la
  // etapa (currentStage) se actualizan por separado.
  if (["enviado_cotizacion", "enviar_cliente", "enviado", "recibido_cliente", "aprobado", "declinado"].includes(item.status)) return false;
  const s = stages.find((x) => x.id === item.currentStage);
  return s ? daysAgo(item.stageStartedAt) > s.days : false;
}
function today() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }
// Permisos de módulo (visibilidad por sección: Prototipos, Cápsulas, Pedidos,
// Clientes, Corte, Estadísticas, Contabilidad), separados de los permisos de
// flujo de trabajo (editar/aprobar/declinar/admin). Cada sección se autoriza
// de forma independiente para poder armar roles como "Planeador" (Pedidos +
// Corte, sin Prototipos ni Cápsulas).
// Claves granulares de sección dentro de Diseño (Corte y Contabilidad siempre
// se gestionan como llaves independientes, nunca implícitas en "diseno").
const DISENO_SUBMODULOS = ["protos", "capsulas", "pedidos", "pedidos_clientes", "stats", "historial", "cronograma_muestras", "bitacora"];
function moduloVisible(roleData, mod, isAdmin) {
  if (isAdmin) return true;
  if (!roleData) return false;
  if (Array.isArray(roleData.modulos)) {
    if (roleData.modulos.includes(mod)) return true;
    // Compatibilidad con roles guardados antes de este cambio, donde "diseno"
    // era una sola llave que representaba las secciones básicas de Diseño
    // (Prototipos, Cápsulas, Pedidos, Clientes, Estadísticas) — Corte y
    // Contabilidad siempre requirieron su propia llave explícita.
    if (roleData.modulos.includes("diseno") && DISENO_SUBMODULOS.includes(mod)) return true;
    return false;
  }
  if (mod === "corte") return !!roleData.perms?.includes("corte");
  if (mod === "contabilidad") return !!roleData.perms?.includes("admin");
  if (DISENO_SUBMODULOS.includes(mod)) return true;
  return false;
}

function LoadingScreen({ message }) {
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg,${T.ink} 0%,#2D1B69 50%,#1A2E4A 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg,${T.seam},${T.seamDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 24 }}>🧵</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.white, marginBottom: 8 }}>TechPack</div>
      <div style={{ fontSize: 13, color: "rgba(200,184,162,0.6)", marginBottom: 32 }}>{message || "Cargando..."}</div>
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: T.seam, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
    </div>
  );
}
function LoginScreen({ onLogin, users }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  function handleLogin() {
    if (!username || !password) { setError("Ingresa usuario y contraseña."); return; }
    setLoading(true);
    setError("");
    setTimeout(() => {
      const user = users.find((u) => u.username === username.toLowerCase().trim() && u.password === password);
      if (user) { onLogin(user); } else { setError("Usuario o contraseña incorrectos."); setLoading(false); }
    }, 600);
  }
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg,${T.ink} 0%,#2D1B69 50%,#1A2E4A 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',-apple-system,sans-serif", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(200,184,162,0.06)" }} />
        <div style={{ position: "absolute", bottom: -150, left: -100, width: 500, height: 500, borderRadius: "50%", background: "rgba(61,107,158,0.08)" }} />
      </div>
      <div style={{ width: "100%", maxWidth: 420, position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg,${T.seam},${T.seamDark})`, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "0 8px 32px rgba(200,184,162,0.3)" }}>🧵</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: T.white, letterSpacing: "-0.5px" }}>TechPack</div>
          <div style={{ fontSize: 13, color: "rgba(200,184,162,0.7)", marginTop: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>Sistema de Gestión</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", borderRadius: 20, padding: 36, border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.white, marginBottom: 6 }}>Iniciar sesión</div>
          <div style={{ fontSize: 13, color: "rgba(200,184,162,0.6)", marginBottom: 28 }}>Ingresa tus credenciales para continuar</div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(200,184,162,0.8)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Usuario</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="Tu usuario" autoComplete="username"
              style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: T.white, fontSize: 15, outline: "none", fontFamily: "inherit" }}
              onFocus={(e) => (e.target.style.border = "1.5px solid rgba(200,184,162,0.6)")}
              onBlur={(e) => (e.target.style.border = "1.5px solid rgba(255,255,255,0.15)")}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(200,184,162,0.8)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Contraseña</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="••••••••" autoComplete="current-password"
                style={{ width: "100%", padding: "12px 44px 12px 16px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: T.white, fontSize: 15, outline: "none", fontFamily: "inherit" }}
                onFocus={(e) => (e.target.style.border = "1.5px solid rgba(200,184,162,0.6)")}
                onBlur={(e) => (e.target.style.border = "1.5px solid rgba(255,255,255,0.15)")}
              />
              <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(200,184,162,0.6)", cursor: "pointer", fontSize: 16 }}>{showPass ? "🙈" : "👁"}</button>
            </div>
          </div>
          {error && (<div style={{ padding: "10px 14px", background: "rgba(232,93,74,0.15)", border: "1px solid rgba(232,93,74,0.3)", borderRadius: 8, color: "#FF8A7A", fontSize: 13, fontWeight: 600, marginBottom: 20 }}>⚠ {error}</div>)}
          <button onClick={handleLogin} disabled={loading}
            style={{ width: "100%", padding: "13px", background: loading ? "rgba(200,184,162,0.3)" : `linear-gradient(135deg,${T.seam},${T.seamDark})`, border: "none", borderRadius: 10, color: T.ink, fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >{loading ? "Verificando..." : "Ingresar →"}</button>
          <div style={{ marginTop: 20, textAlign: "center" }}><span style={{ fontSize: 12, color: "rgba(200,184,162,0.4)" }}>TechPack © 2025</span></div>
        </div>
      </div>
    </div>
  );
}

function Badge({ status }) {
  const s = STATUS[status] || STATUS.borrador;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 4, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{s.label}</span>;
}
function CatTag({ text }) {
  return <span style={{ padding: "2px 8px", borderRadius: 3, background: T.denimBg, color: T.denim, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em" }}>{text}</span>;
}
function OverduePill({ item, stages }) {
  if (!isOverdue(item, stages)) return null;
  const d = daysAgo(item.stageStartedAt), limit = stages.find((s) => s.id === item.currentStage)?.days;
  return <span style={{ padding: "2px 8px", borderRadius: 4, background: T.coralBg, color: T.coral, fontSize: 11, fontWeight: 700 }}>⚑ {d}d/{limit}d</span>;
}
function StageBar({ currentStage, stages, compact }) {
  const idx = stages.findIndex((s) => s.id === currentStage);
  return (
    <div style={{ display: "flex", gap: compact ? 2 : 4 }}>
      {stages.map((s, i) => {
        const done = i < idx, active = i === idx;
        return (
          <div key={s.id} style={{ flex: 1 }}>
            <div style={{ height: compact ? 4 : 6, borderRadius: 2, background: done ? T.jade : active ? T.denim : T.border, position: "relative" }}>
              {active && <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", width: compact ? 8 : 10, height: compact ? 8 : 10, borderRadius: "50%", background: T.denim, border: "2px solid white" }} />}
            </div>
            {!compact && <div style={{ fontSize: 9, color: active ? T.denim : T.slate, fontWeight: active ? 700 : 400, marginTop: 3 }}>{s.short}</div>}
          </div>
        );
      })}
    </div>
  );
}
function Avatar({ name, size = 26 }) {
  const cols = [T.denim, T.jade, T.coral, T.seamDark, T.violet];
  const bg = cols[(name || "?").charCodeAt(0) % cols.length];
  return <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 800, flexShrink: 0 }}>{(name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>;
}
function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: T.white, borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: T.ink }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.slate }}>×</button>
        </div>
        <div style={{ padding: 24, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.slate, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
function FInput({ value, onChange, placeholder, type = "text" }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />;
}
function FSel({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
      <option value="">— Seleccionar —</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Btn({ children, onClick, variant = "primary", small, disabled }) {
  const S = {
    primary: { background: T.ink, color: T.white, border: "none" },
    secondary: { background: T.canvas, color: T.ink, border: `1px solid ${T.border}` },
    success: { background: T.jade, color: T.white, border: "none" },
    danger: { background: T.coral, color: T.white, border: "none" },
    ghost: { background: "transparent", color: T.denim, border: `1.5px solid ${T.denim}` },
    amber: { background: T.amber, color: T.white, border: "none" },
    violet: { background: T.violet, color: T.white, border: "none" },
  };
  const s = S[variant] || S.primary;
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...s, borderRadius: 8, padding: small ? "6px 12px" : "9px 18px", fontWeight: 700, fontSize: small ? 12 : 13, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.5 : 1 }}>{children}</button>
  );
}
function Toast({ items, onDismiss }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((n) => (
        <div key={n.id} style={{ background: T.ink, color: T.white, padding: "12px 16px", borderRadius: 10, boxShadow: "0 8px 32px rgba(26,26,46,0.25)", display: "flex", gap: 12, alignItems: "center", minWidth: 300, borderLeft: `4px solid ${T.seam}` }}>
          <span style={{ fontSize: 18 }}>{n.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{n.title}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{n.msg}</div>
          </div>
          <button onClick={() => onDismiss(n.id)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", opacity: 0.5, fontSize: 18 }}>×</button>
        </div>
      ))}
    </div>
  );
}
function ImageUploader({ image, onImage, readonly }) {
  const fileRef = useRef();
  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round((h * MAX) / w); w = MAX; } else { w = Math.round((w * MAX) / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      onImage(compressed);
    };
    img.src = url;
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Imagen</div>
      {image ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <img src={image} alt="ref" style={{ width: "100%", maxWidth: 300, height: 180, objectFit: "cover", borderRadius: 10, border: `1px solid ${T.border}`, display: "block" }} />
          {!readonly && <button onClick={() => onImage(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(26,26,46,0.75)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "white", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>}
        </div>
      ) : (
        !readonly && (
          <div onClick={() => fileRef.current.click()} style={{ width: "100%", maxWidth: 300, height: 130, border: `2px dashed ${T.border}`, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: T.canvas, color: T.slate }}>
            <span style={{ fontSize: 28, marginBottom: 6 }}>📷</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Subir imagen</span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          </div>
        )
      )}
    </div>
  );
}

function ChatPanel({ observations, currentUser, role, onSend, onMarkDone }) {
  const [text, setText] = useState("");
  function send() { if (!text.trim()) return; onSend(text.trim()); setText(""); }
  const pending = observations.filter((o) => !o.done).length;
  return (
    <div>
      {pending > 0 && <div style={{ padding: "8px 14px", background: T.amberBg, borderRadius: 8, marginBottom: 14, fontSize: 12, color: T.amber, fontWeight: 700 }}>⏳ {pending} pendiente{pending > 1 ? "s" : ""}</div>}
      <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, marginBottom: 16, paddingRight: 4 }}>
        {!observations.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 24 }}>Sin observaciones aún.</div>}
        {observations.map((o) => {
          const mine = o.user === currentUser;
          return (
            <div key={o.id} style={{ display: "flex", gap: 10, flexDirection: mine ? "row-reverse" : "row", opacity: o.done ? 0.6 : 1 }}>
              <Avatar name={o.user} size={30} />
              <div style={{ maxWidth: "76%" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexDirection: mine ? "row-reverse" : "row" }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: T.ink }}>{o.user}</span>
                  <span style={{ fontSize: 10, color: T.slate, background: T.canvas, padding: "1px 6px", borderRadius: 3 }}>{o.role}</span>
                  {o.done && <span style={{ fontSize: 10, color: T.jade, fontWeight: 700, background: T.jadeBg, padding: "1px 6px", borderRadius: 3 }}>✓ Hecha</span>}
                </div>
                <div style={{ padding: "9px 13px", borderRadius: 10, background: mine ? T.ink : T.canvas, color: mine ? T.white : T.ink, fontSize: 13, lineHeight: 1.5, borderTopRightRadius: mine ? 2 : 10, borderTopLeftRadius: mine ? 10 : 2, textDecoration: o.done ? "line-through" : "none" }}>{o.text}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexDirection: mine ? "row-reverse" : "row" }}>
                  <span style={{ fontSize: 10, color: T.slate }}>{new Date(o.date).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</span>
                  {!o.done && <button onClick={() => onMarkDone(o.id)} style={{ background: T.jadeBg, border: `1px solid ${T.jade}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: T.jade, cursor: "pointer" }}>✓ Marcar hecha</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escribe una observación..." style={{ flex: 1, padding: "9px 14px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <Btn onClick={send}>Enviar</Btn>
      </div>
    </div>
  );
}
function BomTable({ bom, role }) {
  if (!bom.length) return <div style={{ color: T.slate, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Sin materiales en BOM.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: T.canvas }}>
            {["Material", "Cant.", "Unidad", "Color", "Proveedor", ...(role !== "Cliente" ? ["Costo"] : []), "Estado"].map((h) => (
              <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: T.slate, fontSize: 11, borderBottom: `2px solid ${T.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bom.map((b, i) => (
            <tr key={b.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? T.white : T.canvas }}>
              <td style={{ padding: "9px 12px", fontWeight: 600, color: T.ink }}>{b.material}</td>
              <td style={{ padding: "9px 12px", color: T.slate }}>{b.qty}</td>
              <td style={{ padding: "9px 12px", color: T.slate }}>{b.unit}</td>
              <td style={{ padding: "9px 12px", color: T.slate }}>{b.color}</td>
              <td style={{ padding: "9px 12px", color: T.slate }}>{b.supplier}</td>
              {role !== "Cliente" && <td style={{ padding: "9px 12px", fontWeight: 600, color: T.ink }}>${(b.cost || 0).toLocaleString()}</td>}
              <td style={{ padding: "9px 12px" }}>
                <span style={{ padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 700, background: b.approved ? T.jadeBg : T.amberBg, color: b.approved ? T.jade : T.amber }}>{b.approved ? "✓" : "⏳"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PomTable({ pom, tallas }) {
  const sizes = tallas?.length ? tallas : ["S", "M", "L", "XL"];
  if (!pom.length) return <div style={{ color: T.slate, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Sin puntos de medida.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: T.canvas }}>
            <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: T.slate, fontSize: 11, borderBottom: `2px solid ${T.border}` }}>Punto</th>
            {sizes.map((sz) => <th key={sz} style={{ padding: "9px 12px", fontWeight: 700, color: T.slate, fontSize: 11, borderBottom: `2px solid ${T.border}`, textAlign: "center" }}>{sz}</th>)}
            <th style={{ padding: "9px 12px", fontWeight: 700, color: T.slate, fontSize: 11, borderBottom: `2px solid ${T.border}` }}>Tol.</th>
          </tr>
        </thead>
        <tbody>
          {pom.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? T.white : T.canvas }}>
              <td style={{ padding: "9px 12px", fontWeight: 700, color: T.ink }}>{r.punto}</td>
              {sizes.map((sz) => <td key={sz} style={{ padding: "9px 12px", color: T.slate, textAlign: "center" }}>{r[sz] ?? "—"}</td>)}
              <td style={{ padding: "9px 12px", color: T.slate, fontSize: 12 }}>{r.tol}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewProtoModal({ onSave, onClose, config }) {
  const [form, setForm] = useState({ name: "", categoria: "", silueta: "", rango: "", reference: "", assignedTo: "", cliente: "", tipoTela: "", baseMolderia: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() {
    if (!form.name || !form.reference) return;
    onSave({ id: uid(), ...form, status: "borrador", currentStage: "ilustracion", stageStartedAt: today(), createdAt: today(), promotedTo: null, image: null, bom: [], pom: [], observations: [] });
    onClose();
  }
  return (
    <Modal title="Nuevo Prototipo" onClose={onClose} width={540}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Ej: Prueba camiseta básica" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config.categorias} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config.siluetas} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Rango"><FSel value={form.rango} onChange={set("rango")} options={config.rangos} /></Field>
        <Field label="Cliente"><FSel value={form.cliente} onChange={set("cliente")} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Ref"><FInput value={form.reference} onChange={set("reference")} placeholder="Ej: C-003" /></Field>
        <Field label="Responsable"><FSel value={form.assignedTo} onChange={set("assignedTo")} options={config.disenadores} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo de Tela"><FInput value={form.tipoTela} onChange={set("tipoTela")} placeholder="Ej: Diamante, Lycra" /></Field>
        <Field label="Base de Moldería"><FInput value={form.baseMolderia} onChange={set("baseMolderia")} placeholder="Ej: BM-045" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Crear Prototipo</Btn>
      </div>
    </Modal>
  );
}
function EditRefModal({ refData: refItem, onSave, onClose, config }) {
  const [form, setForm] = useState({ name: refItem?.name || "", reference: refItem?.reference || "", assignedTo: refItem?.assignedTo || "", categoria: refItem?.categoria || "", silueta: refItem?.silueta || "", colores: refItem?.colores?.[0] || "", tallas: refItem?.tallas?.[0] || "", tipoTela: refItem?.tipoTela || "", baseMolderia: refItem?.baseMolderia || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() {
    if (!form.name || !form.reference) return;
    onSave({ ...form, colores: form.colores ? [form.colores] : [], tallas: form.tallas ? [form.tallas] : [] });
    onClose();
  }
  return (
    <Modal title={`Editar Referencia — ${refItem?.reference}`} onClose={onClose} width={560}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Nombre de la referencia" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config.categorias} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config.siluetas} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Ref"><FInput value={form.reference} onChange={set("reference")} placeholder="Ej: CM-001" /></Field>
        <Field label="Cliente"><FSel value={form.colores} onChange={set("colores")} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Responsable"><FSel value={form.assignedTo} onChange={set("assignedTo")} options={config.disenadores} /></Field>
        <Field label="Rango de Tallas"><FSel value={form.tallas} onChange={set("tallas")} options={config.rangos} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo de Tela"><FInput value={form.tipoTela} onChange={set("tipoTela")} placeholder="Ej: Diamante, Lycra" /></Field>
        <Field label="Base de Moldería"><FInput value={form.baseMolderia} onChange={set("baseMolderia")} placeholder="Ej: BM-045" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Guardar cambios</Btn>
      </div>
    </Modal>
  );
}
function EditProtoModal({ proto, onSave, onClose, config }) {
  const [form, setForm] = useState({ name: proto?.name || "", categoria: proto?.categoria || "", silueta: proto?.silueta || "", rango: proto?.rango || "", reference: proto?.reference || "", assignedTo: proto?.assignedTo || "", cliente: proto?.cliente || "", tipoTela: proto?.tipoTela || "", baseMolderia: proto?.baseMolderia || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() { if (!form.name || !form.reference) return; onSave(form); onClose(); }
  return (
    <Modal title={`Editar Prototipo — ${proto.reference}`} onClose={onClose} width={540}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Nombre del prototipo" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config.categorias} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config.siluetas} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Rango"><FSel value={form.rango} onChange={set("rango")} options={config.rangos} /></Field>
        <Field label="Cliente"><FSel value={form.cliente} onChange={set("cliente")} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Ref"><FInput value={form.reference} onChange={set("reference")} placeholder="Ej: C-003" /></Field>
        <Field label="Responsable"><FSel value={form.assignedTo} onChange={set("assignedTo")} options={config.disenadores} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo de Tela"><FInput value={form.tipoTela} onChange={set("tipoTela")} placeholder="Ej: Diamante, Lycra" /></Field>
        <Field label="Base de Moldería"><FInput value={form.baseMolderia} onChange={set("baseMolderia")} placeholder="Ej: BM-045" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Guardar cambios</Btn>
      </div>
    </Modal>
  );
}
function NewCapsulaModal({ onSave, onClose, config }) {
  const [form, setForm] = useState({ name: "", season: "", cliente: "", assignedTo: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() { if (!form.name) return; onSave({ id: uid(), ...form, createdAt: today(), referencias: [], ilustracionEstado: "pendiente", observacionesIlustracion: [] }); onClose(); }
  return (
    <Modal title="Nueva Cápsula" onClose={onClose}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Ej: Cápsula Otoño 2025" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Temporada / Código"><FInput value={form.season} onChange={set("season")} placeholder="Ej: AW25 o C0127" /></Field>
        <Field label="Responsable"><FSel value={form.assignedTo} onChange={set("assignedTo")} options={config?.disenadores || []} /></Field>
      </div>
      <Field label="Cliente"><FSel value={form.cliente} onChange={set("cliente")} options={(config?.clientes || []).map((c) => c.nombre)} /></Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Crear Cápsula</Btn>
      </div>
    </Modal>
  );
}

function NewRefModal({ capsula, onSave, onClose, config }) {
  const [form, setForm] = useState({ name: "", reference: "", assignedTo: "", categoria: "", silueta: "", rango: "", colores: "", tallas: "", tipoTela: "", baseMolderia: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() {
    if (!form.name || !form.reference) return;
    onSave(capsula.id, {
      id: uid(), name: form.name, reference: form.reference, categoria: form.categoria, silueta: form.silueta, rango: form.rango, fromProtoId: null, status: "borrador", currentStage: "ilustracion", stageStartedAt: today(), assignedTo: form.assignedTo, createdAt: today(), image: null, colores: form.colores ? [form.colores] : [], tallas: form.tallas ? [form.tallas] : [], tipoTela: form.tipoTela, baseMolderia: form.baseMolderia, bom: [], pom: [], approvals: [],
      observations: [{ id: uid(), user: "Sistema", role: "Sistema", text: "Referencia creada.", date: nowISO(), type: "info", done: true }],
    });
    onClose();
  }
  return (
    <Modal title={`Nueva Referencia — ${capsula.name}`} onClose={onClose} width={560}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Ej: Camiseta Oversize Negra" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config.categorias} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config.siluetas} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Ref"><FInput value={form.reference} onChange={set("reference")} placeholder="Ej: CM-001" /></Field>
        <Field label="Cliente"><FSel value={form.colores} onChange={set("colores")} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Responsable"><FSel value={form.assignedTo} onChange={set("assignedTo")} options={config.disenadores} /></Field>
        <Field label="Rango de Tallas"><FSel value={form.tallas} onChange={set("tallas")} options={config.rangos} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo de Tela"><FInput value={form.tipoTela} onChange={set("tipoTela")} placeholder="Ej: Diamante, Lycra" /></Field>
        <Field label="Base de Moldería"><FInput value={form.baseMolderia} onChange={set("baseMolderia")} placeholder="Ej: BM-045" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Crear Referencia</Btn>
      </div>
    </Modal>
  );
}
function EnviadoModal({ onSave, onClose }) {
  const [form, setForm] = useState({ empresa: "", fecha: today(), guia: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() { if (!form.empresa.trim()) return; onSave(form); onClose(); }
  return (
    <Modal title="Registrar Envío" onClose={onClose} width={420}>
      <div style={{ padding: "10px 14px", background: T.denimBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.denim, fontWeight: 600 }}>📦 Registra los datos del envío al cliente</div>
      <Field label="Empresa de Transporte"><FInput value={form.empresa} onChange={set("empresa")} placeholder="Ej: Servientrega, Deprisa, TCC" /></Field>
      <Field label="Fecha de Envío">
        <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
      </Field>
      <Field label="Número de Guía"><FInput value={form.guia} onChange={set("guia")} placeholder="Ej: 9234567890" /></Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="success" onClick={save} disabled={!form.empresa.trim()}>✓ Registrar Envío</Btn>
      </div>
    </Modal>
  );
}
// Modal para crear un ENVÍO agrupado (varias referencias/prototipos juntos,
// p.ej. toda una colección) desde Prototipos/Cápsulas cuando ya están listos
// para el cliente. A diferencia de EnviadoModal (que solo pide datos de
// transporte para UNA referencia), este arma el registro completo que
// después se puede exportar como el ANEXO que se manda al cliente:
// encabezado (colección, cliente, n° pedido, fechas, carta de colores) + por
// cada ítem seleccionado, las cantidades/precio/observaciones que no se
// guardan en la referencia misma. No reemplaza "Registrar Envío" — es un
// flujo adicional pensado para cuando se manda un lote/colección completa.
function NuevoEnvioModal({ items, config, onSave, onClose }) {
  const primero = items[0];
  const [header, setHeader] = useState({
    coleccion: primero?.capsulaNombre || "",
    cliente: primero?.cliente || primero?.colores?.[0] || "",
    numPedido: "",
    fechaEnviado: today(),
    empresaTransporte: "",
    guia: "",
    cartaColores: null,
  });
  const [filas, setFilas] = useState(
    items.map((it) => ({
      id: it.id,
      _consumo: "",
      _tipo: "",
      _colombiaCurva: "",
      _colombiaCantidad: "",
      _venezuelaCurva: "",
      _venezuelaCantidad: "",
      _precio: "",
      _observacionesCliente: "",
    }))
  );
  const setH = (k) => (v) => setHeader((h) => ({ ...h, [k]: v }));
  function setFila(id, campo, val) {
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: val } : f)));
  }
  function save() {
    const itemsConDatos = items.map((it) => ({ ...it, ...filas.find((f) => f.id === it.id) }));
    onSave(header, itemsConDatos);
    onClose();
  }
  return (
    <Modal title={`Crear Envío — ${items.length} referencia${items.length !== 1 ? "s" : ""}`} onClose={onClose} width={860}>
      <div style={{ padding: "10px 14px", background: T.denimBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.denim, fontWeight: 600 }}>
        📜 Esto arma el registro de Bitácora (encabezado + tabla por referencia) y marca cada ítem como "Enviado".
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Colección / Nombre del Envío"><FInput value={header.coleccion} onChange={setH("coleccion")} placeholder="Ej: Colección Kamila Girls N°2" /></Field>
        <Field label="Cliente"><FSel value={header.cliente} onChange={setH("cliente")} options={(config?.clientes || []).map((c) => c.nombre)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="N° Pedido"><FInput value={header.numPedido} onChange={setH("numPedido")} placeholder="Ej: 4521" /></Field>
        <Field label="Fecha de Envío">
          <input type="date" value={header.fechaEnviado} onChange={(e) => setHeader((h) => ({ ...h, fechaEnviado: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Empresa de Transporte (opcional)"><FInput value={header.empresaTransporte} onChange={setH("empresaTransporte")} placeholder="Ej: Servientrega" /></Field>
        <Field label="Número de Guía (opcional)"><FInput value={header.guia} onChange={setH("guia")} placeholder="Ej: 9234567890" /></Field>
      </div>
      <ImageUploader image={header.cartaColores} onImage={(img) => setHeader((h) => ({ ...h, cartaColores: img }))} />
      <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 8, marginBottom: 10 }}>Referencias en este envío</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
        {items.map((it) => {
          const f = filas.find((x) => x.id === it.id);
          return (
            <div key={it.id} style={{ border: `1.5px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                {it.image && <img src={it.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: T.ink }}>{it.reference} — {it.name}</div>
                  <div style={{ fontSize: 11, color: T.slate }}>{it.categoria || "—"} · {it.silueta || "—"} · {it.rango || it.tallas?.[0] || "—"} · {it.tipoTela || "—"}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Field label="Tipo"><FInput value={f._tipo} onChange={(v) => setFila(it.id, "_tipo", v)} placeholder="Niña, Niño..." /></Field>
                <Field label="Consumo"><FInput value={f._consumo} onChange={(v) => setFila(it.id, "_consumo", v)} placeholder="Ej: 0.45 kg" /></Field>
                <Field label="Precio $"><FInput value={f._precio} onChange={(v) => setFila(it.id, "_precio", v)} placeholder="Ej: 18950" /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                <Field label="Curva Colombia"><FInput value={f._colombiaCurva} onChange={(v) => setFila(it.id, "_colombiaCurva", v)} placeholder="Ej: 8-10-12-14" /></Field>
                <Field label="Cantidad Colombia"><FInput value={f._colombiaCantidad} onChange={(v) => setFila(it.id, "_colombiaCantidad", v)} placeholder="Ej: 24" /></Field>
                <Field label="Curva Venezuela"><FInput value={f._venezuelaCurva} onChange={(v) => setFila(it.id, "_venezuelaCurva", v)} placeholder="Ej: 8-10-12-14" /></Field>
                <Field label="Cantidad Venezuela"><FInput value={f._venezuelaCantidad} onChange={(v) => setFila(it.id, "_venezuelaCantidad", v)} placeholder="Ej: 12" /></Field>
              </div>
              <Field label="Observaciones Cliente"><FInput value={f._observacionesCliente} onChange={(v) => setFila(it.id, "_observacionesCliente", v)} placeholder="Ej: Ajuste en laterales" /></Field>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="success" onClick={save}>✓ Crear Envío</Btn>
      </div>
    </Modal>
  );
}
function PromoteModal({ proto, capsulas, onSave, onClose, config }) {
  // Solo se puede promover a una cápsula cuya ilustración/concepto ya haya
  // sido aprobado por la Dirección Creativa (las creadas antes de este
  // control se tratan como aprobadas, ver ilustracionAprobada).
  const capsulasDisponibles = capsulas.filter(ilustracionAprobada);
  const [capId, setCapId] = useState(capsulasDisponibles[0]?.id || "");
  const [refName, setRefName] = useState(proto.name);
  const [refCode, setRefCode] = useState("");
  const [cliente, setCliente] = useState("");
  const [rangoTallas, setRangoTallas] = useState("");
  function save() {
    if (!capId || !refName || !refCode) return;
    onSave(capId, {
      id: uid(), name: refName, reference: refCode, categoria: proto.categoria, silueta: proto.silueta, rango: proto.rango, fromProtoId: proto.id, status: "en_proceso", currentStage: proto.currentStage, stageStartedAt: today(), assignedTo: proto.assignedTo, createdAt: today(), image: proto.image, colores: cliente ? [cliente] : [], tallas: rangoTallas ? [rangoTallas] : [], bom: [...proto.bom], pom: [...proto.pom], approvals: [],
      observations: [{ id: uid(), user: "Sistema", role: "Sistema", text: `Promovida desde ${proto.reference}.`, date: nowISO(), type: "info", done: false }],
    }, proto.id);
    onClose();
  }
  return (
    <Modal title={`Promover "${proto.name}" → Referencia`} onClose={onClose} width={520}>
      <div style={{ padding: "10px 14px", background: T.jadeBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.jade, fontWeight: 600 }}>✓ BOM, POM, Categoría y Silueta se copiarán automáticamente</div>
      {!capsulasDisponibles.length ? (
        <div style={{ padding: "10px 14px", background: T.coralBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.coral, fontWeight: 600 }}>⚠ No hay cápsulas con ilustración aprobada todavía. Pide a la Dirección Creativa que apruebe una cápsula antes de promover.</div>
      ) : (
        <Field label="Cápsula destino">
          <select value={capId} onChange={(e) => setCapId(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
            {capsulasDisponibles.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.season})</option>)}
          </select>
        </Field>
      )}
      <Field label="Nombre de la referencia"><FInput value={refName} onChange={setRefName} placeholder="Nombre final" /></Field>
      <Field label="Código de referencia"><FInput value={refCode} onChange={setRefCode} placeholder="Ej: BC-002" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Cliente"><FSel value={cliente} onChange={setCliente} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
        <Field label="Rango de Tallas"><FSel value={rangoTallas} onChange={setRangoTallas} options={config.rangos} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="success" onClick={save} disabled={!capsulasDisponibles.length}>⬆ Promover</Btn>
      </div>
    </Modal>
  );
}

// Envía (o actualiza) el registro de este prototipo/referencia en el
// Cronograma de Muestras: taller asignado, fecha de entrega esperada,
// prioridad, tipo (género) y tipo de desarrollo. Si ya existe un registro
// activo para este ítem (`existing`), edita esos datos en vez de crear uno
// nuevo.
function EnviarTallerModal({ item, existing, ultimoTaller, config, onSave, onClose }) {
  // "existing" es null cuando el registro anterior ya quedó en "Enviado"
  // (se va a crear una ronda nueva). Aun así, el Taller/Prioridad/Tipo se
  // rellenan con lo último conocido (ultimoTaller) para no dejar el campo
  // Taller vacío y bloquear el botón Guardar solo por eso — sobre todo
  // cuando lo único que se quiere es dejar una nota de Modificar.
  const [form, setForm] = useState({
    taller: existing?.taller || ultimoTaller?.taller || "",
    fechaEntrega: existing?.fechaEntrega || "",
    prioridad: existing?.prioridad || ultimoTaller?.prioridad || "Media",
    tipo: existing?.tipo || ultimoTaller?.tipo || "",
    tipoDesarrollo: existing?.tipoDesarrollo || ultimoTaller?.tipoDesarrollo || "",
    estado: existing?.estado || "pendiente",
    notaModificar: existing?.notaModificar || "",
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  // Si elige "Modificar", tiene que quedar escrito qué sucedió o qué hay que
  // cambiar — ese texto se guarda en la entrada del cronograma y, si el
  // ítem existe en el aplicativo, también queda como Observación ahí mismo.
  const necesitaNota = form.estado === "modificar";
  function save() {
    if (!form.taller) return;
    if (necesitaNota && !form.notaModificar.trim()) return;
    onSave(form);
    onClose();
  }
  return (
    <Modal title={existing ? "Actualizar Taller de Muestra" : "Enviar a Taller de Muestra"} onClose={onClose} width={480}>
      <div style={{ padding: "10px 14px", background: T.denimBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.denim, fontWeight: 600 }}>🧵 {item.name} — {item.reference}</div>
      <Field label="Taller de Muestra"><FSel value={form.taller} onChange={set("taller")} options={config?.talleresMuestra || []} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Fecha de Entrega Esperada">
          <input type="date" value={form.fechaEntrega} onChange={(e) => set("fechaEntrega")(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
        </Field>
        <Field label="Prioridad"><FSel value={form.prioridad} onChange={set("prioridad")} options={config?.prioridadesMuestra || []} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo"><FSel value={form.tipo} onChange={set("tipo")} options={TIPO_GENERO_MUESTRA} /></Field>
        <Field label="Tipo de Desarrollo"><FSel value={form.tipoDesarrollo} onChange={set("tipoDesarrollo")} options={TIPO_DESARROLLO_MUESTRA} /></Field>
      </div>
      <Field label="Estado">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(ESTADO_MUESTRA).map(([v, def]) => (
            <button key={v} type="button" onClick={() => set("estado")(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${form.estado === v ? def.color : T.border}`, background: form.estado === v ? def.bg : T.white, color: form.estado === v ? def.color : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{def.label}</button>
          ))}
        </div>
      </Field>
      {necesitaNota && (
        <Field label="¿Qué sucedió o qué hay que modificar?">
          <textarea value={form.notaModificar} onChange={(e) => set("notaModificar")(e.target.value)} rows={3} placeholder="Escribe el detalle de la modificación..." style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.coral}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
        </Field>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save} disabled={!form.taller || (necesitaNota && !form.notaModificar.trim())}>{existing ? "Guardar cambios" : "🧵 Enviar a Taller"}</Btn>
      </div>
    </Modal>
  );
}
// Nota obligatoria al devolver una pieza "En revisión" mientras está en la
// etapa de Ilustración — permite medir por diseñador cuántas veces la
// Dirección Creativa le pidió cambios a la propuesta inicial (Estadísticas).
function NotaRevisionModal({ title, hint, onSave, onClose }) {
  const [nota, setNota] = useState("");
  function save() {
    if (!nota.trim()) return;
    onSave(nota.trim());
    onClose();
  }
  return (
    <Modal title={title || "Enviar a Revisión — Ilustración"} onClose={onClose} width={460}>
      <div style={{ padding: "10px 14px", background: T.amberBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.amber, fontWeight: 600 }}>{hint || "🎨 Registra qué hay que cambiar en la propuesta — queda en Observaciones y cuenta para las Estadísticas del diseñador."}</div>
      <Field label="¿Qué hay que cambiar?">
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} placeholder="Ej: ajustar proporción de manga, cambiar tono de color, revisar cuello..." style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.coral}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
      </Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="amber" onClick={save} disabled={!nota.trim()}>Enviar a Revisión</Btn>
      </div>
    </Modal>
  );
}
// Hilo de Observaciones propio de la Cápsula (no de cada referencia): queda
// aquí el ida y vuelta de aprobación de la ilustración/concepto completo —
// separado de la Hoja de Vida de las referencias individuales. Reutiliza el
// mismo ChatPanel que ya se usa para observaciones de Prototipos/Referencias.
function ObservacionesCapsulaModal({ capsula, currentUser, role, onSend, onMarkDone, onClose }) {
  return (
    <Modal title={`Observaciones de Ilustración — ${capsula.name}`} onClose={onClose} width={520}>
      <ChatPanel observations={capsula.observacionesIlustracion || []} currentUser={currentUser} role={role}
        onSend={(texto) => onSend(capsula.id, texto)}
        onMarkDone={(obsId) => onMarkDone(capsula.id, obsId)}
      />
    </Modal>
  );
}
function DetailView({ item, kind, role, perms, capsulas, onBack, onUpdateItem, onPromote, notify, onLogHistorial, capsula, stages, currentUser, config, cronogramaMuestras, onSendTaller, onUpdateTaller }) {
  const [tab, setTab] = useState("overview");
  const [showEdit, setShowEdit] = useState(false);
  const [showEnviado, setShowEnviado] = useState(false);
  const [showTaller, setShowTaller] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  // Registro más reciente de este ítem en el Cronograma de Muestras (si
  // existe). Se usa para mostrar su estado aquí mismo y para que el botón
  // "Enviar a Taller de Muestra" edite ese registro en vez de duplicarlo.
  const tallerMasReciente = (cronogramaMuestras || [])
    .filter((c) => c.itemId === item.id)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0] || null;
  const overdue = isOverdue(item, stages);
  const canEdit = perms.editar;
  const canAprobar = perms.aprobar;
  const canDeclinar = perms.declinar;
  const stageIdx = stages.findIndex((s) => s.id === item.currentStage);
  function patch(p) { onUpdateItem(p); }
  // extraObs: observaciones adicionales a insertar en la Hoja de Vida en el
  // MISMO patch que el cambio de estado (para no perder ninguna de las dos
  // por escribir el estado local desactualizado en dos llamadas seguidas).
  function changeStatus(s, extraData, extraObs) {
    const obs = { id: uid(), user: currentUser, role, text: `Estado → "${STATUS[s]?.label}".`, date: nowISO(), type: "update", done: false };
    patch({ status: s, ...(extraData || {}), observations: [...item.observations, ...(extraObs || []), obs] });
    if (s === "aprobado") notify({ id: uid(), icon: "✅", title: "Aprobado", msg: item.name });
    // Historial por cliente/mes: un prototipo se registra al Aprobarse (se
    // promueva o no después a una cápsula); una referencia de cápsula se
    // registra tanto al Aprobarse como al Declinarse.
    const debeRegistrar = kind === "proto" ? s === "aprobado" : s === "aprobado" || s === "declinado";
    if (onLogHistorial && debeRegistrar) {
      onLogHistorial({
        tipo: kind === "proto" ? "proto" : "capsula_ref",
        itemId: item.id,
        capsulaId: kind === "ref" ? capsula?.id : null,
        capsulaName: kind === "ref" ? capsula?.name : null,
        nombre: item.name,
        referencia: item.reference,
        cliente: item.cliente || item.colores?.[0] || "(Sin cliente)",
        resultado: s,
        mes: today().slice(0, 7),
        fecha: nowISO(),
      });
    }
  }
  function handleCotizacion() { changeStatus("enviado_cotizacion"); }
  // Cuando la Dirección Creativa devuelve una pieza que está en la etapa de
  // Ilustración, se exige escribir qué hay que cambiar — queda como
  // Observación (Hoja de Vida) y con un "type" propio (revision_ilustracion)
  // para poder contar en Estadísticas cuántas rondas de revisión tuvo cada
  // diseñador en esa etapa, sin depender de leer el texto.
  function handleMarcarRevision(nota) {
    const obsNota = { id: uid(), user: currentUser, role, text: `🎨 Revisión de Ilustración: ${nota}`, date: nowISO(), type: "revision_ilustracion", done: false };
    changeStatus("en_revision", {}, [obsNota]);
    setTab("chat");
  }
  function handleEnviado(transporteData) {
    const obs = { id: uid(), user: currentUser, role, text: `Enviado — Empresa: ${transporteData.empresa} · Guía: ${transporteData.guia || "N/A"} · Fecha: ${transporteData.fecha}`, date: nowISO(), type: "update", done: false };
    patch({ status: "enviado", envioEmpresa: transporteData.empresa, envioFecha: transporteData.fecha, envioGuia: transporteData.guia || "", observations: [...item.observations, obs] });
    notify({ id: uid(), icon: "📦", title: "Enviado al Cliente", msg: `${item.reference} — ${transporteData.empresa}` });
  }
  // Si ya hay un registro de taller activo (no "enviado") para este ítem, lo
  // edita; si no, crea uno nuevo con los datos del prototipo/referencia
  // (cliente, categoría, silueta, tela, foto) copiados automáticamente.
  function handleGuardarTaller(data) {
    // Si marcan "Modificar", la nota que escriben queda como Observación de
    // este ítem (Hoja de Vida) y la vista salta directo a la pestaña
    // Observaciones — así queda registrado qué pasó, no solo el estado.
    if (data.estado === "modificar" && data.notaModificar?.trim()) {
      const obs = { id: uid(), user: currentUser, role, text: `🧵 Modificar (Taller de Muestra): ${data.notaModificar.trim()}`, date: nowISO(), type: "info", done: false };
      patch({ observations: [...item.observations, obs] });
      setTab("chat");
    }
    if (tallerMasReciente && tallerMasReciente.estado !== "enviado") {
      onUpdateTaller(tallerMasReciente.id, data);
      return;
    }
    onSendTaller({
      itemId: item.id,
      kind,
      capsulaId: kind === "ref" ? capsula?.id : null,
      nombre: item.name,
      referencia: item.reference,
      cliente: item.cliente || item.colores?.[0] || "",
      categoria: item.categoria || "",
      silueta: item.silueta || "",
      rango: item.rango || item.tallas?.[0] || "",
      tela: item.tipoTela || "",
      image: item.image || null,
      ...data,
    });
  }
  const canAdmin = currentUser?.isAdmin || perms.admin;
  // Igual que canAdminIlustracion en CapsulasView: permiso dedicado para
  // aprobar/devolver ilustración, independiente de "admin", pensado para un
  // rol tipo "Directora Creativa". El dueño del sistema conserva respaldo.
  const canRevisarIlustracion = currentUser?.isAdmin || perms.ilustracion;
  function advanceStage() {
    if (!canAdmin) return;
    if (stageIdx >= stages.length - 1) return;
    const next = stages[stageIdx + 1];
    const obs = { id: uid(), user: currentUser, role, text: `Etapa: ${stages[stageIdx].label} → ${next.label}.`, date: nowISO(), type: "update", done: false };
    patch({ currentStage: next.id, stageStartedAt: today(), observations: [...item.observations, obs] });
  }
  function retreatStage() {
    if (!canAdmin) return;
    if (stageIdx <= 0) return;
    const prev = stages[stageIdx - 1];
    const obs = { id: uid(), user: currentUser, role, text: `Etapa retrocedida: ${stages[stageIdx].label} → ${prev.label}.`, date: nowISO(), type: "update", done: false };
    patch({ currentStage: prev.id, stageStartedAt: today(), observations: [...item.observations, obs] });
  }
  function sendObs(text) {
    patch({ observations: [...item.observations, { id: uid(), user: currentUser, role, text, date: nowISO(), type: "info", done: false }] });
  }
  function markDone(obsId) {
    patch({ observations: item.observations.map((o) => (o.id === obsId ? { ...o, done: true } : o)) });
  }
  const tabs = [
    { id: "overview", label: "Resumen" },
    { id: "hojavida", label: "📋 Hoja de Vida" },
    { id: "bom", label: `BOM (${item.bom.length})` },
    { id: "pom", label: `POM (${item.pom.length})` },
    ...(kind === "ref" ? [{ id: "aprobaciones", label: `Aprobaciones (${item.approvals?.length || 0})` }] : []),
    { id: "chat", label: `Observaciones (${item.observations.length})` },
  ];
  const st = item.status;
  const noFinalState = !["aprobado", "declinado"].includes(st);
  return (
    <div>
      {showEdit && kind === "proto" && <EditProtoModal proto={item} config={config} onSave={(p) => onUpdateItem(p)} onClose={() => setShowEdit(false)} />}
      {showEdit && kind === "ref" && <EditRefModal refData={item} config={config} onSave={(p) => onUpdateItem(p)} onClose={() => setShowEdit(false)} />}
      {showEnviado && <EnviadoModal onSave={handleEnviado} onClose={() => setShowEnviado(false)} />}
      {showTaller && <EnviarTallerModal item={item} existing={tallerMasReciente?.estado !== "enviado" ? tallerMasReciente : null} ultimoTaller={tallerMasReciente} config={config} onSave={handleGuardarTaller} onClose={() => setShowTaller(false)} />}
      {showRevision && <NotaRevisionModal onSave={handleMarcarRevision} onClose={() => setShowRevision(false)} />}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13, color: T.ink }}>← Volver</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.slate, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>{kind === "proto" ? `Prototipo · ${item.reference}` : `${capsula?.name} · ${item.reference}`}</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.ink }}>{item.name}</h2>
        </div>
        {perms.editar && <Btn variant="ghost" small onClick={() => setShowEdit(true)}>✏ Editar</Btn>}
        <Badge status={item.status} />
        {overdue && <OverduePill item={item} stages={stages} />}
      </div>
      {kind === "ref" && item.fromProtoId && <div style={{ marginBottom: 12, padding: "7px 14px", background: T.denimBg, borderRadius: 8, fontSize: 12, color: T.denim, fontWeight: 600 }}>🔗 Promovida desde prototipo aprobado</div>}
      {item.envioEmpresa && (
        <div style={{ marginBottom: 12, padding: "12px 16px", background: "#EFF6FF", borderRadius: 10, border: "1px solid #BFDBFE", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div><span style={{ fontSize: 11, color: "#5A5A7A", fontWeight: 700, textTransform: "uppercase" }}>Empresa</span><div style={{ fontWeight: 800, color: "#0369A1" }}>{item.envioEmpresa}</div></div>
          <div><span style={{ fontSize: 11, color: "#5A5A7A", fontWeight: 700, textTransform: "uppercase" }}>Guía</span><div style={{ fontWeight: 800, color: "#0369A1" }}>{item.envioGuia || "—"}</div></div>
          <div><span style={{ fontSize: 11, color: "#5A5A7A", fontWeight: 700, textTransform: "uppercase" }}>Fecha</span><div style={{ fontWeight: 800, color: "#0369A1" }}>{item.envioFecha}</div></div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, marginBottom: 16, alignItems: "start" }}>
        <ImageUploader image={item.image} onImage={(img) => patch({ image: img })} readonly={!canEdit} />
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {item.categoria && <CatTag text={item.categoria} />}
            {item.silueta && <span style={{ padding: "2px 8px", borderRadius: 3, background: T.violetBg, color: T.violet, fontSize: 10, fontWeight: 800 }}>{item.silueta}</span>}
            {item.rango && <span style={{ padding: "2px 8px", borderRadius: 3, background: T.amberBg, color: T.amber, fontSize: 10, fontWeight: 800 }}>{item.rango}</span>}
          </div>
          <div style={{ background: T.white, borderRadius: 12, padding: "16px 18px", border: `1px solid ${overdue ? T.coral : T.border}`, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Ruta crítica</span>
              {canAdmin && (
                <div style={{ display: "flex", gap: 6 }}>
                  {stageIdx > 0 && <Btn small variant="secondary" onClick={retreatStage}>← Retroceder</Btn>}
                  {stageIdx < stages.length - 1 && <Btn small onClick={advanceStage}>Avanzar →</Btn>}
                </div>
              )}
            </div>
            <StageBar currentStage={item.currentStage} stages={stages} />
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12 }}>
              <span style={{ color: T.slate }}>Etapa: <strong style={{ color: T.denim }}>{stages.find((s) => s.id === item.currentStage)?.label}</strong></span>
              <span style={{ color: T.slate }}>Días: <strong>{daysAgo(item.stageStartedAt)}d</strong></span>
            </div>
            {overdue && <div style={{ marginTop: 10, padding: "8px 12px", background: T.coralBg, borderRadius: 6, fontSize: 12, color: T.coral, fontWeight: 600 }}>⚑ Vencida — {daysAgo(item.stageStartedAt)}d (límite {stages.find((s) => s.id === item.currentStage)?.days}d)</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {noFinalState && canAprobar && <Btn variant="success" onClick={() => changeStatus("aprobado")}>✓ Aprobar</Btn>}
            {noFinalState && canDeclinar && <Btn variant="danger" onClick={() => changeStatus("declinado")}>✕ Declinar</Btn>}
            {canAdmin && (
              <>
                {noFinalState && !["enviado_cotizacion", "enviar_cliente", "enviado"].includes(st) && (
                  <>
                    <Btn variant="ghost" onClick={() => changeStatus("en_proceso")}>En proceso</Btn>
                    {item.currentStage !== "ilustracion" && (
                      <Btn variant="amber" onClick={() => changeStatus("en_revision")}>En revisión</Btn>
                    )}
                  </>
                )}
                {noFinalState && st !== "enviado_cotizacion" && st !== "enviar_cliente" && st !== "enviado" && <Btn variant="ghost" onClick={handleCotizacion}>📤 Cotización</Btn>}
                {st === "enviado_cotizacion" && <button onClick={() => changeStatus("enviar_cliente")} style={{ padding: "9px 18px", background: "#ECFEFF", color: "#0E7490", border: "1.5px solid #0E7490", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✈ Enviar al Cliente</button>}
                {st === "enviar_cliente" && <button onClick={() => setShowEnviado(true)} style={{ padding: "9px 18px", background: "#EFF6FF", color: "#0369A1", border: "1.5px solid #0369A1", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📦 Registrar Envío</button>}
                {kind === "proto" && item.status === "aprobado" && !item.promotedTo && capsulas.length > 0 && <Btn variant="success" onClick={() => onPromote(item)}>⬆ Promover</Btn>}
              </>
            )}
            {/* Botón "En revisión" para etapa Ilustración: independiente del
                bloque de canAdmin de arriba, gated por canRevisarIlustracion
                (permiso dedicado "ilustracion" o dueño del sistema), para que
                una Directora Creativa sin permiso "admin" general igual lo vea. */}
            {canRevisarIlustracion && item.currentStage === "ilustracion" && noFinalState && !["enviado_cotizacion", "enviar_cliente", "enviado"].includes(st) && (
              <Btn variant="amber" onClick={() => setShowRevision(true)}>En revisión</Btn>
            )}
            {!canAdmin && canEdit && kind === "proto" && item.status === "aprobado" && !item.promotedTo && capsulas.length > 0 && <Btn variant="success" onClick={() => onPromote(item)}>⬆ Promover</Btn>}
            {kind === "proto" && item.promotedTo && <span style={{ padding: "6px 12px", background: T.jadeBg, color: T.jade, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>✓ Promovido</span>}
            {canEdit && <Btn variant="ghost" onClick={() => setShowTaller(true)}>🧵 {tallerMasReciente && tallerMasReciente.estado !== "enviado" ? "Actualizar Taller de Muestra" : "Enviar a Taller de Muestra"}</Btn>}
          </div>
          {tallerMasReciente && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: ESTADO_MUESTRA[tallerMasReciente.estado]?.bg, borderRadius: 8, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: ESTADO_MUESTRA[tallerMasReciente.estado]?.color }}>🧵 {ESTADO_MUESTRA[tallerMasReciente.estado]?.label}</span>
              <span style={{ fontSize: 12, color: T.slate }}>Taller: <strong style={{ color: T.ink }}>{tallerMasReciente.taller}</strong></span>
              {tallerMasReciente.fechaEntrega && <span style={{ fontSize: 12, color: T.slate }}>Entrega: <strong style={{ color: T.ink }}>{tallerMasReciente.fechaEntrega}</strong></span>}
              {tallerMasReciente.estado !== "enviado" && (
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <button onClick={() => onUpdateTaller(tallerMasReciente.id, { estado: "aprobado" })} style={{ padding: "4px 10px", background: T.jade, color: T.white, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓ Aprobar muestra</button>
                  {/* "Modificar" siempre pasa por el modal (botón de arriba) porque
                      exige escribir qué sucedió — no es un cambio de un solo clic
                      como Aprobar, para no perder ese detalle. */}
                  <button onClick={() => setShowTaller(true)} style={{ padding: "4px 10px", background: T.coral, color: T.white, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✕ Modificar</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {kind === "ref" && (item.colores?.length > 0 || item.tallas?.length > 0) && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {item.colores?.length > 0 && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 6 }}>Cliente</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{item.colores.map((c) => <span key={c} style={{ padding: "3px 10px", background: T.canvas, borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{c}</span>)}</div>
            </div>
          )}
          {item.tallas?.length > 0 && (
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 6 }}>Rango de Tallas</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{item.tallas.map((t) => <span key={t} style={{ padding: "3px 10px", background: T.canvas, borderRadius: 4, fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}` }}>{t}</span>)}</div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", borderBottom: `2px solid ${T.border}`, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 18px", border: "none", background: "none", cursor: "pointer", fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? T.ink : T.slate, borderBottom: `2px solid ${tab === t.id ? T.ink : "transparent"}`, marginBottom: -2, fontSize: 13 }}>{t.label}</button>
        ))}
      </div>
      <div style={{ background: T.white, borderRadius: 12, padding: 24, border: `1px solid ${T.border}` }}>
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Responsable", value: item.assignedTo || "—" },
              { label: "Ref", value: item.reference },
              { label: "Cliente", value: item.cliente || item.colores?.[0] || "—" },
              { label: "Tipo de Tela", value: item.tipoTela || "—" },
              { label: "Base de Moldería", value: item.baseMolderia || "—" },
              { label: "Creado", value: item.createdAt },
              { label: "Etapa", value: stages.find((s) => s.id === item.currentStage)?.label },
              { label: "Días en etapa", value: `${daysAgo(item.stageStartedAt)}d` },
              { label: "Materiales BOM", value: item.bom.length },
            ].map((it) => (
              <div key={it.label} style={{ padding: "12px 14px", background: T.canvas, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: T.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{it.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginTop: 3 }}>{it.value}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "hojavida" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Hoja de Vida</div>
                <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>Historial completo de observaciones y modificaciones</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="ghost" onClick={() => exportHojaDeVidaXLSX(item, kind, capsula?.name)}>📊 Exportar Excel</Btn>
                <Btn variant="success" onClick={() => exportHojaDeVidaHTML(item, kind, capsula?.name)}>🖨 HTML Visual</Btn>
              </div>
            </div>
            <div style={{ background: T.canvas, borderRadius: 12, padding: 16, marginBottom: 20, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { label: "Ref", value: item.reference },
                { label: "Cliente", value: item.cliente || item.colores?.[0] || "—" },
                { label: "Tipo de Tela", value: item.tipoTela || "—" },
                { label: "Base de Moldería", value: item.baseMolderia || "—" },
                { label: "Categoría", value: item.categoria || "—" },
                { label: "Silueta", value: item.silueta || "—" },
              ].map((f) => (
                <div key={f.label} style={{ padding: "10px 12px", background: T.white, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 2 }}>{f.value}</div>
                </div>
              ))}
            </div>
            {item.image && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Imagen de Referencia</div>
                <img src={item.image} alt="ref" style={{ width: 220, height: 160, objectFit: "cover", borderRadius: 10, border: `1px solid ${T.border}` }} />
              </div>
            )}
            {(() => {
              const userObs = (item.observations || []).filter((o) => o.type !== "update" && o.user !== "Sistema");
              return (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 12 }}>Historial de Observaciones ({userObs.length})</div>
                  {!userObs.length ? (
                    <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 24 }}>Sin observaciones registradas.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {userObs.map((o, i) => (
                        <div key={o.id || i} style={{ padding: "12px 16px", background: o.done ? T.jadeBg : T.canvas, borderRadius: 10, border: `1px solid ${o.done ? T.jade + "33" : T.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <Avatar name={o.user} size={28} />
                              <div><span style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{o.user}</span><span style={{ fontSize: 11, color: T.slate, marginLeft: 8 }}>{o.role}</span></div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: T.slate }}>{o.date ? new Date(o.date).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : ""}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: o.done ? T.jadeBg : "#EDEDF2", color: o.done ? T.jade : T.slate }}>{o.done ? "✓ Resuelta" : "⏳ Pendiente"}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.5, paddingLeft: 36 }}>{o.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
        {tab === "bom" && <BomTable bom={item.bom} role={role} />}
        {tab === "pom" && <PomTable pom={item.pom} tallas={item.tallas} />}
        {tab === "aprobaciones" && kind === "ref" && (
          <div>
            {!item.approvals || !item.approvals.length ? (
              <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 24 }}>Sin aprobaciones.</div>
            ) : (
              item.approvals.map((ap) => (
                <div key={ap.id} style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: `1px solid ${T.border}` }}>
                  <Avatar name={ap.by} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{ap.by}</div>
                    <div style={{ fontSize: 12, color: T.slate }}>{ap.stage} · {ap.date}</div>
                    {ap.comment && <div style={{ fontSize: 13, fontStyle: "italic", marginTop: 4 }}>"{ap.comment}"</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {tab === "chat" && <ChatPanel observations={item.observations.filter((o) => o.type !== "update" && o.user !== "Sistema")} currentUser={currentUser} role={role} onSend={sendObs} onMarkDone={markDone} />}
      </div>
    </div>
  );
}

function Card({ item, kind, onClick, onPromote, role, perms, stages }) {
  const overdue = isOverdue(item, stages), pending = item.observations.filter((o) => !o.done).length;
  return (
    <div onClick={onClick} style={{ background: T.white, borderRadius: 12, padding: 18, cursor: "pointer", border: `1px solid ${overdue ? T.coral : T.border}`, transition: "box-shadow 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,26,46,0.09)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      {item.image && <div style={{ width: "100%", height: 90, borderRadius: 8, marginBottom: 10, overflow: "hidden" }}><img src={item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            {item.categoria && <CatTag text={item.categoria} />}
            <span style={{ fontSize: 11, color: T.slate }}>{item.reference}</span>
            {pending > 0 && <span style={{ fontSize: 10, background: T.amberBg, color: T.amber, padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>💬 {pending}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{item.name}</div>
          {item.silueta && <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{item.silueta}{item.rango ? ` · ${item.rango}` : ""}</div>}
        </div>
        {overdue && <span style={{ color: T.coral, fontSize: 18 }}>⚑</span>}
      </div>
      <div style={{ marginBottom: 10 }}>
        <StageBar currentStage={item.currentStage} stages={stages} compact />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11, color: T.slate }}>
          <span>{stages.find((s) => s.id === item.currentStage)?.label}</span>
          <OverduePill item={item} stages={stages} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Badge status={item.status} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Avatar name={item.assignedTo || "?"} size={22} /><span style={{ fontSize: 11, color: T.slate }}>{item.assignedTo}</span></div>
      </div>
      {kind === "proto" && item.status === "aprobado" && !item.promotedTo && perms?.editar && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <button onClick={(e) => { e.stopPropagation(); onPromote(item); }} style={{ width: "100%", padding: "7px", background: T.jadeBg, border: `1px dashed ${T.jade}`, borderRadius: 8, color: T.jade, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>⬆ Promover a Cápsula</button>
        </div>
      )}
      {kind === "proto" && item.promotedTo && <div style={{ marginTop: 8, fontSize: 11, color: T.jade, fontWeight: 700 }}>✓ Promovido</div>}
    </div>
  );
}
function ProtosView({ protos, role, perms, onSelect, onNew, onPromote, capsulas, stages, isAdmin, onDeleteProto, config, onCrearEnvio }) {
  const [filter, setFilter] = useState("todos");
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [confirmDel, setConfirmDel] = useState(null);
  // Selección múltiple para armar un envío/bitácora agrupado — solo tiene
  // sentido en la pestaña "Enviar al Cliente". Se limpia al cambiar de
  // pestaña para no arrastrar selección de un filtro a otro.
  const [seleccionados, setSeleccionados] = useState([]);
  const [showNuevoEnvio, setShowNuevoEnvio] = useState(false);
  function cambiarFiltro(v) { setFilter(v); setSeleccionados([]); }
  function toggleSel(id) { setSeleccionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  // Cuántos prototipos ACTIVOS tiene cada cliente — igual criterio que la
  // pestaña "Todos" de estado (excluye Aprobados/Declinados), para que el
  // número refleje la carga de trabajo pendiente y no arrastre prototipos
  // ya cerrados hace tiempo.
  const protosActivos = protos.filter((p) => !["aprobado", "declinado"].includes(p.status));
  const conteoPorCliente = {};
  protosActivos.forEach((p) => {
    const c = p.cliente || p.colores?.[0];
    if (!c) return;
    conteoPorCliente[c] = (conteoPorCliente[c] || 0) + 1;
  });
  // El desplegable incluye TODOS los clientes registrados en el maestro de
  // Clientes (Administrador General), no solo los que ya tienen un
  // prototipo — así un cliente recién creado no falta en la lista, y se
  // suman también nombres sueltos que ya existan en los datos aunque no
  // estén en el maestro (compatibilidad con datos viejos).
  const clientesDisponibles = [...new Set([...(config?.clientes || []).map((c) => c.nombre), ...Object.keys(conteoPorCliente)])].sort((a, b) => a.localeCompare(b));
  // "Todos" oculta Aprobados/Promovidos/Declinados para no saturar el tablero
  // (un prototipo promovido sigue con status "aprobado", así que basta con
  // excluir aprobado/declinado). Siguen disponibles en sus propias pestañas.
  const porEstado = filter === "todos" ? protos.filter((p) => !["aprobado", "declinado"].includes(p.status)) : protos.filter((p) => p.status === filter);
  const filtered = clienteFiltro === "todos" ? porEstado : porEstado.filter((p) => (p.cliente || p.colores?.[0]) === clienteFiltro);
  return (
    <div>
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar el prototipo <strong>"{confirmDel.name}"</strong>? Esta acción no se puede deshacer.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { onDeleteProto(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
            </div>
          </div>
        </div>
      )}
      {showNuevoEnvio && (
        <NuevoEnvioModal
          items={protos.filter((p) => seleccionados.includes(p.id)).map((p) => ({ ...p, kind: "proto" }))}
          config={config}
          onSave={onCrearEnvio}
          onClose={() => { setShowNuevoEnvio(false); setSeleccionados([]); }}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Prototipos</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Pruebas independientes</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => exportToExcel(protos, capsulas)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#217346", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>📊 Exportar</button>
          {perms.editar && <Btn onClick={onNew}>+ Nuevo Prototipo</Btn>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.slate }}>🏢 Clientes</span>
        <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)} style={{ padding: "7px 12px", border: `1.5px solid ${clienteFiltro !== "todos" ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, color: clienteFiltro !== "todos" ? T.denim : T.ink, background: clienteFiltro !== "todos" ? T.denimBg : T.white, outline: "none", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
          <option value="todos">Todos ({protosActivos.length})</option>
          {clientesDisponibles.map((c) => <option key={c} value={c}>{c} ({conteoPorCliente[c] || 0})</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {[["todos", "Todos"], ["aprobado", "Aprobados"], ["declinado", "Declinados"], ["en_proceso", "En proceso"], ["en_revision", "En revisión"], ["enviado_cotizacion", "En cotización"], ["enviar_cliente", "Enviar al Cliente"], ["enviado", "Enviado"]].map(([v, label]) => (
          <button key={v} onClick={() => cambiarFiltro(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${filter === v ? T.ink : T.border}`, background: filter === v ? T.ink : T.white, color: filter === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
        {filter === "enviar_cliente" && seleccionados.length > 0 && (
          <button onClick={() => setShowNuevoEnvio(true)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#0E7490", color: T.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            📜 Crear Envío ({seleccionados.length})
          </button>
        )}
      </div>
      {!filtered.length && <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>No hay prototipos con este filtro.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {filtered.map((p) => (
          <div key={p.id} style={{ position: "relative" }}>
            {isAdmin && (
              <button onClick={(e) => { e.stopPropagation(); setConfirmDel(p); }} title="Borrar prototipo (solo administrador)"
                style={{ position: "absolute", top: 8, right: 8, zIndex: 2, width: 26, height: 26, borderRadius: "50%", background: T.white, border: `1.5px solid ${T.coral}`, color: T.coral, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(26,26,46,0.12)" }}
              >🗑</button>
            )}
            {filter === "enviar_cliente" && (
              <input
                type="checkbox"
                checked={seleccionados.includes(p.id)}
                onChange={(e) => { e.stopPropagation(); toggleSel(p.id); }}
                onClick={(e) => e.stopPropagation()}
                title="Seleccionar para envío"
                style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 20, height: 20, cursor: "pointer" }}
              />
            )}
            <Card item={p} kind="proto" onClick={() => onSelect(p.id)} onPromote={onPromote} role={role} perms={perms} stages={stages} />
          </div>
        ))}
      </div>
    </div>
  );
}
function CapsulasView({ capsulas, role, perms, currentUser, onSelectRef, onNewCapsula, onNewRef, onEditCapsula, stages, isAdmin, onDeleteCapsula, config, onSetIlustracion, onSendObsCapsula, onMarkDoneObsCapsula, onCrearEnvio }) {
  const [filter, setFilter] = useState("todos");
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [editCap, setEditCap] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [revisionCap, setRevisionCap] = useState(null);
  const [obsCapsula, setObsCapsula] = useState(null);
  // Selección múltiple para armar un envío/bitácora agrupado — una selección
  // por cápsula (cada cápsula es su propia "colección"), solo tiene sentido
  // en la pestaña "Enviar al Cliente". `envioCapsula` guarda la cápsula para
  // la que se está armando el envío (para saber qué referencias mostrar en
  // el modal).
  const [seleccionados, setSeleccionados] = useState({});
  const [envioCapsula, setEnvioCapsula] = useState(null);
  function cambiarFiltro(v) { setFilter(v); setSeleccionados({}); }
  function toggleSel(capId, refId) {
    setSeleccionados((s) => {
      const actual = s[capId] || [];
      const nuevo = actual.includes(refId) ? actual.filter((x) => x !== refId) : [...actual, refId];
      return { ...s, [capId]: nuevo };
    });
  }
  // Permiso dedicado "ilustracion" (pensado para un rol tipo "Directora
  // Creativa"), separado del permiso general "admin" — así se puede limitar
  // quién aprueba/devuelve ilustración sin darle todos los demás permisos de
  // administrador. El dueño del sistema (isAdmin) siempre conserva acceso de
  // respaldo por si la Directora Creativa no está disponible.
  const canAdminIlustracion = isAdmin || perms.ilustracion;
  const FILTERS = [["todos", "Todos"], ["aprobado", "Aprobadas"], ["declinado", "Declinadas"], ["en_proceso", "En proceso"], ["en_revision", "En revisión"], ["enviado_cotizacion", "En cotización"], ["enviar_cliente", "Enviar al Cliente"], ["enviado", "Enviado"]];
  // El cliente de la cápsula (elegido al crearla) manda sobre el cliente
  // suelto de cada referencia — así toda la cápsula queda atribuida a un solo
  // cliente aunque alguna referencia vieja no tenga el suyo propio bien puesto.
  function refCliente(cap, r) { return cap.cliente || r.cliente || r.colores?.[0]; }
  // Cliente de la cápsula completa: el propio si lo tiene, si no se infiere
  // de la primera de sus referencias que tenga uno (dato viejo).
  function capCliente(cap) {
    if (cap.cliente) return cap.cliente;
    const conRef = cap.referencias.find((r) => r.cliente || r.colores?.[0]);
    return conRef ? (conRef.cliente || conRef.colores?.[0]) : null;
  }
  // Una cápsula cuenta como "activa" si le queda al menos una referencia sin
  // resolver (o si todavía no tiene ninguna referencia cargada) — igual
  // criterio que la pestaña "Todos" de estado. Las cápsulas 100% Aprobadas o
  // Declinadas ya no suman aquí, para que el número refleje trabajo
  // pendiente y no arrastre cápsulas cerradas hace tiempo.
  const capsulasActivas = capsulas.filter((cap) => cap.referencias.length === 0 || cap.referencias.some((r) => !["aprobado", "declinado"].includes(r.status)));
  // Cuántas cápsulas activas tiene cada cliente.
  const conteoPorCliente = {};
  capsulasActivas.forEach((cap) => {
    const c = capCliente(cap);
    if (!c) return;
    conteoPorCliente[c] = (conteoPorCliente[c] || 0) + 1;
  });
  // El desplegable incluye TODOS los clientes registrados en el maestro de
  // Clientes (Administrador General), no solo los que ya tienen una cápsula
  // — así un cliente/cápsula recién creada no falta en la lista.
  const clientesDisponibles = [...new Set([...(config?.clientes || []).map((c) => c.nombre), ...Object.keys(conteoPorCliente)])].sort((a, b) => a.localeCompare(b));
  // "Todos" oculta referencias Aprobadas/Declinadas (y cápsulas que solo
  // tengan referencias en esos estados) para no saturar el tablero. Siguen
  // disponibles en las pestañas "Aprobadas"/"Declinadas". El filtro de
  // cliente se combina (AND) con el de estado.
  function filteredRefs(cap) {
    let refs = filter === "todos" ? cap.referencias.filter((r) => !["aprobado", "declinado"].includes(r.status)) : cap.referencias.filter((r) => r.status === filter);
    if (clienteFiltro !== "todos") refs = refs.filter((r) => refCliente(cap, r) === clienteFiltro);
    return refs;
  }
  // Una cápsula recién creada empieza con referencias: [] — sin este OR
  // quedaba oculta en TODAS las pestañas de filtro (nunca cumple
  // filteredRefs(cap).length > 0) y el usuario no podía volver a encontrarla
  // para agregarle referencias. Una cápsula vacía siempre se muestra, sin
  // importar el filtro de estado/cliente activo.
  const visibleCapsulas = capsulas.filter((cap) => cap.referencias.length === 0 || filteredRefs(cap).length > 0);
  return (
    <div>
      {editCap && (
        <EditNombreModal item={editCap} tipo="capsula" config={config}
          onSave={(p) => { onEditCapsula(editCap.id, p); setEditCap(null); }}
          onClose={() => setEditCap(null)}
        />
      )}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar la cápsula <strong>"{confirmDel.name}"</strong> y sus {confirmDel.referencias?.length || 0} referencia{confirmDel.referencias?.length !== 1 ? "s" : ""}? Esta acción no se puede deshacer.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { onDeleteCapsula(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Cápsulas</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Colecciones con múltiples referencias</p></div>
        {perms.editar && <Btn onClick={onNewCapsula}>+ Nueva Cápsula</Btn>}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.slate }}>🏢 Clientes</span>
        <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)} style={{ padding: "7px 12px", border: `1.5px solid ${clienteFiltro !== "todos" ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, color: clienteFiltro !== "todos" ? T.denim : T.ink, background: clienteFiltro !== "todos" ? T.denimBg : T.white, outline: "none", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
          <option value="todos">Todos ({capsulasActivas.length})</option>
          {clientesDisponibles.map((c) => <option key={c} value={c}>{c} ({conteoPorCliente[c] || 0})</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {FILTERS.map(([v, label]) => (
          <button key={v} onClick={() => cambiarFiltro(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${filter === v ? T.ink : T.border}`, background: filter === v ? T.ink : T.white, color: filter === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      {envioCapsula && (
        <NuevoEnvioModal
          items={envioCapsula.referencias
            .filter((r) => (seleccionados[envioCapsula.id] || []).includes(r.id))
            .map((r) => ({ ...r, kind: "ref", capsulaId: envioCapsula.id, capsulaNombre: envioCapsula.name, cliente: refCliente(envioCapsula, r) }))}
          config={config}
          onSave={onCrearEnvio}
          onClose={() => { setEnvioCapsula(null); setSeleccionados((s) => ({ ...s, [envioCapsula.id]: [] })); }}
        />
      )}
      {!visibleCapsulas.length && <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>No hay cápsulas con este filtro.</div>}
      {visibleCapsulas.map((cap) => {
        const refs = filteredRefs(cap);
        const od = cap.referencias.filter((r) => isOverdue(r, stages)).length;
        const aprobada = ilustracionAprobada(cap);
        const estadoIlustracion = ILUSTRACION_CAPSULA_ESTADO[cap.ilustracionEstado] || ILUSTRACION_CAPSULA_ESTADO.aprobado;
        const rondasIlustracion = (cap.observacionesIlustracion || []).filter((o) => o.type === "revision_ilustracion_capsula").length;
        return (
          <div key={cap.id} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: T.canvas, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🗂</span>
                <div><div style={{ fontWeight: 800, fontSize: 16, color: T.ink }}>{cap.name}</div><div style={{ fontSize: 12, color: T.slate }}>{cap.cliente ? `${cap.cliente} · ` : ""}{cap.season} · {cap.referencias.length} ref · {cap.createdAt}{cap.assignedTo ? ` · 👤 ${cap.assignedTo}` : ""}</div></div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {od > 0 && <span style={{ padding: "3px 10px", background: T.coralBg, color: T.coral, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>⚑ {od}</span>}
                {!aprobada && <span title="La ilustración/concepto de la cápsula debe ser aprobado antes de poder agregarle referencias" style={{ padding: "3px 10px", background: estadoIlustracion.bg, color: estadoIlustracion.color, borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🎨 {estadoIlustracion.label}{rondasIlustracion > 0 ? ` · ${rondasIlustracion} revisión${rondasIlustracion !== 1 ? "es" : ""}` : ""}</span>}
                <Btn small variant="ghost" onClick={() => setObsCapsula(cap)}>💬 Observaciones{cap.observacionesIlustracion?.length ? ` (${cap.observacionesIlustracion.length})` : ""}</Btn>
                {!aprobada && canAdminIlustracion && (
                  <>
                    <Btn small variant="success" onClick={() => onSetIlustracion(cap.id, "aprobado", null)}>✓ Aprobar Ilustración</Btn>
                    {/* Disponible aunque ya esté "en_revision": permite dejar una
                        NUEVA ronda de revisión (con su propia nota) si al volver a
                        mirar la ilustración corregida todavía hay que pedir más
                        cambios — no solo la primera vez. */}
                    <Btn small variant="danger" onClick={() => setRevisionCap(cap)}>✕ En revisión</Btn>
                  </>
                )}
                {perms.editar && <Btn small variant="ghost" onClick={() => setEditCap(cap)}>✏ Editar</Btn>}
                {perms.editar && (aprobada ? <Btn small onClick={() => onNewRef(cap)}>+ Referencia</Btn> : <span title="Requiere aprobación de Ilustración de la Dirección Creativa"><Btn small disabled>+ Referencia</Btn></span>)}
                {filter === "enviar_cliente" && (seleccionados[cap.id] || []).length > 0 && (
                  <button onClick={() => setEnvioCapsula(cap)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#0E7490", color: T.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    📜 Crear Envío ({(seleccionados[cap.id] || []).length})
                  </button>
                )}
                {isAdmin && <Btn small variant="danger" onClick={() => setConfirmDel(cap)}>🗑 Borrar</Btn>}
              </div>
            </div>
            {!refs.length ? (
              <div style={{ padding: 24, textAlign: "center", color: T.slate, fontSize: 13 }}>Sin referencias con este filtro.</div>
            ) : (
              <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
                {refs.map((r) => (
                  <div key={r.id} style={{ position: "relative" }}>
                    {filter === "enviar_cliente" && (
                      <input
                        type="checkbox"
                        checked={(seleccionados[cap.id] || []).includes(r.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSel(cap.id, r.id); }}
                        onClick={(e) => e.stopPropagation()}
                        title="Seleccionar para envío"
                        style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 20, height: 20, cursor: "pointer" }}
                      />
                    )}
                    <Card item={r} kind="ref" onClick={() => onSelectRef(cap.id, r.id)} role={role} perms={perms} stages={stages} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {revisionCap && (
        <NotaRevisionModal
          title={`Ilustración en revisión — ${revisionCap.name}`}
          hint="🎨 Registra qué hay que cambiar en la ilustración/concepto de la cápsula — queda en sus Observaciones de Ilustración."
          onSave={(nota) => onSetIlustracion(revisionCap.id, "en_revision", nota)}
          onClose={() => setRevisionCap(null)}
        />
      )}
      {obsCapsula && (
        <ObservacionesCapsulaModal
          capsula={capsulas.find((c) => c.id === obsCapsula.id) || obsCapsula}
          currentUser={currentUser}
          role={role}
          onSend={onSendObsCapsula}
          onMarkDone={onMarkDoneObsCapsula}
          onClose={() => setObsCapsula(null)}
        />
      )}
    </div>
  );
}

// Alta manual al Cronograma de Muestras de un producto que el cliente todavía
// no ha mandado en foto/físico (no existe aún como Prototipo/Referencia en el
// aplicativo) — mismos campos descriptivos que se usan en el resto del
// aplicativo (categoría, silueta, rango, cliente), más los propios del
// cronograma (taller, fecha de entrega, prioridad, tipo, tipo de desarrollo).
function NuevoCronogramaLibreModal({ config, onSave, onClose }) {
  const [form, setForm] = useState({ nombre: "", referencia: "", cliente: "", categoria: "", silueta: "", rango: "", tela: "", tipo: "", tipoDesarrollo: "", taller: "", fechaEntrega: "", prioridad: "Media" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() {
    if (!form.nombre.trim() || !form.taller) return;
    onSave({ ...form, itemId: null, kind: null, capsulaId: null });
    onClose();
  }
  return (
    <Modal title="Agregar al Cronograma de Muestras" onClose={onClose} width={580}>
      <div style={{ padding: "10px 14px", background: T.amberBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.amber, fontWeight: 600 }}>🧵 Para productos que el cliente aún no envió en foto o físico</div>
      <Field label="Nombre"><FInput value={form.nombre} onChange={set("nombre")} placeholder="Ej: Pantaloneta Bloques" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config?.categorias || []} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config?.siluetas || []} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Referencia"><FInput value={form.referencia} onChange={set("referencia")} placeholder="Ej: PTGM160" /></Field>
        <Field label="Cliente"><FSel value={form.cliente} onChange={set("cliente")} options={(config?.clientes || []).map((c) => c.nombre)} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Rango de Tallas"><FSel value={form.rango} onChange={set("rango")} options={config?.rangos || []} /></Field>
        <Field label="Tela"><FInput value={form.tela} onChange={set("tela")} placeholder="Ej: Four Way" /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tipo"><FSel value={form.tipo} onChange={set("tipo")} options={TIPO_GENERO_MUESTRA} /></Field>
        <Field label="Tipo de Desarrollo"><FSel value={form.tipoDesarrollo} onChange={set("tipoDesarrollo")} options={TIPO_DESARROLLO_MUESTRA} /></Field>
      </div>
      <Field label="Taller de Muestra"><FSel value={form.taller} onChange={set("taller")} options={config?.talleresMuestra || []} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Fecha de Entrega Esperada">
          <input type="date" value={form.fechaEntrega} onChange={(e) => set("fechaEntrega")(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
        </Field>
        <Field label="Prioridad"><FSel value={form.prioridad} onChange={set("prioridad")} options={config?.prioridadesMuestra || []} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save} disabled={!form.nombre.trim() || !form.taller}>🧵 Agregar</Btn>
      </div>
    </Modal>
  );
}
// Detalle/edición rápida de una entrada del Cronograma de Muestras: cambiar
// taller/fecha/prioridad, marcar Aprobado/Modificar, ir al prototipo o
// referencia vinculado (si lo tiene), o borrarla (solo administrador).
function CronogramaDetalleModal({ entry, config, isAdmin, onUpdate, onDelete, onGoToItem, onModificarNota, onClose }) {
  const [form, setForm] = useState({ taller: entry.taller || "", fechaEntrega: entry.fechaEntrega || "", prioridad: entry.prioridad || "Media", estado: entry.estado || "pendiente", notaModificar: entry.notaModificar || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const est = ESTADO_MUESTRA[entry.estado] || ESTADO_MUESTRA.pendiente;
  // Igual que en "Enviar a Taller": si elige "Modificar" tiene que escribir
  // qué sucedió — y si esta entrada está vinculada a un prototipo/referencia,
  // esa nota también queda como Observación ahí (onModificarNota).
  const necesitaNota = form.estado === "modificar";
  function guardar() {
    if (necesitaNota && !form.notaModificar.trim()) return;
    onUpdate(entry.id, form);
    if (necesitaNota && form.notaModificar.trim() && entry.itemId && onModificarNota) onModificarNota(entry, form.notaModificar.trim());
    onClose();
  }
  return (
    <Modal title={entry.nombre || entry.referencia || "Muestra"} onClose={onClose} width={480}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {entry.categoria && <CatTag text={entry.categoria} />}
        {entry.referencia && <span style={{ fontSize: 12, color: T.slate }}>{entry.referencia}</span>}
        {entry.cliente && <span style={{ padding: "2px 8px", borderRadius: 3, background: T.violetBg, color: T.violet, fontSize: 10, fontWeight: 800 }}>{entry.cliente}</span>}
        <span style={{ padding: "2px 8px", borderRadius: 3, background: est.bg, color: est.color, fontSize: 10, fontWeight: 800 }}>{est.label}</span>
      </div>
      <Field label="Taller de Muestra"><FSel value={form.taller} onChange={set("taller")} options={config?.talleresMuestra || []} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Fecha de Entrega Esperada">
          <input type="date" value={form.fechaEntrega} onChange={(e) => set("fechaEntrega")(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
        </Field>
        <Field label="Prioridad"><FSel value={form.prioridad} onChange={set("prioridad")} options={config?.prioridadesMuestra || []} /></Field>
      </div>
      {entry.estado !== "enviado" && (
        <Field label="Estado">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(ESTADO_MUESTRA).map(([v, def]) => (
              <button key={v} type="button" onClick={() => set("estado")(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${form.estado === v ? def.color : T.border}`, background: form.estado === v ? def.bg : T.white, color: form.estado === v ? def.color : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{def.label}</button>
            ))}
          </div>
        </Field>
      )}
      {necesitaNota && (
        <Field label="¿Qué sucedió o qué hay que modificar?">
          <textarea value={form.notaModificar} onChange={(e) => set("notaModificar")(e.target.value)} rows={3} placeholder="Escribe el detalle de la modificación..." style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.coral}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
        </Field>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {entry.itemId && <Btn variant="ghost" small onClick={() => { onGoToItem(entry); onClose(); }}>→ Ver prototipo/referencia</Btn>}
          {isAdmin && <Btn variant="danger" small onClick={() => { onDelete(entry.id); onClose(); }}>🗑 Borrar</Btn>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
          <Btn onClick={guardar} disabled={necesitaNota && !form.notaModificar.trim()}>Guardar</Btn>
        </div>
      </div>
    </Modal>
  );
}
// Cronograma de Muestras: tablero visual por semana (lunes a sábado, igual al
// calendario de taller que ya manejaban en Excel), con navegación
// anterior/siguiente y una vista por mes (varias semanas apiladas). Las
// entradas "Aprobadas" se separan a su propia pestaña (funcionan como
// historial de muestras ya resueltas); "Sin fecha" agrupa lo que aún no
// tiene fecha de entrega asignada, para que nada quede invisible.
function CronogramaMuestrasView({ cronogramaMuestras, config, isAdmin, onAdd, onUpdate, onDelete, onGoToItem, onModificarNota }) {
  const [vista, setVista] = useState("semana");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [tab, setTab] = useState("activas");
  const [showNuevo, setShowNuevo] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const DIA_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  function mondayOf(d) {
    const x = new Date(d);
    const day = x.getDay();
    x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function isoDate(d) { return d.toISOString().slice(0, 10); }
  const hoy = new Date();
  const hoyIso = isoDate(hoy);
  const visibles = cronogramaMuestras.filter((c) => (tab === "activas" ? c.estado !== "aprobado" : c.estado === "aprobado"));
  function itemsForDay(ds) { return visibles.filter((c) => c.fechaEntrega === ds).sort((a, b) => (a.prioridad || "").localeCompare(b.prioridad || "")); }
  const sinFecha = visibles.filter((c) => !c.fechaEntrega);
  function renderCard(c) {
    const est = ESTADO_MUESTRA[c.estado] || ESTADO_MUESTRA.pendiente;
    const colorPrioridad = PRIORIDAD_MUESTRA_COLOR[c.prioridad] || T.border;
    return (
      <div key={c.id} onClick={() => setDetalle(c)}
        style={{ background: T.white, border: `1.5px solid ${colorPrioridad}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(26,26,46,0.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: T.ink, lineHeight: 1.3 }}>{c.nombre}</div>
        <div style={{ fontSize: 10, color: T.slate, marginTop: 1 }}>{c.referencia}{c.cliente ? ` · ${c.cliente}` : ""}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: est.color, background: est.bg, padding: "1px 6px", borderRadius: 10 }}>{est.label}</span>
          {c.taller && <span style={{ fontSize: 9, color: T.slate, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🧵 {c.taller}</span>}
        </div>
      </div>
    );
  }
  function renderWeekRow(monday, key) {
    const dias = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
    return (
      <div key={key} style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 14 }}>
        {dias.map((d, i) => {
          const ds = isoDate(d);
          const items = itemsForDay(ds);
          const esHoy = ds === hoyIso;
          return (
            <div key={ds} style={{ background: T.canvas, borderRadius: 10, padding: 10, minHeight: 100, border: esHoy ? `1.5px solid ${T.denim}` : `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: esHoy ? T.denim : T.slate, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{DIA_LABELS[i]} {d.getDate()}</div>
              {items.map(renderCard)}
              {!items.length && <div style={{ fontSize: 10, color: T.border }}>—</div>}
            </div>
          );
        })}
      </div>
    );
  }
  const semanaMonday = addDays(mondayOf(hoy), weekOffset * 7);
  const mesBase = new Date(hoy.getFullYear(), hoy.getMonth() + monthOffset, 1);
  const mesInicioLunes = mondayOf(mesBase);
  const mesFin = new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 0);
  const semanasDelMes = [];
  { let cur = mesInicioLunes; let guard = 0; while (cur <= mesFin && guard < 8) { semanasDelMes.push(new Date(cur)); cur = addDays(cur, 7); guard++; } }
  const rangoLabel = vista === "semana"
    ? `${semanaMonday.getDate()} ${MONTHS_SHORT[semanaMonday.getMonth()]} — ${addDays(semanaMonday, 5).getDate()} ${MONTHS_SHORT[addDays(semanaMonday, 5).getMonth()]} ${addDays(semanaMonday, 5).getFullYear()}`
    : mesBase.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return (
    <div>
      {showNuevo && <NuevoCronogramaLibreModal config={config} onSave={onAdd} onClose={() => setShowNuevo(false)} />}
      {detalle && <CronogramaDetalleModal entry={detalle} config={config} isAdmin={isAdmin} onUpdate={onUpdate} onDelete={onDelete} onGoToItem={onGoToItem} onModificarNota={onModificarNota} onClose={() => setDetalle(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Cronograma de Muestras</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Prototipos y referencias enviados a taller de muestra</p>
        </div>
        <Btn onClick={() => setShowNuevo(true)}>🧵 + Agregar al Cronograma</Btn>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[["activas", "Activas"], ["aprobadas", "✓ Aprobadas (Historial)"]].map(([v, label]) => (
            <button key={v} onClick={() => setTab(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${tab === v ? T.denim : T.border}`, background: tab === v ? T.denimBg : T.white, color: tab === v ? T.denim : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["semana", "Semana"], ["mes", "Mes"]].map(([v, label]) => (
            <button key={v} onClick={() => setVista(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${vista === v ? T.ink : T.border}`, background: vista === v ? T.ink : T.white, color: vista === v ? T.white : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => (vista === "semana" ? setWeekOffset((o) => o - 1) : setMonthOffset((o) => o - 1))} style={{ padding: "6px 12px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, color: T.ink }}>← Anterior</button>
        <div style={{ fontWeight: 800, fontSize: 14, color: T.ink, textTransform: "capitalize" }}>{rangoLabel}</div>
        <button onClick={() => (vista === "semana" ? setWeekOffset((o) => o + 1) : setMonthOffset((o) => o + 1))} style={{ padding: "6px 12px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, color: T.ink }}>Siguiente →</button>
      </div>
      {vista === "semana" ? renderWeekRow(semanaMonday, "w") : semanasDelMes.map((m, i) => renderWeekRow(m, i))}
      {sinFecha.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: T.slate, marginBottom: 10 }}>🗓 Sin fecha de entrega asignada ({sinFecha.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
            {sinFecha.map(renderCard)}
          </div>
        </div>
      )}
      {!visibles.length && <div style={{ textAlign: "center", padding: 40, color: T.slate, fontSize: 14 }}>{tab === "activas" ? "No hay muestras activas." : "Todavía no hay muestras aprobadas."}</div>}
    </div>
  );
}

// Historial de aprobaciones/declinaciones. Un prototipo se registra al
// llegar a "Aprobado" (se promueva o no después a una cápsula) y una
// referencia de cápsula se registra tanto al llegar a "Aprobado" como a
// "Declinado" (ver changeStatus en DetailView). Se muestra con la misma
// Card visual que Prototipos/Cápsulas, buscando el ítem vivo detrás de cada
// entrada — sin agrupar por mes (las estadísticas mensuales viven en
// Estadísticas), pero sí se puede FILTRAR por mes. Modo "Clientes": selector
// de cliente → sus tarjetas. Modo "Todos": todas las tarjetas, seccionadas
// por cliente. Además marca (🚫 Sin pedido) las piezas Aprobadas cuyo código
// de referencia nunca apareció en ningún Pedido cargado — para detectar
// diseño aprobado que nunca se llegó a producir.
// Exporta un envío de la Bitácora a Excel con el mismo formato del ANEXO
// que se manda al cliente: encabezado (colección/cliente/pedido/fechas) y
// una fila por referencia con las mismas columnas del archivo original
// (Ref, Estado, Consumo, Tipo, Categoría, Silueta, Rango, Tela, Curva y
// Cantidad por país, Precio, Observaciones). La librería "xlsx" (SheetJS,
// edición community) que ya usa el resto de la app no soporta incrustar
// imágenes en el archivo, así que Foto/Carta de Colores quedan como nota de
// texto — la imagen real se sigue viendo dentro de la app.
async function exportBitacoraEnvioToExcel(envio) {
  const XLSX = await import("xlsx");
  const wsData = [
    ["ANEXO — ENVÍO A CLIENTE", "", "", "", "", "", ""],
    ["COLECCIÓN (NOMBRE)", envio.coleccion || "", "", "", "", "", ""],
    ["FECHA ENVIADO", envio.fechaEnviado || "", "", "FECHA RECIBIDO CLIENTE", envio.fechaRecibidoCliente || "(pendiente)", "", ""],
    ["MARCA / CLIENTE", envio.cliente || "", "", "N° PEDIDO", envio.numPedido || "", "", ""],
    ["EMPRESA TRANSPORTE", envio.empresaTransporte || "—", "", "N° GUÍA", envio.guia || "—", "", ""],
    ["CARTA DE COLORES", envio.cartaColores ? "(adjunta en la app)" : "—", "", "", "", "", ""],
    [],
    ["FOTO", "REF", "NOMBRE", "ESTADO", "CONSUMO", "TIPO", "CATEGORIA", "SILUETA", "RANGO (TALLA)", "TELA", "CURVA COLOMBIA", "CANTIDAD COLOMBIA", "CURVA VENEZUELA", "CANTIDAD VENEZUELA", "PRECIO $", "OBSERVACIONES CLIENTE"],
    ...envio.items.map((it) => [
      it.foto ? "(ver en la app)" : "",
      it.referencia, it.nombre, it.estado, it.consumo, it.tipo, it.categoria, it.silueta, it.rango, it.tela,
      it.colombiaCurva, it.colombiaCantidad, it.venezuelaCurva, it.venezuelaCantidad, it.precio, it.observacionesCliente,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 26 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ANEXO");
  const nombreArchivo = `Envio_${(envio.coleccion || envio.cliente || "bitacora").replace(/[^a-zA-Z0-9]+/g, "_")}_${envio.fechaEnviado || today()}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}
function BitacoraEnviosView({ envios, onUpdateEnvio }) {
  const [expandido, setExpandido] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const q = busqueda.trim().toLowerCase();
  const filtrados = [...envios]
    .filter((e) => !q || (e.coleccion || "").toLowerCase().includes(q) || (e.cliente || "").toLowerCase().includes(q) || (e.numPedido || "").toLowerCase?.().includes(q))
    .sort((a, b) => (b.fechaEnviado || "").localeCompare(a.fechaEnviado || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Bitácora de Envíos</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Historial de colecciones/lotes enviados al cliente</p>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por colección, cliente o N° pedido..."
          style={{ padding: "9px 14px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, minWidth: 260, outline: "none", fontFamily: "inherit" }}
        />
      </div>
      {!filtrados.length && (
        <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>
          {envios.length ? "Ningún envío coincide con la búsqueda." : "Todavía no hay envíos registrados. Se crean desde Prototipos/Cápsulas, pestaña \"Enviar al Cliente\", seleccionando referencias y usando \"Crear Envío\"."}
        </div>
      )}
      {filtrados.map((envio) => {
        const abierto = expandido === envio.id;
        const totalUnidades = envio.items.reduce((s, it) => s + (Number(it.colombiaCantidad) || 0) + (Number(it.venezuelaCantidad) || 0), 0);
        return (
          <div key={envio.id} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 16, overflow: "hidden" }}>
            <div
              onClick={() => setExpandido(abierto ? null : envio.id)}
              style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: T.canvas, cursor: "pointer", flexWrap: "wrap", gap: 10 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{abierto ? "📂" : "📁"}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>{envio.coleccion || "(Sin nombre de colección)"}</div>
                  <div style={{ fontSize: 12, color: T.slate }}>{envio.cliente || "Sin cliente"} · {envio.items.length} ref · {fmtNum(totalUnidades)} unid. · Enviado {envio.fechaEnviado}{envio.numPedido ? ` · Pedido ${envio.numPedido}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: envio.fechaRecibidoCliente ? T.jadeBg : T.amberBg, color: envio.fechaRecibidoCliente ? T.jade : T.amber }}>
                  {envio.fechaRecibidoCliente ? `✓ Recibido ${envio.fechaRecibidoCliente}` : "⏳ Sin confirmar recibido"}
                </span>
                <button onClick={(e) => { e.stopPropagation(); exportBitacoraEnvioToExcel(envio); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#217346", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>📊 Exportar</button>
              </div>
            </div>
            {abierto && (
              <div style={{ padding: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
                  <div><div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>Empresa Transporte</div><div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{envio.empresaTransporte || "—"}</div></div>
                  <div><div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>N° Guía</div><div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{envio.guia || "—"}</div></div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 4 }}>Fecha Recibido Cliente</div>
                    <input
                      type="date"
                      value={envio.fechaRecibidoCliente || ""}
                      onChange={(e) => onUpdateEnvio(envio.id, { fechaRecibidoCliente: e.target.value })}
                      style={{ padding: "6px 10px", border: `1.5px solid ${T.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
                    />
                  </div>
                  {envio.cartaColores && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 4 }}>Carta de Colores</div>
                      <img src={envio.cartaColores} alt="Carta de colores" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.border}` }} />
                    </div>
                  )}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: T.ink }}>
                        {["Foto", "Ref", "Nombre", "Estado", "Consumo", "Tipo", "Categoría", "Silueta", "Rango", "Tela", "Curva Col.", "Cant. Col.", "Curva Ven.", "Cant. Ven.", "Precio", "Obs. Cliente"].map((h) => (
                          <th key={h} style={{ padding: "8px 10px", color: T.white, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {envio.items.map((it, i) => (
                        <tr key={it.itemId} style={{ background: i % 2 === 0 ? T.canvas : T.white, borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "6px 10px" }}>{it.foto ? <img src={it.foto} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} /> : "—"}</td>
                          <td style={{ padding: "6px 10px", fontWeight: 700 }}>{it.referencia}</td>
                          <td style={{ padding: "6px 10px" }}>{it.nombre}</td>
                          <td style={{ padding: "6px 10px" }}>{it.estado}</td>
                          <td style={{ padding: "6px 10px" }}>{it.consumo || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.tipo || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.categoria || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.silueta || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.rango || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.tela || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.colombiaCurva || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.colombiaCantidad || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.venezuelaCurva || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.venezuelaCantidad || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.precio || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{it.observacionesCliente || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function HistorialDisenoView({ historial, protos, capsulas, pedidos, role, perms, stages, isAdmin, onBackfill, onSelectProto, onSelectRef, onPromote }) {
  const [modo, setModo] = useState("todos");
  const [clienteSel, setClienteSel] = useState("");
  const [resultado, setResultado] = useState("todos");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [mesFiltro, setMesFiltro] = useState("");
  const [soloSinPedido, setSoloSinPedido] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  // Cápsulas expandidas en la vista de lista (solo aplica cuando el filtro
  // de tipo es "capsula_ref"): en vez de listar cada referencia suelta, se
  // agrupan por cápsula y solo se despliegan las referencias de la cápsula
  // que el usuario selecciona.
  const [expandedCaps, setExpandedCaps] = useState(() => new Set());
  function toggleCap(capId) {
    setExpandedCaps((prev) => {
      const next = new Set(prev);
      if (next.has(capId)) next.delete(capId); else next.add(capId);
      return next;
    });
  }
  async function handleBackfill() {
    setBackfilling(true);
    await onBackfill();
    setBackfilling(false);
  }
  function liveItem(h) {
    if (h.tipo === "proto") return protos.find((p) => p.id === h.itemId);
    const cap = capsulas.find((c) => c.id === h.capsulaId);
    return cap?.referencias.find((r) => r.id === h.itemId);
  }
  // ¿El código de referencia de esta pieza aparece en algún Pedido ya
  // cargado (de cualquier cliente)? Comparación por texto, sin mayúsculas ni
  // espacios extra.
  function usedInPedido(refCode) {
    if (!refCode) return false;
    const target = String(refCode).trim().toLowerCase();
    return (pedidos || []).some((p) => (p.referencias || []).some((r) => String(r.ref || "").trim().toLowerCase() === target));
  }
  // Une cada entrada de historial con su ítem vivo (omite las que ya no
  // tienen ítem, p.ej. si se eliminó), dedupe por itemId quedándose con la
  // entrada más reciente, filtra "sin pedido" si el toggle está activo, y
  // ordena por fecha descendente.
  function itemsFor(lista) {
    const porItem = new Map();
    lista.forEach((h) => {
      const item = liveItem(h);
      if (!item) return;
      const prev = porItem.get(h.itemId);
      if (!prev || h.fecha > prev.h.fecha) porItem.set(h.itemId, { h, item });
    });
    let arr = [...porItem.values()];
    if (soloSinPedido) arr = arr.filter(({ h, item }) => h.resultado === "aprobado" && !usedInPedido(item.reference));
    return arr.sort((a, b) => b.h.fecha.localeCompare(a.h.fecha));
  }
  // Fila compacta de un ítem (sin imagen): nombre, referencia, cliente/fecha
  // y estado. Al hacer clic se abre el detalle completo (ahí sí aparece la
  // imagen). Se reutiliza tanto en la lista plana como dentro de cada
  // cápsula desplegada.
  function renderRow(h, item) {
    const sinPedido = h.resultado === "aprobado" && !usedInPedido(item.reference);
    return (
      <div key={h.id} onClick={() => (h.tipo === "proto" ? onSelectProto(item.id) : onSelectRef(h.capsulaId, item.id))}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.white, cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = T.canvas)}
        onMouseLeave={(e) => (e.currentTarget.style.background = T.white)}
      >
        <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{h.tipo === "proto" ? "🧪" : "📋"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{item.name}</span>
            <span style={{ fontSize: 11, color: T.slate }}>{item.reference}</span>
            {sinPedido && <span style={{ padding: "1px 7px", borderRadius: 20, background: T.coralBg, color: T.coral, fontWeight: 700, fontSize: 10, border: `1px solid ${T.coral}44` }}>🚫 Sin pedido</span>}
          </div>
          <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{h.cliente}{h.fecha ? ` · ${h.fecha}` : ""}</div>
        </div>
        <Badge status={item.status} />
        <span style={{ color: T.slate, fontSize: 14, flexShrink: 0 }}>›</span>
      </div>
    );
  }
  // Lista compacta (sin imagen) en vez de la grilla de tarjetas: evita que el
  // Historial quede muy largo. Cuando el filtro de tipo es "Cápsulas", en vez
  // de listar cada referencia suelta se agrupa por cápsula: primero aparece
  // el listado de cápsulas, y solo al seleccionar una se despliegan sus
  // referencias (cada una llevando al detalle con la imagen al hacer clic).
  function renderList(lista) {
    if (!lista.length) return <div style={{ textAlign: "center", padding: 32, color: T.slate, fontSize: 13 }}>Sin resultados.</div>;
    if (tipoFiltro === "capsula_ref") {
      const porCap = new Map();
      lista.forEach(({ h, item }) => {
        if (!porCap.has(h.capsulaId)) porCap.set(h.capsulaId, []);
        porCap.get(h.capsulaId).push({ h, item });
      });
      const capIds = [...porCap.keys()].sort((a, b) => {
        const nameA = capsulas.find((c) => c.id === a)?.name || "";
        const nameB = capsulas.find((c) => c.id === b)?.name || "";
        return nameA.localeCompare(nameB);
      });
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {capIds.map((capId) => {
            const cap = capsulas.find((c) => c.id === capId);
            const refs = porCap.get(capId);
            const expanded = expandedCaps.has(capId);
            const sinPedidoCount = refs.filter(({ h, item }) => h.resultado === "aprobado" && !usedInPedido(item.reference)).length;
            return (
              <div key={capId} style={{ background: T.white, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                <div onClick={() => toggleCap(capId)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", background: expanded ? T.canvas : T.white }}
                >
                  <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>🗂</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>{cap?.name || "Cápsula"}</div>
                    <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>
                      {cap?.season ? `${cap.season} · ` : ""}{refs.length} referencia{refs.length !== 1 ? "s" : ""}
                      {sinPedidoCount > 0 ? ` · 🚫 ${sinPedidoCount} sin pedido` : ""}
                    </div>
                  </div>
                  <span style={{ color: T.slate, fontSize: 14, flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
                </div>
                {expanded && (
                  <div style={{ borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 1, background: T.border }}>
                    {refs.map(({ h, item }) => renderRow(h, item))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: T.border, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}` }}>
        {lista.map(({ h, item }) => renderRow(h, item))}
      </div>
    );
  }
  const filtradoResultado = historial.filter((h) => {
    if (resultado !== "todos" && h.resultado !== resultado) return false;
    if (tipoFiltro !== "todos" && h.tipo !== tipoFiltro) return false;
    if (mesFiltro && h.mes !== mesFiltro) return false;
    return true;
  });
  const clientesDisponibles = [...new Set(historial.map((h) => h.cliente))].sort((a, b) => a.localeCompare(b));
  const mesesDisponibles = [...new Set(historial.map((h) => h.mes).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  function labelMes(m) { return new Date(m + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" }); }
  const clienteItems = clienteSel ? itemsFor(filtradoResultado.filter((h) => h.cliente === clienteSel)) : [];
  const porClienteTodos = {};
  filtradoResultado.forEach((h) => {
    if (!porClienteTodos[h.cliente]) porClienteTodos[h.cliente] = [];
    porClienteTodos[h.cliente].push(h);
  });
  const clientesOrdenadosTodos = Object.keys(porClienteTodos).sort((a, b) => a.localeCompare(b));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Historial</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Prototipos y referencias que llegaron a Aprobado o Declinado</p>
        </div>
        {isAdmin && (
          <Btn variant="ghost" small onClick={handleBackfill} disabled={backfilling}>
            {backfilling ? "Completando..." : "↻ Completar con aprobados/declinados existentes"}
          </Btn>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["todos", "Todos"], ["clientes", "Clientes"]].map(([v, label]) => (
          <button key={v} onClick={() => setModo(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${modo === v ? T.denim : T.border}`, background: modo === v ? T.denimBg : T.white, color: modo === v ? T.denim : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {[["todos", "Todos"], ["aprobado", "Aprobados"], ["declinado", "Declinados"]].map(([v, label]) => (
          <button key={v} onClick={() => setResultado(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${resultado === v ? T.ink : T.border}`, background: resultado === v ? T.ink : T.white, color: resultado === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["todos", "Todos"], ["proto", "Prototipos"], ["capsula_ref", "Cápsulas"]].map(([v, label]) => (
            <button key={v} onClick={() => setTipoFiltro(v)} style={{ padding: "5px 12px", borderRadius: 6, border: `1.5px solid ${tipoFiltro === v ? T.denim : T.border}`, background: tipoFiltro === v ? T.denimBg : T.white, color: tipoFiltro === v ? T.denim : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} style={{ padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit", textTransform: "capitalize" }}>
          <option value="">Todos los meses</option>
          {mesesDisponibles.map((m) => <option key={m} value={m}>{labelMes(m)}</option>)}
        </select>
        {modo === "clientes" && (
          <select value={clienteSel} onChange={(e) => setClienteSel(e.target.value)} style={{ padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
            <option value="">Selecciona un cliente...</option>
            {clientesDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button onClick={() => setSoloSinPedido((v) => !v)} title="Aprobados cuyo código de referencia nunca apareció en un Pedido cargado" style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${soloSinPedido ? T.coral : T.border}`, background: soloSinPedido ? T.coralBg : T.white, color: soloSinPedido ? T.coral : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🚫 Sin usar en pedido</button>
      </div>
      {modo === "clientes" ? (
        !clienteSel ? (
          <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>Selecciona un cliente para ver su historial.</div>
        ) : renderList(clienteItems)
      ) : !clientesOrdenadosTodos.length ? (
        <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>{historial.length ? "Sin resultados para estos filtros." : "Aún no hay historial registrado."}</div>
      ) : (
        clientesOrdenadosTodos.map((cliente) => (
          <div key={cliente} style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.ink, marginBottom: 12 }}>{cliente}</div>
            {renderList(itemsFor(porClienteTodos[cliente]))}
          </div>
        ))
      )}
    </div>
  );
}
function HomeView({ currentUser, perms, canAccessCorte, canAccessContabilidad, canAccessPlaneacion, canAccessDiseno, onGoArea, protos, capsulas, pedidos }) {
  const hoy = new Date();
  const protosEnProceso = protos.filter((p) => p.status === "en_proceso").length;
  const pedidosActivos = pedidos.filter((p) => p.estado === "activo" || p.estado === "terminado").length;
  const pedidosVencidos = pedidos.filter((p) => p.fechaDespacho && new Date(p.fechaDespacho) < hoy && p.estado !== "cumplido").length;
  const AREAS_CARDS = [
    {
      id: "diseno", icon: "🎨", label: "Diseño", desc: "Prototipos, Cápsulas, Pedidos, Corte y seguimiento de producción", color: T.denim, bg: T.denimBg,
      stats: [{ label: "Prototipos activos", value: protosEnProceso }, { label: "Pedidos activos", value: pedidosActivos, alert: pedidosVencidos > 0 }],
      // Antes: perms.editar || perms.aprobar || perms.declinar — mezclaba permisos de
      // flujo de trabajo con visibilidad de módulo. Ahora usa el acceso granular real
      // (si al menos una sección de Diseño está habilitada para el rol).
      permiso: canAccessDiseno,
    },
    {
      id: "contabilidad_area", icon: "💰", label: "Contabilidad", desc: "Flujo de caja, informes financieros y control contable", color: T.jade, bg: T.jadeBg,
      stats: [],
      // Antes: perms.admin || currentUser?.isAdmin — esto mezclaba visibilidad de módulo con
      // permisos de flujo de trabajo en Diseño. Ahora se decide con el permiso de módulo dedicado.
      permiso: canAccessContabilidad,
    },
    {
      id: "planeacion_area", icon: "📋", label: "Planeación", desc: "Informes de producción de planta a partir de Hoja1", color: T.violet, bg: T.violetBg,
      stats: [],
      permiso: canAccessPlaneacion,
    },
  ].filter((a) => a.permiso);
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: T.ink }}>Bienvenido, {currentUser?.name?.split(" ")[0]} 👋</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: T.slate }}>{new Date().toLocaleDateString("es-CO", { dateStyle: "full" })}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
        {AREAS_CARDS.map((area) => (
          <div key={area.id} onClick={() => onGoArea(area.id)} style={{ background: T.white, borderRadius: 16, padding: 24, cursor: "pointer", border: `1.5px solid ${T.border}`, transition: "all 0.2s", position: "relative", overflow: "hidden" }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 32px ${area.color}22`; e.currentTarget.style.borderColor = area.color; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = T.border; }}
          >
            <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: area.bg, opacity: 0.5 }} />
            <div style={{ width: 52, height: 52, borderRadius: 14, background: area.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 16, border: `1.5px solid ${area.color}22` }}>{area.icon}</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: T.ink, marginBottom: 6 }}>{area.label}</div>
            <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.5, marginBottom: 16 }}>{area.desc}</div>
            {area.stats.length > 0 && (
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {area.stats.map((s) => (
                  <div key={s.label} style={{ flex: 1, background: s.alert ? T.coralBg : area.bg, borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.alert ? T.coral : area.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: T.slate, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, fontSize: 13, fontWeight: 700, color: area.color }}>Entrar <span style={{ fontSize: 16 }}>→</span></div>
          </div>
        ))}
      </div>
      {pedidosVencidos > 0 && (
        <div style={{ marginTop: 24, padding: "14px 18px", background: T.coralBg, borderRadius: 12, border: `1px solid ${T.coral}44`, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: T.coral, fontSize: 14 }}>{pedidosVencidos} pedido{pedidosVencidos !== 1 ? "s" : ""} vencido{pedidosVencidos !== 1 ? "s" : ""}</div>
            <div style={{ fontSize: 12, color: T.slate }}>Revisa el módulo de Pedidos para atender los despachos urgentes.</div>
          </div>
          <button onClick={() => onGoArea("pedidos_area")} style={{ padding: "6px 14px", background: T.coral, border: "none", borderRadius: 8, color: T.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Ver Pedidos</button>
        </div>
      )}
    </div>
  );
}

function DashboardView({ protos, capsulas, pedidos, onGoProtos, onGoCapsulas, onGoPedidos, stages }) {
  const allRefs = capsulas.flatMap((c) => c.referencias);
  function sc(arr, s) { return arr.filter((x) => x.status === s).length; }
  const pS = { enProceso: sc(protos, "en_proceso"), aprobados: sc(protos, "aprobado"), declinados: sc(protos, "declinado"), enRevision: sc(protos, "en_revision"), vencidos: protos.filter((p) => isOverdue(p, stages)).length, listos: protos.filter((p) => p.status === "aprobado" && !p.promotedTo).length };
  const rS = { enProceso: sc(allRefs, "en_proceso"), aprobados: sc(allRefs, "aprobado"), declinados: sc(allRefs, "declinado"), enCot: sc(allRefs, "enviado_cotizacion"), vencidos: allRefs.filter((r) => isOverdue(r, stages)).length };
  const cS = { total: capsulas.length, conAp: capsulas.filter((c) => c.referencias.some((r) => r.status === "aprobado")).length, enProceso: capsulas.filter((c) => c.referencias.some((r) => r.status === "en_proceso")).length, conDec: capsulas.filter((c) => c.referencias.some((r) => r.status === "declinado")).length };
  const stageStats = stages.map((s) => ({ ...s, total: protos.filter((p) => p.currentStage === s.id).length + allRefs.filter((r) => r.currentStage === s.id).length, overdue: protos.filter((p) => p.currentStage === s.id && isOverdue(p, stages)).length + allRefs.filter((r) => r.currentStage === s.id && isOverdue(r, stages)).length }));
  const totalPending = [...protos, ...allRefs].flatMap((x) => x.observations).filter((o) => !o.done).length;
  const pendRefsPedido = refsAprobadasPendientesDePedido(capsulas, pedidos || []);
  const pendCapsPedido = capsulasPendientesDePedido(capsulas, pedidos || []);
  function Grid({ title, color, stats, onClick }) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{title}</span>
          <button onClick={onClick} style={{ background: "none", border: "none", color, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Ver todos →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {stats.map((k) => (
            <div key={k.label} onClick={onClick} style={{ background: k.bg, borderRadius: 12, padding: "16px 18px", border: `1px solid ${k.color}22`, cursor: "pointer" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{k.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: T.slate, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Dashboard</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>{new Date().toLocaleDateString("es-CO", { dateStyle: "long" })}</p></div>
        <button onClick={() => exportToExcel(protos, capsulas)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#217346", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 8px rgba(33,115,70,0.3)" }}><span style={{ fontSize: 18 }}>📊</span> Exportar a Excel</button>
      </div>
      {(pendRefsPedido.length > 0 || pendCapsPedido.length > 0) && (
        <div onClick={onGoPedidos} style={{ background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 12, padding: "14px 18px", marginBottom: 20, cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 24 }}>⏳</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.amber }}>{pendRefsPedido.length} referencia{pendRefsPedido.length !== 1 ? "s" : ""} aprobada{pendRefsPedido.length !== 1 ? "s" : ""} sin Pedido</div>
            <div style={{ fontSize: 12, color: T.slate }}>{pendCapsPedido.length} cápsula{pendCapsPedido.length !== 1 ? "s" : ""} con referencias pendientes de pasar a producción</div>
          </div>
          <span style={{ fontSize: 12, color: T.amber, fontWeight: 700 }}>Ver Pedidos →</span>
        </div>
      )}
      <Grid title="🧪 PROTOTIPOS" color={T.denim} onClick={onGoProtos} stats={[
        { label: "En proceso", value: pS.enProceso, icon: "⚙", color: T.denim, bg: T.denimBg },
        { label: "Aprobados", value: pS.aprobados, icon: "✓", color: T.jade, bg: T.jadeBg },
        { label: "Declinados", value: pS.declinados, icon: "✕", color: T.coral, bg: T.coralBg },
        { label: "En revisión", value: pS.enRevision, icon: "⟳", color: T.amber, bg: T.amberBg },
      ]} />
      <div style={{ borderTop: `2px solid ${T.border}`, margin: "4px 0 20px" }} />
      <Grid title="📋 REFERENCIAS EN CÁPSULAS" color={T.violet} onClick={onGoCapsulas} stats={[
        { label: "En proceso", value: rS.enProceso, icon: "⚙", color: T.denim, bg: T.denimBg },
        { label: "Aprobadas", value: rS.aprobados, icon: "✓", color: T.jade, bg: T.jadeBg },
        { label: "Declinadas", value: rS.declinados, icon: "✕", color: T.coral, bg: T.coralBg },
        { label: "En cotización", value: rS.enCot, icon: "📤", color: T.violet, bg: T.violetBg },
      ]} />
      <div style={{ borderTop: `2px solid ${T.border}`, margin: "4px 0 20px" }} />
      <Grid title="🗂 CÁPSULAS" color={T.seamDark} onClick={onGoCapsulas} stats={[
        { label: "Total", value: cS.total, icon: "🗂", color: T.slate, bg: "#EDEDF2" },
        { label: "Con aprobadas", value: cS.conAp, icon: "✓", color: T.jade, bg: T.jadeBg },
        { label: "En proceso", value: cS.enProceso, icon: "⚙", color: T.denim, bg: T.denimBg },
        { label: "Con declinadas", value: cS.conDec, icon: "✕", color: T.coral, bg: T.coralBg },
      ]} />
      <div style={{ borderTop: `2px solid ${T.border}`, margin: "4px 0 20px" }} />
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 16 }}>Semáforo de Ruta Crítica</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length},1fr)`, gap: 12 }}>
          {stageStats.map((s) => {
            const color = s.overdue > 0 ? T.coral : s.total === 0 ? T.border : T.jade;
            return (
              <div key={s.id} style={{ textAlign: "center" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: color, margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", color: T.white, fontWeight: 900, fontSize: 18, boxShadow: `0 4px 14px ${color}55` }}>{s.total}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{s.label}</div>
                <div style={{ fontSize: 10, color: T.slate }}>{s.days}d límite</div>
                {s.overdue > 0 && <div style={{ fontSize: 10, color: T.coral, fontWeight: 700, marginTop: 2 }}>⚑ {s.overdue}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pS.vencidos > 0 && <div style={{ padding: "10px 16px", background: T.coralBg, borderRadius: 10, border: `1px solid ${T.coral}44`, fontSize: 13, color: T.coral, fontWeight: 700 }}>⚑ {pS.vencidos} prototipo{pS.vencidos > 1 ? "s" : ""} vencido{pS.vencidos > 1 ? "s" : ""}</div>}
        {rS.vencidos > 0 && <div style={{ padding: "10px 16px", background: T.coralBg, borderRadius: 10, border: `1px solid ${T.coral}44`, fontSize: 13, color: T.coral, fontWeight: 700 }}>⚑ {rS.vencidos} referencia{rS.vencidos > 1 ? "s" : ""} vencida{rS.vencidos > 1 ? "s" : ""}</div>}
        {pS.listos > 0 && <div style={{ padding: "10px 16px", background: T.jadeBg, borderRadius: 10, border: `1px solid ${T.jade}44`, fontSize: 13, color: T.jade, fontWeight: 700 }}>⬆ {pS.listos} listo{pS.listos > 1 ? "s" : ""} para promover</div>}
        {totalPending > 0 && <div style={{ padding: "10px 16px", background: T.amberBg, borderRadius: 10, border: `1px solid ${T.amber}44`, fontSize: 13, color: T.amber, fontWeight: 700 }}>💬 {totalPending} observación{totalPending > 1 ? "es" : ""} pendiente{totalPending > 1 ? "s" : ""}</div>}
      </div>
    </div>
  );
}

function EstadisticasView({ protos, capsulas, stages, config }) {
  const currentYear = new Date().getFullYear().toString();
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [monthFilter, setMonthFilter] = useState("todos");
  const [personFilter, setPersonFilter] = useState("todos");
  const allRefs = capsulas.flatMap((c) => c.referencias);
  const allItems = [...protos, ...allRefs];
  const years = [...new Set(allItems.map((x) => x.createdAt?.slice(0, 4)).filter(Boolean))].sort().reverse();
  // El filtro de Responsable sale del maestro de Diseñadores (Administrador
  // General), no solo de los nombres que ya aparecen en prototipos/referencias
  // — así un diseñador recién agregado aparece aunque todavía no tenga nada
  // asignado. Se suman también nombres sueltos que ya existan en los datos
  // aunque no estén en el maestro (compatibilidad con datos viejos).
  const responsables = [...new Set([...(config?.disenadores || []), ...allItems.map((x) => x.assignedTo).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  const clientesUnicos = [...new Set(allRefs.flatMap((r) => r.colores || []).filter(Boolean))].sort();
  function applyFilters(arr) {
    return arr.filter((x) => {
      const byYear = !yearFilter || x.createdAt?.slice(0, 4) === yearFilter;
      const byMonth = monthFilter === "todos" || parseInt(x.createdAt?.slice(5, 7)) - 1 === parseInt(monthFilter);
      const byPerson = personFilter === "todos" || x.assignedTo === personFilter;
      return byYear && byMonth && byPerson;
    });
  }
  const filtered = applyFilters(allItems);
  const total = filtered.length, aprobados = filtered.filter((x) => x.status === "aprobado").length, declinados = filtered.filter((x) => x.status === "declinado").length,
    enProceso = filtered.filter((x) => ["en_proceso", "en_revision", "borrador"].includes(x.status)).length;
  const pctAp = total ? Math.round((aprobados / total) * 100) : 0, pctDec = total ? Math.round((declinados / total) * 100) : 0;
  // "Certeza": a diferencia de pctAp (que divide por el total, incluyendo lo
  // que aún está en proceso y todavía no tiene un resultado), esto solo
  // compara aprobados contra lo que YA se resolvió (aprobado o declinado).
  // Es la métrica que responde "de lo que se definió, qué tan certero fue".
  const resueltosGlobal = aprobados + declinados;
  const certezaGlobal = resueltosGlobal ? Math.round((aprobados / resueltosGlobal) * 100) : null;
  const protosFiltered = applyFilters(protos), refsFiltered = applyFilters(allRefs);
  const activosFiltered = filtered.filter((x) => !["aprobado", "declinado"].includes(x.status));
  const vencidosActuales = activosFiltered.filter((x) => isOverdue(x, stages)).length;
  const pctVencidos = activosFiltered.length ? Math.round((vencidosActuales / activosFiltered.length) * 100) : 0;
  // Una cápsula se considera "cumplida" solo si el 100% de sus referencias
  // quedó Aprobada (ninguna Declinada, ninguna pendiente). Si tiene
  // referencias sin resolver, está "en curso"; si ya se resolvieron todas
  // pero al menos una quedó Declinada, nunca puede llegar a cumplida.
  function estadoCapsula(c) {
    const refs = c.referencias || [];
    if (!refs.length) return "sin_referencias";
    const pendientes = refs.filter((r) => !["aprobado", "declinado"].includes(r.status)).length;
    if (pendientes > 0) return "en_curso";
    return refs.some((r) => r.status === "declinado") ? "con_declinaciones" : "cumplida";
  }
  const capsulasFiltradas = capsulas.filter((c) => {
    const byYear = !yearFilter || c.createdAt?.slice(0, 4) === yearFilter;
    const byMonth = monthFilter === "todos" || parseInt(c.createdAt?.slice(5, 7)) - 1 === parseInt(monthFilter);
    const byPerson = personFilter === "todos" || (c.referencias || []).some((r) => r.assignedTo === personFilter);
    return byYear && byMonth && byPerson;
  });
  const capsulasCumplidas = capsulasFiltradas.filter((c) => estadoCapsula(c) === "cumplida").length;
  const capsulasEnCurso = capsulasFiltradas.filter((c) => estadoCapsula(c) === "en_curso").length;
  const capsulasConDeclinaciones = capsulasFiltradas.filter((c) => estadoCapsula(c) === "con_declinaciones").length;
  const capsulasTotalFiltradas = capsulasFiltradas.length;
  const pctCumplCapsulas = capsulasTotalFiltradas ? Math.round((capsulasCumplidas / capsulasTotalFiltradas) * 100) : 0;
  // Rondas de revisión de Ilustración a nivel de Cápsula: cuántas veces la
  // Dirección Creativa devolvió la ilustración/concepto de una cápsula antes
  // de aprobarla. Es aparte del Puntaje (no se le atribuye a un solo
  // diseñador, igual criterio que el resto de métricas de Cápsulas).
  const rondasIlustracionTotal = capsulasFiltradas.reduce((sum, c) => sum + (c.observacionesIlustracion || []).filter((o) => o.type === "revision_ilustracion_capsula").length, 0);
  const promRondasIlustracion = capsulasTotalFiltradas ? Math.round((rondasIlustracionTotal / capsulasTotalFiltradas) * 10) / 10 : 0;
  const capsulasPendientesIlustracion = capsulasFiltradas.filter((c) => !ilustracionAprobada(c)).length;
  // Puntaje de Diseño (0-100): combina tres cosas que ya se calculan arriba
  // — Certeza 40% (qué tan seguido acierta con lo que propone), Cumplimiento
  // de cápsulas 35% (colecciones que llegan completas al 100% aprobadas, no
  // solo piezas sueltas) y Cumplimiento de plazos 25% (qué tanto de lo
  // activo NO está vencido). El volumen (cuánto se produjo) queda fuera a
  // propósito: sin una meta/cuota definida, "hacer más" no es comparable de
  // forma justa entre períodos o personas.
  const pctPlazoGlobal = 100 - pctVencidos;
  const puntajeDiseno = certezaGlobal === null ? null : Math.round(certezaGlobal * 0.4 + pctCumplCapsulas * 0.35 + pctPlazoGlobal * 0.25);
  // Revisa si el ítem alguna vez llegó a la etapa de cotización/envío al
  // cliente (aunque hoy ya esté Aprobado o Declinado y su status actual ya
  // no lo muestre), buscando el registro exacto en su Hoja de Vida.
  function pasoPorCotizacion(item) {
    if (["enviado_cotizacion", "enviar_cliente", "enviado", "recibido_cliente"].includes(item.status)) return true;
    return !!buscarFechaEstado(item, "enviado_cotizacion");
  }
  function monthlyData() {
    const base = allItems.filter((x) => (!yearFilter || x.createdAt?.slice(0, 4) === yearFilter) && (personFilter === "todos" || x.assignedTo === personFilter));
    return MONTHS_SHORT.map((m, i) => {
      const items = base.filter((x) => parseInt(x.createdAt?.slice(5, 7)) - 1 === i);
      const ap = items.filter((x) => x.status === "aprobado").length, dec = items.filter((x) => x.status === "declinado").length,
        en = items.filter((x) => ["en_proceso", "en_revision", "borrador"].includes(x.status)).length, t = items.length;
      return { m, t, ap, dec, en, pctAp: t ? Math.round((ap / t) * 100) : 0 };
    });
  }
  const monthly = monthlyData(), maxMonth = Math.max(...monthly.map((m) => m.t), 1);
  const periodLabel = [yearFilter, monthFilter !== "todos" ? MONTHS_ES[parseInt(monthFilter)] : null, personFilter !== "todos" ? personFilter : null].filter(Boolean).join(" · ");
  const FSel2 = ({ label, value, onChange, opts }) => (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "9px 14px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, background: T.white, color: T.ink, fontFamily: "inherit", outline: "none", minWidth: 130 }}>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
  function porResponsable(arr) {
    const base = arr.filter((x) => (!yearFilter || x.createdAt?.slice(0, 4) === yearFilter) && (monthFilter === "todos" || parseInt(x.createdAt?.slice(5, 7)) - 1 === parseInt(monthFilter)));
    return responsables.map((p) => {
      const items = base.filter((x) => x.assignedTo === p);
      const t = items.length, ap = items.filter((x) => x.status === "aprobado").length, dec = items.filter((x) => x.status === "declinado").length, en = t - ap - dec;
      const resueltos = ap + dec;
      const enviados = items.filter((x) => pasoPorCotizacion(x)).length;
      const activosP = items.filter((x) => !["aprobado", "declinado"].includes(x.status));
      const vencidos = activosP.filter((x) => isOverdue(x, stages)).length;
      const certeza = resueltos ? Math.round((ap / resueltos) * 100) : null;
      const pctPlazoP = activosP.length ? Math.round(((activosP.length - vencidos) / activosP.length) * 100) : 100;
      // Mismo puntaje que a nivel de área (Certeza + Cumplimiento de plazos),
      // pero sin el componente de "cápsulas cumplidas": una cápsula es un
      // trabajo compartido entre varias personas, así que no se le puede
      // atribuir en justicia a un solo diseñador. Los dos pesos que quedan
      // (Certeza 40 y Plazos 25) se reescalan para que sigan sumando 100%,
      // conservando la misma importancia relativa entre ellos.
      const puntaje = certeza === null ? null : Math.round((certeza * 40 + pctPlazoP * 25) / 65);
      // Rondas de revisión en Ilustración: cuántas veces la Dirección
      // Creativa devolvió una propuesta de este diseñador con cambios,
      // pedidos desde el botón "En revisión" mientras la pieza estaba en
      // esa etapa. Es aparte del Puntaje (no lo penaliza) — es una señal de
      // proceso, no de resultado final.
      const rondasRevision = items.reduce((sum, x) => sum + (x.observations || []).filter((o) => o.type === "revision_ilustracion").length, 0);
      const promRevision = t ? Math.round((rondasRevision / t) * 10) / 10 : 0;
      return { name: p, t, ap, dec, en, enviados, vencidos, puntaje, pctAp: t ? Math.round((ap / t) * 100) : 0, pctDec: t ? Math.round((dec / t) * 100) : 0, certeza, rondasRevision, promRevision };
    }).filter((x) => x.t > 0).sort((a, b) => b.t - a.t);
  }
  const protosPorResp = porResponsable(protos);
  const refsPorResp = porResponsable(allRefs);
  function porCliente() {
    const base = allRefs.filter((x) => (!yearFilter || x.createdAt?.slice(0, 4) === yearFilter) && (monthFilter === "todos" || parseInt(x.createdAt?.slice(5, 7)) - 1 === parseInt(monthFilter)));
    return clientesUnicos.map((cli) => {
      const items = base.filter((r) => (r.colores || []).includes(cli));
      const t = items.length, ap = items.filter((x) => x.status === "aprobado").length, dec = items.filter((x) => x.status === "declinado").length, en = t - ap - dec;
      const capsulasDelCliente = new Set(capsulas.filter((c) => c.referencias.some((r) => (r.colores || []).includes(cli))).map((c) => c.id));
      return { name: cli, refsTotal: t, refsAp: ap, refsDec: dec, refsEn: en, pctAp: t ? Math.round((ap / t) * 100) : 0, capsulasTotal: capsulasDelCliente.size };
    }).filter((x) => x.refsTotal > 0).sort((a, b) => b.refsTotal - a.refsTotal);
  }
  const clienteStats = porCliente();
  // Igual que porCliente(), pero para Prototipos — que usan un solo campo
  // "cliente" (texto) en vez del arreglo "colores" que usan las referencias.
  const clientesUnicosProtos = [...new Set(protos.map((p) => p.cliente).filter(Boolean))].sort();
  function porClienteProtos() {
    const base = protos.filter((x) => (!yearFilter || x.createdAt?.slice(0, 4) === yearFilter) && (monthFilter === "todos" || parseInt(x.createdAt?.slice(5, 7)) - 1 === parseInt(monthFilter)));
    return clientesUnicosProtos.map((cli) => {
      const items = base.filter((p) => p.cliente === cli);
      const t = items.length, ap = items.filter((x) => x.status === "aprobado").length, dec = items.filter((x) => x.status === "declinado").length, en = t - ap - dec;
      const promovidos = items.filter((x) => x.status === "aprobado" && x.promotedTo).length;
      return { name: cli, total: t, ap, dec, en, promovidos, pctAp: t ? Math.round((ap / t) * 100) : 0 };
    }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  }
  const clienteProtoStats = porClienteProtos();
  function PersonBlock({ data, label }) {
    return !data.length ? (
      <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>Sin datos de {label.toLowerCase()}.</div>
    ) : (
      data.map((p) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
          <Avatar name={p.name} size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{p.name}</div>
            <div style={{ fontSize: 11, color: T.slate }}>{p.t} {label.toLowerCase()} · {p.enviados} enviado{p.enviados !== 1 ? "s" : ""} a cotización/cliente{p.vencidos > 0 ? ` · ⚑ ${p.vencidos} vencido${p.vencidos !== 1 ? "s" : ""}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 6, fontSize: 11, flexWrap: "wrap" }}>
            <span style={{ padding: "2px 8px", borderRadius: 20, background: T.jadeBg, color: T.jade, fontWeight: 700 }}>✓ {p.ap}</span>
            <span style={{ padding: "2px 8px", borderRadius: 20, background: T.denimBg, color: T.denim, fontWeight: 700 }}>⚙ {p.en}</span>
            <span style={{ padding: "2px 8px", borderRadius: 20, background: T.coralBg, color: T.coral, fontWeight: 700 }}>✕ {p.dec}</span>
            <span title="Certeza: aprobados sobre lo ya resuelto (aprobado+declinado)" style={{ padding: "2px 8px", borderRadius: 20, background: T.violetBg, color: T.violet, fontWeight: 700 }}>🎯 {p.certeza === null ? "—" : `${p.certeza}%`}</span>
            <span title="Rondas de revisión en Ilustración: veces que la Dirección Creativa devolvió una propuesta con cambios · promedio por pieza" style={{ padding: "2px 8px", borderRadius: 20, background: T.amberBg, color: T.amber, fontWeight: 700 }}>🎨 {p.rondasRevision} ({p.promRevision}/pieza)</span>
            <span title="Puntaje individual: Certeza + Cumplimiento de plazos" style={{ padding: "2px 8px", borderRadius: 20, background: T.ink, color: T.white, fontWeight: 700 }}>⭐ {p.puntaje === null ? "—" : p.puntaje}</span>
          </div>
        </div>
      ))
    );
  }
  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Estadísticas</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Métricas de aprobación, rechazo y proceso</p></div>
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: "18px 20px", marginBottom: 24, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <FSel2 label="Año" value={yearFilter} onChange={setYearFilter} opts={[{ v: "", l: "Todos" }, { ...years.map((y) => ({ v: y, l: y })) }].flat()} />
        <FSel2 label="Mes" value={monthFilter} onChange={setMonthFilter} opts={[{ v: "todos", l: "Todos los meses" }, ...MONTHS_ES.map((m, i) => ({ v: String(i), l: m }))]} />
        <FSel2 label="Responsable" value={personFilter} onChange={setPersonFilter} opts={[{ v: "todos", l: "Todos" }, ...responsables.map((r) => ({ v: r, l: r }))]} />
        {(monthFilter !== "todos" || personFilter !== "todos") && (
          <button onClick={() => { setMonthFilter("todos"); setPersonFilter("todos"); }} style={{ padding: "9px 14px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 8, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✕ Limpiar</button>
        )}
      </div>
      <div style={{ background: T.ink, borderRadius: 16, padding: "24px 28px", marginBottom: 24, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>⭐ Puntaje de Diseño</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: T.white, lineHeight: 1, marginTop: 4 }}>{puntajeDiseno === null ? "—" : puntajeDiseno}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{periodLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
          <div><div style={{ fontWeight: 800, fontSize: 16 }}>{certezaGlobal === null ? "—" : `${certezaGlobal}%`}</div><div style={{ color: "rgba(255,255,255,0.55)" }}>Certeza (40%)</div></div>
          <div><div style={{ fontWeight: 800, fontSize: 16 }}>{pctCumplCapsulas}%</div><div style={{ color: "rgba(255,255,255,0.55)" }}>Cápsulas cumplidas (35%)</div></div>
          <div><div style={{ fontWeight: 800, fontSize: 16 }}>{pctPlazoGlobal}%</div><div style={{ color: "rgba(255,255,255,0.55)" }}>Cumplimiento de plazos (25%)</div></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Prototipos hechos", value: protosFiltered.length, icon: "🧪", color: T.denim, bg: T.denimBg },
          { label: "Referencias hechas", value: refsFiltered.length, icon: "📋", color: T.denim, bg: T.denimBg },
          { label: "Cápsulas cumplidas", value: `${capsulasCumplidas}/${capsulasTotalFiltradas}`, icon: "🗂", color: T.jade, bg: T.jadeBg },
          { label: "% Cumplimiento cápsulas", value: `${pctCumplCapsulas}%`, icon: "✅", color: T.jade, bg: T.jadeBg },
          { label: "% Certeza (de lo resuelto)", value: certezaGlobal === null ? "—" : `${certezaGlobal}%`, icon: "🎯", color: T.violet, bg: T.violetBg },
          { label: "% Vencidas (activas)", value: `${pctVencidos}%`, icon: "⚑", color: T.coral, bg: T.coralBg },
        ].map((k) => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: "16px 18px", border: `1px solid ${k.color}22` }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: T.slate, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div style={{ marginBottom: 20, padding: "10px 16px", background: T.canvas, borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 13, color: T.slate }}>
          Período: <strong style={{ color: T.ink }}>{periodLabel}</strong> · <span style={{ color: T.violet, fontWeight: 700 }}>{certezaGlobal === null ? "—" : `${certezaGlobal}%`} certeza</span> (de {resueltosGlobal} ya resuelto{resueltosGlobal !== 1 ? "s" : ""}) · <span style={{ color: T.slate }}>{enProceso} aún en proceso</span>
        </div>
      )}
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 20 }}>Evolución Mensual — {yearFilter || "Todos"}</div>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 180 }}>
          {monthly.map((m, i) => {
            const isSel = monthFilter !== "todos" && parseInt(monthFilter) === i;
            return (
              <div key={m.m} onClick={() => setMonthFilter(monthFilter === String(i) ? "todos" : String(i))} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                <div style={{ fontSize: 9, color: T.slate, fontWeight: 700, marginBottom: 2 }}>{m.t > 0 ? m.t : ""}</div>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1, height: Math.max((m.t / maxMonth) * 150, m.t > 0 ? 6 : 2), borderRadius: 4, overflow: "hidden", border: isSel ? `2px solid ${T.ink}` : "2px solid transparent" }}>
                  {m.ap > 0 && <div style={{ flex: m.ap, background: T.jade, minHeight: 3 }} />}
                  {m.en > 0 && <div style={{ flex: m.en, background: T.denim, minHeight: 3 }} />}
                  {m.dec > 0 && <div style={{ flex: m.dec, background: T.coral, minHeight: 3 }} />}
                  {m.t === 0 && <div style={{ flex: 1, background: T.border }} />}
                </div>
                <div style={{ fontSize: 9, color: isSel ? T.ink : T.slate, fontWeight: isSel ? 800 : 400, marginTop: 4 }}>{m.m}</div>
                {m.t > 0 && <div style={{ fontSize: 8, color: T.jade, fontWeight: 700 }}>{m.pctAp}%</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: T.slate }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: T.jade, marginRight: 4 }} />Aprobados</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: T.denim, marginRight: 4 }} />En proceso</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: T.coral, marginRight: 4 }} />Declinados</span>
          <span style={{ marginLeft: "auto", fontSize: 11 }}>↑ Clic en mes para filtrar</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 4 }}>🧪 Prototipos por Responsable</div>
          <div style={{ fontSize: 12, color: T.slate, marginBottom: 16 }}>{periodLabel}</div>
          <PersonBlock data={protosPorResp} label="Prototipos" />
        </div>
        <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 4 }}>📋 Referencias por Responsable</div>
          <div style={{ fontSize: 12, color: T.slate, marginBottom: 16 }}>{periodLabel}</div>
          <PersonBlock data={refsPorResp} label="Referencias" />
        </div>
      </div>
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 4 }}>🗂 Cápsulas — Cumplimiento</div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 16 }}>{periodLabel} · Cumplida = 100% de sus referencias Aprobadas</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ padding: "3px 10px", borderRadius: 20, background: T.jadeBg, color: T.jade, fontWeight: 700, fontSize: 12 }}>✓ {capsulasCumplidas} cumplida{capsulasCumplidas !== 1 ? "s" : ""}</span>
          <span style={{ padding: "3px 10px", borderRadius: 20, background: T.denimBg, color: T.denim, fontWeight: 700, fontSize: 12 }}>⚙ {capsulasEnCurso} en curso</span>
          <span style={{ padding: "3px 10px", borderRadius: 20, background: T.coralBg, color: T.coral, fontWeight: 700, fontSize: 12 }}>✕ {capsulasConDeclinaciones} con declinaciones</span>
          <span title="Veces que la Dirección Creativa devolvió la ilustración/concepto de una cápsula antes de aprobarla · promedio por cápsula" style={{ padding: "3px 10px", borderRadius: 20, background: T.amberBg, color: T.amber, fontWeight: 700, fontSize: 12 }}>🎨 {rondasIlustracionTotal} revisión{rondasIlustracionTotal !== 1 ? "es" : ""} de ilustración ({promRondasIlustracion}/cápsula){capsulasPendientesIlustracion > 0 ? ` · ${capsulasPendientesIlustracion} pendiente${capsulasPendientesIlustracion !== 1 ? "s" : ""} de aprobar` : ""}</span>
        </div>
        {!capsulasFiltradas.length ? (
          <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>Sin cápsulas para este período.</div>
        ) : (
          capsulasFiltradas.map((c) => {
            const est = estadoCapsula(c);
            const ap = c.referencias.filter((r) => r.status === "aprobado").length;
            const badge = est === "cumplida"
              ? { label: "✓ Cumplida", color: T.jade, bg: T.jadeBg }
              : est === "en_curso"
                ? { label: "⚙ En curso", color: T.denim, bg: T.denimBg }
                : est === "con_declinaciones"
                  ? { label: "✕ Con declinaciones", color: T.coral, bg: T.coralBg }
                  : { label: "— Sin referencias", color: T.slate, bg: "#EDEDF2" };
            const estIlustracion = ILUSTRACION_CAPSULA_ESTADO[c.ilustracionEstado] || ILUSTRACION_CAPSULA_ESTADO.aprobado;
            const rondasIlustracionCap = (c.observacionesIlustracion || []).filter((o) => o.type === "revision_ilustracion_capsula").length;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.slate }}>{c.season} · {ap}/{c.referencias.length} referencias aprobadas</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!ilustracionAprobada(c) && <span style={{ padding: "3px 10px", borderRadius: 20, background: estIlustracion.bg, color: estIlustracion.color, fontWeight: 700, fontSize: 11 }}>🎨 {estIlustracion.label}{rondasIlustracionCap > 0 ? ` · ${rondasIlustracionCap}` : ""}</span>}
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: badge.bg, color: badge.color, fontWeight: 700, fontSize: 11 }}>{badge.label}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 4 }}>🧪 Por Cliente — Prototipos</div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 16 }}>{periodLabel}</div>
        {!clienteProtoStats.length ? (
          <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 24 }}>Sin datos de clientes para este período. Asigna un cliente a tus prototipos.</div>
        ) : (
          clienteProtoStats.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${T.border}` }}>
              <Avatar name={c.name} size={38} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{c.name}</div><div style={{ fontSize: 12, color: T.slate }}>{c.total} prototipo{c.total !== 1 ? "s" : ""}{c.promovidos > 0 ? ` · ${c.promovidos} promovido${c.promovidos !== 1 ? "s" : ""} a cápsula` : ""}</div></div>
              <div style={{ display: "flex", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: T.jadeBg, color: T.jade, fontWeight: 700 }}>✓ {c.ap} ({c.pctAp}%)</span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: T.denimBg, color: T.denim, fontWeight: 700 }}>⚙ {c.en}</span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: T.coralBg, color: T.coral, fontWeight: 700 }}>✕ {c.dec}</span>
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 4 }}>🏢 Por Cliente — Cápsulas y Referencias</div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 16 }}>{periodLabel}</div>
        {!clienteStats.length ? (
          <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 24 }}>Sin datos de clientes para este período. Asigna un cliente a tus referencias.</div>
        ) : (
          clienteStats.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${T.border}` }}>
              <Avatar name={c.name} size={38} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{c.name}</div><div style={{ fontSize: 12, color: T.slate }}>{c.capsulasTotal} cápsula{c.capsulasTotal !== 1 ? "s" : ""} · {c.refsTotal} referencia{c.refsTotal !== 1 ? "s" : ""}</div></div>
              <div style={{ display: "flex", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: T.violetBg, color: T.violet, fontWeight: 700 }}>🗂 {c.capsulasTotal}</span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: T.jadeBg, color: T.jade, fontWeight: 700 }}>✓ {c.refsAp} ({c.pctAp}%)</span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: T.denimBg, color: T.denim, fontWeight: 700 }}>⚙ {c.refsEn}</span>
                <span style={{ padding: "3px 10px", borderRadius: 20, background: T.coralBg, color: T.coral, fontWeight: 700 }}>✕ {c.refsDec}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CambiarClaveModal({ currentUser, onSave, onClose }) {
  const [current, setCurrent] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  function save() {
    if (current !== currentUser.password) { setError("La contraseña actual no es correcta."); return; }
    if (!nueva.trim() || nueva.length < 6) { setError("La nueva contraseña debe tener al menos 6 caracteres."); return; }
    if (nueva !== confirm) { setError("Las contraseñas no coinciden."); return; }
    onSave(nueva.trim());
    onClose();
  }
  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose} width={420}>
      <Field label="Contraseña actual">
        <div style={{ position: "relative" }}>
          <input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Tu contraseña actual" style={{ width: "100%", padding: "9px 40px 9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
          <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>{show ? "🙈" : "👁"}</button>
        </div>
      </Field>
      <Field label="Nueva contraseña"><input type={show ? "text" : "password"} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Mínimo 6 caracteres" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></Field>
      <Field label="Confirmar nueva contraseña"><input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Repite la nueva contraseña" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></Field>
      {error && <div style={{ padding: "8px 12px", background: T.coralBg, borderRadius: 8, fontSize: 13, color: T.coral, fontWeight: 600, marginBottom: 12 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="success" onClick={save}>Cambiar contraseña</Btn>
      </div>
    </Modal>
  );
}
function EditNombreModal({ item, tipo, config, onSave, onClose }) {
  const [nombre, setNombre] = useState(item?.name || "");
  const [season, setSeason] = useState(item?.season || "");
  const [assignedTo, setAssignedTo] = useState(item?.assignedTo || "");
  function save() { if (!nombre.trim()) return; onSave({ name: nombre.trim(), ...(tipo === "capsula" ? { season: season.trim(), assignedTo } : {}) }); onClose(); }
  return (
    <Modal title={`Editar ${tipo === "capsula" ? "Cápsula" : "Prototipo"}`} onClose={onClose} width={420}>
      <Field label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></Field>
      {tipo === "capsula" && <Field label="Temporada / Código"><input value={season} onChange={(e) => setSeason(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></Field>}
      {tipo === "capsula" && <Field label="Responsable"><FSel value={assignedTo} onChange={setAssignedTo} options={config?.disenadores || []} /></Field>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Guardar cambios</Btn>
      </div>
    </Modal>
  );
}
function UsersTab({ users, onUpdateUsers, config }) {
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "Equipo Interno", isAdmin: false });
  const [changePwdId, setChangePwdId] = useState(null);
  const [newPwd, setNewPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const roleOptions = config.roles.map((r) => r.name);
  function openNew() { setForm({ name: "", username: "", password: "", role: "Equipo Interno", isAdmin: false }); setEditUser(null); setShowForm(true); setError(""); }
  function openEdit(u) { setForm({ name: u.name, username: u.username, password: u.password, role: u.role, isAdmin: u.isAdmin }); setEditUser(u); setShowForm(true); setError(""); }
  function saveUser() {
    if (!form.name || !form.username || !form.password) { setError("Todos los campos son obligatorios."); return; }
    const dup = users.find((u) => u.username === form.username.toLowerCase() && u.id !== editUser?.id);
    if (dup) { setError("Ese usuario ya existe."); return; }
    const avatar = form.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    if (editUser) {
      onUpdateUsers(users.map((u) => (u.id === editUser.id ? { ...u, ...form, username: form.username.toLowerCase(), avatar } : u)));
    } else {
      onUpdateUsers([...users, { id: uid(), ...form, username: form.username.toLowerCase(), avatar }]);
    }
    setShowForm(false);
    setError("");
  }
  function deleteUser(id) { if (id === "u1") return; onUpdateUsers(users.filter((u) => u.id !== id)); }
  function changePassword() {
    if (!newPwd.trim()) return;
    onUpdateUsers(users.map((u) => (u.id === changePwdId ? { ...u, password: newPwd.trim() } : u)));
    setChangePwdId(null);
    setNewPwd("");
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Gestión de Usuarios</div><div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{users.length} usuario{users.length !== 1 ? "s" : ""}</div></div>
        <Btn onClick={openNew}>+ Nuevo Usuario</Btn>
      </div>
      {showForm && (
        <div style={{ background: T.canvas, borderRadius: 12, padding: 20, border: `1.5px solid ${T.denim}`, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 16 }}>{editUser ? `Editar: ${editUser.name}` : "Nuevo Usuario"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nombre completo</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Laura Sánchez" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Usuario</label>
              <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="Ej: laura" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Contraseña</label>
              <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Rol</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: T.ink, fontWeight: 600 }}>
              <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))} /> Acceso de administrador
            </label>
          </div>
          {error && <div style={{ marginTop: 12, padding: "8px 12px", background: T.coralBg, borderRadius: 8, fontSize: 13, color: T.coral, fontWeight: 600 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => { setShowForm(false); setError(""); }}>Cancelar</Btn>
            <Btn onClick={saveUser}>{editUser ? "Guardar cambios" : "Crear Usuario"}</Btn>
          </div>
        </div>
      )}
      {changePwdId && (
        <div style={{ background: "#FFF8E1", borderRadius: 12, padding: 20, border: `1.5px solid ${T.amber}`, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.amber, marginBottom: 12 }}>🔑 Cambiar contraseña — {users.find((u) => u.id === changePwdId)?.name}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input type={showPwd ? "text" : "password"} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changePassword()} placeholder="Nueva contraseña..." style={{ width: "100%", padding: "9px 40px 9px 12px", border: `1.5px solid ${T.amber}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
              <button onClick={() => setShowPwd(!showPwd)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>{showPwd ? "🙈" : "👁"}</button>
            </div>
            <Btn variant="amber" onClick={changePassword}>Guardar</Btn>
            <Btn variant="secondary" onClick={() => { setChangePwdId(null); setNewPwd(""); }}>Cancelar</Btn>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.canvas, borderRadius: 12, border: `1px solid ${T.border}` }}>
            <Avatar name={u.name} size={42} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>{u.name}</span>
                {u.isAdmin && <span style={{ padding: "2px 8px", borderRadius: 4, background: T.ink, color: T.seam, fontSize: 10, fontWeight: 800 }}>ADMIN</span>}
                <span style={{ padding: "2px 8px", borderRadius: 4, background: u.role === "Cliente" ? T.violetBg : T.denimBg, color: u.role === "Cliente" ? T.violet : T.denim, fontSize: 10, fontWeight: 700 }}>{u.role}</span>
              </div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 3 }}>@{u.username}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setChangePwdId(u.id)} style={{ padding: "6px 12px", background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 8, color: T.amber, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🔑 Clave</button>
              <button onClick={() => openEdit(u)} style={{ padding: "6px 12px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 8, color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏ Editar</button>
              {u.id !== "u1" && <button onClick={() => deleteUser(u.id)} style={{ padding: "6px 12px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 8, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function ClientesTab({ config, onUpdateConfig }) {
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [form, setForm] = useState({ nombre: "", contacto: "", email: "", telefono: "" });
  const clientes = config.clientes || [];
  function openNew() { setForm({ nombre: "", contacto: "", email: "", telefono: "" }); setEditIdx(null); setShowForm(true); }
  function openEdit(i) { setForm({ ...clientes[i] }); setEditIdx(i); setShowForm(true); }
  function save() {
    if (!form.nombre.trim()) return;
    const updated = editIdx !== null ? clientes.map((c, i) => (i === editIdx ? { ...form } : c)) : [...clientes, { ...form, id: uid() }];
    onUpdateConfig({ clientes: updated });
    setShowForm(false);
  }
  function del(i) { onUpdateConfig({ clientes: clientes.filter((_, idx) => idx !== i) }); }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Clientes</div><div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{clientes.length} cliente{clientes.length !== 1 ? "s" : ""}</div></div>
        <Btn onClick={openNew}>+ Nuevo Cliente</Btn>
      </div>
      {showForm && (
        <div style={{ background: T.canvas, borderRadius: 12, padding: 20, border: `1.5px solid ${T.denim}`, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 16 }}>{editIdx !== null ? "Editar Cliente" : "Nuevo Cliente"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Nombre / Empresa</label><input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Almacenes XYZ" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Contacto</label><input value={form.contacto} onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} placeholder="Nombre del contacto" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Email</label><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="correo@ejemplo.com" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></div>
            <div><label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Teléfono</label><input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="+57 300 000 0000" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Btn>
            <Btn onClick={save}>{editIdx !== null ? "Guardar cambios" : "Crear Cliente"}</Btn>
          </div>
        </div>
      )}
      {!clientes.length && !showForm && <div style={{ textAlign: "center", padding: 32, color: T.slate, fontSize: 13 }}>No hay clientes registrados.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {clientes.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.canvas, borderRadius: 12, border: `1px solid ${T.border}` }}>
            <Avatar name={c.nombre} size={42} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>{c.nombre}</div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{c.contacto}{c.email ? ` · ${c.email}` : ""}{c.telefono ? ` · ${c.telefono}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openEdit(i)} style={{ padding: "6px 12px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 8, color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏ Editar</button>
              <button onClick={() => del(i)} style={{ padding: "6px 12px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 8, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminView({ config, onUpdateConfig, users, onUpdateUsers, protos, capsulas, onUpdateProto, onUpdateCapsula, onDeleteProto, onDeleteCapsula, isAdmin }) {
  const [tab, setTab] = useState("etapas");
  const [newItem, setNewItem] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  function addToList(key) { if (!newItem.trim()) return; onUpdateConfig({ [key]: [...config[key], newItem.trim()] }); setNewItem(""); }
  function removeFromList(key, val) { onUpdateConfig({ [key]: config[key].filter((x) => x !== val) }); }
  function updateStageDays(id, days) {
    onUpdateConfig({ stages: config.stages.map((s) => (s.id === id ? { ...s, days: Math.max(1, parseInt(days) || 1) } : s)) });
  }
  function addRole() {
    if (!newItem.trim()) return;
    onUpdateConfig({ roles: [...config.roles, { id: uid(), name: newItem.trim(), perms: ["editar"], modulos: [...DISENO_SUBMODULOS] }] });
    setNewItem("");
  }
  function removeRole(id) { onUpdateConfig({ roles: config.roles.filter((r) => r.id !== id) }); }
  // Módulos visibles por rol, por sección independiente (Prototipos, Cápsulas,
  // Pedidos, Clientes, Corte, Estadísticas, Contabilidad), separado de los
  // permisos de flujo de trabajo. Si el rol no tiene "modulos" aún, se
  // inicializa con el comportamiento previo antes de aplicar el toggle.
  function legacyModulos(r) {
    return ["diseno", ...(r.perms.includes("corte") ? ["corte"] : []), ...(r.perms.includes("admin") ? ["contabilidad"] : [])];
  }
  // Expande la llave antigua "diseno" (todo-o-nada) a las secciones
  // granulares equivalentes, para mostrar/editar roles guardados antes de
  // este cambio con los mismos checkboxes que los roles nuevos.
  function effectiveModulos(r) {
    const base = Array.isArray(r.modulos) ? r.modulos : legacyModulos(r);
    if (base.includes("diseno")) {
      return [...new Set([...base.filter((m) => m !== "diseno"), ...DISENO_SUBMODULOS])];
    }
    return base;
  }
  function toggleModulo(roleId, mod) {
    onUpdateConfig({
      roles: config.roles.map((r) => {
        if (r.id !== roleId) return r;
        const current = effectiveModulos(r);
        return { ...r, modulos: current.includes(mod) ? current.filter((m) => m !== mod) : [...current, mod] };
      }),
    });
  }
  // Prende/apaga TODAS las secciones básicas de Diseño de una sola vez. No
  // toca "admin_diseno" a propósito: el acceso al panel de Administración de
  // Diseño se otorga siempre de forma explícita, nunca por el toggle general,
  // para que marcar/desmarcar "Diseño" no le dé de rebote poderes de admin.
  function toggleDisenoGroup(roleId) {
    onUpdateConfig({
      roles: config.roles.map((r) => {
        if (r.id !== roleId) return r;
        const current = effectiveModulos(r);
        const todosActivos = DISENO_SUBMODULOS.every((m) => current.includes(m));
        const resto = current.filter((m) => !DISENO_SUBMODULOS.includes(m));
        return { ...r, modulos: todosActivos ? resto : [...resto, ...DISENO_SUBMODULOS] };
      }),
    });
  }
  const DISENO_ITEMS_DEF = [
    ["protos", "⬡ Prototipos"],
    ["capsulas", "⬢ Cápsulas"],
    ["pedidos", "📦 Pedidos"],
    ["pedidos_clientes", "🏢 Clientes"],
    ["corte", "✂ Corte"],
    ["historial", "🕘 Historial"],
    ["cronograma_muestras", "🧵 Cronograma de Muestras"],
    ["bitacora", "📜 Bitácora de Envíos"],
    ["stats", "📊 Estadísticas"],
  ];
  const OTROS_MODULOS_DEF = [["contabilidad", "💰 Contabilidad"], ["planeacion", "📋 Planeación"]];
  const adminTabs = [["etapas", "⏱ Etapas"], ["categorias", "🏷 Categorías"], ["siluetas", "🔷 Siluetas"], ["rangos", "📏 Rangos"], ["disenadores", "🎨 Diseñadores"], ["talleres", "🧵 Talleres de Muestra"], ["prioridades", "🚩 Prioridades de Muestra"], ["roles", "👥 Roles"], ["usuarios", "👤 Usuarios"], ["clientes", "🏢 Clientes"], ["contenido", "📁 Contenido"]];
  function ListEditor({ listKey, title }) {
    return (
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 16 }}>{title}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addToList(listKey)} placeholder={`Nuevo ${title.toLowerCase()}...`} style={{ flex: 1, padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
          <Btn onClick={() => addToList(listKey)}>+ Agregar</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {config[listKey].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.canvas, borderRadius: 8, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{item}</span>
              <button onClick={() => removeFromList(listKey, item)} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      {editItem && (
        <EditNombreModal item={editItem.item} tipo={editItem.tipo} config={config}
          onSave={(p) => { if (editItem.tipo === "proto") onUpdateProto(editItem.item.id, p); else onUpdateCapsula(editItem.item.id, p); setEditItem(null); }}
          onClose={() => setEditItem(null)}
        />
      )}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar <strong>"{confirmDel.name}"</strong>? Esta acción no se puede deshacer.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { if (confirmDel.tipo === "proto") onDeleteProto(confirmDel.id); else onDeleteCapsula(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 24 }}><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Administración</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Configuración global del sistema</p></div>
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: T.canvas, borderRadius: 12, padding: 4, flexWrap: "wrap" }}>
        {adminTabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: tab === id ? 700 : 500, fontSize: 13, background: tab === id ? T.white : "transparent", color: tab === id ? T.ink : T.slate, boxShadow: tab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{label}</button>
        ))}
      </div>
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 24 }}>
        {tab === "etapas" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 16 }}>Duración de Etapas (días)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {config.stages.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.canvas, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{s.label}</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => updateStageDays(s.id, s.days - 1)} disabled={s.days <= 1} style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${T.border}`, background: T.white, cursor: "pointer", fontSize: 18, fontWeight: 700 }}>−</button>
                    <div style={{ width: 60, textAlign: "center" }}>
                      <input type="number" value={s.days} min={1} max={30} onChange={(e) => updateStageDays(s.id, e.target.value)} style={{ width: "100%", padding: "6px", border: `1.5px solid ${T.denim}`, borderRadius: 6, fontSize: 16, fontWeight: 800, textAlign: "center", color: T.denim, background: T.white, fontFamily: "inherit" }} />
                      <div style={{ fontSize: 10, color: T.slate, marginTop: 2 }}>días</div>
                    </div>
                    <button onClick={() => updateStageDays(s.id, s.days + 1)} style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${T.border}`, background: T.white, cursor: "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
                  </div>
                  <div style={{ padding: "4px 12px", background: T.denimBg, borderRadius: 20, fontSize: 12, fontWeight: 700, color: T.denim }}>{s.days}d</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", background: T.amberBg, borderRadius: 8, fontSize: 13, color: T.amber, fontWeight: 600 }}>Total: {config.stages.reduce((a, s) => a + s.days, 0)} días</div>
          </div>
        )}
        {tab === "categorias" && <ListEditor listKey="categorias" title="Categorías" />}
        {tab === "siluetas" && <ListEditor listKey="siluetas" title="Siluetas" />}
        {tab === "rangos" && <ListEditor listKey="rangos" title="Rangos" />}
        {tab === "disenadores" && <ListEditor listKey="disenadores" title="Diseñadores" />}
        {tab === "talleres" && <ListEditor listKey="talleresMuestra" title="Talleres de Muestra" />}
        {tab === "prioridades" && <ListEditor listKey="prioridadesMuestra" title="Prioridades de Muestra" />}
        {tab === "roles" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 16 }}>Roles</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRole()} placeholder="Nuevo rol..." style={{ flex: 1, padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
              <Btn onClick={addRole}>+ Crear</Btn>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {config.roles.map((r) => {
                const modulosActivos = effectiveModulos(r);
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px", background: T.canvas, borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <Avatar name={r.name} size={36} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{r.name}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10, marginBottom: 4 }}>Permisos de flujo de trabajo</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["editar", "aprobar", "declinar", "admin", "corte", "ilustracion"].map((perm) => (
                          <span key={perm} onClick={() => onUpdateConfig({ roles: config.roles.map((x) => (x.id !== r.id ? x : { ...x, perms: x.perms.includes(perm) ? x.perms.filter((p) => p !== perm) : [...x.perms, perm] })) })}
                            style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", background: r.perms.includes(perm) ? T.jadeBg : "#EDEDF2", color: r.perms.includes(perm) ? T.jade : T.slate, border: `1px solid ${r.perms.includes(perm) ? T.jade : T.border}` }}
                          >{perm}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10, marginBottom: 4 }}>Módulos visibles</div>
                      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", maxWidth: 420 }}>
                        {(() => {
                          const disenoActivos = DISENO_SUBMODULOS.filter((m) => modulosActivos.includes(m)).length;
                          const disenoTotal = DISENO_SUBMODULOS.length;
                          return (
                            <span onClick={() => toggleDisenoGroup(r.id)}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: disenoActivos > 0 ? T.violetBg : T.canvas, cursor: "pointer", fontSize: 12, fontWeight: 700, color: disenoActivos > 0 ? T.violet : T.slate }}
                            >
                              <span style={{ flex: 1 }}>🎨 Diseño</span>
                              <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.75 }}>{disenoActivos}/{disenoTotal} activas</span>
                            </span>
                          );
                        })()}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 10px 8px 26px", borderTop: `1px solid ${T.border}` }}>
                          {DISENO_ITEMS_DEF.map(([mod, label]) => {
                            const activo = modulosActivos.includes(mod);
                            return (
                              <span key={mod} onClick={() => toggleModulo(r.id, mod)}
                                style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", background: activo ? T.violetBg : "#EDEDF2", color: activo ? T.violet : T.slate, border: `1px solid ${activo ? T.violet : T.border}` }}
                              >{label}</span>
                            );
                          })}
                        </div>
                        <div style={{ padding: "8px 10px 8px 26px", borderTop: `1px solid ${T.border}` }}>
                          {(() => {
                            const activo = modulosActivos.includes("admin_diseno");
                            return (
                              <span onClick={() => toggleModulo(r.id, "admin_diseno")}
                                title="Acceso al panel de Administración de Diseño (etapas, categorías, roles, usuarios...), independiente de ser Admin general"
                                style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", background: activo ? T.amberBg : "#EDEDF2", color: activo ? T.amber : T.slate, border: `1px solid ${activo ? T.amber : T.border}` }}
                              >⚙ Admin Diseño</span>
                            );
                          })()}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {OTROS_MODULOS_DEF.map(([mod, label]) => {
                          const activo = modulosActivos.includes(mod);
                          return (
                            <span key={mod} onClick={() => toggleModulo(r.id, mod)}
                              style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", background: activo ? T.violetBg : "#EDEDF2", color: activo ? T.violet : T.slate, border: `1px solid ${activo ? T.violet : T.border}` }}
                            >{label}</span>
                          );
                        })}
                      </div>
                    </div>
                    {!["r1", "r2"].includes(r.id) && (
                      <button onClick={() => removeRole(r.id)} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "6px 12px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab === "usuarios" && <UsersTab users={users} onUpdateUsers={onUpdateUsers} config={config} />}
        {tab === "clientes" && <ClientesTab config={config} onUpdateConfig={onUpdateConfig} />}
        {tab === "contenido" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 20 }}>Gestión de Contenido</div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>⬡ Prototipos <span style={{ fontSize: 12, color: T.slate, fontWeight: 400 }}>({protos.length} total)</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {protos.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.canvas, borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.slate }}>{p.reference} · {p.categoria} · <span style={{ color: STATUS[p.status]?.color, fontWeight: 700 }}>{STATUS[p.status]?.label}</span></div>
                    </div>
                    <button onClick={() => setEditItem({ item: p, tipo: "proto" })} style={{ padding: "5px 10px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 6, color: T.denim, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏ Editar</button>
                    {isAdmin && <button onClick={() => setConfirmDel({ id: p.id, tipo: "proto", name: p.name })} style={{ padding: "5px 10px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🗑 Borrar</button>}
                  </div>
                ))}
                {!protos.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>Sin prototipos.</div>}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>⬢ Cápsulas <span style={{ fontSize: 12, color: T.slate, fontWeight: 400 }}>({capsulas.length} total)</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {capsulas.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.canvas, borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: T.slate }}>{c.season} · {c.referencias.length} referencia{c.referencias.length !== 1 ? "s" : ""}</div>
                    </div>
                    <button onClick={() => setEditItem({ item: c, tipo: "capsula" })} style={{ padding: "5px 10px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 6, color: T.denim, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏ Editar</button>
                    {isAdmin && <button onClick={() => setConfirmDel({ id: c.id, tipo: "capsula", name: c.name })} style={{ padding: "5px 10px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🗑 Borrar</button>}
                  </div>
                ))}
                {!capsulas.length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>Sin cápsulas.</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function parseBusintParaPedido(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  const COL = { numPedido: 2, cliente: 5, fechaPed: 8, fechaDes: 8, ciudad: 10, vendedor: 11, ref: 12, descripcion: 13, tallas: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23] };
  const TALLA_LABELS = ["U-2/4-2 PLUS", "4 XS", "6-6/8 S-S/M", "8 M-M/L", "10-10/12 L-L/XL", "12 XL-1XL", "14-14/16 2XL", "16 3XL", "18 4XL", "20"];
  function cs(row, idx) { return String(row[idx] || "").trim(); }
  function cn(row, idx) { return Math.round(Number(row[idx]) || 0); }
  function fmtF(val) {
    if (!val) return "";
    if (typeof val === "number") { const d = new Date(Math.round((val - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10); }
    return String(val).trim();
  }
  const pedido = { id: uid(), numero: "", cliente: "", fechaPedido: "", fechaDespacho: "", vendedor: "", ciudad: "", referencias: [], estado: "activo", seguimiento: {}, cortesRealizados: [], creadoEn: today() };
  PEDIDO_STAGES.forEach((s) => { pedido.seguimiento[s] = false; });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const numPed = cs(row, COL.numPedido);
    if (numPed && String(numPed).match(/^\d{3,6}$/)) {
      if (!pedido.numero) pedido.numero = numPed;
      if (!pedido.cliente && cs(row, COL.cliente)) pedido.cliente = cs(row, COL.cliente);
      if (!pedido.fechaPedido) pedido.fechaPedido = fmtF(row[COL.fechaPed]);
      if (!pedido.fechaDespacho) pedido.fechaDespacho = fmtF(row[COL.fechaDes]);
      if (!pedido.ciudad) pedido.ciudad = cs(row, COL.ciudad);
      if (!pedido.vendedor) pedido.vendedor = cs(row, COL.vendedor);
    }
    if (!pedido.cliente) {
      const c = cs(row, COL.cliente);
      if (c && c.length > 3 && !c.match(/YANKO|INDUSTRIAS|Nit/i)) pedido.cliente = c;
    }
    const refVal = cs(row, COL.ref), descVal = cs(row, COL.descripcion);
    const tot = COL.tallas.reduce((s, idx) => s + cn(row, idx), 0);
    if (refVal && tot > 0 && !refVal.match(/^(Ref|TOTAL|Suma)/i)) {
      const ref = { id: uid(), ref: refVal, descripcion: descVal, tallas: {}, total: 0 };
      COL.tallas.forEach((ci, ti) => { const v = cn(row, ci); ref.tallas[TALLA_LABELS[ti]] = v; ref.total += v; });
      pedido.referencias.push(ref);
    }
  }
  if (!pedido.numero) {
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const m = (rows[i] || []).map((c) => String(c || "")).join(" ").match(/\b(\d{3,6})\b/);
      if (m) { pedido.numero = m[1]; break; }
    }
  }
  return pedido;
}
function semaforo2(fechaDespacho) {
  if (!fechaDespacho) return { color: "#5A5A7A", label: "Sin fecha", bg: "#EDEDF2" };
  const dias = Math.ceil((new Date(fechaDespacho) - new Date()) / 86400000);
  if (dias < 0) return { color: T.coral, label: `Vencido ${Math.abs(dias)}d`, bg: T.coralBg };
  if (dias <= 3) return { color: T.coral, label: `${dias}d`, bg: T.coralBg };
  if (dias <= 7) return { color: T.amber, label: `${dias}d`, bg: T.amberBg };
  return { color: T.jade, label: `${dias}d`, bg: T.jadeBg };
}
function fmtNum(n) { return Number(n || 0).toLocaleString("es-CO"); }
function fmtCOP(n) { return `$${fmtNum(Math.round(n || 0))}`; }
function refsAprobadasPendientesDePedido(capsulas, pedidos) { return []; }
function capsulasPendientesDePedido(capsulas, pedidos) { return []; }

function SubirPedidoModal2({ onSave, onClose, pedidoConfig, pedidos, clientes }) {
  const [paso, setPaso] = useState(1);
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef();
  const TALLA_LABELS = ["U-2/4-2 PLUS", "4 XS", "6-6/8 S-S/M", "8 M-M/L", "10-10/12 L-L/XL", "12 XL-1XL", "14-14/16 2XL", "16 3XL", "18 4XL", "20"];
  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const p = await parseBusintParaPedido(f);
      if (!p.referencias.length) { setError("No se encontraron referencias. Verifica el archivo."); return; }
      setPedido(p);
      setPaso(2);
    } catch (err) { setError("Error: " + err.message); }
  }
  function handleManual() {
    const p = { id: uid(), numero: "", cliente: "", fechaPedido: today(), fechaDespacho: "", vendedor: "", ciudad: "", referencias: [], estado: "activo", seguimiento: {}, cortesRealizados: [], creadoEn: today() };
    PEDIDO_STAGES.forEach((s) => { p.seguimiento[s] = false; });
    setPedido(p);
    setPaso(2);
  }
  function addRef() {
    setPedido((p) => ({ ...p, referencias: [...p.referencias, { id: uid(), ref: "", descripcion: "", tallas: Object.fromEntries(TALLA_LABELS.map((t) => [t, 0])), total: 0 }] }));
  }
  function updateRef(idx, field, val) {
    setPedido((p) => {
      const refs = [...p.referencias];
      refs[idx] = { ...refs[idx], [field]: val };
      if (field.startsWith("t_")) {
        const t = field.slice(2);
        refs[idx].tallas = { ...refs[idx].tallas, [t]: parseInt(val) || 0 };
        refs[idx].total = Object.values(refs[idx].tallas).reduce((a, b) => a + b, 0);
      }
      return { ...p, referencias: refs };
    });
  }
  function save() {
    if (!pedido.numero?.trim() || !pedido.cliente || !pedido.referencias.length) { setError("Completa el N° de Pedido, el cliente y al menos una referencia."); return; }
    // Evita que un mismo N° de Pedido quede cargado dos veces (crearía un
    // pedido duplicado para el cliente) — se compara contra TODOS los
    // pedidos existentes, sin importar si están Activos, Terminados o en
    // Histórico.
    const yaExiste = (pedidos || []).some((p) => String(p.numero).trim().toLowerCase() === pedido.numero.trim().toLowerCase());
    if (yaExiste) { setError(`El N° de Pedido "${pedido.numero.trim()}" ya existe. Usa un número diferente para no duplicar el pedido.`); return; }
    onSave(pedido);
    onClose();
  }
  return (
    <Modal title="Cargar Pedido Busint" onClose={onClose} width={720}>
      {paso === 1 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div onClick={() => fileRef.current.click()} style={{ border: `2px dashed ${T.denim}`, borderRadius: 12, padding: 32, textAlign: "center", cursor: "pointer", background: T.denimBg }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 700, color: T.denim }}>Subir Excel de Busint</div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>Acepta .xlsx, .xls</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />
            </div>
            <div onClick={handleManual} style={{ border: `2px dashed ${T.border}`, borderRadius: 12, padding: 32, textAlign: "center", cursor: "pointer", background: T.canvas }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✏️</div>
              <div style={{ fontWeight: 700, color: T.ink }}>Ingresar manualmente</div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>Digitar los datos del pedido</div>
            </div>
          </div>
          {error && <div style={{ padding: "10px 14px", background: T.coralBg, borderRadius: 8, color: T.coral, fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
        </div>
      )}
      {paso === 2 && pedido && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Field label="Pedido N°"><FInput value={pedido.numero} onChange={(v) => setPedido((p) => ({ ...p, numero: v }))} placeholder="Ej: 1204" /></Field>
            <Field label="Cliente">
              <select value={pedido.cliente} onChange={(e) => setPedido((p) => ({ ...p, cliente: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
                <option value="">— Seleccionar cliente —</option>
                {(clientes || []).map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                <option value={pedido.cliente && !(clientes || []).find((c) => c.nombre === pedido.cliente) ? pedido.cliente : "__otro__"}>Otro (texto libre)</option>
              </select>
              {!(clientes || []).find((c) => c.nombre === pedido.cliente) && pedido.cliente !== "" && (
                <FInput value={pedido.cliente} onChange={(v) => setPedido((p) => ({ ...p, cliente: v }))} placeholder="Nombre del cliente" />
              )}
            </Field>
            <Field label="Fecha Pedido"><FInput type="date" value={pedido.fechaPedido} onChange={(v) => setPedido((p) => ({ ...p, fechaPedido: v }))} /></Field>
            <Field label="Fecha Despacho"><FInput type="date" value={pedido.fechaDespacho} onChange={(v) => setPedido((p) => ({ ...p, fechaDespacho: v }))} /></Field>
            <Field label="Vendedor">
              <select value={pedido.vendedor} onChange={(e) => setPedido((p) => ({ ...p, vendedor: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
                <option value="">— Seleccionar vendedor —</option>
                {(pedidoConfig?.vendedores || []).map((v) => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Ciudad"><FInput value={pedido.ciudad} onChange={(v) => setPedido((p) => ({ ...p, ciudad: v }))} placeholder="Ciudad" /></Field>
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, margin: "12px 0 8px" }}>
            Referencias ({pedido.referencias.length})
            <button onClick={addRef} style={{ marginLeft: 12, padding: "4px 10px", background: T.denimBg, border: `1px solid ${T.denim}`, borderRadius: 6, color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Agregar</button>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {pedido.referencias.map((ref, idx) => (
              <div key={ref.id} style={{ background: T.canvas, borderRadius: 10, padding: 14, marginBottom: 10, border: `1px solid ${T.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 10 }}>
                  <Field label="Ref"><FInput value={ref.ref} onChange={(v) => updateRef(idx, "ref", v)} placeholder="986675" /></Field>
                  <Field label="Descripción"><FInput value={ref.descripcion} onChange={(v) => updateRef(idx, "descripcion", v)} placeholder="CAMISETA SISA" /></Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                  {TALLA_LABELS.map((t) => (
                    <div key={t}>
                      <div style={{ fontSize: 9, color: T.slate, fontWeight: 700, marginBottom: 3 }}>{t}</div>
                      <input type="number" value={ref.tallas[t] || 0} onChange={(e) => updateRef(idx, `t_${t}`, e.target.value)} style={{ width: "100%", padding: "5px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, textAlign: "center" }} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, textAlign: "right", fontWeight: 800, color: T.denim, fontSize: 14 }}>Total: {ref.total}</div>
              </div>
            ))}
          </div>
          {error && <div style={{ padding: "10px 14px", background: T.coralBg, borderRadius: 8, color: T.coral, fontSize: 13, fontWeight: 600, marginTop: 12 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 16 }}>
            <Btn variant="secondary" onClick={() => setPaso(1)}>← Atrás</Btn>
            <Btn variant="success" onClick={save}>✓ Guardar Pedido</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PedidoDetailView({ pedido, onBack, onUpdatePedido }) {
  const [showConfirmCumplido, setShowConfirmCumplido] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const TALLA_LABELS = ["U-2/4-2 PLUS", "4 XS", "6-6/8 S-S/M", "8 M-M/L", "10-10/12 L-L/XL", "12 XL-1XL", "14-14/16 2XL", "16 3XL", "18 4XL", "20"];
  const totalPedido = pedido.referencias.reduce((s, r) => s + r.total, 0);
  const totalCortado = (pedido.cortesRealizados || []).reduce((s, c) => s + (c.totalUnidades || 0), 0);
  const pct = totalPedido > 0 ? Math.round((totalCortado / totalPedido) * 100) : 0;
  const sem = semaforo2(pedido.fechaDespacho);
  const etapasHechas = Object.values(pedido.seguimiento || {}).filter(Boolean).length;
  const etapasPct = Math.round((etapasHechas / PEDIDO_STAGES.length) * 100);
  function excedente(ref) {
    const cortado = (pedido.cortesRealizados || []).flatMap((c) => c.refs || []).filter((cr) => cr.refId === ref.id).reduce((acc, cr) => {
      TALLA_LABELS.forEach((t) => { acc[t] = (acc[t] || 0) + (cr.tallas?.[t] || 0); });
      return acc;
    }, {});
    const exc = {};
    TALLA_LABELS.forEach((t) => { exc[t] = (ref.tallas?.[t] || 0) - (cortado[t] || 0); });
    return exc;
  }
  function toggleEtapa(stage) { onUpdatePedido({ ...pedido, seguimiento: { ...pedido.seguimiento, [stage]: !pedido.seguimiento?.[stage] } }); }
  function marcarCumplido() { onUpdatePedido({ ...pedido, estado: "cumplido", fechaCumplido: today() }); onBack(); }
  function marcarTerminado() { onUpdatePedido({ ...pedido, estado: "terminado" }); }
  function deshacerTerminado() { onUpdatePedido({ ...pedido, estado: "activo" }); }
  return (
    <div>
      {showEdit && <EditPedidoModal pedido={pedido} onSave={(p) => { onUpdatePedido(p); setShowEdit(false); }} onClose={() => setShowEdit(false)} />}
      {showConfirmCumplido && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.ink, marginBottom: 12 }}>¿Marcar como Cumplido?</div>
            <div style={{ fontSize: 14, color: T.slate, marginBottom: 24 }}>El pedido pasará al histórico. Esta acción se puede revertir desde Admin.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowConfirmCumplido(false)}>Cancelar</Btn>
              <Btn variant="success" onClick={marcarCumplido}>✓ Confirmar Cumplido</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>← Volver</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.slate, fontWeight: 700, textTransform: "uppercase" }}>Pedido N° {pedido.numero}</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.ink }}>{pedido.cliente}</h2>
          {pedido.vendedor && <div style={{ fontSize: 12, color: T.slate }}>{pedido.vendedor} · {pedido.ciudad}</div>}
        </div>
        <div style={{ padding: "6px 14px", background: sem.bg, color: sem.color, borderRadius: 20, fontWeight: 800, fontSize: 13 }}>📅 {pedido.fechaDespacho} · {sem.label}</div>
        {pedido.estado === "terminado" && <span style={{ padding: "6px 14px", background: T.jadeBg, color: T.jade, borderRadius: 20, fontWeight: 800, fontSize: 13 }}>✅ TERMINADO</span>}
        <Btn variant="ghost" small onClick={() => setShowEdit(true)}>✏ Editar</Btn>
        {pedido.estado === "activo" && <Btn variant="amber" onClick={marcarTerminado}>🏁 Marcar Terminado</Btn>}
        {pedido.estado === "terminado" && <Btn variant="secondary" small onClick={deshacerTerminado}>↩ Deshacer Terminado</Btn>}
        {pedido.estado === "cumplido" && <Btn variant="secondary" small onClick={() => onUpdatePedido({ ...pedido, estado: "activo", fechaCumplido: null })}>↩ Reactivar</Btn>}
        {pedido.estado !== "cumplido" && <Btn variant="success" onClick={() => setShowConfirmCumplido(true)}>✓ Cumplido</Btn>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { icon: "📦", label: "Total Pedido", value: fmtNum(totalPedido), color: T.denim, bg: T.denimBg },
          { icon: "✂", label: "Total Cortado", value: fmtNum(totalCortado), color: T.jade, bg: T.jadeBg },
          { icon: "⏳", label: "Pendiente", value: fmtNum(totalPedido - totalCortado), color: T.amber, bg: T.amberBg },
          { icon: "📊", label: "Avance Corte", value: `${pct}%`, color: pct === 100 ? T.jade : T.denim, bg: pct === 100 ? T.jadeBg : T.denimBg },
        ].map((k) => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: "16px 18px", border: `1px solid ${k.color}22` }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: T.slate, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 10, borderRadius: 5, background: T.border, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? T.jade : T.denim, transition: "width 0.4s" }} />
      </div>
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 14 }}>Referencias y Excedentes</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.ink }}>
                <th style={{ padding: "8px 10px", color: T.seam, textAlign: "left", fontWeight: 700, fontSize: 11 }}>Ref</th>
                <th style={{ padding: "8px 10px", color: T.seam, textAlign: "left", fontWeight: 700, fontSize: 11 }}>Descripción</th>
                {TALLA_LABELS.map((t) => <th key={t} style={{ padding: "8px 4px", color: T.seam, textAlign: "center", fontWeight: 700, fontSize: 10 }}>{t.split(" ")[0]}</th>)}
                <th style={{ padding: "8px 10px", color: T.seam, textAlign: "center", fontWeight: 700, fontSize: 11 }}>Total</th>
                <th style={{ padding: "8px 10px", color: T.seam, textAlign: "center", fontWeight: 700, fontSize: 11 }}>Cortado</th>
                <th style={{ padding: "8px 10px", color: T.seam, textAlign: "center", fontWeight: 700, fontSize: 11 }}>Excedente</th>
              </tr>
            </thead>
            <tbody>
              {pedido.referencias.map((ref, i) => {
                const exc = excedente(ref);
                const totalExc = Object.values(exc).reduce((a, b) => a + b, 0);
                const cortadoRef = ref.total - totalExc;
                return (
                  <tr key={ref.id} style={{ background: i % 2 === 0 ? T.canvas : T.white, borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: T.ink }}>{ref.ref}</td>
                    <td style={{ padding: "8px 10px", color: T.slate }}>{ref.descripcion}</td>
                    {TALLA_LABELS.map((t) => <td key={t} style={{ padding: "8px 4px", textAlign: "center", color: ref.tallas?.[t] > 0 ? T.ink : T.border }}>{ref.tallas?.[t] || "—"}</td>)}
                    <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800, color: T.denim }}>{ref.total}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: T.jade }}>{cortadoRef}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: totalExc > 0 ? T.amber : T.jade }}>{totalExc > 0 ? totalExc : "✓"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>Seguimiento del Pedido</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: T.slate }}>{etapasHechas}/{PEDIDO_STAGES.length} etapas</span>
            <span style={{ padding: "4px 12px", background: etapasPct === 100 ? T.jadeBg : T.denimBg, color: etapasPct === 100 ? T.jade : T.denim, borderRadius: 20, fontWeight: 800, fontSize: 13 }}>{etapasPct}%</span>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: T.border, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ height: "100%", width: `${etapasPct}%`, background: etapasPct === 100 ? T.jade : T.denim, transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
          {PEDIDO_STAGES.map((stage, i) => {
            const done = !!pedido.seguimiento?.[stage];
            return (
              <label key={stage} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: done ? T.jadeBg : T.canvas, border: `1px solid ${done ? T.jade + "44" : T.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={done} onChange={() => toggleEtapa(stage)} style={{ width: 16, height: 16 }} />
                <span style={{ color: done ? T.jade : T.ink, fontWeight: done ? 700 : 500 }}>{i + 1}. {stage}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EditPedidoModal({ pedido, onSave, onClose }) {
  const TALLA_LABELS = ["U-2/4-2 PLUS", "4 XS", "6-6/8 S-S/M", "8 M-M/L", "10-10/12 L-L/XL", "12 XL-1XL", "14-14/16 2XL", "16 3XL", "18 4XL", "20"];
  const [form, setForm] = useState({
    numero: pedido.numero || "", cliente: pedido.cliente || "", fechaPedido: pedido.fechaPedido || "", fechaDespacho: pedido.fechaDespacho || "", vendedor: pedido.vendedor || "", ciudad: pedido.ciudad || "",
    referencias: pedido.referencias.map((r) => ({ ...r, tallas: { ...r.tallas } })),
  });
  function updateRef(idx, field, val) {
    setForm((f) => {
      const refs = [...f.referencias];
      if (field.startsWith("t_")) {
        const t = field.slice(2);
        refs[idx] = { ...refs[idx], tallas: { ...refs[idx].tallas, [t]: parseInt(val) || 0 } };
        refs[idx].total = Object.values(refs[idx].tallas).reduce((a, b) => a + b, 0);
      } else {
        refs[idx] = { ...refs[idx], [field]: val };
      }
      return { ...f, referencias: refs };
    });
  }
  function addRef() {
    setForm((f) => ({ ...f, referencias: [...f.referencias, { id: uid(), ref: "", descripcion: "", tallas: Object.fromEntries(TALLA_LABELS.map((t) => [t, 0])), total: 0 }] }));
  }
  function removeRef(idx) { setForm((f) => ({ ...f, referencias: f.referencias.filter((_, i) => i !== idx) })); }
  function save() { onSave({ ...pedido, ...form }); onClose(); }
  return (
    <Modal title={`Editar Pedido #${pedido.numero}`} onClose={onClose} width={740}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Field label="Pedido N°"><FInput value={form.numero} onChange={(v) => setForm((f) => ({ ...f, numero: v }))} placeholder="1204" /></Field>
        <Field label="Cliente"><FInput value={form.cliente} onChange={(v) => setForm((f) => ({ ...f, cliente: v }))} placeholder="Nombre del cliente" /></Field>
        <Field label="Fecha Pedido"><FInput type="date" value={form.fechaPedido} onChange={(v) => setForm((f) => ({ ...f, fechaPedido: v }))} /></Field>
        <Field label="Fecha Despacho"><FInput type="date" value={form.fechaDespacho} onChange={(v) => setForm((f) => ({ ...f, fechaDespacho: v }))} /></Field>
        <Field label="Vendedor"><FInput value={form.vendedor} onChange={(v) => setForm((f) => ({ ...f, vendedor: v }))} placeholder="Vendedor" /></Field>
        <Field label="Ciudad"><FInput value={form.ciudad} onChange={(v) => setForm((f) => ({ ...f, ciudad: v }))} placeholder="Ciudad" /></Field>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, margin: "4px 0 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Referencias ({form.referencias.length})</span>
        <button onClick={addRef} style={{ padding: "4px 10px", background: T.denimBg, border: `1px solid ${T.denim}`, borderRadius: 6, color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Agregar</button>
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {form.referencias.map((ref, idx) => (
          <div key={ref.id || idx} style={{ background: T.canvas, borderRadius: 10, padding: 14, marginBottom: 10, border: `1px solid ${T.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8, marginBottom: 10, alignItems: "flex-end" }}>
              <Field label="Ref"><FInput value={ref.ref} onChange={(v) => updateRef(idx, "ref", v)} placeholder="986675" /></Field>
              <Field label="Descripción"><FInput value={ref.descripcion} onChange={(v) => updateRef(idx, "descripcion", v)} placeholder="CAMISETA SISA" /></Field>
              <button onClick={() => removeRef(idx)} style={{ padding: "6px 10px", background: T.coralBg, border: "none", borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer", marginBottom: 2 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
              {TALLA_LABELS.map((t) => (
                <div key={t}>
                  <div style={{ fontSize: 9, color: T.slate, fontWeight: 700, marginBottom: 2 }}>{t}</div>
                  <input type="number" value={ref.tallas[t] || 0} onChange={(e) => updateRef(idx, `t_${t}`, e.target.value)} style={{ width: "100%", padding: "5px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, textAlign: "center", background: ref.tallas[t] > 0 ? T.denimBg : T.white }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, textAlign: "right", fontWeight: 800, color: T.denim, fontSize: 13 }}>Total: {ref.total}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="success" onClick={save}>Guardar cambios</Btn>
      </div>
    </Modal>
  );
}

function ClientesPedidosView({ clientes: clientesProp, pedidos }) {
  const [buscar, setBuscar] = useState("");
  const clientes = clientesProp || [];
  const filtrados = buscar ? clientes.filter((c) => c.nombre?.toLowerCase().includes(buscar.toLowerCase()) || c.empresa?.toLowerCase().includes(buscar.toLowerCase()) || c.contacto?.toLowerCase().includes(buscar.toLowerCase())) : clientes;
  function pedidosDelCliente(nombre) { return pedidos.filter((p) => p.cliente === nombre); }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Clientes</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>{clientes.length} cliente{clientes.length !== 1 ? "s" : ""} registrado{clientes.length !== 1 ? "s" : ""}</p></div>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar cliente..." style={{ padding: "9px 14px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, width: 220, outline: "none", fontFamily: "inherit" }} />
      </div>
      {!clientes.length && (
        <div style={{ textAlign: "center", padding: 48, color: T.slate }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Sin clientes registrados</div>
          <div style={{ fontSize: 13 }}>Ve a <strong>Administrador General → Clientes</strong> en el menú para agregar clientes.</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {filtrados.map((c, i) => {
          const peds = pedidosDelCliente(c.nombre);
          const activos = peds.filter((p) => p.estado === "activo" || p.estado === "terminado").length;
          const historico = peds.filter((p) => p.estado === "cumplido").length;
          const totalPrendas = peds.filter((p) => p.estado !== "cumplido").reduce((s, p) => s + p.referencias.reduce((a, r) => a + r.total, 0), 0);
          return (
            <div key={c.id || i} style={{ background: T.white, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(26,26,46,0.09)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg,${T.denim},${T.violet})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: T.white, fontSize: 16, flexShrink: 0 }}>
                  {(c.nombre || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                  {c.empresa && <div style={{ fontSize: 12, color: T.denim, fontWeight: 600 }}>{c.empresa}</div>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {c.contacto && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.slate }}><span>👤</span><span>{c.contacto}</span></div>}
                {c.email && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.slate }}><span>✉</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</span></div>}
              </div>
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "Activos", value: activos, color: T.denim, bg: T.denimBg },
                  { label: "Prendas", value: totalPrendas.toLocaleString("es-CO"), color: T.violet, bg: T.violetBg },
                  { label: "Cumplidos", value: historico, color: T.jade, bg: T.jadeBg },
                ].map((k) => (
                  <div key={k.label} style={{ background: k.bg, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 10, color: T.slate, fontWeight: 600, marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminPedidosView({ pedidoConfig, onSave, config, onSaveConfig }) {
  const [tab, setTab] = useState("clientes");
  const [newCliente, setNewCliente] = useState({ nombre: "", contacto: "", email: "", telefono: "" });
  const [newVendedor, setNewVendedor] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  // Los clientes (a diferencia de los vendedores) ya no son propios de
  // Pedidos: se gestionan sobre la misma lista que Administrador General →
  // Clientes (config.clientes), para que ambas pantallas siempre muestren
  // los mismos clientes.
  const clientes = config.clientes || [];
  const vendedores = pedidoConfig.vendedores || [];
  function addCliente() {
    if (!newCliente.nombre.trim()) return;
    const updated = editIdx !== null ? clientes.map((c, i) => (i === editIdx ? { ...newCliente } : c)) : [...clientes, { ...newCliente, id: uid() }];
    onSaveConfig({ clientes: updated });
    setNewCliente({ nombre: "", contacto: "", email: "", telefono: "" });
    setEditIdx(null);
  }
  function editCliente(i) { setNewCliente({ ...clientes[i] }); setEditIdx(i); }
  function delCliente(i) { onSaveConfig({ clientes: clientes.filter((_, idx) => idx !== i) }); }
  function addVendedor() {
    if (!newVendedor.trim()) return;
    onSave({ vendedores: [...vendedores, { id: uid(), nombre: newVendedor.trim() }] });
    setNewVendedor("");
  }
  function delVendedor(id) { onSave({ vendedores: vendedores.filter((v) => v.id !== id) }); }
  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 800, color: T.ink }}>Admin Pedidos</h2>
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: T.canvas, borderRadius: 12, padding: 4 }}>
        {[["clientes", "🏢 Clientes"], ["vendedores", "👤 Vendedores"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "8px 20px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: tab === id ? 700 : 500, fontSize: 13, background: tab === id ? T.white : "transparent", color: tab === id ? T.ink : T.slate, boxShadow: tab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{label}</button>
        ))}
      </div>
      {tab === "clientes" && (
        <div>
          <div style={{ background: T.canvas, borderRadius: 12, padding: 20, border: `1.5px solid ${T.denim}`, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 14 }}>{editIdx !== null ? "Editar Cliente" : "Nuevo Cliente"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Nombre / Empresa"><FInput value={newCliente.nombre} onChange={(v) => setNewCliente((c) => ({ ...c, nombre: v }))} placeholder="Ej: INVERSIONES CONBOT SAS" /></Field>
              <Field label="Teléfono"><FInput value={newCliente.telefono} onChange={(v) => setNewCliente((c) => ({ ...c, telefono: v }))} placeholder="+57 300 000 0000" /></Field>
              <Field label="Contacto"><FInput value={newCliente.contacto} onChange={(v) => setNewCliente((c) => ({ ...c, contacto: v }))} placeholder="Nombre contacto" /></Field>
              <Field label="Email"><FInput value={newCliente.email} onChange={(v) => setNewCliente((c) => ({ ...c, email: v }))} placeholder="correo@ejemplo.com" /></Field>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              {editIdx !== null && <Btn variant="secondary" onClick={() => { setNewCliente({ nombre: "", contacto: "", email: "", telefono: "" }); setEditIdx(null); }}>Cancelar</Btn>}
              <Btn onClick={addCliente}>{editIdx !== null ? "Guardar cambios" : "+ Agregar Cliente"}</Btn>
            </div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.slate, marginBottom: 10 }}>{clientes.length} cliente{clientes.length !== 1 ? "s" : ""}</div>
          {!clientes.length && <div style={{ textAlign: "center", padding: 32, color: T.slate }}>Sin clientes registrados.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {clientes.map((c, i) => (
              <div key={c.id || i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: T.white, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.denimBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: T.denim, fontSize: 14, flexShrink: 0 }}>
                  {(c.nombre || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: T.ink }}>{c.nombre}</div>
                  <div style={{ fontSize: 12, color: T.slate }}>{[c.telefono, c.contacto, c.email].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => editCliente(i)} style={{ padding: "5px 10px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 6, color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏</button>
                  <button onClick={() => delCliente(i)} style={{ padding: "5px 10px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "vendedores" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={newVendedor} onChange={(e) => setNewVendedor(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVendedor()} placeholder="Nombre del vendedor..." style={{ flex: 1, padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
            <Btn onClick={addVendedor}>+ Agregar</Btn>
          </div>
          {!vendedores.length && <div style={{ textAlign: "center", padding: 32, color: T.slate }}>Sin vendedores registrados.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {vendedores.map((v) => (
              <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: T.white, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <span style={{ fontWeight: 700, color: T.ink }}>👤 {v.nombre}</span>
                <button onClick={() => delVendedor(v.id)} style={{ padding: "5px 10px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PedidosView({ pedidos, onSelectPedido, onNewPedido, onUpdatePedido, pedidoConfig, onSavePedidoConfig, isAdmin }) {
  const [filtro, setFiltro] = useState("activos");
  const [editPedido, setEditPedido] = useState(null);
  const activos = pedidos.filter((p) => p.estado === "activo" || p.estado === "terminado");
  const historico = pedidos.filter((p) => p.estado === "cumplido");
  const lista = filtro === "activos" ? activos : historico;
  const hoy = new Date();
  const vencidos = activos.filter((p) => p.fechaDespacho && new Date(p.fechaDespacho) < hoy);
  const proximos = activos.filter((p) => { if (!p.fechaDespacho) return false; const d = Math.ceil((new Date(p.fechaDespacho) - hoy) / 86400000); return d >= 0 && d <= 7; });
  const vigentes = activos.filter((p) => { if (!p.fechaDespacho) return true; return Math.ceil((new Date(p.fechaDespacho) - hoy) / 86400000) > 7; });
  const terminados = activos.filter((p) => p.estado === "terminado");
  return (
    <div>
      {editPedido && <EditPedidoModal pedido={editPedido} onSave={(p) => { onUpdatePedido(p); setEditPedido(null); }} onClose={() => setEditPedido(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Pedidos</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Seguimiento y control de pedidos Busint</p></div>
        <Btn onClick={onNewPedido}>+ Cargar Pedido</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Activos", value: activos.length, icon: "📦", color: T.denim, bg: T.denimBg },
          { label: "Vigentes", value: vigentes.length, icon: "✅", color: T.jade, bg: T.jadeBg },
          { label: "Próx. a vencer", value: proximos.length, icon: "⚠️", color: T.amber, bg: T.amberBg },
          { label: "Vencidos", value: vencidos.length, icon: "🚨", color: T.coral, bg: T.coralBg },
          { label: "Terminados", value: terminados.length, icon: "🏁", color: T.violet, bg: T.violetBg },
        ].map((k) => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${k.color}22` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: T.slate, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>
      {(vencidos.length > 0 || proximos.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          {vencidos.length > 0 && (
            <div style={{ padding: "12px 16px", background: T.coralBg, borderRadius: 10, border: `1px solid ${T.coral}44`, marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: T.coral, marginBottom: 6 }}>🚨 {vencidos.length} pedido{vencidos.length !== 1 ? "s" : ""} vencido{vencidos.length !== 1 ? "s" : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {vencidos.map((p) => {
                  const dias = Math.abs(Math.ceil((new Date(p.fechaDespacho) - hoy) / 86400000));
                  return <span key={p.id} onClick={() => onSelectPedido(p.id)} style={{ padding: "3px 10px", background: T.white, borderRadius: 20, fontSize: 11, fontWeight: 700, color: T.coral, cursor: "pointer", border: `1px solid ${T.coral}44` }}>#{p.numero} {p.cliente} · {dias}d vencido</span>;
                })}
              </div>
            </div>
          )}
          {proximos.length > 0 && (
            <div style={{ padding: "12px 16px", background: T.amberBg, borderRadius: 10, border: `1px solid ${T.amber}44` }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: T.amber, marginBottom: 6 }}>⚠️ {proximos.length} pedido{proximos.length !== 1 ? "s" : ""} vence{proximos.length === 1 ? "" : "n"} en los próximos 7 días</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {proximos.map((p) => {
                  const dias = Math.ceil((new Date(p.fechaDespacho) - hoy) / 86400000);
                  return <span key={p.id} onClick={() => onSelectPedido(p.id)} style={{ padding: "3px 10px", background: T.white, borderRadius: 20, fontSize: 11, fontWeight: 700, color: T.amber, cursor: "pointer", border: `1px solid ${T.amber}44` }}>#{p.numero} {p.cliente} · {dias}d</span>;
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["activos", `Activos (${activos.length})`], ["historico", `Histórico (${historico.length})`]].map(([v, label]) => (
          <button key={v} onClick={() => setFiltro(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${filtro === v ? T.ink : T.border}`, background: filtro === v ? T.ink : T.white, color: filtro === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      {filtro === "activos" && lista.length > 0 && (
        <div style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.ink }}>
                {["N° Pedido", "Cliente", "Pedido", "Cortado", "Avance", "Despacho", "Estado", ""].map((h, i) => (
                  <th key={h + i} style={{ padding: "10px 14px", color: T.seam, textAlign: i === 0 || i === 1 ? "left" : "center", fontWeight: 700, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.sort((a, b) => (a.fechaDespacho || "").localeCompare(b.fechaDespacho || "")).map((p, i) => {
                const totalP = p.referencias.reduce((s, r) => s + r.total, 0);
                const totalC = (p.cortesRealizados || []).reduce((s, c) => s + (c.totalUnidades || 0), 0);
                const pct = totalP > 0 ? Math.round((totalC / totalP) * 100) : 0;
                const sem = semaforo2(p.fechaDespacho);
                const isTerminado = p.estado === "terminado";
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? T.canvas : T.white, borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.denimBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? T.canvas : T.white)}
                  >
                    <td onClick={() => onSelectPedido(p.id)} style={{ padding: "12px 14px", fontWeight: 800, color: T.denim }}>#{p.numero}</td>
                    <td onClick={() => onSelectPedido(p.id)} style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: 700, color: T.ink }}>{p.cliente}</div>
                      {p.vendedor && <div style={{ fontSize: 11, color: T.slate }}>{p.vendedor}</div>}
                    </td>
                    <td onClick={() => onSelectPedido(p.id)} style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700, color: T.ink }}>{fmtNum(totalP)}</td>
                    <td onClick={() => onSelectPedido(p.id)} style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700, color: T.jade }}>{fmtNum(totalC)}</td>
                    <td onClick={() => onSelectPedido(p.id)} style={{ padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.border, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? T.jade : T.denim }} /></div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? T.jade : T.denim, minWidth: 30 }}>{pct}%</span>
                      </div>
                    </td>
                    <td onClick={() => onSelectPedido(p.id)} style={{ padding: "12px 14px", textAlign: "center" }}><span style={{ padding: "3px 10px", background: sem.bg, color: sem.color, borderRadius: 20, fontSize: 11, fontWeight: 800 }}>{p.fechaDespacho || "—"}</span></td>
                    <td onClick={() => onSelectPedido(p.id)} style={{ padding: "12px 14px", textAlign: "center" }}>
                      {isTerminado ? <span style={{ padding: "3px 10px", background: T.jadeBg, color: T.jade, borderRadius: 20, fontSize: 11, fontWeight: 800 }}>✅ Terminado</span> : <span style={{ padding: "3px 10px", background: T.denimBg, color: T.denim, borderRadius: 20, fontSize: 11, fontWeight: 800 }}>⚡ Activo</span>}
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "center" }}>
                      <button onClick={(e) => { e.stopPropagation(); setEditPedido(p); }} style={{ background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: T.slate, cursor: "pointer" }}>✏</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtro === "historico" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lista.sort((a, b) => (b.fechaCumplido || "").localeCompare(a.fechaCumplido || "")).map((p) => {
            const totalP = p.referencias.reduce((s, r) => s + r.total, 0);
            const totalC = (p.cortesRealizados || []).reduce((s, c) => s + (c.totalUnidades || 0), 0);
            return (
              <div key={p.id} onClick={() => onSelectPedido(p.id)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: T.white, borderRadius: 12, border: `1px solid ${T.border}`, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.canvas)}
                onMouseLeave={(e) => (e.currentTarget.style.background = T.white)}
              >
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.jadeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>✅</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: T.ink }}>Pedido #{p.numero} — {p.cliente}</div>
                  <div style={{ fontSize: 12, color: T.slate }}>Cumplido: {p.fechaCumplido || "—"} · {fmtNum(totalP)} uds pedidas · {fmtNum(totalC)} cortadas</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={(e) => { e.stopPropagation(); onUpdatePedido({ ...p, estado: "activo", fechaCumplido: null }); }} style={{ background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: T.amber, cursor: "pointer" }}>↩ Reactivar</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditPedido(p); }} style={{ background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: T.slate, cursor: "pointer" }}>✏</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!lista.length && <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>{filtro === "activos" ? "No hay pedidos activos. Carga un pedido de Busint." : "Sin pedidos en el histórico."}</div>}
    </div>
  );
}

function AppInner() {
  const [appState, setAppState] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [config, setConfig] = useState(INIT_CONFIG);
  const [protos, setProtos] = useState([]);
  const [capsulas, setCapsulas] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cronogramaMuestras, setCronogramaMuestras] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidoConfig, setPedidoConfig] = useState({ clientes: [], vendedores: [] });
  const [bitacoraEnvios, setBitacoraEnvios] = useState([]);
  const [view, setView] = useState("dashboard");
  const [selProtoId, setSelProtoId] = useState(null);
  const [selCapId, setSelCapId] = useState(null);
  const [selRefId, setSelRefId] = useState(null);
  const [selPedidoId, setSelPedidoId] = useState(null);
  const [modal, setModal] = useState(null);
  const [showCambiarClave, setShowCambiarClave] = useState(false);
  const [promoteProto, setPromoteProto] = useState(null);
  const [newRefCap, setNewRefCap] = useState(null);
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const unsubs = [];
    async function bootstrap() {
      try {
        let dbUsers = await fsGet("users");
        if (!dbUsers.length) { await fsBatch("users", INIT_USERS); dbUsers = INIT_USERS; setUsers(dbUsers); }
        const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
          const updatedUsers = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          setUsers(updatedUsers);
          setCurrentUser((cu) => {
            if (!cu) return cu;
            const fresh = updatedUsers.find((u) => u.id === cu.id);
            return fresh ? { ...cu, ...fresh } : cu;
          });
        });
        unsubs.push(unsubUsers);
        // "config" se sincroniza en vivo (igual que users/protos/capsulas/pedidos)
        // en vez de leerse una sola vez con fsGet al abrir la app. Antes, una
        // pestaña vieja con una copia local desactualizada de config podía, al
        // guardar cualquier ajuste (roles, etapas, categorías...), reescribir
        // TODO el documento con esa copia vieja — incluyendo un `clientes`
        // vacío si esa pestaña se había cargado antes de que se agregaran
        // clientes en otra sesión. Con onSnapshot, config siempre está al día
        // antes de guardar, así que ese guardado ya no puede pisar cambios
        // más recientes de otra sesión.
        // La comprobación de "¿existe el documento?" se hace UNA sola vez con
        // fsGet (igual que "users" arriba), ANTES de abrir el listener en
        // vivo — nunca dentro de él. Antes, esa comprobación vivía dentro del
        // propio onSnapshot y sembraba INIT_CONFIG (clientes: [], etc.) cada
        // vez que una lectura llegaba vacía, incluida una lectura transitoria
        // de caché offline o una reconexión — lo que podía borrar "clientes"
        // aunque el documento real en el servidor sí tuviera datos. Con el
        // chequeo fuera del listener, este solo siembra una vez, al arrancar,
        // y de ahí en adelante el listener SOLO lee, nunca vuelve a escribir.
        let dbConfig = await fsGet("config");
        if (!dbConfig.length) { await fsSave("config", "main", INIT_CONFIG); }
        const unsubConfig = onSnapshot(collection(db, "config"), (snap) => {
          if (!snap.docs.length) { setConfig(INIT_CONFIG); return; }
          const mainDoc = snap.docs.find((d) => d.id === "main") || snap.docs[0];
          setConfig({ ...INIT_CONFIG, ...mainDoc.data() });
        });
        unsubs.push(unsubConfig);
        const unsubProtos = onSnapshot(collection(db, "prototipos"), (snap) => { setProtos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubs.push(unsubProtos);
        const unsubCapsulas = onSnapshot(collection(db, "capsulas"), (snap) => { setCapsulas(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubs.push(unsubCapsulas);
        const unsubHistorial = onSnapshot(collection(db, "historial_diseno"), (snap) => { setHistorial(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubs.push(unsubHistorial);
        const unsubCronogramaMuestras = onSnapshot(collection(db, "cronograma_muestras"), (snap) => { setCronogramaMuestras(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubs.push(unsubCronogramaMuestras);
        const unsubPedidos = onSnapshot(collection(db, "pedidos"), (snap) => { setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubs.push(unsubPedidos);
        // Mismo motivo que "config": pedidoConfig (clientes/vendedores de
        // Pedidos) se sincroniza en vivo en vez de leerse una sola vez con
        // fsGet, para que una pestaña vieja no pueda pisar con una copia
        // desactualizada los clientes/vendedores agregados desde otra sesión.
        // Igual que "config" arriba: el chequeo de "¿existe?" se hace una
        // sola vez con fsGet antes de abrir el listener, que de ahí en
        // adelante solo lee y nunca vuelve a sembrar/escribir.
        let dbPedidoConfig = await fsGet("pedidos_config");
        if (!dbPedidoConfig.length) { await fsSave("pedidos_config", "main", { clientes: [], vendedores: [] }); }
        const unsubPedidoConfig = onSnapshot(collection(db, "pedidos_config"), (snap) => {
          if (!snap.docs.length) { return; }
          const mainDoc = snap.docs.find((d) => d.id === "main") || snap.docs[0];
          setPedidoConfig((c) => ({ ...c, ...mainDoc.data() }));
        });
        unsubs.push(unsubPedidoConfig);
        const unsubBitacora = onSnapshot(collection(db, "bitacora_envios"), (snap) => { setBitacoraEnvios(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubs.push(unsubBitacora);
        setAppState("login");
      } catch (e) { console.error("Firebase error:", e); setAppState("login"); }
    }
    bootstrap();
    return () => unsubs.forEach((fn) => fn());
  }, []);
  function notify(n) { setToasts((t) => [...t, n]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 5000); }
  async function saveUsers(newUsers) {
    // Antes esto solo escribía los usuarios de newUsers con fsBatch, sin
    // borrar en Firestore los que ya no estaban en la lista — por eso un
    // usuario "eliminado" seguía existiendo en la base de datos y volvía a
    // aparecer en cuanto llegaba la siguiente actualización de onSnapshot.
    const removedIds = users.filter((u) => !newUsers.some((n) => n.id === u.id)).map((u) => u.id);
    setUsers(newUsers);
    await Promise.all(removedIds.map((id) => fsDelete("users", id)));
    if (newUsers.length) await fsBatch("users", newUsers);
  }
  // Recibe solo los campos que cambiaron (p.ej. { roles: [...] }), nunca el
  // config completo — así una escritura de roles/etapas/categorías nunca
  // puede pisar "clientes" (u otro campo) con una copia local vieja. Ver
  // fsUpdate.
  async function saveConfig(partial) {
    setConfig((c) => ({ ...c, ...partial }));
    await fsUpdate("config", "main", partial);
  }
  // Igual que saveConfig: recibe solo los campos que cambiaron (p.ej.
  // { vendedores: [...] }), nunca el objeto completo, para no arriesgar
  // pisar otros campos con una copia local vieja.
  async function savePedidoConfig(partial) {
    setPedidoConfig((c) => ({ ...c, ...partial }));
    await fsUpdate("pedidos_config", "main", partial);
  }
  async function addProto(p) { const updated = [...protos, p]; setProtos(updated); await fsSave("prototipos", p.id, p); notify({ id: uid(), icon: "🧪", title: "Prototipo creado", msg: p.name }); }
  async function updateProto(id, patch) { const updated = protos.map((x) => (x.id === id ? { ...x, ...patch } : x)); setProtos(updated); const item = updated.find((x) => x.id === id); await fsSave("prototipos", id, item); if (patch.status === "enviado") syncCronogramaEnviado(id); }
  async function addCapsula(c) { const updated = [...capsulas, c]; setCapsulas(updated); await fsSave("capsulas", c.id, c); notify({ id: uid(), icon: "🗂", title: "Cápsula creada", msg: c.name }); }
  async function updateCapsulasAndSave(newCapsulas) { setCapsulas(newCapsulas); await fsBatch("capsulas", newCapsulas); }
  async function addRef(capId, ref) { const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, referencias: [...c.referencias, ref] })); await updateCapsulasAndSave(updated); }
  async function updateRef(capId, refId, patch) {
    const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, referencias: c.referencias.map((r) => (r.id !== refId ? r : { ...r, ...patch })) }));
    await updateCapsulasAndSave(updated);
    const cap = updated.find((c) => c.id === capId);
    await fsSave("capsulas", capId, cap);
    if (patch.status === "enviado") syncCronogramaEnviado(refId);
  }
  // --- Bitácora de Envíos ---
  // Un registro de bitácora agrupa VARIAS referencias/prototipos enviados
  // juntos en un solo envío al cliente (p.ej. una colección completa), con
  // los datos comerciales que pide el ANEXO que manda el cliente: cantidades
  // por país, precio, observaciones, carta de colores. Es adicional al
  // "Registrar Envío" de una sola referencia (que sigue existiendo tal cual,
  // solo para datos de transporte) — este flujo además arma la bitácora.
  async function addBitacoraEnvio(envio) {
    const updated = [...bitacoraEnvios, envio];
    setBitacoraEnvios(updated);
    await fsSave("bitacora_envios", envio.id, envio);
  }
  async function updateBitacoraEnvio(id, patch) {
    const updated = bitacoraEnvios.map((e) => (e.id === id ? { ...e, ...patch } : e));
    setBitacoraEnvios(updated);
    const item = updated.find((e) => e.id === id);
    await fsSave("bitacora_envios", id, item);
  }
  // items: arreglo de prototipos/referencias seleccionados (cada uno ya trae
  // kind:"proto"|"ref" y, si es "ref", capsulaId — ver NuevoEnvioModal). Crea
  // UN registro de bitácora con todos, y marca cada ítem como "enviado" con
  // los mismos campos de transporte que usa EnviadoModal (para que
  // isOverdue/Cronograma de Muestras y todo lo demás que ya lee
  // envioEmpresa/envioFecha/envioGuia siga funcionando igual).
  async function crearEnvioBitacora(header, items) {
    const envio = {
      id: uid(),
      coleccion: header.coleccion || "",
      cliente: header.cliente || "",
      numPedido: header.numPedido || "",
      fechaEnviado: header.fechaEnviado,
      fechaRecibidoCliente: "",
      empresaTransporte: header.empresaTransporte || "",
      guia: header.guia || "",
      cartaColores: header.cartaColores || null,
      items: items.map((it) => ({
        itemId: it.id,
        kind: it.kind,
        capsulaId: it.capsulaId || null,
        referencia: it.reference || "",
        nombre: it.name || "",
        foto: it.image || null,
        estado: STATUS[it.status]?.label || it.status || "",
        categoria: it.categoria || "",
        silueta: it.silueta || "",
        rango: it.rango || it.tallas?.[0] || "",
        tela: it.tipoTela || "",
        consumo: it._consumo || "",
        tipo: it._tipo || "",
        colombiaCurva: it._colombiaCurva || "",
        colombiaCantidad: it._colombiaCantidad || "",
        venezuelaCurva: it._venezuelaCurva || "",
        venezuelaCantidad: it._venezuelaCantidad || "",
        precio: it._precio || "",
        observacionesCliente: it._observacionesCliente || "",
      })),
      createdAt: nowISO(),
      createdBy: currentUser?.name || "",
    };
    await addBitacoraEnvio(envio);
    const obsTexto = `Enviado — Colección: ${envio.coleccion || "N/A"}${envio.numPedido ? ` · N° Pedido: ${envio.numPedido}` : ""}${envio.empresaTransporte ? ` · Empresa: ${envio.empresaTransporte}` : ""}${envio.guia ? ` · Guía: ${envio.guia}` : ""}`;
    for (const it of items) {
      const patchData = {
        status: "enviado",
        envioEmpresa: envio.empresaTransporte,
        envioFecha: envio.fechaEnviado,
        envioGuia: envio.guia,
        envioBitacoraId: envio.id,
        observations: [...(it.observations || []), { id: uid(), user: currentUser?.name, role, text: obsTexto, date: nowISO(), type: "update", done: false }],
      };
      if (it.kind === "proto") await updateProto(it.id, patchData);
      else await updateRef(it.capsulaId, it.id, patchData);
    }
    notify({ id: uid(), icon: "📦", title: "Envío registrado en Bitácora", msg: `${items.length} referencia${items.length !== 1 ? "s" : ""} — ${envio.coleccion || envio.cliente}` });
  }
  // --- Cronograma de Muestras ---
  async function addCronogramaMuestra(entry) {
    const withId = { ...entry, id: uid(), estado: entry.estado || "pendiente", createdAt: today() };
    setCronogramaMuestras((cs) => [...cs, withId]);
    await fsSave("cronograma_muestras", withId.id, withId);
    notify({ id: uid(), icon: "🧵", title: "Enviado a taller de muestra", msg: withId.nombre || withId.taller });
    return withId;
  }
  async function updateCronogramaMuestra(id, patch) {
    setCronogramaMuestras((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fsUpdate("cronograma_muestras", id, patch);
  }
  async function deleteCronogramaMuestra(id) {
    setCronogramaMuestras((cs) => cs.filter((c) => c.id !== id));
    await fsDelete("cronograma_muestras", id);
  }
  // Cuando un prototipo/referencia pasa a status "enviado", su entrada activa
  // en el Cronograma de Muestras (si tiene una y todavía no está en
  // "enviado") se actualiza sola — sin tener que ir a cambiarla a mano en
  // las dos pantallas.
  function syncCronogramaEnviado(itemId) {
    const activa = cronogramaMuestras.find((c) => c.itemId === itemId && c.estado !== "enviado");
    if (activa) updateCronogramaMuestra(activa.id, { estado: "enviado" });
  }
  // Cuando desde el Cronograma (no desde el detalle del prototipo/capsula)
  // marcan una entrada vinculada como "Modificar", la nota también se deja
  // como Observación en el prototipo/referencia — mismo formato que
  // DetailView.handleGuardarTaller, para que quede en un solo lugar.
  function addObservacionCronograma(entry, texto) {
    const obs = { id: uid(), user: currentUser?.name, role, text: `🧵 Modificar (Taller de Muestra): ${texto}`, date: nowISO(), type: "info", done: false };
    if (entry.kind === "proto") {
      const item = protos.find((p) => p.id === entry.itemId);
      if (item) updateProto(item.id, { observations: [...(item.observations || []), obs] });
    } else if (entry.kind === "ref") {
      const cap = capsulas.find((c) => c.id === entry.capsulaId);
      const ref = cap?.referencias.find((r) => r.id === entry.itemId);
      if (cap && ref) updateRef(cap.id, ref.id, { observations: [...(ref.observations || []), obs] });
    }
  }
  // --- Aprobación de Ilustración en Cápsulas ---
  // Antes de poder agregarle referencias a una cápsula (crear una nueva o
  // promover un prototipo), la Dirección Creativa aprueba primero la
  // ilustración/concepto de la cápsula completa. Cambia cap.ilustracionEstado
  // Y agrega la observación correspondiente en UN solo patch (evita perder
  // uno de los dos cambios por closures desactualizados si se llamaran por
  // separado).
  async function setIlustracionCapsula(capId, estado, nota) {
    const obsCap = {
      id: uid(), user: currentUser?.name, role,
      text: `${estado === "aprobado" ? "✓ Ilustración aprobada" : "🎨 Ilustración en revisión"}${nota ? `: ${nota}` : ""}`,
      date: nowISO(), type: estado === "en_revision" ? "revision_ilustracion_capsula" : "info", done: false,
    };
    const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, ilustracionEstado: estado, observacionesIlustracion: [...(c.observacionesIlustracion || []), obsCap] }));
    await updateCapsulasAndSave(updated);
    const cap = updated.find((c) => c.id === capId);
    await fsSave("capsulas", capId, cap);
  }
  // Comentario libre (no ligado a aprobar/devolver) en el hilo de
  // Observaciones de Ilustración de la cápsula.
  async function sendObservacionCapsula(capId, texto) {
    const obs = { id: uid(), user: currentUser?.name, role, text: texto, date: nowISO(), type: "info", done: false };
    const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, observacionesIlustracion: [...(c.observacionesIlustracion || []), obs] }));
    await updateCapsulasAndSave(updated);
    const cap = updated.find((c) => c.id === capId);
    await fsSave("capsulas", capId, cap);
  }
  async function markDoneObservacionCapsula(capId, obsId) {
    const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, observacionesIlustracion: (c.observacionesIlustracion || []).map((o) => (o.id === obsId ? { ...o, done: true } : o)) }));
    await updateCapsulasAndSave(updated);
    const cap = updated.find((c) => c.id === capId);
    await fsSave("capsulas", capId, cap);
  }
  async function logHistorial(entry) {
    const withId = { ...entry, id: uid() };
    setHistorial((h) => [...h, withId]);
    await fsSave("historial_diseno", withId.id, withId);
  }
  // Backfill de un solo uso: agrega al Historial los prototipos y referencias
  // de cápsula que YA estaban en Aprobado/Declinado antes de que existiera
  // esta función (el registro automático solo captura transiciones nuevas).
  // Reconstruye la fecha real desde las observaciones del ítem cuando existe.
  async function backfillHistorial() {
    const existentes = new Set(historial.map((h) => `${h.tipo}__${h.itemId}__${h.resultado}`));
    const nuevos = [];
    protos.forEach((p) => {
      if (p.status !== "aprobado") return;
      const key = `proto__${p.id}__aprobado`;
      if (existentes.has(key)) return;
      const fecha = buscarFechaEstado(p, "aprobado") || p.createdAt || nowISO();
      nuevos.push({
        id: uid(), tipo: "proto", itemId: p.id, capsulaId: null, capsulaName: null,
        nombre: p.name, referencia: p.reference, cliente: p.cliente || p.colores?.[0] || "(Sin cliente)",
        resultado: "aprobado", mes: String(fecha).slice(0, 7), fecha,
      });
    });
    capsulas.forEach((cap) => {
      (cap.referencias || []).forEach((r) => {
        if (r.status !== "aprobado" && r.status !== "declinado") return;
        const key = `capsula_ref__${r.id}__${r.status}`;
        if (existentes.has(key)) return;
        const fecha = buscarFechaEstado(r, r.status) || cap.createdAt || nowISO();
        nuevos.push({
          id: uid(), tipo: "capsula_ref", itemId: r.id, capsulaId: cap.id, capsulaName: cap.name,
          nombre: r.name, referencia: r.reference, cliente: r.cliente || r.colores?.[0] || "(Sin cliente)",
          resultado: r.status, mes: String(fecha).slice(0, 7), fecha,
        });
      });
    });
    if (!nuevos.length) { notify({ id: uid(), icon: "ℹ", title: "Historial", msg: "No había ítems pendientes por agregar." }); return; }
    setHistorial((h) => [...h, ...nuevos]);
    await Promise.all(nuevos.map((n) => fsSave("historial_diseno", n.id, n)));
    notify({ id: uid(), icon: "🕘", title: "Historial completado", msg: `${nuevos.length} ítem(s) agregado(s) al historial.` });
  }
  async function promoteToCapsula(capId, ref, protoId) {
    await addRef(capId, ref);
    await updateProto(protoId, { promotedTo: capId });
    notify({ id: uid(), icon: "⬆", title: "Promovido", msg: `${ref.name} añadida.` });
  }
  async function deleteProto(id) { setProtos((ps) => ps.filter((p) => p.id !== id)); await fsDelete("prototipos", id); }
  async function deleteCapsula(id) { setCapsulas((cs) => cs.filter((c) => c.id !== id)); await fsDelete("capsulas", id); }
  async function updateProtoName(id, patch) { await updateProto(id, patch); }
  async function updateCapsulaName(id, patch) { const updated = capsulas.map((c) => (c.id !== id ? c : { ...c, ...patch })); setCapsulas(updated); const cap = updated.find((c) => c.id === id); await fsSave("capsulas", id, cap); }
  async function addPedido(p) {
    const updated = [...pedidos, p];
    setPedidos(updated);
    await fsSave("pedidos", p.id, p);
    // Los clientes de Pedidos usan la misma lista que Administrador General →
    // Clientes (config.clientes) — un cliente nuevo cargado desde un pedido
    // se registra ahí, no en una lista aparte (pedidoConfig ya no guarda
    // clientes, solo vendedores).
    if (p.cliente && p.cliente.trim()) {
      const yaExiste = (config.clientes || []).some((c) => c.nombre?.toLowerCase() === p.cliente.toLowerCase());
      if (!yaExiste) {
        const nuevoCliente = { id: uid(), nombre: p.cliente.trim(), contacto: "", email: "", telefono: "" };
        await saveConfig({ clientes: [...(config.clientes || []), nuevoCliente] });
      }
    }
    notify({ id: uid(), icon: "📦", title: "Pedido creado", msg: p.cliente || p.numero });
  }
  async function updatePedido(updatedPedido) {
    const updated = pedidos.map((p) => (p.id === updatedPedido.id ? updatedPedido : p));
    setPedidos(updated);
    await fsSave("pedidos", updatedPedido.id, updatedPedido);
  }
  const selProto = protos.find((p) => p.id === selProtoId);
  const selCap = capsulas.find((c) => c.id === selCapId);
  const selRef = selCap?.referencias.find((r) => r.id === selRefId);
  const selPedido = pedidos.find((p) => p.id === selPedidoId);
  const totalOverdue = [...protos, ...capsulas.flatMap((c) => c.referencias)].filter((x) => isOverdue(x, config.stages)).length;
  const role = currentUser?.role || "Equipo Interno";
  const userRoleData = config.roles.find((r) => r.name === role);
  const perms = {
    editar: userRoleData?.perms?.includes("editar") ?? false,
    aprobar: userRoleData?.perms?.includes("aprobar") ?? false,
    declinar: userRoleData?.perms?.includes("declinar") ?? false,
    admin: userRoleData?.perms?.includes("admin") ?? false,
    corte: userRoleData?.perms?.includes("corte") ?? false,
    // Permiso dedicado para aprobar/devolver ilustración (Cápsulas y
    // Prototipos/Referencias en etapa Ilustración), pensado para un rol tipo
    // "Directora Creativa" sin darle el resto de permisos de "admin".
    ilustracion: userRoleData?.perms?.includes("ilustracion") ?? false,
  };
  // Visibilidad de módulos, decidida sección por sección con moduloVisible en
  // vez de reutilizar directamente perms.corte / perms.admin — así cada
  // sección (Prototipos, Cápsulas, Pedidos, Clientes, Corte, Estadísticas,
  // Contabilidad) se autoriza de forma independiente. Esto permite roles como
  // "Planeador": acceso a Pedidos y Corte, sin Prototipos ni Cápsulas.
  const canAccessProtos = moduloVisible(userRoleData, "protos", currentUser?.isAdmin);
  const canAccessCapsulas = moduloVisible(userRoleData, "capsulas", currentUser?.isAdmin);
  const canAccessPedidos = moduloVisible(userRoleData, "pedidos", currentUser?.isAdmin);
  const canAccessPedidosClientes = moduloVisible(userRoleData, "pedidos_clientes", currentUser?.isAdmin);
  const canAccessStats = moduloVisible(userRoleData, "stats", currentUser?.isAdmin);
  const canAccessHistorial = moduloVisible(userRoleData, "historial", currentUser?.isAdmin);
  const canAccessCronograma = moduloVisible(userRoleData, "cronograma_muestras", currentUser?.isAdmin);
  const canAccessBitacora = moduloVisible(userRoleData, "bitacora", currentUser?.isAdmin);
  const canAccessCorte = moduloVisible(userRoleData, "corte", currentUser?.isAdmin);
  const canAccessContabilidad = moduloVisible(userRoleData, "contabilidad", currentUser?.isAdmin);
  const canAccessPlaneacion = moduloVisible(userRoleData, "planeacion", currentUser?.isAdmin);
  // "admin_diseno" es un permiso aparte del admin general: da entrada al panel
  // de Administración de Diseño (etapas, categorías, roles, usuarios...) sin
  // necesidad de marcar al usuario como Admin general del sistema.
  const canAccessAdminDiseno = moduloVisible(userRoleData, "admin_diseno", currentUser?.isAdmin);
  const canAccessDiseno = canAccessProtos || canAccessCapsulas || canAccessPedidos || canAccessPedidosClientes || canAccessStats || canAccessHistorial || canAccessCronograma || canAccessBitacora || canAccessCorte || canAccessAdminDiseno || !!currentUser?.isAdmin;
  const [moduloActivo, setModuloActivo] = useState("diseno");
  const AREAS = [
    ...(canAccessDiseno
      ? [{
          id: "diseno", icon: "🎨", label: "Diseño",
          items: [
            ...(canAccessProtos ? [{ id: "protos", icon: "⬡", label: "Prototipos" }] : []),
            ...(canAccessCapsulas ? [{ id: "capsulas", icon: "⬢", label: "Cápsulas" }] : []),
            ...(canAccessStats ? [{ id: "stats", icon: "📊", label: "Estadísticas Diseño" }] : []),
            ...(canAccessPedidos ? [{ id: "pedidos", icon: "📦", label: "Pedidos" }] : []),
            ...(canAccessPedidosClientes ? [{ id: "pedidos_clientes", icon: "🏢", label: "Clientes" }] : []),
            ...(canAccessHistorial ? [{ id: "historial", icon: "🕘", label: "Historial" }] : []),
            ...(canAccessBitacora ? [{ id: "bitacora", icon: "📜", label: "Bitácora de Envíos" }] : []),
            ...(canAccessCronograma ? [{ id: "cronograma_muestras", icon: "🧵", label: "Cronograma de Muestras" }] : []),
            ...(canAccessCorte ? [{ id: "__corte__", icon: "✂", label: "Corte" }] : []),
            ...(currentUser?.isAdmin ? [{ id: "pedidos_admin", icon: "⚙", label: "Admin Pedidos" }] : []),
            // "Administrador General" siempre queda al final de la lista, sin
            // importar qué otras secciones estén visibles para el rol.
            ...(canAccessAdminDiseno ? [{ id: "admin", icon: "⚙", label: "Administrador General" }] : []),
          ],
        }]
      : []),
    ...(canAccessContabilidad
      ? [{ id: "contabilidad_area", icon: "💰", label: "Contabilidad", items: [{ id: "contabilidad_area", icon: "💰", label: "Módulo Contabilidad" }] }]
      : []),
    ...(canAccessPlaneacion
      ? [{ id: "planeacion_area", icon: "📋", label: "Planeación", items: [{ id: "planeacion_area", icon: "📋", label: "Módulo Planeación" }] }]
      : []),
  ];
  const [areaAbierta, setAreaAbierta] = useState("diseno");
  function isViewActive(itemId) {
    if (itemId === "protos") return view === "protos" || view === "proto-detail";
    if (itemId === "capsulas") return view === "capsulas" || view === "ref-detail";
    if (itemId === "pedidos") return view === "pedidos" || view === "pedido-detail";
    if (itemId === "pedidos_admin") return view === "pedidos_admin";
    if (itemId === "pedidos_clientes") return view === "pedidos_clientes";
    if (itemId === "__corte__") return moduloActivo === "corte";
    if (itemId === "contabilidad_area") return moduloActivo === "contabilidad";
    if (itemId === "planeacion_area") return moduloActivo === "planeacion";
    return view === itemId;
  }
  function navClick(itemId) {
    if (itemId === "__corte__") { setModuloActivo("corte"); return; }
    if (itemId === "contabilidad_area") { setModuloActivo("contabilidad"); return; }
    if (itemId === "planeacion_area") { setModuloActivo("planeacion"); return; }
    setView(itemId);
  }
  // "Planeador puro": solo tiene Corte y NINGUNA otra sección de Diseño (ni
  // Pedidos). Si además tiene Pedidos u otra sección, ya no aplica este atajo
  // de pantalla completa — ve el shell normal con solo esas secciones visibles.
  const isPlaneadorPuro = canAccessCorte && !canAccessPedidos && !canAccessProtos && !canAccessCapsulas && !canAccessPedidosClientes && !canAccessStats && !perms.editar && !perms.aprobar && !currentUser?.isAdmin;
  const isContabilidadPura = canAccessContabilidad && !canAccessDiseno;
  if (appState === "loading") return <LoadingScreen message="Conectando con Firebase..." />;
  if (appState === "login" || !currentUser) return <LoginScreen onLogin={(u) => { setCurrentUser(u); setAppState("ready"); }} users={users} />;
  if (isPlaneadorPuro) {
    return <ModuloCorte currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAppState("login"); }} />;
  }
  if (isContabilidadPura) {
    return <ModuloContabilidad currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAppState("login"); }} />;
  }
  if (canAccessCorte && moduloActivo === "corte") {
    return <ModuloCorte currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAppState("login"); }} onVolver={() => setModuloActivo("diseno")} />;
  }
  if (moduloActivo === "contabilidad") {
    return <ModuloContabilidad currentUser={currentUser} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); }} />;
  }
  if (moduloActivo === "planeacion") {
    return <ModuloPlaneacion currentUser={currentUser} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); }} />;
  }
  return (
    <div style={{ minHeight: "100vh", background: T.canvas, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:${T.seam};border-radius:3px;}`}</style>
      <Toast items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      {showCambiarClave && (
        <CambiarClaveModal currentUser={currentUser}
          onSave={async (nuevaClave) => {
            await saveUsers(users.map((u) => (u.id === currentUser.id ? { ...u, password: nuevaClave } : u)));
            setCurrentUser((c) => ({ ...c, password: nuevaClave }));
          }}
          onClose={() => setShowCambiarClave(false)}
        />
      )}
      {modal === "new-proto" && <NewProtoModal onSave={addProto} onClose={() => setModal(null)} config={config} />}
      {modal === "new-capsula" && <NewCapsulaModal onSave={addCapsula} onClose={() => setModal(null)} config={config} />}
      {modal === "new-ref" && newRefCap && <NewRefModal capsula={newRefCap} onSave={addRef} onClose={() => { setModal(null); setNewRefCap(null); }} config={config} />}
      {modal === "promote" && promoteProto && <PromoteModal proto={promoteProto} capsulas={capsulas} onSave={promoteToCapsula} onClose={() => { setModal(null); setPromoteProto(null); }} config={config} />}
      {modal === "new-pedido" && <SubirPedidoModal2 onSave={addPedido} onClose={() => setModal(null)} pedidoConfig={pedidoConfig} pedidos={pedidos} clientes={config.clientes} />}
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <div style={{ width: 230, background: T.ink, color: T.white, padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ marginBottom: 16, padding: "0 4px" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.white }}>TechPack</div>
            <div style={{ fontSize: 10, color: T.seam, marginTop: 1, letterSpacing: "0.1em", textTransform: "uppercase" }}>Industrias Yanko</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#2A2A45", borderRadius: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${T.seam},${T.seamDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: T.ink, flexShrink: 0 }}>{currentUser.avatar}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: T.seam }}>{currentUser.role}</div>
            </div>
            <button onClick={() => { setCurrentUser(null); setAppState("login"); }} title="Cerrar sesión" style={{ background: "none", border: "none", color: "rgba(200,184,162,0.4)", cursor: "pointer", fontSize: 15, padding: 0 }}>⏏</button>
          </div>
          <button onClick={() => setShowCambiarClave(true)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: "transparent", color: "rgba(200,184,162,0.5)", fontWeight: 600, fontSize: 11, marginBottom: 12, textAlign: "left" }}>🔑 Cambiar contraseña</button>
          <button onClick={() => setView("dashboard")} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: view === "dashboard" ? T.seam : "transparent", color: view === "dashboard" ? T.ink : "#8888AA", fontWeight: view === "dashboard" ? 800 : 500, fontSize: 13, textAlign: "left", marginBottom: 8 }}><span style={{ fontSize: 15 }}>◉</span> Dashboard</button>
          <div style={{ height: 1, background: "rgba(200,184,162,0.15)", marginBottom: 10 }} />
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
            {AREAS.map((area) => {
              const areaActiva = areaAbierta === area.id;
              const anyItemActive = area.items.some((item) => isViewActive(item.id));
              return (
                <div key={area.id}>
                  <button onClick={() => setAreaAbierta(areaActiva ? null : area.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: anyItemActive && !areaActiva ? "rgba(200,184,162,0.08)" : "transparent", color: anyItemActive ? "rgba(200,184,162,0.9)" : "rgba(136,136,170,0.7)", fontWeight: 700, fontSize: 12, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    <span style={{ fontSize: 14 }}>{area.icon}</span><span style={{ flex: 1 }}>{area.label}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{areaActiva ? "▾" : "▸"}</span>
                  </button>
                  {areaActiva && (
                    <div style={{ marginLeft: 8, marginBottom: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                      {area.items.map((item) => {
                        const active = isViewActive(item.id);
                        return (
                          <button key={item.id} onClick={() => navClick(item.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: active ? T.seam : "transparent", color: active ? T.ink : "#8888AA", fontWeight: active ? 800 : 500, fontSize: 13, textAlign: "left", borderLeft: active ? `3px solid ${T.seamDark}` : "3px solid transparent" }}>
                            <span style={{ fontSize: 13 }}>{item.icon}</span>{item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          {totalOverdue > 0 && (
            <div style={{ background: "#3A1A1A", borderRadius: 10, padding: 10, marginTop: 12, border: `1px solid ${T.coral}44` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.coral, textTransform: "uppercase" }}>⚑ Vencidos</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.white, marginTop: 2 }}>{totalOverdue}</div>
            </div>
          )}
        </div>
        <div style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>
          <div style={{ maxWidth: 1020, margin: "0 auto" }}>
            {view === "dashboard" && (
              <HomeView currentUser={currentUser} perms={perms} canAccessCorte={canAccessCorte} canAccessContabilidad={canAccessContabilidad} canAccessPlaneacion={canAccessPlaneacion} canAccessDiseno={canAccessDiseno}
                onGoArea={(id) => {
                  if (id === "contabilidad_area") { setModuloActivo("contabilidad"); }
                  else if (id === "planeacion_area") { setModuloActivo("planeacion"); }
                  else if (id === "diseno") {
                    setAreaAbierta("diseno");
                    // Entra a la primera sección de Diseño realmente habilitada
                    // para el rol (un Planeador sin Prototipos/Cápsulas debe
                    // caer en Pedidos, no en una vista sin permiso).
                    if (canAccessProtos) setView("protos");
                    else if (canAccessCapsulas) setView("capsulas");
                    else if (canAccessPedidos) setView("pedidos");
                    else if (canAccessPedidosClientes) setView("pedidos_clientes");
                    else if (canAccessStats) setView("stats");
                    else if (canAccessHistorial) setView("historial");
                    else if (canAccessBitacora) setView("bitacora");
                    else if (canAccessCronograma) setView("cronograma_muestras");
                    else if (canAccessCorte) setModuloActivo("corte");
                  }
                  else { setView(id); }
                }}
                protos={protos} capsulas={capsulas} pedidos={pedidos}
              />
            )}
            {view === "protos" && (
              <ProtosView protos={protos} role={role} perms={perms} capsulas={capsulas}
                onSelect={(id) => { setSelProtoId(id); setView("proto-detail"); }}
                onNew={() => setModal("new-proto")}
                onPromote={(p) => { setPromoteProto(p); setModal("promote"); }}
                stages={config.stages}
                isAdmin={currentUser?.isAdmin} onDeleteProto={deleteProto} config={config}
                onCrearEnvio={crearEnvioBitacora}
              />
            )}
            {view === "capsulas" && (
              <CapsulasView capsulas={capsulas} role={role} perms={perms} currentUser={currentUser?.name}
                onSelectRef={(capId, refId) => { setSelCapId(capId); setSelRefId(refId); setView("ref-detail"); }}
                onNewCapsula={() => setModal("new-capsula")}
                onNewRef={(cap) => { setNewRefCap(cap); setModal("new-ref"); }}
                onEditCapsula={updateCapsulaName}
                stages={config.stages}
                isAdmin={currentUser?.isAdmin} onDeleteCapsula={deleteCapsula} config={config}
                onSetIlustracion={setIlustracionCapsula}
                onSendObsCapsula={sendObservacionCapsula}
                onMarkDoneObsCapsula={markDoneObservacionCapsula}
                onCrearEnvio={crearEnvioBitacora}
              />
            )}
            {view === "bitacora" && (
              <BitacoraEnviosView envios={bitacoraEnvios} onUpdateEnvio={updateBitacoraEnvio} />
            )}
            {view === "proto-detail" && selProto && (
              <DetailView item={selProto} kind="proto" role={role} perms={perms} capsulas={capsulas}
                onBack={() => setView("protos")}
                onUpdateItem={(p) => updateProto(selProto.id, p)}
                onPromote={(p) => { setPromoteProto(p); setModal("promote"); }}
                onLogHistorial={logHistorial}
                notify={notify} stages={config.stages} currentUser={currentUser.name} config={config}
                cronogramaMuestras={cronogramaMuestras} onSendTaller={addCronogramaMuestra} onUpdateTaller={updateCronogramaMuestra}
              />
            )}
            {view === "ref-detail" && selRef && selCap && (
              <DetailView item={selRef} kind="ref" role={role} perms={perms} capsulas={capsulas} capsula={selCap}
                onBack={() => setView("capsulas")}
                onUpdateItem={(p) => updateRef(selCap.id, selRef.id, p)}
                onLogHistorial={logHistorial}
                notify={notify} stages={config.stages} currentUser={currentUser.name} config={config}
                cronogramaMuestras={cronogramaMuestras} onSendTaller={addCronogramaMuestra} onUpdateTaller={updateCronogramaMuestra}
              />
            )}
            {view === "pedidos" && (
              <PedidosView pedidos={pedidos}
                onSelectPedido={(id) => { setSelPedidoId(id); setView("pedido-detail"); }}
                onNewPedido={() => setModal("new-pedido")}
                onUpdatePedido={updatePedido}
                pedidoConfig={pedidoConfig}
                onSavePedidoConfig={savePedidoConfig}
                isAdmin={currentUser?.isAdmin}
              />
            )}
            {view === "pedido-detail" && selPedido && <PedidoDetailView pedido={selPedido} onBack={() => setView("pedidos")} onUpdatePedido={updatePedido} />}
            {view === "pedidos_admin" && currentUser?.isAdmin && <AdminPedidosView pedidoConfig={pedidoConfig} onSave={savePedidoConfig} config={config} onSaveConfig={saveConfig} />}
            {view === "pedidos_clientes" && <ClientesPedidosView clientes={config.clientes} pedidos={pedidos} />}
            {view === "stats" && <EstadisticasView protos={protos} capsulas={capsulas} stages={config.stages} config={config} />}
            {view === "historial" && (
              <HistorialDisenoView historial={historial} protos={protos} capsulas={capsulas} pedidos={pedidos} role={role} perms={perms} stages={config.stages}
                isAdmin={currentUser?.isAdmin} onBackfill={backfillHistorial}
                onSelectProto={(id) => { setSelProtoId(id); setView("proto-detail"); }}
                onSelectRef={(capId, refId) => { setSelCapId(capId); setSelRefId(refId); setView("ref-detail"); }}
                onPromote={(p) => { setPromoteProto(p); setModal("promote"); }}
              />
            )}
            {view === "cronograma_muestras" && (
              <CronogramaMuestrasView cronogramaMuestras={cronogramaMuestras} config={config} isAdmin={currentUser?.isAdmin}
                onAdd={addCronogramaMuestra} onUpdate={updateCronogramaMuestra} onDelete={deleteCronogramaMuestra}
                onModificarNota={addObservacionCronograma}
                onGoToItem={(entry) => {
                  if (entry.kind === "proto") { setSelProtoId(entry.itemId); setView("proto-detail"); }
                  else if (entry.kind === "ref") { setSelCapId(entry.capsulaId); setSelRefId(entry.itemId); setView("ref-detail"); }
                }}
              />
            )}
            {view === "admin" && (currentUser?.isAdmin || canAccessAdminDiseno) && (
              <AdminView config={config} onUpdateConfig={saveConfig} users={users} onUpdateUsers={saveUsers} protos={protos} capsulas={capsulas}
                onUpdateProto={updateProtoName} onUpdateCapsula={updateCapsulaName} onDeleteProto={deleteProto} onDeleteCapsula={deleteCapsula}
                isAdmin={currentUser?.isAdmin}
              />
            )}
            {view === "admin" && !currentUser?.isAdmin && !canAccessAdminDiseno && (
              <div style={{ textAlign: "center", padding: 64 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, marginBottom: 8 }}>Acceso restringido</div>
                <div style={{ fontSize: 14, color: T.slate }}>Solo los administradores pueden acceder a esta sección.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// Red de seguridad: si algo lanza un error inesperado durante el render (por
// ejemplo una extensión del navegador tipo Google Translate o un bloqueador
// de anuncios que modifica el HTML por fuera de React, lo que después hace
// que React no pueda actualizar ese mismo nodo y lance errores como "Failed
// to execute 'removeChild'"), esto evita que TODA la aplicación se quede en
// blanco — en vez de eso muestra un mensaje con un botón para recargar.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("TechPack — error capturado por ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center", background: "#FAF7F2" }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1A2E" }}>Algo salió mal al mostrar esta pantalla</div>
          <div style={{ fontSize: 14, color: "#5C5C70", maxWidth: 420 }}>Esto a veces lo causa una extensión del navegador (como Google Translate o un bloqueador de anuncios). Prueba recargar la página; si sigue pasando, avísale a soporte.</div>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", background: "#1A1A2E", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
