"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { hoyISO, normalizarImporte } from "@/lib/formato";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { aCentavos } from "../cobros/dinero";
import { MENSAJE_TAMANO, MENSAJE_TIPO, TAMANO_MAXIMO, TIPOS_COMPROBANTE } from "./comprobantes";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

export type Preparado = { ok: true; documentoId: string; ruta: string; token: string } | { ok: false; mensaje: string };

const esquemaArchivo = z.object({
  nombre: z.string().trim().min(1).max(200),
  tipo: z.string().max(100),
  tamano: z.number().int().positive(),
});

/**
 * Paso previo a subir un comprobante: crea la fila en `documentos` con la
 * sesión de la persona (la RLS solo le permite un comprobante de pago propio)
 * y recién después emite la URL firmada de subida para esa ruta exacta.
 */
export async function prepararComprobante(archivo: { nombre: string; tipo: string; tamano: number }): Promise<Preparado> {
  const sesion = await exigirPermiso("cuenta_corriente", "crear");
  const r = esquemaArchivo.safeParse(archivo);
  if (!r.success) return { ok: false, mensaje: "No pudimos leer el archivo. Elegilo de nuevo." };
  const extension = TIPOS_COMPROBANTE[r.data.tipo];
  if (!extension) return { ok: false, mensaje: MENSAJE_TIPO };
  if (r.data.tamano > TAMANO_MAXIMO) return { ok: false, mensaje: MENSAJE_TAMANO };
  if (!process.env.SUPABASE_SECRET_KEY) {
    return { ok: false, mensaje: "Por ahora no se pueden adjuntar comprobantes. Quitá el archivo e informá la transferencia sin adjunto." };
  }

  const ruta = `comprobantes/${sesion.personaId}/${randomUUID()}.${extension}`;
  const supabase = await crearClienteServidor();
  const { data: documento, error } = await supabase.from("documentos").insert({
    tipo: "comprobante_pago", nombre: r.data.nombre, persona_id: sesion.personaId, subido_por: sesion.cuentaId,
    ruta, tamano_bytes: r.data.tamano, tipo_mime: r.data.tipo,
  }).select("id").single();
  if (error || !documento) return { ok: false, mensaje: mensajeDeError(error) };

  const firmada = await crearClienteAdmin().storage.from("documentos").createSignedUploadUrl(ruta);
  if (firmada.error || !firmada.data) {
    return { ok: false, mensaje: "No pudimos preparar la subida del comprobante. Probá de nuevo o informá la transferencia sin adjunto." };
  }
  return { ok: true, documentoId: documento.id as string, ruta, token: firmada.data.token };
}

const esquemaTransferencia = z.object({
  fecha: z.iso.date(),
  nota: z.string().trim().max(300),
  documento: z.union([z.literal(""), uuid]),
});

/** Queda «Informado»: no es un pago confirmado hasta que gestión verifique la acreditación. */
export async function informarTransferencia(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "crear");
  const t = (k: string) => String(formData.get(k) ?? "");
  const r = esquemaTransferencia.safeParse({ fecha: t("fecha"), nota: t("nota"), documento: t("documento") });
  if (!r.success) return { ok: false, mensaje: "Revisá la fecha de la transferencia." };
  if (r.data.fecha > hoyISO()) return { ok: false, mensaje: "La fecha no puede ser posterior a hoy." };
  const importe = normalizarImporte(t("importe"));
  if (!importe || aCentavos(importe) <= 0) return { ok: false, mensaje: "Escribí el importe que transferiste. Ejemplo: 45.000,50" };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("informar_transferencia", {
    p_importe: importe, p_fecha: r.data.fecha, p_comprobante: r.data.documento || null, p_nota: r.data.nota || null,
  });
  if (error) {
    return { ok: false, mensaje: /COMPROBANTE_INVALIDO/.test(error.message ?? "") ? "No pudimos asociar el comprobante. Volvé a adjuntarlo." : mensajeDeError(error) };
  }
  for (const ruta of ["/panel/cuenta", "/panel/cobros", "/panel"]) revalidatePath(ruta);
  return {
    ok: true,
    mensaje: r.data.documento
      ? "Transferencia informada con su comprobante. Queda en verificación hasta que administración confirme la acreditación."
      : "Transferencia informada. Queda en verificación hasta que administración confirme la acreditación.",
  };
}
