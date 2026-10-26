import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { bounded } from "./process.ts";
import { getRole, roles, timeoutFor } from "./roles.ts";
import { runTasks, sumUsage } from "./runner.ts";
import { formatFooter, formatLine, formatUsage, type Progress } from "./status.ts";

const agent = Type.String({ minLength: 1, maxLength: 64 });
const assignment = Type.String({ minLength: 1, maxLength: 65536 });
const directory = Type.Optional(Type.Union([Type.String({ maxLength: 4096 }), Type.Null()]));
const task = Type.Object({ agent, task: assignment, cwd: directory }, { additionalProperties: false });

export default function workflow(pi: ExtensionAPI) {
  pi.registerCommand("agents", {
    description: "Show workflow roles and their exact models",
    handler: async (_args, ctx) => {
      ctx.ui.notify(roles.map((role) => `${role.name} (${role.label}): ${role.provider}/${role.model} (${role.thinking}, ${role.access === "write" ? "implementation" : role.access === "diagnose" ? "diagnose (read-only + bash)" : "read-only"})`).join("\n"), "info");
    },
  });
  pi.registerTool({
    name: "subagent", label: "Subagent", executionMode: "sequential",
    description: `Delegate using {tasks:[{agent,task,cwd?}]} to isolated workflow roles. Always supply the required tasks array: one item for a single delegation, multiple items for parallel work. cwd may be omitted or null to inherit the parent directory. No top-level agent/task/cwd fields. At most 8 tasks, 4 active. Roles: ${roles.map((role) => role.name).join(", ")}. Deadlines: implementer ${timeoutFor(getRole("implementer")) / 60000} minutes, other roles ${timeoutFor(getRole("explore")) / 60000} minutes; silent/hung children are stopped early as stalled. Errors are returned, never silently retried or switched to another model.`,
    promptSnippet: "Delegate autonomous implementation, exploration, or read-only review to isolated agents",
    promptGuidelines: [
      "Always call subagent with {tasks:[{agent,task,cwd?}]}, including for one child. Put agent/task/cwd only inside tasks items, never at the top level.",
      "Children see none of your transcript and have no MCP access. Give self-contained briefs with paths, acceptance criteria, constraints, conventions, exact verification commands and any external research they need.",
      "Parallelize independent work only; never send overlapping file edits to multiple implementers. Children cannot delegate recursively.",
      "Timeouts, stalls, auth/model errors and cancellations are real failures: never silently substitute models or claim success. Retry at most once, and only with a narrower or clarified brief (a stall may be retried once unchanged); otherwise report the blocker and ask before doing the work yourself. Failed runs include a transcript path for diagnosis.",
      "No commits, pushes, deployment or external mutations through delegation. The parent retains responsibility for scope, final verification (run final full test suites yourself) and user communication.",
    ],
    parameters: Type.Object({
      tasks: Type.Array(task, { minItems: 1, maxItems: 8 }),
    }, { additionalProperties: false }),
    async execute(id, params, signal, onUpdate, ctx) {
      const tasks = params.tasks.map((item) => ({ ...item, cwd: item.cwd ?? undefined }));
      const statuses: { agent: string; label: string; progress: Progress }[] = tasks.map((item) => ({
        agent: item.agent, label: roles.find((role) => role.name === item.agent)?.label ?? item.agent,
        progress: { phase: "queued", activity: "", elapsedMs: 0, idleMs: 0 },
      }));
      try {
        const entry = process.argv[1];
        if (!entry) throw new Error("Current Pi entry is unavailable; refusing PATH fallback");
        const results = await runTasks(tasks, {
          cwd: ctx.cwd, entry, signal,
          onProgress(index, progress) {
            const status = statuses[index];
            if (status) status.progress = progress;
            const text = bounded(statuses.map((item) => formatLine(item.agent, item.label, item.progress)).join("\n"));
            ctx.ui.setStatus(`workflow:${id}`, formatFooter(statuses));
            onUpdate?.({ content: [{ type: "text", text }], details: {} });
          },
        });
        const usage = sumUsage(results.map((result) => result.usage));
        return { content: [{ type: "text", text: results.map((result, index) =>
          `[${index + 1}] ${result.agent} ${result.model}: ${result.isError ? "FAILED" : "OK"} (exit=${result.exitCode}, signal=${result.signal}, stopReason=${result.stopReason ?? "none"})${formatUsage(result.usage)}\n${result.error ?? ""}\n${result.output}\n${result.stderr ? `stderr: ${result.stderr}` : ""}${result.transcript ? `\ntranscript: ${result.transcript}` : ""}${result.transcriptError ? `\n${result.transcriptError}` : ""}`).join("\n\n") }],
          details: { results }, isError: results.some((result) => result.isError), ...(usage ? { usage } : {}) };
      } catch (error) {
        return { content: [{ type: "text", text: bounded(String(error)) }], details: {}, isError: true };
      } finally { ctx.ui.setStatus(`workflow:${id}`, undefined); }
    },
  });
}
