#!/usr/bin/env bash
# Connects Fernway and n8n on the box (as root, after setup.sh; from /srv/fernway/app/integrations/n8n/connect.sh).
# For one Fernway account (default 1, the sandbox), every secret moves from one env file to the other on the box and
# is never printed:
#   1. a Fernway webhook endpoint to n8n (lead.scored), its secret into /srv/n8n/.env as FERNWAY_HOOK_SECRET;
#   2. the account's linked Google Sheet into /srv/n8n/.env as FERNWAY_SHEET_ID, and its tab "Hot leads" with a header;
#   3. Fernway's Google service account into n8n as the credential the workflow uses;
#   4. the workflow from the repo, imported and published; n8n restarted so it reads its env file.
# The alert email needs RESEND_API_KEY and ALERT_TO in /srv/n8n/.env (a hidden prompt, step 5 of the README).
set -euo pipefail
test "$(hostname)" = vmi3464201 || { echo "WRONG BOX"; exit 1; }
here=$(dirname "$(readlink -f "$0")")
acc=${1:-1}
env=/srv/n8n/.env
fenv=/srv/fernway/.env
url=https://n8n.jeromebadour.com/webhook/fernway-leads
fw=(docker compose -f /srv/fernway/app/compose.yaml --env-file "$fenv")
n8=(docker compose -f "$here/compose.yaml" --env-file "$env")
setenv() { sed -i "/^$1=/d" "$env"; printf '%s=%s\n' "$1" "$2" >> "$env"; }

echo "== 1. Fernway's webhook to n8n"
if grep -q '^FERNWAY_HOOK_SECRET=' "$env"; then
  echo "   already there (to make a new one, remove the endpoint in the console and the line in $env)"
else
  secret=$("${fw[@]}" exec -T worker node apps/worker/dist/cli.js hook "$acc" "n8n hot leads" "$url" scored | tail -1)
  [[ $secret =~ ^whsec_[A-Za-z0-9_-]{32}$ ]] || { echo "   Fernway did not make the endpoint"; exit 1; }
  setenv FERNWAY_HOOK_SECRET "$secret"; unset secret
  echo "   endpoint made on account $acc, its secret in $env"
fi

echo "== 2. the sheet and its Hot leads tab"
sheet=$("${fw[@]}" exec -T db psql -U postgres -d fernway -Atc "select spreadsheet_id from sheet_links where account_id = $acc")
[ -n "$sheet" ] || { echo "   account $acc has no Google Sheet linked"; exit 1; }
setenv FERNWAY_SHEET_ID "$sheet"
"${fw[@]}" exec -T worker node apps/worker/dist/cli.js sheet-tab "$acc" "Hot leads" "Waybill,Scored (UTC),Score,Name,Email,Phone,Company,Claude's read,Receipt"

echo "== 3. the Google credential in n8n"
key=$(grep '^GOOGLE_SHEETS_KEY=' "$fenv" | cut -d= -f2-)
[ -n "$key" ] || { echo "   Fernway has no GOOGLE_SHEETS_KEY"; exit 1; }
cred=$(mktemp); chmod 600 "$cred"
KEY="$key" python3 - "$cred" <<'PY'
import base64, json, os, sys
k = json.loads(base64.b64decode(os.environ["KEY"]))
json.dump([{"id": "fernwayGoogleSa1", "name": "Fernway Google service account", "type": "googleApi",
            "data": {"email": k["client_email"], "privateKey": k["private_key"]}}], open(sys.argv[1], "w"))
PY
unset key
c=$("${n8[@]}" ps -q n8n)
docker cp -q "$cred" "$c:/tmp/cred.json"; shred -u "$cred"
docker exec -u node "$c" sh -c 'n8n import:credentials --input=/tmp/cred.json >/dev/null; rc=$?; rm -f /tmp/cred.json; exit $rc'
echo "   credential Fernway Google service account in n8n (encrypted with n8n's own key)"

echo "== 4. the workflow"
docker cp -q "$here/fernway-hot-leads.json" "$c:/tmp/wf.json"
docker exec -u node "$c" sh -c 'n8n import:workflow --input=/tmp/wf.json >/dev/null && n8n publish:workflow --id=FernwayHotLeads1 >/dev/null; rc=$?; rm -f /tmp/wf.json; exit $rc'
"${n8[@]}" up -d --force-recreate --quiet-pull >/dev/null 2>&1
for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3104/healthz/readiness)" = 200 ] && break; sleep 3; done
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url" -H 'content-type: application/json' -d '{}')
[ "$code" = 400 ] || { echo "   the workflow's address answered $code to an unsigned call (wanted 400)"; exit 1; }
echo "CONNECTED: account $acc sends scored leads to $url (an unsigned call is refused: 400)"
