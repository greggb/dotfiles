import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const installed = join(process.env.PI_RUNTIME_DIR ?? join(homedir(), ".local/share/pi-runtime"), "node_modules/@earendil-works/pi-coding-agent/dist/");
const { loadExtensions } = await import(installed + "core/extensions/loader.js");
const { normalizeBuildSystemPromptOptions, buildSystemPromptSections } = await import(installed + "core/system-prompt.js");
const cwd = fileURLToPath(new URL("..", import.meta.url));
const dayMs = 24 * 60 * 60 * 1000;

test("installed Pi loader injects the shared guide into built system prompt sections", async (t) => {
  const home = await fixture(t);
  await mkdir(join(home, ".agents"));
  const path = join(home, ".agents", "AGENTS.md");
  const content = "Canonical fixture engineering instructions 7b3c";
  await writeFile(path, content);
  const previous = process.env.HOME;
  let extension;
  try {
    process.env.HOME = home;
    assert.equal(homedir(), home);
    extension = await load("shared-instructions.ts");
  } finally {
    restoreHome(previous);
  }
  const [handler] = extension.handlers.get("before_agent_start");
  const event = {
    type: "before_agent_start", messageType: "user", prompt: "test", systemPrompt: "",
    systemPromptOptions: normalizeBuildSystemPromptOptions({ cwd, contextFiles: [{ path: "/project/AGENTS.md", content: "Project instructions" }], skills: [] }),
  };
  const ctx = { hasUI: true, sessionManager: { getSessionId: () => "fixture-session" }, ui: { notify() { assert.fail("Unexpected warning"); } } };
  assert.equal(await handler(event, ctx), undefined);
  assert.deepEqual(event.systemPromptOptions.contextFiles[0], { path, content });
  const sections = buildSystemPromptSections(event.systemPromptOptions);
  assert.ok(Object.values(sections).some((section) => section.includes(content)));
  await handler(event, ctx);
  assert.equal(event.systemPromptOptions.contextFiles.length, 2);
});

test("installed prune extension schedules once per process and commands prune fixture roots immediately", { timeout: 10000 }, async (t) => {
  const home = await fixture(t);
  const sessions = join(home, ".pi", "agent", "sessions");
  const perCwd = join(sessions, "--fixture--");
  const logs = join(home, ".pi", "agent", "subagent-logs");
  await mkdir(perCwd, { recursive: true });
  await mkdir(logs, { recursive: true });
  const current = await oldFile(perCwd, "current.jsonl");
  const oldSession = await oldFile(perCwd, "old.jsonl");
  const oldLog = await oldFile(logs, "failure.jsonl");
  const sibling = await oldFile(join(home, ".pi", "agent"), "outside.jsonl");
  const notices = [];
  const notified = Promise.withResolvers();
  const ctx = {
    hasUI: true,
    sessionManager: { getSessionDir: () => perCwd, getSessionFile: () => current },
    ui: { notify(message, type) { notices.push({ message, type }); notified.resolve(); } },
  };
  const previous = process.env.HOME;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.HOME = home;
    // An inherited override would point pruning at a real agent directory.
    process.env.PI_CODING_AGENT_DIR = join(home, ".pi", "agent");
    const extension = await load("prune.ts");
    assert.ok((await lstat(oldSession)).isFile(), "Loading the factory must not prune");
    const [start] = extension.handlers.get("session_start");
    assert.equal(start({ type: "session_start", reason: "startup" }, ctx), undefined);
    start({ type: "session_start", reason: "new" }, ctx);
    await notified.promise;
    assert.equal(notices.length, 1);
    assert.match(notices[0].message, /Pruned 1 sessions and 1 subagent logs older than 30 days/);
    await assert.rejects(lstat(oldSession), { code: "ENOENT" });
    await assert.rejects(lstat(oldLog), { code: "ENOENT" });
    assert.ok((await lstat(current)).isFile());
    assert.ok((await lstat(sibling)).isFile());

    const manualSession = await oldFile(sessions, "manual.jsonl", 3);
    const manualLog = await oldFile(logs, "manual.jsonl", 3);
    const reloaded = await load("prune.ts");
    const [restart] = reloaded.handlers.get("session_start");
    assert.equal(restart({ type: "session_start", reason: "reload" }, ctx), undefined);
    assert.ok((await lstat(manualSession)).isFile());
    const command = reloaded.commands.get("prune-sessions");
    assert.ok(command);
    const rootCtx = { ...ctx, sessionManager: { ...ctx.sessionManager, getSessionDir: () => sessions } };
    for (const args of ["0", "-1", "bad", "Infinity", "1 2"]) await command.handler(args, rootCtx);
    assert.ok((await lstat(manualSession)).isFile());
    assert.ok(notices.slice(1).every((notice) => notice.type === "warning"));
    await command.handler("2", rootCtx);
    await assert.rejects(lstat(manualSession), { code: "ENOENT" });
    await assert.rejects(lstat(manualLog), { code: "ENOENT" });
    assert.ok((await lstat(sibling)).isFile(), "A sessions root must not become its parent");
    assert.ok((await lstat(current)).isFile());
    await command.handler("", rootCtx);
    assert.match(notices.at(-1).message, /Pruned 0 sessions and 0 subagent logs older than 30 days/);
    const count = notices.length;
    await command.handler("", { ...rootCtx, hasUI: false });
    assert.equal(notices.length, count);

    const unrelated = await oldFile(home, "unrelated.jsonl");
    const working = join(home, "working");
    await mkdir(working);
    const previousCwd = process.cwd();
    try {
      process.chdir(working);
      await command.handler("", { ...ctx, sessionManager: { getSessionDir: () => "", getSessionFile: () => undefined } });
    } finally {
      process.chdir(previousCwd);
    }
    assert.ok((await lstat(unrelated)).isFile(), "In-memory sessions must not prune the working directory's parent");
    const custom = join(home, "custom-sessions", "--cwd--");
    await mkdir(custom, { recursive: true });
    const customOld = await oldFile(custom, "old.jsonl");
    const customSibling = await oldFile(join(home, "custom-sessions"), "sibling.jsonl");
    await command.handler("", { ...ctx, sessionManager: { getSessionDir: () => custom, getSessionFile: () => undefined } });
    assert.ok((await lstat(customOld)).isFile(), "A custom --session-dir is never pruned");
    assert.ok((await lstat(customSibling)).isFile(), "A custom --session-dir parent is never pruned");
  } finally {
    restoreHome(previous);
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  }
});

async function load(name) {
  const loaded = await loadExtensions([join(cwd, name)], cwd);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  return loaded.extensions[0];
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-api-housekeeping-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function oldFile(root, name, days = 31) {
  const path = join(root, name);
  await writeFile(path, "fixture");
  const time = (Date.now() - days * dayMs) / 1000;
  await utimes(path, time, time);
  return path;
}

function restoreHome(previous) {
  if (previous === undefined) delete process.env.HOME;
  else process.env.HOME = previous;
}
