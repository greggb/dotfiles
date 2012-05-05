# Path to your oh-my-zsh configuration.
ZSH=$HOME/.oh-my-zsh

# Set name of the theme to load.
ZSH_THEME="crunch-withicon"

alias zshconfig="subl ~/.zshrc"
alias ohmyzsh="subl ~/.oh-my-zsh"
alias ga='git add'
alias push='git push'
alias gl='git log'
alias gs='git status'
alias gd='git diff'
alias gc='git commit -m'
alias gca='git commit -am'
alias pull='git pull'
alias clone='git clone'

alias sublime='/Applications/Sublime\ Text\ 2.app/Contents/SharedSupport/bin/subl'
alias subl='/Applications/Sublime\ Text\ 2.app/Contents/SharedSupport/bin/subl'

 DISABLE_AUTO_UPDATE="true"

 COMPLETION_WAITING_DOTS="true"

# Which plugins would you like to load? (plugins can be found in ~/.oh-my-zsh/plugins/*)
#plugins=(git)

source $ZSH/oh-my-zsh.sh

# Customize to your needs...
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/usr/X11/bin:/usr/local/git/bin
