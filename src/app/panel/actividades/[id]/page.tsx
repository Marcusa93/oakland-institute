import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reproductor } from "@/componentes/grabador";
import { Aviso, Boton, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { firmarAudios } from "@/lib/audios";
import { fechaHora } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { eliminarBorrador } from "../acciones";
import {
  ESTADO_ACTIVIDAD, ETIQUETA_EVALUACION, ETIQUETA_HABILIDAD, ICONO_HABILIDAD, REACCION, TONO_EVALUACION, UUID,
  ahora, numero, porcentaje, vencimiento,
} from "../comun";
import { CambiarEstado, Correccion, EnVivo, PublicarTodas } from "../correccion";

export const metadata: Metadata = { title: "Resultados de la actividad" };

interface Actividad {
  id: string; titulo: string; consigna: string; habilidad: string; evaluacion: string; estado: string;
  cierra_en: string | null; puntaje_max: string; comision_id: string; comisiones: { nombre: string } | null;
}
interface Pregunta {
  id: string; orden: number; enunciado: string; tipo: "opcion" | "texto"; opciones: string[];
  actividad_claves: { correcta: number } | { correcta: number }[] | null;
}
interface Entrega {
  id: string; matricula_id: string; estado: string; respuestas: Record<string, unknown>; texto: string | null;
  entregada_en: string | null; puntaje_auto: string | null; nota: string | null; devolucion: string | null;
  reaccion: string | null; publicada: boolean;
  audio_ruta: string | null; audio_segundos: number | null; devolucion_audio: string | null;
}
interface Matricula { id: string; estudiantes: { personas: { nombres: string; apellidos: string } | null } | null }

const clave = (p: Pregunta) => {
  const k = Array.isArray(p.actividad_claves) ? p.actividad_claves[0] : p.actividad_claves;
  return k ? k.correcta : null;
};
const letra = (i: number) => String.fromCharCode(65 + i);

export default async function ResultadosActividad({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ creada?: string }>;
}) {
  await exigirPermiso("actividades", "aprobar");
  const [{ id }, { creada }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const supabase = await crearClienteServidor();

  const actividadR = await supabase.from("actividades")
    .select("id, titulo, consigna, habilidad, evaluacion, estado, cierra_en, puntaje_max, comision_id, comisiones(nombre)")
    .eq("id", id).maybeSingle();
  const a = actividadR.data as unknown as Actividad | null;
  if (!a) notFound();

  const [preguntasR, entregasR, matriculasR] = await Promise.all([
    supabase.from("actividad_preguntas").select("id, orden, enunciado, tipo, opciones, actividad_claves(correcta)").eq("actividad_id", id).order("orden"),
    supabase.from("entregas").select("id, matricula_id, estado, respuestas, texto, entregada_en, puntaje_auto, nota, devolucion, reaccion, publicada, audio_ruta, audio_segundos, devolucion_audio")
      .eq("actividad_id", id).order("entregada_en", { ascending: true }),
    supabase.from("matriculas").select("id, estudiantes(personas(nombres, apellidos))").eq("comision_id", a.comision_id).eq("estado", "activa"),
  ]);
  const preguntas = (preguntasR.data ?? []) as unknown as Pregunta[];
  const entregas = ((entregasR.data ?? []) as Entrega[]).filter((e) => e.estado !== "en_curso");
  const matriculas = (matriculasR.data ?? []) as unknown as Matricula[];
  const audios = await firmarAudios(supabase, entregas.flatMap((e) => [e.audio_ruta, e.devolucion_audio]));
  const fallo = preguntasR.error || entregasR.error || matriculasR.error;

  const nombre = new Map(matriculas.map((m) => [m.id, m.estudiantes?.personas ? `${m.estudiantes.personas.nombres} ${m.estudiantes.personas.apellidos}` : "Estudiante"]));
  const conEntrega = new Set(entregas.map((e) => e.matricula_id));
  const faltan = matriculas.filter((m) => !conEntrega.has(m.id)).map((m) => nombre.get(m.id)!).sort((x, y) => x.localeCompare(y, "es"));
  const deOpcion = preguntas.filter((p) => p.tipo === "opcion" && clave(p) !== null);
  const totalObjetivo = deOpcion.length;
  const hayAbiertas = preguntas.some((p) => p.tipo === "texto") || preguntas.length === 0;
  const puntajeMax = Number(a.puntaje_max);

  // Qué les costó: porcentaje de acierto y elección por opción, por pregunta.
  const analisis = deOpcion.map((p) => {
    const k = clave(p)!;
    const elecciones = p.opciones.map((_, i) => entregas.filter((e) => String(e.respuestas?.[p.id]) === String(i)).length);
    const respondieron = elecciones.reduce((s, n) => s + n, 0);
    return { p, k, elecciones, respondieron, pct: porcentaje(elecciones[k] ?? 0, entregas.length) };
  });
  const masDificil = analisis.length && entregas.length ? [...analisis].sort((x, y) => x.pct - y.pct)[0] : null;

  const porCorregir = entregas.filter((e) => e.estado === "entregada");
  const sinPublicar = entregas.filter((e) => e.estado === "corregida" && !e.publicada);
  const ordenadas = [...porCorregir, ...sinPublicar, ...entregas.filter((e) => e.estado === "corregida" && e.publicada)];
  const v = vencimiento(a.cierra_en, ahora());
  const [estadoTexto, estadoTono] = ESTADO_ACTIVIDAD[a.estado] ?? [a.estado, "neutro"];
  const pctEntregas = porcentaje(entregas.length, matriculas.length);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/panel/actividades" className="font-semibold text-marca hover:underline">← Actividades</Link></p>
      <Titulo descripcion={<>{a.comisiones?.nombre} · {ETIQUETA_HABILIDAD[a.habilidad]} · cierre {a.cierra_en ? fechaHora(a.cierra_en) : "sin fecha"}</>}
        acciones={<div className="flex flex-wrap items-center gap-2">
          {a.estado === "borrador" ? (
            <>
              <CambiarEstado actividad={a.id} estado="publicada" etiqueta="Publicar" variante="primario" />
              <form action={eliminarBorrador}><input type="hidden" name="id" value={a.id} /><Boton type="submit" variante="texto">Eliminar borrador</Boton></form>
            </>
          ) : a.estado === "publicada" ? (
            <CambiarEstado actividad={a.id} estado="cerrada" etiqueta="Cerrar entregas" confirmar="¿Cerrar la actividad? Nadie más va a poder entregar." />
          ) : <CambiarEstado actividad={a.id} estado="publicada" etiqueta="Reabrir" />}
        </div>}>
        <span lang="en"><span aria-hidden>{ICONO_HABILIDAD[a.habilidad]} </span>{a.titulo}</span>
      </Titulo>

      {creada === "publicada" ? <div className="mb-4"><Aviso tono="exito">¡Listo! La actividad está publicada y tus estudiantes ya la ven en «Mis actividades».</Aviso></div> : null}
      {creada === "borrador" ? <div className="mb-4"><Aviso>Guardamos el borrador. Publicalo cuando quieras que lo vean tus estudiantes.</Aviso></div> : null}
      {fallo ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar todos los resultados. Actualizá la página.</Aviso></div> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Insignia tono={estadoTono}>{estadoTexto}</Insignia>
          <Insignia tono={TONO_EVALUACION[a.evaluacion]}>{ETIQUETA_EVALUACION[a.evaluacion]}</Insignia>
          {a.estado === "publicada" ? <Insignia tono={v.tono}>{v.texto}</Insignia> : null}
          <Insignia>Puntaje máximo {numero(a.puntaje_max)}</Insignia>
        </div>
        {a.estado === "publicada" ? <EnVivo /> : null}
      </div>

      <details className="mb-6 rounded-base border border-borde bg-superficie p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-marca">Consigna y preguntas ({preguntas.length})</summary>
        <p className="mt-2 whitespace-pre-line" lang="en">{a.consigna}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          {preguntas.map((p) => (
            <li key={p.id} lang="en">
              {p.enunciado}
              {p.tipo === "opcion" ? (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {p.opciones.map((o, i) => <li key={i}><Insignia tono={clave(p) === i ? "exito" : "neutro"}>{letra(i)}. {o}{clave(p) === i ? " ✓" : ""}</Insignia></li>)}
                </ul>
              ) : <span className="ml-2 text-xs text-suave">(abierta)</span>}
            </li>
          ))}
        </ol>
      </details>

      {a.estado === "borrador" ? (
        <EstadoVacio titulo="Todavía es un borrador">Cuando la publiques, acá vas a ver las entregas en vivo y vas a poder corregir.</EstadoVacio>
      ) : (
        <>
          <section aria-labelledby="t-entregas" className="mb-6 grid gap-4 lg:grid-cols-3">
            <Tarjeta className="lg:col-span-1">
              <h2 id="t-entregas" className="font-bold">Entregas</h2>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-marca-fuerte">{entregas.length}<span className="text-lg font-semibold text-suave"> de {matriculas.length}</span></p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-pizarra" role="img" aria-label={`${pctEntregas} % entregado`}>
                <div className="h-full rounded-full bg-marca transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${pctEntregas}%` }} />
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <li><Insignia tono="alerta">{porCorregir.length} para corregir</Insignia></li>
                <li><Insignia tono="marca">{sinPublicar.length} sin publicar</Insignia></li>
                <li><Insignia tono="exito">{entregas.length - porCorregir.length - sinPublicar.length} publicadas</Insignia></li>
              </ul>
              <h3 className="mt-4 text-sm font-semibold">Falta entregar ({faltan.length})</h3>
              {faltan.length ? (
                <ul className="mt-1 flex flex-wrap gap-1.5">{faltan.map((n, i) => <li key={`${n}-${i}`}><Insignia>{n}</Insignia></li>)}</ul>
              ) : <p className="text-sm text-exito">¡Entregaron todos!</p>}
            </Tarjeta>

            <Tarjeta className="lg:col-span-2">
              <h2 className="font-bold">Qué les costó</h2>
              {analisis.length === 0 ? (
                <p className="mt-1 text-sm text-suave">Esta actividad no tiene preguntas de corrección automática.</p>
              ) : entregas.length === 0 ? (
                <p className="mt-1 text-sm text-suave">Cuando lleguen entregas vas a ver el porcentaje de acierto de cada pregunta.</p>
              ) : (
                <>
                  {masDificil && masDificil.pct < 70 ? (
                    <p className="globo globo-izq mb-6 mt-2 bg-alerta-suave px-4 py-2.5 text-sm text-alerta">
                      La que más costó: <strong lang="en">«{masDificil.p.enunciado}»</strong> ({masDificil.pct} % de acierto). Buena candidata para repasar en clase.
                    </p>
                  ) : null}
                  <ol className="mt-2 space-y-3">
                    {analisis.map(({ p, k, elecciones, pct }) => (
                      <li key={p.id}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span lang="en"><strong>{p.orden}.</strong> {p.enunciado}</span>
                          <span className={`shrink-0 font-bold ${pct < 50 ? "text-peligro" : pct < 75 ? "text-alerta" : "text-exito"}`}>{pct} %</span>
                        </div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-pizarra" role="img" aria-label={`${pct} % de acierto`}>
                          <div className={`h-full rounded-full ${pct < 50 ? "bg-acento" : pct < 75 ? "bg-alerta" : "bg-exito"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-suave">
                          {p.opciones.map((o, i) => (
                            <span key={i} className={i === k ? "font-semibold text-exito" : ""} lang="en">{letra(i)}. {o}: {elecciones[i]}{i === k ? " ✓" : ""}</span>
                          ))}
                        </p>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </Tarjeta>
          </section>

          <section aria-labelledby="t-correccion">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="t-correccion" className="text-lg font-bold">Corrección rápida</h2>
                <p className="text-sm text-suave">
                  {a.evaluacion === "acreditante" ? "Acreditante: el estudiante ve aciertos y nota recién cuando publicás." : "Poné nota, una reacción y una devolución. Publicá de a una o todas juntas."}
                </p>
              </div>
              <PublicarTodas actividad={a.id} cantidad={sinPublicar.length} />
            </div>
            {ordenadas.length === 0 ? (
              <EstadoVacio titulo="Todavía no hay entregas">Esta página se actualiza sola: las entregas aparecen apenas llegan.</EstadoVacio>
            ) : (
              <ul className="space-y-3">
                {ordenadas.map((e, i) => {
                  const auto = Number(e.puntaje_auto ?? 0);
                  const sugerida = totalObjetivo && !hayAbiertas ? Math.round((auto / totalObjetivo) * puntajeMax * 2) / 2 : null;
                  const r = e.reaccion ? REACCION[e.reaccion] : null;
                  return (
                    <li key={e.id}>
                      <details open={i === 0 && e.estado === "entregada"} className="group rounded-base border border-borde bg-superficie p-4 open:ring-1 open:ring-marca">
                        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{nombre.get(e.matricula_id) ?? "Estudiante"}</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs">
                            {totalObjetivo ? <Insignia tono="marca">Automático {numero(auto)}/{totalObjetivo}</Insignia> : null}
                            {e.estado === "entregada" ? <Insignia tono="alerta">Para corregir</Insignia>
                              : e.publicada ? <Insignia tono="exito">Publicada · {numero(e.nota)}{r ? ` ${r.icono}` : ""}</Insignia>
                              : <Insignia>Sin publicar · {numero(e.nota)}</Insignia>}
                            <span className="text-suave">{fechaHora(e.entregada_en)}</span>
                          </span>
                        </summary>
                        <ol className="mt-3 space-y-2 text-sm">
                          {preguntas.map((p) => {
                            const resp = e.respuestas?.[p.id];
                            if (p.tipo === "opcion") {
                              const elegida = resp === undefined || resp === null || resp === "" ? null : Number(resp);
                              const ok = elegida !== null && elegida === clave(p);
                              return (
                                <li key={p.id} className="flex gap-2">
                                  <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${elegida === null ? "bg-pizarra text-suave" : ok ? "bg-exito text-white" : "bg-acento text-white"}`}>{elegida === null ? "–" : ok ? "✓" : "✗"}</span>
                                  <span lang="en">
                                    <span className="text-suave">{p.orden}. {p.enunciado}</span>{" "}
                                    <strong>{elegida === null ? "Sin responder" : p.opciones[elegida] ?? "—"}</strong>
                                    <span className="sr-only">{elegida === null ? "" : ok ? " (correcta)" : " (incorrecta)"}</span>
                                    {elegida !== null && !ok && clave(p) !== null ? <span className="text-xs text-exito"> → {p.opciones[clave(p)!]}</span> : null}
                                  </span>
                                </li>
                              );
                            }
                            return (
                              <li key={p.id}>
                                <p className="text-suave" lang="en">{p.orden}. {p.enunciado}</p>
                                <p className="mt-1 whitespace-pre-line rounded-base bg-pizarra p-3" lang="en">{typeof resp === "string" && resp.trim() ? resp : <span className="text-suave">Sin respuesta.</span>}</p>
                              </li>
                            );
                          })}
                        </ol>
                        {e.audio_ruta && audios.get(e.audio_ruta) ? (
                          <div className="mt-3 rounded-base bg-cielo-suave p-3">
                            <p className="mb-2 text-sm font-semibold">
                              <span aria-hidden>🗣️ </span>Grabación{e.audio_segundos ? ` · ${Math.floor(e.audio_segundos / 60)}:${String(e.audio_segundos % 60).padStart(2, "0")}` : ""}
                            </p>
                            <Reproductor src={audios.get(e.audio_ruta)!} etiqueta={`Grabación de ${nombre.get(e.matricula_id) ?? "el estudiante"}`} />
                          </div>
                        ) : a.habilidad === "habla" ? <p className="mt-3 text-sm text-suave">Esta entrega no tiene grabación.</p> : null}
                        {e.texto ? <p className="mt-2 whitespace-pre-line rounded-base bg-pizarra p-3 text-sm" lang="en">{e.texto}</p> : null}
                        <Correccion entrega={e} actividad={a.id} puntajeMax={puntajeMax} sugerida={sugerida}
                          audioDevolucion={e.devolucion_audio ? audios.get(e.devolucion_audio) ?? null : null} />
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
