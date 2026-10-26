import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCwd, formatFooter, formatTokens, type FooterInput } from "../format.ts";

const sample: FooterInput = {
  cwd: "/Users/gregg.brewster/code/camarilla",
  home: "/Users/gregg.brewster",
  branch: "main",
  sessionName: "Footer work",
  model: { name: "Claude Opus 5.5", id: "claude-opus-5.5" },
  thinking: "high",
  context: { tokens: 172_000, window: 400_000, percent: 43.1 },
  totals: { input: 1_200_000, output: 45_000, cacheRead: 3_400_000, cacheWrite: 200_000, cost: 4.21 },
  cacheHitPercent: 92,
};
const full = "Claude Opus 5.5, high thinking  ·  context 43% of 400k  ·  1.2M tokens in, 45k out, 92% cached  ·  $4.21 spent";
const noCost = "Claude Opus 5.5, high thinking  ·  context 43% of 400k  ·  1.2M tokens in, 45k out, 92% cached";
const noCache = "Claude Opus 5.5, high thinking  ·  context 43% of 400k  ·  1.2M in, 45k out  ·  $4.21 spent";
const shortTokens = "Claude Opus 5.5, high thinking  ·  context 43% of 400k  ·  1.2M in, 45k out";
const noTokens = "Claude Opus 5.5, high thinking  ·  context 43% of 400k";
const minimal = "Claude Opus 5.5  ·  context 43% of 400k";

function line(input: FooterInput = sample, width = 160): string {
  return formatFooter(input, width).segments.map((segment) => segment.text).join("  ·  ");
}

test("formatTokens matches built-in boundaries and rounding", () => {
  const cases: [number, string][] = [
    [0, "0"], [950, "950"], [999, "999"], [1000, "1.0k"], [1200, "1.2k"],
    [9999, "10.0k"], [10000, "10k"], [45000, "45k"], [999999, "1000k"],
    [1000000, "1.0M"], [1200000, "1.2M"], [9999999, "10.0M"],
    [10000000, "10M"], [45000000, "45M"],
  ];
  for (const [input, expected] of cases) assert.equal(formatTokens(input), expected);
});

test("formatCwd substitutes home only at a path boundary", () => {
  assert.equal(formatCwd("/home/me", "/home/me"), "~");
  assert.equal(formatCwd("/home/me/code", "/home/me"), "~/code");
  assert.equal(formatCwd("/home/me/code", "/home/me/"), "~/code");
  assert.equal(formatCwd("/home/mean/code", "/home/me"), "/home/mean/code");
  assert.equal(formatCwd("/code", "/home/me"), "/code");
  assert.equal(formatCwd("/code"), "/code");
  assert.equal(formatCwd("/code", ""), "/code");
  assert.equal(formatCwd("/code", "/"), "~/code");
});

test("wide footer shows readable stats, location, branch and session", () => {
  assert.equal(line(), full);
  assert.equal(formatFooter(sample, 160).location, "~/code/camarilla on main · Footer work");
  assert.equal(formatFooter({ ...sample, branch: null, sessionName: undefined }, 160).location, "~/code/camarilla");
});

test("thinking off, absent thinking, model name fallback and missing model", () => {
  assert.ok(line({ ...sample, thinking: "off" }).startsWith("Claude Opus 5.5, thinking off  ·  "));
  assert.ok(line({ ...sample, thinking: undefined }).startsWith("Claude Opus 5.5  ·  "));
  assert.ok(line({ ...sample, model: { name: "", id: "model-id" } }).startsWith("model-id, high thinking"));
  assert.ok(line({ ...sample, model: undefined, thinking: undefined }).startsWith("no model  ·  "));
});

test("unknown context is recalculating, including missing context", () => {
  for (const context of [undefined, { tokens: null, window: 400000, percent: null }]) {
    const result = formatFooter({ ...sample, context }, 160);
    assert.deepEqual(result.segments[1], { text: "context recalculating", tone: "dim" });
  }
});

test("context tones use strict 70 and 90 thresholds before display rounding", () => {
  const cases: [number, string][] = [[0, "dim"], [70, "dim"], [70.01, "warning"], [90, "warning"], [90.01, "error"], [100, "error"]];
  for (const [percent, tone] of cases) {
    const context = { tokens: 1, window: 400000, percent };
    assert.equal(formatFooter({ ...sample, context }, 160).segments[1]?.tone, tone);
  }
});

test("no token usage and zero cost omit their segments", () => {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  assert.equal(line({ ...sample, totals }), noTokens);
  assert.equal(formatFooter({ ...sample, totals }, 160).segments.length, 2);
  assert.equal(line({ ...sample, totals: { ...sample.totals, cost: 0 } }), noCost);
});

test("cache clause needs cache traffic and a known rate; zero rate is known", () => {
  assert.ok(!line({ ...sample, cacheHitPercent: undefined }).includes("cached"));
  assert.ok(!line({ ...sample, totals: { ...sample.totals, cacheRead: 0, cacheWrite: 0 } }).includes("cached"));
  assert.ok(line({ ...sample, cacheHitPercent: 0 }).includes("0% cached"));
  assert.ok(line({ ...sample, cacheHitPercent: 91.6 }).includes("92% cached"));
  assert.ok(line({ ...sample, totals: { ...sample.totals, input: 0, output: 0, cacheRead: 0 } }).includes("0 tokens in, 0 out, 92% cached"));
});

test("positive cost has two decimal places independently of token usage", () => {
  assert.ok(line({ ...sample, totals: { ...sample.totals, cost: 1.2 } }).endsWith("$1.20 spent"));
  assert.ok(line({ ...sample, totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0.001 } }).endsWith("$0.00 spent"));
});

test("width fitting drops cache, then cost, then tokens, then thinking", () => {
  assert.equal(line(sample, full.length), full);
  assert.equal(line(sample, full.length - 1), noCache);
  assert.equal(line(sample, noCache.length), noCache);
  assert.equal(line(sample, noCache.length - 1), shortTokens);
  assert.equal(line(sample, shortTokens.length), shortTokens);
  assert.equal(line(sample, shortTokens.length - 1), noTokens);
  assert.equal(line(sample, noTokens.length), noTokens);
  assert.equal(line(sample, noTokens.length - 1), minimal);
});

test("model and context are never dropped even at tiny widths", () => {
  for (const width of [0, 1, 10, minimal.length - 1]) {
    assert.equal(line(sample, width), minimal);
    assert.equal(formatFooter(sample, width).segments.length, 2);
  }
});

test("generated output contains no U+2014", () => {
  for (let width = 0; width <= 160; width++) {
    const result = formatFooter(sample, width);
    assert.ok(!result.location.includes("\u2014"));
    assert.ok(result.segments.every((segment) => !segment.text.includes("\u2014")));
  }
});
