// Módulo común (sin "use client"): tipos de `datos_informe` y el borrador automático.
import { ETIQUETA_HABILIDAD } from "@/app/panel/actividades/comun";

export interface DatosInforme {
  periodo: { desde: string; hasta: string };
  estudiante: { nombre: string; legajo: string } | null;
  comisiones: { comision: string; nivel: string }[];
  asistencia: { clases: number; presente: number; tarde: number; ausente: number; justificada: number; porcentaje: number | null };
  actividades: { titulo: string; habilidad: string; evaluacion: string; estado: string; nota: number | string | null; puntaje_max: number | string }[];
  practica: { xp: number; ejercicios: number; aciertos: number; dias: number };
  medallas: string[];
  alertas_abiertas: { tipo: string; detalle: string }[];
}

/** Normaliza lo que devuelve la base (listas vacías, números como texto). */
export function normalizar(d: Partial<DatosInforme> | null | undefined): DatosInforme {
  const a = d?.asistencia;
  return {
    periodo: d?.periodo ?? { desde: "", hasta: "" },
    estudiante: d?.estudiante ?? null,
    comisiones: d?.comisiones ?? [],
    asistencia: {
      clases: Number(a?.clases ?? 0), presente: Number(a?.presente ?? 0), tarde: Number(a?.tarde ?? 0),
      ausente: Number(a?.ausente ?? 0), justificada: Number(a?.justificada ?? 0),
      porcentaje: a?.porcentaje === null || a?.porcentaje === undefined ? null : Number(a.porcentaje),
    },
    actividades: d?.actividades ?? [],
    practica: {
      xp: Number(d?.practica?.xp ?? 0), ejercicios: Number(d?.practica?.ejercicios ?? 0),
      aciertos: Number(d?.practica?.aciertos ?? 0), dias: Number(d?.practica?.dias ?? 0),
    },
    medallas: d?.medallas ?? [],
    alertas_abiertas: d?.alertas_abiertas ?? [],
  };
}

export interface Resumen {
  conNota: { titulo: string; habilidad: string; pct: number }[];
  promedio: number | null;
  entregadas: number;
  sinEntregar: string[];
  porHabilidad: { habilidad: string; pct: number; n: number }[];
  aciertosPractica: number | null;
}

export function resumir(d: DatosInforme): Resumen {
  const conNota = d.actividades
    .filter((a) => a.nota !== null && a.nota !== undefined && Number(a.puntaje_max) > 0)
    .map((a) => ({ titulo: a.titulo, habilidad: a.habilidad, pct: Math.round((100 * Number(a.nota)) / Number(a.puntaje_max)) }));
  const promedio = conNota.length ? Math.round(conNota.reduce((s, a) => s + a.pct, 0) / conNota.length) : null;
  const habilidades = new Map<string, number[]>();
  for (const a of conNota) habilidades.set(a.habilidad, [...(habilidades.get(a.habilidad) ?? []), a.pct]);
  const porHabilidad = [...habilidades].map(([habilidad, v]) => ({ habilidad, n: v.length, pct: Math.round(v.reduce((s, x) => s + x, 0) / v.length) }))
    .sort((a, b) => b.pct - a.pct);
  return {
    conNota, promedio, porHabilidad,
    entregadas: d.actividades.filter((a) => a.estado === "entregada" || a.estado === "corregida").length,
    sinEntregar: d.actividades.filter((a) => a.estado === "sin entregar" || a.estado === "en_curso").map((a) => a.titulo),
    aciertosPractica: d.practica.ejercicios ? Math.round((100 * d.practica.aciertos) / d.practica.ejercicios) : null,
  };
}

const fechaCorta = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const hab = (h: string) => (ETIQUETA_HABILIDAD[h] ?? h).toLowerCase();

/**
 * Borrador automático y determinístico (sin IA): arma frases a partir de los
 * datos calculados por la base. Siempre lo revisa y firma una persona.
 */
export function sugerirBorrador(d: DatosInforme, nombrePila: string): { comentario: string; recomendaciones: string } {
  const r = resumir(d);
  const a = d.asistencia;
  const partes: string[] = [];
  partes.push(`Informe del período ${fechaCorta(d.periodo.desde)} al ${fechaCorta(d.periodo.hasta)}${d.comisiones.length ? `, ${lista(d.comisiones.map((c) => `${c.comision} (${c.nivel})`))}` : ""}.`);

  if (a.clases > 0) {
    const pct = a.porcentaje ?? 0;
    const juicio = pct >= 90 ? "muy buena" : pct >= 75 ? "buena" : pct >= 60 ? "irregular" : "baja";
    partes.push(`${nombrePila} tuvo una asistencia ${juicio}: estuvo en el ${pct} % de las ${a.clases} clases registradas (${a.presente} presentes${a.tarde ? `, ${a.tarde} con llegada tarde` : ""}${a.ausente ? `, ${a.ausente} ${a.ausente === 1 ? "ausencia" : "ausencias"}` : ""}${a.justificada ? `, ${a.justificada} justificadas` : ""}).`);
  } else {
    partes.push("No hay asistencia registrada en el período.");
  }

  if (d.actividades.length) {
    partes.push(`Entregó ${r.entregadas} de ${d.actividades.length} actividades del campus${r.promedio !== null ? `, con un promedio del ${r.promedio} % del puntaje en las corregidas` : ""}.`);
    if (r.porHabilidad.length >= 2) {
      const mejor = r.porHabilidad[0];
      const peor = r.porHabilidad[r.porHabilidad.length - 1];
      if (mejor.pct - peor.pct >= 10) partes.push(`Se destaca en ${hab(mejor.habilidad)} (${mejor.pct} %) y le cuesta más ${hab(peor.habilidad)} (${peor.pct} %).`);
    } else if (r.porHabilidad.length === 1) {
      partes.push(`En ${hab(r.porHabilidad[0].habilidad)} obtuvo un ${r.porHabilidad[0].pct} % promedio.`);
    }
  } else {
    partes.push("No hubo actividades del campus en el período.");
  }

  if (d.practica.ejercicios > 0) {
    partes.push(`En la práctica en línea resolvió ${d.practica.ejercicios} ejercicios en ${d.practica.dias} ${d.practica.dias === 1 ? "día" : "días"} distintos (${r.aciertosPractica} % de aciertos, ${d.practica.xp} XP).`);
  } else {
    partes.push("No registró práctica en línea en el período.");
  }
  if (d.medallas.length) partes.push(`Medallas obtenidas: ${lista(d.medallas)}.`);

  const recs: string[] = [];
  if (a.clases > 0 && (a.porcentaje ?? 0) < 75) recs.push("Sostener la asistencia a clase: cada ausencia hace más difícil seguir el ritmo del grupo.");
  if (r.sinEntregar.length) recs.push(`Ponerse al día con ${r.sinEntregar.length === 1 ? "la actividad pendiente" : "las actividades pendientes"}: ${lista(r.sinEntregar.slice(0, 4))}${r.sinEntregar.length > 4 ? " y otras" : ""}.`);
  const floja = r.porHabilidad.filter((h) => h.pct < 60).map((h) => hab(h.habilidad));
  if (floja.length) recs.push(`Reforzar ${lista(floja)} con práctica breve y repaso de las devoluciones del docente.`);
  if (d.practica.dias < 4) recs.push("Sumar práctica en línea varias veces por semana: con 10 minutos por día alcanza para notar el avance.");
  if (d.alertas_abiertas.length) recs.push(`Dar seguimiento a lo señalado por el sistema: ${lista(d.alertas_abiertas.map((x) => x.detalle.replace(/\.$/, "").toLowerCase()))}.`);
  if (!recs.length) recs.push("Mantener el ritmo de trabajo y proponerle desafíos de mayor nivel para seguir creciendo.");

  return { comentario: partes.join(" "), recomendaciones: recs.map((x) => `• ${x}`).join("\n") };
}
