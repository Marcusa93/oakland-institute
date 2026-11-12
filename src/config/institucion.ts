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
  // Datos de las piezas del instituto (nov. 2026). El WhatsApp es el que el
  // instituto usa para todo; se edita desde el panel (Sitio web → Contacto).
  contacto: {
    telefono: null as string | null,
    whatsapp: "+54 9 3863 41-4937" as string | null,
    email: null as string | null,
    direccion: "Leandro Aráoz 39, planta alta" as string | null,
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
