"use client";

import { useActionState, useState } from "react";
import { AreaTexto, Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import { HABILIDADES, TIPOS, tieneHueco, type TipoEjercicio } from "@/app/panel/practica/comun";
import { Probador } from "@/app/panel/practica/ejercicio";
import { cambiarEstado, guardarEjercicio } from "./acciones";

export interface DatosEjercicio {
  id?: string;
  habilidad: string;
  tipo: TipoEjercicio;
  nivel_id: string | null;
  dificultad: number;
  enunciado: string;
  opciones: string[];
  respuesta: string;
  explicacion: string | null;
  audio_texto: string | null;
  estado?: string;
}

const AYUDA_TIPO: Record<TipoEjercicio, string> = {
  opcion: "El estudiante elige entre 2 y 6 opciones. Para un hueco en la frase, usá ___ (guiones bajos). En lectura, poné el texto, una línea en blanco y la pregunta.",
  completar: "El estudiante escribe lo que falta en el hueco (___). Se ignoran mayúsculas y puntuación. Las opciones son pistas optativas.",
  ordenar: "El estudiante toca las fichas en orden. Las fichas son las palabras de la respuesta (se mezclan solas).",
  escuchar: "El navegador lee el texto en voz alta (inglés de EE. UU., normal o lento) y después el estudiante elige.",
};

export function FormularioEjercicio({ inicial, niveles }: { inicial?: DatosEjercicio; niveles: { id: string; nombre: string }[] }) {
  const [estado, accion, guardando] = useActionState(guardarEjercicio, null);
  const [d, setD] = useState<DatosEjercicio>(inicial ?? {
    habilidad: "vocabulario", tipo: "opcion", nivel_id: null, dificultad: 1, enunciado: "", opciones: [], respuesta: "", explicacion: "", audio_texto: "",
  });
  const [opcionesTexto, setOpcionesTexto] = useState((inicial?.opciones ?? []).join("\n"));
  const set = <K extends keyof DatosEjercicio>(k: K, v: DatosEjercicio[K]) => setD((x) => ({ ...x, [k]: v }));
  const id = inicial?.id ?? "nuevo";
  const opciones = opcionesTexto.split("\n").map((x) => x.trim()).filter(Boolean);
  const usaOpciones = d.tipo !== "completar";
  const etiquetaOpciones = d.tipo === "ordenar" ? "Fichas (una palabra por línea)" : d.tipo === "completar" ? "Pistas optativas (una por línea)" : "Opciones (una por línea)";

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form action={accion} className="grid gap-4">
        <input type="hidden" name="id" value={inicial?.id ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector id={`hab-${id}`} name="habilidad" etiqueta="Habilidad" value={d.habilidad} onChange={(e) => set("habilidad", e.target.value)}>
            {HABILIDADES.map((h) => <option key={h.clave} value={h.clave}>{h.nombre}</option>)}
          </Selector>
          <Selector id={`tipo-${id}`} name="tipo" etiqueta="Tipo" value={d.tipo} onChange={(e) => set("tipo", e.target.value as TipoEjercicio)}>
            {TIPOS.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
          </Selector>
          <Selector id={`niv-${id}`} name="nivel_id" etiqueta="Nivel" value={d.nivel_id ?? ""} onChange={(e) => set("nivel_id", e.target.value || null)}>
            <option value="">Todos los niveles</option>
            {niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
          </Selector>
          <Selector id={`dif-${id}`} name="dificultad" etiqueta="Dificultad" value={String(d.dificultad)} onChange={(e) => set("dificultad", Number(e.target.value))}>
            <option value="1">1 · Fácil (10 XP)</option>
            <option value="2">2 · Media (15 XP)</option>
            <option value="3">3 · Desafiante (20 XP)</option>
          </Selector>
        </div>
        <p className="rounded-base bg-cielo-suave px-3 py-2 text-xs text-marca-fuerte">{AYUDA_TIPO[d.tipo]}</p>
        <AreaTexto id={`enu-${id}`} name="enunciado" etiqueta="Enunciado (en inglés)" rows={d.habilidad === "lectura" ? 6 : 3} value={d.enunciado}
          onChange={(e) => set("enunciado", e.target.value)} placeholder={d.tipo === "completar" || d.tipo === "opcion" ? "She ___ in Monteros." : "Ordená la frase: pedir la cuenta en un bar"} />
        {d.tipo === "completar" && d.enunciado && !tieneHueco(d.enunciado) ? (
          <p className="-mt-2 text-xs text-alerta">Sugerencia: marcá el hueco con ___ para que la respuesta se escriba dentro de la frase.</p>
        ) : null}
        {d.tipo === "escuchar" ? (
          <AreaTexto id={`aud-${id}`} name="audio_texto" etiqueta="Texto que se escucha" value={d.audio_texto ?? ""} onChange={(e) => set("audio_texto", e.target.value)} required />
        ) : <input type="hidden" name="audio_texto" value="" />}
        <Campo id={`res-${id}`} name="respuesta" etiqueta={d.tipo === "ordenar" ? "Frase correcta" : "Respuesta correcta"} value={d.respuesta}
          onChange={(e) => set("respuesta", e.target.value)} required ayuda={usaOpciones && d.tipo !== "ordenar" ? "Tiene que coincidir con una de las opciones." : undefined} />
        <div>
          <AreaTexto id={`opc-${id}`} name="opciones" etiqueta={etiquetaOpciones} rows={4} value={opcionesTexto} onChange={(e) => setOpcionesTexto(e.target.value)} />
          {d.tipo === "ordenar" ? (
            <button type="button" onClick={() => setOpcionesTexto(d.respuesta.trim().split(/\s+/).filter(Boolean).join("\n"))}
              className="mt-1 min-h-11 text-sm font-semibold text-marca underline-offset-4 hover:underline">
              Generar fichas desde la frase correcta
            </button>
          ) : null}
        </div>
        <AreaTexto id={`exp-${id}`} name="explicacion" etiqueta="Explicación breve (en castellano)" value={d.explicacion ?? ""} onChange={(e) => set("explicacion", e.target.value)}
          placeholder="Se muestra después de responder, acierte o no." />
        <div className="flex flex-wrap gap-3">
          <Boton type="submit" name="revisar" value="si" disabled={guardando}>{guardando ? "Guardando…" : "Guardar y marcar revisado"}</Boton>
          <Boton type="submit" name="revisar" value="no" variante="secundario" disabled={guardando}>Guardar como borrador</Boton>
        </div>
        {inicial?.estado === "revisado" ? <p className="text-xs text-suave">Si lo guardás como borrador deja de aparecer en las lecciones hasta que alguien lo revise.</p> : null}
        {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
      </form>
      <div className="self-start rounded-[2rem] bg-pizarra p-3 xl:sticky xl:top-4">
        <Probador ejercicio={{
          id: inicial?.id ?? "vista-previa", tipo: d.tipo, enunciado: d.enunciado, opciones,
          audio_texto: d.audio_texto, dificultad: d.dificultad, respuesta: d.respuesta, explicacion: d.explicacion,
        }} />
      </div>
    </div>
  );
}

const ACCIONES: Record<string, { estado: string; texto: string; variante: "primario" | "secundario" | "texto" }[]> = {
  borrador: [{ estado: "revisado", texto: "Marcar revisado", variante: "primario" }, { estado: "retirado", texto: "Retirar", variante: "texto" }],
  revisado: [{ estado: "retirado", texto: "Retirar", variante: "secundario" }, { estado: "borrador", texto: "Volver a borrador", variante: "texto" }],
  retirado: [{ estado: "borrador", texto: "Recuperar como borrador", variante: "secundario" }],
};

export function AccionesEstado({ id, estado: actual }: { id: string; estado: string }) {
  const [estado, accion, enviando] = useActionState(cambiarEstado, null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(ACCIONES[actual] ?? []).map((a) => (
        <form key={a.estado} action={accion}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="estado" value={a.estado} />
          <Boton type="submit" variante={a.variante} disabled={enviando}>{a.texto}</Boton>
        </form>
      ))}
      {estado && !estado.ok ? <Aviso tono="peligro">{estado.mensaje}</Aviso> : null}
      {estado?.ok ? <span role="status" className="text-sm text-exito">{estado.mensaje}</span> : null}
    </div>
  );
}
