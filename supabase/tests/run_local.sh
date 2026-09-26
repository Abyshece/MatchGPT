#!/usr/bin/env bash
# Rebuilds the database from supabase/migrations/ in a local PostgreSQL (no
# Docker needed), loads test data and runs security_tests.sh.
#
#   supabase/tests/run_local.sh               # all migrations
#   UP_TO=20260926133139 supabase/tests/run_local.sh   # stop after that version
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${DB:-shaadigpt_test}
UP_TO=${UP_TO:-99999999999999}

# Run psql as the postgres OS user when we're root (e.g. in a container).
if [ "$(id -u)" = 0 ]; then as_pg() { su postgres -c "$*"; }; else as_pg() { bash -c "$*"; }; fi
psql_db() { as_pg "psql -X -q -v ON_ERROR_STOP=1 -d $DB"; }

as_pg "dropdb --if-exists $DB" >/dev/null
as_pg "createdb $DB"
psql_db < supabase/tests/platform_stub.sql 2>/dev/null
psql_db <<SQL
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
alter database $DB set search_path = "\$user", public, extensions;
SQL

for f in supabase/migrations/*.sql; do
  version=$(basename "$f" | cut -d_ -f1)
  [[ $version > $UP_TO ]] && continue
  echo "applying $(basename "$f")"
  # pg_cron and pg_net only exist on Supabase
  grep -vE '^create extension if not exists (pg_cron|pg_net)' "$f" | psql_db
done

psql_db < supabase/tests/test_data.sql
echo
DB=$DB supabase/tests/security_tests.sh
