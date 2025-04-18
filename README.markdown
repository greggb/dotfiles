### Setup

1. Download and open VS Code
2. copy vscode settings into vscode prefs
3. Install homebrew
   `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

4. run `brew bundle` and optionally `brew bundle --file Brewfile.media`
5. Copy configs

   - copy config dir to `~/.config`
   - copy contents of `home` to ~ directory
   - add name and email to gitconfig
   - execute .macos
   - Install [FiraMono Nerd Font](https://www.nerdfonts.com/font-downloads) for rocketship prompt
   - clone contents of [nvim kickstart](https://github.com/greggb/kickstart.nvim) into `~/.config/nvim`

6. Set fish as default shell in Ghostty

```
echo /opt/homebrew/bin/fish | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/fish
```

7. Setup ssh keys

```shell
ssh-keygen -t rsa -C "mygithubemail@email.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa
pbcopy < ~/.ssh/id_rsa.pub
open https://github.com/settings/ssh
```

8. install node with `fnm`
9. Install pnpm with `corepack`

### Notes

- Look into using https://www.chezmoi.io to manage install/update
