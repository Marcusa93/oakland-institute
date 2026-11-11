"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface EnlaceMenu { href: string; etiqueta: string; icono: string }
export interface SeccionMenu { titulo: string; enlaces: EnlaceMenu[] }

function activo(ruta: string, href: string) {
  return href === "/panel" ? ruta === "/panel" : ruta === href || ruta.startsWith(`${href}/`);
}

function Lista({ secciones, ruta }: { secciones: SeccionMenu[]; ruta: string }) {
  return (
    <div className="space-y-5">
      {secciones.map((s) => (
        <div key={s.titulo}>
          {s.titulo ? <p className="mb-1.5 px-3 text-xs font-semibold text-suave">{s.titulo}</p> : null}
          <ul className="space-y-0.5">
            {s.enlaces.map((e) => {
              const aqui = activo(ruta, e.href);
              return (
                <li key={e.href}>
                  <Link
                    href={e.href}
                    aria-current={aqui ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium transition-colors ${
                      aqui ? "bg-marca text-white" : "text-texto hover:bg-marca-suave"
                    }`}
                  >
                    <span aria-hidden className="w-5 text-center">{e.icono}</span>
                    {e.etiqueta}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Menú del panel agrupado por secciones. En escritorio es una barra lateral
 * fija; en celular, un botón "Menú" que abre un panel y se cierra al navegar.
 */
export function MenuPanel({ secciones }: { secciones: SeccionMenu[] }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const actual = secciones.flatMap((s) => s.enlaces).find((e) => activo(ruta, e.href));

  // Cerrar al cambiar de página.
  useEffect(() => {
    const t = window.setTimeout(() => setAbierto(false), 0);
    return () => window.clearTimeout(t);
  }, [ruta]);

  useEffect(() => {
    if (!abierto) return;
    const alEscape = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", alEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alEscape);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  return (
    <>
      {/* Celular y tablet */}
      <div className="border-b border-borde bg-superficie px-4 py-2 lg:hidden">
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls="menu-movil"
          onClick={() => setAbierto(true)}
          className="flex min-h-11 w-full items-center justify-between rounded-xl bg-pizarra px-4 font-semibold"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden>{actual?.icono ?? "☰"}</span>
            {actual?.etiqueta ?? "Menú"}
          </span>
          <span className="text-sm text-marca">Menú</span>
        </button>
      </div>
      {abierto ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú del panel" id="menu-movil">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <nav aria-label="Secciones" className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] overflow-y-auto bg-superficie p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-bold">Menú</p>
              <button type="button" onClick={() => setAbierto(false)} className="grid size-11 place-items-center rounded-full text-2xl hover:bg-pizarra" aria-label="Cerrar menú">×</button>
            </div>
            <Lista secciones={secciones} ruta={ruta} />
          </nav>
        </div>
      ) : null}

      {/* Escritorio */}
      <nav aria-label="Secciones" className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] w-60 shrink-0 self-start overflow-y-auto py-6 lg:block">
        <Lista secciones={secciones} ruta={ruta} />
      </nav>
    </>
  );
}
