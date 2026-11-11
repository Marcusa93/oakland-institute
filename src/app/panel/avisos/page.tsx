import type { Metadata } from "next";
import { Aviso, Boton, EstadoVacio, Insignia, Tabla, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { esGestion, puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { marcarAvisoLeido } from "./acciones";
import { NuevoAviso, ReintentarEnvio } from "./formulario";

export const metadata: Metadata = { title: "Avisos" };

interface Persona { nombres: string; apellidos: string }
interface Recibido {
  id: string; leido_en: string | null; enviado_en: string | null;
  comunicaciones: { asunto: string; cuerpo: string; enviada_en: string | null; categoria: string; tipo: string; comisiones: { nombre: string } | null } | null;
  estudiantes: { persona_id: string; personas: Persona | null } | null;
}
interface Envio {
  id: string; canal: string; estado: string; destinatario_persona_id: string;
  enviado_en: string | null; entregado_en: string | null; leido_en: string | null;
  personas: Persona | null;
  estudiantes: { persona_id: string; personas: Persona | null } | null;
}
interface Enviado {
  id: string; tipo: string; categoria: string; asunto: string; cuerpo: string; estado: string;
  creada_en: string; enviada_en: string | null;
  comisiones: { nombre: string } | null;
  comunicacion_envios: Envio[];
}

const CATEGORIA: Record<string, [string, Tono]> = { general: ["General", "neutro"], academica: ["Académico", "marca"], economica: ["Económico", "alerta"] };
const CANAL: Record<string, string> = { interno: "Aviso en el panel", email: "Correo electrónico", whatsapp: "WhatsApp" };

function Categoria({ valor }: { valor: string }) {
  const [etiqueta, tono] = CATEGORIA[valor] ?? [valor, "neutro" as Tono];
  return <Insignia tono={tono}>{etiqueta}</Insignia>;
}

/** Nombre del destinatario o, si la base no deja verlo, a quién representa. */
function destinatario(e: Envio) {
  if (e.personas) return `${e.personas.apellidos}, ${e.personas.nombres}`;
  const est = e.estudiantes?.personas;
  return est ? `Responsable de ${est.nombres} ${est.apellidos}` : "Responsable (nombre no visible)";
}

/** Cada columna muestra solo lo que el canal permite saber. */
function celdas(e: Envio): [string, string, string] {
  if (e.canal === "interno") {
    return [e.enviado_en ? fechaHora(e.enviado_en) : "Pendiente", "No se registra en este canal", e.leido_en ? fechaHora(e.leido_en) : "Todavía no"];
  }
  if (e.estado === "fallido") return ["Falló el envío", "—", "—"];
  return [
    e.enviado_en ? fechaHora(e.enviado_en) : "Pendiente (no enviado)",
    e.entregado_en ? fechaHora(e.entregado_en) : "—",
    e.leido_en ? fechaHora(e.leido_en) : "—",
  ];
}

export default async function Avisos() {
  const sesion = await exigirPermiso("avisos", "ver");
  const supabase = await crearClienteServidor();
  const puedeCrear = puede(sesion.perfiles, "avisos", "crear");
  const gestion = esGestion(sesion.perfiles);

  const [recibidosR, enviadosR, comisionesR] = await Promise.all([
    supabase.from("comunicacion_envios")
      .select("id, leido_en, enviado_en, comunicaciones(asunto, cuerpo, enviada_en, categoria, tipo, comisiones(nombre)), estudiantes(persona_id, personas(nombres, apellidos))")
      .eq("destinatario_persona_id", sesion.personaId).eq("canal", "interno").order("enviado_en", { ascending: false }).limit(50),
    puedeCrear
      ? supabase.from("comunicaciones")
          .select("id, tipo, categoria, asunto, cuerpo, estado, creada_en, enviada_en, comisiones(nombre), comunicacion_envios(id, canal, estado, destinatario_persona_id, enviado_en, entregado_en, leido_en, personas!destinatario_persona_id(nombres, apellidos), estudiantes(persona_id, personas(nombres, apellidos)))")
          .eq("autor_cuenta_id", sesion.cuentaId).in("tipo", ["comision", "institucional"]).order("creada_en", { ascending: false }).limit(30)
      : null,
    !puedeCrear ? null : gestion
      ? supabase.from("comisiones").select("id, nombre, cursos(nombre)").in("estado", ["abierta", "en_curso"]).order("nombre")
      : supabase.from("comision_docentes").select("comisiones(id, nombre, estado, cursos(nombre))").eq("docente_persona_id", sesion.personaId).is("hasta", null),
  ]);

  const recibidos = ((recibidosR.data ?? []) as unknown as Recibido[]).filter((e) => e.comunicaciones);
  const enviados = (enviadosR?.data ?? []) as unknown as Enviado[];
  type Opcion = { id: string; nombre: string; estado?: string; cursos: { nombre: string } | null };
  const opciones = (gestion
    ? ((comisionesR?.data ?? []) as unknown as Opcion[])
    : ((comisionesR?.data ?? []) as unknown as { comisiones: Opcion | null }[]).map((f) => f.comisiones)
        .filter((k): k is Opcion => Boolean(k) && !["finalizada", "cancelada"].includes(k!.estado ?? "")))
    .map((k) => ({ id: k.id, etiqueta: k.cursos?.nombre ? `${k.nombre} · ${k.cursos.nombre}` : k.nombre }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  const sinLeer = recibidos.filter((e) => !e.leido_en).length;

  return (
    <>
      <Titulo descripcion="Los avisos que te envió el instituto y, si corresponde a tu perfil, los que enviaste vos.">Avisos</Titulo>

      <section aria-labelledby="recibidos">
        <h2 id="recibidos" className="mb-3 text-lg font-bold">
          Recibidos {sinLeer > 0 ? <Insignia tono="alerta">{sinLeer} sin leer</Insignia> : null}
        </h2>
        {recibidosR.error ? <Aviso tono="peligro">No pudimos cargar tus avisos. Actualizá la página.</Aviso> : recibidos.length === 0 ? (
          <EstadoVacio titulo="No tenés avisos">Cuando el instituto te envíe un aviso lo vas a ver acá.</EstadoVacio>
        ) : (
          <ul className="space-y-3">
            {recibidos.map((e) => {
              const c = e.comunicaciones!;
              const sobre = e.estudiantes && e.estudiantes.persona_id !== sesion.personaId ? e.estudiantes.personas : null;
              return (
                <li key={e.id}>
                  <Tarjeta className={e.leido_en ? "" : "border-marca"}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{c.asunto}</h3>
                        <p className="text-xs text-suave">
                          {fechaHora(c.enviada_en ?? e.enviado_en)}
                          {c.comisiones?.nombre ? ` · Comisión ${c.comisiones.nombre}` : c.tipo === "institucional" ? " · Aviso institucional" : ""}
                          {sobre ? ` · Por ${sobre.nombres} ${sobre.apellidos}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Categoria valor={c.categoria} />
                        {e.leido_en ? <Insignia>Leído</Insignia> : (
                          <form action={marcarAvisoLeido}><input type="hidden" name="envio" value={e.id} /><Boton variante="texto">Marcar como leído</Boton></form>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm">{c.cuerpo}</p>
                  </Tarjeta>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {puedeCrear ? (
        <>
          <section aria-labelledby="nuevo" className="mt-10">
            <h2 id="nuevo" className="mb-3 text-lg font-bold">Nuevo aviso</h2>
            {comisionesR?.error ? <Aviso tono="peligro">No pudimos cargar las comisiones. Actualizá la página.</Aviso> : !gestion && opciones.length === 0 ? (
              <EstadoVacio titulo="No tenés comisiones asignadas">Vas a poder enviar avisos cuando tengas una comisión a cargo.</EstadoVacio>
            ) : (
              <Tarjeta><NuevoAviso comisiones={opciones} gestion={gestion} /></Tarjeta>
            )}
          </section>

          <section aria-labelledby="enviados" className="mt-10">
            <h2 id="enviados" className="mb-1 text-lg font-bold">Enviados por mí</h2>
            <p className="mb-3 max-w-2xl text-sm text-suave">
              El aviso en el panel queda enviado en el momento y registra cuándo lo lee cada persona. El envío por correo electrónico todavía no está
              integrado: esos envíos figuran como pendientes y no salieron.
            </p>
            {enviadosR?.error ? <Aviso tono="peligro">No pudimos cargar los avisos enviados. Actualizá la página.</Aviso> : enviados.length === 0 ? (
              <EstadoVacio titulo="Todavía no enviaste avisos" />
            ) : (
              <ul className="space-y-3">
                {enviados.map((c) => {
                  const internos = c.comunicacion_envios.filter((e) => e.canal === "interno");
                  const correos = c.comunicacion_envios.filter((e) => e.canal === "email");
                  const leidos = internos.filter((e) => e.leido_en).length;
                  const correosPendientes = correos.filter((e) => !e.enviado_en).length;
                  const filas = [...c.comunicacion_envios].sort((a, b) => destinatario(a).localeCompare(destinatario(b), "es") || a.canal.localeCompare(b.canal));
                  return (
                    <li key={c.id}>
                      <Tarjeta>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold">{c.asunto}</h3>
                            <p className="text-xs text-suave">
                              {c.estado === "enviada" ? `Enviado ${fechaHora(c.enviada_en)}` : `Guardado ${fechaHora(c.creada_en)}`}
                              {" · "}{c.tipo === "institucional" ? "Institucional" : `Comisión ${c.comisiones?.nombre ?? ""}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Categoria valor={c.categoria} />
                            {c.estado !== "enviada" ? <Insignia tono="peligro">Borrador: no se envió</Insignia> : null}
                          </div>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm">{c.cuerpo}</p>

                        {c.estado !== "enviada" ? <ReintentarEnvio id={c.id} /> : (
                          <>
                            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                              <div className="rounded-base bg-fondo p-3"><dt className="text-suave">Enviado en el panel</dt><dd className="text-lg font-bold">{internos.length}</dd></div>
                              <div className="rounded-base bg-fondo p-3"><dt className="text-suave">Leído en el panel</dt><dd className="text-lg font-bold">{leidos} de {internos.length}</dd></div>
                              <div className="rounded-base bg-fondo p-3"><dt className="text-suave">Correo pendiente (no enviado)</dt><dd className="text-lg font-bold">{correosPendientes}</dd></div>
                            </dl>
                            {filas.length ? (
                              <details className="mt-3 text-sm">
                                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-marca">Detalle por destinatario ({internos.length})</summary>
                                <div className="mt-2">
                                  <Tabla leyenda={`Estado del aviso «${c.asunto}» por destinatario y canal`} encabezados={["Destinatario", "Canal", "Enviado", "Entregado", "Leído"]}>
                                    {filas.map((e) => {
                                      const [enviado, entregado, leido] = celdas(e);
                                      return (
                                        <tr key={e.id}>
                                          <th scope="row" className="px-3 py-2.5 text-left align-top font-medium">{destinatario(e)}</th>
                                          <td>{CANAL[e.canal] ?? e.canal}</td>
                                          <td>{enviado}</td>
                                          <td>{entregado}</td>
                                          <td>{leido}</td>
                                        </tr>
                                      );
                                    })}
                                  </Tabla>
                                </div>
                              </details>
                            ) : <p className="mt-3 text-sm text-suave">No hubo destinatarios: no había inscripciones activas que correspondieran.</p>}
                          </>
                        )}
                      </Tarjeta>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
