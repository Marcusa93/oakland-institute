/** Resumen semanal: tipo de `resumen_semanal` y el texto para compartir. */

export interface ResumenSemanal {
  desde: string; hasta: string;
  asistencia: { clases: number; presente: number; tarde: number; ausente: number; justificada: number };
  entregadas: number;
  notas: { titulo: string; nota: number | string | null; puntaje_max: number | string; reaccion: string | null }[];
  sin_entregar: { titulo: string; cierra_en: string }[];
  proximas: { titulo: string; cierra_en: string }[];
  practica: { xp: number; ejercicios: number; aciertos: number; dias: number };
  xp_semana_anterior: number;
  racha: number | null;
  meta_semanal: number | null;
  medallas: { nombre: string; icono: string }[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const plural = (c: number, uno: string, varios: string) => `${c} ${c === 1 ? uno : varios}`;

/** Normaliza números que llegan como texto desde la base. */
export function normalizarResumen(r: ResumenSemanal): ResumenSemanal {
  return {
    ...r,
    asistencia: {
      clases: n(r.asistencia?.clases), presente: n(r.asistencia?.presente), tarde: n(r.asistencia?.tarde),
      ausente: n(r.asistencia?.ausente), justificada: n(r.asistencia?.justificada),
    },
    entregadas: n(r.entregadas),
    practica: { xp: n(r.practica?.xp), ejercicios: n(r.practica?.ejercicios), aciertos: n(r.practica?.aciertos), dias: n(r.practica?.dias) },
    xp_semana_anterior: n(r.xp_semana_anterior),
    racha: r.racha === null || r.racha === undefined ? null : n(r.racha),
    meta_semanal: r.meta_semanal === null || r.meta_semanal === undefined ? null : n(r.meta_semanal),
    notas: r.notas ?? [], sin_entregar: r.sin_entregar ?? [], proximas: r.proximas ?? [], medallas: r.medallas ?? [],
  };
}

/**
 * Una oración clara para la familia (o para el estudiante, en segunda
 * persona). Solo menciona lo que pasó: sin juicios ni comparaciones con otros.
 */
export function fraseResumen(r: ResumenSemanal, nombre: string, esPropio: boolean, actual: boolean): string {
  const a = r.asistencia;
  const vino = a.presente + a.tarde;
  const partes: string[] = [];
  if (a.clases > 0) {
    partes.push(esPropio ? `viniste a ${vino} de ${plural(a.clases, "clase", "clases")}` : `vino a ${vino} de ${plural(a.clases, "clase", "clases")}`);
  }
  if (r.entregadas > 0) partes.push(`${esPropio ? "entregaste" : "entregó"} ${plural(r.entregadas, "actividad", "actividades")}`);
  if (r.practica.dias > 0) {
    partes.push(`${esPropio ? "practicaste" : "practicó"} ${plural(r.practica.dias, "día", "días")} (${r.practica.xp} XP)`);
  }
  const cuando = actual ? "Esta semana" : "La semana pasada";
  let frase = partes.length
    ? `${cuando} ${esPropio ? "" : `${nombre} `}${unir(partes)}.`
    : `${cuando} ${actual ? "todavía no hay" : "no hubo"} ${esPropio ? "actividad tuya" : `actividad de ${nombre}`} registrada en el campus.`;
  if (r.notas.length) frase += ` ${esPropio ? "Tenés" : "Tiene"} ${plural(r.notas.length, "corrección nueva", "correcciones nuevas")}.`;
  if (r.medallas.length) frase += ` ${esPropio ? "Ganaste" : "Ganó"} ${r.medallas.map((m) => `«${m.nombre}»`).join(", ")}.`;
  if (actual && r.proximas.length) frase += ` ${plural(r.proximas.length, "actividad vence", "actividades vencen")} en los próximos días.`;
  return frase.replace(/\s+/g, " ").trim();
}

function unir(partes: string[]) {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}
