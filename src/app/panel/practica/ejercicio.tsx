"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  hablar, hayVoz, mezclar, normalizar, partirHueco, partirLectura, xpDe,
  type EjercicioLeccion,
} from "./comun";

/* ------------------------------------------------------------------ */
/* Respuesta: la parte interactiva de cada tipo de ejercicio.          */
/* ------------------------------------------------------------------ */

interface PropsRespuesta {
  ejercicio: EjercicioLeccion;
  valor: string;
  onCambio: (v: string) => void;
  bloqueado: boolean;
  /** Resultado ya conocido: pinta la opción elegida en verde o ámbar. */
  correcta?: boolean | null;
  enfocar?: boolean;
}

export function Respuesta(props: PropsRespuesta) {
  const { ejercicio } = props;
  const { texto, pregunta } = partirLectura(ejercicio.enunciado);
  return (
    <div>
      {texto ? (
        <div lang="en" className="mb-5 whitespace-pre-line rounded-3xl bg-pizarra p-5 text-lg leading-relaxed">
          {texto}
        </div>
      ) : null}
      {ejercicio.tipo === "completar" ? <Completar {...props} pregunta={pregunta} />
        : ejercicio.tipo === "ordenar" ? <Ordenar {...props} pregunta={pregunta} />
        : <Opciones {...props} pregunta={pregunta} />}
    </div>
  );
}

/** La frase con su hueco; si hay algo elegido, aparece en el hueco. */
function Frase({ pregunta, relleno, correcta }: { pregunta: string; relleno: string; correcta?: boolean | null }) {
  const partes = partirHueco(pregunta);
  if (!partes) return <p lang="en" className="text-2xl font-bold leading-snug text-marca-fuerte sm:text-3xl">{pregunta}</p>;
  const color = correcta === true ? "border-exito text-exito" : correcta === false ? "border-alerta text-alerta" : relleno ? "border-marca text-marca" : "border-cielo text-transparent";
  return (
    <p lang="en" className="text-2xl font-bold leading-snug text-marca-fuerte sm:text-3xl">
      {partes[0]}
      <span key={relleno} className={`inline-block min-w-[4.5ch] border-b-4 px-1 text-center ${relleno ? "pr-ficha" : ""} ${color}`}>
        {relleno || "___"}
      </span>
      {partes[1]}
    </p>
  );
}

function Opciones({ ejercicio, valor, onCambio, bloqueado, correcta, enfocar, pregunta }: PropsRespuesta & { pregunta: string }) {
  const opciones = useMemo(() => mezclar(ejercicio.opciones, ejercicio.id), [ejercicio.opciones, ejercicio.id]);
  const escucha = ejercicio.tipo === "escuchar";
  const [escuchado, setEscuchado] = useState(!escucha);
  const [sinVoz, setSinVoz] = useState(false);
  const [verTexto, setVerTexto] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const refAudio = useRef<HTMLButtonElement>(null);
  const idPregunta = `pregunta-${ejercicio.id}`;

  useEffect(() => {
    if (!enfocar) return;
    if (escucha) refAudio.current?.focus();
    else refs.current[0]?.focus();
  }, [enfocar, escucha]);

  function reproducir(lento: boolean) {
    const ok = hablar(ejercicio.audio_texto ?? "", lento);
    if (!ok) setSinVoz(true);
    setEscuchado(true);
  }

  function teclas(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = opciones.length;
    let j = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % n;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + n) % n;
    if (j >= 0) {
      e.preventDefault();
      refs.current[j]?.focus();
      onCambio(opciones[j]);
    }
  }

  // Sin opciones cargadas (no debería pasar en el banco revisado): se escribe.
  if (opciones.length === 0) {
    return <Completar ejercicio={ejercicio} valor={valor} onCambio={onCambio} bloqueado={bloqueado} correcta={correcta} enfocar={enfocar} pregunta={pregunta} />;
  }

  const elegidaIndice = opciones.findIndex((o) => o === valor);
  return (
    <div>
      {escucha ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button ref={refAudio} type="button" onClick={() => reproducir(false)} disabled={!ejercicio.audio_texto}
            className={`inline-flex min-h-16 items-center gap-3 rounded-full bg-marca px-7 text-lg font-bold text-white shadow-[0_8px_0_0_var(--marca-fuerte)] transition-transform hover:bg-marca-fuerte active:translate-y-1 active:shadow-[0_4px_0_0_var(--marca-fuerte)] ${escuchado ? "" : "latido"}`}>
            <span aria-hidden className="text-2xl">🔊</span> Escuchar
          </button>
          <button type="button" onClick={() => reproducir(true)} disabled={!ejercicio.audio_texto}
            className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-marca px-5 font-semibold text-marca hover:bg-marca-suave">
            <span aria-hidden>🐢</span> Más lento
          </button>
          {sinVoz || verTexto ? (
            <p lang="en" className="w-full rounded-2xl bg-pizarra p-3 text-lg">“{ejercicio.audio_texto}”</p>
          ) : (
            <button type="button" onClick={() => { setVerTexto(true); setEscuchado(true); }} className="min-h-11 text-sm font-semibold text-suave underline-offset-4 hover:underline">
              No puedo escuchar ahora: mostrar el texto
            </button>
          )}
          {sinVoz ? <p className="w-full text-sm text-suave">Tu navegador no tiene voz disponible: te mostramos el texto.</p> : null}
        </div>
      ) : null}

      <div id={idPregunta}><Frase pregunta={pregunta} relleno={partirHueco(pregunta) ? valor : ""} correcta={correcta} /></div>

      {escuchado ? (
        <div role="radiogroup" aria-labelledby={idPregunta} className="pr-aparece mt-6 grid gap-3 sm:grid-cols-2">
          {opciones.map((o, i) => {
            const activa = o === valor;
            const tono = activa && correcta === true ? "border-exito bg-exito-suave text-exito"
              : activa && correcta === false ? "border-alerta bg-alerta-suave text-alerta"
              : activa ? "border-marca bg-marca text-white shadow-[0_6px_0_0_var(--marca-fuerte)]"
              : "border-borde bg-white text-texto shadow-[0_6px_0_0_var(--borde)] hover:border-marca hover:bg-cielo-suave";
            return (
              <button
                key={o}
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                role="radio"
                aria-checked={activa}
                tabIndex={elegidaIndice < 0 ? (i === 0 ? 0 : -1) : activa ? 0 : -1}
                disabled={bloqueado}
                onClick={() => onCambio(o)}
                onKeyDown={(e) => teclas(e, i)}
                className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-lg font-semibold transition-[transform,background-color] active:translate-y-1 disabled:cursor-default ${tono}`}
              >
                <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-lg border text-sm ${activa && correcta == null ? "border-white/50" : "border-borde text-suave"}`}>{i + 1}</span>
                <span lang="en">{o}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 text-suave">Escuchá el audio y después elegí la opción.</p>
      )}
    </div>
  );
}

function Completar({ ejercicio, valor, onCambio, bloqueado, correcta, enfocar, pregunta }: PropsRespuesta & { pregunta: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (enfocar) ref.current?.focus(); }, [enfocar]);
  const partes = partirHueco(pregunta);
  const borde = correcta === true ? "border-exito text-exito" : correcta === false ? "border-alerta text-alerta" : "border-cielo focus:border-marca";
  const input = (
    <input
      ref={ref}
      lang="en"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      disabled={bloqueado}
      aria-label={partes ? "Completá el hueco" : "Tu respuesta"}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      maxLength={200}
      size={Math.max(6, valor.length + 1)}
      className={`mx-1 inline-block max-w-full border-b-4 bg-transparent px-1 text-center font-bold outline-none ${borde} ${partes ? "" : "w-full text-left"}`}
    />
  );
  const banco = useMemo(() => mezclar(ejercicio.opciones, ejercicio.id), [ejercicio.opciones, ejercicio.id]);
  return (
    <div>
      {partes ? (
        <p lang="en" className="text-2xl font-bold leading-loose text-marca-fuerte sm:text-3xl">{partes[0]}{input}{partes[1]}</p>
      ) : (
        <>
          <p lang="en" className="text-2xl font-bold leading-snug text-marca-fuerte sm:text-3xl">{pregunta}</p>
          <div className="mt-5 rounded-2xl border-2 border-borde bg-white px-3 py-2 text-xl">{input}</div>
        </>
      )}
      {banco.length ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-suave">Pistas: tocá una para usarla</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {banco.map((o) => (
              <button key={o} type="button" lang="en" disabled={bloqueado} onClick={() => { onCambio(o); ref.current?.focus(); }}
                className="min-h-11 rounded-xl border-2 border-borde bg-white px-4 font-semibold shadow-[0_4px_0_0_var(--borde)] hover:border-marca active:translate-y-0.5">
                {o}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-xs text-suave">No importan las mayúsculas ni los signos de puntuación.</p>
    </div>
  );
}

function Ordenar({ ejercicio, onCambio, bloqueado, correcta, enfocar, pregunta }: PropsRespuesta & { pregunta: string }) {
  // Cada ficha se identifica por su posición: puede haber palabras repetidas.
  const fichas = useMemo(() => mezclar(ejercicio.opciones.map((p, i) => ({ p, i })), ejercicio.id), [ejercicio.opciones, ejercicio.id]);
  const [elegidas, setElegidas] = useState<number[]>([]);
  const refBanco = useRef<HTMLDivElement>(null);
  useEffect(() => { if (enfocar) refBanco.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [enfocar]);

  function actualizar(n: number[]) {
    setElegidas(n);
    onCambio(n.map((i) => ejercicio.opciones[i]).join(" "));
  }
  const frase = elegidas.map((i) => ejercicio.opciones[i]).join(" ");
  const tono = correcta === true ? "border-exito bg-exito-suave" : correcta === false ? "border-alerta bg-alerta-suave" : "border-cielo bg-cielo-suave/50";

  return (
    <div>
      <p className="text-xl font-bold leading-snug text-marca-fuerte sm:text-2xl">{pregunta}</p>
      <div className={`mt-5 flex min-h-20 flex-wrap content-start items-start gap-2 rounded-3xl border-2 border-dashed p-3 ${tono}`} aria-label="Tu frase">
        {elegidas.length === 0 ? <span className="self-center px-2 text-suave">Tocá las palabras en orden para armar la frase.</span> : null}
        {elegidas.map((i, pos) => (
          <button key={i} type="button" lang="en" disabled={bloqueado} onClick={() => actualizar(elegidas.filter((_, k) => k !== pos))}
            aria-label={`${ejercicio.opciones[i]} (quitar)`}
            className="pr-ficha min-h-12 rounded-xl border-2 border-marca bg-white px-4 text-lg font-semibold text-marca shadow-[0_4px_0_0_var(--marca)] active:translate-y-0.5">
            {ejercicio.opciones[i]}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{frase ? `Tu frase: ${frase}` : ""}</p>
      <div ref={refBanco} className="mt-5 flex flex-wrap gap-2" aria-label="Palabras disponibles">
        {fichas.map(({ p, i }) => {
          const usada = elegidas.includes(i);
          return (
            <button key={i} type="button" lang="en" disabled={bloqueado || usada} onClick={() => actualizar([...elegidas, i])}
              aria-hidden={usada || undefined} tabIndex={usada ? -1 : 0}
              className={`min-h-12 rounded-xl border-2 px-4 text-lg font-semibold transition-opacity ${usada ? "border-transparent bg-pizarra text-transparent shadow-none" : "border-borde bg-white text-texto shadow-[0_4px_0_0_var(--borde)] hover:border-marca active:translate-y-0.5"}`}>
              {p}
            </button>
          );
        })}
      </div>
      {elegidas.length && !bloqueado ? (
        <button type="button" onClick={() => actualizar([])} className="mt-3 min-h-11 text-sm font-semibold text-marca underline-offset-4 hover:underline">
          Empezar de nuevo
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Devolución: aparece después de comprobar.                           */
/* ------------------------------------------------------------------ */

const BIEN = ["¡Bien!", "¡Excelente!", "¡Eso es!", "¡Muy bien!", "¡Perfecto!"];
const CASI = ["Casi", "No era esa, pero vas bien", "Esta cuesta un poco más"];

export function Devolucion({ correcta, respuesta, explicacion, xp, n, onContinuar, refBoton, textoBoton = "Continuar", escucharRespuesta }: {
  correcta: boolean; respuesta: string; explicacion: string | null; xp: number; n: number;
  onContinuar: () => void; refBoton?: RefObject<HTMLButtonElement | null>; textoBoton?: string; escucharRespuesta?: boolean;
}) {
  const voz = useMemo(() => escucharRespuesta && hayVoz(), [escucharRespuesta]);
  return (
    <div className={`pr-aparece relative rounded-3xl border-2 p-5 sm:p-6 ${correcta ? "border-exito/30 bg-exito-suave" : "border-alerta/30 bg-alerta-suave"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`flex items-center gap-2 text-2xl font-extrabold ${correcta ? "text-exito" : "text-alerta"}`}>
          <span aria-hidden className="grid size-9 place-items-center rounded-full bg-white text-xl">{correcta ? "✓" : "↻"}</span>
          {correcta ? BIEN[n % BIEN.length] : CASI[n % CASI.length]}
        </p>
        {correcta && xp > 0 ? (
          <span className="pr-xp-sube rounded-full bg-white px-3 py-1 text-lg font-extrabold text-exito shadow" aria-hidden>+{xp} XP</span>
        ) : null}
      </div>
      {correcta ? (
        xp > 0 ? null : <p className="mt-2 text-sm text-texto">Este ya lo habías resuelto hoy: suma práctica, pero no vuelve a sumar XP.</p>
      ) : (
        <p className="mt-2 text-texto">La respuesta es: <strong lang="en" className="text-lg">{respuesta}</strong></p>
      )}
      {explicacion ? <p className="mt-2 text-texto/90">{explicacion}</p> : null}
      {!correcta ? <p className="mt-2 text-sm text-suave">Lo vas a volver a ver en otra lección para afianzarlo.</p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button ref={refBoton} type="button" onClick={onContinuar}
          className={`inline-flex min-h-14 flex-1 items-center justify-center rounded-full px-8 text-lg font-bold text-white sm:flex-none ${correcta ? "bg-exito shadow-[0_6px_0_0_#0c4a27] hover:bg-[#0f5a30]" : "bg-marca shadow-[0_6px_0_0_var(--marca-fuerte)] hover:bg-marca-fuerte"} active:translate-y-1`}>
          {textoBoton}
        </button>
        {voz ? (
          <button type="button" onClick={() => hablar(respuesta)} className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-marca bg-white px-4 font-semibold text-marca">
            <span aria-hidden>🔊</span> Escuchar la frase
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Probador: vista previa para docentes (corrige localmente).          */
/* ------------------------------------------------------------------ */

export function Probador({ ejercicio }: { ejercicio: EjercicioLeccion & { respuesta: string; explicacion: string | null } }) {
  const [valor, setValor] = useState("");
  const [resultado, setResultado] = useState<boolean | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const valido = ejercicio.respuesta.trim() && ejercicio.enunciado.trim();
  if (!valido) return <p className="text-sm text-suave">Completá el enunciado y la respuesta para ver la vista previa.</p>;
  const reiniciar = () => { setValor(""); setResultado(null); setVuelta((v) => v + 1); };
  return (
    <div className="rounded-3xl bg-white p-4 sm:p-6">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-suave">Así lo ve el estudiante</p>
      <Respuesta key={`${vuelta}-${ejercicio.tipo}-${ejercicio.opciones.join("|")}`} ejercicio={ejercicio} valor={valor} onCambio={setValor} bloqueado={resultado !== null} correcta={resultado} />
      <div className="mt-6">
        {resultado === null ? (
          <button type="button" disabled={!valor.trim()} onClick={() => setResultado(normalizar(valor) === normalizar(ejercicio.respuesta))}
            className="inline-flex min-h-12 items-center rounded-full bg-acento px-6 font-bold text-white disabled:opacity-50">
            Comprobar
          </button>
        ) : (
          <Devolucion correcta={resultado} respuesta={ejercicio.respuesta} explicacion={ejercicio.explicacion} xp={xpDe(ejercicio.dificultad)} n={0}
            onContinuar={reiniciar} textoBoton="Probar de nuevo" escucharRespuesta={ejercicio.tipo === "ordenar"} />
        )}
      </div>
    </div>
  );
}
