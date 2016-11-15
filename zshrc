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
alias ack='ag'
alias subl='/Applications/Sublime\ Text.app/Contents/SharedSupport/bin/subl'
# This is embarrassing
alias brwe='brew'

pl() {
    if [ -d ~/zgit/ ] ; then
        cd ~/zgit/
    else
        cd ~
    fi
}

function track_git_branch() {
  if test "`current_branch`" = ""; then
    echo 'Not in git repo.';
  else
    echo "running: git branch --set-upstream `current_branch` origin/`current_branch`";
    git branch --set-upstream `current_branch` origin/`current_branch`;
  fi
}

# Mappings for Ctrl/Option-left-arrow and Ctrl/Option-right-arrow for
# moving across words.
bindkey "\e\e[C" forward-word
bindkey "\e\e[D" backward-word

# keybindings for history autocomplete
# OPTION 1: for most systems
zmodload zsh/terminfo
bindkey "$terminfo[kcuu1]" history-substring-search-up
bindkey "$terminfo[kcud1]" history-substring-search-down
# OPTION 2: for iTerm2 running on Apple MacBook laptops
zmodload zsh/terminfo
bindkey "$terminfo[cuu1]" history-substring-search-up
bindkey "$terminfo[cud1]" history-substring-search-down

#Exports
export PATH=/bin:/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin:$PATH
export EDITOR='subl -w'

export HISTFILE=~/.zsh_history

setopt append_history
setopt extended_history
setopt hist_expire_dups_first
setopt hist_ignore_space
setopt hist_verify
setopt inc_append_history
setopt share_history # share command history data
setopt hist_find_no_dups
setopt hist_reduce_blanks
setopt no_hup

# --no-use and '${NVM_DIR}/versions/node/${NODE_VERSION}/bin' in PATH alleviated slowness in shell startup time
export NVM_DIR="~/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" --no-use # This loads nvm

# Add syntax highlighting
source `brew --prefix`/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# Add substring history searching ** must come after syntax highlighting **
source `brew --prefix`/opt/zsh-history-substring-search/zsh-history-substring-search.zsh
