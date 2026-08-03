#!/usr/bin/env bash
set -euo pipefail

# Despliega el watchdog en mecopia-admin-server y lo activa con systemd.
# Uso: ./scripts/deploy.sh

REMOTE_HOST="mecopia-admin-server"
REMOTE_DIR="/opt/mecopia-watchdog"
BACKEND_ENV="/root/mecopia-web-backend/.env"

echo "→ Subiendo watchdog a ${REMOTE_HOST}:${REMOTE_DIR}..."
ssh "${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}"
rsync -av --delete \
  --exclude=node_modules \
  --exclude=data \
  --exclude=.env \
  --exclude=.git \
  . "${REMOTE_HOST}:${REMOTE_DIR}/"

echo "→ Instalando dependencias..."
ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && npm ci"

echo "→ Generando .env con credenciales de ${BACKEND_ENV}..."
ssh "${REMOTE_HOST}" bash <<EOF
set -euo pipefail
BACKEND_ENV="${BACKEND_ENV}"
WATCHDOG_ENV="${REMOTE_DIR}/.env"

# Extrae las variables de correo del backend (si existen)
MAIL_USER=\$(grep -E '^MAIL_USER=' "\$BACKEND_ENV" | tail -n1 || true)
MAIL_CLIENT_ID=\$(grep -E '^MAIL_CLIENT_ID=' "\$BACKEND_ENV" | tail -n1 || true)
MAIL_CLIENT_SECRET=\$(grep -E '^MAIL_CLIENT_SECRET=' "\$BACKEND_ENV" | tail -n1 || true)
MAIL_REFRESH_TOKEN=\$(grep -E '^MAIL_REFRESH_TOKEN=' "\$BACKEND_ENV" | tail -n1 || true)

cat > "\$WATCHDOG_ENV" <<ENV
# Generado automáticamente por deploy.sh
\$MAIL_USER
\$MAIL_CLIENT_ID
\$MAIL_CLIENT_SECRET
\$MAIL_REFRESH_TOKEN
MAIL_FROM_NAME=Mecopia Watchdog
ALERT_TO=nandezgarcia@gmail.com
CHECK_MODE=local
PM2_SERVICES=mecopia-back,mecopia-web,mecopia-web-admin
CHECK_INTERVAL_MS=60000
ALERT_INTERVAL_MS=300000
STATE_FILE=data/state.json
DRY_RUN=false
ENV

chmod 600 "\$WATCHDOG_ENV"
EOF

echo "→ Instalando unidades systemd..."
ssh "${REMOTE_HOST}" "cp ${REMOTE_DIR}/systemd/mecopia-watchdog.service /etc/systemd/system/ && cp ${REMOTE_DIR}/systemd/mecopia-watchdog.timer /etc/systemd/system/"
ssh "${REMOTE_HOST}" "systemctl daemon-reload && systemctl enable --now mecopia-watchdog.timer"

echo "→ Probando ejecución manual (DRY_RUN)..."
ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && DRY_RUN=true node src/watchdog.js --once"

echo "→ Listo. Ver estado con:"
echo "   ssh ${REMOTE_HOST} 'systemctl status mecopia-watchdog.timer'"
echo "   ssh ${REMOTE_HOST} 'journalctl -u mecopia-watchdog.service -f'"
