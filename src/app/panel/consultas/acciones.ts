"use server";

import { z } from "zod";
import { ejecutar, type Resultado } from "@/app/panel/acciones";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/i),
  estado: z.enum(["nueva", "contactada", "nivelacion", "solicitud", "ganada", "perdida"]),
  proxima_accion: z.string().trim().max(200),
  proxima_accion_en: z.union([z.literal(""), z.iso.date()]),
  motivo_perdida: z.string().trim().max(200),
  nota: z.string().trim().max(1000),
  tomar: z.boolean(),
});

export async function actualizarConsulta(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("consultas", "editar");
  const t = (k: string) => String(formData.get(k) ?? "");
  const r = esquema.safeParse({
    id: t("id"), estado: t("estado"), proxima_accion: t("proxima_accion"), proxima_accion_en: t("proxima_accion_en"),
    motivo_perdida: t("motivo_perdida"), nota: t("nota"), tomar: formData.get("tomar") === "on",
  });
  if (!r.success) return { ok: false, mensaje: "Revisá los datos del seguimiento." };
  const d = r.data;
  if (d.estado === "perdida" && !d.motivo_perdida) return { ok: false, mensaje: "Indicá por qué se perdió la consulta." };

  const supabase = await crearClienteServidor();
  return ejecutar(async () => {
    const cambio = await supabase.from("consultas").update({
      estado: d.estado,
      proxima_accion: d.proxima_accion || null,
      // Mediodía de Tucumán: la fecha elegida no se corre al convertir a UTC.
      proxima_accion_en: d.proxima_accion_en ? `${d.proxima_accion_en}T12:00:00-03:00` : null,
      motivo_perdida: d.estado === "perdida" ? d.motivo_perdida : null,
      ...(d.tomar ? { responsable_cuenta_id: sesion.cuentaId } : {}),
    }).eq("id", d.id);
    if (cambio.error || !d.nota) return cambio;
    return supabase.from("consulta_eventos").insert({ consulta_id: d.id, autor_cuenta_id: sesion.cuentaId, tipo: "nota", nota: d.nota });
  }, "Seguimiento guardado.", ["/panel/consultas", "/panel"]);
}
