### Setup

1. Download and open VS Code
2. Copy vscode settings into vscode prefs
3. Install Homebrew
   `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

4. Run `brew bundle` and optionally `brew bundle --file Brewfile.media`
5. Copy configs

   - Copy `config/` dir to `~/.config`
   - Copy contents of `home/` to `~/`
   - Make the dev script executable: `chmod +x ~/.local/bin/dev`
   - Add name and email to `.gitconfig`
   - Execute `.macos`

6. Set up Neovim ([LazyVim](https://www.lazyvim.org))

   The nvim config in this repo is a LazyVim setup with TypeScript support (LSP via typescript-tools, formatting via oxfmt, linting via oxlint).

   - The config is already included at `config/nvim/` — it gets copied with step 5 above
   - Install the global tools oxlint and oxfmt:
     ```
     npm install -g oxlint oxfmt
     ```
   - Open `nvim` — LazyVim will bootstrap itself and install all plugins on first launch

7. Set fish as default shell

```
echo /opt/homebrew/bin/fish | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/fish
```

8. Setup SSH keys

```shell
ssh-keygen -t ed25519 -C "mygithubemail@email.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
open https://github.com/settings/ssh
```

9. Install node and pnpm with `mise install`

### Notes

- See the `chezmoi-setup` branch for a one-command new-machine setup using [chezmoi](https://www.chezmoi.io)
- See the `stow-setup` branch for a symlink-based setup using [GNU Stow](https://www.gnu.org/software/stow/)
- If not using Ghostty (which embeds a Nerd Font), install [FiraMono Nerd Font](https://www.nerdfonts.com/font-downloads) for the Starship prompt
