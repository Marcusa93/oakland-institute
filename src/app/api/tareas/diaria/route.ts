import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/**
 * Tarea diaria (Vercel Cron, ver vercel.json). Vercel envía
 * `Authorization: Bearer <CRON_SECRET>`; sin ese secreto no corre nada.
 *
 * Hoy: revisa las alertas de todas las inscripciones activas (la de
 * participación depende del paso del tiempo, no de un evento). Es
 * idempotente: correrla dos veces no duplica alertas.
 * Las cuotas NO se generan solas: es una decisión de administración
 * (botón "Generar cuotas del mes" en Cobros).
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { data, error } = await crearClienteAdmin().rpc("revisar_alertas_programada");
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, alertas_revisadas: data });
}
