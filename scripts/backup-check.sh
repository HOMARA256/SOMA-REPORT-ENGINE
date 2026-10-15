#!/usr/bin/env sh
set -eu

# The backup provider remains external to the VPS because Supabase is the
# source of truth. This script is intentionally a verifier, not a database
# dump that might leak tenant data into the VPS filesystem.
test -n "${BACKUP_CHECK_COMMAND:-}" || { echo "BACKUP_CHECK_COMMAND is not configured" >&2; exit 1; }

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if sh -c "$BACKUP_CHECK_COMMAND"; then
  printf '%s backup_check=passed\n' "$started_at"
  exit 0
fi

printf '%s backup_check=failed\n' "$started_at" >&2
exit 1
