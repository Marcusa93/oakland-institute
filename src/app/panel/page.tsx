/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
import Link from "next/link";
import { Aviso, Boton, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { fechaHora, pesos } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { exigirSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { marcarLeida, responderVinculo } from "./acciones";

function Acceso({ href, titulo, dato, detalle }: { href: string; titulo: string; dato?: string | number; detalle: string }) {
  return (
    <Link href={href} className="block rounded-base border border-borde bg-superficie p-4 hover:border-marca">
      <p className="text-sm font-semibold text-suave">{titulo}</p>
      {dato !== undefined ? <p className="mt-1 text-3xl font-bold">{dato}</p> : null}
      <p className="mt-1 text-sm text-suave">{detalle}</p>
    </Link>
  );
}

interface Progreso {
  racha: number;
  xp_semana: number;
  meta_semanal: number;
  practico_hoy: boolean;
  medallas?: Array<{ obtenida_en: string | null }>;
}
interface EntregaResumen { titulo: string; estado: string; cierra_en: string | null }

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const sesion = await exigirSesion();
  const { aviso } = await searchParams;
  const supabase = await crearClienteServidor();
  const p = sesion.perfiles;
  const gestion = esGestion(p);
  const familia = p.includes("tutor") || p.includes("estudiante");
  const contar = async (tabla: string, filtro: (q: any) => any) =>
    (await filtro(supabase.from(tabla).select("*", { count: "exact", head: true }))).count ?? 0;

  // Cada consulta devuelve solo lo que la base le permite ver a esta cuenta.
  const [invitaciones, avisos, consultasNuevas, pagosPorValidar, vinculosPorVerificar, misComisiones, saldos] = await Promise.all([
    supabase.from("vinculos_responsables").select("id, parentesco, estudiantes(personas(nombres, apellidos))")
      .eq("responsable_persona_id", sesion.personaId).eq("estado", "invitado"),
    supabase.from("comunicacion_envios").select("id, leido_en, comunicaciones(asunto, cuerpo, enviada_en, categoria)")
      .eq("destinatario_persona_id", sesion.personaId).eq("canal", "interno").order("enviado_en", { ascending: false }).limit(5),
    gestion ? contar("consultas", (q) => q.eq("estado", "nueva")) : 0,
    gestion ? contar("pagos", (q) => q.eq("estado", "informado")) : 0,
    gestion ? contar("vinculos_responsables", (q) => q.eq("estado", "aceptado")) : 0,
    p.includes("docente") ? contar("comision_docentes", (q) => q.eq("docente_persona_id", sesion.personaId).is("hasta", null)) : 0,
    familia ? supabase.from("obligaciones_saldo").select("saldo, vencimiento").in("estado", ["pendiente", "parcial"]) : null,
  ]);
  const pendiente = (saldos?.data ?? []).reduce((t, o) => t + Number(o.saldo), 0);

  // Campus: lo que cada rol tiene que mirar primero.
  const esEstudiante = p.includes("estudiante");
  const esDocente = p.includes("docente");
  const [progreso, misEntregas, alertasAbiertas, porCorregir, noLeidos] = await Promise.all([
    esEstudiante ? supabase.rpc("mi_progreso").then((r) => r.data as Progreso | null) : null,
    esEstudiante
      ? supabase.from("estudiantes").select("id").eq("persona_id", sesion.personaId).maybeSingle()
          .then(async ({ data }) => (data ? ((await supabase.rpc("entregas_de_estudiante", { p_estudiante: data.id })).data ?? []) : []) as EntregaResumen[])
      : [],
    esDocente || gestion ? contar("alertas", (q) => q.neq("estado", "resuelta")) : 0,
    esDocente || gestion ? contar("entregas", (q) => q.eq("estado", "entregada")) : 0,
    supabase.from("hilo_participantes").select("hilo_id, leido_en, hilos(actualizado_en)").eq("persona_id", sesion.personaId)
      .then(({ data }) => (data ?? []).filter((h: any) => !h.leido_en || (h.hilos && h.hilos.actualizado_en > h.leido_en)).length),
  ]);
  const pendientes = misEntregas.filter((e) => e.estado === "pendiente" && (!e.cierra_en || e.cierra_en > new Date().toISOString()));

  return (
    <>
      <Titulo descripcion="Lo que tenés para hacer hoy.">Inicio</Titulo>
      {aviso === "sin-permiso" ? <div className="mb-4"><Aviso tono="alerta">Esa sección no está disponible para tu perfil.</Aviso></div> : null}
      {p.length === 0 ? (
        <EstadoVacio titulo="Tu cuenta todavía no tiene accesos asignados">
          Si esperabas ver información de un estudiante, pedí en administración que verifiquen el vínculo.
        </EstadoVacio>
      ) : null}

      {(invitaciones.data ?? []).map((v: any) => (
        <Tarjeta key={v.id} className="mb-4">
          <p className="font-semibold">
            Te invitaron como responsable de {v.estudiantes?.personas?.nombres ?? "un estudiante"} {v.estudiantes?.personas?.apellidos ?? ""}
            {v.parentesco ? ` (${v.parentesco})` : ""}.
          </p>
          <p className="mt-1 text-sm text-suave">Al aceptar, administración valida el vínculo y define a qué información accedés.</p>
          <form action={responderVinculo} className="mt-3 flex gap-2">
            <input type="hidden" name="vinculo" value={v.id} />
            <Boton name="respuesta" value="aceptar">Aceptar</Boton>
            <Boton name="respuesta" value="rechazar" variante="secundario">No corresponde</Boton>
          </form>
        </Tarjeta>
      ))}

      {progreso ? (
        <section aria-label="Tu práctica" className="mb-6 overflow-hidden rounded-[2rem] bg-marca p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm font-semibold text-cielo">{progreso.practico_hoy ? "¡Ya practicaste hoy!" : "Te espera la práctica de hoy"}</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                <span aria-hidden>🔥</span> {progreso.racha} {progreso.racha === 1 ? "día" : "días"} de racha
              </p>
              <p className="mt-1 text-white/80">{progreso.xp_semana} de {progreso.meta_semanal} XP esta semana · {progreso.medallas?.filter((m) => m.obtenida_en).length ?? 0} medallas</p>
              <div className="mt-3 h-3 w-64 max-w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Meta semanal"
                aria-valuemin={0} aria-valuemax={progreso.meta_semanal} aria-valuenow={Math.min(progreso.xp_semana, progreso.meta_semanal)}>
                <div className="h-full rounded-full bg-acento" style={{ width: `${Math.min(100, (progreso.xp_semana / Math.max(progreso.meta_semanal, 1)) * 100)}%` }} />
              </div>
            </div>
            <Link href="/panel/practica" className="inline-flex min-h-12 items-center rounded-full bg-acento px-6 text-lg font-bold hover:bg-[#a90d26]">
              {progreso.practico_hoy ? "Seguir practicando" : "Practicar ahora"}
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {esEstudiante ? <Acceso href="/panel/mis-actividades" titulo="Actividades pendientes" dato={pendientes.length} detalle={pendientes[0] ? `Próxima: ${pendientes[0].titulo}` : "Estás al día."} /> : null}
        {esDocente || gestion ? <Acceso href="/panel/actividades" titulo="Entregas por corregir" dato={porCorregir} detalle="Corrección rápida con devolución de un toque." /> : null}
        {esDocente || gestion ? <Acceso href="/panel/alertas" titulo="Alertas abiertas" dato={alertasAbiertas} detalle="Ausentismo, participación y rendimiento." /> : null}
        {noLeidos > 0 ? <Acceso href="/panel/mensajes" titulo="Mensajes sin leer" dato={noLeidos} detalle="Conversaciones con novedades." /> : null}
        {p.includes("docente") ? <Acceso href="/panel/mis-comisiones" titulo="Asistencia" dato={misComisiones} detalle="Tus comisiones: abrí la clase de hoy y tomá asistencia." /> : null}
        {familia ? <Acceso href="/panel/familia" titulo="Cursada" detalle="Horarios, asistencia y avisos." /> : null}
        {familia ? <Acceso href="/panel/cuenta" titulo="Saldo pendiente" dato={pesos(pendiente)} detalle="Ver detalle o informar una transferencia." /> : null}
        {gestion ? <Acceso href="/panel/consultas" titulo="Consultas nuevas" dato={consultasNuevas} detalle="Sin responder todavía." /> : null}
        {gestion ? <Acceso href="/panel/cobros" titulo="Pagos por validar" dato={pagosPorValidar} detalle="Transferencias informadas sin acreditar." /> : null}
        {gestion ? <Acceso href="/panel/estudiantes" titulo="Vínculos por verificar" dato={vinculosPorVerificar} detalle="Responsables que aceptaron la invitación." /> : null}
        {p.includes("direccion") ? <Acceso href="/panel/tablero" titulo="Tablero" detalle="Caja, saldos, ocupación y conversión." /> : null}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">Avisos recientes</h2>
      {(avisos.data ?? []).length === 0 ? (
        <EstadoVacio titulo="No tenés avisos">Cuando el instituto te envíe un aviso lo vas a ver acá.</EstadoVacio>
      ) : (
        <ul className="space-y-3">
          {(avisos.data ?? []).map((e: any) => (
            <li key={e.id}>
              <Tarjeta>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{e.comunicaciones?.asunto}</p>
                  {e.leido_en ? <Insignia>Leído</Insignia> : (
                    <form action={marcarLeida}><input type="hidden" name="envio" value={e.id} /><Boton variante="texto">Marcar como leído</Boton></form>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{e.comunicaciones?.cuerpo}</p>
                <p className="mt-2 text-xs text-suave">{fechaHora(e.comunicaciones?.enviada_en)}</p>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
