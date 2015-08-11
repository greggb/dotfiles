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
alias localcommits='git log origin/develop..develop'

alias subl='/Applications/Sublime\ Text.app/Contents/SharedSupport/bin/subl'

# This is embarrassing
alias brwe='brew'

#z
alias runhi='cd ~/zgit/tg.homeimprovement/; bin/paster serve --reload --app-name=dev config/current/base.ini'
alias runlegacytests='ant js_unit_test_embedded'
runlegacytest() { ant js_unit_test_embedded -Djs.tests=z-$* }
alias runtests='gulp test-js'
runtest() { gulp test-js --js-test-glob=z-$* }

# Mappings for Ctrl/Option-left-arrow and Ctrl/Option-right-arrow for
# moving across words.
bindkey "\e\e[C" forward-word
bindkey "\e\e[D" backward-word

#Exports
export PATH=/bin:/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin:$PATH
export EDITOR='subl -w'
