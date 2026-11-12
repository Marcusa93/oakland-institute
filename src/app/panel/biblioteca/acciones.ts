"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { exigirPermiso, exigirSesion, mensajeDeError } from "@/lib/sesion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const opcional = (max: number) => z.string().trim().max(max).transform((t) => t || null);
const MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;

const esquemaNuevo = z.object({
  titulo: z.string().trim().min(3).max(160),
  descripcion: opcional(500),
  nivel: opcional(60),
  texto: z.string().max(200000).transform((t) => t.trim() || null),
  origen: z.enum(["pdf", "ocr", "docx", "manual"]),
  paginas: z.number().int().min(1).max(300).nullable(),
  archivo: z.object({
    nombre: z.string().trim().min(1).max(200),
    mime: z.enum(MIMES),
    bytes: z.number().int().min(1).max(26214400),
    extension: z.enum(["pdf", "jpg", "png", "webp", "docx"]),
  }).nullable(),
  comisiones: z.array(uuid).max(30),
});

export type NuevoMaterial =
  | { ok: true; id: string; subida: { url: string; ruta: string } | null }
  | { ok: false; mensaje: string };

/**
 * Da de alta el material con su texto ya revisado y, si trae archivo,
 * prepara la subida directa del navegador al almacenamiento (la ruta la
 * decide la base). El archivo se vincula después con `confirmarArchivo`.
 */
export async function crearMaterial(datos: unknown): Promise<NuevoMaterial> {
  await exigirPermiso("biblioteca", "crear");
  const r = esquemaNuevo.safeParse(datos);
  if (!r.success) {
    const campo = r.error.issues[0]?.path[0];
    return { ok: false, mensaje: campo === "titulo" ? "Poné un título de al menos 3 letras." : "Revisá los datos del material." };
  }
  const d = r.data;
  if (!d.archivo && !d.texto) return { ok: false, mensaje: "Subí un archivo o escribí el texto del material." };
  const supabase = await crearClienteServidor();
  const { data: fila, error } = await supabase.from("materiales").insert({
    titulo: d.titulo, descripcion: d.descripcion, nivel: d.nivel, paginas: d.paginas,
    texto: d.texto, texto_origen: d.texto ? d.origen : null,
  }).select("id").single();
  if (error || !fila) return { ok: false, mensaje: mensajeDeError(error) };

  if (d.comisiones.length) {
    const { error: e } = await supabase.from("material_comisiones").insert(d.comisiones.map((c) => ({ material_id: fila.id, comision_id: c })));
    if (e) return { ok: false, mensaje: `El material quedó guardado, pero no se pudo compartir: ${mensajeDeError(e)}` };
  }

  let subida: { url: string; ruta: string } | null = null;
  if (d.archivo) {
    const { data: ruta, error: e } = await supabase.rpc("ruta_material", { p_material: fila.id, p_extension: d.archivo.extension });
    if (e || typeof ruta !== "string") return { ok: false, mensaje: mensajeDeError(e) };
    const firmada = await crearClienteAdmin().storage.from("biblioteca").createSignedUploadUrl(ruta);
    if (firmada.error || !firmada.data) return { ok: false, mensaje: "El material quedó guardado, pero no pudimos preparar la subida del archivo." };
    subida = { url: firmada.data.signedUrl, ruta };
  }
  revalidatePath("/panel/biblioteca");
  return { ok: true, id: fila.id, subida };
}

const esquemaArchivo = z.object({
  id: uuid,
  ruta: z.string().max(200),
  nombre: z.string().trim().min(1).max(200),
  mime: z.enum(MIMES),
  bytes: z.number().int().min(1).max(26214400),
});

/** Vincula el archivo ya subido. La base verifica que exista y sea de este material. */
export async function confirmarArchivo(datos: unknown): Promise<Resultado> {
  await exigirPermiso("biblioteca", "crear");
  const r = esquemaArchivo.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "No pudimos vincular el archivo." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("materiales").update({
    archivo_ruta: r.data.ruta, archivo_nombre: r.data.nombre, archivo_mime: r.data.mime, archivo_bytes: r.data.bytes,
  }).eq("id", r.data.id);
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  revalidatePath("/panel/biblioteca");
  return { ok: true, mensaje: "Material guardado." };
}

const esquemaEdicion = z.object({
  id: uuid,
  titulo: z.string().trim().min(3).max(160),
  descripcion: opcional(500),
  nivel: opcional(60),
  texto: z.string().max(200000).transform((t) => t.trim() || null),
});

export async function guardarMaterial(_: Resultado | null, formulario: FormData): Promise<Resultado> {
  await exigirPermiso("biblioteca", "crear");
  const r = esquemaEdicion.safeParse(Object.fromEntries(formulario));
  if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.path[0] === "titulo" ? "Poné un título de al menos 3 letras." : "Revisá los datos." };
  const supabase = await crearClienteServidor();
  const { data: actual } = await supabase.from("materiales").select("texto, texto_origen").eq("id", r.data.id).maybeSingle();
  const cambioTexto = (actual?.texto ?? null) !== r.data.texto;
  const { data, error } = await supabase.from("materiales").update({
    titulo: r.data.titulo, descripcion: r.data.descripcion, nivel: r.data.nivel,
    ...(cambioTexto ? { texto: r.data.texto, texto_origen: r.data.texto ? (actual?.texto_origen ?? "manual") : null } : {}),
  }).eq("id", r.data.id).select("id");
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  if (!data?.length) return { ok: false, mensaje: "Solo quien cargó el material (o administración) puede editarlo." };
  revalidatePath(`/panel/biblioteca/${r.data.id}`);
  revalidatePath("/panel/biblioteca");
  return { ok: true, mensaje: "Cambios guardados." };
}

const esquemaCompartir = z.object({ material: uuid, comision: uuid, compartir: z.enum(["si", "no"]) });

export async function compartirMaterial(_: Resultado | null, formulario: FormData): Promise<Resultado> {
  await exigirPermiso("biblioteca", "crear");
  const r = esquemaCompartir.safeParse(Object.fromEntries(formulario));
  if (!r.success) return { ok: false, mensaje: "Elegí una comisión." };
  const supabase = await crearClienteServidor();
  const { material, comision, compartir } = r.data;
  const { error } = compartir === "si"
    ? await supabase.from("material_comisiones").upsert({ material_id: material, comision_id: comision }, { onConflict: "material_id,comision_id", ignoreDuplicates: true })
    : await supabase.from("material_comisiones").delete().eq("material_id", material).eq("comision_id", comision);
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  revalidatePath(`/panel/biblioteca/${material}`);
  return { ok: true, mensaje: compartir === "si" ? "Compartido: ya lo ven los estudiantes de la comisión." : "Dejó de estar compartido con esa comisión." };
}

export async function eliminarMaterial(formulario: FormData) {
  await exigirPermiso("biblioteca", "crear");
  const id = uuid.safeParse(formulario.get("material"));
  if (!id.success) redirect("/panel/biblioteca");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("materiales").delete().eq("id", id.data).select("archivo_ruta");
  // Si la base permitió borrar la fila, el archivo deja de tener dueño: se borra también.
  const ruta = data?.[0]?.archivo_ruta;
  if (ruta) await crearClienteAdmin().storage.from("biblioteca").remove([ruta]);
  revalidatePath("/panel/biblioteca");
  redirect(data?.length ? "/panel/biblioteca?aviso=eliminado" : `/panel/biblioteca/${id.data}?aviso=sin-permiso`);
}

/** El estudiante abrió el material (lo registra la base; para el resto no hace nada). */
export async function registrarLectura(material: string) {
  await exigirSesion();
  const id = uuid.safeParse(material);
  if (!id.success) return;
  const supabase = await crearClienteServidor();
  await supabase.rpc("registrar_lectura_material", { p_material: id.data });
}
