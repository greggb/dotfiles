import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const installed = join(process.env.PI_RUNTIME_DIR ?? "/opt/homebrew/opt/pi-coding-agent/libexec/lib", "node_modules/@earendil-works/pi-coding-agent/dist/");
const { loadExtensions } = await import(installed + "core/extensions/loader.js");
const cwd = fileURLToPath(new URL("..", import.meta.url));

test("installed Pi loads the guard, web tools, and model profiles together", async () => {
  const loaded = await loadExtensions([join(cwd, "guard.ts"), join(cwd, "web.ts"), join(cwd, "mode.ts")], cwd);
  assert.deepEqual(loaded.errors, []);
  const [guard, web, mode] = loaded.extensions;
  assert.equal(guard.handlers.get("tool_call").length, 1);
  assert.deepEqual([...web.tools.keys()].sort(), ["web_fetch", "web_search"]);
  assert.deepEqual([...mode.commands.keys()], ["mode"]);
  assert.deepEqual([...mode.handlers.keys()], ["input"]);
});

test("Homebrew Pi loads every configured extension including its handoff example", async () => {
  const settings = JSON.parse(await readFile(new URL("../../settings.json", import.meta.url), "utf8"));
  const loaded = await loadExtensions(settings.extensions, cwd);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, settings.extensions.length);
  assert.ok(loaded.extensions.some((extension) => extension.commands.has("handoff")));
  assert.ok(loaded.extensions.some((extension) => extension.commands.has("mode")));
});

test("web tool uses its machine-local endpoint without a network request", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-api-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = new Map(["PI_CODING_AGENT_DIR", "PI_WEB_ENDPOINT", "GROVE_API_KEY"].map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.PI_CODING_AGENT_DIR = root;
  delete process.env.PI_WEB_ENDPOINT;
  process.env.GROVE_API_KEY = "fixture-key";
  const endpoint = "https://gateway.example.test/v1/messages";
  await writeFile(join(root, "web.local.json"), JSON.stringify({ endpoint }));
  let requested = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, endpoint);
    assert.equal(options.headers["x-api-key"], "fixture-key");
    requested = true;
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Fixture answer" }] }));
  });
  const loaded = await loadExtensions([join(cwd, "web.ts")], cwd);
  assert.deepEqual(loaded.errors, []);
  const tool = loaded.extensions[0].tools.get("web_search").definition;
  const result = await tool.execute("fixture", { query: "fixture query" }, undefined);
  assert.equal(requested, true);
  assert.ok(result.content[0].text.includes("Fixture answer"));
});
