import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Usa la clave publicable + la sesión del usuario: todo pasa por RLS.
 */
export async function crearClienteServidor() {
  const almacen = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll(cookiesNuevas) {
          try {
            for (const { name, value, options } of cookiesNuevas) almacen.set(name, value, options);
          } catch {
            // En un Server Component no se pueden escribir cookies; el proxy
            // se ocupa de refrescar la sesión.
          }
        },
      },
    },
  );
}
