"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import { actualizarConsulta } from "./acciones";
import { ESTADOS } from "./estados";


export function Seguimiento({ consulta, esMia }: {
  consulta: { id: string; estado: string; proxima_accion: string | null; proxima_accion_en: string | null; motivo_perdida: string | null };
  esMia: boolean;
}) {
  const [estado, accion, guardando] = useActionState(actualizarConsulta, null);
  const id = consulta.id;
  return (
    <form action={accion} className="mt-3 grid gap-3 border-t border-borde pt-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="id" value={id} />
      <Selector id={`estado-${id}`} name="estado" etiqueta="Estado" defaultValue={consulta.estado}>
        {ESTADOS.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
      </Selector>
      <Campo id={`accion-${id}`} name="proxima_accion" etiqueta="Próxima acción" defaultValue={consulta.proxima_accion ?? ""} placeholder="Llamar, coordinar nivelación…" />
      <Campo id={`fecha-${id}`} name="proxima_accion_en" type="date" etiqueta="Para el día" defaultValue={consulta.proxima_accion_en?.slice(0, 10) ?? ""} />
      <Campo id={`motivo-${id}`} name="motivo_perdida" etiqueta="Motivo (si se perdió)" defaultValue={consulta.motivo_perdida ?? ""} />
      <Campo id={`nota-${id}`} name="nota" etiqueta="Agregar nota al historial" className="sm:col-span-2 lg:col-span-3" />
      <div className="flex flex-wrap items-end gap-3">
        {!esMia ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="tomar" /> Quedar como responsable</label> : null}
        <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Boton>
      </div>
      {estado ? <div className="sm:col-span-2 lg:col-span-4"><Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso></div> : null}
    </form>
  );
}
