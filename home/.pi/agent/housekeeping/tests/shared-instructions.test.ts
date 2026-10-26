import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import { createSharedInstructions } from "../shared-instructions.ts";

test("prepends shared instructions and reads edits on the next run", async (t) => {
  const { path } = await fixture(t);
  await writeFile(path, "Canonical guide");
  const handler = createSharedInstructions({ path });
  const first = event([{ path: "/project/AGENTS.md", content: "Project" }]);
  assert.equal(await handler(first, context()), undefined);
  assert.deepEqual(first.systemPromptOptions.contextFiles, [
    { path, content: "Canonical guide" }, { path: "/project/AGENTS.md", content: "Project" },
  ]);
  await writeFile(path, "Updated guide");
  const next = event();
  await handler(next, context());
  assert.equal(next.systemPromptOptions.contextFiles[0]?.content, "Updated guide");
});

test("does not duplicate an existing path or realpath", async (t) => {
  const { root, path } = await fixture(t);
  await writeFile(path, "Guide");
  const alias = join(root, "alias.md");
  await symlink(path, alias);
  const handler = createSharedInstructions({ path });
  for (const existing of [path, alias]) {
    const input = event([{ path: existing, content: "Already loaded" }]);
    await handler(input, context());
    assert.deepEqual(input.systemPromptOptions.contextFiles, [{ path: existing, content: "Already loaded" }]);
  }
});

test("accepts a symlinked shared guide and retains the canonical display path", async (t) => {
  const { root, path } = await fixture(t);
  const target = join(root, "dotfiles-guide.md");
  await writeFile(target, "Stowed instructions");
  await symlink(target, path);
  const input = event();
  await createSharedInstructions({ path })(input, context());
  assert.deepEqual(input.systemPromptOptions.contextFiles, [{ path, content: "Stowed instructions" }]);
});

test("missing instructions do not throw and warn only once per session", async (t) => {
  const { path } = await fixture(t);
  const handler = createSharedInstructions({ path });
  const ctx = context();
  await handler(event(), ctx);
  await handler(event(), ctx);
  assert.equal(ctx.notices.length, 1);
  assert.equal(ctx.notices[0]?.type, "warning");
  assert.match(ctx.notices[0]?.message ?? "", /Could not load shared instructions/);
  await handler(event(), { ...ctx, sessionManager: { getSessionId: () => "second" } });
  assert.equal(ctx.notices.length, 2);
});

test("headless failures do not notify and a repaired guide loads without reload", async (t) => {
  const { path } = await fixture(t);
  const handler = createSharedInstructions({ path });
  const ctx = context();
  await handler(event(), { ...ctx, hasUI: false });
  assert.deepEqual(ctx.notices, []);
  await handler(event(), ctx);
  assert.equal(ctx.notices.length, 1);
  await writeFile(path, "Repaired");
  const input = event();
  await handler(input, ctx);
  assert.equal(input.systemPromptOptions.contextFiles[0]?.content, "Repaired");
});

test("rejects oversized and non-regular guides; accepts exactly 128 KiB", async (t) => {
  const { path } = await fixture(t);
  const handler = createSharedInstructions({ path });
  const ctx = context();
  await writeFile(path, "x".repeat(128 * 1024 + 1));
  const oversized = event();
  await handler(oversized, ctx);
  assert.deepEqual(oversized.systemPromptOptions.contextFiles, []);
  assert.equal(ctx.notices.length, 1);
  await writeFile(path, "x".repeat(128 * 1024));
  const valid = event();
  await handler(valid, ctx);
  assert.equal(valid.systemPromptOptions.contextFiles[0]?.content.length, 128 * 1024);
  await rm(path);
  await mkdir(path);
  const directory = event();
  await handler(directory, ctx);
  assert.deepEqual(directory.systemPromptOptions.contextFiles, []);
});

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-shared-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, path: join(root, "AGENTS.md") };
}

function event(contextFiles: { path: string; content: string }[] = []): Pick<BeforeAgentStartEvent, "systemPromptOptions"> {
  return { systemPromptOptions: {
    cwd: tmpdir(), selectedTools: [], hiddenTools: [], toolSnippets: {}, toolGuidelines: {},
    promptGuidelines: [], appendSystemPrompt: "", sections: {}, contextFiles, skills: [],
  } };
}

function context() {
  const notices: { message: string; type: string | undefined }[] = [];
  return {
    hasUI: true, notices, sessionManager: { getSessionId: () => "first" },
    ui: { notify(message: string, type?: "info" | "warning" | "error") { notices.push({ message, type }); } },
  };
}
