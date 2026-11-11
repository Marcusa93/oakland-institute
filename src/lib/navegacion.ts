import { puede, type Accion, type Perfil, type Recurso } from "@/lib/permisos";

export interface ItemMenu { href: string; etiqueta: string; recurso: Recurso; accion: Accion; solo?: Perfil[] }

/** Orden = frecuencia de uso de cada rol. Se filtra con la matriz de permisos. */
const ITEMS: ItemMenu[] = [
  // Estudiante
  { href: "/panel/practica", etiqueta: "Practicar", recurso: "practica", accion: "crear", solo: ["estudiante"] },
  { href: "/panel/mis-actividades", etiqueta: "Mis actividades", recurso: "actividades", accion: "crear", solo: ["estudiante"] },
  // Docente
  { href: "/panel/mis-comisiones", etiqueta: "Asistencia", recurso: "asistencia", accion: "crear", solo: ["docente"] },
  { href: "/panel/actividades", etiqueta: "Actividades", recurso: "actividades", accion: "aprobar", solo: ["docente", "direccion"] },
  { href: "/panel/alertas", etiqueta: "Alertas", recurso: "alertas", accion: "ver" },
  { href: "/panel/informes", etiqueta: "Informes", recurso: "informes", accion: "crear" },
  { href: "/panel/banco", etiqueta: "Banco de práctica", recurso: "practica", accion: "editar", solo: ["docente", "direccion"] },
  // Familias
  { href: "/panel/familia", etiqueta: "Cursada", recurso: "inscripciones", accion: "ver", solo: ["tutor", "estudiante"] },
  { href: "/panel/cuenta", etiqueta: "Cuenta y pagos", recurso: "cuenta_corriente", accion: "ver", solo: ["tutor", "estudiante"] },
  // Gestión
  { href: "/panel/consultas", etiqueta: "Consultas", recurso: "consultas", accion: "ver" },
  { href: "/panel/estudiantes", etiqueta: "Estudiantes", recurso: "estudiantes", accion: "crear" },
  { href: "/panel/comisiones", etiqueta: "Comisiones", recurso: "comisiones", accion: "crear" },
  { href: "/panel/cobros", etiqueta: "Cobros", recurso: "cuenta_corriente", accion: "aprobar" },
  { href: "/panel/gastos", etiqueta: "Gastos", recurso: "gastos", accion: "ver" },
  { href: "/panel/docentes", etiqueta: "Docentes", recurso: "evaluacion_docente", accion: "ver" },
  { href: "/panel/tablero", etiqueta: "Tablero", recurso: "tablero", accion: "ver" },
  { href: "/panel/sitio", etiqueta: "Sitio web", recurso: "sitio", accion: "editar" },
  // Todos
  { href: "/panel/mensajes", etiqueta: "Mensajes", recurso: "mensajes", accion: "ver" },
  { href: "/panel/avisos", etiqueta: "Avisos", recurso: "avisos", accion: "ver" },
];

export function menuPara(perfiles: readonly Perfil[]): ItemMenu[] {
  return ITEMS.filter(
    (i) => puede(perfiles, i.recurso, i.accion) && (!i.solo || i.solo.some((p) => perfiles.includes(p))),
  );
}
