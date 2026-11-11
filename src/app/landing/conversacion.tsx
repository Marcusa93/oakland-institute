"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useMovimientoReducido } from "./traduccion";

/** Pares pregunta/respuesta: uno en castellano, el otro en inglés. */
const DIALOGOS = [
  ["¿Arrancamos?", "Ready to start?"],
  ["How are you today?", "¡Muy bien, gracias!"],
  ["¿Qué aprendemos hoy?", "Let's talk about travel!"],
  ["Nice to meet you!", "¡Igualmente!"],
  ["¿Practicamos speaking?", "Yes, let's do it!"],
] as const;

type Fase = "pregunta" | "escribiendo" | "respuesta";

/**
 * Foto de la portada con una conversación bilingüe que avanza sola:
 * aparece la pregunta, el otro "escribe" y responde. La foto flota y se
 * inclina apenas con el mouse. Con movimiento reducido, todo queda quieto.
 */
export function ConversacionPortada() {
  const reducido = useMovimientoReducido();
  const [n, setN] = useState(0);
  const [fase, setFase] = useState<Fase>("respuesta");
  const marco = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducido) return;
    const tiempos: Array<[Fase, number]> = [["pregunta", 0], ["escribiendo", 1300], ["respuesta", 2500]];
    let timers: number[] = [];
    const ciclo = () => {
      timers.forEach(window.clearTimeout);
      timers = tiempos.map(([f, ms]) => window.setTimeout(() => setFase(f), ms));
    };
    const intervalo = window.setInterval(() => {
      setN((x) => (x + 1) % DIALOGOS.length);
      ciclo();
    }, 5200);
    return () => {
      window.clearInterval(intervalo);
      timers.forEach(window.clearTimeout);
    };
  }, [reducido]);

  // Inclinación sutil siguiendo el mouse (solo con puntero fino).
  useEffect(() => {
    const el = marco.current;
    if (!el || reducido || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const mover = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
    };
    const salir = () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    const zona = el.parentElement ?? el;
    zona.addEventListener("pointermove", mover);
    zona.addEventListener("pointerleave", salir);
    return () => {
      zona.removeEventListener("pointermove", mover);
      zona.removeEventListener("pointerleave", salir);
    };
  }, [reducido]);

  const [pregunta, respuesta] = DIALOGOS[n];
  const verRespuesta = reducido || fase === "respuesta";

  return (
    <div className="relative mx-auto w-full max-w-md px-3 pt-8 pb-10 sm:px-6 lg:max-w-none [perspective:1200px]">
      <div className="flotar">
        <div
          ref={marco}
          className="globo globo-izq bg-white p-2 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.45)] transition-transform duration-300 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]"
        >
          <Image
            src="/fotos/clase-adultos.webp"
            alt="Clase de inglés para adultos en un aula del instituto"
            width={960}
            height={640}
            priority
            sizes="(min-width: 1024px) 480px, 90vw"
            className="aspect-[4/3] w-full rounded-[1.9rem] object-cover"
          />
        </div>
      </div>

      {/* La conversación: por encima de la foto y dentro de la pantalla. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
        <p
          key={`p-${n}`}
          lang={/[¿¡ñáéíóú]/i.test(pregunta) ? "es" : "en"}
          className="globo globo-izq burbuja-entra absolute left-0 top-0 max-w-[75%] whitespace-nowrap bg-cielo px-5 py-3 text-base font-bold text-marca-fuerte shadow-lg sm:text-lg"
        >
          {pregunta}
        </p>
        <div className="absolute bottom-0 right-0 flex max-w-[80%] justify-end">
          {verRespuesta ? (
            <p
              key={`r-${n}`}
              lang={/[¿¡ñáéíóú]/i.test(respuesta) ? "es" : "en"}
              className="globo globo-der burbuja-entra whitespace-nowrap bg-acento px-5 py-3 text-base font-bold text-white shadow-lg sm:text-lg"
            >
              {respuesta}
            </p>
          ) : fase === "escribiendo" ? (
            <p className="globo globo-der burbuja-entra flex items-center gap-1.5 bg-acento px-5 py-4 shadow-lg">
              {[0, 1, 2].map((i) => (
                <span key={i} className="punto-escribiendo size-2 rounded-full bg-white" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
