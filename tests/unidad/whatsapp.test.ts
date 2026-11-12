import { describe, expect, it } from "vitest";
import { enlaceWa, mensajeConsulta, mensajeDeuda, numeroWhatsapp, pesosCorto } from "@/lib/whatsapp";

describe("número de WhatsApp argentino", () => {
  it.each([
    ["3863 41-4937", "5493863414937"],
    ["03863-414937", "5493863414937"],
    ["0381 15 555-1234", "5493815551234"],
    ["381 15 5551234", "5493815551234"],
    ["11 15 2345-6789", "5491123456789"],
    ["+54 9 3863 41-4937", "5493863414937"],
    ["+54 3863 414937", "5493863414937"],
    ["3810000000", "5493810000000"],
  ])("%s → %s", (entrada, salida) => {
    expect(numeroWhatsapp(entrada)).toBe(salida);
  });

  it("sin código de área no arma el enlace", () => {
    expect(numeroWhatsapp("414937")).toBeNull();
    expect(numeroWhatsapp("")).toBeNull();
    expect(enlaceWa(null, "hola")).toBeNull();
  });

  it("el enlace lleva el mensaje codificado", () => {
    expect(enlaceWa("3863 41-4937", "¡Hola!")).toBe("https://wa.me/5493863414937?text=%C2%A1Hola!");
  });
});

describe("mensajes", () => {
  it("consulta: usa el primer nombre, el curso y para quién es", () => {
    const m = mensajeConsulta("primer", { nombre: "María José Pérez", curso: "Inglés para niños", estudiante: "Tomás Pérez", quien: "Laura Gómez" });
    expect(m).toBe("¡Hola, María! Soy Laura, de Oakland Institute. Recibimos tu consulta por Inglés para niños para Tomás. ¿Te paso por acá los horarios y los valores?");
    expect(mensajeConsulta("nivel", { nombre: "Ana" })).toContain("prueba de nivel");
  });

  it("deuda: detalla cada cuota, distingue vencida de por vencer y suma el total", () => {
    const m = mensajeDeuda("Carla Ruiz", [
      { descripcion: "Cuota de octubre", estudiante: "Sofía Ruiz", saldo: 45000, vencimiento: "2026-10-10" },
      { descripcion: "Cuota de noviembre", estudiante: "Sofía Ruiz", saldo: 45000.5, vencimiento: "2026-11-15" },
    ], "2026-11-12");
    expect(m).toContain("¡Hola, Carla!");
    expect(m).toContain("hay pagos pendientes");
    expect(m).toContain("• Cuota de octubre (Sofía): $ 45.000, venció el 10/10");
    expect(m).toContain("vence el 15/11");
    expect(m).toContain("Total: $ 90.000,50.");
  });

  it("importes cortos", () => {
    expect(pesosCorto(1234567)).toBe("$ 1.234.567");
    expect(pesosCorto("10000.5")).toBe("$ 10.000,50");
  });
});
