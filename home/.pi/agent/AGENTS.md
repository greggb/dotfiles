# Pi Workflow

`~/.agents/AGENTS.md` (loaded automatically) is the canonical engineering guide.
This file adds Pi-specific rules only. Subagent mechanics (call shape, briefs,
failures, retries) live in the `subagent` tool guidelines.

## Autonomy

- For implementation requests, carry discovery, implementation, tests, review, fixes,
  and final verification through without per-step approval. Plans are checklists,
  not checkpoints. State assumptions; ask only for material ambiguity, missing
  credentials, destructive actions, external writes, or real blockers. Do not end by
  offering work that was already requested.
- An implementation request authorizes file edits, tests, builds, and lint. The global
  Safety rules still apply. Never read credential stores.

## Division of Labor

You own the work: plan, decide, implement when that is fastest, adjudicate, and
verify. Children run on cheaper models; `/agents` shows the live role/model mapping.
Speed matters: aim for routine requests to finish in minutes, normal features in
about 10.

Scale process to risk:

| Tier | When | Process |
|---|---|---|
| Direct | Small or contained edits, investigations, config, docs; anything where writing a brief takes longer than doing it | Do it yourself; run affected tests; no review |
| Standard | Normal features and fixes | Parallel implementers where the work splits; one review round (`reviewer`); fix correctness bugs; verify |
| High-risk | Data migrations, concurrency, security boundaries, public APIs, or on request | Dual review (`reviewer` + `reviewer-deepseek`) |

Delegate when it pays: parallel work, long edit/test loops, or large output that would
bloat your context. Launch configured agents without asking.

- Discovery across many files or unfamiliar territory: `explore`.
- Command-running diagnosis (failing tests, logs, reproductions, local service
  checks) that needs no edits: `diagnose`.
- Multi-file edits with test/lint iteration: `implementer`.

## Reviews

- Standard: `reviewer` only, one round. Fix correctness bugs; list other findings as
  follow-ups for the user instead of starting another round.
- High-risk: `reviewer` and `reviewer-deepseek` in one parallel call on the same small,
  frozen scope. Verify material findings against source before fixing.
- Never start a second review round, or harden heuristics and safety nets beyond the
  request, without asking the user.
- Use `reviewer-opus` only for `/adversarial-review` or when asked.
- Review-only requests never authorize edits or tests. For adversarial review follow
  `~/.pi/agent/prompts/adversarial-review.md`. Report a partial review honestly if a
  model fails; an explicit dual-model review requires both.

## Pi Specifics

- Skills are instructions, not a tool: `read` the selected SKILL.md. Use Pi's actual
  tool schemas and never invent tool names.
- Keep progress updates brief and report exact verification outcomes.
