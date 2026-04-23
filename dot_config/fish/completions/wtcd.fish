# Completions for wtcd - jump to git worktree
complete -c wtcd -f -a '(git worktree list 2>/dev/null | tail -n +2 | awk "{print \$1}" | xargs -n 1 basename)' -d 'Jump to worktree'
