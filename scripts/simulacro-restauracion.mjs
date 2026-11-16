/**
 * Simulacro de restauración: prueba que una copia de los datos se puede
 * cargar sobre una base armada SOLO con las migraciones del repositorio.
 *
 *   node --env-file=.env.local scripts/simulacro-restauracion.mjs
 *
 * 1. Copia los datos de `public` de la base de origen (pg_dump, como hace
 *    scripts/vps/copia-seguridad.sh).
 * 2. Levanta un PostgreSQL local vacío (el mismo de las pruebas), aplica las
 *    migraciones y carga la copia con scripts/restaurar-copia.sh (mismos pasos).
 * 3. Compara la cantidad de filas de cada tabla entre origen y restaurada.
 *
 * Origen: SIMULACRO_ORIGEN, o el proyecto de .env.local con SUPABASE_DB_PASSWORD
 * por el pooler. No modifica el origen. Las cuentas (auth) no se prueban acá:
 * el PostgreSQL local no tiene el esquema completo de Supabase Auth.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://x.supabase.co").hostname.split(".")[0];
const ORIGEN = process.env.SIMULACRO_ORIGEN
  ?? `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "")}@aws-1-us-east-2.pooler.supabase.com:5432/postgres`;
const PUERTO = 54339;

// pg_dump y psql (PostgreSQL 17 o más nuevo). PG_BIN permite indicar otra carpeta.
const BIN = [process.env.PG_BIN, "/opt/homebrew/opt/postgresql@18/bin", "/opt/homebrew/opt/postgresql@17/bin", "/opt/homebrew/opt/postgresql/bin", "/usr/local/opt/postgresql@18/bin", "/usr/bin"]
  .find((d) => d && existsSync(join(d, "pg_dump")) && existsSync(join(d, "psql")));
if (!BIN) throw new Error("No encontré pg_dump y psql. Instalalos (brew install postgresql@18) o indicá PG_BIN.");
// Nunca mostrar la contraseña en los mensajes de error.
const ocultar = (t) => String(t).replaceAll(ORIGEN, "<origen>").replaceAll(encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "\u0000"), "***");

// El mismo sustituto mínimo de Supabase que usan las pruebas (tests/db/entorno.ts).
const entorno = readFileSync(join(RAIZ, "tests", "db", "entorno.ts"), "utf8");
const SUSTITUTO = /const SUSTITUTO_SUPABASE = `([\s\S]*?)`;/.exec(entorno)?.[1];
if (!SUSTITUTO) throw new Error("No pude leer el sustituto de Supabase de tests/db/entorno.ts.");

const tablas = async (c) =>
  (await c.query("select tablename from pg_tables where schemaname = 'public' order by tablename")).rows.map((r) => r.tablename);
async function contar(c, lista) {
  const n = {};
  for (const t of lista) n[t] = Number((await c.query(`select count(*) from public."${t}"`)).rows[0].count);
  return n;
}

const dir = mkdtempSync(join(tmpdir(), "oakland-simulacro-"));
const copia = join(dir, "copia.sql");
const servidor = new EmbeddedPostgres({ databaseDir: join(dir, "datos"), user: "postgres", password: "postgres", port: PUERTO, persistent: false, onLog: () => {}, onError: () => {} });
const DESTINO = `postgres://postgres:postgres@127.0.0.1:${PUERTO}/simulacro`;

try {
  console.log("1. Copiando los datos del origen…");
  const t0 = Date.now();
  const d = spawnSync(join(BIN, "pg_dump"), [ORIGEN, "--data-only", "--no-owner", "--no-privileges", "--table=public.*", "--file", copia], { encoding: "utf8" });
  if (d.status !== 0) throw new Error(`pg_dump falló: ${ocultar(d.stderr)}`);
  console.log(`   ${(readFileSync(copia).length / 1024).toFixed(0)} KB en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  console.log("2. Armando una base vacía con las migraciones del repositorio…");
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("simulacro");
  const destino = new pg.Client({ connectionString: DESTINO });
  await destino.connect();
  await destino.query(SUSTITUTO);
  for (const a of readdirSync(join(RAIZ, "supabase", "migrations")).filter((x) => x.endsWith(".sql")).sort()) {
    await destino.query(readFileSync(join(RAIZ, "supabase", "migrations", a), "utf8"));
  }

  console.log("3. Restaurando (mismos pasos que scripts/restaurar-copia.sh)…");
  await destino.query(`do $$ declare t text; begin
    select string_agg(format('public.%I', tablename), ', ') into t from pg_tables where schemaname = 'public';
    if t is not null then execute 'truncate ' || t || ' cascade'; end if; end $$;`);
  // La copia trae roles de Supabase que el sustituto no tiene en algunos SET: se ignoran esas líneas.
  writeFileSync(copia, readFileSync(copia, "utf8").replace(/^SET transaction_timeout = 0;$/m, ""));
  const r = spawnSync(join(BIN, "psql"), [DESTINO, "--single-transaction", "-v", "ON_ERROR_STOP=1", "-q", "-c", "set session_replication_role = replica", "-f", copia], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`La restauración falló:\n${r.stderr}`);

  console.log("4. Comparando filas tabla por tabla…");
  const origen = new pg.Client({ connectionString: ORIGEN, ssl: ORIGEN.includes("127.0.0.1") ? false : { rejectUnauthorized: false } });
  await origen.connect();
  const lista = await tablas(origen);
  const [a, b] = [await contar(origen, lista), await contar(destino, lista)];
  await origen.end();
  await destino.end();
  const distintas = lista.filter((t) => a[t] !== b[t]);
  const total = lista.reduce((s, t) => s + a[t], 0);
  console.log(`   ${lista.length} tablas, ${total} filas en el origen.`);
  if (distintas.length) {
    for (const t of distintas) console.log(`   ✗ ${t}: origen ${a[t]}, restaurada ${b[t]}`);
    process.exitCode = 1;
  } else {
    console.log("   ✓ Todas las tablas tienen las mismas filas que el origen.");
  }
} catch (error) {
  console.error(`✗ ${ocultar(error instanceof Error ? error.message : error)}`);
  process.exitCode = 1;
} finally {
  await servidor.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
