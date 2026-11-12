import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const installed = join(process.env.PI_RUNTIME_DIR ?? "/opt/homebrew/opt/pi-coding-agent/libexec/lib", "node_modules/@earendil-works/pi-coding-agent/dist/");
const { loadExtensions } = await import(installed + "core/extensions/loader.js");
const { loadThemeFromPath } = await import(installed + "modes/interactive/theme/theme.js");
const require = createRequire(installed + "index.js");
const { visibleWidth } = await import(require.resolve("@earendil-works/pi-tui"));
const cwd = fileURLToPath(new URL("..", import.meta.url));
const theme = loadThemeFromPath(fileURLToPath(new URL("../../themes/tokyo-night.json", import.meta.url)), "truecolor");

async function fixture(t) {
  const loaded = await loadExtensions([join(cwd, "readable-footer.ts")], cwd);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions[0];
  const usage = { input: 12000, output: 1000, cacheRead: 48000, cacheWrite: 0, cost: { total: 0.12 } };
  const state = {
    scans: 0, renders: 0, disposed: 0, leaf: "one", thinking: "high", branch: "main", statuses: new Map(),
    entries: [{ type: "message", timestamp: new Date(Date.now() - 30000).toISOString(), message: { role: "assistant", provider: "github-copilot", model: "gpt-6.1-sol", stopReason: "stop", usage } }],
  };
  loaded.runtime.getThinkingLevel = () => state.thinking;
  let component;
  let branchChanged;
  const ctx = {
    mode: "tui", hasUI: true,
    model: { name: "GPT-6.1 Sol", id: "gpt-6.1-sol", provider: "github-copilot", reasoning: true },
    getContextUsage: () => ({ tokens: 430000, contextWindow: 1000000, percent: 43 }),
    sessionManager: {
      getLeafId: () => state.leaf,
      getCwd: () => "/work/東京/café/🧪",
      getSessionName: () => "界面 work",
      getBranch: () => state.entries,
      getEntries: () => { state.scans++; return state.entries; },
    },
    ui: {
      notify() {},
      setFooter(factory) {
        component?.dispose();
        component = factory?.({ requestRender: () => { state.renders++; } }, theme, {
          getGitBranch: () => state.branch,
          getExtensionStatuses: () => state.statuses,
          onBranchChange(handler) { branchChanged = handler; return () => { state.disposed++; }; },
        });
      },
    },
  };
  const [start] = extension.handlers.get("session_start");
  start({ reason: "startup" }, ctx);
  t.after(() => component?.dispose());
  return { ctx, state, extension, component: () => component, branchChanged: () => branchChanged() };
}

test("installed footer renders one Tokyo Night line and fits Unicode content into narrow panes", async (t) => {
  const f = await fixture(t);
  f.state.branch = "東京/界面";
  for (const width of [0, 1, 10, 24, 40, 80, 120, 200]) {
    const lines = f.component().render(width);
    assert.equal(lines.length, 1);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
  const [line] = f.component().render(200);
  assert.ok(line.includes("[GPT-6.1 Sol · high]"));
  assert.ok(line.includes("東京"));
  assert.ok(line.includes(theme.getFgAnsi("accent")));
  assert.ok(line.includes("ctx ▰▰▰▰▱▱▱▱▱▱ 43% /1.0M"));
  assert.ok(line.includes("cache 80%"));
  assert.ok(line.includes("ago"));
  assert.ok(line.includes("~$0.12"));
});

test("redraws reuse totals while branch, effort and context updates remain live", async (t) => {
  const f = await fixture(t);
  f.component().render(200);
  f.state.branch = "feature/status";
  f.state.thinking = "medium";
  f.branchChanged();
  const [line] = f.component().render(200);
  assert.equal(f.state.scans, 1);
  assert.ok(line.includes("medium"));
  assert.ok(line.includes("feature/status"));
  f.state.leaf = "two";
  f.ctx.getContextUsage = () => ({ tokens: 910000, contextWindow: 1000000, percent: 91 });
  assert.ok(f.component().render(200)[0].includes(theme.getFgAnsi("error")));
  assert.equal(f.state.scans, 2);
});

test("cache metadata follows the active model and recognizes cache warming entries", async (t) => {
  const f = await fixture(t);
  f.ctx.model.promptCache = { short: 300 };
  assert.ok(f.component().render(200)[0].includes("left"));
  f.ctx.model.id = "another-model";
  assert.ok(f.component().render(200)[0].includes("cache -"));
  f.state.entries.push({ type: "usage", kind: "cache_warm", provider: "github-copilot", model: "another-model", timestamp: new Date().toISOString(), usage: { input: 10, output: 1, cacheRead: 10, cacheWrite: 0, cost: { total: 0.01 } } });
  f.state.leaf = "warm";
  assert.ok(f.component().render(200)[0].includes("cache 50%"));
});

test("cache clock redraws every second and disposal stops timers and branch subscriptions", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = await fixture(t);
  const renders = f.state.renders;
  t.mock.timers.tick(1000);
  assert.equal(f.state.renders, renders + 1);
  f.component().dispose();
  const stopped = f.state.renders;
  t.mock.timers.tick(1000);
  assert.equal(f.state.renders, stopped);
  assert.equal(f.state.disposed, 1);
});

test("extension statuses stay on an optional second line and footer toggle restores the built-in UI", async (t) => {
  const f = await fixture(t);
  f.state.statuses.set("background", "job running\nwaiting");
  const lines = f.component().render(30);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => visibleWidth(line) <= 30 && !line.includes("\n")));
  await f.extension.commands.get("footer").handler("", f.ctx);
  assert.equal(f.component(), undefined);
  assert.equal(f.state.disposed, 1);
  await f.extension.commands.get("footer").handler("", f.ctx);
  assert.ok(f.component());
});
