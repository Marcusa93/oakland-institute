import { NextResponse, type NextRequest } from "next/server";
import { hoyISO } from "@/lib/formato";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/**
 * Tarea diaria (cron del servidor, ver scripts/vps/instalar.sh). Llega con
 * `Authorization: Bearer <CRON_SECRET>`; sin ese secreto no corre nada.
 *
 * 1. Revisa las alertas de todas las inscripciones activas (la de
 *    participación depende del paso del tiempo, no de un evento).
 * 2. Genera las cuotas del mes, una sola vez por mes: si administración ya
 *    las generó a mano con el botón de Cobros, no hace nada. Se apaga con
 *    CUOTAS_AUTOMATICAS=no; el vencimiento sale de CUOTAS_DIA_VENCIMIENTO
 *    (10 si no está).
 *
 * Las dos partes son idempotentes: correrla dos veces no duplica nada.
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = crearClienteAdmin();
  const alertas = await admin.rpc("revisar_alertas_programada");

  let cuotas: number | "apagadas" | "error" = "apagadas";
  if (process.env.CUOTAS_AUTOMATICAS !== "no") {
    const dia = Number(process.env.CUOTAS_DIA_VENCIMIENTO ?? 10);
    const r = await admin.rpc("generar_cuotas_programada", {
      p_periodo: `${hoyISO().slice(0, 7)}-01`,
      p_dia_vencimiento: Number.isInteger(dia) && dia >= 1 && dia <= 28 ? dia : 10,
    });
    cuotas = r.error ? "error" : Number(r.data ?? 0);
  }

  const ok = !alertas.error && cuotas !== "error";
  return NextResponse.json({ ok, alertas_revisadas: alertas.error ? "error" : alertas.data, cuotas_generadas: cuotas }, { status: ok ? 200 : 500 });
}
