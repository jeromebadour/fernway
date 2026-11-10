#!/usr/bin/env bash
# Sourced by ops/backup.sh and ops/restore-test.sh: records one run (pass or fail) in the ops_runs table, so the status
# page shows it. Written as the database owner inside the db container; values passed as psql variables, quoted by psql.
# A failure to record never changes the run's own result: it is printed, and the status page then shows the last run
# as late.
record_run() { # <db container> <kind: backup|offsite|restore_test> <true|false> <detail>
  echo "insert into ops_runs (kind, ok, detail) values (:'kind', :'ok', left(:'detail', 300));" \
    | docker exec -i "$1" psql -X -q -U postgres -d fernway -v ON_ERROR_STOP=1 -v kind="$2" -v ok="$3" -v detail="$4" >/dev/null \
    || echo "could not record the $2 run for the status page" >&2
}
