#!/bin/sh
# Applies the migrations that haven't run yet, each in its own transaction with its record in schema_migrations, so a
# deploy can run this every time. Then sets fernway_app's password from the environment (never stored in git).
# Runs in the postgres image as the database owner: PGHOST, PGUSER, PGPASSWORD, PGDATABASE, FERNWAY_APP_PASSWORD.
set -eu

: "${FERNWAY_APP_PASSWORD:?FERNWAY_APP_PASSWORD is not set}"
export PGOPTIONS="-c client_min_messages=warning"
run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

run -c "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
for file in "${MIGRATIONS:-/db/migrations}"/*.sql; do
  name=$(basename "$file")
  case "$name" in *[!a-z0-9_.-]*) echo "bad migration name: $name"; exit 1 ;; esac
  if [ "$(psql -X -At -c "select 1 from schema_migrations where name = '$name'")" = "1" ]; then
    continue
  fi
  echo "applying $name"
  run -1 -f "$file" -c "insert into schema_migrations (name) values ('$name')"
done

# psql fills :'pw' in from -v only for commands read from a file or stdin, quoted safely.
echo "alter role fernway_app password :'pw';" | run -v pw="$FERNWAY_APP_PASSWORD"
echo "migrations up to date: $(psql -X -At -c 'select count(*) from schema_migrations') applied"
