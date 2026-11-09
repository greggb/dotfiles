#!/bin/bash
set -e

DOTFILES="$(cd "$(dirname "$0")" && pwd)"
export HOMEBREW_NO_ANALYTICS=1

OP_AGENT_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"

# SSH keys live in 1Password (never on disk); its agent signs with Touch ID.
setup_ssh() {
  if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    return 0
  fi

  echo "Setting up SSH key for GitHub (1Password SSH agent)..."
  open -a 1Password
  until SSH_AUTH_SOCK="$OP_AGENT_SOCK" ssh-add -L 2>/dev/null | grep -q '^ssh-ed25519 '; do
    echo "In 1Password:"
    echo "  1. Settings > Developer > enable \"Use the SSH agent\""
    echo "  2. New Item > SSH Key > Add Private Key > Generate New Key (Ed25519), in your Personal vault"
    read -rp "Press enter when done... " _
  done

  # Pin GitHub to one key so the agent doesn't offer every key it holds.
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  SSH_AUTH_SOCK="$OP_AGENT_SOCK" ssh-add -L | grep '^ssh-ed25519 ' | head -1 > "$HOME/.ssh/github_ed25519.pub"

  touch "$HOME/.ssh/config" && chmod 600 "$HOME/.ssh/config"
  if ! grep -q "github_ed25519.pub" "$HOME/.ssh/config"; then
    cat >> "$HOME/.ssh/config" <<'EOF'
Host github.com
  Hostname ssh.github.com
  Port 443
  ServerAliveInterval 20
  User git
  IdentityFile ~/.ssh/github_ed25519.pub
  IdentitiesOnly yes
EOF
  fi
  if ! grep -q "IdentityAgent.*1password" "$HOME/.ssh/config"; then
    cat >> "$HOME/.ssh/config" <<'EOF'

Host *
  IdentityAgent "~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
EOF
  fi

  pbcopy < "$HOME/.ssh/github_ed25519.pub"
  echo "Public key copied to clipboard (add it as an Authentication key)."
  open https://github.com/settings/ssh/new
  read -rp "Press enter once the key is added to GitHub... " _

  if ! ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo "SSH authentication failed. Check the key was added and try again." >&2
    exit 1
  fi
}

find_brew() {
  # Prefer the native Apple Silicon prefix over whatever is on PATH.
  for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$brew_path" ]; then
      printf '%s\n' "$brew_path"
      return 0
    fi
  done

  if command -v brew >/dev/null 2>&1; then
    command -v brew
    return 0
  fi

  return 1
}

# Git identity (email also used as SSH key comment)
read -rp "Git name: " GIT_NAME
read -rp "Git email: " GIT_EMAIL

# Homebrew
if ! BREW="$(find_brew)"; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if ! BREW="$(find_brew)"; then
    echo "Homebrew installed, but brew was not found in /opt/homebrew/bin or /usr/local/bin." >&2
    exit 1
  fi
fi
HOMEBREW_PREFIX="$($BREW --prefix)"

if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] && [ "$HOMEBREW_PREFIX" = "/usr/local" ]; then
  echo "Apple Silicon Mac but Homebrew is the Intel install at /usr/local." >&2
  echo "Install native Homebrew (/opt/homebrew) from a non-Rosetta terminal first." >&2
  exit 1
fi
"$BREW" analytics off

# Core packages (includes stow, mise, fish, etc.)
"$BREW" bundle --file="$DOTFILES/Brewfile"

# SSH (needs the 1Password cask from the Brewfile)
setup_ssh

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

# Optional: remove preinstalled Apple apps (GarageBand loops alone are several GB)
read -rp "Remove GarageBand, iMovie, Keynote, Pages, Numbers? [y/N] " RMAPPS
if [[ "$RMAPPS" =~ ^[Yy] ]]; then
  sudo rm -rf /Applications/{GarageBand,iMovie,Keynote,Pages,Numbers}.app \
    "/Library/Application Support/GarageBand" \
    "/Library/Audio/Apple Loops"
fi

# Symlinks via stow
mkdir -p "$HOME/.config"
"$HOMEBREW_PREFIX/bin/stow" --restow --target="$HOME" --dir="$DOTFILES" home
"$HOMEBREW_PREFIX/bin/stow" --restow --target="$HOME/.config" --dir="$DOTFILES" config

git config -f "$HOME/.gitconfig.local" user.name "$GIT_NAME"
git config -f "$HOME/.gitconfig.local" user.email "$GIT_EMAIL"

# Let `git log --show-signature` verify this machine's commit signatures.
mkdir -p "$HOME/.config/git"
printf '%s namespaces="git" %s\n' "$GIT_EMAIL" "$(cut -d' ' -f1,2 "$HOME/.ssh/github_ed25519.pub")" \
  > "$HOME/.config/git/allowed_signers"

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

# Don't run package install scripts (a common malware vector); set in ~/.npmrc
# rather than stowing it, since `npm login` writes tokens there.
"$HOMEBREW_PREFIX/bin/mise" exec node -- npm config set ignore-scripts true || true

echo "Done. Open a new terminal to start using fish."
