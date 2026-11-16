"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Resultado } from "@/app/panel/acciones";
import { Aviso, Boton, Campo } from "@/componentes/ui";
import { abrirClase, cancelarClase, guardarAsistencia } from "./acciones";
import { ESTADOS_ASISTENCIA, type EstadoAsistencia } from "./util";

const SIN_CONEXION = "No pudimos conectar con el servidor. Lo que cargaste sigue en pantalla: revisá tu conexión y volvé a tocar el botón.";

/** Botón "Abrir clase de hoy". Si hoy no hay horario, pide las horas. */
export function AbrirClase({ comisionId, horarioHoy }: { comisionId: string; horarioHoy: { inicio: string; fin: string } | null }) {
  const router = useRouter();
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      try {
        const r = await abrirClase({ comision: comisionId, hora_inicio: horarioHoy ? "" : inicio, hora_fin: horarioHoy ? "" : fin });
        if (r.ok && r.claseId) router.push(`/panel/mis-comisiones/${comisionId}?clase=${r.claseId}`);
        else setError(r.mensaje);
      } catch {
        setError(SIN_CONEXION);
      }
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      {horarioHoy ? (
        <p className="text-sm text-suave">Horario de hoy: de {horarioHoy.inicio} a {horarioHoy.fin}.</p>
      ) : (
        <>
          <p className="text-sm text-suave">Hoy esta comisión no tiene horario cargado. Indicá a qué hora es la clase.</p>
          <div className="grid max-w-sm grid-cols-2 gap-3">
            <Campo id="abrir-inicio" type="time" etiqueta="Hora de inicio" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <Campo id="abrir-fin" type="time" etiqueta="Hora de fin" required value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </>
      )}
      <Boton type="submit" disabled={abriendo} className="w-full sm:w-auto">{abriendo ? "Abriendo…" : "Abrir clase de hoy"}</Boton>
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
    </form>
  );
}

/** Una clase de un día anterior que quedó sin cargar: tomar asistencia o registrar que no se dictó. */
export function ClasePendiente({ comisionId, fecha, etiqueta, inicio, fin }: { comisionId: string; fecha: string; etiqueta: string; inicio: string; fin: string }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function tomar() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await abrirClase({ comision: comisionId, fecha, hora_inicio: inicio, hora_fin: fin });
        if (r.ok && r.claseId) router.push(`/panel/mis-comisiones/${comisionId}?clase=${r.claseId}`);
        else setError(r.mensaje);
      } catch { setError(SIN_CONEXION); }
    });
  }
  function noHubo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      try {
        const r = await cancelarClase({ comision: comisionId, clase: "", fecha, hora_inicio: inicio, hora_fin: fin, motivo });
        if (r.ok) router.refresh(); else setError(r.mensaje);
      } catch { setError(SIN_CONEXION); }
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">{etiqueta} · {inicio} a {fin}</p>
        <div className="flex flex-wrap gap-2">
          <Boton type="button" onClick={tomar} disabled={ocupado}>{ocupado && !cancelando ? "Abriendo…" : "Tomar asistencia"}</Boton>
          <Boton type="button" variante="secundario" onClick={() => setCancelando((v) => !v)} aria-expanded={cancelando}>No hubo clase</Boton>
        </div>
      </div>
      {cancelando ? (
        <form onSubmit={noHubo} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <Campo id={`motivo-${fecha}-${inicio}`} etiqueta="Motivo" required minLength={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Feriado, docente con licencia…" />
          <Boton type="submit" variante="secundario" disabled={ocupado}>{ocupado ? "Guardando…" : "Registrar"}</Boton>
        </form>
      ) : null}
      {error ? <div className="mt-2"><Aviso tono="peligro">{error}</Aviso></div> : null}
    </li>
  );
}

/** Cargar la asistencia de cualquier día anterior (por ejemplo, si no hubo señal ese día). */
export function OtraFecha({ comisionId, desde, hasta }: { comisionId: string; desde: string; hasta: string }) {
  const router = useRouter();
  const [fecha, setFecha] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      try {
        const r = await abrirClase({ comision: comisionId, fecha, hora_inicio: inicio, hora_fin: fin });
        if (r.ok && r.claseId) router.push(`/panel/mis-comisiones/${comisionId}?clase=${r.claseId}`);
        else setError(r.mensaje);
      } catch { setError(SIN_CONEXION); }
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <Campo id="otra-fecha" type="date" etiqueta="Día de la clase" required min={desde} max={hasta} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      <Campo id="otra-inicio" type="time" etiqueta="Inicio (si no es el habitual)" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      <Campo id="otra-fin" type="time" etiqueta="Fin" value={fin} onChange={(e) => setFin(e.target.value)} required={Boolean(inicio)} />
      <Boton type="submit" disabled={abriendo}>{abriendo ? "Abriendo…" : "Abrir esa clase"}</Boton>
      {error ? <div className="sm:col-span-4"><Aviso tono="peligro">{error}</Aviso></div> : null}
    </form>
  );
}

/** Marcar como cancelada una clase sin asistencia. */
export function CancelarClase({ comisionId, claseId }: { comisionId: string; claseId: string }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      try {
        const r = await cancelarClase({ comision: comisionId, clase: claseId, fecha: "", hora_inicio: "", hora_fin: "", motivo });
        if (r.ok) router.push(`/panel/mis-comisiones/${comisionId}`); else setError(r.mensaje);
      } catch { setError(SIN_CONEXION); }
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <Campo id="cancelar-motivo" etiqueta="Motivo" required minLength={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Feriado, docente con licencia…" />
      <Boton type="submit" variante="secundario" disabled={guardando}>{guardando ? "Guardando…" : "No hubo clase"}</Boton>
      {error ? <div className="sm:col-span-2"><Aviso tono="peligro">{error}</Aviso></div> : null}
    </form>
  );
}

export interface FilaAsistencia {
  matriculaId: string;
  nombre: string;
  estado: EstadoAsistencia | null;
  observacion: string;
}

type Marcas = Record<string, { estado: EstadoAsistencia | null; observacion: string }>;

/**
 * Toma de asistencia. Todo lo marcado vive en el estado del componente: si el
 * guardado falla (sin señal, error del servidor) no se pierde nada y se puede
 * reintentar con el mismo botón.
 */
export function TomaAsistencia({ claseId, temaInicial, filas }: { claseId: string; temaInicial: string; filas: FilaAsistencia[] }) {
  const [marcas, setMarcas] = useState<Marcas>(() =>
    Object.fromEntries(filas.map((f) => [f.matriculaId, { estado: f.estado, observacion: f.observacion }])));
  const [tema, setTema] = useState(temaInicial);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [guardando, iniciar] = useTransition();

  // Aviso del navegador si se intenta salir con cambios sin guardar.
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const cambiar = (id: string, cambio: Partial<Marcas[string]>) => {
    setMarcas((m) => ({ ...m, [id]: { ...m[id], ...cambio } }));
    setSinGuardar(true);
    setResultado(null);
  };
  const marcadas = filas.filter((f) => marcas[f.matriculaId]?.estado);
  const faltan = filas.length - marcadas.length;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setResultado(null);
    iniciar(async () => {
      try {
        const r = await guardarAsistencia({
          clase: claseId,
          tema,
          filas: marcadas.map((f) => ({ matricula: f.matriculaId, estado: marcas[f.matriculaId].estado, observacion: marcas[f.matriculaId].observacion })),
        });
        setResultado(r.ok ? r : { ok: false, mensaje: `${r.mensaje} Lo que marcaste sigue en pantalla: podés reintentar.` });
        if (r.ok) setSinGuardar(false);
      } catch {
        setResultado({ ok: false, mensaje: SIN_CONEXION });
      }
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <Campo id="tema" etiqueta="Tema de la clase" ayuda="Opcional. Queda registrado en la clase." maxLength={300}
        value={tema} onChange={(e) => { setTema(e.target.value); setSinGuardar(true); setResultado(null); }} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-suave" aria-live="polite">
          {faltan === 0 ? "Todos los estudiantes tienen asistencia marcada." : `Faltan marcar ${faltan} de ${filas.length}.`}
        </p>
        <Boton type="button" variante="secundario" disabled={faltan === 0}
          onClick={() => {
            setMarcas((m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, v.estado ? v : { ...v, estado: "presente" as const }])));
            setSinGuardar(true);
            setResultado(null);
          }}>
          Marcar presentes a los que faltan
        </Boton>
      </div>

      <ol className="space-y-3">
        {filas.map((f, i) => {
          const marca = marcas[f.matriculaId];
          return (
            <li key={f.matriculaId} className="rounded-base border border-borde bg-superficie p-3 sm:p-4">
              <fieldset>
                <legend className="mb-2 font-semibold">
                  <span className="text-suave">{i + 1}. </span>{f.nombre}
                </legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ESTADOS_ASISTENCIA.map(([valor, etiqueta]) => (
                    <label key={valor}
                      className="flex min-h-12 cursor-pointer items-center gap-2 rounded-base border border-borde px-3 text-sm font-medium has-[:checked]:border-marca has-[:checked]:bg-marca-suave has-[:checked]:text-marca-fuerte has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-marca">
                      <input type="radio" className="size-5 accent-[var(--marca)]" name={`asistencia-${f.matriculaId}`} value={valor}
                        checked={marca?.estado === valor} onChange={() => cambiar(f.matriculaId, { estado: valor })} />
                      {etiqueta}
                    </label>
                  ))}
                </div>
              </fieldset>
              <details className="mt-2 text-sm" open={Boolean(f.observacion) || undefined}>
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-marca">Observación (opcional)</summary>
                <Campo id={`obs-${f.matriculaId}`} etiqueta={`Observación sobre ${f.nombre}`} maxLength={500}
                  ayuda="Nota breve sobre la asistencia (por ejemplo, el motivo de la ausencia)."
                  value={marca?.observacion ?? ""} onChange={(e) => cambiar(f.matriculaId, { observacion: e.target.value })} />
              </details>
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-borde bg-fondo px-4 py-3">
        {resultado ? <Aviso tono={resultado.ok ? "exito" : "peligro"}>{resultado.mensaje}</Aviso> : null}
        {sinGuardar && !resultado ? <p className="text-sm text-alerta">Tenés cambios sin guardar.</p> : null}
        <Boton type="submit" disabled={guardando || marcadas.length === 0} className="w-full sm:w-auto">
          {guardando ? "Guardando…" : resultado && !resultado.ok ? "Reintentar guardado" : "Guardar asistencia"}
        </Boton>
      </div>
    </form>
  );
}
