import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Tarjeta } from "@/componentes/ui";
import { CUENTAS_DEMO, demoHabilitada } from "@/config/demo";
import { institucion, supabaseConfigurado } from "@/config/institucion";
import { ingresarDemo } from "./acciones";
import { FormularioIngreso, FormularioRecuperacion } from "./formularios";

export const metadata: Metadata = { title: "Ingresar" };

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ volver?: string; motivo?: string }> }) {
  const { volver = "/panel", motivo } = await searchParams;
  return (
    <main id="contenido" className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      {/* Demo de un clic: solo fuera de producción. */}
      <Link href="/" className="text-sm font-semibold text-marca hover:underline">← {institucion.nombre}</Link>
      <h1 className="mt-4 text-2xl font-bold">Ingresar</h1>
      <p className="mt-1 text-sm text-suave">Para estudiantes, familias, docentes y personal del instituto.</p>
      <div className="mt-6 space-y-4">
        {!supabaseConfigurado() || motivo === "sin-configurar" ? (
          <Aviso tono="alerta">Este entorno todavía no tiene la base de datos conectada: el ingreso no está disponible.</Aviso>
        ) : null}
        {motivo === "enlace" ? <Aviso tono="alerta">El enlace venció o ya fue usado. Pedí uno nuevo abajo.</Aviso> : null}
        {motivo === "demo" ? <Aviso tono="peligro">No pudimos abrir la cuenta demo. Revisá que las cuentas demo estén creadas.</Aviso> : null}
        {demoHabilitada() && supabaseConfigurado() ? (
          <section aria-labelledby="titulo-demo" className="rounded-[1.75rem] bg-marca p-5 text-white">
            <h2 id="titulo-demo" className="text-lg font-bold">Probá el sistema con un clic</h2>
            <p className="mt-1 text-sm text-white/80">Cuentas de demostración con datos ficticios. Entrá con cada rol para ver qué ve cada uno.</p>
            <ul className="mt-4 grid gap-2">
              {CUENTAS_DEMO.map((c) => (
                <li key={c.email}>
                  <form action={ingresarDemo}>
                    <input type="hidden" name="email" value={c.email} />
                    <button className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-2 text-left hover:bg-white/20">
                      <span>
                        <span className="block font-bold">{c.rol} <span className="font-normal text-white/75">· {c.quien}</span></span>
                        <span className="block text-sm text-white/75">{c.detalle}</span>
                      </span>
                      <span aria-hidden className="rounded-full bg-acento px-3 py-1 text-sm font-bold">Entrar</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <Tarjeta><FormularioIngreso volver={volver} /></Tarjeta>
        <details className="rounded-base border border-borde bg-superficie p-4">
          <summary className="cursor-pointer text-sm font-semibold">Olvidé mi contraseña o es mi primer ingreso</summary>
          <div className="mt-3"><FormularioRecuperacion /></div>
        </details>
        <p className="text-sm text-suave">Las cuentas las crea administración. Si todavía no tenés la tuya, pedila en el instituto.</p>
      </div>
    </main>
  );
}
