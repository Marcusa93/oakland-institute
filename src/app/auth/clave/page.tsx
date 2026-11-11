import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Tarjeta } from "@/componentes/ui";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormularioClave } from "@/app/ingresar/formularios";

export const metadata: Metadata = { title: "Crear contraseña" };

export default async function Clave() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/ingresar?motivo=enlace");
  return (
    <main id="contenido" className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">Creá tu contraseña</h1>
      <Tarjeta className="mt-6"><FormularioClave /></Tarjeta>
    </main>
  );
}
