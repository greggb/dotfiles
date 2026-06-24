### Setup

This repo is managed by `mise bootstrap`. The bootstrap config is experimental
upstream, so use a current mise release. This setup intentionally supports only
Apple Silicon Macs. The managed paths assume the repo is cloned to
`~/code/dotfiles`.

```sh
curl https://mise.run | sh
export PATH="$HOME/.local/bin:$PATH"
git clone https://github.com/greggb/dotfiles.git ~/code/dotfiles
cd ~/code/dotfiles
mise trust
mise bootstrap --yes
```

The bootstrap flow:

- Uses mise's brew package manager to pour formulae and casks directly into `/opt/homebrew`
- Applies managed dotfiles with mise dotfiles, replacing stow
- Applies macOS defaults and the remaining imperative macOS tweaks
- Sets `/opt/homebrew/bin/fish` as the login shell
- Installs mise-managed runtimes and dev tools: Node, pnpm, Python, uv, oxlint, oxfmt, and Biome
- Prompts once for git identity and GitHub SSH setup when needed

### Optional Profiles

Optional packages are separate mise environment configs:

```sh
MISE_ENV=work mise bootstrap --yes   # awscli, colima, docker, helm, kubectl
MISE_ENV=media mise bootstrap --yes  # cliamp, ffmpeg, x264, x265, yt-dlp
MISE_ENV=work,media mise bootstrap --yes
```

### Python And uv

Runtimes are managed by mise, not Homebrew. Python and uv live in `[tools]`, and
uv-managed project virtualenvs are sourced when they already exist.

Inside uv projects, use uv to create or update the environment:

```sh
uv sync
```

If a uv project has a `.python-version`, sync that requested Python version into
mise with:

```sh
mise sync python --uv
```

### Re-Applying

```sh
cd ~/code/dotfiles
mise bootstrap --yes
```

Useful inspection commands:

```sh
mise dotfiles status
mise dotfiles apply --dry-run --verbose
mise bootstrap packages status --missing
mise bootstrap macos-defaults status
mise bootstrap user status
```

If mise reports a dotfile conflict, inspect it before forcing replacement:

```sh
mise bootstrap --force-dotfiles --yes
```

### Structure

```
mise.toml             Bootstrap, packages, dotfiles, macOS defaults, tools
mise.work.toml        Optional work package profile
mise.media.toml       Optional media package profile
scripts/bootstrap/    Imperative bootstrap hooks and final machine setup
home/                 Files linked into ~/
config/               App configs linked into ~/.config/
notes/                Reference docs
```

### Managed State

`mise.toml` owns the full setup lifecycle:

- `[bootstrap.packages]` replaces `Brewfile`
- `[dotfiles]` replaces stow
- `[bootstrap.macos.defaults]` replaces the declarative parts of `.macos`
- `scripts/bootstrap/` handles SSH, git identity, `/etc/shells`, and macOS tweaks that cannot be represented as defaults
- `[tools]` owns runtimes and versioned developer CLIs

### Local Overrides

Fish is the primary shell. zsh is configured as a secondary shell. Both source
`~/.aliases` for shared aliases. Shell-specific functions live in their
respective configs.

Machine-local files are intentionally ignored by git:

- `~/.zshrc.local`
- `~/.config/fish/config.local.fish`
- `~/.gitconfig.local`
- `mise.local.toml` or `mise.*.local.toml`

Use those for work credentials, kubernetes configs, git identity, and other
things that should not be committed.

### Notes

- If not using Ghostty, install [FiraMono Nerd Font](https://www.nerdfonts.com/font-downloads) for the Starship prompt.
