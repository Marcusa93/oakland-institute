/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, EstadoVacio, Insignia, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha, fechaHora, hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { enlaceWa, mensajeConsulta, PLANTILLAS_CONSULTA, type PlantillaConsulta } from "@/lib/whatsapp";
import { ESTADOS } from "./estados";
import { Contactar, NuevaConsulta, Seguimiento } from "./formulario";

export const metadata: Metadata = { title: "Consultas" };

const TONO: Record<string, Tono> = { nueva: "alerta", contactada: "marca", nivelacion: "marca", solicitud: "marca", ganada: "exito", perdida: "neutro" };
const ABIERTAS = ["nueva", "contactada", "nivelacion", "solicitud"];
const ETAPA: Record<string, string> = { nueva: "Nuevas", contactada: "Contactadas", nivelacion: "En nivelación", solicitud: "Con solicitud" };
const ORIGEN: Record<string, string> = { web: "la página web", whatsapp: "WhatsApp", telefono: "teléfono", presencial: "el instituto", referido: "recomendación", redes: "redes sociales", otro: "otro medio" };
const SUGERIDA: Record<string, PlantillaConsulta> = { nueva: "primer", contactada: "nivel", nivelacion: "nivel", solicitud: "seguimiento" };

const dia = (iso: string | null) => (iso ? hoyISO(new Date(iso)) : null);
function dias(desde: string, hasta: string) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

/** Qué hay que hacer con la consulta hoy (null si no toca todavía). */
function pendiente(c: { estado: string; creada_en: string; proxima_accion: string | null; proxima_accion_en: string | null }, hoy: string): { texto: string; tono: Tono; orden: number } | null {
  if (!ABIERTAS.includes(c.estado)) return null;
  const agenda = dia(c.proxima_accion_en);
  if (c.estado === "nueva") {
    const n = dias(dia(c.creada_en)!, hoy);
    return { texto: n <= 0 ? "Sin responder · llegó hoy" : `Sin responder hace ${n} ${n === 1 ? "día" : "días"}`, tono: n >= 1 ? "peligro" : "alerta", orden: -100 - n };
  }
  if (!agenda) return { texto: "Sin próxima acción", tono: "alerta", orden: 0 };
  const n = dias(agenda, hoy);
  if (n > 0) return { texto: `Atrasada: ${c.proxima_accion ?? "seguimiento"} (era para el ${fecha(agenda)})`, tono: "peligro", orden: -n };
  if (n === 0) return { texto: `Hoy: ${c.proxima_accion ?? "seguimiento"}`, tono: "marca", orden: 1 };
  return null;
}

export default async function Consultas({ searchParams }: { searchParams: Promise<{ ver?: string; estado?: string }> }) {
  const sesion = await exigirPermiso("consultas", "ver");
  const { ver: verParam, estado: estadoParam } = await searchParams;
  const ver = verParam === "cerradas" ? "cerradas" : verParam === "abiertas" || estadoParam ? "abiertas" : "hoy";
  const filtroEstado = estadoParam && ABIERTAS.includes(estadoParam) ? estadoParam : null;
  const hoy = hoyISO();
  const manana = new Date(Date.parse(`${hoy}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const supabase = await crearClienteServidor();

  const [{ data, error }, resumen, cursos, yo] = await Promise.all([
    supabase.from("consultas")
      .select("id, creada_en, tipo, nombre_contacto, email, telefono, es_para_menor, nombre_estudiante, edad_estudiante, mensaje, origen, estado, responsable_cuenta_id, proxima_accion, proxima_accion_en, motivo_perdida, cursos(nombre), consulta_eventos(ocurrido_en, tipo, nota, estado_nuevo)")
      .in("estado", ver === "cerradas" ? ["ganada", "perdida"] : filtroEstado ? [filtroEstado] : ABIERTAS)
      .order("creada_en", { ascending: false })
      .limit(ver === "cerradas" ? 100 : 300),
    supabase.from("consultas").select("estado, creada_en, proxima_accion, proxima_accion_en").in("estado", ABIERTAS).limit(1000),
    supabase.from("cursos").select("id, nombre").eq("publicado", true).order("nombre"),
    supabase.from("personas").select("nombres, nombre_preferido").eq("id", sesion.personaId).maybeSingle(),
  ]);
  const etiqueta = Object.fromEntries(ESTADOS) as Record<string, string>;
  const abiertas = (resumen.data ?? []) as any[];
  const porEstado = Object.fromEntries(ABIERTAS.map((e) => [e, abiertas.filter((c) => c.estado === e).length]));
  const paraHoy = abiertas.filter((c) => pendiente(c, hoy)).length;
  const quien = yo.data?.nombre_preferido ?? yo.data?.nombres ?? null;

  let filas = ((data ?? []) as any[]).map((c) => ({ ...c, tarea: pendiente(c, hoy) }));
  if (ver === "hoy") filas = filas.filter((c) => c.tarea).sort((a, b) => a.tarea.orden - b.tarea.orden);

  const pestana = (href: string, activa: boolean, texto: string) => (
    <Link href={href} aria-current={activa ? "page" : undefined}
      className="inline-flex min-h-11 items-center rounded-full px-4 font-semibold hover:bg-marca-suave aria-[current]:bg-marca aria-[current]:text-sobre-marca">{texto}</Link>
  );

  return (
    <>
      <Titulo descripcion="Cada consulta tiene un responsable, una próxima acción y su historial. «Para hoy» junta lo que no puede esperar.">
        Consultas
      </Titulo>

      <nav aria-label="Vistas" className="mb-4 flex flex-wrap gap-2 text-sm">
        {pestana("/panel/consultas", ver === "hoy", `Para hoy (${paraHoy})`)}
        {pestana("/panel/consultas?ver=abiertas", ver === "abiertas" && !filtroEstado, `Abiertas (${abiertas.length})`)}
        {pestana("/panel/consultas?ver=cerradas", ver === "cerradas", "Cerradas")}
      </nav>

      {/* Embudo: dónde está cada consulta abierta. */}
      <ol aria-label="Consultas abiertas por etapa" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ABIERTAS.map((e) => (
          <li key={e}>
            <Link href={`/panel/consultas?estado=${e}`} aria-current={filtroEstado === e ? "page" : undefined}
              className="flex min-h-16 flex-col justify-center rounded-[1.25rem] border border-borde bg-superficie px-4 py-2 hover:border-marca aria-[current]:border-marca aria-[current]:bg-marca-suave">
              <span className="text-2xl font-bold tabular-nums">{porEstado[e]}</span>
              <span className="text-sm text-suave">{ETAPA[e]}</span>
            </Link>
          </li>
        ))}
      </ol>

      <details className="mb-6 rounded-[1.5rem] border border-borde bg-superficie p-5">
        <summary className="cursor-pointer font-semibold text-marca">＋ Cargar una consulta que llegó por WhatsApp, teléfono o en el instituto</summary>
        <div className="mt-4"><NuevaConsulta cursos={(cursos.data ?? []) as { id: string; nombre: string }[]} manana={manana} /></div>
      </details>

      {error ? <Aviso tono="peligro">No pudimos cargar las consultas. Actualizá la página.</Aviso> : null}
      {!error && filas.length === 0 ? (
        ver === "hoy"
          ? <EstadoVacio titulo="Nada pendiente para hoy">Todas las consultas abiertas tienen su próxima acción agendada para más adelante.</EstadoVacio>
          : <EstadoVacio titulo="No hay consultas en esta vista">Las que lleguen desde la página web aparecen acá automáticamente.</EstadoVacio>
      ) : null}

      <ul className="space-y-4">
        {filas.map((c: any) => {
          const datos = { nombre: c.nombre_contacto, curso: c.cursos?.nombre, estudiante: c.es_para_menor ? c.nombre_estudiante : null, quien };
          const whatsapp = enlaceWa(c.telefono, "")
            ? Object.fromEntries((Object.keys(PLANTILLAS_CONSULTA) as PlantillaConsulta[]).map((p) => [p, enlaceWa(c.telefono, mensajeConsulta(p, datos))!])) as Record<PlantillaConsulta, string>
            : null;
          const eventos = [...(c.consulta_eventos ?? [])].sort((a: any, b: any) => b.ocurrido_en.localeCompare(a.ocurrido_en));
          const abierta = ABIERTAS.includes(c.estado);
          return (
            <li key={c.id}>
              <Tarjeta>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{c.nombre_contacto}</p>
                    <p className="text-sm text-suave">{[c.telefono, c.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.tipo === "preinscripcion" ? <Insignia tono="marca">Preinscripción</Insignia> : null}
                    <Insignia tono={TONO[c.estado]}>{etiqueta[c.estado]}</Insignia>
                    {c.responsable_cuenta_id === sesion.cuentaId ? <Insignia>A mi cargo</Insignia> : !c.responsable_cuenta_id ? <Insignia tono="alerta">Sin responsable</Insignia> : null}
                  </div>
                </div>
                {c.tarea ? <p className="mt-2"><Insignia tono={c.tarea.tono}>{c.tarea.texto}</Insignia></p> : null}
                <p className="mt-2 text-sm">
                  {c.cursos?.nombre ? <>Le interesa <strong>{c.cursos.nombre}</strong>. </> : null}
                  {c.es_para_menor ? <>Es para {c.nombre_estudiante ?? "un menor"}{c.edad_estudiante ? ` (${c.edad_estudiante} años)` : ""}. </> : null}
                  <span className="text-suave">Llegó por {ORIGEN[c.origen] ?? c.origen} el {fechaHora(c.creada_en)}</span>
                  {!c.tarea && abierta && c.proxima_accion_en ? <span className="text-suave"> · Próximo paso: {c.proxima_accion ?? "seguimiento"}, el {fecha(dia(c.proxima_accion_en))}.</span> : null}
                </p>
                {c.mensaje ? <p className="mt-2 rounded-base bg-fondo p-3 text-sm">{c.mensaje}</p> : null}
                {abierta ? <Contactar id={c.id} whatsapp={whatsapp} sugerida={SUGERIDA[c.estado] ?? "seguimiento"} telefono={c.telefono} email={c.email} /> : null}
                <details className="mt-3 border-t border-borde pt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-marca">Actualizar seguimiento · historial ({eventos.length})</summary>
                  <Seguimiento consulta={c} esMia={c.responsable_cuenta_id === sesion.cuentaId} />
                  <ol className="mt-4 space-y-1 text-suave">
                    {eventos.map((e: any, i: number) => (
                      <li key={i}>
                        {fechaHora(e.ocurrido_en)} — {e.tipo === "nota" ? e.nota : e.tipo === "contacto" ? `Contacto por ${e.nota}` : e.tipo === "asignacion" ? "Cambio de responsable" : e.tipo === "creacion" ? "Consulta recibida" : `Pasó a «${etiqueta[e.estado_nuevo] ?? e.estado_nuevo}»${e.nota ? `: ${e.nota}` : ""}`}
                      </li>
                    ))}
                  </ol>
                </details>
              </Tarjeta>
            </li>
          );
        })}
      </ul>
    </>
  );
}
