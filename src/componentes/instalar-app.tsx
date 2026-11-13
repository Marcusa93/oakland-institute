"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Instalar la app en el teléfono (o la compu).
 *  · Android / Chrome / Edge: el navegador avisa que se puede instalar
 *    (`beforeinstallprompt`, capturado por SCRIPT_INSTALACION apenas carga la
 *    página) y el botón abre su ventana de instalación.
 *  · iPhone / iPad (Safari): no hay ventana; se explica «Compartir → Agregar
 *    a inicio».
 *  · Ya instalada o navegador sin soporte: no se muestra nada.
 */

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
declare global {
  interface Window { __oaklandInstalar?: EventoInstalacion | null }
}

/** Va en el <body> del layout raíz: el aviso del navegador puede llegar antes que React. */
export const SCRIPT_INSTALACION = `addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__oaklandInstalar=e;dispatchEvent(new Event("oakland-instalacion"))});addEventListener("appinstalled",function(){window.__oaklandInstalar=null;dispatchEvent(new Event("oakland-instalacion"))});`;

type Estado = "nada" | "android" | "ios" | "instalada";

function suscribir(avisar: () => void) {
  window.addEventListener("oakland-instalacion", avisar);
  const modo = window.matchMedia("(display-mode: standalone)");
  modo.addEventListener("change", avisar);
  return () => {
    window.removeEventListener("oakland-instalacion", avisar);
    modo.removeEventListener("change", avisar);
  };
}

function estadoActual(): Estado {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia("(display-mode: standalone)").matches || nav.standalone) return "instalada";
  if (window.__oaklandInstalar) return "android";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "nada";
}

function useInstalacion() {
  return useSyncExternalStore(suscribir, estadoActual, () => "nada" as Estado);
}

const CLAVE_OCULTO = "oakland-instalar-oculto";
function leerOculto() {
  try { return localStorage.getItem(CLAVE_OCULTO) === "1"; } catch { return false; }
}

async function instalar() {
  const e = window.__oaklandInstalar;
  if (!e) return;
  await e.prompt();
  await e.userChoice.catch(() => null);
  window.__oaklandInstalar = null; // el aviso se usa una sola vez
  window.dispatchEvent(new Event("oakland-instalacion"));
}

/** En un portal: un encabezado con `backdrop-blur` atraparía el `position: fixed`. */
function PasosIos({ onCerrar }: { onCerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="ios-titulo" className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center" onClick={onCerrar}>
      <div className="w-full max-w-sm rounded-[1.5rem] bg-superficie p-5 text-texto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="ios-titulo" className="text-lg font-bold">Instalar en el iPhone</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Abrí esta página en <strong>Safari</strong>.</li>
          <li>Tocá <strong>Compartir</strong> <span aria-hidden>(el cuadrado con la flecha ↑)</span>.</li>
          <li>Elegí <strong>Agregar a inicio</strong> y tocá <strong>Agregar</strong>.</li>
        </ol>
        <p className="mt-3 text-sm text-suave">Va a aparecer el ícono de Oakland en la pantalla de inicio, como cualquier app.</p>
        <button type="button" autoFocus onClick={onCerrar} className="mt-4 min-h-11 w-full rounded-full bg-marca font-semibold text-sobre-marca">Entendido</button>
      </div>
    </div>,
    document.body,
  );
}

/** Botón compacto (encabezado de la portada). */
export function BotonInstalar({ className = "" }: { className?: string }) {
  const estado = useInstalacion();
  const [pasos, setPasos] = useState(false);
  if (estado !== "android" && estado !== "ios") return null;
  return (
    <>
      <button type="button" onClick={() => (estado === "android" ? instalar() : setPasos(true))}
        aria-label="Instalar la app"
        className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-borde bg-white px-3 font-semibold hover:border-marca ${className}`}>
        <span aria-hidden>📲</span><span aria-hidden className="hidden sm:inline">Instalar app</span>
      </button>
      {pasos ? <PasosIos onCerrar={() => setPasos(false)} /> : null}
    </>
  );
}

/** Aviso en el inicio del panel. Se puede cerrar y no vuelve a aparecer en ese teléfono. */
export function AvisoInstalar() {
  const estado = useInstalacion();
  const oculto = useSyncExternalStore(() => () => {}, leerOculto, () => true);
  const [cerrado, setCerrado] = useState(false);
  const [pasos, setPasos] = useState(false);
  if (oculto || cerrado || (estado !== "android" && estado !== "ios")) return null;
  const cerrar = () => {
    try { localStorage.setItem(CLAVE_OCULTO, "1"); } catch { /* sin almacenamiento: se cierra solo por ahora */ }
    setCerrado(true);
  };
  return (
    <div className="mb-6 rounded-[1.5rem] bg-marca p-4 text-sobre-marca sm:flex sm:items-center sm:gap-4 sm:p-5">
      <div className="flex items-center gap-4 sm:flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícono fijo y chico */}
        <img src="/iconos/icono-96.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="font-bold">Tené Oakland en tu celular</p>
          <p className="text-sm opacity-90">Instalala y abrila desde el inicio del teléfono, como cualquier app.</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
        <button type="button" onClick={() => (estado === "android" ? instalar() : setPasos(true))}
          className="min-h-11 flex-1 rounded-full bg-white px-5 font-semibold text-marca hover:bg-marca-suave sm:flex-none">Instalar</button>
        <button type="button" onClick={cerrar} className="min-h-11 rounded-full px-4 text-sm font-semibold hover:bg-white/10">Ahora no</button>
      </div>
      {pasos ? <PasosIos onCerrar={() => setPasos(false)} /> : null}
    </div>
  );
}

/** Registra el service worker (solo en producción: en desarrollo cachearía código viejo). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
