# Bounded local workflow

Parent integration: load `workflow/extension.ts` and `workflow/parent-policy.ts`
through the parent's extension configuration or explicit `--extension` paths. Do not load this
directory wholesale: `child-policy.ts` belongs exclusively to supervised children.
The parent configuration loads these files explicitly. The extension has no added
dependencies and does not modify settings, models, credentials, MCP, or launchers.

## Use

`/agents` lists exact role/model/thinking assignments. Edit `roles.ts` to change
them. Roles are local typed config, not project-discovered agents. There is no
model fallback. A child-only extension checks the selected provider and model
before the first model request. Completed assistant messages are checked again.
Pi may clamp thinking levels to model capabilities, as documented by its CLI.

Tool input has one required `tasks` array for both single and parallel delegation.
There are no top-level agent/task/cwd fields. Each item requires agent/task; cwd
may be omitted or null to inherit the parent directory. The single shape avoids
ambiguous optional fields when providers convert schemas to strict tool calling.

```json
{"tasks":[{"agent":"implementer","task":"Implement X, preserving Y. Run the documented affected tests."}]}
```

```json
{"tasks":[{"agent":"reviewer","task":"Review current diff for correctness"},{"agent":"reviewer-deepseek","task":"Review current diff for edge cases"},{"agent":"reviewer-opus","task":"Review current diff against requirements"}]}
```

Use `cwd` on an individual task to select another directory. Paths resolve from
the parent's cwd. Supply enough task context: children do not inherit the parent
transcript. Global prompt templates provide `/implement`, `/review`, and
`/adversarial-review`. Division of labor: the parent (Opus) plans, adjudicates,
implements Direct-tier work itself and runs final verification; `explore` (Luna) maps code, `diagnose` (Luna) runs read-only
command diagnosis (targeted tests, checks, logs and reproductions), and `implementer`
(Sol) handles edits and test iteration. Diagnose reports commands with exit codes,
key output and a diagnosis with confidence, describing needed fixes without applying them.
Process scales to risk (Direct, Standard, High-risk tiers in `~/.pi/agent/AGENTS.md`):
standard review is one `reviewer` (Sol) round; high-risk review runs `reviewer` (Sol) and
`reviewer-deepseek` in parallel; adversarial review uses DeepSeek and Opus independently,
followed by one challenge round. Child turns are not persisted (`--no-session`),
so parent session files show only the parent model; each subagent result header
names the child's provider/model. The
parent synthesizes findings and delegates verified fixes. There is no automatic
continuation loop or retry orchestration. Routine coding and tests need no
confirmation. Flagged side effects require a one-call interactive parent approval.

## Parent and child policy

`parent-policy.ts` also runs a delegation guard (`delegation-guard.ts`) on the main
agent only. Consecutive non-nested `bash` calls are counted, except recognized
read-only git commands (parsed by `shell-lexer.ts`: git first, read-only subcommands,
no risky options or file redirects, only reading pipe filters), which neither count
nor reset; a `subagent` call, user
input or session start resets the count. From the 6th call a reminder is appended to the
result. The guard never blocks by default (reminder-only, so direct work stays fast);
`createDelegationGuard({ blockAt })` can still enforce a hard limit, checked before
side-effect classification. Parent bash output over 12 KiB is trimmed to a
2 KiB head and 8 KiB tail at line boundaries; the full text is written to a private
`pi-parent-output-*` temp file whose path appears in the result. Cache writes of tool
output into the large parent context dominated measured Opus cost, which is why the
guard targets bash streaks and large outputs.

`policy.ts` is pure classification. `parent-policy.ts` confirms recognized Git
state changes (including staging/commits/pushes), deletion, publish/deploy,
infrastructure and HTTP/GitHub mutations, and mutating or unknown MCP calls.
Approval is per call, not persistent. Refusal blocks the call. Non-TUI parents
block instead of prompting. MCP read/search/get/list/docs/oncall names are
recognized from the actual tool part of `mcp__server__tool`, not server names.
Read verbs must lead the tool name, so get_attachment/list_credentials/get_test_results
are inspections, while create/update/delete remain mutations. Mutation keywords
override read names and `readOnlyHint` never
authorizes an apparent write. Destructive/non-read-only annotations can escalate
an inspection to confirmation; annotations remain untrusted hints. Unknown
non-MCP custom tools are outside this classifier's scope.

The same classifier blocks flagged child operations without prompting; the child
must return the blocker to the parent. Native bash timeouts are set explicitly in
**seconds** and capped at 300, using Pi's bash `timeout` argument.
For implementers, normal edit/write, tests/builds and mise/pnpm/uv commands remain autonomous.
Diagnose additionally blocks obvious file writes (redirection except descriptor merges and
`/dev/null`, `tee`, in-place edits and file management), dependency/environment changes,
formatters/fixers and Git commands other than read-only inspection. The block reason is
`Diagnose role is read-only: <what was detected>. Report the needed change to the parent instead.`
The guard inspects compound command segments, quoted scripts and substitutions where
practical. This is a guardrail, **not a sandbox**: scripts, aliases and arbitrary code can
hide writes, and conservative recognition can reject harmless strings.

Native tool paths first receive Pi-equivalent lexical normalization: Unicode
spaces, one leading `@`, home tilde expansion, file URLs, and cwd-relative resolution.
Native read/edit/write/grep/find/ls deny known secret paths: `.env*` except
`.env.example`, `auth.json`, credential files/directories, private-key extensions,
SSH/AWS/GPG/gcloud directories and package-manager credential files. Recursive
inspection of the `.pi/agent` root must be scoped below it. Home-specific Pi
models.json/mcp.json/models-store.json/sessions and `~/.pi/backups` are denied;
ordinary repository files with these names are not globally banned. This is an exact-path
guard, not recursive output filtering: broad repository searches may still expose
secret contents, symlink aliases are not resolved by this pure classifier, and
shell/programmatic file access is not mediated by native path checks. Do not ask
agents to search credential-bearing roots or use this as a data-loss prevention
boundary.

Shell recognition inspects compositions, quoted scripts and substitutions for
common risky commands, including Git options, curl mutation flags and `gh api`
fields that default to POST. It is intentionally **not a shell parser or sandbox**.
Obfuscation, aliases, arbitrary code, package scripts and indirect commands can
evade recognition. Harmless strings can also trigger conservative confirmation.
Guarded Git inspection, unlike arbitrary bash, has fixed arguments and no shell.

## Isolation and bounds

- Node `process.execPath` and the current Pi entry, never a PATH `pi` or cmux
  wrapper. Tests inject only a fake entry into the runner, not the model tool.
- Each child: JSON, print, no session persistence, no extension discovery, no MCP,
  no context discovery, no prompt templates, no theme discovery, no project trust.
  Normal agent directory/auth/model registries remain shared. `PI_OFFLINE=1`
  disables automatic catalog network refresh, **not** the requested model call.
- `tests/pi-api.test.mjs` parses every child flag with the installed Pi; rerun it after
  upgrading Pi.
  `--no-extensions` still permits explicit `--extension child-policy.ts`.
  `--no-skills` still permits explicit `--skill` paths. Only implementers receive
  user skills from `~/.agents/skills` and `~/.claude/skills`, deduplicated by real
  path. No project skills or executable project extensions load at startup.
  Skill instructions can tell implementers to execute code, as can their task.
- Shared `~/.agents/AGENTS.md` is required. Symlinks (including GNU stow links)
  are resolved first; the shared target must be a regular file <=128 KiB.
  Context discovery walks from the
  nearest Git root to cwd, loading the first matching Pi context filename per
  directory (override/AGENTS/CLAUDE precedence). Outside Git it loads only cwd.
  Context is regular text, limited to 128 KiB total, and symlinks may not escape
  the root. `@` references are not expanded. Instructions for deeper task paths
  must be read by the child, or select the relevant cwd. File reads are not an
  atomic defense against concurrent filesystem replacement.
- `explore` and reviewers (`read` access) have read/grep/find/ls plus fixed `git_inspect` operations
  (status/diff/log/show). No bash, tests/builds, edit/write, MCP, or recursion.
  Git uses an absolute binary, sanitized environment, no shell, no optional locks,
  no fsmonitor/hooks, no pager, external diff or textconv. Revision grammar is
  deliberately narrow, paths follow `--`, arbitrary flags are not exposed.
  Diff/show require one exact repository-root-relative non-secret file path, no
  directory/glob/pathspec expansion. They first discover filenames with
  `--name-only -z`, refuse non-exact/secret/truncated discoveries, then request
  the patch with rename detection disabled. Discover paths via status/find first.
- `diagnose` (`diagnose` access) has read/grep/find/ls/git_inspect/bash, without edit/write
  or user skills. Bash is for read-only diagnostics: targeted tests, type/lint checks in
  check mode, logs, reproductions and Git inspection. Do not modify tracked files,
  install/upgrade packages, change configuration, or run formatters/fixers. Incidental
  caches/artifacts from test runners are acceptable. The additional bash guardrail
  above is heuristic, not a sandbox. Existing child side-effect restrictions still apply.
- Implementers (`write` access) have read/bash/edit/write/grep/find/ls. They can execute task code
  and tests without asking routine permission. No delegation tool is installed
  in children. Recognized commits/external mutations are blocked by child policy,
  not merely discouraged by role instructions.
- **Guardrails, not an OS sandbox.** Read tools can access user files; diagnose and
  implementer bash can bypass policy if instructions are ignored. Git still reads local
  repository config and untrusted repository data. No regex shell filter is
  represented as security isolation. Use containers/OS sandboxing for hostile code.
- Up to 8 tasks per call, 4 active, sequential parent tool execution. Each spawned
  child has a maximum runtime of 600,000 ms for `implementer` and 300,000 ms for other
  roles (`timeoutFor` in `roles.ts`), then process-group TERM and KILL after
  500 ms. A stall watchdog stops children after 240 seconds without a parsed event
  when no tool is in flight; running tools remain subject to the overall deadline.
  Timeout diagnostics distinguish in-flight tools (with runtime) from recent child
  activity and include turn, tool-call and provider-retry counts plus the last retry
  error. Genuine timeouts advise splitting or narrowing the task; stalled children
  instead indicate a likely hung provider stream or stuck process.
  Abort cancels active and queued work. Escalation survives leader exit
  to kill TERM-resistant descendants. Descendants that deliberately create a new
  session/process group can escape, another reason this is not a sandbox.
- Exit code, termination signal, stopReason, auth/provider/spawn/protocol/empty
  response errors and sibling failures are returned truthfully. Errors set
  `isError`. `length` is failure, not a complete response. Tool events and text
  progress stream with a 5-second heartbeat and footer status; no custom renderer.
  The footer shows compact phase icons, agent names, elapsed time and human-readable
  activity, for example `⏳ implementer · 1m 05s · editing runner.ts  |  ✓ explore 32s`.
  The update panel adds model labels such as `implementer (Sol)` and a quiet-time
  suffix after 30 seconds without events, without streaming raw arguments, file
  contents or response deltas.
- Final text and stderr are each capped at 24 KiB per task, including details.
  Protocol records over 1 MiB fail and are discarded. Total results are bounded
  by the 8-task limit. A 1 MiB ring retains raw JSONL event lines, dropping oldest
  lines first. Failed spawned children (including stalls, timeouts and cancellation)
  write private transcripts to `~/.pi/agent/subagent-logs` (directory 0700, files
  0600), with task/error metadata, dropped-line count, retained events and bounded
  stderr. Result text includes the transcript path, or a separate diagnostic if
  writing/pruning fails, without changing the task error. Successful and pre-spawn
  failures write nothing. Keep the newest 20 regular `.jsonl` files by mtime;
  the separate housekeeping extension also prunes logs older than 30 days.
  Runner options `logDir`, `logLimit` and `logBytes` override these defaults.
  Incremental record byte counts avoid repeatedly measuring a growing buffer.
  Tool previews tolerate missing arguments without throwing from the stream callback.
- All valid assistant `message_end` usage is summed, including errored attempts
  recovered by provider retries. Result headers show compact input/output/cached-read
  tokens and nonzero cost (two decimal places). The tool returns aggregated nested
  model usage so Pi's session/footer totals include all children, failed or not.
  Usage and its header clause are omitted when absent. Optional provider-specific
  usage fields are not aggregated.

DeepSeek uses the actual Pi API model ID `grove-misc/FW-DeepSeek-V4.1-Flash`, not an
OpenCode configuration key. The `grove-misc` gateway buffers each response (no streaming
events until it completes) and returns `500 The request timed out` for long generations;
Pi then retries and the model regenerates the same answer, burning the deadline.
Measured earlier with Kimi K3 on the same gateway, the final report alone took about
100-120s of silence. Models on `grove-misc` cap output at 32K tokens, so DeepSeek gets
a 600-word report cap and needs small review scopes to fit the five-minute reviewer deadline.
DeepSeek and Opus review guidance requires stable evidence IDs,
failure conditions, confidence, regression proposals, and accept/reject/revise/
unresolved challenge responses. Unverified claims and fabricated findings are
explicitly disallowed.

## Offline verification

From this directory:

```sh
mise exec node@24.15.0 -- env JITI_FS_CACHE=false node --test tests/*.test.ts tests/*.test.mjs
```

Node 24 strips TS natively. Installed Pi's loader supplies its own TypeBox and
SDK for API compatibility tests, with jiti filesystem caching disabled. Tests
create disposable fixtures **inside this directory** and never contact models.
The Pi API tests intentionally reference this machine's installed package path.
No TypeScript compiler/linter is installed in this workflow or the Pi runtime;
no dependencies were installed to supply one. Live authenticated smoke tests previously passed
for the original five roles; diagnose has offline coverage but no live smoke test.
An end-to-end parent task delegated implementation and review,
then independently reran all four fixture tests. Interactive terminal cancellation
has not been manually exercised; process-group cancellation is regression-tested.
