import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Aviso, Enlace, EstadoVacio } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { CLAVES_HABILIDAD, LARGO_LECCION, datosHabilidad, normalizarLeccion, type Habilidad, type Progreso } from "../comun";
import { Leccion } from "../leccion";
import "../practica.css";

export async function generateMetadata({ params }: { params: Promise<{ habilidad: string }> }): Promise<Metadata> {
  const { habilidad } = await params;
  return { title: `Práctica de ${datosHabilidad(habilidad)?.nombre.toLowerCase() ?? "inglés"}` };
}

export default async function PaginaLeccion({ params }: { params: Promise<{ habilidad: string }> }) {
  await exigirPermiso("practica", "crear");
  const { habilidad } = await params;
  if (!(CLAVES_HABILIDAD as readonly string[]).includes(habilidad)) notFound();

  const supabase = await crearClienteServidor();
  const [leccion, progreso] = await Promise.all([
    supabase.rpc("siguiente_leccion", { p_habilidad: habilidad, p_cantidad: LARGO_LECCION }),
    supabase.rpc("mi_progreso"),
  ]);
  const p = progreso.data as Progreso | null;

  if (!progreso.error && !p) {
    return (
      <EstadoVacio titulo="La práctica con puntos es para estudiantes">
        <p>Necesitás una inscripción como estudiante para practicar y sumar XP.</p>
        <div className="mt-4"><Enlace href="/panel/practica" variante="secundario">Volver</Enlace></div>
      </EstadoVacio>
    );
  }
  if (leccion.error || progreso.error) {
    return <Aviso tono="peligro">No pudimos preparar la lección. Actualizá la página en unos segundos.</Aviso>;
  }

  return (
    <Leccion
      habilidad={habilidad as Habilidad}
      inicial={normalizarLeccion(leccion.data)}
      estado={{ xp_semana: p!.xp_semana, meta_semanal: p!.meta_semanal, racha: p!.racha }}
    />
  );
}
