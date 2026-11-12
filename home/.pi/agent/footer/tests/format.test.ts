import assert from "node:assert/strict";
import { test } from "node:test";
import { footerSeparator, formatCwd, formatDuration, formatFooter, formatTokens, type FooterInput } from "../format.ts";

const sample: FooterInput = {
  cwd: "/Users/gregg.brewster/code/camarilla", home: "/Users/gregg.brewster", branch: "main", sessionName: "Footer work",
  model: { name: "Claude Opus 5.5", id: "claude-opus-5.5" }, thinking: "high",
  context: { tokens: 172000, window: 400000, percent: 43.1 },
  totals: { input: 1200000, output: 45000, cacheRead: 3400000, cacheWrite: 200000, cost: 4.21 },
  cache: { hitPercent: 92, lastRequestAt: 1700000000000 }, now: 1700000030000,
  git: { branch: "main", ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0 },
};

function layout(input: FooterInput = sample, width = 200) {
  return formatFooter(input, width, (text) => text.length);
}
function line(input: FooterInput = sample, width = 200): string {
  return layout(input, width).map((section) => section.map((segment) => segment.text).join(" ")).join(footerSeparator);
}
function contextTone(percent: number | null): string | undefined {
  return layout({ ...sample, context: { tokens: 1, window: 400000, percent } }).find((section) => section[0].text.startsWith("ctx "))?.[0].tone;
}

test("formatTokens preserves the established boundaries and rounding", () => {
  const cases: [number, string][] = [[0, "0"], [999, "999"], [1000, "1.0k"], [9999, "10.0k"], [10000, "10k"], [999999, "1000k"], [1000000, "1.0M"], [9999999, "10.0M"], [10000000, "10M"]];
  for (const [input, expected] of cases) assert.equal(formatTokens(input), expected);
});
test("home substitution respects path boundaries", () => {
  assert.equal(formatCwd("/home/me", "/home/me"), "~");
  assert.equal(formatCwd("/home/me/code", "/home/me/"), "~/code");
  assert.equal(formatCwd("/home/mean/code", "/home/me"), "/home/mean/code");
  assert.equal(formatCwd("/code", "/"), "~/code");
  assert.equal(formatCwd("/code"), "/code");
});
test("wide status bar uses one compact line with model, branch, context, timer and cost", () => {
  assert.equal(line(), "[Claude Opus 5.5 · high] | camarilla |  main ✔ | ctx ▰▰▰▰▱▱▱▱▱▱ 43% /400k | cache 92% 30s ago | ~$4.21 | ↑1.2M ↓45k | Footer work");
  assert.ok(line({ ...sample, thinking: "off" }).startsWith("[Claude Opus 5.5 · off]"));
  assert.ok(line({ ...sample, thinking: undefined }).startsWith("[Claude Opus 5.5]"));
  assert.ok(line({ ...sample, model: undefined, thinking: undefined }).startsWith("[no model]"));
});
test("context progress is bounded and warning thresholds use unrounded percentages", () => {
  assert.equal(contextTone(null), "dim");
  assert.equal(contextTone(70), "success");
  assert.equal(contextTone(70.01), "warning");
  assert.equal(contextTone(90), "warning");
  assert.equal(contextTone(90.01), "error");
  assert.ok(line({ ...sample, context: undefined }).includes("ctx ?"));
  assert.ok(line({ ...sample, context: { tokens: 0, window: 400000, percent: 0 } }).includes("▱▱▱▱▱▱▱▱▱▱ 0%"));
  assert.ok(line({ ...sample, context: { tokens: 420000, window: 400000, percent: 105 } }).includes("▰▰▰▰▰▰▰▰▰▰ 105%"));
});
test("unknown cache expiry shows request age, not an invented warm or cold state", () => {
  assert.ok(line().includes("cache 92% 30s ago"));
  assert.ok(line({ ...sample, now: sample.now + 90000 }).includes("cache 92% 2m0s ago"));
  assert.ok(!line({ ...sample, now: sample.now + 3600000 }).includes("cold"));
  assert.ok(line({ ...sample, cache: undefined }).includes("cache -"));
  assert.ok(line({ ...sample, cache: { ...sample.cache, hitPercent: 0 } }).includes("cache 0%"));
});
test("declared cache lifetime counts down, warns near expiry, and becomes cold", () => {
  const cached = { ...sample, cache: { ...sample.cache, lifetimeSeconds: 300 } };
  assert.ok(line(cached).includes("cache 92% ~4m30s left"));
  const near = layout({ ...cached, now: 1700000241000 }).find((section) => section[0].text.startsWith("cache "));
  assert.deepEqual(near, [{ text: "cache 92% ~59s left", tone: "warning" }]);
  assert.ok(line({ ...cached, now: 1700000300000 }).includes("cache 92% cold"));
  assert.equal(formatDuration(3660), "1h1m");
});
test("Git icons show separate staged, modified, untracked and divergence counts", () => {
  const dirty = { ...sample, git: { branch: "feature/work", ahead: 2, behind: 1, staged: 3, modified: 4, untracked: 5 } };
  assert.ok(line(dirty).includes(" feature/work ⇡2 ⇣1 ●3 ✚4 …5"));
  assert.ok(!line(dirty).includes("✔"));
  assert.ok(!line({ ...sample, git: undefined }).includes("✔"));
  assert.ok(!line({ ...sample, git: undefined, branch: null }).includes(""));
});
test("narrow panes shed optional information before the branch, context and cache timer", () => {
  const compact = line(sample, 80);
  assert.ok(!compact.includes("Footer work"));
  assert.ok(!compact.includes("↑1.2M"));
  assert.ok(!compact.includes("camarilla"));
  assert.ok(compact.includes(" main ✔"));
  assert.ok(compact.includes("ctx"));
  assert.ok(compact.includes("30s ago"));
  const busy = line({ ...sample, git: { branch: "pi-model-profiles", ahead: 2, behind: 1, staged: 14, modified: 8, untracked: 3 } }, 80);
  assert.ok(busy.length <= 80);
  assert.ok(busy.includes("pi-model-profiles"));
  assert.ok(busy.includes("30s ago"));
  const unused = { ...sample, totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }, cache: undefined };
  assert.ok(!line(unused).includes("~$"));
  assert.ok(!line(unused).includes("↑"));
});
