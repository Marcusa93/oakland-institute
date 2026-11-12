"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Grabador, Reproductor } from "@/componentes/grabador";
import { Aviso, Boton } from "@/componentes/ui";
import { cambiarEstadoActividad, corregirEntrega, publicarCorregidas } from "./acciones";
import { FRASES_DEVOLUCION, REACCIONES } from "./comun";

export function Correccion({ entrega, actividad, puntajeMax, sugerida, audioDevolucion = null }: {
  entrega: { id: string; nota: string | null; devolucion: string | null; reaccion: string | null; publicada: boolean; estado: string };
  actividad: string;
  puntajeMax: number;
  sugerida: number | null;
  /** Enlace firmado de la devolución hablada ya guardada. */
  audioDevolucion?: string | null;
}) {
  const [estado, accion, guardando] = useActionState(corregirEntrega, null);
  const [audioNuevo, setAudioNuevo] = useState<string | null>(null);
  const [quitarAudio, setQuitarAudio] = useState(false);
  const [grabarVoz, setGrabarVoz] = useState(false);
  const [nota, setNota] = useState(entrega.nota !== null ? String(Number(entrega.nota)).replace(".", ",") : "");
  const [devolucion, setDevolucion] = useState(entrega.devolucion ?? "");
  const [reaccion, setReaccion] = useState(entrega.reaccion ?? "");
  const id = entrega.id;

  return (
    <form action={accion} className="mt-4 space-y-4 border-t border-borde pt-4">
      <input type="hidden" name="entrega" value={id} />
      <input type="hidden" name="actividad" value={actividad} />
      <input type="hidden" name="reaccion" value={reaccion} />
      <input type="hidden" name="audio" value={audioNuevo ?? ""} />
      <input type="hidden" name="quitar_audio" value={quitarAudio && !audioNuevo ? "si" : ""} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`nota-${id}`} className="text-sm font-medium">Nota <span className="font-normal text-suave">(de 0 a {puntajeMax.toLocaleString("es-AR")})</span></label>
          <input id={`nota-${id}`} name="nota" inputMode="decimal" value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off"
            className="mt-1 block min-h-11 w-28 rounded-base border border-borde bg-superficie px-3 text-lg font-bold" />
        </div>
        {sugerida !== null && nota === "" ? (
          <button type="button" onClick={() => setNota(String(sugerida).replace(".", ","))} className="min-h-11 rounded-full border border-dashed border-marca px-4 text-sm font-semibold text-marca hover:bg-marca-suave">
            Usar {sugerida.toLocaleString("es-AR")} (según aciertos)
          </button>
        ) : null}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Reacción de un toque</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {REACCIONES.map(([v, etiqueta, icono]) => (
            <button key={v} type="button" aria-pressed={reaccion === v} onClick={() => setReaccion(reaccion === v ? "" : v)}
              className="min-h-11 rounded-full border border-borde px-4 text-sm font-semibold transition-transform hover:bg-marca-suave aria-pressed:scale-105 aria-pressed:border-marca aria-pressed:bg-marca aria-pressed:text-sobre-marca motion-reduce:transition-none motion-reduce:aria-pressed:scale-100">
              <span aria-hidden>{icono} </span>{etiqueta}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`dev-${id}`} className="text-sm font-medium">Devolución</label>
        <textarea id={`dev-${id}`} name="devolucion" rows={3} maxLength={2000} value={devolucion} onChange={(e) => setDevolucion(e.target.value)}
          className="mt-1 block w-full rounded-base border border-borde bg-superficie px-3 py-2" placeholder="Qué salió bien y qué conviene repasar." />
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Frases rápidas">
          {FRASES_DEVOLUCION.map((f) => (
            <button key={f} type="button" onClick={() => setDevolucion((d) => (d ? `${d.trimEnd()} ${f}` : f))}
              className="min-h-9 rounded-full bg-pizarra px-3 text-xs font-medium text-marca-fuerte hover:bg-cielo-suave">
              + {f}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium">Devolución hablada <span className="font-normal text-suave">(opcional)</span></p>
        {audioDevolucion && !quitarAudio && !grabarVoz ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Reproductor src={audioDevolucion} etiqueta="Tu devolución hablada" />
            <button type="button" onClick={() => setGrabarVoz(true)} className="min-h-11 rounded-full border border-borde px-4 text-sm font-semibold text-marca hover:bg-marca-suave">Grabar otra</button>
            <button type="button" onClick={() => setQuitarAudio(true)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-acento hover:underline">Quitar</button>
          </div>
        ) : grabarVoz || !audioDevolucion || quitarAudio ? (
          grabarVoz ? (
            <div className="mt-1">
              <Grabador tipo="devolucion" id={id} maximo={120} onListo={(ruta) => setAudioNuevo(ruta)}
                textos={{ grabar: "Grabar devolución", ayuda: "Corregile la pronunciación con tu voz. Hasta 2:00." }} />
            </div>
          ) : (
            <button type="button" onClick={() => setGrabarVoz(true)}
              className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-marca px-4 text-sm font-semibold text-marca hover:bg-marca-suave">
              🎙️ Grabar una devolución con tu voz
            </button>
          )
        ) : null}
        {quitarAudio && !audioNuevo ? <p className="mt-1 text-xs text-suave">La devolución hablada se quita al guardar.</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Boton type="submit" name="publicar" value="si" disabled={guardando}>{guardando ? "Guardando…" : "Publicar corrección"}</Boton>
        <Boton type="submit" name="publicar" value="no" variante="secundario" disabled={guardando}>Guardar sin publicar</Boton>
      </div>
      {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
    </form>
  );
}

export function PublicarTodas({ actividad, cantidad }: { actividad: string; cantidad: number }) {
  const [estado, accion, enviando] = useActionState(publicarCorregidas, null);
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="actividad" value={actividad} />
      <Boton type="submit" disabled={enviando || cantidad === 0}>
        {enviando ? "Publicando…" : `Publicar todas las corregidas${cantidad ? ` (${cantidad})` : ""}`}
      </Boton>
      {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
    </form>
  );
}

export function CambiarEstado({ actividad, estado: destino, etiqueta, variante = "secundario", confirmar }: {
  actividad: string; estado: "publicada" | "cerrada"; etiqueta: string; variante?: "primario" | "secundario"; confirmar?: string;
}) {
  const [estado, accion, enviando] = useActionState(cambiarEstadoActividad, null);
  return (
    <form action={accion} onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={actividad} />
      <input type="hidden" name="estado" value={destino} />
      <Boton type="submit" variante={variante} disabled={enviando}>{enviando ? "Guardando…" : etiqueta}</Boton>
      {estado && !estado.ok ? <Aviso tono="peligro">{estado.mensaje}</Aviso> : null}
    </form>
  );
}

/** Refresca los datos del servidor cada tanto mientras la pestaña está visible. */
export function EnVivo({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter();
  const [activo, setActivo] = useState(true);
  const [ultima, setUltima] = useState<string>("");
  const reloj = useRef<number | null>(null);

  useEffect(() => {
    const marcar = () => setUltima(new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    marcar();
    if (!activo) return;
    reloj.current = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      marcar();
    }, segundos * 1000);
    return () => { if (reloj.current) window.clearInterval(reloj.current); };
  }, [activo, router, segundos]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-suave">
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <span className={`size-2.5 rounded-full ${activo ? "bg-exito motion-safe:animate-pulse" : "bg-borde"}`} aria-hidden />
        {activo ? "En vivo" : "En pausa"}
      </span>
      <span>{ultima ? `Actualizado ${ultima}` : ""}</span>
      <button type="button" onClick={() => setActivo((a) => !a)} className="min-h-9 rounded-base px-2 font-semibold text-marca hover:underline">
        {activo ? "Pausar" : "Reanudar"}
      </button>
    </div>
  );
}
