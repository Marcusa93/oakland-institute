/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, AreaTexto, Campo, EstadoVacio, Insignia, Selector, Tabla, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, hoyISO, nombreCompleto, pesos } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { uno } from "../estudiantes/comun";
import { Formulario } from "../estudiantes/formulario";
import {
  activarBeneficio, activarConcepto, cambiarPrecio, crearBeneficio, crearConcepto, finalizarPrecio, otorgarBeneficio, revocarBeneficio,
} from "./acciones";

export const metadata: Metadata = { title: "Aranceles y beneficios" };

const TIPO_CONCEPTO: Record<string, string> = {
  matricula: "Matrícula", cuota: "Cuota mensual", curso_especial: "Curso especial", derecho_examen: "Derecho de examen", material: "Materiales", otro: "Otro",
};
const TIPO_BENEFICIO: Record<string, string> = { descuento: "Descuento", beca: "Beca", promocion_familiar: "Promoción familiar" };
const h2 = "text-lg font-bold";

/** "2027" → "Ciclo 2027"; "Ciclo 2027 (demo)" queda igual. */
const nombreCiclo = (n: string) => (/^ciclo/i.test(n) ? n : `Ciclo ${n}`);

function alcanceDe(a: any) {
  const comision = uno<{ nombre: string }>(a.comisiones);
  const curso = uno<{ nombre: string }>(a.cursos);
  const ciclo = uno<{ nombre: string }>(a.ciclos_lectivos);
  if (comision) return { texto: `Comisión ${comision.nombre}`, orden: 3 };
  if (curso) return { texto: `Curso ${curso.nombre}${ciclo ? ` · ${nombreCiclo(ciclo.nombre)}` : ""}`, orden: 2 };
  if (ciclo) return { texto: `Todo el ${nombreCiclo(ciclo.nombre).replace(/^Ciclo/, "ciclo")}`, orden: 1 };
  return { texto: "General (todos los ciclos)", orden: 0 };
}

const valorBeneficio = (b: { porcentaje: string | null; monto_fijo: string | null }) =>
  b.porcentaje !== null ? `${Number(b.porcentaje).toLocaleString("es-AR")} %` : `${pesos(b.monto_fijo)} por cuota`;

function primeroDelMesSiguiente(hoy: string) {
  const [a, m] = hoy.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export default async function Aranceles() {
  const sesion = await exigirPermiso("aranceles_y_beneficios", "ver");
  const edita = puede(sesion.perfiles, "aranceles_y_beneficios", "editar");
  const hoy = hoyISO();
  const supabase = await crearClienteServidor();

  const [conceptosR, arancelesR, ciclosR, cursosR, comisionesR, beneficiosR, otorgadosR, matriculasR] = await Promise.all([
    supabase.from("conceptos").select("id, codigo, nombre, tipo, activo").order("nombre"),
    supabase.from("aranceles")
      .select("id, importe, vigente_desde, vigente_hasta, concepto_id, conceptos(nombre, tipo), ciclos_lectivos(nombre), cursos(nombre), comisiones(nombre)")
      .order("vigente_desde", { ascending: false }).limit(300),
    supabase.from("ciclos_lectivos").select("id, nombre, estado").order("fecha_inicio", { ascending: false }),
    supabase.from("cursos").select("id, nombre").eq("activo", true).order("orden").order("nombre"),
    supabase.from("comisiones").select("id, nombre, ciclos_lectivos(nombre)").in("estado", ["borrador", "abierta", "en_curso"]).order("nombre"),
    supabase.from("beneficios").select("id, nombre, tipo, porcentaje, monto_fijo, activo").order("activo", { ascending: false }).order("nombre"),
    supabase.from("beneficios_otorgados")
      .select("id, aplica_a, vigente_desde, vigente_hasta, motivo, beneficios(nombre, porcentaje, monto_fijo), matriculas(estudiante_id, estudiantes(legajo, personas(nombres, apellidos)), comisiones(nombre))")
      .is("revocado_en", null).order("aprobado_en", { ascending: false }).limit(300),
    edita
      ? supabase.from("matriculas").select("id, estudiantes(legajo, personas(nombres, apellidos)), comisiones(nombre)").eq("estado", "activa").limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const conceptos = (conceptosR.data ?? []) as Array<{ id: string; codigo: string; nombre: string; tipo: string; activo: boolean }>;
  const aranceles = (arancelesR.data ?? []) as any[];
  const vigentes = aranceles
    .filter((a) => !a.vigente_hasta || a.vigente_hasta >= hoy)
    .sort((a, b) => (uno<{ nombre: string }>(a.conceptos)?.nombre ?? "").localeCompare(uno<{ nombre: string }>(b.conceptos)?.nombre ?? "", "es")
      || alcanceDe(a).orden - alcanceDe(b).orden || a.vigente_desde.localeCompare(b.vigente_desde));
  const historial = aranceles.filter((a) => a.vigente_hasta && a.vigente_hasta < hoy).slice(0, 60);
  const ciclos = (ciclosR.data ?? []) as Array<{ id: string; nombre: string; estado: string }>;
  const cursos = (cursosR.data ?? []) as Array<{ id: string; nombre: string }>;
  const comisiones = (comisionesR.data ?? []) as any[];
  const beneficios = (beneficiosR.data ?? []) as Array<{ id: string; nombre: string; tipo: string; porcentaje: string | null; monto_fijo: string | null; activo: boolean }>;
  const otorgados = ((otorgadosR.data ?? []) as any[]).filter((o) => !o.vigente_hasta || o.vigente_hasta >= hoy);
  const matriculas = ((matriculasR.data ?? []) as any[])
    .map((m) => {
      const e = uno<any>(m.estudiantes);
      return { id: m.id as string, texto: `${nombreCompleto(uno(e?.personas))} — ${uno<{ nombre: string }>(m.comisiones)?.nombre ?? ""}` };
    })
    .sort((a, b) => a.texto.localeCompare(b.texto, "es"));
  const error = conceptosR.error || arancelesR.error || beneficiosR.error || otorgadosR.error;

  return (
    <>
      <Titulo descripcion="Precios de matrícula, cuotas y otros conceptos, y los descuentos o becas de cada estudiante. Cambiar un precio no modifica las cuotas que ya se generaron: cada cuota guarda el precio del momento.">
        Aranceles y beneficios
      </Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar todos los datos. Actualizá la página.</Aviso></div> : null}
      {!edita ? <div className="mb-4"><Aviso>Podés consultar los precios y beneficios. Los cambios los hace dirección.</Aviso></div> : null}

      {/* ------------------------------------------------------------ Precios */}
      <section aria-labelledby="t-precios" className="mb-8">
        <h2 id="t-precios" className={`${h2} mb-1`}>Precios vigentes</h2>
        <p className="mb-3 max-w-3xl text-sm text-suave">
          Si hay varios precios para el mismo concepto, rige el más específico: comisión, después curso, después ciclo y por último el general.
        </p>
        {vigentes.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay precios cargados">Sin un precio de cuota no se pueden generar las cuotas del mes.</EstadoVacio>
        ) : (
          <Tabla leyenda="Precios vigentes y programados" encabezados={["Concepto", "Se aplica a", "Importe", "Rige", ""]}>
            {vigentes.map((a) => {
              const futuro = a.vigente_desde > hoy;
              return (
                <tr key={a.id}>
                  <td className="font-semibold">{uno<{ nombre: string }>(a.conceptos)?.nombre}</td>
                  <td>{alcanceDe(a).texto}</td>
                  <td className="font-bold">{pesos(a.importe)}</td>
                  <td>
                    {futuro ? <Insignia tono="marca">Desde el {fecha(a.vigente_desde)}</Insignia> : <>Desde el {fecha(a.vigente_desde)}</>}
                    {a.vigente_hasta ? <p className="text-suave">hasta el {fecha(a.vigente_hasta)}</p> : null}
                  </td>
                  <td>
                    {edita && !a.vigente_hasta ? (
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-marca">Dejar de cobrar</summary>
                        <Formulario accion={finalizarPrecio} boton="Confirmar" variante="secundario" className="mt-2 grid min-w-48 gap-2">
                          <input type="hidden" name="arancel" value={a.id} />
                          <Campo id={`fin-${a.id}`} name="hasta" type="date" etiqueta="Último día" required defaultValue={hoy} min={a.vigente_desde} />
                        </Formulario>
                      </details>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Tabla>
        )}

        {edita ? (
          <Tarjeta className="mt-4">
            <h3 className="font-bold">Cambiar o cargar un precio</h3>
            <p className="mb-3 mt-1 text-sm text-suave">El precio anterior con el mismo alcance se cierra solo el día antes de que empiece el nuevo.</p>
            {conceptos.length === 0 ? <Aviso tono="alerta">Primero creá un concepto (más abajo).</Aviso> : (
              <Formulario accion={cambiarPrecio} boton="Guardar precio" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Selector id="p-concepto" name="concepto" etiqueta="Concepto" required>
                  {conceptos.filter((c) => c.activo && c.codigo !== "SALDO-ANTERIOR").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Selector>
                <Selector id="p-alcance" name="alcance" etiqueta="Se aplica a" defaultValue={ciclos.find((c) => c.estado === "activo") ? `ciclo:${ciclos.find((c) => c.estado === "activo")!.id}` : "general"}>
                  <option value="general">General (todos los ciclos)</option>
                  {ciclos.length ? <optgroup label="Un ciclo lectivo">{ciclos.map((c) => <option key={c.id} value={`ciclo:${c.id}`}>{nombreCiclo(c.nombre)}</option>)}</optgroup> : null}
                  {cursos.length ? <optgroup label="Un curso">{cursos.map((c) => <option key={c.id} value={`curso:${c.id}`}>Curso {c.nombre}</option>)}</optgroup> : null}
                  {comisiones.length ? <optgroup label="Una comisión">{comisiones.map((k) => <option key={k.id} value={`comision:${k.id}`}>{k.nombre}{uno<{ nombre: string }>(k.ciclos_lectivos) ? ` (${uno<{ nombre: string }>(k.ciclos_lectivos)!.nombre})` : ""}</option>)}</optgroup> : null}
                </Selector>
                <Campo id="p-importe" name="importe" inputMode="decimal" etiqueta="Importe ($)" required placeholder="45.000" autoComplete="off" />
                <Campo id="p-desde" name="desde" type="date" etiqueta="Rige desde" required defaultValue={primeroDelMesSiguiente(hoy)} />
              </Formulario>
            )}
          </Tarjeta>
        ) : null}

        {historial.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-marca">Ver precios anteriores ({historial.length})</summary>
            <ul className="mt-2 divide-y divide-borde rounded-base border border-borde bg-superficie px-4 text-sm">
              {historial.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{uno<{ nombre: string }>(a.conceptos)?.nombre} · {alcanceDe(a).texto}</span>
                  <span><strong>{pesos(a.importe)}</strong> · del {fecha(a.vigente_desde)} al {fecha(a.vigente_hasta)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ Beneficios otorgados */}
      <section aria-labelledby="t-otorgados" className="mb-8">
        <h2 id="t-otorgados" className={`${h2} mb-1`}>Becas y descuentos de estudiantes</h2>
        <p className="mb-3 max-w-3xl text-sm text-suave">Se descuentan solos de las cuotas que se generen mientras estén vigentes. Para corregir una cuota ya generada, anulala en Cobros y volvé a generarla.</p>
        {otorgados.length === 0 ? (
          <EstadoVacio titulo="Nadie tiene becas ni descuentos vigentes" />
        ) : (
          <Tabla leyenda="Beneficios vigentes por estudiante" encabezados={["Estudiante", "Beneficio", "Vigencia", ""]}>
            {otorgados.map((o) => {
              const m = uno<any>(o.matriculas);
              const e = uno<any>(m?.estudiantes);
              const b = uno<any>(o.beneficios);
              return (
                <tr key={o.id}>
                  <td>
                    {m?.estudiante_id ? <Link href={`/panel/estudiantes/${m.estudiante_id}`} className="font-semibold text-marca underline-offset-4 hover:underline">{nombreCompleto(uno(e?.personas))}</Link> : "—"}
                    <p className="text-suave">{e?.legajo} · {uno<{ nombre: string }>(m?.comisiones)?.nombre}</p>
                  </td>
                  <td>
                    <strong>{b?.nombre}</strong> <span className="text-suave">({b ? valorBeneficio(b) : ""}, sobre {o.aplica_a === "matricula" ? "la matrícula" : "la cuota"})</span>
                    {o.motivo ? <p className="text-suave">{o.motivo}</p> : null}
                  </td>
                  <td>Desde el {fecha(o.vigente_desde)}{o.vigente_hasta ? <><br />hasta el {fecha(o.vigente_hasta)}</> : <><br /><span className="text-suave">sin fecha de fin</span></>}</td>
                  <td>
                    {edita ? (
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-marca">Revocar</summary>
                        <Formulario accion={revocarBeneficio} boton="Revocar" variante="peligro" className="mt-2 grid min-w-56 gap-2">
                          <input type="hidden" name="id" value={o.id} />
                          <Campo id={`rev-${o.id}`} name="motivo" etiqueta="Motivo" required minLength={5} maxLength={300} />
                        </Formulario>
                      </details>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Tabla>
        )}

        {edita ? (
          <Tarjeta className="mt-4">
            <h3 className="font-bold">Otorgar una beca o un descuento</h3>
            {beneficios.filter((b) => b.activo).length === 0 ? (
              <div className="mt-2"><Aviso tono="alerta">Primero creá el beneficio (por ejemplo «Hermanos 10 %») en la sección de abajo.</Aviso></div>
            ) : matriculas.length === 0 ? (
              <div className="mt-2"><Aviso tono="alerta">No hay estudiantes con inscripción activa.</Aviso></div>
            ) : (
              <div className="mt-3">
                <Formulario accion={otorgarBeneficio} boton="Otorgar" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Selector id="o-matricula" name="matricula" etiqueta="Estudiante y comisión" required className="sm:col-span-2">
                    {matriculas.map((m) => <option key={m.id} value={m.id}>{m.texto}</option>)}
                  </Selector>
                  <Selector id="o-beneficio" name="beneficio" etiqueta="Beneficio" required>
                    {beneficios.filter((b) => b.activo).map((b) => <option key={b.id} value={b.id}>{b.nombre} ({valorBeneficio(b)})</option>)}
                  </Selector>
                  <Selector id="o-aplica" name="aplica_a" etiqueta="Se descuenta de" defaultValue="cuota">
                    <option value="cuota">Las cuotas</option>
                    <option value="matricula">La matrícula</option>
                  </Selector>
                  <Campo id="o-desde" name="desde" type="date" etiqueta="Desde" required defaultValue={`${hoy.slice(0, 8)}01`} />
                  <Campo id="o-hasta" name="hasta" type="date" etiqueta="Hasta (opcional)" />
                  <AreaTexto id="o-motivo" name="motivo" etiqueta="Motivo o nota (opcional)" maxLength={300} className="sm:col-span-2 lg:col-span-3" />
                </Formulario>
              </div>
            )}
          </Tarjeta>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ Catálogos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <h2 className={h2}>Tipos de beneficio</h2>
          {beneficios.length === 0 ? <p className="mt-2 text-sm text-suave">Todavía no hay beneficios creados.</p> : (
            <ul className="mt-2 divide-y divide-borde text-sm">
              {beneficios.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><strong>{b.nombre}</strong> · {TIPO_BENEFICIO[b.tipo] ?? b.tipo} · {valorBeneficio(b)} {b.activo ? null : <Insignia>Desactivado</Insignia>}</span>
                  {edita ? (
                    <Formulario accion={activarBeneficio} boton={b.activo ? "Desactivar" : "Activar"} enviando="…" variante="secundario" className="flex">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="activo" value={b.activo ? "no" : "si"} />
                    </Formulario>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {edita ? (
            <details className="mt-3 border-t border-borde pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-marca">Crear un beneficio</summary>
              <div className="mt-2">
                <Formulario accion={crearBeneficio} boton="Crear beneficio" className="grid gap-3 sm:grid-cols-2">
                  <Campo id="b-nombre" name="nombre" etiqueta="Nombre" required maxLength={80} placeholder="Hermanos 10 %" className="sm:col-span-2" />
                  <Selector id="b-tipo" name="tipo" etiqueta="Tipo" defaultValue="descuento">
                    <option value="descuento">Descuento</option><option value="beca">Beca</option><option value="promocion_familiar">Promoción familiar</option>
                  </Selector>
                  <Selector id="b-modo" name="modo" etiqueta="Cómo se calcula" defaultValue="porcentaje">
                    <option value="porcentaje">Porcentaje de la cuota</option><option value="monto">Monto fijo en pesos</option>
                  </Selector>
                  <Campo id="b-valor" name="valor" inputMode="decimal" etiqueta="Valor" required placeholder="10" ayuda="Para 10 %, escribí 10. Para un monto, el importe en pesos." />
                </Formulario>
              </div>
            </details>
          ) : null}
        </Tarjeta>

        <Tarjeta>
          <h2 className={h2}>Conceptos que se cobran</h2>
          <ul className="mt-2 divide-y divide-borde text-sm">
            {conceptos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><strong>{c.nombre}</strong> · {TIPO_CONCEPTO[c.tipo] ?? c.tipo} {c.activo ? null : <Insignia>Desactivado</Insignia>}</span>
                {edita && c.codigo !== "SALDO-ANTERIOR" ? (
                  <Formulario accion={activarConcepto} boton={c.activo ? "Desactivar" : "Activar"} enviando="…" variante="secundario" className="flex">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="activo" value={c.activo ? "no" : "si"} />
                  </Formulario>
                ) : null}
              </li>
            ))}
          </ul>
          {edita ? (
            <details className="mt-3 border-t border-borde pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-marca">Crear un concepto</summary>
              <div className="mt-2">
                <Formulario accion={crearConcepto} boton="Crear concepto" className="grid gap-3 sm:grid-cols-2">
                  <Campo id="c-nombre" name="nombre" etiqueta="Nombre" required maxLength={80} placeholder="Taller de conversación" />
                  <Selector id="c-tipo" name="tipo" etiqueta="Tipo" defaultValue="curso_especial">
                    {Object.entries(TIPO_CONCEPTO).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
                  </Selector>
                </Formulario>
              </div>
            </details>
          ) : null}
        </Tarjeta>
      </div>
    </>
  );
}
