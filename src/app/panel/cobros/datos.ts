import "server-only";
import type { crearClienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof crearClienteServidor>>;

export interface ObligacionConSaldo {
  id: string;
  descripcion: string;
  estudianteId: string;
  estudiante: string;
  legajo: string | null;
  responsableId: string;
  responsable: string | null;
  importe: number;
  pagado: number;
  saldo: number;
  vencimiento: string;
  estado: string;
}

interface Filtro {
  /** Persona responsable de pago. Sin este filtro decide la RLS. */
  responsable?: string;
  /** Solo pendientes o con pago parcial. */
  abiertas?: boolean;
  /** Solo las que vencieron antes de esta fecha (ISO). */
  vencidasAntesDe?: string;
  limite?: number;
}

const nombre = (p: { nombres: string; apellidos: string } | null | undefined) => (p ? `${p.apellidos}, ${p.nombres}` : null);

/**
 * Obligaciones con su saldo. Importe, pagado y saldo salen SIEMPRE de la vista
 * `obligaciones_saldo`; de la tabla solo se toman los datos descriptivos.
 * Las dos consultas usan el mismo filtro y el mismo orden.
 */
export async function cargarObligaciones(supabase: Cliente, filtro: Filtro): Promise<{ filas: ObligacionConSaldo[]; error: boolean }> {
  const limite = filtro.limite ?? 200;
  let saldos = supabase.from("obligaciones_saldo").select("obligacion_id, responsable_pago_persona_id, importe, pagado, saldo, vencimiento, estado");
  let detalle = supabase
    .from("obligaciones")
    .select("id, descripcion, estudiante_id, estudiantes(legajo, personas(nombres, apellidos)), responsable:personas!responsable_pago_persona_id(nombres, apellidos)");
  if (filtro.responsable) {
    saldos = saldos.eq("responsable_pago_persona_id", filtro.responsable);
    detalle = detalle.eq("responsable_pago_persona_id", filtro.responsable);
  }
  if (filtro.abiertas || filtro.vencidasAntesDe) {
    saldos = saldos.in("estado", ["pendiente", "parcial"]);
    detalle = detalle.in("estado", ["pendiente", "parcial"]);
  } else {
    saldos = saldos.neq("estado", "anulada");
    detalle = detalle.neq("estado", "anulada");
  }
  if (filtro.vencidasAntesDe) {
    saldos = saldos.lt("vencimiento", filtro.vencidasAntesDe);
    detalle = detalle.lt("vencimiento", filtro.vencidasAntesDe);
  }
  const [s, d] = await Promise.all([
    saldos.order("vencimiento").order("obligacion_id").limit(limite),
    detalle.order("vencimiento").order("id").limit(limite),
  ]);
  if (s.error || d.error) return { filas: [], error: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const porId = new Map<string, any>((d.data ?? []).map((o: any) => [o.id, o]));
  const filas: ObligacionConSaldo[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const fila of (s.data ?? []) as any[]) {
    const o = porId.get(fila.obligacion_id);
    if (!o) continue;
    filas.push({
      id: fila.obligacion_id,
      descripcion: o.descripcion,
      estudianteId: o.estudiante_id,
      estudiante: nombre(o.estudiantes?.personas) ?? "Estudiante",
      legajo: o.estudiantes?.legajo ?? null,
      responsableId: fila.responsable_pago_persona_id,
      responsable: nombre(o.responsable),
      importe: fila.importe,
      pagado: fila.pagado,
      saldo: fila.saldo,
      vencimiento: fila.vencimiento,
      estado: fila.estado,
    });
  }
  return { filas, error: false };
}

export const ESTADO_PAGO: Record<string, string> = {
  informado: "Informado", confirmado: "Confirmado", rechazado: "Rechazado", reversado: "Reversado",
};
export const MEDIO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", pasarela: "Pago en línea" };
