#!/usr/bin/env sh
set -eu

# Run on the Linux VPS from an approved checkout after the scoped migration is applied.
test -f .env || { echo 'Missing .env; nothing deployed.' >&2; exit 1; }
test -f supabase/migrations/20261014230000_platform_operational_observability.sql || { echo 'This checkout does not contain the observability release.' >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo 'Docker Compose is required on the VPS.' >&2; exit 1; }

printf '%s\n' 'This rebuilds and restarts only the web and worker services on this host.'
printf '%s\n' 'Confirm the database migration is already applied and this checkout is the approved release.'
printf 'Type DEPLOY to continue: '
read -r confirmation
test "$confirmation" = 'DEPLOY' || { echo 'Cancelled. Nothing deployed.'; exit 1; }

docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml build --pull web worker
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --no-deps web worker
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T web wget -qO- http://127.0.0.1:8080/health/live >/dev/null
worker_ready=0
attempt=0
while [ "$attempt" -lt 5 ]; do
  if docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T worker node -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    worker_ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done
test "$worker_ready" -eq 1 || { echo 'Worker readiness failed. Inspect container logs and confirm the migration and service-role configuration.' >&2; exit 1; }
docker compose -f docker-compose.yml -f docker-compose.production.yml ps web worker
printf '%s\n' 'Web and worker deployed. In Platform Admin → System Health, refresh evidence and verify a recent heartbeat.'
