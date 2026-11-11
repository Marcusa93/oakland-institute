/**
 * Campus: actividades y corrección, práctica gamificada, ranking, alertas,
 * informes, evaluación docente, mensajería y contenido del sitio.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  asignarDocente,
  comoServicio,
  crearBase,
  crearComision,
  crearCuenta,
  crearFamilia,
  crearPersona,
  rpc,
  sql,
  ver,
  type Base,
} from "./ayudas";

let base: Base;
let comision: string;
let otraComision: string;
let docente: string;
let docentePersona: string;
let otroDocente: string;
let ana: Awaited<ReturnType<typeof crearFamilia>>; // estudiante menor, tutor con cuenta
let beto: Awaited<ReturnType<typeof crearFamilia>>; // en otra comisión
let anaCuenta: string; // cuenta propia de la estudiante (para practicar)
let betoCuenta: string;
let actividad: string;
let preguntas: string[];

beforeAll(async () => {
  base = await crearBase();
  comision = await crearComision(base, 10);
  otraComision = await crearComision(base, 10);
  docentePersona = await crearPersona("Doc", "Campus");
  docente = await crearCuenta(docentePersona, ["docente"]);
  otroDocente = await crearCuenta(await crearPersona("Otro", "Docente"), ["docente"]);
  await asignarDocente(comision, docentePersona);
  ana = await crearFamilia(base, "Ana");
  beto = await crearFamilia(base, "Beto");
  anaCuenta = await crearCuenta(ana.estudiantePersona);
  betoCuenta = await crearCuenta(beto.estudiantePersona);
  await rpc(base.admin, "confirmar_inscripcion", [ana.estudiante, comision, ana.tutorPersona]);
  await rpc(base.admin, "confirmar_inscripcion", [beto.estudiante, otraComision, beto.tutorPersona]);

  // El docente arma una actividad con dos preguntas de opción y una abierta.
  const [a] = await ver(docente,
    `insert into public.actividades (comision_id, autor_cuenta_id, titulo, consigna, habilidad, evaluacion, estado, cierra_en)
     values ($1, $2, 'Present simple', 'Completá', 'gramatica', 'formativa', 'publicada', now() + interval '2 days') returning id`,
    [comision, docente]);
  actividad = a.id;
  preguntas = [];
  for (const [orden, enunciado, tipo, opciones, correcta] of [
    [1, "She ___ in Monteros.", "opcion", ["live", "lives"], 1],
    [2, "They ___ football.", "opcion", ["play", "plays"], 0],
    [3, "Contá tu rutina.", "texto", [], null],
  ] as const) {
    const [p] = await ver(docente,
      "insert into public.actividad_preguntas (actividad_id, orden, enunciado, tipo, opciones) values ($1, $2, $3, $4, $5) returning id",
      [actividad, orden, enunciado, tipo, JSON.stringify(opciones)]);
    preguntas.push(p.id);
    if (correcta !== null) await ver(docente, "insert into public.actividad_claves (pregunta_id, correcta) values ($1, $2)", [p.id, correcta]);
  }

  // Banco de práctica: 3 ejercicios revisados de gramática.
  for (const [enunciado, respuesta] of [["I ___ a student.", "am"], ["He ___ tea.", "drinks"], ["We ___ happy.", "are"]]) {
    await sql(
      `insert into public.ejercicios (habilidad, tipo, enunciado, opciones, respuesta, explicacion, estado, revisado_en)
       values ('gramatica', 'opcion', $1, '[]', $2, 'Explicación', 'revisado', now())`,
      [enunciado, respuesta]);
  }
});

describe("actividades y corrección", () => {
  it("el estudiante ve las preguntas pero nunca la clave", async () => {
    const qs = await ver(anaCuenta, "select * from public.preguntas_de_actividad($1)", [actividad]);
    expect(qs).toHaveLength(3);
    expect(Object.keys(qs[0])).not.toContain("correcta");
    expect(await ver(anaCuenta, "select 1 from public.actividad_claves")).toHaveLength(0);
    expect(await ver(anaCuenta, "select 1 from public.actividad_preguntas")).toHaveLength(0);
    expect(await ver(betoCuenta, "select * from public.preguntas_de_actividad($1)", [actividad])).toHaveLength(0);
  });

  it("entrega: el servidor corrige lo objetivo y rechaza a quien no cursa", async () => {
    const r = await rpc<{ aciertos: string }>(anaCuenta, "entregar_actividad", [
      actividad, JSON.stringify({ [preguntas[0]]: 1, [preguntas[1]]: 1 }), "I wake up at 7.",
    ]);
    expect(Number(r.aciertos)).toBe(1);
    await expect(rpc(betoCuenta, "entregar_actividad", [actividad, "{}", null])).rejects.toThrow(/NO_AUTORIZADO/);
  });

  it("fuera de plazo no se puede entregar", async () => {
    const [vencida] = await sql(
      `insert into public.actividades (comision_id, titulo, consigna, habilidad, estado, abre_en, cierra_en)
       values ($1, 'Vencida', 'x', 'lectura', 'publicada', now() - interval '3 days', now() - interval '1 day') returning id`, [comision]);
    await expect(rpc(anaCuenta, "entregar_actividad", [vencida.id, "{}", null])).rejects.toThrow(/FUERA_DE_PLAZO/);
  });

  it("la nota la pone el docente y la familia la ve recién publicada", async () => {
    const [e] = await ver(docente, "select id from public.entregas where actividad_id = $1", [actividad]);
    expect(await ver(otroDocente, "select 1 from public.entregas")).toHaveLength(0);
    await expect(rpc(otroDocente, "corregir_entrega", [e.id, 7, "Bien", "bien", true])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(docente, "corregir_entrega", [e.id, 11, "x", null, true])).rejects.toThrow(/NOTA_FUERA_DE_RANGO/);
    await rpc(docente, "corregir_entrega", [e.id, 7, "Muy bien la rutina. Ojo: she lives.", "muy_bien", false]);
    const oculta = await ver(ana.tutor, "select estado, nota, devolucion from public.entregas_de_estudiante($1) where actividad_id = $2", [ana.estudiante, actividad]);
    expect(oculta[0]).toEqual({ estado: "entregada", nota: null, devolucion: null });
    // Tampoco se filtra por el informe mientras no esté publicada.
    const informe = await rpc<{ actividades: { titulo: string; nota: string | null }[] }>(docente, "datos_informe", [ana.estudiante, "2026-01-01", "2027-12-31"]);
    expect(informe.actividades.find((x) => x.titulo === "Present simple")?.nota).toBeNull();
    await rpc(docente, "corregir_entrega", [e.id, 7, "Muy bien la rutina. Ojo: she lives.", "muy_bien", true]);
    const visible = await ver(ana.tutor, "select nota from public.entregas_de_estudiante($1) where actividad_id = $2", [ana.estudiante, actividad]);
    expect(visible[0].nota).toBe("7.00");
    expect(await ver(beto.tutor, "select 1 from public.entregas_de_estudiante($1)", [ana.estudiante])).toHaveLength(0);
    expect(await ver(anaCuenta, "select 1 from public.entregas")).toHaveLength(0);
  });
});

describe("práctica gamificada", () => {
  it("la lección no trae respuestas y la tabla del banco no es legible por estudiantes", async () => {
    const leccion = await ver(anaCuenta, "select * from public.siguiente_leccion('gramatica', 5)");
    expect(leccion).toHaveLength(3);
    expect(Object.keys(leccion[0])).not.toContain("respuesta");
    expect(await ver(anaCuenta, "select 1 from public.ejercicios")).toHaveLength(0);
    expect(await ver(ana.tutor, "select * from public.siguiente_leccion('gramatica', 5)")).toHaveLength(0);
  });

  it("acertar da XP una vez: repetir el mismo ejercicio no infla los puntos", async () => {
    const [ej] = await sql("select id from public.ejercicios where enunciado = 'I ___ a student.'");
    const r1 = await rpc<{ correcta: boolean; xp: number; medallas_nuevas: { codigo: string }[] }>(anaCuenta, "responder_ejercicio", [ej.id, "  AM "]);
    expect(r1.correcta).toBe(true);
    expect(r1.xp).toBe(10);
    expect(r1.medallas_nuevas.map((m) => m.codigo)).toContain("primer_paso");
    const r2 = await rpc<{ xp: number; xp_total: number }>(anaCuenta, "responder_ejercicio", [ej.id, "am"]);
    expect(r2.xp).toBe(0);
    expect(r2.xp_total).toBe(10);
    const mal = await rpc<{ correcta: boolean; respuesta: string }>(anaCuenta, "responder_ejercicio", [ej.id, "is"]);
    expect(mal).toMatchObject({ correcta: false, respuesta: "am" });
  });

  it("el progreso separa XP de dominio (ejercicios distintos bien resueltos)", async () => {
    const p = await rpc<{ xp_total: number; racha: number; habilidades: { habilidad: string; dominados: number }[] }>(anaCuenta, "mi_progreso");
    expect(p.xp_total).toBe(10);
    expect(p.racha).toBe(1);
    expect(p.habilidades.find((h) => h.habilidad === "gramatica")?.dominados).toBe(1);
  });

  it("la racha perdona un día con comodín y no castiga de más", async () => {
    await sql("update public.progreso_estudiantes set racha = 6, ultima_practica = privado.hoy() - 2, comodines = 1 where estudiante_id = $1", [ana.estudiante]);
    const [ej] = await sql("select id from public.ejercicios where enunciado = 'He ___ tea.'");
    const r = await rpc<{ racha: number }>(anaCuenta, "responder_ejercicio", [ej.id, "drinks"]);
    expect(r.racha).toBe(7);
    const [p] = await sql("select comodines from public.progreso_estudiantes where estudiante_id = $1", [ana.estudiante]);
    expect(p.comodines).toBe(1); // usó uno y ganó otro al llegar a 7
  });

  it("ranking: solo lo ven los integrantes de la comisión y quien no quiere, no aparece", async () => {
    const r = await ver(anaCuenta, "select * from public.ranking_comision($1)", [comision]);
    expect(r[0]).toMatchObject({ posicion: 1, soy_yo: true });
    expect(r[0].nombre).toMatch(/^Hijo Ana A\.$/);
    expect(await ver(betoCuenta, "select * from public.ranking_comision($1)", [comision])).toHaveLength(0);
    expect(await ver(docente, "select * from public.ranking_comision($1)", [comision])).toHaveLength(1);
    await rpc(anaCuenta, "configurar_practica", [null, false, null]);
    expect((await ver(docente, "select * from public.ranking_comision($1)", [comision]))).toHaveLength(0);
    expect((await ver(anaCuenta, "select * from public.ranking_comision($1)", [comision]))[0].posicion).toBeNull();
    await rpc(anaCuenta, "configurar_practica", ["Ana_Star", true, 150]);
    expect((await ver(docente, "select nombre from public.ranking_comision($1)", [comision]))[0].nombre).toBe("Ana_Star");
  });
});

describe("alertas automáticas", () => {
  it("dos ausencias seguidas generan una alerta visible solo para su docente y gestión", async () => {
    const [m] = await sql("select id from public.matriculas where estudiante_id = $1 and estado = 'activa'", [ana.estudiante]);
    for (const fecha of ["2027-03-10", "2027-03-17"]) {
      const [c] = await sql("insert into public.clases (comision_id, fecha, hora_inicio, hora_fin) values ($1, $2, '18:00', '19:00') returning id", [comision, fecha]);
      await ver(docente, "insert into public.asistencias (clase_id, matricula_id, estado) values ($1, $2, 'ausente')", [c.id, m.id]);
    }
    const alertas = await ver(docente, "select tipo, nivel from public.alertas where estudiante_id = $1 and tipo = 'ausentismo'", [ana.estudiante]);
    expect(alertas).toEqual([{ tipo: "ausentismo", nivel: "atencion" }]);
    // También la de participación: hay una actividad vencida sin entregar.
    expect(await ver(docente, "select 1 from public.alertas where estudiante_id = $1 and tipo = 'participacion'", [ana.estudiante])).toHaveLength(1);
    expect(await ver(otroDocente, "select 1 from public.alertas")).toHaveLength(0);
    expect(await ver(ana.tutor, "select 1 from public.alertas")).toHaveLength(0);
    expect((await ver(base.admin, "select 1 from public.alertas where estudiante_id = $1", [ana.estudiante])).length).toBeGreaterThanOrEqual(1);
    // No se duplica al volver a revisar.
    await rpc(docente, "revisar_alertas");
    expect(await ver(docente, "select 1 from public.alertas where estudiante_id = $1 and tipo = 'ausentismo'", [ana.estudiante])).toHaveLength(1);
    await ver(docente, "update public.alertas set estado = 'en_seguimiento', nota = 'Hablé con la familia' where estudiante_id = $1", [ana.estudiante]);
  });

  it("una nota baja genera alerta de rendimiento", async () => {
    const [a2] = await ver(docente,
      `insert into public.actividades (comision_id, autor_cuenta_id, titulo, consigna, habilidad, estado)
       values ($1, $2, 'Quiz', 'x', 'vocabulario', 'publicada') returning id`, [comision, docente]);
    await rpc(anaCuenta, "entregar_actividad", [a2.id, "{}", "algo"]);
    const [e] = await ver(docente, "select id from public.entregas where actividad_id = $1", [a2.id]);
    await rpc(docente, "corregir_entrega", [e.id, 2, "Repasemos", "a_mejorar", true]);
    expect(await ver(docente, "select 1 from public.alertas where estudiante_id = $1 and tipo = 'rendimiento'", [ana.estudiante])).toHaveLength(1);
  });

  it("solo el servidor corre la revisión programada", async () => {
    await expect(ver(docente, "select public.revisar_alertas_programada()")).rejects.toThrow(/permission denied/);
    const n = await comoServicio(async (c) => (await c.query("select public.revisar_alertas_programada() as n")).rows[0].n);
    expect(n).toBeGreaterThanOrEqual(1);
    await expect(rpc(ana.tutor, "revisar_alertas")).rejects.toThrow(/NO_AUTORIZADO/);
  });
});

describe("informes y evaluación docente", () => {
  it("el docente arma el informe de su estudiante con datos calculados por la base", async () => {
    const d = await rpc<Record<string, any>>(docente, "datos_informe", [ana.estudiante, "2026-01-01", "2027-12-31"]);
    expect(d.asistencia.ausente).toBe(2);
    expect(d.actividades.length).toBeGreaterThanOrEqual(2);
    expect(d.alertas_abiertas.length).toBeGreaterThanOrEqual(1);
    await expect(rpc(otroDocente, "datos_informe", [ana.estudiante, "2026-01-01", "2027-12-31"])).rejects.toThrow(/NO_AUTORIZADO/);
    const [i] = await ver(docente,
      "insert into public.informes (estudiante_id, autor_cuenta_id, periodo, datos, comentario, destinatario) values ($1, $2, '1er trimestre', $3, 'Avanza bien', 'direccion') returning id",
      [ana.estudiante, docente, JSON.stringify(d)]);
    await ver(docente, "update public.informes set estado = 'enviado', enviado_en = now() where id = $1", [i.id]);
    expect(await ver(base.direccion, "select 1 from public.informes where id = $1", [i.id])).toHaveLength(1);
    expect(await ver(ana.tutor, "select 1 from public.informes where id = $1", [i.id])).toHaveLength(0);
    await expect(ver(otroDocente,
      "insert into public.informes (estudiante_id, autor_cuenta_id, periodo, datos) values ($1, $2, 'x', '{}')", [ana.estudiante, otroDocente]))
      .rejects.toThrow(/row-level security/);
  });

  it("solo dirección evalúa docentes y el docente ve únicamente lo compartido", async () => {
    const alta = "insert into public.evaluaciones_docentes (docente_persona_id, evaluador_cuenta_id, periodo, puntajes, compartida) values ($1, $2, '2027', $3, $4)";
    await expect(ver(base.admin, alta, [docentePersona, base.admin, '{"clase":4}', false])).rejects.toThrow(/row-level security/);
    await ver(base.direccion, alta, [docentePersona, base.direccion, '{"clase":4}', false]);
    expect(await ver(docente, "select 1 from public.evaluaciones_docentes")).toHaveLength(0);
    await ver(base.direccion, alta, [docentePersona, base.direccion, '{"clase":5}', true]);
    expect(await ver(docente, "select 1 from public.evaluaciones_docentes")).toHaveLength(1);
    expect(await ver(otroDocente, "select 1 from public.evaluaciones_docentes")).toHaveLength(0);
  });
});

describe("mensajería institucional", () => {
  it("docente ↔ familia de su estudiante sí; con una familia ajena, no", async () => {
    const hilo = await rpc<string>(docente, "iniciar_hilo", [[ana.tutorPersona], "Sobre la asistencia", "Hola, ¿todo bien?", ana.estudiante]);
    await rpc(ana.tutor, "responder_hilo", [hilo, "Sí, estuvo enferma."]);
    expect(await ver(ana.tutor, "select 1 from public.mensajes where hilo_id = $1", [hilo])).toHaveLength(2);
    await expect(rpc(docente, "iniciar_hilo", [[beto.tutorPersona], "x", "y", beto.estudiante])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(beto.tutor, "responder_hilo", [hilo, "me meto"])).rejects.toThrow(/NO_AUTORIZADO/);
    expect(await ver(beto.tutor, "select 1 from public.mensajes where hilo_id = $1", [hilo])).toHaveLength(0);
    // Dirección supervisa los hilos sobre estudiantes; administración no participa, no los ve.
    expect(await ver(base.direccion, "select 1 from public.mensajes where hilo_id = $1", [hilo])).toHaveLength(2);
  });

  it("una familia no puede escribirle a otra familia ni a un docente que no es de su hijo", async () => {
    await expect(rpc(ana.tutor, "iniciar_hilo", [[beto.tutorPersona], "Hola", "x", ana.estudiante])).rejects.toThrow(/NO_AUTORIZADO/);
    const otroDocPersona = (await sql("select persona_id from public.cuentas where id = $1", [otroDocente]))[0].persona_id;
    await expect(rpc(ana.tutor, "iniciar_hilo", [[otroDocPersona], "Hola", "x", ana.estudiante])).rejects.toThrow(/NO_AUTORIZADO/);
    await rpc(ana.tutor, "iniciar_hilo", [[docentePersona], "Consulta", "¿Qué estudiamos?", ana.estudiante]);
    await rpc(ana.tutor, "iniciar_hilo", [[base.adminPersona], "Pago", "¿Puedo pagar el viernes?", ana.estudiante]);
  });

  it("los mensajes no se editan ni se borran", async () => {
    await expect(sql("update public.mensajes set cuerpo = 'x'")).rejects.toThrow(/REGISTRO_INMUTABLE/);
  });
});

describe("contenido del sitio", () => {
  it("lo lee cualquiera y lo edita solo gestión", async () => {
    await ver(base.admin, "insert into public.sitio_contenido (clave, valor) values ('anuncio', '{\"activo\":true}') on conflict (clave) do update set valor = excluded.valor");
    expect(await ver(null, "select valor from public.sitio_contenido where clave = 'anuncio'")).toHaveLength(1);
    expect(await ver(ana.tutor, "update public.sitio_contenido set valor = '{}' where clave = 'anuncio' returning 1")).toHaveLength(0);
    expect(await ver(docente, "update public.sitio_contenido set valor = '{}' where clave = 'anuncio' returning 1")).toHaveLength(0);
  });
});

describe("contactos de la mensajería", () => {
  it("cualquier cuenta ve al personal de gestión (nombre y rol, sin contacto); un visitante no", async () => {
    const c = await ver(ana.tutor, "select * from public.contactos_institucionales()");
    expect(c.map((x) => x.rol)).toEqual(expect.arrayContaining(["Administración", "Dirección"]));
    expect(Object.keys(c[0]).sort()).toEqual(["nombre", "persona_id", "rol"]);
    await expect(ver(null, "select * from public.contactos_institucionales()")).rejects.toThrow(/permission denied/);
  });

  it("el docente ve los responsables académicos de sus estudiantes, no los de otros", async () => {
    const r = await ver(docente, "select * from public.responsables_academicos($1)", [ana.estudiante]);
    expect(r.map((x) => x.persona_id)).toEqual([ana.tutorPersona]);
    expect(await ver(docente, "select * from public.responsables_academicos($1)", [beto.estudiante])).toHaveLength(0);
    expect(await ver(beto.tutor, "select * from public.responsables_academicos($1)", [ana.estudiante])).toHaveLength(0);
  });

  it("los nombres de una conversación los ven sus participantes y nadie más", async () => {
    const hilo = await rpc<string>(docente, "iniciar_hilo", [[ana.tutorPersona], "Nombres", "Hola", ana.estudiante]);
    expect(await ver(ana.tutor, "select * from public.participantes_de_hilo($1)", [hilo])).toHaveLength(2);
    expect(await ver(beto.tutor, "select * from public.participantes_de_hilo($1)", [hilo])).toHaveLength(0);
  });
});
