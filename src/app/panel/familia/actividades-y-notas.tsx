import Link from "next/link";
import { ETIQUETA_HABILIDAD, ICONO_HABILIDAD, ahora, vencimiento } from "@/app/panel/actividades/comun";
import { entregasDe, situacion } from "@/app/panel/mis-actividades/datos";
import { ResultadoPublicado } from "@/app/panel/mis-actividades/resultado";
import { Insignia, Tarjeta } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Sección de Cursada: actividades del campus con notas publicadas e informes
 * enviados a la familia. La base solo devuelve notas publicadas y solo a
 * responsables con permiso académico (o al propio estudiante).
 */
export async function ActividadesYNotas({ estudianteId, nombre, esPropio }: { estudianteId: string; nombre: string; esPropio: boolean }) {
  const supabase = await crearClienteServidor();
  const [{ entregas, error }, informesR] = await Promise.all([
    entregasDe(supabase, estudianteId),
    supabase.from("informes").select("id, periodo, enviado_en").eq("estudiante_id", estudianteId)
      .eq("destinatario", "familia").eq("estado", "enviado").order("enviado_en", { ascending: false }).limit(10),
  ]);
  const informes = (informesR.data ?? []) as { id: string; periodo: string; enviado_en: string | null }[];
  if (!entregas.length && !informes.length && !error && !informesR.error) return null;

  const referencia = ahora();
  const filas = entregas.map((e) => ({ ...e, s: situacion(e, referencia) }));
  const corregidas = filas.filter((e) => e.s === "corregida").slice(0, 8);
  const pendientes = filas.filter((e) => e.s === "pendiente");
  const vencidas = filas.filter((e) => e.s === "vencida").length;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Tarjeta>
        <h3 className="text-lg font-bold">Actividades y notas</h3>
        {error ? <p className="text-sm text-peligro">No pudimos cargar las actividades.</p> : null}
        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label="Resumen de actividades">
          <li><Insignia tono={pendientes.length ? "alerta" : "exito"}>{pendientes.length} pendientes</Insignia></li>
          <li><Insignia tono="marca">{filas.filter((e) => e.s === "entregada").length} esperando corrección</Insignia></li>
          {vencidas ? <li><Insignia tono="peligro">{vencidas} sin entregar</Insignia></li> : null}
        </ul>
        {pendientes.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {pendientes.slice(0, 4).map((e) => {
              const v = vencimiento(e.cierra_en, referencia);
              return (
                <li key={e.actividad_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span lang="en"><span aria-hidden>{ICONO_HABILIDAD[e.habilidad]} </span>{e.titulo}</span>
                  <Insignia tono={v.tono}>{v.texto}</Insignia>
                </li>
              );
            })}
          </ul>
        ) : null}
        {corregidas.length ? (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-suave">Últimas notas publicadas</p>
            <ul className="mt-1 divide-y divide-borde">
              {corregidas.map((e) => (
                <li key={e.actividad_id} className="py-2">
                  <p className="text-sm font-semibold" lang="en">{e.titulo} <span className="font-normal text-suave">· {ETIQUETA_HABILIDAD[e.habilidad]}</span></p>
                  <ResultadoPublicado compacto nota={e.nota} puntajeMax={e.puntaje_max} reaccion={e.reaccion} devolucion={e.devolucion} />
                </li>
              ))}
            </ul>
          </>
        ) : <p className="mt-3 text-sm text-suave">Todavía no hay notas publicadas.</p>}
        {esPropio ? <Link href="/panel/mis-actividades" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-marca hover:underline">Ir a mis actividades →</Link> : null}
      </Tarjeta>
      <Tarjeta>
        <h3 className="text-lg font-bold">Informes del equipo docente</h3>
        {informes.length ? (
          <ul className="mt-2 divide-y divide-borde">
            {informes.map((i) => (
              <li key={i.id}>
                <Link href={`/panel/informes/${i.id}`} className="flex min-h-11 items-center justify-between gap-2 py-2 hover:underline">
                  <span className="font-semibold">{i.periodo}</span>
                  <span className="text-xs text-suave">{fechaHora(i.enviado_en)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-suave">Cuando el equipo docente envíe un informe sobre {nombre}, lo vas a poder leer e imprimir desde acá.</p>}
      </Tarjeta>
    </div>
  );
}
