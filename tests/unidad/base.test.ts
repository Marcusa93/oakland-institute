import { describe, expect, it } from "vitest";
import { fecha, hoyISO, normalizarImporte, pesos } from "@/lib/formato";
import { menuPara } from "@/lib/navegacion";
import { alcance, puede } from "@/lib/permisos";

describe("formato argentino", () => {
  it("muestra importes en pesos con separadores locales", () => {
    expect(pesos("45000.5").replace(/\s/g, " ")).toBe("$ 45.000,50");
    expect(pesos(null)).toBe("—");
  });
  it("interpreta importes escritos a la argentina sin pasar por float", () => {
    expect(normalizarImporte("45.000,50")).toBe("45000.50");
    expect(normalizarImporte("45.000")).toBe("45000");
    expect(normalizarImporte("$ 1.250.000")).toBe("1250000");
    expect(normalizarImporte("45000.5")).toBe("45000.5");
    expect(normalizarImporte("12,345")).toBeNull();
    expect(normalizarImporte("-5")).toBeNull();
    expect(normalizarImporte("abc")).toBeNull();
  });
  it("no corre las fechas de negocio por zona horaria", () => {
    expect(fecha("2027-03-08")).toBe("08/03/2027");
    // 02:30 UTC del 9 todavía es 8 de marzo a las 23:30 en Tucumán.
    expect(hoyISO(new Date("2027-03-09T02:30:00Z"))).toBe("2027-03-08");
  });
});

describe("matriz de permisos", () => {
  it("los docentes no tienen ningún permiso económico", () => {
    for (const r of ["cuenta_corriente", "aranceles_y_beneficios", "gastos", "pagos_docentes", "tablero"] as const) {
      for (const a of ["ver", "crear", "editar", "aprobar"] as const) expect(puede(["docente"], r, a), `${r}/${a}`).toBe(false);
    }
  });
  it("administración cobra pero no fija precios ni ve el tablero", () => {
    expect(puede(["administracion"], "cuenta_corriente", "aprobar")).toBe(true);
    expect(puede(["administracion"], "aranceles_y_beneficios", "editar")).toBe(false);
    expect(puede(["administracion"], "tablero", "ver")).toBe(false);
    expect(puede(["direccion"], "aranceles_y_beneficios", "aprobar")).toBe(true);
  });
  it("las familias solo alcanzan a sus vinculados y no gestionan vínculos", () => {
    expect(alcance(["tutor"], "estudiantes", "ver")).toBe("vinculados");
    expect(puede(["tutor"], "vinculos", "crear")).toBe(false);
    expect(puede(["tutor"], "vinculos", "aprobar")).toBe(false);
  });
  it("con varios perfiles vale el alcance más amplio", () => {
    expect(alcance(["tutor", "docente"], "estudiantes", "ver")).toBe("sus_comisiones");
    expect(alcance(["tutor", "administracion"], "estudiantes", "ver")).toBe("todo");
  });
  it("el menú muestra a cada rol solo sus secciones", () => {
    const docente = menuPara(["docente"]).map((i) => i.href);
    expect(docente).toEqual(expect.arrayContaining(["/panel/mis-comisiones", "/panel/actividades", "/panel/alertas", "/panel/informes", "/panel/mensajes", "/panel/biblioteca"]));
    expect(docente).not.toEqual(expect.arrayContaining(["/panel/cobros"]));
    expect(docente.some((h) => ["/panel/cobros", "/panel/cuenta", "/panel/tablero", "/panel/gastos", "/panel/sitio"].includes(h))).toBe(false);
    const tutor = menuPara(["tutor"]).map((i) => i.href);
    expect(tutor).toEqual(["/panel/familia", "/panel/material", "/panel/cuenta", "/panel/mensajes", "/panel/avisos"]);
    expect(menuPara(["estudiante"]).map((i) => i.href).slice(0, 2)).toEqual(["/panel/practica", "/panel/mis-actividades"]);
    expect(menuPara(["administracion"]).map((i) => i.href)).not.toContain("/panel/tablero");
    expect(menuPara(["direccion"]).map((i) => i.href)).toEqual(expect.arrayContaining(["/panel/tablero", "/panel/docentes", "/panel/sitio"]));
    expect(menuPara([])).toEqual([]);
  });
});
