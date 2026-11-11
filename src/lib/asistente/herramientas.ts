import type { Perfil } from "@/lib/permisos";
import type { ContextoAsistente } from "./tipos";

/**
 * Registro de herramientas del asistente.
 *
 * La autorización se decide ACÁ, en código, antes de exponer una herramienta
 * al modelo y otra vez antes de ejecutarla. Lo que diga el modelo (o un texto
 * recuperado) nunca habilita nada. Además, cada herramienta consulta con la
 * sesión del usuario, así que la base vuelve a filtrar por RLS.
 */
export interface Herramienta {
  nombre: string;
  descripcion: string;
  /** documental = busca en documentación aprobada; operativa = lee datos del sistema. */
  tipo: "documental" | "operativa";
  perfiles: readonly Perfil[];
  /** Ninguna herramienta de la etapa 1 modifica datos. */
  modificaDatos: boolean;
}

export const HERRAMIENTAS: readonly Herramienta[] = [
  {
    nombre: "buscar_ayuda",
    descripcion: "Busca en la ayuda y los reglamentos aprobados para el perfil.",
    tipo: "documental",
    perfiles: ["visitante", "estudiante", "tutor", "docente", "administracion", "direccion"],
    modificaDatos: false,
  },
  {
    nombre: "saldo_pendiente",
    descripcion: "Devuelve el saldo pendiente calculado por la base (vista obligaciones_saldo).",
    tipo: "operativa",
    perfiles: ["estudiante", "tutor"],
    modificaDatos: false,
  },
] as const;

export function herramientasDisponibles(ctx: ContextoAsistente): Herramienta[] {
  return HERRAMIENTAS.filter((h) => {
    if (h.modificaDatos) return false; // etapa 1: solo consultas y borradores
    if (!h.perfiles.some((p) => ctx.perfiles.includes(p))) return false;
    if (ctx.evaluacionEnCurso) return ctx.evaluacionEnCurso.ayudasHabilitadas.includes(h.nombre);
    return true;
  });
}

export class HerramientaNoAutorizada extends Error {
  constructor(nombre: string) {
    super(`Herramienta no autorizada: ${nombre}`);
  }
}

/** Se llama justo antes de ejecutar, aunque la herramienta ya se haya ofrecido. */
export function autorizarHerramienta(nombre: string, ctx: ContextoAsistente): Herramienta {
  const h = herramientasDisponibles(ctx).find((x) => x.nombre === nombre);
  if (!h) throw new HerramientaNoAutorizada(nombre);
  return h;
}
