import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Aviso, Enlace, EstadoVacio } from "@/componentes/ui";
import { puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { Ajustes } from "./ajustes";
import { HABILIDADES, plural, type Progreso } from "./comun";
import "./practica.css";

export const metadata: Metadata = { title: "Practicar" };

interface FilaRanking { posicion: number | null; nombre: string; xp_semana: number; soy_yo: boolean }
interface Comision { id: string; nombre: string; nivel: string | null }

/** Anillo SVG que se dibuja al cargar (CSS). */
function Anillo({ valor, max, tam = 72, grosor = 8, color = "var(--pr-color, var(--marca))", fondo = "var(--pizarra)", retraso = 0, children }: {
  valor: number; max: number; tam?: number; grosor?: number; color?: string; fondo?: string; retraso?: number; children?: ReactNode;
}) {
  const r = (tam - grosor) / 2;
  const circ = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, valor / max) : 0;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={fondo} strokeWidth={grosor} />
        {frac > 0 ? (
          <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" className="pr-anillo"
            style={{ "--pr-circ": `${circ}`, "--pr-off": `${circ * (1 - frac)}`, "--pr-retraso": `${retraso}ms` } as CSSProperties} />
        ) : null}
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

const MEDALLA_PUESTO = ["bg-[#f5b400] text-marca-fuerte", "bg-[#c9d1de] text-marca-fuerte", "bg-[#e0a370] text-marca-fuerte"];

export default async function Practica({ searchParams }: { searchParams: Promise<{ comision?: string }> }) {
  const sesion = await exigirPermiso("practica", "crear");
  const { comision: comisionPedida } = await searchParams;
  const supabase = await crearClienteServidor();

  const [{ data: progresoData, error }, { data: est }] = await Promise.all([
    supabase.rpc("mi_progreso"),
    supabase.from("estudiantes").select("id").eq("persona_id", sesion.personaId).maybeSingle(),
  ]);
  const p = progresoData as Progreso | null;

  if (error) return <Aviso tono="peligro">No pudimos cargar tu práctica. Actualizá la página.</Aviso>;
  if (!p) {
    return (
      <EstadoVacio titulo="La práctica con puntos es para estudiantes">
        <p>Acá cada estudiante practica por habilidad, suma XP y ve su racha.</p>
        {puede(sesion.perfiles, "practica", "editar") ? (
          <div className="mt-4"><Enlace href="/panel/banco">Ir al banco de ejercicios</Enlace></div>
        ) : null}
      </EstadoVacio>
    );
  }

  // Comisiones activas del estudiante (para el ranking).
  const { data: mats } = est
    ? await supabase.from("matriculas").select("comision_id, comisiones(id, nombre, niveles(nombre))").eq("estudiante_id", est.id).eq("estado", "activa")
    : { data: [] };
  const comisiones: Comision[] = ((mats ?? []) as unknown as { comisiones: { id: string; nombre: string; niveles: { nombre: string } | null } | null }[])
    .filter((m) => m.comisiones).map((m) => ({ id: m.comisiones!.id, nombre: m.comisiones!.nombre, nivel: m.comisiones!.niveles?.nombre ?? null }));
  const comision = comisiones.find((c) => c.id === comisionPedida) ?? comisiones[0];
  const ranking = comision ? ((await supabase.rpc("ranking_comision", { p_comision: comision.id })).data ?? []) as FilaRanking[] : [];

  const meta = p.meta_semanal;
  const metaPct = Math.min(100, Math.round((p.xp_semana / Math.max(meta, 1)) * 100));
  const habilidades = HABILIDADES.map((h) => {
    const d = p.habilidades?.find((x) => x.habilidad === h.clave);
    const disponibles = d?.disponibles ?? 0;
    return { ...h, disponibles, dominados: Math.min(d?.dominados ?? 0, disponibles) };
  });
  // Sugerencia: la habilidad con ejercicios y menos dominio relativo.
  const sugerida = habilidades.filter((h) => h.disponibles > 0).sort((a, b) => a.dominados / a.disponibles - b.dominados / b.disponibles)[0];
  const obtenidas = (p.medallas ?? []).filter((m) => m.obtenida_en);

  const mensajeRacha = p.racha === 0
    ? "Hoy es un buen día para empezar una racha."
    : p.practico_hoy ? "Hoy ya sumaste tu día. ¡Bien ahí!"
    : `Practicá hoy para llegar a ${plural(p.racha + 1, "día", "días")}.`;

  return (
    <div className="space-y-8">
      {/* Portada: racha, semana y total. */}
      <section aria-labelledby="titulo-practica" className="relative overflow-hidden rounded-[2.25rem] bg-marca px-5 pb-8 pt-6 text-white sm:px-8">
        <div aria-hidden className="absolute -right-16 -top-20 size-72 rounded-full bg-marca-fuerte" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-md">
            <p className="font-semibold text-cielo">Let&apos;s practice</p>
            <h1 id="titulo-practica" className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Tu práctica</h1>
            <p className="mt-2 text-white/85">{mensajeRacha}</p>
            {sugerida ? (
              <Link href={`/panel/practica/${sugerida.clave}`}
                className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-acento px-6 text-lg font-bold text-white shadow-[0_6px_0_0_#8f0b21] hover:bg-[#a90d26] active:translate-y-1">
                {p.practico_hoy ? "Seguir practicando" : "Practicar ahora"} <span aria-hidden>→</span>
                <span className="sr-only">: {sugerida.nombre}</span>
              </Link>
            ) : null}
          </div>

          <dl className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:gap-4">
            <div className="globo globo-izq bg-white/10 px-3 py-4 text-center sm:px-5">
              <dt className="text-xs font-semibold uppercase tracking-wide text-white/75">Racha</dt>
              <dd className="mt-1 text-3xl font-extrabold">
                <span aria-hidden className={p.racha > 0 ? "pr-llama" : "opacity-50 grayscale"}>🔥</span> {p.racha}
              </dd>
              <dd className="text-xs text-white/75">{p.racha === 1 ? "día" : "días"} · mejor {p.mejor_racha}</dd>
            </div>
            <div className="globo globo-izq grid place-items-center bg-white/10 px-2 py-3 text-center">
              <dt className="sr-only">XP de la semana</dt>
              <dd>
                <Anillo valor={p.xp_semana} max={meta} tam={92} grosor={10} color="var(--cielo)" fondo="rgb(255 255 255 / 0.15)">
                  <span className="block text-xl font-extrabold leading-none">{p.xp_semana}</span>
                  <span className="block text-[0.65rem] text-white/75">de {meta} XP</span>
                </Anillo>
              </dd>
              <dd className="mt-1 text-xs text-white/75">{metaPct >= 100 ? "🎯 meta cumplida" : "esta semana"}</dd>
            </div>
            <div className="globo globo-izq bg-white/10 px-3 py-4 text-center sm:px-5">
              <dt className="text-xs font-semibold uppercase tracking-wide text-white/75">Total</dt>
              <dd className="mt-1 text-3xl font-extrabold"><span aria-hidden>⭐</span> {p.xp_total}</dd>
              <dd className="text-xs text-white/75">XP acumulada</dd>
            </div>
          </dl>
        </div>
        <p className="relative mt-5 flex items-center gap-2 text-sm text-white/85">
          <span aria-hidden className="text-lg">{"🛡️".repeat(p.comodines) || "○"}</span>
          <span>
            <strong>{p.comodines === 0 ? "Sin comodines por ahora." : `${plural(p.comodines, "comodín", "comodines")} de racha.`}</strong>{" "}
            Si un día no podés practicar, un comodín cuida tu racha. Ganás uno cada 7 días seguidos (máximo 2).
          </span>
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Camino de habilidades. */}
        <section aria-labelledby="titulo-camino">
          <h2 id="titulo-camino" className="text-2xl font-extrabold tracking-tight text-marca-fuerte">Tu camino</h2>
          <p className="mt-1 text-sm text-suave">Cada lección tiene 5 ejercicios. El dominio cuenta ejercicios distintos bien resueltos: es tu evidencia, no tus puntos.</p>
          <ol className="pr-camino mt-5 space-y-4">
            {habilidades.map((h, i) => {
              const listo = h.disponibles > 0;
              const completa = listo && h.dominados >= h.disponibles;
              return (
                <li key={h.clave} className={`${h.tono} relative flex items-center gap-4`}>
                  <Anillo valor={h.dominados} max={h.disponibles} retraso={i * 90} tam={72} grosor={7}>
                    <span aria-hidden className={`grid size-[3.4rem] place-items-center rounded-full text-2xl ${listo ? "bg-[var(--pr-suave)]" : "bg-pizarra grayscale"}`}>
                      {completa ? "👑" : h.icono}
                    </span>
                  </Anillo>
                  <div className={`globo globo-izq flex flex-1 flex-wrap items-center justify-between gap-3 border-2 px-4 py-3 sm:px-5 ${listo ? "border-transparent bg-white" : "border-dashed border-borde bg-transparent"}`}>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold leading-tight">{h.nombre}</h3>
                      <p className="text-sm text-suave">{h.lema}</p>
                      {listo ? (
                        <p className="mt-1 text-xs font-semibold text-[var(--pr-color)]">
                          {completa ? "¡Dominada! Repasá cuando quieras." : `${h.dominados} de ${h.disponibles} dominados`}
                        </p>
                      ) : null}
                      {h.clave === "habla" && listo ? <p className="mt-1 text-xs text-suave">Por ahora con frases para armar; lo oral llega pronto.</p> : null}
                    </div>
                    {listo ? (
                      <Link href={`/panel/practica/${h.clave}`}
                        className="inline-flex min-h-11 items-center rounded-full bg-[var(--pr-color)] px-5 font-bold text-white shadow-[0_4px_0_0_rgb(0_0_0/0.25)] hover:brightness-110 active:translate-y-0.5">
                        Practicar<span className="sr-only"> {h.nombre}</span>
                      </Link>
                    ) : (
                      <span className="rounded-full bg-pizarra px-3 py-1.5 text-sm font-semibold text-suave" title="Tus docentes están preparando los ejercicios">
                        Pronto
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="space-y-8">
          {/* Ranking de la semana. */}
          <section aria-labelledby="titulo-ranking" className="rounded-[2rem] bg-white p-5 sm:p-6">
            <h2 id="titulo-ranking" className="text-xl font-extrabold text-marca-fuerte">Ranking de la semana</h2>
            <p className="mt-1 text-xs text-suave">Cuenta el uso de esta semana (XP) y se reinicia cada lunes. Solo lo ven quienes integran tu comisión.</p>
            {comisiones.length > 1 ? (
              <nav aria-label="Elegir comisión" className="mt-3 flex flex-wrap gap-2">
                {comisiones.map((c) => (
                  <Link key={c.id} href={`/panel/practica?comision=${c.id}`} aria-current={c.id === comision?.id ? "page" : undefined}
                    className="inline-flex min-h-10 items-center rounded-full border-2 border-borde px-3 text-sm font-semibold aria-[current]:border-marca aria-[current]:bg-marca aria-[current]:text-white">
                    {c.nombre}
                  </Link>
                ))}
              </nav>
            ) : comision ? <p className="mt-3 text-sm font-semibold">{comision.nombre}{comision.nivel ? ` · ${comision.nivel}` : ""}</p> : null}
            {!comision ? (
              <p className="mt-4 rounded-2xl bg-pizarra p-4 text-sm text-suave">Cuando tengas una inscripción activa, vas a ver acá a tu comisión.</p>
            ) : ranking.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-pizarra p-4 text-sm text-suave">Todavía nadie sumó XP esta semana.</p>
            ) : (
              <ol className="mt-4 space-y-1.5">
                {ranking.map((f, i) => (
                  <li key={i} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${f.soy_yo ? "bg-marca-suave ring-2 ring-marca" : i % 2 ? "" : "bg-pizarra/60"}`}>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${f.posicion && f.posicion <= 3 ? MEDALLA_PUESTO[f.posicion - 1] : "bg-white text-suave"}`}>
                      {f.posicion ?? "–"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {f.nombre}{f.soy_yo ? <span className="ml-1.5 rounded-full bg-marca px-2 py-0.5 text-xs text-white">vos</span> : null}
                      {f.soy_yo && f.posicion === null ? <span className="block text-xs font-normal text-suave">Oculto para tus compañeros</span> : null}
                    </span>
                    <span className="font-bold text-marca">{f.xp_semana} <span className="text-xs font-normal text-suave">XP</span></span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Medallas. */}
          <section aria-labelledby="titulo-medallas" className="rounded-[2rem] bg-white p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="titulo-medallas" className="text-xl font-extrabold text-marca-fuerte">Medallas</h2>
              <p className="text-sm font-semibold text-suave">{obtenidas.length} de {p.medallas?.length ?? 0}</p>
            </div>
            <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {(p.medallas ?? []).map((m) => {
                const tiene = Boolean(m.obtenida_en);
                return (
                  <li key={m.codigo} className="text-center" title={m.descripcion}>
                    <span aria-hidden className={`mx-auto grid size-16 place-items-center rounded-full text-3xl ${tiene ? "bg-cielo-suave shadow-[0_0_0_3px_var(--cielo)]" : "bg-pizarra opacity-50 grayscale"}`}>
                      {m.icono}
                    </span>
                    <p className={`mt-1.5 text-xs font-bold leading-tight ${tiene ? "" : "text-suave"}`}>{m.nombre}</p>
                    <p className="text-[0.7rem] leading-tight text-suave">
                      {tiene ? `Obtenida el ${new Date(m.obtenida_en!).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Tucuman" })}` : m.descripcion}
                    </p>
                    <span className="sr-only">{tiene ? "Obtenida." : "Por obtener."}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Ajustes. */}
          <section aria-labelledby="titulo-ajustes" className="rounded-[2rem] border border-borde bg-superficie p-5 sm:p-6">
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
                <h2 id="titulo-ajustes" className="text-lg font-bold">Ajustes de práctica</h2>
                <span className="text-sm text-suave">Alias · ranking · meta</span>
              </summary>
              <div className="mt-4">
                <Ajustes alias={p.alias} mostrar={p.mostrar_en_ranking} meta={p.meta_semanal} />
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
