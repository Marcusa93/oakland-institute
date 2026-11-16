"use server";

import { z } from "zod";
import { ejecutar, type Resultado } from "@/app/panel/acciones";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { marcado, texto, traducir, uuid } from "../estudiantes/comun";

const RUTAS = ["/panel/oferta", "/panel/comisiones", "/"];
const fallo = (mensaje: string): Resultado => ({ ok: false, mensaje });

function propio(error: { message?: string; code?: string } | null) {
  const m = error?.message ?? "";
  if (/ciclos_lectivos_nombre_key/.test(m)) return "Ya hay un ciclo con ese nombre.";
  if (/niveles_codigo_key/.test(m)) return "Ya hay un nivel con ese código.";
  if (/cursos_slug_key/.test(m)) return "Ya hay un curso con un nombre muy parecido. Cambiá el nombre.";
  if (/aulas_sede_id_nombre_key/.test(m)) return "Ya hay un aula con ese nombre en la sede.";
  if (/fecha_fin|check/.test(m) && /ciclos/.test(m)) return "La fecha de fin tiene que ser posterior a la de inicio.";
  return traducir(error);
}

async function resolver(promesa: PromiseLike<{ error: { message?: string } | null }>, exito: string): Promise<Resultado> {
  const { error } = await promesa;
  if (error) return fallo(propio(error));
  return ejecutar(async () => ({ error: null }), exito, RUTAS);
}

const opcionalUuid = z.union([z.literal(""), uuid]);

// ---------------------------------------------------------------------------
// Ciclos lectivos
// ---------------------------------------------------------------------------
const esquemaCiclo = z.object({
  id: opcionalUuid,
  nombre: z.string().trim().min(2).max(40),
  fecha_inicio: z.iso.date(), fecha_fin: z.iso.date(),
  estado: z.enum(["planificado", "activo", "cerrado"]),
});

export async function guardarCiclo(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("oferta_publica", "editar");
  const r = esquemaCiclo.safeParse({
    id: texto(formData, "id"), nombre: texto(formData, "nombre"), fecha_inicio: texto(formData, "fecha_inicio"),
    fecha_fin: texto(formData, "fecha_fin"), estado: texto(formData, "estado"),
  });
  if (!r.success) return fallo("Completá el nombre (por ejemplo 2027), las fechas y el estado.");
  const { id, ...d } = r.data;
  if (d.fecha_fin <= d.fecha_inicio) return fallo("La fecha de fin tiene que ser posterior a la de inicio.");
  const supabase = await crearClienteServidor();
  return resolver(id ? supabase.from("ciclos_lectivos").update(d).eq("id", id) : supabase.from("ciclos_lectivos").insert(d),
    id ? "Ciclo actualizado." : `Ciclo ${d.nombre} creado. Ya podés crear sus comisiones.`);
}

// ---------------------------------------------------------------------------
// Cursos
// ---------------------------------------------------------------------------
const edad = z.union([z.literal(""), z.coerce.number().int().min(3).max(99)]);
const esquemaCurso = z.object({
  id: opcionalUuid,
  nombre: z.string().trim().min(3).max(80),
  descripcion: z.string().trim().max(600),
  publico: z.enum(["ninos", "adolescentes", "adultos", "todos"]),
  edad_minima: edad, edad_maxima: edad,
  modalidad: z.enum(["presencial", "virtual", "mixta"]),
  orden: z.coerce.number().int().min(0).max(999),
  publicado: z.boolean(), activo: z.boolean(),
});

const slugDe = (nombre: string) =>
  nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "curso";

export async function guardarCurso(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("oferta_publica", "editar");
  const r = esquemaCurso.safeParse({
    id: texto(formData, "id"), nombre: texto(formData, "nombre"), descripcion: texto(formData, "descripcion"),
    publico: texto(formData, "publico"), edad_minima: texto(formData, "edad_minima"), edad_maxima: texto(formData, "edad_maxima"),
    modalidad: texto(formData, "modalidad"), orden: texto(formData, "orden") || "0",
    publicado: marcado(formData, "publicado"), activo: texto(formData, "id") ? marcado(formData, "activo") : true,
  });
  if (!r.success) return fallo("Revisá los datos: el nombre es obligatorio y las edades van de 3 a 99.");
  const { id, ...d } = r.data;
  const fila = {
    ...d, descripcion: d.descripcion || null,
    edad_minima: d.edad_minima === "" ? null : d.edad_minima, edad_maxima: d.edad_maxima === "" ? null : d.edad_maxima,
  };
  if (fila.edad_minima !== null && fila.edad_maxima !== null && fila.edad_maxima < fila.edad_minima) return fallo("La edad máxima no puede ser menor que la mínima.");
  const supabase = await crearClienteServidor();
  if (id) return resolver(supabase.from("cursos").update(fila).eq("id", id), "Curso actualizado.");
  // El slug arma la dirección del curso en la web; si ya existe se le agrega un número.
  const base = slugDe(d.nombre);
  const { data: usados } = await supabase.from("cursos").select("slug").like("slug", `${base}%`);
  const ocupados = new Set((usados ?? []).map((u) => u.slug as string));
  let slug = base;
  for (let i = 2; ocupados.has(slug); i++) slug = `${base}-${i}`;
  return resolver(supabase.from("cursos").insert({ ...fila, slug }), `Curso “${d.nombre}” creado.${d.publicado ? " Ya aparece en la página web." : ""}`);
}

// ---------------------------------------------------------------------------
// Niveles
// ---------------------------------------------------------------------------
const esquemaNivel = z.object({
  id: opcionalUuid,
  codigo: z.string().trim().min(1).max(10),
  nombre: z.string().trim().min(2).max(60),
  orden: z.coerce.number().int().min(0).max(999),
  descripcion: z.string().trim().max(300),
  mcer: z.enum(["", "Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"]),
});

export async function guardarNivel(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("oferta_publica", "editar");
  const r = esquemaNivel.safeParse({
    id: texto(formData, "id"), codigo: texto(formData, "codigo").toUpperCase(), nombre: texto(formData, "nombre"),
    orden: texto(formData, "orden") || "0", descripcion: texto(formData, "descripcion"), mcer: texto(formData, "mcer"),
  });
  if (!r.success) return fallo("Completá el código (hasta 10 letras), el nombre y el orden.");
  const { id, mcer, ...d } = r.data;
  const supabase = await crearClienteServidor();
  // La referencia MCER registra quién la revisó: es una decisión académica del instituto.
  let referencia: Record<string, unknown> = { mcer_referencia: null, mcer_revisado_por: null, mcer_revisado_en: null };
  if (mcer) {
    const { data: previo } = id ? await supabase.from("niveles").select("mcer_referencia").eq("id", id).maybeSingle() : { data: null };
    referencia = previo?.mcer_referencia === mcer ? {} : { mcer_referencia: mcer, mcer_revisado_por: sesion.cuentaId, mcer_revisado_en: new Date().toISOString() };
  }
  const fila = { ...d, descripcion: d.descripcion || null, ...referencia };
  return resolver(id ? supabase.from("niveles").update(fila).eq("id", id) : supabase.from("niveles").insert(fila),
    id ? "Nivel actualizado." : `Nivel “${d.nombre}” creado.`);
}

// ---------------------------------------------------------------------------
// Aulas y sede
// ---------------------------------------------------------------------------
const esquemaAula = z.object({
  id: opcionalUuid, sede: uuid,
  nombre: z.string().trim().min(1).max(40),
  capacidad: z.union([z.literal(""), z.coerce.number().int().min(1).max(500)]),
  activa: z.boolean(),
});

export async function guardarAula(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("oferta_publica", "editar");
  const r = esquemaAula.safeParse({
    id: texto(formData, "id"), sede: texto(formData, "sede"), nombre: texto(formData, "nombre"),
    capacidad: texto(formData, "capacidad"), activa: texto(formData, "id") ? marcado(formData, "activa") : true,
  });
  if (!r.success) return fallo("Completá el nombre del aula; la capacidad es opcional.");
  const { id, sede, ...d } = r.data;
  const fila = { ...d, capacidad: d.capacidad === "" ? null : d.capacidad };
  const supabase = await crearClienteServidor();
  return resolver(id ? supabase.from("aulas").update(fila).eq("id", id) : supabase.from("aulas").insert({ ...fila, sede_id: sede }),
    id ? "Aula actualizada." : `Aula “${d.nombre}” creada.`);
}

const esquemaSede = z.object({ id: uuid, nombre: z.string().trim().min(2).max(80), direccion: z.string().trim().max(200) });

export async function guardarSede(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("roles_y_configuracion", "editar"); // la sede la cambia dirección
  const r = esquemaSede.safeParse({ id: texto(formData, "id"), nombre: texto(formData, "nombre"), direccion: texto(formData, "direccion") });
  if (!r.success) return fallo("Completá el nombre de la sede.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("sedes").update({ nombre: r.data.nombre, direccion: r.data.direccion || null }).eq("id", r.data.id), "Sede actualizada.");
}
