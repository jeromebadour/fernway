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

# n8n (integrations/n8n), when it runs on the box: its workflows and its credentials (still encrypted with its own
# N8N_ENCRYPTION_KEY, which stays in /srv/n8n/.env) exported nightly, kept 14 days, and copied off the box like the dump.
# Its own failure is printed and fails the run, but never touches Fernway's dump above.
n8n=$(docker ps -q --filter label=com.docker.compose.project=n8n --filter label=com.docker.compose.service=n8n)
if [ -n "$n8n" ]; then
  ndir=${N8N_BACKUP_DIR:-/srv/n8n/backups}
  install -d -m 700 "$ndir"
  nname="n8n-$(date -u +%Y%m%d-%H%M%S).tar"
  # n8n's export stops with an error when there is nothing to export: a new n8n with no workflow yet is not a failure.
  if [ "$(docker exec "$n8n" n8n list:workflow 2>/dev/null | grep -c '|')" = 0 ]; then
    echo "backup: n8n has no workflows yet, nothing to export"
  else
  docker exec "$n8n" sh -c 'rm -rf /tmp/n8n-export && mkdir -p /tmp/n8n-export/workflows /tmp/n8n-export/credentials \
    && n8n export:workflow --all --separate --output=/tmp/n8n-export/workflows/ >/dev/null \
    && { n8n export:credentials --all --separate --output=/tmp/n8n-export/credentials/ >/dev/null 2>&1 || true; } \
    && tar -C /tmp/n8n-export -cf - . && rm -rf /tmp/n8n-export' > "$ndir/.$nname.part" \
    || { rm -f "$ndir/.$nname.part"; echo "backup: n8n could not export its workflows" >&2; exit 1; }
  tar -tf "$ndir/.$nname.part" | grep -q '^./workflows/.' || { rm -f "$ndir/.$nname.part"; echo "backup: n8n's export has no workflows" >&2; exit 1; }
  chmod 600 "$ndir/.$nname.part"
  mv "$ndir/.$nname.part" "$ndir/$nname"
  find "$ndir" -maxdepth 1 -name 'n8n-*.tar' -mmin +$((keep_days * 24 * 60)) -delete
  echo "backup: $nname, $(stat -c %s "$ndir/$nname") bytes, $(tar -tf "$ndir/$nname" | grep -c '^./workflows/.') workflows"
  if offsite_ready; then offsite_upload "$ndir/$nname" "$ndir" n8n || exit 1; fi
  fi
fi
# Alder & Pike, the WordPress demo (integrations/wordpress/box), when it runs on the box: its own script.
"$here/backup-alderpike.sh"
