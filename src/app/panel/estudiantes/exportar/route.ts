/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import { armarCsv, fechaCsv, legible, respuestaCsv } from "@/lib/csv";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { uno } from "../comun";

/** Todos los estudiantes con sus datos de contacto y comisiones activas, para Excel. */
export async function GET() {
  await exigirPermiso("estudiantes", "crear");
  const supabase = await crearClienteServidor();
  const filas: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("estudiantes")
      .select("legajo, estado, fecha_alta, personas!inner(nombres, apellidos, eliminada_en, personas_datos(tipo_documento, numero_documento, fecha_nacimiento, email, telefono)), matriculas(estado, comisiones(nombre))")
      .is("personas.eliminada_en", null).order("legajo").range(desde, desde + 999);
    if (error) return new Response("No pudimos armar la planilla. Probá de nuevo.", { status: 500 });
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const csv = armarCsv(
    ["Legajo", "Apellidos", "Nombres", "Estado", "Alta", "Tipo doc.", "Documento", "Nacimiento", "Email", "Teléfono", "Comisiones activas"],
    filas
      .map((e) => {
        const p = uno<any>(e.personas);
        const d = uno<any>(p?.personas_datos);
        const comisiones = ((e.matriculas ?? []) as any[]).filter((m) => m.estado === "activa").map((m) => uno<any>(m.comisiones)?.nombre).filter(Boolean).join(" / ");
        return [e.legajo, p?.apellidos, p?.nombres, legible(e.estado), fechaCsv(e.fecha_alta), d?.tipo_documento, d?.numero_documento, fechaCsv(d?.fecha_nacimiento), d?.email, d?.telefono, comisiones];
      })
      .sort((a, b) => `${a[1]} ${a[2]}`.localeCompare(`${b[1]} ${b[2]}`, "es")),
  );
  return respuestaCsv(`estudiantes-${hoyISO()}.csv`, csv);
}
