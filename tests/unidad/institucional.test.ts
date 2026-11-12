import { describe, expect, it, vi } from "vitest";
import { respuestaInstitucional } from "@/lib/asistente/institucional";

// sitio.ts es de servidor: se prueban sus valores por defecto sin Next ni Supabase.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/servidor", () => ({ crearClienteServidor: vi.fn() }));
const { SITIO_POR_DEFECTO } = await import("@/lib/sitio");

const datos = { contacto: SITIO_POR_DEFECTO.contacto, grupos: SITIO_POR_DEFECTO.grupos, localidad: "Monteros, Tucumán" };

describe("respuestas con los datos del sitio", () => {
  it("ubica el grupo según la edad", () => {
    expect(respuestaInstitucional("¿Qué grupo hay para 9 años?", datos)!.texto).toContain("Kids 2");
    expect(respuestaInstitucional("mi nena tiene 4 años", datos)!.texto).toContain("Kinder");
    expect(respuestaInstitucional("tengo 30 años, ¿dónde voy?", datos)!.texto).toContain("Intensivo I");
  });

  it("da el contacto real", () => {
    const r = respuestaInstitucional("¿Cuál es el WhatsApp?", datos)!;
    expect(r.texto).toContain("3863 41-4937");
    expect(r.texto).toContain("Leandro Aráoz 39");
    expect(respuestaInstitucional("¿Dónde están?", datos)!.texto).toContain("lunes a viernes");
  });

  it("no responde lo que no es suyo", () => {
    expect(respuestaInstitucional("¿Cuándo se usa el present perfect?", datos)).toBeNull();
    expect(respuestaInstitucional("¿Qué necesito para inscribirme?", datos)).toBeNull();
  });

  it("sin datos cargados no inventa", () => {
    const vacio = { contacto: { ...datos.contacto, whatsapp: "", direccion: "", horario: { es: "", en: "" }, redes: [], email: "" }, grupos: [], localidad: "Monteros" };
    expect(respuestaInstitucional("¿Cuál es el WhatsApp?", vacio)).toBeNull();
    expect(respuestaInstitucional("para 9 años", vacio)).toBeNull();
  });
});
