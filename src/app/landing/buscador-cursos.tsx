"use client";

import { useState } from "react";
import type { CursoPublicado } from "@/lib/oferta";
import { prellenarConsulta } from "./prellenar";
import { Traducible as T } from "./traduccion";

const PARA: Record<string, { quien: string; who: string; detalle: string; age: string }> = {
  ninos: { quien: "Mi hijo o hija", who: "My son or daughter", detalle: "de 6 a 11 años", age: "6 to 11 years old" },
  adolescentes: { quien: "Un adolescente", who: "A teenager", detalle: "de 12 a 17 años", age: "12 to 17 years old" },
  adultos: { quien: "Yo, adulto", who: "Me, an adult", detalle: "desde 18 años", age: "18 and over" },
  todos: { quien: "Cualquier edad", who: "Any age", detalle: "", age: "" },
};
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MODALIDAD: Record<string, string> = { presencial: "Presencial", virtual: "Virtual", mixta: "Presencial y virtual" };
const MODE: Record<string, string> = { presencial: "In person", virtual: "Online", mixta: "In person and online" };
const TONOS = ["bg-marca text-white", "bg-acento text-white", "bg-cielo text-marca-fuerte"];

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export function BuscadorCursos({ cursos }: { cursos: CursoPublicado[] }) {
  const [slug, setSlug] = useState(cursos[0]?.slug);
  const curso = cursos.find((c) => c.slug === slug) ?? cursos[0];
  if (!curso) return null;

  const horarios = curso.comisiones.flatMap((k, n) => k.horarios.map((h) => ({ ...h, comision: k, tono: TONOS[n % TONOS.length] })));
  const desde = Math.min(...horarios.map((h) => minutos(h.hora_inicio)), 17 * 60);
  const hasta = Math.max(...horarios.map((h) => minutos(h.hora_fin)), 20 * 60);
  const rango = Math.max(hasta - desde, 60);
  const enlazable = !curso.id.startsWith("demo-");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,17rem)_1fr]">
      <div role="radiogroup" aria-label="¿Para quién es el curso?" className="grid gap-3 self-start">
        <p data-traducir className="text-lg font-semibold text-marca-fuerte"><T es="¿Para quién es?" en="Who is it for?" /></p>
        {cursos.map((c) => {
          const p = PARA[c.publico] ?? { quien: c.nombre, who: c.nombre, detalle: "", age: "" };
          const activo = c.slug === curso.slug;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setSlug(c.slug)}
              className={`globo globo-izq flex min-h-16 flex-col items-start gap-0.5 px-5 py-4 text-left transition-colors ${
                activo ? "bg-marca text-white" : "bg-white text-texto hover:bg-cielo-suave"
              }`}
            >
              <span className="text-xl font-bold leading-tight"><T es={p.quien} en={p.who} activo={activo} /></span>
              <span className={activo ? "text-white/80" : "text-suave"}><T es={p.detalle} en={p.age} activo={activo} /></span>
            </button>
          );
        })}
      </div>

      <div key={curso.slug} className="rounded-[2.25rem] bg-white p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h3 className="text-3xl font-extrabold tracking-tight text-marca-fuerte [font-variation-settings:'opsz'_60]">{curso.nombre}</h3>
            {curso.descripcion ? <p className="mt-2 text-lg text-suave">{curso.descripcion}</p> : null}
          </div>
          <p className="rounded-full bg-pizarra px-4 py-2 text-sm font-semibold text-marca"><T es={MODALIDAD[curso.modalidad] ?? curso.modalidad} en={MODE[curso.modalidad] ?? curso.modalidad} /></p>
        </div>

        {horarios.length > 0 ? (
          <figure className="mt-8">
            <figcaption data-traducir className="mb-3 font-semibold"><T es="Así queda tu semana" en="This is your week" /></figcaption>
            <div className="grid grid-cols-6 gap-1.5 sm:gap-3" aria-hidden>
              {DIAS.map((d, i) => (
                <div key={d}>
                  <p className="mb-2 text-center text-xs font-semibold text-suave sm:text-sm"><T es={d} en={DAYS[i]} /></p>
                  <div className="relative h-36 rounded-2xl bg-pizarra">
                    {horarios.filter((h) => h.dia_semana === i + 1).map((h, j) => (
                      <div
                        key={j}
                        className={`bloque-semana absolute inset-x-1 rounded-xl px-1 py-1.5 text-center text-[0.7rem] font-semibold leading-tight sm:text-xs ${h.tono}`}
                        style={{
                          top: `${((minutos(h.hora_inicio) - desde) / rango) * 100}%`,
                          height: `${Math.max(((minutos(h.hora_fin) - minutos(h.hora_inicio)) / rango) * 100, 22)}%`,
                          animationDelay: `${i * 50}ms`,
                        }}
                      >
                        {h.hora_inicio}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Versión en texto de la grilla, para lectores de pantalla. */}
            <ul className="sr-only">
              {horarios.map((h, i) => (
                <li key={i}>{DIAS[h.dia_semana - 1]} de {h.hora_inicio} a {h.hora_fin}, nivel {h.comision.nivel}</li>
              ))}
            </ul>
          </figure>
        ) : (
          <p className="mt-8 rounded-2xl bg-pizarra p-4 text-suave">Los horarios de este curso se confirman al consultar.</p>
        )}

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {curso.comisiones.map((k, n) => (
            <li key={k.id} className="flex items-start gap-3 rounded-2xl border border-borde p-4">
              <span aria-hidden className={`mt-1 size-3 shrink-0 rounded-full ${TONOS[n % TONOS.length].split(" ")[0]}`} />
              <div>
                <p className="font-bold"><T es={`Nivel ${k.nivel}`} en={`Level: ${k.nivel}`} /></p>
                <p className="text-sm text-suave">
                  {k.horarios.map((h) => `${DIAS[h.dia_semana - 1]} ${h.hora_inicio}–${h.hora_fin}`).join(", ") || "Horario a confirmar"}
                </p>
                <p className={`mt-2 text-sm font-semibold ${k.hay_vacantes ? "text-exito" : "text-alerta"}`}>
                  {k.hay_vacantes ? <T es="Hay lugar" en="Spots available" /> : <T es="Sin lugar: te anotamos en lista de espera" en="Full: we'll add you to the waiting list" />}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => prellenarConsulta({ cursoId: enlazable ? curso.id : undefined, tipo: "preinscripcion" })}
          className="mt-8 inline-flex min-h-12 items-center rounded-full bg-acento px-6 text-lg font-bold text-white hover:bg-[#a90d26]"
        >
          <T es="Quiero este curso" en="I want this course" />
        </button>
      </div>
    </div>
  );
}
