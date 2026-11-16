/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar */
/**
 * Gestión completa: cambio de precios con historial, altas en una sola
 * operación, importación desde planillas y comprobantes numerados.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { comoServicio, crearArancel, crearBase, crearComision, crearCuenta, crearPersona, rpc, sql, type Base } from "./ayudas";

let base: Base;

beforeAll(async () => {
  base = await crearBase();
});

describe("precios", () => {
  it("un precio nuevo cierra el anterior del mismo alcance el día antes", async () => {
    const primero = await rpc<string>(base.direccion, "cambiar_arancel", [base.conceptoCuota, "40000", "2027-01-01", base.ciclo, null, null]);
    const segundo = await rpc<string>(base.direccion, "cambiar_arancel", [base.conceptoCuota, "48000", "2027-06-01", base.ciclo, null, null]);
    const filas = await sql("select id, importe::text, vigente_desde::text, vigente_hasta::text from public.aranceles where id = any($1) order by vigente_desde", [[primero, segundo]]);
    expect(filas[0]).toMatchObject({ importe: "40000.00", vigente_hasta: "2027-05-31" });
    expect(filas[1]).toMatchObject({ importe: "48000.00", vigente_hasta: null });
  });

  it("no deja cargar un precio que empieza antes del último", async () => {
    await expect(rpc(base.direccion, "cambiar_arancel", [base.conceptoCuota, "1", "2027-03-01", base.ciclo, null, null]))
      .rejects.toThrow(/VIGENCIA_SUPERPUESTA/);
  });

  it("solo dirección cambia precios", async () => {
    await expect(rpc(base.admin, "cambiar_arancel", [base.conceptoCuota, "1", "2028-01-01", base.ciclo, null, null]))
      .rejects.toThrow(/NO_AUTORIZADO/);
  });

  it("un precio de una comisión no toca el general", async () => {
    const comision = await crearComision(base, 10);
    await rpc(base.direccion, "cambiar_arancel", [base.conceptoCuota, "30000", "2027-09-01", null, null, comision]);
    const [general] = await sql("select vigente_hasta::text from public.aranceles where concepto_id = $1 and ciclo_id = $2 and importe = 48000", [base.conceptoCuota, base.ciclo]);
    expect(general.vigente_hasta).toBeNull();
  });
});

describe("altas en una sola operación", () => {
  it("crea persona, datos y legajo", async () => {
    const r = await rpc<any>(base.admin, "alta_estudiante", ["Lucía", "Alta", "DNI", "40911222", "2012-05-03", "LUCIA@Ejemplo.test", "381 555", null]);
    expect(r.legajo).toMatch(/^E-\d+$/);
    const [d] = await sql("select email, numero_documento, fecha_nacimiento::text from public.personas_datos where persona_id = $1", [r.persona_id]);
    expect(d).toMatchObject({ email: "lucia@ejemplo.test", numero_documento: "40911222", fecha_nacimiento: "2012-05-03" });
  });

  it("si el documento ya existe no queda nada a medio cargar", async () => {
    const [{ n: antes }] = await sql("select count(*)::int as n from public.personas");
    await expect(rpc(base.admin, "alta_estudiante", ["Otra", "Persona", "DNI", "40911222", null, null, null, null]))
      .rejects.toThrow(/personas_datos_documento_uq/);
    const [{ n: despues }] = await sql("select count(*)::int as n from public.personas");
    expect(despues).toBe(antes);
  });

  it("da legajo a una persona ya cargada", async () => {
    const persona = await crearPersona("Ya", "Cargada");
    const r = await rpc<any>(base.admin, "alta_estudiante", [null, null, null, null, null, null, null, persona]);
    expect(r.persona_id).toBe(persona);
  });

  it("alta de responsable con vínculo pendiente", async () => {
    const est = await rpc<any>(base.admin, "alta_estudiante", ["Hijo", "Familia", null, null, null, null, null, null]);
    const r = await rpc<any>(base.admin, "alta_responsable", [est.estudiante_id, "Madre", "Familia", "DNI", "30919888", "madre@ejemplo.test", null, "Madre"]);
    const [v] = await sql("select estado::text, parentesco from public.vinculos_responsables where id = $1", [r.vinculo_id]);
    expect(v).toMatchObject({ estado: "invitado", parentesco: "Madre" });
  });

  it("un docente no puede dar altas", async () => {
    const docente = await crearCuenta(await crearPersona("Doce", "Nte"), ["docente"]);
    await expect(rpc(docente, "alta_estudiante", ["X", "Y", null, null, null, null, null, null])).rejects.toThrow(/NO_AUTORIZADO/);
  });
});

describe("importación", () => {
  it("una fila completa: estudiante, responsable verificado y saldo anterior", async () => {
    const r = await rpc<any>(base.admin, "importar_estudiante", [{
      nombres: "Tomás", apellidos: "Importado", documento: "45900111", fecha_nacimiento: "2014-02-02",
      resp_nombres: "Laura", resp_apellidos: "Importado", resp_documento: "28900111", resp_email: "laura@ejemplo.test", resp_parentesco: "Madre",
      deuda: "52000.50", deuda_detalle: "Cuotas de octubre y noviembre",
    }, true]);
    const [v] = await sql("select estado::text, es_responsable_pago from public.vinculos_responsables where estudiante_id = $1", [r.estudiante_id]);
    expect(v).toMatchObject({ estado: "verificado", es_responsable_pago: true });
    const [o] = await sql("select descripcion, importe::text, responsable_pago_persona_id from public.obligaciones where estudiante_id = $1", [r.estudiante_id]);
    expect(o).toMatchObject({ descripcion: "Cuotas de octubre y noviembre", importe: "52000.50", responsable_pago_persona_id: r.responsable_id });
  });

  it("dos hermanos con la misma madre: se reutiliza la persona", async () => {
    const madre = { resp_nombres: "Marta", resp_apellidos: "Hermanos", resp_documento: "27900333", resp_parentesco: "Madre" };
    const a = await rpc<any>(base.admin, "importar_estudiante", [{ nombres: "Uno", apellidos: "Hermanos", ...madre, estado: "activo" }, true]);
    const b = await rpc<any>(base.admin, "importar_estudiante", [{ nombres: "Dos", apellidos: "Hermanos", ...madre }, true]);
    expect(b.responsable_id).toBe(a.responsable_id);
    const [{ n }] = await sql("select count(*)::int as n from public.personas_datos where numero_documento = '27900333'");
    expect(n).toBe(1);
    const [e] = await sql("select estado::text from public.estudiantes where id = $1", [a.estudiante_id]);
    expect(e.estado).toBe("activo");
  });

  it("si una parte falla, la fila entera no entra", async () => {
    const [{ n: antes }] = await sql("select count(*)::int as n from public.estudiantes");
    await expect(rpc(base.admin, "importar_estudiante", [{
      nombres: "Fila", apellidos: "Rota", documento: "46900222",
      resp_nombres: "Resp", resp_apellidos: "Rota", resp_email: "no-es-un-email", deuda: "-5", // deuda negativa: no se crea
    }, false])).resolves.toBeTruthy();
    await expect(rpc(base.admin, "importar_estudiante", [{
      nombres: "Fila", apellidos: "Repetida", documento: "46900222", // mismo documento que la anterior
      resp_nombres: "Resp", resp_apellidos: "Nuevo", resp_documento: "26900444",
    }, false])).rejects.toThrow(/personas_datos_documento_uq/);
    const [{ r }] = await sql("select count(*)::int as r from public.personas_datos where numero_documento = '26900444'");
    expect(r).toBe(0);
    const [{ n: despues }] = await sql("select count(*)::int as n from public.estudiantes");
    expect(despues).toBe(antes + 1);
  });
});

describe("comprobantes", () => {
  it("cada pago recibe un número correlativo", async () => {
    const pagador = await crearPersona("Paga", "Numerado");
    const a = await rpc<string>(base.admin, "registrar_pago", [pagador, "efectivo", "1000", "2026-01-10", true, "[]", null, null]);
    const b = await rpc<string>(base.admin, "registrar_pago", [pagador, "efectivo", "2000", "2026-01-10", true, "[]", null, null]);
    const filas = await sql("select numero::int from public.pagos where id = any($1) order by numero", [[a, b]]);
    expect(filas[1].numero).toBe(filas[0].numero + 1);
  });
});

describe("cuotas automáticas", () => {
  it("la tarea programada no repite un mes generado a mano ni revive una cuota anulada", async () => {
    const comision = await crearComision(base, 10);
    await crearArancel(base.conceptoCuota, comision, "20000");
    const persona = await crearPersona("Cuota", "Automática");
    const [{ id: estudiante }] = await sql<{ id: string }>("insert into public.estudiantes (persona_id) values ($1) returning id", [persona]);
    await rpc(base.admin, "confirmar_inscripcion", [estudiante, comision, persona]);

    const manual = await rpc<number>(base.admin, "generar_cuotas", ["2027-04-01", 10]);
    expect(manual).toBeGreaterThanOrEqual(1);
    const [cuota] = await sql("select id from public.obligaciones where estudiante_id = $1 and periodo = '2027-04-01'", [estudiante]);
    await rpc(base.admin, "anular_obligacion", [cuota.id, "Beca completa ese mes"]);

    const repetida = await comoServicio(async (c) => (await c.query("select public.generar_cuotas_programada('2027-04-01', 10) as n")).rows[0].n);
    expect(repetida).toBe(0);
    const [{ n }] = await sql("select count(*)::int as n from public.obligaciones where estudiante_id = $1 and periodo = '2027-04-01' and estado <> 'anulada'", [estudiante]);
    expect(n).toBe(0);

    const mayo = await comoServicio(async (c) => (await c.query("select public.generar_cuotas_programada('2027-05-01', 10) as n")).rows[0].n);
    expect(mayo).toBeGreaterThanOrEqual(1);
    const otraVez = await comoServicio(async (c) => (await c.query("select public.generar_cuotas_programada('2027-05-01', 10) as n")).rows[0].n);
    expect(otraVez).toBe(0);
  });
});
