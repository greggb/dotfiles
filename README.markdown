### Setup (chezmoi)

```sh
brew install chezmoi
chezmoi init --apply gh:greggb/dotfiles --branch chezmoi-setup
```

Chezmoi will prompt for git name/email, then automatically:

- Install Homebrew (if missing)
- Run `brew bundle`
- Apply all dotfiles
- Install node via mise and `npm install -g oxlint oxfmt`
- Set fish as the default shell
- Apply macOS system preferences
- Generate an SSH key and open GitHub SSH settings

### Media tools (optional)

```sh
brew bundle --file Brewfile.media
```

### Notes

- See `stow-setup` branch for a symlink-based alternative using GNU Stow
- See `main` for manual setup instructions
- If not using Ghostty, install [FiraMono Nerd Font](https://www.nerdfonts.com/font-downloads) for the Starship prompt
