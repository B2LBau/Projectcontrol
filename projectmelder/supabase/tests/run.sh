#!/bin/sh
# Test de migraties op een lege lokale PostgreSQL-database.
# Gebruik: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -e
cd "$(dirname "$0")/.."
DB=projectmelder_test
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/supabase_stub.sql
for f in migrations/*.sql; do
  echo "migratie: $f"
  # pg_net/pg_cron zijn lokaal nagebootst in supabase_stub.sql
  sed '/create extension if not exists pg_\(net\|cron\)/d' "$f" | psql -q -v ON_ERROR_STOP=1 -d $DB
done
psql -q -v ON_ERROR_STOP=1 -d $DB -f tests/scenario.sql
