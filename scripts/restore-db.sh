#!/usr/bin/env bash
# Vuelve a cargar una copia de seguridad hecha con backup-db.sh.
#   npm run db:restore -- ~/salt-backups/diario/salt-2026-10-01.dump
#
# ⚠️ REEMPLAZA todo lo que hay en la base por lo de la copia: lo cargado después se pierde.
# Antes, frenar la app (que nadie cargue nada mientras tanto) y después volver a arrancarla.
#
# Para probar una copia sin tocar la base de verdad, pasar otra base como segundo parámetro
# (tiene que existir y estar vacía):
#   npm run db:restore -- <archivo> postgresql://salt:clave@localhost:5432/salt_prueba

set -euo pipefail

cd "$(dirname "$0")/.."
file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Uso: npm run db:restore -- <archivo .dump> [base de destino]" >&2
  exit 1
fi

url="${2:-$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d "\"'")}"
url="${url%%\?*}" # sin "?schema=public" (es de Prisma)

pg_restore --list "$file" > /dev/null # que la copia se pueda leer antes de borrar nada

echo "Se va a reemplazar TODO el contenido de la base ${url##*/} por la copia $(basename "$file")."
read -r -p "Escribí SI (en mayúsculas) para seguir: " answer
if [ "$answer" != "SI" ]; then
  echo "Cancelado: no se tocó nada."
  exit 1
fi

# --clean --if-exists: borra cada tabla antes de crearla de nuevo con los datos de la copia.
# --single-transaction: si algo falla, no se aplica nada (la base queda como estaba).
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -d "$url" "$file"
echo "Listo: la base quedó como en la copia $(basename "$file"). Arrancá la app de nuevo."
