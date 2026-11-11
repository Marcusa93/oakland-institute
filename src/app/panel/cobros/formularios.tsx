"use client";

import { useActionState, useState } from "react";
import type { Resultado } from "@/app/panel/acciones";
import { Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import { fecha, pesos } from "@/lib/formato";
import {
  anularObligacion, crearObligacion, generarCuotas, imputarSaldo, registrarCobro, registrarDevolucion, reversarPago, validarPago,
} from "./acciones";

export interface OpcionObligacion { id: string; descripcion: string; estudiante: string; vencimiento: string; saldo: number; estado: string }

function Resultadito({ estado }: { estado: Resultado | null }) {
  return estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null;
}

const etiquetaObligacion = (o: OpcionObligacion) => `${o.descripcion} · ${o.estudiante} · saldo ${pesos(o.saldo)}`;

/** Bandeja: confirmar o rechazar una transferencia informada. */
export function ValidarPago({ pagoId }: { pagoId: string }) {
  const [estado, accion, guardando] = useActionState(validarPago, null);
  return (
    <form action={accion} className="mt-3 grid gap-3 border-t border-borde pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="pago" value={pagoId} />
      <Campo id={`motivo-${pagoId}`} name="motivo" etiqueta="Motivo del rechazo" ayuda="Obligatorio solo si rechazás. La familia lo va a ver." maxLength={300} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" name="decision" value="aprobar" disabled={guardando}>Confirmar acreditación</Boton>
        <Boton type="submit" name="decision" value="rechazar" variante="secundario" disabled={guardando}>Rechazar</Boton>
      </div>
      <div className="sm:col-span-2">
        <p className="text-xs text-suave">Confirmá solo si viste el dinero acreditado en la cuenta del instituto. El comprobante solo no alcanza.</p>
        <Resultadito estado={estado} />
      </div>
    </form>
  );
}

/** Alta de un cobro en efectivo o transferencia, con imputación a una o varias obligaciones. */
export function RegistrarCobro({ personaId, hoy, obligaciones }: { personaId: string; hoy: string; obligaciones: OpcionObligacion[] }) {
  const [estado, accion, guardando] = useActionState(registrarCobro, null);
  const [medio, setMedio] = useState<"efectivo" | "transferencia">("efectivo");
  const [verificada, setVerificada] = useState(true);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="persona" value={personaId} />
      <Selector id="cobro-medio" name="medio" etiqueta="Medio de pago" value={medio}
        onChange={(e) => { const m = e.target.value === "transferencia" ? "transferencia" : "efectivo"; setMedio(m); setVerificada(m === "efectivo"); }}>
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
      </Selector>
      <Campo id="cobro-importe" name="importe" etiqueta="Importe del pago" inputMode="decimal" placeholder="45.000,50" required autoComplete="off" />
      <Campo id="cobro-fecha" name="fecha" type="date" etiqueta="Fecha del pago" defaultValue={hoy} max={hoy} required />
      <Campo id="cobro-nota" name="nota" etiqueta="Nota (opcional)" maxLength={300} />

      <div className="sm:col-span-2 lg:col-span-4">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="confirmar" checked={verificada} onChange={(e) => setVerificada(e.target.checked)} />
          Acreditación verificada
        </label>
        <p className="text-xs text-suave">
          {medio === "efectivo"
            ? "Marcala si recibiste el efectivo en mano."
            : "Marcala solo si ya viste la transferencia acreditada en la cuenta del instituto."}{" "}
          {verificada ? null : "Sin verificar, el pago queda como «Informado» y no se imputa hasta validarlo."}
        </p>
      </div>

      <fieldset className="sm:col-span-2 lg:col-span-4" disabled={!verificada}>
        <legend className="text-sm font-semibold">Imputar a obligaciones</legend>
        <p className="mb-2 text-xs text-suave">
          Escribí cuánto de este pago va a cada obligación. Puede ser una parte. Lo que no imputes queda como saldo a favor.
        </p>
        {obligaciones.length === 0 ? (
          <p className="text-sm text-suave">Esta persona no tiene obligaciones con saldo. El pago va a quedar completo como saldo a favor.</p>
        ) : (
          <ul className="divide-y divide-borde rounded-base border border-borde">
            {obligaciones.map((o) => (
              <li key={o.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_12rem] sm:items-center">
                <div className="text-sm">
                  <p className="font-semibold">{o.descripcion}</p>
                  <p className="text-suave">
                    {o.estudiante} · vence {fecha(o.vencimiento)}{o.vencimiento < hoy ? " (vencida)" : ""} · saldo <strong className="text-texto">{pesos(o.saldo)}</strong>
                  </p>
                </div>
                <div>
                  <label htmlFor={`imp-${o.id}`} className="text-xs font-medium">Importe a imputar</label>
                  <input id={`imp-${o.id}`} name={`imp_${o.id}`} inputMode="decimal" autoComplete="off" placeholder="0"
                    className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3 py-2 text-base text-texto disabled:opacity-60" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Boton type="submit" disabled={guardando}>{guardando ? "Registrando…" : "Registrar cobro"}</Boton>
        <Resultadito estado={estado} />
      </div>
    </form>
  );
}

/** Operaciones sobre un pago confirmado: imputar su saldo a favor, devolverlo o reversar el pago. */
export function AccionesPago({ pagoId, saldoAFavor, obligaciones }: { pagoId: string; saldoAFavor: number; obligaciones: OpcionObligacion[] }) {
  const [imputado, imputar, imputando] = useActionState(imputarSaldo, null);
  const [devuelto, devolver, devolviendo] = useActionState(registrarDevolucion, null);
  const [reversado, reversar, reversando] = useActionState(reversarPago, null);
  const resumen = "cursor-pointer text-sm font-semibold text-marca";
  return (
    <div className="space-y-2">
      {saldoAFavor > 0 ? (
        <details>
          <summary className={resumen}>Imputar saldo a favor</summary>
          {obligaciones.length === 0 ? <p className="mt-2 text-sm text-suave">No hay obligaciones con saldo para imputar.</p> : (
            <form action={imputar} className="mt-2 grid gap-2">
              <input type="hidden" name="pago" value={pagoId} />
              <Selector id={`imp-obl-${pagoId}`} name="obligacion" etiqueta="Obligación" required defaultValue="">
                <option value="" disabled>Elegí una obligación</option>
                {obligaciones.map((o) => <option key={o.id} value={o.id}>{etiquetaObligacion(o)}</option>)}
              </Selector>
              <Campo id={`imp-importe-${pagoId}`} name="importe" etiqueta="Importe a imputar" inputMode="decimal" required autoComplete="off"
                ayuda={`Disponible: ${pesos(saldoAFavor)}`} />
              <Boton type="submit" disabled={imputando}>{imputando ? "Imputando…" : "Imputar"}</Boton>
            </form>
          )}
          <Resultadito estado={imputado} />
        </details>
      ) : null}
      {saldoAFavor > 0 ? (
        <details>
          <summary className={resumen}>Registrar devolución</summary>
          <form action={devolver} className="mt-2 grid gap-2">
            <input type="hidden" name="pago" value={pagoId} />
            <Campo id={`dev-importe-${pagoId}`} name="importe" etiqueta="Importe devuelto" inputMode="decimal" required autoComplete="off"
              ayuda={`Se puede devolver hasta ${pesos(saldoAFavor)} (el saldo a favor).`} />
            <Campo id={`dev-motivo-${pagoId}`} name="motivo" etiqueta="Motivo" required minLength={5} maxLength={300} />
            <Boton type="submit" disabled={devolviendo}>{devolviendo ? "Registrando…" : "Registrar devolución"}</Boton>
          </form>
          <Resultadito estado={devuelto} />
        </details>
      ) : null}
      <details>
        <summary className={resumen}>Reversar</summary>
        <form action={reversar} className="mt-2 grid gap-2">
          <input type="hidden" name="pago" value={pagoId} />
          <p className="text-xs text-suave">
            Un pago confirmado no se edita ni se borra. Al reversarlo queda en el historial con el motivo, se anulan sus imputaciones y las obligaciones recuperan su saldo.
          </p>
          <Campo id={`rev-motivo-${pagoId}`} name="motivo" etiqueta="Motivo del reverso" required minLength={5} maxLength={300} />
          <Boton type="submit" variante="peligro" disabled={reversando}>{reversando ? "Reversando…" : "Reversar pago"}</Boton>
        </form>
        <Resultadito estado={reversado} />
      </details>
    </div>
  );
}

export function GenerarCuotas({ mes }: { mes: string }) {
  const [estado, accion, generando] = useActionState(generarCuotas, null);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Campo id="cuotas-periodo" name="periodo" type="month" etiqueta="Mes de la cuota" defaultValue={mes} required />
      <Campo id="cuotas-dia" name="dia" type="number" min={1} max={28} etiqueta="Día de vencimiento" defaultValue={10} required />
      <Boton type="submit" disabled={generando}>{generando ? "Generando…" : "Generar cuotas"}</Boton>
      <div className="sm:col-span-3"><Resultadito estado={estado} /></div>
    </form>
  );
}

export function NuevaObligacion({ personaId, hoy, estudiantes, conceptos }: {
  personaId: string; hoy: string;
  estudiantes: Array<{ id: string; nombre: string }>;
  conceptos: Array<{ id: string; nombre: string }>;
}) {
  const [estado, accion, guardando] = useActionState(crearObligacion, null);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="persona" value={personaId} />
      <Selector id="obl-estudiante" name="estudiante" etiqueta="Estudiante" required defaultValue={estudiantes.length === 1 ? estudiantes[0].id : ""}>
        <option value="" disabled>Elegí un estudiante</option>
        {estudiantes.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </Selector>
      <Selector id="obl-concepto" name="concepto" etiqueta="Concepto" required defaultValue="">
        <option value="" disabled>Elegí un concepto</option>
        {conceptos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <Campo id="obl-descripcion" name="descripcion" etiqueta="Descripción" required minLength={3} maxLength={200} ayuda="Es lo que va a leer la familia en su cuenta." />
      <Campo id="obl-importe" name="importe" etiqueta="Importe" inputMode="decimal" placeholder="45.000,50" required autoComplete="off" />
      <Campo id="obl-vencimiento" name="vencimiento" type="date" etiqueta="Vencimiento" defaultValue={hoy} required />
      <div className="flex items-end"><Boton type="submit" disabled={guardando}>{guardando ? "Creando…" : "Crear obligación"}</Boton></div>
      <div className="sm:col-span-2 lg:col-span-3"><Resultadito estado={estado} /></div>
    </form>
  );
}

export function AnularObligacion({ obligaciones }: { obligaciones: OpcionObligacion[] }) {
  const [estado, accion, guardando] = useActionState(anularObligacion, null);
  const anulables = obligaciones.filter((o) => o.estado === "pendiente");
  if (anulables.length === 0) return <p className="text-sm text-suave">No hay obligaciones sin pagos para anular.</p>;
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Selector id="anular-obligacion" name="obligacion" etiqueta="Obligación" required defaultValue="">
        <option value="" disabled>Elegí una obligación</option>
        {anulables.map((o) => <option key={o.id} value={o.id}>{etiquetaObligacion(o)}</option>)}
      </Selector>
      <Campo id="anular-motivo" name="motivo" etiqueta="Motivo" required minLength={5} maxLength={300} />
      <Boton type="submit" variante="peligro" disabled={guardando}>{guardando ? "Anulando…" : "Anular obligación"}</Boton>
      <div className="sm:col-span-3"><Resultadito estado={estado} /></div>
    </form>
  );
}
