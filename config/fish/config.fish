if test -d "$HOME/.local/bin"
    fish_add_path "$HOME/.local/bin"
end

if status is-interactive
    source $HOME/.aliases
    # Set fish prompt
    starship init fish | source
end
