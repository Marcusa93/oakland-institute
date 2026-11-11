/**
 * Criterios de aceptación: aislamiento entre familias, límites de acceso
 * docente, vínculos (verificación y revocación) y autoasignación de roles.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  asignarDocente,
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
let comisionA: string;
let comisionB: string;
let perez: Awaited<ReturnType<typeof crearFamilia>>;
let gomez: Awaited<ReturnType<typeof crearFamilia>>;
let docenteA: string;
let docenteAPersona: string;
let docenteB: string;

beforeAll(async () => {
  base = await crearBase();
  comisionA = await crearComision(base, 10);
  comisionB = await crearComision(base, 10);
  await crearArancel(base.conceptoMatricula, comisionA, "50000.00");
  await crearArancel(base.conceptoMatricula, comisionB, "50000.00");
  perez = await crearFamilia(base, "Pérez");
  gomez = await crearFamilia(base, "Gómez");
  docenteAPersona = await crearPersona("Docente", "A");
  docenteA = await crearCuenta(docenteAPersona, ["docente"]);
  docenteB = await crearCuenta(await crearPersona("Docente", "B"), ["docente"]);
  await asignarDocente(comisionA, docenteAPersona);
  await rpc(base.admin, "confirmar_inscripcion", [perez.estudiante, comisionA, perez.tutorPersona]);
  await rpc(base.admin, "confirmar_inscripcion", [gomez.estudiante, comisionB, gomez.tutorPersona]);
  // Un documento privado por estudiante, con su objeto en Storage.
  for (const f of [perez, gomez]) {
    const ruta = `${f.estudiante}/ficha.pdf`;
    await sql(
      "insert into public.documentos (tipo, nombre, estudiante_id, ruta) values ('ficha', 'Ficha', $1, $2)",
      [f.estudiante, ruta],
    );
    await sql("insert into storage.objects (bucket_id, name) values ('documentos', $1)", [ruta]);
  }
  await sql(
    "insert into public.observaciones_estudiante (estudiante_id, autor_cuenta_id, visibilidad, texto) values ($1, $2, 'gestion', 'Nota interna de gestión'), ($1, $2, 'docentes', 'Nota para docentes'), ($1, $2, 'familia', 'Nota para la familia')",
    [perez.estudiante, base.admin],
  );
});

describe("aislamiento entre familias", () => {
  it("un tutor ve solo a los estudiantes con vínculo verificado", async () => {
    const filas = await ver(perez.tutor, "select id from public.estudiantes");
    expect(filas.map((f) => f.id)).toEqual([perez.estudiante]);
  });

  it("no ve personas, datos, matrículas, obligaciones ni documentos de otra familia", async () => {
    for (const [tabla, columna, valor] of [
      ["personas", "id", gomez.estudiantePersona],
      ["personas", "id", gomez.tutorPersona],
      ["personas_datos", "persona_id", gomez.estudiantePersona],
      ["matriculas", "estudiante_id", gomez.estudiante],
      ["obligaciones", "estudiante_id", gomez.estudiante],
      ["obligaciones_saldo", "estudiante_id", gomez.estudiante],
      ["documentos", "estudiante_id", gomez.estudiante],
      ["vinculos_responsables", "estudiante_id", gomez.estudiante],
      ["observaciones_estudiante", "estudiante_id", gomez.estudiante],
    ] as const) {
      const filas = await ver(perez.tutor, `select 1 from public.${tabla} where ${columna} = $1`, [valor]);
      expect(filas, `${tabla} de otra familia`).toHaveLength(0);
    }
  });

  it("sí ve lo propio: matrícula, obligación y documento", async () => {
    expect(await ver(perez.tutor, "select 1 from public.matriculas")).toHaveLength(1);
    expect(await ver(perez.tutor, "select 1 from public.obligaciones")).toHaveLength(1);
    expect(await ver(perez.tutor, "select 1 from public.documentos")).toHaveLength(1);
  });

  it("Storage: solo puede leer los archivos de sus estudiantes", async () => {
    const objetos = await ver(perez.tutor, "select name from storage.objects");
    expect(objetos.map((o) => o.name)).toEqual([`${perez.estudiante}/ficha.pdf`]);
  });

  it("de las observaciones solo ve las marcadas para la familia", async () => {
    const filas = await ver(perez.tutor, "select texto from public.observaciones_estudiante");
    expect(filas.map((f) => f.texto)).toEqual(["Nota para la familia"]);
  });

  it("los permisos del vínculo son independientes (sin permiso económico no ve la cuenta)", async () => {
    const soloAcademico = await crearFamilia(base, "Ruiz", {
      academico: true,
      documental: false,
      economico: false,
      pago: false,
    });
    await rpc(base.admin, "confirmar_inscripcion", [soloAcademico.estudiante, comisionA, base.adminPersona]);
    await sql(
      "insert into public.documentos (tipo, nombre, estudiante_id, ruta) values ('ficha', 'Ficha', $1, $2)",
      [soloAcademico.estudiante, `${soloAcademico.estudiante}/ficha.pdf`],
    );
    expect(await ver(soloAcademico.tutor, "select 1 from public.matriculas")).toHaveLength(1);
    expect(await ver(soloAcademico.tutor, "select 1 from public.obligaciones")).toHaveLength(0);
    expect(await ver(soloAcademico.tutor, "select 1 from public.documentos")).toHaveLength(0);
    expect(await ver(soloAcademico.tutor, "select 1 from public.personas_datos where persona_id = $1", [
      soloAcademico.estudiantePersona,
    ])).toHaveLength(0);
  });

  it("un visitante sin sesión no lee ninguna tabla de personas ni de gestión", async () => {
    for (const tabla of ["personas", "estudiantes", "matriculas", "obligaciones", "pagos", "consultas"]) {
      await expect(ver(null, `select 1 from public.${tabla}`)).rejects.toThrow(/permission denied/);
    }
  });
});

describe("límites de acceso docente", () => {
  it("ve a los estudiantes de sus comisiones y no a los de otras", async () => {
    const filas = await ver(docenteA, "select id from public.estudiantes");
    expect(filas.map((f) => f.id)).toContain(perez.estudiante);
    expect(filas.map((f) => f.id)).not.toContain(gomez.estudiante);
  });

  it("no accede a obligaciones, pagos, imputaciones, gastos, aranceles ni pagos docentes", async () => {
    for (const tabla of [
      "obligaciones",
      "obligaciones_saldo",
      "pagos",
      "imputaciones",
      "gastos",
      "aranceles",
      "pagos_docentes",
      "matriculas_pago",
      "ajustes",
      "beneficios_otorgados",
    ]) {
      expect(await ver(docenteA, `select 1 from public.${tabla}`), tabla).toHaveLength(0);
    }
  });

  it("no ve datos sensibles (documento, contacto) ni vínculos familiares ni documentación", async () => {
    expect(
      await ver(docenteA, "select 1 from public.personas_datos where persona_id = $1", [perez.estudiantePersona]),
    ).toHaveLength(0);
    expect(await ver(docenteA, "select 1 from public.vinculos_responsables")).toHaveLength(0);
    expect(await ver(docenteA, "select 1 from public.documentos")).toHaveLength(0);
    expect(await ver(docenteA, "select 1 from storage.objects")).toHaveLength(0);
  });

  it("ve observaciones para docentes y familia, no las internas de gestión", async () => {
    const filas = await ver(docenteA, "select texto from public.observaciones_estudiante order by texto");
    expect(filas.map((f) => f.texto)).toEqual(["Nota para docentes", "Nota para la familia"]);
  });

  it("toma asistencia en su comisión y no en una ajena", async () => {
    const [claseA] = await sql<{ id: string }>(
      "insert into public.clases (comision_id, fecha, hora_inicio, hora_fin) values ($1, '2027-03-08', '18:00', '19:30') returning id",
      [comisionA],
    );
    const [claseB] = await sql<{ id: string }>(
      "insert into public.clases (comision_id, fecha, hora_inicio, hora_fin) values ($1, '2027-03-08', '18:00', '19:30') returning id",
      [comisionB],
    );
    const [matA] = await sql<{ id: string }>("select id from public.matriculas where estudiante_id = $1", [
      perez.estudiante,
    ]);
    const [matB] = await sql<{ id: string }>("select id from public.matriculas where estudiante_id = $1", [
      gomez.estudiante,
    ]);
    await ver(docenteA, "insert into public.asistencias (clase_id, matricula_id, estado) values ($1, $2, 'presente')", [
      claseA.id,
      matA.id,
    ]);
    await expect(
      ver(docenteA, "insert into public.asistencias (clase_id, matricula_id, estado) values ($1, $2, 'presente')", [
        claseB.id,
        matB.id,
      ]),
    ).rejects.toThrow(/row-level security/);
    // Tampoco puede "colar" una matrícula ajena en una clase propia.
    await expect(
      ver(docenteA, "insert into public.asistencias (clase_id, matricula_id, estado) values ($1, $2, 'presente')", [
        claseA.id,
        matB.id,
      ]),
    ).rejects.toThrow(/ASISTENCIA_INVALIDA/);
    // El tutor ve la asistencia publicada de su hijo; la otra familia no.
    expect(await ver(perez.tutor, "select 1 from public.asistencias")).toHaveLength(1);
    expect(await ver(gomez.tutor, "select 1 from public.asistencias")).toHaveLength(0);
  });

  it("pierde el acceso al estudiante cuando se le da de baja de la comisión", async () => {
    const f = await crearFamilia(base, "Baja");
    const matricula = await rpc<string>(base.admin, "confirmar_inscripcion", [f.estudiante, comisionA, f.tutorPersona]);
    expect(await ver(docenteA, "select 1 from public.estudiantes where id = $1", [f.estudiante])).toHaveLength(1);
    await rpc(base.admin, "dar_de_baja_matricula", [matricula, "Se mudó"]);
    expect(await ver(docenteA, "select 1 from public.estudiantes where id = $1", [f.estudiante])).toHaveLength(0);
  });

  it("no puede ejecutar operaciones de gestión ni ver el tablero", async () => {
    await expect(
      rpc(docenteA, "confirmar_inscripcion", [gomez.estudiante, comisionA, gomez.tutorPersona]),
    ).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(docenteA, "registrar_pago", [perez.tutorPersona, "efectivo", "100", "2026-11-01"])).rejects.toThrow(
      /NO_AUTORIZADO/,
    );
    await expect(rpc(docenteA, "tablero_direccion", ["2026-01-01", "2026-12-31"])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(base.admin, "tablero_direccion", ["2026-01-01", "2026-12-31"])).rejects.toThrow(/NO_AUTORIZADO/);
  });

  it("no puede enviar avisos económicos, institucionales ni a comisiones ajenas", async () => {
    const alta =
      "insert into public.comunicaciones (tipo, categoria, asunto, cuerpo, comision_id, autor_cuenta_id) values ($1, $2, 'Aviso', 'Texto', $3, $4) returning id";
    await expect(ver(docenteA, alta, ["comision", "economica", comisionA, docenteA])).rejects.toThrow(/row-level/);
    await expect(ver(docenteA, alta, ["institucional", "general", null, docenteA])).rejects.toThrow(/row-level/);
    await expect(ver(docenteA, alta, ["comision", "academica", comisionB, docenteA])).rejects.toThrow(/row-level/);
    const [{ id }] = await ver(docenteA, alta, ["comision", "academica", comisionA, docenteA]);
    const enviados = await rpc<number>(docenteA, "enviar_comunicacion", [id]);
    expect(enviados).toBeGreaterThanOrEqual(2); // estudiante + responsable académico
    // Reenviar no duplica (idempotencia).
    expect(await rpc<number>(docenteA, "enviar_comunicacion", [id])).toBe(enviados);
    expect(await ver(perez.tutor, "select 1 from public.comunicaciones where id = $1", [id])).toHaveLength(1);
    expect(await ver(gomez.tutor, "select 1 from public.comunicaciones where id = $1", [id])).toHaveLength(0);
    // Aviso individual a alguien fuera de sus comisiones: rechazado.
    const [{ id: individual }] = await ver(docenteA, alta, ["individual", "academica", null, docenteA]);
    await expect(rpc(docenteA, "enviar_comunicacion", [individual, [gomez.tutorPersona]])).rejects.toThrow(
      /NO_AUTORIZADO/,
    );
  });

  it("de la matrícula ve la parte académica, no quién paga ni las condiciones económicas", async () => {
    expect(await ver(docenteA, "select 1 from public.matriculas where estudiante_id = $1", [perez.estudiante])).toHaveLength(1);
    await expect(ver(docenteA, "select condiciones from public.matriculas")).rejects.toThrow(/does not exist/);
    // La familia con permiso económico y gestión sí ven ese lado.
    expect(await ver(perez.tutor, "select 1 from public.matriculas_pago")).toHaveLength(1);
    expect(await ver(gomez.tutor, "select 1 from public.matriculas_pago")).toHaveLength(1);
    expect((await ver(base.admin, "select 1 from public.matriculas_pago")).length).toBeGreaterThanOrEqual(2);
  });

  it("clases y docentes de una comisión solo los ven quienes participan de ella", async () => {
    await sql("insert into public.clases (comision_id, fecha, hora_inicio, hora_fin, tema) values ($1, '2027-04-05', '18:00', '19:30', 'Tema B')", [comisionB]);
    expect(await ver(perez.tutor, "select 1 from public.clases where comision_id = $1", [comisionB])).toHaveLength(0);
    expect(await ver(gomez.tutor, "select 1 from public.clases where comision_id = $1", [comisionB])).not.toHaveLength(0);
    expect(await ver(docenteA, "select 1 from public.clases where comision_id = $1", [comisionB])).toHaveLength(0);
    expect(await ver(perez.tutor, "select 1 from public.comision_docentes where comision_id = $1", [comisionA])).toHaveLength(1);
    expect(await ver(gomez.tutor, "select 1 from public.comision_docentes where comision_id = $1", [comisionA])).toHaveLength(0);
  });

  it("un docente sin comisiones no ve estudiantes", async () => {
    expect(await ver(docenteB, "select 1 from public.estudiantes")).toHaveLength(0);
  });
});

describe("vínculos y roles", () => {
  it("un vínculo invitado o aceptado todavía no da acceso; recién al verificarse", async () => {
    const estudiante = await crearEstudiante(await crearPersona("Menor", "Sosa"));
    const tutorPersona = await crearPersona("Tutor", "Sosa");
    const tutor = await crearCuenta(tutorPersona);
    const vinculo = await rpc<string>(base.admin, "invitar_responsable", [estudiante, tutorPersona, "tío"]);
    expect(await ver(tutor, "select 1 from public.estudiantes")).toHaveLength(0);
    await rpc(tutor, "responder_vinculo", [vinculo, true]);
    expect(await ver(tutor, "select 1 from public.estudiantes")).toHaveLength(0);
    await rpc(base.admin, "verificar_vinculo", [vinculo, true, false, false]);
    expect(await ver(tutor, "select 1 from public.estudiantes")).toHaveLength(1);
  });

  it("la revocación corta el acceso de inmediato y conserva el historial", async () => {
    const f = await crearFamilia(base, "Revocada");
    await rpc(base.admin, "confirmar_inscripcion", [f.estudiante, comisionA, f.tutorPersona]);
    expect(await ver(f.tutor, "select 1 from public.matriculas")).toHaveLength(1);
    await rpc(base.admin, "revocar_vinculo", [f.vinculo, "Pedido de la familia"]);
    expect(await ver(f.tutor, "select 1 from public.estudiantes")).toHaveLength(0);
    expect(await ver(f.tutor, "select 1 from public.matriculas")).toHaveLength(0);
    expect(await ver(f.tutor, "select 1 from public.personas where id = $1", [f.estudiantePersona])).toHaveLength(0);
    const [v] = await sql("select estado, revocado_por, motivo_cierre from public.vinculos_responsables where id = $1", [
      f.vinculo,
    ]);
    expect(v).toMatchObject({ estado: "revocado", revocado_por: base.admin, motivo_cierre: "Pedido de la familia" });
    const auditoria = await sql(
      "select 1 from public.auditoria where tabla = 'vinculos_responsables' and registro_id = $1",
      [f.vinculo],
    );
    expect(auditoria.length).toBeGreaterThanOrEqual(3);
    // Un vínculo revocado no se reactiva: hay que crear uno nuevo.
    await expect(rpc(base.admin, "verificar_vinculo", [f.vinculo, true, true, true])).rejects.toThrow(
      /TRANSICION_INVALIDA/,
    );
  });

  it("nadie puede crear, verificar ni modificar sus propios vínculos", async () => {
    const tutor = perez.tutor;
    await expect(
      ver(tutor, "insert into public.vinculos_responsables (estudiante_id, responsable_persona_id) values ($1, $2)", [
        gomez.estudiante,
        perez.tutorPersona,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      ver(tutor, "update public.vinculos_responsables set permiso_economico = true where id = $1", [perez.vinculo]),
    ).rejects.toThrow(/permission denied/);
    await expect(rpc(tutor, "invitar_responsable", [gomez.estudiante, perez.tutorPersona, "x"])).rejects.toThrow(
      /NO_AUTORIZADO/,
    );
    await expect(rpc(tutor, "verificar_vinculo", [gomez.vinculo, true, true, true])).rejects.toThrow(/NO_AUTORIZADO/);
    // Aceptar una invitación dirigida a otra persona tampoco.
    const otro = await crearEstudiante(await crearPersona("Otro", "Menor"));
    const invitacion = await rpc<string>(base.admin, "invitar_responsable", [otro, gomez.tutorPersona, "abuela"]);
    await expect(rpc(tutor, "responder_vinculo", [invitacion, true])).rejects.toThrow(/NO_AUTORIZADO/);
  });

  it("nadie puede asignarse roles; solo dirección los otorga", async () => {
    await expect(
      ver(perez.tutor, "insert into public.roles_asignados (cuenta_id, rol) values ($1, 'direccion')", [perez.tutor]),
    ).rejects.toThrow(/permission denied/);
    await expect(rpc(perez.tutor, "otorgar_rol", [perez.tutor, "administracion"])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(base.admin, "otorgar_rol", [base.admin, "direccion"])).rejects.toThrow(/NO_AUTORIZADO/);
    await rpc(base.direccion, "otorgar_rol", [docenteB, "administracion"]);
    expect(await ver(docenteB, "select 1 from public.estudiantes")).not.toHaveLength(0);
    await rpc(base.direccion, "revocar_rol", [docenteB, "administracion"]);
    expect(await ver(docenteB, "select 1 from public.estudiantes")).toHaveLength(0);
  });

  it("una cuenta suspendida pierde todos sus accesos", async () => {
    const f = await crearFamilia(base, "Suspendida");
    expect(await ver(f.tutor, "select 1 from public.estudiantes")).toHaveLength(1);
    await sql("update public.cuentas set estado = 'suspendida' where id = $1", [f.tutor]);
    expect(await ver(f.tutor, "select 1 from public.estudiantes")).toHaveLength(0);
  });

  it("los perfiles efectivos se derivan de los datos, no de metadatos del usuario", async () => {
    expect(await rpc(perez.tutor, "mi_contexto")).toMatchObject({ perfiles: ["tutor"] });
    expect(await rpc(docenteA, "mi_contexto")).toMatchObject({ perfiles: ["docente"] });
    expect(await rpc(null, "oferta_publicada")).toBeInstanceOf(Array);
  });
});
