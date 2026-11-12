"use client";

import { useActionState, useState, useTransition } from "react";
import type { Resultado } from "@/app/panel/acciones";
import { AreaTexto, Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import { PLANTILLAS_CONSULTA, type PlantillaConsulta } from "@/lib/whatsapp";
import { actualizarConsulta, cargarConsulta, registrarContacto } from "./acciones";
import { ESTADOS } from "./estados";

export function Seguimiento({ consulta, esMia }: {
  consulta: { id: string; estado: string; proxima_accion: string | null; proxima_accion_en: string | null; motivo_perdida: string | null };
  esMia: boolean;
}) {
  const [estado, accion, guardando] = useActionState(actualizarConsulta, null);
  const id = consulta.id;
  return (
    <form action={accion} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="id" value={id} />
      <Selector id={`estado-${id}`} name="estado" etiqueta="Estado" defaultValue={consulta.estado}>
        {ESTADOS.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
      </Selector>
      <Campo id={`accion-${id}`} name="proxima_accion" etiqueta="Próxima acción" defaultValue={consulta.proxima_accion ?? ""} placeholder="Llamar, coordinar la prueba de nivel…" />
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

const chip = "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold";

/**
 * Responder con un toque: abre WhatsApp con el mensaje ya escrito (o el
 * teléfono, o el correo) y deja el contacto en el historial.
 */
export function Contactar({ id, whatsapp, sugerida, telefono, email }: {
  id: string;
  whatsapp: Record<PlantillaConsulta, string> | null;
  sugerida: PlantillaConsulta;
  telefono: string | null;
  email: string | null;
}) {
  const [, empezar] = useTransition();
  const [hecho, setHecho] = useState<string | null>(null);
  const registrar = (medio: string, plantilla?: PlantillaConsulta) => {
    setHecho(medio === "whatsapp" ? "Se abrió WhatsApp. Quedó anotado en el historial." : "Quedó anotado en el historial.");
    empezar(() => registrarContacto({ id, medio, plantilla }));
  };
  const orden = (Object.keys(PLANTILLAS_CONSULTA) as PlantillaConsulta[]).sort((a, b) => Number(b === sugerida) - Number(a === sugerida));
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {whatsapp ? orden.map((p) => (
          <a key={p} href={whatsapp[p]} target="_blank" rel="noopener" onClick={() => registrar("whatsapp", p)}
            className={`${chip} ${p === sugerida ? "bg-[#1f8a4c] text-white hover:bg-[#18703d]" : "border border-borde hover:bg-marca-suave"}`}>
            <span aria-hidden>💬</span>{PLANTILLAS_CONSULTA[p]}
          </a>
        )) : null}
        {telefono ? (
          <a href={`tel:${telefono.replace(/[^\d+]/g, "")}`} onClick={() => registrar("llamada")} className={`${chip} border border-borde hover:bg-marca-suave`}>
            <span aria-hidden>📞</span>Llamar
          </a>
        ) : null}
        {email ? (
          <a href={`mailto:${email}?subject=${encodeURIComponent("Tu consulta en Oakland Institute")}`} onClick={() => registrar("email")} className={`${chip} border border-borde hover:bg-marca-suave`}>
            <span aria-hidden>✉️</span>Correo
          </a>
        ) : null}
      </div>
      {!whatsapp && telefono ? <p className="mt-1 text-xs text-suave">El teléfono no tiene código de área: no se puede abrir WhatsApp. Corregilo al cargarlo o llamá.</p> : null}
      {hecho ? <p className="mt-1 text-xs text-suave" role="status">{hecho}</p> : null}
    </div>
  );
}

const ORIGENES = [["whatsapp", "WhatsApp"], ["telefono", "Teléfono"], ["presencial", "En el instituto"], ["redes", "Redes sociales"], ["referido", "Recomendación"], ["otro", "Otro"]] as const;

export function NuevaConsulta({ cursos, manana }: { cursos: { id: string; nombre: string }[]; manana: string }) {
  const [menor, setMenor] = useState(false);
  const [clave, setClave] = useState(0);
  // Al guardar bien se vacía el formulario (nueva clave); con error queda lo escrito.
  const [estado, accion, guardando] = useActionState(async (previo: Resultado | null, f: FormData) => {
    const r = await cargarConsulta(previo, f);
    if (r.ok) { setClave((k) => k + 1); setMenor(false); }
    return r;
  }, null);
  const [, empezar] = useTransition();
  return (
    // onSubmit (y no action): si hay un error, lo escrito queda en el formulario.
    <form key={clave} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); empezar(() => accion(f)); }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Campo id="nc-nombre" name="nombre_contacto" etiqueta="Nombre de quien consulta" required maxLength={120} autoComplete="off" className="lg:col-span-2" />
      <Campo id="nc-telefono" name="telefono" type="tel" etiqueta="Teléfono (con código de área)" placeholder="3863 41-4937" maxLength={30} />
      <Campo id="nc-email" name="email" type="email" etiqueta="Correo (opcional)" maxLength={160} />
      <Selector id="nc-origen" name="origen" etiqueta="¿Por dónde llegó?" defaultValue="whatsapp">
        {ORIGENES.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
      </Selector>
      <Selector id="nc-curso" name="curso_interes_id" etiqueta="Le interesa" defaultValue="">
        <option value="">Todavía no sabe</option>
        {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <label className="flex min-h-11 items-end gap-2 pb-2 text-sm lg:col-span-2">
        <input type="checkbox" name="es_para_menor" checked={menor} onChange={(e) => setMenor(e.target.checked)} /> Es para un hijo o hija (menor)
      </label>
      {menor ? (
        <>
          <Campo id="nc-estudiante" name="nombre_estudiante" etiqueta="Nombre del chico o chica" maxLength={120} className="lg:col-span-2" />
          <Campo id="nc-edad" name="edad_estudiante" type="number" min={3} max={99} etiqueta="Edad" />
        </>
      ) : null}
      <AreaTexto id="nc-mensaje" name="mensaje" etiqueta="Qué preguntó o qué le dijiste" rows={2} maxLength={2000} className="sm:col-span-2 lg:col-span-4" />
      <Campo id="nc-accion" name="proxima_accion" etiqueta="Próxima acción" placeholder="Volver a escribir" maxLength={200} className="lg:col-span-2" />
      <Campo id="nc-fecha" name="proxima_accion_en" type="date" etiqueta="Para el día" defaultValue={manana} />
      <div className="flex items-end">
        <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Cargar consulta"}</Boton>
      </div>
      {estado ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso>
        </div>
      ) : null}
    </form>
  );
}
