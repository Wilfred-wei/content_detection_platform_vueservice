#!/usr/bin/env bash
set -euo pipefail

service_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tool_version="0.27.3"
install_root="${service_dir}/.tools/c2patool"
local_cargo="${service_dir}/.toolchains/cargo/bin/cargo"

if [[ -x "${install_root}/bin/c2patool" ]] && [[ "$("${install_root}/bin/c2patool" --version)" == "c2patool ${tool_version}" ]]; then
  echo "c2patool ${tool_version} is already installed at ${install_root}/bin/c2patool"
  exit 0
fi

if [[ -x "${local_cargo}" ]]; then
  cargo_bin="${local_cargo}"
  export CARGO_HOME="${service_dir}/.toolchains/cargo"
  export RUSTUP_HOME="${service_dir}/.toolchains/rustup"
elif command -v cargo >/dev/null 2>&1; then
  cargo_bin="$(command -v cargo)"
else
  echo "Rust/Cargo is required. Install Rust 1.88 or newer, then rerun npm run setup:c2pa." >&2
  exit 1
fi

"${cargo_bin}" install c2patool --version "${tool_version}" --locked --root "${install_root}"
"${install_root}/bin/c2patool" --version
