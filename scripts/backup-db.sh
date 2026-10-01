#!/usr/bin/env bash
# Copia de seguridad de la base de Salt (la corre un timer de systemd todas las noches: ver
# deploy/salt-backup.timer y "Backups" en el README). También se puede correr a mano:
#   npm run db:backup
#
# Guarda una copia por día en $BACKUP_DIR/diario (las últimas 14) y la primera de cada mes en
# $BACKUP_DIR/mensual (las últimas 12). Se cuentan archivos, no días: si la VM estuvo apagada una
# semana, las copias viejas no se pierden por eso.
#
# Se conecta con el DATABASE_URL del .env. Necesita pg_dump de la misma versión de PostgreSQL que
# la base (o más nueva).

set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/salt-backups}"
KEEP_DAILY=14
KEEP_MONTHLY=12

# DATABASE_URL sin comillas y sin "?schema=public" (eso es de Prisma; pg_dump no lo entiende)
url=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d "\"'")
url="${url%%\?*}"
if [ -z "$url" ]; then
  echo "No encontré DATABASE_URL en el .env" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/diario" "$BACKUP_DIR/mensual"
chmod 700 "$BACKUP_DIR" # tiene los gastos de todos: solo lo lee el usuario dueño

today=$(date +%F)       # 2026-10-01
month=$(date +%Y-%m)    # 2026-10
file="$BACKUP_DIR/diario/salt-$today.dump"

# Se escribe a un archivo temporal y se renombra al final: si pg_dump falla a la mitad, no queda
# una copia rota con nombre de buena (ni pisa la de hoy si ya había una).
# -Fc = formato "custom": comprimido, y pg_restore puede restaurarlo entero o por partes.
tmp="$file.tmp"
trap 'rm -f "$tmp"' EXIT
pg_dump -Fc --no-owner --no-privileges -f "$tmp" "$url"
pg_restore --list "$tmp" > /dev/null # chequeo: que se pueda leer
mv "$tmp" "$file"

# La primera copia de cada mes también va a mensual/
monthly="$BACKUP_DIR/mensual/salt-$month.dump"
[ -e "$monthly" ] || cp "$file" "$monthly"

# Borra las que sobran (los nombres llevan la fecha, así que ordenar por nombre = ordenar por fecha)
prune() {
  ls -1 "$1"/salt-*.dump 2>/dev/null | sort -r | tail -n +"$(($2 + 1))" | xargs -r rm --
}
prune "$BACKUP_DIR/diario" "$KEEP_DAILY"
prune "$BACKUP_DIR/mensual" "$KEEP_MONTHLY"

echo "Backup listo: $file ($(du -h "$file" | cut -f1))"
