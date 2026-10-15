#!/usr/bin/env sh
set -eu

test -f .env || exit 0
set -a
. ./.env
set +a

message="${1:-SOMA REPORT ENGINE production check failed. Inspect the VPS service and logs.}"
test -n "${ALERT_WEBHOOK_URL:-}" || { printf '%s\n' "$message" >&2; exit 0; }

# The message originates from trusted local health scripts. Escape it anyway so a
# quote or newline cannot make the webhook payload invalid JSON.
safe_message="$(printf '%s' "$message" | tr '\n' ' ' | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')"

# A generic webhook receives only operational status, never credentials,
# learner records, request payloads, or payment information.
curl --fail --silent --show-error --max-time 15 -H 'Content-Type: application/json' \
  --data "{\"service\":\"SOMA REPORT ENGINE\",\"severity\":\"critical\",\"message\":\"${safe_message}\"}" \
  "$ALERT_WEBHOOK_URL" >/dev/null
