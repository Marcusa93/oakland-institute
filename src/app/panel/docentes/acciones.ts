"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { CRITERIOS } from "./criterios";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const puntaje = z.number().int().min(1).max(5);

const esquema = z.object({
  docente: uuid,
  periodo: z.string().trim().min(2, "Indicá el período (por ejemplo, «2026 · 2.º cuatrimestre»).").max(60, "El período es demasiado largo."),
  puntajes: z.object(Object.fromEntries(CRITERIOS.map((c) => [c.clave, puntaje])) as Record<(typeof CRITERIOS)[number]["clave"], typeof puntaje>),
  fortalezas: z.string().trim().max(2000, "Las fortalezas superan los 2000 caracteres."),
  a_mejorar: z.string().trim().max(2000, "Lo que hay que mejorar supera los 2000 caracteres."),
  compartida: z.boolean(),
});

/** Solo dirección (la política de la base también lo exige). */
export async function crearEvaluacion(datos: z.input<typeof esquema>): Promise<Resultado> {
  const sesion = await exigirPermiso("evaluacion_docente", "crear");
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const m = r.error.issues[0];
    return { ok: false, mensaje: m?.path[0] === "puntajes" ? "Puntuá todos los criterios del 1 al 5." : m?.message ?? "Revisá los datos de la evaluación." };
  }
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("evaluaciones_docentes").insert({
    docente_persona_id: d.docente,
    evaluador_cuenta_id: sesion.cuentaId,
    periodo: d.periodo,
    puntajes: d.puntajes,
    fortalezas: d.fortalezas || null,
    a_mejorar: d.a_mejorar || null,
    compartida: d.compartida,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  revalidatePath(`/panel/docentes/${d.docente}`);
  revalidatePath("/panel/docentes");
  return { ok: true, mensaje: d.compartida ? "Evaluación guardada y compartida con el docente." : "Evaluación guardada (solo la ve dirección)." };
}

export async function cambiarCompartida(datos: { id: string; docente: string; compartida: boolean }): Promise<Resultado> {
  await exigirPermiso("evaluacion_docente", "editar");
  const r = z.object({ id: uuid, docente: uuid, compartida: z.boolean() }).safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "No pudimos identificar la evaluación." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("evaluaciones_docentes").update({ compartida: r.data.compartida }).eq("id", r.data.id).select("id");
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  if (!data?.length) return { ok: false, mensaje: "No tenés permiso para cambiar esta evaluación." };
  revalidatePath(`/panel/docentes/${r.data.docente}`);
  return { ok: true, mensaje: r.data.compartida ? "Ahora el docente puede verla." : "Dejó de estar visible para el docente." };
}
