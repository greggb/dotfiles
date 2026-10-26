import { runProcess, type ProcessOptions, type ProcessResult } from "./process.ts";
import { resolve } from "node:path";
import { isPrivatePiPath, isSecretPath } from "./policy.ts";

export interface GitInspection {
  operation: "status" | "diff" | "log" | "show";
  revision?: string;
  path?: string;
  staged?: boolean;
}

export function gitArgs(input: GitInspection): string[] {
  if (input.revision && !/^[A-Za-z0-9][A-Za-z0-9._/~^\-]*$/.test(input.revision)) throw new Error("Invalid revision");
  if (input.path?.includes("\0")) throw new Error("Invalid path");
  if (input.operation === "diff" || input.operation === "show") validatePatchPath(input.path);
  const base = ["--no-pager", "--no-optional-locks", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
  const paths = input.path ? ["--", input.path] : ["--"];
  switch (input.operation) {
    case "status": return [...base, "status", "--short", "--untracked-files=no", ...paths];
    case "diff": return [...base, "diff", "--no-renames", "--no-ext-diff", "--no-textconv", "--ignore-submodules", ...(input.staged ? ["--cached"] : []), ...(input.revision ? [input.revision] : []), ...paths];
    case "log": return [...base, "log", "-20", "--format=short", "--no-show-signature", ...(input.revision ? [input.revision] : []), ...paths];
    case "show": return [...base, "show", "--no-renames", "--no-ext-diff", "--no-textconv", "--ignore-submodules", "--no-show-signature", input.revision ?? "HEAD", ...paths];
  }
}

export async function inspectGit(input: GitInspection, cwd: string, signal?: AbortSignal, run: (options: ProcessOptions) => Promise<ProcessResult> = runProcess) {
  const args = gitArgs(input);
  const execute = (args: string[], directory = cwd) => run({
    command: "/usr/bin/git", args, cwd: directory, signal, group: false, timeoutMs: 15_000,
    env: { PATH: "/usr/bin:/bin", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" },
  });
  if (input.operation === "diff" || input.operation === "show") {
    const root = await execute(["--no-optional-locks", "rev-parse", "--show-toplevel"]);
    if (root.error || root.exitCode !== 0) return { ...root, isError: true };
    cwd = root.stdout.trim();
    if (input.path && isPrivatePiPath(resolve(cwd, input.path))) {
      return { ...root, stdout: "", error: "Private Pi locations are excluded from patches", isError: true };
    }
    const separator = args.indexOf("--");
    const discovery = [...args.slice(0, separator), "--name-only", "-z", ...(input.operation === "show" ? ["--format="] : []), ...args.slice(separator)];
    const names = await execute(discovery, cwd);
    if (names.error || names.exitCode !== 0) return { ...names, isError: true };
    const files = names.stdout.split("\0").map((name) => name.replace(/^\n+/, "")).filter(Boolean);
    if (names.stdout.includes("[truncated]") || files.some((file) => isSecretPath(file) || file !== input.path)) {
      return { ...names, stdout: "", error: "Patch discovery was truncated or included a secret/non-exact path; refusing patch", isError: true };
    }
    if (files.length === 0) return { ...names, stdout: "No changes for that exact file path", isError: false };
  }
  const result = await execute(args, cwd);
  return { ...result, isError: Boolean(result.error) || result.exitCode !== 0 };
}

function validatePatchPath(path: string | undefined): void {
  if (!path || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..") || /[*?\[\]{}:\\\n\r]/.test(path)) {
    throw new Error("Diff/show require an exact repository-root-relative file path, no directories, traversal, globs or pathspec magic");
  }
  if (isSecretPath(path)) throw new Error("Secret paths are excluded from patches");
}
