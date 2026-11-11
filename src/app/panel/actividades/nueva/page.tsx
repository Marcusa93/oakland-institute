import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, EstadoVacio, Titulo } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "../comun";
import { comisionesDeSesion, textoComision } from "../datos";
import { EditorActividad } from "../editor";

export const metadata: Metadata = { title: "Nueva actividad" };

export default async function NuevaActividad({ searchParams }: { searchParams: Promise<{ comision?: string }> }) {
  const sesion = await exigirPermiso("actividades", "aprobar");
  const { comision } = await searchParams;
  const supabase = await crearClienteServidor();
  const { comisiones, error } = await comisionesDeSesion(supabase, sesion, sesion.perfiles.includes("direccion"));

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/panel/actividades" className="font-semibold text-marca hover:underline">← Actividades</Link></p>
      <Titulo descripcion="Armá la actividad, marcá las respuestas correctas y publicala. Las de opción múltiple se corrigen solas al entregar.">
        Nueva actividad
      </Titulo>
      {error ? <Aviso tono="peligro">No pudimos cargar tus comisiones. Actualizá la página.</Aviso> : null}
      {!error && comisiones.length === 0 ? (
        <EstadoVacio titulo="No tenés comisiones asignadas">Cuando te asignen una comisión vas a poder crear actividades para ella.</EstadoVacio>
      ) : (
        <EditorActividad
          comisiones={comisiones.map((k) => ({ id: k.id, texto: textoComision(k) }))}
          comisionInicial={comision && UUID.test(comision) && comisiones.some((k) => k.id === comision) ? comision : undefined}
        />
      )}
    </>
  );
}
