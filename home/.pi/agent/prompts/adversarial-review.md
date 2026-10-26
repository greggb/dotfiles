---
description: Independent DeepSeek and Opus review, challenge, and evidence-based adjudication
---
Review target: $@

# Adversarial review workflow

Run an evidence-based, read-only review with `reviewer-deepseek` and `reviewer-opus`.
Use both named agents through the subagent tool, never substitute one model for the other
silently. Do not edit, run builds/tests, invoke implementation agents, commit,
publish, deploy, or mutate services during this workflow. Reviewer instructions
override global cleanup guidance: suggest fixes, do not apply them.

## Scope

Use the user's explicit target and acceptance criteria. Otherwise review current
tracked staged and unstaged changes, including newly added staged files. Record
the HEAD revision, changed paths, and untracked paths using read-only Git commands
with external diff/text conversion disabled. Untracked content is excluded unless
the user explicitly includes it. If there is no diff or the target/base is
ambiguous, ask for a target rather than inventing one. Never read secret files or
include their contents in review context.

Discover changed filenames before retrieving patch content. Exclude `.env`,
`.env.*` (except `.env.example`), private keys, credential stores, and other known
secret paths from every patch request. Use explicit non-secret path lists with
`--` and disable external diff/text conversion. Never request an unfiltered patch
or historical file content for excluded paths. Read source files through Read,
which enforces path permissions. Use `rg` only on explicit non-secret source
paths; recursive search can bypass Read denials. Do not search credential stores,
secret files, or broad configuration/home directories. Use Read for sensitive
configuration so its approval rules apply.

Freeze the same review target for both reviewers. Provide both with the same
revision, scope, acceptance criteria, relevant repository instructions, and
existing verification evidence. Do not make implementation changes between
rounds. Compare status/diff before and after review; if the target changed,
report that the review is stale and needs restarting for the affected scope.

## Round 1: independent review

Launch both reviewers in one `subagent` call with two tasks so they run in parallel
(separate calls run one after another). Do not include either reviewer's conclusions
or the implementer's defense in the other's first-pass context. Each should inspect the source, callers, and tests and return
actionable findings with IDs, severity, file:line evidence, failure conditions,
impact, confidence, and a suggested regression test. Distinguish introduced bugs
from pre-existing issues. No minimum finding count; no findings is valid.

## Round 2: one challenge round

After both first passes complete, give each reviewer the other's findings and its
own original findings against the unchanged target. Subagent sessions are not
resumable, so include each reviewer's original report in the fresh call.
Ask each to independently verify disputed claims against source and respond with
accept, reject, revise, or unresolved, citing evidence and concrete counterexamples.
Withdraw unsupported findings. Do not force disagreement or agreement. Stop after
this challenge round, not an open-ended debate.

## Adjudication

The coordinating primary agent inspects source for material findings, deduplicates
reports, and decides from evidence, not a vote or the model's reputation. Do not
treat agreement as proof. Separate confirmed findings, rejected claims with
reasons, and unresolved disputes that need tests or user input. Propose tests but
do not execute them during review.

Report scope/revision, both model identities, which rounds completed, findings by
severity with file:line evidence, uncertainty and verification gaps, and whether
the target changed. If either reviewer fails, cannot authenticate, or is blocked,
label the review partial; do not claim a completed dual-model review. Ask before
fixing findings or running follow-up verification.
