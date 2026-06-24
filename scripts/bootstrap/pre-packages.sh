#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This bootstrap is only supported on macOS." >&2
  exit 1
fi

if [ "$(uname -m)" != "arm64" ]; then
  echo "This bootstrap only supports Apple Silicon Macs." >&2
  exit 1
fi

export HOMEBREW_NO_ANALYTICS=1
