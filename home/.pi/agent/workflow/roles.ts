export interface Role {
  name: string;
  label: string;
  provider: string;
  model: string;
  thinking: "medium" | "high";
  access: "read" | "diagnose" | "write";
  prompt: string;
}

const review = `You are a read-only reviewer. Inspect the task, relevant code and existing tests.
Report concrete, prioritized findings with file/line references, impact and suggested fixes.
Distinguish verified findings from uncertainties. If no findings, say so and name coverage gaps.
Role restrictions override global cleanup, testing and delegation instructions: do not edit,
run tests/builds, execute project code, delegate, or perform external mutations. Use git_inspect
for Git inspection, never a shell. Discover filenames first; diff/show require an exact non-secret
file path. You are reviewing, not implementing.`;

const adversarial = `Use an adversarial, evidence-driven review. Give each finding a stable evidence
ID (E1, E2...), exact source references, the triggering failure conditions, confidence, and a
specific regression-test proposal (do not execute it). Challenge assumptions and acceptance
criteria. When asked to challenge another review, label each evidence ID accept, reject, revise,
or unresolved, explaining the evidence and what would resolve uncertainty. Never fabricate a
finding, reproduction, test result or source reference to meet a quota. No findings is valid.`;

const brief = "Keep the final report under 300 words; cite file:line instead of quoting code.";

export const roles: readonly Role[] = [
  {
    name: "explore", label: "Luna", provider: "github-copilot", model: "gpt-6-luna", thinking: "medium", access: "read",
    prompt: `Explore code and documentation using read-only tools. Return a concise map of relevant
files, established patterns and recommended next steps with references. Do not implement,
run tests/builds, delegate or mutate anything, even if global instructions suggest cleanup.
${brief}`,
  },
  {
    name: "diagnose", label: "Luna", provider: "github-copilot", model: "gpt-6-luna", thinking: "medium", access: "diagnose",
    prompt: `Run read-only diagnostic commands (targeted tests, type/lint checks in check mode,
logs, reproductions, git inspection) to answer the assigned question. Do not modify tracked
files, install or upgrade packages, run formatters or fixers, or change configuration.
Incidental caches/artifacts written by test runners are acceptable. If a fix is needed,
describe it instead of applying it. Do not delegate or mutate external services.
Return concise evidence: commands run with exit codes, the key output lines, and a diagnosis
with confidence.
${brief}`,
  },
  {
    name: "implementer", label: "Sol", provider: "github-copilot", model: "gpt-6.1-sol", thinking: "medium", access: "write",
    prompt: `Implement the assigned task autonomously with minimal focused edits. Read applicable
instructions and nearby patterns first. Preserve others' work. Run documented affected tests,
regressions, typechecks and lint where applicable. Use available user skills when relevant.
Do not ask permission for routine implementation or testing. Return real blockers rather than
guessing cross-cutting decisions. Do not delegate, commit, push, publish, deploy or mutate
external services. Report files, cleanup, exact verification commands/outcomes and limitations.
${brief}`,
  },
  { name: "reviewer", label: "Sol", provider: "github-copilot", model: "gpt-6.1-sol", thinking: "high", access: "read", prompt: `${review}\nKeep the final report under 500 words; cite file:line instead of quoting code.` },
  // The grove-misc gateway buffers whole responses (no streaming events until completion) and
  // returns 500 "request timed out" on long generations. Pi retries and the model regenerates
  // the report, so keep final reports short.
  { name: "reviewer-deepseek", label: "DeepSeek", provider: "grove-misc", model: "FW-DeepSeek-V4.1-Flash", thinking: "high", access: "read",
    prompt: `${review}\n${adversarial}\nKeep the final report under 600 words: cite file:line instead of quoting code, and list at most the 8 most important findings.` },
  { name: "reviewer-opus", label: "Opus", provider: "github-copilot", model: "claude-opus-5.5", thinking: "high", access: "read", prompt: `${review}\n${adversarial}` },
];

export function getRole(name: string): Role {
  const role = roles.find((candidate) => candidate.name === name);
  if (!role) throw new Error(`Unknown agent ${name}. Available: ${roles.map((item) => item.name).join(", ")}`);
  return role;
}

export function toolsFor(role: Role): string[] {
  if (role.access === "write") return ["read", "bash", "edit", "write", "grep", "find", "ls"];
  const tools = ["read", "grep", "find", "ls", "git_inspect"];
  return role.access === "diagnose" ? [...tools, "bash"] : tools;
}

// Implementers edit and iterate on tests, so a 5-minute cap forced work into serial chunks.
export function timeoutFor(role: Role): number {
  return role.access === "write" ? 600_000 : 300_000;
}
