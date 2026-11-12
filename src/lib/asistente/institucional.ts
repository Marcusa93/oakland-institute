import type { Contacto, Tramo } from "@/lib/sitio";

/**
 * Respuestas determinísticas con los datos que el instituto publica en su
 * sitio (panel → Sitio web): contacto y grupo según la edad. Igual que la
 * oferta, nunca inventa: si el dato no está cargado, no responde.
 */
export interface DatosInstitucionales { contacto: Contacto; grupos: Tramo[]; localidad: string }

const fuente = { slug: "sitio-web", titulo: "Datos publicados por el instituto" };

const SOBRE_CONTACTO = /whats|wsp|wpp|tel[eé]fono|celular|n[uú]mero|contact|llamar|escribir(les)?\b|d[oó]nde (est[aá]n|queda)|direcci[oó]n|ubicaci[oó]n|c[oó]mo llego|instagram|horario de atenci[oó]n|atienden/i;

function textoContacto(d: DatosInstitucionales) {
  const c = d.contacto;
  const partes: string[] = [];
  if (c.whatsapp) partes.push(`Por WhatsApp: ${c.whatsapp.replace(/^\+54\s?9\s?/, "")}.`);
  if (c.direccion) partes.push(`Estamos en ${c.direccion}, ${d.localidad}.`);
  if (c.horario?.es) partes.push(`Atención presencial: ${c.horario.es.charAt(0).toLowerCase()}${c.horario.es.slice(1)}.`);
  const ig = c.redes.find((r) => /instagram/i.test(r.nombre));
  if (ig) partes.push(`En Instagram: @${ig.url.replace(/\/$/, "").split("/").pop()}.`);
  if (c.email) partes.push(`Email: ${c.email}.`);
  return partes.length ? partes.join(" ") : null;
}

/** Edades que menciona el texto de un grupo ("4 y 5 años" → [4, 5]). */
const numeros = (t: string) => [...t.matchAll(/\d{1,2}/g)].map((m) => Number(m[0]));

function grupoPorEdad(pregunta: string, d: DatosInstitucionales) {
  const m = /(\d{1,2})\s*(años|añitos|year)/i.exec(pregunta);
  if (!m) return null;
  const edad = Number(m[1]);
  const todos = d.grupos.flatMap((t) => t.grupos.map((g) => ({ ...g, tramo: t.tramo.es })));
  const exactos = todos.filter((g) => numeros(g.edad.es).includes(edad));
  if (exactos.length) {
    const nombres = exactos.map((g) => g.nombre).join(" o ");
    return `Para ${edad} años está el grupo ${nombres}. Los días y horarios de cada grupo te los confirmamos por WhatsApp, y antes de empezar hacemos un test de nivel gratuito.`;
  }
  const maximo = Math.max(0, ...todos.flatMap((g) => numeros(g.edad.es)));
  const adultos = todos.filter((g) => /adult/i.test(g.edad.es) || /adult/i.test(g.tramo)).map((g) => g.nombre);
  if (edad > maximo && adultos.length) {
    return `Desde los ${maximo + 1} años se suman a los grupos de adolescentes mayores o de adultos (${adultos.join(", ")}), según el nivel. Lo definimos juntos con un test de nivel gratuito.`;
  }
  return null;
}

export function respuestaInstitucional(pregunta: string, d: DatosInstitucionales) {
  const porEdad = d.grupos.length ? grupoPorEdad(pregunta, d) : null;
  if (porEdad) {
    const contacto = d.contacto.whatsapp ? ` WhatsApp: ${d.contacto.whatsapp.replace(/^\+54\s?9\s?/, "")}.` : "";
    return { texto: `${porEdad}${contacto}`, fuentes: [fuente] };
  }
  if (SOBRE_CONTACTO.test(pregunta)) {
    const texto = textoContacto(d);
    if (texto) return { texto, fuentes: [fuente] };
  }
  return null;
}
