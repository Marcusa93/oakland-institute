/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
/** Preferencias de notificaciones al celular: cada persona elige qué le llega. */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asignarDocente, crearBase, crearComision, crearCuenta, crearFamilia, crearPersona, rpc, sql, ver, type Base } from "./ayudas";

let base: Base;
let comision: string;
let docente: string;
let docentePersona: string;
let fam: Awaited<ReturnType<typeof crearFamilia>>;
let otra: Awaited<ReturnType<typeof crearFamilia>>;

const suscribir = (cuenta: string) =>
  rpc(cuenta, "guardar_suscripcion_push", [`https://push.ejemplo.test/${randomUUID()}`, "p256dh-clave-publica-de-prueba-123456", "auth-secreto-123", "Prueba"]);
const titulos = async (persona: string) =>
  ((await sql("select titulo from public.notificaciones_push where persona_id = $1 order by creada_en", [persona])) as any[]).map((x) => x.titulo);

beforeAll(async () => {
  base = await crearBase();
  comision = await crearComision(base, 10);
  docentePersona = await crearPersona("Doc", "Preferencias");
  docente = await crearCuenta(docentePersona, ["docente"]);
  await asignarDocente(comision, docentePersona);
  fam = await crearFamilia(base, "PrefFam");
  otra = await crearFamilia(base, "PrefOtra");
  await rpc(base.admin, "confirmar_inscripcion", [fam.estudiante, comision, fam.tutorPersona]);
  await rpc(base.admin, "confirmar_inscripcion", [otra.estudiante, comision, otra.tutorPersona]);
  await suscribir(fam.tutor);
  await suscribir(otra.tutor);
});

describe("guardar preferencias", () => {
  it("cada persona guarda y ve solo las suyas; los tipos que no manda quedan como estaban", async () => {
    await rpc(fam.tutor, "guardar_preferencias_push", [{ material: false, mensaje: true }]);
    await rpc(fam.tutor, "guardar_preferencias_push", [{ actividad: false }]);
    const propias = await ver(fam.tutor, "select tipo, habilitado from public.preferencias_push order by tipo");
    expect(propias).toEqual([
      { tipo: "actividad", habilitado: false },
      { tipo: "material", habilitado: false },
      { tipo: "mensaje", habilitado: true },
    ]);
    expect(await ver(otra.tutor, "select 1 from public.preferencias_push")).toHaveLength(0);
    // Volver a encender.
    await rpc(fam.tutor, "guardar_preferencias_push", [{ actividad: true }]);
    expect((await ver(fam.tutor, "select habilitado from public.preferencias_push where tipo = 'actividad'"))[0].habilitado).toBe(true);
  });

  it("no se puede escribir directo ni a nombre de otro, ni tipos inventados", async () => {
    await expect(ver(otra.tutor, "insert into public.preferencias_push (persona_id, tipo, habilitado) values ($1, 'mensaje', false)", [fam.tutorPersona]))
      .rejects.toThrow(/permission denied/);
    await expect(ver(otra.tutor, "update public.preferencias_push set habilitado = false")).rejects.toThrow(/permission denied/);
    await expect(rpc(fam.tutor, "guardar_preferencias_push", [{ spam: true }])).rejects.toThrow(/PREFERENCIA_INVALIDA/);
    await expect(rpc(fam.tutor, "guardar_preferencias_push", [{ mensaje: "no" }])).rejects.toThrow(/PREFERENCIA_INVALIDA/);
    await expect(rpc(null, "guardar_preferencias_push", [{ mensaje: false }])).rejects.toThrow(/permission denied/);
  });
});

describe("las notificaciones respetan las preferencias", () => {
  it("material apagado: no le llega a esa familia, sí a la otra", async () => {
    await rpc(fam.tutor, "guardar_preferencias_push", [{ material: false }]);
    const [m] = await ver(docente, "insert into public.materiales (titulo, descripcion) values ('Pref material', 'Leelo') returning id", []);
    await ver(docente, "insert into public.material_comisiones (material_id, comision_id) values ($1, $2)", [m.id, comision]);
    expect(await titulos(fam.tutorPersona)).not.toContain("Nuevo material: Pref material");
    expect(await titulos(otra.tutorPersona)).toContain("Nuevo material: Pref material");
  });

  it("recordatorio de cuota con «pagos» apagado: queda el aviso en el panel, pero no suena", async () => {
    await rpc(fam.tutor, "guardar_preferencias_push", [{ aviso_pagos: false }]);
    await sql(`insert into public.obligaciones (estudiante_id, responsable_pago_persona_id, concepto_id, descripcion, importe_original, vencimiento)
               values ($1, $2, $3, 'Cuota pref', 1000, privado.hoy() - 3)`, [fam.estudiante, fam.tutorPersona, base.conceptoCuota]);
    await rpc(base.admin, "recordar_deuda", [fam.tutorPersona, "interno", 5]);
    expect(await titulos(fam.tutorPersona)).not.toContain("Tenés un pago pendiente");
    const enPanel = await ver(fam.tutor, `select c.asunto from public.comunicacion_envios e join public.comunicaciones c on c.id = e.comunicacion_id
                                          where e.destinatario_persona_id = $1 and e.canal = 'interno'`, [fam.tutorPersona]);
    expect(enPanel.map((x: any) => x.asunto)).toContain("Tenés un pago pendiente");
    // Con «pagos» encendido vuelve a llegar.
    await rpc(fam.tutor, "guardar_preferencias_push", [{ aviso_pagos: true }]);
    await rpc(base.admin, "recordar_deuda", [fam.tutorPersona, "interno", 5]);
    expect(await titulos(fam.tutorPersona)).toContain("Tenés un pago pendiente");
  });

  it("apagar los avisos de pagos no apaga los generales", async () => {
    await rpc(fam.tutor, "guardar_preferencias_push", [{ aviso_pagos: false, aviso_general: true }]);
    const [c] = await sql(`insert into public.comunicaciones (tipo, categoria, asunto, cuerpo, autor_cuenta_id)
                           values ('institucional', 'general', 'Feriado pref', 'No hay clases el lunes.', $1) returning id`, [base.admin]);
    await rpc(base.admin, "enviar_comunicacion", [c.id, null]);
    expect(await titulos(fam.tutorPersona)).toContain("Feriado pref");
  });

  it("mensajes apagados: no suena, y el mensaje igual está en el hilo", async () => {
    await rpc(fam.tutor, "guardar_preferencias_push", [{ mensaje: false }]);
    const [h] = await sql("insert into public.hilos (asunto, creado_por) values ('Pref hilo', $1) returning id", [docente]);
    await sql("insert into public.hilo_participantes (hilo_id, persona_id) values ($1, $2), ($1, $3)", [h.id, docentePersona, fam.tutorPersona]);
    await sql("insert into public.mensajes (hilo_id, autor_persona_id, cuerpo) values ($1, $2, 'Hola')", [h.id, docentePersona]);
    expect((await titulos(fam.tutorPersona)).some((t) => t.includes("Pref hilo"))).toBe(false);
    expect(await sql("select 1 from public.mensajes where hilo_id = $1", [h.id])).toHaveLength(1);
  });

  it("actividad y devolución: cada una se apaga por separado", async () => {
    await rpc(fam.tutor, "guardar_preferencias_push", [{ actividad: false, devolucion: true }]);
    const [a] = await ver(docente, `insert into public.actividades (comision_id, autor_cuenta_id, titulo, consigna, habilidad, estado)
      values ($1, $2, 'Pref actividad', 'Completá', 'gramatica', 'publicada') returning id`, [comision, docente]);
    expect(await titulos(fam.tutorPersona)).not.toContain("Nueva actividad: Pref actividad");
    expect(await titulos(otra.tutorPersona)).toContain("Nueva actividad: Pref actividad");
    const [e] = await sql(`insert into public.entregas (actividad_id, matricula_id)
      select $1, id from public.matriculas where estudiante_id = $2 and estado = 'activa' returning id`, [a.id, fam.estudiante]);
    const antes = (await titulos(fam.tutorPersona)).filter((t) => t === "Ya está la devolución").length;
    await sql("update public.entregas set publicada = true where id = $1", [e.id]);
    expect((await titulos(fam.tutorPersona)).filter((t) => t === "Ya está la devolución")).toHaveLength(antes + 1);
  });
});
