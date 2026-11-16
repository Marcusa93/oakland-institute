import { armarCsv, fechaCsv, legible, numero, respuestaCsv } from "@/lib/csv";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cargarObligaciones } from "../datos";

/** Todo lo que se debe (pendiente o con pago parcial), con su saldo, para Excel. `?vencidas=1` solo lo vencido. */
export async function GET(request: Request) {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const vencidas = new URL(request.url).searchParams.get("vencidas") === "1";
  const hoy = hoyISO();
  const supabase = await crearClienteServidor();
  const { filas, error } = await cargarObligaciones(supabase, vencidas ? { vencidasAntesDe: hoy, limite: 5000 } : { abiertas: true, limite: 5000 });
  if (error) return new Response("No pudimos armar la planilla. Probá de nuevo.", { status: 500 });
  const csv = armarCsv(
    ["Vencimiento", "Concepto", "Estudiante", "Legajo", "Responsable de pago", "Importe", "Pagado", "Saldo", "Estado", "Vencida"],
    filas.map((o) => [fechaCsv(o.vencimiento), o.descripcion, o.estudiante, o.legajo, o.responsable, numero(o.importe), numero(o.pagado), numero(o.saldo), o.estado === "parcial" ? "Pago parcial" : legible(o.estado), o.vencimiento < hoy ? "Sí" : "No"]),
  );
  return respuestaCsv(`${vencidas ? "deudas-vencidas" : "saldos-pendientes"}-${hoy}.csv`, csv);
}
