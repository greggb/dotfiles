---
description: Read-only review of a specified target or current tracked changes
---
Review only: $@

Do not implement, run tests/builds, or mutate anything. Discover changed filenames
before reading diffs, exclude secrets, and freeze the review scope and revision.
Launch reviewer and reviewer-deepseek in parallel (one subagent call) with the same
target, acceptance criteria, and existing verification evidence. Keep the scope
tight enough to fit the deadline. Inspect material claims yourself and deduplicate.
Report concrete findings with severity, file:line evidence, failure conditions,
missing regression coverage, and which reviewer(s) raised each. No findings is
valid. If either reviewer fails, label the review partial. State uncertainties and
whether the target changed.
