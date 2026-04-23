### Setup (GNU Stow)

```sh
git clone git@github.com:greggb/dotfiles.git ~/code/dotfiles
cd ~/code/dotfiles
./install.sh
```

The install script:

- Installs Homebrew (if missing)
- Runs `brew bundle`
- Symlinks `home/` → `~/` and `config/` → `~/.config` via stow
- Prompts for git name/email and writes them to `.gitconfig`
- Sets fish as the default shell
- Applies macOS system preferences
- Installs node via mise and `npm install -g oxlint oxfmt`
- Generates an SSH key and opens GitHub SSH settings

Files are symlinked, so edits in `~/` and `~/.config/` go directly back into the repo.

### Re-applying after changes

```sh
cd ~/code/dotfiles
stow --restow --target="$HOME" home
stow --restow --target="$HOME/.config" config
```

### Media tools (optional)

```sh
brew bundle --file Brewfile.media
```

### Notes

- See `chezmoi-setup` branch for a two-command setup using chezmoi (no clone needed)
- See `main` for manual setup instructions
- If not using Ghostty, install [FiraMono Nerd Font](https://www.nerdfonts.com/font-downloads) for the Starship prompt
