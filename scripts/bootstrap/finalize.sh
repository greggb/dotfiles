#!/usr/bin/env bash
set -euo pipefail

git_config="$HOME/.gitconfig.local"

git_config_value() {
  git config -f "$git_config" --get "$1" 2>/dev/null || true
}

prompt_required() {
  local prompt="$1"
  local value="${2:-}"

  while [ -z "$value" ]; do
    if [ ! -t 0 ]; then
      echo "$prompt is required. Re-run bootstrap from an interactive terminal." >&2
      exit 1
    fi

    read -r -p "$prompt: " value
  done

  printf '%s\n' "$value"
}

setup_git_identity() {
  local git_name
  local git_email

  git_name="$(prompt_required "Git name" "$(git_config_value user.name)")"
  git_email="$(prompt_required "Git email" "$(git_config_value user.email)")"

  git config -f "$git_config" user.name "$git_name"
  git config -f "$git_config" user.email "$git_email"

  printf '%s\n' "$git_email"
}

github_ssh_is_configured() {
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -q "successfully authenticated"
}

setup_github_ssh() {
  local git_email="$1"
  local key="$HOME/.ssh/id_ed25519"
  local pub_key="$key.pub"

  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"

  if github_ssh_is_configured; then
    return 0
  fi

  echo "Setting up SSH key for GitHub..."

  if [ ! -f "$key" ]; then
    ssh-keygen -t ed25519 -C "$git_email" -f "$key"
  fi

  if [ ! -f "$pub_key" ]; then
    ssh-keygen -y -f "$key" >"$pub_key"
  fi

  ssh-add --apple-use-keychain "$key" 2>/dev/null || ssh-add "$key"

  pbcopy <"$pub_key"
  echo "Public key copied to clipboard."
  open https://github.com/settings/ssh/new
  read -r -p "Press enter once the key is added to GitHub... " _

  if ! github_ssh_is_configured; then
    echo "SSH authentication failed. Check the key was added and try again." >&2
    exit 1
  fi
}

git_email="$(setup_git_identity)"
setup_github_ssh "$git_email"

echo "Bootstrap finished. Open a new terminal to start using fish."
