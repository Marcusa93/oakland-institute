"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { borrarSuscripcion, guardarSuscripcion, probarNotificacion } from "@/app/panel/notificaciones/acciones";

/**
 * Notificaciones al celular de este dispositivo.
 *  · «aviso»: tarjeta en el inicio para activarlas (se puede cerrar).
 *  · «ajuste»: estado completo con activar, probar y desactivar (en Avisos).
 * Necesitan el service worker (solo en producción) y, en iPhone, que la app
 * esté instalada en la pantalla de inicio (iOS 16.4 o posterior).
 */

type Estado = "cargando" | "sin-soporte" | "instalar-ios" | "bloqueadas" | "apagadas" | "activas";

const CLAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const CLAVE_OCULTO = "oakland-notificaciones-oculto";

function claveBinaria(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

function esIosSinInstalar() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return ios && !nav.standalone && !window.matchMedia("(display-mode: standalone)").matches;
}

async function leerEstado(): Promise<Estado> {
  if (!CLAVE) return "sin-soporte";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return esIosSinInstalar() ? "instalar-ios" : "sin-soporte";
  }
  if (Notification.permission === "denied") return "bloqueadas";
  const registro = await navigator.serviceWorker.getRegistration("/");
  if (!registro) return "sin-soporte"; // desarrollo: no hay service worker
  const suscripcion = await registro.pushManager.getSubscription();
  return suscripcion && Notification.permission === "granted" ? "activas" : "apagadas";
}

function useNotificaciones() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const actualizar = useCallback(() => { leerEstado().then(setEstado, () => setEstado("sin-soporte")); }, []);
  useEffect(() => {
    let vivo = true;
    leerEstado().then((e) => { if (vivo) setEstado(e); }, () => { if (vivo) setEstado("sin-soporte"); });
    return () => { vivo = false; };
  }, []);
  return { estado, actualizar };
}

async function activar(): Promise<{ ok: boolean; mensaje: string }> {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    return { ok: false, mensaje: permiso === "denied" ? "Quedaron bloqueadas. Podés habilitarlas desde los ajustes del navegador." : "No se activaron." };
  }
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = (await registro.pushManager.getSubscription())
    ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(CLAVE) }));
  return guardarSuscripcion(suscripcion.toJSON(), navigator.userAgent);
}

const boton = "min-h-11 rounded-full px-5 font-semibold disabled:opacity-60";

/** Tarjeta del inicio: aparece solo si se pueden activar y todavía no están. */
export function AvisoNotificaciones() {
  const { estado, actualizar } = useNotificaciones();
  const oculto = useSyncExternalStore(() => () => {}, () => { try { return localStorage.getItem(CLAVE_OCULTO) === "1"; } catch { return false; } }, () => true);
  const [cerrado, setCerrado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  if (oculto || cerrado || estado !== "apagadas") return null;
  const cerrar = () => {
    try { localStorage.setItem(CLAVE_OCULTO, "1"); } catch { /* sin almacenamiento */ }
    setCerrado(true);
  };
  return (
    <div className="mb-6 rounded-[1.5rem] border border-borde bg-superficie p-4 sm:flex sm:items-center sm:gap-4 sm:p-5">
      <div className="flex items-center gap-4 sm:flex-1">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-cielo-suave text-2xl">🔔</span>
        <div className="min-w-0">
          <p className="font-bold">Enterate al momento</p>
          <p className="text-sm text-suave">Activá las notificaciones y te avisamos en el celular cuando haya un aviso, un mensaje, una actividad o material nuevo.</p>
          {mensaje ? <p className="mt-1 text-sm font-semibold text-peligro" role="status">{mensaje}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
        <button type="button" disabled={ocupado} onClick={() => empezar(async () => { const r = await activar(); if (!r.ok) setMensaje(r.mensaje); actualizar(); })}
          className={`${boton} flex-1 bg-marca text-sobre-marca hover:bg-marca-fuerte sm:flex-none`}>{ocupado ? "Activando…" : "Activar"}</button>
        <button type="button" onClick={cerrar} className={`${boton} text-sm text-marca hover:bg-marca-suave`}>Ahora no</button>
      </div>
    </div>
  );
}

/** Ajuste completo de este dispositivo (en la página de Avisos). */
export function AjusteNotificaciones() {
  const { estado, actualizar } = useNotificaciones();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, empezar] = useTransition();
  if (estado === "cargando" || estado === "sin-soporte") return null;

  const desactivar = () => empezar(async () => {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (suscripcion) {
      await borrarSuscripcion(suscripcion.endpoint);
      await suscripcion.unsubscribe();
    }
    setMensaje({ ok: true, texto: "Listo: este dispositivo ya no recibe notificaciones." });
    actualizar();
  });

  return (
    <div className="mb-6 rounded-[1.5rem] border border-borde bg-superficie p-4 sm:p-5">
      <p className="font-bold">🔔 Notificaciones en este dispositivo</p>
      {estado === "activas" ? (
        <>
          <p className="mt-1 text-sm text-suave">Activadas. Te avisamos de avisos, mensajes, actividades, devoluciones y material nuevo.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={ocupado} onClick={() => empezar(async () => { const r = await probarNotificacion(); setMensaje({ ok: r.ok, texto: r.mensaje }); })}
              className={`${boton} bg-marca text-sobre-marca hover:bg-marca-fuerte`}>Mandarme una de prueba</button>
            <button type="button" disabled={ocupado} onClick={desactivar} className={`${boton} border border-borde text-sm hover:bg-marca-suave`}>Desactivar</button>
          </div>
        </>
      ) : estado === "apagadas" ? (
        <>
          <p className="mt-1 text-sm text-suave">Desactivadas. Activalas para enterarte al momento, aunque tengas la app cerrada.</p>
          <button type="button" disabled={ocupado} onClick={() => empezar(async () => { const r = await activar(); setMensaje({ ok: r.ok, texto: r.mensaje }); actualizar(); })}
            className={`${boton} mt-3 bg-marca text-sobre-marca hover:bg-marca-fuerte`}>{ocupado ? "Activando…" : "Activar notificaciones"}</button>
        </>
      ) : estado === "bloqueadas" ? (
        <p className="mt-1 text-sm text-suave">Están bloqueadas para este sitio. Para habilitarlas: tocá el candado 🔒 junto a la dirección (o Ajustes → Notificaciones en el teléfono), permití las notificaciones de Oakland y volvé a abrir la app.</p>
      ) : (
        <p className="mt-1 text-sm text-suave">En iPhone, primero instalá la app: en Safari tocá Compartir → <strong>Agregar a inicio</strong>. Después abrila desde el ícono y activá las notificaciones acá.</p>
      )}
      {mensaje ? <p className={`mt-2 text-sm font-semibold ${mensaje.ok ? "text-exito" : "text-peligro"}`} role="status">{mensaje.texto}</p> : null}
    </div>
  );
}

/**
 * Al entrar al panel: si este teléfono ya tiene permiso, vuelve a asociar su
 * suscripción a la persona con sesión (cambio de cuenta, clave renovada).
 */
export function SincronizarNotificaciones() {
  useEffect(() => {
    if (!CLAVE || !("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
    try { if (sessionStorage.getItem("oakland-push-sync") === "1") return; } catch { /* sigue */ }
    navigator.serviceWorker.getRegistration("/").then(async (registro) => {
      const suscripcion = await registro?.pushManager.getSubscription();
      if (!suscripcion) return;
      await guardarSuscripcion(suscripcion.toJSON(), navigator.userAgent);
      try { sessionStorage.setItem("oakland-push-sync", "1"); } catch { /* sin almacenamiento */ }
    }).catch(() => {});
  }, []);
  return null;
}
