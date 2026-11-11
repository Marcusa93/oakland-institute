"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AreaTexto, Aviso, Boton, Campo } from "@/componentes/ui";
import type { Resultado } from "@/app/panel/acciones";
import type { Bilingue, ClaveSitio, ContenidoSitio } from "@/lib/sitio";
import { publicarSeccion } from "./acciones";

const SECCIONES: Array<{ clave: ClaveSitio; nombre: string; ayuda: string }> = [
  { clave: "portada", nombre: "Portada", ayuda: "El título grande y la frase de la primera pantalla." },
  { clave: "pasos", nombre: "Pasos", ayuda: "Cómo es empezar: el recorrido numerado, en orden." },
  { clave: "preguntas", nombre: "Preguntas", ayuda: "Preguntas frecuentes junto al formulario de consulta." },
  { clave: "contacto", nombre: "Contacto", ayuda: "Datos del pie de página." },
  { clave: "anuncio", nombre: "Anuncio", ayuda: "Barra superior para novedades (inscripciones, feriados, eventos)." },
  { clave: "certificaciones", nombre: "Certificaciones", ayuda: "Solo las que el instituto efectivamente ofrece. Si no hay ninguna, la sección no aparece." },
];

type Idioma = "es" | "en";
const vacio = (): Bilingue => ({ es: "", en: "" });
const enIngles = (t: Bilingue) => t.en || t.es;

/* ---------------------------------------------------------------- campos */

function CampoBilingue({ id, etiqueta, valor, onChange, multilinea = false, max, requerido = false, ayuda }: {
  id: string; etiqueta: string; valor: Bilingue; onChange(v: Bilingue): void; multilinea?: boolean; max: number; requerido?: boolean; ayuda?: string;
}) {
  return (
    <fieldset className="rounded-base border border-borde p-3">
      <legend className="px-1 text-sm font-semibold">{etiqueta}{requerido ? <span className="text-peligro" aria-hidden> *</span> : null}</legend>
      {ayuda ? <p className="mb-2 text-xs text-suave">{ayuda}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(["es", "en"] as const).map((i) => {
          const props = {
            id: `${id}-${i}`,
            etiqueta: i === "es" ? "Castellano" : "Inglés (si queda vacío, se muestra el castellano)",
            value: valor[i],
            maxLength: max,
            lang: i,
            required: i === "es" && requerido,
          };
          return multilinea ? (
            <AreaTexto key={i} {...props} onChange={(e) => onChange({ ...valor, [i]: e.target.value })} />
          ) : (
            <Campo key={i} {...props} onChange={(e) => onChange({ ...valor, [i]: e.target.value })} />
          );
        })}
      </div>
    </fieldset>
  );
}

/** Lista con alta, baja y orden. */
function Lista<T>({ items, onChange, nuevo, nombre, max, min = 0, render }: {
  items: T[]; onChange(v: T[]): void; nuevo(): T; nombre: string; max: number; min?: number;
  render(item: T, cambiar: (v: T) => void, i: number): ReactNode;
}) {
  const mover = (i: number, d: number) => {
    const copia = [...items];
    [copia[i], copia[i + d]] = [copia[i + d], copia[i]];
    onChange(copia);
  };
  return (
    <div className="space-y-4">
      {items.length === 0 ? <p className="rounded-base border border-dashed border-borde px-3 py-4 text-sm text-suave">Todavía no hay ninguna cargada.</p> : null}
      <ol className="space-y-4">
        {items.map((item, i) => (
          <li key={i} className="rounded-base border border-borde bg-fondo p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">{nombre} {i + 1}</p>
              <div className="flex flex-wrap gap-1">
                <Boton type="button" variante="secundario" className="min-h-9 px-3" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${nombre.toLowerCase()} ${i + 1}`}>↑ Subir</Boton>
                <Boton type="button" variante="secundario" className="min-h-9 px-3" disabled={i === items.length - 1} onClick={() => mover(i, 1)} aria-label={`Bajar ${nombre.toLowerCase()} ${i + 1}`}>↓ Bajar</Boton>
                <Boton type="button" variante="secundario" className="min-h-9 px-3 text-peligro" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Quitar ${nombre.toLowerCase()} ${i + 1}`}>Quitar</Boton>
              </div>
            </div>
            <div className="space-y-3">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}</div>
          </li>
        ))}
      </ol>
      {items.length < max ? <Boton type="button" variante="secundario" onClick={() => onChange([...items, nuevo()])}>+ Agregar {nombre.toLowerCase()}</Boton> : <p className="text-sm text-suave">Llegaste al máximo de {max}.</p>}
    </div>
  );
}

/* ---------------------------------------------------------- vista previa */

function VistaPrevia({ clave, c, idioma }: { clave: ClaveSitio; c: ContenidoSitio; idioma: Idioma }) {
  const t = (b: Bilingue) => (idioma === "es" ? b.es : enIngles(b));
  switch (clave) {
    case "portada":
      return (
        <div className="rounded-base bg-marca p-5 text-white">
          <p className="text-2xl font-extrabold leading-tight">{c.portada.titulo.es ? t(c.portada.titulo) : idioma === "es" ? "Hablá inglés sin miedo." : "Speak English fearlessly."}</p>
          {!c.portada.titulo.es ? <p className="mt-1 text-xs text-white/70">(título animado de siempre)</p> : null}
          <p className="mt-3 text-white/85">{t(c.portada.subtitulo)}</p>
        </div>
      );
    case "pasos":
      return (
        <ol className="space-y-3">
          {c.pasos.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full font-extrabold text-white ${i === c.pasos.length - 1 ? "bg-acento" : "bg-marca"}`}>{i + 1}</span>
              <div><p className="font-bold">{t(p.titulo)}</p><p className="text-sm text-suave">{t(p.texto)}</p></div>
            </li>
          ))}
        </ol>
      );
    case "preguntas":
      return c.preguntas.length === 0 ? <p className="text-sm text-suave">Sin preguntas: el bloque no se muestra.</p> : (
        <div className="divide-y divide-borde border-y border-borde">
          {c.preguntas.map((p, i) => (
            <details key={i} className="py-2">
              <summary className="cursor-pointer font-semibold">{t(p.pregunta)}</summary>
              <p className="mt-1 text-sm text-suave">{t(p.respuesta)}</p>
            </details>
          ))}
        </div>
      );
    case "contacto": {
      const k = c.contacto;
      return (
        <div className="rounded-base bg-marca p-4 text-sm text-white/85">
          <p>{[k.direccion, k.telefono, k.email].filter(Boolean).join(" · ") || "Datos de contacto a confirmar."}</p>
          <p className="mt-1 font-semibold text-cielo">{[k.whatsapp ? "WhatsApp" : "", ...k.redes.map((r) => r.nombre)].filter(Boolean).join(" · ")}</p>
        </div>
      );
    }
    case "anuncio":
      return c.anuncio.activo && c.anuncio.texto.es ? (
        <p className="rounded-base bg-acento px-3 py-2 text-center text-sm font-semibold text-white">
          {t(c.anuncio.texto)}{c.anuncio.enlace ? <> <span className="underline">{t(c.anuncio.textoEnlace) || (idioma === "es" ? "Ver más" : "Learn more")}</span></> : null}
        </p>
      ) : <p className="text-sm text-suave">El anuncio está desactivado: no se muestra ninguna barra.</p>;
    case "certificaciones":
      return c.certificaciones.length === 0 ? <p className="text-sm text-suave">Sin certificaciones cargadas: la sección no aparece en el sitio.</p> : (
        <ul className="grid gap-2">
          {c.certificaciones.map((k, i) => (
            <li key={i} className="rounded-base border border-borde p-3"><p className="font-bold">{t(k.nombre)}</p><p className="text-sm text-suave">{t(k.descripcion)}</p></li>
          ))}
        </ul>
      );
  }
}

/* --------------------------------------------------------------- editor */

export function EditorSitio({ inicial, actualizado }: { inicial: ContenidoSitio; actualizado: Partial<Record<ClaveSitio, string>> }) {
  const [contenido, setContenido] = useState(inicial);
  const [publicado, setPublicado] = useState(inicial);
  const [activa, setActiva] = useState<ClaveSitio>("portada");
  const [idioma, setIdioma] = useState<Idioma>("es");
  const [resultado, setResultado] = useState<(Resultado & { clave: ClaveSitio }) | null>(null);
  const [publicando, iniciar] = useTransition();

  const cambiar = <K extends ClaveSitio>(k: K, v: ContenidoSitio[K]) => setContenido((c) => ({ ...c, [k]: v }));
  const sinPublicar = (k: ClaveSitio) => JSON.stringify(contenido[k]) !== JSON.stringify(publicado[k]);
  const seccion = SECCIONES.find((s) => s.clave === activa)!;

  function publicar() {
    const clave = activa;
    const valor = contenido[clave];
    iniciar(async () => {
      try {
        const r = await publicarSeccion(clave, valor);
        setResultado({ ...r, clave });
        if (r.ok) setPublicado((p) => ({ ...p, [clave]: valor }));
      } catch {
        setResultado({ ok: false, mensaje: "No pudimos conectar con el servidor. Tus cambios siguen en pantalla: revisá la conexión y volvé a intentar.", clave });
      }
    });
  }

  const c = contenido;
  let formulario: ReactNode;
  switch (activa) {
    case "portada":
      formulario = (
        <div className="space-y-4">
          <CampoBilingue id="portada-titulo" etiqueta="Título" max={80} valor={c.portada.titulo} onChange={(v) => cambiar("portada", { ...c.portada, titulo: v })}
            ayuda="Dejalo vacío para mantener el título animado «Hablá inglés sin miedo.»" />
          <CampoBilingue id="portada-subtitulo" etiqueta="Subtítulo" max={300} multilinea requerido valor={c.portada.subtitulo} onChange={(v) => cambiar("portada", { ...c.portada, subtitulo: v })} />
        </div>
      );
      break;
    case "pasos":
      formulario = (
        <Lista items={c.pasos} onChange={(v) => cambiar("pasos", v)} nombre="Paso" min={1} max={8} nuevo={() => ({ titulo: vacio(), texto: vacio() })}
          render={(p, set, i) => (<>
            <CampoBilingue id={`paso-${i}-titulo`} etiqueta="Título" max={60} requerido valor={p.titulo} onChange={(v) => set({ ...p, titulo: v })} />
            <CampoBilingue id={`paso-${i}-texto`} etiqueta="Texto" max={240} multilinea requerido valor={p.texto} onChange={(v) => set({ ...p, texto: v })} />
          </>)} />
      );
      break;
    case "preguntas":
      formulario = (
        <Lista items={c.preguntas} onChange={(v) => cambiar("preguntas", v)} nombre="Pregunta" max={20} nuevo={() => ({ pregunta: vacio(), respuesta: vacio() })}
          render={(p, set, i) => (<>
            <CampoBilingue id={`pregunta-${i}`} etiqueta="Pregunta" max={160} requerido valor={p.pregunta} onChange={(v) => set({ ...p, pregunta: v })} />
            <CampoBilingue id={`respuesta-${i}`} etiqueta="Respuesta" max={800} multilinea requerido valor={p.respuesta} onChange={(v) => set({ ...p, respuesta: v })} />
          </>)} />
      );
      break;
    case "contacto": {
      const k = c.contacto;
      const set = (v: Partial<typeof k>) => cambiar("contacto", { ...k, ...v });
      formulario = (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="contacto-direccion" etiqueta="Dirección" maxLength={160} value={k.direccion} onChange={(e) => set({ direccion: e.target.value })} className="sm:col-span-2" />
            <Campo id="contacto-telefono" etiqueta="Teléfono" type="tel" maxLength={40} value={k.telefono} onChange={(e) => set({ telefono: e.target.value })} />
            <Campo id="contacto-whatsapp" etiqueta="WhatsApp" type="tel" maxLength={40} value={k.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} ayuda="Con código de país y área, ej.: +54 9 3863 123456." />
            <Campo id="contacto-email" etiqueta="Email" type="email" maxLength={160} value={k.email} onChange={(e) => set({ email: e.target.value })} className="sm:col-span-2" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Redes sociales</p>
            <Lista items={k.redes} onChange={(v) => set({ redes: v })} nombre="Red" max={6} nuevo={() => ({ nombre: "", url: "" })}
              render={(r, cambiarRed, i) => (
                <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                  <Campo id={`red-${i}-nombre`} etiqueta="Nombre" placeholder="Instagram" maxLength={30} required value={r.nombre} onChange={(e) => cambiarRed({ ...r, nombre: e.target.value })} />
                  <Campo id={`red-${i}-url`} etiqueta="Dirección" type="url" placeholder="https://…" maxLength={300} required value={r.url} onChange={(e) => cambiarRed({ ...r, url: e.target.value })} />
                </div>
              )} />
          </div>
        </div>
      );
      break;
    }
    case "anuncio": {
      const a = c.anuncio;
      const set = (v: Partial<typeof a>) => cambiar("anuncio", { ...a, ...v });
      formulario = (
        <div className="space-y-4">
          <label className="flex min-h-11 items-center gap-3 font-semibold">
            <input type="checkbox" className="size-5" checked={a.activo} onChange={(e) => set({ activo: e.target.checked })} />
            Mostrar la barra de anuncio en el sitio
          </label>
          <CampoBilingue id="anuncio-texto" etiqueta="Texto del anuncio" max={200} requerido={a.activo} valor={a.texto} onChange={(v) => set({ texto: v })} />
          <Campo id="anuncio-enlace" etiqueta="Enlace (opcional)" maxLength={300} placeholder="#consulta o https://…" value={a.enlace} onChange={(e) => set({ enlace: e.target.value })}
            ayuda="Puede ser una sección de la página (#consulta, #cursos, #test), una ruta (/ingresar) o una web (https://…)." />
          {a.enlace ? <CampoBilingue id="anuncio-texto-enlace" etiqueta="Texto del enlace" max={40} valor={a.textoEnlace} onChange={(v) => set({ textoEnlace: v })} ayuda="Si queda vacío dice «Ver más»." /> : null}
        </div>
      );
      break;
    }
    case "certificaciones":
      formulario = (
        <Lista items={c.certificaciones} onChange={(v) => cambiar("certificaciones", v)} nombre="Certificación" max={10} nuevo={() => ({ nombre: vacio(), descripcion: vacio() })}
          render={(k, set, i) => (<>
            <CampoBilingue id={`cert-${i}-nombre`} etiqueta="Nombre" max={80} requerido valor={k.nombre} onChange={(v) => set({ ...k, nombre: v })} />
            <CampoBilingue id={`cert-${i}-descripcion`} etiqueta="Descripción" max={300} multilinea valor={k.descripcion} onChange={(v) => set({ ...k, descripcion: v })} />
          </>)} />
      );
      break;
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Secciones del sitio">
        <ul className="flex flex-wrap gap-2">
          {SECCIONES.map((s) => (
            <li key={s.clave}>
              <button type="button" aria-current={activa === s.clave ? "true" : undefined} onClick={() => { setActiva(s.clave); setResultado(null); }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-borde bg-superficie px-4 text-sm font-semibold hover:bg-marca-suave aria-[current]:border-marca aria-[current]:bg-marca aria-[current]:text-sobre-marca">
                {s.nombre}
                {sinPublicar(s.clave) ? <span className="size-2 rounded-full bg-alerta" aria-label="(con cambios sin publicar)" role="img" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <form onSubmit={(e) => { e.preventDefault(); publicar(); }} className="min-w-0 space-y-4 rounded-base border border-borde bg-superficie p-4 sm:p-5" aria-labelledby="titulo-seccion">
          <div>
            <h2 id="titulo-seccion" className="text-lg font-bold">{seccion.nombre}</h2>
            <p className="text-sm text-suave">{seccion.ayuda}</p>
            {actualizado[activa] ? <p className="mt-1 text-xs text-suave">Última publicación: {actualizado[activa]}</p> : <p className="mt-1 text-xs text-suave">Todavía no se publicó: el sitio muestra los textos de siempre.</p>}
          </div>
          {formulario}
          <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
            <Boton type="submit" disabled={publicando || !sinPublicar(activa)}>{publicando ? "Publicando…" : "Publicar"}</Boton>
            {sinPublicar(activa) ? (
              <Boton type="button" variante="texto" onClick={() => cambiar(activa, publicado[activa])}>Descartar cambios</Boton>
            ) : <span className="text-sm text-suave">Sin cambios pendientes.</span>}
          </div>
          {resultado && resultado.clave === activa ? <Aviso tono={resultado.ok ? "exito" : "peligro"}>{resultado.mensaje}</Aviso> : null}
        </form>

        <aside aria-labelledby="titulo-vista" className="min-w-0 rounded-base border border-borde bg-pizarra p-4 lg:sticky lg:top-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-vista" className="font-bold">Vista previa</h2>
            <div role="group" aria-label="Idioma de la vista previa" className="inline-flex rounded-full bg-superficie p-1 text-sm font-bold">
              {(["es", "en"] as const).map((i) => (
                <button key={i} type="button" aria-pressed={idioma === i} onClick={() => setIdioma(i)}
                  className="min-h-9 min-w-11 rounded-full px-3 aria-pressed:bg-marca aria-pressed:text-white">{i.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="rounded-base bg-white p-3 text-texto"><VistaPrevia clave={activa} c={contenido} idioma={idioma} /></div>
          <p className="mt-2 text-xs text-suave">Aproximada: en el sitio se ve con el diseño completo. Los cambios aparecen recién al publicar.</p>
        </aside>
      </div>
    </div>
  );
}
