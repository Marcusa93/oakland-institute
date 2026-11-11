import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Campo, Enlace, EstadoVacio, Insignia, Selector, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, nombreCompleto } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esUuid, uno } from "../estudiantes/comun";
import { Formulario } from "../estudiantes/formulario";
import { agregarHorario, crearComision } from "./acciones";
import { CamposHorario, ESTADOS_COMISION, estadoComision, ordenarHorarios, textoHorario } from "./comun";

export const metadata: Metadata = { title: "Comisiones" };

type Opcion = { id: string; nombre: string };

export default async function Comisiones({ searchParams }: { searchParams: Promise<{ ciclo?: string }> }) {
  await exigirPermiso("comisiones", "crear");
  const { ciclo: cicloPedido } = await searchParams;
  const supabase = await crearClienteServidor();

  const [ciclosR, cursosR, nivelesR, sedesR, aulasR] = await Promise.all([
    supabase.from("ciclos_lectivos").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio", { ascending: false }),
    supabase.from("cursos").select("id, nombre").eq("activo", true).order("orden").order("nombre"),
    supabase.from("niveles").select("id, nombre").order("orden"),
    supabase.from("sedes").select("id, nombre").eq("activa", true).order("nombre"),
    supabase.from("aulas").select("id, nombre, sedes(nombre)").eq("activa", true).order("nombre"),
  ]);
  const ciclos = (ciclosR.data ?? []) as Array<Opcion & { fecha_inicio: string; fecha_fin: string; estado: string }>;
  const cursos = (cursosR.data ?? []) as Opcion[];
  const niveles = (nivelesR.data ?? []) as Opcion[];
  const sedes = (sedesR.data ?? []) as Opcion[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aulas = ((aulasR.data ?? []) as any[]).map((a) => ({ id: a.id as string, nombre: a.nombre as string, sede: sedes.length > 1 ? uno<{ nombre: string }>(a.sedes)?.nombre : null }));

  const ciclo = ciclos.find((c) => esUuid(cicloPedido) && c.id === cicloPedido) ?? ciclos.find((c) => c.estado === "activo") ?? ciclos[0] ?? null;

  const comisionesR = ciclo
    ? await supabase.from("comisiones")
      .select("id, nombre, cupo, estado, publicada, modalidad, fecha_inicio, fecha_fin, cursos(nombre), niveles(nombre), sedes(nombre), comision_horarios(id, dia_semana, hora_inicio, hora_fin, aulas(nombre)), comision_docentes(funcion, hasta, personas(nombres, apellidos))")
      .eq("ciclo_id", ciclo.id).order("nombre")
    : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comisiones = (comisionesR?.data ?? []) as any[];
  const ocupacionR = comisiones.length > 0
    ? await supabase.from("comisiones_ocupacion").select("comision_id, cupo, inscriptos, reservas").in("comision_id", comisiones.map((k) => k.id))
    : null;
  const ocupacion = new Map((ocupacionR?.data ?? []).map((o) => [o.comision_id as string, o as { inscriptos: number; reservas: number }]));

  const faltantes = [
    ciclos.length === 0 ? "un ciclo lectivo" : null, cursos.length === 0 ? "un curso activo" : null,
    niveles.length === 0 ? "un nivel" : null, sedes.length === 0 ? "una sede activa" : null,
  ].filter(Boolean);
  const errorCatalogos = ciclosR.error || cursosR.error || nivelesR.error || sedesR.error;

  return (
    <>
      <Titulo descripcion="Grupos de cada ciclo, con sus horarios, docentes y lugares ocupados (inscriptos más reservas vigentes).">Comisiones</Titulo>

      {errorCatalogos ? <Aviso tono="peligro">No pudimos cargar los datos. Actualizá la página.</Aviso> : null}
      {ciclos.length > 1 ? (
        <nav aria-label="Ciclo lectivo" className="mb-4 flex flex-wrap gap-2 text-sm font-semibold">
          {ciclos.map((c) => (
            <Link key={c.id} href={`/panel/comisiones?ciclo=${c.id}`} aria-current={c.id === ciclo?.id ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-base border border-borde bg-superficie px-3 aria-[current]:border-marca aria-[current]:bg-marca-suave aria-[current]:text-marca-fuerte">
              {c.nombre}
            </Link>
          ))}
        </nav>
      ) : null}
      {ciclo ? <p className="mb-3 text-sm text-suave">Ciclo {ciclo.nombre}: del {fecha(ciclo.fecha_inicio)} al {fecha(ciclo.fecha_fin)}.</p> : null}

      {comisionesR?.error ? <Aviso tono="peligro">No pudimos cargar las comisiones. Actualizá la página.</Aviso> : null}
      {ocupacionR?.error ? <Aviso tono="peligro">No pudimos calcular los lugares ocupados.</Aviso> : null}
      {!errorCatalogos && !comisionesR?.error && comisiones.length === 0 ? (
        <EstadoVacio titulo={ciclo ? "Este ciclo todavía no tiene comisiones" : "Todavía no hay ciclos lectivos"}>
          {ciclo ? "Creá la primera con el formulario de abajo." : "Hace falta cargar un ciclo lectivo antes de crear comisiones."}
        </EstadoVacio>
      ) : null}

      <ul className="grid gap-4 lg:grid-cols-2">
        {comisiones.map((k) => {
          const [texto, tono] = estadoComision(k.estado);
          const o = ocupacion.get(k.id);
          const ocupados = o ? o.inscriptos + o.reservas : null;
          const horarios = ordenarHorarios(k.comision_horarios ?? []);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const docentes = ((k.comision_docentes ?? []) as any[]).filter((d) => !d.hasta);
          return (
            <li key={k.id}>
              <Tarjeta className="h-full">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{k.nombre}</h2>
                    <p className="text-sm text-suave">{[uno<Opcion>(k.cursos)?.nombre, uno<Opcion>(k.niveles)?.nombre, sedes.length > 1 ? uno<Opcion>(k.sedes)?.nombre : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Insignia tono={tono}>{texto}</Insignia>
                    <Insignia tono={k.publicada ? "marca" : "neutro"}>{k.publicada ? "Publicada" : "No publicada"}</Insignia>
                  </div>
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-suave">Lugares ocupados</dt>
                    <dd>
                      {o ? <><strong>{ocupados} de {k.cupo}</strong> ({o.inscriptos} inscriptos, {o.reservas} reservas)</> : `Cupo ${k.cupo}`}
                      {ocupados !== null && ocupados >= k.cupo ? <> <Insignia tono="alerta">Sin lugar</Insignia></> : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-suave">Horarios</dt>
                    <dd>{horarios.length === 0 ? "Sin horarios cargados" : <ul>{horarios.map((h) => <li key={h.id}>{textoHorario(h)}</li>)}</ul>}</dd>
                  </div>
                  <div>
                    <dt className="text-suave">Docentes</dt>
                    <dd>{docentes.length === 0 ? "Sin docente asignado" : docentes.map((d) => `${nombreCompleto(uno(d.personas))}${d.funcion !== "titular" ? ` (${d.funcion})` : ""}`).join(" · ")}</dd>
                  </div>
                  <div><dt className="text-suave">Período</dt><dd>{fecha(k.fecha_inicio)} al {fecha(k.fecha_fin)}</dd></div>
                </dl>
                <div className="mt-3"><Enlace href={`/panel/comisiones/${k.id}`} variante="secundario">Ver inscriptos y gestionar</Enlace></div>
              </Tarjeta>
            </li>
          );
        })}
      </ul>

      <Tarjeta className="mt-6">
        <h2 className="text-lg font-bold">Nueva comisión</h2>
        {faltantes.length > 0 ? (
          <div className="mt-2"><Aviso tono="alerta">Para crear una comisión primero tiene que existir {faltantes.join(", ")}. Pedile a dirección que lo cargue.</Aviso></div>
        ) : (
          <div className="mt-3">
            <Formulario accion={crearComision} boton="Crear comisión" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo id="nc-nombre" name="nombre" etiqueta="Nombre" required maxLength={80} placeholder="Ej.: Kids 1 — Lunes y miércoles" className="sm:col-span-2" />
              <Selector id="nc-curso" name="curso" etiqueta="Curso" required>{cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Selector>
              <Selector id="nc-nivel" name="nivel" etiqueta="Nivel" required>{niveles.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</Selector>
              <Selector id="nc-ciclo" name="ciclo" etiqueta="Ciclo lectivo" required defaultValue={ciclo?.id}>{ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Selector>
              <Selector id="nc-sede" name="sede" etiqueta="Sede" required>{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector>
              <Selector id="nc-modalidad" name="modalidad" etiqueta="Modalidad" defaultValue="presencial">
                <option value="presencial">Presencial</option><option value="virtual">Virtual</option><option value="mixta">Mixta</option>
              </Selector>
              <Campo id="nc-cupo" name="cupo" type="number" min={1} max={500} inputMode="numeric" etiqueta="Cupo" required />
              <Campo id="nc-inicio" name="fecha_inicio" type="date" etiqueta="Empieza" required defaultValue={ciclo?.fecha_inicio} />
              <Campo id="nc-fin" name="fecha_fin" type="date" etiqueta="Termina" required defaultValue={ciclo?.fecha_fin} />
              <Selector id="nc-estado" name="estado" etiqueta="Estado" defaultValue="borrador">
                {ESTADOS_COMISION.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
              </Selector>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" name="publicada" /> Mostrar en la página web</label>
            </Formulario>
            <p className="mt-2 text-sm text-suave">Solo se puede inscribir en comisiones “Abierta a inscripciones” o “En curso”.</p>
          </div>
        )}
      </Tarjeta>

      {comisiones.length > 0 ? (
        <Tarjeta className="mt-4">
          <h2 className="text-lg font-bold">Agregar horario</h2>
          <p className="mb-3 mt-1 text-sm text-suave">Vale para todo el período de la comisión. Si el aula o un docente ya están ocupados en ese horario, te avisamos y no se guarda.</p>
          <Formulario accion={agregarHorario} boton="Agregar horario" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Selector id="nh-comision" name="comision" etiqueta="Comisión" required>
              {comisiones.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
            </Selector>
            <CamposHorario prefijo="nh" aulas={aulas} />
          </Formulario>
        </Tarjeta>
      ) : null}
    </>
  );
}
