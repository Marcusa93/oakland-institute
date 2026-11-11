#!/bin/sh
# Arma supabase/instalacion-inicial.sql (migraciones + datos demo en un solo
# archivo) para pegar en el SQL Editor cuando no se puede usar `supabase db push`.
cd "$(dirname "$0")/.." || exit 1
O=supabase/instalacion-inicial.sql
{
  echo "-- GENERADO: todas las migraciones + datos de demostración, para pegar una sola vez"
  echo "-- en el SQL Editor de un proyecto NUEVO y vacío. No editar: regenerar con scripts/armar-instalacion.sh"
  echo "begin;"
  for f in supabase/migrations/*.sql; do echo; echo "-- >>> $(basename "$f")"; cat "$f"; done
  echo; echo "-- >>> seed.sql (datos ficticios)"; cat supabase/seed.sql; echo
  echo "create schema if not exists supabase_migrations;"
  echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
  for f in supabase/migrations/*.sql; do b=$(basename "$f" .sql); echo "insert into supabase_migrations.schema_migrations (version, name) values ('${b%%_*}', '${b#*_}') on conflict do nothing;"; done
  echo "commit;"
} > "$O"
echo "Listo: $O"
