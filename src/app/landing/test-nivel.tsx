"use client";

import { useState } from "react";
import { prellenarConsulta } from "./prellenar";
import { Traducible as T } from "./traduccion";

const PREGUNTAS = [
  { frase: ["I", "from Monteros."], opciones: ["is", "am", "are"], correcta: 1 },
  { frase: ["Yesterday we", "to the cinema."], opciones: ["go", "goes", "went"], correcta: 2 },
  { frase: ["She has lived here", "2019."], opciones: ["since", "for", "from"], correcta: 0 },
  { frase: ["If I", "more time, I would travel."], opciones: ["have", "had", "will have"], correcta: 1 },
] as const;

const RESULTADOS = [
  { hasta: 1, titulo: "Arrancás desde el principio", texto: "Perfecto para empezar con un grupo inicial, sin presión y desde lo básico." },
  { hasta: 3, titulo: "Ya tenés una base", texto: "Hay cosas que te salen. Con una nivelación vemos en qué grupo vas a avanzar más rápido." },
  { hasta: 4, titulo: "Venís con buen nivel", texto: "Seguramente te corresponde un grupo intermedio o avanzado. Lo confirmamos en la nivelación." },
];

export function TestNivel() {
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<number[]>([]);
  const [elegida, setElegida] = useState<number | null>(null);

  const terminado = paso >= PREGUNTAS.length;
  const aciertos = respuestas.filter((r, i) => r === PREGUNTAS[i].correcta).length;
  const resultado = RESULTADOS.find((r) => aciertos <= r.hasta) ?? RESULTADOS[RESULTADOS.length - 1];

  function responder(i: number) {
    if (elegida !== null) return;
    setElegida(i);
    window.setTimeout(() => {
      setRespuestas((r) => [...r, i]);
      setElegida(null);
      setPaso((p) => p + 1);
    }, 700);
  }

  if (terminado) {
    return (
      <div className="globo globo-der bg-white p-6 text-texto sm:p-8" aria-live="polite">
        <p className="text-sm font-semibold text-suave">{aciertos} de {PREGUNTAS.length} respuestas correctas</p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-marca-fuerte">{resultado.titulo}</p>
        <p className="mt-2 text-lg text-suave">{resultado.texto}</p>
        <p className="mt-4 text-sm text-suave">Es una orientación rápida: el grupo lo define la nivelación con un docente.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => prellenarConsulta({ tipo: "consulta", mensaje: `Hice el test rápido de la página (${aciertos}/${PREGUNTAS.length}). Quiero coordinar una nivelación.` })}
            className="inline-flex min-h-12 items-center rounded-full bg-acento px-6 font-bold text-white hover:bg-[#a90d26]"
          >
            <T es="Pedir nivelación" en="Book a placement test" />
          </button>
          <button type="button" onClick={() => { setPaso(0); setRespuestas([]); }} className="min-h-12 rounded-full px-4 font-semibold text-marca underline-offset-4 hover:underline">
            <T es="Hacerlo de nuevo" en="Try again" />
          </button>
        </div>
      </div>
    );
  }

  const q = PREGUNTAS[paso];
  return (
    <div className="globo globo-der bg-white p-6 text-texto sm:p-8">
      <div className="flex items-center gap-2" aria-hidden>
        {PREGUNTAS.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < paso ? "bg-acento" : i === paso ? "bg-marca" : "bg-pizarra"}`} />
        ))}
      </div>
      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-suave"><T es={`Pregunta ${paso + 1} de ${PREGUNTAS.length}: completá la frase`} en={`Question ${paso + 1} of ${PREGUNTAS.length}: complete the sentence`} /></legend>
        <p className="mt-3 text-2xl font-bold leading-snug sm:text-3xl" lang="en">
          {q.frase[0]}{" "}
          <span className={`inline-block min-w-[4.5ch] border-b-4 text-center ${elegida === null ? "border-cielo text-transparent" : elegida === q.correcta ? "border-exito text-exito" : "border-acento text-acento"}`}>
            {elegida === null ? "___" : q.opciones[elegida]}
          </span>{" "}
          {q.frase[1]}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {q.opciones.map((o, i) => (
            <button
              key={o}
              type="button"
              lang="en"
              disabled={elegida !== null}
              onClick={() => responder(i)}
              className="min-h-12 rounded-full border-2 border-marca px-6 text-lg font-semibold text-marca hover:bg-marca hover:text-white disabled:opacity-60"
            >
              {o}
            </button>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {elegida === null ? "" : elegida === q.correcta ? "Correcto." : `No era esa. La respuesta es ${q.opciones[q.correcta]}.`}
        </p>
      </fieldset>
    </div>
  );
}
