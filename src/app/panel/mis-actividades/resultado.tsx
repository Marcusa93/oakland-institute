// Componente de presentación (sin "use client"): nota publicada, reacción y devolución.
import { REACCION, numero, porcentaje } from "@/app/panel/actividades/comun";

export function ResultadoPublicado({ nota, puntajeMax, reaccion, devolucion, compacto = false }: {
  nota: string | number | null; puntajeMax: string | number; reaccion: string | null; devolucion: string | null; compacto?: boolean;
}) {
  const r = reaccion ? REACCION[reaccion] : null;
  const pct = nota !== null ? porcentaje(Number(nota), Number(puntajeMax)) : null;
  return (
    <div className={compacto ? "mt-3" : "mt-4"}>
      <div className="flex flex-wrap items-center gap-3">
        {nota !== null ? (
          <p className={`font-extrabold tracking-tight text-marca-fuerte ${compacto ? "text-2xl" : "text-4xl"}`}>
            {numero(nota)}<span className="text-base font-semibold text-suave"> / {numero(puntajeMax)}</span>
          </p>
        ) : null}
        {r ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-cielo-suave px-3 py-1 text-sm font-bold text-marca-fuerte">
            <span aria-hidden className={compacto ? "" : "text-xl"}>{r.icono}</span>{r.etiqueta}
          </p>
        ) : null}
      </div>
      {pct !== null ? (
        <div className="mt-2 h-2 max-w-xs overflow-hidden rounded-full bg-pizarra" role="img" aria-label={`${pct} % del puntaje`}>
          <div className={`h-full rounded-full ${pct >= 70 ? "bg-exito" : pct >= 40 ? "bg-alerta" : "bg-acento"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {devolucion ? (
        <figure className="globo globo-izq mb-5 mt-3 bg-marca-suave px-4 py-3 text-sm">
          <figcaption className="text-xs font-semibold text-marca">Devolución del docente</figcaption>
          <blockquote className="mt-1 whitespace-pre-line text-texto">{devolucion}</blockquote>
        </figure>
      ) : null}
    </div>
  );
}
