#!/usr/bin/env bash
# Actualiza Salt en el servidor con lo último de git: copia de la base, código nuevo, dependencias,
# migraciones, compilación y reinicio. Se corre desde la carpeta del proyecto:
#   deploy/update.sh
# (Lo mismo que la "rutina después de cada git pull" de docs/estado.md, más el backup y el build.)
# Node es el de nvm (versión "default"); deploy/with-node.sh lo carga. Para cambiar de versión:
#   nvm install 24 && nvm alias default 24 && deploy/update.sh

set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

step "1/6 Copia de la base, por si algo sale mal"
scripts/backup-db.sh

step "2/6 Código nuevo"
git pull --ff-only

step "3/6 Dependencias y migraciones (Node $(deploy/with-node.sh node --version))"
deploy/with-node.sh npm ci
deploy/with-node.sh npx prisma migrate deploy

step "4/6 Compilación"
deploy/with-node.sh npm run build

step "5/6 Servicios y timers de systemd (por si el pull trajo cambios)"
# Mismas plantillas que deploy/install.sh. Ojo: si el pull cambia este archivo, bash sigue con la
# versión vieja: hacer `git pull` antes de correrlo (o correrlo dos veces).
for unit in salt salt-check; do
  sed -e "s|__USER__|$(whoami)|g" -e "s|__APP_DIR__|$(pwd)|g" "deploy/$unit.service" |
    sudo tee "/etc/systemd/system/$unit.service" > /dev/null
done
sudo cp deploy/salt-check.timer /etc/systemd/system/salt-check.timer
sudo systemctl daemon-reload
sudo systemctl enable --now salt-check.timer

step "6/6 Reinicio"
sudo systemctl restart salt
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3001/login 2>/dev/null && break
  sleep 1
done
curl -fsS -o /dev/null http://127.0.0.1:3001/login && echo "✔ Salt actualizada y andando." ||
  { echo "✗ La app no contesta: journalctl -u salt -n 50" >&2; exit 1; }
