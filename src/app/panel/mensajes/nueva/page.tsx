import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Titulo } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { REGLAS_CANAL } from "../comun";
import { NuevaConversacion } from "../componentes";
import { opcionesNuevaConversacion } from "../datos";

export const metadata: Metadata = { title: "Nueva conversación" };

/** `?para=<estudiante_id>` precarga el estudiante; `?a=<persona_id>` precarga un destinatario (gestión). */
export default async function Nueva({ searchParams }: { searchParams: Promise<{ para?: string; a?: string }> }) {
  const sesion = await exigirPermiso("mensajes", "crear");
  const { para, a } = await searchParams;
  const opciones = await opcionesNuevaConversacion(sesion, para, a);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/panel/mensajes" className="inline-flex min-h-11 items-center text-sm font-semibold text-marca hover:underline">← Mensajes</Link>
      <Titulo descripcion={opciones.modo === "gestion" ? "Buscá a la persona por nombre. Podés vincular la conversación a un estudiante." : "Elegí el estudiante y a quién le escribís. Solo aparecen los destinatarios habilitados."}>
        Nueva conversación
      </Titulo>
      <div className="mb-5 space-y-3">
        <p className="rounded-base border border-borde bg-superficie px-3 py-2 text-sm text-suave">{REGLAS_CANAL}</p>
        {opciones.avisos.map((t) => <Aviso key={t} tono="neutro">{t}</Aviso>)}
      </div>
      <NuevaConversacion modo={opciones.modo} estudiantes={opciones.estudiantes} preEstudiante={opciones.preEstudiante} preDestinatarios={opciones.preDestinatarios}
        generales={opciones.generales} permiteSinEstudiante={opciones.permiteSinEstudiante} />
    </div>
  );
}
