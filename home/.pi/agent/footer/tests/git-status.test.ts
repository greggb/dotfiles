import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseGitStatus, readGitStatus } from "../git-status.ts";

test("porcelain parser handles divergence, staged and modified files, unmerged files and rename source names", () => {
  const output = ["# branch.oid abcdef0123456", "# branch.head feature/status", "# branch.ab +2 -1", "1 AM N... rest", "2 R. N... rest new", "? original-name", "u UU N... rest", "? new-file\nwith-newline", ""].join("\0");
  assert.deepEqual(parseGitStatus(output), { branch: "feature/status", ahead: 2, behind: 1, staged: 2, modified: 2, untracked: 1 });
});
test("detached HEAD uses a short SHA and absent repository data stays unknown", () => {
  assert.equal(parseGitStatus("# branch.oid abcdef0123456\0# branch.head (detached)\0")?.branch, "abcdef0");
  assert.equal(parseGitStatus(""), undefined);
});
test("read-only Git probe reports a real temporary repository and skips nonrepositories", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-footer-git-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await readGitStatus(root), undefined);
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  await writeFile(join(root, "tracked.txt"), "first\n");
  execFileSync("git", ["-C", root, "add", "tracked.txt"]);
  await writeFile(join(root, "tracked.txt"), "second\n");
  await writeFile(join(root, "untracked.txt"), "fixture\n");
  assert.deepEqual(await readGitStatus(root), { branch: "main", ahead: 0, behind: 0, staged: 1, modified: 1, untracked: 1 });
});
