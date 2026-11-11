/** Límites de los comprobantes adjuntos. Se validan en el navegador y de nuevo en el servidor. */
export const TIPOS_COMPROBANTE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const TAMANO_MAXIMO = 5 * 1024 * 1024;
export const MENSAJE_TIPO = "El comprobante tiene que ser una imagen (JPG, PNG o WebP) o un PDF.";
export const MENSAJE_TAMANO = "El comprobante no puede pesar más de 5 MB.";
