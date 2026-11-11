"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { marcarLeida, type Resultado } from "@/app/panel/acciones";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

const esquema = z.object({
  tipo: z.enum(["comision", "institucional"]), // sin avisos individuales en esta versión
  categoria: z.enum(["general", "academica", "economica"]),
  comision: z.union([z.literal(""), uuid]),
  asunto: z.string().trim().min(1).max(150),
  cuerpo: z.string().trim().min(1).max(4000),
});

function mensajeEnvio(n: number) {
  if (n === 0) return "El aviso quedó registrado, pero no había destinatarios: no hay inscripciones activas que correspondan.";
  return `Aviso enviado. Llegó al panel de ${n} ${n === 1 ? "persona" : "personas"}.`;
}

function errorEnvio(error: { message?: string }) {
  return /SIN_DESTINATARIOS/.test(error.message ?? "") ? "El aviso no tiene destinatarios." : mensajeDeError(error);
}

/** Guarda el aviso como borrador y lo envía. La base vuelve a validar el alcance. */
export async function enviarAviso(datos: unknown): Promise<Resultado> {
  const sesion = await exigirPermiso("avisos", "crear");
  const r = esquema.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Completá el asunto (hasta 150 caracteres) y el mensaje (hasta 4000)." };
  const d = r.data;
  if (d.tipo === "comision" && !d.comision) return { ok: false, mensaje: "Elegí la comisión a la que va el aviso." };
  if (!esGestion(sesion.perfiles) && (d.tipo !== "comision" || d.categoria === "economica")) {
    return { ok: false, mensaje: "Como docente podés enviar avisos generales o académicos a tus comisiones." };
  }

  const supabase = await crearClienteServidor();
  const alta = await supabase.from("comunicaciones").insert({
    tipo: d.tipo, categoria: d.categoria, asunto: d.asunto, cuerpo: d.cuerpo,
    comision_id: d.tipo === "comision" ? d.comision : null,
    autor_cuenta_id: sesion.cuentaId, estado: "borrador",
  }).select("id").single();
  if (alta.error) return { ok: false, mensaje: mensajeDeError(alta.error) };

  const envio = await supabase.rpc("enviar_comunicacion", { p_comunicacion: alta.data.id });
  revalidatePath("/panel/avisos");
  if (envio.error) {
    return { ok: false, mensaje: `${errorEnvio(envio.error)} El aviso quedó guardado como borrador en «Enviados por mí»: desde ahí podés reintentar el envío, no hace falta escribirlo de nuevo.` };
  }
  revalidatePath("/panel");
  return { ok: true, mensaje: mensajeEnvio(Number(envio.data ?? 0)) };
}

/** Reintenta el envío de un borrador propio. Es idempotente: no duplica avisos. */
export async function reintentarEnvio(datos: unknown): Promise<Resultado> {
  await exigirPermiso("avisos", "crear");
  const r = z.object({ id: uuid }).safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "No encontramos ese aviso." };
  const supabase = await crearClienteServidor();
  const envio = await supabase.rpc("enviar_comunicacion", { p_comunicacion: r.data.id });
  if (envio.error) return { ok: false, mensaje: errorEnvio(envio.error) };
  revalidatePath("/panel/avisos");
  revalidatePath("/panel");
  return { ok: true, mensaje: mensajeEnvio(Number(envio.data ?? 0)) };
}

export async function marcarAvisoLeido(formData: FormData): Promise<void> {
  await exigirPermiso("avisos", "ver");
  await marcarLeida(formData);
  revalidatePath("/panel/avisos");
}
