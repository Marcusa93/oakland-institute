import "server-only";
import { z } from "zod";
import { mensajeDeError } from "@/lib/sesion";
import type { crearClienteServidor } from "@/lib/supabase/servidor";

export type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
export const esUuid = (v: string | undefined | null): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export const texto = (fd: FormData, clave: string) => String(fd.get(clave) ?? "").trim();
export const marcado = (fd: FormData, clave: string) => fd.get(clave) === "on";

/** Las relaciones de uno a uno pueden llegar como objeto o como lista de un elemento. */
export function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Errores propios de estas pantallas; el resto lo traduce `mensajeDeError`. */
export function traducir(error: { message?: string } | null | undefined): string {
  const m = error?.message ?? "";
  const propios: Array<[RegExp, string]> = [
    [/MATRICULA_NO_ACTIVA/, "Esa inscripción ya no está activa. Actualizá la página."],
    [/MISMA_COMISION/, "El estudiante ya está en esa comisión: elegí otra."],
    [/PLAZO_INVALIDO/, "El plazo de la reserva tiene que ser de entre 1 hora y 30 días."],
    [/reservas_vigente_uq/, "El estudiante ya tiene una reserva vigente en esta comisión."],
    [/lista_espera_uq/, "El estudiante ya está en la lista de espera de esta comisión."],
    [/comision_docentes_uq/, "Ese docente ya está asignado a la comisión."],
    [/comisiones_ciclo_id_nombre_key/, "Ya hay una comisión con ese nombre en el ciclo."],
    [/estudiantes_persona_id_key/, "Esa persona ya está cargada como estudiante."],
    [/NO_ENCONTRADO/, "No encontramos el registro. Actualizá la página."],
  ];
  return propios.find(([patron]) => patron.test(m))?.[1] ?? mensajeDeError(error);
}

/** Suma importes `numeric(14,2)` en centavos enteros: nunca en decimales flotantes. */
export function sumarImportes(valores: Array<string | number | null | undefined>): string {
  let centavos = 0;
  for (const v of valores) {
    const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(typeof v === "number" ? v.toFixed(2) : String(v ?? ""));
    if (!m) continue;
    const n = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
    centavos += m[1] ? -n : n;
  }
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Edad cumplida a una fecha (ambas "AAAA-MM-DD"). */
export function edad(nacimiento: string | null | undefined, hoy: string): number | null {
  if (!nacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) return null;
  const anios = Number(hoy.slice(0, 4)) - Number(nacimiento.slice(0, 4));
  return hoy.slice(5) < nacimiento.slice(5) ? anios - 1 : anios;
}

/** Palabras de búsqueda seguras para los filtros de la API (sin comas, paréntesis ni comodines). */
export function palabras(q: string | undefined | null): string[] {
  return (q ?? "").replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 4);
}

export interface PersonaBasica { id: string; nombres: string; apellidos: string }
export interface EstudianteListado { id: string; legajo: string; estado: string; fecha_alta: string; persona: PersonaBasica }

/** Busca estudiantes por apellido, nombre o legajo. Sin texto, lista por apellido. */
export async function buscarEstudiantes(
  supabase: Cliente, q: string | undefined, opciones: { estado?: string; limite?: number } = {},
): Promise<{ filas: EstudianteListado[]; error: boolean }> {
  const limite = opciones.limite ?? 100;
  const tokens = palabras(q);
  let porNombre = supabase.from("personas")
    .select("id, nombres, apellidos, estudiantes!inner(id, legajo, estado, fecha_alta)")
    .is("eliminada_en", null).order("apellidos").order("nombres").limit(limite);
  for (const t of tokens) porNombre = porNombre.or(`apellidos.ilike.%${t}%,nombres.ilike.%${t}%`);
  if (opciones.estado) porNombre = porNombre.eq("estudiantes.estado", opciones.estado);

  let porLegajo = null;
  if (tokens.length === 1) {
    let c = supabase.from("estudiantes")
      .select("id, legajo, estado, fecha_alta, personas!inner(id, nombres, apellidos, eliminada_en)")
      .ilike("legajo", `%${tokens[0]}%`).is("personas.eliminada_en", null).limit(limite);
    if (opciones.estado) c = c.eq("estado", opciones.estado);
    porLegajo = c;
  }
  const [a, b] = await Promise.all([porNombre, porLegajo]);
  const filas = new Map<string, EstudianteListado>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (b?.data ?? []) as any[]) {
    const p = uno<PersonaBasica>(e.personas);
    if (p) filas.set(e.id, { id: e.id, legajo: e.legajo, estado: e.estado, fecha_alta: e.fecha_alta, persona: { id: p.id, nombres: p.nombres, apellidos: p.apellidos } });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (a.data ?? []) as any[]) {
    const e = uno<{ id: string; legajo: string; estado: string; fecha_alta: string }>(p.estudiantes);
    if (e && !filas.has(e.id)) filas.set(e.id, { ...e, persona: { id: p.id, nombres: p.nombres, apellidos: p.apellidos } });
  }
  return { filas: [...filas.values()], error: Boolean(a.error || b?.error) };
}

export const ESTADOS_ESTUDIANTE = [["aspirante", "Aspirante"], ["activo", "Activo"], ["inactivo", "Inactivo"], ["egresado", "Egresado"]] as const;
