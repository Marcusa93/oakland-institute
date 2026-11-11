"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { errorCampus } from "@/app/panel/actividades/errores";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

export async function revisarAlertas(): Promise<Resultado> {
  await exigirPermiso("alertas", "ver");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("revisar_alertas");
  if (error) return { ok: false, mensaje: errorCampus(error) };
  revalidatePath("/panel/alertas");
  const n = Number(data ?? 0);
  return {
    ok: true,
    mensaje: n === 0
      ? "Revisión completa: no encontramos situaciones para alertar. ¡Bien!"
      : `Revisión completa: ${n} ${n === 1 ? "situación activa" : "situaciones activas"} esta semana (las alertas que ya existían no se duplican).`,
  };
}

const esquemaEstado = z.object({
  id: uuid,
  estado: z.enum(["abierta", "en_seguimiento", "resuelta"]),
  nota: z.string().trim().max(1000),
});

export async function actualizarAlerta(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("alertas", "editar");
  const r = esquemaEstado.safeParse({ id: formData.get("id"), estado: formData.get("estado"), nota: String(formData.get("nota") ?? "") });
  if (!r.success) return { ok: false, mensaje: "Revisá el estado y la nota (hasta 1000 caracteres)." };
  if (r.data.estado === "resuelta" && !r.data.nota) return { ok: false, mensaje: "Contá brevemente cómo se resolvió." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("alertas").update({
    estado: r.data.estado, nota: r.data.nota || null, actualizada_por: sesion.cuentaId, actualizada_en: new Date().toISOString(),
  }).eq("id", r.data.id).select("id");
  if (error) return { ok: false, mensaje: errorCampus(error) };
  if (!data?.length) return { ok: false, mensaje: "No tenés permiso para cambiar esta alerta." };
  revalidatePath("/panel/alertas");
  return { ok: true, mensaje: r.data.estado === "resuelta" ? "Alerta resuelta." : r.data.estado === "en_seguimiento" ? "Alerta en seguimiento." : "Alerta reabierta." };
}

const esquemaAviso = z.object({
  alerta: uuid,
  asunto: z.string().trim().min(1).max(150),
  cuerpo: z.string().trim().min(1).max(4000),
  destinatarios: z.array(uuid).min(1).max(10),
});

/**
 * Aviso individual académico a los responsables verificados del estudiante.
 * Gestión y el docente del estudiante: los responsables salen de
 * responsables_academicos(), que la base filtra por esos dos roles.
 */
export async function avisarFamilia(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("avisos", "crear");
  if (!esGestion(sesion.perfiles) && !sesion.perfiles.includes("docente")) return { ok: false, mensaje: "No tenés permiso para avisar a la familia." };
  const r = esquemaAviso.safeParse({
    alerta: formData.get("alerta"), asunto: formData.get("asunto"), cuerpo: formData.get("cuerpo"),
    destinatarios: formData.getAll("destinatario").map(String),
  });
  if (!r.success) return { ok: false, mensaje: "Elegí al menos un destinatario y completá asunto y mensaje." };
  const d = r.data;

  const supabase = await crearClienteServidor();
  const alertaR = await supabase.from("alertas").select("id, estado, nota, estudiante_id, comision_id").eq("id", d.alerta).maybeSingle();
  if (alertaR.error || !alertaR.data) return { ok: false, mensaje: "No encontramos esa alerta." };
  const alerta = alertaR.data as { id: string; estado: string; nota: string | null; estudiante_id: string; comision_id: string };

  // Los destinatarios tienen que ser responsables académicos verificados de ESTE estudiante.
  const vinculosR = await supabase.rpc("responsables_academicos", { p_estudiante: alerta.estudiante_id });
  const validos = new Set(((vinculosR.data ?? []) as { persona_id: string }[]).map((v) => v.persona_id));
  if (vinculosR.error || d.destinatarios.some((p) => !validos.has(p))) {
    return { ok: false, mensaje: "Algún destinatario ya no es responsable académico verificado del estudiante." };
  }

  const alta = await supabase.from("comunicaciones").insert({
    tipo: "individual", categoria: "academica", asunto: d.asunto, cuerpo: d.cuerpo,
    comision_id: alerta.comision_id, autor_cuenta_id: sesion.cuentaId, estado: "borrador",
  }).select("id").single();
  if (alta.error) return { ok: false, mensaje: errorCampus(alta.error) };
  const envio = await supabase.rpc("enviar_comunicacion", { p_comunicacion: alta.data.id, p_destinatarios: d.destinatarios });
  if (envio.error) {
    revalidatePath("/panel/avisos");
    return { ok: false, mensaje: `${errorCampus(envio.error)} El aviso quedó como borrador en Avisos: podés reintentar desde ahí.` };
  }

  const fechaHoy = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Tucuman", day: "2-digit", month: "2-digit" }).format(new Date());
  const registro = `Aviso a la familia enviado el ${fechaHoy}.`;
  await supabase.from("alertas").update({
    estado: alerta.estado === "abierta" ? "en_seguimiento" : alerta.estado,
    nota: alerta.nota ? `${alerta.nota}\n${registro}` : registro,
    actualizada_por: sesion.cuentaId, actualizada_en: new Date().toISOString(),
  }).eq("id", alerta.id);

  revalidatePath("/panel/alertas");
  revalidatePath("/panel/avisos");
  const n = Number(envio.data ?? 0);
  return { ok: true, mensaje: `Aviso enviado a ${n} ${n === 1 ? "responsable" : "responsables"}. La alerta pasó a seguimiento.` };
}
