import "server-only";
import { mensajeDeError } from "@/lib/sesion";

/**
 * Códigos del campus que `mensajeDeError` (src/lib/sesion.ts) todavía no
 * traduce. Se resuelven acá y el resto pasa al traductor general.
 * Pendiente: sumarlos a `mensajeDeError` y borrar este archivo.
 */
export function errorCampus(error: { message?: string } | null | undefined): string {
  const m = error?.message ?? "";
  const propio = m.match(/NOTA_FUERA_DE_RANGO: entre 0 y ([\d.]+)/);
  if (propio) return `La nota tiene que estar entre 0 y ${Number(propio[1]).toLocaleString("es-AR")}.`;
  const codigos: Array<[RegExp, string]> = [
    [/ACTIVIDAD_NO_DISPONIBLE/, "La actividad ya no está disponible para entregar."],
    [/FUERA_DE_PLAZO/, "La actividad está fuera de plazo: ya cerró o todavía no abrió."],
    [/YA_CORREGIDA/, "Tu docente ya corrigió esta entrega: no se puede reemplazar."],
    [/NOTA_FUERA_DE_RANGO/, "La nota está fuera del puntaje de la actividad."],
    [/FALTA_AUDIO/, "Esta actividad es de speaking: grabá tu respuesta antes de entregar."],
    [/AUDIO_INVALIDO/, "No encontramos la grabación. Volvé a grabarla y entregá de nuevo."],
    [/SIN_DESTINATARIOS/, "El aviso no tiene destinatarios."],
    [/actividades_check|cierra_en/, "La fecha de cierre tiene que ser posterior a la apertura."],
  ];
  return codigos.find(([p]) => p.test(m))?.[1] ?? mensajeDeError(error);
}
