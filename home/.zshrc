export EDITOR='nvim'

# Shared aliases (same file fish sources)
source $HOME/.aliases

# zsh-specific
alias zshconfig="$EDITOR ~/.zshrc"
alias -- -='git checkout -'

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# mise (manages node, pnpm, etc.)
eval "$(mise activate zsh)"

# starship prompt
eval "$(starship init zsh)"

# Machine-local overrides (not committed, gitignored)
[ -f ~/.zshrc.local ] && source ~/.zshrc.local
