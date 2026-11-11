import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, Insignia } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { NOMBRE_RESERVADO, nombrePersona } from "../comun";
import { Respuesta } from "../componentes";

export const metadata: Metadata = { title: "Conversación" };

interface Persona { nombres: string; apellidos: string; nombre_preferido: string | null }
interface Mensaje { id: string; autor_persona_id: string; cuerpo: string; creado_en: string }

export default async function Conversacion({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso("mensajes", "ver");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await crearClienteServidor();

  const { data: hilo } = await supabase.from("hilos")
    .select("id, asunto, estudiante_id, creado_en, estudiantes(personas(nombres, apellidos, nombre_preferido)), hilo_participantes(persona_id, leido_en)")
    .eq("id", id).maybeSingle();
  if (!hilo) notFound(); // la RLS devuelve vacío si no participo (ni superviso)
  const h = hilo as unknown as {
    id: string; asunto: string; estudiante_id: string | null;
    estudiantes: { personas: Persona | null } | null;
    hilo_participantes: { persona_id: string; leido_en: string | null }[];
  };
  const participo = h.hilo_participantes.some((p) => p.persona_id === sesion.personaId);

  const [{ data: msjs, error }, { data: pers }] = await Promise.all([
    supabase.from("mensajes").select("id, autor_persona_id, cuerpo, creado_en").eq("hilo_id", id).order("creado_en").limit(500),
    supabase.rpc("participantes_de_hilo", { p_hilo: id }),
  ]);
  const mensajes = (msjs ?? []) as Mensaje[];
  const nombres = new Map(((pers ?? []) as { persona_id: string; nombre: string }[]).filter((p) => p.nombre).map((p) => [p.persona_id, p.nombre]));
  const nombre = (pid: string) => nombres.get(pid) ?? NOMBRE_RESERVADO;

  // Abrir la conversación la marca como leída (solo si soy participante).
  if (participo) await supabase.rpc("marcar_hilo_leido", { p_hilo: id });

  const otros = h.hilo_participantes.filter((p) => p.persona_id !== sesion.personaId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <header className="mb-4 space-y-2">
        <Link href={participo ? "/panel/mensajes" : "/panel/mensajes?ver=supervision"} className="inline-flex min-h-11 items-center text-sm font-semibold text-marca hover:underline">← Mensajes</Link>
        <h1 className="break-words text-2xl font-bold tracking-tight">{h.asunto}</h1>
        <p className="text-sm text-suave">
          Con {otros.map((p) => nombre(p.persona_id)).join(", ") || "nadie más"}
          {!participo ? ` · entre ${h.hilo_participantes.map((p) => nombre(p.persona_id)).join(", ")}` : ""}
        </p>
        {h.estudiantes?.personas ? <Insignia tono="marca">Sobre {nombrePersona(h.estudiantes.personas)}</Insignia> : null}
      </header>

      {!participo ? (
        <div className="mb-4"><Aviso tono="neutro">Estás viendo esta conversación como supervisión de dirección: no formás parte y no podés responder.</Aviso></div>
      ) : null}
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar los mensajes. Actualizá la página.</Aviso></div> : null}

      <ol className="space-y-3" aria-label="Mensajes de la conversación">
        {mensajes.map((m) => {
          const mio = m.autor_persona_id === sesion.personaId;
          return (
            <li key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[75%] ${mio ? "rounded-br-sm bg-marca text-sobre-marca" : "rounded-bl-sm border border-borde bg-superficie"}`}>
                {!mio ? <p className="text-xs font-bold text-marca">{nombre(m.autor_persona_id)}</p> : <p className="sr-only">Vos</p>}
                <p className="whitespace-pre-wrap break-words">{m.cuerpo}</p>
                <p className={`mt-1 text-right text-xs ${mio ? "text-sobre-marca/75" : "text-suave"}`}><time dateTime={m.creado_en}>{fechaHora(m.creado_en)}</time></p>
              </div>
            </li>
          );
        })}
      </ol>

      {participo ? <div className="mt-4"><Respuesta hilo={id} /></div> : null}
    </div>
  );
}
