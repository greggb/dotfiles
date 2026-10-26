import assert from "node:assert/strict";
import { test } from "node:test";
import { describeTool, formatDuration, formatFooter, formatLine, formatTokens, formatUsage, type Progress } from "../status.ts";

const cwd = "/project";
const running: Progress = { phase: "running", activity: "editing runner.ts", elapsedMs: 65_000, idleMs: 2000 };

function output(actual: string, expected: string) {
  assert.equal(actual, expected);
  assert.doesNotMatch(actual, /\u2014|[\r\n]/);
}

test("duration uses whole seconds and padded minute remainders", () => {
  for (const [ms, expected] of new Map([
    [0, "0s"], [999, "0s"], [45_999, "45s"], [59_999, "59s"], [60_000, "1m 00s"],
    [65_000, "1m 05s"], [720_000, "12m 00s"], [-1000, "0s"], [NaN, "0s"], [Infinity, "0s"],
  ])) output(formatDuration(ms), expected);
});

test("usage clauses format compact tokens, cached reads and optional two-decimal costs", () => {
  for (const [tokens, expected] of new Map([[0, "0"], [950, "950"], [1200, "1.2k"], [82000, "82k"], [1200000, "1.2M"]])) {
    output(formatTokens(tokens), expected);
  }
  const usage = { input: 82000, output: 6000, cacheRead: 1200000, cacheWrite: 4000, totalTokens: 1292000,
    cost: { input: 0.04, output: 0.06, cacheRead: 0.01, cacheWrite: 0.01, total: 0.12 } };
  output(formatUsage(usage), " · 82k in, 6k out, 1.2M cached, $0.12");
  output(formatUsage({ ...usage, cost: { ...usage.cost, total: 0 } }), " · 82k in, 6k out, 1.2M cached");
  output(formatUsage({ ...usage, cost: { ...usage.cost, total: 1 } }), " · 82k in, 6k out, 1.2M cached, $1.00");
  output(formatUsage(undefined), "");
});

test("tool descriptions cover every native and inspection tool", () => {
  output(describeTool("read", { path: "/project/src/main.ts" }, cwd), "reading src/main.ts");
  output(describeTool("edit", { path: "src/main.ts" }, cwd), "editing src/main.ts");
  output(describeTool("write", { path: "src/new.ts", content: "private file contents" }, cwd), "editing src/new.ts");
  output(describeTool("bash", { command: "pnpm test" }, cwd), "running pnpm test");
  output(describeTool("grep", { pattern: "onProgress" }, cwd), 'searching for "onProgress"');
  output(describeTool("find", { pattern: "**/*.ts" }, cwd), "finding **/*.ts");
  output(describeTool("ls", { path: "/project" }, cwd), "listing .");
  output(describeTool("ls", { path: "src" }, cwd), "listing src");
  for (const operation of ["status", "diff", "log", "show"]) {
    output(describeTool("git_inspect", { operation }, cwd), `git ${operation}`);
  }
  output(describeTool("git_inspect", { operation: "diff", path: "/project/src/main.ts" }, cwd), "git diff src/main.ts");
  output(describeTool("custom", { content: "private" }, cwd), "using custom");
});

test("missing and invalid arguments never leak payloads or throw", () => {
  const expected = new Map([
    ["read", "reading ."], ["edit", "editing ."], ["write", "editing ."], ["bash", "running command"],
    ["grep", 'searching for ""'], ["find", "finding ."], ["ls", "listing ."], ["git_inspect", "git inspect"], ["custom", "using custom"],
  ]);
  for (const args of [undefined, null, false, 42, "payload", [], { path: 42, pattern: {}, command: [], operation: false }]) {
    for (const [tool, description] of expected) output(describeTool(tool, args, cwd), description);
  }
});

test("paths are relative only within cwd and long paths retain the final two segments", () => {
  output(describeTool("read", { path: "/project/src/../runner.ts" }, cwd), "reading runner.ts");
  output(describeTool("read", { path: "/outside/main.ts" }, cwd), "reading /outside/main.ts");
  output(describeTool("read", { path: "/project-other/main.ts" }, cwd), "reading /project-other/main.ts");
  output(describeTool("read", { path: "../outside/main.ts" }, cwd), "reading ../outside/main.ts");
  const long = "a-very-long-directory-name-to-exceed-the-limit/src/main.ts";
  output(describeTool("read", { path: `/project/${long}` }, cwd), "reading …/src/main.ts");
  output(describeTool("write", { path: `/outside/${long}` }, cwd), "editing …/src/main.ts");
  output(describeTool("edit", { path: long }, cwd), "editing …/src/main.ts");
  output(describeTool("ls", { path: "/project/" }, cwd), "listing .");
});

test("commands use the first line, collapse whitespace and truncate at 40 characters", () => {
  output(describeTool("bash", { command: "  pnpm\t  test   src/test.ts\ncat private-file" }, cwd), "running pnpm test src/test.ts");
  output(describeTool("bash", { command: "echo hello\r\necho goodbye" }, cwd), "running echo hello");
  output(describeTool("bash", { command: "x".repeat(40) }, cwd), `running ${"x".repeat(40)}`);
  output(describeTool("bash", { command: "x".repeat(80) + "\nprivate" }, cwd), `running ${"x".repeat(39)}…`);
  output(describeTool("grep", { pattern: "p".repeat(30) }, cwd), `searching for "${"p".repeat(30)}"`);
  output(describeTool("grep", { pattern: "p".repeat(80) }, cwd), `searching for "${"p".repeat(29)}…"`);
});

test("panel lines show each phase and quiet time only at the running threshold", () => {
  output(formatLine("implementer", "Sol", running), "implementer (Sol) · 1m 05s · editing runner.ts");
  output(formatLine("explore", "Luna", { ...running, phase: "queued" }), "explore (Luna) · queued");
  output(formatLine("explore", "Luna", { ...running, phase: "done", elapsedMs: 32_000, idleMs: 45_000 }), "explore (Luna) · done in 32s");
  output(formatLine("implementer", "Sol", { ...running, idleMs: 29_999 }), "implementer (Sol) · 1m 05s · editing runner.ts");
  output(formatLine("implementer", "Sol", { ...running, idleMs: 30_000 }), "implementer (Sol) · 1m 05s · editing runner.ts (quiet 30s)");
  output(formatLine("implementer", "Sol", { ...running, idleMs: 45_000 }), "implementer (Sol) · 1m 05s · editing runner.ts (quiet 45s)");
  output(formatLine("reviewer-deepseek", "DeepSeek", { ...running, phase: "failed", elapsedMs: 240_000, idleMs: 45_000, error: "Provider failed; details" }), "reviewer-deepseek (DeepSeek) · failed after 4m 00s: Provider failed");
});

test("failure descriptions use the trimmed first clause and cap panel errors at 60 characters", () => {
  for (const error of ["  Timed out ; details", "  Timed out (diagnostic)", "  Timed out\nprivate", "  Timed out\r\nprivate"]) {
    output(formatLine("reviewer", "Sol", { ...running, phase: "failed", error }), "reviewer (Sol) · failed after 1m 05s: Timed out");
  }
  output(formatLine("reviewer", "Sol", { ...running, phase: "failed", error: "x".repeat(100) }), `reviewer (Sol) · failed after 1m 05s: ${"x".repeat(59)}…`);
  output(formatLine("reviewer", "Sol", { ...running, phase: "failed" }), "reviewer (Sol) · failed after 1m 05s: unknown error");
});

test("footer joins compact phase icons, durations and truncated activities and errors", () => {
  const entries = [
    { agent: "explore", label: "Luna", progress: { ...running, phase: "queued" } },
    { agent: "implementer", label: "Sol", progress: running },
    { agent: "explore", label: "Luna", progress: { ...running, phase: "done", elapsedMs: 32_000 } },
    { agent: "reviewer-deepseek", label: "DeepSeek", progress: { ...running, phase: "failed", error: "Provider failed; details" } },
  ] satisfies { agent: string; label: string; progress: Progress }[];
  output(formatFooter(entries), "… explore queued  |  ⏳ implementer · 1m 05s · editing runner.ts  |  ✓ explore 32s  |  ✗ reviewer-deepseek failed: Provider failed");
  output(formatFooter([]), "");
  output(formatFooter([{ agent: "implementer", label: "Sol", progress: { ...running, activity: "x".repeat(80) } }]), `⏳ implementer · 1m 05s · ${"x".repeat(31)}…`);
  output(formatFooter([{ agent: "reviewer", label: "Sol", progress: { ...running, phase: "failed", error: "x".repeat(80) + " (details)" } }]), `✗ reviewer failed: ${"x".repeat(29)}…`);
});

test("all formatters keep arbitrary text on one line without em dashes", () => {
  for (const tool of ["read", "edit", "write", "bash", "grep", "find", "ls", "git_inspect", "custom\u2014tool"]) {
    const text = describeTool(tool, { path: "a\u2014b\nfile", command: "echo a\u2014b\nprivate", pattern: "a\u2014b\npattern", operation: "show\u2014file\n" }, cwd);
    assert.doesNotMatch(text, /\u2014|[\r\n]/);
  }
  for (const phase of ["queued", "running", "done", "failed"] satisfies Progress["phase"][]) {
    const progress: Progress = { ...running, phase, activity: "thinking\u2014quiet\nnow", error: "failed\u2014bad\nprivate" };
    assert.doesNotMatch(formatLine("agent\u2014name\n", "label\u2014name\n", progress), /\u2014|[\r\n]/);
    assert.doesNotMatch(formatFooter([{ agent: "agent\u2014name\n", label: "label", progress }]), /\u2014|[\r\n]/);
  }
});
