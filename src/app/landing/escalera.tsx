import Image from "next/image";
import type { Bilingue, Tramo } from "@/lib/sitio";
import { Traducible as T } from "./traduccion";

const ingles = (b: Bilingue) => b.en || b.es;

/**
 * Grupos por edad como una escalera: cada tramo es un escalón más alto que el
 * anterior, como la escalera real del instituto (una frase en inglés en cada
 * escalón). En pantallas chicas es una lista simple, de menor a mayor.
 */
export function EscaleraGrupos({ tramos, diferenciales }: { tramos: Tramo[]; diferenciales: Bilingue[] }) {
  return (
    <section id="grupos" aria-labelledby="titulo-grupos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,2fr)] lg:items-end">
        <figure className="mx-auto w-full max-w-[16rem] lg:max-w-none">
          <div className="globo globo-izq bg-white p-2 shadow-[0_30px_60px_-30px_rgb(19_29_79/0.45)]">
            <Image src="/fotos/escalera.webp" alt="La escalera del instituto, con una frase en inglés en cada escalón: Be grateful, Happiness, Listen…"
              width={800} height={1083} sizes="(min-width: 1024px) 280px, 16rem" className="aspect-[3/4] w-full rounded-[1.9rem] object-cover" />
          </div>
          <figcaption className="mt-8 text-sm text-suave">
            <T es="Así se sube al instituto: una frase en inglés en cada escalón." en="This is how you get to class: an English phrase on every step." />
          </figcaption>
        </figure>

        <div>
          <h2 id="titulo-grupos" className="max-w-xl text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]">
            <T es="Un grupo para cada edad" en="A group for every age" />
          </h2>
          <p data-traducir className="mt-3 max-w-xl text-lg text-suave">
            <T es="Desde los 4 años hasta adultos. Cada año, un escalón más." en="From age 4 to adults. Every year, one more step." />
          </p>

          <ol className="mt-10 grid gap-x-3 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            {tramos.map((tr, i) => (
              <li key={`${i}-${tr.tramo.es}`} className="flex flex-col">
                {/* En escritorio, el grupo más chico queda abajo, pegado al escalón. */}
                <ul className="flex flex-col gap-2 lg:flex-col-reverse">
                  {tr.grupos.map((x, j) => (
                    <li key={`${j}-${x.nombre}`} className="flex items-baseline justify-between gap-2 rounded-2xl bg-white px-4 py-2.5 ring-1 ring-borde">
                      <span className="font-bold text-marca-fuerte" lang="en">{x.nombre}</span>
                      {x.edad.es ? <span className="shrink-0 text-sm text-suave"><T es={x.edad.es} en={ingles(x.edad)} /></span> : null}
                    </li>
                  ))}
                </ul>
                <div
                  className={`order-first mb-3 flex items-start rounded-2xl px-4 py-2.5 text-lg font-extrabold text-white lg:order-none lg:mb-0 lg:mt-3 lg:h-[var(--alto)] lg:rounded-b-none lg:pb-0 lg:pt-3 ${i === tramos.length - 1 ? "bg-acento" : "bg-marca"}`}
                  style={{ "--alto": `${3 + i * 2.25}rem` } as React.CSSProperties}
                >
                  <T es={tr.tramo.es} en={ingles(tr.tramo)} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {diferenciales.length ? (
        <ul className="mt-14 grid gap-x-6 gap-y-3 border-t border-borde pt-8 sm:grid-cols-2 lg:grid-cols-3" aria-label="Por qué Oakland">
          {diferenciales.map((d, i) => (
            <li key={`${i}-${d.es}`} className="flex items-center gap-2 font-semibold text-marca-fuerte">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-acento text-xs text-white">✓</span>
              <T es={d.es} en={ingles(d)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
