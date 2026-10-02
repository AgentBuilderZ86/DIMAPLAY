#!/usr/bin/env bash
# Runs migrations + SQL RLS tests against a scratch database on plain Postgres.
# Usage: PGURL=postgresql://postgres@localhost:5432 scripts/test-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL="${PGURL:-postgresql://postgres@localhost:5432}"
DB="dimaplay_test_$$"
psql "$PGURL/postgres" -v ON_ERROR_STOP=1 -qc "create database $DB"
trap 'psql "$PGURL/postgres" -qc "drop database if exists $DB with (force)" >/dev/null' EXIT
run() { psql "$PGURL/$DB" -v ON_ERROR_STOP=1 -q -f "$1"; }
run supabase/tests/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do run "$f"; done
for f in supabase/tests/[1-9]*.sql; do echo "== $f"; run "$f"; done
echo "SQL tests passed"
