/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lectura } from "@/componentes/lectura";
import { Aviso, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, fechaHora } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { comisionesDeSesion, textoComision } from "../../actividades/datos";
import { ORIGEN, minutosLectura } from "../comun";
import { Compartir, EditarMaterial, Eliminar } from "./controles";

export const metadata: Metadata = { title: "Material" };

const AVISOS: Record<string, [string, "exito" | "alerta" | "peligro"]> = {
  creado: ["Material guardado en la biblioteca.", "exito"],
  "sin-archivo": ["El texto quedó guardado, pero el archivo original no se pudo subir. Revisá la conexión y cargalo de nuevo como material nuevo si lo necesitás.", "alerta"],
  "sin-permiso": ["Solo quien cargó el material (o administración) puede eliminarlo.", "peligro"],
};

export default async function Material({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const sesion = await exigirPermiso("biblioteca", "crear");
  const { id } = await params;
  const { aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await crearClienteServidor();

  const { data: m } = await supabase.from("materiales")
    .select("id, titulo, descripcion, nivel, texto, texto_origen, archivo_ruta, archivo_nombre, archivo_mime, archivo_bytes, paginas, autor_cuenta_id, creado_en, actualizado_en, material_comisiones(comision_id, compartido_en)")
    .eq("id", id).maybeSingle();
  if (!m) notFound();
  const gestion = esGestion(sesion.perfiles);
  const editable = m.autor_cuenta_id === sesion.cuentaId || gestion;
  const compartidas = new Map((m.material_comisiones as { comision_id: string; compartido_en: string }[]).map((c) => [c.comision_id, c.compartido_en]));

  const [{ comisiones }, firmado, lecturasR, matriculasR] = await Promise.all([
    comisionesDeSesion(supabase, sesion, gestion),
    m.archivo_ruta ? supabase.storage.from("biblioteca").createSignedUrl(m.archivo_ruta, 60 * 60) : null,
    supabase.from("material_lecturas").select("estudiante_id, primera_vez, ultima_vez, veces").eq("material_id", id),
    compartidas.size
      ? supabase.from("matriculas").select("estudiante_id, comision_id, estudiantes(personas(nombres, apellidos))")
          .in("comision_id", [...compartidas.keys()]).eq("estado", "activa")
      : null,
  ]);
  const original = firmado?.data?.signedUrl ?? null;
  const lecturas = new Map(((lecturasR.data ?? []) as any[]).map((l) => [l.estudiante_id, l]));
  const matriculas = (matriculasR?.data ?? []) as any[];
  const nombreComision = new Map(comisiones.map((k) => [k.id, textoComision(k)]));
  const minutos = minutosLectura(m.texto);
  const origen = m.texto_origen ? ORIGEN[m.texto_origen] : null;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/panel/biblioteca" className="font-semibold text-marca hover:underline">← Biblioteca</Link></p>
      <Titulo descripcion={[m.nivel, minutos ? `${minutos} min de lectura` : null, `Cargado el ${fecha(m.creado_en)}`].filter(Boolean).join(" · ")}>
        <span lang="en">{m.titulo}</span>
      </Titulo>
      {aviso && AVISOS[aviso] ? <div className="mb-4"><Aviso tono={AVISOS[aviso][1]}>{AVISOS[aviso][0]}</Aviso></div> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {m.descripcion ? <p className="globo globo-izq inline-block bg-marca-suave px-5 py-3 font-semibold text-marca-fuerte">{m.descripcion}</p> : null}
          {m.texto ? <Lectura texto={m.texto} /> : (
            <EstadoVacio titulo="Este material no tiene texto digital">
              {editable ? "Escribilo o pegalo en «Editar» para que los estudiantes lo puedan leer y escuchar en el celular." : "Lo cargó otro docente: los estudiantes pueden abrir el archivo original."}
            </EstadoVacio>
          )}
          {editable ? (
            <details className="rounded-[1.5rem] border border-borde bg-superficie p-5">
              <summary className="cursor-pointer font-semibold text-marca">Editar título y texto</summary>
              <div className="mt-4"><EditarMaterial m={m} /></div>
            </details>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Tarjeta>
            <h2 className="font-bold">Compartir con mis comisiones</h2>
            <p className="mt-1 text-sm text-suave">Los estudiantes y sus familias lo ven en «Biblioteca», en el celular.</p>
            <div className="mt-3 space-y-2">
              {comisiones.length === 0 ? <p className="text-sm text-suave">No tenés comisiones asignadas.</p> : null}
              {comisiones.map((k) => (
                <Compartir key={k.id} material={m.id} comision={{ id: k.id, texto: textoComision(k) }} compartido={compartidas.has(k.id)} />
              ))}
            </div>
          </Tarjeta>

          {compartidas.size ? (
            <Tarjeta>
              <h2 className="font-bold">Quién lo abrió</h2>
              {[...compartidas.keys()].map((c) => {
                const alumnos = matriculas.filter((x) => x.comision_id === c)
                  .map((x) => ({ id: x.estudiante_id, nombre: [x.estudiantes?.personas?.nombres, x.estudiantes?.personas?.apellidos].filter(Boolean).join(" ") || "Estudiante", lectura: lecturas.get(x.estudiante_id) }))
                  .sort((a, b) => Number(Boolean(b.lectura)) - Number(Boolean(a.lectura)) || a.nombre.localeCompare(b.nombre, "es"));
                const leyeron = alumnos.filter((a) => a.lectura).length;
                return (
                  <details key={c} className="mt-3">
                    <summary className="cursor-pointer text-sm">
                      <strong>{nombreComision.get(c) ?? "Otra comisión"}</strong>: {leyeron} de {alumnos.length}
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {alumnos.map((a) => (
                        <li key={a.id} className="flex justify-between gap-2">
                          <span>{a.lectura ? "👀" : "·"} {a.nombre}</span>
                          <span className="text-suave">{a.lectura ? fechaHora(a.lectura.ultima_vez) : "Todavía no"}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </Tarjeta>
          ) : null}

          <Tarjeta>
            <h2 className="font-bold">Original</h2>
            {original ? (
              <>
                {m.archivo_mime?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- enlace firmado temporal
                  <img src={original} alt={`Original de ${m.titulo}`} className="mt-2 w-full rounded-xl border border-borde" />
                ) : null}
                <a href={original} target="_blank" rel="noopener" className="mt-2 inline-flex min-h-11 items-center font-semibold text-marca hover:underline">
                  Abrir {m.archivo_nombre}
                </a>
                <p className="text-xs text-suave">{[m.paginas ? `${m.paginas} ${m.paginas === 1 ? "página" : "páginas"}` : null, m.archivo_bytes ? `${Math.max(1, Math.round(m.archivo_bytes / 1024))} KB` : null].filter(Boolean).join(" · ")}</p>
              </>
            ) : <p className="mt-1 text-sm text-suave">Sin archivo: es un texto escrito en la biblioteca.</p>}
            {origen ? <p className="mt-3"><Insignia>{origen.icono} {origen.etiqueta}</Insignia></p> : null}
          </Tarjeta>

          {editable ? <Eliminar material={m.id} /> : null}
        </aside>
      </div>
    </>
  );
}
