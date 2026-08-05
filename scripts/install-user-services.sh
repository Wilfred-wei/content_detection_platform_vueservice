#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
service_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/systemd/user"
runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

if [[ "${repo_root}" != *"/content_detection_platform_vueservice-master" ]]; then
  printf 'Unexpected repository path: %s\n' "${repo_root}" >&2
  printf 'The checked-in service units expect the live checkout under $HOME/content_detection_platform_vueservice-master.\n' >&2
  exit 1
fi

mkdir -p "${service_dir}"
install -m 0644 "${repo_root}/deploy/systemd/content-detection-frontend.service" \
  "${service_dir}/content-detection-frontend.service"
install -m 0644 "${repo_root}/deploy/systemd/content-detection-agent.service" \
  "${service_dir}/content-detection-agent.service"

export XDG_RUNTIME_DIR="${runtime_dir}"
systemctl --user daemon-reload
systemctl --user enable content-detection-frontend.service content-detection-agent.service

printf 'Installed user services for %s.\n' "${repo_root}"
printf 'Start them with: bash %s/scripts/restart-content-detection.sh\n' "${repo_root}"
