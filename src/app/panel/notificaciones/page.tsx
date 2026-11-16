import type { Metadata } from "next";
import { AjusteNotificaciones } from "@/componentes/notificaciones";
import { Aviso, Tarjeta, Titulo } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { Preferencias } from "./preferencias";
import { TIPOS, gruposPara, type TipoNotificacion } from "./tipos";

export const metadata: Metadata = { title: "Notificaciones" };

export default async function Notificaciones() {
  const sesion = await exigirPermiso("avisos", "ver");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("preferencias_push").select("tipo, habilitado");

  // Sin fila = activada: quien nunca tocó nada recibe todo.
  const activas = Object.fromEntries(TIPOS.map((t) => [t, true])) as Record<TipoNotificacion, boolean>;
  for (const f of (data ?? []) as { tipo: TipoNotificacion; habilitado: boolean }[]) activas[f.tipo] = f.habilitado;
  const grupos = gruposPara(sesion.perfiles);
  const soloMensajes = grupos.length === 1;

  return (
    <>
      <Titulo descripcion="Qué te avisamos en el celular. Aunque apagues una notificación, todo sigue apareciendo en el panel.">
        Notificaciones
      </Titulo>
      <AjusteNotificaciones />

      <Tarjeta>
        <h2 className="text-lg font-bold">Qué querés que te avisemos</h2>
        <p className="mt-1 text-sm text-suave">
          Vale para todos los dispositivos donde actives las notificaciones.
          {soloMensajes ? " A tu cuenta solo le llegan notificaciones de mensajes nuevos." : ""}
        </p>
        <div className="mt-5">
          {error ? <Aviso tono="peligro">No pudimos cargar tus preferencias. Actualizá la página.</Aviso> : <Preferencias grupos={grupos} activas={activas} />}
        </div>
      </Tarjeta>
    </>
  );
}
