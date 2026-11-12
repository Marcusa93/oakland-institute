"use client";

import { useState } from "react";

/** Comparte el resumen por WhatsApp (lo elige la familia) o lo copia. */
export function CompartirResumen({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2200);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1f7a4d] px-5 text-sm font-semibold text-white hover:bg-[#17603c]">
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3Z" />
        </svg>
        Compartir por WhatsApp
      </a>
      <button type="button" onClick={copiar}
        className="inline-flex min-h-11 items-center rounded-full border border-borde bg-superficie px-5 text-sm font-semibold text-marca hover:bg-marca-suave" aria-live="polite">
        {copiado ? "¡Copiado!" : "Copiar texto"}
      </button>
    </div>
  );
}
