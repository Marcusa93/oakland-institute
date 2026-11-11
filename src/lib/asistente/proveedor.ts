import "server-only";
import type { ProveedorIA } from "./tipos";

/**
 * El proveedor de IA está PENDIENTE de definición. Con ASISTENTE_PROVEEDOR=ninguno
 * (valor por defecto) el asistente responde citando la documentación aprobada.
 * Para integrar uno: implementar `ProveedorIA` en este directorio y devolverlo acá.
 */
export function obtenerProveedor(): ProveedorIA | null {
  return null;
}
