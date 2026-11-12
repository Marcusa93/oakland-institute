import "server-only";
import type { crearClienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/** Fila de `entregas_de_estudiante`: nota, reacción y devolución solo si están publicadas. */
export interface EntregaEstudiante {
  actividad_id: string; titulo: string; habilidad: string; evaluacion: string; cierra_en: string | null;
  comision: string; estado: "pendiente" | "en_curso" | "entregada" | "corregida"; entregada_en: string | null;
  nota: string | number | null; puntaje_max: string | number; devolucion: string | null; reaccion: string | null;
  audio_ruta: string | null; audio_segundos: number | null; devolucion_audio: string | null;
}

export type Situacion = "pendiente" | "vencida" | "entregada" | "corregida";

/**
 * La función devuelve 'corregida' también cuando la corrección no se publicó
 * (con nota, reacción y devolución en nulo). Para el estudiante eso es
 * "entregada": todavía no tiene resultado.
 */
export function situacion(e: EntregaEstudiante, referencia: number): Situacion {
  if (e.estado === "corregida") return e.nota !== null || e.reaccion || e.devolucion || e.devolucion_audio ? "corregida" : "entregada";
  if (e.estado === "entregada") return "entregada";
  return e.cierra_en && new Date(e.cierra_en).getTime() <= referencia ? "vencida" : "pendiente";
}

export async function entregasDe(supabase: Cliente, estudianteId: string) {
  const r = await supabase.rpc("entregas_de_estudiante", { p_estudiante: estudianteId });
  return { entregas: (r.data ?? []) as EntregaEstudiante[], error: r.error };
}

export async function estudianteDePersona(supabase: Cliente, personaId: string) {
  const r = await supabase.from("estudiantes").select("id").eq("persona_id", personaId).maybeSingle();
  return { id: (r.data?.id as string | undefined) ?? null, error: r.error };
}
