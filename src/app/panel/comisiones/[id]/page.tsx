import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, Boton, Campo, Enlace, EstadoVacio, Insignia, Selector, Tabla, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, fechaHora, hoyISO, nombreCompleto } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { buscarEstudiantes, esUuid, uno, type PersonaBasica } from "../../estudiantes/comun";
import { Formulario } from "../../estudiantes/formulario";
import {
  actualizarComision, agregarAEspera, agregarHorario, asignarDocente, cambiarDeComision, darDeBaja, inscribir,
  quitarDocente, quitarHorario, reservar, retirarDeEspera,
} from "../acciones";
import { CamposHorario, ESTADOS_COMISION, estadoComision, ordenarHorarios, textoHorario } from "../comun";

export const metadata: Metadata = { title: "Comisión" };

type Nombre = { nombre: string };
/* eslint-disable @typescript-eslint/no-explicit-any */
const personaDe = (fila: any) => uno<PersonaBasica>(uno<any>(fila.estudiantes)?.personas);
const legajoDe = (fila: any) => uno<{ legajo: string }>(fila.estudiantes)?.legajo ?? "";
/* eslint-enable @typescript-eslint/no-explicit-any */

export default async function Comision({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ eq?: string }>;
}) {
  await exigirPermiso("comisiones", "crear");
  const { id } = await params;
  const { eq = "" } = await searchParams;
  if (!esUuid(id)) notFound();
  const supabase = await crearClienteServidor();

  const { data: k, error: errorK } = await supabase.from("comisiones")
    .select("id, nombre, cupo, estado, publicada, fecha_inicio, fecha_fin, ciclo_id, sede_id, cursos(nombre), niveles(nombre), ciclos_lectivos(nombre), sedes(nombre), comision_horarios(id, dia_semana, hora_inicio, hora_fin, aulas(nombre)), comision_docentes(id, funcion, desde, hasta, docente_persona_id, personas(nombres, apellidos))")
    .eq("id", id).maybeSingle();
  if (errorK) return <Aviso tono="peligro">No pudimos cargar la comisión. Actualizá la página.</Aviso>;
  if (!k) notFound();

  const buscando = eq.trim().length > 0;
  const [ocupacionR, matriculasR, reservasR, esperaR, destinosR, aulasR, rolesR, encontradosR] = await Promise.all([
    supabase.from("comisiones_ocupacion").select("inscriptos, reservas").eq("comision_id", id).maybeSingle(),
    supabase.from("matriculas")
      .select("id, fecha_alta, estudiante_id, estudiantes(id, legajo, personas(id, nombres, apellidos)), matriculas_pago(personas(nombres, apellidos))")
      .eq("comision_id", id).eq("estado", "activa"),
    supabase.from("reservas_vacante").select("id, vence_en, creada_en, estudiante_id, estudiantes(id, legajo, personas(id, nombres, apellidos))")
      .eq("comision_id", id).eq("estado", "vigente").order("vence_en"),
    supabase.from("lista_espera").select("id, estado, creada_en, estudiante_id, estudiantes(id, legajo, personas(id, nombres, apellidos))")
      .eq("comision_id", id).in("estado", ["esperando", "ofrecida"]).order("creada_en"),
    supabase.from("comisiones").select("id, nombre").eq("ciclo_id", k.ciclo_id).in("estado", ["abierta", "en_curso"]).neq("id", id).order("nombre"),
    supabase.from("aulas").select("id, nombre").eq("sede_id", k.sede_id).eq("activa", true).order("nombre"),
    supabase.from("roles_asignados").select("cuenta_id").eq("rol", "docente").is("revocado_en", null),
    buscando ? buscarEstudiantes(supabase, eq, { limite: 8 }) : null,
  ]);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const matriculas = ((matriculasR.data ?? []) as any[])
    .sort((a, b) => nombreCompleto(personaDe(a)).localeCompare(nombreCompleto(personaDe(b)), "es"));
  const reservas = (reservasR.data ?? []) as any[];
  const espera = (esperaR.data ?? []) as any[];
  const horarios = ordenarHorarios((k.comision_horarios ?? []) as any[]);
  const asignaciones = (k.comision_docentes ?? []) as any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const destinos = (destinosR.data ?? []) as Array<{ id: string; nombre: string }>;
  const aulas = (aulasR.data ?? []) as Array<{ id: string; nombre: string }>;
  const encontrados = encontradosR?.filas ?? [];

  // Docentes disponibles: personas con rol docente vigente y cuenta activa.
  const cuentasDocentes = (rolesR.data ?? []).map((r) => r.cuenta_id as string);
  const cuentasR = cuentasDocentes.length > 0
    ? await supabase.from("cuentas").select("persona_id").in("id", cuentasDocentes).eq("estado", "activa")
    : null;
  const personasDocentes = (cuentasR?.data ?? []).map((c) => c.persona_id as string);
  const [docentesR, vinculosR] = await Promise.all([
    personasDocentes.length > 0 ? supabase.from("personas").select("id, nombres, apellidos").in("id", personasDocentes).order("apellidos") : null,
    encontrados.length > 0
      ? supabase.from("vinculos_responsables").select("estudiante_id, responsable_persona_id, es_responsable_pago, parentesco, personas(nombres, apellidos)")
        .in("estudiante_id", encontrados.map((e) => e.id)).eq("estado", "verificado")
      : null,
  ]);
  const vigentes = asignaciones.filter((a) => !a.hasta);
  const yaAsignados = new Set(vigentes.map((a) => a.docente_persona_id as string));
  const docentes = ((docentesR?.data ?? []) as PersonaBasica[]).filter((d) => !yaAsignados.has(d.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vinculos = (vinculosR?.data ?? []) as any[];

  const ahora = new Date().getTime();
  const inscriptos = ocupacionR.data?.inscriptos ?? matriculas.length;
  const reservadas = ocupacionR.data?.reservas ?? 0;
  const libres = k.cupo - inscriptos - reservadas;
  const admite = k.estado === "abierta" || k.estado === "en_curso";
  const [textoEstado, tonoEstado] = estadoComision(k.estado);
  const inscriptosIds = new Set(matriculas.map((m) => m.estudiante_id as string));
  const reservaIds = new Set(reservas.filter((r) => Date.parse(r.vence_en) > ahora).map((r) => r.estudiante_id as string));
  const esperaIds = new Set(espera.map((e) => e.estudiante_id as string));

  return (
    <>
      <Titulo
        descripcion={[uno<Nombre>(k.cursos as unknown as Nombre)?.nombre, uno<Nombre>(k.niveles as unknown as Nombre)?.nombre, uno<Nombre>(k.ciclos_lectivos as unknown as Nombre)?.nombre, uno<Nombre>(k.sedes as unknown as Nombre)?.nombre].filter(Boolean).join(" · ")}
        acciones={<Enlace href={`/panel/comisiones?ciclo=${k.ciclo_id}`} variante="secundario">Volver a comisiones</Enlace>}>
        {k.nombre}
      </Titulo>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Lugares</h2>
            <div className="flex flex-wrap gap-2">
              <Insignia tono={tonoEstado}>{textoEstado}</Insignia>
              <Insignia tono={k.publicada ? "marca" : "neutro"}>{k.publicada ? "Publicada" : "No publicada"}</Insignia>
            </div>
          </div>
          {ocupacionR.error ? <div className="mt-2"><Aviso tono="peligro">No pudimos calcular los lugares ocupados.</Aviso></div> : null}
          <p className="mt-3 text-2xl font-bold">{inscriptos + reservadas} de {k.cupo}</p>
          <p className="text-sm text-suave">{inscriptos} inscriptos · {reservadas} reservas vigentes · {libres > 0 ? `${libres} libres` : "sin lugar"}</p>
          <p className="mt-1 text-sm text-suave">Del {fecha(k.fecha_inicio)} al {fecha(k.fecha_fin)}</p>
          {!admite ? <div className="mt-2"><Aviso tono="alerta">No admite inscripciones ni reservas mientras esté “{textoEstado}”.</Aviso></div> : null}
          <details className="mt-3 border-t border-borde pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-marca">Cambiar estado o cupo</summary>
            <div className="mt-2">
              <Formulario accion={actualizarComision} boton="Guardar" className="grid gap-3">
                <input type="hidden" name="comision" value={id} />
                <Selector id="ec-estado" name="estado" etiqueta="Estado" defaultValue={k.estado}>
                  {ESTADOS_COMISION.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
                </Selector>
                <Campo id="ec-cupo" name="cupo" type="number" min={1} max={500} inputMode="numeric" etiqueta="Cupo" required defaultValue={k.cupo} />
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="publicada" defaultChecked={k.publicada} /> Mostrar en la página web</label>
              </Formulario>
            </div>
          </details>
        </Tarjeta>

        <Tarjeta>
          <h2 className="text-lg font-bold">Horarios</h2>
          {horarios.length === 0 ? <p className="mt-2 text-sm text-suave">Sin horarios cargados.</p> : (
            <ul className="mt-2 divide-y divide-borde text-sm">
              {horarios.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span>{textoHorario(h)}</span>
                  <Formulario accion={quitarHorario} boton="Quitar" enviando="Quitando…" variante="secundario" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="comision" value={id} />
                    <input type="hidden" name="id" value={h.id} />
                  </Formulario>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-3 border-t border-borde pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-marca">Agregar horario</summary>
            <div className="mt-2">
              <Formulario accion={agregarHorario} boton="Agregar horario" className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="comision" value={id} />
                <CamposHorario prefijo="dh" aulas={aulas} />
              </Formulario>
            </div>
          </details>
        </Tarjeta>

        <Tarjeta>
          <h2 className="text-lg font-bold">Docentes</h2>
          {vigentes.length === 0 ? <p className="mt-2 text-sm text-suave">Sin docente asignado.</p> : (
            <ul className="mt-2 divide-y divide-borde text-sm">
              {vigentes.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span>{nombreCompleto(uno(a.personas))} <span className="text-suave">· {a.funcion} · desde {fecha(a.desde)}</span></span>
                  <Formulario accion={quitarDocente} boton="Quitar" enviando="Quitando…" variante="secundario" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="comision" value={id} />
                    <input type="hidden" name="id" value={a.id} />
                  </Formulario>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-3 border-t border-borde pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-marca">Asignar docente</summary>
            <div className="mt-2">
              {rolesR.error || cuentasR?.error || docentesR?.error ? <Aviso tono="peligro">No pudimos cargar la lista de docentes.</Aviso> : docentes.length === 0 ? (
                <p className="text-sm text-suave">No hay más personas con rol de docente para asignar. El rol lo otorga dirección.</p>
              ) : (
                <Formulario accion={asignarDocente} boton="Asignar" className="grid gap-3">
                  <input type="hidden" name="comision" value={id} />
                  <Selector id="ad-docente" name="docente" etiqueta="Docente" required>
                    {docentes.map((d) => <option key={d.id} value={d.id}>{nombreCompleto(d)}</option>)}
                  </Selector>
                  <Selector id="ad-funcion" name="funcion" etiqueta="Función" defaultValue="titular">
                    <option value="titular">Titular</option><option value="auxiliar">Auxiliar</option><option value="suplente">Suplente</option>
                  </Selector>
                  <Campo id="ad-desde" name="desde" type="date" etiqueta="Desde" required defaultValue={hoyISO()} />
                </Formulario>
              )}
            </div>
          </details>
        </Tarjeta>
      </div>

      <Tarjeta className="mt-6">
        <h2 className="text-lg font-bold">Inscribir o reservar</h2>
        <form method="get" role="search" className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Campo id="eq" name="eq" type="search" etiqueta="Buscar estudiante por apellido, nombre o legajo" defaultValue={eq} />
          <Boton type="submit" variante="secundario">Buscar</Boton>
        </form>
        {encontradosR?.error ? <div className="mt-2"><Aviso tono="peligro">No pudimos buscar. Probá de nuevo.</Aviso></div> : null}
        {buscando && !encontradosR?.error && encontrados.length === 0 ? (
          <p className="mt-2 text-sm text-suave">No encontramos estudiantes. Si es nuevo, primero dalo de alta en <Link className="font-semibold text-marca underline" href="/panel/estudiantes">Estudiantes</Link>.</p>
        ) : null}
        <ul className="mt-2 divide-y divide-borde">
          {encontrados.map((e) => {
            const responsables = vinculos.filter((v) => v.estudiante_id === e.id);
            const predeterminado = responsables.find((v) => v.es_responsable_pago)?.responsable_persona_id ?? e.persona.id;
            const tieneReserva = reservaIds.has(e.id);
            return (
              <li key={e.id} className="py-3">
                <p className="font-semibold">
                  <Link href={`/panel/estudiantes/${e.id}`} className="text-marca underline-offset-4 hover:underline">{nombreCompleto(e.persona)}</Link>
                  <span className="font-normal text-suave"> · {e.legajo}</span>
                </p>
                {inscriptosIds.has(e.id) ? <p className="text-sm text-suave">Ya está inscripto en esta comisión.</p>
                  : !admite ? <p className="text-sm text-suave">La comisión no admite inscripciones en este estado.</p> : (
                    <div className="mt-2 grid gap-4 lg:grid-cols-2">
                      {libres > 0 || tieneReserva ? (
                        <Formulario accion={inscribir} boton="Confirmar inscripción" className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <input type="hidden" name="comision" value={id} />
                          <input type="hidden" name="estudiante" value={e.id} />
                          <Selector id={`rp-${e.id}`} name="responsable_pago" etiqueta="¿Quién se hace cargo del pago?" defaultValue={predeterminado}>
                            <option value={e.persona.id}>El propio estudiante</option>
                            {responsables.map((v) => (
                              <option key={v.responsable_persona_id} value={v.responsable_persona_id}>
                                {nombreCompleto(uno(v.personas))}{v.parentesco ? ` (${v.parentesco})` : ""}{v.es_responsable_pago ? " — responsable de pago" : ""}
                              </option>
                            ))}
                          </Selector>
                        </Formulario>
                      ) : null}
                      {tieneReserva ? <p className="text-sm text-suave">Tiene una reserva vigente: al inscribirlo usa ese lugar.</p>
                        : libres > 0 ? (
                          <Formulario accion={reservar} boton="Reservar vacante" variante="secundario" className="grid gap-3 sm:grid-cols-[1fr_auto]">
                            <input type="hidden" name="comision" value={id} />
                            <input type="hidden" name="estudiante" value={e.id} />
                            <Campo id={`hs-${e.id}`} name="horas" type="number" min={1} max={720} inputMode="numeric" etiqueta="Guardar el lugar por (horas)" required defaultValue={72} />
                          </Formulario>
                        ) : esperaIds.has(e.id) ? <p className="text-sm text-suave">No hay lugar. Ya está en la lista de espera.</p> : (
                          <Formulario accion={agregarAEspera} boton="Agregar a lista de espera" variante="secundario" className="grid gap-3">
                            <input type="hidden" name="comision" value={id} />
                            <input type="hidden" name="estudiante" value={e.id} />
                            <p className="text-sm text-suave">No hay lugar en la comisión.</p>
                          </Formulario>
                        )}
                    </div>
                  )}
                {responsables.length === 0 && !inscriptosIds.has(e.id) && admite ? (
                  <p className="mt-1 text-xs text-suave">No tiene responsables verificados. Si paga otra persona, agregala y verificala en la ficha del estudiante.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <h2 className="mb-2 mt-8 text-lg font-bold">Inscriptos ({matriculas.length})</h2>
      {matriculasR.error ? <Aviso tono="peligro">No pudimos cargar los inscriptos.</Aviso> : matriculas.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay inscriptos">Buscá al estudiante arriba para inscribirlo.</EstadoVacio>
      ) : (
        <Tabla leyenda="Estudiantes inscriptos en la comisión" encabezados={["Estudiante", "Inscripto", "Paga", "Acciones"]}>
          {matriculas.map((m) => (
            <tr key={m.id}>
              <td>
                <Link href={`/panel/estudiantes/${m.estudiante_id}`} className="font-semibold text-marca underline-offset-4 hover:underline">{nombreCompleto(personaDe(m))}</Link>
                <p className="text-suave">{legajoDe(m)}</p>
              </td>
              <td>{fecha(m.fecha_alta)}</td>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <td>{nombreCompleto(uno<{ nombres: string; apellidos: string }>(uno<any>(m.matriculas_pago)?.personas))}</td>
              <td className="min-w-64 space-y-2">
                <details>
                  <summary className="cursor-pointer font-semibold text-marca">Cambiar de comisión</summary>
                  <div className="mt-2">
                    {destinos.length === 0 ? <p className="text-suave">No hay otra comisión abierta en este ciclo.</p> : (
                      <Formulario accion={cambiarDeComision} boton="Cambiar" className="grid gap-3">
                        <input type="hidden" name="comision" value={id} />
                        <input type="hidden" name="estudiante" value={m.estudiante_id} />
                        <input type="hidden" name="matricula" value={m.id} />
                        <Selector id={`cd-${m.id}`} name="destino" etiqueta="Pasa a" required>
                          {destinos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                        </Selector>
                        <Campo id={`cm-${m.id}`} name="motivo" etiqueta="Motivo (opcional)" maxLength={300} />
                      </Formulario>
                    )}
                  </div>
                </details>
                <details>
                  <summary className="cursor-pointer font-semibold text-peligro">Dar de baja</summary>
                  <div className="mt-2">
                    <Formulario accion={darDeBaja} boton="Dar de baja" variante="peligro" className="grid gap-3">
                      <input type="hidden" name="comision" value={id} />
                      <input type="hidden" name="estudiante" value={m.estudiante_id} />
                      <input type="hidden" name="matricula" value={m.id} />
                      <Campo id={`bm-${m.id}`} name="motivo" etiqueta="Motivo" required minLength={5} maxLength={300} />
                    </Formulario>
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </Tabla>
      )}

      <h2 className="mb-2 mt-8 text-lg font-bold">Reservas de vacante</h2>
      {reservasR.error ? <Aviso tono="peligro">No pudimos cargar las reservas.</Aviso> : reservas.length === 0 ? (
        <EstadoVacio titulo="No hay reservas vigentes" />
      ) : (
        <Tabla leyenda="Reservas de vacante de la comisión" encabezados={["Estudiante", "Reservada", "Vence", ""]}>
          {reservas.map((r) => {
            const vencida = Date.parse(r.vence_en) <= ahora;
            return (
              <tr key={r.id}>
                <td><Link href={`/panel/estudiantes/${r.estudiante_id}`} className="font-semibold text-marca underline-offset-4 hover:underline">{nombreCompleto(personaDe(r))}</Link><p className="text-suave">{legajoDe(r)}</p></td>
                <td>{fechaHora(r.creada_en)}</td>
                <td>{fechaHora(r.vence_en)} {vencida ? <Insignia tono="neutro">Vencida: ya no ocupa lugar</Insignia> : null}</td>
                <td>{!vencida && !inscriptosIds.has(r.estudiante_id) ? <Link className="font-semibold text-marca underline" href={`/panel/comisiones/${id}?eq=${encodeURIComponent(legajoDe(r))}`}>Inscribir</Link> : null}</td>
              </tr>
            );
          })}
        </Tabla>
      )}

      <h2 className="mb-2 mt-8 text-lg font-bold">Lista de espera</h2>
      {esperaR.error ? <Aviso tono="peligro">No pudimos cargar la lista de espera.</Aviso> : espera.length === 0 ? (
        <EstadoVacio titulo="Nadie en lista de espera">Cuando la comisión se llena, podés anotar acá a quienes quieran un lugar.</EstadoVacio>
      ) : (
        <Tabla leyenda="Lista de espera, por orden de llegada" encabezados={["Orden", "Estudiante", "Anotado", "Acciones"]}>
          {espera.map((e, i) => (
            <tr key={e.id}>
              <td>{i + 1}</td>
              <td><Link href={`/panel/estudiantes/${e.estudiante_id}`} className="font-semibold text-marca underline-offset-4 hover:underline">{nombreCompleto(personaDe(e))}</Link><p className="text-suave">{legajoDe(e)}</p></td>
              <td>{fechaHora(e.creada_en)}</td>
              <td className="space-y-2">
                {libres > 0 && admite ? <p><Link className="font-semibold text-marca underline" href={`/panel/comisiones/${id}?eq=${encodeURIComponent(legajoDe(e))}`}>Hay lugar: inscribir</Link></p> : null}
                <Formulario accion={retirarDeEspera} boton="Quitar de la lista" enviando="Quitando…" variante="secundario" className="grid gap-2">
                  <input type="hidden" name="comision" value={id} />
                  <input type="hidden" name="id" value={e.id} />
                </Formulario>
              </td>
            </tr>
          ))}
        </Tabla>
      )}
    </>
  );
}
