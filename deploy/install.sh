#!/usr/bin/env bash
# Instala Salt en una VM con Debian 13 y la deja andando: programas, base de datos, .env, Whisper,
# la app como servicio y los backups de cada noche. El HTTPS no va acá: lo hace el nginx de la casa
# (otra máquina), que recibe el dominio y le pasa los pedidos a esta VM por la red (IP:3001).
#
#   deploy/install.sh salt.estilo.com.ar
#
# Se corre desde la carpeta del proyecto ya clonado, con el usuario que va a correr la app (no
# root; tiene que poder usar sudo). Ver "Instalar en el servidor" en el README.
#
# Se puede volver a correr sin romper nada: lo que ya está hecho se saltea (el .env, la base,
# Whisper y el admin no se pisan). Para actualizar la app después de un `git pull`: deploy/update.sh

set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="$(id -un)"
WHISPER_DIR="$HOME/whisper/whisper.cpp"
DB_NAME=salt
DB_USER=salt

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || fail "Falta el dominio. Uso: deploy/install.sh salt.estilo.com.ar"
[ "$(id -u)" -ne 0 ] || fail "No lo corras como root: usá el usuario que va a correr la app (con sudo)."
grep -q '^VERSION_ID="13"' /etc/os-release 2>/dev/null || fail "Este instalador es para Debian 13."
cd "$APP_DIR"

# ---------------------------------------------------------------------------------------------
step "1/7 Programas del sistema (apt)"
# nodejs/npm: Debian 13 trae Node 20.19, lo justo para Prisma 7 (pide 20.19 o más).
# postgresql: Debian 13 trae la 17, la misma que en desarrollo (los backups van y vienen).
# cmake, build-essential y git: para compilar Whisper.
sudo apt-get update
sudo apt-get install -y nodejs npm postgresql postgresql-client git cmake build-essential curl openssl
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)' ||
  fail "Node $(node --version) es viejo: Prisma pide 20.19 o más."
sudo systemctl enable --now postgresql

# ---------------------------------------------------------------------------------------------
step "2/7 Base de datos"
# La contraseña de la base: si ya hay .env se usa la suya; si no, una al azar (va solo al .env).
if [ -f .env ]; then
  DB_PASS="$(grep -E '^DATABASE_URL=' .env | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')"
else
  DB_PASS="$(openssl rand -hex 24)"
fi
psql_admin() { sudo -u postgres psql -v ON_ERROR_STOP=1 -tAq "$@"; }
if [ "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")" = "1" ]; then
  psql_admin -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'"
else
  psql_admin -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'"
fi
if [ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" != "1" ]; then
  psql_admin -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
fi
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"
echo "Base '$DB_NAME' lista (usuario '$DB_USER', solo accesible desde esta VM)."

# ---------------------------------------------------------------------------------------------
step "3/7 Archivo .env"
# Cambia (o agrega) una variable del .env
set_env() {
  local key="$1" value="$2"
  if grep -qE "^$key=" .env; then
    KEY="$key" VALUE="$value" perl -pi -e 's/^\Q$ENV{KEY}\E=.*/$ENV{KEY}=$ENV{VALUE}/' .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}
FIRST_INSTALL=false
if [ -f .env ]; then
  echo "Ya hay un .env: no se toca (solo APP_URL, que sigue al dominio, y Whisper si falta)."
else
  FIRST_INSTALL=true
  # Las POSTGRES_* son de Docker (desarrollo): acá no van
  grep -vE '^(POSTGRES_|# --- Base de datos)' .env.example > .env
  chmod 600 .env # tiene claves: solo lo lee este usuario
  set_env DATABASE_URL "\"$DATABASE_URL\""
  set_env AUTH_SECRET "$(openssl rand -base64 32)"
  set_env WHATSAPP_VERIFY_TOKEN "$(openssl rand -hex 16)"

  echo "Datos de la cuenta de administrador (la primera cuenta de Salt):"
  read -r -p "  Nombre (el que usa Chop): " admin_name
  read -r -p "  Email: " admin_email
  while true; do
    read -r -s -p "  Contraseña (mínimo 8 caracteres): " admin_pass; echo
    read -r -s -p "  Repetila: " admin_pass2; echo
    if [ "${#admin_pass}" -lt 8 ]; then echo "  Es muy corta."
    elif [ "$admin_pass" != "$admin_pass2" ]; then echo "  No coinciden."
    else break; fi
  done
  set_env ADMIN_NAME "$admin_name"
  set_env ADMIN_EMAIL "$admin_email"
  set_env ADMIN_PASSWORD "$admin_pass"
fi
# APP_URL siempre sigue al dominio que se le pasa (si se cambia de dominio, se vuelve a correr esto)
set_env APP_URL "https://$DOMAIN"
grep -qE '^WHISPER_CLI=.+' .env || set_env WHISPER_CLI "$WHISPER_DIR/build/bin/whisper-cli"
grep -qE '^WHISPER_MODEL=.+' .env || set_env WHISPER_MODEL "$WHISPER_DIR/models/ggml-small.bin"
grep -qE '^WHISPER_THREADS=.+' .env || set_env WHISPER_THREADS "$(nproc)"

# ---------------------------------------------------------------------------------------------
step "4/7 Whisper (para los audios de Chop)"
# Compilado para este procesador (GGML_NATIVE). En Proxmox, la VM tiene que tener el tipo de CPU
# "host": si no, no ve las instrucciones AVX2 y Whisper anda varias veces más lento.
grep -qw avx2 /proc/cpuinfo ||
  echo "⚠️  Esta VM no ve AVX2: en Proxmox, poné el tipo de CPU de la VM en \"host\" y volvé a correr esto."
if [ -x "$WHISPER_DIR/build/bin/whisper-cli" ]; then
  echo "Whisper ya está compilado."
else
  mkdir -p "$(dirname "$WHISPER_DIR")"
  [ -d "$WHISPER_DIR" ] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$WHISPER_DIR"
  cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" -DGGML_NATIVE=ON -DCMAKE_BUILD_TYPE=Release
  cmake --build "$WHISPER_DIR/build" -j "$(nproc)" --config Release
fi
[ -f "$WHISPER_DIR/models/ggml-small.bin" ] || bash "$WHISPER_DIR/models/download-ggml-model.sh" small

# ---------------------------------------------------------------------------------------------
step "5/7 La app: dependencias, tablas y compilación"
npm ci
npx prisma migrate deploy
# El seed (admin, categorías y medios iniciales) solo la primera vez: pisa la contraseña del admin.
# Después se borra ADMIN_PASSWORD del .env, así un `npm run db:seed` por error no la pisa.
db_url="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d "\"'")"; db_url="${db_url%%\?*}"
if [ "$(psql "$db_url" -tAc 'SELECT count(*) FROM users')" = "0" ]; then
  npm run db:seed
fi
set_env ADMIN_PASSWORD ""
npm run build

# ---------------------------------------------------------------------------------------------
# Copia una plantilla de deploy/ a su lugar, con el usuario, la carpeta y el dominio de esta VM
install_template() {
  sed -e "s|__USER__|$APP_USER|g" -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__DOMAIN__|$DOMAIN|g" "$1" |
    sudo tee "$2" > /dev/null
}

step "6/7 La app como servicio (arranca sola con la VM)"
install_template deploy/salt.service /etc/systemd/system/salt.service
sudo systemctl daemon-reload
sudo systemctl enable salt
sudo systemctl restart salt

step "7/7 Backups de cada noche y chequeo de cada mañana"
install_template deploy/salt-backup.service /etc/systemd/system/salt-backup.service
sudo cp deploy/salt-backup.timer /etc/systemd/system/salt-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now salt-backup.timer
sudo systemctl start salt-backup.service # una copia ya, para probar
ls -1 "$HOME/salt-backups/diario" | tail -1
# Chequeo de cada mañana: avisa por mail a los superadmins si algo anda mal
install_template deploy/salt-check.service /etc/systemd/system/salt-check.service
sudo cp deploy/salt-check.timer /etc/systemd/system/salt-check.timer
sudo systemctl daemon-reload
sudo systemctl enable --now salt-check.timer

# Antes se instalaba Caddy para el HTTPS; ahora lo hace el nginx de la casa. Si quedó de una
# instalación vieja, se apaga (si no, ocupa los puertos 80 y 443 sin hacer nada).
if systemctl list-unit-files caddy.service > /dev/null 2>&1; then
  sudo systemctl disable --now caddy
fi

# ---------------------------------------------------------------------------------------------
# Esperar a que la app conteste (tarda unos segundos en arrancar)
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3001/login 2>/dev/null && break
  sleep 1
done
if curl -fsS -o /dev/null http://127.0.0.1:3001/login; then
  echo "✔ La app contesta en esta VM."
else
  fail "La app no contesta. Mirá el log: journalctl -u salt -n 50"
fi

step "Listo"
cat <<EOF
Salt quedó instalada en $APP_DIR y corre como el servicio "salt".

Falta, a mano:
  1. En el nginx de la casa: que $DOMAIN (con su HTTPS) le pase los pedidos a
     http://$(hostname -I | awk '{print $1}'):3001, con los encabezados Host, X-Forwarded-Proto y
     X-Forwarded-For (sin el Host, los formularios de la app fallan).
  2. Completar en $APP_DIR/.env lo que no se puede generar (son secretos, nunca van por git):
     - WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET
     - ANTHROPIC_API_KEY, y AI_PARSER_ENABLED=true
     - GMAIL_USER, GMAIL_APP_PASSWORD (mails de "olvidé mi contraseña")
     y después: sudo systemctl restart salt
  3. En Meta, el webhook: https://$DOMAIN/api/whatsapp con este token de verificación:
     $(grep -E '^WHATSAPP_VERIFY_TOKEN=' .env | cut -d= -f2-)
EOF
if $FIRST_INSTALL; then
  echo "  4. Entrar a https://$DOMAIN con $(grep -E '^ADMIN_EMAIL=' .env | cut -d= -f2-) y la contraseña que pusiste."
fi
