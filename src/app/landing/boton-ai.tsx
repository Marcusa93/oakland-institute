"use client";

import { abrirOaklandAI } from "@/componentes/oakland-ai";
import { Traducible as T } from "./traduccion";

export function BotonOaklandAI({ pregunta, className = "", conIcono = false }: { pregunta?: string; className?: string; conIcono?: boolean }) {
  return (
    <button type="button" onClick={() => abrirOaklandAI(pregunta)} className={className}>
      {conIcono ? (
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-acento text-[0.7rem] font-extrabold italic text-white">Oa</span>
      ) : null}
      <T es="Preguntale a Oakland AI" en="Ask Oakland AI" />
    </button>
  );
}
