"use client";

import { Aviso, Boton, Campo } from "@/componentes/ui";
import { definirClave, ingresar, pedirRecuperacion, type EstadoIngreso } from "./acciones";
import { useFormulario } from "@/componentes/usar-formulario";

const inicial: EstadoIngreso = {};

export function FormularioIngreso({ volver }: { volver: string }) {
  const [estado, accion, enviando] = useFormulario(ingresar, inicial);
  return (
    <form {...accion} className="space-y-4">
      <input type="hidden" name="volver" value={volver} />
      <Campo id="email" name="email" type="email" etiqueta="Correo electrónico" autoComplete="username" required />
      <Campo id="clave" name="clave" type="password" etiqueta="Contraseña" autoComplete="current-password" required />
      {estado.mensaje ? <Aviso tono="peligro">{estado.mensaje}</Aviso> : null}
      <Boton type="submit" disabled={enviando} className="w-full">{enviando ? "Ingresando…" : "Ingresar"}</Boton>
    </form>
  );
}

export function FormularioRecuperacion() {
  const [estado, accion, enviando] = useFormulario(pedirRecuperacion, inicial);
  return (
    <form {...accion} className="space-y-3">
      <Campo id="email-recuperar" name="email" type="email" etiqueta="Correo de tu cuenta" autoComplete="username" required />
      {estado.mensaje ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
      <Boton type="submit" variante="secundario" disabled={enviando}>Enviarme un enlace</Boton>
    </form>
  );
}

export function FormularioClave() {
  const [estado, accion, enviando] = useFormulario(definirClave, inicial);
  return (
    <form {...accion} className="space-y-4">
      <Campo id="clave" name="clave" type="password" etiqueta="Contraseña nueva" autoComplete="new-password" minLength={10} required ayuda="Al menos 10 caracteres." />
      <Campo id="repetir" name="repetir" type="password" etiqueta="Repetir contraseña" autoComplete="new-password" minLength={10} required />
      {estado.mensaje ? <Aviso tono="peligro">{estado.mensaje}</Aviso> : null}
      <Boton type="submit" disabled={enviando} className="w-full">Guardar contraseña</Boton>
    </form>
  );
}
