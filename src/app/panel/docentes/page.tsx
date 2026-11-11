import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Enlace, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { promedio } from "./criterios";
import { porcentaje, resumenDocentes, type Evaluacion } from "./datos";
import { TarjetaEvaluacion } from "./evaluacion";

export const metadata: Metadata = { title: "Docentes" };

export default async function Docentes() {
  const sesion = await exigirPermiso("evaluacion_docente", "ver");

  // Docente: solo lo que dirección le compartió.
  if (!sesion.perfiles.includes("direccion")) {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.from("evaluaciones_docentes")
      .select("id, docente_persona_id, periodo, puntajes, fortalezas, a_mejorar, compartida, creada_en")
      .eq("docente_persona_id", sesion.personaId).eq("compartida", true).order("creada_en", { ascending: false });
    const evaluaciones = (data ?? []) as Evaluacion[];
    return (
      <>
        <Titulo descripcion="Las devoluciones que dirección compartió con vos. Si querés conversar alguna, escribile a dirección por Mensajes.">Mis evaluaciones</Titulo>
        {error ? <Aviso tono="peligro">No pudimos cargar tus evaluaciones. Actualizá la página.</Aviso> : null}
        {!error && evaluaciones.length === 0 ? (
          <EstadoVacio titulo="Todavía no tenés evaluaciones compartidas">
            Cuando dirección te comparta una devolución sobre tu trabajo, la vas a ver acá. ¡Gracias por tu tarea en el aula!
          </EstadoVacio>
        ) : null}
        <ul className="space-y-4">{evaluaciones.map((e) => <li key={e.id}><TarjetaEvaluacion e={e} /></li>)}</ul>
      </>
    );
  }

  // Dirección: el equipo docente con indicadores de sus comisiones.
  const { docentes, error } = await resumenDocentes();
  return (
    <>
      <Titulo descripcion="Equipo docente con lo que muestran sus comisiones: asistencia tomada, actividades, correcciones y alertas. Las evaluaciones solo las ve dirección, salvo que las compartas.">
        Docentes
      </Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar toda la información. Actualizá la página.</Aviso></div> : null}
      {!error && docentes.length === 0 ? (
        <EstadoVacio titulo="No hay docentes con rol vigente">Los docentes aparecen acá cuando tienen cuenta y rol de docente asignado.</EstadoVacio>
      ) : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {docentes.map((d) => {
          const t = d.totales;
          const prom = d.ultima ? promedio(d.ultima.puntajes) : null;
          return (
            <li key={d.personaId}>
              <Tarjeta className="h-full">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-bold"><Link href={`/panel/docentes/${d.personaId}`} className="hover:underline">{d.nombre}</Link></h2>
                    <p className="text-sm text-suave">{d.comisiones.length ? d.comisiones.map((k) => k.nombre).join(" · ") : "Sin comisiones asignadas"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!d.cuentaActiva ? <Insignia tono="alerta">Cuenta suspendida</Insignia> : null}
                    {t.alertasAbiertas > 0 ? <Insignia tono="peligro">{t.alertasAbiertas} alerta{t.alertasAbiertas === 1 ? "" : "s"} abierta{t.alertasAbiertas === 1 ? "" : "s"}</Insignia> : null}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div><dt className="text-suave">Asistencia tomada</dt><dd className="font-semibold">{porcentaje(t.clasesConAsistencia, t.clases)} <span className="font-normal text-suave">({t.clasesConAsistencia}/{t.clases})</span></dd></div>
                  <div><dt className="text-suave">Actividades</dt><dd className="font-semibold">{t.actividadesPublicadas}</dd></div>
                  <div><dt className="text-suave">Corregidas</dt><dd className="font-semibold">{t.entregasCorregidas}</dd></div>
                  <div><dt className="text-suave">Por corregir</dt><dd className={`font-semibold ${t.entregasPorCorregir > 0 ? "text-alerta" : ""}`}>{t.entregasPorCorregir}</dd></div>
                </dl>
                <p className="mt-3 text-sm">
                  {d.ultima ? <>Última evaluación: <strong>{d.ultima.periodo}</strong>{prom !== null ? ` · promedio ${prom.toLocaleString("es-AR")} / 5` : ""}{d.ultima.compartida ? " · compartida" : ""}</> : <span className="text-suave">Sin evaluaciones todavía.</span>}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Enlace href={`/panel/docentes/${d.personaId}`}>Evaluar y ver historial</Enlace>
                  <Enlace href={`/panel/mensajes/nueva?a=${d.personaId}`} variante="secundario">Enviar mensaje</Enlace>
                </div>
              </Tarjeta>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-suave">Los indicadores son por comisión: si dos docentes comparten una comisión, cuentan para ambos. Asistencia tomada = clases ya dictadas (no canceladas) con al menos un registro de asistencia.</p>
    </>
  );
}
