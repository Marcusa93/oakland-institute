/**
 * Matriz de permisos por recurso y acción (capa de aplicación).
 *
 * Sirve para armar la navegación y cortar temprano en el servidor. La barrera
 * que realmente protege los datos es la base (RLS + funciones): esta matriz
 * debe ser igual o MÁS restrictiva que las políticas, nunca más permisiva.
 * Documento de referencia: docs/02-permisos.md
 */
export const PERFILES = ["visitante", "estudiante", "tutor", "docente", "administracion", "direccion"] as const;
export type Perfil = (typeof PERFILES)[number];

export type Accion = "ver" | "crear" | "editar" | "aprobar";

/** Alcance: sobre qué filas vale el permiso. La base lo hace cumplir. */
export type Alcance = "todo" | "propio" | "vinculados" | "sus_comisiones" | "publicado";

type Regla = Partial<Record<Accion, Alcance>>;

export const MATRIZ = {
  oferta_publica: {
    visitante: { ver: "publicado", crear: "propio" }, // crear = enviar consulta
    estudiante: { ver: "publicado" },
    tutor: { ver: "publicado" },
    docente: { ver: "publicado" },
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  consultas: {
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  estudiantes: {
    estudiante: { ver: "propio" },
    tutor: { ver: "vinculados" },
    docente: { ver: "sus_comisiones" },
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  datos_personales: {
    estudiante: { ver: "propio" },
    tutor: { ver: "vinculados" }, // requiere permiso documental
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  vinculos: {
    tutor: { ver: "propio" }, // aceptar o rechazar su propia invitación
    administracion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
  },
  comisiones: {
    estudiante: { ver: "propio" },
    tutor: { ver: "vinculados" },
    docente: { ver: "sus_comisiones" },
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  inscripciones: {
    estudiante: { ver: "propio" },
    tutor: { ver: "vinculados" }, // requiere permiso académico
    docente: { ver: "sus_comisiones" },
    administracion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
  },
  asistencia: {
    estudiante: { ver: "propio" },
    tutor: { ver: "vinculados" },
    docente: { ver: "sus_comisiones", crear: "sus_comisiones", editar: "sus_comisiones" },
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  documentos: {
    estudiante: { ver: "propio" },
    tutor: { ver: "vinculados" }, // requiere permiso documental
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  cuenta_corriente: {
    estudiante: { ver: "propio", crear: "propio" }, // solo si es su propio responsable de pago; crear = informar transferencia
    tutor: { ver: "vinculados", crear: "propio" }, // requiere permiso económico; crear = informar transferencia
    administracion: { ver: "todo", crear: "todo", aprobar: "todo" },
    direccion: { ver: "todo", crear: "todo", aprobar: "todo" },
  },
  aranceles_y_beneficios: {
    administracion: { ver: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
  },
  gastos: {
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  pagos_docentes: {
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  avisos: {
    estudiante: { ver: "propio" },
    tutor: { ver: "propio" },
    docente: { ver: "propio", crear: "sus_comisiones" }, // nunca económicos ni institucionales
    administracion: { ver: "todo", crear: "todo" },
    direccion: { ver: "todo", crear: "todo" },
  },
  tablero: {
    direccion: { ver: "todo" },
  },
  roles_y_configuracion: {
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  auditoria: {
    direccion: { ver: "todo" },
  },
  actividades: {
    estudiante: { ver: "propio", crear: "propio" }, // crear = entregar
    tutor: { ver: "vinculados" }, // notas publicadas
    docente: { ver: "sus_comisiones", crear: "sus_comisiones", editar: "sus_comisiones", aprobar: "sus_comisiones" }, // aprobar = corregir
    administracion: { ver: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
  },
  practica: {
    estudiante: { ver: "propio", crear: "propio" },
    docente: { ver: "sus_comisiones", crear: "todo", editar: "todo", aprobar: "todo" }, // banco de ejercicios
    direccion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
  },
  biblioteca: {
    estudiante: { ver: "sus_comisiones" }, // lo compartido con su comisión
    tutor: { ver: "vinculados" },
    docente: { ver: "todo", crear: "todo", editar: "propio" }, // la biblioteca es del equipo
    administracion: { ver: "todo", crear: "todo", editar: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  alertas: {
    docente: { ver: "sus_comisiones", editar: "sus_comisiones" },
    administracion: { ver: "todo", editar: "todo" },
    direccion: { ver: "todo", editar: "todo" },
  },
  informes: {
    tutor: { ver: "vinculados" }, // los enviados a la familia
    estudiante: { ver: "propio" },
    docente: { ver: "propio", crear: "sus_comisiones" },
    administracion: { ver: "propio", crear: "todo" },
    direccion: { ver: "todo", crear: "todo" },
  },
  evaluacion_docente: {
    docente: { ver: "propio" }, // solo lo compartido
    direccion: { ver: "todo", crear: "todo", editar: "todo" },
  },
  mensajes: {
    estudiante: { ver: "propio", crear: "propio" },
    tutor: { ver: "propio", crear: "propio" },
    docente: { ver: "propio", crear: "sus_comisiones" },
    administracion: { ver: "propio", crear: "todo" },
    direccion: { ver: "todo", crear: "todo" },
  },
  sitio: {
    administracion: { ver: "todo", editar: "todo" },
    direccion: { ver: "todo", editar: "todo" },
  },
  ayuda: {
    visitante: { ver: "publicado" },
    estudiante: { ver: "publicado" },
    tutor: { ver: "publicado" },
    docente: { ver: "publicado" },
    administracion: { ver: "todo" },
    direccion: { ver: "todo", crear: "todo", editar: "todo", aprobar: "todo" },
  },
} as const satisfies Record<string, Partial<Record<Perfil, Regla>>>;

export type Recurso = keyof typeof MATRIZ;

export function alcance(perfiles: readonly Perfil[], recurso: Recurso, accion: Accion): Alcance | null {
  const reglas = MATRIZ[recurso] as Partial<Record<Perfil, Regla>>;
  const orden: Alcance[] = ["todo", "sus_comisiones", "vinculados", "propio", "publicado"];
  const encontrados = perfiles.map((p) => reglas[p]?.[accion]).filter((a): a is Alcance => Boolean(a));
  return orden.find((a) => encontrados.includes(a)) ?? null;
}

export function puede(perfiles: readonly Perfil[], recurso: Recurso, accion: Accion) {
  return alcance(perfiles, recurso, accion) !== null;
}

export const esGestion = (perfiles: readonly Perfil[]) =>
  perfiles.includes("administracion") || perfiles.includes("direccion");
