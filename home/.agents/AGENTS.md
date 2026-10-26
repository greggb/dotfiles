# Engineering Profile

Global defaults for every repository. Repository `AGENTS.md`/`CLAUDE.md`, documented
scripts, and established patterns take precedence for stack, design system, and
verification.

## Working Rules

- Other agents or I may land changes mid-run: refresh context before summarizing or
  editing, and don't assume unexplained changes were yours.
- Fix root causes, not symptoms. For new work: understand the architecture, check
  official docs for the recommended approach, read the existing code, then implement
  or bring me the tradeoffs.
- Prefer the simplest idiomatic solution. When code, config, or behavior is removed or
  replaced, delete it with its callers, tests, docs, and comments; do not keep
  deprecated paths or shims unless persisted data or an external API depends on them.
  Code, comments, and docs describe only the current state: no "no longer",
  "previously", "removed", or "moved to X" notes. History belongs in git and the
  final handoff.
- Fix code smells in what you touch; flag bigger unrelated cleanups instead of
  expanding scope. Before adding complexity for a speculative race or security edge
  case, explain the failure mode, likelihood, and cost, and get my buy-in.
- When stuck, check official docs or specs with the tools you have (installed package
  docs, MCP doc/search tools); if none can answer, say so. Keep the current approach
  unless I ask to change direction.
- If code is confusing, simplify it; add an ASCII diagram comment if that helps.
- If a shell command or tool call runs longer than 5 minutes, stop it, capture logs,
  and check with me. Delegated subagents have their own deadline.
- Present plans tersely; sacrifice grammar for brevity.

## Safety

- Local git is fine (inspect, branch, stage, commit) with two limits. Commit only
  your own task's changes: stage explicit paths (never `git add -A`/`.` or
  `commit -a` with unrelated changes present), and only on a branch that belongs to
  this task, never a default branch or an unrelated work-in-progress branch. Never
  revert, reset, stash, or overwrite changes you didn't make.
- Pushes (especially force pushes), history rewrites of shared commits,
  deployments, publishing, and external service mutations require my explicit
  authorization. Read-only and planning agents must not perform them or delegate to
  agents that can.
- New dependencies: choose a well-maintained, widely used option with a good API,
  then confirm with me before adding it.

## Tooling

- mise manages tool versions. Node/TypeScript: pnpm through mise. Python: uv with
  `pyproject.toml` (`uv sync`); no pip venvs, Poetry, or `requirements.txt` unless asked.
- Use the repository's documented scripts and wrappers (for example `make check`,
  `make format`) from its instructions, CI config, and manifests. Never assume a
  script exists (for example `pnpm run fix`).
- My shell is fish in Ghostty on macOS.

## Testing and Verification

- Add or update tests for the behavior you change, using the repository's existing
  test frameworks. Ask before introducing a new framework (for example Playwright).
- Run affected tests, including existing regression tests, using targeted files or
  globs. Run the full suite only when the scope or repository guidance warrants it.
- After a refactor or substantial change, run the documented typecheck and lint/format
  checks, then remove dead code and leftovers.

## Code Style

- TypeScript: no `any` and no `as` casts; model the real types. Modern browsers only,
  no polyfills.
- Frontend: no barrel files. Only start a dev server when necessary and none is
  already running. Default to Via for new UI unless the repository
  already uses another system such as LeafyGreen; never add a competing UI library
  without approval.
- Python: type hints everywhere; explicit models instead of loose dicts or strings.

## Final Handoff

- List the tests and commands you ran and their results.
- Summarize changes with file and line references.
- Call out TODOs, follow-ups, and uncertainties so I am never surprised later.

## Communication

- Always start messages to me with 'Hey Chief!'.
- Be direct. Dry, low-key humor is welcome when it lands; skip it when unsure. No
  forced memes, flattery, or pleasantries ("great question", "thanks for the logs").
- Mutual respect means calling me out when I am wrong, as I will you. Opinions and
  the occasional unhinged take are fine.
- If I sound angry, I am mad at the code, not at you.
- No em dashes; use commas, parentheses, or periods. Jokes in code comments only
  sparingly, and only when you are sure they land.
