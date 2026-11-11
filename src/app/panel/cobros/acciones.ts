"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { hoyISO, normalizarImporte } from "@/lib/formato";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { aCentavos } from "./dinero";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const motivo = z.string().trim().min(5).max(300);
const RUTAS = ["/panel/cobros", "/panel/cuenta", "/panel/tablero", "/panel"];

/** Códigos de las funciones de cobros que el traductor general todavía no conoce. */
function mensaje(error: { message?: string }): string {
  const m = error.message ?? "";
  if (/DIA_INVALIDO/.test(m)) return "El día de vencimiento tiene que estar entre 1 y 28.";
  if (/IMPORTE_INVALIDO|_importe_check|importe_original_check/.test(m)) return "El importe tiene que ser mayor a cero.";
  if (/MEDIO_INVALIDO/.test(m)) return "Ese medio de pago no se puede registrar a mano.";
  if (/NO_ENCONTRADO/.test(m)) return "No encontramos ese registro. Actualizá la página.";
  return mensajeDeError(error);
}

function listo(texto: string): Resultado {
  for (const r of RUTAS) revalidatePath(r);
  return { ok: true, mensaje: texto };
}

const texto = (formData: FormData, clave: string) => String(formData.get(clave) ?? "");

/** Importe escrito por la persona ("45.000,50") → decimal con punto y mayor a cero, o null. */
function importePositivo(valor: string): string | null {
  const n = normalizarImporte(valor);
  return n && aCentavos(n) > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Validar una transferencia informada
// ---------------------------------------------------------------------------
const esquemaValidar = z.object({ pago: uuid, decision: z.enum(["aprobar", "rechazar"]), motivo: z.string().trim().max(300) });

export async function validarPago(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = esquemaValidar.safeParse({ pago: texto(formData, "pago"), decision: texto(formData, "decision"), motivo: texto(formData, "motivo") });
  if (!r.success) return { ok: false, mensaje: "Revisá los datos e intentá de nuevo." };
  const d = r.data;
  if (d.decision === "rechazar" && d.motivo.length < 5) return { ok: false, mensaje: "Para rechazar, indicá el motivo (al menos 5 caracteres). La familia lo va a ver." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("validar_pago", {
    p_pago: d.pago, p_aprobar: d.decision === "aprobar", p_motivo: d.decision === "rechazar" ? d.motivo : null,
  });
  if (error) return { ok: false, mensaje: mensaje(error) };
  return listo(d.decision === "aprobar"
    ? "Acreditación confirmada. El pago quedó como saldo a favor: imputalo a las obligaciones que correspondan."
    : "Pago rechazado. La familia va a ver el motivo.");
}

// ---------------------------------------------------------------------------
// Registrar un cobro (efectivo o transferencia) con sus imputaciones
// ---------------------------------------------------------------------------
const esquemaCobro = z.object({
  persona: uuid,
  medio: z.enum(["efectivo", "transferencia"]),
  fecha: z.iso.date(),
  nota: z.string().trim().max(300),
  confirmar: z.boolean(),
});

export async function registrarCobro(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = esquemaCobro.safeParse({
    persona: texto(formData, "persona"), medio: texto(formData, "medio"), fecha: texto(formData, "fecha"),
    nota: texto(formData, "nota"), confirmar: formData.get("confirmar") === "on",
  });
  if (!r.success) return { ok: false, mensaje: "Revisá el medio de pago y la fecha." };
  const d = r.data;
  if (d.fecha > hoyISO()) return { ok: false, mensaje: "La fecha no puede ser posterior a hoy." };
  const importe = importePositivo(texto(formData, "importe"));
  if (!importe) return { ok: false, mensaje: "Escribí el importe del pago. Ejemplo: 45.000,50" };

  const imputaciones: Array<{ obligacion_id: string; importe: string }> = [];
  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith("imp_") || !String(valor).trim()) continue;
    const obligacion = uuid.safeParse(clave.slice(4));
    const parte = normalizarImporte(String(valor));
    if (!obligacion.success || !parte) return { ok: false, mensaje: "Revisá los importes a imputar. Ejemplo: 45.000,50" };
    if (aCentavos(parte) > 0) imputaciones.push({ obligacion_id: obligacion.data, importe: parte });
  }
  if (imputaciones.length > 0 && !d.confirmar) {
    return { ok: false, mensaje: "Un pago sin acreditación verificada no se imputa. Marcá la acreditación o dejá los importes a imputar vacíos." };
  }
  const imputado = imputaciones.reduce((total, i) => total + aCentavos(i.importe), 0);
  if (imputado > aCentavos(importe)) return { ok: false, mensaje: "La suma imputada supera el importe del pago." };

  const supabase = await crearClienteServidor();
  // Una sola transacción: si una imputación falla, el pago tampoco se registra.
  const { error } = await supabase.rpc("registrar_pago", {
    p_pagador: d.persona, p_medio: d.medio, p_importe: importe, p_fecha: d.fecha,
    p_confirmar: d.confirmar, p_imputaciones: imputaciones, p_nota: d.nota || null,
  });
  if (error) return { ok: false, mensaje: mensaje(error) };
  if (!d.confirmar) return listo("Pago registrado como informado. Falta verificar la acreditación para poder imputarlo.");
  return listo(imputado === aCentavos(importe)
    ? "Cobro registrado e imputado."
    : imputado === 0
      ? "Cobro registrado. Quedó completo como saldo a favor, sin imputar."
      : "Cobro registrado. La parte sin imputar quedó como saldo a favor.");
}

// ---------------------------------------------------------------------------
// Operaciones sobre un pago confirmado
// ---------------------------------------------------------------------------
export async function imputarSaldo(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = z.object({ pago: uuid, obligacion: uuid }).safeParse({ pago: texto(formData, "pago"), obligacion: texto(formData, "obligacion") });
  if (!r.success) return { ok: false, mensaje: "Elegí a qué obligación imputar." };
  const importe = importePositivo(texto(formData, "importe"));
  if (!importe) return { ok: false, mensaje: "Escribí el importe a imputar. Ejemplo: 45.000,50" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("imputar_pago", { p_pago: r.data.pago, p_obligacion: r.data.obligacion, p_importe: importe });
  if (error) return { ok: false, mensaje: mensaje(error) };
  return listo("Saldo a favor imputado.");
}

export async function reversarPago(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = z.object({ pago: uuid, motivo }).safeParse({ pago: texto(formData, "pago"), motivo: texto(formData, "motivo") });
  if (!r.success) return { ok: false, mensaje: "Indicá el motivo del reverso (al menos 5 caracteres)." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("reversar_pago", { p_pago: r.data.pago, p_motivo: r.data.motivo });
  if (error) return { ok: false, mensaje: mensaje(error) };
  return listo("Pago reversado. Sus imputaciones se anularon y las obligaciones recuperaron su saldo.");
}

export async function registrarDevolucion(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = z.object({ pago: uuid, motivo }).safeParse({ pago: texto(formData, "pago"), motivo: texto(formData, "motivo") });
  if (!r.success) return { ok: false, mensaje: "Indicá el motivo de la devolución (al menos 5 caracteres)." };
  const importe = importePositivo(texto(formData, "importe"));
  if (!importe) return { ok: false, mensaje: "Escribí el importe devuelto. Ejemplo: 5.000" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_devolucion", { p_pago: r.data.pago, p_importe: importe, p_motivo: r.data.motivo });
  if (error) return { ok: false, mensaje: mensaje(error) };
  return listo("Devolución registrada.");
}

// ---------------------------------------------------------------------------
// Obligaciones
// ---------------------------------------------------------------------------
const esquemaCuotas = z.object({ periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), dia: z.coerce.number().int().min(1).max(28) });

export async function generarCuotas(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = esquemaCuotas.safeParse({ periodo: texto(formData, "periodo"), dia: texto(formData, "dia") });
  if (!r.success) return { ok: false, mensaje: "Elegí el mes y un día de vencimiento entre 1 y 28." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("generar_cuotas", { p_periodo: `${r.data.periodo}-01`, p_dia_vencimiento: r.data.dia });
  if (error) return { ok: false, mensaje: mensaje(error) };
  const n = Number(data ?? 0);
  const [anio, mes] = r.data.periodo.split("-");
  return listo(n === 0
    ? `No había cuotas nuevas para generar en ${mes}/${anio}: las de ese mes ya estaban generadas o no hay inscripciones activas con arancel vigente.`
    : n === 1 ? `Se generó 1 cuota nueva de ${mes}/${anio}.` : `Se generaron ${n} cuotas nuevas de ${mes}/${anio}.`);
}

const esquemaObligacion = z.object({
  persona: uuid, estudiante: uuid, concepto: uuid,
  descripcion: z.string().trim().min(3).max(200),
  vencimiento: z.iso.date(),
});

export async function crearObligacion(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = esquemaObligacion.safeParse({
    persona: texto(formData, "persona"), estudiante: texto(formData, "estudiante"), concepto: texto(formData, "concepto"),
    descripcion: texto(formData, "descripcion"), vencimiento: texto(formData, "vencimiento"),
  });
  if (!r.success) return { ok: false, mensaje: "Completá estudiante, concepto, descripción y vencimiento." };
  const importe = importePositivo(texto(formData, "importe"));
  if (!importe) return { ok: false, mensaje: "Escribí el importe. Ejemplo: 45.000,50" };
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("crear_obligacion", {
    p_estudiante: d.estudiante, p_responsable_pago: d.persona, p_concepto: d.concepto,
    p_descripcion: d.descripcion, p_importe: importe, p_vencimiento: d.vencimiento,
  });
  if (error) return { ok: false, mensaje: mensaje(error) };
  return listo("Obligación creada.");
}

export async function anularObligacion(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const r = z.object({ obligacion: uuid, motivo }).safeParse({ obligacion: texto(formData, "obligacion"), motivo: texto(formData, "motivo") });
  if (!r.success) return { ok: false, mensaje: "Elegí la obligación e indicá el motivo (al menos 5 caracteres)." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_obligacion", { p_obligacion: r.data.obligacion, p_motivo: r.data.motivo });
  if (error) return { ok: false, mensaje: mensaje(error) };
  return listo("Obligación anulada. Queda registrada con su motivo.");
}
