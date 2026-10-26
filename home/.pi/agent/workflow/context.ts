import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";

const CONTEXT_LIMIT = 128 * 1024;
const candidates = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

export async function repositoryContext(cwd: string, shared = join(homedir(), ".agents", "AGENTS.md")): Promise<string> {
  const directory = await realpath(cwd);
  let current = directory;
  const ancestors: string[] = [];
  let foundRepository = false;
  while (true) {
    ancestors.unshift(current);
    if (await exists(join(current, ".git"))) { foundRepository = true; break; }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (!foundRepository) ancestors.splice(0, ancestors.length, directory);
  const sections = [`Shared user instructions (${shared}):\n${await sharedInstructions(shared)}`];
  const root = ancestors[0];
  if (!root) throw new Error("Cannot determine context root");
  for (const ancestor of ancestors) {
    for (const name of candidates) {
      const file = join(ancestor, name);
      if (!(await exists(file))) continue;
      const canonical = await realpath(file);
      const within = relative(root, canonical);
      if (within === ".." || within.startsWith(`../`) || isAbsolute(within)) {
        throw new Error(`Context escapes root ${root}: ${file}`);
      }
      sections.push(`Repository instructions (${file}):\n${await limitedRead(canonical)}`);
      break;
    }
  }
  const context = sections.join("\n\n");
  if (Buffer.byteLength(context) > CONTEXT_LIMIT) throw new Error("Repository context exceeds 128 KiB; narrow cwd/context explicitly");
  return context;
}

async function sharedInstructions(path: string): Promise<string> {
  try { return await limitedRead(await realpath(path)); }
  catch (error) {
    throw new Error(`Shared instructions unreadable at ${path} (missing file or dangling dotfiles symlink?): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function limitedRead(path: string): Promise<string> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > CONTEXT_LIMIT) throw new Error(`Context must be a regular file <=128 KiB: ${path}`);
  return readFile(path, "utf8");
}
