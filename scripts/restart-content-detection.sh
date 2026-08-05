#!/usr/bin/env bash
set -Eeuo pipefail

runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export XDG_RUNTIME_DIR="${runtime_dir}"

if [[ ! -S "${runtime_dir}/bus" ]]; then
  printf 'User systemd bus is unavailable: %s/bus\n' "${runtime_dir}" >&2
  printf 'Log in as the deployment user or start its user manager before restarting.\n' >&2
  exit 1
fi

systemctl --user daemon-reload
systemctl --user restart content-detection-agent.service content-detection-frontend.service

printf 'Restarted content-detection-agent.service and content-detection-frontend.service.\n'
printf 'Agent: http://127.0.0.1:8020/health\n'
printf 'Frontend: http://127.0.0.1:25173/M3/\n'
