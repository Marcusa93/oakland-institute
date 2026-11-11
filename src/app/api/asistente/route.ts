import { NextResponse } from "next/server";
import { obtenerProveedor } from "@/lib/asistente/proveedor";
import { respuestaSobreOferta } from "@/lib/asistente/oferta";
import { MAX_PREGUNTA, responder } from "@/lib/asistente/responder";
import { obtenerOferta } from "@/lib/oferta";
import type { Fuente } from "@/lib/asistente/tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export async function POST(request: Request) {
  // Sin sesión responde como visitante: solo documentación pública y oferta,
  // y nunca usa un modelo externo (sin costo y sin datos de nadie).
  const sesion = await obtenerSesion();

  let pregunta = "";
  try {
    const cuerpo = (await request.json()) as { pregunta?: unknown };
    if (typeof cuerpo.pregunta === "string") pregunta = cuerpo.pregunta.slice(0, MAX_PREGUNTA);
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const supabase = await crearClienteServidor();
  const respuesta = await responder(
    pregunta,
    { perfiles: sesion ? sesion.perfiles : ["visitante"] },
    {
      proveedor: sesion ? obtenerProveedor() : null,
      registrarUso: async () => (sesion ? (await supabase.rpc("registrar_uso_asistente")).data === true : true),
      // A docentes no les respondemos con la oferta: sus preguntas son de enseñanza.
      oferta: async (q) =>
        sesion && sesion.perfiles.every((p) => p === "docente" || p === "administracion" || p === "direccion")
          ? null
          : respuestaSobreOferta(q, (await obtenerOferta()).cursos),
      buscar: async (q) => ((await supabase.rpc("buscar_ayuda", { p_consulta: q, p_limite: 4 })).data ?? []) as Fuente[],
    },
  );
  // No se registra el texto de la pregunta (minimización de datos).
  return NextResponse.json(respuesta, { headers: { "Cache-Control": "private, no-store" } });
}
