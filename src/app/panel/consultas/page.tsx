/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, EstadoVacio, Insignia, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fechaHora } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ESTADOS } from "./estados";
import { Seguimiento } from "./formulario";

export const metadata: Metadata = { title: "Consultas" };

const TONO: Record<string, Tono> = { nueva: "alerta", contactada: "marca", nivelacion: "marca", solicitud: "marca", ganada: "exito", perdida: "neutro" };
const ABIERTAS = ["nueva", "contactada", "nivelacion", "solicitud"];

export default async function Consultas({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sesion = await exigirPermiso("consultas", "ver");
  const { ver = "abiertas" } = await searchParams;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("consultas")
    .select("id, creada_en, tipo, nombre_contacto, email, telefono, es_para_menor, nombre_estudiante, edad_estudiante, mensaje, origen, estado, responsable_cuenta_id, proxima_accion, proxima_accion_en, motivo_perdida, cursos(nombre), consulta_eventos(ocurrido_en, tipo, nota, estado_nuevo)")
    .in("estado", ver === "cerradas" ? ["ganada", "perdida"] : ABIERTAS)
    .order("creada_en", { ascending: false })
    .limit(100);
  const etiqueta = Object.fromEntries(ESTADOS);

  return (
    <>
      <Titulo descripcion="Seguimiento comercial: cada consulta tiene estado, responsable, próxima acción e historial."
        acciones={<nav aria-label="Filtro" className="flex gap-3 text-sm font-semibold">
          <Link href="/panel/consultas" aria-current={ver !== "cerradas" ? "page" : undefined} className="aria-[current]:underline">Abiertas</Link>
          <Link href="/panel/consultas?ver=cerradas" aria-current={ver === "cerradas" ? "page" : undefined} className="aria-[current]:underline">Cerradas</Link>
        </nav>}>
        Consultas
      </Titulo>
      {error ? <Aviso tono="peligro">No pudimos cargar las consultas. Actualizá la página.</Aviso> : null}
      {!error && (data ?? []).length === 0 ? (
        <EstadoVacio titulo="No hay consultas en esta vista">Las que lleguen desde la página web aparecen acá automáticamente.</EstadoVacio>
      ) : null}
      <ul className="space-y-4">
        {(data ?? []).map((c: any) => (
          <li key={c.id}>
            <Tarjeta>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{c.nombre_contacto}</p>
                  <p className="text-sm text-suave">{[c.telefono, c.email].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.tipo === "preinscripcion" ? <Insignia tono="marca">Preinscripción</Insignia> : null}
                  <Insignia tono={TONO[c.estado]}>{etiqueta[c.estado]}</Insignia>
                  {c.responsable_cuenta_id === sesion.cuentaId ? <Insignia>A mi cargo</Insignia> : !c.responsable_cuenta_id ? <Insignia tono="alerta">Sin responsable</Insignia> : null}
                </div>
              </div>
              <p className="mt-2 text-sm">
                {c.cursos?.nombre ? <>Interés: <strong>{c.cursos.nombre}</strong>. </> : null}
                {c.es_para_menor ? <>Para {c.nombre_estudiante ?? "un menor"}{c.edad_estudiante ? ` (${c.edad_estudiante} años)` : ""}. </> : null}
                <span className="text-suave">Recibida {fechaHora(c.creada_en)} · origen {c.origen}</span>
              </p>
              {c.mensaje ? <p className="mt-2 rounded-base bg-fondo p-3 text-sm">{c.mensaje}</p> : null}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-semibold text-marca">Historial ({c.consulta_eventos?.length ?? 0})</summary>
                <ol className="mt-2 space-y-1 text-suave">
                  {[...(c.consulta_eventos ?? [])].sort((a, b) => a.ocurrido_en.localeCompare(b.ocurrido_en)).map((e: any, i: number) => (
                    <li key={i}>{fechaHora(e.ocurrido_en)} — {e.tipo === "nota" ? e.nota : e.tipo === "asignacion" ? "Cambio de responsable" : `Estado: ${etiqueta[e.estado_nuevo] ?? e.estado_nuevo}`}</li>
                  ))}
                </ol>
              </details>
              <Seguimiento consulta={c} esMia={c.responsable_cuenta_id === sesion.cuentaId} />
            </Tarjeta>
          </li>
        ))}
      </ul>
    </>
  );
}
