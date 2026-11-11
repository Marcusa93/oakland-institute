"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Resultado } from "@/app/panel/acciones";
import { hoyISO, normalizarImporte } from "@/lib/formato";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { aCentavos } from "../cobros/dinero";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const opcional = z.union([z.literal(""), uuid]);
const motivo = z.string().trim().min(5).max(300);
const RUTAS = ["/panel/gastos", "/panel/tablero"];

const texto = (formData: FormData, clave: string) => String(formData.get(clave) ?? "");

function listo(mensaje: string): Resultado {
  for (const r of RUTAS) revalidatePath(r);
  return { ok: true, mensaje };
}

function importePositivo(valor: string): string | null {
  const n = normalizarImporte(valor);
  return n && aCentavos(n) > 0 ? n : null;
}

const esquemaGasto = z.object({
  fecha: z.iso.date(),
  categoria: uuid,
  proveedor: opcional,
  descripcion: z.string().trim().min(3).max(200),
  medio: z.enum(["efectivo", "transferencia"]),
  curso: opcional,
  comision: opcional,
});

export async function crearGasto(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("gastos", "crear");
  const r = esquemaGasto.safeParse({
    fecha: texto(formData, "fecha"), categoria: texto(formData, "categoria"), proveedor: texto(formData, "proveedor"),
    descripcion: texto(formData, "descripcion"), medio: texto(formData, "medio"), curso: texto(formData, "curso"), comision: texto(formData, "comision"),
  });
  if (!r.success) return { ok: false, mensaje: "Completá fecha, categoría y descripción del gasto." };
  const d = r.data;
  if (d.fecha > hoyISO()) return { ok: false, mensaje: "La fecha no puede ser posterior a hoy." };
  const importe = importePositivo(texto(formData, "importe"));
  if (!importe) return { ok: false, mensaje: "Escribí el importe. Ejemplo: 45.000,50" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("gastos").insert({
    fecha: d.fecha, categoria_id: d.categoria, proveedor_id: d.proveedor || null, descripcion: d.descripcion, importe, medio: d.medio,
    curso_id: d.curso || null, comision_id: d.comision || null, registrado_por: sesion.cuentaId,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  return listo("Gasto registrado.");
}

export async function crearCategoria(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("gastos", "crear");
  const r = z.string().trim().min(2).max(60).safeParse(texto(formData, "nombre"));
  if (!r.success) return { ok: false, mensaje: "Escribí el nombre de la categoría." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("categorias_gasto").insert({ nombre: r.data });
  if (error) {
    return { ok: false, mensaje: /categorias_gasto_nombre_key|duplicate/i.test(error.message ?? "") ? "Ya existe una categoría con ese nombre." : mensajeDeError(error) };
  }
  return listo("Categoría agregada. Ya la podés elegir al cargar un gasto.");
}

const esquemaProveedor = z.object({
  nombre: z.string().trim().min(2).max(120),
  cuit: z.string().trim().max(13).regex(/^(\d{2}-?\d{8}-?\d)?$/),
  contacto: z.string().trim().max(200),
});

export async function crearProveedor(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("gastos", "crear");
  const r = esquemaProveedor.safeParse({ nombre: texto(formData, "nombre"), cuit: texto(formData, "cuit"), contacto: texto(formData, "contacto") });
  if (!r.success) return { ok: false, mensaje: "Revisá el nombre y el CUIT (11 números, con o sin guiones)." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("proveedores").insert({ nombre: r.data.nombre, cuit: r.data.cuit || null, contacto: r.data.contacto || null });
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  return listo("Proveedor agregado. Ya lo podés elegir al cargar un gasto.");
}

/** Un gasto no se borra: se anula con motivo y deja de sumar en los totales. */
export async function anularGasto(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("gastos", "editar");
  const r = z.object({ id: uuid, motivo }).safeParse({ id: texto(formData, "id"), motivo: texto(formData, "motivo") });
  if (!r.success) return { ok: false, mensaje: "Indicá el motivo de la anulación (al menos 5 caracteres)." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("gastos")
    .update({ anulado_en: new Date().toISOString(), anulado_por: sesion.cuentaId, motivo_anulacion: r.data.motivo })
    .eq("id", r.data.id).is("anulado_en", null).select("id");
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  if ((data ?? []).length === 0) return { ok: false, mensaje: "Ese gasto ya estaba anulado o no existe. Actualizá la página." };
  return listo("Gasto anulado. Sigue en el listado, pero ya no suma.");
}

// ---------------------------------------------------------------------------
// Pagos a docentes (solo dirección). Registro interno, no liquidación de haberes.
// ---------------------------------------------------------------------------
const esquemaPagoDocente = z.object({
  docente: uuid,
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  fecha: z.iso.date(),
  comision: opcional,
  nota: z.string().trim().max(300),
});

export async function crearPagoDocente(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("pagos_docentes", "crear");
  const r = esquemaPagoDocente.safeParse({
    docente: texto(formData, "docente"), periodo: texto(formData, "periodo"), fecha: texto(formData, "fecha"),
    comision: texto(formData, "comision"), nota: texto(formData, "nota"),
  });
  if (!r.success) return { ok: false, mensaje: "Completá docente, mes al que corresponde y fecha de pago." };
  const d = r.data;
  if (d.fecha > hoyISO()) return { ok: false, mensaje: "La fecha no puede ser posterior a hoy." };
  const importe = importePositivo(texto(formData, "importe"));
  if (!importe) return { ok: false, mensaje: "Escribí el importe. Ejemplo: 45.000,50" };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("pagos_docentes").insert({
    docente_persona_id: d.docente, periodo: `${d.periodo}-01`, fecha_pago: d.fecha, importe,
    comision_id: d.comision || null, nota: d.nota || null, registrado_por: sesion.cuentaId,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  return listo("Pago a docente registrado.");
}

export async function anularPagoDocente(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("pagos_docentes", "editar");
  const r = z.object({ id: uuid, motivo }).safeParse({ id: texto(formData, "id"), motivo: texto(formData, "motivo") });
  if (!r.success) return { ok: false, mensaje: "Indicá el motivo de la anulación (al menos 5 caracteres)." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("pagos_docentes")
    .update({ anulado_en: new Date().toISOString(), motivo_anulacion: r.data.motivo })
    .eq("id", r.data.id).is("anulado_en", null).select("id");
  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  if ((data ?? []).length === 0) return { ok: false, mensaje: "Ese pago ya estaba anulado o no existe. Actualizá la página." };
  return listo("Pago a docente anulado. Sigue en el listado, pero ya no suma.");
}
