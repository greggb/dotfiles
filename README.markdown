### Setup

```sh
git clone git@github.com:greggb/dotfiles.git ~/code/dotfiles
cd ~/code/dotfiles
./install.sh
```

The install script:

- Installs Homebrew (if missing)
- Runs `brew bundle` (core tools)
- Optionally installs work tools (`Brewfile.work`) and media tools (`Brewfile.media`)
- Symlinks `home/` -> `~/` and `config/` -> `~/.config/` via stow
- Symlinks VS Code settings
- Prompts for git name/email
- Sets fish as the default shell
- Applies macOS system preferences
- Installs node via mise and npm globals (oxlint, oxfmt, biome)
- Prints SSH key setup instructions

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

**Machine-local overrides**: create `~/.zshrc.local` or
`~/.config/fish/config.local.fish` for env vars that shouldn't be committed
(work credentials, kubernetes configs, etc.). These files are gitignored.

### Optional installs

```sh
brew bundle --file Brewfile.work    # go, helm, kubectl
brew bundle --file Brewfile.media   # ffmpeg, yt-dlp
```

### Notes

- If not using Ghostty, install [FiraMono Nerd Font](https://www.nerdfonts.com/font-downloads) for the Starship prompt
