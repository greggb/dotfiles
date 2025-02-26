function go --description 'Git switch branch (creates if it does not exist)'
    if test (count $argv) -eq 0
        echo "Usage: go <branch-name>"
        return 1
    end

    set -l branch_name $argv[1]
    
    # Check if the branch exists locally or remotely
    if git rev-parse --verify --quiet $branch_name >/dev/null; or git rev-parse --verify --quiet origin/$branch_name >/dev/null
        echo "Switching to existing branch '$branch_name'"
        git switch $branch_name
    else
        echo "Creating new branch '$branch_name'"
        git switch -c $branch_name
    end
end
