import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import { createDelegationGuard, trimOutput } from "./delegation-guard.ts";
import { capBashTimeout, classify } from "./policy.ts";
import { bounded } from "./process.ts";

export default function parentPolicy(pi: ExtensionAPI) {
  const guard = createDelegationGuard();
  const outputs = createOutputStore();
  const nudges = new Map<string, number>();
  const reset = () => { guard.reset(); nudges.clear(); };
  pi.on("input", reset);
  pi.on("session_start", reset);
  pi.on("session_shutdown", outputs.cleanup);
  pi.on("tool_call", async (event, ctx) => {
    const delegation = guard.onToolCall(event.toolName, event.parentToolCallId !== undefined, event.input);
    if (delegation.action === "block") return { block: true, reason: delegation.reason };
    if (delegation.action === "nudge") nudges.set(event.toolCallId, delegation.count);
    if (event.toolName === "bash") capBashTimeout(event.input);
    const hints = pi.getAllTools().find((tool) => tool.name === event.toolName)?.annotations;
    const decision = classify({ name: event.toolName, input: event.input, cwd: ctx.cwd, hints });
    if (decision.action === "allow") return undefined;
    if (decision.action === "deny") return { block: true, reason: decision.reason };
    if (ctx.mode !== "tui" || !ctx.hasUI) return { block: true, reason: `${decision.reason}. Requires interactive parent confirmation; no side effects were authorized.` };
    const approved = await ctx.ui.confirm("Approve side effect?", `${decision.reason}\nTool: ${event.toolName}\n${bounded(JSON.stringify(event.input), 4096)}\nApprove this call only?`, { signal: ctx.signal });
    return approved ? undefined : { block: true, reason: `${decision.reason}. User did not approve this call.` };
  });
  pi.on("tool_result", async (event): Promise<ToolResultEventResult | undefined> => {
    if (event.toolName !== "bash" || event.parentToolCallId !== undefined) return undefined;
    const count = nudges.get(event.toolCallId);
    nudges.delete(event.toolCallId);
    const text = event.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    const trimmed = trimOutput(text);
    if (!trimmed.trimmed && count === undefined) return undefined;
    let content = event.content;
    if (trimmed.trimmed) {
      const saved = await outputs.save(text);
      if (saved !== undefined) {
        const notice = `\n[... ${trimmed.omittedBytes} bytes omitted. Full output: ${saved}. Read ranges with read offset/limit, or have a subagent analyze it.]\n`;
        content = [{ type: "text", text: trimmed.head + notice + trimmed.tail }, ...event.content.filter((part) => part.type !== "text")];
      } else if (count === undefined) return undefined;
    }
    if (count !== undefined) content = [...content, { type: "text", text: guard.reminder(count) }];
    return { content, details: event.details, structuredContent: event.structuredContent, isError: event.isError };
  });
}

function createOutputStore() {
  let directory: Promise<string> | undefined;
  let counter = 0;
  return {
    async save(text: string) {
      try {
        const previous = directory;
        directory = (async () => {
          if (previous) {
            try {
              const path = await previous;
              await access(path);
              return path;
            } catch {}
          }
          return mkdtemp(join(tmpdir(), "pi-parent-output-"));
        })();
        const path = join(await directory, `output-${++counter}.txt`);
        await writeFile(path, text, { mode: 0o600, flag: "wx" });
        return path;
      } catch {
        return undefined;
      }
    },
    async cleanup() {
      const pending = directory;
      directory = undefined;
      if (pending) {
        try { await rm(await pending, { recursive: true, force: true }); }
        catch {}
      }
    },
  };
}
