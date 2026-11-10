#!/usr/bin/env bash
# Deploys one commit of Fernway on the Freelance box. Run as root:
#
#   /srv/fernway/app/scripts/deploy.sh <commit>          deploy it
#   /srv/fernway/app/scripts/deploy.sh <commit> --check  only say whether it may be deployed
#
# It refuses unless: this is the Freelance box, the commit is on main, and CI passed on it (both jobs, read from
# GitHub). Then it moves the checkout forward to that commit, builds and starts it, waits until every part is healthy
# (database, queue, web, worker, all on this commit) and checks the public site. The build log goes to
# /srv/fernway/deploy-logs/. The running version is only replaced once the new images have built; a failed build
# leaves it untouched. Last, it installs the box's tools (ops/: nightly backup, weekly restore test) and their timers.
#
# The whole script lives in main(), which bash reads in full before running anything: the deploy moves this very file
# forward, and a script edited while it runs must not pick up the new lines halfway.

main() {
  set -uo pipefail
  local box=vmi3464201 app=/srv/fernway/app env=/srv/fernway/.env logs=/srv/fernway/deploy-logs
  local repo=jeromebadour/fernway site=https://fernway.jeromebadour.com tools=/opt/sites/tools/fernway

  stop() { echo "STOPPED: $*"; exit 1; }
  as_app() { sudo -u fernway git -C "$app" "$@"; }

  [ "$(hostname)" = "$box" ] || stop "this is $(hostname), not the Freelance box ($box)"
  [ "$(id -u)" = 0 ] || stop "run it as root"
  [ $# -ge 1 ] || stop "which commit? e.g. scripts/deploy.sh 6e4c52e"
  local want=$1 only_check=${2:-}

  echo "== fetching"
  as_app fetch --quiet origin main || stop "git fetch failed"
  local sha
  sha=$(as_app rev-parse --verify --quiet "$want^{commit}") || stop "no commit $want on GitHub"
  as_app merge-base --is-ancestor "$sha" origin/main || stop "$want is not on main"
  local short=${sha:0:7}
  local live
  live=$(docker inspect -f '{{.Config.Image}}' "$(docker compose --env-file "$env" -f "$app/compose.yaml" ps -q web 2>/dev/null)" 2>/dev/null)
  echo "   live now: ${live:-nothing running}   asked: $short"

  echo "== CI on $short"
  local ci
  ci=$(curl -fsS "https://api.github.com/repos/$repo/commits/$sha/check-runs" | python3 -c '
import json, sys
runs = json.load(sys.stdin)["check_runs"]
for r in runs: print("   " + r["name"] + ": " + r["status"] + " " + (r["conclusion"] or ""))
ok = len(runs) >= 2 and all(r["status"] == "completed" and r["conclusion"] == "success" for r in runs)
print("PASSED" if ok else "NOT PASSED")') || stop "could not read CI from GitHub"
  echo "$ci" | grep -v '^PASSED$\|^NOT PASSED$'
  [ "$(echo "$ci" | tail -1)" = PASSED ] || stop "CI has not passed on $short: nothing deployed"
  echo "   passed"

  if [ "$only_check" = --check ]; then echo "OK: $short may be deployed (nothing changed)"; exit 0; fi

  echo "== moving the checkout to $short"
  local before
  before=$(sha256sum < "$app/scripts/deploy.sh")
  as_app merge --ff-only --quiet "$sha" || stop "could not move forward to $short (local changes on the box?)"
  [ "$(as_app rev-parse HEAD)" = "$sha" ] || stop "checkout is not at $short"
  # This file may have moved forward with the checkout. The copy running now is the old one, so it would skip any step
  # the new one adds: hand over to the new copy, once, and let it do the whole deploy.
  if [ -z "${DEPLOY_HANDED_OVER:-}" ] && [ "$(sha256sum < "$app/scripts/deploy.sh")" != "$before" ]; then
    echo "   this deploy script changed in $short: continuing with the new one"
    DEPLOY_HANDED_OVER=1 exec bash "$app/scripts/deploy.sh" "$@"
  fi

  mkdir -p "$logs"
  local log
  log="$logs/$(date -u +%Y%m%d-%H%M)-$short.log"
  echo "== building and starting (a few minutes; log: $log)"
  cd "$app" || stop "no $app"
  # The changelog page is built from the git history, which never enters the image (apps/web/scripts/changelog.mjs).
  as_app log --format='%H%x1f%cI%x1f%s%x1f%b%x1e' > "$app/apps/web/changelog.txt" || stop "could not read the git history for the changelog"
  APP_COMMIT=$short docker compose --env-file "$env" up -d --build 2>&1 | tee "$log"
  [ "${PIPESTATUS[0]}" = 0 ] || stop "build or start failed (see $log); the running version was not replaced if the build failed"

  echo "== waiting for every part to be healthy"
  local id state=""
  id=$(docker compose --env-file "$env" ps -q web)
  for _ in $(seq 1 40); do
    state=$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null)
    echo "   web: $state"
    [ "$state" = healthy ] && break
    [ "$state" = unhealthy ] && break
    sleep 3
  done
  [ "$state" = healthy ] || stop "not healthy: curl -s http://127.0.0.1:3103/api/health says what is down"

  local web worker code
  web=$(docker inspect -f '{{.Config.Image}}' "$id")
  worker=$(docker inspect -f '{{.Config.Image}}' "$(docker compose --env-file "$env" ps -q worker)")
  [ "$web" = "fernway-web:$short" ] || stop "web runs $web, expected fernway-web:$short"
  [ "$worker" = "fernway-worker:$short" ] || stop "worker runs $worker, expected fernway-worker:$short"
  # Through this box's own Nginx and certificate, pinned to this box: the check never depends on the box's DNS cache.
  code=$(curl -s -o /dev/null -w '%{http_code}' --resolve "${site#https://}:443:127.0.0.1" "$site/api/health")
  [ "$code" = 200 ] || stop "$site/api/health answered $code"
  # The status page shows what is live and since when.
  # shellcheck source=../ops/record.sh
  . "$app/ops/record.sh"
  record_run "$(docker compose --env-file "$env" ps -q db)" deploy true "$short"

  echo "== the box's tools and timers"
  install -d -m 755 "$tools"
  install -m 755 "$app/ops/backup.sh" "$app/ops/restore-test.sh" "$tools/" || stop "could not install the backup tools"
  install -m 644 "$app/ops/offsite.sh" "$app/ops/record.sh" "$tools/" || stop "could not install the backup tools"
  install -m 644 "$app"/ops/systemd/fernway-*.service "$app"/ops/systemd/fernway-*.timer /etc/systemd/system/ \
    || stop "could not install the timers"
  systemctl daemon-reload || stop "systemd would not reload"
  systemctl enable --now --quiet fernway-backup.timer fernway-restore-test.timer || stop "the backup timers would not start"
  echo "   next backup $(systemctl show fernway-backup.timer -p NextElapseUSecRealtime --value)"
  echo "   next restore test $(systemctl show fernway-restore-test.timer -p NextElapseUSecRealtime --value)"

  echo "DEPLOYED $short: $web and $worker healthy, $site/api/health 200"
}

main "$@"; exit
