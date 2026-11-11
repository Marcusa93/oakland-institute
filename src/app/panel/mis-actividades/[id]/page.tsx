import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, EstadoVacio, Insignia, Titulo } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ETIQUETA_EVALUACION, ETIQUETA_HABILIDAD, ICONO_HABILIDAD, TONO_EVALUACION, UUID, ahora, numero, vencimiento } from "../../actividades/comun";
import { entregasDe, estudianteDePersona, situacion } from "../datos";
import { Resolver, type PreguntaResolver } from "../resolver";
import { ResultadoPublicado } from "../resultado";

export const metadata: Metadata = { title: "Actividad" };

interface Actividad {
  id: string; titulo: string; consigna: string; habilidad: string; evaluacion: string; estado: string;
  abre_en: string; cierra_en: string | null; puntaje_max: string; comisiones: { nombre: string } | null;
}

export default async function ResolverActividad({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso("actividades", "crear");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await crearClienteServidor();
  const est = await estudianteDePersona(supabase, sesion.personaId);
  if (!est.id) notFound();

  const [actividadR, preguntasR, { entregas }] = await Promise.all([
    supabase.from("actividades").select("id, titulo, consigna, habilidad, evaluacion, estado, abre_en, cierra_en, puntaje_max, comisiones(nombre)")
      .eq("id", id).neq("estado", "borrador").maybeSingle(),
    supabase.rpc("preguntas_de_actividad", { p_actividad: id }),
    entregasDe(supabase, est.id),
  ]);
  const a = actividadR.data as unknown as Actividad | null;
  const mia = entregas.find((e) => e.actividad_id === id);
  // Solo actividades de las comisiones donde cursa (la base ya lo filtra; acá se confirma).
  if (!a || !mia) notFound();

  const referencia = ahora();
  const s = situacion(mia, referencia);
  const v = vencimiento(a.cierra_en, referencia);
  const abierta = a.estado === "publicada" && !v.vencida && new Date(a.abre_en).getTime() <= referencia;
  const preguntas = ((preguntasR.data ?? []) as PreguntaResolver[]).map((p) => ({ ...p, opciones: Array.isArray(p.opciones) ? p.opciones : [] }));

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/panel/mis-actividades" className="font-semibold text-marca hover:underline">← Mis actividades</Link></p>
      <Titulo descripcion={a.comisiones?.nombre}>
        <span lang="en"><span aria-hidden>{ICONO_HABILIDAD[a.habilidad]} </span>{a.titulo}</span>
      </Titulo>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Insignia>{ETIQUETA_HABILIDAD[a.habilidad]}</Insignia>
        <Insignia tono={TONO_EVALUACION[a.evaluacion]}>{ETIQUETA_EVALUACION[a.evaluacion]}</Insignia>
        {abierta ? <Insignia tono={v.tono}>{v.texto}</Insignia> : null}
        {a.cierra_en ? <Insignia>Cierre: {fechaHora(a.cierra_en)}</Insignia> : null}
        <Insignia>Puntaje máximo {numero(a.puntaje_max)}</Insignia>
      </div>
      {preguntasR.error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar las preguntas. Actualizá la página.</Aviso></div> : null}

      <div className="globo globo-izq mb-10 bg-cielo-suave px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-marca">Consigna</p>
        <p className="mt-1 whitespace-pre-line text-lg" lang="en">{a.consigna}</p>
      </div>

      {s === "corregida" ? (
        <section aria-labelledby="t-res" className="rounded-base border border-borde bg-superficie p-5">
          <h2 id="t-res" className="text-lg font-bold">Tu resultado</h2>
          <ResultadoPublicado nota={mia.nota} puntajeMax={mia.puntaje_max} reaccion={mia.reaccion} devolucion={mia.devolucion} />
          <p className="text-xs text-suave">Entregada {fechaHora(mia.entregada_en)}.</p>
        </section>
      ) : s === "entregada" ? (
        <>
          <Aviso tono="exito">
            Entregaste el {fechaHora(mia.entregada_en)}. Tu docente la está corrigiendo.
            {abierta ? " Si querés cambiar algo, podés volver a entregar hasta el cierre." : ""}
          </Aviso>
          {abierta ? (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-marca">Volver a entregar</summary>
              <p className="mb-3 text-sm text-suave">Por ahora tus respuestas anteriores no se recuperan: completalas de nuevo.</p>
              <Resolver actividad={a.id} preguntas={preguntas} acreditante={a.evaluacion === "acreditante"} reentrega />
            </details>
          ) : null}
        </>
      ) : abierta ? (
        <Resolver actividad={a.id} preguntas={preguntas} acreditante={a.evaluacion === "acreditante"} reentrega={false} />
      ) : (
        <EstadoVacio titulo={a.estado === "publicada" && !v.vencida ? "Todavía no abrió" : "La actividad está cerrada"}>
          {a.estado === "publicada" && !v.vencida ? `Abre el ${fechaHora(a.abre_en)}.` : "Ya no se puede entregar. Si necesitás una prórroga, hablalo con tu docente."}
        </EstadoVacio>
      )}
    </>
  );
}
