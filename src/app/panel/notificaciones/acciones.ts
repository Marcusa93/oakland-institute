"use server";

import { z } from "zod";
import { enviarPendientes, pushConfigurado } from "@/lib/push";
import { exigirSesion, mensajeDeError } from "@/lib/sesion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  endpoint: z.string().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
});

export interface ResultadoPush { ok: boolean; mensaje: string }

/** Guarda el permiso de este teléfono para la persona que tiene la sesión abierta. */
export async function guardarSuscripcion(suscripcion: unknown, agente: string): Promise<ResultadoPush> {
  await exigirSesion();
  const r = esquema.safeParse(suscripcion);
  if (!r.success) return { ok: false, mensaje: "El navegador no devolvió una suscripción válida. Probá de nuevo." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_suscripcion_push", {
    p_endpoint: r.data.endpoint, p_p256dh: r.data.keys.p256dh, p_auth: r.data.keys.auth, p_agente: agente.slice(0, 300),
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  return { ok: true, mensaje: "Listo: vas a recibir las notificaciones en este dispositivo." };
}

export async function borrarSuscripcion(endpoint: string): Promise<void> {
  await exigirSesion();
  if (typeof endpoint !== "string" || endpoint.length > 1000) return;
  const supabase = await crearClienteServidor();
  // La RLS solo deja borrar las propias.
  await supabase.from("suscripciones_push").delete().eq("endpoint", endpoint);
}

/** Notificación de prueba a los teléfonos de quien la pide. */
export async function probarNotificacion(): Promise<ResultadoPush> {
  const sesion = await exigirSesion();
  if (!pushConfigurado()) return { ok: false, mensaje: "Las notificaciones no están configuradas en el servidor." };
  const admin = crearClienteAdmin();
  const { count } = await admin.from("suscripciones_push").select("id", { count: "exact", head: true }).eq("persona_id", sesion.personaId);
  if (!count) return { ok: false, mensaje: "Este dispositivo todavía no tiene las notificaciones activadas." };
  const { error } = await admin.from("notificaciones_push").insert({
    persona_id: sesion.personaId, titulo: "¡Funciona! 🎉", cuerpo: "Así te van a llegar los avisos, mensajes y actividades de Oakland.", url: "/panel", etiqueta: "prueba",
  });
  if (error) return { ok: false, mensaje: "No pudimos preparar la prueba. Probá de nuevo." };
  const r = await enviarPendientes(20);
  return r.enviadas > 0
    ? { ok: true, mensaje: `Enviada a ${count === 1 ? "tu dispositivo" : `tus ${count} dispositivos`}. Tiene que llegar en unos segundos.` }
    : { ok: false, mensaje: "No pudo salir ahora; se reintenta sola en un minuto." };
}

