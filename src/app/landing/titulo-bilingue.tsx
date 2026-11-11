"use client";

import { useEffect, useRef, useState } from "react";
import { useIdioma, type Idioma } from "./idioma";
import { Letras, useMovimientoReducido, useTraduccion } from "./traduccion";

const FRASES = {
  es: ["Hablá", "inglés", "sin miedo."],
  en: ["Speak", "English", "fearlessly."],
} as const;

function Linea({ texto }: { texto: string }) {
  return <span className="block whitespace-nowrap"><Letras letras={useTraduccion(texto, true)} /></span>;
}

/**
 * El título alterna solo entre castellano e inglés hasta que la persona elige
 * un idioma; desde ahí sigue al idioma de la página. Se pausa al apuntarlo.
 * Tocarlo o hacerle clic lo pasa al otro idioma por unos segundos.
 */
export function TituloBilingue() {
  const { idioma, elegido, cambiar } = useIdioma();
  const [alterno, setAlterno] = useState<Idioma>("es");
  const [pausa, setPausa] = useState(false);
  const reducido = useMovimientoReducido();
  const [forzado, setForzado] = useState<Idioma | null>(null);
  const volver = useRef<number | undefined>(undefined);
  const base: Idioma = elegido ? idioma : alterno;
  const mostrado: Idioma = forzado ?? base;

  function alternar() {
    setForzado(mostrado === "es" ? "en" : "es");
    window.clearTimeout(volver.current);
    volver.current = window.setTimeout(() => setForzado(null), 5000);
  }
  useEffect(() => () => window.clearTimeout(volver.current), []);

  useEffect(() => {
    if (elegido || pausa || reducido || forzado) return;
    const t = window.setInterval(() => setAlterno((i) => (i === "es" ? "en" : "es")), 5500);
    return () => window.clearInterval(t);
  }, [elegido, pausa, reducido, forzado]);

  return (
    <div onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
      <h1 className="font-extrabold leading-[0.88] tracking-[-0.04em] text-white [font-size:clamp(3rem,13vw,8.25rem)] [font-variation-settings:'opsz'_96,'wdth'_82]">
        <span className="sr-only" lang={idioma}>{FRASES[idioma].join(" ")}</span>
        <button
          type="button"
          onClick={alternar}
          aria-label={mostrado === "es" ? "Ver el título en inglés" : "Ver el título en castellano"}
          className="block cursor-pointer select-none text-left [-webkit-tap-highlight-color:transparent]"
        >
          <span aria-hidden className="block" lang={mostrado}>
            {FRASES[mostrado].map((t, n) => <Linea key={n} texto={t} />)}
          </span>
        </button>
      </h1>
      <div className="mt-6 inline-flex rounded-full bg-white/10 p-1 text-sm font-semibold" role="group" aria-label="Idioma de la página">
        {(["es", "en"] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={base === i}
            onClick={() => { setForzado(null); cambiar(i); }}
            className="min-h-11 rounded-full px-4 text-white/75 transition-colors duration-300 aria-pressed:bg-white aria-pressed:text-marca"
          >
            {i === "es" ? "Castellano" : "English"}
          </button>
        ))}
      </div>
    </div>
  );
}
