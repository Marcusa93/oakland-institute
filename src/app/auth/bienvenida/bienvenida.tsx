"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Aviso, Tarjeta } from "@/componentes/ui";

/**
 * Destino del enlace de invitación con la plantilla estándar de Supabase: la
 * sesión llega en el fragmento de la URL (#access_token=…), que solo ve el
 * navegador. La guardamos en cookies y seguimos a "crear contraseña".
 */
export function Bienvenida() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const datos = new URLSearchParams(window.location.hash.slice(1));
    const access_token = datos.get("access_token");
    const refresh_token = datos.get("refresh_token");
    // Borrar los tokens de la barra de direcciones y del historial.
    window.history.replaceState(null, "", window.location.pathname);
    if (!access_token || !refresh_token) {
      const t = window.setTimeout(() => setError(true), 0);
      return () => window.clearTimeout(t);
    }
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error: e }) => {
      if (e) setError(true);
      else router.replace("/auth/clave");
    });
  }, [router]);

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold">Bienvenida a Oakland Institute</h1>
      {error ? (
        <div className="mt-4 space-y-3">
          <Aviso tono="alerta">El enlace venció o ya fue usado.</Aviso>
          <p className="text-sm text-suave">
            Pedí uno nuevo desde <Link href="/ingresar" className="font-semibold text-marca underline">Ingresar</Link> → «Olvidé mi contraseña o es mi primer ingreso».
          </p>
        </div>
      ) : (
        <p className="mt-2 text-suave" role="status">Estamos preparando tu cuenta…</p>
      )}
    </Tarjeta>
  );
}
