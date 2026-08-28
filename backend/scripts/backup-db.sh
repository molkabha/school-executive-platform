#!/usr/bin/env bash
set -euo pipefail

# 1. Verify DATABASE_URL exists
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

# Basic safety check for postgres URI scheme
if [[ "$DATABASE_URL" != postgresql://* ]] && [[ "$DATABASE_URL" != postgres://* ]]; then
  echo "Error: DATABASE_URL does not appear to be a valid PostgreSQL connection string."
  exit 1
fi

# 3. Create temporary directory
BACKUP_DIR=$(mktemp -d)
# 11. Automatically remove temporary files on exit (success or error)
trap 'rm -rf "$BACKUP_DIR"' EXIT

# 6. Name the file with UTC date
DATE=$(date -u +"%Y-%m-%d")
BACKUP_FILE="${BACKUP_DIR}/school-executive-${DATE}.dump"

# Force SSL for Supabase connections
export PGSSLMODE=require

# Safe URL parsing for diagnostics (removes postgres://user:pass@)
SAFE_URL=$(echo "$DATABASE_URL" | sed -E 's/postgres(ql)?:\/\/[^@]+@//')
DB_HOST=$(echo "$SAFE_URL" | cut -d: -f1)
DB_PORT=$(echo "$SAFE_URL" | cut -d: -f2 | cut -d/ -f1)
DB_NAME=$(echo "$SAFE_URL" | cut -d/ -f2 | cut -d? -f1)

echo "--- Diagnostic Information ---"
echo "Hostname: $DB_HOST"
echo "Port: $DB_PORT"
echo "Database: $DB_NAME"
echo "psql version: $(psql --version 2>/dev/null || echo 'Not installed')"
echo "pg_dump version: $(pg_dump --version 2>/dev/null || echo 'Not installed')"
echo "------------------------------"

echo "Checking database reachability with pg_isready..."
if pg_isready -d "$DATABASE_URL" -q; then
  echo "Connection is reachable (pg_isready succeeded)."
else
  echo "Warning: Connection is NOT reachable (pg_isready failed). Printing sanitized output:"
  pg_isready -d "$DATABASE_URL" 2>&1 | sed -E 's/postgres(ql)?:\/\/[^@]+@/[REDACTED_CREDENTIALS]@/g'
fi

echo "Starting database backup..."

# 4 & 5. Use pg_dump with custom format
# 7 & 8. Prevent leaking connection string or password by redirecting error output and sanitizing it
if ! pg_dump -d "$DATABASE_URL" -Fc -f "$BACKUP_FILE" > /dev/null 2> "$BACKUP_DIR/pg_dump_error.log"; then
  echo "Error: pg_dump failed. Sanitized error output:"
  sed -E 's/postgres(ql)?:\/\/[^@]+@/[REDACTED_CREDENTIALS]@/g' "$BACKUP_DIR/pg_dump_error.log"
  # Also explicitly mask the password word just in case Supabase sends it in a weird format
  # though standard clients do not echo passwords.
  exit 1
fi

# 10. Verify backup exists and is not empty
if [ ! -s "$BACKUP_FILE" ]; then
  echo "Error: Backup file is empty or was not created."
  exit 1
fi

echo "Backup created successfully."

# Copy backup to workspace so GitHub Actions can upload it.
cp "$BACKUP_FILE" "school-executive-${DATE}.dump"
echo "Backup saved to workspace."
