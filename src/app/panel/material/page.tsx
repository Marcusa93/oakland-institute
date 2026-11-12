/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, EstadoVacio, Insignia, Titulo } from "@/componentes/ui";
import { fecha } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { extracto, iconoMaterial, minutosLectura } from "../biblioteca/comun";

export const metadata: Metadata = { title: "Biblioteca" };

export default async function MiBiblioteca() {
  const sesion = await exigirPermiso("biblioteca", "ver");
  const esEstudiante = sesion.perfiles.includes("estudiante");
  const supabase = await crearClienteServidor();
  // La base devuelve solo el material compartido con las comisiones de esta cuenta.
  const [materialesR, lecturasR] = await Promise.all([
    supabase.from("materiales")
      .select("id, titulo, descripcion, nivel, texto, texto_origen, archivo_mime, creado_en, material_comisiones(compartido_en, comisiones(nombre))")
      .order("creado_en", { ascending: false }).limit(200),
    esEstudiante ? supabase.from("material_lecturas").select("material_id") : null,
  ]);
  const leidos = new Set(((lecturasR?.data ?? []) as { material_id: string }[]).map((l) => l.material_id));
  const materiales = ((materialesR.data ?? []) as any[]).map((m) => {
    const compartidos = (m.material_comisiones ?? []) as { compartido_en: string; comisiones: { nombre: string } | null }[];
    return { ...m, compartido: compartidos.map((c) => c.compartido_en).sort().at(-1) ?? m.creado_en, comisiones: compartidos.map((c) => c.comisiones?.nombre).filter(Boolean) as string[] };
  }).sort((a, b) => b.compartido.localeCompare(a.compartido));
  const nuevos = esEstudiante ? materiales.filter((m) => !leidos.has(m.id)).length : 0;

  return (
    <>
      <Titulo descripcion={esEstudiante ? "El material que te compartieron tus docentes. Leelo y escuchalo en inglés desde el celular." : "El material que los docentes compartieron con la comisión."}>
        Biblioteca
      </Titulo>
      {materialesR.error ? <Aviso tono="peligro">No pudimos cargar la biblioteca. Actualizá la página.</Aviso> : null}
      {nuevos ? <p className="mb-4 font-semibold text-marca-fuerte">Tenés {nuevos} {nuevos === 1 ? "material nuevo" : "materiales nuevos"} para leer.</p> : null}
      {!materialesR.error && materiales.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay material compartido">Cuando tu docente comparta un material con tu comisión, aparece acá.</EstadoVacio>
      ) : null}
      <ul className="space-y-3">
        {materiales.map((m) => {
          const minutos = minutosLectura(m.texto);
          const nuevo = esEstudiante && !leidos.has(m.id);
          return (
            <li key={m.id}>
              <Link href={`/panel/material/${m.id}`}
                className={`flex gap-4 rounded-[1.5rem] border bg-superficie p-4 hover:border-marca sm:p-5 ${nuevo ? "border-marca ring-1 ring-marca" : "border-borde"}`}>
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-pizarra text-2xl">{iconoMaterial(m)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-marca-fuerte" lang="en">{m.titulo}</h2>
                    {nuevo ? <Insignia tono="peligro">Nuevo</Insignia> : null}
                  </div>
                  <p className="text-sm text-suave">{[m.comisiones.join(", "), minutos ? `${minutos} min de lectura` : null, fecha(m.compartido)].filter(Boolean).join(" · ")}</p>
                  {m.descripcion ? <p className="mt-1 text-sm font-semibold">{m.descripcion}</p> : m.texto ? <p className="mt-1 line-clamp-2 text-sm text-suave" lang="en">{extracto(m.texto, 140)}</p> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
