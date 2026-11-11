#!/bin/bash
# Instala o actualiza Oakland Institute en el VPS (Ubuntu + Caddy + systemd),
# con la misma receta que las demás apps del servidor.
#
# En el servidor, como root, después de subir las variables:
#   bash instalar.sh <dominio> [www]
#   ej.: bash instalar.sh oakland.2-25-185-242.sslip.io
#        bash instalar.sh oaklandinstitute.com.ar www      (agrega www → dominio)
#
# Es idempotente: volver a correrlo actualiza el código y reinicia.
set -euo pipefail
DOMINIO="${1:?Indicá el dominio}"
CON_WWW="${2:-}"
APP=oakland
PUERTO=3140
DIR=/home/$APP/oakland-institute
REPO=https://github.com/Marcusa93/oakland-institute.git
NODE=/opt/node22/bin
SELLO=$(date +%Y%m%d-%H%M)

[ -f /etc/$APP/app.env ] || { echo "Falta /etc/$APP/app.env: corré antes subir-variables.sh"; exit 1; }
grep -q "^NEXT_PUBLIC_SITIO_URL=https://$DOMINIO$" /etc/$APP/app.env \
  || sed -i "s#^NEXT_PUBLIC_SITIO_URL=.*#NEXT_PUBLIC_SITIO_URL=https://$DOMINIO#" /etc/$APP/app.env

# 1. Código
if [ -d "$DIR/.git" ]; then
  sudo -u $APP git -C "$DIR" pull --ff-only
else
  sudo -u $APP git clone --depth 1 "$REPO" "$DIR"
fi

# 2. Dependencias y compilación (las NEXT_PUBLIC_* se fijan al compilar)
sudo -u $APP env PATH="$NODE:/usr/bin:/bin" HOME=/home/$APP bash -c "
  set -euo pipefail
  cd '$DIR'
  set -a; . /etc/$APP/app.env; set +a
  export NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536
  pnpm install --frozen-lockfile
  pnpm build
"

# 3. Servicio
cat > /etc/systemd/system/$APP.service <<UNIT
[Unit]
Description=Oakland Institute (Next.js) — gestión, campus y landing
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP
Group=$APP
WorkingDirectory=$DIR
EnvironmentFile=/etc/$APP/app.env
Environment=PATH=$NODE:/usr/local/bin:/usr/bin:/bin
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=$NODE/node $DIR/node_modules/next/dist/bin/next start -H 127.0.0.1 -p $PUERTO
Restart=always
RestartSec=5
Nice=10
CPUWeight=50
IOWeight=50
MemoryMax=1G
MemoryHigh=768M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DIR/.next

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now $APP
systemctl restart $APP
sleep 5
curl -fsS -o /dev/null -w "App local: HTTP %{http_code}\n" http://127.0.0.1:$PUERTO/

# 4. Caddy (respaldo antes de tocar; se valida antes de recargar)
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.respaldo-$SELLO-antes-de-$APP
[ -f /etc/caddy/$APP.caddy ] && cp /etc/caddy/$APP.caddy /etc/caddy/$APP.caddy.respaldo-$SELLO
{
  echo "# Oakland Institute — generado por scripts/vps/instalar.sh ($SELLO)"
  echo "$DOMINIO {"
  echo "	reverse_proxy 127.0.0.1:$PUERTO {"
  echo "		header_up X-Forwarded-For {remote_host}"
  echo "		header_up X-Real-IP {remote_host}"
  echo "		header_up X-Forwarded-Proto {scheme}"
  echo "		header_up Host {host}"
  echo "	}"
  echo "	encode zstd gzip"
  echo "}"
  if [ "$CON_WWW" = "www" ]; then
    echo ""
    echo "www.$DOMINIO {"
    echo "	redir https://$DOMINIO{uri} permanent"
    echo "}"
  fi
} > /etc/caddy/$APP.caddy
grep -q "import /etc/caddy/$APP.caddy" /etc/caddy/Caddyfile || printf '\n# Oakland Institute\nimport /etc/caddy/%s.caddy\n' "$APP" >> /etc/caddy/Caddyfile
if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  systemctl reload caddy
  echo "Caddy recargado."
else
  echo "La configuración de Caddy no validó: restauro el respaldo."
  cp /etc/caddy/Caddyfile.respaldo-$SELLO-antes-de-$APP /etc/caddy/Caddyfile
  exit 1
fi

# 5. Tarea diaria (09:00 de Tucumán = 12:00 UTC): revisión de alertas
cat > /etc/cron.d/$APP <<CRON
# Oakland Institute: revisión diaria de alertas (lee CRON_SECRET del archivo de variables)
0 12 * * * $APP . /etc/$APP/app.env && curl -fsS -m 60 -H "Authorization: Bearer \$CRON_SECRET" http://127.0.0.1:$PUERTO/api/tareas/diaria >/dev/null
CRON
chmod 644 /etc/cron.d/$APP

echo "Listo: https://$DOMINIO"
