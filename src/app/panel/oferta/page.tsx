/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import type { Metadata } from "next";
import { AreaTexto, Aviso, Campo, Enlace, EstadoVacio, Insignia, Selector, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { Formulario } from "../estudiantes/formulario";
import { guardarAula, guardarCiclo, guardarCurso, guardarNivel, guardarSede } from "./acciones";

export const metadata: Metadata = { title: "Oferta académica" };

const ESTADO_CICLO: Record<string, [string, Tono]> = { planificado: ["Planificado", "neutro"], activo: ["Activo", "exito"], cerrado: ["Cerrado", "neutro"] };
const PUBLICO: Record<string, string> = { ninos: "Niños", adolescentes: "Adolescentes", adultos: "Adultos", todos: "Todas las edades" };
const MODALIDAD: Record<string, string> = { presencial: "Presencial", virtual: "Virtual", mixta: "Mixta" };
const MCER = ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"];
const h2 = "text-lg font-bold";

function edades(min: number | null, max: number | null) {
  if (min && max) return `${min} a ${max} años`;
  if (min) return `desde ${min} años`;
  if (max) return `hasta ${max} años`;
  return null;
}
const resumen = "cursor-pointer text-sm font-semibold text-marca";

function CamposCiclo({ p, c }: { p: string; c?: any }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Campo id={`${p}-nombre`} name="nombre" etiqueta="Nombre" required maxLength={40} defaultValue={c?.nombre} placeholder="2027" />
      <Campo id={`${p}-inicio`} name="fecha_inicio" type="date" etiqueta="Empieza" required defaultValue={c?.fecha_inicio} />
      <Campo id={`${p}-fin`} name="fecha_fin" type="date" etiqueta="Termina" required defaultValue={c?.fecha_fin} />
      <Selector id={`${p}-estado`} name="estado" etiqueta="Estado" defaultValue={c?.estado ?? "planificado"}>
        {Object.entries(ESTADO_CICLO).map(([v, [e]]) => <option key={v} value={v}>{e}</option>)}
      </Selector>
    </>
  );
}

function CamposCurso({ p, c }: { p: string; c?: any }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <Campo id={`${p}-nombre`} name="nombre" etiqueta="Nombre" required maxLength={80} defaultValue={c?.nombre} placeholder="Inglés para adultos" className="sm:col-span-2" />
      <Selector id={`${p}-publico`} name="publico" etiqueta="Para quién" defaultValue={c?.publico ?? "todos"}>
        {Object.entries(PUBLICO).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
      </Selector>
      <Selector id={`${p}-modalidad`} name="modalidad" etiqueta="Modalidad" defaultValue={c?.modalidad ?? "presencial"}>
        {Object.entries(MODALIDAD).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
      </Selector>
      <Campo id={`${p}-min`} name="edad_minima" type="number" min={3} max={99} inputMode="numeric" etiqueta="Edad mínima" defaultValue={c?.edad_minima ?? ""} />
      <Campo id={`${p}-max`} name="edad_maxima" type="number" min={3} max={99} inputMode="numeric" etiqueta="Edad máxima" defaultValue={c?.edad_maxima ?? ""} />
      <Campo id={`${p}-orden`} name="orden" type="number" min={0} max={999} inputMode="numeric" etiqueta="Orden en la web" defaultValue={c?.orden ?? 0} />
      <AreaTexto id={`${p}-desc`} name="descripcion" etiqueta="Descripción para la página web" maxLength={600} defaultValue={c?.descripcion ?? ""} className="sm:col-span-2 lg:col-span-4" />
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="publicado" defaultChecked={c ? c.publicado : true} /> Mostrar en la página web</label>
      {c ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={c.activo} /> Activo (se pueden crear comisiones)</label> : null}
    </>
  );
}

function CamposNivel({ p, n }: { p: string; n?: any }) {
  return (
    <>
      {n ? <input type="hidden" name="id" value={n.id} /> : null}
      <Campo id={`${p}-codigo`} name="codigo" etiqueta="Código" required maxLength={10} defaultValue={n?.codigo} placeholder="INT" />
      <Campo id={`${p}-nombre`} name="nombre" etiqueta="Nombre" required maxLength={60} defaultValue={n?.nombre} placeholder="Intermedio" />
      <Campo id={`${p}-orden`} name="orden" type="number" min={0} max={999} inputMode="numeric" etiqueta="Orden" required defaultValue={n?.orden ?? ""} />
      <Selector id={`${p}-mcer`} name="mcer" etiqueta="Referencia MCER (opcional)" defaultValue={n?.mcer_referencia ?? ""}>
        <option value="">Sin referencia</option>
        {MCER.map((m) => <option key={m} value={m}>{m}</option>)}
      </Selector>
      <Campo id={`${p}-desc`} name="descripcion" etiqueta="Descripción" maxLength={300} defaultValue={n?.descripcion ?? ""} className="sm:col-span-2 lg:col-span-4" />
    </>
  );
}

export default async function Oferta() {
  const sesion = await exigirPermiso("oferta_publica", "editar");
  const editaSede = puede(sesion.perfiles, "roles_y_configuracion", "editar");
  const supabase = await crearClienteServidor();
  const [ciclosR, cursosR, nivelesR, aulasR, sedesR] = await Promise.all([
    supabase.from("ciclos_lectivos").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio", { ascending: false }),
    supabase.from("cursos").select("id, slug, nombre, descripcion, publico, edad_minima, edad_maxima, modalidad, publicado, activo, orden").order("activo", { ascending: false }).order("orden").order("nombre"),
    supabase.from("niveles").select("id, codigo, nombre, orden, descripcion, mcer_referencia").order("orden"),
    supabase.from("aulas").select("id, sede_id, nombre, capacidad, activa").order("activa", { ascending: false }).order("nombre"),
    supabase.from("sedes").select("id, nombre, direccion, activa").order("creado_en"),
  ]);
  const ciclos = (ciclosR.data ?? []) as any[];
  const cursos = (cursosR.data ?? []) as any[];
  const niveles = (nivelesR.data ?? []) as any[];
  const aulas = (aulasR.data ?? []) as any[];
  const sedes = (sedesR.data ?? []) as any[];
  const sedeNombre = new Map(sedes.map((s) => [s.id as string, s.nombre as string]));
  const error = ciclosR.error || cursosR.error || nivelesR.error || aulasR.error || sedesR.error;
  const activos = ciclos.filter((c) => c.estado === "activo");

  return (
    <>
      <Titulo descripcion="Lo que el instituto ofrece: ciclos lectivos, cursos, niveles y aulas. Con esto se arman las comisiones, y los cursos publicados aparecen en la página web."
        acciones={<Enlace href="/panel/comisiones" variante="secundario">Ir a comisiones</Enlace>}>
        Oferta académica
      </Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar todos los datos. Actualizá la página.</Aviso></div> : null}

      {/* ------------------------------------------------------------ Ciclos */}
      <section aria-labelledby="t-ciclos" className="mb-8">
        <h2 id="t-ciclos" className={`${h2} mb-1`}>Ciclos lectivos</h2>
        <p className="mb-3 text-sm text-suave">El ciclo activo es el que se muestra por defecto en comisiones.{activos.length > 1 ? " Hay más de un ciclo activo: conviene dejar uno solo." : ""}</p>
        {ciclos.length === 0 ? <EstadoVacio titulo="Todavía no hay ciclos lectivos" /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {ciclos.map((c) => {
              const [e, t] = ESTADO_CICLO[c.estado] ?? [c.estado, "neutro" as Tono];
              return (
                <li key={c.id}>
                  <Tarjeta>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">{c.nombre}</p>
                      <Insignia tono={t}>{e}</Insignia>
                    </div>
                    <p className="text-sm text-suave">Del {fecha(c.fecha_inicio)} al {fecha(c.fecha_fin)}</p>
                    <details className="mt-2">
                      <summary className={resumen}>Editar</summary>
                      <Formulario accion={guardarCiclo} boton="Guardar" className="mt-2 grid gap-3 sm:grid-cols-2"><CamposCiclo p={`c-${c.id}`} c={c} /></Formulario>
                    </details>
                  </Tarjeta>
                </li>
              );
            })}
          </ul>
        )}
        <details className="mt-3">
          <summary className={resumen}>Crear un ciclo lectivo</summary>
          <Tarjeta className="mt-2">
            <Formulario accion={guardarCiclo} boton="Crear ciclo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><CamposCiclo p="nc" /></Formulario>
          </Tarjeta>
        </details>
      </section>

      {/* ------------------------------------------------------------ Cursos */}
      <section aria-labelledby="t-cursos" className="mb-8">
        <h2 id="t-cursos" className={`${h2} mb-3`}>Cursos</h2>
        {cursos.length === 0 ? <EstadoVacio titulo="Todavía no hay cursos" /> : (
          <ul className="divide-y divide-borde rounded-base border border-borde bg-superficie px-4">
            {cursos.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{c.nombre}</p>
                    <p className="text-sm text-suave">
                      {[PUBLICO[c.publico], edades(c.edad_minima, c.edad_maxima), MODALIDAD[c.modalidad]].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Insignia tono={c.publicado ? "marca" : "neutro"}>{c.publicado ? "En la web" : "No publicado"}</Insignia>
                    {!c.activo ? <Insignia>Inactivo</Insignia> : null}
                  </div>
                </div>
                <details className="mt-1">
                  <summary className={resumen}>Editar</summary>
                  <Formulario accion={guardarCurso} boton="Guardar" className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><CamposCurso p={`k-${c.id}`} c={c} /></Formulario>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-3">
          <summary className={resumen}>Crear un curso</summary>
          <Tarjeta className="mt-2">
            <Formulario accion={guardarCurso} boton="Crear curso" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><CamposCurso p="nk" /></Formulario>
          </Tarjeta>
        </details>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------------ Niveles */}
        <section aria-labelledby="t-niveles">
          <h2 id="t-niveles" className={`${h2} mb-1`}>Niveles</h2>
          <p className="mb-3 text-sm text-suave">La referencia MCER es orientativa y la decide el instituto; no es una certificación.</p>
          <ul className="divide-y divide-borde rounded-base border border-borde bg-superficie px-4">
            {niveles.map((n) => (
              <li key={n.id} className="py-3">
                <p className="font-semibold">{n.orden}. {n.nombre} <span className="text-sm font-normal text-suave">({n.codigo}{n.mcer_referencia ? ` · MCER ${n.mcer_referencia}` : ""})</span></p>
                {n.descripcion ? <p className="text-sm text-suave">{n.descripcion}</p> : null}
                <details className="mt-1">
                  <summary className={resumen}>Editar</summary>
                  <Formulario accion={guardarNivel} boton="Guardar" className="mt-2 grid gap-3 sm:grid-cols-2"><CamposNivel p={`n-${n.id}`} n={n} /></Formulario>
                </details>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className={resumen}>Crear un nivel</summary>
            <Tarjeta className="mt-2">
              <Formulario accion={guardarNivel} boton="Crear nivel" className="grid gap-3 sm:grid-cols-2"><CamposNivel p="nn" /></Formulario>
            </Tarjeta>
          </details>
        </section>

        {/* ------------------------------------------------------------ Aulas y sede */}
        <section aria-labelledby="t-aulas">
          <h2 id="t-aulas" className={`${h2} mb-1`}>Aulas</h2>
          <p className="mb-3 text-sm text-suave">El sistema avisa si dos comisiones usan la misma aula a la misma hora.</p>
          <ul className="divide-y divide-borde rounded-base border border-borde bg-superficie px-4">
            {aulas.map((a) => (
              <li key={a.id} className="py-3">
                <p className="font-semibold">
                  {a.nombre} <span className="text-sm font-normal text-suave">{[a.capacidad ? `${a.capacidad} lugares` : null, sedes.length > 1 ? sedeNombre.get(a.sede_id) : null].filter(Boolean).join(" · ")}</span>
                  {!a.activa ? <> <Insignia>Fuera de uso</Insignia></> : null}
                </p>
                <details className="mt-1">
                  <summary className={resumen}>Editar</summary>
                  <Formulario accion={guardarAula} boton="Guardar" className="mt-2 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="sede" value={a.sede_id} />
                    <Campo id={`a-${a.id}-nombre`} name="nombre" etiqueta="Nombre" required maxLength={40} defaultValue={a.nombre} />
                    <Campo id={`a-${a.id}-cap`} name="capacidad" type="number" min={1} max={500} inputMode="numeric" etiqueta="Capacidad" defaultValue={a.capacidad ?? ""} />
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="activa" defaultChecked={a.activa} /> En uso</label>
                  </Formulario>
                </details>
              </li>
            ))}
          </ul>
          {sedes.length ? (
            <details className="mt-3">
              <summary className={resumen}>Crear un aula</summary>
              <Tarjeta className="mt-2">
                <Formulario accion={guardarAula} boton="Crear aula" className="grid gap-3 sm:grid-cols-2">
                  {sedes.length > 1 ? (
                    <Selector id="na-sede" name="sede" etiqueta="Sede">{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector>
                  ) : <input type="hidden" name="sede" value={sedes[0].id} />}
                  <Campo id="na-nombre" name="nombre" etiqueta="Nombre" required maxLength={40} placeholder="Aula 3" />
                  <Campo id="na-cap" name="capacidad" type="number" min={1} max={500} inputMode="numeric" etiqueta="Capacidad (opcional)" />
                </Formulario>
              </Tarjeta>
            </details>
          ) : null}

          {editaSede && sedes.length ? (
            <Tarjeta className="mt-6">
              <h3 className="font-bold">Sede</h3>
              {sedes.map((s) => (
                <Formulario key={s.id} accion={guardarSede} boton="Guardar" className="mt-2 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={s.id} />
                  <Campo id={`s-${s.id}-nombre`} name="nombre" etiqueta="Nombre" required maxLength={80} defaultValue={s.nombre} />
                  <Campo id={`s-${s.id}-dir`} name="direccion" etiqueta="Dirección" maxLength={200} defaultValue={s.direccion ?? ""} />
                </Formulario>
              ))}
            </Tarjeta>
          ) : null}
        </section>
      </div>
    </>
  );
}
