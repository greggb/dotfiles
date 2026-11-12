---
description: Independent fresh-context review of current changes or a named target
---
Review target: $@
Default to the current branch's commits since its merge base with `origin/main`, plus uncommitted changes.

1. Write the target diff to a temp file outside the repository, excluding secret files, and record the base and head revisions.
2. Read `~/.pi/agent/essentials/model-profiles.ts` and use the `second` profile's provider, model, and thinking level for one reviewer in a fresh context with read-only tools:
   `/opt/homebrew/bin/pi -p --no-session --no-extensions --no-context-files --no-skills --no-prompt-templates --model "<provider>/<model>" --thinking "<thinkingLevel>" --tools read,grep,find,ls "<brief>"`
   The brief names the repository path, the diff file, the intent, and the acceptance criteria, and prohibits edits and external writes.
   It asks for concrete findings only (severity, file:line, failure condition, missing regression test) in under 500 words, and states that no findings is a valid result.
3. Verify each material finding against the source before reporting or fixing it.
   Fix correctness bugs; list everything else as follow-ups. Do not start a second review round without asking.
