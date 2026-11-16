#!/bin/sh
# Copia al servidor las variables que necesita la app (desde .env.local),
# sin la contraseña de la base, que solo se usa para migraciones desde la Mac.
#
#   sh scripts/vps/subir-variables.sh <dominio>      p. ej. oakland.2-25-185-242.sslip.io
#
# Para el lanzamiento, con las variables del proyecto de producción en otro archivo:
#   ARCHIVO=.env.produccion sh scripts/vps/subir-variables.sh oaklandinstitute.com.ar
# Con NEXT_PUBLIC_ENTORNO=produccion desaparecen la franja «Sitio en preparación»
# y el rótulo de demo del asistente, y no se ofrecen las cuentas de prueba.
#
# Queda en /etc/oakland/app.env (root:oakland, permisos 640).
set -eu
DOMINIO="${1:?Indicá el dominio, por ejemplo oakland.2-25-185-242.sslip.io}"
SERVIDOR="${SERVIDOR:-mr-vps}"
ARCHIVO="${ARCHIVO:-.env.local}"
cd "$(dirname "$0")/../.."
test -f "$ARCHIVO" || { echo "No existe $ARCHIVO" >&2; exit 1; }
grep -vE '^(SUPABASE_DB_PASSWORD|#)|^$' "$ARCHIVO" \
  | sed "s#^NEXT_PUBLIC_SITIO_URL=.*#NEXT_PUBLIC_SITIO_URL=https://${DOMINIO}#" \
  | ssh "$SERVIDOR" 'set -e
      id oakland >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/oakland --shell /usr/sbin/nologin oakland
      install -d -m 750 -o root -g oakland /etc/oakland
      umask 027
      cat > /etc/oakland/app.env
      chown root:oakland /etc/oakland/app.env
      chmod 640 /etc/oakland/app.env
      echo "Variables guardadas: $(cut -d= -f1 /etc/oakland/app.env | tr "\n" " ")"'
