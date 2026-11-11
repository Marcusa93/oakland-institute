/**
 * Parámetros institucionales. Nombre y colores vienen de las piezas del
 * instituto; el archivo del logo, el lema y los datos de contacto siguen
 * PENDIENTES. No agregar acá convenios, certificaciones ni testimonios que
 * el instituto no haya confirmado por escrito.
 */
export const institucion = {
  nombre: "Oakland Institute",
  nombreProvisorio: false,
  localidad: "Monteros, Tucumán",
  lema: "Inglés para todas las edades, con acompañamiento cercano.",
  contacto: {
    telefono: null as string | null,
    whatsapp: null as string | null,
    email: null as string | null,
    direccion: null as string | null,
  },
  /**
   * Certificaciones efectivamente ofrecidas. Vacío hasta que el instituto las
   * confirme: mientras esté vacío, la sección no se muestra en la landing.
   */
  certificaciones: [] as Array<{ nombre: string; descripcion: string }>,
  zonaHoraria: "America/Argentina/Tucuman",
  moneda: "ARS",
  locale: "es-AR",
} as const;

export type Entorno = "desarrollo" | "pruebas" | "produccion";

export function entorno(): Entorno {
  const v = process.env.NEXT_PUBLIC_ENTORNO;
  return v === "produccion" || v === "pruebas" ? v : "desarrollo";
}

export function supabaseConfigurado() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
