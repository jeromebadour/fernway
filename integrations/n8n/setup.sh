#!/usr/bin/env bash
# Sets up or updates n8n on Fernway's box (as root; from the deployed app: /srv/fernway/app/integrations/n8n/setup.sh).
# Idempotent. Makes /srv/n8n (root only; data owned by n8n's user 1000) and its env file with a fresh encryption key
# the first time only; pulls the pinned n8n image and records its digest; starts n8n on the box only (127.0.0.1:3104);
# the first time, makes its owner from a hidden prompt, through n8n's own setup call on the box, so the setup page is
# never open to the internet; only then installs the Nginx site and the certificate. Prints one line per step.
set -euo pipefail
test "$(hostname)" = vmi3464201 || { echo "WRONG BOX"; exit 1; }
here=$(dirname "$(readlink -f "$0")")
version=2.47.5
env=/srv/n8n/.env
domain=n8n.jeromebadour.com
compose=(docker compose -f "$here/compose.yaml" --env-file "$env")

echo "== folders"
install -d -m 700 /srv/n8n /srv/n8n/backups
install -d -o 1000 -g 1000 -m 700 /srv/n8n/data
if [ ! -f "$env" ]; then
  ( umask 077; printf 'N8N_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" > "$env" )
  echo "   new env file with its own encryption key (copy it off the box with the other keys)"
fi
chmod 600 "$env"

echo "== image n8n $version"
docker pull -q "docker.n8n.io/n8nio/n8n:$version" >/dev/null
digest=$(docker image inspect --format '{{index .RepoDigests 0}}' "docker.n8n.io/n8nio/n8n:$version")
sed -i '/^N8N_IMAGE=/d' "$env"
echo "N8N_IMAGE=$digest" >> "$env"
echo "   $digest"

echo "== n8n, on the box only"
"${compose[@]}" up -d --quiet-pull
for _ in $(seq 1 40); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$("${compose[@]}" ps -q n8n)")" = healthy ] && break
  sleep 3
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3104/healthz)" = 200 ] || { echo "n8n did not start; see: ${compose[*]} logs n8n"; exit 1; }
echo "   healthy on 127.0.0.1:3104"

if curl -s http://127.0.0.1:3104/rest/settings | grep -q '"showSetupOnFirstLoad":true'; then
  echo "== n8n's owner (first time only)"
  read -rp "   Owner email [jerome@jeromebadour.com]: " email; email=${email:-jerome@jeromebadour.com}
  read -rsp "   Password (8+ characters, a number and a capital; hidden): " pw; echo
  body=$(EMAIL="$email" PW="$pw" python3 -c 'import json,os; print(json.dumps({"email": os.environ["EMAIL"], "firstName": "Jerome", "lastName": "Badour", "password": os.environ["PW"]}))')
  unset pw
  answer=$(printf '%s' "$body" | curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3104/rest/owner/setup -H 'content-type: application/json' --data-binary @-)
  unset body
  [ "$answer" = 200 ] || { echo "   n8n refused the owner ($answer): run setup.sh again with a stronger password"; exit 1; }
  echo "   owner made: $email"
fi

echo "== nginx and the certificate"
install -m 644 "$here/nginx-n8n" /etc/nginx/sites-available/n8n
ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/n8n
nginx -t -q
systemctl reload nginx
# A reinstalled site file has no HTTPS block again: certbot makes the certificate once and puts it back after that.
certbot --nginx -d "$domain" --non-interactive --redirect --keep-until-expiring --quiet
code=$(curl -s -o /dev/null -w '%{http_code}' "https://$domain/healthz")
[ "$code" = 200 ] || { echo "n8n: https://$domain/healthz answered $code"; exit 1; }
echo "READY n8n $version at https://$domain (healthz 200)"
