# export ZSH="/Users/gregg/.oh-my-zsh"
# ZSH_THEME="spaceship"
# SPACESHIP_PACKAGE_SHOW=false
# DISABLE_AUTO_UPDATE="true"
# COMPLETION_WAITING_DOTS="true"
# plugins=(git git-extras)
# source $ZSH/oh-my-zsh.sh

export EDITOR='nvim'

source $$HOME/zsh/aliases.zsh
source $HOME/.aliases

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# fnm
eval "`fnm env`"
eval "$(fnm env --use-on-cd)"

