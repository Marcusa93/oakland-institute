"use client";

import { useActionState } from "react";
import type { Resultado } from "@/app/panel/acciones";
import { Aviso, Boton, Campo } from "@/componentes/ui";
import { informarTransferencia, prepararComprobante } from "./acciones";
import { MENSAJE_TAMANO, MENSAJE_TIPO, TAMANO_MAXIMO, TIPOS_COMPROBANTE } from "./comprobantes";
import { crearClienteNavegador } from "./navegador";

/**
 * Informar una transferencia. Si hay comprobante: el servidor registra el
 * documento y firma la subida, el navegador sube el archivo y recién entonces
 * se informa el pago con el id del documento.
 */
async function enviar(_previo: Resultado | null, formData: FormData): Promise<Resultado> {
  const archivo = formData.get("comprobante");
  formData.delete("comprobante"); // el archivo no viaja por la acción del servidor
  try {
    if (archivo instanceof File && archivo.size > 0) {
      if (!TIPOS_COMPROBANTE[archivo.type]) return { ok: false, mensaje: MENSAJE_TIPO };
      if (archivo.size > TAMANO_MAXIMO) return { ok: false, mensaje: MENSAJE_TAMANO };
      const preparado = await prepararComprobante({ nombre: archivo.name, tipo: archivo.type, tamano: archivo.size });
      if (!preparado.ok) return preparado;
      const { error } = await crearClienteNavegador().storage.from("documentos")
        .uploadToSignedUrl(preparado.ruta, preparado.token, archivo, { contentType: archivo.type });
      if (error) return { ok: false, mensaje: "No pudimos subir el comprobante, así que la transferencia NO quedó informada. Probá de nuevo o informala sin adjunto." };
      formData.set("documento", preparado.documentoId);
    }
    return await informarTransferencia(null, formData);
  } catch {
    return { ok: false, mensaje: "No pudimos conectar. Revisá tu conexión y volvé a intentar." };
  }
}

export function InformarTransferencia({ hoy, adjuntos }: { hoy: string; adjuntos: boolean }) {
  const [estado, accion, enviando] = useActionState(enviar, null);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2">
      <Campo id="transf-importe" name="importe" etiqueta="Importe transferido" inputMode="decimal" placeholder="45.000,50" required autoComplete="off" />
      <Campo id="transf-fecha" name="fecha" type="date" etiqueta="Fecha de la transferencia" defaultValue={hoy} max={hoy} required />
      <Campo id="transf-nota" name="nota" etiqueta="Nota (opcional)" maxLength={300} className="sm:col-span-2"
        ayuda="Por ejemplo: a qué cuota o a qué estudiante corresponde." />
      {adjuntos ? (
        <Campo id="transf-comprobante" name="comprobante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
          etiqueta="Comprobante (opcional)" ayuda="Imagen o PDF de hasta 5 MB." className="sm:col-span-2" />
      ) : (
        <div className="sm:col-span-2"><Aviso tono="alerta">Por ahora no se pueden adjuntar comprobantes. Podés informar la transferencia igual y acercar el comprobante a administración.</Aviso></div>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Boton type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Informar transferencia"}</Boton>
        {estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null}
      </div>
    </form>
  );
}
