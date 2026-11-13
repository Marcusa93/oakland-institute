import { NextResponse, type NextRequest } from "next/server";
import { enviarPendientes } from "@/lib/push";

/**
 * Notificaciones al celular pendientes (cron del VPS, cada minuto). Las
 * acciones ya las mandan al momento; esto cubre reintentos y lo que encola
 * la base sin pasar por una acción. Requiere `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await enviarPendientes(300)) });
}
