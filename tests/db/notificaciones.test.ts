/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
/** Notificaciones al celular: suscripciones propias y cola que llenan los eventos. */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asignarDocente, comoServicio, crearBase, crearComision, crearCuenta, crearFamilia, crearPersona, rpc, sql, ver, type Base } from "./ayudas";

let base: Base;
let comision: string;
let docente: string;
let docentePersona: string;
let ana: Awaited<ReturnType<typeof crearFamilia>>; // suscripta (tutor)
let beto: Awaited<ReturnType<typeof crearFamilia>>; // misma comisión, sin suscripción
let anaCuenta: string;

const suscribir = (cuenta: string, endpoint = `https://push.ejemplo.test/${randomUUID()}`) =>
  rpc(cuenta, "guardar_suscripcion_push", [endpoint, "p256dh-clave-publica-de-prueba-123456", "auth-secreto-123", "Prueba"]).then(() => endpoint);
const cola = async (persona: string) =>
  (await sql("select titulo, cuerpo, url from public.notificaciones_push where persona_id = $1 order by creada_en", [persona])) as any[];

beforeAll(async () => {
  base = await crearBase();
  comision = await crearComision(base, 10);
  docentePersona = await crearPersona("Doc", "Push");
  docente = await crearCuenta(docentePersona, ["docente"]);
  await asignarDocente(comision, docentePersona);
  ana = await crearFamilia(base, "PushAna");
  beto = await crearFamilia(base, "PushBeto");
  anaCuenta = await crearCuenta(ana.estudiantePersona);
  await rpc(base.admin, "confirmar_inscripcion", [ana.estudiante, comision, ana.tutorPersona]);
  await rpc(base.admin, "confirmar_inscripcion", [beto.estudiante, comision, beto.tutorPersona]);
  await suscribir(ana.tutor);
  await suscribir(anaCuenta);
});

describe("suscripciones", () => {
  it("cada persona ve y borra solo las suyas; no se pueden cargar a nombre de otro", async () => {
    const otra = await suscribir(beto.tutor);
    expect(await ver(beto.tutor, "select endpoint from public.suscripciones_push")).toEqual([{ endpoint: otra }]);
    expect(await ver(ana.tutor, "select 1 from public.suscripciones_push where endpoint = $1", [otra])).toHaveLength(0);
    await expect(ver(beto.tutor, "insert into public.suscripciones_push (persona_id, endpoint, p256dh, auth) values ($1, 'https://x.test/1', 'p256dh-clave-publica-de-prueba-123456', 'auth-secreto-123')", [ana.tutorPersona]))
      .rejects.toThrow(/permission denied|row-level security/);
    await ver(beto.tutor, "delete from public.suscripciones_push where endpoint = $1", [otra]);
    expect(await sql("select 1 from public.suscripciones_push where endpoint = $1", [otra])).toHaveLength(0);
  });

  it("si en el mismo teléfono entra otra persona, la suscripción pasa a ser suya", async () => {
    const endpoint = await suscribir(beto.tutor);
    await suscribir(base.admin, endpoint);
    expect((await sql("select persona_id from public.suscripciones_push where endpoint = $1", [endpoint]))[0].persona_id).toBe(base.adminPersona);
  });

  it("sin sesión no se suscribe nadie, y la cola no la lee ningún usuario", async () => {
    await expect(rpc(null, "guardar_suscripcion_push", ["https://x.test/2", "p256dh-clave-publica-de-prueba-123456", "auth-secreto-123", null])).rejects.toThrow(/permission denied/);
    await expect(ver(ana.tutor, "select 1 from public.notificaciones_push")).rejects.toThrow(/permission denied/);
    await expect(rpc(base.direccion, "tomar_notificaciones_push", [10])).rejects.toThrow(/permission denied/);
  });
});

describe("eventos que avisan al celular", () => {
  it("aviso en la app (por ejemplo, recordatorio de cuota) → notificación al destinatario", async () => {
    await sql(`insert into public.obligaciones (estudiante_id, responsable_pago_persona_id, concepto_id, descripcion, importe_original, vencimiento)
               values ($1, $2, $3, 'Cuota push', 1000, privado.hoy() - 3)`, [ana.estudiante, ana.tutorPersona, base.conceptoCuota]);
    await rpc(base.admin, "recordar_deuda", [ana.tutorPersona, "interno", 5]);
    const n = await cola(ana.tutorPersona);
    expect(n.at(-1)).toMatchObject({ titulo: "Tenés un pago pendiente", url: "/panel" });
    expect(n.at(-1).cuerpo).toContain("Cuota push");
    expect(n.at(-1).cuerpo).not.toContain("\n");
  });

  it("actividad publicada → estudiantes y familias suscriptos de la comisión (y nadie más)", async () => {
    const [a] = await ver(docente, `insert into public.actividades (comision_id, autor_cuenta_id, titulo, consigna, habilidad, estado)
      values ($1, $2, 'Past simple push', 'Completá', 'gramatica', 'borrador') returning id`, [comision, docente]);
    expect((await cola(ana.estudiantePersona)).some((x) => x.titulo.includes("Past simple push"))).toBe(false);
    await ver(docente, "update public.actividades set estado = 'publicada' where id = $1", [a.id]);
    expect((await cola(ana.estudiantePersona)).filter((x) => x.titulo === "Nueva actividad: Past simple push")).toHaveLength(1);
    expect((await cola(ana.tutorPersona)).filter((x) => x.titulo === "Nueva actividad: Past simple push")).toHaveLength(1);
    expect(await cola(beto.tutorPersona)).toHaveLength(0); // sin suscripción
    // Volver a guardar sin cambiar el estado no repite la notificación.
    await ver(docente, "update public.actividades set estado = 'publicada' where id = $1", [a.id]);
    expect((await cola(ana.estudiantePersona)).filter((x) => x.titulo === "Nueva actividad: Past simple push")).toHaveLength(1);

    // Devolución publicada → estudiante y familia.
    const [e] = await sql(`insert into public.entregas (actividad_id, matricula_id)
      select $1, id from public.matriculas where estudiante_id = $2 and estado = 'activa' returning id`, [a.id, ana.estudiante]);
    await sql("update public.entregas set publicada = true where id = $1", [e.id]);
    expect((await cola(ana.tutorPersona)).at(-1)).toMatchObject({ titulo: "Ya está la devolución", url: "/panel/mis-actividades" });
  });

  it("mensaje nuevo → los otros participantes, no quien lo escribió", async () => {
    const [h] = await sql("insert into public.hilos (asunto, creado_por) values ('Consulta tarea', $1) returning id", [docente]);
    await sql("insert into public.hilo_participantes (hilo_id, persona_id) values ($1, $2), ($1, $3)", [h.id, docentePersona, ana.tutorPersona]);
    await suscribir(docente);
    await sql("insert into public.mensajes (hilo_id, autor_persona_id, cuerpo) values ($1, $2, 'Hola, ¿cómo va?')", [h.id, docentePersona]);
    expect((await cola(ana.tutorPersona)).at(-1)).toMatchObject({ titulo: "Doc Push · Consulta tarea", cuerpo: "Hola, ¿cómo va?", url: `/panel/mensajes/${h.id}` });
    expect((await cola(docentePersona)).filter((x) => x.url === `/panel/mensajes/${h.id}`)).toHaveLength(0);
  });

  it("material compartido con la comisión → enlace directo al material", async () => {
    const [m] = await ver(docente, "insert into public.materiales (titulo, descripcion) values ('My town', 'Leelo antes del jueves') returning id", []);
    await ver(docente, "insert into public.material_comisiones (material_id, comision_id) values ($1, $2)", [m.id, comision]);
    expect((await cola(ana.estudiantePersona)).at(-1)).toMatchObject({ titulo: "Nuevo material: My town", cuerpo: "Leelo antes del jueves", url: `/panel/material/${m.id}` });
  });
});

describe("envío", () => {
  it("el servidor toma cada pendiente una sola vez, aun con dos envíos a la vez", async () => {
    const pendientes = Number((await sql("select count(*) n from public.notificaciones_push where enviada_en is null"))[0].n);
    const [a, b] = await Promise.all([
      comoServicio(async (c) => (await c.query("select * from public.tomar_notificaciones_push(500)")).rows),
      comoServicio(async (c) => (await c.query("select * from public.tomar_notificaciones_push(500)")).rows),
    ]);
    const ids = [...a, ...b].map((x: any) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(pendientes);
    expect((a[0] ?? b[0]).suscripciones[0]).toHaveProperty("endpoint");
    // Recién tomadas: no se vuelven a tomar enseguida.
    expect(await comoServicio(async (c) => (await c.query("select * from public.tomar_notificaciones_push(500)")).rows)).toHaveLength(0);
  });
});
