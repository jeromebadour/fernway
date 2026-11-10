#!/usr/bin/env bash
# Proves the newest backup restores (ops/systemd/fernway-restore-test.timer weekly, and by hand). Once the off-box copy
# is set up (ops/offsite.sh), the copy tested is the newest one in R2, downloaded and decrypted, which proves the whole
# way back after losing the box; until then the newest dump on the box. Restores it into a scratch database next to the
# live one, checks every table came back and the restored schema is the live one, prints both row counts, drops the
# scratch database and writes the result for the console (BACKUP_DIR/restore-test.json).
set -euo pipefail
here=$(dirname "$(readlink -f "$0")")
# shellcheck source=offsite.sh
. "$here/offsite.sh"
# shellcheck source=record.sh
. "$here/record.sh"
dir=${BACKUP_DIR:-/srv/fernway/backups}
scratch=fernway_restore_test

db=$(docker ps -q --filter label=com.docker.compose.project=fernway --filter label=com.docker.compose.service=db)
[ -n "$db" ] || { echo "restore test: the database container is not running" >&2; exit 1; }
fetched=""
psql_in() { docker exec -i "$db" psql -X -At -U postgres -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
drop_scratch() { docker exec "$db" dropdb -U postgres --if-exists "$scratch" >/dev/null 2>&1 || true; }
# On the way out: the scratch database goes, and so does the downloaded copy (never before the restore has read it).
# Recorded for the status page whatever happens: a run that stops early (no copy to fetch) counts as a failed one.
recorded=false
cleanup() {
  rc=$?
  drop_scratch; [ -z "$fetched" ] || rm -f "$fetched" "$fetched.age"
  $recorded || record_run "$db" restore_test false "stopped before the restore finished (exit $rc)"
}
trap cleanup EXIT
if offsite_ready; then
  install -d -m 700 "$dir"
  fetched="$dir/.restore-test-offsite.dump"
  copy=$(offsite_fetch_newest "$fetched") || exit 1
  dump=$fetched
  from=offsite
else
  dump=$(find "$dir" -maxdepth 1 -name 'fernway-*.dump' -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
  [ -n "$dump" ] || { echo "restore test: no backup in $dir" >&2; exit 1; }
  copy=$(basename "$dump")
  from=box
fi


start=$(date +%s%N)
drop_scratch
docker exec "$db" createdb -U postgres "$scratch"
ok=true
# A restore that fails is still recorded (the console flags it), so it doesn't stop the script here.
if ! docker exec -i "$db" pg_restore -U postgres -d "$scratch" --exit-on-error < "$dump"; then ok=false; fi
ms=$(( ($(date +%s%N) - start) / 1000000 ))
seconds=$((ms / 1000)).$(( (ms % 1000) / 100 ))

tables="accounts routes shipments scans ghl_connections api_keys schema_migrations"
echo "restore test: $copy (from $( [ "$from" = offsite ] && echo "off the box" || echo "the box")) into $scratch in $seconds s"
printf '  %-18s %10s %10s\n' table live restored
for t in $tables; do
  live=$(psql_in fernway "select count(*) from $t")
  back=$(psql_in "$scratch" "select count(*) from $t" 2>/dev/null) || { back=missing; ok=false; }
  printf '  %-18s %10s %10s\n' "$t" "$live" "$back"
done
live_schema=$(psql_in fernway "select max(name) from schema_migrations")
back_schema=$(psql_in "$scratch" "select max(name) from schema_migrations" 2>/dev/null) || back_schema=missing
[ "$live_schema" = "$back_schema" ] || ok=false
# A database with accounts must not come back empty (an empty one restores to empty).
if [ "$(psql_in fernway "select count(*) from accounts")" -ge 1 ]; then
  [ "$(psql_in "$scratch" "select count(*) from accounts" 2>/dev/null || echo 0)" -ge 1 ] || ok=false
fi
echo "  schema: live $live_schema, restored $back_schema"

printf '{"at": "%s", "seconds": %s, "ok": %s, "dump": "%s", "from": "%s"}\n' "$(date -u +%FT%TZ)" "$seconds" "$ok" "$copy" "$from" > "$dir/restore-test.json"
record_run "$db" restore_test "$ok" "$copy, from $( [ "$from" = offsite ] && echo "off the box" || echo "the box"), restored in $seconds s"
recorded=true
chmod 600 "$dir/restore-test.json"
if $ok; then echo "RESTORE OK"; else echo "RESTORE FAILED"; exit 1; fi
