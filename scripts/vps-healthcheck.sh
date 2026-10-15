#!/usr/bin/env sh
set -eu

test -f .env || { echo 'Missing .env.' >&2; exit 1; }
set -a
. ./.env
set +a

./scripts/healthcheck.sh
running_services="$(docker compose -f docker-compose.yml -f docker-compose.production.yml ps --status running --services)"
for service in web api worker; do
  printf '%s\n' "$running_services" | grep -Fx "$service" >/dev/null || {
    printf 'Required service is not running: %s\n' "$service" >&2
    exit 1
  }
done

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl --fail --silent --show-error --max-time 15 "$HEALTHCHECK_URL" >/dev/null
fi

printf '%s vps_healthcheck=passed\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
