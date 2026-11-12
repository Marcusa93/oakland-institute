"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { CLAVES_SITIO, esquemasSitio } from "@/lib/sitio";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const NOMBRE: Record<(typeof CLAVES_SITIO)[number], string> = {
  portada: "Portada", grupos: "Grupos por edad", diferenciales: "Diferenciales", propuestas: "Propuestas", pasos: "Pasos", preguntas: "Preguntas frecuentes", contacto: "Contacto", anuncio: "Anuncio", certificaciones: "Certificaciones",
};

/** Publica una sección de la landing (upsert en sitio_contenido). La base exige gestión. */
export async function publicarSeccion(clave: string, valor: unknown): Promise<Resultado> {
  const sesion = await exigirPermiso("sitio", "editar");
  const c = z.enum(CLAVES_SITIO).safeParse(clave);
  if (!c.success) return { ok: false, mensaje: "Sección desconocida." };
  const r = esquemasSitio[c.data].safeParse(valor);
  if (!r.success) {
    const primero = r.error.issues[0];
    const propio = primero && !/^(Invalid|Too|Expected)/.test(primero.message) ? primero.message : null;
    return { ok: false, mensaje: propio ?? "Revisá los campos: hay textos vacíos o demasiado largos." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("sitio_contenido").upsert(
    { clave: c.data, valor: r.data, actualizado_por: sesion.cuentaId, actualizado_en: new Date().toISOString() },
    { onConflict: "clave" },
  );
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  revalidatePath("/");
  revalidatePath("/panel/sitio");
  return { ok: true, mensaje: `Listo: se publicó la sección «${NOMBRE[c.data]}» en el sitio.` };
}
