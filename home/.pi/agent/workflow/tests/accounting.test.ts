import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { OUTPUT_LIMIT } from "../process.ts";
import { runTasks, sumUsage, type ChildUsage, type RunnerOptions } from "../runner.ts";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const entry = fileURLToPath(new URL("./fake-child.ts", import.meta.url));
const defaults: RunnerOptions = { cwd, entry, context: async () => "test instructions", skills: [], killGraceMs: 40 };
const usage: ChildUsage = { input: 41000, output: 3000, cacheRead: 600000, cacheWrite: 2000, totalTokens: 646000,
  cost: { input: 0.02, output: 0.03, cacheRead: 0.005, cacheWrite: 0.005, total: 0.06 } };
const doubled: ChildUsage = { input: 82000, output: 6000, cacheRead: 1200000, cacheWrite: 4000, totalTokens: 1292000,
  cost: { input: 0.04, output: 0.06, cacheRead: 0.01, cacheWrite: 0.01, total: 0.12 } };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLine(line: string | undefined): Record<string, unknown> {
  assert.ok(line);
  const value: unknown = JSON.parse(line);
  assert.ok(record(value));
  return value;
}

test("sumUsage is pure, sums every numeric field and omits absent usage", () => {
  assert.equal(sumUsage([]), undefined);
  assert.equal(sumUsage([undefined, undefined]), undefined);
  const snapshot = structuredClone(usage);
  assert.deepEqual(sumUsage([usage, undefined, usage]), doubled);
  assert.deepEqual(usage, snapshot);
  const single = sumUsage([usage]);
  assert.deepEqual(single, usage);
  assert.notEqual(single, usage);
  assert.notEqual(single?.cost, usage.cost);
});

test("assistant usage includes errored attempts and ignores malformed or non-assistant usage", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "usage-"));
  try {
    const results = await runTasks(["usage", "usagefailure", "ok", "usageinvalid"].map((task) => ({ agent: "reviewer", task })), { ...defaults, logDir: temp });
    assert.equal(results[0]?.isError, false);
    assert.equal(results[1]?.isError, true);
    assert.deepEqual(results[0]?.usage, doubled);
    assert.deepEqual(results[1]?.usage, doubled);
    assert.equal(results[2]?.usage, undefined);
    assert.equal(results[3]?.usage, undefined);
    assert.equal(results[0]?.transcript, undefined);
    assert.equal(results[2]?.transcript, undefined);
    assert.equal((await readdir(temp)).length, 1);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("failure transcript has metadata, retained raw events, bounded stderr and private permissions", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "transcript-"));
  try {
    const logDir = join(temp, "logs");
    const before = Date.now();
    const [result] = await runTasks([{ agent: "reviewer", task: "logring" }], { ...defaults, logDir });
    assert.ok(result?.transcript);
    assert.equal(result.error, "ring failure");
    assert.match(result.transcript, /\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z-reviewer-[a-f0-9]{6}\.jsonl$/);
    assert.equal((await lstat(logDir)).mode & 0o777, 0o700);
    assert.equal((await lstat(result.transcript)).mode & 0o777, 0o600);
    const lines = (await readFile(result.transcript, "utf8")).trimEnd().split("\n");
    const header = parseLine(lines[0]);
    assert.equal(header.type, "subagent_failure");
    assert.equal(header.agent, "reviewer");
    assert.equal(header.model, "github-copilot/gpt-6.1-sol");
    assert.equal(header.cwd, cwd.replace(/\/$/, ""));
    assert.equal(header.task, "logring");
    assert.equal(header.error, result.error);
    assert.equal(header.exitCode, 0);
    assert.equal(header.signal, null);
    assert.equal(header.stopReason, "error");
    assert.equal(header.droppedLines, 0);
    assert.equal(typeof header.startedAt, "string");
    if (typeof header.startedAt === "string") assert.ok(Date.parse(header.startedAt) >= before);
    assert.ok(typeof header.durationMs === "number" && header.durationMs >= 0);
    assert.deepEqual(parseLine(lines[1]), { type: "fixture", index: 0, text: "🙂".repeat(10) });
    assert.equal(parseLine(lines.at(-2)).type, "message_end");
    assert.deepEqual(parseLine(lines.at(-1)), { type: "stderr", text: "diagnostic stderr\n" });
    assert.equal(lines.length, 23);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("ring evicts oldest lines by UTF-8 bytes and never retains oversized records", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "ring-"));
  try {
    const [result] = await runTasks([{ agent: "reviewer", task: "logring" }], { ...defaults, logDir: temp, logBytes: 500 });
    assert.ok(result?.transcript);
    const lines = (await readFile(result.transcript, "utf8")).trimEnd().split("\n");
    const events = lines.slice(1, -1);
    assert.ok(Buffer.byteLength(events.join("\n") + "\n") <= 500);
    assert.equal(parseLine(events.at(-1)).type, "message_end");
    const first = parseLine(events[0]);
    assert.ok(typeof first.index === "number" && first.index > 0);
    assert.equal(parseLine(lines[0]).droppedLines, 21 - events.length);
    const [oversize] = await runTasks([{ agent: "reviewer", task: "oversize" }], { ...defaults, logDir: temp });
    assert.ok(oversize?.transcript);
    const discarded = (await readFile(oversize.transcript, "utf8")).trimEnd().split("\n");
    assert.equal(parseLine(discarded[0]).droppedLines, 1);
    assert.equal(discarded.length, 2);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("transcripts retain malformed raw lines and only bounded stderr", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "raw-transcript-"));
  try {
    const results = await runTasks(["invalid", "logstderr"].map((task) => ({ agent: "reviewer", task })), { ...defaults, logDir: temp });
    assert.ok(results[0]?.transcript);
    const raw = (await readFile(results[0].transcript, "utf8")).trimEnd().split("\n");
    assert.equal(raw[1], "not json");
    assert.equal(parseLine(raw[0]).error, "Invalid child JSON output");
    assert.ok(results[1]?.transcript);
    const lines = (await readFile(results[1].transcript, "utf8")).trimEnd().split("\n");
    const stderr = parseLine(lines.at(-1));
    assert.equal(stderr.type, "stderr");
    assert.equal(stderr.text, results[1].stderr);
    assert.ok(typeof stderr.text === "string" && Buffer.byteLength(stderr.text) <= OUTPUT_LIMIT);
    assert.match(results[1].stderr, /\[truncated\]$/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("transcript pruning keeps newest regular JSONL files, ignoring symlinks and other entries", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "prune-"));
  try {
    for (const [name, time] of [["old.jsonl", 1], ["recent.jsonl", 2]] satisfies [string, number][]) {
      const path = join(temp, name);
      await writeFile(path, "fixture");
      await utimes(path, time, time);
    }
    await writeFile(join(temp, "keep.txt"), "keep");
    await mkdir(join(temp, "directory.jsonl"));
    await symlink(join(temp, "keep.txt"), join(temp, "symlink.jsonl"));
    const [result] = await runTasks([{ agent: "reviewer", task: "auth" }], { ...defaults, logDir: temp, logLimit: 2 });
    assert.ok(result?.transcript);
    assert.equal(result.transcriptError, undefined);
    const names = await readdir(temp);
    assert.equal(names.includes("old.jsonl"), false);
    assert.ok(names.includes("recent.jsonl"));
    assert.ok(names.includes("keep.txt"));
    assert.ok(names.includes("directory.jsonl"));
    assert.ok(names.includes("symlink.jsonl"));
    assert.equal((await lstat(join(temp, "symlink.jsonl"))).isSymbolicLink(), true);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("transcript write failure preserves the task error and pre-spawn failures write nothing", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "log-failure-"));
  try {
    const file = join(temp, "regular-file");
    await writeFile(file, "keep");
    const [result] = await runTasks([{ agent: "reviewer", task: "auth" }], { ...defaults, logDir: file });
    assert.equal(result?.error, "Missing authentication for configured model");
    assert.equal(result?.isError, true);
    assert.equal(result?.transcript, undefined);
    assert.match(result?.transcriptError ?? "", /^transcript write failed: /);
    assert.equal(await readFile(file, "utf8"), "keep");
    const controller = new AbortController(); controller.abort();
    const tasks = [{ agent: "unknown", task: "ok" }, { agent: "reviewer", task: "ok", cwd: "/missing" }];
    const failures = await runTasks(tasks, { ...defaults, logDir: temp });
    failures.push(...await runTasks([{ agent: "reviewer", task: "ok" }], { ...defaults, logDir: temp, signal: controller.signal }));
    assert.ok(failures.every((failure) => failure.isError && !failure.transcript && !failure.transcriptError));
    assert.deepEqual(await readdir(temp), ["regular-file"]);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("an existing log directory is made private before writing", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "log-mode-"));
  try {
    await chmod(temp, 0o755);
    const [result] = await runTasks([{ agent: "reviewer", task: "auth" }], { ...defaults, logDir: temp });
    assert.ok(result?.transcript);
    assert.equal((await stat(temp)).mode & 0o777, 0o700);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("a pruning failure after a successful write keeps the transcript and is labelled as pruning", { skip: process.platform !== "darwin" }, async () => {
  const temp = await mkdtemp(join(cwd, "tests", "prune-failure-"));
  const locked = join(temp, "locked.jsonl");
  try {
    await writeFile(locked, "fixture");
    await utimes(locked, 1, 1);
    execFileSync("chflags", ["uchg", locked]);
    const [result] = await runTasks([{ agent: "reviewer", task: "auth" }], { ...defaults, logDir: temp, logLimit: 1 });
    assert.equal(result?.error, "Missing authentication for configured model");
    assert.ok(result?.transcript);
    assert.match(result?.transcriptError ?? "", /^transcript pruning failed: /);
  } finally {
    execFileSync("chflags", ["nouchg", locked]);
    await rm(temp, { recursive: true, force: true });
  }
});
