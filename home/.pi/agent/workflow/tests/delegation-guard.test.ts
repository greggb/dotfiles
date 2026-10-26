import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createDelegationGuard, isReadOnlyGit, trimOutput } from "../delegation-guard.ts";

const installed = join(process.env.PI_RUNTIME_DIR ?? join(homedir(), ".local/share/pi-runtime"), "node_modules/@earendil-works/pi-coding-agent/dist/");
const { loadExtensions } = await import(installed + "core/extensions/loader.js");
const cwd = fileURLToPath(new URL("..", import.meta.url));
const ctx = { cwd, mode: "print", hasUI: false, ui: { confirm() { assert.fail("Must not prompt"); } } };

for (const command of [
  "git status", "git status --short", "git -C /repo diff --stat -- src/a.ts", "git --no-pager log --oneline -5",
  "git diff --name-only | head -50", "git show HEAD:README.md | wc -l", "git status && git diff --stat",
  "git log -1 --format=%H 2>/dev/null", "  git status  ", "git -C '/some repo' --no-pager -C \"sub dir\" diff",
  "git diff -- 'a|b' \"c;d\"", "git status||git diff;git log|tail -5|sort|uniq|cut -c1|grep x|cat",
  "git status 2>&1", "git status >/dev/null", "git status 2>/dev/null|head", "git diff --no-ext-diff --no-textconv",
  "git status\ngit diff", "git status\n", "git status\r", "git status >>/dev/null", "git status 2>&2",
  "git status ;", "git -C $REPO status", "git status # comment", "(git status)", "git diff path\\ name", "git diff '>'",
  'git status "; rm x"', "git diff -- 'a > b.txt'", "git log --oneline | sort | uniq -c | head",
  "git diff --stat | tail -5", "git status --short && git diff --name-only", "git log -1 2>&1",
  "git status >&2", "git status 0<&3", "git status </dev/null", "git log | sort -r | uniq -f 1 in.txt",
  "git log | uniq --skip-fields 1 --skip-chars=2 in.txt", "git log | uniq -cs 1 in.txt",
  "git log | uniq -- -input.txt", "git log | sort -- -o", "git log | tail -- -f", "git log |& head",
  ...["blame", "rev-parse", "ls-files", "ls-tree", "describe", "shortlog", "merge-base", "name-rev", "diff-tree", "cat-file", "grep"].map((verb) => `git ${verb}`),
  "git branch", "git tag -l", "git stash list", "git config --list", "git show-ref", "git diff --output-indicator-new=+",
  "if git diff --quiet; then git status; fi", "git branch -a", "git remote -v", "git remote show origin",
  "git reflog show", "git config --get user.name", "git ls-remote origin", "git stash show -p",
]) {
  test(`isReadOnlyGit allows ${JSON.stringify(command)}`, () => assert.equal(isReadOnlyGit(command), true));
}

for (const command of [
  "git commit -m x", "git checkout main", "git branch new", "git -c core.pager=less log", "git diff --output=/tmp/x",
  "git diff > out.txt", "git log | tee x", "git status; rm -rf x", "echo $(git status)", "`git status`",
  "FOO=1 git status", "git status &", "ls", "cat x | git status",
  "", "git", "head x", "git --exec-path=/tmp status", "git --git-dir /repo status", "git --work-tree=/repo status",
  "git --config-env=key=ENV status", "git --unknown status", "git -C", "git -C --no-pager status", "git diff --output /tmp/x",
  "git diff --ext-diff", "git log --textconv", "git log --exec=x", "git diff '--output=/tmp/x'", "git diff --out\"put\"=x",
  "git status >/dev/null.txt", "git status < file", "git status &&",
  "git status ||", "git status ;; git diff", "git status & git diff", "git status && cat x",
  "git status | FOO=1 head", "git diff 'unterminated",
  'git diff "unterminated',
  "git status; grep -R TODO src", "grep -r x /; git status", "git status && tail -f log", "git log | tail -f",
  "git status | sort -o tracked.txt", "git status | uniq in.txt out.txt", "git grep -O touch needle",
  "git grep --open-files-in-pager=touch needle", "git status 2>&1 > out.txt", 'git log --oneline "$(rm x)"',
  "git status | sort --output=tracked.txt", "git status | sort -rotracked.txt", "git log | tail -F",
  "git log | tail --follow=name", "git log | tail -5f", "git log | uniq -f 1 in.txt out.txt",
  "git log | uniq -- in.txt -out.txt", "git status | git diff", "git status >&out.txt",
  "git status 2>&$FD", "git status; X=1", "git status | cat &", "git status | head >out.txt",
  'git status `rm x`', "git status ${X:-$(rm x)}", "git grep -Otouch needle", "git grep --open-files-in-pager needle",
  "git stash", "git config user.name x", "git tag v1", "git branch -D x", "git stash pop", "git reflog expire --all",
  "if git diff --quiet; then rm x; fi", "git branch --list --delete main", "git remote add o url",
]) {
  test(`isReadOnlyGit counts ${JSON.stringify(command)}`, () => assert.equal(isReadOnlyGit(command), false));
}

test("defaults allow calls 1-5 and nudge from 6 without blocking across 50 calls", () => {
  const guard = createDelegationGuard();
  for (let count = 1; count <= 50; count++) {
    assert.deepEqual(guard.onToolCall("bash", false), { action: count < 6 ? "allow" : "nudge", count });
  }
  assert.equal(guard.reminder(6), "[delegation guard] 6 consecutive main-agent bash calls. Consider handing broad discovery to explore or noisy test/log output to diagnose, or using targeted reads, when that keeps large output out of the main context.");
});

test("bash calls 1-2 allow, 3-8 nudge, 9+ stay blocked", () => {
  const guard = createDelegationGuard({ nudgeAt: 3, blockAt: 8 });
  for (let count = 1; count <= 10; count++) {
    const result = guard.onToolCall("bash", false);
    assert.equal(result.count, count);
    assert.equal(result.action, count <= 2 ? "allow" : count <= 8 ? "nudge" : "block");
    if (count > 8) assert.equal(result.reason, `Delegation guard: ${count} consecutive bash calls in the main agent since the last subagent call or user message. Delegate discovery to explore, command-running diagnosis (tests, logs, reproductions) to diagnose, and edits/test iteration to implementer via subagent. Read-only git commands are not counted. The counter resets after a subagent call or the next user message.`);
    else assert.equal(result.reason, undefined);
  }
  assert.equal(guard.reminder(3), "[delegation guard] 3 consecutive main-agent bash calls. Consider handing broad discovery to explore or noisy test/log output to diagnose, or using targeted reads, when that keeps large output out of the main context. Blocked after 8.");
});

test("subagent and reset clear the counter; other tools do not count or reset", () => {
  const guard = createDelegationGuard();
  guard.onToolCall("bash", false);
  for (const tool of ["read", "edit", "write", "grep", "find", "ls", "custom"]) {
    assert.deepEqual(guard.onToolCall(tool, false), { action: "allow", count: 1 });
  }
  assert.deepEqual(guard.onToolCall("bash", false), { action: "allow", count: 2 });
  assert.deepEqual(guard.onToolCall("subagent", false), { action: "allow", count: 0 });
  assert.deepEqual(guard.onToolCall("bash", false), { action: "allow", count: 1 });
  guard.reset();
  assert.deepEqual(guard.onToolCall("bash", false), { action: "allow", count: 1 });
});

test("nested bash, subagent and other calls are ignored, even when blocked", () => {
  const guard = createDelegationGuard({ nudgeAt: 3, blockAt: 8 });
  for (let count = 1; count <= 9; count++) guard.onToolCall("bash", false);
  for (const tool of ["bash", "subagent", "read"]) {
    assert.deepEqual(guard.onToolCall(tool, true), { action: "allow", count: 9 });
  }
  assert.equal(guard.onToolCall("bash", false).action, "block");
  guard.onToolCall("subagent", false);
  assert.deepEqual(guard.onToolCall("bash", true), { action: "allow", count: 0 });
  assert.deepEqual(guard.onToolCall("bash", false), { action: "allow", count: 1 });
});

test("custom thresholds also control the reminder", () => {
  const guard = createDelegationGuard({ nudgeAt: 1, blockAt: 2 });
  assert.deepEqual(guard.onToolCall("bash", false), { action: "nudge", count: 1 });
  assert.equal(guard.onToolCall("bash", false).action, "nudge");
  assert.equal(guard.onToolCall("bash", false).action, "block");
  assert.match(guard.reminder(2), /Blocked after 2\.$/);
});

test("read-only git does not count or reset, including after blocking; malformed inputs still count", () => {
  const guard = createDelegationGuard({ nudgeAt: 3, blockAt: 8 });
  assert.deepEqual(guard.onToolCall("bash", false, { command: "ls" }), { action: "allow", count: 1 });
  assert.deepEqual(guard.onToolCall("bash", false, { command: "git status" }), { action: "allow", count: 1 });
  assert.deepEqual(guard.onToolCall("bash", false, {}), { action: "allow", count: 2 });
  assert.deepEqual(guard.onToolCall("bash", false, { command: 123 }), { action: "nudge", count: 3 });
  for (let count = 4; count <= 9; count++) guard.onToolCall("bash", false);
  assert.deepEqual(guard.onToolCall("bash", false, { command: "git status" }), { action: "allow", count: 9 });
  const piggyback = guard.onToolCall("bash", false, { command: "git status; grep -R TODO src" });
  assert.equal(piggyback.action, "block");
  assert.equal(piggyback.count, 10);
  assert.deepEqual(guard.onToolCall("bash", false, { command: "git status" }), { action: "allow", count: 10 });
  assert.equal(guard.onToolCall("bash", false, { command: "git commit -m x" }).count, 11);
});

test("trimOutput leaves text below or exactly at the byte limit unchanged", () => {
  for (const text of ["", "small\noutput", "x".repeat(12 * 1024), "é".repeat(6 * 1024)]) {
    assert.deepEqual(trimOutput(text), { text, trimmed: false });
  }
});

test("trimOutput retains the default head and tail and counts omitted bytes", () => {
  const text = "h".repeat(2 * 1024) + "m".repeat(6 * 1024) + "t".repeat(8 * 1024);
  assert.deepEqual(trimOutput(text), {
    head: "h".repeat(2 * 1024), tail: "t".repeat(8 * 1024), trimmed: true, omittedBytes: 6144,
  });
});

test("trimOutput prefers complete lines within head and tail budgets", () => {
  const text = "aaaa\nbbbb\ncccc\ndddd\neeee\nffff\n";
  for (const budget of [8, 5]) {
    assert.deepEqual(trimOutput(text, { limitBytes: 20, headBytes: budget, tailBytes: budget }), {
      head: "aaaa\n", tail: "ffff\n", trimmed: true, omittedBytes: 20,
    });
  }
});

test("trimOutput keeps byte budgets when line snapping would discard most of a part", () => {
  for (const text of ["h\n" + "x".repeat(20 * 1024) + "\nt", "h\n" + "😀".repeat(6000) + "\n"]) {
    const result = trimOutput(text);
    assert.ok(result.trimmed);
    assert.ok(Buffer.byteLength(result.head) >= 2 * 1024 - 3);
    assert.ok(Buffer.byteLength(result.tail) >= 8 * 1024 - 3);
    assert.ok(text.startsWith(result.head));
    assert.ok(text.endsWith(result.tail));
    assert.doesNotMatch(result.head + result.tail, /\ufffd/);
    assert.equal(result.omittedBytes, Buffer.byteLength(text) - Buffer.byteLength(result.head + result.tail));
  }
});

test("trimOutput snaps at exactly half the byte budget, but not below it", () => {
  for (const length of [3, 4]) {
    const text = "h".repeat(length - 1) + "\n" + "x".repeat(30) + "\n" + "t".repeat(length);
    const result = trimOutput(text, { limitBytes: 20, headBytes: 8, tailBytes: 8 });
    assert.ok(result.trimmed);
    assert.equal(Buffer.byteLength(result.head), length === 4 ? 4 : 8);
    assert.equal(Buffer.byteLength(result.tail), length === 4 ? 4 : 8);
  }
});

test("trimOutput never splits UTF-8 characters and omittedBytes is exact", () => {
  for (const text of ["😀".repeat(100), "é漢😀".repeat(100), "é\n漢😀".repeat(100)]) {
    const result = trimOutput(text, { limitBytes: 40, headBytes: 13, tailBytes: 19 });
    assert.ok(result.trimmed);
    const { head, tail } = result;
    assert.doesNotMatch(head + tail, /\ufffd/);
    assert.ok(text.startsWith(head));
    assert.ok(text.endsWith(tail));
    assert.ok(Buffer.byteLength(head) <= 13);
    assert.ok(Buffer.byteLength(tail) <= 19);
    assert.equal(result.omittedBytes, Buffer.byteLength(text) - Buffer.byteLength(head) - Buffer.byteLength(tail));
  }
});

test("trimOutput clamps overlapping budgets and permits an empty head or tail", () => {
  for (const options of [{ limitBytes: 10, headBytes: 20, tailBytes: 20 }, { limitBytes: 10, headBytes: 0, tailBytes: 5 }, { limitBytes: 10, headBytes: 5, tailBytes: 0 }]) {
    const result = trimOutput("x".repeat(30), options);
    assert.ok(result.trimmed);
    const retained = result.head + result.tail;
    assert.ok(Buffer.byteLength(retained) <= 10);
    assert.equal(result.omittedBytes, 30 - Buffer.byteLength(retained));
  }
});

test("loaded parent never delegation-blocks a long streak and still classifies dangerous commands", async () => {
  const { call, result, runtime } = await loadParent();
  let classifications = 0;
  runtime.getAllTools = () => { classifications++; return []; };
  for (let count = 1; count <= 25; count++) {
    const allowed = bashCall(`bash-${count}`);
    allowed.input.timeout = 999;
    assert.equal(await call(allowed, ctx), undefined);
    assert.equal(allowed.input.timeout, 300);
    const event = bashResult(allowed.toolCallId, "done");
    const output = await result(event, ctx);
    if (count < 6) assert.equal(output, undefined);
    else assert.deepEqual(output.content, [...event.content, { type: "text", text: createDelegationGuard().reminder(count) }]);
  }
  assert.equal(classifications, 25);
  const dangerous = bashCall("dangerous", "git push");
  dangerous.input.timeout = 999;
  const blocked = await call(dangerous, ctx);
  assert.equal(blocked.block, true);
  assert.equal(blocked.reason, "Git push changes repository state. Requires interactive parent confirmation; no side effects were authorized.");
  assert.equal(dangerous.input.timeout, 300);
  assert.equal(classifications, 26);
  assert.equal(await call(bashCall("after-dangerous"), ctx), undefined);
  const output = await result(bashResult("after-dangerous", "done"), ctx);
  assert.deepEqual(output.content.at(-1), { type: "text", text: createDelegationGuard().reminder(27) });
});

test("loaded parent resets reminders on subagent, input and session_start", async () => {
  const { call, result, input, session } = await loadParent();
  for (const reset of [
    () => call({ type: "tool_call", toolName: "subagent", toolCallId: "delegate", input: {} }, ctx),
    () => input({ type: "input", text: "next task", source: "interactive" }, ctx),
    () => session({ type: "session_start" }, ctx),
  ]) {
    for (let count = 1; count <= 7; count++) await call(bashCall(`before-reset-${count}`), ctx);
    assert.equal(await reset(), undefined);
    for (let count = 1; count <= 6; count++) {
      const id = `after-reset-${count}`;
      assert.equal(await call(bashCall(id), ctx), undefined);
      const output = await result(bashResult(id, "done"), ctx);
      if (count < 6) assert.equal(output, undefined);
      else assert.deepEqual(output.content.at(-1), { type: "text", text: createDelegationGuard().reminder(6) });
    }
  }
});

test("loaded parent never nudges or blocks twenty read-only git calls, but still classifies and caps timeouts", async () => {
  const { call, result, runtime } = await loadParent();
  let classifications = 0;
  runtime.getAllTools = () => { classifications++; return []; };
  for (let count = 1; count <= 20; count++) {
    const event = bashCall(`git-${count}`, "git status");
    event.input.timeout = 999;
    assert.equal(await call(event, ctx), undefined);
    assert.equal(event.input.timeout, 300);
    assert.equal(await result(bashResult(event.toolCallId, "clean"), ctx), undefined);
  }
  assert.equal(classifications, 20);
});

test("loaded parent read-only git between counted calls neither resets nor increments", async () => {
  const { call, result } = await loadParent();
  for (let count = 1; count <= 20; count++) {
    const gitId = `git-${count}`;
    assert.equal(await call(bashCall(gitId, "git status"), ctx), undefined);
    assert.equal(await result(bashResult(gitId, "clean"), ctx), undefined);
    const id = `bash-${count}`;
    assert.equal(await call(bashCall(id), ctx), undefined);
    const output = await result(bashResult(id, "done"), ctx);
    if (count < 6) assert.equal(output, undefined);
    else assert.deepEqual(output.content.at(-1), { type: "text", text: createDelegationGuard().reminder(count) });
  }
  assert.equal(await call(bashCall("piggyback", "git status; grep -R TODO src"), ctx), undefined);
  const piggyback = await result(bashResult("piggyback", "done"), ctx);
  assert.deepEqual(piggyback.content.at(-1), { type: "text", text: createDelegationGuard().reminder(21) });
  assert.equal(await call(bashCall("git-after-streak", "git status"), ctx), undefined);
  assert.equal(await result(bashResult("git-after-streak", "clean"), ctx), undefined);
});

test("loaded parent returns ordinary small results unchanged and attributes nudges by toolCallId", async () => {
  const { call, result, input } = await loadParent();
  for (let count = 1; count <= 6; count++) assert.equal(await call(bashCall(`bash-${count}`), ctx), undefined);
  const sixth = bashResult("bash-6", "sixth");
  const nudged = await result(sixth, ctx);
  assert.deepEqual(nudged.content, [...sixth.content, { type: "text", text: createDelegationGuard().reminder(6) }]);
  assert.equal(nudged.details, sixth.details);
  assert.equal(nudged.isError, false);
  for (let count = 1; count <= 5; count++) assert.equal(await result(bashResult(`bash-${count}`, "done"), ctx), undefined);
  assert.equal(await result(sixth, ctx), undefined);
  await call(bashCall("stale"), ctx);
  await input({ type: "input", text: "reset", source: "interactive" }, ctx);
  assert.equal(await result(bashResult("stale", "done"), ctx), undefined);
});

test("loaded parent ignores nested calls and results, and non-bash results", async () => {
  const { call, result } = await loadParent();
  for (let count = 1; count <= 8; count++) await call(bashCall(`bash-${count}`), ctx);
  assert.equal(await call({ ...bashCall("parent/1"), parentToolCallId: "parent" }, ctx), undefined);
  assert.equal(await call({ type: "tool_call", toolName: "subagent", toolCallId: "parent/2", parentToolCallId: "parent", input: {} }, ctx), undefined);
  const large = bashResult("parent/1", "x".repeat(20 * 1024));
  assert.equal(await result({ ...large, parentToolCallId: "parent" }, ctx), undefined);
  assert.equal(await result({ ...large, toolName: "read" }, ctx), undefined);
  assert.equal(await call(bashCall("ninth"), ctx), undefined);
  const output = await result(bashResult("ninth", "done"), ctx);
  assert.deepEqual(output.content.at(-1), { type: "text", text: createDelegationGuard().reminder(9) });
});

test("loaded parent trims joined text, preserves metadata and images, saves private full output and appends the nudge", async (t) => {
  const { call, result, shutdown } = await loadParent();
  t.after(() => shutdown({ type: "session_shutdown" }, ctx));
  for (let count = 1; count <= 6; count++) await call(bashCall(`bash-${count}`), ctx);
  const first = "é漢😀 output\n".repeat(1000);
  const second = "tail output\n".repeat(1000);
  const full = `${first}\n${second}`;
  const image = { type: "image", data: "image-data", mimeType: "image/png" };
  const event = { ...bashResult("bash-6", first), content: [{ type: "text", text: first }, image, { type: "text", text: second }], isError: true, structuredContent: { diagnostic: 1 } };
  const modified = await result(event, ctx);
  const text = modified.content[0].text;
  const match = text.match(/Full output: (.+)\. Read ranges with read offset\/limit, or have a subagent analyze it\./);
  assert.ok(match);
  const path = match[1];
  try {
    assert.equal(await readFile(path, "utf8"), full);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(dirname(path))).mode & 0o777, 0o700);
    assert.ok(dirname(path).startsWith(join(tmpdir(), "pi-parent-output-")));
    const trimmed = trimOutput(full);
    assert.ok(trimmed.trimmed);
    assert.equal(text, `${trimmed.head}\n[... ${trimmed.omittedBytes} bytes omitted. Full output: ${path}. Read ranges with read offset/limit, or have a subagent analyze it.]\n${trimmed.tail}`);
    assert.ok(Buffer.byteLength(text) < 12 * 1024);
    assert.equal(modified.content[1], image);
    assert.deepEqual(modified.content[2], { type: "text", text: createDelegationGuard().reminder(6) });
    assert.equal(modified.details, event.details);
    assert.equal(modified.structuredContent, event.structuredContent);
    assert.equal(modified.isError, true);
    assert.equal(event.content[0].text, first);
  } finally {
    await rm(dirname(path), { recursive: true, force: true });
  }
});

test("loaded parent preserves marker literals in the output", async (t) => {
  const { result, shutdown } = await loadParent();
  t.after(() => shutdown({ type: "session_shutdown" }, ctx));
  const literal = "prefix\n[... 6144 bytes omitted.]\n";
  const head = literal + "h".repeat(2048 - Buffer.byteLength(literal) - 1) + "\n";
  const tail = "t".repeat(8192);
  const full = head + "m".repeat(6144) + tail;
  const modified = await result(bashResult("marker", full), ctx);
  const path = savedPath(modified.content[0].text);
  assert.equal(modified.content[0].text, `${head}\n[... 6144 bytes omitted. Full output: ${path}. Read ranges with read offset/limit, or have a subagent analyze it.]\n${tail}`);
});

test("loaded parent keeps original content on save creation failure, with a reminder when applicable, and recovers", async (t) => {
  const { call, result, shutdown } = await loadParent();
  t.after(() => shutdown({ type: "session_shutdown" }, ctx));
  const old = process.env.TMPDIR;
  const full = "x".repeat(20 * 1024);
  try {
    process.env.TMPDIR = join(cwd, "tests", "missing-temp-parent", "missing");
    assert.equal(await result(bashResult("save-fails", full), ctx), undefined);
    for (let count = 1; count <= 6; count++) await call(bashCall(`bash-${count}`), ctx);
    const event = bashResult("bash-6", full);
    const modified = await result(event, ctx);
    assert.deepEqual(modified.content, [...event.content, { type: "text", text: createDelegationGuard().reminder(6) }]);
  } finally {
    if (old === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = old;
  }
  const recovered = await result(bashResult("recovered", full), ctx);
  assert.equal(await readFile(savedPath(recovered.content[0].text), "utf8"), full);
});

test("loaded parent keeps original content when writing a full output file fails", async (t) => {
  const { call, result, shutdown } = await loadParent();
  t.after(() => shutdown({ type: "session_shutdown" }, ctx));
  const full = "x".repeat(20 * 1024);
  const first = await result(bashResult("first", full), ctx);
  const directory = dirname(savedPath(first.content[0].text));
  await mkdir(join(directory, "output-2.txt"));
  const event = bashResult("write-fails", full);
  assert.equal(await result(event, ctx), undefined);
  await mkdir(join(directory, "output-3.txt"));
  for (let count = 1; count <= 6; count++) await call(bashCall(`bash-${count}`), ctx);
  const nudged = await result({ ...event, toolCallId: "bash-6" }, ctx);
  assert.deepEqual(nudged.content, [...event.content, { type: "text", text: createDelegationGuard().reminder(6) }]);
});

test("loaded parent lazily shares one private output directory, recreates it if removed, and cleans up on shutdown", async (t) => {
  const before = (await readdir(tmpdir())).filter((name) => name.startsWith("pi-parent-output-"));
  const { result, shutdown } = await loadParent();
  t.after(() => shutdown({ type: "session_shutdown" }, ctx));
  assert.deepEqual((await readdir(tmpdir())).filter((name) => name.startsWith("pi-parent-output-")), before);
  const full = "x".repeat(20 * 1024);
  const outputs = await Promise.all(["first", "second"].map((id) => result(bashResult(id, full + id), ctx)));
  const paths = outputs.map((output) => savedPath(output.content[0].text));
  const directory = dirname(paths[0]);
  assert.equal(dirname(paths[1]), directory);
  assert.notEqual(paths[0], paths[1]);
  for (let index = 0; index < paths.length; index++) {
    assert.equal(await readFile(paths[index], "utf8"), full + ["first", "second"][index]);
    assert.equal((await stat(paths[index])).mode & 0o777, 0o600);
  }
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  await rm(directory, { recursive: true });
  const recovered = await Promise.all(["after-removal-1", "after-removal-2"].map((id) => result(bashResult(id, full), ctx)));
  const recoveredPaths = recovered.map((output) => savedPath(output.content[0].text));
  const [recoveredPath] = recoveredPaths;
  assert.notEqual(dirname(recoveredPath), directory);
  assert.equal(dirname(recoveredPaths[1]), dirname(recoveredPath));
  assert.notEqual(recoveredPaths[1], recoveredPath);
  assert.equal(await readFile(recoveredPath, "utf8"), full);
  await shutdown({ type: "session_shutdown" }, ctx);
  await assert.rejects(stat(dirname(recoveredPath)), { code: "ENOENT" });
  await shutdown({ type: "session_shutdown" }, ctx);
});

async function loadParent() {
  const loaded = await loadExtensions([fileURLToPath(new URL("../parent-policy.ts", import.meta.url))], cwd);
  assert.deepEqual(loaded.errors, []);
  loaded.runtime.getAllTools = () => [];
  const handlers = loaded.extensions[0].handlers;
  const [call] = handlers.get("tool_call");
  const [result] = handlers.get("tool_result");
  const [input] = handlers.get("input");
  const [session] = handlers.get("session_start");
  const [shutdown] = handlers.get("session_shutdown");
  return { call, result, input, session, shutdown, runtime: loaded.runtime };
}

function savedPath(text: string) {
  const match = text.match(/Full output: (.+)\. Read ranges with read offset\/limit, or have a subagent analyze it\./);
  assert.ok(match);
  return match[1];
}

function bashCall(toolCallId: string, command = "ls") {
  return { type: "tool_call", toolName: "bash", toolCallId, input: { command, timeout: 300 } };
}

function bashResult(toolCallId: string, text: string) {
  return { type: "tool_result", toolName: "bash", toolCallId, input: { command: "ls" }, content: [{ type: "text", text }], isError: false, details: { exitCode: 0 } };
}
