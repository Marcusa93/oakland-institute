"use client";

import { useActionState, useEffect, useRef, useTransition, type FormEvent } from "react";

/**
 * Como `useActionState`, pero lo escrito NO se borra si la acción falla.
 *
 * React vacía el formulario después de cada envío por `action`. Acá el envío
 * pasa por `onSubmit` (sin ese vaciado) y el formulario se vacía solo cuando
 * el resultado trae `ok: true`. Sin JavaScript sigue funcionando con `action`.
 *
 * Uso: `const [estado, form, pendiente] = useFormulario(accion, null);`
 *      `<form {...form}>…</form>`
 */
export function useFormulario<E>(
  accion: (previo: E, datos: FormData) => Promise<E>,
  inicial: E,
  opciones: { confirmar?: string | null } = {},
) {
  const [estado, enviar, pendiente] = useActionState(accion, inicial as Awaited<E>);
  const [, iniciar] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const anterior = useRef(estado);

  useEffect(() => {
    if (estado !== anterior.current && (estado as { ok?: boolean } | null)?.ok) ref.current?.reset();
    anterior.current = estado;
  }, [estado]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (opciones.confirmar && !window.confirm(opciones.confirmar)) return;
    const datos = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    iniciar(() => enviar(datos));
  }

  return [estado, { ref, action: enviar, onSubmit }, pendiente] as const;
}
