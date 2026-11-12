import { lstat, readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type PruneOptions = { root: string; recurse: boolean; maxAgeMs: number; now: number; keep: Set<string> };
type PruneResult = { deleted: string[]; errors: string[] };
const dayMs = 24 * 60 * 60 * 1000;
const startupKey = Symbol.for("pi-housekeeping.prune-started");

export async function pruneOld({ root, recurse, maxAgeMs, now, keep }: PruneOptions): Promise<PruneResult> {
  const result: PruneResult = { deleted: [], errors: [] };
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    result.errors.push("Invalid prune age or timestamp");
    return result;
  }
  root = resolve(root);
  const retained = new Set([...keep].map((path) => resolve(path)));
  await visit(root, recurse);
  return result;

  async function visit(directory: string, descend: boolean): Promise<void> {
    try {
      if (!(await lstat(directory)).isDirectory()) return;
      for (const name of await readdir(directory)) {
        const path = join(directory, name);
        try {
          const stat = await lstat(path);
          // Directories are never removed: Pi creates a session's directory at startup but writes
          // the file lazily, so removing an "empty" directory could break the current session.
          if (stat.isDirectory() && descend) await visit(path, false);
          else if (stat.isFile() && name.endsWith(".jsonl") && !retained.has(path) && stat.mtimeMs < now - maxAgeMs) {
            await unlink(path);
            result.deleted.push(path);
          }
        } catch (error) {
          if (!hasCode(error, "ENOENT")) record(path, error);
        }
      }
    } catch (error) {
      if (!hasCode(error, "ENOENT")) record(directory, error);
    }
  }

  function record(path: string, error: unknown) {
    result.errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default function prune(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // Process state survives extension reloads as well as session switches.
    if (Reflect.has(process, startupKey)) return;
    Reflect.set(process, startupKey, true);
    void runPrune(ctx, 30, false);
  });
  pi.registerCommand("prune-sessions", {
    description: "Prune sessions older than N days (default 30, minimum 1)",
    handler: async (args, ctx) => {
      const days = args.trim() ? Number(args.trim()) : 30;
      if (!Number.isFinite(days) || days < 1 || !Number.isFinite(days * dayMs)) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /prune-sessions [days], days must be a number of at least 1", "warning");
        return;
      }
      await runPrune(ctx, days, true);
    },
  });
}

async function runPrune(ctx: ExtensionContext, days: number, manual: boolean): Promise<void> {
  try {
    // Only Pi's own sessions directory: a custom --session-dir could point anywhere.
    const root = join(agentDir(), "sessions");
    const current = ctx.sessionManager.getSessionFile();
    const keep = new Set(current ? [resolve(current)] : []);
    const { deleted, errors } = await pruneOld({ maxAgeMs: days * dayMs, now: Date.now(), keep, root, recurse: true });
    if (ctx.hasUI && (manual || deleted.length || errors.length)) {
      const summary = `Pruned ${deleted.length} sessions older than ${days} days`;
      ctx.ui.notify(errors.length ? `${summary}\n${errors.length} errors:\n${errors.join("\n")}` : summary, errors.length ? "warning" : "info");
    }
  } catch (error) {
    if (ctx.hasUI) ctx.ui.notify(`Prune failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
  }
}

function agentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (!configured) return join(homedir(), ".pi", "agent");
  return resolve(configured.startsWith("~/") ? join(homedir(), configured.slice(2)) : configured);
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
