"use server";

import { z } from "zod";
import { ejecutar, type Resultado } from "@/app/panel/acciones";
import { normalizarImporte } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { texto, traducir, uuid } from "../estudiantes/comun";

const RUTA = ["/panel/aranceles"];
const fallo = (mensaje: string): Resultado => ({ ok: false, mensaje });

function propio(error: { message?: string } | null) {
  const m = error?.message ?? "";
  if (/VIGENCIA_SUPERPUESTA/.test(m)) return "Ya hay un precio con ese alcance que empieza en esa fecha o después. Elegí una fecha posterior.";
  if (/conceptos_codigo_key/.test(m)) return "Ya existe un concepto con ese nombre.";
  return traducir(error);
}

async function resolver(promesa: PromiseLike<{ error: { message?: string } | null }>, exito: string): Promise<Resultado> {
  const { error } = await promesa;
  if (error) return fallo(propio(error));
  return ejecutar(async () => ({ error: null }), exito, RUTA);
}

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------
const esquemaPrecio = z.object({
  concepto: uuid,
  alcance: z.string().regex(/^(general|(ciclo|curso|comision):[0-9a-f-]{36})$/i),
  desde: z.iso.date(),
});

export async function cambiarPrecio(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("aranceles_y_beneficios", "editar");
  const r = esquemaPrecio.safeParse({ concepto: texto(formData, "concepto"), alcance: texto(formData, "alcance") || "general", desde: texto(formData, "desde") });
  const importe = normalizarImporte(texto(formData, "importe"));
  if (!r.success) return fallo("Elegí el concepto, a qué se aplica y desde cuándo rige.");
  if (importe === null) return fallo("Revisá el importe: por ejemplo 45.000 o 45000,50.");
  const [tipo, id] = r.data.alcance.split(":");
  const supabase = await crearClienteServidor();
  return resolver(supabase.rpc("cambiar_arancel", {
    p_concepto: r.data.concepto, p_importe: importe, p_desde: r.data.desde,
    p_ciclo: tipo === "ciclo" ? id : null, p_curso: tipo === "curso" ? id : null, p_comision: tipo === "comision" ? id : null,
  }), "Precio guardado. Las cuotas que se generen desde esa fecha usan el precio nuevo.");
}

const esquemaFin = z.object({ arancel: uuid, hasta: z.iso.date() });

/** Deja de cobrar un precio específico (vuelve a regir el más general). */
export async function finalizarPrecio(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("aranceles_y_beneficios", "editar");
  const r = esquemaFin.safeParse({ arancel: texto(formData, "arancel"), hasta: texto(formData, "hasta") });
  if (!r.success) return fallo("Indicá hasta qué día rige.");
  const supabase = await crearClienteServidor();
  const { data: a, error } = await supabase.from("aranceles").select("vigente_desde").eq("id", r.data.arancel).maybeSingle();
  if (error || !a) return fallo("No encontramos ese precio. Actualizá la página.");
  if (r.data.hasta < a.vigente_desde) return fallo("La fecha de fin no puede ser anterior al inicio del precio.");
  return resolver(supabase.from("aranceles").update({ vigente_hasta: r.data.hasta }).eq("id", r.data.arancel), "Listo: ese precio deja de regir en la fecha indicada.");
}

// ---------------------------------------------------------------------------
// Conceptos
// ---------------------------------------------------------------------------
const TIPOS_CONCEPTO = ["matricula", "cuota", "curso_especial", "derecho_examen", "material", "otro"] as const;
const esquemaConcepto = z.object({ nombre: z.string().trim().min(3).max(80), tipo: z.enum(TIPOS_CONCEPTO) });

const codigoDe = (nombre: string) =>
  nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export async function crearConcepto(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("aranceles_y_beneficios", "crear");
  const r = esquemaConcepto.safeParse({ nombre: texto(formData, "nombre"), tipo: texto(formData, "tipo") });
  if (!r.success) return fallo("El nombre tiene que tener entre 3 y 80 caracteres.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("conceptos").insert({ codigo: codigoDe(r.data.nombre), nombre: r.data.nombre, tipo: r.data.tipo }),
    `Concepto “${r.data.nombre}” creado. Ahora cargale un precio.`);
}

const esquemaActivo = z.object({ id: uuid, activo: z.enum(["si", "no"]) });

export async function activarConcepto(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("aranceles_y_beneficios", "editar");
  const r = esquemaActivo.safeParse({ id: texto(formData, "id"), activo: texto(formData, "activo") });
  if (!r.success) return fallo("No pudimos identificar el concepto. Actualizá la página.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("conceptos").update({ activo: r.data.activo === "si" }).eq("id", r.data.id),
    r.data.activo === "si" ? "Concepto activado." : "Concepto desactivado: no se generan cuotas nuevas con él.");
}

// ---------------------------------------------------------------------------
// Beneficios (catálogo)
// ---------------------------------------------------------------------------
const esquemaBeneficio = z.object({
  nombre: z.string().trim().min(3).max(80),
  tipo: z.enum(["descuento", "beca", "promocion_familiar"]),
  modo: z.enum(["porcentaje", "monto"]),
});

export async function crearBeneficio(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("aranceles_y_beneficios", "crear");
  const r = esquemaBeneficio.safeParse({ nombre: texto(formData, "nombre"), tipo: texto(formData, "tipo"), modo: texto(formData, "modo") });
  if (!r.success) return fallo("Completá el nombre, el tipo y si es un porcentaje o un monto fijo.");
  const valor = normalizarImporte(texto(formData, "valor"));
  if (valor === null || Number(valor) <= 0) return fallo("Indicá un valor mayor a cero.");
  if (r.data.modo === "porcentaje" && Number(valor) > 100) return fallo("El porcentaje no puede superar 100.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("beneficios").insert({
    nombre: r.data.nombre, tipo: r.data.tipo,
    porcentaje: r.data.modo === "porcentaje" ? valor : null,
    monto_fijo: r.data.modo === "monto" ? valor : null,
  }), `Beneficio “${r.data.nombre}” creado. Ya podés otorgarlo.`);
}

export async function activarBeneficio(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("aranceles_y_beneficios", "editar");
  const r = esquemaActivo.safeParse({ id: texto(formData, "id"), activo: texto(formData, "activo") });
  if (!r.success) return fallo("No pudimos identificar el beneficio. Actualizá la página.");
  const supabase = await crearClienteServidor();
  return resolver(supabase.from("beneficios").update({ activo: r.data.activo === "si" }).eq("id", r.data.id),
    r.data.activo === "si" ? "Beneficio activado." : "Beneficio desactivado: no se puede otorgar de nuevo. Los ya otorgados siguen vigentes.");
}

// ---------------------------------------------------------------------------
// Beneficios otorgados
// ---------------------------------------------------------------------------
const esquemaOtorgar = z.object({
  matricula: uuid, beneficio: uuid,
  aplica_a: z.enum(["cuota", "matricula"]),
  desde: z.iso.date(), hasta: z.union([z.literal(""), z.iso.date()]),
  motivo: z.string().trim().max(300),
});

export async function otorgarBeneficio(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const sesion = await exigirPermiso("aranceles_y_beneficios", "aprobar");
  const r = esquemaOtorgar.safeParse({
    matricula: texto(formData, "matricula"), beneficio: texto(formData, "beneficio"), aplica_a: texto(formData, "aplica_a"),
    desde: texto(formData, "desde"), hasta: texto(formData, "hasta"), motivo: texto(formData, "motivo"),
  });
  if (!r.success) return fallo("Elegí el estudiante, el beneficio y desde cuándo rige.");
  const d = r.data;
  if (d.hasta && d.hasta < d.desde) return fallo("La fecha de fin no puede ser anterior a la de inicio.");
  const supabase = await crearClienteServidor();
  const { data: b } = await supabase.from("beneficios").select("activo").eq("id", d.beneficio).maybeSingle();
  if (!b?.activo) return fallo("Ese beneficio está desactivado.");
  return resolver(supabase.from("beneficios_otorgados").insert({
    matricula_id: d.matricula, beneficio_id: d.beneficio, aplica_a: d.aplica_a,
    vigente_desde: d.desde, vigente_hasta: d.hasta || null, motivo: d.motivo || null,
    aprobado_por: sesion.cuentaId,
  }), "Beneficio otorgado. Se aplica a las cuotas que se generen desde esa fecha.");
}

const esquemaRevocar = z.object({ id: uuid, motivo: z.string().trim().min(5).max(300) });

export async function revocarBeneficio(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  await exigirPermiso("aranceles_y_beneficios", "aprobar");
  const r = esquemaRevocar.safeParse({ id: texto(formData, "id"), motivo: texto(formData, "motivo") });
  if (!r.success) return fallo("Indicá el motivo (al menos 5 caracteres).");
  const supabase = await crearClienteServidor();
  return resolver(supabase.rpc("revocar_beneficio", { p_otorgado: r.data.id, p_motivo: r.data.motivo }),
    "Beneficio revocado. Las cuotas ya generadas no cambian.");
}
