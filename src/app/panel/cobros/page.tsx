/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Boton, Campo, Enlace, EstadoVacio, Insignia, Tabla, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha, fechaHora, hoyISO, pesos } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cargarObligaciones, ESTADO_PAGO, MEDIO } from "./datos";
import { sumar } from "./dinero";
import { AccionesPago, AnularObligacion, GenerarCuotas, NuevaObligacion, RegistrarCobro, ValidarPago, type OpcionObligacion } from "./formularios";

export const metadata: Metadata = { title: "Cobros" };

const UUID = /^[0-9a-f-]{36}$/i;
const TONO_PAGO: Record<string, Tono> = { informado: "alerta", confirmado: "exito", rechazado: "peligro", reversado: "neutro" };
const nombre = (p: { nombres: string; apellidos: string } | null | undefined) => (p ? `${p.apellidos}, ${p.nombres}` : "—");
const h2 = "mb-3 text-lg font-bold";

function Comprobante({ documento }: { documento: { id: string; nombre: string } | null }) {
  if (!documento) return <span className="text-suave">Sin comprobante adjunto</span>;
  return (
    <a href={`/panel/cuenta/comprobante/${documento.id}`} target="_blank" rel="noreferrer" className="font-semibold text-marca underline-offset-4 hover:underline">
      Ver comprobante<span className="sr-only"> ({documento.nombre}, se abre en otra pestaña)</span>
    </a>
  );
}

export default async function Cobros({ searchParams }: { searchParams: Promise<{ q?: string; persona?: string }> }) {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const parametros = await searchParams;
  const q = (parametros.q ?? "").replace(/[%_*,()]/g, " ").trim().slice(0, 60);
  const personaId = parametros.persona && UUID.test(parametros.persona) ? parametros.persona : null;
  const hoy = hoyISO();
  const supabase = await crearClienteServidor();

  const [porValidar, vencidas, encontrados] = await Promise.all([
    supabase.from("pagos")
      .select("id, importe, fecha_pago, nota, registrado_en, pagador_persona_id, pagador:personas!pagador_persona_id(nombres, apellidos), comprobante:documentos(id, nombre)")
      .eq("estado", "informado").order("registrado_en").limit(100),
    cargarObligaciones(supabase, { vencidasAntesDe: hoy, limite: 200 }),
    q.length >= 2 && !personaId
      ? supabase.from("personas").select("id, nombres, apellidos").ilike("apellidos", `%${q}%`).is("eliminada_en", null).order("apellidos").order("nombres").limit(25)
      : Promise.resolve({ data: null, error: null }),
  ]);

  return (
    <>
      <Titulo descripcion="Una obligación es lo que se debe; un pago es el dinero recibido; imputar es aplicar un pago a una o varias obligaciones. Los saldos se calculan siempre a partir de esos tres registros.">
        Cobros
      </Titulo>

      <section aria-labelledby="t-validar" className="mb-8">
        <h2 id="t-validar" className={h2}>Pagos por validar</h2>
        <p className="mb-3 max-w-2xl text-sm text-suave">
          Transferencias que informaron las familias. Un comprobante no es un pago confirmado: quedan «Informadas» hasta que alguien de gestión verifique la acreditación en la cuenta del instituto.
        </p>
        {porValidar.error ? <Aviso tono="peligro">No pudimos cargar los pagos por validar. Actualizá la página.</Aviso> : null}
        {!porValidar.error && (porValidar.data ?? []).length === 0 ? (
          <EstadoVacio titulo="No hay pagos esperando validación">Cuando una familia informe una transferencia, aparece acá.</EstadoVacio>
        ) : null}
        <ul className="space-y-3">
          {(porValidar.data ?? []).map((p: any) => (
            <li key={p.id}>
              <Tarjeta>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{nombre(p.pagador)}</p>
                    <p className="text-sm text-suave">Transferencia del {fecha(p.fecha_pago)} · informada el {fechaHora(p.registrado_en)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{pesos(p.importe)}</p>
                    <Insignia tono="alerta">Informado</Insignia>
                  </div>
                </div>
                {p.nota ? <p className="mt-2 rounded-base bg-fondo p-3 text-sm">{p.nota}</p> : null}
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <Comprobante documento={p.comprobante} />
                  <Link href={`/panel/cobros?persona=${p.pagador_persona_id}`} className="font-semibold text-marca underline-offset-4 hover:underline">Ver la cuenta de esta persona</Link>
                </p>
                <ValidarPago pagoId={p.id} />
              </Tarjeta>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-registrar" className="mb-8">
        <h2 id="t-registrar" className={h2}>Registrar cobro</h2>
        <Tarjeta>
          <form method="get" action="/panel/cobros" role="search" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Campo id="buscar-persona" name="q" type="search" etiqueta="Buscar al responsable de pago por apellido" defaultValue={q} minLength={2} required
              ayuda="Es la persona que paga: madre, padre, tutor o el propio estudiante adulto." />
            <Boton type="submit" variante="secundario">Buscar</Boton>
          </form>
          {encontrados.error ? <div className="mt-3"><Aviso tono="peligro">No pudimos buscar. Probá de nuevo.</Aviso></div> : null}
          {encontrados.data ? (
            encontrados.data.length === 0 ? (
              <p className="mt-3 text-sm text-suave">No encontramos personas con ese apellido.</p>
            ) : (
              <ul className="mt-3 divide-y divide-borde rounded-base border border-borde">
                {encontrados.data.map((p: any) => (
                  <li key={p.id}>
                    <Link href={`/panel/cobros?persona=${p.id}`} className="flex min-h-11 items-center px-3 text-sm font-semibold text-marca hover:bg-marca-suave">{nombre(p)}</Link>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Tarjeta>
        {personaId ? <CuentaDePersona personaId={personaId} hoy={hoy} /> : null}
      </section>

      <section aria-labelledby="t-cuotas" className="mb-8">
        <h2 id="t-cuotas" className={h2}>Generar cuotas del mes</h2>
        <Tarjeta>
          <p className="mb-3 max-w-2xl text-sm text-suave">
            Crea la cuota del mes para cada inscripción activa, con el arancel vigente y los beneficios aprobados. Se puede repetir sin riesgo: si la cuota de ese mes ya existe, no se duplica.
          </p>
          <GenerarCuotas mes={hoy.slice(0, 7)} />
        </Tarjeta>
      </section>

      <section aria-labelledby="t-vencidas">
        <h2 id="t-vencidas" className={h2}>Obligaciones vencidas</h2>
        {vencidas.error ? <Aviso tono="peligro">No pudimos cargar las obligaciones vencidas. Actualizá la página.</Aviso> : null}
        {!vencidas.error && vencidas.filas.length === 0 ? (
          <EstadoVacio titulo="No hay obligaciones vencidas">Todo lo que venció hasta hoy está pagado.</EstadoVacio>
        ) : null}
        {vencidas.filas.length > 0 ? (
          <>
            <p className="mb-2 text-sm">
              {vencidas.filas.length} {vencidas.filas.length === 1 ? "obligación vencida" : "obligaciones vencidas"} · saldo total <strong>{pesos(sumar(vencidas.filas.map((o) => o.saldo)))}</strong>
              {vencidas.filas.length === 200 ? <span className="text-suave"> (se muestran las 200 más antiguas)</span> : null}
            </p>
            <Tabla leyenda="Obligaciones con saldo cuyo vencimiento ya pasó" encabezados={["Venció", "Obligación", "Estudiante", "Responsable de pago", "Pagado", "Saldo", "Acción"]}>
              {vencidas.filas.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap">{fecha(o.vencimiento)}</td>
                  <td>{o.descripcion}{o.estado === "parcial" ? <> <Insignia tono="alerta">Pago parcial</Insignia></> : null}</td>
                  <td>{o.estudiante}</td>
                  <td>{o.responsable ?? "—"}</td>
                  <td className="whitespace-nowrap">{pesos(o.pagado)}</td>
                  <td className="whitespace-nowrap font-semibold">{pesos(o.saldo)}</td>
                  <td><Link href={`/panel/cobros?persona=${o.responsableId}`} className="whitespace-nowrap font-semibold text-marca underline-offset-4 hover:underline">Registrar cobro<span className="sr-only"> a {o.responsable ?? "su responsable"}</span></Link></td>
                </tr>
              ))}
            </Tabla>
          </>
        ) : null}
      </section>
    </>
  );
}

/** Todo lo de un responsable de pago: registrar cobro, sus pagos y sus obligaciones. */
async function CuentaDePersona({ personaId, hoy }: { personaId: string; hoy: string }) {
  const supabase = await crearClienteServidor();
  const [persona, abiertas, pagos, saldos, propio, matriculas, vinculos, conceptos] = await Promise.all([
    supabase.from("personas").select("id, nombres, apellidos").eq("id", personaId).maybeSingle(),
    cargarObligaciones(supabase, { responsable: personaId, abiertas: true }),
    supabase.from("pagos")
      .select("id, medio, importe, fecha_pago, estado, nota, motivo_rechazo, comprobante:documentos(id, nombre)")
      .eq("pagador_persona_id", personaId).order("fecha_pago", { ascending: false }).order("registrado_en", { ascending: false }).limit(50),
    supabase.from("pagos_saldo").select("pago_id, imputado, devuelto, saldo_a_favor").eq("pagador_persona_id", personaId),
    supabase.from("estudiantes").select("id, legajo, personas(nombres, apellidos)").eq("persona_id", personaId),
    // El responsable de pago de cada matrícula vive en `matriculas_pago` (1 a 1 con `matriculas`).
    supabase.from("matriculas_pago").select("matriculas(estudiantes(id, legajo, personas(nombres, apellidos)))").eq("responsable_pago_persona_id", personaId).limit(100),
    supabase.from("vinculos_responsables").select("estudiantes(id, legajo, personas(nombres, apellidos))").eq("responsable_persona_id", personaId).eq("estado", "verificado"),
    supabase.from("conceptos").select("id, nombre").eq("activo", true).in("tipo", ["derecho_examen", "material", "curso_especial", "otro"]).order("nombre"),
  ]);

  if (persona.error) return <div className="mt-4"><Aviso tono="peligro">No pudimos cargar la cuenta de esa persona. Actualizá la página.</Aviso></div>;
  if (!persona.data) return <div className="mt-4"><Aviso tono="alerta">No encontramos a esa persona. Buscala de nuevo por apellido.</Aviso></div>;

  const opciones: OpcionObligacion[] = abiertas.filas.map((o) => ({
    id: o.id, descripcion: o.descripcion, estudiante: o.estudiante, vencimiento: o.vencimiento, saldo: o.saldo, estado: o.estado,
  }));
  const saldoDePago = new Map<string, any>((saldos.data ?? []).map((s: any) => [s.pago_id, s]));
  const estudiantes = new Map<string, string>();
  for (const e of [...(propio.data ?? []), ...(matriculas.data ?? []).map((m: any) => m.matriculas?.estudiantes), ...(vinculos.data ?? []).map((v: any) => v.estudiantes)] as any[]) {
    if (e?.id) estudiantes.set(e.id, `${nombre(e.personas)}${e.legajo ? ` (${e.legajo})` : ""}`);
  }
  const aFavor = sumar((saldos.data ?? []).map((s: any) => s.saldo_a_favor));

  return (
    <div className="mt-4 space-y-4">
      <Tarjeta>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold">Cobro a {nombre(persona.data)}</h3>
            <p className="text-sm text-suave">
              Debe {pesos(sumar(abiertas.filas.map((o) => o.saldo)))} en {abiertas.filas.length} {abiertas.filas.length === 1 ? "obligación" : "obligaciones"} · saldo a favor sin imputar {pesos(aFavor)}
            </p>
          </div>
          <Enlace href="/panel/cobros" variante="secundario">Elegir otra persona</Enlace>
        </div>
        {abiertas.error ? <Aviso tono="peligro">No pudimos cargar sus obligaciones. Actualizá la página antes de registrar un cobro.</Aviso> : (
          <RegistrarCobro personaId={personaId} hoy={hoy} obligaciones={opciones} />
        )}
      </Tarjeta>

      <div>
        <h3 className="mb-2 text-base font-bold">Pagos de {nombre(persona.data)}</h3>
        {pagos.error || saldos.error ? <Aviso tono="peligro">No pudimos cargar sus pagos. Actualizá la página.</Aviso> : (pagos.data ?? []).length === 0 ? (
          <EstadoVacio titulo="Todavía no tiene pagos registrados" />
        ) : (
          <Tabla leyenda={`Pagos de ${nombre(persona.data)} con lo imputado y el saldo a favor de cada uno`} encabezados={["Fecha", "Medio", "Importe", "Estado", "Imputado", "Saldo a favor", "Acciones"]}>
            {(pagos.data ?? []).map((p: any) => {
              const s = saldoDePago.get(p.id);
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{fecha(p.fecha_pago)}</td>
                  <td>{MEDIO[p.medio] ?? p.medio}{p.comprobante ? <><br /><Comprobante documento={p.comprobante} /></> : null}</td>
                  <td className="whitespace-nowrap font-semibold">{pesos(p.importe)}</td>
                  <td>
                    <Insignia tono={TONO_PAGO[p.estado]}>{ESTADO_PAGO[p.estado] ?? p.estado}</Insignia>
                    {p.estado === "rechazado" && p.motivo_rechazo ? <p className="mt-1 text-xs text-suave">Motivo: {p.motivo_rechazo}</p> : null}
                    {p.estado === "informado" ? <p className="mt-1 text-xs text-suave">Validalo en «Pagos por validar».</p> : null}
                  </td>
                  <td className="whitespace-nowrap">{pesos(s?.imputado ?? 0)}{s && s.devuelto > 0 ? <p className="text-xs text-suave">Devuelto: {pesos(s.devuelto)}</p> : null}</td>
                  <td className="whitespace-nowrap">{pesos(s?.saldo_a_favor ?? 0)}</td>
                  <td className="min-w-56">
                    {p.estado === "confirmado" ? <AccionesPago pagoId={p.id} saldoAFavor={s?.saldo_a_favor ?? 0} obligaciones={opciones} /> : <span className="text-suave">—</span>}
                  </td>
                </tr>
              );
            })}
          </Tabla>
        )}
      </div>

      <Tarjeta>
        <h3 className="text-base font-bold">Nueva obligación manual</h3>
        <p className="mb-3 text-sm text-suave">Para derechos de examen, materiales u otros cargos puntuales a nombre de {nombre(persona.data)}. Las cuotas mensuales se generan más abajo, todas juntas.</p>
        {conceptos.error || (conceptos.data ?? []).length === 0 ? (
          <Aviso tono="alerta">No hay conceptos activos para cargos manuales. Dirección tiene que cargarlos antes de crear una obligación.</Aviso>
        ) : estudiantes.size === 0 ? (
          <Aviso tono="alerta">Esta persona no figura como responsable de pago ni como responsable verificado de ningún estudiante.</Aviso>
        ) : (
          <NuevaObligacion personaId={personaId} hoy={hoy} conceptos={conceptos.data as Array<{ id: string; nombre: string }>}
            estudiantes={[...estudiantes].map(([id, n]) => ({ id, nombre: n })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))} />
        )}
      </Tarjeta>

      <Tarjeta>
        <h3 className="text-base font-bold">Anular una obligación</h3>
        <p className="mb-3 text-sm text-suave">Solo se anulan obligaciones sin pagos imputados. Si ya tiene pagos, primero hay que reversarlos. La anulación queda registrada con su motivo.</p>
        <AnularObligacion obligaciones={opciones} />
      </Tarjeta>
    </div>
  );
}
