"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ejecutar, type Resultado } from "@/app/panel/acciones";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { PLANTILLAS_CONSULTA } from "@/lib/whatsapp";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const RUTAS = ["/panel/consultas", "/panel"];

/** Mediodía de Tucumán: la fecha elegida no se corre al convertir a UTC. */
const mediodia = (iso: string) => `${iso}T12:00:00-03:00`;
function enDias(n: number) {
  const d = new Date(`${hoyISO()}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return hoyISO(d);
}

const esquema = z.object({
  id: uuid,
  estado: z.enum(["nueva", "contactada", "nivelacion", "solicitud", "ganada", "perdida"]),
  proxima_accion: z.string().trim().max(200),
  proxima_accion_en: z.union([z.literal(""), z.iso.date()]),
  motivo_perdida: z.string().trim().max(200),
  nota: z.string().trim().max(1000),
  tomar: z.boolean(),
});

export async function actualizarConsulta(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("consultas", "editar");
  const t = (k: string) => String(formData.get(k) ?? "");
  const r = esquema.safeParse({
    id: t("id"), estado: t("estado"), proxima_accion: t("proxima_accion"), proxima_accion_en: t("proxima_accion_en"),
    motivo_perdida: t("motivo_perdida"), nota: t("nota"), tomar: formData.get("tomar") === "on",
  });
  if (!r.success) return { ok: false, mensaje: "Revisá los datos del seguimiento." };
  const d = r.data;
  if (d.estado === "perdida" && !d.motivo_perdida) return { ok: false, mensaje: "Indicá por qué se perdió la consulta." };

  const supabase = await crearClienteServidor();
  return ejecutar(async () => {
    const cambio = await supabase.from("consultas").update({
      estado: d.estado,
      proxima_accion: d.proxima_accion || null,
      proxima_accion_en: d.proxima_accion_en ? mediodia(d.proxima_accion_en) : null,
      motivo_perdida: d.estado === "perdida" ? d.motivo_perdida : null,
      ...(d.tomar ? { responsable_cuenta_id: sesion.cuentaId } : {}),
    }).eq("id", d.id);
    if (cambio.error || !d.nota) return cambio;
    return supabase.from("consulta_eventos").insert({ consulta_id: d.id, autor_cuenta_id: sesion.cuentaId, tipo: "nota", nota: d.nota });
  }, "Seguimiento guardado.", RUTAS);
}

const MEDIOS = { whatsapp: "WhatsApp", llamada: "Llamada", email: "Correo" } as const;
const esquemaContacto = z.object({
  id: uuid,
  medio: z.enum(["whatsapp", "llamada", "email"]),
  plantilla: z.enum(Object.keys(PLANTILLAS_CONSULTA) as [keyof typeof PLANTILLAS_CONSULTA]).optional(),
});

/**
 * Se llama al tocar WhatsApp, llamar o escribir: deja el contacto en el
 * historial y, si estaba sin tocar, la pasa a «Contactada», la toma quien
 * escribió y agenda volver a mirarla en 2 días.
 */
export async function registrarContacto(datos: { id: string; medio: string; plantilla?: string }): Promise<void> {
  const sesion = await exigirPermiso("consultas", "editar");
  const r = esquemaContacto.safeParse(datos);
  if (!r.success) return;
  const { id, medio, plantilla } = r.data;
  const supabase = await crearClienteServidor();
  const { data: c } = await supabase.from("consultas").select("estado, responsable_cuenta_id, proxima_accion_en").eq("id", id).maybeSingle();
  if (!c) return;
  await supabase.from("consulta_eventos").insert({
    consulta_id: id, autor_cuenta_id: sesion.cuentaId, tipo: "contacto",
    nota: `${MEDIOS[medio]}${plantilla ? `: ${PLANTILLAS_CONSULTA[plantilla].toLowerCase()}` : ""}`,
  });
  const vencida = !c.proxima_accion_en || c.proxima_accion_en.slice(0, 10) <= hoyISO();
  const cambios = {
    ...(c.estado === "nueva" ? { estado: "contactada" } : {}),
    ...(!c.responsable_cuenta_id ? { responsable_cuenta_id: sesion.cuentaId } : {}),
    ...(vencida ? { proxima_accion: "Ver si respondió", proxima_accion_en: mediodia(enDias(2)) } : {}),
  };
  if (Object.keys(cambios).length) await supabase.from("consultas").update(cambios).eq("id", id);
  for (const ruta of RUTAS) revalidatePath(ruta);
}

const esquemaNueva = z.object({
  nombre_contacto: z.string().trim().min(2).max(120),
  telefono: z.string().trim().max(30),
  email: z.union([z.literal(""), z.email().max(160)]),
  origen: z.enum(["whatsapp", "telefono", "presencial", "referido", "redes", "otro"]),
  curso_interes_id: z.union([z.literal(""), uuid]),
  es_para_menor: z.boolean(),
  nombre_estudiante: z.string().trim().max(120),
  edad_estudiante: z.union([z.literal(""), z.coerce.number().int().min(3).max(99)]),
  mensaje: z.string().trim().max(2000),
  proxima_accion: z.string().trim().max(200),
  proxima_accion_en: z.union([z.literal(""), z.iso.date()]),
});

/** Consulta que entra por WhatsApp, teléfono o en el mostrador: la carga secretaría. */
export async function cargarConsulta(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("consultas", "crear");
  const t = (k: string) => String(formData.get(k) ?? "");
  const r = esquemaNueva.safeParse({
    nombre_contacto: t("nombre_contacto"), telefono: t("telefono"), email: t("email"), origen: t("origen"),
    curso_interes_id: t("curso_interes_id"), es_para_menor: formData.get("es_para_menor") === "on",
    nombre_estudiante: t("nombre_estudiante"), edad_estudiante: t("edad_estudiante"), mensaje: t("mensaje"),
    proxima_accion: t("proxima_accion"), proxima_accion_en: t("proxima_accion_en"),
  });
  if (!r.success) {
    const campo = r.error.issues[0]?.path[0];
    if (campo === "nombre_contacto") return { ok: false, mensaje: "Escribí el nombre de quien consulta." };
    if (campo === "email") return { ok: false, mensaje: "El correo no parece válido." };
    if (campo === "edad_estudiante") return { ok: false, mensaje: "La edad tiene que estar entre 3 y 99 años." };
    return { ok: false, mensaje: "Revisá los datos de la consulta." };
  }
  const d = r.data;
  if (!d.telefono && !d.email) return { ok: false, mensaje: "Hace falta un teléfono o un correo para poder responder." };
  if (d.telefono && d.telefono.replace(/\D/g, "").length < 6) return { ok: false, mensaje: "El teléfono es demasiado corto." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("consultas").insert({
    nombre_contacto: d.nombre_contacto,
    telefono: d.telefono || null,
    email: d.email || null,
    origen: d.origen,
    curso_interes_id: d.curso_interes_id || null,
    es_para_menor: d.es_para_menor,
    nombre_estudiante: d.es_para_menor ? d.nombre_estudiante || null : null,
    edad_estudiante: d.edad_estudiante === "" ? null : d.edad_estudiante,
    mensaje: d.mensaje || null,
    // Ya hubo una conversación: entra contactada y a cargo de quien la cargó.
    estado: "contactada",
    responsable_cuenta_id: sesion.cuentaId,
    proxima_accion: d.proxima_accion || "Volver a escribir",
    proxima_accion_en: mediodia(d.proxima_accion_en || enDias(2)),
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  for (const ruta of RUTAS) revalidatePath(ruta);
  return { ok: true, mensaje: "Consulta cargada. Quedó a tu cargo, en «Para hoy» del día que elegiste." };
}
