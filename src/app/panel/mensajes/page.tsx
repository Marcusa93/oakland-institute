import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Enlace, EstadoVacio, Insignia, Titulo } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { NOMBRE_RESERVADO, REGLAS_CANAL, nombrePersona } from "./comun";

export const metadata: Metadata = { title: "Mensajes" };

interface Persona { nombres: string; apellidos: string; nombre_preferido: string | null }
interface Hilo {
  id: string; asunto: string; estudiante_id: string | null; actualizado_en: string;
  estudiantes: { personas: Persona | null } | null;
  hilo_participantes: { persona_id: string; leido_en: string | null }[];
}
interface Mensaje { hilo_id: string; autor_persona_id: string; cuerpo: string; creado_en: string }

export default async function Mensajes({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sesion = await exigirPermiso("mensajes", "ver");
  const { ver } = await searchParams;
  const direccion = sesion.perfiles.includes("direccion");
  const supervision = direccion && ver === "supervision";
  const supabase = await crearClienteServidor();

  // Mis conversaciones: los hilos donde participo. Supervisión (solo dirección):
  // hilos sobre un estudiante de los que no soy parte.
  const { data: propios, error: errorPropios } = await supabase.from("hilo_participantes").select("hilo_id").eq("persona_id", sesion.personaId).limit(500);
  const misIds = ((propios ?? []) as { hilo_id: string }[]).map((p) => p.hilo_id);

  let consulta = supabase.from("hilos")
    .select("id, asunto, estudiante_id, actualizado_en, estudiantes(personas(nombres, apellidos, nombre_preferido)), hilo_participantes(persona_id, leido_en)")
    .order("actualizado_en", { ascending: false }).limit(80);
  if (supervision) {
    consulta = consulta.not("estudiante_id", "is", null);
    if (misIds.length) consulta = consulta.not("id", "in", `(${misIds.join(",")})`);
  } else {
    consulta = consulta.in("id", misIds.length ? misIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data, error } = await consulta;
  const hilos = (data ?? []) as unknown as Hilo[];

  // Último mensaje de cada hilo (para la vista previa y para saber si hay algo sin leer).
  const ids = hilos.map((h) => h.id);
  const { data: msjs } = ids.length
    ? await supabase.from("mensajes").select("hilo_id, autor_persona_id, cuerpo, creado_en").in("hilo_id", ids).order("creado_en", { ascending: false }).limit(1000)
    : { data: [] };
  const ultimo = new Map<string, Mensaje>();
  for (const m of (msjs ?? []) as Mensaje[]) if (!ultimo.has(m.hilo_id)) ultimo.set(m.hilo_id, m);

  // Nombres de los participantes que la RLS deja leer.
  const personasIds = [...new Set(hilos.flatMap((h) => h.hilo_participantes.map((p) => p.persona_id)))].filter((x) => x !== sesion.personaId);
  const { data: pers } = personasIds.length
    ? await supabase.from("personas").select("id, nombres, apellidos, nombre_preferido").in("id", personasIds)
    : { data: [] };
  const nombres = new Map(((pers ?? []) as (Persona & { id: string })[]).map((p) => [p.id, nombrePersona(p)!]));
  // Los que la RLS de personas no deja leer (p. ej. gestión para una familia) salen de participantes_de_hilo.
  const conFaltantes = hilos.filter((h) => h.hilo_participantes.some((p) => p.persona_id !== sesion.personaId && !nombres.has(p.persona_id)));
  const extras = await Promise.all(conFaltantes.map((h) => supabase.rpc("participantes_de_hilo", { p_hilo: h.id }).then(({ data }) => (data ?? []) as { persona_id: string; nombre: string }[])));
  for (const p of extras.flat()) if (p.nombre && !nombres.has(p.persona_id)) nombres.set(p.persona_id, p.nombre);

  const filas = hilos.map((h) => {
    const yo = h.hilo_participantes.find((p) => p.persona_id === sesion.personaId);
    const u = ultimo.get(h.id);
    const fechaUltimo = u?.creado_en ?? h.actualizado_en;
    const noLeido = !supervision && !!u && u.autor_persona_id !== sesion.personaId && (!yo?.leido_en || new Date(fechaUltimo) > new Date(yo.leido_en));
    const otros = h.hilo_participantes.filter((p) => p.persona_id !== sesion.personaId).map((p) => nombres.get(p.persona_id) ?? NOMBRE_RESERVADO);
    return { ...h, u, fechaUltimo, noLeido, otros: [...new Set(otros)] };
  });
  const sinLeer = filas.filter((f) => f.noLeido).length;

  return (
    <>
      <Titulo descripcion={supervision ? "Conversaciones sobre estudiantes entre docentes, familias y el instituto. Solo lectura." : "Conversaciones con docentes, familias y el equipo del instituto."}
        acciones={<Enlace href="/panel/mensajes/nueva">Nueva conversación</Enlace>}>
        Mensajes{sinLeer > 0 ? <span className="sr-only"> ({sinLeer} sin leer)</span> : null}
      </Titulo>

      {direccion ? (
        <nav aria-label="Vista" className="mb-4 flex gap-4 text-sm font-semibold">
          <Link href="/panel/mensajes" aria-current={!supervision ? "page" : undefined} className="inline-flex min-h-11 items-center aria-[current]:underline">Mis conversaciones</Link>
          <Link href="/panel/mensajes?ver=supervision" aria-current={supervision ? "page" : undefined} className="inline-flex min-h-11 items-center aria-[current]:underline">Supervisión</Link>
        </nav>
      ) : null}

      <p className="mb-4 rounded-base border border-borde bg-superficie px-3 py-2 text-sm text-suave">{REGLAS_CANAL}</p>

      {error || errorPropios ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar los mensajes. Actualizá la página.</Aviso></div> : null}
      {!error && filas.length === 0 ? (
        <EstadoVacio titulo={supervision ? "No hay conversaciones para supervisar" : "Todavía no tenés conversaciones"}>
          {supervision ? "Cuando docentes y familias conversen sobre un estudiante, vas a poder leerlas acá." : <>Empezá una con <Link href="/panel/mensajes/nueva" className="font-semibold text-marca underline">Nueva conversación</Link>.</>}
        </EstadoVacio>
      ) : null}

      {filas.length > 0 ? <ul className="divide-y divide-borde overflow-hidden rounded-base border border-borde bg-superficie">
        {filas.map((f) => (
          <li key={f.id}>
            <Link href={`/panel/mensajes/${f.id}`} className={`flex gap-3 px-4 py-3 hover:bg-marca-suave focus-visible:bg-marca-suave ${f.noLeido ? "bg-cielo-suave/40" : ""}`}>
              <span aria-hidden className={`mt-2 size-2.5 shrink-0 rounded-full ${f.noLeido ? "bg-acento" : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={`min-w-0 break-words ${f.noLeido ? "font-bold" : "font-semibold"}`}>{f.asunto}</span>
                  <span className="shrink-0 text-xs text-suave">{fechaHora(f.fechaUltimo)}</span>
                </span>
                <span className="block truncate text-sm text-suave">{f.otros.join(", ") || "Solo vos"}</span>
                {f.u ? (
                  <span className="block truncate text-sm">
                    {f.u.autor_persona_id === sesion.personaId ? "Vos: " : ""}{f.u.cuerpo}
                  </span>
                ) : null}
                <span className="mt-1 flex flex-wrap gap-2">
                  {f.noLeido ? <Insignia tono="peligro">Sin leer</Insignia> : null}
                  {f.estudiantes?.personas ? <Insignia tono="marca">Sobre {nombrePersona(f.estudiantes.personas)}</Insignia> : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul> : null}
    </>
  );
}
