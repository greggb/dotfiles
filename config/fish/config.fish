for bin_path in /opt/homebrew/bin /opt/homebrew/sbin "$HOME/.local/bin"
    if test -d "$bin_path"
        fish_add_path "$bin_path"
    end
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
