/**
 * Entorno de pruebas de base de datos.
 *
 * Levanta un PostgreSQL real (binarios embebidos, sin Docker), crea un
 * sustituto mínimo de lo que Supabase provee (roles anon/authenticated/
 * service_role, auth.uid(), auth.users, storage.objects) y aplica las
 * migraciones del proyecto tal cual están en supabase/migrations.
 *
 * Lo que NO cubre: GoTrue, PostgREST, Realtime y el servicio de Storage.
 * Las políticas y funciones SQL sí se ejecutan de verdad.
 */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const RAIZ = join(__dirname, "..", "..");
const PUERTO = 54329;

const SUSTITUTO_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null
  );
  alter table storage.objects enable row level security;
  grant select on storage.objects to authenticated;
  grant all on storage.objects to service_role;
`;

let servidor: EmbeddedPostgres | undefined;
let directorio: string | undefined;

export function urlConexion() {
  return `postgres://postgres:postgres@127.0.0.1:${PUERTO}/pruebas`;
}

export async function setup() {
  directorio = mkdtempSync(join(tmpdir(), "instituto-pg-"));
  servidor = new EmbeddedPostgres({
    databaseDir: directorio,
    user: "postgres",
    password: "postgres",
    port: PUERTO,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("pruebas");

  const cliente = new pg.Client({ connectionString: urlConexion() });
  await cliente.connect();
  try {
    await cliente.query(SUSTITUTO_SUPABASE);
    const carpeta = join(RAIZ, "supabase", "migrations");
    for (const archivo of readdirSync(carpeta).filter((a) => a.endsWith(".sql")).sort()) {
      try {
        await cliente.query(readFileSync(join(carpeta, archivo), "utf8"));
      } catch (error) {
        const e = error as { message: string; position?: string };
        throw new Error(`Falló la migración ${archivo}: ${e.message} (posición ${e.position ?? "?"})`);
      }
    }
  } finally {
    await cliente.end();
  }
}

export async function teardown() {
  await servidor?.stop();
  if (directorio) rmSync(directorio, { recursive: true, force: true });
}
