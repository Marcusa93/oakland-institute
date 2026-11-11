"use server";

import { redirect } from "next/navigation";
import { CUENTAS_DEMO, demoHabilitada } from "@/config/demo";
import { supabaseConfigurado } from "@/config/institucion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface EstadoIngreso { mensaje?: string; ok?: boolean }

/** Solo rutas internas: evita redirecciones abiertas con ?volver=. */
const rutaSegura = (v: string) => (/^\/panel(\/[\w\-/]*)?$/.test(v) ? v : "/panel");

export async function ingresar(_previo: EstadoIngreso, formData: FormData): Promise<EstadoIngreso> {
  if (!supabaseConfigurado()) return { mensaje: "El acceso todavía no está habilitado en este entorno." };
  const email = String(formData.get("email") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");
  if (!email || !clave) return { mensaje: "Completá correo y contraseña." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
  // Mismo mensaje para correo inexistente y clave incorrecta.
  if (error) return { mensaje: "Correo o contraseña incorrectos." };
  redirect(rutaSegura(String(formData.get("volver") ?? "")));
}

/** Ingreso de un clic a una cuenta demo. La contraseña se lee en el servidor. */
export async function ingresarDemo(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  if (!demoHabilitada() || !supabaseConfigurado() || !CUENTAS_DEMO.some((c) => c.email === email)) {
    redirect("/ingresar?motivo=demo");
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_CLAVE! });
  if (error) redirect("/ingresar?motivo=demo");
  redirect("/panel");
}

export async function pedirRecuperacion(_previo: EstadoIngreso, formData: FormData): Promise<EstadoIngreso> {
  if (!supabaseConfigurado()) return { mensaje: "El acceso todavía no está habilitado en este entorno." };
  const email = String(formData.get("email") ?? "").trim();
  if (email) {
    const supabase = await crearClienteServidor();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITIO_URL ?? ""}/auth/confirm?next=/auth/clave`,
    });
  }
  // No se revela si el correo tiene cuenta.
  return { ok: true, mensaje: "Si el correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva." };
}

export async function definirClave(_previo: EstadoIngreso, formData: FormData): Promise<EstadoIngreso> {
  const clave = String(formData.get("clave") ?? "");
  if (clave.length < 10) return { mensaje: "La contraseña debe tener al menos 10 caracteres." };
  if (clave !== String(formData.get("repetir") ?? "")) return { mensaje: "Las contraseñas no coinciden." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) return { mensaje: "No pudimos guardar la contraseña. Abrí de nuevo el enlace que te enviamos." };
  redirect("/panel");
}

export async function salir() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/");
}
