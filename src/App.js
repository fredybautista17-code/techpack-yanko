import React, { useState, useRef, useEffect, useCallback } from "react";
import ModuloCorte from "./modulo-corte";
import ModuloContabilidad from "./modulo-contabilidad";
import ModuloPlaneacion from "./modulo-planeacion";
import ModuloPlanta from "./modulo-planta";
import ModuloBodega from "./modulo-bodega";
import ModuloNomina from "./modulo-nomina";
import ModuloInformes from "./modulo-informes";
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
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
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
// Cliente de Cloud Functions — usado por el Informe de Pedidos Vigentes por
// Cliente para llamar getPedidosVigentesBusint (consulta Busint en vivo).
const functionsClient = getFunctions(fbApp);
// Cliente de Firebase Authentication — usado por el login real (Fase B de la
// migración de seguridad) y por los flujos de cambio/reseteo de contraseña.
const auth = getAuth(fbApp);
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
  // merge: true — así, si un documento tiene campos que la app no maneja
  // (p.ej. "authUid", que solo se agrega desde Firebase Console o Cloud
  // Functions), una reescritura masiva de items (como al editar CUALQUIER
  // usuario en la pestaña Usuarios, que reescribe TODOS los usuarios) no
  // borra esos campos aunque la copia local en memoria no los tenga.
  const batch = writeBatch(db);
  items.forEach((item) => batch.set(doc(db, col, item.id), item, { merge: true }));
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
    preparada_para_enviar: "Preparada para Enviar",
    enviado: "Enviado",
    recibido_cliente: "Recibido por Cliente",
    borrador: "Borrador",
  };
  const userObs = (item.observations || []).filter(
    (o) => o.type !== "update" && o.user !== "Sistema"
  );
  const wsData = [
    ["HOJA DE VIDA — ATLAS YANKO", "", "", "", "", ""],
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
    enviar_cliente: "#0E7490",
    preparada_para_enviar: "#2D9E6B",
    enviado: "#0369A1",
    borrador: "#5A5A7A",
  };
  const statusLabel = {
    aprobado: "Aprobado",
    declinado: "Declinado",
    en_proceso: "En proceso",
    en_revision: "En revisión",
    enviado_cotizacion: "En cotización",
    enviar_cliente: "Enviar al Cliente",
    preparada_para_enviar: "Preparada para Enviar",
    enviado: "Enviado",
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
    <span>ATLAS · Industrias Yanko</span>
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
    enviar_cliente: "Enviar al Cliente",
    preparada_para_enviar: "Preparada para Enviar",
    enviado: "Enviado",
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
    { id: "cotizacion", label: "Cotización", short: "COTIZACIÓN", days: 1 },
    { id: "por_enviar", label: "Por Enviar", short: "P.ENV", days: 2 },
  ],
  categorias: ["Cachetero","Byker","Capry","Leggins","Camiseta","Sisa","Top","Buso","Short","Enterizo","Body","Conjunto","Vestido","Blusa","Pantaloneta","Jogger","Traje de Baño","Bóxer","Pantys"],
  siluetas: ["Slimfit","Regularfit","Silueta Amplia","Oversize","Super Oversize","Estándar"],
  rangos: ["Normal (S,M,L,XL)","Doble Talla (S/M - M/L)","Talla U","Plus","Plus (1XL-2XL-3XL)"],
  // Línea del producto — mismo campo "linea" que trae Busint, distinta de
  // Silueta (que es el corte: Slimfit, Oversize, etc.). OJO: en Busint esto
  // NO son solo "Dama"/"Caballero" — son códigos compuestos reales, ej.
  // "INFAN FEME BASICO" (Infantil Femenino Básico). Por eso no se adivinan
  // acá: se quedan vacías por defecto y se llenan con el botón "🔄 Cargar
  // líneas reales desde Busint" en Administración → Códigos de Referencia,
  // que lee los valores tal cual vienen de la bitácora ya sincronizada. Se
  // usa como criterio opcional para amarrar una Categoría a un
  // prefijo/rango distinto en Códigos de Referencia.
  lineas: [],
  // Como config.lineas trae docenas de valores compuestos reales de Busint
  // (ej. "INFAN FEME BASICO", "CABA DEPORT PREMIUN") sería un dolor de
  // cabeza crear una fila de Código de Referencia por cada línea puntual
  // solo para diferenciar Dama/Caballero/Niña/Niño. En vez de eso, cada
  // línea se clasifica UNA vez en un grupo (ver lineaGrupoMap más abajo), y
  // una fila de Código de Referencia puede amarrarse a ese grupo entero
  // (ej. Categoría Camiseta + Cliente Kamila + Grupo Caballero → prefijo
  // 97) en vez de a una línea puntual. Una fila con Línea puntual (más
  // específica) sigue ganando sobre una de Grupo si ambas aplican — ver
  // buscarEntradaCodigoReferencia().
  gruposLinea: ["Dama", "Caballero", "Niña", "Niño"],
  // Mapa { "NOMBRE DE LÍNEA": "Grupo" } — se llena en Administración → Línea.
  // Una línea sin entrada acá no pertenece a ningún grupo (no matchea
  // ninguna fila de Código de Referencia que use Grupo).
  lineaGrupoMap: {},
  disenadores: [],
  // Catálogo de codificación de referencias: cada entrada amarra una
  // Categoría (y opcionalmente una Silueta puntual) a un prefijo y un rango
  // de números (rangoInicio-rangoFin, ej. 201-299), más opcionalmente un
  // rango de desborde (desbordeInicio-desbordeFin) al que saltar
  // automáticamente cuando el rango principal se llene. Con esto,
  // sugerirReferencia() calcula el consecutivo automático al crear un
  // Prototipo o una Referencia de Cápsula. Si silueta queda vacío, la
  // entrada aplica a toda la categoría. Editable en Administración →
  // Códigos de Referencia (incluye un botón para cargar la plantilla
  // sugerida a partir del cuadro real que maneja Industrias Yanko).
  codigosReferencia: [],
  // Áreas de la compañía usadas en el módulo de KPIs (ver KPIsView), que
  // cubre TODA la empresa, no solo Diseño. Cada Puesto (colección
  // `kpi_puestos`) pertenece a UNA de estas áreas; cada persona y cada KPI
  // del catálogo heredan el área de su puesto — así se puede filtrar y
  // comparar por área o por puesto, y detectar KPIs solapados entre puestos.
  kpiAreas: ["Diseño", "Corte", "Ventas", "Contabilidad", "Planeación"],
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
  // Solo aplica a referencias DENTRO de una cápsula: en vez de registrar su
  // envío individual, queda "en espera" hasta que toda la cápsula esté lista
  // y se registre un solo envío agrupado (ver CapsulasView).
  preparada_para_enviar: { label: "Preparada para Enviar", color: T.jade, bg: T.jadeBg },
  enviado: { label: "Enviado", color: "#0369A1", bg: "#EFF6FF" },
  recibido_cliente: { label: "Recibido por Cliente", color: T.jade, bg: T.jadeBg },
  declinado: { label: "Declinado", color: T.coral, bg: T.coralBg },
  bloqueado: { label: "Bloqueado", color: "#888", bg: "#F0F0F0" },
};
// --- Cronograma de Muestras ---
// Estado propio de cada envío a taller de muestra (independiente del status
// del prototipo/referencia en Diseño). Elegir un taller en el formulario no
// significa que el taller ya la vaya a hacer — muchas veces el taller tiene
// cola de muestras y todavía no la ha tomado. Por eso el flujo tiene 5
// pasos: arranca "pendiente" ("Sin asignar" — ya se eligió taller, pero el
// taller aún no confirmó que la va a hacer), pasa a "asignado" ("Asignado" —
// el taller ya la tomó) cuando alguien lo marca a mano, luego a "aprobado" o
// "modificar" según lo que vuelva del taller, y "enviado" se pone solo
// cuando el prototipo/referencia pasa a status "enviado" en Diseño (ver
// syncCronogramaEnviado) — no se elige a mano.
const ESTADO_MUESTRA = {
  pendiente: { label: "Sin asignar", color: T.slate, bg: "#EDEDF2" },
  asignado: { label: "Asignado", color: T.amber, bg: T.amberBg },
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
// Limpia el "Usuario" (nombre de acceso) mientras se escribe: minúsculas,
// sin tildes, sin espacios ni caracteres raros. Es necesario porque por
// detrás se arma un correo interno de acceso a Firebase
// (usuario@techpack-yanko.local) — un espacio u otro carácter inválido ahí
// hace que Firebase rechace la cuenta con un error de "correo con formato
// incorrecto" que no tiene relación aparente con el campo Usuario. Limpiar
// en vivo evita ese error por completo en vez de solo avisarlo después.
function sanitizarUsername(v) {
  return String(v || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita tildes/acentos
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, ""); // solo letras, números, punto, guion, guion bajo
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
  // A pedido de Dayana (13/08/2026): la etapa "Por Enviar" (justo antes de
  // que el prototipo/referencia salga como Enviado) ya NO se marca como
  // vencida — sentía alarmante recibir avisos de "vencido" en un ítem que
  // ya está prácticamente listo, a un paso de despacharse. El corte real
  // sigue siendo "antes de Enviar": Ilustración, PDS, Corte, Confección y
  // Cotización sí pueden marcarse vencidas; Por Enviar y todo lo posterior,
  // no.
  if (item.currentStage === "por_enviar") return false;
  const s = stages.find((x) => x.id === item.currentStage);
  return s ? daysAgo(item.stageStartedAt) > s.days : false;
}
function today() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }
// Calcula el próximo consecutivo de referencia (Ej: "76-403") a partir del
// catálogo config.codigosReferencia. Busca primero una entrada que amarre
// exactamente categoria+silueta; si no hay, cae a una entrada de esa
// categoría sin silueta puntual (aplica a toda la categoría). El corrido
// (número dentro del segmento, del 01 al 99) nunca se reinicia: escanea
// TODAS las referencias ya usadas (prototipos + referencias de cápsulas,
// vivas o históricas) con ese mismo prefijo-segmento y sigue desde la más
// alta encontrada, no desde las que existen hoy en pantalla.
// Encuentra en config.codigosReferencia la entrada que amarra esta
// categoria(+línea)(+cliente) a un prefijo/rango. El prefijo puede depender
// del cliente (cada cliente puede tener su propio rango de números), así
// que primero se descartan las filas que tengan Línea, Grupo o Cliente
// puntuales que NO coincidan con lo buscado (esas son de otra línea/otro
// grupo/otro cliente), y entre las que quedan gana la más específica:
// Cliente+Línea > Cliente+Grupo > Cliente > Línea > Grupo > genérica (sin
// línea/grupo/cliente, aplica a toda la categoría). El Grupo de la línea
// elegida sale de config.lineaGrupoMap (ver DEFAULT_CONFIG.lineaGrupoMap) —
// así una fila puede amarrarse a "toda línea de Caballero" sin tener que
// enumerar cada línea puntual de Busint.
function buscarEntradaCodigoReferencia(categoria, linea, cliente, config) {
  const catalogo = (config?.codigosReferencia || []).filter((c) => c.categoria === categoria);
  if (!categoria || catalogo.length === 0) return null;
  const grupo = (config?.lineaGrupoMap || {})[linea] || "";
  const candidatas = catalogo.filter(
    (c) => (!c.cliente || c.cliente === cliente) && (!c.linea || c.linea === linea) && (!c.grupo || c.grupo === grupo)
  );
  if (candidatas.length === 0) return null;
  const especificidad = (c) => (c.cliente ? 4 : 0) + (c.linea ? 2 : 0) + (c.grupo ? 1 : 0);
  return candidatas.reduce((mejor, c) => (especificidad(c) > especificidad(mejor) ? c : mejor), candidatas[0]);
}
// Compara/busca referencias IGNORANDO el guion — Busint a veces guarda o
// devuelve el mismo código SIN guion (ej. "985609" en vez de "98-5609"),
// mientras que ATLAS siempre arma sus propias referencias CON guion
// ("98-5609"). Sin esta normalización, el sistema no reconoce que son el
// mismo código: no lo cuenta al calcular el siguiente consecutivo, y no lo
// detecta como duplicado. Se usa en TODA comparación/búsqueda de una
// referencia contra otra, tanto acá como en la Cloud Function
// probarReferenciaBusint.
function normalizarRefComparacion(v) {
  return String(v || "").trim().toUpperCase().replace(/-/g, "");
}
// Extrae, de una o varias listas de códigos de referencia, los números
// (corridos absolutos, ej. 401) que caen DENTRO de un rango [inicio, fin]
// para un prefijo dado (ej. prefijo "76", rango 401-499). Reemplaza al
// viejo esquema de "segmento" de ancho fijo (siempre bloques de 100) —
// las categorías reales del cliente no tienen todas el mismo ancho (ej.
// Conjuntos/Vestidos usa un bloque de 1000, Short Cachetero uno de 99), así
// que cada entrada de config.codigosReferencia guarda su propio
// rangoInicio/rangoFin. El guion es opcional al comparar (ver
// normalizarRefComparacion) — si no se consideraran también las
// referencias de Busint sin guion, el consecutivo sugerido podría chocar
// con una que ATLAS nunca "vio".
function numerosEnRango(prefijo, inicio, fin, ...listasDeRefs) {
  const regex = new RegExp(`^${prefijo}(\\d+)$`);
  const nums = [];
  [].concat(...listasDeRefs).forEach((ref) => {
    const m = regex.exec(normalizarRefComparacion(ref));
    if (!m) return;
    const num = parseInt(m[1], 10);
    if (num >= inicio && num <= fin) nums.push(num);
  });
  return nums;
}
// Calcula el próximo consecutivo de referencia (Ej: "98-403") a partir del
// catálogo config.codigosReferencia. El corrido nunca se reinicia: escanea
// TODAS las referencias ya usadas — tanto en ATLAS (prototipos + referencias
// de cápsulas) como en la bitácora local de Busint (busintLista, ver
// useMaestroReferenciasBusint) — y sigue desde la más alta encontrada entre
// las dos fuentes, para no chocar con una referencia que se haya creado
// directo en Busint sin pasar por ATLAS.
// Si el rango principal de la categoría ya se llenó (el siguiente número se
// saldría de rangoFin) y la entrada tiene un rango de desborde configurado
// (desbordeInicio/desbordeFin — ej. el cliente reserva 98-2200 a 98-2299
// como "segunda vuelta" de Faldas una vez se agota 98-201 a 98-299), la
// sugerencia salta automáticamente a ese rango de desborde en vez de
// invadir el bloque de la categoría vecina.
function sugerirReferencia(categoria, linea, cliente, config, protos, capsulas, busintLista) {
  const entrada = buscarEntradaCodigoReferencia(categoria, linea, cliente, config);
  if (!entrada || !entrada.prefijo) return null;
  const prefijo = String(entrada.prefijo).trim();
  // Compatibilidad con filas creadas ANTES de este cambio (solo tenían
  // "segmento", bloques fijos de 100, del 0 al 10) — si la fila no trae
  // rangoInicio/rangoFin explícitos, se calculan igual que antes a partir
  // de segmento, para no romper códigos que ya se hayan registrado a mano.
  let inicio, fin;
  if (entrada.rangoInicio != null && entrada.rangoInicio !== "") {
    inicio = Number(entrada.rangoInicio) || 1;
    fin = Number(entrada.rangoFin) || inicio + 98;
  } else {
    const base = (Number(entrada.segmento) || 0) * 100;
    inicio = base + 1;
    fin = base + 99;
  }
  const refsLocales = [
    ...protos.map((p) => p.reference),
    ...capsulas.flatMap((c) => (c.referencias || []).map((r) => r.reference)),
  ];
  const refsBusint = (busintLista || []).map((r) => r.ref);
  const nums = numerosEnRango(prefijo, inicio, fin, refsLocales, refsBusint);
  let rangoInicio = inicio;
  let rangoFin = fin;
  let siguiente = nums.length ? Math.max(...nums) + 1 : inicio;
  const tieneDesborde = entrada.desbordeInicio != null && entrada.desbordeInicio !== "" && entrada.desbordeFin != null && entrada.desbordeFin !== "";
  if (siguiente > fin && tieneDesborde) {
    const inicioD = Number(entrada.desbordeInicio);
    const finD = Number(entrada.desbordeFin);
    const numsD = numerosEnRango(prefijo, inicioD, finD, refsLocales, refsBusint);
    siguiente = numsD.length ? Math.max(...numsD) + 1 : inicioD;
    rangoInicio = inicioD;
    rangoFin = finD;
  }
  return { codigo: `${prefijo}-${String(siguiente).padStart(3, "0")}`, prefijo, rangoInicio, rangoFin, siguiente };
}
// Busca si un código de referencia ya está en uso DENTRO de ATLAS mismo
// (prototipos o referencias de cápsula) — a diferencia de la bitácora de
// Busint (que puede tener hasta un día de rezago), esto siempre está al
// segundo: protos/capsulas se leen en vivo de Firestore, así que un
// duplicado creado hace 5 minutos ya se detecta aquí sin esperar ningún
// sync.
function buscarRefEnAtlas(refNorm, protos, capsulas) {
  if (!refNorm) return null;
  const proto = (protos || []).find((p) => normalizarRefComparacion(p.reference) === refNorm);
  if (proto) return { tipo: "Prototipo", nombre: proto.name };
  for (const cap of capsulas || []) {
    const ref = (cap.referencias || []).find((r) => normalizarRefComparacion(r.reference) === refNorm);
    if (ref) return { tipo: "Referencia de cápsula", nombre: `${ref.name} — ${cap.name}` };
  }
  return null;
}
// Las últimas N referencias (más altas) que YA existen en Busint dentro de
// este mismo prefijo-segmento — se muestran junto a la sugerencia para que
// el usuario vea el patrón real en vez de confiar a ciegas en un solo
// número calculado.
function ultimasReferenciasBusint(prefijo, inicio, fin, busintLista, n = 3) {
  if (!prefijo || !busintLista) return [];
  const regex = new RegExp(`^${prefijo}(\\d+)$`);
  return busintLista
    .map((r) => ({ ref: String(r.ref || "").trim(), m: regex.exec(normalizarRefComparacion(r.ref)) }))
    .filter((x) => x.m)
    .map((x) => ({ ref: x.ref, num: parseInt(x.m[1], 10) }))
    .filter((x) => x.num >= inicio && x.num <= fin)
    .sort((a, b) => b.num - a.num)
    .slice(0, n)
    .map((x) => x.ref);
}
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
      <div style={{ fontSize: 18, fontWeight: 800, color: T.white, marginBottom: 8 }}>ATLAS</div>
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
function LoginScreen({ externalError }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  // Login real con Firebase Authentication (Fase B/C de la migración de
  // seguridad — antes esto comparaba la clave en texto plano contra la
  // colección `users`). Como acá se entra con nombre de usuario y no correo,
  // se arma el mismo correo sintético que usó la migración de Fase A:
  // usuario@techpack-yanko.local. Ya no hace falta leer la colección `users`
  // aquí para nada — Firebase valida la clave real, y una vez la sesión
  // queda activa, es AppInner (vía onAuthStateChanged) quien carga los datos
  // y encuentra el perfil correspondiente.
  async function handleLogin() {
    if (!username || !password) { setError("Ingresa usuario y contraseña."); return; }
    setLoading(true);
    setError("");
    const usernameNorm = username.toLowerCase().trim();
    const email = `${usernameNorm}@techpack-yanko.local`;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // No hace falta hacer nada más aquí: en cuanto la sesión queda activa,
      // AppInner detecta el cambio y carga los datos solo.
    } catch (err) {
      setError("Usuario o contraseña incorrectos.");
      setLoading(false);
    }
  }
  const mensajeError = error || externalError;
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
          <div style={{ fontSize: 28, fontWeight: 900, color: T.white, letterSpacing: "-0.5px" }}>ATLAS</div>
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
          {mensajeError && (<div style={{ padding: "10px 14px", background: "rgba(232,93,74,0.15)", border: "1px solid rgba(232,93,74,0.3)", borderRadius: 8, color: "#FF8A7A", fontSize: 13, fontWeight: 600, marginBottom: 20 }}>⚠ {mensajeError}</div>)}
          <button onClick={handleLogin} disabled={loading}
            style={{ width: "100%", padding: "13px", background: loading ? "rgba(200,184,162,0.3)" : `linear-gradient(135deg,${T.seam},${T.seamDark})`, border: "none", borderRadius: 10, color: T.ink, fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >{loading ? "Verificando..." : "Ingresar →"}</button>
          <div style={{ marginTop: 20, textAlign: "center" }}><span style={{ fontSize: 12, color: "rgba(200,184,162,0.4)" }}>ATLAS © 2025</span></div>
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
            {/* La etapa de Cotización se escribe completa (no "COT") — así lo
                pidió el usuario, para que no se confunda con una abreviatura
                rara; las demás etapas siguen mostrando su abreviatura corta. */}
            {!compact && <div style={{ fontSize: 9, color: active ? T.denim : T.slate, fontWeight: active ? 700 : 400, marginTop: 3 }}>{s.id === "cotizacion" ? "COTIZACIÓN" : s.short}</div>}
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
// Ventana flotante: se puede arrastrar desde el encabezado y agrandar o
// achicar arrastrando la esquina inferior derecha (igual que en Programación
// de Mesones, en Corte). Un botón ⟲ vuelve al tamaño/posición original.
function Modal({ title, onClose, children, width = 560 }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width, height: null });
  const dragState = useRef(null);
  const resizeState = useRef(null);
  function onHeaderMouseDown(e) {
    if (e.target.closest("button")) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    function onMove(ev) {
      if (!dragState.current) return;
      const { startX, startY, origX, origY } = dragState.current;
      setPos({ x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY) });
    }
    function onUp() {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function onResizeMouseDown(e) {
    e.stopPropagation();
    e.preventDefault();
    const box = e.currentTarget.parentElement;
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: size.width, origH: size.height || box.offsetHeight };
    function onMove(ev) {
      if (!resizeState.current) return;
      const { startX, startY, origW, origH } = resizeState.current;
      setSize({ width: Math.max(360, origW + (ev.clientX - startX)), height: Math.max(240, origH + (ev.clientY - startY)) });
    }
    function onUp() {
      resizeState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div
        style={{
          position: "relative",
          background: T.white,
          borderRadius: 14,
          width: size.width,
          maxWidth: "95vw",
          height: size.height || undefined,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(26,26,46,0.18)",
          transform: `translate(${pos.x}px, ${pos.y}px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div onMouseDown={onHeaderMouseDown} style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, cursor: "move", userSelect: "none" }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: T.ink }}>{title}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {(pos.x !== 0 || pos.y !== 0 || size.height !== null) && (
              <button
                onClick={() => { setPos({ x: 0, y: 0 }); setSize({ width, height: null }); }}
                title="Volver a tamaño y posición original"
                style={{ background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: T.slate, cursor: "pointer" }}
              >
                ⟲
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.slate }}>×</button>
          </div>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
        <div
          onMouseDown={onResizeMouseDown}
          title="Arrastrar para ampliar"
          style={{ position: "absolute", right: 2, bottom: 2, width: 18, height: 18, cursor: "nwse-resize", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 2 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="8" cy="2" r="1" fill={T.border} />
            <circle cx="8" cy="5" r="1" fill={T.border} />
            <circle cx="8" cy="8" r="1" fill={T.border} />
            <circle cx="5" cy="5" r="1" fill={T.border} />
            <circle cx="5" cy="8" r="1" fill={T.border} />
            <circle cx="2" cy="8" r="1" fill={T.border} />
          </svg>
        </div>
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

// Lee la bitácora local de referencias de Busint (colección Firestore
// "busint_referencias", que se llena sola cada madrugada vía la función
// programada syncReferenciasBusint, o al toque con el botón "Sincronizar
// ahora" en Administración → Códigos de Referencia). Se prefirió leer de
// Firestore en vez de llamar a Busint en vivo cada vez que alguien abre el
// modal: es instantáneo, y sigue funcionando aunque el puente a Busint esté
// caído en ese momento — el precio es que los datos pueden tener hasta un
// día de rezago, aceptable para un catálogo que casi no cambia.
function useMaestroReferenciasBusint() {
  const [estado, setEstado] = useState({ cargando: true, error: "", lista: [], set: null });
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "busint_referencias"),
      (snap) => {
        const lista = snap.docs.map((d) => d.data());
        const set = new Set(lista.map((r) => normalizarRefComparacion(r.ref)));
        setEstado({ cargando: false, error: "", lista, set });
      },
      (err) => {
        setEstado({ cargando: false, error: err?.message || "No se pudo leer la bitácora de Busint.", lista: [], set: null });
      }
    );
    return () => unsub();
  }, []);
  return estado;
}
// Caja compartida por "Nuevo Prototipo" y "Nueva Referencia": arriba la
// sugerencia de consecutivo (con las últimas usadas en ese mismo
// prefijo-segmento, para no tener que adivinar) y abajo el resultado de
// verificar contra la bitácora de Busint lo que sea que esté hoy en el
// campo Ref, venga de la sugerencia o escrita a mano.
// Genera, a partir del consecutivo sugerido, hasta N candidatos seguidos
// (mismo prefijo, dentro del mismo rango activo — principal o desborde, el
// que haya calculado sugerirReferencia) para que el usuario pueda elegir
// otro con un clic si el primero choca (ej. porque Busint tiene algo
// creado directo ahí que la bitácora local todavía no sincronizó). Cada
// candidato se verifica en vivo contra ATLAS y contra la bitácora de
// Busint — solo los libres quedan clicables.
function candidatosReferencia(sug, busint, protos, capsulas, n = 5) {
  if (!sug) return [];
  const candidatos = [];
  for (let num = sug.siguiente; num <= sug.rangoFin && candidatos.length < n; num++) {
    const codigo = `${sug.prefijo}-${String(num).padStart(3, "0")}`;
    const refNorm = normalizarRefComparacion(codigo);
    const enAtlas = buscarRefEnAtlas(refNorm, protos, capsulas);
    const enBusint = busint?.set?.has(refNorm) || false;
    candidatos.push({ codigo, libre: !enAtlas && !enBusint });
  }
  return candidatos;
}
function SugerenciaYVerificacionRef({ sug, referencia, onUsar, busint, protos, capsulas }) {
  const refNorm = normalizarRefComparacion(referencia);
  const sugerencia = sug?.codigo || null;
  if (!sugerencia && !refNorm) return null;
  const ultimas = sug ? ultimasReferenciasBusint(sug.prefijo, sug.rangoInicio, sug.rangoFin, busint.lista) : [];
  const enAtlas = refNorm ? buscarRefEnAtlas(refNorm, protos, capsulas) : null;
  const candidatos = !refNorm ? candidatosReferencia(sug, busint, protos, capsulas) : [];
  return (
    <div style={{ padding: "10px 12px", background: T.canvas, borderRadius: 8, marginBottom: 12, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
      {sugerencia && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: candidatos[0]?.libre === false ? T.coral : T.jade, fontWeight: 700 }}>
          <span>
            🔢 Sugerencia: <strong>{sugerencia}</strong>
            {candidatos[0]?.libre === false && <span> — ya ocupado, mira las otras opciones abajo</span>}
            {ultimas.length > 0 && <span style={{ color: T.slate, fontWeight: 600 }}> · últimas en Busint: {ultimas.join(", ")}</span>}
          </span>
          {!refNorm && candidatos[0]?.libre !== false && <button onClick={() => onUsar(sug.codigo)} style={{ background: T.jade, color: T.white, border: "none", borderRadius: 6, padding: "4px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Usar</button>}
        </div>
      )}
      {candidatos.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 11.5 }}>
          <span style={{ color: T.slate, fontWeight: 600 }}>Otras opciones libres:</span>
          {candidatos.slice(1).map((c) => (
            <button
              key={c.codigo}
              onClick={() => c.libre && onUsar(c.codigo)}
              disabled={!c.libre}
              title={c.libre ? "Usar este consecutivo" : "Ya está ocupado"}
              style={{
                background: c.libre ? T.white : T.coralBg,
                color: c.libre ? T.denim : T.coral,
                border: `1px solid ${c.libre ? T.border : T.coral}`,
                borderRadius: 6,
                padding: "3px 8px",
                fontWeight: 700,
                fontSize: 11,
                cursor: c.libre ? "pointer" : "not-allowed",
                textDecoration: c.libre ? "none" : "line-through",
              }}
            >
              {c.codigo}
            </button>
          ))}
        </div>
      )}
      {/* Chequeo contra ATLAS: siempre en vivo, sin ningún rezago — se detecta
          al instante aunque el duplicado se haya creado hace 2 minutos. */}
      {refNorm && enAtlas && (
        <div style={{ fontSize: 12, color: T.coral, fontWeight: 700 }}>⚠ "{referencia}" YA EXISTE en ATLAS — {enAtlas.tipo}: {enAtlas.nombre}</div>
      )}
      {/* Chequeo contra Busint: viene de la bitácora local, puede tener hasta
          un día de rezago (o lo que haya pasado desde el último "Sincronizar
          ahora"). */}
      {refNorm && busint.cargando && (
        <div style={{ fontSize: 12, color: T.slate, fontWeight: 600 }}>🔎 Verificando "{referencia}" contra la bitácora de Busint...</div>
      )}
      {refNorm && !busint.cargando && busint.error && (
        <div style={{ fontSize: 12, color: T.amber, fontWeight: 600 }}>⚠ No se pudo verificar contra Busint — {busint.error}</div>
      )}
      {refNorm && !busint.cargando && !busint.error && busint.lista.length === 0 && (
        <div style={{ fontSize: 12, color: T.amber, fontWeight: 600 }}>ℹ Aún no hay bitácora de Busint sincronizada — hazlo desde Administración → Códigos de Referencia.</div>
      )}
      {refNorm && !busint.cargando && !busint.error && busint.lista.length > 0 && !enAtlas && (
        busint.set.has(refNorm) ? (
          <div style={{ fontSize: 12, color: T.coral, fontWeight: 700 }}>⚠ "{referencia}" YA EXISTE en Busint — elige otro consecutivo</div>
        ) : (
          <div style={{ fontSize: 12, color: T.jade, fontWeight: 700 }}>✅ "{referencia}" verificada — no existe en Busint, libre para usar</div>
        )
      )}
    </div>
  );
}
function NewProtoModal({ onSave, onClose, config, protos, capsulas }) {
  const [form, setForm] = useState({ name: "", categoria: "", silueta: "", linea: "", rango: "", reference: "", assignedTo: "", cliente: "", mes: "", tipoTela: "", baseMolderia: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const busint = useMaestroReferenciasBusint();
  const sug = sugerirReferencia(form.categoria, form.linea, form.cliente, config, protos || [], capsulas || [], busint.lista);
  function save() {
    if (!form.name || !form.reference) return;
    onSave({ id: uid(), ...form, status: "borrador", currentStage: "ilustracion", stageStartedAt: today(), createdAt: today(), promotedTo: null, image: null, bom: [], pom: [], observations: [] });
    onClose();
  }
  return (
    <Modal title="Nuevo Prototipo" onClose={onClose} width={540}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Ej: Prueba camiseta básica" /></Field>
      <Field label="Cliente"><FSel value={form.cliente} onChange={set("cliente")} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config.categorias} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config.siluetas} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Línea"><FSel value={form.linea} onChange={set("linea")} options={config.lineas} /></Field>
        <Field label="Rango"><FSel value={form.rango} onChange={set("rango")} options={config.rangos} /></Field>
        <Field label="Mes"><FSel value={form.mes} onChange={set("mes")} options={MONTHS_ES} /></Field>
      </div>
      <SugerenciaYVerificacionRef sug={sug} referencia={form.reference} onUsar={(codigo) => set("reference")(codigo)} busint={busint} protos={protos} capsulas={capsulas} />
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
function EditRefModal({ refData: refItem, onSave, onClose, config, protos }) {
  const [form, setForm] = useState({ name: refItem?.name || "", reference: refItem?.reference || "", assignedTo: refItem?.assignedTo || "", categoria: refItem?.categoria || "", silueta: refItem?.silueta || "", colores: refItem?.colores?.[0] || "", tallas: refItem?.tallas?.[0] || "", tipoTela: refItem?.tipoTela || "", baseMolderia: refItem?.baseMolderia || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  // Si esta referencia se promovió desde un prototipo (fromProtoId), se
  // trae acá su número de referencia — de solo lectura, porque el vínculo
  // ya quedó fijado al promover y no se debe poder cambiar desde acá.
  const protoOrigen = refItem?.fromProtoId ? (protos || []).find((p) => p.id === refItem.fromProtoId) : null;
  function save() {
    if (!form.name || !form.reference) return;
    onSave({ ...form, colores: form.colores ? [form.colores] : [], tallas: form.tallas ? [form.tallas] : [] });
    onClose();
  }
  return (
    <Modal title={`Editar Referencia — ${refItem?.reference}`} onClose={onClose} width={560}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Nombre de la referencia" /></Field>
      {refItem?.fromProtoId && (
        <Field label="Prototipo">
          <div style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.slate, background: T.canvas }}>
            {protoOrigen ? protoOrigen.reference : "(prototipo no encontrado)"}
          </div>
        </Field>
      )}
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
  const [form, setForm] = useState({ name: proto?.name || "", categoria: proto?.categoria || "", silueta: proto?.silueta || "", rango: proto?.rango || "", reference: proto?.reference || "", assignedTo: proto?.assignedTo || "", cliente: proto?.cliente || "", mes: proto?.mes || "", tipoTela: proto?.tipoTela || "", baseMolderia: proto?.baseMolderia || "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() { if (!form.name || !form.reference) return; onSave(form); onClose(); }
  return (
    <Modal title={`Editar Prototipo — ${proto.reference}`} onClose={onClose} width={540}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Nombre del prototipo" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config.categorias} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config.siluetas} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Rango"><FSel value={form.rango} onChange={set("rango")} options={config.rangos} /></Field>
        <Field label="Cliente"><FSel value={form.cliente} onChange={set("cliente")} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
        <Field label="Mes"><FSel value={form.mes} onChange={set("mes")} options={MONTHS_ES} /></Field>
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
  const [form, setForm] = useState({ name: "", season: "", cliente: "", mes: "", assignedTo: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  function save() { if (!form.name) return; onSave({ id: uid(), ...form, createdAt: today(), referencias: [], ilustracionEstado: "pendiente", observacionesIlustracion: [] }); onClose(); }
  return (
    <Modal title="Nueva Cápsula" onClose={onClose}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Ej: Cápsula Otoño 2025" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Temporada / Código"><FInput value={form.season} onChange={set("season")} placeholder="Ej: AW25 o C0127" /></Field>
        <Field label="Responsable"><FSel value={form.assignedTo} onChange={set("assignedTo")} options={config?.disenadores || []} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Cliente"><FSel value={form.cliente} onChange={set("cliente")} options={(config?.clientes || []).map((c) => c.nombre)} /></Field>
        <Field label="Mes"><FSel value={form.mes} onChange={set("mes")} options={MONTHS_ES} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Crear Cápsula</Btn>
      </div>
    </Modal>
  );
}

function NewRefModal({ capsula, onSave, onClose, config, protos, capsulas }) {
  const [form, setForm] = useState({ name: "", reference: "", assignedTo: "", categoria: "", silueta: "", linea: "", rango: "", colores: "", tallas: "", tipoTela: "", baseMolderia: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const busint = useMaestroReferenciasBusint();
  // OJO: en este formulario el campo "Cliente" en pantalla se guarda bajo
  // form.colores (así venía de antes) — se usa igual acá para que el
  // consecutivo sugerido también tenga en cuenta el cliente.
  const sug = sugerirReferencia(form.categoria, form.linea, form.colores, config, protos || [], capsulas || [], busint.lista);
  function save() {
    if (!form.name || !form.reference) return;
    onSave(capsula.id, {
      id: uid(), name: form.name, reference: form.reference, categoria: form.categoria, silueta: form.silueta, linea: form.linea, rango: form.rango, fromProtoId: null, status: "borrador", currentStage: "ilustracion", stageStartedAt: today(), assignedTo: form.assignedTo, createdAt: today(), image: null, colores: form.colores ? [form.colores] : [], tallas: form.tallas ? [form.tallas] : [], tipoTela: form.tipoTela, baseMolderia: form.baseMolderia, bom: [], pom: [], approvals: [],
      observations: [{ id: uid(), user: "Sistema", role: "Sistema", text: "Referencia creada.", date: nowISO(), type: "info", done: true }],
    });
    onClose();
  }
  return (
    <Modal title={`Nueva Referencia — ${capsula.name}`} onClose={onClose} width={560}>
      <Field label="Nombre"><FInput value={form.name} onChange={set("name")} placeholder="Ej: Camiseta Oversize Negra" /></Field>
      <Field label="Cliente"><FSel value={form.colores} onChange={set("colores")} options={(config.clientes || []).map((c) => c.nombre)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Categoría"><FSel value={form.categoria} onChange={set("categoria")} options={config.categorias} /></Field>
        <Field label="Silueta"><FSel value={form.silueta} onChange={set("silueta")} options={config.siluetas} /></Field>
      </div>
      <Field label="Línea"><FSel value={form.linea} onChange={set("linea")} options={config.lineas} /></Field>
      <SugerenciaYVerificacionRef sug={sug} referencia={form.reference} onUsar={(codigo) => set("reference")(codigo)} busint={busint} protos={protos} capsulas={capsulas} />
      <Field label="Ref"><FInput value={form.reference} onChange={set("reference")} placeholder="Ej: CM-001" /></Field>
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
      <div style={{ padding: "10px 14px", background: T.denimBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.denim, fontWeight: 600 }}>📦 Registra los datos del envío al cliente — esto también queda guardado en la Bitácora de Envíos</div>
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
// Precio de cotización de una referencia/prototipo — se pide al mandarlo a
// "En cotización" (botón 📤 Cotización), y también se puede editar después
// mientras siga en ese tramo del flujo de envío (clic sobre la píldora del
// precio). Queda guardado en el propio ítem (`precioCotizacion`).
function PrecioCotizacionModal({ item, onSave, onClose }) {
  const [precio, setPrecio] = useState(item.precioCotizacion != null ? String(item.precioCotizacion) : "");
  const num = Number(precio);
  const valido = precio !== "" && !isNaN(num) && num > 0;
  function save() {
    if (!valido) return;
    onSave(num);
  }
  return (
    <Modal title="Precio de Cotización" onClose={onClose} width={400}>
      <div style={{ padding: "10px 14px", background: T.violetBg, borderRadius: 8, marginBottom: 20, fontSize: 13, color: T.violet, fontWeight: 600 }}>💲 Precio cotizado para {item.reference || item.name}</div>
      <Field label="Precio (COP)">
        <FInput type="number" value={precio} onChange={setPrecio} placeholder="Ej: 45000" />
      </Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save} disabled={!valido}>Guardar</Btn>
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
function DetailView({ item, kind, role, perms, capsulas, onBack, onUpdateItem, onPromote, notify, onLogHistorial, capsula, stages, currentUser, config, cronogramaMuestras, onSendTaller, onUpdateTaller, onCrearEnvio, protos }) {
  const [tab, setTab] = useState("overview");
  const [showEdit, setShowEdit] = useState(false);
  const [showEnviado, setShowEnviado] = useState(false);
  const [showTaller, setShowTaller] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [showPrecioCotizacion, setShowPrecioCotizacion] = useState(false);
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
  // Al mandar a "En cotización" se pide el precio en un modal (ver
  // PrecioCotizacionModal) y queda guardado en el mismo patch que el cambio
  // de estado — no en dos escrituras separadas. Además, igual que
  // handleMarcarPreparada avanza la Ruta Crítica a "Por Enviar", este botón
  // avanza la Ruta Crítica a "Cotización" (si todavía no había llegado ahí),
  // para que el letrero bajo la barra se actualice solo, sin tener que
  // además darle "Avanzar →" aparte.
  function handleCotizacion(precio) {
    const targetIdx = stages.findIndex((s) => s.id === "cotizacion");
    const curIdx = stages.findIndex((s) => s.id === item.currentStage);
    const extra = targetIdx >= 0 && targetIdx > curIdx ? { currentStage: "cotizacion", stageStartedAt: today() } : {};
    changeStatus("enviado_cotizacion", { precioCotizacion: precio, ...extra });
  }
  // Solo para referencias de cápsula (kind === "ref"): marca la referencia
  // como lista para enviar SIN crear todavía el envío/bitácora — eso se
  // registra en conjunto, una sola vez, cuando TODAS las referencias de la
  // cápsula lleguen a este estado (ver CapsulasView). De paso, si existe la
  // etapa "Por Enviar" en la barra de etapas y esta referencia todavía no
  // llegó ahí, la avanza — así la barra refleja visualmente que ya está en
  // la recta final, después de Confección.
  function handleMarcarPreparada() {
    const targetIdx = stages.findIndex((s) => s.id === "por_enviar");
    const curIdx = stages.findIndex((s) => s.id === item.currentStage);
    const extra = targetIdx >= 0 && targetIdx > curIdx ? { currentStage: "por_enviar", stageStartedAt: today() } : {};
    changeStatus("preparada_para_enviar", extra);
  }
  // Deshacer un "Marcar Preparada para Enviar" hecho por error: regresa a
  // "Enviar al Cliente" y, si la etapa había avanzado automáticamente a "Por
  // Enviar", la retrocede a la etapa anterior (simétrico a handleMarcarPreparada).
  function handleDesmarcarPreparada() {
    const porEnviarIdx = stages.findIndex((s) => s.id === "por_enviar");
    const extra =
      porEnviarIdx > 0 && item.currentStage === "por_enviar"
        ? { currentStage: stages[porEnviarIdx - 1].id, stageStartedAt: today() }
        : {};
    changeStatus("enviar_cliente", extra);
  }
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
  // Deshace un Aprobado/Declinado hecho por error (ej. la Directora Creativa
  // le dio "Aprobar" a una ilustración que en realidad todavía no estaba
  // lista) — vuelve a "En proceso" para que el flujo normal (Aprobar/
  // Declinar/En revisión) quede disponible de nuevo. Antes, una vez el
  // estado llegaba a "aprobado"/"declinado" no había NINGÚN botón para
  // corregirlo — quedaba trabado ahí para siempre.
  function deshacerAprobacion() {
    const obs = { id: uid(), user: currentUser, role, text: `Se deshizo el estado "${STATUS[st]?.label}" — vuelve a "En proceso".`, date: nowISO(), type: "update", done: false };
    patch({ status: "en_proceso", observations: [...item.observations, obs] });
  }
  // Enviar UNA sola referencia desde el Detalle pasa por el MISMO mecanismo
  // que el envío por casillas (crearEnvioBitacora) — así cualquier envío,
  // individual o agrupado, siempre queda registrado en la Bitácora, sin dos
  // caminos distintos que confundan (antes esto solo cambiaba el estado
  // localmente y no dejaba nada en la Bitácora).
  function handleEnviado(transporteData) {
    const header = {
      coleccion: kind === "ref" ? capsula?.name || "" : item.name || "",
      cliente: item.cliente || item.colores?.[0] || "",
      numPedido: "",
      fechaEnviado: transporteData.fecha,
      empresaTransporte: transporteData.empresa,
      guia: transporteData.guia || "",
      cartaColores: null,
    };
    const itemConDatos = { ...item, kind, capsulaId: kind === "ref" ? capsula?.id : null };
    onCrearEnvio(header, [itemConDatos]);
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
    // Llegar a la etapa de Cotización con "Avanzar →" pasa por el mismo
    // modal de precio que el botón "📤 Cotización" de abajo — así el
    // letrero de Ruta Crítica y la insignia de estado (arriba a la derecha)
    // siempre quedan sincronizados, sin importar por cuál de los dos
    // caminos se llegue. Si el estado ya venía de cotización en adelante
    // (por ejemplo, se retrocedió y se vuelve a avanzar), no hace falta
    // repetir el modal.
    if (next.id === "cotizacion" && !["enviado_cotizacion", "enviar_cliente", "preparada_para_enviar", "enviado"].includes(st)) {
      setShowPrecioCotizacion(true);
      return;
    }
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
      {showEdit && kind === "ref" && <EditRefModal refData={item} config={config} protos={protos} onSave={(p) => onUpdateItem(p)} onClose={() => setShowEdit(false)} />}
      {showEnviado && <EnviadoModal onSave={handleEnviado} onClose={() => setShowEnviado(false)} />}
      {showTaller && <EnviarTallerModal item={item} existing={tallerMasReciente?.estado !== "enviado" ? tallerMasReciente : null} ultimoTaller={tallerMasReciente} config={config} onSave={handleGuardarTaller} onClose={() => setShowTaller(false)} />}
      {showRevision && <NotaRevisionModal onSave={handleMarcarRevision} onClose={() => setShowRevision(false)} />}
      {showPrecioCotizacion && <PrecioCotizacionModal item={item} onSave={(precio) => { handleCotizacion(precio); setShowPrecioCotizacion(false); }} onClose={() => setShowPrecioCotizacion(false)} />}
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
            {/* Escape hatch para un Aprobar/Declinar hecho por error: mismo
                permiso que revisa Ilustración (Directora Creativa) o admin
                general, no cualquiera con permiso de aprobar/declinar. */}
            {!noFinalState && (canAdmin || canRevisarIlustracion) && (
              <Btn variant="secondary" onClick={deshacerAprobacion}>↩ Deshacer {st === "aprobado" ? "aprobación" : "declinación"}</Btn>
            )}
            {canAdmin && (
              <>
                {noFinalState && !["enviado_cotizacion", "enviar_cliente", "preparada_para_enviar", "enviado"].includes(st) && (
                  <>
                    <Btn variant="ghost" onClick={() => changeStatus("en_proceso")}>En proceso</Btn>
                    {item.currentStage !== "ilustracion" && (
                      <Btn variant="amber" onClick={() => changeStatus("en_revision")}>En revisión</Btn>
                    )}
                  </>
                )}
                {noFinalState && st !== "enviado_cotizacion" && st !== "enviar_cliente" && st !== "preparada_para_enviar" && st !== "enviado" && <Btn variant="ghost" onClick={() => setShowPrecioCotizacion(true)}>📤 Cotización</Btn>}
                {/* Píldora del precio cotizado: visible desde que se manda a
                    cotización en adelante (todo el tramo de envío), y
                    editable con un clic mientras no esté ya Enviado. */}
                {item.precioCotizacion != null && ["enviado_cotizacion", "enviar_cliente", "preparada_para_enviar", "enviado"].includes(st) && (
                  <button
                    onClick={() => st !== "enviado" && setShowPrecioCotizacion(true)}
                    style={{ padding: "9px 18px", background: T.violetBg, color: T.violet, border: `1.5px solid ${T.violet}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: st !== "enviado" ? "pointer" : "default" }}
                  >
                    💲 {fmtCOP(item.precioCotizacion)}
                  </button>
                )}
                {st === "enviado_cotizacion" && <button onClick={() => changeStatus("enviar_cliente")} style={{ padding: "9px 18px", background: "#ECFEFF", color: "#0E7490", border: "1.5px solid #0E7490", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✈ Enviar al Cliente</button>}
                {/* Un prototipo suelto sigue enviándose solo (abre el modal de
                    Registrar Envío de una vez). Una referencia DENTRO de una
                    cápsula, en cambio, no se envía sola: el clic solo la deja
                    "preparada para enviar" — el envío real de la cápsula se
                    registra en conjunto desde CapsulasView cuando TODAS sus
                    referencias lleguen a ese estado. */}
                {st === "enviar_cliente" && kind === "proto" && <button onClick={() => setShowEnviado(true)} style={{ padding: "9px 18px", background: "#EFF6FF", color: "#0369A1", border: "1.5px solid #0369A1", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📦 Registrar Envío</button>}
                {st === "enviar_cliente" && kind === "ref" && <button onClick={handleMarcarPreparada} style={{ padding: "9px 18px", background: T.jadeBg, color: T.jade, border: `1.5px solid ${T.jade}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✅ Marcar Preparada para Enviar</button>}
                {st === "preparada_para_enviar" && kind === "ref" && (
                  <>
                    <span style={{ padding: "9px 18px", background: T.jadeBg, color: T.jade, border: `1.5px solid ${T.jade}`, borderRadius: 8, fontWeight: 700, fontSize: 13 }}>✅ Preparada — se envía junto con la cápsula</span>
                    <Btn variant="ghost" onClick={handleDesmarcarPreparada}>← Deshacer</Btn>
                  </>
                )}
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
              ...(kind === "ref" && item.pedidoVinculado
                ? [{ label: "Pedido Vinculado", value: `#${item.pedidoVinculado.numero}${item.pedidoVinculado.cliente ? ` — ${item.pedidoVinculado.cliente}` : ""}` }]
                : []),
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
          {(item.silueta || item.mes) && <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{item.silueta}{item.rango ? ` · ${item.rango}` : ""}{item.mes ? ` · ${item.mes}` : ""}</div>}
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
  const [mesFiltro, setMesFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
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
  // Solo se listan los clientes que tienen al menos un prototipo activo
  // ahora mismo (conteoPorCliente > 0) — antes se mostraba TODO el maestro
  // de Clientes de Administrador General, aunque el cliente no tuviera nada
  // pendiente, lo que hacía el desplegable innecesariamente largo.
  const clientesDisponibles = Object.keys(conteoPorCliente).sort((a, b) => a.localeCompare(b));
  // Mismo criterio que clientesDisponibles pero por mes — solo meses con al
  // menos un prototipo activo, ordenados por el orden calendario (MONTHS_ES)
  // y no alfabético.
  const conteoPorMes = {};
  protosActivos.forEach((p) => {
    if (!p.mes) return;
    conteoPorMes[p.mes] = (conteoPorMes[p.mes] || 0) + 1;
  });
  const mesesDisponibles = MONTHS_ES.filter((m) => conteoPorMes[m] > 0);
  // "Todos" oculta Aprobados/Promovidos/Declinados para no saturar el tablero
  // (un prototipo promovido sigue con status "aprobado", así que basta con
  // excluir aprobado/declinado). Siguen disponibles en sus propias pestañas.
  const porEstado = filter === "todos" ? protos.filter((p) => !["aprobado", "declinado"].includes(p.status)) : protos.filter((p) => p.status === filter);
  const porCliente = clienteFiltro === "todos" ? porEstado : porEstado.filter((p) => (p.cliente || p.colores?.[0]) === clienteFiltro);
  const porMes = mesFiltro === "todos" ? porCliente : porCliente.filter((p) => p.mes === mesFiltro);
  const busquedaNorm = busqueda.trim().toLowerCase();
  const filtered = !busquedaNorm ? porMes : porMes.filter((p) =>
    (p.name || "").toLowerCase().includes(busquedaNorm) ||
    (p.reference || "").toLowerCase().includes(busquedaNorm) ||
    (p.cliente || "").toLowerCase().includes(busquedaNorm) ||
    (p.colores || []).some((c) => (c || "").toLowerCase().includes(busquedaNorm))
  );
  return (
    <div>
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar el prototipo <strong>"{confirmDel.name}"</strong>? Queda en la Papelera (Administración) por si hay que restaurarlo.</div>
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
        <span style={{ fontSize: 12, fontWeight: 700, color: T.slate, marginLeft: 8 }}>📅 Mes</span>
        <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} style={{ padding: "7px 12px", border: `1.5px solid ${mesFiltro !== "todos" ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, color: mesFiltro !== "todos" ? T.denim : T.ink, background: mesFiltro !== "todos" ? T.denimBg : T.white, outline: "none", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
          <option value="todos">Todos</option>
          {mesesDisponibles.map((m) => <option key={m} value={m}>{m} ({conteoPorMes[m] || 0})</option>)}
        </select>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre, referencia o cliente..."
          style={{ padding: "7px 12px", border: `1.5px solid ${busqueda ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, minWidth: 240, outline: "none", fontFamily: "inherit" }}
        />
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
function CapsulasView({ capsulas, role, perms, currentUser, onSelectRef, onNewCapsula, onNewRef, onEditCapsula, stages, isAdmin, onDeleteCapsula, onDeleteRef, config, onSetIlustracion, onSendObsCapsula, onMarkDoneObsCapsula, onCrearEnvio }) {
  const [filter, setFilter] = useState("todos");
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [mesFiltro, setMesFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [editCap, setEditCap] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  // Confirmación para borrar UNA referencia dentro de una cápsula (no la
  // cápsula completa) — guarda { capId, ref } del renglón que se va a borrar.
  const [confirmDelRef, setConfirmDelRef] = useState(null);
  const [revisionCap, setRevisionCap] = useState(null);
  const [obsCapsula, setObsCapsula] = useState(null);
  // Selección múltiple para armar un envío/bitácora agrupado — una selección
  // por cápsula (cada cápsula es su propia "colección"), solo tiene sentido
  // en la pestaña "Enviar al Cliente". `envioCapsula` guarda la cápsula para
  // la que se está armando el envío (para saber qué referencias mostrar en
  // el modal).
  const [seleccionados, setSeleccionados] = useState({});
  const [envioCapsula, setEnvioCapsula] = useState(null);
  // Cada cápsula arranca colapsada (solo se ve su nombre/encabezado) — clic
  // en el encabezado despliega la grilla de referencias. `expandidas` guarda
  // qué cápsulas están abiertas, por id.
  const [expandidas, setExpandidas] = useState({});
  function toggleExpandCapsula(capId) { setExpandidas((e) => ({ ...e, [capId]: !e[capId] })); }
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
  // Referencias de la cápsula que van "rumbo a envío" — se ignoran las que ya
  // quedaron Aprobadas o Declinadas, porque esas nunca pasan por el flujo de
  // envío al cliente. La cápsula se considera lista para un envío agrupado
  // cuando TODAS esas referencias relevantes llegaron a "preparada_para_enviar".
  function refsRumboAEnvio(cap) {
    return cap.referencias.filter((r) => !["aprobado", "declinado"].includes(r.status));
  }
  function capsulaListaParaEnviar(cap) {
    const relevantes = refsRumboAEnvio(cap);
    return relevantes.length > 0 && relevantes.every((r) => r.status === "preparada_para_enviar");
  }
  // Preselecciona automáticamente TODAS las referencias "preparada_para_enviar"
  // de la cápsula (sin que el usuario tenga que ir a la pestaña "Enviar al
  // Cliente" a marcarlas una por una) y abre el mismo modal de envío agrupado
  // que ya existe.
  function enviarCapsulaCompleta(cap) {
    const ids = cap.referencias.filter((r) => r.status === "preparada_para_enviar").map((r) => r.id);
    setSeleccionados((s) => ({ ...s, [cap.id]: ids }));
    setEnvioCapsula(cap);
  }
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
  // Solo se listan los clientes que tienen al menos una cápsula activa
  // ahora mismo (conteoPorCliente > 0) — antes se mostraba TODO el maestro
  // de Clientes de Administrador General, aunque el cliente no tuviera nada
  // pendiente, lo que hacía el desplegable innecesariamente largo.
  const clientesDisponibles = Object.keys(conteoPorCliente).sort((a, b) => a.localeCompare(b));
  // Mismo criterio que conteoPorCliente pero por mes — el mes vive a nivel de
  // cápsula (no por referencia), así que se cuenta directo sobre cap.mes.
  const conteoPorMes = {};
  capsulasActivas.forEach((cap) => {
    if (!cap.mes) return;
    conteoPorMes[cap.mes] = (conteoPorMes[cap.mes] || 0) + 1;
  });
  const mesesDisponibles = MONTHS_ES.filter((m) => conteoPorMes[m] > 0);
  // "Todos" oculta referencias Aprobadas/Declinadas (y cápsulas que solo
  // tengan referencias en esos estados) para no saturar el tablero. Siguen
  // disponibles en las pestañas "Aprobadas"/"Declinadas". El filtro de
  // cliente y el de mes se combinan (AND) con el de estado.
  const busquedaNorm = busqueda.trim().toLowerCase();
  function filteredRefs(cap) {
    let refs = filter === "todos" ? cap.referencias.filter((r) => !["aprobado", "declinado"].includes(r.status)) : cap.referencias.filter((r) => r.status === filter);
    if (clienteFiltro !== "todos") refs = refs.filter((r) => refCliente(cap, r) === clienteFiltro);
    if (mesFiltro !== "todos") refs = mesFiltro === cap.mes ? refs : [];
    if (busquedaNorm) {
      // Si el nombre/cliente de la cápsula ya calza con la búsqueda, se
      // muestran todas sus referencias (ya filtradas arriba); si no, se
      // filtra referencia por referencia (nombre, código o cliente propio).
      const capCalza = (cap.name || "").toLowerCase().includes(busquedaNorm) || (capCliente(cap) || "").toLowerCase().includes(busquedaNorm);
      if (!capCalza) {
        refs = refs.filter((r) =>
          (r.name || "").toLowerCase().includes(busquedaNorm) ||
          (r.reference || "").toLowerCase().includes(busquedaNorm) ||
          (refCliente(cap, r) || "").toLowerCase().includes(busquedaNorm)
        );
      }
    }
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
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar la cápsula <strong>"{confirmDel.name}"</strong> y sus {confirmDel.referencias?.length || 0} referencia{confirmDel.referencias?.length !== 1 ? "s" : ""}? Queda en la Papelera (Administración) por si hay que restaurarla.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { onDeleteCapsula(confirmDel.id); setConfirmDel(null); }}>Sí, eliminar</Btn>
            </div>
          </div>
        </div>
      )}
      {confirmDelRef && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar la referencia <strong>"{confirmDelRef.ref.reference}"</strong> ({confirmDelRef.ref.name})? Solo se borra esta referencia — el resto de la cápsula sigue intacta, y queda en la Papelera (Administración) por si hay que restaurarla.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDelRef(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { onDeleteRef(confirmDelRef.capId, confirmDelRef.ref.id); setConfirmDelRef(null); }}>Sí, eliminar</Btn>
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
        <span style={{ fontSize: 12, fontWeight: 700, color: T.slate, marginLeft: 8 }}>📅 Mes</span>
        <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} style={{ padding: "7px 12px", border: `1.5px solid ${mesFiltro !== "todos" ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, color: mesFiltro !== "todos" ? T.denim : T.ink, background: mesFiltro !== "todos" ? T.denimBg : T.white, outline: "none", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
          <option value="todos">Todos</option>
          {mesesDisponibles.map((m) => <option key={m} value={m}>{m} ({conteoPorMes[m] || 0})</option>)}
        </select>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por cápsula, referencia o cliente..."
          style={{ padding: "7px 12px", border: `1.5px solid ${busqueda ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, minWidth: 240, outline: "none", fontFamily: "inherit" }}
        />
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
              <div onClick={() => toggleExpandCapsula(cap.id)} title={expandidas[cap.id] ? "Clic para colapsar" : "Clic para ver las referencias"} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <span style={{ fontSize: 12, color: T.slate, width: 14, display: "inline-block" }}>{expandidas[cap.id] ? "▾" : "▸"}</span>
                <span style={{ fontSize: 20 }}>🗂</span>
                <div><div style={{ fontWeight: 800, fontSize: 16, color: T.ink }}>{cap.name}</div><div style={{ fontSize: 12, color: T.slate }}>{cap.cliente ? `${cap.cliente} · ` : ""}{cap.mes ? `${cap.mes} · ` : ""}{cap.season} · {cap.referencias.length} ref · {cap.createdAt}{cap.assignedTo ? ` · 👤 ${cap.assignedTo}` : ""}</div></div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {od > 0 && <span style={{ padding: "3px 10px", background: T.coralBg, color: T.coral, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>⚑ {od}</span>}
                {!aprobada && <span title="La ilustración/concepto de la cápsula debe ser aprobado antes de poder agregarle referencias" style={{ padding: "3px 10px", background: estadoIlustracion.bg, color: estadoIlustracion.color, borderRadius: 6, fontSize: 11, fontWeight: 700 }}>🎨 {estadoIlustracion.label}{rondasIlustracion > 0 ? ` · ${rondasIlustracion} revisión${rondasIlustracion !== 1 ? "es" : ""}` : ""}</span>}
                {/* Cuando TODA la cápsula (todas sus referencias rumbo a
                    envío) ya está "preparada_para_enviar", este botón
                    reemplaza a "Observaciones" — deja de tener sentido pedir
                    observaciones de ilustración a esta altura, y es el
                    momento de registrar el envío agrupado de una vez. En
                    cualquier otro momento, "Observaciones" se muestra normal. */}
                {capsulaListaParaEnviar(cap) ? (
                  <button onClick={() => enviarCapsulaCompleta(cap)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: T.jade, color: T.white, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    📦 Registrar Envío de Cápsula
                  </button>
                ) : (
                  <Btn small variant="ghost" onClick={() => setObsCapsula(cap)}>💬 Observaciones{cap.observacionesIlustracion?.length ? ` (${cap.observacionesIlustracion.length})` : ""}</Btn>
                )}
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
            {expandidas[cap.id] && (!refs.length ? (
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
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelRef({ capId: cap.id, ref: r }); }}
                        title="Eliminar esta referencia"
                        style={{ position: "absolute", top: 8, right: 8, zIndex: 2, width: 24, height: 24, borderRadius: 6, border: "none", background: T.coralBg, color: T.coral, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        🗑
                      </button>
                    )}
                    <Card item={r} kind="ref" onClick={() => onSelectRef(cap.id, r.id)} role={role} perms={perms} stages={stages} />
                  </div>
                ))}
              </div>
            ))}
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
  // Cuántas muestras tiene cada taller en este momento (ni aprobadas ni ya
  // enviadas al cliente) — para ver de un vistazo qué taller está saturado
  // antes de mandarle una muestra nueva.
  const cargaPorTaller = (() => {
    const activos = cronogramaMuestras.filter((c) => c.estado !== "aprobado" && c.estado !== "enviado");
    const mapa = new Map();
    activos.forEach((c) => {
      const t = c.taller || "(Sin taller)";
      mapa.set(t, (mapa.get(t) || 0) + 1);
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  })();
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
  // Tablero Kanban: alternativa al calendario — una columna por estado
  // (Sin asignar/Asignado/Modificar/Aprobado/Enviado) con TODAS las muestras
  // de esa columna, sin importar fecha ni la pestaña Activas/Aprobadas
  // (por eso esa pestaña se oculta mientras esta vista está activa).
  function renderTablero() {
    const cols = Object.entries(ESTADO_MUESTRA);
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length},1fr)`, gap: 12, alignItems: "start" }}>
        {cols.map(([estKey, def]) => {
          const items = cronogramaMuestras
            .filter((c) => (c.estado || "pendiente") === estKey)
            .sort((a, b) => (a.fechaEntrega || "9999").localeCompare(b.fechaEntrega || "9999"));
          return (
            <div key={estKey} style={{ background: T.canvas, borderRadius: 10, padding: 10, minHeight: 120, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: def.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{def.label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: def.color, background: def.bg, borderRadius: 10, padding: "1px 7px" }}>{items.length}</span>
              </div>
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
      {cargaPorTaller.length > 0 && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: T.white, borderRadius: 12, border: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: T.slate, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>🏭 Muestras en Planta (activas por taller)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cargaPorTaller.map(([taller, n]) => (
              <span key={taller} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: n >= 5 ? T.coralBg : T.amberBg, color: n >= 5 ? T.coral : T.amber }}>
                {taller} · {n}
              </span>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        {vista !== "tablero" ? (
          <div style={{ display: "flex", gap: 6 }}>
            {[["activas", "Activas"], ["aprobadas", "✓ Aprobadas (Historial)"]].map(([v, label]) => (
              <button key={v} onClick={() => setTab(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${tab === v ? T.denim : T.border}`, background: tab === v ? T.denimBg : T.white, color: tab === v ? T.denim : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        ) : <div />}
        <div style={{ display: "flex", gap: 6 }}>
          {[["semana", "Semana"], ["mes", "Mes"], ["tablero", "🗂 Tablero"]].map(([v, label]) => (
            <button key={v} onClick={() => setVista(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${vista === v ? T.ink : T.border}`, background: vista === v ? T.ink : T.white, color: vista === v ? T.white : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>
      {vista !== "tablero" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <button onClick={() => (vista === "semana" ? setWeekOffset((o) => o - 1) : setMonthOffset((o) => o - 1))} style={{ padding: "6px 12px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, color: T.ink }}>← Anterior</button>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.ink, textTransform: "capitalize" }}>{rangoLabel}</div>
          <button onClick={() => (vista === "semana" ? setWeekOffset((o) => o + 1) : setMonthOffset((o) => o + 1))} style={{ padding: "6px 12px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, color: T.ink }}>Siguiente →</button>
        </div>
      )}
      {vista === "tablero" ? renderTablero() : vista === "semana" ? renderWeekRow(semanaMonday, "w") : semanasDelMes.map((m, i) => renderWeekRow(m, i))}
      {vista !== "tablero" && sinFecha.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: T.slate, marginBottom: 10 }}>🗓 Sin fecha de entrega asignada ({sinFecha.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
            {sinFecha.map(renderCard)}
          </div>
        </div>
      )}
      {vista !== "tablero" && !visibles.length && <div style={{ textAlign: "center", padding: 40, color: T.slate, fontSize: 14 }}>{tab === "activas" ? "No hay muestras activas." : "Todavía no hay muestras aprobadas."}</div>}
      {vista === "tablero" && !cronogramaMuestras.length && <div style={{ textAlign: "center", padding: 40, color: T.slate, fontSize: 14 }}>No hay muestras en el cronograma.</div>}
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
// Exporta un envío de la Bitácora a Excel reproduciendo EXACTAMENTE el
// layout del ANEXO que el cliente ya conoce (el archivo de ejemplo que
// subieron: "COLECCIÓN KAMILA GIRLS N°2..."): 4 filas de encabezado (nombre
// de colección; fecha enviado/recibido y marca/n° pedido; encabezados de
// columna; sub-encabezados CURVA/CANTIDAD bajo COLOMBIA y VENEZUELA) y luego
// una fila por referencia, en las mismas 17 columnas (A-Q) y en el mismo
// orden que ese archivo. La librería "xlsx" (SheetJS, edición community) que
// ya usa el resto de la app no soporta incrustar imágenes, así que
// Foto/Carta de Colores quedan como nota de texto en vez de la imagen real
// (que sí se ve dentro de la app, en la Bitácora).
async function exportBitacoraEnvioToExcel(envio) {
  // "xlsx-js-style" es un fork de SheetJS (mismo núcleo 0.18.5 que ya usa el
  // resto de la app, mismo API) que además soporta escribir estilos de
  // celda (relleno, fuente, bordes) — la librería "xlsx" normal (edición
  // community) no permite esto al generar el archivo. Se usa SOLO aquí, sin
  // tocar los demás exportadores de la app, que siguen igual con "xlsx".
  const XLSX = await import("xlsx-js-style");
  // Los campos de cantidad/precio se escriben como número (no texto) cuando
  // se puede — así el numFmt de moneda de más abajo realmente se ve en
  // Excel (un numFmt sobre una celda de texto no tiene efecto visual), y de
  // paso el cliente puede sumarlos directamente en la hoja si quiere.
  function numOTexto(v) {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  }
  const wsData = [
    ["COLECCIÓN (NOMBRE)", envio.coleccion || "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["FECHA ENVIADO", envio.fechaEnviado || "", "", "", "FECHA RECIBIDO CLIENTE", envio.fechaRecibidoCliente || "", "", "", "", "MARCA", envio.cliente || "", "", "", "N° PEDIDO", envio.numPedido || "", "", ""],
    ["FOTO", "REF", "ESTADO", "CONSUMO", "TIPO", "CATEGORIA", "SILUETA", "RANGO (TALLA)", "TELA", "COLOMBIA", "", "VENEZUELA", "", "PRECIO $", "OBSERVACIONES CLIENTE", "", "CARTA DE COLORES"],
    ["", "", "", "", "", "", "", "", "", "CURVA ", "CANTIDAD", "CURVA", "CANTIDAD", "", "", "", ""],
    ...envio.items.map((it) => [
      it.foto ? "(ver en la app)" : "",
      it.referencia || "",
      it.estado || "",
      it.consumo || "",
      it.tipo || "",
      it.categoria || "",
      it.silueta || "",
      it.rango || "",
      it.tela || "",
      it.colombiaCurva || "",
      numOTexto(it.colombiaCantidad),
      it.venezuelaCurva || "",
      numOTexto(it.venezuelaCantidad),
      numOTexto(it.precio),
      it.observacionesCliente || "",
      "",
      envio.cartaColores ? "(ver en la app)" : "",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  // Réplica exacta de las fusiones de celdas del archivo de ejemplo: las
  // celdas de VALOR de la fila 1-2 (colección, fecha enviado, fecha
  // recibido, marca, n° pedido) se fusionan para dar espacio al texto;
  // COLOMBIA/VENEZUELA/OBSERVACIONES CLIENTE ocupan 2 columnas en la fila de
  // encabezado; las columnas de un solo valor (Foto, Ref, Estado...) quedan
  // fusionadas verticalmente entre la fila de encabezado y la de
  // sub-encabezado (CURVA/CANTIDAD); y Observaciones Cliente sigue
  // ocupando 2 columnas en cada fila de datos, igual que en el original.
  ws["!merges"] = [
    { s: { r: 0, c: 1 }, e: { r: 0, c: 16 } }, // valor Colección
    { s: { r: 1, c: 1 }, e: { r: 1, c: 3 } }, // valor Fecha Enviado
    { s: { r: 1, c: 4 }, e: { r: 1, c: 5 } }, // etiqueta Fecha Recibido Cliente
    { s: { r: 1, c: 6 }, e: { r: 1, c: 8 } }, // valor Fecha Recibido Cliente
    { s: { r: 1, c: 10 }, e: { r: 1, c: 12 } }, // valor Marca
    { s: { r: 1, c: 14 }, e: { r: 1, c: 16 } }, // valor N° Pedido
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
    { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } },
    { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } },
    { s: { r: 2, c: 5 }, e: { r: 3, c: 5 } },
    { s: { r: 2, c: 6 }, e: { r: 3, c: 6 } },
    { s: { r: 2, c: 7 }, e: { r: 3, c: 7 } },
    { s: { r: 2, c: 8 }, e: { r: 3, c: 8 } },
    { s: { r: 2, c: 9 }, e: { r: 2, c: 10 } },
    { s: { r: 2, c: 11 }, e: { r: 2, c: 12 } },
    { s: { r: 2, c: 13 }, e: { r: 3, c: 13 } },
    { s: { r: 2, c: 14 }, e: { r: 3, c: 15 } },
    { s: { r: 2, c: 16 }, e: { r: 3, c: 16 } },
    ...envio.items.map((_, i) => ({ s: { r: 4 + i, c: 14 }, e: { r: 4 + i, c: 15 } })),
  ];
  ws["!cols"] = [
    { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 11 }, { wch: 13 },
    { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 24 }, { wch: 4 }, { wch: 14 },
  ];
  ws["!rows"] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 24 }, { hpt: 20 }, ...envio.items.map(() => ({ hpt: 36 }))];
  // Colores de marca de ATLAS (mismos tokens T.* que usa el resto de la
  // app): fondo oscuro + texto beige en los encabezados, filas de datos
  // alternadas para que sea más fácil seguir cada referencia, y un borde
  // fino en toda la tabla — igual a como se ve el "Informe de Seguimiento" y
  // los demás informes dentro de la app, pero ahora también en el Excel.
  const COLOR_INK = "1A1A2E";
  const COLOR_SEAM = "C8B8A2";
  const COLOR_CANVAS = "F7F4F0";
  const COLOR_BORDER = "E8E2DB";
  const THIN = { style: "thin", color: { rgb: COLOR_BORDER } };
  const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
  const COLS_CENTRADAS = new Set([0, 1, 2, 3, 4, 6, 7, 9, 10, 11, 12, 13, 16]);
  const totalCols = 17;
  const totalRows = wsData.length;
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      const centrada = COLS_CENTRADAS.has(c);
      let style = { border: BOX, alignment: { vertical: "center", horizontal: centrada ? "center" : "left", wrapText: true } };
      if (r === 0) {
        // Título — nombre de la colección.
        style.font = { bold: true, sz: 13, color: { rgb: COLOR_INK } };
        style.fill = { patternType: "solid", fgColor: { rgb: COLOR_CANVAS } };
      } else if (r === 1) {
        // Fila de etiquetas (Fecha Enviado / Recibido, Marca, N° Pedido).
        const esEtiqueta = c === 0 || c === 4 || c === 9 || c === 13;
        style.font = { bold: esEtiqueta, sz: 11, color: { rgb: COLOR_INK } };
        if (esEtiqueta) style.fill = { patternType: "solid", fgColor: { rgb: COLOR_CANVAS } };
      } else if (r === 2 || r === 3) {
        // Encabezados de columna (FOTO/REF/...) y sub-encabezados (CURVA/CANTIDAD).
        style.fill = { patternType: "solid", fgColor: { rgb: COLOR_INK } };
        style.font = { bold: true, sz: 10, color: { rgb: COLOR_SEAM } };
        style.alignment = { vertical: "center", horizontal: "center", wrapText: true };
      } else {
        // Filas de datos, alternadas.
        const filaDato = r - 4;
        style.fill = { patternType: "solid", fgColor: { rgb: filaDato % 2 === 0 ? "FFFFFF" : COLOR_CANVAS } };
        style.font = { sz: 10, color: { rgb: COLOR_INK } };
        if (c === 13 && ws[addr].v !== "") style.numFmt = "$#,##0";
      }
      ws[addr].s = style;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ANEXO");
  const nombreArchivo = `Envio_${(envio.coleccion || envio.cliente || "bitacora").replace(/[^a-zA-Z0-9]+/g, "_")}_${envio.fechaEnviado || today()}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}
// Envuelve las dos bitácoras (Envíos / Aprobados sin Pedido) en pestañas
// dentro de un solo ítem de menú "Bitácoras" — antes eran dos entradas
// sueltas, ahora comparten pantalla como ya hace Historial con sus propias
// pestañas internas.
function BitacorasView(props) {
  const [tab, setTab] = useState("envios");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[["envios", "📦 Bitácora de Envíos"], ["sin_pedido", "🚫 Bitácora de Aprobados sin Pedido"]].map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${tab === v ? T.ink : T.border}`, background: tab === v ? T.ink : T.white, color: tab === v ? T.white : T.ink, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      {tab === "envios" ? <BitacoraEnviosView {...props} /> : <BitacoraAprobadosSinPedidoView {...props} />}
    </div>
  );
}
function BitacoraEnviosView({ envios, onUpdateEnvio, protos, capsulas, historial, onGoHistorial }) {
  const [subTab, setSubTab] = useState("pendientes");
  const [kindFiltro, setKindFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [mesFiltro, setMesFiltro] = useState("");
  const [expandido, setExpandido] = useState(null);
  // Envío puntual abierto en ventana de detalle (dentro del listado "Envíos
  // incluidos en este grupo") — al agrupar por cápsula, esa lista muestra
  // varios envíos idénticos a simple vista (misma fecha/transporte, cada uno
  // de una sola referencia); con esto se ve la referencia en la fila y se
  // puede abrir el detalle completo de ESE envío puntual con un clic.
  const [envioDetalle, setEnvioDetalle] = useState(null);
  const hoy = new Date();
  const hoyIso = hoy.toISOString().slice(0, 10);
  function diasDesde(fechaISO) {
    if (!fechaISO) return null;
    const d = new Date(fechaISO);
    if (isNaN(d.getTime())) return null;
    return Math.floor((hoy - d) / 86400000);
  }
  // Busca el prototipo/referencia VIVO detrás de cada ítem del envío (por
  // itemId/capsulaId) para saber su estado ACTUAL — el "estado" guardado en
  // el envío es solo la foto del momento en que se mandó, no se actualiza.
  function liveItemFor(it) {
    if (it.kind === "proto") return protos.find((p) => p.id === it.itemId);
    const cap = capsulas.find((c) => c.id === it.capsulaId);
    return cap?.referencias.find((r) => r.id === it.itemId);
  }
  function itemResuelto(it) {
    const live = liveItemFor(it);
    return !!live && ["aprobado", "declinado"].includes(live.status);
  }
  // Cada envío se enriquece con: cuántas de sus referencias siguen sin
  // resolver, hace cuántos días se envió (solo relevante si sigue habiendo
  // pendientes), y si es de prototipos o de cápsula (según sus items — un
  // envío siempre sale homogéneo, se arma desde Prototipos o desde Cápsulas,
  // nunca mezclado).
  const enriquecidos = envios.map((envio) => {
    const pendientes = envio.items.filter((it) => !itemResuelto(it));
    const dias = pendientes.length ? diasDesde(envio.fechaEnviado) : null;
    const kind = envio.items[0]?.kind === "proto" ? "proto" : "ref";
    return { ...envio, _pendientes: pendientes.length, _dias: dias, _kind: kind };
  });
  const q = busqueda.trim().toLowerCase();
  const mesDe = (e) => (e.fechaEnviado || "").slice(0, 7);
  const base = enriquecidos.filter(
    (e) =>
      (!q || (e.coleccion || "").toLowerCase().includes(q) || (e.cliente || "").toLowerCase().includes(q) || (e.numPedido || "").toLowerCase?.().includes(q)) &&
      (!mesFiltro || mesDe(e) === mesFiltro)
  );
  // Agrupa por cápsula (mismo capsulaId) los envíos que se mandaron por
  // separado — antes cada clic en "Enviado" de UNA sola referencia (desde su
  // Detalle, en vez de usar "Enviar cápsula completa") creaba su propio
  // registro en la Bitácora, y una misma cápsula terminaba repetida muchas
  // veces si se fueron mandando las referencias en días distintos. Ahora se
  // juntan todas bajo un solo folder por cápsula, sin importar cuándo se
  // mandó cada una — al abrirlo se ve el detalle de cada envío incluido y
  // todas las referencias juntas. Los prototipos NO se agrupan (cada envío
  // de prototipo sigue siendo su propia fila, como antes).
  const gruposMap = new Map();
  base.forEach((e) => {
    const capId = e._kind === "ref" ? e.items[0]?.capsulaId : null;
    const key = capId ? `cap:${capId}` : e._kind === "ref" ? `col:${(e.coleccion || "").toLowerCase()}|${(e.cliente || "").toLowerCase()}` : `envio:${e.id}`;
    if (!gruposMap.has(key)) gruposMap.set(key, []);
    gruposMap.get(key).push(e);
  });
  const grupos = [...gruposMap.entries()].map(([key, enviosGrupo]) => {
    const items = enviosGrupo.flatMap((e) => e.items.map((it) => ({ ...it, _envioId: e.id, _fechaEnviado: e.fechaEnviado, _empresaTransporte: e.empresaTransporte, _guia: e.guia })));
    const totalUnidades = items.reduce((s, it) => s + (Number(it.colombiaCantidad) || 0) + (Number(it.venezuelaCantidad) || 0), 0);
    const pendientesTotal = enviosGrupo.reduce((s, e) => s + e._pendientes, 0);
    const diasVals = enviosGrupo.map((e) => e._dias).filter((d) => d !== null);
    const diasMax = diasVals.length ? Math.max(...diasVals) : null;
    const fechas = enviosGrupo.map((e) => e.fechaEnviado).filter(Boolean).sort();
    const recibidos = enviosGrupo.filter((e) => e.fechaRecibidoCliente);
    const cartaColores = enviosGrupo.find((e) => e.cartaColores)?.cartaColores || null;
    return {
      key,
      coleccion: enviosGrupo[0].coleccion,
      cliente: enviosGrupo[0].cliente,
      numPedido: enviosGrupo[0].numPedido,
      kind: enviosGrupo[0]._kind,
      envios: enviosGrupo,
      items,
      totalUnidades,
      pendientesTotal,
      diasMax,
      fechaMin: fechas[0],
      fechaMax: fechas[fechas.length - 1],
      recibidosCount: recibidos.length,
      totalEnvios: enviosGrupo.length,
      cartaColores,
    };
  });
  const porTab = subTab === "pendientes" ? grupos.filter((g) => g.pendientesTotal > 0) : grupos;
  const countProto = porTab.filter((g) => g.kind === "proto").length;
  const countCapsula = porTab.filter((g) => g.kind === "ref").length;
  const filtrados = porTab
    .filter((g) => kindFiltro === "todos" || g.kind === kindFiltro)
    .sort((a, b) =>
      subTab === "pendientes"
        ? (b.diasMax ?? 0) - (a.diasMax ?? 0)
        : (b.fechaMax || "").localeCompare(a.fechaMax || "")
    );
  const mesActual = hoyIso.slice(0, 7);
  const declinadasEsteMes = (historial || []).filter((h) => h.resultado === "declinado" && h.mes === mesActual).length;
  const mesesDisponibles = [...new Set(envios.map((e) => mesDe(e)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  function labelMes(m) { return new Date(m + "-02").toLocaleDateString("es-CO", { month: "long", year: "numeric" }); }
  return (
    <div>
      {envioDetalle && (
        <Modal title={`Detalle del envío — ${envioDetalle.items.map((it) => it.referencia).filter(Boolean).join(", ") || "(sin referencia)"}`} onClose={() => setEnvioDetalle(null)} width={640}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>Fecha Enviado</div><div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{envioDetalle.fechaEnviado || "—"}</div></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>Empresa Transporte</div><div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{envioDetalle.empresaTransporte || "—"}</div></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>N° Guía</div><div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{envioDetalle.guia || "—"}</div></div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 4 }}>Fecha Recibido Cliente</div>
              <input
                type="date"
                value={envioDetalle.fechaRecibidoCliente || ""}
                onChange={(e) => { onUpdateEnvio(envioDetalle.id, { fechaRecibidoCliente: e.target.value }); setEnvioDetalle((d) => (d ? { ...d, fechaRecibidoCliente: e.target.value } : d)); }}
                style={{ padding: "6px 10px", border: `1.5px solid ${T.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
              />
            </div>
            {envioDetalle.cartaColores && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 4 }}>Carta de Colores</div>
                <img src={envioDetalle.cartaColores} alt="Carta de colores" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.border}` }} />
              </div>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.ink }}>
                  {["Foto", "Ref", "Nombre", "Estado Actual", "Categoría", "Silueta", "Rango", "Tela", "Curva Col.", "Cant. Col.", "Curva Ven.", "Cant. Ven.", "Precio", "Obs. Cliente"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", color: T.white, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {envioDetalle.items.map((it, i) => {
                  const live = liveItemFor(it);
                  return (
                    <tr key={it.itemId} style={{ background: i % 2 === 0 ? T.canvas : T.white, borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "6px 10px" }}>{it.foto ? <img src={it.foto} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} /> : "—"}</td>
                      <td style={{ padding: "6px 10px", fontWeight: 700 }}>{it.referencia}</td>
                      <td style={{ padding: "6px 10px" }}>{it.nombre}</td>
                      <td style={{ padding: "6px 10px" }}>{live ? <Badge status={live.status} /> : <span style={{ color: T.slate, fontStyle: "italic" }}>—</span>}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {declinadasEsteMes > 0 && onGoHistorial && (
        <div
          onClick={onGoHistorial}
          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", background: T.coralBg, borderRadius: 10, border: `1px solid ${T.coral}44`, marginBottom: 16, fontSize: 13, fontWeight: 700, color: T.coral }}
        >
          ❌ {declinadasEsteMes} declinada{declinadasEsteMes !== 1 ? "s" : ""} este mes · Ver en Historial →
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
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
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[["pendientes", "⏳ Pendientes"], ["todos", "Todos"]].map(([v, label]) => (
          <button key={v} onClick={() => setSubTab(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${subTab === v ? T.denim : T.border}`, background: subTab === v ? T.denimBg : T.white, color: subTab === v ? T.denim : T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["todos", `Todos (${porTab.length})`], ["proto", `Prototipos (${countProto})`], ["ref", `Cápsulas (${countCapsula})`]].map(([v, label]) => (
            <button key={v} onClick={() => setKindFiltro(v)} style={{ padding: "5px 12px", borderRadius: 6, border: `1.5px solid ${kindFiltro === v ? T.ink : T.border}`, background: kindFiltro === v ? T.ink : T.white, color: kindFiltro === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        {mesesDisponibles.length > 0 && (
          <select value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} style={{ padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit", textTransform: "capitalize" }}>
            <option value="">Todos los meses</option>
            {mesesDisponibles.map((m) => <option key={m} value={m}>{labelMes(m)}</option>)}
          </select>
        )}
      </div>
      {!filtrados.length && (
        <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>
          {!envios.length
            ? "Todavía no hay envíos registrados. Se crean desde Prototipos/Cápsulas, pestaña \"Enviar al Cliente\", seleccionando referencias y usando \"Crear Envío\"."
            : subTab === "pendientes"
            ? "No hay envíos con referencias pendientes de aprobación. 🎉"
            : "Ningún envío coincide con la búsqueda."}
        </div>
      )}
      {filtrados.map((g) => {
        const abierto = expandido === g.key;
        return (
          <div key={g.key} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 16, overflow: "hidden" }}>
            <div
              onClick={() => setExpandido(abierto ? null : g.key)}
              style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: T.canvas, cursor: "pointer", flexWrap: "wrap", gap: 10 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{abierto ? "📂" : "📁"}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
                    {g.coleccion || "(Sin nombre de colección)"}
                    <span style={{ fontSize: 10, fontWeight: 700, color: g.kind === "proto" ? T.violet : T.denim, background: g.kind === "proto" ? T.violetBg : T.denimBg, padding: "1px 8px", borderRadius: 10 }}>
                      {g.kind === "proto" ? "Prototipo" : "Cápsula"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: T.slate }}>
                    {g.cliente || "Sin cliente"} · {g.items.length} ref · {fmtNum(g.totalUnidades)} unid. · Enviado {g.fechaMin === g.fechaMax ? g.fechaMin : `${g.fechaMin} – ${g.fechaMax}`}
                    {g.totalEnvios > 1 ? ` · ${g.totalEnvios} envíos` : ""}
                    {g.numPedido ? ` · Pedido ${g.numPedido}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {g.pendientesTotal > 0 ? (
                  <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: g.diasMax >= 15 ? T.coralBg : T.amberBg, color: g.diasMax >= 15 ? T.coral : T.amber }}>
                    ⏳ {g.pendientesTotal} sin resolver{g.diasMax != null ? ` · ${g.diasMax}d esperando` : ""}
                  </span>
                ) : (
                  <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: T.jadeBg, color: T.jade }}>✓ Todo resuelto</span>
                )}
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: g.recibidosCount === g.totalEnvios ? T.jadeBg : T.amberBg, color: g.recibidosCount === g.totalEnvios ? T.jade : T.amber }}>
                  {g.recibidosCount === g.totalEnvios ? "✓ Recibido" : g.recibidosCount > 0 ? `⏳ ${g.recibidosCount}/${g.totalEnvios} recibidos` : "⏳ Sin confirmar recibido"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    exportBitacoraEnvioToExcel({
                      coleccion: g.coleccion, cliente: g.cliente, numPedido: g.numPedido,
                      fechaEnviado: g.fechaMin === g.fechaMax ? g.fechaMin : `${g.fechaMin} – ${g.fechaMax}`,
                      fechaRecibidoCliente: g.recibidosCount === g.totalEnvios ? (g.envios[0].fechaRecibidoCliente || "") : "",
                      cartaColores: g.cartaColores, items: g.items,
                    });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: "#217346", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                >📊 Exportar</button>
              </div>
            </div>
            {abierto && (
              <div style={{ padding: 20 }}>
                {g.totalEnvios > 1 ? null : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>Empresa Transporte</div><div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{g.envios[0].empresaTransporte || "—"}</div></div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>N° Guía</div><div style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{g.envios[0].guia || "—"}</div></div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 4 }}>Fecha Recibido Cliente</div>
                      <input
                        type="date"
                        value={g.envios[0].fechaRecibidoCliente || ""}
                        onChange={(e) => onUpdateEnvio(g.envios[0].id, { fechaRecibidoCliente: e.target.value })}
                        style={{ padding: "6px 10px", border: `1.5px solid ${T.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit" }}
                      />
                    </div>
                    {g.cartaColores && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 4 }}>Carta de Colores</div>
                        <img src={g.cartaColores} alt="Carta de colores" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.border}` }} />
                      </div>
                    )}
                  </div>
                )}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: T.ink }}>
                        {[...(g.totalEnvios > 1 ? ["Enviado"] : []), "Foto", "Ref", "Nombre", "Estado Actual", "Consumo", "Tipo", "Categoría", "Silueta", "Rango", "Tela", "Curva Col.", "Cant. Col.", "Curva Ven.", "Cant. Ven.", "Precio", "Obs. Cliente"].map((h) => (
                          <th key={h} style={{ padding: "8px 10px", color: T.white, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it, i) => {
                        const live = liveItemFor(it);
                        return (
                          <tr
                            key={`${it._envioId}__${it.itemId}`}
                            onClick={() => setEnvioDetalle(g.envios.find((e) => e.id === it._envioId))}
                            title="Ver detalle de este envío"
                            style={{ background: i % 2 === 0 ? T.canvas : T.white, borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
                          >
                            {g.totalEnvios > 1 && <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{it._fechaEnviado || "—"}</td>}
                            <td style={{ padding: "6px 10px" }}>{it.foto ? <img src={it.foto} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} /> : "—"}</td>
                            <td style={{ padding: "6px 10px", fontWeight: 700 }}>{it.referencia}</td>
                            <td style={{ padding: "6px 10px" }}>{it.nombre}</td>
                            <td style={{ padding: "6px 10px" }}>{live ? <Badge status={live.status} /> : <span style={{ color: T.slate, fontStyle: "italic" }}>—</span>}</td>
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
                        );
                      })}
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
// Bitácora de Aprobados sin Pedido: cápsulas cuyas referencias YA llegaron a
// "Aprobado" pero cuyo código nunca apareció en ningún Pedido cargado — la
// misma señal que ya usa Historial con el badge "🚫 Sin pedido", pero acá
// presentada con el mismo formato de tabla (foto/ref/nombre/categoría/...)
// que usa la Bitácora de Envíos, agrupada por cápsula.
function BitacoraAprobadosSinPedidoView({ capsulas, pedidos, onSelectRef, onVincularPedido, currentUser }) {
  const [busqueda, setBusqueda] = useState("");
  // Vincular a pedido a mano: cuando el cruce automático (por código exacto
  // de referencia) no encuentra el pedido — por formato distinto del código,
  // o porque el pedido quedó registrado bajo otro número tras reprogramarse
  // en Congelado — se puede buscar el pedido real (mismos `pedidos` que usa
  // Corte al Congelar, es la misma colección) y marcar la referencia como
  // vinculada, sin tocar el pedido en sí. `vinculando` guarda {capId, refId}
  // de la fila que está abierta para vincular; null si ninguna.
  const [vinculando, setVinculando] = useState(null);
  const [buscaPedido, setBuscaPedido] = useState("");
  function usedInPedido(refCode) {
    if (!refCode) return false;
    const target = String(refCode).trim().toLowerCase();
    return (pedidos || []).some((p) => (p.referencias || []).some((r) => String(r.ref || "").trim().toLowerCase() === target));
  }
  const q = busqueda.trim().toLowerCase();
  const capsulasConSinPedido = (capsulas || [])
    .map((cap) => ({
      cap,
      refs: (cap.referencias || []).filter((r) => r.status === "aprobado" && !usedInPedido(r.reference) && !r.pedidoVinculado),
    }))
    .filter(({ cap, refs }) => refs.length > 0 && (!q || (cap.name || "").toLowerCase().includes(q) || (cap.cliente || "").toLowerCase().includes(q)))
    .sort((a, b) => (a.cap.name || "").localeCompare(b.cap.name || ""));
  const totalRefs = capsulasConSinPedido.reduce((s, c) => s + c.refs.length, 0);
  const bq = buscaPedido.trim().toLowerCase();
  const pedidosEncontrados = bq
    ? (pedidos || [])
        .filter((p) => String(p.numero || "").toLowerCase().includes(bq) || (p.cliente || "").toLowerCase().includes(bq))
        .slice(0, 30)
    : [];
  function confirmarVinculo(pedido) {
    if (!vinculando) return;
    onVincularPedido(vinculando.capId, vinculando.refId, {
      pedidoVinculado: {
        numero: pedido.numero,
        cliente: pedido.cliente || "",
        vinculadoPor: currentUser?.name || "",
        vinculadoEn: nowISO(),
      },
    });
    setVinculando(null);
    setBuscaPedido("");
  }
  return (
    <div>
      {vinculando && (
        <Modal title="Vincular a pedido" onClose={() => { setVinculando(null); setBuscaPedido(""); }} width={480}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: T.slate }}>
            Busca el pedido al que pertenece esta referencia. No se modifica el pedido — solo se marca la referencia como vinculada y deja de salir en esta Bitácora.
          </p>
          <input
            autoFocus
            value={buscaPedido}
            onChange={(e) => setBuscaPedido(e.target.value)}
            placeholder="Buscar por número de pedido o cliente..."
            style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, outline: "none", fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box" }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {bq && !pedidosEncontrados.length && (
              <div style={{ textAlign: "center", padding: 20, color: T.slate, fontSize: 13 }}>No se encontró ningún pedido con eso.</div>
            )}
            {pedidosEncontrados.map((p) => (
              <div
                key={p.id}
                onClick={() => confirmarVinculo(p)}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, cursor: "pointer", background: T.canvas }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>Pedido #{p.numero}</div>
                <div style={{ fontSize: 12, color: T.slate }}>{p.cliente || "Sin cliente"}{p.fechaPedido ? ` · ${p.fechaPedido}` : ""}{p.estado === "cerrado" ? " · Cerrado" : ""}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Bitácora de Aprobados sin Pedido</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Cápsulas con referencias aprobadas que nunca se usaron en un pedido — {totalRefs} referencia{totalRefs !== 1 ? "s" : ""}</p>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por cápsula o cliente..."
          style={{ padding: "9px 14px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, minWidth: 260, outline: "none", fontFamily: "inherit" }}
        />
      </div>
      {!capsulasConSinPedido.length && (
        <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>
          No hay referencias aprobadas sin usar en pedido. 🎉
        </div>
      )}
      {capsulasConSinPedido.map(({ cap, refs }) => (
        <div key={cap.id} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", background: T.canvas }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>🗂 {cap.name || "Cápsula"}</div>
            <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{cap.cliente || "Sin cliente"}{cap.season ? ` · ${cap.season}` : ""} · {refs.length} referencia{refs.length !== 1 ? "s" : ""} sin pedido</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: T.ink }}>
                  {["Foto", "Ref", "Nombre", "Categoría", "Silueta", "Rango", "Tela", ""].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", color: T.white, textAlign: "left", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {refs.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{ background: i % 2 === 0 ? T.canvas : T.white, borderBottom: `1px solid ${T.border}` }}
                  >
                    <td onClick={() => onSelectRef && onSelectRef(cap.id, r.id)} style={{ padding: "6px 10px", cursor: onSelectRef ? "pointer" : "default" }}>{r.image ? <img src={r.image} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} /> : "—"}</td>
                    <td onClick={() => onSelectRef && onSelectRef(cap.id, r.id)} style={{ padding: "6px 10px", fontWeight: 700, cursor: onSelectRef ? "pointer" : "default" }}>{r.reference || "—"}</td>
                    <td onClick={() => onSelectRef && onSelectRef(cap.id, r.id)} style={{ padding: "6px 10px", cursor: onSelectRef ? "pointer" : "default" }}>{r.name || "—"}</td>
                    <td onClick={() => onSelectRef && onSelectRef(cap.id, r.id)} style={{ padding: "6px 10px", cursor: onSelectRef ? "pointer" : "default" }}>{r.categoria || "—"}</td>
                    <td onClick={() => onSelectRef && onSelectRef(cap.id, r.id)} style={{ padding: "6px 10px", cursor: onSelectRef ? "pointer" : "default" }}>{r.silueta || "—"}</td>
                    <td onClick={() => onSelectRef && onSelectRef(cap.id, r.id)} style={{ padding: "6px 10px", cursor: onSelectRef ? "pointer" : "default" }}>{r.rango || r.tallas?.[0] || "—"}</td>
                    <td onClick={() => onSelectRef && onSelectRef(cap.id, r.id)} style={{ padding: "6px 10px", cursor: onSelectRef ? "pointer" : "default" }}>{r.tipoTela || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <button
                        onClick={() => setVinculando({ capId: cap.id, refId: r.id })}
                        style={{ background: T.denimBg, border: "none", borderRadius: 6, padding: "4px 8px", color: T.denim, fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        🔗 Vincular a pedido
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
// Funciones asignadas de un puesto: cada función es { texto, manejaArchivos,
// rutas } — manejaArchivos/rutas dicen si esa función implica trabajar con
// archivos y en qué carpeta/ruta se encuentran, para que quede documentado
// sin tener que preguntarle a la persona. `funcionesArray` normaliza
// formatos viejos (puestos con `funciones` guardado como string plano, o
// como array de puros strings antes de que existiera manejaArchivos/rutas)
// para que tanto el modal de edición como las vistas de solo lectura
// trabajen siempre con la misma forma de objeto.
function funcionesArray(funciones) {
  let arr = [];
  if (Array.isArray(funciones)) arr = funciones;
  else if (typeof funciones === "string" && funciones.trim()) arr = [funciones];
  return arr
    .map((f) =>
      typeof f === "string"
        ? { texto: f.trim(), manejaArchivos: false, rutas: "" }
        : { texto: (f?.texto || "").trim(), manejaArchivos: !!f?.manejaArchivos, rutas: f?.rutas || "" }
    )
    .filter((f) => f.texto);
}
// Lista numerada de solo lectura (Puestos, Registro Mensual, Catálogo de
// KPIs) — no se repite el numerado a mano en cada vista. Si la función
// maneja archivos, se ve un badge 📁 con la(s) ruta(s) debajo del texto.
function FuncionesPreview({ funciones, style }) {
  const lista = funcionesArray(funciones);
  if (!lista.length) return null;
  return (
    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.slate, ...style }}>
      {lista.map((f, i) => (
        <li key={i} style={{ marginBottom: 4 }}>
          {f.texto}
          {f.manejaArchivos && (
            <div style={{ marginTop: 2, fontSize: 11, color: T.denim, fontWeight: 600 }}>
              📁 {f.rutas?.trim() ? f.rutas : "Maneja archivos (sin ruta especificada)"}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
// Alta/edición de un Puesto de trabajo: nombre + área (de config.kpiAreas) +
// funciones asignadas (responsabilidades esperadas), ahora como lista
// numerada — cada función es su propio renglón, se agrega/quita con
// botones y el consecutivo (1, 2, 3...) se pone solo según el orden de la
// lista. Es la base de todo el módulo — Personas y KPIs del catálogo se
// cuelgan de un puesto.
function PuestoKpiModal({ puesto, areas, puestos, onUpdatePuesto, onSave, onClose }) {
  const [nombre, setNombre] = useState(puesto?.nombre || "");
  const [area, setArea] = useState(puesto?.area || "");
  const vacia = () => ({ texto: "", manejaArchivos: false, rutas: "" });
  const [funciones, setFunciones] = useState(() => {
    const arr = funcionesArray(puesto?.funciones);
    return arr.length ? arr : [vacia()];
  });
  const [transferirIdx, setTransferirIdx] = useState(null);
  const [destinoTransfer, setDestinoTransfer] = useState("");
  const otrosPuestos = (puestos || []).filter((p) => p.id !== puesto?.id);
  function actualizarFuncion(i, campo, val) {
    setFunciones((fs) => fs.map((f, idx) => (idx === i ? { ...f, [campo]: val } : f)));
  }
  function agregarFuncion() {
    setFunciones((fs) => [...fs, vacia()]);
  }
  function quitarFuncion(i) {
    setFunciones((fs) => (fs.length === 1 ? fs : fs.filter((_, idx) => idx !== i)));
  }
  function limpiarFuncion(f) {
    return { texto: (f.texto || "").trim(), manejaArchivos: !!f.manejaArchivos, rutas: (f.rutas || "").trim() };
  }
  function transferirFuncion(i) {
    const item = limpiarFuncion(funciones[i] || vacia());
    if (!item.texto || !destinoTransfer || !puesto || !onUpdatePuesto) return;
    const destino = (puestos || []).find((p) => p.id === destinoTransfer);
    if (!destino) return;
    onUpdatePuesto(destino.id, { funciones: [...funcionesArray(destino.funciones), item] });
    setFunciones((fs) => {
      const restante = fs.filter((_, idx) => idx !== i);
      const limpio = restante.map(limpiarFuncion).filter((f) => f.texto);
      onUpdatePuesto(puesto.id, { funciones: limpio.length ? limpio : [] });
      return restante.length ? restante : [vacia()];
    });
    setTransferirIdx(null);
    setDestinoTransfer("");
  }
  function save() {
    if (!nombre.trim() || !area) return;
    const limpio = funciones.map(limpiarFuncion).filter((f) => f.texto);
    onSave({ nombre: nombre.trim(), area, funciones: limpio });
  }
  return (
    <Modal title={puesto ? "Editar Puesto" : "Nuevo Puesto"} onClose={onClose} width={640}>
      <Field label="Nombre del puesto"><FInput value={nombre} onChange={setNombre} placeholder="Ej: Patronista" /></Field>
      <Field label="Área">
        {areas.length ? (
          <FSel value={area} onChange={setArea} options={areas} />
        ) : (
          <div style={{ padding: "10px 14px", background: T.amberBg, borderRadius: 8, fontSize: 12, color: T.amber, fontWeight: 600 }}>No hay áreas configuradas — agrégalas en Administrador General → Áreas (KPI).</div>
        )}
      </Field>
      <Field label="Funciones asignadas (responsabilidades esperadas)">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {funciones.map((f, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 20, flexShrink: 0, textAlign: "right", fontSize: 12, fontWeight: 700, color: T.slate, marginTop: 8 }}>{i + 1}.</span>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea
                    value={f.texto}
                    onChange={(e) => actualizarFuncion(i, "texto", e.target.value)}
                    placeholder="Ej: Elaborar moldes base según ficha técnica"
                    rows={4}
                    style={{ width: "100%", padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.4, minHeight: 84, boxSizing: "border-box" }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.ink, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!f.manejaArchivos}
                      onChange={(e) => actualizarFuncion(i, "manejaArchivos", e.target.checked)}
                    />
                    Maneja archivos
                  </label>
                  {f.manejaArchivos && (
                    <textarea
                      value={f.rutas}
                      onChange={(e) => actualizarFuncion(i, "rutas", e.target.value)}
                      placeholder="Ruta(s) donde se encuentran, ej: D:\Documentos\techpack-yanko\src (una por línea si son varias)"
                      rows={2}
                      style={{ width: "100%", padding: "6px 10px", border: `1.5px solid ${T.denim}`, borderRadius: 8, fontSize: 12, color: T.ink, background: T.denimBg, outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.4, boxSizing: "border-box" }}
                    />
                  )}
                </div>
                {puesto && !!otrosPuestos.length && (
                  <button
                    onClick={() => { setTransferirIdx(transferirIdx === i ? null : i); setDestinoTransfer(""); }}
                    title="Trasladar esta función a otro puesto"
                    style={{ background: T.denimBg, border: "none", borderRadius: 6, padding: "6px 9px", color: T.denim, fontWeight: 700, cursor: "pointer", flexShrink: 0, marginTop: 4 }}
                  >
                    🔀
                  </button>
                )}
                <button
                  onClick={() => quitarFuncion(i)}
                  disabled={funciones.length === 1}
                  title="Quitar función"
                  style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "6px 9px", color: T.coral, fontWeight: 700, cursor: funciones.length === 1 ? "not-allowed" : "pointer", opacity: funciones.length === 1 ? 0.5 : 1, flexShrink: 0, marginTop: 4 }}
                >
                  ✕
                </button>
              </div>
              {transferirIdx === i && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 28, padding: "8px 10px", background: T.denimBg, borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: T.ink, fontWeight: 600, flexShrink: 0 }}>Mover a:</span>
                  <select
                    value={destinoTransfer}
                    onChange={(e) => setDestinoTransfer(e.target.value)}
                    style={{ flex: 1, padding: "6px 8px", border: `1.5px solid ${T.border}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", background: T.white, color: T.ink }}
                  >
                    <option value="">Selecciona un puesto...</option>
                    {otrosPuestos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} ({p.area})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => transferirFuncion(i)}
                    disabled={!destinoTransfer}
                    style={{ background: destinoTransfer ? T.denim : T.border, border: "none", borderRadius: 6, padding: "6px 12px", color: T.white, fontWeight: 700, fontSize: 12, cursor: destinoTransfer ? "pointer" : "not-allowed" }}
                  >
                    Mover
                  </button>
                  <button
                    onClick={() => { setTransferirIdx(null); setDestinoTransfer(""); }}
                    style={{ background: "none", border: "none", color: T.slate, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={agregarFuncion}
          style={{ background: "none", border: `1px solid ${T.denim}`, borderRadius: 6, padding: "5px 12px", color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
        >
          + Agregar función
        </button>
      </Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save} disabled={!nombre.trim() || !area}>Guardar</Btn>
      </div>
    </Modal>
  );
}
// Selector de puesto agrupado por área — usado tanto en PersonaKpiModal como
// en KpiCatalogoModal, para no repetir el mismo <select> con <optgroup> dos
// veces.
function SelectorPuesto({ value, onChange, puestos }) {
  const porArea = {};
  puestos.forEach((p) => { (porArea[p.area] = porArea[p.area] || []).push(p); });
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
      <option value="">— Seleccionar —</option>
      {Object.entries(porArea).map(([area, ps]) => (
        <optgroup key={area} label={area}>
          {ps.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
function PersonaKpiModal({ persona, puestos, onSave, onClose }) {
  const [nombre, setNombre] = useState(persona?.nombre || "");
  const [puestoId, setPuestoId] = useState(persona?.puestoId || "");
  function save() {
    if (!nombre.trim() || !puestoId) return;
    onSave({ nombre: nombre.trim(), puestoId });
  }
  return (
    <Modal title={persona ? "Editar Persona" : "Nueva Persona"} onClose={onClose} width={420}>
      <Field label="Nombre"><FInput value={nombre} onChange={setNombre} placeholder="Ej: María García" /></Field>
      <Field label="Puesto"><SelectorPuesto value={puestoId} onChange={setPuestoId} puestos={puestos} /></Field>
      {!puestos.length && (
        <div style={{ padding: "10px 14px", background: T.amberBg, borderRadius: 8, marginTop: 8, fontSize: 12, color: T.amber, fontWeight: 600 }}>Todavía no hay puestos creados — ve a la pestaña "Puestos" primero.</div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save} disabled={!nombre.trim() || !puestoId}>Guardar</Btn>
      </div>
    </Modal>
  );
}
// Traslado rápido de un KPI ya existente a otro puesto, sin pasar por el
// formulario completo de edición. Solo cambia el puestoId.
function TrasladarKpiModal({ kpi, puestos, onSave, onClose }) {
  const [puestoId, setPuestoId] = useState(kpi?.puestoId || "");
  const puestoActual = puestos.find((p) => p.id === kpi?.puestoId);
  return (
    <Modal title={`🔀 Trasladar "${kpi?.nombre}" a otro puesto`} onClose={onClose} width={440}>
      {puestoActual && (
        <div style={{ fontSize: 13, color: T.slate, marginBottom: 14 }}>
          Puesto actual: <strong style={{ color: T.ink }}>{puestoActual.nombre}</strong>
        </div>
      )}
      <Field label="Nuevo puesto">
        <SelectorPuesto value={puestoId} onChange={setPuestoId} puestos={puestos} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn variant="success" disabled={!puestoId || puestoId === kpi?.puestoId} onClick={() => onSave(puestoId)}>Trasladar</Btn>
      </div>
    </Modal>
  );
}
// Alta/edición de un KPI del catálogo. Cada KPI pertenece a UN puesto — si al
// guardar el nombre ya existe en OTRO puesto, se avisa (no se bloquea, por si
// de verdad quieres repetirlo, pero queda claro que hay solapamiento).
function KpiCatalogoModal({ kpi, puestos, catalogo, onSave, onClose }) {
  const [nombre, setNombre] = useState(kpi?.nombre || "");
  const [descripcion, setDescripcion] = useState(kpi?.descripcion || "");
  const [puestoId, setPuestoId] = useState(kpi?.puestoId || "");
  const [unidad, setUnidad] = useState(kpi?.unidad || "");
  const [meta, setMeta] = useState(kpi?.meta != null ? String(kpi.meta) : "");
  const nombreKey = nombre.trim().toLowerCase();
  const puestosConMismoNombre = [
    ...new Set(
      catalogo
        .filter((k) => k.id !== kpi?.id && k.puestoId !== puestoId && nombreKey && (k.nombre || "").trim().toLowerCase() === nombreKey)
        .map((k) => puestos.find((p) => p.id === k.puestoId)?.nombre || "(puesto eliminado)")
    ),
  ];
  function save() {
    if (!nombre.trim() || !puestoId) return;
    onSave({ nombre: nombre.trim(), descripcion: descripcion.trim(), puestoId, unidad: unidad.trim(), meta: meta === "" ? null : Number(meta) });
  }
  return (
    <Modal title={kpi ? "Editar KPI" : "Nuevo KPI"} onClose={onClose} width={460}>
      <Field label="Nombre del KPI"><FInput value={nombre} onChange={setNombre} placeholder="Ej: Referencias completadas por mes" /></Field>
      {puestosConMismoNombre.length > 0 && (
        <div style={{ padding: "10px 14px", background: T.amberBg, borderRadius: 8, marginBottom: 14, fontSize: 12, color: T.amber, fontWeight: 600 }}>
          ⚠ Este KPI ya existe en: {puestosConMismoNombre.join(", ")}. Puede que se esté midiendo lo mismo en dos puestos.
        </div>
      )}
      <Field label="Puesto"><SelectorPuesto value={puestoId} onChange={setPuestoId} puestos={puestos} /></Field>
      {!puestos.length && (
        <div style={{ padding: "10px 14px", background: T.amberBg, borderRadius: 8, marginBottom: 14, fontSize: 12, color: T.amber, fontWeight: 600 }}>Todavía no hay puestos creados — ve a la pestaña "Puestos" primero.</div>
      )}
      <Field label="Descripción (opcional)"><FInput value={descripcion} onChange={setDescripcion} placeholder="Ej: Cuenta las referencias que llegaron a Aprobado" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Unidad"><FInput value={unidad} onChange={setUnidad} placeholder="Ej: referencias, días, %" /></Field>
        <Field label="Meta (opcional)"><FInput type="number" value={meta} onChange={setMeta} placeholder="Ej: 10" /></Field>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save} disabled={!nombre.trim() || !puestoId}>Guardar</Btn>
      </div>
    </Modal>
  );
}
// --- Módulo KPIs (toda la compañía) ---
// Cuatro pestañas: Registro (matriz mensual persona × KPI, agrupada por
// puesto — comparativo directo entre personas del mismo puesto), Catálogo
// (qué KPIs tiene cada puesto, con aviso si un KPI se repite en otro
// puesto), Personas (el roster) y Puestos (el catálogo de puestos con su
// área y funciones asignadas — la base de todo lo demás). Un selector de
// Área arriba filtra las cuatro pestañas a la vez. Solo Administrador
// crea/edita/borra puestos, catálogo y personas; el registro de valores
// mensuales lo puede hacer cualquiera con acceso al módulo.
function KPIsView({ areas, puestos, personas, catalogo, registros, isAdmin, onAddPuesto, onUpdatePuesto, onDeletePuesto, onAddPersona, onUpdatePersona, onDeletePersona, onAddKpi, onUpdateKpi, onDeleteKpi, onGuardarRegistro }) {
  const [tab, setTab] = useState("registro");
  const [areaFiltro, setAreaFiltro] = useState("todas");
  const [periodo, setPeriodo] = useState(() => today().slice(0, 7));
  const [editPersona, setEditPersona] = useState(null);
  const [showNuevaPersona, setShowNuevaPersona] = useState(false);
  const [confirmDelPersona, setConfirmDelPersona] = useState(null);
  const [editKpi, setEditKpi] = useState(null);
  const [showNuevoKpi, setShowNuevoKpi] = useState(false);
  const [confirmDelKpi, setConfirmDelKpi] = useState(null);
  const [trasladarKpi, setTrasladarKpi] = useState(null);
  const [editPuesto, setEditPuesto] = useState(null);
  const [showNuevoPuesto, setShowNuevoPuesto] = useState(false);
  const [confirmDelPuesto, setConfirmDelPuesto] = useState(null);
  const [valoresLocales, setValoresLocales] = useState({});

  function puestoDe(id) { return puestos.find((p) => p.id === id); }
  const puestosFiltrados = areaFiltro === "todas" ? puestos : puestos.filter((p) => p.area === areaFiltro);
  const puestosFiltradosIds = new Set(puestosFiltrados.map((p) => p.id));
  const personasFiltradas = personas.filter((p) => puestosFiltradosIds.has(p.puestoId));
  const catalogoFiltrado = catalogo.filter((k) => puestosFiltradosIds.has(k.puestoId));

  function valorDe(personaId, kpiId) {
    const local = valoresLocales[`${personaId}__${kpiId}__${periodo}`];
    if (local !== undefined) return local;
    const r = registros.find((r) => r.personaId === personaId && r.kpiId === kpiId && r.periodo === periodo);
    return r?.valor != null ? String(r.valor) : "";
  }
  function setValorLocal(personaId, kpiId, val) {
    setValoresLocales((v) => ({ ...v, [`${personaId}__${kpiId}__${periodo}`]: val }));
  }
  function guardarCelda(personaId, kpiId) {
    const val = valorDe(personaId, kpiId);
    if (val === "") return;
    onGuardarRegistro({ personaId, kpiId, periodo, valor: Number(val) });
  }

  // Puestos (dentro del filtro de área) que efectivamente tienen personas Y
  // kpis, para no mostrar bloques vacíos en el registro.
  const puestosConDatos = puestosFiltrados.filter((p) => personas.some((per) => per.puestoId === p.id) && catalogo.some((k) => k.puestoId === p.id));

  // Detección de nombres de KPI repetidos entre puestos DISTINTOS (posible
  // solapamiento) — se calcula sobre TODO el catálogo, sin importar el
  // filtro de área, porque el solapamiento puede darse entre dos áreas.
  const kpisPorNombre = {};
  catalogo.forEach((k) => {
    const key = (k.nombre || "").trim().toLowerCase();
    if (!key) return;
    kpisPorNombre[key] = kpisPorNombre[key] || new Set();
    kpisPorNombre[key].add(k.puestoId);
  });
  const nombresConSolapamiento = new Set(Object.entries(kpisPorNombre).filter(([, s]) => s.size > 1).map(([k]) => k));

  return (
    <div>
      {showNuevoPuesto && <PuestoKpiModal areas={areas} puestos={puestos} onUpdatePuesto={onUpdatePuesto} onSave={(p) => { onAddPuesto(p); setShowNuevoPuesto(false); }} onClose={() => setShowNuevoPuesto(false)} />}
      {editPuesto && <PuestoKpiModal puesto={editPuesto} areas={areas} puestos={puestos} onUpdatePuesto={onUpdatePuesto} onSave={(p) => { onUpdatePuesto(editPuesto.id, p); setEditPuesto(null); }} onClose={() => setEditPuesto(null)} />}
      {showNuevaPersona && <PersonaKpiModal puestos={puestos} onSave={(p) => { onAddPersona(p); setShowNuevaPersona(false); }} onClose={() => setShowNuevaPersona(false)} />}
      {editPersona && <PersonaKpiModal persona={editPersona} puestos={puestos} onSave={(p) => { onUpdatePersona(editPersona.id, p); setEditPersona(null); }} onClose={() => setEditPersona(null)} />}
      {showNuevoKpi && <KpiCatalogoModal puestos={puestos} catalogo={catalogo} onSave={(k) => { onAddKpi(k); setShowNuevoKpi(false); }} onClose={() => setShowNuevoKpi(false)} />}
      {editKpi && <KpiCatalogoModal kpi={editKpi} puestos={puestos} catalogo={catalogo} onSave={(k) => { onUpdateKpi(editKpi.id, k); setEditKpi(null); }} onClose={() => setEditKpi(null)} />}
      {trasladarKpi && <TrasladarKpiModal kpi={trasladarKpi} puestos={puestos} onSave={(nuevoPuestoId) => { onUpdateKpi(trasladarKpi.id, { puestoId: nuevoPuestoId }); setTrasladarKpi(null); }} onClose={() => setTrasladarKpi(null)} />}
      {confirmDelPuesto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar el puesto <strong>"{confirmDelPuesto.nombre}"</strong>? Las personas y KPIs que ya lo tengan asignado NO se borran, pero quedarán sin puesto válido hasta que los reasignes.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDelPuesto(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { onDeletePuesto(confirmDelPuesto.id); setConfirmDelPuesto(null); }}>Sí, eliminar</Btn>
            </div>
          </div>
        </div>
      )}
      {confirmDelPersona && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar a <strong>"{confirmDelPersona.nombre}"</strong> del roster de KPIs, junto con sus registros mensuales? Esta acción no se puede deshacer.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDelPersona(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { onDeletePersona(confirmDelPersona.id); setConfirmDelPersona(null); }}>Sí, eliminar</Btn>
            </div>
          </div>
        </div>
      )}
      {confirmDelKpi && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Confirmar eliminación</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar el KPI <strong>"{confirmDelKpi.nombre}"</strong> del catálogo, junto con los registros mensuales que ya tenga? Esta acción no se puede deshacer.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmDelKpi(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => { onDeleteKpi(confirmDelKpi.id); setConfirmDelKpi(null); }}>Sí, eliminar</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>KPIs</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Indicadores por área y persona en toda la compañía — funciones asignadas, catálogo de KPIs y seguimiento mensual, pensado para ver de un vistazo si hay solapamiento entre puestos.</p>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[["registro", "📈 Registro Mensual"], ["catalogo", "📋 Catálogo de KPIs"], ["personas", "👤 Personas"], ["puestos", "🧑‍💼 Puestos"]].map(([v, label]) => (
            <button key={v} onClick={() => setTab(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${tab === v ? T.ink : T.border}`, background: tab === v ? T.ink : T.white, color: tab === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>Área</label>
          <select value={areaFiltro} onChange={(e) => setAreaFiltro(e.target.value)} style={{ padding: "7px 12px", border: `1.5px solid ${areaFiltro !== "todas" ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, color: areaFiltro !== "todas" ? T.denim : T.ink, background: areaFiltro !== "todas" ? T.denimBg : T.white, outline: "none", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
            <option value="todas">Todas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {tab === "registro" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: T.slate, textTransform: "uppercase" }}>Periodo</label>
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, fontFamily: "inherit" }} />
          </div>
          {!puestosConDatos.length ? (
            <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>
              Todavía no hay puestos (en esta área) con personas Y KPIs asignados. Ve a las pestañas "Puestos", "Catálogo de KPIs" y "Personas" para configurarlos.
            </div>
          ) : (
            puestosConDatos.map((puesto) => {
              const personasDelPuesto = personas.filter((p) => p.puestoId === puesto.id);
              const kpisDelPuesto = catalogo.filter((k) => k.puestoId === puesto.id);
              return (
                <div key={puesto.id} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 20, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", background: T.canvas, borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>
                      {puesto.nombre} <span style={{ fontWeight: 600, fontSize: 11, color: T.denim, padding: "2px 8px", background: T.denimBg, borderRadius: 20, marginLeft: 6 }}>{puesto.area}</span>
                    </div>
                    <FuncionesPreview funciones={puesto.funciones} style={{ marginTop: 4 }} />
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: T.canvas }}>
                          <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10, color: T.slate, textTransform: "uppercase" }}>Persona</th>
                          {kpisDelPuesto.map((k) => (
                            <th key={k.id} style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontSize: 10, color: T.slate, textTransform: "uppercase" }}>
                              {k.nombre}{k.unidad ? ` (${k.unidad})` : ""}{k.meta != null ? <div style={{ fontWeight: 400, fontSize: 9, color: T.slate }}>meta: {k.meta}</div> : null}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {personasDelPuesto.map((persona) => (
                          <tr key={persona.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                            <td style={{ padding: "8px 12px", fontWeight: 700, color: T.ink }}>{persona.nombre}</td>
                            {kpisDelPuesto.map((k) => {
                              const val = valorDe(persona.id, k.id);
                              const bajoMeta = k.meta != null && val !== "" && Number(val) < k.meta;
                              return (
                                <td key={k.id} style={{ padding: "6px 10px", textAlign: "center" }}>
                                  <input
                                    type="number"
                                    value={val}
                                    onChange={(e) => setValorLocal(persona.id, k.id, e.target.value)}
                                    onBlur={() => guardarCelda(persona.id, k.id)}
                                    style={{ width: 80, padding: "6px 8px", border: `1.5px solid ${bajoMeta ? T.amber : T.border}`, borderRadius: 6, fontSize: 13, textAlign: "center", color: T.ink, background: bajoMeta ? T.amberBg : T.white, fontFamily: "inherit" }}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "catalogo" && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 20 }}>
              <Btn onClick={() => setShowNuevoKpi(true)} disabled={!puestos.length}>+ Nuevo KPI</Btn>
            </div>
          )}
          {!puestosFiltrados.length ? (
            <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>No hay puestos configurados en esta área todavía. Agrégalos en la pestaña "Puestos".</div>
          ) : (
            puestosFiltrados.map((puesto) => {
              const kpisDelPuesto = catalogo.filter((k) => k.puestoId === puesto.id);
              return (
                <div key={puesto.id} style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: T.ink, marginBottom: 2 }}>
                    {puesto.nombre} <span style={{ fontWeight: 600, fontSize: 11, color: T.denim, padding: "2px 8px", background: T.denimBg, borderRadius: 20, marginLeft: 4 }}>{puesto.area}</span> <span style={{ fontWeight: 400, color: T.slate, fontSize: 12 }}>({kpisDelPuesto.length} KPI{kpisDelPuesto.length !== 1 ? "s" : ""})</span>
                  </div>
                  <FuncionesPreview funciones={puesto.funciones} style={{ marginBottom: 10 }} />
                  {!kpisDelPuesto.length ? (
                    <div style={{ padding: "12px 16px", background: T.canvas, borderRadius: 10, color: T.slate, fontSize: 13, marginTop: 8 }}>Sin KPIs asignados todavía.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {kpisDelPuesto.map((k) => {
                        const repetido = nombresConSolapamiento.has((k.nombre || "").trim().toLowerCase());
                        return (
                          <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: T.white, border: `1px solid ${repetido ? T.amber : T.border}`, borderRadius: 10 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>
                                {k.nombre}
                                {repetido && <span title="Este mismo nombre de KPI aparece en más de un puesto" style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: T.amber }}>⚠ Solapado</span>}
                              </div>
                              {k.descripcion && <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{k.descripcion}</div>}
                              <div style={{ fontSize: 11, color: T.slate, marginTop: 2 }}>{k.unidad ? `Unidad: ${k.unidad}` : ""}{k.meta != null ? ` · Meta: ${k.meta}` : ""}</div>
                            </div>
                            {isAdmin && (
                              <div style={{ display: "flex", gap: 6 }}>
                                <Btn small variant="ghost" onClick={() => setEditKpi(k)}>✏ Editar</Btn>
                                <Btn small variant="ghost" onClick={() => setTrasladarKpi(k)}>🔀 Trasladar</Btn>
                                <Btn small variant="danger" onClick={() => setConfirmDelKpi(k)}>🗑</Btn>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "personas" && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 20 }}>
              <Btn onClick={() => setShowNuevaPersona(true)} disabled={!puestos.length}>+ Nueva Persona</Btn>
            </div>
          )}
          {!personasFiltradas.length ? (
            <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>Todavía no hay personas en el roster{areaFiltro !== "todas" ? " para esta área" : ""}.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {personasFiltradas.map((p) => {
                const su = puestoDe(p.puestoId);
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{p.nombre}</div>
                      <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{su ? `${su.nombre} · ${su.area}` : "(puesto eliminado)"}</div>
                    </div>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn small variant="ghost" onClick={() => setEditPersona(p)}>✏ Editar</Btn>
                        <Btn small variant="danger" onClick={() => setConfirmDelPersona(p)}>🗑</Btn>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "puestos" && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 20 }}>
              <Btn onClick={() => setShowNuevoPuesto(true)} disabled={!areas.length}>+ Nuevo Puesto</Btn>
              {!areas.length && <span style={{ marginLeft: 10, fontSize: 12, color: T.amber, fontWeight: 600 }}>Agrega primero áreas en Administrador General → Áreas (KPI).</span>}
            </div>
          )}
          {!puestosFiltrados.length ? (
            <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>Todavía no hay puestos{areaFiltro !== "todas" ? " en esta área" : ""}.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {puestosFiltrados.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 16px", background: T.white, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{p.nombre} <span style={{ fontWeight: 600, fontSize: 11, color: T.denim, padding: "2px 8px", background: T.denimBg, borderRadius: 20, marginLeft: 4 }}>{p.area}</span></div>
                    {funcionesArray(p.funciones).length ? (
                      <FuncionesPreview funciones={p.funciones} style={{ marginTop: 6, maxWidth: 560 }} />
                    ) : (
                      <div style={{ fontSize: 12, color: T.slate, marginTop: 6, fontStyle: "italic" }}>Sin funciones asignadas descritas todavía.</div>
                    )}
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                      <Btn small variant="ghost" onClick={() => setEditPuesto(p)}>✏ Editar</Btn>
                      <Btn small variant="danger" onClick={() => setConfirmDelPuesto(p)}>🗑</Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function HistorialDisenoView({ historial, protos, capsulas, pedidos, role, perms, stages, isAdmin, onBackfill, onSelectProto, onSelectRef, onPromote, initialResultado, initialTipoFiltro, onVincularPedido, currentUser }) {
  const [modo, setModo] = useState("todos");
  const [clienteSel, setClienteSel] = useState("");
  const [resultado, setResultado] = useState(initialResultado || "todos");
  const [tipoFiltro, setTipoFiltro] = useState(initialTipoFiltro || "todos");
  const [mesFiltro, setMesFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloSinPedido, setSoloSinPedido] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  // Vincular a pedido a mano, igual que en la Bitácora de Aprobados sin
  // Pedido — `vinculando` guarda {capId, refId} de la fila abierta (solo
  // aplica a referencias de cápsula, los prototipos no tienen este flujo).
  const [vinculando, setVinculando] = useState(null);
  const [buscaPedido, setBuscaPedido] = useState("");
  const bqHist = buscaPedido.trim().toLowerCase();
  const pedidosEncontradosHist = bqHist
    ? (pedidos || []).filter((p) => String(p.numero || "").toLowerCase().includes(bqHist) || (p.cliente || "").toLowerCase().includes(bqHist)).slice(0, 30)
    : [];
  function confirmarVinculoHist(pedido) {
    if (!vinculando) return;
    onVincularPedido(vinculando.capId, vinculando.refId, {
      pedidoVinculado: { numero: pedido.numero, cliente: pedido.cliente || "", vinculadoPor: currentUser?.name || "", vinculadoEn: nowISO() },
    });
    setVinculando(null);
    setBuscaPedido("");
  }
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
  // Igual que usedInPedido, pero también cuenta como "con pedido" una
  // referencia vinculada a mano (item.pedidoVinculado) desde la Bitácora de
  // Aprobados sin Pedido o desde aquí mismo — el cruce automático por código
  // exacto no siempre encuentra el pedido (formato distinto, o reprogramado
  // bajo otro número en Congelado).
  function tienePedido(item) {
    return usedInPedido(item.reference) || !!item.pedidoVinculado;
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
    if (soloSinPedido) arr = arr.filter(({ h, item }) => h.resultado === "aprobado" && !tienePedido(item));
    return arr.sort((a, b) => b.h.fecha.localeCompare(a.h.fecha));
  }
  // Fila compacta de un ítem (sin imagen): nombre, referencia, cliente/fecha
  // y estado. Al hacer clic se abre el detalle completo (ahí sí aparece la
  // imagen). Se reutiliza tanto en la lista plana como dentro de cada
  // cápsula desplegada.
  function renderRow(h, item) {
    const sinPedido = h.resultado === "aprobado" && !tienePedido(item);
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
        {sinPedido && h.tipo !== "proto" && (
          <button
            onClick={(e) => { e.stopPropagation(); setVinculando({ capId: h.capsulaId, refId: item.id }); }}
            style={{ background: T.denimBg, border: "none", borderRadius: 6, padding: "4px 8px", color: T.denim, fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            🔗 Vincular
          </button>
        )}
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
            const sinPedidoCount = refs.filter(({ h, item }) => h.resultado === "aprobado" && !tienePedido(item)).length;
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
  const busquedaNorm = busqueda.trim().toLowerCase();
  const filtradoResultado = historial.filter((h) => {
    if (resultado !== "todos" && h.resultado !== resultado) return false;
    if (tipoFiltro !== "todos" && h.tipo !== tipoFiltro) return false;
    if (mesFiltro && h.mes !== mesFiltro) return false;
    if (busquedaNorm) {
      const calza =
        (h.nombre || "").toLowerCase().includes(busquedaNorm) ||
        (h.referencia || "").toLowerCase().includes(busquedaNorm) ||
        (h.cliente || "").toLowerCase().includes(busquedaNorm) ||
        (h.capsulaName || "").toLowerCase().includes(busquedaNorm);
      if (!calza) return false;
    }
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
      {vinculando && (
        <Modal title="Vincular a pedido" onClose={() => { setVinculando(null); setBuscaPedido(""); }} width={480}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: T.slate }}>
            Busca el pedido al que pertenece esta referencia. No se modifica el pedido — solo se marca la referencia como vinculada y deja de mostrar "Sin pedido".
          </p>
          <input
            autoFocus
            value={buscaPedido}
            onChange={(e) => setBuscaPedido(e.target.value)}
            placeholder="Buscar por número de pedido o cliente..."
            style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, outline: "none", fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box" }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {bqHist && !pedidosEncontradosHist.length && (
              <div style={{ textAlign: "center", padding: 20, color: T.slate, fontSize: 13 }}>No se encontró ningún pedido con eso.</div>
            )}
            {pedidosEncontradosHist.map((p) => (
              <div
                key={p.id}
                onClick={() => confirmarVinculoHist(p)}
                style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, cursor: "pointer", background: T.canvas }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>Pedido #{p.numero}</div>
                <div style={{ fontSize: 12, color: T.slate }}>{p.cliente || "Sin cliente"}{p.fechaPedido ? ` · ${p.fechaPedido}` : ""}{p.estado === "cerrado" ? " · Cerrado" : ""}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
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
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre, referencia o cliente..."
          style={{ padding: "7px 12px", border: `1.5px solid ${busqueda ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, minWidth: 240, outline: "none", fontFamily: "inherit" }}
        />
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
function HomeView({ currentUser, perms, canAccessCorte, canAccessContabilidad, canAccessPlaneacion, canAccessPlanta, canAccessBodega, canAccessNomina, canAccessDiseno, canAccessPedidosArea, canAccessKpis, canAccessInformes, onGoArea, protos, capsulas, pedidos }) {
  const hoy = new Date();
  const protosEnProceso = protos.filter((p) => p.status === "en_proceso").length;
  const pedidosActivos = pedidos.filter((p) => p.estado === "activo" || p.estado === "terminado").length;
  const pedidosVencidos = pedidos.filter((p) => p.fechaDespacho && new Date(p.fechaDespacho) < hoy && p.estado !== "cerrado").length;
  const AREAS_CARDS = [
    {
      id: "diseno", icon: "🎨", label: "Diseño", desc: "Prototipos, Cápsulas y seguimiento del proceso de diseño", color: T.denim, bg: T.denimBg,
      stats: [{ label: "Prototipos activos", value: protosEnProceso }],
      // Antes: perms.editar || perms.aprobar || perms.declinar — mezclaba permisos de
      // flujo de trabajo con visibilidad de módulo. Ahora usa el acceso granular real
      // (si al menos una sección de Diseño está habilitada para el rol).
      permiso: canAccessDiseno,
    },
    {
      id: "pedidos_area", icon: "🧾", label: "Pedidos", desc: "Pedidos cargados de Busint, por cliente, administración y Corte", color: T.denim, bg: T.denimBg,
      stats: [{ label: "Pedidos activos", value: pedidosActivos, alert: pedidosVencidos > 0 }],
      permiso: canAccessPedidosArea,
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
    {
      id: "planta_area", icon: "🏭", label: "Planta", desc: "Programación diaria y cumplimiento de Planta Industrias Yanko", color: T.amber, bg: T.amberBg,
      stats: [],
      permiso: canAccessPlanta,
    },
    {
      id: "bodega_area", icon: "📦", label: "Bodega", desc: "Despachos y abonos de Venezuela — montar, aprobar y llevar el saldo", color: T.violet, bg: T.violetBg,
      stats: [],
      permiso: canAccessBodega,
    },
    {
      id: "nomina_area", icon: "👷", label: "Nómina", desc: "Producción por proceso, horas sueltas y resumen semanal de pago", color: T.amber, bg: T.amberBg,
      stats: [],
      permiso: canAccessNomina,
    },
    {
      id: "kpis_area", icon: "🎯", label: "KPIs", desc: "Indicadores por área y persona en toda la compañía — Diseño, Corte, Ventas, Contabilidad, Planeación...", color: T.coral, bg: T.coralBg,
      stats: [],
      permiso: canAccessKpis,
    },
    {
      id: "informes_area", icon: "📋", label: "Informes", desc: "Lo que está vencido en cada área, en vivo — la misma info que manda el aviso automático por correo", color: T.coral, bg: T.coralBg,
      stats: [],
      permiso: canAccessInformes,
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
  const [guardando, setGuardando] = useState(false);
  // Cambia la clave real en Firebase Authentication (Fase B). Antes esto
  // comparaba contra el campo `password` en texto plano de Firestore — ahora
  // se reautentica contra la cuenta real (para confirmar que "current" es
  // correcta) y luego se actualiza ahí mismo, nunca en Firestore.
  async function save() {
    setError("");
    if (!nueva.trim() || nueva.length < 6) { setError("La nueva contraseña debe tener al menos 6 caracteres."); return; }
    if (nueva !== confirm) { setError("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    try {
      const email = `${currentUser.username}@techpack-yanko.local`;
      const credential = EmailAuthProvider.credential(email, current);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, nueva.trim());
      onSave(nueva.trim());
      onClose();
    } catch (err) {
      setError(err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password" ? "La contraseña actual no es correcta." : (err?.message || "No se pudo cambiar la contraseña."));
    }
    setGuardando(false);
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
        <Btn variant="success" onClick={save} disabled={guardando}>{guardando ? "Guardando..." : "Cambiar contraseña"}</Btn>
      </div>
    </Modal>
  );
}
function EditNombreModal({ item, tipo, config, onSave, onClose }) {
  const [nombre, setNombre] = useState(item?.name || "");
  const [season, setSeason] = useState(item?.season || "");
  const [assignedTo, setAssignedTo] = useState(item?.assignedTo || "");
  const [cliente, setCliente] = useState(item?.cliente || "");
  const [mes, setMes] = useState(item?.mes || "");
  function save() {
    if (!nombre.trim()) return;
    onSave({ name: nombre.trim(), ...(tipo === "capsula" ? { season: season.trim(), assignedTo, cliente, mes } : {}) });
    onClose();
  }
  return (
    <Modal title={`Editar ${tipo === "capsula" ? "Cápsula" : "Prototipo"}`} onClose={onClose} width={420}>
      <Field label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></Field>
      {tipo === "capsula" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Cliente">
            <FSel value={cliente} onChange={setCliente} options={(config?.clientes || []).map((c) => c.nombre)} />
          </Field>
          <Field label="Mes">
            <FSel value={mes} onChange={setMes} options={MONTHS_ES} />
          </Field>
        </div>
      )}
      {tipo === "capsula" && <Field label="Temporada / Código"><input value={season} onChange={(e) => setSeason(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} /></Field>}
      {tipo === "capsula" && <Field label="Responsable"><FSel value={assignedTo} onChange={setAssignedTo} options={config?.disenadores || []} /></Field>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={save}>Guardar cambios</Btn>
      </div>
    </Modal>
  );
}
function UsersTab({ users, onUpdateUsers, config, isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "Equipo Interno", isAdmin: false, clienteAsociado: "", email: "" });
  const [changePwdId, setChangePwdId] = useState(null);
  const [newPwd, setNewPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  // --- Fase B: crear usuario y resetear clave de otro pasan por Cloud
  // Functions (adminCrearUsuario / adminCambiarClaveUsuario) — el navegador
  // del admin no puede crear ni tocar la cuenta de Firebase Auth de otra
  // persona directamente, solo la propia.
  const [creando, setCreando] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [errorClave, setErrorClave] = useState("");
  const roleOptions = config.roles.map((r) => r.name);
  // --- Migración a Firebase Authentication (Fase A, temporal) ---
  // Botón de un solo uso para crear, por detrás, una cuenta real de Firebase
  // Auth para cada usuario que hoy solo existe como documento en Firestore
  // (con clave en texto plano). No toca el login actual — es seguro de
  // correr varias veces (los ya migrados se saltan). Se puede quitar este
  // bloque una vez completada la migración de todo el equipo.
  const [migrando, setMigrando] = useState(false);
  const [resultadoMigracion, setResultadoMigracion] = useState(null);
  async function migrarAuth() {
    const clave = window.prompt("Clave de migración (la que configuraste con 'firebase functions:secrets:set MIGRACION_CLAVE'):");
    if (!clave) return;
    setMigrando(true);
    setResultadoMigracion(null);
    try {
      const llamar = httpsCallable(functionsClient, "migrarUsuariosAFirebaseAuth");
      const resp = await llamar({ clave });
      setResultadoMigracion(resp.data);
    } catch (err) {
      setResultadoMigracion({ error: err?.message || String(err) });
    }
    setMigrando(false);
  }
  function openNew() { setForm({ name: "", username: "", password: "", role: "Equipo Interno", isAdmin: false, clienteAsociado: "", email: "" }); setEditUser(null); setShowForm(true); setError(""); }
  function openEdit(u) { setForm({ name: u.name, username: u.username, password: "", role: u.role, isAdmin: u.isAdmin, clienteAsociado: u.clienteAsociado || "", email: u.email || "" }); setEditUser(u); setShowForm(true); setError(""); }
  // Crear usuario nuevo pasa por la Cloud Function `adminCrearUsuario` (Fase
  // B): a diferencia de editar, crear SÍ necesita generar una cuenta real de
  // Firebase Auth para que esa persona pueda entrar — eso no lo puede hacer
  // el navegador directamente (crearla desde el cliente dejaría al admin
  // logueado como el usuario nuevo en vez de como él mismo), así que lo hace
  // una función con permisos de administrador. Editar un usuario existente
  // (nombre/rol/admin) sigue siendo una escritura directa a Firestore — el
  // usuario y la contraseña de acceso ya NO se tocan ahí (para eso está
  // "🔑 Clave"; el nombre de usuario no se puede cambiar una vez creado,
  // porque es lo que arma el correo de la cuenta de Firebase Auth).
  async function saveUser() {
    setError("");
    if (editUser) {
      if (!form.name) { setError("El nombre es obligatorio."); return; }
      if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("El correo no parece válido."); return; }
      const avatar = form.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      onUpdateUsers(users.map((u) => (u.id === editUser.id ? { ...u, name: form.name, role: form.role, isAdmin: form.isAdmin, clienteAsociado: form.clienteAsociado || "", email: form.email ? form.email.trim() : "", avatar } : u)));
      setShowForm(false);
      return;
    }
    if (!form.name || !form.username || !form.password) { setError("Todos los campos son obligatorios."); return; }
    if (form.password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("El correo no parece válido."); return; }
    const dup = users.find((u) => u.username === form.username.toLowerCase());
    if (dup) { setError("Ese usuario ya existe."); return; }
    setCreando(true);
    try {
      const llamar = httpsCallable(functionsClient, "adminCrearUsuario");
      await llamar({ name: form.name, username: form.username, password: form.password, role: form.role, isAdmin: form.isAdmin, clienteAsociado: form.clienteAsociado, email: form.email ? form.email.trim() : "" });
      setShowForm(false);
    } catch (err) {
      setError(err?.message || "No se pudo crear el usuario.");
    }
    setCreando(false);
  }
  function deleteUser(id) {
    if (id === "u1") return;
    if (!window.confirm("¿Seguro que quieres ELIMINAR este usuario?\n\nSe pierde el registro de quién hizo qué en el sistema. Si ya no va a trabajar contigo pero quieres conservar su historial, mejor usa el botón \"⛔ Desactivar\" en vez de Eliminar.")) return;
    onUpdateUsers(users.filter((u) => u.id !== id));
  }
  // Desactivar conserva el usuario (y todo lo que hizo) en la base de datos,
  // solo le impide volver a iniciar sesión (ver el chequeo `activo === false`
  // en cargarDatos). Es la opción recomendada frente a Eliminar cuando
  // alguien deja de trabajar con nosotros.
  function toggleActivo(u) {
    onUpdateUsers(users.map((x) => (x.id === u.id ? { ...x, activo: x.activo === false ? true : false } : x)));
  }
  // Resetear la clave de OTRO usuario también pasa por una Cloud Function
  // (Fase B) — el navegador del admin no tiene permiso para cambiar la clave
  // de otra cuenta de Firebase Auth directamente, solo la propia. La función
  // `adminCambiarClaveUsuario` verifica que quien llama sea administrador
  // antes de actualizarla.
  async function changePassword() {
    if (!newPwd.trim() || newPwd.trim().length < 6) { setErrorClave("La contraseña debe tener al menos 6 caracteres."); return; }
    setErrorClave("");
    setCambiandoClave(true);
    try {
      const llamar = httpsCallable(functionsClient, "adminCambiarClaveUsuario");
      await llamar({ userId: changePwdId, nuevaClave: newPwd.trim() });
      setChangePwdId(null);
      setNewPwd("");
    } catch (err) {
      setErrorClave(err?.message || "No se pudo cambiar la contraseña.");
    }
    setCambiandoClave(false);
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Gestión de Usuarios</div><div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{users.length} usuario{users.length !== 1 ? "s" : ""}</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && (
            <Btn variant="amber" onClick={migrarAuth} disabled={migrando}>
              {migrando ? "Migrando..." : "🔐 Migrar a Firebase Auth"}
            </Btn>
          )}
          <Btn onClick={openNew}>+ Nuevo Usuario</Btn>
        </div>
      </div>
      {resultadoMigracion && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
            background: resultadoMigracion.error ? T.coralBg : T.jadeBg,
            color: resultadoMigracion.error ? T.coral : T.jade,
            border: `1px solid ${resultadoMigracion.error ? T.coral : T.jade}44`,
          }}
        >
          {resultadoMigracion.error ? (
            `⚠ ${resultadoMigracion.error}`
          ) : (
            <div>
              <div>
                ✓ {resultadoMigracion.migrados.length} usuario{resultadoMigracion.migrados.length !== 1 ? "s" : ""} migrado{resultadoMigracion.migrados.length !== 1 ? "s" : ""}
                {resultadoMigracion.migrados.length ? `: ${resultadoMigracion.migrados.join(", ")}` : ""}
              </div>
              {resultadoMigracion.yaExistian.length > 0 && (
                <div style={{ marginTop: 4 }}>Ya estaban migrados: {resultadoMigracion.yaExistian.join(", ")}</div>
              )}
              {resultadoMigracion.errores.length > 0 && (
                <div style={{ marginTop: 4, color: T.coral }}>
                  ⚠ {resultadoMigracion.errores.length} con error: {resultadoMigracion.errores.map((e) => `${e.username || e.id} (${e.motivo})`).join(" · ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
              {/* Se limpia mientras se escribe (minúsculas, sin espacios ni
                  acentos) — el nombre de usuario arma por detrás un correo
                  interno de acceso (usuario@techpack-yanko.local) y un
                  espacio ahí lo vuelve inválido para Firebase, lo que antes
                  se veía como un error confuso de "correo con formato
                  incorrecto" sin relación aparente con este campo. */}
              <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: sanitizarUsername(e.target.value) }))} placeholder="Ej: laura" disabled={!!editUser} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: editUser ? T.canvas : T.white, outline: "none", fontFamily: "inherit", cursor: editUser ? "not-allowed" : "text" }} />
              {editUser && <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>No se puede cambiar una vez creado.</div>}
              {!editUser && <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>Sin espacios ni tildes — así se escribe para iniciar sesión.</div>}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Contraseña</label>
              {editUser ? (
                <div style={{ padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.slate, background: T.canvas }}>Usa el botón "🔑 Clave" para cambiarla.</div>
              ) : (
                <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Rol</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Correo (opcional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="nombre@empresa.com" style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
              <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>Para poder mandarle avisos por correo (ej. prototipos/cápsulas vencidos).</div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.slate, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cliente asociado (opcional)</label>
              <select value={form.clienteAsociado} onChange={(e) => setForm((f) => ({ ...f, clienteAsociado: e.target.value }))} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }}>
                <option value="">— Ninguno (ve todos los clientes) —</option>
                {(config.clientes || []).map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
              </select>
              <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>Si eliges un cliente, este usuario solo verá prototipos, cápsulas, pedidos y estadísticas de ese cliente.</div>
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
            <Btn onClick={saveUser} disabled={creando}>{creando ? "Creando..." : (editUser ? "Guardar cambios" : "Crear Usuario")}</Btn>
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
            <Btn variant="amber" onClick={changePassword} disabled={cambiandoClave}>{cambiandoClave ? "Guardando..." : "Guardar"}</Btn>
            <Btn variant="secondary" onClick={() => { setChangePwdId(null); setNewPwd(""); setErrorClave(""); }}>Cancelar</Btn>
          </div>
          {errorClave && <div style={{ marginTop: 10, padding: "8px 12px", background: T.coralBg, borderRadius: 8, fontSize: 13, color: T.coral, fontWeight: 600 }}>⚠ {errorClave}</div>}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: u.activo === false ? "#F2F2F2" : T.canvas, borderRadius: 12, border: `1px solid ${T.border}` }}>
            <Avatar name={u.name} size={42} />
            <div style={{ flex: 1, opacity: u.activo === false ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>{u.name}</span>
                {u.isAdmin && <span style={{ padding: "2px 8px", borderRadius: 4, background: T.ink, color: T.seam, fontSize: 10, fontWeight: 800 }}>ADMIN</span>}
                <span style={{ padding: "2px 8px", borderRadius: 4, background: u.role === "Cliente" ? T.violetBg : T.denimBg, color: u.role === "Cliente" ? T.violet : T.denim, fontSize: 10, fontWeight: 700 }}>{u.role}</span>
                {u.activo === false && <span style={{ padding: "2px 8px", borderRadius: 4, background: T.coralBg, color: T.coral, fontSize: 10, fontWeight: 800 }}>INACTIVO</span>}
              </div>
              <div style={{ fontSize: 12, color: T.slate, marginTop: 3 }}>@{u.username}{u.email ? ` · ${u.email}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setChangePwdId(u.id)} style={{ padding: "6px 12px", background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 8, color: T.amber, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🔑 Clave</button>
              <button onClick={() => openEdit(u)} style={{ padding: "6px 12px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 8, color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏ Editar</button>
              {u.id !== "u1" && (
                <button
                  onClick={() => toggleActivo(u)}
                  style={{
                    padding: "6px 12px",
                    background: u.activo === false ? T.jadeBg : "#F0F0F0",
                    border: `1px solid ${u.activo === false ? T.jade + "44" : T.border}`,
                    borderRadius: 8,
                    color: u.activo === false ? T.jade : T.slate,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {u.activo === false ? "✓ Activar" : "⛔ Desactivar"}
                </button>
              )}
              {u.id !== "u1" && <button onClick={() => deleteUser(u.id)} style={{ padding: "6px 12px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 8, color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// Quita tildes, pasa a mayúsculas, quita puntos/comas y normaliza espacios —
// para poder comparar "Kamila Group S.A.S." contra "KAMILA GROUP SAS" y
// reconocerlos como el mismo nombre.
function normalizarNombreCliente(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Compara un nombre de Busint contra la lista de clientes ya guardados en
// Administración: "exacto" si coincide igual (normalizado) — no hace falta
// revisarlo; "parecido" si uno contiene al otro (posible duplicado por
// nombre escrito distinto) — se le pregunta al usuario; "nuevo" si no se
// parece a nada — se agrega directo.
function buscarPosibleDuplicado(nombreBusint, clientesExistentes) {
  const norm = normalizarNombreCliente(nombreBusint);
  for (const c of clientesExistentes) {
    if (normalizarNombreCliente(c.nombre) === norm) return { tipo: "exacto", cliente: c };
  }
  for (const c of clientesExistentes) {
    const normC = normalizarNombreCliente(c.nombre);
    if (normC.length >= 4 && norm.length >= 4 && (normC.includes(norm) || norm.includes(normC))) {
      return { tipo: "parecido", cliente: c };
    }
  }
  return { tipo: "nuevo", cliente: null };
}

// Trae en vivo el maestro de clientes de Busint (getClientesBusint) y deja
// que el usuario decida, uno por uno, qué hacer con cada nombre parecido a
// uno que ya existe — nada se guarda hasta que el usuario confirme.
function ImportarClientesBusintModal({ clientesExistentes, onImportar, onClose }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filas, setFilas] = useState([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      setError("");
      try {
        const llamar = httpsCallable(functionsClient, "getClientesBusint");
        const resp = await llamar({});
        if (cancelado) return;
        const procesadas = (resp.data?.clientes || [])
          .map((c) => {
            const match = buscarPosibleDuplicado(c.nombre, clientesExistentes);
            return { ...c, match, accion: match.tipo === "nuevo" ? "agregar" : "omitir" };
          })
          .filter((f) => f.match.tipo !== "exacto");
        setFilas(procesadas);
      } catch (err) {
        if (!cancelado) {
          setError(
            err?.message ||
              "No se pudo consultar el maestro de clientes de Busint. Verifica que la función getClientesBusint esté desplegada."
          );
        }
      }
      if (!cancelado) setCargando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  function setAccion(idx, accion) {
    setFilas((fs) => fs.map((f, i) => (i === idx ? { ...f, accion } : f)));
  }

  function guardar() {
    const nuevos = [];
    const reemplazos = new Map();
    filas.forEach((f) => {
      if (f.accion === "agregar") {
        nuevos.push({ id: uid(), nombre: f.nombre, contacto: f.contacto, email: f.email, telefono: f.telefono });
      } else if (f.accion === "reemplazar" && f.match.cliente) {
        reemplazos.set(f.match.cliente.id, {
          nombre: f.nombre,
          contacto: f.match.cliente.contacto || f.contacto,
          email: f.match.cliente.email || f.email,
          telefono: f.match.cliente.telefono || f.telefono,
        });
      }
    });
    onImportar({ nuevos, reemplazos });
    onClose();
  }

  const totalAccion = filas.filter((f) => f.accion === "agregar" || f.accion === "reemplazar").length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: T.white, borderRadius: 14, padding: 28, maxWidth: 720, width: "100%", maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: T.ink }}>Importar Clientes desde Busint</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.slate, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: T.slate, marginBottom: 16 }}>
          Se consulta el maestro de clientes en vivo. Revisa cada uno — nada se agrega ni se cambia hasta que confirmes.
        </div>
        {cargando && <div style={{ textAlign: "center", padding: 40, color: T.slate }}>Consultando Busint…</div>}
        {error && (
          <div style={{ padding: "12px 16px", background: T.coralBg, borderRadius: 10, color: T.coral, fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {!cargando && !error && (
          <>
            {!filas.length ? (
              <div style={{ textAlign: "center", padding: 32, color: T.slate }}>
                No hay clientes nuevos ni parecidos — tu lista ya coincide con el maestro de Busint.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {filas.map((f, i) => (
                  <div
                    key={f.nombre + i}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: `1px solid ${f.match.tipo === "parecido" ? T.amber : T.border}`,
                      background: f.match.tipo === "parecido" ? T.amberBg : T.canvas,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>
                      {f.nombre}
                      {!f.activo && <span style={{ marginLeft: 8, fontSize: 10, color: T.slate, fontWeight: 400, fontStyle: "italic" }}>(inactivo en Busint)</span>}
                    </div>
                    {f.match.tipo === "parecido" && (
                      <div style={{ fontSize: 11, color: T.amber, fontWeight: 600, marginTop: 2 }}>
                        ⚠ Se parece a "{f.match.cliente.nombre}" — ¿es el mismo cliente?
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, flexWrap: "wrap" }}>
                      {f.match.tipo === "parecido" ? (
                        ["omitir", "reemplazar", "agregar"].map((op) => (
                          <label key={op} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: T.ink }}>
                            <input type="radio" name={`accion-${i}`} checked={f.accion === op} onChange={() => setAccion(i, op)} />
                            {op === "omitir" ? "Omitir" : op === "reemplazar" ? `Reemplazar nombre de "${f.match.cliente.nombre}"` : "Son distintos, agregar como nuevo"}
                          </label>
                        ))
                      ) : (
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: T.ink, fontWeight: 600 }}>
                          <input type="checkbox" checked={f.accion === "agregar"} onChange={(e) => setAccion(i, e.target.checked ? "agregar" : "omitir")} />
                          Agregar como cliente nuevo
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
              <Btn onClick={guardar} disabled={!totalAccion}>Guardar{totalAccion > 0 ? ` (${totalAccion})` : ""}</Btn>
            </div>
          </>
        )}
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
  const [showImportar, setShowImportar] = useState(false);
  function aplicarImportacion({ nuevos, reemplazos }) {
    const actualizados = clientes.map((c) => (reemplazos.has(c.id) ? { ...c, ...reemplazos.get(c.id) } : c));
    onUpdateConfig({ clientes: [...actualizados, ...nuevos] });
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>Clientes</div><div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{clientes.length} cliente{clientes.length !== 1 ? "s" : ""}</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={() => setShowImportar(true)}>⬇ Importar de Busint</Btn>
          <Btn onClick={openNew}>+ Nuevo Cliente</Btn>
        </div>
      </div>
      {showImportar && (
        <ImportarClientesBusintModal
          clientesExistentes={clientes}
          onImportar={aplicarImportacion}
          onClose={() => setShowImportar(false)}
        />
      )}
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

// Muestra cuándo se sincronizó por última vez la bitácora local de Busint
// (busint_referencias_meta/main, escrito tanto por la función programada
// syncReferenciasBusint como por getReferenciasBusint) y deja forzar un
// refresh inmediato sin tener que esperar a la pasada de las 5:00 a.m.
// --- Lectura de imágenes incrustadas en un .xlsx (Foto de cada referencia) ---
// SheetJS ("xlsx", edición community) no expone las imágenes incrustadas de
// un archivo Excel — solo el texto de las celdas. Como un .xlsx es en
// realidad un .zip (formato OOXML), las fotos SÍ se pueden leer abriendo el
// paquete a mano con JSZip y siguiendo la misma cadena de referencias que
// usa Excel internamente: hoja → xl/worksheets/sheetN.xml (trae un
// <drawing r:id="…">) → xl/worksheets/_rels/sheetN.xml.rels (ese r:id
// apunta a un drawingM.xml) → xl/drawings/drawingM.xml (cada imagen está
// "anclada" a una fila con <xdr:from><xdr:row>) → xl/drawings/_rels/
// drawingM.xml.rels (el r:embed de cada imagen apunta al archivo real en
// xl/media/imageX.png). El número de fila del ancla es 0-based e igual de
// índice que el array que arma XLSX.utils.sheet_to_json(ws,{header:1}) —
// por eso alcanza con esa fila para saber a qué REF pertenece cada imagen.
const OOXML_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
// Devuelve todos los elementos con ese nombre "local" (ignora el prefijo de
// namespace del XML — algunos exportadores usan "xdr:", otros no) dentro de
// un nodo/documento.
function xmlLocalAll(root, localName) {
  if (!root) return [];
  return Array.from(root.getElementsByTagName("*")).filter((el) => el.localName === localName);
}
// Resuelve una ruta relativa tipo "../media/image1.png" contra un
// directorio base tipo "xl/drawings", igual que lo haría un navegador.
function resolverRutaXlsx(base, relativo) {
  if (!relativo) return relativo;
  if (relativo.startsWith("/")) return relativo.slice(1);
  const partes = base.split("/");
  for (const p of relativo.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== ".") partes.push(p);
  }
  return partes.join("/");
}
// Comprime una imagen (bytes crudos) al mismo estándar que ya usa el resto
// de la app para fotos (ImageUploader): máx. 800px de lado, JPEG calidad
// 0.72 — así una foto de referencia no infla el documento de Firestore.
function comprimirImagenBytesABase64(bytes, mime) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round((h * MAX) / w); w = MAX; } else { w = Math.round((w * MAX) / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL("image/jpeg", 0.72);
        URL.revokeObjectURL(url);
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch (e) {
      resolve(null);
    }
  });
}
// Para cada hoja del workbook (en el mismo orden que wb.SheetNames de
// SheetJS), devuelve la ruta interna del .xml de esa hoja dentro del .zip
// (p.ej. "xl/worksheets/sheet1.xml"), leyendo xl/workbook.xml +
// xl/_rels/workbook.xml.rels.
async function mapaHojasARutaXlsx(zip, parser) {
  const wbXmlText = await zip.file("xl/workbook.xml")?.async("text");
  const wbRelsXmlText = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!wbXmlText || !wbRelsXmlText) return [];
  const wbDoc = parser.parseFromString(wbXmlText, "application/xml");
  const wbRelsDoc = parser.parseFromString(wbRelsXmlText, "application/xml");
  const sheetsEls = xmlLocalAll(wbDoc, "sheet");
  const relEls = xmlLocalAll(wbRelsDoc, "Relationship");
  return sheetsEls.map((s) => {
    const rid = s.getAttributeNS(OOXML_REL_NS, "id");
    const rel = relEls.find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target") || "";
    return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  });
}
// Trae, para UNA hoja, un mapa {filaIndex0Based: dataURLimagenComprimida}
// siguiendo la cadena hoja→drawing→relaciones→media descrita arriba. Si
// algo en el XML no viene con la forma esperada, simplemente no trae fotos
// de esa hoja (el resto del import por texto sigue funcionando igual).
async function extraerImagenesDeHoja(zip, sheetPath, parser) {
  const mapa = {};
  try {
    const sheetXmlText = await zip.file(sheetPath)?.async("text");
    if (!sheetXmlText) return mapa;
    const sheetDoc = parser.parseFromString(sheetXmlText, "application/xml");
    const drawingEl = xmlLocalAll(sheetDoc, "drawing")[0];
    if (!drawingEl) return mapa;
    const drawingRid = drawingEl.getAttributeNS(OOXML_REL_NS, "id");
    const sheetDir = sheetPath.slice(0, sheetPath.lastIndexOf("/"));
    const sheetFile = sheetPath.slice(sheetPath.lastIndexOf("/") + 1);
    const sheetRelsText = await zip.file(`${sheetDir}/_rels/${sheetFile}.rels`)?.async("text");
    if (!sheetRelsText) return mapa;
    const sheetRelsDoc = parser.parseFromString(sheetRelsText, "application/xml");
    const relDraw = xmlLocalAll(sheetRelsDoc, "Relationship").find((r) => r.getAttribute("Id") === drawingRid);
    if (!relDraw) return mapa;
    const drawingPath = resolverRutaXlsx(sheetDir, relDraw.getAttribute("Target"));
    const drawingXmlText = await zip.file(drawingPath)?.async("text");
    if (!drawingXmlText) return mapa;
    const drawingDoc = parser.parseFromString(drawingXmlText, "application/xml");
    const drawingDir = drawingPath.slice(0, drawingPath.lastIndexOf("/"));
    const drawingFile = drawingPath.slice(drawingPath.lastIndexOf("/") + 1);
    const drawingRelsText = await zip.file(`${drawingDir}/_rels/${drawingFile}.rels`)?.async("text");
    const drawingRelEls = drawingRelsText ? xmlLocalAll(parser.parseFromString(drawingRelsText, "application/xml"), "Relationship") : [];
    const anchors = [...xmlLocalAll(drawingDoc, "twoCellAnchor"), ...xmlLocalAll(drawingDoc, "oneCellAnchor")];
    for (const anchor of anchors) {
      const from = xmlLocalAll(anchor, "from")[0];
      const rowEl = from && xmlLocalAll(from, "row")[0];
      const blip = xmlLocalAll(anchor, "blip")[0];
      if (!rowEl || !blip) continue;
      const fila = parseInt(rowEl.textContent, 10);
      const embedRid = blip.getAttributeNS(OOXML_REL_NS, "embed");
      const relImg = drawingRelEls.find((r) => r.getAttribute("Id") === embedRid);
      if (!relImg || Number.isNaN(fila)) continue;
      const mediaPath = resolverRutaXlsx(drawingDir, relImg.getAttribute("Target"));
      const mediaFile = zip.file(mediaPath);
      if (!mediaFile) continue;
      const bytes = await mediaFile.async("uint8array");
      const ext = (mediaPath.split(".").pop() || "png").toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : "image/png";
      const dataUrl = await comprimirImagenBytesABase64(bytes, mime);
      if (dataUrl) mapa[fila] = dataUrl;
    }
  } catch (e) {
    // Hoja con XML atípico — se ignora solo la parte de fotos de esta hoja.
  }
  return mapa;
}
// Lista de referencias creadas dentro de ATLAS (prototipos + referencias de
// cápsulas) que TODAVÍA no están confirmadas en Busint — para que el equipo
// sepa cuáles hay que dar de alta allá antes de que alguien, trabajando
// directo en Busint (sin pasar por ATLAS), reutilice por accidente ese
// mismo número de consecutivo. "Confirmada en Busint" = el doc en
// busint_referencias tiene el campo `actualizadoEn`, que SOLO lo pone una
// sincronización real con Busint (ver guardarReferenciasBusintEnFirestore
// en functions/index.js) — si el doc no existe, o existe solo por un
// import manual de Excel (sin actualizadoEn), se cuenta como pendiente.
function ReferenciasNoEnBusintView({ protos, capsulas }) {
  const [busint, setBusint] = useState(null); // null = todavía cargando
  useEffect(() => {
    let activo = true;
    getDocs(collection(db, "busint_referencias")).then((snap) => {
      if (!activo) return;
      // Indexado SIN guion (ver normalizarRefComparacion) — así una ref de
      // ATLAS con guion ("98-5609") sí reconoce que Busint ya la tiene
      // aunque esté guardada sin guion ("985609").
      const mapa = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const norm = normalizarRefComparacion(data.ref || d.id);
        if (norm) mapa[norm] = data;
      });
      setBusint(mapa);
    });
    return () => { activo = false; };
  }, []);

  if (busint === null) {
    return <div style={{ fontSize: 12.5, color: T.slate, padding: "10px 14px" }}>Revisando bitácora de Busint...</div>;
  }

  const items = [];
  function anotar(ref, createdAt, origen) {
    const codigo = String(ref || "").trim();
    if (!codigo) return;
    if (busint[normalizarRefComparacion(codigo)]?.actualizadoEn) return; // ya confirmada en Busint
    items.push({ ref: codigo, createdAt: createdAt || "", origen });
  }
  (protos || []).forEach((p) => { if (!p.eliminado) anotar(p.reference, p.createdAt, "Prototipo"); });
  (capsulas || []).forEach((c) => {
    if (c.eliminado) return;
    (c.referencias || []).forEach((r) => { if (!r.eliminado) anotar(r.reference, r.createdAt, `Cápsula: ${c.name || ""}`); });
  });
  // Si la misma ref aparece en más de un lugar, se queda solo la más
  // antigua (la que más urge revisar).
  const porRef = new Map();
  items.forEach((it) => {
    const previo = porRef.get(it.ref);
    if (!previo || (it.createdAt && it.createdAt < previo.createdAt)) porRef.set(it.ref, it);
  });
  const pendientes = [...porRef.values()].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  function diasDesde(fechaISO) {
    if (!fechaISO) return null;
    const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000);
    return Number.isFinite(dias) ? dias : null;
  }

  return (
    <div style={{ padding: "10px 14px", background: pendientes.length ? T.amberBg : T.jadeBg, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: pendientes.length ? T.amber : T.jade, marginBottom: pendientes.length ? 8 : 0 }}>
        {pendientes.length ? `⚠ ${pendientes.length} referencia(s) creadas en ATLAS que aún no están confirmadas en Busint` : "✓ Todas las referencias de ATLAS ya están confirmadas en Busint"}
      </div>
      {pendientes.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `1px solid ${T.border}` }}>
              <th style={{ padding: "4px 8px" }}>Ref</th>
              <th style={{ padding: "4px 8px" }}>Origen</th>
              <th style={{ padding: "4px 8px" }}>Creada</th>
              <th style={{ padding: "4px 8px" }}>Días</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((p) => {
              const dias = diasDesde(p.createdAt);
              const urgente = dias != null && dias >= 3;
              return (
                <tr key={p.ref} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "4px 8px", fontWeight: 700, color: T.ink }}>{p.ref}</td>
                  <td style={{ padding: "4px 8px", color: T.slate }}>{p.origen}</td>
                  <td style={{ padding: "4px 8px", color: T.slate }}>{p.createdAt || "—"}</td>
                  <td style={{ padding: "4px 8px", color: urgente ? T.coral : T.slate, fontWeight: urgente ? 700 : 400 }}>{dias != null ? dias : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
function BusintSyncPanel() {
  const [meta, setMeta] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState("");
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "busint_referencias_meta", "main"), (snap) => {
      setMeta(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, []);
  const [exportando, setExportando] = useState(false);
  // --- Importar bitácora externa desde Excel (p.ej. "KAMILA
  // REFERENCIAS_PIJAMAS.xlsx") ---
  // Algunas líneas/clientes (Kamila, etc.) manejan su propia bitácora de
  // referencias por fuera de Busint (en Excel), con hojas por prefijo-
  // segmento y columnas FOTO/REF/CATEGORIA/DESCRIPCION/TELA/RANGO. Para que
  // ATLAS no sugiera un consecutivo que ya está tomado en esa bitácora (ni
  // lo marque como duplicado si ya existe), esas referencias se importan
  // acá mismo a la colección "busint_referencias" — así
  // useMaestroReferenciasBusint()/sugerirReferencia()/
  // SugerenciaYVerificacionRef ya las tienen en cuenta automáticamente, sin
  // ningún cambio en esa lógica. No se pisan referencias que ya existan por
  // sincronización con Busint: si el REF ya está en la bitácora, el import
  // solo completa los campos que vengan vacíos (no borra lo que ya había).
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState("");
  // Guarda la última comparación (Busint vs. lo recién importado) para
  // poder descargarla en Excel con colores sin tener que repetir el import.
  const [comparacion, setComparacion] = useState(null);
  const [descargandoComparacion, setDescargandoComparacion] = useState(false);
  const fileInputRef = useRef(null);
  // Quita tildes/diéresis y pasa a mayúsculas, para poder reconocer
  // encabezados como "DESCRIPCIÓN" o "CATEGORÍA" sin importar acentos.
  function normalizarEncabezado(v) {
    return String(v ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toUpperCase();
  }
  // Importa uno o varios archivos Excel de bitácora manual (p.ej. varias
  // colecciones/clientes que hoy se llevan a mano) en una sola pasada:
  // 1) Lee el texto de todas las hojas de todos los archivos con "xlsx".
  // 2) Lee también las fotos incrustadas de cada hoja con JSZip (ver
  //    extraerImagenesDeHoja arriba) y las amarra a la fila de su REF.
  // 3) Combina todo contra lo que YA hay en Firestore (una sola lectura,
  //    tomada ANTES de escribir nada) — así, si el mismo REF aparece en dos
  //    archivos subidos juntos, no se cuenta como "nuevo" dos veces.
  // 4) Escribe en "busint_referencias" completando solo lo que esté vacío
  //    (Busint SIEMPRE manda si el dato ya vino de una sincronización real).
  // 5) Arma la comparación de tres colores para el Excel descargable:
  //    verde = el REF ya existe en Busint (coincide), amarillo = el REF
  //    está en la bitácora manual pero Busint todavía no lo tiene, naranja
  //    = existe en ambos lados pero la categoría/descripción no coincide.
  async function importarBitacoraExcel(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setImportando(true);
    setResultadoImport("");
    setComparacion(null);
    try {
      const XLSX = await import("xlsx");
      const JSZip = (await import("jszip")).default;
      const parser = new DOMParser();
      const existentes = await getDocs(collection(db, "busint_referencias"));
      const yaExisten = {};
      // Mapa adicional SIN guion — Busint a veces guarda el mismo código sin
      // guion (ver normalizarRefComparacion). Sin esto, una fila del Excel
      // con guion ("98-5609") no reconocería que ese REF ya existe en
      // Firestore como "985609", y terminaría creando un documento
      // duplicado en vez de completar el que ya había.
      const yaExistenPorNormal = {};
      existentes.docs.forEach((d) => {
        const data = d.data();
        yaExisten[d.id] = data;
        const norm = normalizarRefComparacion(data.ref || d.id);
        if (norm) yaExistenPorNormal[norm] = { id: d.id, data };
      });
      // Acumulador combinado de TODOS los archivos subidos en esta pasada,
      // indexado por id (ref saneado) — si el mismo REF aparece en más de
      // un archivo, el último gana el texto pero no se pierde ninguna foto
      // ya encontrada.
      const combinado = {};
      const porArchivo = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const zip = await JSZip.loadAsync(buf);
        const rutasHojas = await mapaHojasARutaXlsx(zip, parser);
        let hojasUsadas = 0, filasArchivo = 0, filasSinRef = 0, fotosArchivo = 0;
        for (let sIdx = 0; sIdx < wb.SheetNames.length; sIdx++) {
          const ws = wb.Sheets[wb.SheetNames[sIdx]];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          // Busca la fila de encabezados (la que trae una celda "REF") —
          // ignora la fila de título de arriba (p.ej. "PIJAMAS DAMA - KAMILA").
          let idxEncabezado = -1;
          let normalizadaEncabezado = [];
          for (let i = 0; i < aoa.length; i++) {
            const normalizada = (aoa[i] || []).map(normalizarEncabezado);
            if (normalizada.indexOf("REF") !== -1) {
              idxEncabezado = i;
              normalizadaEncabezado = normalizada;
              break;
            }
          }
          if (idxEncabezado === -1) continue; // hoja sin formato reconocible
          hojasUsadas++;
          // Busca por PALABRA CLAVE (no coincidencia exacta) — así reconoce
          // tanto un encabezado corto ("RANGO", "LINEA") como uno largo con
          // aclaración entre paréntesis ("SUBCATEGORÍA (RANGO/EXTENSIÓN)",
          // "LINEA (BASICO/PREMIUM)"), que es como vienen los archivos reales
          // de Kamila.
          const idxPorPalabra = (...palabras) => normalizadaEncabezado.findIndex((h) => palabras.some((p) => h.includes(p)));
          const idxRef = normalizadaEncabezado.indexOf("REF");
          const idxCategoria = idxPorPalabra("CATEGORIA");
          const idxDescripcion = idxPorPalabra("DESCRIPCION");
          const idxTela = idxPorPalabra("TELA");
          const idxSilueta = idxPorPalabra("SILUETA", "CONFECCION");
          const idxSubcategoria = idxPorPalabra("SUBCATEGORIA", "RANGO");
          // OJO: la columna "LINEA" de los archivos manuales de Kamila
          // significa básica/premium — es un concepto DISTINTO de "Línea"
          // en ATLAS (que es Dama/Caballero, igual que Busint) y también
          // distinto del campo "linea" que trae Busint (hombre/dama). Para
          // no mezclarlos, este dato se guarda como "nivel" (básica/premium).
          const idxNivel = idxPorPalabra("LINEA");
          const idxBase = idxPorPalabra("BASE");
          const imagenesFila = rutasHojas[sIdx] ? await extraerImagenesDeHoja(zip, rutasHojas[sIdx], parser) : {};
          for (let i = idxEncabezado + 1; i < aoa.length; i++) {
            const fila = aoa[i] || [];
            const ref = idxRef !== -1 ? String(fila[idxRef] ?? "").trim() : "";
            if (!ref) { filasSinRef++; continue; }
            const limpiar = (v) => String(v ?? "").replace(/\r?\n/g, " ").trim();
            const id = ref.replace(/\//g, "_");
            const foto = imagenesFila[i] || null;
            if (foto) fotosArchivo++;
            combinado[id] = {
              ref,
              categoria: idxCategoria !== -1 ? limpiar(fila[idxCategoria]) : "",
              descripcion: idxDescripcion !== -1 ? limpiar(fila[idxDescripcion]) : "",
              tela: idxTela !== -1 ? limpiar(fila[idxTela]) : "",
              tipoConfeccion: idxSilueta !== -1 ? limpiar(fila[idxSilueta]) : "",
              subcategoria: idxSubcategoria !== -1 ? limpiar(fila[idxSubcategoria]) : "",
              nivel: idxNivel !== -1 ? limpiar(fila[idxNivel]) : "",
              base: idxBase !== -1 ? limpiar(fila[idxBase]) : "",
              foto: foto || combinado[id]?.foto || null,
              archivoOrigen: file.name,
            };
            filasArchivo++;
          }
        }
        porArchivo.push({ nombre: file.name, hojasUsadas, filasArchivo, filasSinRef, fotosArchivo });
      }
      const filas = Object.values(combinado);
      if (!filas.length) {
        setResultadoImport(`⚠ No se encontró ninguna fila con REF reconocible en ${files.length === 1 ? `"${files[0].name}"` : `los ${files.length} archivos`}.`);
        setImportando(false);
        return;
      }
      // No se pisan campos que ya tengan valor por sincronización con
      // Busint — el Excel solo COMPLETA lo que esté vacío. "actualizadoEn"
      // solo lo pone la sincronización real con Busint (Cloud Function), así
      // que sirve para saber con certeza si un REF YA está en Busint.
      const items = filas.map((f) => {
        // Si ya existe un doc con este REF salvo el guion (p.ej. Busint lo
        // tiene como "985609" y el Excel trae "98-5609"), se reutiliza ESE
        // mismo id — así se completa el doc real en vez de crear uno nuevo
        // y duplicado.
        const coincidencia = yaExistenPorNormal[normalizarRefComparacion(f.ref)];
        const id = coincidencia ? coincidencia.id : f.ref.replace(/\//g, "_");
        const previo = coincidencia ? coincidencia.data : (yaExisten[id] || {});
        const item = { id, ref: previo.ref || f.ref };
        if (f.categoria && !previo.categoria) item.categoria = f.categoria;
        if (f.descripcion && !previo.descripcion) item.descripcion = f.descripcion;
        if (f.subcategoria && !previo.subcategoria) item.subcategoria = f.subcategoria;
        if (f.tipoConfeccion && !previo.tipoConfeccion) item.tipoConfeccion = f.tipoConfeccion;
        if (f.tela) item.tela = f.tela; // Busint no expone tela — la del Excel manda
        if (f.base && !previo.base) item.base = f.base; // Busint no expone base — la del Excel manda
        // nivel (básica/premium, de tus archivos) es un campo aparte de
        // "Línea" (Dama/Caballero) y de "linea" (hombre/dama, el que trae
        // Busint) — nunca se pisan entre sí.
        if (f.nivel && !previo.nivel) item.nivel = f.nivel;
        if (f.foto && !previo.foto) item.foto = f.foto;
        if (!previo.origen && !previo.actualizadoEn) { item.origen = "bitacora_excel"; item.origenArchivo = f.archivoOrigen; item.importadoEn = new Date().toISOString(); }
        return item;
      });
      // Firestore permite máx. 500 escrituras por batch — se parte en
      // bloques de 400 por margen (las fotos hacen cada doc más pesado).
      for (let i = 0; i < items.length; i += 400) {
        await fsBatch("busint_referencias", items.slice(i, i + 400));
      }
      // --- Comparación de 3 colores contra Busint (Busint = mando) ---
      const verde = [], amarillo = [], naranja = [];
      filas.forEach((f) => {
        const previo = yaExistenPorNormal[normalizarRefComparacion(f.ref)]?.data;
        const existeEnBusint = !!previo?.actualizadoEn;
        if (!existeEnBusint) {
          amarillo.push({ ref: f.ref, categoria: f.categoria, descripcion: f.descripcion, archivoOrigen: f.archivoOrigen });
        } else {
          const conflicto = (f.categoria && previo.categoria && f.categoria !== previo.categoria) || (f.descripcion && previo.descripcion && f.descripcion !== previo.descripcion);
          if (conflicto) {
            naranja.push({ ref: f.ref, categoriaBitacora: f.categoria, categoriaBusint: previo.categoria || "", descripcionBitacora: f.descripcion, descripcionBusint: previo.descripcion || "", archivoOrigen: f.archivoOrigen });
          } else {
            verde.push({ ref: f.ref, categoria: previo.categoria || f.categoria, descripcion: previo.descripcion || f.descripcion, archivoOrigen: f.archivoOrigen });
          }
        }
      });
      setComparacion({ verde, amarillo, naranja, generadoEn: new Date().toISOString() });
      const nuevos = items.filter((it) => !yaExisten[it.id]).length;
      const totalFotos = filas.filter((f) => f.foto).length;
      const resumenArchivos = porArchivo.map((a) => `"${a.nombre}": ${a.filasArchivo} fila(s) en ${a.hojasUsadas} hoja(s)${a.fotosArchivo ? `, ${a.fotosArchivo} foto(s)` : ""}${a.filasSinRef ? `, ${a.filasSinRef} sin REF` : ""}`).join(" · ");
      setResultadoImport(`✅ ${filas.length} referencia(s) combinadas — ${nuevos} nueva(s), ${filas.length - nuevos} ya existían (se completaron campos vacíos), ${totalFotos} con foto. ${amarillo.length} faltan en Busint, ${naranja.length} con datos distintos entre bitácora y Busint. ${resumenArchivos}`);
    } catch (err) {
      setResultadoImport(`⚠ No se pudo importar — ${err?.message || err}`);
    }
    setImportando(false);
  }
  function handleFileChange(e) {
    const files = e.target.files;
    const lista = files && files.length ? Array.from(files) : null;
    e.target.value = ""; // permite volver a elegir los mismos archivos después
    if (lista) importarBitacoraExcel(lista);
  }
  // Descarga la última comparación (ver importarBitacoraExcel) como un
  // .xlsx con 3 hojas de color — mismo estilo de marca (T.ink/T.seam/etc.)
  // que ya usa el resto de los exportadores de ATLAS.
  async function descargarComparacionExcel() {
    if (!comparacion) return;
    setDescargandoComparacion(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const COLOR_INK = "1A1A2E", COLOR_SEAM = "C8B8A2";
      const VERDE = "D7ECD9", AMARILLO = "FCEFC7", NARANJA = "FBDCC5";
      const THIN = { style: "thin", color: { rgb: "E8E2DB" } };
      const BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
      function hoja(titulo, encabezados, filas, colorFondo) {
        const aoa = [encabezados, ...filas];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        for (let r = 0; r < aoa.length; r++) {
          for (let c = 0; c < encabezados.length; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = { t: "s", v: "" };
            ws[addr].s = r === 0
              ? { fill: { patternType: "solid", fgColor: { rgb: COLOR_INK } }, font: { bold: true, sz: 10, color: { rgb: COLOR_SEAM } }, border: BOX, alignment: { vertical: "center", horizontal: "center", wrapText: true } }
              : { fill: { patternType: "solid", fgColor: { rgb: colorFondo } }, font: { sz: 10, color: { rgb: "1A1A2E" } }, border: BOX, alignment: { vertical: "center", horizontal: "left", wrapText: true } };
          }
        }
        ws["!cols"] = encabezados.map(() => ({ wch: 26 }));
        return ws;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, hoja("Coincide", ["REF", "Categoría", "Descripción", "Archivo"], comparacion.verde.map((f) => [f.ref, f.categoria, f.descripcion, f.archivoOrigen]), VERDE), "Coincide con Busint");
      XLSX.utils.book_append_sheet(wb, hoja("Falta", ["REF", "Categoría", "Descripción", "Archivo"], comparacion.amarillo.map((f) => [f.ref, f.categoria, f.descripcion, f.archivoOrigen]), AMARILLO), "Falta en Busint");
      XLSX.utils.book_append_sheet(wb, hoja("Conflicto", ["REF", "Categoría (bitácora)", "Categoría (Busint)", "Descripción (bitácora)", "Descripción (Busint)", "Archivo"], comparacion.naranja.map((f) => [f.ref, f.categoriaBitacora, f.categoriaBusint, f.descripcionBitacora, f.descripcionBusint, f.archivoOrigen]), NARANJA), "Datos distintos");
      XLSX.writeFile(wb, `Comparacion_Bitacora_vs_Busint_${today()}.xlsx`);
    } catch (err) {
      setResultadoImport(`⚠ No se pudo descargar la comparación — ${err?.message || err}`);
    }
    setDescargandoComparacion(false);
  }
  async function sincronizar() {
    setSincronizando(true);
    setResultado("");
    try {
      const llamar = httpsCallable(functionsClient, "getReferenciasBusint");
      const resp = await llamar({});
      setResultado(`✅ ${resp.data?.total ?? 0} referencias sincronizadas.`);
    } catch (err) {
      setResultado(`⚠ ${err?.message || "No se pudo sincronizar. Verifica que getReferenciasBusint esté desplegada."}`);
    }
    setSincronizando(false);
  }
  // Descarga toda la bitácora guardada en Firestore (busint_referencias) a
  // un .xlsx, igual en espíritu al archivo de referencias que ya manejan
  // por fuera (ej. "KAMILA REFERENCIAS_PIJAMAS.xlsx") — así queda algo para
  // abrir y revisar sin tener que entrar a Firebase.
  async function exportarBitacoraExcel() {
    setExportando(true);
    try {
      const snap = await getDocs(collection(db, "busint_referencias"));
      const filas = snap.docs
        .map((d) => d.data())
        .sort((a, b) => String(a.ref || "").localeCompare(String(b.ref || ""), "es", { numeric: true }));
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      // "BASE" y "TELA" quedan vacías a propósito: Busint no las expone en
      // ApiGen_Referencias (no existen esos campos en su maestro), así que
      // se llenan a mano en el Excel, igual que en el archivo de Kamila.
      const aoa = [
        ["REF", "BASE", "CATEGORIA", "DESCRIPCIÓN", "TELA", "SILUETA (TIPO DE CONFECCIÓN)", "LINEA (BASICO/PREMIUM)", "SUBCATEGORÍA (RANGO/EXTENSIÓN)"],
        ...filas.map((f) => [f.ref || "", "", f.categoria || "", f.descripcion || "", "", f.tipoConfeccion || "", f.linea || "", f.subcategoria || ""]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Bitácora Busint");
      XLSX.writeFile(wb, `Bitacora_Referencias_Busint_${today()}.xlsx`);
    } catch (err) {
      setResultado(`⚠ No se pudo exportar — ${err?.message || err}`);
    }
    setExportando(false);
  }
  // --- Probar 1 referencia en vivo (registro crudo completo de Busint) ---
  // Pensado para revisar, antes de decidir capturar un campo nuevo, qué
  // trae Busint REALMENTE para una ref puntual (ej. "98-5609") — Busint no
  // tiene un endpoint de "una sola referencia", así que la Cloud Function
  // consulta el maestro completo y filtra (ver probarReferenciaBusint).
  const [refPrueba, setRefPrueba] = useState("");
  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState(null);
  async function probarReferencia() {
    const ref = refPrueba.trim();
    if (!ref) return;
    setProbando(true);
    setResultadoPrueba(null);
    try {
      const llamar = httpsCallable(functionsClient, "probarReferenciaBusint");
      const resp = await llamar({ ref });
      setResultadoPrueba(resp.data);
    } catch (err) {
      setResultadoPrueba({ error: err?.message || "No se pudo consultar. Verifica que probarReferenciaBusint esté desplegada." });
    }
    setProbando(false);
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", background: T.denimBg, borderRadius: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, color: T.denim, fontWeight: 600 }}>
          🔄 Bitácora de referencias Busint — se actualiza sola todos los días a las 5:00 a.m.
          {meta?.ultimaSync && <div style={{ marginTop: 2 }}>Última sincronización: {new Date(meta.ultimaSync).toLocaleString("es-CO")} · {meta.total} referencias</div>}
          {!meta && <div style={{ marginTop: 2 }}>Aún no se ha sincronizado ninguna vez.</div>}
          {resultado && <div style={{ marginTop: 4 }}>{resultado}</div>}
          {resultadoImport && <div style={{ marginTop: 4 }}>{resultadoImport}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={handleFileChange} />
          <Btn variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importando}>{importando ? "Importando..." : "📤 Importar bitácora(s) Excel"}</Btn>
          {comparacion && (
            <Btn variant="secondary" onClick={descargarComparacionExcel} disabled={descargandoComparacion}>{descargandoComparacion ? "Generando..." : "📊 Descargar comparación"}</Btn>
          )}
          <Btn variant="secondary" onClick={exportarBitacoraExcel} disabled={exportando || !meta}>{exportando ? "Generando..." : "📥 Descargar Excel"}</Btn>
          <Btn onClick={sincronizar} disabled={sincronizando}>{sincronizando ? "Sincronizando..." : "Sincronizar ahora"}</Btn>
        </div>
      </div>
      <div style={{ padding: "10px 14px", background: T.canvas, border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.slate, marginBottom: 8 }}>🧪 Probar una referencia puntual en vivo (registro crudo de Busint, sin filtrar)</div>
        <div style={{ display: "flex", gap: 8, marginBottom: resultadoPrueba ? 10 : 0 }}>
          <input value={refPrueba} onChange={(e) => setRefPrueba(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") probarReferencia(); }} placeholder="Ej: 98-5609" style={{ flex: 1, maxWidth: 220, padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
          <Btn variant="secondary" onClick={probarReferencia} disabled={probando || !refPrueba.trim()}>{probando ? "Consultando..." : "Probar"}</Btn>
        </div>
        {resultadoPrueba?.error && <div style={{ fontSize: 12.5, color: T.coral, fontWeight: 600 }}>⚠ {resultadoPrueba.error}</div>}
        {resultadoPrueba && !resultadoPrueba.error && !resultadoPrueba.encontrada && (
          <div style={{ fontSize: 12.5, color: T.slate }}>No se encontró "{refPrueba}" en el maestro de Busint ({resultadoPrueba.totalEnBusint} referencias revisadas).</div>
        )}
        {resultadoPrueba?.encontrada && (
          <div>
            <div style={{ fontSize: 11.5, color: T.slate, marginBottom: 6 }}>Encontrada — {resultadoPrueba.totalEnBusint} referencias revisadas en total. Estos son TODOS los campos que mandó Busint, sin filtrar:</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                {Object.entries(resultadoPrueba.referencia).map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "4px 8px", fontWeight: 700, color: T.ink, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
                    <td style={{ padding: "4px 8px", color: T.slate, wordBreak: "break-word" }}>{v === "" ? <em>(vacío)</em> : String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
// Prototipos, cápsulas y referencias-de-cápsula con eliminado:true — nunca
// se borran de Firestore al eliminarlos desde Prototipos/Cápsulas (ver
// deleteProto/deleteCapsula/deleteRefFromCapsula), solo se marcan y se
// esconden de protosVisibles/capsulasVisibles. Acá se pueden restaurar, o sí
// borrar para siempre (purgar*, irreversible).
function PapeleraView({ protos, capsulas, onRestaurarProto, onRestaurarCapsula, onRestaurarRef, onPurgarProto, onPurgarCapsula, onPurgarRef }) {
  const [confirmPurga, setConfirmPurga] = useState(null);
  const protosEliminados = protos.filter((p) => p.eliminado).sort((a, b) => (b.eliminadoEn || "").localeCompare(a.eliminadoEn || ""));
  const capsulasEliminadas = capsulas.filter((c) => c.eliminado).sort((a, b) => (b.eliminadoEn || "").localeCompare(a.eliminadoEn || ""));
  // Solo referencias eliminadas de cápsulas que SIGUEN vivas — si la cápsula
  // entera está eliminada, sus referencias ya aparecen bajo "Cápsulas" y no
  // hace falta listarlas dos veces.
  const refsEliminadas = capsulas
    .filter((c) => !c.eliminado)
    .flatMap((c) => (c.referencias || []).filter((r) => r.eliminado).map((r) => ({ ...r, capsulaId: c.id, capsulaName: c.name })))
    .sort((a, b) => (b.eliminadoEn || "").localeCompare(a.eliminadoEn || ""));
  const total = protosEliminados.length + capsulasEliminadas.length + refsEliminadas.length;
  function ejecutarPurga() {
    if (!confirmPurga) return;
    if (confirmPurga.tipo === "proto") onPurgarProto(confirmPurga.id);
    if (confirmPurga.tipo === "capsula") onPurgarCapsula(confirmPurga.id);
    if (confirmPurga.tipo === "ref") onPurgarRef(confirmPurga.capId, confirmPurga.id);
    setConfirmPurga(null);
  }
  function Fila({ icono, titulo, subtitulo, eliminadoEn, eliminadoPor, onRestaurar, onPurgar }) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.canvas, borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{icono} {titulo}</div>
          <div style={{ fontSize: 11.5, color: T.slate, marginTop: 2 }}>
            {subtitulo ? `${subtitulo} · ` : ""}Eliminado {eliminadoEn ? new Date(eliminadoEn).toLocaleString("es-CO") : "—"}{eliminadoPor ? ` por ${eliminadoPor}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small variant="success" onClick={onRestaurar}>↩ Restaurar</Btn>
          <Btn small variant="danger" onClick={onPurgar}>🗑 Eliminar definitivamente</Btn>
        </div>
      </div>
    );
  }
  return (
    <div>
      {confirmPurga && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 400, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.coral, marginBottom: 12 }}>⚠ Eliminar definitivamente</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar <strong>"{confirmPurga.nombre}"</strong> para siempre? Esta vez sí es irreversible — ya no queda en la Papelera.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmPurga(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={ejecutarPurga}>Sí, eliminar para siempre</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 6 }}>Papelera</div>
      <div style={{ fontSize: 12.5, color: T.slate, marginBottom: 16 }}>Prototipos, cápsulas y referencias eliminados quedan aquí — restáuralos o bórralos para siempre.</div>
      {total === 0 && <div style={{ textAlign: "center", padding: 32, color: T.slate, fontSize: 13 }}>La papelera está vacía.</div>}
      {protosEliminados.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 8 }}>Prototipos ({protosEliminados.length})</div>
          {protosEliminados.map((p) => (
            <Fila key={p.id} icono="⬡" titulo={`${p.name} — ${p.reference}`} subtitulo={p.cliente || ""} eliminadoEn={p.eliminadoEn} eliminadoPor={p.eliminadoPor}
              onRestaurar={() => onRestaurarProto(p.id)} onPurgar={() => setConfirmPurga({ tipo: "proto", id: p.id, nombre: p.name })} />
          ))}
        </div>
      )}
      {capsulasEliminadas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 8 }}>Cápsulas ({capsulasEliminadas.length})</div>
          {capsulasEliminadas.map((c) => (
            <Fila key={c.id} icono="🗂" titulo={c.name} subtitulo={`${c.referencias?.length || 0} referencia${c.referencias?.length !== 1 ? "s" : ""}`} eliminadoEn={c.eliminadoEn} eliminadoPor={c.eliminadoPor}
              onRestaurar={() => onRestaurarCapsula(c.id)} onPurgar={() => setConfirmPurga({ tipo: "capsula", id: c.id, nombre: c.name })} />
          ))}
        </div>
      )}
      {refsEliminadas.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, textTransform: "uppercase", marginBottom: 8 }}>Referencias de cápsula ({refsEliminadas.length})</div>
          {refsEliminadas.map((r) => (
            <Fila key={r.id} icono="⬢" titulo={`${r.name} — ${r.reference}`} subtitulo={r.capsulaName} eliminadoEn={r.eliminadoEn} eliminadoPor={r.eliminadoPor}
              onRestaurar={() => onRestaurarRef(r.capsulaId, r.id)} onPurgar={() => setConfirmPurga({ tipo: "ref", id: r.id, capId: r.capsulaId, nombre: r.name })} />
          ))}
        </div>
      )}
    </div>
  );
}
// Plantilla sugerida de Códigos de Referencia, a partir del cuadro real que
// maneja Industrias Yanko (prefijo 98 = su fábrica / línea dama, incluye
// Camisa y Siza Caballero porque se producen ahí mismo; 96 = Enterizos-
// Vestidos "Reform"). Cada categoría del grupo de bloques de 100 (Short
// Cachetero, Bicicletero, Faldas, Capri, Leggins, Blusa Mangas, Siza, Top,
// Buso, Short) desborda a su PROPIO bloque de 1000 dentro del rango 2000-
// 9999 cuando se llena — confirmado solo para Faldas (2000-2999) por ahora.
// Las otras 9 quedan SIN desborde a propósito (en vez de adivinar un bloque
// que podría chocar con Faldas o con Camisa/Siza Caballero, que ya usan
// 5001-6999) — agrégaselo tú mismo en la tabla de abajo cuando definas cuál
// bloque de 1000 le toca a cada una. Conjuntos/Enterizos-Vestidos (1000-
// 1999) fue confirmado tal cual. Camisa Caballero, Siza Caballero y
// Enterizos-Vestidos (Reform) son un punto de partida razonable — no
// vinieron 100% confirmados, así que quedan editables en esta misma
// pantalla (Eliminar + volver a Agregar con el rango correcto) sin tocar
// nada de código.
const PLANTILLA_CODIGOS_REFERENCIA = [
  { categoria: "Short Cachetero", prefijo: "98", rangoInicio: 1, rangoFin: 99, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Bicicletero", prefijo: "98", rangoInicio: 101, rangoFin: 199, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Faldas", prefijo: "98", rangoInicio: 201, rangoFin: 299, desbordeInicio: 2000, desbordeFin: 2999 },
  { categoria: "Capri", prefijo: "98", rangoInicio: 301, rangoFin: 399, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Leggins", prefijo: "98", rangoInicio: 401, rangoFin: 499, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Blusa Mangas", prefijo: "98", rangoInicio: 501, rangoFin: 599, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Siza", prefijo: "98", rangoInicio: 601, rangoFin: 699, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Top", prefijo: "98", rangoInicio: 701, rangoFin: 799, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Buso", prefijo: "98", rangoInicio: 801, rangoFin: 899, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Short", prefijo: "98", rangoInicio: 901, rangoFin: 999, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Conjuntos / Enterizos - Vestidos", prefijo: "98", rangoInicio: 1000, rangoFin: 1999, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Camisa Caballero", prefijo: "98", rangoInicio: 5001, rangoFin: 5999, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Siza Caballero", prefijo: "98", rangoInicio: 6001, rangoFin: 6999, desbordeInicio: "", desbordeFin: "" },
  { categoria: "Enterizos - Vestidos (Reform)", prefijo: "96", rangoInicio: 1001, rangoFin: 1999, desbordeInicio: "", desbordeFin: "" },
];
// Llena config.lineas con los valores REALES que trae Busint en su campo
// "linea" — no son solo "Dama"/"Caballero", son códigos compuestos (ej.
// "INFAN FEME BASICO"), así que en vez de adivinarlos se leen directo de la
// bitácora ya sincronizada (busint_referencias, la misma que usa
// BusintSyncPanel/useMaestroReferenciasBusint) y se agregan los que falten.
// Solo agrega — nunca borra valores que ya hayas puesto a mano.
function SincronizarLineasBusintBtn({ config, onUpdateConfig }) {
  const busint = useMaestroReferenciasBusint();
  const [msg, setMsg] = useState("");
  function sincronizar() {
    const valores = new Set();
    (busint.lista || []).forEach((r) => {
      const v = String(r.linea || "").trim();
      if (v) valores.add(v);
    });
    if (valores.size === 0) {
      setMsg('⚠ Aún no hay bitácora de Busint sincronizada — usa "Sincronizar ahora" (arriba) primero.');
      return;
    }
    const existentes = new Set(config.lineas || []);
    const nuevas = [...valores].filter((v) => !existentes.has(v)).sort();
    if (nuevas.length === 0) {
      setMsg(`✅ Ya tienes las ${valores.size} línea(s) que trae Busint — nada nuevo que agregar.`);
      return;
    }
    onUpdateConfig({ lineas: [...(config.lineas || []), ...nuevas] });
    setMsg(`✅ Se agregaron ${nuevas.length} línea(s) nueva(s) desde Busint: ${nuevas.join(", ")}`);
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <Btn variant="secondary" onClick={sincronizar}>🔄 Cargar líneas reales desde Busint</Btn>
      {msg && <div style={{ fontSize: 12, color: T.slate, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
function AdminView({ config, onUpdateConfig, users, onUpdateUsers, protos, capsulas, onUpdateProto, onUpdateCapsula, onDeleteProto, onDeleteCapsula, onRestaurarProto, onRestaurarCapsula, onRestaurarRef, onPurgarProto, onPurgarCapsula, onPurgarRef, isAdmin }) {
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
    ["bitacora", "📜 Bitácoras"],
    ["stats", "📊 Estadísticas"],
  ];
  // KPIs ahora es un módulo de compañía completo (no solo Diseño — cubre
  // Corte, Ventas, Contabilidad, Planeación, etc.), por eso su permiso vive
  // junto a Contabilidad/Planeación y no dentro de DISENO_ITEMS_DEF.
  const OTROS_MODULOS_DEF = [["contabilidad", "💰 Contabilidad"], ["planeacion", "📋 Planeación"], ["planta", "🏭 Planta"], ["bodega", "📦 Bodega"], ["nomina", "👷 Nómina"], ["kpis", "🎯 KPIs"], ["informes", "📋 Informes"]];
  const adminTabs = [["etapas", "⏱ Etapas"], ["categorias", "🏷 Categorías"], ["siluetas", "🔷 Siluetas"], ["lineas", "📐 Línea"], ["rangos", "📏 Rangos"], ["codigos_referencia", "🔢 Códigos de Referencia"], ["disenadores", "🎨 Diseñadores"], ["kpi_areas", "🏢 Áreas (KPI)"], ["talleres", "🧵 Talleres de Muestra"], ["prioridades", "🚩 Prioridades de Muestra"], ["roles", "👥 Roles"], ["usuarios", "👤 Usuarios"], ["clientes", "🏢 Clientes"], ["contenido", "📁 Contenido"], ["papelera", "🗑 Papelera"]];
  const [nuevoCodigo, setNuevoCodigo] = useState({ categoria: "", linea: "", grupo: "", cliente: "", prefijo: "", rangoInicio: "", rangoFin: "", desbordeInicio: "", desbordeFin: "" });
  // Si tiene valor, el formulario de arriba está EDITANDO esa fila (en vez
  // de crear una nueva) — así se puede corregir, por ejemplo, una fila que
  // quedó amarrada a una Línea de más sin tener que borrarla y rehacerla.
  const [editandoIdCodigo, setEditandoIdCodigo] = useState(null);
  // Categorías con el acordeón de Códigos de Referencia desplegado — solo
  // guarda los nombres abiertos, para no perder el estado al agregar o
  // eliminar filas.
  const [categoriasCodigoAbiertas, setCategoriasCodigoAbiertas] = useState(new Set());
  function toggleCategoriaCodigo(categoria) {
    setCategoriasCodigoAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(categoria)) next.delete(categoria);
      else next.add(categoria);
      return next;
    });
  }
  function limpiarFormCodigo() {
    setNuevoCodigo({ categoria: "", linea: "", grupo: "", cliente: "", prefijo: "", rangoInicio: "", rangoFin: "", desbordeInicio: "", desbordeFin: "" });
    setEditandoIdCodigo(null);
  }
  // Agrega una fila nueva, o si editandoIdCodigo tiene valor, guarda los
  // cambios sobre esa fila existente en vez de crear una duplicada.
  function guardarCodigoReferencia() {
    const prefijo = nuevoCodigo.prefijo.trim();
    const rangoInicio = Number(nuevoCodigo.rangoInicio);
    const rangoFin = Number(nuevoCodigo.rangoFin);
    if (!nuevoCodigo.categoria || !prefijo || !rangoInicio || !rangoFin || rangoFin < rangoInicio) return;
    const datos = {
      categoria: nuevoCodigo.categoria,
      linea: nuevoCodigo.linea,
      grupo: nuevoCodigo.grupo,
      cliente: nuevoCodigo.cliente,
      prefijo,
      rangoInicio,
      rangoFin,
      desbordeInicio: nuevoCodigo.desbordeInicio === "" ? "" : Number(nuevoCodigo.desbordeInicio),
      desbordeFin: nuevoCodigo.desbordeFin === "" ? "" : Number(nuevoCodigo.desbordeFin),
    };
    if (editandoIdCodigo) {
      onUpdateConfig({
        codigosReferencia: (config.codigosReferencia || []).map((c) => (c.id === editandoIdCodigo ? { ...c, ...datos } : c)),
      });
    } else {
      onUpdateConfig({ codigosReferencia: [...(config.codigosReferencia || []), { id: uid(), ...datos }] });
    }
    limpiarFormCodigo();
  }
  // Carga los datos de una fila existente en el formulario de arriba para
  // corregirla (ver guardarCodigoReferencia).
  function iniciarEdicionCodigo(c) {
    setNuevoCodigo({
      categoria: c.categoria || "",
      linea: c.linea || "",
      grupo: c.grupo || "",
      cliente: c.cliente || "",
      prefijo: c.prefijo || "",
      rangoInicio: c.rangoInicio ?? "",
      rangoFin: c.rangoFin ?? "",
      desbordeInicio: c.desbordeInicio ?? "",
      desbordeFin: c.desbordeFin ?? "",
    });
    setEditandoIdCodigo(c.id);
  }
  function removeCodigoReferencia(id) {
    onUpdateConfig({ codigosReferencia: (config.codigosReferencia || []).filter((c) => c.id !== id) });
    if (editandoIdCodigo === id) limpiarFormCodigo();
  }
  // Carga de un solo clic la plantilla sugerida (ver PLANTILLA_CODIGOS_REFERENCIA)
  // — agrega también a config.categorias cualquier nombre de categoría que
  // todavía no exista, para que el selector de "Nueva Referencia"/"Nuevo
  // Prototipo" (que solo ofrece nombres de config.categorias) pueda
  // encontrarlas. No duplica filas si ya existe una entrada con la misma
  // categoría (sin línea ni cliente) — para reemplazar una, elimínala primero.
  // La plantilla no trae Cliente asignado (aplica a cualquiera por defecto)
  // — si un cliente puntual necesita su propio rango, agrégalo aparte acá.
  function cargarPlantillaCodigos() {
    const existentes = new Set((config.codigosReferencia || []).filter((c) => !c.linea && !c.cliente).map((c) => c.categoria));
    const nuevasFilas = PLANTILLA_CODIGOS_REFERENCIA.filter((p) => !existentes.has(p.categoria)).map((p) => ({ id: uid(), linea: "", cliente: "", ...p }));
    const categoriasFaltantes = PLANTILLA_CODIGOS_REFERENCIA.map((p) => p.categoria).filter((c) => !(config.categorias || []).includes(c));
    onUpdateConfig({
      categorias: [...(config.categorias || []), ...categoriasFaltantes],
      codigosReferencia: [...(config.codigosReferencia || []), ...nuevasFilas],
    });
  }
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
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>¿Eliminar <strong>"{confirmDel.name}"</strong>? Queda en la Papelera por si hay que restaurarlo.</div>
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
        {tab === "lineas" && (
          <div>
            <SincronizarLineasBusintBtn config={config} onUpdateConfig={onUpdateConfig} />
            <ListEditor listKey="lineas" title="Línea" />
            <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 6 }}>Grupos de Línea</div>
              <div style={{ fontSize: 12.5, color: T.slate, marginBottom: 16 }}>
                Cada Línea de arriba (que trae docenas de valores compuestos reales de Busint, ej. "CABA DEPORT PREMIUN") se clasifica una sola vez en un Grupo (Dama, Caballero, Niña, Niño). Con eso, en Código de Referencia puedes amarrar una regla a "todo el grupo Caballero" en vez de tener que enumerar cada línea puntual.
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 8, textTransform: "uppercase" }}>Nombres de grupo</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addToList("gruposLinea")} placeholder="Ej: Unisex" style={{ flex: 1, maxWidth: 260, padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
                  <Btn small onClick={() => addToList("gruposLinea")}>+ Agregar grupo</Btn>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(config.gruposLinea || []).map((g) => (
                    <div key={g} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: T.canvas, borderRadius: 20, border: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{g}</span>
                      <button onClick={() => removeFromList("gruposLinea", g)} style={{ background: "none", border: "none", color: T.coral, fontWeight: 800, cursor: "pointer", fontSize: 13 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              {(config.lineas || []).length === 0 ? (
                <div style={{ fontSize: 13, color: T.slate, fontStyle: "italic" }}>Aún no hay líneas cargadas arriba.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {config.lineas.map((linea) => (
                    <div key={linea} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", background: T.canvas, borderRadius: 8, border: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{linea}</span>
                      <div style={{ width: 200 }}>
                        <FSel
                          value={(config.lineaGrupoMap || {})[linea] || ""}
                          onChange={(v) => onUpdateConfig({ lineaGrupoMap: { ...(config.lineaGrupoMap || {}), [linea]: v } })}
                          options={config.gruposLinea || []}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {tab === "rangos" && <ListEditor listKey="rangos" title="Rangos" />}
        {tab === "codigos_referencia" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 6 }}>Códigos de Referencia</div>
            <div style={{ fontSize: 12.5, color: T.slate, marginBottom: 16 }}>
              Cada fila amarra una Categoría (y opcionalmente una Línea puntual y/o un Cliente puntual, si ese cliente tiene su propio rango) a un prefijo y un rango de números (ej. 201 a 299). El "Desborde" es opcional: si el rango principal se llena, ATLAS sigue ahí solo, sin invadir el rango de la categoría vecina. Con esto, ATLAS sugiere el consecutivo — nunca se reinicia y nunca se repite.
            </div>
            <BusintSyncPanel />
            <ReferenciasNoEnBusintView protos={protos} capsulas={capsulas} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
              <SincronizarLineasBusintBtn config={config} onUpdateConfig={onUpdateConfig} />
              <Btn variant="secondary" onClick={cargarPlantillaCodigos}>📋 Cargar plantilla sugerida (98 dama/fábrica + 96 Reform)</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>Categoría</div>
                <FSel value={nuevoCodigo.categoria} onChange={(v) => setNuevoCodigo((f) => ({ ...f, categoria: v }))} options={config.categorias} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>Línea puntual (opcional)</div>
                <FSel value={nuevoCodigo.linea} onChange={(v) => setNuevoCodigo((f) => ({ ...f, linea: v }))} options={config.lineas} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>Grupo de línea (opcional)</div>
                <FSel value={nuevoCodigo.grupo} onChange={(v) => setNuevoCodigo((f) => ({ ...f, grupo: v }))} options={config.gruposLinea || []} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>Cliente (opcional)</div>
                <FSel value={nuevoCodigo.cliente} onChange={(v) => setNuevoCodigo((f) => ({ ...f, cliente: v }))} options={(config.clientes || []).map((c) => c.nombre)} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 10, fontStyle: "italic" }}>Usa "Línea puntual" solo para una excepción específica (ej. una línea con su propio prefijo); para reglas por Dama/Caballero/Niña/Niño usa "Grupo de línea" — cada línea se clasifica una sola vez en Administración → Línea.</div>
            <div style={{ display: "grid", gridTemplateColumns: "0.6fr 0.9fr 0.9fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>Prefijo</div>
                <input value={nuevoCodigo.prefijo} onChange={(e) => setNuevoCodigo((f) => ({ ...f, prefijo: e.target.value }))} placeholder="Ej: 98" maxLength={4} style={{ width: "100%", padding: "9px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>Rango (inicio - fin)</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="number" min={0} placeholder="201" value={nuevoCodigo.rangoInicio} onChange={(e) => setNuevoCodigo((f) => ({ ...f, rangoInicio: e.target.value }))} style={{ width: "100%", padding: "9px 8px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
                  <input type="number" min={0} placeholder="299" value={nuevoCodigo.rangoFin} onChange={(e) => setNuevoCodigo((f) => ({ ...f, rangoFin: e.target.value }))} style={{ width: "100%", padding: "9px 8px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4 }}>Desborde (opcional)</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="number" min={0} placeholder="2200" value={nuevoCodigo.desbordeInicio} onChange={(e) => setNuevoCodigo((f) => ({ ...f, desbordeInicio: e.target.value }))} style={{ width: "100%", padding: "9px 8px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
                  <input type="number" min={0} placeholder="2299" value={nuevoCodigo.desbordeFin} onChange={(e) => setNuevoCodigo((f) => ({ ...f, desbordeFin: e.target.value }))} style={{ width: "100%", padding: "9px 8px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 14, color: T.ink, background: T.white, outline: "none", fontFamily: "inherit" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn onClick={guardarCodigoReferencia}>{editandoIdCodigo ? "💾 Guardar cambios" : "+ Agregar"}</Btn>
                {editandoIdCodigo && <Btn variant="secondary" onClick={limpiarFormCodigo}>Cancelar</Btn>}
              </div>
            </div>
            {editandoIdCodigo && (
              <div style={{ padding: "8px 12px", background: T.violetBg, borderRadius: 8, marginBottom: 10, fontSize: 12, color: T.violet, fontWeight: 600 }}>
                ✎ Editando la fila de arriba — cambia lo que necesites y dale "Guardar cambios" (o "Cancelar" para dejarla como estaba).
              </div>
            )}
            <div style={{ fontSize: 11, color: T.slate, marginBottom: 16, fontStyle: "italic" }}>Línea, Cliente y Desborde son opcionales — déjalos vacíos si esa categoría aplica a cualquier línea/cliente, o no necesita una "segunda vuelta" cuando se llene su rango principal.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(config.codigosReferencia || []).length === 0 && (
                <div style={{ fontSize: 13, color: T.slate, fontStyle: "italic" }}>Aún no hay códigos registrados.</div>
              )}
              {(() => {
                // Agrupa todas las filas por Categoría — cada categoría es un
                // acordeón: clic en el encabezado despliega/oculta sus filas
                // (que pueden variar por Línea y/o Cliente), en vez de una
                // lista plana larga y repetitiva.
                const grupos = new Map();
                (config.codigosReferencia || []).forEach((c) => {
                  if (!grupos.has(c.categoria)) grupos.set(c.categoria, []);
                  grupos.get(c.categoria).push(c);
                });
                return [...grupos.entries()]
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([categoria, filas]) => {
                    const abierta = categoriasCodigoAbiertas.has(categoria);
                    return (
                      <div key={categoria} style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                        <button onClick={() => toggleCategoriaCodigo(categoria)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.canvas, border: "none", cursor: "pointer", textAlign: "left" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{categoria}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.slate, background: T.white, border: `1px solid ${T.border}`, borderRadius: 20, padding: "2px 8px" }}>{filas.length}</span>
                            <span style={{ fontSize: 12, color: T.slate }}>{abierta ? "▾" : "▸"}</span>
                          </span>
                        </button>
                        {abierta && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 14px 12px" }}>
                            {filas.map((c) => {
                              // Compatibilidad con filas viejas (solo "segmento") — ver
                              // sugerirReferencia() para la misma regla de respaldo.
                              const tieneRango = c.rangoInicio != null && c.rangoInicio !== "";
                              const baseVieja = (Number(c.segmento) || 0) * 100;
                              const rIni = tieneRango ? c.rangoInicio : baseVieja + 1;
                              const rFin = tieneRango ? c.rangoFin : baseVieja + 99;
                              const rango = `${c.prefijo}-${String(rIni).padStart(3, "0")} a ${c.prefijo}-${String(rFin).padStart(3, "0")}`;
                              const tieneDesborde = c.desbordeInicio !== "" && c.desbordeInicio != null && c.desbordeFin !== "" && c.desbordeFin != null;
                              const rangoDesborde = tieneDesborde ? `${c.prefijo}-${String(c.desbordeInicio).padStart(3, "0")} a ${c.prefijo}-${String(c.desbordeFin).padStart(3, "0")}` : null;
                              return (
                                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.white, borderRadius: 8, border: `1px solid ${T.border}` }}>
                                  <div>
                                    {c.linea && <span style={{ fontSize: 12, color: T.slate, marginRight: 8 }}>· {c.linea}</span>}
                                    {c.grupo && <span style={{ fontSize: 12, color: T.denim, marginRight: 8, fontWeight: 600 }}>· Grupo: {c.grupo}</span>}
                                    {c.cliente && <span style={{ fontSize: 12, color: T.violet, marginRight: 8, fontWeight: 600 }}>· {c.cliente}</span>}
                                    <span style={{ fontSize: 12, color: T.denim, fontWeight: 600 }}>{rango}</span>
                                    {tieneDesborde && <span style={{ fontSize: 12, color: T.amber, marginLeft: 10, fontWeight: 600 }}>· si se llena, sigue en {rangoDesborde}</span>}
                                  </div>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => iniciarEdicionCodigo(c)} style={{ background: T.denimBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.denim, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Editar</button>
                                    <button onClick={() => removeCodigoReferencia(c.id)} style={{ background: T.coralBg, border: "none", borderRadius: 6, padding: "4px 10px", color: T.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  });
              })()}
            </div>
          </div>
        )}
        {tab === "disenadores" && <ListEditor listKey="disenadores" title="Diseñadores" />}
        {tab === "kpi_areas" && (
          <div>
            <ListEditor listKey="kpiAreas" title="Áreas (KPI)" />
            <div style={{ marginTop: 16, padding: "10px 14px", background: T.denimBg, borderRadius: 8, fontSize: 13, color: T.denim, fontWeight: 600 }}>
              Los puestos dentro de cada área (con sus funciones asignadas) se gestionan directamente en el módulo KPIs, pestaña "Puestos" — no aquí.
            </div>
          </div>
        )}
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
                        {["editar", "aprobar", "declinar", "admin", "corte", "ilustracion", "aprobar_corte", "aprobar_despacho", "editar_kpis"].map((perm) => (
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
        {tab === "usuarios" && <UsersTab users={users} onUpdateUsers={onUpdateUsers} config={config} isAdmin={isAdmin} />}
        {tab === "clientes" && <ClientesTab config={config} onUpdateConfig={onUpdateConfig} />}
        {tab === "contenido" && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 20 }}>Gestión de Contenido</div>
            <div style={{ marginBottom: 24 }}>
              {/* Los eliminados (Papelera) no aparecen aquí — "Borrar" desde
                  esta pantalla también es un borrado suave (ver deleteProto),
                  así que quedan recuperables en Administración → Papelera. */}
              <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>⬡ Prototipos <span style={{ fontSize: 12, color: T.slate, fontWeight: 400 }}>({protos.filter((p) => !p.eliminado).length} total)</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {protos.filter((p) => !p.eliminado).map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.canvas, borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.slate }}>{p.reference} · {p.categoria} · <span style={{ color: STATUS[p.status]?.color, fontWeight: 700 }}>{STATUS[p.status]?.label}</span></div>
                    </div>
                    <button onClick={() => setEditItem({ item: p, tipo: "proto" })} style={{ padding: "5px 10px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 6, color: T.denim, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏ Editar</button>
                    {isAdmin && <button onClick={() => setConfirmDel({ id: p.id, tipo: "proto", name: p.name })} style={{ padding: "5px 10px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🗑 Borrar</button>}
                  </div>
                ))}
                {!protos.filter((p) => !p.eliminado).length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>Sin prototipos.</div>}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>⬢ Cápsulas <span style={{ fontSize: 12, color: T.slate, fontWeight: 400 }}>({capsulas.filter((c) => !c.eliminado).length} total)</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {capsulas.filter((c) => !c.eliminado).map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.canvas, borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: T.slate }}>{c.season} · {c.referencias.length} referencia{c.referencias.length !== 1 ? "s" : ""}</div>
                    </div>
                    <button onClick={() => setEditItem({ item: c, tipo: "capsula" })} style={{ padding: "5px 10px", background: T.denimBg, border: `1px solid ${T.denim}44`, borderRadius: 6, color: T.denim, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✏ Editar</button>
                    {isAdmin && <button onClick={() => setConfirmDel({ id: c.id, tipo: "capsula", name: c.name })} style={{ padding: "5px 10px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🗑 Borrar</button>}
                  </div>
                ))}
                {!capsulas.filter((c) => !c.eliminado).length && <div style={{ color: T.slate, fontSize: 13, textAlign: "center", padding: 20 }}>Sin cápsulas.</div>}
              </div>
            </div>
          </div>
        )}
        {tab === "papelera" && (
          <PapeleraView protos={protos} capsulas={capsulas}
            onRestaurarProto={onRestaurarProto} onRestaurarCapsula={onRestaurarCapsula} onRestaurarRef={onRestaurarRef}
            onPurgarProto={onPurgarProto} onPurgarCapsula={onPurgarCapsula} onPurgarRef={onPurgarRef}
          />
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
  // "cerrado" es el único estado de cierre desde el rediseño (antes había
  // "cumplido"/"cancelado_busint"/"venta_perdida_busint" por separado). Se
  // guarda el motivo en motivoCierre — "manual" cuando se marca aquí a
  // mano; "facturado"/"venta_perdida"/"ya_no_vigente" cuando lo cierra solo
  // el botón "Congelar como base de Corte" en Vigentes por Cliente.
  function marcarCumplido() { onUpdatePedido({ ...pedido, estado: "cerrado", motivoCierre: "manual", fechaCumplido: today() }); onBack(); }
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
        {pedido.estado === "cerrado" && <Btn variant="secondary" small onClick={() => onUpdatePedido({ ...pedido, estado: "activo", motivoCierre: null, fechaCumplido: null })}>↩ Reactivar</Btn>}
        {pedido.estado !== "cerrado" && <Btn variant="success" onClick={() => setShowConfirmCumplido(true)}>✓ Cumplido</Btn>}
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

function ClientesPedidosView({ clientes: clientesProp, pedidos, protos, capsulas }) {
  const [buscar, setBuscar] = useState("");
  // Por defecto solo se muestran los clientes que todavía tienen algo sin
  // resolver — un prototipo suelto o una referencia dentro de una cápsula
  // que no haya llegado a un estado final (Aprobado/Declinado). El toggle
  // "Mostrar todos" deja ver el maestro completo cuando haga falta.
  const [soloPendientes, setSoloPendientes] = useState(true);
  const clientes = clientesProp || [];
  function pedidosDelCliente(nombre) { return pedidos.filter((p) => p.cliente === nombre); }
  // Cliente "efectivo" de una referencia dentro de una cápsula: el de la
  // cápsula manda, y si no tiene se usa el de la referencia (mismo criterio
  // que capCliente/refCliente en CapsulasView).
  function tienePendiente(nombre) {
    const protoPendiente = (protos || []).some((p) => p.cliente === nombre && !["aprobado", "declinado"].includes(p.status));
    if (protoPendiente) return true;
    return (capsulas || []).some((cap) =>
      (cap.referencias || []).some((r) => {
        const clienteRef = cap.cliente || r.cliente || r.colores?.[0];
        return clienteRef === nombre && !["aprobado", "declinado"].includes(r.status);
      })
    );
  }
  const buscados = buscar ? clientes.filter((c) => c.nombre?.toLowerCase().includes(buscar.toLowerCase()) || c.empresa?.toLowerCase().includes(buscar.toLowerCase()) || c.contacto?.toLowerCase().includes(buscar.toLowerCase())) : clientes;
  const filtrados = soloPendientes ? buscados.filter((c) => tienePendiente(c.nombre)) : buscados;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Clientes</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>{filtrados.length} de {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}</p></div>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar cliente..." style={{ padding: "9px 14px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, width: 220, outline: "none", fontFamily: "inherit" }} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.slate, fontWeight: 600, marginBottom: 20, cursor: "pointer" }}>
        <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
        Mostrar solo clientes con algo pendiente (protos o referencias sin Aprobar/Declinar)
      </label>
      {!clientes.length && (
        <div style={{ textAlign: "center", padding: 48, color: T.slate }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Sin clientes registrados</div>
          <div style={{ fontSize: 13 }}>Ve a <strong>Administrador General → Clientes</strong> en el menú para agregar clientes.</div>
        </div>
      )}
      {!!clientes.length && !filtrados.length && (
        <div style={{ textAlign: "center", padding: 48, color: T.slate }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Ningún cliente tiene algo pendiente ahora mismo</div>
          <div style={{ fontSize: 13 }}>Desmarca "Mostrar solo clientes con algo pendiente" para ver el listado completo.</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {filtrados.map((c, i) => {
          const peds = pedidosDelCliente(c.nombre);
          const activos = peds.filter((p) => p.estado === "activo" || p.estado === "terminado").length;
          const historico = peds.filter((p) => p.estado === "cerrado").length;
          const totalPrendas = peds.filter((p) => p.estado !== "cerrado").reduce((s, p) => s + p.referencias.reduce((a, r) => a + r.total, 0), 0);
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

// ─── INFORME DE PEDIDOS VIGENTES POR CLIENTE (Busint en vivo) ────────────────
// A diferencia del resto de "Pedidos" (que lee la colección `pedidos` ya
// sincronizada en Firestore), este informe consulta la API de Busint EN VIVO
// cada vez que el usuario pulsa "Consultar Busint", para el rango de fechas
// exacto que escoja — no depende de lo que ya esté guardado localmente.
// Solo muestra los pedidos cuya fecha de despacho es hoy o está en el
// futuro (es decir, los que siguen vigentes / pendientes de entrega),
// agrupados por cliente. Requiere que la Cloud Function
// `getPedidosVigentesBusint` esté desplegada y los secrets BUSINT_TOKEN /
// BUSINT_BASE_URL ya configurados (los mismos que usa la sincronización
// automática cada 6 horas) — ver README_BUSINT_SYNC.md.
function InformeVigentesBusintView({ isAdmin, pedidosActivos, currentUser }) {
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [fechaFin, setFechaFin] = useState(today());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [expandidos, setExpandidos] = useState(new Set());
  const [pedidosDetalle, setPedidosDetalle] = useState(new Set());
  // Pedidos que Busint está generando mal (p. ej. por algo interno de
  // facturación aún sin identificar) y que el administrador decidió ocultar
  // DEL APLICATIVO mientras se resuelve con Busint — no se toca nada en
  // Busint, solo se guarda el número en esta colección y tanto el backend
  // (getPedidosVigentesBusint) como esta pantalla lo filtran.
  const [ocultos, setOcultos] = useState([]);
  const [confirmOcultar, setConfirmOcultar] = useState(null);
  const [showOcultosPanel, setShowOcultosPanel] = useState(false);
  // Última carga del reporte "Ventas Perdidas" (subido a mano — ningún
  // endpoint de la API genérica de Busint trae Cumplido/Ventas Perdidas). Se
  // guarda un doc nuevo por cada subida en "ventas_perdidas_cargas" y aquí
  // se toma siempre el más reciente por creadoTs, igual que Planeación con
  // sus cargas.
  const [ventasPerdidasCargas, setVentasPerdidasCargas] = useState([]);
  // Cargas de lotes del módulo Planeación ("planeacion_cargas" — la misma
  // colección que llena Planta al subir su archivo de producción). Cada lote
  // trae "Cant Cortada" por pedido+referencia — es la única fuente que
  // confirma con certeza que algo YA se cortó, sin importar si Busint todavía
  // no lo factura ni lo traslada (p. ej. sigue en planta de confección).
  const [planeacionCargas, setPlaneacionCargas] = useState([]);
  const [subiendoVP, setSubiendoVP] = useState(false);
  const [congelando, setCongelando] = useState(false);
  const [resultCongelar, setResultCongelar] = useState(null);
  const vpInputRef = useRef(null);
  // Panel temporal de depuración (solo admin) para ver, crudo, qué quedó
  // guardado en planeacion_cargas para un pedido puntual — usado para
  // encontrar por qué "Cant Cortada" no está cruzando para ciertas
  // referencias. Se puede quitar una vez resuelto.
  const [debugPedido, setDebugPedido] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "pedidos_ocultos_busint"), (snap) => {
      setOcultos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  const ocultosSet = new Set(ocultos.map((o) => o.numero));

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "ventas_perdidas_cargas"), (snap) => {
      setVentasPerdidasCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "planeacion_cargas"), (snap) => {
      setPlaneacionCargas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  const ultimaCargaVP = ventasPerdidasCargas.reduce((max, c) => (!max || (c.creadoTs || 0) > (max.creadoTs || 0) ? c : max), null);
  const vpMap = new Map((ultimaCargaVP?.filas || []).map((f) => [String(f.numero).trim(), f]));
  // Por pedido+referencia — permite calcular cuánto de cada referencia ya
  // quedó resuelto en Busint (facturado + traslados + venta perdida) sin
  // depender de que Corte haya registrado el corte a mano en el aplicativo.
  const vpRefMap = new Map((ultimaCargaVP?.filasPorRef || []).map((f) => [`${f.numero}__${f.ref}`, f]));
  // Carga más reciente de Planeación (solo para mostrar la fecha en pantalla
  // — el cálculo de abajo NO se limita a esta, ver nota siguiente).
  const ultimaCargaPlaneacion = [...planeacionCargas].sort((a, b) =>
    String(b.creadoEn || b.fecha || "").localeCompare(String(a.creadoEn || a.fecha || ""))
  )[0] || null;
  // Unidades ya cortadas por pedido+referencia, revisando TODAS las cargas de
  // Planeación guardadas (no solo la última). Cada carga es una foto del
  // reporte de producción del día en que se subió — un lote que ya se
  // terminó y se facturó puede dejar de aparecer en las cargas más nuevas,
  // así que quedarse solo con la última carga pierde el registro de que ese
  // lote SÍ se cortó. Para evitarlo: primero se agrupa por número de lote
  // (un mismo lote puede aparecer en varias cargas a medida que avanza) y se
  // toma el mayor valor visto para ese lote en cualquier carga; luego se
  // suma por pedido+referencia entre los distintos lotes.
  //
  // El campo "Cant Cortada" del archivo llega en 0 en las cargas reales (no
  // lo está poblando el reporte que se sube a diario) — confirmado con el
  // usuario. Lo que SÍ trae el dato confiable es el inventario por etapa
  // (Corte, BMP, Planta, BPT, Semiterminado): si un lote tiene unidades en
  // cualquiera de esas etapas, es porque YA se cortó (no se puede estar en
  // planta de confección sin haber pasado por corte primero). Por eso el
  // "cortado" de cada lote es el máximo entre Cant Cortada y la suma de esas
  // columnas de inventario en proceso.
  const lotesCortadoMap = new Map();
  {
    const porNumLote = new Map();
    planeacionCargas.forEach((carga) => {
      (carga.lotes || []).forEach((l) => {
        const numPedido = String(l.numPedido ?? "").trim();
        const ref = String(l.referencia ?? "").trim();
        if (!numPedido || !ref) return;
        const numLote = String(l.numLote ?? "").trim() || `${numPedido}__${ref}__sinlote`;
        const enProceso =
          (Number(l.invCorte) || 0) +
          (Number(l.invBMP) || 0) +
          (Number(l.invPlanta) || 0) +
          (Number(l.invBPT) || 0) +
          (Number(l.invSemiterminado) || 0);
        const cantidad = Math.max(Number(l.cantCortada) || 0, enProceso);
        const actual = porNumLote.get(numLote);
        if (!actual || cantidad > actual.cantidad) {
          porNumLote.set(numLote, { numPedido, ref, cantidad });
        }
      });
    });
    porNumLote.forEach(({ numPedido, ref, cantidad }) => {
      const clave = `${numPedido}__${ref}`;
      lotesCortadoMap.set(clave, (lotesCortadoMap.get(clave) || 0) + cantidad);
    });
  }
  // Un pedido cuenta como visible en pantalla solo si no está oculto a mano
  // Y Busint no lo marca ya "Cumplido" en el reporte de Ventas Perdidas
  // (aunque la API de órdenes lo siga devolviendo).
  function esVisible(p) {
    return !ocultosSet.has(p.numero) && !vpMap.get(String(p.numero).trim())?.cumplido;
  }
  async function subirVentasPerdidas(file) {
    if (!file) return;
    setSubiendoVP(true);
    try {
      const { porPedido, porReferencia } = await parseVentasPerdidasBusint(file);
      await fsSave("ventas_perdidas_cargas", uid(), { creadoEn: today(), creadoTs: Date.now(), subidoPor: currentUser?.name || "—", filas: porPedido, filasPorRef: porReferencia });
    } catch (err) {
      setError(err?.message || "No se pudo leer el archivo. Verifica que sea el reporte de Ventas Perdidas de Busint (.xlsx).");
    }
    setSubiendoVP(false);
  }
  // "Congelar" toma la lista vigente que se ve en pantalla (ya filtrada por
  // ocultos + Ventas Perdidas) y la escribe en pedidos_activos — la única
  // colección que leen tanto Pedidos como Corte desde ahora. Los pedidos que
  // ya existían conservan cortesRealizados/seguimiento/precio de corte
  // (fusión, no reemplazo); los que estaban activos y ya no aparecen en esta
  // consulta se cierran solos con un motivo.
  async function congelarBaseDeCorte() {
    if (!resultado) return;
    setCongelando(true);
    setResultCongelar(null);
    try {
      const vigentesFiltrados = [];
      resultado.porCliente.forEach((g) => {
        g.pedidos.forEach((p) => {
          if (!esVisible(p)) return;
          vigentesFiltrados.push({ ...p, cliente: g.cliente });
        });
      });
      const numerosNuevos = new Set(vigentesFiltrados.map((p) => String(p.numero).trim()));
      const existentesPorNumero = new Map((pedidosActivos || []).map((p) => [String(p.numero || "").trim(), p]));
      let nuevos = 0, actualizados = 0, cerrados = 0;
      for (const p of vigentesFiltrados) {
        const numero = String(p.numero).trim();
        const existente = existentesPorNumero.get(numero);
        // Una misma referencia (código `ref`) puede traer VARIOS colores —
        // lo que distingue a cada color es la descripción, no el ref. Usar
        // solo `r.ref` como clave (como se hacía antes) colapsaba todos los
        // colores de una misma referencia sobre el mismo precio/id: el
        // último color procesado pisaba a los demás, y tras "Congelar" todos
        // los colores de esa referencia terminaban compartiendo el MISMO id
        // interno — por eso, al marcar la talla de un color en Programar, se
        // marcaban también las tallas de los demás colores (comparten id).
        // La clave correcta es ref + descripción (el color).
        //
        // OJO: la descripción llega como "PINTA · COLOR" (ej. "G · AZUL
        // CLARO") — PINTA es el código corto y estable de Busint para ese
        // color, COLOR es el nombre libre, que Busint a veces corrige o
        // escribe distinto entre una sincronización y otra (ej. pasó de "G ·
        // AZUL BEBE" a "G · AZUL CLARO", mismo color físico). Usar el texto
        // completo como clave hacía que ese cambio de nombre generara una
        // identidad nueva para el color — el corte real ya registrado
        // (ligado al id viejo) quedaba huérfano y el color volvía a aparecer
        // como pendiente aunque ya se hubiera cortado (bug real: pedido
        // #1474, ref 82-511, color G). Por eso la clave usa solo la PINTA
        // (la parte antes de " · "), que es la que de verdad identifica el
        // color de forma estable — el nombre puede cambiar sin romper el
        // enlace con lo ya cortado.
        const claveColor = (r) => `${r.ref}__${(r.descripcion || "").split(" · ")[0].trim()}`;
        const precioPorRef = new Map((existente?.referencias || []).map((r) => [claveColor(r), r.precioCortePrenda || 0]));
        // El reporte de Busint nunca trae un id propio para cada referencia
        // (r.id siempre llega vacío), así que sin esto se generaba un uid()
        // NUEVO en cada recarga — incluso para referencias que ya existían.
        // Programación de Mesones y los cortes ya registrados guardan el id
        // de la referencia (refId), así que al cambiar ese id en cada
        // "Congelar" perdían con qué referencia coincidir y desaparecían de
        // la pantalla. Reutilizamos el id ya guardado (buscado por ref+color,
        // igual que ya se hace con el precio) y solo generamos uno nuevo si
        // la referencia es realmente nueva.
        // Saneamiento: si el bug anterior ya dejó dos colores compartiendo
        // el mismo id (ej. 7 colores de una referencia con el mismo id
        // interno), aquí solo el PRIMERO que aparece se queda con ese id —
        // a los demás, aunque tengan un id guardado, no se les reutiliza (se
        // les genera uno nuevo abajo) para separarlos de una vez. Esto puede
        // hacer que la Programación de Mesones ya guardada para esos colores
        // "extra" quede huérfana, igual que la vez pasada — es el costo de
        // reparar la colisión.
        const idsYaUsados = new Set();
        const idPorRef = new Map();
        (existente?.referencias || []).forEach((r) => {
          const clave = claveColor(r);
          if (r.id && !idsYaUsados.has(r.id)) {
            idPorRef.set(clave, r.id);
            idsYaUsados.add(r.id);
          }
        });
        const referencias = (p.referencias || []).map((r) => ({
          id: idPorRef.get(claveColor(r)) || r.id || uid(),
          ref: r.ref,
          descripcion: r.descripcion,
          tallas: { ...r.tallas },
          total: r.total,
          precioCortePrenda: precioPorRef.get(claveColor(r)) || 0,
        }));
        const doc = {
          id: numero,
          numero,
          cliente: p.cliente,
          fechaPedido: p.fechaPedido,
          fechaDespacho: p.fechaDespacho,
          referencias,
          cortesRealizados: existente?.cortesRealizados || [],
          seguimiento: existente?.seguimiento || {},
          estado: existente?.estado === "terminado" ? "terminado" : "activo",
          motivoCierre: null,
          fechaCumplido: null,
          origen: "busint_vigentes",
          congeladoEn: today(),
          creadoEn: existente?.creadoEn || today(),
        };
        await fsSave("pedidos_activos", numero, doc);
        if (existente) actualizados++; else nuevos++;
      }
      for (const existente of pedidosActivos || []) {
        if (existente.estado === "cerrado") continue;
        const numero = String(existente.numero || "").trim();
        if (!numero || numerosNuevos.has(numero)) continue;
        const vp = vpMap.get(numero);
        const motivoCierre = vp?.cumplido ? (vp.totalVentasPerdidas > 0 ? "venta_perdida" : "facturado") : "ya_no_vigente";
        await fsSave("pedidos_activos", existente.id, { ...existente, estado: "cerrado", motivoCierre, fechaCumplido: today() });
        cerrados++;
      }
      setResultCongelar({ total: vigentesFiltrados.length, nuevos, actualizados, cerrados });
    } catch (err) {
      setResultCongelar({ error: err?.message || "No se pudo congelar la lista." });
    }
    setCongelando(false);
  }

  async function ocultarPedido(numero) {
    await fsSave("pedidos_ocultos_busint", numero, { numero, ocultadoEn: today() });
    setConfirmOcultar(null);
  }
  async function restaurarPedido(numero) {
    await fsDelete("pedidos_ocultos_busint", numero);
  }

  function toggleExpand(cliente) {
    setExpandidos((s) => {
      const next = new Set(s);
      if (next.has(cliente)) next.delete(cliente);
      else next.add(cliente);
      return next;
    });
  }

  function toggleDetalle(numero) {
    setPedidosDetalle((s) => {
      const next = new Set(s);
      if (next.has(numero)) next.delete(numero);
      else next.add(numero);
      return next;
    });
  }

  // Mapa numero → doc de pedidos_activos, para cruzar cada pedido vigente
  // con lo que ya se cortó (si es que ya se congeló al menos una vez).
  const pedidosActivosPorNumero = new Map((pedidosActivos || []).map((pa) => [String(pa.numero || "").trim(), pa]));

  // Arma la tabla horizontal de detalle de un pedido: una fila por
  // referencia (sumando variantes de color/pinta), con una columna por cada
  // talla que aparezca en ese pedido, más Total/Cortado/Pendiente.
  //
  // "Cortado" ya NO depende solo de que Corte haya registrado el corte a
  // mano en el aplicativo (esa disciplina no se estaba dando de forma
  // confiable). Se cruzan hasta tres fuentes y se toma la que reporte MÁS
  // unidades cortadas para esa referencia (nunca se subestima si una fuente
  // no tiene el dato):
  //   1) Planeación (Cant Cortada por lote, archivo de Planta) — confirma
  //      corte físico real aunque Busint todavía no factura ni traslada esa
  //      referencia (p. ej. sigue en planta de confección, bodega de materia
  //      prima o inventario de corte). Es la fuente más confiable cuando
  //      existe, porque no depende de que Busint ya haya resuelto la venta.
  //   2) Ventas Perdidas (Busint) — lo que Busint ya facturó, trasladó
  //      (externo o consignación) o dio de baja como venta perdida.
  //   3) Corte (registrado a mano en el aplicativo) — último respaldo si
  //      ninguna de las dos anteriores trae esa referencia para ese pedido.
  function detalleHorizontal(p, pedidoActivo, vpRefMap, lotesCortadoMap) {
    const porRef = new Map();
    p.referencias.forEach((r) => {
      if (!porRef.has(r.ref)) porRef.set(r.ref, { ref: r.ref, descripcion: r.descripcion, tallas: {}, total: 0 });
      const acc = porRef.get(r.ref);
      Object.entries(r.tallas || {}).forEach(([talla, cant]) => {
        if (!(cant > 0)) return;
        acc.tallas[talla] = (acc.tallas[talla] || 0) + cant;
        acc.total += cant;
      });
    });
    const cortadoPorRefApp = new Map();
    (pedidoActivo?.cortesRealizados || []).forEach((c) => {
      (c.refs || []).forEach((cr) => {
        const suma = Object.values(cr.tallas || {}).reduce((a, b) => a + (b || 0), 0);
        cortadoPorRefApp.set(cr.ref, (cortadoPorRefApp.get(cr.ref) || 0) + suma);
      });
    });
    const tallasDistintas = [];
    porRef.forEach((r) => {
      Object.keys(r.tallas).forEach((t) => { if (!tallasDistintas.includes(t)) tallasDistintas.push(t); });
    });
    const filas = [...porRef.values()].map((r) => {
      const clave = `${p.numero}__${r.ref}`;
      const vp = vpRefMap?.get(clave);
      const cortadoVP = vp ? (vp.totalFacturada || 0) + (vp.totalTrasExt || 0) + (vp.totalTrasCon || 0) + Math.abs(vp.totalVentasPerdidas || 0) : null;
      const cortadoPlanta = lotesCortadoMap?.has(clave) ? lotesCortadoMap.get(clave) : null;
      const cortadoApp = cortadoPorRefApp.get(r.ref) || 0;
      const candidatos = [{ valor: cortadoApp, fuente: "app" }];
      if (cortadoVP !== null) candidatos.push({ valor: cortadoVP, fuente: "busint" });
      if (cortadoPlanta !== null) candidatos.push({ valor: cortadoPlanta, fuente: "planta" });
      const mejor = candidatos.reduce((max, c) => (c.valor > max.valor ? c : max), candidatos[0]);
      const cortado = mejor.valor;
      const fuente = mejor.fuente;
      return { ...r, cortado, pendiente: Math.max(0, r.total - cortado), fuente };
    });
    return { tallasDistintas, filas };
  }

  async function consultar() {
    setError("");
    setCargando(true);
    setResultado(null);
    try {
      const llamar = httpsCallable(functionsClient, "getPedidosVigentesBusint");
      const resp = await llamar({ fechaInicio, fechaFin });
      setResultado(resp.data);
      setExpandidos(new Set((resp.data.porCliente || []).map((g) => g.cliente)));
    } catch (err) {
      setError(
        err?.message ||
          "No se pudo consultar la API de Busint. Verifica que la función getPedidosVigentesBusint esté desplegada y las credenciales configuradas."
      );
    }
    setCargando(false);
  }

  return (
    <div>
      {confirmOcultar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.white, borderRadius: 14, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 24px 80px rgba(26,26,46,0.18)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.ink, marginBottom: 12 }}>⚠ Ocultar pedido #{confirmOcultar}</div>
            <div style={{ fontSize: 14, color: T.ink, marginBottom: 24 }}>
              Esto solo lo quita de este aplicativo — <strong>no borra ni modifica nada en Busint</strong>. Úsalo mientras se resuelve con Busint por qué se está creando este pedido. Lo puedes restaurar en cualquier momento desde "👁 Ocultos" arriba.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setConfirmOcultar(null)}>Cancelar</Btn>
              <Btn variant="danger" onClick={() => ocultarPedido(confirmOcultar)}>Sí, ocultar</Btn>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Fecha Inicio
          </label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            style={{ padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, fontFamily: "inherit" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Fecha Fin
          </label>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            style={{ padding: "8px 12px", border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.ink, fontFamily: "inherit" }}
          />
        </div>
        <Btn onClick={consultar} disabled={cargando}>
          {cargando ? "Consultando…" : "📡 Consultar Busint"}
        </Btn>
        {isAdmin && ocultos.length > 0 && (
          <Btn variant="secondary" onClick={() => setShowOcultosPanel((v) => !v)}>
            👁 Ocultos ({ocultos.length})
          </Btn>
        )}
        {isAdmin && (
          <>
            <input
              type="file"
              ref={vpInputRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; subirVentasPerdidas(f); e.target.value = ""; }}
            />
            <Btn variant="secondary" onClick={() => vpInputRef.current?.click()} disabled={subiendoVP}>
              {subiendoVP ? "Procesando..." : "📤 Actualizar Ventas Perdidas"}
            </Btn>
          </>
        )}
        {isAdmin && resultado && (
          <Btn onClick={congelarBaseDeCorte} disabled={congelando}>
            {congelando ? "Congelando..." : "🧊 Congelar como base de Corte"}
          </Btn>
        )}
      </div>
      {ultimaCargaVP && (
        <div style={{ fontSize: 11, color: T.slate, marginBottom: 4 }}>
          Último reporte de Ventas Perdidas subido: {ultimaCargaVP.creadoEn}{ultimaCargaVP.subidoPor ? ` · Subido por ${ultimaCargaVP.subidoPor}` : ""} — se usa automáticamente para ocultar de esta lista los pedidos que Busint ya marca "Cumplido" ahí.
        </div>
      )}
      {ultimaCargaPlaneacion && (
        <div style={{ fontSize: 11, color: T.slate, marginBottom: 10 }}>
          Planeación: {planeacionCargas.length} carga{planeacionCargas.length === 1 ? "" : "s"} disponible{planeacionCargas.length === 1 ? "" : "s"} para "Cortado" (la más reciente es del {ultimaCargaPlaneacion.creadoEn || ultimaCargaPlaneacion.fecha}) — se revisan todas para no perder lotes que ya salieron del reporte más nuevo.
        </div>
      )}
      {isAdmin && (
        <div style={{ border: `1px dashed ${T.border}`, borderRadius: 10, padding: 10, marginBottom: 16, background: T.canvas }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.slate, marginBottom: 6 }}>
            🔍 Depurar Planeación (temporal) — escribe un número de pedido para ver crudo qué hay guardado en las {planeacionCargas.length} cargas
          </div>
          <input
            value={debugPedido}
            onChange={(e) => setDebugPedido(e.target.value)}
            placeholder="Ej: 1149"
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, width: 160 }}
          />
          {debugPedido.trim() && (() => {
            const objetivo = debugPedido.trim();
            const encontrados = [];
            planeacionCargas.forEach((carga, ci) => {
              (carga.lotes || []).forEach((l) => {
                const numPedidoStr = String(l.numPedido ?? "").trim();
                if (numPedidoStr === objetivo) {
                  encontrados.push({ ...l, cargaFecha: carga.creadoEn || carga.fecha, cargaIdx: ci });
                }
              });
            });
            encontrados.sort((a, b) => String(b.cargaFecha || "").localeCompare(String(a.cargaFecha || "")));
            const conEnProceso = encontrados.map((l) => ({
              ...l,
              enProceso:
                (Number(l.invCorte) || 0) +
                (Number(l.invBMP) || 0) +
                (Number(l.invPlanta) || 0) +
                (Number(l.invBPT) || 0) +
                (Number(l.invSemiterminado) || 0),
            }));
            const maxPorLote = new Map();
            conEnProceso.forEach((l) => {
              const key = String(l.numLote ?? "");
              const cantidad = Math.max(Number(l.cantCortada) || 0, l.enProceso);
              if (!maxPorLote.has(key) || cantidad > maxPorLote.get(key).cantidad) {
                maxPorLote.set(key, { numLote: l.numLote, referencia: l.referencia, cantidad });
              }
            });
            return (
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <div style={{ color: T.slate, marginBottom: 4 }}>
                  {encontrados.length === 0
                    ? `No se encontró ningún lote con numPedido === "${objetivo}" (comparando como texto) en ninguna de las ${planeacionCargas.length} cargas.`
                    : `${encontrados.length} fila(s) encontradas (ordenadas de carga más reciente a más vieja). Resumen — máximo cortado visto por lote, tomando max(cantCortada, inventario en proceso) — esto es lo que usa el cruce:`}
                </div>
                {maxPorLote.size > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 10 }}>
                    <thead>
                      <tr style={{ color: T.slate, textAlign: "left" }}>
                        <th style={{ padding: 4 }}>numLote</th>
                        <th style={{ padding: 4 }}>referencia</th>
                        <th style={{ padding: 4 }}>MAX cortado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...maxPorLote.values()].map((l, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${T.border}`, fontWeight: 700 }}>
                          <td style={{ padding: 4 }}>{JSON.stringify(l.numLote)}</td>
                          <td style={{ padding: 4 }}>{JSON.stringify(l.referencia)}</td>
                          <td style={{ padding: 4, color: l.cantidad > 0 ? T.jade : T.coral }}>{l.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {encontrados.length > 0 && (
                  <>
                    <div style={{ color: T.slate, marginBottom: 4 }}>Detalle crudo por carga (más reciente primero):</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                      <thead>
                        <tr style={{ color: T.slate, textAlign: "left" }}>
                          <th style={{ padding: 4 }}>numLote</th>
                          <th style={{ padding: 4 }}>referencia</th>
                          <th style={{ padding: 4 }}>cantCortada</th>
                          <th style={{ padding: 4 }}>en proceso (Inv*)</th>
                          <th style={{ padding: 4 }}>carga</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conEnProceso.map((l, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                            <td style={{ padding: 4 }}>{JSON.stringify(l.numLote)}</td>
                            <td style={{ padding: 4 }}>{JSON.stringify(l.referencia)}</td>
                            <td style={{ padding: 4 }}>{JSON.stringify(l.cantCortada)}</td>
                            <td style={{ padding: 4 }}>{l.enProceso}</td>
                            <td style={{ padding: 4 }}>{l.cargaFecha}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
      {resultCongelar && (
        <div style={{ padding: "10px 16px", background: resultCongelar.error ? T.coralBg : T.jadeBg, borderRadius: 10, border: `1px solid ${resultCongelar.error ? T.coral : T.jade}44`, color: resultCongelar.error ? T.coral : T.jade, fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
          {resultCongelar.error
            ? `⚠ ${resultCongelar.error}`
            : `✓ Congelado: ${resultCongelar.total} pedidos vigentes (${resultCongelar.nuevos} nuevos, ${resultCongelar.actualizados} actualizados) — ${resultCongelar.cerrados} pedido${resultCongelar.cerrados === 1 ? "" : "s"} que ya no está${resultCongelar.cerrados === 1 ? "" : "n"} vigente${resultCongelar.cerrados === 1 ? "" : "s"} se cerró${resultCongelar.cerrados === 1 ? "" : "n"} automáticamente. Ya puedes verlos/cortarlos en Pedidos y en Corte.`}
        </div>
      )}
      {showOcultosPanel && (
        <div style={{ background: T.canvas, borderRadius: 12, border: `1px solid ${T.border}`, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 10 }}>Pedidos ocultos en este aplicativo</div>
          {!ocultos.length ? (
            <div style={{ fontSize: 13, color: T.slate }}>No hay pedidos ocultos.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ocultos.map((o) => (
                <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: T.white, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 13, color: T.ink }}>
                    <strong>#{o.numero}</strong>
                    <span style={{ color: T.slate, fontSize: 11, marginLeft: 8 }}>ocultado {o.ocultadoEn || ""}</span>
                  </div>
                  <Btn small variant="ghost" onClick={() => restaurarPedido(o.numero)}>↺ Restaurar</Btn>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 12, color: T.slate, marginBottom: 16 }}>
        Consulta la API de Busint en vivo (no la base de datos local) y muestra los pedidos que todavía no se han facturado ni despachado (factura normal, traslado externo o en consignación). Para los que faltan, cruza con la carga más reciente de Planeación para mostrar en qué etapa van, o si aún no tienen lote ("sin cortar"). Los que ya vencieron su fecha de despacho sin facturar aparecen primero, marcados como <strong style={{ color: T.coral }}>vencidos</strong>.
      </div>
      {resultado?.avisoFacturacion && (
        <div style={{ padding: "12px 16px", background: T.amberBg, borderRadius: 10, border: `1px solid ${T.amber}44`, color: T.amber, fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
          ⚠ {resultado.avisoFacturacion}
        </div>
      )}
      {error && (
        <div style={{ padding: "12px 16px", background: T.coralBg, borderRadius: 10, border: `1px solid ${T.coral}44`, color: T.coral, fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {resultado && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            <div style={{ background: T.denimBg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.denim}22` }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.denim }}>
                {resultado.porCliente.reduce((s, g) => s + g.pedidos.filter(esVisible).length, 0)}
              </div>
              <div style={{ fontSize: 11, color: T.slate, fontWeight: 600 }}>Pedidos vigentes</div>
            </div>
            <div style={{ background: T.coralBg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.coral}22` }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.coral }}>
                {resultado.porCliente.reduce((s, g) => s + g.pedidos.filter((p) => p.vencido && esVisible(p)).length, 0)}
              </div>
              <div style={{ fontSize: 11, color: T.slate, fontWeight: 600 }}>Vencidos sin cortar</div>
            </div>
            <div style={{ background: T.violetBg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.violet}22` }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.violet }}>
                {resultado.porCliente.filter((g) => g.pedidos.some(esVisible)).length}
              </div>
              <div style={{ fontSize: 11, color: T.slate, fontWeight: 600 }}>Clientes</div>
            </div>
            <div style={{ background: T.jadeBg, borderRadius: 12, padding: "14px 16px", border: `1px solid ${T.jade}22` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.jade }}>
                {resultado.fechaInicio} → {resultado.fechaFin}
              </div>
              <div style={{ fontSize: 11, color: T.slate, fontWeight: 600, marginTop: 4 }}>Rango consultado</div>
            </div>
          </div>
          {!resultado.porCliente.length ? (
            <div style={{ textAlign: "center", padding: 48, color: T.slate, fontSize: 14 }}>
              No hay pedidos vigentes (todos ya están 100% cortados o no hay pedidos de Busint en ese rango de fechas).
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {resultado.porCliente.map((g) => {
                const expandido = expandidos.has(g.cliente);
                const pedidosVisibles = g.pedidos.filter(esVisible);
                return (
                  <div key={g.cliente} style={{ background: T.white, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <div
                      onClick={() => toggleExpand(g.cliente)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 18, cursor: "pointer" }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>{g.cliente}</div>
                        <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>
                          {pedidosVisibles.length} pedido{pedidosVisibles.length !== 1 ? "s" : ""} · {fmtNum(pedidosVisibles.reduce((s, p) => s + p.totalUnidades, 0))} unidades
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: T.slate, transform: expandido ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                        ›
                      </span>
                    </div>
                    {expandido && (
                      <div style={{ padding: "0 18px 18px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: T.canvas }}>
                              {(isAdmin ? ["", "N° Pedido", "Fecha Pedido", "Fecha Despacho", "Referencias", "Unidades", "Estado", ""] : ["", "N° Pedido", "Fecha Pedido", "Fecha Despacho", "Referencias", "Unidades", "Estado"]).map((h, hi) => (
                                <th
                                  key={h + hi}
                                  style={{
                                    padding: "8px 10px",
                                    textAlign: h === "Unidades" ? "right" : "left",
                                    fontWeight: 700,
                                    fontSize: 10,
                                    color: T.slate,
                                    textTransform: "uppercase",
                                    width: hi === 0 ? 24 : undefined,
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pedidosVisibles.map((p) => {
                              const detalleAbierto = pedidosDetalle.has(p.numero);
                              return (
                                <React.Fragment key={p.numero}>
                                  <tr
                                    onClick={() => toggleDetalle(p.numero)}
                                    style={{
                                      borderBottom: detalleAbierto ? "none" : `1px solid ${T.border}`,
                                      background: p.vencido ? T.coralBg : "transparent",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <td style={{ padding: "8px 4px", textAlign: "center", color: T.slate }}>
                                      <span style={{ display: "inline-block", transform: detalleAbierto ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
                                    </td>
                                    <td style={{ padding: "8px 10px", fontWeight: 800, color: T.denim }}>#{p.numero}</td>
                                    <td style={{ padding: "8px 10px", color: T.ink }}>{p.fechaPedido || "—"}</td>
                                    <td style={{ padding: "8px 10px", color: p.vencido ? T.coral : T.ink, fontWeight: p.vencido ? 800 : 400 }}>
                                      {p.fechaDespacho || "—"}
                                      {p.vencido && (
                                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: T.coral }}>🚨 VENCIDO</span>
                                      )}
                                    </td>
                                    <td style={{ padding: "8px 10px", color: T.slate }}>
                                      {p.referencias.map((r) => r.ref).filter(Boolean).join(", ") || "—"}
                                    </td>
                                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: T.ink }}>{fmtNum(p.totalUnidades)}</td>
                                    <td style={{ padding: "8px 10px", color: T.slate, minWidth: 140 }}>
                                      {p.tieneLote ? (
                                        <span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: T.amberBg, color: T.amber, whiteSpace: "nowrap" }}>
                                          {p.etapas.join(", ")}
                                        </span>
                                      ) : (
                                        <span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: T.coralBg, color: T.coral, whiteSpace: "nowrap" }}>
                                          🔴 Sin cortar
                                        </span>
                                      )}
                                      {p.pctFacturado > 0 && (
                                        <div style={{ fontSize: 10, color: T.slate, marginTop: 3 }}>
                                          {p.pctFacturado}% facturado
                                        </div>
                                      )}
                                    </td>
                                    {isAdmin && (
                                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmOcultar(p.numero);
                                          }}
                                          title="Ocultar este pedido del aplicativo (no afecta Busint)"
                                          style={{ padding: "5px 10px", background: T.coralBg, border: `1px solid ${T.coral}44`, borderRadius: 6, color: T.coral, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                                        >
                                          🗑 Ocultar
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                  {detalleAbierto && (() => {
                                    const pedidoActivo = pedidosActivosPorNumero.get(String(p.numero).trim());
                                    const { tallasDistintas, filas } = detalleHorizontal(p, pedidoActivo, vpRefMap, lotesCortadoMap);
                                    const algunaFuentePlanta = filas.some((r) => r.fuente === "planta");
                                    const algunaFuenteApp = filas.some((r) => r.fuente === "app");
                                    return (
                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                      <td colSpan={isAdmin ? 8 : 7} style={{ padding: "0 10px 12px 34px", background: T.canvas }}>
                                        <div style={{ fontSize: 10, color: T.slate, margin: "6px 0" }}>
                                          "Cortado"/"Pendiente" se calculan tomando el máximo entre lo que confirma Planeación (Cant Cortada por lote, incluye lo que ya se cortó aunque siga en planta o bodega sin facturar), lo que confirma el reporte de Ventas Perdidas (facturado + traslados + venta perdida) y lo registrado a mano en Corte
                                          {algunaFuentePlanta ? "; las referencias marcadas (planta) toman el dato de Planeación" : ""}
                                          {algunaFuenteApp ? "; las referencias marcadas (app) no aparecen en Planeación ni en Ventas Perdidas y usan lo registrado en Corte" : ""}.
                                        </div>
                                        <div style={{ overflowX: "auto" }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                            <thead>
                                              <tr>
                                                {["Referencia", "Descripción", ...tallasDistintas, "Total", "Cortado", "Pendiente"].map((h) => (
                                                  <th
                                                    key={h}
                                                    style={{
                                                      padding: "6px 8px",
                                                      textAlign: h === "Referencia" || h === "Descripción" ? "left" : "right",
                                                      fontWeight: 700,
                                                      fontSize: 9,
                                                      color: T.slate,
                                                      textTransform: "uppercase",
                                                      borderBottom: `1px solid ${T.border}`,
                                                      whiteSpace: "nowrap",
                                                    }}
                                                  >
                                                    {h}
                                                  </th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {filas.map((r) => (
                                                <tr key={r.ref}>
                                                  <td style={{ padding: "5px 8px", color: T.ink, fontWeight: 700 }}>{r.ref}</td>
                                                  <td style={{ padding: "5px 8px", color: T.slate }}>{r.descripcion}</td>
                                                  {tallasDistintas.map((t) => (
                                                    <td key={t} style={{ padding: "5px 8px", textAlign: "right", color: r.tallas[t] ? T.ink : T.border }}>{r.tallas[t] || "—"}</td>
                                                  ))}
                                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 800, color: T.denim }}>{fmtNum(r.total)}</td>
                                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.jade }}>
                                                    {fmtNum(r.cortado)}
                                                    {r.fuente === "planta" && <span style={{ color: T.slate, fontWeight: 600, marginLeft: 4 }}>(planta)</span>}
                                                    {r.fuente === "app" && <span style={{ color: T.slate, fontWeight: 600, marginLeft: 4 }}>(app)</span>}
                                                  </td>
                                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: r.pendiente > 0 ? T.coral : T.jade }}>{fmtNum(r.pendiente)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                    );
                                  })()}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Parsea el reporte "Ventas Perdidas" que exportan los asesores de Busint
// desde su módulo de Ventas (una fila por referencia/talla/color, con
// columnas "Num Ped", "Referencia", "Cumplido" (S/N), "Cant Pedida", "Cant
// Facturada", "Cant TrasExt", "Cant TrasCon", "Cant Ventas Perdidas", entre
// otras). Se confirmó con datos reales que "Cumplido" es el MISMO valor en
// todas las filas de un mismo pedido, así que basta con tomarlo de
// cualquiera de sus filas — es la señal propia de Busint de que el pedido
// ya está cerrado, ya sea porque se facturó completo o porque se dio de
// baja como venta perdida (el pedido #1445 es justo este segundo caso: 1
// unidad pedida, 0 facturada, -1 en "Cant Ventas Perdidas", y aun así
// Cumplido="S"). Ningún endpoint de la API genérica de Busint (revisados
// los 12 documentados) trae estos campos, por eso este reporte se sube a
// mano en vez de consultarse en vivo.
//
// Además del agregado por pedido (para el chequeo de "Cumplido"), esta
// función agrega TAMBIÉN por pedido+referencia — es lo que permite mostrar
// en Vigentes por Cliente cuánto de cada referencia ya se facturó, se
// trasladó o se dio de baja como venta perdida, y por lo tanto cuánto
// realmente falta por cortar SIN depender de que Corte haya registrado el
// corte a mano en el aplicativo (esa disciplina manual es justo lo que no
// se estaba dando, según explicó el usuario con el pedido de las
// referencias C-5031/C-5046).
async function parseVentasPerdidasBusint(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const porPedido = new Map();
  const porReferencia = new Map();
  rows.forEach((r) => {
    const numero = String(r["Num Ped"] ?? "").trim();
    if (!numero) return;
    if (!porPedido.has(numero)) {
      porPedido.set(numero, {
        numero,
        cliente: String(r["Razon Social"] || r["Nombre Comercial"] || "").trim(),
        cumplido: String(r["Cumplido"] ?? "").trim().toUpperCase() === "S",
        totalPedida: 0,
        totalFacturada: 0,
        totalVentasPerdidas: 0,
      });
    }
    const acc = porPedido.get(numero);
    acc.totalPedida += Number(r["Cant Pedida"]) || 0;
    acc.totalFacturada += Number(r["Cant Facturada"]) || 0;
    acc.totalVentasPerdidas += Math.abs(Number(r["Cant Ventas Perdidas"]) || 0);

    const ref = String(r["Referencia"] ?? "").trim();
    if (!ref) return;
    const claveRef = `${numero}__${ref}`;
    if (!porReferencia.has(claveRef)) {
      porReferencia.set(claveRef, {
        numero,
        ref,
        totalPedida: 0,
        totalFacturada: 0,
        totalTrasExt: 0,
        totalTrasCon: 0,
        totalVentasPerdidas: 0,
      });
    }
    const accRef = porReferencia.get(claveRef);
    accRef.totalPedida += Number(r["Cant Pedida"]) || 0;
    accRef.totalFacturada += Number(r["Cant Facturada"]) || 0;
    accRef.totalTrasExt += Number(r["Cant TrasExt"]) || 0;
    accRef.totalTrasCon += Number(r["Cant TrasCon"]) || 0;
    accRef.totalVentasPerdidas += Math.abs(Number(r["Cant Ventas Perdidas"]) || 0);
  });
  return { porPedido: [...porPedido.values()], porReferencia: [...porReferencia.values()] };
}

// Devuelve ícono/color/etiqueta para mostrar por qué se cerró un pedido en
// pedidos_activos (campo motivoCierre). "manual" es cuando alguien le da clic
// a "✓ Cumplido" en el detalle del pedido; los otros tres los pone solo el
// botón "Congelar como base de Corte" en Vigentes por Cliente, comparando
// contra la consulta en vivo de Busint (y, si está subido, el reporte de
// Ventas Perdidas).
function motivoCierreInfo(motivo) {
  switch (motivo) {
    case "venta_perdida":
      return { icon: "💸", color: T.amber, bg: T.amberBg, label: "Venta Perdida (Busint)", desc: "Cerrado por Busint desde" };
    case "facturado":
      return { icon: "✅", color: T.jade, bg: T.jadeBg, label: "Facturado (Busint)", desc: "Cerrado por Busint desde" };
    case "ya_no_vigente":
      return { icon: "🚫", color: T.coral, bg: T.coralBg, label: "Ya no vigente en Busint", desc: "Dejó de aparecer en Busint desde" };
    default:
      return { icon: "✅", color: T.jade, bg: T.jadeBg, label: "Cumplido", desc: "Cumplido" };
  }
}

function PedidosView({ pedidos, onSelectPedido, onNewPedido, onUpdatePedido, pedidoConfig, onSavePedidoConfig, isAdmin, currentUser }) {
  const [filtro, setFiltro] = useState("activos");
  const [editPedido, setEditPedido] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const activos = pedidos.filter((p) => p.estado === "activo" || p.estado === "terminado");
  // Un único estado de cierre ("cerrado"), con el motivo en motivoCierre — ya
  // no hay "cumplido"/"cancelado_busint"/"venta_perdida_busint" por separado.
  // Se cierra automáticamente desde "🧊 Congelar como base de Corte" (pestaña
  // Vigentes por Cliente) cuando un pedido activo deja de aparecer en la
  // consulta en vivo de Busint, o a mano desde el detalle del pedido.
  const historico = pedidos.filter((p) => p.estado === "cerrado");
  const busquedaNorm = busqueda.trim().toLowerCase();
  const listaBase = filtro === "activos" ? activos : historico;
  const lista = !busquedaNorm ? listaBase : listaBase.filter((p) =>
    String(p.numero || "").toLowerCase().includes(busquedaNorm) ||
    (p.cliente || "").toLowerCase().includes(busquedaNorm) ||
    (p.vendedor || "").toLowerCase().includes(busquedaNorm)
  );
  const hoy = new Date();
  const vencidos = activos.filter((p) => p.fechaDespacho && new Date(p.fechaDespacho) < hoy);
  const proximos = activos.filter((p) => { if (!p.fechaDespacho) return false; const d = Math.ceil((new Date(p.fechaDespacho) - hoy) / 86400000); return d >= 0 && d <= 7; });
  const vigentes = activos.filter((p) => { if (!p.fechaDespacho) return true; return Math.ceil((new Date(p.fechaDespacho) - hoy) / 86400000) > 7; });
  const terminados = activos.filter((p) => p.estado === "terminado");
  return (
    <div>
      {editPedido && <EditPedidoModal pedido={editPedido} onSave={(p) => { onUpdatePedido(p); setEditPedido(null); }} onClose={() => setEditPedido(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.ink }}>Pedidos</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: T.slate }}>Base de pedidos vigentes — se actualiza desde "📡 Vigentes por Cliente (Busint)"</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={onNewPedido}>+ Pedido manual</Btn>
        </div>
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
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[["activos", `Activos (${activos.length})`], ["historico", `Histórico (${historico.length})`], ["vigentes_busint", "📡 Vigentes por Cliente (Busint)"]].map(([v, label]) => (
          <button key={v} onClick={() => setFiltro(v)} style={{ padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${filtro === v ? T.ink : T.border}`, background: filtro === v ? T.ink : T.white, color: filtro === v ? T.white : T.ink, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
        {filtro !== "vigentes_busint" && (
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar por N° pedido, cliente o vendedor..."
            style={{ padding: "7px 12px", border: `1.5px solid ${busqueda ? T.denim : T.border}`, borderRadius: 8, fontSize: 13, minWidth: 260, outline: "none", fontFamily: "inherit", marginLeft: 8 }}
          />
        )}
      </div>
      {filtro === "vigentes_busint" && <InformeVigentesBusintView isAdmin={isAdmin} pedidosActivos={pedidos} currentUser={currentUser} />}
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
            const mi = motivoCierreInfo(p.motivoCierre);
            return (
              <div key={p.id} onClick={() => onSelectPedido(p.id)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: T.white, borderRadius: 12, border: `1px solid ${T.border}`, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.canvas)}
                onMouseLeave={(e) => (e.currentTarget.style.background = T.white)}
              >
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: mi.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{mi.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
                    Pedido #{p.numero} — {p.cliente}
                    <span style={{ fontSize: 10, fontWeight: 800, color: mi.color, background: mi.bg, padding: "1px 8px", borderRadius: 10 }}>{mi.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.slate }}>
                    {mi.desc}: {p.fechaCumplido || "—"} · {fmtNum(totalP)} uds pedidas · {fmtNum(totalC)} cortadas
                    {p.motivoCierre === "venta_perdida" && p.ventasPerdidasUds ? ` · ${fmtNum(p.ventasPerdidasUds)} uds dadas de baja` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={(e) => { e.stopPropagation(); onUpdatePedido({ ...p, estado: "activo", motivoCierre: null, fechaCumplido: null }); }} style={{ background: T.amberBg, border: `1px solid ${T.amber}44`, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: T.amber, cursor: "pointer" }}>↩ Reactivar</button>
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
  // Cliente asociado (opcional) del usuario logueado — cuentas de acceso
  // restringido a UN cliente puntual, para que ese cliente no vea el
  // trabajo que se hace para otros. Se filtran acá, una sola vez, las
  // mismas listas base que alimentan todo el módulo de Diseño (Prototipos,
  // Cápsulas, Pedidos, Pedidos por Cliente, Estadísticas, Historial,
  // Bitácora y Cronograma de Muestras), así que basta con usar las
  // versiones "Visibles" en cada pantalla para que la restricción aplique
  // en todas a la vez. Si el usuario no tiene cliente asociado, ve todo
  // igual que hoy.
  const clienteAsociado = currentUser?.clienteAsociado || "";
  function capsulaCliente(cap) {
    if (cap.cliente) return cap.cliente;
    const conRef = (cap.referencias || []).find((r) => r.cliente || r.colores?.[0]);
    return conRef ? (conRef.cliente || conRef.colores?.[0]) : null;
  }
  // .eliminado: true son ítems en la Papelera (ver Administración → Papelera)
  // — se esconden de toda la navegación normal aquí mismo, en un solo lugar,
  // sin tocar protos/capsulas (los arrays "crudos" siguen completos porque
  // varias funciones de escritura los usan como base para no perder datos).
  const protosVisibles = (clienteAsociado ? protos.filter((p) => (p.cliente || p.colores?.[0]) === clienteAsociado) : protos).filter((p) => !p.eliminado);
  const capsulasVisibles = (clienteAsociado ? capsulas.filter((cap) => capsulaCliente(cap) === clienteAsociado) : capsulas)
    .filter((cap) => !cap.eliminado)
    .map((cap) => ({ ...cap, referencias: (cap.referencias || []).filter((r) => !r.eliminado) }));
  const pedidosVisibles = clienteAsociado ? pedidos.filter((p) => p.cliente === clienteAsociado) : pedidos;
  const cronogramaMuestrasVisibles = clienteAsociado ? cronogramaMuestras.filter((c) => c.cliente === clienteAsociado) : cronogramaMuestras;
  const [pedidoConfig, setPedidoConfig] = useState({ clientes: [], vendedores: [] });
  const [bitacoraEnvios, setBitacoraEnvios] = useState([]);
  // Al entrar a Historial desde el enlace "❌ N declinadas" de Bitácora, se
  // usa esto para que abra ya filtrado en Declinados (HistorialDisenoView lo
  // lee una sola vez, al montar, vía initialResultado/initialTipoFiltro).
  const [historialFiltroInicial, setHistorialFiltroInicial] = useState(null);
  // --- Módulo KPIs (toda la compañía, no solo Diseño) ---
  // kpiPuestos: puestos de trabajo, cada uno con su área y sus funciones
  // asignadas (responsabilidades esperadas). kpiPersonas: roster de personas,
  // cada una ligada a un puesto por `puestoId`. kpiCatalogo: catálogo de
  // KPIs, cada uno ligado a un puesto por `puestoId`. kpiRegistros: valores
  // mensuales digitados a mano por persona/KPI/periodo (ver KPIsView).
  const [kpiPuestos, setKpiPuestos] = useState([]);
  const [kpiPersonas, setKpiPersonas] = useState([]);
  const [kpiCatalogo, setKpiCatalogo] = useState([]);
  const [kpiRegistros, setKpiRegistros] = useState([]);
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
  const [loginError, setLoginError] = useState("");
  useEffect(() => {
    let unsubsDatos = [];
    // Fase C de la migración de seguridad: antes, todos los datos de
    // Firestore se cargaban apenas se abría la app, sin importar si había
    // sesión iniciada — eso hacía imposible exigir "usuario autenticado" en
    // las reglas de seguridad sin romper la propia pantalla de login. Ahora
    // la carga de datos NUNCA arranca sola: la dispara onAuthStateChanged,
    // que Firebase llama automáticamente en cuanto hay una sesión real
    // (login exitoso, o una sesión que ya estaba activa al recargar la
    // página) — y la detiene (limpiando los listeners) en cuanto la sesión
    // se cierra.
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      unsubsDatos.forEach((fn) => fn());
      unsubsDatos = [];
      if (!fbUser) {
        setCurrentUser(null);
        setAppState("login");
        return;
      }
      setLoginError("");
      setAppState("loading");
      cargarDatos(fbUser);
    });
    async function cargarDatos(fbUser) {
      try {
        let dbUsers = await fsGet("users");
        if (!dbUsers.length) { await fsBatch("users", INIT_USERS); dbUsers = INIT_USERS; }
        setUsers(dbUsers);
        // El perfil de la app (nombre, rol, isAdmin, etc.) se busca por
        // `authUid` — el campo que la migración de Fase A le agregó a cada
        // documento de `users` al crear su cuenta real de Firebase Auth. Si
        // no aparece (cuenta de Firebase Auth sin documento correspondiente
        // en Firestore, caso raro), no se deja entrar.
        const perfil = dbUsers.find((u) => u.authUid === fbUser.uid);
        if (!perfil) {
          setLoginError("Tu cuenta no tiene un perfil asociado en el sistema. Contacta a un administrador.");
          await signOut(auth);
          return;
        }
        // Usuario desactivado (dejó de trabajar con nosotros, pero se
        // conserva su historial en vez de borrarlo): no se le deja entrar.
        if (perfil.activo === false) {
          setLoginError("Tu usuario fue desactivado. Contacta a un administrador.");
          await signOut(auth);
          return;
        }
        setCurrentUser(perfil);
        const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
          const updatedUsers = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          setUsers(updatedUsers);
          setCurrentUser((cu) => {
            if (!cu) return cu;
            const fresh = updatedUsers.find((u) => u.id === cu.id);
            if (fresh && fresh.activo === false) {
              // Un admin desactivó a este usuario mientras tenía la sesión
              // abierta (otra pestaña/dispositivo) — se le cierra la sesión
              // de inmediato en vez de esperar a que recargue la página.
              setLoginError("Tu usuario fue desactivado. Contacta a un administrador.");
              signOut(auth).catch(() => {});
              return cu;
            }
            return fresh ? { ...cu, ...fresh } : cu;
          });
        });
        unsubsDatos.push(unsubUsers);
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
        else {
          // Migración una sola vez: a los "config" ya guardados antes de que
          // existiera la etapa "Por Enviar" les falta ese ítem en `stages`
          // (INIT_CONFIG solo siembra un config nuevo — nunca actualiza uno
          // que ya existe). "Por Enviar" debe quedar DESPUÉS de "Cotización"
          // (primero se cotiza, y solo después queda lista para enviar). Si
          // falta, se inserta ahí; si ya existe pero quedó mal ubicada (una
          // versión anterior de esta migración la insertaba ANTES de
          // Cotización, por error), se reubica sin perder los "días" que el
          // admin le haya configurado. Se guarda con merge (fsSave), sin
          // tocar el resto del documento (roles, clientes, etc.).
          const existente = dbConfig.find((c) => c.id === "main") || dbConfig[0];
          const stagesActuales = existente?.stages || [];
          const idxPorEnviar = stagesActuales.findIndex((s) => s.id === "por_enviar");
          const idxCotizacion = stagesActuales.findIndex((s) => s.id === "cotizacion");
          let stagesCorregidas = null;
          if (idxPorEnviar === -1) {
            const nuevaEtapa = { id: "por_enviar", label: "Por Enviar", short: "P.ENV", days: 2 };
            stagesCorregidas =
              idxCotizacion >= 0
                ? [...stagesActuales.slice(0, idxCotizacion + 1), nuevaEtapa, ...stagesActuales.slice(idxCotizacion + 1)]
                : [...stagesActuales, nuevaEtapa];
          } else if (idxCotizacion >= 0 && idxPorEnviar < idxCotizacion) {
            const etapaExistente = stagesActuales[idxPorEnviar];
            const sinEsa = stagesActuales.filter((s) => s.id !== "por_enviar");
            const nuevoIdxCot = sinEsa.findIndex((s) => s.id === "cotizacion");
            stagesCorregidas = [...sinEsa.slice(0, nuevoIdxCot + 1), etapaExistente, ...sinEsa.slice(nuevoIdxCot + 1)];
          }
          if (existente && stagesCorregidas) {
            await fsSave("config", "main", { stages: stagesCorregidas });
          }
        }
        const unsubConfig = onSnapshot(collection(db, "config"), (snap) => {
          if (!snap.docs.length) { setConfig(INIT_CONFIG); return; }
          const mainDoc = snap.docs.find((d) => d.id === "main") || snap.docs[0];
          setConfig({ ...INIT_CONFIG, ...mainDoc.data() });
        });
        unsubsDatos.push(unsubConfig);
        const unsubProtos = onSnapshot(collection(db, "prototipos"), (snap) => { setProtos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubProtos);
        const unsubCapsulas = onSnapshot(collection(db, "capsulas"), (snap) => { setCapsulas(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubCapsulas);
        const unsubHistorial = onSnapshot(collection(db, "historial_diseno"), (snap) => { setHistorial(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubHistorial);
        const unsubCronogramaMuestras = onSnapshot(collection(db, "cronograma_muestras"), (snap) => { setCronogramaMuestras(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubCronogramaMuestras);
        // "pedidos_activos" reemplaza a la vieja colección "pedidos" (y a
        // "corte_pedidos" del módulo Corte, que nunca se llegó a usar): es la
        // única fuente de verdad ahora, alimentada por "🧊 Congelar como base
        // de Corte" en Vigentes por Cliente — tanto Pedidos como Corte leen
        // de aquí.
        const unsubPedidos = onSnapshot(collection(db, "pedidos_activos"), (snap) => { setPedidos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubPedidos);
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
        unsubsDatos.push(unsubPedidoConfig);
        const unsubBitacora = onSnapshot(collection(db, "bitacora_envios"), (snap) => { setBitacoraEnvios(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubBitacora);
        const unsubKpiPuestos = onSnapshot(collection(db, "kpi_puestos"), (snap) => { setKpiPuestos(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubKpiPuestos);
        const unsubKpiPersonas = onSnapshot(collection(db, "kpi_personas"), (snap) => { setKpiPersonas(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubKpiPersonas);
        const unsubKpiCatalogo = onSnapshot(collection(db, "kpi_catalogo"), (snap) => { setKpiCatalogo(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubKpiCatalogo);
        const unsubKpiRegistros = onSnapshot(collection(db, "kpi_registros"), (snap) => { setKpiRegistros(snap.docs.map((d) => ({ ...d.data(), id: d.id }))); });
        unsubsDatos.push(unsubKpiRegistros);
        setAppState("ready");
      } catch (e) { console.error("Firebase error:", e); setAppState("login"); }
    }
    return () => { unsubAuth(); unsubsDatos.forEach((fn) => fn()); };
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
  // --- Módulo KPIs (toda la compañía) ---
  // Puestos: { id, area, nombre, funciones }. `area` viene de
  // config.kpiAreas (lista controlada, editable en Administrador General).
  // `funciones` es texto libre con las responsabilidades esperadas de ese
  // puesto — se muestra junto a sus KPIs para poder comparar "lo que debía
  // hacer" contra lo que realmente se registra. No se borran en cascada las
  // personas/KPIs que referencian un puesto borrado (quedan con un puestoId
  // huérfano, KPIsView los filtra al no encontrar el puesto).
  async function addKpiPuesto(p) {
    const withId = { ...p, id: uid() };
    setKpiPuestos((ps) => [...ps, withId]);
    await fsSave("kpi_puestos", withId.id, withId);
  }
  async function updateKpiPuesto(id, patch) {
    const updated = kpiPuestos.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setKpiPuestos(updated);
    await fsSave("kpi_puestos", id, updated.find((p) => p.id === id));
  }
  async function deleteKpiPuesto(id) {
    setKpiPuestos((ps) => ps.filter((p) => p.id !== id));
    await fsDelete("kpi_puestos", id);
  }
  // Roster de personas: { id, nombre, puestoId }. Solo Administrador
  // agrega/edita/borra personas y KPIs del catálogo (ver KPIsView) — así el
  // roster y el catálogo quedan controlados centralmente.
  async function addKpiPersona(p) {
    const withId = { ...p, id: uid() };
    setKpiPersonas((ps) => [...ps, withId]);
    await fsSave("kpi_personas", withId.id, withId);
  }
  async function updateKpiPersona(id, patch) {
    const updated = kpiPersonas.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setKpiPersonas(updated);
    await fsSave("kpi_personas", id, updated.find((p) => p.id === id));
  }
  async function deleteKpiPersona(id) {
    setKpiPersonas((ps) => ps.filter((p) => p.id !== id));
    await fsDelete("kpi_personas", id);
    // Se borran también los registros mensuales de esa persona — si no,
    // quedaban números huérfanos de alguien que ya no está en el roster.
    const registrosDeEsaPersona = kpiRegistros.filter((r) => r.personaId === id);
    if (registrosDeEsaPersona.length) {
      setKpiRegistros((rs) => rs.filter((r) => r.personaId !== id));
      await Promise.all(registrosDeEsaPersona.map((r) => fsDelete("kpi_registros", r.id)));
    }
  }
  // Catálogo: { id, nombre, descripcion, puestoId, unidad, meta }. Cada KPI
  // pertenece a UN solo puesto (se agrupan por puesto en KPIsView, para que
  // sea fácil ver de un vistazo si dos puestos terminan midiendo lo mismo).
  async function addKpiCatalogo(k) {
    const withId = { ...k, id: uid() };
    setKpiCatalogo((ks) => [...ks, withId]);
    await fsSave("kpi_catalogo", withId.id, withId);
  }
  async function updateKpiCatalogo(id, patch) {
    const updated = kpiCatalogo.map((k) => (k.id === id ? { ...k, ...patch } : k));
    setKpiCatalogo(updated);
    await fsSave("kpi_catalogo", id, updated.find((k) => k.id === id));
  }
  async function deleteKpiCatalogo(id) {
    setKpiCatalogo((ks) => ks.filter((k) => k.id !== id));
    await fsDelete("kpi_catalogo", id);
    const registrosDeEseKpi = kpiRegistros.filter((r) => r.kpiId === id);
    if (registrosDeEseKpi.length) {
      setKpiRegistros((rs) => rs.filter((r) => r.kpiId !== id));
      await Promise.all(registrosDeEseKpi.map((r) => fsDelete("kpi_registros", r.id)));
    }
  }
  // Registros: { id, personaId, kpiId, periodo: "AAAA-MM", valor, nota,
  // registradoPor, fecha }. Un registro por (persona, KPI, periodo) — guardar
  // uno existente lo actualiza en vez de duplicarlo (upsert por esa llave).
  async function guardarKpiRegistro({ personaId, kpiId, periodo, valor, nota }) {
    const existente = kpiRegistros.find((r) => r.personaId === personaId && r.kpiId === kpiId && r.periodo === periodo);
    const item = {
      id: existente?.id || uid(),
      personaId,
      kpiId,
      periodo,
      valor,
      nota: nota || "",
      registradoPor: currentUser?.name || "",
      fecha: nowISO(),
    };
    setKpiRegistros((rs) => (existente ? rs.map((r) => (r.id === item.id ? item : r)) : [...rs, item]));
    await fsSave("kpi_registros", item.id, item);
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
  // BORRADO SUAVE (Papelera): "eliminar" desde Prototipos/Cápsulas nunca
  // borra el documento de Firestore — solo lo marca con eliminado:true y lo
  // esconde de protosVisibles/capsulasVisibles (ver más abajo). Así, un clic
  // de más siempre se puede deshacer desde Administración → Papelera. El
  // borrado DE VERDAD (fsDelete, irreversible) solo pasa en las funciones
  // purgar*Definitivo, que solo vive dentro de la Papelera.
  async function deleteProto(id) {
    const updated = protos.map((p) => (p.id === id ? { ...p, eliminado: true, eliminadoEn: nowISO(), eliminadoPor: currentUser?.name || "" } : p));
    setProtos(updated);
    await fsSave("prototipos", id, updated.find((p) => p.id === id));
  }
  async function restaurarProto(id) {
    const updated = protos.map((p) => (p.id === id ? { ...p, eliminado: false } : p));
    setProtos(updated);
    await fsSave("prototipos", id, updated.find((p) => p.id === id));
  }
  async function purgarProtoDefinitivo(id) {
    setProtos((ps) => ps.filter((p) => p.id !== id));
    await fsDelete("prototipos", id);
  }
  // Borrar cápsula es una acción solo de Administrador (ver botón "🗑 Borrar"
  // en CapsulasView, gateado por isAdmin) — ahora es borrado suave, ver nota
  // arriba. Los envíos de Bitácora ya no se tocan aquí: si la cápsula se
  // restaura desde la Papelera, sus envíos siguen intactos tal como estaban.
  async function deleteCapsula(id) {
    const updated = capsulas.map((c) => (c.id === id ? { ...c, eliminado: true, eliminadoEn: nowISO(), eliminadoPor: currentUser?.name || "" } : c));
    await updateCapsulasAndSave(updated);
  }
  async function restaurarCapsula(id) {
    const updated = capsulas.map((c) => (c.id === id ? { ...c, eliminado: false } : c));
    await updateCapsulasAndSave(updated);
  }
  // Purgar SÍ borra la cápsula de verdad — y solo en este caso (irreversible)
  // se limpian también los envíos de Bitácora que le pertenecían, igual que
  // hacía el borrado directo de antes.
  async function purgarCapsulaDefinitivo(id) {
    const updated = capsulas.filter((c) => c.id !== id);
    setCapsulas(updated);
    await fsDelete("capsulas", id);
    const enviosDeEstaCapsula = bitacoraEnvios.filter((e) => (e.items || []).some((it) => it.capsulaId === id));
    if (enviosDeEstaCapsula.length) {
      setBitacoraEnvios((es) => es.filter((e) => !enviosDeEstaCapsula.some((x) => x.id === e.id)));
      await Promise.all(enviosDeEstaCapsula.map((e) => fsDelete("bitacora_envios", e.id)));
    }
  }
  // Borra (suave) UNA referencia dentro de una cápsula sin tocar la cápsula
  // misma ni sus demás referencias — a diferencia de deleteCapsula (que
  // afecta todo el paquete), esto es para "esta referencia se creó por
  // error, pero el resto de la cápsula sigue viva".
  async function deleteRefFromCapsula(capId, refId) {
    const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, referencias: c.referencias.map((r) => (r.id !== refId ? r : { ...r, eliminado: true, eliminadoEn: nowISO(), eliminadoPor: currentUser?.name || "" })) }));
    await updateCapsulasAndSave(updated);
  }
  async function restaurarRefDeCapsula(capId, refId) {
    const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, referencias: c.referencias.map((r) => (r.id !== refId ? r : { ...r, eliminado: false })) }));
    await updateCapsulasAndSave(updated);
  }
  async function purgarRefDefinitivo(capId, refId) {
    const updated = capsulas.map((c) => (c.id !== capId ? c : { ...c, referencias: c.referencias.filter((r) => r.id !== refId) }));
    await updateCapsulasAndSave(updated);
  }
  async function updateProtoName(id, patch) { await updateProto(id, patch); }
  async function updateCapsulaName(id, patch) { const updated = capsulas.map((c) => (c.id !== id ? c : { ...c, ...patch })); setCapsulas(updated); const cap = updated.find((c) => c.id === id); await fsSave("capsulas", id, cap); }
  async function addPedido(p) {
    const updated = [...pedidos, p];
    setPedidos(updated);
    await fsSave("pedidos_activos", p.id, p);
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
    await fsSave("pedidos_activos", updatedPedido.id, updatedPedido);
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
    // Permiso dedicado para aprobar la Programación de Mesones en Corte (el
    // "analista" que revisa lo que el cortador ingresó como datos teóricos
    // antes de que cuente como confirmado) — separado de "aprobar" genérico
    // para no mezclarlo con la aprobación de Pedidos/Prototipos.
    aprobarCorte: userRoleData?.perms?.includes("aprobar_corte") ?? false,
    // Permiso dedicado para aprobar despachos en módulo Bodega (revisa lo que
    // la persona de bodega montó) — separado de "admin" para poder asignarlo
    // a alguien puntual sin darle el resto de permisos de administrador.
    aprobarDespacho: userRoleData?.perms?.includes("aprobar_despacho") ?? false,
    // Permiso dedicado para editar el módulo de KPIs (puestos, funciones,
    // catálogo de KPIs — crear/editar/borrar/trasladar) sin darle a la
    // persona el resto de permisos de administrador general.
    editarKpis: userRoleData?.perms?.includes("editar_kpis") ?? false,
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
  const canAccessKpis = moduloVisible(userRoleData, "kpis", currentUser?.isAdmin);
  const canAccessCorte = moduloVisible(userRoleData, "corte", currentUser?.isAdmin);
  const canAccessContabilidad = moduloVisible(userRoleData, "contabilidad", currentUser?.isAdmin);
  const canAccessPlaneacion = moduloVisible(userRoleData, "planeacion", currentUser?.isAdmin);
  const canAccessPlanta = moduloVisible(userRoleData, "planta", currentUser?.isAdmin);
  const canAccessBodega = moduloVisible(userRoleData, "bodega", currentUser?.isAdmin);
  const canAccessNomina = moduloVisible(userRoleData, "nomina", currentUser?.isAdmin);
  // Informes: vista consolidada de "lo que está vencido" en toda la
  // compañía (hoy solo Diseño, se va ampliando a Bodega/Corte/Contabilidad).
  // Es la contraparte en pantalla del aviso automático por correo.
  const canAccessInformes = moduloVisible(userRoleData, "informes", currentUser?.isAdmin);
  // "admin_diseno" es un permiso aparte del admin general: da entrada al panel
  // de Administración de Diseño (etapas, categorías, roles, usuarios...) sin
  // necesidad de marcar al usuario como Admin general del sistema.
  const canAccessAdminDiseno = moduloVisible(userRoleData, "admin_diseno", currentUser?.isAdmin);
  // KPIs ya NO cuenta para canAccessDiseno — es su propia área de nivel
  // superior en el menú (ver AREAS abajo), porque cubre toda la compañía
  // (Corte, Ventas, Contabilidad, Planeación...), no solo Diseño.
  const canAccessDiseno = canAccessProtos || canAccessCapsulas || canAccessStats || canAccessHistorial || canAccessCronograma || canAccessBitacora || canAccessAdminDiseno || !!currentUser?.isAdmin;
  // Pedidos (Pedidos, Clientes, Admin Pedidos) tenía sus 3 secciones
  // dispersas dentro del menú de Diseño, mezcladas con Prototipos/Historial/
  // Bitácoras/Corte — quedaba desordenado. Ahora es su propia área de nivel
  // superior, igual que Contabilidad/Planeación/Planta/Bodega, con las 3
  // secciones juntas ahí dentro. A diferencia de esas otras áreas (que son
  // módulos externos con su propio moduloActivo), Pedidos sigue usando el
  // mecanismo normal de "view" — igual que KPIs. Corte también se movió para
  // acá: trabaja directo sobre los mismos pedidos (pedidos_activos es la
  // misma colección que usa "Pedidos"), tiene más que ver con esto que con
  // el flujo de diseño/aprobación.
  const canAccessPedidosArea = canAccessPedidos || canAccessPedidosClientes || canAccessCorte || !!currentUser?.isAdmin;
  const [moduloActivo, setModuloActivo] = useState("diseno");
  const AREAS = [
    ...(canAccessDiseno
      ? [{
          id: "diseno", icon: "🎨", label: "Diseño",
          items: [
            ...(canAccessProtos ? [{ id: "protos", icon: "⬡", label: "Prototipos" }] : []),
            ...(canAccessCapsulas ? [{ id: "capsulas", icon: "⬢", label: "Cápsulas" }] : []),
            ...(canAccessStats ? [{ id: "stats", icon: "📊", label: "Estadísticas Diseño" }] : []),
            ...(canAccessHistorial ? [{ id: "historial", icon: "🕘", label: "Historial" }] : []),
            ...(canAccessBitacora ? [{ id: "bitacora", icon: "📜", label: "Bitácoras" }] : []),
            ...(canAccessCronograma ? [{ id: "cronograma_muestras", icon: "🧵", label: "Cronograma de Muestras" }] : []),
            // "Administrador General" siempre queda al final de la lista, sin
            // importar qué otras secciones estén visibles para el rol.
            ...(canAccessAdminDiseno ? [{ id: "admin", icon: "⚙", label: "Administrador General" }] : []),
          ],
        }]
      : []),
    ...(canAccessPedidosArea
      ? [{
          id: "pedidos_area", icon: "🧾", label: "Pedidos",
          items: [
            ...(canAccessPedidos ? [{ id: "pedidos", icon: "📦", label: "Pedidos" }] : []),
            ...(canAccessPedidosClientes ? [{ id: "pedidos_clientes", icon: "🏢", label: "Clientes" }] : []),
            ...(canAccessCorte ? [{ id: "__corte__", icon: "✂", label: "Corte" }] : []),
            ...(currentUser?.isAdmin ? [{ id: "pedidos_admin", icon: "⚙", label: "Admin Pedidos" }] : []),
          ],
        }]
      : []),
    ...(canAccessContabilidad
      ? [{ id: "contabilidad_area", icon: "💰", label: "Contabilidad", items: [{ id: "contabilidad_area", icon: "💰", label: "Módulo Contabilidad" }] }]
      : []),
    ...(canAccessPlaneacion
      ? [{ id: "planeacion_area", icon: "📋", label: "Planeación", items: [{ id: "planeacion_area", icon: "📋", label: "Módulo Planeación" }] }]
      : []),
    ...(canAccessPlanta
      ? [{ id: "planta_area", icon: "🏭", label: "Planta", items: [{ id: "planta_area", icon: "🏭", label: "Módulo Planta" }] }]
      : []),
    ...(canAccessBodega
      ? [{ id: "bodega_area", icon: "📦", label: "Bodega", items: [{ id: "bodega_area", icon: "📦", label: "Módulo Bodega" }] }]
      : []),
    ...(canAccessNomina
      ? [{ id: "nomina_area", icon: "👷", label: "Nómina", items: [{ id: "nomina_area", icon: "👷", label: "Módulo Nómina" }] }]
      : []),
    // KPIs es su propia área de nivel superior (cubre toda la compañía).
    // A diferencia de Contabilidad/Planeación, no es un módulo externo aparte
    // (moduloActivo) — se renderiza dentro del layout normal usando el mismo
    // mecanismo de "view" que Prototipos/Cápsulas/Bitácora, por eso el id del
    // ítem interno es simplemente "kpis" (sin necesitar un caso especial en
    // isViewActive/navClick).
    ...(canAccessKpis
      ? [{ id: "kpis_area", icon: "🎯", label: "KPIs", items: [{ id: "kpis", icon: "🎯", label: "Módulo KPIs" }] }]
      : []),
    ...(canAccessInformes
      ? [{ id: "informes_area", icon: "📋", label: "Informes", items: [{ id: "informes_area", icon: "📋", label: "Módulo Informes" }] }]
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
    if (itemId === "planta_area") return moduloActivo === "planta";
    if (itemId === "bodega_area") return moduloActivo === "bodega";
    if (itemId === "nomina_area") return moduloActivo === "nomina";
    if (itemId === "informes_area") return moduloActivo === "informes";
    return view === itemId;
  }
  function navClick(itemId) {
    if (itemId === "__corte__") { setModuloActivo("corte"); return; }
    if (itemId === "contabilidad_area") { setModuloActivo("contabilidad"); return; }
    if (itemId === "planeacion_area") { setModuloActivo("planeacion"); return; }
    if (itemId === "planta_area") { setModuloActivo("planta"); return; }
    if (itemId === "bodega_area") { setModuloActivo("bodega"); return; }
    if (itemId === "nomina_area") { setModuloActivo("nomina"); return; }
    if (itemId === "informes_area") { setModuloActivo("informes"); return; }
    setView(itemId);
  }
  // "Planeador puro": solo tiene Corte y NINGUNA otra sección de Diseño (ni
  // Pedidos). Si además tiene Pedidos u otra sección, ya no aplica este atajo
  // de pantalla completa — ve el shell normal con solo esas secciones visibles.
  const isPlaneadorPuro = canAccessCorte && !canAccessPedidos && !canAccessProtos && !canAccessCapsulas && !canAccessPedidosClientes && !canAccessStats && !perms.editar && !perms.aprobar && !currentUser?.isAdmin;
  // Igual que "Planeador puro" arriba: este atajo de pantalla completa solo
  // debe aplicar si Contabilidad es LO ÚNICO que el rol puede ver. Antes solo
  // se fijaba en "!canAccessDiseno", así que un rol con Contabilidad + Bodega
  // (o + Planta/Planeación/Nómina/KPIs/Informes/Corte) caía en este atajo
  // igual y quedaba encerrado en Contabilidad sin poder llegar a Bodega — se
  // agregan todas las demás secciones de nivel superior a la condición.
  const isContabilidadPura =
    canAccessContabilidad &&
    !canAccessDiseno &&
    !canAccessCorte &&
    !canAccessBodega &&
    !canAccessPlanta &&
    !canAccessPlaneacion &&
    !canAccessNomina &&
    !canAccessKpis &&
    !canAccessInformes;
  if (appState === "loading") return <LoadingScreen message="Conectando con Firebase..." />;
  if (appState === "login" || !currentUser) return <LoginScreen externalError={loginError} />;
  if (isPlaneadorPuro) {
    return <ModuloCorte currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} puedeAprobarCorte={perms.aprobarCorte} />;
  }
  if (isContabilidadPura) {
    return <ModuloContabilidad currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} />;
  }
  if (canAccessCorte && moduloActivo === "corte") {
    return <ModuloCorte currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} onVolver={() => setModuloActivo("diseno")} puedeAprobarCorte={perms.aprobarCorte} />;
  }
  if (moduloActivo === "contabilidad") {
    return <ModuloContabilidad currentUser={currentUser} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} />;
  }
  if (moduloActivo === "planeacion") {
    return <ModuloPlaneacion currentUser={currentUser} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} />;
  }
  if (moduloActivo === "planta") {
    return <ModuloPlanta currentUser={currentUser} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} />;
  }
  if (moduloActivo === "bodega") {
    return <ModuloBodega currentUser={currentUser} puedeAprobarDespacho={perms.aprobarDespacho} canAccessContabilidad={canAccessContabilidad} soloLecturaBodega={currentUser?.role === "Cliente"} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} />;
  }
  if (moduloActivo === "nomina") {
    return <ModuloNomina currentUser={currentUser} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} />;
  }
  if (moduloActivo === "informes") {
    return <ModuloInformes currentUser={currentUser} onVolver={() => setModuloActivo("diseno")} onLogout={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} />;
  }
  return (
    <div style={{ minHeight: "100vh", background: T.canvas, fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:${T.seam};border-radius:3px;}`}</style>
      <Toast items={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      {showCambiarClave && (
        <CambiarClaveModal currentUser={currentUser}
          onSave={() => {
            notify({ id: uid(), icon: "🔑", title: "Contraseña actualizada", msg: "Tu nueva contraseña ya quedó activa." });
          }}
          onClose={() => setShowCambiarClave(false)}
        />
      )}
      {modal === "new-proto" && <NewProtoModal onSave={addProto} onClose={() => setModal(null)} config={config} protos={protos} capsulas={capsulas} />}
      {modal === "new-capsula" && <NewCapsulaModal onSave={addCapsula} onClose={() => setModal(null)} config={config} />}
      {modal === "new-ref" && newRefCap && <NewRefModal capsula={newRefCap} onSave={addRef} onClose={() => { setModal(null); setNewRefCap(null); }} config={config} protos={protos} capsulas={capsulas} />}
      {modal === "promote" && promoteProto && <PromoteModal proto={promoteProto} capsulas={capsulas} onSave={promoteToCapsula} onClose={() => { setModal(null); setPromoteProto(null); }} config={config} />}
      {modal === "new-pedido" && <SubirPedidoModal2 onSave={addPedido} onClose={() => setModal(null)} pedidoConfig={pedidoConfig} pedidos={pedidos} clientes={config.clientes} />}
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <div style={{ width: 230, background: T.ink, color: T.white, padding: "20px 12px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ marginBottom: 16, padding: "0 4px" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.white }}>ATLAS</div>
            <div style={{ fontSize: 10, color: T.seam, marginTop: 1, letterSpacing: "0.1em", textTransform: "uppercase" }}>Industrias Yanko</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#2A2A45", borderRadius: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${T.seam},${T.seamDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: T.ink, flexShrink: 0 }}>{currentUser.avatar}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: T.seam }}>{currentUser.role}</div>
            </div>
            <button onClick={() => { setCurrentUser(null); setAppState("login"); signOut(auth).catch(() => {}); }} title="Cerrar sesión" style={{ background: "none", border: "none", color: "rgba(200,184,162,0.4)", cursor: "pointer", fontSize: 15, padding: 0 }}>⏏</button>
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
              <HomeView currentUser={currentUser} perms={perms} canAccessCorte={canAccessCorte} canAccessContabilidad={canAccessContabilidad} canAccessPlaneacion={canAccessPlaneacion} canAccessPlanta={canAccessPlanta} canAccessBodega={canAccessBodega} canAccessNomina={canAccessNomina} canAccessDiseno={canAccessDiseno} canAccessPedidosArea={canAccessPedidosArea} canAccessKpis={canAccessKpis} canAccessInformes={canAccessInformes}
                onGoArea={(id) => {
                  if (id === "contabilidad_area") { setModuloActivo("contabilidad"); }
                  else if (id === "planeacion_area") { setModuloActivo("planeacion"); }
                  else if (id === "planta_area") { setModuloActivo("planta"); }
                  else if (id === "bodega_area") { setModuloActivo("bodega"); }
                  else if (id === "nomina_area") { setModuloActivo("nomina"); }
                  else if (id === "informes_area") { setModuloActivo("informes"); }
                  else if (id === "kpis_area") { setAreaAbierta("kpis_area"); setView("kpis"); }
                  else if (id === "pedidos_area") {
                    setAreaAbierta("pedidos_area");
                    if (canAccessPedidos) setView("pedidos");
                    else if (canAccessPedidosClientes) setView("pedidos_clientes");
                    else if (currentUser?.isAdmin) setView("pedidos_admin");
                    else if (canAccessCorte) setModuloActivo("corte");
                  }
                  else if (id === "diseno") {
                    setAreaAbierta("diseno");
                    // Entra a la primera sección de Diseño realmente habilitada
                    // para el rol.
                    if (canAccessProtos) setView("protos");
                    else if (canAccessCapsulas) setView("capsulas");
                    else if (canAccessStats) setView("stats");
                    else if (canAccessHistorial) setView("historial");
                    else if (canAccessBitacora) setView("bitacora");
                    else if (canAccessCronograma) setView("cronograma_muestras");
                    else if (canAccessCorte) setModuloActivo("corte");
                  }
                  else { setView(id); }
                }}
                protos={protosVisibles} capsulas={capsulasVisibles} pedidos={pedidosVisibles}
              />
            )}
            {view === "protos" && (
              <ProtosView protos={protosVisibles} role={role} perms={perms} capsulas={capsulasVisibles}
                onSelect={(id) => { setSelProtoId(id); setView("proto-detail"); }}
                onNew={() => setModal("new-proto")}
                onPromote={(p) => { setPromoteProto(p); setModal("promote"); }}
                stages={config.stages}
                isAdmin={currentUser?.isAdmin} onDeleteProto={deleteProto} config={config}
                onCrearEnvio={crearEnvioBitacora}
              />
            )}
            {view === "capsulas" && (
              <CapsulasView capsulas={capsulasVisibles} role={role} perms={perms} currentUser={currentUser?.name}
                onSelectRef={(capId, refId) => { setSelCapId(capId); setSelRefId(refId); setView("ref-detail"); }}
                onNewCapsula={() => setModal("new-capsula")}
                onNewRef={(cap) => { setNewRefCap(cap); setModal("new-ref"); }}
                onEditCapsula={updateCapsulaName}
                stages={config.stages}
                isAdmin={currentUser?.isAdmin} onDeleteCapsula={deleteCapsula} onDeleteRef={deleteRefFromCapsula} config={config}
                onSetIlustracion={setIlustracionCapsula}
                onSendObsCapsula={sendObservacionCapsula}
                onMarkDoneObsCapsula={markDoneObservacionCapsula}
                onCrearEnvio={crearEnvioBitacora}
              />
            )}
            {view === "bitacora" && (
              <BitacorasView
                envios={bitacoraEnvios}
                onUpdateEnvio={updateBitacoraEnvio}
                protos={protosVisibles}
                capsulas={capsulasVisibles}
                pedidos={pedidosVisibles}
                historial={historial}
                onGoHistorial={() => { setHistorialFiltroInicial({ resultado: "declinado", tipo: "todos" }); setView("historial"); }}
                onSelectRef={(capId, refId) => { setSelCapId(capId); setSelRefId(refId); setView("ref-detail"); }}
                onVincularPedido={(capId, refId, patch) => updateRef(capId, refId, patch)}
                currentUser={currentUser}
              />
            )}
            {view === "kpis" && (
              <KPIsView
                areas={config.kpiAreas || []}
                puestos={kpiPuestos}
                personas={kpiPersonas}
                catalogo={kpiCatalogo}
                registros={kpiRegistros}
                isAdmin={currentUser?.isAdmin || perms.editarKpis}
                onAddPuesto={addKpiPuesto}
                onUpdatePuesto={updateKpiPuesto}
                onDeletePuesto={deleteKpiPuesto}
                onAddPersona={addKpiPersona}
                onUpdatePersona={updateKpiPersona}
                onDeletePersona={deleteKpiPersona}
                onAddKpi={addKpiCatalogo}
                onUpdateKpi={updateKpiCatalogo}
                onDeleteKpi={deleteKpiCatalogo}
                onGuardarRegistro={guardarKpiRegistro}
              />
            )}
            {view === "proto-detail" && selProto && (
              <DetailView item={selProto} kind="proto" role={role} perms={perms} capsulas={capsulas}
                onBack={() => setView("protos")}
                onUpdateItem={(p) => updateProto(selProto.id, p)}
                onPromote={(p) => { setPromoteProto(p); setModal("promote"); }}
                onLogHistorial={logHistorial}
                notify={notify} stages={config.stages} currentUser={currentUser.name} config={config}
                cronogramaMuestras={cronogramaMuestras} onSendTaller={addCronogramaMuestra} onUpdateTaller={updateCronogramaMuestra}
                onCrearEnvio={crearEnvioBitacora}
              />
            )}
            {view === "ref-detail" && selRef && selCap && (
              <DetailView item={selRef} kind="ref" role={role} perms={perms} capsulas={capsulas} capsula={selCap} protos={protos}
                onBack={() => setView("capsulas")}
                onUpdateItem={(p) => updateRef(selCap.id, selRef.id, p)}
                onLogHistorial={logHistorial}
                notify={notify} stages={config.stages} currentUser={currentUser.name} config={config}
                cronogramaMuestras={cronogramaMuestras} onSendTaller={addCronogramaMuestra} onUpdateTaller={updateCronogramaMuestra}
                onCrearEnvio={crearEnvioBitacora}
              />
            )}
            {view === "pedidos" && (
              <PedidosView pedidos={pedidosVisibles}
                onSelectPedido={(id) => { setSelPedidoId(id); setView("pedido-detail"); }}
                onNewPedido={() => setModal("new-pedido")}
                onUpdatePedido={updatePedido}
                pedidoConfig={pedidoConfig}
                onSavePedidoConfig={savePedidoConfig}
                isAdmin={currentUser?.isAdmin}
                currentUser={currentUser}
              />
            )}
            {view === "pedido-detail" && selPedido && <PedidoDetailView pedido={selPedido} onBack={() => setView("pedidos")} onUpdatePedido={updatePedido} />}
            {view === "pedidos_admin" && currentUser?.isAdmin && <AdminPedidosView pedidoConfig={pedidoConfig} onSave={savePedidoConfig} config={config} onSaveConfig={saveConfig} />}
            {view === "pedidos_clientes" && <ClientesPedidosView clientes={config.clientes} pedidos={pedidosVisibles} protos={protosVisibles} capsulas={capsulasVisibles} />}
            {view === "stats" && <EstadisticasView protos={protosVisibles} capsulas={capsulasVisibles} stages={config.stages} config={config} />}
            {view === "historial" && (
              <HistorialDisenoView historial={historial} protos={protosVisibles} capsulas={capsulasVisibles} pedidos={pedidosVisibles} role={role} perms={perms} stages={config.stages}
                isAdmin={currentUser?.isAdmin} onBackfill={backfillHistorial}
                onSelectProto={(id) => { setSelProtoId(id); setView("proto-detail"); }}
                onSelectRef={(capId, refId) => { setSelCapId(capId); setSelRefId(refId); setView("ref-detail"); }}
                onPromote={(p) => { setPromoteProto(p); setModal("promote"); }}
                initialResultado={historialFiltroInicial?.resultado}
                initialTipoFiltro={historialFiltroInicial?.tipo}
                onVincularPedido={(capId, refId, patch) => updateRef(capId, refId, patch)}
                currentUser={currentUser}
              />
            )}
            {view === "cronograma_muestras" && (
              <CronogramaMuestrasView cronogramaMuestras={cronogramaMuestrasVisibles} config={config} isAdmin={currentUser?.isAdmin}
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
                onRestaurarProto={restaurarProto} onRestaurarCapsula={restaurarCapsula} onRestaurarRef={restaurarRefDeCapsula}
                onPurgarProto={purgarProtoDefinitivo} onPurgarCapsula={purgarCapsulaDefinitivo} onPurgarRef={purgarRefDefinitivo}
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
    console.error("ATLAS — error capturado por ErrorBoundary:", error, info);
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
