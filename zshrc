# Add to function path
fpath=( "/usr/local/share/zsh/site-functions/" $fpath )

# Add syntax highlighting
source /usr/local/bin/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# init prompt with pure theme
autoload -U promptinit && promptinit
prompt pure

# Aliases
alias ga='git add'
alias gl='git log'
alias gs='git status'
alias gd='git diff'
alias gc='git commit -m'
alias gca='git commit -am'
alias push='git push'
alias pull='git pull'
alias clone='git clone'

alias subl='/Applications/Sublime\ Text.app/Contents/SharedSupport/bin/subl'

# This is embarrassing
alias brwe='brew'


#Exports
export PATH=/bin:/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin:$PATH
export EDITOR='subl -w'
