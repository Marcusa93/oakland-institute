import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Titulo } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { CLAVES_SITIO, obtenerContenidoSitioDetallado, type ClaveSitio } from "@/lib/sitio";
import { EditorSitio } from "./editor";

export const metadata: Metadata = { title: "Sitio web" };

export default async function Sitio() {
  await exigirPermiso("sitio", "editar");
  const { contenido, actualizado, error } = await obtenerContenidoSitioDetallado();
  const fechas: Partial<Record<ClaveSitio, string>> = {};
  for (const k of CLAVES_SITIO) if (actualizado[k]) fechas[k] = fechaHora(actualizado[k]);

  return (
    <>
      <Titulo descripcion="Editá los textos de la página pública por sección, en castellano y en inglés. Cada sección se publica por separado."
        acciones={<a href="/" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm font-semibold text-marca hover:underline">Ver el sitio ↗</a>}>
        Sitio web
      </Titulo>
      <div className="mb-5 space-y-3">
        <Aviso tono="neutro">
          Los cursos, horarios y cupos no se editan acá: salen de lo publicado en <Link href="/panel/comisiones" className="font-semibold text-marca underline">Comisiones</Link>.
          No cargues precios, convenios ni certificaciones que el instituto no haya confirmado por escrito.
        </Aviso>
        {error ? <Aviso tono="peligro">No pudimos leer lo publicado. Te mostramos los textos de siempre: si publicás, se reemplaza esa sección.</Aviso> : null}
      </div>
      <EditorSitio inicial={contenido} actualizado={fechas} />
    </>
  );
}
