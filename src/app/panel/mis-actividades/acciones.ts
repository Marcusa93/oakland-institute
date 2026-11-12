"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorCampus } from "@/app/panel/actividades/errores";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

const esquema = z.object({
  actividad: uuid,
  // Opción múltiple: índice elegido. Abierta: texto (queda en `respuestas` por pregunta).
  respuestas: z.record(uuid, z.union([z.number().int().min(0).max(5), z.string().max(4000)])),
  texto: z.string().max(8000),
  audio: z.string().max(300).regex(/^entregas\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/).nullable().optional(),
  segundos: z.number().int().min(1).max(600).nullable().optional(),
});

export interface ResultadoEntrega { ok: boolean; mensaje: string; aciertos?: number | null; total?: number | null }

export async function entregarActividad(datos: unknown): Promise<ResultadoEntrega> {
  await exigirPermiso("actividades", "crear");
  const r = esquema.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Revisá tus respuestas: alguna es demasiado larga." };
  const respuestas = Object.fromEntries(Object.entries(r.data.respuestas).filter(([, v]) => typeof v === "number" || v.trim() !== ""));
  if (JSON.stringify(respuestas).length > 60_000) return { ok: false, mensaje: "Tus respuestas son demasiado largas." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("entregar_actividad", {
    p_actividad: r.data.actividad, p_respuestas: respuestas, p_texto: r.data.texto.trim() || null,
    p_audio: r.data.audio ?? null, p_audio_segundos: r.data.segundos ?? null,
  });
  if (error) return { ok: false, mensaje: errorCampus(error) };
  revalidatePath("/panel/mis-actividades");
  revalidatePath(`/panel/mis-actividades/${r.data.actividad}`);
  const res = (data ?? {}) as { aciertos?: number | string | null; total_objetivo?: number | string | null };
  return {
    ok: true, mensaje: "¡Entregada!",
    aciertos: res.aciertos === null || res.aciertos === undefined ? null : Number(res.aciertos),
    total: res.total_objetivo === null || res.total_objetivo === undefined ? null : Number(res.total_objetivo),
  };
}
