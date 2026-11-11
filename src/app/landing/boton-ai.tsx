"use client";

import { abrirOaklandAI } from "@/componentes/oakland-ai";
import { Traducible as T } from "./traduccion";

export function BotonOaklandAI({ pregunta, className = "" }: { pregunta?: string; className?: string }) {
  return (
    <button type="button" onClick={() => abrirOaklandAI(pregunta)} className={className}>
      <T es="Preguntale a Oakland AI" en="Ask Oakland AI" />
    </button>
  );
}
