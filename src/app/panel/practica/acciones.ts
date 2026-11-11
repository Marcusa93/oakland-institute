"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { CLAVES_HABILIDAD, LARGO_LECCION, normalizarLeccion, type EjercicioLeccion, type ResultadoRespuesta } from "./comun";

const ALIAS = new RegExp("^[\\p{L}\\p{N} _.-]{3,20}$", "u");

type Respuesta<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

/** Errores propios de la práctica que `mensajeDeError` todavía no traduce. */
function traducir(error: { message?: string } | null): string {
  const m = error?.message ?? "";
  if (/NO_ENCONTRADO/.test(m)) return "Este ejercicio ya no está disponible. Seguí con el próximo.";
  if (/solo estudiantes/.test(m)) return "La práctica con puntos es para estudiantes con inscripción activa.";
  if (/alias_check/.test(m)) return "El alias debe tener entre 3 y 20 letras, números, espacios, puntos, guiones o guiones bajos.";
  if (/meta_semanal_check/.test(m)) return "La meta semanal tiene que estar entre 20 y 1000 XP.";
  return mensajeDeError(error);
}

export async function responderEjercicio(ejercicio: string, respuesta: string): Promise<Respuesta<ResultadoRespuesta>> {
  await exigirPermiso("practica", "crear");
  const r = z.object({ ejercicio: uuid, respuesta: z.string().trim().min(1).max(300) }).safeParse({ ejercicio, respuesta });
  if (!r.success) return { ok: false, mensaje: "Escribí o elegí una respuesta." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("responder_ejercicio", { p_ejercicio: r.data.ejercicio, p_respuesta: r.data.respuesta });
  if (error || !data) return { ok: false, mensaje: traducir(error) };
  // Sin revalidatePath: la lección no se vuelve a pedir en cada respuesta; el tablero es dinámico.
  return { ok: true, datos: data as ResultadoRespuesta };
}

export async function cargarLeccion(habilidad: string): Promise<Respuesta<EjercicioLeccion[]>> {
  await exigirPermiso("practica", "crear");
  const r = z.enum(CLAVES_HABILIDAD).safeParse(habilidad);
  if (!r.success) return { ok: false, mensaje: "Esa habilidad no existe." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("siguiente_leccion", { p_habilidad: r.data, p_cantidad: LARGO_LECCION });
  if (error) return { ok: false, mensaje: traducir(error) };
  return { ok: true, datos: normalizarLeccion(data) };
}

export async function configurarPractica(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("practica", "crear");
  const r = z.object({
    alias: z.union([z.literal(""), z.string().trim().regex(ALIAS)]),
    mostrar: z.boolean(),
    meta: z.coerce.number().int().min(20).max(1000),
  }).safeParse({
    alias: String(formData.get("alias") ?? "").trim(),
    mostrar: formData.get("mostrar") === "on",
    meta: formData.get("meta"),
  });
  if (!r.success) {
    const campo = r.error.issues[0]?.path[0];
    return { ok: false, mensaje: campo === "alias"
      ? "El alias debe tener entre 3 y 20 caracteres: letras, números, espacios, puntos o guiones."
      : "La meta semanal tiene que estar entre 20 y 1000 XP." };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("configurar_practica", { p_alias: r.data.alias, p_mostrar: r.data.mostrar, p_meta: r.data.meta });
  if (error) return { ok: false, mensaje: traducir(error) };
  revalidatePath("/panel/practica");
  return { ok: true, mensaje: "Listo, guardamos tus ajustes." };
}
