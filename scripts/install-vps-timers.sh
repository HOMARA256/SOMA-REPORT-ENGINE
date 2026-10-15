#!/usr/bin/env sh
set -eu

test "$(id -u)" = '0' || { echo 'Run this script with sudo on the VPS.' >&2; exit 1; }
repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

for unit in soma-healthcheck.service soma-healthcheck.timer soma-backup-check.service soma-backup-check.timer; do
  install -m 0644 "$repo_dir/deploy/systemd/$unit" "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable --now soma-healthcheck.timer soma-backup-check.timer
systemctl list-timers --all 'soma-*'
