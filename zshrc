# Path to oh-my-zsh installation.
export ZSH=/Users/gregg/.oh-my-zsh
export EDITOR='vim'

ZSH_THEME="spaceship"
DISABLE_AUTO_UPDATE="true"
COMPLETION_WAITING_DOTS="true"

plugins=(git-extras gitfast npm vagrant aliases k)


source $ZSH/oh-my-zsh.sh
source $ZSH/custom/aliases.sh
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

test -e "${HOME}/.iterm2_shell_integration.zsh" && source "${HOME}/.iterm2_shell_integration.zsh"
