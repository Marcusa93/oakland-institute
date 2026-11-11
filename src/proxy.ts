import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca la sesión de Supabase y hace el chequeo optimista de acceso a
 * /panel. La autorización real está en cada página (lib/sesion) y en la base
 * (RLS): este archivo no es una barrera de seguridad por sí solo.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const esPanel = request.nextUrl.pathname.startsWith("/panel");

  if (!url || !clave) {
    // Sin Supabase configurado solo funciona la landing en modo demostración.
    return esPanel ? NextResponse.redirect(new URL("/ingresar?motivo=sin-configurar", request.url)) : NextResponse.next();
  }

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesNuevas, cabeceras) {
        for (const { name, value } of cookiesNuevas) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesNuevas) respuesta.cookies.set(name, value, options);
        // Evita que un CDN guarde una respuesta con cookies de sesión.
        for (const [clave, valor] of Object.entries(cabeceras ?? {})) respuesta.headers.set(clave, valor);
      },
    },
  });

  // getClaims verifica la firma del token; no confiar en getSession acá.
  const { data } = await supabase.auth.getClaims();

  if (esPanel && !data?.claims) {
    const destino = new URL("/ingresar", request.url);
    destino.searchParams.set("volver", request.nextUrl.pathname);
    const redireccion = NextResponse.redirect(destino);
    for (const c of respuesta.cookies.getAll()) redireccion.cookies.set(c);
    return redireccion;
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
