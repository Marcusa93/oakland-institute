import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Enlace, EstadoVacio, Insignia, Titulo } from "@/componentes/ui";
import { fecha } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { extracto, iconoMaterial, minutosLectura } from "./comun";

export const metadata: Metadata = { title: "Biblioteca" };

interface Fila {
  id: string; titulo: string; nivel: string | null; texto: string | null; texto_origen: string | null;
  archivo_mime: string | null; autor_cuenta_id: string; creado_en: string;
  material_comisiones: { comision_id: string }[];
  material_lecturas: { estudiante_id: string }[];
}

export default async function Biblioteca({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string; aviso?: string }> }) {
  const sesion = await exigirPermiso("biblioteca", "crear");
  const { q = "", ver = "todo", aviso } = await searchParams;
  const busqueda = q.trim().slice(0, 80);
  const supabase = await crearClienteServidor();

  let consulta = supabase.from("materiales")
    .select("id, titulo, nivel, texto, texto_origen, archivo_mime, autor_cuenta_id, creado_en, material_comisiones(comision_id), material_lecturas(estudiante_id)")
    .order("creado_en", { ascending: false }).limit(120);
  if (ver === "mios") consulta = consulta.eq("autor_cuenta_id", sesion.cuentaId);
  if (busqueda) consulta = consulta.textSearch("busqueda", busqueda, { type: "websearch", config: "simple" });
  const { data, error } = await consulta;
  const materiales = (data ?? []) as unknown as Fila[];

  const filtro = (valor: string, etiqueta: string) => (
    <Link href={{ pathname: "/panel/biblioteca", query: { ...(busqueda ? { q: busqueda } : {}), ...(valor !== "todo" ? { ver: valor } : {}) } }}
      aria-current={ver === valor ? "page" : undefined}
      className="min-h-11 rounded-full border border-borde px-4 py-2.5 text-sm font-semibold hover:bg-marca-suave aria-[current=page]:border-marca aria-[current=page]:bg-marca aria-[current=page]:text-sobre-marca">
      {etiqueta}
    </Link>
  );

  return (
    <>
      <Titulo
        descripcion="El material de estudio del equipo docente. Subilo como lo tengas (PDF, fotos o Word), queda digitalizado y lo compartís con tus comisiones."
        acciones={<Enlace href="/panel/biblioteca/nuevo">Subir material</Enlace>}
      >
        Biblioteca
      </Titulo>
      {aviso === "eliminado" ? <div className="mb-4"><Aviso tono="exito">Material eliminado.</Aviso></div> : null}
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar la biblioteca. Actualizá la página.</Aviso></div> : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form role="search" className="flex min-w-0 flex-1 basis-72 gap-2">
          {ver !== "todo" ? <input type="hidden" name="ver" value={ver} /> : null}
          <label htmlFor="buscar-material" className="sr-only">Buscar en la biblioteca</label>
          <input id="buscar-material" name="q" defaultValue={busqueda} type="search" placeholder="Buscá por título o por una palabra del texto: «past simple», «animals»…"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-borde bg-superficie px-4" />
          <button className="min-h-11 rounded-full bg-marca px-5 font-semibold text-sobre-marca hover:bg-marca-fuerte">Buscar</button>
        </form>
        <nav aria-label="Filtrar" className="flex gap-2">
          {filtro("todo", "Todo el equipo")}
          {filtro("mios", "Lo mío")}
        </nav>
      </div>

      {!error && materiales.length === 0 ? (
        busqueda ? (
          <EstadoVacio titulo={`No hay material con «${busqueda}»`}>Probá con otra palabra, o subí ese material para que lo encuentre todo el equipo.</EstadoVacio>
        ) : (
          <EstadoVacio titulo="Todavía no hay material">
            Empezá por algo que uses seguido: una lista de vocabulario, una lectura o una fotocopia. Si es papel, sacale fotos y lo digitalizamos.
          </EstadoVacio>
        )
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {materiales.map((m) => {
          const minutos = minutosLectura(m.texto);
          return (
            <li key={m.id}>
              <Link href={`/panel/biblioteca/${m.id}`}
                className="group flex h-full flex-col rounded-[1.5rem] border border-borde bg-superficie p-5 hover:border-marca">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pizarra text-2xl">{iconoMaterial(m)}</span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-snug text-marca-fuerte group-hover:underline" lang="en">{m.titulo}</h2>
                    <p className="text-sm text-suave">
                      {[m.nivel, minutos ? `${minutos} min de lectura` : "Sin texto digital", fecha(m.creado_en)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                {m.texto ? <p className="mt-3 line-clamp-3 text-sm text-texto/80" lang="en">{extracto(m.texto)}</p> : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {m.autor_cuenta_id === sesion.cuentaId ? <Insignia tono="marca">Tuyo</Insignia> : null}
                  {m.material_comisiones.length
                    ? <Insignia tono="exito">Compartido con {m.material_comisiones.length} {m.material_comisiones.length === 1 ? "comisión" : "comisiones"}</Insignia>
                    : <Insignia>Sin compartir</Insignia>}
                  {m.material_lecturas.length ? <Insignia>👀 {m.material_lecturas.length} {m.material_lecturas.length === 1 ? "lo abrió" : "lo abrieron"}</Insignia> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
