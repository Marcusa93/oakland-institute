import "server-only";
import { esGestion } from "@/lib/permisos";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { nombrePersona, type Destinatario, type EstudianteMensajes } from "./comun";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;
interface Persona { nombres: string; apellidos: string; nombre_preferido: string | null }
const P = "nombres, apellidos, nombre_preferido";

export interface OpcionesNueva {
  modo: "gestion" | "guiado";
  estudiantes: EstudianteMensajes[];
  preEstudiante: string;
  preDestinatarios: Destinatario[];
  /** Administración y dirección (contactos_institucionales). */
  generales: Destinatario[];
  /** Personal (docente): puede escribirle al equipo sin elegir estudiante. */
  permiteSinEstudiante: boolean;
  avisos: string[];
}

function agregar(mapa: Map<string, EstudianteMensajes>, e: EstudianteMensajes) {
  const previo = mapa.get(e.id);
  if (!previo) { mapa.set(e.id, e); return; }
  for (const d of e.destinatarios) if (!previo.destinatarios.some((x) => x.id === d.id)) previo.destinatarios.push(d);
}

/** Docentes vigentes de las comisiones donde el estudiante tiene matrícula activa. */
async function docentesDe(supabase: Cliente, estudianteIds: string[]) {
  const res = new Map<string, Destinatario[]>();
  if (estudianteIds.length === 0) return res;
  const { data: mats } = await supabase.from("matriculas").select("estudiante_id, comision_id, comisiones(nombre)")
    .in("estudiante_id", estudianteIds).eq("estado", "activa");
  const matriculas = (mats ?? []) as unknown as { estudiante_id: string; comision_id: string; comisiones: { nombre: string } | null }[];
  const comisiones = [...new Set(matriculas.map((m) => m.comision_id))];
  if (comisiones.length === 0) return res;
  const { data: docs } = await supabase.from("comision_docentes")
    .select(`comision_id, docente_persona_id, funcion, personas!docente_persona_id(${P})`).in("comision_id", comisiones).is("hasta", null);
  const docentes = (docs ?? []) as unknown as { comision_id: string; docente_persona_id: string; funcion: string; personas: Persona | null }[];
  for (const m of matriculas) {
    const lista = res.get(m.estudiante_id) ?? [];
    for (const d of docentes.filter((x) => x.comision_id === m.comision_id)) {
      if (lista.some((x) => x.id === d.docente_persona_id)) continue;
      lista.push({
        id: d.docente_persona_id,
        nombre: nombrePersona(d.personas) ?? "Docente",
        detalle: `Docente${d.funcion !== "titular" ? ` ${d.funcion}` : ""} · ${m.comisiones?.nombre ?? "comisión"}`,
      });
    }
    res.set(m.estudiante_id, lista);
  }
  return res;
}

export async function opcionesNuevaConversacion(sesion: Sesion, para?: string, a?: string): Promise<OpcionesNueva> {
  const supabase = await crearClienteServidor();
  const uuid = /^[0-9a-f-]{36}$/i;
  const avisos: string[] = [];
  const preDestinatarios: Destinatario[] = [];

  // ---------------------------------------------------------- gestión
  if (esGestion(sesion.perfiles)) {
    const estudiantes: EstudianteMensajes[] = [];
    if (para && uuid.test(para)) {
      const { data: est } = await supabase.from("estudiantes").select(`id, persona_id, legajo, personas(${P})`).eq("id", para).maybeSingle();
      const e = est as unknown as { id: string; persona_id: string; legajo: string; personas: Persona | null } | null;
      if (e) {
        const [{ data: vins }, docentes] = await Promise.all([
          supabase.from("vinculos_responsables").select(`responsable_persona_id, parentesco, permiso_academico, personas!responsable_persona_id(${P})`)
            .eq("estudiante_id", e.id).eq("estado", "verificado"),
          docentesDe(supabase, [e.id]),
        ]);
        const responsables = ((vins ?? []) as unknown as { responsable_persona_id: string; parentesco: string | null; permiso_academico: boolean; personas: Persona | null }[])
          .map((v) => ({ id: v.responsable_persona_id, nombre: nombrePersona(v.personas) ?? "Responsable", detalle: `Responsable${v.parentesco ? ` (${v.parentesco})` : ""}${v.permiso_academico ? "" : " · sin permiso académico"}` }));
        estudiantes.push({
          id: e.id,
          nombre: nombrePersona(e.personas) ?? e.legajo,
          relacion: `Legajo ${e.legajo}`,
          destinatarios: [{ id: e.persona_id, nombre: nombrePersona(e.personas) ?? "Estudiante", detalle: "El estudiante" }, ...responsables, ...(docentes.get(e.id) ?? [])]
            .filter((d) => d.id !== sesion.personaId),
        });
      } else {
        avisos.push("No encontramos el estudiante indicado.");
      }
    }
    if (a && uuid.test(a) && a !== sesion.personaId) {
      const { data: p } = await supabase.from("personas").select(`id, ${P}`).eq("id", a).maybeSingle();
      if (p) preDestinatarios.push({ id: a, nombre: nombrePersona(p as unknown as Persona) ?? "—", detalle: "" });
    }
    return { modo: "gestion", estudiantes, preEstudiante: estudiantes[0]?.id ?? "", preDestinatarios, generales: [], permiteSinEstudiante: true, avisos };
  }

  // ---------------------------------------------------------- guiado
  const mapa = new Map<string, EstudianteMensajes>();

  // Familia o estudiante: el estudiante propio y los vinculados con permiso académico
  // (la regla del canal exige ese permiso).
  if (sesion.perfiles.includes("estudiante") || sesion.perfiles.includes("tutor")) {
    const [{ data: propio }, { data: vins }] = await Promise.all([
      supabase.from("estudiantes").select(`id, personas(${P})`).eq("persona_id", sesion.personaId).maybeSingle(),
      supabase.from("vinculos_responsables").select("estudiante_id").eq("responsable_persona_id", sesion.personaId)
        .eq("estado", "verificado").eq("permiso_academico", true),
    ]);
    const idsVinculados = ((vins ?? []) as { estudiante_id: string }[]).map((v) => v.estudiante_id);
    const { data: vinculados } = idsVinculados.length
      ? await supabase.from("estudiantes").select(`id, personas(${P})`).in("id", idsVinculados)
      : { data: [] };
    const lista = [
      ...(propio ? [{ ...(propio as unknown as { id: string; personas: Persona | null }), relacion: "Tu cursada" }] : []),
      ...((vinculados ?? []) as unknown as { id: string; personas: Persona | null }[]).map((e) => ({ ...e, relacion: "Estudiante a tu cargo" })),
    ];
    const docentes = await docentesDe(supabase, lista.map((e) => e.id));
    for (const e of lista) {
      agregar(mapa, { id: e.id, nombre: nombrePersona(e.personas) ?? "Estudiante", relacion: e.relacion, destinatarios: docentes.get(e.id) ?? [] });
    }
  }

  // Docente: los estudiantes de sus comisiones.
  if (sesion.perfiles.includes("docente")) {
    const { data: asig } = await supabase.from("comision_docentes").select("comision_id, comisiones(nombre)")
      .eq("docente_persona_id", sesion.personaId).is("hasta", null);
    const comisiones = (asig ?? []) as unknown as { comision_id: string; comisiones: { nombre: string } | null }[];
    if (comisiones.length) {
      const nombreComision = new Map(comisiones.map((c) => [c.comision_id, c.comisiones?.nombre ?? "comisión"]));
      const { data: mats } = await supabase.from("matriculas")
        .select(`estudiante_id, comision_id, estudiantes(id, persona_id, personas(${P}))`)
        .in("comision_id", [...nombreComision.keys()]).eq("estado", "activa");
      const matriculas = ((mats ?? []) as unknown as { estudiante_id: string; comision_id: string; estudiantes: { id: string; persona_id: string; personas: Persona | null } | null }[])
        .filter((m) => m.estudiantes);
      const ids = [...new Set(matriculas.map((m) => m.estudiante_id))];
      // Responsables académicos verificados (función de la base: la ve el docente del estudiante).
      const respuestas = await Promise.all(ids.map((est) => supabase.rpc("responsables_academicos", { p_estudiante: est })
        .then(({ data }) => ((data ?? []) as { persona_id: string; nombre: string; parentesco: string | null }[]).map((v) => ({ ...v, estudiante_id: est })))));
      const vinculos = respuestas.flat();
      for (const m of matriculas) {
        const e = m.estudiantes!;
        const nombre = nombrePersona(e.personas) ?? "Estudiante";
        agregar(mapa, {
          id: e.id, nombre, relacion: `Tu comisión ${nombreComision.get(m.comision_id)}`,
          destinatarios: [
            { id: e.persona_id, nombre, detalle: "El estudiante (si tiene cuenta propia)" },
            ...vinculos.filter((v) => v.estudiante_id === e.id).map((v) => ({
              id: v.persona_id, nombre: v.nombre || "Responsable", detalle: `Responsable${v.parentesco ? ` (${v.parentesco})` : ""}`,
            })),
          ],
        });
      }
    }
  }

  // Administración y dirección: cualquier cuenta puede verlas como destino.
  const { data: contactos } = await supabase.rpc("contactos_institucionales");
  const generales: Destinatario[] = ((contactos ?? []) as { persona_id: string; nombre: string; rol: string }[])
    .filter((c) => c.persona_id !== sesion.personaId)
    .reduce<Destinatario[]>((l, c) => {
      const previo = l.find((x) => x.id === c.persona_id);
      if (previo) { if (!previo.detalle.includes(c.rol)) previo.detalle += ` · ${c.rol}`; } else l.push({ id: c.persona_id, nombre: c.nombre, detalle: c.rol });
      return l;
    }, [])
    .sort((x, y) => x.detalle.localeCompare(y.detalle, "es") || x.nombre.localeCompare(y.nombre, "es"));

  const estudiantes = [...mapa.values()]
    .map((e) => ({ ...e, destinatarios: e.destinatarios.filter((d) => d.id !== sesion.personaId) }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
  const preEstudiante = para && mapa.has(para) ? para : estudiantes.length === 1 ? estudiantes[0].id : "";
  if (para && !mapa.has(para)) avisos.push("No tenés un canal habilitado con ese estudiante.");
  const permiteSinEstudiante = sesion.perfiles.includes("docente");
  return { modo: "guiado", estudiantes, preEstudiante, preDestinatarios, generales, permiteSinEstudiante, avisos };
}
