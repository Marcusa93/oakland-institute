import "server-only";
import { hoyISO } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

interface Persona { nombres: string; apellidos: string; nombre_preferido: string | null }

export interface Evaluacion {
  id: string; docente_persona_id: string; periodo: string; puntajes: Record<string, number>;
  fortalezas: string | null; a_mejorar: string | null; compartida: boolean; creada_en: string;
}

export interface ResumenComision {
  id: string; nombre: string; estado: string;
  clases: number; clasesConAsistencia: number;
  actividadesPublicadas: number; entregasCorregidas: number; entregasPorCorregir: number;
  alertasAbiertas: number;
}

export interface ResumenDocente {
  personaId: string; nombre: string; apellidos: string; cuentaActiva: boolean;
  comisiones: ResumenComision[];
  totales: Omit<ResumenComision, "id" | "nombre" | "estado">;
  ultima: Evaluacion | null;
}

/**
 * Personas con rol docente vigente y lo que muestran sus comisiones.
 * Las métricas son por comisión: si la comparten dos docentes, cuentan para ambos.
 * Lecturas permitidas a gestión por RLS (roles, cuentas, clases, actividades…).
 */
export async function resumenDocentes(soloPersona?: string): Promise<{ docentes: ResumenDocente[]; evaluaciones: Evaluacion[]; error: boolean }> {
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();

  const { data: roles, error: e1 } = await supabase.from("roles_asignados").select("cuenta_id").eq("rol", "docente").is("revocado_en", null);
  const cuentaIds = [...new Set(((roles ?? []) as { cuenta_id: string }[]).map((r) => r.cuenta_id))];
  if (e1 || cuentaIds.length === 0) return { docentes: [], evaluaciones: [], error: Boolean(e1) };

  let qCuentas = supabase.from("cuentas").select("id, persona_id, estado, personas(nombres, apellidos, nombre_preferido)").in("id", cuentaIds);
  if (soloPersona) qCuentas = qCuentas.eq("persona_id", soloPersona);
  const { data: cuentasD, error: e2 } = await qCuentas;
  const cuentas = (cuentasD ?? []) as unknown as { id: string; persona_id: string; estado: string; personas: Persona | null }[];
  const personaIds = cuentas.map((c) => c.persona_id);
  if (e2 || personaIds.length === 0) return { docentes: [], evaluaciones: [], error: Boolean(e2) };

  const [asigR, evalR] = await Promise.all([
    supabase.from("comision_docentes").select("docente_persona_id, comisiones(id, nombre, estado)").in("docente_persona_id", personaIds).is("hasta", null),
    supabase.from("evaluaciones_docentes").select("id, docente_persona_id, periodo, puntajes, fortalezas, a_mejorar, compartida, creada_en")
      .in("docente_persona_id", personaIds).order("creada_en", { ascending: false }),
  ]);
  const asignaciones = ((asigR.data ?? []) as unknown as { docente_persona_id: string; comisiones: { id: string; nombre: string; estado: string } | null }[])
    .filter((a) => a.comisiones);
  const comisionIds = [...new Set(asignaciones.map((a) => a.comisiones!.id))];

  const [clasesR, actsR, alertasR] = comisionIds.length
    ? await Promise.all([
        supabase.from("clases").select("comision_id, asistencias(count)").in("comision_id", comisionIds).lte("fecha", hoy).neq("estado", "cancelada").limit(10000),
        supabase.from("actividades").select("comision_id, estado, entregas(estado)").in("comision_id", comisionIds).neq("estado", "borrador").limit(5000),
        supabase.from("alertas").select("comision_id").in("comision_id", comisionIds).neq("estado", "resuelta").limit(5000),
      ])
    : [null, null, null];

  const porComision = new Map<string, Omit<ResumenComision, "id" | "nombre" | "estado">>();
  const base = () => ({ clases: 0, clasesConAsistencia: 0, actividadesPublicadas: 0, entregasCorregidas: 0, entregasPorCorregir: 0, alertasAbiertas: 0 });
  for (const id of comisionIds) porComision.set(id, base());
  for (const c of (clasesR?.data ?? []) as unknown as { comision_id: string; asistencias: { count: number }[] }[]) {
    const r = porComision.get(c.comision_id)!;
    r.clases += 1;
    if ((c.asistencias?.[0]?.count ?? 0) > 0) r.clasesConAsistencia += 1;
  }
  for (const a of (actsR?.data ?? []) as unknown as { comision_id: string; entregas: { estado: string }[] }[]) {
    const r = porComision.get(a.comision_id)!;
    r.actividadesPublicadas += 1;
    for (const e of a.entregas ?? []) {
      if (e.estado === "corregida") r.entregasCorregidas += 1;
      else if (e.estado === "entregada") r.entregasPorCorregir += 1;
    }
  }
  for (const a of (alertasR?.data ?? []) as { comision_id: string }[]) porComision.get(a.comision_id)!.alertasAbiertas += 1;

  const evaluaciones = (evalR.data ?? []) as Evaluacion[];
  const docentes = cuentas.map((c): ResumenDocente => {
    const comisiones = asignaciones.filter((a) => a.docente_persona_id === c.persona_id)
      .map((a) => ({ ...a.comisiones!, ...porComision.get(a.comisiones!.id)! }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
    const totales = comisiones.reduce((t, k) => {
      for (const clave of Object.keys(t) as (keyof typeof t)[]) t[clave] += k[clave];
      return t;
    }, base());
    return {
      personaId: c.persona_id,
      nombre: c.personas ? `${c.personas.nombre_preferido || c.personas.nombres} ${c.personas.apellidos}` : "Docente",
      apellidos: c.personas?.apellidos ?? "",
      cuentaActiva: c.estado === "activa",
      comisiones, totales,
      ultima: evaluaciones.find((e) => e.docente_persona_id === c.persona_id) ?? null,
    };
  }).sort((x, y) => x.apellidos.localeCompare(y.apellidos, "es"));

  return { docentes, evaluaciones, error: Boolean(asigR.error || evalR.error || clasesR?.error || actsR?.error || alertasR?.error) };
}

export function porcentaje(parte: number, total: number) {
  return total > 0 ? `${Math.round((100 * parte) / total)} %` : "—";
}
