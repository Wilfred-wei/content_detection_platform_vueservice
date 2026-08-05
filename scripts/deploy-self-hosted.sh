#!/usr/bin/env bash
set -Eeuo pipefail

workspace="${GITHUB_WORKSPACE:-$(pwd)}"
deploy_root="${DEPLOY_ROOT:-${HOME}/content_detection_platform_vueservice-master}"
revision="${GITHUB_SHA:-local}"
require_restart="${DEPLOY_REQUIRE_RESTART:-false}"
restart_command="${DEPLOY_RESTART_COMMAND:-}"
health_url="${DEPLOY_HEALTH_URL:-}"

if [[ ! -d "${workspace}" ]]; then
  printf 'Deploy workspace does not exist: %s\n' "${workspace}" >&2
  exit 1
fi
if [[ "${deploy_root}" == "/" || -z "${deploy_root}" ]]; then
  printf 'Refusing to deploy to an empty or root path. Set DEPLOY_ROOT explicitly.\n' >&2
  exit 1
fi
if [[ ! -d "${deploy_root}" || ! -d "${deploy_root}/.git" ]]; then
  printf 'DEPLOY_ROOT must be an existing project checkout: %s\n' "${deploy_root}" >&2
  exit 1
fi
if [[ "${workspace}" == "${deploy_root}" ]]; then
  printf 'Deploy checkout and live checkout must be different directories.\n' >&2
  exit 1
fi
if ! command -v rsync >/dev/null 2>&1; then
  printf 'rsync is required on the self-hosted runner.\n' >&2
  exit 1
fi

printf 'Building revision %s in %s\n' "${revision}" "${workspace}"
npm ci --prefix "${workspace}/frontend"
npm run build --prefix "${workspace}/frontend"
npm ci --prefix "${workspace}/services/detection_agent_service"
npm run build --prefix "${workspace}/services/detection_agent_service"

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/content-detection-deploy.XXXXXX")"
cleanup() {
  rm -rf "${stage_dir}"
}
trap cleanup EXIT

# Only repository code and build output are synchronized. Local env files, model
# weights, analysis data, virtualenvs, node_modules, and the target .git folder
# remain on the server.
rsync -a --delete \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.data/' \
  --exclude='.tools/' \
  --exclude='.deploy/' \
  --exclude='node_modules/' \
  --exclude='**/node_modules/' \
  --exclude='**/.venv/' \
  --exclude='**/venv/' \
  --exclude='*.pt' \
  --exclude='*.pth' \
  --exclude='*.ckpt' \
  --exclude='*.safetensors' \
  "${workspace}/" "${stage_dir}/"

mkdir -p "${deploy_root}/.deploy"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.data/' \
  --exclude='.tools/' \
  --exclude='.deploy/' \
  --exclude='node_modules/' \
  --exclude='**/node_modules/' \
  --exclude='**/.venv/' \
  --exclude='**/venv/' \
  --exclude='*.pt' \
  --exclude='*.pth' \
  --exclude='*.ckpt' \
  --exclude='*.safetensors' \
  "${stage_dir}/" "${deploy_root}/"
printf '%s\n' "${revision}" > "${deploy_root}/.deploy/revision"

if [[ -n "${restart_command}" ]]; then
  printf 'Running configured restart command.\n'
  (cd "${deploy_root}" && bash -lc "${restart_command}")
elif [[ "${require_restart,,}" == "true" ]]; then
  printf 'DEPLOY_RESTART_COMMAND is required but was not configured.\n' >&2
  exit 1
else
  printf 'Code and build output synchronized; no restart command configured.\n'
fi

if [[ -n "${health_url}" ]]; then
  printf 'Checking %s\n' "${health_url}"
  for attempt in 1 2 3 4 5; do
    if curl --fail --silent --show-error --max-time 5 "${health_url}" >/dev/null; then
      printf 'Health check passed.\n'
      exit 0
    fi
    sleep 2
  done
  printf 'Health check failed: %s\n' "${health_url}" >&2
  exit 1
fi

printf 'Deployment completed for %s.\n' "${revision}"
