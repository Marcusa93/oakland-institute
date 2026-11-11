// Módulo común (sin "use client"): lo usan páginas de servidor, formularios
// y la sección del estudiante. No accede a datos.
import type { Tono } from "@/componentes/ui";

export const UUID = /^[0-9a-f-]{36}$/i;

export const HABILIDADES = [
  ["vocabulario", "Vocabulario"], ["gramatica", "Gramática"], ["lectura", "Lectura"],
  ["escucha", "Escucha"], ["escritura", "Escritura"], ["habla", "Habla"],
] as const;
export type Habilidad = (typeof HABILIDADES)[number][0];
export const ETIQUETA_HABILIDAD: Record<string, string> = Object.fromEntries(HABILIDADES);
export const ICONO_HABILIDAD: Record<string, string> = {
  vocabulario: "📚", gramatica: "🧩", lectura: "📖", escucha: "🎧", escritura: "✍️", habla: "🗣️",
};

export const EVALUACIONES = [
  ["practica", "Práctica", "No lleva nota: sirve para ejercitar."],
  ["formativa", "Formativa", "Lleva nota y el estudiante ve sus aciertos al entregar."],
  ["acreditante", "Acreditante", "Cuenta para la acreditación: los aciertos se ven recién cuando publicás la nota."],
] as const;
export type Evaluacion = (typeof EVALUACIONES)[number][0];
export const ETIQUETA_EVALUACION: Record<string, string> = Object.fromEntries(EVALUACIONES.map(([v, e]) => [v, e]));
export const TONO_EVALUACION: Record<string, Tono> = { practica: "neutro", formativa: "marca", acreditante: "alerta" };

export const ESTADO_ACTIVIDAD: Record<string, [string, Tono]> = {
  borrador: ["Borrador", "neutro"], publicada: ["Publicada", "exito"], cerrada: ["Cerrada", "neutro"],
};

export const REACCIONES = [
  ["excelente", "Excelente", "🌟"], ["muy_bien", "Muy bien", "👏"], ["bien", "Bien", "👍"], ["a_mejorar", "A mejorar", "💪"],
] as const;
export type Reaccion = (typeof REACCIONES)[number][0];
export const REACCION: Record<string, { etiqueta: string; icono: string }> = Object.fromEntries(
  REACCIONES.map(([v, etiqueta, icono]) => [v, { etiqueta, icono }]),
);

/** Frases de devolución de un toque (se agregan al texto, el docente las edita). */
export const FRASES_DEVOLUCION = [
  "¡Muy buen trabajo!",
  "Revisá la conjugación de los verbos en tercera persona.",
  "Cuidá el orden de las palabras en la oración.",
  "Sumá vocabulario nuevo de la unidad.",
  "Seguí practicando: vas por buen camino.",
] as const;

/** Momento en milisegundos (fuera del render para no romper la pureza de los componentes). */
export function ahora() {
  return Date.now();
}

/** Texto y tono del vencimiento de una actividad. */
export function vencimiento(cierra: string | null | undefined, referencia = ahora()): { texto: string; tono: Tono; urgente: boolean; vencida: boolean } {
  if (!cierra) return { texto: "Sin fecha de cierre", tono: "neutro", urgente: false, vencida: false };
  const ms = new Date(cierra).getTime() - referencia;
  if (Number.isNaN(ms)) return { texto: "—", tono: "neutro", urgente: false, vencida: false };
  if (ms <= 0) return { texto: "Cerró", tono: "neutro", urgente: false, vencida: true };
  const horas = ms / 3_600_000;
  if (horas < 1) return { texto: `Cierra en ${Math.max(1, Math.round(ms / 60_000))} min`, tono: "peligro", urgente: true, vencida: false };
  if (horas < 24) return { texto: `Cierra en ${Math.round(horas)} h`, tono: "peligro", urgente: true, vencida: false };
  const dias = Math.round(horas / 24);
  if (dias <= 2) return { texto: `Cierra en ${dias} ${dias === 1 ? "día" : "días"}`, tono: "alerta", urgente: false, vencida: false };
  return { texto: `Cierra en ${dias} días`, tono: "marca", urgente: false, vencida: false };
}

/** "7.50" → "7,5" */
export function numero(valor: string | number | null | undefined, decimales = 2) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: decimales }) : "—";
}

export function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((100 * parte) / total) : 0;
}

// ---------------------------------------------------------------------
// Editor de actividades: forma de los datos y plantillas de demo
// ---------------------------------------------------------------------
export interface PreguntaEditor {
  tipo: "opcion" | "texto";
  enunciado: string;
  opciones: string[];
  correcta: number | null;
}

export interface ActividadEditor {
  titulo: string;
  consigna: string;
  habilidad: Habilidad;
  evaluacion: Evaluacion;
  puntaje_max: string;
  preguntas: PreguntaEditor[];
}

export interface Plantilla extends ActividadEditor {
  clave: string;
  nombre: string;
  descripcion: string;
  icono: string;
  /** Días hasta el cierre que se proponen al cargar la plantilla. */
  dias: number;
}

const op = (enunciado: string, opciones: string[], correcta: number): PreguntaEditor => ({ tipo: "opcion", enunciado, opciones, correcta });
const abierta = (enunciado: string): PreguntaEditor => ({ tipo: "texto", enunciado, opciones: [], correcta: null });

export const PLANTILLAS: Plantilla[] = [
  {
    clave: "vocabulario", nombre: "Quiz de vocabulario", descripcion: "5 preguntas de opción múltiple sobre la casa.", icono: "📚", dias: 3,
    titulo: "Vocabulary quiz: around the house",
    consigna: "Choose the correct word for each sentence. Elegí la palabra correcta en cada oración.",
    habilidad: "vocabulario", evaluacion: "formativa", puntaje_max: "10",
    preguntas: [
      op("We cook dinner in the ___.", ["bedroom", "kitchen", "garage"], 1),
      op("I sleep in my ___.", ["bed", "fridge", "sofa"], 0),
      op("Put the milk in the ___.", ["oven", "wardrobe", "fridge"], 2),
      op("We watch TV in the ___.", ["living room", "bathroom", "garden"], 0),
      op("I brush my teeth in the ___.", ["kitchen", "bathroom", "hall"], 1),
    ],
  },
  {
    clave: "gramatica", nombre: "Present simple", descripcion: "Opción múltiple + una oración propia.", icono: "🧩", dias: 5,
    titulo: "Grammar check: present simple",
    consigna: "Complete with the correct form of the verb. Completá con la forma correcta del verbo.",
    habilidad: "gramatica", evaluacion: "formativa", puntaje_max: "10",
    preguntas: [
      op("She ___ in Monteros.", ["live", "lives", "living"], 1),
      op("They ___ football on Saturdays.", ["play", "plays", "playing"], 0),
      op("My brother ___ like coffee.", ["don't", "doesn't", "isn't"], 1),
      op("___ you speak English?", ["Does", "Are", "Do"], 2),
      abierta("Write one sentence about your daily routine using the present simple."),
    ],
  },
  {
    clave: "lectura", nombre: "Reading corto", descripcion: "Un texto breve con preguntas de comprensión.", icono: "📖", dias: 7,
    titulo: "Reading: a day at the market",
    consigna: "Read the text and answer the questions.\n\nEvery Saturday, Sofía goes to the market with her grandmother. They buy fruit, vegetables and fresh bread. Sofía loves oranges, but her grandmother prefers lemons. After shopping, they drink a hot chocolate at a small café.",
    habilidad: "lectura", evaluacion: "formativa", puntaje_max: "10",
    preguntas: [
      op("When does Sofía go to the market?", ["On Sundays", "On Saturdays", "Every day"], 1),
      op("Who goes with her?", ["Her mother", "Her friend", "Her grandmother"], 2),
      op("What fruit does Sofía love?", ["Oranges", "Lemons", "Apples"], 0),
      abierta("What do they do after shopping? Answer in a full sentence."),
    ],
  },
  {
    clave: "escritura", nombre: "Writing corto", descripcion: "Producción escrita breve, de corrección manual.", icono: "✍️", dias: 7,
    titulo: "Writing: my favourite place",
    consigna: "Write 60–80 words about your favourite place. Say where it is, what you can do there and why you like it.",
    habilidad: "escritura", evaluacion: "acreditante", puntaje_max: "10",
    preguntas: [abierta("Your text (60–80 words).")],
  },
];
