"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { errorCampus } from "./errores";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

const pregunta = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("opcion"),
    enunciado: z.string().trim().min(1).max(500),
    opciones: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    correcta: z.number().int().min(0),
  }).refine((p) => p.correcta < p.opciones.length, { message: "correcta" }),
  z.object({ tipo: z.literal("texto"), enunciado: z.string().trim().min(1).max(500) }),
]);

const esquemaActividad = z.object({
  comision: uuid,
  titulo: z.string().trim().min(3).max(160),
  consigna: z.string().trim().min(1).max(4000),
  habilidad: z.enum(["vocabulario", "lectura", "gramatica", "escucha", "escritura", "habla"]),
  evaluacion: z.enum(["practica", "formativa", "acreditante"]),
  puntaje_max: z.coerce.number().positive().max(100),
  // datetime-local en hora de Tucumán: "2027-03-10T18:00"
  cierra_en: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),
  publicar: z.boolean(),
  preguntas: z.array(pregunta).max(30),
});

export async function crearActividad(datos: unknown): Promise<Resultado & { id?: string }> {
  const sesion = await exigirPermiso("actividades", "aprobar");
  const r = esquemaActividad.safeParse(datos);
  if (!r.success) {
    const campo = r.error.issues[0]?.path[0];
    const mensajes: Record<string, string> = {
      comision: "Elegí la comisión.",
      titulo: "El título tiene que tener entre 3 y 160 caracteres.",
      consigna: "Escribí la consigna.",
      puntaje_max: "El puntaje máximo tiene que ser mayor a 0 (hasta 100).",
      cierra_en: "Revisá la fecha de cierre.",
      preguntas: "Revisá las preguntas: cada una necesita enunciado; las de opción, al menos 2 opciones y la correcta marcada.",
    };
    return { ok: false, mensaje: mensajes[String(campo)] ?? "Revisá los datos de la actividad." };
  }
  const d = r.data;
  const cierra = d.cierra_en ? `${d.cierra_en}:00-03:00` : null;
  if (cierra && new Date(cierra).getTime() <= Date.now() + 5 * 60_000) {
    return { ok: false, mensaje: "La fecha de cierre tiene que ser posterior a este momento." };
  }
  if (d.publicar && d.preguntas.length === 0 && d.habilidad !== "escritura" && d.habilidad !== "habla") {
    return { ok: false, mensaje: "Agregá al menos una pregunta antes de publicar (o elegí escritura/habla para una consigna libre)." };
  }

  const supabase = await crearClienteServidor();
  // Se crea siempre como borrador: nadie ve la actividad hasta que tiene preguntas y clave.
  const alta = await supabase.from("actividades").insert({
    comision_id: d.comision, autor_cuenta_id: sesion.cuentaId, titulo: d.titulo, consigna: d.consigna,
    habilidad: d.habilidad, evaluacion: d.evaluacion, puntaje_max: d.puntaje_max, cierra_en: cierra, estado: "borrador",
  }).select("id").single();
  if (alta.error) return { ok: false, mensaje: errorCampus(alta.error) };
  const id = alta.data.id as string;

  const deshacer = async (error: { message?: string }) => {
    await supabase.from("actividades").delete().eq("id", id); // borra preguntas y claves en cascada
    return { ok: false, mensaje: errorCampus(error) };
  };

  if (d.preguntas.length) {
    const preguntas = await supabase.from("actividad_preguntas").insert(d.preguntas.map((p, i) => ({
      actividad_id: id, orden: i + 1, enunciado: p.enunciado, tipo: p.tipo,
      opciones: p.tipo === "opcion" ? p.opciones : [], puntaje: 1,
    }))).select("id, orden");
    if (preguntas.error) return deshacer(preguntas.error);
    // La clave va en su propia tabla: los estudiantes no tienen acceso a ella.
    const porOrden = new Map((preguntas.data as { id: string; orden: number }[]).map((p) => [p.orden, p.id]));
    const claves = d.preguntas.flatMap((p, i) => p.tipo === "opcion" ? [{ pregunta_id: porOrden.get(i + 1)!, correcta: p.correcta }] : []);
    if (claves.length) {
      const k = await supabase.from("actividad_claves").insert(claves);
      if (k.error) return deshacer(k.error);
    }
  }
  if (d.publicar) {
    const pub = await supabase.from("actividades").update({ estado: "publicada" }).eq("id", id);
    if (pub.error) {
      revalidatePath("/panel/actividades");
      return { ok: false, mensaje: `${errorCampus(pub.error)} La actividad quedó guardada como borrador.`, id };
    }
  }
  revalidatePath("/panel/actividades");
  revalidatePath("/panel/mis-actividades");
  return { ok: true, mensaje: d.publicar ? "Actividad publicada: ya la ven tus estudiantes." : "Borrador guardado.", id };
}

const esquemaEstado = z.object({ id: uuid, estado: z.enum(["publicada", "cerrada"]) });

export async function cambiarEstadoActividad(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("actividades", "aprobar");
  const r = esquemaEstado.safeParse({ id: formData.get("id"), estado: formData.get("estado") });
  if (!r.success) return { ok: false, mensaje: "No encontramos esa actividad." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("actividades").update({ estado: r.data.estado }).eq("id", r.data.id).select("id");
  if (error) return { ok: false, mensaje: errorCampus(error) };
  if (!data?.length) return { ok: false, mensaje: "No tenés permiso para cambiar esta actividad." };
  revalidatePath("/panel/actividades");
  revalidatePath(`/panel/actividades/${r.data.id}`);
  revalidatePath("/panel/mis-actividades");
  return { ok: true, mensaje: r.data.estado === "publicada" ? "Actividad publicada." : "Entregas cerradas." };
}

export async function eliminarBorrador(formData: FormData): Promise<void> {
  await exigirPermiso("actividades", "aprobar");
  const r = uuid.safeParse(formData.get("id"));
  if (!r.success) return;
  const supabase = await crearClienteServidor();
  await supabase.from("actividades").delete().eq("id", r.data).eq("estado", "borrador");
  revalidatePath("/panel/actividades");
  redirect("/panel/actividades");
}

const esquemaCorreccion = z.object({
  entrega: uuid,
  actividad: uuid,
  nota: z.union([z.literal(""), z.coerce.number().min(0).max(999)]),
  devolucion: z.string().trim().max(2000),
  reaccion: z.union([z.literal(""), z.enum(["excelente", "muy_bien", "bien", "a_mejorar"])]),
  publicar: z.boolean(),
  audio: z.union([z.literal(""), z.string().max(300).regex(/^devoluciones\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/)]),
  quitarAudio: z.boolean(),
});

export async function corregirEntrega(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("actividades", "aprobar");
  const t = (k: string) => String(formData.get(k) ?? "").replace(",", ".");
  const r = esquemaCorreccion.safeParse({
    entrega: t("entrega"), actividad: t("actividad"), nota: t("nota").trim(), devolucion: String(formData.get("devolucion") ?? ""),
    reaccion: t("reaccion"), publicar: formData.get("publicar") === "si",
    audio: String(formData.get("audio") ?? ""), quitarAudio: formData.get("quitar_audio") === "si",
  });
  if (!r.success) return { ok: false, mensaje: "Revisá la nota: tiene que ser un número (por ejemplo 7 o 7,5)." };
  const d = r.data;
  if (d.publicar && d.nota === "" && !d.reaccion && !d.devolucion && !d.audio) {
    return { ok: false, mensaje: "Para publicar, poné una nota, una reacción o una devolución (escrita o hablada)." };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("corregir_entrega", {
    p_entrega: d.entrega, p_nota: d.nota === "" ? null : d.nota, p_devolucion: d.devolucion || null,
    p_reaccion: d.reaccion || null, p_publicar: d.publicar,
    p_audio: d.audio || null, p_quitar_audio: d.quitarAudio,
  });
  if (error) return { ok: false, mensaje: errorCampus(error) };
  revalidatePath(`/panel/actividades/${d.actividad}`);
  revalidatePath("/panel/actividades");
  revalidatePath("/panel/alertas");
  return { ok: true, mensaje: d.publicar ? "Corrección publicada: el estudiante ya la ve." : "Corrección guardada sin publicar." };
}

interface EntregaCorregida { id: string; nota: number | null; devolucion: string | null; reaccion: string | null }

export async function publicarCorregidas(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("actividades", "aprobar");
  const r = uuid.safeParse(formData.get("actividad"));
  if (!r.success) return { ok: false, mensaje: "No encontramos esa actividad." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("entregas").select("id, nota, devolucion, reaccion")
    .eq("actividad_id", r.data).eq("estado", "corregida").eq("publicada", false);
  if (error) return { ok: false, mensaje: errorCampus(error) };
  const pendientes = (data ?? []) as EntregaCorregida[];
  if (!pendientes.length) return { ok: true, mensaje: "No hay correcciones sin publicar." };
  // Sin permiso de UPDATE directo sobre entregas: se publica por la función, una por una.
  let fallidas = 0;
  for (const e of pendientes) {
    const p = await supabase.rpc("corregir_entrega", {
      p_entrega: e.id, p_nota: e.nota, p_devolucion: e.devolucion, p_reaccion: e.reaccion, p_publicar: true,
    });
    if (p.error) fallidas++;
  }
  revalidatePath(`/panel/actividades/${r.data}`);
  revalidatePath("/panel/actividades");
  const ok = pendientes.length - fallidas;
  if (fallidas) return { ok: false, mensaje: `Publicamos ${ok} de ${pendientes.length}. Probá de nuevo con las que faltan.` };
  return { ok: true, mensaje: `Publicamos ${ok} ${ok === 1 ? "corrección" : "correcciones"}.` };
}
