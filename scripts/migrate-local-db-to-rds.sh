#!/usr/bin/env bash
set -euo pipefail

# Migrates data from a source Postgres database to a target Postgres database.
# Example:
#   SOURCE_DB_URL='postgresql://user:pass@localhost:5432/rnr_electrical?schema=public' \
#   TARGET_DB_URL='postgresql://admin:pass@rds-host:5432/rnr_electrical?schema=public' \
#   ./scripts/migrate-local-db-to-rds.sh

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump not found. Install PostgreSQL client tools first."
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "Error: pg_restore not found. Install PostgreSQL client tools first."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql not found. Install PostgreSQL client tools first."
  exit 1
fi

SOURCE_DB_URL="${SOURCE_DB_URL:-}"
TARGET_DB_URL="${TARGET_DB_URL:-}"
BACKUP_FILE="${BACKUP_FILE:-./tmp/rnr-backup.dump}"

strip_prisma_schema_param() {
  local raw_url="$1"
  local cleaned_url

  # Prisma commonly appends ?schema=public, which pg_dump/psql reject.
  cleaned_url="$(echo "$raw_url" | sed -E 's/([?&])schema=[^&]*(&|$)/\1/g')"
  cleaned_url="$(echo "$cleaned_url" | sed -E 's/\?&/?/g; s/[?&]$//')"

  echo "$cleaned_url"
}

if [[ -z "$SOURCE_DB_URL" || -z "$TARGET_DB_URL" ]]; then
  echo "Error: SOURCE_DB_URL and TARGET_DB_URL are required."
  exit 1
fi

PG_SOURCE_DB_URL="$(strip_prisma_schema_param "$SOURCE_DB_URL")"
PG_TARGET_DB_URL="$(strip_prisma_schema_param "$TARGET_DB_URL")"

mkdir -p "$(dirname "$BACKUP_FILE")"

echo "[1/4] Creating backup from source database..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  --file "$BACKUP_FILE" \
  "$PG_SOURCE_DB_URL"

echo "[2/4] Verifying target connectivity..."
psql "$PG_TARGET_DB_URL" -c "SELECT version();" >/dev/null

echo "[3/4] Restoring into target database (cleaning existing objects)..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  --dbname "$PG_TARGET_DB_URL" \
  "$BACKUP_FILE"

echo "[4/4] Running Prisma migrations metadata sync check..."
npx prisma migrate status --schema ./prisma/schema.prisma || true

echo "Done. Data migration completed. Backup file: $BACKUP_FILE"
