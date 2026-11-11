import pg from "pg";
import { randomUUID } from "node:crypto";
import { urlConexion } from "./entorno";

// numeric → string (precisión exacta); no se convierten importes a float.
export const pool = new pg.Pool({ connectionString: urlConexion(), max: 12 });

export type Cliente = pg.PoolClient;

/** Ejecuta como superusuario (preparación de datos; equivale a migraciones/seed). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(texto: string, params: unknown[] = []) {
  const r = await pool.query<T>(texto, params);
  return r.rows;
}

/**
 * Ejecuta `fn` dentro de una transacción con la identidad indicada, igual que
 * PostgREST: rol `authenticated` + claims del JWT (o `anon` si no hay usuario).
 */
export async function como<T>(usuario: string | null, fn: (c: Cliente) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${usuario ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(usuario ? { sub: usuario, role: "authenticated" } : { role: "anon" }),
    ]);
    const resultado = await fn(c);
    await c.query("commit");
    return resultado;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function comoServicio<T>(fn: (c: Cliente) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role service_role");
    const resultado = await fn(c);
    await c.query("commit");
    return resultado;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Filas visibles para un usuario en una consulta. */
export async function ver<T extends pg.QueryResultRow = pg.QueryResultRow>(
  usuario: string | null,
  texto: string,
  params: unknown[] = [],
) {
  return como(usuario, async (c) => (await c.query<T>(texto, params)).rows);
}

export async function rpc<T = unknown>(usuario: string | null, funcion: string, args: unknown[] = []): Promise<T> {
  const marcadores = args.map((_, i) => `$${i + 1}`).join(", ");
  const filas = await ver(usuario, `select public.${funcion}(${marcadores}) as r`, args);
  return filas[0]?.r as T;
}

const sufijo = () => randomUUID().slice(0, 8);

export async function crearPersona(nombres: string, apellidos = "Prueba", email?: string) {
  const [{ id }] = await sql<{ id: string }>(
    "insert into public.personas (nombres, apellidos) values ($1, $2) returning id",
    [nombres, apellidos],
  );
  await sql("insert into public.personas_datos (persona_id, email, telefono) values ($1, $2, $3)", [
    id,
    email ?? `${nombres.toLowerCase().replace(/\W/g, "")}-${sufijo()}@ejemplo.test`,
    "3810000000",
  ]);
  return id;
}

type Rol = "docente" | "administracion" | "direccion";

export async function crearCuenta(personaId: string, roles: Rol[] = []) {
  const [{ id }] = await sql<{ id: string }>("insert into auth.users (email) values ($1) returning id", [
    `cuenta-${sufijo()}@ejemplo.test`,
  ]);
  await sql("insert into public.cuentas (id, persona_id) values ($1, $2)", [id, personaId]);
  for (const rol of roles) {
    await sql("insert into public.roles_asignados (cuenta_id, rol) values ($1, $2)", [id, rol]);
  }
  return id;
}

export async function crearEstudiante(personaId: string) {
  const [{ id }] = await sql<{ id: string }>(
    "insert into public.estudiantes (persona_id) values ($1) returning id",
    [personaId],
  );
  return id;
}

export interface Base {
  sede: string;
  ciclo: string;
  nivel: string;
  curso: string;
  conceptoMatricula: string;
  conceptoCuota: string;
  admin: string;
  adminPersona: string;
  direccion: string;
}

/** Catálogo mínimo + cuentas de gestión. Cada archivo de prueba crea el suyo. */
export async function crearBase(): Promise<Base> {
  const s = sufijo();
  const [{ id: sede }] = await sql<{ id: string }>("insert into public.sedes (nombre) values ($1) returning id", [
    `Sede ${s}`,
  ]);
  const [{ id: ciclo }] = await sql<{ id: string }>(
    "insert into public.ciclos_lectivos (nombre, fecha_inicio, fecha_fin, estado) values ($1, '2027-03-01', '2027-12-15', 'activo') returning id",
    [`Ciclo ${s}`],
  );
  const [{ id: nivel }] = await sql<{ id: string }>(
    "insert into public.niveles (codigo, nombre, orden) values ($1, $2, 1) returning id",
    [`N-${s}`, `Nivel ${s}`],
  );
  const [{ id: curso }] = await sql<{ id: string }>(
    "insert into public.cursos (slug, nombre, publicado) values ($1, $2, true) returning id",
    [`curso-${s}`, `Curso ${s}`],
  );
  const [{ id: conceptoMatricula }] = await sql<{ id: string }>(
    "insert into public.conceptos (codigo, nombre, tipo) values ($1, 'Matrícula', 'matricula') returning id",
    [`MAT-${s}`],
  );
  const [{ id: conceptoCuota }] = await sql<{ id: string }>(
    "insert into public.conceptos (codigo, nombre, tipo) values ($1, 'Cuota', 'cuota') returning id",
    [`CUO-${s}`],
  );
  const adminPersona = await crearPersona("Admin", `Gestión ${s}`);
  const admin = await crearCuenta(adminPersona, ["administracion"]);
  const direccion = await crearCuenta(await crearPersona("Dire", `Dirección ${s}`), ["direccion"]);
  return { sede, ciclo, nivel, curso, conceptoMatricula, conceptoCuota, admin, adminPersona, direccion };
}

export async function crearComision(base: Base, cupo: number, nombre = `Comisión ${sufijo()}`) {
  const [{ id }] = await sql<{ id: string }>(
    `insert into public.comisiones (curso_id, nivel_id, ciclo_id, sede_id, nombre, cupo, estado, publicada, fecha_inicio, fecha_fin)
     values ($1, $2, $3, $4, $5, $6, 'abierta', true, '2027-03-01', '2027-12-15') returning id`,
    [base.curso, base.nivel, base.ciclo, base.sede, nombre, cupo],
  );
  return id;
}

/** Arancel acotado a una comisión para no interferir entre pruebas. */
export async function crearArancel(concepto: string, comision: string, importe: string, desde = "2020-01-01") {
  const [{ id }] = await sql<{ id: string }>(
    "insert into public.aranceles (concepto_id, comision_id, importe, vigente_desde) values ($1, $2, $3, $4) returning id",
    [concepto, comision, importe, desde],
  );
  return id;
}

/** Familia típica: estudiante menor sin cuenta + un responsable verificado con cuenta. */
export async function crearFamilia(
  base: Base,
  nombre: string,
  permisos = { academico: true, documental: true, economico: true, pago: true },
) {
  const estudiantePersona = await crearPersona(`Hijo ${nombre}`, nombre);
  const estudiante = await crearEstudiante(estudiantePersona);
  const tutorPersona = await crearPersona(`Tutor ${nombre}`, nombre);
  const tutor = await crearCuenta(tutorPersona);
  const vinculo = await rpc<string>(base.admin, "invitar_responsable", [estudiante, tutorPersona, "madre/padre"]);
  await rpc(tutor, "responder_vinculo", [vinculo, true]);
  await rpc(base.admin, "verificar_vinculo", [
    vinculo,
    permisos.academico,
    permisos.documental,
    permisos.economico,
    permisos.pago,
    false,
  ]);
  return { estudiante, estudiantePersona, tutor, tutorPersona, vinculo };
}

export async function asignarDocente(comision: string, docentePersona: string) {
  await sql(
    "insert into public.comision_docentes (comision_id, docente_persona_id, desde) values ($1, $2, '2027-03-01')",
    [comision, docentePersona],
  );
}
