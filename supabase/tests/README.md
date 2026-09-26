# Database tests

Tools for checking the migrations in `supabase/migrations/` without Docker.

## Rebuild the database locally

Needs a local PostgreSQL (16 or newer) and `psql`.

```bash
createdb shaadigpt_test
psql -d shaadigpt_test -f supabase/tests/platform_stub.sql
psql -d shaadigpt_test -c 'create extension "uuid-ossp" with schema extensions; create extension pgcrypto with schema extensions;'
psql -d shaadigpt_test -c 'alter database shaadigpt_test set search_path = "$user", public, extensions;'
for f in supabase/migrations/*.sql; do
  # pg_cron and pg_net only exist on Supabase
  grep -vE '^create extension if not exists (pg_cron|pg_net)' "$f" | psql -v ON_ERROR_STOP=1 -d shaadigpt_test
done
```

`platform_stub.sql` stands in for the parts of Supabase the migrations rely on:
the `anon` / `authenticated` / `service_role` roles, a minimal `auth.users`
table with Supabase's `auth.uid()` / `auth.jwt()`, the `storage` tables, the
realtime publication and Supabase's default grants.

## Compare with the live database

`schema_checksums.sql` prints one checksum per kind of object (columns,
constraints, indexes, functions and their permissions, triggers, views,
policies, row-level security, grants, realtime tables, storage buckets). Run it
on the local rebuild and on the live project (Supabase SQL editor): every row
should match. It matched on 2026-09-26, right after
`20260926133139_close_public_data_exposure`.
