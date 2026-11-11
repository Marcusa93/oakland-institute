import { NextResponse } from "next/server";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * Abre un comprobante de pago con una URL firmada de 60 segundos. Se firma con
 * la sesión de quien lo pide: la RLS de `documentos` y la política de Storage
 * deciden si puede verlo (dueño del comprobante o gestión).
 */
export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirPermiso("cuenta_corriente", "ver");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return texto("Comprobante no encontrado.", 404);

  const supabase = await crearClienteServidor();
  const { data: documento } = await supabase.from("documentos").select("ruta").eq("id", id).eq("tipo", "comprobante_pago").maybeSingle();
  if (!documento) return texto("No encontramos el comprobante o no tenés permiso para verlo.", 404);

  const { data, error } = await supabase.storage.from("documentos").createSignedUrl(documento.ruta as string, 60);
  if (error || !data?.signedUrl) return texto("No pudimos abrir el comprobante. Puede que el archivo no se haya terminado de subir.", 404);
  return NextResponse.redirect(data.signedUrl);
}
