import type { Perfil } from "@/lib/permisos";

/** Tipos de notificación al celular (mismos valores que public.preferencias_push.tipo). */
export const TIPOS = ["aviso_general", "aviso_academico", "aviso_pagos", "actividad", "devolucion", "material", "mensaje"] as const;
export type TipoNotificacion = (typeof TIPOS)[number];

export interface GrupoTipos { titulo: string; tipos: { tipo: TipoNotificacion; etiqueta: string; detalle: string }[] }

const AVISOS: GrupoTipos = {
  titulo: "Avisos del instituto",
  tipos: [
    { tipo: "aviso_general", etiqueta: "Avisos generales", detalle: "Novedades del instituto o de la comisión: horarios, feriados, eventos." },
    { tipo: "aviso_academico", etiqueta: "Avisos académicos", detalle: "Sobre la cursada: evaluaciones, tareas y avance." },
    { tipo: "aviso_pagos", etiqueta: "Pagos y cuotas", detalle: "Recordatorios de cuotas y avisos de pagos, si sos quien paga." },
  ],
};
const CURSADA: GrupoTipos = {
  titulo: "Cursada",
  tipos: [
    { tipo: "actividad", etiqueta: "Actividades nuevas", detalle: "Cuando el docente publica una actividad para hacer o entregar." },
    { tipo: "devolucion", etiqueta: "Devoluciones", detalle: "Cuando corrigen una actividad y ya se ven la nota y los comentarios." },
    { tipo: "material", etiqueta: "Material nuevo", detalle: "Cuando comparten un texto o un audio en la Biblioteca." },
  ],
};
const MENSAJES: GrupoTipos = {
  titulo: "Mensajes",
  tipos: [{ tipo: "mensaje", etiqueta: "Mensajes", detalle: "Cuando alguien te escribe o te responde." }],
};

/**
 * Lo que puede llegarle a cada perfil: estudiantes y familias reciben avisos y
 * novedades de la cursada; el equipo del instituto, solo mensajes.
 */
export function gruposPara(perfiles: readonly Perfil[]): GrupoTipos[] {
  const cursa = perfiles.includes("estudiante") || perfiles.includes("tutor");
  return cursa ? [AVISOS, CURSADA, MENSAJES] : [MENSAJES];
}
