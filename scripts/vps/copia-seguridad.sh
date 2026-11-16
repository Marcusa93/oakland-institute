#!/bin/sh
# Copia de seguridad diaria de la base de Oakland Institute (corre en el VPS).
#
# Guarda los DATOS (no la estructura, que está en supabase/migrations) de:
#   - todas las tablas de `public` (estudiantes, cobros, actividades…)
#   - auth.users y auth.identities (las cuentas, para que la gente siga
#     entrando con su contraseña después de restaurar)
# Se restaura con scripts/restaurar-copia.sh sobre un proyecto con las
# migraciones aplicadas.
#
# Configuración en /etc/oakland/copia.env (root, permisos 600):
#   BASE_URL=postgresql://postgres.<ref>:<clave>@aws-…pooler.supabase.com:5432/postgres
#   COPIAS_DIR=/var/backups/oakland          (opcional)
#   RCLONE_DESTINO=drive:oakland-copias      (opcional: copia fuera del servidor)
# Requiere postgresql-client de la misma versión de Postgres o más nueva.
# Conserva 14 copias diarias y 8 semanales (las de los domingos).
set -eu
. /etc/oakland/copia.env
DIR="${COPIAS_DIR:-/var/backups/oakland}"
FECHA=$(date +%F)
ARCHIVO="$DIR/diarias/oakland-$FECHA.sql.gz"
umask 077
mkdir -p "$DIR/diarias" "$DIR/semanales"

pg_dump "$BASE_URL" --data-only --no-owner --no-privileges \
  --table='public.*' --table=auth.users --table=auth.identities \
  | gzip -9 > "$ARCHIVO.parcial"
# Una copia vacía o cortada no reemplaza a la anterior.
gzip -t "$ARCHIVO.parcial"
[ "$(gzip -dc "$ARCHIVO.parcial" | grep -c '^COPY ')" -gt 10 ] || { echo "Copia sospechosa (sin tablas): no se guarda" >&2; rm -f "$ARCHIVO.parcial"; exit 1; }
mv "$ARCHIVO.parcial" "$ARCHIVO"

[ "$(date +%u)" = 7 ] && cp "$ARCHIVO" "$DIR/semanales/"
ls -1t "$DIR"/diarias/oakland-*.sql.gz | tail -n +15 | xargs -r rm -f
ls -1t "$DIR"/semanales/oakland-*.sql.gz 2>/dev/null | tail -n +9 | xargs -r rm -f

if [ -n "${RCLONE_DESTINO:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$DIR" "$RCLONE_DESTINO" --max-age 8d
fi
echo "Copia lista: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
