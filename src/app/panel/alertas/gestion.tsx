"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, Boton } from "@/componentes/ui";
import { actualizarAlerta, avisarFamilia, revisarAlertas } from "./acciones";

export function RevisarAhora() {
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [revisando, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Boton type="button" disabled={revisando} onClick={() => iniciar(async () => setResultado(await revisarAlertas()))}>
        <span aria-hidden className={revisando ? "motion-safe:animate-spin" : ""}>↻</span>
        {revisando ? "Revisando asistencia, notas y entregas…" : "Revisar ahora"}
      </Boton>
      {resultado ? <Aviso tono={resultado.ok ? "exito" : "peligro"}>{resultado.mensaje}</Aviso> : null}
    </div>
  );
}

const ACCIONES: Record<string, [string, string][]> = {
  abierta: [["en_seguimiento", "Tomar en seguimiento"], ["resuelta", "Marcar resuelta"]],
  en_seguimiento: [["resuelta", "Marcar resuelta"], ["abierta", "Reabrir"]],
  resuelta: [["abierta", "Reabrir"]],
};

export function GestionAlerta({ id, estado, nota }: { id: string; estado: string; nota: string | null }) {
  const [res, accion, guardando] = useActionState(actualizarAlerta, null);
  return (
    <form action={accion} className="mt-3 space-y-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`nota-${id}`} className="text-sm font-medium">Nota de seguimiento</label>
      <textarea id={`nota-${id}`} name="nota" rows={2} maxLength={1000} defaultValue={nota ?? ""}
        placeholder="Hablé con la familia, acordamos…" className="block w-full rounded-base border border-borde bg-superficie px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        {(ACCIONES[estado] ?? []).map(([valor, etiqueta], i) => (
          <Boton key={valor} type="submit" name="estado" value={valor} variante={i === 0 ? "primario" : "secundario"} disabled={guardando}>{etiqueta}</Boton>
        ))}
      </div>
      {res ? <Aviso tono={res.ok ? "exito" : "peligro"}>{res.mensaje}</Aviso> : null}
    </form>
  );
}

export function AvisoFamilia({ alerta, responsables, asunto, cuerpo }: {
  alerta: string; responsables: { id: string; nombre: string; parentesco: string | null }[]; asunto: string; cuerpo: string;
}) {
  const [res, accion, enviando] = useActionState(avisarFamilia, null);
  if (res?.ok) return <div className="mt-3"><Aviso tono="exito">{res.mensaje}</Aviso></div>;
  return (
    <details className="mt-3 rounded-base border border-borde p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-marca">✉️ Avisar a la familia</summary>
      {responsables.length === 0 ? (
        <p className="text-sm text-suave">El estudiante no tiene responsables académicos verificados. Si es mayor de edad, escribile desde Mensajes.</p>
      ) : (
        <form action={accion} className="mt-2 space-y-3">
          <input type="hidden" name="alerta" value={alerta} />
          <fieldset>
            <legend className="text-sm font-medium">Para</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {responsables.map((r) => (
                <label key={r.id} className="flex min-h-11 items-center gap-2 rounded-full border border-borde px-3 text-sm has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                  <input type="checkbox" name="destinatario" value={r.id} defaultChecked /> {r.nombre}{r.parentesco ? ` (${r.parentesco})` : ""}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`asunto-${alerta}`} className="text-sm font-medium">Asunto</label>
            <input id={`asunto-${alerta}`} name="asunto" maxLength={150} defaultValue={asunto} required className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3" />
          </div>
          <div>
            <label htmlFor={`cuerpo-${alerta}`} className="text-sm font-medium">Mensaje</label>
            <textarea id={`cuerpo-${alerta}`} name="cuerpo" rows={6} maxLength={4000} defaultValue={cuerpo} required className="mt-1 block w-full rounded-base border border-borde bg-superficie px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-suave">Texto sugerido: revisalo antes de enviar. Llega como aviso académico al panel de la familia.</p>
          </div>
          <Boton type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar aviso"}</Boton>
          {res && !res.ok ? <Aviso tono="peligro">{res.mensaje}</Aviso> : null}
        </form>
      )}
    </details>
  );
}
