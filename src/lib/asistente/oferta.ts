import type { CursoPublicado } from "@/lib/oferta";

/**
 * Respuestas sobre cursos y horarios armadas con datos reales de la oferta
 * publicada (determinísticas: nunca inventa un horario ni una vacante).
 */
const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MODALIDAD: Record<string, string> = { presencial: "presencial", virtual: "virtual", mixta: "presencial y virtual" };

const SOBRE_OFERTA = /horari|\bhoras?\b|\bd[ií]as\b|curso|edad|\d+\s*años|niñ|hij[oa]|nene|nena|adolesc|adultos?\b|vacante|lugar|cupo|empiez|inicio|inscrib|turno|modalidad|virtual|presencial/i;

function aQuien(pregunta: string, cursos: CursoPublicado[]) {
  const edad = /(\d{1,2})\s*años/i.exec(pregunta)?.[1];
  if (edad) {
    const n = Number(edad);
    const porEdad = cursos.filter((c) => (c.edad_minima ?? 0) <= n && (c.edad_maxima ?? 99) >= n);
    if (porEdad.length) return porEdad;
  }
  if (/niñ|chic|hij|nene|nena|primaria/i.test(pregunta)) return cursos.filter((c) => c.publico === "ninos");
  if (/adolesc|teen|secundari/i.test(pregunta)) return cursos.filter((c) => c.publico === "adolescentes");
  if (/adult|grande|trabaj|noche|para m[ií]\b|yo\b/i.test(pregunta)) return cursos.filter((c) => c.publico === "adultos");
  return cursos;
}

const edades = (c: CursoPublicado) =>
  c.edad_minima && c.edad_maxima ? `de ${c.edad_minima} a ${c.edad_maxima} años` : c.edad_minima ? `desde ${c.edad_minima} años` : "todas las edades";

const fecha = (iso: string) => iso.split("-").reverse().join("/");

function dias(h: CursoPublicado["comisiones"][number]["horarios"]) {
  if (!h.length) return "horario a confirmar";
  const porHora = new Map<string, number[]>();
  for (const x of h) {
    const k = `de ${x.hora_inicio} a ${x.hora_fin}`;
    porHora.set(k, [...(porHora.get(k) ?? []), x.dia_semana]);
  }
  return [...porHora].map(([hora, d]) => `${d.map((n) => DIAS[n]).join(" y ")} ${hora}`).join("; ");
}

export function respuestaSobreOferta(pregunta: string, cursos: CursoPublicado[]) {
  if (!SOBRE_OFERTA.test(pregunta)) return null;
  if (cursos.length === 0) {
    return { texto: "Todavía no hay cursos publicados para el próximo ciclo. Dejá tu consulta en la página y te avisamos cuando estén los horarios.", fuentes: [] };
  }
  const elegidos = aQuien(pregunta, cursos);
  const lista = elegidos.length ? elegidos : cursos;
  const bloques = lista.map((c) => {
    const grupos = c.comisiones.length
      ? c.comisiones.map((k) => `• Nivel ${k.nivel}: ${dias(k.horarios)}. Empieza el ${fecha(k.fecha_inicio)}. ${k.hay_vacantes ? "Hay lugar." : "Está completo: te podemos anotar en lista de espera."}`).join("\n")
      : "• Los horarios se confirman al consultar.";
    return `${c.nombre} (${edades(c)}, ${MODALIDAD[c.modalidad] ?? c.modalidad}).\n${grupos}`;
  });
  const cierre = "Si querés, te ayudo a elegir: contame la edad y desde qué nivel arrancás, o hacé el test rápido de la página.";
  return {
    texto: `${lista.length === 1 ? "Esto es lo que tenemos:" : "Estos son los cursos publicados:"}\n\n${bloques.join("\n\n")}\n\n${cierre}`,
    fuentes: [{ slug: "oferta-publicada", titulo: "Cursos y horarios publicados" }],
  };
}
