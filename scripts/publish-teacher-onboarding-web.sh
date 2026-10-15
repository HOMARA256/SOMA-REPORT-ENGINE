#!/usr/bin/env sh
# Run from the updated SOMA checkout on the VPS that hosts the live website.
# Publishes only the web container; it does not apply migrations or deploy Edge Functions.
set -eu

cd "$(dirname "$0")/.."

test -f .env || { echo 'Missing .env on this deployment host.' >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo 'Docker is not installed on this deployment host.' >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo 'Docker Compose is unavailable.' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'Node.js is not installed on this deployment host.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm is not installed on this deployment host.' >&2; exit 1; }

node -e "const fs=require('node:fs');const page=fs.readFileSync('apps/web/src/features/auth/TeacherInvitationAcceptPage.tsx','utf8');if(!page.includes('Set password and continue to sign in')||!page.includes('Check activation now')){console.error('This checkout does not contain the teacher onboarding update. Copy the updated source to this server first.');process.exit(1)}"

docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
npm ci
npm run build --workspace apps/web
docker compose -f docker-compose.yml -f docker-compose.production.yml build web
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --no-deps web

container_id=$(docker compose -f docker-compose.yml -f docker-compose.production.yml ps -q web)
test -n "$container_id" || { echo 'Web container did not start.' >&2; exit 1; }

attempt=0
while [ "$attempt" -lt 12 ]; do
  health=$(docker inspect --format '{{.State.Health.Status}}' "$container_id")
  if [ "$health" = healthy ]; then
    echo 'Teacher onboarding web update is live. Refresh the invitation page.'
    exit 0
  fi
  if [ "$health" = unhealthy ]; then
    echo 'Web container is unhealthy. Inspect its logs before retrying.' >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 5
done

echo 'Web container did not become healthy within 60 seconds. Inspect its logs.' >&2
exit 1
