import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, EstadoVacio, Insignia, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { CLAVES_HABILIDAD, ESTADOS_BANCO, HABILIDADES, TIPOS, datosHabilidad, partirLectura, type TipoEjercicio } from "@/app/panel/practica/comun";
import { Probador } from "@/app/panel/practica/ejercicio";
import { AccionesEstado, FormularioEjercicio, type DatosEjercicio } from "./formulario";
import "@/app/panel/practica/practica.css";

export const metadata: Metadata = { title: "Banco de práctica" };

interface Fila extends DatosEjercicio {
  id: string;
  estado: string;
  creado_en: string;
  revisado_en: string | null;
  niveles: { nombre: string } | null;
}

const TONO_ESTADO: Record<string, Tono> = { borrador: "alerta", revisado: "exito", retirado: "neutro" };
const ETIQUETA_ESTADO = Object.fromEntries(ESTADOS_BANCO) as Record<string, string>;
const ETIQUETA_TIPO = Object.fromEntries(TIPOS) as Record<string, string>;

function enlace(filtros: { habilidad?: string; estado?: string }) {
  const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][]).toString();
  return `/panel/banco${q ? `?${q}` : ""}`;
}

export default async function Banco({ searchParams }: { searchParams: Promise<{ habilidad?: string; estado?: string }> }) {
  await exigirPermiso("practica", "editar");
  const sp = await searchParams;
  const habilidad = (CLAVES_HABILIDAD as readonly string[]).includes(sp.habilidad ?? "") ? sp.habilidad : undefined;
  const estado = ESTADOS_BANCO.some(([v]) => v === sp.estado) ? sp.estado : undefined;

  const supabase = await crearClienteServidor();
  let consulta = supabase.from("ejercicios")
    .select("id, habilidad, tipo, nivel_id, dificultad, enunciado, opciones, respuesta, explicacion, audio_texto, estado, creado_en, revisado_en, niveles(nombre)")
    .order("creado_en", { ascending: false }).limit(200);
  if (habilidad) consulta = consulta.eq("habilidad", habilidad);
  if (estado) consulta = consulta.eq("estado", estado);
  const [{ data, error }, { data: conteo }, { data: niveles }] = await Promise.all([
    consulta,
    supabase.from("ejercicios").select("habilidad, estado"),
    supabase.from("niveles").select("id, nombre").order("orden"),
  ]);
  const filas = ((data ?? []) as unknown as Fila[]).map((f) => ({ ...f, opciones: Array.isArray(f.opciones) ? f.opciones.map(String) : [] }));

  const cuenta = new Map<string, { revisado: number; borrador: number }>();
  for (const c of (conteo ?? []) as { habilidad: string; estado: string }[]) {
    const x = cuenta.get(c.habilidad) ?? { revisado: 0, borrador: 0 };
    if (c.estado === "revisado") x.revisado++;
    if (c.estado === "borrador") x.borrador++;
    cuenta.set(c.habilidad, x);
  }
  const pendientes = [...cuenta.values()].reduce((s, x) => s + x.borrador, 0);

  return (
    <>
      <Titulo descripcion="Los estudiantes solo practican con ejercicios revisados por un docente. Acá los cargás, los probás tal como los ve el estudiante y los revisás o retirás.">
        Banco de práctica
      </Titulo>

      {/* Contador de revisados por habilidad (también filtra). */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {HABILIDADES.map((h) => {
          const c = cuenta.get(h.clave) ?? { revisado: 0, borrador: 0 };
          const activa = habilidad === h.clave;
          return (
            <li key={h.clave}>
              <Link href={enlace({ habilidad: activa ? undefined : h.clave, estado })} aria-current={activa ? "true" : undefined}
                className={`${h.tono} block rounded-2xl border-2 p-3 transition-colors ${activa ? "border-[var(--pr-color)] bg-[var(--pr-suave)]" : "border-borde bg-superficie hover:border-[var(--pr-color)]"}`}>
                <span className="flex items-center gap-2 font-bold"><span aria-hidden>{h.icono}</span>{h.nombre}</span>
                <span className="mt-1 block text-2xl font-extrabold text-[var(--pr-color)]">{c.revisado}</span>
                <span className="block text-xs text-suave">revisados{c.borrador ? ` · ${c.borrador} en borrador` : ""}</span>
                {c.revisado === 0 ? <span className="mt-1 block text-xs font-semibold text-alerta">El estudiante la ve como “Pronto”</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <nav aria-label="Filtrar por estado" className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-suave">Estado:</span>
        {[["", "Todos"], ...ESTADOS_BANCO].map(([v, e]) => (
          <Link key={v} href={enlace({ habilidad, estado: v || undefined })} aria-current={(estado ?? "") === v ? "page" : undefined}
            className="inline-flex min-h-10 items-center rounded-full border-2 border-borde px-3 font-semibold aria-[current]:border-marca aria-[current]:bg-marca aria-[current]:text-white">
            {e}{v === "borrador" && pendientes ? ` (${pendientes})` : ""}
          </Link>
        ))}
        {habilidad || estado ? <Link href="/panel/banco" className="ml-1 min-h-10 font-semibold text-marca underline-offset-4 hover:underline">Quitar filtros</Link> : null}
      </nav>

      <details className="mt-6 rounded-base border border-borde bg-superficie" open={filas.length === 0 && !habilidad && !estado}>
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-bold text-marca">+ Nuevo ejercicio</summary>
        <div className="border-t border-borde p-4 sm:p-5">
          <FormularioEjercicio niveles={niveles ?? []} inicial={habilidad ? {
            habilidad, tipo: habilidad === "escucha" ? "escuchar" : habilidad === "escritura" ? "completar" : habilidad === "habla" ? "ordenar" : "opcion",
            nivel_id: null, dificultad: 1, enunciado: "", opciones: [], respuesta: "", explicacion: "", audio_texto: "",
          } : undefined} />
        </div>
      </details>

      <div className="mt-6">
        {error ? <Aviso tono="peligro">No pudimos cargar el banco. Actualizá la página.</Aviso> : null}
        {!error && filas.length === 0 ? (
          <EstadoVacio titulo="No hay ejercicios en esta vista">
            Cargá uno nuevo o pedí que carguen el banco de ejemplo (supabase/ejercicios-demo.sql).
          </EstadoVacio>
        ) : null}
        <ul className="space-y-4">
          {filas.map((f) => {
            const h = datosHabilidad(f.habilidad);
            const { texto, pregunta } = partirLectura(f.enunciado);
            return (
              <li key={f.id}>
                <Tarjeta className={f.estado === "retirado" ? "opacity-70" : ""}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Insignia tono="marca"><span aria-hidden className="mr-1">{h?.icono}</span>{h?.nombre}</Insignia>
                    <Insignia>{ETIQUETA_TIPO[f.tipo]}</Insignia>
                    <Insignia tono={TONO_ESTADO[f.estado]}>{ETIQUETA_ESTADO[f.estado] ?? f.estado}</Insignia>
                    <span className="text-xs font-semibold text-suave" title={`Dificultad ${f.dificultad} de 3`}>
                      <span aria-hidden>{"●".repeat(f.dificultad)}{"○".repeat(3 - f.dificultad)}</span>
                      <span className="sr-only">Dificultad {f.dificultad} de 3</span>
                    </span>
                    {f.niveles?.nombre ? <span className="text-xs text-suave">· {f.niveles.nombre}</span> : null}
                    <span className="ml-auto text-xs text-suave">
                      {f.estado === "revisado" && f.revisado_en ? `Revisado el ${fecha(f.revisado_en)}` : `Cargado el ${fecha(f.creado_en)}`}
                    </span>
                  </div>
                  {texto ? <p lang="en" className="mt-3 line-clamp-3 whitespace-pre-line rounded-base bg-fondo p-2 text-sm text-suave">{texto}</p> : null}
                  <p lang="en" className="mt-2 text-lg font-semibold">{pregunta}</p>
                  {f.audio_texto ? <p lang="en" className="mt-1 text-sm text-suave"><span aria-hidden>🔊</span> “{f.audio_texto}”</p> : null}
                  {f.opciones.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={f.tipo === "ordenar" ? "Fichas" : "Opciones"}>
                      {f.opciones.map((o, i) => <li key={i} lang="en" className="rounded-lg border border-borde px-2 py-0.5 text-sm">{o}</li>)}
                    </ul>
                  ) : null}
                  <p className="mt-2 text-sm">Respuesta: <strong lang="en" className="text-exito">{f.respuesta}</strong></p>
                  {f.explicacion ? <p className="mt-1 text-sm text-suave">{f.explicacion}</p> : null}
                  <div className="mt-3 border-t border-borde pt-3">
                    <AccionesEstado id={f.id} estado={f.estado} />
                  </div>
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-marca">Vista previa: probarlo como estudiante</summary>
                    <div className="mt-2 rounded-[2rem] bg-pizarra p-3">
                      <Probador ejercicio={{ ...f, tipo: f.tipo as TipoEjercicio }} />
                    </div>
                  </details>
                  <details className="mt-1">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-marca">Editar</summary>
                    <div className="mt-2">
                      <FormularioEjercicio niveles={niveles ?? []} inicial={f} />
                    </div>
                  </details>
                </Tarjeta>
              </li>
            );
          })}
        </ul>
        {filas.length === 200 ? <p className="mt-4 text-sm text-suave">Se muestran los 200 más recientes. Usá los filtros para ver el resto.</p> : null}
      </div>
    </>
  );
}
