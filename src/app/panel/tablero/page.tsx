import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Aviso, Boton, Campo, EstadoVacio, Tabla, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, hoyISO, pesos } from "@/lib/formato";
import { exigirPermiso, mensajeDeError } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Tablero" };

/** Forma del jsonb que devuelve `tablero_direccion` (ver la función en la base). */
interface Tablero {
  caja: { cobros: number; devoluciones: number; gastos: number; pagos_docentes: number; flujo_neto: number };
  devengado: { obligaciones_del_periodo: number };
  saldos_a_hoy: { pendiente: number; vencido: number };
  captacion: { consultas: number; ganadas: number; conversion: number | null };
  ocupacion: Array<{ comision_id: string; comision: string; cupo: number; inscriptos: number }>;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const h2 = "text-lg font-bold";

function ultimoDiaDelMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Un indicador con su fórmula y su fuente a la vista. */
function Indicador({ nombre, valor, formula, destacado = false }: { nombre: string; valor: ReactNode; formula: string; destacado?: boolean }) {
  return (
    <div className={`rounded-base border border-borde bg-superficie p-4 ${destacado ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <dt className="text-sm font-medium text-suave">{nombre}</dt>
      <dd className={`mt-1 font-bold ${destacado ? "text-3xl" : "text-2xl"}`}>{valor}</dd>
      <dd className="mt-2 text-xs text-suave">{formula}</dd>
    </div>
  );
}

function Bloque({ id, titulo, bajada, children }: { id: string; titulo: string; bajada: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-8">
      <h2 id={id} className={h2}>{titulo}</h2>
      <p className="mb-3 max-w-2xl text-sm text-suave">{bajada}</p>
      {children}
    </section>
  );
}

export default async function TableroDireccion({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  await exigirPermiso("tablero", "ver");
  const hoy = hoyISO();
  const p = await searchParams;
  const desde = p.desde && ISO.test(p.desde) ? p.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = p.hasta && ISO.test(p.hasta) ? p.hasta : ultimoDiaDelMes(hoy.slice(0, 7));
  const periodoValido = hasta >= desde;

  let tablero: Tablero | null = null;
  let falla: string | null = periodoValido ? null : "La fecha «hasta» no puede ser anterior a la fecha «desde».";
  if (periodoValido) {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("tablero_direccion", { p_desde: desde, p_hasta: hasta });
    if (error) falla = /PERIODO_INVALIDO|date/i.test(error.message ?? "") ? "El período elegido no es válido. Revisá las fechas." : mensajeDeError(error);
    else tablero = data as Tablero;
  }
  const periodo = `del ${fecha(desde)} al ${fecha(hasta)}`;

  return (
    <>
      <Titulo descripcion="Informe de gestión interno. No es un balance contable.">Tablero de dirección</Titulo>

      <Tarjeta className="mb-6">
        <form method="get" action="/panel/tablero" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo id="tablero-desde" name="desde" type="date" etiqueta="Desde" defaultValue={desde} required />
          <Campo id="tablero-hasta" name="hasta" type="date" etiqueta="Hasta" defaultValue={hasta} required />
          <Boton type="submit" variante="secundario">Ver período</Boton>
        </form>
        <p className="mt-2 text-xs text-suave">Caja, Devengado y Conversión usan este período. Saldos y Ocupación muestran la situación de hoy.</p>
      </Tarjeta>

      {falla ? <Aviso tono="peligro">{falla}</Aviso> : null}

      {tablero ? (
        <>
          <Bloque id="t-caja" titulo="Caja" bajada={`Dinero que efectivamente entró y salió ${periodo}, según la fecha de cada movimiento.`}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador nombre="Cobros confirmados" valor={pesos(tablero.caja.cobros)}
                formula="Suma de pagos en estado Confirmado con fecha de pago en el período. Los informados sin validar, rechazados y reversados no cuentan. Fuente: pagos." />
              <Indicador nombre="Devoluciones" valor={pesos(tablero.caja.devoluciones)}
                formula="Suma de las devoluciones registradas con fecha en el período. Fuente: ajustes de tipo devolución." />
              <Indicador nombre="Gastos" valor={pesos(tablero.caja.gastos)}
                formula="Suma de gastos no anulados con fecha en el período. Fuente: gastos." />
              <Indicador nombre="Pagos a docentes" valor={pesos(tablero.caja.pagos_docentes)}
                formula="Suma de pagos a docentes no anulados con fecha de pago en el período. Registro interno, no liquidación de haberes. Fuente: pagos a docentes." />
              <Indicador destacado nombre="Flujo neto de caja" valor={<>{pesos(tablero.caja.flujo_neto)}{tablero.caja.flujo_neto < 0 ? <span className="ml-2 text-base font-semibold">(salió más de lo que entró)</span> : null}</>}
                formula="Cobros confirmados − devoluciones − gastos − pagos a docentes, todos del período." />
            </dl>
          </Bloque>

          <Bloque id="t-devengado" titulo="Devengado" bajada={`Lo que correspondía cobrar ${periodo}, se haya cobrado o no. No es dinero en caja.`}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador nombre="Obligaciones del período" valor={pesos(tablero.devengado.obligaciones_del_periodo)}
                formula="Suma del importe (ya con descuentos) de las obligaciones no anuladas cuyo vencimiento cae en el período. Fuente: obligaciones." />
            </dl>
          </Bloque>

          <Bloque id="t-saldos" titulo="Saldos a hoy" bajada={`Lo que falta cobrar al ${fecha(hoy)}. No depende del período elegido.`}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador nombre="Pendiente de cobro" valor={pesos(tablero.saldos_a_hoy.pendiente)}
                formula="Suma del saldo (importe − pagos imputados) de las obligaciones pendientes o con pago parcial. Fuente: saldos de obligaciones." />
              <Indicador nombre="Vencido" valor={pesos(tablero.saldos_a_hoy.vencido)}
                formula="Parte del pendiente cuyo vencimiento es anterior a hoy. Fuente: saldos de obligaciones." />
            </dl>
          </Bloque>

          <Bloque id="t-ocupacion" titulo="Ocupación por comisión" bajada="Inscripciones activas hoy sobre el cupo de cada comisión abierta o en curso.">
            {tablero.ocupacion.length === 0 ? <EstadoVacio titulo="No hay comisiones abiertas o en curso" /> : (
              <Tabla leyenda="Ocupación de las comisiones abiertas o en curso" encabezados={["Comisión", "Inscriptos / cupo", "Ocupación", "Situación"]}>
                {tablero.ocupacion.map((c) => {
                  const porcentaje = c.cupo > 0 ? Math.round((c.inscriptos / c.cupo) * 100) : 0;
                  const libres = c.cupo - c.inscriptos;
                  return (
                    <tr key={c.comision_id}>
                      <th scope="row" className="px-3 py-2.5 text-left align-top font-semibold">{c.comision}</th>
                      <td className="whitespace-nowrap">{c.inscriptos} de {c.cupo}</td>
                      <td className="min-w-40">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="h-3 flex-1 overflow-hidden rounded-full border border-borde bg-fondo">
                            <span className="block h-full bg-marca" style={{ width: `${Math.min(porcentaje, 100)}%` }} />
                          </span>
                          <span className="w-12 text-right font-semibold">{porcentaje} %</span>
                        </span>
                      </td>
                      <td>{libres <= 0 ? "Completa" : libres === 1 ? "Queda 1 lugar" : `Quedan ${libres} lugares`}</td>
                    </tr>
                  );
                })}
              </Tabla>
            )}
            <p className="mt-2 text-xs text-suave">Ocupación = inscripciones activas ÷ cupo. Las reservas de vacante sin confirmar no cuentan. Fuente: inscripciones y comisiones.</p>
          </Bloque>

          <Bloque id="t-conversion" titulo="Conversión de consultas" bajada={`Consultas recibidas ${periodo} que terminaron en inscripción.`}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador nombre="Conversión"
                valor={tablero.captacion.conversion === null ? <span className="text-xl">Sin datos suficientes</span> : `${(tablero.captacion.conversion * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`}
                formula="Consultas en estado Inscripta ÷ consultas recibidas en el período. Si no se recibió ninguna, no se calcula. Fuente: consultas." />
              <Indicador nombre="Consultas recibidas" valor={tablero.captacion.consultas}
                formula="Consultas creadas en el período (hora de Tucumán). Fuente: consultas." />
              <Indicador nombre="Terminaron en inscripción" valor={tablero.captacion.ganadas}
                formula="De las recibidas en el período, las que hoy están en estado Inscripta. Las que siguen abiertas todavía pueden sumarse." />
            </dl>
          </Bloque>
        </>
      ) : null}
    </>
  );
}
