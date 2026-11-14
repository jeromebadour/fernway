#!/usr/bin/env bash
# Connects the Alder & Pike WordPress to Fernway (as root on the box, after setup.sh and after the routes roof-check and
# callback exist on the account): makes the site its own Fernway API key and writes it straight into WordPress's
# settings through stdin, so the key is never printed, typed or on a command line. Then runs the plugin's own
# connection test: the key is accepted, and the roof-check route has free times from its GHL calendar.
# Usage: connect.sh <fernway account id> [--new]   (--new replaces a working key; revoke the old one with the CLI)
set -euo pipefail
test "$(hostname)" = vmi3464201 || { echo "WRONG BOX"; exit 1; }
here=$(dirname "$(readlink -f "$0")")
account=${1:?usage: connect.sh <fernway account id> [--new]}
[[ "$account" =~ ^[0-9]+$ ]] || { echo "the account is a number, e.g. 1"; exit 1; }
compose=(docker compose -f "$here/compose.yaml" --env-file /srv/alderpike/.env)
wp() { "${compose[@]}" --profile tools run --rm -T cli wp "$@"; }
fernway() { (cd /srv/fernway/app && docker compose --env-file /srv/fernway/.env exec -T worker node apps/worker/dist/cli.js "$@"); }
# What the plugin's Test connection asks: a made-up waybill (404 means the key was accepted), and the route's free times.
test_call='$k = Fernway\Client::call("GET", "/api/v1/leads/FW-00-00000"); $s = Fernway\Client::call("GET", "/api/v1/routes/roof-check/slots");
echo $k["status"], " ", $s["status"], " ", count( (array) ( $s["json"]["slots"] ?? array() ) );'

read -r key_status _ _ <<<"$(wp eval "$test_call")"
if [ "$key_status" = 404 ] && [ "${2:-}" != --new ]; then
  echo "== the saved key already works; nothing changed (--new makes another)"
else
  echo "== a new API key for account $account"
  out=$(fernway apikey "$account" "Alder & Pike WordPress" --wordpress)
  # The first line names the key (its prefix, not the secret); the last line is the key itself.
  head -1 <<<"$out" | sed 's/ It is shown once.*//; s/^/   /'
  tail -1 <<<"$out" | tr -d '\n' | wp option update fernway_api_key --quiet
  unset out
fi

echo "== the plugin's connection test"
read -r key_status slot_status slots <<<"$(wp eval "$test_call")"
[ "$key_status" = 404 ] || { echo "   Fernway refused the key (answer $key_status)"; exit 1; }
echo "   key accepted"
[ "$slot_status" = 200 ] || { echo "   roof-check free times: answer $slot_status (the route and its calendar first)"; exit 1; }
echo "   roof-check: $slots free times"
echo "CONNECTED Alder & Pike to Fernway account $account"
