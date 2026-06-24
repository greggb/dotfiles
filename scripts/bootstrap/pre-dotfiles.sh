#!/usr/bin/env bash
set -euo pipefail

mkdir -p \
  "$HOME/.config" \
  "$HOME/.config/aerospace" \
  "$HOME/.config/fish/completions" \
  "$HOME/.config/fish/conf.d" \
  "$HOME/.config/fish/functions" \
  "$HOME/.config/ghostty" \
  "$HOME/.config/lazygit" \
  "$HOME/.config/mise" \
  "$HOME/.config/nvim" \
  "$HOME/.config/tmux" \
  "$HOME/.config/zed" \
  "$HOME/.local/bin" \
  "$HOME/.ssh" \
  "$HOME/Library/Application Support/Code/User"

chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/config"
chmod 600 "$HOME/.ssh/config"

if [ -L "$HOME/.macos" ]; then
  macos_target="$(readlink "$HOME/.macos")"
  if [ "$macos_target" = "$HOME/code/dotfiles/home/.macos" ] || [ ! -e "$HOME/.macos" ]; then
    rm "$HOME/.macos"
  fi
fi
