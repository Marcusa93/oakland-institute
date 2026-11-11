import "server-only";
import { supabaseConfigurado } from "@/config/institucion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export interface HorarioPublicado { dia_semana: number; hora_inicio: string; hora_fin: string }
export interface ComisionPublicada {
  id: string; nombre: string; nivel: string; modalidad: string; fecha_inicio: string;
  hay_vacantes: boolean; horarios: HorarioPublicado[];
}
export interface CursoPublicado {
  id: string; slug: string; nombre: string; descripcion: string | null; publico: string;
  edad_minima: number | null; edad_maxima: number | null; modalidad: string; comisiones: ComisionPublicada[];
}

/** Oferta de muestra: solo se usa cuando todavía no hay base conectada. */
const OFERTA_DEMO: CursoPublicado[] = [
  {
    id: "demo-ninos", slug: "ninos", nombre: "Inglés para niños", publico: "ninos", edad_minima: 6, edad_maxima: 11, modalidad: "presencial",
    descripcion: "Clases dinámicas con juegos, canciones y proyectos para aprender desde chicos.",
    comisiones: [{ id: "demo-1", nombre: "Niños Inicial · Lun y Mié", nivel: "Inicial", modalidad: "presencial", fecha_inicio: "2027-03-08", hay_vacantes: true,
      horarios: [{ dia_semana: 1, hora_inicio: "17:30", hora_fin: "18:30" }, { dia_semana: 3, hora_inicio: "17:30", hora_fin: "18:30" }] }],
  },
  {
    id: "demo-adolescentes", slug: "adolescentes", nombre: "Inglés para adolescentes", publico: "adolescentes", edad_minima: 12, edad_maxima: 17, modalidad: "presencial",
    descripcion: "Comunicación real, acompañamiento escolar y preparación progresiva por niveles.",
    comisiones: [{ id: "demo-2", nombre: "Adolescentes Elemental · Mar y Jue", nivel: "Elemental", modalidad: "presencial", fecha_inicio: "2027-03-09", hay_vacantes: true,
      horarios: [{ dia_semana: 2, hora_inicio: "18:00", hora_fin: "19:30" }, { dia_semana: 4, hora_inicio: "18:00", hora_fin: "19:30" }] }],
  },
  {
    id: "demo-adultos", slug: "adultos", nombre: "Inglés para adultos", publico: "adultos", edad_minima: 18, edad_maxima: null, modalidad: "mixta",
    descripcion: "Grupos reducidos con horarios pensados para quienes estudian o trabajan.",
    comisiones: [{ id: "demo-3", nombre: "Adultos Intermedio · Mar y Jue noche", nivel: "Intermedio", modalidad: "mixta", fecha_inicio: "2027-03-09", hay_vacantes: false,
      horarios: [{ dia_semana: 2, hora_inicio: "20:00", hora_fin: "21:30" }, { dia_semana: 4, hora_inicio: "20:00", hora_fin: "21:30" }] }],
  },
];

export async function obtenerOferta(): Promise<{ cursos: CursoPublicado[]; origen: "base" | "demo" | "error" }> {
  if (!supabaseConfigurado()) return { cursos: OFERTA_DEMO, origen: "demo" };
  try {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("oferta_publicada");
    if (error) return { cursos: [], origen: "error" };
    return { cursos: (data ?? []) as CursoPublicado[], origen: "base" };
  } catch {
    return { cursos: [], origen: "error" };
  }
}
