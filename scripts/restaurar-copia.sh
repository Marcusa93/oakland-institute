#!/bin/sh
# Restaura una copia hecha con scripts/vps/copia-seguridad.sh.
#
#   sh scripts/restaurar-copia.sh oakland-2027-03-10.sql.gz "postgresql://…"
#
# El destino tiene que ser un proyecto de Supabase NUEVO con las migraciones
# del repositorio ya aplicadas (supabase db push). Borra los datos que haya en
# `public` del destino y carga los de la copia; las cuentas (auth) se agregan.
# Los archivos (comprobantes, audios, biblioteca) están en Storage: se
# restauran aparte (ver docs/07-lanzamiento.md).
set -eu
COPIA="${1:?Indicá el archivo de la copia}"
DESTINO="${2:?Indicá la conexión a la base de destino}"
printf 'Esto BORRA los datos de public en el destino y carga la copia %s. Escribí RESTAURAR para seguir: ' "$COPIA"
read -r OK
[ "$OK" = RESTAURAR ] || { echo "Cancelado."; exit 1; }

psql "$DESTINO" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare t text;
begin
  select string_agg(format('public.%I', tablename), ', ') into t from pg_tables where schemaname = 'public';
  if t is not null then execute 'truncate ' || t || ' cascade'; end if;
end $$;
SQL
# Sin disparadores ni controles de claves durante la carga: los datos ya
# vienen consistentes de la base original.
gzip -dc "$COPIA" | psql "$DESTINO" --single-transaction -v ON_ERROR_STOP=1 -q \
  -c 'set session_replication_role = replica' -f -
echo "Restauración terminada. Revisá el tablero y los listados antes de abrir el sistema."
