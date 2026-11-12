/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
/** Secretaría: recordatorios de cuotas por WhatsApp (registro) y en la app (aviso). */
import { beforeAll, describe, expect, it } from "vitest";
import { crearBase, crearCuenta, crearFamilia, crearPersona, rpc, sql, ver, type Base } from "./ayudas";

let base: Base;

beforeAll(async () => {
  base = await crearBase();
});

/** Obligación cargada a mano con vencimiento relativo a hoy (Tucumán). */
async function obligacion(familia: { estudiante: string; tutorPersona: string }, descripcion: string, importe: string, dias: number) {
  const [{ id }] = await sql<{ id: string }>(
    `insert into public.obligaciones (estudiante_id, responsable_pago_persona_id, concepto_id, descripcion, importe_original, vencimiento)
     values ($1, $2, $3, $4, $5, privado.hoy() + $6::int) returning id`,
    [familia.estudiante, familia.tutorPersona, base.conceptoCuota, descripcion, importe, dias],
  );
  return id;
}

describe("recordatorios de cuotas", () => {
  it("en la app: el responsable recibe un aviso económico con lo vencido y lo que vence pronto", async () => {
    const f = await crearFamilia(base, "Recordada");
    await obligacion(f, "Cuota de octubre", "45000", -12);
    await obligacion(f, "Cuota de noviembre", "45000.50", 3);
    await obligacion(f, "Cuota de diciembre", "45000", 40); // lejos: no entra

    expect(await rpc<number>(base.admin, "recordar_deuda", [f.tutorPersona, "interno", 5])).toBe(2);

    const avisos = await ver(f.tutor, `select c.asunto, c.cuerpo, c.categoria from public.comunicacion_envios e
      join public.comunicaciones c on c.id = e.comunicacion_id where e.destinatario_persona_id = $1 and e.canal = 'interno'`, [f.tutorPersona]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].categoria).toBe("economica");
    expect(avisos[0].asunto).toBe("Tenés un pago pendiente");
    expect(avisos[0].cuerpo).toContain("Cuota de octubre");
    expect(avisos[0].cuerpo).toContain("venció el");
    expect(avisos[0].cuerpo).toContain("$ 45.000,50");
    expect(avisos[0].cuerpo).toContain("Total: $ 90.000,50");
    expect(avisos[0].cuerpo).not.toContain("diciembre");

    const registro = await ver(base.admin, "select motivo, canal from public.recordatorios_cobro where responsable_persona_id = $1 order by motivo", [f.tutorPersona]);
    expect(registro.map((r: any) => `${r.canal}:${r.motivo}`)).toEqual(["interno:por_vencer", "interno:vencida"]);
  });

  it("por WhatsApp solo queda registrado; sin deuda, avisa que no hay nada para recordar", async () => {
    const f = await crearFamilia(base, "Whatsapp");
    await obligacion(f, "Cuota", "30000", -1);
    expect(await rpc<number>(base.admin, "recordar_deuda", [f.tutorPersona, "whatsapp", 5])).toBe(1);
    expect(await ver(f.tutor, "select 1 from public.comunicacion_envios where destinatario_persona_id = $1", [f.tutorPersona])).toHaveLength(0);

    const sinDeuda = await crearFamilia(base, "AlDia");
    await expect(rpc(base.admin, "recordar_deuda", [sinDeuda.tutorPersona, "whatsapp", 5])).rejects.toThrow(/SIN_DEUDA/);
  });

  it("aviso masivo: solo a quien tiene cuotas vencidas y no fue recordado en la última semana", async () => {
    const a = await crearFamilia(base, "MasivoA");
    const b = await crearFamilia(base, "MasivoB");
    const c = await crearFamilia(base, "MasivoC");
    await obligacion(a, "Cuota", "20000", -5);
    await obligacion(b, "Cuota", "20000", -5);
    await obligacion(c, "Cuota", "20000", 2); // todavía no venció
    await rpc(base.admin, "recordar_deuda", [b.tutorPersona, "whatsapp", 0]); // ya le escribieron hoy

    await rpc(base.admin, "recordar_vencidas", [7]);
    const recibieron = async (persona: string) =>
      (await sql("select count(*)::int n from public.comunicacion_envios where destinatario_persona_id = $1 and canal = 'interno'", [persona]))[0].n;
    expect(await recibieron(a.tutorPersona)).toBe(1);
    expect(await recibieron(b.tutorPersona)).toBe(0);
    expect(await recibieron(c.tutorPersona)).toBe(0);

    // Correrlo de nuevo no repite el aviso.
    await rpc(base.admin, "recordar_vencidas", [7]);
    expect(await recibieron(a.tutorPersona)).toBe(1);
  });

  it("solo gestión recuerda y ve los recordatorios", async () => {
    const f = await crearFamilia(base, "Privada");
    await obligacion(f, "Cuota", "10000", -3);
    const docente = await crearCuenta(await crearPersona("Doc", "Recordatorios"), ["docente"]);
    await expect(rpc(docente, "recordar_deuda", [f.tutorPersona, "interno", 5])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(f.tutor, "recordar_vencidas", [7])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(null, "recordar_vencidas", [7])).rejects.toThrow(/permission denied/);
    await rpc(base.direccion, "recordar_deuda", [f.tutorPersona, "whatsapp", 5]);
    expect(await ver(f.tutor, "select 1 from public.recordatorios_cobro")).toHaveLength(0);
    expect(await ver(docente, "select 1 from public.recordatorios_cobro")).toHaveLength(0);
    expect((await ver(base.admin, "select 1 from public.recordatorios_cobro where responsable_persona_id = $1", [f.tutorPersona])).length).toBe(1);
  });
});
