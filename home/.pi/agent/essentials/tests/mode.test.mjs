import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { modelProfiles } from "../model-profiles.ts";

const installed = join(process.env.PI_RUNTIME_DIR ?? "/opt/homebrew/opt/pi-coding-agent/libexec/lib", "node_modules/@earendil-works/pi-coding-agent/dist/");
const { loadExtensions } = await import(installed + "core/extensions/loader.js");
const cwd = fileURLToPath(new URL("..", import.meta.url));

async function fixture() {
  const loaded = await loadExtensions([join(cwd, "mode.ts")], cwd);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  const command = extension.commands.get("mode");
  assert.ok(command);
  const changes = [];
  const notices = [];
  let effort = "high";
  loaded.runtime.setModel = async (model) => { changes.push(["model", model.provider, model.id]); return true; };
  loaded.runtime.setThinkingLevel = (level) => { changes.push(["effort", level]); effort = level; };
  loaded.runtime.getThinkingLevel = () => effort;
  const ctx = {
    hasUI: true,
    isIdle: () => true,
    modelRegistry: { find: (provider, id) => ({ provider, id }) },
    ui: {
      select: async () => undefined,
      notify: (message, type) => notices.push({ message, type }),
    },
  };
  return { ...loaded, extension, command, ctx, changes, notices };
}

test("profiles select model and effort together without workflow phases or tools", async () => {
  const f = await fixture();
  assert.deepEqual(modelProfiles.map(({ name, model, thinkingLevel }) => [name, model, thinkingLevel]), [
    ["fast", "gpt-6-luna", "medium"],
    ["build", "gpt-6.1-sol", "medium"],
    ["deep", "gpt-6.1-sol", "high"],
    ["second", "claude-opus-5.5", "high"],
  ]);
  assert.deepEqual([...f.extension.handlers.keys()], ["input"]);
  assert.equal(f.extension.tools.size, 0);
  for (const profile of modelProfiles) {
    f.changes.length = 0;
    await f.command.handler(` ${profile.name} `, f.ctx);
    assert.deepEqual(f.changes, [["model", profile.provider, profile.model], ["effort", profile.thinkingLevel]]);
    assert.match(f.notices.at(-1).message, new RegExp(`${profile.name}: ${profile.provider}/${profile.model} · ${profile.thinkingLevel} effort`));
    assert.equal(f.notices.at(-1).type, "info");
  }
});

test("mode picker and completions expose the configured model and effort", async () => {
  const f = await fixture();
  const completions = f.command.getArgumentCompletions("b");
  assert.equal(completions.length, 1);
  assert.equal(completions[0].value, "build");
  assert.match(completions[0].label, /gpt-6.1-sol.*medium effort/);
  assert.deepEqual(f.command.getArgumentCompletions("missing"), []);
  let options;
  f.ctx.ui.select = async (_title, choices) => { options = choices; return choices[1]; };
  await f.command.handler("", f.ctx);
  assert.equal(options.length, modelProfiles.length);
  assert.deepEqual(f.changes.at(-1), ["effort", "medium"]);
});

test("cancelling the picker or entering an unknown mode leaves selection unchanged", async () => {
  const f = await fixture();
  await f.command.handler("", f.ctx);
  assert.equal(f.notices.length, 0);
  await f.command.handler("build high", f.ctx);
  assert.match(f.notices[0].message, /Unknown mode/);
  assert.deepEqual(f.changes, []);
});

test("busy runs are not interrupted or switched", async () => {
  const f = await fixture();
  f.ctx.isIdle = () => false;
  await f.command.handler("fast", f.ctx);
  assert.deepEqual(f.changes, []);
  assert.match(f.notices[0].message, /current run finishes/);
});

test("missing models and authentication failures do not change effort or fall back", async () => {
  const f = await fixture();
  f.ctx.modelRegistry.find = () => undefined;
  await f.command.handler("second", f.ctx);
  assert.deepEqual(f.changes, []);
  assert.match(f.notices.at(-1).message, /not in the model catalog/);
  f.ctx.modelRegistry.find = (provider, id) => ({ provider, id });
  f.runtime.setModel = async () => false;
  await f.command.handler("fast", f.ctx);
  assert.deepEqual(f.changes, []);
  assert.match(f.notices.at(-1).message, /Selection unchanged/);
  f.runtime.setModel = async () => { throw new Error("Authentication unavailable"); };
  await f.command.handler("fast", f.ctx);
  assert.deepEqual(f.changes, []);
  assert.match(f.notices.at(-1).message, /Authentication unavailable/);
});

test("confirmation reports effective effort when the runtime clamps a request", async () => {
  const f = await fixture();
  f.runtime.getThinkingLevel = () => "medium";
  await f.command.handler("second", f.ctx);
  assert.match(f.notices.at(-1).message, /medium effort.*requested high.*adjusted/);
  assert.equal(f.notices.at(-1).type, "warning");
});

test("noninteractive selection requires an explicit profile and confirms effective effort on stderr", async (t) => {
  const f = await fixture();
  const output = [];
  t.mock.method(console, "error", (message) => output.push(message));
  f.ctx.hasUI = false;
  f.ctx.ui.select = () => assert.fail("No terminal dialog in print mode");
  f.ctx.ui.notify = () => assert.fail("No invisible notifications in print mode");
  await assert.rejects(f.command.handler("", f.ctx), /Usage/);
  await f.command.handler("build", f.ctx);
  assert.deepEqual(f.changes.at(-1), ["effort", "medium"]);
  assert.match(output.at(-1), /build.*medium effort/);
  f.runtime.getThinkingLevel = () => "medium";
  await f.command.handler("second", f.ctx);
  assert.match(output.at(-1), /medium effort.*requested high.*adjusted/);
});

test("headless selection failures surface errors and block input until a successful switch", async (t) => {
  const f = await fixture();
  const output = [];
  t.mock.method(console, "error", (message) => output.push(message));
  f.ctx.hasUI = false;
  f.ctx.ui.notify = () => assert.fail("No invisible errors in print mode");
  const [input] = f.extension.handlers.get("input");
  assert.equal(input({}, f.ctx), undefined);
  await assert.rejects(f.command.handler("typo", f.ctx), /Unknown mode/);
  f.ctx.modelRegistry.find = () => undefined;
  await assert.rejects(f.command.handler("second", f.ctx), /not in the model catalog/);
  f.ctx.modelRegistry.find = (provider, id) => ({ provider, id });
  f.runtime.setModel = async () => false;
  await assert.rejects(f.command.handler("fast", f.ctx), /Selection unchanged/);
  f.runtime.setModel = async () => { throw new Error("Authentication unavailable"); };
  await assert.rejects(f.command.handler("fast", f.ctx), /Authentication unavailable/);
  assert.deepEqual(f.changes, []);
  assert.deepEqual(input({}, f.ctx), { action: "handled" });
  assert.match(output.at(-1), /Input skipped after model selection failure/);
  f.runtime.setModel = async () => true;
  await f.command.handler("build", f.ctx);
  assert.equal(input({}, f.ctx), undefined);
});
