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

if [ ! -x /opt/homebrew/bin/brew ]; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

if [ ! -x /opt/homebrew/bin/brew ]; then
  echo "Homebrew installation finished, but /opt/homebrew/bin/brew was not found." >&2
  exit 1
fi

/opt/homebrew/bin/brew analytics off
