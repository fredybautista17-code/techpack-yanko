// ─── EQUIPOS DE CORTE — cálculo (sin pantalla) ───────────────────────────────
// (2026-11-04, a pedido de Fredy) Corte se mide por equipos en vez de persona por persona:
//   · Equipo = un cortador + su(s) ayudante(s). Ingreso = lo que cortó el cortador; costo = sueldo del cortador + el de sus ayudantes.
//     Los ayudantes no cortan: su costo lo cubre lo que corta su cortador.
//   · Los excedentes de los equipos se SUMAN (si un equipo queda corto, se resta de esa suma) y cubren a la persona de apoyo
//     (doña Berta: marras y segundas). Lo que ella registre como cortes suma como ingreso; las marras no se miden.
//   · Lo que quede sin cubrir es la ayuda general de Corte (lo que el centro de costo no alcanzó). Los excedentes finales no se
//     restan en «¿Cubro mis costos?».
// Quién es cortador, ayudante (de quién) o apoyo se guarda en costos_config/corte_equipos (campo `miembros`).
import { normTexto } from "./centro-costo-historico-parser";

export const ROLES_EQUIPO = [
  { id: "cortador", label: "Cortador" },
  { id: "ayudante", label: "Ayudante" },
  { id: "apoyo", label: "Apoyo (marras y segundas)" },
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const tokens = (s) => normTexto(s).split(/\s+/).filter(Boolean);

// Mismo nombre aunque uno venga más corto («ANDRES VEGA» = «ANDRES ESTEBAN VEGA GONZALEZ»): todas las palabras del más corto
// (mínimo dos) están en el más largo.
export function mismoNombre(a, b) {
  const x = normTexto(a);
  const y = normTexto(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return corto.length >= 2 && corto.every((t) => largo.includes(t));
}

export function hayEquipos(miembros) {
  return Array.isArray(miembros) && miembros.some((m) => m && m.rol === "cortador");
}

// filas: [{ nombre, unidades, ingreso, costo }] (lo que ya calcula la pantalla de Centro de Costo de Corte).
// Devuelve null si todavía no hay cortadores configurados (la pantalla sigue como estaba).
export function calcularEquiposCorte(filas, miembros) {
  if (!hayEquipos(miembros)) return null;
  const lista = (filas || []).map((f) => ({ nombre: f.nombre, unidades: num(f.unidades), ingreso: num(f.ingreso ?? f.valorProducido ?? f.valor), costo: num(f.costo) }));
  const rolDe = (f) => (miembros || []).find((m) => m && mismoNombre(m.nombre, f.nombre));
  const cortadores = [];
  const ayudantes = [];
  const apoyo = [];
  const solos = [];
  lista.forEach((f) => {
    const m = rolDe(f);
    const rol = m?.rol;
    if (rol === "cortador") cortadores.push({ ...f, m });
    else if (rol === "ayudante") ayudantes.push({ ...f, m });
    else if (rol === "apoyo") apoyo.push({ ...f, m });
    else solos.push(f);
  });
  const equipos = cortadores.map((c) => {
    const suyos = ayudantes.filter((a) => a.m?.ayudanteDe && mismoNombre(a.m.ayudanteDe, c.nombre));
    const ingreso = c.ingreso + suyos.reduce((s, a) => s + a.ingreso, 0);
    const costo = c.costo + suyos.reduce((s, a) => s + a.costo, 0);
    return { cortador: c, ayudantes: suyos, ingreso, costo, resultado: ingreso - costo, unidades: c.unidades + suyos.reduce((s, a) => s + a.unidades, 0) };
  });
  const sueltos = ayudantes.filter((a) => !equipos.some((e) => e.ayudantes.includes(a)));
  // Quien no tiene rol se mide solo, como un equipo de una persona (así no se pierde su costo ni su ingreso).
  const equiposSolos = [...solos, ...sueltos].map((p) => ({ cortador: p, ayudantes: [], ingreso: p.ingreso, costo: p.costo, resultado: p.ingreso - p.costo, unidades: p.unidades, sinRol: true }));
  const todos = [...equipos, ...equiposSolos];
  const excedenteEquipos = todos.reduce((s, e) => s + e.resultado, 0);
  const ingresoEquipos = todos.reduce((s, e) => s + e.ingreso, 0);
  const costoEquipos = todos.reduce((s, e) => s + e.costo, 0);
  const apoyoIngreso = apoyo.reduce((s, p) => s + p.ingreso, 0);
  const apoyoCosto = apoyo.reduce((s, p) => s + p.costo, 0);
  const apoyoUnidades = apoyo.reduce((s, p) => s + p.unidades, 0);
  const resultadoGeneral = ingresoEquipos + apoyoIngreso - costoEquipos - apoyoCosto;
  const ingresoTotal = ingresoEquipos + apoyoIngreso;
  const costoTotal = costoEquipos + apoyoCosto;
  const unidadesTotal = todos.reduce((s, e) => s + e.unidades, 0) + apoyoUnidades;
  const precioPorUnidad = unidadesTotal > 0 ? ingresoTotal / unidadesTotal : 0;
  const ayudaGeneral = Math.max(0, -resultadoGeneral);
  return {
    equipos: todos, apoyo, excedenteEquipos, ingresoEquipos, costoEquipos,
    apoyoIngreso, apoyoCosto, apoyoUnidades, apoyoRecibe: apoyo.length ? excedenteEquipos : 0,
    resultadoGeneral, ayudaGeneral, excedenteGeneral: Math.max(0, resultadoGeneral),
    ingresoTotal, costoTotal, unidadesTotal,
    cobertura: costoTotal > 0 ? (ingresoTotal / costoTotal) * 100 : null,
    unidadesQueFaltan: ayudaGeneral > 0 && precioPorUnidad > 0 ? Math.ceil(ayudaGeneral / precioPorUnidad) : 0,
  };
}
