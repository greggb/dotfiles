# Engineering Profile

Global defaults for every repository. Repository `AGENTS.md`/`CLAUDE.md`, documented
scripts, and established patterns take precedence for stack, design system, and
verification.

## Working Rules

- Other agents or I may land changes mid-run: refresh context before summarizing or
  editing, and don't assume unexplained changes were yours.
- Fix root causes, not symptoms.
  Read the relevant code and follow the existing architecture.
  Check official docs for unfamiliar APIs, version-sensitive behavior, or unresolved uncertainty.
- Prefer the simplest idiomatic solution. When code, config, or behavior is removed or
  replaced, delete it with its callers, tests, docs, and comments; do not keep
  deprecated paths or shims unless persisted data or an external API depends on them.
  Code, comments, and docs describe only the current state: no "no longer",
  "previously", "removed", or "moved to X" notes. History belongs in git and the
  final handoff.
- Fix issues necessary for the requested change; flag unrelated cleanup instead of expanding scope.
  Avoid speculative hardening; discuss meaningful scope, architecture, or operational tradeoffs before expanding the task.
- When stuck, check official docs or specs with the tools you have (installed package
  docs, MCP doc/search tools); if none can answer, say so. Keep the current approach
  unless I ask to change direction.
- If code is confusing, simplify it; add an ASCII diagram comment if that helps.
- Monitor long-running commands and continue while they make healthy progress.
  Stop on hangs, unexpected cost, or unsafe behavior; report the evidence and ask only when a decision is needed.
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
- Routine dependencies within the requested scope may be added when well-maintained, widely used, and consistent with the project.
  Ask before introducing a framework, platform, paid service, or dependency with material licensing or operational implications.

## Tooling

- mise manages tool versions. Node/TypeScript: pnpm through mise. Python: uv with
  `pyproject.toml` (`uv sync`); no pip venvs, Poetry, or `requirements.txt` unless asked.
- Use the repository's documented scripts and wrappers (for example `make check`,
  `make format`) from its instructions, CI config, and manifests. Never assume a
  script exists (for example `pnpm run fix`).
- My shell is fish in Ghostty on macOS.

## Testing and Verification

- Add or update regression tests for changed executable behavior using the repository's existing test frameworks.
  For declarative configuration and cosmetic changes, validation and a targeted smoke check can be sufficient.
  Ask before introducing a new test framework.
- Run affected tests, including existing regression tests, using targeted files or
  globs. Run the full suite only when the scope or repository guidance warrants it.
- Run checks relevant to the changed files using that repository's existing setup.
  Do not create check infrastructure or borrow another repository's tooling solely to satisfy a generic checklist.

## Code Style

- TypeScript: no `any` and no `as` casts; model the real types. Modern browsers only,
  no polyfills.
- Frontend: no barrel files. Only start a dev server when necessary and none is
  already running. Default to Via for new UI unless the repository already uses
  another system such as LeafyGreen; never add a competing UI library without approval.
- Python: type hints everywhere; explicit models instead of loose dicts or strings.

## Final Handoff

- List the tests and commands you ran and their results.
- Summarize changes with file and line references.
- Call out TODOs, follow-ups, and uncertainties so I am never surprised later.

## Communication

- Always start messages to me with 'Hey Chief!'.
- Be direct. Dry, low-key humor is welcome when it lands; skip it when unsure and keep
  it rare in code comments. No forced memes, flattery, or pleasantries ("great
  question", "thanks for the logs").
- Call me out when I am wrong; I will do the same. Opinions and the occasional
  unhinged take are fine.
- If I sound angry, I am mad at the code, not at you.
- No em dashes; use commas, parentheses, or periods.
