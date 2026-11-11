import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Enlace, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { institucion } from "@/config/institucion";
import { fechaHora } from "@/lib/formato";
import { esGestion, puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { AvisoFamilia, GestionAlerta, RevisarAhora } from "./gestion";

export const metadata: Metadata = { title: "Alertas" };

interface Alerta {
  id: string; tipo: "ausentismo" | "participacion" | "rendimiento"; nivel: "atencion" | "urgente"; detalle: string;
  datos: Record<string, unknown>; estado: string; nota: string | null; creada_en: string; actualizada_en: string | null;
  estudiante_id: string; comision_id: string;
  estudiantes: { legajo: string; personas: { nombres: string; apellidos: string } | null } | null;
  comisiones: { nombre: string } | null;
}

const TIPOS = {
  ausentismo: { etiqueta: "Ausentismo", icono: "🗓️" },
  participacion: { etiqueta: "Participación", icono: "✋" },
  rendimiento: { etiqueta: "Rendimiento", icono: "📉" },
} as const;

const GRUPOS = [
  ["abierta", "Abiertas", "Necesitan una primera acción."],
  ["en_seguimiento", "En seguimiento", "Alguien ya las está acompañando."],
  ["resuelta", "Resueltas", "Las últimas cerradas, para tener la historia."],
] as const;

function textoAviso(a: Alerta, nombre: string) {
  const asunto: Record<Alerta["tipo"], string> = {
    ausentismo: `Asistencia de ${nombre}`,
    participacion: `Actividades pendientes de ${nombre}`,
    rendimiento: `Acompañamiento a ${nombre} en ${a.comisiones?.nombre ?? "su comisión"}`,
  };
  const motivo: Record<Alerta["tipo"], string> = {
    ausentismo: "notamos varias ausencias en las últimas clases",
    participacion: "tiene actividades del campus sin entregar",
    rendimiento: "en las últimas actividades le costó más de lo habitual",
  };
  return {
    asunto: asunto[a.tipo],
    cuerpo: `Hola. Les escribimos desde ${institucion.nombre} porque ${motivo[a.tipo]} (${a.detalle.replace(/\.$/, "")}).\n\nQueremos acompañar a ${nombre} para que siga avanzando. ¿Podemos coordinar una charla breve? Pueden responder por Mensajes o acercarse al instituto.\n\nGracias.`,
  };
}

export default async function Alertas({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const sesion = await exigirPermiso("alertas", "ver");
  const { tipo } = await searchParams;
  const filtro = tipo && tipo in TIPOS ? (tipo as Alerta["tipo"]) : null;
  const gestion = esGestion(sesion.perfiles);
  const puedeEditar = puede(sesion.perfiles, "alertas", "editar");
  const puedeRevisar = gestion || sesion.perfiles.includes("docente");
  const supabase = await crearClienteServidor();

  let consulta = supabase.from("alertas")
    .select("id, tipo, nivel, detalle, datos, estado, nota, creada_en, actualizada_en, estudiante_id, comision_id, estudiantes(legajo, personas(nombres, apellidos)), comisiones(nombre)")
    .order("creada_en", { ascending: false }).limit(300);
  if (filtro) consulta = consulta.eq("tipo", filtro);
  const { data, error } = await consulta;
  const alertas = (data ?? []) as unknown as Alerta[];

  // Responsables académicos verificados (gestión y el docente del estudiante).
  const conFamilia = [...new Set(alertas.filter((a) => a.estado !== "resuelta").map((a) => a.estudiante_id))];
  const listas = await Promise.all(conFamilia.map(async (id) => {
    const r = await supabase.rpc("responsables_academicos", { p_estudiante: id });
    return [id, ((r.data ?? []) as { persona_id: string; nombre: string; parentesco: string | null }[])
      .map((v) => ({ id: v.persona_id, nombre: v.nombre, parentesco: v.parentesco }))] as const;
  }));
  const responsables = new Map(listas);

  const abiertas = alertas.filter((a) => a.estado === "abierta");
  const cuenta = (t: Alerta["tipo"]) => alertas.filter((a) => a.tipo === t && a.estado !== "resuelta").length;

  return (
    <>
      <Titulo descripcion="El sistema mira asistencia, notas y entregas y te avisa a quién conviene acompañar. Se actualizan solas al tomar asistencia o corregir."
        acciones={puedeRevisar ? <RevisarAhora /> : null}>
        Alertas
      </Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar las alertas. Actualizá la página.</Aviso></div> : null}

      <nav aria-label="Filtrar por tipo" className="mb-6 flex flex-wrap gap-2">
        <Link href="/panel/alertas" aria-current={!filtro ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-full border border-borde bg-superficie px-4 text-sm font-semibold aria-[current]:border-marca aria-[current]:bg-marca aria-[current]:text-sobre-marca">
          Todas
        </Link>
        {(Object.keys(TIPOS) as Alerta["tipo"][]).map((t) => (
          <Link key={t} href={`/panel/alertas?tipo=${t}`} aria-current={filtro === t ? "page" : undefined}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-borde bg-superficie px-4 text-sm font-semibold aria-[current]:border-marca aria-[current]:bg-marca aria-[current]:text-sobre-marca">
            <span aria-hidden>{TIPOS[t].icono}</span>{TIPOS[t].etiqueta}
            {!filtro ? <span className="rounded-full bg-pizarra px-2 text-xs text-texto">{cuenta(t)}</span> : null}
          </Link>
        ))}
      </nav>

      {!error && alertas.length === 0 ? (
        <EstadoVacio titulo="No hay alertas">
          {filtro ? "No hay alertas de este tipo." : "Cuando alguien acumule ausencias, actividades sin entregar o notas bajas, va a aparecer acá."}
          {puedeRevisar ? " Podés forzar una revisión con «Revisar ahora»." : ""}
        </EstadoVacio>
      ) : null}

      {abiertas.some((a) => a.nivel === "urgente") ? (
        <p className="globo globo-izq mb-10 bg-acento px-5 py-3 font-semibold text-white">
          <span className="latido mr-2 inline-block size-2.5 rounded-full bg-white align-middle" aria-hidden />
          {abiertas.filter((a) => a.nivel === "urgente").length} {abiertas.filter((a) => a.nivel === "urgente").length === 1 ? "alerta urgente necesita" : "alertas urgentes necesitan"} atención.
        </p>
      ) : null}

      <div className="space-y-8">
        {GRUPOS.map(([estado, titulo, ayuda]) => {
          const grupo = alertas.filter((a) => a.estado === estado)
            .sort((x, y) => Number(y.nivel === "urgente") - Number(x.nivel === "urgente") || y.creada_en.localeCompare(x.creada_en))
            .slice(0, estado === "resuelta" ? 30 : undefined);
          if (!grupo.length) return null;
          const contenido = (
            <ul className="grid gap-3 lg:grid-cols-2">
              {grupo.map((a) => {
                const p = a.estudiantes?.personas;
                const nombre = p ? `${p.nombres} ${p.apellidos}` : "Estudiante";
                const aviso = textoAviso(a, p?.nombres ?? "el estudiante");
                const ausencias = Number(a.datos?.ausencias ?? 0);
                const clases = Number(a.datos?.clases ?? 0);
                return (
                  <li key={a.id}>
                    <Tarjeta className={a.nivel === "urgente" && a.estado !== "resuelta" ? "border-l-4 border-l-acento" : "border-l-4 border-l-alerta"}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-bold">{nombre}</p>
                          <p className="text-xs text-suave">{a.comisiones?.nombre} · legajo {a.estudiantes?.legajo}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Insignia tono={a.nivel === "urgente" ? "peligro" : "alerta"}>{a.nivel === "urgente" ? "Urgente" : "Atención"}</Insignia>
                          <Insignia><span aria-hidden>{TIPOS[a.tipo].icono}&nbsp;</span>{TIPOS[a.tipo].etiqueta}</Insignia>
                        </div>
                      </div>
                      <p className="mt-2 text-sm">{a.detalle}</p>
                      {a.tipo === "ausentismo" && clases > 0 ? (
                        <p className="mt-2 flex items-center gap-1" role="img" aria-label={`${ausencias} ausencias en ${clases} clases`}>
                          {Array.from({ length: clases }, (_, i) => (
                            <span key={i} className={`size-4 rounded-full ${i < ausencias ? "bg-acento" : "bg-exito"}`} />
                          ))}
                          <span className="ml-1 text-xs text-suave">últimas clases</span>
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-suave">
                        Detectada {fechaHora(a.creada_en)}{a.actualizada_en ? ` · actualizada ${fechaHora(a.actualizada_en)}` : ""}
                      </p>
                      {a.nota && !puedeEditar ? <p className="mt-2 whitespace-pre-line rounded-base bg-pizarra p-2 text-sm">{a.nota}</p> : null}
                      {puedeEditar ? <GestionAlerta id={a.id} estado={a.estado} nota={a.nota} /> : null}
                      {a.estado !== "resuelta" ? (
                        <div className="flex flex-wrap items-start gap-3">
                          <AvisoFamilia alerta={a.id} responsables={responsables.get(a.estudiante_id) ?? []} asunto={aviso.asunto} cuerpo={aviso.cuerpo} />
                          <Enlace href={`/panel/mensajes?para=${a.estudiante_id}`} variante="secundario" className="mt-3">💬 Abrir conversación</Enlace>
                        </div>
                      ) : null}
                    </Tarjeta>
                  </li>
                );
              })}
            </ul>
          );
          return (
            <section key={estado} aria-labelledby={`g-${estado}`}>
              {estado === "resuelta" ? (
                <details>
                  <summary className="min-h-11 cursor-pointer">
                    <h2 id={`g-${estado}`} className="inline text-lg font-bold">{titulo} ({grupo.length})</h2>
                    <span className="ml-2 text-sm text-suave">{ayuda}</span>
                  </summary>
                  <div className="mt-3">{contenido}</div>
                </details>
              ) : (
                <>
                  <h2 id={`g-${estado}`} className="text-lg font-bold">{titulo} ({grupo.length})</h2>
                  <p className="mb-3 text-sm text-suave">{ayuda}</p>
                  {contenido}
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
