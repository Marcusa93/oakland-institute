import "server-only";
import { proveedorClaude } from "./claude";
import type { ProveedorIA } from "./tipos";

/**
 * Proveedor de IA del asistente, según ASISTENTE_PROVEEDOR:
 * - `ninguno` (por defecto): responde citando la documentación aprobada.
 * - `anthropic`: redacta con Claude a partir de esa misma documentación.
 *   Necesita ANTHROPIC_API_KEY en el servidor; sin clave, vuelve a `ninguno`.
 * Solo se usa con sesión iniciada (ver /api/asistente): los visitantes de la
 * web reciben siempre la documentación tal cual, sin costo.
 */
export function obtenerProveedor(): ProveedorIA | null {
  if (process.env.ASISTENTE_PROVEEDOR !== "anthropic") return null;
  const clave = process.env.ANTHROPIC_API_KEY;
  return clave ? proveedorClaude(clave) : null;
}
