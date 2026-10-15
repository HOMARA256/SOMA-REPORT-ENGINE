#!/usr/bin/env sh
set -eu

test "$(id -u)" = '0' || { echo 'Run this script with sudo on the VPS.' >&2; exit 1; }
test -f .env || { echo 'Missing .env.' >&2; exit 1; }
set -a
. ./.env
set +a

domain="${SOMA_DOMAIN:-}"
email="${TLS_CONTACT_EMAIL:-${EMAIL_FROM_ADDRESS:-}}"
test -n "$domain" || { echo 'SOMA_DOMAIN is required.' >&2; exit 1; }
test -n "$email" || { echo 'Set TLS_CONTACT_EMAIL or EMAIL_FROM_ADDRESS.' >&2; exit 1; }
command -v certbot >/dev/null 2>&1 || { echo 'Install Certbot before enabling TLS.' >&2; exit 1; }

certbot --nginx --non-interactive --agree-tos --email "$email" --domains "$domain" --redirect
systemctl enable --now certbot.timer 2>/dev/null || true
