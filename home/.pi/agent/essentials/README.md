# Pi essentials

Personal Pi extensions, loaded by explicit path from `~/.pi/agent/settings.json`. No dependencies.

- `guard.ts` asks before irreversible or outward-facing actions: `git push`, discarding uncommitted work, merging or closing PRs, releases, infrastructure changes, publishing, deploys, and MCP tools whose names write to external services. Everything else runs unattended; git is the undo button for local work. Without a UI these calls are blocked.
- `web.ts` adds `web_search` and `web_fetch` using an Anthropic-compatible gateway, Claude Haiku, and Anthropic's server-side web tools.
  Set `GROVE_API_KEY` privately and configure the messages endpoint through `PI_WEB_ENDPOINT` or the `endpoint` field in `~/.pi/agent/web.local.json`.
  Keep that machine-local file out of Git.
  Fetches run on Anthropic's servers, so private authenticated pages are unreachable; use your internal search tools for those.

Use `/mode` to choose a model and effort, or `/mode fast`, `/mode build`, `/mode deep`, and `/mode second` to switch directly.
Edit `model-profiles.ts` to change the assignments, then reload Pi.
Profiles keep the current conversation and permissions; `/review` is the separate fresh-context review procedure.
In headless runs, correct a failed `/mode` selection before sending more work; subsequent input is skipped rather than sent to the default model.

Install and update Pi through Homebrew; the core Brewfile includes it and `pi update` delegates to Homebrew.
Fish preserves cmux integration; shell commands use Homebrew's Pi while mise selects project tools.
Installed-runtime tests use Homebrew's stable opt path; `PI_RUNTIME_DIR` overrides its `libexec/lib` directory.

Run `npm test` here (Node 24) to check the guard rules, reply parsing, profile selection, launcher behavior, and installed Pi extension loading.
