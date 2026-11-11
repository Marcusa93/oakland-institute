"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type Resultado } from "@/app/panel/acciones";
import { hoyISO, nombreCompleto } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { edad, marcado, texto, traducir, uno, uuid, type Cliente } from "./comun";

export interface ResultadoAlta extends Resultado {
  /** Lo que se envió, para no perder lo escrito cuando hay que corregir. */
  valores?: Record<string, string>;
  coincidencias?: Array<{ personaId: string; nombre: string; estudianteId: string | null; legajo: string | null }>;
  /** Persona encontrada por documento. */
  existente?: { personaId: string; nombre: string; estudianteId: string | null };
  estudianteId?: string;
}

const ruta = (estudiante: string) => `/panel/estudiantes/${estudiante}`;
const fallo = (mensaje: string): Resultado => ({ ok: false, mensaje });

const esquemaPersona = z.object({
  nombres: z.string().trim().min(1).max(80),
  apellidos: z.string().trim().min(1).max(80),
  tipo_documento: z.enum(["DNI", "PASAPORTE", "OTRO"]),
  numero_documento: z.string().trim().max(20),
  fecha_nacimiento: z.union([z.literal(""), z.iso.date()]),
  email: z.union([z.literal(""), z.email().max(120)]),
  telefono: z.string().trim().max(40),
});
type DatosPersona = z.infer<typeof esquemaPersona>;

const CAMPOS_PERSONA = ["nombres", "apellidos", "tipo_documento", "numero_documento", "fecha_nacimiento", "email", "telefono"] as const;

function leerPersona(fd: FormData) {
  const valores: Record<string, string> = {};
  for (const c of CAMPOS_PERSONA) valores[c] = texto(fd, c);
  if (!valores.tipo_documento) valores.tipo_documento = "DNI";
  return valores;
}

/** DNI: solo números. Otros documentos: sin espacios y en mayúsculas. Devuelve null si no es válido. */
function normalizarDocumento(tipo: string, numero: string): string | null {
  if (tipo === "DNI") {
    const n = numero.replace(/[.\s-]/g, "");
    return /^\d{6,9}$/.test(n) ? n : null;
  }
  const n = numero.replace(/\s/g, "").toUpperCase();
  return /^[A-Z0-9-]{4,20}$/.test(n) ? n : null;
}

function validarPersona(d: DatosPersona): { documento: string | null } | string {
  const documento = d.numero_documento ? normalizarDocumento(d.tipo_documento, d.numero_documento) : null;
  if (d.numero_documento && !documento) return d.tipo_documento === "DNI" ? "El DNI tiene que tener entre 6 y 9 números." : "Revisá el número de documento.";
  if (d.fecha_nacimiento && d.fecha_nacimiento > hoyISO()) return "La fecha de nacimiento no puede ser posterior a hoy.";
  return { documento };
}

async function buscarPorDocumento(supabase: Cliente, tipo: string, documento: string) {
  const { data, error } = await supabase.from("personas_datos")
    .select("persona_id, personas(nombres, apellidos)")
    .eq("tipo_documento", tipo).eq("numero_documento", documento).maybeSingle();
  if (error) return { error };
  if (!data) return { existente: null };
  const { data: est } = await supabase.from("estudiantes").select("id").eq("persona_id", data.persona_id).maybeSingle();
  const p = uno(data.personas as unknown as { nombres: string; apellidos: string });
  return { existente: { personaId: data.persona_id as string, nombre: nombreCompleto(p), estudianteId: (est?.id as string | undefined) ?? null } };
}

async function buscarPorNombre(supabase: Cliente, d: DatosPersona) {
  // Coincidencia exacta sin distinguir mayúsculas; se quitan los comodines del texto.
  const limpio = (s: string) => s.replace(/[%_*\\]/g, " ").trim();
  const { data } = await supabase.from("personas")
    .select("id, nombres, apellidos, estudiantes(id, legajo)")
    .ilike("apellidos", limpio(d.apellidos)).ilike("nombres", limpio(d.nombres))
    .is("eliminada_en", null).limit(5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((p) => {
    const e = uno<{ id: string; legajo: string }>(p.estudiantes);
    return { personaId: p.id as string, nombre: nombreCompleto(p), estudianteId: e?.id ?? null, legajo: e?.legajo ?? null };
  });
}

/**
 * No hay borrado físico de personas: deshacer = quitar el documento (para que
 * no bloquee una nueva carga) y marcar la persona como eliminada.
 */
async function deshacerPersona(supabase: Cliente, personaId: string): Promise<boolean> {
  const a = await supabase.from("personas_datos").update({ tipo_documento: null, numero_documento: null }).eq("persona_id", personaId);
  const b = await supabase.from("personas").update({ eliminada_en: new Date().toISOString() }).eq("id", personaId);
  return !a.error && !b.error;
}

/** Crea persona + datos. Si falla el segundo paso, deshace el primero. */
async function crearPersona(supabase: Cliente, d: DatosPersona, documento: string | null): Promise<{ personaId: string } | { mensaje: string }> {
  const persona = await supabase.from("personas").insert({ nombres: d.nombres, apellidos: d.apellidos }).select("id").single();
  if (persona.error || !persona.data) return { mensaje: `No se cargó nada. ${traducir(persona.error)}` };
  const personaId = persona.data.id as string;
  const datos = await supabase.from("personas_datos").insert({
    persona_id: personaId,
    tipo_documento: documento ? d.tipo_documento : null,
    numero_documento: documento,
    fecha_nacimiento: d.fecha_nacimiento || null,
    email: d.email ? d.email.toLowerCase() : null,
    telefono: d.telefono || null,
  });
  if (datos.error) {
    const deshecho = await deshacerPersona(supabase, personaId);
    return {
      mensaje: deshecho
        ? `No se cargó nada: falló el guardado de los datos personales y deshicimos el alta. ${traducir(datos.error)}`
        : `Quedó cargada la persona ${d.apellidos}, ${d.nombres} sin sus datos personales y no pudimos deshacerlo. Avisá a dirección antes de volver a intentar.`,
    };
  }
  return { personaId };
}

// ---------------------------------------------------------------------------
// Alta de estudiante: persona → personas_datos → estudiante
// ---------------------------------------------------------------------------
export async function crearEstudiante(_previo: ResultadoAlta | null, formData: FormData): Promise<ResultadoAlta> {
  await exigirPermiso("estudiantes", "crear");
  const valores = leerPersona(formData);
  const supabase = await crearClienteServidor();

  // Camino corto: la persona ya existe (se encontró por documento) y solo falta el legajo.
  const usar = uuid.safeParse(texto(formData, "usar_persona"));
  if (usar.success) {
    const alta = await supabase.from("estudiantes").insert({ persona_id: usar.data }).select("id, legajo").single();
    if (alta.error || !alta.data) return { ok: false, mensaje: traducir(alta.error), valores };
    revalidatePath("/panel/estudiantes");
    return { ok: true, mensaje: `Listo: legajo ${alta.data.legajo}.`, estudianteId: alta.data.id };
  }

  const r = esquemaPersona.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: "Revisá los datos: nombres y apellidos son obligatorios, y el email tiene que ser válido.", valores };
  const d = r.data;
  const v = validarPersona(d);
  if (typeof v === "string") return { ok: false, mensaje: v, valores };

  if (v.documento) {
    const dup = await buscarPorDocumento(supabase, d.tipo_documento, v.documento);
    if (dup.error) return { ok: false, mensaje: traducir(dup.error), valores };
    if (dup.existente) {
      return {
        ok: false, valores, existente: dup.existente,
        mensaje: dup.existente.estudianteId
          ? `Ya hay un estudiante con ese documento: ${dup.existente.nombre}. No se creó nada.`
          : `Ya hay una persona con ese documento: ${dup.existente.nombre}. Si es la misma, marcá la casilla para darle un legajo.`,
      };
    }
  }
  if (!marcado(formData, "confirmar")) {
    const coincidencias = await buscarPorNombre(supabase, d);
    if (coincidencias.length > 0) {
      return { ok: false, valores, coincidencias, mensaje: "Ya hay alguien con ese nombre y apellido. Fijate si es la misma persona antes de crear otra." };
    }
  }

  const persona = await crearPersona(supabase, d, v.documento);
  if ("mensaje" in persona) return { ok: false, mensaje: persona.mensaje, valores };

  const alta = await supabase.from("estudiantes").insert({ persona_id: persona.personaId }).select("id, legajo").single();
  if (alta.error || !alta.data) {
    const deshecho = await deshacerPersona(supabase, persona.personaId);
    return {
      ok: false, valores,
      mensaje: deshecho
        ? `No se cargó nada: no pudimos generar el legajo y deshicimos el alta de la persona. ${traducir(alta.error)}`
        : `Quedó cargada la persona ${d.apellidos}, ${d.nombres} pero sin legajo de estudiante, y no pudimos deshacerlo. Avisá a dirección antes de volver a intentar.`,
    };
  }
  revalidatePath("/panel/estudiantes");
  return { ok: true, mensaje: `Estudiante creado con legajo ${alta.data.legajo}.`, estudianteId: alta.data.id };
}

// ---------------------------------------------------------------------------
// Datos del estudiante
// ---------------------------------------------------------------------------
const esquemaDatos = esquemaPersona.extend({
  estudiante: uuid,
  nombre_preferido: z.string().trim().max(60),
  domicilio: z.string().trim().max(200),
  estado: z.enum(["aspirante", "activo", "inactivo", "egresado"]),
});

export async function actualizarDatos(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("datos_personales", "editar");
  const r = esquemaDatos.safeParse({
    ...leerPersona(formData), estudiante: texto(formData, "estudiante"),
    nombre_preferido: texto(formData, "nombre_preferido"), domicilio: texto(formData, "domicilio"), estado: texto(formData, "estado"),
  });
  if (!r.success) return fallo("Revisá los datos: nombres y apellidos son obligatorios, y el email tiene que ser válido.");
  const d = r.data;
  const v = validarPersona(d);
  if (typeof v === "string") return fallo(v);

  const supabase = await crearClienteServidor();
  const { data: est, error } = await supabase.from("estudiantes").select("id, persona_id").eq("id", d.estudiante).maybeSingle();
  if (error || !est) return fallo("No encontramos al estudiante.");

  const pasos = [
    await supabase.from("personas").update({ nombres: d.nombres, apellidos: d.apellidos, nombre_preferido: d.nombre_preferido || null }).eq("id", est.persona_id),
    await supabase.from("personas_datos").upsert({
      persona_id: est.persona_id,
      tipo_documento: v.documento ? d.tipo_documento : null, numero_documento: v.documento,
      fecha_nacimiento: d.fecha_nacimiento || null, email: d.email ? d.email.toLowerCase() : null,
      telefono: d.telefono || null, domicilio: d.domicilio || null,
    }, { onConflict: "persona_id" }),
    await supabase.from("estudiantes").update({ estado: d.estado }).eq("id", d.estudiante),
  ];
  revalidatePath(ruta(d.estudiante));
  revalidatePath("/panel/estudiantes");
  const errores = pasos.map((p, i) => (p.error ? `${["nombre", "datos personales", "estado"][i]}: ${traducir(p.error)}` : null)).filter(Boolean);
  if (errores.length > 0) return fallo(`No se guardó todo. ${errores.join(" ")}`);
  return { ok: true, mensaje: "Datos guardados." };
}

const esquemaContacto = z.object({
  estudiante: uuid, persona: uuid,
  email: z.union([z.literal(""), z.email().max(120)]),
  telefono: z.string().trim().max(40),
});

/** Contacto de un responsable del estudiante (para poder invitarlo a crear su cuenta). */
export async function actualizarContacto(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("datos_personales", "editar");
  const r = esquemaContacto.safeParse({ estudiante: texto(formData, "estudiante"), persona: texto(formData, "persona"), email: texto(formData, "email"), telefono: texto(formData, "telefono") });
  if (!r.success) return fallo("Revisá el email y el teléfono.");
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { data: vinculo } = await supabase.from("vinculos_responsables").select("id")
    .eq("estudiante_id", d.estudiante).eq("responsable_persona_id", d.persona).limit(1);
  if (!vinculo?.length) return fallo("Esa persona no es responsable de este estudiante.");
  const { error } = await supabase.from("personas_datos").upsert(
    { persona_id: d.persona, email: d.email ? d.email.toLowerCase() : null, telefono: d.telefono || null }, { onConflict: "persona_id" });
  if (error) return fallo(traducir(error));
  revalidatePath(ruta(d.estudiante));
  return { ok: true, mensaje: "Contacto guardado." };
}

// ---------------------------------------------------------------------------
// Observaciones
// ---------------------------------------------------------------------------
const esquemaObservacion = z.object({
  estudiante: uuid,
  visibilidad: z.enum(["gestion", "docentes", "familia"]),
  texto: z.string().trim().min(1).max(2000),
});

export async function agregarObservacion(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("estudiantes", "editar");
  const r = esquemaObservacion.safeParse({ estudiante: texto(formData, "estudiante"), visibilidad: texto(formData, "visibilidad"), texto: texto(formData, "texto") });
  if (!r.success) return fallo("Escribí la observación y elegí quién puede verla.");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("observaciones_estudiante").insert({
    estudiante_id: r.data.estudiante, autor_cuenta_id: sesion.cuentaId, visibilidad: r.data.visibilidad, texto: r.data.texto,
  });
  if (error) return fallo(traducir(error));
  revalidatePath(ruta(r.data.estudiante));
  return { ok: true, mensaje: "Observación guardada." };
}

// ---------------------------------------------------------------------------
// Vínculos con responsables
// ---------------------------------------------------------------------------
const esquemaInvitar = z.object({ estudiante: uuid, persona: uuid, parentesco: z.string().trim().max(60) });

export async function invitarResponsable(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("vinculos", "crear");
  const r = esquemaInvitar.safeParse({ estudiante: texto(formData, "estudiante"), persona: texto(formData, "persona"), parentesco: texto(formData, "parentesco") });
  if (!r.success) return fallo("Elegí a la persona responsable.");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("invitar_responsable", {
    p_estudiante: r.data.estudiante, p_responsable: r.data.persona, p_parentesco: r.data.parentesco || null,
  });
  if (error) return fallo(traducir(error));
  revalidatePath(ruta(r.data.estudiante));
  return { ok: true, mensaje: "Responsable agregado. El vínculo queda pendiente hasta que lo verifiques." };
}

export async function crearResponsableEInvitar(_previo: ResultadoAlta | null, formData: FormData): Promise<ResultadoAlta> {
  await exigirPermiso("vinculos", "crear");
  const parentesco = texto(formData, "parentesco").slice(0, 60);
  const valores = { ...leerPersona(formData), fecha_nacimiento: "", parentesco };
  const estudiante = uuid.safeParse(texto(formData, "estudiante"));
  const r = esquemaPersona.safeParse(valores);
  if (!estudiante.success || !r.success) return { ok: false, mensaje: "Revisá los datos: nombres y apellidos son obligatorios, y el email tiene que ser válido.", valores };
  const d = r.data;
  const v = validarPersona(d);
  if (typeof v === "string") return { ok: false, mensaje: v, valores };

  const supabase = await crearClienteServidor();
  if (v.documento) {
    const dup = await buscarPorDocumento(supabase, d.tipo_documento, v.documento);
    if (dup.error) return { ok: false, mensaje: traducir(dup.error), valores };
    if (dup.existente) {
      return { ok: false, valores, mensaje: `Ya hay una persona con ese documento: ${dup.existente.nombre}. Buscala por apellido en "Persona ya cargada" e invitala desde ahí.` };
    }
  }
  if (!marcado(formData, "confirmar")) {
    const coincidencias = await buscarPorNombre(supabase, d);
    if (coincidencias.length > 0) {
      return { ok: false, valores, coincidencias, mensaje: "Ya hay alguien con ese nombre y apellido. Si es la misma persona, buscala en \"Persona ya cargada\"." };
    }
  }

  const persona = await crearPersona(supabase, d, v.documento);
  if ("mensaje" in persona) return { ok: false, mensaje: persona.mensaje, valores };
  const { error } = await supabase.rpc("invitar_responsable", {
    p_estudiante: estudiante.data, p_responsable: persona.personaId, p_parentesco: parentesco || null,
  });
  if (error) {
    const deshecho = await deshacerPersona(supabase, persona.personaId);
    return {
      ok: false, valores,
      mensaje: deshecho
        ? `No se cargó nada: no pudimos crear el vínculo y deshicimos el alta de la persona. ${traducir(error)}`
        : `La persona ${d.apellidos}, ${d.nombres} quedó cargada pero sin vínculo con el estudiante. Buscala en "Persona ya cargada" para invitarla.`,
    };
  }
  revalidatePath(ruta(estudiante.data));
  return { ok: true, mensaje: "Persona creada y agregada como responsable. El vínculo queda pendiente hasta que lo verifiques." };
}

const esquemaVerificar = z.object({
  estudiante: uuid, vinculo: uuid,
  academico: z.boolean(), documental: z.boolean(), economico: z.boolean(), responsable_pago: z.boolean(), contacto_emergencia: z.boolean(),
});

/** Verifica el vínculo y fija sus permisos. Sirve también para cambiar los permisos de uno ya verificado. */
export async function verificarVinculo(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("vinculos", "aprobar");
  const r = esquemaVerificar.safeParse({
    estudiante: texto(formData, "estudiante"), vinculo: texto(formData, "vinculo"),
    academico: marcado(formData, "academico"), documental: marcado(formData, "documental"), economico: marcado(formData, "economico"),
    responsable_pago: marcado(formData, "responsable_pago"), contacto_emergencia: marcado(formData, "contacto_emergencia"),
  });
  if (!r.success) return fallo("No pudimos identificar el vínculo. Actualizá la página.");
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("verificar_vinculo", {
    p_vinculo: d.vinculo, p_academico: d.academico, p_documental: d.documental, p_economico: d.economico,
    p_responsable_pago: d.responsable_pago, p_contacto_emergencia: d.contacto_emergencia,
  });
  if (error) return fallo(traducir(error));
  revalidatePath(ruta(d.estudiante));
  return { ok: true, mensaje: d.responsable_pago && !d.economico ? "Permisos guardados. Como es responsable de pago, también ve lo económico." : "Vínculo verificado y permisos guardados." };
}

const esquemaRevocar = z.object({ estudiante: uuid, vinculo: uuid, motivo: z.string().trim().min(5).max(300) });

export async function revocarVinculo(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("vinculos", "editar");
  const r = esquemaRevocar.safeParse({ estudiante: texto(formData, "estudiante"), vinculo: texto(formData, "vinculo"), motivo: texto(formData, "motivo") });
  if (!r.success) return fallo("Indicá un motivo (al menos 5 caracteres).");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("revocar_vinculo", { p_vinculo: r.data.vinculo, p_motivo: r.data.motivo });
  if (error) return fallo(traducir(error));
  revalidatePath(ruta(r.data.estudiante));
  return { ok: true, mensaje: "Vínculo revocado: la persona ya no tiene acceso a este estudiante." };
}

// ---------------------------------------------------------------------------
// Invitación a crear cuenta (estudiante adulto o responsable). Nunca asigna roles.
// ---------------------------------------------------------------------------
const esquemaCuenta = z.object({ estudiante: uuid, persona: uuid });

export async function invitarACrearCuenta(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("vinculos", "crear"); // primero el permiso; recién después se usa la clave secreta
  const r = esquemaCuenta.safeParse({ estudiante: texto(formData, "estudiante"), persona: texto(formData, "persona") });
  if (!r.success) return fallo("No pudimos identificar a la persona. Actualizá la página.");
  const { estudiante, persona } = r.data;

  const supabase = await crearClienteServidor();
  const [est, vinculo, datos, cuenta] = await Promise.all([
    supabase.from("estudiantes").select("id, persona_id").eq("id", estudiante).maybeSingle(),
    supabase.from("vinculos_responsables").select("id").eq("estudiante_id", estudiante).eq("responsable_persona_id", persona)
      .in("estado", ["invitado", "aceptado", "verificado"]).limit(1),
    supabase.from("personas_datos").select("email, fecha_nacimiento").eq("persona_id", persona).maybeSingle(),
    supabase.from("cuentas").select("id").eq("persona_id", persona).maybeSingle(),
  ]);
  if (est.error || vinculo.error || datos.error || cuenta.error) return fallo(traducir(est.error ?? vinculo.error ?? datos.error ?? cuenta.error));
  if (!est.data) return fallo("No encontramos al estudiante.");
  const esElEstudiante = est.data.persona_id === persona;
  const esResponsable = (vinculo.data ?? []).length > 0;
  if (!esElEstudiante && !esResponsable) return fallo("Solo se puede invitar al estudiante o a sus responsables con vínculo abierto.");
  if (esElEstudiante) {
    const anios = edad(datos.data?.fecha_nacimiento, hoyISO());
    if (anios === null) return fallo("Cargá la fecha de nacimiento del estudiante: solo los mayores de 18 tienen cuenta propia.");
    if (anios < 18) return fallo("El estudiante es menor de edad: la cuenta la usa su responsable.");
  }
  if (cuenta.data) return fallo("Esa persona ya tiene una cuenta.");
  const email = datos.data?.email as string | null | undefined;
  if (!email) return fallo("La persona no tiene email cargado.");

  const sitio = process.env.NEXT_PUBLIC_SITIO_URL;
  if (!sitio) return fallo("Falta configurar la dirección del sitio en el servidor (NEXT_PUBLIC_SITIO_URL). Avisá a quien administra el sistema.");
  let admin: ReturnType<typeof crearClienteAdmin>;
  try {
    admin = crearClienteAdmin();
  } catch {
    return fallo("No se pueden enviar invitaciones: falta configurar la clave secreta en el servidor (SUPABASE_SECRET_KEY). Avisá a quien administra el sistema.");
  }

  const invitacion = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${sitio}/auth/bienvenida` });
  if (invitacion.error || !invitacion.data?.user) {
    const m = invitacion.error?.message ?? "";
    if (/already|registered|exists/i.test(m)) return fallo("Ya existe un usuario con ese email. Revisá si el email corresponde a otra persona.");
    if (/rate limit/i.test(m)) return fallo("Se enviaron demasiadas invitaciones seguidas. Esperá unos minutos y probá de nuevo.");
    return fallo("No pudimos enviar la invitación. Revisá el email y probá de nuevo.");
  }
  const usuarioId = invitacion.data.user.id;
  const alta = await admin.from("cuentas").insert({ id: usuarioId, persona_id: persona });
  if (alta.error) {
    // Sin fila en `cuentas` el usuario no podría entrar: se retira la invitación.
    const borrado = await admin.auth.admin.deleteUser(usuarioId);
    return fallo(borrado.error
      ? "Se envió la invitación pero no pudimos asociar la cuenta a la persona. Avisá a quien administra el sistema antes de volver a intentar."
      : "No pudimos asociar la cuenta a la persona, así que anulamos la invitación. Probá de nuevo.");
  }
  revalidatePath(ruta(estudiante));
  return { ok: true, mensaje: `Invitación enviada a ${email}.` };
}
