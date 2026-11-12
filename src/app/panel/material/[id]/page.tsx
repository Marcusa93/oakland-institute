import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lectura } from "@/componentes/lectura";
import { EstadoVacio, Titulo } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { minutosLectura } from "../../biblioteca/comun";
import { RegistrarLectura } from "./registrar";

export const metadata: Metadata = { title: "Material" };

export default async function LeerMaterial({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso("biblioteca", "ver");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await crearClienteServidor();
  const { data: m } = await supabase.from("materiales")
    .select("id, titulo, descripcion, nivel, texto, archivo_ruta, archivo_nombre, archivo_mime").eq("id", id).maybeSingle();
  if (!m) notFound();
  const firmado = m.archivo_ruta ? await supabase.storage.from("biblioteca").createSignedUrl(m.archivo_ruta, 60 * 60) : null;
  const original = firmado?.data?.signedUrl ?? null;
  const minutos = minutosLectura(m.texto);

  return (
    <>
      {sesion.perfiles.includes("estudiante") ? <RegistrarLectura material={m.id} /> : null}
      <p className="mb-2 text-sm"><Link href="/panel/material" className="font-semibold text-marca hover:underline">← Biblioteca</Link></p>
      <Titulo descripcion={[m.nivel, minutos ? `${minutos} min de lectura` : null].filter(Boolean).join(" · ") || undefined}>
        <span lang="en">{m.titulo}</span>
      </Titulo>
      {m.descripcion ? <p className="globo globo-izq mb-6 inline-block bg-marca-suave px-5 py-3 font-semibold text-marca-fuerte">{m.descripcion}</p> : null}
      <div className="max-w-3xl">
        {m.texto ? <Lectura texto={m.texto} /> : (
          <EstadoVacio titulo="Este material es para ver en el archivo original">Abrilo con el botón de abajo.</EstadoVacio>
        )}
        {original ? (
          <p className="mt-6">
            <a href={original} target="_blank" rel="noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-borde bg-superficie px-5 font-semibold text-marca hover:bg-marca-suave">
              <span aria-hidden>📎</span>Ver el original ({m.archivo_mime === "application/pdf" ? "PDF" : m.archivo_mime?.startsWith("image/") ? "foto" : "Word"})
            </a>
          </p>
        ) : null}
      </div>
    </>
  );
}
