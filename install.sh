#!/bin/bash
set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
export HOMEBREW_NO_ANALYTICS=1

setup_ssh() {
  if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    return 0
  fi

  echo "Setting up SSH key for GitHub..."

  if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    ssh-keygen -t ed25519 -C "$GIT_EMAIL" -f "$HOME/.ssh/id_ed25519"
  fi

  ssh-add --apple-use-keychain "$HOME/.ssh/id_ed25519"

  touch "$HOME/.ssh/config" && chmod 600 "$HOME/.ssh/config"
  if ! grep -q "IdentityFile.*id_ed25519" "$HOME/.ssh/config"; then
    cat >> "$HOME/.ssh/config" <<'EOF'
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519
EOF
  fi

  pbcopy < "$HOME/.ssh/id_ed25519.pub"
  echo "Public key copied to clipboard."
  open https://github.com/settings/ssh/new
  read -rp "Press enter once the key is added to GitHub... " _

  if ! ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo "SSH authentication failed. Check the key was added and try again." >&2
    exit 1
  fi
}

find_brew() {
  if command -v brew >/dev/null 2>&1; then
    command -v brew
    return 0
  fi

  for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$brew_path" ]; then
      printf '%s\n' "$brew_path"
      return 0
    fi
  done

  return 1
}

# Git identity (email also used as SSH key comment)
read -rp "Git name: " GIT_NAME
read -rp "Git email: " GIT_EMAIL

setup_ssh

# Homebrew
if ! BREW="$(find_brew)"; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if ! BREW="$(find_brew)"; then
    echo "Homebrew installed, but brew was not found in /opt/homebrew/bin or /usr/local/bin." >&2
    exit 1
  fi
fi
HOMEBREW_PREFIX="$($BREW --prefix)"
"$BREW" analytics off

# Core packages (includes stow, mise, fish, etc.)
"$BREW" bundle --file="$DOTFILES/Brewfile"

# Optional: work tools (go, helm, kubectl)
if [ -f "$DOTFILES/Brewfile.work" ]; then
  read -rp "Install work tools (go, helm, kubectl)? [y/N] " WORK
  if [[ "$WORK" =~ ^[Yy] ]]; then
    "$BREW" bundle --file="$DOTFILES/Brewfile.work"
  fi
fi

# Optional: media tools (ffmpeg, yt-dlp)
if [ -f "$DOTFILES/Brewfile.media" ]; then
  read -rp "Install media tools (ffmpeg, yt-dlp)? [y/N] " MEDIA
  if [[ "$MEDIA" =~ ^[Yy] ]]; then
    "$BREW" bundle --file="$DOTFILES/Brewfile.media"
  fi
fi

# Optional: VS Code extensions and settings
if [ -f "$DOTFILES/Brewfile.vscode" ]; then
  read -rp "Install VS Code extensions? [y/N] " VSCODE
  if [[ "$VSCODE" =~ ^[Yy] ]]; then
    "$BREW" bundle --file="$DOTFILES/Brewfile.vscode"
    VSCODE_DIR="$HOME/Library/Application Support/Code/User"
    mkdir -p "$VSCODE_DIR"
    ln -sf "$DOTFILES/vscode/settings.json" "$VSCODE_DIR/settings.json"
  fi
fi

# Symlinks via stow
mkdir -p "$HOME/.config"
"$HOMEBREW_PREFIX/bin/stow" --restow --target="$HOME" --dir="$DOTFILES" home
"$HOMEBREW_PREFIX/bin/stow" --restow --target="$HOME/.config" --dir="$DOTFILES" config

git config -f "$HOME/.gitconfig.local" user.name "$GIT_NAME"
git config -f "$HOME/.gitconfig.local" user.email "$GIT_EMAIL"

# Fish shell
FISH="$HOMEBREW_PREFIX/bin/fish"
if ! grep -qF "$FISH" /etc/shells; then
  echo "$FISH" | sudo tee -a /etc/shells
fi
chsh -s "$FISH"

# macOS preferences
sh "$HOME/.macos"

# Node via mise + npm globals
if ! "$HOMEBREW_PREFIX/bin/mise" install --quiet; then
  echo "mise install failed. Continuing so the rest of the bootstrap can finish." >&2
elif ! "$HOMEBREW_PREFIX/bin/mise" exec node -- npm install -g oxlint oxfmt @biomejs/biome; then
  echo "npm global install failed. Continuing so the rest of the bootstrap can finish." >&2
fi

echo "Done. Open a new terminal to start using fish."
