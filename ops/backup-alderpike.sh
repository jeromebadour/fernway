#!/usr/bin/env bash
# Alder & Pike (integrations/wordpress/box), when it runs on the box: the WordPress database and the uploads folder,
# nightly, kept 14 days, copied off the box like the dump. WordPress itself, the theme and the plugin are not in it:
# the image and the Fernway repo bring them back. The dump counts only once it reads back whole and holds WordPress's
# own tables. Its failure fails backup.sh's run, but comes after Fernway's dump is kept.
# Called by backup.sh after Fernway's own dump and n8n's export; runs alone too (CI does). Nothing to do, and no failure,
# when the site isn't running.
set -euo pipefail
here=$(dirname "$(readlink -f "$0")")
# shellcheck source=offsite.sh
. "$here/offsite.sh"
keep_days=14
wpdb=$(docker ps -q --filter label=com.docker.compose.project=alderpike --filter label=com.docker.compose.service=db)
[ -n "$wpdb" ] || exit 0
wdir=${ALDERPIKE_BACKUP_DIR:-/srv/alderpike/backups}
install -d -m 700 "$wdir"
wname="alderpike-$(date -u +%Y%m%d-%H%M%S).tar"
wpart="$wdir/.$wname.d"
rm -rf "$wpart"; install -d -m 700 "$wpart"
# The root password stays inside the container: the dump runs there, with the container's own environment.
docker exec "$wpdb" sh -c 'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines --databases wp' \
  | gzip > "$wpart/wp.sql.gz" || { rm -rf "$wpart"; echo "backup: Alder & Pike's database could not be dumped" >&2; exit 1; }
gzip -t "$wpart/wp.sql.gz" && zgrep -q '^CREATE TABLE `wp_options`' "$wpart/wp.sql.gz" \
  && zcat "$wpart/wp.sql.gz" | tail -1 | grep -q '^-- Dump completed' \
  || { rm -rf "$wpart"; echo "backup: Alder & Pike's dump is not whole" >&2; exit 1; }
tar -C /srv/alderpike/html/wp-content -czf "$wpart/uploads.tar.gz" uploads 2>/dev/null \
  || tar -czf "$wpart/uploads.tar.gz" --files-from /dev/null
tar -C "$wpart" -cf "$wdir/.$wname.part" wp.sql.gz uploads.tar.gz && rm -rf "$wpart"
chmod 600 "$wdir/.$wname.part"
mv "$wdir/.$wname.part" "$wdir/$wname"
find "$wdir" -maxdepth 1 -name 'alderpike-*.tar' -mmin +$((keep_days * 24 * 60)) -delete
echo "backup: $wname, $(stat -c %s "$wdir/$wname") bytes, $(find "$wdir" -maxdepth 1 -name 'alderpike-*.tar' | wc -l) kept"
if offsite_ready; then offsite_upload "$wdir/$wname" "$wdir" alderpike; fi
