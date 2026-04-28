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
