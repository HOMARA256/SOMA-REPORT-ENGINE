#!/usr/bin/env sh
set -eu

test -f .env || { echo 'Missing .env.' >&2; exit 1; }
set -a
. ./.env
set +a

domain="${SOMA_DOMAIN:-}"
case "$domain" in
  ''|*[!A-Za-z0-9.-]*|.*|*..*|*://*|*/*|*' '*|*'${'*|*'}'*)
    echo 'SOMA_DOMAIN must be a plain hostname such as school.example.ug.' >&2
    exit 1
    ;;
esac

template='deploy/nginx/ourschool.conf.template'
destination="${1:-/etc/nginx/sites-available/soma-report-engine}"
test -f "$template" || { echo "Missing $template." >&2; exit 1; }

# The hostname is validated above; sed is used instead of an environment
# expansion so Nginx variables such as $host and $request_uri stay intact.
sed 's|${SOMA_DOMAIN}|'"$domain"'|g' "$template" > "$destination"
printf 'Rendered Nginx configuration: %s\n' "$destination"
