"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RespuestaAsistente } from "@/lib/asistente/tipos";

export type PerfilAI = "visitante" | "estudiante" | "docente" | "familia" | "gestion";

const INTRO: Record<PerfilAI, string> = {
  visitante: "¡Hola! Soy Oakland AI. Preguntame por cursos, horarios, edades, nivelación o cómo inscribirte.",
  estudiante: "Hi! Soy Oakland AI. Te explico gramática con ejemplos, te paso vocabulario y te ayudo a practicar.",
  docente: "¡Hola! Soy Oakland AI. Te doy ideas para planificar, warm-ups, rúbricas y devoluciones.",
  familia: "¡Hola! Soy Oakland AI. Te ayudo con horarios, avisos, pagos y cómo acompañar la cursada.",
  gestion: "¡Hola! Soy Oakland AI. Te ayudo a encontrar cómo hacer cada trámite en el sistema.",
};

const SUGERENCIAS: Record<PerfilAI, string[]> = {
  visitante: ["¿Qué horarios hay para niños?", "¿Cómo es la nivelación?", "Cursos para adultos", "¿La preinscripción asegura el lugar?"],
  estudiante: ["Explicame el present perfect", "¿Cómo uso el past simple?", "Vocabulario de la rutina", "¿Cómo practico en casa?"],
  docente: ["Ideas de warm-up", "¿Cómo planifico una clase?", "Rúbrica para speaking", "¿Cómo doy devoluciones?"],
  familia: ["¿Qué hago si mi hijo falta?", "¿Cómo informo una transferencia?", "¿Qué son las clases abiertas?", "¿Quién ve la info de mi hijo?"],
  gestion: ["¿Cómo registro un cobro?", "¿Cómo leo el tablero?", "Estados de una inscripción", "¿Cómo tomo asistencia?"],
};

export const EVENTO_ABRIR_AI = "oakland-ai:abrir";

/** Abre Oakland AI desde cualquier botón de la página, opcionalmente con una pregunta. */
export function abrirOaklandAI(pregunta?: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AI, { detail: { pregunta } }));
}

interface Mensaje {
  de: "persona" | "ai";
  texto: string;
  fuentes?: RespuestaAsistente["fuentes"];
  derivar?: boolean;
  generada?: boolean;
}

function Avatar({ chico = false }: { chico?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-acento font-extrabold italic text-white ${chico ? "size-8 text-xs" : "size-10 text-sm"}`}>
      Oa
    </span>
  );
}

export function OaklandAI({ perfil, ejemplo = false, enlaceContacto }: { perfil: PerfilAI; ejemplo?: boolean; enlaceContacto?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: "ai", texto: INTRO[perfil] }]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [visibles, setVisibles] = useState(Infinity); // letras visibles de la última respuesta
  const id = useId();
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  async function preguntar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || pensando) return;
    setTexto("");
    setMensajes((m) => [...m, { de: "persona", texto: q }]);
    setPensando(true);
    let nuevo: Mensaje;
    try {
      const r = await fetch("/api/asistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pregunta: q }) });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as RespuestaAsistente;
      nuevo = { de: "ai", texto: d.texto, fuentes: d.fuentes, derivar: d.derivar, generada: d.generadaPorIA };
    } catch {
      nuevo = { de: "ai", texto: "No me pude conectar. Revisá tu conexión y probá de nuevo." };
    }
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setVisibles(reducido ? Infinity : 0);
    setMensajes((m) => [...m, nuevo]);
    setPensando(false);
  }

  // La última respuesta se "escribe" de a poco.
  useEffect(() => {
    if (visibles === Infinity) return;
    const ultimo = mensajes[mensajes.length - 1];
    if (!ultimo || visibles >= ultimo.texto.length) {
      const t = window.setTimeout(() => setVisibles(Infinity), 0);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setVisibles((v) => v + 4), 12);
    return () => window.clearTimeout(t);
  }, [visibles, mensajes]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes, visibles, pensando]);

  // Abrir desde otros botones de la página.
  useEffect(() => {
    const abrir = (e: Event) => {
      setAbierto(true);
      const q = (e as CustomEvent<{ pregunta?: string }>).detail?.pregunta;
      if (q) void preguntar(q);
      window.setTimeout(() => campo.current?.focus(), 50);
    };
    window.addEventListener(EVENTO_ABRIR_AI, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_AI, abrir);
  });

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  const usadas = new Set(mensajes.filter((m) => m.de === "persona").map((m) => m.texto));
  const sugerencias = SUGERENCIAS[perfil].filter((s) => !usadas.has(s));

  return (
    <div className="fixed bottom-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3 sm:bottom-4 sm:right-4">
      {abierto ? (
        <section
          id={id}
          role="dialog"
          aria-label="Oakland AI"
          onKeyDown={(e) => e.key === "Escape" && cerrar()}
          className="flex h-[min(36rem,calc(100dvh-5.5rem))] w-[23rem] max-w-full flex-col overflow-hidden rounded-[1.75rem] border border-borde bg-pizarra shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)]"
        >
          <header className="flex items-center gap-3 bg-marca px-4 py-3 text-white">
            <Avatar />
            <div className="min-w-0 flex-1">
              <h2 className="font-extrabold leading-tight">Oakland AI</h2>
              <p className="truncate text-xs text-white/75">{ejemplo ? "Demo con información de ejemplo" : "Responde con información del instituto"}</p>
            </div>
            <button type="button" onClick={cerrar} aria-label="Cerrar Oakland AI" className="grid size-10 place-items-center rounded-full text-2xl leading-none hover:bg-white/10">×</button>
          </header>

          <div ref={lista} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {mensajes.map((m, i) => {
              const esUltima = i === mensajes.length - 1;
              const contenido = m.de === "ai" && esUltima && visibles !== Infinity ? m.texto.slice(0, visibles) : m.texto;
              return m.de === "persona" ? (
                <p key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-marca px-4 py-2.5 text-white">{m.texto}</p>
              ) : (
                <div key={i} className="flex items-end gap-2">
                  <Avatar chico />
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-sm">
                    {m.generada ? <p className="mb-1 text-xs font-semibold text-alerta">Redactado por IA: revisá la fuente.</p> : null}
                    <p className="whitespace-pre-line text-[0.95rem] leading-relaxed">{contenido}</p>
                    {m.fuentes?.length && (!esUltima || visibles === Infinity) ? (
                      <p className="mt-2 flex flex-wrap gap-1.5">
                        {m.fuentes.map((f) => (
                          <span key={f.slug} className="rounded-full bg-cielo-suave px-2.5 py-0.5 text-xs font-semibold text-marca">Fuente: {f.titulo}</span>
                        ))}
                      </p>
                    ) : null}
                    {m.derivar && enlaceContacto ? (
                      <a href={enlaceContacto} onClick={cerrar} className="mt-2 inline-block text-sm font-semibold text-acento underline-offset-4 hover:underline">
                        Hablar con una persona
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {pensando ? (
              <div className="flex items-end gap-2" aria-label="Oakland AI está escribiendo">
                <Avatar chico />
                <span className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3.5">
                  {[0, 1, 2].map((n) => <span key={n} className="punto-escribiendo size-2 rounded-full bg-marca/50" style={{ animationDelay: `${n * 150}ms` }} />)}
                </span>
              </div>
            ) : null}
          </div>

          {sugerencias.length ? (
            <div className="flex gap-2 overflow-x-auto px-4 pb-2" aria-label="Preguntas sugeridas">
              {sugerencias.map((s) => (
                <button key={s} type="button" onClick={() => preguntar(s)} disabled={pensando}
                  className="shrink-0 rounded-full border border-marca/30 bg-white px-3 py-1.5 text-sm font-medium text-marca hover:border-marca disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form onSubmit={(e) => { e.preventDefault(); void preguntar(texto); }} className="flex items-end gap-2 border-t border-borde bg-white p-3">
            <label htmlFor={`${id}-q`} className="sr-only">Escribí tu pregunta</label>
            <textarea
              id={`${id}-q`}
              ref={campo}
              rows={1}
              maxLength={500}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void preguntar(texto);
                }
              }}
              placeholder="Escribí tu pregunta…"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-borde bg-pizarra px-3 py-2.5 text-base"
            />
            <button type="submit" disabled={pensando || !texto.trim()} aria-label="Enviar pregunta"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-acento text-white disabled:opacity-40">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden><path d="M3.4 20.4 21 12 3.4 3.6l.1 6.5L15 12l-11.5 1.9z" /></svg>
            </button>
          </form>
        </section>
      ) : null}

      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-label={abierto ? "Cerrar Oakland AI" : "Abrir Oakland AI"}
        className="flex min-h-14 items-center gap-3 rounded-full bg-marca p-2 font-bold text-white shadow-[0_15px_40px_-10px_rgb(0_0_0/0.5)] hover:bg-marca-fuerte sm:pr-5"
      >
        <Avatar />
        {/* En celular queda solo el círculo, para no tapar el contenido. */}
        <span aria-hidden className="hidden text-left leading-tight sm:block">
          Oakland AI
          <span className="block text-xs font-medium text-white/75">{abierto ? "Cerrar" : "Preguntame lo que quieras"}</span>
        </span>
      </button>
    </div>
  );
}
