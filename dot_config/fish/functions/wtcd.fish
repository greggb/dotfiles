function wtcd -d "cd to a worktree by partial name match"
    set worktree_path (git worktree list 2>/dev/null | grep $argv[1] | head -n 1 | awk '{print $1}')
    if test -n "$worktree_path"
        cd $worktree_path
    else
        echo "No worktree found matching: $argv[1]"
        return 1
    end
end
