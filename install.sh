#!/bin/bash
set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

# Homebrew
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Packages (includes stow, mise, fish, etc.)
brew bundle --no-lock --file="$DOTFILES/Brewfile"

# Symlinks via stow
mkdir -p "$HOME/.config"
stow --restow --target="$HOME" --dir="$DOTFILES" home
stow --restow --target="$HOME/.config" --dir="$DOTFILES" config

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
/opt/homebrew/bin/mise exec node -- npm install -g oxlint oxfmt

# SSH key
KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -C "$GIT_EMAIL" -f "$KEY" -N ""
fi
eval "$(ssh-agent -s)"
ssh-add "$KEY" 2>/dev/null || true
pbcopy < "$KEY.pub"
open https://github.com/settings/ssh/new

echo "Done. Open a new terminal to start using fish."
