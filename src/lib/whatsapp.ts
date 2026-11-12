/**
 * WhatsApp desde secretaría: enlaces wa.me con el mensaje ya escrito. Se
 * mandan desde el teléfono de quien atiende (sin API ni costo por mensaje).
 * Módulo común: lo usan páginas de servidor y componentes de cliente.
 */

/**
 * Número argentino tal como lo cargan ("3863 41-4937", "0381 15 555-1234",
 * "+54 9 381 …") → formato internacional para wa.me ("549…"). Sin código de
 * área no se puede adivinar: devuelve null.
 */
export function numeroWhatsapp(telefono: string | null | undefined): string | null {
  let d = (telefono ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  d = d.replace(/^0/, "");
  // Celular con el "15" después del código de área (2, 3 o 4 dígitos).
  if (d.length === 12) {
    for (const area of [4, 3, 2]) {
      if (d.slice(area, area + 2) === "15") { d = d.slice(0, area) + d.slice(area + 2); break; }
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

export function enlaceWa(telefono: string | null | undefined, texto: string): string | null {
  const n = numeroWhatsapp(telefono);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? "";

/** "$ 45.000" (sin centavos si no los hay). */
export function pesosCorto(valor: number | string): string {
  const n = Number(valor);
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export const PLANTILLAS_CONSULTA = {
  primer: "Primer contacto",
  nivel: "Invitar a la prueba de nivel",
  seguimiento: "Seguimiento",
} as const;
export type PlantillaConsulta = keyof typeof PLANTILLAS_CONSULTA;

export function mensajeConsulta(plantilla: PlantillaConsulta, c: { nombre: string; curso?: string | null; estudiante?: string | null; quien?: string | null }) {
  const hola = `¡Hola, ${primerNombre(c.nombre)}! `;
  const soy = c.quien ? `Soy ${primerNombre(c.quien)}, de Oakland Institute` : "Te escribimos de Oakland Institute";
  const para = c.estudiante ? ` para ${primerNombre(c.estudiante)}` : "";
  if (plantilla === "primer") {
    return `${hola}${soy}. Recibimos tu consulta${c.curso ? ` por ${c.curso}` : ""}${para}. ¿Te paso por acá los horarios y los valores?`;
  }
  if (plantilla === "nivel") {
    return `${hola}${soy}. Para saber en qué nivel conviene empezar${para}, hacemos una prueba de nivel corta en el instituto. ¿Qué día y horario te queda cómodo?`;
  }
  return `${hola}${soy}. ¿Pudiste ver la información que te pasamos? Si querés, te reservamos un lugar${c.curso ? ` en ${c.curso}` : ""}. Cualquier duda, escribinos.`;
}

// ---------------------------------------------------------------------------
// Cuotas
// ---------------------------------------------------------------------------
export interface Deuda { descripcion: string; estudiante: string; saldo: number; vencimiento: string }

export function mensajeDeuda(nombre: string, deudas: Deuda[], hoy: string): string {
  const vencida = deudas.some((d) => d.vencimiento < hoy);
  const lineas = deudas.map((d) =>
    `• ${d.descripcion} (${primerNombre(d.estudiante)}): ${pesosCorto(d.saldo)}, ${d.vencimiento < hoy ? "venció" : "vence"} el ${ddmm(d.vencimiento)}`);
  const total = deudas.reduce((t, d) => t + d.saldo, 0);
  return [
    `¡Hola, ${primerNombre(nombre)}! Te escribimos de Oakland Institute.`,
    vencida ? "Te recordamos que hay pagos pendientes:" : "Te recordamos lo que vence en los próximos días:",
    ...lineas,
    deudas.length > 1 ? `Total: ${pesosCorto(total)}.` : "",
    "Podés pagar en el instituto o por transferencia e informar el comprobante en la app, en «Cuenta y pagos». Si ya pagaste, avisanos y lo revisamos. ¡Gracias!",
  ].filter(Boolean).join("\n");
}
