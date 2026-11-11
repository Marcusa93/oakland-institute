"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIdioma } from "./idioma";

const LETRAS = "abcdefghijklmnopqrstuvwxyz";
const PASOS = 18;

function suscribirMovimiento(avisar: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

export function useMovimientoReducido() {
  return useSyncExternalStore(
    suscribirMovimiento,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export interface Letra { c: string; fija: boolean }

/** Las letras se "traducen" de izquierda a derecha. Determinístico: sin azar en el render. */
function mezclar(texto: string, paso: number): Letra[] {
  return [...texto].map((c, i) => {
    if (!/[a-zñáéíóú]/i.test(c) || i < (paso / PASOS) * texto.length) return { c, fija: true };
    return { c: LETRAS[(i * 7 + paso * 11 + c.charCodeAt(0)) % LETRAS.length], fija: false };
  });
}

/** Devuelve el texto con la animación de mezcla cada vez que cambia. */
export function useTraduccion(texto: string, animarAlInicio = false): Letra[] {
  const reducido = useMovimientoReducido();
  const [estado, setEstado] = useState({ texto, paso: animarAlInicio ? 0 : PASOS });
  const primera = useRef(!animarAlInicio);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (reducido) return;
    let paso = 0;
    const t = window.setInterval(() => {
      paso += 1;
      setEstado({ texto, paso });
      if (paso >= PASOS) window.clearInterval(t);
    }, 45);
    return () => window.clearInterval(t);
  }, [texto, reducido]);

  if (reducido) return mezclar(texto, PASOS);
  return mezclar(texto, estado.texto === texto ? estado.paso : 0);
}

export function Letras({ letras }: { letras: Letra[] }) {
  return <>{letras.map((l, i) => <span key={i} className={l.fija ? undefined : "letra-mezcla"}>{l.c}</span>)}</>;
}

/**
 * Texto bilingüe. Muestra el idioma elegido para la página y, al apuntar,
 * enfocar o tocar el elemento que lo contiene (botón, enlace, título…),
 * muestra el otro con un fundido. Hay una pequeña espera al entrar y al
 * salir para que el cursor que pasa de largo no haga parpadear nada.
 * `activo` fuerza el otro idioma (por ejemplo, una opción seleccionada).
 */
const ESPERA_ENTRAR = 180;
const ESPERA_SALIR = 380;

export function Traducible({ es, en, activo, className = "" }: { es: string; en: string; activo?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { idioma } = useIdioma();
  const [apuntado, setApuntado] = useState(false);
  const otro = activo || apuntado;
  const muestra: "es" | "en" = otro ? (idioma === "es" ? "en" : "es") : idioma;

  useEffect(() => {
    const raiz = ref.current?.closest<HTMLElement>("a, button, summary, h2, h3, li, label, [data-traducir]") ?? ref.current?.parentElement;
    if (!raiz) return;
    // En botones y enlaces el toque ya hace su acción: ahí se traduce
    // manteniendo el dedo apretado. En títulos y textos alcanza un toque.
    const interactivo = raiz.matches("a, button, summary, label");
    let t: number | undefined;
    let sostenido: number | undefined;
    let ultimoToque = 0;
    let inicio: { x: number; y: number } | null = null;
    let fueSostenido = false;

    const programar = (valor: boolean, ms: number) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setApuntado(valor), ms);
    };

    // Mouse y teclado: como antes.
    const entrar = (e: Event) => {
      if (e instanceof PointerEvent && e.pointerType === "touch") return;
      if (e.type === "focusin" && Date.now() - ultimoToque < 800) return; // el toque también enfoca
      programar(true, ESPERA_ENTRAR);
    };
    const salir = (e: Event) => {
      if (e instanceof PointerEvent && e.pointerType === "touch") return;
      programar(false, ESPERA_SALIR);
    };

    // Táctil.
    const tocar = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      ultimoToque = Date.now();
      inicio = { x: e.clientX, y: e.clientY };
      fueSostenido = false;
      if (interactivo) {
        window.clearTimeout(sostenido);
        sostenido = window.setTimeout(() => {
          fueSostenido = true;
          window.clearTimeout(t);
          setApuntado(true);
          navigator.vibrate?.(10);
        }, 450);
      }
    };
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !inicio) return;
      // Si el dedo se desplaza, es scroll: no se traduce.
      if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 10) {
        window.clearTimeout(sostenido);
        inicio = null;
      }
    };
    const soltar = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      window.clearTimeout(sostenido);
      if (interactivo) {
        if (fueSostenido) programar(false, 1600);
      } else if (inicio) {
        setApuntado((v) => !v);
        programar(false, 4000);
      }
      inicio = null;
    };
    const cancelar = () => {
      window.clearTimeout(sostenido);
      inicio = null;
    };
    // Después de un toque sostenido no se dispara la acción del botón.
    const clic = (e: MouseEvent) => {
      if (fueSostenido) {
        e.preventDefault();
        e.stopPropagation();
        fueSostenido = false;
      }
    };
    const menuContextual = (e: Event) => {
      if (interactivo && Date.now() - ultimoToque < 1500) e.preventDefault();
    };

    if (interactivo) {
      raiz.style.setProperty("-webkit-touch-callout", "none");
      raiz.style.userSelect = "none";
    }
    raiz.addEventListener("pointerenter", entrar);
    raiz.addEventListener("pointerleave", salir);
    raiz.addEventListener("focusin", entrar);
    raiz.addEventListener("focusout", salir);
    raiz.addEventListener("pointerdown", tocar);
    raiz.addEventListener("pointermove", mover);
    raiz.addEventListener("pointerup", soltar);
    raiz.addEventListener("pointercancel", cancelar);
    raiz.addEventListener("click", clic, true);
    raiz.addEventListener("contextmenu", menuContextual);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(sostenido);
      raiz.removeEventListener("pointerenter", entrar);
      raiz.removeEventListener("pointerleave", salir);
      raiz.removeEventListener("focusin", entrar);
      raiz.removeEventListener("focusout", salir);
      raiz.removeEventListener("pointerdown", tocar);
      raiz.removeEventListener("pointermove", mover);
      raiz.removeEventListener("pointerup", soltar);
      raiz.removeEventListener("pointercancel", cancelar);
      raiz.removeEventListener("click", clic, true);
      raiz.removeEventListener("contextmenu", menuContextual);
    };
  }, []);

  const capa = "col-start-1 row-start-1 transition-[opacity,transform,filter] duration-500 ease-out motion-reduce:transition-none";
  const visible = "opacity-100 translate-y-0 blur-0";
  const oculto = "pointer-events-none opacity-0 translate-y-[0.3em] blur-[3px]";
  return (
    <span ref={ref} className={`inline-grid ${className}`}>
      {/* Para lectores de pantalla: el idioma de la página, sin el efecto. */}
      <span className="sr-only" lang={idioma}>{idioma === "es" ? es : en}</span>
      <span aria-hidden lang="es" className={`${capa} ${muestra === "es" ? visible : oculto}`}>{es}</span>
      <span aria-hidden lang="en" className={`${capa} ${muestra === "en" ? visible : oculto}`}>{en}</span>
    </span>
  );
}
