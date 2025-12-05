if test -d "$HOME/.local/bin"
    fish_add_path "$HOME/.local/bin"
end

set -gx EDITOR nvim

if status is-interactive
    source $HOME/.aliases
    mise activate fish | source
    starship init fish | source
end
