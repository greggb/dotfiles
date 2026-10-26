import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { repositoryContext } from "../context.ts";
import { gitArgs, inspectGit } from "../git-inspect.ts";
import { bounded, MAX_TIMEOUT_MS, OUTPUT_LIMIT, runProcess } from "../process.ts";
import { childArgs, runTasks, STALL_MS, type RunnerOptions } from "../runner.ts";
import { getRole, roles, timeoutFor, toolsFor } from "../roles.ts";
import type { Progress } from "../status.ts";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const entry = fileURLToPath(new URL("./fake-child.ts", import.meta.url));
const logs = await mkdtemp(join(cwd, "tests", "workflow-logs-"));
after(async () => { await rm(logs, { recursive: true, force: true }); });
const defaults: RunnerOptions = { cwd, entry, context: async () => "test instructions", skills: [], killGraceMs: 40, logDir: logs };

test("exact role models, toolsets and isolation flags", async () => {
  assert.deepEqual(roles.map(({ name, label, provider, model, thinking, access }) => [name, label, provider, model, thinking, access]), [
    ["explore", "Luna", "github-copilot", "gpt-6-luna", "medium", "read"],
    ["diagnose", "Luna", "github-copilot", "gpt-6-luna", "medium", "diagnose"],
    ["implementer", "Sol", "github-copilot", "gpt-6.1-sol", "medium", "write"],
    ["reviewer", "Sol", "github-copilot", "gpt-6.1-sol", "high", "read"],
    ["reviewer-deepseek", "DeepSeek", "grove-misc", "FW-DeepSeek-V4.1-Flash", "high", "read"],
    ["reviewer-opus", "Opus", "github-copilot", "claude-opus-5.5", "high", "read"],
  ]);
  for (const role of roles) {
    const args = childArgs(role, entry, "prompt", []);
    for (const flag of ["--mode", "-p", "--no-session", "--no-extensions", "--no-mcp", "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-approve", "--extension"]) assert.ok(args.includes(flag), flag);
    const toolsets = {
      read: ["read", "grep", "find", "ls", "git_inspect"],
      diagnose: ["read", "grep", "find", "ls", "git_inspect", "bash"],
      write: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    };
    assert.deepEqual(toolsFor(role), toolsets[role.access]);
    assert.equal(args[args.indexOf("--tools") + 1], toolsets[role.access].join(","));
    const [result] = await runTasks([{ agent: role.name, task: "ok" }], { ...defaults, skills: ["/trusted/skill"] });
    assert.ok(result);
    assert.equal(result.isError, false, result.error);
    assert.equal(result.model, `${role.provider}/${role.model}`);
    assert.match(result.output, /only the assigned child role/);
    assert.match(result.output, /Do not delegate or launch other agents/);
    assert.equal(result.output.includes("/trusted/skill"), role.access === "write");
    assert.equal(result.output.includes('"--skill"'), role.access === "write");
    assert.match(result.output, /\u2028answer/);
  }
  const args = childArgs(getRole("implementer"), entry, "prompt", ["/trusted/skill"]);
  assert.equal(args[args.indexOf("--skill") + 1], "/trusted/skill");
});

test("mixed siblings preserve failures and streaming lifecycle", async () => {
  const updates: Progress[] = [];
  const results = await runTasks(["ok", "auth", "exit", "empty", "invalid", "mismatch", "aborted", "large"].map((task) => ({ agent: "reviewer", task })), { ...defaults, onProgress: (_i, status) => updates.push(status) });
  assert.deepEqual(results.map((result) => result.isError), [false, true, true, true, true, true, true, false]);
  assert.match(results[1]?.error ?? "", /authentication/);
  assert.equal(results[1]?.stopReason, "error");
  assert.equal(results[2]?.exitCode, 7);
  assert.match(results[2]?.stderr ?? "", /startup failed/);
  assert.match(results[3]?.error ?? "", /no final/);
  assert.match(results[4]?.error ?? "", /Invalid child JSON/);
  assert.match(results[5]?.error ?? "", /mismatch/);
  assert.match(results[6]?.error ?? "", /aborted/);
  assert.ok(Buffer.byteLength(results[7]?.output ?? "") <= OUTPUT_LIMIT);
  assert.ok(updates.some((status) => status.activity === "reading example"));
  assert.ok(updates.some((status) => status.activity === "reading ."));
  assert.ok(updates.some((status) => status.activity === "thinking"));
  assert.equal(updates.filter((status) => status.phase === "running" && status.activity === "planning next step").length, 2);
  assert.equal(updates.filter((status) => status.phase === "running" && status.activity === "writing response").length, 2);
  assert.equal(updates.filter((status) => status.phase === "done").length, 2);
  assert.equal(updates.filter((status) => status.phase === "failed").length, 6);
  assert.ok(updates.some((status) => status.phase === "failed" && status.error === results[1]?.error));
  assert.ok(updates.every((status) => status.elapsedMs >= 0 && status.idleMs >= 0));
  assert.doesNotMatch(JSON.stringify(updates), /read result|working|"delta"|"args"/);
});

test("spawn, missing entry, invalid cwd, unknown role and oversized records fail truthfully", async () => {
  const spawn = await runProcess({ command: "/does-not-exist", args: [], cwd });
  assert.match(spawn.error ?? "", /Spawn failed/);
  const [missing] = await runTasks([{ agent: "reviewer", task: "ok" }], { ...defaults, entry: "/missing.ts" });
  assert.equal(missing?.isError, true);
  assert.notEqual(missing?.exitCode, 0);
  const updates: { index: number; progress: Progress }[] = [];
  const results = await runTasks([{ agent: "missing", task: "x" }, { agent: "reviewer", task: "ok", cwd: "/missing" }, { agent: "reviewer", task: "oversize" }], {
    ...defaults, onProgress: (index, progress) => updates.push({ index, progress }),
  });
  assert.ok(results.every((result) => result.isError));
  for (const [index, result] of results.entries()) {
    const final = updates.filter((update) => update.index === index).at(-1)?.progress;
    assert.equal(final?.phase, "failed");
    assert.equal(final?.error, result.error);
  }
  assert.match(results[0]?.error ?? "", /Unknown agent/);
  assert.match(results[2]?.error ?? "", /exceeds 1 MiB/);
  await assert.rejects(runTasks([], defaults), /1 to 8/);
  await assert.rejects(runTasks(Array.from({ length: 9 }, () => ({ agent: "reviewer", task: "ok" })), defaults), /1 to 8/);
});

test("pre-abort and timeout return errors, not empty success", async () => {
  const controller = new AbortController(); controller.abort();
  const [cancelled] = await runTasks([{ agent: "reviewer", task: "ok" }], { ...defaults, signal: controller.signal });
  assert.match(cancelled?.error ?? "", /Cancelled/);
  assert.equal(cancelled?.transcript, undefined);
  const started = Date.now();
  const [timedOut] = await runTasks([{ agent: "reviewer", task: "hang" }], { ...defaults, timeoutMs: 150 });
  assert.match(timedOut?.error ?? "", /Timed out/);
  assert.equal(timedOut?.signal, "SIGKILL");
  assert.ok(timedOut?.transcript);
  assert.ok(Date.now() - started < 2000);
  assert.equal(MAX_TIMEOUT_MS, 600000);
  assert.deepEqual(roles.map((role) => [role.name, timeoutFor(role)]), [["explore", 300000], ["diagnose", 300000], ["implementer", 600000], ["reviewer", 300000], ["reviewer-deepseek", 300000], ["reviewer-opus", 300000]]);
  assert.equal(STALL_MS, 240000);
});

test("silent child stalls after its tool finishes, before the overall deadline", async () => {
  const started = Date.now();
  const [result] = await runTasks([{ agent: "reviewer", task: "stall" }], { ...defaults, stallMs: 200, timeoutMs: 5000 });
  assert.equal(result?.isError, true);
  assert.match(result?.error ?? "", /Stalled/);
  assert.ok(result?.transcript);
  assert.match(result?.error ?? "", /last: tool read done; 0 turns, 1 tool calls, 0 provider retries/);
  assert.ok(Date.now() - started < 2000);
});

test("thinking activity prevents stalls and diagnoses a genuine timeout", async () => {
  const [result] = await runTasks([{ agent: "reviewer", task: "busy" }], { ...defaults, timeoutMs: 400, stallMs: 200 });
  assert.equal(result?.isError, true);
  assert.match(result?.error ?? "", /Timed out/);
  assert.match(result?.error ?? "", /still active .*thinking/);
  assert.match(result?.error ?? "", /Genuine timeout: split or narrow the task/);
  assert.doesNotMatch(result?.error ?? "", /Stalled/);
});

test("in-flight tools suppress stalls and are named in timeout diagnosis", async () => {
  const [result] = await runTasks([{ agent: "reviewer", task: "toolhang" }], { ...defaults, stallMs: 100, timeoutMs: 500 });
  assert.equal(result?.isError, true);
  assert.match(result?.error ?? "", /Timed out/);
  assert.match(result?.error ?? "", /still running tool read for \d+s/);
  assert.match(result?.error ?? "", /0 turns, 1 tool calls, 0 provider retries/);
  assert.doesNotMatch(result?.error ?? "", /Stalled/);
});

test("exhausted provider retries survive the final assistant error", async () => {
  const updates: Progress[] = [];
  const [result] = await runTasks([{ agent: "reviewer", task: "retryfail" }], { ...defaults, onProgress: (_index, progress) => updates.push(progress) });
  assert.ok(updates.some((progress) => progress.activity === "provider error, retry 1/3"));
  assert.equal(result?.exitCode, 0);
  assert.equal(result?.isError, true);
  assert.match(result?.error ?? "", /retries exhausted/);
  assert.match(result?.error ?? "", /529/);
});

test("a provider error recovered by auto-retry is not reported as failure", async () => {
  const [result] = await runTasks([{ agent: "reviewer", task: "retryrecovered" }], defaults);
  assert.equal(result?.isError, false, result?.error);
  assert.equal(result?.output, "recovered answer");
});

test("stall diagnosis includes bounded activity, turn and retry details", async () => {
  const [result] = await runTasks([{ agent: "reviewer", task: "diagnosticstall" }], { ...defaults, stallMs: 200, timeoutMs: 5000 });
  assert.equal(result?.isError, true);
  assert.match(result?.error ?? "", /Stalled.*last: provider retry 1\/3: 529 overloaded/s);
  assert.match(result?.error ?? "", /1 turns, 1 tool calls, 1 provider retries, last retry error: 529 overloaded/);
  assert.ok(Buffer.byteLength(result?.error ?? "") < 1200);
});

test("compaction failure keeps its diagnosis through the final assistant error", async () => {
  const updates: Progress[] = [];
  const [result] = await runTasks([{ agent: "reviewer", task: "compactionfail" }], { ...defaults, onProgress: (_index, progress) => updates.push(progress) });
  assert.ok(updates.some((progress) => progress.activity === "compacting context"));
  assert.equal(result?.exitCode, 0);
  assert.equal(result?.isError, true);
  assert.equal(result?.error, "Compaction failed: summary failed");
});

test("parent cancellation is not reclassified as a stall during termination", async () => {
  const controller = new AbortController();
  const [result] = await runTasks([{ agent: "reviewer", task: "stall" }], {
    ...defaults, signal: controller.signal, stallMs: 100, killGraceMs: 200,
    onProgress(_index, status) { if (status.phase === "running" && status.activity === "thinking") controller.abort(); },
  });
  assert.match(result?.error ?? "", /Cancelled/);
  assert.doesNotMatch(result?.error ?? "", /Stalled/);
});

test("length stopReason preserves partial text but reports an incomplete response", async () => {
  const [result] = await runTasks([{ agent: "reviewer", task: "length" }], defaults);
  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stopReason, "length");
  assert.equal(result.output, "partial answer");
  assert.equal(result.isError, true);
  assert.match(result.error ?? "", /output limit/);
});

test("abort kills a TERM-resistant descendant even after leader exits", async () => {
  const controller = new AbortController();
  const promise = runTasks([{ agent: "reviewer", task: "descendant" }], { ...defaults, signal: controller.signal, killGraceMs: 200 });
  const timer = setTimeout(() => controller.abort(), 350);
  const [result] = await promise;
  clearTimeout(timer);
  assert.match(result?.error ?? "", /Cancelled/);
  const pid = Number(/DESCENDANT:(\d+)/.exec(result?.stderr ?? "")?.[1]);
  assert.ok(pid > 0, result?.stderr);
  // Give the OS reaper time to remove the killed grandchild.
  for (let attempt = 0; attempt < 30; attempt++) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Descendant ${pid} still exists`);
});

test("four-worker limit and queued cancellation", async () => {
  let active = 0; let maxActive = 0;
  const results = await runTasks(Array.from({ length: 8 }, () => ({ agent: "reviewer", task: "ok" })), {
    ...defaults,
    context: async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 50)); active--; return "context"; },
  });
  assert.ok(results.every((result) => !result.isError));
  assert.equal(maxActive, 4);
  const controller = new AbortController();
  const cancelled = await runTasks(Array.from({ length: 8 }, () => ({ agent: "reviewer", task: "hang" })), {
    ...defaults, signal: controller.signal,
    onProgress(_index, status) { if (status.phase === "running" && status.activity === "starting") controller.abort(); },
  });
  assert.equal(cancelled.length, 8);
  assert.ok(cancelled.every((result) => result.isError && /Cancelled/.test(result.error ?? "")));
});

test("timeout also terminates descendants", async () => {
  const [result] = await runTasks([{ agent: "reviewer", task: "descendant" }], { ...defaults, timeoutMs: 350, killGraceMs: 200 });
  assert.match(result?.error ?? "", /Timed out/);
  const pid = Number(/DESCENDANT:(\d+)/.exec(result?.stderr ?? "")?.[1]);
  assert.ok(pid > 0, result?.stderr);
  for (let attempt = 0; attempt < 30; attempt++) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Descendant ${pid} survived timeout`);
});

test("silent child emits heartbeat and abort listener is removed", async () => {
  const controller = new AbortController();
  const statuses: Progress[] = [];
  const [result] = await runTasks([{ agent: "reviewer", task: "hang" }], {
    ...defaults, signal: controller.signal,
    onProgress(_index, status) { statuses.push(status); if (status.phase === "running" && status.elapsedMs >= 5000) controller.abort(); },
  });
  assert.match(result?.error ?? "", /Cancelled/);
  assert.ok(statuses.some((status) => status.phase === "running" && status.elapsedMs >= 5000 && status.idleMs >= 5000 && status.activity === "starting"));
  assert.equal(statuses.at(-1)?.phase, "failed");
  assert.equal(statuses.at(-1)?.error, result?.error);
  const { getEventListeners } = await import("node:events");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("bounded UTF-8 output and process stderr", async () => {
  assert.ok(Buffer.byteLength(bounded("🙂".repeat(10000))) <= OUTPUT_LIMIT);
  const result = await runProcess({ command: process.execPath, args: ["-e", 'process.stdout.write("x".repeat(100000));process.stderr.write("y".repeat(100000))'], cwd });
  assert.ok(Buffer.byteLength(result.stdout) <= OUTPUT_LIMIT);
  assert.ok(Buffer.byteLength(result.stderr) <= OUTPUT_LIMIT);
  let streamed = "";
  const uncaptured = await runProcess({ command: process.execPath, args: ["-e", 'process.stdout.write("parsed only")'], cwd, captureStdout: false, onStdout(chunk) { streamed += chunk; } });
  assert.equal(uncaptured.stdout, "");
  assert.equal(streamed, "parsed only");
});

test("context is root-to-cwd, bounded, non-executable and rejects symlink escape", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "context-"));
  try {
    const root = join(temp, "repo"); const nested = join(root, "nested");
    await mkdir(join(root, ".git"), { recursive: true }); await mkdir(nested);
    const shared = join(temp, "shared.md"); await writeFile(shared, "shared");
    await writeFile(join(root, "AGENTS.md"), "root\n@../../outside.md");
    await writeFile(join(nested, "CLAUDE.md"), "nested");
    const context = await repositoryContext(nested, shared);
    assert.ok(context.indexOf("shared") < context.indexOf("root\n"));
    assert.ok(context.indexOf("root\n") < context.lastIndexOf("nested"));
    assert.match(context, /@\.\.\/\.\.\/outside.md/); // References remain inert text, never traversed by the loader.
    const sharedLink = join(temp, "shared-link.md");
    await symlink(shared, sharedLink);
    assert.match(await repositoryContext(nested, sharedLink), /Shared user instructions.*shared-link\.md\):\nshared/s);
    await writeFile(shared, "x".repeat(129 * 1024));
    await assert.rejects(repositoryContext(nested, sharedLink), /regular file <=128 KiB/);
    await writeFile(shared, "shared");
    await assert.rejects(repositoryContext(nested, join(temp, "missing-shared.md")), /Shared instructions unreadable at .*missing-shared\.md/);
    const dangling = join(temp, "dangling-shared.md");
    await symlink(join(temp, "moved-away.md"), dangling);
    await assert.rejects(repositoryContext(nested, dangling), /Shared instructions unreadable at .*dangling-shared\.md.*dangling dotfiles symlink/);
    await rm(join(nested, "CLAUDE.md"));
    await symlink(shared, join(nested, "AGENTS.md"));
    await assert.rejects(repositoryContext(nested, shared), /escapes root/);
    await rm(join(nested, "AGENTS.md"));
    await writeFile(join(root, "AGENTS.md"), "x".repeat(129 * 1024));
    await assert.rejects(repositoryContext(nested, shared), /128 KiB/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("Git has fixed operations, option-safe revisions, no shell, no optional locks or external diff", async () => {
  for (const revision of ["--output=/tmp/x", "HEAD;touch x", "HEAD:foo", "$(id)"]) assert.throws(() => gitArgs({ operation: "show", revision }), /Invalid revision/);
  const diff = gitArgs({ operation: "diff", revision: "HEAD~1", path: "--output=bad", staged: true });
  assert.ok(diff.includes("--no-ext-diff")); assert.ok(diff.includes("--no-textconv"));
  assert.ok(diff.indexOf("--") < diff.indexOf("--output=bad"));
  // The workflow itself may live in a dotfiles repository, so probe a fresh temp dir instead.
  const outside = await mkdtemp(join(tmpdir(), "workflow-no-git-"));
  try {
    const result = await inspectGit({ operation: "status" }, outside);
    assert.equal(result.isError, true);
    assert.match(result.stderr, /not a git repository/);
  } finally { await rm(outside, { recursive: true, force: true }); }
});
