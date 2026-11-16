"use server";

import { z } from "zod";
import { ejecutar, type Resultado } from "@/app/panel/acciones";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { diaISO, enVigencia, hora } from "./util";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const horaOpcional = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]);

const esquemaAbrir = z.object({
  comision: uuid, hora_inicio: horaOpcional, hora_fin: horaOpcional,
  fecha: z.union([z.literal(""), z.iso.date()]).optional(),
});

export interface ClaseAbierta extends Resultado { claseId?: string }

/**
 * Crea la clase de hoy o de un día anterior (o devuelve la que ya existe
 * para ese horario). La base decide si la cuenta puede: docente vigente de
 * la comisión o gestión.
 */
export async function abrirClase(datos: unknown): Promise<ClaseAbierta> {
  const sesion = await exigirPermiso("asistencia", "crear");
  const r = esquemaAbrir.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Revisá la fecha y las horas de la clase (formato 18:30)." };
  const d = r.data;
  const supabase = await crearClienteServidor();
  const fechaClase = await validarFecha(supabase, d.comision, d.fecha || hoyISO());
  if (typeof fechaClase !== "string") return fechaClase;
  const hoy = fechaClase;

  const [horarios, existentes] = await Promise.all([
    supabase.from("comision_horarios").select("hora_inicio, hora_fin, aula_id, vigencia")
      .eq("comision_id", d.comision).eq("dia_semana", diaISO(hoy)).order("hora_inicio"),
    supabase.from("clases").select("id, hora_inicio").eq("comision_id", d.comision).eq("fecha", hoy),
  ]);
  if (horarios.error || existentes.error) return { ok: false, mensaje: mensajeDeError(horarios.error ?? existentes.error) };
  const abiertas = (existentes.data ?? []) as { id: string; hora_inicio: string }[];
  const deHoy = ((horarios.data ?? []) as { hora_inicio: string; hora_fin: string; aula_id: string | null; vigencia: string | null }[])
    .filter((h) => enVigencia(h.vigencia, hoy));

  let inicio = d.hora_inicio, fin = d.hora_fin, aula: string | null = null;
  if (!inicio || !fin) {
    // Sin horas a mano: se toman del horario de hoy (el primero que todavía no tenga clase).
    const h = deHoy.find((x) => !abiertas.some((c) => hora(c.hora_inicio) === hora(x.hora_inicio))) ?? deHoy[0];
    if (!h) return { ok: false, mensaje: "Ese día la comisión no tiene horario cargado: indicá la hora de inicio y de fin." };
    inicio = hora(h.hora_inicio); fin = hora(h.hora_fin); aula = h.aula_id;
  } else {
    if (fin <= inicio) return { ok: false, mensaje: "La hora de fin tiene que ser posterior a la de inicio." };
    aula = deHoy.find((x) => hora(x.hora_inicio) === inicio)?.aula_id ?? null;
  }

  const ya = abiertas.find((c) => hora(c.hora_inicio) === inicio);
  if (ya) return { ok: true, mensaje: "La clase ya estaba abierta.", claseId: ya.id };

  const alta = await supabase.from("clases").insert({
    comision_id: d.comision, fecha: hoy, hora_inicio: inicio, hora_fin: fin, aula_id: aula,
    docente_persona_id: sesion.perfiles.includes("docente") ? sesion.personaId : null,
  }).select("id").single();
  if (alta.error) {
    if (alta.error.code === "23505") {
      // Otra pestaña u otro docente la abrió recién: vamos a esa.
      const otra = await supabase.from("clases").select("id")
        .eq("comision_id", d.comision).eq("fecha", hoy).eq("hora_inicio", inicio).maybeSingle();
      if (otra.data?.id) return { ok: true, mensaje: "La clase ya estaba abierta.", claseId: otra.data.id as string };
    }
    return { ok: false, mensaje: mensajeDeError(alta.error) };
  }
  return { ok: true, mensaje: "Clase abierta.", claseId: alta.data.id as string };
}

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/** La clase tiene que ser de hoy o anterior; las de días anteriores, dentro del período de la comisión. */
async function validarFecha(supabase: Cliente, comision: string, fecha: string): Promise<string | ClaseAbierta> {
  const hoy = hoyISO();
  if (fecha > hoy) return { ok: false, mensaje: "No se puede cargar una clase de un día que todavía no llegó." };
  if (fecha === hoy) return fecha; // la clase de hoy se abre siempre, como antes
  const { data: k, error } = await supabase.from("comisiones").select("fecha_inicio, fecha_fin").eq("id", comision).maybeSingle();
  if (error || !k) return { ok: false, mensaje: "No encontramos la comisión." };
  if (fecha < k.fecha_inicio || fecha > k.fecha_fin) return { ok: false, mensaje: "Esa fecha está fuera del período de la comisión." };
  return fecha;
}

const esquemaCancelar = z.object({
  comision: uuid, clase: z.union([z.literal(""), uuid]),
  fecha: z.union([z.literal(""), z.iso.date()]), hora_inicio: horaOpcional, hora_fin: horaOpcional,
  motivo: z.string().trim().min(3).max(300),
});

/**
 * Registra que una clase no se dictó (feriado, docente enferma, corte de
 * luz…). Si la clase ya existe se marca cancelada; si no, se crea así. No
 * se cancela una clase que ya tiene asistencia: primero hay que corregirla.
 */
export async function cancelarClase(datos: unknown): Promise<Resultado> {
  const sesion = await exigirPermiso("asistencia", "crear");
  const r = esquemaCancelar.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Indicá el motivo (al menos 3 caracteres)." };
  const d = r.data;
  const supabase = await crearClienteServidor();
  const rutas = ["/panel/mis-comisiones", `/panel/mis-comisiones/${d.comision}`, "/panel/familia"];

  if (d.clase) {
    const { count } = await supabase.from("asistencias").select("id", { count: "exact", head: true }).eq("clase_id", d.clase);
    if (count) return { ok: false, mensaje: "Esa clase ya tiene asistencia cargada: no se puede marcar como cancelada." };
    return ejecutar(() => supabase.from("clases").update({ estado: "cancelada", motivo_cancelacion: d.motivo }).eq("id", d.clase).eq("comision_id", d.comision),
      "Clase marcada como cancelada.", rutas);
  }
  if (!d.fecha || !d.hora_inicio || !d.hora_fin) return { ok: false, mensaje: "Falta la fecha o el horario de la clase." };
  const fecha = await validarFecha(supabase, d.comision, d.fecha);
  if (typeof fecha !== "string") return fecha;
  return ejecutar(() => supabase.from("clases").upsert({
    comision_id: d.comision, fecha, hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, estado: "cancelada", motivo_cancelacion: d.motivo,
    docente_persona_id: sesion.perfiles.includes("docente") ? sesion.personaId : null,
  }, { onConflict: "comision_id,fecha,hora_inicio" }), "Listo: queda registrado que esa clase no se dictó.", rutas);
}

const esquemaAsistencia = z.object({
  clase: uuid,
  tema: z.string().trim().max(300),
  filas: z.array(z.object({
    matricula: uuid,
    estado: z.enum(["presente", "ausente", "tarde", "justificada"]),
    observacion: z.string().trim().max(500),
  })).max(300),
});

/** Guarda (o corrige) la asistencia de una clase y deja registrado el tema. */
export async function guardarAsistencia(datos: unknown): Promise<Resultado> {
  await exigirPermiso("asistencia", "crear");
  const r = esquemaAsistencia.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Revisá los datos: el tema admite hasta 300 caracteres y cada observación hasta 500." };
  const d = r.data;
  if (d.filas.length === 0) return { ok: false, mensaje: "Marcá la asistencia de al menos un estudiante." };

  const supabase = await crearClienteServidor();
  const clase = await supabase.from("clases").select("id, comision_id").eq("id", d.clase).maybeSingle();
  if (clase.error) return { ok: false, mensaje: mensajeDeError(clase.error) };
  if (!clase.data) return { ok: false, mensaje: "No encontramos esa clase. Volvé al listado de la comisión." };

  return ejecutar(async () => {
    const asistencia = await supabase.from("asistencias").upsert(
      d.filas.map((f) => ({ clase_id: d.clase, matricula_id: f.matricula, estado: f.estado, observacion: f.observacion || null })),
      { onConflict: "clase_id,matricula_id" },
    );
    if (asistencia.error) return asistencia;
    return supabase.from("clases").update({ tema: d.tema || null, estado: "dictada", motivo_cancelacion: null }).eq("id", d.clase);
  }, `Asistencia guardada (${d.filas.length} ${d.filas.length === 1 ? "estudiante" : "estudiantes"}).`,
  ["/panel/mis-comisiones", `/panel/mis-comisiones/${clase.data.comision_id}`, "/panel/familia"]);
}
