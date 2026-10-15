#!/usr/bin/env sh
set -eu

test -f .env || { echo 'Missing .env.' >&2; exit 1; }

# Load only the host-controlled production configuration. Values are never
# printed, so command output remains safe for support logs.
set -a
. ./.env
set +a

required='SOMA_DOMAIN APP_URL API_URL VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SESSION_SECRET EMAIL_PROVIDER EMAIL_FROM_ADDRESS'
for name in $required; do
  eval "value=\${$name:-}"
  test -n "$value" || { echo "Missing required production setting: $name" >&2; exit 1; }
  case "$value" in *replace-with-*|*example.com*|*PROJECT_REF*) echo "Placeholder remains in: $name" >&2; exit 1;; esac
done

case "$SOMA_DOMAIN" in *://*|*/*|*' '*) echo 'SOMA_DOMAIN must be a hostname only.' >&2; exit 1;; esac
case "$APP_URL" in "https://$SOMA_DOMAIN"|"https://$SOMA_DOMAIN"/) ;; *) echo 'APP_URL must be https://SOMA_DOMAIN.' >&2; exit 1;; esac
case "$API_URL" in "https://$SOMA_DOMAIN/api"|"https://$SOMA_DOMAIN/api/") ;; *) echo 'API_URL must be https://SOMA_DOMAIN/api.' >&2; exit 1;; esac
case "$VITE_SUPABASE_URL" in https://*.supabase.co) ;; *) echo 'VITE_SUPABASE_URL must be an HTTPS Supabase URL.' >&2; exit 1;; esac
case "$SUPABASE_URL" in "$VITE_SUPABASE_URL") ;; *) echo 'SUPABASE_URL must match VITE_SUPABASE_URL.' >&2; exit 1;; esac

test "${#SESSION_SECRET}" -ge 32 || { echo 'SESSION_SECRET must contain at least 32 characters.' >&2; exit 1; }
test "$EMAIL_PROVIDER" != 'unconfigured' || { echo 'EMAIL_PROVIDER must name the configured production email provider.' >&2; exit 1; }
test "$(stat -c '%a' .env 2>/dev/null || echo 000)" -le 600 || { echo '.env must be readable only by its owner (chmod 600 .env).' >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo 'Docker is required.' >&2; exit 1; }
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose up --help | grep -q -- '--wait' || { echo 'Docker Compose with --wait support is required.' >&2; exit 1; }
printf '%s\n' 'Production preflight passed. Secrets were not displayed.'
