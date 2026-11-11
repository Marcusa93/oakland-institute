"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AreaTexto, Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import { crearActividad } from "./acciones";
import {
  EVALUACIONES, HABILIDADES, ICONO_HABILIDAD, PLANTILLAS,
  type ActividadEditor, type Evaluacion, type Habilidad, type PreguntaEditor,
} from "./comun";

interface Pregunta extends PreguntaEditor { clave: number }
interface Opcion { id: string; texto: string }

let siguiente = 1;
const conClave = (p: PreguntaEditor): Pregunta => ({ ...p, opciones: [...p.opciones], clave: siguiente++ });
const vacia = (tipo: "opcion" | "texto"): Pregunta =>
  conClave(tipo === "opcion" ? { tipo, enunciado: "", opciones: ["", ""], correcta: 0 } : { tipo, enunciado: "", opciones: [], correcta: null });

/** "AAAA-MM-DDTHH:MM" en hora de Tucumán, dentro de `dias` días a las 23:59. */
function cierreEn(dias: number) {
  const d = new Date(Date.now() + dias * 86_400_000);
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Tucuman", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return `${f}T23:59`;
}

export function EditorActividad({ comisiones, comisionInicial }: {
  comisiones: { id: string; texto: string }[];
  comisionInicial?: string;
}) {
  const router = useRouter();
  const base = useId();
  const [comision, setComision] = useState(comisionInicial ?? comisiones[0]?.id ?? "");
  const [datos, setDatos] = useState<ActividadEditor>({
    titulo: "", consigna: "", habilidad: "vocabulario", evaluacion: "formativa", puntaje_max: "10", preguntas: [],
  });
  const [preguntas, setPreguntas] = useState<Pregunta[]>([vacia("opcion")]);
  const [cierra, setCierra] = useState("");
  const [plantilla, setPlantilla] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  const set = <K extends keyof ActividadEditor>(k: K, v: ActividadEditor[K]) => setDatos((d) => ({ ...d, [k]: v }));
  const cambiar = (clave: number, f: (p: Pregunta) => Pregunta) => setPreguntas((ps) => ps.map((p) => (p.clave === clave ? f(p) : p)));
  const mover = (i: number, delta: number) => setPreguntas((ps) => {
    const j = i + delta;
    if (j < 0 || j >= ps.length) return ps;
    const copia = [...ps];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });

  function usarPlantilla(clave: string) {
    const p = PLANTILLAS.find((x) => x.clave === clave);
    if (!p) return;
    const tocado = datos.titulo || datos.consigna || preguntas.some((q) => q.enunciado);
    if (tocado && !window.confirm("La plantilla reemplaza lo que escribiste. ¿Seguimos?")) return;
    setDatos({ titulo: p.titulo, consigna: p.consigna, habilidad: p.habilidad, evaluacion: p.evaluacion, puntaje_max: p.puntaje_max, preguntas: [] });
    setPreguntas(p.preguntas.map(conClave));
    setCierra(cierreEn(p.dias));
    setPlantilla(p.nombre);
    setResultado(null);
  }

  const deOpcion = preguntas.filter((p) => p.tipo === "opcion").length;
  const abiertas = preguntas.length - deOpcion;

  function guardar(publicar: boolean) {
    setResultado(null);
    iniciar(async () => {
      const r = await crearActividad({
        comision, titulo: datos.titulo, consigna: datos.consigna, habilidad: datos.habilidad, evaluacion: datos.evaluacion,
        puntaje_max: datos.puntaje_max.replace(",", "."), cierra_en: cierra, publicar,
        preguntas: preguntas.map((p) => p.tipo === "opcion"
          ? { tipo: "opcion", enunciado: p.enunciado, opciones: p.opciones, correcta: p.correcta ?? -1 }
          : { tipo: "texto", enunciado: p.enunciado }),
      });
      setResultado(r);
      if (r.ok && r.id) router.push(`/panel/actividades/${r.id}?creada=${publicar ? "publicada" : "borrador"}`);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(true); }} className="space-y-6" noValidate>
      <section aria-labelledby={`${base}-plantillas`} className="rounded-base bg-marca p-4 text-sobre-marca sm:p-5">
        <h2 id={`${base}-plantillas`} className="font-bold">Arrancá con una plantilla</h2>
        <p className="text-sm opacity-90">Un clic y el editor queda listo con contenido de ejemplo en inglés. Después lo ajustás a tu grupo.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PLANTILLAS.map((p) => (
            <li key={p.clave}>
              <button type="button" onClick={() => usarPlantilla(p.clave)} aria-pressed={plantilla === p.nombre}
                className="globo globo-izq flex h-full min-h-11 w-full flex-col items-start gap-0.5 bg-superficie px-4 py-3 text-left text-texto transition-transform hover:-translate-y-0.5 aria-pressed:ring-4 aria-pressed:ring-cielo motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <span className="font-semibold"><span aria-hidden>{p.icono} </span>{p.nombre}</span>
                <span className="text-xs text-suave">{p.descripcion}</span>
              </button>
            </li>
          ))}
        </ul>
        {plantilla ? <p className="mt-5 text-sm" role="status">Cargamos «{plantilla}». Revisá y ajustá lo que necesites.</p> : null}
      </section>

      <fieldset className="grid gap-4 rounded-base border border-borde bg-superficie p-4 sm:grid-cols-2 sm:p-5">
        <legend className="px-1 text-base font-bold">Datos de la actividad</legend>
        <Selector id={`${base}-comision`} etiqueta="Comisión" value={comision} onChange={(e) => setComision(e.target.value)} required>
          {comisiones.map((k) => <option key={k.id} value={k.id}>{k.texto}</option>)}
        </Selector>
        <Campo id={`${base}-titulo`} etiqueta="Título" required maxLength={160} value={datos.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Vocabulary quiz: unit 3" />
        <AreaTexto id={`${base}-consigna`} etiqueta="Consigna" required rows={4} maxLength={4000} className="sm:col-span-2"
          value={datos.consigna} onChange={(e) => set("consigna", e.target.value)} placeholder="Qué tienen que hacer, en inglés o en castellano." />
        <Selector id={`${base}-habilidad`} etiqueta="Habilidad" value={datos.habilidad} onChange={(e) => set("habilidad", e.target.value as Habilidad)}>
          {HABILIDADES.map(([v, e]) => <option key={v} value={v}>{ICONO_HABILIDAD[v]} {e}</option>)}
        </Selector>
        <div className="grid grid-cols-2 gap-4">
          <Campo id={`${base}-puntaje`} etiqueta="Puntaje máximo" inputMode="decimal" value={datos.puntaje_max} onChange={(e) => set("puntaje_max", e.target.value)} />
          <Campo id={`${base}-cierre`} etiqueta="Cierra" type="datetime-local" value={cierra} onChange={(e) => setCierra(e.target.value)} ayuda="Hora de Tucumán. Vacío: sin cierre." />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Tipo de evaluación</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {EVALUACIONES.map(([v, e, ayuda]) => (
              <label key={v} className="flex cursor-pointer gap-2 rounded-base border border-borde p-3 text-sm has-[:checked]:border-marca has-[:checked]:bg-marca-suave has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca">
                <input type="radio" name={`${base}-evaluacion`} value={v} checked={datos.evaluacion === v} onChange={() => set("evaluacion", v as Evaluacion)} className="mt-1" />
                <span><strong>{e}</strong><span className="block text-xs text-suave">{ayuda}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <section aria-labelledby={`${base}-preguntas`} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id={`${base}-preguntas`} className="text-lg font-bold">Preguntas</h2>
            <p className="text-sm text-suave" aria-live="polite">
              {preguntas.length} {preguntas.length === 1 ? "pregunta" : "preguntas"}
              {deOpcion ? ` · ${deOpcion} con corrección automática` : ""}{abiertas ? ` · ${abiertas} de respuesta abierta` : ""}
            </p>
          </div>
        </div>
        {preguntas.length === 0 ? (
          <p className="rounded-base border border-dashed border-borde bg-superficie p-4 text-sm text-suave">
            Sin preguntas: el estudiante responde la consigna en un texto libre (ideal para escritura).
          </p>
        ) : null}
        <ol className="space-y-3">
          {preguntas.map((p, i) => (
            <li key={p.clave}>
              <EditorPregunta pregunta={p} numero={i + 1} total={preguntas.length}
                onCambio={(f) => cambiar(p.clave, f)} onMover={(d) => mover(i, d)}
                onQuitar={() => setPreguntas((ps) => ps.filter((x) => x.clave !== p.clave))} />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Boton type="button" variante="secundario" onClick={() => setPreguntas((ps) => [...ps, vacia("opcion")])} disabled={preguntas.length >= 30}>
            + Opción múltiple
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setPreguntas((ps) => [...ps, vacia("texto")])} disabled={preguntas.length >= 30}>
            + Respuesta abierta
          </Boton>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-borde bg-superficie/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-base sm:border">
        <Boton type="submit" disabled={enviando || !comision}>{enviando ? "Guardando…" : "Publicar"}</Boton>
        <Boton type="button" variante="secundario" disabled={enviando || !comision} onClick={() => guardar(false)}>Guardar borrador</Boton>
        <p className="text-xs text-suave">La clave de corrección se guarda aparte: tus estudiantes nunca la reciben.</p>
        {resultado && !resultado.ok ? <div className="w-full"><Aviso tono="peligro">{resultado.mensaje}</Aviso></div> : null}
        {resultado?.ok ? <div className="w-full"><Aviso tono="exito">{resultado.mensaje}</Aviso></div> : null}
      </div>
    </form>
  );
}

function EditorPregunta({ pregunta: p, numero, total, onCambio, onMover, onQuitar }: {
  pregunta: Pregunta; numero: number; total: number;
  onCambio: (f: (p: Pregunta) => Pregunta) => void; onMover: (delta: number) => void; onQuitar: () => void;
}) {
  const id = `pregunta-${p.clave}`;
  const opciones: Opcion[] = p.opciones.map((texto, i) => ({ id: `${id}-op-${i}`, texto }));
  return (
    <fieldset className="rounded-base border border-borde bg-superficie p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-bold">
        <span className="grid size-7 place-items-center rounded-full bg-marca text-xs text-sobre-marca" aria-hidden>{numero}</span>
        <span className="sr-only">Pregunta {numero}:</span>
        {p.tipo === "opcion" ? "Opción múltiple" : "Respuesta abierta"}
      </legend>
      <div className="flex flex-wrap items-center justify-end gap-1 text-sm">
        <button type="button" className="min-h-11 rounded-base px-3 hover:bg-marca-suave disabled:opacity-40" onClick={() => onMover(-1)} disabled={numero === 1} aria-label={`Subir la pregunta ${numero}`}>↑</button>
        <button type="button" className="min-h-11 rounded-base px-3 hover:bg-marca-suave disabled:opacity-40" onClick={() => onMover(1)} disabled={numero === total} aria-label={`Bajar la pregunta ${numero}`}>↓</button>
        <button type="button" className="min-h-11 rounded-base px-3 hover:bg-marca-suave"
          onClick={() => onCambio((q) => q.tipo === "opcion" ? { ...q, tipo: "texto", opciones: [], correcta: null } : { ...q, tipo: "opcion", opciones: ["", ""], correcta: 0 })}>
          Cambiar a {p.tipo === "opcion" ? "abierta" : "opción múltiple"}
        </button>
        <button type="button" className="min-h-11 rounded-base px-3 font-semibold text-peligro hover:bg-peligro-suave" onClick={onQuitar}>
          Quitar<span className="sr-only"> la pregunta {numero}</span>
        </button>
      </div>
      <AreaTexto id={`${id}-enunciado`} etiqueta="Enunciado" rows={2} maxLength={500} lang="en" value={p.enunciado}
        onChange={(e) => onCambio((q) => ({ ...q, enunciado: e.target.value }))} placeholder={p.tipo === "opcion" ? "She ___ in Monteros." : "Write about your weekend."} />
      {p.tipo === "opcion" ? (
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">Opciones <span className="font-normal text-suave">(marcá la correcta)</span></legend>
          <ul className="mt-1 space-y-2">
            {opciones.map((o, i) => (
              <li key={o.id} className={`flex items-center gap-2 rounded-base border p-1.5 pl-3 ${p.correcta === i ? "border-exito bg-exito-suave" : "border-borde"}`}>
                <input type="radio" id={`${o.id}-ok`} name={`${id}-correcta`} checked={p.correcta === i} onChange={() => onCambio((q) => ({ ...q, correcta: i }))} className="size-5 accent-[var(--exito)]" />
                <label htmlFor={`${o.id}-ok`} className="sr-only">Opción {i + 1} es la correcta</label>
                <label htmlFor={o.id} className="sr-only">Texto de la opción {i + 1}</label>
                <input id={o.id} value={o.texto} maxLength={200} lang="en" placeholder={`Opción ${i + 1}`}
                  onChange={(e) => onCambio((q) => ({ ...q, opciones: q.opciones.map((x, j) => (j === i ? e.target.value : x)) }))}
                  className="min-h-11 min-w-0 flex-1 rounded-base border border-borde bg-superficie px-3" />
                {p.correcta === i ? <span className="hidden text-xs font-semibold text-exito sm:inline">Correcta</span> : null}
                <button type="button" disabled={opciones.length <= 2} className="min-h-11 min-w-11 rounded-base text-suave hover:bg-peligro-suave hover:text-peligro disabled:opacity-30"
                  onClick={() => onCambio((q) => ({ ...q, opciones: q.opciones.filter((_, j) => j !== i), correcta: q.correcta === i ? 0 : q.correcta !== null && q.correcta > i ? q.correcta - 1 : q.correcta }))}
                  aria-label={`Quitar la opción ${i + 1}`}>✕</button>
              </li>
            ))}
          </ul>
          {opciones.length < 6 ? (
            <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-marca hover:underline" onClick={() => onCambio((q) => ({ ...q, opciones: [...q.opciones, ""] }))}>
              + Agregar opción
            </button>
          ) : null}
        </fieldset>
      ) : <p className="mt-2 text-xs text-suave">La corregís vos: el estudiante escribe su respuesta.</p>}
    </fieldset>
  );
}
