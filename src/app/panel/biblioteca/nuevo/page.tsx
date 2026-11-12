import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Titulo } from "@/componentes/ui";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { obtenerContenidoSitio } from "@/lib/sitio";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { comisionesDeSesion, textoComision } from "../../actividades/datos";
import { Cargador } from "./cargador";

export const metadata: Metadata = { title: "Nuevo material" };

export default async function NuevoMaterial() {
  const sesion = await exigirPermiso("biblioteca", "crear");
  const supabase = await crearClienteServidor();
  const [{ comisiones, error }, sitio] = await Promise.all([
    comisionesDeSesion(supabase, sesion, esGestion(sesion.perfiles)),
    obtenerContenidoSitio(),
  ]);
  // Sugerencias para "Para": los grupos que publica el instituto.
  const niveles = [...new Set(sitio.grupos.flatMap((t) => [t.tramo.es, ...t.grupos.map((g) => g.nombre)]))];

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/panel/biblioteca" className="font-semibold text-marca hover:underline">← Biblioteca</Link></p>
      <Titulo descripcion="Subí el material como lo tengas: PDF, fotos de la fotocopia o un Word. Lo pasamos a texto digital, lo revisás y lo compartís.">
        Nuevo material
      </Titulo>
      {error ? <div className="mb-4"><Aviso tono="alerta">No pudimos cargar tus comisiones: vas a poder compartir el material después.</Aviso></div> : null}
      <Cargador comisiones={comisiones.map((k) => ({ id: k.id, texto: textoComision(k) }))} niveles={niveles} />
    </>
  );
}
