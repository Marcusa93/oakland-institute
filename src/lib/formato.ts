import { institucion } from "@/config/institucion";

const { locale, zonaHoraria, moneda } = institucion;

const fmtMoneda = new Intl.NumberFormat(locale, { style: "currency", currency: moneda });
const fmtFecha = new Intl.DateTimeFormat(locale, { timeZone: zonaHoraria, day: "2-digit", month: "2-digit", year: "numeric" });
const fmtFechaHora = new Intl.DateTimeFormat(locale, {
  timeZone: zonaHoraria,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Importes: llegan como string/number desde numeric(14,2). Ej.: $ 45.000,00 */
export function pesos(valor: string | number | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? fmtMoneda.format(n) : "—";
}

/** Fechas de negocio (`date`, "2027-03-08"): se muestran tal cual, sin corrimiento horario. */
export function fecha(valor: string | null | undefined) {
  if (!valor) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : fmtFecha.format(d);
}

/** Instantes (`timestamptz`): se convierten a la hora de Tucumán. */
export function fechaHora(valor: string | null | undefined) {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : fmtFechaHora.format(d);
}

/** Fecha de hoy en Tucumán, en formato ISO (para `date`). */
export function hoyISO(ahora: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit" });
  return p.format(ahora);
}

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export function diaSemana(n: number) {
  return DIAS[n] ?? "";
}

export function nombreCompleto(p: { nombres: string; apellidos: string } | null | undefined) {
  return p ? `${p.apellidos}, ${p.nombres}` : "—";
}

/** Convierte "45.000,50" o "45000.50" a un decimal con punto, sin pasar por float. */
export function normalizarImporte(texto: string): string | null {
  const limpio = texto.trim().replace(/\s|\$/g, "");
  if (!limpio) return null;
  let normal: string;
  if (/,\d{1,2}$/.test(limpio)) {
    normal = limpio.replace(/\./g, "").replace(",", "."); // 45.000,50
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normal = limpio.replace(/\./g, ""); // 45.000 → miles, formato argentino
  } else {
    normal = limpio; // 45000 o 45000.50
  }
  return /^\d{1,12}(\.\d{1,2})?$/.test(normal) ? normal : null;
}
