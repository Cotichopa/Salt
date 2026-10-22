#!/usr/bin/env bash
# Corre un comando con el Node de nvm (la versión "default" del usuario). Lo usan los servicios de
# systemd y deploy/update.sh: systemd no lee ~/.bashrc, así que por su cuenta no ve el Node de nvm.
#   deploy/with-node.sh node_modules/.bin/next start -H 0.0.0.0 -p 3001
#
# Para cambiar de versión de Node (con el usuario de la app):
#   nvm install 24 && nvm alias default 24
#   deploy/update.sh      (reinstala las dependencias con el Node nuevo, arma y reinicia)

# Sin `set -u`: nvm.sh no lo soporta.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh" --no-use || { echo "No encuentro nvm en $NVM_DIR" >&2; exit 1; }
nvm use --silent default > /dev/null ||
  { echo "nvm no tiene versión por defecto: nvm alias default 24" >&2; exit 1; }
exec "$@"
