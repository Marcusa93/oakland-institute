"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { prepararSubidaAudio } from "@/app/panel/audio/acciones";

type Estado = "inicio" | "pidiendo" | "grabando" | "subiendo" | "lista" | "error";

const BARRAS = 28;
const TIPOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
const EXTENSION: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
};
const MAXIMO_BYTES = 10 * 1024 * 1024;

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function baseMime(tipo: string) {
  const b = tipo.split(";")[0].trim().toLowerCase();
  return b === "audio/x-m4a" ? "audio/mp4" : b;
}

/**
 * Grabador para speaking. Graba con el micrófono (o acepta un archivo si el
 * navegador no puede grabar), muestra el nivel de voz en vivo y sube la
 * grabación apenas se detiene. Avisa la ruta lista con `onListo`.
 */
export function Grabador({ tipo, id, maximo = 180, onListo, textos }: {
  tipo: "entrega" | "devolucion";
  id: string;
  maximo?: number;
  onListo: (ruta: string | null, segundos: number | null) => void;
  textos?: { grabar?: string; ayuda?: string };
}) {
  const [estado, setEstado] = useState<Estado>("inicio");
  const [segundos, setSegundos] = useState(0);
  const [niveles, setNiveles] = useState<number[]>(() => Array(BARRAS).fill(0.08));
  const [vista, setVista] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const puedeGrabar = useSyncExternalStore(
    () => () => {},
    () => "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia,
    () => true,
  );

  const grabadora = useRef<MediaRecorder | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const contexto = useRef<AudioContext | null>(null);
  const cuadro = useRef<number | null>(null);
  const temporizador = useRef<number | null>(null);
  const inicio = useRef(0);
  const trozos = useRef<Blob[]>([]);
  const archivo = useRef<HTMLInputElement>(null);
  const onListoRef = useRef(onListo);
  useEffect(() => { onListoRef.current = onListo; }, [onListo]);

  useEffect(() => () => apagar(), []);
  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  function apagar() {
    if (cuadro.current) cancelAnimationFrame(cuadro.current);
    cuadro.current = null;
    if (temporizador.current) window.clearInterval(temporizador.current);
    temporizador.current = null;
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    void contexto.current?.close().catch(() => {});
    contexto.current = null;
  }

  async function subir(blob: Blob, duracion: number) {
    const mime = baseMime(blob.type || "audio/webm");
    const extension = EXTENSION[mime];
    if (!extension) { fallar("Ese formato de audio no es compatible. Probá grabando desde acá."); return; }
    if (blob.size > MAXIMO_BYTES) { fallar("La grabación pesa más de 10 MB. Probá con una más corta."); return; }
    setEstado("subiendo");
    const p = await prepararSubidaAudio({ tipo, id, extension });
    if (!p.ok) { fallar(p.mensaje); return; }
    try {
      const r = await fetch(p.url, {
        method: "PUT", body: blob,
        headers: { "content-type": mime, "x-upsert": "false", "cache-control": "max-age=3600" },
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      fallar("No se pudo subir la grabación. Revisá la conexión y probá de nuevo.");
      return;
    }
    setEstado("lista");
    onListoRef.current(p.ruta, Math.max(1, Math.round(duracion)));
  }

  function fallar(texto: string) {
    setMensaje(texto);
    setEstado("error");
    onListoRef.current(null, null);
  }

  async function grabar() {
    setMensaje("");
    setEstado("pidiendo");
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setEstado("error");
      setMensaje("No pudimos usar el micrófono. Dale permiso en el navegador o subí un audio grabado con el celular.");
      return;
    }
    flujo.current = media;
    const elegido = TIPOS.find((t) => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(media, elegido ? { mimeType: elegido } : undefined);
    trozos.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) trozos.current.push(e.data); };
    rec.onstop = () => {
      const duracion = (performance.now() - inicio.current) / 1000;
      apagar();
      const blob = new Blob(trozos.current, { type: rec.mimeType || elegido || "audio/webm" });
      setVista(URL.createObjectURL(blob));
      setNiveles(Array(BARRAS).fill(0.08));
      void subir(blob, duracion);
    };
    grabadora.current = rec;
    inicio.current = performance.now();

    // Tiempo y límite con un intervalo: sigue corriendo aunque la pestaña quede de fondo.
    temporizador.current = window.setInterval(() => {
      const transcurrido = (performance.now() - inicio.current) / 1000;
      setSegundos(transcurrido);
      if (transcurrido >= maximo) detener();
    }, 200);

    // Nivel de voz para las barras (solo se dibuja con la pestaña visible).
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      contexto.current = ctx;
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 256;
      ctx.createMediaStreamSource(media).connect(analizador);
      const datos = new Uint8Array(analizador.frequencyBinCount);
      const historia: number[] = Array(BARRAS).fill(0.08);
      let ultimo = 0;
      const pintar = (t: number) => {
        if (t - ultimo > 70) {
          ultimo = t;
          analizador.getByteTimeDomainData(datos);
          let suma = 0;
          for (const v of datos) suma += ((v - 128) / 128) ** 2;
          const nivel = Math.min(1, Math.sqrt(suma / datos.length) * 4.5);
          historia.shift();
          historia.push(Math.max(0.08, nivel));
          setNiveles([...historia]);
        }
        cuadro.current = requestAnimationFrame(pintar);
      };
      cuadro.current = requestAnimationFrame(pintar);
    } catch {
      // Sin analizador: se graba igual, solo sin barras.
    }

    setSegundos(0);
    rec.start(250);
    setEstado("grabando");
    navigator.vibrate?.(15);
  }

  function detener() {
    if (temporizador.current) window.clearInterval(temporizador.current);
    temporizador.current = null;
    if (grabadora.current?.state === "recording") grabadora.current.stop();
    if (cuadro.current) cancelAnimationFrame(cuadro.current);
    cuadro.current = null;
  }

  function deArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const url = URL.createObjectURL(f);
    setVista(url);
    setMensaje("");
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => void subir(f, Number.isFinite(a.duration) ? a.duration : 1);
    a.onerror = () => void subir(f, 1);
    a.src = url;
  }

  function descartar() {
    setVista(null);
    setSegundos(0);
    setEstado("inicio");
    setMensaje("");
    onListoRef.current(null, null);
  }

  const grabando = estado === "grabando";
  const restante = Math.max(0, maximo - segundos);

  return (
    <div className="rounded-base border border-borde bg-superficie p-4 sm:p-5">
      {estado === "lista" || estado === "subiendo" || (estado === "error" && vista) ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold" aria-live="polite">
            {estado === "subiendo" ? (
              <><span className="size-2.5 rounded-full bg-alerta motion-safe:animate-pulse" aria-hidden /> Subiendo la grabación…</>
            ) : estado === "lista" ? (
              <><span className="grid size-6 place-items-center rounded-full bg-exito text-xs text-white" aria-hidden>✓</span> Grabación lista{segundos ? ` · ${reloj(segundos)}` : ""}</>
            ) : null}
          </div>
          {vista ? <audio controls src={vista} className="w-full" preload="metadata" /> : null}
          <button type="button" onClick={descartar} disabled={estado === "subiendo"}
            className="min-h-11 rounded-full border border-borde px-5 text-sm font-semibold text-marca hover:bg-marca-suave disabled:opacity-50">
            🎙️ Grabar de nuevo
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <button type="button" onClick={grabando ? detener : grabar} disabled={!puedeGrabar || estado === "pidiendo"}
            aria-label={grabando ? "Detener grabación" : textos?.grabar ?? "Grabar mi respuesta"}
            className={`relative grid size-20 shrink-0 place-items-center rounded-full text-white shadow-lg transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cielo disabled:opacity-50 motion-reduce:transition-none ${grabando ? "scale-95 bg-marca" : "bg-acento hover:scale-105"}`}>
            {grabando ? <span className="absolute inset-0 rounded-full bg-acento/40 motion-safe:animate-ping" aria-hidden /> : null}
            {grabando ? <span className="relative size-6 rounded-md bg-white" aria-hidden /> : (
              <svg viewBox="0 0 24 24" className="relative size-9" fill="currentColor" aria-hidden>
                <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.59a6 6 0 0 0 5-5.91Z" />
              </svg>
            )}
          </button>

          <div className="w-full min-w-0 flex-1">
            <div className="flex h-14 items-center gap-[3px]" aria-hidden>
              {niveles.map((n, i) => (
                <span key={i} className={`flex-1 rounded-full transition-[height] duration-75 motion-reduce:transition-none ${grabando ? "bg-acento" : "bg-pizarra"}`}
                  style={{ height: `${Math.round(n * 100)}%` }} />
              ))}
            </div>
            <p className="mt-1 text-sm" aria-live="polite">
              {grabando ? (
                <><strong className="tabular-nums">{reloj(segundos)}</strong><span className="text-suave"> · quedan {reloj(restante)} · tocá ■ para terminar</span></>
              ) : estado === "pidiendo" ? (
                <span className="text-suave">Esperando permiso del micrófono…</span>
              ) : puedeGrabar ? (
                <span className="text-suave">{textos?.ayuda ?? `Tocá el micrófono y hablá en inglés. Hasta ${reloj(maximo)}.`}</span>
              ) : (
                <span className="text-suave">Este navegador no puede grabar: subí un audio grabado con el celular.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {mensaje ? <p className="mt-3 rounded-base bg-acento/10 px-3 py-2 text-sm font-medium text-acento" role="alert">{mensaje}</p> : null}

      {estado !== "grabando" && estado !== "subiendo" && estado !== "lista" ? (
        <p className="mt-3 text-xs text-suave">
          ¿Preferís grabar con otra app?{" "}
          <button type="button" onClick={() => archivo.current?.click()} className="font-semibold text-marca underline-offset-2 hover:underline">Subir un audio</button>
          <input ref={archivo} type="file" accept="audio/*" className="sr-only" tabIndex={-1} onChange={deArchivo} />
        </p>
      ) : null}
    </div>
  );
}

/** Reproductor que conserva el primer enlace firmado aunque la página se refresque. */
export function Reproductor({ src, etiqueta }: { src: string; etiqueta: string }) {
  const [fijo] = useState(src);
  return <audio controls preload="none" src={fijo} aria-label={etiqueta} className="w-full max-w-md" />;
}
