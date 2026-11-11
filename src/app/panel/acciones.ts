"use server";

import { revalidatePath } from "next/cache";
import { exigirSesion, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface Resultado { ok: boolean; mensaje: string }

/** La persona invitada acepta o rechaza su vínculo. No otorga acceso: falta la verificación. */
export async function responderVinculo(formData: FormData): Promise<void> {
  await exigirSesion();
  const supabase = await crearClienteServidor();
  await supabase.rpc("responder_vinculo", {
    p_vinculo: String(formData.get("vinculo")),
    p_aceptar: formData.get("respuesta") === "aceptar",
  });
  revalidatePath("/panel");
}

export async function marcarLeida(formData: FormData): Promise<void> {
  await exigirSesion();
  const supabase = await crearClienteServidor();
  await supabase.rpc("marcar_leida", { p_envio: String(formData.get("envio")) });
  revalidatePath("/panel");
}

export async function ejecutar(fn: () => PromiseLike<{ error: { message?: string } | null }>, exito: string, rutas: string[]): Promise<Resultado> {
  const { error } = await fn();
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  for (const r of rutas) revalidatePath(r);
  return { ok: true, mensaje: exito };
}
