#!/usr/bin/env bash
# Fernway's nightly backup (ops/systemd/fernway-backup.timer, as root on the box; installed by scripts/deploy.sh).
# A custom-format pg_dump of the whole database into BACKUP_DIR (root only), checked before it counts: a dump that
# pg_restore can't list is thrown away and the run fails. Dumps older than 14 days go. Then, once set up, the dump is
# encrypted and copied off the box to Cloudflare R2 (ops/offsite.sh: 30 days kept there). Prints one line per step.
# GHL tokens are in the dump only as sealed values; their key (FERNWAY_TOKEN_KEY) lives in the env file, never here.
set -euo pipefail
here=$(dirname "$(readlink -f "$0")")
# shellcheck source=offsite.sh
. "$here/offsite.sh"
# shellcheck source=record.sh
. "$here/record.sh"
dir=${BACKUP_DIR:-/srv/fernway/backups}
keep_days=14

db=$(docker ps -q --filter label=com.docker.compose.project=fernway --filter label=com.docker.compose.service=db)
[ -n "$db" ] || { echo "backup: the database container is not running" >&2; exit 1; }

install -d -m 700 "$dir"
name="fernway-$(date -u +%Y%m%d-%H%M%S).dump"
part="$dir/.$name.part"
# Every run is recorded for the status page, a failed one too (its reason is in the run's own log).
# The backup is recorded once its dump is kept; the off-box copy separately. A run that stops before the dump is kept
# is recorded as a failed backup by the exit trap.
kept=false
finish() { rc=$?; rm -f "$part"; $kept || record_run "$db" backup false "failed (exit $rc), reason in the backup's log"; }
trap finish EXIT

docker exec "$db" pg_dump -U postgres -d fernway --format=custom > "$part"
# The check: pg_restore must be able to read the whole table of contents back.
docker exec -i "$db" pg_restore --list < "$part" > /dev/null || { echo "backup: the dump can't be read back" >&2; exit 1; }
chmod 600 "$part"
mv "$part" "$dir/$name"

find "$dir" -maxdepth 1 -name 'fernway-*.dump' -mmin +$((keep_days * 24 * 60)) -delete
done_note="$name, $(stat -c %s "$dir/$name") bytes, $(find "$dir" -maxdepth 1 -name 'fernway-*.dump' | wc -l) kept"
echo "backup: $done_note"
record_run "$db" backup true "$done_note"
kept=true

if offsite_ready; then
  if offsite_upload "$dir/$name" "$dir"; then
    record_run "$db" offsite true "$name.age copied off the box"
  else
    record_run "$db" offsite false "$name.age could not be copied off the box"
    exit 1
  fi
fi
