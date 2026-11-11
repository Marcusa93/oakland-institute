"use server";

import { z } from "zod";
import { supabaseConfigurado } from "@/config/institucion";
import { mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface EstadoConsulta {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
}

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const esquema = z
  .object({
    tipo: z.enum(["consulta", "preinscripcion"]),
    nombre_contacto: z.string().trim().min(2, "Decinos tu nombre.").max(120),
    email: z.union([z.literal(""), z.email("Revisá el correo.")]),
    telefono: z.union([z.literal(""), z.string().trim().min(6, "Revisá el teléfono.").max(30)]),
    es_para_menor: z.boolean(),
    nombre_estudiante: z.string().trim().max(120),
    edad_estudiante: z.union([z.literal(""), z.coerce.number().int().min(3, "Edad entre 3 y 99.").max(99, "Edad entre 3 y 99.")]),
    curso_interes_id: z.union([z.literal(""), uuid]),
    mensaje: z.string().trim().max(2000),
    acepta: z.literal(true, "Necesitamos tu conformidad para poder responderte."),
  })
  .refine((d) => d.email || d.telefono, { path: ["telefono"], message: "Dejanos un teléfono o un correo para responderte." });

export async function enviarConsulta(_previo: EstadoConsulta, formData: FormData): Promise<EstadoConsulta> {
  // Campo trampa: las personas no lo ven; si viene completo es un bot.
  if (String(formData.get("sitio_web") ?? "")) return { ok: true, mensaje: "¡Gracias! Recibimos tu consulta." };

  const texto = (k: string) => String(formData.get(k) ?? "");
  const r = esquema.safeParse({
    tipo: texto("tipo") || "consulta",
    nombre_contacto: texto("nombre_contacto"),
    email: texto("email").trim(),
    telefono: texto("telefono").trim(),
    es_para_menor: formData.get("es_para_menor") === "on",
    nombre_estudiante: texto("nombre_estudiante"),
    edad_estudiante: texto("edad_estudiante").trim(),
    curso_interes_id: texto("curso_interes_id"),
    mensaje: texto("mensaje"),
    acepta: formData.get("acepta") === "on",
  });
  if (!r.success) {
    const errores: Record<string, string> = {};
    for (const i of r.error.issues) errores[String(i.path[0])] ??= i.message;
    return { ok: false, mensaje: "Revisá los datos marcados.", errores };
  }
  if (!supabaseConfigurado()) {
    return { ok: false, mensaje: "Sitio en modo demostración: el formulario todavía no está conectado. Tu consulta no se guardó." };
  }
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { data: version } = await supabase
    .from("versiones_consentimiento").select("id").eq("tipo", "contacto_web").order("version", { ascending: false }).limit(1).maybeSingle();
  // Sin `.select()`: un visitante puede insertar pero no leer consultas.
  const { error } = await supabase.from("consultas").insert({
    tipo: d.tipo,
    nombre_contacto: d.nombre_contacto,
    email: d.email || null,
    telefono: d.telefono || null,
    es_para_menor: d.es_para_menor,
    nombre_estudiante: d.nombre_estudiante || null,
    edad_estudiante: d.edad_estudiante === "" ? null : d.edad_estudiante,
    curso_interes_id: d.curso_interes_id || null,
    mensaje: d.mensaje || null,
    consentimiento_version_id: version?.id ?? null,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  return {
    ok: true,
    mensaje: d.tipo === "preinscripcion"
      ? "¡Gracias! Recibimos tu preinscripción. Todavía no reserva vacante: te vamos a contactar para confirmar los pasos."
      : "¡Gracias! Recibimos tu consulta y te vamos a responder a la brevedad.",
  };
}
