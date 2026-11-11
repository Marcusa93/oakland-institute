"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";

export type Idioma = "es" | "en";
interface EstadoIdioma {
  idioma: Idioma;
  /** true cuando la persona eligió un idioma (el título deja de alternar solo). */
  elegido: boolean;
  cambiar(i: Idioma): void;
}

const Contexto = createContext<EstadoIdioma>({ idioma: "es", elegido: false, cambiar: () => {} });
const CLAVE = "oakland-idioma";

export function IdiomaProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>("es");
  const [elegido, setElegido] = useState(false);

  // Recordar la elección entre visitas (si el navegador lo permite).
  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = window.localStorage.getItem(CLAVE);
    } catch {}
    if (guardado === "en") {
      const t = window.setTimeout(() => { setIdioma("en"); setElegido(true); }, 0);
      return () => window.clearTimeout(t);
    }
  }, []);

  function cambiar(i: Idioma) {
    setIdioma(i);
    setElegido(true);
    try {
      window.localStorage.setItem(CLAVE, i);
    } catch {}
  }

  return <Contexto value={{ idioma, elegido, cambiar }}>{children}</Contexto>;
}

export const useIdioma = () => use(Contexto);

/** Selector de idioma de toda la página. */
export function SelectorIdioma({ tono = "claro", className = "" }: { tono?: "claro" | "oscuro"; className?: string }) {
  const { idioma, cambiar } = useIdioma();
  const base = tono === "claro" ? "bg-pizarra text-suave" : "bg-white/10 text-white/75";
  const activo = tono === "claro" ? "aria-pressed:bg-marca aria-pressed:text-white" : "aria-pressed:bg-white aria-pressed:text-marca";
  return (
    <div role="group" aria-label="Idioma de la página" className={`inline-flex rounded-full p-1 text-sm font-bold ${base} ${className}`}>
      {(["es", "en"] as const).map((i) => (
        <button key={i} type="button" aria-pressed={idioma === i} onClick={() => cambiar(i)} lang={i}
          className={`min-h-9 min-w-11 rounded-full px-3 transition-colors duration-300 ${activo}`}>
          <span aria-hidden>{i.toUpperCase()}</span>
          <span className="sr-only">{i === "es" ? "Castellano" : "English"}</span>
        </button>
      ))}
    </div>
  );
}
