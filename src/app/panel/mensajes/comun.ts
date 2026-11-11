// Módulo común (sin "use client"): lo usan las páginas de servidor y los componentes cliente.

export interface Destinatario { id: string; nombre: string; detalle: string }

export interface EstudianteMensajes {
  id: string;
  nombre: string;
  /** Por qué aparece: "Tu cursada", "Tu hijo/a", "Tu comisión: …" */
  relacion: string;
  destinatarios: Destinatario[];
}

export const REGLAS_CANAL =
  "Canal institucional: las familias y los estudiantes escriben a los docentes de su cursada o al equipo de gestión; " +
  "los docentes, a sus estudiantes o a sus familias; administración y dirección, a cualquier persona del instituto. " +
  "Las conversaciones sobre un estudiante pueden ser revisadas por dirección. Los mensajes no se editan ni se borran.";

export const MENSAJE_NO_AUTORIZADO =
  "Ese destinatario no está habilitado por las reglas del canal institucional. Solo podés escribirle a los docentes de la cursada del estudiante, " +
  "a sus responsables (si sos docente) o al equipo de gestión. Si necesitás hablar con otra persona, escribile a administración.";

export function nombrePersona(p: { nombres: string; apellidos: string; nombre_preferido?: string | null } | null | undefined) {
  if (!p) return null;
  return `${p.nombre_preferido || p.nombres} ${p.apellidos}`;
}

/** Respaldo si participantes_de_hilo no devuelve el nombre (no debería pasar). */
export const NOMBRE_RESERVADO = "Equipo del instituto";
