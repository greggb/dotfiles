import assert from "node:assert/strict";
import { lstat, lutimes, mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pruneOld } from "../prune.ts";

const dayMs = 24 * 60 * 60 * 1000;
const now = Math.floor(Date.now() / 1000) * 1000;
const old = now - 31 * dayMs;

test("deletes only old .jsonl regular files, preserving the current session and cutoff", async (t) => {
  const root = await fixture(t);
  for (const name of ["old.jsonl", "current.jsonl", "notes.txt", "recent.jsonl", "cutoff.jsonl"]) {
    await file(root, name, name === "recent.jsonl" ? now : name === "cutoff.jsonl" ? now - 30 * dayMs : old);
  }
  await mkdir(join(root, "directory.jsonl"));
  const result = await pruneOld({ root, recurse: false, maxAgeMs: 30 * dayMs, now, keep: new Set([join(root, "current.jsonl")]) });
  assert.deepEqual(result, { deleted: [join(root, "old.jsonl")], errors: [] });
  assert.deepEqual((await readdir(root)).sort(), ["current.jsonl", "cutoff.jsonl", "directory.jsonl", "notes.txt", "recent.jsonl"]);
});

test("recurses only one level and never removes directories", async (t) => {
  const root = await fixture(t);
  for (const name of ["emptied", "retained", "nested", "already-empty"]) await mkdir(join(root, name));
  await file(join(root, "emptied"), "old.jsonl", old);
  await file(join(root, "retained"), "old.jsonl", old);
  await file(join(root, "retained"), "notes.txt", old);
  await mkdir(join(root, "nested", "deeper"));
  const deep = await file(join(root, "nested", "deeper"), "old.jsonl", old);
  const direct = await file(root, "direct.jsonl", old);
  const result = await pruneOld({ root, recurse: true, maxAgeMs: 30 * dayMs, now, keep: new Set() });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.deleted.sort(), [direct, join(root, "emptied", "old.jsonl"), join(root, "retained", "old.jsonl")].sort());
  assert.deepEqual((await readdir(root)).sort(), ["already-empty", "emptied", "nested", "retained"]);
  assert.ok((await lstat(deep)).isFile());
});

test("non-recursive pruning leaves subdirectories untouched", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "subdirectory"));
  const nested = await file(join(root, "subdirectory"), "old.jsonl", old);
  const result = await pruneOld({ root, recurse: false, maxAgeMs: 30 * dayMs, now, keep: new Set() });
  assert.deepEqual(result, { deleted: [], errors: [] });
  assert.ok((await lstat(nested)).isFile());
});

test("never follows file, directory, or root symlinks", async (t) => {
  const base = await fixture(t);
  const root = join(base, "root");
  const outside = join(base, "outside");
  await mkdir(root);
  await mkdir(outside);
  const target = await file(outside, "old.jsonl", old);
  const link = join(root, "link.jsonl");
  await symlink(target, link);
  await lutimes(link, old / 1000, old / 1000);
  await symlink(outside, join(root, "directory-link"));
  const options = { root, recurse: true, maxAgeMs: 30 * dayMs, now, keep: new Set<string>() };
  assert.deepEqual(await pruneOld(options), { deleted: [], errors: [] });
  assert.ok((await lstat(link)).isSymbolicLink());
  assert.ok((await lstat(target)).isFile());
  const rootLink = join(base, "root-link");
  await symlink(outside, rootLink);
  assert.deepEqual(await pruneOld({ ...options, root: rootLink }), { deleted: [], errors: [] });
  assert.ok((await lstat(target)).isFile());
});

test("missing roots are fine and invalid ages are reported without deleting", async (t) => {
  const root = await fixture(t);
  const options = { root: join(root, "missing"), recurse: true, maxAgeMs: 30 * dayMs, now, keep: new Set<string>() };
  assert.deepEqual(await pruneOld(options), { deleted: [], errors: [] });
  const path = await file(root, "old.jsonl", old);
  const result = await pruneOld({ ...options, root, maxAgeMs: -1 });
  assert.equal(result.errors.length, 1);
  assert.deepEqual(result.deleted, []);
  assert.ok((await lstat(path)).isFile());
});

test("collects filesystem errors without throwing", async (t) => {
  const root = await fixture(t);
  const regularFile = await file(root, "file", old);
  const result = await pruneOld({ root: join(regularFile, "child"), recurse: true, maxAgeMs: 30 * dayMs, now, keep: new Set() });
  assert.deepEqual(result.deleted, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0] ?? "", /ENOTDIR/);
  assert.ok((await lstat(regularFile)).isFile());
});

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "pi-prune-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function file(root: string, name: string, mtime: number) {
  const path = join(root, name);
  await writeFile(path, "fixture");
  await utimes(path, mtime / 1000, mtime / 1000);
  return path;
}
