import { describe, expect, it } from "vitest";
import { csvModelo, fechaIso, importe, leerCsv, mapearEncabezado, normalizarFila } from "@/app/panel/estudiantes/importar/planilla";

describe("lectura de planillas", () => {
  it("Excel en castellano: separador ; y comillas", () => {
    const filas = leerCsv('\uFEFFApellido;Nombre;Detalle\r\n"Pérez; hijo";Lucía;"dice ""hola"""\r\n\r\n');
    expect(filas).toEqual([["Apellido", "Nombre", "Detalle"], ["Pérez; hijo", "Lucía", 'dice "hola"']]);
  });

  it("Google Sheets: separador , y salto de línea dentro de comillas", () => {
    expect(leerCsv('a,b\n"uno\ndos",3')).toEqual([["a", "b"], ["uno\ndos", "3"]]);
  });

  it("reconoce encabezados con otros nombres", () => {
    const { mapa, ignoradas } = mapearEncabezado(["Apellido", "Nombre", "DNI", "Fecha de nacimiento", "Celular responsable", "Saldo", "Observaciones"]);
    expect(mapa).toMatchObject({ apellidos: 0, nombres: 1, documento: 2, fecha_nacimiento: 3, resp_telefono: 4, deuda: 5 });
    expect(ignoradas).toEqual(["Observaciones"]);
  });

  it("fechas e importes en formato argentino", () => {
    expect(fechaIso("3/5/2012")).toBe("2012-05-03");
    expect(fechaIso("31/02/2012")).toBeNull();
    expect(importe("$ 45.000,50")).toBe("45000.50");
    expect(importe("45.000")).toBe("45000");
    expect(importe("abc")).toBeNull();
  });

  it("valida una fila y explica los errores", () => {
    const { mapa } = mapearEncabezado(["apellidos", "nombres", "documento", "resp_apellidos", "resp_nombres", "resp_email"]);
    const ok = normalizarFila(["Pérez", "Lucía", "45.123.456", "Gómez", "Laura", "LAURA@Ejemplo.com"], mapa, 2);
    expect(ok.errores).toEqual([]);
    expect(ok.datos).toMatchObject({ documento: "45123456", tipo_documento: "DNI", resp_email: "laura@ejemplo.com" });
    const mal = normalizarFila(["", "Lucía", "12", "Gómez", "", "no-es-email"], mapa, 3);
    expect(mal.errores).toEqual(["Falta el apellido", "Revisá el documento", "Revisá el email del responsable", "Del responsable faltan nombre o apellido"]);
  });

  it("la planilla modelo se lee con sus propias columnas", () => {
    const filas = leerCsv(csvModelo());
    const { mapa, ignoradas } = mapearEncabezado(filas[0]);
    expect(ignoradas).toEqual([]);
    expect(normalizarFila(filas[1], mapa, 2).errores).toEqual([]);
  });
});
