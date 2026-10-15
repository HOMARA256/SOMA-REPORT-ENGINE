#!/usr/bin/env sh
set -eu
API_URL="${API_URL:-http://127.0.0.1:3000}"
curl --fail --silent --show-error "${API_URL%/}/health/live"
curl --fail --silent --show-error "${API_URL%/}/health/ready"
