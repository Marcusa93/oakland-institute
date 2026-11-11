import type { Metadata } from "next";
import { Aviso, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, fechaHora, hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ActividadesYNotas } from "./actividades-y-notas";
import { ESTADOS_ASISTENCIA, ETIQUETA_ASISTENCIA, TONO_ASISTENCIA, hora, horariosVigentes, textoHorario, type Horario } from "../mis-comisiones/util";

export const metadata: Metadata = { title: "Cursada" };

interface Persona { nombres: string; apellidos: string }
interface Estudiante { id: string; persona_id: string; personas: Persona | null }
interface Vinculo { estudiante_id: string; estado: string; permiso_academico: boolean; parentesco: string | null }
interface Matricula {
  id: string; estudiante_id: string;
  comisiones: {
    nombre: string; modalidad: string;
    cursos: { nombre: string } | null; niveles: { nombre: string } | null;
    comision_horarios: Horario[];
    comision_docentes: { funcion: string; hasta: string | null; personas: Persona | null }[];
  } | null;
}
interface Asistencia { matricula_id: string; estado: string; clases: { fecha: string; hora_inicio: string } | null }
interface Observacion { id: string; estudiante_id: string; texto: string; creada_en: string }

const MODALIDAD: Record<string, string> = { presencial: "Presencial", virtual: "Virtual", mixta: "Mixta" };

export default async function Cursada() {
  const sesion = await exigirPermiso("inscripciones", "ver");
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();

  // Estudiantes de esta cuenta: el propio y los vinculados. Se filtra de forma
  // explícita (además de la RLS) para que un perfil con más alcance no vea de más.
  const [propioR, vinculosR] = await Promise.all([
    supabase.from("estudiantes").select("id, persona_id, personas(nombres, apellidos)").eq("persona_id", sesion.personaId).maybeSingle(),
    supabase.from("vinculos_responsables").select("estudiante_id, estado, permiso_academico, parentesco")
      .eq("responsable_persona_id", sesion.personaId).in("estado", ["aceptado", "verificado"]),
  ]);
  const vinculos = (vinculosR.data ?? []) as Vinculo[];
  const verificados = new Map(vinculos.filter((v) => v.estado === "verificado").map((v) => [v.estudiante_id, v]));
  const enVerificacion = vinculos.filter((v) => v.estado === "aceptado").length;

  const vinculadosR = verificados.size
    ? await supabase.from("estudiantes").select("id, persona_id, personas(nombres, apellidos)").in("id", [...verificados.keys()])
    : null;
  const propio = propioR.data as unknown as Estudiante | null;
  const estudiantes = [
    ...(propio ? [propio] : []),
    ...((vinculadosR?.data ?? []) as unknown as Estudiante[]).filter((e) => e.id !== propio?.id)
      .sort((a, b) => (a.personas?.nombres ?? "").localeCompare(b.personas?.nombres ?? "", "es")),
  ];
  const ids = estudiantes.map((e) => e.id);

  const [matriculasR, observacionesR] = ids.length
    ? await Promise.all([
        supabase.from("matriculas")
          .select("id, estudiante_id, comisiones(nombre, modalidad, cursos(nombre), niveles(nombre), comision_horarios(dia_semana, hora_inicio, hora_fin, vigencia, aulas(nombre)), comision_docentes(funcion, hasta, personas!docente_persona_id(nombres, apellidos)))")
          .in("estudiante_id", ids).eq("estado", "activa"),
        supabase.from("observaciones_estudiante").select("id, estudiante_id, texto, creada_en")
          .in("estudiante_id", ids).eq("visibilidad", "familia").order("creada_en", { ascending: false }).limit(60),
      ])
    : [null, null];
  const matriculas = (matriculasR?.data ?? []) as unknown as Matricula[];
  const observaciones = (observacionesR?.data ?? []) as Observacion[];

  const asistenciasR = matriculas.length
    ? await supabase.from("asistencias").select("matricula_id, estado, clases(fecha, hora_inicio)")
        .in("matricula_id", matriculas.map((m) => m.id)).order("registrada_en", { ascending: false }).limit(3000)
    : null;
  const asistencias = ((asistenciasR?.data ?? []) as unknown as Asistencia[]).filter((a) => a.clases);
  const error = propioR.error || vinculosR.error || vinculadosR?.error || matriculasR?.error || observacionesR?.error || asistenciasR?.error;

  return (
    <>
      <Titulo descripcion="Comisiones, horarios, asistencia y observaciones del equipo docente.">Cursada</Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar toda la información. Actualizá la página.</Aviso></div> : null}
      {enVerificacion > 0 ? (
        <div className="mb-4">
          <Aviso tono="alerta">
            {enVerificacion === 1 ? "Tenés un vínculo que administración todavía está verificando." : `Tenés ${enVerificacion} vínculos que administración todavía está verificando.`}
            {" "}Cuando lo confirmen, vas a ver acá la cursada.
          </Aviso>
        </div>
      ) : null}
      {!error && estudiantes.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay estudiantes asociados a tu cuenta">
          Si esperabas ver la cursada de alguien a tu cargo, pedí en administración que registren y verifiquen el vínculo.
        </EstadoVacio>
      ) : null}

      <div className="space-y-8">
        {estudiantes.map((e) => {
          const esPropio = e.persona_id === sesion.personaId;
          const vinculo = verificados.get(e.id);
          const sinPermiso = !esPropio && vinculo && !vinculo.permiso_academico;
          const suyas = matriculas.filter((m) => m.estudiante_id === e.id && m.comisiones);
          const notas = observaciones.filter((o) => o.estudiante_id === e.id).slice(0, 10);
          const nombre = e.personas ? `${e.personas.nombres} ${e.personas.apellidos}` : "Estudiante";
          return (
            <section key={e.id} aria-labelledby={`est-${e.id}`}>
              <h2 id={`est-${e.id}`} className="mb-3 text-xl font-bold">
                {nombre} {esPropio && estudiantes.length > 1 ? <span className="text-base font-normal text-suave">(vos)</span> : null}
              </h2>

              {sinPermiso ? (
                <EstadoVacio titulo="Tu vínculo no incluye la información académica">
                  Para ver comisiones, horarios y asistencia de {e.personas?.nombres ?? "este estudiante"}, pedí ese acceso en administración.
                </EstadoVacio>
              ) : suyas.length === 0 ? (
                <EstadoVacio titulo="No tiene comisiones activas">
                  Cuando administración confirme una inscripción, la vas a ver acá con sus horarios.
                </EstadoVacio>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {suyas.map((m) => {
                    const k = m.comisiones!;
                    const horarios = horariosVigentes(k.comision_horarios, hoy);
                    const docentes = k.comision_docentes.filter((d) => !d.hasta && d.personas).map((d) => `${d.personas!.nombres} ${d.personas!.apellidos}`);
                    const propias = asistencias.filter((a) => a.matricula_id === m.id)
                      .sort((a, b) => `${b.clases!.fecha}${b.clases!.hora_inicio}`.localeCompare(`${a.clases!.fecha}${a.clases!.hora_inicio}`));
                    return (
                      <Tarjeta key={m.id}>
                        <h3 className="text-lg font-bold">{k.cursos?.nombre ?? k.nombre}</h3>
                        <p className="text-sm text-suave">
                          {[k.niveles?.nombre ? `Nivel: ${k.niveles.nombre}` : null, `Comisión ${k.nombre}`, MODALIDAD[k.modalidad]].filter(Boolean).join(" · ")}
                        </p>
                        <dl className="mt-3 space-y-2 text-sm">
                          <div>
                            <dt className="font-semibold">Horarios</dt>
                            <dd>{horarios.length ? <ul>{horarios.map((h, i) => <li key={i}>{textoHorario(h)}</li>)}</ul> : <span className="text-suave">A confirmar.</span>}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold">{docentes.length > 1 ? "Docentes" : "Docente"}</dt>
                            <dd>{docentes.length ? docentes.join(" · ") : <span className="text-suave">A confirmar.</span>}</dd>
                          </div>
                        </dl>

                        <h4 className="mt-4 text-sm font-semibold">Asistencia</h4>
                        {propias.length === 0 ? (
                          <p className="text-sm text-suave">Todavía no hay asistencia registrada.</p>
                        ) : (
                          <>
                            <ul className="mt-1 flex flex-wrap gap-2" aria-label="Resumen de asistencia">
                              {ESTADOS_ASISTENCIA.map(([valor, etiqueta]) => (
                                <li key={valor}><Insignia tono={TONO_ASISTENCIA[valor]}>{etiqueta}: {propias.filter((a) => a.estado === valor).length}</Insignia></li>
                              ))}
                            </ul>
                            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-suave">Últimas clases</p>
                            <ul className="mt-1 divide-y divide-borde text-sm">
                              {propias.slice(0, 10).map((a, i) => (
                                <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                                  <span>{fecha(a.clases!.fecha)} · {hora(a.clases!.hora_inicio)}</span>
                                  <Insignia tono={TONO_ASISTENCIA[a.estado]}>{ETIQUETA_ASISTENCIA[a.estado] ?? a.estado}</Insignia>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </Tarjeta>
                    );
                  })}
                </div>
              )}

              {!sinPermiso ? <ActividadesYNotas estudianteId={e.id} nombre={e.personas?.nombres ?? "este estudiante"} esPropio={esPropio} /> : null}

              {!sinPermiso && notas.length ? (
                <div className="mt-4">
                  <h3 className="mb-2 text-base font-bold">Observaciones del equipo docente</h3>
                  <ul className="space-y-2">
                    {notas.map((o) => (
                      <li key={o.id} className="rounded-base border border-borde bg-superficie p-3 text-sm">
                        <p className="whitespace-pre-line">{o.texto}</p>
                        <p className="mt-1 text-xs text-suave">{fechaHora(o.creada_en)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
