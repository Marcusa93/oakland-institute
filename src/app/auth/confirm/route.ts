import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const TIPOS: EmailOtpType[] = ["invite", "recovery", "email", "magiclink"];

/**
 * Destino de los enlaces de recuperación (con `code`) y de las plantillas
 * personalizadas (con `token_hash`). Las invitaciones con la plantilla estándar
 * llegan a /auth/bienvenida, porque traen la sesión en el fragmento (#).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const siguiente = searchParams.get("next");
  // Solo destinos internos conocidos.
  const destino = siguiente === "/panel" ? "/panel" : "/auth/clave";

  // Flujo con código (recuperación con las plantillas estándar de Supabase).
  const code = searchParams.get("code");
  if (code) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, request.url));
  }

  // Flujo con token_hash (plantillas personalizadas, cuando haya SMTP propio).
  if (token_hash && type && TIPOS.includes(type)) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(destino, request.url));
  }
  return NextResponse.redirect(new URL("/ingresar?motivo=enlace", request.url));
}
