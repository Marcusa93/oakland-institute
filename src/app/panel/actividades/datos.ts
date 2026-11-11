import "server-only";
import type { Sesion } from "@/lib/sesion";
import type { crearClienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export interface ComisionBreve { id: string; nombre: string; curso: string | null; nivel: string | null; estado: string }

interface FilaComision { id: string; nombre: string; estado: string; cursos: { nombre: string } | null; niveles: { nombre: string } | null }

const CAMPOS = "id, nombre, estado, cursos(nombre), niveles(nombre)";
const aBreve = (k: FilaComision): ComisionBreve => ({ id: k.id, nombre: k.nombre, curso: k.cursos?.nombre ?? null, nivel: k.niveles?.nombre ?? null, estado: k.estado });

/**
 * Comisiones con las que trabaja la sesión: las que dicta (asignación vigente)
 * o, si `todas`, las que no están canceladas ni finalizadas. La RLS vuelve a filtrar.
 */
export async function comisionesDeSesion(supabase: Cliente, sesion: Sesion, todas: boolean) {
  if (todas) {
    const r = await supabase.from("comisiones").select(CAMPOS).in("estado", ["borrador", "abierta", "en_curso"]).order("nombre").limit(200);
    return { comisiones: ((r.data ?? []) as unknown as FilaComision[]).map(aBreve), error: r.error };
  }
  const r = await supabase.from("comision_docentes").select(`comisiones(${CAMPOS})`)
    .eq("docente_persona_id", sesion.personaId).is("hasta", null);
  const comisiones = ((r.data ?? []) as unknown as { comisiones: FilaComision | null }[])
    .map((f) => f.comisiones).filter((k): k is FilaComision => Boolean(k) && k!.estado !== "cancelada")
    .map(aBreve).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { comisiones, error: r.error };
}

export const textoComision = (k: ComisionBreve) => [k.nombre, k.curso, k.nivel].filter(Boolean).join(" · ");
