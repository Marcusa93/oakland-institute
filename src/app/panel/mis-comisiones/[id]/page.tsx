import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Aviso, Enlace, EstadoVacio, Insignia, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha, fechaHora, hoyISO } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { AbrirClase, TomaAsistencia, type FilaAsistencia } from "../asistencia";
import { diaISO, hora, horariosVigentes, textoHorario, UUID, type EstadoAsistencia, type Horario } from "../util";

export const metadata: Metadata = { title: "Clases y asistencia" };

interface Comision {
  id: string; nombre: string; estado: string;
  cursos: { nombre: string } | null; niveles: { nombre: string } | null;
  comision_horarios: Horario[];
}
interface Clase { id: string; fecha: string; hora_inicio: string; hora_fin: string; estado: string; tema: string | null; asistencias?: { count: number }[] }

const ESTADO_CLASE: Record<string, [string, Tono]> = {
  programada: ["Sin asistencia", "alerta"], dictada: ["Dictada", "exito"], cancelada: ["Cancelada", "neutro"],
};

export default async function ComisionDocente({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clase?: string }>;
}) {
  const sesion = await exigirPermiso("asistencia", "crear");
  const [{ id }, { clase: claseId }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id) || (claseId !== undefined && !UUID.test(claseId))) notFound();
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();

  const [comisionR, asignacion] = await Promise.all([
    supabase.from("comisiones")
      .select("id, nombre, estado, cursos(nombre), niveles(nombre), comision_horarios(dia_semana, hora_inicio, hora_fin, vigencia, aulas(nombre))")
      .eq("id", id).maybeSingle(),
    supabase.from("comision_docentes").select("id", { count: "exact", head: true })
      .eq("comision_id", id).eq("docente_persona_id", sesion.personaId).is("hasta", null),
  ]);
  if (comisionR.error) return <Aviso tono="peligro">No pudimos cargar la comisión. Actualizá la página.</Aviso>;
  const comision = comisionR.data as unknown as Comision | null;
  if (!comision) notFound();
  if (!esGestion(sesion.perfiles) && !asignacion.count) {
    return (
      <EstadoVacio titulo="No dictás esta comisión">
        Solo podés ver las clases y tomar asistencia en las comisiones que tenés asignadas.
        <p className="mt-3"><Enlace href="/panel/mis-comisiones" variante="secundario">Volver a mis comisiones</Enlace></p>
      </EstadoVacio>
    );
  }
  const subtitulo = [comision.cursos?.nombre, comision.niveles?.nombre].filter(Boolean).join(" · ");

  // ------------------------------------------------------------------ Asistencia de una clase
  if (claseId) {
    // Solo nombre del estudiante: sin contactos, responsables ni datos económicos.
    const [claseR, matriculasR, asistenciasR] = await Promise.all([
      supabase.from("clases").select("id, fecha, hora_inicio, hora_fin, estado, tema").eq("id", claseId).eq("comision_id", id).maybeSingle(),
      supabase.from("matriculas").select("id, estudiantes(personas(nombres, apellidos))").eq("comision_id", id).eq("estado", "activa"),
      supabase.from("asistencias").select("matricula_id, estado, observacion, registrada_en").eq("clase_id", claseId),
    ]);
    const clase = claseR.data as Clase | null;
    if (!claseR.error && !clase) notFound();
    const error = claseR.error || matriculasR.error || asistenciasR.error;
    const previas = new Map(((asistenciasR.data ?? []) as { matricula_id: string; estado: EstadoAsistencia; observacion: string | null; registrada_en: string }[])
      .map((a) => [a.matricula_id, a]));
    const filas: FilaAsistencia[] = ((matriculasR.data ?? []) as unknown as { id: string; estudiantes: { personas: { nombres: string; apellidos: string } | null } | null }[])
      .map((m) => {
        const p = m.estudiantes?.personas;
        return {
          matriculaId: m.id,
          nombre: p ? `${p.apellidos}, ${p.nombres}` : "Estudiante sin nombre visible",
          estado: previas.get(m.id)?.estado ?? null,
          observacion: previas.get(m.id)?.observacion ?? "",
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const cargadas = filas.filter((f) => f.estado).length;
    const ultima = [...previas.values()].map((a) => a.registrada_en).sort().at(-1);

    return (
      <>
        <Titulo descripcion={subtitulo}
          acciones={<Enlace href={`/panel/mis-comisiones/${id}`} variante="secundario">Volver a las clases</Enlace>}>
          Asistencia · {comision.nombre}
        </Titulo>
        {error || !clase ? <Aviso tono="peligro">No pudimos cargar la clase. Actualizá la página.</Aviso> : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <strong>Clase del {fecha(clase.fecha)}{clase.fecha === hoy ? " (hoy)" : ""}, de {hora(clase.hora_inicio)} a {hora(clase.hora_fin)}</strong>
              {clase.estado === "cancelada" ? <Insignia>Cancelada</Insignia> : null}
              {cargadas > 0
                ? <Insignia tono="exito">Asistencia cargada ({cargadas} de {filas.length})</Insignia>
                : <Insignia tono="alerta">Asistencia sin cargar</Insignia>}
            </div>
            {cargadas > 0 ? (
              <div className="mb-4">
                <Aviso>Esta asistencia ya fue cargada{ultima ? ` (último guardado: ${fechaHora(ultima)})` : ""}. Podés corregirla y volver a guardar.</Aviso>
              </div>
            ) : null}
            {clase.estado === "cancelada" ? (
              <div className="mb-4"><Aviso tono="alerta">La clase figura como cancelada. Si guardás asistencia, pasa a figurar como dictada.</Aviso></div>
            ) : null}
            {filas.length === 0 ? (
              <EstadoVacio titulo="Esta comisión no tiene estudiantes inscriptos">Cuando administración confirme inscripciones, van a aparecer en este listado.</EstadoVacio>
            ) : (
              <TomaAsistencia key={clase.id} claseId={clase.id} temaInicial={clase.tema ?? ""} filas={filas} />
            )}
          </>
        )}
      </>
    );
  }

  // ------------------------------------------------------------------ Clases de la comisión
  const { data: clasesData, error: errorClases } = await supabase.from("clases")
    .select("id, fecha, hora_inicio, hora_fin, estado, tema, asistencias(count)")
    .eq("comision_id", id).lte("fecha", hoy).order("fecha", { ascending: false }).order("hora_inicio", { ascending: false }).limit(20);
  const clases = (clasesData ?? []) as unknown as Clase[];
  const deHoy = clases.filter((c) => c.fecha === hoy);
  const anteriores = clases.filter((c) => c.fecha !== hoy);
  const horarios = horariosVigentes(comision.comision_horarios, hoy);
  const horariosHoy = horarios.filter((h) => h.dia_semana === diaISO(hoy));
  const pendiente = horariosHoy.find((h) => !deHoy.some((c) => hora(c.hora_inicio) === hora(h.hora_inicio)));
  const cerrada = comision.estado === "finalizada" || comision.estado === "cancelada";

  const itemClase = (c: Clase) => {
    const [etiqueta, tono] = ESTADO_CLASE[c.estado] ?? [c.estado, "neutro" as Tono];
    const n = c.asistencias?.[0]?.count ?? 0;
    return (
      <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <p className="font-semibold">{fecha(c.fecha)} · {hora(c.hora_inicio)} a {hora(c.hora_fin)}</p>
          <p className="text-sm text-suave">{c.tema || "Sin tema cargado"} · {n > 0 ? `${n} con asistencia` : "asistencia sin cargar"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Insignia tono={tono}>{etiqueta}</Insignia>
          <Enlace href={`/panel/mis-comisiones/${id}?clase=${c.id}`} variante={n > 0 ? "secundario" : "primario"}>
            {n > 0 ? "Ver o corregir" : "Tomar asistencia"}
          </Enlace>
        </div>
      </li>
    );
  };

  return (
    <>
      <Titulo descripcion={subtitulo}
        acciones={<Enlace href="/panel/mis-comisiones" variante="secundario">Mis comisiones</Enlace>}>
        {comision.nombre}
      </Titulo>
      {errorClases ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar las clases. Actualizá la página.</Aviso></div> : null}

      <Tarjeta className="mb-6">
        <h2 className="text-lg font-bold">Hoy, {fecha(hoy)}</h2>
        {deHoy.length ? <ul className="divide-y divide-borde">{deHoy.map(itemClase)}</ul> : null}
        {cerrada ? (
          <p className="mt-2 text-sm text-suave">La comisión está {comision.estado}: no se abren clases nuevas.</p>
        ) : deHoy.length === 0 || pendiente ? (
          <div className="mt-3">
            <AbrirClase comisionId={id} horarioHoy={pendiente ? { inicio: hora(pendiente.hora_inicio), fin: hora(pendiente.hora_fin) } : null} />
          </div>
        ) : null}
      </Tarjeta>

      <h2 className="mb-2 text-lg font-bold">Horarios</h2>
      {horarios.length
        ? <ul className="mb-6 space-y-1 text-sm">{horarios.map((h, i) => <li key={i}>{textoHorario(h)}</li>)}</ul>
        : <p className="mb-6 text-sm text-suave">Sin horarios cargados.</p>}

      <h2 className="mb-2 text-lg font-bold">Clases anteriores</h2>
      {anteriores.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay clases anteriores">Cada clase que abras queda registrada acá, con su asistencia.</EstadoVacio>
      ) : (
        <ul className="divide-y divide-borde rounded-base border border-borde bg-superficie px-4">{anteriores.map(itemClase)}</ul>
      )}
    </>
  );
}
