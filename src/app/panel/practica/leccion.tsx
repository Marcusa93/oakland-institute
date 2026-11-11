"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { cargarLeccion, responderEjercicio } from "./acciones";
import { datosHabilidad, plural, type EjercicioLeccion, type Habilidad, type MedallaNueva, type ResultadoRespuesta } from "./comun";
import { Devolucion, Respuesta } from "./ejercicio";

type Fase = "responder" | "comprobando" | "resultado" | "fin";

interface Estado { xp_semana: number; meta_semanal: number; racha: number }

const CHISPAS = Array.from({ length: 14 }, (_, i) => {
  const ang = (i / 14) * Math.PI * 2;
  const r = 7 + (i % 3) * 2;
  return { dx: `${Math.cos(ang) * r}rem`, dy: `${Math.sin(ang) * r}rem`, color: ["var(--acento)", "var(--cielo)", "var(--marca)", "#f5b400"][i % 4], retraso: (i % 5) * 40 };
});

export function Leccion({ habilidad, inicial, estado: estadoInicial }: { habilidad: Habilidad; inicial: EjercicioLeccion[]; estado: Estado }) {
  const h = datosHabilidad(habilidad)!;
  const [ejercicios, setEjercicios] = useState(inicial);
  const [indice, setIndice] = useState(0);
  const [valor, setValor] = useState("");
  const [fase, setFase] = useState<Fase>(inicial.length ? "responder" : "fin");
  const [resultado, setResultado] = useState<ResultadoRespuesta | null>(null);
  const [historial, setHistorial] = useState<Record<string, ResultadoRespuesta>>({});
  const [estado, setEstado] = useState(estadoInicial);
  const [medallas, setMedallas] = useState<MedallaNueva[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [anuncio, setAnuncio] = useState(inicial.length ? `Ejercicio 1 de ${inicial.length}.` : "");

  const refContinuar = useRef<HTMLButtonElement>(null);
  const refOtra = useRef<HTMLButtonElement>(null);
  const refDialogo = useRef<HTMLDialogElement>(null);

  const actual = ejercicios[indice];
  const total = ejercicios.length;

  useEffect(() => {
    if (fase === "resultado") refContinuar.current?.focus();
    if (fase === "fin") refOtra.current?.focus();
  }, [fase]);

  // Medalla nueva: se abre el diálogo un instante después de la devolución.
  useEffect(() => {
    if (!medallas.length) return;
    const t = window.setTimeout(() => { if (!refDialogo.current?.open) refDialogo.current?.showModal(); }, 650);
    return () => window.clearTimeout(t);
  }, [medallas]);

  async function comprobar() {
    if (!actual || fase !== "responder" || !valor.trim()) return;
    setFase("comprobando");
    setError(null);
    const r = await responderEjercicio(actual.id, valor);
    if (!r.ok) {
      setError(r.mensaje);
      setFase("responder");
      return;
    }
    const d = r.datos;
    setResultado(d);
    setHistorial((x) => ({ ...x, [actual.id]: d }));
    setEstado((e) => ({ ...e, xp_semana: d.xp_semana, racha: d.racha }));
    setAnuncio(d.correcta
      ? `Correcto.${d.xp ? ` Sumaste ${d.xp} XP.` : ""}${d.explicacion ? ` ${d.explicacion}` : ""}`
      : `No era esa. La respuesta es ${d.respuesta}.${d.explicacion ? ` ${d.explicacion}` : ""}`);
    if (d.medallas_nuevas?.length) setMedallas(d.medallas_nuevas);
    setFase("resultado");
  }

  function continuar() {
    setResultado(null);
    setValor("");
    setError(null);
    if (indice + 1 >= total) { setFase("fin"); setAnuncio("Lección completa."); return; }
    setIndice(indice + 1);
    setAnuncio(`Ejercicio ${indice + 2} de ${total}.`);
    setFase("responder");
  }

  // Saltar un ejercicio que ya no está disponible (fue retirado mientras practicabas).
  const saltar = () => continuar();

  async function otraLeccion() {
    setCargando(true);
    const r = await cargarLeccion(habilidad);
    setCargando(false);
    if (!r.ok) { setError(r.mensaje); return; }
    if (!r.datos.length) { setError("Por ahora no hay más ejercicios en esta habilidad."); return; }
    setEjercicios(r.datos);
    setIndice(0);
    setHistorial({});
    setValor("");
    setError(null);
    setAnuncio(`Lección nueva. Ejercicio 1 de ${r.datos.length}.`);
    setFase("responder");
  }

  // Enter comprueba o continúa (los botones y las fichas conservan su Enter nativo).
  const tecla = useEffectEvent((e: globalThis.KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing || refDialogo.current?.open) return;
      const t = e.target as HTMLElement | null;
      const esBoton = t?.closest("button, a, summary, textarea");
      if (esBoton && t?.getAttribute("role") !== "radio") return;
      if (fase === "responder" && !valor.trim()) return; // Enter sobre una opción: la elige.
      if (fase === "responder") { e.preventDefault(); void comprobar(); }
      else if (fase === "resultado") { e.preventDefault(); continuar(); }
  });
  useEffect(() => {
    const f = (e: globalThis.KeyboardEvent) => tecla(e);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const pct = estado.meta_semanal > 0 ? Math.min(100, Math.round((estado.xp_semana / estado.meta_semanal) * 100)) : 0;
  const respondidos = Object.values(historial);
  const aciertos = respondidos.filter((r) => r.correcta).length;
  const xpGanada = respondidos.reduce((s, r) => s + r.xp, 0);

  return (
    <div className={`${h.tono} mx-auto max-w-2xl`}>
      {/* Cabecera: salir, progreso de la lección y estado de la semana. */}
      <div className="flex items-center gap-3">
        <Link href="/panel/practica" aria-label="Salir de la lección y volver a la práctica"
          className="grid size-11 shrink-0 place-items-center rounded-full text-2xl text-suave hover:bg-marca-suave hover:text-marca">✕</Link>
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Avance de la lección" aria-valuemin={0} aria-valuemax={total}
          aria-valuenow={fase === "fin" ? total : indice + (fase === "resultado" ? 1 : 0)}>
          {ejercicios.map((e, i) => {
            const r = historial[e.id];
            const color = r ? (r.correcta ? "bg-exito" : "bg-alerta") : i === indice && fase !== "fin" ? "bg-[var(--pr-color)]" : "bg-pizarra";
            return <span key={e.id} className={`h-3 flex-1 rounded-full transition-colors duration-300 ${color}`} />;
          })}
        </div>
        <span key={estado.racha} className="pr-pulso inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-acento shadow-sm" title="Racha de días">
          <span aria-hidden>🔥</span>{estado.racha}<span className="sr-only"> días de racha</span>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <p className="font-semibold text-suave"><span aria-hidden>{h.icono}</span> {h.nombre}</p>
        <p key={estado.xp_semana} className="pr-pulso font-bold text-marca">
          {estado.xp_semana} / {estado.meta_semanal} XP <span className="font-normal text-suave">esta semana</span>
        </p>
      </div>

      {habilidad === "habla" ? (
        <p className="mt-4 rounded-2xl bg-cielo-suave px-4 py-3 text-sm text-marca-fuerte">
          <strong>Por ahora:</strong> practicás armando frases útiles para conversar y podés escucharlas. La práctica oral con devolución de tu docente llega en una próxima etapa.
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite" aria-atomic="true">{anuncio}</p>

      {fase !== "fin" && actual ? (
        <section key={actual.id} aria-label={`Ejercicio ${indice + 1} de ${total}`} className="pr-entra mt-6">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-suave">{CONSIGNA[actual.tipo]}</p>
          <Respuesta ejercicio={actual} valor={valor} onCambio={setValor} bloqueado={fase !== "responder"}
            correcta={resultado ? resultado.correcta : null} enfocar />

          <div className="mt-8 min-h-28">
            {error ? (
              <div role="alert" className="mb-4 rounded-2xl bg-peligro-suave px-4 py-3 text-sm text-peligro">
                {error}
                {/ya no está disponible/.test(error) ? <button type="button" onClick={saltar} className="ml-2 font-semibold underline">Saltar</button> : null}
              </div>
            ) : null}
            {resultado ? (
              <Devolucion correcta={resultado.correcta} respuesta={resultado.respuesta} explicacion={resultado.explicacion} xp={resultado.xp}
                n={indice} onContinuar={continuar} refBoton={refContinuar}
                textoBoton={indice + 1 >= total ? "Ver resultado" : "Continuar"} escucharRespuesta={actual.tipo === "ordenar"} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void comprobar()} disabled={!valor.trim() || fase === "comprobando"}
                  className="inline-flex min-h-14 flex-1 items-center justify-center rounded-full bg-acento px-10 text-lg font-bold text-white shadow-[0_6px_0_0_#8f0b21] transition-transform hover:bg-[#a90d26] active:translate-y-1 disabled:cursor-not-allowed disabled:bg-borde disabled:text-suave disabled:shadow-none sm:flex-none">
                  {fase === "comprobando" ? "Comprobando…" : "Comprobar"}
                </button>
                <p className="hidden text-xs text-suave sm:block">o apretá <kbd className="rounded border border-borde bg-white px-1.5 py-0.5 font-sans">Enter</kbd></p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {fase === "fin" ? (
        <section className="pr-aparece mt-8 globo globo-der bg-white p-6 text-center sm:p-10" aria-labelledby="titulo-fin">
          {total === 0 ? (
            <>
              <p className="text-5xl" aria-hidden>🌱</p>
              <h2 id="titulo-fin" className="mt-3 text-2xl font-extrabold text-marca-fuerte">Pronto vas a tener ejercicios acá</h2>
              <p className="mt-2 text-suave">Tus docentes están preparando y revisando el banco de {h.nombre.toLowerCase()}. Mientras tanto, probá otra habilidad.</p>
            </>
          ) : (
            <>
              <p className="text-5xl" aria-hidden>{aciertos === total ? "🏆" : aciertos >= total / 2 ? "🎉" : "💪"}</p>
              <h2 id="titulo-fin" className="mt-3 text-3xl font-extrabold tracking-tight text-marca-fuerte">
                {aciertos === total ? "¡Impecable!" : "Lección completa"}
              </h2>
              <p className="mt-1 text-suave">
                {aciertos === total ? "Todo bien resuelto." : "Los que costaron vuelven en las próximas lecciones para afianzarlos."}
              </p>
              <dl className="mt-8 grid grid-cols-3 gap-3">
                <Dato titulo="Aciertos" valor={`${aciertos}/${total}`} tono="text-exito" />
                <Dato titulo="XP ganada" valor={`+${xpGanada}`} tono="text-marca" />
                <Dato titulo="Racha" valor={`🔥 ${estado.racha}`} tono="text-acento" detalle={plural(estado.racha, "día", "días")} />
              </dl>
              <div className="mt-6 text-left">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Meta de la semana</span><span className="text-marca">{estado.xp_semana} / {estado.meta_semanal} XP</span>
                </div>
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-pizarra">
                  <div className="pr-barra h-full rounded-full bg-linear-to-r from-marca to-[#2f6fd6]" style={{ width: `${pct}%` }} />
                </div>
                {pct >= 100 ? <p className="mt-2 text-sm font-semibold text-exito">¡Meta cumplida! Lo que sumes ahora es extra.</p> : null}
              </div>
            </>
          )}
          {error ? <p role="alert" className="mt-6 rounded-2xl bg-alerta-suave px-4 py-3 text-sm text-alerta">{error}</p> : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {total > 0 ? (
              <button ref={refOtra} type="button" onClick={() => void otraLeccion()} disabled={cargando}
                className="inline-flex min-h-14 items-center rounded-full bg-acento px-8 text-lg font-bold text-white shadow-[0_6px_0_0_#8f0b21] hover:bg-[#a90d26] active:translate-y-1 disabled:opacity-60">
                {cargando ? "Preparando…" : "Otra lección"}
              </button>
            ) : null}
            <Link href="/panel/practica" className="inline-flex min-h-14 items-center rounded-full border-2 border-marca px-8 text-lg font-semibold text-marca hover:bg-marca-suave">
              Volver
            </Link>
          </div>
        </section>
      ) : null}

      {/* Medalla nueva. <dialog> se cierra con Esc y devuelve el foco. */}
      <dialog ref={refDialogo} className="pr-dialogo m-auto w-[min(24rem,calc(100vw-2rem))] overflow-visible rounded-[2rem] bg-white p-0 text-center text-texto"
        aria-labelledby="titulo-medalla" onClose={() => { setMedallas([]); refContinuar.current?.focus(); }}>
        <div className="relative overflow-hidden rounded-[2rem] px-6 pb-6 pt-10">
          <div aria-hidden className="relative mx-auto grid size-36 place-items-center">
            <div className="pr-rayos absolute inset-0" />
            {CHISPAS.map((c, i) => (
              <span key={i} className="pr-chispa" style={{ "--dx": c.dx, "--dy": c.dy, background: c.color, animationDelay: `${c.retraso}ms` } as CSSProperties} />
            ))}
            <span className="pr-medalla relative grid size-24 place-items-center rounded-full bg-marca text-5xl shadow-[0_0_0_6px_var(--cielo)]">
              {medallas[0]?.icono}
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-acento">{medallas.length > 1 ? `${medallas.length} medallas nuevas` : "Medalla nueva"}</p>
          <h2 id="titulo-medalla" className="mt-1 text-2xl font-extrabold text-marca-fuerte">{medallas.map((m) => m.nombre).join(" · ")}</h2>
          {medallas.length > 1 ? <p className="mt-1 text-2xl" aria-hidden>{medallas.slice(1).map((m) => m.icono).join(" ")}</p> : null}
          <p className="mt-2 text-sm text-suave">La vas a ver en tu vitrina de medallas.</p>
          <form method="dialog" className="mt-6">
            <button className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-6 font-bold text-white hover:bg-marca-fuerte">Seguir</button>
          </form>
        </div>
      </dialog>
    </div>
  );
}

const CONSIGNA: Record<EjercicioLeccion["tipo"], string> = {
  opcion: "Elegí la opción correcta",
  completar: "Completá la frase",
  ordenar: "Armá la frase",
  escuchar: "Escuchá y elegí",
};

function Dato({ titulo, valor, tono, detalle }: { titulo: string; valor: string; tono: string; detalle?: string }) {
  return (
    <div className="rounded-2xl bg-pizarra px-2 py-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-suave">{titulo}</dt>
      <dd className={`mt-1 text-2xl font-extrabold ${tono}`}>{valor}</dd>
      {detalle ? <dd className="text-xs text-suave">{detalle}</dd> : null}
    </div>
  );
}
