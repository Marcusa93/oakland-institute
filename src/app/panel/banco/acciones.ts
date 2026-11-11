"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { CLAVES_HABILIDAD, normalizar } from "@/app/panel/practica/comun";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const lineas = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const palabras = (s: string) => normalizar(s).split(" ").filter(Boolean).sort().join(" ");

const esquema = z.object({
  id: z.union([z.literal(""), uuid]),
  habilidad: z.enum(CLAVES_HABILIDAD),
  tipo: z.enum(["opcion", "completar", "ordenar", "escuchar"]),
  nivel_id: z.union([z.literal(""), uuid]),
  dificultad: z.coerce.number().int().min(1).max(3),
  enunciado: z.string().trim().min(3).max(1500),
  opciones: z.array(z.string().max(120)).max(12),
  respuesta: z.string().trim().min(1).max(300),
  explicacion: z.string().trim().max(600),
  audio_texto: z.string().trim().max(600),
  revisar: z.boolean(),
}).superRefine((d, ctx) => {
  const falla = (message: string) => ctx.addIssue({ code: "custom", message });
  if (d.tipo === "opcion" || d.tipo === "escuchar") {
    if (d.opciones.length < 2 || d.opciones.length > 6) falla("Cargá entre 2 y 6 opciones, una por línea.");
    else if (!d.opciones.some((o) => normalizar(o) === normalizar(d.respuesta))) falla("La respuesta tiene que ser una de las opciones.");
    if (new Set(d.opciones.map(normalizar)).size !== d.opciones.length) falla("Hay opciones repetidas.");
  }
  if (d.tipo === "escuchar" && !d.audio_texto) falla("Escribí el texto que se va a escuchar.");
  if (d.tipo === "ordenar") {
    if (d.opciones.length < 2) falla("Cargá las fichas (palabras), una por línea.");
    else if (palabras(d.opciones.join(" ")) !== palabras(d.respuesta)) falla("Las fichas tienen que ser exactamente las palabras de la respuesta.");
  }
});

const MENSAJE_CAMPO: Record<string, string> = {
  enunciado: "El enunciado debe tener entre 3 y 1500 caracteres.",
  respuesta: "Indicá la respuesta correcta (hasta 300 caracteres).",
  opciones: "Hasta 12 opciones o fichas, de 120 caracteres cada una.",
  explicacion: "La explicación tiene hasta 600 caracteres.",
  audio_texto: "El texto para escuchar tiene hasta 600 caracteres.",
  dificultad: "La dificultad va de 1 a 3.",
};

export async function guardarEjercicio(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("practica", "editar");
  const t = (k: string) => String(formData.get(k) ?? "");
  const r = esquema.safeParse({
    id: t("id"), habilidad: t("habilidad"), tipo: t("tipo"), nivel_id: t("nivel_id"), dificultad: t("dificultad"),
    enunciado: t("enunciado").replace(/\r\n/g, "\n"), opciones: lineas(t("opciones")), respuesta: t("respuesta"),
    explicacion: t("explicacion"), audio_texto: t("audio_texto"), revisar: t("revisar") === "si",
  });
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, mensaje: i?.code === "custom" ? i.message : MENSAJE_CAMPO[String(i?.path[0])] ?? "Revisá los datos del ejercicio." };
  }
  const d = r.data;

  // Al editar, un ejercicio vuelve a borrador salvo que quien lo guarda lo marque como revisado.
  const fila = {
    habilidad: d.habilidad, tipo: d.tipo, nivel_id: d.nivel_id || null, dificultad: d.dificultad,
    enunciado: d.enunciado, opciones: d.tipo === "completar" && d.opciones.length === 0 ? [] : d.opciones,
    respuesta: d.respuesta, explicacion: d.explicacion || null, audio_texto: d.audio_texto || null,
    estado: d.revisar ? "revisado" : "borrador",
    revisado_por: d.revisar ? sesion.cuentaId : null,
    revisado_en: d.revisar ? new Date().toISOString() : null,
  };
  const supabase = await crearClienteServidor();
  const res = d.id
    ? await supabase.from("ejercicios").update(fila).eq("id", d.id).select("id")
    : await supabase.from("ejercicios").insert({ ...fila, creado_por: sesion.cuentaId }).select("id");
  if (res.error) return { ok: false, mensaje: mensajeDeError(res.error) };
  if (!res.data?.length) return { ok: false, mensaje: "No tenés permiso para modificar ese ejercicio." };
  revalidatePath("/panel/banco");
  return {
    ok: true,
    mensaje: d.revisar ? "Guardado y revisado: ya aparece en las lecciones." : "Guardado como borrador. Los estudiantes lo ven cuando alguien lo revisa.",
  };
}

export async function cambiarEstado(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("practica", "editar");
  const r = z.object({ id: uuid, estado: z.enum(["borrador", "revisado", "retirado"]) })
    .safeParse({ id: formData.get("id"), estado: formData.get("estado") });
  if (!r.success) return { ok: false, mensaje: "No pudimos identificar el ejercicio." };
  const cambio = r.data.estado === "revisado"
    ? { estado: "revisado", revisado_por: sesion.cuentaId, revisado_en: new Date().toISOString() }
    : r.data.estado === "borrador"
      ? { estado: "borrador", revisado_por: null, revisado_en: null }
      : { estado: "retirado" };
  const supabase = await crearClienteServidor();
  const res = await supabase.from("ejercicios").update(cambio).eq("id", r.data.id).select("id");
  if (res.error) return { ok: false, mensaje: mensajeDeError(res.error) };
  if (!res.data?.length) return { ok: false, mensaje: "No tenés permiso para modificar ese ejercicio." };
  revalidatePath("/panel/banco");
  return {
    ok: true,
    mensaje: r.data.estado === "revisado" ? "Marcado como revisado." : r.data.estado === "retirado" ? "Retirado: ya no aparece en las lecciones." : "Volvió a borrador.",
  };
}
