function repo -d "Open current git repo in browser"
    set -l base_url (git config --get remote.origin.url)
    or begin
        echo "Not a git repo!"
        return 1
    end

    # Strip .git suffix
    set base_url (string replace -r '\.git$' '' $base_url)

    # Normalize SSH URLs to HTTPS
    set base_url (string replace -r 'git@github\.com:' 'https://github.com/' $base_url)
    set base_url (string replace -r 'git://github\.com' 'https://github.com/' $base_url)
    set base_url (string replace -r 'git@bitbucket\.org:' 'https://bitbucket.org/' $base_url)
    set base_url (string replace -r 'git@gitlab\.com:' 'https://gitlab.com/' $base_url)

    # Find path relative to repo root
    set -l git_root (git rev-parse --show-toplevel)
    set -l relative_path (string replace "$git_root" '' (pwd))

    # Append filename argument if provided
    if test (count $argv) -gt 0
        set relative_path "$relative_path/$argv[1]"
    end

    # Get current branch
    set -l branch (git name-rev --name-only --no-undefined --always HEAD 2>/dev/null)
    set branch (string replace 'refs/heads/' '' $branch)

    # Bitbucket uses "src" instead of "tree"
    set -l tree "tree"
    if string match -q '*bitbucket*' $base_url
        set tree "src"
    end

    set -l url "$base_url/$tree/$branch$relative_path"
    echo "Opening $url"
    open $url
end
