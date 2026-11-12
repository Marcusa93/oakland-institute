"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Grabador } from "@/componentes/grabador";
import { Aviso, Boton } from "@/componentes/ui";
import { entregarActividad, type ResultadoEntrega } from "./acciones";

export interface PreguntaResolver { id: string; orden: number; enunciado: string; tipo: "opcion" | "texto"; opciones: string[] }

export function Resolver({ actividad, preguntas, acreditante, reentrega, habla = false, conAudioPrevio = false }: {
  actividad: string; preguntas: PreguntaResolver[]; acreditante: boolean; reentrega: boolean;
  /** Actividad de speaking: se entrega una grabación. */
  habla?: boolean;
  /** Ya hay una grabación entregada: reentregar sin grabar de nuevo la conserva. */
  conAudioPrevio?: boolean;
}) {
  const [respuestas, setRespuestas] = useState<Record<string, number | string>>({});
  const [texto, setTexto] = useState("");
  const [audio, setAudio] = useState<{ ruta: string; segundos: number } | null>(null);
  const [resultado, setResultado] = useState<ResultadoEntrega | null>(null);
  const [enviando, iniciar] = useTransition();

  const respondidas = preguntas.filter((p) => {
    const r = respuestas[p.id];
    return typeof r === "number" || (typeof r === "string" && r.trim() !== "");
  }).length;
  const total = preguntas.length;
  const pct = habla
    ? Math.round((100 * ((audio || conAudioPrevio ? 1 : 0) + respondidas)) / (total + 1))
    : total ? Math.round((100 * respondidas) / total) : texto.trim() ? 100 : 0;

  function entregar(e: React.FormEvent) {
    e.preventDefault();
    if (total && respondidas < total && !window.confirm(`Te faltan ${total - respondidas} ${total - respondidas === 1 ? "pregunta" : "preguntas"}. ¿Entregás igual?`)) return;
    if (habla && !audio && !conAudioPrevio) { setResultado({ ok: false, mensaje: "Grabá tu respuesta antes de entregar." }); return; }
    if (!habla && !total && !texto.trim()) { setResultado({ ok: false, mensaje: "Escribí tu respuesta antes de entregar." }); return; }
    iniciar(async () => setResultado(await entregarActividad({ actividad, respuestas, texto, audio: audio?.ruta ?? null, segundos: audio?.segundos ?? null })));
  }

  if (resultado?.ok) return <Festejo resultado={resultado} acreditante={acreditante} />;

  return (
    <form onSubmit={entregar} className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 border-b border-borde bg-fondo/95 px-4 py-2 backdrop-blur sm:mx-0">
        <div className="flex justify-between text-xs font-semibold text-suave" aria-live="polite">
          <span>{habla ? (audio || conAudioPrevio ? "Grabación lista" : "Falta tu grabación") : total ? `${respondidas} de ${total} respondidas` : "Respuesta libre"}</span><span>{pct} %</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-pizarra" aria-hidden>
          <div className="h-full rounded-full bg-acento transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {habla ? (
        <section aria-labelledby="t-grabar" className="space-y-3">
          <h2 id="t-grabar" className="text-lg font-bold">Tu respuesta hablada</h2>
          <Grabador tipo="entrega" id={actividad} maximo={180}
            onListo={(ruta, segundos) => setAudio(ruta && segundos ? { ruta, segundos } : null)}
            textos={conAudioPrevio ? { ayuda: "Ya entregaste una grabación. Si grabás otra, reemplaza a la anterior." } : undefined} />
          <div>
            <label htmlFor="nota-docente" className="text-sm font-semibold">Algo para tu docente <span className="font-normal text-suave">(opcional)</span></label>
            <textarea id="nota-docente" rows={2} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)}
              className="mt-1 block w-full rounded-base border border-borde bg-superficie px-3 py-2" placeholder="Por ejemplo: me trabé en la segunda parte." />
          </div>
        </section>
      ) : null}

      {total === 0 && !habla ? (
        <div className="rounded-base border border-borde bg-superficie p-4">
          <label htmlFor="texto-libre" className="font-semibold">Tu respuesta</label>
          <textarea id="texto-libre" rows={10} maxLength={8000} lang="en" value={texto} onChange={(e) => setTexto(e.target.value)}
            className="mt-2 block w-full rounded-base border border-borde bg-superficie px-3 py-2" />
          <p className="mt-1 text-right text-xs text-suave">{texto.trim() ? texto.trim().split(/\s+/).length : 0} palabras</p>
        </div>
      ) : null}

      <ol className="space-y-4">
        {preguntas.map((p) => (
          <li key={p.id}>
            {p.tipo === "opcion" ? (
              <fieldset className="rounded-base border border-borde bg-superficie p-4">
                <legend className="sr-only">Pregunta {p.orden}</legend>
                <p className="text-lg font-semibold" lang="en"><span className="text-suave">{p.orden}. </span>{p.enunciado}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.opciones.map((o, i) => (
                    <label key={i} className="cursor-pointer">
                      <input type="radio" name={`p-${p.id}`} value={i} checked={respuestas[p.id] === i}
                        onChange={() => setRespuestas((r) => ({ ...r, [p.id]: i }))} className="peer sr-only" />
                      <span lang="en" className="inline-flex min-h-11 items-center rounded-full border-2 border-marca px-5 font-semibold text-marca transition-colors peer-checked:bg-marca peer-checked:text-sobre-marca peer-focus-visible:ring-4 peer-focus-visible:ring-cielo hover:bg-marca-suave peer-checked:hover:bg-marca-fuerte motion-reduce:transition-none">
                        {o}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div className="rounded-base border border-borde bg-superficie p-4">
                <label htmlFor={`p-${p.id}`} className="text-lg font-semibold" lang="en"><span className="text-suave">{p.orden}. </span>{p.enunciado}</label>
                <textarea id={`p-${p.id}`} rows={4} maxLength={4000} lang="en" value={(respuestas[p.id] as string | undefined) ?? ""}
                  onChange={(e) => setRespuestas((r) => ({ ...r, [p.id]: e.target.value }))}
                  className="mt-2 block w-full rounded-base border border-borde bg-superficie px-3 py-2" />
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={enviando} className="min-h-12 rounded-full px-8 text-base">{enviando ? "Entregando…" : reentrega ? "Entregar de nuevo" : "Entregar"}</Boton>
        {reentrega ? <p className="text-xs text-suave">La nueva entrega reemplaza a la anterior.</p> : null}
      </div>
      {resultado && !resultado.ok ? <Aviso tono="peligro">{resultado.mensaje}</Aviso> : null}
    </form>
  );
}

/** Momento de festejo sobrio: resultado, una barra que se llena y un par de chispas. */
function Festejo({ resultado, acreditante }: { resultado: ResultadoEntrega; acreditante: boolean }) {
  const [lleno, setLleno] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setLleno(true), 80); return () => window.clearTimeout(t); }, []);
  const conAciertos = !acreditante && resultado.total !== null && resultado.total !== undefined && resultado.total > 0;
  const pct = conAciertos ? Math.round((100 * (resultado.aciertos ?? 0)) / resultado.total!) : 100;
  const titulo = !conAciertos ? "¡Entregada!" : pct === 100 ? "¡Perfecto!" : pct >= 70 ? "¡Muy bien!" : pct >= 40 ? "¡Buen intento!" : "¡Entregada!";

  return (
    <div className="globo globo-der mb-8 bg-superficie p-6 text-center ring-1 ring-borde sm:p-10" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {["left-[12%] top-6 bg-acento", "left-[28%] top-14 bg-cielo", "right-[18%] top-8 bg-marca", "right-[30%] top-20 bg-acento", "left-[45%] top-4 bg-cielo"].map((c, i) => (
          <span key={i} className={`absolute size-2 rounded-full opacity-70 motion-safe:animate-ping ${c}`} style={{ animationDelay: `${i * 180}ms`, animationIterationCount: 2 }} />
        ))}
      </div>
      <p className="text-5xl motion-safe:animate-bounce" style={{ animationIterationCount: 2 }} aria-hidden>{conAciertos && pct >= 70 ? "🎉" : "📬"}</p>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-marca-fuerte">{titulo}</p>
      {conAciertos ? (
        <>
          <p className="mt-2 text-lg">
            Acertaste <strong>{resultado.aciertos}</strong> de <strong>{resultado.total}</strong> {resultado.total === 1 ? "pregunta" : "preguntas"} de opción múltiple.
          </p>
          <div className="mx-auto mt-4 h-3 max-w-sm overflow-hidden rounded-full bg-pizarra" aria-hidden>
            <div className="h-full rounded-full bg-exito transition-[width] duration-1000 ease-out motion-reduce:transition-none" style={{ width: lleno ? `${pct}%` : "0%" }} />
          </div>
          <p className="mt-3 text-sm text-suave">Las respuestas abiertas y la nota final las corrige tu docente.</p>
        </>
      ) : (
        <p className="mt-2 text-suave">
          {acreditante ? "Es una actividad acreditante: vas a ver tus aciertos y la nota cuando tu docente publique la corrección." : "Tu docente la va a corregir y vas a ver la devolución acá."}
        </p>
      )}
      <Link href="/panel/mis-actividades" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-marca px-6 font-semibold text-sobre-marca hover:bg-marca-fuerte">
        Volver a mis actividades
      </Link>
    </div>
  );
}
