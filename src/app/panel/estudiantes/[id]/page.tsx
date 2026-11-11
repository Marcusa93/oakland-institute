import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaTexto, Aviso, Boton, Campo, Enlace, EstadoVacio, Insignia, Selector, Tabla, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha, fechaHora, hoyISO, nombreCompleto, pesos } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  actualizarContacto, actualizarDatos, agregarObservacion, invitarACrearCuenta, invitarResponsable, revocarVinculo, verificarVinculo,
} from "../acciones";
import { edad, ESTADOS_ESTUDIANTE, esUuid, palabras, sumarImportes, uno } from "../comun";
import { Formulario, NuevoResponsable } from "../formulario";

export const metadata: Metadata = { title: "Ficha del estudiante" };

const TONO_ESTUDIANTE: Record<string, Tono> = { aspirante: "alerta", activo: "exito", inactivo: "neutro", egresado: "marca" };
const MATRICULA: Record<string, [string, Tono]> = {
  activa: ["Activa", "exito"], baja: ["Baja", "peligro"], cambiada: ["Cambió de comisión", "alerta"], finalizada: ["Finalizada", "neutro"],
};
const VINCULO: Record<string, [string, Tono]> = {
  invitado: ["Invitado, sin verificar", "alerta"], aceptado: ["Aceptó, falta verificar", "alerta"], verificado: ["Verificado", "exito"],
  rechazado: ["Rechazado", "neutro"], revocado: ["Revocado", "neutro"],
};
const VISIBILIDAD: Record<string, [string, Tono]> = {
  gestion: ["Solo gestión", "neutro"], docentes: ["Gestión y docentes", "marca"], familia: ["También la familia", "alerta"],
};
const ASISTENCIA = [["presente", "Presentes"], ["tarde", "Tardes"], ["ausente", "Ausentes"], ["justificada", "Justificadas"]] as const;
const ABIERTOS = ["invitado", "aceptado", "verificado"];

function Casilla({ name, children, marcada }: { name: string; children: React.ReactNode; marcada?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={marcada} /> {children}
    </label>
  );
}

export default async function FichaEstudiante({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ rq?: string }>;
}) {
  await exigirPermiso("estudiantes", "crear");
  const { id } = await params;
  const { rq = "" } = await searchParams;
  if (!esUuid(id)) notFound();
  const supabase = await crearClienteServidor();

  const { data: est, error: errorEst } = await supabase.from("estudiantes")
    .select("id, legajo, estado, fecha_alta, persona_id, personas(id, nombres, apellidos, nombre_preferido)")
    .eq("id", id).maybeSingle();
  if (errorEst) return <Aviso tono="peligro">No pudimos cargar la ficha. Actualizá la página.</Aviso>;
  if (!est) notFound();
  const persona = uno(est.personas as unknown as { id: string; nombres: string; apellidos: string; nombre_preferido: string | null });
  if (!persona) notFound();

  const [datosR, matriculasR, vinculosR, observacionesR, saldosR] = await Promise.all([
    supabase.from("personas_datos").select("tipo_documento, numero_documento, fecha_nacimiento, email, telefono, domicilio").eq("persona_id", est.persona_id).maybeSingle(),
    supabase.from("matriculas")
      .select("id, estado, fecha_alta, fecha_baja, motivo_baja, matricula_anterior_id, comisiones(id, nombre, cursos(nombre), niveles(nombre), ciclos_lectivos(nombre)), matriculas_pago(personas(nombres, apellidos))")
      .eq("estudiante_id", id).order("creada_en", { ascending: false }),
    supabase.from("vinculos_responsables")
      .select("id, estado, parentesco, permiso_academico, permiso_documental, permiso_economico, es_responsable_pago, es_contacto_emergencia, invitado_en, verificado_en, revocado_en, motivo_cierre, responsable_persona_id, personas(id, nombres, apellidos)")
      .eq("estudiante_id", id).order("invitado_en", { ascending: false }),
    supabase.from("observaciones_estudiante")
      .select("id, visibilidad, texto, creada_en, cuentas(personas(nombres, apellidos))")
      .eq("estudiante_id", id).order("creada_en", { ascending: false }).limit(50),
    supabase.from("obligaciones_saldo").select("saldo, vencimiento, estado").eq("estudiante_id", id).in("estado", ["pendiente", "parcial"]),
  ]);
  const datos = datosR.data;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const matriculas = (matriculasR.data ?? []) as any[];
  const vinculos = (vinculosR.data ?? []) as any[];
  const observaciones = (observacionesR.data ?? []) as any[];
  const saldos = (saldosR.data ?? []) as any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Segunda tanda: depende de las matrículas y de los responsables.
  const personasResp: string[] = [...new Set(vinculos.map((v) => v.responsable_persona_id as string))];
  const idsPersonas = [est.persona_id as string, ...personasResp];
  const tokens = palabras(rq);
  let busqueda = null;
  if (tokens.length > 0) {
    let c = supabase.from("personas").select("id, nombres, apellidos").is("eliminada_en", null).neq("id", est.persona_id)
      .order("apellidos").order("nombres").limit(8);
    for (const t of tokens) c = c.or(`apellidos.ilike.%${t}%,nombres.ilike.%${t}%`);
    busqueda = c;
  }
  const [cuentasR, contactosR, encontradasR, conteos] = await Promise.all([
    supabase.from("cuentas").select("persona_id").in("persona_id", idsPersonas),
    personasResp.length > 0
      ? supabase.from("personas_datos").select("persona_id, email, telefono").in("persona_id", personasResp)
      : null,
    busqueda,
    Promise.all(matriculas.flatMap((m) => ASISTENCIA.map(async ([estado]) => {
      const { count } = await supabase.from("asistencias").select("id", { count: "exact", head: true }).eq("matricula_id", m.id).eq("estado", estado);
      return [`${m.id}:${estado}`, count ?? 0] as const;
    }))),
  ]);
  const conCuenta = new Set((cuentasR.data ?? []).map((c) => c.persona_id as string));
  const contacto = new Map((contactosR?.data ?? []).map((c) => [c.persona_id as string, c as { email: string | null; telefono: string | null }]));
  const asistencia = new Map(conteos);
  const encontradas = (encontradasR?.data ?? []) as Array<{ id: string; nombres: string; apellidos: string }>;
  const conVinculoAbierto = new Set(vinculos.filter((v) => ABIERTOS.includes(v.estado)).map((v) => v.responsable_persona_id as string));

  const hoy = hoyISO();
  const anios = edad(datos?.fecha_nacimiento, hoy);
  const saldoTotal = sumarImportes(saldos.map((s) => s.saldo));
  const saldoVencido = sumarImportes(saldos.filter((s) => s.vencimiento < hoy).map((s) => s.saldo));
  const etiquetaEstado: Record<string, string> = Object.fromEntries(ESTADOS_ESTUDIANTE);
  const puedeInvitarEstudiante = !conCuenta.has(est.persona_id) && Boolean(datos?.email) && anios !== null && anios >= 18;

  return (
    <>
      <Titulo
        descripcion={<>Legajo {est.legajo} · Alta {fecha(est.fecha_alta)}{persona.nombre_preferido ? <> · Le dicen “{persona.nombre_preferido}”</> : null}</>}
        acciones={<Enlace href="/panel/estudiantes" variante="secundario">Volver al listado</Enlace>}>
        {nombreCompleto(persona)}
      </Titulo>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Datos</h2>
            <Insignia tono={TONO_ESTUDIANTE[est.estado]}>{etiquetaEstado[est.estado] ?? est.estado}</Insignia>
          </div>
          {datosR.error ? <div className="mt-2"><Aviso tono="peligro">No pudimos cargar los datos personales.</Aviso></div> : null}
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-suave">Documento</dt><dd>{datos?.numero_documento ? `${datos.tipo_documento} ${datos.numero_documento}` : "Sin cargar"}</dd></div>
            <div><dt className="text-suave">Fecha de nacimiento</dt><dd>{datos?.fecha_nacimiento ? `${fecha(datos.fecha_nacimiento)}${anios !== null ? ` (${anios} años)` : ""}` : "Sin cargar"}</dd></div>
            <div><dt className="text-suave">Email</dt><dd className="break-words">{datos?.email ?? "Sin cargar"}</dd></div>
            <div><dt className="text-suave">Teléfono</dt><dd>{datos?.telefono ?? "Sin cargar"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-suave">Domicilio</dt><dd>{datos?.domicilio ?? "Sin cargar"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-suave">Cuenta para entrar al sistema</dt>
              <dd>{conCuenta.has(est.persona_id) ? "Tiene cuenta" : anios !== null && anios < 18 ? "No corresponde: es menor, entra su responsable" : "No tiene"}</dd></div>
          </dl>
          {puedeInvitarEstudiante ? (
            <div className="mt-3">
              <Formulario accion={invitarACrearCuenta} boton="Invitar a crear cuenta" enviando="Enviando…" variante="secundario" className="grid gap-3">
                <input type="hidden" name="estudiante" value={id} />
                <input type="hidden" name="persona" value={est.persona_id} />
              </Formulario>
            </div>
          ) : !conCuenta.has(est.persona_id) && (anios === null || anios >= 18) ? (
            <p className="mt-3 text-sm text-suave">Para invitarlo a crear su cuenta hacen falta el email y la fecha de nacimiento (solo mayores de 18).</p>
          ) : null}
          <details className="mt-4 border-t border-borde pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-marca">Editar datos</summary>
            <div className="mt-3">
              <Formulario accion={actualizarDatos} boton="Guardar datos" className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="estudiante" value={id} />
                <Campo id="ed-apellidos" name="apellidos" etiqueta="Apellidos" required maxLength={80} defaultValue={persona.apellidos} />
                <Campo id="ed-nombres" name="nombres" etiqueta="Nombres" required maxLength={80} defaultValue={persona.nombres} />
                <Campo id="ed-preferido" name="nombre_preferido" etiqueta="Cómo prefiere que le digan" maxLength={60} defaultValue={persona.nombre_preferido ?? ""} />
                <Selector id="ed-estado" name="estado" etiqueta="Estado" defaultValue={est.estado}>
                  {ESTADOS_ESTUDIANTE.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
                </Selector>
                <Selector id="ed-tipo" name="tipo_documento" etiqueta="Tipo de documento" defaultValue={datos?.tipo_documento ?? "DNI"}>
                  <option value="DNI">DNI</option><option value="PASAPORTE">Pasaporte</option><option value="OTRO">Otro</option>
                </Selector>
                <Campo id="ed-documento" name="numero_documento" etiqueta="Número de documento" maxLength={20} defaultValue={datos?.numero_documento ?? ""} />
                <Campo id="ed-nacimiento" name="fecha_nacimiento" type="date" etiqueta="Fecha de nacimiento" defaultValue={datos?.fecha_nacimiento ?? ""} />
                <Campo id="ed-email" name="email" type="email" etiqueta="Email" maxLength={120} defaultValue={datos?.email ?? ""} />
                <Campo id="ed-telefono" name="telefono" type="tel" etiqueta="Teléfono" maxLength={40} defaultValue={datos?.telefono ?? ""} />
                <Campo id="ed-domicilio" name="domicilio" etiqueta="Domicilio" maxLength={200} defaultValue={datos?.domicilio ?? ""} />
              </Formulario>
            </div>
          </details>
        </Tarjeta>

        <Tarjeta>
          <h2 className="text-lg font-bold">Estado de cuenta</h2>
          {saldosR.error ? <div className="mt-2"><Aviso tono="peligro">No pudimos cargar el estado de cuenta.</Aviso></div> : (
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-suave">Saldo pendiente</dt><dd className="text-2xl font-bold">{pesos(saldoTotal)}</dd></div>
              <div><dt className="text-suave">De eso, ya vencido</dt><dd className="font-semibold">{pesos(saldoVencido)}</dd></div>
              <div><dt className="text-suave">Obligaciones sin pagar</dt><dd>{saldos.length}</dd></div>
            </dl>
          )}
          <div className="mt-3"><Enlace href="/panel/cobros" variante="secundario">Ir a cobros</Enlace></div>
        </Tarjeta>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold">Trayectoria</h2>
      {matriculasR.error ? <Aviso tono="peligro">No pudimos cargar las inscripciones.</Aviso> : matriculas.length === 0 ? (
        <EstadoVacio titulo="Todavía no tiene inscripciones">Se inscribe desde la pantalla de cada comisión.</EstadoVacio>
      ) : (
        <Tabla leyenda="Inscripciones del estudiante, de la más reciente a la más antigua" encabezados={["Comisión", "Estado", "Fechas", "Asistencia", "Paga"]}>
          {matriculas.map((m) => {
            const k = uno<any>(m.comisiones); // eslint-disable-line @typescript-eslint/no-explicit-any
            const [texto, tono] = MATRICULA[m.estado] ?? [m.estado, "neutro" as Tono];
            const total = ASISTENCIA.reduce((s, [e]) => s + (asistencia.get(`${m.id}:${e}`) ?? 0), 0);
            return (
              <tr key={m.id}>
                <td>
                  {k ? <Link href={`/panel/comisiones/${k.id}`} className="font-semibold text-marca underline-offset-4 hover:underline">{k.nombre}</Link> : "—"}
                  <p className="text-suave">{[uno<{ nombre: string }>(k?.cursos)?.nombre, uno<{ nombre: string }>(k?.niveles)?.nombre, uno<{ nombre: string }>(k?.ciclos_lectivos)?.nombre].filter(Boolean).join(" · ")}</p>
                  {m.matricula_anterior_id ? <p className="text-suave">Viene de un cambio de comisión</p> : null}
                </td>
                <td>
                  <Insignia tono={tono}>{texto}</Insignia>
                  {m.motivo_baja ? <p className="mt-1 text-suave">Motivo: {m.motivo_baja}</p> : null}
                </td>
                <td>Desde {fecha(m.fecha_alta)}{m.fecha_baja ? <><br />Hasta {fecha(m.fecha_baja)}</> : null}</td>
                <td>
                  {total === 0 ? <span className="text-suave">Sin registros</span> : (
                    <ul>{ASISTENCIA.map(([e, nombre]) => <li key={e}>{nombre}: {asistencia.get(`${m.id}:${e}`) ?? 0}</li>)}</ul>
                  )}
                </td>
                <td>{nombreCompleto(uno<{ nombres: string; apellidos: string }>(uno<any>(m.matriculas_pago)?.personas))}</td>{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
              </tr>
            );
          })}
        </Tabla>
      )}

      <h2 className="mb-2 mt-8 text-lg font-bold">Responsables</h2>
      {vinculosR.error ? <Aviso tono="peligro">No pudimos cargar los responsables.</Aviso> : null}
      {!vinculosR.error && vinculos.length === 0 ? (
        <EstadoVacio titulo="No tiene responsables cargados">Si es menor, agregá a la persona adulta que lo tiene a cargo.</EstadoVacio>
      ) : null}
      <ul className="space-y-4">
        {vinculos.map((v) => {
          const p = uno<{ id: string; nombres: string; apellidos: string }>(v.personas);
          const [texto, tono] = VINCULO[v.estado] ?? [v.estado, "neutro" as Tono];
          const abierto = ABIERTOS.includes(v.estado);
          const c = contacto.get(v.responsable_persona_id);
          const tieneCuenta = conCuenta.has(v.responsable_persona_id);
          return (
            <li key={v.id}>
              <Tarjeta>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{nombreCompleto(p)}{v.parentesco ? <span className="font-normal text-suave"> · {v.parentesco}</span> : null}</p>
                    <p className="text-sm text-suave">{[c?.telefono, c?.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Insignia tono={tono}>{texto}</Insignia>
                    {abierto ? <Insignia tono={tieneCuenta ? "exito" : "neutro"}>{tieneCuenta ? "Tiene cuenta" : "Sin cuenta"}</Insignia> : null}
                  </div>
                </div>
                <p className="mt-2 text-sm text-suave">
                  Agregado {fechaHora(v.invitado_en)}
                  {v.verificado_en ? ` · Verificado ${fechaHora(v.verificado_en)}` : ""}
                  {v.revocado_en ? ` · Revocado ${fechaHora(v.revocado_en)}` : ""}
                  {v.motivo_cierre ? ` · Motivo: ${v.motivo_cierre}` : ""}
                </p>
                {v.estado === "verificado" ? (
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label="Permisos">
                    <li><Insignia tono={v.permiso_academico ? "marca" : "neutro"}>Académico: {v.permiso_academico ? "sí" : "no"}</Insignia></li>
                    <li><Insignia tono={v.permiso_documental ? "marca" : "neutro"}>Documental: {v.permiso_documental ? "sí" : "no"}</Insignia></li>
                    <li><Insignia tono={v.permiso_economico ? "marca" : "neutro"}>Económico: {v.permiso_economico ? "sí" : "no"}</Insignia></li>
                    <li><Insignia tono={v.es_responsable_pago ? "exito" : "neutro"}>Responsable de pago: {v.es_responsable_pago ? "sí" : "no"}</Insignia></li>
                    {v.es_contacto_emergencia ? <li><Insignia>Contacto de emergencia</Insignia></li> : null}
                  </ul>
                ) : abierto ? (
                  <p className="mt-2 text-sm">Todavía no ve nada del estudiante: el acceso empieza cuando verificás el vínculo.</p>
                ) : null}

                {abierto ? (
                  <div className="mt-3 space-y-2 border-t border-borde pt-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-marca">{v.estado === "verificado" ? "Cambiar permisos" : "Verificar y dar permisos"}</summary>
                      <div className="mt-2">
                        <Formulario accion={verificarVinculo} boton={v.estado === "verificado" ? "Guardar permisos" : "Verificar vínculo"} className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                          <input type="hidden" name="estudiante" value={id} />
                          <input type="hidden" name="vinculo" value={v.id} />
                          <Casilla name="academico" marcada={v.permiso_academico}>Ve lo académico (cursada y asistencia)</Casilla>
                          <Casilla name="documental" marcada={v.permiso_documental}>Ve datos personales y documentos</Casilla>
                          <Casilla name="economico" marcada={v.permiso_economico}>Ve la cuenta y los pagos</Casilla>
                          <Casilla name="responsable_pago" marcada={v.es_responsable_pago}>Es responsable de pago</Casilla>
                          <Casilla name="contacto_emergencia" marcada={v.es_contacto_emergencia}>Es contacto de emergencia</Casilla>
                        </Formulario>
                      </div>
                    </details>
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-marca">Editar contacto</summary>
                      <div className="mt-2">
                        <Formulario accion={actualizarContacto} boton="Guardar contacto" className="grid gap-3 sm:grid-cols-3">
                          <input type="hidden" name="estudiante" value={id} />
                          <input type="hidden" name="persona" value={v.responsable_persona_id} />
                          <Campo id={`ce-${v.id}`} name="email" type="email" etiqueta="Email" maxLength={120} defaultValue={c?.email ?? ""} />
                          <Campo id={`ct-${v.id}`} name="telefono" type="tel" etiqueta="Teléfono" maxLength={40} defaultValue={c?.telefono ?? ""} />
                        </Formulario>
                      </div>
                    </details>
                    {!tieneCuenta ? (
                      c?.email ? (
                        <Formulario accion={invitarACrearCuenta} boton="Invitar a crear cuenta" enviando="Enviando…" variante="secundario" className="grid gap-3">
                          <input type="hidden" name="estudiante" value={id} />
                          <input type="hidden" name="persona" value={v.responsable_persona_id} />
                        </Formulario>
                      ) : <p className="text-sm text-suave">Para invitarlo a crear su cuenta, primero cargale un email.</p>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-peligro">Revocar vínculo</summary>
                      <div className="mt-2">
                        <Formulario accion={revocarVinculo} boton="Revocar" variante="peligro" className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <input type="hidden" name="estudiante" value={id} />
                          <input type="hidden" name="vinculo" value={v.id} />
                          <Campo id={`rev-${v.id}`} name="motivo" etiqueta="Motivo" required minLength={5} maxLength={300} ayuda="Al menos 5 caracteres. La persona pierde el acceso en el momento." />
                        </Formulario>
                      </div>
                    </details>
                  </div>
                ) : null}
              </Tarjeta>
            </li>
          );
        })}
      </ul>

      <Tarjeta className="mt-4">
        <h3 className="font-bold">Agregar responsable</h3>
        <p className="mt-1 text-sm text-suave">El vínculo se crea sin permisos. Recién cuando lo verificás, la persona puede ver al estudiante.</p>

        <h4 className="mt-4 text-sm font-semibold">Persona ya cargada</h4>
        <form method="get" role="search" className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Campo id="rq" name="rq" type="search" etiqueta="Buscar por apellido o nombre" defaultValue={rq} />
          <Boton type="submit" variante="secundario">Buscar</Boton>
        </form>
        {encontradasR?.error ? <div className="mt-2"><Aviso tono="peligro">No pudimos buscar. Probá de nuevo.</Aviso></div> : null}
        {tokens.length > 0 && !encontradasR?.error && encontradas.length === 0 ? (
          <p className="mt-2 text-sm text-suave">No encontramos a nadie con ese nombre. Podés cargarla como persona nueva.</p>
        ) : null}
        <ul className="mt-2 divide-y divide-borde">
          {encontradas.map((p) => (
            <li key={p.id} className="py-3">
              <p className="font-semibold">{nombreCompleto(p)}</p>
              {conVinculoAbierto.has(p.id) ? <p className="text-sm text-suave">Ya es responsable de este estudiante.</p> : (
                <Formulario accion={invitarResponsable} boton="Agregar como responsable" variante="secundario" className="mt-1 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input type="hidden" name="estudiante" value={id} />
                  <input type="hidden" name="persona" value={p.id} />
                  <Campo id={`par-${p.id}`} name="parentesco" etiqueta="Parentesco" maxLength={60} placeholder="Madre, padre, tutor…" />
                </Formulario>
              )}
            </li>
          ))}
        </ul>

        <h4 className="mt-4 text-sm font-semibold">Persona nueva</h4>
        <div className="mt-2"><NuevoResponsable estudianteId={id} /></div>
      </Tarjeta>

      <h2 className="mb-2 mt-8 text-lg font-bold">Observaciones</h2>
      <Tarjeta>
        <Formulario accion={agregarObservacion} boton="Guardar observación" className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <input type="hidden" name="estudiante" value={id} />
          <AreaTexto id="obs-texto" name="texto" etiqueta="Nueva observación" required maxLength={2000} />
          <Selector id="obs-visibilidad" name="visibilidad" etiqueta="¿Quién puede verla?" defaultValue="gestion">
            <option value="gestion">Solo gestión</option>
            <option value="docentes">Gestión y sus docentes</option>
            <option value="familia">También el estudiante y su familia</option>
          </Selector>
        </Formulario>
      </Tarjeta>
      {observacionesR.error ? <div className="mt-3"><Aviso tono="peligro">No pudimos cargar las observaciones.</Aviso></div> : null}
      {!observacionesR.error && observaciones.length === 0 ? (
        <div className="mt-3"><EstadoVacio titulo="Sin observaciones" /></div>
      ) : null}
      <ul className="mt-3 space-y-3">
        {observaciones.map((o) => {
          const [texto, tono] = VISIBILIDAD[o.visibilidad] ?? [o.visibilidad, "neutro" as Tono];
          const autor = uno<{ nombres: string; apellidos: string }>(uno<any>(o.cuentas)?.personas); // eslint-disable-line @typescript-eslint/no-explicit-any
          return (
            <li key={o.id}>
              <Tarjeta>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-suave">
                  <span>{fechaHora(o.creada_en)}{autor ? ` · ${nombreCompleto(autor)}` : ""}</span>
                  <Insignia tono={tono}>{texto}</Insignia>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm">{o.texto}</p>
              </Tarjeta>
            </li>
          );
        })}
      </ul>
    </>
  );
}
