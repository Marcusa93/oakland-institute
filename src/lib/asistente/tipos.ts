import type { Perfil } from "@/lib/permisos";

export interface Fuente { slug: string; titulo: string; fragmento: string }

export interface RespuestaAsistente {
  texto: string;
  fuentes: Array<{ slug: string; titulo: string }>;
  /** true = redactado por un modelo (sugerencia); false = cita textual de documentación aprobada. */
  generadaPorIA: boolean;
  /** true = no hay información suficiente: ofrecer contacto con una persona. */
  derivar: boolean;
}

/**
 * Contrato mínimo con el proveedor de IA (a definir). Cualquier proveedor se
 * integra implementando esta interfaz; el resto del sistema no lo conoce.
 */
export interface ProveedorIA {
  nombre: string;
  generar(entrada: { sistema: string; usuario: string; maxTokens: number }): Promise<{
    texto: string;
    tokensEntrada: number;
    tokensSalida: number;
  }>;
}

export interface ContextoAsistente {
  perfiles: readonly Perfil[];
  /** Durante una evaluación solo valen las ayudas que el docente habilitó. */
  evaluacionEnCurso?: { ayudasHabilitadas: readonly string[] } | null;
}
