import { Insignia, Tarjeta } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { ESCALA, nombreCriterio, promedio } from "./criterios";
import type { Evaluacion } from "./datos";
import { BotonCompartir } from "./formulario";

const etiqueta = (n: number) => ESCALA.find(([v]) => v === n)?.[1] ?? "";

/** Una evaluación. `editable` muestra el estado de compartida y el botón (dirección). */
export function TarjetaEvaluacion({ e, editable = false }: { e: Evaluacion; editable?: boolean }) {
  const prom = promedio(e.puntajes);
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{e.periodo}</p>
          <p className="text-sm text-suave">Cargada el {fechaHora(e.creada_en)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {prom !== null ? <Insignia tono="marca">Promedio {prom.toLocaleString("es-AR")} / 5</Insignia> : null}
          {editable ? <Insignia tono={e.compartida ? "exito" : "neutro"}>{e.compartida ? "Compartida" : "Solo dirección"}</Insignia> : null}
        </div>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {Object.entries(e.puntajes ?? {}).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-borde py-1">
            <dt>{nombreCriterio(k)}</dt>
            <dd className="font-semibold">{v} <span className="font-normal text-suave">· {etiqueta(Number(v))}</span></dd>
          </div>
        ))}
      </dl>
      {e.fortalezas ? <div className="mt-3"><p className="text-sm font-semibold">Fortalezas</p><p className="whitespace-pre-wrap text-sm">{e.fortalezas}</p></div> : null}
      {e.a_mejorar ? <div className="mt-3"><p className="text-sm font-semibold">A mejorar</p><p className="whitespace-pre-wrap text-sm">{e.a_mejorar}</p></div> : null}
      {editable ? <div className="mt-3"><BotonCompartir id={e.id} docente={e.docente_persona_id} compartida={e.compartida} /></div> : null}
    </Tarjeta>
  );
}
