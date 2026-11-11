import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, Titulo } from "@/componentes/ui";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "../../actividades/comun";
import { errorCampus } from "../../actividades/errores";
import { normalizar, type DatosInforme } from "../comun";
import { EditorInforme } from "../editor";
import { resolverRango } from "../periodos";
import { VistaInforme } from "../vista";

export const metadata: Metadata = { title: "Nuevo informe" };

export default async function NuevoInforme({ searchParams }: {
  searchParams: Promise<{ estudiante?: string; rango?: string; desde?: string; hasta?: string }>;
}) {
  await exigirPermiso("informes", "crear");
  const q = await searchParams;
  if (!q.estudiante || !UUID.test(q.estudiante)) notFound();
  const { desde, hasta, nombre } = resolverRango(q.rango ?? "trimestre", hoyISO(), q.desde, q.hasta);
  const invertido = hasta < desde;

  const supabase = await crearClienteServidor();
  const r = invertido ? null : await supabase.rpc("datos_informe", { p_estudiante: q.estudiante, p_desde: desde, p_hasta: hasta });
  const datos: DatosInforme | null = r && !r.error ? normalizar(r.data as Partial<DatosInforme>) : null;
  const nombrePila = datos?.estudiante?.nombre.split(" ")[0] ?? "El estudiante";

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/panel/informes" className="font-semibold text-marca hover:underline">← Informes</Link></p>
      <Titulo descripcion="Revisá los datos del período y escribí tu comentario. Podés guardarlo como borrador y terminarlo después.">Nuevo informe</Titulo>
      {invertido ? <Aviso tono="peligro">La fecha final no puede ser anterior a la inicial. Volvé y corregí el período.</Aviso> : null}
      {r?.error ? <Aviso tono="peligro">{errorCampus(r.error)}</Aviso> : null}
      {datos ? (
        <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <VistaInforme datos={datos} />
          <div className="xl:sticky xl:top-4 xl:self-start">
            <EditorInforme estudiante={q.estudiante} desde={desde} hasta={hasta} datos={datos} nombrePila={nombrePila}
              inicial={{ periodo: nombre, comentario: "", recomendaciones: "", destinatario: "direccion" }} />
          </div>
        </div>
      ) : null}
    </>
  );
}
