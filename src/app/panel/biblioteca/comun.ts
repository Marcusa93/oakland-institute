/** Textos compartidos de la biblioteca (servidor y cliente). */

export const ORIGEN: Record<string, { etiqueta: string; icono: string }> = {
  ocr: { etiqueta: "Escaneado y digitalizado", icono: "📷" },
  pdf: { etiqueta: "PDF con texto", icono: "📄" },
  docx: { etiqueta: "Documento de Word", icono: "📝" },
  manual: { etiqueta: "Texto escrito", icono: "✍️" },
};

/** Icono del material según su archivo (o su texto si no tiene). */
export function iconoMaterial(m: { archivo_mime: string | null; texto_origen: string | null }) {
  if (m.texto_origen === "ocr") return "📷";
  if (m.archivo_mime === "application/pdf") return "📄";
  if (m.archivo_mime?.startsWith("image/")) return "🖼️";
  if (m.archivo_mime) return "📝";
  return "✍️";
}

/** Primeras palabras del texto, para la lista. */
export function extracto(texto: string | null, largo = 160) {
  if (!texto) return "";
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > largo ? `${t.slice(0, t.lastIndexOf(" ", largo) > 60 ? t.lastIndexOf(" ", largo) : largo)}…` : t;
}

/** Minutos de lectura aproximados (lectores de inglés como segunda lengua). */
export function minutosLectura(texto: string | null) {
  const palabras = texto ? texto.split(/\s+/).filter(Boolean).length : 0;
  return palabras ? Math.max(1, Math.round(palabras / 120)) : 0;
}
