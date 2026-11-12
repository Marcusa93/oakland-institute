import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con clave secreta: SALTEA RLS. Uso permitido únicamente para
 * (1) invitar cuentas después de verificar el rol de quien lo pide,
 * (2) tareas programadas, (3) notificaciones de la pasarela, (4) firmar la
 * subida de un audio o de un material de la biblioteca a una ruta que la
 * base ya validó con la sesión del usuario (ver src/app/panel/audio/acciones.ts
 * y src/app/panel/biblioteca/acciones.ts) y (5) borrar el archivo de un
 * material que la base ya dejó borrar al usuario.
 * Nunca se importa desde componentes cliente ni se usa para lecturas que
 * dependan del usuario.
 */
export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SECRET_KEY en el servidor.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
