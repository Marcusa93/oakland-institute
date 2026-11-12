import "server-only";
import type { crearClienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * Enlaces temporales para escuchar audios. Se firman con la sesión del
 * usuario: la política de almacenamiento decide quién puede oír cada uno,
 * así que una ruta ajena simplemente no vuelve firmada.
 */
export async function firmarAudios(supabase: Cliente, rutas: (string | null | undefined)[]) {
  const unicas = [...new Set(rutas.filter((r): r is string => typeof r === "string" && r.length > 0))];
  const enlaces = new Map<string, string>();
  if (!unicas.length) return enlaces;
  const { data } = await supabase.storage.from("audios").createSignedUrls(unicas, 60 * 60 * 3);
  for (const f of data ?? []) if (f.path && f.signedUrl && !f.error) enlaces.set(f.path, f.signedUrl);
  return enlaces;
}
