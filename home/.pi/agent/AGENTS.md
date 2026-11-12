# Pi

`~/.agents/AGENTS.md` (loaded automatically) is the canonical engineering guide.
This file adds Pi-specific notes only.

- An implementation request authorizes discovery, edits, tests, builds, lint, and verification through to the end without per-step approval.
  Ask only for material ambiguity, missing credentials, destructive actions, or external writes, and never end by offering work that was already requested.
- `essentials/guard.ts` prompts the user before pushes, merges, deploys, publishing, and MCP writes; everything else runs unattended, so keep local work recoverable through git.
- Use `web_search` and `web_fetch` for public docs, releases, and error messages; use Glean MCP tools for MongoDB-internal knowledge.
- Independent review through `/review` is opt-in by default.
  Run one when requested, or when a change presents a concrete risk of production data loss, authorization bypass, or incompatible overlapping releases.
  Routine configuration, local tooling, cosmetic changes, and ordinary refactors do not require independent review.
- Skills are instructions, not tools: `read` the selected SKILL.md. Never read credential stores.
- Prefer focused sessions; suggest `/handoff <next goal>` when unrelated work or context churn makes a fresh session useful.
- `/mode` selects a model and effort, not a workflow phase.
  Suggest a suitable profile when useful; leave switching to the user.
