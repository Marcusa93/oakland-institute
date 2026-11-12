import { describe, expect, it } from "vitest";
import { fraseResumen, normalizarResumen, type ResumenSemanal } from "@/lib/resumen";

const base = (cambios: Partial<ResumenSemanal> = {}): ResumenSemanal => normalizarResumen({
  desde: "2026-11-09", hasta: "2026-11-15",
  asistencia: { clases: 2, presente: 1, tarde: 1, ausente: 0, justificada: 0 },
  entregadas: 1, notas: [], sin_entregar: [], proximas: [],
  practica: { xp: 120, ejercicios: 30, aciertos: 25, dias: 3 },
  xp_semana_anterior: 80, racha: 3, meta_semanal: 100, medallas: [],
  ...cambios,
});

describe("frase del resumen semanal", () => {
  it("cuenta la semana para la familia", () => {
    expect(fraseResumen(base(), "Juan", false, true))
      .toBe("Esta semana Juan vino a 2 de 2 clases, entregó 1 actividad y practicó 3 días (120 XP).");
  });

  it("le habla de vos al estudiante", () => {
    expect(fraseResumen(base(), "Juan", true, true))
      .toBe("Esta semana viniste a 2 de 2 clases, entregaste 1 actividad y practicaste 3 días (120 XP).");
  });

  it("suma correcciones, medallas y vencimientos", () => {
    const r = base({
      notas: [{ titulo: "My weekend", nota: 8, puntaje_max: 10, reaccion: "muy_bien" }],
      medallas: [{ nombre: "Tres al hilo", icono: "🔥" }],
      proximas: [{ titulo: "Reading", cierra_en: "2026-11-14T23:00:00Z" }],
    });
    expect(fraseResumen(r, "Juan", false, true)).toBe(
      "Esta semana Juan vino a 2 de 2 clases, entregó 1 actividad y practicó 3 días (120 XP). Tiene 1 corrección nueva. Ganó «Tres al hilo». 1 actividad vence en los próximos días.");
  });

  it("una semana vacía lo dice sin juzgar", () => {
    const r = base({ asistencia: { clases: 0, presente: 0, tarde: 0, ausente: 0, justificada: 0 }, entregadas: 0, practica: { xp: 0, ejercicios: 0, aciertos: 0, dias: 0 } });
    expect(fraseResumen(r, "Juan", false, false)).toBe("La semana pasada no hubo actividad de Juan registrada en el campus.");
  });
});
