import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Insignia } from "@/componentes/ui";
import { institucion } from "@/config/institucion";
import { fechaHora } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "../../actividades/comun";
import { normalizar, type DatosInforme } from "../comun";
import { EditorInforme } from "../editor";
import { BotonImprimir } from "../imprimir";
import { VistaInforme } from "../vista";

export const metadata: Metadata = { title: "Informe" };

interface Informe {
  id: string; estudiante_id: string; autor_cuenta_id: string; periodo: string; datos: Partial<DatosInforme>;
  comentario: string | null; recomendaciones: string | null; destinatario: "direccion" | "familia"; estado: string;
  creado_en: string; enviado_en: string | null;
}

// Al imprimir se muestra solo el informe, sin el menú del panel ni el asistente.
const ESTILO_IMPRESION = `@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden; }
  #informe-imprimible, #informe-imprimible * { visibility: visible; }
  #informe-imprimible { position: absolute; inset: 0 auto auto 0; width: 100%; }
}`;

export default async function VerInforme({ params }: { params: Promise<{ id: string }> }) {
  // Lo ven quien lo escribió, dirección y, si se envió a la familia, sus responsables y el estudiante (RLS).
  const sesion = await exigirPermiso("informes", "ver");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("informes")
    .select("id, estudiante_id, autor_cuenta_id, periodo, datos, comentario, recomendaciones, destinatario, estado, creado_en, enviado_en")
    .eq("id", id).maybeSingle();
  const inf = data as Informe | null;
  if (!inf) notFound();
  const datos = normalizar(inf.datos);
  const editable = inf.estado === "borrador" && inf.autor_cuenta_id === sesion.cuentaId && puede(sesion.perfiles, "informes", "crear");
  const volver = puede(sesion.perfiles, "informes", "crear") ? ["/panel/informes", "← Informes"] : ["/panel/familia", "← Cursada"];

  return (
    <>
      <style>{ESTILO_IMPRESION}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={volver[0]} className="text-sm font-semibold text-marca hover:underline">{volver[1]}</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Insignia tono={inf.destinatario === "familia" ? "marca" : "neutro"}>{inf.destinatario === "familia" ? "Para la familia" : "Para dirección"}</Insignia>
          <Insignia tono={inf.estado === "enviado" ? "exito" : "alerta"}>{inf.estado === "enviado" ? "Enviado" : "Borrador"}</Insignia>
          <BotonImprimir />
        </div>
      </div>

      <div className={editable ? "grid gap-6 xl:grid-cols-[3fr_2fr]" : ""}>
        <article id="informe-imprimible" className="rounded-base border border-borde bg-superficie p-5 sm:p-8 print:border-0 print:p-0">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-2 border-b-4 border-marca pb-3 [print-color-adjust:exact]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-acento">{institucion.nombre} · {institucion.localidad}</p>
              <h1 className="text-2xl font-extrabold tracking-tight text-marca-fuerte">Informe de seguimiento · {inf.periodo}</h1>
            </div>
            <p className="text-xs text-suave">{inf.estado === "enviado" ? `Enviado ${fechaHora(inf.enviado_en)}` : `Borrador del ${fechaHora(inf.creado_en)}`}</p>
          </div>
          <VistaInforme datos={datos} />
          <section className="mt-6 break-inside-avoid">
            <h2 className="text-lg font-bold">Comentario</h2>
            <p className="mt-1 whitespace-pre-line">{inf.comentario || <span className="text-suave">Sin comentario todavía.</span>}</p>
          </section>
          {inf.recomendaciones ? (
            <section className="mt-5 break-inside-avoid">
              <h2 className="text-lg font-bold">Recomendaciones</h2>
              <p className="mt-1 whitespace-pre-line">{inf.recomendaciones}</p>
            </section>
          ) : null}
          <p className="mt-8 border-t border-borde pt-3 text-xs text-suave">
            Los datos de asistencia, actividades y práctica se calcularon automáticamente al {inf.estado === "enviado" ? "enviar" : "guardar"} el informe. El comentario y las recomendaciones los escribió el equipo docente.
          </p>
        </article>
        {editable ? (
          <div className="print:hidden xl:sticky xl:top-4 xl:self-start">
            <EditorInforme informe={inf.id} estudiante={inf.estudiante_id} desde={datos.periodo.desde} hasta={datos.periodo.hasta} datos={datos}
              nombrePila={datos.estudiante?.nombre.split(" ")[0] ?? "El estudiante"}
              inicial={{ periodo: inf.periodo, comentario: inf.comentario ?? "", recomendaciones: inf.recomendaciones ?? "", destinatario: inf.destinatario }} />
          </div>
        ) : null}
      </div>
    </>
  );
}
