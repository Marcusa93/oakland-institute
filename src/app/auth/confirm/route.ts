import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const TIPOS: EmailOtpType[] = ["invite", "recovery", "email", "magiclink"];

/** Destino de los enlaces de invitación y recuperación enviados por correo. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const siguiente = searchParams.get("next");
  // Solo destinos internos conocidos.
  const destino = siguiente === "/panel" ? "/panel" : "/auth/clave";

  if (token_hash && type && TIPOS.includes(type)) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(destino, request.url));
  }
  return NextResponse.redirect(new URL("/ingresar?motivo=enlace", request.url));
}
