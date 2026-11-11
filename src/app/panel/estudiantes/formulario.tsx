"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import type { Resultado } from "@/app/panel/acciones";
import { crearEstudiante, crearResponsableEInvitar, type ResultadoAlta } from "./acciones";

type Accion = (previo: Resultado | null, formData: FormData) => Promise<Resultado>;

/**
 * Formulario genérico: recibe una server action y los campos como hijos.
 * Muestra el resultado con un aviso que anuncian los lectores de pantalla.
 */
export function Formulario({ accion, children, boton, enviando = "Guardando…", variante = "primario", className = "grid gap-3 sm:grid-cols-2" }: {
  accion: Accion; children?: ReactNode; boton: string; enviando?: string;
  variante?: "primario" | "secundario" | "peligro"; className?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} className={className}>
      {children}
      <div className="flex items-end">
        <Boton type="submit" variante={variante} disabled={pendiente}>{pendiente ? enviando : boton}</Boton>
      </div>
      {estado ? <div className="col-span-full"><Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso></div> : null}
    </form>
  );
}

function CamposPersona({ prefijo, valores }: { prefijo: string; valores?: Record<string, string> }) {
  const v = (k: string) => valores?.[k] ?? "";
  return (
    <>
      <Campo id={`${prefijo}-apellidos`} name="apellidos" etiqueta="Apellidos" required maxLength={80} defaultValue={v("apellidos")} autoComplete="off" />
      <Campo id={`${prefijo}-nombres`} name="nombres" etiqueta="Nombres" required maxLength={80} defaultValue={v("nombres")} autoComplete="off" />
      <Selector id={`${prefijo}-tipo`} name="tipo_documento" etiqueta="Tipo de documento" defaultValue={v("tipo_documento") || "DNI"}>
        <option value="DNI">DNI</option>
        <option value="PASAPORTE">Pasaporte</option>
        <option value="OTRO">Otro</option>
      </Selector>
      <Campo id={`${prefijo}-documento`} name="numero_documento" etiqueta="Número de documento" maxLength={20} inputMode="numeric" defaultValue={v("numero_documento")}
        ayuda="Opcional. Sirve para detectar si la persona ya está cargada." autoComplete="off" />
      <Campo id={`${prefijo}-email`} name="email" type="email" etiqueta="Email" maxLength={120} defaultValue={v("email")} autoComplete="off" />
      <Campo id={`${prefijo}-telefono`} name="telefono" type="tel" etiqueta="Teléfono" maxLength={40} defaultValue={v("telefono")} autoComplete="off" />
    </>
  );
}

function Coincidencias({ estado }: { estado: ResultadoAlta }) {
  if (!estado.coincidencias?.length) return null;
  return (
    <div className="col-span-full rounded-base border border-borde bg-fondo p-3 text-sm">
      <p className="font-semibold">Personas ya cargadas con ese nombre y apellido:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {estado.coincidencias.map((c) => (
          <li key={c.personaId}>
            {c.nombre}
            {c.estudianteId
              ? <> — estudiante {c.legajo}. <Link className="font-semibold text-marca underline" href={`/panel/estudiantes/${c.estudianteId}`}>Ver ficha</Link></>
              : " — cargada como persona, sin legajo de estudiante."}
          </li>
        ))}
      </ul>
      <label className="mt-3 flex min-h-11 items-center gap-2 font-medium">
        <input type="checkbox" name="confirmar" /> Es otra persona: crear igual
      </label>
    </div>
  );
}

export function AltaEstudiante() {
  const [estado, enviar, pendiente] = useActionState(crearEstudiante, null);
  const valores = estado && !estado.ok ? estado.valores : undefined;
  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <CamposPersona prefijo="alta" valores={valores} />
      <Campo id="alta-nacimiento" name="fecha_nacimiento" type="date" etiqueta="Fecha de nacimiento" defaultValue={valores?.fecha_nacimiento ?? ""} />
      {estado ? <Coincidencias estado={estado} /> : null}
      {estado?.existente && !estado.existente.estudianteId ? (
        <div className="col-span-full rounded-base border border-borde bg-fondo p-3 text-sm">
          <label className="flex min-h-11 items-center gap-2 font-medium">
            <input type="checkbox" name="usar_persona" value={estado.existente.personaId} />
            Es la misma persona: darle un legajo de estudiante a {estado.existente.nombre}
          </label>
        </div>
      ) : null}
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <Boton type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Dar de alta"}</Boton>
        {estado?.existente?.estudianteId
          ? <Link className="text-sm font-semibold text-marca underline" href={`/panel/estudiantes/${estado.existente.estudianteId}`}>Ver la ficha de {estado.existente.nombre}</Link>
          : null}
        {estado?.ok && estado.estudianteId
          ? <Link className="text-sm font-semibold text-marca underline" href={`/panel/estudiantes/${estado.estudianteId}`}>Abrir la ficha</Link>
          : null}
      </div>
      {estado ? <div className="col-span-full"><Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso></div> : null}
    </form>
  );
}

export function NuevoResponsable({ estudianteId }: { estudianteId: string }) {
  const [estado, enviar, pendiente] = useActionState(crearResponsableEInvitar, null);
  const valores = estado && !estado.ok ? estado.valores : undefined;
  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="estudiante" value={estudianteId} />
      <CamposPersona prefijo="resp" valores={valores} />
      <Campo id="resp-parentesco" name="parentesco" etiqueta="Parentesco" maxLength={60} placeholder="Madre, padre, tutor…" defaultValue={valores?.parentesco ?? ""} />
      {estado ? <Coincidencias estado={estado} /> : null}
      <div className="col-span-full">
        <Boton type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Crear persona e invitar"}</Boton>
      </div>
      {estado ? <div className="col-span-full"><Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso></div> : null}
    </form>
  );
}
