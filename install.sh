#!/bin/bash
set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

# Homebrew
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Core packages (includes stow, mise, fish, etc.)
brew bundle --no-lock --file="$DOTFILES/Brewfile"

# Optional: work tools (go, helm, kubectl)
if [ -f "$DOTFILES/Brewfile.work" ]; then
  read -rp "Install work tools (go, helm, kubectl)? [y/N] " WORK
  if [[ "$WORK" =~ ^[Yy] ]]; then
    brew bundle --no-lock --file="$DOTFILES/Brewfile.work"
  fi
fi

# Optional: media tools (ffmpeg, yt-dlp)
if [ -f "$DOTFILES/Brewfile.media" ]; then
  read -rp "Install media tools (ffmpeg, yt-dlp)? [y/N] " MEDIA
  if [[ "$MEDIA" =~ ^[Yy] ]]; then
    brew bundle --no-lock --file="$DOTFILES/Brewfile.media"
  fi
fi

# Symlinks via stow
mkdir -p "$HOME/.config"
stow --restow --target="$HOME" --dir="$DOTFILES" home
stow --restow --target="$HOME/.config" --dir="$DOTFILES" config

# VS Code settings (not a stow package, just a single symlink)
VSCODE_DIR="$HOME/Library/Application Support/Code/User"
mkdir -p "$VSCODE_DIR"
ln -sf "$DOTFILES/vscode/settings.json" "$VSCODE_DIR/settings.json"

# Git identity
read -rp "Git name: " GIT_NAME
read -rp "Git email: " GIT_EMAIL
git config -f "$HOME/.gitconfig" user.name "$GIT_NAME"
git config -f "$HOME/.gitconfig" user.email "$GIT_EMAIL"

# Fish shell
FISH=/opt/homebrew/bin/fish
if ! grep -qF "$FISH" /etc/shells; then
  echo "$FISH" | sudo tee -a /etc/shells
fi
chsh -s "$FISH"

# macOS preferences
sh "$HOME/.macos"

# Node via mise + npm globals
/opt/homebrew/bin/mise install --quiet
/opt/homebrew/bin/mise exec node -- npm install -g oxlint oxfmt @biomejs/biome

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
