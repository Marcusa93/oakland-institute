import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { PERFILES, puede, type Accion, type Perfil, type Recurso } from "@/lib/permisos";

export interface Sesion {
  cuentaId: string;
  personaId: string;
  email: string | null;
  perfiles: Perfil[];
}

/**
 * Identidad verificada + perfiles efectivos. Los perfiles salen de la base
 * (roles asignados, estudiante, vínculos verificados), nunca de metadatos
 * que el usuario pueda editar. `cache` lo resuelve una vez por pedido.
 */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: contexto, error } = await supabase.rpc("mi_contexto");
  if (error || !contexto?.persona_id) return null; // cuenta sin persona o suspendida
  const perfiles = ((contexto.perfiles ?? []) as string[]).filter((p): p is Perfil =>
    (PERFILES as readonly string[]).includes(p),
  );
  return {
    cuentaId: claims.sub,
    personaId: contexto.persona_id as string,
    email: (claims.email as string | undefined) ?? null,
    perfiles,
  };
});

export async function exigirSesion(): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  return sesion;
}

/** Corta en el servidor si el perfil no tiene el permiso. La base vuelve a verificar. */
export async function exigirPermiso(recurso: Recurso, accion: Accion): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (!puede(sesion.perfiles, recurso, accion)) redirect("/panel?aviso=sin-permiso");
  return sesion;
}

/** Traduce errores de las funciones de la base a mensajes claros en castellano. */
export function mensajeDeError(error: { message?: string } | null | undefined): string {
  const m = error?.message ?? "";
  const codigos: Array<[RegExp, string]> = [
    [/NO_AUTORIZADO: no podés escribirle/, "Por este canal no podés escribirle a esa persona. Las familias escriben a los docentes de sus hijos o a administración."],
    [/NO_AUTORIZADO|permission denied|row-level security/i, "No tenés permiso para hacer esta acción."],
    [/SIN_CUPO/, "La comisión no tiene lugares disponibles."],
    [/YA_INSCRIPTO/, "El estudiante ya está inscripto en esa comisión."],
    [/COMISION_NO_DISPONIBLE/, "La comisión no está abierta a inscripciones."],
    [/EXCEDE_OBLIGACION/, "El importe supera el saldo de la obligación."],
    [/EXCEDE_PAGO|EXCEDE_SALDO_A_FAVOR/, "El importe supera lo disponible del pago."],
    [/PAGO_NO_CONFIRMADO/, "El pago todavía no está confirmado."],
    [/OBLIGACION_NO_IMPUTABLE/, "Esa obligación ya está pagada o anulada."],
    [/OBLIGACION_CON_PAGOS/, "La obligación tiene pagos imputados: primero hay que reversarlos."],
    [/TRANSICION_INVALIDA/, "El estado actual no permite esa operación."],
    [/MOTIVO_REQUERIDO|ajustes_motivo_check/, "Indicá un motivo (al menos 5 caracteres)."],
    [/FECHA_FUTURA/, "La fecha no puede ser posterior a hoy."],
    [/IMPORTE_INVALIDO/, "Revisá el importe: debe ser mayor a cero."],
    [/DIA_INVALIDO/, "El día de vencimiento debe estar entre 1 y 28."],
    [/PERIODO_INVALIDO/, "Revisá el período: la fecha final no puede ser anterior a la inicial."],
    [/MEDIO_INVALIDO/, "Ese medio de pago no se registra a mano."],
    [/COMPROBANTE_INVALIDO/, "El comprobante adjunto no es válido."],
    [/NO_ENCONTRADO/, "No encontramos ese registro. Actualizá la página."],
    [/MATRICULA_NO_ACTIVA/, "Esa inscripción ya no está activa."],
    [/MISMA_COMISION/, "El estudiante ya está en esa comisión."],
    [/ULTIMA_DIRECCION/, "Debe quedar al menos una cuenta de dirección."],
    [/ACTIVIDAD_NO_DISPONIBLE/, "Esa actividad no está disponible."],
    [/FUERA_DE_PLAZO/, "La actividad está fuera de plazo."],
    [/YA_CORREGIDA/, "Esa entrega ya fue corregida."],
    [/NOTA_FUERA_DE_RANGO/, "La nota tiene que estar entre 0 y el puntaje máximo."],
    [/DESTINATARIOS_INVALIDOS/, "Elegí entre 1 y 10 destinatarios."],
    [/PLAZO_INVALIDO/, "El plazo tiene que estar entre 1 hora y 30 días."],
    [/CONFLICTO_DOCENTE/, "El docente ya tiene otra comisión en ese horario."],
    [/aula_sin_superposicion/, "El aula ya está ocupada en ese horario."],
    [/DEMASIADAS_CONSULTAS/, "Ya recibimos varias consultas tuyas. Te vamos a responder a la brevedad."],
    [/vinculos_abierto_uq/, "Ya existe un vínculo abierto entre esa persona y el estudiante."],
    [/personas_datos_documento_uq/, "Ya hay una persona cargada con ese documento."],
    [/VINCULO_INVALIDO/, "Una persona no puede ser responsable de sí misma."],
    [/Failed to fetch|fetch failed|ECONN|network/i, "No pudimos conectar. Revisá tu conexión y volvé a intentar."],
  ];
  return codigos.find(([patron]) => patron.test(m))?.[1] ?? "No pudimos completar la operación. Probá de nuevo.";
}
