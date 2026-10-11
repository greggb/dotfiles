# Homebrew: prefer native Apple Silicon prefix, fall back to Intel
if test -x /opt/homebrew/bin/brew
    /opt/homebrew/bin/brew shellenv | source
else if test -x /usr/local/bin/brew
    /usr/local/bin/brew shellenv | source
end

if test -d "$HOME/.local/bin"
    fish_add_path "$HOME/.local/bin"
end

set -gx EDITOR nvim

if status is-interactive
    source $HOME/.aliases
    mise activate fish | source
    fzf --fish | source
    starship init fish | source
end

# Machine-local overrides (not committed, gitignored)
test -f ~/.config/fish/config.local.fish; and source ~/.config/fish/config.local.fish
