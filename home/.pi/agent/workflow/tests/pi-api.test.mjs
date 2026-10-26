import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { childArgs } from "../runner.ts";
import { getRole } from "../roles.ts";
import { classify, resolveToolPath } from "../policy.ts";

const installed = join(process.env.PI_RUNTIME_DIR ?? join(homedir(), ".local/share/pi-runtime"), "node_modules/@earendil-works/pi-coding-agent/dist/");
const { parseArgs } = await import(installed + "cli/args.js");
const { loadExtensions } = await import(installed + "core/extensions/loader.js");
const { resolvePath } = await import(installed + "utils/paths.js");
const cwd = fileURLToPath(new URL("..", import.meta.url));
const requirePi = createRequire(realpathSync(installed + "index.js"));
const { Value } = await import(requirePi.resolve("typebox/value"));

test("policy lexical paths match installed Pi native-tool normalization", () => {
  for (const path of ["@auth.json", "@.env", "~/file", "@~/.pi/agent", "file:///project/%2Eenv", "@file:///project/auth.json", "dir/../auth.json", "space\u00a0name", "@@auth.json"]) {
    assert.equal(resolveToolPath(path, cwd), resolvePath(path, cwd, { normalizeUnicodeSpaces: true, stripAtPrefix: true }), path);
  }
});

test("installed Pi parses every child flag, including explicit policy with discovery disabled", () => {
  for (const name of ["implementer", "diagnose"]) {
    const skills = name === "implementer" ? ["/trusted/skill"] : [];
    const parsed = parseArgs(childArgs(getRole(name), "entry", "prompt", skills).slice(1));
    assert.deepEqual(parsed.diagnostics, []);
    assert.equal(parsed.unknownFlags.size, 0);
    assert.equal(parsed.noExtensions, true);
    assert.equal(parsed.extensions.length, 1);
    assert.equal(parsed.noMcp, true);
    assert.equal(parsed.noContextFiles, true);
    assert.equal(parsed.noSkills, true);
    assert.deepEqual(parsed.skills ?? [], skills);
    assert.equal(parsed.projectTrustOverride, false);
    assert.equal(parsed.mode, "json");
    assert.equal(parsed.print, true);
    if (name === "diagnose") assert.deepEqual(parsed.tools, ["read", "grep", "find", "ls", "git_inspect", "bash"]);
  }
});

test("model-visible tasks-only requests validate and reach dispatch; obsolete dual shape is rejected", async () => {
  const loaded = await loadExtensions([fileURLToPath(new URL("../extension.ts", import.meta.url))], cwd);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  const extension = loaded.extensions[0];
  assert.ok(extension.commands.has("agents"));
  let costReport = "";
  await extension.commands.get("task-cost").handler("", { sessionManager: { getBranch: () => [] }, ui: { notify(text) { costReport = text; } } });
  assert.equal(costReport, "No recorded model usage on this branch yet.");
  let agents = "";
  await extension.commands.get("agents").handler("", { ui: { notify(text) { agents = text; } } });
  for (const [agent, label] of [["explore", "Luna"], ["diagnose", "Luna"], ["implementer", "Sol"], ["reviewer", "Sol"], ["reviewer-deepseek", "DeepSeek"], ["reviewer-opus", "Opus"]]) {
    assert.ok(agents.includes(`${agent} (${label}): `));
  }
  assert.match(agents, /explore \(Luna\): .+ \(medium, read-only\)/);
  assert.match(agents, /diagnose \(Luna\): github-copilot\/gpt-6-luna \(medium, diagnose \(read-only \+ bash\)\)/);
  assert.match(agents, /implementer \(Sol\): .+ \(medium, implementation\)/);
  const { definition } = extension.tools.get("subagent");
  assert.match(definition.description, /Roles: explore, diagnose, implementer,/);
  assert.match(definition.description, /Deadlines: implementer 10 minutes, other roles 5 minutes;/);
  assert.match(definition.promptGuidelines[0], /^Always call subagent with \{tasks:/);
  assert.match(definition.promptGuidelines[1], /^Children see none of your transcript and have no MCP access\./);
  assert.ok(!definition.promptGuidelines.some((line) => /Scale process to risk|review round/.test(line)), "tier and review policy belongs in AGENTS.md");
  assert.equal(definition.executionMode, "sequential");
  assert.equal(definition.parameters.type, "object");
  assert.deepEqual(Object.keys(definition.parameters.properties), ["tasks"]);
  assert.deepEqual(definition.parameters.required, ["tasks"]);
  for (const params of [{}, { agent: "reviewer", task: "task" }, { tasks: [] }, { tasks: [{ agent: "reviewer" }] }, { tasks: [{ agent: "reviewer", task: "task" }], agent: "reviewer", task: "task", cwd }]) {
    assert.equal(Value.Check(definition.parameters, params), false, JSON.stringify(params));
  }
  for (const directory of [undefined, null, cwd]) {
    const request = { tasks: [{ agent: "reviewer", task: "Review fixture", ...(directory === undefined ? {} : { cwd: directory }) }] };
    assert.equal(Value.Check(definition.parameters, request), true);
    const cancelled = new AbortController(); cancelled.abort();
    const statuses = []; const updates = [];
    const accepted = await definition.execute("test", request, cancelled.signal, (update) => updates.push(update.content[0].text), {
      cwd, ui: { setStatus(key, text) { assert.equal(key, "workflow:test"); statuses.push(text); } },
    });
    assert.deepEqual(statuses, ["✗ reviewer failed: Cancelled before start", undefined]);
    assert.match(updates[0], /^reviewer \(Sol\) · failed after 0s: Cancelled before start$/);
    assert.equal(accepted.details.results.length, 1);
    assert.equal(accepted.details.results[0].agent, "reviewer");
    assert.match(accepted.details.results[0].error, /Cancelled before start/);
    assert.equal(accepted.usage, undefined);
    assert.equal(Object.hasOwn(accepted, "usage"), false);
    assert.equal(accepted.content[0].text.split("\n")[0], "[1] reviewer github-copilot/gpt-6.1-sol: FAILED (exit=null, signal=null, stopReason=none)");
  }
  const updates = [];
  const result = await definition.execute("test", { tasks: [{ agent: "unknown", task: "task" }, { agent: "also-unknown", task: "task" }] }, undefined, (update) => updates.push(update.content[0].text), { cwd, ui: { setStatus() {} } });
  assert.match(updates[0], /\nalso-unknown \(also-unknown\) · queued$/);
  assert.match(updates.at(-1), /\nalso-unknown \(also-unknown\) · failed after/);
  assert.equal(result.isError, true);
  assert.equal(result.details.results.length, 2);
  assert.ok(result.content[0].text.includes("unknown"));
  assert.ok(result.content[0].text.includes("also-unknown"));
});

test("loaded execute returns all child usage, formatted headers and transcript diagnostics", async () => {
  const temp = await mkdtemp(join(cwd, "tests", "pi-execute-"));
  const oldHome = process.env.HOME;
  const oldEntry = process.argv[1];
  try {
    process.env.HOME = temp;
    process.argv[1] = fileURLToPath(new URL("./fake-child.ts", import.meta.url));
    await mkdir(join(temp, ".agents"));
    await writeFile(join(temp, ".agents", "AGENTS.md"), "test instructions");
    const loaded = await loadExtensions([fileURLToPath(new URL("../extension.ts", import.meta.url))], cwd);
    assert.deepEqual(loaded.errors, []);
    const { definition } = loaded.extensions[0].tools.get("subagent");
    assert.ok(definition.promptGuidelines.includes("Timeouts, stalls, auth/model errors and cancellations are real failures: never silently substitute models or claim success. Retry at most once, and only with a narrower or clarified brief (a stall may be retried once unchanged); otherwise report the blocker and ask before doing the work yourself. Failed runs include a transcript path for diagnosis."));
    const context = { cwd, ui: { setStatus() {} } };
    const result = await definition.execute("test", { tasks: ["usage", "usagefailure", "ok"].map((task) => ({ agent: "reviewer", task })) }, undefined, undefined, context);
    assert.equal(result.isError, true);
    assert.deepEqual(result.usage, { input: 164000, output: 12000, cacheRead: 2400000, cacheWrite: 8000, totalTokens: 2584000,
      cost: { input: 0.08, output: 0.12, cacheRead: 0.02, cacheWrite: 0.02, total: 0.24 } });
    const text = result.content[0].text;
    assert.ok(text.startsWith("[1] reviewer github-copilot/gpt-6.1-sol: OK (exit=0, signal=null, stopReason=stop) · 82k in, 6k out, 1.2M cached, $0.12\n"));
    assert.ok(text.includes("[2] reviewer github-copilot/gpt-6.1-sol: FAILED (exit=0, signal=null, stopReason=error) · 82k in, 6k out, 1.2M cached, $0.12\n"));
    assert.ok(text.includes("[3] reviewer github-copilot/gpt-6.1-sol: OK (exit=0, signal=null, stopReason=stop)\n"));
    assert.ok(text.includes(`\ntranscript: ${result.details.results[1].transcript}`));
    assert.doesNotMatch(text.split("\n")[0], /\u2014/);
    const logDir = join(temp, ".pi", "agent", "subagent-logs");
    assert.equal((await readdir(logDir)).length, 1);
    await rm(logDir, { recursive: true });
    await writeFile(logDir, "not a directory");
    const failed = await definition.execute("test", { tasks: [{ agent: "reviewer", task: "auth" }] }, undefined, undefined, context);
    assert.equal(failed.details.results[0].error, "Missing authentication for configured model");
    assert.match(failed.content[0].text, /\ntranscript write failed: /);
    assert.equal(failed.usage, undefined);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    process.argv[1] = oldEntry;
    await rm(temp, { recursive: true, force: true });
  }
});

test("child policy registers only read-only inspection, blocks arbitrary tools", async () => {
  const old = process.env.PI_WORKFLOW_ROLE;
  process.env.PI_WORKFLOW_ROLE = "reviewer";
  try {
    const loaded = await loadExtensions([fileURLToPath(new URL("../child-policy.ts", import.meta.url))], cwd);
    assert.deepEqual(loaded.errors, []);
    const extension = loaded.extensions[0];
    assert.deepEqual([...extension.tools.keys()], ["git_inspect"]);
    const [guard] = extension.handlers.get("tool_call");
    for (const toolName of ["bash", "write", "edit", "subagent", "codemode", "mcp__anything"]) {
      assert.equal((await guard({ toolName }, {})).block, true);
    }
    for (const toolName of ["read", "grep", "find", "ls", "git_inspect"]) assert.equal(await guard({ toolName, input: {} }, { cwd }), undefined);
  } finally {
    if (old === undefined) delete process.env.PI_WORKFLOW_ROLE;
    else process.env.PI_WORKFLOW_ROLE = old;
  }
});

test("diagnose child allows read-only bash and blocks writes without changing implementer policy", async () => {
  const old = process.env.PI_WORKFLOW_ROLE;
  const allowed = ["uv run pytest tests/test_x.py -x", "mise exec -- pnpm --dir web run test src/a.test.ts", "git diff --stat", "tail -n 200 app.log | grep ERROR", "make check", "curl -s localhost:8000/health"];
  const blocked = ["echo x > a.txt", "sed -i s/a/b/ f", "rm -rf build", "pnpm add zod", "uv sync", "make format", "ruff format .", "git checkout -- .", 'bash -c "rm x"', "cat a | tee b"];
  try {
    for (const role of ["diagnose", "implementer"]) {
      process.env.PI_WORKFLOW_ROLE = role;
      const loaded = await loadExtensions([fileURLToPath(new URL("../child-policy.ts", import.meta.url))], cwd);
      assert.deepEqual(loaded.errors, []);
      const [guard] = loaded.extensions[0].handlers.get("tool_call");
      for (const command of [...allowed, ...blocked]) {
        const input = { command, timeout: 999 };
        const result = await guard({ toolName: "bash", input }, { cwd });
        assert.equal(input.timeout, 300);
        const baseline = classify({ name: "bash", input: { command }, cwd });
        if (role === "diagnose" && blocked.includes(command)) {
          assert.equal(result.block, true, command);
          assert.match(result.reason, /^Diagnose role is read-only: .+\. Report the needed change to the parent instead\.$/);
        } else assert.equal(Boolean(result?.block), baseline.action !== "allow", `${role}: ${command}`);
      }
      if (role === "diagnose") {
        assert.equal((await guard({ toolName: "bash", input: { command: "echo x > a.txt" } }, { cwd })).reason,
          "Diagnose role is read-only: output redirection to a.txt. Report the needed change to the parent instead.");
        for (const toolName of ["edit", "write", "subagent", "mcp__anything"]) assert.equal((await guard({ toolName, input: {} }, { cwd })).block, true);
        assert.equal((await guard({ toolName: "bash", input: { command: "curl --json '{}' localhost:8000" } }, { cwd })).block, true);
        assert.equal((await guard({ toolName: "read", input: { path: ".env" } }, { cwd })).block, true);
      }
    }
  } finally {
    if (old === undefined) delete process.env.PI_WORKFLOW_ROLE;
    else process.env.PI_WORKFLOW_ROLE = old;
  }
});

test("parent guard allows routine work, confirms side effects once, denies secrets and noninteractive mutations", async () => {
  const loaded = await loadExtensions([fileURLToPath(new URL("../parent-policy.ts", import.meta.url))], cwd);
  assert.deepEqual(loaded.errors, []);
  loaded.runtime.getAllTools = () => [{ name: "mcp__create_issue", annotations: { readOnlyHint: true } }];
  const [guard] = loaded.extensions[0].handlers.get("tool_call");
  let prompts = 0;
  const ctx = { cwd, mode: "tui", hasUI: true, ui: { async confirm(_title, body) { prompts++; assert.match(body, /Approve this call only/); return true; } } };
  const input = { command: "mise exec -- pnpm test", timeout: 999 };
  assert.equal(await guard({ toolName: "bash", input }, ctx), undefined);
  assert.equal(input.timeout, 300);
  assert.equal(prompts, 0);
  assert.equal(await guard({ toolName: "bash", input: { command: "git -C /repo push" } }, ctx), undefined);
  assert.equal(prompts, 1);
  assert.equal((await guard({ toolName: "mcp__create_issue", input: {} }, { ...ctx, mode: "json" })).block, true);
  assert.equal(prompts, 1);
  assert.equal((await guard({ toolName: "write", input: { path: ".env", content: "x" } }, ctx)).block, true);
  assert.equal(prompts, 1);
  assert.equal((await guard({ toolName: "bash", input: { command: "rm file" } }, { ...ctx, ui: { confirm: async () => false } })).block, true);
});

test("implementer child blocks flagged bash without any confirmation and protects native secret paths", async () => {
  const old = process.env.PI_WORKFLOW_ROLE;
  process.env.PI_WORKFLOW_ROLE = "implementer";
  try {
    const loaded = await loadExtensions([fileURLToPath(new URL("../child-policy.ts", import.meta.url))], cwd);
    assert.deepEqual(loaded.errors, []);
    const [guard] = loaded.extensions[0].handlers.get("tool_call");
    const ctx = { cwd, ui: { confirm() { assert.fail("Child must never prompt"); } } };
    for (const command of ["git commit -m hi", "curl --json '{}' https://example.test", "pnpm publish"]) {
      const result = await guard({ toolName: "bash", input: { command } }, ctx);
      assert.equal(result.block, true);
      assert.match(result.reason, /Return this blocker to the parent/);
    }
    const input = { command: "uv run pytest" };
    assert.equal(await guard({ toolName: "bash", input }, ctx), undefined);
    assert.equal(input.timeout, 300);
    assert.equal((await guard({ toolName: "read", input: { path: "auth.json" } }, ctx)).block, true);
    assert.equal(await guard({ toolName: "write", input: { path: "src/main.ts" } }, ctx), undefined);
  } finally {
    if (old === undefined) delete process.env.PI_WORKFLOW_ROLE;
    else process.env.PI_WORKFLOW_ROLE = old;
  }
});
