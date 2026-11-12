import { puede, type Accion, type Perfil, type Recurso } from "@/lib/permisos";

export type Grupo = "Mi cursada" | "Enseñanza" | "Comunicación" | "Gestión" | "Instituto";
export const GRUPOS: Grupo[] = ["Mi cursada", "Enseñanza", "Comunicación", "Gestión", "Instituto"];

export interface ItemMenu { href: string; etiqueta: string; grupo: Grupo; icono: string; recurso: Recurso; accion: Accion; solo?: Perfil[] }

/** Orden = frecuencia de uso de cada rol. Se filtra con la matriz de permisos. */
const ITEMS: ItemMenu[] = [
  // Estudiante y familias
  { href: "/panel/practica", etiqueta: "Practicar", grupo: "Mi cursada", icono: "🔥", recurso: "practica", accion: "crear", solo: ["estudiante"] },
  { href: "/panel/mis-actividades", etiqueta: "Mis actividades", grupo: "Mi cursada", icono: "📝", recurso: "actividades", accion: "crear", solo: ["estudiante"] },
  { href: "/panel/familia", etiqueta: "Cursada", grupo: "Mi cursada", icono: "🎒", recurso: "inscripciones", accion: "ver", solo: ["tutor", "estudiante"] },
  { href: "/panel/material", etiqueta: "Biblioteca", grupo: "Mi cursada", icono: "📚", recurso: "biblioteca", accion: "ver", solo: ["estudiante", "tutor"] },
  { href: "/panel/cuenta", etiqueta: "Cuenta y pagos", grupo: "Mi cursada", icono: "💳", recurso: "cuenta_corriente", accion: "ver", solo: ["tutor", "estudiante"] },
  // Docente
  { href: "/panel/mis-comisiones", etiqueta: "Asistencia", grupo: "Enseñanza", icono: "✅", recurso: "asistencia", accion: "crear", solo: ["docente"] },
  { href: "/panel/actividades", etiqueta: "Actividades", grupo: "Enseñanza", icono: "📝", recurso: "actividades", accion: "aprobar", solo: ["docente", "direccion"] },
  { href: "/panel/biblioteca", etiqueta: "Biblioteca", grupo: "Enseñanza", icono: "📚", recurso: "biblioteca", accion: "crear", solo: ["docente", "direccion", "administracion"] },
  { href: "/panel/alertas", etiqueta: "Alertas", grupo: "Enseñanza", icono: "🚨", recurso: "alertas", accion: "ver" },
  { href: "/panel/informes", etiqueta: "Informes", grupo: "Enseñanza", icono: "📊", recurso: "informes", accion: "crear" },
  { href: "/panel/banco", etiqueta: "Banco de práctica", grupo: "Enseñanza", icono: "🧩", recurso: "practica", accion: "editar", solo: ["docente", "direccion"] },
  { href: "/panel/docentes", etiqueta: "Mi evaluación", grupo: "Enseñanza", icono: "⭐", recurso: "evaluacion_docente", accion: "ver", solo: ["docente"] },
  // Todos
  { href: "/panel/mensajes", etiqueta: "Mensajes", grupo: "Comunicación", icono: "💬", recurso: "mensajes", accion: "ver" },
  { href: "/panel/avisos", etiqueta: "Avisos", grupo: "Comunicación", icono: "📣", recurso: "avisos", accion: "ver" },
  // Gestión
  { href: "/panel/consultas", etiqueta: "Consultas", grupo: "Gestión", icono: "📥", recurso: "consultas", accion: "ver" },
  { href: "/panel/estudiantes", etiqueta: "Estudiantes", grupo: "Gestión", icono: "🧑‍🎓", recurso: "estudiantes", accion: "crear" },
  { href: "/panel/comisiones", etiqueta: "Comisiones", grupo: "Gestión", icono: "🗓️", recurso: "comisiones", accion: "crear" },
  { href: "/panel/cobros", etiqueta: "Cobros", grupo: "Gestión", icono: "💰", recurso: "cuenta_corriente", accion: "aprobar" },
  { href: "/panel/gastos", etiqueta: "Gastos", grupo: "Gestión", icono: "🧾", recurso: "gastos", accion: "ver" },
  // Dirección
  { href: "/panel/tablero", etiqueta: "Tablero", grupo: "Instituto", icono: "📈", recurso: "tablero", accion: "ver" },
  { href: "/panel/docentes", etiqueta: "Docentes", grupo: "Instituto", icono: "👩‍🏫", recurso: "evaluacion_docente", accion: "crear" },
  { href: "/panel/sitio", etiqueta: "Sitio web", grupo: "Instituto", icono: "🌐", recurso: "sitio", accion: "editar" },
];

export function menuPara(perfiles: readonly Perfil[]): ItemMenu[] {
  const vistos = new Set<string>();
  return ITEMS.filter((i) => {
    if (!puede(perfiles, i.recurso, i.accion)) return false;
    if (i.solo && !i.solo.some((p) => perfiles.includes(p))) return false;
    if (vistos.has(i.href)) return false; // una misma ruta aparece una sola vez
    vistos.add(i.href);
    return true;
  });
}
