import { lstat, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Context = Pick<ExtensionContext, "hasUI"> & {
  ui: Pick<ExtensionContext["ui"], "notify">;
  sessionManager: Pick<ExtensionContext["sessionManager"], "getSessionId">;
};
const maxBytes = 128 * 1024;

export function createSharedInstructions({ path }: { path: string }) {
  path = resolve(path);
  const warned = new Set<string>();
  return async (event: Pick<BeforeAgentStartEvent, "systemPromptOptions">, ctx: Context): Promise<void> => {
    try {
      const target = await realpath(path);
      if (!(await lstat(target)).isFile()) throw new Error("Expected a regular file");
      const file = await open(target, "r");
      let content: string;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > maxBytes) throw new Error("Expected a regular file no larger than 128 KiB");
        content = await file.readFile("utf8");
        if (Buffer.byteLength(content) > maxBytes) throw new Error("Shared instructions exceed 128 KiB");
      } finally {
        await file.close();
      }
      const files = event.systemPromptOptions.contextFiles;
      for (const entry of files) {
        if (entry.path === path || await realpath(entry.path).catch(() => undefined) === target) return;
      }
      files.unshift({ path, content });
    } catch (error) {
      const session = ctx.sessionManager.getSessionId();
      if (ctx.hasUI && !warned.has(session)) {
        warned.add(session);
        ctx.ui.notify(`Could not load shared instructions at ${path}: ${error instanceof Error ? error.message : String(error)}`, "warning");
      }
    }
  };
}

export default function sharedInstructions(pi: ExtensionAPI) {
  pi.on("before_agent_start", createSharedInstructions({ path: join(homedir(), ".agents", "AGENTS.md") }));
}
