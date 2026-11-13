#!/usr/bin/env bash
# Sets up or updates the Alder & Pike WordPress demo on Fernway's box (as root; from the deployed app:
# /srv/fernway/app/integrations/wordpress/box/setup.sh). Idempotent.
# Makes /srv/alderpike (root only) and its env file with fresh database passwords and WordPress keys the first time
# only; pulls the three images and records their digests; starts MariaDB and WordPress on the box only
# (127.0.0.1:3105); the first time, installs WordPress from the command line with its administrator's password from a
# hidden prompt, so the install page is never open to the internet; makes the pages (site/setup.php), clears out
# WordPress's sample plugins and themes; only then installs the Nginx site and the certificate, and proves the site and
# its neighbours answer. The Fernway connection (key and routes) is connect.sh, apart. Prints one line per step.
set -euo pipefail
test "$(hostname)" = vmi3464201 || { echo "WRONG BOX"; exit 1; }
here=$(dirname "$(readlink -f "$0")")
env=/srv/alderpike/.env
domain=alderpike.jeromebadour.com
compose=(docker compose -f "$here/compose.yaml" --env-file "$env")
wp() { "${compose[@]}" --profile tools run --rm -T cli wp "$@"; }

echo "== folders"
install -d -m 700 /srv/alderpike /srv/alderpike/db /srv/alderpike/backups
install -d -o 33 -g 33 -m 755 /srv/alderpike/html
if [ ! -f "$env" ]; then
  key() { openssl rand -hex 32; }
  ( umask 077
    { printf 'WP_DB_PASSWORD=%s\nWP_DB_ROOT_PASSWORD=%s\n' "$(key)" "$(key)"
      for k in AUTH_KEY SECURE_AUTH_KEY LOGGED_IN_KEY NONCE_KEY AUTH_SALT SECURE_AUTH_SALT LOGGED_IN_SALT NONCE_SALT; do
        printf 'WP_%s=%s\n' "$k" "$(key)"
      done
    } > "$env" )
  echo "   new env file: database passwords and WordPress keys, made here and never shown"
fi
chmod 600 "$env"

echo "== images"
for pair in WP_DB_IMAGE=mariadb:11.4 WP_IMAGE=wordpress:php8.3-apache WP_CLI_IMAGE=wordpress:cli-php8.3; do
  name=${pair%%=*} tag=${pair#*=}
  docker pull -q "$tag" >/dev/null
  digest=$(docker image inspect --format '{{index .RepoDigests 0}}' "$tag")
  sed -i "/^$name=/d" "$env"
  echo "$name=$digest" >> "$env"
  echo "   $tag  $digest"
done

echo "== MariaDB and WordPress, on the box only"
"${compose[@]}" up -d --quiet-pull --remove-orphans
for _ in $(seq 1 60); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' "$("${compose[@]}" ps -q wp)")" = healthy ] && break
  sleep 3
done
[ "$(docker inspect --format '{{.State.Health.Status}}' "$("${compose[@]}" ps -q wp)")" = healthy ] \
  || { echo "WordPress did not start; see: ${compose[*]} logs wp db"; exit 1; }
echo "   healthy on 127.0.0.1:3105"

if ! wp core is-installed 2>/dev/null; then
  echo "== WordPress install (first time only)"
  read -rp "   Administrator email [jerome@jeromebadour.com]: " email; email=${email:-jerome@jeromebadour.com}
  read -rsp "   Administrator password (16+ characters; hidden): " pw; echo
  [ "${#pw}" -ge 16 ] || { echo "   too short: run setup.sh again"; exit 1; }
  # The password reaches the container through its environment, never a command line that ps could show.
  WP_ADMIN_PW="$pw" "${compose[@]}" --profile tools run --rm -T -e WP_ADMIN_PW cli \
    sh -c 'wp core install --url=https://alderpike.jeromebadour.com --title="Alder & Pike" --admin_user=jerome \
      --admin_email="$0" --admin_password="$WP_ADMIN_PW" --skip-email' "$email"
  unset pw
  echo "   installed, administrator jerome ($email)"
fi
echo "   WordPress $(wp core version)"

echo "== theme, plugin and pages"
wp plugin activate fernway --quiet
wp eval-file /opt/site/setup.php | sed 's/^/   /'
# WordPress's samples: nothing here uses them, and every unused plugin or theme is one more thing to patch.
wp plugin delete akismet hello --quiet 2>/dev/null || true
wp theme delete --all --quiet 2>/dev/null || true
# The roof-check form books on its own route; Tacoma, Puyallup and the towns around start with 983 or 984.
wp option update fernway_route roof-check --quiet
wp option update fernway_area "983, 984" --quiet
# A crew works 8 to 4, Tacoma time: the form offers no time outside it, whatever the calendar allows.
wp option update fernway_hours 8-16 --quiet
echo "   theme $(wp theme list --status=active --field=name), plugins: $(wp plugin list --status=active --field=name | paste -sd ' ')"

echo "== nginx and the certificate"
install -m 644 "$here/alderpike-limits.conf" /etc/nginx/conf.d/alderpike-limits.conf
install -m 644 "$here/alderpike-app.conf" /etc/nginx/snippets/alderpike-app.conf
install -m 644 "$here/nginx-alderpike" /etc/nginx/sites-available/alderpike
ln -sf /etc/nginx/sites-available/alderpike /etc/nginx/sites-enabled/alderpike
nginx -t -q
systemctl reload nginx
# A reinstalled site file has no HTTPS block again: certbot makes the certificate once and puts it back after that.
certbot --nginx -d "$domain" --non-interactive --redirect --keep-until-expiring --quiet

echo "== proof"
page=$(curl -s -w '\n%{http_code}' "https://$domain/")
[ "$(tail -1 <<<"$page")" = 200 ] && grep -q "Know what your roof" <<<"$page" || { echo "https://$domain/ did not answer with the home page"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "https://$domain/xmlrpc.php")" = 403 ] || { echo "xmlrpc.php is not closed"; exit 1; }
for site in fernway.jeromebadour.com/api/health distill.jeromebadour.com jeromebadour.com n8n.jeromebadour.com/healthz/readiness; do
  echo "   $site $(curl -s -o /dev/null -w '%{http_code}' "https://$site")"
done
echo "READY Alder & Pike at https://$domain (home 200, xmlrpc 403)"
