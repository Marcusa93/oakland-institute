"use client";

import { Aviso, Boton } from "@/componentes/ui";
import { useFormulario } from "@/componentes/usar-formulario";
import { guardarPreferencias } from "./acciones";
import type { GrupoTipos, TipoNotificacion } from "./tipos";

/** Casillas por tipo de notificación; se guardan juntas con un solo botón. */
export function Preferencias({ grupos, activas }: { grupos: GrupoTipos[]; activas: Record<TipoNotificacion, boolean> }) {
  const [estado, accion, guardando] = useFormulario(guardarPreferencias, null);
  return (
    <form {...accion} className="grid gap-6">
      {grupos.map((g) => (
        <fieldset key={g.titulo}>
          <legend className="text-sm font-bold uppercase tracking-wide text-suave">{g.titulo}</legend>
          <div className="mt-2 divide-y divide-borde rounded-base border border-borde">
            {g.tipos.map((t) => (
              <label key={t.tipo} className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3 hover:bg-marca-suave/50">
                <input type="hidden" name="mostrados" value={t.tipo} />
                <input type="checkbox" name="activo" value={t.tipo} defaultChecked={activas[t.tipo]} className="mt-1 size-5 shrink-0 accent-[var(--marca)]" />
                <span>
                  <span className="font-medium">{t.etiqueta}</span>
                  <span className="block text-sm text-suave">{t.detalle}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div><Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar preferencias"}</Boton></div>
      {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
    </form>
  );
}
