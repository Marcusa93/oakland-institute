import type { Metadata } from "next";
import { Aviso, Enlace, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { hoyISO } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { diaISO, horariosVigentes, textoHorario, type Horario } from "./util";

export const metadata: Metadata = { title: "Mis comisiones" };

interface Asignacion {
  funcion: string;
  comisiones: {
    id: string; nombre: string; estado: string; modalidad: string;
    cursos: { nombre: string } | null; niveles: { nombre: string } | null;
    comision_horarios: Horario[];
  } | null;
}

const FUNCION: Record<string, string> = { titular: "Titular", auxiliar: "Auxiliar", suplente: "Suplente" };
const ESTADO: Record<string, string> = { borrador: "En preparación", abierta: "Inscripción abierta", finalizada: "Finalizada", cancelada: "Cancelada" };

export default async function MisComisiones() {
  const sesion = await exigirPermiso("asistencia", "crear");
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();
  const diaHoy = diaISO(hoy);

  // Solo datos académicos: acá no se consultan contactos ni información económica.
  const { data, error } = await supabase.from("comision_docentes")
    .select("funcion, comisiones(id, nombre, estado, modalidad, cursos(nombre), niveles(nombre), comision_horarios(dia_semana, hora_inicio, hora_fin, vigencia, aulas(nombre)))")
    .eq("docente_persona_id", sesion.personaId).is("hasta", null);
  const asignaciones = ((data ?? []) as unknown as Asignacion[]).filter((a) => a.comisiones);
  const ids = asignaciones.map((a) => a.comisiones!.id);

  const [ocupacion, clasesHoy] = ids.length
    ? await Promise.all([
        supabase.from("comisiones_ocupacion").select("comision_id, inscriptos").in("comision_id", ids),
        supabase.from("clases").select("id, comision_id, estado").in("comision_id", ids).eq("fecha", hoy).order("hora_inicio"),
      ])
    : [null, null];
  const inscriptos = new Map(((ocupacion?.data ?? []) as { comision_id: string; inscriptos: number }[]).map((o) => [o.comision_id, o.inscriptos]));
  const claseDeHoy = new Map<string, { id: string; estado: string }>();
  for (const c of (clasesHoy?.data ?? []) as { id: string; comision_id: string; estado: string }[]) {
    if (!claseDeHoy.has(c.comision_id)) claseDeHoy.set(c.comision_id, c);
  }

  const filas = asignaciones.map((a) => {
    const k = a.comisiones!;
    const horarios = horariosVigentes(k.comision_horarios, hoy);
    return { ...k, funcion: a.funcion, horarios, hoy: horarios.filter((h) => h.dia_semana === diaHoy), clase: claseDeHoy.get(k.id) };
  }).sort((a, b) => Number(b.hoy.length > 0) - Number(a.hoy.length > 0) || a.nombre.localeCompare(b.nombre));

  return (
    <>
      <Titulo descripcion="Las comisiones que dictás. Desde acá abrís la clase del día y tomás asistencia.">Mis comisiones</Titulo>
      {error ? <Aviso tono="peligro">No pudimos cargar tus comisiones. Actualizá la página.</Aviso> : null}
      {!error && filas.length === 0 ? (
        <EstadoVacio titulo="No tenés comisiones asignadas">
          {esGestion(sesion.perfiles)
            ? "Este listado muestra solo las comisiones donde figurás como docente. La asignación de docentes se hace desde Comisiones."
            : "Cuando administración te asigne una comisión, la vas a ver acá."}
        </EstadoVacio>
      ) : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {filas.map((k) => (
          <li key={k.id}>
            <Tarjeta className={k.hoy.length ? "border-marca ring-1 ring-marca" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">{k.nombre}</h2>
                  <p className="text-sm text-suave">{[k.cursos?.nombre, k.niveles?.nombre].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {k.hoy.length ? <Insignia tono="marca">Clase hoy</Insignia> : null}
                  {k.funcion !== "titular" ? <Insignia>{FUNCION[k.funcion] ?? k.funcion}</Insignia> : null}
                  {ESTADO[k.estado] ? <Insignia tono={k.estado === "cancelada" ? "peligro" : "neutro"}>{ESTADO[k.estado]}</Insignia> : null}
                </div>
              </div>
              {k.horarios.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {k.horarios.map((h, i) => (
                    <li key={i} className={h.dia_semana === diaHoy ? "font-semibold" : ""}>{textoHorario(h)}{h.dia_semana === diaHoy ? " (hoy)" : ""}</li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-suave">Sin horarios cargados.</p>}
              <p className="mt-2 text-sm">
                <strong>{inscriptos.get(k.id) ?? 0}</strong> {inscriptos.get(k.id) === 1 ? "inscripto" : "inscriptos"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {k.clase ? (
                  <Enlace href={`/panel/mis-comisiones/${k.id}?clase=${k.clase.id}`}>
                    {k.clase.estado === "dictada" ? "Ver o corregir asistencia de hoy" : "Tomar asistencia de hoy"}
                  </Enlace>
                ) : null}
                <Enlace href={`/panel/mis-comisiones/${k.id}`} variante={k.clase ? "secundario" : k.hoy.length ? "primario" : "secundario"}>
                  {k.clase ? "Ver clases" : k.hoy.length ? "Abrir clase de hoy" : "Ver clases"}
                </Enlace>
              </div>
            </Tarjeta>
          </li>
        ))}
      </ul>
    </>
  );
}
