"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { errorCampus } from "@/app/panel/actividades/errores";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

const esquema = z.object({
  informe: z.union([z.literal(""), uuid]),
  estudiante: uuid,
  periodo: z.string().trim().min(2).max(80),
  desde: z.iso.date(),
  hasta: z.iso.date(),
  comentario: z.string().trim().max(6000),
  recomendaciones: z.string().trim().max(4000),
  destinatario: z.enum(["direccion", "familia"]),
  enviar: z.boolean(),
});

export async function guardarInforme(datos: unknown): Promise<Resultado & { id?: string }> {
  const sesion = await exigirPermiso("informes", "crear");
  const r = esquema.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Revisá el período (nombre y fechas) y que los textos no sean demasiado largos." };
  const d = r.data;
  if (d.hasta < d.desde) return { ok: false, mensaje: "La fecha final no puede ser anterior a la inicial." };
  if (d.enviar && !d.comentario) return { ok: false, mensaje: "Escribí un comentario antes de enviar el informe." };

  const supabase = await crearClienteServidor();
  // Los datos se recalculan en el servidor: no se confía en lo que muestra el navegador.
  const datosR = await supabase.rpc("datos_informe", { p_estudiante: d.estudiante, p_desde: d.desde, p_hasta: d.hasta });
  if (datosR.error) return { ok: false, mensaje: errorCampus(datosR.error) };

  const fila = {
    periodo: d.periodo, datos: datosR.data, comentario: d.comentario || null, recomendaciones: d.recomendaciones || null,
    destinatario: d.destinatario, estado: d.enviar ? "enviado" : "borrador", enviado_en: d.enviar ? new Date().toISOString() : null,
  };
  const res = d.informe
    ? await supabase.from("informes").update(fila).eq("id", d.informe).eq("estudiante_id", d.estudiante).select("id").maybeSingle()
    : await supabase.from("informes").insert({ ...fila, estudiante_id: d.estudiante, autor_cuenta_id: sesion.cuentaId }).select("id").single();
  if (res.error) return { ok: false, mensaje: errorCampus(res.error) };
  if (!res.data) return { ok: false, mensaje: "Ese informe ya fue enviado o no es tuyo: no se puede modificar." };
  revalidatePath("/panel/informes");
  revalidatePath(`/panel/informes/${res.data.id}`);
  if (d.enviar && d.destinatario === "familia") revalidatePath("/panel/familia");
  return {
    ok: true, id: res.data.id as string,
    mensaje: d.enviar ? (d.destinatario === "familia" ? "Informe enviado: la familia ya lo ve en Cursada." : "Informe enviado a dirección.") : "Borrador guardado.",
  };
}
