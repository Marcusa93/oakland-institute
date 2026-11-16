"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { texto, traducir, uuid } from "../estudiantes/comun";

const RUTA = "/panel/personal";
const fallo = (mensaje: string): Resultado => ({ ok: false, mensaje });
const ROLES = ["docente", "administracion", "direccion"] as const;
const ETIQUETA: Record<(typeof ROLES)[number], string> = { docente: "Docente", administracion: "Secretaría y administración", direccion: "Dirección" };

const esquemaAlta = z.object({
  nombres: z.string().trim().min(1).max(80),
  apellidos: z.string().trim().min(1).max(80),
  email: z.email().max(120),
  telefono: z.string().trim().max(40),
  rol: z.enum(ROLES),
});

/**
 * Suma a una persona al equipo: la busca por email; si no existe la crea,
 * le envía la invitación para que elija su contraseña y le da el rol.
 * Si la persona ya tiene cuenta (por ejemplo, una madre que además es
 * docente), solo se le agrega el rol.
 */
export async function sumarAlEquipo(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("roles_y_configuracion", "crear"); // primero el permiso; recién después se usa la clave secreta
  const r = esquemaAlta.safeParse({
    nombres: texto(formData, "nombres"), apellidos: texto(formData, "apellidos"),
    email: texto(formData, "email").toLowerCase(), telefono: texto(formData, "telefono"), rol: texto(formData, "rol"),
  });
  if (!r.success) return fallo("Completá nombres, apellidos, un email válido y el rol.");
  const d = r.data;
  const supabase = await crearClienteServidor();

  // ¿Ya existe la persona?
  const { data: existentes, error: errBusqueda } = await supabase.from("personas_datos")
    .select("persona_id, personas!inner(nombres, apellidos, eliminada_en)").ilike("email", d.email).is("personas.eliminada_en", null).limit(2);
  if (errBusqueda) return fallo(traducir(errBusqueda));
  if ((existentes ?? []).length > 1) return fallo("Hay más de una persona con ese email. Revisalo en Estudiantes antes de seguir.");
  let personaId = (existentes?.[0]?.persona_id as string | undefined) ?? null;

  if (personaId) {
    const { data: cuenta } = await supabase.from("cuentas").select("id").eq("persona_id", personaId).maybeSingle();
    if (cuenta?.id) {
      const { error } = await supabase.rpc("otorgar_rol", { p_cuenta: cuenta.id, p_rol: d.rol });
      if (error) return fallo(traducir(error));
      revalidatePath(RUTA);
      return { ok: true, mensaje: `Esa persona ya tenía cuenta: ahora también tiene el rol ${ETIQUETA[d.rol]}.` };
    }
  }

  const sitio = process.env.NEXT_PUBLIC_SITIO_URL;
  if (!sitio) return fallo("Falta configurar la dirección del sitio en el servidor (NEXT_PUBLIC_SITIO_URL).");
  let admin: ReturnType<typeof crearClienteAdmin>;
  try {
    admin = crearClienteAdmin();
  } catch {
    return fallo("No se pueden enviar invitaciones: falta la clave secreta en el servidor (SUPABASE_SECRET_KEY).");
  }

  let personaNueva = false;
  if (!personaId) {
    const persona = await supabase.from("personas").insert({ nombres: d.nombres, apellidos: d.apellidos }).select("id").single();
    if (persona.error || !persona.data) return fallo(`No se cargó nada. ${traducir(persona.error)}`);
    personaId = persona.data.id as string;
    personaNueva = true;
    const datos = await supabase.from("personas_datos").insert({ persona_id: personaId, email: d.email, telefono: d.telefono || null });
    if (datos.error) {
      await supabase.from("personas").update({ eliminada_en: new Date().toISOString() }).eq("id", personaId);
      return fallo(`No se cargó nada. ${traducir(datos.error)}`);
    }
  }

  const deshacer = async () => {
    if (personaNueva) await supabase.from("personas").update({ eliminada_en: new Date().toISOString() }).eq("id", personaId!);
  };

  const invitacion = await admin.auth.admin.inviteUserByEmail(d.email, { redirectTo: `${sitio}/auth/bienvenida` });
  if (invitacion.error || !invitacion.data?.user) {
    await deshacer();
    const m = invitacion.error?.message ?? "";
    if (/already|registered|exists/i.test(m)) return fallo("Ya existe un usuario con ese email, pero no está asociado a ninguna persona. Avisá a quien administra el sistema.");
    if (/rate limit/i.test(m)) return fallo("Se enviaron demasiados correos seguidos. Esperá unos minutos y probá de nuevo (con el correo propio del instituto este límite desaparece).");
    return fallo("No pudimos enviar la invitación. Revisá el email y probá de nuevo.");
  }
  const usuarioId = invitacion.data.user.id;
  const alta = await admin.from("cuentas").insert({ id: usuarioId, persona_id: personaId });
  if (alta.error) {
    await admin.auth.admin.deleteUser(usuarioId);
    await deshacer();
    return fallo("No pudimos asociar la cuenta a la persona, así que anulamos la invitación. Probá de nuevo.");
  }
  // El rol lo otorga dirección con su propia sesión (la base registra quién lo dio).
  const { error } = await supabase.rpc("otorgar_rol", { p_cuenta: usuarioId, p_rol: d.rol });
  revalidatePath(RUTA);
  if (error) return fallo(`Se envió la invitación a ${d.email}, pero no pudimos darle el rol: agregalo desde la lista. ${traducir(error)}`);
  return { ok: true, mensaje: `Listo: invitación enviada a ${d.email} con el rol ${ETIQUETA[d.rol]}. Tiene que abrir el correo y elegir su contraseña.` };
}

const esquemaRol = z.object({ cuenta: uuid, rol: z.enum(ROLES) });

export async function agregarRol(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("roles_y_configuracion", "editar");
  const r = esquemaRol.safeParse({ cuenta: texto(formData, "cuenta"), rol: texto(formData, "rol") });
  if (!r.success) return fallo("Elegí el rol.");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("otorgar_rol", { p_cuenta: r.data.cuenta, p_rol: r.data.rol });
  if (error) return fallo(traducir(error));
  revalidatePath(RUTA);
  return { ok: true, mensaje: `Rol ${ETIQUETA[r.data.rol]} agregado.` };
}

export async function quitarRol(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("roles_y_configuracion", "editar");
  const r = esquemaRol.safeParse({ cuenta: texto(formData, "cuenta"), rol: texto(formData, "rol") });
  if (!r.success) return fallo("No pudimos identificar el rol. Actualizá la página.");
  if (r.data.cuenta === sesion.cuentaId && r.data.rol === "direccion") return fallo("No podés quitarte a vos el rol de dirección. Pedíselo a otra cuenta de dirección.");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("revocar_rol", { p_cuenta: r.data.cuenta, p_rol: r.data.rol });
  if (error) return fallo(traducir(error));
  revalidatePath(RUTA);
  return { ok: true, mensaje: `Rol ${ETIQUETA[r.data.rol]} quitado. Deja de ver esas secciones desde su próximo ingreso o al actualizar la página.` };
}

const esquemaEnlace = z.object({ persona: uuid });

/** Envía un enlace para elegir (o recuperar) la contraseña. Sirve si la invitación venció. */
export async function enviarEnlace(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("roles_y_configuracion", "editar");
  const r = esquemaEnlace.safeParse({ persona: texto(formData, "persona") });
  if (!r.success) return fallo("No pudimos identificar a la persona.");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("personas_datos").select("email").eq("persona_id", r.data.persona).maybeSingle();
  const email = data?.email as string | undefined;
  if (!email) return fallo("La persona no tiene email cargado.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITIO_URL ?? ""}/auth/confirm?next=/auth/clave`,
  });
  if (error) {
    if (/rate limit|security purposes/i.test(error.message)) return fallo("Se enviaron demasiados correos seguidos. Esperá unos minutos y probá de nuevo.");
    return fallo("No pudimos enviar el correo. Probá de nuevo en unos minutos.");
  }
  return { ok: true, mensaje: `Enviamos a ${email} un enlace para elegir la contraseña.` };
}
