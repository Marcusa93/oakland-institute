import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el navegador (clave publicable + sesión del usuario).
 * En esta carpeta se usa únicamente para subir un comprobante a una URL de
 * subida firmada que emitió el servidor.
 */
export function crearClienteNavegador() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
