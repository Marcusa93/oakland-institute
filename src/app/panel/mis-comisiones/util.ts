import { diaSemana } from "@/lib/formato";
import type { Tono } from "@/componentes/ui";

/** Utilidades compartidas por las pantallas de cursada (sin acceso a datos). */

export const UUID = /^[0-9a-f-]{36}$/i;

export const ESTADOS_ASISTENCIA = [
  ["presente", "Presente"], ["ausente", "Ausente"], ["tarde", "Tarde"], ["justificada", "Justificada"],
] as const;
export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number][0];
export const ETIQUETA_ASISTENCIA: Record<string, string> = Object.fromEntries(ESTADOS_ASISTENCIA);
export const TONO_ASISTENCIA: Record<string, Tono> = { presente: "exito", ausente: "peligro", tarde: "alerta", justificada: "marca" };

export interface Horario {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  vigencia?: string | null;
  aula_id?: string | null;
  aulas?: { nombre: string } | null;
}

/** "18:00:00" → "18:00" */
export const hora = (t: string | null | undefined) => (t ?? "").slice(0, 5);

/** Día ISO (1 = lunes … 7 = domingo) de una fecha de negocio "AAAA-MM-DD". */
export function diaISO(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** ¿La fecha cae dentro de un `daterange` de Postgres, p. ej. "[2027-03-01,2027-12-16)"? */
export function enVigencia(vigencia: string | null | undefined, fecha: string) {
  if (!vigencia) return true;
  const m = /^([\[(])(\d{4}-\d{2}-\d{2})?,(\d{4}-\d{2}-\d{2})?([\])])$/.exec(vigencia.replace(/["\s]/g, ""));
  if (!m) return vigencia !== "empty";
  const [, abre, desde, hasta, cierra] = m;
  if (desde && (abre === "[" ? fecha < desde : fecha <= desde)) return false;
  if (hasta && (cierra === "]" ? fecha > hasta : fecha >= hasta)) return false;
  return true;
}

/** ¿El horario ya terminó? (los que todavía no empezaron se siguen mostrando) */
function terminado(vigencia: string | null | undefined, fecha: string) {
  const m = /,(\d{4}-\d{2}-\d{2})?([\])])$/.exec((vigencia ?? "").replace(/["\s]/g, ""));
  if (!m?.[1]) return false;
  return m[2] === "]" ? fecha > m[1] : fecha >= m[1];
}

/** Horarios vigentes o futuros, ordenados por día y hora. */
export function horariosVigentes<T extends Horario>(horarios: T[] | null | undefined, fecha: string) {
  return [...(horarios ?? [])]
    .filter((h) => !terminado(h.vigencia, fecha))
    .sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio));
}

export function textoHorario(h: Horario) {
  return `${diaSemana(h.dia_semana)} de ${hora(h.hora_inicio)} a ${hora(h.hora_fin)}${h.aulas?.nombre ? ` · ${h.aulas.nombre}` : ""}`;
}
