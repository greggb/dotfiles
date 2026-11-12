import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const launcher = "/opt/homebrew/bin/pi";
const fishFunction = fileURLToPath(new URL("../../../../../config/fish/functions/pi.fish", import.meta.url));
const settingsPath = fileURLToPath(new URL("../../settings.json", import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-homebrew-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "mise.toml"), '[env]\nPI_LAUNCHER_PROJECT_ENV = "must-not-leak"\n');
  return root;
}

function fishVersion(cwd, env = process.env) {
  return execFileSync("/opt/homebrew/bin/fish", ["--no-config", "-c", 'source "$argv[1]"; pi --version', fishFunction], { cwd, env, encoding: "utf8", timeout: 30000 }).trim();
}

test("Homebrew and fish launch the same installed Pi without evaluating project mise config", async (t) => {
  const root = await fixture(t);
  const pkg = JSON.parse(await readFile("/opt/homebrew/opt/pi-coding-agent/libexec/lib/node_modules/@earendil-works/pi-coding-agent/package.json", "utf8"));
  const version = execFileSync(launcher, ["--version"], { cwd: root, encoding: "utf8", timeout: 30000 }).trim();
  assert.equal(version, pkg.version);
  const env = { ...process.env, PATH: "/opt/homebrew/bin:/usr/bin:/bin" };
  assert.equal(fishVersion(root, env), version);
});

test("fish preserves cmux forwarding while its subprocess resolves Homebrew instead of recursing", async (t) => {
  const root = await fixture(t);
  const shim = join(root, "cmux-cli-shims/session");
  await mkdir(shim, { recursive: true });
  await writeFile(join(shim, "pi"), '#!/bin/sh\ntest -z "$PI_LAUNCHER_PROJECT_ENV" || exit 99\nprintf "cmux-forwarded\\n"\ncommand pi "$@"\n', { mode: 0o755 });
  const version = execFileSync(launcher, ["--version"], { encoding: "utf8", timeout: 30000 }).trim();
  assert.equal(fishVersion(root, { ...process.env, PATH: `${shim}:/opt/homebrew/bin:/usr/bin:/bin` }), `cmux-forwarded\n${version}`);
});

test("Pi bash resolves Homebrew without overriding mise tools and preserves model and cost defaults", async (t) => {
  const root = await fixture(t);
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "node"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  const expectedNode = execFileSync("/opt/homebrew/opt/mise/bin/mise", ["which", "node"], { env, encoding: "utf8", timeout: 30000 }).trim();
  const selected = execFileSync("bash", ["-c", `${settings.shellCommandPrefix}; command -v pi; command -v node`], { env, encoding: "utf8", timeout: 30000 }).trim().split("\n");
  assert.deepEqual(selected, [launcher, expectedNode]);
  assert.deepEqual(settings.selfUpdateCommand, ["/opt/homebrew/bin/brew", "upgrade", "pi-coding-agent"]);
  assert.equal(settings.cacheWarming, "streaming");
  assert.equal(settings.defaultModel, "gpt-6.1-sol");
  assert.equal(settings.defaultThinkingLevel, "high");
  assert.ok(settings.extensions.some((path) => path.endsWith("/essentials/mode.ts")));
  assert.ok(settings.extensions.every((path) => !path.includes("pi-runtime")));
});
