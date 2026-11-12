/**
 * Digitalización en el navegador del docente: no hay servidor de OCR ni
 * costo por página. Se usa lo más barato que sirva:
 *   · Word (.docx) → texto del documento.
 *   · PDF → el texto que trae cada página; si una página es una imagen
 *     escaneada (casi sin texto), se dibuja y se pasa por OCR.
 *   · Fotos → OCR (inglés + castellano).
 * Las librerías se cargan recién cuando se usan.
 */

export type Origen = "pdf" | "ocr" | "docx";
export interface Digitalizado { texto: string; origen: Origen; paginas: number; paginasOcr: number }
export type Progreso = (p: { etapa: string; avance: number }) => void;

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const ACEPTADOS = ["application/pdf", "image/jpeg", "image/png", "image/webp", MIME_DOCX];
export const MAXIMO_BYTES = 25 * 1024 * 1024;
const MAXIMO_PAGINAS = 60;

/** Una página con menos texto que esto se considera escaneada. */
const MINIMO_TEXTO_PAGINA = 25;

export function extension(archivo: File): string | null {
  if (archivo.type === "application/pdf") return "pdf";
  if (archivo.type === MIME_DOCX) return "docx";
  if (archivo.type === "image/jpeg") return "jpg";
  if (archivo.type === "image/png") return "png";
  if (archivo.type === "image/webp") return "webp";
  return null;
}

/** Ordena el texto que devuelve el OCR o el PDF: sin espacios de más y con párrafos. */
export function limpiarTexto(t: string): string {
  return t
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    // Palabra cortada con guion al final del renglón.
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Une los renglones que el escaneo cortó en medio de una oración. Respeta
 * títulos y listas: solo une renglones largos que no terminan en
 * puntuación (más fácil si el siguiente sigue en minúscula).
 */
export function unirRenglones(t: string): string {
  const lineas = t.split("\n");
  const salida: string[] = [];
  for (const linea of lineas) {
    const previa = salida.at(-1);
    const corta = previa !== undefined && previa !== "" && linea !== "" && !/[.!?:;"”)]$/.test(previa)
      && ((previa.length >= 25 && /^\p{Ll}/u.test(linea)) || (previa.length >= 35 && /^\p{L}/u.test(linea)));
    if (corta) salida[salida.length - 1] = `${previa} ${linea}`;
    else salida.push(linea);
  }
  return salida.join("\n");
}

type Trabajador = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

async function crearOcr(avisar: Progreso, etapa: () => string): Promise<Trabajador> {
  const { createWorker } = await import("tesseract.js");
  return createWorker(["eng", "spa"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") avisar({ etapa: etapa(), avance: m.progress });
      else if (m.status.startsWith("loading")) avisar({ etapa: "Preparando el lector de texto (la primera vez tarda un poco)…", avance: m.progress });
    },
  });
}

/** Achica y pasa a escala de grises: el OCR anda mejor y más rápido. */
async function prepararImagen(origen: Blob | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  let fuente: CanvasImageSource;
  let ancho: number;
  let alto: number;
  if (origen instanceof HTMLCanvasElement) {
    fuente = origen; ancho = origen.width; alto = origen.height;
  } else {
    const bitmap = await createImageBitmap(origen, { imageOrientation: "from-image" });
    fuente = bitmap; ancho = bitmap.width; alto = bitmap.height;
  }
  const escala = Math.min(1, 2400 / Math.max(ancho, alto));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const ctx = lienzo.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.25)";
  ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
  return lienzo;
}

async function textoDeDocx(archivo: File): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ arrayBuffer: await archivo.arrayBuffer() });
  return r.value;
}

async function cargarPdf(archivo: Blob) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  return pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
}

async function textoDePdf(archivo: File, avisar: Progreso): Promise<Digitalizado> {
  const tarea = await cargarPdf(archivo);
  const pdf = await tarea.promise;
  const total = Math.min(pdf.numPages, MAXIMO_PAGINAS);
  const partes: string[] = [];
  let ocr: Trabajador | null = null;
  let paginasOcr = 0;
  let actual = 0;
  try {
    for (let n = 1; n <= total; n++) {
      actual = n;
      avisar({ etapa: `Leyendo la página ${n} de ${total}…`, avance: (n - 1) / total });
      const pagina = await pdf.getPage(n);
      const contenido = await pagina.getTextContent();
      let texto = "";
      for (const item of contenido.items) {
        if ("str" in item) texto += item.str + (item.hasEOL ? "\n" : " ");
      }
      if (texto.replace(/\s/g, "").length < MINIMO_TEXTO_PAGINA) {
        // Página escaneada: se dibuja a buena resolución y se lee con OCR.
        const vista = pagina.getViewport({ scale: 2 });
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.floor(vista.width);
        lienzo.height = Math.floor(vista.height);
        await pagina.render({ canvas: lienzo, viewport: vista }).promise;
        ocr ??= await crearOcr(avisar, () => `Digitalizando la página ${actual} de ${total} (OCR)…`);
        const { data } = await ocr.recognize(await prepararImagen(lienzo));
        texto = data.text;
        paginasOcr++;
      }
      partes.push(unirRenglones(limpiarTexto(texto)));
      pagina.cleanup();
    }
  } finally {
    await ocr?.terminate();
    await tarea.destroy();
  }
  return { texto: partes.filter(Boolean).join("\n\n"), origen: paginasOcr ? "ocr" : "pdf", paginas: total, paginasOcr };
}

async function textoDeImagenes(fotos: Blob[], avisar: Progreso): Promise<Digitalizado> {
  let actual = 0;
  const ocr = await crearOcr(avisar, () => (fotos.length > 1 ? `Digitalizando la foto ${actual} de ${fotos.length}…` : "Digitalizando la foto…"));
  const partes: string[] = [];
  try {
    for (const foto of fotos) {
      actual++;
      const { data } = await ocr.recognize(await prepararImagen(foto));
      partes.push(unirRenglones(limpiarTexto(data.text)));
    }
  } finally {
    await ocr.terminate();
  }
  return { texto: partes.filter(Boolean).join("\n\n"), origen: "ocr", paginas: fotos.length, paginasOcr: fotos.length };
}

/** Saca el texto de un archivo (o de varias fotos del mismo material). */
export async function digitalizar(archivos: File[], avisar: Progreso): Promise<Digitalizado> {
  const [primero] = archivos;
  if (!primero) return { texto: "", origen: "ocr", paginas: 0, paginasOcr: 0 };
  if (primero.type === MIME_DOCX) {
    avisar({ etapa: "Leyendo el documento…", avance: 0.5 });
    return { texto: limpiarTexto(await textoDeDocx(primero)), origen: "docx", paginas: 1, paginasOcr: 0 };
  }
  if (primero.type === "application/pdf") return textoDePdf(primero, avisar);
  return textoDeImagenes(archivos, avisar);
}

/** Varias fotos (por ejemplo, páginas sacadas con la cámara) en un solo PDF. */
export async function fotosAPdf(fotos: File[]): Promise<File> {
  const { jsPDF } = await import("jspdf");
  let doc: InstanceType<typeof jsPDF> | null = null;
  for (const foto of fotos) {
    const bitmap = await createImageBitmap(foto, { imageOrientation: "from-image" });
    const escala = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    const orientacion = lienzo.width > lienzo.height ? "landscape" : "portrait";
    const formato: [number, number] = [lienzo.width, lienzo.height];
    if (!doc) doc = new jsPDF({ orientation: orientacion, unit: "px", format: formato, compress: true });
    else doc.addPage(formato, orientacion);
    doc.addImage(lienzo.toDataURL("image/jpeg", 0.82), "JPEG", 0, 0, lienzo.width, lienzo.height);
  }
  const nombre = `${(fotos[0]?.name ?? "escaneo").replace(/\.[^.]+$/, "")}.pdf`;
  return new File([doc!.output("blob")], nombre, { type: "application/pdf" });
}
