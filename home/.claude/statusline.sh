#!/bin/sh
# Claude Code status line: model | context | cache hit on last request + time until cold | session cost | git
# Payload schema: https://code.claude.com/docs/en/statusline
input=$(cat)
base=$(printf '%s' "$input" | jq -r '
  def k: if . >= 1000 then "\((. / 1000 * 10 | round) / 10)k" else "\(.)" end;
  (.context_window // {}) as $cw
  | ($cw.current_usage // {}) as $u
  | (($u.input_tokens // 0) + ($u.cache_creation_input_tokens // 0) + ($u.cache_read_input_tokens // 0)) as $in
  | [
      (.model.display_name // "?"),
      "ctx \($cw.used_percentage // 0)% (\(($cw.total_input_tokens // 0) | k)/\(($cw.context_window_size // 0) | k))",
      (if $in > 0 then "cache \((($u.cache_read_input_tokens // 0) * 100 / $in) | round)%" else "cache -" end)
        + (.prompt_cache as $pc
          | if $pc == null then ""
            elif ($pc.warm | not) or $pc.expires_at == null then " cold"
            else (($pc.expires_at - now) | floor) as $s
              | if $s <= 0 then " cold"
                elif $s < 60 then " \($s)s left"
                else " \($s / 60 | floor)m left" end
            end),
      (((.cost.total_cost_usd // 0) * 100 | round) as $c
        | "$\($c / 100 | floor).\($c % 100 | tostring | if length < 2 then "0" + . else . end)")
    ]
  | join(" | ")
')

# Git segment: branch (or short SHA on detached HEAD) plus staged/modified/untracked/ahead/behind counts.
# Skipped silently outside a repo.
cwd=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')
git_seg=""
if [ -n "$cwd" ] && status=$(git --no-optional-locks -C "$cwd" status --porcelain=v2 --branch 2>/dev/null); then
  set -- $(printf '%s\n' "$status" | awk '
    /^# branch.oid/  { oid = substr($3, 1, 7) }
    /^# branch.head/ { head = $3 }
    /^# branch.ab/   { a = substr($3, 2); b = substr($4, 2) }
    /^[12] /         { if (substr($2, 1, 1) != ".") s++; if (substr($2, 2, 1) != ".") m++ }
    /^u /            { m++ }
    /^\? /           { u++ }
    END {
      if (head == "(detached)" || head == "") head = oid
      gsub(/[ \t]/, "_", head)
      printf "%s %d %d %d %d %d\n", head, a + 0, b + 0, s + 0, m + 0, u + 0
    }')
  branch=$1 ahead=$2 behind=$3 staged=$4 modified=$5 untracked=$6
  esc=$(printf '\033')
  git_seg="${esc}[35m$(printf '\356\202\240') ${branch}${esc}[0m"
  [ "$ahead" -gt 0 ] && git_seg="$git_seg ${esc}[36m⇡${ahead}${esc}[0m"
  [ "$behind" -gt 0 ] && git_seg="$git_seg ${esc}[36m⇣${behind}${esc}[0m"
  [ "$staged" -gt 0 ] && git_seg="$git_seg ${esc}[32m●${staged}${esc}[0m"
  [ "$modified" -gt 0 ] && git_seg="$git_seg ${esc}[33m✚${modified}${esc}[0m"
  [ "$untracked" -gt 0 ] && git_seg="$git_seg ${esc}[31m…${untracked}${esc}[0m"
  if [ $((staged + modified + untracked)) -eq 0 ]; then
    git_seg="$git_seg ${esc}[32m✔${esc}[0m"
  fi
fi

if [ -n "$git_seg" ]; then
  printf '%s | %s\n' "$base" "$git_seg"
else
  printf '%s\n' "$base"
fi
