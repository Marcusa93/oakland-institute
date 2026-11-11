import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ETIQUETA_EVALUACION, ETIQUETA_HABILIDAD, ICONO_HABILIDAD, TONO_EVALUACION, ahora, vencimiento } from "../actividades/comun";
import { entregasDe, estudianteDePersona, situacion, type EntregaEstudiante } from "./datos";
import { ResultadoPublicado } from "./resultado";

export const metadata: Metadata = { title: "Mis actividades" };

export default async function MisActividades() {
  const sesion = await exigirPermiso("actividades", "crear");
  const supabase = await crearClienteServidor();
  const est = await estudianteDePersona(supabase, sesion.personaId);
  if (!est.id) {
    return (
      <>
        <Titulo>Mis actividades</Titulo>
        {est.error ? <Aviso tono="peligro">No pudimos cargar tus datos. Actualizá la página.</Aviso> : (
          <EstadoVacio titulo="Tu cuenta no figura como estudiante">Esta sección es para estudiantes. Si cursás en el instituto, avisá en administración.</EstadoVacio>
        )}
      </>
    );
  }
  const { entregas, error } = await entregasDe(supabase, est.id);
  const referencia = ahora();
  const conSituacion = entregas.map((e) => ({ ...e, s: situacion(e, referencia) }));
  const pendientes = conSituacion.filter((e) => e.s === "pendiente")
    .sort((a, b) => (a.cierra_en ? new Date(a.cierra_en).getTime() : Infinity) - (b.cierra_en ? new Date(b.cierra_en).getTime() : Infinity));
  const entregadas = conSituacion.filter((e) => e.s === "entregada");
  const corregidas = conSituacion.filter((e) => e.s === "corregida");
  const vencidas = conSituacion.filter((e) => e.s === "vencida");
  const urgentes = pendientes.filter((e) => vencimiento(e.cierra_en, referencia).urgente).length;

  return (
    <>
      <Titulo descripcion="Lo que te dejaron tus docentes: resolvelo antes del cierre y mirá tus resultados cuando los publiquen.">Mis actividades</Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar tus actividades. Actualizá la página.</Aviso></div> : null}

      {entregas.length ? (
        <div className="globo globo-izq mb-10 bg-marca px-6 py-5 text-sobre-marca">
          <p className="text-2xl font-extrabold tracking-tight">
            {pendientes.length === 0 ? "¡Estás al día!" : `Tenés ${pendientes.length} ${pendientes.length === 1 ? "actividad pendiente" : "actividades pendientes"}`}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {urgentes ? `${urgentes} ${urgentes === 1 ? "cierra" : "cierran"} en menos de 24 horas. ` : ""}
            {corregidas.length} con resultado · {entregadas.length} esperando corrección
          </p>
        </div>
      ) : null}

      {!error && entregas.length === 0 ? (
        <EstadoVacio titulo="Todavía no tenés actividades">Cuando tus docentes publiquen una, aparece acá.</EstadoVacio>
      ) : null}

      <Grupo titulo="Para hacer" vacio="No tenés actividades pendientes." items={pendientes} referencia={referencia} />
      <Grupo titulo="Con resultado" vacio="Cuando tu docente publique una corrección, la vas a ver acá." items={corregidas} referencia={referencia} />
      <Grupo titulo="Entregadas, esperando corrección" items={entregadas} referencia={referencia} />
      <Grupo titulo="Cerradas sin entregar" items={vencidas} referencia={referencia} />
    </>
  );
}

function Grupo({ titulo, vacio, items, referencia }: {
  titulo: string; vacio?: string; items: (EntregaEstudiante & { s: string })[]; referencia: number;
}) {
  if (!items.length && !vacio) return null;
  return (
    <section className="mb-8" aria-labelledby={`g-${titulo.length}-${titulo.charCodeAt(0)}`}>
      <h2 id={`g-${titulo.length}-${titulo.charCodeAt(0)}`} className="mb-3 text-lg font-bold">{titulo} <span className="text-base font-normal text-suave">({items.length})</span></h2>
      {items.length === 0 ? <p className="text-sm text-suave">{vacio}</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((e) => {
            const v = vencimiento(e.cierra_en, referencia);
            return (
              <li key={e.actividad_id}>
                <Link href={`/panel/mis-actividades/${e.actividad_id}`} className="block h-full rounded-base">
                  <Tarjeta className={`h-full transition-shadow hover:shadow-md motion-reduce:transition-none ${e.s === "pendiente" && v.urgente ? "border-acento ring-1 ring-acento" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold" lang="en"><span aria-hidden>{ICONO_HABILIDAD[e.habilidad]} </span>{e.titulo}</p>
                      {e.s === "pendiente" && v.urgente ? <span className="latido mt-1.5 size-2.5 shrink-0 rounded-full bg-acento" aria-hidden /> : null}
                    </div>
                    <p className="text-xs text-suave">{e.comision}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Insignia>{ETIQUETA_HABILIDAD[e.habilidad]}</Insignia>
                      <Insignia tono={TONO_EVALUACION[e.evaluacion]}>{ETIQUETA_EVALUACION[e.evaluacion]}</Insignia>
                      {e.s === "pendiente" ? <Insignia tono={v.tono}>{v.texto}</Insignia> : null}
                      {e.s === "entregada" ? <Insignia tono="marca">Entregada {fechaHora(e.entregada_en)}</Insignia> : null}
                      {e.s === "vencida" ? <Insignia tono="peligro">No entregada</Insignia> : null}
                    </div>
                    {e.s === "corregida" ? <ResultadoPublicado compacto nota={e.nota} puntajeMax={e.puntaje_max} reaccion={e.reaccion} devolucion={null} /> : null}
                    {e.s === "pendiente" ? <p className="mt-3 text-sm font-semibold text-marca">Resolver →</p> : null}
                  </Tarjeta>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
