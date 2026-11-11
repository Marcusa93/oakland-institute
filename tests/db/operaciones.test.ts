/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
/**
 * Criterios de aceptación: cupos concurrentes, pagos parciales e
 * imputaciones, historial de aranceles, notificaciones duplicadas,
 * conflictos de horario y captación.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  asignarDocente,
  comoServicio,
  crearArancel,
  crearBase,
  crearComision,
  crearCuenta,
  crearEstudiante,
  crearFamilia,
  crearPersona,
  rpc,
  sql,
  ver,
  type Base,
} from "./ayudas";

let base: Base;

beforeAll(async () => {
  base = await crearBase();
});

async function nuevoEstudiante(nombre: string) {
  const persona = await crearPersona(nombre, "Cupo");
  return { persona, estudiante: await crearEstudiante(persona) };
}

describe("cupos e inscripciones", () => {
  it("20 confirmaciones simultáneas sobre 5 lugares: entran exactamente 5", async () => {
    const comision = await crearComision(base, 5);
    const aspirantes = await Promise.all(Array.from({ length: 20 }, (_, i) => nuevoEstudiante(`Aspirante ${i}`)));
    const resultados = await Promise.allSettled(
      aspirantes.map((a) => rpc(base.admin, "confirmar_inscripcion", [a.estudiante, comision, a.persona])),
    );
    const ok = resultados.filter((r) => r.status === "fulfilled");
    const rechazos = resultados.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(5);
    expect(rechazos).toHaveLength(15);
    for (const r of rechazos) expect(String(r.reason.message)).toMatch(/SIN_CUPO/);
    const [{ n }] = await sql("select count(*)::int as n from public.matriculas where comision_id = $1 and estado = 'activa'", [
      comision,
    ]);
    expect(n).toBe(5);
  });

  it("reservas y confirmaciones simultáneas comparten el mismo cupo", async () => {
    const comision = await crearComision(base, 4);
    const aspirantes = await Promise.all(Array.from({ length: 12 }, (_, i) => nuevoEstudiante(`Mixto ${i}`)));
    const resultados = await Promise.allSettled(
      aspirantes.map((a, i) =>
        i % 2
          ? rpc(base.admin, "reservar_vacante", [a.estudiante, comision, 48])
          : rpc(base.admin, "confirmar_inscripcion", [a.estudiante, comision, a.persona]),
      ),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    const [o] = await sql("select inscriptos + reservas as ocupados from public.comisiones_ocupacion where comision_id = $1", [
      comision,
    ]);
    expect(o.ocupados).toBe(4);
  });

  it("una reserva vigente guarda el lugar y se convierte al confirmar; vencida, lo libera", async () => {
    const comision = await crearComision(base, 1);
    const a = await nuevoEstudiante("Con reserva");
    const b = await nuevoEstudiante("Sin lugar");
    const reserva = await rpc<string>(base.admin, "reservar_vacante", [a.estudiante, comision, 48]);
    await expect(rpc(base.admin, "confirmar_inscripcion", [b.estudiante, comision, b.persona])).rejects.toThrow(/SIN_CUPO/);
    // Vence la reserva: el lugar vuelve a estar disponible.
    await sql("update public.reservas_vacante set vence_en = now() - interval '1 minute' where id = $1", [reserva]);
    await rpc(base.admin, "confirmar_inscripcion", [b.estudiante, comision, b.persona]);
    const [r] = await sql("select estado from public.reservas_vacante where id = $1", [reserva]);
    expect(r.estado).toBe("vencida");

    const comision2 = await crearComision(base, 1);
    await rpc(base.admin, "reservar_vacante", [a.estudiante, comision2, 48]);
    await rpc(base.admin, "confirmar_inscripcion", [a.estudiante, comision2, a.persona]);
    const [r2] = await sql("select estado from public.reservas_vacante where comision_id = $1", [comision2]);
    expect(r2.estado).toBe("convertida");
  });

  it("gestión da de alta persona y estudiante con su sesión; cancelar una reserva libera el lugar", async () => {
    const [p] = await ver(base.admin, "insert into public.personas (nombres, apellidos) values ('Alta', 'Directa') returning id");
    await ver(base.admin, "insert into public.personas_datos (persona_id, tipo_documento, numero_documento) values ($1, 'DNI', '40111222')", [p.id]);
    const [e] = await ver(base.admin, "insert into public.estudiantes (persona_id) values ($1) returning id, legajo", [p.id]);
    expect(e.legajo).toMatch(/^E-\d+$/);
    // Documento duplicado: lo rechaza la base.
    const [otra] = await ver(base.admin, "insert into public.personas (nombres, apellidos) values ('Alta', 'Repetida') returning id");
    await expect(
      ver(base.admin, "insert into public.personas_datos (persona_id, tipo_documento, numero_documento) values ($1, 'DNI', '40111222')", [otra.id]),
    ).rejects.toThrow(/personas_datos_documento_uq/);
    const comision = await crearComision(base, 1);
    const b = await nuevoEstudiante("Espera reserva");
    const reserva = await rpc<string>(base.admin, "reservar_vacante", [e.id, comision, 48]);
    await expect(rpc(base.admin, "confirmar_inscripcion", [b.estudiante, comision, b.persona])).rejects.toThrow(/SIN_CUPO/);
    await rpc(base.admin, "cancelar_reserva", [reserva]);
    await rpc(base.admin, "confirmar_inscripcion", [b.estudiante, comision, b.persona]);
    await expect(rpc(base.admin, "cancelar_reserva", [reserva])).rejects.toThrow(/TRANSICION_INVALIDA/);
  });

  it("no hay doble inscripción ni escritura directa de matrículas", async () => {
    const comision = await crearComision(base, 3);
    const a = await nuevoEstudiante("Doble");
    await rpc(base.admin, "confirmar_inscripcion", [a.estudiante, comision, a.persona]);
    await expect(rpc(base.admin, "confirmar_inscripcion", [a.estudiante, comision, a.persona])).rejects.toThrow(
      /YA_INSCRIPTO/,
    );
    await expect(
      ver(
        base.admin,
        "insert into public.matriculas (estudiante_id, comision_id) values ($1, $2)",
        [a.estudiante, comision],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(ver(base.admin, "update public.comisiones_ocupacion set cupo = 99")).rejects.toThrow();
  });

  it("consulta → solicitud → matrícula: cada etapa es un registro distinto y queda trazada", async () => {
    const comision = await crearComision(base, 2);
    await crearArancel(base.conceptoMatricula, comision, "40000.00");
    // 1. Un adulto consulta por un menor desde la landing (sin sesión).
    await ver(
      null,
      `insert into public.consultas (tipo, nombre_contacto, telefono, es_para_menor, nombre_estudiante, edad_estudiante, comision_interes_id, estado, responsable_cuenta_id)
       values ('preinscripcion', 'Marta Díaz', '3815551234', true, 'Lucas Díaz', 9, $1, 'ganada', $2)`,
      [comision, base.admin],
    );
    const [consulta] = await ver(base.admin, "select * from public.consultas where telefono = '3815551234'");
    // El visitante no pudo fijar campos de seguimiento.
    expect(consulta).toMatchObject({ estado: "nueva", responsable_cuenta_id: null, origen: "web" });
    await expect(ver(null, "select 1 from public.consultas")).rejects.toThrow(/permission denied/);
    // 2. Gestión crea las personas una sola vez y la solicitud.
    const tutor = await crearPersona("Marta", "Díaz");
    const menor = await nuevoEstudiante("Lucas");
    const [solicitud] = await ver(
      base.admin,
      `insert into public.solicitudes_inscripcion (consulta_id, estudiante_id, comision_id, solicitante_persona_id, responsable_pago_persona_id, creada_por)
       values ($1, $2, $3, $4, $4, $5) returning id, estado`,
      [consulta.id, menor.estudiante, comision, tutor, base.admin],
    );
    expect(solicitud.estado).toBe("pendiente");
    expect(await sql("select 1 from public.matriculas where estudiante_id = $1", [menor.estudiante])).toHaveLength(0);
    // 3. Confirmación.
    const matricula = await rpc<string>(base.admin, "confirmar_inscripcion", [
      menor.estudiante,
      comision,
      tutor,
      solicitud.id,
    ]);
    const [s] = await sql("select estado, matricula_id from public.solicitudes_inscripcion where id = $1", [solicitud.id]);
    expect(s).toEqual({ estado: "confirmada", matricula_id: matricula });
    const [c] = await sql("select estado from public.consultas where id = $1", [consulta.id]);
    expect(c.estado).toBe("ganada");
    const eventos = await sql("select tipo, estado_nuevo from public.consulta_eventos where consulta_id = $1 order by ocurrido_en", [
      consulta.id,
    ]);
    expect(eventos.map((e) => e.estado_nuevo)).toEqual(["nueva", "ganada"]);
    // La obligación de matrícula va al responsable de pago, con la foto del arancel.
    const [o] = await sql("select importe, responsable_pago_persona_id from public.obligaciones where matricula_id = $1", [
      matricula,
    ]);
    expect(o).toEqual({ importe: "40000.00", responsable_pago_persona_id: tutor });
    // La misma solicitud no se confirma dos veces.
    await expect(
      rpc(base.admin, "confirmar_inscripcion", [menor.estudiante, comision, tutor, solicitud.id]),
    ).rejects.toThrow(/YA_INSCRIPTO/);
  });

  it("el formulario público limita envíos repetidos del mismo contacto", async () => {
    const alta = "insert into public.consultas (nombre_contacto, email) values ('Persona Insistente', 'spam@ejemplo.test')";
    for (let i = 0; i < 5; i++) await ver(null, alta);
    await expect(ver(null, alta)).rejects.toThrow(/DEMASIADAS_CONSULTAS/);
  });

  it("cambio de comisión: controla cupo, conserva historial y encadena matrículas", async () => {
    const origen = await crearComision(base, 2);
    const llena = await crearComision(base, 1);
    const destino = await crearComision(base, 2);
    const a = await nuevoEstudiante("Cambia");
    const b = await nuevoEstudiante("Ocupa");
    const m1 = await rpc<string>(base.admin, "confirmar_inscripcion", [a.estudiante, origen, a.persona]);
    await rpc(base.admin, "confirmar_inscripcion", [b.estudiante, llena, b.persona]);
    await expect(rpc(base.admin, "cambiar_comision", [m1, llena, "Horario"])).rejects.toThrow(/SIN_CUPO/);
    const [sigue] = await sql("select estado from public.matriculas where id = $1", [m1]);
    expect(sigue.estado).toBe("activa"); // el intento fallido no dejó nada a medias
    const m2 = await rpc<string>(base.admin, "cambiar_comision", [m1, destino, "Horario"]);
    const filas = await sql(
      "select id, estado, matricula_anterior_id from public.matriculas where estudiante_id = $1 order by creada_en",
      [a.estudiante],
    );
    expect(filas).toEqual([
      { id: m1, estado: "cambiada", matricula_anterior_id: null },
      { id: m2, estado: "activa", matricula_anterior_id: m1 },
    ]);
  });
});

describe("horarios", () => {
  it("rechaza dos comisiones en la misma aula con horarios superpuestos", async () => {
    const [{ id: aula }] = await sql<{ id: string }>(
      "insert into public.aulas (sede_id, nombre, capacidad) values ($1, 'Aula 1', 15) returning id",
      [base.sede],
    );
    const c1 = await crearComision(base, 10);
    const c2 = await crearComision(base, 10);
    const alta =
      "insert into public.comision_horarios (comision_id, aula_id, dia_semana, hora_inicio, hora_fin, vigencia) values ($1, $2, $3, $4, $5, '[2027-03-01,2027-12-16)')";
    await ver(base.admin, alta, [c1, aula, 1, "18:00", "19:30"]);
    await expect(ver(base.admin, alta, [c2, aula, 1, "19:00", "20:30"])).rejects.toThrow(/aula_sin_superposicion/);
    await ver(base.admin, alta, [c2, aula, 1, "19:30", "21:00"]); // contiguo: permitido
    await ver(base.admin, alta, [c2, aula, 2, "18:00", "19:30"]); // otro día: permitido
  });

  it("rechaza asignar un docente a dos comisiones que se superponen", async () => {
    const docente = await crearPersona("Docente", "Ocupado");
    const c1 = await crearComision(base, 10);
    const c2 = await crearComision(base, 10);
    const alta =
      "insert into public.comision_horarios (comision_id, dia_semana, hora_inicio, hora_fin, vigencia) values ($1, 3, $2, $3, '[2027-03-01,2027-12-16)')";
    await sql(alta, [c1, "17:00", "18:30"]);
    await sql(alta, [c2, "18:00", "19:30"]);
    await asignarDocente(c1, docente);
    await expect(asignarDocente(c2, docente)).rejects.toThrow(/CONFLICTO_DOCENTE/);
  });
});

describe("cuenta corriente y pagos", () => {
  let comision: string;
  let familia: Awaited<ReturnType<typeof crearFamilia>>;
  let matricula: string;
  let obligacionMatricula: string;

  beforeAll(async () => {
    comision = await crearComision(base, 10);
    await crearArancel(base.conceptoMatricula, comision, "60000.00");
    await crearArancel(base.conceptoCuota, comision, "45000.00", "2027-01-01");
    familia = await crearFamilia(base, "Paz");
    matricula = await rpc<string>(base.admin, "confirmar_inscripcion", [familia.estudiante, comision, familia.tutorPersona]);
    [{ id: obligacionMatricula }] = await sql<{ id: string }>("select id from public.obligaciones where matricula_id = $1", [
      matricula,
    ]);
  });

  const saldo = async (obligacion: string) =>
    (await sql("select pagado, saldo, estado from public.obligaciones_saldo where obligacion_id = $1", [obligacion]))[0];

  it("una obligación admite pagos parciales y su estado acompaña al saldo", async () => {
    await rpc(base.admin, "registrar_pago", [
      familia.tutorPersona,
      "efectivo",
      "25000.50",
      "2026-11-02",
      true,
      JSON.stringify([{ obligacion_id: obligacionMatricula, importe: "25000.50" }]),
    ]);
    expect(await saldo(obligacionMatricula)).toEqual({ pagado: "25000.50", saldo: "34999.50", estado: "parcial" });
    await rpc(base.admin, "registrar_pago", [
      familia.tutorPersona,
      "efectivo",
      "34999.50",
      "2026-11-05",
      true,
      JSON.stringify([{ obligacion_id: obligacionMatricula, importe: "34999.50" }]),
    ]);
    expect(await saldo(obligacionMatricula)).toEqual({ pagado: "60000.00", saldo: "0.00", estado: "pagada" });
  });

  it("no se puede imputar más que el saldo de la obligación ni más que el pago", async () => {
    await rpc(base.admin, "generar_cuotas", ["2027-03-01", 10]);
    const [cuota] = await sql<{ id: string }>(
      "select id from public.obligaciones where matricula_id = $1 and periodo = '2027-03-01'",
      [matricula],
    );
    const pago = await rpc<string>(base.admin, "registrar_pago", [familia.tutorPersona, "efectivo", "50000", "2026-11-06", true]);
    await expect(rpc(base.admin, "imputar_pago", [pago, cuota.id, "45000.01"])).rejects.toThrow(/EXCEDE_OBLIGACION/);
    await expect(rpc(base.admin, "imputar_pago", [pago, obligacionMatricula, "1"])).rejects.toThrow(
      /OBLIGACION_NO_IMPUTABLE/,
    );
    await rpc(base.admin, "imputar_pago", [pago, cuota.id, "45000"]);
    const [p] = await sql("select imputado, saldo_a_favor from public.pagos_saldo where pago_id = $1", [pago]);
    expect(p).toEqual({ imputado: "45000.00", saldo_a_favor: "5000.00" });
    // El excedente queda como saldo a favor; no se puede usar dos veces.
    await rpc(base.admin, "generar_cuotas", ["2027-04-01", 10]);
    const [abril] = await sql<{ id: string }>(
      "select id from public.obligaciones where matricula_id = $1 and periodo = '2027-04-01'",
      [matricula],
    );
    await expect(rpc(base.admin, "imputar_pago", [pago, abril.id, "5000.01"])).rejects.toThrow(/EXCEDE_PAGO/);
    await rpc(base.admin, "imputar_pago", [pago, abril.id, "5000"]);
    expect(await saldo(abril.id)).toEqual({ pagado: "5000.00", saldo: "40000.00", estado: "parcial" });
  });

  it("imputaciones simultáneas del mismo pago no superan su importe", async () => {
    const f = await crearFamilia(base, "Concurrente");
    const m = await rpc<string>(base.admin, "confirmar_inscripcion", [f.estudiante, comision, f.tutorPersona]);
    const [o] = await sql<{ id: string }>("select id from public.obligaciones where matricula_id = $1", [m]);
    const pago = await rpc<string>(base.admin, "registrar_pago", [f.tutorPersona, "efectivo", "30000", "2026-11-06", true]);
    const intentos = await Promise.allSettled(
      Array.from({ length: 8 }, () => rpc(base.admin, "imputar_pago", [pago, o.id, "10000"])),
    );
    expect(intentos.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await saldo(o.id)).toEqual({ pagado: "30000.00", saldo: "30000.00", estado: "parcial" });
  });

  it("un pago cubre varias obligaciones en una sola operación atómica", async () => {
    const f = await crearFamilia(base, "Varios");
    const m = await rpc<string>(base.admin, "confirmar_inscripcion", [f.estudiante, comision, f.tutorPersona]);
    await rpc(base.admin, "generar_cuotas", ["2027-03-01", 10]);
    const obligaciones = await sql<{ id: string; importe: string }>(
      "select id, importe from public.obligaciones where matricula_id = $1 order by vencimiento",
      [m],
    );
    expect(obligaciones.map((o) => o.importe)).toEqual(["60000.00", "45000.00"]);
    // Si una imputación es inválida, no queda ni el pago ni la otra imputación.
    await expect(
      rpc(base.admin, "registrar_pago", [
        f.tutorPersona,
        "transferencia",
        "105000",
        "2026-11-07",
        true,
        JSON.stringify([
          { obligacion_id: obligaciones[0].id, importe: "60000" },
          { obligacion_id: obligaciones[1].id, importe: "99999" },
        ]),
      ]),
    ).rejects.toThrow(/EXCEDE/);
    expect(await sql("select 1 from public.pagos where pagador_persona_id = $1", [f.tutorPersona])).toHaveLength(0);
    await rpc(base.admin, "registrar_pago", [
      f.tutorPersona,
      "transferencia",
      "105000",
      "2026-11-07",
      true,
      JSON.stringify(obligaciones.map((o) => ({ obligacion_id: o.id, importe: o.importe }))),
    ]);
    for (const o of obligaciones) expect((await saldo(o.id)).estado).toBe("pagada");
  });

  it("una transferencia informada con comprobante NO es un pago hasta que gestión la valida", async () => {
    const f = await crearFamilia(base, "Transferencia");
    const m = await rpc<string>(base.admin, "confirmar_inscripcion", [f.estudiante, comision, f.tutorPersona]);
    const [o] = await sql<{ id: string }>("select id from public.obligaciones where matricula_id = $1", [m]);
    const [doc] = await ver(
      f.tutor,
      "insert into public.documentos (tipo, nombre, persona_id, ruta, subido_por) values ('comprobante_pago', 'captura.jpg', $1, $2, $3) returning id",
      [f.tutorPersona, `comprobantes/${f.tutorPersona}/captura.jpg`, f.tutor],
    );
    const pago = await rpc<string>(f.tutor, "informar_transferencia", ["60000", "2026-11-08", doc.id]);
    const [p] = await sql("select estado from public.pagos where id = $1", [pago]);
    expect(p.estado).toBe("informado");
    await expect(rpc(base.admin, "imputar_pago", [pago, o.id, "60000"])).rejects.toThrow(/PAGO_NO_CONFIRMADO/);
    expect((await saldo(o.id)).estado).toBe("pendiente");
    // El responsable no puede validarse a sí mismo ni tocar la tabla.
    await expect(rpc(f.tutor, "validar_pago", [pago, true])).rejects.toThrow(/NO_AUTORIZADO/);
    // Una cuenta sin nada a su cargo no puede informar pagos.
    const ajena = await crearCuenta(await crearPersona("Sin", "Obligaciones"));
    await expect(rpc(ajena, "informar_transferencia", ["100", "2026-11-08", null])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(
      rpc(base.admin, "crear_obligacion", [f.estudiante, f.tutorPersona, base.conceptoCuota, "Material", "0", "2026-12-01"]),
    ).rejects.toThrow(/IMPORTE_INVALIDO/);
    await expect(ver(f.tutor, "update public.pagos set estado = 'confirmado' where id = $1", [pago])).rejects.toThrow(
      /permission denied/,
    );
    await rpc(base.admin, "validar_pago", [pago, true]);
    await rpc(base.admin, "imputar_pago", [pago, o.id, "60000"]);
    expect((await saldo(o.id)).estado).toBe("pagada");
    await expect(rpc(base.admin, "validar_pago", [pago, false, "tarde"])).rejects.toThrow(/TRANSICION_INVALIDA/);
  });

  it("un pago confirmado no se edita ni se borra: se reversa con motivo y queda auditado", async () => {
    const f = await crearFamilia(base, "Reverso");
    const m = await rpc<string>(base.admin, "confirmar_inscripcion", [f.estudiante, comision, f.tutorPersona]);
    const [o] = await sql<{ id: string }>("select id from public.obligaciones where matricula_id = $1", [m]);
    const pago = await rpc<string>(base.admin, "registrar_pago", [
      f.tutorPersona,
      "efectivo",
      "60000",
      "2026-11-08",
      true,
      JSON.stringify([{ obligacion_id: o.id, importe: "60000" }]),
    ]);
    // Ni siquiera con privilegios de base se altera el importe o se borra.
    await expect(sql("update public.pagos set importe = 1 where id = $1", [pago])).rejects.toThrow(/PAGO_INMUTABLE/);
    await expect(sql("delete from public.pagos where id = $1", [pago])).rejects.toThrow(/REGISTRO_INMUTABLE/);
    await expect(rpc(base.admin, "reversar_pago", [pago, "x"])).rejects.toThrow(/ajustes_motivo_check/);
    await rpc(base.admin, "reversar_pago", [pago, "Cargado a la familia equivocada"]);
    expect(await saldo(o.id)).toEqual({ pagado: "0.00", saldo: "60000.00", estado: "pendiente" });
    const [a] = await sql("select tipo, importe, creado_por from public.ajustes where pago_id = $1", [pago]);
    expect(a).toEqual({ tipo: "reverso_pago", importe: "60000.00", creado_por: base.admin });
    await expect(rpc(base.admin, "reversar_pago", [pago, "Otra vez por las dudas"])).rejects.toThrow(/TRANSICION_INVALIDA/);
    const rastros = await sql("select accion from public.auditoria where tabla = 'pagos' and registro_id = $1 order by id", [pago]);
    expect(rastros.map((r) => r.accion)).toEqual(["INSERT", "UPDATE"]);
  });

  it("un aumento de arancel no modifica obligaciones ya generadas", async () => {
    const [marzo] = await sql<{ importe: string }>(
      "select importe from public.obligaciones where matricula_id = $1 and periodo = '2027-03-01'",
      [matricula],
    );
    // Dirección cierra la vigencia y crea el arancel nuevo desde junio.
    await expect(
      ver(base.direccion, "update public.aranceles set importe = 99999 where comision_id = $1", [comision]),
    ).rejects.toThrow(/ARANCEL_INMUTABLE/);
    await ver(
      base.direccion,
      "update public.aranceles set vigente_hasta = '2027-05-31' where comision_id = $1 and concepto_id = $2",
      [comision, base.conceptoCuota],
    );
    await ver(
      base.direccion,
      "insert into public.aranceles (concepto_id, comision_id, importe, vigente_desde, creado_por) values ($1, $2, 54000, '2027-06-01', $3)",
      [base.conceptoCuota, comision, base.direccion],
    );
    // Administración no fija precios.
    await expect(
      ver(base.admin, "insert into public.aranceles (concepto_id, comision_id, importe, vigente_desde) values ($1, $2, 1, '2027-07-01')", [
        base.conceptoCuota,
        comision,
      ]),
    ).rejects.toThrow(/row-level security/);
    await rpc(base.admin, "generar_cuotas", ["2027-06-01", 10]);
    const cuotas = await sql<{ periodo: string; importe: string }>(
      "select to_char(periodo, 'YYYY-MM') as periodo, importe from public.obligaciones where matricula_id = $1 and periodo is not null order by periodo",
      [matricula],
    );
    expect(cuotas).toEqual([
      { periodo: "2027-03", importe: marzo.importe },
      { periodo: "2027-04", importe: "45000.00" },
      { periodo: "2027-06", importe: "54000.00" },
    ]);
    expect(marzo.importe).toBe("45000.00");
  });

  it("generar las cuotas de un período dos veces no las duplica", async () => {
    const antes = await sql("select 1 from public.obligaciones where periodo = '2027-06-01'");
    expect(await rpc<number>(base.admin, "generar_cuotas", ["2027-06-01", 10])).toBe(0);
    expect(await sql("select 1 from public.obligaciones where periodo = '2027-06-01'")).toHaveLength(antes.length);
  });

  it("los beneficios los aprueba dirección y se aplican como descuento explícito", async () => {
    const f = await crearFamilia(base, "Beca");
    const m = await rpc<string>(base.admin, "confirmar_inscripcion", [f.estudiante, comision, f.tutorPersona]);
    const [b] = await ver(
      base.direccion,
      "insert into public.beneficios (nombre, tipo, porcentaje) values ('Beca 50', 'beca', 50) returning id",
    );
    const otorgar =
      "insert into public.beneficios_otorgados (beneficio_id, matricula_id, vigente_desde, aprobado_por) values ($1, $2, '2027-01-01', $3)";
    await expect(ver(base.admin, otorgar, [b.id, m, base.admin])).rejects.toThrow(/row-level security/);
    await ver(base.direccion, otorgar, [b.id, m, base.direccion]);
    await rpc(base.admin, "generar_cuotas", ["2027-07-01", 10]);
    const [o] = await sql(
      "select importe_original, descuento, importe from public.obligaciones where matricula_id = $1 and periodo = '2027-07-01'",
      [m],
    );
    expect(o).toEqual({ importe_original: "54000.00", descuento: "27000.00", importe: "27000.00" });
  });

  it("el tablero separa caja, devengado y saldos, y solo lo ve dirección", async () => {
    await ver(base.admin, "insert into public.categorias_gasto (nombre) values ('Servicios prueba')");
    const [cat] = await sql<{ id: string }>("select id from public.categorias_gasto where nombre = 'Servicios prueba'");
    await ver(
      base.admin,
      "insert into public.gastos (fecha, categoria_id, descripcion, importe, registrado_por) values ('2026-11-03', $1, 'Luz', 12345.67, $2)",
      [cat.id, base.admin],
    );
    const t = await rpc<Record<string, any>>(base.direccion, "tablero_direccion", ["2026-11-01", "2026-11-30"]);
    const [esperado] = await sql(
      `select (select coalesce(sum(importe),0) from public.pagos where estado='confirmado' and fecha_pago between '2026-11-01' and '2026-11-30') as cobros,
              (select coalesce(sum(importe),0) from public.gastos where anulado_en is null and fecha between '2026-11-01' and '2026-11-30') as gastos`,
    );
    expect(Number(t.caja.cobros)).toBe(Number(esperado.cobros));
    expect(Number(t.caja.gastos)).toBe(Number(esperado.gastos));
    expect(Number(t.caja.flujo_neto)).toBe(Number(esperado.cobros) - Number(esperado.gastos));
    // El pago reversado no cuenta como cobro.
    const [rev] = await sql("select coalesce(sum(importe),0) as total from public.pagos where estado = 'reversado'");
    expect(Number(rev.total)).toBeGreaterThan(0);
    expect(t.saldos_a_hoy).toHaveProperty("vencido");
    expect(t.devengado).toHaveProperty("obligaciones_del_periodo");
  });
});

describe("notificaciones de pasarela", () => {
  it("la misma notificación recibida varias veces (incluso a la vez) acredita un solo pago", async () => {
    const comision = await crearComision(base, 5);
    await crearArancel(base.conceptoMatricula, comision, "30000.00");
    const f = await crearFamilia(base, "Pasarela");
    const m = await rpc<string>(base.admin, "confirmar_inscripcion", [f.estudiante, comision, f.tutorPersona]);
    const [o] = await sql<{ id: string }>("select id from public.obligaciones where matricula_id = $1", [m]);
    const notificar = (evento: string, referencia: string) =>
      comoServicio(async (c) => {
        const r = await c.query(
          "select public.procesar_evento_pasarela('demo', $1, 'pago_aprobado', true, $2, 30000, '2026-11-09', $3, $4, '{}'::jsonb) as r",
          [evento, referencia, f.tutorPersona, o.id],
        );
        return r.rows[0].r as { duplicado: boolean; resultado: string };
      });
    const respuestas = await Promise.all(Array.from({ length: 6 }, () => notificar("evt-1", "cobro-1")));
    expect(respuestas.filter((r) => !r.duplicado)).toHaveLength(1);
    // Mismo cobro con otro id de evento (reintento del proveedor): tampoco duplica.
    expect(await notificar("evt-2", "cobro-1")).toMatchObject({ duplicado: true, resultado: "pago_ya_registrado" });
    expect(await sql("select 1 from public.pagos where proveedor = 'demo' and referencia_externa = 'cobro-1'")).toHaveLength(1);
    const [s] = await sql("select pagado, estado from public.obligaciones_saldo where obligacion_id = $1", [o.id]);
    expect(s).toEqual({ pagado: "30000.00", estado: "pagada" });
    expect(await sql("select 1 from public.eventos_pasarela where proveedor = 'demo'")).toHaveLength(2);
  });

  it("una notificación con firma inválida se registra pero no acredita nada", async () => {
    const persona = await crearPersona("Pagador", "Falso");
    const r = await comoServicio(async (c) =>
      (
        await c.query(
          "select public.procesar_evento_pasarela('demo', 'evt-falso', 'pago_aprobado', false, 'cobro-falso', 999, '2026-11-09', $1, null, '{}'::jsonb) as r",
          [persona],
        )
      ).rows[0].r,
    );
    expect(r).toMatchObject({ resultado: "firma_invalida" });
    expect(await sql("select 1 from public.pagos where referencia_externa = 'cobro-falso'")).toHaveLength(0);
  });

  it("ningún usuario con sesión puede invocar el procesamiento de la pasarela", async () => {
    const cuenta = await crearCuenta(await crearPersona("Curioso", "Usuario"));
    for (const u of [cuenta, base.admin, base.direccion, null]) {
      await expect(
        ver(u, "select public.procesar_evento_pasarela('demo', 'x', 'pago_aprobado', true, 'y', 1, '2026-11-09', null, null, '{}'::jsonb)"),
      ).rejects.toThrow(/permission denied/);
      await expect(ver(u, "select public.generar_cuotas_programada('2027-03-01')")).rejects.toThrow(/permission denied/);
    }
  });
});
