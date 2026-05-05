#!/bin/bash
set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
export HOMEBREW_NO_ANALYTICS=1

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

# Git identity
read -rp "Git name: " GIT_NAME
read -rp "Git email: " GIT_EMAIL
git config -f "$HOME/.gitconfig" user.name "$GIT_NAME"
git config -f "$HOME/.gitconfig" user.email "$GIT_EMAIL"

# Fish shell
FISH="$HOMEBREW_PREFIX/bin/fish"
if ! grep -qF "$FISH" /etc/shells; then
  echo "$FISH" | sudo tee -a /etc/shells
fi
chsh -s "$FISH"

# macOS preferences
sh "$HOME/.macos"

# Node via mise + npm globals
"$HOMEBREW_PREFIX/bin/mise" install --quiet
"$HOMEBREW_PREFIX/bin/mise" exec node -- npm install -g oxlint oxfmt @biomejs/biome

echo "Done. Open a new terminal to start using fish."

cat <<EOF

SSH key setup (run manually):

  ssh-keygen -t ed25519 -C "$GIT_EMAIL"
  ssh-add --apple-use-keychain ~/.ssh/id_ed25519
  pbcopy < ~/.ssh/id_ed25519.pub
  open https://github.com/settings/ssh/new

Add to ~/.ssh/config:

  Host *
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_ed25519

EOF
