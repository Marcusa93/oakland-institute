"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AreaTexto, Aviso, Boton, Campo } from "@/componentes/ui";
import { guardarInforme } from "./acciones";
import { sugerirBorrador, type DatosInforme } from "./comun";

export function EditorInforme({ informe, estudiante, desde, hasta, datos, nombrePila, inicial }: {
  informe?: string; estudiante: string; desde: string; hasta: string; datos: DatosInforme; nombrePila: string;
  inicial: { periodo: string; comentario: string; recomendaciones: string; destinatario: "direccion" | "familia" };
}) {
  const router = useRouter();
  const [periodo, setPeriodo] = useState(inicial.periodo);
  const [comentario, setComentario] = useState(inicial.comentario);
  const [recomendaciones, setRecomendaciones] = useState(inicial.recomendaciones);
  const [destinatario, setDestinatario] = useState(inicial.destinatario);
  const [sugerido, setSugerido] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardando, iniciar] = useTransition();

  function sugerir() {
    if ((comentario || recomendaciones) && !window.confirm("El borrador automático reemplaza lo que escribiste. ¿Seguimos?")) return;
    const b = sugerirBorrador(datos, nombrePila);
    setComentario(b.comentario);
    setRecomendaciones(b.recomendaciones);
    setSugerido(true);
  }

  function guardar(enviar: boolean) {
    if (enviar && !window.confirm(destinatario === "familia" ? "¿Enviar el informe a la familia? Después no se puede editar." : "¿Enviar el informe a dirección? Después no se puede editar.")) return;
    setResultado(null);
    iniciar(async () => {
      const r = await guardarInforme({ informe: informe ?? "", estudiante, periodo, desde, hasta, comentario, recomendaciones, destinatario, enviar });
      setResultado(r);
      if (r.ok && r.id) router.push(`/panel/informes/${r.id}`);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(false); }} className="space-y-4 rounded-base border border-borde bg-superficie p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Tu mirada</h2>
          <p className="text-sm text-suave">Los números los calcula el sistema; el comentario y las recomendaciones los escribís vos.</p>
        </div>
        <Boton type="button" variante="secundario" onClick={sugerir}>✨ Sugerir borrador</Boton>
      </div>
      {sugerido ? (
        <p className="globo globo-izq mb-6 bg-cielo-suave px-4 py-2.5 text-sm text-marca-fuerte" role="status">
          <strong>Borrador automático, revisalo.</strong> Lo armamos con reglas fijas a partir de los datos del período (sin inteligencia artificial). Ajustá el tono y sumá lo que viste en clase.
        </p>
      ) : null}
      <Campo id="inf-periodo" etiqueta="Nombre del período" value={periodo} onChange={(e) => setPeriodo(e.target.value)} maxLength={80} required placeholder="1er trimestre 2027" />
      <AreaTexto id="inf-comentario" etiqueta="Comentario" rows={7} maxLength={6000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <AreaTexto id="inf-recomendaciones" etiqueta="Recomendaciones" rows={5} maxLength={4000} value={recomendaciones} onChange={(e) => setRecomendaciones(e.target.value)} />
      <fieldset>
        <legend className="text-sm font-medium">Destinatario</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {([["direccion", "Dirección", "Uso interno del instituto."], ["familia", "Familia", "Lo ven el estudiante y sus responsables académicos."]] as const).map(([v, e, ayuda]) => (
            <label key={v} className="flex cursor-pointer gap-2 rounded-base border border-borde p-3 text-sm has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
              <input type="radio" name="inf-destinatario" value={v} checked={destinatario === v} onChange={() => setDestinatario(v)} className="mt-1" />
              <span><strong>{e}</strong><span className="block text-xs text-suave">{ayuda}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Boton type="button" disabled={guardando} onClick={() => guardar(true)}>{guardando ? "Guardando…" : "Enviar"}</Boton>
        <Boton type="submit" variante="secundario" disabled={guardando}>Guardar borrador</Boton>
      </div>
      {resultado ? <Aviso tono={resultado.ok ? "exito" : "peligro"}>{resultado.mensaje}</Aviso> : null}
    </form>
  );
}
