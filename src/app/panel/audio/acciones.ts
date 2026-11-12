"use server";

import { z } from "zod";
import { errorCampus } from "@/app/panel/actividades/errores";
import { exigirSesion } from "@/lib/sesion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  tipo: z.enum(["entrega", "devolucion"]),
  id: z.string().regex(/^[0-9a-f-]{36}$/i),
  extension: z.enum(["webm", "ogg", "m4a", "mp4", "mp3", "wav", "aac"]),
});

export type SubidaAudio = { ok: true; url: string; ruta: string } | { ok: false; mensaje: string };

/**
 * Prepara la subida de una grabación. La base decide la ruta y valida que
 * quien pide pueda subirla (estudiante que cursa y en plazo, o docente de la
 * comisión). Recién entonces se firma una subida para esa ruta exacta: el
 * archivo va directo del navegador al almacenamiento, sin pasar por acá.
 */
export async function prepararSubidaAudio(datos: unknown): Promise<SubidaAudio> {
  await exigirSesion();
  const r = esquema.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Ese formato de audio no es compatible." };
  const supabase = await crearClienteServidor();
  const { data: ruta, error } = r.data.tipo === "entrega"
    ? await supabase.rpc("ruta_audio_entrega", { p_actividad: r.data.id, p_extension: r.data.extension })
    : await supabase.rpc("ruta_audio_devolucion", { p_entrega: r.data.id, p_extension: r.data.extension });
  if (error || typeof ruta !== "string") return { ok: false, mensaje: errorCampus(error) };

  const firmada = await crearClienteAdmin().storage.from("audios").createSignedUploadUrl(ruta);
  if (firmada.error || !firmada.data) return { ok: false, mensaje: "No pudimos preparar la subida. Probá de nuevo en un momento." };
  return { ok: true, url: firmada.data.signedUrl, ruta };
}
