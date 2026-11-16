/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import { armarCsv, fechaCsv, legible, numero, respuestaCsv } from "@/lib/csv";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { uno } from "../../estudiantes/comun";

/** Gastos de un mes (`?mes=AAAA-MM`, por defecto el actual), incluidos los anulados marcados como tales. */
export async function GET(request: Request) {
  await exigirPermiso("gastos", "ver");
  const pedido = new URL(request.url).searchParams.get("mes") ?? "";
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : hoyISO().slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const hasta = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("gastos")
    .select("fecha, descripcion, importe, medio, anulado_en, motivo_anulacion, categorias_gasto(nombre), proveedores(nombre), cursos(nombre), comisiones(nombre)")
    .gte("fecha", `${mes}-01`).lt("fecha", hasta).order("fecha").limit(5000);
  if (error) return new Response("No pudimos armar la planilla. Probá de nuevo.", { status: 500 });
  const csv = armarCsv(
    ["Fecha", "Categoría", "Descripción", "Proveedor", "Importe", "Medio", "Curso", "Comisión", "Anulado", "Motivo de anulación"],
    ((data ?? []) as any[]).map((g) => [
      fechaCsv(g.fecha), uno<any>(g.categorias_gasto)?.nombre, g.descripcion, uno<any>(g.proveedores)?.nombre, numero(g.importe), legible(g.medio),
      uno<any>(g.cursos)?.nombre, uno<any>(g.comisiones)?.nombre, g.anulado_en ? "Sí" : "No", g.motivo_anulacion,
    ]),
  );
  return respuestaCsv(`gastos-${mes}.csv`, csv);
}
