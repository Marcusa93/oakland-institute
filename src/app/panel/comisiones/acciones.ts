"use server";

import { z } from "zod";
import { ejecutar, type Resultado } from "@/app/panel/acciones";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { marcado, texto, traducir, uuid } from "../estudiantes/comun";

const fallo = (mensaje: string): Resultado => ({ ok: false, mensaje });
const rutas = (comision: string) => ["/panel/comisiones", `/panel/comisiones/${comision}`];

/** Ejecuta y traduce con los mensajes de estas pantallas. */
async function resolver(promesa: PromiseLike<{ error: { message?: string } | null }>, exito: string, revalidar: string[]): Promise<Resultado> {
  const { error } = await promesa;
  if (error) return fallo(traducir(error));
  return ejecutar(async () => ({ error: null }), exito, revalidar); // revalida las rutas
}

const ESTADOS = ["borrador", "abierta", "en_curso", "finalizada", "cancelada"] as const;

// ---------------------------------------------------------------------------
// Comisiones
// ---------------------------------------------------------------------------
const esquemaComision = z.object({
  curso: uuid, nivel: uuid, ciclo: uuid, sede: uuid,
  nombre: z.string().trim().min(1).max(80),
  cupo: z.coerce.number().int().min(1).max(500),
  modalidad: z.enum(["presencial", "virtual", "mixta"]),
  estado: z.enum(ESTADOS),
  fecha_inicio: z.iso.date(), fecha_fin: z.iso.date(),
  publicada: z.boolean(),
});

export async function crearComision(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("comisiones", "crear");
  const r = esquemaComision.safeParse({
    curso: texto(formData, "curso"), nivel: texto(formData, "nivel"), ciclo: texto(formData, "ciclo"), sede: texto(formData, "sede"),
    nombre: texto(formData, "nombre"), cupo: texto(formData, "cupo"), modalidad: texto(formData, "modalidad") || "presencial",
    estado: texto(formData, "estado"), fecha_inicio: texto(formData, "fecha_inicio"), fecha_fin: texto(formData, "fecha_fin"),
    publicada: marcado(formData, "publicada"),
  });
  if (!r.success) return fallo("Revisá los datos: curso, nivel, ciclo, sede, nombre, cupo y fechas son obligatorios.");
  const d = r.data;
  if (d.fecha_fin < d.fecha_inicio) return fallo("La fecha de fin no puede ser anterior a la de inicio.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("comisiones").insert({
    curso_id: d.curso, nivel_id: d.nivel, ciclo_id: d.ciclo, sede_id: d.sede, nombre: d.nombre, cupo: d.cupo,
    modalidad: d.modalidad, estado: d.estado, publicada: d.publicada, fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin,
  }), `Comisión “${d.nombre}” creada.`, ["/panel/comisiones"]);
}

const esquemaEstado = z.object({ comision: uuid, estado: z.enum(ESTADOS), cupo: z.coerce.number().int().min(1).max(500), publicada: z.boolean() });

export async function actualizarComision(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("comisiones", "editar");
  const r = esquemaEstado.safeParse({ comision: texto(formData, "comision"), estado: texto(formData, "estado"), cupo: texto(formData, "cupo"), publicada: marcado(formData, "publicada") });
  if (!r.success) return fallo("Revisá el estado y el cupo.");
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { data: o, error } = await supabase.from("comisiones_ocupacion").select("inscriptos, reservas").eq("comision_id", d.comision).maybeSingle();
  if (error) return fallo(traducir(error));
  const ocupados = (o?.inscriptos ?? 0) + (o?.reservas ?? 0);
  if (d.cupo < ocupados) return fallo(`El cupo no puede ser menor a los lugares ya ocupados (${ocupados}).`);
  return resolver(supabase.from("comisiones").update({ estado: d.estado, cupo: d.cupo, publicada: d.publicada }).eq("id", d.comision),
    "Comisión actualizada.", rutas(d.comision));
}

// ---------------------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------------------
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const esquemaHorario = z.object({
  comision: uuid, dia: z.coerce.number().int().min(1).max(7), inicio: hora, fin: hora,
  aula: z.union([z.literal(""), uuid]),
});

export async function agregarHorario(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("comisiones", "editar");
  const r = esquemaHorario.safeParse({ comision: texto(formData, "comision"), dia: texto(formData, "dia"), inicio: texto(formData, "inicio"), fin: texto(formData, "fin"), aula: texto(formData, "aula") });
  if (!r.success) return fallo("Elegí la comisión, el día y las horas de inicio y fin.");
  const d = r.data;
  if (d.fin <= d.inicio) return fallo("La hora de fin tiene que ser posterior a la de inicio.");
  const supabase = await crearClienteServidor();
  const { data: k, error } = await supabase.from("comisiones").select("id, sede_id, fecha_inicio, fecha_fin").eq("id", d.comision).maybeSingle();
  if (error || !k) return fallo("No encontramos la comisión.");
  if (d.aula) {
    const { data: aula } = await supabase.from("aulas").select("sede_id, activa").eq("id", d.aula).maybeSingle();
    if (!aula || !aula.activa) return fallo("Esa aula no está disponible.");
    if (aula.sede_id !== k.sede_id) return fallo("El aula es de otra sede que la comisión.");
  }
  return resolver(supabase.from("comision_horarios").insert({
    comision_id: d.comision, aula_id: d.aula || null, dia_semana: d.dia, hora_inicio: d.inicio, hora_fin: d.fin,
    vigencia: `[${k.fecha_inicio},${k.fecha_fin}]`, // todo el período de la comisión, extremos incluidos
  }), "Horario agregado.", rutas(d.comision));
}

const esquemaQuitar = z.object({ comision: uuid, id: uuid });

export async function quitarHorario(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("comisiones", "editar");
  const r = esquemaQuitar.safeParse({ comision: texto(formData, "comision"), id: texto(formData, "id") });
  if (!r.success) return fallo("No pudimos identificar el horario. Actualizá la página.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("comision_horarios").delete().eq("id", r.data.id).eq("comision_id", r.data.comision), "Horario quitado.", rutas(r.data.comision));
}

// ---------------------------------------------------------------------------
// Docentes
// ---------------------------------------------------------------------------
const esquemaDocente = z.object({ comision: uuid, docente: uuid, funcion: z.enum(["titular", "auxiliar", "suplente"]), desde: z.iso.date() });

export async function asignarDocente(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("comisiones", "editar");
  const r = esquemaDocente.safeParse({ comision: texto(formData, "comision"), docente: texto(formData, "docente"), funcion: texto(formData, "funcion"), desde: texto(formData, "desde") });
  if (!r.success) return fallo("Elegí al docente, su función y desde cuándo.");
  const d = r.data;
  const supabase = await crearClienteServidor();
  // Solo personas con rol docente vigente.
  const { data: cuenta } = await supabase.from("cuentas").select("id").eq("persona_id", d.docente).maybeSingle();
  const { data: rol } = cuenta
    ? await supabase.from("roles_asignados").select("id").eq("cuenta_id", cuenta.id).eq("rol", "docente").is("revocado_en", null).limit(1)
    : { data: null };
  if (!rol?.length) return fallo("Esa persona no tiene el rol de docente.");
  return resolver(supabase.from("comision_docentes").insert({ comision_id: d.comision, docente_persona_id: d.docente, funcion: d.funcion, desde: d.desde }),
    "Docente asignado.", rutas(d.comision));
}

export async function quitarDocente(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("comisiones", "editar");
  const r = esquemaQuitar.safeParse({ comision: texto(formData, "comision"), id: texto(formData, "id") });
  if (!r.success) return fallo("No pudimos identificar la asignación. Actualizá la página.");
  const supabase = await crearClienteServidor();
  const { data: a, error } = await supabase.from("comision_docentes").select("desde").eq("id", r.data.id).eq("comision_id", r.data.comision).maybeSingle();
  if (error || !a) return fallo("No encontramos la asignación.");
  const hoy = hoyISO();
  // Si todavía no empezó, la asignación se borra; si ya dictó, queda en el historial con fecha de fin.
  const cambio = a.desde > hoy
    ? supabase.from("comision_docentes").delete().eq("id", r.data.id)
    : supabase.from("comision_docentes").update({ hasta: hoy }).eq("id", r.data.id);
  return resolver(cambio, "El docente ya no está a cargo de la comisión.", rutas(r.data.comision));
}

// ---------------------------------------------------------------------------
// Inscripciones, reservas y lista de espera
// ---------------------------------------------------------------------------
const esquemaInscribir = z.object({ comision: uuid, estudiante: uuid, responsable_pago: uuid });

export async function inscribir(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("inscripciones", "crear");
  const r = esquemaInscribir.safeParse({ comision: texto(formData, "comision"), estudiante: texto(formData, "estudiante"), responsable_pago: texto(formData, "responsable_pago") });
  if (!r.success) return fallo("Elegí al estudiante y a quien se hace cargo del pago.");
  const d = r.data;
  const supabase = await crearClienteServidor();
  // Quien paga solo puede ser el propio estudiante o un responsable verificado.
  const [est, vinculo] = await Promise.all([
    supabase.from("estudiantes").select("persona_id").eq("id", d.estudiante).maybeSingle(),
    supabase.from("vinculos_responsables").select("id").eq("estudiante_id", d.estudiante).eq("responsable_persona_id", d.responsable_pago).eq("estado", "verificado").limit(1),
  ]);
  if (est.error || !est.data) return fallo("No encontramos al estudiante.");
  if (est.data.persona_id !== d.responsable_pago && !(vinculo.data ?? []).length) {
    return fallo("Quien paga tiene que ser el propio estudiante o un responsable con el vínculo verificado.");
  }
  return resolver(supabase.rpc("confirmar_inscripcion", { p_estudiante: d.estudiante, p_comision: d.comision, p_responsable_pago: d.responsable_pago }),
    "Inscripción confirmada.", [...rutas(d.comision), `/panel/estudiantes/${d.estudiante}`, "/panel/estudiantes"]);
}

const esquemaReserva = z.object({ comision: uuid, estudiante: uuid, horas: z.coerce.number().int().min(1).max(720) });

export async function reservar(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("inscripciones", "crear");
  const r = esquemaReserva.safeParse({ comision: texto(formData, "comision"), estudiante: texto(formData, "estudiante"), horas: texto(formData, "horas") });
  if (!r.success) return fallo("El plazo de la reserva tiene que ser de entre 1 y 720 horas (30 días).");
  const d = r.data;
  const supabase = await crearClienteServidor();
  return resolver(supabase.rpc("reservar_vacante", { p_estudiante: d.estudiante, p_comision: d.comision, p_horas: d.horas }),
    `Vacante reservada por ${d.horas} horas.`, rutas(d.comision));
}

const esquemaPar = z.object({ comision: uuid, estudiante: uuid });

export async function agregarAEspera(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("inscripciones", "crear");
  const r = esquemaPar.safeParse({ comision: texto(formData, "comision"), estudiante: texto(formData, "estudiante") });
  if (!r.success) return fallo("Elegí al estudiante.");
  const d = r.data;
  const supabase = await crearClienteServidor();
  const [ocupacion, activa] = await Promise.all([
    supabase.from("comisiones_ocupacion").select("cupo, inscriptos, reservas").eq("comision_id", d.comision).maybeSingle(),
    supabase.from("matriculas").select("id").eq("comision_id", d.comision).eq("estudiante_id", d.estudiante).eq("estado", "activa").limit(1),
  ]);
  if (ocupacion.error || !ocupacion.data) return fallo("No encontramos la comisión.");
  if ((activa.data ?? []).length) return fallo("El estudiante ya está inscripto en esa comisión.");
  if (ocupacion.data.inscriptos + ocupacion.data.reservas < ocupacion.data.cupo) {
    return fallo("Todavía hay lugar: podés inscribirlo o reservarle la vacante.");
  }
  return resolver(supabase.from("lista_espera").insert({ comision_id: d.comision, estudiante_id: d.estudiante }), "Agregado a la lista de espera.", rutas(d.comision));
}

export async function retirarDeEspera(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("inscripciones", "editar");
  const r = esquemaQuitar.safeParse({ comision: texto(formData, "comision"), id: texto(formData, "id") });
  if (!r.success) return fallo("No pudimos identificar el registro. Actualizá la página.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("lista_espera").update({ estado: "retirada" }).eq("id", r.data.id).eq("comision_id", r.data.comision).in("estado", ["esperando", "ofrecida"]),
    "Retirado de la lista de espera.", rutas(r.data.comision));
}

const esquemaBaja = z.object({ comision: uuid, estudiante: uuid, matricula: uuid, motivo: z.string().trim().min(5).max(300) });

export async function darDeBaja(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("inscripciones", "editar");
  const r = esquemaBaja.safeParse({ comision: texto(formData, "comision"), estudiante: texto(formData, "estudiante"), matricula: texto(formData, "matricula"), motivo: texto(formData, "motivo") });
  if (!r.success) return fallo("Indicá un motivo (al menos 5 caracteres).");
  const d = r.data;
  const supabase = await crearClienteServidor();
  return resolver(supabase.rpc("dar_de_baja_matricula", { p_matricula: d.matricula, p_motivo: d.motivo }),
    "Baja registrada. Las obligaciones ya generadas siguen en la cuenta: revisalas en Cobros.", [...rutas(d.comision), `/panel/estudiantes/${d.estudiante}`]);
}

const esquemaCambio = z.object({ comision: uuid, estudiante: uuid, matricula: uuid, destino: uuid, motivo: z.string().trim().max(300) });

export async function cambiarDeComision(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("inscripciones", "editar");
  const r = esquemaCambio.safeParse({ comision: texto(formData, "comision"), estudiante: texto(formData, "estudiante"), matricula: texto(formData, "matricula"), destino: texto(formData, "destino"), motivo: texto(formData, "motivo") });
  if (!r.success) return fallo("Elegí la comisión de destino.");
  const d = r.data;
  if (d.destino === d.comision) return fallo("El estudiante ya está en esa comisión: elegí otra.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.rpc("cambiar_comision", { p_matricula: d.matricula, p_nueva_comision: d.destino, p_motivo: d.motivo || null }),
    "Cambio de comisión hecho.", [...rutas(d.comision), `/panel/comisiones/${d.destino}`, `/panel/estudiantes/${d.estudiante}`]);
}
