#!/usr/bin/env bash
# The off-box copy of Fernway's backups, sourced by ops/backup.sh and ops/restore-test.sh (as root on the box).
#
# Each dump is encrypted on the box with age before it leaves, so the copy in Cloudflare R2 can't be read there; only
# the box's key (/srv/fernway/offsite-age.key, root only, with a copy on the owner's own computer) opens it. The R2 key in
# /srv/fernway/offsite.env (root only) works on one bucket only, from the box's address only.
#
# Off unless /srv/fernway/offsite.env exists. Tests point OFFSITE_REMOTE at a folder instead (":local:/tmp/offsite").

offsite_env=${OFFSITE_ENV:-/srv/fernway/offsite.env}
offsite_key=${OFFSITE_KEY:-/srv/fernway/offsite-age.key}
offsite_keep_days=30

# Sets $offsite_remote and the rclone settings; returns 1 (and does nothing) when off-box copies aren't set up.
offsite_ready() {
  if [ -n "${OFFSITE_REMOTE:-}" ]; then
    offsite_remote=$OFFSITE_REMOTE
  elif [ -f "$offsite_env" ]; then
    # shellcheck disable=SC1090
    . "$offsite_env"
    : "${R2_ACCESS_KEY_ID:?offsite.env has no R2_ACCESS_KEY_ID}" "${R2_SECRET_ACCESS_KEY:?offsite.env has no R2_SECRET_ACCESS_KEY}" "${R2_ENDPOINT:?offsite.env has no R2_ENDPOINT}"
    export RCLONE_S3_PROVIDER=Cloudflare RCLONE_S3_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID RCLONE_S3_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
    export RCLONE_S3_ENDPOINT=$R2_ENDPOINT RCLONE_S3_NO_CHECK_BUCKET=true
    # No read-back after an upload: rclone 1.60 (Ubuntu's) reads the object back by version id, which R2 answers with
    # 501 Not Implemented, so every first attempt failed and only the retry passed. The size is checked below instead.
    export RCLONE_S3_NO_HEAD=true
    offsite_remote=":s3:${R2_BUCKET:-jeromebadour-backups}/fernway"
  else
    return 1
  fi
  if ! command -v rclone >/dev/null || ! command -v age >/dev/null; then echo "offsite: rclone and age must be installed" >&2; exit 1; fi
  [ -f "$offsite_key" ] || { echo "offsite: no key at $offsite_key" >&2; exit 1; }
  return 0
}

# Encrypts one dump and uploads it, drops copies older than 30 days, writes BACKUP_DIR/offsite.json for the console.
# The third argument is the kind of file (fernway by default; n8n for n8n's nightly export), whose copies are counted and
# dropped on their own.
# Every step is checked on its own (not left to set -e, which callers may switch off): a failure is recorded for the
# console (it flags it) and returns 1; the local dump is already kept either way.
offsite_upload() {
  local dump=$1 dir=$2 kind=${3:-fernway} enc bytes count
  enc="$dir/.$(basename "$dump").age.part"
  offsite_record() {
    printf '{"at": "%s", "ok": %s, "name": "%s", "bytes": %s, "count": %s, "keepDays": %s}\n' \
      "$(date -u +%FT%TZ)" "$1" "$(basename "$dump").age" "${2:-0}" "${3:-0}" "$offsite_keep_days" > "$dir/offsite.json"
    chmod 600 "$dir/offsite.json"
  }
  offsite_fail() { rm -f "$enc"; offsite_record false; echo "offsite: $1" >&2; return 1; }
  age -r "$(age-keygen -y "$offsite_key")" -o "$enc" "$dump" || { offsite_fail "could not encrypt the dump"; return 1; }
  rclone -q copyto --retries 3 "$enc" "$offsite_remote/$(basename "$dump").age" || { offsite_fail "upload failed"; return 1; }
  bytes=$(stat -c %s "$enc")
  [ "$(rclone -q lsf --format s "$offsite_remote/$(basename "$dump").age")" = "$bytes" ] \
    || { offsite_fail "the copy off the box is not the size of the dump ($bytes bytes)"; return 1; }
  rclone -q delete --min-age "${offsite_keep_days}d" --include "$kind-*.age" "$offsite_remote" || { offsite_fail "could not drop old copies"; return 1; }
  count=$(rclone -q lsf --include "$kind-*.age" "$offsite_remote" | wc -l)
  [ "$count" -ge 1 ] || { offsite_fail "the copy is not there after the upload"; return 1; }
  rm -f "$enc"
  offsite_record true "$bytes" "$count"
  echo "offsite: $(basename "$dump").age $bytes bytes, $count kept off the box"
}

# Downloads the newest off-box copy and decrypts it into $1 (a path); prints the copy's name.
offsite_fetch_newest() {
  local out=$1 name
  name=$(rclone -q lsf --include 'fernway-*.dump.age' "$offsite_remote" | sort | tail -1)
  [ -n "$name" ] || { echo "offsite: no copy off the box yet" >&2; return 1; }
  rclone -q copyto "$offsite_remote/$name" "$out.age" || { echo "offsite: could not download $name" >&2; return 1; }
  age -d -i "$offsite_key" -o "$out" "$out.age" || { echo "offsite: could not decrypt $name" >&2; return 1; }
  rm -f "$out.age"
  chmod 600 "$out"
  echo "$name"
}
