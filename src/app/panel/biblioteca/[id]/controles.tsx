"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton } from "@/componentes/ui";
import { compartirMaterial, eliminarMaterial, guardarMaterial } from "../acciones";

export function Compartir({ material, comision, compartido }: { material: string; comision: { id: string; texto: string }; compartido: boolean }) {
  const [estado, accion, enviando] = useActionState(compartirMaterial, null);
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="material" value={material} />
      <input type="hidden" name="comision" value={comision.id} />
      <button name="compartir" value={compartido ? "no" : "si"} disabled={enviando} aria-pressed={compartido}
        className="min-h-11 rounded-full border border-borde px-4 text-sm font-semibold hover:bg-marca-suave disabled:opacity-60 aria-pressed:border-marca aria-pressed:bg-marca aria-pressed:text-sobre-marca">
        {enviando ? "…" : compartido ? `✓ ${comision.texto}` : `Compartir con ${comision.texto}`}
      </button>
      {estado && !estado.ok ? <Aviso tono="peligro">{estado.mensaje}</Aviso> : null}
    </form>
  );
}

export function EditarMaterial({ m }: { m: { id: string; titulo: string; descripcion: string | null; nivel: string | null; texto: string | null } }) {
  const [estado, accion, guardando] = useActionState(guardarMaterial, null);
  const [texto, setTexto] = useState(m.texto ?? "");
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="id" value={m.id} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="block"><span className="text-sm font-medium">Título</span>
          <input name="titulo" defaultValue={m.titulo} maxLength={160} required className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3 font-bold" /></label>
        <label className="block"><span className="text-sm font-medium">Para</span>
          <input name="nivel" defaultValue={m.nivel ?? ""} maxLength={60} className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3" /></label>
      </div>
      <label className="block"><span className="text-sm font-medium">Indicación para los estudiantes</span>
        <input name="descripcion" defaultValue={m.descripcion ?? ""} maxLength={500} className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3" /></label>
      <label className="block"><span className="text-sm font-medium">Texto digital</span>
        <textarea name="texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={14} maxLength={200000} spellCheck lang="en"
          className="mt-1 block w-full rounded-base border border-borde bg-superficie px-3 py-2 leading-7" /></label>
      <div className="flex flex-wrap items-center gap-2">
        <Boton disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</Boton>
        {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
      </div>
    </form>
  );
}

export function Eliminar({ material }: { material: string }) {
  return (
    <form action={eliminarMaterial} onSubmit={(e) => { if (!confirm("¿Eliminar este material? Los estudiantes dejan de verlo y no se puede deshacer.")) e.preventDefault(); }}>
      <input type="hidden" name="material" value={material} />
      <button className="min-h-11 rounded-full px-4 text-sm font-semibold text-acento hover:bg-peligro-suave">Eliminar material</button>
    </form>
  );
}
