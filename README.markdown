### Setup

1. Download and open VS Code
2. copy vscode settings into vscode prefs
3. Install homebrew
   `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

4. run `brew bundle` or `brew bundle --file Brewfile.work`
5. Copy configs

   - copy fish configs into `~/.config/fish`
   - copy contents of home dir to home directory
   - add name and email to gitconfig
   - execute .macos

6. Set fish as default shell in Ghostty

```
echo /opt/homebrew/bin/fish | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/fish
```

5. Setup ssh keys

```
ssh-keygen -t rsa -C "email@email.com"
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa
pbcopy < ~/.ssh/id_rsa.pub
open https://github.com/settings/ssh
```

6. install node with `fnm`
7. Install pnpm with `corepack`

### Notes

- Look into using https://www.chezmoi.io to manage install/update
