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

export const CLAVES_SITIO = ["portada", "pasos", "preguntas", "contacto", "anuncio", "certificaciones"] as const;
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
  pasos: z.array(z.object({ titulo: bilingueRequerido(60), texto: bilingueRequerido(240) })).min(1).max(8),
  preguntas: z.array(z.object({ pregunta: bilingueRequerido(160), respuesta: bilingueRequerido(800) })).max(20),
  contacto: z.object({
    direccion: texto(160),
    telefono: texto(40),
    whatsapp: texto(40).refine((v) => v === "" || /^\+?[\d\s-]{8,20}$/.test(v), "Escribí el WhatsApp con código de área, solo números (ej.: +54 9 3863 123456)."),
    email: z.union([z.literal(""), z.email("Revisá el email.")]),
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
export type Pregunta = z.infer<typeof esquemasSitio.preguntas>[number];
export type Contacto = z.infer<typeof esquemasSitio.contacto>;
export type Anuncio = z.infer<typeof esquemasSitio.anuncio>;
export type Certificacion = z.infer<typeof esquemasSitio.certificaciones>[number];
export interface ContenidoSitio {
  portada: Portada;
  pasos: Paso[];
  preguntas: Pregunta[];
  contacto: Contacto;
  anuncio: Anuncio;
  certificaciones: Certificacion[];
}

const bi = (es: string, en: string): Bilingue => ({ es, en });

/** Iguales a los textos que la landing tenía escritos en código. */
export const SITIO_POR_DEFECTO: ContenidoSitio = {
  portada: {
    titulo: bi("", ""),
    subtitulo: bi(
      "Grupos por edad y por nivel, para chicos, adolescentes y adultos. Contanos para quién es y te ayudamos a elegir.",
      "Groups by age and level, for kids, teens and adults. Tell us who it's for and we'll help you choose.",
    ),
  },
  // Un recorrido real, en orden: por eso va numerado.
  pasos: [
    { titulo: bi("Nos escribís", "You write to us"), texto: bi("Contanos para quién es y qué horarios te quedan cómodos.", "Tell us who it's for and which times suit you.") },
    { titulo: bi("Nivelación", "Placement test"), texto: bi("Una charla corta con un docente para ver desde dónde arrancás.", "A short chat with a teacher to see where you're starting from.") },
    { titulo: bi("Te ubicamos", "We find your group"), texto: bi("Elegimos juntos el grupo por edad, nivel y horario.", "Together we choose the group by age, level and schedule.") },
    { titulo: bi("Primera clase", "First class"), texto: bi("Confirmamos la inscripción y empezás.", "We confirm your enrolment and you start.") },
  ],
  // Sobre cómo funciona la inscripción. No afirman nada del instituto que no
  // esté confirmado (precios, certificaciones, trayectoria).
  preguntas: [
    {
      pregunta: bi("¿Cómo sé qué nivel me corresponde?", "How do I know my level?"),
      respuesta: bi("Antes de asignarte un grupo coordinamos una nivelación con un docente. El test de esta página es solo una orientación.", "Before placing you in a group we arrange a placement test with a teacher. The quiz on this page is only a guide."),
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
      respuesta: bi("Te pasamos los valores vigentes cuando respondemos tu consulta.", "We'll send you current fees when we reply to your enquiry."),
    },
  ],
  contacto: {
    direccion: institucion.contacto.direccion ?? "",
    telefono: institucion.contacto.telefono ?? "",
    whatsapp: institucion.contacto.whatsapp ?? "",
    email: institucion.contacto.email ?? "",
    redes: [],
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

/** Enlace de WhatsApp a partir del número cargado. */
export function enlaceWhatsapp(numero: string) {
  const digitos = numero.replace(/\D/g, "");
  return digitos ? `https://wa.me/${digitos}` : null;
}
