"use client";

import { useState, useTransition } from "react";
import type { Resultado } from "@/app/panel/acciones";
import { AreaTexto, Aviso, Boton, Campo } from "@/componentes/ui";
import { cambiarCompartida, crearEvaluacion } from "./acciones";
import { CRITERIOS, ESCALA, type ClaveCriterio } from "./criterios";

const SIN_CONEXION = "No pudimos conectar con el servidor. Lo que cargaste sigue en pantalla: revisá tu conexión y volvé a intentar.";

export function FormularioEvaluacion({ docente, periodoSugerido }: { docente: string; periodoSugerido: string }) {
  const [periodo, setPeriodo] = useState(periodoSugerido);
  const [puntajes, setPuntajes] = useState<Partial<Record<ClaveCriterio, number>>>({});
  const [fortalezas, setFortalezas] = useState("");
  const [aMejorar, setAMejorar] = useState("");
  const [compartida, setCompartida] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [guardando, iniciar] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setResultado(null);
    if (CRITERIOS.some((c) => !puntajes[c.clave])) { setResultado({ ok: false, mensaje: "Puntuá todos los criterios del 1 al 5." }); return; }
    iniciar(async () => {
      try {
        const r = await crearEvaluacion({ docente, periodo, puntajes: puntajes as Record<ClaveCriterio, number>, fortalezas, a_mejorar: aMejorar, compartida });
        setResultado(r);
        if (r.ok) { setPuntajes({}); setFortalezas(""); setAMejorar(""); setCompartida(false); }
      } catch {
        setResultado({ ok: false, mensaje: SIN_CONEXION });
      }
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-5">
      <Campo id="periodo" etiqueta="Período" required minLength={2} maxLength={60} value={periodo} onChange={(e) => setPeriodo(e.target.value)} ayuda="Ej.: 2026 · 2.º cuatrimestre" />
      {CRITERIOS.map((c) => (
        <fieldset key={c.clave}>
          <legend className="font-semibold">{c.nombre}</legend>
          <p className="text-sm text-suave">{c.ayuda}</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5 sm:max-w-md">
            {ESCALA.map(([n, etiqueta]) => (
              <label key={n} title={etiqueta}
                className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-base border border-borde bg-superficie px-1 py-1 text-center has-[:checked]:border-marca has-[:checked]:bg-marca has-[:checked]:text-sobre-marca has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-marca">
                <input type="radio" name={`criterio-${c.clave}`} value={n} className="sr-only" checked={puntajes[c.clave] === n}
                  onChange={() => setPuntajes((p) => ({ ...p, [c.clave]: n }))} />
                <span className="text-lg font-bold leading-none">{n}</span>
                <span className="mt-0.5 hidden text-[0.65rem] leading-tight sm:block">{etiqueta}</span>
                <span className="sr-only sm:hidden">{etiqueta}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <AreaTexto id="fortalezas" etiqueta="Fortalezas" rows={3} maxLength={2000} value={fortalezas} onChange={(e) => setFortalezas(e.target.value)} />
      <AreaTexto id="a-mejorar" etiqueta="A mejorar" rows={3} maxLength={2000} value={aMejorar} onChange={(e) => setAMejorar(e.target.value)} />
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={compartida} onChange={(e) => setCompartida(e.target.checked)} />
        <span><span className="font-semibold">Compartir con el docente</span><span className="block text-sm text-suave">Si no la compartís, solo la ve dirección. Podés cambiarlo después.</span></span>
      </label>
      {resultado ? <Aviso tono={resultado.ok ? "exito" : "peligro"}>{resultado.mensaje}</Aviso> : null}
      <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar evaluación"}</Boton>
    </form>
  );
}

export function BotonCompartir({ id, docente, compartida }: { id: string; docente: string; compartida: boolean }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cambiando, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Boton type="button" variante="secundario" className="min-h-9" disabled={cambiando}
        onClick={() => iniciar(async () => {
          try { setResultado(await cambiarCompartida({ id, docente, compartida: !compartida })); } catch { setResultado({ ok: false, mensaje: SIN_CONEXION }); }
        })}>
        {cambiando ? "Guardando…" : compartida ? "Dejar de compartir" : "Compartir con el docente"}
      </Boton>
      {resultado && !resultado.ok ? <Aviso tono="peligro">{resultado.mensaje}</Aviso> : null}
    </div>
  );
}
