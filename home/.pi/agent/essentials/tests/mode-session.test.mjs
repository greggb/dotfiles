import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { modelProfiles } from "../model-profiles.ts";

const installed = join(process.env.PI_RUNTIME_DIR ?? "/opt/homebrew/opt/pi-coding-agent/libexec/lib", "node_modules/@earendil-works/pi-coding-agent/dist/");
const { createAgentSession, ModelRuntime, SessionManager, SettingsManager } = await import(installed + "index.js");
const { loadExtensions } = await import(installed + "core/extensions/loader.js");
const cwd = fileURLToPath(new URL("..", import.meta.url));

async function resourceLoader() {
  const loaded = await loadExtensions([join(cwd, "mode.ts")], cwd);
  assert.deepEqual(loaded.errors, []);
  return {
    getExtensions: () => loaded,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => "Fixture instructions",
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources() {},
    async reload() {},
  };
}

test("real Pi session switches supported profiles without requests, preserves context and tools, and resumes selection", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-mode-session-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = await ModelRuntime.create({ authPath: join(root, "auth.json"), modelsPath: null, modelsStorePath: join(root, "models-store.json"), refreshOnCreate: false, allowModelNetwork: false });
  runtime.hasConfiguredAuth = () => true;
  runtime.checkAuth = async () => ({ ready: true });
  runtime.streamSimple = () => assert.fail("Switching profiles must not request model inference");
  runtime.stream = () => assert.fail("Switching profiles must not request model inference");
  const deep = modelProfiles.find((profile) => profile.name === "deep");
  const settings = { defaultProvider: deep.provider, defaultModel: deep.model, defaultThinkingLevel: deep.thinkingLevel, compaction: { enabled: false } };
  const settingsManager = SettingsManager.inMemory(settings);
  const manager = SessionManager.inMemory(root);
  manager.appendModelChange(deep.provider, deep.model);
  manager.appendThinkingLevelChange(deep.thinkingLevel);
  manager.appendMessage({ role: "user", content: "Keep this conversation", timestamp: Date.now() });
  const options = { cwd: root, agentDir: root, modelRuntime: runtime, model: runtime.getModel(deep.provider, deep.model), thinkingLevel: deep.thinkingLevel, tools: ["read"], sessionManager: manager, settingsManager };
  assert.ok(options.model);
  let { session } = await createAgentSession({ ...options, resourceLoader: await resourceLoader() });
  t.after(() => session.dispose());
  const notices = [];
  const bind = (active) => active.bindExtensions({ uiContext: { notify: (message, type) => notices.push({ message, type }) }, mode: "tui", onError: (error) => assert.fail(JSON.stringify(error)) });
  await bind(session);
  const messages = structuredClone(session.messages);
  const prompt = session.systemPrompt;
  const defaults = structuredClone(settingsManager.getSettings());
  for (const profile of modelProfiles) {
    assert.ok(runtime.getModel(profile.provider, profile.model), profile.model);
    await session.prompt(`/mode ${profile.name}`);
    assert.equal(session.model.provider, profile.provider);
    assert.equal(session.model.id, profile.model);
    assert.equal(session.thinkingLevel, profile.thinkingLevel, `${profile.name} effort must be supported by its configured model`);
    assert.deepEqual(session.getActiveToolNames(), ["read"]);
    assert.deepEqual(session.messages, messages);
    assert.equal(session.systemPrompt, prompt);
    assert.deepEqual(settingsManager.getSettings(), defaults);
    assert.equal(notices.at(-1).type, "info");
  }
  await session.prompt("/mode build");
  session.dispose();
  ({ session } = await createAgentSession({ cwd: root, agentDir: root, modelRuntime: runtime, tools: ["read"], sessionManager: manager, settingsManager, resourceLoader: await resourceLoader() }));
  await bind(session);
  assert.equal(session.model.id, "gpt-6.1-sol");
  assert.equal(session.thinkingLevel, "medium");
  assert.deepEqual(session.messages, messages);
  assert.deepEqual(settingsManager.getSettings(), defaults);
  session.dispose();
  ({ session } = await createAgentSession({ cwd: root, agentDir: root, modelRuntime: runtime, tools: ["read"], sessionManager: manager, settingsManager, resourceLoader: await resourceLoader() }));
  const errors = [];
  const output = [];
  t.mock.method(console, "error", (message) => output.push(message));
  await session.bindExtensions({ mode: "print", onError: (error) => errors.push(error) });
  await session.prompt("/mode typo");
  assert.equal(errors.length, 1);
  assert.match(errors[0].error, /Unknown mode/);
  await session.prompt("Do not send this prompt to the startup model after a failed switch");
  assert.match(output.at(-1), /Input skipped/);
  assert.deepEqual(session.messages, messages);
  await session.prompt("/mode deep");
  assert.equal(session.thinkingLevel, "high");
  assert.match(output.at(-1), /deep.*high effort/);
  assert.deepEqual(settingsManager.getSettings(), defaults);
});
