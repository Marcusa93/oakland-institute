"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { MENSAJE_NO_AUTORIZADO, nombrePersona, type Destinatario } from "./comun";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

/** Errores propios de la mensajería (mensajeDeError no los conoce todos). */
function errorDeMensajeria(error: { message?: string; code?: string } | null): string {
  const m = error?.message ?? "";
  if (/NO_AUTORIZADO|42501|permission denied|row-level security/i.test(m) || error?.code === "42501") return MENSAJE_NO_AUTORIZADO;
  if (/DESTINATARIOS_INVALIDOS/.test(m)) return "Elegí entre 1 y 10 destinatarios.";
  if (/hilos_asunto_check/.test(m)) return "El asunto debe tener entre 2 y 140 caracteres.";
  if (/mensajes_cuerpo_check/.test(m)) return "El mensaje no puede estar vacío ni superar los 4000 caracteres.";
  return mensajeDeError(error);
}

const esquemaNueva = z.object({
  estudiante: z.union([z.literal(""), uuid]),
  destinatarios: z.array(uuid).min(1, "Elegí al menos un destinatario.").max(10, "Podés elegir hasta 10 destinatarios."),
  asunto: z.string().trim().min(2, "Escribí un asunto (al menos 2 caracteres).").max(140, "El asunto es demasiado largo (máximo 140)."),
  cuerpo: z.string().trim().min(1, "Escribí el mensaje.").max(4000, "El mensaje es demasiado largo (máximo 4000 caracteres)."),
});

export async function iniciarConversacion(datos: z.input<typeof esquemaNueva>): Promise<Resultado & { id?: string }> {
  const sesion = await exigirPermiso("mensajes", "crear");
  const r = esquemaNueva.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revisá los datos del mensaje." };
  const d = r.data;
  const destinatarios = [...new Set(d.destinatarios)].filter((x) => x !== sesion.personaId);
  if (destinatarios.length === 0) return { ok: false, mensaje: "Elegí al menos un destinatario." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("iniciar_hilo", {
    p_destinatarios: destinatarios, p_asunto: d.asunto, p_cuerpo: d.cuerpo, p_estudiante: d.estudiante || null,
  });
  if (error || !data) return { ok: false, mensaje: errorDeMensajeria(error) };
  revalidatePath("/panel/mensajes");
  return { ok: true, mensaje: "Mensaje enviado.", id: String(data) };
}

const esquemaRespuesta = z.object({
  hilo: uuid,
  cuerpo: z.string().trim().min(1, "Escribí el mensaje.").max(4000, "El mensaje es demasiado largo (máximo 4000 caracteres)."),
});

export async function responderConversacion(datos: z.input<typeof esquemaRespuesta>): Promise<Resultado> {
  await exigirPermiso("mensajes", "ver");
  const r = esquemaRespuesta.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revisá el mensaje." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("responder_hilo", { p_hilo: r.data.hilo, p_cuerpo: r.data.cuerpo });
  if (error) {
    return { ok: false, mensaje: /NO_AUTORIZADO/.test(error.message ?? "") ? "Solo quienes participan de la conversación pueden responder." : errorDeMensajeria(error) };
  }
  revalidatePath(`/panel/mensajes/${r.data.hilo}`);
  revalidatePath("/panel/mensajes");
  return { ok: true, mensaje: "Enviado." };
}

const ROL: Record<string, string> = { docente: "Docente", administracion: "Administración", direccion: "Dirección" };

/** Buscador de personas para gestión (la RLS de personas ya le deja leer a todas). */
export async function buscarPersonas(q: string): Promise<Destinatario[]> {
  const sesion = await exigirPermiso("mensajes", "crear");
  if (!esGestion(sesion.perfiles)) return [];
  const palabras = String(q ?? "").normalize("NFC").replace(/[^\p{L}\p{N}'\s-]/gu, " ").split(/\s+/).filter((p) => p.length >= 2).slice(0, 4);
  if (palabras.length === 0) return [];

  const supabase = await crearClienteServidor();
  let consulta = supabase.from("personas").select("id, nombres, apellidos, nombre_preferido").is("eliminada_en", null);
  for (const p of palabras) consulta = consulta.or(`nombres.ilike.*${p}*,apellidos.ilike.*${p}*`);
  const { data } = await consulta.order("apellidos").limit(20);
  const personas = ((data ?? []) as { id: string; nombres: string; apellidos: string; nombre_preferido: string | null }[]).filter((p) => p.id !== sesion.personaId);
  if (personas.length === 0) return [];
  const ids = personas.map((p) => p.id);

  const [cuentasR, estudiantesR, vinculosR] = await Promise.all([
    supabase.from("cuentas").select("id, persona_id, estado").in("persona_id", ids),
    supabase.from("estudiantes").select("persona_id, legajo").in("persona_id", ids),
    supabase.from("vinculos_responsables").select("responsable_persona_id").in("responsable_persona_id", ids).eq("estado", "verificado"),
  ]);
  const cuentas = (cuentasR.data ?? []) as { id: string; persona_id: string; estado: string }[];
  const rolesR = cuentas.length
    ? await supabase.from("roles_asignados").select("cuenta_id, rol").in("cuenta_id", cuentas.map((c) => c.id)).is("revocado_en", null)
    : null;
  const roles = new Map<string, { activa: boolean; roles: string[] }>();
  for (const c of cuentas) {
    const propios = ((rolesR?.data ?? []) as { cuenta_id: string; rol: string }[]).filter((x) => x.cuenta_id === c.id).map((x) => ROL[x.rol] ?? x.rol);
    roles.set(c.persona_id, { activa: c.estado === "activa", roles: propios });
  }
  const legajos = new Map(((estudiantesR.data ?? []) as { persona_id: string; legajo: string }[]).map((e) => [e.persona_id, e.legajo]));
  const familias = new Set(((vinculosR.data ?? []) as { responsable_persona_id: string }[]).map((v) => v.responsable_persona_id));

  return personas.map((p) => {
    const cuenta = roles.get(p.id);
    const detalle = [
      ...(cuenta?.roles ?? []),
      legajos.has(p.id) ? `Estudiante ${legajos.get(p.id)}` : null,
      familias.has(p.id) ? "Familia" : null,
      !cuenta ? "sin cuenta: no va a ver el mensaje hasta que ingrese" : !cuenta.activa ? "cuenta suspendida" : null,
    ].filter(Boolean).join(" · ");
    return { id: p.id, nombre: nombrePersona(p) ?? "—", detalle };
  });
}
