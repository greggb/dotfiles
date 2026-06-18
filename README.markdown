### Setup

```sh
git clone https://github.com/greggb/dotfiles.git ~/code/dotfiles
cd ~/code/dotfiles
./install.sh
```

The install script:

- Prompts for git name/email
- Generates an SSH key and adds it to GitHub (skipped if already configured)
- Installs Homebrew (if missing)
- Disables Homebrew analytics
- Runs `brew bundle` (core tools) using Homebrew directly, even before `brew` is on your shell path
- Optionally installs work tools (`Brewfile.work`), media tools (`Brewfile.media`), and VS Code extensions (`Brewfile.vscode`)
- Symlinks `home/` -> `~/` and `config/` -> `~/.config/` via stow
- Symlinks VS Code settings
- Sets fish as the default shell
- Applies macOS system preferences
- Attempts node setup via mise and npm globals (oxlint, oxfmt, biome)

### Re-applying after changes

```sh
cd ~/code/dotfiles
stow --restow --target="$HOME" home
stow --restow --target="$HOME/.config" config
```

### Structure

```
home/       -> ~/           Shared aliases, gitconfig, zshrc, macos defaults
config/     -> ~/.config/   fish, nvim, tmux, ghostty, mise
vscode/                     VS Code settings (symlinked by install.sh)
notes/                      Reference docs (not stowed)
```

**Shell setup**: fish is the primary shell. zsh is configured as a secondary.
Both source `~/.aliases` for shared aliases. Shell-specific functions live in
their respective configs (fish functions in `config/fish/functions/`).

**Machine-local overrides**: create `~/.zshrc.local`,
`~/.config/fish/config.local.fish`, or `~/.gitconfig.local` for settings that
shouldn't be committed (work credentials, kubernetes configs, git identity,
etc.). These files are gitignored.

### Optional installs

```sh
brew bundle --file Brewfile.vscode  # VS Code extensions
brew bundle --file Brewfile.work    # go, helm, kubectl
brew bundle --file Brewfile.media   # ffmpeg, yt-dlp
# Clear the default dock apps
defaults write com.apple.dock persistent-apps -array && killall Dock
```

### Notes

- If not using Ghostty, install [FiraMono Nerd Font](https://www.nerdfonts.com/font-downloads) for the Starship prompt
