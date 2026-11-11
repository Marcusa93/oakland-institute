// Módulo común (sin "use client"): lo usan las páginas de servidor, la lección,
// el banco de ejercicios y las acciones.

export const HABILIDADES = [
  { clave: "vocabulario", nombre: "Vocabulario", icono: "📚", lema: "Palabras para el día a día", tono: "pr-tono-marca" },
  { clave: "gramatica", nombre: "Gramática", icono: "🧩", lema: "Cómo se arman las frases", tono: "pr-tono-acento" },
  { clave: "lectura", nombre: "Lectura", icono: "📖", lema: "Entender textos cortos", tono: "pr-tono-cielo" },
  { clave: "escucha", nombre: "Escucha", icono: "🎧", lema: "Entrenar el oído", tono: "pr-tono-marca" },
  { clave: "escritura", nombre: "Escritura", icono: "✍️", lema: "Escribir sin miedo", tono: "pr-tono-acento" },
  { clave: "habla", nombre: "Habla", icono: "💬", lema: "Frases para conversar", tono: "pr-tono-cielo" },
] as const;

export type Habilidad = (typeof HABILIDADES)[number]["clave"];
export const CLAVES_HABILIDAD = HABILIDADES.map((h) => h.clave) as [Habilidad, ...Habilidad[]];
export const datosHabilidad = (h: string) => HABILIDADES.find((x) => x.clave === h);

export const TIPOS = [
  ["opcion", "Opción múltiple"],
  ["completar", "Completar el hueco"],
  ["ordenar", "Ordenar palabras"],
  ["escuchar", "Escuchar y elegir"],
] as const;
export type TipoEjercicio = (typeof TIPOS)[number][0];

export const ESTADOS_BANCO = [
  ["borrador", "Borrador"],
  ["revisado", "Revisado"],
  ["retirado", "Retirado"],
] as const;

/** Lo que llega al navegador del estudiante: nunca trae la respuesta. */
export interface EjercicioLeccion {
  id: string;
  tipo: TipoEjercicio;
  enunciado: string;
  opciones: string[];
  audio_texto: string | null;
  dificultad: number;
}

export interface MedallaNueva { codigo: string; nombre: string; icono: string }

export interface ResultadoRespuesta {
  correcta: boolean;
  respuesta: string;
  explicacion: string | null;
  xp: number;
  xp_total: number;
  xp_semana: number;
  racha: number;
  medallas_nuevas: MedallaNueva[];
}

export interface Progreso {
  xp_total: number;
  xp_semana: number;
  racha: number;
  mejor_racha: number;
  comodines: number;
  meta_semanal: number;
  alias: string | null;
  mostrar_en_ranking: boolean;
  practico_hoy: boolean;
  habilidades: { habilidad: Habilidad; disponibles: number; dominados: number }[];
  medallas: { codigo: string; nombre: string; descripcion: string; icono: string; obtenida_en: string | null }[];
}

export const LARGO_LECCION = 5;

/** XP que da un ejercicio la primera vez que se resuelve bien en el día (igual que la base). */
export const xpDe = (dificultad: number) => 10 + (dificultad - 1) * 5;

/**
 * Misma normalización que `responder_ejercicio`: ignora mayúsculas, espacios
 * y puntuación. Se usa solo para la vista previa del banco; al estudiante lo
 * corrige siempre la base.
 */
const SEPARADORES = new RegExp("[\\s\\p{P}\\p{S}]+", "gu");
export const normalizar = (s: string) => s.replace(SEPARADORES, " ").trim().toLowerCase();

/** Mezcla estable (misma semilla, mismo orden): evita diferencias entre servidor y navegador. */
export function mezclar<T>(lista: readonly T[], semilla: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619);
  const azar = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  // Para ordenar: que no aparezca ya resuelto.
  if (r.length > 1 && r.every((x, i) => x === lista[i])) r.push(r.shift()!);
  return r;
}

const HUECO = /_{2,}/;
/** Parte la frase en el hueco ("___"). */
export function partirHueco(enunciado: string): [string, string] | null {
  const m = HUECO.exec(enunciado);
  return m ? [enunciado.slice(0, m.index), enunciado.slice(m.index + m[0].length)] : null;
}
export const tieneHueco = (s: string) => HUECO.test(s);

/** Lectura: el texto va antes de una línea en blanco y la pregunta al final. */
export function partirLectura(enunciado: string): { texto: string | null; pregunta: string } {
  const i = enunciado.lastIndexOf("\n\n");
  if (i < 0) return { texto: null, pregunta: enunciado };
  return { texto: enunciado.slice(0, i).trim(), pregunta: enunciado.slice(i + 2).trim() };
}

/** Lee un texto en inglés con la voz del navegador. Devuelve false si no hay voz disponible. */
export function hablar(texto: string, lento = false): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voz = window.speechSynthesis;
  voz.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "en-US";
  u.rate = lento ? 0.6 : 0.95;
  const voces = voz.getVoices();
  const elegida = voces.find((v) => v.lang === "en-US" && /natural|google|samantha|neural/i.test(v.name))
    ?? voces.find((v) => v.lang === "en-US") ?? voces.find((v) => v.lang.startsWith("en"));
  if (elegida) u.voice = elegida;
  voz.speak(u);
  return true;
}

export const hayVoz = () => typeof window !== "undefined" && "speechSynthesis" in window;

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Las filas de `siguiente_leccion` con tipos seguros (opciones siempre como lista de textos). */
export function normalizarLeccion(filas: unknown): EjercicioLeccion[] {
  return ((filas ?? []) as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    tipo: f.tipo as TipoEjercicio,
    enunciado: String(f.enunciado ?? ""),
    opciones: Array.isArray(f.opciones) ? f.opciones.map(String) : [],
    audio_texto: (f.audio_texto as string | null) ?? null,
    dificultad: Number(f.dificultad ?? 1),
  }));
}
