import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCostReport, summarizeCost, type CostEntry } from "../cost.ts";
import type { ChildUsage } from "../runner.ts";

const usage = (cost: number, tokens: Partial<Omit<ChildUsage, "cost" | "totalTokens">> = {}): ChildUsage => {
  const counts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...tokens };
  return { ...counts, totalTokens: counts.input + counts.output + counts.cacheRead + counts.cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: cost / 2, total: cost } };
};
const user: CostEntry = { type: "message", message: { role: "user" } };
const parent = (cost: number, tokens = {}): CostEntry => ({ type: "message", message: { role: "assistant", model: "claude-opus-5.5", usage: usage(cost, tokens) } });

test("costs split by parent model, child role and other sources, attributed to the prompt that caused them", () => {
  const report = summarizeCost([
    { type: "session_info" },
    user,
    parent(0.5, { input: 100, cacheRead: 900, output: 50 }),
    { type: "message", message: { role: "toolResult", toolName: "subagent", usage: usage(0.11), details: { results: [
      { agent: "reviewer", model: "github-copilot/gpt-6.1-sol", usage: usage(0.08) },
      { agent: "reviewer-deepseek", model: "grove-misc/FW-DeepSeek-V4.1-Flash", usage: usage(0.03) },
      { agent: "explore", model: "github-copilot/gpt-6-luna", error: "spawn failed" },
    ] } } },
    { type: "message", message: { role: "toolResult", toolName: "read" } },
    user,
    parent(1),
    { type: "message", message: { role: "toolResult", toolName: "subagent", usage: usage(0.2), details: {} } },
    { type: "message", message: { role: "toolResult", toolName: "codemode", usage: usage(0.05) } },
    { type: "usage", kind: "cache_warm", usage: usage(0.01) },
    { type: "compaction", usage: usage(0.04) },
    { type: "message", message: { role: "assistant", usage: { malformed: true } } },
  ]);
  assert.deepEqual([...report.sources].map(([label, value]) => [label, value.cost.total]), [
    ["parent claude-opus-5.5", 1.5],
    ["reviewer github-copilot/gpt-6.1-sol", 0.08],
    ["reviewer-deepseek grove-misc/FW-DeepSeek-V4.1-Flash", 0.03],
    ["tool subagent", 0.2],
    ["tool codemode", 0.05],
    ["other cache_warm", 0.01],
    ["other compaction", 0.04],
  ]);
  assert.equal(report.prompts.length, 2);
  assert.ok(Math.abs((report.prompts[0] ?? 0) - 0.61) < 1e-9);
  assert.ok(Math.abs((report.prompts[1] ?? 0) - 1.3) < 1e-9);
  assert.ok(Math.abs((report.total?.cost.total ?? 0) - 1.91) < 1e-9);
});

test("report lists sources by cost with cache share and costliest prompts", () => {
  const text = formatCostReport(summarizeCost([user, parent(0.2, { input: 100, cacheRead: 300 }), user, parent(1.2), user, parent(0.1)]));
  const lines = text.split("\n");
  assert.equal(lines[0], "Branch cost $1.50 over 3 prompts. Cache reads 75% of input tokens; cache writes $0.75, output $0.00.");
  assert.equal(lines[1], "parent claude-opus-5.5: $1.50 · 100 in, 0 out, 300 cache read, 0 cache write");
  assert.equal(lines.at(-1), "Last prompt $0.10. Costliest prompts: #2 $1.20, #1 $0.20, #3 $0.10.");
});

test("usage before the first prompt counts in totals without inventing a prompt", () => {
  const report = summarizeCost([{ type: "branch_summary", usage: usage(0.3) }, user, parent(0.5)]);
  assert.deepEqual(report.prompts, [0.5]);
  assert.ok(Math.abs((report.total?.cost.total ?? 0) - 0.8) < 1e-9);
  const summaryOnly = formatCostReport(summarizeCost([{ type: "branch_summary", usage: usage(0.3) }]));
  assert.equal(summaryOnly.split("\n").length, 2, summaryOnly);
  assert.match(summaryOnly, /over 0 prompts/);
});

test("empty or usage-free branches say so instead of reporting zeros", () => {
  assert.equal(formatCostReport(summarizeCost([])), "No recorded model usage on this branch yet.");
  assert.equal(formatCostReport(summarizeCost([user, { type: "message", message: { role: "toolResult", toolName: "read" } }])), "No recorded model usage on this branch yet.");
});
