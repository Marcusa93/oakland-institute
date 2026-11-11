"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { Resultado } from "@/app/panel/acciones";
import { AreaTexto, Aviso, Boton, Campo } from "@/componentes/ui";
import { buscarPersonas, iniciarConversacion, responderConversacion } from "./acciones";
import type { Destinatario, EstudianteMensajes } from "./comun";

const SIN_CONEXION = "No pudimos conectar con el servidor. Lo que escribiste sigue en pantalla: revisá tu conexión y volvé a intentar.";

/* ------------------------------------------------------------ respuesta */

export function Respuesta({ hilo }: { hilo: string }) {
  const router = useRouter();
  const [cuerpo, setCuerpo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!cuerpo.trim()) return;
    setResultado(null);
    iniciar(async () => {
      try {
        const r = await responderConversacion({ hilo, cuerpo });
        if (r.ok) { setCuerpo(""); router.refresh(); } else setResultado(r);
      } catch {
        setResultado({ ok: false, mensaje: SIN_CONEXION });
      }
    });
  }

  return (
    <form onSubmit={enviar} className="sticky bottom-0 space-y-2 border-t border-borde bg-fondo pb-2 pt-3">
      <label htmlFor="respuesta" className="sr-only">Tu respuesta</label>
      <div className="flex items-end gap-2">
        <textarea id="respuesta" rows={2} maxLength={4000} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} placeholder="Escribí tu respuesta…"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar(e); }}
          className="block min-h-11 w-full min-w-0 flex-1 resize-y rounded-base border border-borde bg-superficie px-3 py-2 text-base" />
        <Boton type="submit" disabled={enviando || !cuerpo.trim()}>{enviando ? "Enviando…" : "Enviar"}</Boton>
      </div>
      {resultado && !resultado.ok ? <Aviso tono="peligro">{resultado.mensaje}</Aviso> : null}
    </form>
  );
}

/* ---------------------------------------------------- nueva conversación */

function Opcion({ d, marcado, onChange }: { d: Destinatario; marcado: boolean; onChange(v: boolean): void }) {
  const id = useId();
  return (
    <li>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-base border border-borde bg-superficie p-3 has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
        <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
        <span className="min-w-0">
          <span className="block font-semibold">{d.nombre}</span>
          {d.detalle ? <span className="block text-sm text-suave">{d.detalle}</span> : null}
        </span>
      </label>
    </li>
  );
}

export function NuevaConversacion({ modo, estudiantes, preEstudiante, preDestinatarios, generales = [], permiteSinEstudiante = false }: {
  modo: "gestion" | "guiado"; estudiantes: EstudianteMensajes[]; preEstudiante: string; preDestinatarios: Destinatario[];
  generales?: Destinatario[]; permiteSinEstudiante?: boolean;
}) {
  const router = useRouter();
  const [estudiante, setEstudiante] = useState(preEstudiante);
  const [elegidos, setElegidos] = useState<Destinatario[]>(preDestinatarios);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();
  // Buscador (solo gestión)
  const [q, setQ] = useState("");
  const [hallados, setHallados] = useState<Destinatario[] | null>(null);
  const [buscando, iniciarBusqueda] = useTransition();

  const actual = estudiantes.find((e) => e.id === estudiante);
  // Guiado: los del estudiante + administración y dirección. Sin estudiante (solo personal): el equipo.
  const sugeridos = modo === "guiado"
    ? [...(actual?.destinatarios ?? []), ...(actual || permiteSinEstudiante ? generales : [])].filter((d, i, l) => l.findIndex((x) => x.id === d.id) === i)
    : actual?.destinatarios ?? [];
  const sinEstudiante = modo === "gestion" || permiteSinEstudiante;
  const marcado = (d: Destinatario) => elegidos.some((x) => x.id === d.id);
  const alternar = (d: Destinatario, v: boolean) => setElegidos((l) => (v ? (l.some((x) => x.id === d.id) ? l : [...l, d]) : l.filter((x) => x.id !== d.id)));

  function elegirEstudiante(id: string) {
    setEstudiante(id);
    // En modo guiado los destinatarios dependen del estudiante: se reinician.
    if (modo === "guiado") setElegidos([]);
  }

  function buscar(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault();
    iniciarBusqueda(async () => {
      try { setHallados(await buscarPersonas(q)); } catch { setHallados([]); }
    });
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setResultado(null);
    if (!sinEstudiante && !estudiante) { setResultado({ ok: false, mensaje: "Elegí sobre qué estudiante es la conversación." }); return; }
    if (elegidos.length === 0) { setResultado({ ok: false, mensaje: "Elegí al menos un destinatario." }); return; }
    iniciar(async () => {
      try {
        const r = await iniciarConversacion({ estudiante, destinatarios: elegidos.map((d) => d.id), asunto, cuerpo });
        if (r.ok && r.id) router.push(`/panel/mensajes/${r.id}`);
        else setResultado(r);
      } catch {
        setResultado({ ok: false, mensaje: SIN_CONEXION });
      }
    });
  }

  if (modo === "guiado" && estudiantes.length === 0 && !(permiteSinEstudiante && generales.length > 0)) {
    return <Aviso tono="alerta">No encontramos estudiantes con los que tengas un canal habilitado. Si sos responsable de un estudiante, administración tiene que verificar tu vínculo con permiso académico.</Aviso>;
  }

  return (
    <form onSubmit={enviar} className="space-y-6">
      {/* 1. Estudiante */}
      {estudiantes.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="font-bold">{modo === "guiado" ? (sinEstudiante ? "1. ¿Es sobre un estudiante?" : "1. ¿Sobre qué estudiante es?") : "Sobre un estudiante (opcional)"}</legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {sinEstudiante ? (
              <li>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-base border border-borde bg-superficie p-3 has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                  <input type="radio" name="estudiante" className="size-5" checked={estudiante === ""} onChange={() => elegirEstudiante("")} />
                  <span className="font-semibold">{modo === "gestion" ? "Ninguno (conversación general)" : "No, es con el equipo del instituto"}</span>
                </label>
              </li>
            ) : null}
            {estudiantes.map((e) => (
              <li key={e.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-base border border-borde bg-superficie p-3 has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                  <input type="radio" name="estudiante" className="mt-0.5 size-5 shrink-0" checked={estudiante === e.id} onChange={() => elegirEstudiante(e.id)} />
                  <span className="min-w-0"><span className="block font-semibold">{e.nombre}</span><span className="block text-sm text-suave">{e.relacion}</span></span>
                </label>
              </li>
            ))}
          </ul>
          {modo === "gestion" && estudiante ? <p className="text-sm text-suave">Las conversaciones sobre un estudiante quedan visibles para dirección.</p> : null}
        </fieldset>
      ) : null}

      {/* 2. Destinatarios */}
      <fieldset className="space-y-3">
        <legend className="font-bold">{modo === "guiado" ? "2. ¿A quién le escribís?" : "Destinatarios"}</legend>
        {modo === "guiado" && !estudiante && !sinEstudiante ? <p className="text-sm text-suave">Primero elegí el estudiante.</p> : null}
        {modo === "guiado" && (estudiante || sinEstudiante) && sugeridos.length === 0 ? (
          <Aviso tono="alerta">Todavía no hay a quién escribirle por acá para esta opción.</Aviso>
        ) : null}
        {sugeridos.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">{sugeridos.map((d) => <Opcion key={d.id} d={d} marcado={marcado(d)} onChange={(v) => alternar(d, v)} />)}</ul>
        ) : null}

        {modo === "gestion" ? (
          <div className="space-y-2 rounded-base border border-borde bg-fondo p-3">
            <div className="flex items-end gap-2">
              <Campo id="buscar-persona" etiqueta="Buscar persona por nombre o apellido" className="min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") buscar(e); }} placeholder="Ej.: Pérez" />
              <Boton type="button" variante="secundario" onClick={buscar} disabled={buscando || q.trim().length < 2}>{buscando ? "Buscando…" : "Buscar"}</Boton>
            </div>
            {hallados && hallados.length === 0 ? <p className="text-sm text-suave">No encontramos a nadie con ese nombre.</p> : null}
            {hallados && hallados.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Resultados de la búsqueda">
                {hallados.map((d) => <Opcion key={d.id} d={d} marcado={marcado(d)} onChange={(v) => alternar(d, v)} />)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {elegidos.length > 0 ? (
          <div>
            <p className="text-sm font-semibold">Va a: </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {elegidos.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => alternar(d, false)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-marca-suave px-3 text-sm font-semibold text-marca-fuerte hover:bg-borde"
                    aria-label={`Quitar a ${d.nombre}`}>
                    {d.nombre} <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </fieldset>

      {/* 3. Mensaje */}
      <fieldset className="space-y-3">
        <legend className="font-bold">{modo === "guiado" ? "3. Tu mensaje" : "Mensaje"}</legend>
        <Campo id="asunto" etiqueta="Asunto" required minLength={2} maxLength={140} value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Ej.: Consulta sobre la tarea" />
        <AreaTexto id="cuerpo" etiqueta="Mensaje" required rows={5} maxLength={4000} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
      </fieldset>

      {resultado && !resultado.ok ? <Aviso tono="peligro">{resultado.mensaje}</Aviso> : null}
      <Boton type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar mensaje"}</Boton>
    </form>
  );
}
