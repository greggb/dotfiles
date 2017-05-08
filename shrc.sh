alias zshconfig="subl ~/.zshrc"
alias aliasconfig="subl ~/.shrc.sh"
alias ll='ls -a'
alias ga='git add --all'
alias push='git push'
alias gl='git log'
alias gs='git status'
alias gd='git diff'
alias gc='git commit -m'
alias gca='git commit -am'
alias pull='git pull'
alias gco='git checkout'
alias gp='git fetch -p'
alias lb='git checkout -'
alias cb='git checkout -b'
alias localcommits='git log origin/develop..develop'
alias ack='ag'
alias killtb='pkill "Touch Bar agent"; killall ControlStrip'
alias killdock='killall Dock'
alias clock='cli-clock -b " " -f ▫️'

#ICANTYPEGOOD
alias brwe='brew'

alias sublime='/Applications/Sublime\ Text.app/Contents/SharedSupport/bin/subl'
alias subl='/Applications/Sublime\ Text.app/Contents/SharedSupport/bin/subl'

export EDITOR=vim

#
##
# --no-use and '${NVM_DIR}/versions/node/${NODE_VERSION}/bin' in PATH alleviated slowness in shell startup time
export NVM_DIR="/Users/greggb/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" --no-use # This loads nvm


export PATH=/usr/local/git:$PATH:${NVM_DIR}/versions/node/${NODE_VERSION}/bin:$HOME/.yarn/bin:$PATH:/usr/local/sbin:$PATH

