"use client";

import { useActionState, useEffect, useState } from "react";
import { EVENTO_PRELLENAR, type Prellenado } from "@/app/landing/prellenar";
import { enviarConsulta, type EstadoConsulta } from "@/app/acciones";
import { AreaTexto, Aviso, Boton, Campo, Selector } from "@/componentes/ui";

const inicial: EstadoConsulta = { ok: false };

export function FormularioConsulta({ cursos, textoPrivacidad }: { cursos: Array<{ id: string; nombre: string }>; textoPrivacidad: string }) {
  const [estado, accion, enviando] = useActionState(enviarConsulta, inicial);
  const [paraMenor, setParaMenor] = useState(false);
  const [tipo, setTipo] = useState<"consulta" | "preinscripcion">("consulta");
  const [curso, setCurso] = useState("");
  const [mensaje, setMensaje] = useState("");

  // El buscador de cursos y el test de nivel completan el formulario.
  useEffect(() => {
    const alPrellenar = (e: Event) => {
      const d = (e as CustomEvent<Prellenado>).detail;
      if (d.tipo) setTipo(d.tipo);
      if (d.cursoId && cursos.some((c) => c.id === d.cursoId)) setCurso(d.cursoId);
      if (d.mensaje) setMensaje(d.mensaje);
    };
    window.addEventListener(EVENTO_PRELLENAR, alPrellenar);
    return () => window.removeEventListener(EVENTO_PRELLENAR, alPrellenar);
  }, [cursos]);
  const e = estado.errores ?? {};

  if (estado.ok) return <Aviso tono="exito">{estado.mensaje}</Aviso>;

  return (
    <form action={accion} className="grid gap-4 sm:grid-cols-2" noValidate>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium">¿Qué querés hacer?</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="tipo" value="consulta" checked={tipo === "consulta"} onChange={() => setTipo("consulta")} /> Hacer una consulta</label>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="tipo" value="preinscripcion" checked={tipo === "preinscripcion"} onChange={() => setTipo("preinscripcion")} /> Preinscribirme</label>
        </div>
      </fieldset>
      <Campo id="nombre_contacto" name="nombre_contacto" etiqueta="Tu nombre y apellido" required autoComplete="name" error={e.nombre_contacto}
        ayuda="Si es para un menor, completá con los datos de la persona adulta responsable." className="sm:col-span-2" />
      <Campo id="telefono" name="telefono" etiqueta="Teléfono o WhatsApp" type="tel" inputMode="tel" autoComplete="tel" error={e.telefono} />
      <Campo id="email" name="email" etiqueta="Correo electrónico" type="email" autoComplete="email" error={e.email} />
      <Selector id="curso_interes_id" name="curso_interes_id" etiqueta="Curso de interés" value={curso} onChange={(e) => setCurso(e.target.value)}>
        <option value="">Todavía no sé</option>
        {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm">
        <input type="checkbox" name="es_para_menor" checked={paraMenor} onChange={(ev) => setParaMenor(ev.target.checked)} />
        Es para un niño, niña o adolescente
      </label>
      {paraMenor ? (
        <>
          <Campo id="nombre_estudiante" name="nombre_estudiante" etiqueta="Nombre de quien estudiaría" ayuda="Solo el nombre de pila alcanza." />
          <Campo id="edad_estudiante" name="edad_estudiante" etiqueta="Edad" type="number" min={3} max={99} inputMode="numeric" error={e.edad_estudiante} />
        </>
      ) : null}
      <AreaTexto id="mensaje" name="mensaje" etiqueta="Mensaje (opcional)" maxLength={2000} className="sm:col-span-2" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      {/* Campo trampa contra bots: oculto para personas y lectores de pantalla. */}
      <div aria-hidden className="hidden"><label>No completar<input name="sitio_web" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="sm:col-span-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acepta" className="mt-1" aria-describedby="acepta-texto" />
          <span id="acepta-texto">{textoPrivacidad}</span>
        </label>
        {e.acepta ? <p className="mt-1 text-xs font-medium text-peligro">{e.acepta}</p> : null}
      </div>
      {estado.mensaje ? <div className="sm:col-span-2"><Aviso tono="peligro">{estado.mensaje}</Aviso></div> : null}
      <div className="sm:col-span-2"><Boton type="submit" disabled={enviando} variante="peligro" className="rounded-full px-6 text-base">{enviando ? "Enviando…" : tipo === "preinscripcion" ? "Enviar preinscripción" : "Enviar consulta"}</Boton></div>
    </form>
  );
}
