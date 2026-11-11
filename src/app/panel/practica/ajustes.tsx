"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/componentes/ui";
import { configurarPractica } from "./acciones";

const METAS = [50, 100, 150, 250, 400];

export function Ajustes({ alias, mostrar, meta }: { alias: string | null; mostrar: boolean; meta: number }) {
  const [estado, accion, guardando] = useActionState(configurarPractica, null);
  return (
    <form action={accion} className="grid gap-4">
      <Campo id="alias" name="alias" etiqueta="Alias para el ranking" defaultValue={alias ?? ""} maxLength={20}
        placeholder="Ej.: Lucía_M" ayuda="Opcional. Si lo dejás vacío, aparece tu nombre y la inicial del apellido." />
      <fieldset>
        <legend className="text-sm font-medium">Meta semanal</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[...new Set([...METAS, meta])].sort((a, b) => a - b).map((m) => (
            <label key={m} className="cursor-pointer">
              <input type="radio" name="meta" value={m} defaultChecked={m === meta} className="peer sr-only" />
              <span className="inline-flex min-h-11 items-center rounded-full border-2 border-borde px-4 text-sm font-semibold peer-checked:border-marca peer-checked:bg-marca peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-marca">
                {m} XP
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-suave">Una lección de 5 ejercicios da entre 50 y 100 XP si los resolvés bien por primera vez en el día.</p>
      </fieldset>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" name="mostrar" defaultChecked={mostrar} className="mt-1 size-5 accent-[var(--marca)]" />
        <span>
          <span className="font-medium">Aparecer en el ranking de mi comisión</span>
          <span className="block text-xs text-suave">Si lo desactivás, seguís viendo tu progreso pero tus compañeros no te ven.</span>
        </span>
      </label>
      <div><Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar ajustes"}</Boton></div>
      {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
    </form>
  );
}
