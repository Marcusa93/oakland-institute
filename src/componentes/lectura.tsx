"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Vista de lectura del material: texto grande sobre renglones y lectura en
 * voz alta con la voz en inglés del dispositivo (sin servidor). Se puede
 * escuchar todo, desde un párrafo o solo lo que se selecciona.
 */

const sinSuscripcion = () => () => {};
const puedeHablar = () => typeof window !== "undefined" && "speechSynthesis" in window;

function vozIngles() {
  const voces = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  return voces.find((v) => /en-GB/i.test(v.lang) && v.localService) ?? voces.find((v) => /en-US/i.test(v.lang)) ?? voces[0] ?? null;
}

/** Oraciones cortas: algunos navegadores cortan las locuciones largas. */
function trozos(texto: string) {
  return texto.match(/[^.!?;:\n]+[.!?;:]*\s*/g)?.map((t) => t.trim()).filter(Boolean) ?? [];
}

export function Lectura({ texto, idioma = "en" }: { texto: string; idioma?: string }) {
  const parrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const hablar = useSyncExternalStore(sinSuscripcion, puedeHablar, () => false);
  const [leyendo, setLeyendo] = useState<number | null>(null);
  const [pausa, setPausa] = useState(false);
  const [lento, setLento] = useState(false);
  const [grande, setGrande] = useState(false);
  const [seleccion, setSeleccion] = useState("");
  const turno = useRef(0);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hablar) return;
    window.speechSynthesis.getVoices(); // algunas voces cargan recién al pedirlas
    const alSeleccionar = () => {
      const s = window.getSelection();
      const dentro = s && s.rangeCount && caja.current?.contains(s.getRangeAt(0).commonAncestorContainer);
      setSeleccion(dentro ? s.toString().trim().slice(0, 1500) : "");
    };
    document.addEventListener("selectionchange", alSeleccionar);
    return () => {
      document.removeEventListener("selectionchange", alSeleccionar);
      window.speechSynthesis.cancel();
    };
  }, [hablar]);

  function detener() {
    turno.current++;
    window.speechSynthesis.cancel();
    setLeyendo(null);
    setPausa(false);
  }

  function decir(partes: { texto: string; parrafo: number | null }[]) {
    detener();
    const mio = turno.current;
    const voz = vozIngles();
    let i = 0;
    const siguiente = () => {
      if (mio !== turno.current) return;
      const p = partes[i++];
      if (!p) { setLeyendo(null); return; }
      setLeyendo(p.parrafo);
      const u = new SpeechSynthesisUtterance(p.texto);
      u.lang = voz?.lang ?? "en-GB";
      if (voz) u.voice = voz;
      u.rate = lento ? 0.75 : 0.95;
      u.onend = siguiente;
      u.onerror = () => { if (mio === turno.current) setLeyendo(null); };
      window.speechSynthesis.speak(u);
    };
    siguiente();
  }

  const desde = (inicio: number) =>
    decir(parrafos.slice(inicio).flatMap((p, k) => trozos(p).map((t) => ({ texto: t, parrafo: inicio + k }))));

  function pausar() {
    if (pausa) { window.speechSynthesis.resume(); setPausa(false); }
    else { window.speechSynthesis.pause(); setPausa(true); }
  }

  const sonando = leyendo !== null;
  const boton = "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold";

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-2 bg-fondo/95 px-1 py-2 backdrop-blur-sm" role="toolbar" aria-label="Lectura">
        {hablar ? (
          <>
            {sonando || pausa ? (
              <>
                <button type="button" onClick={pausar} className={`${boton} bg-marca text-sobre-marca hover:bg-marca-fuerte`}>
                  <span aria-hidden>{pausa ? "▶" : "⏸"}</span>{pausa ? "Seguir" : "Pausa"}
                </button>
                <button type="button" onClick={detener} className={`${boton} border border-borde hover:bg-marca-suave`}>
                  <span aria-hidden>⏹</span>Detener
                </button>
              </>
            ) : (
              <button type="button" onClick={() => desde(0)} className={`${boton} bg-marca text-sobre-marca hover:bg-marca-fuerte`}>
                <span aria-hidden>🔊</span>Escuchar en inglés
              </button>
            )}
            {seleccion ? (
              <button type="button" onClick={() => decir(trozos(seleccion).map((t) => ({ texto: t, parrafo: null })))}
                className={`${boton} bg-acento text-white hover:bg-[#a90d26]`}>
                <span aria-hidden>🔊</span>Escuchar lo marcado
              </button>
            ) : null}
            <button type="button" aria-pressed={lento} onClick={() => setLento((v) => !v)}
              className={`${boton} border border-borde hover:bg-marca-suave aria-pressed:border-marca aria-pressed:bg-marca-suave`}>
              <span aria-hidden>🐢</span>Más lento
            </button>
          </>
        ) : null}
        <button type="button" aria-pressed={grande} onClick={() => setGrande((v) => !v)}
          className={`${boton} border border-borde hover:bg-marca-suave aria-pressed:border-marca aria-pressed:bg-marca-suave`}>
          <span aria-hidden className="font-serif">A</span><span aria-hidden className="-ml-1.5 font-serif text-lg">A</span>Letra grande
        </button>
      </div>
      {hablar ? <p className="mb-3 text-sm text-suave">Tocá ▶ al lado de un párrafo para escucharlo desde ahí, o marcá una palabra o frase para escuchar solo eso.</p> : null}

      <div ref={caja} lang={idioma}
        className={`renglones relative overflow-hidden rounded-[1.5rem] border border-borde bg-superficie pb-0 pl-14 pr-5 pt-[var(--renglon)] [--linea:rgb(19_29_79/0.09)] sm:pl-16 ${grande ? "text-[1.35rem] leading-[2.5rem] [--renglon:2.5rem]" : "text-lg leading-[2.1rem] [--renglon:2.1rem]"}`}>
        <span aria-hidden className="margen-cuaderno left-11 opacity-50 sm:left-[3.25rem]" />
        {parrafos.map((p, i) => (
          <div key={i} className="group relative">
            {hablar ? (
              <button type="button" onClick={() => desde(i)} aria-label={`Escuchar desde el párrafo ${i + 1}`}
                className="absolute -left-12 top-[calc((var(--renglon)-2.25rem)/2)] grid size-9 place-items-center rounded-full text-sm text-marca opacity-60 hover:bg-marca-suave hover:opacity-100 focus-visible:opacity-100 sm:-left-14">
                ▶
              </button>
            ) : null}
            <p className={`whitespace-pre-line pb-[var(--renglon)] transition-colors motion-reduce:transition-none ${leyendo === i ? "rounded bg-cielo-suave/70" : ""}`}>{p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
