#!/usr/bin/env sh
set -eu
test -f .env || { echo "Missing .env" >&2; exit 1; }
./scripts/production-preflight.sh
./scripts/backup-check.sh
release_ref="$(git rev-parse --verify HEAD)"
release_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose -f docker-compose.yml -f docker-compose.production.yml build --pull
npm run migrate
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --remove-orphans --wait
./scripts/healthcheck.sh
mkdir -p var/releases
printf '%s\n' "revision=$release_ref" "deployed_at=$release_at" > var/releases/current
printf '%s\n' "Deployed revision $release_ref at $release_at"
