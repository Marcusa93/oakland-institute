// Módulo común (sin "use client"): criterios de la evaluación docente.
// Se pueden editar acá: las evaluaciones guardan la clave de cada criterio en
// `puntajes`, así que al cambiar uno conviene agregar una clave nueva en vez
// de reutilizar la anterior (las evaluaciones viejas siguen mostrando la suya).

export const CRITERIOS = [
  { clave: "planificacion", nombre: "Planificación", ayuda: "Clases preparadas, objetivos claros, actividades acordes al nivel." },
  { clave: "clima", nombre: "Clima de clase", ayuda: "Participación, respeto, uso del inglés en el aula." },
  { clave: "seguimiento", nombre: "Seguimiento de estudiantes", ayuda: "Correcciones a tiempo, devoluciones, atención a las alertas." },
  { clave: "familias", nombre: "Comunicación con familias", ayuda: "Respuestas claras y a tiempo por el canal institucional." },
  { clave: "administrativo", nombre: "Cumplimiento administrativo", ayuda: "Asistencia tomada, notas cargadas, puntualidad." },
] as const;

export type ClaveCriterio = (typeof CRITERIOS)[number]["clave"];

export const ESCALA = [
  [1, "Insuficiente"], [2, "A mejorar"], [3, "Adecuado"], [4, "Muy bueno"], [5, "Excelente"],
] as const;

/** Nombre legible de una clave (incluye claves viejas que ya no estén en la lista). */
export function nombreCriterio(clave: string) {
  return CRITERIOS.find((c) => c.clave === clave)?.nombre ?? clave;
}

export function promedio(puntajes: Record<string, unknown> | null | undefined) {
  const v = Object.values(puntajes ?? {}).map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
