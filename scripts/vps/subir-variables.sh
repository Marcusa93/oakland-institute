#!/bin/sh
# Copia al servidor las variables que necesita la app (desde .env.local),
# sin la contraseña de la base, que solo se usa para migraciones desde la Mac.
#
#   sh scripts/vps/subir-variables.sh <dominio>      p. ej. oakland.2-25-185-242.sslip.io
#
# Queda en /etc/oakland/app.env (root:oakland, permisos 640).
set -eu
DOMINIO="${1:?Indicá el dominio, por ejemplo oakland.2-25-185-242.sslip.io}"
SERVIDOR="${SERVIDOR:-mr-vps}"
cd "$(dirname "$0")/../.."
grep -vE '^(SUPABASE_DB_PASSWORD|#)|^$' .env.local \
  | sed "s#^NEXT_PUBLIC_SITIO_URL=.*#NEXT_PUBLIC_SITIO_URL=https://${DOMINIO}#" \
  | ssh "$SERVIDOR" 'set -e
      id oakland >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/oakland --shell /usr/sbin/nologin oakland
      install -d -m 750 -o root -g oakland /etc/oakland
      umask 027
      cat > /etc/oakland/app.env
      chown root:oakland /etc/oakland/app.env
      chmod 640 /etc/oakland/app.env
      echo "Variables guardadas: $(cut -d= -f1 /etc/oakland/app.env | tr "\n" " ")"'
