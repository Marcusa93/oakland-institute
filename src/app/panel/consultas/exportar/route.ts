/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import { armarCsv, fechaCsv, legible, respuestaCsv } from "@/lib/csv";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { uno } from "../../estudiantes/comun";

/** Todas las consultas (abiertas y cerradas), para Excel. */
export async function GET() {
  await exigirPermiso("consultas", "ver");
  const supabase = await crearClienteServidor();
  const filas: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("consultas")
      .select("creada_en, tipo, nombre_contacto, email, telefono, nombre_estudiante, edad_estudiante, origen, estado, proxima_accion, proxima_accion_en, motivo_perdida, mensaje, cursos(nombre)")
      .order("creada_en", { ascending: false }).range(desde, desde + 999);
    if (error) return new Response("No pudimos armar la planilla. Probá de nuevo.", { status: 500 });
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const csv = armarCsv(
    ["Fecha", "Tipo", "Contacto", "Email", "Teléfono", "Estudiante", "Edad", "Curso de interés", "Origen", "Estado", "Próxima acción", "Para el", "Motivo de pérdida", "Mensaje"],
    filas.map((c) => [
      fechaCsv(c.creada_en), legible(c.tipo), c.nombre_contacto, c.email, c.telefono, c.nombre_estudiante, c.edad_estudiante, uno<any>(c.cursos)?.nombre,
      legible(c.origen), legible(c.estado), c.proxima_accion, fechaCsv(c.proxima_accion_en), c.motivo_perdida, c.mensaje,
    ]),
  );
  return respuestaCsv(`consultas-${hoyISO()}.csv`, csv);
}
