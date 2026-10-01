#!/usr/bin/env bash
# Actualiza Salt en el servidor con lo último de git: copia de la base, código nuevo, dependencias,
# migraciones, compilación y reinicio. Se corre desde la carpeta del proyecto:
#   deploy/update.sh
# (Lo mismo que la "rutina después de cada git pull" de docs/estado.md, más el backup y el build.)

set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

step "1/5 Copia de la base, por si algo sale mal"
scripts/backup-db.sh

step "2/5 Código nuevo"
git pull --ff-only

step "3/5 Dependencias y migraciones"
npm ci
npx prisma migrate deploy

step "4/5 Compilación"
npm run build

step "5/5 Reinicio"
sudo systemctl restart salt
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3001/login 2>/dev/null && break
  sleep 1
done
curl -fsS -o /dev/null http://127.0.0.1:3001/login && echo "✔ Salt actualizada y andando." ||
  { echo "✗ La app no contesta: journalctl -u salt -n 50" >&2; exit 1; }
