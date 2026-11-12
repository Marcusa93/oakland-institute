"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, Boton } from "@/componentes/ui";
import { recordarEnApp, recordarTodasLasVencidas, registrarRecordatorioWhatsapp } from "../acciones";

const chip = "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold";

export function Recordar({ persona, whatsapp }: { persona: string; whatsapp: string | null }) {
  const [estado, accion, enviando] = useActionState(recordarEnApp, null);
  const [, empezar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener"
            onClick={() => { setAbierto(true); empezar(() => registrarRecordatorioWhatsapp(persona)); }}
            className={`${chip} bg-[#1f8a4c] text-white hover:bg-[#18703d]`}>
            <span aria-hidden>💬</span>Recordar por WhatsApp
          </a>
        ) : null}
        <form action={accion}>
          <input type="hidden" name="persona" value={persona} />
          <button disabled={enviando} className={`${chip} border border-borde hover:bg-marca-suave disabled:opacity-60`}>
            <span aria-hidden>🔔</span>{enviando ? "Enviando…" : "Avisar en la app"}
          </button>
        </form>
      </div>
      {abierto ? <p className="mt-1 text-xs text-suave" role="status">Se abrió WhatsApp con el mensaje escrito. Quedó registrado como recordado.</p> : null}
      {estado ? <div className="mt-2"><Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso></div> : null}
    </div>
  );
}

export function RecordarTodas({ cantidad }: { cantidad: number }) {
  const [estado, accion, enviando] = useActionState(recordarTodasLasVencidas, null);
  return (
    <form action={accion} onSubmit={(e) => { if (!confirm(`¿Enviar el aviso en la app a ${cantidad} ${cantidad === 1 ? "familia" : "familias"}?`)) e.preventDefault(); }}
      className="flex flex-wrap items-center gap-3">
      <Boton disabled={enviando || cantidad === 0}>{enviando ? "Enviando…" : `Avisar en la app a ${cantidad} ${cantidad === 1 ? "familia" : "familias"}`}</Boton>
      {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
    </form>
  );
}
