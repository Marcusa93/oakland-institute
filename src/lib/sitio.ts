import "server-only";
import { z } from "zod";
import { institucion, supabaseConfigurado } from "@/config/institucion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Contenido editable de la landing (tabla `sitio_contenido`, una fila por
 * sección). Lo que no está cargado, o no pasa la validación, sale de los
 * valores por defecto de abajo, que son los textos que la página tenía en
 * código. Los cursos y horarios NO están acá: salen de Comisiones.
 *
 * Los componentes cliente solo pueden importar los TIPOS de este módulo
 * (`import type`): el resto es del servidor.
 */

export const CLAVES_SITIO = ["portada", "grupos", "diferenciales", "propuestas", "pasos", "preguntas", "contacto", "anuncio", "certificaciones"] as const;
export type ClaveSitio = (typeof CLAVES_SITIO)[number];

const texto = (max: number) => z.string().trim().max(max);
const bilingue = (max: number) => z.object({ es: texto(max), en: texto(max) });
/** Bilingüe con castellano obligatorio (el inglés puede faltar: se muestra el castellano). */
const bilingueRequerido = (max: number) => z.object({ es: texto(max).min(1), en: texto(max) });

/** Enlaces seguros: web (http/https), rutas internas o anclas de la página. */
const enlace = z.string().trim().max(300).refine(
  (v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v) || /^\/[^\s]*$/.test(v) || /^#[\w-]+$/.test(v),
  "Usá una dirección web (https://…), una ruta del sitio (/…) o una sección (#cursos).",
);

export const esquemasSitio = {
  portada: z.object({
    /** Vacío = se mantiene el título animado "Hablá inglés sin miedo." */
    titulo: bilingue(80),
    subtitulo: bilingueRequerido(300),
  }),
  /** Grupos por edad, agrupados en tramos (la "escalera" de la portada). */
  grupos: z.array(z.object({
    tramo: bilingueRequerido(40),
    grupos: z.array(z.object({ nombre: texto(40).min(1), edad: bilingue(40) })).min(1).max(12),
  })).max(6),
  /** Lo que distingue al instituto, en frases cortas. */
  diferenciales: z.array(bilingueRequerido(60)).max(8),
  /** Propuestas además de los cursos: una pregunta y su respuesta. */
  propuestas: z.array(z.object({ pregunta: bilingueRequerido(120), respuesta: bilingueRequerido(240), cuando: bilingue(80) })).max(8),
  pasos: z.array(z.object({ titulo: bilingueRequerido(60), texto: bilingueRequerido(240) })).min(1).max(8),
  preguntas: z.array(z.object({ pregunta: bilingueRequerido(160), respuesta: bilingueRequerido(800) })).max(20),
  contacto: z.object({
    direccion: texto(160),
    telefono: texto(40),
    whatsapp: texto(40).refine((v) => v === "" || /^\+?[\d\s-]{8,20}$/.test(v), "Escribí el WhatsApp con código de área, solo números (ej.: +54 9 3863 123456)."),
    email: z.union([z.literal(""), z.email("Revisá el email.")]),
    /** Horario de atención (ej.: «Lunes a viernes de 18 a 22 h»). */
    horario: bilingue(120).default({ es: "", en: "" }),
    redes: z.array(z.object({
      nombre: texto(30).min(1),
      url: z.string().trim().max(300).regex(/^https:\/\/[^\s]+$/i, "Las redes van con dirección completa (https://…)."),
    })).max(6),
  }),
  anuncio: z.object({
    activo: z.boolean(),
    texto: bilingue(200),
    enlace,
    textoEnlace: bilingue(40),
  }).refine((a) => !a.activo || a.texto.es.length > 0, { message: "Para activar el anuncio escribí el texto en castellano.", path: ["texto", "es"] }),
  certificaciones: z.array(z.object({ nombre: bilingueRequerido(80), descripcion: bilingue(300) })).max(10),
} satisfies Record<ClaveSitio, z.ZodType>;

export type Bilingue = { es: string; en: string };
export type Portada = z.infer<typeof esquemasSitio.portada>;
export type Paso = z.infer<typeof esquemasSitio.pasos>[number];
export type Tramo = z.infer<typeof esquemasSitio.grupos>[number];
export type Propuesta = z.infer<typeof esquemasSitio.propuestas>[number];
export type Pregunta = z.infer<typeof esquemasSitio.preguntas>[number];
export type Contacto = z.infer<typeof esquemasSitio.contacto>;
export type Anuncio = z.infer<typeof esquemasSitio.anuncio>;
export type Certificacion = z.infer<typeof esquemasSitio.certificaciones>[number];
export interface ContenidoSitio {
  portada: Portada;
  grupos: Tramo[];
  diferenciales: Bilingue[];
  propuestas: Propuesta[];
  pasos: Paso[];
  preguntas: Pregunta[];
  contacto: Contacto;
  anuncio: Anuncio;
  certificaciones: Certificacion[];
}

const bi = (es: string, en: string): Bilingue => ({ es, en });

const g = (nombre: string, es: string, en: string) => ({ nombre, edad: bi(es, en) });

/**
 * Textos de la landing. Grupos, propuestas, contacto y horarios vienen de las
 * piezas de difusión del instituto (flyers e Instagram, nov. 2026). Desde el
 * panel (Sitio web) se reemplazan sin tocar código.
 */
export const SITIO_POR_DEFECTO: ContenidoSitio = {
  portada: {
    titulo: bi("", ""),
    subtitulo: bi(
      "Grupos para cada edad, desde los 4 años hasta adultos. Clases con enfoque comunicativo para que hables desde el primer día.",
      "Groups for every age, from 4-year-olds to adults. Communicative classes so you speak from day one.",
    ),
  },
  grupos: [
    { tramo: bi("Kinder", "Kinder"), grupos: [g("Kinder", "4 y 5 años", "4 and 5"), g("Kinder A", "6 años", "6"), g("Kinder B", "7 años", "7")] },
    { tramo: bi("Kids", "Kids"), grupos: [g("Kids 1", "8 años", "8"), g("Kids 2", "9 años", "9"), g("Kids starter", "10 años", "10"), g("Kids 4", "11 años", "11")] },
    { tramo: bi("Teens", "Teens"), grupos: [g("Teens 1", "12 años", "12"), g("Teens 2", "13 años", "13"), g("Teens 3", "14 años", "14"), g("Teens 4", "15 años", "15")] },
    { tramo: bi("Adultos", "Adults"), grupos: [g("Intensivo I", "Adultos", "Adults"), g("Intensivo II", "Adultos", "Adults"), g("Avanzado I", "", ""), g("Avanzado II", "", "")] },
  ],
  diferenciales: [
    bi("Enfoque comunicativo", "Communicative approach"),
    bi("Certificación nacional", "National certification"),
    bi("Ambiente climatizado", "Air-conditioned classrooms"),
    bi("Material de estudio", "Study materials"),
    bi("Horarios de siesta, tarde y noche", "Midday, afternoon and evening classes"),
    bi("Presencial y virtual", "In person and online"),
  ],
  propuestas: [
    {
      pregunta: bi("¿Querés practicar solo speaking?", "Just want to practise speaking?"),
      respuesta: bi("Speaking club: conversamos en inglés sobre distintos temas, con un cafecito y en un ambiente distendido.", "Speaking club: we chat in English about different topics, over a coffee, in a relaxed setting."),
      cuando: bi("Viernes 16:30 · Sábados 17 h", "Fridays 4:30 pm · Saturdays 5 pm"),
    },
    {
      pregunta: bi("¿Tenés examen de inglés en la escuela o la facu?", "Got an English exam at school or uni?"),
      respuesta: bi("Clases de refuerzo para exámenes escritos y orales: reforzamos contenidos para que mejores tus notas.", "Exam support classes, written and oral: we go over the content so you improve your marks."),
      cuando: bi("Por la mañana y la siesta", "Mornings and early afternoons"),
    },
    {
      pregunta: bi("¿Querés rendir un examen internacional?", "Planning to sit an international exam?"),
      respuesta: bi("Te preparamos y te orientamos sobre qué examen te conviene.", "We prepare you and help you choose the right exam."),
      cuando: bi("", ""),
    },
    {
      pregunta: bi("¿Preferís clases individuales u online?", "Prefer one-to-one or online classes?"),
      respuesta: bi("También damos clases individuales y virtuales, además de los grupos presenciales.", "We also teach one-to-one and online, as well as in-person groups."),
      cuando: bi("", ""),
    },
    {
      pregunta: bi("¿No sabés a qué grupo ir?", "Not sure which group to join?"),
      respuesta: bi("Consultoría y test de nivel gratuitos: te guiamos personalmente hacia el mejor curso para vos.", "Free advice and level test: we personally guide you to the right course."),
      cuando: bi("Gratis", "Free"),
    },
  ],
  // Un recorrido real, en orden: por eso va numerado.
  pasos: [
    { titulo: bi("Nos escribís", "You write to us"), texto: bi("Por WhatsApp o pasando por el instituto. Contanos para quién es y qué horarios te quedan cómodos.", "On WhatsApp or by dropping in. Tell us who it's for and which times suit you.") },
    { titulo: bi("Test de nivel gratis", "Free level test"), texto: bi("Una charla corta para ver desde dónde arrancás. Si nunca estudiaste, empezás desde el principio.", "A short chat to see where you're starting from. If you've never studied, you start from the beginning.") },
    { titulo: bi("Te ubicamos", "We find your group"), texto: bi("Elegimos juntos el grupo por edad, nivel y horario.", "Together we choose the group by age, level and schedule.") },
    { titulo: bi("Te inscribís", "You enrol"), texto: bi("Solo necesitás una fotocopia del DNI. ¡Y arrancás!", "All you need is a copy of your ID. And you're in!") },
  ],
  // Sobre cómo funciona la inscripción. No afirman nada del instituto que no
  // esté confirmado (precios, certificaciones, trayectoria).
  preguntas: [
    {
      pregunta: bi("¿Qué necesito para inscribirme?", "What do I need to enrol?"),
      respuesta: bi("Una fotocopia del DNI de quien va a cursar. Si es menor, la inscripción la hace una persona adulta responsable.", "A copy of the student's ID. For children, a responsible adult completes the enrolment."),
    },
    {
      pregunta: bi("¿Cómo sé qué nivel me corresponde?", "How do I know my level?"),
      respuesta: bi("Hacemos un test de nivel gratuito antes de asignarte un grupo. El test de esta página es solo una orientación.", "We do a free level test before placing you in a group. The quiz on this page is only a guide."),
    },
    {
      pregunta: bi("¿Dónde están y cuándo atienden?", "Where are you and when are you open?"),
      respuesta: bi("En Leandro Aráoz 39, planta alta, Monteros, frente a la plaza Bernabé Aráoz. Atención presencial de lunes a viernes de 18 a 22 h, y por WhatsApp.", "At Leandro Aráoz 39, upstairs, Monteros, opposite Bernabé Aráoz square. In person Monday to Friday, 6 to 10 pm, and on WhatsApp."),
    },
    {
      pregunta: bi("¿La preinscripción me asegura el lugar?", "Does pre-registering save my spot?"),
      respuesta: bi("No. Nos avisa que querés anotarte. El lugar queda asegurado cuando administración confirma la inscripción.", "No. It lets us know you want to join. Your spot is secured once the office confirms your enrolment."),
    },
    {
      pregunta: bi("¿Quién inscribe a un menor?", "Who enrols a child?"),
      respuesta: bi("Una persona adulta responsable, que después sigue la cursada, la asistencia y la cuenta desde su propio acceso.", "A responsible adult, who can then follow classes, attendance and payments from their own account."),
    },
    {
      pregunta: bi("¿Cuánto cuesta?", "How much does it cost?"),
      respuesta: bi("Matrícula y cuota accesibles. Te pasamos los valores vigentes por WhatsApp o cuando respondemos tu consulta.", "Affordable enrolment and monthly fees. We'll send you current prices on WhatsApp or when we reply to your enquiry."),
    },
  ],
  contacto: {
    direccion: institucion.contacto.direccion ?? "",
    telefono: institucion.contacto.telefono ?? "",
    whatsapp: institucion.contacto.whatsapp ?? "",
    email: institucion.contacto.email ?? "",
    horario: bi("Lunes a viernes de 18 a 22 h", "Monday to Friday, 6 to 10 pm"),
    redes: [{ nombre: "Instagram", url: "https://www.instagram.com/_oakland.english/" }],
  },
  anuncio: { activo: false, texto: bi("", ""), enlace: "", textoEnlace: bi("", "") },
  certificaciones: institucion.certificaciones.map((c) => ({ nombre: bi(c.nombre, ""), descripcion: bi(c.descripcion, "") })),
};

/** Valida una sección; si no pasa, devuelve el valor por defecto. */
function seccion<K extends ClaveSitio>(clave: K, valor: unknown): ContenidoSitio[K] {
  const r = esquemasSitio[clave].safeParse(valor);
  return (r.success ? r.data : SITIO_POR_DEFECTO[clave]) as ContenidoSitio[K];
}

export interface ContenidoConFechas { contenido: ContenidoSitio; actualizado: Partial<Record<ClaveSitio, string>>; error: boolean }

/** Lee `sitio_contenido` (lectura pública) y completa con los valores por defecto. Nunca lanza. */
export async function obtenerContenidoSitioDetallado(): Promise<ContenidoConFechas> {
  const contenido: ContenidoSitio = structuredClone(SITIO_POR_DEFECTO);
  const actualizado: ContenidoConFechas["actualizado"] = {};
  if (!supabaseConfigurado()) return { contenido, actualizado, error: false };
  try {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.from("sitio_contenido").select("clave, valor, actualizado_en");
    if (error) return { contenido, actualizado, error: true };
    const datos = contenido as unknown as Record<ClaveSitio, unknown>;
    for (const fila of (data ?? []) as { clave: string; valor: unknown; actualizado_en: string }[]) {
      if (!(CLAVES_SITIO as readonly string[]).includes(fila.clave)) continue;
      const clave = fila.clave as ClaveSitio;
      datos[clave] = seccion(clave, fila.valor);
      actualizado[clave] = fila.actualizado_en;
    }
    return { contenido, actualizado, error: false };
  } catch {
    return { contenido, actualizado, error: true };
  }
}

export async function obtenerContenidoSitio(): Promise<ContenidoSitio> {
  return (await obtenerContenidoSitioDetallado()).contenido;
}

/** Inglés con respaldo en castellano (para `Traducible`). */
export function enIngles(t: Bilingue) {
  return t.en || t.es;
}

/** Enlace de WhatsApp a partir del número cargado (opcionalmente con un mensaje armado). */
export function enlaceWhatsapp(numero: string, mensaje?: string) {
  const digitos = numero.replace(/\D/g, "");
  if (!digitos) return null;
  return `https://wa.me/${digitos}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;
}

/** Enlace a Google Maps para llegar a la dirección. */
export function enlaceMapa(direccion: string) {
  return direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${direccion}, ${institucion.localidad}, Argentina`)}` : null;
}
