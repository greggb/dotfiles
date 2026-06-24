#!/usr/bin/env bash
set -euo pipefail

fish_shell="/opt/homebrew/bin/fish"

if [ ! -x "$fish_shell" ]; then
  echo "$fish_shell is missing. The fish package should have been installed before the user step." >&2
  exit 1
fi

if ! grep -qxF "$fish_shell" /etc/shells; then
  echo "$fish_shell" | sudo tee -a /etc/shells >/dev/null
fi
